// Time of day and the lighting rig. Driven by G.time.hours and the blended weather.
//
// Northern winter valley: sunrise ~7:00 (east-southeast), sun due south at noon (~22 degrees),
// sunset ~17:00 (west-southwest). Golden hour 15:00 to 17:00, blue hour 17:00 to 18:00, night
// 18:30 to 6:00 under a bright moon riding high in the south.
//
// Writes every frame: uSunDir (true sun, below the horizon at night), uSunColor (key light
// color times relative intensity, 1 ~ clear noon; moonlight at night), all fog uniforms,
// uWindowLight, uNight, G.time.sunAltitude (radians), scene.background (fallback).
//
// Public (G.atmosphere):
//   sun            DirectionalLight, the shadow-casting key. Follows the sun by day and the
//                  moon by night (one shadow map, crossfaded through twilight).
//   key            alias of sun
//   hemi           HemisphereLight, artistic fill (the sky environment map is the main ambient)
//   moon           { dir: Vector3, phase: 0..1 lit fraction }
//   shadowFocus    Vector3 the shadow frustum follows. Write it every frame (player rig) or
//                  leave it alone: it defaults to the ground in front of the camera.
//   setShadowFocus(v)  same as copying into shadowFocus
//   override       null or { amount: 0..1, exposure, tint: Color|[r,g,b], saturation,
//                  contrast, fogMul, fogColor: Color, sunMul, ambientMul } for cutscenes
//   look           the current blended palette (read-only, see sky/palette.js)
//   grade          { exposure, lift, gain, tint, sat, contrast, vignette, grain } for PostFX
//   keyDir, keyColor, keyIntensity, sunLightColor, moonDir, moonPhase (read-only)
//   lightLevel     0..1 rough scene brightness (for gameplay or audio)
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { sunDirection, moonDirection, MOON_PHASE } from './sky/astro.js';
import { createLook, samplePalette, applyWeather } from './sky/palette.js';
import { WEATHER_STATES } from './sky/weatherStates.js';
import { LAKE } from './layout.js';
import { patchShadowCascade, fitShadow, FAR_MARKER_RADIUS } from './sky/shadowCascade.js';
import { clamp, smoothstep, lerp } from '../core/util.js';

// Near and far shadow cascades blended in the light loop (see sky/shadowCascade.js).
const CASCADE_OK = patchShadowCascade();

const AURORA_TINT = new THREE.Color(0.1, 0.55, 0.32);

