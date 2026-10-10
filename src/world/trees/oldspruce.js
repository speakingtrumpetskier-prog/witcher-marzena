// Veteran spruce: an old, thick Norway spruce whose leader was snapped by storm or lightning. The crown
// stops short, the dead trunk stands on above it as a silvered, splintered spike with a pale scar, a few
// heavy limbs sag nearly to the snow, many lower limbs are dead stubs, and (variant a) a side branch has
// turned upright to carry on as a second, smaller crown. Owner: vegetation builder.
// Common (see placement.js: replaces some tall spruce inside the dense forest).
// One part per LOD. lod 0 about 2.6k triangles, lod 1 about 450, lod 2 about 70.
import { GeoBuilder, rng, rgb, mixRGB, frond, softBall } from './geo.js';
import { NEEDLE_UV } from './textures.js';
import { sweep, finish, sstep } from './oddgeo.js';

export const OLDSPRUCE_VARIANTS = [
  { id: 'spruce_old_a', seed: 15101, H: 27, maxR: 4.3, tiers: 14, base: 0.1, top: 0.72, droop: 0.42, lean: 0.5, hue: -0.3, second: true, dead: 9 },
];

const PAL = {
  dark: rgb('#1b3126'),
  light: rgb('#2a4332'),
  warm: rgb('#34503c'),
  under: rgb('#0f1a15'),
  bark: rgb('#4a3a2e'),
  barkLight: rgb('#6b5646'),
  dead: rgb('#7d7365'),
  silver: rgb('#a39a8a'),
  raw: rgb('#a8987a'),
};

