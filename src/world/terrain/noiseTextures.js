// Procedural noise textures shared by the terrain, ice and rock shaders (generated once).
//
//   smooth (256^2 RGBA8, repeat, mipmapped): r = tileable value-noise fbm (lattice 16, 32, 64
//     per tile), g = an independent fbm, ba = gradient of r (encoded, see NOISE_GLSL).
//   white  (256^2 RGBA8, repeat, nearest): four independent white-noise channels.
// One filtered fetch replaces several hash evaluations and the mip chain anti-aliases
// distant detail for free.
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const N = 256;
export const GRAD_K = 0.25; // encoded gradient = 0.5 + d(r)/d(texel) / GRAD_K * 0.5

let cache = null;

function tileNoise(r, period) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(N * N);
  const s = period / N;
  for (let y = 0; y < N; y++) {
    const fy = y * s, iy = Math.floor(fy), ty = fy - iy;
    const uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const y0 = iy % period, y1 = (iy + 1) % period;
    for (let x = 0; x < N; x++) {
      const fx = x * s, ix = Math.floor(fx), tx = fx - ix;
      const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const x0 = ix % period, x1 = (ix + 1) % period;
      const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
      out[y * N + x] = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
  }
  return out;
}

export function noiseTextures() {
  if (cache) return cache;
  const r = rng(90210);
  const fbm = (seed) => {
    const rr = rng(seed);
    const a = tileNoise(rr, 16), b = tileNoise(rr, 32), c = tileNoise(rr, 64);
    const o = new Float32Array(N * N);
    for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.55 + b[i] * 0.3 + c[i] * 0.15;
    return o;
  };
  const A = fbm(11), B = fbm(23);
  const sm = new Uint8Array(N * N * 4);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = y * N + x;
      const gx = (A[y * N + ((x + 1) % N)] - A[y * N + ((x + N - 1) % N)]) * 0.5;
      const gy = (A[((y + 1) % N) * N + x] - A[((y + N - 1) % N) * N + x]) * 0.5;
      sm[o * 4] = q(A[o]);
      sm[o * 4 + 1] = q(B[o]);
      sm[o * 4 + 2] = q(0.5 + (gx / GRAD_K) * 0.5);
      sm[o * 4 + 3] = q(0.5 + (gy / GRAD_K) * 0.5);
    }
  }
  const smooth = new THREE.DataTexture(sm, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  smooth.wrapS = smooth.wrapT = THREE.RepeatWrapping;
  smooth.magFilter = THREE.LinearFilter;
  smooth.minFilter = THREE.LinearMipmapNearestFilter;
  smooth.generateMipmaps = true;
  smooth.anisotropy = 4;
  smooth.needsUpdate = true;

  const wh = new Uint8Array(N * N * 4);
  for (let i = 0; i < wh.length; i++) wh[i] = Math.floor(r() * 256);
  const white = new THREE.DataTexture(wh, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  white.wrapS = white.wrapT = THREE.RepeatWrapping;
  white.magFilter = white.minFilter = THREE.NearestFilter;
  white.generateMipmaps = false;
  white.needsUpdate = true;
  cache = { smooth, white };
  return cache;
}

// GLSL helpers. Declare uMzNoise / uMzWhite and pass { uMzNoise, uMzWhite } uniforms.
// mzN(p): 4 channels of the smooth texture at world-scale coordinate p (16 lattice cells per
// unit of p / 16, i.e. features about 1/k meters for p = xz * k / 16).
export const NOISE_GLSL = /* glsl */ `
#ifndef MZ_NOISE_TEX
#define MZ_NOISE_TEX
uniform sampler2D uMzNoise;
uniform sampler2D uMzWhite;
// Value-noise-like sample with lattice spacing ~1/k meters: returns (a, b, dA/dx, dA/dz) in world units.
vec4 mzNoiseK(vec2 xz, float k) {
  vec4 t = texture(uMzNoise, xz * (k / 16.0));
  return vec4(t.r, t.g, (t.ba - 0.5) * (2.0 * ${GRAD_K.toFixed(4)} * 256.0 / 16.0) * k);
}
vec4 mzWhite(vec2 cell) {
  return texelFetch(uMzWhite, ivec2(mod(cell, 256.0)), 0);
}
// Sun glints on snow and frost: sparse micro facets with random orientation that flash when
// they mirror the light into the eye. Cells are about two pixels wide and snap to powers of
// two so the pattern is stable. World-space vectors; returns a specular multiplier.
float mzGlintW(vec3 wp, vec3 nW, vec3 lW, vec3 vW) {
  if (dot(nW, lW) <= 0.0) return 0.0;
  float dist = length(wp - cameraPosition);
  if (dist > 260.0) return 0.0;
  float lv = exp2(ceil(log2(max(0.012, dist * 0.0015))));
  vec2 c = wp.xz / lv;
  vec2 cell = floor(c);
  vec4 r = mzWhite(cell + vec2(floor(log2(lv)) * 37.0, 0.0));
  vec3 fn = normalize(nW + vec3(r.z - 0.5, 0.15, r.w - 0.5) * 1.25);
  float g = smoothstep(0.986, 0.9985, dot(fn, normalize(lW + vW)));
  vec2 f = fract(c) - 0.5 - (r.xy - 0.5) * 0.6;
  g *= smoothstep(0.32, 0.08, length(f)) * step(r.x, 0.22);
  return g * (1.0 - smoothstep(60.0, 260.0, dist));
}
#endif
`;
