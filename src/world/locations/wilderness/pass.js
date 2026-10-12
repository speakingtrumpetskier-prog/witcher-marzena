// The Hollow Pass (LOC.passStart): the opening image of the game. An overturned cart across the road,
// the pack mule dead in its harness and half buried, a family of three frozen in the lee of the wreck:
// the mother lying curled around her daughter, the father kneeling twisted at the waist, looking back over
// his shoulder up the road toward the valley. Composed for the C1 cutscene camera (rider arriving from the
// southwest down the road, wind from the west so the family sits in the lee of the cart).
//
// G.world.locations.passStart:
//   center, roadDir (unit x,z toward the valley), yawToValley, cart, mule, father, mother, child (each { x, y, z, yaw }),
//   letter (note_cart_family clue position on the father's coat), examine (cart senses clue),
//   marks: { riderStart, horseStop, vesna, kasza, wolfSpawns[3], wolfLookout, cameraLow, cameraFace }  (cutscene helpers)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { Composer } from './compose.js';
import { deadMule } from './objects.js';
import { frozenChar, frostFace } from './figures.js';
import { tex, groundRibbon } from './decals.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.passStart;
  const P0 = { x: L.x, z: L.z };
  const F = { x: 0.72, z: -0.69 }; // along the road toward the valley
  const yawF = Math.atan2(F.x, F.z);
  W.clear(L.x, L.z, 16);

  const c = new Composer(G, W.ctx, 'pass', L.x, L.z, { seed: 14 });
  const cart = { x: P0.x + F.x * 0.3, z: P0.z + F.z * 0.3, yaw: 0.55 };
  // Frame of the cart: xl = local +x in the world (the lee side), a = local +z (the shafts, toward the mule).
  const xl = { x: Math.cos(cart.yaw), z: -Math.sin(cart.yaw) };
  const a = { x: Math.sin(cart.yaw), z: Math.cos(cart.yaw) };
  const at = (dx, dz) => ({ x: cart.x + xl.x * dx + a.x * dz, z: cart.z + xl.z * dx + a.z * dz });

  // ---- the wreck -------------------------------------------------------------------------------
  const gy = c.ground(cart.x, cart.z);
  c.prop('cart', cart.x, cart.z, { yaw: cart.yaw, rot: [0.1, 0, 2.8], y: gy + 1.1, opts: { variant: 'sacks' }, seed: 3, collide: false });
  c.box(cart.x - xl.x * 0.5, cart.z - xl.z * 0.5, 1.3, 1.6, cart.yaw, gy - 0.5, gy + 2, 'cart');
  // snapped shafts and the broken wheel off to one side
  c.prop('cartWheel', at(-2.4, -1.3).x, at(-2.4, -1.3).z, { seed: 2, dy: -0.05 });
  // mule dead in its harness, ahead of the shafts
  const mp = at(-0.3, 4.1);
  c.at(mp.x, mp.z, { yaw: cart.yaw + 0.25, dy: -0.12 }, (k) => deadMule(k));
  c.circle(mp.x, mp.z, 1.0, gy - 1, gy + 1.5, 'mule');

  // ---- spilled belongings ------------------------------------------------------------------------
  const spill = [
    ['sack', at(-1.7, 0.7), { seed: 1, yaw: 0.6 }],
    ['sack', at(-2.2, -0.2), { seed: 2, yaw: 2.1, dy: 0.0 }],
    ['chest', at(1.9, -2.4), { seed: 1, yaw: cart.yaw + 0.5, scale: 0.78, rot: [0.08, 0, 0.12], dy: -0.12, opts: { variant: 'plain' } }],
    ['barrel', at(-3.2, 1.8), { seed: 4, rot: [0, 0, 1.45], dy: 0.35, opts: { variant: 'plain' } }],
    ['pot', at(0.9, 2.8), { seed: 2, rot: [0, 0, 1.2], dy: 0.1 }],
    ['bucket', at(2.8, 2.1), { seed: 1, rot: [0, 0, 1.4], dy: 0.1 }],
    ['snowShovel', at(3.0, 0.1), { opts: { variant: 'stuck' }, yaw: 0.8 }],
    ['lantern', at(1.2, 1.6), { opts: { mount: 'ground' }, rot: [0, 0, 1.4], dy: 0.1 }],
  ];
  for (const [name, p, o] of spill) {
    try { c.prop(name, p.x, p.z, o); } catch (e) { console.warn('[pass] prop', name, e.message); }
  }
  // a rolled blanket, a bundle of clothes and a child's rag doll half under the drift
  c.at(at(1.9, 0.4).x, at(1.9, 0.4).z, { yaw: cart.yaw + 0.3 }, (k) => {
    k.blob('cloth', 0.28, { pos: [0, 0.18, 0], scale: [1.3, 0.55, 0.9], detail: 1, tint: 0x6a5a4a, jitter: 0.03 });
    k.blob('linen', 0.2, { pos: [0.7, 0.14, 0.5], scale: [1.2, 0.5, 0.9], detail: 1, tint: 0xc8c0ac, jitter: 0.03 });
    k.mound(0.7, 0.14, 0.5, { pos: [0.2, 0.2, 0.1], jseed: 3 });
  });
  // drifts: the windward wall of snow against the wreck, a long tail behind it, blown snow on the road
  const drifts = [[at(-1.6, -0.4), 5.2, 1.5, 6.0, 0.4], [at(-1.4, 3.4), 3.6, 1.0, 4.2, 1.2], [at(3.0, -1.4), 3.0, 0.6, 4.6, 0.9], [at(5.0, 1.8), 4.6, 0.45, 3.0, 2.0]];
  for (const [p, w, h, d, s] of drifts) c.at(p.x, p.z, { yaw: cart.yaw + s * 0.2, dy: -0.15 }, (k) => k.mound(w, h, d, { pos: [0, 0, 0], jseed: Math.floor(s * 3) }));

  // ---- the family ----------------------------------------------------------------------------------
  // Mother and daughter: lying in the lee of the cart bed, the mother curled around the child.
  const mP = at(2.1, -0.5), chP = at(1.35, -0.2), faP = at(2.7, 1.5);
  const yawLie = cart.yaw + Math.PI / 2;
  const [mother, child, father] = await Promise.all([
    frozenChar(G, 'villager_f_4', { x: mP.x, z: mP.z, y: gy - 0.04, yaw: yawLie + 0.2, base: 'lie_dead', tint: [0.74, 0.84, 1.0], steps: 2.4 }),
    frozenChar(G, 'child_c', { x: chP.x, z: chP.z, y: gy - 0.03, yaw: yawLie - 0.15, base: 'lie_dead', tint: [0.74, 0.84, 1.0], steps: 2.4 }),
    frozenChar(G, 'villager_m_3', { x: faP.x, z: faP.z, y: gy - 0.05, yaw: Math.atan2(-a.x, -a.z) + 0.2, base: 'sit_ground', upper: 'look_back', tint: [0.74, 0.84, 1.0], steps: 3.4 }),
  ]);
  for (const ch of [mother, child, father]) frostFace(ch);
  // snow on the shoulders and in the lap, frost in the folds: drifted mounds, one hand left clear for the camera
  c.at(mP.x, mP.z, { yaw: yawLie, dy: -0.05 }, (k) => {
    k.mound(1.1, 0.26, 0.8, { pos: [0.1, 0.1, -0.1], jseed: 7 });
    k.mound(0.7, 0.18, 0.5, { pos: [0.5, 0.2, 0.6], jseed: 8 });
  });
  c.at(chP.x, chP.z, { yaw: yawLie }, (k) => {
    k.blob('cloth', 0.34, { pos: [0, 0.14, 0.05], scale: [1.0, 0.35, 1.2], detail: 1, tint: 0x7a6a58, jitter: 0.03 });
    k.mound(0.7, 0.14, 0.9, { pos: [0, 0.15, 0.2], jseed: 5 });
  });
  c.at(faP.x, faP.z, { yaw: 0 }, (k) => {
    k.mound(0.5, 0.16, 0.4, { pos: [0.1, 0.84, -0.05], jseed: 1 }); // shoulders
    k.mound(0.22, 0.07, 0.2, { pos: [0.0, 1.12, 0.02], jseed: 3 }); // cap
  });
  c.circle(faP.x, faP.z, 0.5, gy - 1, gy + 1.7, 'frozen father');
  c.circle(mP.x, mP.z, 0.7, gy - 1, gy + 1, 'frozen mother');

  // ---- wind-polished road: ruts and the last tracks (the family's, heading for the pass) ----------
  const trackPts = [[P0.x + F.x * 40, P0.z + F.z * 40], [P0.x + F.x * 14, P0.z + F.z * 14], [cart.x + 0.8, cart.z + 0.6]];
  const ruts = groundRibbon(G, { pts: trackPts, width: 1.25, map: tex.drag(11), repeat: 8, lift: 0.04, opacity: 0.3, name: 'passRuts' });
  c.parts.push(ruts);

  c.build();

  // ---- anchors -----------------------------------------------------------------------------------
  const faceDir = { x: F.x, z: F.z };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const body = (p, yw, h = 0) => ({ x: p.x, y: gy + h, z: p.z, yaw: yw });
  const fy = father.root.position.y;
  W.loc('passStart', {
    id: 'passStart',
    center: v(L.x, gy, L.z),
    roadDir: faceDir,
    yawToValley: yawF,
    cart: body(cart, cart.yaw, 0.6),
    mule: body(mp, cart.yaw + 0.25, 0.5),
    father: { ...body(faP, father.root.rotation.y), character: father, headLook: faceDir },
    mother: { ...body(mP, mother.root.rotation.y), character: mother },
    child: { ...body(chP, child.root.rotation.y), character: child },
    letter: v(faP.x, fy + 0.95, faP.z), // note_cart_family: inside the father's coat
    examine: v(cart.x + xl.x * 0.8, gy + 0.7, cart.z + xl.z * 0.8),
    marks: {
      // C1: the rider comes down the road from the southwest; Kasza balks 12 m short of the wreck.
      riderStart: v(P0.x - F.x * 60, c.ground(P0.x - F.x * 60, P0.z - F.z * 60), P0.z - F.z * 60),
      horseStop: v(P0.x - F.x * 11, c.ground(P0.x - F.x * 11, P0.z - F.z * 11), P0.z - F.z * 11),
      vesna: v(faP.x - a.x * 1.1 + xl.x * 0.9, gy, faP.z - a.z * 1.1 + xl.z * 0.9),
      kasza: v(P0.x - F.x * 9, c.ground(P0.x - F.x * 9, P0.z - F.z * 9), P0.z - F.z * 9),
      cameraLow: v(mP.x + xl.x * 0.6 + a.x * 1.2, gy + 0.25, mP.z + xl.z * 0.6 + a.z * 1.2),
      cameraFace: v(faP.x + F.x * 1.6 + 0.5, gy + 1.1, faP.z + F.z * 1.6 + 0.3),
      wolfSpawns: [
        v(P0.x - F.x * 34 - 18, c.ground(P0.x - F.x * 34 - 18, P0.z - F.z * 34 + 6), P0.z - F.z * 34 + 6),
        v(P0.x - F.x * 40 + 4, c.ground(P0.x - F.x * 40 + 4, P0.z - F.z * 40 - 16), P0.z - F.z * 40 - 16),
        v(P0.x + F.x * 30 - 16, c.ground(P0.x + F.x * 30 - 16, P0.z + F.z * 30 - 10), P0.z + F.z * 30 - 10),
      ],
    },
  });
  W.stats.pass = { tris: 0 };
}
