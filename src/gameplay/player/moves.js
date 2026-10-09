// The player's moveset: sword draw/sheathe, light combo, heavy, dodge and roll, parry and block,
// sign casting, the Thaw draught, taking damage and dying. Hit RESOLUTION lives elsewhere
// (the combat builder listens to 'player:swing' and 'player:cast'); this file owns timing,
// stamina, invulnerability, lunges and the animation clips.
//
// Frame contract: Moves.update(dt, ctx) returns { owns, speedMul, face, noSprint }.
//   owns      an action drives the body this frame (attack, dodge, cast, parry, hurt): skip locomotion
//   speedMul  locomotion speed multiplier while it runs (block, draw, drink)
//   face      yaw to idle toward (lock-on, blocking) or null
//
// Action times below are in CLIP seconds (the clip's own timeline) and divided by the action's
// playback speed to get wall time.
//
// Events (G.events): player:swing { kind, combo, origin, dir, reach, arc, damage, stagger, knockback, target },
// player:cast { sign, origin, dir }, player:dodge { kind, dir }, player:parry { from }, player:block { from, amount },
// player:hit { amount, from, health }, player:death { position }, player:draw / player:sheathe {}, player:drink {}.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, wrapAngle } from '../../core/util.js';
import { spendStamina, spendSign } from './stats.js';
import { enemyPos, assistTarget, isAlive } from './lock.js';

const ATTACKS = {
  light1: { clip: 'attack_1', speed: 1.15, whoosh: 0.14, contact: 0.27, chain: 0.37, end: 0.8, cost: 7, kind: 'light', combo: 1, reach: 2.0, arc: 1.75, dmg: 20, lunge: [0.9, 0.04, 0.27], kb: 0.2 },
  light2: { clip: 'attack_2', speed: 1.15, whoosh: 0.15, contact: 0.29, chain: 0.39, end: 0.85, cost: 7, kind: 'light', combo: 2, reach: 2.1, arc: 1.9, dmg: 22, lunge: [0.9, 0.04, 0.29], kb: 0.2 },
  light3: { clip: 'attack_3', speed: 1.1, whoosh: 0.28, contact: 0.43, chain: null, end: 1.05, cost: 9, kind: 'light', combo: 3, reach: 2.4, arc: 2.5, dmg: 32, lunge: [1.3, 0.1, 0.43], stagger: true, kb: 0.6 },
  heavy: { clip: 'heavy_attack', speed: 1.0, whoosh: 0.5, contact: 0.64, chain: 1.12, end: 1.45, cost: 16, kind: 'heavy', combo: 0, reach: 2.7, arc: 2.3, dmg: 58, lunge: [0.8, 0.46, 0.64], stagger: true, kb: 1.2 },
};

// dist in meters along the dodge direction over `move` clip seconds; iframes in clip seconds.
const DODGES = {
  left: { clip: 'dodge_left', speed: 1.1, dur: 0.6, dist: 2.5, move: [0.04, 0.3], i: [0.03, 0.34], cost: 14, cancel: 0.42, sfx: 'dodge' },
  right: { clip: 'dodge_right', speed: 1.1, dur: 0.6, dist: 2.5, move: [0.04, 0.3], i: [0.03, 0.34], cost: 14, cancel: 0.42, sfx: 'dodge' },
  back: { clip: 'dodge_back', speed: 1.1, dur: 0.6, dist: 2.3, move: [0.04, 0.3], i: [0.03, 0.34], cost: 14, cancel: 0.42, sfx: 'dodge' },
  roll: { clip: 'roll', speed: 1.1, dur: 0.95, dist: 3.4, move: [0.1, 0.8], i: [0.06, 0.62], cost: 18, cancel: 0.7, sfx: 'roll' },
  roll2: { clip: 'roll', speed: 1.1, dur: 0.95, dist: 4.6, move: [0.1, 0.8], i: [0.06, 0.66], cost: 22, cancel: 0.7, sfx: 'roll' },
};

