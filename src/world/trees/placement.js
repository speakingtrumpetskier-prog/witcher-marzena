// Where things grow. Owner: vegetation builder.
//
//   placeVegetation(G, kinds, opts)  -> { inner, far, stats } instance lists (tree layer + impostor ring)
//   GroundGenerator                  -> streamed dry grass, seed heads and weeds around the camera
//
// The density field is built from noise plus rules (see DESIGN 2): dense dark spruce forest in the
// north and west, thin gappy woods with stumps near the village, birch groves at the village edge,
// the hot spring and streams, pines on rocky ridges and steep ground, glades with negative space,
// a treeline that thins and stunts trees from about 200 m up to 380 m, and never on the lake, on
// roads (with a margin), inside LOC footprints or EXCLUSIONS.
import { createNoise } from '../../core/Noise.js';
import { rng, smoothstep, clamp, lerp, nearestOnPolyline } from '../../core/util.js';
import { LOC, ROADS, LAKE, RIVER, WORLD, nearestRoad } from '../layout.js';
import { lakeSDF, computeHeight } from '../heightfield.js';
import { exclusionFactor, EXCLUSIONS } from '../exclusions.js';

export const INNER = 660; // full detail area half size (playable is 620)
const FAR = 2300; // far impostor ring half size

const N = createNoise(90210);
const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// --- footprints: LOC circles (except the marsh, which wants reeds) ---------------------------
const LOCS = Object.entries(LOC).filter(([id]) => id !== 'marsh').map(([id, l]) => ({ id, x: l.x, z: l.z, r: l.r }));
const VILLAGE = LOC.village;
const MARSH = LOC.marsh;

function locDistance(x, z) {
  let best = 1e9;
  for (let i = 0; i < LOCS.length; i++) {
    const l = LOCS[i];
    const d = Math.hypot(x - l.x, z - l.z) - l.r;
    if (d < best) best = d;
  }
  return best;
}

// --- macro fields: forest density, birch weight, deadwood weight ---------------------------
function riverDistance(x, z) {
  if (x < 150) return 1e9;
  return nearestOnPolyline(x, z, RIVER.pts).d;
}

function macroForest(x, z) {
  let f = 0.52 + 0.85 * N.fbm2(x / 310 + 11, z / 310 - 5, 3);
  f += 0.58 * smoothstep(-170, -360, z); // north: dense dark forest
  f += 0.5 * smoothstep(-80, -300, x); // west
  f += 0.12 * smoothstep(250, 470, x);
  f -= 0.95 * gauss(x, z, 200, 230, 95); // idol hill stays open for its silhouette
  f -= 0.45 * gauss(x, z, -40, 215, 60); // sledding meadow
  f -= 0.4 * gauss(x, z, -365, 345, 55); // the watchtower ridge is the reveal
  f -= 0.3 * smoothstep(120, 240, z) * smoothstep(300, 120, Math.abs(x)); // south farmland
  return f;
}

function macroBirch(x, z, h) {
  let b = 0.12 + 0.95 * N.fbm2(x / 105 + 30, z / 105 + 70, 2);
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  b += 0.6 * smoothstep(270, 120, dv);
  b += 0.95 * smoothstep(125, 35, Math.hypot(x - LOC.hotSpring.x, z - LOC.hotSpring.z));
  b += 0.65 * smoothstep(70, 10, riverDistance(x, z));
  b += 0.15 * smoothstep(20, 4, h);
  b -= 0.6 * smoothstep(120, 220, h);
  return clamp(b, 0, 1);
}

function macroDead(x, z) {
  let d = 0.018;
  d += 0.16 * smoothstep(140, 40, Math.hypot(x - MARSH.x, z - MARSH.z));
  d += 0.1 * smoothstep(70, 18, Math.hypot(x - LOC.hunterCabin.x, z - LOC.hunterCabin.z));
  d += 0.1 * smoothstep(60, 15, Math.hypot(x - LOC.bearDen.x, z - LOC.bearDen.z));
  d += 0.1 * smoothstep(80, 18, Math.hypot(x - LOC.charcoal.x, z - LOC.charcoal.z));
  d += 0.08 * smoothstep(50, 12, Math.hypot(x - LOC.crossroads.x, z - LOC.crossroads.z));
  return d;
}

