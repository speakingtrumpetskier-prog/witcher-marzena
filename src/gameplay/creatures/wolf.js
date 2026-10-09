// Wolves: lean grey wolves in packs of 3 to 4 plus an optional scarred alpha.
//
// A pack circles Vesna at a distance, feints, and sends one wolf at a time (an attack token). The
// attacker telegraphs (a coil with a growl), lunges at where she stands, bites on landing, then
// backs off while the others reposition. They flee at low health, scatter from Ember, howl to start
// and rally, and are knocked about by heavy blows and Gale.
//
//   const wolves = G.creatures.spawnWolves(x, z, 4, { alpha: true, engaged: false })
//   wolf.state: 'idle' | 'alert' | 'howl' | 'circle' | 'approach' | 'feint' | 'telegraph' | 'lunge' | 'recover'
//               | 'retreat' | 'stagger' | 'knocked' | 'flee' | 'dead'
// Tuning is in TUNE below.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, lerp, wrapAngle, smoothstep } from '../../core/util.js';
import { Creature } from './base.js';
import { Quadruped, SPECS } from './quadruped.js';

const TAU = Math.PI * 2;

export const TUNE = {
  hp: 55, alphaHp: 150,
  bite: 11, alphaBite: 17,
  aggro: 17, aggroDrawn: 25, giveUp: 58,
  ring: 5.4, ringAlpha: 7.4,
  walk: 1.7, run: 6.9, approach: 5.6, retreat: 3.4,
  telegraph: 0.62, alphaTelegraph: 0.78,
  lungeSpeed: 9.5, lungeMin: 1.6, lungeMax: 5.8,
  recover: 0.7,
  tokenGap: [0.9, 2.1], // seconds between attacks
  fleeBelow: 0.26, fleeTime: 3.6, scareTime: 4.2,
  corpse: 28,
};

const _tp = {};
const rr = (a, b) => a + Math.random() * (b - a);

export class Wolf extends Creature {
  constructor(x, z, o = {}) {
    const alpha = !!o.alpha;
    const lum = rr(0.9, 1.1);
    const rig = new Quadruped(SPECS.wolf, {
      seed: o.seed ?? Math.random() * 9, scar: alpha, scale: alpha ? 1.14 : rr(0.94, 1.04),
      tint: alpha ? [0.78, 0.78, 0.82] : [lum * rr(0.98, 1.03), lum * rr(0.98, 1.03), lum * rr(0.98, 1.05)],
    });
    super('wolf', {
      root: rig.root, radius: alpha ? 0.55 : 0.45, height: alpha ? 1.1 : 0.95,
      health: alpha ? TUNE.alphaHp : TUNE.hp, name: alpha ? 'Scarred Alpha' : 'Wolf', material: 'flesh',
    });
    this.rig = rig;
    this.alpha = alpha;
    this.pack = null;
    this.state = 'idle';
    this.stateT = 0;
    this.speed = 0;
    this.turnRate = 0;
    this.slot = { x, z };
    this.ringR = alpha ? TUNE.ringAlpha : TUNE.ring + rr(-0.5, 0.8);
    this.heading = o.yaw ?? rr(0, TAU);
    this.position.set(x, this.groundAt(x, z), z);
    this.root.rotation.y = this.heading;
    this.fled = false;
    this.enrage = 1;
    this.aggroR = o.aggro ?? TUNE.aggro;
    this.attack = null; // { kind, start, target, dur, hit, arc }
    this.biteDmg = alpha ? TUNE.alphaBite : TUNE.bite;
    this.idleLook = 0;
    this.nextSniff = rr(2, 6);
    this.sniffT = 0;
    this.corpseT = 0;
    this.lookTarget = 0;
    this.feintPhase = 0;
    this.sleepy = o.sleepy ?? 0;
  }

  // ---- state helpers ---------------------------------------------------------------------------------
  go(state, extra) {
    this.state = state;
    this.stateT = 0;
    if (extra) Object.assign(this, extra);
  }

  engage() {
    if (this.engaged || !this.alive) return;
    this.engaged = true;
    if (this.state === 'idle') this.go('alert');
    if (this.pack) this.pack.wake(this);
  }

  // The pack gives this wolf the attack token.
  beginAttack() {
    const feint = (this.pack?.live().length ?? 1) > 1 && Math.random() < (this.alpha ? 0.3 : 0.45);
    this.go(feint ? 'feint' : 'approach');
    this.feintPhase = 0;
  }

