// Combat: G.combat (docs/ARCHITECTURE.md "Combat and creatures").
//
//   G.combat.register(enemy) / unregister(enemy)   enemy: { root, position, radius, height, health, maxHealth, alive,
//                                                  faction, takeHit(hit), onSign?(sign, info), onParried?(player),
//                                                  engaged?, name?, material?, hitCenter?(out) }
//   G.combat.enemies         every registered enemy (dead ones stay until unregistered; filter with alive)
//   G.combat.inCombat        true while a hostile is engaged; emits combat:start { enemies } / combat:end { victory }
//   G.combat.liveEnemies()   alive, hostile
//   G.combat.strike(enemy, amount, { knockback, stagger, point }) -> { result }   an enemy hurts the player; handles
//                            the spark, blood and sound feedback for blocked, parried and landed hits
//   G.combat.hold(enemy, { anchor, breakAt, maxTime, dps, tick, onEnd }) -> handle      a grab: pins Vesna to anchor()
//                            until she attacks (1 point per swing, breakAt needed) or dodges free; G.combat.release(handle)
//   G.combat.hitStop(seconds, enemy?)     freeze the player's animation and the enemy's clock for a moment
//   G.combat.setBoss(enemy | null)        boss bar, 'boss' music and the yield hand-over
//   G.combat.addFlammable({ position | root, radius, onIgnite }) / removeFlammable(f)   things Ember can light
//   G.combat.fx (CombatFx), G.combat.signs, G.combat.trail, G.combat.ui
// Events: combat:start, combat:end, enemy:death { enemy, kind, faction, position }, enemy:hit { enemy, hit, result },
//         enemy:strike { enemy, result }, hold:start, hold:end { enemy, reason }, boss:yield (from the boss).
// Feel: hit-stop 55 to 100 ms, camera shake by weight, a burst per material (blood mist, straw and ice chips,
// frost shards), sword trail ribbon, enemy hit flash.
import * as THREE from 'three';
import { G, ORDER } from '../../core/G.js';
import { clamp } from '../../core/util.js';
import { fx as propsFx } from '../../world/props/fx.js';
import { CombatFx } from './fx.js';
import { SwordTrail } from './trail.js';
import { Signs } from './signs.js';
import { EnemyUi } from './ui.js';
import { arcTest, centerOf, isLive, posOf, yOverlap } from './geom.js';

export const TUNE = {
  hitStop: { light: 0.055, combo3: 0.075, heavy: 0.095, kill: 0.11, parry: 0.085, hurt: 0.045 },
  shake: { light: [0.13, 0.16], combo3: [0.2, 0.2], heavy: [0.3, 0.24], kill: 0.12, boss: 0.1 },
  endDelay: 2.6, // seconds without an engaged enemy before combat:end
  reachSlack: 0.2,
  arcSlack: 0.12,
  assistArc: 0.6, // extra half angle for the locked or assisted target
  holdGrace: 0.35, // a dodge only breaks a hold after this long
};

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

class Combat {
  constructor() {
    this.enemies = [];
    this.inCombat = false;
    this.fx = new CombatFx();
    this.trail = new SwordTrail();
    this.signs = new Signs(this);
    this.ui = new EnemyUi(this);
    this.boss = null;
    this.hold_ = null;
    this._calm = 0;
    this._prevMood = null;
    this._moodHandedOver = false;
    this._pStop = 0;
    this._animPatched = null;
    this._origAnimUpdate = null;
    this._hits = 0;
    this.offs = [
      G.events.on('player:swing', (s) => this.onSwing(s)),
      G.events.on('player:hit', () => this.hitStop(TUNE.hitStop.hurt)),
      G.events.on('player:parry', () => this._onParry()),
      G.events.on('player:death', () => this._playerDied()),
      G.events.on('player:dodge', () => this._holdInput('dodge')),
      G.events.on('player:respawn', () => this._reset()),
    ];
  }

  // ---- registry ----------------------------------------------------------------------------------------
  register(e) {
    if (!e) return e;
    if (e.alive === undefined) e.alive = true;
    if (e.faction === undefined) e.faction = 'hostile';
    if (e.radius === undefined) e.radius = 0.5;
    if (e.height === undefined) e.height = 1.5;
    if (!this.enemies.includes(e)) this.enemies.push(e);
    return e;
  }

  unregister(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    if (G.player && G.player.target === e) G.player.setTarget?.(null);
    if (this.boss === e) this.setBoss(null);
  }

  liveEnemies() {
    return this.enemies.filter((e) => isLive(e) && e.faction !== 'friendly' && !e.untargetable);
  }

