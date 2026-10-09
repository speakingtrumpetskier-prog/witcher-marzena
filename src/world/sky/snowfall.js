// GPU snowfall around the camera: one instanced draw of camera-facing quads that are stretched
// along their screen-space motion, so slow snow reads as soft round flakes and blizzard snow as
// horizontal streaks. Flakes live in a box that wraps around the camera (world anchored, so
// moving through them is correct). Lit by the key light and sky, forward-scatter sparkle toward
// the sun, fogged like everything else.
//
//   createSnowfall(G) -> { mesh, update(dt, t), density }  (density follows G.weather.params)
import * as THREE from 'three';
import { FOG_PARS_FRAGMENT, fogUniforms } from '../../render/fogChunk.js';
import { rng } from '../../core/util.js';

const VERT = /* glsl */ `
attribute vec4 aRand;
uniform vec3 uOffset;
uniform vec3 uVel;
uniform float uBox;
uniform float uSize;
uniform float uStreak;
uniform float uFlutter;
uniform float uFlakeTime;
uniform vec2 uViewport;
varying vec2 vUv;
varying float vLen;
varying float vAlpha;
varying vec3 vWorld;

#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif
void main() {
  float s = aRand.w;
  float speed = 0.7 + 0.6 * s;
  float ph = aRand.x * 41.0 + aRand.y * 17.0 + aRand.z * 7.0;
  vec3 flutter = vec3(sin(uFlakeTime * (1.1 + s) + ph), 0.25 * sin(uFlakeTime * 2.3 + ph * 1.7), cos(uFlakeTime * (0.9 + s * 0.7) + ph * 1.3)) * uFlutter;
  vec3 fv = vec3(cos(uFlakeTime * (1.1 + s) + ph) * (1.1 + s), 0.0, -sin(uFlakeTime * (0.9 + s * 0.7) + ph * 1.3) * (0.9 + s * 0.7)) * uFlutter;
  vec3 p = aRand.xyz * uBox + uOffset * speed + flutter;
  vec3 rel = mod(p - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 wp = cameraPosition + rel;
  vWorld = wp;
  #ifdef USE_FOG
    vFogWorldPos = vWorld;
  #endif
  vec3 vel = uVel * speed + fv;
  vec4 c1 = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vec4 c2 = projectionMatrix * viewMatrix * vec4(wp - vel * uStreak, 1.0);
  float dist = length(rel);
  if (c1.w < 0.05 || c2.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  vec2 s1 = c1.xy / c1.w * uViewport * 0.5;
  vec2 s2 = c2.xy / c2.w * uViewport * 0.5;
  vec2 d = s1 - s2;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float sizePx = uSize * (0.55 + 0.9 * s * s) * projectionMatrix[1][1] * uViewport.y * 0.5 / c1.w;
  float sz = max(sizePx, 1.4);
  float halfW = sz * 0.5;
  float halfL = halfW + len * 0.5;
  vLen = halfL / halfW;
  vec2 centerPx = 0.5 * (s1 + s2);
  vec2 px = centerPx + dir * position.x * halfL + nrm * position.y * halfW;
  vUv = position.xy;
  // Energy: sub-pixel flakes fade instead of shrinking, long streaks spread their light.
  float cover = min(1.0, (sizePx * sizePx) / (sz * sz));
  float spread = 1.0 / (1.0 + len / max(sz, 1.0) * 0.07);
  float nearFade = smoothstep(0.25, 1.1, dist);
  float farFade = 1.0 - smoothstep(uBox * 0.36, uBox * 0.5, max(max(abs(rel.x), abs(rel.y)), abs(rel.z)));
  vAlpha = cover * spread * nearFade * farFade * (0.55 + 0.45 * s);
  gl_Position = vec4(px / (uViewport * 0.5) * c1.w, c1.z, c1.w);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uAmb;
uniform vec3 uKey;
uniform vec3 uKeyDir;
uniform float uOpacity;
varying vec2 vUv;
varying float vLen;
varying float vAlpha;
varying vec3 vWorld;
${FOG_PARS_FRAGMENT}

void main() {
  if (vAlpha <= 0.003) discard;
  float x = vUv.x * vLen;
  float ax = clamp(x, -(vLen - 1.0), vLen - 1.0);
  float d = length(vec2(x - ax, vUv.y));
  float a = smoothstep(1.0, 0.15, d);
  a *= vAlpha * uOpacity;
  if (a <= 0.003) discard;
  vec3 v = normalize(vWorld - cameraPosition);
  float fwd = pow(max(dot(v, uKeyDir), 0.0), 6.0);
  vec3 col = uAmb + uKey * (0.35 + 2.5 * fwd);
  gl_FragColor = vec4(col, a);
  #ifdef USE_FOG
    gl_FragColor.rgb = mzApplyFog(gl_FragColor.rgb, vWorld);
  #endif
}
`;