  endAttack() {
    if (this.pack && this.pack.token === this) this.pack.release(this);
  }

  // ---- combat contract -----------------------------------------------------------------------------------
  takeHit(hit) {
    if (!this.alive) return { hit: false, damage: 0, killed: false };
    const dmg = hit.damage;
    this.health -= dmg;
    this.engage();
    this.rig.flash(1);
    const dir = hit.dir || new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const kb = (hit.knockback ?? 0) * 3.4;
    this.vel.x += dir.x * kb; this.vel.z += dir.z * kb;
    const killed = this.health <= 0;
    if (killed) {
      this.kill(dir);
    } else {
      const airborne = this.state === 'lunge';
      const interrupt = this.state === 'telegraph' || this.state === 'feint' || this.state === 'approach';
      this.sfx('wolf_yelp', { volume: 0.55, pitch: rr(0.9, 1.15) });
      if (hit.stagger || airborne) this.stagger(airborne ? 1.0 : 0.75, dir, airborne ? 'knocked' : 'stagger');
      else if (interrupt) this.stagger(0.35, dir, 'stagger');
      else this.rig.pose.lookYaw = rr(-0.6, 0.6); // head jerks away from the blow
      if (!this.fled && this.health < this.maxHealth * TUNE.fleeBelow && this.state !== 'dead') {
        this.fled = true;
        this.flee(TUNE.fleeTime, hit.origin);
      }
    }
    return { hit: true, damage: dmg, killed, material: 'flesh' };
  }

  stagger(sec, dir, kind = 'stagger') {
    this.endAttack();
    this.attack = null;
    this.go(kind, { dur: sec });
    if (dir) { this.vel.x += dir.x * (kind === 'knocked' ? 3.5 : 1.4); this.vel.z += dir.z * (kind === 'knocked' ? 3.5 : 1.4); }
    this.rollSide = Math.random() < 0.5 ? -1 : 1;
  }

