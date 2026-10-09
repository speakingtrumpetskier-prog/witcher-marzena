// Character: the public object returned by createCharacter (see ARCHITECTURE.md "Characters").
//
//   c.root (feet at origin, +Z forward), c.mesh, c.bones, c.height, c.yaw, c.setPosition(x, z)
//   c.play(clip, { loop, fade, speed, hold, then }) -> Promise (one-shots resolve at the end)
//   c.playUpper(clip, opts), c.stopUpper(fade), c.setLocomotion(mps), c.walkTo(x, z | path, opts) -> Promise(true on arrival, false if interrupted)
//   c.lookAt(target | null), c.talk(bool), c.gesture(name), c.attach(socket, obj), c.detach(obj)
//   c.setVisible(bool), c.dispose()
// Extras: c.expression(name, amount, fade), c.setFace({ smile, ... }), c.setRestFace({ frown, ... }), c.drawSword(kind),
//   c.sheatheSword(), c.swordDrawn, c.onEvent(fn) (clip events: 'hit', 'step', 'sword_draw'...),
//   c.stop(), c.locoSet({ idle, walk, run, sprint }), c.cold (bool), c.ground (fn override).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { buildCharacter } from './build.js';
import { Animator } from './animator.js';
import { Springs } from './springs.js';
import { armJoints } from './rig.js';
import { makeSword } from './gear.js';
import { getClip } from './clips/index.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const ADDITIVE = new Set(['nod', 'shake_head', 'hit_flinch']);

export class Character {
  constructor(spec) {
    const b = buildCharacter(spec);
    this.spec = spec;
    this.id = spec.id || 'character';
    this.root = new THREE.Group();
    this.root.name = `char_${this.id}`;
    this.root.userData.character = this;
    this.mesh = b.mesh;
    this.root.add(this.mesh);
    this.rig = b.rig;
    this.M = b.M;
    this.look = b.look;
    this.FP = b.FP;
    this.material = b.material;
    this.faceTex = b.faceTex;
    this.height = b.M.H;
    this.seedPhase = Math.random() * 6.28;
    const by = this.rig.byName;
    this.bones = {};
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'shoulderL', 'shoulderR', 'armL', 'armR', 'forearmL', 'forearmR',
      'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'eyeL', 'eyeR']) this.bones[n] = by[n];
    this.anim = new Animator(this);
    this.springs = new Springs(this);
    this.speed = 0;
    this.autoGround = true;
    this.ground = null;
    this._walk = null;
    this._listeners = [];
    this._prevYaw = 0;
    this.swordDrawn = false;
    this.visible = true;
    this.lodRate = 0;
    this._acc = 0;
    this.cold = false;
    this._makeSockets();
    if (spec.loco) this.locoSet(spec.loco);
    this.anim.update(0, { lod: 0 });
  }

  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
  get position() { return this.root.position; }

  groundAt(x, z) {
    if (this.ground) return this.ground(x, z);
    const gc = G.characters;
    if (gc && gc.heightAt) return gc.heightAt(x, z);
    return G.world ? G.world.heightAt(x, z) : 0;
  }

  setPosition(x, z, y) {
    this.root.position.set(x, y ?? this.groundAt(x, z), z);
    this.springs.reset();
    return this;
  }

  play(name, o = {}) {
    this._cancelWalk();
    if (o.loop === undefined) {
      const c = getClip(name);
      if (c) o = { ...o, loop: c.loop };
    }
    if (name === 'idle' || name === 'walk' || name === 'run' || name === 'sprint') {
      // locomotion clips go through the blend tree
      if (name === 'idle') { this.setLocomotion(0); this.anim.toLoco(o.fade ?? 0.3); return Promise.resolve(); }
    }
    return this.anim.play(name, o);
  }
  playUpper(name, o = {}) { return this.anim.playUpper(name, o); }
  stopUpper(fade = 0.3) { this.anim.stopUpper(fade); }
  stop(fade = 0.3) { this._cancelWalk(); this.setLocomotion(0); this.anim.toLoco(fade); }