export const SIGNS = {
  ember: { cost: 0.22, sfx: 'sign_ember' },
  gale: { cost: 0.30, sfx: 'sign_gale' },
  ward: { cost: 0.34, sfx: 'sign_ward' },
};

const PARRY = { dur: 0.5, window: [0.04, 0.3], cost: 4 };
const BUFFER = 0.55;
const COMBO_KEEP = 0.3;
const WARD_SECONDS = 12;
const THAW = { heal: 45, warmth: 0.55 };

const _v = new THREE.Vector3();

export class Moves {
  constructor(P) {
    this.P = P;
    this.t = 0;
    this.act = null;
    this.upper = null; // { kind: 'draw' | 'sheathe' | 'drink', t, dur }
    this.blocking = false;
    this.buf = null; // { kind: 'light' | 'heavy', at }
    this.combo = 0;
    this.comboWindow = 0;
    this.mercy = 0;
    this.wardT = 0;
    this.pending = null; // attack queued behind the sword draw
    this.dodgeBuf = null; // time of a dodge press waiting for the recovery window
    this.lastDodgePress = -10;
    this.lastCombat = -100;
    this.out = { owns: false, speedMul: 1, face: null, noSprint: false };
  }

  // ---- queries ---------------------------------------------------------------------------------
  isInvulnerable() {
    const P = this.P;
    if (P.state === 'dead' || P.invulnerable) return true;
    if (this.mercy > 0) return true;
    const a = this.act;
    return !!(a && a.i && a.t >= a.i[0] && a.t <= a.i[1]);
  }
  isParrying() {
    const a = this.act;
    return !!(a && a.kind === 'parry' && a.t >= PARRY.window[0] && a.t <= PARRY.window[1]);
  }
  isBlocking() { return this.blocking; }
  get busy() { return !!this.act; }
  get combatRecent() { return this.t - this.lastCombat < 6; }

  cancelAll({ keepSword = true } = {}) {
    const c = this.P.character;
    if (this.act || this.upper || this.blocking) c.stopUpper(0.05);
    this.act = null;
    this.upper = null;
    this.blocking = false;
    this.buf = null;
    this.dodgeBuf = null;
    this.pending = null;
    this.combo = 0;
    this.comboWindow = 0;
    void keepSword;
  }

  // ---- per frame -------------------------------------------------------------------------------
  update(dt, ctx) {
    const P = this.P, inp = G.input;
    const out = this.out;
    out.owns = false; out.speedMul = 1; out.face = null; out.noSprint = false;
    this.t += dt;
    if (this.mercy > 0) this.mercy -= dt;
    if (this.comboWindow > 0 && !this.act) this.comboWindow -= dt;
    if (this.wardT > 0) {
      this.wardT -= dt;
      if (this.wardT <= 0) G.events.emit('player:ward', { active: false });
    }
    P.ward = this.wardT > 0;
    if (P.state === 'dead') { out.owns = true; return out; }

    const c = P.character;
    const enabled = ctx.enabled;

    // Sign selection works any time the game takes input.
    if (enabled) {
      for (const [act, sign] of [['sign1', 'ember'], ['sign2', 'gale'], ['sign3', 'ward']]) {
        if (inp.pressed(act) && P.sign !== sign) { P.sign = sign; G.events.emit('player:sign', { sign }); G.audio?.sfx?.('ui_select', { volume: 0.3 }); }
      }
    }

    // Draw and drink layers (upper body) run alongside locomotion.
    if (this.upper) {
      this.upper.t += dt;
      if (this.upper.t >= this.upper.dur) this.upper = null;
    }
    if (this.upper) out.speedMul *= this.upper.kind === 'drink' ? 0.8 : 0.85;

    // Queued attack once the blade is in hand.
    if (this.pending && c.swordDrawn && !this.act && enabled) {
      const k = this.pending;
      this.pending = null;
      this.startAttack(k, ctx);
    }

    // Input.
    if (enabled) this._input(dt, ctx);

    // Active action.
    if (this.act) this._tickAct(dt, ctx);
    else this._tickBlock(dt, ctx);

    if (this.act) out.owns = true;
    return out;
  }

