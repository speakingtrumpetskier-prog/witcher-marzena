// VegLayer: chunked instance storage and per-frame LOD selection for vegetation kinds.
// Owner: vegetation builder.
//
// All instances live in chunk typed arrays (sorted by kind inside a chunk). Each rebuild (when the
// camera moved or turned enough) walks the chunks near the camera, tests every candidate instance
// against the view frustum, picks LOD meshes by distance and writes the instance matrices into a
// few big shared InstancedMesh buffers: one per (kind, lod, part). Draw calls therefore scale with
// the number of kinds, not with the number of chunks. Neighbouring LODs overlap in a distance band
// and fade into each other with a screen-door dither in the shader (materials.js), so nothing pops.
import * as THREE from 'three';
import { setLod } from './materials.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

// LOD distance table per kind group at quality scale 1. ends[i] is where LOD i hands over to LOD
// i + 1 (centre of the fade band), bands[i] its half width. The last LOD of a kind without an
// impostor fades out over `fadeOut` meters ending at ends[last].
const GROUPS = {
  tree: { ends: [32, 105, 300], bands: [7, 18, 36] },
  bush: { ends: [30, 120], bands: [8, 0], fadeOut: 30 },
  deadwood: { ends: [38, 115], bands: [8, 0], fadeOut: 28 },
  ground: { ends: [20, 58], bands: [5, 0], fadeOut: 16 },
  reed: { ends: [48, 200], bands: [10, 0], fadeOut: 40 },
};

