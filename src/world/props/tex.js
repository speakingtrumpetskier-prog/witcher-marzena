// Procedural canvas textures for the props kit. Everything is drawn here, nothing is loaded.
// Each generator returns { map, bump } (CanvasTextures, cached by key). Textures are mid-tone
// neutrals meant to be multiplied by vertex colors, so one material serves many tints.
//
//   import { tex } from './tex.js';   const { map, bump } = tex.wood();
//
// Noise is tileable (periodic lattice) so every texture repeats without seams.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => {
  const t = c01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(ix, iy, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Periodic value noise in [0,1]; px, py are the lattice periods.
function vn(x, y, px, py, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const x0 = mod(ix, px), x1 = mod(ix + 1, px), y0 = mod(iy, py), y1 = mod(iy + 1, py);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbm(x, y, px, py, s, oct = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += vn(x, y, px, py, s + o * 31) * amp;
    norm += amp;
    x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
  }
  return sum / norm;
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// Per-pixel bake. fn(u, v, o) fills o.r/g/b (0..1) and o.h (0..1 height) and optionally o.a.
function bake(w, h, fn, { bump = true, alpha = false, srgb = true, repeat = true } = {}) {
  const cc = mkCanvas(w, h), cb = bump ? mkCanvas(w, h) : null;
  const gc = cc.getContext('2d'), gb = cb ? cb.getContext('2d') : null;
  const ic = gc.createImageData(w, h), ib = gb ? gb.createImageData(w, h) : null;
  const o = { r: 0, g: 0, b: 0, h: 0.5, a: 1 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o.a = 1; o.h = 0.5;
      fn(x / w, y / h, o, x, y);
      const i = (y * w + x) * 4;
      ic.data[i] = c01(o.r) * 255;
      ic.data[i + 1] = c01(o.g) * 255;
      ic.data[i + 2] = c01(o.b) * 255;
      ic.data[i + 3] = alpha ? c01(o.a) * 255 : 255;
      if (ib) {
        const hv = c01(o.h) * 255;
        ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = hv;
        ib.data[i + 3] = 255;
      }
    }
  }
  gc.putImageData(ic, 0, 0);
  if (gb) gb.putImageData(ib, 0, 0);
  return { map: toTex(cc, { srgb, repeat }), bump: cb ? toTex(cb, { srgb: false, repeat }) : null, canvas: cc };
}

const cache = new Map();
function memo(key, fn) {
  let v = cache.get(key);
  if (!v) { v = fn(); cache.set(key, v); }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Wood: grain runs along V. Weathered, silvered in patches, knots and cracks.
function genWood(seed, planks) {
  const S = 256;
  const nBoards = 4;
  const knots = [];
  for (let i = 0; i < 3; i++) knots.push({ u: hash(i, 1, seed), v: hash(i, 2, seed), r: 0.04 + hash(i, 3, seed) * 0.04 });
  return bake(S, S, (u, v, o) => {
    let ub = u, boardTint = 0;
    let vv = v;
    let seam = 0;
    if (planks) {
      const bi = Math.floor(u * nBoards);
      ub = u * nBoards - bi;
      boardTint = (hash(bi, 7, seed) - 0.5) * 0.28;
      vv = v + hash(bi, 9, seed);
      const e = Math.min(ub, 1 - ub);
      seam = 1 - sstep(0.0, 0.035, e);
    }
    // Knot swirl displaces the ring coordinate.
    let warp = 0, knotDark = 0;
    for (const k of knots) {
      let du = u - k.u, dv = v - k.v;
      du -= Math.round(du); dv -= Math.round(dv);
      const d2 = (du * du * 2.2 + dv * dv * 0.45) / (k.r * k.r);
      warp += Math.exp(-d2 * 0.6) * 0.9;
      knotDark = Math.max(knotDark, Math.exp(-d2 * 1.8));
    }
    const base = planks ? ub * 2.0 : u;
    const wob = fbm(u * 3, vv * 1, 3, 1, seed + 3, 3);
    const t = base * (planks ? 5 : 8) + wob * 3.2 + warp;
    const ring = 0.5 + 0.5 * Math.sin(t * TAU);
    const fibre = vn(u * 96, vv * 6, 96, 6, seed + 5);
    const fibre2 = vn(u * 220, vv * 18, 220, 18, seed + 7);
    const wear = fbm(u * 5, vv * 2.5, 5, 2, seed + 11, 4);
    const crackN = vn(u * 14, vv * 1.4, 14, 2, seed + 13);
    const crack = sstep(0.035, 0.0, Math.abs(crackN - 0.5)) * sstep(0.45, 0.62, vn(u * 4, vv * 2, 4, 2, seed + 17));
    const grain = ring * 0.55 + fibre * 0.3 + fibre2 * 0.15;
    // Warm brown with silvered weathering.
    let r = lerp(0.60, 0.40, grain) + boardTint * 0.5;
    let g = lerp(0.47, 0.29, grain) + boardTint * 0.4;
    let b = lerp(0.34, 0.20, grain) + boardTint * 0.3;
    const silver = sstep(0.45, 0.72, wear) * 0.55;
    r = lerp(r, 0.55, silver); g = lerp(g, 0.53, silver); b = lerp(b, 0.50, silver);
    const dark = Math.max(crack * 0.85, knotDark * 0.5, seam * 0.8);
    r *= 1 - dark * 0.75; g *= 1 - dark * 0.75; b *= 1 - dark * 0.7;
    o.r = r * 1.25; o.g = g * 1.25; o.b = b * 1.25;
    o.h = 0.62 + ring * 0.18 + fibre2 * 0.1 - crack * 0.5 - seam * 0.45 - knotDark * 0.1;
  });
}

// Bark: vertical furrows (V), dark grey brown. Used for log sides.
function genBark(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const f = fbm(u * 10 + fbm(u * 3, v * 2, 3, 2, seed) * 2, v * 2.2, 10, 2, seed + 1, 4);
    const ridge = 1 - Math.abs(f - 0.5) * 2;
    const fine = vn(u * 80, v * 12, 80, 12, seed + 4);
    const lichen = sstep(0.62, 0.78, fbm(u * 4, v * 3, 4, 3, seed + 9, 3));
    let r = lerp(0.20, 0.52, ridge * 0.8 + fine * 0.2);
    let g = lerp(0.16, 0.42, ridge * 0.8 + fine * 0.2);
    let b = lerp(0.12, 0.33, ridge * 0.8 + fine * 0.2);
    r = lerp(r, 0.55, lichen * 0.35); g = lerp(g, 0.58, lichen * 0.35); b = lerp(b, 0.48, lichen * 0.35);
    o.r = r * 1.1; o.g = g * 1.1; o.b = b * 1.1;
    o.h = ridge * 0.8 + fine * 0.2;
  });
}

