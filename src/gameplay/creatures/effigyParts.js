// Geometry for the animated Marzanna effigy: the props kit look (white rag dress, pale carved face,
// straw hands and hair, red twine, ice crust) built as separate parts so each can ride its own bone.
// Each builder returns a Group from Kit.build() (merged per material, origin at the joint it hangs from).
//
//   skirtPart(seed)   hangs from the waist (hem at y = -0.62)
//   torsoPart(seed)   bodice, belt, neck and the red knot; origin at the waist
//   headPart(seed)    face, hair, wreath, ice crust; origin at the base of the neck
//   armPart(seed, side) sleeve and straw hand hanging from the shoulder (upper arm + forearm in one,
//                     the elbow bone only bends the lower half: see lowerArmPart)
//   upperArmPart / lowerArmPart                   arm halves split at the elbow (y = -0.34)
//   pilePart(seed)    wet straw and rags left after the collapse, plus knotMesh() for the red knot
import * as THREE from 'three';
import { Kit, TAU } from '../../world/props/kit.js';
import { linenFace, strawWreath } from '../../world/props/p_ritual.js';

const FROZEN_STRAW = [0xe0ecf4, 0xd0dfe8, 0xc4d6e2];
const RED = [0x8a281e, 0x962e22, 0x7a2219];
const WHITE = 0xe8f0f6;

function twine(k, y, r, tint = RED[0], thick = 0.009) {
  k.torus('ribbon', r, thick, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 4, tint, grime: 0, var: 0.05 });
}

export function skirtPart(seed = 1) {
  const k = new Kit('eff_skirt', { seed });
  const hem = -0.6;
  const prof = [[0.52, hem], [0.49, hem + 0.1], [0.4, hem + 0.3], [0.29, hem + 0.5], [0.16, 0.0]];
  k.lathe('dress', prof, {
    radial: 20, tint: WHITE, uRepeat: 1, tile: 1.0, grime: 0.35, var: 0.05, jitter: 0.004,
    ripple: { n: 8, amp: 0.07, from: hem + 0.25, to: hem + 0.62, phase: k.r(0, TAU) }, sway: 0.5, swayFrom: 0,
  });
  // Ragged hem strips and the straw the figure is made of showing underneath.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + k.rs(0.1);
    k.hang('dress', 0.1 + k.r(0, 0.06), 0.14 + k.r(0, 0.14), { pos: [Math.sin(a) * 0.5, hem + 0.05, Math.cos(a) * 0.5], rot: [0, a, 0], tint: WHITE, sway: 0.6, sy: 3, wave: 0.02 });
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + k.rs(0.1);
    const L = 0.1 + k.r(0, 0.12);
    k.blade('straw', 0.045, L, { pos: [Math.sin(a) * 0.5, hem + 0.02 - L / 2 + 0.06, Math.cos(a) * 0.5], yaw: a, rot: [-0.12 - k.r(0, 0.15), 0, 0], tint: k.pick(FROZEN_STRAW), var: 0.12, grime: 0.1, taper: 0.5 });
  }
  // Ice crust: icicles along the hem.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + k.rs(0.1);
    k.cone('ice', 0.018, k.r(0.07, 0.2), { pos: [Math.cos(a) * 0.5, hem + 0.06, Math.sin(a) * 0.5], rot: [Math.PI, 0, 0], radial: 5, tint: k.pick([0xd8ecf8, 0xc4dcec]), grime: 0 });
  }
  return k.build();
}

function addKnot(k, y, z) {
  k.with({ pos: [0, y, z] }, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const t = (j / 8) * TAU;
        pts.push([Math.cos(t) * 0.032 + Math.cos(a) * 0.012, Math.sin(t) * 0.022 + Math.sin(a) * 0.012, Math.sin(t * 2 + a) * 0.012]);
      }
      k.tube('ribbon', pts, 0.0065, { closed: true, radial: 4, segs: 14, tint: RED[0], grime: 0, var: 0.05 });
    }
    k.sph('ribbon', 0.012, { ws: 6, hs: 5, tint: 0x7a2018, grime: 0 });
    for (const sx of [-1, 1]) k.hang('ribbon', 0.014, 0.28 + k.r(0, 0.1), { pos: [sx * 0.012, -0.01, 0.01], rot: [0, 0, sx * 0.08], tint: RED[sx > 0 ? 1 : 2], sway: 0.9, sy: 5, grime: 0, var: 0 });
  });
}

