// Skinned mesh builder for procedural characters.
//
// MeshBuilder accumulates vertices with: position, color (linear), aUv (tiling coords),
// aRect (atlas rect; negative height = decal tile, x < 0 = face texture), aMat (skin, roughness,
// fuzz, special), skinIndex/skinWeight (top 4), optional aFloat (ghost float weight, phase).
// Primitives: tube() (rings along any path, superellipse sections, open angular ranges,
// optional inner lining), sphereish(), ribbon(), plus smoothNormals() with position welding.
// Weights are given as [[boneName, w], ...] and normalized to the 4 largest.
import * as THREE from 'three';
import { TILE } from './textures.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export const SPECIAL = { none: 0, metal: 1, eye: 2, glow: 3 };

// Material descriptor helper.
export function M(color, opts = {}) {
  return {
    color: color && color.isColor ? color : new THREE.Color(color ?? 0xffffff),
    tile: opts.tile || 'wool',
    skin: opts.skin ?? 0,
    rough: opts.rough ?? 0.85,
    fuzz: opts.fuzz ?? 0.25,
    special: opts.special ?? 0,
    tileU: opts.tileU ?? 2,
    tileV: opts.tileV ?? 4,
    face: !!opts.face,
  };
}

export class MeshBuilder {
  constructor(index) {
    this.index = index; // bone name -> index
    this.P = []; this.C = []; this.UV = []; this.R = []; this.MT = []; this.SI = []; this.SW = []; this.I = [];
    this.FL = null;
    this.count = 0;
    this.partStart = 0;
  }
  rectOf(mat) {
    if (mat.face) return [-1, 0, 1, 1];
    if (Array.isArray(mat.tile)) return mat.tile;
    return TILE[mat.tile] || TILE.plain;
  }
  // weights: [[name|index, w], ...]
  vert(p, color, u, v, mat, weights, fl) {
    this.P.push(p.x, p.y, p.z);
    this.C.push(color.r, color.g, color.b);
    this.UV.push(u, v);
    const r = this.rectOf(mat);
    this.R.push(r[0], r[1], r[2], r[3]);
    this.MT.push(mat.skin, mat.rough, mat.fuzz, mat.special / 3);
    const ws = normWeights(weights, this.index);
    this.SI.push(ws[0], ws[1], ws[2], ws[3]);
    this.SW.push(ws[4], ws[5], ws[6], ws[7]);
    if (fl || this.FL) {
      if (!this.FL) this.FL = new Array(this.count * 2).fill(0);
      this.FL.push(fl ? fl[0] : 0, fl ? fl[1] : 0);
    }
    return this.count++;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  quad(a, b, c, d) { this.I.push(a, b, d, b, c, d); }
  begin() { this.partStart = this.count; this.idxStart = this.I.length; return this.partStart; }
  // Smooth normals for the current part (welded by position) and return the vertex range.
  end() { return { v0: this.partStart, v1: this.count, i0: this.idxStart, i1: this.I.length }; }
  pos(i, out = new THREE.Vector3()) { return out.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]); }
  setPos(i, p) { this.P[i * 3] = p.x; this.P[i * 3 + 1] = p.y; this.P[i * 3 + 2] = p.z; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('aRect', new THREE.Float32BufferAttribute(this.R, 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Uint8Array(this.MT.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255))), 4, true));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    if (this.FL) {
      while (this.FL.length < this.count * 2) this.FL.push(0, 0);
      g.setAttribute('aFloat', new THREE.Float32BufferAttribute(this.FL, 2));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    computeWeldedNormals(g);
    return g;
  }
}

function normWeights(weights, index) {
  const acc = new Map();
  for (const [b, w] of weights) {
    if (!(w > 1e-5)) continue;
    const i = typeof b === 'number' ? b : index[b];
    if (i === undefined) continue;
    acc.set(i, (acc.get(i) || 0) + w);
  }
  const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const e of arr) sum += e[1];
  if (!arr.length) return [0, 0, 0, 0, 1, 0, 0, 0];
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  arr.forEach((e, k) => { out[k] = e[0]; out[k + 4] = e[1] / sum; });
  return out;
}

