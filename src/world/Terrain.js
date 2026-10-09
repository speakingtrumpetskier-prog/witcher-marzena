// STUB (owner: terrain builder). Replace with the real chunked terrain + far ring + shader.
import * as THREE from 'three';

export async function init(G) {
  const w = G.world, n = w.res, half = w.half;
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = w.terrainAt(x, z);
    pos.setY(i, h);
    const c = h < 0 ? [0.5, 0.6, 0.7] : [0.9, 0.92, 0.95];
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.receiveShadow = true;
  G.scene.add(mesh);
  G.terrain = { mesh, stub: true };
}
