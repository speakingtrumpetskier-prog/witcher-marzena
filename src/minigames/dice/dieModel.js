// The dice themselves: a rounded cube with carved pips, drawn from nothing. One shared geometry (about a
// thousand vertices), a painted colour map and a normal map per style (a 3 x 2 atlas, one cell per face), so the
// pips read as ink sunk into a dimple. Styles are the materials people play with: ash wood, bone, walnut, horn.
//
//   DIE                       edge length in metres (0.05)
//   STYLES                    { house, bone, walnut, horn, redbone }  (colours and surface of each)
//   dieGeometry()             the shared BufferGeometry (faces: +Y 1, -Y 6, +Z 2, -Z 5, +X 3, -X 4)
//   dieMaterial(style)        a fresh MeshStandardMaterial for one die (textures shared per style)
//   shadowTexture()           a soft round contact shadow for the dice and coins
//   disposeDieAssets()
//
// Everything is made with canvas 2D and typed arrays; no files.
import * as THREE from 'three';
import { rng } from '../../core/util.js';

export const DIE = 0.05;
const CELL = 256;

export const STYLES = {
  house: { body: '#cdb98e', kind: 'wood', grain: '#8a6c40', pip: '#2b1d12', rough: 0.72, wear: 0.16 },
  bone: { body: '#e7dcc2', kind: 'bone', grain: '#bba984', pip: '#2a1d16', rough: 0.55, wear: 0.1 },
  walnut: { body: '#5c3a24', kind: 'wood', grain: '#2e1a0e', pip: '#ebdcb8', rough: 0.6, wear: 0.12 },
  horn: { body: '#c08a3e', kind: 'horn', grain: '#6a3d16', pip: '#2a160c', rough: 0.45, wear: 0.1 },
  redbone: { body: '#efe5ca', kind: 'bone', grain: '#c8b88e', pip: '#9c2a1c', rough: 0.5, wear: 0.08 },
};