  _input(dt, ctx) {
    const P = this.P, inp = G.input, c = P.character;
    if (P.mounted) { if (inp.pressed('potion') && !this.upper) this.drinkPotion(); return; }
    const lmb = inp.pressed('attack') && !ctx.swallowClick;
    const rmb = inp.pressed('heavy') && c.swordDrawn;
    const dodge = inp.pressed('dodge');
    const parry = inp.pressed('parry');

    if (lmb || rmb) {
      const kind = rmb ? 'heavy' : 'light';
      if (!c.swordDrawn) {
        if (lmb) { this.pending = 'light'; if (!this.upper) this.toggleSword(true); }
      } else if (this.act) this.buf = { kind, at: this.t };
      else this.startAttack(kind, ctx);
    }
    if (dodge) {
      const double = this.t - this.lastDodgePress < 0.3;
      this.lastDodgePress = this.t;
      if (this.canStartDodge(double)) this.startDodge(ctx, double);
      else if (this.act) this.dodgeBuf = this.t;
    }
    if (parry) {
      if (!c.swordDrawn) { if (!this.upper) this.toggleSword(true); } else if (this.canStartParry()) this.startParry(ctx);
    }
    if (inp.pressed('draw') && !this.act && !this.upper) this.toggleSword();
    if (inp.pressed('sign') && !this.act) this.startCast(ctx);
    if (inp.pressed('potion') && !this.upper) this.drinkPotion();
  }

  // ---- sword -----------------------------------------------------------------------------------
  toggleSword(draw) {
    const P = this.P, c = P.character;
    const want = draw ?? !c.swordDrawn;
    if (want === c.swordDrawn || this.upper) return;
    this.blocking = false;
    if (want) {
      c.swordKind = c.swordKind || 'steel';
      c.playUpper('draw_sword', { fade: 0.1, onEvent: (ev) => { if (ev === 'sword_draw') { G.audio?.sfx?.('sword_draw'); G.events.emit('player:draw', {}); } } });
      this.upper = { kind: 'draw', t: 0, dur: 1.0 };
    } else {
      c.playUpper('sheathe_sword', { fade: 0.1, onEvent: (ev) => { if (ev === 'sword_sheathe') { G.audio?.sfx?.('sword_sheathe'); G.events.emit('player:sheathe', {}); } } });
      this.upper = { kind: 'sheathe', t: 0, dur: 1.1 };
    }
  }

  // ---- attacks ---------------------------------------------------------------------------------
  _aim(ctx) {
    const P = this.P;
    const pos = P.position;
    let target = P.target && isAlive(P.target) ? P.target : null;
    let yaw;
    if (target) {
      const p = enemyPos(target);
      yaw = Math.atan2(p.x - pos.x, p.z - pos.z);
    } else {
      yaw = ctx.mag > 0.1 ? Math.atan2(ctx.dirX, ctx.dirZ) : P.loco.yaw;
      target = assistTarget(pos, yaw);
      if (target) { const p = enemyPos(target); yaw = Math.atan2(p.x - pos.x, p.z - pos.z); }
    }
    return { yaw, target };
  }

