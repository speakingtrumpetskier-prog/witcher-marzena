// Composer: dresses one wilderness location with a single merged mesh per material.
//
// A Composer owns one props Kit whose origin sits on the ground at (x, z). Props from the props
// kit are dropped in with `prop(name, x, z, opts)` (snapped to the terrain, full rotation, collider
// registration) and custom parts are drawn with `at(x, z, opts, (k) => ...)` using the Kit
// primitives (box, cyl, blob, tube, mound...). `build()` bakes everything into a handful of
// draw calls and adds the group to the scene.
//
//   const c = new Composer(G, ctx, 'ritual', x, z, { seed: 3 });
//   const h = c.prop('ribbonPole', x1, z1, { yaw: 1.2 });      h.anchors.*, h.x, h.y, h.z (world space)
//   c.at(x2, z2, { yaw }, (k) => k.box('wood', 1, 1, 1, { pos: [0, 0.5, 0], tint: 0xa89684 }));
//   const group = c.build();
//
// World-space helpers used by every location module live here as well: ground sampling, the rock
// mesh builder that reuses the terrain rock material and geometry, and small utilities.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit } from '../../props/kit.js';
import { rockGeometry, KINDS } from '../../terrain/rockGeometry.js';
import { rockMaterial } from '../../terrain/rockMaterial.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

export const rot2 = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Seeded random source, independent per location so tweaks stay local.
export function rngOf(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.signed = (a) => (r() * 2 - 1) * a;
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export class Composer {
  constructor(G, ctx, name, x, z, o = {}) {
    this.G = G;
    this.ctx = ctx;
    this.name = name;
    this.ox = x;
    this.oz = z;
    this.oy = o.y ?? G.world.heightAt(x, z);
    this.k = new Kit(name, { seed: o.seed ?? 1 });
    this.pending = []; // collider records in world space
    this.colliderIds = [];
    this.parts = []; // loose Object3Ds added to the scene (text boards, decals)
    this.group = null;
    this.shadows = o.shadows !== false;
  }

  ground(x, z, rad = 0) {
    const w = this.G.world;
    let sum = w.heightAt(x, z), n = 1;
    if (rad > 0.25) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        sum += w.heightAt(x + Math.cos(a) * rad, z + Math.sin(a) * rad); n++;
      }
    }
    return sum / n;
  }

  // Props-kit prop. opts: seed, yaw, rot [x,y,z], scale (number | [x,y,z]), y (absolute world height),
  // dy (offset above the ground), opts (builder options), collide (default true), rad (ground sampling radius).
  prop(name, x, z, o = {}) {
    const make = this.ctx.props[name];
    if (!make) throw new Error(`wilderness: unknown prop "${name}"`);
    const g = make({ seed: o.seed, ...(o.opts || {}), fx: false });
    const ud = g.userData;
    const sc = o.scale == null ? 1 : o.scale;
    const s3 = Array.isArray(sc) ? sc : [sc, sc, sc];
    const rad = o.rad ?? Math.min(1.6, Math.max(0.1, Math.max(ud.bounds.max.x - ud.bounds.min.x, ud.bounds.max.z - ud.bounds.min.z) * 0.4)) * s3[0];
    const y = o.y ?? (this.ground(x, z, rad) + (o.dy || 0));
    const yaw = o.yaw || 0;
    const part = { pos: [x - this.ox, y - this.oy, z - this.oz], yaw, rot: o.rot, scale: s3 };
    this.k.addGroup(g, part);
    const m = this.k._compose(part);
    const anchors = {};
    for (const [key, v] of Object.entries(ud.anchors || {})) anchors[key] = v.clone().applyMatrix4(m).add(_v.set(this.ox, this.oy, this.oz));
    if (o.collide !== false && ud.colliders) {
      for (const c of ud.colliders) {
        const [dx, dz] = rot2((c.x || 0) * s3[0], (c.z || 0) * s3[0], yaw);
        const rec = { x: x + dx, z: z + dz, y0: y - 0.6, y1: y + (c.h ?? 1.2) * s3[1] + 0.05, tag: name };
        if (c.type === 'circle') this.pending.push({ ...rec, type: 'circle', r: c.r * s3[0] });
        else this.pending.push({ ...rec, type: 'box', hw: c.hw * s3[0], hd: c.hd * s3[0], yaw: yaw + (c.yaw || 0) });
      }
    }
    this._sources = this._sources || [];
    this._sources.push(g);
    return { x, y, z, yaw, anchors, name, ud, group: g };
  }

  // Custom Kit parts at a world position. fn(k) draws in local space: y = 0 is the ground there.
  at(x, z, o, fn) {
    const y = o.y ?? (this.ground(x, z, o.rad || 0) + (o.dy || 0));
    this.k.with({ pos: [x - this.ox, y - this.oy, z - this.oz], yaw: o.yaw || 0, rot: o.rot, scale: o.scale }, () => fn(this.k));
    return { x, y, z, yaw: o.yaw || 0 };
  }

  // Convert a point in the frame of an `at` call to world space.
  world(x, z, yaw, lx, ly, lz, y) {
    const [dx, dz] = rot2(lx, lz, yaw);
    return new THREE.Vector3(x + dx, y + ly, z + dz);
  }

  collider(rec) { this.pending.push(rec); }
  circle(x, z, r, y0, y1, tag) { this.pending.push({ type: 'circle', x, z, r, y0, y1, tag: tag || this.name }); }
  box(x, z, hw, hd, yaw, y0, y1, tag) { this.pending.push({ type: 'box', x, z, hw, hd, yaw, y0, y1, tag: tag || this.name }); }

  // A loose object kept in world coordinates (text boards, decals, extra meshes).
  scene(obj) {
    this.G.scene.add(obj);
    this.parts.push(obj);
    return obj;
  }

  build() {
    const g = this.k.build();
    g.position.set(this.ox, this.oy, this.oz);
    g.name = `wild:${this.name}`;
    for (const m of g.children) { if (m.isMesh && !this.shadows) m.castShadow = false; }
    this.G.scene.add(g);
    this.group = g;
    if (this.G.physics) {
      for (const c of this.pending) {
        const o = { y0: c.y0, y1: c.y1, tag: c.tag };
        this.colliderIds.push(c.type === 'circle'
          ? this.G.physics.addCircle(c.x, c.z, c.r, o)
          : this.G.physics.addBox(c.x, c.z, c.hw, c.hd, c.yaw || 0, o));
      }
    }
    for (const src of this._sources || []) src.traverse((ch) => { if (ch.isMesh) ch.geometry.dispose(); });
    this._sources = [];
    return g;
  }

  dispose() {
    if (this.group) {
      this.G.scene.remove(this.group);
      this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    for (const p of this.parts) { this.G.scene.remove(p); p.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); }); }
    if (this.G.physics) for (const id of this.colliderIds) this.G.physics.remove(id);
    this.colliderIds = [];
  }
}

