// Rock material shared by boulders, cliff outcrops and the waterfall lintel. Matches the
// terrain rock: dark weathered granite and slate with strata, lichen on lit faces, bumpy micro
// normals, and the shared snow cap (Materials.js userData.snow; same palette as the terrain).
import * as THREE from 'three';
import { addCompileHook } from '../../render/Materials.js';
import { NOISE_GLSL, noiseTextures } from './noiseTextures.js';

const PARS = /* glsl */ `
${NOISE_GLSL}
uniform float uMzRockTone;
// Triplanar-ish 2D projection along the dominant normal axis.
vec2 mzRockUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.y > max(a.x, a.z) ? p.xz : (a.x > a.z ? vec2(p.z, p.y) : vec2(p.x, p.y));
}
`;

const COLOR = /* glsl */ `
{
  vec3 rp = vMzWorldPos;
  vec3 rn = normalize(vMzWorldNormal);
  vec2 uv = mzRockUV(rp, rn);
  vec4 n1 = mzNoiseK(uv + 3.7, 0.35);
  vec4 n2 = mzNoiseK(uv - 11.0, 2.2);
  float strata = fract(rp.y / 0.9 + n1.r * 1.6 + n1.g * 0.8);
  float band = smoothstep(0.1, 0.3, strata) * (1.0 - smoothstep(0.6, 0.85, strata));
  vec3 base = mix(vec3(0.055, 0.052, 0.05), vec3(0.13, 0.124, 0.115), n1.g * 0.55 + n2.r * 0.45);
  base = mix(base, vec3(0.16, 0.15, 0.138), band * 0.12 * n2.g);
  float streaks = mzNoiseK(vec2((rp.x + rp.z) * 2.2, rp.y * 0.12), 1.0).r;
  base *= 0.8 + 0.35 * streaks * (1.0 - abs(rn.y));
  base = mix(base, vec3(0.13, 0.095, 0.07), smoothstep(0.62, 0.8, n1.r) * 0.35);
  float lichen = smoothstep(0.66, 0.8, n2.g) * smoothstep(0.2, 0.7, rn.y + 0.3) * (1.0 - smoothstep(40.0, 160.0, rp.y));
  base = mix(base, mix(vec3(0.2, 0.19, 0.09), vec3(0.24, 0.13, 0.05), n1.g), lichen * 0.55);
  diffuseColor.rgb *= base * uMzRockTone;
}
`;

const NORMAL = /* glsl */ `
{
  vec3 rp = vMzWorldPos;
  vec3 rn = normalize(vMzWorldNormal);
  vec2 uv = mzRockUV(rp, rn);
  vec4 b1 = mzNoiseK(uv + 5.0, 1.4);
  vec4 b2 = mzNoiseK(uv - 2.0, 6.0);
  vec2 gr = b1.zw * 0.05 + b2.zw * 0.006;
  float fade = 1.0 - smoothstep(30.0, 120.0, length(rp - cameraPosition));
  vec3 a = abs(rn);
  vec3 t1 = a.y > max(a.x, a.z) ? vec3(1.0, 0.0, 0.0) : (a.x > a.z ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
  vec3 t2 = a.y > max(a.x, a.z) ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 pn = normalize(rn - (t1 * gr.x + t2 * gr.y) * fade);
  normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
}
`;

let cached = null;
export function rockMaterial(G, { tone = 1, snow = true } = {}) {
  const key = `${tone}|${snow}`;
  cached ||= new Map();
  if (cached.has(key)) return cached.get(key);
  const nz = noiseTextures();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.name = 'rock';
  // The snow patch provides vMzWorldPos / vMzWorldNormal; keep it on (amount 0 disables caps).
  m.userData.snow = { amount: snow ? 1 : 0, threshold: 0.5 };
  const tu = { value: tone };
  addCompileHook(m, 'mzRock', (shader) => {
    shader.uniforms.uMzNoise = { value: nz.smooth };
    shader.uniforms.uMzWhite = { value: nz.white };
    shader.uniforms.uMzRockTone = tu;
    let fs = PARS + shader.fragmentShader;
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + COLOR);
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMAL);
    shader.fragmentShader = fs;
  });
  cached.set(key, m);
  return m;
}
