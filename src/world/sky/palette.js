// Time-of-day look for clear weather, as keyframes over the 24 hour clock, plus the weather
// modifiers. Values are linear scene radiance at the key's exposure, calibrated backwards from
// target display colors through the ACES curve used in PostFX (e.g. sunlit noon snow #F3F1EC,
// snow in shadow #8FA6C4, golden-hour sky #4F7FC0, night sky #141A33, moonlit snow #4A5D85).
//
//   samplePalette(hours, out)  fills `out` (from createLook()) with the blended clear look.
//   applyWeather(look, w)      bends a look toward overcast, snow, blizzard or fog from the
//                              blended weather parameters (Weather.js `params`).
//
// Fields: key (key light chromaticity, sRGB hex) and keyI (its intensity: the sun by day, the
// moon by night). zen/hor: sky zenith and horizon. fog/fogSun: fog in-scatter away from and
// toward the sun. glow: sky glow around the sun. hemiSky/hemiGround: extra ambient radiance from
// above (sky) and below (snow bounce). ovc: overcast deck radiance. exp: exposure. Grade (display
// space): lift (shadow tint, hex), gain (highlight tint, hex), sat, tint (white balance).
import * as THREE from 'three';

const NIGHT = {
  key: '#94b8ff', keyI: 0.3,
  zen: [0.005, 0.009, 0.02], hor: [0.009, 0.015, 0.028],
  fog: [0.010, 0.016, 0.029], fogSun: [0.011, 0.017, 0.030], glow: [0, 0, 0],
  hemiSky: [0.006, 0.008, 0.013], hemiGround: [0.012, 0.016, 0.026], ovc: [0.006, 0.007, 0.010],
  exp: 2.6, lift: '#081a34', gain: '#d2e4ff', sat: 0.86, tint: [0.94, 1.0, 1.05],
};

