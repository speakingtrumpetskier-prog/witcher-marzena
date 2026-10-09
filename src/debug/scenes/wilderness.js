// Gallery for the wilderness set pieces without the full world: a local terrain patch around each
// location (analytic heights), a plain ice sheet for the lake, and the real location builders.
//
//   ?scene=wilderness&wild=passStart&spot=passClear        build one location and use a camera preset
//   ?scene=wilderness&wild=all                              build everything (slow, no terrain system)
//   &patch=60                                               half size of the terrain patch in meters (default 80)
// Presets live in world/locations/wilderness/spots.js; cam/look/hour/weather URL params override them.
import * as THREE from 'three';
import { computeHeight } from '../../world/heightfield.js';
import { LOC } from '../../world/layout.js';
import { SPOTS } from '../../world/locations/wilderness/spots.js';

export const modules = ['atmosphere', 'sky', 'weather', 'postfx'];
export const needsWorld = false;

function patch(G, cx, cz, half, step = 2) {
  const n = Math.round((half * 2) / step);
  const pos = [], idx = [], col = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = cx - half + i * step, z = cz - half + j * step;
      const h = computeHeight(x, z);
      pos.push(x, h, z);
      const k = 0.9 + 0.1 * Math.sin(x * 0.3) * Math.sin(z * 0.27);
      col.push(0.9 * k, 0.93 * k, 0.97 * k);
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i;
    idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  m.name = 'gallery:terrain';
  G.scene.add(m);
  // ice sheet for lake sites
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.12, transparent: true, opacity: 0.88 }));
  ice.position.set(cx, 0, cz);
  ice.receiveShadow = true;
  ice.name = 'gallery:ice';
  G.scene.add(ice);
}

export async function init(G) {
  const wild = (G.params.get('wild') || 'passStart').split(',').filter(Boolean);
  const spotId = G.params.get('spot');
  const spot = SPOTS[spotId] || null;
  const first = wild[0] === 'all' ? null : wild[0];
  const locId = spot?.loc || first || 'passStart';
  const L = LOC[locId] || LOC.passStart;
  const half = parseFloat(G.params.get('patch') || '80');
  const MORE = { lake: ['iceCamp', 'ritual', 'bellTower'], mill: ['mill', 'waterfall'], hunterCabin: ['hunterCabin'], idol: ['idol'] };
  const sites = new Set(wild[0] === 'all' ? Object.keys(LOC).filter((k) => LOC[k].map) : wild.flatMap((w) => (MORE[w] || [w])).filter((w) => LOC[w]));
  if (spot?.loc) sites.add(spot.loc);
  if (!sites.size) sites.add(locId);
  for (const id of sites) patch(G, LOC[id].x, LOC[id].z, half);

  const { props, PropBatch } = await import('../../world/props/index.js');
  await props.preload?.();
  G.world.locations ||= {};
  const ctx = { props, PropBatch, fx: props.fx };
  const { build } = await import('../../world/locations/wilderness/index.js');
  await build(G, ctx, { only: wild[0] === 'all' ? [] : wild });

  const hour = parseFloat(G.params.get('hour'));
  if (spot) {
    if (!Number.isFinite(hour)) G.time.hours = spot.hour ?? 14.5;
    if (spot.weather && !G.params.get('weather')) G.weather?.set(spot.weather, 0);
    if (spot.aurora != null && G.sky) G.sky.auroraOverride = spot.aurora;
    G.camera.position.set(...spot.cam);
    G.camera.lookAt(...spot.look);
    if (spot.fov) { G.camera.fov = spot.fov; G.camera.updateProjectionMatrix(); }
  } else {
    const h = G.world.heightAt(L.x, L.z);
    G.camera.position.set(L.x + 14, h + 5, L.z + 18);
    G.camera.lookAt(L.x, h + 1, L.z);
  }
  G.cameraOwner = 'shot';
  window.__WILD = G.world.locations;
}
