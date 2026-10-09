// Village and wilderness animals: dogs, chickens, goats, cats, ravens and crows.
//
//   const animals = createAnimals(sys)           (G.npcs.animals)
//   animals.spawn(kind, x, z, opts)   kind: 'dog' | 'chicken' | 'goat' | 'cat' | 'raven' | 'crow'
//     opts: { y (perch or roof height; with `static` the animal stays put there), static, follow (dogs),
//             r (roam radius), seed, home: { x, z }, ground (corvids walk on the snow) }
//   animals.spawnFlock(kind, x, z, n, opts)      n animals scattered around (x, z)
//   animals.list, animals.remove(a), animals.perchesNear(x, z, r), animals.update(dt, S)
// Behaviors: dogs wander, rest, sniff, bark at Vesna and some trot after her for a while; chickens
// peck and scatter when she comes near; goats graze (one stands on a roof and watches); cats sit and
// groom, ground cats bolt when approached; corvids perch on roofs and snags and flap away when she
// gets close, then settle somewhere else. Animals more than 110 m from the camera are hidden and
// not updated; past 50 m they update at 10 Hz.
import * as THREE from 'three';
import { dampAngle, wrapAngle, rng } from '../../../core/util.js';
import { makeQuad } from './quad.js';
import { makeChicken, makeBird } from './fowl.js';

const HIDE2 = 110 * 110, SLOW2 = 50 * 50;
const _v = new THREE.Vector3();

class Animal {
  constructor(sys, kind, x, z, o) {
    this.sys = sys; this.G = sys.G; this.kind = kind;
    this.x = x; this.z = z; this.yFix = o.y ?? null;
    this.y = this.yFix ?? this.G.world.heightAt(x, z);
    this.yaw = o.yaw ?? Math.random() * 6.28;
    this.home = o.home || { x, z };
    this.homeR = o.r ?? 10;
    this.static = !!o.static;
    this.rand = rng(Math.floor((x * 131 + z * 17 + (o.seed || 0) * 7919) % 1e9) + 1);
    this.seed = o.seed ?? Math.floor(this.rand() * 1000);
    this.d2 = 1e9; this.acc = 0; this.t = this.rand() * 50;
    this.timer = 1 + this.rand() * 4;
    this.state = 'idle';
    this.root = null;
    this.speed = 0; this.targetSpeed = 0;
    this.tx = x; this.tz = z;
    this.hidden = false;
    this.sfxCD = 5 + this.rand() * 20;
  }
  place() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
  }
  // Move toward (tx, tz); returns 1 on arrival, -1 when blocked, 0 otherwise.
  stepTo(tx, tz, speed, dt, turn = 7) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { this.targetSpeed = 0; return 1; }
    const want = Math.atan2(dx, dz);
    const da = wrapAngle(want - this.yaw);
    this.yaw = dampAngle(this.yaw, want, turn, dt);
    const sp = speed * Math.max(0, Math.cos(da)) ** 2;
    this.targetSpeed = sp;
    const step = Math.min(d, sp * dt);
    const nx = this.x + Math.sin(this.yaw) * step, nz = this.z + Math.cos(this.yaw) * step;
    if (!this.static && this.yFix == null && this.sys.nav.flag(nx, nz) === 1) { this.targetSpeed = 0; return -1; }
    this.x = nx; this.z = nz;
    if (this.yFix == null) this.y = this.G.world.heightAt(nx, nz);
    return 0;
  }
  dispose() { if (this.root?.parent) this.root.parent.remove(this.root); this.disposed = true; }
  playerDist() { const P = this.sys.S.player; return Math.hypot(this.x - P.x, this.z - P.z); }
  pickNear(rmin, rmax) {
    const p = this.sys.nav.randomFree(this.home.x, this.home.z, rmin, rmax, this.rand);
    if (p) { this.tx = p.x; this.tz = p.z; return true; }
    return false;
  }
  tick(dt, S) {
    this.t += dt;
    this.sfxCD -= dt;
    this.timer -= dt;
    void S;
  }
}

