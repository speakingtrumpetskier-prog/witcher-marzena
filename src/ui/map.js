// Map (M): a painted parchment map generated from G.world at load.
//
// Raster base (built once, time-sliced after game:ready): parchment tone, hillshade from the
// height grid, contour hints, hachures on steep ground, forest stipple. Vector layers drawn live
// at the current zoom: lake shore in ink with water-lining, the island, river, dotted roads,
// place glyphs and labels (only for discovered LOC entries with map:true), objective markers and
// the player arrow. A fog-of-war veil of parchment wash covers everything not yet seen: seen
// means near a discovered place or near where the player has walked (trail cells are stored in
// G.state.data.mapTrail so they ride along with the save).
//
// Controls: drag or WASD to pan, wheel or Q/E to zoom, Space to centre on the player, M/Esc to close.
import { h, svg, clear, store } from './dom.js';
import { ICON } from './icons.js';
import { paperCanvas, grainURL, tornClip } from './paper.js';
import { createNoise } from '../core/Noise.js';
import { hashString, rng, smoothstep } from '../core/util.js';
import { LOC, ROADS, LAKE, RIVER } from '../world/layout.js';
import { lakeSDF } from '../world/heightfield.js';

const HALF = 640;           // map covers [-640, 640] on both axes
const SPAN = HALF * 2;
const CELL = 30;            // trail cell size, meters
const CELLS = Math.ceil(SPAN / CELL);
const INK = '#2a1e14';
const INK_RGB = '42,30,20';
const PARCH = '#dccfa8';
const noise = createNoise(8821);

