// Procedural frost for the screen-edge freezing effect. Built lazily the first time frost is
// used (about 40 ms), tileable, 512 x 512:
//   R: fern-like crystal branches   G: slow growth noise (front irregularity)   B: facet cells
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const S = 512;
let cached = null;

function drawFerns(ctx, r) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    let px = x, py = y;
    const steps = Math.max(2, Math.floor(len / 5));
    for (let i = 0; i < steps; i++) {
      ang += (r() - 0.5) * 0.25;
      const nx = px + Math.cos(ang) * 5, ny = py + Math.sin(ang) * 5;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * (w / 2.2)})`;
      ctx.lineWidth = w;
      // Draw wrapped copies so the texture tiles.
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (Math.min(px, nx) + ox > S + 4 || Math.max(px, nx) + ox < -4 || Math.min(py, ny) + oy > S + 4 || Math.max(py, ny) + oy < -4) continue;
        ctx.beginPath(); ctx.moveTo(px + ox, py + oy); ctx.lineTo(nx + ox, ny + oy); ctx.stroke();
      }
      if (depth > 0 && i > 0 && i % 2 === 0) {
        const side = (i / 2) % 2 === 0 ? 1 : -1;
        branch(nx, ny, ang + side * (0.9 + r() * 0.3), len * (0.25 + r() * 0.2) * (1 - i / steps), w * 0.6, depth - 1);
      }
      px = nx; py = ny;
    }
  };
  for (let i = 0; i < 70; i++) branch(r() * S, r() * S, r() * Math.PI * 2, 40 + r() * 90, 1.4 + r() * 0.8, 2);
}

export function getFrostTexture() {
  if (cached) return cached;
  const r = rng(404);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  drawFerns(ctx, r);
  const fern = ctx.getImageData(0, 0, S, S).data;

  // Facet cells: jittered grid Voronoi (tileable).
  const G = 10;
  const pts = new Float32Array(G * G * 3);
  for (let i = 0; i < G * G; i++) { pts[i * 3] = r(); pts[i * 3 + 1] = r(); pts[i * 3 + 2] = r(); }
  // Growth noise: tileable value noise on an 6 x 6 lattice, smoothstep interpolated.
  const L = 6;
  const lat = new Float32Array(L * L);
  for (let i = 0; i < L * L; i++) lat[i] = r();
  const vn = (u, v) => {
    const x = u * L, y = v * L;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => lat[((j % L + L) % L) * L + ((i % L + L) % L)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const gx = u * G, gy = v * G;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      let d1 = 9, d2 = 9, val = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ix = cx + i, iy = cy + j;
        const k = (((iy % G) + G) % G) * G + (((ix % G) + G) % G);
        const dx = ix + pts[k * 3] - gx, dy = iy + pts[k * 3 + 1] - gy;
        const dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; val = pts[k * 3 + 2]; } else if (dd < d2) d2 = dd;
      }
      const edge = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) * 4);
      const o = (y * S + x) * 4;
      data[o] = fern[o];
      data[o + 1] = Math.round((vn(u, v) * 0.7 + vn(u * 2 % 1, v * 2 % 1) * 0.3) * 255);
      data[o + 2] = Math.round((0.35 + 0.5 * val) * (0.6 + 0.4 * edge) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
