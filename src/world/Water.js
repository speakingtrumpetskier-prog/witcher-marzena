// STUB (owner: terrain builder). Lake ice now; open water after the thaw ending.
import * as THREE from 'three';
import { LAKE } from './layout.js';

export async function init(G) {
  const geo = new THREE.CircleGeometry(1, 96);
  geo.rotateX(-Math.PI / 2);
  const ice = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xa9c6d6, roughness: 0.3 }));
  ice.scale.set(LAKE.rx * 1.2, 1, LAKE.rz * 1.2);
  ice.position.set(LAKE.x, 0.0, LAKE.z);
  ice.receiveShadow = true;
  G.scene.add(ice);
  G.water = { ice, stub: true };
}
