// Walking navigation for villagers and animals: a coarse grid per region (1 m cells) built from
// the real colliders, the terrain slope and ROADS, searched with A* (road cells are cheaper, so
// people follow streets and trampled lanes), then string-pulled into a few waypoints.
//
//   const nav = new Nav(G);
//   nav.ensure(x, z)                 make sure a region covers this point (built lazily, 250 x 250 m)
//   nav.build(x0, z0, x1, z1)        (re)build one region from the current colliders
//   nav.rebuild()                    rebuild every region (call after buildings or props are added)
//   nav.plan(x0, z0, x1, z1)         -> [{ x, z }, ...] ending exactly at (x1, z1), or null if unreachable (synchronous)
//   nav.request(x0, z0, x1, z1, cb)  queued plan searched by nav.pump(budgetMs) a few ms per frame; cb(path | null)
//   nav.flag(x, z)                   0 free, 1 blocked (inside a collider plus agent radius), 2 margin
//   nav.randomFree(x, z, rmin, rmax, rand)   -> { x, z } | null, a free spot in an annulus
//   nav.randomRoad(rand, near?)      -> { x, z } | null, a free cell on or beside a road
//   nav.snap(x, z, out)              nearest free cell center (for goals inside colliders)
// Cells are Uint8 flags plus Float32 step costs; A* uses a binary heap on typed arrays and
// version stamps, so a plan allocates only its result.
import { ROADS } from '../../world/layout.js';

const CELL = 1;
const AGENT = 0.42; // collider padding for a "blocked" cell
const MARGIN = 1.25; // distance to a collider inside which a cell asks for runtime resolve
const MAX_SLOPE = 0.85;
const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

class Region {
  constructor(x0, z0, x1, z1) {
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL);
    this.nz = Math.ceil((z1 - z0) / CELL);
    this.x1 = x0 + this.nx * CELL; this.z1 = z0 + this.nz * CELL;
    const n = this.nx * this.nz;
    this.flags = new Uint8Array(n);
    this.cost = new Float32Array(n);
    this.roadD = new Float32Array(n).fill(99);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n + 8);
    this.fcost = new Float32Array(n);
    this.run = 0;
    this.roadCells = null;
  }
  inside(x, z) { return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1; }
  cx(i) { return this.x0 + ((i % this.nx) + 0.5) * CELL; }
  cz(i) { return this.z0 + (((i / this.nx) | 0) + 0.5) * CELL; }
  at(x, z) {
    const ix = Math.floor((x - this.x0) / CELL), iz = Math.floor((z - this.z0) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }
}

export class Nav {
  constructor(G) {
    this.G = G;
    this.regions = [];
    this.queue = [];
    this.stats = { plans: 0, planMs: 0, maxMs: 0, buildMs: 0 };
  }

  regionAt(x, z) {
    for (const r of this.regions) if (r.inside(x, z)) return r;
    return null;
  }

  // Region around (x, z), 250 x 250 m, aligned to 25 m so neighbors tile.
  ensure(x, z) {
    let r = this.regionAt(x, z);
    if (r) return r;
    const half = 125;
    const x0 = Math.floor((x - half) / 25) * 25, z0 = Math.floor((z - half) / 25) * 25;
    r = this.build(x0, z0, x0 + half * 2, z0 + half * 2);
    return r;
  }

