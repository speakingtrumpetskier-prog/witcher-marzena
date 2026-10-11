// Fallen logs, an uprooted tree with its root plate, and stumps (axe cut near the village for
// firewood, ragged snapped stumps in the forest). Owner: vegetation builder.
// All lie along +X from the origin, so the placer only needs yaw. Snow sits on top via aSnow.
import { GeoBuilder, rng, rgb, mixRGB, tube } from './geo.js';

export const LOG_VARIANTS = [
  { id: 'log_a', seed: 6101, len: 7.5, r0: 0.34, kind: 'log' },
  { id: 'log_b', seed: 6202, len: 6.0, r0: 0.38, kind: 'uprooted' },
];
export const STUMP_VARIANTS = [
  { id: 'stump_a', seed: 7101, r0: 0.3, h: 0.5, kind: 'cut' },
  { id: 'stump_b', seed: 7202, r0: 0.42, h: 0.8, kind: 'snapped' },
];

const PAL = {
  bark: rgb('#4d4033'),
  barkLight: rgb('#6d5b47'),
  moss: rgb('#4e5a3a'),
  wood: rgb('#b99a6d'),
  woodDark: rgb('#8c6d48'),
};

export function buildLog(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const n = lod === 0 ? 9 : 5;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([t * v.len, v.r0 * 0.75 + Math.sin(t * 3 + v.seed) * 0.05, Math.sin(t * 2.2 + v.seed) * 0.12]);
  }
  tube(b, pts, (i, t) => v.r0 * (1 - 0.3 * t) * (1 + 0.1 * Math.sin(i * 2.7)), (i, t, k) => {
    const c = mixRGB(PAL.bark, PAL.barkLight, 0.5 + 0.5 * Math.sin(k * 2.3 + i));
    const m = mixRGB(c, PAL.moss, k % 3 === 0 ? 0.25 : 0);
    return m;
  }, { sides: lod === 0 ? 8 : 6, rng: r, jitter: 0.2, snowFn: (ny) => (ny > 0.25 ? 1.0 : 0), cap: true, capColor: PAL.wood, capSnow: 0 });
  if (v.kind === 'uprooted') {
    // root plate: a fan of thick roots at the x = 0 end, rising up and out
    const nr = lod === 0 ? 9 : 5;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.28 + r() * 0.4;
      const len = 1.0 + r() * 1.2;
      const o = [0.05, v.r0 * 0.8, 0];
      const dir = [-0.55, Math.cos(a) * 0.9, Math.sin(a) * 0.9];
      const dl = Math.hypot(...dir);
      const e = [o[0] + dir[0] / dl * len, o[1] + dir[1] / dl * len + 0.5, o[2] + dir[2] / dl * len];
      const m = [(o[0] + e[0]) / 2, (o[1] + e[1]) / 2 + 0.1, (o[2] + e[2]) / 2];
      tube(b, [o, m, e], (k, t) => 0.12 * (1 - t * 0.85) + 0.02, (k, t) => mixRGB(PAL.barkLight, PAL.woodDark, t * 0.3),
        { sides: 4, rng: r, snowFn: (ny) => (ny > 0.3 ? 0.8 : 0) });
    }
  } else if (lod === 0) {
    // broken branch stubs
    for (let i = 0; i < 3; i++) {
      const t = 0.2 + r() * 0.6;
      const x = t * v.len;
      const a = r() * 6.28;
      const o = [x, v.r0 * 0.9, Math.sin(t * 2.2 + v.seed) * 0.12];
      const e = [x + Math.cos(a) * 0.15, o[1] + 0.35 + r() * 0.3, o[2] + Math.sin(a) * 0.3];
      tube(b, [o, e], (k, tt) => 0.05 * (1 - tt * 0.5), () => PAL.barkLight, { sides: 4, rng: r, snowFn: (ny) => (ny > 0.6 ? 0.6 : 0), cap: true, capColor: PAL.wood, capSnow: 0.8 });
    }
  }
  return { geometry: b.toGeometry(), height: v.r0 * 2 + 1.5, radius: v.len * 0.55, trunkR: 0 };
}

export function buildStump(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const sides = lod === 0 ? 9 : 6;
  const tilt = v.kind === 'cut' ? 0.08 : 0;
  const pts = [[0, -0.25, 0], [0, 0.05, 0], [0, v.h * 0.6, 0], [tilt, v.h, 0]];
  tube(b, pts, (i, t) => v.r0 * (i === 0 ? 1.25 : i === 1 ? 1.12 : 1.0 - 0.05 * t), (i, t, k) => mixRGB(PAL.bark, PAL.barkLight, 0.4 + 0.4 * Math.sin(k * 2 + i * 3)),
    { sides, rng: r, jitter: 0.25, cap: true, capColor: v.kind === 'cut' ? PAL.wood : PAL.woodDark, capSnow: 1.0 });
  if (v.kind === 'snapped') {
    // jagged splinters
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28;
      const o = [Math.cos(a) * v.r0 * 0.5, v.h - 0.05, Math.sin(a) * v.r0 * 0.5];
      const e = [o[0] * 0.8, o[1] + 0.25 + r() * 0.5, o[2] * 0.8];
      tube(b, [o, e], (k, t) => 0.07 * (1 - t) + 0.01, (k, t) => mixRGB(PAL.wood, PAL.woodDark, t), { sides: 3, rng: r, snowFn: (ny) => (ny > 0.7 ? 0.5 : 0) });
    }
  }
  return { geometry: b.toGeometry(), height: v.h + 0.6, radius: v.r0 * 1.3, trunkR: v.r0 * 0.9 };
}