// End grain: circular UV on cylinder caps (center 0.5,0.5). Rings, radial checks.
function genLogEnd(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const wob = vn(Math.cos(ang) * 2 + 4, Math.sin(ang) * 2 + 4, 8, 8, seed) * 0.5;
    const ring = 0.5 + 0.5 * Math.sin((d * 11 + wob) * TAU);
    const radial = vn(ang * 3 + 20, d * 4, 24, 8, seed + 2);
    const crack = sstep(0.04, 0, Math.abs(vn(Math.cos(ang * 3) * 3 + 9, d * 2, 16, 4, seed + 5) - 0.5)) * sstep(0.2, 0.9, d);
    const edge = sstep(0.86, 0.98, d);
    const heart = sstep(0.18, 0.0, d) * 0.5;
    let r = lerp(0.82, 0.60, ring * 0.7 + radial * 0.15) - heart * 0.18;
    let g = lerp(0.66, 0.44, ring * 0.7 + radial * 0.15) - heart * 0.16;
    let b = lerp(0.46, 0.28, ring * 0.7 + radial * 0.15) - heart * 0.12;
    const k = 1 - crack * 0.7 - edge * 0.45;
    o.r = r * k; o.g = g * k; o.b = b * k;
    o.h = 0.6 + ring * 0.1 - crack * 0.5;
  });
}

