// Marzanny: animated straw effigies in white rag dresses with pale wooden faces and an ice crust
// (the props effigy look, rebuilt on a skeleton). They sleep in snow drifts, burst out when Vesna
// comes near (or when told to), lurch toward her, telegraph a heavy overhead swing, and try to grab
// her (a grab holds her until she attacks or dodges free). Ember sets them alight: they burn, flail,
// pass the fire to neighbors, and collapse into wet straw leaving the red knot. Steel hurts them
// less than fire.
//
//   const e = G.creatures.spawnEffigy(x, z, { dormant: false, yaw, scale })
//   e.state: 'dormant' | 'rising' | 'idle' | 'lurch' | 'windup' | 'slam' | 'swing_recover' | 'grab_wind' | 'grab' |
//            'holding' | 'stagger' | 'burning' | 'collapse' | 'dead'
//   e.rise()      wake a dormant one       e.ignite()    set it alight
// Events: enemy:death (via combat), 'knot:taken' { x, z } when the red knot is picked up.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, lerp, damp, wrapAngle, smoothstep } from '../../core/util.js';
import { Creature } from './base.js';
import { makeSkinnedMulti } from './rig.js';
import { skirtPart, torsoPart, headPart, upperArmPart, lowerArmPart, pilePart, knotMesh } from './effigyParts.js';
import { props } from '../../world/props/index.js';

export const TUNE = {
  hp: 80,
  steel: 0.55, // steel damage multiplier
  walk: 1.55, rush: 2.1,
  windup: 0.95, slam: 0.22, slamRecover: 1.0, slamDamage: 21, slamReach: 2.05,
  grabWind: 0.55, grabDash: 0.34, grabRecover: 0.85, grabReach: 1.25, grabDps: 6, grabTick: 0.75,
  burn: 3.4, burnSpread: 1.7, spreadRate: 0.55,
  attackGap: [1.2, 2.6],
  aggro: 12, wake: 8.5,
  rise: 1.9,
};

const rr = (a, b) => a + Math.random() * (b - a);

// Every effigy gets its own copies of the props materials (same shader hooks, own emissive and tint) so
// one can flash, glow and char without touching the village props that share the originals.
function ownMaterial(m) {
  const c = m.clone();
  if (m.userData._mzHooks) c.userData._mzHooks = m.userData._mzHooks; // clone() would drop the hook functions
  delete c.userData._mzU;
  c.name = m.name;
  return c;
}

export class Effigy extends Creature {
  constructor(x, z, o = {}) {
    const root = new THREE.Group();
    super('effigy', { root, radius: 0.55, height: 1.75, health: TUNE.hp * (o.hpMul ?? 1), name: 'Marzanna', material: 'straw' });
    this.sc = o.scale ?? 1.22;
    this.seed = o.seed ?? Math.floor(Math.random() * 1000);
    this.heading = o.yaw ?? Math.random() * Math.PI * 2;
    // Build at the origin (the skin is baked in the group's frame), then place it.
    this._build();
    this.position.set(x, this.groundAt(x, z), z);
    this.root.rotation.y = this.heading;
    this.root.scale.setScalar(this.sc);
    this.state = 'dormant';
    this.stateT = 0;
    this.speed = 0;
    this.cycle = Math.random();
    this.burning = false;
    this.burnT = 0;
    this.flashT = 0;
    this.cool = rr(0.5, 1.5);
    this.attackKind = null;
    this.holdH = null;
    this.charred = 0;
    this.wakeR = o.wake ?? TUNE.wake;
    this.cur = this._poseDefaults();
    this.tgt = this._poseDefaults();
    this.mound = null;
    this.fires = [];
    this.fireLoop = null;
    this.hitRecent = 0;
    this.pile = null;
    this.knot = null;
    // Everyone starts buried in a drift; a dormant one waits for Vesna, the others burst out now.
    this._makeMound();
    this._applyPose(0);
    if (!o.dormant) this.rise();
  }

