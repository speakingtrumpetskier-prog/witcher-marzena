// Terrain materials: MeshStandardMaterial (color pass) and MeshDepthMaterial (shadows), both
// displaced on the GPU from the baked height textures (CDLOD patches, see Terrain.js).
//
// Shading is procedural in world space (no tiling texture maps): fresh and wind-packed snow
// with sastrugi ripples and sun glints, rock with strata on steep faces, frozen dirt and dry
// grass where snow is thin, packed-snow roads with ruts and village mud, trampled village
// snow, frosted shores. Responds to uSnowCover (the snowline climbs as it falls) and uSpring.
// Noise comes from small baked textures (noiseTextures.js): one fetch per octave group, mip
// filtered, which keeps the shader cheap enough for software rendering too.
import * as THREE from 'three';
import { addCompileHook } from '../../render/Materials.js';
import { TERRAIN_SAMPLE_GLSL } from './terrainGLSL.js';
import { NOISE_GLSL } from './noiseTextures.js';

const VERTEX_PARS = /* glsl */ `
attribute vec4 aPatch;
uniform vec2 uMzMorph[8];
uniform vec3 uMzLodCam;
${TERRAIN_SAMPLE_GLSL}
// Patch vertex: grid index in position.xz, skirt flag in position.y (-1).
vec3 mzTerrainPos() {
  vec2 g = position.xz;
  vec2 wp = aPatch.xy + g * aPatch.z;
  float h0 = mzHeight(wp);
  vec2 mr = uMzMorph[int(mod(aPatch.w + 0.5, 16.0))];
  float k = clamp((distance(uMzLodCam, vec3(wp.x, h0, wp.y)) - mr.x) * mr.y, 0.0, 1.0);
  vec2 fr = fract(g * 0.5) * 2.0;
  float h = h0;
  if (k > 0.0 && fr.x + fr.y > 0.0) {
    wp -= fr * aPatch.z * k;
    h = mzHeight(wp);
  }
  if (position.y < -0.5) h -= aPatch.z * 2.0 + 0.5;
  return vec3(wp.x, h, wp.y);
}
`;