// Road distance raster (distance to the road edge, meters) at 4 m, valid up to 40 m.
class RoadRaster {
  constructor(half, cell) {
    this.half = half; this.cell = cell;
    this.n = Math.ceil((half * 2) / cell) + 1;
    this.d = new Float32Array(this.n * this.n).fill(99);
    for (const road of ROADS) {
      const hw = road.width * 0.5;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
        const x0 = Math.min(ax, bx) - 44, x1 = Math.max(ax, bx) + 44, z0 = Math.min(az, bz) - 44, z1 = Math.max(az, bz) + 44;
        const ix0 = Math.max(0, Math.floor((x0 + half) / cell)), ix1 = Math.min(this.n - 1, Math.ceil((x1 + half) / cell));
        const iz0 = Math.max(0, Math.floor((z0 + half) / cell)), iz1 = Math.min(this.n - 1, Math.ceil((z1 + half) / cell));
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            const px = ix * cell - half, pz = iz * cell - half;
            const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2);
            const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) - hw;
            const k = iz * this.n + ix;
            if (d < this.d[k]) this.d[k] = d;
          }
        }
      }
    }
  }
  at(x, z) {
    const ix = Math.round((x + this.half) / this.cell), iz = Math.round((z + this.half) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return 99;
    return this.d[iz * this.n + ix];
  }
  exact(x, z) {
    const r = nearestRoad(x, z);
    return r ? r.d - r.road.width * 0.5 : 99;
  }
  // exact only close to a road
  edge(x, z) {
    const d = this.at(x, z);
    return d < 9 ? this.exact(x, z) : d;
  }
}

let _roadRaster = null;
export function roadRaster() { return _roadRaster || (_roadRaster = new RoadRaster(INNER + 40, 4)); }

// Shared per point evaluation of the rules (used by trees and ground cover)
function lakeInfo(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  if (dx * dx + dz * dz > 1.9) return 200;
  return lakeSDF(x, z);
}

function tint(rn, base, spread, out) {
  const t = base + (rn() - 0.5) * spread;
  const h = rn() - 0.5;
  out[0] = t * (1 + 0.1 * h); out[1] = t; out[2] = t * (1 - 0.08 * h);
}

function indexByPrefix(kinds) {
  const idx = {};
  kinds.forEach((k, i) => { (idx[k.species] ||= []).push(i); });
  return idx;
}

