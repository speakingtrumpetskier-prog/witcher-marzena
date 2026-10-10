// Kasza: a shaggy dun mare (small sturdy mountain horse, about 1.42 m at the withers).
//
//   const h = createHorse('kasza');  G.scene.add(h.root);  h.setPosition(x, z);  h.yaw = a;
//   h.setGait(speed)      m/s: 0 idle, ~1.7 walk, ~3.6 trot, 7+ gallop (blended, phase-matched)
//   h.play('rear' | 'snort', { speed, amount }) -> Promise (amount < 1: a smaller rear, a shy);  h.saddle (Object3D seat anchor: put the rider's
//   root here and play ride_idle / ride_trot / ride_gallop);  h.bones, h.height, h.gait
// Clips: idle, walk, trot, gallop (procedural, by speed), rear, snort (one-shots).
// Footfalls: walk is four-beat lateral (LH, LF, RH, RF), trot two-beat diagonal, gallop
// four-beat transverse with a right lead and a suspension phase. Dun coat: sandy body,
// dark legs, dorsal stripe, dark mane and tail, winter shag, saddle blanket with folk-red trim.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { MeshBuilder, M as mat, tube, blob, ribbon, frame, SPECIAL } from './geom.js';
import { createCharacterMaterial } from './material.js';
import { TILE } from './textures.js';
import { col, lerp, smoothstep, noise1, rng } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// Bind joint positions (meters, horse root at the ground, +Z forward).
const J = {
  pelvis: V(0, 1.28, -0.5), spine: V(0, 1.3, -0.05), chest: V(0, 1.34, 0.36),
  neck1: V(0, 1.3, 0.6), neck2: V(0, 1.56, 0.86), head: V(0, 1.78, 1.04), jaw: V(0, 1.64, 1.14),
  earL: V(0.06, 1.9, 1.02), earR: V(-0.06, 1.9, 1.02),
  tail0: V(0, 1.3, -0.8), tail1: V(0, 1.14, -0.9), tail2: V(0, 0.9, -0.95),
};
const LEGF = (s) => ({
  scap: V(s * 0.14, 1.22, 0.46), arm: V(s * 0.17, 1.0, 0.56), fore: V(s * 0.17, 0.78, 0.4),
  cannon: V(s * 0.15, 0.46, 0.41), pastern: V(s * 0.15, 0.17, 0.42), hoof: V(s * 0.15, 0.07, 0.46),
});
const LEGH = (s) => ({
  thigh: V(s * 0.16, 1.14, -0.56), gaskin: V(s * 0.18, 0.76, -0.4), cannon: V(s * 0.16, 0.5, -0.66),
  pastern: V(s * 0.15, 0.17, -0.62), hoof: V(s * 0.15, 0.07, -0.58),
});

function buildRig() {
  const bones = [], by = {}, world = {};
  const add = (name, parent, p) => {
    const b = new THREE.Bone();
    b.name = name;
    world[name] = p.clone();
    if (parent) { b.position.copy(p).sub(world[parent]); by[parent].add(b); } else b.position.copy(p);
    bones.push(b); by[name] = b;
  };
  add('pelvis', null, J.pelvis);
  add('spine', 'pelvis', J.spine);
  add('chest', 'spine', J.chest);
  add('neck1', 'chest', J.neck1);
  add('neck2', 'neck1', J.neck2);
  add('head', 'neck2', J.head);
  add('jaw', 'head', J.jaw);
  add('earL', 'head', J.earL);
  add('earR', 'head', J.earR);
  add('tail0', 'pelvis', J.tail0);
  add('tail1', 'tail0', J.tail1);
  add('tail2', 'tail1', J.tail2);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const f = LEGF(s);
    add('scap' + S, 'chest', f.scap);
    add('armF' + S, 'scap' + S, f.arm);
    add('foreF' + S, 'armF' + S, f.fore);
    add('cannonF' + S, 'foreF' + S, f.cannon);
    add('pasternF' + S, 'cannonF' + S, f.pastern);
    add('hoofF' + S, 'pasternF' + S, f.hoof);
    const h = LEGH(s);
    add('thighH' + S, 'pelvis', h.thigh);
    add('gaskinH' + S, 'thighH' + S, h.gaskin);
    add('cannonH' + S, 'gaskinH' + S, h.cannon);
    add('pasternH' + S, 'cannonH' + S, h.pastern);
    add('hoofH' + S, 'pasternH' + S, h.hoof);
  }
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = {};
  bones.forEach((b, i) => { index[b.name] = i; });
  return { bones, byName: by, world, skeleton, index };
}

// Polyline helpers for limb tubes.
function limb(mb, pts, radii, mats, weightsFn, o = {}) {
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const f = frame(b.clone().sub(a), V(0, 0, 1));
    const r = radii[i];
    return { c: p, a: f.a, b: f.b, ra: r[0], rb: r[1], i };
  });
  tube(mb, { rings, seg: o.seg || 10, mat: mats, capEnd: o.capEnd, capStart: o.capStart,
    color: o.color ? (ri, th) => o.color(ri, th, rings[ri]) : null,
    weights: (ri) => weightsFn(ri) });
}

// ---------------------------------------------------------------- sculpt
// Torso, neck and head are one signed distance field (deep chest, narrower barrel, withers,
// rounded croup, arched flattened neck, refined head with cheeks, muzzle and nostrils). Tubes
// cast rays from inner axes onto it, so overlapping parts land on the same surface.
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz));
  const k1 = Math.sqrt((x * x) / (rx ** 4) + (y * y) / (ry ** 4) + (z * z) / (rz ** 4));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdCone(px, py, pz, a, b, r1, r2) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - lerp(r1, r2, h);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const NECK = [V(0, 1.18, 0.48), V(0, 1.4, 0.67), V(0, 1.6, 0.83), V(0, 1.76, 0.97)];
const NECKR = [0.2, 0.155, 0.115, 0.09];
const CREST = [V(0, 1.36, 0.44), V(0, 1.66, 0.73), V(0, 1.84, 0.95)];
const HEADA = V(0, 1.84, 1.03), HEADB = V(0, 1.47, 1.3);

