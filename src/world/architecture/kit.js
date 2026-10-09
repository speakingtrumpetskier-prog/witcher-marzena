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
export const GAIN = 1.28;
export const wc = (hex, k = 1) => scaleC(hex, GAIN * k);

// Shared palette (DESIGN 5.1). Hex values are final-look targets.
export const PAL = {
  logDark: 0x372d26, logMid: 0x5a4e43, logWeathered: 0x645a50, logSilver: 0x8a857b, logNew: 0x8a6a46,
  plank: 0x6c6054, plankDark: 0x40372f,
  shingle: 0x6e6256, shingleDark: 0x3d342d,
  stone: 0x8c8a85, stoneDark: 0x5c5a58, stoneWarm: 0x9a9084,
  blue: 0x3e5a78, blueFaded: 0x5a748c, red: 0x9a2e22, redFaded: 0x8a4a3a, ochre: 0xb08a4a, cream: 0xc2b498,
  iron: 0x2a2a2c, bronze: 0x9a7a3a, straw: 0xc8b070, moss: 0x5d6b3a,
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
    this.wood = new MB('wood', { uv: [1, 3], shade: groundShade });
    this.shingle = new MB('shingle', { uv: [1.2, 1.2] });
    this.stone = new MB('stone', { uv: [2, 2], shade: groundShade });
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
    this.mergeIce = true; // icicles share the snow draw call unless a building wants glossy ice
    this.mergeMetal = true; // iron bits share the wood draw call unless a building wants real metal
  }

  // Seeded helpers.
  r(lo = 0, hi = 1) { return lo + (hi - lo) * this.rand(); }
  rs() { return (this.rand() - 0.5) * 2; } // -1..1
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  chance(p) { return this.rand() < p; }

  get mbs() {
    return [this.wood, this.shingle, this.stone, this.straw, this.snow, this.ice, this.glow, this.ember, this.metal, this.cloth];
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
    for (const k of ['wood', 'shingle', 'stone', 'straw', 'snow', 'ice', 'glow', 'ember', 'metal', 'cloth']) {
      if (!this[k].empty) { calls++; tris += this[k].i.length / 3; }
    }
    return { calls, triangles: tris };
  }

  // Build meshes into a Group. `extraMeshes` such as door leaves are appended as-is.
  finish(extra = {}) {
    if (this.mergeIce) appendMB(this.snow, this.ice);
    if (this.mergeMetal) appendMB(this.wood, this.metal);
    const group = new THREE.Group();
    group.name = this.name;
    for (const key of ['wood', 'shingle', 'stone', 'straw', 'snow', 'ice', 'glow', 'ember', 'metal', 'cloth']) {
      const geo = this[key].build();
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
      stats: this.stats(),
      ...extra,
    };
    return res;
  }
}

export { C, mixC, scaleC };