  addFlammable(f) { return this.signs.addFlammable(f); }
  removeFlammable(f) { this.signs.removeFlammable(f); }

  // ---- hit resolution -----------------------------------------------------------------------------------------
  onSwing(s) {
    if (G.player?.dead) return;
    const dir = _d.set(s.dir.x, 0, s.dir.z);
    const dl = dir.length() || 1;
    dir.multiplyScalar(1 / dl);
    const dx = dir.x, dz = dir.z;
    const heavy = s.kind === 'heavy';
    const combo3 = s.combo === 3;
    const hits = [];
    for (const e of this.liveEnemies()) {
      if (e.hittable === false) continue;
      const a = arcTest(s.origin.x, s.origin.z, dx, dz, e);
      const isTarget = s.target === e;
      const reach = s.reach + TUNE.reachSlack + (isTarget ? 0.35 : 0);
      const arc = s.arc * 0.5 + TUNE.arcSlack + (isTarget ? TUNE.assistArc : 0);
      if (a.surface > reach || a.ang > arc) continue;
      if (!yOverlap(s.origin.y, e, 0.55)) continue;
      hits.push({ e, a });
    }
    hits.sort((p, q) => p.a.d - q.a.d);
    let landed = 0, killed = 0;
    for (const { e, a } of hits) {
      const l = Math.hypot(a.dx, a.dz) || 1;
      const hd = new THREE.Vector3(a.dx / l, 0, a.dz / l);
      const pos = posOf(e, _p);
      const point = new THREE.Vector3(pos.x - hd.x * (e.radius ?? 0.5) * 0.8, clamp(s.origin.y, pos.y + 0.25, pos.y + Math.max(0.4, (e.height ?? 1.2) - 0.1)), pos.z - hd.z * (e.radius ?? 0.5) * 0.8);
      const hit = {
        source: 'sword', kind: s.kind, combo: s.combo, damage: s.damage, stagger: !!s.stagger, knockback: s.knockback ?? 0,
        dir: hd, origin: s.origin.clone(), point, heavy, from: G.player,
      };
      const res = e.takeHit?.(hit);
      if (!res || res.hit === false) continue;
      landed++;
      if (res.killed) killed++;
      this._feedback(e, hit, res, heavy, combo3);
      G.events.emit('enemy:hit', { enemy: e, hit, result: res });
    }
    if (landed) {
      this._hits += landed;
      const hs = killed ? TUNE.hitStop.kill : heavy ? TUNE.hitStop.heavy : combo3 ? TUNE.hitStop.combo3 : TUNE.hitStop.light;
      const first = hits.find((h) => h.e.alive !== false) || hits[0];
      this.hitStop(hs, first?.e);
      const sh = heavy ? TUNE.shake.heavy : combo3 ? TUNE.shake.combo3 : TUNE.shake.light;
      G.cameraRig?.shake?.(sh[0] + (killed ? TUNE.shake.kill : 0), sh[1]);
    }
  }

  _feedback(e, hit, res, heavy, combo3) {
    const mat = res.material || e.material || 'flesh';
    const scale = heavy ? 1.7 : combo3 ? 1.35 : 1;
    if (res.deflected) {
      // The blow glanced off armor: sparks and chips, no blood.
      propsFx.burst('sparks', hit.point, { count: 14, speed: 3 });
      this.fx.byMaterial(mat, hit.point, hit.dir, scale * 0.6);
      G.audio?.sfx?.('hit_ice', { pos: hit.point, volume: 0.9, pitch: 1.2 });
    } else {
      this.fx.byMaterial(mat, hit.point, hit.dir, scale * (res.killed ? 1.5 : 1));
      if (mat === 'ice' || mat === 'frost') propsFx.burst('sparks', hit.point, { count: 6 + 6 * (heavy ? 1 : 0), speed: 2.6 });
      const snd = mat === 'straw' ? 'hit_straw' : mat === 'ice' || mat === 'frost' ? 'hit_ice' : 'hit_flesh';
      G.audio?.sfx?.(snd, { pos: hit.point, volume: heavy ? 1 : 0.85, pitch: 0.92 + Math.random() * 0.16 });
    }
    e.flash?.(1);
    this.ui.noteHit(e);
  }