// ---- dog ------------------------------------------------------------------------------------
class Dog extends Animal {
  constructor(sys, x, z, o) {
    super(sys, 'dog', x, z, o);
    this.q = makeQuad('dog', this.seed);
    this.root = this.q.root;
    this.follower = o.follow ?? this.rand() < 0.4;
    this.territorial = !this.follower && this.rand() < 0.7;
    this.barkCD = 4 + this.rand() * 10;
    this.followT = 0; this.followCD = 0;
    this.barks = 0; this.barkT = 0;
    this.state = 'rest';
    this.q.setPose(this.rand() < 0.5 ? 'sit' : 'lie');
    this.place();
  }
  update(dt, S) {
    this.tick(dt, S);
    const pd = this.playerDist();
    this.barkCD -= dt; this.followCD -= dt;
    const q = this.q;
    let wag = false, bark = false;
    switch (this.state) {
      case 'rest':
        this.targetSpeed = 0;
        if (this.timer <= 0) { this.pickNear(2, this.homeR); this.state = 'wander'; q.setPose('stand'); this.timer = 25; this.sp = 0.85 + this.rand() * 0.5; }
        break;
      case 'wander': {
        const r = this.stepTo(this.tx, this.tz, this.sp, dt);
        if (r !== 0 || this.timer <= 0) { this.state = this.rand() < 0.45 ? 'sniff' : 'rest'; this.timer = 2 + this.rand() * 4; q.setPose(this.state === 'sniff' ? 'sniff' : this.rand() < 0.5 ? 'sit' : 'lie'); if (this.state === 'rest') this.timer = 8 + this.rand() * 18; }
        break;
      }
      case 'sniff':
        this.targetSpeed = 0;
        if (this.timer <= 0) { this.state = 'rest'; this.timer = 6 + this.rand() * 12; q.setPose('sit'); }
        break;
      case 'follow': {
        wag = true;
        this.followT -= dt;
        const tx = S.player.x - Math.sin(S.playerYaw) * 2.2, tz = S.player.z - Math.cos(S.playerYaw) * 2.2;
        if (pd > 3.2) { const r = this.stepTo(tx, tz, Math.min(3.4, 0.6 + pd * 0.8), dt, 8); if (r === -1) this.followT = 0; }
        else { this.targetSpeed = 0; this.yaw = dampAngle(this.yaw, Math.atan2(S.player.x - this.x, S.player.z - this.z), 4, dt); q.setPose(S.playerSpeed < 0.3 ? 'sit' : 'stand'); }
        if (pd > 3.2 && q.pose === 'sit') q.setPose('stand');
        if (this.followT <= 0 || pd > 28) { this.state = 'wander'; this.followCD = 50 + this.rand() * 40; this.pickNear(3, this.homeR); this.timer = 20; this.sp = 1.3; q.setPose('stand'); }
        break;
      }
      case 'bark': {
        bark = true;
        this.targetSpeed = 0;
        this.yaw = dampAngle(this.yaw, Math.atan2(S.player.x - this.x, S.player.z - this.z), 5, dt);
        this.barkT -= dt;
        if (this.barkT <= 0) {
          if (this.barks <= 0) { this.state = 'rest'; this.timer = 4 + this.rand() * 6; q.setPose('stand'); bark = false; break; }
          this.barks--;
          this.barkT = 0.55 + this.rand() * 0.25;
          this.t = 0;
          this.sys.sfx('dog_bark', _v.set(this.x, this.y + 0.5, this.z), 0.7);
        }
        break;
      }
      default: break;
    }
    // reactions to Vesna
    if (this.state !== 'follow' && this.state !== 'bark' && !S.busy) {
      if (this.follower && pd < 11 && pd > 3 && this.followCD <= 0 && S.playerSpeed > 0.4) {
        this.state = 'follow'; this.followT = 14 + this.rand() * 18; q.setPose('stand');
        if (this.barkCD <= 0) { this.sys.sfx('dog_bark', _v.set(this.x, this.y + 0.5, this.z), 0.5); this.barkCD = 40; }
      } else if (pd < 9 && pd > 2 && this.barkCD <= 0 && (this.territorial || this.rand() < 0.2)) {
        this.state = 'bark'; this.barks = 1 + Math.floor(this.rand() * 3); this.barkT = 0.1; this.barkCD = 30 + this.rand() * 40; q.setPose('up');
      }
    }
    // body language: look at Vesna when she is near
    if (pd < 9 && this.state !== 'sniff') {
      const dy = wrapAngle(Math.atan2(S.player.x - this.x, S.player.z - this.z) - this.yaw);
      q.look(Math.max(-1, Math.min(1, dy)) * 0.8, -0.1);
    } else q.look(0, 0);
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 6);
    q.update(dt, this.speed, { wag: wag || (this.state === 'wander' && this.follower), bark, t: this.t, sway: 0.1 });
    this.place();
  }
}

