// Atmospheric fog injected into every material that has fog enabled, and shared with the sky.
// OWNER: atmosphere builder. Keep the exported names stable; Materials.js imports them.
//
// Model (all analytic, no ray marching), summed as optical depth along the view ray:
//   1. Ground fog: exponential height fog (Quilez integral), dense near the valley floor.
//   2. Aerial haze: a thin exponential layer with a large scale height. This is what turns the
//      mountain ranges into 3 to 4 receding value bands.
//   3. Lake fog: a slab with a soft but sharp-reading top (morning fog that hugs the ice and lets
//      the bell tower poke through), masked to an ellipse around the lake, with a drifting top.
// In-scattered color: cool ambient fog color away from the sun, a wide warm lobe on the sun
// side and a tight bright lobe around the sun itself. The sky dome evaluates exactly the same
// functions for an "infinite" ray, so distant terrain dissolves into the sky horizon seamlessly.
//
// Custom ShaderMaterials: include FOG_PARS_FRAGMENT, set `fog: true`, spread `fogUniforms()`
// into the material uniforms (shared fog uniforms plus the fogColor/fogDensity entries three
// writes every frame for fog materials), write `vFogWorldPos` in the vertex shader (or ignore
// it) and call `mzApplyFog(color, worldPos)` in the fragment shader.
// Extra uniforms this module registers on the shared uniform object (written by Atmosphere):
//   uFogHaze       vec2  (density per meter at y = 0, height falloff per meter)
//   uFogLayer      vec4  (density per meter, top height, top softness, top noise amplitude)
//   uFogLayerArea  vec4  (center x, center z, radius x, radius z) where the lake fog lives
//   uFogSunWide    float weight of the wide warm lobe on the sun side
//   uFogLayerColor vec3  in-scatter color of the lake fog (a brighter, sunlit blanket)
//   uFogTime       float (alias of uTime, kept separate to avoid name clashes in custom shaders)
import * as THREE from 'three';
import { U } from './Uniforms.js';

U.uFogHaze ||= { value: new THREE.Vector2(0.00018, 1 / 1100) };
U.uFogLayer ||= { value: new THREE.Vector4(0, 6, 3, 2) };
U.uFogLayerArea ||= { value: new THREE.Vector4(40, -120, 300, 200) };
U.uFogSunWide ||= { value: 0.35 };
U.uFogLayerColor ||= { value: new THREE.Color(0.8, 0.82, 0.86) };
U.uFogTime ||= U.uTime;

// Pure GLSL helpers (no varyings, no USE_FOG guard). Requires the uniforms below to be declared.
export const FOG_UNIFORMS_GLSL = /* glsl */ `
  uniform vec3 uFogColor;
  uniform vec3 uFogSunColor;
  uniform vec3 uSunDir;
  uniform float uFogDensity;
  uniform float uFogHeightFalloff;
  uniform float uFogBaseHeight;
  uniform float uFogSunPower;
  uniform vec2 uFogHaze;
  uniform vec4 uFogLayer;
  uniform vec4 uFogLayerArea;
  uniform float uFogSunWide;
  uniform vec3 uFogLayerColor;
  uniform float uFogTime;
`;