  // ---- hit-stop --------------------------------------------------------------------------------------------------
  // The player's clip freezes (almost) and the struck creature's own clock crawls.
  hitStop(sec, enemy) {
    if (enemy) enemy.hitStopT = Math.max(enemy.hitStopT || 0, sec);
    const an = G.player?.character?.anim;
    if (!an) return;
    this._pStop = Math.max(this._pStop, sec);
    if (this._animPatched !== an) {
      if (this._animPatched && this._origAnimUpdate) this._animPatched.update = this._origAnimUpdate;
      const orig = an.update;
      this._origAnimUpdate = orig;
      this._animPatched = an;
      const self = this;
      an.update = function patched(dt, ctx) { return orig.call(this, self._pStop > 0 ? dt * 0.04 : dt, ctx); };
    }
  }

  _onParry() {
    this.hitStop(TUNE.hitStop.parry);
    const P = G.player;
    if (!P) return;
    _c.set(P.position.x + Math.sin(P.yaw) * 0.7, P.position.y + 1.25, P.position.z + Math.cos(P.yaw) * 0.7);
    propsFx.burst('sparks', _c, { count: 22, speed: 3.6 });
    G.postfx?.flash?.(0xdde8ff, 0.07);
  }

  // ---- enemy attacks the player ---------------------------------------------------------------------------------------
  strike(enemy, amount, o = {}) {
    const P = G.player;
    if (!P || P.dead) return { result: 'none', dealt: 0 };
    const r = P.damage(amount, { from: enemy, knockback: o.knockback, stagger: o.stagger });
    const chest = _c.set(P.position.x, P.position.y + 1.2, P.position.z);
    const away = _d.set(P.position.x - enemy.position.x, 0, P.position.z - enemy.position.z).normalize();
    if (r.result === 'hit' || r.result === 'guardbreak') {
      this.fx.mist(chest, { color: [0.3, 0.03, 0.03], alpha: 0.4, count: 3, size: 0.25, speed: 1.2, life: 0.5, up: 0.3, dir: away });
    } else if (r.result === 'blocked') {
      propsFx.burst('sparks', chest, { count: 12, speed: 3 });
    } else if (r.result === 'parried') {
      this.hitStop(TUNE.hitStop.parry, enemy);
    }
    G.events.emit('enemy:strike', { enemy, result: r.result, amount });
    return r;
  }

  // ---- holds (grabs) ----------------------------------------------------------------------------------------------------
  hold(enemy, o = {}) {
    if (this.hold_ || !G.player || G.player.dead) return null;
    if (G.player.mounted) G.player.dismountInstant?.(); // a grab pins her to the ground: out of the saddle first
    const h = {
      enemy, anchor: o.anchor, breakAt: o.breakAt ?? 3, maxTime: o.maxTime ?? 4.5, dps: o.dps ?? 5, tick: o.tick ?? 0.8,
      onEnd: o.onEnd, onBreak: o.onBreak, t: 0, progress: 0, tickT: o.tick ?? 0.8, active: true, lethal: o.lethal ?? false,
    };
    this.hold_ = h;
    G.player.moves?.cancelAll?.();
    G.events.emit('hold:start', { enemy });
    return h;
  }

  release(h, reason = 'released') {
    if (!h || !h.active) return;
    h.active = false;
    if (this.hold_ === h) this.hold_ = null;
    const P = G.player;
    if (reason === 'broke' && P && h.enemy) {
      const dx = P.position.x - h.enemy.position.x, dz = P.position.z - h.enemy.position.z;
      const l = Math.hypot(dx, dz) || 1;
      P.loco?.move?.(dx / l * 0.9, dz / l * 0.9);
      G.cameraRig?.shake?.(0.2, 0.2);
      G.audio?.sfx?.('vesna_effort', { volume: 0.8 });
    }
    h.onEnd?.(h, reason);
    G.events.emit('hold:end', { enemy: h.enemy, reason });
  }

  _holdInput(kind) {
    const h = this.hold_;
    if (!h) return;
    if (kind === 'swing') h.progress += 1;
    else if (kind === 'dodge' && h.t > TUNE.holdGrace) h.progress += h.breakAt;
    if (h.progress >= h.breakAt) { h.onBreak?.(h); this.release(h, 'broke'); }
  }