  onParried() {
    // The blow bounced off her blade: reeling, wide open.
    this.sfx('wolf_yelp', { volume: 0.5, pitch: 1.2 });
    this.stagger(1.2, new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)), 'stagger');
    this.rig.flash(0.6);
  }

  onSign(sign, info) {
    if (!this.alive) return false;
    if (sign === 'ember') {
      this.engage();
      if (this.state !== 'flee' || this.stateT > 0.5) {
        this.health -= 11 * info.dt;
        if (!this._scaredThisCast || this.t - this._scaredThisCast > 1.2) {
          this._scaredThisCast = this.t;
          this.flee(TUNE.scareTime, info.origin, true);
          this.sfx('wolf_yelp', { volume: 0.6, pitch: 1.25 });
        }
      }
      if (this.health <= 0) this.kill(info.dir);
      return true;
    }
    if (sign === 'gale') {
      this.engage();
      this.health -= 6 * info.power;
      this.vel.x += info.dir.x * 7; this.vel.z += info.dir.z * 7;
      this.stagger(1.1, null, 'knocked');
      this.rig.flash(0.5);
      if (this.health <= 0) this.kill(info.dir);
      return true;
    }
    return false;
  }

  flee(sec, from, scared = false) {
    this.endAttack();
    this.attack = null;
    this.go('flee', { dur: sec, scared, fleeFrom: from ? { x: from.x, z: from.z } : null });
    this.sfx('wolf_yelp', { volume: 0.5, pitch: 1.1 });
  }

  kill(dir) {
    this.endAttack();
    this.go('dead');
    this.rig.dead(Math.random() < 0.5 ? -1 : 1);
    this.rig.pose.jaw = 0.4;
    this.sfx('wolf_yelp', { volume: 0.9, pitch: 0.85 });
    this.sfx('body_fall', { volume: 0.5, pitch: 1.2 });
    if (dir) { this.vel.x += dir.x * 2; this.vel.z += dir.z * 2; }
    this.die();
    if (this.pack) this.pack.onDeath(this);
  }

  // ---- steering ------------------------------------------------------------------------------------------
  // Walk or run toward a point: turn first, speed follows how well we face it.
  steer(dt, tx, tz, speed, accel = 16, turn = 7) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    let want = speed;
    if (d > 0.05) {
      const err = this.turnToward(Math.atan2(dx, dz), turn * this.enrage, dt);
      this.turnRate = err * 3;
      want *= clamp(0.25 + 0.75 * Math.cos(Math.min(1.4, Math.abs(err))), 0, 1);
    } else want = 0;
    want = Math.min(want, d * 4 + 0.2);
    this.speed += clamp(want - this.speed, -accel * dt * 1.4, accel * dt);
    const sp = this.speed;
    this.step(Math.sin(this.heading) * sp * dt, Math.cos(this.heading) * sp * dt);
    return d;
  }

  brake(dt, rate = 18) {
    this.speed = Math.max(0, this.speed - rate * dt);
    if (this.speed > 0.01) this.step(Math.sin(this.heading) * this.speed * dt, Math.cos(this.heading) * this.speed * dt);
    this.turnRate *= 0.9;
  }

  // Head toward the player, clamped; body keeps its own heading.
  lookAtPlayer(dt, strength = 1) {
    const tp = this._tp || (this._tp = {});
    this.toPlayer(tp);
    const rel = wrapAngle(tp.yaw - this.heading);
    this.rig.pose.lookYaw = clamp(rel, -1.0, 1.0) * strength;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------
  update(dt) {
    if (this.disposed) return;
    dt = this.tick(dt);
    const P = G.player;
    const tp = this.toPlayer(_tp);
    const rig = this.rig, pose = rig.pose;
    this.stateT += dt;
    const alive = this.alive;
    const pAlive = this.playerAlive();

    // Wake up: the player gets close, or draws steel nearby.
    if (alive && !this.engaged && pAlive && this.state !== 'flee') {
      const drawn = P.swordDrawn ? 1 : 0;
      if (tp.d < (drawn ? TUNE.aggroDrawn : this.aggroR)) this.engage();
    }
    // Lose interest.
    if (alive && this.engaged && (!pAlive || tp.d > TUNE.giveUp)) {
      this.engaged = false;
      this.endAttack();
      this.go('idle');
    }

    // Default pose each frame; states override.
    pose.crouch = 0; pose.pitch = 0; pose.neck = 0.42; pose.headRel = -0.3; pose.jaw = 0; pose.ears = 0.15; pose.tail = 0.12;
    pose.tailWag = 0.05; pose.hackles = this.engaged ? 0.55 : 0; pose.roll = 0; pose.bodyY = 0; pose.feetW = 0; pose.lookPitch = 0;
    pose.feet = null;

    switch (this.state) {
      case 'idle': this._idle(dt, tp); break;
      case 'alert': this._alert(dt, tp); break;
      case 'howl': this._howl(dt, tp); break;
      case 'circle': this._circle(dt, tp); break;
      case 'approach': this._approach(dt, tp); break;
      case 'feint': this._feint(dt, tp); break;
      case 'telegraph': this._telegraph(dt, tp); break;
      case 'lunge': this._lunge(dt); break;
      case 'recover': this._recover(dt, tp); break;
      case 'retreat': this._retreat(dt, tp); break;
      case 'stagger': case 'knocked': this._stagger(dt, tp); break;
      case 'flee': this._flee(dt, tp); break;
      case 'dead': this._dead(dt); break;
      default: break;
    }

    if (this.state !== 'dead' && this.state !== 'lunge') {
      this.applyKnock(dt);
      if (this.pack) this.separate(this.pack.wolves, dt);
    }
    if (this.state !== 'lunge' && this.state !== 'dead') this.position.y = this.groundAt(this.position.x, this.position.z);

    this.root.rotation.y = this.heading;
    rig.update(dt, this.state === 'dead' ? 0 : this.speed, this.turnRate);
  }

  // ---- states --------------------------------------------------------------------------------------------------
  _idle(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt);
    this.nextSniff -= dt;
    if (this.nextSniff <= 0) { this.sniffT = rr(1.2, 2.4); this.nextSniff = rr(4, 9); this.idleLook = rr(-0.8, 0.8); }
    this.sniffT = Math.max(0, this.sniffT - dt);
    if (this.sniffT > 0) { pose.neck = -0.05; pose.headRel = -0.1; pose.lookYaw = this.idleLook; } else { pose.lookYaw = Math.sin(this.t * 0.4 + this.rig.phase * 6) * 0.35; }
    pose.tail = -0.05;
    // A sleepy wolf lies still: lowered, ears soft.
    if (this.sleepy > 0) { pose.crouch = 0.35 * this.sleepy; pose.neck = 0.05; }
    void tp;
  }

  _alert(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt);
    this.turnToward(tp.yaw, 5, dt);
    this.lookAtPlayer(dt, 0.8);
    pose.neck = 0.55; pose.headRel = -0.25; pose.ears = 0; pose.hackles = 0.8; pose.tail = 0.3;
    if (this.stateT < 0.1 && !this._grr) { this._grr = true; this.sfx('wolf_growl', { volume: 0.6 }); }
    if (this.stateT > rr(0.7, 1.3)) { this._grr = false; this.go(this.pack && this.pack.shouldHowl(this) ? 'howl' : 'circle'); }
  }

  _howl(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt);
    const u = this.stateT / 2.6;
    const lift = smoothstep(0, 0.18, u) * (1 - smoothstep(0.82, 1, u));
    pose.neck = 0.3 + 0.95 * lift; pose.headRel = 0.2 + 0.7 * lift; pose.jaw = 0.55 * lift; pose.ears = 0.7 * lift; pose.tail = -0.1; pose.pitch = 0.1 * lift;
    pose.hackles = 0.2;
    pose.lookYaw = 0;
    if (this.stateT < 0.15 && !this._howled) { this._howled = true; this.sfx('wolf_howl', { volume: 1.0, pitch: this.alpha ? 0.88 : 1 }); }
    void tp;
    if (this.stateT > 2.6) { this._howled = false; this.go('circle'); }
  }

  _circle(dt, tp) {
    const pose = this.rig.pose;
    if (!this.playerAlive()) { this.go('idle'); return; }
    const sl = this.slot;
    const d = this.steer(dt, sl.x, sl.z, TUNE.walk + Math.min(TUNE.run - TUNE.walk, Math.max(0, this.toSlot(sl) - 1.0) * 1.5), 14, 7);
    void d;
    this.lookAtPlayer(dt, 1);
    pose.neck = 0.22; pose.headRel = -0.12; pose.ears = 0.45; pose.hackles = 0.65; pose.tail = 0.0; pose.crouch = 0.12;
    pose.jaw = tp.d < 7 ? 0.08 + 0.05 * Math.sin(this.t * 3 + this.rig.phase * 9) : 0;
    // The player rushed in: snap at her.
    if (tp.d < 2.1 && this.pack && this.pack.token == null && this.stateT > 0.6 && this.pack.cool <= 0.2) {
      this.pack.token = this;
      this.snap = true;
      this.go('telegraph', { quick: true });
    }
  }

  toSlot(sl) { return Math.hypot(sl.x - this.position.x, sl.z - this.position.z); }

  _approach(dt, tp) {
    const pose = this.rig.pose;
    this.steer(dt, G.player.position.x, G.player.position.z, TUNE.approach, 20, 9);
    this.lookAtPlayer(dt, 1);
    pose.neck = 0.15; pose.headRel = -0.1; pose.ears = 0.8; pose.hackles = 1; pose.tail = 0.05; pose.jaw = 0.12;
    if (tp.d < 4.2 || this.stateT > 3.5) this.go('telegraph', { quick: false });
  }

  _feint(dt, tp) {
    const pose = this.rig.pose;
    // Dash in, then back off: the player has to decide whether to commit.
    const ph = this.feintPhase;
    if (ph === 0) {
      this.steer(dt, G.player.position.x, G.player.position.z, 5.4, 22, 10);
      if (tp.d < 3.5 || this.stateT > 1.2) { this.feintPhase = 1; this.stateT = 0; this.sfx('wolf_growl', { volume: 0.5, pitch: 1.1 }); }
    } else {
      // Retreat while looking at her.
      const ax = this.position.x - G.player.position.x, az = this.position.z - G.player.position.z;
      const l = Math.hypot(ax, az) || 1;
      this.steer(dt, this.position.x + ax / l * 3, this.position.z + az / l * 3, TUNE.retreat + 1, 18, 9);
      if (this.stateT > 0.55) {
        // Half the time the feint turns into the real thing; otherwise the token goes back to the pack.
        if (Math.random() < 0.5) { this.endAttack(); this.go('circle'); } else this.go('approach');
      }
    }
    this.lookAtPlayer(dt, 1);
    pose.neck = 0.2; pose.ears = 0.7; pose.hackles = 1; pose.jaw = 0.15; pose.tail = 0.05;
  }

  _telegraph(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt, 30);
    this.turnToward(tp.yaw, 8, dt);
    const dur = this.quick ? 0.3 : this.alpha ? TUNE.alphaTelegraph : TUNE.telegraph;
    const u = clamp(this.stateT / dur);
    const c = smoothstep(0, 0.45, u);
    pose.crouch = 0.35 + 0.65 * c; pose.pitch = -0.12 * c; pose.neck = 0.15 - 0.15 * c; pose.headRel = -0.25 + 0.1 * c;
    pose.ears = 1; pose.hackles = 1; pose.tail = 0.25 * c; pose.tailWag = 0.2 * c;
    pose.jaw = 0.3 + 0.12 * Math.sin(this.t * 25);
    pose.bodyY = -0.02 * c + Math.sin(this.t * 38) * 0.006 * c; // trembling coil
    this.lookAtPlayer(dt, 1);
    if (this.stateT < 0.05 && !this._gr2) { this._gr2 = true; this.sfx('wolf_growl', { volume: 0.85, pitch: this.alpha ? 0.85 : rr(0.95, 1.1) }); }
    if (this.stateT >= dur) {
      this._gr2 = false;
      this.startLunge();
    }
  }

  startLunge() {
    const P = G.player;
    // Aim a little ahead of where she is moving.
    const lead = 0.18;
    const tx = P.position.x + P.velocity.x * lead, tz = P.position.z + P.velocity.z * lead;
    const sx = this.position.x, sz = this.position.z;
    let dx = tx - sx, dz = tz - sz;
    const D = Math.hypot(dx, dz) || 1;
    dx /= D; dz /= D;
    // Land a little short of her so the bite reaches at the end of the jump.
    const dist = clamp(D - 0.85, this.snap ? 0.7 : TUNE.lungeMin, this.snap ? 1.6 : TUNE.lungeMax);
    this.attack = {
      sx, sz, tx: sx + dx * dist, tz: sz + dz * dist, dist, dur: clamp(dist / TUNE.lungeSpeed, 0.3, 0.58), hit: false,
      arc: this.snap ? 0.18 : 0.42 + dist * 0.07, yaw: Math.atan2(dx, dz),
    };
    this.heading = this.attack.yaw;
    this.snap = false;
    this.go('lunge');
    this.sfx('wolf_bite', { volume: 0.5, pitch: 0.8 });
  }

  _lunge(dt) {
    const pose = this.rig.pose, A = this.attack;
    if (!A) { this.go('recover'); return; }
    const u = clamp(this.stateT / A.dur);
    const e = u;
    const x = lerp(A.sx, A.tx, e), z = lerp(A.sz, A.tz, e);
    const p = this.position;
    const ox = p.x, oz = p.z;
    p.x = x; p.z = z;
    if (G.physics) G.physics.resolve(p, this.radius * 0.7);
    const gy = this.groundAt(p.x, p.z);
    p.y = gy + 4 * A.arc * u * (1 - u);
    this.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-4);
    this.speed = Math.min(this.speed, 9);
    // Pose through the jump: push off, reach, land.
    const feet = pose.feet = [[0.5, 0.3], [0.5, 0.3], [-0.4, 0.2], [-0.4, 0.2]];
    if (u < 0.3) {
      const k = u / 0.3;
      const f = [0.48 + 0.1 * k, 0.28 + 0.1 * k, -0.46, 0.16];
      feet[0] = [f[0], f[1]]; feet[1] = [f[0] - 0.02, f[1] + 0.02]; feet[2] = [f[2], f[3]]; feet[3] = [f[2] + 0.02, f[3] + 0.02];
      pose.pitch = 0.38; pose.neck = 0.55; pose.jaw = 0.5 + 0.4 * k;
    } else if (u < 0.7) {
      feet[0] = [0.64, 0.42]; feet[1] = [0.6, 0.45]; feet[2] = [-0.22, 0.3]; feet[3] = [-0.2, 0.32];
      pose.pitch = 0.12 - 0.3 * ((u - 0.3) / 0.4); pose.neck = 0.4; pose.jaw = 0.95;
    } else {
      feet[0] = [0.46, 0.1]; feet[1] = [0.44, 0.12]; feet[2] = [-0.08, 0.26]; feet[3] = [-0.06, 0.26];
      pose.pitch = -0.28; pose.neck = 0.2; pose.jaw = 0.95 * (1 - smoothstep(0.82, 0.96, u));
    }
    pose.feetW = 1; pose.pawFlat = 0;
    pose.ears = 1; pose.hackles = 1; pose.tail = 0.4; pose.headRel = -0.2; pose.lookYaw = 0;
    pose.crouch = 0;
    // Bite window in the last half of the jump.
    if (!A.hit && u > 0.5) {
      const P = G.player;
      const d = Math.hypot(P.position.x - p.x, P.position.z - p.z);
      if (d < 1.35 + (this.alpha ? 0.2 : 0) && Math.abs(P.position.y - gy) < 1.2) {
        A.hit = true;
        const r = G.combat?.strike?.(this, this.biteDmg, { knockback: this.alpha ? 1.4 : 0.7, stagger: this.alpha, point: this.hitCenter() });
        this.sfx('wolf_bite', { volume: 0.9 });
        if (r && (r.result === 'hit' || r.result === 'guardbreak')) { this.vel.x -= Math.sin(A.yaw) * 1.5; this.vel.z -= Math.cos(A.yaw) * 1.5; }
      }
    }
    if (u >= 1) {
      this.attack = null;
      this.speed = 3;
      this.endAttack();
      this.go('recover');
      this.vel.x += Math.sin(A.yaw) * 1.2; this.vel.z += Math.cos(A.yaw) * 1.2;
    }
  }

  _recover(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt, 10);
    this.lookAtPlayer(dt, 0.8);
    this.turnToward(tp.yaw, 3, dt);
    pose.crouch = 0.3 * (1 - this.stateT / TUNE.recover); pose.jaw = 0.15 + 0.1 * Math.sin(this.t * 12); pose.ears = 0.5; pose.hackles = 0.7;
    if (this.stateT > TUNE.recover) this.go('retreat');
  }

  _retreat(dt, tp) {
    const pose = this.rig.pose;
    const ax = this.position.x - G.player.position.x, az = this.position.z - G.player.position.z;
    const l = Math.hypot(ax, az) || 1;
    this.steer(dt, this.position.x + ax / l * 3, this.position.z + az / l * 3, TUNE.retreat, 14, 6);
    this.lookAtPlayer(dt, 1);
    pose.ears = 0.55; pose.hackles = 0.7; pose.crouch = 0.1; pose.tail = 0;
    if (this.stateT > 0.7 || tp.d > this.ringR - 0.5) this.go('circle');
  }

  _stagger(dt, tp) {
    const pose = this.rig.pose;
    this.brake(dt, 12);
    const dur = this.dur || 0.7;
    const u = clamp(this.stateT / dur);
    const hit = 1 - smoothstep(0, 0.25, u);
    pose.crouch = 0.5 * (1 - smoothstep(0.55, 1, u)) + 0.3 * hit;
    pose.pitch = 0.18 * hit;
    pose.jaw = 0.55 * hit; pose.ears = 1; pose.hackles = 0.5;
    pose.lookYaw = 0.7 * hit * (this.rollSide || 1);
    if (this.state === 'knocked') {
      pose.roll = (this.rollSide || 1) * 0.5 * (1 - smoothstep(0.4, 1, u));
      pose.crouch = 0.8 * (1 - smoothstep(0.5, 1, u));
      pose.neck = 0.1;
    }
    this.turnToward(tp.yaw, 2, dt);
    if (this.stateT >= dur) this.go('circle');
  }

  _flee(dt, tp) {
    const pose = this.rig.pose;
    // Run away from the player (not from the cast point) so the pack never tucks back toward her.
    const ax = this.position.x - G.player.position.x, az = this.position.z - G.player.position.z;
    const l = Math.hypot(ax, az) || 1;
    this.steer(dt, this.position.x + ax / l * 8, this.position.z + az / l * 8, TUNE.run, 22, 9);
    pose.ears = 1; pose.tail = -0.3; pose.hackles = 0.2; pose.crouch = 0.1;
    this.lookAtPlayer(dt, 0.4);
    const dur = this.dur || TUNE.fleeTime;
    if (this.stateT > dur || (tp.d > 26 && this.stateT > 1.2)) this.go('circle');
  }

  _dead(dt) {
    this.speed = 0;
    this.corpseT += dt;
    this.applyKnock(dt, 4);
    if (this.corpseT > TUNE.corpse) {
      const k = clamp(1 - (this.corpseT - TUNE.corpse) / 2.5);
      this.root.scale.setScalar(this.rig.scale * k);
      if (k <= 0) this.dispose();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.rig.dispose();
    super.dispose();
  }
}

