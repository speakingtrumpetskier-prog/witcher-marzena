// Parallel height-grid generation with a small pool of module Web Workers.
// Near grid (gameplay heights + shader masks) is scheduled first so World.build can resolve
// as soon as it lands; the far grid (mountain horizon) keeps computing in the background and
// is awaited by Terrain.init.
//
//   const job = startGridJobs({ res, half, farRes, farHalf, onProgress })
//   const { grid, mask } = await job.near;     // Float32Array res*res, Uint8Array res*res*4
//   const { grid } = await job.far;            // Float32Array farRes*farRes (inner box = NaN)
// Falls back to the main thread (with yielding) if workers are unavailable.
import { computeHeight } from '../heightfield.js';

export const FAR = { half: 4000, res: 1281 }; // 6.25 m cells, aligned with the 1.5625 m near grid

function workerCount() {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(2, Math.min(6, hc - 1));
}

export function mainThreadJobs({ res, half, farRes, farHalf, onProgress }) {
  const info = { roadD: 0, roadHalf: 0, sd: 0, riverD: 0 };
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const near = (async () => {
    const grid = new Float32Array(res * res), mask = new Uint8Array(res * res * 4);
    const cell = (half * 2) / (res - 1);
    let t = performance.now();
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const o = j * res + i;
        grid[o] = computeHeight(-half + i * cell, z, info);
        mask[o * 4] = c255((info.roadD / 16 + 0.5) * 255);
        mask[o * 4 + 1] = c255(info.roadHalf * 32);
        mask[o * 4 + 2] = c255(((info.sd + 32) / 96) * 255);
        mask[o * 4 + 3] = c255((info.riverD / 40) * 255);
      }
      if (performance.now() - t > 30) { onProgress?.(j / res); await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
    }
    return { grid, mask };
  })();
  const far = near.then(async () => {
    const grid = new Float32Array(farRes * farRes).fill(NaN);
    const cell = (farHalf * 2) / (farRes - 1);
    let t = performance.now();
    for (let j = 0; j < farRes; j++) {
      const z = -farHalf + j * cell;
      for (let i = 0; i < farRes; i++) {
        const x = -farHalf + i * cell;
        if (Math.abs(x) <= half && Math.abs(z) <= half) continue;
        grid[j * farRes + i] = computeHeight(x, z);
      }
      if (performance.now() - t > 30) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
    }
    return { grid };
  });
  return { near, far, workers: 0 };
}

export function startGridJobs({ res, half, farRes = FAR.res, farHalf = FAR.half, onProgress }) {
  let workers;
  try {
    if (typeof Worker === 'undefined') throw new Error('no Worker');
    const n = workerCount();
    workers = [];
    for (let k = 0; k < n; k++) workers.push(new Worker(new URL('./heightWorker.js', import.meta.url), { type: 'module' }));
  } catch (e) {
    console.warn('[terrain] workers unavailable, building heights on the main thread', e);
    return mainThreadJobs({ res, half, farRes, farHalf, onProgress });
  }

  const nearGrid = new Float32Array(res * res);
  const nearMask = new Uint8Array(res * res * 4);
  const farGrid = new Float32Array(farRes * farRes).fill(NaN);
  const tasks = [];
  const NEAR_ROWS = 24, FAR_ROWS = 40;
  for (let j = 0; j < res; j += NEAR_ROWS) tasks.push({ kind: 'near', res, half, j0: j, j1: Math.min(res, j + NEAR_ROWS) });
  for (let j = 0; j < farRes; j += FAR_ROWS) tasks.push({ kind: 'far', res: farRes, half: farHalf, j0: j, j1: Math.min(farRes, j + FAR_ROWS), inner: half });
  const nearTotal = tasks.filter((t) => t.kind === 'near').length;
  let nearDone = 0, farDone = 0, next = 0, failed = null;
  const farTotal = tasks.length - nearTotal;

  let resolveNear, rejectNear, resolveFar, rejectFar;
  const near = new Promise((res2, rej) => { resolveNear = res2; rejectNear = rej; });
  const far = new Promise((res2, rej) => { resolveFar = res2; rejectFar = rej; });
  // The far promise is optional for callers; avoid unhandled rejections if nobody awaits it.
  far.catch(() => {});

  const finishAll = () => { for (const w of workers) w.terminate(); };
  const feed = (w) => {
    if (failed || next >= tasks.length) return;
    const t = tasks[next];
    t.id = next++;
    w.postMessage(t);
  };
  for (const w of workers) {
    w.onmessage = (e) => {
      const m = e.data;
      if (m.kind === 'near') {
        nearGrid.set(m.h, m.j0 * res);
        nearMask.set(m.mask, m.j0 * res * 4);
        nearDone++;
        onProgress?.(nearDone / nearTotal);
        if (nearDone === nearTotal) resolveNear({ grid: nearGrid, mask: nearMask });
      } else {
        farGrid.set(m.h.subarray(0, (m.j1 - m.j0) * farRes), m.j0 * farRes);
        // Keep NaN in the skipped inner box (worker leaves zeros there).
        const cell = (farHalf * 2) / (farRes - 1);
        for (let j = m.j0; j < m.j1; j++) {
          const z = -farHalf + j * cell;
          if (Math.abs(z) > half) continue;
          for (let i = 0; i < farRes; i++) if (Math.abs(-farHalf + i * cell) <= half) farGrid[j * farRes + i] = NaN;
        }
        farDone++;
        if (farDone === farTotal) { resolveFar({ grid: farGrid }); finishAll(); }
      }
      feed(w);
    };
    w.onerror = (e) => {
      failed = e;
      e.preventDefault?.();
      finishAll();
      rejectNear(new Error(`height worker failed: ${e.message || 'unknown'}`));
      rejectFar(new Error('height worker failed'));
    };
    feed(w);
  }
  return { near, far, workers: workers.length };
}