  startAttack(kind, ctx) {
    const P = this.P, c = P.character;
    if (!c.swordDrawn || P.state === 'dead') return false;
    let id;
    if (kind === 'heavy') id = 'heavy';
    else {
      const prev = this.act?.kind === 'attack' ? this.act.def.combo : this.comboWindow > 0 ? this.combo : 0;
      id = 'light' + ((prev % 3) + 1);
    }
    const def = ATTACKS[id];
    if (!spendStamina(P, def.cost)) { this.buf = null; return false; }
    const { yaw, target } = this._aim(ctx);
    const chained = !!this.act;
    c.stopUpper(0.06);
    this.upper = null;
    this.blocking = false;
    P.loco.vel.set(0, 0, 0);
    P.loco.speed = 0;
    c.play(def.clip, { speed: def.speed, fade: chained ? 0.07 : 0.1 });
    let lunge = def.lunge[0];
    let tdist = 0;
    if (target) {
      const p = enemyPos(target);
      tdist = Math.hypot(p.x - P.position.x, p.z - P.position.z);
      lunge = clamp(tdist - (target.radius ?? 0.5) - 0.85, 0, def.lunge[0] * 1.7);
    } else if (kind === 'heavy') lunge *= 0.6;
    this.act = { kind: 'attack', id, def, t: 0, speed: def.speed, yaw, target, tdist, lunge, lunged: 0, whooshed: false, contact: false };
    this.buf = null;
    this.combo = def.combo;
    this.comboWindow = 0;
    this.lastCombat = this.t;
    return true;
  }

  _emitSwing(a) {
    const P = this.P, def = a.def;
    const yaw = P.loco.yaw;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const origin = new THREE.Vector3(P.position.x, P.position.y + 1.25, P.position.z).addScaledVector(dir, 0.25);
    G.events.emit('player:swing', {
      kind: def.kind, combo: def.combo, origin, dir, reach: def.reach, arc: def.arc,
      damage: Math.round(def.dmg * P.damageMult), stagger: !!def.stagger, knockback: def.kb, target: a.target || null,
    });
  }

  _tickAttack(a, dt, ctx) {
    const P = this.P, def = a.def, loco = P.loco;
    this.lastCombat = this.t;
    if (a.target && isAlive(a.target)) {
      const p = enemyPos(a.target);
      if (a.t < def.contact) a.yaw = Math.atan2(p.x - P.position.x, p.z - P.position.z);
    }
    if (a.t < def.contact + 0.04) loco.faceToward(a.yaw, 20, dt);
    // Lunge toward the target (or forward) between the wind-up and the contact frame.
    if (a.lunge > 0.01 && a.t > def.lunge[1]) {
      const u = clamp((a.t - def.lunge[1]) / (def.lunge[2] - def.lunge[1]));
      const want = a.lunge * (u * u * (3 - 2 * u));
      const d = want - a.lunged;
      if (d > 1e-4) { loco.move(Math.sin(loco.yaw) * d, Math.cos(loco.yaw) * d); a.lunged = want; }
    }
    if (!a.whooshed && a.t >= def.whoosh) {
      a.whooshed = true;
      G.audio?.sfx?.(def.kind === 'heavy' ? 'sword_whoosh_heavy' : 'sword_whoosh', { volume: 0.8, pitch: 0.95 + Math.random() * 0.1 });
      if (def.kind === 'heavy' || def.combo === 3) G.audio?.sfx?.('vesna_effort', { volume: 0.55 });
    }
    if (!a.contact && a.t >= def.contact) {
      a.contact = true;
      this._emitSwing(a);
      if (def.kind === 'heavy') G.cameraRig?.shake?.(0.18, 0.2);
    }
    // Chain the buffered attack. (Dodge and parry cancels are handled in _input via canStartDodge.)
    const chainAt = def.chain ?? def.end;
    if (a.t >= chainAt && this.buf && this.t - this.buf.at < BUFFER) {
      const k = this.buf.kind;
      this.buf = null;
      if (this.startAttack(k, ctx)) return;
    }
    if (a.t >= def.end) {
      this.act = null;
      this.comboWindow = def.id === 'heavy' || def.combo === 3 ? 0 : COMBO_KEEP;
      if (def.combo === 3 || def.kind === 'heavy') this.combo = 0;
      // A press during the last bit of recovery still counts.
      if (this.buf && this.t - this.buf.at < BUFFER && ctx.enabled) { const k = this.buf.kind; this.buf = null; this.startAttack(k, ctx); }
    }
  }

