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
// OWNER of grid generation strategy: terrain builder. The grid is computed by a pool of Web
// Workers (src/world/terrain/gridBuilder.js): near grid at 1025 samples per side (1.5625 m
// cells over [-800, 800]) unless ?gridRes= is given, then a far grid over [-4000, 4000] at
// 6.25 m that keeps computing in the background for the mountain horizon.
// Triangulation (shared by terrainAt, the terrain mesh and the shader sampler): each cell is
// split along the (i+1, j) to (i, j+1) diagonal.
import * as THREE from 'three';
import { computeHeight, lakeSDF, riverInfo, FALLS } from './heightfield.js';
import { WORLD, RIVER, nearestRoad } from './layout.js';
import { startGridJobs, mainThreadJobs, FAR } from './terrain/gridBuilder.js';

const DEFAULT_RES = 1025;

function triInterp(g, r, fx, fz) {
  const ix = fx | 0, iz = fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const o = iz * r + ix;
  const a = g[o], b = g[o + 1], c = g[o + r], d = g[o + r + 1];
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

export class World {
  constructor() {
    this.half = WORLD.gridHalf;
    this.res = 0;
    this.grid = null;
    this.thawed = false;
    this.stations = {};
    this.lakeSDF = lakeSDF;
    // Terrain builder data (not part of the public API).
    this.mask = null; // Uint8Array res*res*4 shader masks (road, lake SDF, river)
    this.far = null; // { grid, res, half, cell } once the background far grid lands
    this.farReady = Promise.resolve(null);
    // Normal/concavity texture data computed in the workers (null = compute on demand).
    this.normals = { near: Promise.resolve(null), far: Promise.resolve(null) };
    this.buildMs = 0;
  }

  // Build the cached grid. `res` samples per side (ignored in favor of the terrain default
  // unless ?gridRes= is set). onProgress(0..1). Resolves once heightAt is valid.
  async build(res = 385, onProgress) {
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const want = params && params.has('gridRes') ? res : DEFAULT_RES;
    const t0 = performance.now();
    const opts = { res: want, half: this.half, farRes: FAR.res, farHalf: FAR.half, onProgress };
    let job = startGridJobs(opts);
    let near;
    try {
      near = await job.near;
    } catch (e) {
      console.warn('[world] worker grid failed, falling back to the main thread', e);
      job = mainThreadJobs(opts);
      near = await job.near;
    }
    this.setGrid(near.grid, want);
    this.mask = near.mask;
    this.buildMs = performance.now() - t0;
    const k = 1 / this.cell;
    const soft = (p) => p.catch((e) => { console.warn('[world] normals job failed', e); return null; });
    this.normals.near = soft(job.normals(near.grid, want, this.cell, Math.max(1, Math.round(4.5 * k)), Math.max(2, Math.round(19 * k))));
    this.farReady = job.far.then(({ grid }) => this._acceptFar(grid)).catch((e) => {
      console.warn('[world] far grid failed', e);
      return null;
    });
    this.normals.far = soft(this.farReady.then((f) => (f ? job.normals(f.grid, f.res, f.cell, 1, 4) : null)));
    Promise.all([this.normals.near, this.normals.far]).finally(() => job.close());
    onProgress?.(1);
  }

  // Fill the far grid's inner box from the near grid and keep it for queries beyond the near grid.
  _acceptFar(grid) {
    const res = FAR.res, half = FAR.half, cell = (half * 2) / (res - 1);
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      if (Math.abs(z) > this.half) continue;
      for (let i = 0; i < res; i++) {
        const o = j * res + i;
        if (Number.isNaN(grid[o])) grid[o] = this.terrainAt(-half + i * cell, z);
      }
    }
    this.far = { grid, res, half, cell };
    return this.far;
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
    if (fx >= 0 && fz >= 0 && fx < r - 1 && fz < r - 1) return triInterp(this.grid, r, fx, fz);
    const f = this.far;
    if (f) {
      const gx = (x + f.half) / f.cell, gz = (z + f.half) / f.cell;
      if (gx >= 0 && gz >= 0 && gx < f.res - 1 && gz < f.res - 1) return triInterp(f.grid, f.res, gx, gz);
    }
    return computeHeight(x, z);
  }

  heightAt(x, z) {
    const h = this.terrainAt(x, z);
    if (this.thawed) return h;
    if (h < WORLD.iceLevel) return WORLD.iceLevel;
    // Frozen river: walk on the ice ribbon (Water.js puts it 0.3 m under the bed line, RIVER.width / 2 + 5.5 either
    // side of the centerline, flat across). Out to the ribbon's own edge, so the banks that dip under the ice are ice
    // underfoot too; where a bank rises above the ice the terrain wins. Same gaps as the ribbon: none on the falls
    // drop, none on the upper river within 8 m of the lip.
    const ice = this.riverIceAt(x, z);
    return ice != null ? Math.max(h, ice) : h;
  }

  // Height of the frozen river's ice at (x, z), or null off the ribbon (or after the thaw).
  riverIceAt(x, z) {
    if (this.thawed || x <= 280 || x >= 700 || z <= -110 || z >= -40) return null;
    const r = riverInfo(x, z);
    if (!r || r.d >= RIVER.width * 0.5 + 5.5 || (r.seg === 2 && r.t <= 0.25) || (r.seg < 2 && x < FALLS.x + 8)) return null;
    return r.bed - 0.3;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell || 1.5;
    const hl = this.terrainAt(x - e, z), hr = this.terrainAt(x + e, z);
    const hd = this.terrainAt(x, z - e), hu = this.terrainAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // Normal of the surface she walks on (lake and river ice count as flat ground), for slope checks. Placement keeps
  // normalAt, the terrain itself.
  walkNormalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell || 1.5;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  isLake(x, z) {
    return lakeSDF(x, z) < 0;
  }

  surfaceAt(x, z) {
    if (lakeSDF(x, z) < 0) return this.thawed ? 'water' : 'ice';
    const ice = this.riverIceAt(x, z);
    if (ice != null && this.terrainAt(x, z) < ice + 0.02) return 'ice';
    const r = nearestRoad(x, z);
    if (r && r.d < r.road.width * 0.5) return 'road';
    const n = this.normalAt(x, z);
    return n.y < 0.75 ? 'rock' : 'snow';
  }
}