function horseSDF(x, y, z) {
  const ax = Math.abs(x);
  // torso
  let d = sdEll(x, y, z, 0, 1.04, -0.03, 0.232, 0.3, 0.5);
  d = smin(d, sdEll(x, y, z, 0, 1.05, 0.33, 0.2, 0.33, 0.27), 0.12);
  d = smin(d, sdCone(x, y, z, V(0, 1.2, 0.02), V(0, 1.355, 0.33), 0.07, 0.06), 0.1);
  d = smin(d, sdEll(x, y, z, 0, 1.1, -0.57, 0.235, 0.28, 0.3), 0.12);
  d = smin(d, sdEll(ax, y, z, 0.12, 1.16, -0.5, 0.125, 0.17, 0.21), 0.08);
  d = smin(d, sdEll(x, y, z, 0, 0.885, -0.12, 0.215, 0.165, 0.37), 0.14);
  d = smin(d, sdCone(x, y, z, V(0, 1.29, -0.7), V(0, 1.28, -0.87), 0.08, 0.05), 0.06);
  // hindquarter muscle down to the stifle, shoulder blade down to the elbow
  d = smin(d, sdCone(ax, y, z, V(0.15, 1.08, -0.6), V(0.17, 0.8, -0.44), 0.135, 0.085), 0.08);
  d = smin(d, sdCone(ax, y, z, V(0.13, 1.28, 0.3), V(0.16, 0.99, 0.52), 0.085, 0.1), 0.08);
  d = smin(d, sdCone(ax, y, z, V(0.16, 0.99, 0.52), V(0.165, 0.8, 0.42), 0.1, 0.075), 0.06);
  // neck: flattened sideways, arched crest
  const nx = x * 1.45;
  let n = sdCone(nx, y, z, NECK[0], NECK[1], NECKR[0], NECKR[1]);
  n = smin(n, sdCone(nx, y, z, NECK[1], NECK[2], NECKR[1], NECKR[2]), 0.04);
  n = smin(n, sdCone(nx, y, z, NECK[2], NECK[3], NECKR[2], NECKR[3]), 0.04);
  n = smin(n, sdCone(nx * 1.25, y, z, CREST[0], CREST[1], 0.075, 0.065), 0.06);
  n = smin(n, sdCone(nx * 1.25, y, z, CREST[1], CREST[2], 0.065, 0.05), 0.05);
  d = smin(d, n / 1.3, 0.1);
  // head
  let h = sdCone(x * 1.18, y, z, HEADA, HEADB, 0.088, 0.06);
  h = smin(h, sdEll(ax, y, z, 0.052, 1.705, 1.1, 0.05, 0.1, 0.108), 0.04);
  h = smin(h, sdEll(x, y, z, 0, 1.44, 1.31, 0.068, 0.07, 0.076), 0.04);
  h = smin(h, sdEll(x, y, z, 0, 1.395, 1.285, 0.05, 0.03, 0.06), 0.02);
  h = smin(h, Math.hypot(ax - 0.08, y - 1.775, z - 1.095) - 0.03, 0.03);
  h = smax(h, -sdEll(ax, y, z, 0.04, 1.455, 1.378, 0.012, 0.022, 0.014), 0.012);
  h = smax(h, -sdEll(x, y, z, 0, 1.41, 1.35, 0.045, 0.004, 0.02), 0.006);
  d = smin(d, h, 0.07);
  return d;
}
function gradV(p, out = new THREE.Vector3()) {
  const e = 0.002;
  return out.set(horseSDF(p.x + e, p.y, p.z) - horseSDF(p.x - e, p.y, p.z), horseSDF(p.x, p.y + e, p.z) - horseSDF(p.x, p.y - e, p.z),
    horseSDF(p.x, p.y, p.z + e) - horseSDF(p.x, p.y, p.z - e)).normalize();
}
// march from an inside point along dir to the surface (or stop inside at maxR)
function marchOut(o, dir, maxR = 0.5) {
  let a = 0, b = -1;
  for (let t = 0.01; t <= maxR; t += 0.012) {
    if (horseSDF(o.x + dir.x * t, o.y + dir.y * t, o.z + dir.z * t) > 0) { b = t; break; }
    a = t;
  }
  if (b < 0) return { p: o.clone().addScaledVector(dir, maxR), inside: true };
  for (let i = 0; i < 9; i++) {
    const m = (a + b) * 0.5;
    if (horseSDF(o.x + dir.x * m, o.y + dir.y * m, o.z + dir.z * m) > 0) b = m; else a = m;
  }
  return { p: o.clone().addScaledVector(dir, (a + b) * 0.5), inside: false };
}
function closestOnPolyline(p, pts) {
  let best = { d: 1e9, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], ab = pts[i + 1].clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    const d = p.distanceTo(a.clone().addScaledVector(ab, t));
    if (d < best.d) best = { d, seg: i, t };
  }
  return best;
}
// skin weights by position, shared by every sculpt tube so overlapping skins move together
const SPINE_LINE = [V(0, 1.3, 0.48), J.neck1, J.neck2, J.head, V(0, 1.42, 1.36)];
function sculptWeights(p) {
  const z = p.z;
  let body;
  if (z < J.pelvis.z) body = [['pelvis', 1]];
  else if (z < J.spine.z) { const t = smoothstep(J.pelvis.z, J.spine.z, z); body = [['pelvis', 1 - t], ['spine', t]]; }
  else if (z < J.chest.z) { const t = smoothstep(J.spine.z, J.chest.z, z); body = [['spine', 1 - t], ['chest', t]]; }
  else body = [['chest', 1]];
  const S = p.x >= 0 ? 'L' : 'R';
  const ax = Math.abs(p.x);
  // shoulder and forearm mass follow the front leg, the thigh the hind leg
  const fl = smoothstep(1.02, 0.84, p.y) * smoothstep(0.24, 0.36, z) * smoothstep(0.66, 0.56, z) * smoothstep(0.06, 0.12, ax);
  const hl = smoothstep(1.08, 0.86, p.y) * smoothstep(-0.32, -0.42, z) * smoothstep(0.06, 0.12, ax);
  if (fl > 0) body = mixW(body, [['scap' + S, 0.4], ['armF' + S, 0.6]], fl * 0.85);
  if (hl > 0) body = mixW(body, [['thighH' + S, 1]], hl * 0.85);
  // neck and head
  const c = closestOnPolyline(p, SPINE_LINE);
  const neckness = smoothstep(0.0, 0.14, (p.y - 1.12) * 0.7 + (z - 0.46)) * (c.seg > 0 || c.t > 0.2 ? 1 : smoothstep(0, 0.2, c.t));
  if (neckness <= 0) return body;
  const segW = [
    [['chest', 1 - c.t], ['neck1', c.t]],
    [['neck1', 1 - c.t], ['neck2', c.t]],
    [['neck2', 1 - c.t], ['head', c.t]],
    [['head', 1]],
  ][c.seg];
  return mixW(body, segW, neckness);
}
function mixW(a, b, t) {
  const m = new Map();
  for (const [n, w] of a) m.set(n, (m.get(n) || 0) + w * (1 - t));
  for (const [n, w] of b) m.set(n, (m.get(n) || 0) + w * t);
  return [...m.entries()];
}