// ---- goat -----------------------------------------------------------------------------------
class Goat extends Animal {
  constructor(sys, x, z, o) {
    super(sys, 'goat', x, z, o);
    this.q = makeQuad('goat', this.seed);
    this.root = this.q.root;
    this.homeR = o.r ?? 4;
    this.state = 'stand';
    this.buttT = 0;
    this.place();
  }
  update(dt, S) {
    this.tick(dt, S);
    const pd = this.playerDist();
    const q = this.q;
    let chew = false;
    switch (this.state) {
      case 'stand':
        this.targetSpeed = 0;
        chew = true;
        if (this.timer <= 0) {
          const r = this.rand();
          if (r < 0.5) { this.state = 'graze'; q.setPose('sniff'); this.timer = 3 + this.rand() * 6; }
          else if (!this.static && r < 0.85 && this.pickNear(1, this.homeR)) { this.state = 'wander'; q.setPose('stand'); this.timer = 12; }
          else { this.timer = 3 + this.rand() * 5; if (this.sfxCD <= 0 && this.d2 < 40 * 40) { this.sys.sfx('goat', _v.set(this.x, this.y + 0.6, this.z), 0.5); this.sfxCD = 20 + this.rand() * 30; } }
        }
        break;
      case 'graze':
        this.targetSpeed = 0; chew = true;
        if (this.timer <= 0) { this.state = 'stand'; q.setPose('stand'); this.timer = 2 + this.rand() * 4; }
        break;
      case 'wander': {
        const r = this.stepTo(this.tx, this.tz, 0.7, dt, 5);
        if (r !== 0 || this.timer <= 0) { this.state = 'stand'; this.timer = 2 + this.rand() * 5; }
        break;
      }
      case 'butt':
        this.targetSpeed = 0;
        this.buttT -= dt;
        if (this.buttT <= 0) { this.state = 'stand'; q.setPose('stand'); this.timer = 3; }
        break;
      default: break;
    }
    if (pd < 1.6 && this.state !== 'butt' && this.rand() < dt * 0.6 && !S.busy) { this.state = 'butt'; this.buttT = 0.9; q.setPose('crouch'); this.sys.sfx('goat', _v.set(this.x, this.y + 0.6, this.z), 0.5); }
    if (pd < 12 && this.state !== 'graze') {
      const dy = wrapAngle(Math.atan2(S.player.x - this.x, S.player.z - this.z) - this.yaw);
      if (this.static) this.yaw = dampAngle(this.yaw, this.yaw + dy, 1.2, dt);
      q.look(Math.max(-0.9, Math.min(0.9, dy)) * 0.7, 0);
    } else q.look(0, 0);
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 6);
    const hop = this.state === 'butt' ? Math.max(0, Math.sin(this.buttT * 7)) * 0.06 : 0;
    q.update(dt, this.speed, { chew, t: this.t, hop, sway: 0.2 });
    this.place();
  }
}

