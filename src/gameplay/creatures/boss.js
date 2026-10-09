// The Marzanna: Wiesia as a four meter ghost of white cloth and ice (the wiesia_ghost character scaled up,
// with floating hair, a frozen straw crown, turquoise eyes, ice armor and claws, a cloth train and the glow of
// the deep under the ice). docs/DESIGN.md 4.6, docs/STORY.md "C7 Emergence" and "The choice at 25%".
//
//   const boss = G.creatures.spawnBoss(x, z, { emerge: false, passive: false, phase: 1 })
//   boss.emerge() -> Promise     rises out of a hole in the ice (the C7 beat); resolves when she is up
//   boss.setPhase(n)             jump to phase 1, 2 or 3 (sets health to match)
//   boss.yield()                 she stops fighting (called automatically at 25 percent); emits boss:yield
//   boss.passive = true          stands and watches (cutscenes); false lets her fight
//   boss.dispose()
// Phases (health thresholds 66 and 33 percent, yield at 25, she never dies from damage):
//   1  ice armor (Gale breaks it, sword barely scratches it), sweeping claw, lines of ice spikes
//   2  summons three effigies, blizzard gusts that push Vesna, cracks spreading over the arena
//   3  dives under the ice and hunts from below (a pale glow under Vesna's feet, then a cage of ice that
//      grabs), surfaces to scream (a stun cone that Ward blocks), vulnerable for a while, dives again
// Events: boss:phase { phase, boss }, boss:yield { boss }, boss:emerged { boss }, boss:armor { broken }.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, lerp, wrapAngle, smoothstep } from '../../core/util.js';
import { Creature } from './base.js';
import { createCharacter } from '../../characters/index.js';
import { presetSpec } from '../../characters/presets.js';
import { SpikeField, LineTelegraph, Band, Ribbons, ArmorSet, glowSprite } from './bossFx.js';
import { props } from '../../world/props/index.js';

export const TUNE = {
  hp: 1000, phase2: 0.66, phase3: 0.33, yieldAt: 0.25,
  scale: [2.5, 2.72, 2.5], hover: 0.62,
  speed: 2.3, speed2: 3.0, keep: 5.6, arenaR: 27,
  armorDeflect: 0.1, armorRegrow: 12, armorStagger: 2.4,
  claw: { clip: 'attack_3', speed: 0.5, contact: 0.86, end: 1.55, reach: 5.2, half: 1.1, damage: 24 },
  spike: { clip: 'cast_sign', speed: 0.42, wind: 1.1, len: 19, spacing: 1.25, damage: 20, height: 2.5 },
  gust: { wind: 1.0, dur: 3.0, push: 5.6 },
  scream: { wind: 1.45, range: 13, half: 0.7, damage: 14 },
  hunt: { speed: 4.7, min: 3.8, max: 8.5, glowT: 1.25, lock: 0.3, radius: 2.1, damage: 26, hold: 5.0, breakAt: 4 },
  exposed: 6.5,
  cool: [[1.7, 2.8], [1.2, 2.1], [0.9, 1.6]],
};

const LEG_BONES = ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR'];
const _tp = {};
const rr = (a, b) => a + Math.random() * (b - a);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

export class Boss extends Creature {
  constructor(x, z, o = {}) {
    const root = new THREE.Group();
    super('boss', { root, radius: 1.3, height: 4.3, health: TUNE.hp * (o.hpMul ?? 1), name: 'Wiesia', material: 'frost' });
    this.isBoss = true;
    this.yieldAt = TUNE.yieldAt;
    this.position.set(x, 0, z);
    this.home = { x, z };
    this.heading = o.yaw ?? 0;
    this.passive = !!o.passive;
    this.phase = 1;
    this.state = 'idle';
    this.stateT = 0;
    this.speed = 0;
    this.vel2 = new THREE.Vector3();
    this.invuln = false;
    this.yielded = false;
    this.diving = false;
    this.armored = true;
    this.armorTimer = 0;
    this.armorGrow = 0;
    this.armorHits = 0;
    this.cool = 1.4;
    this.flashK = 0;
    this.hover = TUNE.hover;
    this.underPos = new THREE.Vector3(x, 0, z);
    this.glowI = 0.3;
    this.glowR = 7;
    this.crack = 0;
    this.crackTarget = 0;
    this.gustT = 8;
    this.summonT = 5;
    this.p3T = 0;
    this.holeIds = [];
    this.holdH = null;
    this.hitFlag = false;
    this.screamAim = 0;
    this.moveGoal = null;
    this.exposedT = 0;
    this.clawGlow = 0;
    this.scream = 0;
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.flipT = 4;

    // ---- body: the ghost character, scaled up and hovering ------------------------------------------------
    const spec = presetSpec('wiesia_ghost');
    spec.id = 'marzanna';
    spec.hair = { style: 'float', color: '#26221f', length: 1.0, strands: 110 };
    spec.rim = { r: 0.5, g: 1.45, b: 1.7, p: 1.8 };
    spec.glow = '#2c8fa6';
    this.char = createCharacter(spec);
    const c = this.char;
    c.autoGround = false;
    c.root.scale.set(...TUNE.scale);
    c.root.position.set(0, 0, 0);
    // The character system works in world space (distance LOD, culling), so her root lives in the scene and is
    // synced to this.root every frame; this.body (hover offset) carries the light.
    this.body = new THREE.Group();
    this.body.name = 'marzanna_body';
    root.add(this.body);
    G.scene.add(c.root);
    // Long arms and neck: the proportions of something that was a child.
    if (c.bones.armL) { for (const n of ['armL', 'armR', 'forearmL', 'forearmR']) c.bones[n].scale.y = 1.22; }
    if (c.bones.neck) c.bones.neck.scale.y = 1.5;
    this.hipsRest = null; // captured from the settled idle pose (the first pose is not the resting one)
    // The skirt springs are verlet in world space with unscaled collider radii: at 2.5x they explode on any motion.
    // The skirt keeps its animated pose; the cloth train below carries the motion.
    c.springs.update = () => {};
    const animUpdate = c.anim.update.bind(c.anim);
    c.anim.update = (dt, ctx) => { animUpdate(dt, ctx); this._posePost(); };
    this.mzU = c.material.userData.mzU;
    this.baseRim = this.mzU.uMzRim.value.clone();
    this.mzU.uMzFloat.value = 2.4;
    c.setRestFace?.({ browSad: 0.9, frown: 0.5, heavyLids: 0.1 });
    this.armor = new ArmorSet(c);
    this.armorOld = [];
    this.ribbons = new Ribbons(this.body, { count: 12, segs: 14, length: 2.6, width: 0.8, radius: 0.85 });
    this.spikes = new SpikeField(80);
    this.cage = new SpikeField(24, { opacity: 0.5, glow: 1.6 });
    this.line = new LineTelegraph();
    this.claw = new Band(TUNE.claw.half, [0.45, 0.95, 1.0]);
    this.cone = new Band(TUNE.scream.half, [0.55, 1.0, 1.0]);
    this.light = new THREE.PointLight(0x7fe8ff, 0, 22, 1.5);
    this.light.position.set(0, 2.4, 0.6);
    this.body.add(this.light);
    // Eyes: bright turquoise glints that catch the bloom.
    this.eyeGlow = [];
    for (const k of ['eyeL', 'eyeR']) {
      const bone = c.bones[k];
      if (!bone) continue;
      const s = glowSprite([0.4, 1.0, 1.0], 0.09);
      s.position.set(0, 0, 0.012);
      bone.add(s);
      this.eyeGlow.push(s);
    }
    G.scene.add(root);
    this._applyBody(0);
    if (o.emerge) this.state = 'hidden';
  }

