// Sign effects. The player module owns timing, energy and the cast animation (and plays sign_*
// sounds); it emits player:cast { sign, origin, dir, power } and player:ward. This file turns those
// into visuals and gameplay:
//
//   Ember  a cone of fire (7 m, about 60 degrees) for 0.9 s. Every live enemy in the cone gets
//          enemy.onSign('ember', { dir, power, dt, origin }) each frame (effigies ignite, wolves
//          flee, the boss only steams). Registered flammables (G.combat.addFlammable) ignite once.
//   Gale   an expanding force wave (a sector band that grows to 9.5 m at 22 m/s). Each enemy it
//          passes gets enemy.onSign('gale', { dir, power, origin, point }) once: knockback, stagger,
//          and the boss's ice armor breaks.
//   Ward   a shimmering amber bubble around Vesna while G.player.ward is up; it shatters when it
//          absorbs a hit (player:ward { active: false, absorbed: true }).
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { arcTest, centerOf, isLive } from './geom.js';
import { fx as propsFx } from '../../world/props/fx.js';

export const SIGN_TUNE = {
  ember: { len: 7.2, half: 0.52, dur: 0.9, dps: 11 },
  gale: { range: 9.5, speed: 22, half: 0.78 },
  ward: { radius: 1.5 },
};

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

// ---- Gale wave shader -------------------------------------------------------------------------
const GALE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const GALE_FRAG = /* glsl */ `
uniform float uA;
uniform float uT;
varying vec2 vUv;
void main() {
  float u = vUv.x, v = vUv.y;
  float edge = smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u);
  float prof = sin(clamp(v, 0.0, 1.0) * 3.14159);
  float streak = 0.55 + 0.45 * sin(u * 70.0 + v * 6.0 - uT * 30.0) * sin(u * 23.0 - uT * 11.0 + v * 3.0);
  float a = edge * prof * prof * streak * uA;
  vec3 col = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 1.0, 1.0), prof);
  gl_FragColor = vec4(col * a * 1.5, a);
}
`;

// ---- Ward bubble shader -----------------------------------------------------------------------
const WARD_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const WARD_FRAG = /* glsl */ `
uniform float uA;
uniform float uT;
uniform float uFlash;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.2);
  vec3 p = vP * 7.0;
  float hex = abs(sin(p.x * 1.7 + uT * 0.8) * sin(p.y * 1.9 - uT * 0.6) + sin(p.z * 1.6 + p.x * 0.9 + uT * 0.5));
  float cells = smoothstep(0.82, 1.0, hex) * 0.5;
  float band = smoothstep(0.0, 1.0, 1.0 - abs(fract(vP.y * 0.5 + uT * 0.25) - 0.5) * 2.0) * 0.12;
  float a = (rim * 0.85 + cells * (0.35 + rim) + band + 0.035) * uA;
  vec3 col = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.9, 0.62), rim) * (1.0 + uFlash * 3.0);
  gl_FragColor = vec4(col * a, a * 0.7);
}
`;