// Birch bark: white with black horizontal lenticel dashes and peeling curls.
function genBirch(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 6, v * 3, 6, 3, seed, 4);
    const dash = vn(u * 7, v * 38, 7, 38, seed + 3);
    const dashes = sstep(0.62, 0.7, dash) * sstep(0.35, 0.55, vn(u * 5, v * 6, 5, 6, seed + 6));
    const band = sstep(0.8, 0.9, vn(u * 3, v * 14, 3, 14, seed + 9)) * 0.5;
    const peel = sstep(0.68, 0.74, fbm(u * 4, v * 2.5, 4, 3, seed + 12, 3)) * 0.3;
    const w = 0.90 - n * 0.14 - peel * 0.12;
    const k = 1 - Math.min(1, dashes * 0.95 + band * 0.4);
    o.r = (w + 0.02) * k + 0.04; o.g = w * k + 0.04; o.b = (w - 0.03) * k + 0.04;
    o.h = 0.55 + n * 0.2 - dashes * 0.4;
  });
}

// Straw: dense fine strands along V, pale gold to brown.
function genStraw(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const strand = vn(u * 64, v * 3, 64, 3, seed);
    const strand2 = vn(u * 150, v * 7, 150, 7, seed + 2);
    const clump = fbm(u * 5, v * 2, 5, 2, seed + 4, 3);
    const gap = sstep(0.5, 0.05, strand2) * 0.5;
    const joint = sstep(0.93, 1.0, vn(u * 48, v * 9, 48, 9, seed + 6)) * 0.4;
    const tone = strand * 0.5 + strand2 * 0.2 + clump * 0.3;
    o.r = lerp(0.52, 0.93, tone) * (1 - gap * 0.6) * (1 - joint);
    o.g = lerp(0.38, 0.77, tone) * (1 - gap * 0.6) * (1 - joint);
    o.b = lerp(0.19, 0.45, tone) * (1 - gap * 0.6) * (1 - joint);
    o.h = strand * 0.5 + strand2 * 0.4 - gap * 0.6;
  });
}

// Rope / twine: diagonal twist along U (wrap around tube), V along the rope.
function genRope(seed) {
  const S = 128;
  return bake(S, S, (u, v, o) => {
    const t = (u * 3 + v * 4) % 1;
    const strand = 0.5 + 0.5 * Math.sin(t * TAU);
    const fuzz = vn(u * 80, v * 80, 80, 80, seed);
    const k = 0.45 + strand * 0.55;
    o.r = lerp(0.50, 0.80, k) * (0.85 + fuzz * 0.25);
    o.g = lerp(0.40, 0.68, k) * (0.85 + fuzz * 0.25);
    o.b = lerp(0.26, 0.46, k) * (0.85 + fuzz * 0.25);
    o.h = k;
  });
}

// Plain linen weave: pale cream with slubs.
function genLinen(seed, coarse = 1) {
  const S = 256;
  const f = 64 * coarse;
  return bake(S, S, (u, v, o) => {
    const wu = 0.5 + 0.5 * Math.sin(u * f * TAU), wv = 0.5 + 0.5 * Math.sin(v * f * TAU);
    const over = (Math.floor(u * f) + Math.floor(v * f)) % 2 === 0;
    const weave = over ? wu : wv;
    const slub = vn(u * 12, v * 90, 12, 90, seed) * 0.5 + vn(u * 90, v * 12, 90, 12, seed + 3) * 0.5;
    const stain = fbm(u * 4, v * 4, 4, 4, seed + 8, 4);
    const k = 0.80 + weave * 0.13 + (slub - 0.5) * 0.12 - (stain - 0.5) * 0.14;
    o.r = k; o.g = k * 0.985; o.b = k * 0.94;
    o.h = 0.4 + weave * 0.4 + slub * 0.2;
  });
}

// Burlap / sacking: coarse tan weave with dark flecks.
function genBurlap(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const f = 22;
    const wu = Math.abs(Math.sin(u * f * Math.PI)), wv = Math.abs(Math.sin(v * f * Math.PI));
    const hole = (1 - wu) * (1 - wv);
    const slub = vn(u * 10, v * 80, 10, 80, seed) * 0.5 + vn(u * 80, v * 10, 80, 10, seed + 2) * 0.5;
    const fleck = sstep(0.9, 1.0, vn(u * 60, v * 60, 60, 60, seed + 5));
    const stain = fbm(u * 3, v * 3, 3, 3, seed + 7, 4);
    const k = (0.62 + wu * 0.12 + wv * 0.12 + slub * 0.14) * (1 - hole * 0.45) * (1 - fleck * 0.5) * (0.85 + stain * 0.25);
    o.r = k * 1.02; o.g = k * 0.86; o.b = k * 0.62;
    o.h = 0.35 + (wu + wv) * 0.25 + slub * 0.15 - hole * 0.3;
  });
}

