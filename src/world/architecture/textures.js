// Canvas-drawn tileable textures for the architecture kit. Everything is procedural.
// All textures are generated once, lazily, and shared by every building.
//
//   wood()     weathered silver-brown grain, grain runs along canvas Y (tile = 1 m across x 3 m along)
//   shingle()  rows of split-wood shingles (tile = 1.2 m square, rows run along X)
//   stone()    fieldstone rubble with mortar and lichen (tile = 2 m square)
//   straw()    thatch / loose hay streaks (tile = 1.5 m)
//   glassTex() / glowTex()  window pane (dark day glass) and warm lit window (emissive)
//
// Greyscale-ish albedo with a mean luminance near 0.8: vertex colors do the real tinting.
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const cache = {};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function finish(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// Periodic value noise on a lattice of (px x py) cells, sampled at continuous (x, y) in cell units.
function makePNoise(seed, px, py) {
  const r = rng(seed);
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Height canvas -> same canvas used for bumpMap. We return both from one drawing.
export function wood() {
  if (cache.wood) return cache.wood;
  const S = 512;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // Streaks: high frequency across, low along the grain (canvas Y).
  const n1 = makePNoise(11, 64, 4), n2 = makePNoise(12, 24, 8), n3 = makePNoise(13, 8, 3), n4 = makePNoise(14, 128, 2);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // Slight waviness of the grain lines.
      const w = (n3(u * 8, v * 3) - 0.5) * 2.2;
      const a = n1(u * 64 + w, v * 4);
      const b = n2(u * 24 + w * 0.6, v * 8);
      const c = n4(u * 128 + w, v * 2);
      let l = 0.62 + (a - 0.5) * 0.34 + (b - 0.5) * 0.3 + (c - 0.5) * 0.14;
      // Soft banding that suggests growth rings seen on a tangent cut.
      l += Math.sin((u + w * 0.05) * Math.PI * 2 * 6 + n3(u * 4, v * 2) * 5) * 0.045;
      l = clamp01(l + 0.18);
      const i = (y * S + x) * 4;
      // Warm-grey weathering: red a touch above blue.
      d[i] = clamp01(l * 1.0) * 255;
      d[i + 1] = clamp01(l * 0.93) * 255;
      d[i + 2] = clamp01(l * 0.84) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(77);
  // Long checks (drying cracks) along the grain, and darker knots.
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    const x = r() * S, y0 = r() * S, len = 60 + r() * 220;
    ctx.strokeStyle = `rgba(30,20,14,${0.25 + r() * 0.35})`;
    ctx.lineWidth = 0.7 + r() * 1.6;
    ctx.beginPath();
    let cx = x;
    ctx.moveTo(cx, y0);
    for (let s = 1; s <= 6; s++) {
      cx += (r() - 0.5) * 2.4;
      ctx.lineTo(cx, y0 + (len * s) / 6);
    }
    ctx.stroke();
    // Wrap copies so the tile stays seamless.
    if (y0 + len > S) {
      ctx.beginPath();
      ctx.moveTo(x, y0 - S);
      let cx2 = x;
      for (let s = 1; s <= 6; s++) { cx2 += (r() - 0.5) * 2.4; ctx.lineTo(cx2, y0 - S + (len * s) / 6); }
      ctx.stroke();
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = r() * S, y = r() * S, rr = 6 + r() * 10;
    for (const ox of [0, x < rr * 2 ? S : x > S - rr * 2 ? -S : 0]) {
      const g = ctx.createRadialGradient(x + ox, y, 1, x + ox, y, rr);
      g.addColorStop(0, 'rgba(36,24,16,0.85)');
      g.addColorStop(0.5, 'rgba(70,48,32,0.5)');
      g.addColorStop(1, 'rgba(120,96,76,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.scale(0.6, 1.5);
      ctx.translate(-(x + ox), -y);
      ctx.beginPath(); ctx.arc(x + ox, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // Fine speckle (lichen and dirt).
  for (let k = 0; k < 900; k++) {
    const x = r() * S, y = r() * S;
    ctx.fillStyle = r() < 0.5 ? 'rgba(60,50,40,0.18)' : 'rgba(220,214,200,0.14)';
    ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 4);
  }
  cache.wood = finish(cv);
  return cache.wood;
}

export function shingle() {
  if (cache.shingle) return cache.shingle;
  const S = 512;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const r = rng(303);
  const rows = 8, rh = S / rows;
  ctx.fillStyle = '#2a2220';
  ctx.fillRect(0, 0, S, S);
  const noise = makePNoise(31, 16, 16);
  for (let row = 0; row < rows; row++) {
    // Row bottoms are at larger canvas y = lower v = toward the eave.
    const yTop = row * rh - rh * 0.1;
    let x = -r() * 40;
    const rowTone = 0.82 + r() * 0.12;
    while (x < S + 10) {
      let wdt = 44 + r() * 30;
      if (x + wdt > S && x < S) wdt = S - x + (r() < 0.5 ? 0 : 0); // tile seam: last shingle reaches the edge
      const tone = rowTone * (0.62 + r() * 0.34) * (0.9 + noise(x / 32, row * 2) * 0.2);
      const hue = r();
      const rr = Math.round((hue < 0.25 ? 150 : hue < 0.7 ? 138 : 128) * tone * 1.12);
      const gg = Math.round((hue < 0.25 ? 138 : hue < 0.7 ? 118 : 112) * tone * 1.12);
      const bb = Math.round((hue < 0.25 ? 126 : hue < 0.7 ? 100 : 100) * tone * 1.12);
      const h = rh * 1.55;
      const g = ctx.createLinearGradient(0, yTop, 0, yTop + h);
      g.addColorStop(0, `rgb(${rr * 0.75 | 0},${gg * 0.75 | 0},${bb * 0.75 | 0})`);
      g.addColorStop(0.55, `rgb(${rr},${gg},${bb})`);
      g.addColorStop(1, `rgb(${Math.min(255, rr * 1.08) | 0},${Math.min(255, gg * 1.08) | 0},${Math.min(255, bb * 1.08) | 0})`);
      ctx.fillStyle = g;
      // Slightly rounded or pointed lower edge.
      ctx.beginPath();
      const x0 = x + 1, x1 = x + wdt - 1, yb = yTop + h;
      const kind = r();
      ctx.moveTo(x0, yTop);
      ctx.lineTo(x1, yTop);
      if (kind < 0.55) { ctx.lineTo(x1, yb - 5); ctx.quadraticCurveTo(x1, yb, (x0 + x1) / 2, yb + 1); ctx.quadraticCurveTo(x0, yb, x0, yb - 5); }
      else if (kind < 0.8) { ctx.lineTo(x1, yb - 6); ctx.lineTo((x0 + x1) / 2, yb + 2); ctx.lineTo(x0, yb - 6); }
      else { ctx.lineTo(x1, yb - r() * 4); ctx.lineTo(x0, yb - r() * 4); }
      ctx.closePath();
      ctx.fill();
      // Grain streaks.
      for (let k = 0; k < 7; k++) {
        const gx = x0 + 2 + r() * (wdt - 4);
        ctx.strokeStyle = `rgba(${r() < 0.5 ? '30,22,16' : '230,220,200'},${0.07 + r() * 0.12})`;
        ctx.lineWidth = 0.8 + r();
        ctx.beginPath(); ctx.moveTo(gx, yTop + 2); ctx.lineTo(gx + (r() - 0.5) * 3, yb - 6); ctx.stroke();
      }
      // Dark shadow line under the bottom edge (where the next shingle row is lifted).
      ctx.strokeStyle = 'rgba(20,14,10,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (kind < 0.55) { ctx.moveTo(x0, yb - 5); ctx.quadraticCurveTo(x0, yb + 1, (x0 + x1) / 2, yb + 2); ctx.quadraticCurveTo(x1, yb + 1, x1, yb - 5); }
      else if (kind < 0.8) { ctx.moveTo(x0, yb - 6); ctx.lineTo((x0 + x1) / 2, yb + 3); ctx.lineTo(x1, yb - 6); }
      else { ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); }
      ctx.stroke();
      x += wdt;
    }
  }
  // Moss and lichen patches, mostly low in the tile (north side of roofs).
  for (let k = 0; k < 14; k++) {
    const x = r() * S, y = r() * S, rr = 10 + r() * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, rr);
    const gl = r() < 0.5;
    g.addColorStop(0, gl ? 'rgba(96,110,60,0.5)' : 'rgba(190,190,160,0.35)');
    g.addColorStop(1, 'rgba(90,100,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  }
  cache.shingle = finish(cv);
  return cache.shingle;
}

export function stone() {
  if (cache.stone) return cache.stone;
  const S = 512;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const r = rng(909);
  // Feature points on a jittered periodic grid (cells wider than tall: laid courses).
  const NX = 8, NY = 10;
  const pts = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const off = (j % 2) * 0.5;
      pts.push({ x: (i + off + 0.15 + r() * 0.7) / NX * S, y: (j + 0.15 + r() * 0.7) / NY * S, tone: 0.55 + r() * 0.4, hue: r(), lich: r() });
    }
  }
  const pn = makePNoise(5, 32, 32), pn2 = makePNoise(6, 96, 96);
  const cell = (i, j) => pts[((j % NY + NY) % NY) * NX + ((i % NX) + NX) % NX];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Warp for irregular outlines.
      const wx = x + (pn(x / 16, y / 16) - 0.5) * 22, wy = y + (pn(x / 16 + 9, y / 16 + 4) - 0.5) * 22;
      const ci = Math.floor(wx / S * NX), cj = Math.floor(wy / S * NY);
      let f1 = 1e9, f2 = 1e9, best = null;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const p = cell(ci + di, cj + dj);
          const px = p.x + Math.floor((ci + di) / NX) * S, py = p.y + Math.floor((cj + dj) / NY) * S;
          const ddx = (wx - px) * 0.8, ddy = (wy - py) * 1.15;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < f1) { f2 = f1; f1 = dd; best = p; } else if (dd < f2) f2 = dd;
        }
      }
      const edge = f2 - f1;
      const mortar = clamp01(1 - edge / 7);
      const bevel = clamp01(edge / 26);
      const grain = pn2(x / 5, y / 5) * 0.22 + pn(x / 9, y / 9) * 0.18;
      let l = best.tone * (0.62 + grain) * (0.72 + bevel * 0.38);
      l = l * (1 - mortar * 0.7);
      const warm = best.hue;
      let rr = l * (warm < 0.3 ? 1.02 : warm < 0.7 ? 0.96 : 0.9);
      let gg = l * (warm < 0.3 ? 0.98 : warm < 0.7 ? 0.97 : 0.95);
      let bb = l * (warm < 0.3 ? 0.9 : warm < 0.7 ? 0.95 : 1.0);
      // Lichen specks.
      if (best.lich > 0.6 && pn2(x / 3 + 40, y / 3) > 0.6 && mortar < 0.4) { rr = rr * 0.7 + 0.2; gg = gg * 0.7 + 0.24; bb = bb * 0.6 + 0.08; }
      const i = (y * S + x) * 4;
      d[i] = clamp01(rr + 0.12) * 255; d[i + 1] = clamp01(gg + 0.12) * 255; d[i + 2] = clamp01(bb + 0.12) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.stone = finish(cv);
  return cache.stone;
}

