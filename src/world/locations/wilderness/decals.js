// Decals for the wilderness: canvas-drawn textures draped over the ground or the ice.
//
//   groundPatch(G, { x, z, w, d, yaw, tex, lift, opacity })     rectangle following the terrain
//   groundRibbon(G, { pts, width, tex, repeat, lift })         strip along a polyline following the terrain
//   icePlane(G, { x, z, w, d, yaw, tex, lift })                flat decal on the ice (y = 0)
//   scrawlBoard(...)                                           upright board with handwritten text
//   tex.*                                                      the textures (tracks, drag marks, frost faces, moss, soot...)
//
// Decals are MeshStandardMaterial with alpha, depth write off and a polygon offset so they win over
// the terrain and the ice. `iceFade(G, mat)` fades a decal out while the ice thaws.
import * as THREE from 'three';
import { mkCanvas, toTex, fbm, vn, sstep } from '../../props/tex.js';
import { ORDER } from '../../../core/G.js';

const TAU = Math.PI * 2;
const SCRAWL_FONT = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive, "Courier New", monospace';
const memo = new Map();
const once = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };

function rnd(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}


// Fill a canvas with the decal's own color at ~1% alpha: mipmaps average RGB of fully transparent pixels too, and
// transparent canvas pixels are black, which would show up as a dark halo around light decals at a distance.
function bleedFill(g, w, h, css) {
  g.save();
  g.globalAlpha = 0.012;
  g.fillStyle = css;
  g.fillRect(0, 0, w, h);
  g.restore();
}

function decalMaterial(map, { opacity = 1, color = 0xffffff, order = 4, roughness = 1, emissive = 0x000000, emissiveIntensity = 0, offset = -3 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map, color, transparent: true, opacity, depthWrite: false, roughness, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset * 2,
    emissive, emissiveIntensity,
  });
  m.userData.decalOrder = order;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Textures. All canvases are small (128 to 1024 px) and drawn once.

function paw(g, x, y, s, ang, kind) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  if (kind === 'hare') {
    g.ellipse(0, 0, s * 0.28, s * 0.5, 0, 0, TAU);
  } else if (kind === 'deer') {
    g.ellipse(-s * 0.16, 0, s * 0.14, s * 0.4, 0, 0, TAU);
    g.ellipse(s * 0.16, 0, s * 0.14, s * 0.4, 0, 0, TAU);
  } else {
    // canine: pad plus four toes
    g.ellipse(0, s * 0.12, s * 0.3, s * 0.26, 0, 0, TAU);
    for (let i = 0; i < 4; i++) {
      const a = -0.7 + i * 0.47;
      g.ellipse(Math.sin(a) * s * 0.4, -Math.cos(a) * s * 0.34, s * 0.1, s * 0.13, a, 0, TAU);
    }
  }
  g.fill();
  g.restore();
}