// Area-weighted normals, welded across duplicated vertices (UV seams) that share position
// AND belong to the same smoothing group (approximated by similar raw normal direction).
export function computeWeldedNormals(g) {
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    e1.subVectors(b, a); e2.subVectors(c, a);
    e1.cross(e2);
    for (const i of [i0, i1, i2]) { nor[i * 3] += e1.x; nor[i * 3 + 1] += e1.y; nor[i * 3 + 2] += e1.z; }
  }
  // Weld: sum normals of vertices at the same position whose normals agree (> 60 deg apart = crease).
  const key = (i) => `${Math.round(pos[i * 3] * 5000)},${Math.round(pos[i * 3 + 1] * 5000)},${Math.round(pos[i * 3 + 2] * 5000)}`;
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let gr = groups.get(k);
    if (!gr) groups.set(k, (gr = []));
    gr.push(i);
  }
  const out = new Float32Array(n * 3);
  for (const gr of groups.values()) {
    for (const i of gr) {
      a.fromArray(nor, i * 3);
      const li = a.length() || 1;
      let sx = 0, sy = 0, sz = 0;
      for (const j of gr) {
        b.fromArray(nor, j * 3);
        const lj = b.length() || 1;
        if (j === i || a.dot(b) / (li * lj) > 0.35) { sx += b.x; sy += b.y; sz += b.z; }
      }
      c.set(sx, sy, sz).normalize();
      out[i * 3] = c.x; out[i * 3 + 1] = c.y; out[i * 3 + 2] = c.z;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

// Orthonormal frame (a, b) around axis t, with a as close as possible to hint (right-handed: a x b = t).
export function frame(t, hint = new THREE.Vector3(0, 0, 1)) {
  const tt = t.clone().normalize();
  let a = hint.clone().addScaledVector(tt, -hint.dot(tt));
  if (a.lengthSq() < 1e-8) a = new THREE.Vector3(1, 0, 0).addScaledVector(tt, -tt.x);
  a.normalize();
  const b = new THREE.Vector3().crossVectors(tt, a).normalize();
  return { t: tt, a, b };
}

const sgnpow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

// Generic tube. rings: [{ c, a, b, ra, rb, n?, r?(th)->mult, off?(th)->Vector3 add, ao? }]
// Each ring's (a, b) must be unit and right-handed with the path direction.
export function tube(mb, o) {
  const seg = o.seg || 12;
  const th0 = o.th0 ?? 0, th1 = o.th1 ?? Math.PI * 2;
  const full = !o.open && Math.abs(th1 - th0 - Math.PI * 2) < 1e-6;
  const mat = o.mat;
  const rows = [];
  let vacc = 0;
  const p = new THREE.Vector3();
  const tileU = mat.tileU, tileV = mat.tileV;
  const ringPoints = [];
  for (let ri = 0; ri < o.rings.length; ri++) {
    const R = o.rings[ri];
    const pts = [];
    const r0 = R.th0 ?? th0, r1 = R.th1 ?? th1;
    for (let j = 0; j <= seg; j++) {
      const th = r0 + (r1 - r0) * (j / seg);
      const ce = Math.cos(th), se = Math.sin(th);
      const ex = R.n ? 2 / R.n : 1;
      const mul = R.r ? R.r(th, ri) : 1;
      const cx = sgnpow(ce, ex) * R.ra * mul, cy = sgnpow(se, ex) * R.rb * mul;
      p.copy(R.c).addScaledVector(R.a, cx).addScaledVector(R.b, cy);
      if (R.off) p.add(R.off(th, ri));
      pts.push({ p: p.clone(), th });
    }
    ringPoints.push(pts);
  }
  for (let ri = 0; ri < o.rings.length; ri++) {
    const R = o.rings[ri];
    if (ri > 0) {
      // average distance between ring centers for v coordinate
      vacc += ringPoints[ri][0].p.distanceTo(ringPoints[ri - 1][0].p) * 0.5 + R.c.distanceTo(o.rings[ri - 1].c) * 0.5;
    }
    const row = [];
    for (let j = 0; j <= seg; j++) {
      const { p: q, th } = ringPoints[ri][j];
      let color = o.color ? o.color(ri, th, q) : mat.color;
      if (R.ao !== undefined && R.ao !== 1) color = color.clone().multiplyScalar(R.ao);
      const u = ((th - th0) / (Math.PI * 2)) * tileU;
      const w = o.weights(ri, th, q);
      const fl = o.float ? o.float(ri, th, q) : null;
      const m2 = o.matAt ? o.matAt(ri, th) || mat : mat;
      row.push(mb.vert(q, color, u, (o.v0 || 0) + vacc * tileV, m2, w, fl));
    }
    rows.push(row);
  }
  // Winding check with the first quad.
  let flip = false;
  if (rows.length > 1) {
    const a0 = mb.pos(rows[0][0]), a1 = mb.pos(rows[0][1]), b0 = mb.pos(rows[1][0]);
    const n = new THREE.Vector3().subVectors(a1, a0).cross(_w.subVectors(b0, a0));
    const mid = Math.max(1, Math.floor(seg / 4));
    const out = _v.subVectors(mb.pos(rows[0][mid]), o.rings[0].c);
    const n2 = new THREE.Vector3().subVectors(mb.pos(rows[0][mid + 1] ?? rows[0][mid]), mb.pos(rows[0][mid])).cross(_w.subVectors(mb.pos(rows[1][mid]), mb.pos(rows[0][mid])));
    flip = (n2.lengthSq() > 1e-14 ? n2.dot(out) : n.dot(out)) < 0;
    if (o.invert) flip = !flip;
  }
  for (let ri = 0; ri < rows.length - 1; ri++) {
    for (let j = 0; j < seg; j++) {
      const a = rows[ri][j], b = rows[ri][j + 1], c = rows[ri + 1][j + 1], d = rows[ri + 1][j];
      if (flip) mb.quad(a, d, c, b); else mb.quad(a, b, c, d);
    }
  }
  const capFan = (row, ring, toward) => {
    const center = ring.c.clone().addScaledVector(toward, ring.capDepth || 0);
    const w = o.weights(ring === o.rings[0] ? 0 : o.rings.length - 1, 0, center);
    const ci = mb.vert(center, o.color ? o.color(0, 0, center) : mat.color, 0, 0, mat, w);
    for (let j = 0; j < seg; j++) {
      const a = row[j], b = row[j + 1];
      const pa = mb.pos(a), pb = mb.pos(b);
      const n = new THREE.Vector3().subVectors(pa, center).cross(_w.subVectors(pb, center));
      if (n.dot(toward) > 0) mb.tri(ci, a, b); else mb.tri(ci, b, a);
    }
  };
  if (o.capStart && full) {
    const dir = o.rings[0].c.clone().sub(o.rings[1].c).normalize();
    capFan(rows[0], o.rings[0], dir);
  }
  if (o.capEnd && full) {
    const n = o.rings.length;
    const dir = o.rings[n - 1].c.clone().sub(o.rings[n - 2].c).normalize();
    capFan(rows[n - 1], o.rings[n - 1], dir);
  }
  // Inner lining for open garments: same surface pushed inward with reversed winding.
  if (o.inner) {
    const inset = o.inner.inset ?? 0.006;
    const lineMat = o.inner.mat || mat;
    const rows2 = [];
    const from = o.inner.from ?? 0;
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri < from) { rows2.push(null); continue; }
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const q = mb.pos(rows[ri][j]);
        const R = o.rings[ri];
        const dir = new THREE.Vector3().subVectors(q, R.c);
        dir.addScaledVector(R.a.clone().cross(R.b).normalize(), -dir.dot(R.a.clone().cross(R.b).normalize()));
        dir.normalize();
        const q2 = q.clone().addScaledVector(dir, -inset);
        const th = ringPoints[ri][j].th;
        const w = o.weights(ri, th, q);
        const fl = o.float ? o.float(ri, th, q) : null;
        row.push(mb.vert(q2, o.inner.color || lineMat.color, j / seg * lineMat.tileU, ri * 0.3, lineMat, w, fl));
      }
      rows2.push(row);
    }
    for (let ri = from; ri < rows2.length - 1; ri++) {
      for (let j = 0; j < seg; j++) {
        const a = rows2[ri][j], b = rows2[ri][j + 1], c = rows2[ri + 1][j + 1], d = rows2[ri + 1][j];
        if (flip) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
      }
    }
    // Close the hem (last ring) between outer and inner to give the cloth thickness.
    if (o.inner.hem !== false) {
      const last = rows.length - 1;
      for (let j = 0; j < seg; j++) {
        const a = rows[last][j], b = rows[last][j + 1], c = rows2[last][j + 1], d = rows2[last][j];
        if (flip) mb.quad(a, d, c, b); else mb.quad(a, b, c, d);
      }
    }
    // Open edges along the angular sides.
    if (!full && o.inner.sides !== false) {
      for (let ri = from; ri < rows.length - 1; ri++) {
        for (const j of [0, seg]) {
          const a = rows[ri][j], b = rows[ri + 1][j], c = rows2[ri + 1][j], d = rows2[ri][j];
          if ((j === 0) !== flip) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
        }
      }
    }
  }
  return rows;
}

