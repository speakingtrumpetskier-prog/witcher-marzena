// Krummholz: dwarf mountain pine, a creeping thicket of wind-bent stems no higher than a man's chest,
// each ending in a dark needle pad, half buried under its own mound of snow. It takes over where the
// forest gives out near the treeline and on exposed ridges. Owner: vegetation builder.
// Understory group ('bush', two LODs, no impostor). lod 0 about 1k triangles, lod 1 about 150.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { NEEDLE_UV } from './textures.js';
import { sweep, spline, pad, snowMound, finish } from './oddgeo.js';

export const KRUMMHOLZ_VARIANTS = [
  { id: 'krummholz_a', seed: 16101, stems: 6, L: 2.3, H: 1.1 },
];

const PAL = {
  stem: rgb('#5c4636'),
  stemDark: rgb('#2f241c'),
};

export function buildKrummholz(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  b.uvOverride = NEEDLE_UV.solid;
  const windAz = 0.4; // the stems lean downwind, a little
  const v0 = b.vcount, t0 = b.tcount;
  const stems = [];
  for (let s = 0; s < v.stems; s++) {
    const az = (s / v.stems) * Math.PI * 2 + r() * 0.7;
    const bias = 0.35 * Math.cos(az - windAz);
    const L = v.L * (0.6 + 0.5 * r()) * (1 + bias);
    const rise = v.H * (0.5 + 0.5 * r());
    const out = [Math.cos(az), 0, Math.sin(az)];
    const side = [-out[2], 0, out[0]];
    const kink = (r() - 0.5) * 0.5;
    const ctrl = [[0, -0.15, 0], [out[0] * L * 0.15, rise * 0.45, out[2] * L * 0.15], [out[0] * L * 0.5 + side[0] * kink, rise, out[2] * L * 0.5 + side[2] * kink], [out[0] * L, rise * 0.75 + 0.1, out[2] * L]];
    const pts = spline(ctrl, lod === 0 ? 3 : 1);
    stems.push(pts);
    sweep(b, pts, lod === 0 ? 5 : 3, {
      radius: (i, t) => 0.085 * (1 - 0.65 * t) + 0.02,
      color: (i, t) => mixRGB(PAL.stemDark, PAL.stem, 0.3 + 0.5 * t),
      flex: (t) => 0.1 + 0.4 * t, phase: s,
    });
  }
  finish(b, v0, t0, [0.4, 0.8, 0.7]);
  // pads along each stem, biggest at the tip, then the snow mound the thicket sits in
  const scale = v.L / 2.3 * 0.4 + 0.65;
  for (const pts of stems) {
    const np = lod === 0 ? 4 : 2;
    for (let q = 0; q < np; q++) {
      const f = 0.3 + 0.7 * (q / (np - 1));
      const p = pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))];
      pad(b, r, p[0], p[1] + 0.12, p[2], (q === np - 1 ? 1.25 : 1.0) * (0.85 + 0.3 * r()) * scale, lod, r() * 6.28, { snow: 0.55, tex: true, n: lod === 0 ? 7 : 5 });
    }
  }
  pad(b, r, 0, v.H * 0.55, 0, 1.1 * scale, lod, r() * 6.28, { snow: 0.6, tex: true, n: lod === 0 ? 7 : 5 });
  if (lod === 0) snowMound(b, r, [0, 0.0, 0], v.L * 0.55, v.H * 0.35, 8, 0.1);
  return { geometry: b.toGeometry(), height: v.H + 0.8, radius: v.L * 0.95, trunkR: 0 };
}
