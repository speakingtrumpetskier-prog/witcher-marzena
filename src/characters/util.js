// Small shared helpers for the characters module: seeded random, color, easing, math.
// Public: rng(seed), hashStr(s), col(hex|Color), mixCol, clamp, lerp, smooth, smoothstep, sat, DEG,
// noise1, pnoise (periodic around a ring), noise3.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smooth = (t) => t * t * (3 - 2 * t);

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// mulberry32: small, fast, good enough for look variation.
export function rng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  return f;
}

// Colors: sRGB hex in, linear THREE.Color out (ColorManagement converts on set).
export function col(c) {
  if (c && c.isColor) return c.clone();
  return new THREE.Color(c);
}
export function mixCol(a, b, t) {
  return col(a).lerp(col(b), t);
}
// Multiply brightness of a color (linear space), returns new Color.
export function shade(c, k) {
  return col(c).multiplyScalar(k);
}
// Shift a color toward grey (wear / fading).
export function fade(c, k) {
  const a = col(c);
  const g = (a.r + a.g + a.b) / 3;
  return a.lerp(new THREE.Color(g, g, g), k);
}

// 1D value noise for build-time variation (deterministic).
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 17.13) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}
// Periodic noise around a ring: angle th wraps seamlessly at 0 / 2PI (freq ~ features per turn).
export function pnoise(th, freq, off = 0, seed = 0) {
  const r = freq / Math.PI;
  return (noise1(Math.cos(th) * r + off, seed) + noise1(Math.sin(th) * r - off * 0.7 + 11.3, seed + 7)) * 0.5;
}
export function noise3(x, y, z, seed = 0) {
  return (noise1(x * 1.0 + y * 3.1 + z * 5.7, seed) + noise1(y * 1.3 - z * 2.3 + x * 0.7, seed + 3) * 0.6) / 1.6;
}
