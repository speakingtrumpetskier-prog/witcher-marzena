// The bear: a big brown bear asleep in its den. It wakes if Vesna lingers close or makes noise (running,
// drawn steel) or if it is struck; awake it is heavy and dangerous: a charge, a rearing paw slam and a
// maul at close range. An optional fight (the den holds the old silver sword).
//
//   const bear = G.creatures.spawnBear(x, z, { sleeping: true, yaw })
//   bear.state: 'sleep' | 'waking' | 'stalk' | 'charge' | 'rear' | 'slam' | 'maul' | 'recover' | 'roar' | 'stagger' | 'dead'
//   bear.wakeMeter  0..1 how close it is to waking (a stealth read for the HUD or senses)
//   bear.wake()     wake it now
// Tuning in TUNE.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, lerp, wrapAngle, smoothstep } from '../../core/util.js';
import { Creature } from './base.js';
import { Quadruped, SPECS } from './quadruped.js';

const TAU = Math.PI * 2;

export const TUNE = {
  hp: 380,
  walk: 1.6, charge: 6.4, chargeEnraged: 7.6,
  slamDamage: 30, mauldamage: 21, slamReach: 2.9, maulReach: 2.0,
  rear: 0.85, slam: 0.28, recover: 1.25, maulWind: 0.55,
  wakeTime: 2.5, // seconds of disturbance before it wakes
  noise: { still: 4.5, walk: 6.5, run: 11, drawn: 2.5 },
  gap: [1.1, 2.2],
  corpse: 40,
};

const _tp = {};
const rr = (a, b) => a + Math.random() * (b - a);

export class Bear extends Creature {
  constructor(x, z, o = {}) {
    const rig = new Quadruped(SPECS.bear, { seed: o.seed ?? 5, scale: o.scale ?? 1.0, tint: [1, 1, 1], eyeColor: [1.3, 0.8, 0.3] });
    super('bear', { root: rig.root, radius: 0.95, height: 1.5, health: TUNE.hp, name: 'Bear', material: 'flesh' });
    this.rig = rig;
    this.heading = o.yaw ?? rr(0, TAU);
    this.position.set(x, this.groundAt(x, z), z);
    this.root.rotation.y = this.heading;
    this.state = o.sleeping === false ? 'stalk' : 'sleep';
    this.stateT = 0;
    this.speed = 0;
    this.turnRate = 0;
    this.wakeMeter = 0;
    this.cool = 1;
    this.enraged = false;
    this.corpseT = 0;
    this.sleepPose = this.state === 'sleep' ? 1 : 0;
    this.snoreT = rr(2, 5);
    this.hit_ = false;
    this.attackKind = null;
    this.untargetable = false;
    if (this.state === 'sleep') this.hittable = true;
    else this.engaged = true;
  }

  // ---- contract ----------------------------------------------------------------------------------------------
  takeHit(hit) {
    if (!this.alive) return { hit: false, damage: 0, killed: false };
    this.health -= hit.damage;
    this.rig.flash(1);
    const dir = hit.dir || new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.vel.x += dir.x * (hit.knockback ?? 0) * 0.8; this.vel.z += dir.z * (hit.knockback ?? 0) * 0.8;
    const killed = this.health <= 0;
    if (this.state === 'sleep') {
      // Struck in its sleep: it comes up roaring.
      this.wake(true);
    } else if (this.state === 'waking') {
      this.stateT = Math.max(this.stateT, 1.4);
    }
    if (killed) { this.kill(dir); } else {
      this.sfx('wolf_growl', { volume: 0.7, pitch: 0.5 });
      if ((hit.heavy || hit.stagger) && (this.state === 'stalk' || this.state === 'recover' || this.state === 'rear') && Math.random() < 0.6) {
        this.go('stagger', { dur: 0.7 });
      }
      if (!this.enraged && this.health < this.maxHealth * 0.4) {
        this.enraged = true;
        this.go('roar');
      }
    }
    return { hit: true, damage: hit.damage, killed, material: 'flesh' };
  }

  onParried() {
    this.sfx('wolf_growl', { volume: 0.8, pitch: 0.45 });
    this.go('stagger', { dur: 1.4 });
    this.rig.flash(0.5);
  }