// Dress: white linen with red embroidery bands. V = 0 at hem, 1 at yoke. U wraps around.
function genDress(seed) {
  const W = 512, H = 512;
  const c = mkCanvas(W, H), g = c.getContext('2d');
  const lin = genLinen(seed, 1).canvas;
  g.drawImage(lin, 0, 0, W, H);
  g.globalAlpha = 0.9;
  // Flip so hem (V=0) is at the canvas bottom (canvas y grows down, V grows up).
  const red = '#9A2E22', redDark = '#74201a';
  const stitch = (x, y, s, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, s, s);
  };
  const S = 8;
  const rows = H / S, cols = W / S;
  const band = (rowFrom, rowTo, pat) => {
    for (let r = rowFrom; r < rowTo; r++) for (let q = 0; q < cols; q++) {
      const p = pat(q, r - rowFrom, rowTo - rowFrom);
      if (p) stitch(q * S + 1, (rows - 1 - r) * S + 1, S - 2, p === 2 ? redDark : red);
    }
  };
  // hem: deep rhomb band (rows 1..10 from bottom)
  band(1, 10, (q, r) => {
    const x = q % 10, y = r;
    const d = Math.abs(x - 4.5) + Math.abs(y - 4);
    return d < 1.2 ? 2 : d < 4.6 && Math.abs(d - 3.2) < 0.7 ? 1 : 0;
  });
  band(11, 12, () => 1);
  // zigzag above the hem
  band(12, 17, (q, r) => (Math.abs(((q % 8) - 4)) === r % 4 + 0 ? 1 : 0));
  band(18, 19, (q) => (q % 2 === 0 ? 1 : 0));
  // waist / yoke band near V ~ 0.8: small crosses
  band(46, 54, (q, r) => {
    const x = q % 8, y = r;
    return (Math.abs(x - 3.5) < 0.6 || Math.abs(y - 3.5) < 0.6) && ((x + y) % 2 === 0 || x === 3 || y === 3) ? 1 : 0;
  });
  band(56, 57, () => 1);
  band(44, 45, () => 1);
  g.globalAlpha = 1;
  // dirt at the hem
  const gr = g.createLinearGradient(0, H, 0, H * 0.7);
  gr.addColorStop(0, 'rgba(70,60,50,0.55)'); gr.addColorStop(1, 'rgba(70,60,50,0)');
  g.fillStyle = gr; g.fillRect(0, H * 0.7, W, H * 0.3);
  const t = toTex(c);
  return { map: t, bump: null, canvas: c };
}

// Weathered iron: dark blue-grey, rust blooms, scratches. Used with some metalness.
function genIron(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 6, v * 6, 6, 6, seed, 5);
    const rustMask = sstep(0.5, 0.72, fbm(u * 3, v * 3, 3, 3, seed + 4, 4));
    const pit = sstep(0.7, 0.9, vn(u * 70, v * 70, 70, 70, seed + 6));
    const scr = sstep(0.03, 0.0, Math.abs(vn(u * 4, v * 90, 4, 90, seed + 8) - 0.5)) * 0.4;
    let r = lerp(0.20, 0.34, n) , g = lerp(0.21, 0.35, n), b = lerp(0.24, 0.40, n);
    r = lerp(r, 0.52, rustMask * 0.7); g = lerp(g, 0.27, rustMask * 0.7); b = lerp(b, 0.14, rustMask * 0.7);
    const k = 1 - pit * 0.35 + scr * 0.5;
    o.r = r * k * 1.2; o.g = g * k * 1.2; o.b = b * k * 1.2;
    o.h = n * 0.6 + 0.2 - pit * 0.3;
  });
}

// Stone: speckled grey with moss-free chips.
function genStone(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 5, v * 5, 5, 5, seed, 5);
    const sp = vn(u * 90, v * 90, 90, 90, seed + 3);
    const vein = sstep(0.03, 0.0, Math.abs(fbm(u * 3, v * 3, 3, 3, seed + 6, 3) - 0.5));
    const k = 0.45 + n * 0.35 + (sp - 0.5) * 0.18 - vein * 0.15;
    o.r = k * 0.98; o.g = k; o.b = k * 1.03;
    o.h = n * 0.7 + sp * 0.3;
  });
}

