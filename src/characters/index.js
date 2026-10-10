// Characters module: factory, registry and the single update system (ORDER.characters).
//
//   import { createCharacter, createHorse } from '../characters/index.js';
//   const c = createCharacter('hanka');      // preset id or spec object (presets.js)
//   G.characters = { create, list, presets, mainCast, clips, createHorse, heightAt, stats }
//
// The system updates every live character once per frame with distance-based LOD:
//   lod 0 (< 14 m): full rate, foot IK, face, look-at, springs
//   lod 1 (< 32 m): full rate pose, springs, face; no foot IK
//   lod 2 (< 70 m): 15 Hz pose only;  lod 3: 6 Hz;  off-screen: 3 Hz
// Character API: see Character.js. Horse: see horse.js.
import * as THREE from 'three';
import { G, ORDER } from '../core/G.js';
import { Character } from './Character.js';
import { presetSpec, PRESET_IDS, MAIN_CAST } from './presets.js';
import { clipNames, registerClips, getClip } from './clips/index.js';
import { buildLibrary } from './clips/library.js';
import { buildFishing } from './clips/fishing.js';
import { createHorse as makeHorse } from './horse.js';

registerClips(buildLibrary);
registerClips(buildFishing);

const live = [];
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

export function createCharacter(idOrSpec, opts = {}) {
  const spec = typeof idOrSpec === 'string' ? presetSpec(idOrSpec) : { ...idOrSpec };
  if (!spec) throw new Error(`unknown character preset ${idOrSpec}`);
  if (opts.lowDetail) { spec.headRes = 'low'; spec.faceRes = 256; }
  const c = new Character(spec);
  if (opts.register !== false) live.push(c);
  return c;
}

export function createHorse(id = 'kasza', opts = {}) {
  const h = makeHorse(id, opts);
  if (opts.register !== false) live.push(h);
  return h;
}

function unregister(c) {
  const i = live.indexOf(c);
  if (i >= 0) live.splice(i, 1);
}

const stats = { updated: 0, total: 0 };

const fixedStep = parseFloat(G.params.get('animStep'));
function update(dt) {
  if (fixedStep > 0) dt = fixedStep; // debug: deterministic animation steps for contact sheets
  const cam = G.camera;
  if (!cam) return;
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  let n = 0;
  for (let i = 0; i < live.length; i++) {
    const c = live[i];
    if (c.disposed || !c.visible || !c.root.parent) continue;
    const p = c.root.position;
    const d = cam.position.distanceTo(p);
    _sphere.center.set(p.x, p.y + c.height * 0.5, p.z);
    _sphere.radius = c.height * 0.9;
    const onScreen = _frustum.intersectsSphere(_sphere);
    let lod, interval;
    if (!onScreen) { lod = 3; interval = 1 / 3; }
    else if (d < 14) { lod = 0; interval = 0; }
    else if (d < 32) { lod = 1; interval = 0; }
    else if (d < 70) { lod = 2; interval = 1 / 15; }
    else { lod = 3; interval = 1 / 6; }
    if (G.quality === 'low' && lod < 2 && d > 8) lod = 2;
    c._acc += dt;
    if (c._acc < interval) {
      // positions still advance for walkers between pose updates
      if (c._walk && c._follow) c._follow(dt, c._walk);
      continue;
    }
    const step = c._acc;
    c._acc = 0;
    c.lod = lod;
    c.update(Math.min(step, 0.25), { lod, distance: d });
    n++;
  }
  stats.updated = n;
  stats.total = live.length;
}

export async function init(G_) {
  G_.characters = {
    create: createCharacter,
    createHorse,
    list: live,
    presets: PRESET_IDS,
    mainCast: MAIN_CAST,
    clips: clipNames,
    heightAt: null, // optional ground override (x, z) -> y, used by gallery scenes
    stats,
    _unregister: unregister,
  };
  G_.addSystem('characters', update, ORDER.characters);
  // Bake the remaining clip blocks in idle time so the first attack or story beat never hitches.
  if (!G_.shot) {
    const names = clipNames();
    const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 50));
    const pump = (dl) => {
      while (names.length && dl.timeRemaining() > 4) getClip(names.shift());
      if (names.length) idle(pump);
    };
    setTimeout(() => idle(pump), 3000);
  }
}

export { Character, PRESET_IDS, MAIN_CAST };