  // ---- construction ---------------------------------------------------------------------------------
  _build() {
    const bones = [];
    const mk = (name, parent, x = 0, y = 0, z = 0) => {
      const b = new THREE.Bone();
      b.name = name; b.position.set(x, y, z);
      if (parent) parent.add(b);
      bones.push(b);
      return b;
    };
    const root = mk('root', null);
    const hips = mk('hips', root, 0, 0.62, 0);
    const chest = mk('chest', hips, 0, 0, 0);
    const head = mk('head', chest, 0, 0.46, 0);
    const shL = mk('shL', chest, 0.17, 0.39, 0);
    const elL = mk('elL', shL, 0, -0.34, 0);
    const shR = mk('shR', chest, -0.17, 0.39, 0);
    const elR = mk('elR', shR, 0, -0.34, 0);
    this.bones = bones;
    this.b = { root, hips, chest, head, shL, elL, shR, elR };
    this.root.add(root);
    this.root.updateMatrixWorld(true);
    const byMat = new Map();
    const add = (group, bone) => {
      group.traverse((m) => {
        if (!m.isMesh) return;
        const list = byMat.get(m.material) || [];
        list.push({ geo: m.geometry, bone });
        byMat.set(m.material, list);
      });
    };
    const s = this.seed;
    add(skirtPart(s), hips);
    add(torsoPart(s + 1), chest);
    add(headPart(s + 2), head);
    add(upperArmPart(s + 3), shL); add(upperArmPart(s + 4), shR);
    add(lowerArmPart(s + 5), elL); add(lowerArmPart(s + 6), elR);
    const own = new Map();
    for (const [mat, parts] of byMat) own.set(ownMaterial(mat), parts);
    const { meshes, skeleton } = makeSkinnedMulti(bones, own, this.root);
    this.meshes = meshes;
    this.skeleton = skeleton;
    this.mats = [...own.keys()];
    this.mats.forEach((m) => { m.userData.emBase = m.name === 'ice' ? 0.2 : m.name === 'dress' ? 0.15 : m.name === 'face' ? 0.18 : 0.1; });
  }

  _poseDefaults() {
    return {
      lean: 0.12, hipPitch: 0, hipRoll: 0, twist: 0, shL: 0, shR: 0, elL: -0.1, elR: -0.1, shLz: 0.06, shRz: -0.06, headPitch: 0.1, headYaw: 0, headRoll: 0.05,
      bob: 0, squash: 1, y: 0, tilt: 0,
    };
  }

  // ---- mound ----------------------------------------------------------------------------------------------
  _makeMound() {
    try {
      this.mound = props.snowDrift({ width: 1.9, depth: 1.5, height: 0.72, seed: this.seed, yaw: this.heading, fx: false });
    } catch { this.mound = null; }
    if (this.mound) {
      this.mound.position.set(this.position.x, this.groundAt(this.position.x, this.position.z) - 0.03, this.position.z);
      G.scene.add(this.mound);
    }
    // Buried: folded small inside the drift with one pale hand showing.
    this.cur.y = -0.4; this.tgt.y = -0.4; this.cur.squash = 0.45; this.tgt.squash = 0.45;
    this.cur.lean = 1.1; this.tgt.lean = 1.1;
  }

  // Dormant ones stay out of the combat registry (no lock-on, no sign hits) until they come up.
  _register() {
    G.combat?.register?.(this);
  }

  rise() {
    if (this.state !== 'dormant' || !this.alive) return;
    this._register();
    this.go('rising');
    this.engaged = true;
    this.sfx('effigy_creak', { volume: 0.9 });
    this.sfx('ice_crack', { volume: 0.6, pitch: 1.1 });
  }

  go(state, extra) {
    this.state = state;
    this.stateT = 0;
    if (extra) Object.assign(this, extra);
  }

  // ---- combat contract ---------------------------------------------------------------------------------------
  takeHit(hit) {
    if (!this.alive || this.state === 'dormant') return { hit: false, damage: 0, killed: false };
    if (this.state === 'rising' && this.stateT < 0.7) return { hit: false, damage: 0, killed: false };
    let dmg = hit.damage;
    if (hit.source === 'sword') dmg *= TUNE.steel;
    this.health -= dmg;
    this.engaged = true;
    this.flashT = 0.07;
    this.hitRecent = 0.35;
    const dir = hit.dir || new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.vel.x += dir.x * (hit.knockback ?? 0) * 1.6; this.vel.z += dir.z * (hit.knockback ?? 0) * 1.6;
    this.sfx('effigy_creak', { volume: 0.5, pitch: rr(0.9, 1.2) });
    const killed = this.health <= 0;
    if (killed) { this.collapse(dir); } else if (this.holdH) {
      this.flashT = 0.07; // the grip tightens or slips: breaking free is counted by the combat module
    } else if (hit.stagger && this.state !== 'burning') {
      this.go('stagger', { dur: 0.8 });
    } else if (this.state === 'windup' || this.state === 'grab_wind') {
      if (hit.stagger) this.go('stagger', { dur: 0.6 });
    }
    return { hit: true, damage: dmg, killed, material: 'straw' };
  }

  onParried() {
    this.releaseHold();
    this.go('stagger', { dur: 1.4 });
    this.vel.x -= Math.sin(this.heading) * 2; this.vel.z -= Math.cos(this.heading) * 2;
    this.sfx('effigy_creak', { volume: 0.7, pitch: 0.8 });
  }

