// Geometry kit for props: a small builder that assembles hand-made looking objects from jittered
// primitives, bakes them to one merged mesh per material, and exposes anchors and colliders.
//
//   const k = new Kit('barrel', opts);          opts: { seed, indoor, fx, ... }
//   k.box('planks', w, h, d, { pos, rot, tint, jitter, ... });  k.cyl / k.lathe / k.tube / k.sph ...
//   k.push({ pos, yaw }); ...parts...; k.pop();   sub-assemblies
//   return k.build();                           Group at the origin, y = 0 is the ground
//
// Canonical baked geometry (also what PropBatch merges): position f32x3, normal f32x3, uv f32x2,
// color u8x4 (normalized), optional aSway f32x3 (cloth), aBase f32x3 (snow mounds), indexed.
import * as THREE from 'three';
import { rng } from '../../core/util.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise } from '../../core/Noise.js';
import { getMat, MAT_INFO } from './mats.js';

const TAU = Math.PI * 2;
const _c = new THREE.Color();
const _v = new THREE.Vector3();

export function seedOf(opts, fallback = 1) {
  const s = opts && opts.seed;
  return Number.isFinite(s) ? Math.floor(s) : fallback;
}

// ---------------------------------------------------------------------------------------------
// Canonical geometry merge. items: [{ geo, matrix? }]. Geometry may be float color(3) or u8 color(4).
export function mergeGeos(items) {
  let vc = 0, ic = 0, hasSway = false, hasBase = false;
  for (const it of items) {
    const g = it.geo;
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
    if (g.attributes.aSway) hasSway = true;
    if (g.attributes.aBase) hasBase = true;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const col = new Uint8Array(vc * 4);
  const sway = hasSway ? new Float32Array(vc * 3) : null;
  const base = hasBase ? new Float32Array(vc * 3) : null;
  const idx = vc > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  const nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const it of items) {
    const g = it.geo, m = it.matrix;
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color;
    const n = pa.count;
    const pArr = pa.array, nArr = na.array;
    if (m) {
      const e = m.elements;
      nm.getNormalMatrix(m);
      const ne = nm.elements;
      for (let i = 0; i < n; i++) {
        const x = pArr[i * 3], y = pArr[i * 3 + 1], z = pArr[i * 3 + 2];
        pos[(vo + i) * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[(vo + i) * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[(vo + i) * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = nArr[i * 3], ny = nArr[i * 3 + 1], nz = nArr[i * 3 + 2];
        let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz;
        let oy = ne[1] * nx + ne[4] * ny + ne[7] * nz;
        let oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        nor[(vo + i) * 3] = ox / l; nor[(vo + i) * 3 + 1] = oy / l; nor[(vo + i) * 3 + 2] = oz / l;
      }
      if (hasBase) {
        const ba = g.attributes.aBase;
        for (let i = 0; i < n; i++) {
          if (!ba) { base[(vo + i) * 3] = pos[(vo + i) * 3]; base[(vo + i) * 3 + 1] = pos[(vo + i) * 3 + 1]; base[(vo + i) * 3 + 2] = pos[(vo + i) * 3 + 2]; continue; }
          const x = ba.array[i * 3], y = ba.array[i * 3 + 1], z = ba.array[i * 3 + 2];
          base[(vo + i) * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          base[(vo + i) * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          base[(vo + i) * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      }
    } else {
      pos.set(pArr, vo * 3);
      nor.set(nArr, vo * 3);
      if (hasBase) {
        const ba = g.attributes.aBase;
        if (ba) base.set(ba.array, vo * 3);
        else base.set(pArr, vo * 3);
      }
    }
    if (ua) uv.set(ua.array, vo * 2);
    if (ca) {
      if (ca.array instanceof Uint8Array && ca.itemSize === 4) col.set(ca.array, vo * 4);
      else {
        for (let i = 0; i < n; i++) {
          col[(vo + i) * 4] = Math.round(THREE.MathUtils.clamp(ca.getX(i), 0, 1) * 255);
          col[(vo + i) * 4 + 1] = Math.round(THREE.MathUtils.clamp(ca.getY(i), 0, 1) * 255);
          col[(vo + i) * 4 + 2] = Math.round(THREE.MathUtils.clamp(ca.getZ(i), 0, 1) * 255);
          col[(vo + i) * 4 + 3] = 255;
        }
      }
    } else col.fill(255, vo * 4, (vo + n) * 4);
    if (hasSway) {
      const sa = g.attributes.aSway;
      if (sa) sway.set(sa.array, vo * 3);
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
  if (sway) out.setAttribute('aSway', new THREE.BufferAttribute(sway, 3));
  if (base) out.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ---------------------------------------------------------------------------------------------
function tintColor(t) {
  if (t == null) return _c.setRGB(1, 1, 1);
  if (Array.isArray(t)) return _c.setRGB(t[0], t[1], t[2]);
  if (t.isColor) return _c.copy(t);
  return _c.set(t);
}

function ensureUV(geo) {
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
}

function ensureIndexed(geo) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
}

// Box projection UVs from position and (pre-jitter) normal. `grain` is the axis that maps to V.
function boxUV(geo, tile, grain, ox, oy) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let a, b; // tangent coordinates
    let ta; // tangent axis name (the other one is implied)
    if (ax >= ay && ax >= az) { a = z; b = y; ta = 'z'; }
    else if (ay >= az) { a = x; b = z; ta = 'x'; }
    else { a = x; b = y; ta = 'x'; }
    let u = a, v = b;
    if (grain === ta) { u = b; v = a; }
    uv.setXY(i, u / tile + ox, v / tile + oy);
  }
}

function uvScale(geo, su, sv, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
}

function jitterGeo(geo, amp, freq, seed) {
  const p = geo.attributes.position;
  const o = seed * 7.31;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(
      i,
      x + noise.noise3(x * freq + o, y * freq, z * freq) * amp,
      y + noise.noise3(x * freq, y * freq + o + 11.1, z * freq) * amp,
      z + noise.noise3(x * freq, y * freq, z * freq + o + 23.7) * amp,
    );
  }
}

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Kit {
  constructor(name, opts = {}) {
    this.name = name;
    this.opts = opts;
    this.seed = seedOf(opts, 1);
    this.rnd = rng(this.seed * 7919 + 13);
    this.indoor = !!opts.indoor;
    this.parts = new Map(); // matName -> [{ geo, matrix }]
    this.extra = []; // non-mesh children
    this.anchors = {};
    this.colliders = [];
    this.ud = {};
    this.stack = [new THREE.Matrix4()];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  r(a = 0, b = 1) { return a + (b - a) * this.rnd(); }
  rs(a) { return (this.rnd() * 2 - 1) * a; }
  pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; }
  chance(p) { return this.rnd() < p; }

  // --- transform stack -----------------------------------------------------------------------
  push(o = {}) {
    const m = this._compose(o);
    this.stack.push(new THREE.Matrix4().multiplyMatrices(this.stack[this.stack.length - 1], m));
    return this;
  }
  pop() { this.stack.pop(); return this; }
  with(o, fn) { this.push(o); fn(this); this.pop(); return this; }
  _compose(o) {
    const m = new THREE.Matrix4();
    const pos = o.pos || [0, 0, 0];
    const rot = o.rot || [0, 0, 0];
    this._e.set(rot[0], (o.yaw || 0) + rot[1], rot[2], o.order || 'YXZ');
    this._q.setFromEuler(this._e);
    const s = o.scale == null ? 1 : o.scale;
    const sc = Array.isArray(s) ? s : [s, s, s];
    m.compose(_v.set(pos[0], pos[1], pos[2]), this._q, new THREE.Vector3(sc[0], sc[1], sc[2]));
    return m;
  }

  // --- core emit -----------------------------------------------------------------------------
  // o: pos, rot [x,y,z], yaw, scale, tint, var, grime, jitter, jfreq, uv:'box'|'native'|'none',
  //    grain ('x'|'y'|'z'), tile (override), uvRect [u0,v0,u1,v1], sway amp, swayFrom y, swayPhase
  emit(geo, matName, o = {}) {
    const info = MAT_INFO[matName];
    if (!info) throw new Error(`props: unknown material ${matName}`);
    if (o.flat) {
      // Faceted shading (barrel staves, hewn timber): drop sharing so each face keeps its normal.
      if (geo.index) geo = geo.toNonIndexed();
      geo.deleteAttribute('normal');
    }
    ensureUV(geo);
    ensureIndexed(geo);
    const tile = o.tile || info.tile;
    if (o.uv === 'box') {
      const g = o.grain || 'y';
      boxUV(geo, tile, g, this.rnd() * 4, this.rnd() * 4);
    }
    if (o.jitter) {
      jitterGeo(geo, o.jitter, o.jfreq || 6, this.seed + (o.jseed || 0));
      geo.computeVertexNormals();
    }
    if (o.uvRect) {
      const [u0, v0, u1, v1] = o.uvRect;
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    // Local per-part transform then the assembly stack.
    const part = this._compose(o);
    const m = new THREE.Matrix4().multiplyMatrices(this.stack[this.stack.length - 1], part);
    // Colors computed from the final height so the grime gradient reads in prop space.
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const base = tintColor(o.tint);
    const br = base.r, bg = base.g, bb = base.b;
    const vr = o.var == null ? 0.09 : o.var;
    const grime = o.grime == null ? 0.38 : o.grime;
    const top = o.fade; // optional [color, y0, y1] gradient toward a second tint in final height
    let tc = null;
    if (top) tc = tintColor(top[0]).clone();
    const e = m.elements;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const n = noise.noise3(wx * 3.1 + this.seed, wy * 3.1, wz * 3.1) * 0.6 + noise.noise3(wx * 11, wy * 11 + 5, wz * 11) * 0.4;
      let k = 1 + n * vr;
      k *= 1 - grime * (1 - sstep(0, 0.55, wy));
      let r = br, g = bg, b = bb;
      if (tc) {
        const t = sstep(top[1], top[2], wy);
        r += (tc.r - r) * t; g += (tc.g - g) * t; b += (tc.b - b) * t;
      }
      col[i * 3] = r * k; col[i * 3 + 1] = g * k; col[i * 3 + 2] = b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (info.sway) {
      const sw = new Float32Array(p.count * 3);
      if (o.sway) {
        const from = o.swayFrom == null ? 0 : o.swayFrom;
        const ph = o.swayPhase == null ? this.rnd() * 6.28 : o.swayPhase;
        for (let i = 0; i < p.count; i++) {
          sw[i * 3] = Math.max(0, from - p.getY(i));
          sw[i * 3 + 1] = o.sway;
          sw[i * 3 + 2] = ph;
        }
      }
      geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 3));
    }
    if (info.base) {
      // Base point for the thaw shrink: center of the part footprint at its lowest y.
      const bb2 = new THREE.Box3().setFromBufferAttribute(p);
      const bx = (bb2.min.x + bb2.max.x) / 2, by = bb2.min.y, bz = (bb2.min.z + bb2.max.z) / 2;
      const ba = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { ba[i * 3] = bx; ba[i * 3 + 1] = by; ba[i * 3 + 2] = bz; }
      geo.setAttribute('aBase', new THREE.BufferAttribute(ba, 3));
    }
    let list = this.parts.get(matName);
    if (!list) this.parts.set(matName, (list = []));
    list.push({ geo, matrix: m });
    return this;
  }

  // --- primitives ----------------------------------------------------------------------------
  box(mat, w, h, d, o = {}) {
    const seg = o.seg || (o.jitter ? [Math.max(1, Math.min(4, Math.round(w / 0.35))), Math.max(1, Math.min(4, Math.round(h / 0.35))), Math.max(1, Math.min(4, Math.round(d / 0.35)))] : [1, 1, 1]);
    const g = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
    if (o.taper) {
      const p = g.attributes.position;
      const [tx, tz] = o.taper;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / h + 0.5;
        const sx = 1 + (tx - 1) * t, sz = 1 + (tz - 1) * t;
        p.setX(i, p.getX(i) * sx); p.setZ(i, p.getZ(i) * sz);
      }
    }
    const grain = o.grain || (w >= h && w >= d ? 'x' : d >= h && d >= w ? 'z' : 'y');
    return this.emit(g, mat, { uv: 'box', grain, ...o });
  }

  cyl(mat, rt, rb, h, o = {}) {
    const radial = o.radial || Math.max(7, Math.min(16, Math.round(Math.max(rt, rb) * 40 + 6)));
    const hs = o.hseg || 1;
    const capMat = o.cap === undefined ? mat : o.cap;
    const open = capMat === null || o.open;
    const g = new THREE.CylinderGeometry(rt, rb, h, radial, hs, true);
    const circ = TAU * (rt + rb) / 2;
    const tile = o.tile || MAT_INFO[mat].tile;
    uvScale(g, Math.max(1, Math.round(circ / tile)), h / tile, this.rnd(), this.rnd());
    this.emit(g, mat, { ...o, uv: 'none' });
    if (!open) {
      const capTile = MAT_INFO[capMat].tile;
      const mk = (r, y, up) => {
        // Fan that shares the exact rim positions of the side so jitter keeps them welded.
        const pos = [0, y, 0], uv = [0.5, 0.5], idx = [];
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * TAU;
          const sx = Math.sin(a), cz = Math.cos(a);
          pos.push(r * sx, y, r * cz);
          uv.push(0.5 + sx * 0.5, 0.5 + cz * 0.5);
        }
        for (let j = 0; j < radial; j++) idx.push(0, up ? j + 2 : j + 1, up ? j + 1 : j + 2);
        const c = new THREE.BufferGeometry();
        c.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        c.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        c.setIndex(idx);
        c.computeVertexNormals();
        if (capMat !== 'logEnd') uvScale(c, (2 * r) / capTile, (2 * r) / capTile, this.rnd(), this.rnd());
        return c;
      };
      const capO = { ...o, uv: 'none' };
      delete capO.tile;
      if (rt > 0.001 && !o.noTop) this.emit(mk(rt, h / 2, true), capMat, capO);
      if (rb > 0.001 && !o.noBottom) this.emit(mk(rb, -h / 2, false), capMat, capO);
    }
    return this;
  }

  // Log with bark sides and end grain caps. axis: 'y' (default, standing), 'x' or 'z' lying.
  log(r, len, o = {}) {
    const rot = o.rot || [0, 0, 0];
    const lie = o.lie;
    const oo = { ...o };
    if (lie === 'x') oo.rot = [rot[0], rot[1], rot[2] + Math.PI / 2];
    else if (lie === 'z') oo.rot = [rot[0] + Math.PI / 2, rot[1], rot[2]];
    return this.cyl('bark', r * (o.taper || 1), r, len, { radial: o.radial || 9, cap: 'logEnd', jitter: r * 0.12, jfreq: 9, ...oo, tile: undefined });
  }

  sph(mat, r, o = {}) {
    const g = new THREE.SphereGeometry(r, o.ws || 10, o.hs || 8, o.p0 || 0, o.p1 == null ? TAU : o.p1, o.t0 || 0, o.t1 == null ? Math.PI : o.t1);
    const tile = o.tile || MAT_INFO[mat].tile;
    uvScale(g, Math.max(1, Math.round(TAU * r / tile)), Math.max(1, Math.PI * r / tile));
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  cone(mat, r, h, o = {}) { return this.cyl(mat, 0.001, r, h, o); }

  // Irregular blob (rocks, hay heaps, snow lumps). detail 1..3.
  blob(mat, r, o = {}) {
    let g = new THREE.IcosahedronGeometry(r, o.detail || 2);
    if (!o.flat) {
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      g = mergeVertices(g, 1e-4);
      g.computeVertexNormals();
    }
    return this.emit(g, mat, { uv: 'box', grain: 'y', jitter: o.jitter == null ? r * 0.28 : o.jitter, jfreq: o.jfreq || 2.2 / r, ...o });
  }

  // Surface of revolution. pts: [[radius, y], ...] bottom to top.
  lathe(mat, pts, o = {}) {
    const radial = o.radial || 14;
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), radial);
    if (o.ripple) {
      // Folds: radial sine waves around the axis that fade out toward `to` (cloth, skirts).
      const { n, amp, from = -9, to = 9, phase = 0 } = o.ripple;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const a = Math.atan2(x, z);
        const f = 1 - sstep(from, to, y);
        const k2 = 1 + Math.sin(a * n + phase + y * 2.0) * amp * f + Math.sin(a * (n * 2 + 1) + phase * 2) * amp * 0.4 * f;
        p.setXYZ(i, x * k2, y, z * k2);
      }
      g.computeVertexNormals();
    }
    let len = 0, rmax = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const p of pts) rmax = Math.max(rmax, p[0]);
    const tile = o.tile || MAT_INFO[mat].tile;
    uvScale(g, o.uRepeat || Math.max(1, Math.round(TAU * rmax / tile)), len / tile, o.noUOffset ? 0 : this.rnd());
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  // Tube along a path with optional radius profile fn(t). Rope, handles, branches, wire.
  tube(mat, pts, r, o = {}) {
    const radial = o.radial || 6;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed, 'centripetal');
    const segs = o.segs || Math.max(4, Math.min(48, Math.round(curve.getLength() / 0.06)));
    const rf = typeof r === 'function' ? r : () => r;
    const frames = curve.computeFrenetFrames(segs, !!o.closed);
    const pos = [], nor = [], uv = [], idx = [];
    const len = curve.getLength();
    const tile = o.tile || MAT_INFO[mat].tile;
    const nu = o.uRepeat || 1;
    const P = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, P);
      const N = frames.normals[i], B = frames.binormals[i];
      const rr = rf(t);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const cx = Math.cos(a), sy = Math.sin(a);
        const nx = cx * N.x + sy * B.x, ny = cx * N.y + sy * B.y, nz = cx * N.z + sy * B.z;
        pos.push(P.x + nx * rr, P.y + ny * rr, P.z + nz * rr);
        nor.push(nx, ny, nz);
        uv.push((j / radial) * nu, (t * len) / tile);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  // Flat sheet. Subdivided for bending. fn(x, y, i, j) can return [dx, dy, dz] displacement.
  plane(mat, w, h, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, o.sx || 1, o.sy || 1);
    if (o.bend) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const d = o.bend(p.getX(i), p.getY(i));
        if (d) p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
      g.computeVertexNormals();
    }
    if (!o.uvRect) {
      const tile = o.tile || MAT_INFO[mat].tile;
      uvScale(g, w / tile, h / tile, this.rnd(), this.rnd());
    }
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  // Extruded outline (flat laundry, shields, carved boards). shape: THREE.Shape.
  extrude(mat, shape, depth, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevel || 0, bevelSegments: 1, curveSegments: o.curve || 6,
    });
    g.translate(0, 0, -depth / 2);
    if (o.warp) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const d = o.warp(p.getX(i), p.getY(i), p.getZ(i));
        if (d) p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
    }
    const tile = o.tile || MAT_INFO[mat].tile;
    if (o.uvFit) {
      const [x0, y0, fw, fh] = o.uvFit;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - x0) / fw, (uv.getY(i) - y0) / fh);
    } else uvScale(g, 1 / tile, 1 / tile, this.rnd(), this.rnd());
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  torus(mat, R, r, o = {}) {
    const g = new THREE.TorusGeometry(R, r, o.rseg || 5, o.seg || 14);
    const tile = o.tile || MAT_INFO[mat].tile;
    uvScale(g, Math.max(1, Math.round(TAU * R / tile)), Math.max(1, Math.round(TAU * r / tile)));
    return this.emit(g, mat, { uv: 'none', ...o });
  }

  // Lumpy geometric snow. Sits with its base at y = 0 of the part transform.
  mound(w, h, d, o = {}) {
    const g = new THREE.SphereGeometry(0.5, o.ws || 12, o.hs || 6, 0, TAU, 0, Math.PI / 2);
    const p = g.attributes.position;
    const off = this.seed * 3.7 + (o.jseed || 0);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = noise.noise3(x * 3 + off, y * 3, z * 3) * 0.14 + noise.noise3(x * 8, y * 8 + off, z * 8) * 0.05;
      const k = 1 + n;
      p.setXYZ(i, x * w * k, y * h * (1 + n * 0.8), z * d * k);
    }
    g.computeVertexNormals();
    return this.emit(g, 'snowMound', { uv: 'native', grime: 0, var: 0.025, tint: o.tint || 0xffffff, ...o, jitter: 0 });
  }

  // Hanging strip (ribbon, rag, banner) with wind sway. Top edge at y = 0, hangs down by len.
  hang(mat, w, len, o = {}) {
    const g = new THREE.PlaneGeometry(w, len, 1, o.sy || 4);
    g.translate(0, -len / 2, 0);
    if (o.wave) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getY(i) * 6 + (o.wph || 0)) * o.wave * (-p.getY(i) / len));
      g.computeVertexNormals();
    }
    const tile = o.tile || MAT_INFO[mat].tile;
    uvScale(g, w / tile, len / tile, this.rnd(), this.rnd());
    return this.emit(g, mat, { uv: 'none', sway: o.sway == null ? 1 : o.sway, swayFrom: 0, grime: 0, ...o });
  }

  // Reuse the baked meshes of another prop group (barrel stacks, crate stacks, vignettes).
  // Geometry is shared, not copied; the source group must outlive this kit's build.
  addGroup(group, o = {}) {
    const part = this._compose(o);
    const base = new THREE.Matrix4().multiplyMatrices(this.stack[this.stack.length - 1], part);
    group.updateMatrixWorld(true);
    group.traverse((ch) => {
      if (!ch.isMesh) return;
      const name = ch.material.name;
      if (!MAT_INFO[name]) return;
      let list = this.parts.get(name);
      if (!list) this.parts.set(name, (list = []));
      list.push({ geo: ch.geometry, matrix: new THREE.Matrix4().multiplyMatrices(base, ch.matrixWorld), shared: true });
    });
    return this;
  }

  // --- metadata ------------------------------------------------------------------------------
  anchor(name, x, y, z) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.stack[this.stack.length - 1]);
    this.anchors[name] = v;
    return v;
  }
  circleCollider(r, o = {}) { this.colliders.push({ type: 'circle', r, x: o.x || 0, z: o.z || 0, h: o.h == null ? 1.2 : o.h }); return this; }
  boxCollider(hw, hd, o = {}) { this.colliders.push({ type: 'box', hw, hd, x: o.x || 0, z: o.z || 0, yaw: o.yaw || 0, h: o.h == null ? 1.2 : o.h }); return this; }
  add(obj, pos) { if (pos) obj.position.set(pos[0], pos[1], pos[2]); this.extra.push(obj); return this; }

  // Mark (or spawn) an fx emitter at a local position. Imported lazily to avoid a cycle.
  fx(type, pos, o = {}) {
    const spec = { type, pos: [...pos], opts: o };
    const marker = new THREE.Object3D();
    marker.position.set(pos[0], pos[1], pos[2]).applyMatrix4(this.stack[this.stack.length - 1]);
    marker.userData.fxSpec = { ...spec, pos: [marker.position.x, marker.position.y, marker.position.z] };
    marker.name = `fx:${type}`;
    this.extra.push(marker);
    return marker;
  }

  // --- finish --------------------------------------------------------------------------------
  build(extra = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    let tris = 0;
    for (const [matName, list] of this.parts) {
      const merged = mergeGeos(list);
      const mesh = new THREE.Mesh(merged, getMat(matName, this.indoor));
      const info = MAT_INFO[matName];
      mesh.castShadow = !info.noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      tris += merged.index.count / 3;
      for (const it of list) if (!it.shared) it.geo.dispose();
    }
    for (const e of this.extra) group.add(e);
    const box = new THREE.Box3().setFromObject(group);
    group.userData = {
      name: this.name,
      seed: this.seed,
      snow: !this.indoor,
      anchors: this.anchors,
      colliders: this.colliders,
      collider: this.colliders[0] || null,
      bounds: box,
      height: box.max.y,
      tris,
      ...this.ud,
      ...extra,
    };
    return group;
  }
}

// Convenience shared by prop files.
export const hexLerp = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
export { TAU, sstep };
