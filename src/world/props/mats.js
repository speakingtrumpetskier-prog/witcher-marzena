// Material library for the props kit. Few shared materials (so PropBatch can merge hundreds of
// props into a handful of draw calls); variety comes from vertex colors, not from new materials.
//
//   getMat('wood', indoor)   cached MeshStandardMaterial. `indoor` drops the snow patch
//                            (props under a roof must not get snow on their upward faces).
//   MAT_INFO[name]           { tile (meters per UV unit), sway, base, noShadow } used by Kit.
//
// Special materials:
//   ribbon, cloth, dress   vertex sway through attribute aSway = (arc length m, amplitude, phase)
//   snowMound              lumpy geometric snow that shrinks with uSnowCover (attribute aBase)
//   lamp                   warm emissive that follows uWindowLight (lanterns, windows)
//   glow, coal             always-on fire glow (embers, braziers)
import * as THREE from 'three';
import { tex } from './tex.js';
import { addCompileHook } from '../../render/Materials.js';
import { U } from '../../render/Uniforms.js';

export const MAT_INFO = {
  wood: { tile: 0.9 },
  planks: { tile: 1.0 },
  bark: { tile: 0.55 },
  logEnd: { tile: 1.0 },
  birch: { tile: 0.7 },
  straw: { tile: 0.6 },
  rope: { tile: 0.16 },
  linen: { tile: 0.7 },
  burlap: { tile: 0.7 },
  dress: { tile: 1.0, sway: true },
  iron: { tile: 0.6 },
  stone: { tile: 0.9 },
  fur: { tile: 0.6 },
  ice: { tile: 0.7 },
  paint: { tile: 0.9 },
  face: { tile: 0.45 },
  fish: { tile: 1.0 },
  water: { tile: 1.0, noShadow: true },
  clay: { tile: 0.5 },
  folk: { tile: 1.0 },
  net: { tile: 0.34, noShadow: true },
  wicker: { tile: 0.5 },
  matte: { tile: 1.0 },
  cloth: { tile: 0.7, sway: true },
  ribbon: { tile: 1.0, sway: true },
  snowMound: { tile: 0.8, base: true },
  lamp: { tile: 1.0, noShadow: true },
  glow: { tile: 1.0, noShadow: true },
  coal: { tile: 0.3, noShadow: true },
  decal: { tile: 1.0, noShadow: true },
};

const SNOW_DEFAULT = { amount: 1, threshold: 0.62 };

