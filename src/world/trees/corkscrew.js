// Corkscrew pine: a trunk wrung like cloth. Three or four strands of weathered wood twist around each
// other into a rope, spread near the top into limbs and carry a spiral of needle pads; roots swirl out
// into the snow. A wind-bleached dead variant has no needles and a splintered top. Owner: vegetation
// builder. Rare, odd (see rare.js). lod 0 about 3k triangles, lod 1 about 600, lod 2 about 120.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { NEEDLE_UV } from './textures.js';
import { sweep, pad, finish, sstep, dot3 } from './oddgeo.js';

export const CORK_VARIANTS = [
  { id: 'cork_a', seed: 6101, H: 11.5, S: 3, turns: 2.4, rho: 0.5, a0: 0.52, lean: 1.2, dead: false },
  { id: 'cork_b', seed: 6202, H: 8.2, S: 3, turns: 1.8, rho: 0.46, a0: 0.5, lean: -0.8, dead: false },
  { id: 'cork_c', seed: 6303, H: 10.2, S: 4, turns: 2.7, rho: 0.58, a0: 0.4, lean: 0.4, dead: true },
];

const PAL = {
  dark: rgb('#1d1612'),
  mid: rgb('#43362c'),
  light: rgb('#8a8272'),
  warm: rgb('#5e3f2f'),
  bleach: rgb('#a79d8c'),
  raw: rgb('#c9bc9c'),
};

