// Walkable surfaces above or below the terrain (owned by the lead). Gathers every world-space floor
// and ramp the locations registered and installs G.world.floorAt(x, z, yHint), which
// gameplay/player/ground.js asks before falling back to the terrain height.
//
// Sources: G.world.walk (village buildings and the boardwalk), any G.world.locations.<id>.walk
// (wilderness kits), and G.world.walkFloors (free-form floors such as the ice cave, with yAt).
//
// Rule: a surface counts when it lies no more than STEP above the feet. Of those, and the terrain
// itself when it qualifies, the highest wins, so the hill above a cave stays the hill and the cave
// floor takes over once you are inside. A ramp within STEP of the feet wins over floors, which is
// what lets you walk down a stair flight that has a floor drawn over it.

const STEP = 0.55;
const CELL = 16;

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function rampY(r, x, z) {
  const ax = r.a[0], az = r.a[2], dx = r.b[0] - ax, dz = r.b[2] - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return null;
  const t = ((x - ax) * dx + (z - az) * dz) / len2;
  if (t < -0.02 || t > 1.02) return null;
  const px = ax + dx * t - x, pz = az + dz * t - z;
  const hw = (r.width || 1) / 2;
  if (px * px + pz * pz > hw * hw) return null;
  const tc = Math.min(1, Math.max(0, t));
  return r.a[1] + (r.b[1] - r.a[1]) * tc;
}

export function installFloors(G) {
  const floors = [], ramps = [];
  const seen = new Set();
  const take = (walk) => {
    if (!walk) return;
    for (const f of walk.floors || []) if (f?.polygon?.length > 2 && !seen.has(f)) { seen.add(f); floors.push(f); }
    for (const r of walk.ramps || []) if (r?.a && r?.b && !seen.has(r)) { seen.add(r); ramps.push(r); }
  };
  take(G.world.walk);
  for (const loc of Object.values(G.world.locations || {})) take(loc?.walk);
  take({ floors: G.world.walkFloors || [] });

  // Spatial hash over each surface's XZ bounds.
  const grid = new Map();
  const add = (kind, s, x0, z0, x1, z1) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i * 100003 + j;
        let c = grid.get(k);
        if (!c) grid.set(k, (c = []));
        c.push([kind, s]);
      }
    }
  };
  for (const f of floors) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of f.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    add(0, f, x0, z0, x1, z1);
  }
  for (const r of ramps) {
    const hw = (r.width || 1) / 2;
    add(1, r, Math.min(r.a[0], r.b[0]) - hw, Math.min(r.a[2], r.b[2]) - hw, Math.max(r.a[0], r.b[0]) + hw, Math.max(r.a[2], r.b[2]) + hw);
  }

  G.world.floorAt = (x, z, yHint) => {
    const cell = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!cell) return null;
    const terrain = G.world.heightAt(x, z);
    const feet = yHint ?? terrain + 0.6;
    let best = null, ramp = null;
    for (const [kind, s] of cell) {
      if (kind === 1) {
        const y = rampY(s, x, z);
        if (y != null && Math.abs(y - feet) <= STEP && (ramp == null || Math.abs(y - feet) < Math.abs(ramp - feet))) ramp = y;
      } else if (pointInPoly(x, z, s.polygon)) {
        const y = s.yAt ? s.yAt(x, z) : s.y;
        if (y <= feet + STEP && (best == null || y > best)) best = y;
      }
    }
    if (ramp != null) return ramp;
    if (best == null) return null;
    return terrain <= feet + STEP && terrain > best ? null : best;
  };
  G.world.walkSurfaces = { floors, ramps };
}
