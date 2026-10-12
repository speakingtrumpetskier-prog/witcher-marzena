// Terrain normal and concavity texture data from a height grid (runs in the height workers;
// Terrain.js falls back to calling it on the main thread).
//   normalData(grid, n, cell, r1, r2) -> Uint8Array RGBA: rg normal xz, b small concavity
//   (+-2 m, box radius r1 texels), a large concavity (+-12 m, radius r2).
export function boxBlur(src, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < n; j++) {
    const row = j * n;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n; i++) {
      tmp[row + i] = sum * inv;
      sum += src[row + Math.min(n - 1, i + r + 1)] - src[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += tmp[Math.min(n - 1, Math.max(0, j)) * n + i];
    for (let j = 0; j < n; j++) {
      out[j * n + i] = sum * inv;
      sum += tmp[Math.min(n - 1, j + r + 1) * n + i] - tmp[Math.max(0, j - r) * n + i];
    }
  }
  return out;
}

// RGBA8: rg normal xz, b small concavity (+-2 m), a large concavity (+-12 m).
export function normalData(g, n, cell, r1, r2) {
  const out = new Uint8Array(n * n * 4);
  const b1 = boxBlur(g, n, r1), b2 = boxBlur(g, n, r2);
  const c = (v) => (v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0);
  for (let j = 0; j < n; j++) {
    const jl = Math.max(0, j - 1), jr = Math.min(n - 1, j + 1);
    for (let i = 0; i < n; i++) {
      const il = Math.max(0, i - 1), ir = Math.min(n - 1, i + 1);
      const o = j * n + i;
      const dx = (g[j * n + ir] - g[j * n + il]) / ((ir - il) * cell);
      const dz = (g[jr * n + i] - g[jl * n + i]) / ((jr - jl) * cell);
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      out[o * 4] = c((-dx * inv * 0.5 + 0.5) * 255);
      out[o * 4 + 1] = c((-dz * inv * 0.5 + 0.5) * 255);
      out[o * 4 + 2] = c(((b1[o] - g[o]) / 4 + 0.5) * 255);
      out[o * 4 + 3] = c(((b2[o] - g[o]) / 24 + 0.5) * 255);
    }
  }
  return out;
}

