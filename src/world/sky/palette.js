// Time-of-day look for clear weather, as keyframes over the 24 hour clock, plus the weather
// modifiers. Colors are written as sRGB hex for readability and converted to linear here.
// Intensities are relative radiance; exposure maps them to the screen (see PostFX grade).
//
//   samplePalette(hours, out)  fills `out` (from createLook()) with the blended clear look.
//   applyWeather(look, w)      bends a look toward overcast, snow, blizzard or fog from the
//                              blended weather parameters (Weather.js `params`).
import * as THREE from 'three';

// key: key light (sun by day, moon by night). zen/hor: sky gradient. fog/fogSun: fog color away
// from and toward the sun. hemiSky/hemiGround: ambient. glow: sky glow around the sun.
// lift/gain: grade (display space), sat: saturation, exp: exposure. ovc: overcast deck color.
const KEYS = [
  { h: 0.0, key: '#7f9cff', keyI: 0.16, zen: '#060b1e', hor: '#1a2647', skyI: 0.05, fog: '#1c2848', fogSun: '#1c2848', fogI: 0.052,
    hemiSky: '#3a5aa8', hemiGround: '#2a3a60', hemiI: 0.10, glow: '#20305a', glowI: 0.0,
    exp: 2.9, lift: '#0a1430', gain: '#d8e4ff', sat: 0.82, ovc: '#202838', ovcI: 0.05 },
  { h: 5.2, key: '#7f9cff', keyI: 0.14, zen: '#060b1e', hor: '#1a2647', skyI: 0.05, fog: '#1c2848', fogSun: '#22305a', fogI: 0.052,
    hemiSky: '#3a5aa8', hemiGround: '#2a3a60', hemiI: 0.10, glow: '#20305a', glowI: 0.0,
    exp: 2.9, lift: '#0a1430', gain: '#d8e4ff', sat: 0.82, ovc: '#202838', ovcI: 0.05 },
  { h: 6.2, key: '#8fa4e8', keyI: 0.06, zen: '#14245a', hor: '#5a6a9a', skyI: 0.16, fog: '#56648e', fogSun: '#b48aa0', fogI: 0.15,
    hemiSky: '#5a78c0', hemiGround: '#5a6488', hemiI: 0.22, glow: '#c88aa0', glowI: 0.12,
    exp: 2.2, lift: '#0a1230', gain: '#e8e4ff', sat: 0.9, ovc: '#3a4256', ovcI: 0.12 },
  { h: 6.9, key: '#ff9a62', keyI: 0.9, zen: '#2a4688', hor: '#c9a6b0', skyI: 0.42, fog: '#8a90b8', fogSun: '#ffb48a', fogI: 0.40,
    hemiSky: '#6c8ad0', hemiGround: '#b89a96', hemiI: 0.42, glow: '#ff9a6a', glowI: 0.6,
    exp: 1.55, lift: '#101838', gain: '#fff0e4', sat: 1.0, ovc: '#5a6070', ovcI: 0.28 },
  { h: 8.0, key: '#ffc28a', keyI: 4.2, zen: '#3466b8', hor: '#c8cfe0', skyI: 0.62, fog: '#a4b0cc', fogSun: '#ffd6a8', fogI: 0.58,
    hemiSky: '#6e92dc', hemiGround: '#d8c4b0', hemiI: 0.62, glow: '#ffc890', glowI: 0.75,
    exp: 1.08, lift: '#0c1430', gain: '#fff6ec', sat: 1.04, ovc: '#7c8492', ovcI: 0.48 },
  { h: 10.0, key: '#ffe4c8', keyI: 5.6, zen: '#2e64c0', hor: '#cdd8ea', skyI: 0.72, fog: '#b0bed6', fogSun: '#fbe6cc', fogI: 0.68,
    hemiSky: '#6c96e0', hemiGround: '#e4dcd0', hemiI: 0.70, glow: '#fff0dc', glowI: 0.65,
    exp: 0.98, lift: '#0a1430', gain: '#fffaf2', sat: 1.04, ovc: '#8c94a2', ovcI: 0.6 },
  { h: 12.0, key: '#fff0dc', keyI: 6.0, zen: '#2a62c4', hor: '#d2dcec', skyI: 0.76, fog: '#b4c2da', fogSun: '#f8ead6', fogI: 0.72,
    hemiSky: '#6a96e2', hemiGround: '#e8e2d8', hemiI: 0.72, glow: '#fff4e4', glowI: 0.6,
    exp: 0.96, lift: '#0a1430', gain: '#fffaf4', sat: 1.04, ovc: '#9098a6', ovcI: 0.64 },
  { h: 14.0, key: '#ffe2c0', keyI: 5.6, zen: '#2c60c0', hor: '#d0d6e6', skyI: 0.72, fog: '#b0bcd6', fogSun: '#fce2c4', fogI: 0.68,
    hemiSky: '#6a92e0', hemiGround: '#e6dccc', hemiI: 0.70, glow: '#ffe8cc', glowI: 0.7,
    exp: 0.98, lift: '#0a1430', gain: '#fff8ee', sat: 1.05, ovc: '#8a90a0', ovcI: 0.6 },
  { h: 15.3, key: '#ffc488', keyI: 5.2, zen: '#3060b8', hor: '#d8cfd8', skyI: 0.66, fog: '#a6b0d0', fogSun: '#ffd09a', fogI: 0.62,
    hemiSky: '#6a8ada', hemiGround: '#e8ccb0', hemiI: 0.62, glow: '#ffc080', glowI: 1.0,
    exp: 1.02, lift: '#0c1434', gain: '#fff0dc', sat: 1.1, ovc: '#827e8a', ovcI: 0.52 },
  { h: 16.2, key: '#ffa25a', keyI: 4.6, zen: '#2c50a4', hor: '#e2bca8', skyI: 0.56, fog: '#9aa0c8', fogSun: '#ffb46c', fogI: 0.54,
    hemiSky: '#6a80cc', hemiGround: '#e8b890', hemiI: 0.52, glow: '#ff9a50', glowI: 1.35,
    exp: 1.12, lift: '#101438', gain: '#ffe8d0', sat: 1.16, ovc: '#76707c', ovcI: 0.42 },
  { h: 16.75, key: '#ff7a3c', keyI: 2.8, zen: '#26438e', hor: '#e8a088', skyI: 0.44, fog: '#8c8cb8', fogSun: '#ff9a58', fogI: 0.44,
    hemiSky: '#6474bc', hemiGround: '#d89c80', hemiI: 0.42, glow: '#ff7a40', glowI: 1.5,
    exp: 1.3, lift: '#121438', gain: '#ffe0c8', sat: 1.18, ovc: '#6a626e', ovcI: 0.34 },
  { h: 17.15, key: '#ff6a40', keyI: 0.25, zen: '#1e3678', hor: '#c08aa0', skyI: 0.3, fog: '#6e74a6', fogSun: '#e88a70', fogI: 0.30,
    hemiSky: '#5a6cb8', hemiGround: '#8a7a9a', hemiI: 0.32, glow: '#e8805a', glowI: 0.9,
    exp: 1.6, lift: '#101438', gain: '#ffe4dc', sat: 1.12, ovc: '#4e4c5a', ovcI: 0.24 },
  { h: 17.7, key: '#8fa4e8', keyI: 0.03, zen: '#142660', hor: '#4e5e96', skyI: 0.17, fog: '#465488', fogSun: '#8c6c8c', fogI: 0.17,
    hemiSky: '#4a66b8', hemiGround: '#4a5684', hemiI: 0.22, glow: '#a0708a', glowI: 0.35,
    exp: 2.1, lift: '#0a1234', gain: '#e4e6ff', sat: 1.0, ovc: '#353a4c', ovcI: 0.14 },
  { h: 18.6, key: '#7f9cff', keyI: 0.12, zen: '#08102a', hor: '#1e2c52', skyI: 0.07, fog: '#20305a', fogSun: '#263460', fogI: 0.07,
    hemiSky: '#3a5aa8', hemiGround: '#2c3c64', hemiI: 0.12, glow: '#283860', glowI: 0.05,
    exp: 2.7, lift: '#0a1430', gain: '#d8e4ff', sat: 0.86, ovc: '#22283a', ovcI: 0.06 },
  { h: 20.0, key: '#7f9cff', keyI: 0.16, zen: '#060b1e', hor: '#1a2647', skyI: 0.05, fog: '#1c2848', fogSun: '#1c2848', fogI: 0.052,
    hemiSky: '#3a5aa8', hemiGround: '#2a3a60', hemiI: 0.10, glow: '#20305a', glowI: 0.0,
    exp: 2.9, lift: '#0a1430', gain: '#d8e4ff', sat: 0.82, ovc: '#202838', ovcI: 0.05 },
];