// Fur / hide: streaky tan-grey with lighter tips.
function genFur(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const a = vn(u * 120, v * 12, 120, 12, seed);
    const b = vn(u * 40, v * 5, 40, 5, seed + 2);
    const patch = fbm(u * 4, v * 3, 4, 3, seed + 5, 3);
    const k = 0.42 + a * 0.25 + b * 0.18 + patch * 0.2;
    o.r = k * 1.02; o.g = k * 0.9; o.b = k * 0.76;
    o.h = a * 0.6 + b * 0.4;
  });
}

// Ice: pale blue with white internal cracks and bubbles. For crusts and frozen things.
function genIce(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 4, v * 4, 4, 4, seed, 4);
    const cr = sstep(0.045, 0.0, Math.abs(fbm(u * 5, v * 5, 5, 5, seed + 3, 3) - 0.5));
    const cr2 = sstep(0.03, 0.0, Math.abs(vn(u * 11, v * 11, 11, 11, seed + 9) - 0.5)) * 0.6;
    const bub = sstep(0.93, 1.0, vn(u * 40, v * 40, 40, 40, seed + 5));
    const k = 0.74 + n * 0.16 + Math.max(cr, cr2) * 0.3 + bub * 0.2;
    o.r = k * 0.80; o.g = k * 0.92; o.b = k * 1.0;
    o.h = 0.55 + n * 0.2 - cr * 0.4;
  });
}

// Snow: soft blue-white with fine sparkle grain.
function genSnow(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 6, v * 6, 6, 6, seed, 4);
    const sp = vn(u * 120, v * 120, 120, 120, seed + 3);
    const k = 0.9 + n * 0.1 + (sp > 0.93 ? 0.06 : 0);
    o.r = k * 0.96; o.g = k * 0.99; o.b = k;
    o.h = n * 0.8 + sp * 0.2;
  });
}

// Diamond fishing-net lattice with alpha. Mesh runs diagonally.
function genNet() {
  const S = 128;
  const c = mkCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#d6c3a0'; g.lineWidth = 2.6; g.lineCap = 'round';
  const n = 4, step = S / n;
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * step, S); g.lineTo(i * step + S, 0); g.stroke();
  }
  // knots
  g.fillStyle = '#b79b6a';
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = i * step, y = j * step;
    if ((i + j) % 2 === 0) { g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
  }
  const t = toTex(c);
  return { map: t, bump: null, canvas: c };
}

// Flaking paint: pale base with wear showing wood. Tint with vertex color to get any paint.
function genPaint(seed) {
  const S = 256;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 6, v * 6, 6, 6, seed, 4);
    const wearN = fbm(u * 4 + n, v * 4, 4, 4, seed + 5, 4);
    const chip = sstep(0.62, 0.72, wearN) * sstep(0.35, 0.65, vn(u * 24, v * 24, 24, 24, seed + 7));
    const brush = vn(u * 6, v * 90, 6, 90, seed + 9);
    const k = 0.80 + brush * 0.12 + (n - 0.5) * 0.14;
    const wood = 0.38 + vn(u * 70, v * 8, 70, 8, seed + 11) * 0.2;
    o.r = lerp(k, wood * 1.15, chip);
    o.g = lerp(k, wood * 0.85, chip);
    o.b = lerp(k, wood * 0.62, chip);
    o.h = 0.7 + brush * 0.1 - chip * 0.5;
  });
}

// Fish skin along U (head to tail): dark back at V ~ 0, silver flank, white belly at V ~ 1.
function genFish(seed) {
  const W = 128, H = 64;
  return bake(W, H, (u, v, o) => {
    const scale = vn(u * 40, v * 16, 40, 16, seed);
    const back = sstep(0.4, 0.0, v);
    const belly = sstep(0.65, 1.0, v);
    const sheen = 0.55 + scale * 0.25 + 0.2 * Math.sin(u * 30 + v * 12);
    const lat = sstep(0.04, 0.0, Math.abs(v - 0.42)) * 0.5;
    const r = lerp(lerp(sheen * 0.78, 0.18, back), 0.9, belly) * (1 - lat * 0.4);
    const g = lerp(lerp(sheen * 0.85, 0.24, back), 0.9, belly) * (1 - lat * 0.3);
    const b = lerp(lerp(sheen * 0.95, 0.30, back), 0.88, belly) * (1 - lat * 0.2);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + scale * 0.3;
  }, { repeat: false });
}

