// The cinematic camera shared by dialogue and cutscenes. Owns G.camera while
// G.cameraOwner === 'cutscene'. One move runs at a time; starting a new one resolves the old.
//
//   cam.take() / cam.release()
//   cam.cut({ pos, look, fov, frame, roll, shake })
//   await cam.shot({ from, to, via: [p...], look, lookTo, fov, fovTo, frame, frameTo, roll, rollTo, dur, ease, shake })
//   await cam.follow(actor, [right, up, forward], look, dur, { lag })
//   await cam.orbit(center, radius, height, fromAngle, toAngle, dur, { look, ease })
//   cam.finish()          jump the current move to its end (cutscene skip)
//
// Points: Vector3 | [x, y, z] (absolute) | { x, z, h } (h meters above the ground) |
// Actor (its eye) | { actor, offset: [right, up, forward] } | () => any of these (live).
// `frame: [nx, ny]` places the look point at that NDC position instead of the center
// (e.g. [0.3, 0.25] puts a face on the right third, upper third). Orbit angle 0 = +Z (south),
// PI/2 = +X (east). `shake` is handheld micro-motion, ~0.1 subtle to 1 strong.
import * as THREE from 'three';
import { easeFn } from './Scheduler.js';
import { Actor } from './Actors.js';

const DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _right = new THREE.Vector3(), _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class CineCamera {
  constructor(G) {
    this.G = G;
    this.owned = false;
    this.prevOwner = 'rig';
    this.pos = new THREE.Vector3(0, 2, 5);
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.fov = 40;
    this.frame = [0, 0];
    this.roll = 0;
    this.shake = 0;
    this.move = null;
    this.time = 0;
    this.onShot = null;
    this.lastLabel = '';
  }

  take() {
    const G = this.G;
    if (!this.owned) {
      this.owned = true;
      this.prevOwner = G.cameraOwner === 'cutscene' ? 'rig' : G.cameraOwner;
      this.prevFov = G.camera.fov;
      this.pos.copy(G.camera.position);
      G.camera.getWorldDirection(_a);
      this.look.copy(G.camera.position).addScaledVector(_a, 10);
      this.fov = G.camera.fov;
      this.frame = [0, 0];
      this.roll = 0;
      this.shake = 0;
    }
    G.cameraOwner = 'cutscene';
  }

  release(owner) {
    const G = this.G;
    this._end(this.move);
    this.move = null;
    if (!this.owned) return;
    this.owned = false;
    G.cameraOwner = owner || this.prevOwner || 'rig';
    if (this.prevFov) { G.camera.fov = this.prevFov; G.camera.updateProjectionMatrix(); }
    G.camera.up.set(0, 1, 0);
  }

  // Resolve a point spec into `out`.
  point(spec, out = new THREE.Vector3()) {
    if (spec == null) return null;
    if (typeof spec === 'function') return this.point(spec(), out);
    if (spec.isVector3) return out.copy(spec);
    if (spec instanceof Actor) return spec.eye(out);
    if (Array.isArray(spec)) {
      if (spec.length === 2) return out.set(spec[0], (this.G.world?.heightAt?.(spec[0], spec[1]) ?? 0) + 1.6, spec[1]);
      return out.set(spec[0], spec[1], spec[2]);
    }
    if (spec.actor) {
      const a = spec.actor;
      const o = spec.offset || [0, 1.6, 0];
      a.forward(_fwd);
      _right.crossVectors(UP, _fwd).multiplyScalar(-1); // actor's right hand side
      return out.copy(a.root.position).addScaledVector(_right, o[0]).addScaledVector(UP, o[1]).addScaledVector(_fwd, o[2]);
    }
    if (spec.x != null && spec.z != null) {
      const g = this.G.world?.heightAt?.(spec.x, spec.z) ?? 0;
      return out.set(spec.x, spec.h != null ? g + spec.h : spec.y ?? g + 1.6, spec.z);
    }
    return null;
  }

  _label(label, kind) {
    this.lastLabel = label || kind;
    try { this.onShot?.({ label: this.lastLabel, kind }); } catch (e) { console.error(e); }
  }

  _end(m, finished = false) {
    if (!m || m.ended) return;
    m.ended = true;
    if (finished && m.apply) m.apply(1);
    m.resolve?.();
  }

  cut({ pos, look, fov, frame, roll = 0, shake = 0, label } = {}) {
    this._end(this.move);
    this.move = null;
    if (pos) this.point(pos, this.pos);
    if (look) this.point(look, this.look);
    if (fov) this.fov = fov;
    this.frame = frame ? [frame[0], frame[1]] : [0, 0];
    this.roll = roll;
    this.shake = shake;
    this._label(label, 'cut');
    this.apply();
  }

  shot(o = {}) {
    this._end(this.move);
    const dynamic = typeof o.from === 'function' || typeof o.to === 'function' || o.from instanceof Actor || o.to instanceof Actor;
    const from = o.from ? this.point(o.from, new THREE.Vector3()) : this.pos.clone();
    const to = o.to ? this.point(o.to, new THREE.Vector3()) : from.clone();
    const lookA = o.look ? this.point(o.look, new THREE.Vector3()) : this.look.clone();
    const lookB = o.lookTo ? this.point(o.lookTo, new THREE.Vector3()) : null;
    const fovA = o.fov ?? this.fov, fovB = o.fovTo ?? fovA;
    const frA = o.frame || (o.from ? [0, 0] : this.frame), frB = o.frameTo || frA;
    const rollA = o.roll ?? (o.from ? 0 : this.roll), rollB = o.rollTo ?? rollA;
    const dur = Math.max(0, o.dur ?? 0);
    const fn = easeFn(o.ease || 'inOut');
    let curve = null;
    if (o.via?.length) {
      const pts = [from, ...o.via.map((p) => this.point(p, new THREE.Vector3())), to];
      curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    }
    this.shake = o.shake ?? 0;
    const m = { t: 0, dur, ended: false };
    m.apply = (k) => {
      const e = fn(k);
      if (curve) curve.getPoint(e, this.pos);
      else {
        if (dynamic) {
          if (o.from) this.point(o.from, from);
          if (o.to) this.point(o.to, to);
        }
        this.pos.lerpVectors(from, to, e);
      }
      if (typeof o.look === 'function' || o.look instanceof Actor) this.point(o.look, lookA);
      if (lookB) {
        if (typeof o.lookTo === 'function' || o.lookTo instanceof Actor) this.point(o.lookTo, lookB);
        this.look.lerpVectors(lookA, lookB, e);
      } else this.look.copy(lookA);
      this.fov = fovA + (fovB - fovA) * e;
      this.frame[0] = frA[0] + (frB[0] - frA[0]) * e;
      this.frame[1] = frA[1] + (frB[1] - frA[1]) * e;
      this.roll = rollA + (rollB - rollA) * e;
    };
    const p = new Promise((resolve) => { m.resolve = resolve; });
    this.move = m;
    this._label(o.label, 'shot');
    m.apply(0);
    if (!(dur > 0) || this.G.story?.sched?.instant) { this._end(m, true); this.move = null; }
    this.apply();
    return p;
  }

  follow(actor, offset = [0.8, 1.7, -2.6], look, dur = 0, { lag = 3.5, snap = true, fov, shake = 0, frame } = {}) {
    this._end(this.move);
    const m = { t: 0, dur: dur > 0 ? dur : Infinity, ended: false, endless: true };
    const target = new THREE.Vector3();
    const lookT = new THREE.Vector3();
    let first = snap;
    if (fov) this.fov = fov;
    this.frame = frame ? [...frame] : [0, 0];
    this.shake = shake;
    m.step = (dt) => {
      this.point({ actor, offset }, target);
      if (look) this.point(look, lookT); else actor.eye(lookT);
      if (first) { this.pos.copy(target); this.look.copy(lookT); first = false; return; }
      const k = 1 - Math.exp(-lag * dt);
      this.pos.lerp(target, k);
      this.look.lerp(lookT, Math.min(1, k * 1.6));
    };
    m.apply = () => m.step(1);
    const p = new Promise((resolve) => { m.resolve = resolve; });
    this.move = m;
    this._label('follow', 'follow');
    m.step(0);
    this.apply();
    if (this.G.story?.sched?.instant) m.resolve();
    return p;
  }

  orbit(center, radius = 6, height = 2, a0 = 0, a1 = Math.PI / 2, dur = 6, { look, ease = 'inOut', fov, shake = 0 } = {}) {
    this._end(this.move);
    const fn = easeFn(ease);
    const c = new THREE.Vector3();
    const m = { t: 0, dur: Math.max(0.001, dur), ended: false };
    if (fov) this.fov = fov;
    this.frame = [0, 0];
    this.shake = shake;
    m.apply = (k) => {
      const a = a0 + (a1 - a0) * fn(k);
      if (center instanceof Actor) center.pos(c); else this.point(center, c);
      this.pos.set(c.x + Math.sin(a) * radius, c.y + height, c.z + Math.cos(a) * radius);
      if (look) this.point(look, this.look);
      else if (center instanceof Actor) center.at(0.62, this.look);
      else this.look.copy(c);
    };
    const p = new Promise((resolve) => { m.resolve = resolve; });
    this.move = m;
    this._label('orbit', 'orbit');
    m.apply(0);
    if (this.G.story?.sched?.instant) { this._end(m, true); this.move = null; }
    this.apply();
    return p;
  }

  finish() {
    const m = this.move;
    if (!m) return;
    if (m.endless) { m.resolve?.(); return; }
    this._end(m, true);
    this.move = null;
    this.apply();
  }

  update(dt) {
    this.time += dt;
    const m = this.move;
    if (m && !m.ended) {
      if (m.step) {
        m.step(dt);
        m.t += dt;
        if (m.t >= m.dur) m.resolve?.();
      } else {
        m.t = Math.min(m.dur, m.t + dt);
        m.apply(m.t / m.dur);
        if (m.t >= m.dur) { this._end(m); this.move = null; }
      }
    }
    if (this.owned && this.G.cameraOwner === 'cutscene') this.apply();
  }

  // Write the state into G.camera.
  apply() {
    const G = this.G;
    if (!this.owned || G.cameraOwner !== 'cutscene') return;
    const cam = G.camera;
    cam.position.copy(this.pos);
    // Keep the camera out of the ground.
    const gy = G.world?.heightAt?.(cam.position.x, cam.position.z);
    if (gy != null && cam.position.y < gy + 0.25) cam.position.y = gy + 0.25;
    if (Math.abs(cam.fov - this.fov) > 1e-4) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    const fr = this.frame;
    if (fr[0] || fr[1]) {
      const tv = Math.tan((cam.fov * DEG) / 2);
      cam.rotateY(Math.atan(fr[0] * tv * cam.aspect));
      cam.rotateX(-Math.atan(fr[1] * tv));
    }
    if (this.roll) cam.rotateZ(this.roll);
    if (this.shake > 0) {
      const t = this.time, s = this.shake;
      cam.rotateY((Math.sin(t * 0.83) * 0.55 + Math.sin(t * 2.13 + 1.3) * 0.25 + Math.sin(t * 5.7 + 0.4) * 0.05) * s * 0.9 * DEG);
      cam.rotateX((Math.sin(t * 0.67 + 2.1) * 0.5 + Math.sin(t * 1.91 + 0.2) * 0.3 + Math.sin(t * 6.3 + 1.1) * 0.05) * s * 0.7 * DEG);
      cam.rotateZ(Math.sin(t * 0.47 + 0.7) * s * 0.35 * DEG);
      _c.set(Math.sin(t * 1.17), Math.sin(t * 1.53 + 1), 0).multiplyScalar(s * 0.012);
      cam.position.add(_c.applyQuaternion(cam.quaternion));
    }
    cam.updateMatrixWorld();
  }

  // Distance from the camera to a point, for framing math.
  distTo(p) { return _b.copy(p).distanceTo(this.pos); }
}