  // ---- dodge and roll ---------------------------------------------------------------------------
  canStartDodge(double) {
    const a = this.act;
    if (this.P.state === 'dead' || this.P.mounted) return false;
    if (!a) return true;
    if (a.kind === 'attack') return a.contact && a.t >= a.def.contact + 0.07;
    if (a.kind === 'dodge') return (double && a.id !== 'roll2' && a.t < 0.32) || a.t >= a.def.cancel;
    if (a.kind === 'parry') return a.t >= 0.2;
    if (a.kind === 'cast') return a.cast && a.t >= 0.5;
    if (a.kind === 'hurt') return a.t >= 0.3 && a.clip === 'hit_react';
    return false;
  }

  startDodge(ctx, double = false) {
    const P = this.P, c = P.character, pos = P.position;
    const target = P.target && isAlive(P.target) ? P.target : null;
    let faceYaw = P.loco.yaw;
    if (target) { const p = enemyPos(target); faceYaw = Math.atan2(p.x - pos.x, p.z - pos.z); }
    let dx, dz;
    if (ctx.mag > 0.1) { dx = ctx.dirX; dz = ctx.dirZ; } else { dx = -Math.sin(faceYaw); dz = -Math.cos(faceYaw); }
    const yawD = Math.atan2(dx, dz);
    const a = wrapAngle(yawD - faceYaw);
    let id;
    if (double) id = 'roll2';
    else if (Math.abs(a) < 0.7) id = 'roll';
    else if (Math.abs(a) > 2.45) id = 'back';
    else id = a > 0 ? 'left' : 'right';
    const def = DODGES[id];
    const upgrade = this.act?.kind === 'dodge' && double;
    if (!spendStamina(P, upgrade ? def.cost - this.act.def.cost : def.cost)) return false;
    c.stopUpper(0.04);
    this.upper = null;
    this.blocking = false;
    this.pending = null;
    const isRoll = id === 'roll' || id === 'roll2';
    // Rolls go where the stick points; sidesteps keep facing the threat.
    const yaw = isRoll ? yawD : faceYaw;
    if (isRoll) P.loco.yaw = wrapAngle(yawD);
    else if (target) P.loco.yaw = wrapAngle(faceYaw);
    c.play(def.clip, { speed: def.speed, fade: 0.05 });
    const ice = P.loco.surface === 'ice' ? 1.3 : 1;
    this.act = { kind: 'dodge', id, def, t: 0, speed: def.speed, i: def.i, dx, dz, moved: 0, yaw, dist: def.dist * ice, roll: isRoll };
    this.buf = null;
    this.lastCombat = this.t;
    G.audio?.sfx?.(def.sfx, { volume: 0.7 });
    G.events.emit('player:dodge', { kind: id, dir: new THREE.Vector3(dx, 0, dz) });
    return true;
  }

  _tickDodge(a, dt, ctx) {
    const P = this.P, def = a.def, loco = P.loco;
    const u = clamp((a.t - def.move[0]) / (def.move[1] - def.move[0]));
    const e = a.roll ? u * u * (3 - 2 * u) : 1 - (1 - u) * (1 - u);
    const want = a.dist * e;
    const d = want - a.moved;
    if (d > 1e-5) { loco.move(a.dx * d, a.dz * d); a.moved = want; }
    // Keep the facing: a sidestep holds its stance, a roll its heading.
    loco.faceToward(a.yaw, 30, dt);
    loco.vel.set(a.dx * (1 - u) * 2, 0, a.dz * (1 - u) * 2);
    // Chaining into another dodge (or the double-tap upgrade to a roll) is decided in _input.
    void ctx;
    if (a.t >= def.dur) { this.act = null; loco.vel.set(0, 0, 0); }
  }

