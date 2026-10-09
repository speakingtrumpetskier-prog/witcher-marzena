// Terrain renderer (owner: terrain builder). G.terrain.
//
// One instanced draw for the whole landscape: a CDLOD quadtree (Strugar) over a 12.8 km root
// selects 32x32-cell patches each frame (frustum culled, front-to-back sorted); vertices are
// displaced on the GPU from the baked height textures and morph toward the next coarser grid
// near each LOD range, so there are no cracks or popping. Inside the near grid (+-800 m) the
// finest level uses the exact 1.5625 m grid and the same triangle split as World.terrainAt;
// beyond it the far grid (6.25 m, to +-4000 m) gives the layered mountain horizon.
//
// Public API (G.terrain):
//   mesh, material, depthMaterial      the instanced terrain mesh and its materials
//   uniforms                           shared terrain uniforms (textures, info vectors)
//   textures                           { nearH, farH, nearN, farN, mask, near, far }
//   glsl                               TERRAIN_SAMPLE_GLSL (mzHeight, mzTerrainNormal, mzTerrainMask)
//   stats                              { patches, triangles, buildMs }
//   setRoadMask()                      no-op (roads come from layout and are baked in the mask)
import * as THREE from 'three';
import { terrainUniforms, TERRAIN_SAMPLE_GLSL } from './terrain/terrainGLSL.js';
import { createTerrainMaterials } from './terrain/terrainMaterial.js';
import { computeHeight } from './heightfield.js';
import { noiseTextures } from './terrain/noiseTextures.js';
import { normalData } from './terrain/normals.js';

const PATCH = 32; // cells per patch side
const ROOT_HALF = 6400; // quadtree root covers [-6400, 6400]; 800 m nodes align with the near grid
const LEVELS = 8; // L0 node 100 m (patch 50 m) ... L7 node 12800 m
const DATA_HALF = 4300; // nodes beyond this are skipped (the far grid ends at 4000 and clamps)
const MAX_PATCHES = 3000;
const KEEP_NEAR = 70; // keep patches this close even outside the view (shadow casters)
// Range stretch per level: coarse levels reach further so distant ridgelines keep ~8 to 12 px
// per vertex. Each level still contains its nodes (range[L] + node diagonal < range[L+1]).
const RANGE_BOOST = [1, 1, 1.15, 1.3, 1.6, 1.8, 1.8, 1.8];
export const lodRange = (r0, L) => r0 * 2 ** L * RANGE_BOOST[L];

