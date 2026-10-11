// Tileable procedural noise texture shared by the sky (clouds, aurora, moon), the snow drift
// sheets and post effects. Generated once on the CPU, cached.
//
//   getNoiseTexture() -> THREE.DataTexture (RepeatWrapping, linear, mipmapped), 256 x 256 RGBA:
//     R: gradient fbm, base period 4     G: gradient fbm, base period 8
//     B: gradient fbm, base period 16    A: billowy cellular (inverted Worley), period 8
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const SIZE = 256;
let cached = null;

function makeGradNoise(seed) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  // Periodic 2D gradient noise with lattice period `per`.
  return (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(xf), v = fade(yf);
    const h = (ix, iy) => perm[(perm[((ix % per) + per) % per] + (((iy % per) + per) % per)) & 255];
    const g = (ix, iy, dx, dy) => { const k = h(ix, iy); return gx[k] * dx + gy[k] * dy; };
    const n00 = g(xi, yi, xf, yf), n10 = g(xi + 1, yi, xf - 1, yf);
    const n01 = g(xi, yi + 1, xf, yf - 1), n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
    const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.4142;
  };
}

function fbm(noise, x, y, per, oct) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += noise(x * f, y * f, per * f) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

function makeWorley(seed, per) {
  const r = rng(seed);
  const pts = new Float32Array(per * per * 2);
  for (let i = 0; i < per * per; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const k = ((((cy % per) + per) % per) * per + (((cx % per) + per) % per)) * 2;
      const dx = cx + pts[k] - x, dy = cy + pts[k + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < d1) d1 = d;
    }
    return Math.sqrt(d1);
  };
}

export function getNoiseTexture() {
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const n1 = makeGradNoise(17), n2 = makeGradNoise(29), n3 = makeGradNoise(41);
  const w1 = makeWorley(7, 8), w2 = makeWorley(11, 16);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE, v = y / SIZE;
      const r = fbm(n1, u * 4, v * 4, 4, 5);
      const g = fbm(n2, u * 8, v * 8, 8, 4);
      const b = fbm(n3, u * 16, v * 16, 16, 3);
      const cell = 1 - Math.min(1, w1(u * 8, v * 8) * 1.35) * 0.65 - Math.min(1, w2(u * 16, v * 16) * 1.35) * 0.35;
      const o = (y * SIZE + x) * 4;
      data[o] = Math.max(0, Math.min(255, (r * 0.5 + 0.5) * 255));
      data[o + 1] = Math.max(0, Math.min(255, (g * 0.5 + 0.5) * 255));
      data[o + 2] = Math.max(0, Math.min(255, (b * 0.5 + 0.5) * 255));
      data[o + 3] = Math.max(0, Math.min(255, cell * 255));
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
