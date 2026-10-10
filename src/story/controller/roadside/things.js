// Roadside encounters: the things they put in the world, built from the props Kit (merged per material).
//
//   tinkerSledge({ seed })    -> { root, tilt, setLift(p), setFixed(bool), corner, knee }   a loaded sledge with a split left runner
//   deerKill({ seed })        -> Group   a roe deer pulled down in the snow, flank torn open, blood on the snow around it
//   frozenScarf({ seed })     -> Group   a grey scarf with a red stripe, stiff with frost, half under a drift
//   hangingScarf({ seed })    -> Group   the same scarf hung from a post
//   woodSled({ seed })        -> { root, tilt, setPush(p) }   a boy's sled loaded with firewood, one runner stuck in a rut
//   satchel({ seed })         -> Group   a canvas satchel with the strap trailing
//   rope(a, b, sag)           -> Mesh updater helper for a tether: ropeLine() below
//
// Local frames: +Z is the front of the thing, y = 0 is the snow. Everything is positioned and turned by the caller.
import * as THREE from 'three';
import { Kit } from '../../../world/props/kit.js';
import { props } from '../../../world/props/index.js';

const TAU = Math.PI * 2;

// ---- the tinker's sledge ---------------------------------------------------------------------------------
// Built in the frame of the left runner (x = 0), so the whole load tips about the runner that is dug into the
// drift. Rest: tipped 0.17 rad with the right runner in the air and the left one sunk. Lifted: level and the left
// runner clear of the snow, which is how she holds it while he lashes the knee.
export function tinkerSledge({ seed = 5 } = {}) {
  const L = 2.3, W = 0.8;
  const kit = new Kit('tinkerSledge', { seed });
  const k = kit;
  const wood = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];
  const pick = (i) => wood[i % wood.length];

  // right runner, full length, upturned nose
  const runner = (x, z0 = -L / 2, tint = 0xe0d2c0) => {
    k.tube('wood', [[x, 0.045, z0], [x, 0.045, L / 2 - 0.55], [x, 0.09, L / 2 - 0.2], [x, 0.3, L / 2 + 0.12]], 0.036, { radial: 5, tint });
    k.box('iron', 0.026, 0.014, L * 0.7, { pos: [x, 0.004, -0.15], tint: 0x5a5650, grime: 0 });
  };
  runner(W, -L / 2, 0xe0d2c0);
  // left runner, rear half only (the front is its own group: broken or mended)
  k.tube('wood', [[0, 0.045, -L / 2], [0, 0.045, 0.2], [0, 0.045, 0.36]], 0.036, { radial: 5, tint: 0xe0d2c0 });
  k.box('iron', 0.026, 0.014, 1.2, { pos: [0, 0.004, -0.5], tint: 0x5a5650, grime: 0 });

  // knees (stanchions) and cross bars
  for (const z of [-0.85, -0.2, 0.45]) {
    for (const x of [0, W]) k.box('wood', 0.06, 0.13, 0.07, { pos: [x, 0.11, z], tint: 0xc4ae98 });
    k.box('wood', W + 0.14, 0.055, 0.1, { pos: [W / 2, 0.19, z], tint: 0xe0d2c0, jitter: 0.004 });
  }
  // deck planks
  for (let i = 0; i < 11; i++) {
    k.box('planks', W + 0.12, 0.028, 0.17, { pos: [W / 2, 0.235, -1.0 + i * 0.19], tint: pick(i), jitter: 0.003, rot: [0, (i % 3 - 1) * 0.015, 0] });
  }
  // corner stakes and one side rail
  for (const [x, z] of [[-0.05, -1.0], [W + 0.05, -1.0], [-0.05, 0.95], [W + 0.05, 0.95]]) {
    k.box('wood', 0.045, 0.7, 0.045, { pos: [x, 0.58, z], tint: 0xc4ae98, rot: [0, 0, x < 0 ? -0.04 : 0.04] });
  }
  k.tube('rope', [[-0.06, 0.82, -1.0], [-0.07, 0.8, 0], [-0.06, 0.82, 0.95]], 0.012, { radial: 4, tint: 0xa8946a });
  k.tube('rope', [[W + 0.06, 0.82, -1.0], [W + 0.07, 0.8, 0], [W + 0.06, 0.82, 0.95]], 0.012, { radial: 4, tint: 0xa8946a });

  // the load: a canvas roll along the back, a chest, kettles and pots, a bundle of spoons
  k.cyl('burlap', 0.2, 0.2, 1.15, { pos: [W * 0.5, 0.5, -0.45], rot: [Math.PI / 2, 0, 0.03], radial: 10, tint: 0xb4a484 });
  for (const z of [-0.85, -0.05]) k.torus('rope', 0.205, 0.014, { pos: [W * 0.5, 0.5, z], rot: [0, Math.PI / 2, 0], tint: 0x9c8860, seg: 12, rseg: 4 });
  k.box('wood', 0.52, 0.3, 0.36, { pos: [W * 0.5 - 0.02, 0.4, 0.46], rot: [0, 0.1, 0], tint: 0xa08a74, jitter: 0.004 });
  for (const dz of [-0.1, 0.1]) k.box('iron', 0.54, 0.31, 0.03, { pos: [W * 0.5 - 0.02, 0.4, 0.46 + dz], rot: [0, 0.1, 0], tint: 0x4a4640, grime: 0 });
  k.cyl('iron', 0.2, 0.17, 0.3, { pos: [W * 0.5 + 0.02, 0.4, 0.86], radial: 10, tint: 0x8a867e });
  k.torus('iron', 0.2, 0.016, { pos: [W * 0.5 + 0.02, 0.55, 0.86], rot: [Math.PI / 2, 0, 0], tint: 0x5a5650, seg: 12, rseg: 3 });
  k.tube('iron', [[W * 0.5 - 0.2, 0.55, 0.86], [W * 0.5 + 0.02, 0.8, 0.86], [W * 0.5 + 0.24, 0.55, 0.86]], 0.012, { radial: 4, tint: 0x4a4640 });
  k.cyl('iron', 0.13, 0.11, 0.2, { pos: [W + 0.0, 0.36, 0.2], radial: 8, tint: 0x8e8a82 });
  k.cyl('iron', 0.1, 0.1, 0.17, { pos: [W - 0.08, 0.62, 0.2], radial: 8, tint: 0x7e7a72 });
  k.cyl('iron', 0.14, 0.12, 0.22, { pos: [0.1, 0.36, 0.16], radial: 8, tint: 0x88847c });
  // spoons in a bundle, handles up
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU, r = 0.045 * Math.sqrt(i / 18) * 1.6;
    k.box('wood', 0.012, 0.42, 0.02, { pos: [0.28 + Math.cos(a) * r, 0.5, 0.34 + Math.sin(a) * r], rot: [Math.sin(a) * 0.05, a, Math.cos(a) * 0.05], tint: pick(i + 1), grime: 0.1 });
  }
  k.torus('rope', 0.05, 0.01, { pos: [0.28, 0.46, 0.34], rot: [Math.PI / 2, 0, 0], tint: 0x9c8860, seg: 8, rseg: 3 });
  // a pole at the back with pans hung from it
  k.cyl('wood', 0.022, 0.026, 1.25, { pos: [W - 0.05, 0.87, -0.98], radial: 5, tint: 0xc4ae98 });
  k.box('wood', 0.5, 0.025, 0.025, { pos: [W - 0.28, 1.4, -0.98], tint: 0xc4ae98 });
  for (const [dx, dy, r] of [[0.05, 1.24, 0.12], [-0.15, 1.3, 0.1], [-0.4, 1.22, 0.14]]) {
    k.tube('iron', [[W - 0.05 + dx, 1.4, -0.98], [W - 0.05 + dx, dy + 0.1, -0.98]], 0.004, { radial: 3, tint: 0x4a4640 });
    k.cyl('iron', r, r, 0.018, { pos: [W - 0.05 + dx, dy, -0.98], rot: [Math.PI / 2, 0, 0.1], radial: 10, tint: 0x8a867e });
  }
  // snow on the load
  k.mound(0.5, 0.12, 1.1, { pos: [W * 0.5, 0.7, -0.45], jseed: 1 });
  k.mound(0.5, 0.08, 0.4, { pos: [W * 0.5, 0.55, 0.46], jseed: 2 });
  k.mound(0.4, 0.06, 0.4, { pos: [W * 0.5, 0.52, 0.86], jseed: 3 });
  k.mound(1.0, 0.1, 2.0, { pos: [W + 0.55, 0.0, 0.1], jseed: 4 });

  // the harness: a rope from the front bar out onto the snow
  k.tube('rope', [[W * 0.5, 0.2, L / 2 - 0.35], [W * 0.5 + 0.1, 0.1, L / 2 + 0.2], [W * 0.5 + 0.5, 0.03, L / 2 + 0.9], [W * 0.5 + 1.3, 0.02, L / 2 + 1.3]], 0.015, { radial: 4, tint: 0xa8946a });
  const body = kit.build();

  // the broken front of the left runner: the nose has split at the knee and hangs down into the drift
  const bk = new Kit('tinkerSledgeBroken', { seed: seed + 1 });
  bk.tube('wood', [[0, 0.045, 0.36], [-0.05, 0.02, 0.72], [-0.22, -0.02, 1.0], [-0.32, 0.06, 1.18]], 0.036, { radial: 5, tint: 0xe0d2c0 });
  for (let i = 0; i < 5; i++) {
    bk.box('logEnd', 0.012, 0.02, 0.1 + (i % 3) * 0.04, { pos: [-0.02 + (i - 2) * 0.012, 0.06 + (i % 2) * 0.012, 0.4 + (i % 3) * 0.02], rot: [0.3 * (i - 2) * 0.2, 0.2 * (i - 2), 0.2], tint: 0xe8dcc4, grime: 0 });
  }
  bk.mound(0.5, 0.1, 0.9, { pos: [-0.12, 0.0, 0.85], jseed: 2 });
  // his mallet and a coil of rope on the snow where he was working
  bk.cyl('wood', 0.018, 0.022, 0.42, { pos: [-0.62, 0.035, 0.5], rot: [0, 0.3, Math.PI / 2], radial: 5, tint: 0xc4ae98 });
  bk.box('wood', 0.11, 0.1, 0.1, { pos: [-0.4, 0.07, 0.53], rot: [0, 0.3, 0], tint: 0xe0d2c0 });
  bk.torus('rope', 0.13, 0.02, { pos: [-0.95, 0.03, 0.15], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 12, rseg: 4 });
  bk.torus('rope', 0.09, 0.018, { pos: [-0.95, 0.055, 0.15], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4 });
  const broken = bk.build();

  // mended: the nose in line again, a splint each side and the lashing round the knee
  const fx = new Kit('tinkerSledgeFixed', { seed: seed + 2 });
  fx.tube('wood', [[0, 0.045, 0.36], [0, 0.045, 0.85], [0, 0.09, 1.1], [0, 0.3, 1.18 + 0.12]], 0.036, { radial: 5, tint: 0xe0d2c0 });
  fx.box('iron', 0.026, 0.014, 0.9, { pos: [0, 0.004, 0.8], tint: 0x5a5650, grime: 0 });
  for (const sx of [-0.045, 0.045]) fx.box('wood', 0.03, 0.05, 0.62, { pos: [sx, 0.075, 0.46], tint: 0xc4b096, jitter: 0.003 });
  for (let i = 0; i < 6; i++) fx.torus('rope', 0.05, 0.011, { pos: [0, 0.075, 0.24 + i * 0.1], rot: [0, 0, 0], tint: 0xa8946a, seg: 8, rseg: 3, grime: 0 });
  const fixed = fx.build();
  fixed.visible = false;

  // frame: root (ground, yaw) > tilt (pivot on the left runner) > body, broken, fixed. The sledge's centre is x = W / 2.
  const root = new THREE.Group();
  root.name = 'tinker_sledge';
  const tilt = new THREE.Group();
  tilt.position.set(0, 0, 0);
  tilt.add(body, broken, fixed);
  root.add(tilt);
  // the root's origin is the middle of the sledge, so shift the pivot left
  tilt.position.x = -W / 2;

  const REST = 0.17, SUNK = -0.05, RAISED = 0.13;
  const s = { root, tilt, W, L, p: 0, mended: false, rest: REST };
  s.setLift = (p) => {
    s.p = p;
    tilt.rotation.z = REST * (1 - p) * (s.mended ? 0 : 1) - 0.02 * p;
    tilt.position.y = SUNK * (1 - p) * (s.mended ? 0 : 1) + RAISED * p * (s.mended ? 0 : 1);
  };
  s.setFixed = (b) => {
    s.mended = !!b;
    broken.visible = !b;
    fixed.visible = !!b;
    s.setLift(s.p);
  };
  s.setLift(0);
  // where things are, in root space (x right, z forward): the knee she lashes and the corner she holds
  s.knee = new THREE.Vector3(-0.3, 0.1, 0.55);
  s.corner = new THREE.Vector3(-W / 2 - 0.55, 0.1, -0.7);
  return s;
}

