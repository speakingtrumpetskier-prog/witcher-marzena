// Hand-held tools for villagers at work: one merged, vertex-colored mesh each (one draw call),
// built once and cloned per user. Handles run along local +Y, which is the grip axis of the
// character hand sockets (see Character._makeSockets), so a tool dropped in a hand socket sits
// in a fist; per-tool `rot` and `pos` tune it to the clip poses.
//
//   const t = makeTool('axe');       // Mesh (shared geometry, shared material)
//   TOOL_FOR_ANIM[anim] -> { tool, socket }   which tool an animation wants, and in which hand
//   makeSnowball()                   small white sphere for the children
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let MAT = null;
function material() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
  return MAT;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

// Same as part() but keeps the primitive's smooth normals (all inputs must be indexed primitives).
export function spart(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

export const cyl = (r0, r1, h, seg = 6) => new THREE.CylinderGeometry(r0, r1, h, seg);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const WOOD = 0x8a6a46, WOOD_D = 0x6a4e34, IRON = 0x6c6e72, IRON_D = 0x3c3e42, STRAW = 0xb59a58, ROPE = 0x9a8460;

const BUILD = {
  axe: () => [
    part(cyl(0.016, 0.02, 0.82), WOOD, 0, 0.16, 0),
    part(box(0.05, 0.1, 0.045), IRON_D, 0, 0.5, 0),
    part(box(0.012, 0.16, 0.1), IRON, 0, 0.5, 0.075, 0, 0, 0, 1, 1, 1),
  ],
  hammer: () => [
    part(cyl(0.017, 0.02, 0.4), WOOD_D, 0, 0.08, 0),
    part(box(0.07, 0.065, 0.065), IRON_D, 0, 0.3, 0),
    part(box(0.05, 0.05, 0.12), IRON, 0, 0.3, 0.02),
  ],
  broom: () => [
    part(cyl(0.014, 0.017, 1.25), WOOD, 0, 0.3, 0),
    part(cyl(0.03, 0.09, 0.28, 7), STRAW, 0, -0.45, 0),
    part(cyl(0.032, 0.034, 0.04, 7), ROPE, 0, -0.33, 0),
  ],
  shovel: () => [
    part(cyl(0.017, 0.02, 1.2), WOOD, 0, 0.3, 0),
    part(box(0.06, 0.05, 0.02), WOOD_D, 0, 0.92, 0),
    part(box(0.26, 0.3, 0.012), IRON, 0, -0.43, 0),
  ],
  bucket: () => [
    part(cyl(0.12, 0.095, 0.22, 10), WOOD_D, 0, -0.3, 0),
    part(cyl(0.123, 0.123, 0.02, 10), IRON_D, 0, -0.21, 0),
    part(cyl(0.097, 0.097, 0.02, 10), IRON_D, 0, -0.39, 0),
    part(new THREE.TorusGeometry(0.115, 0.007, 4, 10, Math.PI), IRON_D, 0, -0.2, 0, 0, 0, 0),
  ],
  rod: () => [
    part(cyl(0.007, 0.014, 0.7, 5), WOOD, 0, 0.2, 0.05, 0.5, 0, 0),
    part(cyl(0.002, 0.002, 0.5, 3), 0xd8d8d0, 0, -0.1, 0.26, 0.1, 0, 0),
  ],
  net: () => [
    part(box(0.26, 0.1, 0.2), ROPE, 0, 0, 0),
    part(box(0.2, 0.06, 0.24), 0x84704c, 0.03, 0.02, 0.02, 0.1, 0.3, 0),
  ],
  basket: () => [
    part(cyl(0.13, 0.1, 0.15, 9), 0x8a6a3c, 0, -0.24, 0),
    part(new THREE.TorusGeometry(0.12, 0.008, 4, 9, Math.PI), 0x6a4c2c, 0, -0.17, 0, 0, 0, 0),
  ],
  spoon: () => [
    part(cyl(0.01, 0.012, 0.3, 5), WOOD, 0, 0.1, 0),
    part(new THREE.SphereGeometry(0.04, 6, 4), WOOD, 0, 0.27, 0, 0, 0, 0, 0.8, 1.2, 0.4),
  ],
  snowball: () => [part(new THREE.IcosahedronGeometry(0.075, 1), 0xf4f7fb, 0, 0, 0)],
};

const cache = new Map();

export function makeTool(name) {
  let g = cache.get(name);
  if (!g) {
    const f = BUILD[name];
    if (!f) return null;
    g = mergeGeometries(f(), false);
    g.computeVertexNormals();
    cache.set(name, g);
  }
  const m = new THREE.Mesh(g, material());
  m.name = `tool_${name}`;
  m.castShadow = true;
  m.frustumCulled = true;
  return m;
}

export function makeSnowball() { return makeTool('snowball'); }

// Placement of a tool in the hand socket for each tool: [x, y, z, rx, ry, rz] (socket space).
export const TOOL_POSE = {
  axe: [0, 0.02, 0, 0, 0, 0],
  hammer: [0, 0.02, 0, 0, 0, 0],
  broom: [0, 0.05, 0, 0, 0, 0],
  shovel: [0, 0.05, 0, 0, 0, 0],
  bucket: [0, 0.0, 0, 0, 0, 0],
  rod: [0, 0.02, 0, 0, 0, 0],
  net: [0, 0.0, 0.04, 0, 0, 0],
  basket: [0, 0.0, 0, 0, 0, 0],
  spoon: [0, 0.0, 0, 0, 0, 0],
  snowball: [0, 0.02, 0.03, 0, 0, 0],
};

// What a station animation holds. `tool` may be overridden by the station (`station.tool`).
export const TOOL_FOR_ANIM = {
  chop_wood: { tool: 'axe', socket: 'handR' },
  hammer: { tool: 'hammer', socket: 'handR' },
  sweep: { tool: 'broom', socket: 'handR' },
  carry_bucket: { tool: 'bucket', socket: 'handR' },
  fish_ice: { tool: 'rod', socket: 'handR' },
  mend_net: { tool: 'net', socket: 'handL' },
  stir: { tool: 'spoon', socket: 'handR' },
};
