// Wall construction: notched log walls with openings, stone plinths, plank and log gables,
// floors. Everything is built in a per-wall frame: local x runs along the wall (positive to the
// right as seen from outside), y up, z outward. wallFrame() gives the frame for each side.
//
//   front  z = +hd   (gable side, door side by default)
//   back   z = -hd
//   right  x = +hw   (eave side)
//   left   x = -hw
import * as THREE from 'three';
import { C, mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';

export const WALLS = ['front', 'right', 'back', 'left'];

export function wallFrame(wall, hw, hd) {
  switch (wall) {
    case 'front': return { x: 0, z: hd, yaw: 0, L: 2 * hw, side: 0 };
    case 'back': return { x: 0, z: -hd, yaw: Math.PI, L: 2 * hw, side: 0 };
    case 'right': return { x: hw, z: 0, yaw: Math.PI / 2, L: 2 * hd, side: 1 };
    default: return { x: -hw, z: 0, yaw: -Math.PI / 2, L: 2 * hd, side: 1 };
  }
}

// Wall-frame point (s along, y up, n outward) to building-local coordinates.
export function toLocal(f, s, y, n = 0) {
  const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  return [f.x + s * c + n * sn, y, f.z - s * sn + n * c];
}

// Log tone by course: wet dark low down, weathered mid, silvered high, with fresh replacements.
export function logTone(kit, k, N, style = {}) {
  const t = N <= 1 ? 0 : k / (N - 1);
  const low = C(style.low ?? PAL.logDark), mid = C(style.mid ?? PAL.logWeathered), high = C(style.high ?? PAL.logSilver);
  const c = new THREE.Color();
  if (t < 0.45) mixC(low, mid, t / 0.45, c); else mixC(mid, high, (t - 0.45) / 0.55 * (style.silver ?? 0.6), c);
  const j = 0.88 + kit.rand() * 0.24;
  c.multiplyScalar(j * GAIN);
  if (kit.chance(0.07)) c.lerp(C(PAL.logNew).clone().multiplyScalar(GAIN), 0.5);
  return c;
}

// Stack of notched logs along one wall.
//   o.courses, o.r (radius), o.pitch (vertical step), o.y0 (bottom), o.yOff (extra offset)
//   o.openings: [{s0, s1, y0, y1}] in wall frame; logs are cut around them.
//   o.ov: corner overshoot; o.style tones; o.cuts: array that receives log segment info
export function logWall(kit, f, o) {
  const { courses: N, r, pitch } = o;
  const L = f.L;
  const mb = kit.wood;
  const openings = o.openings || [];
  for (let k = 0; k < N; k++) {
    const yc = o.y0 + r + (o.yOff || 0) + k * pitch + kit.rs() * 0.006;
    const lo = yc - r * 0.82, hi = yc + r * 0.82;
    const cuts = [];
    for (const op of openings) if (hi > op.y0 && lo < op.y1) cuts.push([op.s0, op.s1]);
    cuts.sort((a, b) => a[0] - b[0]);
    const ovA = o.ovA ?? (r * 1.55 + kit.r(0, 0.12)), ovB = o.ovB ?? (r * 1.55 + kit.r(0, 0.12));
    const segs = [];
    let cur = -L / 2 - ovA;
    for (const [a, b] of cuts) {
      if (a > cur + 0.1) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (L / 2 + ovB > cur + 0.1) segs.push([cur, L / 2 + ovB]);
    const col = logTone(kit, k, N, o.style);
    for (let si = 0; si < segs.length; si++) {
      const [sa, sb] = segs[si];
      if (o.dropLog && o.dropLog(k, (sa + sb) / 2, sb - sa)) continue;
      const len = sb - sa;
      const rr = r * (0.93 + kit.rand() * 0.15);
      const taper = kit.rs() * 0.07;
      const yA = yc + kit.rs() * 0.012, yB = yc + kit.rs() * 0.012;
      const bow = [0, -0.012 - kit.rand() * 0.014 * Math.min(1, len / 3), kit.rs() * 0.01];
      const c = col.clone().multiplyScalar(0.94 + kit.rand() * 0.12);
      if (k < 3 && o.moss !== false && kit.chance(0.18)) c.lerp(C(PAL.moss).clone().multiplyScalar(GAIN * 0.75), 0.3);
      const nsd = kit.rand() * 40;
      mb.at(f.x, 0, f.z, f.yaw, (m) => {
        m.tube([sa, yA, kit.rs() * 0.016], [sb, yB, kit.rs() * 0.016], rr * (1 + taper), rr * (1 - taper), c, {
          seg: 10, lenSeg: len > 2.6 ? 2 : 1, bow, uo: kit.rand(), vo: kit.rand(), ao: 0.36,
          endCol: mixC(c, 0xb9a687, 0.5), wobble: 0.02, ph: kit.rand() * 6,
          capDetailA: si === 0 ? 2 : 1, capDetailB: si === segs.length - 1 ? 2 : 1,
          rim: (t) => 0.9 + 0.2 * kit.n2(nsd + t * len * 1.2, k * 2.7 + 0.5),
        });
      });
    }
  }
}

// Stone plinth under a rectangular footprint: a ring of rough blocks, top at y = 0.
export function plinth(kit, hw, hd, r, o = {}) {
  const depth = o.depth ?? 0.55;
  const mb = kit.stone;
  const base = C(o.tone ?? PAL.stone);
  for (const wall of WALLS) {
    const f = wallFrame(wall, hw, hd);
    let s = -f.L / 2 - r * 1.4;
    const end = f.L / 2 + r * 1.4;
    while (s < end) {
      const len = Math.min(end - s, kit.r(0.6, 1.1));
      const h = kit.r(0.45, 0.62);
      const d = kit.r(0.48, 0.62);
      const top = kit.r(-0.05, 0.07);
      const col = mixC(PAL.stoneDark, base, kit.rand()).multiplyScalar(GAIN * kit.r(0.85, 1.1));
      mb.at(f.x, 0, f.z, f.yaw, (m) => {
        m.box(s + len / 2, top - h / 2, r * 0.25 + (d - 0.5) * 0.25, len * 0.98, h, d, col, { ry: kit.rs() * 0.05, rz: kit.rs() * 0.025, uv: [2, 2], top: scaleC(col, 1.12) });
      });
      s += len * 0.97;
    }
  }
  void depth;
}

// Vertical plank gable fill under a roof. wallFrame f is the gable wall. `under(s)` returns the
// roof underside height at wall-frame position s (we bury the board tops 4 cm into the slab).
export function plankGable(kit, f, o) {
  const { hw, yBase, under } = o;
  const mb = kit.wood;
  const z = o.z ?? 0.04;
  let s = -hw + 0.05;
  const base = o.tone ?? PAL.plank;
  while (s < hw - 0.05) {
    const w = kit.r(0.17, 0.25);
    const sc = Math.min(hw, s + w / 2);
    const top = under(Math.max(Math.abs(s), Math.abs(s + w))) + 0.05;
    const h = top - yBase;
    if (h > 0.05) {
      const col = mixC(base, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.12));
      if (kit.chance(0.07)) col.lerp(C(PAL.logNew).clone().multiplyScalar(GAIN * 1.1), 0.55); // a patched board
      mb.at(f.x, 0, f.z, f.yaw, (m) => {
        m.box(sc, yBase + h / 2, z + kit.rs() * 0.012, w - 0.014, h, 0.06, col, { grain: 'y', skip: '-y', rz: kit.rs() * 0.01, uv: [1, 3] });
      });
    }
    s += w;
  }
}

// Gable built from shortening log courses. under(s) = roof underside height.
export function logGable(kit, f, o) {
  const { hw, yBase, r, pitch, under } = o;
  const mb = kit.wood;
  let k = 0;
  for (let y = yBase + r * 0.9; ; y += pitch, k++) {
    // Half length of the log at this height: where the log's top touches the roof underside.
    let lo = 0, hi = hw + 0.5;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (under(mid) > y + r) lo = mid; else hi = mid;
    }
    const half = lo;
    if (half < 0.28) break;
    const col = logTone(kit, 7 + k, 14, o.style);
    const len = half * 2;
    mb.at(f.x, 0, f.z, f.yaw, (m) => {
      m.tube([-half, y, kit.rs() * 0.01], [half, y, kit.rs() * 0.01], r * (0.93 + kit.rand() * 0.12), r * (0.93 + kit.rand() * 0.12), col, {
        seg: 10, lenSeg: len > 3 ? 2 : 1, bow: [0, -0.01, 0], uo: kit.rand(), vo: kit.rand(), ao: 0.34, endCol: mixC(col, 0xc4a478, 0.45),
      });
    });
    if (k > 20) break;
  }
}

