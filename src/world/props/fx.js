// Small environment FX for the whole game: fire, smoke, steam, sparks, torch, candle, will-o-wisp,
// character breath, static glows. ONE shared pool of billboard particles drawn in ONE draw call
// (premultiplied alpha: smoke and flames share a single depth-sorted pass), ONE update system,
// and a tiny pool of PointLights assigned to the fires nearest the camera.
//
//   import { fx } from './fx.js';                 (also exposed as props.fx)
//   const f = fx.fire({ position: [x, y, z], parent: G.scene, scale: 1, light: true, smoke: true });
//   const s = fx.smoke({ position, parent, height: 35, rate: 1.4 });     chimney column
//   fx.steam / fx.sparks / fx.torch / fx.candle / fx.wisp / fx.breath / fx.glow / fx.burst
//   emitter: { object (Object3D anchor), setActive(b), setIntensity(x), dispose() }
//
// Emitters only run while their anchor is in the scene graph, so a prop that is built but not
// added costs nothing. Static emitters pre-simulate on creation (smoke columns are full height
// from the first frame, even in a one-frame screenshot).
import * as THREE from 'three';
import { G, ORDER } from '../../core/G.js';
import { U } from '../../render/Uniforms.js';
import { FOG_PARS_FRAGMENT, FOG_UNIFORM_NAMES } from '../../render/fogChunk.js';
import { rng } from '../../core/util.js';
import { vn, fbm, sstep } from './tex.js';

const TAU = Math.PI * 2;
const R = rng(90210);
const rand = () => R();

// Atlas cells (4 x 2, row 0 at the bottom of the texture).
const CELL = { puffA: 0, flame: 1, glow: 2, ember: 3, spark: 4, wisp: 5, puffB: 6, puffC: 7 };
// Particle kinds.
const K = { smoke: 0, flame: 1, ember: 2, spark: 3, steam: 4, breath: 5, glow: 6, wisp: 7, powder: 8, mote: 9 };

// Per-kind physics: wind (m/s at full strength), windK (1/s relaxation toward the wind), buoy (m/s^2), turb (m/s^2).
const KP = [];
KP[K.smoke] = { wind: 5.5, windK: 0.22, buoy: 0, turb: 0.35 };
KP[K.flame] = { wind: 0.9, windK: 2.5, buoy: 0.8, turb: 1.4 };
KP[K.ember] = { wind: 3.2, windK: 0.7, buoy: 0.3, turb: 1.6 };
KP[K.spark] = { wind: 0.5, windK: 0.3, buoy: -9.0, turb: 0 };
KP[K.steam] = { wind: 4.5, windK: 0.3, buoy: 0, turb: 0.55 };
KP[K.breath] = { wind: 2.0, windK: 0.6, buoy: 0.05, turb: 0.25 };
KP[K.glow] = { wind: 0, windK: 0, buoy: 0, turb: 0 };
KP[K.wisp] = { wind: 0.4, windK: 0.5, buoy: 0, turb: 0.4 };
KP[K.powder] = { wind: 2.5, windK: 0.9, buoy: -2.6, turb: 0.6 };
KP[K.mote] = { wind: 1.5, windK: 0.8, buoy: 0.0, turb: 0.8 };

