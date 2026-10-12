// Ice tree: a slender bare tree glazed in clear ice after a freezing rain that never melted. Every limb is
// a dark twig inside a thick translucent sheath, icicles hang from the undersides, and a frozen splash
// of ice wraps the foot. The glaze is a separate part with its own material (oddMaterials.js makeIceMaterial:
// rim light, prismatic fringe, sparkles that shift with the view), so it throws light about on the
// lake shore. Owner: vegetation builder. Rare, odd (see rare.js). No far impostor (the glaze is
// translucent); the last LOD fades out over the long distance instead.
// lod 0 about 5k triangles (wood 2k, ice 3k), lod 1 about 1k, lod 2 about 250.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { sweep, grow, icicle, finish, sstep, norm3 } from './oddgeo.js';
import { barkPart, icePart } from './oddMaterials.js';

export const ICE_VARIANTS = [
  { id: 'ice_a', seed: 12101, H: 11.0, spread: 1.3 },
];

const PAL = {
  dark: rgb('#2a211c'),
  mid: rgb('#4b3d33'),
  ice: rgb('#78b6d8'),
  iceDeep: rgb('#4f86a8'),
  iceHi: rgb('#c6e6f4'),
};

export function buildIce(v, lod = 0) {
  const r = rng(v.seed);
  const wood = new GeoBuilder();
  const ice = new GeoBuilder();
  const w0 = wood.vcount, wt0 = wood.tcount;
  const H = v.H;
  // the skeleton: an ascending tree with graceful side limbs. Each limb also gets its sheath and icicles.
  const iceSides = lod === 0 ? 6 : 4;
  const depthMax = [3, 2, 1][lod];
  const cfg = {
    r, bend: 0.36, up: 0.26, grav: 0.16, taper: 0.3, kidAt: [0.16, 0.95], spread: [0.7, 1.3], kidLen: [0.52, 0.78], kidRad: 0.6, minLen: 0.5,
    segs: () => (lod === 0 ? 5 : 3),
    sides: (rad) => (lod === 0 ? (rad > 0.1 ? 6 : 4) : 3),
    color: (depth, t) => mixRGB(PAL.mid, PAL.dark, Math.min(1, 0.3 * (3 - depth) * 0.5 + t * 0.4)),
    finish: true, uv: true,
    flex: (depth, t) => Math.min(1, 0.04 + (3 - depth) * 0.2 + t * 0.2),
    kids: (depth) => (depth >= 3 ? 7 : depth === 2 ? 3 : 2),
    onLimb: (pts, depth, rad) => {
      // the glaze: a fatter, lumpier sheath over the whole limb
      const taper = 0.3;
      const thick = (0.06 + 0.025 * depth) * (lod === 0 ? 1 : 1.8);
      sweep(ice, pts, iceSides, {
        radius: (i, t, ang) => (rad * (1 - t * (1 - taper)) + thick) * (1 + 0.16 * Math.sin(ang * 3 + i * 1.7 + rad * 40)),
        color: (i, t, ang, k, dir) => mixRGB(PAL.ice, PAL.iceHi, 0.2 + 0.5 * sstep(-0.2, 0.9, dir[1])),
        flex: (t) => Math.min(1, 0.05 + (3 - depth) * 0.2 + t * 0.2), phase: r() * 6,
      });
      // icicles hanging from the undersides
      if (lod < 2 && depth <= 2) {
        for (let k = 2; k < pts.length - 1; k += lod === 0 ? 1 : 2) {
          if (r() < 0.35) continue;
          const p = pts[k];
          const rr = rad * (1 - (k / pts.length) * 0.7) + thick;
          const L = (0.18 + r() * 0.7) * (depth === 2 ? 1.6 : 1);
          icicle(ice, [p[0] + (r() - 0.5) * 0.04, p[1] - rr * 0.8, p[2] + (r() - 0.5) * 0.04], L, 0.018 + 0.03 * r() + rr * 0.1, PAL.ice, PAL.iceHi, 0.5);
        }
      }
    },
    tip: null,
  };
  const topLen = H * 0.95;
  const lean = (r() - 0.5) * 0.2;
  grow(wood, cfg, [0, -0.4, 0], norm3([lean, 1, lean * 0.6]), topLen, 0.22 * v.spread + 0.05, depthMax);
  // a few more low limbs so the crown fills
  for (let q = 0; q < (lod === 2 ? 3 : 6); q++) {
    const y = H * (0.24 + 0.085 * q);
    const az = q * 2.4 + r();
    grow(wood, cfg, [lean * y * 0.1, y, 0], norm3([Math.sin(az) * 0.9, 0.38, Math.cos(az) * 0.9]), H * (0.46 - 0.04 * q) * v.spread, 0.09, Math.max(0, depthMax - 1));
  }
  finish(wood, w0, wt0, [0.4, 0.8, 0.9]);
  // the frozen splash round the foot: a lumpy clear mound and a collar up the trunk
  {
    const n = lod === 0 ? 12 : 7;
    const rings = [];
    for (let q = 0; q < 3; q++) {
      const ring = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const lump = 0.82 + 0.4 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3 * q + v.seed));
        const rr = (1.35 - 0.5 * q) * lump * v.spread;
        const y = -0.1 + q * 0.38 * (1 - 0.15 * q);
        ring.push(ice.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a), 0.4 + 0.3 * q, Math.sin(a), mixRGB(PAL.iceDeep, PAL.iceHi, 0.2 + 0.35 * q), 0, 0, 0, 0, 0));
      }
      rings.push(ring);
    }
    const topc = ice.v(0, 1.25 * v.spread, 0, 0, 1, 0, PAL.iceHi, 0, 0, 0, 0, 0);
    for (let q = 0; q < 2; q++) {
      for (let k = 0; k < n; k++) {
        const kn = (k + 1) % n;
        ice.triFacing(rings[q][k], rings[q][kn], rings[q + 1][kn], Math.cos((k + 0.5) / n * 6.28), 0.5, Math.sin((k + 0.5) / n * 6.28));
        ice.triFacing(rings[q][k], rings[q + 1][kn], rings[q + 1][k], Math.cos((k + 0.5) / n * 6.28), 0.5, Math.sin((k + 0.5) / n * 6.28));
      }
    }
    for (let k = 0; k < n; k++) ice.triFacing(rings[2][k], rings[2][(k + 1) % n], topc, 0, 1, 0);
  }
  return {
    parts: [barkPart(wood.toGeometry(), { lichen: 0 }), icePart(ice.toGeometry())],
    height: H * 1.08, radius: H * 0.52 * v.spread + 1.0, trunkR: 0.34, windHeight: H * 1.2,
  };
}
