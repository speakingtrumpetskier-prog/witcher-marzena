// Procedural geometry toolkit for the vegetation library. Owner: vegetation builder.
//
// GeoBuilder accumulates indexed geometry with the attribute set every vegetation material expects:
//   position, normal, color (linear, ambient occlusion baked in), uv, aSnow (0..1 snow load that the
//   material scales with uSnowCover), aWind (x = branch flex weight 0..1, y = per branch phase).
// Helpers: seeded rng, color presets, tubes (trunks, limbs, stalks) and fronds (needle sprays).
import * as THREE from 'three';
import { rng } from '../../core/util.js';

export { rng };

const _c = new THREE.Color();

// sRGB hex to linear rgb triple (vertex colors are consumed as linear).
export function rgb(hex) {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}

export function mixRGB(a, b, t, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export class GeoBuilder {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.uv = []; this.s = []; this.w = []; this.i = [];
  }

  get vcount() { return this.p.length / 3; }
  get tcount() { return this.i.length / 3; }

  // One vertex. Returns its index.
  v(x, y, z, nx, ny, nz, col, u = 0, vv = 0.5, snow = 0, flex = 0, phase = 0) {
    const id = this.p.length / 3;
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.c.push(col[0], col[1], col[2]);
    this.uv.push(u, vv);
    this.s.push(snow);
    this.w.push(flex, phase);
    return id;
  }

  tri(a, b, c) { this.i.push(a, b, c); }

  // Triangle wound so that its geometric normal faces the hint direction.
  triFacing(a, b, c, hx, hy, hz) {
    const p = this.p;
    const ax = p[b * 3] - p[a * 3], ay = p[b * 3 + 1] - p[a * 3 + 1], az = p[b * 3 + 2] - p[a * 3 + 2];
    const bx = p[c * 3] - p[a * 3], by = p[c * 3 + 1] - p[a * 3 + 1], bz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * hx + ny * hy + nz * hz >= 0) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }

  quadFacing(a, b, c, d, hx, hy, hz) {
    this.triFacing(a, b, c, hx, hy, hz);
    this.triFacing(a, c, d, hx, hy, hz);
  }

  // Smooth normals for vertices [v0, vcount) from triangles [t0, tcount). `soft(x,y,z,n)` may
  // post-process each normal (n is a mutable [x,y,z]); it is how foliage gets its soft volume shading.
  smooth(v0, t0, soft) {
    const p = this.p, idx = this.i;
    const acc = new Float32Array((this.vcount - v0) * 3);
    for (let t = t0; t < idx.length / 3; t++) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const ax = p[b * 3] - p[a * 3], ay = p[b * 3 + 1] - p[a * 3 + 1], az = p[b * 3 + 2] - p[a * 3 + 2];
      const bx = p[c * 3] - p[a * 3], by = p[c * 3 + 1] - p[a * 3 + 1], bz = p[c * 3 + 2] - p[a * 3 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (const k of [a, b, c]) {
        const o = (k - v0) * 3;
        acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz;
      }
    }
    const tmp = [0, 0, 0];
    for (let k = v0; k < this.vcount; k++) {
      const o = (k - v0) * 3;
      let l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
      tmp[0] = acc[o] / l; tmp[1] = acc[o + 1] / l; tmp[2] = acc[o + 2] / l;
      if (soft) soft(p[k * 3], p[k * 3 + 1], p[k * 3 + 2], tmp);
      l = Math.hypot(tmp[0], tmp[1], tmp[2]) || 1;
      this.n[k * 3] = tmp[0] / l; this.n[k * 3 + 1] = tmp[1] / l; this.n[k * 3 + 2] = tmp[2] / l;
    }
  }

  // Append another builder's content (already in the same object space).
  append(o) {
    const base = this.vcount;
    this.p.push(...o.p); this.n.push(...o.n); this.c.push(...o.c); this.uv.push(...o.uv);
    this.s.push(...o.s); this.w.push(...o.w);
    for (const k of o.i) this.i.push(k + base);
  }

  // Bake a per-vertex multiplier (ambient occlusion, tint) into the colors of vertices [v0, end).
  tint(v0, fn) {
    for (let k = v0; k < this.vcount; k++) {
      const m = typeof fn === 'function' ? fn(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2], k) : fn;
      if (typeof m === 'number') {
        this.c[k * 3] *= m; this.c[k * 3 + 1] *= m; this.c[k * 3 + 2] *= m;
      } else {
        this.c[k * 3] *= m[0]; this.c[k * 3 + 1] *= m[1]; this.c[k * 3 + 2] *= m[2];
      }
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSnow', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 2));
    const useU32 = this.vcount > 65535;
    g.setIndex(useU32 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Ring heights for a trunk: buried start, a ring near the ground (so base snow has a short
// gradient), then evenly up to yTop.
export function trunkHeights(n, yTop) {
  const ys = [-0.4, 0.8];
  for (let i = 2; i < n; i++) ys.push(0.8 + (yTop - 0.8) * ((i - 1) / (n - 2)));
  return ys;
}

// ---------------------------------------------------------------------------------------------
// Tube: a swept ring along a polyline. `pts` are [x,y,z]; `radius(i, t)` and `color(i, t, k)` give
// per ring values (k = side index). Rings share vertices around, 2 tris per side per segment.
// opts: sides, cap (close the end with a small disc), snowFn(ny) vertex snow from the normal,
//       snowRing [a, b]: snow on the first rings (drift against the trunk base),
//       flex(t) wind flex weight, phase, uv (true: u around 0..1, v = meters along, else uv stays 0),
//       uvScale, jitter (radius noise 0..1), rng
export function tube(b, pts, radius, color, opts = {}) {
  const sides = opts.sides || 6;
  const n = pts.length;
  const r = opts.rng || rng(7);
  const ringIdx = [];
  // Frames: tangent per ring, a stable side vector.
  let side = [1, 0, 0];
  let vAcc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1], tz = c[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // side = normalize(cross(up or previous side, t))
    let ux = side[0], uy = side[1], uz = side[2];
    // Remove the tangent component from the previous side vector (parallel transport-ish).
    const d = ux * tx + uy * ty + uz * tz;
    ux -= tx * d; uy -= ty * d; uz -= tz * d;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) { ux = 0; uy = 0; uz = 1; ul = 1; const d2 = tz * 1; ux -= tx * d2; uz -= tz * d2; ul = Math.hypot(ux, uy, uz) || 1; }
    ux /= ul; uy /= ul; uz /= ul;
    side = [ux, uy, uz];
    // second axis
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const t = n > 1 ? i / (n - 1) : 0;
    const rad = radius(i, t);
    if (i > 0) vAcc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const ring = [];
    const jit = opts.jitter || 0;
    const jv = [];
    for (let k = 0; k < sides; k++) jv.push(jit ? 1 + (r() - 0.5) * jit : 1);
    for (let k = 0; k <= sides; k++) {
      const kk = k % sides;
      const ang = (kk / sides) * Math.PI * 2 + (opts.twist || 0) * t;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
      const rr = rad * jv[kk];
      const col = color(i, t, kk);
      const snow = opts.snowFn ? opts.snowFn(ny, t) : (opts.snowRing ? (opts.snowRing[i] ?? 0) : 0);
      ring.push(b.v(pts[i][0] + nx * rr, pts[i][1] + ny * rr, pts[i][2] + nz * rr, nx, ny, nz, col,
        opts.uv ? k / sides : 0, opts.uv ? vAcc * (opts.uvScale || 1) : 0.5, snow, opts.flex ? opts.flex(t) : 0, opts.phase || 0));
    }
    ringIdx.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = ringIdx[i][k], bq = ringIdx[i][k + 1], c = ringIdx[i + 1][k + 1], d = ringIdx[i + 1][k];
      b.tri(a, d, c);
      b.tri(a, c, bq);
    }
  }
  if (opts.cap) {
    const last = pts[n - 1];
    const col = opts.capColor || color(n - 1, 1, 0);
    const c0 = b.v(last[0], last[1], last[2], 0, 1, 0, col, 0, 0, opts.capSnow || 0, 0, 0);
    const ring = ringIdx[n - 1];
    for (let k = 0; k < sides; k++) b.tri(ring[k], ring[k + 1], c0);
  }
  return ringIdx;
}