  // ---- parry and block ---------------------------------------------------------------------------
  canStartParry() {
    const a = this.act;
    if (this.P.state === 'dead' || this.P.mounted) return false;
    if (!a) return true;
    if (a.kind === 'attack') return a.contact && a.t >= a.def.contact + 0.12;
    if (a.kind === 'dodge') return a.t >= a.def.cancel;
    return false;
  }

  startParry(ctx) {
    const P = this.P, c = P.character;
    if (!spendStamina(P, PARRY.cost)) return false;
    c.stopUpper(0.04);
    this.upper = null;
    this.blocking = false;
    const { yaw } = this._aim(ctx);
    P.loco.vel.set(0, 0, 0);
    P.loco.speed = 0;
    this.act = { kind: 'parry', t: 0, speed: 1, yaw, dur: PARRY.dur };
    c.play('parry', { fade: 0.04 });
    this.lastCombat = this.t;
    return true;
  }

  _tickParry(a, dt, ctx) {
    const P = this.P;
    if (a.t < 0.12) P.loco.faceToward(a.yaw, 14, dt);
    if (a.t >= a.dur) {
      this.act = null;
      if (ctx.enabled && G.input.down('parry')) this._startBlock();
    }
  }

  _startBlock() {
    const c = this.P.character;
    if (this.blocking || !c.swordDrawn) return;
    this.blocking = true;
    c.playUpper('block_idle', { loop: true, fade: 0.12 });
  }

  _tickBlock(dt, ctx) {
    const P = this.P, out = this.out;
    if (!ctx.enabled) { if (this.blocking) { this.blocking = false; P.character.stopUpper(0.1); } return; }
    const held = G.input.down('parry');
    if (held && !this.blocking && !this.upper && P.character.swordDrawn) this._startBlock();
    if (!held && this.blocking) { this.blocking = false; P.character.stopUpper(0.15); }
    if (this.blocking) {
      out.speedMul *= 0.5;
      out.noSprint = true;
      out.face = this._faceYaw(ctx);
      this.lastCombat = this.t;
    }
  }

  _faceYaw(ctx) {
    const P = this.P;
    if (P.target && isAlive(P.target)) { const p = enemyPos(P.target); return Math.atan2(p.x - P.position.x, p.z - P.position.z); }
    return ctx.camYaw;
  }

  // ---- signs -------------------------------------------------------------------------------------
  startCast(ctx) {
    const P = this.P, c = P.character;
    if (P.state === 'dead' || P.mounted) return false;
    const sign = P.sign;
    const def = SIGNS[sign];
    if (P.signEnergy < def.cost - 1e-4) {
      G.audio?.sfx?.('ui_hover', { volume: 0.4 });
      G.events.emit('player:sign_fail', { sign });
      return false;
    }
    spendSign(P, def.cost);
    c.stopUpper(0.05);
    this.upper = null;
    this.blocking = false;
    const yaw = this._faceYaw(ctx);
    P.loco.vel.set(0, 0, 0);
    P.loco.speed = 0;
    this.act = { kind: 'cast', t: 0, speed: 1, yaw, sign, def, cast: false, dur: 0.85 };
    c.play('cast_sign', { fade: 0.08 });
    this.lastCombat = this.t;
    return true;
  }

  _tickCast(a, dt) {
    const P = this.P;
    if (a.t < 0.35) P.loco.faceToward(a.yaw, 16, dt);
    if (!a.cast && a.t >= 0.3) {
      a.cast = true;
      const yaw = P.loco.yaw;
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const origin = new THREE.Vector3(P.position.x, P.position.y + 1.3, P.position.z).addScaledVector(dir, 0.5);
      if (P.target && isAlive(P.target)) {
        const p = enemyPos(P.target, _v);
        dir.set(p.x - origin.x, p.y + (P.target.height ?? 1.2) * 0.5 - origin.y, p.z - origin.z).normalize();
      }
      if (a.sign === 'ward') {
        this.wardT = WARD_SECONDS;
        G.events.emit('player:ward', { active: true, seconds: WARD_SECONDS });
      }
      G.audio?.sfx?.(a.def.sfx, { volume: 0.9 });
      G.events.emit('player:cast', { sign: a.sign, origin, dir, power: P.signPower ?? 1 });
    }
    if (a.t >= a.dur) this.act = null;
  }

