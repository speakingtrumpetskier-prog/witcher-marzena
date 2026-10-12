// Larch: a slender cone of near horizontal limbs whose needle sprays stay golden into the winter (this is
// the valley's one warm tree against the dark spruce). Soft spurs of amber needles on every limb,
// pendant twigs under the lower ones, a reddish grey trunk. Two forms: a tall straight one and a
// wind-bent one with a flagged crown streaming downwind (+X). Owner: vegetation builder.
// Common (see placement.js: slopes, ridges and the cold north mid heights).
// lod 0: textured sprays (about 2.4k triangles), lod 1: scalloped golden tiers (about 450), lod 2: cones (about 70).
import { GeoBuilder, rng, rgb, mixRGB, frond, softBall } from './geo.js';
import { ODD_UV } from './oddAtlas.js';
import { sweep, sstep } from './oddgeo.js';

export const LARCH_VARIANTS = [
  { id: 'larch_a', seed: 13101, H: 20, maxR: 3.9, tiers: 20, base: 0.2, flag: 0.0, lean: 0.4, droop: 0.2 },
  { id: 'larch_b', seed: 13202, H: 14, maxR: 3.6, tiers: 15, base: 0.16, flag: 1.0, lean: 1.8, droop: 0.25 },
];

const PAL = {
  barkLo: rgb('#5c4a3d'),
  barkHi: rgb('#7d5238'),
  gold: rgb('#94702a'),
  goldDark: rgb('#4f3815'),
  goldLight: rgb('#bf9a45'),
};