export function straw() {
  if (cache.straw) return cache.straw;
  const S = 256;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const r = rng(515);
  ctx.fillStyle = '#b09a68';
  ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 1400; k++) {
    const x = r() * S, y = r() * S, len = 20 + r() * 60;
    const t = r();
    ctx.strokeStyle = t < 0.4 ? `rgba(228,206,140,${0.3 + r() * 0.4})` : t < 0.75 ? `rgba(140,116,70,${0.25 + r() * 0.4})` : `rgba(80,66,44,${0.15 + r() * 0.3})`;
    ctx.lineWidth = 0.8 + r() * 1.4;
    const dx = (r() - 0.5) * 6;
    for (const oy of [0, y + len > S ? -S : 0]) {
      ctx.beginPath(); ctx.moveTo(x, y + oy); ctx.lineTo(x + dx, y + oy + len); ctx.stroke();
    }
  }
  // Binding bands.
  for (let k = 0; k < 2; k++) {
    const y = (k + 0.5) * S / 2;
    ctx.fillStyle = 'rgba(60,46,30,0.35)';
    ctx.fillRect(0, y, S, 3);
  }
  cache.straw = finish(cv);
  return cache.straw;
}

// Dark daytime glass with mullions and a hint of sky reflection. Used as the base color map.
export function glassTex() {
  if (cache.glass) return cache.glass;
  const S = 128;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#34485e'); g.addColorStop(0.5, '#1b2733'); g.addColorStop(1, '#10161d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // Sky glint streak.
  ctx.fillStyle = 'rgba(190,215,240,0.16)';
  ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(60, 0); ctx.lineTo(90, 0); ctx.lineTo(0, 70); ctx.fill();
  // Frost creeping from the corners.
  const r = rng(808);
  for (let k = 0; k < 160; k++) {
    const cx = r() < 0.5 ? 0 : S, cy = r() < 0.5 ? 0 : S;
    const x = cx + (cx ? -1 : 1) * r() * r() * 46, y = cy + (cy ? -1 : 1) * r() * r() * 46;
    ctx.fillStyle = `rgba(225,236,246,${0.2 + r() * 0.35})`;
    ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
  }
  // Mullions: cross.
  ctx.fillStyle = '#0a0705';
  ctx.fillRect(S / 2 - 3, 0, 6, S); ctx.fillRect(0, S / 2 - 3, S, 6);
  ctx.fillRect(0, 0, S, 5); ctx.fillRect(0, S - 5, S, 5); ctx.fillRect(0, 0, 5, S); ctx.fillRect(S - 5, 0, 5, S);
  cache.glass = finish(cv, { repeat: false });
  return cache.glass;
}

