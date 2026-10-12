// Terrain, ice and rock gallery on the real world: exercises the G.water API and shows every
// rock variant side by side.
//
//   ?scene=terrain&cam=10,4,-14&look=10,0,-40&hour=14
//   &ice=1            demo holes (ritual site and fishing camp), an under-ice glow and cracks
//   &glow=x,z,r,i     custom under-ice glow     &cracks=x,z,r,amount   custom crack network
//   &thaw=0.6         lake thaw amount          &snow=0.4 &spring=1    global snow / spring
//   &rocks=1          a row of all rock variants (two LODs) on the ice near (0, -60)
import * as THREE from 'three';
import { LOC } from '../../world/layout.js';
import { KINDS, rockGeometry } from '../../world/terrain/rockGeometry.js';
import { rockMaterial } from '../../world/terrain/rockMaterial.js';

export const modules = ['atmosphere', 'sky', 'terrain', 'water', 'rocks', 'postfx'];
export const needsWorld = true;

const nums = (s) => (s ? s.split(',').map(Number) : null);

export async function init(G) {
  const p = G.params;
  const snow = parseFloat(p.get('snow')), spring = parseFloat(p.get('spring')), thaw = parseFloat(p.get('thaw'));
  if (Number.isFinite(snow)) G.uniforms.uSnowCover.value = snow;
  if (Number.isFinite(spring)) G.uniforms.uSpring.value = spring;
  const W = G.water;
  if (!W) return;
  if (Number.isFinite(thaw)) W.setThaw(thaw);
  if (p.get('ice') === '1') {
    W.addHole(LOC.ritual.x, LOC.ritual.z, 1.2);
    W.addHole(LOC.iceCamp.x - 3, LOC.iceCamp.z + 2, 0.45);
    W.addHole(LOC.iceCamp.x + 2.5, LOC.iceCamp.z - 1, 0.4);
    W.addHole(LOC.iceCamp.x + 5, LOC.iceCamp.z + 4, 0.45);
    W.setUnderGlow(LOC.ritual.x + 14, LOC.ritual.z - 10, 6, 1.6);
    W.setCracks(LOC.ritual.x - 6, LOC.ritual.z - 14, 18, 0.75);
  }
  const g = nums(p.get('glow'));
  if (g) W.setUnderGlow(g[0], g[1], g[2], g[3]);
  const c = nums(p.get('cracks'));
  if (c) W.setCracks(c[0], c[1], c[2], c[3]);
  if (p.get('rocks') === '1') {
    const mat = rockMaterial(G);
    KINDS.forEach((def, i) => {
      for (const [lod, dz] of [[3, 0], [1, 5]]) {
        const m = new THREE.Mesh(rockGeometry(def, lod), mat);
        m.position.set(-14 + i * 4.5, 0, -60 - dz);
        m.castShadow = m.receiveShadow = true;
        G.scene.add(m);
      }
    });
  }
}
