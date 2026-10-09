// Norway spruce and young spruce saplings. Owner: vegetation builder.
//
// Each variant is built at three levels of detail from the same parameters so silhouettes match:
//   lod 0: many thin drooping tiers of branch cards (alpha tested needle texture with a fringed,
//          soft silhouette, see textures.js), a dark inner skirt, hanging cards and snow lumps
//          sitting on the tiers (about 3k triangles)
//   lod 1: scalloped cone tiers with a ragged rim (about 400 triangles)
//   lod 2: coarse cone tiers (about 60 triangles)
// Snow is baked as the vertex attribute aSnow (tops of the branch layers) and scaled by uSnowCover.
import { GeoBuilder, rng, rgb, mixRGB, tube, frond, softBall, trunkHeights, snowLump } from './geo.js';
import { NEEDLE_UV } from './textures.js';

export const SPRUCE_VARIANTS = [
  { id: 'spruce_a', seed: 101, H: 27, maxR: 3.7, tiers: 15, base: 0.12, droop: 0.34, taper: 0.95, snow: 1.0, hue: 0.0, lean: 0.35, dead: 4 },
  { id: 'spruce_b', seed: 202, H: 21, maxR: 4.7, tiers: 13, base: 0.08, droop: 0.30, taper: 0.85, snow: 0.95, hue: 0.5, lean: 0.25, dead: 2 },
  { id: 'spruce_c', seed: 303, H: 31, maxR: 3.4, tiers: 16, base: 0.2, droop: 0.38, taper: 1.05, snow: 0.9, hue: -0.4, lean: 0.9, dead: 7, gaps: 0.2 },
  { id: 'spruce_d', seed: 404, H: 14, maxR: 3.2, tiers: 11, base: 0.03, droop: 0.28, taper: 0.9, snow: 1.0, hue: 0.2, lean: 0.2, dead: 0 },
  { id: 'spruce_e', seed: 707, H: 24, maxR: 4.3, tiers: 13, base: 0.07, droop: 0.42, taper: 0.8, snow: 1.0, hue: -0.2, lean: 0.5, dead: 3 },
  { id: 'spruce_f', seed: 808, H: 29, maxR: 2.9, tiers: 15, base: 0.24, droop: 0.32, taper: 1.1, snow: 0.95, hue: 0.3, lean: 0.4, dead: 6 },
];

export const SAPLING_VARIANTS = [
  { id: 'sapling_a', seed: 505, H: 2.4, maxR: 0.95, tiers: 8, base: 0.0, droop: 0.26, taper: 0.9, snow: 1.0, hue: 0.3, lean: 0.05, dead: 0, sapling: true },
  { id: 'sapling_b', seed: 606, H: 3.8, maxR: 1.35, tiers: 10, base: 0.0, droop: 0.3, taper: 0.85, snow: 1.0, hue: 0.0, lean: 0.08, dead: 0, sapling: true },
];

const PAL = {
  dark: rgb('#1d3528'),
  light: rgb('#2d4734'),
  warm: rgb('#37533f'),
  under: rgb('#111d17'),
  bark: rgb('#4a3a2e'),
  barkLight: rgb('#6b5646'),
  dead: rgb('#6a5e50'),
};

// Spine position of a frond at parameter s (mirrors geo.frond).
function spine(ox, oy, oz, theta, L, droop, rise, s, r0 = 0.14) {
  const rad = r0 + L * s;
  return [ox + Math.cos(theta) * rad, oy + rise * L * s - droop * s * s, oz + Math.sin(theta) * rad];
}