  // ---- public ---------------------------------------------------------------------------------------------------
  emerge() {
    this.go('emerge');
    this.invuln = true;
    this.engaged = false;
    this.body.position.y = -4.6;
    this.emerged = new Promise((res) => { this._emergeDone = res; });
    return this.emerged;
  }

  // Let her fight (after a cutscene held her passive).
  activate() {
    this.passive = false;
    this.cool = Math.min(this.cool, 1.0);
  }

  setPhase(n, { instant = true } = {}) {
    n = clamp(Math.round(n), 1, 3);
    this.hitFlag = false;
    this.releaseHold();
    this.spikes.clear();
    this.cage.clear();
    this.line.hide();
    this.restoreFromDive();
    if (n === 1) {
      this.phase = 1; this.health = this.maxHealth; this.armored = true; this.armor.setLevel(1);
      this.crackTarget = 0;
    } else if (n === 2) {
      this.phase = 2; this.health = this.maxHealth * (TUNE.phase2 - 0.01);
      this.crackTarget = 0.45;
    } else {
      this.phase = 3; this.health = this.maxHealth * (TUNE.phase3 - 0.01);
      this.crackTarget = 1;
      if (this.armored) { this.armored = false; this.armor.shatter(this.root.position); this.armorOld.push(this.armor); }
    }
    this.yielded = false;
    this.invuln = false;
    this.cool = 1.2;
    if (n === 3) { this.p3T = 0; this.exposedT = TUNE.exposed * 0.5; this.go('idle'); } else this.go('idle');
    G.events.emit('boss:phase', { phase: n, boss: this, instant });
  }

  yield() {
    if (this.yielded) return;
    this.yielded = true;
    this.invuln = true;
    this.passive = true;
    this.releaseHold();
    this.spikes.shatterAll();
    this.cage.shatterAll();
    this.line.hide();
    this.restoreFromDive();
    if (this.armored) { this.armored = false; this.armor.shatter(this.position); this.armorOld.push(this.armor); }
    this.go('yield');
    this.engaged = false;
    this.health = Math.max(this.health, this.maxHealth * 0.2);
    this.char.play('idle', { fade: 0.6 });
    G.combat?.handOverMusic?.();
    G.events.emit('boss:yield', { boss: this });
  }

  // ---- combat contract --------------------------------------------------------------------------------------------
  takeHit(hit) {
    if (!this.alive || this.yielded || this.invuln || this.diving || this.state === 'hidden' || this.state === 'emerge') return { hit: false, damage: 0, killed: false };
    let dmg = hit.damage;
    const res = { hit: true, material: 'frost', killed: false };
    if (this.armored && hit.source !== 'gale') {
      dmg *= TUNE.armorDeflect;
      res.deflected = true;
      res.material = 'ice';
      this.armorHits++;
      this.sfx('hit_ice', { volume: 0.5 });
    }
    res.damage = dmg;
    this.damageBoss(dmg);
    this.flashK = 1;
    if (hit.stagger && !this.armored && this.state !== 'stagger' && this.state !== 'phase' && !this.diving && this.phase < 3 && Math.random() < 0.5) this.go('stagger', { dur: 0.9 });
    return res;
  }

  damageBoss(d) {
    const floor = this.maxHealth * this.yieldAt;
    this.health = Math.max(floor, this.health - d);
    const f = this.health / this.maxHealth;
    if (this.yielded) return;
    if (f <= this.yieldAt + 1e-4) { this.yield(); return; }
    if (this.phase === 1 && f <= TUNE.phase2) this.startPhase(2);
    else if (this.phase === 2 && f <= TUNE.phase3) this.startPhase(3);
  }

  onParried() {
    // Her strike glanced off: a flicker of surprise, not a stagger of a four meter ghost.
    this.flashK = 0.6;
    this.sfx('parry', { volume: 0.8, pitch: 0.6 });
    if (this.state === 'claw') this.go('stagger', { dur: 1.1 });
  }

  onSign(sign, info) {
    if (!this.alive || this.yielded) return false;
    if (sign === 'gale') {
      if (this.armored && !this.invuln && !this.diving) { this.breakArmor(info.point); return true; }
      return false;
    }
    if (sign === 'ember') {
      if (this.invuln || this.diving) return false;
      if (!this.armored) this.damageBoss(4 * info.dt);
      this._steam = (this._steam || 0) - info.dt;
      if (this._steam <= 0) { this._steam = 0.08; G.combat?.fx?.mist(this.hitCenter(), { color: [0.9, 0.95, 1.0], alpha: 0.35, count: 2, size: 0.6, speed: 1.2, life: 0.9, up: 0.8 }); }
      return true;
    }
    return false;
  }

  breakArmor(point) {
    if (!this.armored) return;
    this.armored = false;
    this.armorTimer = TUNE.armorRegrow;
    this.armor.shatter(point || this.position);
    this.armorOld.push(this.armor);
    const c = this.hitCenter();
    G.combat?.fx?.chips(c, { kind: 'frost', count: 40, speed: 6, up: 4 });
    G.combat?.fx?.chips(c, { kind: 'ice', count: 30, speed: 5, up: 3.5 });
    G.combat?.fx?.mist(c, { color: [0.6, 1.1, 1.3], alpha: 0.5, count: 8, size: 1.1, speed: 2.5, life: 1.0, up: 0.6 });
    this.sfx('ice_crack', { volume: 1.2 });
    this.sfx('hit_ice', { volume: 1.0, pitch: 0.7 });
    G.cameraRig?.shake?.(0.5, 0.5);
    G.postfx?.flash?.(0xa8f0ff, 0.2);
    this.flashK = 1;
    this.releaseHold();
    this.go('stagger', { dur: TUNE.armorStagger, broke: true });
    G.events.emit('boss:armor', { broken: true, boss: this });
  }

