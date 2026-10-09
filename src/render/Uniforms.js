// Global shader uniforms shared by reference across every patched material.
// Writers: Atmosphere (sun, fog, sky colors), Weather (wind, snowfall), Engine (time, camera),
// Player (player position), story endings (snowCover, spring), Senses (senses).
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  // Global winter amount on surfaces. 1 = deep winter. Thaw ending animates this to 0.
  uSnowCover: { value: 1 },
  // Spring greening amount 0..1 (grass growth, leaves). Animated after the snow melts.
  uSpring: { value: 0 },
  // Wind: xy = direction (unit, XZ plane), z = strength 0..1 (blizzard ~1), w = gust 0..1.
  uWind: { value: new THREE.Vector4(1, 0.3, 0.25, 0) },
  // Direction TO the sun (world space, normalized). Below horizon at night.
  uSunDir: { value: new THREE.Vector3(0.3, 0.25, 0.9).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.85, 0.65) },
  // Atmosphere / fog. See src/render/fogChunk.js.
  uFogColor: { value: new THREE.Color(0.62, 0.7, 0.8) },
  uFogSunColor: { value: new THREE.Color(1.0, 0.8, 0.6) },
  uFogDensity: { value: 0.0016 }, // base extinction per meter at fog base height
  uFogHeightFalloff: { value: 0.012 }, // per meter
  uFogBaseHeight: { value: 0 },
  uFogSunPower: { value: 8 },
  // 0..1 hunter senses blend (materials may brighten clues; post desaturates).
  uSenses: { value: 0 },
  uPlayerPos: { value: new THREE.Vector3() },
  // Snow particle density 0..1 (from weather), for materials that want wetness or darkening.
  uSnowfall: { value: 0 },
  // 0..1 how lit windows, lanterns and hearths are (Atmosphere drives it from the clock: dusk to dawn).
  uWindowLight: { value: 0 },
  // 0..1 night amount (Atmosphere), for materials that change at night (aurora tint, glows).
  uNight: { value: 0 },
};
