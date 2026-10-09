// Terrain materials: MeshStandardMaterial (color pass) and MeshDepthMaterial (shadows), both
// displaced on the GPU from the baked height textures (CDLOD patches, see Terrain.js).
//
// Shading is procedural in world space (no tiling textures): fresh and wind-packed snow with
// sastrugi ripples and sun glints, rock with strata on steep faces, frozen dirt and dry grass
// where snow is thin, packed-snow roads with ruts and village mud, trampled village snow,
// frosted shores. Responds to uSnowCover (snowline climbs as it falls) and uSpring (greening).
import * as THREE from 'three';
import { addCompileHook } from '../../render/Materials.js';
import { SNOW_COMMON_GLSL } from '../../render/snowChunk.js';
import { TERRAIN_SAMPLE_GLSL } from './terrainGLSL.js';

const VERTEX_PARS = /* glsl */ `
attribute vec4 aPatch;
uniform vec2 uMzMorph[8];
uniform vec3 uMzLodCam;
${TERRAIN_SAMPLE_GLSL}
// Patch vertex: grid index in position.xz, skirt flag in position.y (-1).
vec3 mzTerrainPos() {
  vec2 g = position.xz;
  float skirt = position.y < -0.5 ? 1.0 : 0.0;
  vec2 wp = aPatch.xy + g * aPatch.z;
  float h0 = mzHeight(wp);
  vec2 mr = uMzMorph[int(aPatch.w + 0.5)];
  float k = clamp((distance(uMzLodCam, vec3(wp.x, h0, wp.y)) - mr.x) * mr.y, 0.0, 1.0);
  vec2 fr = fract(g * 0.5) * 2.0;
  wp -= fr * aPatch.z * k;
  float h = k > 0.0 ? mzHeight(wp) : h0;
  h -= skirt * (aPatch.z * 2.0 + 0.5);
  return vec3(wp.x, h, wp.y);
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uSnowCover;
uniform float uSpring;
uniform vec4 uWind;
varying vec3 vMzWP;
${SNOW_COMMON_GLSL}
${TERRAIN_SAMPLE_GLSL}
float mzGlintAmt = 0.0;
float mzSnowAmt = 0.0;
vec3 mzGlintN = vec3(0.0, 1.0, 0.0);
float mzTerrainGlint(vec3 lV, vec3 vV) {
  if (mzGlintAmt <= 0.001) return 0.0;
  return mzGlint(vMzWP, mzGlintN, lV * mat3(viewMatrix), vV * mat3(viewMatrix), length(vMzWP - cameraPosition)) * mzGlintAmt;
}
// Soft terminator for snow (light scattering inside the snowpack).
float mzSnowWrap(vec3 n, vec3 l) {
  float d = dot(n, l);
  return (max(0.0, (d + 0.35) / 1.35) - max(0.0, d)) * mzSnowAmt;
}
`;