// ---- cat ------------------------------------------------------------------------------------
class Cat extends Animal {
  constructor(sys, x, z, o) {
    super(sys, 'cat', x, z, o);
    this.q = makeQuad('cat', this.seed);
    this.root = this.q.root;
    this.state = 'sit';
    this.q.setPose('sit');
    this.place();
  }
  update(dt, S) {
    this.tick(dt, S);
    const pd = this.playerDist();
    const q = this.q;
    let sway = 0.25;
    switch (this.state) {
      case 'sit':
        this.targetSpeed = 0;
        if (this.timer <= 0) { const r = this.rand(); this.timer = 6 + this.rand() * 14; q.setPose(r < 0.35 ? 'lie' : r < 0.6 ? 'sniff' : 'sit'); this.state = q.pose === 'sniff' ? 'groom' : 'sit'; if (this.state === 'groom') this.timer = 2.5; }
        break;
      case 'groom':
        this.targetSpeed = 0;
        if (this.timer <= 0) { this.state = 'sit'; q.setPose('sit'); this.timer = 6 + this.rand() * 10; }
        break;
      case 'flee': {
        const r = this.stepTo(this.tx, this.tz, 3.6, dt, 10);
        if (r !== 0 || this.timer <= 0) { this.state = 'sit'; q.setPose('sit'); this.timer = 4; }
        break;
      }
      case 'alert':
        this.targetSpeed = 0; sway = 0;
        if (this.timer <= 0) { this.state = 'sit'; q.setPose('sit'); this.timer = 5; }
        break;
      default: break;
    }
    if (!S.busy && pd < 2.4 && (this.state === 'sit' || this.state === 'groom')) {
      if (this.static) { this.state = 'alert'; q.setPose('stand'); this.timer = 3; }
      else {
        // bolt away from Vesna
        const a = Math.atan2(this.x - S.player.x, this.z - S.player.z) + (this.rand() - 0.5) * 1.2;
        this.tx = this.x + Math.sin(a) * 7; this.tz = this.z + Math.cos(a) * 7;
        this.state = 'flee'; this.timer = 4; q.setPose('stand');
      }
    }
    if (pd < 10) {
      const dy = wrapAngle(Math.atan2(S.player.x - this.x, S.player.z - this.z) - this.yaw);
      q.look(Math.max(-1.1, Math.min(1.1, dy)) * 0.8, 0);
    } else q.look(0, 0);
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 8);
    q.update(dt, this.speed, { t: this.t, sway });
    this.place();
  }
}

// ---- chicken --------------------------------------------------------------------------------
class Chicken extends Animal {
  constructor(sys, x, z, o) {
    super(sys, 'chicken', x, z, o);
    this.c = makeChicken(this.seed);
    this.root = this.c.root;
    this.homeR = o.r ?? 5;
    this.state = 'peck';
    this.flapT = 0;
    this.place();
  }
  update(dt, S) {
    this.tick(dt, S);
    const pd = this.playerDist();
    let peck = 0, flap = 0, hop = 0;
    switch (this.state) {
      case 'peck':
        this.targetSpeed = 0;
        peck = 0.5 + 0.5 * Math.max(0, Math.sin(this.t * 9 + this.seed));
        if (this.timer <= 0) { this.state = 'walk'; this.pickNear(0.5, this.homeR); this.timer = 6; }
        break;
      case 'walk': {
        const r = this.stepTo(this.tx, this.tz, 0.5, dt, 6);
        if (r !== 0 || this.timer <= 0) { this.state = this.rand() < 0.7 ? 'peck' : 'look'; this.timer = 1.5 + this.rand() * 4; }
        break;
      }
      case 'look':
        this.targetSpeed = 0;
        this.c.look = Math.sin(this.t * 1.7 + this.seed) * 0.7;
        if (this.timer <= 0) { this.state = 'peck'; this.timer = 2 + this.rand() * 4; this.c.look = 0; }
        break;
      case 'scatter': {
        this.flapT -= dt;
        flap = Math.min(1, this.flapT * 1.5);
        hop = Math.max(0, Math.sin(this.t * 14)) * 0.04;
        const r = this.stepTo(this.tx, this.tz, 3.4, dt, 12);
        if (r !== 0 || this.flapT <= 0) { this.state = 'look'; this.timer = 2 + this.rand() * 3; this.targetSpeed = 0; }
        break;
      }
      default: break;
    }
    if (this.state !== 'scatter' && !S.busy && (pd < 3.0 || (pd < 5 && S.playerSpeed > 3))) {
      const a = Math.atan2(this.x - S.player.x, this.z - S.player.z) + (this.rand() - 0.5) * 1.4;
      const d = 3 + this.rand() * 3;
      this.tx = this.x + Math.sin(a) * d; this.tz = this.z + Math.cos(a) * d;
      this.state = 'scatter'; this.flapT = 0.9 + this.rand() * 0.6;
      if (this.sfxCD <= 0 && this.d2 < 40 * 40) { this.sys.sfx('chicken', _v.set(this.x, this.y + 0.2, this.z), 0.45); this.sfxCD = 7 + this.rand() * 8; }
    }
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 10);
    this.c.update(dt, this.speed, { peck, flap, hop, t: this.t });
    this.place();
  }
}