export function torsoPart(seed = 1) {
  const k = new Kit('eff_torso', { seed });
  const bod = [[0.14, 0], [0.15, 0.1], [0.165, 0.26], [0.15, 0.38], [0.075, 0.45]];
  k.lathe('dress', bod, { radial: 14, tint: WHITE, uRepeat: 1, tile: 0.6, uvRect: [0, 0.86, 1, 1.0], grime: 0.1, var: 0.04, scale: [1.0, 1.0, 0.78] });
  k.cyl('ribbon', 0.148, 0.148, 0.05, { pos: [0, 0.02, 0], radial: 14, open: true, tint: RED[1], grime: 0, scale: [1, 1, 0.8], jitter: 0.003 });
  for (const sx of [-1, 1]) k.hang('ribbon', 0.06, 0.5, { pos: [sx * 0.07, 0.0, 0.125], tint: RED[sx > 0 ? 0 : 2], sway: 0.9, wave: 0.02, sy: 6, grime: 0, var: 0.02 });
  // Neck, twine wraps, straw padding at the shoulders.
  const nk = 0.45;
  k.torus('straw', 0.075, 0.03, { pos: [0, nk + 0.02, 0], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 5, tint: 0xdbe8f0, var: 0.15, grime: 0, jitter: 0.005 });
  k.cyl('straw', 0.052, 0.062, 0.14, { pos: [0, nk + 0.02, 0], radial: 8, tint: 0xdbe8f0, jitter: 0.006, cap: null, grime: 0 });
  for (let i = 0; i < 3; i++) twine(k, nk - 0.03 + i * 0.03, 0.056, RED[i % 3], 0.008);
  for (const sx of [-1, 1]) k.sph('straw', 0.07, { pos: [sx * 0.15, 0.39, 0], scale: [1, 0.8, 1], ws: 8, hs: 6, tint: 0xd8e4ec, jitter: 0.01 });
  addKnot(k, 0.2, 0.135 * 0.78 + 0.02);
  // Frost on the shoulders.
  for (const sx of [-1, 1]) k.mound(0.26, 0.05, 0.22, { pos: [sx * 0.15, 0.43, 0], jseed: 4 + sx });
  return k.build();
}

export function headPart(seed = 1) {
  const k = new Kit('eff_head', { seed });
  const y = 0.2, s = 1.4;
  const c = 0xe6dac4;
  k.with({ pos: [0, y, 0], scale: s }, () => {
    // The same linen face as the effigies on poles (world/props/p_ritual.js).
    linenFace(k, { tint: c });
    // Ice crust over the brow and one cheek.
    k.sph('ice', 0.108, { scale: [0.9, 1.16, 0.96], ws: 12, hs: 8, p0: Math.PI / 2 - 0.85, p1: 1.7, t0: 0.5, t1: 2.5, tint: 0xd6e8f4, grime: 0, jitter: 0.004, var: 0.03 });
  });
  // Straw hair, longer at the back.
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k.rs(0.07);
    const front = 0.5 + 0.5 * Math.cos(a);
    if (front > 0.88) continue;
    const len = 0.1 + (1 - front) * 0.46 + k.r(0, 0.12);
    const r0 = 0.1 + 0.02 * (1 - front);
    k.blade('straw', 0.04, len, {
      pos: [Math.sin(a) * r0 * s, y + 0.075 + (1 - front) * 0.015 - len / 2 - 0.02 * front, Math.cos(a) * r0 * s - 0.005], yaw: a, rot: [-0.1 - k.r(0, 0.18) - (1 - front) * 0.05, 0, k.rs(0.06)],
      taper: 0.35, tint: k.pick(FROZEN_STRAW), var: 0.12, grime: 0.05, tile: 0.4,
    });
  }
  strawWreath(k, y, s, { frozen: true });
  return k.build();
}

