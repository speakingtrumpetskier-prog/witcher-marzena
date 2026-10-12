// Small helpers shared by the dressing passes (streets, square, approaches): road frames, trodden ground
// patches, lane ribbons with ruts, stake lines, yaw conversions.
import { ROADS } from '../../layout.js';

export const roadById = (id) => ROADS.find((r) => r.id === id);

// Point and frame at arc length s: tangent (tx, tz) in the direction of travel, normal (nx, nz) to the LEFT of it.
export function sampleAt(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= acc + len || i === pts.length - 2) {
      const t = Math.max(0, Math.min(len, s - acc));
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      return { x: ax + tx * t, z: az + tz * t, tx, tz, nx: -tz, nz: tx, s };
    }
    acc += len;
  }
  return null;
}

export function pathLength(pts) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

// rotation.y that lays a prop's local +z (cart, sledge, plank walk) or local +x (rail, trough, fence) along (dx, dz)
export const yawZ = (dx, dz) => Math.atan2(dx, dz);
export const yawX = (dx, dz) => Math.atan2(-dz, dx);

// Point at an offset from a road frame: off > 0 is to the left of travel.
export const at = (p, off, along = 0) => [p.x + p.nx * off + p.tx * along, p.z + p.nz * off + p.tz * along];

// A packed lane with two dark ruts (as the lead did for the south street), with a gentle wander so it is not ruled.
export function lanePaths(V, pts, s0, s1, o = {}) {
  const lane = [], rutL = [], rutR = [];
  const step = o.step ?? 2;
  for (let s = s0; s <= s1; s += step) {
    const p = sampleAt(pts, s);
    if (!p) break;
    const w = Math.sin(s * 0.31 + (o.phase ?? 0)) * 0.12;
    lane.push([p.x, p.z]);
    rutL.push([p.x + p.nx * (0.72 + w), p.z + p.nz * (0.72 + w)]);
    rutR.push([p.x - p.nx * (0.72 - w), p.z - p.nz * (0.72 - w)]);
  }
  if (lane.length < 2) return;
  if (o.lane !== false) V.paths.push({ pts: lane, width: o.width ?? 2.8, kind: 'path', alpha: o.alpha ?? 0.45 });
  V.paths.push({ pts: rutL, width: 0.32, kind: 'rut', alpha: o.rutAlpha ?? 0.5 });
  V.paths.push({ pts: rutR, width: 0.32, kind: 'rut', alpha: o.rutAlpha ?? 0.5 });
}

// A blob of trodden ground: an elongated patch rx along `ang` (radians in the xz plane), rz across.
export function patch(V, x, z, rx, rz, ang = 0, kind = 'mud', alpha = 0.4) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [-1, -0.45, 0.45, 1].map((t) => [x + c * rx * t, z + s * rx * t]);
  V.paths.push({ pts, width: rz * 2, kind, alpha });
  // a second, shorter smear off to one side so the edge is not a clean oval (deterministic from the position)
  const side = Math.sin(x * 12.9898 + z * 78.233) > 0 ? 1 : -1;
  const k = 0.5 + 0.3 * Math.abs(Math.sin(x * 3.1 + z * 1.7));
  const ox = x - s * rz * 0.55 * side + c * rx * 0.25 * side, oz = z + c * rz * 0.55 * side + s * rx * 0.25 * side;
  const pts2 = [-1, -0.4, 0.4, 1].map((t) => [ox + c * rx * k * t, oz + s * rx * k * t]);
  V.paths.push({ pts: pts2, width: rz * 1.3, kind, alpha: alpha * 0.8 });
}

// Pairs of marker stakes down both edges of a road between arc lengths s0 and s1, the way a road is marked where
// drifts cover it: tall, a rag on each, a few knocked crooked or gone.
export function stakeLine(D, pts, s0, s1, o = {}) {
  const step = o.step ?? 11, off = o.off ?? 3.5, height = o.height ?? 1.9;
  let n = 0;
  for (let s = s0, i = 0; s <= s1; s += step, i++) {
    const p = sampleAt(pts, s);
    if (!p) break;
    for (const side of [1, -1]) {
      if (o.stagger && ((i + (side > 0 ? 0 : 1)) % 2)) continue;
      if ((i * 5 + (side > 0 ? 1 : 3)) % 9 === 0) continue; // one gone now and then
      const jitter = Math.sin(s * 1.7 + side) * 0.5;
      const [x, z] = at(p, side * (off + jitter), Math.cos(s * 2.3) * 1.2);
      if (D.tryPut('stake', [[x, z, 0]], { collide: false, seed: (i * 2 + (side > 0 ? 1 : 0)) % 8, opts: { height: height + (((i * 7 + side) % 5) - 2) * 0.1, flag: true } }, 0.25)) n++;
    }
  }
  return n;
}

// Highest height difference over a radius r (meters) around (x, z), as a rise over run.
export function slope(G, x, z, r = 2) {
  const h0 = G.world.heightAt(x, z);
  let m = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m = Math.max(m, Math.abs(G.world.heightAt(x + dx * r, z + dz * r) - h0) / r);
  return m;
}

// Split-rail fence laid as props along a polyline (no extra draw calls, unlike a kit fence piece). Sections that
// do not fit (a tree, a road, a claimed spot) are skipped; `gaps` are section indices left open.
export function railLine(D, pts, gaps = []) {
  let idx = 0, n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const segs = Math.max(1, Math.round(len / 2.4));
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let k = 0; k < segs; k++, idx++) {
      if (gaps.includes(idx)) continue;
      const t = (k + 0.5) / segs;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (D.tryPut('railFence', [[x, z, yawX(dx, dz)]], { opts: { length: len / segs } }, 0.9)) n++;
    }
  }
  return n;
}