  // Any interruption of a walk (play, stop, another walkTo, setLocomotion, dispose) resolves the
  // pending walkTo promise with false, so awaiting scripts never hang.
  _cancelWalk() {
    const W = this._walk;
    if (!W) return;
    this._walk = null;
    this.targetSpeed = 0;
    W.resolve(false);
  }

  setLocomotion(speed) {
    this._cancelWalk();
    this.targetSpeed = Math.max(0, speed);
    if (speed > 0.05) this.anim.toLoco(0.25);
    return this;
  }
  locoSet(set) {
    Object.assign(this.anim.loco.set, set);
    return this;
  }

  // Walk (or run) along a straight line or a path; turns smoothly, eases in and out.
  walkTo(x, z, o = {}) {
    let path = Array.isArray(x) ? x.map((p) => ({ x: p.x ?? p[0], z: p.z ?? p[1] })) : [{ x, z }];
    if (Array.isArray(x)) o = z || {};
    const speed = o.speed ?? (o.run ? 3.4 : 1.35);
    this._cancelWalk();
    return new Promise((resolve) => {
      this._walk = { path, i: 0, speed, resolve, stopDist: o.stopDist ?? 0.08, face: o.face };
      this.anim.toLoco(0.3);
    });
  }

  lookAt(target) { this.anim.look.target = target || null; return this; }
  talk(on = true) { this.anim.talking = !!on; return this; }
  gesture(name, o = {}) {
    if (ADDITIVE.has(name)) return this.anim.additive(name, o);
    return this.anim.playUpper(name, { loop: false, fade: 0.2, fadeOut: 0.35, ...o });
  }
  expression(name, amount = 1, fade = 0.3) { this.anim.setExpression(name, amount, fade); return this; }
  setFace(map, fade = 0.3) { for (const k in map) this.anim.setExpression(k, map[k], fade); return this; }
  // Resting face (temperament), e.g. { frown: 0.3, squint: 0.4 }; expression() overrides it while active.
  setRestFace(map) { this.anim.rest = { ...map }; return this; }
  onEvent(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter((f) => f !== fn); }; }
  _clipEvent(name, clip) {
    if (name === 'sword_draw') this._setSword(true);
    if (name === 'sword_sheathe') this._setSword(false);
    for (const f of this._listeners) f(name, clip, this);
    if (G.events) G.events.emit('character:event', { character: this, name, clip });
  }

  drawSword(kind = 'steel') { this.swordKind = kind; return this.play('draw_sword'); }
  sheatheSword() { return this.play('sheathe_sword'); }
  _setSword(drawn) {
    const by = this.rig.byName;
    const bone = this.swordKind === 'silver' ? by.sheathB : by.sheathA;
    if (drawn && !this.swordObj) {
      this.swordObj = makeSword(this.swordKind || 'steel');
      this.swordObj.position.y = 0.035;
      this.sockets.handR.add(this.swordObj);
    }
    if (this.swordObj) this.swordObj.visible = drawn;
    if (bone) bone.scale.setScalar(drawn ? 0.001 : 1);
    this.swordDrawn = drawn;
  }

  attach(socket, obj) {
    const s = this.sockets[socket] || this.rig.byName[socket];
    if (!s) throw new Error(`no socket ${socket}`);
    s.add(obj);
    return obj;
  }
  detach(obj) { if (obj.parent) obj.parent.remove(obj); }

  setVisible(v) { this.visible = v; this.root.visible = v; }

  dispose() {
    this._cancelWalk();
    if (this.root.parent) this.root.parent.remove(this.root);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.faceTex.dispose();
    this.mesh.skeleton.dispose();
    this.disposed = true;
    if (G.characters && G.characters._unregister) G.characters._unregister(this);
  }

  _makeSockets() {
    const by = this.rig.byName, M = this.M;
    this.sockets = {};
    for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
      const A = armJoints(M, s);
      const down = A.dir.clone();
      const palmN = new THREE.Vector3().crossVectors(down, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(s);
      const side = new THREE.Vector3(0, 0, 1); // grip axis: thumb side, forward in bind
      const o = new THREE.Object3D();
      o.name = 'socket_hand' + S;
      const hk = M.handLen / 0.19;
      o.position.copy(down).multiplyScalar(0.07 * hk).addScaledVector(palmN, 0.022 * hk);
      // +Y along the grip (out past the thumb), +Z away from the palm
      const zA = palmN.clone().negate();
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(side, zA), side, zA);
      o.quaternion.setFromRotationMatrix(basis);
      by['hand' + S].add(o);
      this.sockets['hand' + S] = o;
    }
    const back = new THREE.Object3D();
    back.position.set(0, 0.06 * M.k, -M.chestD - 0.06 * M.k);
    by.chest.add(back);
    this.sockets.back = back;
    const hip = new THREE.Object3D();
    hip.position.set(M.hipW + 0.03 * M.k, -0.04 * M.k, 0.01);
    by.hips.add(hip);
    this.sockets.hip = hip;
    const head = new THREE.Object3D();
    head.position.set(0, 0.2 * M.headK, 0);
    by.head.add(head);
    this.sockets.head = head;
  }

  // Called by the system.
  update(dt, ctx) {
    const W = this._walk;
    if (W) this._follow(dt, W);
    // speed smoothing (acceleration-limited)
    const tgt = this.targetSpeed ?? 0;
    const acc = tgt > this.speed ? 4.5 : 6;
    this.speed += Math.sign(tgt - this.speed) * Math.min(Math.abs(tgt - this.speed), acc * dt);
    this.anim.loco.speed = this.speed;
    // yaw rate for lean and turn-in-place steps
    let dy = this.yaw - this._prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this._prevYaw = this.yaw;
    const yr = dt > 0 ? dy / dt : 0;
    this.anim.yawRate += (yr - this.anim.yawRate) * Math.min(1, dt * 8);
    this.anim.shiver = this.cold || this.anim.loco.set.idle === 'idle_cold' ? 1 : 0;
    if (this.autoGround) this.root.position.y = this.groundAt(this.root.position.x, this.root.position.z);
    this.anim.update(dt, ctx);
    if (ctx.lod === 0 && ctx.ik !== false) this._footIK();
    if (ctx.lod <= 1) {
      // riding: find the horse this character is parented under (saddle anchor)
      let o = this.root.parent, horse = null;
      for (let i = 0; o && i < 6; i++, o = o.parent) if (o.userData && o.userData.horse) { horse = o.userData.horse; break; }
      this.springs.mount = horse;
      const wind = G.uniforms ? _v3.set(G.uniforms.uWind.value.x, 0, G.uniforms.uWind.value.y).multiplyScalar(G.uniforms.uWind.value.z * 2) : null;
      this.springs.update(dt, wind);
    }
    // head-up vector for the eye shading (mesh space)
    const head = this.rig.byName.head;
    if (head && ctx.lod <= 1) {
      head.updateMatrixWorld(true);
      _m.copy(this.mesh.matrixWorld).invert().multiply(head.matrixWorld);
      this.material.userData.mzU.uMzHeadUp.value.set(_m.elements[4], _m.elements[5], _m.elements[6]).normalize();
    }
  }

  _follow(dt, W) {
    const p = this.root.position;
    const tgt = W.path[W.i];
    const dx = tgt.x - p.x, dz = tgt.z - p.z;
    const dist = Math.hypot(dx, dz);
    const last = W.i === W.path.length - 1;
    if (dist < (last ? W.stopDist : 0.6)) {
      if (!last) { W.i++; return; }
      this._walk = null;
      this.targetSpeed = 0;
      if (W.face !== undefined) this.yaw = W.face;
      W.resolve(true);
      return;
    }
    const want = Math.atan2(dx, dz);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turnRate = this.speed < 0.4 ? 5 : 3.2;
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), turnRate * dt);
    // slow down for sharp turns and on arrival
    const facing = Math.max(0, Math.cos(d));
    let v = W.speed * (0.25 + 0.75 * facing);
    if (last) v = Math.min(v, Math.max(0.35, dist * 1.6));
    this.targetSpeed = v;
    const step = Math.min(dist, this.speed * dt);
    p.x += Math.sin(this.yaw) * step;
    p.z += Math.cos(this.yaw) * step;
  }

  // Keep feet on uneven ground: lower the pelvis to the lower foot, then bend each leg so its
  // ankle sits at the ground height under it (two-bone IK in world space).
  _footIK() {
    if (!G.world && !this.ground && !(G.characters && G.characters.heightAt)) return;
    if (this.anim.mode !== 'loco' && !this.anim.base.some((s) => s.kind === 'loco')) return;
    const by = this.rig.byName;
    const root = this.root;
    root.updateMatrixWorld(true);
    const y0 = root.position.y;
    const offs = [];
    for (const S of ['L', 'R']) {
      const a = by['foot' + S].getWorldPosition(_v);
      const g = this.groundAt(a.x, a.z) - y0;
      offs.push(g);
    }
    const lo = Math.min(offs[0], offs[1]);
    if (Math.abs(offs[0]) < 0.015 && Math.abs(offs[1]) < 0.015) return;
    by.hips.position.y += Math.max(-0.25, Math.min(0, lo));
    by.hips.updateMatrixWorld(true);
    ['L', 'R'].forEach((S, i) => {
      const thigh = by['thigh' + S], shin = by['shin' + S], foot = by['foot' + S];
      const a = thigh.getWorldPosition(new THREE.Vector3());
      const b = shin.getWorldPosition(new THREE.Vector3());
      const c = foot.getWorldPosition(new THREE.Vector3());
      const target = c.clone();
      target.y = c.y + offs[i] - Math.max(-0.25, Math.min(0, lo));
      twoBoneIK(thigh, shin, a, b, c, target);
    });
  }
}

