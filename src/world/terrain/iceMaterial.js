// Lake and river ice (and open water after the thaw). MeshStandardMaterial + compile hook.
//
// Black ice: dark, polished (sky reflection through scene.environment), with bubbles and
// fracture planes at two depths seen with refraction parallax, tinted by the real water depth
// from the terrain height texture. Snow drifts streak across it along the prevailing wind,
// frost rims the shores, holes are open water with a slush ring, an under-ice glow and an
// animatable crack network are driven by uniforms. uMzThaw 0..1 melts snow, breaks the ice
// into floes, then opens rippling water.
import * as THREE from 'three';
import { addCompileHook } from '../../render/Materials.js';
import { TERRAIN_SAMPLE_GLSL } from './terrainGLSL.js';
import { NOISE_GLSL } from './noiseTextures.js';

export const MAX_HOLES = 16;

const PARS = /* glsl */ `
varying vec3 vMzIceWP;
#ifdef MZ_RIVER
  varying float vMzAcross;
#endif
uniform vec4 uMzHoles[${MAX_HOLES}];
uniform vec4 uMzGlow;
uniform vec3 uMzGlowColor;
uniform vec4 uMzCrack;
uniform float uMzThaw;
uniform float uTime;
uniform vec4 uWind;
${TERRAIN_SAMPLE_GLSL}
${NOISE_GLSL}
float mzIceGlintAmt = 0.0;
vec3 mzIceN = vec3(0.0, 1.0, 0.0);
float mzIceGlint(vec3 lV, vec3 vV) {
  if (mzIceGlintAmt <= 0.001) return 0.0;
  return mzGlintW(vMzIceWP, mzIceN, lV * mat3(viewMatrix), vV * mat3(viewMatrix)) * mzIceGlintAmt;
}
// F1 and F2 cell distances (cell points from the white-noise texture).
vec2 mzVoronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + mzWhite(i + o).xy * 0.9 + 0.05 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(vec2(d1, d2));
}
`;

