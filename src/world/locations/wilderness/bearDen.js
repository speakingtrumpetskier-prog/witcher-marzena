// Bear den (LOC.bearDen): a cave mouth in the north escarpment, built as overlay geometry (no terrain edits):
// a rock arch of terrain-rock blocks framing a dark opening set against the cliff, scree at its foot, bones and
// skulls scattered on the floor, trampled boughs where the bear sleeps, an old Lynx hunter slumped against the
// left wall in the tatters of his coat with his silver sword by his hand (note_wit), and a breath of warm mist
// from the dark. The bear itself is spawned by the creatures builder at `bearSleep`.
//
// G.world.locations.bearDen:
//   center, mouth (arch center on the ground), face (cliff hit point), yaw (outward direction), floorY,
//   bearSleep { x, y, z, yaw, radius }, hunter (remains), silverSword (note_wit clue), skulls[], bones, bedding,
//   approach (safe viewing spot), tracks (old bear trail), warn (radius around the bear where it wakes)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { Composer, rngOf, rockBlocks } from './compose.js';
import { huntersRemains, denBones, bedding } from './objects2.js';
import { silverSword } from './objects.js';
import { tex, groundRibbon } from './decals.js';

// Find the visible cliff face at (x, y) looking north from the south: raycast the cliff meshes, or march the terrain.
function faceZ(G, x, y) {
  const g = G.rocks?.cliffs;
  if (g) {
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y, -340), new THREE.Vector3(0, 0, -1), 0, 70);
    const hit = rc.intersectObject(g, true)[0];
    if (hit) return hit.point.z;
  }
  for (let z = -340; z > -400; z -= 0.25) if (G.world.heightAt(x, z) > y) return z;
  return -366;
}

