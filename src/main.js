// Bootstrap: engine, world grid, then every module through isolated dynamic imports so one
// broken module never takes the whole game down (its error shows on the loading screen).
//
// URL parameters (see docs/ARCHITECTURE.md "Test hooks"):
//   ?shot                deterministic screenshot mode (no title, no audio, frozen clock)
//   &cam=x,y,z&look=x,y,z&fov=55   fixed camera
//   &hour=15.5&weather=clear       time of day and weather
//   &only=terrain,sky    load only these modules (core always loads)
//   &skip=vegetation     skip modules
//   &scene=name          load src/debug/scenes/<name>.js instead of the world content
//   &frames=4            frames to render before signalling ready
//   &quality=low|medium|high
//   ?debug               fly camera available on F1
import './styles.css';
import * as THREE from 'three';
import { G } from './core/G.js';
import { createEngine } from './core/Engine.js';
import { installMaterialPatches } from './render/Materials.js';
import { World } from './world/World.js';
import { FreeCam } from './debug/FreeCam.js';
import { Collision } from './core/Collision.js';

installMaterialPatches();

const MODULES = [
  ['atmosphere', () => import('./world/Atmosphere.js')],
  ['sky', () => import('./world/Sky.js')],
  ['terrain', () => import('./world/Terrain.js')],
  ['water', () => import('./world/Water.js')],
  ['rocks', () => import('./world/Rocks.js')],
  ['weather', () => import('./world/Weather.js')],
  ['spirits', () => import('./world/Spirits.js')],
  ['vegetation', () => import('./world/Vegetation.js')],
  ['locations', () => import('./world/locations/index.js')],
  ['characters', () => import('./characters/index.js')],
  ['ui', () => import('./ui/UI.js')],
  ['audio', () => import('./audio/Audio.js')],
  ['gameplay', () => import('./gameplay/index.js')],
  ['story', () => import('./story/index.js')],
  ['postfx', () => import('./render/PostFX.js')],
];
const SCENE_DEFAULT_MODULES = ['atmosphere', 'sky', 'postfx'];

const loading = document.getElementById('loading');
const bar = document.getElementById('loading-bar');
const msg = document.getElementById('loading-msg');
const setProgress = (p, text) => {
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  if (msg && text) msg.textContent = text;
};

function parseVec(s) {
  if (!s) return null;
  const v = s.split(',').map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? new THREE.Vector3(...v) : null;
}

async function boot() {
  const container = document.getElementById('app');
  const engine = createEngine(container);
  G.readyGates = [];

  if (G.shot) {
    G.time.scale = 0;
    G.cameraOwner = 'shot';
  }
  const hour = parseFloat(G.params.get('hour'));
  if (Number.isFinite(hour)) G.time.hours = hour;

  const sceneName = G.params.get('scene');
  let wanted = MODULES.map((m) => m[0]);
  let sceneMod = null;
  if (sceneName) {
    try {
      sceneMod = await import(/* @vite-ignore */ `./debug/scenes/${sceneName}.js`);
      wanted = sceneMod.modules || SCENE_DEFAULT_MODULES;
    } catch (e) {
      G.errors.push(`scene ${sceneName}: ${e.message}`);
      console.error(e);
    }
  }
  const only = G.params.get('only');
  if (only) wanted = only.split(',');
  const skip = (G.params.get('skip') || '').split(',');
  wanted = wanted.filter((n) => !skip.includes(n));

  // World grid first: everyone needs heights.
  G.world = new World();
  G.physics = new Collision(G.world);
  const needsWorld = !sceneName || wanted.includes('terrain') || sceneMod?.needsWorld;
  if (needsWorld) {
    setProgress(0.02, 'Shaping the valley');
    const res = parseInt(G.params.get('gridRes') || '385', 10);
    await G.world.build(res, (p) => setProgress(0.02 + p * 0.3));
  }

  let i = 0;
  for (const [name, loader] of MODULES) {
    i++;
    if (!wanted.includes(name)) continue;
    setProgress(0.32 + (i / MODULES.length) * 0.6, `Loading ${name}`);
    try {
      const mod = await loader();
      if (mod.init) await mod.init(G);
    } catch (e) {
      console.error(`[module ${name}]`, e);
      G.errors.push(`module ${name}: ${e.message}`);
    }
  }

  if (sceneMod?.init) {
    try { await sceneMod.init(G); } catch (e) { console.error(e); G.errors.push(`scene init: ${e.message}`); }
  }

  // Fixed camera for screenshots.
  const cam = parseVec(G.params.get('cam'));
  const look = parseVec(G.params.get('look'));
  const fov = parseFloat(G.params.get('fov'));
  if (cam) {
    G.cameraOwner = 'shot';
    G.camera.position.copy(cam);
    if (look) G.camera.lookAt(look);
    if (Number.isFinite(fov)) { G.camera.fov = fov; G.camera.updateProjectionMatrix(); }
  }

  // Debug fly camera: always available with ?debug, and the fallback when nothing owns the camera.
  const fly = new FreeCam(G);
  if (G.debug || (!G.cameraRig && !G.shot && !cam && !sceneName)) fly.enable();

  await Promise.all(G.readyGates.map((p) => p.catch((e) => G.errors.push(`gate: ${e.message}`))));
  setProgress(1, 'Ready');
  engine.start();

  const frames = parseInt(G.params.get('frames') || '4', 10);
  const startFrame = G.clock.frame;
  const waitFrames = () => new Promise((resolve) => {
    const tick = () => (G.clock.frame - startFrame >= frames ? resolve() : requestAnimationFrame(tick));
    tick();
  });
  await waitFrames();
  if (loading && !G.params.has('keepLoading')) {
    if (G.shot) loading.style.display = 'none';
    else loading.classList.add('hidden');
  }
  G.events.emit('game:ready', {});
  window.__MZ_ERRORS = G.errors;
  window.__MZ_READY = true;
}

boot().catch((e) => {
  console.error(e);
  G.errors.push(`boot: ${e.message}`);
  window.__MZ_ERRORS = G.errors;
  window.__MZ_READY = true;
  if (msg) msg.textContent = `Failed to start: ${e.message}`;
});
