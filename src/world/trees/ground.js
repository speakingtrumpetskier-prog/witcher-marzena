// Ground cover: dry grass tufts and seed heads poking through the snow, dried umbel stalks, marsh
// reeds with feathery plumes and cattails. Owner: vegetation builder.
// Blades are tapered strips (double sided) with the snow attribute high at the base so they emerge
// from drifts. Wind type 'grass' bends them and parts them around the player.
import { GeoBuilder, rng, rgb, mixRGB, tube } from './geo.js';

export const GRASS_VARIANTS = [
  { id: 'grass_a', seed: 8101, kind: 'tall', blades: 11, L0: 0.55, L1: 1.0, w: 0.024, bend: 0.4, heads: 2 },
  { id: 'grass_b', seed: 8202, kind: 'short', blades: 14, L0: 0.28, L1: 0.5, w: 0.018, bend: 0.55, heads: 0 },
  { id: 'weed_c', seed: 8303, kind: 'umbel', blades: 5, L0: 0.8, L1: 1.3, w: 0.008, bend: 0.12, heads: 5 },
];
export const REED_VARIANTS = [
  { id: 'reed_a', seed: 9101, kind: 'reed', blades: 18, L0: 2.0, L1: 3.2, w: 0.04, bend: 0.36, plumes: 4 },
  { id: 'reed_b', seed: 9202, kind: 'reed', blades: 12, L0: 1.5, L1: 2.4, w: 0.036, bend: 0.5, plumes: 2 },
  { id: 'cattail', seed: 9303, kind: 'cattail', blades: 5, L0: 1.3, L1: 1.8, w: 0.045, bend: 0.4, plumes: 3 },
];

const PAL = {
  strawDark: rgb('#7d6b45'),
  strawMid: rgb('#b09a64'),
  strawLight: rgb('#d6c58e'),
  grey: rgb('#8a7f6a'),
  reedDark: rgb('#8f7b4e'),
  reedLight: rgb('#e0cf9a'),
  plume: rgb('#9a8878'),
  head: rgb('#4a2d1f'),
  green: rgb('#5d7a3f'),
  umbel: rgb('#7a6248'),
};

// One tapered blade. Rings along the path, tip vertex at the end.
function blade(b, x, z, th, L, w0, bend, c0, c1, opts = {}) {
  const rows = opts.rows || [0, 0.4, 0.75];
  const dx = Math.cos(th), dz = Math.sin(th);
  const sx = -dz, sz = dx;
  const snowBase = opts.snowBase ?? 0.9;
  const ids = [];
  const pos = (s) => {
    const d = bend * s * s * L;
    return [x + dx * d, L * s * (1 - 0.22 * s * s) - d * 0.12, z + dz * d];
  };
  for (let k = 0; k < rows.length; k++) {
    const s = rows[k];
    const p = pos(s);
    const w = w0 * (1 - Math.pow(s, 1.5) * 0.85);
    const col = mixRGB(c0, c1, Math.pow(s, 0.8));
    const sn = snowBase * Math.max(0, 1 - s / 0.4) + (opts.tipSnow ?? 0) * s * s;
    // normal faces outward (the blade plane normal), tilted up a bit
    const nx = dx, nz = dz;
    const l = b.v(p[0] + sx * w, p[1], p[2] + sz * w, nx, 0.3, nz, col, 0, 0, sn, s, opts.phase || 0);
    const r = b.v(p[0] - sx * w, p[1], p[2] - sz * w, nx, 0.3, nz, col, 0, 0, sn, s, opts.phase || 0);
    ids.push([l, r]);
  }
  const tp = pos(1.0);
  const tip = b.v(tp[0], tp[1], tp[2], dx, 0.3, dz, c1, 0, 0, opts.tipSnow ?? 0, 1, opts.phase || 0);
  for (let k = 0; k < ids.length - 1; k++) {
    b.triFacing(ids[k][0], ids[k][1], ids[k + 1][1], dx, 0.2, dz);
    b.triFacing(ids[k][0], ids[k + 1][1], ids[k + 1][0], dx, 0.2, dz);
  }
  const last = ids[ids.length - 1];
  b.triFacing(last[0], last[1], tip, dx, 0.2, dz);
  return tp;
}