  build(x0, z0, x1, z1) {
    const t0 = performance.now();
    const G = this.G;
    const R = new Region(x0, z0, x1, z1);
    const { nx, nz } = R;
    const world = G.world;
    const flags = R.flags, cost = R.cost;
    // Terrain: slope and the lake (ice is walkable but a little slower than packed snow).
    for (let j = 0; j < nz; j++) {
      const z = R.z0 + (j + 0.5) * CELL;
      for (let i = 0; i < nx; i++) {
        const x = R.x0 + (i + 0.5) * CELL;
        const o = j * nx + i;
        const h = world.heightAt(x, z);
        const sx = (world.heightAt(x + 1, z) - world.heightAt(x - 1, z)) * 0.5;
        const sz = (world.heightAt(x, z + 1) - world.heightAt(x, z - 1)) * 0.5;
        const slope = Math.hypot(sx, sz);
        let c = 1;
        if (slope > MAX_SLOPE) flags[o] = 1;
        c += slope * 2.5;
        if (world.terrainAt(x, z) < 0.05 && h <= 0.05) c *= 1.2;
        cost[o] = c;
      }
    }
    // Roads: distance field near the polylines (cheap packed-snow lanes).
    for (const road of ROADS) {
      const half = road.width * 0.5 + 0.9;
      for (let k = 0; k < road.pts.length - 1; k++) {
        const [ax, az] = road.pts[k], [bx, bz] = road.pts[k + 1];
        const minX = Math.min(ax, bx) - half - 1, maxX = Math.max(ax, bx) + half + 1;
        const minZ = Math.min(az, bz) - half - 1, maxZ = Math.max(az, bz) + half + 1;
        if (maxX < R.x0 || minX > R.x1 || maxZ < R.z0 || minZ > R.z1) continue;
        const i0 = Math.max(0, Math.floor((minX - R.x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((maxX - R.x0) / CELL));
        const j0 = Math.max(0, Math.floor((minZ - R.z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((maxZ - R.z0) / CELL));
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
        for (let j = j0; j <= j1; j++) {
          const z = R.z0 + (j + 0.5) * CELL;
          for (let i = i0; i <= i1; i++) {
            const x = R.x0 + (i + 0.5) * CELL;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
            const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - road.width * 0.5;
            const o = j * nx + i;
            if (d < R.roadD[o]) R.roadD[o] = d;
          }
        }
      }
    }
    // Colliders rasterized into flags (blocked within AGENT of a solid, margin within MARGIN).
    this._rasterColliders(R);
    for (let o = 0; o < nx * nz; o++) {
      if (flags[o] === 2) cost[o] += 0.6;
      if (R.roadD[o] < 0.9 && flags[o] === 0) cost[o] *= 0.55;
      else if (R.roadD[o] < 2.5 && flags[o] === 0) cost[o] *= 0.8;
    }
    const rc = [];
    for (let o = 0; o < nx * nz; o++) if (R.roadD[o] < 0.6 && flags[o] === 0) rc.push(o);
    R.roadCells = Int32Array.from(rc);
    // Replace an existing overlapping region built for the same box.
    this.regions = this.regions.filter((r) => !(r.x0 === R.x0 && r.z0 === R.z0 && r.nx === R.nx && r.nz === R.nz));
    this.regions.push(R);
    this.stats.buildMs = performance.now() - t0;
    return R;
  }

  _rasterColliders(R) {
    const phys = this.G.physics;
    if (!phys) return;
    const { nx, nz, flags } = R;
    const pad = MARGIN;
    for (const it of phys.items.values()) {
      const b = it.bounds;
      if (b.maxX + pad < R.x0 || b.minX - pad > R.x1 || b.maxZ + pad < R.z0 || b.minZ - pad > R.z1) continue;
      // Ignore overhead blockers (roof beams of open sheds, gallery floors).
      if (it.y0 > -500) {
        const gh = this.G.world.heightAt(it.x, it.z);
        if (it.y0 > gh + 2.4) continue;
      }
      const i0 = Math.max(0, Math.floor((b.minX - pad - R.x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((b.maxX + pad - R.x0) / CELL));
      const j0 = Math.max(0, Math.floor((b.minZ - pad - R.z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((b.maxZ + pad - R.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = R.z0 + (j + 0.5) * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = R.x0 + (i + 0.5) * CELL;
          let d;
          if (it.type === 'circle') d = Math.hypot(x - it.x, z - it.z) - it.r;
          else {
            const dx = x - it.x, dz = z - it.z;
            const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
            const ox = Math.max(0, Math.abs(lx) - it.hw), oz = Math.max(0, Math.abs(lz) - it.hd);
            d = Math.hypot(ox, oz);
            if (ox === 0 && oz === 0) d = -Math.min(it.hw - Math.abs(lx), it.hd - Math.abs(lz));
          }
          const o = j * nx + i;
          if (d < AGENT) flags[o] = 1;
          else if (d < MARGIN && flags[o] === 0) flags[o] = 2;
        }
      }
    }
  }

  rebuild() {
    const old = this.regions;
    this.regions = [];
    for (const r of old) this.build(r.x0, r.z0, r.x1, r.z1);
  }

  flag(x, z) {
    const R = this.regionAt(x, z);
    if (!R) return 0;
    return R.flags[R.at(x, z)];
  }

  // Nearest free (flag 0 or 2) cell center to (x, z) within maxR meters.
  snap(x, z, out = { x: 0, z: 0 }, maxR = 7) {
    const R = this.regionAt(x, z);
    if (!R) { out.x = x; out.z = z; return out; }
    const o = R.at(x, z);
    if (R.flags[o] !== 1) { out.x = x; out.z = z; return out; }
    const ci = Math.floor((x - R.x0) / CELL), cj = Math.floor((z - R.z0) / CELL);
    let best = 1e9, bi = -1;
    const rr = Math.ceil(maxR / CELL);
    for (let j = Math.max(0, cj - rr); j <= Math.min(R.nz - 1, cj + rr); j++) {
      for (let i = Math.max(0, ci - rr); i <= Math.min(R.nx - 1, ci + rr); i++) {
        const k = j * R.nx + i;
        if (R.flags[k] === 1) continue;
        const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
        if (d < best) { best = d; bi = k; }
      }
    }
    if (bi < 0) { out.x = x; out.z = z; return out; }
    out.x = R.cx(bi); out.z = R.cz(bi);
    return out;
  }

  randomFree(x, z, rmin, rmax, rand = Math.random) {
    const R = this.regionAt(x, z);
    if (!R) return null;
    for (let k = 0; k < 14; k++) {
      const a = rand() * Math.PI * 2, d = rmin + (rmax - rmin) * rand();
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      const o = R.at(px, pz);
      if (o >= 0 && R.flags[o] === 0) return { x: px, z: pz };
    }
    return null;
  }

  // A free road cell, optionally within `maxD` of (near.x, near.z).
  randomRoad(rand = Math.random, near = null, maxD = 60) {
    const R = near ? this.regionAt(near.x, near.z) : this.regions[0];
    if (!R || !R.roadCells || !R.roadCells.length) return null;
    for (let k = 0; k < 20; k++) {
      const o = R.roadCells[Math.floor(rand() * R.roadCells.length)];
      const x = R.cx(o), z = R.cz(o);
      if (near && Math.hypot(x - near.x, z - near.z) > maxD) continue;
      return { x, z };
    }
    return null;
  }

  // Straight segment clear of blocked cells?
  los(R, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.5);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const o = R.at(ax + dx * t, az + dz * t);
      if (o < 0 || R.flags[o] === 1) return false;
    }
    return true;
  }

  // Synchronous plan (load time, teleports). Returns waypoints or null.
  plan(x0, z0, x1, z1) {
    const job = this._begin(x0, z0, x1, z1);
    if (job.done) return job.result;
    this._run(job, Infinity);
    return job.result;
  }

  // Queued plan for gameplay: searched a few milliseconds per frame by pump(); cb(path | null).
  request(x0, z0, x1, z1, cb) {
    this.queue.push({ x0, z0, x1, z1, cb, job: null });
  }

  pump(budgetMs = 2.5) {
    const t0 = performance.now();
    while (this.queue.length) {
      const q = this.queue[0];
      if (!q.job) q.job = this._begin(q.x0, q.z0, q.x1, q.z1);
      if (!q.job.done) this._run(q.job, Math.max(0.3, budgetMs - (performance.now() - t0)));
      if (!q.job.done) return;
      this.queue.shift();
      q.cb(q.job.result);
      if (performance.now() - t0 > budgetMs) return;
    }
  }

  _begin(x0, z0, x1, z1) {
    const job = { done: true, result: null, R: null, t: 0 };
    const R = this.regionAt(x0, z0);
    if (!R || !R.inside(x1, z1)) return job;
    const s = R.at(x0, z0), g0 = R.at(x1, z1);
    if (s < 0 || g0 < 0) return job;
    const tmp = { x: 0, z: 0 };
    let si = s, gi = g0;
    if (R.flags[si] === 1) { this.snap(x0, z0, tmp); si = R.at(tmp.x, tmp.z); }
    if (R.flags[gi] === 1) { this.snap(x1, z1, tmp); gi = R.at(tmp.x, tmp.z); }
    if (si === gi || (Math.hypot(x1 - x0, z1 - z0) < 14 && this.los(R, x0, z0, x1, z1))) {
      job.result = [{ x: x1, z: z1 }];
      return job;
    }
    const run = ++R.run;
    Object.assign(job, { done: false, R, x0, z0, x1, z1, si, gi, g0, run, hn: 0, iters: 0, gix: gi % R.nx, giz: (gi / R.nx) | 0 });
    R.g[si] = 0; R.stamp[si] = run; R.parent[si] = -1; R.fcost[si] = this._h(job, si);
    this._push(job, si);
    return job;
  }

  _h(job, k) {
    const nx = job.R.nx;
    const dx = Math.abs((k % nx) - job.gix), dz = Math.abs(((k / nx) | 0) - job.giz);
    return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * 0.95;
  }

  _push(job, k) {
    const { heap, fcost } = job.R;
    let i = job.hn++;
    heap[i] = k;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fcost[heap[p]] <= fcost[heap[i]]) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
  }

  _pop(job) {
    const { heap, fcost } = job.R;
    const top = heap[0];
    heap[0] = heap[--job.hn];
    let i = 0;
    const hn = job.hn;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < hn && fcost[heap[l]] < fcost[heap[m]]) m = l;
      if (r < hn && fcost[heap[r]] < fcost[heap[m]]) m = r;
      if (m === i) break;
      const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
    }
    return top;
  }

  // Search until done or `maxMs` elapsed (checked every 96 expansions).
  _run(job, maxMs) {
    const t0 = performance.now();
    const R = job.R, run = job.run;
    const { nx, nz, g, parent, stamp, closed, flags, cost, fcost } = R;
    let found = false;
    let n = 0;
    while (job.hn > 0 && job.iters < 60000) {
      if ((++n & 95) === 0 && performance.now() - t0 > maxMs) { this._tick(t0); return; }
      job.iters++;
      const k = this._pop(job);
      if (closed[k] === run) continue;
      closed[k] = run;
      if (k === job.gi) { found = true; break; }
      const ki = k % nx, kj = (k / nx) | 0;
      for (let d = 0; d < 8; d++) {
        const nb = NB[d];
        const ni = ki + nb[0], nj = kj + nb[1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const m = nj * nx + ni;
        if (flags[m] === 1 || closed[m] === run) continue;
        // No corner cutting through diagonal gaps between blocked cells.
        if (nb[0] !== 0 && nb[1] !== 0 && (flags[kj * nx + ni] === 1 || flags[nj * nx + ki] === 1)) continue;
        const ng = g[k] + nb[2] * cost[m];
        if (stamp[m] !== run || ng < g[m]) {
          stamp[m] = run; g[m] = ng; parent[m] = k; fcost[m] = ng + this._h(job, m);
          this._push(job, m);
        }
      }
    }
    job.done = true;
    this.stats.plans++;
    this._tick(t0);
    if (!found) return;
    job.result = this._finish(job);
  }

  // Reconstruct the cell chain, then string-pull it with line-of-sight into a few waypoints.
  _finish(job) {
    const { R, si, gi, g0, x0, z0, x1, z1 } = job;
    const cells = [];
    for (let k = gi; k >= 0; k = R.parent[k]) { cells.push(k); if (k === si) break; }
    cells.reverse();
    const out = [];
    let a = { x: x0, z: z0 };
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      for (; j > i + 1; j--) if (this.los(R, a.x, a.z, R.cx(cells[j]), R.cz(cells[j]))) break;
      const c = cells[j];
      a = { x: R.cx(c), z: R.cz(c) };
      out.push(a);
      i = j;
    }
    // The exact goal replaces the last cell center (or is appended when the goal was snapped).
    if (out.length && gi === g0) out[out.length - 1] = { x: x1, z: z1 };
    else out.push({ x: x1, z: z1 });
    return out;
  }

  _tick(t0) {
    const ms = performance.now() - t0;
    this.stats.planMs += ms;
    if (ms > this.stats.maxMs) this.stats.maxMs = ms;
  }
}