// ---------------------------------------------------------------------------------------------
export async function placeVegetation(G, kinds, opts = {}) {
  const W = G.world;
  const q = G.quality;
  const dens = { low: 0.6, medium: 0.82, high: 1 }[q] ?? 1;
  const rn = rng(4711);
  const inner = [];
  const far = [];
  const by = indexByPrefix(kinds);
  const roads = roadRaster();
  const nrm = { x: 0, y: 1, z: 0 };
  const col = [1, 1, 1];
  let yieldT = performance.now();
  const maybeYield = async () => {
    if (performance.now() - yieldT > 30) { await new Promise((r) => setTimeout(r, 0)); yieldT = performance.now(); }
  };
  const stats = { tree: 0, snag: 0, bush: 0, deadwood: 0, reed: 0, far: 0 };

  const pickVar = (list, weights) => {
    if (!weights) return list[Math.floor(rn() * list.length)];
    let tot = 0;
    for (const w of weights) tot += w;
    let u = rn() * tot;
    for (let i = 0; i < list.length; i++) { u -= weights[i]; if (u <= 0) return list[i]; }
    return list[list.length - 1];
  };
  const normalAt = (x, z) => {
    const e = 2.5;
    const hl = W.terrainAt(x - e, z), hr = W.terrainAt(x + e, z), hd = W.terrainAt(x, z - e), hu = W.terrainAt(x, z + e);
    const nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const l = Math.hypot(nx, ny, nz);
    nrm.x = nx / l; nrm.y = ny / l; nrm.z = nz / l;
    return nrm.y;
  };

  const emit = (list, ki, x, y, z, s, sxMul, yaw, tiltMax, tintBase, view) => {
    const kind = kinds[ki];
    tint(rn, tintBase, 0.3, col);
    const tx = (rn() - 0.5) * 2 * tiltMax, tz = (rn() - 0.5) * 2 * tiltMax;
    list.push({
      k: ki, x, y, z, yaw, sx: s * sxMul, sy: s, r: col[0], g: col[1], b: col[2], tx, tz, view: view ?? (rn() < 0.5 ? 0 : 1),
      trunk: kind.trunkR * s * sxMul,
    });
  };

  // ------------------------------------------------------------------ inner forest
  const CS = 3.8;
  const R = INNER;
  const spruceIdx = by.spruce, pineIdx = by.pine, birchIdx = by.birch, snagIdx = by.snag;
  for (let gz = -R; gz < R; gz += CS) {
    await maybeYield();
    for (let gx = -R; gx < R; gx += CS) {
      const x = gx + rn() * CS, z = gz + rn() * CS;
      // cheap rejections first
      const ld = locDistance(x, z);
      if (ld < 1.8) continue;
      const h = W.heightAt(x, z);
      if (h > 392) continue;
      const sd = lakeInfo(x, z);
      if (sd < 2.5) continue;
      const exF = EXCLUSIONS.length ? exclusionFactor(x, z, 'tree') : 1;
      if (exF <= 0) continue;
      const F = macroForest(x, z);
      const rd = roads.edge(x, z);
      if (rd < 3.0) {
        // road verge: shrubs and the odd sapling only
        if (rd > 0.2 && rn() < 0.05 * dens) {
          const ki = pickVar(by.juniper);
          const ny = normalAt(x, z);
          emit(inner, ki, x, h - 0.1, z, 0.7 + rn() * 0.5, 1, rn() * 6.28, 0.04, 1, 0);
          stats.bush++;
          void ny;
        }
        continue;
      }
      const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z) - VILLAGE.r; // distance outside the village footprint
      const ny = normalAt(x, z);
      if (ny < 0.5) continue;
      let D = smoothstep(0.2, 0.62, F);
      D *= 1 - smoothstep(250, 390, h);
      D *= smoothstep(0.52, 0.8, ny);
      D *= smoothstep(1.8, 22, ld) * smoothstep(3.0, 14, rd) * exF;
      D *= smoothstep(2.5, 22, sd);
      // village: thin and gappy, cut for firewood
      let vill = 1;
      if (dv < 190) vill = Math.pow(smoothstep(-2, 190, dv), 1.35);
      D *= vill;
      // glades and clumps
      const gl = N.fbm2(x / 62 + 13, z / 62 - 7, 2);
      D *= 1 - 0.96 * smoothstep(0.28, 0.5, gl);
      const mic = N.fbm2(x / 15 + 3, z / 15 + 9, 2);
      D *= 0.62 + 0.62 * (mic * 0.5 + 0.5);
      D *= dens;

      const roll = rn();
      if (roll < D) {
        // choose species
        const B = macroBirch(x, z, h);
        const hcurv = h - 0.25 * (W.heightAt(x + 30, z) + W.heightAt(x - 30, z) + W.heightAt(x, z + 30) + W.heightAt(x, z - 30));
        let P = 0.55 * smoothstep(0.88, 0.7, ny) + 0.5 * smoothstep(2, 9, hcurv) + 0.35 * smoothstep(0.1, 0.55, N.fbm2(x / 180 + 50, z / 180 - 20, 2)) * smoothstep(0.0, 0.5, 1 - B)
          + 0.35 * smoothstep(90, 240, h);
        P = clamp(P, 0, 0.9);
        const dead = macroDead(x, z) * (0.6 + 0.8 * (1 - F));
        let ki, s, sxm, tiltMax, tb;
        const u = rn();
        if (rn() < dead) {
          ki = pickVar(snagIdx);
          s = lerp(0.8, 1.2, rn()); sxm = 0.95 + rn() * 0.15; tiltMax = 0.06; tb = 1;
          stats.snag++;
        } else if (u < P * (1 - B * 0.6)) {
          ki = pickVar(pineIdx);
          s = lerp(0.75, 1.2, Math.pow(rn(), 1.2)); sxm = 0.9 + rn() * 0.2; tiltMax = 0.035; tb = 1;
          stats.tree++;
        } else if (u < P * (1 - B * 0.6) + B * 0.9 && B > 0.25) {
          ki = pickVar(birchIdx);
          s = lerp(0.72, 1.18, rn()); sxm = 0.9 + rn() * 0.25; tiltMax = 0.05; tb = 1;
          stats.tree++;
        } else {
          // spruce: forest interior favours the tall variants, edges the young ones
          const young = smoothstep(0.55, 0.28, F);
          ki = pickVar(spruceIdx, [1, 0.9, 0.35 + 0.2 * F, 0.15 + 0.9 * young]);
          s = lerp(0.62, 1.12, Math.pow(rn(), 1.15)) * (1 + 0.08 * smoothstep(0.7, 1.1, F));
          sxm = (0.88 + rn() * 0.22) * (1 - 0.1 * clamp(F, 0, 1));
          tiltMax = 0.02; tb = 1;
          stats.tree++;
        }
        const stunt = lerp(1, 0.38, smoothstep(160, 335, h));
        s *= stunt;
        const kind = kinds[ki];
        const slope = Math.sqrt(1 - ny * ny) / ny;
        const y = h - 0.14 - kind.trunkR * s * slope * 0.9;
        emit(inner, ki, x, y, z, s, sxm, rn() * 6.28, tiltMax, tb);
      } else {
        // understory and deadwood
        const edge = clamp(1 - Math.abs(F - 0.4) / 0.22, 0, 1);
        const roadside = rd < 11 ? smoothstep(3, 5, rd) * smoothstep(11, 6, rd) : 0;
        const shore = sd < 28 ? smoothstep(2.5, 6, sd) * smoothstep(28, 10, sd) : 0;
        const forest = smoothstep(0.25, 0.6, F);
        let pu = (0.012 + 0.07 * edge + 0.1 * roadside + 0.08 * shore + 0.012 * forest) * dens * exF * smoothstep(0.62, 0.8, ny) * vill;
        pu *= smoothstep(1.8, 12, ld);
        if (rn() < pu) {
          const w = rn();
          const forestInterior = forest > 0.5;
          if (w < 0.38) {
            const ki = pickVar(by.juniper);
            emit(inner, ki, x, h - 0.1, z, 0.65 + rn() * 0.7, 1 + (rn() - 0.5) * 0.2, rn() * 6.28, 0.05, 1);
          } else if (w < 0.72) {
            const ki = pickVar(by.snowbush);
            emit(inner, ki, x, h - 0.12, z, 0.7 + rn() * 0.7, 1 + (rn() - 0.5) * 0.3, rn() * 6.28, 0.03, 1);
          } else {
            const ki = pickVar(by.sapling);
            const s = (forestInterior ? 0.6 : 1) * (0.7 + rn() * 0.7);
            emit(inner, ki, x, h - 0.1, z, s, 1, rn() * 6.28, 0.04, 1);
          }
          stats.bush++;
        } else if (dv < 175 && dv > 2 && vill < 0.97 && rn() < (1 - vill) * 0.075 * dens) {
          // cut for firewood: stumps near the village
          const ki = pickVar(by.stump, [3, 0.6]);
          emit(inner, ki, x, h - 0.05, z, 0.8 + rn() * 0.5, 1, rn() * 6.28, 0.02, 1, 0);
          stats.deadwood++;
        } else if (forest > 0.55 && rn() < 0.0055 * dens && ny > 0.8) {
          const ki = pickVar(by.log, [3, 1]);
          const s = 0.8 + rn() * 0.55;
          emit(inner, ki, x, h - 0.12, z, s, 1, rn() * 6.28, 0.0, 1, 0);
          stats.deadwood++;
        } else if (forest > 0.5 && rn() < 0.004 * dens && ny > 0.75) {
          const ki = pickVar(by.stump, [0.3, 1]);
          emit(inner, ki, x, h - 0.05, z, 0.8 + rn() * 0.6, 1, rn() * 6.28, 0.02, 1, 0);
          stats.deadwood++;
        }
      }
    }
  }

  // ------------------------------------------------------------------ marsh and shore reeds
  const reedIdx = by.reed;
  const cattail = kinds.findIndex((k) => k.id === 'cattail');
  const reedKinds = reedIdx.filter((i) => i !== cattail);
  {
    const RS = 2.3;
    const reach = 82;
    for (let gz = MARSH.z - reach; gz < MARSH.z + reach; gz += RS) {
      await maybeYield();
      for (let gx = MARSH.x - reach; gx < MARSH.x + reach; gx += RS) {
        const x = gx + rn() * RS, z = gz + rn() * RS;
        const dm = Math.hypot(x - MARSH.x, z - MARSH.z);
        if (dm > reach) continue;
        const ld = locDistance(x, z);
        if (ld < 0.5) continue;
        const exF = EXCLUSIONS.length ? exclusionFactor(x, z, 'reed') : 1;
        if (exF <= 0) continue;
        const sd = lakeInfo(x, z);
        const inMarsh = dm < MARSH.r + 14;
        if (sd < -1 && !inMarsh) continue;
        if (roads.edge(x, z) < 1.5) continue;
        const h = W.heightAt(x, z);
        if (h > 6) continue;
        const patch = N.fbm2(x / 17 + 80, z / 17 - 40, 2) * 0.5 + 0.5;
        const core = smoothstep(MARSH.r + 34, MARSH.r * 0.35, dm);
        const dd = smoothstep(0.32, 0.62, patch) * core * 0.95 * exF * dens;
        if (rn() < dd) {
          const isCat = rn() < 0.18 && dm < MARSH.r + 6;
          const ki = isCat ? cattail : pickVar(reedKinds, [1, 0.7]);
          const s = 0.8 + rn() * 0.5;
          emit(inner, ki, x, h - 0.05, z, s, 0.9 + rn() * 0.3, rn() * 6.28, 0.04, 1, 0);
          stats.reed++;
        }
      }
    }
  }
  // reed beds along other shores: walk the shoreline
  {
    const steps = 720;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // find the shoreline radius along this ray by bisection
      let lo = 0.4, hi = 1.5;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) / 2;
        if (lakeSDF(LAKE.x + ca * LAKE.rx * mid, LAKE.z + sa * LAKE.rz * mid) < 0) lo = mid; else hi = mid;
      }
      const sx = LAKE.x + ca * LAKE.rx * lo, sz = LAKE.z + sa * LAKE.rz * lo;
      if (Math.hypot(sx - MARSH.x, sz - MARSH.z) < MARSH.r + 30) continue;
      const bed = N.fbm2(a * 2.2 + 5, 1.7, 3) * 0.5 + 0.5 + N.fbm2(sx / 30, sz / 30, 2) * 0.2;
      if (bed < 0.58) continue;
      const n = 1 + Math.floor(rn() * 3);
      for (let j = 0; j < n; j++) {
        const off = -1.8 + rn() * 7.5; // positive = on land
        const tx = sx + ca * off * 0.7 + (rn() - 0.5) * 3, tz = sz + sa * off * 0.7 + (rn() - 0.5) * 3;
        if (locDistance(tx, tz) < 1) continue;
        if (roads.edge(tx, tz) < 2) continue;
        const exF = EXCLUSIONS.length ? exclusionFactor(tx, tz, 'reed') : 1;
        if (exF <= 0.1) continue;
        const ldist = lakeSDF(tx, tz);
        if (ldist < -2.5) continue;
        const h = W.heightAt(tx, tz);
        const ki = rn() < 0.12 ? cattail : pickVar(reedKinds);
        emit(inner, ki, tx, h - 0.05, tz, 0.75 + rn() * 0.5, 0.9 + rn() * 0.3, rn() * 6.28, 0.04, 1, 0);
        stats.reed++;
      }
    }
  }

  // ------------------------------------------------------------------ far ring (impostors only)
  {
    const FS = 12;
    // coarse height grid for prefiltering (exact height only for accepted cells)
    const GS = 48;
    const gn = Math.ceil((FAR * 2) / GS) + 1;
    const grid = new Float32Array(gn * gn);
    for (let j = 0; j < gn; j++) {
      await maybeYield();
      for (let i = 0; i < gn; i++) {
        const x = -FAR + i * GS, z = -FAR + j * GS;
        grid[j * gn + i] = (Math.abs(x) < WORLD.gridHalf - 20 && Math.abs(z) < WORLD.gridHalf - 20) ? W.terrainAt(x, z) : computeHeight(x, z);
      }
    }
    const gh = (x, z) => {
      const fx = (x + FAR) / GS, fz = (z + FAR) / GS;
      const ix = clamp(Math.floor(fx), 0, gn - 2), iz = clamp(Math.floor(fz), 0, gn - 2);
      const tx = fx - ix, tz = fz - iz;
      const a = grid[iz * gn + ix], b = grid[iz * gn + ix + 1], c = grid[(iz + 1) * gn + ix], d = grid[(iz + 1) * gn + ix + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    };
    const farKinds = [...spruceIdx, ...pineIdx, ...birchIdx, ...snagIdx];
    for (let gz = -FAR; gz < FAR; gz += FS) {
      await maybeYield();
      for (let gx = -FAR; gx < FAR; gx += FS) {
        if (Math.abs(gx) < R - 6 && Math.abs(gz) < R - 6) { gx += 2 * R - 12 - FS + FS; if (gx >= FAR) break; }
        const x = gx + rn() * FS, z = gz + rn() * FS;
        if (Math.abs(x) < R && Math.abs(z) < R) continue;
        const hc = gh(x, z);
        if (hc > 420 || hc < 1) continue;
        const sl = Math.hypot(gh(x + 20, z) - gh(x - 20, z), gh(x, z + 20) - gh(x, z - 20)) / 40;
        if (sl > 1.05) continue;
        let F = macroForest(x, z);
        F = F * 0.9 + 0.12;
        let D = smoothstep(0.18, 0.6, F) * (1 - smoothstep(260, 395, hc)) * (1 - smoothstep(0.55, 1.0, sl));
        D *= 1 - 0.9 * smoothstep(0.3, 0.52, N.fbm2(x / 90 + 5, z / 90 + 9, 2));
        D *= 1.4 * dens;
        if (rn() >= D) continue;
        const h = Math.abs(x) < WORLD.gridHalf - 8 && Math.abs(z) < WORLD.gridHalf - 8 ? W.terrainAt(x, z) : computeHeight(x, z);
        if (h > 405) continue;
        const B = macroBirch(x, z, h);
        const u = rn();
        let ki;
        if (u < 0.1 + 0.2 * smoothstep(90, 250, h)) ki = pickVar(pineIdx);
        else if (u < 0.1 + B * 0.5 && B > 0.35 && h < 130) ki = pickVar(birchIdx);
        else ki = pickVar(spruceIdx, [1, 0.9, 0.5, 0.2]);
        void farKinds;
        const stunt = lerp(1, 0.4, smoothstep(160, 335, h));
        const s = lerp(0.7, 1.15, rn()) * stunt * 1.12;
        tint(rn, 1, 0.3, col);
        far.push({ k: ki, x, y: h - 1.0 - sl * 3, z, sx: s * (0.95 + rn() * 0.2), sy: s, r: col[0], g: col[1], b: col[2], view: rn() < 0.5 ? 0 : 1 });
        stats.far++;
      }
    }
  }
  return { inner, far, stats };
}