// ---- glyphs: tiny ink drawings centred on (0,0), unit s = half size in px -------------------
function stroke(ctx, w = 1.3) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
function housePath(ctx, x, y, s) {
  ctx.moveTo(x - s, y + s * 0.5); ctx.lineTo(x - s, y - s * 0.15); ctx.lineTo(x, y - s * 0.85); ctx.lineTo(x + s, y - s * 0.15); ctx.lineTo(x + s, y + s * 0.5); ctx.closePath();
}
const GLYPHS = {
  village(ctx, s) {
    const spots = [[-1.25, 0.35, 0.55], [0.1, -0.1, 0.8], [1.4, 0.45, 0.55], [-0.5, 1.15, 0.5], [0.95, 1.25, 0.5], [-1.5, 1.2, 0.42]];
    for (const [x, y, k] of spots) {
      ctx.beginPath(); housePath(ctx, x * s, y * s, k * s); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.2);
    }
    ctx.beginPath(); ctx.moveTo(0.35 * s, -0.7 * s); ctx.bezierCurveTo(0.2 * s, -1.2 * s, 0.7 * s, -1.4 * s, 0.4 * s, -1.9 * s); stroke(ctx, 1);
  },
  bellTower(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-0.38 * s, 1.1 * s); ctx.lineTo(-0.34 * s, -0.45 * s); ctx.lineTo(0, -1.5 * s); ctx.lineTo(0.34 * s, -0.45 * s); ctx.lineTo(0.38 * s, 1.1 * s); ctx.closePath();
    ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    ctx.beginPath(); ctx.arc(0, -0.15 * s, 0.13 * s, 0, 7); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1.1 * s, 1.15 * s); ctx.lineTo(-0.5 * s, 1.15 * s); ctx.moveTo(0.5 * s, 1.15 * s); ctx.lineTo(1.1 * s, 1.15 * s); stroke(ctx, 1);
  },
  watchtower(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-0.5 * s, 1 * s); ctx.lineTo(-0.5 * s, -0.7 * s); ctx.lineTo(-0.25 * s, -0.3 * s); ctx.lineTo(0, -1 * s); ctx.lineTo(0.2 * s, -0.5 * s); ctx.lineTo(0.5 * s, -0.8 * s); ctx.lineTo(0.5 * s, 1 * s); ctx.closePath();
    ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.5 * s, (0.1 + i * 0.3) * s); ctx.lineTo(0.5 * s, (0.1 + i * 0.3) * s); stroke(ctx, 0.6); }
  },
  idol(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1.3 * s, 0.9 * s); ctx.quadraticCurveTo(0, 0.1 * s, 1.3 * s, 0.9 * s); stroke(ctx, 1);
    ctx.beginPath(); ctx.rect(-0.28 * s, -1.2 * s, 0.56 * s, 1.9 * s); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.28 * s, (-0.7 + i * 0.5) * s); ctx.lineTo(0.28 * s, (-0.7 + i * 0.5) * s); stroke(ctx, 0.7); }
  },
  graveyard(ctx, s) {
    for (const [x, y] of [[-0.8, 0.2], [0, -0.3], [0.8, 0.3]]) {
      ctx.beginPath(); ctx.moveTo(x * s, (y - 0.5) * s); ctx.lineTo(x * s, (y + 0.7) * s); ctx.moveTo((x - 0.28) * s, (y - 0.15) * s); ctx.lineTo((x + 0.28) * s, (y - 0.15) * s); stroke(ctx, 1.3);
    }
  },
  mill(ctx, s) {
    ctx.beginPath(); ctx.arc(-0.6 * s, 0.1 * s, 0.7 * s, 0, 7); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.2);
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(-0.6 * s + Math.cos(a) * 0.7 * s, 0.1 * s + Math.sin(a) * 0.7 * s); ctx.lineTo(-0.6 * s - Math.cos(a) * 0.7 * s, 0.1 * s - Math.sin(a) * 0.7 * s); stroke(ctx, 0.7); }
    ctx.beginPath(); housePath(ctx, 0.85 * s, 0.1 * s, 0.6 * s); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.2);
  },
  waterfall(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1 * s, -0.9 * s); ctx.lineTo(1 * s, -0.9 * s); stroke(ctx, 1.4);
    for (const x of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.moveTo(x * s, -0.9 * s); ctx.bezierCurveTo((x + 0.15) * s, -0.3 * s, (x - 0.15) * s, 0.3 * s, x * s, 0.9 * s); stroke(ctx, 1); }
    ctx.beginPath(); ctx.arc(-0.2 * s, 1.1 * s, 0.3 * s, Math.PI, 0); ctx.arc(0.35 * s, 1.1 * s, 0.25 * s, Math.PI, 0); stroke(ctx, 0.9);
  },
  bearDen(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1.2 * s, 0.9 * s); ctx.quadraticCurveTo(-1 * s, -0.9 * s, 0, -0.9 * s); ctx.quadraticCurveTo(1 * s, -0.9 * s, 1.2 * s, 0.9 * s); ctx.closePath();
    ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.9 * s); ctx.quadraticCurveTo(-0.5 * s, -0.2 * s, 0, -0.2 * s); ctx.quadraticCurveTo(0.5 * s, -0.2 * s, 0.5 * s, 0.9 * s); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
  },
  hunterCabin(ctx, s) {
    ctx.beginPath(); housePath(ctx, 0, 0, s * 0.95); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    ctx.beginPath(); ctx.rect(0.35 * s, -1.05 * s, 0.24 * s, 0.5 * s); stroke(ctx, 1);
    ctx.beginPath(); ctx.moveTo(-0.95 * s, 0.1 * s); ctx.lineTo(0.95 * s, 0.1 * s); stroke(ctx, 0.6);
  },
  charcoal(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1 * s, 0.8 * s); ctx.quadraticCurveTo(0, -1.2 * s, 1 * s, 0.8 * s); ctx.closePath(); ctx.fillStyle = 'rgba(42,30,20,0.35)'; ctx.fill(); stroke(ctx, 1.2);
    ctx.beginPath(); ctx.moveTo(0.1 * s, -0.6 * s); ctx.bezierCurveTo(-0.3 * s, -1 * s, 0.4 * s, -1.2 * s, 0, -1.7 * s); stroke(ctx, 0.9);
  },
  crossroads(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1 * s, -1 * s); ctx.lineTo(1 * s, 1 * s); ctx.moveTo(1 * s, -1 * s); ctx.lineTo(-1 * s, 1 * s); stroke(ctx, 1.5);
    ctx.beginPath(); ctx.arc(0, 0, 0.28 * s, 0, 7); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.1);
  },
  hotSpring(ctx, s) {
    ctx.beginPath(); ctx.ellipse(0, 0.7 * s, 1 * s, 0.4 * s, 0, 0, 7); ctx.fillStyle = 'rgba(120,150,160,0.5)'; ctx.fill(); stroke(ctx, 1.1);
    for (const x of [-0.45, 0.35]) { ctx.beginPath(); ctx.moveTo(x * s, 0.2 * s); ctx.bezierCurveTo((x - 0.4) * s, -0.3 * s, (x + 0.4) * s, -0.6 * s, x * s, -1.2 * s); stroke(ctx, 0.9); }
  },
  marsh(ctx, s) {
    for (const [x, y] of [[-0.9, 0.5], [-0.2, 0.7], [0.5, 0.4], [1.0, 0.8], [-0.5, -0.2], [0.2, -0.4]]) {
      ctx.beginPath(); ctx.moveTo(x * s, y * s); ctx.lineTo(x * s, (y - 0.9) * s); ctx.moveTo((x - 0.25) * s, (y - 0.4) * s); ctx.lineTo(x * s, (y - 0.9) * s); ctx.lineTo((x + 0.25) * s, (y - 0.4) * s); stroke(ctx, 0.9);
    }
  },
  passStart(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-1.4 * s, 0.9 * s); ctx.lineTo(-0.7 * s, -0.8 * s); ctx.lineTo(-0.2 * s, 0.1 * s); ctx.moveTo(0.2 * s, 0.1 * s); ctx.lineTo(0.7 * s, -0.8 * s); ctx.lineTo(1.4 * s, 0.9 * s); stroke(ctx, 1.4);
    ctx.beginPath(); ctx.moveTo(-0.15 * s, 1.0 * s); ctx.lineTo(0, 0.2 * s); ctx.lineTo(0.15 * s, 1.0 * s); stroke(ctx, 0.9);
  },
  iceCamp(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-0.9 * s, 0.7 * s); ctx.lineTo(0, -0.9 * s); ctx.lineTo(0.9 * s, 0.7 * s); ctx.closePath(); ctx.fillStyle = PARCH; ctx.fill(); stroke(ctx, 1.3);
    for (const x of [-1.4, 1.4]) { ctx.beginPath(); ctx.arc(x * s, 0.9 * s, 0.14 * s, 0, 7); ctx.fillStyle = INK; ctx.fill(); }
  },
  ritual(ctx, s) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const x = Math.cos(a) * 0.95 * s, y = Math.sin(a) * 0.95 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 0.5 * s); stroke(ctx, 1.2); }
    ctx.beginPath(); ctx.arc(0, 0, 0.3 * s, 0, 7); ctx.fillStyle = '#9a2e22'; ctx.fill();
  },
  island(ctx, s) {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 0.9 * s, Math.sin(a) * 0.9 * s, 0.17 * s, 0.24 * s, 0, 0, 7); ctx.fillStyle = INK; ctx.fill(); }
  },
};