export const FOG_FUNCS_GLSL = /* glsl */ `
  float mzFogHash(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
  float mzFogNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mzFogHash(i), mzFogHash(i + vec2(1.0, 0.0)), u.x),
               mix(mzFogHash(i + vec2(0.0, 1.0)), mzFogHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // Optical depth of exponential height fog density(y) = d * exp(-b * (y - base)) along a ray.
  float mzExpOD(float d, float b, float base, float camY, float ry, float dist) {
    float h0 = camY - base;
    float x = dist * ry * b;
    float k = abs(x) < 1e-3 ? dist * (1.0 - 0.5 * x) : (1.0 - exp(-clamp(x, -70.0, 70.0))) / (ry * b);
    return d * exp(clamp(-h0 * b, -70.0, 70.0)) * k;
  }

  // Antiderivative (in y) of the slab profile clamp((top - y) / soft, 0, 1).
  float mzSlabF(float y, float top, float soft) {
    float a = top - soft;
    if (y >= top) return 0.0;
    if (y > a) { float d = top - y; return -d * d / (2.0 * soft); }
    return (y - a) - 0.5 * soft;
  }

  float mzLayerOD(vec3 cam, vec3 rd, float dist) {
    if (uFogLayer.x <= 0.0) return 0.0;
    float top = uFogLayer.y;
    float soft = max(uFogLayer.z, 0.05);
    float y0 = cam.y, y1 = cam.y + rd.y * dist;
    // Middle of the part of the ray that lies inside the slab, for the area mask and top noise.
    float tIn = 0.0, tOut = dist;
    if (abs(rd.y) > 1e-4) {
      float tc = (top - cam.y) / rd.y;
      if (rd.y > 0.0) tOut = clamp(tc, 0.0, dist); else tIn = clamp(tc, 0.0, dist);
    } else if (y0 > top) return 0.0;
    if (tOut <= tIn) return 0.0;
    vec3 mid = cam + rd * (0.5 * (tIn + tOut));
    vec2 q = (mid.xz - uFogLayerArea.xy) / uFogLayerArea.zw;
    float area = 1.0 - smoothstep(0.8, 1.2, length(q));
    if (area <= 0.0) return 0.0;
    vec2 drift = vec2(uFogTime * 0.6, uFogTime * 0.25);
    float n = mzFogNoise((mid.xz + drift) * 0.012) * 0.65 + mzFogNoise((mid.xz - drift * 1.7) * 0.045) * 0.35;
    top += (n - 0.5) * 2.0 * uFogLayer.w;
    float dy = y1 - y0;
    float len = abs(dy) < 0.02
      ? dist * clamp((top - 0.5 * (y0 + y1)) / soft, 0.0, 1.0)
      : (mzSlabF(y1, top, soft) - mzSlabF(y0, top, soft)) / dy * dist;
    float patches = smoothstep(0.15, 0.75, n);
    return uFogLayer.x * max(len, 0.0) * area * (0.25 + 1.35 * patches);
  }

  float mzFogOD(vec3 cam, vec3 rd, float dist) {
    float od = mzExpOD(uFogDensity, uFogHeightFalloff, uFogBaseHeight, cam.y, rd.y, dist);
    od += mzExpOD(uFogHaze.x, uFogHaze.y, 0.0, cam.y, rd.y, dist);
    od += mzLayerOD(cam, rd, dist);
    return od;
  }

  // Light scattered toward the eye by the fog, looking along rd.
  vec3 mzFogInscatter(vec3 rd) {
    float mu = dot(rd, uSunDir);
    float tight = pow(max(mu, 0.0), uFogSunPower);
    float wide = pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 3.0) * uFogSunWide;
    return mix(uFogColor, uFogSunColor, clamp(tight + wide, 0.0, 1.0));
  }

  vec3 mzApplyFog(vec3 col, vec3 worldPos) {
    vec3 ray = worldPos - cameraPosition;
    float dist = length(ray);
    vec3 rd = ray / max(dist, 1e-4);
    float odA = mzExpOD(uFogDensity, uFogHeightFalloff, uFogBaseHeight, cameraPosition.y, rd.y, dist)
              + mzExpOD(uFogHaze.x, uFogHaze.y, 0.0, cameraPosition.y, rd.y, dist);
    float odL = mzLayerOD(cameraPosition, rd, dist);
    float od = max(odA + odL, 0.0);
    float t = exp(-od);
    vec3 L = mzFogInscatter(rd);
    if (odL > 0.0) L = mix(L, uFogLayerColor * (0.85 + 0.3 * pow(max(dot(rd, uSunDir), 0.0), 4.0)), odL / max(od, 1e-4));
    return col * t + L * (1.0 - t);
  }
`;

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
  ${FOG_UNIFORMS_GLSL}
  ${FOG_FUNCS_GLSL}
#endif
`;

export const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = mzApplyFog(gl_FragColor.rgb, vFogWorldPos);
#endif
`;

export const FOG_UNIFORM_NAMES = [
  'uFogColor', 'uFogSunColor', 'uSunDir', 'uFogDensity', 'uFogHeightFalloff', 'uFogBaseHeight', 'uFogSunPower',
  'uFogHaze', 'uFogLayer', 'uFogLayerArea', 'uFogSunWide', 'uFogTime', 'uFogLayerColor',
];

// Uniforms for a custom fogged ShaderMaterial: { ...fogUniforms(), ...yours }.
export function fogUniforms() {
  const out = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  for (const n of FOG_UNIFORM_NAMES) out[n] = U[n];
  return out;
}