const COLOR_FIELDS = ['key', 'zen', 'hor', 'fog', 'fogSun', 'hemiSky', 'hemiGround', 'glow', 'lift', 'gain', 'ovc'];
const NUM_FIELDS = ['keyI', 'skyI', 'fogI', 'hemiI', 'glowI', 'exp', 'sat', 'ovcI'];

// Pre-convert to linear colors once.
const PREP = KEYS.map((k) => {
  const o = { h: k.h };
  for (const f of COLOR_FIELDS) o[f] = new THREE.Color(k[f]);
  for (const f of NUM_FIELDS) o[f] = k[f];
  return o;
});
// Wrap: append the first key at +24 h.
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

const _grey = new THREE.Color();
const _c = new THREE.Color();

function toGrey(c, amount, tint) {
  const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  _grey.setRGB(l * tint.r, l * tint.g, l * tint.b);
  c.lerp(_grey, amount);
}

const COLD_GREY = new THREE.Color(0.86, 0.93, 1.06);
const FOG_WHITE = new THREE.Color(0.94, 0.97, 1.03);

// Weather bends the clear look. `w` fields (all blended by Weather.js):
//   overcast 0..1 (cloud deck), sunVis 0..1 (direct light), fogWhite 0..1 (milky air),
//   dim 0..1 (overall darkening of heavy snow), satMul.
export function applyWeather(look, w) {
  const ov = w.overcast;
  // Direct light: the deck hides the sun; keep a whisper so forms still read.
  look.keyI *= w.sunVis;
  // Sky turns into a flat deck. The deck brightness follows the time of day.
  _c.copy(look.ovc).multiplyScalar(look.ovcI / Math.max(look.skyI, 1e-3));
  look.zen.lerp(_c, ov);
  look.hor.lerp(_c.multiplyScalar(1.12), ov);
  look.glowI *= 1 - ov * 0.85;
  // Fog: under a deck the horizon is a soft grey; no warm sun side.
  const fogTarget = _c.copy(look.ovc).multiplyScalar(look.ovcI * 1.1 / Math.max(look.fogI, 1e-3));
  look.fog.lerp(fogTarget, ov * 0.85);
  look.fogSun.lerp(look.fog, ov * 0.8);
  toGrey(look.fog, ov * 0.35, COLD_GREY);
  toGrey(look.fogSun, ov * 0.35, COLD_GREY);
  if (w.fogWhite > 0) {
    toGrey(look.fog, w.fogWhite * 0.6, FOG_WHITE);
    toGrey(look.fogSun, w.fogWhite * 0.5, FOG_WHITE);
  }
  // Ambient becomes more even (diffuse sky from all around) and slightly brighter to compensate
  // for the missing sun, as snow-covered overcast days are bright but flat.
  _c.copy(look.hemiSky).lerp(look.ovc, 0.5);
  toGrey(_c, 0.5, COLD_GREY);
  look.hemiSky.lerp(_c, ov * 0.85);
  look.hemiGround.lerp(look.hemiSky, ov * 0.6);
  look.hemiI *= 1 + ov * 0.9 * (1 - w.dim * 0.5);
  look.sat *= w.satMul;
  look.exp *= 1 + ov * 0.12 + w.dim * 0.15;
  look.gain.lerp(_c.setRGB(0.94, 0.97, 1.0), ov * 0.6);
}
