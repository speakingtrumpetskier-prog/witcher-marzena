// Tracks in the snow (owned by the lead). A 128 m trail map follows the player; boots, hooves and
// paws press prints into it while they are on the ground, and the terrain shader reads it to dent
// the snow (bent normals, darker blue-grey packed snow, no sparkle). Prints fade over a few minutes,
// faster while it snows. Roads and rock show nothing: the shader weights by snow.
//
//   G.snowTracks.stamp(kind, x, z, yaw = 0, scale = 1)   kind: 'boot' | 'hoof' | 'paw' | 'drag'
//   G.snowTracks.map / rect                                 the render target and { x0, z0, size }
//
// Sources stamped here every frame: the player's feet, Kasza's hooves, every NPC near the player.
// Creatures stamp their own paws (quadruped.js), anything else may call stamp().
import * as THREE from 'three';
import { ORDER } from '../core/G.js';

const RES = 1024;          // texels per side
const SIZE = 128;          // meters per side (12.5 cm per texel)
const RECENTER = 24;       // move the window when the player is this far from its center
const MAX_STAMPS = 512;
const FADE_PER_S = 1 / 255 / 1.1;   // a full print fades in about 4.7 minutes; snowfall speeds it up

// Print shapes in local print space (x across, y along, both in -1..1): depth 0..1.
const STAMP_FS = /* glsl */ `
varying vec2 vUv;
varying float vKind;
varying float vDepth;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = 0.0;
  if (vKind < 0.5) {
    // boot: a sole and a heel with a narrow waist
    float sole = 1.0 - smoothstep(0.75, 1.0, length(vec2(p.x / 0.95, (p.y - 0.28) / 0.7)));
    float heel = 1.0 - smoothstep(0.7, 1.0, length(vec2(p.x / 0.8, (p.y + 0.62) / 0.36)));
    d = max(sole, heel);
  } else if (vKind < 1.5) {
    // hoof: a crescent, deeper at the toe
    float r = length(p);
    d = (1.0 - smoothstep(0.75, 1.0, r)) * (0.75 + 0.25 * smoothstep(-0.6, 0.6, p.y));
    d *= 1.0 - 0.55 * (1.0 - smoothstep(0.2, 0.5, length(p - vec2(0.0, -0.35))));
  } else if (vKind < 2.5) {
    // paw: a pad and four toes
    d = 1.0 - smoothstep(0.35, 0.5, length(p - vec2(0.0, -0.25)));
    for (int i = 0; i < 4; i++) {
      float a = -0.75 + float(i) * 0.5;
      d = max(d, 1.0 - smoothstep(0.12, 0.22, length(p - vec2(sin(a) * 0.48, 0.35 + cos(a) * 0.18))));
    }
  } else {
    // drag: a soft furrow
    d = 1.0 - smoothstep(0.4, 1.0, abs(p.x));
  }
  if (d < 0.01) discard;
  gl_FragColor = vec4(d * vDepth, 0.0, 0.0, 1.0);
}`;

const STAMP_VS = /* glsl */ `
attribute vec4 aStamp;   // x, z, yaw, kind
attribute vec3 aSize;    // half width, half length, depth
uniform vec3 uRect;      // center x, center z, size
varying vec2 vUv;
varying float vKind;
varying float vDepth;
void main() {
  vUv = uv;
  vKind = aStamp.w;
  vDepth = aSize.z;
  vec2 q = (uv * 2.0 - 1.0) * aSize.xy;
  float c = cos(aStamp.z), s = sin(aStamp.z);
  // yaw 0 faces +z (three's convention): local y along the facing, x across it
  vec2 w = aStamp.xy + vec2(q.x * c + q.y * s, -q.x * s + q.y * c);
  gl_Position = vec4((w - uRect.xy) / uRect.z * 2.0, 0.0, 1.0);
}`;

