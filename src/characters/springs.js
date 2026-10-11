// Spring bones for secondary motion: coat tails and skirts, braids, pigtails, scarf ends,
// capes. Verlet tails per joint (VRM style): inertia with drag, a pull back toward the
// animated rest direction (stiffness), gravity or buoyancy, then length constraint and
// sphere/capsule colliders (legs push skirts out, the back keeps braids off the body).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();

const PRESET = {
  skirt: { stiff: 3.2, drag: 0.32, grav: 0.35 },
  braid: { stiff: 0.9, drag: 0.22, grav: 1.2 },
  tail: { stiff: 1.2, drag: 0.3, grav: 0.9 },
  cape: { stiff: 2.0, drag: 0.35, grav: 0.6 },
};

export class Springs {
  constructor(ch) {
    this.ch = ch;
    this.joints = [];
    const rig = ch.rig;
    const float = !!ch.look.ghost;
    for (const chain of rig.chains) {
      const P = { ...PRESET[chain.kind] || PRESET.tail };
      // a braid laid over the shoulder holds its line; gravity alone would drag it off
      if (chain.kind === 'braid' && chain.root) { P.stiff = 14; P.grav = 0.3; P.drag = 0.4; }
      if (float && chain.kind === 'skirt') { P.grav = 0.12; P.stiff = 2.6; P.drag = 0.18; P.current = 0.5; }
      for (let i = 0; i < chain.joints.length; i++) {
        const bone = rig.byName[chain.joints[i]];
        const next = chain.joints[i + 1] ? rig.byName[chain.joints[i + 1]] : null;
        const tailLocal = next ? next.position.clone() : chain.tip.clone();
        const len = tailLocal.length();
        this.joints.push({
          bone, axis: tailLocal.clone().normalize(), len,
          cur: new THREE.Vector3(), prev: new THREE.Vector3(), init: false,
          P, kind: chain.kind, rest: bone.quaternion.clone(), ang: chain.ang,
        });
      }
    }
    // colliders: legs (capsules), hips and torso (spheres)
    const M = ch.M, by = rig.byName;
    this.colliders = [];
    if (rig.chains.some((c) => c.kind === 'skirt')) {
      for (const S of ['L', 'R']) {
        this.colliders.push({ a: by['thigh' + S], b: by['shin' + S], r: M.thighR * 1.15 + 0.025 });
        this.colliders.push({ a: by['shin' + S], b: by['foot' + S], r: M.calfR * 1.25 + 0.02 });
      }
      this.colliders.push({ a: by.hips, b: null, r: M.hipW * 0.92, off: new THREE.Vector3(0, -0.06 * M.k, 0) });
    }
    if (rig.chains.some((c) => c.kind !== 'skirt')) {
      this.colliders.push({ a: by.chest, b: null, r: M.chestD + 0.05 * M.k, off: new THREE.Vector3(0, 0, 0.0) });
      this.colliders.push({ a: by.spine, b: null, r: M.waistD + 0.045 * M.k, off: new THREE.Vector3(0, 0, 0) });
      this.colliders.push({ a: by.head, b: null, r: 0.1 * M.headK, off: new THREE.Vector3(0, 0.07 * M.headK, 0) });
    }
    if (rig.chains.some((c) => c.kind === 'braid' && c.root) || rig.chains.some((c) => c.kind === 'tail')) {
      // shoulders (trapezius and collar) and upper arms keep braids lying on top of the coat
      for (const S of ['L', 'R']) {
        this.colliders.push({ a: by.neck, b: by['arm' + S], r: 0.052 * M.k });
        this.colliders.push({ a: by['arm' + S], b: by['forearm' + S], r: M.armR * 1.5 + 0.012 * M.k });
      }
    }
    this.gravity = new THREE.Vector3(0, -1, 0);
  }

  reset() {
    for (const j of this.joints) j.init = false;
    this.lastRoot = null;
  }

  // Sub-steps keep long frames stable; the root motion is interpolated across them.
  update(dt, wind) {
    if (!this.joints.length) return;
    dt = Math.min(dt, 0.25);
    const root = this.ch.root;
    const n = Math.min(6, Math.max(1, Math.ceil(dt / (1 / 50))));
    if (n > 1 && this.lastRoot) {
      const cur = root.position.clone();
      for (let i = 1; i <= n; i++) {
        root.position.lerpVectors(this.lastRoot, cur, i / n);
        this._step(dt / n, wind);
      }
      root.position.copy(cur);
    } else this._step(dt, wind);
    (this.lastRoot ||= new THREE.Vector3()).copy(root.position);
  }