// A strip of prints running along V. kind: 'wolf' | 'fox' | 'hare' | 'deer' | 'bird' | 'boot'
export function tracksTexture(kind = 'wolf', seed = 3) {
  return once(`tracks${kind}${seed}`, () => {
    const W = 128, H = 512;
    const c = mkCanvas(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const r = rnd(seed * 31 + 7);
    const size = kind === 'wolf' ? 34 : kind === 'deer' ? 38 : kind === 'fox' ? 22 : 24;
    const step = kind === 'hare' ? 128 : kind === 'bird' ? 40 : kind === 'boot' ? 84 : 64;
    let side = 1;
    for (let y = 30; y < H; y += step) {
      const x = W / 2 + side * (kind === 'hare' ? 14 : kind === 'boot' ? 14 : 12) + (r() - 0.5) * 6;
      const yy = y + (r() - 0.5) * 6;
      if (kind === 'bird') {
        g.strokeStyle = 'rgba(70,80,96,0.55)'; g.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + i * 6, yy - 10); g.stroke(); }
      } else if (kind === 'boot') {
        for (const [dx, dy, col] of [[1.8, 1.8, 'rgba(255,255,255,0.4)'], [0, 0, 'rgba(52,64,84,0.58)']]) {
          g.fillStyle = col;
          g.beginPath(); g.ellipse(x + dx, yy - 12 + dy, 11, 21, side * 0.06, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(x + dx, yy + 18 + dy, 9, 9, 0, 0, TAU); g.fill();
        }
      } else {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        paw(g, x + 1.5, yy + 1.5, size * 1.06, side * 0.08, kind);
        g.fillStyle = 'rgba(52,64,84,0.62)';
        paw(g, x, yy, size, side * 0.08, kind);
      }
      side = -side;
    }
    const t = toTex(c, { repeat: true });
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Two parallel furrows with the odd scuff: a body dragged by the heels.
export function dragTexture(seed = 5) {
  return once(`drag${seed}`, () => {
    const W = 128, H = 256;
    const c = mkCanvas(W, H);
    const g = c.getContext('2d');
    const r = rnd(seed);
    for (const cx of [42, 86]) {
      let x = cx;
      for (let y = 0; y < H; y += 2) {
        x += (r() - 0.5) * 1.1;
        x += (cx - x) * 0.05;
        const wob = 5 + Math.sin(y * 0.09 + cx) * 1.4;
        g.fillStyle = 'rgba(70,84,104,0.5)';
        g.fillRect(x - wob / 2, y, wob, 2.5);
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(x - wob / 2 - 2, y, 1.6, 2.5);
        g.fillRect(x + wob / 2, y, 1.6, 2.5);
      }
    }
    // scuffs and loose straw
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = 'rgba(200,180,120,0.7)';
      g.lineWidth = 1.2;
      const x = 20 + r() * 88, y = r() * H, a = r() * TAU;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke();
    }
    const t = toTex(c, { repeat: true });
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Soft blob with a noisy edge. rgb 0..255, used for moss, wet ground, soot, scorch.
export function blobTexture(name, { r = 70, g = 100, b = 50, a = 0.9, seed = 1, speck = 0.25, size = 128 } = {}) {
  return once(`blob${name}`, () => {
    const c = mkCanvas(size, size);
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
        const n = fbm(u * 5, v * 5, 5, 5, seed, 4);
        const n2 = fbm(u * 18, v * 18, 18, 18, seed + 9, 3);
        const edge = rr + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.35;
        const al = (1 - sstep(0.25, 0.9, edge)) * (1 - sstep(0.88, 1.0, rr));
        const m = 0.7 + 0.6 * fbm(u * 14, v * 14, 14, 14, seed + 3, 3);
        const sp = vn(u * 44, v * 44, 44, 44, seed + 8) > 0.7 ? 1 + speck : 1;
        const i = (y * size + x) * 4;
        im.data[i] = Math.min(255, r * m * sp); im.data[i + 1] = Math.min(255, g * m * sp); im.data[i + 2] = Math.min(255, b * m * sp);
        im.data[i + 3] = Math.max(0, Math.min(255, al * al * a * 255 * (0.65 + 0.5 * n2)));
      }
    }
    ctx.putImageData(im, 0, 0);
    const t = toTex(c, { repeat: false });
    return t;
  });
}

// Frost haze over dark ice with pale faces and reaching hands beneath it (the drowned fishermen).
// Canvas covers w x d meters at 100 px per meter; men: [{ x, z, ang }] in meters from the canvas center.
export function drownedTexture(W, D, men, seed = 9) {
  const PX = 96;
  const cw = Math.round(W * PX), ch = Math.round(D * PX);
  const c = mkCanvas(cw, ch);
  const g = c.getContext('2d');
  const r = rnd(seed);
  g.clearRect(0, 0, cw, ch);
  // haze: milky frost that thickens away from the figures so they read through a window of clearer ice
  const im = g.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const u = x / cw, v = y / ch;
      const mx = (x / PX - W / 2), mz = (y / PX - D / 2);
      let near = 9;
      for (const m of men) near = Math.min(near, Math.hypot(mx - m.x, mz - m.z));
      const n = fbm(u * 6, v * 4, 6, 4, seed, 4);
      const edge = sstep(0.12, 0.5, Math.min(u, 1 - u, (v) * 0.8, (1 - v) * 0.8) + (n - 0.5) * 0.2);
      const clear = 1 - sstep(0.5, 2.1, near);
      const a = edge * (0.14 + 0.5 * (1 - clear)) * (0.55 + n * 0.7);
      const i = (y * cw + x) * 4;
      im.data[i] = 214; im.data[i + 1] = 230; im.data[i + 2] = 240; im.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(im, 0, 0);
  // cracks
  g.strokeStyle = 'rgba(235,245,252,0.5)'; g.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    let x = r() * cw, y = r() * ch;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (r() - 0.4) * 60; y += (r() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  // figures
  for (const m of men) {
    g.save();
    g.translate((m.x + W / 2) * PX, (m.z + D / 2) * PX);
    g.rotate(m.ang);
    g.filter = 'blur(2.2px)';
    // dark coat and legs (blue-grey, below the frost)
    g.fillStyle = 'rgba(52,70,90,0.7)';
    g.beginPath(); g.ellipse(0, 55, 24, 62, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-9, 140, 9, 52, 0.08, 0, TAU); g.ellipse(9, 140, 9, 50, -0.08, 0, TAU); g.fill();
    // arms reaching up toward the ice, hands splayed
    g.strokeStyle = 'rgba(70,90,112,0.7)'; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-22, 30); g.quadraticCurveTo(-52, -2, -56, -34); g.stroke();
    g.beginPath(); g.moveTo(22, 30); g.quadraticCurveTo(46, 8, 40, -30); g.stroke();
    g.filter = 'blur(1.2px)';
    // hands
    g.fillStyle = 'rgba(214,226,232,0.92)';
    for (const [hx, hy, s] of [[-56, -40, 1], [40, -36, -1]]) {
      g.beginPath(); g.ellipse(hx, hy, 8, 9, 0, 0, TAU); g.fill();
      for (let f = 0; f < 5; f++) {
        const a = -1.9 + f * 0.32;
        g.beginPath(); g.ellipse(hx + Math.cos(a) * 12 * s, hy + Math.sin(a) * 13, 3, 8, a + Math.PI / 2, 0, TAU); g.fill();
      }
    }
    // face: pale oval, shallow sockets, a slack mouth; soft, as seen through ice
    g.filter = 'blur(2px)';
    g.fillStyle = 'rgba(206,220,228,0.94)';
    g.beginPath(); g.ellipse(0, -12, 15, 20, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(58,74,92,0.55)';
    g.beginPath(); g.ellipse(-6, -17, 3.4, 3.8, 0.1, 0, TAU); g.ellipse(6, -17, 3.4, 3.8, -0.1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(70,84,100,0.45)';
    g.beginPath(); g.ellipse(0, -1, 3.2, 4.4, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0, -9, 1.6, 4, 0, 0, TAU); g.fill();
    // hair and beard, dark and drifting
    g.fillStyle = 'rgba(46,58,72,0.7)';
    g.beginPath(); g.ellipse(0, -30, 17, 8, 0, Math.PI, TAU); g.fill();
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(-16 + i * 4, -26 - Math.abs(i - 4) * 0.3, 1.6, 9 + r() * 6, (i - 4) * 0.08, 0, TAU); g.fill(); }
    g.beginPath(); g.ellipse(0, 12, 11, 8, 0, 0, Math.PI); g.fill();
    g.restore();
  }
  // frost fur over everything: speckle
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(240,248,255,${0.05 + r() * 0.12})`;
    g.fillRect(r() * cw, r() * ch, 1 + r() * 2, 1 + r() * 2);
  }
  g.filter = 'none';
  const t = toTex(c, { repeat: false });
  t.anisotropy = 4;
  return t;
}

// Ring of refrozen ice with a milky skin: the old hole at the ritual site. Faint on purpose.
export function oldHoleTexture(seed = 4) {
  return once(`oldhole${seed}`, () => {
    const S = 256;
    const c = mkCanvas(S, S);
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
        const n = fbm(u * 6, v * 6, 6, 6, seed, 4);
        const rim = Math.exp(-Math.pow((rr - 0.62 - (n - 0.5) * 0.08) / 0.05, 2));
        const disc = (1 - sstep(0.5, 0.7, rr + (n - 0.5) * 0.12)) * 0.5;
        const bub = vn(u * 50, v * 50, 50, 50, seed + 5) > 0.82 ? 0.5 : 0;
        const outer = Math.exp(-Math.pow((rr - 0.9) / 0.1, 2)) * 0.2 * n;
        const a = Math.min(1, disc * 0.45 + rim * 0.75 + bub * disc + outer) * (1 - sstep(0.93, 1.0, rr));
        const i = (y * S + x) * 4;
        im.data[i] = 168; im.data[i + 1] = 196; im.data[i + 2] = 214;
        im.data[i + 3] = a * 255 * 0.7;
      }
    }
    ctx.putImageData(im, 0, 0);
    return toTex(c, { repeat: false });
  });
}

// Pressure cracks radiating from a point (a tower frozen into the ice, a drowned post): white fractures
// that thin out toward the rim, with a frosted skin near the center.
export function crackStarTexture(seed = 8) {
  return once(`crackstar${seed}`, () => {
    const S = 512;
    const c = mkCanvas(S, S);
    const g = c.getContext('2d');
    const r = rnd(seed);
    g.clearRect(0, 0, S, S);
    bleedFill(g, S, S, '#e6f0f6');
    const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.42);
    grad.addColorStop(0, 'rgba(226,238,246,0.55)');
    grad.addColorStop(0.5, 'rgba(210,228,240,0.22)');
    grad.addColorStop(1, 'rgba(200,222,236,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    const branch = (x, y, a, len, w, depth) => {
      if (len < 10 || depth > 4) return;
      const segs = 6;
      let px = x, py = y;
      for (let i = 0; i < segs; i++) {
        const na = a + (r() - 0.5) * 0.5;
        const nx = px + Math.cos(na) * len / segs, ny = py + Math.sin(na) * len / segs;
        const fade = 1 - Math.hypot(nx - S / 2, ny - S / 2) / (S * 0.5);
        if (fade <= 0) return;
        g.strokeStyle = `rgba(236,246,252,${0.15 + 0.6 * fade})`;
        g.lineWidth = Math.max(0.6, w * fade);
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        if (r() < 0.28) branch(nx, ny, na + (r() < 0.5 ? 0.7 : -0.7) * (0.6 + r() * 0.6), len * 0.55, w * 0.6, depth + 1);
        px = nx; py = ny;
      }
    };
    for (let i = 0; i < 17; i++) branch(S / 2, S / 2, (i / 17) * TAU + r() * 0.3, S * (0.18 + r() * 0.22), 3.2, 0);
    return toTex(c, { repeat: false });
  });
}

// A ring of pale runes: concentric circles, ticks and a spiral, for the place of power.
export function runeRingTexture(seed = 3) {
  return once(`runering${seed}`, () => {
    const S = 512;
    const c = mkCanvas(S, S);
    const g = c.getContext('2d');
    const r = rnd(seed);
    g.clearRect(0, 0, S, S);
    bleedFill(g, S, S, '#aeeaff');
    g.strokeStyle = 'rgba(170,236,255,0.85)';
    g.lineCap = 'round';
    for (const [rad, w, a] of [[0.46, 2.4, 0.8], [0.4, 1.4, 0.5], [0.22, 1.6, 0.6]]) {
      g.lineWidth = w; g.globalAlpha = a;
      g.beginPath(); g.arc(S / 2, S / 2, rad * S, 0, TAU); g.stroke();
    }
    g.globalAlpha = 0.7; g.lineWidth = 2;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU, r0 = 0.4 * S, r1 = (0.42 + (i % 4 === 0 ? 0.04 : 0.015)) * S;
      g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); g.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); g.stroke();
    }
    g.globalAlpha = 0.55; g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= 160; k++) { const t = k / 160, an = t * TAU * 3.5; g.lineTo(S / 2 + Math.cos(an) * t * S * 0.2, S / 2 + Math.sin(an) * t * S * 0.2); }
    g.stroke();
    // broken glyph strokes between the circles
    g.globalAlpha = 0.75; g.lineWidth = 2.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + r() * 0.1, d0 = 0.28 * S, d1 = 0.36 * S;
      g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * d0, S / 2 + Math.sin(a) * d0);
      g.lineTo(S / 2 + Math.cos(a + 0.07) * (d0 + d1) / 2, S / 2 + Math.sin(a + 0.07) * (d0 + d1) / 2);
      g.lineTo(S / 2 + Math.cos(a - 0.03) * d1, S / 2 + Math.sin(a - 0.03) * d1); g.stroke();
    }
    return toTex(c, { repeat: false });
  });
}

// Where a fishing stool stood: a rubbed-bare disc with three leg dents and a scuff of frost.
export function stoolMarkTexture() {
  return once('stoolmark', () => {
    const S = 128;
    const c = mkCanvas(S, S);
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    bleedFill(g, S, S, '#dce8f0');
    const grad = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * 0.46);
    grad.addColorStop(0, 'rgba(236,244,250,0.55)');
    grad.addColorStop(0.7, 'rgba(210,226,238,0.35)');
    grad.addColorStop(1, 'rgba(200,220,235,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      g.fillStyle = 'rgba(38,52,70,0.65)';
      g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * 24, S / 2 + Math.sin(a) * 24, 4.5, 4.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * 24 + 2, S / 2 + Math.sin(a) * 24 + 2, 3, 3, 0, 0, TAU); g.fill();
    }
    return toTex(c, { repeat: false });
  });
}

// Handwritten scrawl: text drawn glyph by glyph, jittered like a hand with a burnt stick.
// lines: array of strings; ink: css color; paper: css color or null for transparent.
export function scrawlTexture(lines, { w = 512, h = 256, ink = '#17110d', paper = null, size = 64, seed = 2, weight = 5, rotate = 0.04 } = {}) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  if (paper) { g.fillStyle = paper; g.fillRect(0, 0, w, h); } else bleedFill(g, w, h, ink);
  const r = rnd(seed);
  g.fillStyle = ink; g.strokeStyle = ink;
  g.lineCap = 'round';
  g.textBaseline = 'alphabetic';
  let y = size * 0.95;
  lines.forEach((line, li) => {
    let fs = size * (line.fs || 1);
    const text = line.t || line;
    g.font = `bold ${fs}px ${SCRAWL_FONT}`;
    const tw = g.measureText(text).width * 0.98;
    if (tw > w - 44) { fs *= (w - 44) / tw; g.font = `bold ${fs}px ${SCRAWL_FONT}`; }
    let x = 16 + r() * 12;
    for (const ch of text) {
      g.save();
      const jx = (r() - 0.5) * 3, jy = (r() - 0.5) * fs * 0.12;
      g.translate(x + jx, y + jy);
      g.rotate((r() - 0.5) * rotate * 6 + (li % 2 ? rotate : -rotate) * 0.4);
      g.scale(1, 1 + (r() - 0.5) * 0.18);
      g.fillText(ch, 0, 0);
      // second pass, offset: charcoal smear
      g.globalAlpha = 0.5;
      g.fillText(ch, (r() - 0.5) * weight * 0.5, (r() - 0.5) * weight * 0.4);
      g.restore();
      x += g.measureText(ch).width * (0.92 + r() * 0.12);
    }
    y += fs * 1.08;
  });
  // grain and rubbed-off patches
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.4})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2);
  }
  g.globalCompositeOperation = 'source-over';
  const t = toTex(c, { repeat: false });
  t.anisotropy = 4;
  return t;
}

// Painted or carved wooden sign board: light letters scratched on a dark plank, or dark on pale.
export function signTexture(text, { w = 512, h = 128, bg = '#6a5640', ink = '#e8dcc0', arrow = 'right', seed = 3 } = {}) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  const r = rnd(seed);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`;
    g.fillRect(0, y, w, 2);
  }
  g.fillStyle = ink;
  g.font = `bold ${Math.round(h * 0.46)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = arrow === 'left' ? 'right' : 'left';
  const tx = arrow === 'left' ? w - h * 0.9 : h * 0.4;
  g.fillText(text, tx, h * 0.52);
  // arrow notch
  g.beginPath();
  if (arrow === 'right') { g.moveTo(w - 6, h / 2); g.lineTo(w - h * 0.45, 8); g.lineTo(w - h * 0.45, h - 8); } else { g.moveTo(6, h / 2); g.lineTo(h * 0.45, 8); g.lineTo(h * 0.45, h - 8); }
  g.closePath(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  const t = toTex(c, { repeat: false });
  t.anisotropy = 4;
  return t;
}

export const tex = { tracks: tracksTexture, drag: dragTexture, blob: blobTexture, drowned: drownedTexture, oldHole: oldHoleTexture, scrawl: scrawlTexture, sign: signTexture, crackStar: crackStarTexture, stoolMark: stoolMarkTexture, runeRing: runeRingTexture };

// ---------------------------------------------------------------------------------------------
// Meshes.

// Rectangle (w along its local x, d along its local z) draped over the terrain.
export function groundPatch(G, o) {
  const { x, z, w, d, yaw = 0, map, lift = 0.05, opacity = 1, color = 0xffffff, order = 3, name = 'groundPatch', emissive = 0x000000, emissiveIntensity = 0 } = o;
  const nx = Math.max(2, Math.ceil(w / 1.2)), nz = Math.max(2, Math.ceil(d / 1.2));
  const pos = [], uv = [], idx = [];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = (i / nx - 0.5) * w, lz = (j / nz - 0.5) * d;
      const wx = x + lx * cs + lz * sn, wz = z - lx * sn + lz * cs;
      pos.push(wx, G.world.heightAt(wx, wz) + lift, wz);
      uv.push(i / nx, 1 - j / nz);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const dm = decalMaterial(map, { opacity, color, order, emissive, emissiveIntensity });
  if (emissiveIntensity > 0) { dm.emissiveMap = map; dm.emissive.set(emissive || 0xffffff); }
  const mesh = new THREE.Mesh(geo, dm);
  mesh.renderOrder = order;
  mesh.receiveShadow = true;
  mesh.name = `wild:${name}`;
  G.scene.add(mesh);
  return mesh;
}

// Strip along a polyline [[x, z], ...]; V runs along the path, repeating every `repeat` meters.
export function groundRibbon(G, o) {
  const { pts, width = 1, map, repeat = 4, lift = 0.05, opacity = 1, color = 0xffffff, order = 3, name = 'groundRibbon', step = 1.2 } = o;
  // resample evenly
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) path.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  path.push(pts[pts.length - 1]);
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i) acc += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
    for (const s of [-1, 1]) {
      const wx = p[0] - tz * s * width / 2, wz = p[1] + tx * s * width / 2;
      pos.push(wx, G.world.heightAt(wx, wz) + lift, wz);
      uv.push(s < 0 ? 0 : 1, acc / repeat);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, e = a + 3;
    idx.push(a, c, b, b, c, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  map.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(geo, decalMaterial(map, { opacity, color, order }));
  mesh.renderOrder = order;
  mesh.receiveShadow = true;
  mesh.name = `wild:${name}`;
  G.scene.add(mesh);
  return mesh;
}

// Flat decal on the ice surface. Renders after the ice (renderOrder) with a stronger polygon offset
// than the ice itself, and fades out as the ice thaws.
export function icePlane(G, o) {
  const { x, z, w, d, yaw = 0, map, lift = 0.012, opacity = 1, color = 0xffffff, order = 6, name = 'iceDecal', emissive = 0x000000, emissiveIntensity = 0 } = o;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mat = decalMaterial(map, { opacity, color, order, offset: -8, emissive, emissiveIntensity });
  if (emissiveIntensity > 0) { mat.emissiveMap = map; mat.emissive.set(emissive || 0xffffff); }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, lift, z);
  mesh.rotation.y = yaw;
  mesh.renderOrder = order;
  mesh.receiveShadow = true;
  mesh.name = `wild:${name}`;
  G.scene.add(mesh);
  iceFade(G, mat, opacity);
  return mesh;
}

// Fade a material with the thaw: opacity = base * (1 - thaw * 2.2).
export function iceFade(G, mat, base = 1) {
  G.addSystem(`wildFade:${mat.uuid.slice(0, 6)}`, () => {
    const t = G.water?.thaw ?? 0;
    mat.opacity = base * Math.max(0, 1 - t * 2.4);
  }, ORDER.atmosphere + 2);
}

// Upright board with scrawled text (a plank on stakes, a wall). Returns a Mesh facing +Z at the origin,
// bottom edge at y = 0; place it with position and rotation.y.
export function scrawlBoard(G, o) {
  const { lines, w = 1.2, h = 0.6, paper = '#6a5844', ink = '#17110d', size = 56, seed = 2, canvasW = 512, canvasH = 256 } = o;
  const map = scrawlTexture(lines, { w: canvasW, h: canvasH, ink, paper, size, seed });
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'wild:scrawl';
  return mesh;
}

// Transparent scrawl (chalk or charcoal straight onto a surface) as a plane.
export function scrawlDecal(G, o) {
  const { lines, w = 1.2, h = 0.6, ink = '#e8e4da', size = 56, seed = 2, canvasW = 512, canvasH = 256 } = o;
  const map = scrawlTexture(lines, { w: canvasW, h: canvasH, ink, paper: null, size, seed });
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'wild:scrawlDecal';
  mesh.renderOrder = 3;
  return mesh;
}

export function signBoard(G, o) {
  const { text, w = 1.5, h = 0.34, bg, ink, seed } = o;
  const ch = Math.round(512 * h / w);
  const front = signTexture(text, { arrow: 'right', bg, ink, seed, w: 512, h: ch });
  const back = signTexture(text, { arrow: 'left', bg, ink, seed: (seed || 3) + 1, w: 512, h: ch });
  const geo = new THREE.BoxGeometry(w, h, 0.05);
  const side = new THREE.MeshStandardMaterial({ color: 0x4a3e32, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, [side, side, side, side, new THREE.MeshStandardMaterial({ map: front, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: back, roughness: 0.9 })]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'wild:sign';
  return mesh;
}