  // ---- Thaw --------------------------------------------------------------------------------------
  drinkPotion() {
    const P = this.P, c = P.character;
    if (P.state === 'dead' || this.act) return false;
    if (!G.state || G.state.count('thaw') <= 0) { G.ui?.notify?.('No Thaw draught left', 'info'); return false; }
    if (P.health >= P.maxHealth - 1 && P.warmth > 0.95) { G.ui?.notify?.('You do not need it yet', 'info'); return false; }
    this.blocking = false;
    c.stopUpper(0.04);
    c.playUpper('drink_potion', {
      fade: 0.15,
      onEvent: (ev) => {
        if (ev !== 'drink') return;
        if (!G.state.take('thaw', 1)) return;
        P.heal(THAW.heal);
        P.warmth = clamp(P.warmth + THAW.warmth);
        G.audio?.sfx?.('potion_drink', { volume: 0.8 });
        G.events.emit('player:drink', { item: 'thaw' });
      },
    });
    this.upper = { kind: 'drink', t: 0, dur: 1.7 };
    return true;
  }

  // ---- damage ------------------------------------------------------------------------------------
  // Returns { result: 'hit' | 'parried' | 'blocked' | 'guardbreak' | 'ward' | 'dodged' | 'dead' | 'ignored', dealt }.
  hurt(amount, o = {}) {
    const P = this.P, c = P.character;
    if (P.state === 'dead') return { result: 'dead', dealt: 0 };
    if (!P.control && !o.force) return { result: 'ignored', dealt: 0 };
    if (this.isInvulnerable()) return { result: 'dodged', dealt: 0 };
    const from = o.from;
    const fp = from ? (from.isVector3 ? from : from.position || from.root?.position || from) : null;
    // Is the attacker in front of her? Parry and block only cover a frontal arc.
    let front = true;
    let ax = 0, az = 0;
    if (fp && fp.x != null) {
      ax = fp.x - P.position.x; az = fp.z - P.position.z;
      const d = Math.hypot(ax, az);
      if (d > 1e-3) { ax /= d; az /= d; front = ax * Math.sin(P.loco.yaw) + az * Math.cos(P.loco.yaw) > 0.2; }
    }
    if (P.mounted) return this._hurtMounted(amount, o, ax, az);
    if (this.isParrying() && front) {
      G.audio?.sfx?.('parry');
      G.events.emit('player:parry', { from });
      G.cameraRig?.shake?.(0.22, 0.18);
      if (from && typeof from.onParried === 'function') from.onParried(P);
      P.stamina = Math.min(P.maxStamina, P.stamina + 8);
      return { result: 'parried', dealt: 0 };
    }
    if (P.ward) {
      this.wardT = 0;
      G.audio?.sfx?.('ward_hit');
      G.events.emit('player:ward', { active: false, absorbed: true });
      G.cameraRig?.shake?.(0.15, 0.15);
      return { result: 'ward', dealt: 0 };
    }
    if (this.blocking && front) {
      const cost = 9 + amount * 0.7;
      if (P.stamina >= cost) {
        spendStamina(P, cost);
        const dealt = amount * 0.12;
        P.health = Math.max(1, P.health - dealt);
        G.audio?.sfx?.('block');
        G.events.emit('player:block', { from, amount });
        G.cameraRig?.shake?.(0.2, 0.18);
        if (o.knockback) P.loco.move(-ax * Math.min(o.knockback, 0.5), -az * Math.min(o.knockback, 0.5));
        return { result: 'blocked', dealt };
      }
      // Guard broken: she takes a share and staggers.
      this.blocking = false;
      c.stopUpper(0.05);
      return this._takeHit(amount * 0.6, { ...o, stagger: true }, ax, az, 'guardbreak');
    }
    return this._takeHit(amount, o, ax, az, 'hit');
  }