export function buildCork(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  // one part: strands, roots and pads share the needle material (the strand bark is vertex painted)
  b.uvOverride = NEEDLE_UV.solid; // both LODs use the textured needle material
  const H = v.H;
  const ph = r() * 6.28;
  const S = v.S;
  const sides = [9, 5][lod];
  const N = [30, 12][lod];
  const yTop = H * (v.dead ? 0.95 : 0.88);
  const ySplit = H * 0.58;
  const axis = (y) => [v.lean * Math.pow(Math.max(0, y) / H, 1.8), y, 0.35 * Math.sin(y * 0.45 + ph) * (y / H)];
  const rhoAt = (y) => {
    const base = v.rho * (1 + 1.5 * Math.exp(-Math.max(0, y) / 0.8));
    const top = v.dead ? 0 : 2.2 * Math.pow(sstep(ySplit, yTop, y), 1.5);
    return base * (1 + top);
  };
  const phiAt = (j, y) => (j / S) * Math.PI * 2 + v.turns * Math.PI * 2 * (Math.max(0, y) / yTop);
  const radAt = (y) => {
    const u = Math.max(0, y) / yTop;
    let a = v.a0 * (1 - 0.5 * u) * (1 + 0.8 * Math.exp(-Math.max(0, y) / 0.7));
    if (!v.dead) a *= 1 - 0.78 * sstep(ySplit, yTop, y);
    else a *= 1 - 0.55 * sstep(yTop * 0.7, yTop, y);
    return Math.max(0.05, a);
  };
  const strandPos = (j, y) => {
    const a = axis(y), rh = rhoAt(y), ph2 = phiAt(j, y);
    return [a[0] + Math.cos(ph2) * rh, y, a[2] + Math.sin(ph2) * rh];
  };

  const trunkV0 = b.vcount;
  const trunkT0 = b.tcount;
  for (let j = 0; j < S; j++) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = -0.5 + (yTop + 0.5) * (i / (N - 1));
      pts.push(strandPos(j, y));
    }
    const seed = r() * 10;
    sweep(b, pts, sides, {
      radius: (i, t, ang) => {
        const y = pts[i][1];
        const lobe = lod === 0 ? 1 + 0.07 * Math.sin(ang * 3 + y * 2.2 + seed) : 1;
        return radAt(y) * lobe;
      },
      color: (i, t, ang, k, dir) => {
        const y = pts[i][1];
        const ph2 = phiAt(j, y);
        const o = dot3(dir, [Math.cos(ph2), 0, Math.sin(ph2)]);
        const lit = sstep(-0.5, 0.75, o);
        const nz = 0.5 + 0.5 * Math.sin(i * 1.9 + k * 2.3 + seed);
        const body = mixRGB(PAL.mid, v.dead ? PAL.bleach : PAL.light, 0.1 + 0.55 * nz * lit + 0.2 * sstep(0.2, 1, t));
        const c = mixRGB(PAL.dark, body, 0.12 + 0.88 * lit * lit);
        if (v.dead) return mixRGB(c, PAL.bleach, 0.3);
        // a thread of warm red-brown running along one flank of every strand
        return mixRGB(c, PAL.warm, 0.35 * sstep(0.3, 0.9, Math.sin(ang * 1.0 + y * 1.1 + seed)) * lit);
      },
      flex: (t) => t * 0.12,
      phase: j,
      capEnd: v.dead ? { color: PAL.raw, snow: 0.9 } : null,
    });
  }
  // the buried foot: ambient occlusion where the strands meet the snow
  b.tint(trunkV0, (x, y) => 0.5 + 0.5 * sstep(-0.3, 1.8, y));

  // roots swirl out and under the snow
  if (lod < 2) {
    const nRoots = lod === 0 ? S + 3 : S + 1;
    for (let q = 0; q < nRoots; q++) {
      const psi = (q / nRoots) * Math.PI * 2 + r() * 0.5;
      const L = 2.0 + r() * 1.3;
      const pts = [];
      const nr = lod === 0 ? 7 : 4;
      for (let i = 0; i < nr; i++) {
        const t = i / (nr - 1);
        const dd = 0.5 + L * t;
        const aa = psi + 0.9 * t;
        const y = 1.0 * Math.pow(1 - t, 1.6) - 0.35 * t;
        const a0 = axis(0.2);
        pts.push([a0[0] + Math.cos(aa) * dd, y, a0[2] + Math.sin(aa) * dd]);
      }
      const rs = 0.5 + r() * 0.15;
      sweep(b, pts, lod === 0 ? 7 : 4, {
        radius: (i, t) => rs * (1 - 0.72 * t) + 0.07,
        color: (i, t, ang, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.2 + 0.6 * sstep(-0.2, 0.9, dir[1])),
        flex: 0,
      });
    }
  }

  // the dead variant: splintered tops and a few bare stubs (solid wood, so they are smoothed with the strands)
  if (v.dead && lod === 0) {
    for (let j = 0; j < S; j++) {
      const p = strandPos(j, yTop);
      const a = r() * 6.28;
      const e = [p[0] + Math.cos(a) * 0.12, p[1] + 0.5 + r() * 1.1, p[2] + Math.sin(a) * 0.12];
      sweep(b, [p, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2, (p[2] + e[2]) / 2], e], 3, {
        radius: (i, t) => 0.11 * (1 - t) + 0.01, color: (i, t) => mixRGB(PAL.raw, PAL.bleach, t * 0.6), flex: 0.2,
      });
    }
    for (let q = 0; q < 6; q++) {
      const y = H * (0.3 + 0.1 * q);
      const j = q % S;
      const p = strandPos(j, y);
      const ph2 = phiAt(j, y);
      const dir = [Math.cos(ph2 + 0.5), 0.35, Math.sin(ph2 + 0.5)];
      const e = [p[0] + dir[0] * 1.3, p[1] + dir[1] * 1.3, p[2] + dir[2] * 1.3];
      const m = [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2 + 0.1, (p[2] + e[2]) / 2];
      sweep(b, [p, m, e], 4, { radius: (i, t) => 0.1 * (1 - t * 0.8) + 0.015, color: () => PAL.bleach, flex: 0.3 });
    }
  }
  finish(b, trunkV0, trunkT0, [0.35, 0.78, 0.95]);

  // needle pads in a spiral up the top, added after the wood is smoothed so they keep their own normals
  let crownR = rhoAt(yTop) + 1.6;
  if (!v.dead) {
    const padStart = b.vcount;
    const M = 5;
    for (let j = 0; j < S; j++) {
      for (let m = 0; m < M; m++) {
        const f = M > 1 ? m / (M - 1) : 1;
        const y = ySplit * 0.9 + (yTop - ySplit * 0.9) * (0.15 + 0.85 * f);
        const p = strandPos(j, y);
        const ph2 = phiAt(j, y);
        const out = 0.6 + r() * 0.5;
        const R = (2.0 - 0.5 * f) * (0.85 + r() * 0.3) * (H / 11 + 0.35);
        const cx = p[0] + Math.cos(ph2) * out, cz = p[2] + Math.sin(ph2) * out;
        pad(b, r, cx, y + 0.5 + 0.3 * f, cz, R, lod, r() * 6.28, { snow: 0.42, tex: true, n: lod === 0 ? 7 : 5 });
        if (m % 2 === 0) pad(b, r, cx + Math.cos(ph2 + 1.2) * R * 0.8, y + 0.1 + 0.3 * f, cz + Math.sin(ph2 + 1.2) * R * 0.8, R * 0.6, lod, r() * 6.28, { snow: 0.4, tex: true, n: lod === 0 ? 7 : 5 });
      }
    }
    // the crown head: a pad at the very top, leaning with the spiral
    const tp = axis(H * 0.97);
    pad(b, r, tp[0], H * 0.97, tp[2], 1.7 * (H / 11 + 0.35), lod, r() * 6.28, { snow: 0.5, tex: true, n: lod === 0 ? 7 : 5 });
    crownR = rhoAt(yTop) + 2.4;
    b.tint(padStart, (x, y, z) => {
      const a = axis(y);
      const d = Math.hypot(x - a[0], z - a[2]);
      return 0.62 + 0.38 * Math.min(1, d / (rhoAt(yTop) + 1.2));
    });
  }
  return { geometry: b.toGeometry(), height: H * 1.04, radius: crownR + 0.6, trunkR: v.rho * 1.9 };
}