// Arm halves hang down -Y from their joint. The upper half ends at y = -0.34 where the elbow bone sits.
export function upperArmPart(seed = 1) {
  const k = new Kit('eff_uarm', { seed });
  k.cyl('dress', 0.08, 0.062, 0.36, { pos: [0, -0.17, 0], radial: 9, tint: WHITE, jitter: 0.006, cap: null, uRepeat: 1, tile: 1.0, sway: 0.3, swayFrom: 0 });
  k.sph('straw', 0.06, { pos: [0, 0.0, 0], ws: 7, hs: 5, tint: 0xd8e4ec, jitter: 0.008 });
  return k.build();
}

export function lowerArmPart(seed = 1) {
  const k = new Kit('eff_larm', { seed });
  const len = 0.38;
  k.cyl('dress', 0.062, 0.05, len, { pos: [0, -len / 2, 0], radial: 9, tint: WHITE, jitter: 0.006, cap: null, uRepeat: 1, tile: 1.0, sway: 0.4, swayFrom: 0 });
  twine(k, -len + 0.03, 0.054, RED[0], 0.011);
  twine(k, -len + 0.012, 0.05, 0x8a7448, 0.008);
  // A bundle of straw for a hand, fingers splayed.
  k.cyl('straw', 0.04, 0.012, 0.17, { pos: [0, -len - 0.07, 0], radial: 7, tint: 0xdbe8f0, jitter: 0.004, cap: null, grime: 0 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    k.blade('straw', 0.016, 0.16, { pos: [Math.sin(a) * 0.022, -len - 0.2, Math.cos(a) * 0.022], yaw: a, rot: [-0.25, 0, 0], tint: k.pick(FROZEN_STRAW), grime: 0, taper: 0.3 });
  }
  for (let i = 0; i < 3; i++) k.cone('ice', 0.012, 0.06 + k.r(0, 0.1), { pos: [k.rs(0.04), -len - 0.02 - k.r(0, 0.03), k.rs(0.04)], rot: [Math.PI, 0, 0], radial: 5, tint: 0xd6e8f4, grime: 0 });
  return k.build();
}

// What is left after the collapse: a heap of wet straw and a dark rag, no snow on it.
export function pilePart(seed = 1) {
  const k = new Kit('eff_pile', { seed, indoor: true });
  for (let i = 0; i < 5; i++) {
    const a = k.r(0, TAU), d = k.r(0, 0.4);
    k.blob('straw', k.r(0.26, 0.4), { pos: [Math.cos(a) * d, 0.06, Math.sin(a) * d], scale: [1.4, 0.4, 1.2], detail: 1, tint: k.pick([0x6a5a3c, 0x5a4a30, 0x7a6a48]), jitter: 0.06 });
  }
  for (let i = 0; i < 26; i++) {
    const a = k.r(0, TAU), d = k.r(0.1, 0.85);
    k.blade('straw', 0.03, k.r(0.25, 0.6), { pos: [Math.cos(a) * d, k.r(0.02, 0.1), Math.sin(a) * d], rot: [Math.PI / 2 + k.rs(0.25), k.r(0, TAU), 0], tint: k.pick([0x6a5a3c, 0x7a6a4a, 0x544630]), grime: 0.2, var: 0.14 });
  }
  k.plane('dress', 1.0, 0.9, { pos: [0.12, 0.09, -0.05], rot: [-Math.PI / 2, 0.4, 0], tint: 0x6e6a64, grime: 0.2, sy: 4, sx: 4, bend: (x, y) => [0, Math.sin(x * 9 + y * 7) * 0.03, 0] });
  k.plane('dress', 0.6, 0.5, { pos: [-0.2, 0.12, 0.2], rot: [-Math.PI / 2, -0.7, 0], tint: 0x585450, grime: 0.2 });
  return k.build();
}

// The red thread knot left behind: three looped tubes, small enough to pick up.
export function knotMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a2a1e, roughness: 0.8, emissive: new THREE.Color(0.35, 0.05, 0.03), emissiveIntensity: 0.6 });
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.TorusGeometry(0.045, 0.009, 6, 20);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.set(i * 1.05, i * 0.7, i * 0.4);
    m.scale.set(1, 0.75 + i * 0.1, 1);
    g.add(m);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), mat);
  tail.position.set(0.04, -0.08, 0);
  tail.rotation.z = 0.5;
  g.add(tail);
  g.userData.material = mat;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