function buildHorseMesh(rig, look) {
  const mb = new MeshBuilder(rig.index);
  const R = rng(look.seed || 11);
  const coat = col(look.coat || '#b49162');
  const dark = col(look.points || '#2e241c');
  const maneC = col(look.mane || '#241c16');
  const fur = (c) => mat(c, { tile: 'fur', rough: 0.85, fuzz: 0.7, tileU: 8, tileV: 6 });
  const bodyMat = fur(coat);
  // Dun coat: sandy body, dark dorsal stripe and faint shoulder bar, darker face and muzzle,
  // smoky shading under the belly and on the upper legs, broad tonal mottling.
  const coatAt = (p, nrm) => {
    const c = coat.clone();
    const ax = Math.abs(p.x);
    const big = noise1(p.z * 5 + p.y * 3, 4) * 0.5 + noise1(p.z * 11 - p.y * 7 + ax * 9, 8) * 0.35;
    c.multiplyScalar(0.86 + 0.2 * big);
    // dorsal stripe from the withers to the tail
    if (p.z < 0.42 && p.z > -0.9 && nrm.y > 0.55) c.lerp(dark, 0.78 * smoothstep(0.03, 0.01, ax) * smoothstep(0.55, 0.8, nrm.y));
    // shoulder bar across the withers
    c.lerp(dark, 0.32 * smoothstep(0.035, 0.0, Math.abs(p.z - 0.3 + (1.35 - p.y) * 0.35)) * smoothstep(1.05, 1.3, p.y) * (p.z < 0.5 ? 1 : 0));
    // belly and the inside of the legs darker, sides catch more light
    c.multiplyScalar(lerp(0.66, 1, smoothstep(-0.75, 0.15, nrm.y)));
    // darker dun shading over the shoulders, the hindquarter's rear and the upper neck
    c.lerp(dark, 0.22 * smoothstep(0.18, 0.05, Math.abs(p.z - 0.42)) * smoothstep(0.95, 1.25, p.y));
    c.lerp(dark, 0.2 * smoothstep(-0.7, -0.85, p.z));
    // head darker toward the muzzle, mealy-dark nose
    if (p.z > 0.95) c.lerp(dark, 0.25 + 0.45 * smoothstep(1.2, 1.36, p.z));
    // the neck top under the mane
    if (p.z > 0.4 && p.z < 1.0 && nrm.y > 0.3 && p.y > 1.3) c.lerp(dark, 0.25 * smoothstep(0.3, 0.7, nrm.y));
    // smoky upper legs
    c.lerp(dark, 0.35 * smoothstep(0.95, 0.78, p.y) * smoothstep(0.08, 0.14, ax));
    return c;
  };
  const tubeGrid = (rows, quadsOutward) => {
    const out = [];
    for (const row of rows) {
      const r2 = [];
      for (const { p, axis } of row) {
        const nrm = gradV(p);
        const vi = mb.vert(p, coatAt(p, nrm), row.u ?? 0, 0, bodyMat, sculptWeights(p));
        mb.setNormal(vi, nrm);
        r2.push({ vi, p, axis });
      }
      out.push(r2);
    }
    // UVs: around (u) and along (v, hair flows along v)
    for (let i = 0; i < out.length; i++) for (let j = 0; j < out[i].length; j++) {
      mb.UV[out[i][j].vi * 2] = (j / (out[i].length - 1)) * bodyMat.tileU;
      mb.UV[out[i][j].vi * 2 + 1] = (i / (out.length - 1)) * bodyMat.tileV * 1.6;
    }
    for (let i = 0; i < out.length - 1; i++) for (let j = 0; j < out[i].length - 1; j++) {
      const a = out[i][j], b = out[i + 1][j], c = out[i + 1][j + 1], d = out[i][j + 1];
      const nrm = b.p.clone().sub(a.p).cross(d.p.clone().sub(a.p));
      const outw = a.p.clone().sub(a.axis);
      if (nrm.dot(outw) >= 0 === quadsOutward) mb.quad(a.vi, b.vi, c.vi, d.vi); else mb.quad(a.vi, d.vi, c.vi, b.vi);
    }
    return out;
  };
  // ---- torso: back cap, rings along z, front cap
  const yAx = (z) => lerp(1.06, 1.02, smoothstep(-0.8, -0.2, z)) + 0.05 * smoothstep(0.0, 0.5, z);
  const nTh = 30;
  const rad = (th) => V(Math.sin(th), Math.cos(th), 0);
  const bodyRows = [];
  const zB = -0.66, zF = 0.44;
  const capN = 6, midN = 24;
  for (let i = 0; i <= capN + midN + capN; i++) {
    const row = [];
    let o, dirF;
    if (i <= capN) {
      const al = (i / capN) * Math.PI / 2;
      o = V(0, yAx(zB), zB);
      dirF = (th) => V(0, 0, -1).multiplyScalar(Math.cos(al)).addScaledVector(rad(th), Math.sin(al)).normalize();
    } else if (i <= capN + midN) {
      const z = lerp(zB, zF, (i - capN) / midN);
      o = V(0, yAx(z), z);
      dirF = rad;
    } else {
      const al = (1 - (i - capN - midN) / capN) * Math.PI / 2;
      o = V(0, yAx(zF), zF);
      dirF = (th) => V(0, 0, 1).multiplyScalar(Math.cos(al)).addScaledVector(rad(th), Math.sin(al)).normalize();
    }
    for (let j = 0; j <= nTh; j++) {
      const th = (j / nTh) * TAU;
      const m = marchOut(o, dirF(th), 0.5);
      row.push({ p: m.p, axis: o });
    }
    bodyRows.push(row);
  }
  tubeGrid(bodyRows, true);
  // ---- neck: rays across a spline from inside the chest to the poll
  const neckCurve = new THREE.CatmullRomCurve3([V(0, 1.12, 0.42), NECK[1], NECK[2], V(0, 1.8, 1.0)]);
  const nN = 14, nNT = 22;
  const neckRows = [];
  for (let i = 0; i <= nN; i++) {
    const u = i / nN;
    const o = neckCurve.getPointAt(u), t = neckCurve.getTangentAt(u);
    const f = frame(t, V(0, 1, 0));
    const row = [];
    for (let j = 0; j <= nNT; j++) {
      const th = (j / nNT) * TAU;
      const m = marchOut(o, f.a.clone().multiplyScalar(Math.cos(th)).addScaledVector(f.b, Math.sin(th)), 0.36);
      row.push({ p: m.p, axis: o });
    }
    neckRows.push(row);
  }
  tubeGrid(neckRows, true);
  // ---- head: poll to muzzle, with a cap over the nose and one over the poll (the neck's last ring
  // faces up and forward, the head's first faces down and forward: without it the top of the skull
  // behind the ears is open, which the rider's view looks straight into)
  const hAxis = HEADB.clone().sub(HEADA).normalize();
  const hf = frame(hAxis, V(0, 0.4, 1));
  const nH = 14, nHC = 5, nHT = 22;
  const headRows = [];
  for (let k = 0; k < nHC; k++) {
    const al = (k / nHC) * Math.PI / 2;
    const row = [];
    for (let j = 0; j <= nHT; j++) {
      const th = (j / nHT) * TAU;
      const dir = hAxis.clone().multiplyScalar(-Math.cos(al)).addScaledVector(hf.a.clone().multiplyScalar(Math.cos(th)).addScaledVector(hf.b, Math.sin(th)), Math.sin(al)).normalize();
      row.push({ p: marchOut(HEADA, dir, 0.3).p, axis: HEADA });
    }
    headRows.push(row);
  }
  for (let i = 0; i <= nH + nHC; i++) {
    const row = [];
    let o, dirF;
    if (i <= nH) {
      o = HEADA.clone().lerp(V(0, 1.43, 1.31), i / nH);
      dirF = (th) => hf.a.clone().multiplyScalar(Math.cos(th)).addScaledVector(hf.b, Math.sin(th));
    } else {
      const al = (1 - (i - nH) / nHC) * Math.PI / 2;
      o = V(0, 1.43, 1.31);
      dirF = (th) => hAxis.clone().multiplyScalar(Math.cos(al)).addScaledVector(hf.a.clone().multiplyScalar(Math.cos(th)).addScaledVector(hf.b, Math.sin(th)), Math.sin(al)).normalize();
    }
    for (let j = 0; j <= nHT; j++) {
      const m = marchOut(o, dirF((j / nHT) * TAU), 0.3);
      row.push({ p: m.p, axis: o });
    }
    headRows.push(row);
  }
  tubeGrid(headRows, true);
  // eyes, ears (cupped, forward), muzzle whiskers left out (too fine to read)
  const eyeMat = mat(col('#100a08'), { tile: 'plain', rough: 0.08, fuzz: 0, special: SPECIAL.eye, tileU: 1, tileV: 1 });
  for (const s of [1, -1]) {
    const e = marchOut(V(0, 1.775, 1.09), V(s, 0.12, 0.25).normalize(), 0.2).p;
    blob(mb, e.clone().add(V(-s * 0.012, 0, 0)), { x: 0.02, y: 0.022, z: 0.026 }, eyeMat, [['head', 1]], 8, 6);
    const lid = mat(dark.clone().multiplyScalar(0.9), { tile: 'fur', rough: 0.8, fuzz: 0.5, tileU: 1, tileV: 1 });
    blob(mb, e.clone().add(V(-s * 0.006, 0.012, -0.004)), { x: 0.02, y: 0.012, z: 0.03 }, lid, [['head', 1]], 6, 3);
    const eb = marchOut(V(0, 1.84, 1.0), V(s * 0.55, 0.8, -0.15).normalize(), 0.2).p;
    const ear = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const w = Math.sin(lerp(0.35, 1, t) * Math.PI) * (1 - t * 0.35);
      ear.push({ c: eb.clone().add(V(s * t * 0.025, t * 0.13, t * 0.02 - 0.01)), a: V(0, 0, 1), b: V(s, 0, 0), ra: 0.034 * w + 0.003, rb: 0.024 * w + 0.002, th0: 0.6, th1: TAU - 0.6 });
    }
    tube(mb, { rings: ear, seg: 8, mat: bodyMat, open: true, capEnd: true,
      color: (ri, th) => (Math.cos(th) < -0.2 ? dark.clone().multiplyScalar(0.6) : coat.clone().lerp(dark, 0.45 + ri * 0.08)),
      weights: () => [['ear' + (s > 0 ? 'L' : 'R'), 1]], inner: { inset: 0.004, color: dark.clone().multiplyScalar(0.5) } });
  }
  // surface sampling for the tack (blanket, saddle, girth)
  const surfAt = (z, th, off) => {
    const o = V(0, yAx(z), z);
    const p = marchOut(o, rad(th), 0.5).p;
    return p.addScaledVector(gradV(p), off);
  };
  // ---- legs: dark points from the knees and hocks down, faint primitive barring, shaggy
  // feathering over the fetlocks
  const legMat = fur(coat);
  const legCol = (y, base) => {
    const pts = smoothstep(0.62, 0.45, y);
    const c = base.clone().lerp(dark, 0.35 * smoothstep(0.85, 0.62, y) + 0.6 * pts);
    // faint zebra barring on the forearm and gaskin (dun primitive marks)
    if (y > 0.5 && y < 0.82) c.lerp(dark, 0.22 * smoothstep(0.3, 0.9, Math.sin(y * 70)));
    return c;
  };
  const featherMat = mat(dark.clone().multiplyScalar(1.1), { tile: 'hair', rough: 0.9, fuzz: 0.9, tileU: 1, tileV: 4 });
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const f = LEGF(s);
    const fp = [f.arm.clone().add(V(-s * 0.03, 0.1, 0.0)), f.arm, f.fore.clone().add(V(0, 0.06, 0)), f.fore.clone().lerp(f.cannon, 0.45), f.cannon.clone().add(V(0, 0.03, 0)), f.cannon, f.cannon.clone().lerp(f.pastern, 0.5), f.pastern, f.hoof.clone().add(V(0, 0.03, -0.012))];
    const fr = [[0.07, 0.06], [0.085, 0.07], [0.085, 0.066], [0.068, 0.052], [0.058, 0.05], [0.052, 0.046], [0.04, 0.034], [0.05, 0.045], [0.044, 0.04]];
    const fw = [
      [['chest', 0.5], ['scap' + S, 0.5]], [['scap' + S, 0.4], ['armF' + S, 0.6]], [['armF' + S, 0.3], ['foreF' + S, 0.7]], [['foreF' + S, 1]],
      [['foreF' + S, 0.6], ['cannonF' + S, 0.4]], [['foreF' + S, 0.3], ['cannonF' + S, 0.7]], [['cannonF' + S, 1]], [['cannonF' + S, 0.4], ['pasternF' + S, 0.6]], [['pasternF' + S, 1]],
    ];
    limb(mb, fp, fr, legMat, (ri) => fw[ri], { seg: 10, color: (ri, th, ring) => legCol(ring.c.y, coat) });
    const h = LEGH(s);
    const hp = [h.thigh.clone().add(V(-s * 0.02, 0.06, 0.02)), h.gaskin.clone().lerp(h.thigh, 0.5), h.gaskin.clone().lerp(h.thigh, 0.15), h.gaskin, h.gaskin.clone().lerp(h.cannon, 0.55), h.cannon.clone().add(V(0, 0.02, 0.01)), h.cannon, h.cannon.clone().lerp(h.pastern, 0.5), h.pastern, h.hoof.clone().add(V(0, 0.03, -0.012))];
    const hr = [[0.1, 0.085], [0.115, 0.095], [0.105, 0.086], [0.09, 0.074], [0.07, 0.054], [0.062, 0.05], [0.056, 0.045], [0.04, 0.034], [0.05, 0.045], [0.044, 0.04]];
    const hw = [
      [['pelvis', 0.4], ['thighH' + S, 0.6]], [['thighH' + S, 1]], [['thighH' + S, 0.6], ['gaskinH' + S, 0.4]], [['thighH' + S, 0.3], ['gaskinH' + S, 0.7]], [['gaskinH' + S, 1]],
      [['gaskinH' + S, 0.5], ['cannonH' + S, 0.5]], [['cannonH' + S, 1]], [['cannonH' + S, 1]], [['cannonH' + S, 0.4], ['pasternH' + S, 0.6]], [['pasternH' + S, 1]],
    ];
    limb(mb, hp, hr, legMat, (ri) => hw[ri], { seg: 10, color: (ri, th, ring) => legCol(ring.c.y, coat) });
    // hooves, then a ring of shaggy feather locks over each fetlock and coronet
    const hoofMat = mat(col('#262019'), { tile: 'leather', rough: 0.5, fuzz: 0, tileU: 1, tileV: 2 });
    for (const [base, bone, fb] of [[f.hoof, 'hoofF' + S, 'pasternF' + S], [h.hoof, 'hoofH' + S, 'pasternH' + S]]) {
      const hr2 = [];
      for (let i = 0; i <= 2; i++) {
        const t = i / 2;
        hr2.push({ c: V(base.x, lerp(0.075, 0.0, t), base.z + 0.012 * t), a: V(0, 0, 1), b: V(1, 0, 0), ra: lerp(0.045, 0.062, t), rb: lerp(0.043, 0.056, t) });
      }
      tube(mb, { rings: hr2, seg: 10, mat: hoofMat, capStart: true, capEnd: true, weights: () => [[bone, 1]] });
      for (let q = 0; q < 12; q++) {
        const ang = (q / 12) * TAU + R() * 0.3;
        const out = V(Math.sin(ang), 0, Math.cos(ang));
        const back = Math.max(0, -Math.cos(ang));
        const top = V(base.x, 0.21 + R() * 0.03, base.z - 0.02).addScaledVector(out, 0.035);
        const len = 0.1 + back * 0.06 + R() * 0.04;
        const bot = top.clone().add(V(0, -len, 0)).addScaledVector(out, 0.03 + back * 0.03);
        const pts = [top, top.clone().lerp(bot, 0.5).addScaledVector(out, 0.012), bot];
        const side = V(Math.cos(ang), 0, -Math.sin(ang));
        ribbon(mb, pts, pts.map(() => side), [0.05, 0.045, 0.012], { ...featherMat, color: dark.clone().multiplyScalar(0.9 + R() * 0.5) },
          (i) => (i === 0 ? [[fb, 1]] : [[fb, 0.5], [bone, 0.5]]), { double: true });
      }
    }
  }
  // ---- mane: a thick shaggy fall of locks from the crest (mostly to the left), forelock
  const maneMat = mat(maneC, { tile: 'hair', rough: 0.6, fuzz: 0.5, tileU: 1, tileV: 6 });
  {
    const crestPts = [];
    for (let i = 0; i <= 20; i++) {
      const u = lerp(0.12, 1.0, i / 20);
      const o = neckCurve.getPointAt(u), t = neckCurve.getTangentAt(u);
      const up = V(0, 1, 0).addScaledVector(t, -t.y).normalize();
      crestPts.push({ p: marchOut(o, up, 0.36).p, t, up, u });
    }
    const crestW = (u) => (u < 0.35 ? [['chest', 0.5], ['neck1', 0.5]] : u < 0.6 ? [['neck1', 0.6], ['neck2', 0.4]] : u < 0.85 ? [['neck2', 1]] : [['neck2', 0.4], ['head', 0.6]]);
    // a low roach along the crest so the locks have a root mass
    const roach = crestPts.map(({ p, t, up }) => {
      const fr = frame(t, up);
      return { c: p.clone().addScaledVector(up, 0.012), a: fr.a, b: fr.b, ra: 0.03, rb: 0.035 };
    });
    tube(mb, { rings: roach, seg: 8, mat: { ...maneMat, tileU: 4 }, capStart: true, capEnd: true,
      color: (ri, th) => maneC.clone().multiplyScalar(0.7 + 0.35 * Math.abs(Math.sin(th * 5 + ri))),
      weights: (ri) => crestW(crestPts[ri].u) });
    for (let k = 0; k < 80; k++) {
      // locks hug the side of the neck: sampled on the sculpt, sweeping from the crest down
      const u = lerp(0.14, 0.97, R());
      const o = neckCurve.getPointAt(u), tn = neckCurve.getTangentAt(u);
      const up = V(0, 1, 0).addScaledVector(tn, -tn.y).normalize();
      const left = new THREE.Vector3().crossVectors(up, tn).normalize();
      const sd = R() < 0.8 ? 1 : -1;
      const reach = (0.75 + R() * 0.7) * (1 - u * 0.3);
      const pts = [], ws = [];
      for (let q = 0; q <= 4; q++) {
        const t = q / 4;
        const ang = sd * lerp(-0.05, reach, t);
        const dir = up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(left, Math.sin(ang));
        const sp = marchOut(o, dir, 0.36).p;
        pts.push(sp.addScaledVector(gradV(sp), lerp(0.03, 0.012, t) + 0.008 * R()).addScaledVector(tn, -0.02 * t));
        ws.push(lerp(0.07, 0.016, t) * (0.7 + R() * 0.45));
      }
      const sides = pts.map(() => tn.clone());
      const cu = crestPts.reduce((a, c) => (Math.abs(c.u - u) < Math.abs(a.u - u) ? c : a));
      ribbon(mb, pts, sides, ws, { ...maneMat, color: maneC.clone().multiplyScalar(0.65 + R() * 0.6) }, () => crestW(cu.u), { double: true });
    }
    // forelock over the forehead
    const poll = marchOut(V(0, 1.84, 1.0), V(0, 1, 0.25).normalize(), 0.2).p;
    for (let k = 0; k < 12; k++) {
      const x = (k / 11 - 0.5) * 0.07;
      const p0 = poll.clone().add(V(x, 0.0, 0));
      const pts = [p0, p0.clone().add(V(x * 0.4, -0.06, 0.07)), p0.clone().add(V(x * 0.6, -0.15, 0.1)), p0.clone().add(V(x * 0.8, -0.22, 0.12 + R() * 0.02))];
      ribbon(mb, pts, pts.map(() => V(1, 0, 0)), [0.04, 0.04, 0.03, 0.008], { ...maneMat, color: maneC.clone().multiplyScalar(0.7 + R() * 0.5) }, () => [['head', 1]], { double: true });
    }
  }
  // ---- tail: dock plus a full fall of locks
  {
    const tp = [J.tail0.clone().add(V(0, 0.04, 0.04)), J.tail0, J.tail1, J.tail1.clone().lerp(J.tail2, 0.5), J.tail2, J.tail2.clone().add(V(0, -0.22, -0.02)), J.tail2.clone().add(V(0, -0.42, 0.0)), J.tail2.clone().add(V(0, -0.58, 0.02))];
    const trd = [[0.055, 0.05], [0.07, 0.06], [0.085, 0.07], [0.1, 0.075], [0.115, 0.085], [0.125, 0.09], [0.11, 0.08], [0.04, 0.03]];
    const tw = [[['pelvis', 0.6], ['tail0', 0.4]], [['tail0', 1]], [['tail0', 0.3], ['tail1', 0.7]], [['tail1', 1]], [['tail1', 0.3], ['tail2', 0.7]], [['tail2', 1]], [['tail2', 1]], [['tail2', 1]]];
    limb(mb, tp, trd, { ...maneMat, tileU: 6, tileV: 8 }, (ri) => tw[ri], { seg: 12, capEnd: true, color: (ri, th) => maneC.clone().multiplyScalar(0.7 + 0.45 * Math.abs(Math.sin(th * 7 + ri * 1.3))) });
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * TAU;
      const out = V(Math.sin(ang), 0, Math.cos(ang));
      const p0 = J.tail1.clone().lerp(J.tail2, 0.3 + R() * 0.5).addScaledVector(out, 0.05);
      const len = 0.45 + R() * 0.2;
      const pts = [p0, p0.clone().add(V(0, -len * 0.5, 0)).addScaledVector(out, 0.06), p0.clone().add(V(0, -len, 0)).addScaledVector(out, 0.07 + R() * 0.04)];
      const side = V(Math.cos(ang), 0, -Math.sin(ang));
      ribbon(mb, pts, pts.map(() => side), [0.07, 0.07, 0.02], { ...maneMat, color: maneC.clone().multiplyScalar(0.65 + R() * 0.55) }, (i) => (i === 0 ? [['tail1', 0.5], ['tail2', 0.5]] : [['tail2', 1]]), { double: true });
    }
  }
  // ---- tack: blanket (folk-red trim), saddle, girth, stirrups, bridle, reins, saddlebags,
  // all laid on the sculpted back
  const tackGrid = (z0, z1, th0, th1, nz, nt, off, m, weights, colorFn) => {
    const rows = [];
    for (let i = 0; i <= nz; i++) {
      const z = lerp(z0, z1, i / nz);
      const row = [];
      for (let j = 0; j <= nt; j++) {
        const th = lerp(th0, th1, j / nt);
        const o = typeof off === 'function' ? off(i / nz, j / nt) : off;
        const p = surfAt(z, th, o);
        row.push(mb.vert(p, colorFn ? colorFn(i / nz, j / nt) : m.color, (j / nt) * m.tileU, (i / nz) * m.tileV, m, weights(p)));
      }
      rows.push(row);
    }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    return rows;
  };
  const backW = (p) => (p.z > 0.12 ? [['chest', 0.7], ['spine', 0.3]] : p.z < -0.3 ? [['spine', 0.6], ['pelvis', 0.4]] : [['spine', 1]]);
  {
    const blanket = mat(col('#3e4a5a'), { tile: 'wool', rough: 0.9, fuzz: 0.4, tileU: 4, tileV: 4 });
    tackGrid(0.36, -0.36, -1.2, 1.2, 6, 16, (u, v) => 0.016 + 0.004 * Math.sin(v * Math.PI), blanket, backW,
      (u, v) => blanket.color.clone().multiplyScalar(Math.abs(v - 0.5) > 0.44 || u < 0.05 || u > 0.95 ? 0.6 : 1));
    // folk-red trim along the blanket's lower edges
    const trimM = { ...blanket, tile: TILE.emb(4), tileU: 1, tileV: 6, fuzz: 0.2, color: col('#9a2e22') };
    for (const side of [1, -1]) {
      const edge = [], sides = [];
      for (let i = 0; i <= 10; i++) {
        const z = lerp(0.36, -0.36, i / 10);
        const pA = surfAt(z, side * 1.2, 0.02), pB = surfAt(z, side * 1.05, 0.02);
        edge.push(pA.clone().lerp(pB, 0.5));
        sides.push(pB.clone().sub(pA).normalize());
      }
      ribbon(mb, edge, sides, edge.map(() => 0.07), trimM, (i, p) => backW(p), { flip: side > 0 });
    }
    // saddle: seat with pommel and cantle rising at the ends
    const leather = mat(col('#4a3020'), { tile: 'leather', rough: 0.5, fuzz: 0.1, tileU: 3, tileV: 3 });
    tackGrid(0.24, -0.24, -0.8, 0.8, 8, 10, (u, v) => 0.03 + 0.06 * Math.pow(Math.abs(u * 2 - 1), 3) * (1 - Math.abs(v * 2 - 1) * 0.6), leather, backW,
      (u, v) => leather.color.clone().multiplyScalar(0.85 + 0.25 * (1 - Math.abs(v * 2 - 1))));
    // girth band under the belly
    const strap = mat(col('#2e2219'), { tile: 'leather', rough: 0.6, tileU: 1, tileV: 8 });
    tackGrid(0.27, 0.21, 0.9, TAU - 0.9, 1, 18, 0.01, strap, () => [['chest', 1]]);
    const iron = mat(col('#6e6a62'), { tile: 'metal', rough: 0.4, special: SPECIAL.metal, tileU: 1, tileV: 1 });
    for (const sd of [1, -1]) {
      const top = surfAt(0.0, sd * 0.95, 0.035), bot = V(sd * 0.29, 0.8, 0.02);
      const pts = [top, top.clone().lerp(bot, 0.5).add(V(sd * 0.01, 0, 0)), bot];
      ribbon(mb, pts, pts.map(() => V(0, 0, 1)), [0.035, 0.035, 0.035], strap, () => [['spine', 1]], { double: true });
      blob(mb, bot.clone().add(V(0, -0.04, 0)), { x: 0.02, y: 0.04, z: 0.065 }, iron, [['spine', 1]], 8, 4);
      // saddlebags behind the cantle
      const sb = surfAt(-0.36, sd * 1.35, 0.06);
      blob(mb, sb, { x: 0.06, y: 0.12, z: 0.13 }, leather, [['pelvis', 0.6], ['spine', 0.4]], 8, 6, null, (th) => 1 + 0.22 * Math.pow(Math.abs(Math.cos(th * 2)), 0.5));
    }
    // bridle: noseband, cheek pieces over the poll, reins back to the withers
    const nose = [];
    for (let j = 0; j <= 16; j++) nose.push(marchOut(V(0, 1.47, 1.29), hf.a.clone().multiplyScalar(Math.cos((j / 16) * TAU)).addScaledVector(hf.b, Math.sin((j / 16) * TAU)), 0.2).p);
    ribbon(mb, nose.map((p) => p.clone().addScaledVector(gradV(p), 0.006)), nose.map(() => hAxis.clone()), nose.map(() => 0.028), strap, () => [['head', 1]], { double: true });
    const cheek = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const ang = lerp(-1.4, 1.4, t);
      const o = HEADA.clone().lerp(HEADB, lerp(0.75, 0.0, Math.sin(t * Math.PI)));
      const p = marchOut(o, hf.a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(hf.b, Math.sin(ang)), 0.2).p;
      cheek.push(p.addScaledVector(gradV(p), 0.006));
    }
    ribbon(mb, cheek, cheek.map(() => hAxis.clone()), cheek.map(() => 0.024), strap, () => [['head', 1]], { double: true });
    for (const sd of [1, -1]) {
      const bit = marchOut(V(0, 1.41, 1.3), V(sd, 0, 0), 0.2).p;
      const rp = [bit, V(sd * 0.15, 1.3, 1.0), V(sd * 0.16, 1.27, 0.72), surfAt(0.32, sd * 0.25, 0.02)];
      ribbon(mb, rp, rp.map(() => V(0, 1, 0)), rp.map(() => 0.02), strap, (i) => (i < 1 ? [['head', 1]] : i < 2 ? [['head', 0.5], ['neck2', 0.5]] : i < 3 ? [['neck1', 1]] : [['chest', 1]]), { double: true });
    }
  }
  return mb.build();
}