export async function build(W) {
  const { G } = W;
  const L = LOC.bearDen;
  const rnd = rngOf(150);
  W.clear(L.x, L.z, 17);
  const X = L.x;
  // floor height at the foot of the cliff, iterating with the face position
  let zf = L.z - 4, floor = G.world.heightAt(X, zf + 2.5);
  for (let i = 0; i < 4; i++) { zf = faceZ(G, X, floor + 2.6); floor = G.world.heightAt(X, zf + 2.6); }
  const P = { x: X, y: floor, z: zf };
  const gy = (lx, lz) => G.world.heightAt(P.x + lx, P.z + lz);
  const W3 = (lx, lz, y) => new THREE.Vector3(P.x + lx, y ?? gy(lx, lz), P.z + lz);

  // ---- the arch: terrain-rock blocks framing the opening -----------------------------------------------------
  const blocks = [];
  const add = (v, lx, lz, dy, s, ry = 0, extra = {}) => blocks.push({ v, x: P.x + lx, y: gy(lx, lz) + dy, z: P.z + lz, s, ry, ...extra });
  const top = floor + 4.6;
  // jambs: crags either side, stacked
  for (const sx of [-1, 1]) {
    add(6, sx * 3.5, 0.6, -0.4, [1.5, 1.35, 1.7], sx * 0.3 + 0.2);
    add(5, sx * 3.7, 2.2, -0.5, [1.2, 0.95, 1.3], sx * 0.5);
    add(1, sx * 3.0, 3.8, -0.4, [1.0, 0.75, 1.1], sx * 0.8);
    add(4, sx * 3.2, 0.2, 2.3, [1.3, 1.1, 1.4], sx * 0.2 + 1.0, { embed: 0.1 }); // upper jamb stones
  }
  // lintel slab and roof mass over the opening
  blocks.push({ v: 3, x: P.x, y: top - 0.9, z: P.z + 1.9, s: [3.1, 1.15, 2.1], ry: 0.05, embed: 0.05, collide: false });
  blocks.push({ v: 4, x: P.x - 1.0, y: top + 0.1, z: P.z + 0.4, s: [2.6, 1.3, 1.8], ry: -0.2, embed: 0.1, collide: false });
  blocks.push({ v: 4, x: P.x + 2.2, y: top - 0.2, z: P.z + 0.9, s: [2.0, 1.1, 1.5], ry: 0.5, embed: 0.1, collide: false });
  // scree and fallen blocks in front of the mouth
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(-1.2, 1.2), d = rnd.range(4.5, 9);
    const lx = Math.sin(a) * d * 1.3, lz = 2 + Math.cos(a) * d * 0.9;
    if (Math.abs(lx) < 2.3 && lz < 7) continue; // keep the path in clear
    const s = rnd.range(0.5, 1.3);
    add(i % 7, lx, lz, -0.1, [s * 1.2, s * 0.8, s], rnd.range(0, 6.28));
  }
  rockBlocks(G, blocks, { tone: 0.72, name: 'bearDenArch', detail: 3 });

  // the dark inside: an arch-shaped plug set just proud of the cliff face, and inner shadow planes on the walls
  {
    const sh = new THREE.Shape();
    sh.moveTo(-2.75, -2.5);
    sh.lineTo(-2.7, 1.9);
    sh.quadraticCurveTo(-2.4, 3.8, 0, 4.0);
    sh.quadraticCurveTo(2.5, 3.8, 2.75, 1.7);
    sh.lineTo(2.75, -2.5);
    sh.closePath();
    const geo = new THREE.ShapeGeometry(sh, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x050608, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(P.x, floor, P.z + 0.45);
    m.name = 'wild:bearDenDark';
    G.scene.add(m);
    // a second, deeper layer so the dark has volume when seen at an angle
    const m2 = m.clone();
    m2.position.set(P.x, floor, P.z + 1.4);
    m2.scale.set(0.96, 0.9, 1);
    m2.material = new THREE.MeshBasicMaterial({ color: 0x0a0b0e, transparent: true, opacity: 0.55, fog: false, depthWrite: false });
    G.scene.add(m2);
  }

  // ---- inside: bedding, bones, the old hunter -------------------------------------------------------------------
  const c = new Composer(G, W.ctx, 'bearDen', P.x, P.z, { seed: 15, y: floor });
  const bearAt = { x: P.x + 0.9, z: P.z + 1.9 };
  c.at(bearAt.x, bearAt.z, { yaw: 0.4 }, (k) => bedding(k, { r: 1.8 }));
  c.at(P.x - 1.2, P.z + 2.8, { yaw: 0.2 }, (k) => denBones(k, { n: 10, r: 1.5 }));
  c.at(P.x + 1.6, P.z + 0.9, { yaw: 1.2 }, (k) => denBones(k, { n: 6, r: 1.0 }));
  c.prop('bones', P.x - 0.3, P.z + 3.4, { seed: 2, yaw: 0.8 });
  c.prop('skull', P.x + 2.0, P.z + 2.9, { seed: 3, opts: { variant: 'cow' }, yaw: 2.0 });
  c.prop('skull', P.x - 0.9, P.z + 1.2, { seed: 4, opts: { variant: 'wolf' }, yaw: 0.4 });
  c.prop('skull', P.x - 2.5, P.z + 3.0, { seed: 5, opts: { variant: 'human' }, yaw: -0.6 });
  const hp = { x: P.x - 2.15, z: P.z + 1.6 };
  c.at(hp.x, hp.z, { yaw: 0.35, dy: 0.0 }, (k) => huntersRemains(k, { scale: 1.0 }));
  c.circle(hp.x, hp.z, 0.6, floor - 1, floor + 1.6, 'remains');
  // the silver sword at his right hand, half under the bones; a pack, a snapped steel blade and a lantern
  const sw = { x: hp.x + 0.9, z: hp.z + 0.65 };
  c.at(sw.x, sw.z, { yaw: 1.9, dy: 0.03 }, (k) => silverSword(k, { rot: [Math.PI / 2 - 0.04, 0, 0], pos: [0, 0.03, 0] }));
  c.prop('sack', hp.x - 0.5, hp.z + 1.3, { seed: 3, yaw: 0.3 });
  c.prop('lantern', hp.x + 0.2, hp.z + 1.9, { seed: 1, rot: [0, 0, 1.4], dy: 0.1, opts: { mount: 'ground' } });
  c.build();

  // warm mist breathing out of the dark
  const mist = W.fx?.steam?.({ position: [P.x + 0.3, floor + 1.9, P.z + 1.2], parent: G.scene, height: 3.5, rate: 2.2, spread: 0.9, size: 1.2, opacity: 0.2 });
  void mist;

  // old bear tracks, half filled with snow, leading out of the mouth and away south-east
  const trk = [[P.x + 0.8, P.z + 3.5], [P.x + 3, P.z + 9], [P.x + 8, P.z + 16], [P.x + 15, P.z + 22]];
  groundRibbon(G, { pts: trk, width: 1.5, map: tex.tracks('wolf', 9), repeat: 7, lift: 0.04, opacity: 0.5, name: 'bearTracks', order: 4 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('bearDen', {
    id: 'bearDen',
    center: v(L.x, G.world.heightAt(L.x, L.z), L.z),
    mouth: v(P.x, floor, P.z + 1.0),
    face: v(P.x, floor, P.z),
    yaw: 0,
    floorY: floor,
    bearSleep: { x: bearAt.x, y: floor, z: bearAt.z, yaw: 2.6, radius: 7 },
    hunter: v(hp.x, floor + 0.5, hp.z),
    silverSword: v(sw.x, floor + 0.12, sw.z), // note_wit: "For Wit of the Lynx. Paid in full."
    skulls: [v(P.x + 2.0, floor, P.z + 2.9), v(P.x - 0.9, floor, P.z + 1.2), v(P.x - 2.5, floor, P.z + 3.0)],
    bones: v(P.x - 0.3, floor, P.z + 3.4),
    bedding: v(bearAt.x, floor, bearAt.z),
    approach: v(P.x, gy(0, 14), P.z + 14),
    tracks: trk.map(([x, z]) => v(x, G.world.heightAt(x, z), z)),
    warn: 7,
  });
  void W3;
}
