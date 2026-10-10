// Canvas drawn card atlas for the extra species (no files, everything procedural). Owner: vegetation builder.
// 1024 x 512, cards drawn with the base at the bottom center and the tip at the top (v along the card),
// like the needle atlas. One opaque block for solid geometry that shares the material.
//   larch     golden needle spray: spurs along a curved shoot, each a starburst of soft needles
//   pendant   a hanging larch twig (drooping, sparser), for the lower side of larch limbs
//   curtain   a hanging spray of long whip twigs (the weeping birch skirt), pale and rimed
//   twig      a fine grey twig spray with buds (rowan, alder, the ice tree's skeleton)
//   haze      a soft veil of vertical streaks (the weeping skirt in the lower LODs, alpha blended)
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const W = 1024, H = 512;
const rect = (x, y, w, h) => ({ u0: x / W, v0: 1 - (y + h) / H, u1: (x + w) / W, v1: 1 - y / H });
export const ODD_UV = {
  larch: rect(0, 0, 256, 256),
  pendant: rect(256, 0, 256, 256),
  curtain: rect(512, 0, 256, 512),
  twig: rect(768, 0, 256, 256),
  haze: rect(768, 256, 256, 256),
  solid: [40 / W, 1 - 480 / H],
};

const GOLD = ['#c9a13b', '#d8b44f', '#b98a2c', '#e0c15f', '#a9772a', '#c28f35', '#d6a843'];
const GOLD_TIP = ['#ecd27a', '#f0dc8c', '#e3c262'];

function line(ctx, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

// A tuft of needles: a half starburst around direction `ang` (canvas radians, 0 = right).
function tuft(ctx, r, x, y, ang, len, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = ang + (r() - 0.5) * 2 * spread;
    const l = len * (0.55 + 0.5 * r());
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    line(ctx, x, y, ex, ey, 1.4 + r() * 0.5, GOLD[Math.floor(r() * GOLD.length)]);
    if (r() < 0.5) line(ctx, x + (ex - x) * 0.6, y + (ey - y) * 0.6, ex, ey, 1.2, GOLD_TIP[Math.floor(r() * GOLD_TIP.length)]);
  }
}

function drawLarch(ctx, ox, oy, r, droop) {
  const S = 256;
  const spineX = (t) => ox + 128 + Math.sin(t * 3.1) * (droop ? 22 : 9);
  const spineY = (t) => oy + S - 6 - t * (S - 16);
  for (let i = 0; i < 28; i++) line(ctx, spineX(i / 28), spineY(i / 28), spineX((i + 1) / 28), spineY((i + 1) / 28), 3.0 - i * 0.07, '#5a4333');
  const nSpur = droop ? 11 : 15;
  for (let i = 0; i < nSpur; i++) {
    const t = 0.1 + (i / nSpur) * 0.88;
    const bx = spineX(t), by = spineY(t);
    for (const side of [-1, 1]) {
      if (r() < 0.2) continue;
      // a short shoot leaves the spine sideways and forward; the tuft sits at its end
      const reach = (droop ? 36 : 48) * (1 - 0.55 * t) * (0.8 + r() * 0.5);
      const sa = -Math.PI / 2 + side * (0.8 + r() * 0.4) * (droop ? 0.7 : 1);
      const sx = bx + Math.cos(sa) * reach, sy = by + Math.sin(sa) * reach * (droop ? -0.3 : 0.55) + (droop ? reach * 0.6 : 0);
      line(ctx, bx, by, sx, sy, 2, '#5a4333');
      tuft(ctx, r, sx, sy, sa + side * 0.1 - (droop ? -0.5 : 0), 34 * (1 - 0.3 * t) + 8, droop ? 20 : 28, droop ? 1.2 : 1.5);
      // a second small spur on the same shoot
      const mx = bx + (sx - bx) * 0.5, my = by + (sy - by) * 0.5;
      tuft(ctx, r, mx, my, sa, 22, 14, 1.4);
    }
  }
  // the terminal tuft
  tuft(ctx, r, spineX(1), spineY(1), -Math.PI / 2, 42, 34, 0.9);
  // a dense dusting of needles right on the spine so the card has a body
  for (let i = 0; i < 120; i++) {
    const t = 0.05 + r() * 0.95;
    const x = spineX(t), y = spineY(t);
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
    const l = 10 + r() * 16;
    line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.5, GOLD[Math.floor(r() * GOLD.length)]);
  }
}