class Horse {
  constructor(id, opts) {
    this.id = id;
    this.isHorse = true;
    const look = { seed: 11, ...opts };
    this.rig = buildRig();
    const geo = buildHorseMesh(this.rig, look);
    this.material = createCharacterMaterial({ faceTex: null });
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.name = 'horse_' + id;
    this.mesh.add(this.rig.bones[0]);
    this.mesh.bind(this.rig.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = new THREE.Sphere(V(0, 1.0, 0.2), 1.6);
    this.root = new THREE.Group();
    this.root.name = 'horse';
    this.root.add(this.mesh);
    this.root.userData.horse = this;
    this.bones = this.rig.byName;
    this.height = 1.42;
    this.M = { H: 1.6 };
    // saddle seat anchor on the back (rides with the spine motion)
    this.saddle = new THREE.Object3D();
    this.saddle.name = 'saddle';
    this.saddle.position.set(0, 1.4 - J.spine.y + 0.0, -0.04 - J.spine.z);
    this.bones.spine.add(this.saddle);
    this.speed = 0;
    this.targetSpeed = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.visible = true;
    this._acc = 0;
    this.one = null;
    this.tailSwish = { t: 2, v: 0 };
    this.earT = { t: 1, l: 0, r: 0 };
    this.headDown = 0;
    this.headDownT = 4;
    this.bind = {};
    for (const b of this.rig.bones) this.bind[b.name] = b.position.clone();
    this.gait = 'idle';
    this.update(0, { lod: 0 });
  }
  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
  setPosition(x, z, y) {
    const gy = y ?? (G.characters?.heightAt ? G.characters.heightAt(x, z) : G.world ? G.world.heightAt(x, z) : 0);
    this.root.position.set(x, gy, z);
    return this;
  }
  setGait(speed) { this.targetSpeed = Math.max(0, speed); return this; }
  play(name, o = {}) {
    if (name === 'idle') { this.setGait(0); return Promise.resolve(); }
    if (name === 'walk') { this.setGait(1.7); return Promise.resolve(); }
    if (name === 'trot') { this.setGait(3.6); return Promise.resolve(); }
    if (name === 'gallop') { this.setGait(9); return Promise.resolve(); }
    const dur = name === 'rear' ? 2.6 : name === 'snort' ? 1.4 : 0;
    if (!dur) return Promise.resolve();
    // o.amount scales a rear: 1 is the full rear, about 0.3 a start and a toss of the head (a shy), o.speed plays it faster
    return new Promise((resolve) => { this.one = { name, t: 0, dur, resolve, speed: o.speed ?? 1, amount: o.amount ?? 1 }; });
  }
  attach(bone, obj) { (this.bones[bone] || this.saddle).add(obj); return obj; }
  setVisible(v) { this.visible = v; this.root.visible = v; }
  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.skeleton.dispose();
    this.disposed = true;
    if (G.characters && G.characters._unregister) G.characters._unregister(this);
  }

