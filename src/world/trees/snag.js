// Dead standing trees: weathered grey snags, snapped trunks and a twisted leaning limb tree.
// Ravens like these. Owner: vegetation builder.
// lod 0: trunk, limbs and twigs; lod 1: trunk and limbs; lod 2: trunk and a few stubs.
import { GeoBuilder, rng, rgb, mixRGB, tube, trunkHeights } from './geo.js';

export const SNAG_VARIANTS = [
  { id: 'snag_a', seed: 3101, H: 17, r0: 0.3, kind: 'spruce', branches: 16, top: 0.93, lean: 0.5 },
  { id: 'snag_b', seed: 3202, H: 7.5, r0: 0.34, kind: 'broken', branches: 3, top: 1.0, lean: 0.8 },
  { id: 'snag_c', seed: 3303, H: 11.5, r0: 0.27, kind: 'twisted', branches: 7, top: 0.96, lean: 1.6 },
];

const PAL = {
  grey: rgb('#7a7064'),
  silver: rgb('#9a9183'),
  dark: rgb('#4a423a'),
  raw: rgb('#b9a98c'),
};

export function buildSnag(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const H = v.H;
  const phase0 = r() * 6.28;
  const tw = v.kind === 'twisted' ? 1.0 : 0.35;
  const tx = (y) => Math.sin(y / H * 3.0 + phase0) * 0.35 * tw * (y / H) + v.lean * Math.pow(y / H, 2) * 0.9;
  const tz = (y) => Math.cos(y / H * 2.6 + phase0) * 0.3 * tw * (y / H);
  const sides = [7, 5, 4][lod];
  const nRings = lod === 0 ? 12 : lod === 1 ? 6 : 3;
  const yTop = H * v.top;
  const pts = [];
  for (const y of trunkHeights(nRings, yTop)) pts.push([tx(y), y, tz(y)]);
  const col = (i, t, k) => {
    const c = mixRGB(PAL.grey, PAL.silver, 0.5 + 0.5 * Math.sin(k * 2.1 + i * 1.3));
    const d = mixRGB(c, PAL.dark, Math.max(0, 0.6 - t * 1.5));
    const n = 0.85 + 0.25 * Math.abs(Math.sin(i * 3.1 + k * 1.7 + v.seed));
    return [d[0] * n, d[1] * n, d[2] * n];
  };
  tube(b, pts, (i, t) => (v.r0 * Math.pow(1 - t * 0.85, 0.85) + 0.03) * (1 + 0.6 * Math.exp(-(pts[i][1] + 0.4) / 0.8)), col,
    { sides, rng: r, jitter: lod === 0 ? 0.3 : 0.1, snowFn: (ny, t) => (t < 0.06 ? 0.9 * (1 - t / 0.06) : ny > 0.9 ? 0.5 : 0), flex: (t) => t * 0.2, cap: true, capColor: PAL.raw, capSnow: 1.0 });

  // broken top: splinters sticking up
  if (v.kind === 'broken' || v.kind === 'twisted') {
    const n = lod === 0 ? 4 : 2;
    const top = pts[pts.length - 1];
    const rt = v.r0 * Math.pow(1 - 0.85, 0.85) + 0.03;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28;
      const len = 0.8 + r() * 1.9;
      const o = [top[0] + Math.cos(a) * rt * 0.6, top[1] - 0.1, top[2] + Math.sin(a) * rt * 0.6];
      const e = [o[0] + Math.cos(a) * 0.15, o[1] + len, o[2] + Math.sin(a) * 0.15];
      tube(b, [o, e], (k, t) => (rt * 0.7) * (1 - t) + 0.01, (k, t) => mixRGB(PAL.raw, PAL.grey, t * 0.5), { sides: 3, rng: r, snowFn: (ny) => (ny > 0.7 ? 0.4 : 0), flex: (t) => t * 0.4 });
    }
  }

  // limbs
  const nBr = lod === 0 ? v.branches : lod === 1 ? Math.ceil(v.branches * 0.7) : Math.min(5, v.branches);
  for (let i = 0; i < nBr; i++) {
    const f = (i + r() * 0.7) / nBr;
    const lo = v.kind === 'broken' ? 0.3 : 0.28;
    const y = H * (lo + (v.top - lo - 0.04) * f);
    const th = r() * 6.28 + i * 2.4;
    const base = [tx(y), y, tz(y)];
    let len;
    if (v.kind === 'spruce') len = (0.9 + r() * 2.4) * Math.pow(1 - f * 0.7, 0.8);
    else if (v.kind === 'broken') len = 0.3 + r() * 0.9;
    else len = (1.6 + r() * 2.8) * (1 - f * 0.5);
    const droop = v.kind === 'spruce' ? 0.25 : -0.15;
    const dx = Math.cos(th), dz = Math.sin(th);
    const p1 = [base[0] + dx * len * 0.5, base[1] - droop * len * 0.2 + (v.kind === 'twisted' ? len * 0.25 : 0), base[2] + dz * len * 0.5];
    const p2 = [base[0] + dx * len, base[1] - droop * len + (v.kind === 'twisted' ? len * 0.5 : -0.1 * len), base[2] + dz * len];
    const rad = (0.07 + 0.03 * (1 - f)) * (v.kind === 'broken' ? 1.3 : 1);
    tube(b, [base, p1, p2], (k, t) => rad * (1 - t * 0.85) + 0.008, (k, t) => mixRGB(PAL.grey, PAL.dark, t * 0.4),
      { sides: lod === 0 ? 4 : 3, rng: r, snowFn: (ny) => (ny > 0.4 ? 0.95 : 0), flex: (t) => 0.2 + t * 0.8, phase: r() * 6 });
    if (lod === 0 && len > 1.2 && v.kind !== 'broken') {
      // a couple of side twigs
      for (let s = 0; s < 2; s++) {
        const th2 = th + (s ? 0.7 : -0.7);
        const q0 = [base[0] + dx * len * (0.45 + 0.2 * s), base[1] - droop * len * 0.3, base[2] + dz * len * (0.45 + 0.2 * s)];
        const sl = len * 0.35;
        const q1 = [q0[0] + Math.cos(th2) * sl, q0[1] - sl * 0.2 + (v.kind === 'twisted' ? sl * 0.4 : 0), q0[2] + Math.sin(th2) * sl];
        tube(b, [q0, q1], (k, t) => 0.025 * (1 - t) + 0.005, () => PAL.dark, { sides: 3, rng: r, snowFn: (ny) => (ny > 0.4 ? 0.8 : 0), flex: (t) => 0.5 + t * 0.5 });
      }
    }
  }
  return { geometry: b.toGeometry(), height: H * 1.05, radius: 3.2, trunkR: v.r0 * 1.05 };
}