const KEYS = [
  { h: 0.0, ...NIGHT },
  { h: 5.0, ...NIGHT },
  { h: 6.2, key: '#8fa4e8', keyI: 0.12,
    zen: [0.009, 0.022, 0.058], hor: [0.03, 0.04, 0.07], fog: [0.024, 0.035, 0.062], fogSun: [0.075, 0.05, 0.07], glow: [0.06, 0.035, 0.045],
    hemiSky: [0.004, 0.006, 0.012], hemiGround: [0.010, 0.012, 0.020], ovc: [0.020, 0.022, 0.030],
    exp: 2.0, lift: '#0b1434', gain: '#e8e6ff', sat: 0.95, tint: [0.97, 1.0, 1.05] },
  { h: 6.95, key: '#ff8a5a', keyI: 4,
    zen: [0.03, 0.065, 0.17], hor: [0.14, 0.14, 0.17], fog: [0.1, 0.118, 0.17], fogSun: [0.65, 0.32, 0.2], glow: [0.75, 0.36, 0.24],
    hemiSky: [0.012, 0.016, 0.03], hemiGround: [0.04, 0.035, 0.045], ovc: [0.09, 0.09, 0.11],
    exp: 1.4, lift: '#101438', gain: '#ffe8e0', sat: 1.05, tint: [1.03, 1.0, 0.98] },
  { h: 8.0, key: '#ffc890', keyI: 15,
    zen: [0.06, 0.155, 0.44], hor: [0.6, 0.68, 0.84], fog: [0.56, 0.66, 0.86], fogSun: [1.3, 0.85, 0.55], glow: [1.0, 0.6, 0.4],
    hemiSky: [0.025, 0.035, 0.065], hemiGround: [0.26, 0.21, 0.17], ovc: [0.42, 0.44, 0.5],
    exp: 0.47, lift: '#0e1638', gain: '#fff0e6', sat: 1.06, tint: [1.02, 1.0, 0.97] },
  { h: 10.0, key: '#ffe6c4', keyI: 17.5,
    zen: [0.07, 0.19, 0.52], hor: [0.78, 0.9, 1.15], fog: [0.74, 0.88, 1.15], fogSun: [1.5, 1.38, 1.18], glow: [0.8, 0.72, 0.6],
    hemiSky: [0.03, 0.045, 0.08], hemiGround: [0.42, 0.40, 0.37], ovc: [0.52, 0.56, 0.63],
    exp: 0.4, lift: '#0c1636', gain: '#fff8f0', sat: 1.06, tint: [1.0, 1.0, 1.0] },
  { h: 12.0, key: '#ffeccc', keyI: 18,
    zen: [0.07, 0.19, 0.53], hor: [0.8, 0.93, 1.18], fog: [0.76, 0.9, 1.18], fogSun: [1.45, 1.4, 1.26], glow: [0.8, 0.75, 0.66],
    hemiSky: [0.03, 0.045, 0.08], hemiGround: [0.45, 0.43, 0.40], ovc: [0.56, 0.6, 0.68],
    exp: 0.38, lift: '#0c1636', gain: '#fffaf4', sat: 1.06, tint: [1.0, 1.0, 1.0] },
  { h: 14.0, key: '#ffe2bc', keyI: 17.5,
    zen: [0.07, 0.185, 0.52], hor: [0.78, 0.9, 1.15], fog: [0.74, 0.88, 1.15], fogSun: [1.6, 1.38, 1.12], glow: [0.85, 0.72, 0.55],
    hemiSky: [0.03, 0.045, 0.08], hemiGround: [0.42, 0.39, 0.35], ovc: [0.52, 0.56, 0.62],
    exp: 0.4, lift: '#0c1636', gain: '#fff6ec', sat: 1.07, tint: [1.01, 1.0, 0.99] },
  { h: 15.3, key: '#ffbe66', keyI: 17,
    zen: [0.07, 0.18, 0.50], hor: [0.58, 0.7, 0.94], fog: [0.54, 0.68, 0.96], fogSun: [1.5, 1.06, 0.56], glow: [0.9, 0.6, 0.3],
    hemiSky: [0.03, 0.04, 0.07], hemiGround: [0.34, 0.27, 0.19], ovc: [0.50, 0.50, 0.56],
    exp: 0.46, lift: '#0e1636', gain: '#fff2e2', sat: 1.1, tint: [1.03, 1.0, 0.93] },
  { h: 16.2, key: '#ffaa4c', keyI: 17,
    zen: [0.06, 0.15, 0.42], hor: [0.46, 0.54, 0.74], fog: [0.42, 0.52, 0.78], fogSun: [1.45, 0.82, 0.34], glow: [1.0, 0.55, 0.22],
    hemiSky: [0.025, 0.035, 0.06], hemiGround: [0.25, 0.18, 0.12], ovc: [0.36, 0.35, 0.40],
    exp: 0.53, lift: '#101638', gain: '#ffeedd', sat: 1.14, tint: [1.04, 1.0, 0.91] },
  { h: 16.75, key: '#ff9440', keyI: 15,
    zen: [0.04, 0.09, 0.27], hor: [0.26, 0.29, 0.42], fog: [0.21, 0.26, 0.42], fogSun: [1.0, 0.46, 0.17], glow: [1.0, 0.45, 0.15],
    hemiSky: [0.02, 0.028, 0.05], hemiGround: [0.12, 0.08, 0.06], ovc: [0.22, 0.21, 0.25],
    exp: 0.8, lift: '#121640', gain: '#ffe8d0', sat: 1.15, tint: [1.05, 1.0, 0.94] },
  { h: 17.15, key: '#ff6a38', keyI: 2,
    zen: [0.02, 0.055, 0.15], hor: [0.085, 0.095, 0.15], fog: [0.038, 0.058, 0.105], fogSun: [0.45, 0.2, 0.09], glow: [0.7, 0.3, 0.1],
    hemiSky: [0.008, 0.015, 0.028], hemiGround: [0.03, 0.026, 0.033], ovc: [0.10, 0.10, 0.12],
    exp: 1.15, lift: '#0c1834', gain: '#f6f0ff', sat: 1.05, tint: [0.99, 1.0, 1.03] },
  { h: 17.7, key: '#8fa4e8', keyI: 0,
    zen: [0.009, 0.024, 0.065], hor: [0.026, 0.04, 0.075], fog: [0.014, 0.024, 0.048], fogSun: [0.07, 0.045, 0.06], glow: [0.08, 0.04, 0.03],
    hemiSky: [0.0035, 0.0065, 0.012], hemiGround: [0.009, 0.013, 0.02], ovc: [0.025, 0.027, 0.034],
    exp: 1.8, lift: '#081834', gain: '#e4ecff', sat: 1.0, tint: [0.97, 1.0, 1.05] },
  { h: 18.6, ...NIGHT, exp: 2.4, hor: [0.011, 0.017, 0.031], fog: [0.012, 0.018, 0.031] },
  { h: 20.0, ...NIGHT },
];