  // Gait weights by speed.
  _weights(v) {
    if (v < 0.05) return { idle: 1 };
    if (v < 1.7) { const t = smoothstep(0.05, 1.2, v); return { idle: 1 - t, walk: t }; }
    if (v < 3.0) { const t = smoothstep(2.2, 3.0, v); return { walk: 1 - t, trot: t }; }
    if (v < 6.5) { const t = smoothstep(4.8, 6.5, v); return { trot: 1 - t, gallop: t }; }
    return { gallop: 1 };
  }

  update(dt, ctx) {
    this.time += dt;
    const acc = this.targetSpeed > this.speed ? 3.5 : 5;
    this.speed += Math.sign(this.targetSpeed - this.speed) * Math.min(Math.abs(this.targetSpeed - this.speed), acc * dt);
    if (G.characters?.heightAt || G.world) {
      const p = this.root.position;
      p.y = G.characters?.heightAt ? G.characters.heightAt(p.x, p.z) : G.world.heightAt(p.x, p.z);
    }
    const w = this._weights(this.speed);
    let freq = 0, wsum = 0;
    for (const k in w) if (k !== 'idle') { freq += (GAIT[k].f * this.speed / GAIT[k].v) * w[k]; wsum += w[k]; }
    if (wsum > 0) freq /= wsum;
    if (wsum > 0) this.phase = (this.phase + freq * dt) % 1;
    this.gait = Object.keys(w).reduce((a, b) => (w[a] > w[b] ? a : b));
    // accumulate joint angles (degrees) per bone and body offsets
    const P = {};
    const add = (b, x, y = 0, z = 0, k = 1) => { const o = P[b] || (P[b] = [0, 0, 0]); o[0] += x * k; o[1] += y * k; o[2] += z * k; };
    let lift = 0, pitch = 0;
    for (const k in w) {
      const g = k === 'idle' ? null : GAIT[k];
      const ww = w[k];
      if (!g) { idlePose(add, this, ww); continue; }
      const r = gaitPose(add, g, this.phase, ww);
      lift += r.lift * ww; pitch += r.pitch * ww;
    }
    // one-shots
    if (this.one) {
      const o = this.one;
      o.t += dt * o.speed;
      const u = Math.min(1, o.t / o.dur);
      const env = Math.min(1, u / 0.12, (1 - u) / 0.2);
      if (o.name === 'rear') {
        const up = smoothstep(0.1, 0.4, u) * (1 - smoothstep(0.7, 0.95, u)) * (o.amount ?? 1);
        pitch += -48 * up;
        lift += 0.08 * up;
        for (const S of ['L', 'R']) {
          const paw = Math.sin(this.time * 9 + (S === 'L' ? 0 : 1.5)) * up;
          add('armF' + S, -40 * up - 20 * paw); add('foreF' + S, 60 * up + 30 * paw); add('cannonF' + S, -90 * up - 20 * paw, 0, 0);
          add('thighH' + S, -40 * up); add('gaskinH' + S, 30 * up); add('cannonH' + S, -36 * up);
        }
        add('neck1', -10 * up); add('neck2', -20 * up); add('head', 25 * up); add('tail0', -30 * up);
        add('earL', -20 * up); add('earR', -20 * up);
      } else if (o.name === 'snort') {
        const toss = Math.sin(u * Math.PI * 3) * env;
        add('neck1', -6 * toss); add('neck2', -10 * toss); add('head', 14 * toss, 12 * Math.sin(u * 20) * env, 0);
        add('jaw', 6 * env);
        add('earL', 0, 0, 20 * env); add('earR', 0, 0, -20 * env);
      }
      if (o.t >= o.dur) { this.one = null; o.resolve(true); }
    }
    // tail and ears life
    const ts = this.tailSwish;
    ts.t -= dt;
    if (ts.t <= 0) { ts.t = 2 + Math.random() * 5; ts.v = 1; }
    ts.v = Math.max(0, ts.v - dt * 0.9);
    const sw = Math.sin(this.time * 7) * ts.v * 30;
    add('tail0', 12 + this.speed * 4, sw * 0.4, 0); add('tail1', -8 - this.speed * 3, sw * 0.6, 0); add('tail2', -6 - this.speed * 2, sw, 0);
    const et = this.earT;
    et.t -= dt;
    if (et.t <= 0) { et.t = 1 + Math.random() * 3; et.l = (Math.random() - 0.5) * 50; et.r = (Math.random() - 0.5) * 50; }
    add('earL', 0, et.l, 10); add('earR', 0, et.r, -10);
    // write
    const by = this.bones;
    for (const b of this.rig.bones) {
      const a = P[b.name];
      if (a) b.rotation.set(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'YXZ');
      else b.rotation.set(0, 0, 0);
    }
    // body pitch around the hind feet when rearing; lift for bounce
    const pv = by.pelvis;
    pv.position.copy(this.bind.pelvis);
    pv.position.y += lift;
    if (Math.abs(pitch) > 0.01) {
      // rotate the pelvis about the hind hooves line so the body rises in front
      const pr = pitch * D2R;
      const pivot = V(0, 0.07, -0.6);
      const off = this.bind.pelvis.clone().sub(pivot);
      off.applyAxisAngle(V(1, 0, 0), pr);
      pv.position.copy(pivot).add(off);
      pv.position.y += lift;
      pv.rotation.x += pr;
      for (const S of ['L', 'R']) by['thighH' + S].rotation.x -= pr;
    }
    if (ctx.lod <= 1) {
      this.root.updateMatrixWorld(true);
      void ctx;
    }
  }
}

