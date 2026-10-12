// Static collision world: vertical prisms (circles and oriented boxes in XZ) on a spatial hash.
// Characters are capsules approximated as XZ circles; terrain height is handled by G.world.
//
//   const id = G.physics.addCircle(x, z, r, { y0, y1, tag })
//   const id = G.physics.addBox(x, z, halfW, halfD, yaw, { y0, y1, tag })   yaw matches three's rotation.y
//   G.physics.remove(id)
//   G.physics.resolve(pos, radius)   push a Vector3 out of colliders (XZ), returns true if hit
//   G.physics.raycast(origin, dir, maxDist) -> distance to first hit (colliders + terrain) or maxDist
//   G.physics.query(x, z, r)         colliders overlapping a circle
// y0/y1 bound the prism vertically (defaults: -1e3..1e3). Colliders whose y range does not
// include the tested height are ignored, so balconies and bridges can be walked under.

const CELL = 8;

export class Collision {
  constructor(world) {
    this.world = world;
    this.items = new Map();
    this.cells = new Map();
    this.nextId = 1;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _insert(item) {
    const { minX, maxX, minZ, maxZ } = item.bounds;
    item.cells = [];
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = this._key(ix, iz);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
        item.cells.push(k);
      }
    }
  }

  addCircle(x, z, r, opts = {}) {
    const id = this.nextId++;
    const item = { id, type: 'circle', x, z, r, y0: opts.y0 ?? -1e3, y1: opts.y1 ?? 1e3, tag: opts.tag || '',
      bounds: { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r } };
    this.items.set(id, item);
    this._insert(item);
    return id;
  }

  addBox(x, z, hw, hd, yaw = 0, opts = {}) {
    const id = this.nextId++;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c * hw) + Math.abs(s * hd), ez = Math.abs(s * hw) + Math.abs(c * hd);
    const item = { id, type: 'box', x, z, hw, hd, c, s, y0: opts.y0 ?? -1e3, y1: opts.y1 ?? 1e3, tag: opts.tag || '',
      bounds: { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez } };
    this.items.set(id, item);
    this._insert(item);
    return id;
  }

  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    for (const k of item.cells) {
      const c = this.cells.get(k);
      if (c) { const i = c.indexOf(item); if (i >= 0) c.splice(i, 1); }
    }
    this.items.delete(id);
  }

  query(x, z, r) {
    const out = new Set();
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const c = this.cells.get(this._key(ix, iz));
        if (c) for (const it of c) out.add(it);
      }
    }
    return [...out];
  }

  // Push pos (Vector3, uses x/y/z) out of every overlapping collider. Iterates a few times.
  resolve(pos, radius = 0.4) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of this.query(pos.x, pos.z, radius + 1)) {
        if (pos.y + 1.0 < it.y0 || pos.y > it.y1) continue;
        if (it.type === 'circle') {
          const dx = pos.x - it.x, dz = pos.z - it.z;
          const d = Math.hypot(dx, dz), min = it.r + radius;
          if (d < min) {
            const k = d > 1e-5 ? (min - d) / d : 0;
            pos.x += d > 1e-5 ? dx * k : min;
            pos.z += dz * k;
            moved = hit = true;
          }
        } else {
          // Into box local space.
          const dx = pos.x - it.x, dz = pos.z - it.z;
          const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
          const cx = Math.max(-it.hw, Math.min(it.hw, lx)), cz = Math.max(-it.hd, Math.min(it.hd, lz));
          let ox = lx - cx, oz = lz - cz;
          let d = Math.hypot(ox, oz);
          if (d < radius) {
            let nx, nz, push;
            if (d > 1e-5) { nx = ox / d; nz = oz / d; push = radius - d; }
            else {
              // Center inside the box: push out along the shallowest axis.
              const px = it.hw - Math.abs(lx), pz = it.hd - Math.abs(lz);
              if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + radius; }
              else { nx = 0; nz = Math.sign(lz) || 1; push = pz + radius; }
            }
            const wx = nx * it.c + nz * it.s, wz = -nx * it.s + nz * it.c;
            pos.x += wx * push;
            pos.z += wz * push;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  // March along a ray; returns the distance to the first collider or terrain hit.
  raycast(origin, dir, maxDist = 10, step = 0.25) {
    const p = { x: 0, y: 0, z: 0 };
    for (let t = step; t <= maxDist; t += step) {
      p.x = origin.x + dir.x * t; p.y = origin.y + dir.y * t; p.z = origin.z + dir.z * t;
      if (this.world && p.y < this.world.heightAt(p.x, p.z) + 0.2) return Math.max(0, t - step);
      for (const it of this.query(p.x, p.z, 0.1)) {
        if (p.y < it.y0 || p.y > it.y1) continue;
        if (it.type === 'circle') {
          if (Math.hypot(p.x - it.x, p.z - it.z) < it.r) return Math.max(0, t - step);
        } else {
          const dx = p.x - it.x, dz = p.z - it.z;
          const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
          if (Math.abs(lx) < it.hw && Math.abs(lz) < it.hd) return Math.max(0, t - step);
        }
      }
    }
    return maxDist;
  }
}
