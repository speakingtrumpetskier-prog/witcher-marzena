// Understory: juniper (blue-green spiky fountains, spreading or upright) and snow-buried bushes
// (a lumpy snow mound with dark twigs poking out; the mound turns into plain brush when the snow melts).
// Owner: vegetation builder.
import { GeoBuilder, rng, rgb, mixRGB, tube, frond, softBall } from './geo.js';

export const JUNIPER_VARIANTS = [
  { id: 'juniper_a', seed: 4101, n: 30, L: 1.25, rise: 0.4, W: 0.17, H: 0.9, upright: false },
  { id: 'juniper_b', seed: 4202, n: 28, L: 1.2, rise: 1.2, W: 0.15, H: 1.5, upright: true },
];
export const SNOWBUSH_VARIANTS = [
  { id: 'snowbush_a', seed: 5101, R: 1.25, h: 0.7, twigs: 22 },
  { id: 'snowbush_b', seed: 5202, R: 0.85, h: 0.55, twigs: 16 },
];

const PAL = {
  dark: rgb('#26443d'),
  light: rgb('#4f7c6c'),
  frost: rgb('#7da694'),
  twig: rgb('#6a3a2c'),
  twigDark: rgb('#3b2a26'),
  mound: rgb('#4a3c30'),
  leaf: rgb('#7a5a33'),
};

export function buildJuniper(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const n = lod === 0 ? v.n : Math.round(v.n * 0.55);
  const v0 = b.vcount, t0 = b.tcount;
  // dark core so the fountain is not hollow
  const core = b.v(0, v.H * 0.5, 0, 0, 1, 0, [PAL.dark[0] * 0.6, PAL.dark[1] * 0.6, PAL.dark[2] * 0.6], 0, 0, 0.3, 0, 0);
  const cids = [];
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * 6.28 + r();
    cids.push(b.v(Math.cos(a) * v.L * 0.5, 0.05, Math.sin(a) * v.L * 0.5, Math.cos(a), 0.3, Math.sin(a), [PAL.dark[0] * 0.7, PAL.dark[1] * 0.7, PAL.dark[2] * 0.7], 0, 0, 0.45, 0.2, 0));
  }
  for (let j = 0; j < 7; j++) b.triFacing(core, cids[j], cids[(j + 1) % 7], 0, 1, 0);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 6.28 + r() * 0.5;
    const L = v.L * (0.6 + r() * 0.5);
    const rise = v.rise * (0.6 + r() * 0.8);
    frond(b, { x: 0, y: 0.05, z: 0 }, th, L, L * v.W, L * 0.28, rise, {
      rng: r, sRows: lod === 0 ? [0, 0.3, 0.6, 0.85, 1] : [0, 0.55, 1], col: [PAL.dark, mixRGB(PAL.light, PAL.frost, r() * 0.5)],
      shade: 0.9 + r() * 0.25, snow: 0.8, sag: 0.3, jag: 0.3, r0: 0.05, phase: r() * 6.28,
    });
  }
  b.smooth(v0, t0, softBall(0, v.H * 0.4, 0, 0.5, 0.3));
  b.tint(v0, (x, y, z) => 0.55 + 0.45 * Math.min(1, Math.hypot(x, z) / (v.L * 0.6)));
  return { geometry: b.toGeometry(), height: v.H + 0.4, radius: v.L + 0.4, trunkR: 0 };
}

export function buildSnowBush(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const rings = lod === 0 ? 4 : 3;
  const sec = lod === 0 ? 11 : 8;
  const v0 = b.vcount, t0 = b.tcount;
  // lumpy mound: rings from the base up to the crown
  const idx = [];
  const lump = [];
  for (let j = 0; j < sec; j++) lump.push(0.8 + r() * 0.45);
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    const ang = f * Math.PI * 0.5;
    const ring = [];
    for (let j = 0; j < sec; j++) {
      const a = (j / sec) * 6.28;
      const rr = v.R * Math.cos(ang) * lump[j] * (i === 0 ? 1.05 : 1);
      const y = -0.1 + v.h * Math.sin(ang) * (0.85 + 0.3 * lump[(j + 3) % sec]);
      const nx = Math.cos(a) * Math.cos(ang), ny = Math.sin(ang), nz = Math.sin(a) * Math.cos(ang);
      ring.push(b.v(Math.cos(a) * rr, y, Math.sin(a) * rr, nx, ny + 0.2, nz, mixRGB(PAL.mound, PAL.leaf, r() * 0.6), 0, 0, i === 0 ? 0.5 : 1.0, 0.3, 0));
    }
    idx.push(ring);
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sec; j++) {
      const k = (j + 1) % sec;
      b.triFacing(idx[i][j], idx[i][k], idx[i + 1][k], 0, 1, 0);
      b.triFacing(idx[i][j], idx[i + 1][k], idx[i + 1][j], 0, 1, 0);
    }
  }
  const top = b.v(0, v.h * 1.0, 0, 0, 1, 0, PAL.mound, 0, 0, 1, 0.3, 0);
  for (let j = 0; j < sec; j++) b.triFacing(top, idx[rings][j], idx[rings][(j + 1) % sec], 0, 1, 0);
  b.smooth(v0, t0, (x, y, z, n) => { n[1] += 0.25; });
  // twigs poking out
  const nt = lod === 0 ? v.twigs : Math.round(v.twigs * 0.5);
  for (let i = 0; i < nt; i++) {
    const a = r() * 6.28;
    const rr = v.R * (0.1 + 0.8 * Math.sqrt(r()));
    const hy = v.h * Math.max(0.1, 1 - (rr / v.R) ** 2) * 0.9;
    const o = [Math.cos(a) * rr, hy, Math.sin(a) * rr];
    const len = 0.35 + r() * 0.75;
    const ea = a + (r() - 0.5) * 1.2;
    const e = [o[0] + Math.cos(ea) * len * 0.5, o[1] + len * (0.6 + r() * 0.5), o[2] + Math.sin(ea) * len * 0.5];
    const mid = [(o[0] + e[0]) / 2 + (r() - 0.5) * 0.1, (o[1] + e[1]) / 2, (o[2] + e[2]) / 2 + (r() - 0.5) * 0.1];
    tube(b, [o, mid, e], (k, t) => 0.016 * (1 - t * 0.8) + 0.004, (k, t) => mixRGB(PAL.twig, PAL.twigDark, t * 0.5 + r() * 0.3),
      { sides: 3, rng: r, snowFn: (ny) => (ny > 0.55 ? 0.6 : 0), flex: (t) => t });
  }
  return { geometry: b.toGeometry(), height: v.h + 1.2, radius: v.R * 1.2, trunkR: 0 };
}
