// A parametric low-poly four-legged rig (dog, goat, cat) animated procedurally.
//
//   const q = makeQuad(SPECS.dog, seed)     -> { root, setPose(name), update(dt, speed, extra), ... }
//   q.root          Group, feet at y = 0, faces +Z
//   q.setPose('stand' | 'sit' | 'lie' | 'sniff' | 'up')   target pose (blended)
//   q.look(yaw, pitch)                      head turn relative to the body (radians)
//   q.update(dt, speed, o)                  gait from ground speed m/s; o = { wag, chew, bark, t }
// Seven meshes (torso, head, tail, 4 legs) in one vertex-colored material; legs swing from the
// shoulder and hip pivots, the torso bobs, the tail wags, the head nods. No allocation per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spart as part, cyl } from '../tools.js';

let MAT = null;
function material() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  return MAT;
}

const sphere = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
const caps = (r, l, c = 4, s = 10) => new THREE.CapsuleGeometry(r, l, c, s);

// Tint by height so the underside and legs read lighter: fur above, belly color below.
function shade(g, belly, k = 1) {
  const pos = g.attributes.position, col = g.attributes.color;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  const c = new THREE.Color(belly);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, 1 - (pos.getY(i) - y0) / ((y1 - y0) || 1) * 1.8) * 0.65 * k;
    col.setXYZ(i, col.getX(i) + (c.r - col.getX(i)) * t, col.getY(i) + (c.g - col.getY(i)) * t, col.getZ(i) + (c.b - col.getZ(i)) * t);
  }
}

export const SPECS = {
  dog: {
    len: 0.74, h: 0.56, bodyR: 0.14, legR: 0.036, headR: 0.09, snout: 0.1, neckLen: 0.12, earKind: 'flop', tail: 'curl', tailLen: 0.3,
    palettes: [
      { fur: 0x8a6a48, belly: 0xc8b090, dark: 0x2a2420, light: 0xd8c6a4 },
      { fur: 0x3a3430, belly: 0x8a7a68, dark: 0x1c1816, light: 0xb8a888 },
      { fur: 0x9a8a78, belly: 0xe0d4c0, dark: 0x40362e, light: 0xf0e8d8 },
      { fur: 0x6a5848, belly: 0xb8a488, dark: 0x241e1a, light: 0xd0bc9c },
    ],
  },
  goat: {
    len: 0.88, h: 0.62, bodyR: 0.19, legR: 0.034, headR: 0.095, snout: 0.09, neckLen: 0.1, earKind: 'side', tail: 'short', tailLen: 0.1, horns: true, beard: true,
    palettes: [
      { fur: 0xc4b9a4, belly: 0xded4c0, dark: 0x4a4038, light: 0xe6dcc8 },
      { fur: 0x8a7a68, belly: 0xc4b8a2, dark: 0x2e2824, light: 0xd8ccb6 },
      { fur: 0x5a4c40, belly: 0xa8967c, dark: 0x1e1a16, light: 0xd8c8aa },
    ],
  },
  cat: {
    len: 0.4, h: 0.27, bodyR: 0.072, legR: 0.02, headR: 0.056, snout: 0.03, neckLen: 0.05, earKind: 'prick', tail: 'long', tailLen: 0.3,
    palettes: [
      { fur: 0x6a5a4c, belly: 0xc8b8a0, dark: 0x2a2420, light: 0xe0d4c0 },
      { fur: 0x2a2624, belly: 0x5a504a, dark: 0x141210, light: 0x8a7e72 },
      { fur: 0xc8a068, belly: 0xf0e0c0, dark: 0x5a3e24, light: 0xf6ead0 },
    ],
  },
};

