// The fishing scene objects, shared by every session: the rod in her hand, the line from its tip to the water and down,
// the jig, the ripples on the water, and the fish itself (under the hole while it is on, then in the air and on the ice).
//
//   const v = new FishView(G)
//   v.attach(character) / v.detach()           put the rod in the right hand / take it out
//   v.setHole(x, z, r)                         where the water is
//   v.frame({ bend, tremble, t, slack, edge, runDir, depth, fishDepth, fishVisible })   per frame: rod, line, jig
//   v.ripple(r0, r1, seconds)
//   v.showFish(id, kg) / v.fishAt(...) / v.hideFish()
import * as THREE from 'three';
import { makeRod, makeFish, makeRipple } from './mesh.js';

const N_AIR = 14, N_WATER = 6;

export class FishView {
  constructor(G) {
    this.G = G;
    this.rod = makeRod();
    this.hole = { x: 0, z: 0, r: 0.3 };
    this.tip = new THREE.Vector3();
    this.contact = new THREE.Vector3();
    // the line, one polyline: tip to the water, then down
    const n = N_AIR + N_WATER;
    this.linePos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xeef0e6, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 8;
    this.line.visible = false;
    G.scene.add(this.line);
    // the jig: a drop of lead with a bright bead
    this.jig = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.35, metalness: 0.7 }));
    this.jig.visible = false;
    G.scene.add(this.jig);
    this.ripples = [makeRipple(), makeRipple(), makeRipple()];
    this.ripples.forEach((r) => G.scene.add(r.mesh));
    this._rip = 0;
    this.fish = null; // { api, id }
    this.char = null;
  }

  attach(character) {
    this.char = character;
    character.attach('handR', this.rod.group);
    this.rod.group.visible = true;
    this.line.visible = true;
  }

  detach() {
    if (this.rod.group.parent) this.rod.group.parent.remove(this.rod.group);
    this.line.visible = false;
    this.jig.visible = false;
    this.char = null;
  }

  setHole(x, z, r) {
    this.hole.x = x; this.hole.z = z; this.hole.r = r;
  }

  ripple(r0 = 0.3, r1 = 1.0, seconds = 1.3) {
    const r = this.ripples[this._rip++ % this.ripples.length];
    r.play(this.hole.x, 0.02, this.hole.z, r0, r1, seconds);
  }

  // s: { bend 0..1.2, tremble (m), t (seconds), slack 0..1 (how loose the line hangs), edge -1..1 (the line dragged to the
  //      side of the hole by a run), depth (m the jig hangs), fish: { depth, ang, rad } | null }
  frame(s, dt) {
    for (const r of this.ripples) r.update(dt);
    const tip = this.rod.update(s.bend, s.tremble, s.t);
    this.tip.copy(tip);
    const H = this.hole;
    // where the line meets the water: the middle of the hole, dragged toward one side when a fish runs under the ice
    const edge = s.edge || 0;
    const off = Math.min(H.r * 0.85, 0.5) * edge;
    const side = this._side ||= new THREE.Vector3();
    side.set(Math.cos(s.runYaw || 0), 0, -Math.sin(s.runYaw || 0));
    this.contact.set(H.x + side.x * off, 0.015, H.z + side.z * off);
    const p = this.linePos;
    const sag = 0.16 * s.slack;
    for (let i = 0; i < N_AIR; i++) {
      const k = i / (N_AIR - 1);
      p[i * 3] = tip.x + (this.contact.x - tip.x) * k;
      p[i * 3 + 1] = tip.y + (this.contact.y - tip.y) * k - sag * Math.sin(Math.PI * k) * (1 - 0.3 * k);
      p[i * 3 + 2] = tip.z + (this.contact.z - tip.z) * k;
    }
    // below the surface: to the jig, or to the fish
    const endX = s.fish ? H.x + Math.cos(s.fish.ang) * s.fish.rad : H.x;
    const endZ = s.fish ? H.z + Math.sin(s.fish.ang) * s.fish.rad : H.z;
    const endY = s.fish ? -s.fish.depth : -s.depth;
    for (let i = 0; i < N_WATER; i++) {
      const k = (i + 1) / N_WATER;
      const j = N_AIR + i;
      p[j * 3] = this.contact.x + (endX - this.contact.x) * k;
      p[j * 3 + 1] = this.contact.y + (endY - this.contact.y) * k;
      p[j * 3 + 2] = this.contact.z + (endZ - this.contact.z) * k;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    // the jig shows when it is lifted near the surface
    this.jig.visible = !s.fish && s.depth < 0.6;
    this.jig.position.set(endX, endY, endZ);
    const f = this.fish;
    if (f) {
      if (s.fish) {
        f.api.group.visible = true;
        const a = s.fish.ang;
        f.api.group.position.set(endX, endY - 0.04, endZ);
        // swimming round the hole, head along the circle
        f.api.group.rotation.set(0, -a + Math.PI, 0.25 * Math.sin(s.t * 3));
        f.api.setBend(s.fish.bend || 0);
      } else if (!s.air) f.api.group.visible = false;
    }
  }

  showFish(id, kg) {
    this.hideFish();
    const api = makeFish(id, kg);
    api.group.visible = false;
    this.G.scene.add(api.group);
    this.fish = { api, id, kg };
    return api;
  }

  hideFish() {
    if (!this.fish) return;
    this.G.scene.remove(this.fish.api.group);
    this.fish.api.dispose();
    this.fish = null;
  }

  dispose() {
    this.detach();
    this.hideFish();
    this.G.scene.remove(this.line);
    this.G.scene.remove(this.jig);
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.jig.geometry.dispose();
    this.jig.material.dispose();
    for (const r of this.ripples) { this.G.scene.remove(r.mesh); r.dispose(); }
    this.rod.dispose();
  }
}
