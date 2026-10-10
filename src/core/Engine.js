// Renderer, scene, camera, and the main loop.
import * as THREE from 'three';
import { G, ORDER } from './G.js';
import { Input } from './Input.js';

export function createEngine(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: G.quality !== 'low',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: G.shot, // lets the harness read the canvas reliably
  });
  const maxPR = G.quality === 'high' ? 1.5 : G.quality === 'medium' ? 1.25 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = G.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.id = 'game-canvas';

  const scene = new THREE.Scene();
  // Any fog object enables USE_FOG; the actual model is in render/fogChunk.js.
  scene.fog = new THREE.FogExp2(0x9fb0c4, 0.001);
  scene.background = new THREE.Color(0x9fb0c4);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 9000);
  camera.position.set(0, 20, 200);
  scene.add(camera); // so camera-attached objects (particles, flares) render

  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;
  G.input = new Input(renderer.domElement);

  G.addSystem('input', (dt) => G.input.poll(dt), ORDER.input);
  G.addSystem('time', (dt) => G.time.update(dt), ORDER.time);

  const onResize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    G.events.emit('resize', { w, h });
  };
  window.addEventListener('resize', onResize);

  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  const stats = { fps: 0, calls: 0, triangles: 0, frame: 0 };
  window.__MZ_STATS = stats;

  // In shot mode, once loaded, cap the frame rate so idle harness pages do not burn the CPU that
  // other renders need. &fps=N overrides (use a higher value for animation contact sheets).
  const shotCap = G.shot ? parseFloat(G.params.get('fps') || '6') : 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (shotCap > 0 && window.__MZ_READY && now - last < 1000 / shotCap) return;
    let dt = (now - last) / 1000;
    last = now;
    if (G.shot && G.params.has('fixedDt')) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    G.clock.delta = dt;
    G.clock.elapsed += dt;
    G.clock.frame++;
    G.uniforms.uTime.value = G.clock.elapsed;

    for (const s of G.systems) {
      try { s.update(dt, G.clock.elapsed); } catch (e) {
        if (!s._errored) { console.error(`[system ${s.name}]`, e); s._errored = true; G.errors.push(`system ${s.name}: ${e.message}`); }
      }
    }

    renderer.info.reset();
    if (G.postfx && G.postfx.render) G.postfx.render(dt);
    else renderer.render(scene, camera);

    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.frame = G.clock.frame;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) { stats.fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  }

  return { start: () => requestAnimationFrame(frame) };
}
