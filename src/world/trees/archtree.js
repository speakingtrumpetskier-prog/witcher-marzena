// Arch tree: two pines that grew toward each other and fused overhead into a gateway, a stooped crown on
// top of the fused knuckle and a few pads hanging off the shoulders of the arch. You walk through it:
// the span between the trunks is wide enough for a cart. Owner: vegetation builder. Rare, odd (see rare.js).
// Local frame: the trunks stand at x = -a and x = +a, the opening runs along Z (yaw turns it onto a road).
// Two parts per LOD: wood (fissured bark) and needle pads. lod 0 about 3k triangles, lod 1 about 500.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { NEEDLE_UV } from './textures.js';
import { sweep, spline, pad, finish, sstep } from './oddgeo.js';
import { barkPart, needlePart } from './oddMaterials.js';

export const ARCH_VARIANTS = [
  { id: 'arch_a', seed: 11101, a: 2.3, H: 12.4 },
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
  const a = v.a;
  const sides = [12, 7, 5][lod];
  const per = [4, 2, 1][lod];
  const v0 = wood.vcount, t0 = wood.tcount;
  const apexY = 5.7;
  const col = (t, dir, side) => {
    const base = mixRGB(PAL.low, PAL.mid, Math.min(1, t * 2));
    const c = mixRGB(base, PAL.high, sstep(0.45, 1, t));
    const lit = 0.4 + 0.6 * sstep(-0.4, 0.8, dir[0] * -side + dir[1] * 0.3);
    return mixRGB(PAL.dark, c, lit);
  };
  for (const side of [-1, 1]) {
    // straight up from the roots for 2.4 m, then an elliptical arc over to the keystone
    const ctrl = [[side * a, -0.6, 0], [side * a, 0.8, 0.04 * side], [side * a, 2.2, -0.05]];
    for (let k = 1; k <= 7; k++) {
      const phi = (k / 7) * Math.PI * 0.5;
      ctrl.push([side * a * Math.cos(phi), 2.6 + (apexY - 2.6) * Math.sin(phi), 0.12 * Math.sin(phi * 3) * side]);
    }
    const pts = spline(ctrl, per);
    sweep(wood, pts, sides, {
      radius: (i, t, ang) => {
        const y = pts[i][1];
        const fl = 1 + 0.7 * Math.exp(-Math.max(0, y) / 0.8);
        const knuckle = 1 + 0.5 * sstep(0.8, 1, t);
        return (0.58 * (1 - 0.2 * t) * fl * knuckle) * (1 + (lod === 0 ? 0.08 * Math.sin(ang * 4 + i * 0.7 + side) : 0));
      },
      color: (i, t, ang, k, dir) => col(t * 0.6 + 0.1, dir, side),
      flex: (t) => 0.02 * t, uv: true, phase: side,
    });
  }
  // the fused trunk above the keystone
  const top = [];
  const nTop = [10, 5, 3][lod];
  for (let i = 0; i < nTop; i++) {
    const t = i / (nTop - 1);
    top.push([0.5 * Math.sin(t * 2.2) * 0.4, apexY - 0.1 + (v.H - apexY) * t, 0.2 * Math.sin(t * 3)]);
  }
  sweep(wood, top, sides, {
    radius: (i, t) => 1.0 * (1 - 0.68 * t) + 0.1,
    color: (i, t, ang, k, dir) => col(0.45 + 0.5 * t, dir, 1),
    flex: (t) => 0.04 + 0.2 * t, uv: true, phase: 3,
  });
  // roots
  if (lod < 2) {
    for (const side of [-1, 1]) {
      const nR = lod === 0 ? 4 : 2;
      for (let q = 0; q < nR; q++) {
        const ang = (q / nR) * Math.PI * 2 + (side > 0 ? 0.4 : 1.1);
        const L = 1.6 + r() * 1.3;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          pts.push([side * a + Math.cos(ang) * (0.45 + L * t), 0.7 * Math.pow(1 - t, 1.7) - 0.3 * t, Math.sin(ang) * (0.45 + L * t)]);
        }
        sweep(wood, pts, lod === 0 ? 6 : 4, {
          radius: (i, t) => 0.36 * (1 - 0.75 * t) + 0.05,
          color: (i, t, an, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.3 + 0.4 * sstep(-0.2, 0.9, dir[1])),
          flex: 0, uv: true,
        });
      }
    }
  }
  wood.tint(v0, (x, y) => 0.6 + 0.4 * sstep(-0.3, 1.8, y));
  finish(wood, v0, t0, [0.4, 0.8, 0.95]);

  // branches and pads: a flat stooped crown on the fused trunk, pads off the shoulders
  const padSpecs = [];
  const nUp = lod === 2 ? 4 : 7;
  for (let i = 0; i < nUp; i++) {
    const f = i / (nUp - 1);
    const y = apexY + 1.4 + (v.H - apexY - 1.4) * f;
    const th = i * 2.4 + r();
    const reach = (1 - 0.55 * f) * (2.4 + r() * 1.5);
    padSpecs.push({ x: Math.cos(th) * reach, y: y + 0.4 + r() * 0.5, z: Math.sin(th) * reach, R: (3.2 + r() * 1.0) * (1 - 0.3 * f), limb: [0, y, 0] });
  }
  padSpecs.push({ x: 0.1, y: v.H + 0.6, z: 0, R: 3.0, limb: null });
  for (const side of [-1, 1]) {
    padSpecs.push({ x: side * (a + 1.7), y: 4.6 + r() * 0.6, z: (r() - 0.5) * 1.6, R: 3.0 + r() * 0.4, limb: [side * (a - 0.1), 4.1, 0] });
    if (lod < 2) padSpecs.push({ x: side * (a - 0.4), y: 7.2 + r() * 0.5, z: 1.0 * side, R: 2.5, limb: [side * (a - 1.5), 5.5, 0] });
  }
  for (const p of padSpecs) {
    if (p.limb && lod < 2) {
      const lp = [p.limb, [(p.limb[0] + p.x) * 0.5, (p.limb[1] + p.y) * 0.5 - 0.05, (p.limb[2] + p.z) * 0.5], [p.x, p.y - 0.2, p.z]];
      sweep(wood, spline(lp, lod === 0 ? 2 : 1), lod === 0 ? 5 : 4, {
        radius: (i, t) => 0.14 * (1 - 0.7 * t) + 0.03,
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
    height: v.H + 1.6, radius: a + 3.4, trunkR: 0.7, windHeight: v.H + 2,
    colliders: [{ x: -a, z: 0, r: 0.78 }, { x: a, z: 0, r: 0.78 }],
  };
}
