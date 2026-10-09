// Dry-stone construction helpers: courses of rough blocks around a rectangle (towers, ruins,
// foundations), boulders, menhirs and carved strokes. Writes into kit.stone / kit.stoneIn.
import * as THREE from 'three';
import { C, mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';
import { wallFrame } from './walls.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Stone tone with lichen and warm variation. dark: 0..1 (low blocks and wet stone are darker).
export function stoneTone(kit, o = {}) {
  const base = o.base ?? PAL.stone;
  const c = mixC(o.dark ?? PAL.stoneDark, base, kit.rand()).clone();
  const k = (o.k ?? 1) * GAIN * kit.r(0.85, 1.08);
  c.multiplyScalar(k);
  const q = kit.rand();
  if (q < (o.lichen ?? 0.12)) c.lerp(C(0x8a9468).clone().multiplyScalar(0.8), 0.2 + kit.rand() * 0.25);
  else if (q < (o.lichen ?? 0.12) + 0.05) c.lerp(C(0xc8c0a0).clone().multiplyScalar(0.8), 0.3);
  return c;
}

// Rings of blocks around a rectangle. Options:
//   cx, cz (center), hw, hd (outer half sizes at y0), t (wall thickness), y0, top (number or fn(wall, s) -> max y),
//   batter (inward lean per meter of height), bh (block height), holes: [{wall, s0, s1, y0, y1}],
//   jag (0..1 chance that blocks touching a hole are kept ragged), skipWalls: [wall names], ruin (0..1 random missing blocks)
export function stoneRing(kit, o) {
  const { cx = 0, cz = 0, hw, hd, y0 = 0, batter = 0, bh = 0.4 } = o;
  const topFn = typeof o.top === 'function' ? o.top : () => o.top;
  const holes = o.holes || [];
  const walls = ['front', 'right', 'back', 'left'].filter((w) => !(o.skipWalls || []).includes(w));
  const mb = o.masonry ? kit._stone : kit.rock;
  let y = y0;
  let course = 0;
  const maxTop = (() => { let m = 0; for (const w of ['front', 'right', 'back', 'left']) for (let s = -hw; s <= hw; s += 0.5) m = Math.max(m, topFn(w, s)); return m; })();
  while (y < maxTop - 0.05) {
    const h = bh * kit.r(0.85, 1.2);
    const hwo = hw - batter * (y - y0), hdo = hd - batter * (y - y0);
    const t = o.inner != null ? Math.max(0.3, hwo - o.inner) : (o.t ?? 0.9);
    const even = course % 2 === 0;
    for (const wall of walls) {
      const f = wallFrame(wall, hwo, hdo);
      const full = (wall === 'front' || wall === 'back') === even;
      const L = f.L;
      const a0 = full ? -L / 2 : -L / 2 + t, a1 = full ? L / 2 : L / 2 - t;
      let s = a0;
      while (s < a1 - 0.05) {
        const len = Math.min(a1 - s, kit.r(0.5, 1.15));
        const sm = s + len / 2;
        const maxY = topFn(wall, sm);
        let bhh = h;
        if (y + h > maxY) bhh = maxY - y;
        let skip = bhh < 0.12 || (o.ruin && kit.chance(o.ruin));
        for (const ho of holes) {
          if (ho.wall !== wall) continue;
          const ov = s + len > ho.s0 && s < ho.s1 && y + bhh > ho.y0 && y < ho.y1;
          if (ov) {
            const inside = s >= ho.s0 && s + len <= ho.s1 && y >= ho.y0 && y + bhh <= ho.y1;
            if (inside || kit.chance(o.jag ?? 0.55)) skip = true;
          }
        }
        if (!skip) {
          const col = stoneTone(kit, { k: 1 - Math.max(0, 1 - (y - y0) / 1.2) * 0.35, lichen: o.lichen });
          const out = kit.r(-0.03, 0.05);
          const tt = t * kit.r(0.92, 1.0);
          mb.at(cx + f.x, 0, cz + f.z, f.yaw, (m) => {
            m.box(sm, y + bhh / 2, -tt / 2 + out, len * 1.0, bhh * 1.002, tt, col, {
              ry: kit.rs() * 0.025, rz: kit.rs() * 0.012, uv: [2, 2], top: scaleC(col, 1.12), skip: '-y',
            });
          });
        }
        s += len;
      }
    }
    y += h;
    course++;
  }
  return { top: y };
}

// A rough boulder: noisy ellipsoid, flattened base. Drawn into kit.stone (or stoneIn).
export function boulder(kit, x, y, z, rx, ry, rz, o = {}) {
  const mb = o.masonry ? kit._stone : kit.rock;
  const nu = o.rings ?? 5, nv = o.seg ?? 9;
  const rows = [];
  const ph = kit.rand() * 7;
  for (let i = 0; i <= nu; i++) {
    const a = -Math.PI / 2 + 0.28 + (i / nu) * (Math.PI - 0.28 - 0.02);
    const row = [];
    for (let j = 0; j <= nv; j++) {
      const b = (j / nv) * Math.PI * 2;
      const k = 0.78 + 0.34 * kit.n2(Math.cos(b) * 1.4 + ph + i * 0.37, Math.sin(b) * 1.4 + ph * 0.5);
      const rr = Math.cos(a) * k;
      row.push([x + Math.cos(b) * rx * rr, y + ry * (Math.sin(a) + 0.95) * (0.9 + 0.2 * k) * 0.55 - ry * 0.0, z + Math.sin(b) * rz * rr]);
    }
    rows.push(row);
  }
  const col = o.col ?? stoneTone(kit, { lichen: 0.1 });
  mb.grid(rows, col, {
    flip: true, uv: [2, 2],
    colorFn: (i, j, p) => mixC(col, scaleC(col, 0.7), 0.5 * kit.n2(p.x * 2.1, p.z * 2.1)),
  });
}

// Thin carved stroke along a polyline lying on a plane. pts are [a, b] pairs in the plane's local
// axes; the frame function maps (a, b) to a 3D point and normal. Draws proud strips in `col`.
export function stroke(mb, pts, w, p0, ax, ay, nrm, col, lift = 0.012) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, b0] = pts[i], [a1, b1] = pts[i + 1];
    const len = Math.hypot(a1 - a0, b1 - b0);
    if (len < 1e-4) continue;
    const ang = Math.atan2(b1 - b0, a1 - a0);
    const ctr = V3(p0[0], p0[1], p0[2]).addScaledVector(ax, (a0 + a1) / 2).addScaledVector(ay, (b0 + b1) / 2).addScaledVector(nrm, lift * 0.5);
    // Build the strip as a quad in the plane.
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const ex = V3(0, 0, 0).addScaledVector(ax, dx).addScaledVector(ay, dy).normalize();
    const ey = V3().crossVectors(nrm, ex).normalize();
    const hl = len / 2, hwid = w / 2;
    const P = (u, v) => [ctr.x + ex.x * u + ey.x * v, ctr.y + ex.y * u + ey.y * v, ctr.z + ex.z * u + ey.z * v];
    mb.quad(P(-hl, -hwid), P(hl, -hwid), P(hl, hwid), P(-hl, hwid), col, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
}

