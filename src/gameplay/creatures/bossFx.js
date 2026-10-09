// Visual and spatial pieces for the Marzanna boss fight:
//   SpikeField     pooled ice spikes that erupt, hold and shatter (lines, rings, the grabbing cage)
//   LineTelegraph  a glowing crack that races across the ice before a spike line erupts
//   Band           an expanding sector band (the claw slash arc, the scream cone)
//   Ribbons        long cloth strips trailing from the waist, simulated on the CPU
//   ArmorSet       the ice armor: shards riding her bones that Gale knocks off and that regrow
//   glowSprite()   soft turquoise glow for the eyes
// Everything here is dumb about gameplay: boss.js decides when things happen and who gets hurt.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp } from '../../core/util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function iceMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xbfe6f4, roughness: opts.roughness ?? 0.1, metalness: 0.05, transparent: true, opacity: opts.opacity ?? 0.82,
    emissive: new THREE.Color(opts.emissive ?? 0x2a8aa2), emissiveIntensity: opts.glow ?? 1.0, flatShading: true, side: THREE.DoubleSide,
  });
  m.userData.noShadow = true;
  return m;
}

// ---- spikes ---------------------------------------------------------------------------------------------
export class SpikeField {
  constructor(max = 72, opts = {}) {
    this.max = max;
    const geo = new THREE.ConeGeometry(1, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    this.mat = iceMaterial({ opacity: opts.opacity ?? 0.86, glow: opts.glow ?? 1.3 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'bossSpikes';
    G.scene.add(this.mesh);
    this.items = [];
  }

  // delay: seconds before it erupts; onErupt(item) fires at that moment (hit checks, sfx).
  add(x, z, o = {}) {
    if (this.items.length >= this.max) return null;
    const it = {
      x, z, y: o.y ?? 0, delay: o.delay ?? 0, t: 0, h: o.height ?? 2.2, r: o.radius ?? 0.42, hold: o.hold ?? 0.9, grow: o.grow ?? 0.15, fall: o.fall ?? 0.35,
      lean: o.lean ?? [0, 0], onErupt: o.onErupt, onShatter: o.onShatter, free: !!o.free, state: 'wait', jit: Math.random() * 6.28, spin: Math.random() * 6.28,
    };
    this.items.push(it);
    return it;
  }

  shatterAll(delay = 0) {
    for (const it of this.items) { if (it.state === 'wait') it.state = 'dead'; else { it.free = false; it.t = Math.max(it.t, it.grow + it.hold - delay); } }
  }

  update(dt) {
    const arr = this.items;
    let n = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      it.t += dt;
      if (it.state === 'wait' && it.t >= it.delay) { it.state = 'grow'; it.t = 0; it.onErupt?.(it); }
      if (it.state === 'grow' && it.t >= it.grow) { it.state = 'hold'; it.t = 0; }
      if (it.state === 'hold' && !it.free && it.t >= it.hold) { it.state = 'fall'; it.t = 0; it.onShatter?.(it); }
      if (it.state === 'fall' && it.t >= it.fall) it.state = 'dead';
      if (it.state === 'dead') { arr.splice(i, 1); continue; }
    }
    for (const it of arr) {
      if (it.state === 'wait') continue;
      let k = 1;
      if (it.state === 'grow') { const u = it.t / it.grow; k = 1 - Math.pow(1 - u, 3); k *= 1 + 0.12 * Math.sin(u * Math.PI); } else if (it.state === 'fall') { const u = it.t / it.fall; k = 1 - u * u; }
      const wob = it.state === 'hold' ? 1 + Math.sin(G.clock.elapsed * 14 + it.jit) * 0.015 : 1;
      _e.set(it.lean[0], it.spin, it.lean[1], 'YXZ');
      _q.setFromEuler(_e);
      _p.set(it.x, it.y, it.z);
      const rr = it.r * (it.state === 'fall' ? 1 - (it.t / it.fall) * 0.4 : 1);
      _s.set(rr * wob, Math.max(0.001, it.h * k), rr * wob);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; }

  dispose() {
    G.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

// ---- telegraph line ---------------------------------------------------------------------------------------
const LINE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LINE_FRAG = /* glsl */ `
uniform float uA;
uniform float uT;
uniform float uLen;
uniform vec3 uColor;
varying vec2 vUv;
float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float u = vUv.x * uLen;       // meters along the line
  float v = (vUv.y - 0.5) * 2.0; // -1..1 across
  float jag = (sin(u * 3.1 + 1.7) * 0.18 + sin(u * 9.7) * 0.07 + (h(floor(u * 2.0)) - 0.5) * 0.12);
  float core = smoothstep(0.16, 0.0, abs(v - jag));
  float side = smoothstep(0.5, 0.0, abs(v - jag * 1.6 - 0.35 * sin(u * 1.3))) * 0.35;
  float edge = smoothstep(0.0, 0.6, u) * smoothstep(uLen, uLen - 2.0, u);
  float pulse = 0.65 + 0.35 * sin(u * 2.4 - uT * 16.0);
  float a = (core + side * 0.6) * pulse * edge * uA;
  gl_FragColor = vec4(uColor * a * 1.7, a);
}
`;

export class LineTelegraph {
  constructor() {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0.5, 0, 0);
    this.uniforms = { uA: { value: 0 }, uT: { value: 0 }, uLen: { value: 10 }, uColor: { value: new THREE.Color(0.35, 0.95, 1.0) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    G.scene.add(this.mesh);
    this.life = 0;
  }

  show(x, z, yaw, len, width = 1.7, y = 0.05) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw - Math.PI / 2;
    this.mesh.scale.set(len, 1, width);
    this.uniforms.uLen.value = len;
    this.mesh.visible = true;
    this.life = 1;
  }

  setAlpha(a) { this.uniforms.uA.value = a; }

  hide() { this.mesh.visible = false; this.uniforms.uA.value = 0; }

  update(dt) {
    this.uniforms.uT.value = G.clock.elapsed;
    void dt;
  }

  dispose() {
    G.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---- sector band ------------------------------------------------------------------------------------------------
const BAND_FRAG = /* glsl */ `
uniform float uA;
uniform float uT;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float u = vUv.x, v = vUv.y;
  float edge = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  float prof = sin(clamp(v, 0.0, 1.0) * 3.14159);
  float streak = 0.55 + 0.45 * sin(u * 60.0 + v * 5.0 - uT * 25.0) * sin(u * 19.0 - uT * 9.0 + v * 3.0);
  float a = edge * prof * prof * streak * uA;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), prof * 0.6) * a * 1.5, a);
}
`;

export class Band {
  constructor(half = 1.0, color = [0.4, 0.9, 1.0]) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true, -half, half * 2);
    g.translate(0, 0.5, 0);
    this.uniforms = { uA: { value: 0 }, uT: { value: 0 }, uColor: { value: new THREE.Color(...color) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: BAND_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    G.scene.add(this.mesh);
    this.t = 0;
    this.dur = 0.4;
    this.R0 = 0.5; this.R1 = 5; this.h = 2;
    this.active = false;
  }

  play(x, y, z, yaw, { r0 = 0.5, r1 = 5, h = 2, dur = 0.4 } = {}) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.R0 = r0; this.R1 = r1; this.h = h; this.dur = dur; this.t = 0;
    this.mesh.visible = true;
    this.active = true;
    this.update(0);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const u = clamp(this.t / this.dur);
    const R = lerp(this.R0, this.R1, 1 - Math.pow(1 - u, 2.2));
    this.mesh.scale.set(R, this.h, R);
    this.uniforms.uT.value = this.t;
    this.uniforms.uA.value = (1 - u * u) * Math.min(1, this.t * 16);
    if (u >= 1) { this.active = false; this.mesh.visible = false; }
  }

  dispose() {
    G.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---- cloth ribbons -------------------------------------------------------------------------------------------------------
// Each ribbon hangs from an anchor in the boss's body frame and trails behind: a chain of points that
// lag behind the anchor (verlet-ish), drawn as a strip with a fading alpha. World space positions.
export class Ribbons {
  constructor(parent, { count = 9, segs = 13, length = 3.4, width = 0.8, radius = 0.55, y = 0.0 } = {}) {
    this.parent = parent;
    this.count = count; this.segs = segs; this.length = length; this.width = width; this.radius = radius; this.y = y;
    this.rib = [];
    const verts = count * (segs + 1) * 2;
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 4), nor = new Float32Array(verts * 3);
    const idx = [];
    for (let r = 0; r < count; r++) {
      const base = r * (segs + 1) * 2;
      for (let s = 0; s < segs; s++) {
        const a = base + s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const pts = [];
      for (let s = 0; s <= segs; s++) pts.push(new THREE.Vector3());
      this.rib.push({ pts, ang: (r / count) * Math.PI * 2 + 0.3 * Math.sin(r * 2.1), phase: Math.random() * 6.28, len: length * (0.75 + 0.5 * Math.random()), w: width * (0.7 + 0.5 * Math.random()), init: false });
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const k = (base + s * 2) * 4;
        const a = Math.pow(1 - t, 0.9) * 0.6 * (s === 0 ? 0.3 : 1);
        for (let j = 0; j < 2; j++) { col[k + j * 4] = 0.72; col[k + j * 4 + 1] = 0.9; col[k + j * 4 + 2] = 1.0; col[k + j * 4 + 3] = a; }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide, roughness: 0.9, emissive: new THREE.Color(0.1, 0.35, 0.42), emissiveIntensity: 0.9, depthWrite: false,
    });
    this.mat.userData.noShadow = true;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'bossRibbons';
    G.scene.add(this.mesh);
    this._a = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // anchorPos: world position of the waist center (Vector3), yaw: facing, wind: Vector3 push, t: time
  update(dt, anchor, yaw, vel, t, spread = 1) {
    const P = this.geo.attributes.position.array;
    const N = this.geo.attributes.normal.array;
    const { segs } = this;
    for (let r = 0; r < this.rib.length; r++) {
      const R = this.rib[r];
      const a = R.ang + yaw;
      const ax = anchor.x + Math.sin(a) * this.radius, az = anchor.z + Math.cos(a) * this.radius;
      const ay = anchor.y + this.y;
      const pts = R.pts;
      if (!R.init) {
        for (let s = 0; s <= segs; s++) pts[s].set(ax, ay - (s / segs) * R.len * 0.9, az);
        R.init = true;
      }
      pts[0].set(ax, ay, az);
      const segLen = R.len / segs;
      for (let s = 1; s <= segs; s++) {
        const p = pts[s], q = pts[s - 1];
        // Drift: lag behind the boss's motion, flutter sideways, hang down and out.
        const f = s / segs;
        p.x += (-vel.x * 0.6 + Math.sin(t * 1.3 + R.phase + s * 0.6) * 0.5 * f + Math.sin(a) * 0.35 * f * spread) * dt;
        p.z += (-vel.z * 0.6 + Math.cos(t * 1.1 + R.phase * 1.3 + s * 0.5) * 0.5 * f + Math.cos(a) * 0.35 * f * spread) * dt;
        p.y += (-1.2 + Math.sin(t * 0.9 + R.phase + s) * 0.35) * dt * 0.7;
        // Keep the segment length.
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        const d = Math.hypot(dx, dy, dz) || 1e-4;
        const k = segLen / d;
        p.set(q.x + dx * k, q.y + dy * k, q.z + dz * k);
        // Never below the ice.
        if (p.y < 0.06) p.y = 0.06;
      }
      // Strip: perpendicular to the segment direction and the view-ish axis (the outward radial).
      const base = r * (segs + 1) * 2;
      for (let s = 0; s <= segs; s++) {
        const p = pts[s];
        const next = pts[Math.min(segs, s + 1)], prev = pts[Math.max(0, s - 1)];
        const tx = next.x - prev.x, ty = next.y - prev.y, tz = next.z - prev.z;
        // side = tangent x outward
        const ox = Math.sin(a), oz = Math.cos(a);
        let sx = ty * oz - tz * 0, sy = tz * ox - tx * oz, sz = tx * 0 - ty * ox;
        const sl = Math.hypot(sx, sy, sz) || 1;
        sx /= sl; sy /= sl; sz /= sl;
        const w = R.w * (1 - (s / segs) * 0.65) * 0.5 * (s === 0 ? 0.5 : 1);
        const o = (base + s * 2) * 3;
        P[o] = p.x - sx * w; P[o + 1] = p.y - sy * w; P[o + 2] = p.z - sz * w;
        P[o + 3] = p.x + sx * w; P[o + 4] = p.y + sy * w; P[o + 5] = p.z + sz * w;
        N[o] = N[o + 3] = ox; N[o + 1] = N[o + 4] = 0.2; N[o + 2] = N[o + 5] = oz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }

  reset() { for (const R of this.rib) R.init = false; }

  dispose() {
    G.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---- armor -------------------------------------------------------------------------------------------------------------------------
// Pieces are authored in the bone space of the character (meters at character scale 1, bind pose axes:
// +X left, +Y up, +Z forward). Each group becomes one mesh parented to its bone.
function shardGeo(len, w, th, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.ConeGeometry(1, 1, 4, 1);
  g.translate(0, 0.5, 0);
  g.scale(w, len, th);
  g.rotateY(Math.PI / 4);
  _e.set(rx, ry, rz, 'XYZ');
  g.applyMatrix4(_m.makeRotationFromEuler(_e));
  g.translate(tx, ty, tz);
  return g.toNonIndexed();
}

function merged(list) {
  const g = mergeGeometries(list, false);
  for (const l of list) l.dispose();
  g.computeVertexNormals();
  return g;
}

export class ArmorSet {
  constructor(char, opts = {}) {
    this.char = char;
    this.mat = iceMaterial({ opacity: 0.84, glow: 1.1 });
    this.clawMat = iceMaterial({ opacity: 0.9, glow: 1.6, color: 0xd8f6ff });
    this.pieces = []; // { mesh, bone, home: Vector3 (bone-local), rest scale }
    this.level = 1;
    this.broken = false;
    this.flying = [];
    const B = char.bones;
    const s = 1;
    // Pauldrons: stacked shards sweeping up and out.
    for (const [bone, sd] of [[B.armL, 1], [B.armR, -1]]) {
      const list = [
        shardGeo(0.34, 0.07, 0.05, sd * 0.02, 0.04, 0.0, 0, 0, -sd * 0.9),
        shardGeo(0.26, 0.06, 0.045, sd * 0.03, 0.03, 0.05, 0.4, 0, -sd * 0.6),
        shardGeo(0.26, 0.06, 0.045, sd * 0.03, 0.03, -0.05, -0.4, 0, -sd * 0.6),
        shardGeo(0.2, 0.05, 0.04, sd * 0.0, 0.05, 0.0, 0, 0, -sd * 0.2),
        shardGeo(0.16, 0.05, 0.04, sd * 0.06, 0.0, 0.0, 0, 0, -sd * 1.3),
      ];
      this._piece(bone, merged(list), `pauldron${sd}`);
    }
    // Chest: a front crest and tall spines at the back.
    const chest = [
      shardGeo(0.3, 0.07, 0.05, 0, 0.0, 0.11, 1.15, 0, 0),
      shardGeo(0.22, 0.05, 0.04, 0.07, -0.04, 0.1, 1.0, 0.1, -0.5),
      shardGeo(0.22, 0.05, 0.04, -0.07, -0.04, 0.1, 1.0, -0.1, 0.5),
      shardGeo(0.2, 0.05, 0.04, 0.0, -0.1, 0.1, 1.45, 0, 0),
    ];
    this._piece(B.chest, merged(chest), 'chestFront');
    const back = [];
    for (let i = -2; i <= 2; i++) back.push(shardGeo(0.34 - Math.abs(i) * 0.05, 0.05, 0.04, i * 0.05, 0.05 - Math.abs(i) * 0.02, -0.09, -0.55, 0, -i * 0.28));
    this._piece(B.chest, merged(back), 'chestBack');
    // Vambraces: shards along the forearms.
    for (const [bone, sd] of [[B.forearmL, 1], [B.forearmR, -1]]) {
      const list = [];
      for (let i = 0; i < 4; i++) list.push(shardGeo(0.16 - i * 0.025, 0.035, 0.03, sd * 0.03, -0.04 - i * 0.045, 0.02 * (i % 2 ? 1 : -1), 0.5, 0, sd * 0.5));
      this._piece(bone, merged(list), `vambrace${sd}`);
    }
    // Claws: always there (only the first set carries them).
    for (const [bone, sd] of opts.claws === false ? [] : [[B.handL, 1], [B.handR, -1]]) {
      const list = [];
      for (let i = 0; i < 4; i++) list.push(shardGeo(0.27 - (i === 3 ? 0.08 : 0) , 0.012, 0.01, sd * (i - 1.5) * 0.017, -0.075, 0.01, Math.PI - 0.1, 0, sd * (i - 1.5) * 0.12));
      const g = merged(list);
      const mesh = new THREE.Mesh(g, this.clawMat);
      mesh.castShadow = false;
      bone.add(mesh);
      this.claws = this.claws || [];
      this.claws.push(mesh);
    }
    void s;
  }

  _piece(bone, geo, name) {
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.name = `armor_${name}`;
    mesh.castShadow = false;
    bone.add(mesh);
    this.pieces.push({ mesh, bone, name });
  }

  setLevel(k) {
    this.level = k;
    for (const p of this.pieces) {
      p.mesh.visible = k > 0.02;
      p.mesh.scale.setScalar(Math.max(0.001, k));
    }
  }

  // Knock it all off: each piece leaves its bone, tumbles away and fades.
  shatter(origin) {
    if (this.broken) return;
    this.broken = true;
    const out = new THREE.Vector3();
    for (const p of this.pieces) {
      p.mesh.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3().setFromMatrixPosition(p.mesh.matrixWorld);
      const wq = new THREE.Quaternion();
      const ws = new THREE.Vector3();
      p.mesh.matrixWorld.decompose(new THREE.Vector3(), wq, ws);
      p.bone.remove(p.mesh);
      const mat = this.mat.clone();
      p.mesh.material = mat;
      p.mesh.position.copy(wp);
      p.mesh.quaternion.copy(wq);
      p.mesh.scale.copy(ws);
      G.scene.add(p.mesh);
      out.copy(wp).sub(origin);
      out.y = Math.max(0.2, out.y * 0.3 + 0.6);
      out.normalize();
      this.flying.push({ mesh: p.mesh, vel: out.clone().multiplyScalar(4 + Math.random() * 4), spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), t: 0, life: 1.8 + Math.random() * 0.5, mat });
    }
    this.pieces.length = 0;
  }

  get done() { return this.broken && this.flying.length === 0; }

  update(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      f.vel.y -= 14 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
      const gy = G.world ? Math.max(0, G.world.heightAt(f.mesh.position.x, f.mesh.position.z)) : 0;
      if (f.mesh.position.y < gy + 0.1) { f.mesh.position.y = gy + 0.1; f.vel.y *= -0.25; f.vel.x *= 0.5; f.vel.z *= 0.5; f.spin.multiplyScalar(0.5); }
      const u = f.t / f.life;
      f.mat.opacity = 0.84 * (1 - clamp((u - 0.55) / 0.45));
      if (u >= 1) {
        G.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        this.flying.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const f of this.flying) { G.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mat.dispose(); }
    this.flying.length = 0;
    for (const p of this.pieces) { p.bone.remove(p.mesh); p.mesh.geometry.dispose(); }
    this.pieces.length = 0;
    for (const c of this.claws || []) { c.parent?.remove(c); c.geometry.dispose(); }
    this.mat.dispose();
    this.clawMat.dispose();
  }
}

// ---- glow ---------------------------------------------------------------------------------------------------------------------------------
let glowTex = null;
export function glowSprite(color = [0.4, 1.0, 1.0], size = 0.3) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(...color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}
