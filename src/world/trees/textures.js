// Canvas drawn textures for the vegetation library (no files, everything procedural).
// Owner: vegetation builder.
//   birchAtlas(): 768x256 in three squares: bare winter twig spray, fresh birch leaf cluster, and a soft
//   blurred twig haze (alpha blended crowns for the lower LODs, where thin lines would alias).
import * as THREE from 'three';
import { rng } from '../../core/util.js';

export const BIRCH_UV = {
  twig: { u0: 0.0, v0: 0.0, u1: 1 / 3, v1: 1.0 },
  leaf: { u0: 1 / 3, v0: 0.0, u1: 2 / 3, v1: 1.0 },
  haze: { u0: 2 / 3, v0: 0.0, u1: 1.0, v1: 1.0 },
};

function drawTwig(ctx, r, x, y, ang, len, w, depth, tone) {
  const segs = 5;
  let px = x, py = y;
  let a = ang;
  for (let i = 0; i < segs; i++) {
    a += (r() - 0.5) * 0.35;
    const nx = px + Math.sin(a) * len / segs;
    const ny = py - Math.cos(a) * len / segs;
    ctx.lineWidth = Math.max(1.3, w * (1 - i / segs * 0.55));
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
    // side twigs
    if (depth > 0 && i >= 1 && r() < 0.8) {
      const side = r() < 0.5 ? -1 : 1;
      drawTwig(ctx, r, nx, ny, a + side * (0.5 + r() * 0.6), len * (0.38 + r() * 0.25), w * 0.62, depth - 1, tone);
    }
    // catkin or bud dots
    if (depth === 0 && r() < 0.25) {
      ctx.fillStyle = tone ? '#8b7358' : '#6d5a4a';
      ctx.fillRect(nx - 1, ny - 1, 2, 2.5);
    }
    px = nx; py = ny;
  }
  if (depth > 0) drawTwig(ctx, r, px, py, a + (r() - 0.5) * 0.4, len * 0.45, w * 0.55, depth - 1, tone);
}

function drawLeaf(ctx, x, y, ang, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.15);
  ctx.quadraticCurveTo(s * 0.95, -s * 0.15, s * 0.1, s * 0.75);
  ctx.lineTo(-s * 0.1, s * 0.75);
  ctx.quadraticCurveTo(-s * 0.95, -s * 0.15, 0, -s * 1.15);
  ctx.fill();
  ctx.restore();
}

let atlas = null;
export function birchAtlas() {
  if (atlas) return atlas;
  const W = 768, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  // CPU backed canvas: the impostor bake reads its pixels, and a GPU backed canvas readback would
  // stall behind the GPU process (minutes under software GL)
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  const r = rng(77);
  ctx.lineCap = 'round';
  // --- twig spray (left half): stems fan out from bottom center
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 256, 256); ctx.clip();
  const tones = ['#5c524a', '#6a5f55', '#483f39', '#7c7166'];
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = tones[i % tones.length];
    const a = (i - 2) * 0.3 + (r() - 0.5) * 0.15;
    drawTwig(ctx, r, 128 + (i - 2) * 6, 252, a, 165 + r() * 55, 4.4, 3, i % 3 === 0);
  }
  ctx.restore();
  // --- leaf cluster (right half)
  ctx.save();
  ctx.beginPath(); ctx.rect(256, 0, 256, 256); ctx.clip();
  const greens = ['#8fbf4e', '#a3cc5c', '#7fae43', '#b6d86c', '#6f9f3b'];
  ctx.strokeStyle = '#5a4a38';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(384, 254); ctx.quadraticCurveTo(384 + (i - 1.5) * 28, 150, 384 + (i - 1.5) * 52, 60 + r() * 50); ctx.stroke();
  }
  for (let i = 0; i < 90; i++) {
    const rr = Math.sqrt(r()) * 112;
    const th = r() * 6.28;
    const lx = 384 + Math.cos(th) * rr * 1.0;
    const ly = 128 + Math.sin(th) * rr * 1.05 - 6;
    drawLeaf(ctx, lx, ly, r() * 6.28, 11 + r() * 8, greens[Math.floor(r() * greens.length)]);
  }
  ctx.restore();
  // --- haze (third square): the same spray, fat, blurred and dusted with a soft mass
  ctx.save();
  ctx.beginPath(); ctx.rect(512, 0, 256, 256); ctx.clip();
  const grad = ctx.createRadialGradient(640, 150, 10, 640, 150, 120);
  grad.addColorStop(0, 'rgba(90,72,70,0.55)'); grad.addColorStop(1, 'rgba(90,72,70,0)');
  ctx.fillStyle = grad; ctx.fillRect(512, 0, 256, 256);
  ctx.filter = 'blur(3px)';
  ctx.globalAlpha = 0.75;
  const r2 = rng(78);
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = tones[i % tones.length];
    const a = (i - 2) * 0.3 + (r2() - 0.5) * 0.15;
    drawTwig(ctx, r2, 640 + (i - 2) * 6, 252, a, 165 + r2() * 55, 9, 3, false);
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.userData.imageData = ctx.getImageData(0, 0, W, H);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = false;
  atlas = tex;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Needle atlas (512x512): a drooping spruce branch card, a Scots pine needle tuft, and one opaque
