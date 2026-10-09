// The living picture behind the title menu (owned by the lead). One composed image held for as long
// as the player sits on the menu: the ritual ring on the lake in late afternoon, looking into the
// low sun over the layered south-west ranges, the village roofs and their smoke between. A straw
// Marzanna stands in the ring with her back to us. Nothing in it is still: ribbons and ground snow
// stream in the wind, smoke leans, a few ravens cross against the light now and then, and every
// minute or so the drowned bell sounds under the ice behind the camera.
//
// The camera never cuts. It opens a few meters back and low, settles in over the first seconds,
// then drifts on slow, unrelated sines (truck, push, rise), so the near poles slide across the
// frame against a sky that hardly moves.
//
//   const scene = new TitleScene(G);   scene.start();   scene.update(dt) while the title owns the camera
//   scene.stop()   removes the set dressing and gives the weather back
import * as THREE from 'three';
import { LOC } from '../world/layout.js';

// Composition (see docs/PROGRESS.md "Title"). Hour 15.8: the sun about 8.5 degrees up, just over
// the sunset window's ranges. The camera looks a little left of the sun so it sits on the right
// third; the effigy sits left of center.
export const TITLE_SHOT = {
  hour: 15.8,
  fov: 40,
  cam: new THREE.Vector3(18.7, 1.4, -41),
  look: new THREE.Vector3(-53.2, 10.1, 28.5),
  effigy: { x: LOC.ritual.x, z: LOC.ritual.z, yaw: Math.atan2(-0.83, 0.54) },
};