// What the tinker leaves in the snow: the split nose of the runner, white where it broke.
export function runnerScrap({ seed = 5 } = {}) {
  const k = new Kit('runnerScrap', { seed });
  k.tube('wood', [[0, 0.05, 0], [0.1, 0.04, 0.4], [0.28, 0.07, 0.8], [0.34, 0.2, 1.0]], 0.036, { radial: 5, tint: 0xe0d2c0 });
  for (let i = 0; i < 5; i++) {
    k.box('logEnd', 0.012, 0.02, 0.1 + (i % 3) * 0.04, { pos: [-0.02 + (i - 2) * 0.012, 0.07, 0.02 + (i % 3) * 0.02], rot: [0.1, 0.2 * (i - 2), 0.2], tint: 0xe8dcc4, grime: 0 });
  }
  k.mound(0.5, 0.08, 0.9, { pos: [0.16, 0.0, 0.5], jseed: 2 });
  return k.build();
}

// ---- a deer pulled down -----------------------------------------------------------------------------------
export function deerKill({ seed = 4 } = {}) {
  const k = new Kit('deerKill', { seed });
  const hide = 0x7a6a58, belly = 0xb4a68e, dark = 0x4a1c18;
  k.push({ rot: [0.02, 0, 0.1] });
  // the body on its side, one flank to the sky
  k.blob('matte', 1, { pos: [0, 0.3, 0], scale: [0.4, 0.26, 0.85], detail: 2, tint: hide, jitter: 0.03, grime: 0.15 });
  k.blob('matte', 1, { pos: [0.1, 0.22, -0.9], scale: [0.3, 0.22, 0.34], detail: 1, tint: hide, jitter: 0.02 });
  k.blob('matte', 1, { pos: [-0.12, 0.17, 0.05], scale: [0.26, 0.12, 0.7], detail: 1, tint: belly, jitter: 0.02 });
  // neck and head thrown back along the snow
  k.tube('matte', [[0.05, 0.3, 0.75], [0.2, 0.2, 1.1], [0.42, 0.1, 1.32]], 0.1, { radial: 6, tint: hide, grime: 0.15 });
  k.blob('matte', 1, { pos: [0.52, 0.08, 1.46], scale: [0.09, 0.08, 0.2], detail: 1, tint: hide });
  k.tube('matte', [[0.5, 0.12, 1.5], [0.5, 0.3, 1.58], [0.46, 0.5, 1.6]], 0.012, { radial: 4, tint: 0x4a3c32 });
  k.tube('matte', [[0.55, 0.12, 1.5], [0.6, 0.3, 1.58], [0.62, 0.5, 1.6]], 0.012, { radial: 4, tint: 0x4a3c32 });
  // the torn flank: dark cavity, ribs standing out of it, the guts dragged onto the snow
  k.blob('matte', 1, { pos: [0.22, 0.4, -0.05], scale: [0.2, 0.1, 0.42], detail: 1, tint: dark, grime: 0, nosnow: true });
  for (let i = 0; i < 7; i++) {
    k.tube('face', [[0.1, 0.46, -0.32 + i * 0.1], [0.3, 0.45, -0.32 + i * 0.1], [0.42, 0.3, -0.3 + i * 0.1]], 0.012, { radial: 4, tint: 0xd8d0be, grime: 0 });
  }
  k.blob('matte', 1, { pos: [0.55, 0.06, -0.2], scale: [0.2, 0.05, 0.3], detail: 1, tint: 0x6a2a24, grime: 0, nosnow: true });
  k.blob('matte', 1, { pos: [0.7, 0.05, 0.12], scale: [0.12, 0.04, 0.18], detail: 1, tint: 0x5a2420, grime: 0, nosnow: true });
  // legs: two folded, two stretched where the wolves hauled
  for (const [lx, lz, ex, ez] of [[0.3, 0.55, 0.9, 0.7], [0.25, 0.25, 0.8, 0.0], [0.3, -0.55, 0.9, -0.5], [0.15, -0.8, 0.8, -1.0]]) {
    k.tube('matte', [[lx, 0.2, lz], [lx + (ex - lx) * 0.5, 0.16, lz + (ez - lz) * 0.5], [ex, 0.06, ez]], 0.03, { radial: 5, tint: 0x4a3c32 });
  }
  k.pop();
  k.mound(1.0, 0.12, 1.6, { pos: [-0.4, 0.0, -0.1], jseed: 5 });
  return k.build();
}

