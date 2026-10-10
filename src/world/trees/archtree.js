// Arch tree ("the gate"): two pines that grew toward each other, leaned in over a gateway, crossed and fused
// at the keystone and then carried on up, each into the other one's side, as two crowns. The silhouette is a
// tall wooden gate with an X at its head and a green crown on each shoulder. You walk through it: the span
// between the trunks is wide enough for a cart. Owner: vegetation builder. Rare, odd (see rare.js).
// Local frame: the trunks stand at x = -a and x = +a, the opening runs along Z (yaw turns it onto a road).
// Two parts per LOD: wood (fissured bark) and needle pads. lod 0 about 4k triangles, lod 1 about 700.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { NEEDLE_UV } from './textures.js';
import { sweep, spline, pad, finish, sstep } from './oddgeo.js';
import { barkPart, needlePart } from './oddMaterials.js';

export const ARCH_VARIANTS = [
  { id: 'arch_a', seed: 11101, a: 2.4, H: 14.0, apex: 6.4, c: 2.9 },
];

const PAL = {
  low: rgb('#4e443b'),
  mid: rgb('#63503f'),
  high: rgb('#7f5e46'),
  dark: rgb('#251d17'),
};

export function buildArch(v, lod = 0) {
  const r = rng(v.seed);
  const wood = new GeoBuilder();
  const need = new GeoBuilder();
  need.uvOverride = NEEDLE_UV.solid;
  const a = v.a, H = v.H, apexY = v.apex, cc = v.c;
  const sides = [12, 7, 5][lod];
  const per = [4, 2, 1][lod];
  const v0 = wood.vcount, t0 = wood.tcount;
  const col = (t, dir, side) => {
    const base = mixRGB(PAL.low, PAL.mid, Math.min(1, t * 2));
    const c = mixRGB(base, PAL.high, sstep(0.45, 1, t));
    const lit = 0.4 + 0.6 * sstep(-0.4, 0.8, dir[0] * -side + dir[1] * 0.3);
    return mixRGB(PAL.dark, c, lit);
  };
  // each trunk's centerline: straight up from the roots, a pointed arc in to the keystone, over it
  // (the two cross there, side by side in z, so the wood fuses) and on up into the opposite crown
  const stem = (side) => {
    const ctrl = [[side * a, -0.6, 0], [side * a, 0.8, 0.04 * side], [side * a, 2.0, -0.04 * side]];
    const nA = 7;
    for (let k = 1; k <= nA; k++) {
      const u = k / nA;
      const ang = u * Math.PI * 0.5;
      // a slightly pointed arch: x falls as cos but y rises a little faster at the start
      ctrl.push([side * a * Math.cos(ang) ** 1.15, 2.2 + (apexY - 2.2) * Math.sin(ang) ** 0.9, 0.42 * side * Math.sin(u * Math.PI * 0.5) ** 2]);
    }
    const nU = 6;
    for (let k = 1; k <= nU; k++) {
      const w = k / nU;
      const y = apexY + (H * 0.9 - apexY) * Math.pow(w, 0.95);
      ctrl.push([-side * cc * Math.sin(w * Math.PI * 0.5) ** 0.85, y, 0.42 * side * (1 - w) + 0.15 * Math.sin(w * 5 + side)]);
    }
    return ctrl;
  };
  const stems = [];
  for (const side of [-1, 1]) {
    const ctrl = stem(side);
    const pts = spline(ctrl, per);
    stems.push({ side, pts });
    const nP = pts.length;
    // the parameter of the keystone along the path: the first point at height apexY
    let kA = 0;
    for (let i = 0; i < nP; i++) if (Math.abs(pts[i][0]) < 0.12 && pts[i][1] > apexY - 0.4) { kA = i; break; }
    const tA = kA / (nP - 1);
    sweep(wood, pts, sides, {
      radius: (i, t, ang) => {
        const y = pts[i][1];
        const fl = 1 + 0.7 * Math.exp(-Math.max(0, y) / 0.8);
        const knuckle = 1 + 0.4 * Math.exp(-Math.pow((t - tA) / 0.07, 2));
        const taper = t < tA ? 1 - 0.18 * (t / tA) : 0.82 - 0.52 * ((t - tA) / (1 - tA));
        return (0.58 * taper * fl * knuckle) * (1 + (lod === 0 ? 0.08 * Math.sin(ang * 4 + i * 0.7 + side) : 0));
      },
      color: (i, t, ang, k, dir) => col(t * 0.8 + 0.1, dir, side),
      flex: (t) => 0.02 + 0.25 * Math.max(0, t - tA) / (1 - tA), uv: true, phase: side,
      capEnd: { color: PAL.high, snow: 0.7 },
    });
  }
  // roots: a buttress flare round each foot, heavier on the outer side so the feet read as planted, not as legs
  if (lod < 2) {
    for (const side of [-1, 1]) {
      const nR = lod === 0 ? 7 : 4;
      for (let q = 0; q < nR; q++) {
        const ang = (q / nR) * Math.PI * 2 + (side > 0 ? 0.4 : 1.1);
        const outward = Math.cos(ang) * side;
        const L = 1.5 + r() * 1.6 + 0.8 * Math.max(0, outward);
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          pts.push([side * a + Math.cos(ang) * (0.45 + L * t), 0.95 * Math.pow(1 - t, 1.7) - 0.3 * t, Math.sin(ang) * (0.45 + L * t)]);
        }
        sweep(wood, pts, lod === 0 ? 6 : 4, {
          radius: (i, t) => 0.4 * (1 - 0.75 * t) + 0.05,
          color: (i, t, an, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.3 + 0.4 * sstep(-0.2, 0.9, dir[1])),
          flex: 0, uv: true,
        });
      }
    }
  }
  wood.tint(v0, (x, y) => 0.6 + 0.4 * sstep(-0.3, 1.8, y));
  finish(wood, v0, t0, [0.4, 0.8, 0.95]);

  // pads: a full crown on each carrying stem (centered on its axis) and a few on the shoulders of the arch
  const padSpecs = [];
  const nUp = lod === 2 ? 3 : 6;
  for (const sd of stems) {
    // the stem axis above the keystone: the last 45 percent of the path
    const pts = sd.pts;
    const up = pts.filter((p) => p[1] > apexY + 0.8);
    const at = (f) => up[Math.min(up.length - 1, Math.floor(f * (up.length - 1)))];
    for (let i = 0; i < nUp; i++) {
      const f = i / (nUp - 1);
      const p = at(f);
      const th = i * 2.4 + r() * 2 + (sd.side > 0 ? 0 : 1.3);
      const reach = (1 - 0.5 * f) * (1.8 + r() * 1.4);
      padSpecs.push({ x: p[0] + Math.cos(th) * reach, y: p[1] + 0.3 + r() * 0.5, z: p[2] + Math.sin(th) * reach, R: (3.4 + r() * 1.1) * (1 - 0.32 * f), limb: p });
    }
    const top = pts[pts.length - 1];
    padSpecs.push({ x: top[0], y: top[1] + 0.9, z: top[2], R: 3.1, limb: null });
    // shoulder pads on the arch itself
    padSpecs.push({ x: sd.side * (a + 1.9), y: 4.2 + r() * 0.6, z: (r() - 0.5) * 1.6, R: 3.0 + r() * 0.5, limb: [sd.side * (a - 0.1), 3.8, 0] });
    if (lod < 2) padSpecs.push({ x: sd.side * (a - 0.2), y: apexY - 0.3, z: 1.2 * sd.side, R: 2.4, limb: [sd.side * (a - 1.5), apexY - 1.2, 0.2 * sd.side] });
  }
  for (const p of padSpecs) {
    if (p.limb && lod < 2) {
      const lp = [p.limb, [(p.limb[0] + p.x) * 0.5, (p.limb[1] + p.y) * 0.5 - 0.05, (p.limb[2] + p.z) * 0.5], [p.x, p.y - 0.2, p.z]];
      sweep(wood, spline(lp, lod === 0 ? 2 : 1), lod === 0 ? 5 : 4, {
        radius: (i, t) => 0.15 * (1 - 0.7 * t) + 0.03,
        color: (i, t) => mixRGB(PAL.mid, PAL.dark, 0.3 + 0.4 * t), snow: [0.4, 0.8, 0.8], flex: (t) => 0.2 + 0.5 * t,
      });
    }
    pad(need, r, p.x, p.y, p.z, p.R, lod, r() * 6.28, { snow: 0.45, tex: true, n: lod === 0 ? 7 : 5 });
  }
  return {
    parts: [
      barkPart(wood.toGeometry(), { lichen: 0.1 }),
      needlePart(need.toGeometry(), lod),
    ],
    height: H + 1.6, radius: a + cc + 3.6, trunkR: 0.7, windHeight: H + 2,
    colliders: [{ x: -a, z: 0, r: 0.78 }, { x: a, z: 0, r: 0.78 }],
  };
}
