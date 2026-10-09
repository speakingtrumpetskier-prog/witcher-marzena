// Low-poly chickens and corvids (raven, crow), animated procedurally.
//
//   const ch = makeChicken(seed)   -> { root, update(dt, speed, o) }   o = { peck 0..1, flap 0..1, t }
//   const b = makeBird('raven')    -> { root, update(dt, o) }          o = { fly 0..1, t, flapRate }
//   b.setFlying(bool)              shows the open wings and tucks the feet
// Perched birds are two meshes (body, head); wings are separate meshes only shown while they
// flap, so a flock on a roof costs almost nothing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spart as part, cyl } from '../tools.js';

let MAT = null;
function material() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return MAT;
}
const sphere = (r, w = 9, h = 7) => new THREE.SphereGeometry(r, w, h);

const HEN = [
  { body: 0xe6e0d0, wing: 0xd0c8b4, tail: 0xc8c0aa, comb: 0xb02a22 },
  { body: 0x9a5a34, wing: 0x7a4426, tail: 0x3a2a20, comb: 0xa8281e },
  { body: 0x2e2a28, wing: 0x201c1a, tail: 0x18241e, comb: 0xa8281e },
  { body: 0xb08a58, wing: 0x8a6a40, tail: 0x4a3a2a, comb: 0xb02a22 },
  { body: 0x7a6a5a, wing: 0x5a4c40, tail: 0x2e2824, comb: 0xa8281e },
];