  // Colliders of a horse the character sits on (set by Character when its root is under a
  // saddle): the barrel and the withers keep coat tails draped over the flanks.
  _mountColliders(horse) {
    if (this._mountFor !== horse) {
      const hb = horse.bones;
      this._mountFor = horse;
      this._mountCols = [
        { a: hb.chest, b: hb.pelvis, r: 0.28, off: new THREE.Vector3(0, -0.3, -0.04), offB: new THREE.Vector3(0, -0.2, 0) },
        { a: hb.chest, b: null, r: 0.19, off: new THREE.Vector3(0, -0.1, -0.08) },
      ];
    }
    return this._mountCols;
  }

  _step(dt, wind) {
    const root = this.ch.root;
    root.updateMatrixWorld(true);
    const cols = this.mount ? this.colliders.concat(this._mountColliders(this.mount)) : this.colliders;
    // world-space collider shapes
    for (const c of cols) {
      c.pa = (c.pa || new THREE.Vector3()).setFromMatrixPosition(c.a.matrixWorld);
      if (c.off) c.pa.copy(c.off).applyMatrix4(c.a.matrixWorld);
      if (c.b) {
        c.pb = (c.pb || new THREE.Vector3()).setFromMatrixPosition(c.b.matrixWorld);
        if (c.offB) c.pb.copy(c.offB).applyMatrix4(c.b.matrixWorld);
      }
    }
    const t = performance.now() * 0.001;
    for (const j of this.joints) {
      const bone = j.bone;
      const parent = bone.parent;
      // animated rest: the bone's local rotation from the clip (springs replace it)
      bone.quaternion.copy(j.rest);
      bone.updateMatrixWorld(false);
      const head = _a.setFromMatrixPosition(bone.matrixWorld);
      _qp.setFromRotationMatrix(_m.extractRotation(parent.matrixWorld));
      const restDir = _b.copy(j.axis).applyQuaternion(_q.copy(_qp).multiply(j.rest)).normalize();
      if (!j.init) {
        j.cur.copy(head).addScaledVector(restDir, j.len);
        j.prev.copy(j.cur);
        j.init = true;
      }
      const P = j.P;
      const next = _c.copy(j.cur).sub(j.prev).multiplyScalar(1 - P.drag);
      next.add(j.cur);
      next.addScaledVector(restDir, P.stiff * dt * j.len * 2.2);
      next.addScaledVector(this.gravity, P.grav * dt * dt * 9.8 * 0.5 * 4);
      if (wind) next.addScaledVector(wind, dt * dt * (1 + 0.5 * Math.sin(t * 2.1 + j.len * 9)));
      if (P.current) {
        // slow underwater current for ghosts: drifting sideways and up
        const ph = t * 0.7 + (j.ang || 0) * 2;
        next.x += Math.sin(ph) * P.current * dt * 0.05;
        next.z += Math.cos(ph * 0.8) * P.current * dt * 0.05;
        next.y += Math.sin(ph * 1.3) * P.current * dt * 0.01;
      }
      // length constraint
      next.sub(head).normalize().multiplyScalar(j.len).add(head);
      // colliders
      for (const c of cols) {
        let center;
        if (c.b) {
          const ab = _d.copy(c.pb).sub(c.pa);
          const l2 = ab.lengthSq();
          const tt = Math.max(0, Math.min(1, next.clone().sub(c.pa).dot(ab) / l2));
          center = c.pa.clone().addScaledVector(ab, tt);
        } else center = c.pa;
        const dv = _d.copy(next).sub(center);
        const dist = dv.length();
        if (dist < c.r) {
          next.copy(center).addScaledVector(dv.normalize(), c.r);
          next.sub(head).normalize().multiplyScalar(j.len).add(head);
        }
      }
      j.prev.copy(j.cur);
      j.cur.copy(next);
      // rotate bone so its axis points at the tail
      const to = _d.copy(next).sub(head).normalize();
      _q.setFromUnitVectors(restDir, to);
      // world rotation = q * parentWorld * rest ; local = parentWorld^-1 * world
      _qi.copy(_qp).invert();
      bone.quaternion.copy(_qi).multiply(_q).multiply(_qp).multiply(j.rest);
      bone.updateMatrixWorld(false);
    }
  }
}
