// Web Worker: evaluates computeHeight over row bands of the near grid (plus shader masks) and
// of the far grid. Driven by gridBuilder.js. Pure math, no DOM.
//
// Messages in:  { id, kind: 'near', res, half, j0, j1 }
//               { id, kind: 'normals', grid, n, cell, r1, r2 }  -> { out: Uint8Array }
//               { id, kind: 'far', res, half, j0, j1, inner }   (skips |x|,|z| <= inner)
// Messages out: { id, kind, j0, j1, h: Float32Array, mask?: Uint8Array, ms }
import { computeHeight } from '../heightfield.js';
import { normalData } from './normals.js';

const info = { roadD: 0, roadHalf: 0, sd: 0, riverD: 0 };
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

self.onmessage = (e) => {
  const t0 = performance.now();
  const { id, kind, res, half, j0, j1 } = e.data;
  if (kind === 'normals') {
    const { grid, n, cell, r1, r2 } = e.data;
    const out = normalData(grid, n, cell, r1, r2);
    self.postMessage({ id, kind, out, ms: performance.now() - t0 }, [out.buffer]);
    return;
  }
  const cell = (half * 2) / (res - 1);
  const rows = j1 - j0;
  const h = new Float32Array(rows * res);
  if (kind === 'near') {
    // Mask: R signed road centerline distance (-8..8 m), G road half width (x32), B lake SDF (-32..64 m),
    // A river centerline distance (0..40 m).
    const mask = new Uint8Array(rows * res * 4);
    for (let j = j0; j < j1; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const o = (j - j0) * res + i;
        h[o] = computeHeight(-half + i * cell, z, info);
        mask[o * 4] = clamp255((info.roadD / 16 + 0.5) * 255);
        mask[o * 4 + 1] = clamp255(info.roadHalf * 32);
        mask[o * 4 + 2] = clamp255(((info.sd + 32) / 96) * 255);
        mask[o * 4 + 3] = clamp255((info.riverD / 40) * 255);
      }
    }
    self.postMessage({ id, kind, j0, j1, h, mask, ms: performance.now() - t0 }, [h.buffer, mask.buffer]);
  } else {
    const inner = e.data.inner;
    for (let j = j0; j < j1; j++) {
      const z = -half + j * cell;
      const zin = Math.abs(z) <= inner;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        if (zin && Math.abs(x) <= inner) continue;
        h[(j - j0) * res + i] = computeHeight(x, z);
      }
    }
    self.postMessage({ id, kind, j0, j1, h, ms: performance.now() - t0 }, [h.buffer]);
  }
};