export function makeChicken(seed = 0) {
  const pal = HEN[Math.abs(seed) % HEN.length];
  const rooster = Math.abs(seed) % 7 === 3;
  const k = rooster ? 1.15 : 1;
  const root = new THREE.Group();
  root.name = 'animal_chicken';
  const body = new THREE.Group();
  body.position.y = 0.2 * k;
  root.add(body);
  const bodyG = mergeGeometries([
    part(sphere(0.1 * k, 8, 6), pal.body, 0, 0, 0, 0, 0, 0, 0.85, 0.95, 1.25),
    part(sphere(0.07 * k, 6, 4), pal.body, 0, 0.04 * k, 0.09 * k, 0, 0, 0, 0.9, 1, 1),
    part(new THREE.ConeGeometry(0.06 * k, 0.17 * k, 5), pal.tail, 0, 0.07 * k, -0.15 * k, -0.9, 0, 0, 1, 1, 0.5),
    part(sphere(0.06 * k, 6, 4), pal.wing, 0.075 * k, 0.0, -0.01 * k, 0, 0, 0.15, 0.3, 0.8, 1.35),
    part(sphere(0.06 * k, 6, 4), pal.wing, -0.075 * k, 0.0, -0.01 * k, 0, 0, -0.15, 0.3, 0.8, 1.35),
  ], false);
  const bodyM = new THREE.Mesh(bodyG, material());
  body.add(bodyM);
  const neck = new THREE.Group();
  neck.position.set(0, 0.07 * k, 0.1 * k);
  body.add(neck);
  const headG = mergeGeometries([
    part(cyl(0.028 * k, 0.045 * k, 0.11 * k, 6), pal.body, 0, 0.04 * k, 0.0, 0.2, 0, 0),
    part(sphere(0.036 * k, 7, 5), pal.body, 0, 0.1 * k, 0.025 * k, 0, 0, 0, 0.85, 1, 1.1),
    part(new THREE.ConeGeometry(0.014 * k, 0.045 * k, 4), 0xd0a030, 0, 0.095 * k, 0.07 * k, Math.PI / 2, 0, 0),
    part(new THREE.BoxGeometry(0.012 * k, 0.04 * k, 0.05 * k), pal.comb, 0, 0.14 * k, 0.02 * k),
    part(sphere(0.014 * k, 5, 4), pal.comb, 0, 0.065 * k, 0.06 * k, 0, 0, 0, 0.7, 1.4, 0.7),
    part(sphere(0.006 * k, 4, 3), 0x14100c, 0.026 * k, 0.108 * k, 0.04 * k),
    part(sphere(0.006 * k, 4, 3), 0x14100c, -0.026 * k, 0.108 * k, 0.04 * k),
  ], false);
  const head = new THREE.Mesh(headG, material());
  neck.add(head);
  const legG = mergeGeometries([
    part(cyl(0.007, 0.009, 0.13 * k, 4), 0xc09a40, 0, -0.06 * k, 0),
    part(new THREE.BoxGeometry(0.05 * k, 0.008, 0.07 * k), 0xc09a40, 0, -0.125 * k, 0.02 * k),
  ], false);
  const legs = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.038 * k, 0.01 * k, 0.0);
    g.add(new THREE.Mesh(legG, material()));
    body.add(g);
    legs.push(g);
  }
  // open wings for the scatter flap (hidden otherwise)
  const wingG = mergeGeometries([part(new THREE.BoxGeometry(0.17 * k, 0.012, 0.13 * k), pal.wing, 0.085 * k, 0, 0, 0, 0, 0, 1, 1, 1)], false);
  const wings = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.07 * k, 0.04 * k, 0);
    const m = new THREE.Mesh(wingG, material());
    m.scale.x = sx;
    g.add(m);
    g.visible = false;
    body.add(g);
    wings.push(g);
  }
  const c = { root, body, neck, legs, wings, phase: Math.random() * 6, tOff: Math.random() * 10, bob: 0 };
  c.look = 0;
  c.update = (dt, speed, o = {}) => {
    const moving = speed > 0.05;
    if (moving) c.phase += dt * (6 + speed * 5);
    const s = Math.sin(c.phase);
    const amp = moving ? Math.min(0.9, 0.35 + speed * 0.25) : 0;
    legs[0].rotation.x = s * amp; legs[1].rotation.x = -s * amp;
    const flap = o.flap || 0;
    const peck = o.peck || 0;
    body.rotation.x = peck * 0.5 - flap * 0.35 + (moving ? 0.05 : 0);
    body.position.y = 0.2 * k + (moving ? Math.abs(s) * 0.012 : 0) + flap * 0.05 + (o.hop || 0);
    const bobHead = moving && flap < 0.1 ? Math.sin(c.phase * 2) * 0.12 : 0;
    neck.rotation.x = -peck * 1.1 + bobHead + (o.alert || 0) * -0.2;
    neck.rotation.y = c.look;
    neck.position.z = (0.1 + (moving ? Math.sin(c.phase * 2) * 0.012 : 0)) * k;
    if (flap > 0.05) {
      wings[0].visible = wings[1].visible = true;
      const f = Math.sin((o.t ?? 0) * 34 + c.tOff) * 0.9 * flap;
      wings[0].rotation.z = -0.3 - f; wings[1].rotation.z = 0.3 + f;
    } else wings[0].visible = wings[1].visible = false;
  };
  return c;
}

const CORVID = {
  raven: { body: 0x1a1a20, sheen: 0x2a3040, beak: 0x121214, s: 1.0 },
  crow: { body: 0x26262a, sheen: 0x3a3c44, beak: 0x18181a, s: 0.82 },
};