function drawCurtain(ctx, ox, oy, r) {
  const w = 256, h = 512;
  const bx = ox + w / 2, by = oy + h - 4;
  const tones = ['#a8987c', '#8f8068', '#9d8f78', '#b8a98c', '#7d705c'];
  const nS = 20;
  for (let s = 0; s < nS; s++) {
    const fx = (s / (nS - 1) - 0.5) * 2;
    const x0 = bx + fx * 100 + (r() - 0.5) * 10;
    const lenS = h * (0.78 + r() * 0.2);
    let px = x0, py = by;
    const sway = (r() - 0.5) * 30;
    const steps = 26;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = x0 + Math.sin(t * 2.4 + s) * 7 + sway * t * t + fx * 24 * t;
      const ny = by - lenS * t;
      const col = tones[(s + i) % tones.length];
      line(ctx, px, py, nx, ny, 4.2 - 2.0 * t, col);
      // side twiglets with buds
      if (i % 2 === 0 && t > 0.06) {
        for (const sd of [-1, 1]) {
          if (r() < 0.3) continue;
          const sl = 12 + r() * 30 * (1 - 0.5 * t);
          const sa = Math.PI / 2 * sd * (0.5 + r() * 0.5) - Math.PI / 2 + sd * 0.0;
          const ex = nx + Math.cos(sa + (sd > 0 ? 0.4 : -0.4)) * sl, ey = ny + Math.sin(sa) * sl * 0.5 + sl * 0.45;
          line(ctx, nx, ny, ex, ey, 1.6, col);
          if (r() < 0.45) { ctx.fillStyle = '#7b6a58'; ctx.fillRect(ex - 1, ey - 1, 2.4, 3); }
        }
      }
      // rime: tiny bright beads along the strand
      if (r() < 0.2) { ctx.fillStyle = 'rgba(245,248,250,0.9)'; ctx.fillRect(nx - 1.2, ny - 1.2, 2.6, 2.6); }
      px = nx; py = ny;
    }
  }
}

function drawTwig(ctx, r, x, y, ang, len, w, depth) {
  const segs = 5;
  let px = x, py = y, a = ang;
  const cols = ['#5b524a', '#6b6258', '#4a423b', '#7a7064'];
  for (let i = 0; i < segs; i++) {
    a += (r() - 0.5) * 0.35;
    const nx = px + Math.sin(a) * len / segs, ny = py - Math.cos(a) * len / segs;
    line(ctx, px, py, nx, ny, Math.max(1.4, w * (1 - i / segs * 0.55)), cols[Math.floor(r() * cols.length)]);
    if (depth > 0 && i >= 1 && r() < 0.8) {
      const side = r() < 0.5 ? -1 : 1;
      drawTwig(ctx, r, nx, ny, a + side * (0.5 + r() * 0.6), len * (0.38 + r() * 0.25), w * 0.62, depth - 1);
    }
    if (depth === 0 && r() < 0.35) { ctx.fillStyle = '#8b7358'; ctx.fillRect(nx - 1, ny - 1, 2.4, 3.2); }
    px = nx; py = ny;
  }
  if (depth > 0) drawTwig(ctx, r, px, py, a + (r() - 0.5) * 0.4, len * 0.45, w * 0.55, depth - 1);
}

function drawHaze(ctx, ox, oy, r) {
  const S = 256;
  const g = ctx.createLinearGradient(0, oy, 0, oy + S);
  g.addColorStop(0, 'rgba(170,154,126,0.6)');
  g.addColorStop(1, 'rgba(150,134,108,0.3)');
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, S, S); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(ox, oy, S, S);
  ctx.filter = 'blur(4px)';
  const tones = ['rgba(214,204,184,0.9)', 'rgba(150,134,108,0.85)', 'rgba(236,236,230,0.85)', 'rgba(120,106,86,0.8)'];
  for (let i = 0; i < 13; i++) {
    const x = ox + (i + 0.5) * (S / 13) + (r() - 0.5) * 8;
    ctx.strokeStyle = tones[i % tones.length];
    ctx.lineWidth = 7 + r() * 9;
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x + (r() - 0.5) * 10, oy + S); ctx.stroke();
  }
  ctx.restore();
  ctx.filter = 'none';
}

let tex = null;
export function oddAtlas() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const r = rng(5151);
  drawLarch(ctx, 0, 0, r, false);
  drawLarch(ctx, 256, 0, r, true);
  drawCurtain(ctx, 512, 0, r);
  ctx.save();
  ctx.beginPath(); ctx.rect(768, 0, 256, 256); ctx.clip();
  for (let i = 0; i < 6; i++) drawTwig(ctx, r, 768 + 128 + (i - 2.5) * 7, 252, (i - 2.5) * 0.28 + (r() - 0.5) * 0.15, 150 + r() * 70, 4.6, 3);
  ctx.restore();
  drawHaze(ctx, 768, 256, r);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(10, 440, 90, 60);
  const t = new THREE.CanvasTexture(c);
  t.userData.imageData = ctx.getImageData(0, 0, W, H);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  tex = t;
  return t;
}