export function buildLarch(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  if (lod === 0) b.uvOverride = ODD_UV.solid;
  const H = v.H;
  const baseY = H * v.base;
  const topY = H * 0.97;
  const ph = r() * 6.28;
  const tx = (y) => Math.sin(y / H * 2.2 + ph) * 0.3 * (y / H) + v.lean * Math.pow(y / H, 2);
  const tz = (y) => Math.cos(y / H * 1.9 + ph * 1.3) * 0.25 * (y / H);
  const sides = [7, 5, 4][lod];
  const nRing = lod === 0 ? 11 : lod === 1 ? 5 : 3;
  const rad0 = 0.16 + H * 0.0075;
  const pts = [];
  for (let i = 0; i < nRing; i++) {
    const y = i === 0 ? -0.4 : 0.6 + (H * 0.99 - 0.6) * ((i - 1) / (nRing - 2));
    pts.push([tx(y), y, tz(y)]);
  }
  sweep(b, pts, sides, {
    radius: (i, t) => (rad0 * Math.pow(1 - t, 0.9) + 0.025) * (1 + 0.6 * Math.exp(-(pts[i][1] + 0.4) / 0.9)),
    color: (i, t, ang, k) => mixRGB(PAL.barkLo, PAL.barkHi, 0.3 + 0.4 * Math.sin(i * 1.7 + k * 2.1 + v.seed) * 0.5 + 0.2 * sstep(0.4, 1, t)),
    snow: (dy, i) => (i === 0 ? 0.95 : i === 1 ? 0.25 : 0), flex: (t) => t * 0.15,
  });
  const foliageV0 = b.vcount, foliageT0 = b.tcount;
  const crownR = (f) => v.maxR * (0.3 + 0.7 * Math.sin(Math.min(1, (1 - f) * 1.1) * Math.PI * 0.5)) * Math.pow(1 - f * 0.55, 0.9) * 0.78 + 0.25;
  const tierY = (f) => baseY + (topY - baseY) * Math.pow(f, 0.97);

  if (lod === 0) {
    const tiers = v.tiers;
    const tintLo = [0.62, 0.55, 0.42], tintHi = [1.0, 0.95, 0.8];
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = tierY(f) + (r() - 0.5) * 0.01 * H;
      const R = crownR(f);
      const nb = Math.max(6, Math.round(11 - 4 * f + (r() < 0.3 ? 1 : 0)));
      const rot = ph + t * 2.399963;
      // a golden skirt under the sprays of the lower tiers so they have body instead of sky showing through
      if (f < 0.5) {
        const sec = 8;
        const rot2 = r() * 6.28;
        const sh = 0.8 + 0.2 * f;
        const apex = b.v(tx(y + R * 0.3), y + R * 0.3, tz(y + R * 0.3), 0, 1, 0, [PAL.gold[0] * sh * 0.7, PAL.gold[1] * sh * 0.7, PAL.gold[2] * sh * 0.7], 0, 0, 0.5, 0.1, 0);
        const ids = [];
        for (let j = 0; j < sec; j++) {
          const a2 = rot2 + (j / sec) * Math.PI * 2;
          const wind2 = v.flag * (0.35 + 0.75 * Math.cos(a2));
          const rr = R * (0.55 - 0.3 * f) * (0.85 + r() * 0.3) * (1 + 0.5 * wind2);
          ids.push(b.v(tx(y) + Math.cos(a2) * rr, y - R * 0.3 * (j % 2 ? 1.2 : 0.9), tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.4, Math.sin(a2), [PAL.gold[0] * sh * 0.9, PAL.gold[1] * sh * 0.9, PAL.gold[2] * sh * 0.9], 0, 0, 0, 0.3, 0));
        }
        for (let j = 0; j < sec; j++) b.triFacing(apex, ids[j], ids[(j + 1) % sec], 0, 1, 0);
      }
      for (let i = 0; i < nb; i++) {
        const th = rot + (i + (r() - 0.5) * 0.5) * (Math.PI * 2 / nb);
        // flagging: limbs on the downwind (+X) side are longer, on the windward side shortened
        const wind = v.flag * (0.35 + 0.75 * Math.cos(th));
        const L = R * (0.85 + r() * 0.3) * (1 + 0.55 * wind) * (0.8 + 0.4 * (1 - f));
        const W = L * (0.46 + r() * 0.1);
        const droop = L * v.droop * (1.2 - 0.9 * f) * (0.85 + r() * 0.3);
        const rise = (0.02 + 0.28 * f * f) * (0.8 + r() * 0.4);
        const phase = r() * 6.28;
        frond(b, { x: tx(y), y, z: tz(y) }, th, L, W, droop, rise + v.flag * 0.05 * wind, {
          rng: r, sRows: [0, 0.34, 0.68, 1.0], jag: 0.08, col: [tintLo, tintHi], shade: 0.92 + 0.2 * f, snow: 0.72, snowEdge: 0.3,
          sag: 0.4, tipLift: L * 0.12 * r(), phase, r0: 0.12, uvRect: ODD_UV.larch, widthFn: (s) => Math.min(1, s / 0.1 + 0.4) * (1 - 0.1 * s * s),
        });
        if (f < 0.7 && r() < 0.55) {
          // a pendant twig under the limb
          const s2 = 0.45 + r() * 0.3;
          const rad = 0.12 + L * s2;
          const px = tx(y) + Math.cos(th) * rad, pz = tz(y) + Math.sin(th) * rad;
          const py = y + rise * L * s2 - droop * s2 * s2;
          const th2 = th + (r() - 0.5) * 0.8;
          const ln = L * (0.3 + 0.15 * r());
          frond(b, { x: px - Math.cos(th2) * 0.12, y: py - W * 0.15, z: pz - Math.sin(th2) * 0.12 }, th2, ln, ln * 0.4, ln * 0.1, -1.1, {
            rng: r, sRows: [0, 0.5, 1], col: [tintLo, tintHi], shade: 0.85, snow: 0.18, r0: 0.12, phase, sag: 0.2, jag: 0.1, hint: [Math.cos(th2), 0.2, Math.sin(th2)], uvRect: ODD_UV.pendant,
          });
        }
      }
    }
  } else {
    // scalloped golden tiers; the flagged form pushes its crown downwind
    const nT = lod === 1 ? 10 : 6;
    const rim = lod === 1 ? 10 : 7;
    for (let t = 0; t < nT; t++) {
      const f = t / (nT - 1);
      const y = tierY(f * 0.94);
      const R = crownR(f) * 1.12;
      const rot = r() * 6.28;
      const apexY = y + R * 0.5 + (topY - baseY) / nT * 0.5;
      const dark = PAL.goldDark, light = mixRGB(PAL.gold, PAL.goldLight, 0.3 + f * 0.4);
      const shade = 0.82 + 0.2 * f;
      const apex = b.v(tx(apexY), apexY, tz(apexY), 0, 1, 0, [dark[0] * shade * 1.2, dark[1] * shade * 1.2, dark[2] * shade * 1.2], 0, 0.1, 0.8, 0.2, 0);
      const ids = [];
      for (let j = 0; j < rim; j++) {
        const a2 = rot + (j / rim) * Math.PI * 2;
        const odd = j % 2;
        const wind = v.flag * (0.35 + 0.75 * Math.cos(a2));
        const rr = R * (odd ? 0.78 : 1.0) * (0.9 + r() * 0.2) * (1 + 0.5 * wind);
        const yy = y - R * 0.34 * (odd ? 1.25 : 0.95);
        ids.push(b.v(tx(y) + Math.cos(a2) * rr, yy, tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.35, Math.sin(a2), [light[0] * shade, light[1] * shade, light[2] * shade], lod === 1 ? 1 : 0, j / rim, odd ? 0.05 : 0.35, 0.8, r() * 6.28));
      }
      for (let j = 0; j < rim; j++) b.triFacing(apex, ids[j], ids[(j + 1) % rim], 0, 1, 0);
    }
  }
  b.smooth(foliageV0, foliageT0, softBall(0, H * 0.45, 0, 0.5, 0.3));
  b.tint(foliageV0, (x, y, z) => {
    const d = Math.hypot(x - tx(y), z - tz(y));
    const k = Math.min(1, d / Math.max(0.8, v.maxR * 0.5));
    const hf = Math.min(1, Math.max(0, (y - baseY) / (topY - baseY)));
    return (0.6 + 0.4 * k) * (0.82 + 0.18 * hf);
  });
  return { geometry: b.toGeometry(), height: H * 1.03, radius: v.maxR * (1.1 + 0.7 * v.flag) + 0.5, trunkR: Math.max(0.2, rad0 * 1.1) };
}
