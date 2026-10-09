// Height fog with sun in-scattering, injected into every material that has fog enabled.
// OWNER: atmosphere builder. Keep the exported names stable; Materials.js imports them.
//
// Model: exponential height fog (Quilez), plus a sun-direction tint so the air glows warm
// toward the sun. Values come from the shared uniforms in Uniforms.js.

export const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif
`;

// mvPosition is available at this point in every built-in vertex shader.
export const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPos = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz));
#endif
`;

export const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
  uniform vec3 uFogColor;
  uniform vec3 uFogSunColor;
  uniform vec3 uSunDir;
  uniform float uFogDensity;
  uniform float uFogHeightFalloff;
  uniform float uFogBaseHeight;
  uniform float uFogSunPower;

  vec3 mzApplyFog(vec3 col, vec3 worldPos) {
    vec3 ray = worldPos - cameraPosition;
    float dist = length(ray);
    vec3 rd = ray / max(dist, 1e-4);
    float b = uFogHeightFalloff;
    float h0 = cameraPosition.y - uFogBaseHeight;
    float ry = rd.y;
    // Integral of density along the ray for exponentially decaying height fog.
    float k = abs(ry) < 1e-3 ? dist : (1.0 - exp(-dist * ry * b)) / (ry * b);
    float amount = uFogDensity * exp(-h0 * b) * k;
    float fog = 1.0 - exp(-max(amount, 0.0));
    float sunAmt = pow(max(dot(rd, uSunDir), 0.0), uFogSunPower);
    vec3 fogCol = mix(uFogColor, uFogSunColor, sunAmt);
    return mix(col, fogCol, clamp(fog, 0.0, 1.0));
  }
#endif
`;

export const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = mzApplyFog(gl_FragColor.rgb, vFogWorldPos);
#endif
`;

export const FOG_UNIFORM_NAMES = [
  'uFogColor', 'uFogSunColor', 'uSunDir', 'uFogDensity', 'uFogHeightFalloff', 'uFogBaseHeight', 'uFogSunPower',
];