export class Signs {
  constructor(combat) {
    this.combat = combat;
    this.fx = combat.fx;
    this.embers = [];
    this.gales = [];
    this.flammables = [];
    // Gale pool geometry: a unit sector band, scaled per wave.
    const half = SIGN_TUNE.gale.half;
    this.galeGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true, -half, half * 2);
    this.galeGeo.translate(0, 0.5, 0);
    // Ward bubble.
    this.wardMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: WARD_VERT, fragmentShader: WARD_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    this.ward = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.wardMat);
    this.ward.visible = false;
    this.ward.frustumCulled = false;
    this.ward.renderOrder = 13;
    this.ward.name = 'wardBubble';
    G.scene.add(this.ward);
    this.wardLevel = 0; // 0..1 fade
    this.wardSeconds = 0;
    this.wardFlash = 0;
    this.wardShatter = 0;
    this.offs = [
      G.events.on('player:cast', (c) => this.cast(c)),
      G.events.on('player:ward', (w) => this.onWard(w)),
    ];
  }

  // ---- entry -------------------------------------------------------------------------------------
  cast(c) {
    const origin = c.origin.clone();
    const dir = new THREE.Vector3(c.dir.x, 0, c.dir.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const power = c.power ?? 1;
    if (c.sign === 'ember') this.castEmber(origin, dir, power);
    else if (c.sign === 'gale') this.castGale(origin, dir, power);
    // Ward is handled by player:ward.
  }

  addFlammable(f) {
    this.flammables.push(f);
    return f;
  }
  removeFlammable(f) {
    const i = this.flammables.indexOf(f);
    if (i >= 0) this.flammables.splice(i, 1);
  }

  // ---- Ember -------------------------------------------------------------------------------------
  castEmber(origin, dir, power) {
    const T = SIGN_TUNE.ember;
    const gy = origin.y - 1.3;
    this.embers.push({ t: 0, origin, dir, power, len: T.len * (0.9 + 0.1 * power), half: T.half, dur: T.dur, em: [], next: 0, gy });
    G.cameraRig?.shake?.(0.14, 0.3);
    G.postfx?.flash?.(0xff8a3a, 0.16);
  }

  _updateEmber(E, dt) {
    const T = SIGN_TUNE.ember;
    E.t += dt;
    // Staggered flame tongues racing out along the cone, each living about 0.6 s.
    const N = 7;
    while (E.next < N && E.t >= E.next * 0.055) {
      const i = E.next++;
      const k = i / (N - 1);
      const dist = 0.7 + (E.len * 0.95 - 0.7) * Math.pow(k, 0.9);
      const x = E.origin.x + E.dir.x * dist, z = E.origin.z + E.dir.z * dist;
      const gy = G.world ? G.world.heightAt(x, z) : E.gy;
      const y = gy + 0.55 + (1 - k) * 0.55;
      const scale = 0.4 + k * 0.85;
      let em = null;
      try {
        em = propsFx.fire({ position: [x, y, z], parent: G.scene, scale, radius: 0.22 + k * 0.12, height: 0.8, smoke: false, embers: k > 0.3, light: i === 2 || i === 5, prewarm: false, tint: [1, 0.55 + 0.15 * (1 - k), 0.18], lightIntensity: 3.2, lightRange: 9 });
      } catch { em = null; }
      if (em) E.em.push({ em, born: E.t, life: 0.5 + k * 0.1 });
    }
    for (let i = E.em.length - 1; i >= 0; i--) {
      const p = E.em[i];
      const u = (E.t - p.born) / p.life;
      if (u >= 1) { p.em.dispose(); E.em.splice(i, 1); continue; }
      p.em.setIntensity(u < 0.25 ? 0.7 + u * 1.2 : 1 - (u - 0.25) / 0.75);
    }
    // Gameplay: burn everything standing in the cone while the jet lasts.
    if (E.t < T.dur) {
      for (const e of this.combat.liveEnemies()) {
        const a = arcTest(E.origin.x, E.origin.z, E.dir.x, E.dir.z, e);
        if (a.surface > E.len || a.ang > E.half) continue;
        const info = { dir: E.dir, power: E.power, dt, origin: E.origin, t: E.t, dist: a.d };
        if (e.onSign) e.onSign('ember', info);
        else e.takeHit?.({ source: 'ember', damage: T.dps * dt * E.power, dir: E.dir, point: centerOf(e), kind: 'sign', stagger: false, knockback: 0 });
      }
      for (const f of this.flammables) {
        if (f.ignited) continue;
        const a = arcTest(E.origin.x, E.origin.z, E.dir.x, E.dir.z, f);
        if (a.surface > E.len || a.ang > E.half) continue;
        f.ignited = true;
        f.onIgnite?.({ origin: E.origin, dir: E.dir });
      }
    }
    return E.t >= T.dur + 0.7 && E.em.length === 0;
  }

  // ---- Gale --------------------------------------------------------------------------------------
  castGale(origin, dir, power) {
    const T = SIGN_TUNE.gale;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 }, uT: { value: 0 } },
      vertexShader: GALE_VERT, fragmentShader: GALE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(this.galeGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 13;
    const gy = G.world ? G.world.heightAt(origin.x, origin.z) : origin.y - 1.3;
    mesh.position.set(origin.x, gy + 0.05, origin.z);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    mesh.scale.set(0.5, 2.0, 0.5);
    G.scene.add(mesh);
    this.gales.push({ t: 0, R: 0.4, origin, dir, power, half: T.half, range: T.range * (0.9 + 0.1 * power), speed: T.speed, mesh, mat, hit: new Set(), puff: 0 });
    G.cameraRig?.shake?.(0.2, 0.3);
    propsFx.burst('snow', [origin.x + dir.x * 0.8, gy + 0.2, origin.z + dir.z * 0.8], { count: 26, speed: 4.5, up: 0.9, size: 0.2 });
  }

  _updateGale(W, dt) {
    W.t += dt;
    W.R += W.speed * dt * (1 - Math.min(0.55, W.R / W.range * 0.55));
    const R = Math.min(W.R, W.range);
    W.mesh.scale.set(R, 1.5 + R * 0.12, R);
    W.mat.uniforms.uT.value = W.t;
    W.mat.uniforms.uA.value = Math.max(0, 1 - Math.pow(R / W.range, 2.2)) * Math.min(1, W.t * 14);
    // Snow thrown up along the leading edge.
    W.puff -= dt;
    if (W.puff <= 0) {
      W.puff = 0.035;
      const a = (Math.random() * 2 - 1) * W.half;
      const yaw = Math.atan2(W.dir.x, W.dir.z) + a;
      const px = W.origin.x + Math.sin(yaw) * R, pz = W.origin.z + Math.cos(yaw) * R;
      const gy = G.world ? G.world.heightAt(px, pz) : 0;
      this.fx.mist(_o.set(px, gy + 0.4, pz), { color: [0.82, 0.9, 1.0], alpha: 0.36, count: 2, size: 0.5, speed: 1.5, life: 0.8, up: 0.5, dir: _d.set(W.dir.x, 0, W.dir.z), grow: 2.2 });
    }
    // Gameplay: every enemy the wavefront crosses is hit once.
    for (const e of this.combat.liveEnemies()) {
      if (W.hit.has(e)) continue;
      const a = arcTest(W.origin.x, W.origin.z, W.dir.x, W.dir.z, e);
      if (a.surface > R || a.ang > W.half) continue;
      W.hit.add(e);
      const dx = a.dx, dz = a.dz;
      const l = Math.hypot(dx, dz) || 1;
      const dir = new THREE.Vector3(dx / l, 0, dz / l);
      const info = { dir, power: W.power, origin: W.origin, point: centerOf(e), dist: a.d };
      if (e.onSign) e.onSign('gale', info);
      else e.takeHit?.({ source: 'gale', damage: 6, dir, point: info.point, kind: 'sign', stagger: true, knockback: 2.2 });
      this.fx.mist(info.point, { color: [0.85, 0.93, 1.0], alpha: 0.4, count: 4, size: 0.45, speed: 2.2, life: 0.7, up: 0.5, dir });
    }
    return R >= W.range && W.mat.uniforms.uA.value <= 0.01;
  }

  // ---- Ward --------------------------------------------------------------------------------------
  onWard(w) {
    if (w.active) {
      this.wardSeconds = w.seconds ?? 12;
      this.wardIn = 0;
    } else if (w.absorbed) {
      this.wardShatter = 0.6;
      this.wardFlash = 1;
      const P = G.player;
      const c = _o.set(P.position.x, P.position.y + 1.1, P.position.z);
      this.fx.chips(c, { kind: 'ember', count: 26, speed: 5, up: 1.5, size: 1.6 });
      this.fx.mist(c, { color: [1.0, 0.7, 0.3], alpha: 0.35, count: 6, size: 0.7, speed: 2.5, life: 0.6, up: 0.2, grow: 1.6 });
      G.postfx?.flash?.(0xffc070, 0.12);
    }
  }

  _updateWard(dt) {
    const P = G.player;
    if (!P) return;
    const up = !!P.ward && !P.dead;
    const k = Math.min(1, dt * (up ? 5 : 3.2));
    this.wardLevel += ((up ? 1 : 0) - this.wardLevel) * k;
    this.wardFlash = Math.max(0, this.wardFlash - dt * 3.5);
    this.wardShatter = Math.max(0, this.wardShatter - dt);
    const show = this.wardLevel > 0.02 || this.wardShatter > 0;
    this.ward.visible = show;
    if (!show) return;
    const u = this.wardMat.uniforms;
    let a = this.wardLevel;
    const left = P.moves?.wardT ?? 99;
    if (up && left < 1.6) a *= 0.55 + 0.45 * Math.abs(Math.sin(left * 11)); // flicker before it expires
    if (this.wardShatter > 0) {
      const s = 1 - this.wardShatter / 0.6;
      a = Math.max(a, (1 - s) * 1.4);
      this.ward.scale.setScalar(SIGN_TUNE.ward.radius * (1 + s * 0.9));
    } else {
      this.ward.scale.setScalar(SIGN_TUNE.ward.radius * (0.82 + 0.18 * this.wardLevel + Math.sin(G.clock.elapsed * 2.2) * 0.012));
    }
    u.uA.value = a;
    u.uT.value = G.clock.elapsed;
    u.uFlash.value = this.wardFlash;
    this.ward.position.set(P.position.x, P.position.y + 1.0, P.position.z);
  }

  // ---- per frame ---------------------------------------------------------------------------------
  update(dt) {
    for (let i = this.embers.length - 1; i >= 0; i--) if (this._updateEmber(this.embers[i], dt)) this.embers.splice(i, 1);
    for (let i = this.gales.length - 1; i >= 0; i--) {
      if (this._updateGale(this.gales[i], dt)) {
        const W = this.gales[i];
        G.scene.remove(W.mesh);
        W.mat.dispose();
        this.gales.splice(i, 1);
      }
    }
    this._updateWard(dt);
  }

  dispose() {
    for (const off of this.offs) off();
    for (const E of this.embers) for (const p of E.em) p.em.dispose();
    for (const W of this.gales) { G.scene.remove(W.mesh); W.mat.dispose(); }
    this.embers.length = 0;
    this.gales.length = 0;
    G.scene.remove(this.ward);
    this.ward.geometry.dispose();
    this.wardMat.dispose();
    this.galeGeo.dispose();
  }
}

export { isLive };