function heightTexture(data, n) {
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
function rgbaTexture(data, n, mips) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = !!mips;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Patch: (PATCH+1)^2 grid vertices (index in x/z, y = 0) plus a skirt ring (y = -1).
function patchGeometry() {
  const n = PATCH + 1;
  const pos = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push(i, 0, j);
  const idx = [];
  const v = (i, j) => j * n + i;
  for (let j = 0; j < PATCH; j++) {
    for (let i = 0; i < PATCH; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
      idx.push(a, c, b, b, c, d); // diagonal (i+1, j) to (i, j+1), like World.terrainAt
    }
  }
  const skirt = (i, j) => { pos.push(i, -1, j); return pos.length / 3 - 1; };
  const sN = [], sS = [], sW = [], sE = [];
  for (let k = 0; k < n; k++) { sN.push(skirt(k, 0)); sS.push(skirt(k, PATCH)); sW.push(skirt(0, k)); sE.push(skirt(PATCH, k)); }
  for (let k = 0; k < PATCH; k++) {
    idx.push(v(k, 0), v(k + 1, 0), sN[k], v(k + 1, 0), sN[k + 1], sN[k]);
    idx.push(v(k, PATCH), sS[k], v(k + 1, PATCH), v(k + 1, PATCH), sS[k], sS[k + 1]);
    idx.push(v(0, k), sW[k], v(0, k + 1), v(0, k + 1), sW[k], sW[k + 1]);
    idx.push(v(PATCH, k), v(PATCH, k + 1), sE[k], v(PATCH, k + 1), sE[k + 1], sE[k]);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// Min/max height pyramid over the quadtree (base cells = one L0 patch, 50 m).
function buildMinMax(world) {
  const N0 = (ROOT_HALF * 2) / 50;
  const levels = [];
  const mn = new Float32Array(N0 * N0), mx = new Float32Array(N0 * N0);
  const g = world.grid, r = world.res, nh = world.half, nc = world.cell;
  const f = world.far;
  const near32 = Math.abs(50 / nc - Math.round(50 / nc)) < 1e-6;
  for (let cj = 0; cj < N0; cj++) {
    const z0 = -ROOT_HALF + cj * 50;
    for (let ci = 0; ci < N0; ci++) {
      const x0 = -ROOT_HALF + ci * 50;
      let lo = Infinity, hi = -Infinity;
      if (near32 && x0 >= -nh && x0 + 50 <= nh && z0 >= -nh && z0 + 50 <= nh) {
        const i0 = Math.round((x0 + nh) / nc), j0 = Math.round((z0 + nh) / nc), s = Math.round(50 / nc);
        for (let j = j0; j <= j0 + s; j++) for (let i = i0; i <= i0 + s; i++) {
          const h = g[j * r + i];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      } else if (f) {
        const s = 50 / f.cell;
        const i0 = (x0 + f.half) / f.cell, j0 = (z0 + f.half) / f.cell;
        for (let j = Math.floor(j0) - 1; j <= Math.ceil(j0 + s) + 1; j++) {
          const jj = Math.min(f.res - 1, Math.max(0, j));
          for (let i = Math.floor(i0) - 1; i <= Math.ceil(i0 + s) + 1; i++) {
            const h = f.grid[jj * f.res + Math.min(f.res - 1, Math.max(0, i))];
            if (h < lo) lo = h;
            if (h > hi) hi = h;
          }
        }
      } else {
        lo = -20; hi = 1500;
      }
      mn[cj * N0 + ci] = lo - 1;
      mx[cj * N0 + ci] = hi + 1;
    }
  }
  levels.push({ n: N0, min: mn, max: mx });
  for (let n = N0 >> 1; n >= 1; n >>= 1) {
    const p = levels[levels.length - 1];
    const a = new Float32Array(n * n), b = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o0 = 2 * j * p.n + 2 * i, o1 = o0 + 1, o2 = o0 + p.n, o3 = o2 + 1;
      a[j * n + i] = Math.min(p.min[o0], p.min[o1], p.min[o2], p.min[o3]);
      b[j * n + i] = Math.max(p.max[o0], p.max[o1], p.max[o2], p.max[o3]);
    }
    levels.push({ n, min: a, max: b });
  }
  return levels;
}

// Fallback far grid when the worker job failed: coarse main-thread sampling.
function fallbackFar(world) {
  const res = 321, half = 4000, cell = (half * 2) / (res - 1);
  const grid = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -half + i * cell, z = -half + j * cell;
    grid[j * res + i] = Math.abs(x) <= world.half && Math.abs(z) <= world.half ? world.terrainAt(x, z) : computeHeight(x, z);
  }
  world.far = { grid, res, half, cell };
  return world.far;
}

class CDLOD {
  constructor(pyramid, baseCell, r0) {
    this.mm = pyramid;
    this.baseCell = baseCell;
    this.range = [];
    this.range2 = [];
    for (let L = 0; L < LEVELS; L++) {
      const rr = lodRange(r0, L);
      this.range.push(rr);
      this.range2.push(rr * rr);
    }
    this.data = new Float32Array(MAX_PATCHES * 4);
    this.dist = new Float32Array(MAX_PATCHES);
    this.order = new Uint16Array(MAX_PATCHES);
    this.sorted = new Float32Array(MAX_PATCHES * 4);
    this.count = 0;
    this.frustum = new THREE.Frustum();
    this.box = new THREE.Box3();
    this.cam = new THREE.Vector3();
    this.pv = new THREE.Matrix4();
    this.near = 0;
  }

  boxDist2(b) {
    const c = this.cam;
    const dx = Math.max(b.min.x - c.x, 0, c.x - b.max.x);
    const dy = Math.max(b.min.y - c.y, 0, c.y - b.max.y);
    const dz = Math.max(b.min.z - c.z, 0, c.z - b.max.z);
    return dx * dx + dy * dy + dz * dz;
  }

  addPatch(L, x0, z0, shadowOnly) {
    if (this.count >= MAX_PATCHES) return;
    const k = this.count++;
    const sp = this.baseCell * 2 ** L;
    const half = sp * PATCH * 0.5;
    this.data[k * 4] = x0;
    this.data[k * 4 + 1] = z0;
    this.data[k * 4 + 2] = sp;
    this.data[k * 4 + 3] = L + (shadowOnly ? 16 : 0);
    const dx = x0 + half - this.cam.x, dz = z0 + half - this.cam.z;
    this.dist[k] = (shadowOnly ? -1e9 : 0) + dx * dx + dz * dz;
  }

  // CDLOD selection. Nodes outside the view but within KEEP_NEAR are kept as shadow-only
  // patches (the color pass collapses them in the vertex shader).
  node(L, ci, cj, parentVis) {
    const size = 100 * 2 ** L;
    const x0 = -ROOT_HALF + ci * size, z0 = -ROOT_HALF + cj * size;
    if (x0 >= DATA_HALF || x0 + size <= -DATA_HALF || z0 >= DATA_HALF || z0 + size <= -DATA_HALF) { this.retKeep = false; return false; }
    const lv = this.mm[L + 1];
    const o = cj * lv.n + ci;
    const b = this.box;
    b.min.set(x0, lv.min[o], z0);
    b.max.set(x0 + size, lv.max[o], z0 + size);
    const d2 = this.boxDist2(b);
    const vis = parentVis && this.frustum.intersectsBox(b);
    const keep = vis || d2 <= KEEP_NEAR * KEEP_NEAR;
    this.retKeep = keep;
    this.retVis = vis;
    if (d2 > this.range2[L]) return false;
    if (!keep) return true;
    const hs = size / 2;
    if (L === 0 || d2 > this.range2[L - 1]) {
      this.addPatch(L, x0, z0, !vis); this.addPatch(L, x0 + hs, z0, !vis);
      this.addPatch(L, x0, z0 + hs, !vis); this.addPatch(L, x0 + hs, z0 + hs, !vis);
      return true;
    }
    for (let q = 0; q < 4; q++) {
      const cx = ci * 2 + (q & 1), cz = cj * 2 + (q >> 1);
      if (!this.node(L - 1, cx, cz, vis) && this.retKeep) this.addPatch(L, -ROOT_HALF + cx * hs, -ROOT_HALF + cz * hs, !this.retVis);
    }
    return true;
  }

  // Returns the patch count. Order: shadow-only patches, then visible ones front to back.
  // `this.near` = length of the prefix within `shadowR` meters, all the shadow map needs.
  select(camera, shadowR = 250) {
    camera.updateMatrixWorld();
    this.cam.setFromMatrixPosition(camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.count = 0;
    this.node(LEVELS - 1, 0, 0, true);
    const n = this.count;
    for (let i = 0; i < n; i++) this.order[i] = i;
    const ord = this.order.subarray(0, n), dist = this.dist;
    ord.sort((a, b) => dist[a] - dist[b]);
    const sr2 = shadowR * shadowR;
    this.near = 0;
    for (let i = 0; i < n; i++) {
      const s = ord[i] * 4;
      if (dist[ord[i]] < sr2) this.near = i + 1;
      this.sorted[i * 4] = this.data[s];
      this.sorted[i * 4 + 1] = this.data[s + 1];
      this.sorted[i * 4 + 2] = this.data[s + 2];
      this.sorted[i * 4 + 3] = this.data[s + 3];
    }
    return n;
  }
}

export async function init(G) {
  const t0 = performance.now();
  const W = G.world;
  let far = await W.farReady;
  const tWait = performance.now() - t0;
  const t1 = performance.now();
  if (!far) far = fallbackFar(W);
  const mask = W.mask || new Uint8Array(W.res * W.res * 4).fill(255);
  if (!W.mask) for (let i = 0; i < W.res * W.res; i++) { mask[i * 4] = 255; mask[i * 4 + 1] = 0; mask[i * 4 + 2] = 255; mask[i * 4 + 3] = 255; }

  const nearCellsPerMeter = 1 / W.cell;
  const [nn, fn] = await Promise.all([W.normals.near, W.normals.far]);
  const t2 = performance.now();
  const textures = {
    nearH: heightTexture(W.grid, W.res),
    farH: heightTexture(far.grid, far.res),
    nearN: rgbaTexture(nn || normalData(W.grid, W.res, W.cell, Math.max(1, Math.round(4.5 * nearCellsPerMeter)), Math.max(2, Math.round(19 * nearCellsPerMeter))), W.res, true),
    farN: rgbaTexture((fn && fn.length === far.res * far.res * 4) ? fn : normalData(far.grid, far.res, far.cell, 1, 4), far.res, true),
    mask: rgbaTexture(mask, W.res, false),
    near: { half: W.half, res: W.res, cell: W.cell },
    far: { half: far.half, res: far.res, cell: far.cell },
  };
  const uniforms = terrainUniforms(textures);
  const nz = noiseTextures();
  uniforms.uMzNoise = { value: nz.smooth };
  uniforms.uMzWhite = { value: nz.white };
  const q = G.quality;
  const r0 = q === 'high' ? 140 : q === 'medium' ? 115 : 90;
  uniforms.uMzMorph = { value: [] };
  for (let L = 0; L < LEVELS; L++) {
    const end = lodRange(r0, L), start = Math.max(end * 0.72, L ? lodRange(r0, L - 1) * 1.05 : 0);
    uniforms.uMzMorph.value.push(new THREE.Vector2(start, 1 / (end - start)));
  }
  uniforms.uMzLodCam = { value: new THREE.Vector3() };

  const { material, depthMaterial } = createTerrainMaterials(G, uniforms);
  const geo = patchGeometry();
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PATCHES * 4), 4);
  inst.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPatch', inst);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = q !== 'low';
  mesh.customDepthMaterial = depthMaterial;
  mesh.renderOrder = -10;
  G.scene.add(mesh);

  const lod = new CDLOD(buildMinMax(W), W.cell, r0);
  const trisPerPatch = PATCH * PATCH * 2;
  const stats = { patches: 0, triangles: 0, buildMs: 0, waitMs: tWait, gridMs: W.buildMs };

  // Shadow pass: only the nearest patches (first in the front-to-back order) can land in the
  // sun's shadow frustum, so draw just those there.
  let shadowCount = 0, mainCount = 0;
  mesh.onBeforeShadow = () => { geo.instanceCount = shadowCount; };
  mesh.onBeforeRender = () => { geo.instanceCount = mainCount; };
  const shadowReach = () => {
    const sc = G.atmosphere?.sun?.shadow?.camera;
    if (!sc) return 250;
    return Math.max(Math.abs(sc.left), Math.abs(sc.right), Math.abs(sc.top), Math.abs(sc.bottom)) * 1.6 + 60;
  };
  const update = () => {
    const n = lod.select(G.camera, shadowReach());
    mainCount = n;
    shadowCount = lod.near;
    inst.array.set(lod.sorted.subarray(0, n * 4));
    inst.clearUpdateRanges();
    inst.addUpdateRange(0, n * 4);
    inst.needsUpdate = true;
    geo.instanceCount = n;
    uniforms.uMzLodCam.value.copy(lod.cam);
    stats.patches = n;
    stats.shadowPatches = lod.near;
    let vis = 0;
    for (let i = 0; i < n; i++) if (lod.sorted[i * 4 + 3] < 16) vis++;
    stats.triangles = vis * trisPerPatch;
  };
  update();
  // Before the camera-dependent passes, after any camera mover (rig 80, atmosphere 90).
  G.addSystem('terrain', update, 99);

  stats.buildMs = performance.now() - t2;
  stats.normalsWaitMs = t2 - t1;
  G.terrain = {
    mesh, material, depthMaterial, uniforms, textures, stats,
    glsl: TERRAIN_SAMPLE_GLSL,
    lod,
    setRoadMask() {},
  };
}