// [texture generator, standard params, snow config or null]
const DEFS = {
  wood: () => [tex.wood(), { roughness: 0.92 }, { amount: 0.85, threshold: 0.62 }, { bump: 1.4 }],
  planks: () => [tex.planks(), { roughness: 0.92 }, { amount: 0.85, threshold: 0.62 }, { bump: 1.4 }],
  bark: () => [tex.bark(), { roughness: 0.97 }, { amount: 1, threshold: 0.58 }, { bump: 2.0 }],
  logEnd: () => [tex.logEnd(), { roughness: 0.95 }, { amount: 1, threshold: 0.7 }, { bump: 1.2 }],
  birch: () => [tex.birch(), { roughness: 0.85 }, { amount: 0.9, threshold: 0.6 }, { bump: 1.0 }],
  straw: () => [tex.straw(), { roughness: 0.98, side: THREE.DoubleSide }, { amount: 0.9, threshold: 0.5 }, { bump: 1.6 }],
  rope: () => [tex.rope(), { roughness: 0.98 }, { amount: 0.5, threshold: 0.8 }, { bump: 1.5 }],
  linen: () => [tex.linen(), { roughness: 0.96 }, { amount: 0.8, threshold: 0.6 }, { bump: 0.8 }],
  burlap: () => [tex.burlap(), { roughness: 0.98 }, { amount: 0.9, threshold: 0.55 }, { bump: 1.2 }],
  dress: () => [tex.dress(), { roughness: 0.95, side: THREE.DoubleSide }, { amount: 0.55, threshold: 0.7 }, {}],
  iron: () => [tex.iron(), { roughness: 0.55, metalness: 0.35 }, { amount: 0.85, threshold: 0.78 }, { bump: 1.0, frost: true }],
  stone: () => [tex.stone(), { roughness: 0.93 }, { amount: 1, threshold: 0.55 }, { bump: 2.0 }],
  fur: () => [tex.fur(), { roughness: 0.98 }, { amount: 0.7, threshold: 0.65 }, { bump: 1.5 }],
  ice: () => [tex.ice(), { roughness: 0.12, metalness: 0.0, emissive: new THREE.Color(0x24465a), emissiveIntensity: 0.35 }, null, { bump: 0.6 }],
  paint: () => [tex.paint(), { roughness: 0.85 }, { amount: 1, threshold: 0.62 }, { bump: 1.2 }],
  face: () => [tex.paint(), { roughness: 0.8 }, null, { bump: 0.8 }],
  water: () => [null, { roughness: 0.05, metalness: 0.0 }, null, {}],
  fish: () => [tex.fish(), { roughness: 0.4, side: THREE.DoubleSide }, null, {}],
  clay: () => [tex.clay(), { roughness: 0.85 }, { amount: 1, threshold: 0.6 }, {}],
  folk: () => [tex.folk(), { roughness: 1.0, side: THREE.DoubleSide }, null, {}],
  wicker: () => [tex.wicker(), { roughness: 0.95 }, { amount: 0.9, threshold: 0.6 }, { bump: 1.6 }],
  net: () => [tex.net(), { roughness: 1.0, side: THREE.DoubleSide, alphaTest: 0.5 }, null, {}],
  matte: () => [null, { roughness: 0.95 }, { amount: 1, threshold: 0.62 }, {}],
  cloth: () => [tex.linen(), { roughness: 0.96, side: THREE.DoubleSide }, { amount: 0.5, threshold: 0.75 }, { bump: 0.8 }],
  ribbon: () => [null, { roughness: 0.9, side: THREE.DoubleSide }, null, {}],
  snowMound: () => [tex.snow(), { roughness: 0.88 }, null, { bump: 0.8 }],
  lamp: () => [null, { roughness: 0.4, color: 0x2a1a0a, emissive: new THREE.Color(1.0, 0.62, 0.26), emissiveIntensity: 2.4 }, null, {}],
  glow: () => [null, { roughness: 0.6, color: 0x1a0c04, emissive: new THREE.Color(1.0, 0.45, 0.12), emissiveIntensity: 2.6 }, null, {}],
  decal: () => [tex.patch(), { roughness: 1.0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, null, {}],
  coal: () => [tex.coal(), { roughness: 0.9, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 2.2 }, null, {}],
};

const SWAY_VERT_PARS = /* glsl */ `
attribute vec3 aSway;
uniform float uTime;
uniform vec4 uWind;
`;

// aSway = (arc length from the tie point in meters, amplitude, phase). Cloth hangs along -Y in
// object space; wind tilts it downwind and ripples it. Works on merged (world space) geometry.
const SWAY_VERT = /* glsl */ `
{
  float mzS = aSway.x, mzAmp = aSway.y, mzPh = aSway.z;
  if (mzAmp > 0.0) {
    vec2 mzW2 = uWind.xy;
    float mzWl = length(mzW2);
    mzW2 = mzWl > 1e-4 ? mzW2 / mzWl : vec2(1.0, 0.0);
    float mzStr = clamp(uWind.z, 0.0, 1.0);
    float mzFl = sin(uTime * 3.1 + mzS * 4.0 + mzPh) * 0.5 + sin(uTime * 6.3 + mzS * 8.5 + mzPh * 1.7) * 0.25;
    float mzTh = mzAmp * (0.10 + mzStr * 0.95 + uWind.w * 0.35) * (0.7 + 0.5 * mzFl);
    mzTh = clamp(mzTh, 0.0, 1.45) * (1.0 - exp(-mzS * 2.2));
    float mzOffH = mzS * sin(mzTh) * 0.9;
    float mzOffY = mzS * (1.0 - cos(mzTh)) * 0.9;
    float mzSide = sin(uTime * 4.6 + mzS * 7.0 + mzPh * 2.3) * 0.06 * mzS * (0.25 + mzStr) * mzAmp;
    vec3 mzOffW = vec3(mzW2.x * mzOffH - mzW2.y * mzSide, mzOffY, mzW2.y * mzOffH + mzW2.x * mzSide);
    float mzSc2 = max(dot(modelMatrix[0].xyz, modelMatrix[0].xyz), 1e-4);
    transformed += (mzOffW * mat3(modelMatrix)) / mzSc2;
  }
}
`;

function addSway(m) {
  addCompileHook(m, 'sway', (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.vertexShader = SWAY_VERT_PARS + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY_VERT);
  });
}