export function createSnowfall(G) {
  const MAX = G.quality === 'high' ? 20000 : G.quality === 'medium' ? 11000 : 5000;
  const BOX = 36;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const r = rng(91);
  const rand = new Float32Array(MAX * 4);
  for (let i = 0; i < MAX * 4; i++) rand[i] = r();
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uOffset: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3() },
    uBox: { value: BOX },
    uSize: { value: 0.02 },
    uStreak: { value: 0.03 },
    uFlutter: { value: 0.3 },
    uFlakeTime: { value: 0 },
    uViewport: { value: new THREE.Vector2(1280, 720) },
    uAmb: { value: new THREE.Color(0.5, 0.55, 0.6) },
    uKey: { value: new THREE.Color(0.5, 0.45, 0.4) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uOpacity: { value: 0.9 },
  };
  Object.assign(uniforms, fogUniforms());
  const material = new THREE.ShaderMaterial({
    name: 'mz-snowfall',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'snowfall';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.visible = false;
  G.scene.add(mesh);

  const size = new THREE.Vector2();
  const tmpC = new THREE.Color();
  const out = { mesh, density: 0 };
  out.update = (dt) => {
    const W = G.weather.params;
    const wind = G.weather.wind;
    const dens = Math.pow(Math.min(1, W.snowfall), 0.8);
    out.density = dens;
    geo.instanceCount = Math.floor(MAX * dens);
    mesh.visible = geo.instanceCount > 0;
    if (!mesh.visible) return;

    const ws = (wind.strength * 13 + wind.gust * 7) * (0.35 + 0.65 * W.snowfall);
    const fall = 1.1 + 0.9 * W.snowfall;
    const vel = uniforms.uVel.value.set(wind.dir.x * ws, -fall, wind.dir.y * ws);
    const step = G.shot ? 0 : dt;
    const off = uniforms.uOffset.value.addScaledVector(vel, step);
    if (off.lengthSq() > 1e10) off.set(0, 0, 0);
    uniforms.uFlakeTime.value += step;
    uniforms.uFlutter.value = 0.35 * (1 - 0.6 * wind.strength);
    uniforms.uStreak.value = 0.022 + 0.02 * wind.strength;
    uniforms.uSize.value = 0.022 + 0.02 * wind.strength;
    G.renderer.getDrawingBufferSize(size);
    uniforms.uViewport.value.copy(size);

    const A = G.atmosphere;
    if (A?.look) {
      const L = A.look;
      // Flakes catch the sky and the snow bounce, and always read brighter than the air.
      const amb = uniforms.uAmb.value.copy(L.hor).multiplyScalar(0.55).add(tmpC.copy(L.zen).multiplyScalar(0.45));
      amb.add(tmpC.copy(L.hemiGround).multiplyScalar(0.25));
      const fog = G.uniforms.uFogColor.value;
      amb.setRGB(Math.max(amb.r, fog.r * 1.9), Math.max(amb.g, fog.g * 1.9), Math.max(amb.b, fog.b * 1.9));
      uniforms.uKey.value.copy(A.keyColor).multiplyScalar(A.keyIntensity * 0.1);
      uniforms.uKeyDir.value.copy(A.keyDir);
    }
  };
  return out;
}
