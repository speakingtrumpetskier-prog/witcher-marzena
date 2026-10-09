// World query API: cached height grid + surface queries. Exposed as G.world.
//
//   G.world.heightAt(x, z)        walkable surface height (ice counts as ground: max(terrain, 0) on the lake)
//   G.world.terrainAt(x, z)       raw terrain height (lake bed under the ice)
//   G.world.normalAt(x, z, out?)  terrain surface normal (THREE.Vector3)
//   G.world.isLake(x, z)          inside the shoreline
//   G.world.surfaceAt(x, z)       'ice' | 'road' | 'snow' | 'rock' | 'water' (water only after the thaw)
//   G.world.lakeSDF(x, z)         signed distance to shore, meters, negative on the lake
//   G.world.stations              registry of NPC work spots { id: { x, z, yaw, anim, ... } }
//   G.world.colliders             see gameplay collision (G.physics)
//
// OWNER of grid generation strategy: terrain builder (may move it to a worker or bake it),
// but this API surface must not change.
import * as THREE from 'three';
import { computeHeight, lakeSDF } from './heightfield.js';
import { WORLD, nearestRoad } from './layout.js';

export class World {
  constructor() {
    this.half = WORLD.gridHalf;
    this.res = 0;
    this.grid = null;
    this.thawed = false;
    this.stations = {};
    this.lakeSDF = lakeSDF;
  }

  // Build the cached grid. `res` samples per side. Yields to the event loop between rows so a
  // loading screen can update; onProgress(0..1).
  async build(res = 385, onProgress) {
    this.res = res;
    this.cell = (this.half * 2) / (res - 1);
    const g = new Float32Array(res * res);
    let t = performance.now();
    for (let j = 0; j < res; j++) {
      const z = -this.half + j * this.cell;
      for (let i = 0; i < res; i++) g[j * res + i] = computeHeight(-this.half + i * this.cell, z);
      if (performance.now() - t > 30) {
        onProgress?.(j / res);
        await new Promise((r) => setTimeout(r, 0));
        t = performance.now();
      }
    }
    this.grid = g;
    onProgress?.(1);
  }

  // Allow the terrain builder to supply a precomputed grid (worker or baked).
  setGrid(grid, res) {
    this.grid = grid;
    this.res = res;
    this.cell = (this.half * 2) / (res - 1);
  }

  terrainAt(x, z) {
    if (!this.grid) return computeHeight(x, z);
    const fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    const r = this.res;
    if (fx < 0 || fz < 0 || fx >= r - 1 || fz >= r - 1) return computeHeight(x, z);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const g = this.grid, o = iz * r + ix;
    const a = g[o], b = g[o + 1], c = g[o + r], d = g[o + r + 1];
    // Triangle interpolation matching a PlaneGeometry-style split keeps feet on the mesh.
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  heightAt(x, z) {
    const h = this.terrainAt(x, z);
    if (this.thawed) return h;
    return h < WORLD.iceLevel ? WORLD.iceLevel : h;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell || 1.5;
    const hl = this.terrainAt(x - e, z), hr = this.terrainAt(x + e, z);
    const hd = this.terrainAt(x, z - e), hu = this.terrainAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  isLake(x, z) {
    return lakeSDF(x, z) < 0;
  }

  surfaceAt(x, z) {
    if (lakeSDF(x, z) < 0) return this.thawed ? 'water' : 'ice';
    const r = nearestRoad(x, z);
    if (r && r.d < r.road.width * 0.5) return 'road';
    const n = this.normalAt(x, z);
    return n.y < 0.75 ? 'rock' : 'snow';
  }
}