// Plank floor, boards along z. y is the top surface. o.holes: [{x0, z0, x1, z1}] rectangles left open.
export function floorBoards(kit, x0, z0, x1, z1, y, o = {}) {
  const mb = kit.wood;
  const bw = o.board ?? 0.26;
  const n = Math.max(1, Math.round((x1 - x0) / bw));
  const w = (x1 - x0) / n;
  const base = o.tone ?? PAL.plank;
  const holes = o.holes || [];
  for (let i = 0; i < n; i++) {
    const bx0 = x0 + i * w, bx1 = bx0 + w;
    // Split the board along z around any hole it crosses.
    let segs = [[z0, z1]];
    for (const h of holes) {
      if (bx1 <= h.x0 || bx0 >= h.x1) continue;
      const next = [];
      for (const [a, b] of segs) {
        if (h.z1 <= a || h.z0 >= b) { next.push([a, b]); continue; }
        if (h.z0 > a) next.push([a, h.z0]);
        if (h.z1 < b) next.push([h.z1, b]);
      }
      segs = next;
    }
    for (const [a, b] of segs) {
      if (b - a < 0.05) continue;
      const col = mixC(base, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN * kit.r(0.8, 1.1));
      mb.box(bx0 + w / 2, y - 0.03, (a + b) / 2, w - 0.012, 0.06, b - a, col, { grain: 'z', uv: [1, 3], bottom: scaleC(col, 0.6) });
    }
  }
}

// Wall-frame segments of colliders around door gaps. gaps: [{s0, s1}] in wall frame.
export function wallColliders(kit, f, r, gaps, o = {}) {
  const t = o.t ?? r * 1.05;
  gaps = [...gaps].sort((a, b) => a.s0 - b.s0);
  const pts = [-f.L / 2 - r, ...gaps.flatMap((g) => [g.s0, g.s1]), f.L / 2 + r];
  for (let i = 0; i < pts.length; i += 2) {
    const a = pts[i], b = pts[i + 1];
    if (b - a < 0.05) continue;
    const c = toLocal(f, (a + b) / 2, 0, 0);
    // Box half extents: along the wall (hw) and across it (hd); rotate by the frame yaw.
    kit.box(c[0], c[2], (b - a) / 2, t, f.yaw, { y0: o.y0, y1: o.y1 });
  }
}
