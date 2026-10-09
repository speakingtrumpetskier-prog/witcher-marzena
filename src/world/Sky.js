// Sky dome: gradient, sun disk and glow, twilight belt, stars and milky way, moon with phase,
// aurora curtains in the north, high cirrus and a lower stratocumulus deck that move with the
// wind, all fogged with the same model as the terrain (fogChunk.js), so they meet seamlessly.
// Also owns the environment map: a PMREM of the same sky (with a sunlit snow ground) that is the
// main ambient light of every lit material, refreshed on weather change and every few minutes.
//
// Public (G.sky):
//   mesh, material, uniforms     the dome (drawn at the far plane, after opaque geometry)
//   aurora                       current aurora strength 0..1 (auto: clear, dark nights)
//   auroraOverride               number 0..1 to force it (story), or null for automatic
//   cloudOffset, cirrusOffset    Vector2, accumulated wind drift of the layers
//   requestEnv()                 rebuild the environment map on the next frame
//   envTexture                   current PMREM texture (also set as scene.environment)
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { SKY_VERTEX, SKY_FRAGMENT } from './sky/skyShader.js';
import { getNoiseTexture } from './sky/noiseTex.js';
import { FOG_UNIFORM_NAMES } from '../render/fogChunk.js';
import { clamp, smoothstep, damp } from '../core/util.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export async function init(G) {
  const U = G.uniforms;
  const uniforms = {
    uNoise: { value: getNoiseTexture() },
    uZenith: { value: new THREE.Color(0.05, 0.15, 0.5) },
    uHorizon: { value: new THREE.Color(0.5, 0.55, 0.65) },
    uGlowColor: { value: new THREE.Color(1, 0.8, 0.6) },
    uGlowI: { value: 0.5 },
    uSunDisk: { value: new THREE.Color(30, 26, 20) },
    uSunVis: { value: 1 },
    uSunSize: { value: 0.0105 },
    uTwilight: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, 0.6, 0.8).normalize() },
    uMoonColor: { value: new THREE.Color(0.2, 0.21, 0.23) },
    uMoonPhase: { value: 0.82 },
    uMoonVis: { value: 1 },
    uStars: { value: 0 },
    uAurora: { value: 0 },
    uAuroraTime: { value: 0 },
    uCover: { value: 0.2 },
    uOvercast: { value: 0 },
    uCirrus: { value: 0.5 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCirrusOffset: { value: new THREE.Vector2() },
    uWindDir: { value: new THREE.Vector2(1, 0.3) },
    uCloudLit: { value: new THREE.Color(1, 0.95, 0.9) },
    uCloudShade: { value: new THREE.Color(0.4, 0.45, 0.55) },
    uEnvMode: { value: 0 },
    uGroundColor: { value: new THREE.Color(0.6, 0.62, 0.66) },
    uPixelAngle: { value: 0.001 },
    uSkyFog: { value: 0.8 },
    uTime: U.uTime,
  };
  for (const n of FOG_UNIFORM_NAMES) uniforms[n] = U[n];

  const material = new THREE.ShaderMaterial({
    name: 'mz-sky',
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const geo = new THREE.SphereGeometry(1000, 64, 32);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e6; // after opaque geometry: terrain hides most of it cheaply
  mesh.matrixAutoUpdate = false;
  // Follow whatever camera renders this frame (gameplay, cutscene, cube capture).
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.matrixWorld.makeTranslation(cam.position.x, cam.position.y, cam.position.z);
  };
  G.scene.add(mesh);

  // Environment capture: a separate scene with an env-mode copy of the sky.
  const envUniforms = { ...uniforms, uEnvMode: { value: 1 }, uStars: { value: 0 }, uPixelAngle: { value: 0.01 } };
  const envMaterial = material.clone();
  envMaterial.uniforms = envUniforms;
  const envMesh = new THREE.Mesh(geo, envMaterial);
  envMesh.frustumCulled = false;
  const envScene = new THREE.Scene();
  envScene.add(envMesh);
  const pmrem = new THREE.PMREMGenerator(G.renderer);
  const envSize = 64;
  let envRT = null;
  let envDirty = true;
  let envClock = 0;
  let lastEnvHours = -99;
  let lastEnvSig = 0;
  const envPos = new THREE.Vector3();

  const sky = {
    mesh, material, uniforms,
    aurora: 0,
    auroraOverride: null,
    cloudOffset: uniforms.uCloudOffset.value,
    cirrusOffset: uniforms.uCirrusOffset.value,
    envTexture: null,
    requestEnv() { envDirty = true; },
  };
  G.sky = sky;

  G.events.on('time:jump', () => { envDirty = true; });
  G.events.on('weather:change', () => { envDirty = true; });

  function rebuildEnv() {
    envPos.set(0, G.camera.position.y, 0);
    envMesh.position.copy(envPos);
    envMesh.updateMatrixWorld();
    const rt = pmrem.fromScene(envScene, 0, 1, 2000, { size: envSize, position: envPos });
    if (envRT) envRT.dispose();
    envRT = rt;
    sky.envTexture = rt.texture;
    G.scene.environment = rt.texture;
  }

  G.addSystem('sky', (dt) => {
    const A = G.atmosphere;
    const look = A?.look;
    const W = G.weather?.params;
    const night = U.uNight.value;
    const sunY = U.uSunDir.value.y;

    if (look) {
      uniforms.uZenith.value.copy(look.zen);
      uniforms.uHorizon.value.copy(look.hor);
      uniforms.uGlowColor.value.copy(look.glow);
      uniforms.uGlowI.value = 1;
      // The disk stays blinding even at sunset (bloom), but reddens with the key light color.
      uniforms.uSunDisk.value.copy(A.sunLightColor).multiplyScalar(30 + 40 * smoothstep(0.0, 0.35, sunY));
      // Lit cloud tops follow the key light; shaded undersides follow the sky.
      _c.copy(A.keyColor).multiplyScalar(A.keyIntensity * 0.1);
      uniforms.uCloudLit.value.copy(_c).add(_c2.copy(look.zen).multiplyScalar(0.5)).add(_c2.copy(look.hor).multiplyScalar(0.3));
      uniforms.uCloudShade.value.copy(look.hor).multiplyScalar(0.55).add(_c.copy(look.zen).multiplyScalar(0.45));
      // Overcast decks are lit evenly from above: their color is the overcast sky itself.
      const ovc = W ? W.overcast : 0;
      uniforms.uCloudShade.value.lerp(look.zen, ovc);
      uniforms.uCloudLit.value.lerp(_c.copy(look.zen).multiplyScalar(1.12), ovc * 0.8);
      // Sunlit snow below, for the environment map (snow albedo ~0.85).
      _c.copy(A.keyColor).multiplyScalar(A.keyIntensity * Math.max(A.keyDir.y, 0) / Math.PI);
      _c2.copy(look.hor).multiplyScalar(0.55).add(_c2.copy(look.zen).multiplyScalar(0.45));
      // Kept dim on purpose: three reads diffuse light from a very wide filtered lobe, so a bright
      // ground leaks into upward-facing surfaces. The hemisphere light carries the snow bounce.
      uniforms.uGroundColor.value.copy(_c).add(_c2).add(look.hemiSky).multiplyScalar(0.85 * 0.35);
      uniforms.uMoonDir.value.copy(A.moonDir);
      uniforms.uMoonPhase.value = A.moonPhase;
    }
    uniforms.uTwilight.value = smoothstep(-0.16, -0.04, sunY) * smoothstep(0.1, 0.0, sunY);
    const moonUp = smoothstep(-0.02, 0.04, uniforms.uMoonDir.value.y);
    uniforms.uMoonVis.value = moonUp;
    // Moon disk radiance: bright at night (exposure is high), a pale ghost in daylight.
    _c.setRGB(0.95, 0.97, 1.0).multiplyScalar(0.17);
    uniforms.uMoonColor.value.copy(_c);

    const cover = W ? W.cover : 0.2;
    const overcast = W ? W.overcast : 0;
    uniforms.uCover.value = cover;
    uniforms.uOvercast.value = overcast;
    uniforms.uCirrus.value = W ? W.cirrus : 0.5;
    uniforms.uSunVis.value = W ? W.sunVis : 1;
    const clearness = clamp(1 - Math.max(overcast, (cover - 0.3) * 1.4), 0, 1);
    uniforms.uStars.value = night * clearness * (W ? W.stars : 1) * 0.22;

    // Aurora: on clear, dark nights unless the story forces it.
    const autoTarget = night * clearness * (W ? W.aurora : 1);
    const target = typeof sky.auroraOverride === 'number' ? sky.auroraOverride : autoTarget;
    sky.aurora = G.shot ? target : damp(sky.aurora, target, 0.15, dt);
    uniforms.uAurora.value = sky.aurora * 0.45;
    uniforms.uAuroraTime.value += dt * (G.shot ? 0 : 1);
    if (G.shot && uniforms.uAuroraTime.value === 0) uniforms.uAuroraTime.value = 37;

    // Cloud drift with the wind (high layer faster, lower layer slower in uv units).
    const w = U.uWind.value;
    uniforms.uWindDir.value.set(w.x, w.y);
    const speed = (0.004 + 0.02 * w.z) * dt;
    uniforms.uCloudOffset.value.x += w.x * speed;
    uniforms.uCloudOffset.value.y += w.y * speed;
    uniforms.uCirrusOffset.value.x += w.x * speed * 0.6;
    uniforms.uCirrusOffset.value.y += w.y * speed * 0.6;

    const cam = G.camera;
    uniforms.uPixelAngle.value = THREE.MathUtils.degToRad(cam.fov) / Math.max(1, G.renderer.domElement.height);
    uniforms.uSkyFog.value = 0.18;

    // Environment map refresh: on demand, every 3 in-game minutes, or while the weather blends.
    envClock += dt;
    const hrs = G.time.hours;
    const sig = W ? W.cover * 3 + W.overcast * 5 + W.fogDensity * 400 + W.lake * 10 : 0;
    const hoursMoved = Math.abs(hrs - lastEnvHours) > 0.05 && Math.abs(hrs - lastEnvHours) < 23.9;
    const weatherMoved = Math.abs(sig - lastEnvSig) > 0.08;
    if (envDirty || ((hoursMoved || weatherMoved) && envClock > 1.5)) {
      rebuildEnv();
      envDirty = false;
      envClock = 0;
      lastEnvHours = hrs;
      lastEnvSig = sig;
    }
  }, ORDER.atmosphere + 2);
}
