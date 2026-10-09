// Blowing ground snow: low translucent sheets that hug the terrain and ice around the camera,
// with long wind-aligned streaks scrolling downwind. Three stacked layers (ankle, knee, waist)
// in one draw call. The grid is snapped to its own spacing so it never swims, and heights are
// resampled from G.world only when the camera has moved a few meters.
//
//   createDrift(G) -> { mesh, update(dt, t) }  (strength from G.weather.params.drift and wind)
import * as THREE from 'three';
import { FOG_PARS_FRAGMENT, FOG_UNIFORM_NAMES } from '../../render/fogChunk.js';
import { getNoiseTexture } from './noiseTex.js';

const LAYERS = [0.06, 0.32, 0.8];

const VERT = /* glsl */ `
attribute float aLayer;
uniform sampler2D uNoise;
uniform vec2 uWindDir;
uniform float uTravel;
varying vec3 vWorld;
varying float vLayer;
varying vec2 vQ;
void main() {
  vec3 p = position;
  vec2 w = uWindDir;
  vec2 q = vec2(dot(p.xz, w), dot(p.xz, vec2(-w.y, w.x)));
  q.x -= uTravel * (1.0 + aLayer * 0.35);
  float n = texture2D(uNoise, q * vec2(0.008, 0.03) + aLayer * 0.31).r;
  p.y += aLayer * (0.6 + 1.2 * n) * 0.6;
  vWorld = p;
  vLayer = aLayer;
  vQ = q;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uDrift;
uniform float uRadius;
uniform vec3 uAmb;
uniform vec3 uKey;
uniform float uTime;
varying vec3 vWorld;
varying float vLayer;
varying vec2 vQ;
${FOG_PARS_FRAGMENT}
void main() {
  vec2 q = vQ;
  float a = texture2D(uNoise, q * vec2(0.010, 0.055) + vLayer * 0.37).g;
  float b = texture2D(uNoise, q * vec2(0.03, 0.2) + vec2(uTime * 0.013, vLayer * 0.5)).b;
  float c = texture2D(uNoise, q * vec2(0.08, 0.6) + vec2(-uTime * 0.02, 0.0)).r;
  float m = a * 0.55 + b * 0.3 + c * 0.2;
  float th = mix(0.66, 0.42, uDrift);
  m = smoothstep(th, th + 0.25, m);
  float d = length(vWorld.xz - cameraPosition.xz);
  float fade = (1.0 - smoothstep(uRadius * 0.55, uRadius, d)) * smoothstep(0.6, 4.0, d);
  float layerA = vLayer < 0.5 ? 0.6 : (vLayer < 1.5 ? 0.38 : 0.2);
  float alpha = m * fade * layerA * clamp(uDrift * 1.3, 0.0, 1.0);
  if (alpha < 0.004) discard;
  vec3 col = uAmb + uKey;
  gl_FragColor = vec4(col, alpha);
  #ifdef USE_FOG
    gl_FragColor.rgb = mzApplyFog(gl_FragColor.rgb, vWorld);
  #endif
}
`;

export function createDrift(G) {
  const U = G.uniforms;
  const N = G.quality === 'low' ? 32 : 48;
  const SIZE = 120;
  const step = SIZE / (N - 1);
  const count = N * N * LAYERS.length;
  const pos = new Float32Array(count * 3);
  const layer = new Float32Array(count);
  const idx = [];
  for (let l = 0; l < LAYERS.length; l++) {
    const base = l * N * N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) layer[base + j * N + i] = l;
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = base + j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uNoise: { value: getNoiseTexture() },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uTravel: { value: 0 },
    uDrift: { value: 0 },
    uRadius: { value: SIZE * 0.5 },
    uAmb: { value: new THREE.Color(0.5, 0.55, 0.6) },
    uKey: { value: new THREE.Color(0.4, 0.35, 0.3) },
    uTime: U.uTime,
  };
  for (const n of FOG_UNIFORM_NAMES) uniforms[n] = U[n];
  const material = new THREE.ShaderMaterial({
    name: 'mz-drift',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'snowDrift';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  G.scene.add(mesh);

  let cx = 1e9, cz = 1e9;
  function rebuild(nx, nz) {
    cx = nx; cz = nz;
    const half = SIZE * 0.5;
    const w = G.world;
    for (let j = 0; j < N; j++) {
      const z = cz - half + j * step;
      for (let i = 0; i < N; i++) {
        const x = cx - half + i * step;
        const h = w && w.grid ? w.heightAt(x, z) : 0;
        for (let l = 0; l < LAYERS.length; l++) {
          const o = (l * N * N + j * N + i) * 3;
          pos[o] = x; pos[o + 1] = h + LAYERS[l]; pos[o + 2] = z;
        }
      }
    }
    posAttr.needsUpdate = true;
  }

  const out = { mesh };
  out.update = (dt) => {
    const W = G.weather.params;
    const wind = G.weather.wind;
    const amount = W.drift * Math.min(1, 0.25 + wind.strength * 0.9 + wind.gust * 0.5);
    uniforms.uDrift.value = amount;
    mesh.visible = amount > 0.02;
    if (!mesh.visible) return;
    const cam = G.camera.position;
    const nx = Math.round(cam.x / step) * step, nz = Math.round(cam.z / step) * step;
    if (Math.abs(nx - cx) > step * 1.5 || Math.abs(nz - cz) > step * 1.5) rebuild(nx, nz);
    uniforms.uWindDir.value.copy(wind.dir);
    const speed = 2.5 + wind.strength * 9 + wind.gust * 6;
    if (!G.shot) uniforms.uTravel.value += speed * dt;
    const A = G.atmosphere;
    if (A?.look) {
      const L = A.look;
      uniforms.uAmb.value.copy(L.hor).multiplyScalar(L.skyI * 0.75);
      uniforms.uKey.value.copy(A.keyColor).multiplyScalar(A.keyIntensity * 0.07 * Math.max(A.keyDir.y, 0.1));
    }
  };
  return out;
}