// ---- raven / crow ---------------------------------------------------------------------------
class Corvid extends Animal {
  constructor(sys, kind, x, z, o) {
    super(sys, kind, x, z, o);
    this.b = makeBird(kind);
    this.root = this.b.root;
    this.ground = !!o.ground;
    this.perch = this.yFix != null ? { x, y: this.yFix, z } : null;
    this.homePerch = this.perch;
    this.state = this.ground ? 'ground' : 'perch';
    this.fly = null;
    this.cawCD = 8 + this.rand() * 30;
    this.away = 0;
    if (this.ground) this.y = this.G.world.heightAt(x, z);
    this.place();
  }
  update(dt, S) {
    this.tick(dt, S);
    const pd = this.playerDist();
    const b = this.b;
    this.cawCD -= dt;
    let peck = 0, crouch = 0;
    if (this.state === 'perch' || this.state === 'ground') {
      this.targetSpeed = 0;
      // fidget: look around, preen
      b.look = Math.sin(this.t * 0.9 + this.seed) * 0.9 * Math.max(0, Math.sin(this.t * 0.27 + this.seed));
      b.tilt = Math.sin(this.t * 1.3 + this.seed) * 0.25;
      if (this.state === 'ground') {
        if (this.timer <= 0) { this.pickNear(1, 6); this.timer = 2 + this.rand() * 4; }
        const r = this.stepTo(this.tx, this.tz, 0.6, dt, 6);
        peck = r === 1 || this.targetSpeed < 0.05 ? Math.max(0, Math.sin(this.t * 6 + this.seed)) * 0.8 : 0;
      }
      if (this.cawCD <= 0 && this.d2 < 55 * 55) { this.sys.sfx(this.kind, _v.set(this.x, this.y + 0.3, this.z), 0.4); this.cawCD = 18 + this.rand() * 40; crouch = 0.2; }
      // spooked
      if (!S.busy && (pd < (this.state === 'perch' ? 8.5 : 6) || (pd < 14 && S.playerSpeed > 4.5))) this.takeOff(S);
      else if (this.away > 0 && this.state === 'perch') {
        this.away -= dt;
      }
    }
    if (this.state === 'fly') this.flyStep(dt, S);
    this.speed = this.state === 'ground' ? this.targetSpeed : 0;
    b.update(dt, { t: this.t, peck, crouch, glide: this.fly && this.fly.glide, flapRate: 15 });
    this.place();
  }
  takeOff(S) {
    const to = this.pickDestination(S);
    const from = { x: this.x, y: this.y, z: this.z };
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const speed = 7 + this.rand() * 3;
    this.fly = { from, to, t: 0, dur: Math.max(2.5, dist / speed + 1.2), lift: 5 + this.rand() * 8, wob: this.rand() * 6, side: this.rand() < 0.5 ? -1 : 1, glide: false };
    this.state = 'fly';
    this.b.setFlying(true);
    if (this.d2 < 80 * 80) this.sys.sfx(this.kind, _v.set(this.x, this.y + 0.3, this.z), 0.6);
    this.cawCD = 6 + this.rand() * 10;
    this.lastX = from.x; this.lastZ = from.z; this.lastY = from.y;
  }
  pickDestination(S) {
    const range = this.away > 0 ? [60, 130] : [28, 75];
    const c = this.sys.pickPerch(this.x, this.z, range[0], range[1], S.player);
    if (c) { this.away = 0; return c; }
    // nothing to land on nearby: leave and come back later
    const a = Math.atan2(this.x - S.player.x, this.z - S.player.z) + (this.rand() - 0.5);
    this.away = 40;
    return { x: this.x + Math.sin(a) * 90, y: this.G.world.heightAt(this.x + Math.sin(a) * 90, this.z + Math.cos(a) * 90) + 0.1, z: this.z + Math.cos(a) * 90, ground: true };
  }
  flyStep(dt, S) {
    void S;
    const F = this.fly;
    F.t += dt;
    const u = Math.min(1, F.t / F.dur);
    const e = u * u * (3 - 2 * u);
    const arc = Math.sin(Math.PI * Math.pow(u, 0.8));
    const x = F.from.x + (F.to.x - F.from.x) * e;
    const z = F.from.z + (F.to.z - F.from.z) * e;
    const base = F.from.y + (F.to.y - F.from.y) * e;
    const dirx = F.to.x - F.from.x, dirz = F.to.z - F.from.z, dl = Math.hypot(dirx, dirz) || 1;
    const side = Math.sin(u * Math.PI * 2 + F.wob) * Math.min(6, dl * 0.08) * Math.sin(Math.PI * u);
    const nx = x + (-dirz / dl) * side, nz = z + (dirx / dl) * side;
    const ny = base + F.lift * arc;
    const dx = nx - this.x, dz = nz - this.z, dyy = ny - this.y;
    if (dt > 0) {
      const sp = Math.hypot(dx, dz) / dt;
      if (sp > 0.5) {
        const want = Math.atan2(dx, dz);
        const turn = wrapAngle(want - this.yaw);
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        this.b.bank += (-Math.max(-0.7, Math.min(0.7, turn * 2)) - this.b.bank) * Math.min(1, dt * 4);
        const climb = Math.atan2(dyy, Math.max(0.5, Math.hypot(dx, dz)));
        this.b.pitch += (-climb * 0.8 - this.b.pitch) * Math.min(1, dt * 5);
      }
    }
    this.x = nx; this.z = nz; this.y = ny;
    F.glide = u > 0.3 && u < 0.8 && F.dur > 6 && ((F.t * 0.5 + F.wob) % 3) > 1.6;
    if (u >= 1) {
      this.x = F.to.x; this.z = F.to.z; this.y = F.to.y;
      this.perch = F.to.ground ? null : F.to;
      this.state = F.to.ground ? 'ground' : 'perch';
      this.yFix = F.to.ground ? null : F.to.y;
      this.home = { x: F.to.x, z: F.to.z };
      this.b.setFlying(false);
      this.b.bank = 0; this.b.pitch = 0;
      this.fly = null;
      this.timer = 2;
    }
  }
}

