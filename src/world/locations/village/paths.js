// Trampled-snow footpaths and sled tracks: soft ribbons draped on the terrain, merged into ONE mesh.
// Roads are drawn by the terrain shader; this only adds the door-to-street paths, yard trails and the
// sled runs. The material turns to mud as uSnowCover falls (thaw ending).
import * as THREE from 'three';
import { addCompileHook } from '../../../render/Materials.js';
import { U } from '../../../render/Uniforms.js';

let mat = null;
function material() {
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  addCompileHook(mat, 'village-path', (shader) => {
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnowCover;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(vec3(0.17, 0.13, 0.09), diffuseColor.rgb, smoothstep(0.1, 0.7, uSnowCover));`);
  });
  return mat;
}

const COLORS = {
  path: [0.62, 0.66, 0.74], // trampled, a little blue in shadow
  yard: [0.66, 0.68, 0.74],
  sled: [0.55, 0.62, 0.74],
  mud: [0.4, 0.34, 0.28],
};

// strips: [{ pts: [[x, z], ...], width, kind: 'path' | 'yard' | 'sled' | 'mud', alpha }]
export function buildRibbons(G, strips, name = 'village-paths') {
  const pos = [], col = [], idx = [], nor = [];
  const hAt = (x, z) => G.world.heightAt(x, z);
  const rows = 5; // cross-section vertices (feathered edge)
  for (const s of strips) {
    const base = COLORS[s.kind || 'path'];
    const alpha = s.alpha ?? 0.5;
    const w = s.width ?? 1;
    // resample every ~0.9 m
    const pts = [];
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.9));
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(s.pts[s.pts.length - 1]);
    if (pts.length < 2) continue;
    const v0 = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      // taper the ends
      const end = Math.min(1, Math.min(i, pts.length - 1 - i) / 2.5);
      for (let r = 0; r < rows; r++) {
        const u = (r / (rows - 1)) * 2 - 1; // -1..1
        const x = pts[i][0] + nx * u * w * 0.5;
        const z = pts[i][1] + nz * u * w * 0.5;
        pos.push(x, hAt(x, z) + 0.07, z);
        nor.push(0, 1, 0);
        const edge = 1 - Math.abs(u);
        const a2 = alpha * Math.min(1, edge * 2.2) * end * (0.82 + 0.18 * Math.sin(i * 1.7 + r));
        col.push(base[0], base[1], base[2], a2);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = v0 + i * rows + r, b = a + 1, c = a + rows, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material());
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  G.scene.add(mesh);
  return mesh;
}
