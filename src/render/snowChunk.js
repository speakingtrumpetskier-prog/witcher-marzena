// Snow accumulation on upward-facing surfaces of any opted-in material, and the snow look
// shared with the terrain shader (same albedo, wind-packed variation and sun glints).
// OWNER: terrain builder (must visually match terrain snow). Keep exported names stable.
//
// Opt in:  mat.userData.snow = { amount: 1, threshold: 0.55, color: optional THREE.Color }
// The global uniform uSnowCover scales everything (thaw ending animates it to 0).
//
// Exports used by Materials.js: SNOW_PARS_VERTEX, SNOW_VERTEX, SNOW_PARS_FRAGMENT,
// SNOW_COLOR_FRAGMENT, SNOW_ROUGHNESS_FRAGMENT. Extra export for the terrain and water
// shaders: SNOW_COMMON_GLSL (hashes, value noise, glints, snow albedo).

// Shared GLSL (guarded so several includes in one shader are harmless).
export const SNOW_COMMON_GLSL = /* glsl */ `
#ifndef MZ_SNOW_COMMON
#define MZ_SNOW_COMMON
uint mzPcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float mzHash12(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 1048576);
  return float(mzPcg(q.x + mzPcg(q.y))) * (1.0 / 4294967295.0);
}
vec2 mzHash22(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 1048576);
  uint a = mzPcg(q.x + mzPcg(q.y));
  return vec2(float(a), float(mzPcg(a))) * (1.0 / 4294967295.0);
}
float mzVNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mzHash12(i), mzHash12(i + vec2(1.0, 0.0)), u.x),
             mix(mzHash12(i + vec2(0.0, 1.0)), mzHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Value noise in [0,1] with its gradient: (value, d/dx, d/dy).
vec3 mzVNoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = mzHash12(i), b = mzHash12(i + vec2(1.0, 0.0));
  float c = mzHash12(i + vec2(0.0, 1.0)), d = mzHash12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
float mzFbm3(vec2 p) {
  return mzVNoise(p) * 0.55 + mzVNoise(p * 2.07 + 13.1) * 0.3 + mzVNoise(p * 4.13 - 7.7) * 0.15;
}

// Snow albedo: fresh snow is near white with a faint blue; wind-packed patches are a touch
// greyer, fresh drifts brighter. Large-scale variation keeps big fields from looking flat.
vec3 mzSnowAlbedo(vec3 wp) {
  float n = mzFbm3(wp.xz * 0.11);
  float m = mzVNoise(wp.xz * 0.9 + 3.3);
  vec3 fresh = vec3(0.83, 0.85, 0.89);
  vec3 packed = vec3(0.72, 0.75, 0.8);
  return mix(packed, fresh, smoothstep(0.3, 0.7, n) * 0.75 + m * 0.25);
}

// Sun glints: sparse micro facets with random orientation that flash when they mirror the
// light into the eye. Cells scale with distance (about two pixels) and snap to powers of two
// so the pattern is stable. All vectors in world space. Returns a specular multiplier.
float mzGlint(vec3 wp, vec3 nW, vec3 lW, vec3 vW, float dist) {
  if (dot(nW, lW) <= 0.0) return 0.0;
  vec3 hW = normalize(lW + vW);
  float lv = exp2(ceil(log2(max(0.012, dist * 0.0015))));
  vec2 c = wp.xz / lv + vec2(wp.y * 0.37 / lv, 0.0);
  vec2 cell = floor(c);
  vec2 r = mzHash22(cell);
  vec2 jit = mzHash22(cell + 17.0) - 0.5;
  vec3 fn = normalize(nW + vec3(jit.x, 0.15, jit.y) * 1.25);
  float g = smoothstep(0.986, 0.9985, dot(fn, hW));
  vec2 f = fract(c) - 0.5 - (r - 0.5) * 0.6;
  g *= smoothstep(0.32, 0.08, length(f)) * step(r.x, 0.22);
  return g * (1.0 - smoothstep(60.0, 260.0, dist));
}
#endif
`;

export const SNOW_PARS_VERTEX = /* glsl */ `
varying vec3 vMzWorldPos;
varying vec3 vMzWorldNormal;
`;

// Placed after <project_vertex>, where `transformed` and `objectNormal` exist.
export const SNOW_VERTEX = /* glsl */ `
{
  mat4 mzModel = modelMatrix;
  #ifdef USE_INSTANCING
    mzModel = modelMatrix * instanceMatrix;
  #endif
  #ifdef USE_BATCHING
    mzModel = modelMatrix * batchingMatrix;
  #endif
  vMzWorldPos = (mzModel * vec4(transformed, 1.0)).xyz;
  vMzWorldNormal = normalize(mat3(mzModel) * objectNormal);
}
`;

export const SNOW_PARS_FRAGMENT = /* glsl */ `
varying vec3 vMzWorldPos;
varying vec3 vMzWorldNormal;
uniform float uSnowCover;
uniform float uMzSnowAmount;
uniform float uMzSnowThreshold;
uniform vec3 uMzSnowColor;
${SNOW_COMMON_GLSL}
float mzSnowGlintAmt = 0.0;
float mzSnowMask() {
  vec2 p = vMzWorldPos.xz + vMzWorldPos.y * 0.31;
  float n = mzVNoise(p * 1.7) * 0.6 + mzVNoise(p * 7.3) * 0.4;
  float up = normalize(vMzWorldNormal).y + (n - 0.5) * 0.35;
  float cover = uSnowCover * uMzSnowAmount;
  float th = mix(1.05, uMzSnowThreshold, cover);
  return smoothstep(th - 0.08, th + 0.12, up) * smoothstep(0.0, 0.15, cover);
}
float mzSnowGlint(vec3 lV, vec3 vV) {
  if (mzSnowGlintAmt <= 0.001) return 0.0;
  vec3 lW = lV * mat3(viewMatrix);
  vec3 vW = vV * mat3(viewMatrix);
  return mzGlint(vMzWorldPos, normalize(vMzWorldNormal), lW, vW, length(vMzWorldPos - cameraPosition)) * mzSnowGlintAmt;
}
`;

// Placed after <color_fragment> (diffuseColor is known) for albedo. uMzSnowColor tints the
// shared snow albedo (default is neutral white) so objects match the terrain snow.
export const SNOW_COLOR_FRAGMENT = /* glsl */ `
float mzSnow = mzSnowMask();
diffuseColor.rgb = mix(diffuseColor.rgb, mzSnowAlbedo(vMzWorldPos) * (uMzSnowColor / 0.94), mzSnow);
mzSnowGlintAmt = smoothstep(0.5, 0.9, mzSnow);
`;

// Placed after <roughnessmap_fragment>. Standard and physical materials also get the snow
// glints through a wrapped RE_Direct (directional light color already includes shadows).
export const SNOW_ROUGHNESS_FRAGMENT = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.8, mzSnow);
#if defined( STANDARD ) && defined( RE_Direct )
  #undef RE_Direct
  #define RE_Direct( dl, gp, gn, gv, gcn, mt, rl ) { RE_Direct_Physical( dl, gp, gn, gv, gcn, mt, rl ); rl.directSpecular += dl.color * mzSnowGlint( dl.direction, gv ) * 14.0; }
#endif
`;