export function makeQuad(kind, seed = 0) {
  const S = SPECS[kind];
  const pal = S.palettes[Math.abs(seed) % S.palettes.length];
  const { len, h, bodyR, legR, headR } = S;
  const legLen = h - bodyR * 0.9;
  const bodyY = legLen + bodyR * 0.55;
  const root = new THREE.Group();
  root.name = `animal_${kind}`;
  const body = new THREE.Group();
  body.position.y = bodyY;
  root.add(body);

  // torso: capsule along Z, deeper chest, slimmer waist; neck merged in
  const L = len - bodyR * 2;
  const torsoParts = [
    part(caps(bodyR, L, 3, 8), pal.fur, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1),
    part(sphere(bodyR * 1.12, 8, 6), pal.fur, 0, -bodyR * 0.06, len * 0.2, 0, 0, 0, 0.95, 1.05, 1.1),
    part(sphere(bodyR * 0.98, 8, 6), pal.fur, 0, 0.0, -len * 0.26, 0, 0, 0, 0.95, 1, 1),
    part(cyl(headR * 0.85, bodyR * 0.85, S.neckLen + 0.05, 7), pal.fur, 0, bodyR * 0.45 + S.neckLen * 0.4, len * 0.5 + S.neckLen * 0.1, 0.5, 0, 0),
  ];
  if (kind === 'dog') torsoParts.push(part(sphere(bodyR * 0.8, 7, 5), pal.light, 0, -bodyR * 0.2, len * 0.42, 0, 0, 0, 0.8, 0.9, 0.7));
  if (kind === 'goat') torsoParts.push(part(sphere(bodyR * 0.9, 7, 5), pal.fur, 0, bodyR * 0.25, len * 0.1, 0, 0, 0, 0.9, 0.5, 1.4));
  const torsoG = mergeGeometries(torsoParts, false);
  shade(torsoG, pal.belly);
  const torso = new THREE.Mesh(torsoG, material());
  torso.castShadow = kind !== 'cat';
  body.add(torso);

  // head on a pivot at the top of the neck
  const neck = new THREE.Group();
  const hz = len * 0.5 + S.neckLen * 0.55, hy = bodyR * 0.55 + S.neckLen * 0.85;
  neck.position.set(0, hy * 0.7, hz * 0.88);
  body.add(neck);
  const headParts = [
    part(sphere(headR, 8, 6), pal.fur, 0, 0.0, 0, 0, 0, 0, 0.92, 1, 1.05),
    part(sphere(headR * 0.62, 7, 5), kind === 'goat' ? pal.fur : pal.light, 0, -headR * 0.22, headR * 0.95, 0, 0, 0, 0.8, 0.75, S.snout / headR),
    part(sphere(headR * 0.2, 5, 4), pal.dark, 0, -headR * 0.05, headR * 0.95 + S.snout * 0.7, 0, 0, 0, 1.2, 0.9, 0.8),
  ];
  const earY = headR * 0.85, earZ = -headR * 0.1;
  if (S.earKind === 'flop') {
    for (const sx of [-1, 1]) headParts.push(part(sphere(headR * 0.55, 6, 4), pal.dark, sx * headR * 0.8, earY * 0.5, earZ, 0, 0, sx * 0.5, 0.35, 1, 0.8));
  } else if (S.earKind === 'prick') {
    for (const sx of [-1, 1]) headParts.push(part(new THREE.ConeGeometry(headR * 0.42, headR * 0.9, 4), pal.fur, sx * headR * 0.55, earY, earZ, 0, 0, -sx * 0.2));
  } else {
    for (const sx of [-1, 1]) headParts.push(part(sphere(headR * 0.5, 6, 4), pal.fur, sx * headR * 1.0, earY * 0.35, earZ, 0, 0, sx * 1.2, 0.3, 1, 0.9));
  }
  if (S.horns) {
    for (const sx of [-1, 1]) {
      headParts.push(part(new THREE.ConeGeometry(headR * 0.22, headR * 1.8, 5), 0xc8bca0, sx * headR * 0.38, headR * 1.25, -headR * 0.25, -0.5, 0, -sx * 0.18));
    }
  }
  if (S.beard) headParts.push(part(new THREE.ConeGeometry(headR * 0.22, headR * 0.9, 5), pal.light, 0, -headR * 0.9, headR * 0.75, 0, 0, 0));
  if (kind === 'cat' || kind === 'dog') {
    for (const sx of [-1, 1]) headParts.push(part(sphere(headR * 0.12, 4, 3), 0x1a1612, sx * headR * 0.45, headR * 0.25, headR * 0.82, 0, 0, 0));
  }
  const headG = mergeGeometries(headParts, false);
  const head = new THREE.Mesh(headG, material());
  head.castShadow = kind !== 'cat';
  head.position.set(0, 0.02, headR * 0.4);
  neck.add(head);

  // tail
  const tail = new THREE.Group();
  tail.position.set(0, bodyR * 0.35, -len * 0.5 + bodyR * 0.3);
  body.add(tail);
  let tailG;
  if (S.tail === 'curl') tailG = part(caps(0.02, S.tailLen, 2, 5), pal.fur, 0, S.tailLen * 0.5, -0.02, -0.5, 0, 0);
  else if (S.tail === 'long') tailG = mergeGeometries([part(caps(0.016, S.tailLen * 0.6, 2, 6), pal.fur, 0, 0.05, -0.1, -1.1, 0, 0), part(caps(0.015, S.tailLen * 0.45, 2, 6), pal.fur, 0, 0.19, -0.2, -0.4, 0, 0)], false);
  else tailG = part(new THREE.ConeGeometry(0.03, S.tailLen, 5), pal.fur, 0, S.tailLen * 0.3, -0.03, -0.9, 0, 0);
  const tailM = new THREE.Mesh(tailG, material());
  tail.add(tailM);

  // legs: pivot at shoulder / hip, one tapered mesh each (leg + paw)
  const legs = [];
  const lx = bodyR * 0.62, lzF = len * 0.5 - bodyR * 0.9, lzB = -len * 0.5 + bodyR * 0.9;
  const legG = mergeGeometries([
    part(cyl(legR * 1.15, legR * 0.8, legLen * 0.96, 5), pal.fur, 0, -legLen * 0.48, 0),
    part(sphere(legR * 1.25, 5, 4), pal.light, 0, -legLen + legR * 0.5, legR * 0.5, 0, 0, 0, 1, 0.6, 1.5),
  ], false);
  shade(legG, pal.light, 1.0);
  for (const [sx, z] of [[-1, lzF], [1, lzF], [-1, lzB], [1, lzB]]) {
    const g = new THREE.Group();
    g.position.set(sx * lx, -bodyR * 0.2, z);
    const m = new THREE.Mesh(legG, material());
    m.castShadow = kind !== 'cat';
    g.add(m);
    body.add(g);
    legs.push(g);
  }
  const q = {
    kind, root, body, neck, head, tail, legs, bodyY, legLen, len, bodyR,
    pal, phase: Math.random() * 6.28,
    // current pose params (blended toward the target)
    p: { y: bodyY, pitch: 0, headX: 0, headY: 0, fl: 0, bl: 0, tailX: 0, tailZ: 0, lowerHind: 0 },
    tp: { y: bodyY, pitch: 0, headX: 0, headY: 0, fl: 0, bl: 0, tailX: 0, tailZ: 0, lowerHind: 0 },
    lookYaw: 0, lookPitch: 0, wagT: Math.random() * 6, pose: 'stand',
  };
  q.setPose = (name) => setPose(q, name);
  q.look = (yaw, pitch = 0) => { q.lookYaw = yaw; q.lookPitch = pitch; };
  q.update = (dt, speed, o) => updateQuad(q, dt, speed, o || {});
  setPose(q, 'stand');
  Object.assign(q.p, q.tp);
  return q;
}

