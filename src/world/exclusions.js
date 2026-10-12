// Extra places where vegetation must not grow, beyond LOC footprints, roads and the lake.
// Locations builders append entries (at import time or any time later; the vegetation system
// watches this array and hides trees under new entries at runtime). Owner: vegetation builder.
//
// Entry formats (all in meters, world XZ):
//   { x, z, r, note }                       circle: nothing grows inside r
//   { type: 'box', x, z, hw, hd, yaw, note } oriented box (yaw rotates around +Y like three.js)
// Optional fields on any entry:
//   fade: meters of soft edge outside the cut where density ramps back up (default 8)
//   kinds: ['tree', 'bush', 'ground', 'reed', 'deadwood'] limit the exclusion to these groups
//   (omit for everything)
//
// Prefer G.vegetation.clearArea(x, z, r) when you build something at runtime; use this array for
// static footprints that exist from the start.
export const EXCLUSIONS = [];

// Signed distance in meters from (x, z) to the edge of an exclusion (negative inside).
export function exclusionDistance(e, x, z) {
  if (e.type === 'box') {
    const c = Math.cos(e.yaw || 0), s = Math.sin(e.yaw || 0);
    const dx = x - e.x, dz = z - e.z;
    const lx = Math.abs(dx * c + dz * s) - e.hw;
    const lz = Math.abs(-dx * s + dz * c) - e.hd;
    const ox = Math.max(lx, 0), oz = Math.max(lz, 0);
    return Math.hypot(ox, oz) + Math.min(Math.max(lx, lz), 0);
  }
  return Math.hypot(x - e.x, z - e.z) - (e.r ?? 0);
}

// Density multiplier 0..1 at (x, z) for vegetation `group` ('tree', 'bush', 'ground', 'reed',
// 'deadwood'): 0 inside an exclusion, ramping to 1 over the entry's `fade` meters.
export function exclusionFactor(x, z, group, list = EXCLUSIONS) {
  let f = 1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.kinds && !e.kinds.includes(group)) continue;
    const d = exclusionDistance(e, x, z);
    if (d <= 0) return 0;
    const fade = e.fade ?? 8;
    if (d < fade) {
      const t = d / fade;
      f = Math.min(f, t * t * (3 - 2 * t));
    }
  }
  return f;
}
