// Bottle tree ("the barrel"): a bellied stump of a tree, fat as a cask at the shoulder, wrinkled and
// creased, narrowing to a short neck and a knuckled head from which a fountain of thin red-ochre whips
// rises and arches over. Snow settles on the shoulder and the whips. Owner: vegetation builder.
// Rare, odd (see rare.js). lod 0 about 3.5k triangles, lod 1 about 600, lod 2 about 120.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { sweep, finish, snowMound, sstep, norm3 } from './oddgeo.js';

export const BOTTLE_VARIANTS = [
  { id: 'bottle_a', seed: 9101, H: 4.8, belly: 1.85, bellyY: 1.75, neck: 0.5, whips: 58, whipL: 4.5 },
];

const PAL = {
  dark: rgb('#241c17'),
  mid: rgb('#54443a'),
  light: rgb('#85735f'),
  whipLo: rgb('#401812'),
  whipMid: rgb('#6c2e1f'),
  whipHi: rgb('#96602f'),
  raw: rgb('#b99a74'),
};

export function buildBottle(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const H = v.H;
  const ph = r() * 6.28;
  const sides = [22, 10, 6][lod];
  const stepY = [0.2, 0.5, 1.1][lod];
  // body profile (y, radius), blended with smoothstep between the control points
  const prof = [
    [-0.5, v.belly * 0.66], [0, v.belly * 0.86], [v.bellyY * 0.45, v.belly * 0.99], [v.bellyY, v.belly], [v.bellyY * 1.45, v.belly * 0.9],
    [H * 0.62, v.belly * 0.56], [H * 0.8, v.neck * 1.25], [H * 0.9, v.neck], [H * 0.97, v.neck * 1.6], [H * 1.0, v.neck * 1.7],
  ];
  const radAt = (y) => {
    if (y <= prof[0][0]) return prof[0][1];
    for (let i = 0; i < prof.length - 1; i++) {
      if (y <= prof[i + 1][0]) {
        const t = (y - prof[i][0]) / (prof[i + 1][0] - prof[i][0]);
        const e = t * t * (3 - 2 * t);
        return prof[i][1] + (prof[i + 1][1] - prof[i][1]) * e;
      }
    }
    return prof[prof.length - 1][1];
  };
  const lean = 0.12;
  const ax = (y) => [lean * y + 0.05 * Math.sin(y * 1.3 + ph), y, 0.06 * Math.cos(y * 1.1 + ph)];
  const nRing = Math.max(8, Math.round((H + 0.5) / stepY));
  const pts = [];
  for (let i = 0; i < nRing; i++) pts.push(ax(-0.5 + ((H + 0.5) * i) / (nRing - 1)));
  // three knot holes
  const knots = [[0.9, 1.9, 0.5], [3.9, 2.9, 0.4], [2.2, 1.0, 0.33]].map((k) => ({ a: k[0] + ph, y: v.bellyY * k[1] / 1.9 * 1.0 + 0.2, s: k[2] }));
  const adiff = (a, b2) => Math.atan2(Math.sin(a - b2), Math.cos(a - b2));
  const v0 = b.vcount, t0 = b.tcount;
  sweep(b, pts, sides, {
    radius: (i, t, ang) => {
      const y = pts[i][1];
      let a = radAt(y);
      // lumps, wrinkles and horizontal creases like a gathered sack
      a *= 1 + 0.07 * Math.sin(ang * 3 + y * 1.1 + ph) + 0.05 * Math.sin(ang * 5 - y * 1.9 + ph * 2);
      a *= 1 + 0.025 * Math.sin(y * 9 + 2 * Math.sin(ang * 2 + ph));
      for (const k of knots) {
        const d = Math.hypot(adiff(ang, k.a) * 0.9, (y - k.y) * 0.9) / k.s;
        if (d < 1) a *= 1 - 0.07 * (1 - d * d);
      }
      return a;
    },
    color: (i, t, ang) => {
      const y = pts[i][1];
      const crease = 0.5 + 0.5 * Math.sin(y * 9 + 2 * Math.sin(ang * 2 + ph));
      const grain = 0.5 + 0.5 * Math.sin(ang * 7 + y * 0.8 + ph);
      let c = mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.light, 0.25 + 0.55 * grain), 0.3 + 0.7 * crease);
      for (const k of knots) {
        const d = Math.hypot(adiff(ang, k.a) * 0.9, (y - k.y) * 0.9) / k.s;
        if (d < 1) c = mixRGB(c, [0.02, 0.016, 0.012], 0.9 * (1 - d * d));
      }
      return c;
    },
    flex: (t) => 0.03 * t, uv: true, phase: ph,
  });
  b.tint(v0, (x, y) => 0.55 + 0.45 * sstep(-0.3, 1.5, y));
  finish(b, v0, t0, [0.38, 0.78, 0.95]);

  // the head: a knuckled collar with whips fountaining out of it
  const topY = H * 1.0;
  const head = ax(topY);
  const rh = radAt(topY);
  const nK = lod === 0 ? 9 : lod === 1 ? 6 : 0;
  const knuckles = [];
  for (let k = 0; k < nK; k++) {
    const a = (k / nK) * Math.PI * 2 + r() * 0.5;
    const out = [Math.cos(a), 0, Math.sin(a)];
    const o = [head[0] + out[0] * rh * 0.7, topY - 0.15, head[2] + out[2] * rh * 0.7];
    const e = [o[0] + out[0] * 0.5, o[1] + 0.35, o[2] + out[2] * 0.5];
    const m = [(o[0] + e[0]) / 2, (o[1] + e[1]) / 2 + 0.05, (o[2] + e[2]) / 2];
    sweep(b, [o, m, e], lod === 0 ? 6 : 4, {
      radius: (i2, t) => 0.2 * (1 - 0.35 * t) + 0.04,
      color: (i2, t) => mixRGB(PAL.mid, PAL.raw, 0.1 + 0.5 * t),
      snow: [0.4, 0.8, 0.8], flex: 0.05, uv: true, uvAround: 3,
    });
    knuckles.push({ e, out });
  }
  const nW = lod === 0 ? v.whips : lod === 1 ? Math.round(v.whips * 0.45) : 12;
  for (let q = 0; q < nW; q++) {
    const kn = knuckles.length ? knuckles[q % knuckles.length] : null;
    const a = kn ? Math.atan2(kn.out[2], kn.out[0]) + (r() - 0.5) * 0.9 : (q / nW) * Math.PI * 2;
    const out = [Math.cos(a), 0, Math.sin(a)];
    const s0 = kn ? [kn.e[0] + (r() - 0.5) * 0.12, kn.e[1], kn.e[2] + (r() - 0.5) * 0.12] : [head[0] + out[0] * 0.3, topY + 0.1, head[2] + out[2] * 0.3];
    const L = v.whipL * (0.65 + 0.5 * r());
    const hz = 0.25 + 1.0 * r(); // how far it leans outward
    const d0 = norm3([out[0] * hz, 1.0 + 0.3 * r(), out[2] * hz]);
    const m = lod === 0 ? 7 : lod === 1 ? 4 : 2;
    const wp = [];
    const sw = r() * 6.28;
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      wp.push([
        s0[0] + d0[0] * L * t + out[0] * hz * L * 0.32 * t * t + Math.sin(t * 3 + sw) * 0.06 * t,
        s0[1] + d0[1] * L * t - L * 0.52 * t * t * t,
        s0[2] + d0[2] * L * t + out[2] * hz * L * 0.32 * t * t + Math.cos(t * 2.6 + sw) * 0.06 * t,
      ]);
    }
    const hue = r();
    sweep(b, wp, lod === 0 ? 4 : 3, {
      radius: (i, t) => (lod === 2 ? 0.06 : 0.075) * (1 - 0.75 * t) + 0.012,
      color: (i, t) => mixRGB(mixRGB(PAL.whipLo, PAL.whipMid, 0.3 + 0.7 * hue), PAL.whipHi, sstep(0.35, 1, t) * (0.5 + 0.5 * hue)),
      snow: [0.45, 0.85, 0.7],
      flex: (t) => 0.25 + 0.75 * t, phase: r() * 6.28,
    });
  }
  // snow on the shoulders is in the geometry (normals); a cap on the head and drifts round the foot
  if (lod < 2) {
    snowMound(b, r, [head[0], topY + 0.05, head[2]], rh * 1.0, 0.28, 7, 0.05);
    const nd = lod === 0 ? 6 : 4;
    for (let q = 0; q < nd; q++) {
      const a = (q / nd) * Math.PI * 2 + r();
      snowMound(b, r, [Math.cos(a) * v.belly * 0.95, -0.12, Math.sin(a) * v.belly * 0.95], 0.8 + 0.5 * r(), 0.28, 6, 0);
    }
  }
  return {
    geometry: b.toGeometry(), height: H + v.whipL * 0.8, radius: Math.max(v.belly + 0.6, v.whipL * 0.72), trunkR: v.belly * 0.95,
    windHeight: H + v.whipL * 0.8,
  };
}