// ---------------------------------------------------------------------------------------------
// Atlas: R holds a baked lighting/heat value, A the shape.
function buildAtlas() {
  const W = 512, H = 256, C = 128;
  const data = new Uint8Array(W * H * 4);
  const put = (cx, cy, fn) => {
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x + 0.5) / C, v = (y + 0.5) / C;
        const o = fn(u, v);
        const i = ((cy * C + y) * W + cx * C + x) * 4;
        data[i] = Math.max(0, Math.min(255, o[0] * 255));
        data[i + 1] = Math.max(0, Math.min(255, o[1] * 255));
        data[i + 2] = Math.max(0, Math.min(255, o[2] * 255));
        data[i + 3] = Math.max(0, Math.min(255, o[3] * 255));
      }
    }
  };
  const puff = (seed) => (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const n = fbm(u * 5, v * 5, 5, 5, seed, 4);
    const edge = r + (n - 0.5) * 0.5;
    const a = 1 - sstep(0.08, 0.95, edge);
    const detail = vn(u * 12, v * 12, 12, 12, seed + 5);
    // v grows upward: top of the puff is brighter, the underside darker.
    const lit = 0.5 + 0.42 * (dy + 0.5) + (n - 0.5) * 0.5 + (detail - 0.5) * 0.14;
    const aa = a * (0.72 + 0.28 * n) * (1 - sstep(0.78, 1.0, r));
    return [lit, lit, lit, aa];
  };
  put(CELL.puffA % 4, Math.floor(CELL.puffA / 4), puff(3));
  put(CELL.puffB % 4, Math.floor(CELL.puffB / 4), puff(17));
  put(CELL.puffC % 4, Math.floor(CELL.puffC / 4), puff(41));
  // Flame tongue: fat bulb at the base, tapering and licking at the tip; hot core low in the body.
  put(CELL.flame % 4, Math.floor(CELL.flame / 4), (u, v) => {
    const t = v; // 0 base, 1 tip
    const curl = Math.sin(t * 4.2 + 0.8) * 0.06 * t * t;
    const prof = Math.pow(Math.sin(Math.min(1, t * 1.12 + 0.03) * Math.PI), 0.6);
    const half = 0.43 * prof * (1 - 0.5 * t);
    const du = u - 0.5 - curl;
    const d = Math.abs(du) / Math.max(half, 0.001);
    const lick = vn(u * 6, v * 8, 6, 8, 5);
    const body = 1 - sstep(0.3, 1.0, d + (lick - 0.5) * 0.35 * t);
    const tipFade = 1 - sstep(0.62, 1.0, t + (lick - 0.5) * 0.22);
    const baseFade = sstep(0.0, 0.07, t);
    const a = body * tipFade * baseFade;
    const core = (1 - sstep(0.0, 0.85, d)) * (1 - sstep(0.05, 0.85, t));
    const heat = Math.min(1, core * 1.0 + (1 - t) * 0.22 + lick * 0.1);
    return [heat, heat, heat, a];
  });
  // Soft gaussian glow.
  put(CELL.glow % 4, Math.floor(CELL.glow / 4), (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.exp(-r * r * 6.5) * (1 - sstep(0.55, 1.0, r));
    return [1, 1, 1, a];
  });
  // Ember dot: small hot core with a soft skirt.
  put(CELL.ember % 4, Math.floor(CELL.ember / 4), (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = (Math.exp(-r * r * 22) * 1.0 + Math.exp(-r * r * 5) * 0.28) * (1 - sstep(0.85, 1.0, r));
    return [1, 1, 1, a];
  });
  // Spark streak: bright head at +u, fading tail toward -u.
  put(CELL.spark % 4, Math.floor(CELL.spark / 4), (u, v) => {
    const dy = Math.abs(v - 0.5) * 2;
    const tail = sstep(0.0, 0.95, u);
    const head = Math.exp(-Math.pow((u - 0.9) * 7, 2));
    const a = (1 - sstep(0.0, 0.85, dy)) * (tail * tail * 0.7 + head) * (1 - sstep(0.94, 1.0, u));
    return [1, 1, 1, a];
  });
  // Wisp: pale core, wide soft halo, faint ring.
  put(CELL.wisp % 4, Math.floor(CELL.wisp / 4), (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.exp(-r * r * 30) * 0.95 + Math.exp(-r * r * 4) * 0.22 + Math.exp(-Math.pow((r - 0.55) * 7, 2)) * 0.05;
    return [1, 1, 1, a * (1 - sstep(0.85, 1.0, r))];
  });
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------
const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aSize;
attribute vec4 aColor;
attribute vec4 aMisc;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec3 vWorld;
varying float vNear;
varying float vBase;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aSize.z), s = sin(aSize.z);
  vec2 q = position.xy;
  vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 wp = aPos + right * (r.x * aSize.x) + up * (r.y * aSize.y);
  float cell = aMisc.x;
  vec2 cuv = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vUv = (cuv + (position.xy + 0.5)) / vec2(4.0, 2.0);
  vColor = aColor;
  vMisc = aMisc;
  vBase = aSize.w;
  vWorld = wp;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vNear = smoothstep(0.25, 1.6, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uSunColor;
uniform float uNight;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec3 vWorld;
varying float vNear;
varying float vBase;
${FOG_PARS_FRAGMENT}

vec3 flameRamp(float h) {
  vec3 c0 = vec3(0.30, 0.025, 0.0);
  vec3 c1 = vec3(1.0, 0.30, 0.04);
  vec3 c2 = vec3(1.0, 0.68, 0.18);
  vec3 c3 = vec3(1.0, 0.93, 0.72);
  return h < 0.4 ? mix(c0, c1, h / 0.4) : (h < 0.75 ? mix(c1, c2, (h - 0.4) / 0.35) : mix(c2, c3, (h - 0.75) / 0.25));
}

void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float mode = vMisc.y;     // 0 smoke (lit, alpha), 1 flame, 2 additive glow
  vec3 rd = normalize(vWorld - cameraPosition);
  // Fog transmittance (1 - fog) from the shared height-fog model.
  vec3 fogT = mzApplyFog(vec3(1.0), vWorld) - mzApplyFog(vec3(0.0), vWorld);
  if (mode < 0.5) {
    float a = t.a * vColor.a * vNear;
    float day = smoothstep(-0.04, 0.22, uSunDir.y);
    float fs = pow(max(dot(rd, uSunDir), 0.0), 3.0);
    vec3 amb = uFogColor * 0.95;
    vec3 sunc = uSunColor * 3.5;
    sunc = mix(vec3(dot(sunc, vec3(0.3, 0.59, 0.11))), sunc, 0.55);
    vec3 sun = sunc * day * (0.55 + 0.9 * fs);
    vec3 lit = vColor.rgb * (amb * 0.8 + sun * t.r * 0.9);
    // Warmth from the fire or windows below (young particles), visible mostly in the dark.
    float vis = 1.0 - 0.75 * day;
    lit += vec3(1.0, 0.46, 0.16) * vMisc.w * vis * (0.35 + 0.65 * t.r) * 1.4;
    vec3 col = mzApplyFog(lit, vWorld);
    gl_FragColor = vec4(col * a, a);
  } else if (mode < 1.5) {
    float heat = t.r * (1.1 - 0.5 * vMisc.z) + vMisc.w;
    vec3 col = flameRamp(clamp(heat, 0.0, 1.0)) * vColor.rgb;
    float gf = vBase < -900.0 ? 1.0 : smoothstep(vBase - 0.02, vBase + 0.22, vWorld.y);
    float a = t.a * vColor.a * vNear * gf;
    gl_FragColor = vec4(col * a * 1.4 * fogT, a * 0.42 * fogT.x);
  } else {
    float gf = vBase < -900.0 ? 1.0 : smoothstep(vBase - 0.02, vBase + 0.35, vWorld.y);
    vec3 col = vColor.rgb * t.a * vColor.a * vNear * gf;
    gl_FragColor = vec4(col * fogT, 0.0);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
class Pool {
  constructor(cap) {
    this.cap = cap;
    this.alive = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
    this.cell = new Uint8Array(cap);
    this.mode = new Uint8Array(cap);
    this.fixed = new Uint8Array(cap);
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.drag = f();
    this.sx = f(); this.sy = f(); this.grow = f();
    this.rot = f(); this.rotV = f(); this.seed = f(); this.warm = f();
    this.cr = f(); this.cg = f(); this.cb = f(); this.ca = f(); this.by = f();
    this.free = new Int32Array(cap);
    this.nFree = cap;
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i;
    this.count = 0;
  }
  alloc() {
    if (this.nFree === 0) return -1;
    const i = this.free[--this.nFree];
    this.alive[i] = 1;
    this.fixed[i] = 0;
    this.count++;
    return i;
  }
  release(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.nFree++] = i;
    this.count--;
  }
}

let pool = null, mesh = null, geo = null, mat = null, sys = null;
let aPos, aSize, aColor, aMisc;
const emitters = new Set();
const lightPool = [];
let rateMul = 1;
const camFwd = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
const keys = new Float64Array(8192);

const wind = { x: 1, z: 0, str: 0.25, gust: 0 };

function readWind() {
  const w = U.uWind.value;
  const l = Math.hypot(w.x, w.y) || 1;
  wind.x = w.x / l; wind.z = w.y / l; wind.str = Math.min(1, Math.max(0, w.z)); wind.gust = w.w;
}

export function install() {
  if (pool) return true;
  if (!G.scene || !G.renderer) return false;
  const q = G.quality;
  const cap = q === 'low' ? 1400 : q === 'medium' ? 2600 : 4000;
  rateMul = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1;
  pool = new Pool(cap);
  const quad = new THREE.PlaneGeometry(1, 1);
  geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  aColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aColor', aColor);
  geo.setAttribute('aMisc', aMisc);
  geo.instanceCount = 0;
  const uniforms = { uAtlas: { value: buildAtlas() }, uSunColor: U.uSunColor, uNight: U.uNight };
  for (const n of FOG_UNIFORM_NAMES) uniforms[n] = U[n];
  mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { USE_FOG: '' },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
  mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'props-fx-particles';
  G.scene.add(mesh);

  const nLights = q === 'low' ? 1 : q === 'medium' ? 2 : 4;
  for (let i = 0; i < nLights; i++) {
    const l = new THREE.PointLight(0xffa050, 0, 12, 2);
    l.castShadow = false;
    l.name = 'props-fx-light';
    G.scene.add(l);
    lightPool.push({ light: l, target: null, k: 0 });
  }
  sys = G.addSystem('props-fx', update, ORDER.atmosphere + 5);
  return true;
}

export function dispose() {
  if (!pool) return;
  if (sys) sys();
  for (const e of [...emitters]) e.dispose();
  G.scene.remove(mesh);
  for (const l of lightPool) { G.scene.remove(l.light); l.light.dispose(); }
  lightPool.length = 0;
  geo.dispose(); mat.uniforms.uAtlas.value.dispose(); mat.dispose();
  pool = mesh = geo = mat = sys = null;
}

// ---- particle spawn / integrate ---------------------------------------------------------------
function spawn(p) {
  if (!pool) return -1;
  const i = pool.alloc();
  if (i < 0) return -1;
  pool.kind[i] = p.kind;
  pool.cell[i] = p.cell;
  pool.mode[i] = p.mode;
  pool.px[i] = p.x; pool.py[i] = p.y; pool.pz[i] = p.z;
  pool.vx[i] = p.vx || 0; pool.vy[i] = p.vy || 0; pool.vz[i] = p.vz || 0;
  pool.age[i] = 0;
  pool.life[i] = p.life;
  pool.drag[i] = p.drag == null ? 0.1 : p.drag;
  pool.sx[i] = p.sx; pool.sy[i] = p.sy == null ? p.sx : p.sy;
  pool.grow[i] = p.grow == null ? 1 : p.grow;
  pool.rot[i] = p.rot || 0; pool.rotV[i] = p.rotV || 0;
  pool.seed[i] = rand() * 100;
  pool.warm[i] = p.warm || 0;
  pool.cr[i] = p.r; pool.cg[i] = p.g; pool.cb[i] = p.b; pool.ca[i] = p.a;
  pool.by[i] = p.by == null ? -999 : p.by;
  if (p.advance) advance(i, p.advance);
  return i;
}

function advance(i, t) {
  while (t > 1e-4 && pool.alive[i]) {
    const s = Math.min(0.2, t);
    integrate(i, s);
    t -= s;
  }
}

function integrate(i, dt) {
  const P = pool;
  const k = P.kind[i];
  const prm = KP[k];
  P.age[i] += dt;
  if (P.age[i] >= P.life[i]) { P.release(i); return; }
  if (prm.windK > 0) {
    const ws = (wind.str * 0.9 + wind.gust * 0.3) * prm.wind;
    const c = 1 - Math.exp(-prm.windK * dt);
    P.vx[i] += (wind.x * ws - P.vx[i]) * c;
    P.vz[i] += (wind.z * ws - P.vz[i]) * c;
  }
  P.vy[i] += prm.buoy * dt;
  const dr = Math.exp(-P.drag[i] * dt);
  P.vy[i] *= dr;
  if (k === K.spark || k === K.powder || k === K.breath) { P.vx[i] *= dr; P.vz[i] *= dr; }
  if (prm.turb > 0) {
    const a = P.age[i] * 1.3 + P.seed[i];
    P.vx[i] += Math.sin(a * 1.7) * prm.turb * dt;
    P.vz[i] += Math.cos(a * 1.3 + 1.7) * prm.turb * dt;
    if (k === K.ember || k === K.wisp || k === K.mote) P.vy[i] += Math.sin(a * 2.3) * prm.turb * 0.4 * dt;
  }
  P.px[i] += P.vx[i] * dt; P.py[i] += P.vy[i] * dt; P.pz[i] += P.vz[i] * dt;
  P.rot[i] += P.rotV[i] * dt;
}

// Look curves: returns size multiplier in out[0] and alpha multiplier in out[1].
const look = [0, 0];
function curve(i) {
  const t = pool.age[i] / pool.life[i];
  const k = pool.kind[i];
  switch (k) {
    case K.smoke: case K.steam: case K.breath: case K.powder: {
      look[0] = 1 + (pool.grow[i] - 1) * Math.pow(t, 0.6);
      look[1] = sstep(0.0, k === K.breath ? 0.12 : 0.08, t) * Math.pow(1 - t, k === K.breath ? 1.2 : 1.35);
      break;
    }
    case K.flame: {
      look[0] = (0.55 + 0.45 * sstep(0, 0.18, t)) * Math.pow(1 - t, 0.75);
      look[1] = sstep(0, 0.1, t) * Math.pow(1 - t, 1.2);
      break;
    }
    case K.ember: {
      look[0] = 1 - t * 0.6;
      const fl = 0.65 + 0.35 * Math.sin(pool.age[i] * 19 + pool.seed[i] * 5);
      look[1] = sstep(0, 0.06, t) * (1 - t * t) * fl;
      break;
    }
    case K.spark: {
      look[0] = 1 - t * 0.4;
      look[1] = (1 - t) * (1 - t) * (0.7 + 0.3 * Math.sin(pool.age[i] * 40 + pool.seed[i]));
      break;
    }
    case K.wisp: case K.mote: {
      look[0] = 1 - t * 0.5;
      look[1] = sstep(0, 0.2, t) * (1 - sstep(0.6, 1, t));
      break;
    }
    default: { look[0] = 1; look[1] = 1; }
  }
}

// ---- per frame ----------------------------------------------------------------------------------
function update(dt) {
  if (!pool) return;
  dt = Math.min(dt, 0.1);
  readWind();
  lateWarm();
  const cam = G.camera;
  camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
  camRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
  camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;

  for (const e of emitters) e.step(dt, cx, cy, cz);
  assignLights(dt, cx, cy, cz);

  const P = pool;
  let n = 0;
  const cap = P.cap;
  for (let i = 0; i < cap; i++) {
    if (!P.alive[i]) continue;
    if (!P.fixed[i]) integrate(i, dt);
    if (!P.alive[i]) continue;
    const d = (P.px[i] - cx) * camFwd.x + (P.py[i] - cy) * camFwd.y + (P.pz[i] - cz) * camFwd.z;
    if (d < 0.05 || d > 2500) continue;
    if (n < keys.length) keys[n++] = Math.floor(d * 8) * 8192 + i;
  }
  const sorted = keys.subarray(0, n).sort();
  const pa = aPos.array, sa = aSize.array, ca = aColor.array, ma = aMisc.array;
  const cells = P.cell, modes = P.mode;
  for (let j = 0; j < n; j++) {
    const i = sorted[n - 1 - j] % 8192;
    const o3 = j * 3, o4 = j * 4;
    pa[o3] = P.px[i]; pa[o3 + 1] = P.py[i]; pa[o3 + 2] = P.pz[i];
    const k = P.kind[i];
    const t = P.age[i] / P.life[i];
    let sizeX = P.sx[i], sizeY = P.sy[i], rot = P.rot[i], a;
    if (k === K.glow) {
      sa[o4] = sizeX; sa[o4 + 1] = sizeY; sa[o4 + 2] = 0; sa[o4 + 3] = P.by[i];
      ca[o4] = P.cr[i]; ca[o4 + 1] = P.cg[i]; ca[o4 + 2] = P.cb[i]; ca[o4 + 3] = P.ca[i];
      ma[o4] = cells[i]; ma[o4 + 1] = modes[i]; ma[o4 + 2] = 0; ma[o4 + 3] = P.warm[i];
      continue;
    }
    curve(i);
    sizeX *= look[0]; sizeY *= look[0];
    a = P.ca[i] * look[1];
    if (k === K.spark) {
      // Stretch along the screen-space velocity.
      const vr = P.vx[i] * camRight.x + P.vy[i] * camRight.y + P.vz[i] * camRight.z;
      const vu = P.vx[i] * camUp.x + P.vy[i] * camUp.y + P.vz[i] * camUp.z;
      rot = Math.atan2(vu, vr);
      const sp = Math.hypot(vr, vu);
      sizeX = P.sx[i] * (0.4 + Math.min(sp * 0.05, 1.4)) * look[0];
      sizeY = P.sy[i] * look[0];
    } else if (k === K.flame) {
      // Tongues sway with the wind and flicker in width.
      rot = Math.sin(P.age[i] * 9 + P.seed[i]) * 0.12 + (wind.x * camRight.x + wind.z * camRight.z) * wind.str * 0.35;
      sizeX *= 0.9 + 0.2 * Math.sin(P.age[i] * 17 + P.seed[i] * 3);
    }
    sa[o4] = sizeX; sa[o4 + 1] = sizeY; sa[o4 + 2] = rot; sa[o4 + 3] = P.by[i];
    ca[o4] = P.cr[i]; ca[o4 + 1] = P.cg[i]; ca[o4 + 2] = P.cb[i]; ca[o4 + 3] = a;
    ma[o4] = cells[i]; ma[o4 + 1] = modes[i]; ma[o4 + 2] = t; ma[o4 + 3] = k === K.flame ? P.warm[i] : P.warm[i] * Math.max(0, 1 - P.age[i] / 3);
  }
  geo.instanceCount = n;
  aPos.needsUpdate = aSize.needsUpdate = aColor.needsUpdate = aMisc.needsUpdate = true;
  fx.stats.alive = P.count;
  fx.stats.drawn = n;
}

// ---- lights -------------------------------------------------------------------------------------
function assignLights(dt, cx, cy, cz) {
  if (!lightPool.length) return;
  const cands = [];
  for (const e of emitters) {
    if (!e.lightSpec || !e.live || !e.active) continue;
    const dx = e.wx - cx, dy = e.wy - cy, dz = e.wz - cz;
    e._d2 = dx * dx + dy * dy + dz * dz;
    if (e._d2 > 90 * 90) continue;
    cands.push(e);
  }
  cands.sort((a, b) => a._d2 / (a.lightSpec.weight || 1) - b._d2 / (b.lightSpec.weight || 1));
  const want = cands.slice(0, lightPool.length);
  // Release lights whose target is no longer wanted; fade them out before reuse.
  for (const s of lightPool) {
    if (s.target && !want.includes(s.target)) {
      s.k = Math.max(0, s.k - dt * 5);
      if (s.k <= 0) s.target = null;
    }
  }
  for (const e of want) {
    if (lightPool.some((s) => s.target === e)) continue;
    const free = lightPool.find((s) => !s.target);
    if (free) { free.target = e; free.k = 0; }
  }
  const t = G.clock.elapsed;
  for (const s of lightPool) {
    const e = s.target;
    if (!e) { s.light.intensity = 0; continue; }
    if (want.includes(e)) s.k = Math.min(1, s.k + dt * 4);
    const ls = e.lightSpec;
    s.light.position.set(e.wx, e.wy + (ls.lift || 0.35), e.wz);
    s.light.color.setRGB(ls.r, ls.g, ls.b);
    s.light.distance = ls.range;
    s.light.decay = 2;
    s.light.intensity = ls.intensity * e.intensity * e.flicker(t) * s.k;
  }
}

// ---- emitters -----------------------------------------------------------------------------------
const _v = new THREE.Vector3();

function toVec(p) {
  if (!p) return [0, 0, 0];
  if (Array.isArray(p)) return p;
  return [p.x, p.y, p.z];
}

class Emitter {
  constructor(o = {}) {
    install();
    this.o = o;
    this.object = new THREE.Object3D();
    const p = toVec(o.position);
    this.object.position.set(p[0], p[1], p[2]);
    this.object.userData.emitter = this;
    this.object.name = 'fx';
    this.active = true;
    this.intensity = o.intensity == null ? 1 : o.intensity;
    this.wx = p[0]; this.wy = p[1]; this.wz = p[2];
    this.live = false;
    this.lod = 1;
    this.phase = rand() * 100;
    this.persist = []; // fixed particle slots
    this.lightSpec = null;
    emitters.add(this);
    if (o.parent) o.parent.add(this.object);
  }
  get inScene() {
    let n = this.object;
    while (n) { if (n === G.scene) return true; n = n.parent; }
    return false;
  }
  setActive(b) { this.active = !!b; return this; }
  setIntensity(x) { this.intensity = x; return this; }
  flicker(t) { return 1 + 0.12 * Math.sin(t * 17.3 + this.phase) * Math.sin(t * 5.1 + this.phase * 2); }
  step(dt, cx, cy, cz) {
    this.live = this.inScene && this.active;
    if (this.live) {
      this.object.getWorldPosition(_v);
      this.wx = _v.x; this.wy = _v.y; this.wz = _v.z;
      const dx = this.wx - cx, dy = this.wy - cy, dz = this.wz - cz;
      this.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.tick(dt, 0);
    }
    this.updatePersistent(this.live, G.clock.elapsed);
  }
  tick() {}
  updatePersistent() {}
  prewarm(T, stepT = 0.1) {
    if (!this.inScene) { this._pendingPrewarm = T; return; }
    this.object.updateWorldMatrix(true, false);
    this.object.getWorldPosition(_v);
    this.wx = _v.x; this.wy = _v.y; this.wz = _v.z;
    this.dist = 0;
    this.live = true;
    readWind();
    for (let t = 0; t < T; t += stepT) this.tick(stepT, Math.max(0, T - t - stepT));
  }
  persistent(p) {
    const i = spawn({ life: 1e9, ...p });
    if (i >= 0) pool.fixed[i] = 1;
    this.persist.push(i);
    return i;
  }
  dispose() {
    for (const i of this.persist) if (i >= 0) pool.release(i);
    this.persist.length = 0;
    emitters.delete(this);
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

// Shared helper: a persistent glow quad.
function glowParticle(r, g, b) {
  return { kind: K.glow, cell: CELL.glow, mode: 2, x: 0, y: -999, z: 0, sx: 1, sy: 1, r, g, b, a: 0 };
}

// Rate accumulator. Returns the number of particles to spawn this tick.
function acc(e, key, rate, dt) {
  const k = '_acc_' + key;
  e[k] = (e[k] || 0) + rate * dt;
  const n = Math.floor(e[k]);
  e[k] -= n;
  return n;
}

// ---- fire ---------------------------------------------------------------------------------------
class Fire extends Emitter {
  constructor(o) {
    super(o);
    const s = o.scale == null ? 1 : o.scale;
    this.s = s;
    this.R = (o.radius == null ? 0.2 : o.radius) * s;
    this.H = (o.height == null ? 0.85 : o.height) * s;
    this.smoke = o.smoke !== false;
    this.embers = o.embers !== false;
    this.tint = o.tint || [1, 0.62, 0.24];
    if (o.light !== false) {
      this.lightSpec = {
        r: 1.0, g: 0.6, b: 0.28, range: (o.lightRange || 11) * Math.sqrt(s), intensity: (o.lightIntensity == null ? 3.2 : o.lightIntensity) * s, weight: 1.2 * s, lift: this.H * 0.6,
      };
    }
    this.halo = this.persistent(glowParticle(1.0, 0.5, 0.18));
    this.core = this.persistent(glowParticle(1.0, 0.42, 0.1));
    if (o.prewarm !== false) this.prewarm(this.smoke ? 7 : 1.2);
  }
  flicker(t) {
    const p = this.phase;
    return 0.86 + 0.14 * Math.sin(t * 13.1 + p) * Math.sin(t * 7.7 + p * 2.0) + 0.1 * Math.sin(t * 29 + p * 3) * Math.sin(t * 3.3 + p);
  }
  tick(dt, adv) {
    const lod = this.dist > 160 ? 0.3 : this.dist > 80 ? 0.55 : 1;
    const it = this.intensity * rateMul;
    const n = acc(this, 'a', 62 * this.s * it * lod, dt);
    for (let j = 0; j < n; j++) {
      const a = this.R * Math.sqrt(rand()), th = rand() * TAU;
      const inner = rand() < 0.35;
      const life = (inner ? 0.35 + rand() * 0.25 : 0.5 + rand() * 0.45) * (0.75 + 0.25 * Math.sqrt(this.s));
      const wide = Math.max(this.R * 1.9, this.H * 0.42);
      const sx = (inner ? 0.55 + rand() * 0.3 : 0.8 + rand() * 0.5) * wide;
      const hgt = this.H * (inner ? 0.62 : 1.05);
      spawn({
        kind: K.flame, cell: CELL.flame, mode: 1,
        x: this.wx + Math.cos(th) * a * (inner ? 0.5 : 1), y: this.wy + sx * 0.5, z: this.wz + Math.sin(th) * a * (inner ? 0.5 : 1),
        vx: (rand() - 0.5) * 0.2, vy: hgt / life / 0.8 * (0.8 + rand() * 0.4), vz: (rand() - 0.5) * 0.2,
        drag: 0.9, life, sx, sy: sx * 1.55, grow: 1, rot: 0, by: this.wy,
        r: this.tint[0], g: this.tint[1], b: this.tint[2], a: (inner ? 0.8 : 0.62) * Math.min(1, it + 0.2), warm: inner ? 0.22 : 0, advance: adv,
      });
    }
    if (this.embers) {
      const ne = acc(this, 'e', 6 * this.s * it * lod, dt);
      for (let j = 0; j < ne; j++) {
        const a = this.R * Math.sqrt(rand()), th = rand() * TAU;
        spawn({
          kind: K.ember, cell: CELL.ember, mode: 2,
          x: this.wx + Math.cos(th) * a, y: this.wy + this.H * 0.4, z: this.wz + Math.sin(th) * a,
          vx: (rand() - 0.5) * 0.5, vy: 0.5 + rand() * 1.1, vz: (rand() - 0.5) * 0.5,
          drag: 0.15, life: 1.2 + rand() * 2.6, sx: 0.028 + rand() * 0.02, sy: 0.028 + rand() * 0.02,
          r: 1.0, g: 0.5 + rand() * 0.2, b: 0.15, a: 1.8, advance: adv,
        });
      }
    }
    if (this.smoke) {
      const ns = acc(this, 's', 0.9 * this.s * Math.min(1, it), dt);
      for (let j = 0; j < ns; j++) {
        spawn({
          kind: K.smoke, cell: rand() < 0.5 ? CELL.puffA : CELL.puffB, mode: 0,
          x: this.wx + (rand() - 0.5) * this.R, y: this.wy + this.H * 0.9, z: this.wz + (rand() - 0.5) * this.R,
          vx: 0, vy: 1.5 + rand() * 0.5, vz: 0, drag: 0.22, life: 6.5 + rand() * 2.5,
          sx: 0.32 * this.s + 0.1, grow: 7 + rand() * 3, rot: rand() * TAU, rotV: (rand() - 0.5) * 0.3,
          r: 0.42, g: 0.42, b: 0.46, a: 0.34, warm: 0.5, advance: adv,
        });
      }
    }
  }
  updatePersistent(live, t) {
    const i = this.halo, c = this.core;
    if (i < 0) return;
    const f = this.flicker(t);
    const day = Math.max(0, Math.min(1, U.uSunDir.value.y * 2.5 + 0.35));
    pool.px[i] = this.wx; pool.py[i] = this.wy + this.H * 0.6; pool.pz[i] = this.wz; pool.by[i] = this.wy;
    const sz = this.H * (2.2 + 0.3 * f);
    pool.sx[i] = pool.sy[i] = live ? sz : 0;
    pool.ca[i] = live ? this.intensity * (0.02 + 0.3 * (1 - day)) * f : 0;
    if (c >= 0) {
      pool.px[c] = this.wx; pool.py[c] = this.wy + this.H * 0.28; pool.pz[c] = this.wz; pool.by[c] = this.wy;
      pool.sx[c] = pool.sy[c] = live ? this.H * (0.85 + 0.15 * f) : 0;
      pool.ca[c] = live ? this.intensity * (0.35 + 0.25 * (1 - day)) * f : 0;
    }
  }
}

// ---- smoke column (chimneys) ---------------------------------------------------------------------
class Smoke extends Emitter {
  constructor(o) {
    super(o);
    const height = o.height == null ? 34 : o.height;
    this.rate = o.rate == null ? 2.6 : o.rate;
    this.life = Math.max(6, Math.min(32, height * 0.75));
    this.d = 1.6 / this.life;
    this.v0 = (height * this.d) / 0.8;
    this.size = o.size == null ? 1 : o.size;
    this.col = o.color || [0.46, 0.46, 0.5];
    this.alpha = o.opacity == null ? 0.36 : o.opacity;
    this.warm = o.warm == null ? 0.2 : o.warm;
    this.steamLike = false;
    this.fixedLife = true;
    if (o.prewarm !== false) this.prewarm(this.life);
  }
  tick(dt, adv) {
    const n = acc(this, 'a', this.rate * this.intensity * rateMul, dt);
    for (let j = 0; j < n; j++) {
      const life = this.life * (0.85 + rand() * 0.3);
      spawn({
        kind: K.smoke, cell: [CELL.puffA, CELL.puffB, CELL.puffC][Math.floor(rand() * 3)], mode: 0,
        x: this.wx + (rand() - 0.5) * 0.25, y: this.wy, z: this.wz + (rand() - 0.5) * 0.25,
        vx: (rand() - 0.5) * 0.25, vy: this.v0 * (0.85 + rand() * 0.3), vz: (rand() - 0.5) * 0.25,
        drag: this.d, life, sx: 0.9 * this.size, grow: 9 + rand() * 4, rot: rand() * TAU, rotV: (rand() - 0.5) * 0.12,
        r: this.col[0], g: this.col[1], b: this.col[2], a: this.alpha * (0.8 + rand() * 0.4), warm: this.warm, advance: adv,
      });
    }
  }
}

// ---- steam --------------------------------------------------------------------------------------
class Steam extends Emitter {
  constructor(o) {
    super(o);
    this.rate = o.rate == null ? 5 : o.rate;
    this.height = o.height == null ? 6 : o.height;
    this.spread = o.spread == null ? 0.4 : o.spread;
    this.size = o.size == null ? 1 : o.size;
    this.life = Math.max(3, this.height * 0.9);
    this.d = 1.6 / this.life;
    this.v0 = (this.height * this.d) / 0.8;
    this.alpha = o.opacity == null ? 0.3 : o.opacity;
    this.warm = o.warm == null ? 0.08 : o.warm;
    if (o.prewarm !== false) this.prewarm(this.life);
  }
  tick(dt, adv) {
    const n = acc(this, 'a', this.rate * this.intensity * rateMul * (this.dist > 140 ? 0.5 : 1), dt);
    for (let j = 0; j < n; j++) {
      const a = this.spread * Math.sqrt(rand()), th = rand() * TAU;
      spawn({
        kind: K.steam, cell: [CELL.puffA, CELL.puffB, CELL.puffC][Math.floor(rand() * 3)], mode: 0,
        x: this.wx + Math.cos(th) * a, y: this.wy, z: this.wz + Math.sin(th) * a,
        vx: (rand() - 0.5) * 0.3, vy: this.v0 * (0.7 + rand() * 0.6), vz: (rand() - 0.5) * 0.3,
        drag: this.d, life: this.life * (0.8 + rand() * 0.4), sx: 0.7 * this.size, grow: 5 + rand() * 3, rot: rand() * TAU, rotV: (rand() - 0.5) * 0.25,
        r: 0.9, g: 0.93, b: 0.97, a: this.alpha * (0.7 + rand() * 0.5), warm: this.warm, advance: adv,
      });
    }
  }
}

// ---- sparks (forge) ------------------------------------------------------------------------------
class Sparks extends Emitter {
  constructor(o) {
    super(o);
    this.every = o.every || [1.2, 3.2];
    this.count = o.count || 14;
    this.t = rand() * 2;
    this.auto = o.auto !== false;
    if (o.light) {
      this.lightSpec = { r: 1, g: 0.62, b: 0.3, range: 9, intensity: 6, weight: 0.6, lift: 0 };
      this.pulse = 0;
    }
  }
  flicker() { return this.pulse || 0; }
  burst(n = this.count) {
    for (let j = 0; j < n; j++) {
      const th = rand() * TAU, up = 0.35 + rand() * 0.65;
      const sp = 1.6 + rand() * 3.4;
      spawn({
        kind: K.spark, cell: CELL.spark, mode: 2,
        x: this.wx, y: this.wy, z: this.wz,
        vx: Math.cos(th) * sp * (1 - up * 0.5), vy: sp * (0.3 + up) * 0.9, vz: Math.sin(th) * sp * (1 - up * 0.5),
        drag: 0.6, life: 0.35 + rand() * 0.6, sx: 0.12, sy: 0.022, r: 1, g: 0.62 + rand() * 0.3, b: 0.25, a: 2.4,
      });
    }
    this.pulse = 1;
  }
  tick(dt) {
    if (this.pulse) this.pulse = Math.max(0, this.pulse - dt * 6);
    if (!this.auto) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.burst(Math.round(this.count * (0.6 + rand() * 0.8) * rateMul));
      this.t = this.every[0] + rand() * (this.every[1] - this.every[0]);
    }
  }
}

// ---- torch (flame on a stick, small fire) ----------------------------------------------------------
class Torch extends Fire {
  constructor(o) {
    super({ radius: 0.045, height: 0.42, smoke: o.smoke === true, lightRange: 9, lightIntensity: 9, scale: 1, ...o, embers: o.embers !== false, prewarm: false });
    this.s = (o.scale == null ? 1 : o.scale);
    if (o.prewarm !== false) this.prewarm(this.smoke ? 5 : 1);
  }
}

// ---- candle (tiny flame, soft halo, no particles beyond one persistent flame) -------------------------
class Candle extends Emitter {
  constructor(o) {
    super(o);
    this.s = o.scale == null ? 1 : o.scale;
    this.flame = this.persistent({ kind: K.glow, cell: CELL.flame, mode: 1, x: 0, y: -999, z: 0, sx: 0.022 * this.s, sy: 0.052 * this.s, r: 1, g: 0.72, b: 0.32, a: 1.1 });
    this.halo = this.persistent(glowParticle(1.0, 0.55, 0.2));
    if (o.light) this.lightSpec = { r: 1, g: 0.62, b: 0.3, range: 5, intensity: 2.2, weight: 0.7, lift: 0.05 };
  }
  flicker(t) { return 0.85 + 0.15 * Math.sin(t * 11 + this.phase) * Math.sin(t * 4.3 + this.phase) + 0.07 * Math.sin(t * 31 + this.phase); }
  updatePersistent(live, t) {
    const f = this.flicker(t);
    const i = this.flame, h = this.halo;
    if (i >= 0) {
      pool.px[i] = this.wx; pool.py[i] = this.wy + 0.03 * this.s; pool.pz[i] = this.wz;
      pool.sx[i] = 0.024 * this.s * (0.9 + 0.2 * f); pool.sy[i] = 0.058 * this.s * f;
      pool.ca[i] = live ? this.intensity * 1.1 : 0;
      // glow kind skips curves; mode 1 (flame) reads heat from the texture
      pool.warm[i] = 0;
    }
    if (h >= 0) {
      pool.px[h] = this.wx; pool.py[h] = this.wy + 0.05 * this.s; pool.pz[h] = this.wz;
      pool.sx[h] = pool.sy[h] = live ? 0.34 * this.s * (0.9 + 0.2 * f) : 0;
      pool.ca[h] = live ? this.intensity * 0.55 * f : 0;
    }
  }
}

// ---- static glow (lantern halo, window bloom) ---------------------------------------------------------
class Glow extends Emitter {
  constructor(o) {
    super(o);
    this.size = o.size == null ? 0.9 : o.size;
    this.col = o.color || [1.0, 0.58, 0.24];
    this.lamp = o.lamp !== false; // follows uWindowLight
    this.base = o.strength == null ? 0.7 : o.strength;
    this.halo = this.persistent(glowParticle(this.col[0], this.col[1], this.col[2]));
    if (o.light) this.lightSpec = { r: this.col[0], g: this.col[1] * 0.95, b: this.col[2] * 0.9, range: o.lightRange || 9, intensity: o.lightIntensity || 8, weight: 1, lift: 0 };
  }
  flicker(t) { return (this.lamp ? U.uWindowLight.value : 1) * (0.94 + 0.06 * Math.sin(t * 9 + this.phase)); }
  updatePersistent(live, t) {
    const i = this.halo;
    if (i < 0) return;
    const on = this.lamp ? U.uWindowLight.value : 1;
    pool.px[i] = this.wx; pool.py[i] = this.wy; pool.pz[i] = this.wz;
    pool.sx[i] = pool.sy[i] = live && on > 0.01 ? this.size : 0;
    pool.ca[i] = live ? this.base * this.intensity * on * (0.94 + 0.06 * Math.sin(t * 9 + this.phase)) : 0;
  }
}

// ---- will-o-wisp -----------------------------------------------------------------------------------
class Wisp extends Emitter {
  constructor(o) {
    super(o);
    this.rad = o.radius == null ? 1.6 : o.radius;
    this.hover = o.hover == null ? 1.0 : o.hover;
    this.col = o.color || [0.55, 1.0, 0.85];
    this.core = this.persistent({ kind: K.glow, cell: CELL.wisp, mode: 2, x: 0, y: -999, z: 0, sx: 0.5, sy: 0.5, r: this.col[0], g: this.col[1], b: this.col[2], a: 0 });
    this.halo = this.persistent(glowParticle(this.col[0] * 0.6, this.col[1] * 0.9, this.col[2] * 0.9));
    this.wx0 = 0;
  }
  pos(t, out) {
    const p = this.phase;
    out.x = this.wx + Math.sin(t * 0.43 + p) * this.rad + Math.sin(t * 1.1 + p * 2) * this.rad * 0.25;
    out.z = this.wz + Math.cos(t * 0.37 + p * 1.3) * this.rad + Math.cos(t * 0.9 + p) * this.rad * 0.25;
    out.y = this.wy + this.hover + Math.sin(t * 0.8 + p) * 0.25 + Math.sin(t * 2.1 + p) * 0.06;
    return out;
  }
  tick(dt) {
    const t = G.clock.elapsed;
    const vis = 0.3 + 0.7 * U.uNight.value;
    this.pos(t, _v);
    const n = acc(this, 'a', 7 * rateMul * vis, dt);
    for (let j = 0; j < n; j++) {
      spawn({
        kind: K.mote, cell: CELL.ember, mode: 2, x: _v.x, y: _v.y, z: _v.z,
        vx: (rand() - 0.5) * 0.15, vy: 0.04 + rand() * 0.12, vz: (rand() - 0.5) * 0.15,
        drag: 0.3, life: 1.6 + rand() * 1.4, sx: 0.04, sy: 0.04, r: this.col[0] * 0.8, g: this.col[1], b: this.col[2], a: 0.9 * vis,
      });
    }
  }
  updatePersistent(live, t) {
    const vis = (0.3 + 0.7 * U.uNight.value) * this.intensity;
    this.pos(t, _v);
    const f = 0.85 + 0.15 * Math.sin(t * 2.3 + this.phase) * Math.sin(t * 5.1);
    for (const [i, sz, a] of [[this.core, 0.42, 1.5], [this.halo, 1.9, 0.5]]) {
      if (i < 0) continue;
      pool.px[i] = _v.x; pool.py[i] = _v.y; pool.pz[i] = _v.z;
      pool.sx[i] = pool.sy[i] = live ? sz * f : 0;
      pool.ca[i] = live ? a * vis * f : 0;
    }
  }
}

// ---- breath (attach to a head bone or any object near the mouth) -------------------------------------
class Breath extends Emitter {
  constructor(o) {
    super(o);
    this.getSpeed = o.getSpeed || null;
    this.timer = rand() * 2;
    this.exhale = 0;
    this.size = o.size == null ? 1 : o.size;
    this.fwd = new THREE.Vector3(0, 0, 1);
    // dir: optional world-space exhale direction (Vector3, [x,y,z] or () => Vector3); default is the anchor's +Z.
    this.dirSrc = o.dir || null;
    this.dir = null;
  }
  tick(dt) {
    // Only visible in the cold: fades out as the thaw ending melts the snow.
    const cold = U.uSnowCover.value;
    if (cold < 0.15 || (this.dist != null && this.dist > 35)) return;
    const speed = this.getSpeed ? this.getSpeed() : 0;
    const period = speed > 3 ? 0.9 : speed > 0.5 ? 1.7 : 3.0;
    this.timer -= dt;
    if (this.timer <= 0) { this.exhale = 0.45; this.timer = period * (0.9 + rand() * 0.2); }
    if (this.exhale > 0) {
      this.exhale -= dt;
      // Forward = object's +Z in world space (characters face +Z).
      this.object.getWorldQuaternion(_q);
      _f.set(0, 0, 1).applyQuaternion(_q);
      if (this.dirSrc) {
        const d = typeof this.dirSrc === 'function' ? this.dirSrc() : this.dirSrc;
        const v = Array.isArray(d) ? d : [d.x, d.y, d.z];
        _f.set(v[0], v[1], v[2]).normalize();
      }
      const n = acc(this, 'a', 22 * rateMul, dt);
      for (let j = 0; j < n; j++) {
        spawn({
          kind: K.breath, cell: [CELL.puffA, CELL.puffB, CELL.puffC][Math.floor(rand() * 3)], mode: 0,
          x: this.wx, y: this.wy, z: this.wz,
          vx: _f.x * (0.55 + rand() * 0.5) + (rand() - 0.5) * 0.12, vy: 0.12 + rand() * 0.2 + _f.y * 0.5, vz: _f.z * (0.55 + rand() * 0.5) + (rand() - 0.5) * 0.12,
          drag: 1.6, life: 0.9 + rand() * 0.7, sx: 0.05 * this.size, grow: 5.5 + rand() * 2, rot: rand() * TAU, rotV: (rand() - 0.5) * 0.8,
          r: 0.95, g: 0.97, b: 1.0, a: 0.28 * Math.min(1, cold + 0.2),
        });
      }
    }
  }
}
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// One-shot bursts: kind = 'snow' | 'straw' | 'ice' | 'sparks' | 'smoke'.
function burst(kind, position, o = {}) {
  if (!install()) return;
  const p = toVec(position);
  const n = Math.round((o.count || 18) * rateMul);
  readWind();
  for (let j = 0; j < n; j++) {
    const th = rand() * TAU, sp = (o.speed || 1.6) * (0.4 + rand() * 0.9);
    const up = (o.up == null ? 0.7 : o.up) * (0.4 + rand() * 0.8);
    if (kind === 'sparks') {
      spawn({
        kind: K.spark, cell: CELL.spark, mode: 2, x: p[0], y: p[1], z: p[2],
        vx: Math.cos(th) * sp * 1.4, vy: sp * 1.4 * (0.3 + up), vz: Math.sin(th) * sp * 1.4,
        drag: 0.6, life: 0.3 + rand() * 0.5, sx: 0.12, sy: 0.022, r: 1, g: 0.7, b: 0.3, a: 2.4,
      });
    } else {
      const col = kind === 'straw' ? [0.85, 0.7, 0.4] : kind === 'ice' ? [0.82, 0.92, 1.0] : kind === 'smoke' ? [0.4, 0.4, 0.44] : [0.97, 0.98, 1.0];
      spawn({
        kind: K.powder, cell: [CELL.puffA, CELL.puffB, CELL.puffC][Math.floor(rand() * 3)], mode: 0,
        x: p[0] + (rand() - 0.5) * 0.2, y: p[1], z: p[2] + (rand() - 0.5) * 0.2,
        vx: Math.cos(th) * sp, vy: sp * (0.4 + up), vz: Math.sin(th) * sp,
        drag: 1.3, life: 0.7 + rand() * 0.9, sx: (o.size || 0.16) * (0.6 + rand() * 0.8), grow: 3.2, rot: rand() * TAU, rotV: (rand() - 0.5) * 2,
        r: col[0], g: col[1], b: col[2], a: kind === 'smoke' ? 0.35 : 0.7,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
const make = (Cls, o = {}) => new Cls(o);

// If an emitter was created before its anchor joined the scene, finish its pre-simulation then.
function lateWarm() {
  for (const e of emitters) {
    if (e._pendingPrewarm && e.inScene) {
      const T = e._pendingPrewarm;
      e._pendingPrewarm = 0;
      e.prewarm(T);
    }
  }
}

export const fx = {
  install,
  dispose,
  fire: (o) => make(Fire, o),
  smoke: (o) => make(Smoke, o),
  steam: (o) => make(Steam, o),
  sparks: (o) => make(Sparks, o),
  torch: (o) => make(Torch, o),
  candle: (o) => make(Candle, o),
  glow: (o) => make(Glow, o),
  wisp: (o) => make(Wisp, o),
  breath: (o) => make(Breath, o),
  burst,
  // Build an emitter from a prop's fx marker spec (used by props.make and PropBatch).
  fromSpec(spec, worldPos, parent, extra = {}) {
    const f = fx[spec.type];
    if (!f) return null;
    return f({ ...spec.opts, ...extra, position: worldPos, parent });
  },
  stats: { alive: 0, drawn: 0 },
  // Debug: counts per kind and the first few particle states.
  debug() {
    if (!pool) return null;
    const per = {};
    const sample = [];
    for (let i = 0; i < pool.cap; i++) {
      if (!pool.alive[i]) continue;
      per[pool.kind[i]] = (per[pool.kind[i]] || 0) + 1;
      if (pool.kind[i] === K.flame && sample.length < 4) {
        sample.push({ p: [pool.px[i], pool.py[i], pool.pz[i]], s: [pool.sx[i], pool.sy[i]], a: pool.ca[i], age: pool.age[i], life: pool.life[i] });
      }
    }
    return { per, sample, emitters: emitters.size };
  },
};