function addMound(m) {
  addCompileHook(m, 'mound', (shader) => {
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.vertexShader = 'attribute vec3 aBase;\nuniform float uSnowCover;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n transformed = mix(aBase, transformed, smoothstep(0.0, 0.55, uSnowCover));',
    );
  });
}

// Lamp emissive follows uWindowLight (dusk to dawn); dim but not black by day.
function addLamp(m) {
  addCompileHook(m, 'lamp', (shader) => {
    shader.uniforms.uWindowLight = U.uWindowLight;
    shader.fragmentShader = 'uniform float uWindowLight;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= mix(0.12, 1.0, uWindowLight);',
    );
  });
}

// Embers pulse slowly; emissive map = albedo map so only the cracks glow.
function addCoal(m) {
  addCompileHook(m, 'coal', (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 0.7 + 0.3 * sin(uTime * 2.1 + vMapUv.x * 23.0 + vMapUv.y * 17.0) * sin(uTime * 3.7 + vMapUv.y * 29.0);',
    );
  });
}

// Rime on metal and ice: pale crystalline fringe at grazing angles, scaled by uSnowCover.
function addFrost(m) {
  addCompileHook(m, 'frost', (shader) => {
    shader.uniforms.uSnowCover = U.uSnowCover;
    const decl = shader.fragmentShader.includes('uniform float uSnowCover') ? '' : 'uniform float uSnowCover;\n';
    shader.fragmentShader = decl + shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        float mzG = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        vec2 mzP = vMapUv * 26.0;
        vec2 mzI = floor(mzP), mzFr = fract(mzP);
        mzFr = mzFr * mzFr * (3.0 - 2.0 * mzFr);
        float mzA = fract(sin(dot(mzI, vec2(12.9898, 78.233))) * 43758.5453);
        float mzB = fract(sin(dot(mzI + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
        float mzC = fract(sin(dot(mzI + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
        float mzD = fract(sin(dot(mzI + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
        float mzN = mix(mix(mzA, mzB, mzFr.x), mix(mzC, mzD, mzFr.x), mzFr.y);
        float mzF = smoothstep(0.55, 1.0, mzG + (mzN - 0.5) * 0.5) * uSnowCover * 0.55;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.84, 0.93), mzF);
        roughnessFactor = mix(roughnessFactor, 0.75, mzF);
      }`,
    );
  });
}

const cache = new Map();

export function getMat(name, indoor = false) {
  const key = name + (indoor ? '|i' : '');
  let m = cache.get(key);
  if (m) return m;
  const def = DEFS[name];
  if (!def) throw new Error(`props: unknown material ${name}`);
  const [t, params, snow, extra] = def();
  m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
  if (t) {
    m.map = t.map;
    if (t.bump && extra.bump) { m.bumpMap = t.bump; m.bumpScale = extra.bump; }
    if (name === 'coal') m.emissiveMap = t.map;
  }
  if (snow && !indoor) m.userData.snow = { ...SNOW_DEFAULT, ...snow };
  m.name = name;
  if (name === 'ribbon' || name === 'cloth' || name === 'dress') addSway(m);
  if (name === 'snowMound') addMound(m);
  if (name === 'lamp') addLamp(m);
  if (name === 'coal') addCoal(m);
  if (extra.frost && !indoor) addFrost(m);
  cache.set(key, m);
  return m;
}

export function disposeMats() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