  _updateHold(dt) {
    const h = this.hold_;
    if (!h) return;
    const P = G.player;
    if (!P || P.dead || !isLive(h.enemy) && h.enemy.alive === false) { this.release(h, 'ended'); return; }
    h.t += dt;
    const a = h.anchor ? h.anchor() : null;
    if (a) {
      P.position.set(a.x, a.y, a.z);
      P.character.root.position.copy(P.position);
      P.loco.vel.set(0, 0, 0);
      P.loco.speed = 0;
      // Face the grabber.
      const e = h.enemy.position;
      const yaw = Math.atan2(e.x - a.x, e.z - a.z);
      P.loco.yaw = yaw;
      P.character.root.rotation.y = yaw;
    }
    h.tickT -= dt;
    if (h.tickT <= 0) {
      h.tickT = h.tick;
      // Crushing damage without the stagger animation, so she can still swing at the thing holding her.
      const dmg = h.dps * h.tick;
      if (P.health - dmg <= 0.5 && !h.lethal) P.health = Math.max(1, P.health - dmg * 0.5);
      else if (P.health - dmg <= 0.5) P.damage(P.health + 5, { from: h.enemy, force: true });
      else P.health -= dmg;
      G.events.emit('player:hit', { amount: dmg, from: h.enemy, health: P.health });
      G.audio?.sfx?.('vesna_hurt', { volume: 0.7 });
      G.cameraRig?.shake?.(0.16, 0.18);
      G.postfx?.flash?.(0xff3b2a, 0.1);
    }
    if (h.t >= h.maxTime) this.release(h, 'timeout');
  }

  // ---- state --------------------------------------------------------------------------------------------------------------------
  _died(e) {
    G.events.emit('enemy:death', { enemy: e, kind: e.kind, faction: e.faction, position: posOf(e, new THREE.Vector3()).clone() });
    if (G.player?.target === e) G.player.setTarget?.(null);
  }

  _playerDied() {
    if (this.hold_) this.release(this.hold_, 'ended');
    this._endCombat(false);
  }

  _reset() {
    this._calm = 0;
  }

  setBoss(b) {
    this.boss = b || null;
    this.ui.boss(b || null);
    if (b && this.inCombat) this._applyMood();
  }

  _applyMood() {
    G.audio?.setMood?.(this.boss ? 'boss' : 'combat', { fade: this.boss ? 1.5 : 1.2 });
  }

  _startCombat() {
    this.inCombat = true;
    this._calm = 0;
    this._prevMood = G.audio?.mood && G.audio.mood !== 'combat' && G.audio.mood !== 'boss' ? G.audio.mood : (G.time?.isNight ? 'night' : 'wild');
    this._moodHandedOver = false;
    this._applyMood();
    if (!this.boss) G.audio?.stinger?.('danger');
    G.events.emit('combat:start', { enemies: this.liveEnemies() });
  }

  _endCombat(victory) {
    if (!this.inCombat) return;
    this.inCombat = false;
    if (!this._moodHandedOver && G.audio?.mood && (G.audio.mood === 'combat' || G.audio.mood === 'boss')) {
      G.audio.setMood(this._prevMood || 'night', { fade: 4 });
    }
    G.events.emit('combat:end', { victory });
  }

  // The finale builder takes over the music after the boss yields: do not restore the old mood on top of it.
  handOverMusic() { this._moodHandedOver = true; }

  update(dt) {
    this._pStop = Math.max(0, this._pStop - dt);
    this._updateHold(dt);
    // Combat state: any engaged hostile keeps it going; a short grace after the last one.
    let engaged = 0, alive = 0;
    for (const e of this.enemies) {
      if (!isLive(e) || e.faction === 'friendly') continue;
      alive++;
      if (e.engaged && !G.player?.dead) engaged++;
    }
    if (engaged > 0) {
      this._calm = 0;
      if (!this.inCombat) this._startCombat();
    } else if (this.inCombat) {
      this._calm += dt;
      if (this._calm > TUNE.endDelay) this._endCombat(alive === 0);
    }
    this.fx.update(dt);
    this.signs.update(dt);
  }

  late(dt) {
    this.trail.update(dt);
  }

  uiUpdate(dt) {
    this.ui.update(dt);
  }

  dispose() {
    for (const off of this.offs) off();
    if (this._animPatched && this._origAnimUpdate) this._animPatched.update = this._origAnimUpdate;
    this.fx.dispose();
    this.trail.dispose();
    this.signs.dispose();
    this.ui.dispose();
  }
}

// Swing and sign hooks are wired in the constructor; the swings of the hold system listen separately so
// they count even when nothing is struck.
export async function init(G_) {
  const C = new Combat();
  G_.combat = C;
  G_.events.on('player:swing', () => C._holdInput('swing'));
  G_.addSystem('combat', (dt) => C.update(dt), ORDER.ai + 1);
  G_.addSystem('combat-late', (dt) => C.late(dt), ORDER.characters + 4);
  G_.addSystem('combat-ui', (dt) => C.uiUpdate(dt), ORDER.late + 20);
}

export { Combat, arcTest, centerOf, isLive };