// Seed head: a small crossed cluster of thin triangles at point p, pointing up.
function seedHead(b, p, len, w, col, r) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + r() * 0.3;
    const ox = Math.cos(a) * w, oz = Math.sin(a) * w;
    const mid = [p[0], p[1] + len * 0.45, p[2]];
    const l = b.v(p[0] - ox, p[1], p[2] - oz, 0, 0.2, 1, col, 0, 0, 0.1, 1, 0);
    const rr = b.v(p[0] + ox, p[1], p[2] + oz, 0, 0.2, 1, col, 0, 0, 0.1, 1, 0);
    const ml = b.v(mid[0] - ox * 1.3, mid[1], mid[2] - oz * 1.3, 0, 0.2, 1, col, 0, 0, 0.1, 1, 0);
    const mr = b.v(mid[0] + ox * 1.3, mid[1], mid[2] + oz * 1.3, 0, 0.2, 1, col, 0, 0, 0.1, 1, 0);
    const tip = b.v(p[0], p[1] + len, p[2], 0, 1, 0, col, 0, 0, 0.1, 1, 0);
    b.tri(l, rr, mr); b.tri(l, mr, ml); b.tri(ml, mr, tip);
  }
}

export function buildGrass(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const nB = lod === 0 ? v.blades : Math.round(v.blades * 0.6);
  let maxL = 0;
  for (let i = 0; i < nB; i++) {
    const th = r() * 6.28;
    const off = r() * 0.1;
    const L = v.L0 + r() * (v.L1 - v.L0);
    maxL = Math.max(maxL, L);
    const c0 = mixRGB(PAL.strawDark, PAL.strawMid, r());
    const c1 = mixRGB(PAL.strawMid, PAL.strawLight, r());
    if (v.kind === 'umbel') {
      // thin dried stalk with a starburst head
      const tp = blade(b, Math.cos(th) * off, Math.sin(th) * off, th, L, v.w, v.bend, PAL.umbel, mixRGB(PAL.umbel, PAL.grey, 0.4), { rows: [0, 0.5], snowBase: 0.7 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 6.28 + r();
        const sp = 0.07 + r() * 0.05;
        const e = [tp[0] + Math.cos(a) * sp, tp[1] + 0.03 + r() * 0.04, tp[2] + Math.sin(a) * sp];
        const l = b.v(tp[0] - 0.004, tp[1], tp[2], 0, 1, 0, PAL.umbel, 0, 0, 0.2, 1, 0);
        const rr = b.v(tp[0] + 0.004, tp[1], tp[2], 0, 1, 0, PAL.umbel, 0, 0, 0.2, 1, 0);
        const t = b.v(e[0], e[1], e[2], 0, 1, 0, mixRGB(PAL.umbel, PAL.grey, 0.5), 0, 0, 0.25, 1, 0);
        b.tri(l, rr, t);
      }
    } else {
      blade(b, Math.cos(th) * off, Math.sin(th) * off, th, L, v.w * (0.8 + r() * 0.5), v.bend * (0.6 + r() * 0.8), c0, c1, { rows: lod === 0 ? [0, 0.4, 0.75] : [0, 0.6] });
    }
  }
  if (lod === 0) {
    for (let h = 0; h < v.heads; h++) {
      if (v.kind === 'umbel') break;
      const th = r() * 6.28;
      const L = v.L1 * (1.05 + r() * 0.25);
      maxL = Math.max(maxL, L);
      const tp = blade(b, 0, 0, th, L, 0.007, 0.15, PAL.strawDark, PAL.strawMid, { rows: [0, 0.5, 0.85], snowBase: 0.8 });
      seedHead(b, tp, 0.14, 0.012, mixRGB(PAL.strawMid, PAL.strawDark, 0.4), r);
    }
  }
  return { geometry: b.toGeometry(), height: maxL + 0.2, radius: 0.5, trunkR: 0, windHeight: maxL };
}

export function buildReed(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const nB = lod === 0 ? v.blades : Math.round(v.blades * 0.6);
  let maxL = 0;
  const rowsHi = lod === 0 ? [0, 0.25, 0.5, 0.72, 0.88] : [0, 0.4, 0.8];
  if (v.kind === 'cattail') {
    for (let i = 0; i < nB; i++) {
      const th = r() * 6.28;
      const L = v.L0 + r() * (v.L1 - v.L0);
      maxL = Math.max(maxL, L);
      blade(b, Math.cos(th) * 0.08, Math.sin(th) * 0.08, th, L, v.w, 0.5 + r() * 0.3, mixRGB(PAL.reedDark, PAL.green, 0.3), mixRGB(PAL.reedLight, PAL.green, 0.2), { rows: rowsHi, snowBase: 0.6, tipSnow: 0.15 });
    }
    for (let i = 0; i < v.plumes; i++) {
      const th = r() * 6.28;
      const L = 1.4 + r() * 0.5;
      const o = [Math.cos(th) * 0.12, 0, Math.sin(th) * 0.12];
      const lean = (r() - 0.5) * 0.18;
      const e = [o[0] + lean, L, o[2] + (r() - 0.5) * 0.1];
      const m = [(o[0] + e[0]) / 2, L * 0.5, (o[2] + e[2]) / 2];
      tube(b, [o, m, e], () => 0.011, () => PAL.reedDark, { sides: 3, rng: r, snowFn: () => 0 });
      const hl = 0.2;
      const head = [e[0] + lean * 0.3, e[1] + hl, e[2]];
      tube(b, [e, [(e[0] + head[0]) / 2, e[1] + hl * 0.5, e[2]], head], (k, t) => 0.045 * (1 - Math.pow(t * 2 - 1, 4) * 0.5), () => PAL.head,
        { sides: lod === 0 ? 7 : 4, rng: r, snowFn: (ny) => (ny > 0.8 ? 0.4 : 0), cap: true, capColor: PAL.head, capSnow: 0.5 });
      tube(b, [head, [head[0], head[1] + 0.14, head[2]]], (k, t) => 0.008 * (1 - t) + 0.002, () => PAL.reedDark, { sides: 3, rng: r });
      maxL = Math.max(maxL, head[1] + 0.15);
    }
    return { geometry: b.toGeometry(), height: maxL + 0.2, radius: 0.5, trunkR: 0, windHeight: maxL };
  }
  for (let i = 0; i < nB; i++) {
    const th = r() * 6.28;
    const L = v.L0 + r() * (v.L1 - v.L0);
    maxL = Math.max(maxL, L);
    const broken = r() < 0.15;
    const c0 = mixRGB(PAL.reedDark, PAL.strawMid, r() * 0.7);
    const c1 = mixRGB(PAL.strawMid, PAL.reedLight, 0.3 + r() * 0.7);
    blade(b, Math.cos(th) * 0.12, Math.sin(th) * 0.12, th, broken ? L * 0.55 : L, v.w * (0.8 + r() * 0.4), v.bend * (0.6 + r() * 0.9) * (broken ? 1.8 : 1),
      c0, broken ? PAL.grey : c1, { rows: rowsHi, snowBase: 0.8, tipSnow: 0.2 });
  }
  // plumes: tall stalks with feathery heads
  if (lod === 0) {
    for (let i = 0; i < v.plumes; i++) {
      const th = r() * 6.28;
      const L = v.L1 * (0.95 + r() * 0.2);
      maxL = Math.max(maxL, L + 0.4);
      const tp = blade(b, Math.cos(th) * 0.1, Math.sin(th) * 0.1, th, L, 0.012, 0.18, PAL.reedDark, PAL.strawMid, { rows: [0, 0.4, 0.8], snowBase: 0.7 });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 6.28 + r();
        const len = 0.32 + r() * 0.12;
        const e = [tp[0] + Math.cos(a) * 0.1, tp[1] + len * 0.7, tp[2] + Math.sin(a) * 0.1];
        const l = b.v(tp[0] - 0.012, tp[1] - 0.05, tp[2], 0, 1, 0, PAL.plume, 0, 0, 0.15, 1, 0);
        const rr = b.v(tp[0] + 0.012, tp[1] - 0.05, tp[2], 0, 1, 0, PAL.plume, 0, 0, 0.15, 1, 0);
        const t = b.v(e[0], e[1], e[2], 0, 1, 0, mixRGB(PAL.plume, PAL.strawLight, 0.5), 0, 0, 0.25, 1, 0);
        b.tri(l, rr, t);
      }
    }
  }
  return { geometry: b.toGeometry(), height: maxL + 0.3, radius: 0.7, trunkR: 0, windHeight: maxL };
}