  onSign(sign, info) {
    if (!this.alive) return false;
    if (sign === 'ember') {
      this.health -= 7 * info.dt;
      this.engaged = true;
      if (this.state === 'sleep') this.wake(true);
      if (!this._scared || this.t - this._scared > 2.5) { this._scared = this.t; this.go('stagger', { dur: 0.9 }); this.sfx('wolf_growl', { volume: 0.9, pitch: 0.5 }); }
      if (this.health <= 0) this.kill(info.dir);
      return true;
    }
    if (sign === 'gale') {
      this.health -= 5;
      this.vel.x += info.dir.x * 3; this.vel.z += info.dir.z * 3;
      if (this.state === 'sleep') this.wake(true);
      else this.go('stagger', { dur: 0.6 });
      return true;
    }
    return false;
  }

  wake(angry = false) {
    if (this.state !== 'sleep') return;
    this.engaged = true;
    this.go('waking', { angry });
    this.sfx('wolf_growl', { volume: 1.1, pitch: 0.45 });
  }

  kill(dir) {
    this.go('dead');
    this.rig.dead(Math.random() < 0.5 ? -1 : 1);
    this.sfx('wolf_howl', { volume: 1.0, pitch: 0.4 });
    this.sfx('body_fall', { volume: 0.9, pitch: 0.7 });
    if (dir) { this.vel.x += dir.x * 1.2; this.vel.z += dir.z * 1.2; }
    this.die();
  }

  go(state, extra) {
    this.state = state;
    this.stateT = 0;
    this.hit_ = false;
    if (extra) Object.assign(this, extra);
  }