export function composeMatrix(out, o, x, y, z, yaw, sx, sy, tiltX = 0, tiltZ = 0) {
  _p.set(x, y, z);
  _e.set(tiltX, yaw, tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(sx, sy, sx);
  _m.compose(_p, _q, _s);
  const a = _m.elements;
  for (let i = 0; i < 16; i++) out[o + i] = a[i];
}

export class VegLayer {
  // opts: name, chunkSize, quality ('low' | 'medium' | 'high'), shadowLods
  constructor(G, kinds, opts = {}) {
    this.G = G;
    this.kinds = kinds;
    this.name = opts.name || 'veg';
    this.chunkSize = opts.chunkSize || 64;
    this.chunks = new Map();
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = `vegetation-${this.name}`;
    this.quality = opts.quality || 'high';
    this.qs = { low: 0.62, medium: 0.82, high: 1 }[this.quality] || 1;
    this.shadowLods = this.quality === 'low' ? 0 : this.quality === 'medium' ? 1 : 2;
    this.circle = opts.circle ?? 18; // all-around radius kept in LOD 0 for shadows
    this.hasImpostorsFor = opts.hasImpostor ?? ((k) => k.impostor);
    this.nKinds = kinds.length;
    this.dirty = true;
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.lastT = 0;
    this.planes = new Float32Array(24);
    this.stats = { instances: 0, chunks: 0 };
    this.onClear = null;
    this.kindCount = new Int32Array(kinds.length);
    this.cfg = kinds.map((k) => this._cfg(k));
    this.meshes = null; // built by finalize()
    this.circleR = this.circle * this.qs;
  }

  _cfg(k) {
    const g = GROUPS[k.group] || GROUPS.tree;
    const L = k.lodCount;
    const qs = this.qs;
    const ends = [], bands = [];
    for (let i = 0; i < L; i++) {
      ends.push(g.ends[Math.min(i, g.ends.length - 1)] * qs);
      bands.push(g.bands[Math.min(i, g.bands.length - 1)] * qs);
    }
    const imp = this.hasImpostorsFor(k);
    const lods = [];
    for (let i = 0; i < L; i++) {
      const last = i === L - 1;
      const lo = i === 0 ? null : [ends[i - 1] - bands[i - 1], ends[i - 1] + bands[i - 1]];
      let hi, dmax;
      if (!last || imp) { hi = [ends[i] - bands[i], ends[i] + bands[i]]; dmax = ends[i] + bands[i]; } else { hi = [ends[i] - (g.fadeOut || 20) * qs, ends[i]]; dmax = ends[i]; }
      lods.push({ lo, hi, dmin: lo ? lo[0] : 0, dmax });
    }
    return { lods, ends, bands, imp, maxD: lods[L - 1].dmax };
  }

  // Add instances. Each: { k, x, y, z, yaw, sx, sy, r, g, b, tx, tz, collider? }. Returns nothing.
  // Instances are grouped by chunk and kind; call finalize() once after the first batch.
  addInstances(list) {
    const cs = this.chunkSize;
    const byChunk = new Map();
    for (const it of list) {
      const key = `${Math.floor(it.x / cs)},${Math.floor(it.z / cs)}`;
      let c = byChunk.get(key);
      if (!c) byChunk.set(key, (c = []));
      c.push(it);
    }
    for (const [key, items] of byChunk) {
      const [cx, cz] = key.split(',').map(Number);
      items.sort((a, b) => a.k - b.k);
      const n = items.length;
      const ch = {
        key, cx, cz, n,
        x0: cx * cs, z0: cz * cs, cenX: (cx + 0.5) * cs, cenZ: (cz + 0.5) * cs, rad: cs * 0.7072,
        m: new Float32Array(n * 16), col: new Float32Array(n * 3), cy: new Float32Array(n), cr: new Float32Array(n),
        kind: new Uint8Array(n), alive: new Uint8Array(n).fill(1), view: new Uint8Array(n),
        sx: new Float32Array(n), sy: new Float32Array(n), collider: new Int32Array(n).fill(-1), runs: [],
        maxR: 0, ymin: 1e9, ymax: -1e9,
      };
      let runK = -1, runS = 0;
      items.forEach((it, i) => {
        const kind = this.kinds[it.k];
        composeMatrix(ch.m, i * 16, it.x, it.y, it.z, it.yaw || 0, it.sx, it.sy, it.tx || 0, it.tz || 0);
        ch.col[i * 3] = it.r; ch.col[i * 3 + 1] = it.g; ch.col[i * 3 + 2] = it.b;
        const h = kind.height * it.sy;
        ch.cy[i] = it.y + h * 0.5;
        ch.cr[i] = Math.max(kind.radius * it.sx, h * 0.5) * 1.05;
        ch.maxR = Math.max(ch.maxR, ch.cr[i]);
        ch.ymin = Math.min(ch.ymin, it.y);
        ch.ymax = Math.max(ch.ymax, it.y + h);
        ch.kind[i] = it.k;
        ch.view[i] = it.view || 0;
        ch.sx[i] = it.sx; ch.sy[i] = it.sy;
        if (it.collider !== undefined) ch.collider[i] = it.collider;
        this.kindCount[it.k]++;
        if (it.k !== runK) {
          if (runK >= 0) ch.runs.push({ k: runK, s: runS, e: i });
          runK = it.k; runS = i;
        }
      });
      if (runK >= 0) ch.runs.push({ k: runK, s: runS, e: n });
      ch.cenY = (ch.ymin + ch.ymax) * 0.5;
      ch.sph = Math.hypot(cs * 0.7072, (ch.ymax - ch.ymin) * 0.5) + ch.maxR;
      this.chunks.set(key, ch);
    }
    this.list = [...this.chunks.values()];
    this.dirty = true;
  }

  // Create the instanced meshes (call after all kinds have final counts).
  finalize(counts = null) {
    this.meshes = [];
    const capFor = (k, lod, total) => {
      const base = k.group === 'tree' ? [1100, 2600, 7000] : k.group === 'ground' ? [7000, 9000] : [3500, 6000, 6000];
      return Math.max(16, Math.min(total, base[Math.min(lod, base.length - 1)]));
    };
    this.kinds.forEach((k, ki) => {
      const total = counts ? counts[ki] : this.kindCount[ki];
      const entry = { lods: [], count: new Int32Array(k.lodCount) };
      if (total === 0 && !counts) { this.meshes.push(null); return; }
      for (let l = 0; l < k.lodCount; l++) {
        const cap = capFor(k, l, Math.max(total, 1));
        const mat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        mat.setUsage(THREE.DynamicDrawUsage);
        const col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        col.setUsage(THREE.DynamicDrawUsage);
        const parts = k.lods[l].parts.map((p) => {
          const mesh = new THREE.InstancedMesh(p.geometry, p.material, cap);
          mesh.instanceMatrix = mat;
          mesh.instanceColor = col;
          mesh.frustumCulled = false;
          mesh.count = 0;
          mesh.visible = false;
          const maxShadowLod = k.group === 'tree' ? 2 : (k.group === 'bush' || k.group === 'deadwood') ? 1 : 0;
          mesh.castShadow = !p.noShadow && l < Math.min(this.shadowLods, maxShadowLod);
          mesh.receiveShadow = l < 2 && this.quality !== 'low';
          if (mesh.castShadow) mesh.customDepthMaterial = p.depth;
          mesh.name = `${k.id}.lod${l}`;
          mesh.userData.leaves = p.leaves;
          this.group.add(mesh);
          return mesh;
        });
        entry.lods.push({ mat, col, parts, cap, n: 0 });
      }
      this.meshes.push(entry);
    });
    this.applyLodUniforms();
    this.dirty = true;
  }

  applyLodUniforms() {
    this.kinds.forEach((k, ki) => {
      const c = this.cfg[ki];
      for (let l = 0; l < k.lodCount; l++) {
        const lod = c.lods[l];
        setLod(k.lodU[l], lod.lo ? lod.lo[0] : null, lod.lo ? lod.lo[1] : null, lod.hi[0], lod.hi[1]);
      }
    });
  }

  _frustum(camera) {
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = _m.elements;
    const P = this.planes;
    // Gribb-Hartmann plane extraction (left, right, bottom, top, near, far), normalised
    const set = (i, a, b, c, d) => {
      const l = Math.hypot(a, b, c) || 1;
      P[i * 4] = a / l; P[i * 4 + 1] = b / l; P[i * 4 + 2] = c / l; P[i * 4 + 3] = d / l;
    };
    set(0, e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);
    set(1, e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]);
    set(2, e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]);
    set(3, e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);
    set(4, e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);
    set(5, e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]);
  }

  _inFrustum(x, y, z, r) {
    const P = this.planes;
    for (let i = 0; i < 6; i++) {
      if (P[i * 4] * x + P[i * 4 + 1] * y + P[i * 4 + 2] * z + P[i * 4 + 3] < -r) return false;
    }
    return true;
  }

  // Rebuild the instance buffers when the camera moved or turned. force = always.
  update(camera, now, force = false) {
    if (!this.meshes) return;
    const cp = camera.position;
    const dir = _p;
    camera.getWorldDirection(dir);
    const moved = cp.distanceToSquared(this.lastCam) > 1.0;
    const turned = dir.dot(this.lastDir) < 0.9998;
    if (!force && !this.dirty && !moved && !turned && now - this.lastT < 0.6) return;
    this.dirty = false;
    this.lastCam.copy(cp);
    this.lastDir.copy(dir);
    this.lastT = now;
    this._frustum(camera);

    const meshes = this.meshes;
    for (const e of meshes) if (e) for (const l of e.lods) l.n = 0;

    const cx = cp.x, cy = cp.y, cz = cp.z;
    const maxAll = this.maxRange ?? (this.maxRange = Math.max(...this.cfg.map((c) => c.maxD)));
    const circleR = this.circleR;
    let total = 0;
    for (const ch of this.list) {
      const dx = ch.cenX - cx, dz = ch.cenZ - cz;
      const dc = Math.hypot(dx, dz);
      const rr = ch.rad + ch.maxR;
      if (dc - rr > maxAll) continue;
      const nearCircle = dc - rr < circleR;
      if (!nearCircle && !this._inFrustum(ch.cenX, ch.cenY, ch.cenZ, ch.sph + 3)) continue;
      for (const run of ch.runs) {
        const k = this.kinds[run.k];
        const cfg = this.cfg[run.k];
        const ent = meshes[run.k];
        if (!ent) continue;
        if (dc - rr > cfg.maxD) continue;
        const m = ch.m;
        for (let i = run.s; i < run.e; i++) {
          if (!ch.alive[i]) continue;
          const o = i * 16;
          const x = m[o + 12], y = m[o + 13], z = m[o + 14];
          const ddx = x - cx, ddy = y - cy, ddz = z - cz;
          const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          if (d > cfg.maxD) continue;
          const vis = this._inFrustum(x, ch.cy[i], z, ch.cr[i] + 3);
          for (let l = 0; l < k.lodCount; l++) {
            const lod = cfg.lods[l];
            if (d < lod.dmin - 1 || d > lod.dmax + 1) continue;
            if (!vis && !(l === 0 && d < circleR)) continue;
            const slot = ent.lods[l];
            if (slot.n >= slot.cap) continue;
            const dst = slot.n * 16, arr = slot.mat.array;
            for (let j = 0; j < 16; j++) arr[dst + j] = m[o + j];
            const c3 = i * 3;
            slot.col.array[slot.n * 3] = ch.col[c3];
            slot.col.array[slot.n * 3 + 1] = ch.col[c3 + 1];
            slot.col.array[slot.n * 3 + 2] = ch.col[c3 + 2];
            slot.n++;
            total++;
          }
        }
      }
    }
    const spring = this.G.uniforms.uSpring.value > 0.02;
    for (const e of meshes) {
      if (!e) continue;
      for (const l of e.lods) {
        l.mat.clearUpdateRanges();
        l.col.clearUpdateRanges();
        if (l.n > 0) {
          l.mat.addUpdateRange(0, l.n * 16);
          l.col.addUpdateRange(0, l.n * 3);
          l.mat.needsUpdate = true;
          l.col.needsUpdate = true;
        }
        for (const mesh of l.parts) {
          mesh.count = l.n;
          mesh.visible = l.n > 0 && (!mesh.userData.leaves || spring);
        }
      }
    }
    this.stats.visible = total;
  }

  // Spring toggles visibility of leaf parts without a full rebuild.
  syncLeaves() {
    if (!this.meshes) return;
    const spring = this.G.uniforms.uSpring.value > 0.02;
    for (const e of this.meshes) {
      if (!e) continue;
      for (const l of e.lods) for (const mesh of l.parts) if (mesh.userData.leaves) mesh.visible = l.n > 0 && spring;
    }
  }

  // ---- queries and edits -------------------------------------------------------------------

  // Hide every instance whose trunk (or, for trees, the inner part of the crown) lies in the circle.
  // Returns the number of hidden instances.
  clearArea(x, z, r) {
    return this.clearIf(x - r, z - r, x + r, z + r, (kind, px, pz, sx) => {
      const margin = kind.group === 'tree' ? Math.max(kind.trunkR, kind.radius * sx * 0.3) : Math.min(1.5, kind.radius * sx * 0.5);
      return Math.hypot(px - x, pz - z) < r + margin;
    });
  }

  // Hide instances inside the bounding box for which pred(kind, x, z, scaleX) is true.
  clearIf(minX, minZ, maxX, maxZ, pred) {
    const cs = this.chunkSize;
    let hidden = 0;
    for (let ix = Math.floor((minX - 12) / cs); ix <= Math.floor((maxX + 12) / cs); ix++) {
      for (let iz = Math.floor((minZ - 12) / cs); iz <= Math.floor((maxZ + 12) / cs); iz++) {
        const ch = this.chunks.get(`${ix},${iz}`);
        if (!ch) continue;
        for (let i = 0; i < ch.n; i++) {
          if (!ch.alive[i]) continue;
          const kind = this.kinds[ch.kind[i]];
          const px = ch.m[i * 16 + 12], pz = ch.m[i * 16 + 14];
          if (pred(kind, px, pz, ch.sx[i])) {
            ch.alive[i] = 0;
            hidden++;
            if (ch.collider[i] >= 0) { this.onClear?.(ch.collider[i]); ch.collider[i] = -1; }
            ch.m.fill(0, i * 16, i * 16 + 16);
          }
        }
      }
    }
    if (hidden) this.dirty = true;
    return hidden;
  }

  // First live instance with a trunk within r of (x, z), or null. Only kinds with trunkR > 0.
  treeAt(x, z, r = 0) {
    const cs = this.chunkSize;
    const reach = r + 4;
    for (let ix = Math.floor((x - reach) / cs); ix <= Math.floor((x + reach) / cs); ix++) {
      for (let iz = Math.floor((z - reach) / cs); iz <= Math.floor((z + reach) / cs); iz++) {
        const ch = this.chunks.get(`${ix},${iz}`);
        if (!ch) continue;
        for (let i = 0; i < ch.n; i++) {
          if (!ch.alive[i]) continue;
          const kind = this.kinds[ch.kind[i]];
          if (!(kind.trunkR > 0)) continue;
          const px = ch.m[i * 16 + 12], pz = ch.m[i * 16 + 14];
          const tr = kind.trunkR * ch.sx[i];
          if (Math.hypot(px - x, pz - z) < r + tr) return { kind: kind.id, species: kind.species, x: px, z: pz, r: tr };
        }
      }
    }
    return null;
  }

  // Visit every live instance (for rebuilding the impostor buffer).
  forEachAlive(fn) {
    for (const ch of this.list) {
      for (let i = 0; i < ch.n; i++) {
        if (!ch.alive[i]) continue;
        const o = i * 16;
        fn(this.kinds[ch.kind[i]], ch.m[o + 12], ch.m[o + 13], ch.m[o + 14], ch.sx[i], ch.sy[i], ch.col[i * 3], ch.col[i * 3 + 1], ch.col[i * 3 + 2], ch.view[i]);
      }
    }
  }

  // Dynamic chunk sets (streamed ground cover): remove a chunk by key.
  removeChunk(key) {
    if (this.chunks.delete(key)) {
      this.list = [...this.chunks.values()];
      this.dirty = true;
    }
  }

  dispose() {
    for (const e of this.meshes || []) {
      if (!e) continue;
      for (const l of e.lods) for (const m of l.parts) { this.group.remove(m); m.dispose?.(); }
    }
  }
}
