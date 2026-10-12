// Combat particles: soft mist puffs (blood mist, snow dust, frost breath) and tumbling debris chips
// (ice, straw, frost shards, droplets). Two small pooled systems, CPU simulated, one draw call each.
// The props FX pool (props.fx) still supplies fire, sparks and snow bursts; this file covers what it
// does not: tinted mist and solid shards that bounce on the ice.
//
//   const fx = new CombatFx(G);       fx.update(dt) each frame (the combat system does this)
//   fx.mist(pos, { color: [r, g, b], alpha, count, size, speed, life, up, grow })
//   fx.chips(pos, { kind: 'ice' | 'frost' | 'straw' | 'blood' | 'ember', count, speed, up, dir, spread, size })
//   fx.byMaterial('flesh' | 'straw' | 'ice' | 'frost', pos, dir, scale)    the standard hit burst per material
//   fx.clear()
import * as THREE from 'three';
import { G } from '../../core/G.js';

const MIST_CAP = 220;
const CHIP_CAP = 360;

const MIST_VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot), s = sin(aRot);
  mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize;
  gl_Position = projectionMatrix * mv;
}
`;
const MIST_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float wob = 0.12 * sin(atan(d.y, d.x) * 5.0 + vColor.a * 40.0) + 0.06 * sin(atan(d.y, d.x) * 9.0 + vColor.r * 30.0);
  float a = exp(-(r + wob) * (r + wob) * 3.4) * (1.0 - smoothstep(0.78, 1.0, r));
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, a * vColor.a);
}
`;

