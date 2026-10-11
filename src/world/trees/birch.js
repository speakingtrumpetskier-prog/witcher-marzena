// Silver birch: white trunk with black scars (procedural in the shader), thin ascending or weeping
// limbs, and fine twig sprays drawn as alpha cards. In spring the same crown carries leaf cards that
// grow from their centers with uSpring. Owner: vegetation builder.
// Three parts per LOD: trunk and limbs (opaque), twig cards (alpha), leaf cards (alpha, grow).
import * as THREE from 'three';
import { GeoBuilder, rng, rgb, mixRGB, tube } from './geo.js';
import { BIRCH_UV } from './textures.js';

export const BIRCH_VARIANTS = [
  { id: 'birch_a', seed: 2101, H: 12.5, base: 0.34, branches: 24, weep: 0.0, lean: 0.5, twin: false, cardW: 2.1 },
  { id: 'birch_b', seed: 2202, H: 9.5, base: 0.28, branches: 18, weep: 0.1, lean: 1.3, twin: true, cardW: 1.9 },
  { id: 'birch_c', seed: 2303, H: 14.5, base: 0.4, branches: 26, weep: 0.55, lean: 0.35, twin: false, cardW: 2.3 },
];

const PAL = {
  trunk: rgb('#e4e0d4'),
  limbLow: rgb('#b9b3a6'),
  limbHigh: rgb('#4a3a36'),
  twig: rgb('#ffffff'),
  leaf: rgb('#ffffff'),
};

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Card with its bottom center at c, extending along `up`, spanning `right`.
function addCard(b, c, up, right, w, h, rect, tint, flex, phase, ball) {
  const hw = w * 0.5;
  const bl = [c[0] - right[0] * hw, c[1] - right[1] * hw, c[2] - right[2] * hw];
  const br = [c[0] + right[0] * hw, c[1] + right[1] * hw, c[2] + right[2] * hw];
  const corners = [bl, br, [br[0] + up[0] * h, br[1] + up[1] * h, br[2] + up[2] * h], [bl[0] + up[0] * h, bl[1] + up[1] * h, bl[2] + up[2] * h]];
  const uvs = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]];
  const ids = corners.map((p, i) => {
    const n = norm([p[0] - ball[0], p[1] - ball[1] + 4, p[2] - ball[2]]);
    return b.v(p[0], p[1], p[2], n[0], n[1], n[2], tint, uvs[i][0], uvs[i][1], 0, flex * (i > 1 ? 1 : 0.4), phase);
  });
  b.tri(ids[0], ids[1], ids[2]);
  b.tri(ids[0], ids[2], ids[3]);
}

// Leaf card: all four vertices sit at the center; aCorner holds the offset that grows with uSpring.
function addLeafCard(b, corners, c, up, right, w, h, rect, tint, flex, phase, ball) {
  const hw = w * 0.5, hh = h * 0.5;
  const offs = [
    [-right[0] * hw - up[0] * hh, -right[1] * hw - up[1] * hh, -right[2] * hw - up[2] * hh],
    [right[0] * hw - up[0] * hh, right[1] * hw - up[1] * hh, right[2] * hw - up[2] * hh],
    [right[0] * hw + up[0] * hh, right[1] * hw + up[1] * hh, right[2] * hw + up[2] * hh],
    [-right[0] * hw + up[0] * hh, -right[1] * hw + up[1] * hh, -right[2] * hw + up[2] * hh],
  ];
  const uvs = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]];
  const n = norm([c[0] - ball[0], c[1] - ball[1] + 4, c[2] - ball[2]]);
  const ids = offs.map((o, i) => {
    corners.push(o[0], o[1], o[2]);
    return b.v(c[0], c[1], c[2], n[0], n[1], n[2], tint, uvs[i][0], uvs[i][1], 0, flex, phase);
  });
  b.tri(ids[0], ids[1], ids[2]);
  b.tri(ids[0], ids[2], ids[3]);
}