// ---- the pack ----------------------------------------------------------------------------------------------------
export class WolfPack {
  constructor(wolves) {
    this.wolves = wolves;
    for (const w of wolves) w.pack = this;
    this.token = null;
    this.cool = 1.4;
    this.angle = Math.random() * TAU;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.howled = false;
    this.rallied = false;
    this.woke = false;
    this.flip = 6 + Math.random() * 6;
  }

  live() { return this.wolves.filter((w) => w.alive && !w.disposed); }

  wake(w) {
    if (this.woke) return;
    this.woke = true;
    for (const o of this.wolves) if (o !== w) o.engage();
  }

  shouldHowl(w) {
    // The alpha (or the first wolf awake without one) opens with a howl.
    if (this.howled) return false;
    const alpha = this.wolves.find((o) => o.alpha && o.alive);
    if ((alpha && alpha === w) || (!alpha && w === this.live()[0])) { this.howled = true; return true; }
    return false;
  }

  release(w) {
    if (this.token === w) {
      this.token = null;
      this.cool = rr(TUNE.tokenGap[0], TUNE.tokenGap[1]) * (this.live().length <= 2 ? 0.75 : 1);
    }
  }

  onDeath(w) {
    this.release(w);
    const live = this.live();
    if (live.length === 1 && !this.rallied) {
      // The last wolf standing gets desperate: faster, no more fleeing.
      live[0].enrage = 1.2;
      live[0].fled = true;
    }
  }

