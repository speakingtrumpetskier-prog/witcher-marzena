// Procedural rock geometry shared by Rocks.js and the waterfall lintel: noise-displaced
// icosahedra with plane-cut facets, optional strata ledges, creased normals, origin at the base.
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../core/util.js';
import { createNoise } from '../../core/Noise.js';

const N3 = createNoise(5150);

// ---- geometry variants
export const KINDS = [
  { kind: 'boulder', seed: 11, scale: [1.1, 0.8, 1.0], cuts: 9, rough: 0.14, depth: [0.5, 0.78] },
  { kind: 'boulder', seed: 23, scale: [1.0, 0.65, 1.2], cuts: 11, rough: 0.12, depth: [0.48, 0.75] },
  { kind: 'boulder', seed: 37, scale: [1.2, 0.9, 0.9], cuts: 8, rough: 0.16, depth: [0.52, 0.8] },
  { kind: 'slab', seed: 41, scale: [1.5, 0.55, 1.0], cuts: 10, rough: 0.1, strata: 1, depth: [0.5, 0.8] },
  { kind: 'slab', seed: 53, scale: [1.3, 0.7, 1.3], cuts: 12, rough: 0.1, strata: 1, depth: [0.5, 0.78] },
  { kind: 'crag', seed: 67, scale: [0.8, 1.6, 0.9], cuts: 11, rough: 0.12, strata: 0.6, depth: [0.45, 0.75] },
  { kind: 'crag', seed: 79, scale: [1.0, 1.9, 0.7], cuts: 10, rough: 0.13, strata: 0.7, depth: [0.45, 0.72] },
];

export function rockGeometry(def, detail, { embed = 0.22 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const r = rng(def.seed);
  const planes = [];
  for (let k = 0; k < def.cuts; k++) {
    const v = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
    const [d0, d1] = def.depth || [0.62, 0.87];
    planes.push({ n: v, d: d0 + r() * (d1 - d0) });
  }
  planes.push({ n: new THREE.Vector3(0, -1, 0), d: 0.45 }); // flat-ish base
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const s = def.seed * 1.37;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = N3.noise3(v.x * 1.2 + s, v.y * 1.2, v.z * 1.2) * 0.6 + N3.noise3(v.x * 3.1, v.y * 3.1 + s, v.z * 3.1) * 0.3;
    v.multiplyScalar(1 + n * def.rough);
    for (const pl of planes) {
      const e = v.dot(pl.n) - pl.d;
      if (e > 0) v.addScaledVector(pl.n, -e * 0.92);
    }
    v.x *= def.scale[0]; v.y *= def.scale[1]; v.z *= def.scale[2];
    if (def.strata) {
      const ly = v.y * 5 + N3.noise3(v.x * 2, 0.5, v.z * 2) * 0.8;
      const step = (Math.round(ly) - ly) * 0.05 * def.strata;
      v.y += step;
      const out = 1 + 0.035 * def.strata * Math.sin(ly * Math.PI * 2);
      v.x *= out; v.z *= out;
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  // Sit the rock on its base: origin at the bottom, a quarter embedded when placed on ground.
  const bb = g.boundingBox;
  g.translate(0, -bb.min.y - (bb.max.y - bb.min.y) * embed, 0);
  const out = toCreasedNormals(g, 0.7);
  out.computeBoundingSphere();
  return out;
}

