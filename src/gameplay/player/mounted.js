// Fighting from the saddle: the sword drawn on Kasza, a swing to the side the target or the camera is on, and what a bite
// or a heavy blow does to a rider. Owned by Moves (player/moves.js) as `moves.ride`; the hit itself is resolved by the
// combat module from the same 'player:swing' event the on-foot blows emit.
//
//   ride.start(kind, ctx)       begin a light or heavy swing (stamina, side, clip); false when she cannot
//   ride.tick(act, dt, ctx)     the swing's timing: whoosh, the blow at the 'hit' event of the clip, the chain, the end
//   ride.update(dt)             keeps the sword hand in its ready pose while she rides with the blade out
//   ride.hurt(amount, o, ax, az)   damage while mounted: health, a heavy blow or a bite while she is winded throws her
//   ride.aim() -> { side, target, dir }   which way the next swing goes
//   ride.stop()                 drop the ready pose (dismounting, scenes)
//
// Which side: the locked target's side; else the nearest enemy beside the horse in front of the camera; else the side the
// camera is on (the side of the horse it looks at, or the shoulder it hangs over when it is directly behind). A rider
// swinging toward the camera is the one swing the player can see.
// Damage grows a little with the horse's speed (up to 35 percent at a gallop), and a gallop blow staggers.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp } from '../../core/util.js';
import { spendStamina } from './stats.js';
import { candidates, enemyPos, isAlive } from './lock.js';

export const RIDE_TUNE = {
  speedBonus: 0.35, // extra damage at a full gallop
  gallop: 9.2,
  staggerSpeed: 6.2, // a blow struck faster than this staggers
  unseatDamage: 16, // a single blow this heavy throws her
  unseatKnockback: 1.2,
  unseatStamina: 20, // a bite while she has less than this left throws her
  mercy: 2.6, // seconds of grace while she falls
};

const SWINGS = {
  light: { clips: ['ride_slash_l', 'ride_slash_r'], speed: 1, whoosh: 0.15, contact: 0.27, chain: 0.4, end: 0.62, cost: 6, kind: 'light', reach: 2.35, arc: 2.6, dmg: 19, kb: 0.35 },
  heavy: { clips: ['ride_chop_l', 'ride_chop_r'], speed: 1, whoosh: 0.38, contact: 0.53, chain: 0.95, end: 1.0, cost: 14, kind: 'heavy', reach: 2.7, arc: 2.8, dmg: 40, kb: 1.2, stagger: true },
};
const BUFFER = 0.55;
const _o = new THREE.Vector3();

export class RideCombat {
  constructor(moves) {
    this.moves = moves;
    this.P = moves.P;
  }

  // ---- which way --------------------------------------------------------------------------------------------------
  cameraSide() {
    const H = G.horse, cam = G.camera.position, h = H.yaw;
    const lat = (cam.x - H.position.x) * Math.cos(h) - (cam.z - H.position.z) * Math.sin(h);
    if (Math.abs(lat) > 0.3) return lat > 0 ? 1 : -1;
    return G.settings?.shoulder === 'left' ? 1 : -1;
  }

  aim() {
    const P = this.P, H = G.horse, hp = H.position, h = H.yaw;
    const lx = Math.cos(h), lz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    let target = P.target && isAlive(P.target) ? P.target : null;
    if (!target) {
      // the nearest enemy within reach of either flank that is in front of the camera
      const camYaw = G.cameraRig ? G.cameraRig.yaw : h;
      const list = candidates(hp, camYaw, 4.6, -0.6);
      if (list.length) target = list[0].e;
    }
    let side = 0, dx, dz;
    if (target) {
      const p = enemyPos(target, _o);
      const ex = p.x - hp.x, ez = p.z - hp.z;
      const lat = ex * lx + ez * lz;
      side = Math.abs(lat) < 0.25 ? this.cameraSide() : lat > 0 ? 1 : -1;
      dx = p.x - (hp.x + side * lx * 0.5);
      dz = p.z - (hp.z + side * lz * 0.5);
    } else {
      side = this.cameraSide();
      dx = side * lx * 0.9 + fx * 0.4;
      dz = side * lz * 0.9 + fz * 0.4;
    }
    const l = Math.hypot(dx, dz) || 1;
    return { side, target, dx: dx / l, dz: dz / l };
  }

  // ---- the swing --------------------------------------------------------------------------------------------------
  start(kind) {
    const P = this.P, M = this.moves, c = P.character;
    if (!c.swordDrawn || P.state === 'dead' || !G.horse) return false;
    const def = SWINGS[kind === 'heavy' ? 'heavy' : 'light'];
    if (!spendStamina(P, def.cost)) { M.buf = null; return false; }
    const aim = this.aim();
    const clip = def.clips[aim.side > 0 ? 0 : 1];
    M.upper = null;
    M.blocking = false;
    c.playUpper(clip, { fade: 0.06, speed: def.speed });
    M.act = {
      kind: 'attack', mounted: true, id: `ride_${def.kind}_${aim.side > 0 ? 'l' : 'r'}`, def, t: 0, speed: def.speed,
      side: aim.side, target: aim.target, dx: aim.dx, dz: aim.dz, whooshed: false, contact: false,
    };
    M.buf = null;
    M.comboWindow = 0;
    M.lastCombat = M.t;
    return true;
  }