// ---------------------------------------------------------------------------------------------
// Frond: a spray of needles as a V-shaped strip along a drooping spine, plus optional hanging
// sprays. Returns nothing; adds to b. All lengths in meters, angle `theta` around +Y.
//   o: { x,y,z }          origin on the trunk
//   L: length, W: max half width, droop: vertical drop at the tip, rise: initial upward slope
//   rows: segments along the spine (1..6), jag: random edge irregularity 0..1
//   col: [dark, light] colors, tierShade multiplies the whole frond
//   snow: snow on the roof center (0..1), flexW: wind flex weight at the tip
export function frond(b, o, theta, L, W, droop, rise, opts = {}) {
  const r = opts.rng;
  const sRows = opts.sRows || [0, 0.25, 0.5, 0.75, 1];
  const rows = sRows.length - 1;
  const dx = Math.cos(theta), dz = Math.sin(theta);
  const sx = -dz, sz = dx; // side axis in XZ
  const r0 = opts.r0 ?? 0.12;
  const col0 = opts.col ? opts.col[0] : [0.05, 0.12, 0.08];
  const col1 = opts.col ? opts.col[1] : [0.1, 0.22, 0.12];
  const shade = opts.shade ?? 1;
  const snow = opts.snow ?? 0.9;
  const sag = opts.sag ?? 0.38; // how much the edges hang below the ridge line
  const tipLift = opts.tipLift ?? 0;
  const phase = opts.phase ?? 0;
  const jag = opts.jag ?? 0.25;
  const hint = opts.hint || [0, 1, 0];
  // parallel sided feathery frond: ramps in near the trunk, tapers over the last quarter to a point
  const widthFn = opts.widthFn || ((s) => {
    const a = Math.min(1, s / 0.2);
    const t = Math.min(1, Math.max(0, (s - 0.6) / 0.4));
    return (a * a * (3 - 2 * a)) * (1 - 0.9 * t * t);
  });
  const rowsIdx = [];
  const tmp = [0, 0, 0];
  for (let k = 0; k <= rows; k++) {
    const s = sRows[k];
    const rad = r0 + L * s;
    const y = o.y + rise * L * s - droop * s * s + tipLift * Math.pow(s, 4);
    const cx = o.x + dx * rad, cz = o.z + dz * rad;
    const w = W * widthFn(s);
    const jl = 1 + (r() - 0.5) * 2 * jag, jr = 1 + (r() - 0.5) * 2 * jag;
    const droopEdge = sag * w * (0.7 + 0.5 * s);
    const flex = Math.min(1, 0.15 + s * 0.95);
    // color: dark near the trunk, lighter toward the tip, with a little per row noise
    const nn = (r() - 0.5) * 0.12;
    mixRGB(col0, col1, Math.min(1, 0.15 + 0.85 * Math.pow(s, 0.8)), tmp);
    const cc = [tmp[0] * shade * (1 + nn), tmp[1] * shade * (1 + nn), tmp[2] * shade * (1 + nn)];
    const edge = [cc[0] * 1.12, cc[1] * 1.14, cc[2] * 1.05];
    const snC = snow * (s < 0.08 ? 0.5 : (1 - 0.55 * Math.pow(s, 3)));
    const snE = snow * 0.55 * (1 - 0.7 * s);
    const l = b.v(cx + sx * w * jl, y - droopEdge * jl, cz + sz * w * jl, 0, 1, 0, edge, -1, s, snE, flex, phase);
    const c = b.v(cx, y, cz, 0, 1, 0, cc, 0, s, snC, flex, phase);
    const rr = b.v(cx - sx * w * jr, y - droopEdge * jr, cz - sz * w * jr, 0, 1, 0, edge, 1, s, snE, flex, phase);
    rowsIdx.push([l, c, rr]);
  }
  for (let k = 0; k < rows; k++) {
    const A = rowsIdx[k], B = rowsIdx[k + 1];
    // tip rows may collapse (w = 0): skip degenerate tris cheaply by letting them through, the GPU culls them
    b.triFacing(A[0], A[1], B[1], hint[0], hint[1], hint[2]);
    b.triFacing(A[0], B[1], B[0], hint[0], hint[1], hint[2]);
    b.triFacing(A[1], A[2], B[2], hint[0], hint[1], hint[2]);
    b.triFacing(A[1], B[2], B[1], hint[0], hint[1], hint[2]);
  }
  return rowsIdx;
}

// Soft normal function for foliage: blends the face normal with a "ball" normal radiating from the
// crown center so a tree shades like one soft volume instead of a pile of flat plates.
export function softBall(cx, cy, cz, k = 0.55, up = 0.2) {
  return (x, y, z, n) => {
    let bx = x - cx, by = y - cy, bz = z - cz;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by = by / bl + up; bz /= bl;
    n[0] = n[0] * (1 - k) + bx * k;
    n[1] = n[1] * (1 - k) + by * k;
    n[2] = n[2] * (1 - k) + bz * k;
  };
}

// Smooth value noise helpers for geometry (cheap, seeded by an integer lattice).
export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
