// Snowballs the children throw (at each other, and at Vesna in the snow fight): a small pool of spheres flying
// a short arc, a powder burst where they land, and a callback so the target can flinch and laugh.
//
//   const snow = new Snowballs(G)
//   snow.launch(fromVec3, toVec3, onLand)   onLand(point) runs when the arc ends. Returning false means the ball
//                                           missed whoever it was thrown at: it keeps falling to the ground and
//                                           leaves a splat there (any other return value counts as a hit)
//   snow.stick(character, point)            a patch of snow stuck to a character where a ball hit; melts off
//   snow.update(dt)
import * as THREE from 'three';
import { makeSnowball } from './tools.js';
import { fx } from '../../world/props/fx.js';
import { groundY } from '../player/ground.js';

const N = 8;
const SPLATS = 12;
const STUCK = 6;
const SPLAT_LIFE = 24; // seconds a splat lies on the snow before it is gone
const STUCK_LIFE = 7;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// A flat, ragged disc of packed snow with a few thrown-off crumbs, lying in XZ.
function splatGeometry(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pos = [0, 0, 0], idx = [];
  const n = 18;
  // A soft lumpy edge: two low harmonics with random phases, a little noise on top.
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.12 * (1 + 0.14 * Math.sin(3 * a + p1) + 0.08 * Math.sin(5 * a + p2) + (rnd() - 0.5) * 0.08);
    pos.push(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2, d = 0.2 + rnd() * 0.16, r = 0.018 + rnd() * 0.02, b = pos.length / 3;
    const cx = Math.cos(a) * d * 1.3, cz = Math.sin(a) * d;
    pos.push(cx, 0, cz);
    for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI * 2; pos.push(cx + Math.cos(t) * r, 0, cz + Math.sin(t) * r); }
    for (let i = 0; i < 5; i++) idx.push(b, b + 1 + ((i + 1) % 5), b + 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Snowballs {
  constructor(G) {
    this.G = G;
    this.balls = [];
    this.group = new THREE.Group();
    this.group.name = 'snowballs';
    G.scene.add(this.group);
    for (let i = 0; i < N; i++) {
      const m = makeSnowball();
      m.visible = false;
      m.castShadow = false;
      this.group.add(m);
      this.balls.push({ m, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), arc: 1, cb: null, live: false, falling: false, vel: new THREE.Vector3() });
    }
    this.splats = [];
    for (let i = 0; i < SPLATS; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.92, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(splatGeometry(i + 3), mat);
      m.visible = false;
      m.receiveShadow = true;
      m.renderOrder = 2;
      this.group.add(m);
      this.splats.push({ m, t: 0 });
    }
    this._nextSplat = 0;
    const lump = new THREE.SphereGeometry(0.075, 8, 6);
    this.stuck = [];
    for (let i = 0; i < STUCK; i++) {
      const m = new THREE.Mesh(lump, new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.85, transparent: true }));
      m.scale.set(1.15, 0.5, 1.0);
      m.visible = false;
      this.stuck.push({ m, t: 0, live: false });
    }
    this._nextStuck = 0;
  }

  launch(from, to, cb) {
    const s = this.balls.find((x) => !x.live);
    if (!s) return false;
    s.a.copy(from); s.b.copy(to);
    const d = from.distanceTo(to);
    s.dur = Math.max(0.35, d / 9);
    s.arc = 0.5 + d * 0.12;
    s.t = 0; s.cb = cb || null; s.live = true; s.falling = false;
    s.m.visible = true;
    s.m.position.copy(from);
    return true;
  }

  // A splat on the snow at p (x, z; y is found from the ground there).
  splat(p) {
    const sp = this.splats[this._nextSplat];
    this._nextSplat = (this._nextSplat + 1) % SPLATS;
    const gy = groundY(p.x, p.z, p.y);
    sp.m.position.set(p.x, (Number.isFinite(gy) ? gy : p.y) + 0.015, p.z);
    sp.m.rotation.y = Math.random() * Math.PI * 2;
    const k = 0.85 + Math.random() * 0.4;
    sp.m.scale.set(k, 1, k);
    sp.m.material.opacity = 0.95;
    sp.m.visible = true;
    sp.t = 0;
  }

  // Snow stuck where a ball hit a character: on the nearest of the torso, head and arm bones.
  stick(character, point) {
    if (!character?.bones || !point) return;
    let best = null, bd = Infinity;
    for (const name of ['chest', 'spine', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'hips']) {
      const b = character.bones[name];
      if (!b) continue;
      const d = b.getWorldPosition(_w).distanceToSquared(point);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    const st = this.stuck[this._nextStuck];
    this._nextStuck = (this._nextStuck + 1) % STUCK;
    st.m.removeFromParent();
    // Put it on the surface between the bone and where the ball came in, about a body's half-width out.
    best.getWorldPosition(_w);
    _v.copy(point).sub(_w);
    const len = _v.length();
    if (len > 1e-4) _v.multiplyScalar(Math.min(len, 0.16) / len);
    _v.add(_w);
    best.worldToLocal(_v);
    st.m.position.copy(_v);
    st.m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
    st.m.material.opacity = 1;
    st.m.visible = true;
    best.add(st.m);
    st.t = 0;
    st.live = true;
  }

  update(dt) {
    for (const s of this.balls) {
      if (!s.live) continue;
      if (s.falling) {
        // A miss: on down to the snow under a normal fall.
        s.vel.y -= 9.8 * dt;
        s.m.position.addScaledVector(s.vel, dt);
        const p = s.m.position, gy = groundY(p.x, p.z, p.y + 0.5);
        if (!Number.isFinite(gy) || p.y <= gy + 0.06 || s.t > 4) {
          s.live = false;
          s.m.visible = false;
          if (Number.isFinite(gy)) p.y = gy + 0.06;
          fx.burst('snow', p, { count: 10, speed: 1.1, size: 0.1 });
          this.splat(p);
        }
        s.t += dt;
        continue;
      }
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      _v.lerpVectors(s.a, s.b, u);
      _v.y += Math.sin(Math.PI * u) * s.arc;
      s.m.position.copy(_v);
      if (u >= 1) {
        let hit = true;
        if (s.cb) { try { hit = s.cb(s.b) !== false; } catch (e) { console.warn('[snowballs]', e); } }
        s.cb = null;
        const gy = groundY(s.b.x, s.b.z, s.b.y);
        if (hit || !Number.isFinite(gy) || s.b.y - gy < 0.25) {
          s.live = false;
          s.m.visible = false;
          fx.burst('snow', s.b, { count: 12, speed: 1.3, size: 0.12 });
          if (!hit && Number.isFinite(gy)) this.splat(s.b);
        } else {
          // The velocity at the end of the arc, then gravity.
          s.vel.subVectors(s.b, s.a).divideScalar(s.dur);
          s.vel.y -= (Math.PI * s.arc) / s.dur;
          s.falling = true;
          s.t = 0;
        }
      }
    }
    for (const sp of this.splats) {
      if (!sp.m.visible) continue;
      sp.t += dt;
      const k = sp.t / SPLAT_LIFE;
      if (k >= 1) { sp.m.visible = false; continue; }
      sp.m.material.opacity = 0.95 * (1 - Math.max(0, k - 0.6) / 0.4);
    }
    for (const st of this.stuck) {
      if (!st.live) continue;
      st.t += dt;
      const k = st.t / STUCK_LIFE;
      if (k >= 1) { st.live = false; st.m.visible = false; st.m.removeFromParent(); continue; }
      st.m.material.opacity = 1 - Math.max(0, k - 0.55) / 0.45;
      const sh = 1 - 0.35 * k;
      st.m.scale.set(1.15 * sh, 0.5 * sh, sh);
    }
  }
}