  // ---- movement ----------------------------------------------------------------------------------------------------
  steer(dt, tx, tz, speed, accel = 7, turn = 3.2) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    let want = speed;
    if (d > 0.05) {
      const err = this.turnToward(Math.atan2(dx, dz), turn * (this.enraged ? 1.2 : 1), dt);
      this.turnRate = err * 2.5;
      want *= clamp(0.2 + 0.8 * Math.cos(Math.min(1.4, Math.abs(err))), 0, 1);
    } else want = 0;
    this.speed += clamp(want - this.speed, -accel * dt * 1.6, accel * dt);
    this.step(Math.sin(this.heading) * this.speed * dt, Math.cos(this.heading) * this.speed * dt);
    return d;
  }

  brake(dt, rate = 10) {
    this.speed = Math.max(0, this.speed - rate * dt);
    if (this.speed > 0.01) this.step(Math.sin(this.heading) * this.speed * dt, Math.cos(this.heading) * this.speed * dt);
    this.turnRate *= 0.9;
  }

  lookAtPlayer(strength = 1) {
    this.toPlayer(_tp);
    this.rig.pose.lookYaw = clamp(wrapAngle(_tp.yaw - this.heading), -1.0, 1.0) * strength;
  }

  // ---- frame ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.disposed) return;
    dt = this.tick(dt);
    const tp = this.toPlayer(_tp);
    const rig = this.rig, pose = rig.pose;
    this.stateT += dt;
    this.cool -= dt;
    const pAlive = this.playerAlive();
    pose.crouch = 0; pose.pitch = 0; pose.neck = 0.2; pose.headRel = -0.2; pose.jaw = 0; pose.ears = 0.2; pose.tail = 0.05; pose.tailWag = 0.02;
    pose.hackles = this.engaged ? 0.5 : 0; pose.roll = 0; pose.bodyY = 0; pose.feetW = 0; pose.lookPitch = 0; pose.feet = null; pose.pawFlat = 1; pose.lookYaw = 0;

    switch (this.state) {
      case 'sleep': this._sleep(dt, tp, pAlive); break;
      case 'waking': this._waking(dt, tp); break;
      case 'stalk': this._stalk(dt, tp, pAlive); break;
      case 'charge': this._charge(dt, tp); break;
      case 'rear': this._rear(dt, tp); break;
      case 'slam': this._slam(dt, tp); break;
      case 'maul': this._maul(dt, tp); break;
      case 'recover': this._recover(dt, tp); break;
      case 'roar': this._roar(dt, tp); break;
      case 'stagger': this._stagger(dt, tp); break;
      case 'dead': this._dead(dt); break;
      default: break;
    }
    if (this.state !== 'dead' && this.state !== 'sleep') {
      this.applyKnock(dt, 7);
      this.keepOffPlayer(this.radius + 0.3);
    }
    this.root.rotation.y = this.heading;
    rig.update(dt, this.state === 'dead' || this.state === 'sleep' ? 0 : this.speed, this.turnRate);
  }

  // The lying pose: weight on the belly, paws forward, head resting on them.
  _lying(k) {
    const pose = this.rig.pose;
    const S = this.rig.spec;
    pose.bodyY = -0.56 * k;
    pose.crouch = 0.3 * k;
    pose.neck = lerp(0.2, -0.45, k); pose.headRel = lerp(-0.2, 0.15, k); pose.ears = lerp(0.2, 0.55, k);
    pose.tail = lerp(0.05, -0.1, k);
    pose.feetW = k;
    const fz = this.rig.pelvisZ + S.bodyLen;
    pose.feet = [[fz + 0.42, 0.08], [fz + 0.34, 0.08], [this.rig.pelvisZ + 0.12, 0.09], [this.rig.pelvisZ + 0.02, 0.09]];
    pose.pawFlat = 1;
    pose.roll = 0.14 * k;
  }

  _sleep(dt, tp, pAlive) {
    const pose = this.rig.pose;
    this._lying(1);
    // Slow breathing: the whole body rises and falls, a rumble now and then.
    pose.bodyY += Math.sin(this.t * 1.1) * 0.012;
    pose.lookYaw = 0.25;
    pose.neck += Math.sin(this.t * 1.1) * 0.015;
    this.snoreT -= dt;
    if (this.snoreT <= 0) { this.snoreT = rr(4, 8); this.sfx('wolf_growl', { volume: 0.18, pitch: 0.35 }); }
    this.speed = 0;
    if (!pAlive) { this.wakeMeter = Math.max(0, this.wakeMeter - dt); return; }
    const P = G.player;
    const sp = P.loco?.speed ?? 0;
    const noise = (P.loco?.sprinting ? TUNE.noise.run : sp > 2.4 ? TUNE.noise.run * 0.8 : sp > 0.6 ? TUNE.noise.walk : TUNE.noise.still) + (P.swordDrawn ? TUNE.noise.drawn : 0);
    if (tp.d < noise) {
      const close = clamp(1 - tp.d / noise);
      this.wakeMeter = Math.min(1, this.wakeMeter + dt * (0.18 + close * 0.9) / (TUNE.wakeTime / 2.5));
      pose.ears = 0.2 + Math.random() * 0.1; // ear twitches
    } else this.wakeMeter = Math.max(0, this.wakeMeter - dt * 0.12);
    if (tp.d < 2.2 || this.wakeMeter >= 1) this.wake(tp.d < 4);
  }

  _waking(dt, tp) {
    const pose = this.rig.pose;
    const dur = this.angry ? 1.4 : 2.6;
    const u = clamp(this.stateT / dur);
    const lie = 1 - smoothstep(0.25, 1, u);
    this._lying(lie);
    // The head comes up first, then the shoulders, then it stands.
    pose.neck = lerp(-0.45, 0.35, smoothstep(0, 0.5, u));
    pose.jaw = 0.4 * smoothstep(0.1, 0.4, u) * (1 - smoothstep(0.7, 1, u));
    this.lookAtPlayer(1);
    this.turnToward(tp.yaw, 1.2, dt);
    if (u >= 1) { this.engaged = true; this.cool = 0.6; this.go(tp.d > 4 ? 'roar' : 'stalk'); }
  }

  _roar(dt, tp) {
    const pose = this.rig.pose;
    const dur = 1.7;
    const u = clamp(this.stateT / dur);
    const up = smoothstep(0, 0.25, u) * (1 - smoothstep(0.8, 1, u));
    pose.pitch = 0.55 * up; pose.bodyY = -0.1 * up; pose.neck = 0.3 + 0.6 * up; pose.headRel = -0.2 + 0.5 * up; pose.jaw = 0.95 * up;
    pose.feetW = up; pose.feet = this._reared(0.5);
    pose.ears = 0.8; pose.hackles = 1;
    this.brake(dt, 14);
    this.turnToward(tp.yaw, 1.5, dt);
    if (this.stateT < 0.1 && !this._roared) { this._roared = true; this.sfx('wolf_howl', { volume: 1.2, pitch: 0.38 }); G.cameraRig?.shake?.(0.16, 0.7); }
    if (u >= 1) { this._roared = false; this.engaged = true; this.go('stalk'); }
  }

  // Foot targets for a rearing bear: hind paws planted, forepaws up. k is how high the paws go.
  _reared(k, swing = 0) {
    const S = this.rig.spec;
    const pz = this.rig.pelvisZ;
    return [
      [pz + S.bodyLen * 0.9 + 0.2 + swing * 0.4, 0.3 + 1.2 * k - swing * 1.0],
      [pz + S.bodyLen * 0.9 + 0.1 + swing * 0.2, 0.3 + 1.0 * k - swing * 0.6],
      [pz - 0.1, 0.075], [pz - 0.12, 0.075],
    ];
  }

  _stalk(dt, tp, pAlive) {
    const pose = this.rig.pose;
    if (!pAlive) { this.brake(dt); return; }
    // Close the distance: a heavy walk, then a charge when she is at range.
    const far = tp.d > 7.5;
    const sp = far && this.cool <= 0 ? (this.enraged ? TUNE.chargeEnraged : TUNE.charge) * 0.7 : TUNE.walk * 1.5;
    this.steer(dt, G.player.position.x, G.player.position.z, sp, 6, 3.4);
    pose.neck = 0.05; pose.headRel = -0.1; pose.hackles = 0.8; pose.ears = 0.6; pose.crouch = 0.1; pose.jaw = 0.1;
    this.lookAtPlayer(0.9);
    if (this.cool <= 0) {
      if (tp.d > 6.5 && tp.d < 18) this.go('charge');
      else if (tp.d < TUNE.slamReach + 0.8) {
        const r = Math.random();
        this.go(r < 0.55 ? 'rear' : 'maul');
        this.sfx('wolf_growl', { volume: 1.0, pitch: 0.42 });
      }
    }
    if (tp.d > 70) { this.engaged = false; }
  }

  _charge(dt, tp) {
    const pose = this.rig.pose;
    const sp = this.enraged ? TUNE.chargeEnraged : TUNE.charge;
    this.steer(dt, G.player.position.x, G.player.position.z, sp, 9, 2.4);
    pose.neck = -0.05; pose.headRel = -0.2; pose.hackles = 1; pose.ears = 1; pose.jaw = 0.25; pose.pitch = -0.05;
    this.lookAtPlayer(0.6);
    if (tp.d < 2.9) {
      this.go(Math.random() < 0.6 ? 'maul' : 'rear');
      this.speed *= 0.7;
    }
    if (this.stateT > 3.4) this.go('stalk');
  }

  _rear(dt, tp) {
    const pose = this.rig.pose;
    const u = clamp(this.stateT / TUNE.rear);
    const e = smoothstep(0, 1, u);
    pose.pitch = 0.9 * e; pose.bodyY = -0.14 * e; pose.neck = 0.35 + 0.35 * e; pose.headRel = -0.2 + 0.35 * e; pose.jaw = 0.9 * e;
    pose.feetW = e; pose.feet = this._reared(e);
    pose.ears = 1; pose.hackles = 1; pose.tail = 0;
    this.brake(dt, 16);
    this.turnToward(tp.yaw, 2.2, dt);
    if (this.stateT >= TUNE.rear) this.go('slam');
  }

  _slam(dt) {
    const pose = this.rig.pose;
    const u = clamp(this.stateT / TUNE.slam);
    const e = smoothstep(0, 0.85, u);
    pose.pitch = lerp(0.9, 0.0, e); pose.bodyY = lerp(-0.14, -0.04, e); pose.neck = lerp(0.7, 0.1, e); pose.headRel = lerp(0.15, -0.35, e); pose.jaw = lerp(0.9, 0.3, e);
    pose.feetW = 1;
    pose.feet = this._reared(1 - e, e);
    pose.ears = 1; pose.hackles = 1;
    // Lurch forward into the blow.
    if (u < 0.7) this.step(Math.sin(this.heading) * 4.2 * dt, Math.cos(this.heading) * 4.2 * dt);
    if (!this.hit_ && u > 0.62) {
      this.hit_ = true;
      const P = G.player;
      const fx = this.position.x + Math.sin(this.heading) * 1.7, fz = this.position.z + Math.cos(this.heading) * 1.7;
      const d = Math.hypot(P.position.x - fx, P.position.z - fz);
      G.combat?.fx?.chips({ x: fx, y: this.position.y + 0.1, z: fz }, { kind: 'ice', count: 14, speed: 4, up: 3.4 });
      G.cameraRig?.shake?.(0.34, 0.35);
      this.sfx('hit_ice', { volume: 1.0, pitch: 0.55 });
      if (d < TUNE.slamReach * 0.55 + 0.6 && this.playerAlive()) {
        G.combat?.strike?.(this, TUNE.slamDamage * (this.enraged ? 1.15 : 1), { knockback: 2.2, stagger: true, point: this.hitCenter() });
      }
    }
    if (this.stateT >= TUNE.slam + 0.12) this.go('recover', { dur: TUNE.recover });
  }

  _maul(dt, tp) {
    const pose = this.rig.pose;
    const wind = TUNE.maulWind;
    this.brake(dt, 12);
    this.turnToward(tp.yaw, 3, dt);
    const u = clamp(this.stateT / (wind + 0.3));
    if (this.stateT < wind) {
      // Rear the head back and open wide.
      pose.neck = 0.7; pose.headRel = 0.3; pose.jaw = 0.8; pose.crouch = 0.3; pose.pitch = 0.25; pose.hackles = 1; pose.ears = 1;
      pose.bodyY = -0.05;
    } else {
      const k = clamp((this.stateT - wind) / 0.25);
      pose.neck = lerp(0.7, -0.25, k); pose.headRel = lerp(0.3, -0.45, k); pose.jaw = lerp(0.8, 0.0, smoothstep(0.5, 1, k));
      pose.pitch = lerp(0.25, -0.12, k); pose.crouch = 0.1;
      if (k < 0.6) this.step(Math.sin(this.heading) * 3.8 * dt, Math.cos(this.heading) * 3.8 * dt);
      if (!this.hit_ && k > 0.45) {
        this.hit_ = true;
        const P = G.player;
        const hx = this.position.x + Math.sin(this.heading) * 1.5, hz = this.position.z + Math.cos(this.heading) * 1.5;
        const d = Math.hypot(P.position.x - hx, P.position.z - hz);
        this.sfx('wolf_bite', { volume: 1.0, pitch: 0.55 });
        if (d < 1.55 && this.playerAlive()) G.combat?.strike?.(this, TUNE.mauldamage * (this.enraged ? 1.15 : 1), { knockback: 1.2, stagger: false, point: this.hitCenter() });
      }
    }
    void u;
    if (this.stateT >= wind + 0.35) this.go('recover', { dur: 0.85 });
  }

  _recover(dt, tp) {
    const pose = this.rig.pose;
    const dur = this.dur || TUNE.recover;
    this.brake(dt, 12);
    this.lookAtPlayer(0.8);
    this.turnToward(tp.yaw, 1.5, dt);
    pose.jaw = 0.2 + 0.1 * Math.sin(this.t * 10); pose.hackles = 0.7; pose.crouch = 0.1;
    if (this.stateT >= dur) { this.cool = rr(TUNE.gap[0], TUNE.gap[1]) * (this.enraged ? 0.7 : 1); this.go('stalk'); }
  }

  _stagger(dt, tp) {
    const pose = this.rig.pose;
    const dur = this.dur || 0.7;
    const u = clamp(this.stateT / dur);
    const hit = 1 - smoothstep(0, 0.3, u);
    pose.pitch = 0.25 * hit; pose.neck = 0.5 * hit; pose.jaw = 0.7 * hit; pose.ears = 1; pose.crouch = 0.15;
    pose.lookYaw = 0.6 * hit;
    this.brake(dt, 10);
    this.turnToward(tp.yaw, 1, dt);
    if (this.stateT >= dur) { this.cool = rr(0.3, 0.8); this.go('stalk'); }
  }

  _dead(dt) {
    this.speed = 0;
    this.corpseT += dt;
    this.applyKnock(dt, 4);
    void dt;
  }

  dispose() {
    if (this.disposed) return;
    this.rig.dispose();
    super.dispose();
  }
}
