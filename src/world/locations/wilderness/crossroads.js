// Crossroads (LOC.crossroads): the pass road meets the forest track. A signpost in the fork (Marzena, the
// Pass, the Forest) and, in the wedge between the village road and the forest track, the hanged man's tree:
// a dead pine with one low limb, a grain thief hanged from it, a kicked-over barrel under his feet, loaves
// in the snow, his sister's note pinned to his coat, candle stubs she left and could not reach him to take down.
//
// G.world.locations.crossroads:
//   junction, signpost, tree { x, z, y }, hanged { character, chest, feet, tip, laidAt }, note (note_hanged clue at the coat),
//   notePrompt (a reachable point under his feet for the interact radius), raven (perch on the limb), loaves, candles,
//   setCut(bool) (async: cut him down and lay him beside the tree, or hang him back for a reset)
import * as THREE from 'three';
import { LOC, ROADS } from '../../layout.js';
import { Composer, rngOf, rot2 } from './compose.js';
import { gallowsTree } from './objects.js';
import { hangedMan, frostFace, frozenChar, nudge } from './figures.js';
import { signBoard, groundRibbon, tex } from './decals.js';
import { Kit } from '../../props/kit.js';

const unit = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };

export async function build(W) {
  const { G } = W;
  const L = LOC.crossroads;
  const J = { x: L.x, z: L.z };
  const pass = ROADS.find((r) => r.id === 'pass').pts, forest = ROADS.find((r) => r.id === 'forest').pts;
  const iJ = pass.findIndex((p) => p[0] === J.x && p[1] === J.z);
  const toVillage = unit(pass[iJ + 1][0] - J.x, pass[iJ + 1][1] - J.z);
  const toPass = unit(pass[iJ - 1][0] - J.x, pass[iJ - 1][1] - J.z);
  const toForest = unit(forest[1][0] - J.x, forest[1][1] - J.z);
  const bis = unit(toVillage.x + toForest.x, toVillage.z + toForest.z);
  W.clear(J.x, J.z, 14);
  const rnd = rngOf(230);

  const c = new Composer(G, W.ctx, 'crossroads', J.x, J.z, { seed: 23 });

  // ---- the signpost, in the middle of the fork --------------------------------------------------
  const sp = { x: J.x + bis.x * 3.4, z: J.z + bis.z * 3.4 };
  const spY = c.ground(sp.x, sp.z);
  c.at(sp.x, sp.z, { yaw: 0.4 }, (k) => {
    k.tube('wood', [[0, -0.3, 0], [0.02, 1.4, 0], [0, 2.7, 0.01]], 0.085, { radial: 7, tint: 0x7a6c5e, tile: 0.5 });
    k.cyl('wood', 0.12, 0.1, 0.12, { pos: [0, 2.74, 0], radial: 7, tint: 0x6a5e52 });
    k.mound(0.24, 0.08, 0.24, { pos: [0, 2.8, 0], jseed: 2 });
    k.mound(1.0, 0.25, 1.0, { pos: [0, 0, 0], jseed: 6 });
    // red thread tied round the post
    k.cyl('ribbon', 0.095, 0.095, 0.05, { pos: [0, 1.0, 0], radial: 8, tint: 0x7a241a, cap: null, grime: 0 });
  });
  c.circle(sp.x, sp.z, 0.35, spY - 1, spY + 3, 'signpost');
  const boards = [
    ['MARZENA', toVillage, 2.42, 1.6],
    ['THE PASS', toPass, 2.04, 1.5],
    ['THE FOREST', toForest, 2.04, 1.7],
  ];
  const boardObjs = [];
  boards.forEach(([text, dir, h, w], i) => {
    const b = signBoard(G, { text, w, h: 0.36, seed: 3 + i * 5 });
    // board's local +x runs along the road; offset along the board so the post sits near its tail
    const yaw = Math.atan2(-dir.z, dir.x);
    b.position.set(sp.x + dir.x * (w / 2 - 0.1), spY + h - (i === 2 ? 0.4 : 0), sp.z + dir.z * (w / 2 - 0.1));
    b.rotation.y = yaw + (i === 2 ? 0.04 : -0.03 * i);
    // the third board (forest) hangs a little lower so none overlap
    c.scene(b);
    boardObjs.push(b);
  });

  // ---- the hanged man's tree --------------------------------------------------------------------------
  const tp = { x: J.x + bis.x * 13 - bis.z * 1.5, z: J.z + bis.z * 13 + bis.x * 1.5 };
  const tY = c.ground(tp.x, tp.z, 1);
  // the limb should reach out over the road side so it is seen from the junction: face it toward the signpost
  const yawT = Math.atan2(-(J.z - tp.z), (J.x - tp.x)) ;
  let tipLocal = null;
  c.at(tp.x, tp.z, { yaw: yawT, dy: -0.1 }, (k) => { tipLocal = gallowsTree(k, { scale: 1.0 }).tip; });
  c.circle(tp.x, tp.z, 0.6, tY - 1, tY + 6, 'gallows tree');
  const [tdx, tdz] = rot2(tipLocal[0], tipLocal[2], yawT);
  const tip = new THREE.Vector3(tp.x + tdx, tY - 0.1 + tipLocal[1], tp.z + tdz);

  // kicked-over barrel under the feet, a split sack of oats, three loaves in the snow, the sister's candles
  const under = { x: tip.x, z: tip.z };
  c.prop('barrel', under.x + 0.55, under.z + 0.35, { seed: 3, rot: [0, 0, 1.52], dy: 0.3, yaw: 0.7, opts: { variant: 'plain' } });
  c.prop('sack', under.x - 0.5, under.z - 0.6, { seed: 2, yaw: 2.2, rot: [0, 0, 0.9], dy: 0.15 });
  c.at(under.x - 0.9, under.z - 0.9, { yaw: 0.5 }, (k) => {
    k.mound(0.7, 0.07, 0.5, { pos: [0, 0, 0], jseed: 2, tint: 0xe6d8a8 });
    for (let i = 0; i < 3; i++) k.blob('straw', 0.085, { pos: [0.3 + i * 0.22, 0.05, 0.4 + (i % 2) * 0.12], scale: [1.4, 0.7, 0.9], detail: 1, tint: 0xc8a064, jitter: 0.012, grime: 0.15 });
  });
  const cand = { x: under.x + 1.7, z: under.z - 0.4 };
  c.prop('offering', cand.x, cand.z, { seed: 2, yaw: 0.4, opts: { variant: 'candle' } });
  c.prop('offering', cand.x + 0.5, cand.z + 0.35, { seed: 5, yaw: 1.6, opts: { variant: 'bread' } });
  c.at(cand.x + 0.25, cand.z - 0.5, { yaw: 0 }, (k) => k.hang('ribbon', 0.05, 0.4, { pos: [0, 0.3, 0], tint: 0x7a241a, wave: 0.02 }));

  // ---- the cairn and a stack of firewood someone left for the next traveller ---------------------------
  const cp = { x: J.x - bis.z * 5 - bis.x * 1.5, z: J.z + bis.x * 5 - bis.z * 1.5 };
  c.prop('firewoodStack', cp.x, cp.z, { seed: 2, yaw: 0.5 });
  c.build();

  // ---- the man himself (separate: he sways in the wind) ------------------------------------------------
  const hang = 0.72;
  const man = await hangedMan(G, 'villager_m_8', { x: tip.x, z: tip.z, y: tip.y, tip, hang, yaw: yawT + 1.0, tint: [0.88, 0.93, 1.0] });
  // rope: from the limb to the neck, with a noose knot, drawn in the pivot's frame
  {
    const k = new Kit('hangRope', { seed: 4 });
    k.tube('rope', [[0.0, 0.05, 0], [0.01, -hang * 0.5, 0.01], [0.0, -hang, 0.03]], 0.026, { radial: 6, tint: 0xb89c6c, grime: 0 });
    k.torus('rope', 0.11, 0.022, { pos: [0, -hang - 0.02, 0.02], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 4, tint: 0xa88c5c, grime: 0 });
    k.sph('rope', 0.04, { pos: [0.08, -hang + 0.02, 0.1], tint: 0xa88c5c, grime: 0 });
    k.hang('ribbon', 0.02, 0.5, { pos: [0.0, 0.0, 0], tint: 0xb89c6c, sway: 0, grime: 0 }); // rope's free end above the limb
    const g = k.build();
    man.pivot.add(g);
  }
  // snow on the shoulders
  {
    const k = new Kit('hangSnow', { seed: 5 });
    k.mound(0.34, 0.07, 0.22, { pos: [-0.02, -hang - 0.18 - 0.05, 0.0], jseed: 3 });
    const g = k.build();
    man.pivot.add(g);
  }

  frostFace(man, { opacity: 0.35 });
  // the sister's note, pinned to his coat
  {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.17), new THREE.MeshStandardMaterial({ color: 0xe6dcc0, roughness: 0.95, side: THREE.DoubleSide }));
    paper.position.set(0.03, -0.02, 0.17);
    paper.rotation.set(0, 0, 0.12);
    (man.bones.chest || man.root).add(paper);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
    pin.position.set(0.03, 0.04, 0.18);
    (man.bones.chest || man.root).add(pin);
  }
  const footY = tip.y - hang - (man.height || 1.7) * 0.86;
  const chest = new THREE.Vector3(tip.x, footY + (man.height || 1.7) * 0.72, tip.z);

  // ---- cut down (side quest "Three Loaves", story/controller/side.js) -------------------------------
  // The rope's cut end stays on the limb; he is laid on his back beside the tree with his coat drawn up
  // over his face. The lying figure is built the first time it is needed (a character costs ~0.4 s, and
  // the controller does it under a fade).
  const stub = (() => {
    const k = new Kit('hangStub', { seed: 6 });
    k.tube('rope', [[0.0, 0.05, 0], [0.01, -0.16, 0.0], [0.03, -0.3, 0.02]], 0.026, { radial: 6, tint: 0xb89c6c, grime: 0 });
    k.sph('rope', 0.032, { pos: [0.03, -0.31, 0.02], scale: [1, 0.6, 1], tint: 0xc8b088, grime: 0 });
    const g = k.build();
    g.position.copy(tip);
    g.visible = false;
    G.scene.add(g);
    return g;
  })();
  // Beside the tree, off the road side of the limb, lying along it.
  const side = { x: -tdz, z: tdx };
  const sl = Math.hypot(side.x, side.z) || 1;
  const laidAt = { x: tp.x + tdx * 0.55 + (side.x / sl) * 1.25, z: tp.z + tdz * 0.55 + (side.z / sl) * 1.25 };
  let laid = null, building = null;
  async function layBody() {
    const gy = c.ground(laidAt.x, laidAt.z);
    // His own limp standing pose, laid on its back: arms stay at his sides, the head straightened and rolled
    // a little to one side, the feet relaxed.
    const lc = await frozenChar(G, 'villager_m_8', {
      x: laidAt.x, z: laidAt.z, y: gy, yaw: 0, base: 'idle', steps: 1.2, tint: [0.88, 0.93, 1.0],
      pose: (ch) => {
        nudge(ch, 'neck', 4, 0, 6);
        nudge(ch, 'head', -2, 18, 14);
        nudge(ch, 'shoulderL', 0, 0, 10);
        nudge(ch, 'shoulderR', 0, 0, -8);
        nudge(ch, 'thighL', 0, 0, 5);
        nudge(ch, 'thighR', 0, 0, -4);
        nudge(ch, 'footL', -12, 0, 14);
        nudge(ch, 'footR', -10, 0, -12);
      },
    });
    // Tilt back about his own right axis first, then turn him to lie along the limb (Euler YXZ).
    lc.root.rotation.set(-Math.PI / 2, yawT + Math.PI / 2, 0, 'YXZ');
    lc.root.position.set(laidAt.x, gy + 0.13, laidAt.z);
    lc.root.updateMatrixWorld(true);
    // His coat drawn up over his face: a dark wool drape over the head and chest, laid along the body.
    const head = new THREE.Vector3(), chest = new THREE.Vector3();
    (lc.bones.head || lc.root).getWorldPosition(head);
    (lc.bones.chest || lc.bones.spine || lc.root).getWorldPosition(chest);
    const along = head.clone().sub(chest).setY(0);
    const len = Math.max(0.05, along.length());
    const k = new Kit('laidCoat', { seed: 9 });
    k.blob('cloth', 0.26, { pos: [0, 0, 0], scale: [1.3, 0.42, 1.75], detail: 2, tint: 0x4a3c30, jitter: 0.025, grime: 0.25 });
    k.blob('cloth', 0.17, { pos: [0.1, 0.03, -0.3], scale: [1.4, 0.4, 1.1], detail: 1, tint: 0x3f3328, jitter: 0.02, grime: 0.25 });
    k.blob('cloth', 0.1, { pos: [-0.22, -0.03, 0.28], scale: [1.2, 0.5, 1.6], detail: 1, tint: 0x3f3328, jitter: 0.02, grime: 0.2 });
    const coat = k.build();
    const mid = chest.clone().lerp(head, 0.55);
    coat.position.set(mid.x, gy + 0.2, mid.z);
    coat.rotation.y = Math.atan2(along.x / len, along.z / len);
    coat.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    G.scene.add(coat);
    return { c: lc, coat };
  }
  async function setCut(cut) {
    man.pivot.visible = !cut;
    stub.visible = cut;
    if (cut && !laid) { building ||= layBody(); laid = await building; }
    if (laid) { laid.c.root.visible = cut; laid.coat.visible = cut; }
  }
  W.loc('crossroads', {
    id: 'crossroads',
    junction: new THREE.Vector3(J.x, c.ground(J.x, J.z), J.z),
    signpost: new THREE.Vector3(sp.x, spY, sp.z),
    tree: { x: tp.x, z: tp.z, y: tY },
    hanged: { character: man, chest, feet: new THREE.Vector3(tip.x, footY, tip.z), tip, laidAt: new THREE.Vector3(laidAt.x, c.ground(laidAt.x, laidAt.z), laidAt.z) },
    setCut, // setCut(true) takes him down and lays him beside the tree (async), setCut(false) puts him back
    note: chest.clone(), // note_hanged, pinned to his coat
    notePrompt: new THREE.Vector3(tip.x, c.ground(tip.x, tip.z) + 1.3, tip.z), // reachable under his feet
    raven: new THREE.Vector3(tip.x - tdx * 0.45, tip.y + 0.12, tip.z - tdz * 0.45), // perch on the limb
    candles: new THREE.Vector3(cand.x, c.ground(cand.x, cand.z) + 0.1, cand.z),
    directions: { village: toVillage, pass: toPass, forest: toForest },
  });
  void rnd; void groundRibbon; void tex;
}
