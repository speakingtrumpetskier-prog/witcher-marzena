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
import { gwiazda } from './ui/wycinanki.js';
import { World } from './world/World.js';
import { FreeCam } from './debug/FreeCam.js';
import { Collision } from './core/Collision.js';
import { installDynamicRes } from './render/DynamicRes.js';
import { warmShaders } from './render/warmShaders.js';

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
// A paper-cut star turning slowly over the name while the valley builds.
loading?.querySelector('.loading-inner')?.prepend(gwiazda(5, { size: 76, cls: 'loading-wyc', color: '#b9402f' }));
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
  G.bootTimes = [];
  for (const [name, loader] of MODULES) {
    i++;
    if (!wanted.includes(name)) continue;
    setProgress(0.32 + (i / MODULES.length) * 0.6, `Loading ${name}`);
    const t0 = performance.now();
    try {
      const mod = await loader();
      if (mod.init) await mod.init(G);
    } catch (e) {
      console.error(`[module ${name}]`, e);
      G.errors.push(`module ${name}: ${e.message}`);
    }
    G.bootTimes.push([name, Math.round(performance.now() - t0)]);
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
  const tModules = performance.now();
  // Compile every material in the scene before the first frame. With parallel shader compile (most
  // desktop browsers) the GPU process does the work off the main thread, so the loading screen keeps
  // moving instead of the first frame freezing the page while it compiles everything at once.
  setProgress(0.94, 'Lighting the valley');
  await compileScene({ tick: true, creatures: !G.shot && !sceneName });
  const tCompiled = performance.now();
  setProgress(0.96, 'Lighting the valley');
  if (!G.shot) installDynamicRes(G);
  engine.start();

  const frames = parseInt(G.params.get('frames') || '4', 10);
  await waitFrames(frames);
  const tFirst = performance.now();

  // The story opens the title on game:ready. In normal play the loading screen stays over it until
  // the title owns the camera and every shader it needs is compiled, so the first thing on screen is
  // the title picture running smoothly, not the bare world stalling on its first frames.
  let loadingDone;
  G.loadingDone = new Promise((resolve) => { loadingDone = resolve; });
  G.events.emit('game:ready', {});
  if (!G.shot && !sceneName && !cam && !G.params.has('keepLoading')) await warmTitle();
  if (loading && !G.params.has('keepLoading')) {
    if (G.shot) loading.style.display = 'none';
    else loading.classList.add('hidden');
  }
  loadingDone();
  G.events.emit('loading:done', {});
  const slow = [...G.bootTimes].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, ms]) => `${n} ${ms}`).join(', ');
  const ms = (a, b) => Math.round(b - a);
  console.info(`[boot] ${Math.round(performance.now())} ms to the first picture: modules ${Math.round(tModules)}, compile ${ms(tModules, tCompiled)}, first frames ${ms(tCompiled, tFirst)}, title warm-up ${ms(tFirst, performance.now())} (slowest modules: ${slow})`);
  window.__MZ_ERRORS = G.errors;
  window.__MZ_READY = true;
}

function waitFrames(n) {
  const start = G.clock.frame;
  return new Promise((resolve) => {
    const tick = () => (G.clock.frame - start >= n ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One systems update without a render, so the scene is in its first-frame state before shaders are
// compiled: the sky has built its environment map (every lit program is keyed on it), and culling
// and LOD have put in the objects the first view needs.
function preTick() {
  for (const s of G.systems) {
    try { s.update(1 / 60, G.clock.elapsed); } catch (e) { console.warn(`[boot] pre-tick ${s.name}`, e); }
  }
}

async function compileScene({ tick = false, creatures = false } = {}) {
  if (tick) preTick();
  try {
    const r = await warmShaders(G, { creatures });
    if (r.pending) console.warn(`[boot] ${r.pending} shader programs still compiling after the warm-up`);
  } catch (e) { console.warn('[boot] shader warm-up', e); }
}

// Under the loading screen: wait for the title to take the camera, compile the scene's materials from
// that view without blocking the page (parallel shader compile where the browser has it), let the
// first frames build the shadow and post programs, then wait until frames come at a steady pace.
async function warmTitle() {
  const t0 = performance.now();
  while (G.cameraOwner !== 'title' && performance.now() - t0 < 5000) await sleep(50);
  setProgress(0.97, 'Lighting the valley');
  await compileScene();
  setProgress(0.99, 'Lighting the valley');
  await waitFrames(3);
  // Settled: the median of the last ten frames under 70 ms (the first draws with new programs and
  // textures run slow for a few seconds on integrated graphics), or give up after 15 s.
  const tSettle = performance.now();
  const recent = [];
  let last = performance.now();
  while (performance.now() - tSettle < 15000) {
    await waitFrames(1);
    const now = performance.now();
    recent.push(now - last);
    last = now;
    if (recent.length > 10) recent.shift();
    if (recent.length === 10 && [...recent].sort((a, b) => a - b)[5] < 70) break;
  }
}

boot().catch((e) => {
  console.error(e);
  G.errors.push(`boot: ${e.message}`);
  window.__MZ_ERRORS = G.errors;
  window.__MZ_READY = true;
  if (msg) msg.textContent = `Failed to start: ${e.message}`;
});