const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A handful of ravens as one dynamic mesh: each bird is a body sliver and two wing triangles
// recomputed on the CPU every frame (a few dozen vertices, one draw call).
class Flock {
  constructor(G, n) {
    this.G = G;
    this.n = n;
    this.pos = new Float32Array(n * 9 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x14110f, side: THREE.DoubleSide, fog: true }));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'title-ravens';
    this.birds = Array.from({ length: n }, (_, i) => ({ off: new THREE.Vector3(), phase: Math.random() * 6.28, rate: 7 + Math.random() * 2, glide: 0, i }));
    this.wait = 9; // first pass a little after the picture settles
    this.pass = null;
  }

  // One crossing: a loose line of birds flying across the frame in front of the light.
  _newPass(cam, fwd, right) {
    const dist = 75 + Math.random() * 45;
    const side = Math.random() < 0.5 ? -1 : 1;
    const span = dist * 0.9;
    const c = cam.clone().addScaledVector(fwd, dist);
    const from = c.clone().addScaledVector(right, side * span);
    const to = c.clone().addScaledVector(right, -side * span).addScaledVector(fwd, (Math.random() - 0.5) * 30);
    const alt = 16 + Math.random() * 18;
    from.y = alt; to.y = alt + (Math.random() - 0.3) * 8;
    this.pass = { from, to, t: 0, dur: 20 + Math.random() * 10 };
    for (const b of this.birds) {
      b.off.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 9).addScaledVector(right, -side * b.i * 2.4);
      b.glide = Math.random() * 3;
    }
  }

  update(dt, cam, fwd, right) {
    if (!this.pass) {
      this.wait -= dt;
      if (this.wait <= 0) this._newPass(cam, fwd, right);
      this.pos.fill(0);
      this.mesh.geometry.attributes.position.needsUpdate = true;
      return;
    }
    const P = this.pass;
    P.t += dt;
    const u = P.t / P.dur;
    if (u >= 1) { this.pass = null; this.wait = 25 + Math.random() * 30; return; }
    const dir = _d.subVectors(P.to, P.from).normalize();
    const side = _s.set(-dir.z, 0, dir.x);
    let k = 0;
    for (const b of this.birds) {
      const p = _p.lerpVectors(P.from, P.to, u).add(b.off);
      p.y += Math.sin(P.t * 0.6 + b.i) * 0.8;
      // Flap in bursts, glide in between.
      b.glide -= dt;
      if (b.glide < -1.6 - Math.random()) b.glide = 0.8 + Math.random() * 2.2;
      b.phase += dt * (b.glide > 0 ? 0 : b.rate);
      const flap = b.glide > 0 ? 0.12 : Math.sin(b.phase) * 0.75;
      const w = 0.62, lift = Math.sin(flap) * w, reach = Math.cos(flap) * w;
      // body: a thin sliver along the flight direction
      k = tri(this.pos, k, p.x + dir.x * 0.32, p.y, p.z + dir.z * 0.32, p.x - dir.x * 0.3 + side.x * 0.05, p.y, p.z - dir.z * 0.3 + side.z * 0.05, p.x - dir.x * 0.3 - side.x * 0.05, p.y, p.z - dir.z * 0.3 - side.z * 0.05);
      for (const sgn of [1, -1]) {
        k = tri(this.pos, k,
          p.x + dir.x * 0.12, p.y, p.z + dir.z * 0.12,
          p.x - dir.x * 0.12, p.y, p.z - dir.z * 0.12,
          p.x + side.x * sgn * reach - dir.x * 0.1, p.y + lift, p.z + side.z * sgn * reach - dir.z * 0.1);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function tri(a, k, ...v) { for (let i = 0; i < 9; i++) a[k + i] = v[i]; return k + 9; }

export class TitleScene {
  constructor(G) {
    this.G = G;
    this.t = 0;
    this.active = false;
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.bellT = 14;
  }

  async start() {
    const G = this.G;
    if (this.active) return;
    this.active = true;
    this.t = 0;
    const S = TITLE_SHOT;
    this.fwd.subVectors(S.look, S.cam).setY(0).normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);

    // Weather: clear, the free-roam weather held, and a stronger wind so the ground snow streams.
    const W = G.weather;
    if (W) {
      this.weatherWas = { auto: W.auto, state: W.state };
      W.auto = false;
      try { W.set('clear', 0); } catch { /* optional */ }
      if (W.params) { W.params.wind = 0.5; W.params.gust = 0.4; W.params.drift = 0.55; }
    }

    // The effigy in the ring, back to us, facing the light.
    try {
      const { props } = await import('../world/props/index.js');
      if (!this.active) return;
      const e = props.make('effigy', { variant: 'pole', seed: 4 });
      e.position.set(S.effigy.x, 0, S.effigy.z);
      e.rotation.y = S.effigy.yaw;
      e.name = 'title-effigy';
      G.scene.add(e);
      this.effigy = e;
    } catch (err) { console.warn('[title] effigy', err); }

    this.flock = new Flock(G, 7);
    G.scene.add(this.flock.mesh);
  }

  update(dt) {
    if (!this.active) return;
    const G = this.G, cam = G.camera;
    if (!cam) return;
    this.t += dt;
    const t = this.t, S = TITLE_SHOT, f = this.fwd, r = this.right;

    // Opening: start 4.5 m back and lower, settle over 16 s; then the slow drift.
    const open = 1 - ease(clamp(t / 16, 0, 1));
    const truck = 3.2 * Math.sin(t * 0.043);
    const push = -1.2 * Math.cos(t * 0.029) + 1.2 - open * 4.5;
    const rise = 0.32 * Math.sin(t * 0.067 + 1.0) - open * 0.55;
    cam.position.copy(S.cam).addScaledVector(r, truck).addScaledVector(f, push);
    cam.position.y += rise;
    const gy = G.world?.heightAt?.(cam.position.x, cam.position.z);
    cam.position.y = Math.max(cam.position.y, (Number.isFinite(gy) ? Math.max(gy, 0) : 0) + 0.9);
    // The look point follows a little of the truck so the frame holds while near things slide.
    this.look.copy(S.look).addScaledVector(r, truck * 0.55 + 2.2 * Math.sin(t * 0.021 + 0.7));
    this.look.y += 1.2 * Math.sin(t * 0.051) + open * 2.5;
    cam.lookAt(this.look);

    this.flock?.update(dt, cam.position, f, r);

    // The drowned bell, somewhere behind us under the ice.
    this.bellT -= dt;
    if (this.bellT <= 0) {
      this.bellT = 48 + Math.random() * 30;
      const b = LOC.bellTower;
      try { G.audio?.sfx?.('bell_under_ice', { pos: { x: b.x, y: 0, z: b.z }, volume: 0.55 }); } catch { /* optional */ }
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    const G = this.G;
    this.effigy?.removeFromParent();
    this.effigy = null;
    this.flock?.dispose();
    this.flock = null;
    const W = G.weather;
    if (W && this.weatherWas) {
      W.auto = this.weatherWas.auto;
      // Whatever comes next (new game, continue) sets its own weather; put the numbers back meanwhile.
      try { W.set(W.state || 'clear', 0); } catch { /* optional */ }
    }
  }
}