// Which atlas cell and which axes each face uses: [value, normal, u, v] with u x v = normal.
const FACES = [
  [1, [0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [6, [0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [2, [0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [5, [0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [3, [1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [4, [-1, 0, 0], [0, 0, 1], [0, 1, 0]],
];

// Pip centres as fractions of a face (x right, y up).
const A = 0.27, B = 0.5, C = 0.73;
const PIPS = {
  1: [[B, B]],
  2: [[A, C], [C, A]],
  3: [[A, C], [B, B], [C, A]],
  4: [[A, A], [A, C], [C, A], [C, C]],
  5: [[A, A], [A, C], [B, B], [C, A], [C, C]],
  6: [[A, A], [A, B], [A, C], [C, A], [C, B], [C, C]],
};
const PIP_R = 0.095; // of a face

let geometry = null;
const cache = new Map();
let normalTex = null;
let shadowTex = null;

// ---- geometry ----------------------------------------------------------------------------------------
export function dieGeometry() {
  if (geometry) return geometry;
  const h = 0.5, r = 0.11, hi = h - r, K = 5;
  const nodes = [];
  for (let i = 0; i <= K; i++) nodes.push(-hi - r * Math.tan((Math.PI / 4) * (1 - i / K)));
  nodes.push(-hi * 0.5, 0, hi * 0.5);
  for (let i = 0; i <= K; i++) nodes.push(hi + r * Math.tan((Math.PI / 4) * (i / K)));
  const n = nodes.length;
  const pos = [], nor = [], uv = [], idx = [];
  const clampv = (x) => Math.max(-hi, Math.min(hi, x));
  for (const [value, N, U, V] of FACES) {
    const col = (value - 1) % 3, row = Math.floor((value - 1) / 3);
    const base = pos.length / 3;
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const S = nodes[ix], T = nodes[iy];
        const p = [N[0] * h + U[0] * S + V[0] * T, N[1] * h + U[1] * S + V[1] * T, N[2] * h + U[2] * S + V[2] * T];
        const c = [clampv(p[0]), clampv(p[1]), clampv(p[2])];
        const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        const nn = [d[0] / l, d[1] / l, d[2] / l];
        pos.push((c[0] + nn[0] * r) * DIE, (c[1] + nn[1] * r) * DIE, (c[2] + nn[2] * r) * DIE);
        nor.push(nn[0], nn[1], nn[2]);
        const sf = (S + h) / (2 * h), tf = (T + h) / (2 * h);
        uv.push((col + sf) / 3, 1 - (row + (1 - tf)) / 2);
      }
    }
    for (let iy = 0; iy < n - 1; iy++) {
      for (let ix = 0; ix < n - 1; ix++) {
        const a = base + iy * n + ix, b = a + 1, c2 = a + n, d2 = c2 + 1;
        idx.push(a, b, c2, b, d2, c2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  geometry = g;
  return g;
}

// ---- textures ----------------------------------------------------------------------------------------
function pipPath(ctx, cx, cy, R, r) {
  ctx.beginPath();
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = R * (1 + (r() - 0.5) * 0.07);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function paintBody(ctx, x0, y0, S, st, r) {
  ctx.fillStyle = st.body;
  ctx.fillRect(x0, y0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, S, S);
  ctx.clip();
  if (st.kind === 'wood') {
    // long grain lines, slightly wavy, in the direction the log ran
    const lines = 26, tilt = (r() - 0.5) * 0.25;
    for (let i = 0; i < lines; i++) {
      const y = y0 + (i + r()) * (S / lines);
      ctx.strokeStyle = st.grain;
      ctx.globalAlpha = 0.07 + r() * 0.16;
      ctx.lineWidth = 0.6 + r() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      const wob = 2 + r() * 5, ph = r() * 6.28;
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x0 + x, y + Math.sin(x * 0.03 + ph) * wob + x * tilt * 0.1);
      ctx.stroke();
    }
  } else {
    // bone and horn: soft cloudy mottling and a few fine hairlines
    for (let i = 0; i < 26; i++) {
      const x = x0 + r() * S, y = y0 + r() * S, rad = 14 + r() * 56;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      g.addColorStop(0, dark ? st.grain : '#ffffff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (st.kind === 'horn' ? 0.22 : 0.16) * (0.4 + r());
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = st.grain;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const sx = x0 + r() * S, sy = y0 + r() * S;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (r() - 0.5) * 70, sy + (r() - 0.5) * 70);
      ctx.stroke();
    }
  }
  // fine speckle
  ctx.globalAlpha = 1;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = r() < 0.55 ? 'rgba(20,12,4,0.12)' : 'rgba(255,248,230,0.1)';
    ctx.fillRect(x0 + r() * S, y0 + r() * S, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  // handled edges: worn lighter and a little darker in the corners from thumbs
  const g2 = ctx.createRadialGradient(x0 + S / 2, y0 + S / 2, S * 0.36, x0 + S / 2, y0 + S / 2, S * 0.72);
  g2.addColorStop(0, 'rgba(255,245,220,0)');
  g2.addColorStop(1, `rgba(255,245,220,${st.wear})`);
  ctx.fillStyle = g2;
  ctx.fillRect(x0, y0, S, S);
  ctx.restore();
}

function paintPips(ctx, x0, y0, S, value, st, r) {
  const R = S * PIP_R;
  for (const [fx, fy] of PIPS[value]) {
    const cx = x0 + fx * S + (r() - 0.5) * 2, cy = y0 + (1 - fy) * S + (r() - 0.5) * 2;
    // the ring of stain round a carved dimple
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.5);
    halo.addColorStop(0, 'rgba(0,0,0,0.22)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2); ctx.fill();
    pipPath(ctx, cx, cy, R, r);
    const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, st.pip);
    g.addColorStop(1, st.pip);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function colourTexture(styleName) {
  const st = STYLES[styleName];
  const c = document.createElement('canvas');
  c.width = CELL * 3; c.height = CELL * 2;
  const ctx = c.getContext('2d');
  const r = rng(styleName.length * 977 + 13);
  for (let v = 1; v <= 6; v++) {
    const x0 = ((v - 1) % 3) * CELL, y0 = Math.floor((v - 1) / 3) * CELL;
    paintBody(ctx, x0, y0, CELL, st, r);
    paintPips(ctx, x0, y0, CELL, v, st, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Height field (pips as bowls with a small lip, a little grain), then a tangent space normal map from it.
function buildNormalTexture() {
  const W = CELL * 3, H = CELL * 2;
  const hf = new Float32Array(W * H);
  const r = rng(4242);
  for (let i = 0; i < hf.length; i++) hf[i] = 0.5 + (r() - 0.5) * 0.03;
  const R = CELL * PIP_R;
  for (let v = 1; v <= 6; v++) {
    const x0 = ((v - 1) % 3) * CELL, y0 = Math.floor((v - 1) / 3) * CELL;
    for (const [fx, fy] of PIPS[v]) {
      const cx = x0 + fx * CELL, cy = y0 + (1 - fy) * CELL;
      const ext = Math.ceil(R * 1.4);
      for (let y = Math.floor(cy - ext); y <= cy + ext; y++) {
        for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
          const d = Math.hypot(x - cx, y - cy) / R;
          let dh = 0;
          if (d < 1) dh = -0.5 * (1 - d * d) ** 0.8;
          else if (d < 1.3) dh = 0.06 * Math.sin(((d - 1) / 0.3) * Math.PI);
          if (dh) hf[y * W + x] += dh;
        }
      }
    }
  }
  const data = new Uint8Array(W * H * 4);
  const k = 5.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
      const dhdx = (hf[y * W + xp] - hf[y * W + xm]) * 0.5;
      const dhdy = (hf[yp * W + x] - hf[ym * W + x]) * 0.5;
      let nx = -dhdx * k * 8, ny = dhdy * k * 8, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      // The canvas is stored top row first; the texture is flipped on upload, so rows are written in image order.
      const o = ((H - 1 - y) * W + x) * 4;
      data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function dieMaterial(styleName = 'house') {
  const st = STYLES[styleName] || STYLES.house;
  let entry = cache.get(styleName);
  if (!entry) {
    if (!normalTex) normalTex = buildNormalTexture();
    entry = { map: colourTexture(STYLES[styleName] ? styleName : 'house'), normal: normalTex };
    cache.set(styleName, entry);
  }
  const m = new THREE.MeshStandardMaterial({
    map: entry.map, normalMap: entry.normal, normalScale: new THREE.Vector2(1, 1), roughness: st.rough, metalness: 0,
    emissive: new THREE.Color(0x000000), emissiveIntensity: 1,
  });
  m.userData.noSnow = true;
  return m;
}

// A soft round shadow, for under a die or a coin.
export function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.78)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function disposeDieAssets() {
  geometry?.dispose(); geometry = null;
  for (const e of cache.values()) e.map.dispose();
  cache.clear();
  normalTex?.dispose(); normalTex = null;
  shadowTex?.dispose(); shadowTex = null;
}
