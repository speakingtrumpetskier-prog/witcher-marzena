// Draw-call bake: after everything is placed, merge the static meshes of every village building,
// palisade, fence and boardwalk into a few big meshes per (spatial cell, material, shadow flags).
// A kit building costs 5 to 9 draw calls on its own; 70 structures would eat the whole budget, merged
// they cost about one call per material per 70 m cell. Door leaves (anything under a door pivot) stay
// separate so they can swing. Colliders, lights and anchors are unaffected (they live in world data).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ORDER } from '../../../core/G.js';
import { getMaterials } from '../../architecture/materials.js';

const CELL = 40;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

function underPivot(o, root) {
  for (let n = o.parent; n && n !== root.parent; n = n.parent) if (n.userData?.keepSeparate) return true;
  return false;
}

export function bakeVillage(V) {
  const { G } = V;
  const roots = [];
  for (const r of V.placed) roots.push({ root: r.p.root, id: r.id });
  for (const p of V.pieces) roots.push({ root: p.root, id: 'piece' });
  const buckets = new Map();
  const M = getMaterials();
  const inside = new Set([M.woodIn, M.stoneIn, M.rockIn]);
  let before = 0;
  for (const { root, id } of roots) {
    root.updateMatrixWorld(true);
    const take = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
      if (underPivot(o, root)) return;
      take.push(o);
    });
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
      const cellKey = inside.has(mesh.material) ? `in:${id}` : `${Math.floor(c.x / CELL)}|${Math.floor(c.z / CELL)}`;
      const key = `${cellKey}|${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${sig}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [], name: mesh.name }));
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
    if (inside.has(b.material)) { mesh.userData.interior = true; interiors.push(mesh); }
    group.add(mesh);
    tris += merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
  }
  G.scene.add(group);
  // Interior furniture and floors (the *In material twins) are only worth drawing when the viewer is near:
  // from afar they sit behind walls. Hiding them also drops them from the shadow passes.
  let t = 0;
  const cam = new THREE.Vector3();
  G.addSystem('village-interior-lod', (dt) => {
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
  }, ORDER.atmosphere + 8);
  V.baked = { meshes: group.children.length, before, tris, interiorMeshes: interiors.length };
  void _m;
  return V.baked;
}