// Warm lit window: bright amber with a darker rim, silhouetted mullions and a curtain edge.
export function glowTex() {
  if (cache.glow) return cache.glow;
  const S = 128;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S * 0.5, S * 0.62, 6, S * 0.5, S * 0.55, S * 0.78);
  g.addColorStop(0, '#fff0c0'); g.addColorStop(0.45, '#ffb860'); g.addColorStop(1, '#a8501c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // A figure or furniture shadow blob low in the pane.
  ctx.fillStyle = 'rgba(120,50,10,0.22)';
  ctx.beginPath(); ctx.ellipse(S * 0.32, S * 0.9, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
  // Curtain tint at one side.
  const cg = ctx.createLinearGradient(0, 0, S * 0.3, 0);
  cg.addColorStop(0, 'rgba(150,50,30,0.5)'); cg.addColorStop(1, 'rgba(150,50,30,0)');
  ctx.fillStyle = cg; ctx.fillRect(0, 0, S * 0.3, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(S / 2 - 3, 0, 6, S); ctx.fillRect(0, S / 2 - 3, S, 6);
  ctx.fillRect(0, 0, S, 5); ctx.fillRect(0, S - 5, S, 5); ctx.fillRect(0, 0, 5, S); ctx.fillRect(S - 5, 0, 5, S);
  cache.glow = finish(cv, { repeat: false });
  return cache.glow;
}

// Soft neutral noise used as a bump map for snow and ice.
export function snowBump() {
  if (cache.snowBump) return cache.snowBump;
  const S = 256;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n1 = makePNoise(41, 16, 16), n2 = makePNoise(42, 48, 48), n3 = makePNoise(43, 96, 96);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = clamp01(0.5 + (n1(x / 16, y / 16) - 0.5) * 0.5 + (n2(x / 5.3, y / 5.3) - 0.5) * 0.3 + (n3(x / 2.7, y / 2.7) - 0.5) * 0.2);
      const i = (y * S + x) * 4;
      d4(img.data, i, v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.snowBump = finish(cv, { srgb: false });
  return cache.snowBump;
}
function d4(d, i, v) { d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }

// Cloth / canvas weave for awnings and banners.
export function cloth() {
  if (cache.cloth) return cache.cloth;
  const S = 128;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const r = rng(616);
  ctx.fillStyle = '#c9c0b0';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    ctx.fillStyle = `rgba(80,70,60,${0.1 + r() * 0.12})`; ctx.fillRect(i, 0, 1, S);
    ctx.fillStyle = `rgba(255,250,240,${0.08 + r() * 0.1})`; ctx.fillRect(0, i, S, 1);
  }
  for (let k = 0; k < 80; k++) {
    ctx.fillStyle = `rgba(90,70,50,${r() * 0.12})`;
    ctx.fillRect(r() * S, r() * S, 2 + r() * 6, 1 + r() * 3);
  }
  cache.cloth = finish(cv);
  return cache.cloth;
}
