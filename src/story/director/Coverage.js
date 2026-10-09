// Conversation coverage: camera setups for two (or more) people talking, computed from where
// the actors actually stand and how tall they are. Used by the dialogue runner and exposed to
// cutscene scripts (d.two, d.ots, d.close, d.single).
//
//   const cov = new Coverage(G, ui)
//   cov.setup(vesna, hanka)        line of action between them; picks the camera side once
//   cov.two({ wide })              two-shot (wide = establishing)
//   cov.ots(subject)               over the other's shoulder onto the subject
//   cov.close(subject, toward?)    close-up, near the eyeline, same side of the line
//   cov.single(subject, toward?)   medium close single (reaction shot)
//   cov.drift(shot, dur)           a slow push or slide that ends where the drift ends
// Every setup returns { pos, look, fov, frame, label, size, subject } ready for CineCamera.
//
// Rules it keeps: all setups sit on one side of the line (180-degree rule), so actor A stays
// screen-left and B screen-right; eyes land on the upper third of the letterboxed picture; the
// subject gets look room toward whoever they talk to; camera height splits the difference
// between a child and an adult so neither shot looks straight down or up a nostril.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

export class Coverage {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.a = null;
    this.b = null;
    this.side = 1;
    this.u = new THREE.Vector3(1, 0, 0); // a -> b on the ground
    this.n = new THREE.Vector3(0, 0, 1); // toward the camera side
  }

  frac() { return this.ui?.cinemaFrac?.() ?? 1; }
  aspect() { return this.G.camera?.aspect || 16 / 9; }

  // Camera fov (vertical, degrees) that shows `height` meters at `dist` inside the visible band.
  fovFor(height, dist) {
    const tv = height / 2 / Math.max(0.3, dist);
    return (2 * Math.atan(tv / this.frac())) / DEG;
  }

  setup(a, b, { side, keepScreen = true } = {}) {
    const prevA = this.a;
    this.a = a;
    this.b = b;
    this._axis();
    if (side) this.side = side;
    else if (keepScreen && prevA && prevA === a) {
      // Same anchor actor: keep the side that leaves them on the same screen half.
    } else this.side = this._pickSide();
    this._normal();
    return this;
  }

  _axis() {
    this.a.pos(_a);
    this.b.pos(_b);
    this.u.set(_b.x - _a.x, 0, _b.z - _a.z);
    if (this.u.lengthSq() < 1e-6) this.u.set(1, 0, 0);
    this.u.normalize();
  }

  _normal() {
    // side +1: camera on the side where a reads screen-left and b screen-right.
    this.n.set(-this.u.z, 0, this.u.x).multiplyScalar(this.side);
  }

  _pickSide() {
    let best = 1, bestScore = -Infinity;
    const sun = this.G.uniforms?.uSunDir?.value;
    for (const s of [1, -1]) {
      this.side = s;
      this._normal();
      let score = 0;
      for (const shot of [this.two(), this.ots(this.a), this.ots(this.b)]) {
        score -= this._obstruction(shot.pos, shot.look) * 3;
      }
      // Faces read better with the sun behind or beside the camera.
      if (sun && sun.y > -0.05) score += (sun.x * this.n.x + sun.z * this.n.z) * 0.6;
      if (score > bestScore + 1e-3) { bestScore = score; best = s; }
    }
    return best;
  }

  // 0 clear, 1 blocked: camera inside a collider or the view to the subject crosses one.
  _obstruction(pos, look) {
    const P = this.G.physics;
    let o = 0;
    if (P?.query) {
      for (const it of P.query(pos.x, pos.z, 0.35)) {
        if (pos.y < it.y0 || pos.y > it.y1) continue;
        if (it.type === 'circle' && Math.hypot(pos.x - it.x, pos.z - it.z) < it.r + 0.3) o = 1;
        if (it.type === 'box') {
          const dx = pos.x - it.x, dz = pos.z - it.z;
          const lx = dx * it.c + dz * it.s, lz = -dx * it.s + dz * it.c;
          if (Math.abs(lx) < it.hw + 0.3 && Math.abs(lz) < it.hd + 0.3) o = 1;
        }
      }
    }
    if (P?.raycast && look) {
      _d.subVectors(pos, look);
      const len = _d.length();
      if (len > 0.5) {
        const hit = P.raycast(look, _d.normalize(), len, 0.2);
        if (hit < len - 0.3) o = Math.max(o, 0.6);
      }
    }
    const g = this.G.world?.heightAt?.(pos.x, pos.z);
    if (g != null && pos.y < g + 0.4) o = Math.max(o, 0.5);
    return o;
  }

  // Pull the camera toward the subject if something stands in between.
  _unblock(pos, look) {
    const P = this.G.physics;
    if (!P?.raycast) return pos;
    _d.subVectors(pos, look);
    const len = _d.length();
    if (len < 0.6) return pos;
    _d.normalize();
    const hit = P.raycast(look, _d, len, 0.15);
    if (hit < len - 0.1 && hit > 0.7) pos.copy(look).addScaledVector(_d, hit - 0.15);
    return pos;
  }

  _other(subject) {
    if (subject === this.a) return this.b;
    if (subject === this.b) return this.a;
    return this.a;
  }

  // Horizontal screen side for a subject so they get look room toward `toward`.
  _lookRoom(camPos, lookPos, subjectPos, towardPos, amount) {
    _c.subVectors(lookPos, camPos).setY(0).normalize();
    const right = _d.crossVectors(_c, UP).normalize();
    const s = (towardPos.x - subjectPos.x) * right.x + (towardPos.z - subjectPos.z) * right.z;
    return s > 0 ? -amount : amount;
  }

  // favor: the actor to favor (seen more frontally); the camera eases round behind the other.
  two({ wide = false, favor } = {}) {
    const a = this.a, b = this.b;
    const ea = a.eye(new THREE.Vector3()), eb = b.eye(new THREE.Vector3());
    a.pos(_a); b.pos(_b);
    const sep = Math.hypot(_b.x - _a.x, _b.z - _a.z);
    const mid = new THREE.Vector3().addVectors(_a, _b).multiplyScalar(0.5);
    const eyeY = (ea.y + eb.y) / 2;
    const fr = this.frac();
    const va = this.aspect() / fr;
    const W = wide ? Math.max(sep * 3.2, 5.4) : Math.max(sep * 2.25, 3.1);
    const H = W / va;
    const visDeg = wide ? 34 : 30;
    const D = H / 2 / Math.tan((visDeg * DEG) / 2);
    // Favor b by default: the camera eases around behind a, a classic three-quarter two-shot.
    const phi = (wide ? 16 : 24) * DEG * (favor === a ? -1 : 1);
    const dir = new THREE.Vector3().copy(this.n).multiplyScalar(Math.cos(phi)).addScaledVector(this.u, -Math.sin(phi));
    const pos = mid.clone().addScaledVector(dir, D);
    pos.y = eyeY + (wide ? 0.9 : -0.12);
    const look = mid.clone().setY(eyeY);
    this._unblock(pos, look);
    const dist = pos.distanceTo(look);
    return {
      pos, look, fov: this.fovFor(H, dist) * 1.0, frame: [0, fr * (wide ? 0.18 : 0.28)],
      label: wide ? 'establishing' : 'two-shot', size: wide ? 0 : 1, subject: null,
    };
  }

  ots(subject) {
    const S = subject, L = this._other(subject);
    const eS = S.eye(new THREE.Vector3()), eL = L.eye(new THREE.Vector3());
    S.pos(_a); L.pos(_b);
    const u = new THREE.Vector3(_a.x - _b.x, 0, _a.z - _b.z);
    if (u.lengthSq() < 1e-6) u.copy(this.u);
    u.normalize();
    // Close behind and well off the listener's shoulder: their head and shoulder sit at the
    // frame edge, the subject on the far third.
    const back = 0.74, lat = 0.78 + (L.isChild && !S.isChild ? -0.12 : 0);
    const pos = _b.clone().addScaledVector(u, -back).addScaledVector(this.n, lat);
    // Between the two eye lines, a touch under the listener's eyes, never below their shoulder.
    pos.y = Math.max(Math.min(eL.y * 0.5 + eS.y * 0.5, eL.y - 0.06), _b.y + L.height * 0.78);
    const look = eS.clone();
    this._unblock(pos, look);
    const dist = pos.distanceTo(look);
    const fr = this.frac();
    const nx = this._lookRoom(pos, look, _a, _b, 0.3);
    return {
      pos, look, fov: this.fovFor(1.0, dist), frame: [nx, fr * 0.33],
      label: `ots ${S.id}`, size: 2, subject: S,
    };
  }

  // Clean single near the eyeline. size 'close' (head) or 'mcu' (head and shoulders).
  _single(subject, toward, { theta, dist, height, label, size, nx }) {
    const S = subject, T = toward || this._other(subject);
    const eS = S.eye(new THREE.Vector3());
    S.pos(_a); T.pos(_b);
    const u = new THREE.Vector3(_b.x - _a.x, 0, _b.z - _a.z);
    if (u.lengthSq() < 1e-6) u.copy(this.u);
    u.normalize();
    // Rotate from the eyeline toward the camera side of the line.
    const dir = u.clone().multiplyScalar(Math.cos(theta)).addScaledVector(this.n, Math.sin(theta)).normalize();
    // Someone not (yet) facing their partner: swing round toward where the face actually is, so a
    // close-up never lands on the back of a head. Stays on the camera side of the line.
    const f = S.forward(new THREE.Vector3());
    if (f.dot(dir) < 0.35) {
      const side = f.dot(this.n) >= 0 ? 1 : -1;
      dir.copy(f).multiplyScalar(0.8).addScaledVector(this.n, 0.6 * side).normalize();
    }
    const pos = eS.clone().addScaledVector(dir, dist);
    const eT = T.eye(new THREE.Vector3());
    // A child looked at by an adult: camera a touch higher, and the other way round.
    pos.y = eS.y + THREE.MathUtils.clamp((eT.y - eS.y) * 0.25, -0.12, 0.12) - 0.02;
    const look = eS.clone();
    this._unblock(pos, look);
    const fr = this.frac();
    const d = pos.distanceTo(look);
    return {
      pos, look, fov: this.fovFor(height, d), frame: [this._lookRoom(pos, look, _a, _b, nx), fr * 0.33],
      label: `${label} ${S.id}`, size, subject: S,
    };
  }

  close(subject, toward) {
    return this._single(subject, toward, { theta: 30 * DEG, dist: 1.25, height: 0.5, label: 'close', size: 4, nx: 0.12 });
  }

  single(subject, toward) {
    return this._single(subject, toward, { theta: 36 * DEG, dist: 1.6, height: 0.78, label: 'single', size: 3, nx: 0.2 });
  }

  // Slow movement during a held shot: push in on singles, slide on two-shots.
  drift(shot, dur = 4, kind) {
    const k = kind || (shot.size <= 1 ? 'slide' : 'push');
    const amt = Math.min(1, dur / 5);
    const to = shot.pos.clone();
    const lookTo = shot.look.clone();
    const dir = _c.subVectors(shot.look, shot.pos);
    const dist = dir.length();
    dir.normalize();
    if (k === 'push') to.addScaledVector(dir, dist * 0.07 * amt);
    else if (k === 'slide') {
      const right = _d.crossVectors(dir, UP).normalize();
      // Slide along the line of action, never across it.
      const sgn = right.dot(this.u) >= 0 ? 1 : -1;
      to.addScaledVector(right, 0.22 * amt * sgn);
      lookTo.addScaledVector(right, 0.1 * amt * sgn);
    } else if (k === 'rise') to.y += 0.12 * amt;
    return { to, lookTo, fovTo: shot.fov * (k === 'push' ? 0.985 : 1) };
  }

  // Angle between two camera setups as seen from the subject (30-degree rule for cuts).
  static angleBetween(s1, s2) {
    _a.subVectors(s1.pos, s1.look).setY(0).normalize();
    _b.subVectors(s2.pos, s2.look).setY(0).normalize();
    return Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1)) / DEG;
  }
}