  update(dt) {
    const live = this.live();
    if (!live.length) return;
    const P = G.player;
    if (!P) return;
    this.cool = Math.max(0, this.cool - dt);
    this.flip -= dt;
    if (this.flip <= 0) { this.flip = 7 + Math.random() * 8; this.dir *= -1; }
    this.angle += this.dir * dt * 0.3;
    // Assign slots by current bearing so the wolves do not cross each other.
    const n = live.length;
    const sorted = live.slice().sort((a, b) => Math.atan2(a.position.x - P.position.x, a.position.z - P.position.z) - Math.atan2(b.position.x - P.position.x, b.position.z - P.position.z));
    // Rotate the assignment so slot 0 is the wolf nearest to the base angle.
    let best = 0, bd = 9;
    sorted.forEach((w, i) => {
      const a = Math.atan2(w.position.x - P.position.x, w.position.z - P.position.z);
      const d = Math.abs(wrapAngle(a - this.angle));
      if (d < bd) { bd = d; best = i; }
    });
    for (let k = 0; k < n; k++) {
      const w = sorted[(best + k) % n];
      const a = this.angle + (k * TAU) / n;
      w.slot.x = P.position.x + Math.sin(a) * w.ringR;
      w.slot.z = P.position.z + Math.cos(a) * w.ringR;
    }
    // Attack token.
    if (this.token && (!this.token.alive || this.token.disposed)) this.token = null;
    const engaged = live.some((w) => w.engaged);
    if (engaged && !this.token && this.cool <= 0 && !P.dead) {
      const ready = live.filter((w) => w.state === 'circle' && w.stateT > 0.5 && Math.hypot(w.position.x - P.position.x, w.position.z - P.position.z) < w.ringR + 3);
      if (ready.length) {
        // Prefer a wolf at her back or side, where she is not looking.
        const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
        ready.sort((a, b) => {
          const sa = (a.position.x - P.position.x) * fx + (a.position.z - P.position.z) * fz;
          const sb = (b.position.x - P.position.x) * fx + (b.position.z - P.position.z) * fz;
          return sa - sb + (a.alpha ? 2.5 : 0) - (b.alpha ? 2.5 : 0);
        });
        const pick = Math.random() < 0.7 ? ready[0] : ready[Math.floor(Math.random() * ready.length)];
        this.token = pick;
        pick.beginAttack();
      }
    }
    // The alpha calls the pack when hurt.
    const alpha = live.find((w) => w.alpha);
    if (alpha && !this.rallied && alpha.health < alpha.maxHealth * 0.5 && alpha.state === 'circle') {
      this.rallied = true;
      alpha.go('howl');
      for (const w of live) { w.enrage = 1.15; if (w.state === 'flee') w.go('circle'); }
    }
  }
}
