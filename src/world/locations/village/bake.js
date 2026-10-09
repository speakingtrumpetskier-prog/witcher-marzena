// Draw-call and triangle bake. After everything is placed, the static meshes of every village building,
// palisade, fence and boardwalk are merged into a few big meshes per (spatial cell, material, shadow flags).
// A kit building costs 5 to 9 draw calls and 15 to 40k triangles on its own; 70 structures would eat the
// budget, merged they cost about one call per material per 32 m cell. Door leaves (anything under a door
// pivot) stay separate so they can swing. Colliders, lights and anchors are unaffected (world data).
//
// Two level-of-detail systems keep the busiest views inside the triangle budget:
//   interiors  the *In material twins (floors, furniture) of each building are separate meshes that are only
//              drawn within 52 m of the viewer (from afar they sit behind walls); hidden meshes also leave the
//              shadow passes.
//   far houses log houses and outbuildings beyond ~110 m from the viewer swap to a box-and-gable proxy
//              (snowy roof, dark walls, 30 triangles instead of 15 to 25k). Heroes, huts and linear pieces
//              always stay detailed. ?lodfar=N changes the distance, ?nolod turns the swap off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ORDER } from '../../../core/G.js';
import { getMaterials } from '../../architecture/materials.js';

const CELL = 32;
const _v = new THREE.Vector3();

function underPivot(o, root) {
  for (let n = o.parent; n && n !== root.parent; n = n.parent) if (n.userData?.keepSeparate) return true;
  return false;
}

// Box walls plus a gable roof in the building's local frame, transformed to world.
function proxyGeometry(rec) {
  const info = rec.b.info;
  if (!info?.roof || !info.hw) return null;
  const lift = info.lift || 0;
  const hw = info.hw + (info.r || 0.2), hd = info.hd + (info.r || 0.2);
  const yE = info.yEave + lift;
  const roof = info.roof;
  const X = roof.X, Z = roof.Z;
  const yEaveTop = roof.topY(X, 0) + lift, ridge = roof.ridgeY + lift;
  const wall = new THREE.Color(0x5e4a3a), shade = new THREE.Color(0x45362b), snow = new THREE.Color(0xe9eef7), under = new THREE.Color(0x4a3a2e);
  const pos = [], col = [], nor = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = (pts, color) => {
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
    const order = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (const i of order) { const p = pts[i]; pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(color.r, color.g, color.b); }
  };
  const y0 = lift;
  face([V3(-hw, y0, hd), V3(hw, y0, hd), V3(hw, yE, hd), V3(-hw, yE, hd)], wall);
  face([V3(hw, y0, -hd), V3(-hw, y0, -hd), V3(-hw, yE, -hd), V3(hw, yE, -hd)], shade);
  face([V3(hw, y0, hd), V3(hw, y0, -hd), V3(hw, yE, -hd), V3(hw, yE, hd)], shade);
  face([V3(-hw, y0, -hd), V3(-hw, y0, hd), V3(-hw, yE, hd), V3(-hw, yE, -hd)], wall);
  face([V3(-hw, yE, hd), V3(hw, yE, hd), V3(0, ridge - 0.1, hd)], wall);
  face([V3(hw, yE, -hd), V3(-hw, yE, -hd), V3(0, ridge - 0.1, -hd)], shade);
  face([V3(X, yEaveTop, Z), V3(X, yEaveTop, -Z), V3(0, ridge, -Z), V3(0, ridge, Z)], snow);
  face([V3(-X, yEaveTop, -Z), V3(-X, yEaveTop, Z), V3(0, ridge, Z), V3(0, ridge, -Z)], snow);
  face([V3(X, yEaveTop - 0.12, -Z), V3(X, yEaveTop - 0.12, Z), V3(0, ridge - 0.12, Z), V3(0, ridge - 0.12, -Z)], under);
  face([V3(-X, yEaveTop - 0.12, Z), V3(-X, yEaveTop - 0.12, -Z), V3(0, ridge - 0.12, -Z), V3(0, ridge - 0.12, Z)], under);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rec.p.root.updateMatrixWorld(true);
  g.applyMatrix4(rec.p.root.matrixWorld);
  return g;
}