// white texel block for solid geometry (trunks, snow lumps) that shares the same material.
// Cards are drawn with a base at the bottom center and the tip at the top (v along the branch,
// u across). Needles are many short strokes along side twigs, so the alpha silhouette is fringed
// and soft instead of polygonal. Palette: dark blue greens, never grass green.
export const NEEDLE_UV = {
  spruce: { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
  pine: { u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
  solid: [0.1, 0.1], // every solid vertex points here (identical uv, so no mip blur)
};

const SPRUCE_PAL = ['#1d3528', '#213a2c', '#1a2f24', '#27402f', '#2a4332', '#2f4a36'];
const SPRUCE_TIP = ['#34503b', '#3d5a44', '#2f4a40', '#45624c'];
const PINE_PAL = ['#26402f', '#2d4a3b', '#233a30', '#34524a'];
const PINE_TIP = ['#456458', '#4f6f5f', '#3d5d4e'];

function stroke(ctx, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function drawSpruceCard(ctx, ox, oy, r) {
  const S = 256;
  const spineX = (t) => ox + 128 + Math.sin(t * Math.PI * 1.3) * 7;
  const spineY = (t) => oy + S - 5 - t * (S - 12);
  const env = (t) => {
    const a = Math.min(1, t / 0.16);
    const tp = Math.max(0, (t - 0.5) / 0.5);
    return a * (1 - 0.86 * Math.pow(tp, 1.4));
  };
  // spine
  for (let i = 0; i < 24; i++) stroke(ctx, spineX(i / 24), spineY(i / 24), spineX((i + 1) / 24), spineY((i + 1) / 24), 2.6 - i * 0.05, '#2a2019');
  const nTwig = 30;
  for (let i = 0; i < nTwig * 2; i++) {
    const side = i % 2 ? 1 : -1;
    const t = 0.03 + (Math.floor(i / 2) / nTwig) * 0.95 + r() * 0.012;
    const half = 122 * env(t) * (0.82 + r() * 0.3);
    if (half < 6) continue;
    const bx = spineX(t), by = spineY(t);
    // twig sweeps outward and forward (toward the tip), drooping a little at its end
    const ang = (0.62 + r() * 0.3); // radians above the horizontal toward the tip
    const segs = Math.max(4, Math.round(half / 9));
    let px = bx, py = by;
    for (let j = 1; j <= segs; j++) {
      const u = j / segs;
      const nx = bx + side * Math.cos(ang) * half * u;
      const ny = by - Math.sin(ang) * half * u * (0.55 - 0.25 * u) * 1.15 + u * u * half * 0.12;
      stroke(ctx, px, py, nx, ny, 1.5, '#2b2119');
      // needles along the twig: three to four per node, fanned forward and outward
      const reps = 2;
      for (let q = 0; q < reps; q++) {
        const tx = px + (nx - px) * (q / reps), ty = py + (ny - py) * (q / reps);
        for (let k = 0; k < 4; k++) {
          const len = (8 + r() * 11) * (1.05 - 0.45 * u);
          const na = Math.atan2(ny - py, nx - px) + (r() - 0.5) * 2.1 + (k % 2 ? 0.35 : -0.35) * side;
          const ex = tx + Math.cos(na) * len, ey = ty + Math.sin(na) * len;
          const col = SPRUCE_PAL[Math.floor(r() * SPRUCE_PAL.length)];
          stroke(ctx, tx, ty, ex, ey, 1.7 + r() * 0.5, col);
          if (r() < 0.55) stroke(ctx, tx + (ex - tx) * 0.62, ty + (ey - ty) * 0.62, ex, ey, 1.5, SPRUCE_TIP[Math.floor(r() * SPRUCE_TIP.length)]);
        }
      }
      px = nx; py = ny;
    }
  }
  // needles on the spine itself, mostly near the tip
  for (let i = 0; i < 90; i++) {
    const t = 0.2 + r() * 0.8;
    const x = spineX(t), y = spineY(t);
    const na = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const len = 10 + r() * 12 * (1 - t * 0.4);
    stroke(ctx, x, y, x + Math.cos(na) * len, y + Math.sin(na) * len, 1.7, SPRUCE_PAL[Math.floor(r() * SPRUCE_PAL.length)]);
  }
}

function drawPineTuft(ctx, ox, oy, r) {
  const S = 256;
  const bx = ox + 128, by = oy + S - 6;
  stroke(ctx, bx, by, bx + 2, by - 26, 3, '#4a3a2e');
  for (let i = 0; i < 230; i++) {
    const a = (r() - 0.5) * 2 * 1.32; // from vertical
    const len = (62 + r() * 62) * (1 - 0.32 * Math.abs(a) / 1.32);
    const sx = bx + (r() - 0.5) * 8, sy = by - 22 - r() * 8;
    const cxp = sx + Math.sin(a) * len * 0.55 + (r() - 0.5) * 8, cyp = sy - Math.cos(a) * len * 0.55;
    const ex = sx + Math.sin(a) * len, ey = sy - Math.cos(a) * len + len * 0.1 * Math.abs(a);
    ctx.strokeStyle = PINE_PAL[Math.floor(r() * PINE_PAL.length)];
    ctx.lineWidth = 1.5 + r() * 0.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cxp, cyp, ex, ey); ctx.stroke();
    if (r() < 0.4) stroke(ctx, cxp, cyp, ex, ey, 1.3, PINE_TIP[Math.floor(r() * PINE_TIP.length)]);
  }
}

let needleTex = null;
export function needleAtlas() {
  if (needleTex) return needleTex;
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const r = rng(4242);
  drawSpruceCard(ctx, 0, 0, r);
  drawPineTuft(ctx, 256, 0, r);
  // opaque block for solid geometry: uv (0.1, 0.1) is canvas (51, 461)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(10, 440, 90, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.userData.imageData = ctx.getImageData(0, 0, W, H);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  needleTex = tex;
  return tex;
}
