// Sword trail: a fading ribbon between the blade base and tip, sampled each frame while one of
// Vesna's attacks is in its active window (from the whoosh to a moment after contact).
//
//   const t = new SwordTrail(G);   t.update(dt)   (runs after the characters system so the blade pose is current)
//   t.dispose()
// Reads G.player.moves.act (kind 'attack', def.whoosh / def.contact, id) and character.swordObj.
import * as THREE from 'three';
import { G } from '../../core/G.js';

const N = 18; // ribbon samples
const LIFE = 0.2; // seconds a sample stays visible

const VERT = /* glsl */ `
attribute float aA;
attribute float aV;
varying float vA;
varying float vV;
void main() {
  vA = aA; vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying float vA;
varying float vV;
void main() {
  float edge = smoothstep(0.0, 0.25, vV) * (0.45 + 0.55 * vV);
  float a = vA * edge;
  gl_FragColor = vec4(uColor * a * uGain, a * 0.6);
}
`;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class SwordTrail {
  constructor() {
    this.samples = []; // newest first: { b: Vector3, t: Vector3, age }
    const pos = new Float32Array(N * 2 * 3);
    const aA = new Float32Array(N * 2);
    const aV = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { aV[i * 2] = 0; aV[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(aA, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.uniforms = { uColor: { value: new THREE.Color(0.78, 0.9, 1.0) }, uGain: { value: 1.2 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.name = 'swordTrail';
    G.scene.add(this.mesh);
    this.geo = geo;
    this.active = false;
  }

  _sample() {
    const P = G.player;
    const sw = P?.character?.swordObj;
    if (!sw || !sw.visible) return false;
    sw.updateWorldMatrix(true, false);
    _a.set(0, 0.16, 0);
    _b.set(0, 0.97, 0);
    sw.localToWorld(_a);
    sw.localToWorld(_b);
    const last = this.samples[0];
    // Skip duplicate samples when the clock is paused or the frame rate is huge.
    if (last && last.b.distanceToSquared(_a) < 1e-6 && last.t.distanceToSquared(_b) < 1e-6) return true;
    this.samples.unshift({ b: _a.clone(), t: _b.clone(), age: 0 });
    if (this.samples.length > N) this.samples.pop();
    return true;
  }

  update(dt) {
    const P = G.player;
    const act = P?.moves?.act;
    let on = false;
    if (act && act.kind === 'attack' && !P.dead) {
      const d = act.def;
      on = act.t >= d.whoosh * 0.85 && act.t <= d.contact + 0.2;
      const heavy = d.kind === 'heavy';
      this.uniforms.uGain.value = heavy ? 1.2 : 0.8;
      if (P.character.swordKind === 'silver') this.uniforms.uColor.value.setRGB(0.7, 1.0, 1.15);
      else this.uniforms.uColor.value.setRGB(0.8, 0.9, 1.0);
    }
    if (on) this._sample();
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > LIFE) this.samples.pop();
    const n = this.samples.length;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    const pos = this.geo.attributes.position.array;
    const aA = this.geo.attributes.aA.array;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      pos[i * 6] = s.b.x; pos[i * 6 + 1] = s.b.y; pos[i * 6 + 2] = s.b.z;
      pos[i * 6 + 3] = s.t.x; pos[i * 6 + 4] = s.t.y; pos[i * 6 + 5] = s.t.z;
      const fade = Math.max(0, 1 - s.age / LIFE);
      const a = fade * fade * (1 - i / (n + 2) * 0.35);
      aA[i * 2] = a; aA[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  dispose() {
    G.scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}