const HEX_FIELDS = ['key', 'lift', 'gain'];
const VEC_FIELDS = ['zen', 'hor', 'fog', 'fogSun', 'glow', 'hemiSky', 'hemiGround', 'ovc', 'tint'];
const COLOR_FIELDS = [...HEX_FIELDS, ...VEC_FIELDS];
const NUM_FIELDS = ['keyI', 'exp', 'sat'];

const PREP = KEYS.map((k) => {
  const o = { h: k.h };
  for (const f of HEX_FIELDS) o[f] = new THREE.Color(k[f]);
  for (const f of VEC_FIELDS) o[f] = new THREE.Color().setRGB(k[f][0], k[f][1], k[f][2]);
  for (const f of NUM_FIELDS) o[f] = k[f];
  return o;
});
PREP.push({ ...PREP[0], h: 24 });

export function createLook() {
  const o = {};
  for (const f of COLOR_FIELDS) o[f] = new THREE.Color();
  for (const f of NUM_FIELDS) o[f] = 0;
  return o;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function samplePalette(hours, out) {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < PREP.length - 2 && PREP[i + 1].h <= h) i++;
  const a = PREP[i], b = PREP[i + 1];
  const t = smooth((h - a.h) / Math.max(b.h - a.h, 1e-4));
  for (const f of COLOR_FIELDS) out[f].copy(a[f]).lerp(b[f], t);
  for (const f of NUM_FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;
  return out;
}

const _c = new THREE.Color();
const _g = new THREE.Color();
const COLD = new THREE.Color(0.94, 0.98, 1.06);

function towardGrey(c, amount, tint = COLD) {
  const l = c.r * 0.25 + c.g * 0.6 + c.b * 0.15;
  _g.setRGB(l * tint.r, l * tint.g, l * tint.b);
  c.lerp(_g, amount);
}

// Weather bends the clear look. `w` fields (blended by Weather.js): overcast 0..1 (cloud deck),
// sunVis 0..1 (direct light kept), fogWhite 0..1 (milky air), dim 0..1 (heavy snow darkening),
// satMul (saturation).
export function applyWeather(look, w) {
  const ov = w.overcast;
  look.keyI *= w.sunVis;
  // Under a deck the sky is the deck: flat, cold grey, brightness following the time of day.
  // Heavy overhead, lighter toward the horizon.
  const deck = _c.copy(look.ovc).multiplyScalar(1 - 0.45 * w.dim);
  look.zen.lerp(_g.copy(deck).multiplyScalar(0.62), ov);
  look.hor.lerp(_g.copy(deck).multiplyScalar(1.05), ov);
  look.glow.multiplyScalar(1 - ov * 0.85);
  look.fog.lerp(deck, ov * 0.9);
  look.fogSun.lerp(look.fog, ov * 0.85);
  if (w.fogWhite > 0) {
    towardGrey(look.fog, w.fogWhite * 0.7);
    towardGrey(look.fogSun, w.fogWhite * 0.6);
  }
  // Ambient follows the deck (the environment map is rebuilt from it); a little extra fill keeps
  // forms readable in flat light.
  look.hemiSky.lerp(_c.copy(look.ovc).multiplyScalar(0.3), ov);
  look.hemiGround.lerp(_c.copy(look.ovc).multiplyScalar(0.45), ov);
  // Fog and mist cool the light: the sun reaches through as a pale disk, not a golden key.
  if (w.fogWhite > 0) {
    look.key.lerp(_g.setRGB(1, 0.97, 0.92), w.fogWhite * 0.6);
    look.tint.lerp(_g.setRGB(0.97, 1.0, 1.04), w.fogWhite * 0.6);
  }
  look.sat *= w.satMul;
  look.exp *= 1 - ov * 0.14 + w.dim * 0.3;
  look.tint.lerp(_g.setRGB(0.98, 1.0, 1.03), ov * 0.7);
  look.gain.lerp(_g.setRGB(0.93, 0.96, 1.0), ov * 0.6);
}