function setPose(q, name) {
  q.pose = name;
  const t = q.tp, bR = q.bodyR, L = q.legLen;
  const base = q.bodyY;
  t.y = base; t.pitch = 0; t.headX = 0; t.fl = 0; t.bl = 0; t.tailX = 0; t.lowerHind = 0;
  switch (name) {
    case 'sit':
      t.pitch = -0.7; t.y = base - L * 0.55 - bR * 0.1; t.fl = 0.7; t.bl = -0.85; t.headX = 0.45; t.tailX = 0.9; t.lowerHind = 0.55;
      break;
    case 'lie':
      t.y = bR * 0.95; t.pitch = 0; t.fl = -1.45; t.bl = 1.0; t.headX = 0.2; t.tailX = 0.5; t.lowerHind = 0.5;
      break;
    case 'sniff':
      t.headX = 0.9; t.pitch = 0.08;
      break;
    case 'up':
      t.headX = -0.4; t.pitch = -0.04;
      break;
    case 'crouch':
      t.y = base - L * 0.3; t.fl = 0.1; t.bl = -0.2; t.pitch = 0.1;
      break;
    default: break;
  }
}

function updateQuad(q, dt, speed, o) {
  const p = q.p, t = q.tp;
  const k = Math.min(1, dt * 7);
  for (const key in t) p[key] += (t[key] - p[key]) * k;
  // gait
  const moving = speed > 0.08;
  const stride = q.kind === 'cat' ? 0.55 : q.kind === 'goat' ? 0.9 : 0.8;
  if (moving) q.phase += (speed / stride) * dt * 2.6;
  const amp = moving ? Math.min(0.75, 0.2 + speed * 0.22) : 0;
  const sw = Math.sin(q.phase);
  const sw2 = Math.sin(q.phase + Math.PI);
  const lg = q.legs;
  const bodyPitch = p.pitch;
  // diagonal pairs: FL+BR, FR+BL
  lg[0].rotation.x = p.fl + sw * amp - bodyPitch * 0.0;
  lg[3].rotation.x = p.bl + sw * amp * 0.9;
  lg[1].rotation.x = p.fl + sw2 * amp;
  lg[2].rotation.x = p.bl + sw2 * amp * 0.9;
  // hind legs shorten when sitting (folded): scale
  const sy = 1 - p.lowerHind * 0.35;
  lg[2].scale.y = lg[3].scale.y = sy;
  lg[2].position.y = lg[3].position.y = -q.bodyR * 0.2;
  q.body.rotation.x = bodyPitch + (moving ? Math.sin(q.phase * 2) * 0.03 : 0);
  q.body.position.y = p.y + (moving ? Math.abs(Math.sin(q.phase)) * 0.012 * (1 + speed * 0.4) : 0) + (o.hop || 0);
  q.body.rotation.z = moving ? Math.sin(q.phase) * 0.025 : 0;
  // head: pose nod + look + bark / chew
  let hx = p.headX - bodyPitch * 0.6 + q.lookPitch;
  if (o.bark) hx -= Math.max(0, Math.sin(o.t * 22)) * 0.35;
  if (o.chew) hx += Math.sin(o.t * 9) * 0.05;
  if (o.peck) hx += o.peck;
  q.neck.rotation.x = hx;
  q.neck.rotation.y = q.lookYaw + (o.sway || 0) * Math.sin(o.t * 0.7);
  q.neck.rotation.z = o.tilt || 0;
  // tail
  q.wagT += dt * (o.wag ? 14 : 2.2);
  const wag = o.wag ? Math.sin(q.wagT) * 0.7 : Math.sin(q.wagT) * 0.12;
  q.tail.rotation.x = q.kind === 'cat' ? 0.3 + p.tailX * 0.2 : q.kind === 'goat' ? 0.1 : -0.35 - p.tailX * 0.5;
  q.tail.rotation.y = wag;
  if (q.kind === 'cat') q.tail.rotation.z = Math.sin(q.wagT * 0.5) * 0.15;
}