  tick(a, dt, ctx) {
    const M = this.moves, def = a.def, H = G.horse;
    M.lastCombat = M.t;
    // follow the target with the blow until it lands
    if (a.t < def.contact && a.target && isAlive(a.target)) {
      const p = enemyPos(a.target, _o);
      const lx = Math.cos(H.yaw), lz = -Math.sin(H.yaw);
      const dx = p.x - (H.position.x + a.side * lx * 0.5), dz = p.z - (H.position.z + a.side * lz * 0.5);
      const l = Math.hypot(dx, dz) || 1;
      a.dx = dx / l; a.dz = dz / l;
    }
    if (!a.whooshed && a.t >= def.whoosh) {
      a.whooshed = true;
      G.audio?.sfx?.(def.kind === 'heavy' ? 'sword_whoosh_heavy' : 'sword_whoosh', { volume: 0.8, pitch: 0.95 + Math.random() * 0.1 });
      if (def.kind === 'heavy') G.audio?.sfx?.('vesna_effort', { volume: 0.55 });
    }
    if (!a.contact && a.t >= def.contact) {
      a.contact = true;
      this._emit(a);
      if (def.kind === 'heavy') G.cameraRig?.shake?.(0.18, 0.2);
    }
    if (a.t >= def.chain && M.buf && M.t - M.buf.at < BUFFER) {
      const k = M.buf.kind;
      M.buf = null;
      if (this.start(k)) return;
    }
    if (a.t >= def.end) {
      M.act = null;
      if (M.buf && M.t - M.buf.at < BUFFER && ctx.enabled) { const k = M.buf.kind; M.buf = null; this.start(k); }
    }
  }

  _emit(a) {
    const P = this.P, H = G.horse, def = a.def;
    const lx = Math.cos(H.yaw), lz = -Math.sin(H.yaw), fx = Math.sin(H.yaw), fz = Math.cos(H.yaw);
    // the hand, out beside the saddle; high enough that the blow meets a wolf (the creature test is vertical overlap)
    const origin = new THREE.Vector3(H.position.x + a.side * lx * 0.5 + fx * 0.2, H.position.y + 1.2, H.position.z + a.side * lz * 0.5 + fz * 0.2);
    const dir = new THREE.Vector3(a.dx, 0, a.dz);
    const k = clamp(H.speed / RIDE_TUNE.gallop);
    G.events.emit('player:swing', {
      kind: def.kind, combo: 0, origin, dir, reach: def.reach, arc: def.arc,
      damage: Math.round(def.dmg * (1 + RIDE_TUNE.speedBonus * k) * P.damageMult),
      stagger: !!def.stagger || H.speed > RIDE_TUNE.staggerSpeed,
      knockback: def.kb * (1 + 0.6 * k), target: a.target || null, mounted: true, speed: H.speed,
    });
  }

  // ---- ready pose -------------------------------------------------------------------------------------------------
  update() {
    const P = this.P, M = this.moves, c = P.character;
    if (!P.mounted || !c.swordDrawn || !P.control || M.act || M.upper || P.dead) return;
    const an = c.anim;
    const top = an.upper[an.upper.length - 1];
    if (top && top.clip.name === 'ride_ready' && an.upperOn) return;
    c.playUpper('ride_ready', { loop: true, fade: 0.3 });
  }

  stop() {
    const c = this.P.character;
    const top = c.anim.upper[c.anim.upper.length - 1];
    if (top && top.clip.name === 'ride_ready') c.stopUpper(0.15);
  }

  // ---- damage while mounted ---------------------------------------------------------------------------------------
  // Every hit costs health. A heavy blow (a scarred alpha, a bear, the boss), or any hit while she is winded, throws her
  // out of the saddle: Kasza bolts a few metres and can be whistled back.
  hurt(amount, o, ax, az) {
    const P = this.P, M = this.moves;
    P.health = Math.max(0, P.health - amount);
    G.audio?.sfx?.('vesna_hurt', { volume: 0.8 });
    G.events.emit('player:hit', { amount, from: o.from, health: P.health });
    G.cameraRig?.shake?.(0.3, 0.25);
    M.mercy = 0.4;
    if (P.health <= 0) { P.dismountInstant?.(); M.die(); return { result: 'dead', dealt: amount }; }
    const heavy = !!o.stagger || amount >= RIDE_TUNE.unseatDamage || (o.knockback ?? 0) >= RIDE_TUNE.unseatKnockback;
    const winded = P.stamina < RIDE_TUNE.unseatStamina;
    if ((heavy || winded) && G.horse?.throwRider) {
      M.mercy = RIDE_TUNE.mercy;
      G.horse.throwRider({ ax, az, from: o.from, heavy });
    }
    return { result: 'hit', dealt: amount };
  }
}
