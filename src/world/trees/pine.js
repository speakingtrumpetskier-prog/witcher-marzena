// Scots pine: tall straight trunk (grey and fissured below, orange and flaky above) carrying a flat,
// irregular crown of cloud-pruned needle pads on bent limbs. Owner: vegetation builder.
// lod 0: limbs and domed pads (about 700 tris), lod 1: pads only (about 180), lod 2: flat discs (about 50).
import { GeoBuilder, rng, rgb, mixRGB, tube, frond, softBall, trunkHeights } from './geo.js';
import { NEEDLE_UV } from './textures.js';

export const PINE_VARIANTS = [
  { id: 'pine_a', seed: 1101, H: 22, base: 0.62, pads: 9, spread: 4.6, lean: 0.4, wind: 0.0, bend: 0.5 },
  { id: 'pine_b', seed: 1202, H: 17, base: 0.5, pads: 8, spread: 3.8, lean: 1.4, wind: 0.0, bend: 1.1 },
  { id: 'pine_c', seed: 1303, H: 12.5, base: 0.42, pads: 7, spread: 3.4, lean: 1.0, wind: 1.0, bend: 1.4 },
];

const PAL = {
  barkLow: rgb('#5a5149'),
  barkMid: rgb('#6a5646'),
  barkHigh: rgb('#7f5e46'), // muted orange-brown upper bark
  limb: rgb('#72584a'),
  needleDark: rgb('#1f3a33'),
  needleLight: rgb('#3f6350'),
  needleWarm: rgb('#4f7048'),
};

// A needle pad: a rosette of short needle fronds radiating from the limb tip (flat, slightly
// upturned, drooping at the rim), a dark core underneath, and a little snow on top.
function addPad(b, r, cx, cy, cz, R, lod, windPhase, tilt) {
  const n = lod === 0 ? 7 : 5;
  const rot = r() * 6.28;
  const rows = lod === 0 ? [0, 0.4, 0.75, 1] : [0, 0.6, 1];
  // core: shaded dome under the fronds so the pad is not see-through
  const sectors = lod === 0 ? 7 : 5;
  const apex = b.v(cx, cy + R * 0.2, cz, 0, 1, 0, mixRGB(PAL.needleDark, PAL.needleDark, 0), 0, 0, 0.35, 0.3, windPhase);
  const ids = [];
  for (let j = 0; j < sectors; j++) {
    const a = rot + (j / sectors) * Math.PI * 2;
    const rr = R * 0.5 * (0.8 + r() * 0.4);
    ids.push(b.v(cx + Math.cos(a) * rr, cy - R * 0.12 + tilt * Math.cos(a) * R * 0.2, cz + Math.sin(a) * rr, Math.cos(a), 0.5, Math.sin(a), mixRGB(PAL.needleDark, PAL.needleLight, 0.25), 0, 0, 0.3, 0.6, windPhase));
  }
  if (lod > 0) for (let j = 0; j < sectors; j++) b.triFacing(apex, ids[j], ids[(j + 1) % sectors], 0, 1, 0); // textured cards need no core
  for (let i = 0; i < n; i++) {
    const th = rot + (i + (r() - 0.5) * 0.4) * (Math.PI * 2 / n);
    const L = R * (0.85 + r() * 0.4);
    if (lod === 0) {
      // needle tuft card: the map is a burst of long blue-green needles, so the clump has a soft ragged outline
      frond(b, { x: cx, y: cy + R * 0.12, z: cz }, th, L * 1.1, L * 0.5, L * 0.2, 0.18 + r() * 0.3, {
        rng: r, sRows: [0, 0.4, 0.75, 1], jag: 0.08, col: [[0.8, 0.84, 0.84], [1.12, 1.15, 1.08]],
        shade: 0.95 + r() * 0.2, snow: 0.3, sag: 0.25, r0: 0.05, phase: windPhase + r(), tipLift: L * 0.1 * r(),
        uvRect: NEEDLE_UV.pine, widthFn: (s) => Math.min(1, s / 0.15 + 0.3),
      });
    } else {
      frond(b, { x: cx, y: cy + R * 0.12, z: cz }, th, L, L * (0.34 + r() * 0.1), L * 0.22, 0.28 + r() * 0.25, {
        rng: r, sRows: rows, jag: 0.3, col: [PAL.needleDark, mixRGB(PAL.needleLight, PAL.needleWarm, r() * 0.7)],
        shade: 0.95 + r() * 0.2, snow: 0.38, sag: 0.3, r0: 0.05, phase: windPhase + r(), tipLift: L * 0.12 * r(),
      });
    }
  }
}

