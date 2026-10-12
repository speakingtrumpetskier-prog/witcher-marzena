// Rowan (mountain ash): a small crooked tree with a loose vase of grey limbs, fine twig sprays, and
// clusters of red berries that outlast the leaves, each with a little cap of snow on top. The one
// splash of red in the winter woods, together with the red ribbons. Owner: vegetation builder.
// Common (see placement.js: forest edges, clearings, shores, the village outskirts).
// One part per LOD. lod 0 about 4k triangles, lod 1 about 700, lod 2 about 120.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { ODD_UV } from './oddAtlas.js';
import { grow, card, berry, snowMound, finish, sstep, norm3, cross3, perp3 } from './oddgeo.js';

export const ROWAN_VARIANTS = [
  { id: 'rowan_a', seed: 14101, H: 7.6, stems: 2, spread: 1.0 },
];

const PAL = {
  dark: rgb('#3d3731'),
  mid: rgb('#5a534a'),
  light: rgb('#857d71'),
  red: rgb('#b3261e'),
  redDark: rgb('#7d1912'),
};

export function buildRowan(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  if (lod === 0) b.uvOverride = ODD_UV.solid;
  const H = v.H;
  const ball = [0, H * 0.7, 0];
  const v0 = b.vcount, t0 = b.tcount;
  const depthMax = [3, 2, 1][lod];
  const cfg = {
    r, bend: 0.85, up: 0.18, grav: 0.14, taper: 0.28, kidAt: [0.22, 0.92], spread: [0.55, 1.2], kidLen: [0.5, 0.8], kidRad: 0.66, minLen: 0.3,
    segs: () => (lod === 0 ? 4 : 3),
    sides: (rad) => (lod === 0 ? (rad > 0.07 ? 6 : 4) : 3),
    color: (depth, t) => mixRGB(mixRGB(PAL.mid, PAL.light, 0.25), PAL.dark, Math.min(1, 0.2 * (3 - depth) + t * 0.3)),
    finish: true,
    flex: (depth, t) => Math.min(1, 0.08 + (3 - depth) * 0.22 + t * 0.2),
    kids: (depth) => (depth >= 3 ? 4 : 3),
    tip: (p, d, rad, depth) => tips.push({ p, d, depth }),
  };
  const tips = [];
  const decorate = ({ p, d, depth }) => {
    {
      if (depth > 1) return;
      if (lod === 0) {
        const up = norm3([d[0], d[1] * 0.6 + 0.4, d[2]]);
        const right = norm3(cross3(up, perp3(up)));
        const w = 0.8 + r() * 0.4;
        card(b, [p[0] - up[0] * 0.25, p[1] - up[1] * 0.25, p[2] - up[2] * 0.25], up, right, w, w * 1.1, ODD_UV.twig, [0.7 + r() * 0.12, 0.66 + r() * 0.1, 0.62 + r() * 0.1], 1, r() * 6, ball, 0);
        const right2 = norm3(cross3(up, right));
        card(b, [p[0] - up[0] * 0.25, p[1] - up[1] * 0.25, p[2] - up[2] * 0.25], up, right2, w * 0.8, w, ODD_UV.twig, [0.7, 0.66, 0.62], 1, r() * 6, ball, 0);
      }
      // a berry cluster hanging under the tip, with a snow cap above it
      if (r() < (depth === 0 ? 0.5 : 0.25)) {
        const c = [p[0] + (r() - 0.5) * 0.1, p[1] - 0.14 - r() * 0.08, p[2] + (r() - 0.5) * 0.1];
        if (lod === 0) {
          const n = 7;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + r();
            const rr = 0.07 * Math.sqrt(r());
            berry(b, [c[0] + Math.cos(a) * rr, c[1] - 0.05 * r() - (i % 3) * 0.035, c[2] + Math.sin(a) * rr], 0.038 + 0.014 * r(), mixRGB(PAL.red, PAL.redDark, r() * 0.5));
          }
          snowMound(b, r, [p[0], p[1] + 0.02, p[2]], 0.15 + 0.07 * r(), 0.09, 5, 0.3);
        } else if (lod === 1) {
          berry(b, c, 0.13, PAL.red);
        } else {
          berry(b, c, 0.2, PAL.red);
        }
      }
    }
  };
  for (let s = 0; s < v.stems; s++) {
    const az = (s / v.stems) * Math.PI * 2 + r() * 0.8;
    const lean = 0.22 + r() * 0.3;
    const L = H * (0.82 + 0.25 * r());
    grow(b, cfg, [Math.cos(az) * 0.12, -0.3, Math.sin(az) * 0.12], norm3([Math.cos(az) * lean, 1, Math.sin(az) * lean]), L, (0.15 + 0.03 * r()) * (v.stems > 2 ? 0.8 : 1), depthMax);
  }
  finish(b, v0, t0, [0.38, 0.8, 0.95]);
  // snow in the foot
  for (let k = v0; k < b.vcount; k++) if (b.p[k * 3 + 1] < 0.2) b.s[k] = Math.max(b.s[k], 0.9);
  b.tint(v0, (x, y) => (lod === 0 ? 1 : 0.9) * (0.55 + 0.45 * sstep(-0.2, 1.4, y)));
  // twig sprays and berries go on after the limbs are smoothed (they keep their own normals)
  for (const t of tips) decorate(t);
  return { geometry: b.toGeometry(), height: H * 1.12, radius: H * 0.38 * v.spread + 0.8, trunkR: 0.2 + 0.05 * v.stems };
}