// ---------------------------------------------------------------------------------------------
// Ground cover generator: streamed per cell around the camera.
export class GroundGenerator {
  constructor(G, kinds, density = 1) {
    this.G = G;
    this.kinds = kinds;
    this.density = density;
    this.idx = {};
    kinds.forEach((k, i) => { this.idx[k.id] = i; });
    this.cleared = [];
  }

  // Returns instance records for one cell (cs meters square with its corner at cx*cs, cz*cs).
  generate(cx, cz, cs) {
    const W = this.G.world;
    const roads = roadRaster();
    const out = [];
    const rn = rng(((cx * 73856093) ^ (cz * 19349663) ^ 0x9e3779b1) >>> 0);
    const step = 1.5;
    const cols = [1, 1, 1];
    const a = this.idx.grass_a, b = this.idx.grass_b, c = this.idx.weed_c;
    for (let gz = 0; gz < cs; gz += step) {
      for (let gx = 0; gx < cs; gx += step) {
        const x = cx * cs + gx + rn() * step, z = cz * cs + gz + rn() * step;
        const r1 = rn(), r2 = rn(), r3 = rn(), r4 = rn(), r5 = rn();
        const ld = Math.abs(x) > 700 || Math.abs(z) > 700 ? 99 : locDistance(x, z);
        if (ld < 0.8) continue;
        const sd = lakeInfo(x, z);
        const dm = Math.hypot(x - MARSH.x, z - MARSH.z);
        if (sd < 1.5 && !(dm < MARSH.r + 6 && sd > -30)) continue;
        const h = W.heightAt(x, z);
        if (h > 330) continue;
        const rd = roads.edge(x, z);
        if (rd < 0.9) continue;
        for (const e of this.cleared) if (Math.hypot(x - e.x, z - e.z) < e.r) { continue; }
        if (this.cleared.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
        const exF = EXCLUSIONS.length ? exclusionFactor(x, z, 'ground') : 1;
        if (exF <= 0) continue;
        const e = 2.5;
        const nx = W.terrainAt(x - e, z) - W.terrainAt(x + e, z), nz = W.terrainAt(x, z - e) - W.terrainAt(x, z + e);
        const ny = 2 * e / Math.hypot(nx, 2 * e, nz);
        if (ny < 0.6) continue;
        const F = macroForest(x, z);
        const forest = smoothstep(0.3, 0.75, F);
        const patch = N.fbm2(x / 8 + 21, z / 8 - 33, 2) * 0.5 + 0.5;
        const meadow = 1 - 0.65 * forest;
        let p = (0.12 + 0.6 * smoothstep(0.25, 0.65, patch)) * meadow;
        p += 0.18 * smoothstep(8, 3, rd) * smoothstep(0.9, 1.6, rd);
        p += 0.2 * smoothstep(30, 4, sd) * smoothstep(1.5, 4, sd);
        p *= smoothstep(0.6, 0.85, ny) * smoothstep(1.2, 4, ld) * exF * this.density;
        if (dm < MARSH.r + 10) p += 0.2;
        if (r1 >= p) continue;
        const v = r2;
        const ki = v < 0.34 ? a : v < 0.82 ? b : c;
        const s = 0.7 + r3 * 0.7;
        const t = 0.82 + r4 * 0.36;
        cols[0] = t * (1 + 0.1 * (r5 - 0.5)); cols[1] = t; cols[2] = t * (1 - 0.1 * (r5 - 0.5));
        out.push({ k: ki, x, y: h - 0.02, z, yaw: r5 * 6.28, sx: s, sy: s * (0.8 + r4 * 0.5), r: cols[0], g: cols[1], b: cols[2], tx: (r2 - 0.5) * 0.2, tz: (r3 - 0.5) * 0.2 });
        // sometimes a second tuft right next to it for clumps
        if (r1 < p * 0.35) {
          const k2 = r4 < 0.6 ? a : b;
          out.push({ k: k2, x: x + (r2 - 0.5) * 0.7, y: h - 0.02, z: z + (r3 - 0.5) * 0.7, yaw: r4 * 6.28, sx: s * 0.8, sy: s * 0.8, r: cols[0], g: cols[1], b: cols[2], tx: 0, tz: 0 });
        }
      }
    }
    return out;
  }
}