  startPhase(n) {
    if (this.phase >= n && this.state === 'phase') return;
    this.phase = n;
    this.invuln = true;
    this.spikes.shatterAll();
    this.cage.shatterAll();
    this.line.hide();
    this.releaseHold();
    this.go('phase', { to: n });
    G.events.emit('boss:phase', { phase: n, boss: this });
  }

  releaseHold() {
    if (this.holdH) { const h = this.holdH; this.holdH = null; G.combat?.release?.(h, 'released'); }
  }

  go(state, extra) {
    this.state = state;
    this.stateT = 0;
    this.hitFlag = false;
    this._f = {};
    if (extra) Object.assign(this, extra);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------------------
  faceTo(dt, yaw, rate) {
    return this.turnToward(yaw, rate, dt);
  }

  glide(dt, tx, tz, speed, accel = 3) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    const want = d > 0.15 ? Math.min(speed, d * 1.5) : 0;
    const vx = d > 1e-3 ? dx / d * want : 0, vz = d > 1e-3 ? dz / d * want : 0;
    this.vel2.x += (vx - this.vel2.x) * Math.min(1, accel * dt);
    this.vel2.z += (vz - this.vel2.z) * Math.min(1, accel * dt);
    this.position.x += this.vel2.x * dt;
    this.position.z += this.vel2.z * dt;
    // Stay inside the arena.
    const hx = this.position.x - this.home.x, hz = this.position.z - this.home.z;
    const hd = Math.hypot(hx, hz);
    if (hd > TUNE.arenaR) { this.position.x = this.home.x + hx / hd * TUNE.arenaR; this.position.z = this.home.z + hz / hd * TUNE.arenaR; }
    this.position.y = 0;
    this.speed = Math.hypot(this.vel2.x, this.vel2.z);
  }

  stop(dt) {
    this.vel2.x *= Math.max(0, 1 - 5 * dt); this.vel2.z *= Math.max(0, 1 - 5 * dt);
    this.position.x += this.vel2.x * dt; this.position.z += this.vel2.z * dt;
    this.speed = Math.hypot(this.vel2.x, this.vel2.z);
  }

