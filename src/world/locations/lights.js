// Shared point-light pool for every location. Windows, lanterns, hearths and fires are registered as
// light descriptors (never as real lights); the pool keeps the few nearest to the camera as real
// PointLights, fades them in and out so nothing pops, flickers fire kinds and scales windows and
// lanterns by G.uniforms.uWindowLight (always on while the camera is inside the descriptor's room).
//
//   import { getLightPool } from './lights.js';
//   const pool = getLightPool(G);                       // one per game; also at G.world.lights
//   const h = pool.add({ x, y, z, color, intensity, radius, kind, room?, indoor? });   // returns a handle
//   pool.addMany(placed.lights, { room: 'tavern' });   // building descriptors, optional shared fields
//   pool.remove(h);  h.setEnabled(false);  h.desc.x = ...;  pool.stats();
//   pool.setRoom('tavern' | null)                      // which room the camera is in (interiors.js does this)
//
// kind: 'window' | 'lantern' (scaled by uWindowLight), 'hearth' | 'forge' | 'fire' | 'candle' | 'ghost' (steady,
// fire kinds flicker). intensity and radius use the architecture kit's scale (hearth 2.2 / 14 m, window 0.5 / 6 m).
// Pool size: 7 lights at quality high, 5 medium, 3 low. The count is fixed so shaders never recompile.
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';

// kit intensity -> PointLight candela, by kind.
const GAIN = { window: 11, lantern: 12, hearth: 8, forge: 9, fire: 10, candle: 6, ghost: 6 };
const FLICKER = { hearth: 0.16, forge: 0.1, fire: 0.18, candle: 0.2, window: 0.05, lantern: 0.04, ghost: 0.03 };
const LAMP = { window: true, lantern: true };
const REACH = 2.0; // PointLight.distance = radius * REACH (decay 2 reaches ~0 there)
const MAX_CAMERA_DIST = 90;

let pool = null;

export function getLightPool(G) {
  if (G.world?.lights) return G.world.lights;
  if (pool) return pool;
  pool = new LightPool(G);
  if (G.world) G.world.lights = pool;
  return pool;
}

class LightPool {
  constructor(G) {
    this.G = G;
    const q = G.quality;
    const n = q === 'low' ? 3 : q === 'medium' ? 5 : 7;
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffa860, 0, 10, 2);
      light.castShadow = false;
      light.name = 'pool-light';
      G.scene.add(light);
      this.slots.push({ light, desc: null, k: 0, want: false });
    }
    this.descs = [];
    this.room = null;
    this.pickT = 0;
    this._cam = new THREE.Vector3();
    this.removeSystem = G.addSystem('light-pool', (dt, t) => this.update(dt, t), ORDER.atmosphere + 6);
  }

  add(d) {
    const desc = {
      x: 0, y: 0, z: 0, color: 0xffb060, intensity: 1, radius: 8, kind: 'window', room: null, indoor: false, enabled: true, importance: 1,
      ...d,
    };
    desc._c = new THREE.Color(desc.color);
    desc._phase = Math.random() * 100;
    this.descs.push(desc);
    const pool = this;
    return {
      desc,
      remove: () => pool.remove(desc),
      setEnabled: (b) => { desc.enabled = !!b; },
    };
  }

  addMany(list, extra = {}) {
    return list.map((l) => this.add({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity, radius: l.radius, kind: l.kind, ...extra }));
  }

  remove(h) {
    const desc = h.desc || h;
    const i = this.descs.indexOf(desc);
    if (i >= 0) this.descs.splice(i, 1);
    for (const s of this.slots) if (s.desc === desc) s.desc = null;
  }

  setRoom(id) { this.room = id; }

  stats() {
    return { descriptors: this.descs.length, slots: this.slots.length, lit: this.slots.filter((s) => s.desc && s.k > 0.01).length };
  }

  // 0..1: how on this descriptor is right now (before the distance pick).
  level(d, lamp) {
    if (!d.enabled) return 0;
    if (!LAMP[d.kind]) return 1;
    // Inside its room the lamps are always lit; outside they follow dusk and dawn.
    if (d.room && d.room === this.room) return 1;
    return lamp;
  }

  pick() {
    const cam = this.G.camera ? this._cam.copy(this.G.camera.position) : this._cam.set(0, 0, 0);
    const lamp = this.G.uniforms.uWindowLight.value;
    const cands = [];
    for (const d of this.descs) {
      const lv = this.level(d, lamp);
      if (lv < 0.03) continue;
      const dx = d.x - cam.x, dy = d.y - cam.y, dz = d.z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > MAX_CAMERA_DIST + d.radius) continue;
      // Rooms other than the one the camera is in matter only from outside (their windows).
      if (d.indoor && d.room !== this.room && dist > d.radius * 1.2 + 6) continue;
      d._score = (dist * dist + 4) / (d.importance * d.intensity * (0.4 + lv));
      cands.push(d);
    }
    cands.sort((a, b) => a._score - b._score);
    const want = cands.slice(0, this.slots.length);
    for (const s of this.slots) s.want = !!s.desc && want.includes(s.desc);
    for (const d of want) {
      if (this.slots.some((s) => s.desc === d)) continue;
      // Prefer an empty slot, then one that is already fading out.
      let free = this.slots.find((s) => !s.desc);
      if (!free) free = this.slots.filter((s) => !s.want).sort((a, b) => a.k - b.k)[0];
      if (!free) continue;
      free.desc = d; free.k = free.light.intensity > 0.02 ? Math.min(free.k, 0.4) : 0; free.want = true;
    }
  }

  update(dt, t) {
    this.pickT -= dt;
    if (this.pickT <= 0) { this.pick(); this.pickT = 0.18; }
    const lamp = this.G.uniforms.uWindowLight.value;
    for (const s of this.slots) {
      const d = s.desc;
      if (!d) { s.light.intensity = 0; continue; }
      const on = this.level(d, lamp) >= 0.03 && s.want;
      s.k = on ? Math.min(1, s.k + dt * 3.5) : Math.max(0, s.k - dt * 3.5);
      if (s.k <= 0 && !on) { s.desc = null; s.light.intensity = 0; continue; }
      const lv = this.level(d, lamp);
      const f = 1 + (FLICKER[d.kind] || 0.05) * (Math.sin(t * 13.1 + d._phase) * Math.sin(t * 5.7 + d._phase * 2.3) + 0.4 * Math.sin(t * 29 + d._phase * 3));
      s.light.position.set(d.x, d.y, d.z);
      s.light.color.copy(d._c);
      s.light.distance = d.radius * REACH;
      s.light.intensity = d.intensity * (GAIN[d.kind] || 4) * lv * f * s.k;
    }
  }

  dispose() {
    this.removeSystem?.();
    for (const s of this.slots) { this.G.scene.remove(s.light); s.light.dispose(); }
    this.slots.length = 0;
    this.descs.length = 0;
    pool = null;
    if (this.G.world) this.G.world.lights = null;
  }
}