// Main shading block, inserted after <normal_fragment_maps>.
const FRAG_SHADE = /* glsl */ `
{
  vec3 wp = vMzWP;
  vec2 xz = wp.xz;
  float dist = length(wp - cameraPosition);
  float large;
  vec4 nt = mzTerrainNormal(xz, large);
  vec3 N = nt.xyz;
  float conc = nt.w;
  vec4 mk = mzTerrainMask(xz);
  float detail = 1.0 - smoothstep(50.0, 240.0, dist);

  float nBig = mzFbm3(xz * 0.011);
  float nMid = mzFbm3(xz * 0.065 + 5.0);
  float nSm = mzVNoise(xz * 0.55 + 11.0);
  float up = N.y;

  // ---- snow amount
  float holdTh = 0.64 + 0.12 * (nMid - 0.5) - 0.05 * clamp(conc, -1.0, 1.0) - 0.04 * clamp(large * 0.2, -1.0, 1.0);
  float snow = smoothstep(holdTh - 0.05, holdTh + 0.06, up + (nSm - 0.5) * 0.07);
  float scour = smoothstep(-0.4, -2.5, large) * smoothstep(140.0, 450.0, wp.y);
  snow *= 1.0 - 0.8 * scour * smoothstep(0.35, 0.65, nMid);
  float southF = clamp(N.z * 3.0, 0.0, 1.0) * smoothstep(0.97, 0.8, up) * (1.0 - smoothstep(50.0, 200.0, wp.y));
  float thin = southF * smoothstep(0.42, 0.6, nMid * 0.7 + nSm * 0.3);
  float lowland = (1.0 - smoothstep(15.0, 80.0, wp.y)) * smoothstep(0.84, 0.95, up) * step(0.5, mk.z);
  thin = max(thin, lowland * smoothstep(0.68, 0.82, nMid + nBig * 0.3) * 0.8);
  snow *= 1.0 - thin;
  float snowAlt = mix(1180.0, -80.0, uSnowCover);
  snow *= smoothstep(snowAlt - 60.0, snowAlt + 90.0, wp.y + (nBig - 0.5) * 160.0 - N.z * 70.0 + conc * 25.0);

  // ---- ground and rock
  float rockiness = 1.0 - smoothstep(0.6, 0.8, up + (nMid - 0.5) * 0.1);
  float strata = fract(wp.y / 2.3 + nMid * 0.9 + nBig * 2.0);
  float band = smoothstep(0.15, 0.3, strata) * (1.0 - smoothstep(0.72, 0.9, strata));
  vec3 rock = mix(vec3(0.075, 0.072, 0.07), vec3(0.17, 0.162, 0.15), band * 0.7 + nSm * 0.3);
  rock = mix(rock, vec3(0.16, 0.115, 0.08), smoothstep(0.62, 0.8, nMid) * 0.5);
  rock *= 0.85 + 0.3 * mzVNoise(vec2(wp.x + wp.z, wp.y) * 0.9);
  float grass = smoothstep(0.35, 0.75, nMid + (nSm - 0.5) * 0.4);
  vec3 dirt = mix(vec3(0.11, 0.085, 0.065), vec3(0.34, 0.28, 0.16), grass);
  float wet = (1.0 - uSnowCover) * (1.0 - uSpring);
  dirt *= 1.0 - 0.35 * wet;
  vec3 springGrass = mix(vec3(0.12, 0.3, 0.05), vec3(0.24, 0.4, 0.08), nSm);
  dirt = mix(dirt, springGrass, uSpring * smoothstep(0.7, 0.85, up) * (1.0 - smoothstep(600.0, 900.0, wp.y)));
  vec3 ground = mix(dirt, rock, rockiness);
  float groundRough = mix(0.95, 0.82, rockiness) - 0.25 * wet;

  // ---- snow surface
  vec3 snowCol = mzSnowAlbedo(wp) * (1.0 + 0.04 * clamp(conc, 0.0, 1.0));
  float snowRough = 0.78;

  // ---- village trampling
  float vd = length(xz - vec2(0.0, 117.0));
  float vill = (1.0 - smoothstep(70.0, 110.0, vd + (nMid - 0.5) * 30.0)) * step(0.3, mk.z);
  float sq = 1.0 - smoothstep(14.0, 26.0, vd + (nSm - 0.5) * 6.0);
  float trample = vill * (0.55 + 0.45 * smoothstep(0.3, 0.7, nSm)) ;
  snowCol = mix(snowCol, vec3(0.66, 0.67, 0.69), trample * 0.6);
  snowCol = mix(snowCol, vec3(0.3, 0.26, 0.21), max(sq * 0.55 * smoothstep(0.35, 0.7, nSm + nMid * 0.3), vill * smoothstep(0.8, 0.92, nMid) * 0.6));
  snowRough = mix(snowRough, 0.62, trample);

  // ---- roads: packed snow, wheel ruts, a hoof-worn center, mud near the village
  float rd = abs(mk.x), rh = mk.y;
  float onRoad = rh > 0.1 ? 1.0 - smoothstep(rh - 0.25, rh + 0.4 + nSm * 0.7, rd) : 0.0;
  float wide = smoothstep(1.4, 1.8, rh);
  float rut = wide * (1.0 - smoothstep(0.1, 0.3, abs(rd - 0.8 + (nSm - 0.5) * 0.14)));
  float mid = wide * (1.0 - smoothstep(0.2, 0.5, rd + (nSm - 0.5) * 0.2));
  float muddy = clamp(vill * 1.2 + (1.0 - smoothstep(30.0, 80.0, vd)), 0.0, 1.0);
  vec3 packedSnow = mix(vec3(0.7, 0.71, 0.74), vec3(0.6, 0.6, 0.62), nSm * 0.5);
  vec3 rutCol = mix(vec3(0.42, 0.45, 0.5), vec3(0.17, 0.13, 0.1), muddy);
  vec3 roadCol = mix(packedSnow, rutCol, rut);
  roadCol = mix(roadCol, mix(vec3(0.55, 0.53, 0.52), vec3(0.2, 0.16, 0.12), muddy), mid * 0.6);
  roadCol = mix(roadCol, vec3(0.16, 0.12, 0.09), muddy * smoothstep(0.55, 0.8, nMid) * 0.7 * onRoad);
  float roadRough = mix(0.6, 0.38, max(rut, mid * 0.5) * mix(1.0, 0.6, muddy));
  snowCol = mix(snowCol, roadCol, onRoad);
  snowRough = mix(snowRough, roadRough, onRoad);
  ground = mix(ground, mix(vec3(0.13, 0.1, 0.08), vec3(0.17, 0.13, 0.1), nSm), onRoad);

  // ---- shoreline: wind-polished, frosted rim; lake bed below the ice
  float shore = (1.0 - smoothstep(0.0, 5.0, mk.z)) * step(-0.5, mk.z);
  snowCol = mix(snowCol, vec3(0.8, 0.86, 0.92), shore * 0.5);
  snowRough = mix(snowRough, 0.5, shore * 0.5);
  float bed = 1.0 - smoothstep(-0.6, -0.1, wp.y);
  ground = mix(ground, vec3(0.06, 0.065, 0.06), bed);
  snow *= 1.0 - bed * step(mk.z, 0.0);
  // river banks keep a frosted icy rim
  float bank = 1.0 - smoothstep(6.0, 11.0, mk.w);
  snowCol = mix(snowCol, vec3(0.78, 0.84, 0.9), bank * 0.4);

  // ---- combine
  float aoL = clamp(1.0 - max(0.0, large) * 0.035, 0.72, 1.0);
  vec3 col = mix(ground * aoL, snowCol, snow);
  diffuseColor.rgb = col;
  roughnessFactor = mix(groundRough, snowRough, snow);
  metalnessFactor = 0.0;

  // ---- micro normals: sastrugi across the prevailing wind, drifts, footprint dimples, strata
  vec3 Np = N;
  if (detail > 0.0) {
    vec2 wd = vec2(0.94, 0.34);
    vec2 q = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
    vec3 r1 = mzVNoiseD(q * vec2(2.6, 0.55) + vec2(nMid * 3.0, 0.0));
    vec2 g1 = r1.yz * vec2(2.6, 0.55);
    vec2 gq = g1.x * wd + g1.y * vec2(-wd.y, wd.x);
    vec3 r2 = mzVNoiseD(xz * 0.31 + 7.0);
    vec3 r3 = mzVNoiseD(xz * 4.5 - 3.0);
    vec2 sg = gq * 0.03 * (1.0 - trample) * (1.0 - onRoad) + r2.yz * 0.31 * 0.22 + r3.yz * 4.5 * mix(0.004, 0.012, trample + onRoad * 0.5);
    vec2 rg = (r3.yz * 4.5 * 0.012 + r2.yz * 0.31 * 0.4) * rockiness;
    vec2 grad = mix(rg, sg, snow) * detail;
    Np = normalize(N - vec3(grad.x, 0.0, grad.y));
    vec3 upT = vec3(0.0, 1.0, 0.0) - N * N.y;
    float lu = length(upT);
    if (lu > 0.05) {
      float sp = wp.y * 3.2 + nMid * 6.0;
      float ledge = cos(sp) * 0.5 + 0.3 * cos(sp * 2.3 + 1.7);
      Np = normalize(Np + (upT / lu) * ledge * 0.55 * rockiness * (1.0 - snow) * detail);
    }
  }
  normal = normalize((viewMatrix * vec4(Np, 0.0)).xyz);
  mzGlintN = Np;
  mzSnowAmt = snow;
  mzGlintAmt = snow * (1.0 - onRoad * 0.85) * (1.0 - trample * 0.7) * (1.0 + shore);
}
`;