// ---- the boy's scarf --------------------------------------------------------------------------------------
// A long grey scarf with a red stripe, lying in the shape it froze in. Mostly drifted over: a hand of it shows.
export function frozenScarf({ seed = 3 } = {}) {
  const k = new Kit('frozenScarf', { seed });
  // the part that shows: two folds of grey with the red stripe on the edge
  k.push({ rot: [-Math.PI / 2 + 0.12, 0.2, 0.0] });
  k.plane('cloth', 0.17, 0.62, { pos: [0, 0, 0.02], sx: 1, sy: 9, bend: (x, y) => [0, 0, Math.sin(y * 9) * 0.03 + 0.04 * Math.cos(y * 4)], tint: 0x8a8a8a, grime: 0.2, var: 0.1 });
  k.plane('cloth', 0.035, 0.62, { pos: [0.045, 0, 0.045], sx: 1, sy: 9, bend: (x, y) => [0, 0, Math.sin(y * 9) * 0.03 + 0.04 * Math.cos(y * 4)], tint: 0x8c2e24, grime: 0.1, var: 0.05 });
  k.plane('cloth', 0.035, 0.62, { pos: [-0.045, 0, 0.045], sx: 1, sy: 9, bend: (x, y) => [0, 0, Math.sin(y * 9) * 0.03 + 0.04 * Math.cos(y * 4)], tint: 0x8c2e24, grime: 0.1, var: 0.05 });
  k.pop();
  // fringe at one end
  for (let i = 0; i < 7; i++) {
    k.blade('cloth', 0.012, 0.09, { pos: [-0.07 + i * 0.023, 0.03, 0.34], rot: [-Math.PI / 2 + 0.3, 0, 0.1 * (i - 3)], tint: 0x8a8a8a, grime: 0.1 });
  }
  // the drift that covers the rest, and frost on what shows
  k.mound(0.9, 0.12, 0.8, { pos: [0.1, 0.0, -0.45], jseed: 1 });
  k.mound(0.5, 0.05, 0.4, { pos: [0.0, 0.03, 0.05], jseed: 2 });
  for (let i = 0; i < 5; i++) k.blob('ice', 0.02, { pos: [-0.06 + i * 0.03, 0.05, 0.1 + (i % 2) * 0.15], scale: [1, 0.5, 1.2], detail: 0, tint: 0xe4f0f8, flat: true });
  return k.build();
}

