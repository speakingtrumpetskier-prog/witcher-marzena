// Vertex wind sway for vegetation, cloth and banners.
// OWNER: vegetation builder. Keep exported names stable.
//
// Opt in:  mat.userData.wind = { type: 'tree' | 'grass' | 'cloth', strength: 1, height: 10 }
//   height: object-space height (meters) at which sway reaches full strength.
//
// Extra control for vegetation geometry: if the material has the define MZ_WIND_ATTR, the geometry
// must carry attribute `aWind` (x = branch flex weight 0..1 for twigs and needle tips, y = a per
// branch phase). Without it, tree wind only bends the whole trunk plus a weak tip flutter.
//
// tree: the trunk is stiff low and bends with height squared (slow, big), branch tips flex faster
//       and further along the wind, gusts lean the whole tree and shake the tips.
// grass: wave fronts travel downwind; blades near uPlayerPos part and lie down away from the player.
// Offsets are computed in world meters and converted to object space with the inverse of the model
// (and instance) matrix, so scaled and rotated instances sway the same distance.

export const WIND_PARS_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform vec3 uPlayerPos;
uniform float uMzWindStrength;
uniform float uMzWindHeight;
#ifdef MZ_WIND_ATTR
attribute vec2 aWind;
#endif
`;

// Placed after <begin_vertex>: modifies `transformed` in object space.
export const WIND_VERTEX_TREE = /* glsl */ `
{
  vec3 mzBase = vec3(0.0);
  mat3 mzM = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    mzBase = instanceMatrix[3].xyz;
    mzM = mat3(modelMatrix * instanceMatrix);
  #endif
  vec3 mzWBase = (modelMatrix * vec4(mzBase, 1.0)).xyz;
  float mzH = clamp(position.y / uMzWindHeight, 0.0, 1.3);
  float mzPhase = dot(mzWBase.xz, vec2(0.071, 0.053));
  float mzStr = uWind.z * uMzWindStrength;
  float mzGust = uWind.w * uMzWindStrength;
  // Trunk: slow sway whose period grows with tree height, leaning with the wind.
  float mzSlow = 1.0 / (0.55 + 0.045 * uMzWindHeight);
  float mzSway = sin(uTime * 1.3 * mzSlow + mzPhase) * 0.5 + sin(uTime * 2.9 * mzSlow + mzPhase * 1.9) * 0.22 + 0.6 + mzGust * 0.9;
  float mzAmp = 0.035 * uMzWindHeight;
  vec2 mzBend = uWind.xy * mzSway * mzStr * mzAmp * mzH * mzH;
  float mzFlex = 0.0;
  float mzBP = 0.0;
  #ifdef MZ_WIND_ATTR
    mzFlex = aWind.x;
    mzBP = aWind.y;
  #else
    mzFlex = mzH;
    mzBP = position.x * 3.0 + position.z * 2.0;
  #endif
  // Branch tips: faster, along the wind, with a vertical bob.
  float mzBt = sin(uTime * 2.6 + mzBP + mzPhase * 0.7) * 0.55 + sin(uTime * 4.3 + mzBP * 1.7) * 0.28 + 0.5;
  float mzBAmp = (0.03 + 0.2 * mzStr + 0.16 * mzGust) * mzFlex * (0.45 + 0.55 * mzH);
  vec3 mzOff = vec3(mzBend.x, -0.1 * dot(mzBend, mzBend), mzBend.y);
  mzOff += vec3(uWind.x * mzBt, 0.45 * (mzBt - 0.5), uWind.y * mzBt) * mzBAmp;
  // high frequency shiver on thin twigs in strong wind
  mzOff += vec3(sin(uTime * 7.3 + mzBP * 2.1), sin(uTime * 6.1 + mzBP), cos(uTime * 8.1 + mzBP * 1.3)) * 0.02 * mzFlex * (mzStr + mzGust);
  transformed += inverse(mzM) * mzOff;
}
`;

export const WIND_VERTEX_GRASS = /* glsl */ `
{
  vec3 mzBase = vec3(0.0);
  mat4 mzMM = modelMatrix;
  #ifdef USE_INSTANCING
    mzBase = instanceMatrix[3].xyz;
    mzMM = modelMatrix * instanceMatrix;
  #endif
  vec3 mzWBase = (modelMatrix * vec4(mzBase, 1.0)).xyz;
  vec3 mzWV = (mzMM * vec4(transformed, 1.0)).xyz;
  float mzH = clamp(position.y / uMzWindHeight, 0.0, 1.0);
  float mzStr = uWind.z * uMzWindStrength;
  // Wave fronts travelling downwind.
  float mzPhase = dot(mzWBase.xz, uWind.xy) * 0.32 + dot(mzWBase.xz, vec2(-uWind.y, uWind.x)) * 0.11;
  float mzWave = 0.5 + 0.5 * sin(uTime * 2.1 - mzPhase) + 0.35 * sin(uTime * 3.7 - mzPhase * 1.7);
  vec2 mzBend = uWind.xy * (0.25 + 0.5 * mzWave + uWind.w * 0.5) * (0.12 + mzStr) * mzH * mzH * 0.55 * uMzWindHeight;
  // per blade flutter
  mzBend += vec2(sin(uTime * 5.3 + position.x * 9.0 + position.z * 7.0), cos(uTime * 4.7 + position.z * 8.0)) * 0.025 * mzStr * mzH * uMzWindHeight;
  // Part and flatten around the player.
  vec2 mzAway = mzWV.xz - uPlayerPos.xz;
  float mzD = length(mzAway);
  float mzPush = smoothstep(1.7, 0.15, mzD);
  mzBend += (mzAway / max(mzD, 0.05)) * mzPush * 0.55 * mzH * uMzWindHeight;
  vec3 mzOff = vec3(mzBend.x, -0.5 * dot(mzBend, mzBend) / max(uMzWindHeight, 0.2) - mzPush * 0.25 * mzH * uMzWindHeight, mzBend.y);
  transformed += inverse(mat3(mzMM)) * mzOff;
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
