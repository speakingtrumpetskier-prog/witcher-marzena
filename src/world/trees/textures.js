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
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const r = rng(77);
  ctx.lineCap = 'round';
  // --- twig spray (left half): stems fan out from bottom center
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 256, 256); ctx.clip();
  const tones = ['#4a4044', '#585050', '#3a3238', '#6e6662'];
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
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = false;
  atlas = tex;
  return tex;
}