// The scarf as it hangs on the shrine post afterwards: grey with a red stripe, a hand's width, a body long.
export function hangingScarf({ seed = 3 } = {}) {
  const k = new Kit('hangingScarf', { seed });
  k.push({ rot: [0, 0, 0.04] });
  k.hang('cloth', 0.15, 0.95, { sy: 8, wave: 0.05, tint: 0x8a8a8a, sway: 0.7, grime: 0.05 });
  k.push({ pos: [0.045, 0, 0.012] });
  k.hang('cloth', 0.03, 0.95, { sy: 8, wave: 0.05, tint: 0x8c2e24, sway: 0.7, grime: 0 });
  k.pop();
  k.push({ pos: [-0.045, 0, 0.012] });
  k.hang('cloth', 0.03, 0.95, { sy: 8, wave: 0.05, tint: 0x8c2e24, sway: 0.7, grime: 0 });
  k.pop();
  k.pop();
  return k.build();
}

// ---- the boy's sled ---------------------------------------------------------------------------------------
// A wood sled with a bundle of firewood lashed on and a pull rope, one runner stuck: nose down and over to one side.
// setPush(p): 0 stuck, 1 free and level.
export function woodSled({ seed = 6 } = {}) {
  const sled = props.sled({ variant: 'wood', seed, fx: false });
  const root = new THREE.Group();
  root.name = 'boy_sled';
  const tilt = new THREE.Group();
  tilt.add(sled);
  root.add(tilt);
  // the rope, from the front out toward where the boy stands (local +Z, then curling off)
  const k = new Kit('boySledRope', { seed });
  k.tube('rope', [[0, 0.15, 0.95], [0.1, 0.1, 1.4], [0.3, 0.05, 1.9], [0.45, 0.04, 2.35]], 0.014, { radial: 4, tint: 0xb89c6c });
  const rope = k.build();
  root.add(rope);
  const REST = { x: 0.2, z: 0.12, y: -0.1 };
  const s = { root, tilt, sled, rope, p: 0 };
  s.setPush = (p) => {
    s.p = p;
    tilt.rotation.x = REST.x * (1 - p);
    tilt.rotation.z = REST.z * (1 - p);
    tilt.position.y = REST.y * (1 - p);
  };
  s.setPush(0);
  return s;
}

