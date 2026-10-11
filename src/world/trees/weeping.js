// Weeping birch: a white trunk with scars, limbs that arch up and over and a skirt of long rimed whips
// that hang all the way to the snow: a dome like a curtain you can walk through (there is a gap on the
// +Z side where the whips stop short, a doorway into the room under the crown). Owner: vegetation
// builder. Rare, odd (see rare.js).
// Two parts per LOD: trunk and limbs (birch bark shader), whips (alpha cards in the odd atlas plus thin
// tubes at lod 0, painted skirt panels at lower LODs). lod 0 about 3k triangles, lod 1 about 400.
// The far impostor is baked from lod 1 (impLod) because thin whips vanish when minified from lod 0.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { ODD_UV, oddAtlas } from './oddAtlas.js';
import { sweep, spline, card, snowMound, norm3 } from './oddgeo.js';

export const WEEP_VARIANTS = [
  { id: 'weep_a', seed: 8101, H: 9.6, crownY: 7.0, R: 3.7, limbs: 12, lean: 0.5 },
];

const PAL = {
  trunk: rgb('#e4e0d4'),
  limbLow: rgb('#b9b3a6'),
  limbHigh: rgb('#5a4a44'),
  straw: rgb('#a8987c'),
  rime: rgb('#e8ece8'),
};

