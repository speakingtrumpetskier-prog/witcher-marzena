// Vertex wind sway for vegetation, cloth and banners.
// OWNER: vegetation builder. Keep exported names stable.
//
// Opt in:  mat.userData.wind = { type: 'tree' | 'grass' | 'cloth', strength: 1, height: 10 }
//   height: object-space height (meters) at which sway reaches full strength.

export const WIND_PARS_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform vec3 uPlayerPos;
uniform float uMzWindStrength;
uniform float uMzWindHeight;
`;

// Placed after <begin_vertex>: modifies `transformed` in object space.
export const WIND_VERTEX_TREE = /* glsl */ `
{
  vec3 mzBase = vec3(0.0);
  #ifdef USE_INSTANCING
    mzBase = instanceMatrix[3].xyz;
  #endif
  vec3 mzWBase = (modelMatrix * vec4(mzBase, 1.0)).xyz;
  float mzH = clamp(position.y / uMzWindHeight, 0.0, 1.5);
  float mzPhase = dot(mzWBase.xz, vec2(0.071, 0.053));
  float mzStr = uWind.z * uMzWindStrength;
  float mzSway = sin(uTime * 1.1 + mzPhase) * 0.6 + sin(uTime * 2.3 + mzPhase * 1.7) * 0.3 + uWind.w * 0.8;
  vec2 mzBend = uWind.xy * (0.35 + 0.65 * mzSway) * mzStr * mzH * mzH * 0.6;
  // Small high-frequency flutter on branch tips.
  mzBend += vec2(sin(uTime * 6.1 + position.x * 3.0 + mzPhase), cos(uTime * 5.3 + position.z * 3.0)) * 0.03 * mzStr * mzH;
  vec3 mzOff = vec3(mzBend.x, -0.15 * dot(mzBend, mzBend), mzBend.y);
  #ifdef USE_INSTANCING
    mzOff = transpose(mat3(instanceMatrix)) * mzOff;
  #endif
  transformed += mzOff;
}
`;

export const WIND_VERTEX_GRASS = /* glsl */ `
{
  vec3 mzBase = vec3(0.0);
  #ifdef USE_INSTANCING
    mzBase = instanceMatrix[3].xyz;
  #endif
  vec3 mzWBase = (modelMatrix * vec4(mzBase, 1.0)).xyz;
  float mzH = clamp(position.y / uMzWindHeight, 0.0, 1.0);
  float mzPhase = dot(mzWBase.xz, vec2(0.31, 0.27));
  float mzStr = uWind.z * uMzWindStrength;
  vec2 mzBend = uWind.xy * (0.5 + 0.5 * sin(uTime * 2.2 + mzPhase)) * mzStr * mzH * mzH * 0.5;
  // Push away from the player.
  vec2 mzAway = mzWBase.xz - uPlayerPos.xz;
  float mzD = length(mzAway);
  mzBend += (mzAway / max(mzD, 0.01)) * smoothstep(1.2, 0.0, mzD) * 0.5 * mzH;
  vec3 mzOff = vec3(mzBend.x, -0.2 * dot(mzBend, mzBend), mzBend.y);
  #ifdef USE_INSTANCING
    mzOff = transpose(mat3(instanceMatrix)) * mzOff;
  #endif
  transformed += mzOff;
}
`;

export const WIND_VERTEX_CLOTH = /* glsl */ `
{
  float mzH = clamp(-position.y / uMzWindHeight, 0.0, 1.0);
  float mzStr = uWind.z * uMzWindStrength;
  float mzW = sin(uTime * 4.0 + position.x * 2.5) * 0.5 + sin(uTime * 7.0 + position.x * 5.0) * 0.25;
  vec3 mzOff = vec3(uWind.x, 0.0, uWind.y) * mzStr * mzH * (0.4 + mzW) * 0.4;
  transformed += mzOff;
}
`;