const RE_OVERRIDE = /* glsl */ `
#undef RE_Direct
#define RE_Direct( dl, gp, gn, gv, gcn, mt, rl ) { RE_Direct_Physical( dl, gp, gn, gv, gcn, mt, rl ); rl.directSpecular += dl.color * mzTerrainGlint( dl.direction, gv ) * 16.0; rl.directDiffuse += dl.color * mt.diffuseColor * 0.3183 * mzSnowWrap( gn, dl.direction ); }
`;

export function createTerrainMaterials(G, uniforms) {
  const U = G.uniforms;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  mat.name = 'terrain';
  addCompileHook(mat, 'mzTerrain', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.uniforms.uSpring = U.uSpring;
    shader.uniforms.uWind = U.uWind;
    let vs = shader.vertexShader;
    vs = VERTEX_PARS + 'varying vec3 vMzWP;\n' + vs;
    vs = vs.replace('#include <beginnormal_vertex>', `
      vec3 mzPos = mzTerrainPos();
      vMzWP = mzPos;
      vec3 objectNormal = mzTerrainNormalLod(mzPos.xz, 0.0).xyz;
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`);
    vs = vs.replace('#include <begin_vertex>', 'vec3 transformed = mzPos;');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = FRAG_PARS + fs;
    fs = fs.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + RE_OVERRIDE);
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_SHADE);
    shader.fragmentShader = fs;
  });

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.name = 'terrainDepth';
  addCompileHook(depth, 'mzTerrainDepth', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_PARS + shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = mzTerrainPos();');
  });
  return { material: mat, depthMaterial: depth };
}