export function buildWeeping(v, lod = 0) {
  const r = rng(v.seed);
  const trunkB = new GeoBuilder();
  const whipB = new GeoBuilder();
  const H = v.H;
  const ph = r() * 6.28;
  const tx = (y) => v.lean * Math.pow(Math.max(0, y) / H, 2) + Math.sin(y * 0.6 + ph) * 0.08 * (y / H);
  const tz = (y) => 0.12 * Math.sin(y * 0.5 + ph * 1.7) * (y / H);
  const trunkTop = v.crownY + 0.6;
  const sides = [8, 5, 3][lod];
  const nRing = [14, 6, 3][lod];
  const pts = [];
  for (let i = 0; i < nRing; i++) {
    const y = -0.4 + (trunkTop + 0.4) * (i / (nRing - 1));
    pts.push([tx(y), y, tz(y)]);
  }
  sweep(trunkB, pts, sides, {
    radius: (i, t) => (0.2 * (1 - 0.55 * t) + 0.04) * (1 + 0.55 * Math.exp(-(pts[i][1] + 0.4) / 0.55)),
    color: (i, t) => mixRGB(PAL.trunk, PAL.limbLow, Math.pow(t, 2.5) * 0.6),
    snow: (dy, i) => (pts[i][1] < 0.0 ? 0.8 : 0),
    flex: (t) => t * 0.2, uv: true, uvAround: 1, phase: ph,
  });

  // limbs arch up and over; hang points are collected along their outer halves
  const hangs = [];
  const nL = lod === 2 ? 4 : v.limbs;
  const limbSplines = [];
  for (let i = 0; i < nL; i++) {
    const az = (i / nL) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const out = [Math.sin(az), 0, Math.cos(az)];
    const ys = v.crownY - 1.4 + r() * 1.5;
    const p0 = [tx(ys), ys, tz(ys)];
    const R = v.R * (i % 2 ? 0.62 + 0.2 * r() : 0.9 + 0.2 * r());
    const ctrl = [
      p0,
      [p0[0] + out[0] * 0.9, p0[1] + 0.9, p0[2] + out[2] * 0.9],
      [p0[0] + out[0] * R * 0.5, p0[1] + 1.55 + r() * 0.4, p0[2] + out[2] * R * 0.5],
      [p0[0] + out[0] * R * 0.85, p0[1] + 1.05, p0[2] + out[2] * R * 0.85],
      [p0[0] + out[0] * R * 1.05, p0[1] + 0.1, p0[2] + out[2] * R * 1.05],
    ];
    const sp = spline(ctrl, lod === 0 ? 4 : 2);
    limbSplines.push(sp);
    sweep(trunkB, sp, lod === 0 ? 4 : 3, {
      radius: (k, t) => (i % 2 ? 0.05 : 0.085) * (1 - t * 0.7) + 0.012,
      color: (k, t) => mixRGB(PAL.limbLow, PAL.limbHigh, 0.25 + t * 0.55),
      snow: [0.35, 0.8, 0.85], flex: (t) => 0.3 + 0.5 * t, uv: true, uvAround: 1, phase: i,
    });
    // hang points on the outer part of the arch
    for (let k = Math.floor(sp.length * 0.35); k < sp.length; k++) {
      if ((k + i) % (lod === 0 ? 1 : 2) !== 0) continue;
      hangs.push({ p: sp[k], out, i, k, n: sp.length });
    }
  }
  // snow laid over the crest of the crown
  if (lod < 2) {
    snowMound(trunkB, r, [tx(trunkTop), trunkTop - 0.15, tz(trunkTop)], 1.1, 0.4, 8, 0.1);
  }

  // the skirt
  const ground = -0.3;
  const doorAz = 0; // +Z
  const inGap = (p) => {
    const a = Math.atan2(p[0] - tx(0), p[2]);
    return Math.abs(Math.atan2(Math.sin(a - doorAz), Math.cos(a - doorAz))) < 0.5 && Math.hypot(p[0] - tx(0), p[2]) > 0.5;
  };
  if (lod <= 1) {
    whipB.uvOverride = ODD_UV.solid;
    const ball = [0, v.crownY * 0.6, 0];
    for (const h of hangs) {
      const gap = inGap(h.p);
      const len = Math.max(0.6, h.p[1] - ground - (gap ? 2.9 : 0) - r() * (h.k % 3 === 0 ? 0.9 : 0.25));
      const up = norm3([h.out[0] * 0.07, -1, h.out[2] * 0.07]);
      const right = norm3([-h.out[2], 0, h.out[0]]);
      const w = (0.9 + r() * 0.5) * (lod === 1 ? 1.7 : 1);
      const tint = [0.92 + r() * 0.16, 0.9 + r() * 0.16, 0.84 + r() * 0.16];
      card(whipB, h.p, up, right, w, len, ODD_UV.curtain, tint, 0.9, r() * 6.28, ball, 0.55, 0.12);
      if (h.k % 2 === 0) {
        const o2 = [h.p[0] - h.out[0] * 0.18, h.p[1], h.p[2] - h.out[2] * 0.18];
        const r2 = norm3([-h.out[2] * 0.8 + h.out[0] * 0.5, 0, h.out[0] * 0.8 + h.out[2] * 0.5]);
        card(whipB, o2, up, r2, w * 0.9, len * 0.92, ODD_UV.curtain, tint, 0.9, r() * 6.28, ball, 0.4, 0.1);
      }
      // a few single whips as real tubes: they catch the light and give the skirt depth
      if (lod === 0 && h.k % 3 === 1) {
        const m = 8;
        const wp = [];
        const sway = r() * 6.28;
        for (let q = 0; q <= m; q++) {
          const t = q / m;
          wp.push([h.p[0] + h.out[0] * 0.2 * t * len * 0.3 + Math.sin(t * 3 + sway) * 0.07 * t, h.p[1] - len * t, h.p[2] + h.out[2] * 0.2 * t * len * 0.3 + Math.cos(t * 2.4 + sway) * 0.07 * t]);
        }
        sweep(whipB, wp, 3, {
          radius: (q, t) => 0.026 * (1 - t * 0.5) + 0.006,
          color: (q, t) => mixRGB(PAL.straw, PAL.rime, 0.1 + 0.35 * t),
          snow: [0.5, 0.9, 0.5], flex: (t) => 0.2 + 0.8 * t, phase: r() * 6, uv: false,
        });
      }
    }
    whipB.uvOverride = null;
  } else {
    // a hemispherical veil of textured panels: columns around, rows down the dome, ragged hem, gap on the door side
    const N = lod === 1 ? 18 : 10;
    const nr = lod === 1 ? 5 : 3;
    const crown = [tx(trunkTop), tz(trunkTop)];
    const rect = ODD_UV.haze;
    const grid = [];
    for (let q = 0; q < nr; q++) {
      const t = q / (nr - 1);
      const th = t * Math.PI * 0.5;
      const ring = [];
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const az = [Math.sin(a), 0, Math.cos(a)];
        const gap = Math.abs(Math.atan2(Math.sin(a - doorAz), Math.cos(a - doorAz))) < 0.34;
        const wob = 0.92 + 0.16 * Math.sin(a * 3 + ph);
        const rr = v.R * (0.12 + 0.92 * Math.sin(th)) * wob;
        const yTop = v.crownY + 0.35;
        let y = (yTop - ground) * Math.cos(th * 0.98) + ground;
        if (q === nr - 1) y = gap ? 2.7 : ground + 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(a * 5 + ph * 2)) * (j % 2);
        const u = (j / N) * (lod === 1 ? 5 : 3);
        grid.push(whipB.v(crown[0] * (1 - Math.sin(th)) + az[0] * rr, y, crown[1] * (1 - Math.sin(th)) + az[2] * rr, az[0], 0.3 + 0.6 * (1 - t), az[2], [0.95, 0.93, 0.88],
          rect.u0 + (u % 1) * (rect.u1 - rect.u0), rect.v1 - t * (rect.v1 - rect.v0), q === 0 ? 0.9 : q === 1 ? 0.25 : 0, 0.4 + 0.5 * t, j));
        ring.push(grid.length - 1);
      }
      void ring;
    }
    for (let q = 0; q < nr - 1; q++) {
      for (let j = 0; j < N; j++) {
        const a = q * (N + 1) + j, b2 = a + 1, c = (q + 1) * (N + 1) + j + 1, d = (q + 1) * (N + 1) + j;
        whipB.tri(grid[a], grid[d], grid[c]);
        whipB.tri(grid[a], grid[c], grid[b2]);
      }
    }
  }
  return {
    parts: [
      { geometry: trunkB.toGeometry(), mode: 'birch' },
      lod <= 1
        ? { geometry: whipB.toGeometry(), mode: 'needles', tex: 'needle', map: oddAtlas(), noShadow: true }
        : { geometry: whipB.toGeometry(), mode: 'cards', card: true, haze: true, map: oddAtlas(), noShadow: true },
    ],
    height: H * 1.04, radius: v.R * 1.15 + 0.6, trunkR: 0.32,
  };
}
