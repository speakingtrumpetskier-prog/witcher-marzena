// Character gallery (WIP head test).
import * as THREE from 'three';
import { buildCharacter } from '../../characters/build.js';

export const modules = [];

export async function init(G) {
  const P = G.params;
  G.scene.background = new THREE.Color(0x8a9bb0);
  const hemi = new THREE.HemisphereLight(0xbfd2ee, 0x6d625a, 1.1);
  const key = new THREE.DirectionalLight(0xffe2c0, 2.6);
  key.position.set(2.5, 3.2, 3.5);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.4);
  rim.position.set(-3, 2.5, -4);
  G.scene.add(hemi, key, rim);
  const sex = P.get('sex') || 'f';
  const spec = { id: 'test', headOnly: P.has('headOnly'), body: { sex, age: +(P.get('age') || 38), height: sex === 'f' ? 1.76 : 1.8 },
    face: { scar: true, slit: true, iris: '#c08a2a', skin: '#d6ab8f', browColor: '#6b5a48' }, hair: { style: 'short', color: '#b9ad94' } };
  const views = P.has('views') ? [0, 0.6, Math.PI / 2] : [parseFloat(P.get('yaw') || '0')];
  let hy = 0;
  views.forEach((yaw, i) => {
    const c = buildCharacter(spec);
    c.mesh.rotation.y = yaw;
    c.mesh.position.x = (i - (views.length - 1) / 2) * 0.32;
    G.scene.add(c.mesh);
    hy = c.rig.world.head.y + 0.07;
    window.__char = c;
  });
  const dist = views.length > 1 ? 1.25 : 0.55;
  G.camera.position.set(0, hy, dist);
  G.camera.lookAt(0, hy, 0);
  G.camera.fov = 30;
  G.camera.updateProjectionMatrix();
}