  onSign(sign, info) {
    if (!this.alive || this.state === 'dormant' || this.state === 'rising') {
      if (this.state === 'dormant') this.rise();
      return false;
    }
    if (sign === 'ember') { this.ignite(); return true; }
    if (sign === 'gale') {
      this.vel.x += info.dir.x * 5; this.vel.z += info.dir.z * 5;
      this.releaseHold();
      this.go('stagger', { dur: 0.9 });
      this.health -= 5;
      this.flashT = 0.06;
      return true;
    }
    return false;
  }

  ignite() {
    if (this.burning || !this.alive) return;
    this.burning = true;
    this.burnT = 0;
    this.engaged = true;
    this.releaseHold();
    this.sfx('ignite', { volume: 0.9 });
    if (this.fireLoop === null) this.fireLoop = G.audio?.loop?.('effigy_fire', { pos: this.position, volume: 0.9 }) || false;
    try {
      this.fires.push(props.fx.fire({ position: [0, 0.9, 0], parent: this.b.chest, scale: 1.2, radius: 0.3, height: 0.9, light: true, smoke: true, prewarm: false }));
      this.fires.push(props.fx.fire({ position: [0, 0.2, 0], parent: this.b.hips, scale: 1.0, radius: 0.4, height: 0.8, light: false, smoke: false, prewarm: false }));
    } catch { /* fx pool unavailable */ }
    this._register();
    if (this.state === 'dormant') this.go('rising');
    else this.go('burning');
    this.dur = 0;
  }

  collapse(dir) {
    if (this.state === 'collapse' || this.state === 'dead') return;
    this.releaseHold();
    this.go('collapse', { fallDir: dir ? Math.atan2(dir.x, dir.z) : this.heading });
    this.die(); // alive = false, enemy:death
    this.sfx('effigy_collapse', { volume: 1.0 });
    this.engaged = false;
  }

  // ---- hold (grab) --------------------------------------------------------------------------------------------
  startHold() {
    if (this.holdH) return;
    const self = this;
    this.holdH = G.combat?.hold?.(this, {
      anchor: () => this._holdPoint(),
      breakAt: 3, maxTime: 4.4, dps: TUNE.grabDps, tick: TUNE.grabTick,
      onEnd: (h, why) => { if (self.holdH === h) self.holdH = null; if (self.alive && self.state === 'holding') self.go('stagger', { dur: 1.0 }); void why; },
    }) || null;
    if (this.holdH) this.go('holding');
    else this.go('swing_recover', { dur: 0.6 });
  }

  _holdPoint() {
    const x = this.position.x + Math.sin(this.heading) * 0.95, z = this.position.z + Math.cos(this.heading) * 0.95;
    return new THREE.Vector3(x, this.groundAt(x, z), z);
  }

  releaseHold() {
    if (this.holdH) { const h = this.holdH; this.holdH = null; G.combat?.release?.(h, 'released'); }
  }

