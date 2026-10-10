// Knot tree: a bare grey-black tree whose branches curl into rings and knots, like the red knot of the
// story. The trunk is two strands braided together; above the fork a wooden trefoil knot rides the top,
// two great hoops are linked like chain links, three limbs end in tight curls and small loops, and a red
// thread is wound round one hoop and left hanging in a tail. Owner: vegetation builder.
// Rare, odd (see rare.js). lod 0 about 5k triangles, lod 1 about 1k, lod 2 about 250.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { sweep, spline, finish, sstep, add3, sub3, mul3, norm3, cross3, perp3 } from './oddgeo.js';

export const KNOT_VARIANTS = [
  { id: 'knot_a', seed: 10101, S: 1.0, turns: 1.3 },
];

const PAL = {
  dark: rgb('#1e1814'),
  mid: rgb('#3a302a'),
  ash: rgb('#6f675d'),
  red: rgb('#a3211b'),
};

// points on a circle: center c, in-plane unit vectors e1 and e2, radius rho
function circle(c, e1, e2, rho, n, a0, a1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([c[0] + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * rho, c[1] + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * rho, c[2] + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * rho]);
  }
  return pts;
}

export function buildKnot(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const S = v.S;
  const sides = [8, 5, 3][lod];
  const nC = [40, 18, 10][lod];
  const v0 = b.vcount, t0 = b.tcount;
  const barkCol = (t) => (i, tt, ang, k, dir) => mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.ash, 0.15 + 0.4 * sstep(-0.3, 0.9, dir[1])), 0.35 + 0.45 * t + 0.2 * sstep(-0.2, 0.9, dir[1]));
  const tube = (pts, rad, o = {}) => sweep(b, spline(pts, o.per ?? (lod === 0 ? 3 : 1)), o.sides ?? sides, {
    radius: typeof rad === 'function' ? rad : (i, t) => rad * (1 - (o.taper ?? 0) * t) + 0.012,
    color: o.color || barkCol(o.lite ?? 0.5),
    flex: o.flex ?? ((t) => 0.1 + 0.5 * t), uv: true, phase: r() * 6,
  });

  // trunk: two strands braided, then a fork
  const topY = 3.6 * S;
  const nT = lod === 0 ? 16 : lod === 1 ? 8 : 4;
  for (let j = 0; j < 2; j++) {
    const pts = [];
    for (let i = 0; i < nT; i++) {
      const t = i / (nT - 1);
      const y = -0.4 + (topY + 0.4) * t;
      const ph = j * Math.PI + v.turns * Math.PI * 2 * t;
      const rr = 0.2 * S * (1 + 1.1 * Math.exp(-Math.max(0, y) / 0.7)) * (1 - 0.35 * t);
      pts.push([Math.cos(ph) * rr, y, Math.sin(ph) * rr]);
    }
    sweep(b, pts, sides, {
      radius: (i, t) => (0.3 * S * (1 - 0.4 * t) + 0.05) * (1 + 0.5 * Math.exp(-Math.max(0, pts[i][1]) / 0.6)),
      color: (i, t, ang, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.25 + 0.5 * sstep(-0.3, 0.9, dir[1]) + 0.2 * t),
      flex: 0.03, uv: true, phase: j,
    });
  }
  // roots into the snow
  if (lod < 2) {
    const nR = lod === 0 ? 5 : 3;
    for (let q = 0; q < nR; q++) {
      const a = (q / nR) * Math.PI * 2 + r() * 0.6;
      const L = (2.0 + r() * 1.4) * S;
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        pts.push([Math.cos(a + 0.5 * t) * (0.25 + L * t), 0.5 * S * Math.pow(1 - t, 2.2) - 0.22 * t, Math.sin(a + 0.5 * t) * (0.25 + L * t)]);
      }
      sweep(b, pts, lod === 0 ? 6 : 4, {
        radius: (i, t) => 0.34 * S * (1 - 0.7 * t) + 0.06,
        color: (i, t, ang, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.2 + 0.4 * sstep(-0.2, 0.9, dir[1])),
        flex: 0, uv: true,
      });
    }
  }

  const top = [0, topY, 0];
  // two hoops linked like chain links (a Hopf link). Hoop A faces +x, hoop B is turned 90 degrees and
  // slid along their shared line by one radius, so each passes through the other's disc
  const rho = 1.35 * S;
  const nA = [1, 0.15, 0.2];
  const nAn = norm3(nA);
  const nBn = norm3(cross3(nAn, [0, 1, 0.3]));
  const w = norm3(cross3(nAn, nBn));
  const e1A = perp3(nAn), e2A = cross3(nAn, e1A);
  const e1B = perp3(nBn), e2B = cross3(nBn, e1B);
  const cA = [-2.1 * S, topY + 1.7 * S, 0.4 * S];
  const cB = add3(cA, mul3(w, rho * 1.0));
  // limbs reach each hoop's lowest point
  const lowest = (c, e1, e2) => {
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = [c[0] + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * rho, c[1] + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * rho, c[2] + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * rho];
      if (!best || p[1] < best.p[1]) best = { p, a };
    }
    return best;
  };
  const lA = lowest(cA, e1A, e2A);
  const lB = lowest(cB, e1B, e2B);
  tube([top, [top[0] - 0.9 * S, top[1] + 0.5 * S, top[2] + 0.1], [(top[0] + lA.p[0]) * 0.5 - 0.3, (top[1] + lA.p[1]) * 0.5 + 0.1, (top[2] + lA.p[2]) * 0.5], lA.p], 0.17 * S, { taper: 0.25 });
  tube([top, [top[0] - 0.2, top[1] + 0.6 * S, top[2] + 0.5 * S], [(top[0] + lB.p[0]) * 0.5, (top[1] + lB.p[1]) * 0.5 + 0.2, (top[2] + lB.p[2]) * 0.5 + 0.3], lB.p], 0.15 * S, { taper: 0.25 });
  // each hoop is a full circle (a little more, so the end overlaps the start: it looks tied)
  const hoopTube = (c, e1, e2, a0, rad) => sweep(b, circle(c, e1, e2, rho, nC, a0, a0 + Math.PI * 2.18), sides, {
    radius: (i, t) => rad * (1 + 0.15 * Math.sin(t * 20 + a0)) * (0.8 + 0.2 * Math.min(1, t * 6)),
    color: (i, t, ang, k, dir) => mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.ash, 0.15), 0.25 + 0.4 * sstep(-0.3, 0.9, dir[1])),
    flex: 0.05, uv: true, phase: 3,
  });
  hoopTube(cA, e1A, e2A, lA.a, 0.13 * S);
  hoopTube(cB, e1B, e2B, lB.a, 0.12 * S);

  // the trefoil knot riding the crown
  {
    const s = 0.36 * S;
    const c = [0.6 * S, topY + 2.6 * S, -0.5 * S];
    const nTr = lod === 0 ? 64 : lod === 1 ? 32 : 18;
    const pts = [];
    for (let i = 0; i <= nTr; i++) {
      const t = (i / nTr) * Math.PI * 2;
      pts.push([c[0] + (Math.sin(t) + 2 * Math.sin(2 * t)) * s, c[1] + (Math.cos(t) - 2 * Math.cos(2 * t)) * s * 0.9, c[2] - Math.sin(3 * t) * s * 1.1]);
    }
    sweep(b, pts, sides, {
      radius: () => 0.15 * S,
      color: (i, t, ang, k, dir) => mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.ash, 0.2), 0.3 + 0.4 * sstep(-0.3, 0.9, dir[1])),
      flex: 0.05, uv: true, phase: 9,
    });
    // two props from the trunk fork to its lowest lobes
    let lo = pts[0];
    for (const p of pts) if (p[1] < lo[1]) lo = p;
    tube([top, [top[0] + 0.1, top[1] + 0.8 * S, top[2] - 0.1], [lo[0] - 0.2, lo[1] - 0.4 * S, lo[2] + 0.1], lo], 0.16 * S, { taper: 0.3 });
  }

  // three limbs that end in tight curls and small loops
  if (lod < 2) {
    for (let q = 0; q < 3; q++) {
      const az = 0.9 + q * 2.1 + r() * 0.4;
      const out = [Math.sin(az), 0, Math.cos(az)];
      const p0 = [0, topY - 0.3 * S, 0];
      const p1 = add3(p0, [out[0] * 1.2 * S, 0.9 * S, out[2] * 1.2 * S]);
      const p2 = add3(p0, [out[0] * 2.4 * S, 1.3 * S + q * 0.4, out[2] * 2.4 * S]);
      const e1 = norm3(out);
      // the curl: a spiral of 1.4 turns whose radius first grows then shrinks, drifting along the limb
      const curl = [];
      const nCu = lod === 0 ? 26 : 12;
      const rc = 0.5 * S;
      const base = p2;
      for (let i = 0; i <= nCu; i++) {
        const t = i / nCu;
        const a = Math.PI * 2 * 1.45 * t - Math.PI * 0.5;
        const rr = rc * (0.35 + 0.65 * Math.sin(t * Math.PI));
        curl.push([base[0] + e1[0] * (Math.cos(a) * rr + rc * 0.6 * t), base[1] + Math.sin(a) * rr + rc + 0.1, base[2] + e1[2] * (Math.cos(a) * rr + rc * 0.6 * t)]);
      }
      const all = [p0, p1, p2, ...curl];
      sweep(b, spline(all, lod === 0 ? 2 : 1), lod === 0 ? 6 : 4, {
        radius: (i, t) => 0.13 * S * (1 - 0.75 * t) + 0.02,
        color: (i, t, ang, k, dir) => mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.ash, 0.5), 0.35 + 0.45 * t + 0.2 * sstep(-0.2, 0.9, dir[1])),
        flex: (t) => 0.2 + 0.8 * t, uv: true, phase: q,
      });
    }
  }
  b.tint(v0, (x, y) => 0.6 + 0.4 * sstep(-0.3, 1.8, y));
  finish(b, v0, t0, [0.4, 0.78, 0.95]);
  // the red thread wound round hoop A, and its loose tail
  if (lod < 2) {
    const turns = 15;
    const arc = [];
    const n = lod === 0 ? 70 : 30;
    const a0 = lA.a + 0.7, a1 = a0 + 2.1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = a0 + (a1 - a0) * t;
      const base = [cA[0] + (e1A[0] * Math.cos(a) + e2A[0] * Math.sin(a)) * rho, cA[1] + (e1A[1] * Math.cos(a) + e2A[1] * Math.sin(a)) * rho, cA[2] + (e1A[2] * Math.cos(a) + e2A[2] * Math.sin(a)) * rho];
      const radial = norm3(sub3(base, cA));
      const wph = t * turns * Math.PI * 2;
      const off = add3(mul3(radial, Math.cos(wph) * 0.17 * S), mul3(nAn, Math.sin(wph) * 0.17 * S));
      arc.push(add3(base, off));
    }
    const end = arc[arc.length - 1];
    // a loose tail
    const tail = [end, [end[0] + 0.05, end[1] - 0.5, end[2] + 0.12], [end[0] - 0.1, end[1] - 1.1, end[2] + 0.2], [end[0] + 0.06, end[1] - 1.7, end[2] + 0.1]];
    sweep(b, arc, 4, { radius: () => 0.016 * S + 0.004, color: () => PAL.red, flex: 0.1, phase: 5 });
    sweep(b, spline(tail, 3), 4, { radius: (i, t) => 0.018 * S * (1 - 0.4 * t) + 0.004, color: () => PAL.red, flex: (t) => 0.2 + 0.8 * t, phase: 7 });
  }

  return {
    geometry: b.toGeometry(), height: topY + 5.6 * S, radius: 3.8 * S + 0.5, trunkR: 0.5 * S,
  };
}
