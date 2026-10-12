// Materials for the rare and odd trees. Owner: vegetation builder.
//
//   makeBarkMaterial(lodUniform, wind, opts)  the vegetation bark material (wind, LOD dither, snow) plus a
//       procedural bark: vertical fissures, plates and, optionally, lichen. It reads the sweep uv
//       (x = fissure periods around the ring, y = meters along the limb), so any geometry built with
//       sweep(..., { uv: true, uvAround }) gets bark that follows the wood. Detail fades with distance
//       so far trunks do not shimmer.
//   makeIceMaterial(lodUniform, wind)         a clear, glossy glaze: translucent, rim lit, prismatic, with
//       sparkles that shift as the camera moves (a cheap stand in for refraction).
import { makeVegMaterial } from './materials.js';
import { addCompileHook } from '../../render/Materials.js';

const BARK_F = /* glsl */ `
  {
    float mzNear = 1.0 - smoothstep(22.0, 95.0, vVegLodD);
    float bu = vVegUv.x, bv = vVegUv.y;
    float wob = vegNoise(vec2(bu * 0.9, bv * 0.5)) * 2.4 + vegNoise(vec2(bu * 2.3, bv * 1.6)) * 0.8;
    float fis = abs(sin((bu + wob + 0.4 * vegHash(vec2(floor(bu + wob), 1.3))) * 3.14159));
    float fid = floor(bu + wob);
    // every fissure has its own width and comes and goes along the limb; cross cracks split the ridges into plates
    float deep = (1.0 - smoothstep(0.0, 0.14 + 0.26 * vegHash(vec2(fid, 7.1)), fis)) * smoothstep(0.12, 0.42, vegNoise(vec2(fid * 3.1, bv * 0.7)));
    float mzCr = smoothstep(0.92, 1.0, abs(fract(bv * 1.15 + vegHash(vec2(fid, 2.2)) * 3.0) - 0.5) * 2.0);
    float plate = vegNoise(vec2(bu * 1.0 + wob, bv * 3.2));
    float band = vegNoise(vec2(fid * 3.7, bv * 0.9));
    float rough = (1.0 - 0.62 * deep) * (1.0 - 0.28 * mzCr * (1.0 - deep)) * (0.78 + 0.44 * plate) * (0.88 + 0.24 * band);
    diffuseColor.rgb *= mix(0.88, rough, mzNear * step(0.0001, abs(bu) + abs(bv)));
    // lichen: pale grey-green patches that climb the weather side
    float mzLi = smoothstep(0.58, 0.78, vegNoise(vVegWPos.xz * 0.55 + vVegWPos.y * 0.42) * 0.7 + vegNoise(vVegWPos.xz * 2.4 + vVegWPos.y * 1.7) * 0.3);
    mzLi *= uBarkLichen * smoothstep(1.2, 3.0, vVegH);
    float mzLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.62, 0.46) * (0.35 + mzLum * 1.1), mzLi * 0.6 * mzNear);
  }
`;

// opts: lichen 0..1
export function makeBarkMaterial(lu, wind, opts = {}) {
  const m = makeVegMaterial({ mode: 'bark', wind, lod: lu });
  const lichen = { value: opts.lichen ?? 0 };
  addCompileHook(m, 'odd:bark', (shader) => {
    shader.uniforms.uBarkLichen = lichen;
    shader.fragmentShader = 'uniform float uBarkLichen;\n' + shader.fragmentShader.replace(
      'float mzSn = vVegSnow * uSnowCover * mzFront;', BARK_F + '    float mzSn = vVegSnow * uSnowCover * mzFront;');
  });
  return m;
}

const ICE_F = /* glsl */ `
{
  vec3 mzNv = normalize(normal);
  vec3 mzVv = normalize(vViewPosition);
  float mzFr = pow(1.0 - abs(dot(mzNv, mzVv)), 2.2);
  vec3 mzNw = normalize((vec4(mzNv, 0.0) * viewMatrix).xyz);
  vec3 mzCv = normalize(cameraPosition - vVegWPos);
  vec3 mzHh = normalize(uVegSunDir + mzCv);
  float mzSp = pow(max(dot(mzNw, mzHh), 0.0), 70.0) * smoothstep(-0.02, 0.2, uVegSunDir.y);
  // prismatic fringe that slides with the view angle
  vec3 mzPr = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + dot(mzNw, vec3(0.3, 0.8, 0.5)) * 1.4 + vVegWPos.y * 0.15));
  totalEmissiveRadiance += vec3(0.30, 0.55, 0.78) * mzFr * 0.65 + mzPr * 0.12 * mzFr + uVegSunCol * mzSp * 1.4;
  // sparkles: cells that light up for a moment as the view direction changes
  vec3 mzCell = floor(vVegWPos * 26.0) + floor(mzCv * 7.0);
  float mzG = fract(sin(dot(mzCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * smoothstep(0.992, 1.0, mzG) * (0.6 + 0.8 * mzFr) * smoothstep(-0.02, 0.2, uVegSunDir.y);
  diffuseColor.a = mix(0.42, 0.9, mzFr);
}
`;

export function makeIceMaterial(lu, wind) {
  const m = makeVegMaterial({ mode: 'bark', wind, lod: lu, transparent: true });
  m.opacity = 0.72;
  addCompileHook(m, 'odd:ice', (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + ICE_F);
  });
  return m;
}

// Part specs for kinds.js (see makeKind): wood with the fissured bark, the clear glaze, and needle cards
// (the first `texLods` LODs textured through `map`, the needle atlas by default; lower LODs plain foliage).
export const barkPart = (geometry, opts = {}) => ({ geometry, mode: 'bark', material: (lu, wind) => makeBarkMaterial(lu, wind, opts) });
export const icePart = (geometry) => ({ geometry, mode: 'bark', noShadow: true, material: (lu, wind) => makeIceMaterial(lu, wind) });
export const needlePart = (geometry, lod, map, texLods = 2) => (lod < texLods ? { geometry, mode: 'needles', tex: 'needle', map } : { geometry, mode: 'foliage' });