  _hurtMounted(amount, o, ax, az) {
    const P = this.P;
    P.health = Math.max(0, P.health - amount);
    G.audio?.sfx?.('vesna_hurt', { volume: 0.8 });
    G.events.emit('player:hit', { amount, from: o.from, health: P.health });
    G.cameraRig?.shake?.(0.3, 0.25);
    this.mercy = 0.4;
    void ax; void az;
    if (P.health <= 0) { P.dismountInstant?.(); this.die(); return { result: 'dead', dealt: amount }; }
    return { result: 'hit', dealt: amount };
  }

  _takeHit(amount, o, ax, az, result) {
    const P = this.P, c = P.character;
    P.health = Math.max(0, P.health - amount);
    G.audio?.sfx?.('vesna_hurt', { volume: 0.8 });
    G.events.emit('player:hit', { amount, from: o.from, health: P.health });
    G.cameraRig?.shake?.(Math.min(0.5, 0.22 + amount * 0.006), 0.28);
    G.postfx?.flash?.(0xff3b2a, 0.14);
    this.lastCombat = this.t;
    if (P.health <= 0) { this.die(); return { result: 'dead', dealt: amount }; }
    const stagger = !!o.stagger || amount >= 30;
    c.stopUpper(0.04);
    this.upper = null;
    this.blocking = false;
    this.pending = null;
    this.buf = null;
    this.combo = 0;
    const clip = stagger ? 'stagger' : 'hit_react';
    const kb = o.knockback ?? (stagger ? 1.2 : 0.45);
    this.act = { kind: 'hurt', t: 0, speed: 1, clip, dur: stagger ? 1.3 : 0.55, kbx: -ax * kb, kbz: -az * kb, kbDone: 0 };
    c.play(clip, { fade: 0.04 });
    this.mercy = stagger ? 0.9 : 0.5;
    return { result, dealt: amount };
  }

  _tickHurt(a) {
    // Slide away from the blow over the first 0.25 s.
    const u = clamp(a.t / 0.25);
    const e = 1 - (1 - u) * (1 - u);
    const d = e - a.kbDone;
    if (d > 1e-4) { this.P.loco.move(a.kbx * d, a.kbz * d); a.kbDone = e; }
    this.P.loco.vel.set(0, 0, 0);
    if (a.t >= a.dur) this.act = null;
  }

  die() {
    const P = this.P, c = P.character;
    if (P.state === 'dead') return;
    P.health = 0;
    this.act = null;
    this.upper = null;
    this.blocking = false;
    this.buf = null;
    this.pending = null;
    P.dead = true;
    P.state = 'dead';
    P.loco.vel.set(0, 0, 0);
    c.stopUpper(0.04);
    c.play('death', { fade: 0.06 });
    G.audio?.sfx?.('vesna_death');
    G.audio?.stinger?.('death');
    G.events.emit('player:death', { position: P.position.clone() });
    P._deadT = 0;
  }

  _tickAct(dt, ctx) {
    const a = this.act;
    a.t += dt * a.speed;
    switch (a.kind) {
      case 'attack': this._tickAttack(a, dt, ctx); break;
      case 'dodge': this._tickDodge(a, dt, ctx); break;
      case 'parry': this._tickParry(a, dt, ctx); break;
      case 'cast': this._tickCast(a, dt); break;
      case 'hurt': this._tickHurt(a); break;
      default: this.act = null;
    }
    if (this.act && this.dodgeBuf != null && ctx.enabled) {
      if (this.t - this.dodgeBuf > 0.4) this.dodgeBuf = null;
      else if (this.canStartDodge(false)) { this.dodgeBuf = null; this.startDodge(ctx, false); }
    }
  }
}
