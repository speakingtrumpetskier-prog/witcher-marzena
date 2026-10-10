// On-foot locomotion: camera-relative input to a facing, a velocity and a position.
//
// Vesna's clips only walk forward, so the body always moves along its facing: input turns the
// facing (fast, rate-limited, slower on ice), and the wanted speed is scaled by how well the
// facing already matches the input. A sharp reversal therefore decelerates, pivots, then
// accelerates again. The velocity vector chases facing * speed with surface-dependent grip:
// snow and roads are crisp, ice has long inertia and a slight slide.
//
//   loco.update(dt, { dirX, dirZ, mag, sprint, speedMul, face, turnMul, strafe })   strafe: locked on, face is the target
//   loco.move(dx, dz)        displace with steep-slope blocking, world bounds and collision (dodges, lunges)
//   loco.yaw, loco.vel, loco.speed, loco.surface, loco.walk, loco.sprinting
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { WORLD } from '../../world/layout.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../../core/util.js';
import { slopeAt, moveFactor, blocked, surfaceInfo, groundY, surfaceAt } from './ground.js';
import { liveEnemies, enemyPos } from './lock.js';

// Reference speeds in m/s for a leg scale of 1; the animator blends walk -> run -> sprint
// at 1.3 / 3.57 / 6.0 and sets its playback rate from speed, so feet do not slide.
export const SPEED = { walk: 1.45, run: 3.85, sprint: 6.2 };
export const RADIUS = 0.38;
// Locked on, her speed against what she would run at: sideways and backwards (the clips in clips/strafe.js are cut for these).
export const STRAFE = { side: 0.84, back: 0.62 };

export class Locomotion {
  constructor(P) {
    this.P = P;
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.yaw = 0;
    this.yawRate = 0;
    this.surface = 'snow';
    this.sprinting = false;
    this.walk = false;
    this.grounded = true;
    this._surfT = 0;
    this._slope = {};
    this._slope2 = {};
  }

  reset(yaw) {
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.sprinting = false;
    this.yawRate = 0;
    if (yaw !== undefined) this.yaw = yaw;
    this._surfT = 0;
  }

  get legScale() {
    return this.P.character?.anim?.legScale ?? 1;
  }

  refreshSurface() {
    const p = this.P.position;
    this.surface = surfaceAt(p.x, p.z);
    this.P.surface = this.surface;
    this._surfT = 0.12;
  }