export function createAnimals(sys) {
  const list = [];
  const rand = rng(777);
  const api = {
    list,
    spawn(kind, x, z, opts = {}) {
      let a;
      if ((kind === 'raven' || kind === 'crow') && opts.y == null && !opts.ground) {
        // find something to sit on: roofs and dead trees near the point
        const c = sys.perchesNear(x, z, 45);
        if (c.length) { const p = c[Math.floor(rand() * c.length)]; x = p.x; z = p.z; opts = { ...opts, y: p.y }; } else opts = { ...opts, ground: true };
      }
      if (kind === 'dog') a = new Dog(sys, x, z, opts);
      else if (kind === 'goat') a = new Goat(sys, x, z, opts);
      else if (kind === 'cat') a = new Cat(sys, x, z, opts);
      else if (kind === 'chicken') a = new Chicken(sys, x, z, opts);
      else if (kind === 'raven' || kind === 'crow') a = new Corvid(sys, kind, x, z, opts);
      else if (kind === 'horse') return null; // Kasza belongs to gameplay/Horse.js; the stable station is her parking spot
      else { console.warn(`[animals] unknown kind ${kind}`); return null; }
      sys.G.scene.add(a.root);
      list.push(a);
      return a;
    },
    spawnFlock(kind, x, z, n, opts = {}) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const ang = rand() * 6.28, d = 0.6 + rand() * (opts.spread ?? 3);
        out.push(api.spawn(kind, x + Math.sin(ang) * d, z + Math.cos(ang) * d, { ...opts, seed: (opts.seed || 0) + i * 13 + 1, home: { x, z } }));
      }
      return out;
    },
    remove(a) {
      const i = list.indexOf(a);
      if (i >= 0) list.splice(i, 1);
      a.dispose();
    },
    clear() { for (const a of list.splice(0)) a.dispose(); },
    update(dt, S) {
      const cx = S.cam.x, cz = S.cam.z;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const dx = a.x - cx, dz = a.z - cz;
        a.d2 = dx * dx + dz * dz;
        if (a.d2 > HIDE2) { if (!a.hidden) { a.hidden = true; a.root.visible = false; } continue; }
        if (a.hidden) { a.hidden = false; a.root.visible = true; }
        a.acc += dt;
        if (a.d2 > SLOW2 && a.acc < 0.1) continue;
        const step = Math.min(a.acc, 0.25);
        a.acc = 0;
        a.update(step, S);
      }
    },
    perchesNear: (x, z, r) => sys.perchesNear(x, z, r),
  };
  return api;
}
