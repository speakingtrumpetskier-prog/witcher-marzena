// Vegetation materials: one Lambert material family with a shared shader hook (via
// addCompileHook, never onBeforeCompile). Owner: vegetation builder.
//
// What the hook adds on top of the global fog and wind patches:
//   - screen-door LOD dither (uniform uMzLod = in start, in end, out start, out end, in meters),
//     so two LOD meshes of the same tree swap without a visible pop
//   - needle fringe (ragged frond edges from uv.x) for foliage
//   - snow: vertex attribute aSnow scaled by uSnowCover, broken up by world noise, only on the
//     front (upper) face of double sided strips, so undersides stay green and dark
//   - procedural birch bark marks, spring greening for grass and reeds, a soft translucency glow
//
// Public: makeVegMaterial(opts), makeDepthMaterial(wind, opts), lodUniform(), setLod(u, ...)
import * as THREE from 'three';
import { addCompileHook, windDepthMaterial } from '../../render/Materials.js';
import { U } from '../../render/Uniforms.js';

// A fresh uniform object for one (kind, LOD) pair. Values are written by the registry.
export function lodUniform() {
  return { value: new THREE.Vector4(-2, -1, 1e5, 1e5 + 10) };
}

// Set the fade ranges. inStart/inEnd: fade in between these distances (use -2,-1 for no fade in).
// outStart/outEnd: fade out (use 1e5, 1e5 + 10 for no fade out).
export function setLod(u, inStart, inEnd, outStart, outEnd) {
  u.value.set(inStart ?? -2, inEnd ?? -1, outStart ?? 1e5, outEnd ?? 1e5 + 10);
}

const HEADER_V = /* glsl */ `
attribute float aSnow;
varying float vVegSnow;
varying vec2 vVegUv;
varying vec3 vVegWPos;
varying float vVegLodD;
varying float vVegHash;
varying float vVegSeed;
varying float vVegH;
`;

const BODY_V = /* glsl */ `
{
  vVegSnow = aSnow;
  vVegUv = uv;
  vVegSeed = aWind.y;
  vVegH = position.y;
  mat4 mzVm = modelMatrix;
  vec3 mzIw = vec3(0.0);
  #ifdef USE_INSTANCING
    mzVm = modelMatrix * instanceMatrix;
    mzIw = instanceMatrix[3].xyz;
  #endif
  vVegWPos = (mzVm * vec4(position, 1.0)).xyz;
  vec3 mzIwW = (modelMatrix * vec4(mzIw, 1.0)).xyz;
  vVegLodD = distance(cameraPosition, mzIwW);
  vVegHash = fract(sin(dot(mzIwW.xz, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

const HEADER_F = /* glsl */ `
uniform float uSnowCover;
uniform float uSpring;
uniform vec4 uMzLod;
uniform vec3 uVegSpring;
uniform vec3 uVegSnowCol;
uniform vec3 uVegSunDir;
uniform vec3 uVegSunCol;
varying float vVegSnow;
varying vec2 vVegUv;
varying vec3 vVegWPos;
varying float vVegLodD;
varying float vVegHash;
varying float vVegSeed;
varying float vVegH;

float vegHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vegNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vegHash(i), vegHash(i + vec2(1.0, 0.0)), f.x), mix(vegHash(i + vec2(0.0, 1.0)), vegHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// mode: 'foliage' | 'bark' | 'birch' | 'grass' | 'cards'
function bodyF(mode, fade) {
  let s = '';
  if (fade) {
    s += `
  {
    float mzIn = smoothstep(uMzLod.x, uMzLod.y, vVegLodD);
    float mzOut = smoothstep(uMzLod.z, uMzLod.w, vVegLodD);
    float mzD = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + vVegHash);
    if (mzD < mzOut || mzD >= mzIn) discard;
  }`;
  }
  if (mode === 'foliage') {
    s += `
  {
    float mzE = abs(vVegUv.x);
    float mzTooth = vegHash(vec2(floor(vVegUv.y * 22.0), vVegSeed * 7.13));
    if (mzE > 0.9 + 0.3 * mzTooth - 0.1 * vVegUv.y) discard;
  }
  {
    float mzN = vegNoise(vVegWPos.xz * 3.1 + vVegWPos.y * 1.3);
    diffuseColor.rgb *= 0.78 + 0.44 * mzN;
    float mzSn = vVegSnow * uSnowCover * (gl_FrontFacing ? 1.0 : 0.0);
    float mzCl = vegNoise(vVegWPos.xz * 1.7 + vVegWPos.y * 0.6) * 0.65 + vegNoise(vVegWPos.xz * 6.0) * 0.35;
    mzSn = smoothstep(0.30, 0.58, mzSn + (mzCl - 0.5) * 0.55);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVegSnowCol, mzSn);
  }`;
  } else if (mode === 'bark') {
    s += `
  {
    float mzN = vegNoise(vVegWPos.xz * 5.0 + vVegWPos.y * 2.2);
    diffuseColor.rgb *= 0.8 + 0.4 * mzN;
    float mzSn = vVegSnow * uSnowCover * (gl_FrontFacing ? 1.0 : 0.0);
    float mzCl = vegNoise(vVegWPos.xz * 2.3 + vVegWPos.y * 0.8);
    mzSn = smoothstep(0.35, 0.6, mzSn + (mzCl - 0.5) * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVegSnowCol, mzSn);
  }`;
  } else if (mode === 'birch') {
    s += `
  {
    float mzU = vVegUv.x, mzV = vVegUv.y;
    float mzRow = floor(mzV / 0.14 + vVegSeed);
    float mzFr = fract(mzV / 0.14 + vVegSeed);
    float mzA = vegHash(vec2(mzRow, 3.1)), mzB = vegHash(vec2(mzRow, 9.7)), mzC = vegHash(vec2(mzRow, 21.3));
    float mzDu = abs(fract(mzU - mzA + 0.5) - 0.5);
    float mzMark = (1.0 - smoothstep(0.03 + 0.2 * mzB, 0.06 + 0.24 * mzB, mzDu)) * (1.0 - smoothstep(0.1 + 0.12 * mzC, 0.2 + 0.14 * mzC, abs(mzFr - 0.5)));
    mzMark *= step(0.28, vegHash(vec2(mzRow, 5.5)));
    // a second, thinner scar band
    float mzDu2 = abs(fract(mzU * 1.0 - mzB + 0.5) - 0.5);
    mzMark = max(mzMark, (1.0 - smoothstep(0.02, 0.07, mzDu2)) * (1.0 - smoothstep(0.04, 0.1, abs(mzFr - 0.25))) * step(0.55, mzC));
    float mzBase = 1.0 - smoothstep(0.5, 1.5, mzV);
    float mzG = vegNoise(vec2(mzU * 9.0, mzV * 6.0));
    vec3 mzDark = vec3(0.012, 0.01, 0.01);
    diffuseColor.rgb *= 0.86 + 0.2 * mzG;
    diffuseColor.rgb = mix(diffuseColor.rgb, mzDark, clamp(mzMark * 0.92 + mzBase * (0.55 + 0.4 * mzG), 0.0, 1.0));
    float mzSn = vVegSnow * uSnowCover * (gl_FrontFacing ? 1.0 : 0.0);
    mzSn = smoothstep(0.35, 0.6, mzSn + (vegNoise(vVegWPos.xz * 3.0) - 0.5) * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVegSnowCol, mzSn);
  }`;
  } else if (mode === 'grass') {
    s += `
  {
    float mzN = vegNoise(vVegWPos.xz * 4.0);
    diffuseColor.rgb *= 0.84 + 0.32 * mzN;
    // spring: dry straw greens up
    float mzLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    diffuseColor.rgb = mix(diffuseColor.rgb, uVegSpring * (0.55 + mzLum * 1.6), uSpring * 0.85);
    float mzSn = vVegSnow * uSnowCover;
    mzSn = smoothstep(0.25, 0.55, mzSn + (vegNoise(vVegWPos.xz * 5.0) - 0.5) * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVegSnowCol, mzSn);
  }`;
  }
  return s;
}

// Soft translucency: foliage seen against the sun glows a little (sun through needles and snow).
const GLOW_F = /* glsl */ `
{
  vec3 mzV = normalize(vVegWPos - cameraPosition);
  float mzBack = max(dot(mzV, uVegSunDir), 0.0);
  float mzUp = smoothstep(-0.02, 0.2, uVegSunDir.y);
  totalEmissiveRadiance += diffuseColor.rgb * uVegSunCol * (pow(mzBack, 3.0) * 0.5 + 0.03) * mzUp;
}
`;

// Create a Lambert based vegetation material.
// opts: mode, wind {type, strength, height}, lod (uniform object or null), side, map, alphaTest,
//       springColor (hex), snowColor (hex), roughness unused (Lambert)
export function makeVegMaterial(opts = {}) {
  const mode = opts.mode || 'foliage';
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: opts.side ?? THREE.DoubleSide,
    fog: true,
    map: opts.map || null,
    alphaTest: opts.alphaTest || 0,
    alphaToCoverage: !!opts.alphaTest && !opts.transparent,
    transparent: !!opts.transparent,
    depthWrite: !opts.transparent,
  });
  if (opts.wind) m.userData.wind = opts.wind;
  m.defines = { MZ_WIND_ATTR: '' };
  const lod = opts.lod || null;
  m.userData.vegLod = lod;
  const spring = new THREE.Color(opts.springColor ?? 0x6fa84a);
  const snowCol = new THREE.Color(opts.snowColor ?? 0xf1f4fa);
  const key = `veg:${mode}${lod ? ':f' : ''}`;
  addCompileHook(m, key, (shader) => {
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.uniforms.uSpring = U.uSpring;
    shader.uniforms.uMzLod = lod || lodUniform();
    shader.uniforms.uVegSpring = { value: new THREE.Vector3(spring.r, spring.g, spring.b) };
    shader.uniforms.uVegSnowCol = { value: new THREE.Vector3(snowCol.r, snowCol.g, snowCol.b) };
    shader.uniforms.uVegSunDir = U.uSunDir;
    shader.uniforms.uVegSunCol = U.uSunColor;
    shader.vertexShader = (opts.wind ? '' : 'attribute vec2 aWind;\n') + HEADER_V + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + BODY_V);
    shader.fragmentShader = HEADER_F + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + bodyF(mode, !!lod));
    if (mode === 'leaves') {
      shader.vertexShader = 'attribute vec3 aCorner;\nuniform float uSpring;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += aCorner * smoothstep(0.04, 0.85, uSpring);');
    }
    if (mode === 'foliage' || mode === 'grass' || mode === 'cards' || mode === 'leaves') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLOW_F);
    }
  });
  return m;
}

// Depth material for shadow casters (wind aware). `map`/`alphaTest` are for card geometry.
export function makeDepthMaterial(wind, opts = {}) {
  const m = windDepthMaterial(wind);
  m.defines = { MZ_WIND_ATTR: '' };
  if (opts.map) { m.map = opts.map; m.alphaTest = opts.alphaTest ?? 0.5; }
  m.side = THREE.DoubleSide;
  return m;
}