const SHADE = /* glsl */ `
{
  vec3 wp = vMzIceWP;
  vec2 xz = wp.xz;
  float th = mzHeight(xz);
  // Contour jitter below the grid cell size keeps shorelines ragged instead of polygonal.
  float depth = wp.y - th + (mzNoiseK(xz + 2.0, 1.3).r - 0.5) * 0.22;
  if (depth < 0.05) discard;
  #ifdef MZ_RIVER
    // Trim the ribbon to the channel with a ragged, frosted edge.
    float rEdge = abs(vMzAcross) - (0.56 + 0.1 * (mzNoiseK(xz, 0.18).r - 0.5) * 2.0);
    if (rEdge > 0.0) discard;
    depth = min(depth, -rEdge * 6.0);
  #endif
  vec4 mk = mzTerrainMask(xz);
  float sd = mk.z;
  float dist = length(wp - cameraPosition);
  vec3 V = normalize(cameraPosition - wp);
  float thaw = uMzThaw;

  // Wind frame: streaks run along the prevailing wind.
  vec2 wd = vec2(0.94, 0.34), wn = vec2(-wd.y, wd.x);
  vec2 q = vec2(dot(xz, wd), dot(xz, wn));
  vec4 sA = mzNoiseK(vec2(q.x * 0.12, q.y), 0.035);
  vec4 sM = mzNoiseK(vec2(q.x * 0.1, q.y) - 13.0, 0.22);
  vec4 sB = mzNoiseK(vec2(q.x * 0.14, q.y) + 31.0, 0.9);
  vec4 big = mzNoiseK(xz + 7.0, 0.006);
  float nearShore = (1.0 - smoothstep(3.0, 45.0, -sd)) * (1.0 - smoothstep(0.0, 4.0, sd));
  float edge = 1.0 - smoothstep(0.05, 0.24, depth);
  #ifdef MZ_RIVER
    float snowBias = 0.04;
  #else
    // Marsh pools (outside the shoreline) are sheltered: mostly clear ice between reeds.
    float snowBias = -0.25 * smoothstep(-2.0, 6.0, sd);
  #endif
  // Drifts: broad wind-packed fields plus long narrow streaks with crisp edges and feathered
  // tails downwind (the streak noise is stretched along the wind).
  float field = sA.r * 0.55 + big.r * 0.35 + nearShore * 0.3 + snowBias;
  float streak = sM.r * 0.7 + sB.r * 0.3;
  float tail = smoothstep(0.0, 1.0, fract(q.x * 0.02 + sA.g * 3.0));
  float snowIce = max(smoothstep(0.57, 0.6, field), smoothstep(0.6 - tail * 0.05, 0.625, streak + field * 0.3 - 0.08));
  float dust = smoothstep(0.45, 0.8, sB.g * 0.6 + sM.g * 0.4) * 0.4 * (1.0 - snowIce);

  // Black ice with depth: bubbles and fracture planes at two depths (refraction parallax).
  vec2 rv = -V.xz / max(V.y, 0.12) * 0.76;
  float bubbleCl = smoothstep(0.42, 0.72, mzNoiseK(xz + 3.0, 0.15).g);
  float b1 = smoothstep(0.73, 0.81, mzNoiseK(xz + rv * 0.08, 7.0).g);
  float b2 = smoothstep(0.75, 0.83, mzNoiseK(xz + rv * 0.24 + 13.0, 4.5).r);
  float bubbles = (b1 * 0.8 + b2 * 0.55) * bubbleCl;
  // Fracture planes: straight, branching crack networks (cell edges) at two depths.
  float c1n = mzNoiseK(xz + 50.0, 0.11).r;
  // Crack width in meters (a few centimeters), widened to about a pixel with distance.
  float cw = 0.025 + dist * 0.0011;
  vec4 cw4 = mzNoiseK(xz * 0.7 + 3.0, 0.09);
  vec2 cwarp = (cw4.rg - 0.5) * 0.35;
  vec2 v1 = mzVoronoi((xz + rv * 0.06) / 13.0 + cwarp + vec2(c1n * 0.2, 0.0));
  vec2 v2 = mzVoronoi((xz + rv * 0.3) / 4.5 + cwarp * 1.5 + 17.0);
  float cr1 = (1.0 - smoothstep(cw / 13.0, cw * 2.5 / 13.0, (v1.y - v1.x) * 0.5)) * smoothstep(0.55, 0.72, mzNoiseK(xz - 3.0, 0.035).g);
  float cr2 = (1.0 - smoothstep(cw / 4.5, cw * 2.5 / 4.5, (v2.y - v2.x) * 0.5)) * 0.5 * smoothstep(0.6, 0.78, mzNoiseK(xz + 9.0, 0.06).r);
  float inner = max(cr1, cr2) * (1.0 - smoothstep(150.0, 400.0, dist));
  vec3 deep = vec3(0.003, 0.01, 0.016);
  vec3 bedC = vec3(0.05, 0.062, 0.055);
  vec3 under = mix(bedC, deep, 1.0 - exp(-depth * 0.8));
  vec3 clearIce = under + vec3(0.42, 0.52, 0.58) * bubbles * 0.45 + vec3(0.5, 0.6, 0.66) * inner * 0.22;
  float clearRough = mix(0.035, 0.12, big.g) + 0.08 * smoothstep(0.5, 0.8, sB.r);

  vec3 snowC = mix(vec3(0.72, 0.75, 0.8), vec3(0.83, 0.85, 0.89), sB.g);
  float cover = max(snowIce, dust);
  vec3 col = mix(clearIce, snowC, cover);
  float rough = mix(clearRough, 0.78, snowIce);
  rough = mix(rough, 0.5, dust);
  float alpha = mix(0.86, 1.0, max(snowIce, dust * 0.8));
  float frost = max(edge, nearShore * smoothstep(0.55, 0.78, sB.r) * 0.55);
  col = mix(col, vec3(0.74, 0.8, 0.86), frost * (1.0 - snowIce));
  rough = mix(rough, 0.5, frost * (1.0 - snowIce));
  alpha = max(alpha, frost);

  // Gentle frozen ripples on clear ice, drifts on snow.
  vec4 rp = mzNoiseK(xz - 4.0, 0.08);
  vec2 g = rp.zw * 0.05 * (1.0 - cover) + (sM.z * 0.1 * wd + sM.w * wn) * 0.25 * cover + sB.zw * 0.04 * cover;
  float glintMask = snowIce * 0.6 + frost + dust * 0.5;

  // Holes: open water with a slush ring.
  float hole = 0.0, rim = 0.0;
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    vec4 H = uMzHoles[i];
    if (H.w < 0.5) continue;
    float d = length(xz - H.xy);
    hole = max(hole, 1.0 - smoothstep(H.z - 0.04, H.z + 0.02, d));
    rim = max(rim, 1.0 - smoothstep(H.z, H.z + 0.7 + 0.2 * sB.r, d));
  }

  // Crack network (boss arena): radial and cellular fractures growing with amount.
  float crack = 0.0;
  if (uMzCrack.w > 0.001) {
    vec2 dc2 = xz - uMzCrack.xy;
    float dc = length(dc2);
    float reach = uMzCrack.z * uMzCrack.w;
    if (dc < reach + 2.0) {
      vec2 vf = mzVoronoi(xz / 2.8 + sB.r * 0.6);
      float cell = 1.0 - smoothstep(0.02, 0.06 + 0.06 * uMzCrack.w, vf.y - vf.x);
      float ang = atan(dc2.y, dc2.x);
      float radial = 1.0 - smoothstep(0.0, 0.05 + 0.04 * uMzCrack.w, abs(sin(ang * 6.0 + c1n * 5.0 + dc * 0.05)));
      float inR = 1.0 - smoothstep(reach * 0.75, reach, dc);
      crack = max(cell * smoothstep(0.0, 0.6, uMzCrack.w), radial) * inR;
    }
  }

  // Thaw: snow melts, the ice darkens, floes separate, then open water.
  float water = 0.0;
  if (thaw > 0.001) {
    cover *= 1.0 - smoothstep(0.0, 0.35, thaw);
    col = mix(col, clearIce * 0.8, smoothstep(0.0, 0.4, thaw));
    rough = mix(rough, 0.06, smoothstep(0.0, 0.4, thaw));
    vec2 vf = mzVoronoi(xz / 9.0 + big.r * 3.0);
    float chan = 1.0 - smoothstep(0.0, 0.02 + 1.1 * smoothstep(0.25, 0.85, thaw), vf.y - vf.x);
    water = max(chan * smoothstep(0.15, 0.3, thaw), smoothstep(0.7, 0.95, thaw));
  }
  water = max(water, hole);

  // Cracks read as dark seeping lines with white fractured edges.
  col = mix(col, vec3(0.65, 0.74, 0.8), crack * 0.6);
  col = mix(col, vec3(0.01, 0.02, 0.025), crack * smoothstep(0.5, 1.0, crack) * 0.8);

  // Slush rim around holes.
  col = mix(col, vec3(0.5, 0.56, 0.6), rim * (1.0 - hole));
  rough = mix(rough, 0.3, rim * (1.0 - hole));

  // Open water: depth tint, wind ripples, mirror reflections.
  if (water > 0.001) {
    vec4 w1 = mzNoiseK(xz + uWind.xy * uTime * 0.7, 0.4);
    vec4 w2 = mzNoiseK(xz * 1.6 - uWind.xy * uTime * 1.1 + 9.0, 0.9);
    vec2 wg = (w1.zw * 0.035 + w2.zw * 0.015) * (0.5 + uWind.z * 1.5);
    vec3 waterC = mix(vec3(0.03, 0.055, 0.05), vec3(0.006, 0.018, 0.026), 1.0 - exp(-depth * 0.35));
    col = mix(col, waterC, water);
    rough = mix(rough, 0.03, water);
    alpha = mix(alpha, mix(0.72, 0.96, 1.0 - exp(-depth * 0.6)), water);
    g = mix(g, wg, water);
    glintMask *= 1.0 - water;
  }

  vec3 Nw = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  mzIceN = Nw;
  mzIceGlintAmt = glintMask * (1.0 - thaw);
  diffuseColor.rgb = col;
  diffuseColor.a = alpha;
  roughnessFactor = rough;
  metalnessFactor = 0.0;

  // Pale light under the ice (Wiesia): strongest through clear ice.
  if (uMzGlow.w > 0.0) {
    float gd = length(xz - uMzGlow.xy) / max(uMzGlow.z, 0.01);
    float gl = uMzGlow.w * exp(-gd * gd * 2.5) * mix(1.0, 0.3, cover);
    totalEmissiveRadiance += uMzGlowColor * gl;
    diffuseColor.a = max(diffuseColor.a, min(1.0, gl));
  }
}
`;

