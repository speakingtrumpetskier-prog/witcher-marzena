// Procedural parchment. paperCanvas() paints a low resolution sheet (blotches, mottling, fibres,
// stains, burnt edges) that CSS scales up; grainURL() is a small tiled noise overlay that adds the
// high frequency tooth so the upscale never looks soft. Used by the journal, notes and the map.
import { createNoise } from '../core/Noise.js';
import { rng } from '../core/util.js';

const N = createNoise(4711);
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const cache = new Map();

// opts: seed, tone [r,g,b], edge 0..1 (burn strength), stain 0..1, spine (bool, darkens the centre)
export function paperCanvas(w, h, opts = {}) {
  const { seed = 1, tone = [222, 205, 164], edge = 0.7, stain = 1, spine = false } = opts;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const so = seed * 13.7;
  const m = Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = N.fbm2(x * 0.013 + so, y * 0.013, 4) * 0.42;
      const mo = N.fbm2(x * 0.07 + so, y * 0.07 + 9, 2) * 0.25;
      const fiber = N.noise2(x * 0.05 + so, y * 0.8) * 0.022;
      const st = Math.max(0, N.fbm2(x * 0.021 + so + 50, y * 0.021, 3) - 0.34) * 1.15 * stain;
      const e = 1 - sstep(0, 1, Math.min(x, y, w - 1 - x, h - 1 - y) / (0.12 * m));
      const burn = e * edge * (0.65 + 0.7 * (N.fbm2(x * 0.1 + so, y * 0.1, 2) * 0.5 + 0.5));
      const light = 1 + v * 0.11 + mo * 0.05 + fiber - st * 0.13 - burn * 0.2;
      const i = (y * w + x) * 4;
      d[i] = Math.min(255, tone[0] * light * (1 - burn * 0.06 + st * 0.02));
      d[i + 1] = Math.min(255, tone[1] * light * (1 - burn * 0.16 - st * 0.02));
      d[i + 2] = Math.min(255, tone[2] * light * (1 - burn * 0.3 - st * 0.07));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (spine) {
    const g = ctx.createLinearGradient(w * 0.42, 0, w * 0.58, 0);
    g.addColorStop(0, 'rgba(60,38,16,0)');
    g.addColorStop(0.5, 'rgba(60,38,16,0.42)');
    g.addColorStop(1, 'rgba(60,38,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // faint light gather at either side of the fold
    const g2 = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
    g2.addColorStop(0, 'rgba(255,240,205,0.07)');
    g2.addColorStop(0.42, 'rgba(255,240,205,0)');
    g2.addColorStop(0.58, 'rgba(255,240,205,0)');
    g2.addColorStop(1, 'rgba(255,240,205,0.07)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

// A tiled data URL of fine speckle and tooth, drawn once.
export function grainURL() {
  if (cache.has('grain')) return cache.get('grain');
  const s = 160;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const r = rng(99);
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const n = r();
    const dark = n < 0.5;
    const a = Math.pow(r(), 3) * (dark ? 0.2 : 0.14);
    img.data[i * 4] = dark ? 50 : 255;
    img.data[i * 4 + 1] = dark ? 32 : 245;
    img.data[i * 4 + 2] = dark ? 14 : 220;
    img.data[i * 4 + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  // a few long fibres
  ctx.strokeStyle = 'rgba(70,45,20,0.07)';
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    const x = r() * s, y = r() * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8);
    ctx.stroke();
  }
  const url = c.toDataURL('image/png');
  cache.set('grain', url);
  return url;
}

// A ragged-edged torn polygon for note sheets (CSS clip-path percentages).
export function tornClip(seed = 1, steps = 30, amp = 0.9) {
  const r = rng(seed * 7919);
  const pts = [];
  const side = (n, f) => { for (let i = 0; i < n; i++) pts.push(f(i / n)); };
  side(steps, (t) => [t * 100, r() * amp]);
  side(steps, (t) => [100 - r() * amp, t * 100]);
  side(steps, (t) => [100 - t * 100, 100 - r() * amp]);
  side(steps, (t) => [r() * amp, 100 - t * 100]);
  return `polygon(${pts.map((p) => `${p[0].toFixed(2)}% ${p[1].toFixed(2)}%`).join(',')})`;
}
