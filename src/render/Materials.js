// Global material patching. Imported once at startup (main.js) BEFORE any material compiles.
//
// Every built-in material with fog enabled gets the custom height fog (fogChunk.js).
// Materials opt into extra features through userData, set before first render:
//
//   mat.userData.snow = { amount: 1, threshold: 0.55, color: new THREE.Color(...) }
//   mat.userData.wind = { type: 'tree' | 'grass' | 'cloth', strength: 1, height: 8 }
//
// Snow needs a lit material (Standard, Physical, Lambert, Phong). Wind works on any.
// For wind-swayed shadows, give the mesh a customDepthMaterial with the same userData.wind:
//   mesh.customDepthMaterial = windDepthMaterial(mat.userData.wind)
//
// NEVER assign material.onBeforeCompile directly: it would bypass this patch.
// Use addCompileHook(mat, 'uniqueKey', (shader) => {...}) instead.
import * as THREE from 'three';
import { U } from './Uniforms.js';
import { FOG_PARS_VERTEX, FOG_VERTEX, FOG_PARS_FRAGMENT, FOG_FRAGMENT, FOG_UNIFORM_NAMES } from './fogChunk.js';
import {
  SNOW_PARS_VERTEX, SNOW_VERTEX, SNOW_PARS_FRAGMENT, SNOW_COLOR_FRAGMENT, SNOW_ROUGHNESS_FRAGMENT,
} from './snowChunk.js';
import { WIND_PARS_VERTEX, WIND_VERTEX_TREE, WIND_VERTEX_GRASS, WIND_VERTEX_CLOTH } from './windChunk.js';

const DEFAULT_SNOW_COLOR = new THREE.Color(0.93, 0.94, 0.96);

function replaceOnce(src, needle, replacement) {
  return src.includes(needle) ? src.replace(needle, replacement) : src;
}

export function patchShader(material, shader) {
  const ud = material.userData || {};
  let vs = shader.vertexShader;
  let fs = shader.fragmentShader;

  // Fog: replace three's fog chunks wherever they appear.
  if (fs.includes('#include <fog_fragment>')) {
    for (const n of FOG_UNIFORM_NAMES) shader.uniforms[n] = U[n];
    vs = replaceOnce(vs, '#include <fog_pars_vertex>', FOG_PARS_VERTEX);
    vs = replaceOnce(vs, '#include <fog_vertex>', FOG_VERTEX);
    fs = replaceOnce(fs, '#include <fog_pars_fragment>', FOG_PARS_FRAGMENT);
    fs = replaceOnce(fs, '#include <fog_fragment>', FOG_FRAGMENT);
  }

  // Wind sway (vertex).
  if (ud.wind && vs.includes('#include <begin_vertex>')) {
    const w = ud.wind;
    const mu = (ud._mzU ||= {});
    mu.uMzWindStrength ||= { value: w.strength ?? 1 };
    mu.uMzWindHeight ||= { value: w.height ?? 8 };
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.uniforms.uPlayerPos = U.uPlayerPos;
    shader.uniforms.uMzWindStrength = mu.uMzWindStrength;
    shader.uniforms.uMzWindHeight = mu.uMzWindHeight;
    const body = w.type === 'grass' ? WIND_VERTEX_GRASS : w.type === 'cloth' ? WIND_VERTEX_CLOTH : WIND_VERTEX_TREE;
    vs = WIND_PARS_VERTEX + vs;
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  }

  // Snow accumulation (needs objectNormal, i.e. a lit material).
  if (ud.snow && vs.includes('#include <beginnormal_vertex>') && fs.includes('#include <color_fragment>')) {
    const s = ud.snow === true ? {} : ud.snow;
    const mu = (ud._mzU ||= {});
    mu.uMzSnowAmount ||= { value: s.amount ?? 1 };
    mu.uMzSnowThreshold ||= { value: s.threshold ?? 0.55 };
    mu.uMzSnowColor ||= { value: (s.color || DEFAULT_SNOW_COLOR).clone() };
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.uniforms.uMzSnowAmount = mu.uMzSnowAmount;
    shader.uniforms.uMzSnowThreshold = mu.uMzSnowThreshold;
    shader.uniforms.uMzSnowColor = mu.uMzSnowColor;
    vs = SNOW_PARS_VERTEX + vs;
    vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + SNOW_VERTEX);
    fs = SNOW_PARS_FRAGMENT + fs;
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + SNOW_COLOR_FRAGMENT);
    if (fs.includes('#include <roughnessmap_fragment>')) {
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + SNOW_ROUGHNESS_FRAGMENT);
    }
  }

  shader.vertexShader = vs;
  shader.fragmentShader = fs;

  // User hooks registered with addCompileHook run last.
  if (ud._mzHooks) for (const h of ud._mzHooks) h.fn(shader, material);
}

function cacheKey(material) {
  const ud = material.userData || {};
  let k = 'mz2';
  if (ud.snow) k += '|s';
  if (ud.wind) k += '|w' + (ud.wind.type || 'tree');
  if (ud._mzHooks) k += '|h' + ud._mzHooks.map((h) => h.key).join(',');
  return k;
}

let installed = false;
export function installMaterialPatches() {
  if (installed) return;
  installed = true;
  THREE.Material.prototype.onBeforeCompile = function (shader) { patchShader(this, shader); };
  THREE.Material.prototype.customProgramCacheKey = function () { return cacheKey(this); };
}

// Register an extra shader modification on one material. `key` must be unique per variant
// (it becomes part of the program cache key).
export function addCompileHook(material, key, fn) {
  const ud = material.userData;
  (ud._mzHooks ||= []).push({ key, fn });
  material.needsUpdate = true;
  return material;
}

// Live access to per-material uniforms created by the patch (e.g. animate snow amount).
export function materialUniforms(material) {
  return (material.userData._mzU ||= {});
}

// Convenience constructor: a MeshStandardMaterial with snow/wind options.
export function standard(params = {}, { snow = null, wind = null } = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  if (snow) m.userData.snow = snow === true ? {} : snow;
  if (wind) m.userData.wind = wind;
  return m;
}

// Depth material for shadow casting of wind-animated meshes.
export function windDepthMaterial(wind) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.userData.wind = wind;
  return m;
}