function pathSmooth(ctx, pts, closed = true) {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  if (closed) ctx.closePath();
}

export class MapView {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.scr = null;
    this.N = G.quality === 'high' ? 1024 : 768;
    this.base = null;
    this.ready = null;
    this.shores = null;
    this.island = null;
    this.veil = null;
    this.veilKey = '';
    this.cx = 0; this.cz = 0; this.scale = 0.5; this.fit = 0.5;
    this.dirty = true;
    this._trackT = 0;
    this._lastCell = -1;
    this._objs = [];
    this._objT = 0;
    // Start charting once the world is up, in small slices so the game never hitches.
    G.events.on('game:ready', () => this.prepare());
    if (G.clock.frame > 5) this.prepare();
  }

  get isOpen() { return !!this.scr?.open; }
  close() { return this.scr?.close(); }

  // Build (once) and return a promise for the raster base.
  prepare() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      const go = () => this._buildBase().then(resolve).catch((e) => { console.error('[map]', e); this.G.errors.push(`map: ${e.message}`); resolve(); });
      setTimeout(go, 600);
    });
    return this.ready;
  }

  async _buildBase() {
    const G = this.G, W = G.world, N = this.N;
    const cell = SPAN / N;
    const slice = async () => new Promise((r) => setTimeout(r, 0));
    // Parchment tone first.
    const paper = paperCanvas(N >> 1, N >> 1, { seed: 5, edge: 0.0, stain: 1.2 });
    const base = document.createElement('canvas');
    base.width = base.height = N;
    const ctx = base.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(paper, 0, 0, N, N);
    const img = ctx.getImageData(0, 0, N, N);
    const px = img.data;

    // Heights with a one pixel border.
    const S = N + 2;
    const hts = new Float32Array(S * S);
    let t0 = performance.now();
    for (let j = 0; j < S; j++) {
      const z = -HALF + (j - 0.5) * cell;
      for (let i = 0; i < S; i++) hts[j * S + i] = W.heightAt(-HALF + (i - 0.5) * cell, z);
      if (performance.now() - t0 > 14) { await slice(); t0 = performance.now(); }
    }

    const L = [-0.55, 0.65, -0.52];
    const ll = Math.hypot(...L);
    L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const slopeAt = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const o = (j + 1) * S + i + 1;
        const hc = hts[o];
        const dhx = (hts[o + 1] - hts[o - 1]) / (2 * cell);
        const dhz = (hts[o + S] - hts[o - S]) / (2 * cell);
        const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
        const shade = (-dhx * L[0] + L[1] - dhz * L[2]) * inv;
        const slope = Math.sqrt(dhx * dhx + dhz * dhz);
        slopeAt[j * N + i] = slope;
        let k = (shade - L[1]) * 1.35 - slope * 0.1;
        // contour hints
        if (hc > 0.6) {
          const a = Math.floor(hc / 20);
          if (a !== Math.floor(hts[o + 1] / 20) || a !== Math.floor(hts[o + S] / 20)) k -= a % 5 === 0 ? 0.17 : 0.07;
        }
        const alt = Math.min(1, Math.max(0, hc / 240));
        const p = (j * N + i) * 4;
        const f = 1 + k;
        px[p] = Math.min(255, px[p] * f * (1 - alt * 0.07));
        px[p + 1] = Math.min(255, px[p + 1] * f * (1 - alt * 0.04));
        px[p + 2] = Math.min(255, px[p + 2] * f * (1 + alt * 0.0));
      }
      if (j % 24 === 0 && performance.now() - t0 > 14) { await slice(); t0 = performance.now(); }
    }
    ctx.putImageData(img, 0, 0);

    // Hachures on steep ground.
    const r = rng(77);
    ctx.lineCap = 'round';
    for (let y = 4; y < N - 4; y += 6) {
      for (let x = 4; x < N - 4; x += 6) {
        const jx = x + (r() - 0.5) * 5, jy = y + (r() - 0.5) * 5;
        const ix = Math.max(0, Math.min(N - 1, jx | 0)), iy = Math.max(0, Math.min(N - 1, jy | 0));
        const sl = slopeAt[iy * N + ix];
        if (sl < 0.42 || r() > Math.min(0.85, (sl - 0.3) * 1.1)) continue;
        const o = (iy + 1) * S + ix + 1;
        let gx = hts[o + 1] - hts[o - 1], gz = hts[o + S] - hts[o - S];
        const gl = Math.hypot(gx, gz) || 1;
        gx /= gl; gz /= gl;
        const len = 2.5 + Math.min(5, sl * 3);
        ctx.strokeStyle = `rgba(${INK_RGB},${0.16 + Math.min(0.3, sl * 0.12)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(jx - gx * len * 0.5, jy - gz * len * 0.5);
        ctx.lineTo(jx + gx * len * 0.5, jy + gz * len * 0.5);
        ctx.stroke();
      }
      if (y % 24 === 0 && performance.now() - t0 > 14) { await slice(); t0 = performance.now(); }
    }

    // Forest stipple: tiny pines where trees likely stand.
    const treeAt = G.vegetation?.treeAt ? (x, z) => { try { return !!G.vegetation.treeAt(x, z, 5); } catch { return false; } } : null;
    const roadNear = (x, z) => ROADS.some((rd) => {
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - (ax + dx * tt), z - (az + dz * tt)) < rd.width * 0.5 + 5) return true;
      }
      return false;
    });
    const locNear = (x, z) => Object.values(LOC).some((l) => l.r >= 5 && Math.hypot(x - l.x, z - l.z) < l.r + 6 && l.r < 60);
    const village = LOC.village;
    const rf = rng(131);
    ctx.lineWidth = 0.9;
    for (let y = 6; y < N - 6; y += 7) {
      for (let x = 6; x < N - 6; x += 7) {
        const jx = x + (rf() - 0.5) * 6, jy = y + (rf() - 0.5) * 6;
        const wx = -HALF + jx * cell, wz = -HALF + jy * cell;
        const hc = hts[((jy | 0) + 1) * S + (jx | 0) + 1];
        if (hc < 0.8 || hc > 150) continue;
        if (slopeAt[(jy | 0) * N + (jx | 0)] > 0.55) continue;
        if (lakeSDF(wx, wz) < 6) continue;
        if (Math.hypot(wx - village.x, wz - village.z) < 88) continue;
        let tree;
        if (treeAt) tree = treeAt(wx, wz);
        else {
          const n = noise.fbm2(wx * 0.0052 + 3, wz * 0.0052 - 8, 3);
          tree = n > -0.12 + (hc / 150) * 0.4 - 0.1 && noise.noise2(wx * 0.05, wz * 0.05) > -0.5;
        }
        if (!tree || roadNear(wx, wz) || locNear(wx, wz)) continue;
        ctx.strokeStyle = `rgba(${INK_RGB},0.5)`;
        ctx.beginPath();
        ctx.moveTo(jx - 2.3, jy + 1.6); ctx.lineTo(jx, jy - 3); ctx.lineTo(jx + 2.3, jy + 1.6);
        ctx.moveTo(jx, jy - 0.4); ctx.lineTo(jx, jy + 3);
        ctx.stroke();
      }
      if (y % 21 === 0 && performance.now() - t0 > 14) { await slice(); t0 = performance.now(); }
    }

    // Edge burn so the sheet reads aged.
    const eg = ctx.createRadialGradient(N / 2, N / 2, N * 0.42, N / 2, N / 2, N * 0.74);
    eg.addColorStop(0, 'rgba(70,45,20,0)');
    eg.addColorStop(1, 'rgba(70,45,20,0.34)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, N, N);

    this.base = base;
    this._buildShores();
    this.dirty = true;
  }

  // Lake outline and island outline by ray-marching the signed distance field.
  _buildShores() {
    const W = this.G.world;
    const find = (cx, cz, f, rmax) => {
      const out = [];
      for (let a = 0; a < 360; a += 2) {
        const dx = Math.cos((a * Math.PI) / 180), dz = Math.sin((a * Math.PI) / 180);
        let lo = 0, hi = rmax;
        for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (f(cx + dx * m, cz + dz * m)) lo = m; else hi = m; }
        out.push([cx + dx * lo, cz + dz * lo]);
      }
      return out;
    };
    this.shores = [0, -9, -20].map((d) => find(LAKE.x, LAKE.z, (x, z) => lakeSDF(x, z) < d, 420));
    this.island = find(-120, -190, (x, z) => W.terrainAt(x, z) > 0.28, 60);
    this.islandIn = this.island.map(([x, z]) => [-120 + (x + 120) * 0.62, -190 + (z + 190) * 0.62]);
  }

  // ---- fog of war --------------------------------------------------------------------------
  _trailSet() {
    const d = this.G.state?.data;
    if (!d) return [];
    if (!Array.isArray(d.mapTrail)) d.mapTrail = [];
    return d.mapTrail;
  }

  trackPlayer(dt) {
    const p = this.G.player?.position;
    if (!p || this.G.input?.context !== 'game') return;
    this._trackT -= dt;
    if (this._trackT > 0) return;
    this._trackT = 0.5;
    const cx = Math.floor((p.x + HALF) / CELL), cz = Math.floor((p.z + HALF) / CELL);
    if (cx < 0 || cz < 0 || cx >= CELLS || cz >= CELLS) return;
    const id = cz * CELLS + cx;
    if (id === this._lastCell) return;
    this._lastCell = id;
    const tr = this._trailSet();
    if (!tr.includes(id)) { tr.push(id); this.veilKey = ''; }
  }

  _revealCircles() {
    const circles = [];
    const S = this.G.state?.data;
    for (const id of S?.discovered || []) {
      const l = LOC[id];
      if (l) circles.push([l.x, l.z, Math.max(70, l.r * 2.4)]);
    }
    for (const id of S?.mapTrail || []) {
      circles.push([-HALF + ((id % CELLS) + 0.5) * CELL, -HALF + (Math.floor(id / CELLS) + 0.5) * CELL, 78]);
    }
    const pp = this.G.player?.position;
    if (pp) circles.push([pp.x, pp.z, 78]);
    return circles;
  }

  _buildVeil() {
    const circles = this._revealCircles();
    const key = `${circles.length}|${this.N}`;
    if (key === this.veilKey && this.veil) return;
    this.veilKey = key;
    const V = 512, k = V / SPAN;
    if (!this.veil) {
      this.veil = document.createElement('canvas');
      this.veil.width = this.veil.height = V;
      this.veilBase = paperCanvas(256, 256, { seed: 9, edge: 0, stain: 0.6, tone: [214, 200, 164] });
    }
    const c = this.veil.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, V, V);
    c.globalAlpha = 0.9;
    c.drawImage(this.veilBase, 0, 0, V, V);
    c.globalAlpha = 1;
    // wispy cloud texture so the veil reads as a wash, not a flat sheet
    const id = c.getImageData(0, 0, V, V);
    for (let y = 0; y < V; y += 1) {
      for (let x = 0; x < V; x += 1) {
        const n = noise.fbm2(x * 0.02, y * 0.02, 3);
        const o = (y * V + x) * 4;
        id.data[o + 3] = Math.max(0, Math.min(255, 224 + n * 38));
      }
    }
    c.putImageData(id, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    for (const [x, z, rr] of circles) {
      const sx = (x + HALF) * k, sy = (z + HALF) * k, sr = rr * k;
      const g = c.createRadialGradient(sx, sy, sr * 0.35, sx, sy, sr);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    c.globalCompositeOperation = 'source-over';
  }

  // ---- open / close ------------------------------------------------------------------------
  open(opts = {}) {
    if (this.scr?.open) return this.scr.closed;
    this._buildDom();
    this.scr = this.ui.openScreen({
      name: 'map',
      el: this.el,
      onKey: (e) => this._key(e),
      onClose: () => { this._running = false; window.removeEventListener('keyup', this._keyUp); },
    });
    this.keys = new Set();
    this._keyUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keyup', this._keyUp);
    this._running = true;
    this._opts = opts;
    this._size();
    this._resetView(opts);
    const loop = (t) => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      this._tick(t);
    };
    requestAnimationFrame(loop);
    if (!this.base) { this.status.textContent = 'Charting the valley'; this.status.style.opacity = 1; }
    this.prepare().then(() => { if (this.status) this.status.style.opacity = 0; this.dirty = true; });
    return this.scr.closed;
  }

  _buildDom() {
    const paper = paperCanvas(320, 210, { seed: 33, edge: 0.9 });
    paper.className = 'paper';
    this.canvas = h('canvas', { class: 'mz-map-canvas' });
    this.status = h('div', { class: 'mz-map-status' });
    this.cartouche = h('div', { class: 'mz-map-title' },
      h('div', { class: 'sub' }, 'Dzwonne, the valley of'), h('h2', null, 'Bellmere'), h('div', { class: 'rule' }, svg(ICON.knot)));
    const lg = (icon, text) => h('div', { class: 'lg' }, icon, h('span', null, text));
    this.legend = h('div', { class: 'mz-map-legend' },
      lg(svg('<svg viewBox="0 0 24 24"><path d="M12 3l6 17-6-4-6 4z" fill="#2a1e14" stroke="#e9dcb8" stroke-width="1.2"/></svg>'), 'You'),
      lg(svg('<svg viewBox="0 0 24 24"><path d="M12 2.6 20.6 12 12 21.4 3.4 12z" fill="#9a2e22" stroke="#2a1e14" stroke-width="1.2"/></svg>'), 'Objective'),
      lg(svg('<svg viewBox="0 0 24 24" fill="none" stroke="#2a1e14" stroke-width="1.4" stroke-linecap="round"><path d="M3 18C8 18 8 8 13 8s5 10 8 10" stroke-dasharray="1 3.4"/></svg>'), 'Road'));
    this.hintEl = h('div', { class: 'mz-map-hint' }, h('span', { class: 'k' }, 'Drag'), ' Move', h('i'), h('span', { class: 'k' }, 'Wheel'), ' Zoom', h('i'), h('span', { class: 'k' }, 'Space'), ' Centre', h('i'), h('span', { class: 'k' }, 'M'), ' Close');
    const sheet = h('div', { class: 'mz-map-sheet' }, paper, h('div', { class: 'grain', style: { backgroundImage: `url(${grainURL()})` } }), this.canvas, this.cartouche, this.legend, this.hintEl, this.status);
    sheet.style.clipPath = tornClip(11, 34, 0.7);
    this.sheet = sheet;
    this.el = h('div', { class: 'mz-mapmodal' }, h('div', { class: 'mz-map-wrap' }, sheet));
    this._pointer();
    this._ro = new ResizeObserver(() => { this._size(); });
    this._ro.observe(this.sheet);
  }

  _size() {
    const c = this.canvas;
    if (!c) return;
    const r = this.sheet.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(200, Math.round(r.width));
    this.ch = Math.max(160, Math.round(r.height));
    c.width = Math.round(this.cw * dpr);
    c.height = Math.round(this.ch * dpr);
    this.dpr = dpr;
    this.margin = Math.round(Math.min(this.cw, this.ch) * 0.045) + 6;
    this.fit = Math.min(this.cw - this.margin * 2, this.ch - this.margin * 2) / SPAN;
    this.dirty = true;
  }

  _resetView(opts) {
    const pp = this.G.player?.position;
    this.minScale = this.fit * 0.95;
    this.maxScale = this.fit * 7;
    if (opts.center) { this.cx = opts.center[0]; this.cz = opts.center[1]; this.scale = this.fit * (opts.zoom ?? 2); } else if (pp) { this.cx = pp.x; this.cz = pp.z; this.scale = this.fit * (opts.zoom ?? 1.9); } else { this.cx = 0; this.cz = 0; this.scale = this.fit; }
    if (opts.zoom && !opts.center && pp) this.scale = this.fit * opts.zoom;
    this._clampView();
  }

  _clampView() {
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));
    const vw = (this.cw - this.margin * 2) / this.scale, vh = (this.ch - this.margin * 2) / this.scale;
    const lim = (v, view) => (view >= SPAN ? 0 : (SPAN - view) / 2);
    this.cx = Math.max(-lim(0, vw), Math.min(lim(0, vw), this.cx));
    this.cz = Math.max(-lim(0, vh), Math.min(lim(0, vh), this.cz));
  }

  _pointer() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz };
      c.classList.add('grab');
    });
    c.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
      if (!drag) return;
      this.cx = drag.cx - (e.clientX - drag.x) / this.scale;
      this.cz = drag.cz - (e.clientY - drag.y) / this.scale;
      this._clampView();
      this.dirty = true;
    });
    const end = () => { drag = null; c.classList.remove('grab'); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });
    c.addEventListener('dblclick', () => this._centre());
  }

  _zoomAt(sx, sy, f) {
    const wx = (sx - this.cw / 2) / this.scale + this.cx, wz = (sy - this.ch / 2) / this.scale + this.cz;
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * f));
    this.cx = wx - (sx - this.cw / 2) / this.scale;
    this.cz = wz - (sy - this.ch / 2) / this.scale;
    this._clampView();
    this.dirty = true;
  }

  _centre() {
    const pp = this.G.player?.position;
    if (pp) { this.cx = pp.x; this.cz = pp.z; this._clampView(); this.dirty = true; }
  }

  _key(e) {
    this.keys.add(e.code);
    switch (e.code) {
      case 'Escape': case 'KeyM': if (!e.repeat) this.scr.close(); return true;
      case 'KeyJ': if (!e.repeat) this.ui.openJournal(); return true;
      case 'Space': this._centre(); return true;
      case 'KeyQ': case 'Minus': case 'NumpadSubtract': this._zoomAt(this.cw / 2, this.ch / 2, 0.85); return true;
      case 'KeyE': case 'Equal': case 'NumpadAdd': this._zoomAt(this.cw / 2, this.ch / 2, 1.18); return true;
      case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD': case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': return true;
      default: return false;
    }
  }

  // ---- drawing -----------------------------------------------------------------------------
  _tick(t) {
    const dt = Math.min(0.1, (t - (this._lt ?? t)) / 1000);
    this._lt = t;
    const K = this.keys;
    if (K.size) {
      const sp = 380 / this.scale * dt;
      let mx = 0, mz = 0;
      if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) mx += 1;
      if (K.has('KeyW') || K.has('ArrowUp')) mz -= 1;
      if (K.has('KeyS') || K.has('ArrowDown')) mz += 1;
      if (mx || mz) { this.cx += mx * sp; this.cz += mz * sp; this._clampView(); this.dirty = true; }
    }
    this._objT -= dt;
    if (this._objT <= 0) {
      this._objT = 0.5;
      try { this._objs = this.G.quests?.objectives?.() || []; } catch { this._objs = []; }
      this.dirty = true;
    }
    this._pulse = (this._pulse ?? 0) + dt;
    this._frame = (this._frame ?? 0) + 1;
    if (this._frame % 5 === 0) this.dirty = true; // player pulse
    if (this.dirty) { this.dirty = false; this.draw(); }
  }

  sx(x) { return (x - this.cx) * this.scale + this.cw / 2; }
  sy(z) { return (z - this.cz) * this.scale + this.ch / 2; }

  draw() {
    const G = this.G;
    const ctx = this.canvas.getContext('2d');
    const dpr = this.dpr, cw = this.cw, ch = this.ch, m = this.margin;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    ctx.beginPath();
    ctx.rect(m, m, cw - m * 2, ch - m * 2);
    ctx.clip();

    // base
    const x0 = this.sx(-HALF), y0 = this.sy(-HALF), size = SPAN * this.scale;
    if (this.base) ctx.drawImage(this.base, x0, y0, size, size);
    else { ctx.fillStyle = '#d6c79e'; ctx.fillRect(x0, y0, size, size); }

    if (this.base && this.shores) this._drawWater(ctx);
    this._drawRoads(ctx);

    // veil
    this._buildVeil();
    if (this.veil) { ctx.globalAlpha = 0.97; ctx.drawImage(this.veil, x0, y0, size, size); ctx.globalAlpha = 1; }

    this._drawPlaces(ctx);
    this._drawObjectives(ctx);
    this._drawPlayer(ctx);
    ctx.restore();

    // frame: double ink rule
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, cw - m * 2, ch - m * 2);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(m + 4, m + 4, cw - m * 2 - 8, ch - m * 2 - 8);
    this._drawRose(ctx);
    this._drawScale(ctx);
  }

  _drawWater(ctx) {
    const P = (pts) => pts.map(([x, z]) => [this.sx(x), this.sy(z)]);
    const [shore, mid, deep] = this.shores.map(P);
    const isl = P(this.island), islIn = P(this.islandIn);
    // ice wash with the island cut out
    ctx.beginPath();
    pathSmooth(ctx, shore);
    pathSmooth(ctx, isl);
    ctx.fillStyle = 'rgba(150,178,192,0.5)';
    ctx.fill('evenodd');
    // water lining
    ctx.save();
    ctx.beginPath();
    pathSmooth(ctx, shore);
    ctx.clip();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = `rgba(${INK_RGB},0.32)`;
    ctx.beginPath(); pathSmooth(ctx, mid); ctx.stroke();
    ctx.strokeStyle = `rgba(${INK_RGB},0.18)`;
    ctx.beginPath(); pathSmooth(ctx, deep); ctx.stroke();
    // fine horizontal ripples
    const step = Math.max(9, 13 * this.scale / this.fit * 0.7);
    ctx.strokeStyle = `rgba(${INK_RGB},0.09)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const ytop = this.sy(LAKE.z - LAKE.rz - 20), ybot = this.sy(LAKE.z + LAKE.rz + 20);
    for (let y = ytop; y < ybot; y += step) { ctx.moveTo(this.sx(LAKE.x - LAKE.rx - 20), y); ctx.lineTo(this.sx(LAKE.x + LAKE.rx + 20), y); }
    ctx.stroke();
    ctx.restore();
    // ink coast
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.beginPath(); pathSmooth(ctx, shore); ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath(); pathSmooth(ctx, isl); ctx.stroke();
    ctx.fillStyle = 'rgba(210,198,160,0.0)';
    ctx.beginPath(); pathSmooth(ctx, islIn); ctx.strokeStyle = `rgba(${INK_RGB},0.25)`; ctx.lineWidth = 0.8; ctx.stroke();

    // river
    ctx.beginPath();
    RIVER.pts.forEach(([x, z], i) => { const X = this.sx(x), Y = this.sy(z); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150,178,192,0.6)'; ctx.lineWidth = Math.max(2, RIVER.width * this.scale); ctx.stroke();
    ctx.strokeStyle = `rgba(${INK_RGB},0.55)`; ctx.lineWidth = 1; ctx.stroke();

    // big letterspaced name on the ice
    const fs = Math.max(13, Math.min(30, 20 * this.scale / this.fit * 0.8));
    ctx.save();
    ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = `rgba(${INK_RGB},0.38)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${fs * 0.5}px`;
    ctx.fillText('BELLMERE', this.sx(LAKE.x - 10), this.sy(LAKE.z - 60));
    ctx.restore();
  }

  _drawRoads(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${INK_RGB},0.85)`;
    ctx.lineWidth = Math.max(1.3, Math.min(2.6, 1.5 * this.scale / this.fit));
    const dot = ctx.lineWidth;
    ctx.setLineDash([0.1, dot * 2.6 + 2]);
    for (const rd of ROADS) {
      ctx.beginPath();
      rd.pts.forEach(([x, z], i) => { const X = this.sx(x), Y = this.sy(z); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    ctx.restore();
  }

  _discovered() {
    return new Set(this.G.state?.data?.discovered || []);
  }

  _drawPlaces(ctx) {
    const disc = this._discovered();
    const zoom = this.scale / this.fit;
    const s = Math.max(8, Math.min(15, 8 + zoom * 2.4));
    const placed = [];
    const fs = Math.max(13, Math.min(20, 12.5 + zoom * 1.8));
    const order = ['village', 'bellTower', 'watchtower', 'idol', 'island', 'passStart', 'mill', 'waterfall', 'graveyard', 'marsh', 'crossroads'];
    const ids = Object.keys(LOC).filter((id) => LOC[id].map && disc.has(id));
    ids.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    ctx.textBaseline = 'middle';
    for (const id of ids) {
      const l = LOC[id];
      const X = this.sx(l.x), Y = this.sy(l.z);
      if (X < -60 || Y < -60 || X > this.cw + 60 || Y > this.ch + 60) continue;
      const k = id === 'village' ? 1.5 : 1;
      ctx.save();
      ctx.translate(X, Y);
      (GLYPHS[id] || GLYPHS.hunterCabin)(ctx, s * k);
      ctx.restore();
      // label with collision avoidance
      const big = id === 'village';
      ctx.font = `${big ? 700 : 600} ${big ? fs * 1.25 : fs}px "Cormorant Garamond", Georgia, serif`;
      const text = big ? l.name.toUpperCase() : l.name;
      const sp = big ? fs * 0.3 : 0;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${sp}px`;
      const tw = ctx.measureText(text).width;
      const th = fs * 1.15;
      const r = s * k * 1.4 + 4;
      const cand = [[X + r, Y, 'left'], [X - r, Y, 'right'], [X, Y + r + th * 0.5, 'center'], [X, Y - r - th * 0.5 - (big ? 6 : 0), 'center']];
      let pick = null;
      for (const [lx, ly, al] of cand) {
        const bx = al === 'left' ? lx : al === 'right' ? lx - tw : lx - tw / 2;
        const box = [bx - 2, ly - th / 2, bx + tw + 2, ly + th / 2];
        if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
        pick = { lx, ly, al, box };
        break;
      }
      if (pick) {
        placed.push(pick.box);
        ctx.textAlign = pick.al;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(224,210,170,0.88)';
        ctx.lineJoin = 'round';
        ctx.strokeText(text, pick.lx, pick.ly);
        ctx.fillStyle = INK;
        ctx.fillText(text, pick.lx, pick.ly);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
  }

  _drawObjectives(ctx) {
    const zoom = this.scale / this.fit;
    for (const o of this._objs) {
      const mk = o.marker;
      const x = Array.isArray(mk) ? mk[0] : mk?.x, z = Array.isArray(mk) ? mk[1] : mk?.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const X = this.sx(x), Y = this.sy(z);
      const s = Math.max(8, Math.min(12, 7 + zoom * 1.6));
      // soft pulse ring
      const pulse = (Math.sin((this._pulse ?? 0) * 2.4) + 1) / 2;
      ctx.beginPath(); ctx.arc(X, Y, s * (1.5 + pulse * 0.8), 0, 7); ctx.strokeStyle = `rgba(154,46,34,${0.5 - pulse * 0.35})`; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X, Y - s); ctx.lineTo(X + s, Y); ctx.lineTo(X, Y + s); ctx.lineTo(X - s, Y); ctx.closePath();
      ctx.fillStyle = '#9a2e22'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X, Y); ctx.bezierCurveTo(X - s * 0.7, Y - s * 0.45, X - s * 0.7, Y + s * 0.45, X, Y); ctx.bezierCurveTo(X + s * 0.7, Y - s * 0.45, X + s * 0.7, Y + s * 0.45, X, Y);
      ctx.strokeStyle = '#f2e6cc'; ctx.lineWidth = 1; ctx.stroke();
      if (o.text) {
        ctx.font = `italic 600 ${Math.max(13, Math.min(18, 13 + zoom))}px "Cormorant Garamond", Georgia, serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(224,210,170,0.9)'; ctx.strokeText(o.text, X + s + 7, Y);
        ctx.fillStyle = '#6a1f16'; ctx.fillText(o.text, X + s + 7, Y);
      }
    }
  }

  _drawPlayer(ctx) {
    const G = this.G;
    const pp = G.player?.position;
    if (!pp) return;
    const X = this.sx(pp.x), Y = this.sy(pp.z);
    let yaw = G.player.yaw;
    if (!Number.isFinite(yaw)) yaw = 0;
    const ang = Math.atan2(Math.sin(yaw), -Math.cos(yaw)); // world forward (sin, cos) to screen rotation
    const pulse = (Math.sin((this._pulse ?? 0) * 3) + 1) / 2;
    ctx.save();
    ctx.translate(X, Y);
    ctx.beginPath(); ctx.arc(0, 0, 11 + pulse * 5, 0, 7); ctx.strokeStyle = `rgba(${INK_RGB},${0.4 - pulse * 0.3})`; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7.5, 8); ctx.lineTo(0, 4); ctx.lineTo(-7.5, 8); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = '#eadfc0'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
  }

  _drawRose(ctx) {
    const r = Math.min(46, Math.min(this.cw, this.ch) * 0.075);
    const X = this.cw - this.margin - r - 22, Y = this.margin + r + 26;
    ctx.save();
    ctx.translate(X, Y);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, 7); ctx.lineWidth = 0.6; ctx.stroke();
    const spike = (a, len, wid, fill) => {
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(wid, 0); ctx.lineTo(0, len * 0.12); ctx.lineTo(-wid, 0); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore();
    };
    for (let i = 0; i < 4; i++) spike((i * Math.PI) / 2 + Math.PI / 4, r * 0.62, r * 0.09, 'rgba(42,30,20,0.0)');
    spike(0, r, r * 0.13, '#8c2a1e');
    spike(Math.PI / 2, r * 0.82, r * 0.11, 'rgba(42,30,20,0.85)');
    spike(Math.PI, r * 0.82, r * 0.11, 'rgba(42,30,20,0.85)');
    spike(-Math.PI / 2, r * 0.82, r * 0.11, 'rgba(42,30,20,0.85)');
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.round(r * 0.34)}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -r - r * 0.26);
    ctx.restore();
  }

  _drawScale(ctx) {
    // a 100 m bar, rounded to a nice length for the current zoom
    const nice = [20, 50, 100, 200, 500];
    let len = nice[0];
    for (const n of nice) if (n * this.scale > 60) { len = n; break; }
    const px = len * this.scale;
    const X = this.margin + 22, Y = this.ch - this.margin - 22;
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + px, Y); ctx.moveTo(X, Y - 4); ctx.lineTo(X, Y + 4); ctx.moveTo(X + px, Y - 4); ctx.lineTo(X + px, Y + 4); ctx.moveTo(X + px / 2, Y - 2.5); ctx.lineTo(X + px / 2, Y + 2.5); ctx.stroke();
    ctx.font = 'italic 600 13px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(224,210,170,0.85)';
    ctx.strokeText(`${len} m`, X + px + 8, Y + 5); ctx.fillText(`${len} m`, X + px + 8, Y + 5);
    ctx.restore();
  }
}

// keep the linter honest about helpers used only in some builds
void hashString; void smoothstep; void clear; void store;
