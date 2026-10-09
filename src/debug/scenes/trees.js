// Vegetation gallery: every species and variant in a row on snowy ground, one row per LOD
// (plus the far billboard impostors), for close inspection.
//
//   ?scene=trees&cam=0,6,40&look=0,6,0&hour=13
//   &sp=spruce,pine     only these species (spruce, sapling, pine, birch, snag, bush, ground, log, reed)
//   &rows=0,1,2,3       LOD rows to show (3 = billboard impostors, two views per kind)
//   &spring=1           uSpring 1, &snow=0 for the thawed look
import * as THREE from 'three';
import { createKinds } from '../../world/trees/kinds.js';
import { bakeImpostors, ImpostorLayer } from '../../world/trees/impostor.js';
import { lodUniform, setLod } from '../../world/trees/materials.js';

export const modules = ['atmosphere', 'sky', 'postfx'];

export async function init(G) {
  const sp = (G.params.get('sp') || '').split(',').filter(Boolean);
  const rows = (G.params.get('rows') || '0,1,2').split(',').map(Number);
  const spring = parseFloat(G.params.get('spring'));
  const snow = parseFloat(G.params.get('snow'));
  if (Number.isFinite(spring)) G.uniforms.uSpring.value = spring;
  if (Number.isFinite(snow)) G.uniforms.uSnowCover.value = snow;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 400),
    new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  G.scene.add(ground);

  let kinds = createKinds();
  if (sp.length) kinds = kinds.filter((k) => sp.includes(k.species) || sp.includes(k.id));
  const group = new THREE.Group();
  G.scene.add(group);
  G.vegGallery = { kinds, group };
  let x = 0;
  const xs = [];
  for (const k of kinds) {
    const w = Math.max(5, k.radius * 2 + 3);
    x += w * 0.5;
    xs.push(x);
    x += w * 0.5;
  }
  const total = x;
  kinds.forEach((k, i) => {
    rows.forEach((row, ri) => {
      if (row >= k.lods.length) return;
      for (const part of k.lods[row].parts) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.position.set(xs[i] - total / 2, 0, -ri * 26);
        m.castShadow = true;
        m.receiveShadow = true;
        m.customDepthMaterial = part.depth;
        if (part.noShadow) m.castShadow = false;
        if (part.leaves) m.visible = G.uniforms.uSpring.value > 0.02;
        group.add(m);
      }
    });
  });
  if (rows.includes(3)) {
    // row 3: the far billboard impostors baked from LOD 0 (z = -3 * 26 when mixed with other rows)
    const imps = kinds.filter((k) => k.impostor);
    const atlas = await bakeImpostors(G, imps);
    const u = lodUniform();
    setLod(u, -2, -1, null, null);
    const layer = new ImpostorLayer(atlas, u, [0, 9999], imps.length * 2 + 4);
    layer.begin();
    const zi = rows.indexOf(3);
    kinds.forEach((k, i) => {
      if (!k.impostor) return;
      layer.push(k, xs[i] - total / 2 - 1.2, 0, -zi * 26, 1, 1, 1, 1, 1, 0);
      layer.push(k, xs[i] - total / 2 + 1.2, 0, -zi * 26, 1, 1, 1, 1, 1, 1);
    });
    layer.end();
    G.scene.add(layer.mesh);
    G.vegGallery.atlas = atlas;
  }
  const sh = G.atmosphere?.sun?.shadow;
  if (sh) { sh.bias = -0.0004; sh.normalBias = 0.06; }
  G.camera.position.set(0, 8, 46);
  G.camera.lookAt(0, 9, 0);
}