// Rotate thigh and shin so the ankle reaches target (world), keeping the knee plane.
function twoBoneIK(thigh, shin, a, b, c, target) {
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const at = _v.copy(target).sub(a);
  const d = Math.min(at.length(), (l1 + l2) * 0.999);
  const ac = _v2.copy(c).sub(a);
  // knee angle change
  const cur = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - ac.lengthSq()) / (2 * l1 * l2))));
  const want = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  const kneeAxis = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, b));
  if (kneeAxis.lengthSq() < 1e-10) kneeAxis.set(1, 0, 0).applyQuaternion(thigh.getWorldQuaternion(_q));
  kneeAxis.normalize();
  const delta = cur - want;
  // rotate shin around the knee axis (world) by delta
  shin.getWorldQuaternion(_q);
  _q2.setFromAxisAngle(kneeAxis, delta);
  const parentQ = shin.parent.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = _q2.multiply(_q);
  shin.quaternion.copy(parentQ.invert().multiply(newWorld));
  shin.updateMatrixWorld(true);
  // swing thigh so the ankle points at the target
  const c2 = shin.children.length ? new THREE.Vector3() : c;
  const footBone = shin.children.find((o) => o.isBone);
  if (footBone) footBone.getWorldPosition(c2);
  const from = c2.sub(a).normalize();
  const to = _v.copy(target).sub(a).normalize();
  _q.setFromUnitVectors(from, to);
  const tw = thigh.getWorldQuaternion(new THREE.Quaternion());
  const tp = thigh.parent.getWorldQuaternion(new THREE.Quaternion());
  thigh.quaternion.copy(tp.invert().multiply(_q.multiply(tw)));
  thigh.updateMatrixWorld(true);
  void _v3;
}