  update(dt, o) {
    const P = this.P, pos = P.position;
    if ((this._surfT -= dt) <= 0) this.refreshSurface();
    const surf = surfaceInfo(this.surface);
    const ls = this.legScale;
    const has = o.mag > 0.08;

    // Facing. Idle facing (lock-on, blocking) only applies when almost standing still. Locked on (strafe), the body
    // always faces the target and the feet go where the stick points.
    const strafe = !!o.strafe && o.face != null;
    let wantYaw = null;
    if (strafe) wantYaw = o.face;
    else if (has) wantYaw = Math.atan2(o.dirX, o.dirZ);
    else if (o.face != null && this.speed < 0.6) wantYaw = o.face;
    const prevYaw = this.yaw;
    let cosErr = 1;
    if (wantYaw !== null) {
      const err = wrapAngle(wantYaw - this.yaw);
      const rate = lerp(13, 7.5, clamp(this.speed / (SPEED.sprint * ls))) * surf.turn * (o.turnMul ?? 1);
      this.yaw = wrapAngle(this.yaw + clamp(err * Math.min(1, dt * 11), -rate * dt, rate * dt));
      cosErr = Math.cos(wrapAngle(wantYaw - this.yaw));
    }
    this.yawRate = dt > 0 ? wrapAngle(this.yaw - prevYaw) / dt : 0;

    // Wanted speed.
    let base = 0;
    if (has) {
      if (o.sprint) base = SPEED.sprint;
      else if (this.walk) base = SPEED.walk;
      else base = o.mag < 0.5 ? SPEED.walk * (o.mag / 0.5) : lerp(SPEED.walk, SPEED.run, (o.mag - 0.5) / 0.5);
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // The way she moves: along her facing, or (locked on) wherever the stick points, a little slower sideways and
    // slower again backwards.
    const gx = strafe && has ? o.dirX : fx, gz = strafe && has ? o.dirZ : fz;
    const dirX = this.speed > 0.3 ? this.vel.x / this.speed : gx;
    const dirZ = this.speed > 0.3 ? this.vel.z / this.speed : gz;
    const slope = slopeAt(pos.x, pos.z, dirX, dirZ, this._slope);
    let align = has ? smoothstep(-0.25, 0.7, cosErr) : 0;
    if (strafe) {
      const rel = Math.cos(wrapAngle(Math.atan2(o.dirX, o.dirZ) - wantYaw));
      align = has ? (rel >= 0 ? lerp(STRAFE.side, 1, rel) : lerp(STRAFE.side, STRAFE.back, -rel)) : 0;
    }
    const target = base * ls * (o.speedMul ?? 1) * surf.mul * moveFactor(slope) * align;
    this.sprinting = !strafe && !!o.sprint && has && target > SPEED.run * ls;

    // Chase the wanted velocity with surface grip.
    const wx = gx * target, wz = gz * target;
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const lim = (target > this.speed + 0.05 ? surf.acc : surf.dec) * dt;
    if (dl > lim) { this.vel.x += (dvx / dl) * lim; this.vel.z += (dvz / dl) * lim; } else { this.vel.x = wx; this.vel.z = wz; }
    // Ice keeps a little of the old heading when you turn: nothing to add, the vector chase already slides.

    // Move.
    const ox = pos.x, oz = pos.z;
    const mx = this.vel.x * dt, mz = this.vel.z * dt;
    if (mx !== 0 || mz !== 0) {
      this.move(mx, mz);
      const ax = pos.x - ox, az = pos.z - oz;
      // Blocked by a wall or steep rock: let the velocity reflect what actually happened.
      if (Math.hypot(ax - mx, az - mz) > 1e-4 && dt > 0) {
        this.vel.x = lerp(this.vel.x, ax / dt, 0.6);
        this.vel.z = lerp(this.vel.z, az / dt, 0.6);
      }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed < 0.02 && !has) { this.vel.x = 0; this.vel.z = 0; this.speed = 0; }
    P.velocity.set(this.vel.x, 0, this.vel.z);
  }

  // Displace with steep-slope blocking, the playable bounds and static colliders. Returns the
  // distance actually moved.
  move(dx, dz) {
    const pos = this.P.position;
    const len = Math.hypot(dx, dz);
    if (len < 1e-7) return 0;
    const s = slopeAt(pos.x, pos.z, dx / len, dz / len, this._slope2);
    if (blocked(s)) {
      const comp = dx * s.ux + dz * s.uz;
      dx -= comp * s.ux;
      dz -= comp * s.uz;
    }
    const ox = pos.x, oy = pos.y, oz = pos.z;
    const B = WORLD.playable;
    const nx = clamp(ox + dx, -B, B), nz = clamp(oz + dz, -B, B);
    pos.set(nx, groundY(nx, nz, oy), nz);
    G.physics.resolve(pos, RADIUS);
    this._pushOutOfBodies(pos);
    pos.y = groundY(pos.x, pos.z, oy);
    // A sudden rise (a wall top, a cliff lip the slope test missed) is not walkable.
    if (pos.y - oy > 0.6) { pos.set(ox, oy, oz); return 0; }
    return Math.hypot(pos.x - ox, pos.z - oz);
  }

  // Bodies that move are not in the static collider set: Kasza (two circles along her length) and
  // live enemies. Pushing out keeps Vesna from walking through them.
  _pushOutOfBodies(pos) {
    const P = this.P;
    const H = G.horse;
    if (H && !P.mounted && !P._mounting && H.root.visible) {
      const hp = H.root.position, hy = H.root.rotation.y;
      for (const off of [-0.55, 0.55]) {
        this._push(pos, hp.x + Math.sin(hy) * off, hp.z + Math.cos(hy) * off, 0.58 + RADIUS);
      }
    }
    for (const e of liveEnemies()) {
      if (e.faction === 'friendly') continue;
      const ep = enemyPos(e);
      this._push(pos, ep.x, ep.z, (e.radius ?? 0.5) + RADIUS * 0.8);
    }
  }

  _push(pos, cx, cz, r) {
    const dx = pos.x - cx, dz = pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= r) return;
    if (d < 1e-4) { pos.x += r; return; }
    const k = (r - d) / d;
    pos.x += dx * k;
    pos.z += dz * k;
  }

  // Turn toward a yaw at a fixed rate (attacks, casts, dodges).
  faceToward(yaw, rate, dt) {
    const err = wrapAngle(yaw - this.yaw);
    this.yaw = wrapAngle(this.yaw + clamp(err, -rate * dt, rate * dt));
  }
}