// Terracotta / glazed clay.
function genClay(seed) {
  const S = 128;
  return bake(S, S, (u, v, o) => {
    const n = fbm(u * 5, v * 5, 5, 5, seed, 4);
    const k = 0.55 + n * 0.4;
    o.r = k * 0.88; o.g = k * 0.55; o.b = k * 0.38;
    o.h = n;
  });
}

// ---------------------------------------------------------------------------------------------
// Folk textile atlas: 4 x 2 cells of cross-stitch style patterns in 1024 x 512.
// Cell order: 0 rhomb rug, 1 zigzag kilim, 2 star tapestry, 3 tooth-border runner,
//             4 plain grey wool with red edge, 5 brown-cream stripes, 6 blue-red hunting border, 7 black-red.
export const FOLK_CELLS = { cols: 4, rows: 2 };

function genFolk(seed) {
  const W = 1024, H = 512;
  const c = mkCanvas(W, H), g = c.getContext('2d');
  const CELL = 256, ST = 8, N = CELL / ST; // 32 stitches
  const pal = {
    red: '#9A2E22', darkRed: '#6e1f18', cream: '#d9cdb0', brown: '#4a3a2c', black: '#231d1a', blue: '#3E5A78',
    grey: '#8c8a84', ochre: '#b08a3c', white: '#ece6d6', green: '#4f5d3a',
  };
  const grid = (cx, cy, fn, ground) => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const col = fn(i, j) || ground;
      const jit = (hash(i + cx * 31, j + cy * 17, seed) - 0.5) * 0.14;
      g.fillStyle = shade(col, jit);
      g.fillRect(cx * CELL + i * ST, cy * CELL + j * ST, ST, ST);
      // stitch gap
      g.fillStyle = 'rgba(20,12,8,0.28)';
      g.fillRect(cx * CELL + i * ST, cy * CELL + j * ST + ST - 1.5, ST, 1.5);
      g.fillRect(cx * CELL + i * ST + ST - 1.5, cy * CELL + j * ST, 1.5, ST);
    }
  };
  const border = (i, j, w = 2) => (i < w || j < w || i >= N - w || j >= N - w);
  const rim = (i, j) => Math.min(i, j, N - 1 - i, N - 1 - j);
  const rh = (i, j, k) => Math.abs(((i % k) + k) % k - (k - 1) / 2) + Math.abs(((j % k) + k) % k - (k - 1) / 2);

  // 0: rhomb rug
  grid(0, 0, (i, j) => {
    if (rim(i, j) === 0 || rim(i, j) === 3) return pal.red;
    if (rim(i, j) < 3) return rim(i, j) === 1 ? pal.cream : pal.black;
    const d = rh(i - 4, j - 4, 8);
    if (d < 1.1) return pal.black;
    if (Math.abs(d - 3) < 0.6) return pal.red;
    if (Math.abs(d - 1.8) < 0.5) return pal.cream;
    return null;
  }, pal.brown);
  // 1: zigzag kilim, horizontal bands
  grid(1, 0, (i, j) => {
    const band = Math.floor(j / 6);
    const k = j % 6;
    if (band % 2 === 0) {
      const z = Math.abs((i % 8) - 4);
      return Math.abs(z - k) < 1 ? pal.red : k === 5 ? pal.cream : null;
    }
    return k === 2 || k === 3 ? (i % 4 < 2 ? pal.blue : pal.cream) : null;
  }, pal.black);
  // 2: eight-point star tapestry
  const star = [
    '....X....', '...XXX...', '.X..X..X.', '..XXXXX..', 'XXXXOXXXX', '..XXXXX..', '.X..X..X.', '...XXX...', '....X....',
  ];
  grid(2, 0, (i, j) => {
    if (rim(i, j) < 2) return rim(i, j) === 0 ? pal.red : pal.cream;
    const si = (i - 2) % 10, sj = (j - 2) % 10;
    if (si < 9 && sj < 9) {
      const ch = star[sj][si];
      if (ch === 'X') return pal.red;
      if (ch === 'O') return pal.ochre;
    }
    return ((i + j) % 10 === 0) ? pal.darkRed : null;
  }, pal.white);
  // 3: runner with wolf-tooth borders
  grid(3, 0, (i, j) => {
    const edge = Math.min(j, N - 1 - j);
    if (edge < 6) {
      const tooth = Math.abs((i % 6) - 2.5);
      return edge < 5 - tooth ? pal.red : (edge === 5 ? pal.black : null);
    }
    if (j > 12 && j < 19) return (i % 8 < 4) === (j % 2 === 0) ? pal.black : pal.red;
    return null;
  }, pal.cream);
  // 4: plain grey wool with a red edge line
  grid(0, 1, (i, j) => (rim(i, j) === 1 ? pal.red : null), pal.grey);
  // 5: brown-cream stripes
  grid(1, 1, (i, j) => {
    const b = Math.floor(j / 3) % 6;
    return b === 0 ? pal.cream : b === 3 ? pal.ochre : b === 4 ? pal.black : null;
  }, pal.brown);
  // 6: blue field with red hunt border
  grid(2, 1, (i, j) => {
    if (rim(i, j) < 3) return rim(i, j) === 1 ? pal.cream : pal.red;
    const d = rh(i, j, 6);
    return d < 1.2 ? pal.cream : d < 2.1 && ((i + j) & 1) ? pal.red : null;
  }, pal.blue);
  // 7: dark with red lattice
  grid(3, 1, (i, j) => (((i + j) % 8 === 0) || ((i - j + 64) % 8 === 0) ? pal.red : rim(i, j) === 0 ? pal.cream : null), pal.black);

  // Wool fuzz overlay (tileable not required, cells are not tiled on their own).
  const id = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const f = 0.9 + vn(x * 0.5, y * 0.5, 512, 256, seed + 40) * 0.2;
    id.data[i] *= f; id.data[i + 1] *= f; id.data[i + 2] *= f;
  }
  g.putImageData(id, 0, 0);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t, bump: null, canvas: c };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = 1 + k;
  r = Math.max(0, Math.min(255, r * f)); g = Math.max(0, Math.min(255, g * f)); b = Math.max(0, Math.min(255, b * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Fuzzy wool for rugs: UVs index the folk atlas, so the atlas does not repeat.

export const tex = {
  wood: (seed = 1) => memo('wood' + seed, () => genWood(seed, false)),
  planks: (seed = 2) => memo('planks' + seed, () => genWood(seed, true)),
  bark: (seed = 3) => memo('bark' + seed, () => genBark(seed)),
  logEnd: (seed = 4) => memo('logEnd' + seed, () => genLogEnd(seed)),
  birch: (seed = 5) => memo('birch' + seed, () => genBirch(seed)),
  straw: (seed = 6) => memo('straw' + seed, () => genStraw(seed)),
  rope: (seed = 7) => memo('rope' + seed, () => genRope(seed)),
  linen: (seed = 8) => memo('linen' + seed, () => genLinen(seed)),
  burlap: (seed = 9) => memo('burlap' + seed, () => genBurlap(seed)),
  dress: (seed = 10) => memo('dress' + seed, () => genDress(seed)),
  iron: (seed = 11) => memo('iron' + seed, () => genIron(seed)),
  stone: (seed = 12) => memo('stone' + seed, () => genStone(seed)),
  fur: (seed = 13) => memo('fur' + seed, () => genFur(seed)),
  ice: (seed = 14) => memo('ice' + seed, () => genIce(seed)),
  snow: (seed = 15) => memo('snow' + seed, () => genSnow(seed)),
  net: () => memo('net', () => genNet()),
  paint: (seed = 16) => memo('paint' + seed, () => genPaint(seed)),
  fish: (seed = 17) => memo('fish' + seed, () => genFish(seed)),
  clay: (seed = 18) => memo('clay' + seed, () => genClay(seed)),
  folk: (seed = 19) => memo('folk' + seed, () => genFolk(seed)),
};

export { vn, fbm, hash, sstep, mkCanvas, toTex };
