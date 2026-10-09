// Snow accumulation on upward-facing surfaces of any opted-in material.
// OWNER: terrain builder (must visually match terrain snow). Keep exported names stable.
//
// Opt in:  mat.userData.snow = { amount: 1, threshold: 0.55, color: optional THREE.Color }
// The global uniform uSnowCover scales everything (thaw ending animates it to 0).

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

float mzHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mzVNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mzHash(i), mzHash(i + vec2(1, 0)), u.x), mix(mzHash(i + vec2(0, 1)), mzHash(i + vec2(1, 1)), u.x), u.y);
}
float mzSnowMask() {
  float n = mzVNoise(vMzWorldPos.xz * 1.7) * 0.6 + mzVNoise(vMzWorldPos.xz * 7.3) * 0.4;
  float up = vMzWorldNormal.y + (n - 0.5) * 0.35;
  float cover = uSnowCover * uMzSnowAmount;
  float th = mix(1.05, uMzSnowThreshold, cover);
  return smoothstep(th - 0.08, th + 0.12, up) * smoothstep(0.0, 0.15, cover);
}
`;

// Placed after <color_fragment> (diffuseColor is known) for albedo.
export const SNOW_COLOR_FRAGMENT = /* glsl */ `
float mzSnow = mzSnowMask();
diffuseColor.rgb = mix(diffuseColor.rgb, uMzSnowColor, mzSnow);
`;

// Placed after <roughnessmap_fragment>.
export const SNOW_ROUGHNESS_FRAGMENT = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.82, mzSnow);
`;