  hitCenter(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.body.position.y + 2.4, this.position.z);
  }

  playerCone(yaw, reach, half) {
    const P = G.player;
    if (!P || P.dead) return false;
    const dx = P.position.x - this.position.x, dz = P.position.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 0.4) return false;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
    return ang <= half + Math.atan2(0.4, Math.max(1, d));
  }

  chooseCool() { return rr(...TUNE.cool[this.phase - 1]); }

  // ---- per frame -------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.disposed) return;
    const dtReal = dt;
    dt = this.tick(dt);
    const tp = this.toPlayer(_tp);
    this.stateT += dt;
    this.cool -= dt;
    if (this.phase === 3 && !this.diving && !this.yielded) this.exposedT -= dt;
    const pAlive = this.playerAlive();

    switch (this.state) {
      case 'hidden': this.body.position.y = -6; break;
      case 'emerge': this._emerge(dt); break;
      case 'idle': this._idle(dt, tp, pAlive); break;
      case 'claw': this._claw(dt, tp); break;
      case 'spike': this._spike(dt, tp); break;
      case 'gust': this._gust(dt, tp); break;
      case 'scream': this._scream(dt, tp); break;
      case 'stagger': this._stagger(dt, tp); break;
      case 'phase': this._phase(dt, tp); break;
      case 'dive': this._dive(dt, tp); break;
      case 'hunt': this._hunt(dt, tp); break;
      case 'grab_glow': this._grabGlow(dt, tp); break;
      case 'grab': this._grab(dt, tp); break;
      case 'surface': this._surface(dt, tp); break;
      case 'yield': this._yield(dt, tp); break;
      default: break;
    }

    // Armor regrowth in phases 1 and 2.
    if (!this.armored && !this.yielded && this.phase < 3 && this.state !== 'phase' && this.state !== 'emerge') {
      this.armorTimer -= dt;
      if (this.armorTimer <= 0 && !this.armorRegrowing) {
        this.armorRegrowing = true;
        this.armorGrow = 0;
        this.armor = new ArmorSet(this.char, { claws: false });
        this.armor.broken = false;
        this.armor.setLevel(0);
        this.sfx('ice_ping', { volume: 0.8, pitch: 0.8 });
      }
    }
    if (this.armorRegrowing) {
      this.armorGrow = Math.min(1, this.armorGrow + dt / 2.6);
      this.armor.setLevel(this.armorGrow);
      if (this.armorGrow >= 1) { this.armorRegrowing = false; this.armored = true; this.armorHits = 0; G.events.emit('boss:armor', { broken: false, boss: this }); }
    }

    this._applyBody(dtReal);
  }

  // Runs right after the animator writes the bones and before the springs and foot IK (see the wrapper in the
  // constructor): she floats, so the clips' hip bounce and leg swing are removed (they would fling the skirt
  // chain around at this scale), and the scream tilts her head back.
  _posePost() {
    if (this.disposed || this.diving) return;
    const B = this.char.bones;
    if (!this.hipsRest && B.hips && this.char.anim.mode === 'loco' && this.t > 0.4) this.hipsRest = B.hips.position.clone();
    if (B.hips && this.hipsRest) B.hips.position.copy(this.hipsRest);
    for (const n of LEG_BONES) if (B[n]) B[n].quaternion.set(0, 0, 0, 1);
    const sc = this.scream;
    if (sc > 0.01 && B.head) {
      B.head.rotation.x -= 0.55 * sc;
      if (B.neck) B.neck.rotation.x -= 0.25 * sc;
      if (B.chest) B.chest.rotation.x -= 0.18 * sc;
    }
    if (this.state === 'yield' && B.head && B.neck) {
      B.head.rotation.x += 0.5; B.neck.rotation.x += 0.2;
    }
  }

  // ---- states ------------------------------------------------------------------------------------------------------------------
  _idle(dt, tp, pAlive) {
    this._lookAtPlayer();
    this.faceTo(dt, tp.yaw, 1.7);
    if (this.passive || !pAlive || this.invuln) { this.stop(dt); return; }
    this.engaged = true;
    // Drift: hold a distance, circle slowly.
    this.flipT -= dt;
    if (this.flipT <= 0) { this.flipT = rr(3, 7); this.orbit *= -1; }
    const keep = this.phase === 3 ? 4.8 : TUNE.keep;
    const sp = this.phase >= 2 ? TUNE.speed2 : TUNE.speed;
    const dir = Math.atan2(this.position.x - G.player.position.x, this.position.z - G.player.position.z);
    const want = keep + Math.sin(this.t * 0.4) * 0.8;
    const tx = G.player.position.x + Math.sin(dir + this.orbit * 0.35) * want;
    const tz = G.player.position.z + Math.cos(dir + this.orbit * 0.35) * want;
    this.glide(dt, tx, tz, sp);
    this.gustT -= dt; this.summonT -= dt;
    if (this.cool > 0) return;
    const d = tp.d;
    // Phase 3: after a spell on the surface she goes back under.
    if (this.phase === 3 && this.exposedT <= 0 && this.stateT > 0.4) { this.startDive(); return; }
    if (this.phase >= 2 && this.summonT <= 0 && this.phase === 2 && this._liveEffigies() < 1) { this.summonT = 26; this.summon(2); return; }
    if (this.phase === 2 && this.gustT <= 0 && d > 3) { this.gustT = rr(13, 18); this.go('gust'); return; }
    const r = Math.random();
    if (d < 6.8 && r < 0.62) this.go('claw');
    else if (d > 5 || r < 0.5) this.go('spike');
    else this.go('claw');
  }

  _liveEffigies() {
    return (G.creatures?.effigies || []).filter((e) => e.alive && !e.disposed).length;
  }

  _lookAtPlayer() {
    const P = G.player;
    if (P && this.char) this.char.lookAt(P.character?.bones?.head || null);
  }

  _claw(dt, tp) {
    const T = TUNE.claw;
    this._lookAtPlayer();
    if (this.stateT < T.contact - 0.25) this.faceTo(dt, tp.yaw, 2.6);
    else this.faceTo(dt, tp.yaw, 0.4);
    if (!this._f.started) {
      this._f.started = true;
      this.char.play(T.clip, { speed: T.speed, fade: 0.2 });
      this.sfx('ice_groan', { volume: 0.8, pitch: 1.2 });
    }
    // Close the gap during the wind-up; the claws glow.
    if (this.stateT < T.contact - 0.1 && tp.d > T.reach * 0.6) this.glide(dt, G.player.position.x, G.player.position.z, 3.2); else this.stop(dt);
    this.clawGlow = smoothstep(0, T.contact, this.stateT) * (this.stateT < T.contact + 0.15 ? 1 : 0.2);
    if (!this.hitFlag && this.stateT >= T.contact) {
      this.hitFlag = true;
      const yaw = this.heading;
      this.claw.play(this.position.x, this.body.position.y + 1.0, this.position.z, yaw, { r0: 1.0, r1: T.reach, h: 2.4, dur: 0.3 });
      this.sfx('sword_whoosh_heavy', { volume: 1.0, pitch: 0.55 });
      const tipX = this.position.x + Math.sin(yaw) * T.reach * 0.8, tipZ = this.position.z + Math.cos(yaw) * T.reach * 0.8;
      G.combat?.fx?.chips({ x: tipX, y: 1.0, z: tipZ }, { kind: 'frost', count: 16, speed: 4, up: 2.5 });
      G.cameraRig?.shake?.(clamp(0.28 - tp.d * 0.012, 0.06, 0.28), 0.3);
      if (this.playerCone(yaw, T.reach, T.half) && !this.passive) {
        G.combat?.strike?.(this, T.damage * (this.phase === 3 ? 1.1 : 1), { knockback: 2.4, stagger: true, point: this.hitCenter() });
        this.sfx('hit_ice', { volume: 0.9, pitch: 0.7 });
      }
    }
    if (this.stateT >= T.end) { this.cool = this.chooseCool(); this.clawGlow = 0; this.char.stop(0.4); this.go('idle'); }
  }

  _spike(dt, tp) {
    const T = TUNE.spike;
    this._lookAtPlayer();
    const f = this._f;
    if (!f.started) {
      f.started = true;
      this.char.play(T.clip, { speed: T.speed, fade: 0.2 });
      this.sfx('ice_groan', { volume: 1.0, pitch: 0.9 });
      f.yaw = tp.yaw;
    }
    if (this.stateT < 0.45) { f.yaw = tp.yaw; this.faceTo(dt, tp.yaw, 3); } else this.faceTo(dt, f.yaw, 1);
    this.stop(dt);
    // The crack races out along the aimed line(s).
    const fan = this.phase >= 2 ? [-0.34, 0, 0.34] : [0];
    const len = T.len;
    if (this.stateT >= 0.2 && !f.shown) {
      f.shown = true;
      f.aim = f.yaw;
      // One telegraph mesh shows the central line; the side lines are implied by faint extra spikes.
      this.line.show(this.position.x, this.position.z, f.aim, len, 1.9);
    }
    if (f.shown && !f.erupted) {
      const u = clamp((this.stateT - 0.2) / (T.wind - 0.2));
      this.line.setAlpha(smoothstep(0, 0.5, u) * (0.7 + 0.3 * Math.sin(this.stateT * 22)));
      this.glowI = 0.6 + 0.35 * u;
    }
    if (!f.erupted && this.stateT >= T.wind) {
      f.erupted = true;
      this.line.hide();
      const P = G.player;
      let hit = false;
      for (const off of fan) {
        const a = f.aim + off;
        const n = Math.floor(len / T.spacing);
        for (let i = 1; i <= n; i++) {
          const dist = 1.6 + i * T.spacing;
          if (dist > len) break;
          const x = this.position.x + Math.sin(a) * dist + (Math.random() - 0.5) * 0.3;
          const z = this.position.z + Math.cos(a) * dist + (Math.random() - 0.5) * 0.3;
          const tall = off === 0 ? T.height : T.height * 0.8;
          this.spikes.add(x, z, {
            delay: i * 0.04, height: tall * (0.75 + Math.random() * 0.45) * (1 + i * 0.012), radius: 0.4 + Math.random() * 0.14, hold: 0.85, lean: [(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2],
            onErupt: (it) => {
              if (i % 3 === 0) this.sfx('ice_spike', { pos: { x: it.x, y: 0, z: it.z }, volume: 0.9, pitch: 0.9 + Math.random() * 0.3 });
              G.combat?.fx?.chips({ x: it.x, y: 0.2, z: it.z }, { kind: 'ice', count: 4, speed: 2.8, up: 3 });
              if (!hit && !this.passive && this.playerAlive() && Math.hypot(P.position.x - it.x, P.position.z - it.z) < it.r + 0.62 && P.position.y < 1.9) {
                hit = true;
                G.combat?.strike?.(this, T.damage, { knockback: 1.8, stagger: true, point: new THREE.Vector3(it.x, 1, it.z) });
              }
            },
            onShatter: (it) => G.combat?.fx?.chips({ x: it.x, y: 0.5, z: it.z }, { kind: 'ice', count: 5, speed: 2.2, up: 2.5 }),
          });
        }
      }
      G.cameraRig?.shake?.(0.14, 0.4);
    }
    if (this.stateT >= T.wind + 1.5) { this.cool = this.chooseCool(); this.glowI = 0.3; this.char.stop(0.4); this.go('idle'); }
  }

  _gust(dt, tp) {
    const T = TUNE.gust;
    this._lookAtPlayer();
    const f = this._f;
    this.faceTo(dt, tp.yaw, 2);
    this.stop(dt);
    if (!f.started) {
      f.started = true;
      this.char.play('cast_sign', { speed: 0.4, fade: 0.2 });
      this.sfx('ice_groan', { volume: 1.0, pitch: 0.7 });
    }
    const P = G.player;
    const push = this.stateT > T.wind && this.stateT < T.wind + T.dur;
    // Snow streaming off her toward Vesna while she gathers, then the full blast.
    f.mist = (f.mist || 0) - dt;
    if (f.mist <= 0) {
      f.mist = push ? 0.03 : 0.1;
      const a = this.heading + (Math.random() - 0.5) * 0.9;
      const d0 = 1.5 + Math.random() * 3;
      G.combat?.fx?.mist({ x: this.position.x + Math.sin(a) * d0, y: 0.5 + Math.random() * 1.5, z: this.position.z + Math.cos(a) * d0 }, {
        color: [0.85, 0.93, 1.0], alpha: 0.4, count: 1, size: 0.9, speed: push ? 9 : 3, life: 0.9, up: 0.1, dir: { x: Math.sin(this.heading), z: Math.cos(this.heading) }, grow: 2.5, drag: 1.2,
      });
    }
    if (push && P && !P.dead) {
      const ax = P.position.x - this.position.x, az = P.position.z - this.position.z;
      const l = Math.hypot(ax, az) || 1;
      const dodging = P.moves?.act?.kind === 'dodge';
      if (!dodging) {
        // A shoving wind with some swirl; stronger when she is far (it carries).
        const s = T.push * (0.8 + 0.2 * Math.sin(this.stateT * 3)) * dt;
        P.loco?.move?.(ax / l * s - az / l * s * 0.25, az / l * s + ax / l * s * 0.25);
        P.loco?.vel?.set?.(P.loco.vel.x * 0.9, 0, P.loco.vel.z * 0.9);
      }
      G.cameraRig?.shake?.(0.07, 0.15);
    }
    if (this.stateT >= T.wind + T.dur + 0.4) { this.cool = this.chooseCool() * 0.7; this.char.stop(0.4); this.go('idle'); }
  }

  _scream(dt, tp) {
    const T = TUNE.scream;
    this._lookAtPlayer();
    const f = this._f;
    this.stop(dt);
    if (!f.started) {
      f.started = true;
      this.char.play('cast_sign', { speed: 0.32, fade: 0.25 });
      this.sfx('ice_groan', { volume: 1.2, pitch: 0.6 });
      this.char.expression?.('jawOpen', 1, 0.8);
      f.yaw = tp.yaw;
    }
    if (this.stateT < T.wind - 0.35) { f.yaw = tp.yaw; this.faceTo(dt, tp.yaw, 3); } else this.faceTo(dt, f.yaw, 0.3);
    // Inhale: everything gathers, the glow swells.
    const u = clamp(this.stateT / T.wind);
    this.scream = smoothstep(0.1, 1, u) * (this.stateT < T.wind + 0.9 ? 1 : 0);
    this.glowI = 0.35 + 0.8 * u;
    this.mzU.uMzFloat.value = 2.4 + 3 * u;
    if (!f.released && this.stateT >= T.wind) {
      f.released = true;
      const yaw = this.heading;
      this.cone.play(this.position.x, this.body.position.y + 1.2, this.position.z, yaw, { r0: 1.5, r1: T.range, h: 3.2, dur: 0.55 });
      this.sfx('boss_scream', { volume: 1.3 });
      G.cameraRig?.shake?.(0.55, 0.9);
      G.postfx?.flash?.(0x9ff5ff, 0.22);
      G.combat?.fx?.mist(this.hitCenter(), { color: [0.7, 1.1, 1.3], alpha: 0.5, count: 10, size: 1.3, speed: 6, life: 1.0, up: 0.3, dir: { x: Math.sin(yaw), z: Math.cos(yaw) } });
      if (this.playerCone(yaw, T.range, T.half) && !this.passive) {
        G.combat?.strike?.(this, T.damage, { knockback: 2.8, stagger: true, point: this.hitCenter() });
      }
    }
    if (this.stateT >= T.wind + 1.3) {
      this.scream = 0;
      this.mzU.uMzFloat.value = 2.4;
      this.char.expression?.('jawOpen', 0, 0.5);
      this.char.stop(0.4);
      this.cool = 0.9;
      this.glowI = 0.3;
      this.go('idle');
      if (this.phase === 3) this.exposedT = TUNE.exposed;
    }
  }

  _stagger(dt, tp) {
    this._lookAtPlayer();
    this.stop(dt);
    const f = this._f;
    if (!f.started) { f.started = true; this.char.play('stagger', { speed: 0.55, fade: 0.1 }); }
    this.faceTo(dt, tp.yaw, 0.8);
    const dur = this.dur || 1;
    if (this.stateT >= dur) { this.cool = Math.min(this.cool, 0.9); this.char.stop(0.3); this.broke = false; this.go('idle'); }
  }

  _phase(dt, tp) {
    const f = this._f;
    this._lookAtPlayer();
    this.stop(dt);
    this.faceTo(dt, tp.yaw, 1.5);
    const to = this.to;
    if (!f.started) {
      f.started = true;
      this.char.play('cast_sign', { speed: 0.3, fade: 0.2 });
      this.sfx('boss_scream', { volume: 1.2, pitch: 0.85 });
      G.cameraRig?.shake?.(0.5, 1.6);
      G.postfx?.flash?.(0x9ff5ff, 0.3);
      this.char.expression?.('jawOpen', 1, 0.6);
      if (to === 2) { G.weather?.set?.('blizzard', 4); this.crackTarget = 0.45; }
      if (to === 3) {
        this.crackTarget = 1;
        if (this.armored) { this.armored = false; this.armor.shatter(this.position); this.armorOld.push(this.armor); }
      }
    }
    this.scream = this.stateT < 1.6 ? smoothstep(0, 0.6, this.stateT) : 0;
    this.glowI = 0.35 + 0.7 * Math.sin(Math.min(1, this.stateT / 2) * Math.PI);
    this.mzU.uMzFloat.value = 2.4 + 3 * Math.sin(Math.min(1, this.stateT / 2.4) * Math.PI);
    if (to === 2 && !f.summoned && this.stateT > 1.1) { f.summoned = true; this.summon(3); }
    const D = to === 2 ? 3.4 : 2.8;
    if (this.stateT >= D) {
      this.scream = 0;
      this.char.expression?.('jawOpen', 0, 0.5);
      this.char.stop(0.4);
      this.invuln = false;
      this.cool = 1.0;
      this.armorTimer = 6;
      if (to === 3) { this.p3T = 0; this.startDive(); } else this.go('idle');
    }
  }

  summon(n) {
    const C = G.creatures;
    if (!C?.spawnEffigy) return;
    const P = G.player;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2 + i * 2.1;
      const r = rr(6.5, 10.5);
      let x = (P ? P.position.x : this.position.x) + Math.sin(a) * r, z = (P ? P.position.z : this.position.z) + Math.cos(a) * r;
      const hx = x - this.home.x, hz = z - this.home.z;
      const hd = Math.hypot(hx, hz);
      if (hd > TUNE.arenaR - 2) { x = this.home.x + hx / hd * (TUNE.arenaR - 2); z = this.home.z + hz / hd * (TUNE.arenaR - 2); }
      const e = C.spawnEffigy(x, z, { dormant: false, yaw: a + Math.PI });
      if (e) e.engaged = true;
      G.combat?.fx?.chips({ x, y: 0.2, z }, { kind: 'ice', count: 10, speed: 3, up: 3 });
      this.sfx('ice_crack', { pos: { x, y: 0, z }, volume: 0.8, pitch: 0.9 + i * 0.1 });
    }
  }

  // ---- phase 3: under the ice ------------------------------------------------------------------------------------------------------
  startDive() {
    this.releaseHold();
    this.go('dive');
    this.diving = true;
    this.engaged = true;
    this.char.stop(0.2);
    this.sfx('splash', { volume: 1.0, pitch: 0.7 });
    this.sfx('ice_crack', { volume: 1.0, pitch: 0.8 });
    G.cameraRig?.shake?.(0.3, 0.6);
  }

  _dive(dt) {
    const f = this._f;
    const u = clamp(this.stateT / 1.0);
    this.stop(dt);
    this.body.position.y = lerp(this.hover, -3.0, easeOut(u));
    if (!f.chips) {
      f.chips = true;
      G.combat?.fx?.chips({ x: this.position.x, y: 0.3, z: this.position.z }, { kind: 'frost', count: 30, speed: 5, up: 4 });
      G.combat?.fx?.chips({ x: this.position.x, y: 0.3, z: this.position.z }, { kind: 'ice', count: 24, speed: 4.5, up: 3.5 });
      props.fx.burst('snow', [this.position.x, 0.3, this.position.z], { count: 30, speed: 5, up: 1.5, size: 0.3 });
    }
    this.glowI = lerp(0.3, 0.55, u);
    if (u >= 1) {
      this.hideBody(true);
      this.underPos.set(this.position.x, 0, this.position.z);
      this.hunt = { t: 0, ping: 0, dur: rr(TUNE.hunt.min, TUNE.hunt.max) };
      this.go('hunt');
    }
  }

  hideBody(hide) {
    this.diving = hide;
    this.char.setVisible(!hide);
    this.ribbons.mesh.visible = !hide;
    this.light.visible = !hide;
    if (hide) { G.scene.remove(this.root); this.engaged = true; } else if (!this.root.parent) G.scene.add(this.root);
  }

  restoreFromDive() {
    if (!this.diving && this.root.parent) return;
    this.hideBody(false);
    this.body.position.y = this.hover;
    this.ribbons.reset();
  }

  _hunt(dt, tp) {
    const T = TUNE.hunt;
    const P = G.player;
    if (!this.playerAlive()) { this.glowI = 0.4; return; }
    const H = this.hunt;
    H.t += dt;
    // Swim under the ice toward her, weaving a little so the glow cannot be read like a missile.
    const dx = P.position.x - this.underPos.x, dz = P.position.z - this.underPos.z;
    const d = Math.hypot(dx, dz) || 1;
    const weave = Math.sin(this.stateT * 2.1) * 0.5;
    const sp = T.speed * (d > 7 ? 1.25 : 1);
    this.underPos.x += (dx / d - dz / d * weave * 0.4) * sp * dt;
    this.underPos.z += (dz / d + dx / d * weave * 0.4) * sp * dt;
    this.position.x = this.underPos.x; this.position.z = this.underPos.z;
    this.glowR = 3.4; this.glowI = 0.4 + 0.12 * Math.sin(this.stateT * 6);
    H.ping -= dt;
    if (H.ping <= 0) {
      H.ping = rr(1.3, 2.1);
      this.sfx('ice_groan', { pos: { x: this.underPos.x, y: 0, z: this.underPos.z }, volume: 0.9, pitch: rr(0.8, 1.1) });
      G.combat?.fx?.mist({ x: this.underPos.x, y: 0.1, z: this.underPos.z }, { color: [0.7, 1.0, 1.1], alpha: 0.25, count: 2, size: 0.9, speed: 0.8, life: 1.0, up: 0.3 });
    }
    G.cameraRig?.shake?.(0.03, 0.1);
    if ((H.t >= H.dur && d < 11) || (d < 2.6 && H.t > 1.5)) this.go('grab_glow', { gx: P.position.x, gz: P.position.z });
    void tp;
  }

  _grabGlow(dt, tp) {
    const T = TUNE.hunt;
    const P = G.player;
    const u = clamp(this.stateT / T.glowT);
    // The pale glow settles under her feet, following her with a lag; it freezes just before the strike.
    if (this.stateT < T.glowT - T.lock) {
      this.gx += (P.position.x - this.gx) * Math.min(1, dt * 2.2);
      this.gz += (P.position.z - this.gz) * Math.min(1, dt * 2.2);
    }
    this.underPos.set(this.gx, 0, this.gz);
    this.position.x = this.gx; this.position.z = this.gz;
    this.glowR = lerp(3.4, 2.3, u); this.glowI = lerp(0.45, 0.95, u) * (0.88 + 0.12 * Math.sin(this.stateT * 28));
    const f = this._f;
    if (!f.s) { f.s = true; this.sfx('ice_ping', { pos: { x: this.gx, y: 0, z: this.gz }, volume: 1.0, pitch: 0.7 }); }
    if (!f.s2 && this.stateT > T.glowT * 0.55) { f.s2 = true; this.sfx('ice_crack', { pos: { x: this.gx, y: 0, z: this.gz }, volume: 0.8, pitch: 0.6 }); }
    G.cameraRig?.shake?.(0.05 + 0.06 * u, 0.1);
    if (this.stateT >= T.glowT) this.go('grab', { gx: this.gx, gz: this.gz });
    void tp;
  }

  _grab(dt) {
    const T = TUNE.hunt;
    const f = this._f;
    this.glowI = 1.0; this.glowR = 2.6;
    if (!f.s) {
      f.s = true;
      const P = G.player;
      const cx = this.gx, cz = this.gz;
      // A cage of ice fingers closing in around the spot, each leaning toward the center.
      const n = 8;
      f.cage = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const r = 1.55;
        const sx = cx + Math.sin(a) * r, sz = cz + Math.cos(a) * r;
        const it = this.cage.add(sx, sz, {
          delay: i * 0.015, height: 3.4 + Math.random() * 0.8, radius: 0.3, grow: 0.12, hold: 1.1, free: true, lean: [0.36, 0],
          onErupt: (sp) => { G.combat?.fx?.chips({ x: sp.x, y: 0.3, z: sp.z }, { kind: 'frost', count: 6, speed: 3, up: 3.5 }); },
        });
        if (it) it.spin = Math.atan2(cx - sx, cz - sz);
        f.cage.push(it);
      }
      G.combat?.fx?.chips({ x: cx, y: 0.3, z: cz }, { kind: 'ice', count: 28, speed: 5, up: 4.5 });
      props.fx.burst('snow', [cx, 0.3, cz], { count: 36, speed: 6, up: 2, size: 0.3 });
      this.sfx('ice_spike', { volume: 1.2, pitch: 0.7 });
      this.sfx('ice_crack', { volume: 1.2, pitch: 0.7 });
      G.cameraRig?.shake?.(0.4, 0.6);
      const d = Math.hypot(P.position.x - cx, P.position.z - cz);
      f.caught = d < T.radius && this.playerAlive() && !P.isInvulnerable() && !this.passive;
      if (f.caught) {
        this.holdH = G.combat?.hold?.(this, {
          anchor: () => new THREE.Vector3(cx, 0, cz), breakAt: T.breakAt, maxTime: T.hold, dps: 7.5, tick: 0.8,
          onEnd: () => { this.holdH = null; f.released = true; },
        }) || null;
        if (!this.holdH) f.caught = false;
        else G.combat?.strike?.(this, 0, { point: new THREE.Vector3(cx, 1, cz) });
      }
    }
    // The cage (and the grip) stays up while she holds; otherwise it shatters after a beat.
    const holding = !!this.holdH;
    if (!holding && (f.released || !f.caught) && this.stateT > 1.0 && !f.cleared) {
      f.cleared = true;
      for (const it of f.cage || []) if (it) { it.free = false; it.t = 0; it.state = it.state === 'wait' ? 'dead' : 'hold'; it.hold = 0.01; }
    }
    if (this.stateT > 1.2 && !holding) {
      this.underPos.set(this.gx, 0, this.gz);
      this.go('surface');
    }
    void dt;
  }

  _surface(dt, tp) {
    const f = this._f;
    if (!f.s) {
      f.s = true;
      this.position.x = this.gx; this.position.z = this.gz;
      this.hideBody(false);
      this.char.setVisible(true);
      this.body.position.y = -3;
      this.ribbons.reset();
      this.char.expression?.('jawOpen', 0.4, 0.3);
      this.sfx('splash', { volume: 1.2, pitch: 0.8 });
      this.sfx('ice_crack', { volume: 1.2 });
      G.combat?.fx?.chips({ x: this.gx, y: 0.3, z: this.gz }, { kind: 'frost', count: 40, speed: 6, up: 5 });
      G.combat?.fx?.chips({ x: this.gx, y: 0.3, z: this.gz }, { kind: 'ice', count: 30, speed: 5, up: 4 });
      props.fx.burst('snow', [this.gx, 0.3, this.gz], { count: 40, speed: 6, up: 2, size: 0.32 });
      G.cameraRig?.shake?.(0.35, 0.6);
      G.postfx?.flash?.(0x9ff5ff, 0.15);
    }
    const u = clamp(this.stateT / 0.9);
    this.body.position.y = lerp(-3, this.hover, easeOut(u));
    this._lookAtPlayer();
    this.faceTo(dt, tp.yaw, 3);
    this.glowI = lerp(1.0, 0.32, u); this.glowR = 7;
    if (u >= 1) { this.go('scream'); }
  }

  _yield(dt, tp) {
    this.stop(dt);
    this.faceTo(dt, tp.yaw, 0.8);
    this.char.lookAt(null);
    this.glowI += (0.3 - this.glowI) * Math.min(1, dt);
    this.mzU.uMzFloat.value += (1.6 - this.mzU.uMzFloat.value) * Math.min(1, dt);
    this.hover += (0.28 - this.hover) * Math.min(1, dt * 0.8);
    this.body.position.y = this.hover + Math.sin(this.t * 0.8) * 0.05;
  }

  // ---- emerge --------------------------------------------------------------------------------------------------------------------------
  _emerge(dt) {
    const f = this._f;
    const D = 6.4;
    const u = clamp(this.stateT / D);
    const W = G.water;
    if (!f.s) {
      f.s = true;
      this.char.play('idle', { fade: 0.1 });
      this.sfx('bell_under_ice', { volume: 1.0 });
      this.engaged = false;
    }
    // A pale glow spreads beneath like a lantern rising, the ice groans, a hole opens.
    this.glowR = lerp(4, 20, smoothstep(0, 0.7, u));
    this.glowI = lerp(0, 1.0, smoothstep(0, 0.5, u));
    const holeR = lerp(0.1, 3.0, smoothstep(0.28, 0.55, u));
    if (W?.addHole && u > 0.28 && (f.holeT == null || this.stateT - f.holeT > 0.2) && !f.holeDone) {
      f.holeT = this.stateT;
      if (u > 0.55) f.holeDone = true;
      for (const id of this.holeIds) W.removeHole?.(id);
      this.holeIds.length = 0;
      const id = W.addHole(this.position.x, this.position.z, holeR);
      if (id != null && id >= 0) this.holeIds.push(id);
    }
    this.crackTarget = Math.max(this.crackTarget, smoothstep(0.05, 0.6, u) * 0.4);
    if (!f.g1 && u > 0.12) { f.g1 = true; this.sfx('ice_groan', { volume: 1.0, pitch: 0.6 }); G.cameraRig?.shake?.(0.1, 1.5); }
    if (!f.g2 && u > 0.3) { f.g2 = true; this.sfx('ice_crack', { volume: 1.1 }); G.cameraRig?.shake?.(0.2, 1.0); }
    if (!f.g3 && u > 0.5) {
      f.g3 = true;
      this.sfx('splash', { volume: 1.3, pitch: 0.7 });
      this.sfx('ice_crack', { volume: 1.3, pitch: 0.7 });
      G.cameraRig?.shake?.(0.5, 1.2);
      G.postfx?.flash?.(0x9ff5ff, 0.25);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        G.combat?.fx?.chips({ x: this.position.x + Math.sin(a) * 2.4, y: 0.2, z: this.position.z + Math.cos(a) * 2.4 }, { kind: 'ice', count: 10, speed: 4, up: 5 });
      }
      G.combat?.fx?.chips({ x: this.position.x, y: 0.5, z: this.position.z }, { kind: 'frost', count: 40, speed: 6, up: 6 });
      props.fx.burst('snow', [this.position.x, 0.4, this.position.z], { count: 60, speed: 7, up: 2.5, size: 0.35 });
    }
    // Rise: seen faintly through the ice, then bursting out.
    const rise = u < 0.5 ? lerp(-4.6, -1.4, smoothstep(0.1, 0.5, u)) : lerp(-1.4, this.hover, easeOut(smoothstep(0.5, 0.9, u)));
    this.body.position.y = rise;
    this.mzU.uMzFloat.value = 2.4 + 2 * (1 - smoothstep(0.5, 1, u));
    this._lookAtPlayer();
    this.faceTo(dt, this.toPlayer(_tp).yaw, 0.8);
    if (u >= 1) {
      this.invuln = false;
      this.engaged = !this.passive;
      this.go('idle');
      this.cool = 1.6;
      for (const id of this.holeIds) W?.removeHole?.(id);
      this.holeIds.length = 0;
      G.events.emit('boss:emerged', { boss: this });
      this._emergeDone?.(this);
      this._emergeDone = null;
    }
  }

  // ---- body, light, ice, fx (every frame) ---------------------------------------------------------------------------------------------
  _applyBody(dt) {
    // Position and facing.
    this.root.rotation.y = this.heading;
    if (!this.diving && this.state !== 'emerge' && this.state !== 'surface' && this.state !== 'dive') {
      const bob = Math.sin(this.t * 0.9) * 0.1 + Math.sin(this.t * 1.7) * 0.03;
      this.body.position.y += (this.hover + bob - this.body.position.y) * Math.min(1, dt * 4);
    }
    // Hit flash and telegraph glow ride the rim uniform.
    this.flashK = Math.max(0, this.flashK - dt * 8);
    const rim = this.mzU.uMzRim.value;
    const k = this.flashK;
    rim.set(this.baseRim.x + k * 1.2 + this.scream * 0.5, this.baseRim.y + k * 1.0 + this.scream * 0.4, this.baseRim.z + k * 1.0 + this.scream * 0.4, this.baseRim.w);
    this.armor.mat.emissiveIntensity = 1.1 + k * 2.5 + (this.armored ? 0 : 0);
    this.armor.clawMat.emissiveIntensity = 1.6 + this.clawGlow * 3.5 + k;
    this.light.intensity = (4 + this.clawGlow * 6 + this.scream * 8 + k * 6 + this.glowI * 3) * (this.state === 'yield' ? 0.4 : 1);
    this.light.color.setRGB(0.5 + k * 0.4, 0.92, 1.0);
    for (const s of this.eyeGlow) s.scale.setScalar(0.1 + 0.04 * Math.sin(this.t * 3) + this.scream * 0.15 + this.clawGlow * 0.06);
    this.char.root.position.set(this.position.x, this.position.y + this.body.position.y, this.position.z);
    this.char.root.rotation.y = this.heading;
  }

  // The under-ice glow and arena cracks live in the water shader: one slot each.
  fxUpdate(dt) {
    const W = G.water;
    if (this.disposed) return;
    this.spikes.update(dt);
    this.cage.update(dt);
    this.line.update(dt);
    this.claw.update(dt);
    this.cone.update(dt);
    this.armor.update(dt);
    for (let i = this.armorOld.length - 1; i >= 0; i--) { const a = this.armorOld[i]; a.update(dt); if (a.done) { a.dispose(); this.armorOld.splice(i, 1); } }
    if (this.diving || this.state === 'hidden') { /* ribbons hidden */ } else {
      const anchor = _a.set(this.position.x, this.position.y + this.body.position.y + 0.55, this.position.z);
      this.ribbons.update(dt, anchor, this.heading, this.vel2, G.clock.elapsed, 1 + this.scream * 1.2);
    }
    if (W?.setUnderGlow) {
      const gx = this.diving || this.state === 'hunt' || this.state === 'grab_glow' || this.state === 'grab' ? this.underPos.x : this.position.x;
      const gz = this.diving || this.state === 'hunt' || this.state === 'grab_glow' || this.state === 'grab' ? this.underPos.z : this.position.z;
      const base = this.state === 'hidden' ? 0 : this.glowI;
      W.setUnderGlow(gx, gz, this.glowR || 7, this.state === 'yield' ? base * 0.6 : base);
    }
    if (W?.setCracks) {
      this.crack += (this.crackTarget - this.crack) * Math.min(1, dt * 0.25);
      W.setCracks(this.home.x, this.home.z, TUNE.arenaR + 4, this.crack);
    }
    this.clawGlow = Math.max(0, this.clawGlow - dt * 0.3);
  }

  dispose() {
    if (this.disposed) return;
    this.releaseHold();
    const W = G.water;
    for (const id of this.holeIds) W?.removeHole?.(id);
    W?.setUnderGlow?.(0, 0, 1, 0);
    W?.setCracks?.(0, 0, 1, 0);
    G.combat?.setBoss?.(null);
    this.spikes.dispose(); this.cage.dispose(); this.line.dispose(); this.claw.dispose(); this.cone.dispose(); this.ribbons.dispose();
    this.armor.dispose();
    for (const a of this.armorOld) a.dispose();
    this.char.dispose();
    super.dispose();
  }
}

const _a = new THREE.Vector3();