// A hewn, weathered stone block as displaced face grids: tapered sides, optional sloped top.
//   o: x, y, z (base center), w0, d0 (bottom), w1, d1 (top), h, yaw, nu, nv, amp (surface roughness),
//      topSlope [sx, sz], dark (0..1 base darkness), lichen (0..1), indoor, noTop
export function hewn(kit, o) {
  const { x = 0, y = 0, z = 0, w0, d0, h } = o;
  const w1 = o.w1 ?? w0, d1 = o.d1 ?? d0;
  const nu = o.nu ?? 6, nv = o.nv ?? 8;
  const amp = o.amp ?? 0.03;
  const slope = o.topSlope || [0, 0];
  const mb = o.masonry ? kit._stone : kit.rock;
  const ph = kit.rand() * 20;
  const toneA = o.base ?? PAL.stone;
  const lerp = (a, b, t) => a + (b - a) * t;
  const base = mixC(PAL.stoneDark, toneA, 0.12 + kit.rand() * 0.45).multiplyScalar(GAIN * (o.k ?? 1));
  const colorAt = (px, py, pz) => {
    const c = base.clone();
    const streak = kit.n2(px * 5 + ph, py * 0.35 + pz * 5);
    c.multiplyScalar(0.8 + 0.3 * kit.n2(px * 2.3 + ph, pz * 2.3 + py * 1.2) - (streak > 0.62 ? 0.18 : 0));
    const wet = Math.max(0, 1 - (py - y) / 1.3);
    c.multiplyScalar(1 - wet * 0.32 * (o.wet ?? 1));
    const lich = kit.n2(px * 1.7 + ph * 2, py * 1.9 + pz * 1.7);
    if (lich > 1 - (o.lichen ?? 0.2)) c.lerp(C(kit.chance(0.5) ? 0x8a9468 : 0xb8aa80).clone().multiplyScalar(0.8), 0.4);
    return c;
  };
  mb.at(x, y, z, o.yaw || 0, () => {
    for (let k = 0; k < 4; k++) {
      const odd = k % 2 === 1;
      mb.at(0, 0, 0, (k * Math.PI) / 2, () => {
        const rows = [];
        for (let i = 0; i <= nv; i++) {
          const t = i / nv;
          const wi = odd ? lerp(d0, d1, t) : lerp(w0, w1, t);
          const di = odd ? lerp(w0, w1, t) : lerp(d0, d1, t);
          const row = [];
          for (let j = 0; j <= nu; j++) {
            const u = j / nu;
            const px = (u - 0.5) * wi;
            const fade = Math.min(1, Math.min(u, 1 - u) * 5) * Math.min(1, Math.min(t, 1 - t) * 6);
            const n = (kit.n2(px * 2.1 + ph + k * 7, t * h * 1.7) - 0.5) * 2 * amp * fade;
            const th = (k * Math.PI) / 2, pzz = di / 2;
            const bx = px * Math.cos(th) + pzz * Math.sin(th), bz = -px * Math.sin(th) + pzz * Math.cos(th);
            const yy = t * (h + slope[0] * bx + slope[1] * bz);
            row.push([px, yy, di / 2 + n]);
          }
          rows.push(row);
        }
        mb.grid(rows, base, {
          uv: [2, 2], colorFn: (i, j, p) => colorAt(p[0] ?? p.x, (p[1] ?? p.y) + y, (p[2] ?? p.z)),
        });
      });
    }
    if (!o.noTop) {
      const rows = [];
      const mn = 6;
      for (let i = 0; i <= mn; i++) {
        const v = i / mn;
        const row = [];
        for (let j = 0; j <= mn; j++) {
          const u = j / mn;
          const px = (u - 0.5) * w1, pz = (0.5 - v) * d1;
          const fade = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 5);
          const n = (kit.n2(px * 2.3 + ph, pz * 2.3) - 0.5) * 2 * amp * 1.4 * fade;
          row.push([px, h + n + slope[0] * px + slope[1] * pz, pz]);
        }
        rows.push(row);
      }
      mb.grid(rows, base, { uv: [2, 2], colorFn: (i, j, p) => scaleC(colorAt(p.x, p.y + y, p.z), 1.12) });
    }
  });
}