// The lighting wrap: glints and a soft snow terminator, per direct light (shadowed color).
const FRAG_PARS = /* glsl */ `
uniform sampler2D uTrackMap;
uniform vec4 uTrackRect; // x0, z0, size, on
uniform float uSnowCover;
uniform float uSpring;
varying vec3 vMzWP;
${TERRAIN_SAMPLE_GLSL}
${NOISE_GLSL}
float mzGlintAmt = 0.0;
float mzSnowAmt = 0.0;
vec3 mzGlintN = vec3(0.0, 1.0, 0.0);
float mzTerrainGlint(vec3 lV, vec3 vV) {
  if (mzGlintAmt <= 0.001) return 0.0;
  return mzGlintW(vMzWP, mzGlintN, lV * mat3(viewMatrix), vV * mat3(viewMatrix)) * mzGlintAmt;
}
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
  vec4 mk = dist < 700.0 ? mzTerrainMask(xz) : vec4(8.0, 0.0, 64.0, 40.0);
  float detail = 1.0 - smoothstep(50.0, 240.0, dist);

  vec4 qBig = mzNoiseK(xz, 0.011);
  vec4 qMid = mzNoiseK(xz + 37.0, 0.065);
  vec4 qSm = dist < 520.0 ? mzNoiseK(xz - 11.0, 0.55) : vec4(0.5);
  float nBig = qBig.r, nMid = qMid.r, nSm = qSm.r;
  float up = N.y;

  // ---- snow amount: holds below ~50 degrees, scoured off convex crests up high, thin on
  // sun-facing banks and wind-blown knolls in the valley (grass tufts poke through)
  // Couloirs and hollows hold snow on steeper ground than ridges and buttresses do.
  float couloir = clamp(large * 0.18, -1.0, 1.0);
  float holdTh = 0.64 + 0.14 * (nMid - 0.5) - 0.05 * clamp(conc, -1.0, 1.0) - 0.09 * couloir;
  float sharp = mix(0.05, 0.022, smoothstep(80.0, 400.0, wp.y));
  float snow = smoothstep(holdTh - sharp, holdTh + sharp, up + (nSm - 0.5) * 0.08);
  float scour = smoothstep(-0.4, -2.5, large) * smoothstep(140.0, 450.0, wp.y);
  snow *= 1.0 - 0.8 * scour * smoothstep(0.35, 0.65, qMid.g);
  float lowAlt = 1.0 - smoothstep(40.0, 200.0, wp.y);
  float southExp = clamp(N.z * 2.2, 0.0, 1.0) * smoothstep(0.985, 0.86, up);
  float convexExp = smoothstep(-0.5, -2.2, large) * 0.85;
  float bare = max(southExp, convexExp) * lowAlt * smoothstep(0.38, 0.62, nMid) * step(1.5, mk.z);
  // Reed marsh west of the lake: thin snow on the tussocks, dry sedge showing through.
  vec2 mq = (xz - vec2(-268.0, -82.0)) / vec2(105.0, 78.0);
  float marsh = 1.0 - smoothstep(0.75, 1.15, length(mq) + (nMid - 0.5) * 0.3);
  bare = max(bare, marsh * (0.55 + 0.4 * smoothstep(0.4, 0.7, nMid)) * step(-0.05, wp.y));
  float tufts = smoothstep(0.5, 0.78, qSm.g + bare * 0.3);
  snow *= 1.0 - clamp(bare * (0.45 + 0.55 * tufts), 0.0, 1.0);
  float snowAlt = mix(1180.0, -80.0, uSnowCover);
  snow *= smoothstep(snowAlt - 60.0, snowAlt + 90.0, wp.y + (nBig - 0.5) * 160.0 - N.z * 70.0 + conc * 25.0);

  // ---- ground and rock
  float rockiness = 1.0 - smoothstep(0.6, 0.8, up + (nMid - 0.5) * 0.12);
  float steepR = 1.0 - smoothstep(0.35, 0.7, up);
  float sy = wp.y / 3.1 + (nMid - 0.5) * 3.0 + (qBig.g - 0.5) * 6.0 + (qSm.r - 0.5) * 0.6;
  float strata = fract(sy);
  float joint = 1.0;
  if (steepR > 0.01 && dist < 450.0) joint = smoothstep(0.35, 0.65, mzNoiseK(vec2((wp.x + wp.z) * 0.6, wp.y * 0.08), 0.5).r);
  float band = smoothstep(0.1, 0.25, strata) * (1.0 - smoothstep(0.55, 0.85, strata)) * steepR * (1.0 - smoothstep(150.0, 450.0, dist)) * joint;
  float rq = nSm;
  if (rockiness > 0.02 && dist < 600.0) rq = mzNoiseK(vec2(wp.x + wp.z, wp.y), 0.9).r;
  vec3 rock = mix(vec3(0.045, 0.043, 0.042), vec3(0.11, 0.105, 0.098), qBig.g * 0.6 + rq * 0.4);
  rock = mix(rock, vec3(0.14, 0.132, 0.12), band * 0.15);
  // Vertical weathering streaks on steep faces (water and frost staining).
  if (steepR > 0.01 && dist < 600.0) {
    float vst = mzNoiseK(vec2((wp.x + wp.z) * 1.4, wp.y * 0.06), 0.6).r;
    rock *= mix(1.0, 0.82 + 0.28 * vst, steepR);
  }
  rock = mix(rock, vec3(0.12, 0.085, 0.06), smoothstep(0.62, 0.8, qMid.g) * 0.4);
  float grass = max(smoothstep(0.3, 0.7, nMid + (qSm.g - 0.5) * 0.5), marsh * 0.85);
  vec3 dirt = mix(vec3(0.1, 0.078, 0.06), vec3(0.3, 0.25, 0.15), grass);
  float wet = (1.0 - uSnowCover) * (1.0 - uSpring);
  dirt *= 1.0 - 0.35 * wet;
  vec3 springGrass = mix(vec3(0.12, 0.3, 0.05), vec3(0.24, 0.4, 0.08), nSm);
  dirt = mix(dirt, springGrass, uSpring * smoothstep(0.7, 0.85, up) * (1.0 - smoothstep(600.0, 900.0, wp.y)));
  vec3 ground = mix(dirt, rock, rockiness);
  float groundRough = mix(0.95, 0.85, rockiness) - 0.25 * wet;

  // ---- snow surface (same palette as mzSnowAlbedo in snowChunk.js)
  vec3 snowCol = mix(vec3(0.72, 0.75, 0.8), vec3(0.83, 0.85, 0.89), smoothstep(0.3, 0.7, qMid.g) * 0.75 + qSm.g * 0.25);
  snowCol *= 1.0 + 0.04 * clamp(conc, 0.0, 1.0);
  vec4 qDr = dist < 600.0 ? mzNoiseK(vec2(dot(xz, vec2(0.94, 0.34)) * 0.35, dot(xz, vec2(-0.34, 0.94))) + 19.0, 0.16) : vec4(0.5);
  snowCol *= 0.93 + 0.1 * smoothstep(0.25, 0.75, qDr.r);
  float snowRough = 0.78;

  // ---- village trampling
  float vd = length(xz - vec2(0.0, 117.0));
  float vill = (1.0 - smoothstep(70.0, 110.0, vd + (nMid - 0.5) * 30.0)) * step(0.3, mk.z);
  float sq = 1.0 - smoothstep(14.0, 26.0, vd + (nSm - 0.5) * 6.0);
  float trample = vill * (0.55 + 0.45 * smoothstep(0.3, 0.7, nSm));
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

  // ---- shoreline: wind-polished frosted rim; lake bed below the ice
  float shore = (1.0 - smoothstep(0.0, 5.0, mk.z)) * step(-0.5, mk.z);
  snowCol = mix(snowCol, vec3(0.8, 0.86, 0.92), shore * 0.5);
  snowRough = mix(snowRough, 0.5, shore * 0.5);
  float bed = 1.0 - smoothstep(-0.6, -0.1, wp.y);
  ground = mix(ground, vec3(0.06, 0.065, 0.06), bed);
  snow *= 1.0 - bed * step(mk.z, 0.0);
  float bank = 1.0 - smoothstep(6.0, 11.0, mk.w);
  snowCol = mix(snowCol, vec3(0.78, 0.84, 0.9), bank * 0.4);

  // ---- tracks: prints pressed into the snow (gameplay/SnowTracks.js); packed snow is greyer and bluer
  float trk = 0.0;
  vec2 trkG = vec2(0.0);
  if (uTrackRect.w > 0.5) {
    vec2 tuv = (xz - uTrackRect.xy) / uTrackRect.z;
    if (all(greaterThan(tuv, vec2(0.002))) && all(lessThan(tuv, vec2(0.998)))) {
      float e = 1.0 / 1024.0;
      trk = texture2D(uTrackMap, tuv).r;
      float tx = texture2D(uTrackMap, tuv + vec2(e, 0.0)).r - texture2D(uTrackMap, tuv - vec2(e, 0.0)).r;
      float tz = texture2D(uTrackMap, tuv + vec2(0.0, e)).r - texture2D(uTrackMap, tuv - vec2(0.0, e)).r;
      trkG = vec2(tx, tz);
      trk *= 1.0 - onRoad * 0.85;
      snowCol = mix(snowCol, snowCol * vec3(0.7, 0.76, 0.86), trk * 0.85);
      snowRough = mix(snowRough, 0.55, trk);
    }
  }

  // ---- combine
  float aoL = clamp(1.0 - max(0.0, large) * 0.035, 0.72, 1.0);
  diffuseColor.rgb = mix(ground * aoL, snowCol, snow);
  roughnessFactor = mix(groundRough, snowRough, snow);
  metalnessFactor = 0.0;

  // ---- micro normals: sastrugi across the prevailing wind, drifts, dimples, rock strata
  vec3 Np = N;
  if (detail > 0.0) {
    vec2 wd = vec2(0.94, 0.34);
    vec2 wn = vec2(-wd.y, wd.x);
    vec2 q = vec2(dot(xz, wd) * 4.5, dot(xz, wn));
    vec4 r1 = mzNoiseK(q, 0.55);
    // Procedural normals have no mip filtering: fade each band out as its frequency nears the
    // pixel footprint, or grazing views under the low sun alias into concentric moire bands.
    float fpQ = max(fwidth(q.x), fwidth(q.y)) * 0.55;
    float fpX = max(fwidth(xz.x), fwidth(xz.y));
    float aaQ = 1.0 - smoothstep(0.12, 0.35, fpQ);
    float aa3 = 1.0 - smoothstep(0.12, 0.35, fpX * 4.0);
    vec2 gq = ((r1.z * 4.5) * wd + r1.w * wn) * aaQ;
    vec4 r2 = mzNoiseK(xz + 71.0, 0.3);
    vec4 r3 = mzNoiseK(xz - 29.0, 4.0) * vec4(1.0, 1.0, aa3, aa3);
    float flat_ = (1.0 - trample) * (1.0 - onRoad);
    vec2 dg = qDr.z * 0.35 * vec2(0.94, 0.34) + qDr.w * vec2(-0.34, 0.94);
    vec2 sg = gq * 0.022 * flat_ + r2.zw * 0.22 + dg * 0.9 * flat_ + r3.zw * mix(0.004, 0.014, clamp(trample + onRoad * 0.5, 0.0, 1.0));
    vec2 rg = r3.zw * 0.014 + r2.zw * 0.45;
    vec2 grad = mix(rg * rockiness, sg, snow) * detail;
    Np = normalize(N - vec3(grad.x, 0.0, grad.y));
    vec3 upT = vec3(0.0, 1.0, 0.0) - N * N.y;
    float lu = length(upT);
    if (lu > 0.05) {
      float sp = sy * 6.2832;
      float ledge = cos(sp) * 0.5 + 0.3 * cos(sp * 2.3 + 1.7);
      Np = normalize(Np + (upT / lu) * ledge * 0.18 * steepR * joint * (1.0 - snow) * detail);
    }
  }
  // Print walls: the map's slope bends the normal (the rim catches the low sun, the floor shades).
  Np = normalize(Np + vec3(trkG.x, 0.0, trkG.y) * 2.2 * snow);
  normal = normalize((viewMatrix * vec4(Np, 0.0)).xyz);
  mzGlintN = Np;
  mzSnowAmt = snow;
  mzGlintAmt = snow * (1.0 - onRoad * 0.85) * (1.0 - trample * 0.7) * (1.0 + shore) * (1.0 - trk * 0.85);
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
  const dbg = G.params.get('tdbg');
  addCompileHook(mat, 'mzTerrain' + (dbg || ''), (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.uniforms.uSpring = U.uSpring;
    U.uTrackMap ||= { value: null };
    U.uTrackRect ||= { value: new THREE.Vector4(0, 0, 128, 0) };
    shader.uniforms.uTrackMap = U.uTrackMap;
    shader.uniforms.uTrackRect = U.uTrackRect;
    let vs = shader.vertexShader;
    vs = VERTEX_PARS + 'varying vec3 vMzWP;\n' + vs;
    vs = vs.replace('#include <beginnormal_vertex>', `
      if (aPatch.w > 15.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vec3 mzPos = mzTerrainPos();
      vMzWP = mzPos;
      vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`);
    vs = vs.replace('#include <begin_vertex>', 'vec3 transformed = mzPos;');
    shader.vertexShader = vs;
    let fs = FRAG_PARS + shader.fragmentShader;
    if (dbg === 'nofrag') {
      fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ float l; vec4 nt = mzTerrainNormal(vMzWP.xz, l); normal = normalize((viewMatrix * vec4(nt.xyz, 0.0)).xyz); diffuseColor.rgb = vec3(0.85); }');
    } else {
      fs = fs.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + RE_OVERRIDE);
      fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_SHADE);
    }
    fs = fs.replace('#include <opaque_fragment>', `
  // Guard the HDR target: a mirror-smooth highlight facing the sun can exceed half-float range
  // (Inf), and Inf or NaN would smear across the screen through bloom.
  if (any(isnan(outgoingLight))) outgoingLight = vec3(0.0);
  outgoingLight = min(outgoingLight, vec3(48.0));
#include <opaque_fragment>`);
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