const CHIP_KINDS = {
  // base color (linear-ish, display tuned), size range, gravity, bounce, glow (>1 blooms)
  ice: { colors: [[0.72, 0.86, 0.98], [0.56, 0.74, 0.92], [0.86, 0.94, 1.0]], size: [0.025, 0.07], grav: 9.5, bounce: 0.35, flat: 0.5 },
  frost: { colors: [[0.55, 1.35, 1.5], [0.7, 1.5, 1.6], [0.4, 1.0, 1.2]], size: [0.03, 0.09], grav: 6.5, bounce: 0.4, flat: 0.45 },
  straw: { colors: [[0.82, 0.68, 0.38], [0.7, 0.56, 0.3], [0.9, 0.78, 0.5]], size: [0.02, 0.05], grav: 4.2, bounce: 0.15, flat: 0.12, long: 6 },
  blood: { colors: [[0.28, 0.02, 0.02], [0.2, 0.015, 0.015], [0.34, 0.03, 0.025]], size: [0.012, 0.03], grav: 11, bounce: 0.0, flat: 1 },
  ember: { colors: [[2.6, 1.0, 0.3], [2.0, 0.7, 0.2]], size: [0.012, 0.03], grav: 2.2, bounce: 0.2, flat: 1 },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _c = new THREE.Color();

export class CombatFx {
  constructor() {
    // ---- mist ---------------------------------------------------------------------------------
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.mAPos = new THREE.InstancedBufferAttribute(new Float32Array(MIST_CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mASize = new THREE.InstancedBufferAttribute(new Float32Array(MIST_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    this.mARot = new THREE.InstancedBufferAttribute(new Float32Array(MIST_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    this.mAColor = new THREE.InstancedBufferAttribute(new Float32Array(MIST_CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.mAPos);
    geo.setAttribute('aSize', this.mASize);
    geo.setAttribute('aRot', this.mARot);
    geo.setAttribute('aColor', this.mAColor);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
    });
    this.mistMesh = new THREE.Mesh(geo, mat);
    this.mistMesh.frustumCulled = false;
    this.mistMesh.renderOrder = 12;
    this.mistMesh.name = 'combatMist';
    this.mist_ = [];
    this.mistGeo = geo;
    G.scene.add(this.mistMesh);

    // ---- chips --------------------------------------------------------------------------------
    const cg = new THREE.TetrahedronGeometry(1, 0);
    cg.scale(0.6, 1.0, 0.5);
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.chipMesh = new THREE.InstancedMesh(cg, cm, CHIP_CAP);
    this.chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chipMesh.count = 0;
    this.chipMesh.frustumCulled = false;
    this.chipMesh.name = 'combatChips';
    this.chipMesh.setColorAt(0, _c.setRGB(1, 1, 1));
    G.scene.add(this.chipMesh);
    this.chips_ = [];
  }

  // ---- spawning ----------------------------------------------------------------------------------
  mist(pos, o = {}) {
    const n = Math.min(MIST_CAP - this.mist_.length, Math.round((o.count ?? 6) * (G.quality === 'low' ? 0.6 : 1)));
    const col = o.color || [0.3, 0.04, 0.04];
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 1.2) * (0.3 + Math.random() * 0.9);
      const dir = o.dir;
      let vx = Math.cos(th) * sp, vz = Math.sin(th) * sp;
      if (dir) { vx = dir.x * sp * (0.5 + Math.random()) + vx * 0.35; vz = dir.z * sp * (0.5 + Math.random()) + vz * 0.35; }
      this.mist_.push({
        x: pos.x + (Math.random() - 0.5) * 0.15, y: pos.y + (Math.random() - 0.5) * 0.15, z: pos.z + (Math.random() - 0.5) * 0.15,
        vx, vy: (o.up ?? 0.5) * (0.3 + Math.random()), vz,
        age: 0, life: (o.life ?? 0.7) * (0.7 + Math.random() * 0.6),
        size: (o.size ?? 0.35) * (0.6 + Math.random() * 0.8), grow: o.grow ?? 2.2,
        rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 1.6,
        r: col[0] * (0.85 + Math.random() * 0.3), g: col[1] * (0.85 + Math.random() * 0.3), b: col[2] * (0.85 + Math.random() * 0.3),
        a: o.alpha ?? 0.5, drag: o.drag ?? 2.4, buoy: o.buoy ?? 0,
      });
    }
  }

  chips(pos, o = {}) {
    const def = CHIP_KINDS[o.kind] || CHIP_KINDS.ice;
    const n = Math.min(CHIP_CAP - this.chips_.length, Math.round((o.count ?? 10) * (G.quality === 'low' ? 0.6 : 1)));
    const night = G.uniforms?.uNight?.value ?? 0.5;
    const lit = o.kind === 'frost' || o.kind === 'ember' ? 1 : 1 - 0.55 * night;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.35 + Math.random() * 0.85);
      let vx = Math.cos(th) * sp, vz = Math.sin(th) * sp;
      if (o.dir) {
        const k = o.spread ?? 0.45;
        vx = o.dir.x * sp * (0.7 + Math.random() * 0.6) + vx * k;
        vz = o.dir.z * sp * (0.7 + Math.random() * 0.6) + vz * k;
      }
      const c = def.colors[Math.floor(Math.random() * def.colors.length)];
      const sz = (def.size[0] + Math.random() * (def.size[1] - def.size[0])) * (o.size ?? 1);
      this.chips_.push({
        x: pos.x + (Math.random() - 0.5) * 0.2, y: pos.y + (Math.random() - 0.5) * 0.2, z: pos.z + (Math.random() - 0.5) * 0.2,
        vx, vy: (o.up ?? 2.4) * (0.35 + Math.random() * 0.9), vz,
        age: 0, life: (o.life ?? 1.6) * (0.6 + Math.random() * 0.8),
        sx: sz * (def.long ? 0.35 : 1), sy: sz * (def.long || 1) * (0.8 + Math.random() * 0.6), sz: sz * def.flat * 1.4,
        qx: Math.random() * 2 - 1, qy: Math.random() * 2 - 1, qz: Math.random() * 2 - 1, ang: Math.random() * 6.28, spin: (Math.random() - 0.5) * 16,
        r: c[0] * lit, g: c[1] * lit, b: c[2] * lit, grav: def.grav, bounce: def.bounce, floor: o.floorY, rest: false,
      });
    }
  }

  // The standard burst for what was hit. dir is the blow direction (unit, horizontal), scale 1 for a light hit.
  byMaterial(kind, pos, dir, scale = 1) {
    if (kind === 'flesh') {
      this.mist(pos, { color: [0.34, 0.035, 0.03], alpha: 0.6, count: 5 * scale, size: 0.32, speed: 1.6, life: 0.6, up: 0.4, dir, grow: 2.6 });
      this.chips(pos, { kind: 'blood', count: 9 * scale, speed: 3.6, up: 1.6, dir });
    } else if (kind === 'straw') {
      this.chips(pos, { kind: 'straw', count: 14 * scale, speed: 2.8, up: 2.2, dir });
      this.chips(pos, { kind: 'ice', count: 6 * scale, speed: 3.2, up: 2.0, dir });
      this.mist(pos, { color: [0.55, 0.6, 0.66], alpha: 0.32, count: 3 * scale, size: 0.3, speed: 1.2, life: 0.8, up: 0.5, dir });
    } else if (kind === 'ice') {
      this.chips(pos, { kind: 'ice', count: 16 * scale, speed: 3.6, up: 2.4, dir });
      this.chips(pos, { kind: 'frost', count: 6 * scale, speed: 3.0, up: 2.0, dir });
      this.mist(pos, { color: [0.7, 0.88, 1.0], alpha: 0.4, count: 3 * scale, size: 0.34, speed: 1.4, life: 0.7, up: 0.4, dir });
    } else if (kind === 'frost') {
      this.chips(pos, { kind: 'frost', count: 18 * scale, speed: 4.2, up: 2.6, dir });
      this.chips(pos, { kind: 'ice', count: 8 * scale, speed: 3.4, up: 2.2, dir });
      this.mist(pos, { color: [0.5, 1.2, 1.35], alpha: 0.5, count: 4 * scale, size: 0.4, speed: 1.6, life: 0.8, up: 0.5, dir });
    }
  }

  clear() {
    this.mist_.length = 0;
    this.chips_.length = 0;
    this.mistGeo.instanceCount = 0;
    this.chipMesh.count = 0;
  }

  // ---- per frame ---------------------------------------------------------------------------------
  update(dt) {
    // Mist
    const M = this.mist_;
    let n = 0;
    const P = this.mAPos.array, S = this.mASize.array, R = this.mARot.array, C = this.mAColor.array;
    for (let i = M.length - 1; i >= 0; i--) {
      const p = M[i];
      p.age += dt;
      if (p.age >= p.life) { M[i] = M[M.length - 1]; M.pop(); continue; }
    }
    for (let i = 0; i < M.length; i++) {
      const p = M[i];
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.buoy * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.rotV * dt;
      const u = p.age / p.life;
      const fade = (u < 0.12 ? u / 0.12 : 1) * (1 - u) * (1 - u * 0.3);
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
      S[n] = p.size * (1 + p.grow * u);
      R[n] = p.rot;
      C[n * 4] = p.r; C[n * 4 + 1] = p.g; C[n * 4 + 2] = p.b; C[n * 4 + 3] = p.a * fade;
      n++;
    }
    this.mistGeo.instanceCount = n;
    this.mAPos.needsUpdate = this.mASize.needsUpdate = this.mARot.needsUpdate = this.mAColor.needsUpdate = true;

    // Chips
    const A = this.chips_;
    let m = 0;
    const world = G.world;
    for (let i = A.length - 1; i >= 0; i--) {
      const p = A[i];
      p.age += dt;
      if (p.age >= p.life) { A[i] = A[A.length - 1]; A.pop(); }
    }
    for (let i = 0; i < A.length; i++) {
      const p = A[i];
      if (!p.rest) {
        p.vy -= p.grav * dt;
        const k = Math.exp(-0.6 * dt);
        p.vx *= k; p.vz *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const floor = (p.floor ?? (world ? world.heightAt(p.x, p.z) : 0)) + p.sy * 0.3;
        if (p.y < floor) {
          p.y = floor;
          if (p.bounce > 0.05 && Math.abs(p.vy) > 0.8) { p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; } else { p.vy = 0; p.vx = p.vz = 0; p.rest = true; }
        }
        p.ang += p.spin * dt;
      }
      const u = p.age / p.life;
      const sc = u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1;
      _axis.set(p.qx, p.qy, p.qz).normalize();
      _q.setFromAxisAngle(_axis, p.ang);
      _p.set(p.x, p.y, p.z);
      _s.set(p.sx * sc, p.sy * sc, p.sz * sc);
      _m.compose(_p, _q, _s);
      this.chipMesh.setMatrixAt(m, _m);
      this.chipMesh.setColorAt(m, _c.setRGB(p.r, p.g, p.b));
      m++;
    }
    this.chipMesh.count = m;
    this.chipMesh.instanceMatrix.needsUpdate = true;
    if (this.chipMesh.instanceColor) this.chipMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    G.scene.remove(this.mistMesh, this.chipMesh);
    this.mistMesh.geometry.dispose();
    this.mistMesh.material.dispose();
    this.chipMesh.geometry.dispose();
    this.chipMesh.material.dispose();
    this.chipMesh.dispose();
  }
}
