// Kit: the per-building scratch pad. Holds one MB per material, the metadata arrays that end up
// in the builder result (colliders, doors, anchors, lights, walk surfaces), and a seeded random
// source plus a smooth value noise. kit.finish() turns the MBs into meshes (one per material).
//
// Result shape (see docs/ARCHITECTURE.md "Architecture kit"):
//   { group, colliders, doors, anchors, lights, interior, walk, objects, footprint, stats }
// Colliders are local boxes {type:'box', x, z, hw, hd, yaw, y0?, y1?} / circles {type:'circle', x, z, r}.
import * as THREE from 'three';
import { rng } from '../../core/util.js';
import { MB, C, scaleC, mixC } from './mb.js';
import { getMaterials, CASTS } from './materials.js';

const _fm = new THREE.Matrix4();
const _fq = new THREE.Quaternion();
const _fe = new THREE.Euler();
const _fp = new THREE.Vector3();
const _fs = new THREE.Vector3(1, 1, 1);

// Seeded 2D value noise, cheap and allocation free. Returns 0..1.
export function makeValueNoise(seed) {
  const r = rng(seed >>> 0);
  const N = 64;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N, y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = g[y0 * N + x0], b = g[y0 * N + x1], c = g[y1 * N + x0], d = g[y1 * N + x1];
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

// Multiplier applied to hex wood tones so the vertex color reads as the intended final tone
// after being multiplied with the (mean ~0.8) texture.
export const GAIN = 0.95;
export const wc = (hex, k = 1) => scaleC(hex, GAIN * k);

// Shared palette (DESIGN 5.1). Hex values are final-look targets.
export const PAL = {
  logDark: 0x332c27, logMid: 0x544c45, logWeathered: 0x5e5650, logSilver: 0x847f78, logNew: 0x7c6446,
  plank: 0x645b52, plankDark: 0x3c352f,
  shingle: 0x6e6256, shingleDark: 0x3d342d,
  stone: 0x8c8a85, stoneDark: 0x5c5a58, stoneWarm: 0x9a9084,
  blue: 0x3e5a78, blueFaded: 0x5a748c, red: 0x9a2e22, redFaded: 0x8a4a3a, ochre: 0xb08a4a, cream: 0xc2b498,
  iron: 0x2a2a2c, bronze: 0x9a7a3a, straw: 0xb4a474, moss: 0x5d6b3a,
  snow: 0xf4f6fa, snowBlue: 0xdfe8f5, ice: 0xb9d6e6, iceDeep: 0x6f9fb8,
  ember: 0xffa040,
};

// Move all geometry of `from` into `to` (same attribute layout; base is copied when both have it).
function appendMB(to, from) {
  if (from.empty) return;
  const off = to.p.length / 3;
  for (let i = 0; i < from.p.length; i++) { to.p.push(from.p[i]); to.n.push(from.n[i]); to.c.push(from.c[i]); }
  for (let i = 0; i < from.t.length; i++) to.t.push(from.t[i]);
  for (let i = 0; i < from.i.length; i++) to.i.push(from.i[i] + off);
  if (to.b) {
    if (from.b) for (let i = 0; i < from.b.length; i++) to.b.push(from.b[i]);
    else for (let i = 0; i < from.p.length; i++) to.b.push(from.p[i]);
  }
  from.p = []; from.n = []; from.t = []; from.c = []; from.i = []; if (from.b) from.b = [];
}

export class Kit {
  constructor(seed = 1, name = 'building') {
    this.seed = seed >>> 0;
    this.name = name;
    this.rand = rng(this.seed ^ 0x9e3779b1);
    this.n2 = makeValueNoise(this.seed * 2654435761 + 17);
    this.mats = getMaterials();
    // Darken things that touch the ground (dirt, wet wood), a cheap contact shadow.
    const groundShade = (x, y) => (y > 0.7 ? 1 : y < -0.05 ? 0.6 : 0.6 + 0.4 * ((y + 0.05) / 0.75));
    this._wood = new MB('wood', { uv: [1, 3], shade: groundShade });
    this._woodIn = new MB('woodIn', { uv: [1, 3] });
    this._stone = new MB('stone', { uv: [2, 2], shade: groundShade });
    this._stoneIn = new MB('stoneIn', { uv: [2, 2] });
    this.wood = this._wood;
    this.stone = this._stone;
    this._rock = new MB('rock', { uv: [3, 3], shade: groundShade });
    this._rockIn = new MB('rockIn', { uv: [3, 3] });
    this.rock = this._rock;
    this.shingle = new MB('shingle', { uv: [1.2, 1.2] });
    this.straw = new MB('straw', { uv: [1.5, 1.5] });
    this.snow = new MB('snow', { base: true, uv: [2, 2] });
    this.ice = new MB('ice', { base: true, uv: [2, 2] });
    this.glow = new MB('glow');
    this.ember = new MB('ember');
    this.metal = new MB('metal', { uv: [1, 1] });
    this.cloth = new MB('cloth', { uv: [1, 1] });
    this.colliders = [];
    this.doors = [];
    this.anchors = {};
    this.lights = [];
    this.walk = { floors: [], ramps: [] };
    this.objects = {};
    this.extra = []; // extra Object3D children (door leaves, wheels) added to the group
    this.interior = false;
    this.footprint = null; // {hw, hd} local half extents for foundations and snow skirts
    this.skirtExclude = []; // local boxes {x, z, hw, hd, yaw} where place.js keeps the snow skirt away
    this.skirt = true; // place.js banks a snow skirt along the walls unless this is false
    this.noFoundation = false; // true for stilted / free-standing structures
    this.mergeIce = true; // icicles share the snow draw call unless a building wants glossy ice
    this.mergeMetal = true; // iron bits share the wood draw call unless a building wants real metal
  }

  // Seeded helpers.
  r(lo = 0, hi = 1) { return lo + (hi - lo) * this.rand(); }
  rs() { return (this.rand() - 0.5) * 2; } // -1..1
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  chance(p) { return this.rand() < p; }

  get mbs() {
    return [this._wood, this._woodIn, this.shingle, this._stone, this._stoneIn, this._rock, this._rockIn, this.straw, this.snow, this.ice, this.glow, this.ember, this.metal, this.cloth];
  }

  // Record current vertex counts of every builder, so shear() can bend only what was added since.
  mark() { return this.mbs.map((mb) => mb.count); }

  // Lean everything added since mark(): above y0, x and z shift linearly (plus a touch of bow) so the
  // base stays put and the top leans. Cheap way to give towers and huts a crooked, aged stance.
  shear(marks, y0, kx, kz, bow = 0.0) {
    this.mbs.forEach((mb, k) => {
      const from = marks[k];
      const n = mb.count;
      for (let i = from; i < n; i++) {
        const dy = mb.p[i * 3 + 1] - y0;
        if (dy <= 0) continue;
        const f = dy * (1 + bow * dy);
        mb.p[i * 3] += kx * f; mb.p[i * 3 + 2] += kz * f;
        if (mb.b) {
          const dyb = mb.b[i * 3 + 1] - y0;
          if (dyb > 0) { const fb = dyb * (1 + bow * dyb); mb.b[i * 3] += kx * fb; mb.b[i * 3 + 2] += kz * fb; }
        }
      }
    });
  }

  // Switch wood / stone to the interior twins (no snow dusting on floors and furniture) and back.
  indoor(on) {
    this.wood = on ? this._woodIn : this._wood;
    this.stone = on ? this._stoneIn : this._stone;
    this.rock = on ? this._rockIn : this._rock;
  }

  // Run fn with wood / stone pointing at the interior twins.
  indoors(fn) {
    const w = this.wood, s = this.stone, r = this.rock;
    this.indoor(true);
    try { fn(this); } finally { this.wood = w; this.stone = s; this.rock = r; }
  }

  // Run fn inside a translated / rotated frame applied to every material builder at once
  // (euler order YXZ, like three.js rotation.y with optional pitch / roll).
  frame(x, y, z, ry, fn, rx = 0, rz = 0) {
    _fe.set(rx, ry, rz, 'YXZ');
    _fq.setFromEuler(_fe);
    _fm.compose(_fp.set(x, y, z), _fq, _fs);
    const mbs = this.mbs;
    for (const mb of mbs) { mb.save(); mb.apply(_fm); }
    fn(this);
    for (const mb of mbs) mb.restore();
  }

  // ----- metadata helpers -----
  box(x, z, hw, hd, yaw = 0, o = {}) { this.colliders.push({ type: 'box', x, z, hw, hd, yaw, ...o }); }
  circle(x, z, r, o = {}) { this.colliders.push({ type: 'circle', x, z, r, ...o }); }
  anchor(name, x, y, z) { this.anchors[name] = new THREE.Vector3(x, y, z); return this.anchors[name]; }
  light(x, y, z, o = {}) {
    this.lights.push({ x, y, z, color: o.color ?? 0xffb060, intensity: o.intensity ?? 1, radius: o.radius ?? 8, kind: o.kind ?? 'window', ...(o.dir ? { dir: o.dir } : {}) });
  }
  door(d) { this.doors.push(d); }

  // ----- output -----
  stats() {
    let tris = 0, calls = 0;
    for (const mb of this.mbs) {
      if (!mb.empty) { calls++; tris += mb.i.length / 3; }
    }
    for (const o of this.extra) o.traverse((c) => { if (c.isMesh) { calls++; tris += c.geometry.index.count / 3; } });
    return { calls, triangles: tris };
  }

  // Build meshes into a Group. `extraMeshes` such as door leaves are appended as-is.
  finish(extra = {}) {
    if (this.mergeIce) appendMB(this.snow, this.ice);
    if (this.mergeMetal) appendMB(this._wood, this.metal);
    const group = new THREE.Group();
    group.name = this.name;
    const parts = { wood: this._wood, woodIn: this._woodIn, shingle: this.shingle, stone: this._stone, stoneIn: this._stoneIn, rock: this._rock, rockIn: this._rockIn, straw: this.straw, snow: this.snow, ice: this.ice, glow: this.glow, ember: this.ember, metal: this.metal, cloth: this.cloth };
    for (const key of Object.keys(parts)) {
      const geo = parts[key].build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.mats[key]);
      mesh.name = `${this.name}:${key}`;
      mesh.castShadow = CASTS[key];
      mesh.receiveShadow = key !== 'ember' && key !== 'glow';
      group.add(mesh);
    }
    for (const o of this.extra) group.add(o);
    const res = {
      group,
      colliders: this.colliders,
      doors: this.doors,
      anchors: this.anchors,
      lights: this.lights,
      interior: this.interior,
      walk: this.walk,
      objects: this.objects,
      footprint: this.footprint,
      skirtExclude: this.skirtExclude,
      skirt: this.skirt,
      noFoundation: this.noFoundation,
      stats: this.stats(),
      ...extra,
    };
    return res;
  }
}

export { C, mixC, scaleC };