export function bakeVillage(V) {
  const { G } = V;
  const lodOn = !G.params.has('nolod');
  const FAR = parseFloat(G.params.get('lodfar') || '110');
  const roots = [];
  for (const r of V.placed) {
    const lod = lodOn && (r.meta.house || r.meta.outbuilding) && !r.meta.hero && !!r.b.info?.roof && r.kind !== 'boathouse';
    roots.push({ root: r.p.root, id: r.id, rec: r, lod });
  }
  for (const p of V.pieces) roots.push({ root: p.root, id: 'piece', rec: null, lod: false });
  const buckets = new Map();
  const cells = new Map(); // lod cell key -> { x, z, n, meshes: [], proxies: [] }
  const M = getMaterials();
  const inside = new Set([M.woodIn, M.stoneIn, M.rockIn]);
  let before = 0;
  for (const { root, id, rec, lod } of roots) {
    root.updateMatrixWorld(true);
    const take = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
      if (underPivot(o, root)) return;
      take.push(o);
    });
    let lodKey = null;
    if (lod) {
      lodKey = `${Math.floor(rec.x / CELL)}|${Math.floor(rec.z / CELL)}`;
      let c = cells.get(lodKey);
      if (!c) cells.set(lodKey, (c = { x: 0, z: 0, n: 0, meshes: [], proxies: [] }));
      const pg = proxyGeometry(rec);
      if (pg) { c.proxies.push(pg); c.x += rec.x; c.z += rec.z; c.n++; } else lodKey = null;
    }
    for (const mesh of take) {
      before++;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const sb = geo.getAttribute('snowBase');
      if (sb) {
        for (let i = 0; i < sb.count; i++) { _v.fromBufferAttribute(sb, i).applyMatrix4(mesh.matrixWorld); sb.setXYZ(i, _v.x, _v.y, _v.z); }
      }
      geo.computeBoundingSphere();
      const c = geo.boundingSphere.center;
      const sig = Object.keys(geo.attributes).sort().join() + (geo.index ? 'i' : 'n');
      const isIn = inside.has(mesh.material);
      let cellKey;
      if (isIn) cellKey = `in:${id}`;
      else if (lodKey) cellKey = `L${lodKey}`;
      else cellKey = `${Math.floor(c.x / CELL)}|${Math.floor(c.z / CELL)}`;
      const key = `${cellKey}|${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${sig}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [], name: mesh.name, isIn, lodKey: isIn ? null : lodKey }));
      b.geos.push(geo);
      mesh.parent.remove(mesh);
      mesh.geometry.dispose();
    }
  }
  const group = new THREE.Group();
  group.name = 'village-baked';
  const interiors = [];
  let tris = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.name = `village:${b.name.split(':').pop() || 'mesh'}`;
    if (b.isIn) { mesh.userData.interior = true; interiors.push(mesh); }
    if (b.lodKey) cells.get(b.lodKey).meshes.push(mesh);
    group.add(mesh);
    tris += merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
  }

  // ---- far-house proxies: one mesh per LOD cell ----
  const proxyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const lodCells = [];
  for (const c of cells.values()) {
    if (!c.proxies.length) continue;
    const geo = mergeGeometries(c.proxies, false);
    for (const g of c.proxies) g.dispose();
    const mesh = new THREE.Mesh(geo, proxyMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.name = 'village:proxy';
    geo.computeBoundingSphere();
    group.add(mesh);
    lodCells.push({ center: new THREE.Vector3(c.x / c.n, 0, c.z / c.n), r: geo.boundingSphere.radius + 4, meshes: c.meshes, proxy: mesh, far: false });
  }
  G.scene.add(group);

  let t = 0;
  const cam = new THREE.Vector3();
  G.addSystem('village-lod', (dt) => {
    t -= dt;
    if (t > 0) return;
    t = 0.4;
    const p = G.player?.position || G.camera?.position;
    if (!p) return;
    cam.copy(p);
    for (const m of interiors) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const bs = m.geometry.boundingSphere;
      m.visible = cam.distanceTo(bs.center) - bs.radius < 52;
    }
    for (const c of lodCells) {
      const d = Math.hypot(cam.x - c.center.x, cam.z - c.center.z) - c.r;
      const far = c.far ? d > FAR - 12 : d > FAR + 12;
      if (far !== c.far) {
        c.far = far;
        c.proxy.visible = far;
        for (const m of c.meshes) m.visible = !far;
      }
    }
  }, ORDER.atmosphere + 8);
  V.baked = { meshes: group.children.length, before, tris, interiorMeshes: interiors.length, lodCells: lodCells.length };
  return V.baked;
}