// Chain weights: joints = [{ name, s }] sorted by s (distance along chain). blend in meters.
export function chainWeights(joints, s, blend = 0.04) {
  if (s <= joints[0].s) return [[joints[0].name, 1]];
  for (let i = 1; i < joints.length; i++) {
    const j = joints[i];
    if (s < j.s - blend) return [[joints[i - 1].name, 1]];
    if (s < j.s + blend) {
      const t = (s - (j.s - blend)) / (2 * blend);
      const st = t * t * (3 - 2 * t);
      return [[joints[i - 1].name, 1 - st], [j.name, st]];
    }
  }
  return [[joints[joints.length - 1].name, 1]];
}

// Ellipsoid blob (for buttons, knots, pommels, pom-poms): rigidly weighted.
export function blob(mb, c, r, mat, weights, seg = 8, rows = 6, color = null, squash = null) {
  const rings = [];
  const rx = r.x ?? r, ry = r.y ?? r, rz = r.z ?? r;
  for (let i = 0; i <= rows; i++) {
    const phi = -Math.PI / 2 + Math.PI * (i / rows);
    const y = Math.sin(phi) * ry;
    const s = Math.cos(phi);
    rings.push({ c: new THREE.Vector3(c.x, c.y + y, c.z), a: new THREE.Vector3(0, 0, 1), b: new THREE.Vector3(1, 0, 0), ra: Math.max(1e-4, s * rz), rb: Math.max(1e-4, s * rx), r: squash });
  }
  return tube(mb, { rings, seg, mat, weights: () => weights, color: color ? () => color : null });
}