const RE_OVERRIDE = /* glsl */ `
#undef RE_Direct
#define RE_Direct( dl, gp, gn, gv, gcn, mt, rl ) { RE_Direct_Physical( dl, gp, gn, gv, gcn, mt, rl ); rl.directSpecular += dl.color * mzIceGlint( dl.direction, gv ) * 14.0; }
`;

export function createIceUniforms(G) {
  const holes = [];
  for (let i = 0; i < MAX_HOLES; i++) holes.push(new THREE.Vector4(0, 0, 0, 0));
  const nz = G.terrain.uniforms;
  return {
    ...nz,
    uMzHoles: { value: holes },
    uMzGlow: { value: new THREE.Vector4(0, 0, 1, 0) },
    uMzGlowColor: { value: new THREE.Color(0.62, 0.96, 1.0) },
    uMzCrack: { value: new THREE.Vector4(0, 0, 1, 0) },
    uMzThaw: { value: 0 },
  };
}

export function createIceMaterial(G, uniforms, kind = 'lake') {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, transparent: true });
  mat.name = `ice_${kind}`;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -4;
  addCompileHook(mat, `mzIce_${kind}`, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uTime = G.uniforms.uTime;
    shader.uniforms.uWind = G.uniforms.uWind;
    const riv = kind === 'river';
    shader.vertexShader = (riv ? 'attribute float aAcross;\nvarying float vMzAcross;\n' : '') + 'varying vec3 vMzIceWP;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvMzIceWP = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (riv ? '\nvMzAcross = aAcross;' : ''));
    let fs = (kind === 'river' ? '#define MZ_RIVER\n' : '') + PARS + shader.fragmentShader;
    fs = fs.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + RE_OVERRIDE);
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SHADE);
    fs = fs.replace('#include <opaque_fragment>', `
  // Guard the HDR target: a mirror-smooth highlight facing the sun can exceed half-float range
  // (Inf), and Inf or NaN would smear across the screen through bloom.
  if (any(isnan(outgoingLight))) outgoingLight = vec3(0.0);
  outgoingLight = min(outgoingLight, vec3(48.0));
#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  });
  return mat;
}