export function buildPine(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const H = v.H;
  const phase0 = r() * 6.28;
  // trunk path with a gentle curve; windswept variants lean toward +x
  const tx = (y) => Math.sin(y / H * 2.0 + phase0) * v.bend * 0.45 * (y / H) + v.lean * Math.pow(y / H, 2) * (v.wind ? 2.0 : 1.0);
  const tz = (y) => Math.cos(y / H * 1.7 + phase0) * v.bend * 0.35 * (y / H);
  const sides = [8, 5, 4][lod];
  const nRings = lod === 0 ? 14 : lod === 1 ? 6 : 3;
  const pts = [];
  for (const y of trunkHeights(nRings, H * 0.985)) pts.push([tx(y), y, tz(y)]);
  const rad0 = 0.14 + H * 0.0095;
  if (lod === 0) b.uvOverride = NEEDLE_UV.solid; // textured program: solid parts point at an opaque texel
  const trunkV0 = b.vcount;
  tube(b, pts, (i, t) => (rad0 * Math.pow(1 - t, 0.75) + 0.03) * (1 + 0.6 * Math.exp(-(pts[i][1] + 0.4) / 0.8)),
    (i, t, k) => {
      const hh = Math.min(1, Math.max(0, (t - 0.32) / 0.28));
      const base = mixRGB(PAL.barkLow, PAL.barkMid, Math.min(1, t * 2));
      const c = mixRGB(base, PAL.barkHigh, hh);
      const n = 0.82 + 0.3 * Math.abs(Math.sin(i * 2.3 + k * 1.9 + v.seed));
      return [c[0] * n, c[1] * n, c[2] * n];
    }, { sides, rng: r, jitter: lod === 0 ? 0.3 : 0, snowRing: [0.95, 0.25] });
  b.tint(trunkV0, (x, y) => 0.6 + 0.4 * Math.min(1, (y + 0.4) / 2.5));

  const padV0 = b.vcount;
  const padT0 = b.tcount;
  const crownBase = H * v.base;
  const biasX = v.wind ? 1.4 : 0; // windswept: crown pushed downwind
  const nPads = lod === 2 ? Math.max(3, v.pads - 3) : v.pads;
  for (let i = 0; i < nPads; i++) {
    const f = nPads > 1 ? i / (nPads - 1) : 0;
    const y = crownBase + (H * 0.97 - crownBase) * (0.1 + 0.9 * f) + (r() - 0.5) * 1.2;
    const th = r() * 6.28;
    const reach = (i === nPads - 1 ? 0.2 : 1) * v.spread * (0.55 + 0.45 * (1 - f * 0.8)) * (0.7 + r() * 0.6);
    const sx = tx(y), sz = tz(y);
    const ex = sx + Math.cos(th) * reach + biasX * f, ez = sz + Math.sin(th) * reach;
    const ey = y + 0.5 + reach * (0.15 + r() * 0.25);
    const R = (1.2 + r() * 0.9) * (0.8 + 0.4 * (1 - f)) * (v.H / 20 + 0.55);
    const phase = r() * 6.28;
    if (lod === 0) {
      // limb: curves out and up from the trunk
      const mid = [(sx + ex) * 0.5, y + (ey - y) * 0.35 - 0.1, (sz + ez) * 0.5];
      const limbV0 = b.vcount;
      tube(b, [[sx, y, sz], mid, [ex, ey, ez]], (k, t) => 0.085 * (1 - t * 0.7) + 0.02, () => PAL.limb,
        { sides: 5, rng: r, snowFn: (ny) => (ny > 0.45 ? 0.6 : 0), flex: (t) => t * 0.5, phase });
      b.tint(limbV0, 0.9);
    }
    addPad(b, r, ex, ey, ez, R, lod, phase, (r() - 0.5) * 0.6);
    // second smaller pad beside the first on the same limb for a clustered, irregular look
    if (lod < 2 && i % 2 === 0) {
      const th2 = th + (r() - 0.5) * 2;
      addPad(b, r, ex + Math.cos(th2) * R * 0.9, ey - R * 0.25 - r() * 0.5, ez + Math.sin(th2) * R * 0.9, R * 0.6, lod, phase, 0);
    }
  }
  b.smooth(padV0, padT0, softBall(tx(H * 0.8), crownBase + (H - crownBase) * 0.4, tz(H * 0.8), 0.45, 0.35));
  b.tint(padV0, (x, y, z) => {
    const d = Math.hypot(x - tx(y), z - tz(y));
    return 0.6 + 0.4 * Math.min(1, d / (v.spread * 0.7));
  });
  return { geometry: b.toGeometry(), height: H * 1.02, radius: v.spread + 2.4, trunkR: Math.max(0.22, rad0 * 1.05) };
}