const COPY_FS = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uShift;     // in uv: where this texel was in the old map
uniform float uFade;
varying vec2 vUv;
void main() {
  vec2 s = vUv + uShift;
  float inside = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
  float d = texture2D(uSrc, s).r * inside;
  gl_FragColor = vec4(max(0.0, d - uFade), 0.0, 0.0, 1.0);
}`;

const COPY_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export async function init(G) {
  const U = G.uniforms;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const rts = [new THREE.WebGLRenderTarget(RES, RES, opts), new THREE.WebGLRenderTarget(RES, RES, opts)];
  let cur = 0;
  const rect = { x0: 0, z0: 0, size: SIZE, cx: 0, cz: 0 };

  // Shared uniforms the terrain shader reads (terrainMaterial.js declares them).
  U.uTrackMap ||= { value: null };
  U.uTrackRect ||= { value: new THREE.Vector4(0, 0, SIZE, 0) };

  // Stamp batch: one instanced quad draw per frame.
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const aStamp = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStamp', aStamp);
  geo.setAttribute('aSize', aSize);
  const stampMat = new THREE.ShaderMaterial({
    uniforms: { uRect: { value: new THREE.Vector3(0, 0, SIZE) } },
    vertexShader: STAMP_VS, fragmentShader: STAMP_FS,
    depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const stampMesh = new THREE.Mesh(geo, stampMat);
  stampMesh.frustumCulled = false;
  const stampScene = new THREE.Scene();
  stampScene.add(stampMesh);

  const copyMat = new THREE.ShaderMaterial({
    uniforms: { uSrc: { value: null }, uShift: { value: new THREE.Vector2() }, uFade: { value: 0 } },
    vertexShader: COPY_VS, fragmentShader: COPY_FS, depthTest: false, depthWrite: false,
  });
  const copyScene = new THREE.Scene();
  const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
  copyQuad.frustumCulled = false;
  copyScene.add(copyQuad);
  const cam = new THREE.Camera();

  // Clear both maps once.
  const R = G.renderer;
  const clear = () => {
    const prev = R.getRenderTarget(), cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
    R.setClearColor(0x000000, 0);
    for (const rt of rts) { R.setRenderTarget(rt); R.clear(true, false, false); }
    R.setRenderTarget(prev);
    R.setClearColor(cc, ca);
  };
  clear();

  let n = 0;
  const KIND = { boot: 0, hoof: 1, paw: 2, drag: 3 };
  const SHAPE = { boot: [0.055, 0.14, 1], hoof: [0.075, 0.08, 0.95], paw: [0.05, 0.06, 0.8], drag: [0.25, 0.25, 0.6] };
  const api = {
    get map() { return rts[cur].texture; },
    rect,
    stamp(kind, x, z, yaw = 0, scale = 1) {
      if (n >= MAX_STAMPS) return;
      if (Math.abs(x - rect.cx) > SIZE / 2 || Math.abs(z - rect.cz) > SIZE / 2) return;
      const sh = SHAPE[kind] || SHAPE.boot;
      aStamp.array.set([x, z, yaw, KIND[kind] ?? 0], n * 4);
      aSize.array.set([sh[0] * scale, sh[1] * scale, sh[2]], n * 3);
      n++;
    },
  };
  G.snowTracks = api;

  // Feet that touch the ground this frame: a bone near the ground and nearly still stamps a print.
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const footDown = (bone, groundY, tol) => {
    bone.getWorldPosition(_v);
    return _v.y - groundY < tol;
  };
  const yawOf = (obj) => {
    obj.getWorldDirection(_w);
    return Math.atan2(_w.x, _w.z);
  };
  function stampCharacter(c, scale = 1) {
    const b = c?.bones;
    if (!b?.footL || !c.root?.visible) return;
    const yaw = yawOf(c.root);
    for (const f of [b.footL, b.footR]) {
      if (!f) continue;
      f.getWorldPosition(_v);
      const gy = G.world.heightAt(_v.x, _v.z);
      if (_v.y - gy < 0.13) api.stamp('boot', _v.x + Math.sin(yaw) * 0.05, _v.z + Math.cos(yaw) * 0.05, yaw, scale);
    }
  }
  function stampHorse(h) {
    const b = h?.bones;
    if (!b || !h.root?.visible) return;
    const yaw = yawOf(h.root);
    for (const name of ['hoofFL', 'hoofFR', 'hoofHL', 'hoofHR']) {
      const bone = b[name];
      if (!bone) continue;
      bone.getWorldPosition(_v);
      if (footDown(bone, G.world.heightAt(_v.x, _v.z), 0.12)) api.stamp('hoof', _v.x, _v.z, yaw, 1);
    }
  }

  let fadeAcc = 0;
  G.addSystem('snow-tracks', (dt) => {
    const P = G.player;
    const focus = P?.position || G.camera.position;
    // Sources.
    if (P?.character && !P.mounted) stampCharacter(P.character);
    if (G.horse?.horse) stampHorse(G.horse.horse);
    for (const npc of G.npcs?.list || []) {
      const c = npc.character;
      if (!c?.root) continue;
      const dx = c.root.position.x - focus.x, dz = c.root.position.z - focus.z;
      if (dx * dx + dz * dz < 55 * 55) stampCharacter(c);
    }

    // Recenter (and fade) by copying the old map into the other target, shifted.
    fadeAcc += dt * FADE_PER_S * (1 + 3 * (U.uSnowfall?.value || 0));
    const mx = focus.x - rect.cx, mz = focus.z - rect.cz;
    const far = Math.abs(mx) > RECENTER || Math.abs(mz) > RECENTER;
    if (far || fadeAcc > 1 / 255) {
      const texel = SIZE / RES;
      const ncx = far ? Math.round(focus.x / texel) * texel : rect.cx;
      const ncz = far ? Math.round(focus.z / texel) * texel : rect.cz;
      copyMat.uniforms.uSrc.value = rts[cur].texture;
      copyMat.uniforms.uShift.value.set((ncx - rect.cx) / SIZE, (ncz - rect.cz) / SIZE);
      copyMat.uniforms.uFade.value = fadeAcc >= 1 / 255 ? Math.floor(fadeAcc * 255) / 255 : 0;
      fadeAcc -= copyMat.uniforms.uFade.value;
      const prev = R.getRenderTarget();
      R.setRenderTarget(rts[1 - cur]);
      R.render(copyScene, cam);
      R.setRenderTarget(prev);
      cur = 1 - cur;
      rect.cx = ncx; rect.cz = ncz;
    }
    rect.x0 = rect.cx - SIZE / 2;
    rect.z0 = rect.cz - SIZE / 2;

    // Prints.
    if (n > 0) {
      geo.instanceCount = n;
      aStamp.needsUpdate = true;
      aSize.needsUpdate = true;
      aStamp.addUpdateRange?.(0, n * 4);
      aSize.addUpdateRange?.(0, n * 3);
      stampMat.uniforms.uRect.value.set(rect.cx, rect.cz, SIZE);
      const prev = R.getRenderTarget(), ac = R.autoClear;
      R.autoClear = false;
      R.setRenderTarget(rts[cur]);
      R.render(stampScene, cam);
      R.setRenderTarget(prev);
      R.autoClear = ac;
      n = 0;
    }
    U.uTrackMap.value = rts[cur].texture;
    U.uTrackRect.value.set(rect.x0, rect.z0, SIZE, 1);
  }, ORDER.late ?? 90);
}
