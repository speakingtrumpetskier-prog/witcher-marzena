// Gallery for the atmosphere area: a snow field with reference materials (snow, ice, wood,
// metal, folk red cloth, an emissive window) under the real sky, lights, fog and post.
//
// URL extras:
//   sweep=H       advance the clock H hours per rendered frame (contact sheets of the day:
//                 node scripts/shot.mjs --q "scene=atmosphere&sweep=2&hour=0" --seq 12 --every 50)
//   senses=1      hunter senses on: the red post is an orange clue, the metal sphere a turquoise echo
//   echo=1, frost=0.8, aurora=1
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';

export const modules = ['atmosphere', 'sky', 'weather', 'postfx'];
export const needsWorld = false;

export async function init(G) {
  const p = G.params;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.85 }),
  );
  ground.receiveShadow = true;
  G.scene.add(ground);

  const ice = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xa9c6d6, roughness: 0.12, metalness: 0 }),
  );
  ice.position.set(-6, 0.02, -10);
  ice.receiveShadow = true;
  G.scene.add(ice);

  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x9a2e22, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.3, metalness: 1 }),
    new THREE.MeshLambertMaterial({ color: 0x2f4a2a }),
  ];
  const spheres = [];
  mats.forEach((m, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 24), m);
    spheres.push(s);
    s.position.set(-6 + i * 3, 1.1, 0);
    s.castShadow = s.receiveShadow = true;
    G.scene.add(s);
  });

  // A log wall with a lit window (emissive driven by uWindowLight) and a tall post.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x3b2e25, roughness: 0.95 }));
  wall.position.set(4, 1.75, -6);
  wall.castShadow = wall.receiveShadow = true;
  G.scene.add(wall);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), winMat);
  win.position.set(4, 1.9, -5.69);
  G.scene.add(win);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 12), mats[2]);
  post.position.set(-9, 3.5, -4);
  post.castShadow = true;
  G.scene.add(post);
  for (let i = 0; i < 9; i++) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(1.6, 8, 10), mats[4]);
    tree.position.set(-30 + i * 7.5, 4, -26 - (i % 3) * 5);
    tree.castShadow = tree.receiveShadow = true;
    G.scene.add(tree);
  }

  if (p.get('senses')) {
    G.uniforms.uSenses.value = 1;
    G.postfx?.markClue(post, true);
    G.postfx?.markClue(spheres[3], true, '#9ff5ff');
  }
  if (p.get('echo') && G.postfx) G.postfx.echo = parseFloat(p.get('echo'));
  if (p.get('frost') && G.postfx) G.postfx.frost = parseFloat(p.get('frost'));
  if (p.get('aurora') && G.sky) G.sky.auroraOverride = parseFloat(p.get('aurora'));

  const sweep = parseFloat(p.get('sweep'));
  G.addSystem('atmosphere-gallery', () => {
    if (Number.isFinite(sweep)) G.time.hours = (G.time.hours + sweep) % 24;
    winMat.color.setRGB(1, 0.69, 0.38).multiplyScalar(0.08 + 5 * G.uniforms.uWindowLight.value);
  }, ORDER.atmosphere - 5);

  if (!G.params.get('cam')) {
    G.camera.position.set(2, 3.2, 14);
    G.camera.lookAt(-1, 1.5, -6);
  }
}