// ---- the poacher's satchel --------------------------------------------------------------------------------
export function satchel({ seed = 2 } = {}) {
  const k = new Kit('satchel', { seed });
  k.push({ rot: [0.0, 0.5, 0.06] });
  k.box('burlap', 0.34, 0.2, 0.12, { pos: [0, 0.1, 0], tint: 0x9a8a6c, jitter: 0.012, seg: [3, 2, 2], grime: 0.3 });
  k.box('burlap', 0.34, 0.07, 0.13, { pos: [0, 0.2, 0.0], rot: [0.12, 0, 0], tint: 0x8a7a5e, jitter: 0.006, grime: 0.2 });
  k.box('wood', 0.03, 0.03, 0.02, { pos: [0, 0.17, 0.065], tint: 0x5a4a38 });
  k.tube('rope', [[0.15, 0.2, 0], [0.4, 0.05, 0.1], [0.75, 0.02, 0.0], [1.1, 0.02, 0.25]], 0.012, { radial: 4, tint: 0x5a4a3a });
  k.pop();
  k.mound(0.38, 0.06, 0.2, { pos: [0, 0.18, -0.02], jseed: 3 });
  return k.build();
}

// ---- tether -----------------------------------------------------------------------------------------------
// A rope between two moving points drawn as short stiff segments with a sag: update() each frame while it is in use.
export function ropeLine(segments = 5, radius = 0.011) {
  const group = new THREE.Group();
  group.name = 'tether';
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 4, 1, true);
  geo.translate(0, 0.5, 0);
  geo.rotateX(Math.PI / 2); // along +Z
  const mat = new THREE.MeshStandardMaterial({ color: 0xa8946a, roughness: 1 });
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.frustumCulled = false;
    group.add(m);
    parts.push(m);
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  group.update = (from, to, sag = 0.18) => {
    _a.copy(from);
    for (let i = 0; i < segments; i++) {
      const t = (i + 1) / segments;
      _b.lerpVectors(from, to, t);
      _b.y -= Math.sin(t * Math.PI) * sag; // the sag is in the points; the last point is the end of the rope
      const m = parts[i];
      m.position.copy(_a);
      m.lookAt(_b);
      m.scale.set(1, 1, Math.max(0.001, _a.distanceTo(_b)));
      _a.copy(_b);
    }
  };
  group.dispose = () => { geo.dispose(); mat.dispose(); };
  return group;
}