// Flat ribbon along a polyline (straps, belts across the chest, lashes, hair strands).
// pts: Vector3[]; side: Vector3[] (unit width direction per point); widths: number[].
export function ribbon(mb, pts, sides, widths, mat, weightsFn, opts = {}) {
  const rowsIdx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
    const w = widths[i];
    const pa = pts[i].clone().addScaledVector(sides[i], -w / 2);
    const pb = pts[i].clone().addScaledVector(sides[i], w / 2);
    const col = opts.color ? opts.color(i) : mat.color;
    const ws = weightsFn(i, pts[i]);
    const fl = opts.float ? opts.float(i, pts.length) : null;
    const a = mb.vert(pa, col, 0, acc * mat.tileV, mat, ws, fl);
    const b = mb.vert(pb, col, mat.tileU * 0.25, acc * mat.tileV, mat, ws, fl);
    rowsIdx.push([a, b]);
  }
  for (let i = 0; i < rowsIdx.length - 1; i++) {
    const [a, b] = rowsIdx[i], [d, c] = rowsIdx[i + 1];
    if (opts.flip) mb.quad(a, d, c, b); else mb.quad(a, b, c, d);
  }
  if (opts.double) {
    // Back face needs its own vertices so the welded normals do not cancel.
    const back = rowsIdx.map(([a, b]) => [a, b].map((v) => {
      const q = mb.pos(v);
      const k = v * 3;
      const color = new THREE.Color(mb.C[k], mb.C[k + 1], mb.C[k + 2]);
      const i4 = v * 4;
      const wsrc = [];
      for (let t = 0; t < 4; t++) wsrc.push([mb.SI[i4 + t], mb.SW[i4 + t]]);
      const fl = mb.FL ? [mb.FL[v * 2], mb.FL[v * 2 + 1]] : null;
      return mb.vert(q, opts.backColor || color, mb.UV[v * 2], mb.UV[v * 2 + 1], mat, wsrc, fl);
    }));
    for (let i = 0; i < back.length - 1; i++) {
      const [a, b] = back[i], [d, c] = back[i + 1];
      if (opts.flip) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
    }
  }
  return rowsIdx;
}
