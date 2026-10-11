// Shared helpers for the village composition: local frames, seeded hashing, road distance and
// a tiny scoped logger. Everything here is pure (no G access) so every village file can use it.
import { ROADS } from '../../layout.js';
import { distToSegment, rng } from '../../../core/util.js';

export const TAU = Math.PI * 2;

// Local-to-world offset for a three.js rotation.y = yaw (local +z is the front of a building).
export function rot(lx, lz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// A frame anchored at world (x, z) with a yaw: at(lx, lz) gives a world point, yawOf(dy) a world yaw.
export function frame(x, z, yaw) {
  return {
    x, z, yaw,
    at(lx, lz) {
      const [dx, dz] = rot(lx, lz, yaw);
      return [x + dx, z + dz];
    },
    yawOf(dy = 0) { return yaw + dy; },
  };
}

// Stable string hash to seed a generator.
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const seeded = (key) => rng(typeof key === 'string' ? hash(key) : key >>> 0);

// Distance from (x, z) to the nearest road edge (negative when on the road surface).
export function roadGap(x, z, pad = 0) {
  let best = Infinity;
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const d = distToSegment(x, z, a[0], a[1], b[0], b[1]).d - r.width * 0.5 - pad;
      if (d < best) best = d;
    }
  }
  return best;
}

// Oriented rectangle helpers (used by the audit and the interiors tracker).
export function inRect(px, pz, cx, cz, hw, hd, yaw, pad = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = px - cx, dz = pz - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= hw + pad && Math.abs(lz) <= hd + pad;
}

export function rectCorners(cx, cz, hw, hd, yaw) {
  const out = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [dx, dz] = rot(sx * hw, sz * hd, yaw);
    out.push([cx + dx, cz + dz]);
  }
  return out;
}

// Separating axis test for two oriented rectangles; returns penetration depth (>0 overlap) or 0.
export function rectOverlap(a, b) {
  const ca = rectCorners(a.x, a.z, a.hw, a.hd, a.yaw), cb = rectCorners(b.x, b.z, b.hw, b.hd, b.yaw);
  let minPen = Infinity;
  for (const yaw of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
    const ax = Math.cos(yaw), az = -Math.sin(yaw);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ca) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    const pen = Math.min(a1, b1) - Math.max(a0, b0);
    if (pen <= 0) return 0;
    minPen = Math.min(minPen, pen);
  }
  return minPen;
}

// Yield to the event loop so the loading screen keeps animating during a long build.
export const tick = () => new Promise((r) => setTimeout(r, 0));

// Warm-up friendly logger: quiet unless ?vdebug is in the URL.
export function makeLog(G) {
  const on = G.params.has('vdebug');
  return (...a) => { if (on) console.log('[village]', ...a); };
}