// ---------------------------------------------------------------------------------------------
// Rock blocks: merged boulders and slabs using the terrain rock geometry and material (so overlay
// rocks match the cliffs). blocks: [{ v (KINDS index 0..6), x, y, z, s (number | [x,y,z]), ry, rx, rz, embed }]
const rockCache = new Map();
function baseRock(v, detail, embed) {
  const key = `${v}|${detail}|${embed}`;
  let g = rockCache.get(key);
  if (!g) { g = rockGeometry(KINDS[v % KINDS.length], detail, { embed }); rockCache.set(key, g); }
  return g;
}

// Size of a rock block's unit geometry (before scale): { w, h, d, y0, y1 } with the base embed applied.
export function rockDims(v, detail = 3, embed = 0.22) {
  const g = baseRock(v, detail, embed);
  g.computeBoundingBox();
  const b = g.boundingBox;
  return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, y0: b.min.y, y1: b.max.y };
}

export function rockBlocks(G, blocks, { tone = 0.8, detail = 2, name = 'rockBlocks', shadows = true, collide = true } = {}) {
  const list = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const ids = [];
  for (const b of blocks) {
    const sc = b.s == null ? 1 : b.s;
    const s3 = Array.isArray(sc) ? sc : [sc, sc, sc];
    e.set(b.rx || 0, b.ry || 0, b.rz || 0, 'YXZ');
    q.setFromEuler(e);
    m.compose(p.set(b.x, b.y, b.z), q, s.set(s3[0], s3[1], s3[2]));
    const g = baseRock(b.v ?? 0, b.detail ?? detail, b.embed ?? 0.22).clone();
    g.applyMatrix4(m);
    list.push(g);
    if (collide && G.physics && b.collide !== false) {
      const r = Math.max(s3[0], s3[2]) * (b.cr ?? 0.8);
      if (r > 0.6) ids.push(G.physics.addCircle(b.x, b.z, r, { y0: b.y - 1.5, y1: b.y + s3[1] * 1.6, tag: name }));
    }
  }
  if (!list.length) return null;
  const geo = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, rockMaterial(G, { tone }));
  mesh.name = `wild:${name}`;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  G.scene.add(mesh);
  mesh.userData.colliderIds = ids;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Small world helpers.

// Point on the polyline `pts` ([x, z] pairs) at arc length s: { x, z, tx, tz, nx, nz } (n = left normal).
export function alongPath(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s || i === pts.length - 2) {
      const t = clamp((s - acc) / len, 0, 1);
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx, tz, nx: tz, nz: -tx, s };
    }
    acc += len;
  }
  return null;
}

export function pathLength(pts) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

// Fresh Catmull-Rom smoothing of a polyline into evenly spaced points (for drag marks, tracks).
export function smoothPath(pts, step = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
}

export function ndist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

// Is (x, z) free of big rocks, steep slopes and the lake edge? Used for vignette placement.
export function spotOk(G, x, z, { rad = 1.5, maxSlope = 0.45, ice = false } = {}) {
  const w = G.world;
  if (!ice && w.isLake(x, z)) return false;
  if (G.rocks?.rockAt?.(x, z, rad)) return false;
  const h = w.heightAt(x, z);
  const e = 1.5;
  const sl = Math.max(Math.abs(w.heightAt(x + e, z) - h), Math.abs(w.heightAt(x - e, z) - h), Math.abs(w.heightAt(x, z + e) - h), Math.abs(w.heightAt(x, z - e) - h)) / e;
  return sl < maxSlope;
}

export function yawToward(x, z, tx, tz) { return Math.atan2(tx - x, tz - z); }
