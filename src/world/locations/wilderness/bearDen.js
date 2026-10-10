// Bear den (LOC.bearDen): a cave mouth in the north escarpment, built as overlay geometry (no terrain edits).
// The escarpment is a continuous cliff, so the cave is a rock buttress heaped against its foot: three rows of
// boulders ring a tall horseshoe mouth, heavier blocks pile up over it and roll back into the cliff, and behind
// them a faceted rock shell makes a real alcove six metres deep whose walls go dark toward the back. The floor
// is trampled bare earth, the bear's nest lies in the middle, bones and skulls are scattered about, and an old
// Lynx hunter sits slumped against the left wall in the tatters of his coat with his silver sword by his hand
// (note_wit). A faint breath of warm air comes out of the dark. The bear itself is spawned by the creatures
// builder at `bearSleep`.
//
// G.world.locations.bearDen:
//   center, mouth (arch center on the ground), face (cliff hit point), yaw (outward direction), floorY,
//   bearSleep { x, y, z, yaw, radius }, hunter (remains), silverSword (note_wit clue), skulls[], bones, bedding,
//   approach (safe viewing spot), tracks (old bear trail), warn (radius around the bear where it wakes)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { Composer } from './compose.js';
import { denRock } from './denRock.js';
import { huntersRemains, denBones, bedding } from './objects2.js';
import { silverSword } from './objects.js';
import { tex, groundRibbon, groundPatch } from './decals.js';

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
  W.clear(L.x, L.z, 20);
  const X = L.x;
  // floor height at the foot of the cliff, iterating with the face position
  let zf = L.z - 4, floor = G.world.heightAt(X, zf + 2.5);
  for (let i = 0; i < 4; i++) { zf = faceZ(G, X, floor + 2.6); floor = G.world.heightAt(X, zf + 2.6); }
  const P = { x: X, y: floor, z: zf };
  const gy = (lx, lz) => G.world.heightAt(P.x + lx, P.z + lz);
  const c = new Composer(G, W.ctx, 'bearDen', P.x, P.z, { seed: 15, y: floor });

  // ---- the alcove and the buttress heaped round it (see denRock.js) ----------------------------------------------
  const den = denRock(G, c, { x: P.x, z: P.z, yaw: 0, k: 1, seed: 150, tone: 0.72, name: 'bearDen' });
  const MOUTH_D = den.mouthD;

  // trampled bare earth under the roof and out into the yard, darker toward the back
  const earth = tex.blob('denEarth', { r: 70, g: 56, b: 44, a: 0.96, seed: 12, speck: 0.12, size: 256, ragged: 1.1, solid: 1 });
  groundPatch(G, { x: P.x, z: P.z + 4.3, w: 8.4, d: 9.4, yaw: 0, map: earth, opacity: 0.96, lift: 0.05, name: 'denEarth' });
  const shade = tex.blob('denShade', { r: 6, g: 5, b: 5, a: 0.85, seed: 14, speck: 0, size: 128, ragged: 0.5 });
  groundPatch(G, { x: P.x, z: P.z + 1.8, w: 7.4, d: 5.8, yaw: 0, map: shade, opacity: 0.9, lift: 0.075, name: 'denShade' });

  // ---- inside: bedding, bones, the old hunter -------------------------------------------------------------------
  const bearAt = { x: P.x + 0.9, z: P.z + 3.0 };
  c.at(bearAt.x, bearAt.z, { yaw: 0.4 }, (k) => bedding(k, { r: 1.7 }));
  c.at(P.x - 1.0, P.z + 4.9, { yaw: 0.2 }, (k) => denBones(k, { n: 10, r: 1.6 }));
  c.at(P.x + 2.0, P.z + 1.8, { yaw: 1.2 }, (k) => denBones(k, { n: 7, r: 1.2 }));
  c.at(P.x + 0.4, P.z + 6.6, { yaw: 2.2 }, (k) => denBones(k, { n: 6, r: 1.4 }));
  c.prop('bones', P.x - 0.2, P.z + 5.6, { seed: 2, yaw: 0.8 });
  c.prop('skull', P.x + 2.2, P.z + 4.6, { seed: 3, opts: { variant: 'cow' }, yaw: 2.0 });
  c.prop('skull', P.x - 0.9, P.z + 2.6, { seed: 4, opts: { variant: 'wolf' }, yaw: 0.4 });
  c.prop('skull', P.x + 0.6, P.z + 7.2, { seed: 5, opts: { variant: 'human' }, yaw: -0.6 });
  const hp = { x: P.x - 2.55, z: P.z + 4.2 };
  c.at(hp.x, hp.z, { yaw: 0.5, dy: 0.0 }, (k) => huntersRemains(k, { scale: 1.0 }));
  c.circle(hp.x, hp.z, 0.6, floor - 1, floor + 1.6, 'remains');
  // the silver sword at his right hand, half under the bones; a pack, a snapped steel blade and a lantern
  const sw = { x: hp.x + 0.95, z: hp.z + 0.75 };
  c.prop('sack', hp.x - 0.1, hp.z + 1.4, { seed: 3, yaw: 0.3 });
  c.prop('lantern', hp.x + 0.45, hp.z + 2.0, { seed: 1, rot: [0, 0, 1.4], dy: 0.1, opts: { mount: 'ground' } });
  c.build();
  // The sword is built on its own, not merged into the den, so taking it takes it away
  // (story/controller/side.js hides it on pickup and when a save already has it).
  const cs = new Composer(G, W.ctx, 'bearDenSword', sw.x, sw.z, { seed: 16, y: floor });
  cs.at(sw.x, sw.z, { yaw: 1.9, dy: 0.03 }, (k) => silverSword(k, { rot: [Math.PI / 2 - 0.04, 0, 0], pos: [0, 0.03, 0] }));
  const swordGroup = cs.build();

  // a faint warm breath out of the dark
  W.fx?.steam?.({ position: [P.x + 0.4, floor + 2.2, P.z + 4.8], parent: G.scene, height: 3.2, rate: 1.4, spread: 1.8, size: 1.5, opacity: 0.1 });

  // the den is a cave to the ears and the light
  W.interior({ id: 'bearDen', polygon: [[P.x - 3.1, P.z + 0.2], [P.x + 3.1, P.z + 0.2], [P.x + 3.4, P.z + MOUTH_D], [P.x - 3.4, P.z + MOUTH_D]], y0: floor - 1, y1: floor + 6, env: 'cave' });

  // old bear tracks, half filled with snow, leading out of the mouth and away south-east
  const trk = [[P.x + 0.8, P.z + MOUTH_D + 1], [P.x + 3, P.z + 12], [P.x + 8, P.z + 18], [P.x + 15, P.z + 24]];
  groundRibbon(G, { pts: trk, width: 1.5, map: tex.tracks('wolf', 9), repeat: 7, lift: 0.04, opacity: 0.5, name: 'bearTracks', order: 4 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('bearDen', {
    id: 'bearDen',
    center: v(L.x, G.world.heightAt(L.x, L.z), L.z),
    mouth: v(P.x, floor, P.z + MOUTH_D),
    face: v(P.x, floor, P.z),
    yaw: 0,
    floorY: floor,
    bearSleep: { x: bearAt.x, y: floor, z: bearAt.z, yaw: 2.4, radius: 7 },
    hunter: v(hp.x, floor + 0.5, hp.z),
    silverSword: v(sw.x, floor + 0.12, sw.z), // note_wit: "For Wit of the Lynx. Paid in full."
    silverSwordObj: swordGroup, // the sword's own group (hide it once taken)
    skulls: [v(P.x + 2.2, floor, P.z + 4.6), v(P.x - 0.9, floor, P.z + 2.6), v(P.x + 0.6, floor, P.z + 7.2)],
    bones: v(P.x - 0.2, floor, P.z + 5.6),
    bedding: v(bearAt.x, floor, bearAt.z),
    approach: v(P.x, gy(0, 18), P.z + 18),
    tracks: trk.map(([x, z]) => v(x, G.world.heightAt(x, z), z)),
    warn: 7,
  });
}