export function buildOldSpruce(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  if (lod === 0) b.uvOverride = NEEDLE_UV.solid;
  const H = v.H;
  const baseY = H * v.base;
  const topY = H * v.top; // the crown ends here
  const breakY = topY + H * 0.1; // the dead trunk ends here
  const phase0 = r() * 6.28;
  const lean = v.lean;
  const tx = (y) => Math.sin(y / H * 2.4 + phase0) * lean * (y / H) + Math.sin(y * 0.31 + phase0 * 2) * 0.06;
  const tz = (y) => Math.cos(y / H * 2.1 + phase0 * 1.3) * lean * (y / H);

  // ---------------- trunk: thick, a pale lightning scar down one side, dead and silvered above the crown ----------------
  const sides = [9, 5, 4][lod];
  const nRing = lod === 0 ? 14 : lod === 1 ? 6 : 4;
  const pts = [];
  for (let i = 0; i < nRing; i++) {
    const y = i === 0 ? -0.4 : 0.8 + (breakY - 0.8) * ((i - 1) / (nRing - 2));
    pts.push([tx(y), y, tz(y)]);
  }
  const rad0 = Math.max(0.2, H * 0.0205);
  const v0 = b.vcount, t0 = b.tcount;
  const scarA = r() * 6.28;
  sweep(b, pts, sides, {
    radius: (i, t) => (rad0 * (1 - 0.55 * Math.pow(t, 0.9)) + 0.05) * (1 + 0.7 * Math.exp(-(pts[i][1] + 0.4) / 1.0)),
    color: (i, t, ang, k) => {
      const y = pts[i][1];
      let c = mixRGB(PAL.bark, PAL.barkLight, 0.3 + 0.4 * Math.sin(i * 1.7 + v.seed + k * 0.8));
      const dead = sstep(topY - 1, topY + 1, y);
      c = mixRGB(c, PAL.silver, dead * 0.85);
      // lightning scar: a pale stripe winding down from the break
      const scar = Math.abs(Math.sin((ang - scarA) * 0.5 + y * 0.05)) < 0.12 && y < breakY - 0.3 && y > 1.5;
      return scar ? mixRGB(c, PAL.raw, 0.75) : c;
    },
    flex: (t) => t * 0.15, capEnd: { color: PAL.raw, snow: 0.95 },
  });
  finish(b, v0, t0, [0.45, 0.85, 0.95]);
  for (let k = v0; k < b.vcount; k++) if (b.p[k * 3 + 1] < 0.9) b.s[k] = Math.max(b.s[k], b.p[k * 3 + 1] < 0.3 ? 0.95 : 0.3);
  b.tint(v0, (x, y) => 0.6 + 0.4 * Math.min(1, (y + 0.4) / (H * 0.2)));

  // splinters at the break
  if (lod < 2) {
    const top = pts[pts.length - 1];
    const ns = lod === 0 ? 5 : 2;
    for (let q = 0; q < ns; q++) {
      const a = r() * 6.28;
      const o = [top[0] + Math.cos(a) * 0.1, top[1] - 0.15, top[2] + Math.sin(a) * 0.1];
      const e = [o[0] + Math.cos(a) * 0.12, o[1] + 0.7 + r() * 1.6, o[2] + Math.sin(a) * 0.12];
      sweep(b, [o, [(o[0] + e[0]) / 2, (o[1] + e[1]) / 2, (o[2] + e[2]) / 2], e], 3, {
        radius: (i, t) => 0.12 * (1 - t) + 0.01, color: (i, t) => mixRGB(PAL.raw, PAL.silver, t * 0.6), snow: [0.3, 0.8, 0.6], flex: 0.2,
      });
    }
  }
  // dead lower limbs: heavy grey stubs
  if (lod === 0) {
    for (let i = 0; i < v.dead; i++) {
      const y = H * (0.02 + r() * 0.2);
      const th = r() * 6.28;
      const len = 0.8 + r() * 1.8;
      const o = [tx(y), y, tz(y)];
      const p1 = [o[0] + Math.cos(th) * len * 0.5, o[1] - 0.05 * len, o[2] + Math.sin(th) * len * 0.5];
      const p2 = [o[0] + Math.cos(th) * len, o[1] - 0.22 * len + (r() - 0.3) * 0.2, o[2] + Math.sin(th) * len];
      sweep(b, [o, p1, p2], 4, { radius: (k, t) => 0.07 * (1 - t) + 0.012, color: () => PAL.dead, snow: [0.35, 0.8, 0.7], flex: (t) => t * 0.3 });
    }
  }

  // ---------------- crown ----------------
  const foliageV0 = b.vcount, foliageT0 = b.tcount;
  const ang0 = r() * 6.28;
  const crownR = (f) => v.maxR * (0.7 + 0.3 * Math.min(1, f / 0.1)) * Math.pow(1 - f * 0.78, 0.9) + 0.4;
  const tierY = (f) => baseY + (topY - baseY) * Math.pow(f, 0.96);
  const underlay = (y, R, f, sectors) => {
    const rot = r() * 6.28;
    const apexY = y + R * 0.3;
    const sh = 0.7 + 0.2 * f;
    const apex = b.v(tx(apexY), apexY, tz(apexY), 0, 1, 0, [PAL.under[0] * sh, PAL.under[1] * sh, PAL.under[2] * sh], 0, 0, 0.5, 0.1, 0);
    const ids = [];
    for (let j = 0; j < sectors; j++) {
      const a = rot + (j / sectors) * Math.PI * 2;
      const rr = R * 0.7 * (0.85 + r() * 0.3);
      ids.push(b.v(tx(y) + Math.cos(a) * rr, y - R * 0.28 * (j % 2 ? 1.2 : 0.9), tz(y) + Math.sin(a) * rr, Math.cos(a), 0.4, Math.sin(a), [PAL.under[0] * sh * 1.3, PAL.under[1] * sh * 1.3, PAL.under[2] * sh * 1.2], 0, 0, 0.5, 0.3, 0));
    }
    for (let j = 0; j < sectors; j++) b.triFacing(apex, ids[j], ids[(j + 1) % sectors], 0, 1, 0);
  };
  if (lod === 0) {
    const hue = v.hue;
    const tintLo = [0.52 * (1 + hue * 0.08), 0.56, 0.58 * (1 - hue * 0.06)];
    const tintHi = [0.82 * (1 + hue * 0.06), 0.88, 0.9 * (1 - hue * 0.05)];
    const cardW = (s) => Math.min(1, s / 0.12 + 0.35) * (1 - 0.16 * s * s);
    const tiers = Math.round(v.tiers * 1.4);
    for (let t = 0; t < tiers; t++) {
      const f = tiers > 1 ? t / (tiers - 1) : 0;
      const y = tierY(f) + (r() - 0.5) * 0.012 * H;
      const R = crownR(f) * (1 + 0.14 * (1 - f));
      const nb = Math.max(4, Math.round(9 - 4 * f) + (r() < 0.3 ? 1 : 0));
      const tierRot = ang0 + t * 2.399963;
      underlay(y, R, f, 8);
      for (let i = 0; i < nb; i++) {
        if (r() < 0.26 * (1 - f * 0.4)) continue; // old, ragged tree: missing limbs
        const th = tierRot + (i + (r() - 0.5) * 0.5) * (Math.PI * 2 / nb);
        const L = R * (0.88 + r() * 0.34) * (f < 0.25 ? 1.12 : 1);
        const W = L * (0.34 + r() * 0.1);
        const droop = L * v.droop * (1.4 - 1.0 * f) * (0.85 + r() * 0.3);
        const rise = (0.02 + 0.45 * f * f) * (0.8 + r() * 0.4);
        const ox = tx(y), oz = tz(y);
        const phase = r() * 6.28;
        frond(b, { x: ox, y, z: oz }, th, L, W, droop, rise, {
          rng: r, sRows: [0, 0.34, 0.68, 1.0], jag: 0.12, col: [tintLo, tintHi], shade: 0.78 + 0.28 * f,
          snow: 0.7, snowEdge: 0.22, sag: 0.55, tipLift: f > 0.5 ? L * 0.08 * r() : 0, phase, r0: 0.14, uvRect: NEEDLE_UV.spruce, widthFn: cardW,
        });
        if (f < 0.55 && r() < 0.5) {
          const sh = 0.55 + r() * 0.3;
          const rad = 0.14 + L * sh;
          const px = ox + Math.cos(th) * rad, pz = oz + Math.sin(th) * rad;
          const py = y + rise * L * sh - droop * sh * sh;
          const th2 = th + (r() - 0.5) * 0.9;
          const ln = L * (0.28 + 0.12 * (1 - f));
          frond(b, { x: px - Math.cos(th2) * 0.14, y: py - W * 0.2, z: pz - Math.sin(th2) * 0.14 }, th2, ln, ln * 0.4, ln * 0.12, -1.25, {
            rng: r, sRows: [0, 0.5, 1], col: [tintLo, [tintHi[0] * 0.85, tintHi[1] * 0.85, tintHi[2] * 0.85]], shade: 0.8, snow: 0.2, r0: 0.14, phase,
            sag: 0.2, jag: 0.1, hint: [Math.cos(th2), 0.2, Math.sin(th2)], uvRect: NEEDLE_UV.spruce,
          });
        }
      }
    }
    // the second crown: an upturned side limb with three small tiers of its own
    if (v.second) {
      const y0 = topY * 0.8;
      const th0 = r() * 6.28;
      const base = [tx(y0) + Math.cos(th0) * 1.4, y0 + 0.8, tz(y0) + Math.sin(th0) * 1.4];
      const leader = [[tx(y0), y0, tz(y0)], [base[0], base[1] + 0.3, base[2]], [base[0] + Math.cos(th0) * 0.3, base[1] + 2.0, base[2] + Math.sin(th0) * 0.3], [base[0] + Math.cos(th0) * 0.4, base[1] + 4.2, base[2] + Math.sin(th0) * 0.4]];
      sweep(b, leader, 5, { radius: (i, t) => 0.2 * (1 - 0.8 * t) + 0.03, color: () => mixRGB(PAL.bark, PAL.barkLight, 0.4), snow: [0.4, 0.8, 0.7], flex: (t) => 0.1 + 0.3 * t });
      for (let q = 0; q < 6; q++) {
        const f = q / 5;
        const y = base[1] + 0.6 + f * 3.6;
        const R = 1.9 * (1 - 0.7 * f) + 0.3;
        for (let i = 0; i < 5; i++) {
          const th = th0 + q * 2.4 + i * 1.256 + r() * 0.4;
          frond(b, { x: base[0] + Math.cos(th0) * 0.3 * f * 1.4, y, z: base[2] + Math.sin(th0) * 0.3 * f * 1.4 }, th, R, R * 0.38, R * 0.25, 0.1 + 0.3 * f, {
            rng: r, sRows: [0, 0.4, 0.75, 1], jag: 0.1, col: [tintLo, tintHi], shade: 0.85 + 0.2 * f, snow: 0.8, sag: 0.4, r0: 0.1, phase: r() * 6.28, uvRect: NEEDLE_UV.spruce, widthFn: cardW,
          });
        }
      }
    }
  } else {
    const nT = lod === 1 ? Math.max(8, Math.round(v.tiers * 0.7)) : 6;
    const rim = lod === 1 ? 12 : 8;
    for (let t = 0; t < nT; t++) {
      const f = t / (nT - 1);
      const y = tierY(f * 0.94);
      const R = crownR(f) * 1.04;
      const rot = r() * 6.28;
      const apexY = y + R * (0.45 + 0.2 * f) + (topY - baseY) / nT * 0.55;
      const dark = PAL.dark, light = mixRGB(PAL.light, PAL.warm, 0.3 + f * 0.3);
      const shade = 0.74 + 0.22 * f;
      const apex = b.v(tx(apexY), apexY, tz(apexY), 0, 1, 0, [dark[0] * shade, dark[1] * shade, dark[2] * shade], 0, 0.1, 0.85, 0.2, 0);
      const ring1 = [];
      if (lod === 1) {
        for (let j = 0; j < rim; j++) {
          const a2 = rot + (j / rim) * Math.PI * 2;
          const rr = R * 0.58 * (0.85 + r() * 0.3);
          const mid = mixRGB(dark, light, 0.45);
          ring1.push(b.v(tx(y) + Math.cos(a2) * rr, y - R * 0.12, tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.5, Math.sin(a2), [mid[0] * shade, mid[1] * shade, mid[2] * shade], 0.5, j / rim, 0.85, 0.5, r() * 6.28));
        }
      }
      const ids = [];
      for (let j = 0; j < rim; j++) {
        const a2 = rot + (j / rim) * Math.PI * 2;
        const odd = j % 2;
        const gap = r() < 0.18 ? 0.55 : 1; // missing limbs
        const rr = R * (odd ? 0.8 : 1.02) * (0.9 + r() * 0.2) * gap;
        const yy = y - R * 0.36 * (odd ? 1.3 : 0.95);
        const cc = [light[0] * shade * 1.05, light[1] * shade * 1.05, light[2] * shade];
        ids.push(b.v(tx(y) + Math.cos(a2) * rr, yy, tz(y) + Math.sin(a2) * rr, Math.cos(a2), 0.3, Math.sin(a2), cc, lod === 1 ? 1 : 0, j / rim, odd ? 0.0 : 0.1, 0.9, r() * 6.28));
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
  b.smooth(foliageV0, foliageT0, softBall(0, H * 0.4, 0, 0.5, 0.3));
  b.tint(foliageV0, (x, y, z) => {
    const d = Math.hypot(x - tx(y), z - tz(y));
    const k = Math.min(1, d / Math.max(0.8, v.maxR * 0.55));
    const hf = Math.min(1, Math.max(0, (y - baseY) / (topY - baseY)));
    return (0.5 + 0.5 * k) * (0.78 + 0.22 * hf);
  });
  return { geometry: b.toGeometry(), height: breakY + 2.2, radius: v.maxR * 1.2, trunkR: Math.max(0.3, rad0 * 1.1) };
}