export function makeBird(kind = 'raven') {
  const P = CORVID[kind] || CORVID.raven;
  const s = P.s;
  const root = new THREE.Group();
  root.name = `animal_${kind}`;
  const body = new THREE.Group();
  body.position.y = 0.11 * s;
  root.add(body);
  const bodyG = mergeGeometries([
    part(sphere(0.07 * s, 8, 6), P.body, 0, 0, 0, 0, 0, 0, 0.85, 0.85, 1.55),
    part(sphere(0.055 * s, 6, 5), P.sheen, 0, 0.012 * s, 0.05 * s, 0, 0, 0, 0.9, 0.9, 1.1),
    part(new THREE.BoxGeometry(0.07 * s, 0.01 * s, 0.17 * s), P.body, 0, -0.01 * s, -0.17 * s, 0.25, 0, 0, 1, 1, 1),
    part(sphere(0.05 * s, 6, 4), P.sheen, 0.052 * s, 0.0, -0.02 * s, 0, 0, 0.1, 0.35, 0.8, 1.7),
    part(sphere(0.05 * s, 6, 4), P.sheen, -0.052 * s, 0.0, -0.02 * s, 0, 0, -0.1, 0.35, 0.8, 1.7),
    part(cyl(0.005 * s, 0.006 * s, 0.09 * s, 3), 0x2a2220, 0.025 * s, -0.09 * s, 0.01 * s),
    part(cyl(0.005 * s, 0.006 * s, 0.09 * s, 3), 0x2a2220, -0.025 * s, -0.09 * s, 0.01 * s),
  ], false);
  body.add(new THREE.Mesh(bodyG, material()));
  const neck = new THREE.Group();
  neck.position.set(0, 0.03 * s, 0.09 * s);
  body.add(neck);
  const headG = mergeGeometries([
    part(sphere(0.042 * s, 7, 5), P.body, 0, 0.02 * s, 0.02 * s, 0, 0, 0, 1, 1, 1.05),
    part(new THREE.ConeGeometry(0.02 * s, 0.085 * s, 5), P.beak, 0, 0.012 * s, 0.085 * s, Math.PI / 2 + 0.1, 0, 0, 1, 1, 0.8),
    part(sphere(0.007 * s, 4, 3), 0xd8d0c0, 0.03 * s, 0.035 * s, 0.045 * s),
    part(sphere(0.007 * s, 4, 3), 0xd8d0c0, -0.03 * s, 0.035 * s, 0.045 * s),
  ], false);
  neck.add(new THREE.Mesh(headG, material()));
  const wingG = mergeGeometries([
    part(new THREE.BoxGeometry(0.3 * s, 0.01 * s, 0.11 * s), P.body, 0.15 * s, 0, 0, 0, 0, 0, 1, 1, 1),
    part(new THREE.BoxGeometry(0.14 * s, 0.01 * s, 0.07 * s), P.sheen, 0.34 * s, 0, -0.03 * s, 0, 0.3, 0, 1, 1, 1),
  ], false);
  const wings = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.04 * s, 0.025 * s, 0.01 * s);
    const m = new THREE.Mesh(wingG, material());
    m.scale.x = sx;
    g.add(m);
    g.visible = false;
    body.add(g);
    wings.push(g);
  }
  const b = { root, body, neck, wings, flying: false, tOff: Math.random() * 10, look: 0, tilt: 0, bank: 0, pitch: 0 };
  b.setFlying = (f) => {
    b.flying = f;
    wings[0].visible = wings[1].visible = f;
  };
  b.update = (dt, o = {}) => {
    const t = o.t ?? 0;
    if (b.flying) {
      const rate = o.flapRate ?? 15;
      const glide = o.glide ? 0.12 : 1;
      const f = Math.sin(t * rate + b.tOff) * 0.95 * glide;
      wings[0].rotation.z = -0.2 - f; wings[1].rotation.z = 0.2 + f;
      wings[0].rotation.y = wings[1].rotation.y = 0;
      body.rotation.x = b.pitch;
      body.rotation.z = b.bank;
      body.position.y = 0.11 * s;
      neck.rotation.x = -b.pitch * 0.6;
    } else {
      body.rotation.x = 0.1 + (o.crouch || 0);
      body.rotation.z = 0;
      body.position.y = 0.11 * s + (o.hop || 0);
      neck.rotation.x = (o.peck || 0) * 0.9 - 0.05;
      neck.rotation.z = b.tilt;
    }
    neck.rotation.y = b.look;
  };
  return b;
}