export function buildBirch(v, lod = 0) {
  const r = rng(v.seed);
  const trunkB = new GeoBuilder();
  const twigB = new GeoBuilder();
  const leafB = new GeoBuilder();
  const leafCorners = [];
  const H = v.H;
  const phase0 = r() * 6.28;
  const nTrunks = v.twin ? 2 : 1;
  const sides = [5, 4, 3][lod];
  const ball = [0, H * 0.7, 0];
  let maxR = 0;

  for (let tIdx = 0; tIdx < nTrunks; tIdx++) {
    const th0 = r() * 6.28;
    const tH = H * (tIdx === 0 ? 1 : 0.8);
    const spread = tIdx === 0 ? 0 : 0.5;
    const lean = v.lean * (tIdx === 0 ? 1 : -0.9);
    const tx = (y) => Math.cos(th0) * (lean * Math.pow(y / tH, 2) + spread * (y / tH)) + Math.sin(y * 0.5 + phase0) * 0.12 * (y / tH);
    const tz = (y) => Math.sin(th0) * (lean * Math.pow(y / tH, 2) + spread * (y / tH)) + Math.cos(y * 0.43 + phase0) * 0.1 * (y / tH);
    const nRings = lod === 0 ? 9 : lod === 1 ? 5 : 3;
    const pts = [];
    for (let i = 0; i < nRings; i++) {
      const t = i / (nRings - 1);
      const y = -0.3 + (tH * 0.985 + 0.3) * t;
      pts.push([tx(y), y, tz(y)]);
    }
    const rad0 = (0.07 + tH * 0.0052) * (tIdx === 0 ? 1 : 0.85);
    tube(trunkB, pts, (i, t) => (rad0 * Math.pow(1 - t, 0.8) + 0.018) * (1 + 0.5 * Math.exp(-(pts[i][1] + 0.3) / 0.5)),
      (i, t) => mixRGB(PAL.trunk, PAL.limbLow, Math.pow(t, 2.5) * 0.7),
      { sides, rng: r, uv: true, uvScale: 1.0, phase: r() * 20, snowFn: (ny) => (ny > 0.75 ? 0.2 : 0), flex: (t) => t * 0.25 });

    // limbs
    const nBr = lod === 0 ? v.branches : lod === 1 ? Math.round(v.branches * 0.6) : 5;
    for (let i = 0; i < nBr; i++) {
      const f = (i + r() * 0.8) / nBr;
      const y = tH * (v.base + (0.97 - v.base) * f);
      const th = r() * 6.28 + i * 2.4;
      const len = (1.6 + r() * 1.5) * Math.pow(1 - f * 0.75, 0.6) * (tH / 12) * (lod === 2 ? 1.3 : 1);
      const elev = (0.55 - 0.15 * f) * (1 - v.weep * 0.6) + (r() - 0.5) * 0.3; // radians-ish up from horizontal
      const dx = Math.cos(th), dz = Math.sin(th);
      const p0 = [tx(y), y, tz(y)];
      const p1 = [p0[0] + dx * len * 0.5, p0[1] + Math.sin(elev) * len * 0.5, p0[2] + dz * len * 0.5];
      const p2 = [p0[0] + dx * len, p0[1] + Math.sin(elev) * len * 0.8 - v.weep * len * 0.55, p0[2] + dz * len];
      maxR = Math.max(maxR, len + 0.5);
      if (lod < 2) {
        tube(trunkB, [p0, p1, p2], (k, t) => 0.032 * (1 - t * 0.7) + 0.01, (k, t) => mixRGB(PAL.limbLow, PAL.limbHigh, 0.3 + t * 0.6),
          { sides: lod === 0 ? 3 : 3, rng: r, uv: true, uvScale: 1.0, phase: r() * 20, snowFn: (ny) => (ny > 0.5 ? 0.7 : 0), flex: (t) => 0.3 + t * 0.7 });
      }
      // sub limb
      let ends = [p2];
      if (lod === 0) {
        const th2 = th + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6);
        const sl = len * (0.45 + r() * 0.2);
        const q1 = [p1[0] + Math.cos(th2) * sl * 0.5, p1[1] + sl * 0.3, p1[2] + Math.sin(th2) * sl * 0.5];
        const q2 = [p1[0] + Math.cos(th2) * sl, p1[1] + sl * 0.5 - v.weep * sl * 0.4, p1[2] + Math.sin(th2) * sl];
        tube(trunkB, [p1, q1, q2], (k, t) => 0.018 * (1 - t * 0.6) + 0.006, (k, t) => mixRGB(PAL.limbLow, PAL.limbHigh, 0.6 + t * 0.4),
          { sides: 3, rng: r, uv: true, uvScale: 1.0, phase: r() * 20, snowFn: (ny) => (ny > 0.5 ? 0.6 : 0), flex: (t) => 0.5 + t * 0.5 });
        ends.push(q2);
      }
      // cards at the limb ends: two crossed twig cards, one leaf card, aligned with the limb direction
      for (const e of ends) {
        const up = norm([e[0] - p0[0], e[1] - p0[1] + 0.35, e[2] - p0[2]]);
        const side0 = norm(cross(up, [r() - 0.5, r() - 0.5, r() - 0.5]));
        const side1 = norm(cross(up, side0));
        const cw = v.cardW * (0.85 + r() * 0.35) * (lod === 1 ? 1.45 : lod === 2 ? 2.4 : 1);
        const base = [e[0] - up[0] * cw * 0.35, e[1] - up[1] * cw * 0.35, e[2] - up[2] * cw * 0.35];
        const phase = r() * 20;
        const tint = [0.78 + r() * 0.2, 0.74 + r() * 0.18, 0.74 + r() * 0.18];
        addCard(twigB, base, up, side0, cw, cw * 1.15, lod === 0 ? BIRCH_UV.twig : BIRCH_UV.haze, tint, 1, phase, ball);
        if (lod < 2 && e === p2) addCard(twigB, base, up, side1, cw * 0.9, cw * 1.05, lod === 0 ? BIRCH_UV.twig : BIRCH_UV.haze, tint, 1, phase + 1, ball);
        const lc = [e[0] + up[0] * cw * 0.15, e[1] + up[1] * cw * 0.15, e[2] + up[2] * cw * 0.15];
        const lt = [0.85 + r() * 0.3, 0.9 + r() * 0.25, 0.8 + r() * 0.3];
        addLeafCard(leafB, leafCorners, lc, up, side0, cw * 0.95, cw * 0.95, BIRCH_UV.leaf, lt, 1, phase, ball);
        if (lod < 2) addLeafCard(leafB, leafCorners, lc, up, side1, cw * 0.8, cw * 0.8, BIRCH_UV.leaf, lt, 1, phase + 1, ball);
      }
    }
  }
  const trunkGeo = trunkB.toGeometry();
  const twigGeo = twigB.toGeometry();
  const leafGeo = leafB.toGeometry();
  leafGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(leafCorners, 3));
  return {
    parts: [
      { geometry: trunkGeo, mode: 'birch' },
      { geometry: twigGeo, mode: 'cards', noShadow: true, card: true, haze: lod > 0 },
      { geometry: leafGeo, mode: 'leaves', noShadow: true, card: true, leaves: true },
    ],
    height: H * 1.02, radius: maxR + 1.0, trunkR: 0.12 + H * 0.004,
  };
}