  // ---- movement ---------------------------------------------------------------------------------------------------
  moveToward(dt, tx, tz, speed, turn = 2.6) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) this.turnToward(Math.atan2(dx, dz), turn, dt);
    // Stop-start lurch: the figure is dragged forward in jerks.
    const ph = (this.cycle % 1);
    const jerk = 0.35 + 0.9 * Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2 + 0.6)), 1.4);
    const sp = speed * jerk * clamp(0.3 + 0.7 * Math.cos(Math.min(1.3, Math.abs(wrapAngle(Math.atan2(dx, dz) - this.heading)))), 0, 1);
    this.speed += (sp - this.speed) * Math.min(1, dt * 9);
    this.step(Math.sin(this.heading) * this.speed * dt, Math.cos(this.heading) * this.speed * dt);
    this.cycle += dt * (0.45 + this.speed * 0.5);
    return d;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.disposed) return;
    dt = this.tick(dt);
    const P = G.player;
    const tp = this.toPlayer(this._tp || (this._tp = {}));
    this.stateT += dt;
    this.cool -= dt;
    this.hitRecent = Math.max(0, this.hitRecent - dt);
    const pAlive = this.playerAlive();
    // Pose targets reset each frame to the resting stance; states override them.
    const T = this.tgt;
    Object.assign(T, this._poseDefaults());
    T.lean = 0.14; T.hipPitch = 0.04;

    switch (this.state) {
      case 'dormant':
        this._dormant(dt, tp);
        break;
      case 'rising': this._rising(); break;
      case 'idle': this._idle(dt, tp, pAlive); break;
      case 'lurch': this._lurch(dt, tp, pAlive); break;
      case 'windup': this._windup(dt, tp); break;
      case 'slam': this._slam(dt, tp); break;
      case 'swing_recover': this._swingRecover(); break;
      case 'grab_wind': this._grabWind(dt, tp); break;
      case 'grab': this._grab(dt, tp); break;
      case 'holding': this._holding(dt, tp); break;
      case 'stagger': this._stagger(); break;
      case 'burning': this._burning(dt, tp); break;
      case 'collapse': this._collapse(dt); break;
      case 'dead': this._dead(dt); break;
      default: break;
    }

    if (this.alive && this.state !== 'dormant') {
      this.applyKnock(dt, 7);
      this._separateFromOthers(dt);
      if (this.state !== 'holding') this.keepOffPlayer(this.radius + 0.38 * 0.6);
    }
    if (this.burning && this.alive) this._burnTick(dt);
    // Flash and charring.
    if (this.flashT > 0) this.flashT -= dt;
    this._lightMaterials();
    this.root.rotation.y = this.heading;
    this._applyPose(dt);
    void P;
  }

  _separateFromOthers(dt) {
    const list = G.creatures?.effigies;
    if (list) this.separate(list, dt, 3);
  }

  // ---- states ----------------------------------------------------------------------------------------------------------------
  _dormant(dt, tp) {
    const T = this.tgt;
    // Just the lump in the snow: a hand showing, breathing very slightly.
    T.squash = 0.45; T.y = -0.4; T.lean = 1.1 + Math.sin(this.t * 1.3) * 0.02; T.shL = -0.9; T.shR = 0.3;
    if (this.mound && this.mound.userData) { /* the drift is static */ }
    if (this.playerAlive() && tp.d < this.wakeR) this.rise();
  }

  _rising() {
    const T = this.tgt;
    const D = TUNE.rise;
    const u = clamp(this.stateT / D);
    // Stepped, puppet-like unfolding.
    const k = Math.floor(u * 7) / 7 * 0.6 + u * 0.4;
    T.squash = lerp(0.45, 1, smoothstep(0.08, 0.95, k));
    T.y = lerp(-0.4, 0, smoothstep(0, 0.8, k));
    T.lean = lerp(1.1, 0.12, smoothstep(0.15, 1, k)) + Math.sin(this.stateT * 18) * 0.05 * (1 - u);
    T.shL = lerp(-0.9, 0.0, smoothstep(0.2, 1, k)) + Math.sin(this.stateT * 9) * 0.15 * (1 - u);
    T.shR = lerp(0.3, 0.0, smoothstep(0.2, 1, k));
    T.headPitch = lerp(0.9, 0.1, smoothstep(0.3, 1, k));
    T.hipRoll = Math.sin(this.stateT * 14) * 0.08 * (1 - u);
    if (!this._r1 && u > 0.18) {
      this._r1 = true;
      props.fx.burst('snow', [this.position.x, this.position.y + 0.4, this.position.z], { count: 28, speed: 3.2, up: 1.4, size: 0.24 });
      G.combat?.fx?.chips({ x: this.position.x, y: this.position.y + 0.5, z: this.position.z }, { kind: 'ice', count: 14, speed: 3.2, up: 3 });
      this.sfx('ice_crack', { volume: 0.7 });
    }
    if (!this._r2 && u > 0.55) {
      this._r2 = true;
      props.fx.burst('snow', [this.position.x, this.position.y + 0.9, this.position.z], { count: 30, speed: 3.8, up: 1.8, size: 0.26 });
      G.combat?.fx?.chips({ x: this.position.x, y: this.position.y + 1.0, z: this.position.z }, { kind: 'ice', count: 18, speed: 4, up: 3.4 });
      G.combat?.fx?.chips({ x: this.position.x, y: this.position.y + 1.0, z: this.position.z }, { kind: 'straw', count: 10, speed: 3, up: 2.5 });
      this.sfx('effigy_creak', { volume: 0.8, pitch: 0.8 });
      if (this.mound) this._collapseMound();
      G.cameraRig?.shake?.(0.1, 0.25);
    }
    this.speed = 0;
    if (u >= 1) {
      this._r1 = this._r2 = false;
      this.go(this.burning ? 'burning' : 'lurch');
      this.engaged = true;
    }
  }

  _collapseMound() {
    const m = this.mound;
    if (!m) return;
    this.moundT = 0;
  }

  _idle(dt, tp, pAlive) {
    const T = this.tgt;
    T.lean = 0.1 + Math.sin(this.t * 1.1) * 0.03; T.headYaw = Math.sin(this.t * 0.6) * 0.3;
    this.speed *= 0.9;
    if (pAlive && tp.d < TUNE.aggro) { this.engaged = true; this.go('lurch'); }
    void dt;
  }

  _lurch(dt, tp, pAlive) {
    const T = this.tgt;
    if (!pAlive) { this.go('idle'); return; }
    const d = this.moveToward(dt, G.player.position.x, G.player.position.z, tp.d > 6 ? TUNE.rush : TUNE.walk);
    this._walkPose(T);
    T.headYaw = clamp(wrapAngle(tp.yaw - this.heading), -0.9, 0.9) * 0.8;
    // Decide to attack once close and rested.
    if (d < 2.55 && this.cool <= 0 && this._canAttack()) {
      if (Math.random() < 0.62) this.go('windup');
      else this.go('grab_wind');
      this.sfx('effigy_creak', { volume: 0.8, pitch: 0.9 });
    }
    if (d > 40) { this.engaged = false; this.go('idle'); }
  }

  // At most two effigies swing at once; the others keep closing in.
  _canAttack() {
    const list = G.creatures?.effigies || [];
    let n = 0;
    for (const e of list) if (e !== this && e.alive && (e.state === 'windup' || e.state === 'slam' || e.state === 'grab_wind' || e.state === 'grab' || e.state === 'holding')) n++;
    return n < 2;
  }

  _walkPose(T) {
    const ph = this.cycle * Math.PI * 2;
    const sp = clamp(this.speed / 1.8);
    T.lean = 0.16 + 0.12 * sp + 0.09 * Math.sin(ph * 2);
    T.hipRoll = Math.sin(ph) * 0.17 * (0.5 + sp);
    T.hipPitch = 0.05 + Math.sin(ph * 2 + 1) * 0.07 * (0.4 + sp);
    T.twist = Math.sin(ph) * 0.26;
    T.shL = Math.sin(ph) * 0.8 * (0.4 + sp) + 0.2; T.shR = -Math.sin(ph) * 0.8 * (0.4 + sp) + 0.2;
    T.elL = -0.2 - 0.4 * Math.max(0, Math.sin(ph)) * (0.4 + sp); T.elR = -0.2 - 0.4 * Math.max(0, -Math.sin(ph)) * (0.4 + sp);
    T.shLz = 0.3; T.shRz = -0.3;
    T.headRoll = Math.sin(ph + 0.8) * 0.12; T.headPitch = 0.14 + 0.1 * Math.sin(ph * 2);
    T.bob = Math.abs(Math.sin(ph)) * 0.04 * sp;
  }

  _windup(dt, tp) {
    const T = this.tgt;
    this.speed *= 0.8;
    this.turnToward(tp.yaw, 1.8, dt);
    const u = clamp(this.stateT / TUNE.windup);
    const e = smoothstep(0, 1, u);
    T.shL = -2.65 * e; T.shR = -2.65 * e; T.elL = -0.35 * e; T.elR = -0.35 * e; T.shLz = 0.25 * e; T.shRz = -0.25 * e;
    T.lean = -0.1 - 0.35 * e; T.hipPitch = -0.12 * e; T.headPitch = -0.3 * e;
    T.bob = Math.sin(this.stateT * 40) * 0.01 * e; // a shudder as it strains
    T.y = 0.06 * e;
    if (this.stateT >= TUNE.windup) this.go('slam');
  }

  _slam(dt) {
    const T = this.tgt;
    const D = TUNE.slam;
    const u = clamp(this.stateT / D);
    T.shL = lerp(-2.65, -0.35, smoothstep(0, 0.7, u)); T.shR = T.shL;
    T.elL = -0.2; T.elR = -0.2;
    T.lean = lerp(-0.45, 0.72, smoothstep(0, 0.7, u)); T.hipPitch = lerp(-0.12, 0.28, smoothstep(0, 0.7, u));
    T.headPitch = lerp(-0.3, 0.45, u);
    // Move into the blow.
    if (u < 0.6) this.step(Math.sin(this.heading) * 3.2 * dt, Math.cos(this.heading) * 3.2 * dt);
    if (!this._hit && this.stateT >= D * 0.62) {
      this._hit = true;
      const hx = this.position.x + Math.sin(this.heading) * 1.2, hz = this.position.z + Math.cos(this.heading) * 1.2;
      const P = G.player;
      const d = Math.hypot(P.position.x - hx, P.position.z - hz);
      props.fx.burst('snow', [hx, this.position.y + 0.15, hz], { count: 24, speed: 4, up: 1.2, size: 0.22 });
      G.combat?.fx?.chips({ x: hx, y: this.position.y + 0.15, z: hz }, { kind: 'ice', count: 10, speed: 3.6, up: 3 });
      this.sfx('hit_ice', { volume: 0.8, pitch: 0.7 });
      G.cameraRig?.shake?.(clamp(0.32 - Math.hypot(P.position.x - hx, P.position.z - hz) * 0.03, 0.08, 0.32), 0.3);
      if (d < TUNE.slamReach * 0.78 + 0.5 && this.playerAlive()) {
        G.combat?.strike?.(this, TUNE.slamDamage, { knockback: 1.6, stagger: true, point: new THREE.Vector3(hx, this.position.y + 1, hz) });
      }
    }
    if (this.stateT >= D + 0.1) { this._hit = false; this.go('swing_recover', { dur: TUNE.slamRecover }); }
  }

  _swingRecover() {
    const T = this.tgt;
    const dur = this.dur || TUNE.slamRecover;
    const u = clamp(this.stateT / dur);
    T.shL = lerp(-0.35, 0.1, u); T.shR = T.shL;
    T.lean = lerp(0.72, 0.15, smoothstep(0.2, 1, u)); T.hipPitch = lerp(0.28, 0.04, u);
    T.headPitch = lerp(0.45, 0.1, u);
    this.speed *= 0.85;
    if (this.stateT >= dur) { this.cool = rr(TUNE.attackGap[0], TUNE.attackGap[1]); this.go('lurch'); }
  }

  _grabWind(dt, tp) {
    const T = this.tgt;
    this.speed *= 0.8;
    this.turnToward(tp.yaw, 3.5, dt);
    const u = clamp(this.stateT / TUNE.grabWind);
    const e = smoothstep(0, 1, u);
    T.shL = -1.45 * e; T.shR = -1.45 * e; T.shLz = 0.55 * e; T.shRz = -0.55 * e; T.elL = -0.1; T.elR = -0.1;
    T.lean = 0.05 - 0.2 * e; T.headPitch = -0.2 * e; T.bob = Math.sin(this.stateT * 38) * 0.012 * e;
    if (this.stateT >= TUNE.grabWind) this.go('grab');
  }

  _grab(dt) {
    const T = this.tgt;
    const D = TUNE.grabDash;
    const u = clamp(this.stateT / D);
    T.shL = -1.55; T.shR = -1.55; T.shLz = lerp(0.55, 0.12, u); T.shRz = -lerp(0.55, 0.12, u); T.elL = -0.2; T.elR = -0.2;
    T.lean = 0.5 * Math.sin(u * Math.PI * 0.8); T.hipPitch = 0.22;
    T.headPitch = 0.3;
    if (u < 0.85) this.step(Math.sin(this.heading) * 6.5 * dt, Math.cos(this.heading) * 6.5 * dt);
    if (!this._hit && u > 0.25) {
      const P = G.player;
      const dx = P.position.x - this.position.x, dz = P.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      const front = d > 1e-3 ? (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / d : 1;
      if (d < TUNE.grabReach + 0.45 && front > 0.35 && this.playerAlive() && !P.isInvulnerable()) {
        this._hit = true;
        this.startHold();
        return;
      }
    }
    if (u >= 1) { this._hit = false; this.go('swing_recover', { dur: TUNE.grabRecover }); }
  }

  _holding(dt, tp) {
    const T = this.tgt;
    this.speed = 0;
    this.turnToward(tp.yaw, 3, dt);
    // Arms wrapped around her, head bowed to hers.
    T.shL = -1.2 + Math.sin(this.t * 6) * 0.08; T.shR = T.shL; T.elL = -1.1; T.elR = -1.1; T.shLz = -0.25; T.shRz = 0.25;
    T.lean = 0.42; T.headPitch = 0.55; T.hipPitch = 0.2; T.bob = Math.sin(this.t * 9) * 0.015;
    if (!this.holdH) this.go('stagger', { dur: 0.9 });
  }

  _stagger() {
    const T = this.tgt;
    const dur = this.dur || 0.8;
    const u = clamp(this.stateT / dur);
    const hit = 1 - smoothstep(0, 0.3, u);
    T.lean = -0.25 * hit + 0.3 * (1 - hit) * (1 - u); T.hipPitch = -0.15 * hit; T.headPitch = -0.5 * hit + 0.3 * u;
    T.shL = -0.3 * hit; T.shR = -0.3 * hit; T.shLz = 0.4 * hit; T.shRz = -0.4 * hit;
    T.hipRoll = Math.sin(this.stateT * 24) * 0.12 * hit;
    this.speed *= 0.8;
    if (this.stateT >= dur) { this.cool = Math.min(this.cool, rr(0.3, 0.9)); this.go(this.burning ? 'burning' : 'lurch'); }
  }

  // ---- fire ------------------------------------------------------------------------------------------------------------------------
  _burning(dt, tp) {
    const T = this.tgt;
    const t = this.stateT;
    // Panic: stumbling in a wandering direction, arms thrashing.
    if (!this._wander || t - this._wanderT > 0.6) { this._wander = this.heading + rr(-1.6, 1.6); this._wanderT = t; }
    this.turnToward(this._wander, 4, dt);
    this.speed += (1.7 * (0.5 + 0.5 * Math.sin(t * 7)) - this.speed) * Math.min(1, dt * 6);
    this.step(Math.sin(this.heading) * this.speed * dt, Math.cos(this.heading) * this.speed * dt);
    this.cycle += dt * 1.2;
    this._walkPose(T);
    T.shL = Math.sin(t * 11) * 1.3 - 1.2; T.shR = Math.sin(t * 9 + 2) * 1.3 - 1.2;
    T.elL = -0.8 + Math.sin(t * 15) * 0.5; T.elR = -0.8 + Math.sin(t * 13 + 1) * 0.5;
    T.shLz = 0.5; T.shRz = -0.5;
    T.hipRoll = Math.sin(t * 8) * 0.22; T.lean = 0.25 + Math.sin(t * 6) * 0.2;
    T.headPitch = -0.4 + Math.sin(t * 12) * 0.3; T.headRoll = Math.sin(t * 10) * 0.35;
    // It still lashes out at first, if she is adjacent.
    if (t < 0.9 && tp.d < 1.6 && this.cool <= 0 && this.playerAlive() && !this._burnSwung) {
      this._burnSwung = true;
      G.combat?.strike?.(this, 8, { knockback: 0.8, point: this.hitCenter() });
    }
  }

  _burnTick(dt) {
    this.burnT += dt;
    // Health drains over the burn time; the knot is guaranteed once it goes.
    const rate = (this.maxHealth * 1.05) / TUNE.burn;
    this.health -= rate * dt;
    this.charred = clamp((this.burnT - 0.8) / 1.6);
    // Flames grow, then die with it.
    const k = 1 + this.burnT * 0.2;
    for (const f of this.fires) f.setIntensity(clamp(k, 1, 1.6));
    if (this.fireLoop) this.fireLoop.setPos?.(this.position);
    // Spread to neighbors.
    const list = G.creatures?.effigies || [];
    for (const e of list) {
      if (e === this || e.burning || !e.alive || e.state === 'dormant') continue;
      const d = Math.hypot(e.position.x - this.position.x, e.position.z - this.position.z);
      if (d < TUNE.burnSpread && Math.random() < TUNE.spreadRate * dt) e.ignite();
    }
    if (this.health <= 0 && this.alive) this.collapse(null);
  }

  // Moonlit pallor, the hit flash and the fire glow all ride the emissive of the effigy's own materials.
  _lightMaterials() {
    const night = G.uniforms?.uNight?.value ?? 0.5;
    const flash = this.flashT > 0 ? 1 : 0;
    const burn = this.burning ? clamp(this.burnT / 1.2) : 0;
    const flick = 0.75 + 0.25 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3);
    const ch = this.charred;
    for (const m of this.mats) {
      const base = m.userData.emBase * (0.2 + 0.8 * night) * (1 - ch * 0.9);
      let r = base * 0.85, g = base * 0.95, b = base * 1.15;
      if (m.name === 'ice') { r *= 0.7; g *= 1.1; b *= 1.3; }
      if (burn > 0) {
        const hot = m.name === 'straw' || m.name === 'ribbon' ? 1 : 0.55;
        r += burn * (1 - ch * 0.4) * 0.9 * hot * flick; g += burn * 0.32 * hot * flick; b += burn * 0.06 * hot;
      }
      if (flash) { r += 1.3; g += 1.15; b += 1.0; }
      m.emissive.setRGB(r, g, b);
      const dark = m.name === 'ice' ? 1 : 1 - ch * (m.name === 'dress' || m.name === 'ribbon' || m.name === 'straw' ? 0.9 : 0.6);
      m.color.setScalar(dark);
    }
  }

  // ---- collapse and remains ---------------------------------------------------------------------------------------------------------
  _collapse(dt) {
    const T = this.tgt;
    const D = 1.25;
    const u = clamp(this.stateT / D);
    const f = smoothstep(0, 0.7, u);
    T.lean = 0.2 + 1.2 * f; T.hipPitch = 0.1 + 1.0 * f; T.shL = 0.8 * f; T.shR = 0.8 * f; T.elL = -0.9 * f; T.elR = -0.9 * f; T.headPitch = 0.8 * f;
    T.squash = 1 - 0.55 * f; T.y = -0.18 * f;
    this.speed = 0;
    this.applyKnock(dt, 5);
    if (this.stateT < 0.12 && !this._cpuff) {
      this._cpuff = true;
      G.combat?.fx?.chips(this.hitCenter(), { kind: 'straw', count: 22, speed: 3.4, up: 3 });
    }
    // Flames die over the last stretch.
    if (u > 0.55) for (const f2 of this.fires) f2.setIntensity(Math.max(0, 1 - (u - 0.55) / 0.35));
    if (u >= 1) this._leaveRemains();
  }

  _leaveRemains() {
    for (const f of this.fires) f.dispose();
    this.fires.length = 0;
    this.fireLoop?.stop?.(0.6);
    this.fireLoop = null;
    const px = this.position.x, pz = this.position.z, py = this.groundAt(px, pz);
    try {
      this.pile = pilePart(this.seed + 9);
      this.pile.position.set(px, py, pz);
      this.pile.rotation.y = this.heading;
      G.scene.add(this.pile);
    } catch { this.pile = null; }
    // The red knot.
    this.knot = knotMesh();
    this.knot.position.set(px + 0.18, py + 0.16, pz + 0.1);
    G.scene.add(this.knot);
    this.knotId = G.interact?.add?.({
      id: `red_knot_${this.seed}`, pos: () => this.knot?.position || this.position, radius: 1.8, label: 'Red knot', verb: 'Take',
      onUse: async () => { this._takeKnot(); },
    });
    this.root.visible = false;
    this.burning = false;
    if (this.mound) { G.scene.remove(this.mound); this.mound = null; }
    this.go('dead');
    this.deadT = 0;
  }

  _takeKnot() {
    if (!this.knot) return;
    G.scene.remove(this.knot);
    this.knot = null;
    if (this.knotId != null) G.interact?.remove?.(this.knotId);
    this.knotId = null;
    G.state?.give?.('red_knot', 1);
    G.ui?.notify?.('Red knot taken', 'item');
    G.audio?.sfx?.('item_pickup');
    G.events.emit('knot:taken', { x: this.position.x, z: this.position.z, seed: this.seed });
  }

  _dead(dt) {
    this.deadT = (this.deadT || 0) + dt;
    if (this.knot) {
      this.knot.rotation.y += dt * 0.6;
      this.knot.position.y = this.groundAt(this.position.x, this.position.z) + 0.16 + Math.sin(this.t * 1.7) * 0.015;
    }
  }

  // ---- pose application ----------------------------------------------------------------------------------------------------------------------
  _applyPose(dt) {
    const c = this.cur, t = this.tgt, B = this.b;
    const lam = this.state === 'slam' ? 40 : this.state === 'burning' ? 18 : this.state === 'rising' ? 12 : 10;
    for (const k of Object.keys(t)) c[k] = dt > 0 ? damp(c[k], t[k], k === 'squash' || k === 'y' ? 9 : lam, dt) : t[k];
    B.hips.position.y = 0.62 + c.bob;
    B.hips.rotation.set(c.hipPitch, 0, c.hipRoll);
    B.chest.rotation.set(c.lean - c.hipPitch * 0.4, c.twist, 0);
    B.head.rotation.set(c.headPitch, c.headYaw, c.headRoll);
    B.shL.rotation.set(c.shL, 0, c.shLz);
    B.shR.rotation.set(c.shR, 0, c.shRz);
    B.elL.rotation.set(c.elL, 0, 0);
    B.elR.rotation.set(c.elR, 0, 0);
    B.root.position.y = c.y;
    B.root.scale.set(1 + (1 - c.squash) * 0.35, c.squash, 1 + (1 - c.squash) * 0.35);
    // The drift sags as the figure comes out of it.
    if (this.mound && this.moundT != null) {
      this.moundT += dt;
      const k = clamp(1 - this.moundT / 0.8);
      this.mound.scale.setScalar(Math.max(0.001, k * k));
      if (k <= 0) { G.scene.remove(this.mound); this.mound = null; this.moundT = null; }
    }
    if (this.mound && this.state === 'dormant') this.mound.scale.set(1, 1 + Math.sin(this.t * 1.1) * 0.01, 1);
  }

  hitCenter(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + 1.05 * this.sc, this.position.z);
  }

  dispose() {
    if (this.disposed) return;
    this.releaseHold();
    for (const f of this.fires) f.dispose();
    this.fires.length = 0;
    this.fireLoop?.stop?.(0.2);
    if (this.mound) G.scene.remove(this.mound);
    if (this.pile) G.scene.remove(this.pile);
    if (this.knot) G.scene.remove(this.knot);
    if (this.knotId != null) G.interact?.remove?.(this.knotId);
    for (const m of this.meshes) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.skeleton.dispose();
    super.dispose();
  }
}