export async function init(G) {
  const U = G.uniforms;
  const scene = G.scene;
  const shadows = G.quality !== 'low';

  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.name = 'key';
  key.castShadow = shadows;
  const size = G.quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(size, size);
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 1.6;
  // Far cascade: a black light that only carries a coarse shadow map (see shadowCascade.js).
  // Added right after the key so it is directional shadow index 1.
  const far = new THREE.DirectionalLight(0x000000, 0);
  far.name = 'keyFarCascade';
  far.castShadow = shadows && CASCADE_OK;
  far.shadow.mapSize.set(size, size);
  far.shadow.bias = -0.00012;
  far.shadow.normalBias = 0.8;
  far.shadow.radius = FAR_MARKER_RADIUS;
  far.shadow.autoUpdate = false;
  const hemi = new THREE.HemisphereLight(0x8fb0ff, 0xd8ccc0, 0.3);
  hemi.name = 'hemi';
  scene.add(key, key.target, far, far.target, hemi);

  const look = createLook();
  const A = {
    sun: key, key, hemi, farCascade: far,
    moon: { dir: new THREE.Vector3(), phase: MOON_PHASE },
    shadowFocus: new THREE.Vector3(),
    override: null,
    look,
    grade: {
      exposure: 1, lift: new THREE.Color(), gain: new THREE.Color(1, 1, 1), tint: new THREE.Color(1, 1, 1),
      sat: 1, contrast: 1, vignette: 0.28, grain: 0.03,
    },
    keyDir: new THREE.Vector3(0, 1, 0),
    keyColor: new THREE.Color(1, 1, 1),
    keyIntensity: 0,
    sunLightColor: new THREE.Color(1, 0.9, 0.8),
    moonDir: new THREE.Vector3(0, 1, 0),
    moonPhase: MOON_PHASE,
    lightLevel: 1,
    shadowRadius: 70,
    setShadowFocus(v) { this.shadowFocus.copy(v); },
  };
  A.moon.dir = A.moonDir;
  G.atmosphere = A;

  const sunDir = new THREE.Vector3();
  const moonDir = A.moonDir;
  const shadowDir = new THREE.Vector3(0, 1, 0);
  const lastWritten = new THREE.Vector3(1e9, 0, 0);
  let manualFocus = 0;
  const fwd = new THREE.Vector3();
  const center = new THREE.Vector3();
  const tmp = new THREE.Color();
  const defaults = WEATHER_STATES.clear;

  const farFocus = new THREE.Vector3(1e9, 0, 0);
  const farDir = new THREE.Vector3(0, 1, 0);
  let farClock = 0;

  function updateShadowFrustum(dt) {
    // Focus: externally written this frame (rig), else the ground in front of the camera.
    if (!A.shadowFocus.equals(lastWritten)) manualFocus = 0.5;
    const cam = G.camera;
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    if (manualFocus > 0) {
      manualFocus -= dt;
    } else {
      A.shadowFocus.copy(cam.position).addScaledVector(fwd, A.shadowRadius * 0.55);
      const gy = G.world?.grid ? G.world.heightAt(A.shadowFocus.x, A.shadowFocus.z) : 0;
      A.shadowFocus.y = Math.min(cam.position.y, gy + 2);
    }
    lastWritten.copy(A.shadowFocus);
    fitShadow(key, A.shadowFocus, shadowDir, A.shadowRadius, 22, 500);

    // Far cascade: re-rendered only when the view or the sun moved enough, or every 3 s.
    if (far.castShadow) {
      farClock -= dt;
      center.copy(cam.position).addScaledVector(fwd, 650);
      center.y = cam.position.y;
      if (farClock <= 0 || center.distanceTo(farFocus) > 60 || farDir.angleTo(shadowDir) > 0.006) {
        farFocus.copy(center);
        farDir.copy(shadowDir);
        fitShadow(far, farFocus, farDir, 1000, 380, 3500);
        far.shadow.needsUpdate = true;
        farClock = 3;
      }
      far.shadow.intensity = key.shadow.intensity;
    }
  }

  G.addSystem('atmosphere', (dt) => {
    const h = G.time.hours;
    const W = G.weather?.params || defaults;
    const o = A.override;
    const ok = o ? clamp(o.amount ?? 1, 0, 1) : 0;

    sunDirection(h, sunDir);
    moonDirection(h, moonDir);
    U.uSunDir.value.copy(sunDir);
    const sunAlt = Math.asin(clamp(sunDir.y, -1, 1));
    G.time.sunAltitude = sunAlt;

    samplePalette(h, look);
    applyWeather(look, W);

    // Key light: the sun while it is near or above the horizon, the moon at night. Both are
    // nearly dark at the handover (around -3 degrees), so the switch is invisible.
    const useSun = sunDir.y > -0.05;
    const bodyDir = useSun ? sunDir : moonDir;
    const fade = useSun
      ? smoothstep(-0.02, 0.06, sunDir.y)
      : smoothstep(-0.06, -0.14, sunDir.y) * smoothstep(0.0, 0.12, moonDir.y);
    let keyI = look.keyI * fade;
    if (o && o.sunMul !== undefined) keyI *= lerp(1, o.sunMul, ok);
    A.keyIntensity = keyI;
    A.keyColor.copy(look.key);
    if (useSun) A.sunLightColor.copy(look.key);
    A.keyDir.copy(bodyDir);
    A.keyDir.y = Math.max(A.keyDir.y, 0.045);
    A.keyDir.normalize();
    // Step the shadow direction in small increments: a continuously turning light makes
    // shadow edges crawl; tiny discrete steps are invisible.
    if (shadowDir.angleTo(A.keyDir) > 0.0025) shadowDir.copy(A.keyDir);
    key.color.copy(look.key);
    key.intensity = keyI;
    key.shadow.intensity = clamp(W.shadow, 0, 1) * (useSun ? 1 : 0.8);
    key.shadow.radius = useSun ? 1.6 : 3.5;
    if (shadows) updateShadowFrustum(dt);
    else { key.position.copy(G.camera.position).addScaledVector(shadowDir, 500); key.target.position.copy(G.camera.position); key.target.updateMatrixWorld(); }
    U.uSunColor.value.copy(look.key).multiplyScalar(keyI / 18);

    // Night and window light.
    const night = h >= 12 ? smoothstep(17.2, 18.5, h) : 1 - smoothstep(5.5, 7.0, h);
    U.uNight.value = night;
    const evening = h >= 12 ? smoothstep(16.0, 17.5, h) : 1 - smoothstep(7.0, 8.5, h);
    U.uWindowLight.value = clamp(Math.max(evening, W.dim * 0.5 + W.overcast * 0.12), 0, 1);

    // Aurora faintly tints the snow and the night air green.
    const aur = (G.sky?.aurora || 0) * night;

    // Ambient: the sky environment map does most of the work; the hemisphere adds the warm snow
    // bounce from below and a little sky fill (values are radiance, hence the factor pi). Without
    // the sky module it carries the whole sky.
    const hasEnv = !!G.scene.environment;
    hemi.color.copy(look.hemiSky);
    if (!hasEnv) hemi.color.add(tmp.copy(look.zen).multiplyScalar(0.75)).add(tmp.copy(look.hor).multiplyScalar(0.25));
    if (aur > 0) hemi.color.add(tmp.copy(AURORA_TINT).multiplyScalar(aur * 0.012));
    hemi.groundColor.copy(look.hemiGround);
    let ambMul = 1;
    if (o && o.ambientMul !== undefined) ambMul = lerp(1, o.ambientMul, ok);
    hemi.intensity = Math.PI * ambMul;
    G.scene.environmentIntensity = ambMul;

    // Fog.
    let fogMul = 1;
    if (o && o.fogMul !== undefined) fogMul = lerp(1, o.fogMul, ok);
    U.uFogColor.value.copy(look.fog);
    if (aur > 0) U.uFogColor.value.add(tmp.copy(AURORA_TINT).multiplyScalar(aur * 0.004));
    U.uFogSunColor.value.copy(look.fogSun);
    if (o && o.fogColor) {
      U.uFogColor.value.lerp(o.fogColor, ok);
      U.uFogSunColor.value.lerp(o.fogColor, ok);
    }
    U.uFogDensity.value = W.fogDensity * fogMul;
    U.uFogHeightFalloff.value = W.fogFalloff;
    U.uFogBaseHeight.value = 0;
    U.uFogSunPower.value = 9;
    U.uFogSunWide.value = 0.32 * (1 - W.overcast * 0.8);
    U.uFogHaze.value.set(W.haze * fogMul, W.hazeFalloff);
    // A thin natural mist on the ice at dawn, even in clear weather.
    const dawnMist = smoothstep(5.0, 6.5, h) * (1 - smoothstep(8.5, 10.5, h)) * 0.004;
    const lakeD = Math.max(W.lake, dawnMist * (1 - W.overcast));
    const lakeTop = W.lake > dawnMist ? W.lakeTop : lerp(2.5, W.lakeTop, W.lake / Math.max(dawnMist, 1e-4));
    U.uFogLayer.value.set(lakeD * fogMul, lakeTop, W.lakeSoft, W.lakeNoise);
    U.uFogLayerArea.value.set(LAKE.x, LAKE.z, LAKE.rx * 1.15, LAKE.rz * 1.2);
    if (G.scene.background && G.scene.background.isColor) G.scene.background.copy(U.uFogColor.value);

    // Grade and exposure for PostFX (and the renderer fallback).
    const gr = A.grade;
    gr.exposure = look.exp;
    gr.lift.copy(look.lift);
    gr.gain.copy(look.gain);
    gr.sat = look.sat;
    gr.contrast = 1.0 + 0.06 * (1 - W.overcast) - 0.1 * W.fogWhite;
    gr.tint.copy(look.tint);
    gr.vignette = 0.3 + 0.1 * night;
    gr.grain = 0.025 + 0.02 * night;
    if (o) {
      if (o.exposure !== undefined) gr.exposure *= lerp(1, o.exposure, ok);
      if (o.saturation !== undefined) gr.sat *= lerp(1, o.saturation, ok);
      if (o.contrast !== undefined) gr.contrast *= lerp(1, o.contrast, ok);
      if (o.tint) {
        const t = Array.isArray(o.tint) ? tmp.setRGB(o.tint[0], o.tint[1], o.tint[2]) : o.tint;
        gr.tint.lerp(t, ok);
      }
    }
    G.renderer.toneMappingExposure = gr.exposure;
    A.lightLevel = clamp((keyI * Math.max(A.keyDir.y, 0) / Math.PI + look.zen.g + look.hor.g) * gr.exposure * 0.6, 0, 1);
  }, ORDER.atmosphere);
}