export function buildSpruce(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const H = v.H;
  const baseY = H * v.base;
  const topY = H * 0.985;
  const tiers = lod === 0 ? Math.round(v.tiers * (v.sapling ? 0.9 : 1.45)) : v.tiers;
  const lean = v.lean;
  const phase0 = r() * 6.28;
  // trunk centerline offset as a function of height (gentle S curve)
  const tx = (y) => Math.sin(y / H * 2.4 + phase0) * lean * (y / H) + Math.sin(y * 0.31 + phase0 * 2) * 0.05;
  const tz = (y) => Math.cos(y / H * 2.1 + phase0 * 1.3) * lean * (y / H);

  // ---------------- trunk ----------------
  const sides = [7, 5, 4][lod];
  const nRings = lod === 0 ? 10 : lod === 1 ? 5 : 3;
  const pts = [];
  const rad0 = Math.max(0.1, H * 0.0125) * (v.sapling ? 0.8 : 1);
  for (const y of trunkHeights(nRings, H * 0.99)) pts.push([tx(y), y, tz(y)]);
  if (lod === 0) b.uvOverride = NEEDLE_UV.solid; // textured program: solid parts point at an opaque texel
  const trunkV0 = b.vcount;
  tube(b, pts, (i, t) => (rad0 * Math.pow(1 - t, 0.9) + 0.02) * (1 + 0.65 * Math.exp(-(pts[i][1] + 0.4) / 0.9)),
    (i) => mixRGB(PAL.bark, PAL.barkLight, 0.3 + 0.4 * Math.sin(i * 1.7 + v.seed)), { sides, rng: r, jitter: lod === 0 ? 0.25 : 0, snowRing: [0.95, 0.25] });
  b.tint(trunkV0, (x, y) => 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.4) / (H * 0.25))));

  // ---------------- dead lower branches (stubs) ----------------
  if (lod === 0 && v.dead > 0) {
    for (let i = 0; i < v.dead; i++) {
      const y = H * (0.03 + r() * Math.max(0.02, v.base * 0.95));
      const th = r() * 6.28;
      const len = 0.5 + r() * 1.3;
      const o = [tx(y), y, tz(y)];
      const p1 = [o[0] + Math.cos(th) * len * 0.5, o[1] - 0.08 * len, o[2] + Math.sin(th) * len * 0.5];
      const p2 = [o[0] + Math.cos(th) * len, o[1] - 0.2 * len + (r() - 0.3) * 0.2, o[2] + Math.sin(th) * len];
      tube(b, [o, p1, p2], (k, t) => 0.045 * (1 - t) + 0.008, () => PAL.dead,
        { sides: 3, rng: r, snowFn: (ny) => (ny > 0.4 ? 0.55 : 0), flex: (t) => t * 0.4 });
    }
  }

  // ---------------- crown ----------------
  const foliageV0 = b.vcount;
  const foliageT0 = b.tcount;
  const ang0 = r() * 6.28;
  const nbBase = v.sapling ? 6 : 9;
  const sRowsMid = [0, 0.34, 0.68, 1.0];
  const crownR = (f) => v.maxR * (0.72 + 0.28 * Math.min(1, f / 0.1)) * Math.pow(1 - f, v.taper) + 0.35;
  const tierY = (f) => baseY + (topY - baseY) * Math.pow(f, 0.96);

  // dark inner skirt per tier: fills the gaps between fronds with shaded needles instead of sky
  const underlay = (y, R, f, sectors, wide = 0.7) => {
    const rot = r() * 6.28;
    const apexY = y + R * 0.3;
    const sh = 0.7 + 0.2 * f;
    const apex = b.v(tx(apexY), apexY, tz(apexY), 0, 1, 0, [PAL.under[0] * sh, PAL.under[1] * sh, PAL.under[2] * sh], 0, 0, 0.5, 0.1, 0);
    const ids = [];
    for (let j = 0; j < sectors; j++) {
      const a = rot + (j / sectors) * Math.PI * 2;
      const rr = R * wide * (0.85 + r() * 0.3);
      const yy = y - R * 0.28 * (j % 2 ? 1.2 : 0.9);
      ids.push(b.v(tx(y) + Math.cos(a) * rr, yy, tz(y) + Math.sin(a) * rr, Math.cos(a), 0.4, Math.sin(a),
        [PAL.under[0] * sh * 1.3, PAL.under[1] * sh * 1.3, PAL.under[2] * sh * 1.2], 0, 0, 0.55, 0.3, 0));
    }
    for (let j = 0; j < sectors; j++) b.triFacing(apex, ids[j], ids[(j + 1) % sectors], 0, 1, 0);
  };

  if (lod === 0) {
    // needle card tints (multiply the texture): vertex colors carry shading and variation only
    const hue = v.hue;
    const tintLo = [0.74 * (1 + hue * 0.08), 0.78, 0.78 * (1 - hue * 0.06)];
    const tintHi = [1.08 * (1 + hue * 0.06), 1.12, 1.1 * (1 - hue * 0.05)];
    const cardW = (s) => Math.min(1, s / 0.12 + 0.35) * (1 - 0.16 * s * s);
    for (let t = 0; t < tiers; t++) {
      const f = tiers > 1 ? t / (tiers - 1) : 0;
      const y = tierY(f) + (r() - 0.5) * 0.012 * H;
      const R = crownR(f) * (1 + 0.14 * (1 - f));
      let nb = Math.round(nbBase - (nbBase - 5) * f);
      nb = Math.max(4, nb + (r() < 0.3 ? 1 : 0));
      const tierRot = ang0 + t * 2.399963; // golden angle so tiers interleave
      const shade = 0.8 + 0.3 * f;
      underlay(y, R, f, 8, 0.7);
      for (let i = 0; i < nb; i++) {
        if (v.gaps && r() < v.gaps * (1 - f * 0.5)) continue; // old, ragged tree: missing limbs
        const th = tierRot + (i + (r() - 0.5) * 0.5) * (Math.PI * 2 / nb);
        const L = R * (0.88 + r() * 0.34);
        const W = L * (0.34 + r() * 0.1);
        // lower limbs are longer and sag under their snow, the top ones point up
        const droop = L * v.droop * (1.35 - 1.0 * f) * (0.85 + r() * 0.3);
        const rise = (0.02 + 0.5 * f * f) * (0.8 + r() * 0.4);
        const ox = tx(y), oz = tz(y);
        const phase = r() * 6.28;
        frond(b, { x: ox, y, z: oz }, th, L, W, droop, rise, {
          rng: r, sRows: sRowsMid, jag: 0.1, col: [tintLo, tintHi], shade,
          snow: v.snow * 0.5, sag: 0.5 + 0.2 * (1 - f), tipLift: f > 0.5 ? L * 0.08 * r() : 0, phase,
          r0: 0.14, uvRect: NEEDLE_UV.spruce, widthFn: cardW,
        });
        // snow lump resting on the branch
        if (!v.sapling && f < 0.88 && r() < 0.45 * (1 - 0.4 * f)) {
          const sp = 0.4 + r() * 0.25;
          const p = spine(ox, y, oz, th, L, droop, rise, sp);
          snowLump(b, p[0], p[1] + 0.02, p[2], W * (0.4 + 0.3 * r()) * (1 - 0.3 * f), 0.12 + 0.14 * (1 - f) + r() * 0.06, r, 6, 0.3, phase);
        }
        // a hanging card under the lower branches: the ragged curtain that Norway spruce wears
        if (!v.sapling && f < 0.58 && r() < 0.5) {
          const sh = 0.55 + r() * 0.3;
          const p = spine(ox, y, oz, th, L, droop, rise, sh);
          const th2 = th + (r() - 0.5) * 0.9;
          const ln = L * (0.26 + 0.12 * (1 - f));
          frond(b, { x: p[0] - Math.cos(th2) * 0.14, y: p[1] - W * 0.2, z: p[2] - Math.sin(th2) * 0.14 }, th2, ln, ln * 0.4, ln * 0.12, -1.25, {
            rng: r, sRows: [0, 0.5, 1], col: [tintLo, [tintHi[0] * 0.85, tintHi[1] * 0.85, tintHi[2] * 0.85]], shade: 0.8, snow: 0.2, r0: 0.14, phase,
            sag: 0.2, jag: 0.1, hint: [Math.cos(th2), 0.2, Math.sin(th2)], uvRect: NEEDLE_UV.spruce,
          });
        }
      }
    }
    // leader: a slim dark spike with a few short upward needle cards
    const topPos = [tx(H * 0.99), H * 0.97, tz(H * 0.99)];
    for (let i = 0; i < 4; i++) {
      const th = ang0 + i * (Math.PI * 2 / 4) + r();
      frond(b, { x: topPos[0], y: topPos[1] - 0.9, z: topPos[2] }, th, 0.7 + r() * 0.35, 0.22, 0.04, 1.9, {
        rng: r, sRows: [0, 0.5, 1], col: [tintLo, tintHi], shade: 0.9, snow: 0.55, r0: 0.04, phase: r() * 6.28, sag: 0.2, jag: 0.05, uvRect: NEEDLE_UV.spruce,
      });
    }
    tube(b, [[topPos[0], topPos[1] - 0.9, topPos[2]], [topPos[0], H * 1.03, topPos[2]]], (k, t) => 0.035 * (1 - t) + 0.005, () => PAL.dark, { sides: 3, rng: r, flex: (t) => t });
  } else {
    // ---------- lods 1 and 2: scalloped cone tiers (continuous skirts with a ragged rim) ----------
    const nT = lod === 1 ? Math.max(8, Math.round(v.tiers * 0.72)) : 7;
    const rim = lod === 1 ? 12 : 8;
    for (let t = 0; t < nT; t++) {
      const f = t / (nT - 1);
      const y = tierY(f * 0.94);
      const R = crownR(f) * 1.04;
      const rot = r() * 6.28;
      const apexY = y + R * (0.45 + 0.2 * f) + (topY - baseY) / nT * 0.55;
      const dark = PAL.dark, light = mixRGB(PAL.light, PAL.warm, 0.3 + f * 0.3);
      const shade = 0.78 + 0.22 * f;
      const apex = b.v(tx(apexY), apexY, tz(apexY), 0, 1, 0, [dark[0] * shade, dark[1] * shade, dark[2] * shade], 0, 0.1, v.snow * 0.9, 0.2, 0);
      const ring1 = [];
      if (lod === 1) {
        for (let j = 0; j < rim; j++) {
          const a2 = rot + (j / rim) * Math.PI * 2;
          const rr = R * 0.58 * (0.85 + r() * 0.3);
          const mid = mixRGB(dark, light, 0.45);
          ring1.push(b.v(tx(y) + Math.cos(a2) * rr, y - R * 0.12, tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.5, Math.sin(a2), [mid[0] * shade, mid[1] * shade, mid[2] * shade], 0.5, j / rim, v.snow * 0.85, 0.5, r() * 6.28));
        }
      }
      const ids = [];
      for (let j = 0; j < rim; j++) {
        const a2 = rot + (j / rim) * Math.PI * 2;
        const odd = j % 2;
        const rr = R * (odd ? 0.8 : 1.02) * (0.9 + r() * 0.2);
        const yy = y - R * 0.36 * (odd ? 1.3 : 0.95);
        const cc = [light[0] * shade * 1.05, light[1] * shade * 1.05, light[2] * shade];
        ids.push(b.v(tx(y) + Math.cos(a2) * rr, yy, tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.3, Math.sin(a2), cc, lod === 1 ? 1 : 0, j / rim, v.snow * (odd ? 0.0 : 0.1), 0.9, r() * 6.28));
      }
      for (let j = 0; j < rim; j++) {
        const k = (j + 1) % rim;
        if (lod === 1) {
          b.triFacing(apex, ring1[j], ring1[k], 0, 1, 0);
          b.triFacing(ring1[j], ids[j], ids[k], 0, 1, 0);
          b.triFacing(ring1[j], ids[k], ring1[k], 0, 1, 0);
        } else {
          b.triFacing(apex, ids[j], ids[k], 0, 1, 0);
        }
      }
    }
  }
  b.smooth(foliageV0, foliageT0, softBall(0, H * 0.42, 0, 0.5, 0.3));
  // ambient occlusion: darker toward the trunk, and the lower crown is shaded by the layers above
  b.tint(foliageV0, (x, y, z) => {
    const d = Math.hypot(x - tx(y), z - tz(y));
    const k = Math.min(1, d / Math.max(0.8, v.maxR * 0.55));
    const hf = Math.min(1, Math.max(0, (y - baseY) / (topY - baseY)));
    return (0.55 + 0.45 * k) * (0.8 + 0.2 * hf);
  });
  const g = b.toGeometry();
  return { geometry: g, height: H * 1.03, radius: v.maxR * 1.15, trunkR: Math.max(0.2, rad0 * 1.1) };
}