// Gait parameters: f = stride frequency at reference speed v, duty = stance fraction,
// offs = phase per leg [LH, LF, RH, RF], sweep = stance half angle (deg), lift amounts.
const GAIT = {
  walk: { v: 1.7, f: 0.87, duty: 0.64, offs: [0, 0.25, 0.5, 0.75], sweep: 16, knee: 70, hock: 45, bob: 0.015, nod: 5, pitch: 0, fLead: 0 },
  trot: { v: 3.6, f: 1.45, duty: 0.42, offs: [0, 0.5, 0.5, 0], sweep: 20, knee: 95, hock: 60, bob: 0.035, nod: 2, pitch: 0, fLead: 0 },
  gallop: { v: 9, f: 2.2, duty: 0.3, offs: [0, 0.32, 0.12, 0.44], sweep: 30, knee: 110, hock: 75, bob: 0.06, nod: 12, pitch: 6, fLead: 0 },
};

function legCurve(p, duty, sweep, knee, front) {
  // returns { hip (deg, + = leg back), mid, low, foot } for the local phase p
  if (p < duty) {
    const s = p / duty;
    const a = lerp(-sweep, sweep, s); // forward (-) to back (+)
    const load = Math.sin(s * Math.PI);
    return front
      ? { hip: a, mid: 0, low: 0, fet: -14 * load }
      : { hip: a, mid: 8 + 6 * load, low: -10 - 8 * load, fet: -12 * load };
  }
  const u = (p - duty) / (1 - duty);
  const a = lerp(sweep, -sweep * 1.08, u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const fold = Math.sin(Math.min(1, u * 1.25) * Math.PI);
  return front
    ? { hip: a, mid: -28 * fold, low: knee * fold, fet: 40 * fold - 6 }
    : { hip: a, mid: 30 * fold, low: -knee * 0.75 * fold, fet: 45 * fold };
}

function gaitPose(add, g, phase, w) {
  const legs = [['H', 'L', 0], ['F', 'L', 1], ['H', 'R', 2], ['F', 'R', 3]];
  for (const [FH, S, i] of legs) {
    const p = (phase + g.offs[i]) % 1;
    const c = legCurve(p, g.duty, g.sweep, FH === 'F' ? g.knee : g.hock, FH === 'F');
    if (FH === 'F') {
      add('scap' + S, c.hip * 0.35, 0, 0, w);
      add('armF' + S, c.hip * 0.65 + c.mid, 0, 0, w);
      add('foreF' + S, -c.mid * 0.6, 0, 0, w);
      add('cannonF' + S, c.low, 0, 0, w);
      add('pasternF' + S, -c.fet, 0, 0, w);
      add('hoofF' + S, c.fet * 0.4, 0, 0, w);
    } else {
      add('thighH' + S, c.hip - c.mid * 0.4, 0, 0, w);
      add('gaskinH' + S, c.mid, 0, 0, w);
      add('cannonH' + S, c.low, 0, 0, w);
      add('pasternH' + S, -c.fet, 0, 0, w);
      add('hoofH' + S, c.fet * 0.4, 0, 0, w);
    }
  }
  const t = phase * TAU;
  // head and neck: nod with the front footfalls (2 per stride in walk), big swing in gallop
  const nod = g === GAIT.gallop ? Math.sin(t - 0.6) : Math.sin(2 * t + 0.8);
  add('neck1', g.nod * 0.5 * nod, 0, 0, w);
  add('neck2', g.nod * 0.3 * nod, 0, 0, w);
  add('head', -g.nod * 0.4 * nod - (g === GAIT.gallop ? 12 : 0), 0, 0, w);
  add('spine', g === GAIT.gallop ? 4 * Math.sin(t + 1) : 0, 0, 0, w);
  const lift = g === GAIT.gallop ? g.bob * Math.sin(t - 0.3) : g.bob * Math.abs(Math.sin(2 * t));
  const pitch = g.pitch * Math.sin(t + 0.4);
  return { lift: lift - (g === GAIT.gallop ? 0.03 : 0), pitch };
}

function idlePose(add, h, w) {
  const t = h.time;
  // weight resting on one hind leg (cocked hoof), slow head movements, occasional grazing dip
  h.headDownT -= 1 / 60;
  const shift = Math.sin(t * 0.3);
  add('thighHR', -2, 0, 0, w); add('gaskinHR', 8, 0, 0, w); add('cannonHR', -14, 0, 0, w); add('pasternHR', 20, 0, 0, w); add('hoofHR', 10, 0, 0, w);
  add('neck1', 6 + 4 * Math.sin(t * 0.21), 2 * shift, 0, w);
  add('neck2', 4 + 3 * Math.sin(t * 0.17 + 1), 4 * Math.sin(t * 0.13), 0, w);
  add('head', 6 + 3 * Math.sin(t * 0.23), 6 * Math.sin(t * 0.11), 2 * Math.sin(t * 0.19), w);
  add('spine', 0.8 * Math.sin(t * 1.3), 0, 0, w);
  add('jaw', 2 + 2 * Math.max(0, Math.sin(t * 2.3)), 0, 0, w);
}

export function createHorse(id = 'kasza', opts = {}) {
  const look = id === 'kasza' ? { coat: '#b0915f', points: '#3a2e24', mane: '#2a221c', seed: 11 } : {};
  return new Horse(id, { ...look, ...opts });
}
