// Work and transport props: cart, wheel, sled, skis, shovel, anvil, quench barrel, grindstone,
// hay bale, haystack, woodpile, ladder, straw pile, skin frame.
import * as THREE from 'three';
import { Kit, TAU } from './kit.js';
import { barrel } from './p_basic.js';

const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];

// Wheel lying flat (axle = Y). Rotate the parent to stand it up.
function wheelFlat(k, R, thick, spokes = 8, tint = 0xffffff) {
  const hub = R * 0.2;
  k.cyl('wood', hub, hub * 1.1, thick * 1.25, { radial: 8, tint, jitter: 0.004 });
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    const L = R - hub - 0.04;
    k.box('wood', L, thick * 0.8, thick * 0.55, { pos: [Math.cos(a) * (hub + L / 2 - 0.01), 0, Math.sin(a) * (hub + L / 2 - 0.01)], yaw: -a, tint, jitter: 0.003, grain: 'x' });
  }
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const a = ((i + 0.5) / seg) * TAU;
    const arc = (TAU * (R - 0.03)) / seg;
    k.box('wood', 0.06, thick, arc * 1.04, { pos: [Math.cos(a) * (R - 0.04), 0, Math.sin(a) * (R - 0.04)], yaw: -a, tint, jitter: 0.003, grain: 'z' });
  }
  k.cyl('iron', R + 0.006, R + 0.006, thick * 1.05, { radial: 20, open: true, tint: 0x4c4640, grime: 0.1 });
}

export function cartWheel(o = {}) {
  const k = new Kit('cartWheel', o);
  const R = o.radius || 0.45;
  // Leaning against something, or half sunk in the snow.
  k.push({ yaw: k.r(0, TAU), pos: [0, R * 0.92, 0], rot: [Math.PI / 2 - 0.12, 0, 0] });
  wheelFlat(k, R, 0.06, 8, k.pick(WOOD));
  k.pop();
  if (!o.indoor) k.mound(R * 1.1, 0.06, 0.2, { pos: [0, R * 1.85, -0.02], jseed: 1 });
  k.circleCollider(0.25, { h: 0.5 });
  k.ud.align = 0;
  return k.build();
}

export function cart(o = {}) {
  const k = new Kit('cart', o);
  const variant = o.variant || k.pick(['firewood', 'sacks', 'straw', 'empty', 'empty']);
  const R = 0.46;
  k.push({ yaw: o.yaw || 0, pos: [0, -0.02, 0] });
  const wood = k.pick(WOOD);
  // Axle and wheels (one wheel slightly canted).
  k.cyl('wood', 0.04, 0.04, 1.5, { pos: [0, R, -0.1], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0x8a7a6a });
  for (const sx of [-1, 1]) {
    k.with({ pos: [sx * 0.7, R, -0.1], rot: [0, 0, Math.PI / 2 + k.rs(0.04)] }, () => wheelFlat(k, R, 0.07, 8, k.pick(WOOD)));
  }
  // Frame
  for (const sx of [-1, 1]) k.box('wood', 0.07, 0.09, 1.9, { pos: [sx * 0.42, 0.62, 0.05], tint: wood, jitter: 0.004 });
  for (const z of [-0.7, 0.2, 0.75]) k.box('wood', 1.0, 0.06, 0.07, { pos: [0, 0.57, z], tint: wood, jitter: 0.003 });
  // Floor boards
  for (let i = 0; i < 7; i++) {
    k.box('planks', 0.92, 0.03, 0.2, { pos: [0, 0.675, -0.72 + i * 0.235], tint: k.pick(WOOD), jitter: 0.004, rot: [0, k.rs(0.02), 0], grain: 'x' });
  }
  // Side boards on stakes
  for (const sx of [-1, 1]) {
    for (const z of [-0.78, 0.0, 0.78]) k.box('wood', 0.045, 0.36, 0.045, { pos: [sx * 0.49, 0.85, z], tint: wood, jitter: 0.003 });
    for (const y of [0.76, 0.93]) {
      const missing = variant === 'empty' && y > 0.9 && k.chance(0.35);
      if (!missing) k.box('planks', 0.028, 0.14, 1.65, { pos: [sx * 0.505, y, 0], tint: k.pick(WOOD), jitter: 0.004, rot: [0, 0, k.rs(0.02)], grain: 'z' });
    }
  }
  k.box('planks', 0.92, 0.14, 0.028, { pos: [0, 0.84, -0.84], tint: wood, jitter: 0.004 });
  // Shafts forward, resting on the ground, joined by a crossbar.
  for (const sx of [-1, 1]) {
    k.cyl('wood', 0.028, 0.032, 2.0, { pos: [sx * 0.36, 0.42, 1.35], rot: [Math.PI / 2 + 0.28, 0, 0], radial: 6, tint: 0xa89684, jitter: 0.004, cap: 'logEnd' });
  }
  k.cyl('wood', 0.022, 0.022, 0.8, { pos: [0, 0.2, 2.18], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xa89684 });
  // Load
  if (variant === 'firewood') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      k.log(0.07 + k.rs(0.01), 0.82, { lie: 'x', pos: [0, 0.74 + r * 0.12, -0.58 + i * 0.4 + k.rs(0.04)], yaw: k.rs(0.1), radial: 6, tint: k.pick([0xffffff, 0xd8cdc0, 0xbfb3a6]) });
    }
  } else if (variant === 'sacks') {
    for (let i = 0; i < 4; i++) {
      k.blob('burlap', 0.2, { pos: [(i % 2 - 0.5) * 0.42, 0.88, -0.5 + Math.floor(i / 2) * 0.55], scale: [1.1, 0.8, 1.45], detail: 1, tint: k.pick([0xffffff, 0xd8c8a8, 0xbfae92]) });
    }
  } else if (variant === 'straw') {
    k.blob('straw', 0.5, { pos: [0, 0.9, 0], scale: [0.9, 0.55, 1.5], detail: 2, tint: 0xe6d8a8 });
  }
  if (!o.indoor) {
    k.mound(0.95, 0.12 + k.r(0, 0.1), 1.6, { pos: [0, variant === 'empty' ? 0.7 : 1.0, 0], jseed: 3 });
  }
  k.pop();
  k.boxCollider(0.8, 1.05, { z: 0.15, h: 1.0 });
  k.ud.align = 0;
  return k.build();
}

export function sled(o = {}) {
  const k = new Kit('sled', o);
  const kid = (o.variant || k.pick(['kid', 'wood'])) === 'kid';
  const L = kid ? 1.0 : 1.7, W = kid ? 0.42 : 0.6;
  k.push({ yaw: k.r(0, TAU) });
  const wood = k.pick(WOOD);
  // Runners with upturned noses.
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.02);
    k.tube('wood', [[x, 0.03, -L / 2], [x, 0.03, L / 2 - 0.2], [x, 0.07, L / 2 - 0.05], [x, 0.17, L / 2 + 0.06]], 0.024, { radial: 5, tint: wood });
    k.box('iron', 0.012, 0.012, L * 0.8, { pos: [x, 0.004, -0.05], tint: 0x5a5650, grime: 0 });
  }
  // Deck slats and cross braces
  const n = Math.round(L / 0.14);
  for (let i = 0; i < n; i++) {
    k.box('planks', W + 0.04, 0.025, 0.11, { pos: [0, 0.095, -L / 2 + 0.08 + i * ((L - 0.2) / (n - 1))], tint: k.pick(WOOD), jitter: 0.003, rot: [0, k.rs(0.03), 0] });
  }
  for (const sx of [-1, 1]) for (const z of [-L * 0.3, L * 0.25]) {
    k.box('wood', 0.04, 0.07, 0.05, { pos: [sx * (W / 2 - 0.02), 0.065, z], tint: wood });
  }
  if (kid) {
    // Pull rope with a knot, trailing over the snow.
    k.tube('rope', [[0, 0.14, L / 2 + 0.04], [0.1, 0.1, L / 2 + 0.3], [0.35, 0.03, L / 2 + 0.6], [0.55, 0.02, L / 2 + 0.85]], 0.012, { radial: 5, tint: 0xb89c6c });
    if (k.chance(0.5)) k.blob('fur', 0.18, { pos: [0, 0.2, -0.1], scale: [1.2, 0.45, 1.1], detail: 1, tint: 0xd8cdbd });
  } else {
    // Bundle of firewood lashed on.
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      k.log(0.06 + k.rs(0.01), 1.05, { lie: 'z', pos: [(i - 1.5) * 0.12, 0.2 + r * 0.1, -0.1], radial: 6, tint: k.pick([0xffffff, 0xd8cdc0]) });
    }
    k.torus('rope', 0.26, 0.012, { pos: [0, 0.28, 0.2], rot: [0, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4, scale: [1, 0.6, 1] });
    k.torus('rope', 0.26, 0.012, { pos: [0, 0.28, -0.4], rot: [0, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4, scale: [1, 0.6, 1] });
  }
  if (!o.indoor) k.mound(W * 1.1, 0.06, L * 0.7, { pos: [0, kid ? 0.11 : 0.34, -0.1], jseed: 2 });
  k.pop();
  k.boxCollider(W / 2 + 0.05, L / 2 + 0.1, { h: 0.35 });
  k.ud.align = 0.6;
  return k.build();
}

export function skis(o = {}) {
  const k = new Kit('skis', o);
  const L = 1.9;
  // Leaning pair: tips up, bases on the ground, tops toward the wall (wall behind, at -Z).
  k.push({ yaw: o.yaw || 0, rot: [-0.17, 0, 0] });
  for (const sx of [-1, 1]) {
    const x = sx * 0.11;
    const tint = k.pick([0xe0d2c0, 0xc4ae98, 0xd8c8b4]);
    k.box('wood', 0.085, L - 0.4, 0.018, { pos: [x, (L - 0.4) / 2, 0], tint, jitter: 0.002, grain: 'y', seg: [1, 5, 1] });
    // Upturned tip: two short pieces curling toward the viewer.
    k.box('wood', 0.085, 0.22, 0.018, { pos: [x, L - 0.4 + 0.1, 0.012], rot: [-0.18, 0, 0], tint, jitter: 0.001 });
    k.box('wood', 0.07, 0.16, 0.016, { pos: [x, L - 0.4 + 0.26, 0.07], rot: [-0.55, 0, 0], tint, taper: [0.7, 1], jitter: 0.001 });
    // Binding: wooden block, leather toe strap.
    k.box('wood', 0.1, 0.1, 0.05, { pos: [x, 0.9, 0.034], tint: 0x6a5a4c });
    k.box('fur', 0.095, 0.03, 0.05, { pos: [x, 0.97, 0.05], tint: 0x4a3626, grime: 0 });
  }
  // Pair of poles with birch-ring baskets, leaning beside the skis.
  for (const sx of [-1, 1]) {
    k.cyl('wood', 0.012, 0.012, 1.55, { pos: [sx * 0.36, 0.77, 0.0], rot: [0, 0, sx * 0.03], radial: 5, tint: 0xd8c8a8, cap: null });
    k.torus('wood', 0.045, 0.006, { pos: [sx * 0.36, 0.1, 0.0], rot: [Math.PI / 2, 0, 0], tint: 0x8a6a4a, seg: 8, rseg: 3 });
  }
  k.pop();
  k.circleCollider(0.3, { h: 0.1 });
  k.ud.align = 0;
  return k.build();
}

export function snowShovel(o = {}) {
  const k = new Kit('snowShovel', o);
  const stuck = (o.variant || 'lean') === 'stuck';
  k.push({ yaw: o.yaw || 0, rot: stuck ? [0.2, 0, 0.1] : [-0.22, 0, 0] });
  const y0 = stuck ? 0.0 : 0.0;
  // Long handle with a T grip, wide scoop blade of boards.
  k.cyl('wood', 0.016, 0.02, 1.2, { pos: [0, y0 + 0.78, 0], radial: 6, tint: 0xd8c8b0, jitter: 0.003, cap: null, grain: 'y' });
  k.box('wood', 0.2, 0.03, 0.03, { pos: [0, y0 + 1.39, 0], tint: 0xc4ae98, jitter: 0.002 });
  k.plane('planks', 0.38, 0.42, {
    pos: [0, y0 + 0.2, 0.03], sy: 4, sx: 2, rot: [-0.18, 0, 0], tint: 0xc8b8a4, jitter: 0.002,
    bend: (x, y) => [0, 0, 0.02 * (1 - (x / 0.19) ** 2) * 1 - Math.max(0, -y - 0.1) * 0.2],
  });
  k.box('iron', 0.38, 0.018, 0.02, { pos: [0, y0 + 0.0, 0.01], tint: 0x6a6660, grime: 0 });
  k.box('wood', 0.04, 0.3, 0.015, { pos: [0, y0 + 0.28, -0.02], tint: 0xa89684 });
  if (!o.indoor && !stuck) k.mound(0.3, 0.04, 0.3, { pos: [0, y0 + 0.34, 0.06], jseed: 3 });
  k.pop();
  if (stuck && !o.indoor) k.mound(0.5, 0.12, 0.5, { pos: [0, 0, 0], jseed: 5 });
  k.circleCollider(0.15, { h: 1.2 });
  k.ud.align = 0.3;
  return k.build();
}

export function anvil(o = {}) {
  const k = new Kit('anvil', o);
  k.push({ yaw: o.yaw || 0 });
  // Stump base
  k.cyl('bark', 0.27, 0.34, 0.5, { pos: [0, 0.25, 0], radial: 10, cap: 'logEnd', noBottom: true, jitter: 0.02, tint: 0x8a7e72 });
  const y = 0.5;
  const iron = 0x6a6e78;
  k.box('iron', 0.34, 0.1, 0.22, { pos: [0, y + 0.05, 0], tint: iron, taper: [0.8, 0.9], jitter: 0.003 });
  k.box('iron', 0.2, 0.12, 0.14, { pos: [0, y + 0.16, 0], tint: iron, jitter: 0.003 });
  k.box('iron', 0.56, 0.085, 0.18, { pos: [-0.02, y + 0.255, 0], tint: 0x8a8e98, jitter: 0.002, grime: 0 });
  // Horn
  k.cyl('iron', 0.015, 0.085, 0.3, { pos: [0.4, y + 0.255, 0], rot: [0, 0, -Math.PI / 2], radial: 8, tint: iron, cap: null });
  // Hammer lying on the face and tongs on the stump top.
  k.with({ pos: [-0.08, y + 0.31, 0.03], yaw: 0.5 }, () => {
    k.cyl('wood', 0.014, 0.017, 0.4, { rot: [0, 0, Math.PI / 2], radial: 5, tint: 0xb8a088, cap: null });
    k.box('iron', 0.07, 0.05, 0.05, { pos: [0.2, 0, 0], tint: 0x585c64, grime: 0 });
  });
  k.tube('iron', [[0.18, 0.045, 0.34], [0.3, 0.03, 0.4], [0.55, 0.02, 0.38]], 0.011, { radial: 4, tint: 0x4a4a4a });
  if (!o.indoor) k.mound(0.3, 0.05, 0.2, { pos: [0.4, y + 0.3, 0], jseed: 4 });
  k.pop();
  k.circleCollider(0.34, { h: 0.85 });
  k.ud.align = 0.4;
  return k.build();
}

export function quenchBarrel(o = {}) {
  const k = new Kit('quenchBarrel', o);
  const b = barrel({ seed: k.seed + 5, variant: 'open', fx: false, indoor: o.indoor, height: 0.8 });
  b.userData.colliders = [];
  const g = new THREE.Group();
  g.name = 'quenchBarrel';
  g.add(b);
  // Tongs hanging off the rim and soot-darkened rope.
  const t = new Kit('quenchTongs', { seed: k.seed, indoor: o.indoor });
  t.tube('iron', [[0.28, 0.82, 0.0], [0.36, 0.7, 0.0], [0.4, 0.5, 0.02]], 0.012, { radial: 4, tint: 0x4a4a4a });
  t.tube('iron', [[0.28, 0.82, 0.02], [0.33, 0.7, 0.04], [0.37, 0.5, 0.05]], 0.012, { radial: 4, tint: 0x4a4a4a });
  const tg = t.build();
  g.add(tg);
  g.userData = { ...b.userData, name: 'quenchBarrel', colliders: [{ type: 'circle', r: 0.33, x: 0, z: 0, h: 0.8 }], collider: { type: 'circle', r: 0.33, x: 0, z: 0, h: 0.8 }, anchors: { steam: new THREE.Vector3(0, 0.82, 0) }, align: 0 };
  if (o.steam !== false) {
    const m = new THREE.Object3D();
    m.position.set(0, 0.8, 0);
    m.userData.fxSpec = { type: 'steam', pos: [0, 0.8, 0], opts: { rate: 1.6, height: 2.2, size: 0.4, spread: 0.12, opacity: 0.22 } };
    g.add(m);
  }
  return g;
}

export function grindstone(o = {}) {
  const k = new Kit('grindstone', o);
  // Local +X is the axle; rotated so the wheel faces +Z (the usual viewing side) at yaw 0.
  k.push({ yaw: (o.yaw || 0) + Math.PI / 2 });
  const wood = 0xb8a690;
  // Two splayed A-frame legs on each side, axle between them.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box('wood', 0.07, 0.8, 0.07, { pos: [sx * 0.3, 0.38, sz * 0.14], rot: [sz * 0.22, 0, 0], tint: wood, jitter: 0.004 });
    k.box('wood', 0.06, 0.06, 0.4, { pos: [sx * 0.3, 0.12, 0], tint: wood });
  }
  k.box('wood', 0.7, 0.05, 0.1, { pos: [0, 0.78, 0], tint: wood });
  k.cyl('iron', 0.018, 0.018, 0.85, { pos: [0, 0.68, 0], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0x4a4a4a, cap: null });
  k.cyl('stone', 0.29, 0.29, 0.1, { pos: [0, 0.68, 0], rot: [0, 0, Math.PI / 2], radial: 16, tint: 0xb8b0a8, jitter: 0.004 });
  // Crank
  k.box('iron', 0.025, 0.28, 0.02, { pos: [0.46, 0.68 - 0.1, 0], rot: [0, 0, 0.2], tint: 0x4a4a4a });
  k.cyl('wood', 0.018, 0.018, 0.09, { pos: [0.5, 0.52, 0.0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x9a8a78, cap: null });
  // Water trough
  k.box('wood', 0.34, 0.12, 0.5, { pos: [0, 0.3, 0], tint: 0x8a7a6a });
  k.box('ice', 0.28, 0.01, 0.42, { pos: [0, 0.355, 0], tint: 0xcfe4f0, grime: 0 });
  if (!o.indoor) k.mound(0.5, 0.06, 0.1, { pos: [0, 0.8, 0], jseed: 2 });
  k.pop();
  k.boxCollider(0.5, 0.35, { h: 1.0 });
  k.ud.align = 0.3;
  return k.build();
}

export function hayBale(o = {}) {
  const k = new Kit('hayBale', o);
  const stacked = o.stacked != null ? o.stacked : k.chance(0.3);
  k.push({ yaw: k.r(0, TAU) });
  const one = (x, y, z, yaw) => {
    k.with({ pos: [x, y, z], yaw, rot: [0, 0, k.rs(0.03)] }, () => {
      k.box('straw', 0.95, 0.45, 0.48, { pos: [0, 0.225, 0], tint: k.pick([0xe8d8a8, 0xd8c898, 0xcdbd88]), jitter: 0.025, seg: [3, 2, 2], grain: 'x' });
      for (const x2 of [-0.25, 0.25]) k.box('rope', 0.02, 0.47, 0.5, { pos: [x2, 0.225, 0], tint: 0x8a7248, grime: 0, jitter: 0.004, uv: 'none' });
    });
  };
  one(0, 0, 0, k.rs(0.1));
  if (stacked) one(0.1, 0.45, 0.04, k.rs(0.3) + 0.4);
  if (!o.indoor) k.mound(0.9, 0.08, 0.46, { pos: [0, stacked ? 0.9 : 0.45, 0], jseed: 3 });
  k.pop();
  k.boxCollider(0.48, 0.26, { h: stacked ? 0.9 : 0.45 });
  k.ud.align = 0.2;
  return k.build();
}

export function haystack(o = {}) {
  const k = new Kit('haystack', o);
  const s = 0.9 + k.rs(0.2);
  k.push({ yaw: k.r(0, TAU), scale: s });
  const prof = [[1.3, -0.02], [1.38, 0.35], [1.22, 1.0], [0.9, 1.65], [0.5, 2.15], [0.18, 2.5], [0.02, 2.62]];
  k.lathe('straw', prof, { radial: 14, jitter: 0.07, jfreq: 2.2, tint: 0xe2d4a0, uRepeat: 3, grime: 0.55, tile: 0.8 });
  // Center pole poking out and a few trailing straws.
  k.cyl('wood', 0.03, 0.04, 0.9, { pos: [0, 2.8, 0], radial: 5, tint: 0x8a7a68, cap: null });
  for (let i = 0; i < 9; i++) {
    const a = k.r(0, TAU);
    k.blade('straw', 0.03, 0.4, { pos: [Math.cos(a) * 1.0, k.r(0.4, 1.3), Math.sin(a) * 1.0], rot: [k.rs(1), a, k.rs(0.8)], tint: 0xdac98a, grime: 0 });
  }
  // Loose skirt of straw around the base and a snow cap.
  k.blob('straw', 0.6, { pos: [0, 0.1, 0], scale: [2.5, 0.2, 2.5], detail: 1, tint: 0xcabd88 });
  if (!o.indoor) {
    k.mound(1.5, 0.45, 1.5, { pos: [k.rs(0.1), 2.0, k.rs(0.1)], jseed: 6 });
    k.mound(1.0, 0.3, 0.9, { pos: [0.5, 1.45, 0.3], jseed: 7 });
    k.mound(1.1, 0.25, 0.8, { pos: [-0.6, 1.1, -0.2], jseed: 8 });
  }
  k.pop();
  k.circleCollider(1.25 * s, { h: 2.4 });
  k.ud.align = 0;
  return k.build();
}

export function woodpile(o = {}) {
  const k = new Kit('woodpile', o);
  const layers = o.layers || 5;
  k.push({ yaw: k.rs(0.15) });
  const len = 2.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('bark', 0.05, 0.06, layers * 0.2 + 0.3, { pos: [sx * (len / 2 + 0.08), (layers * 0.2 + 0.3) / 2, sz * 0.7], rot: [0, 0, sx * k.rs(0.06)], radial: 6, cap: 'logEnd', tint: 0x9a8a78 });
  }
  let y = 0;
  for (let r = 0; r < layers; r++) {
    const rad = 0.1 + k.rs(0.015);
    y += rad;
    const n = Math.max(3, 7 - r);
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * rad * 2.1 + k.rs(0.02);
      k.log(rad * k.r(0.8, 1.1), len + k.rs(0.18), { lie: 'x', pos: [k.rs(0.06), y + k.rs(0.01), z], yaw: k.rs(0.04), radial: 7, tint: k.pick([0xffffff, 0xd8cdc0, 0xbfb3a6, 0xa89c90]) });
    }
    y += rad * 0.8;
  }
  if (!o.indoor) k.mound(len * 0.9, 0.18, 1.5, { pos: [0, y, 0], jseed: 4 });
  k.pop();
  k.boxCollider(len / 2 + 0.1, 0.85, { h: y + 0.15 });
  k.ud.align = 0;
  return k.build();
}

export function ladder(o = {}) {
  const k = new Kit('ladder', o);
  const L = (o.length || 2.6) + k.rs(0.3);
  k.push({ yaw: o.yaw || 0, rot: [-0.26, 0, 0] });
  for (const sx of [-1, 1]) {
    k.box('wood', 0.055, L, 0.045, { pos: [sx * 0.2, L / 2, 0], tint: k.pick(WOOD), jitter: 0.004, grain: 'y', seg: [1, 4, 1] });
  }
  const n = Math.floor(L / 0.32);
  for (let i = 0; i < n; i++) {
    const missing = k.chance(0.06) && i > 1;
    if (missing) continue;
    k.cyl('wood', 0.018, 0.018, 0.44, { pos: [0, 0.3 + i * 0.3, 0.005], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0xc8b8a0, cap: null });
  }
  if (!o.indoor) k.mound(0.46, 0.04, 0.08, { pos: [0, L * 0.88, 0.04], jseed: 2 });
  k.pop();
  k.circleCollider(0.3, { h: 0.5 });
  k.ud.align = 0;
  return k.build();
}

export function strawPile(o = {}) {
  const k = new Kit('strawPile', o);
  k.push({ yaw: k.r(0, TAU) });
  const n = 3 + Math.floor(k.r(0, 2));
  for (let i = 0; i < n; i++) {
    const a = k.r(0, TAU), d = k.r(0, 0.4);
    k.blob('straw', k.r(0.28, 0.42), { pos: [Math.cos(a) * d, 0.1, Math.sin(a) * d], scale: [1.3, 0.55, 1.1], detail: 1, tint: k.pick([0xe8d9a4, 0xd8c78c, 0xcdbd80]), jitter: 0.07 });
  }
  // Loose stalks fanning out of the pile.
  for (let i = 0; i < 22; i++) {
    const a = k.r(0, TAU), d = k.r(0.15, 0.85);
    k.blade('straw', 0.028, k.r(0.25, 0.6), { pos: [Math.cos(a) * d, k.r(0.02, 0.2), Math.sin(a) * d], rot: [Math.PI / 2 + k.rs(0.3), k.r(0, TAU), 0], tint: k.pick([0xeadcaa, 0xd8c88c, 0xc8b878]), grime: 0.2, var: 0.12 });
  }
  k.pop();
  k.ud.align = 0.8;
  return k.build();
}

// Hide stretched on a lashed frame (skins drying).
export function skinFrame(o = {}) {
  const k = new Kit('skinFrame', o);
  const w = 0.9 + k.rs(0.1), h = 1.2 + k.rs(0.1);
  k.push({ yaw: o.yaw || 0, rot: [-0.12, 0, 0] });
  for (const sx of [-1, 1]) k.cyl('wood', 0.025, 0.03, h + 0.4, { pos: [sx * (w / 2 + 0.03), (h + 0.4) / 2, 0], radial: 5, tint: 0xa89684, jitter: 0.004 });
  for (const y of [0.3, h + 0.2]) k.cyl('wood', 0.022, 0.022, w + 0.1, { pos: [0, y, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0xa89684 });
  // Hide with ragged edge
  const sh = new THREE.Shape();
  const pts = 16;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * TAU;
    const r = 0.5 + Math.sin(a * 3 + k.seed) * 0.05;
    const x = Math.cos(a) * (w / 2 - 0.02) * (r + 0.1), y = Math.sin(a) * (h / 2 - 0.04) * (r + 0.1);
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  k.extrude('fur', sh, 0.012, { pos: [0, 0.2 + h / 2 + 0.1, 0], tint: k.pick([0xd8c8b4, 0xb8a48c, 0x9a8670]), grime: 0.2, tile: 0.8 });
  for (let i = 0; i < 6; i++) {
    k.tube('rope', [[(i % 2 ? 1 : -1) * w / 2, 0.3 + (i >> 1) * (h / 2) * 0.9, 0.02], [(i % 2 ? 1 : -1) * (w / 2 - 0.1), 0.35 + (i >> 1) * (h / 2) * 0.9, 0.02]], 0.006, { radial: 4, tint: 0xa89070 });
  }
  if (!o.indoor) k.mound(w * 0.9, 0.05, 0.12, { pos: [0, h + 0.22, 0], jseed: 3 });
  k.pop();
  k.boxCollider(w / 2, 0.15, { h: h + 0.4 });
  k.ud.align = 0;
  return k.build();
}

export function wheelbarrow(o = {}) {
  const k = new Kit('wheelbarrow', o);
  const variant = o.variant || k.pick(['snow', 'firewood', 'empty', 'straw']);
  k.push({ yaw: o.yaw || 0, rot: [0.05, 0, k.rs(0.03)] });
  const wood = k.pick(WOOD);
  // Tray: floor, two flared sides, front and back boards.
  k.box('planks', 0.5, 0.025, 0.78, { pos: [0, 0.42, 0.05], tint: wood, jitter: 0.004, rot: [0.05, 0, 0] });
  for (const sx of [-1, 1]) k.box('planks', 0.025, 0.24, 0.8, { pos: [sx * 0.31, 0.54, 0.05], rot: [0, 0, sx * 0.4], tint: k.pick(WOOD), jitter: 0.004, grain: 'z' });
  k.box('planks', 0.6, 0.22, 0.025, { pos: [0, 0.54, 0.46], rot: [-0.35, 0, 0], tint: wood, jitter: 0.004 });
  k.box('planks', 0.6, 0.2, 0.025, { pos: [0, 0.53, -0.36], rot: [0.2, 0, 0], tint: wood, jitter: 0.004 });
  // Long handles forward to the axle, legs at the back, front wheel.
  for (const sx of [-1, 1]) {
    k.cyl('wood', 0.022, 0.028, 1.6, { pos: [sx * 0.24, 0.4, 0.0], rot: [Math.PI / 2 - 0.12, 0, 0], radial: 6, tint: 0xa89684, cap: 'logEnd', jitter: 0.004 });
    k.cyl('wood', 0.025, 0.03, 0.42, { pos: [sx * 0.24, 0.2, -0.38], rot: [0.12, 0, 0], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
  }
  k.with({ pos: [0, 0.22, 0.78], rot: [0, 0, Math.PI / 2] }, () => wheelFlat(k, 0.22, 0.05, 6, k.pick(WOOD)));
  k.cyl('iron', 0.012, 0.012, 0.5, { pos: [0, 0.22, 0.78], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x4a4a4e, cap: null });
  if (variant === 'firewood') {
    for (let i = 0; i < 6; i++) k.log(0.05, 0.5, { lie: 'x', pos: [k.rs(0.1), 0.52 + (i % 2) * 0.09, -0.15 + Math.floor(i / 2) * 0.22], radial: 6, tint: k.pick([0xffffff, 0xd8cdc0]) });
  } else if (variant === 'straw') {
    k.blob('straw', 0.3, { pos: [0, 0.6, 0.05], scale: [1, 0.55, 1.35], detail: 2, tint: 0xe6d8a4 });
  } else if (variant === 'snow') {
    k.blob('snowMound', 0.3, { pos: [0, 0.56, 0.05], scale: [1.1, 0.55, 1.5], detail: 2, tint: 0xf4f6fa, grime: 0.05, var: 0.03 });
  }
  if (!o.indoor && variant !== 'snow') k.mound(0.55, 0.06, 0.8, { pos: [0, variant === 'empty' ? 0.55 : 0.68, 0.05], jseed: 3 });
  k.pop();
  k.boxCollider(0.45, 0.95, { z: 0.15, h: 0.8 });
  k.ud.align = 0.2;
  return k.build();
}

// Tools leaning together against a wall (wall behind, at -Z): pitchfork, rake, twig broom.
export function tools(o = {}) {
  const k = new Kit('tools', o);
  k.push({ yaw: o.yaw || 0 });
  const lean = -0.2;
  // A handle of length len leaning by th about X; at(s) is the point s meters up the handle.
  const tool = (x, len, th, rz, tint, head) => {
    k.cyl('wood', 0.016, 0.02, len, { pos: [x, (len / 2) * Math.cos(th), 0], rot: [th, 0, rz], radial: 5, tint, jitter: 0.003, cap: null });
    const s = head.at;
    k.with({ pos: [x, s * Math.cos(th), (s - len / 2) * Math.sin(th)], rot: [th, 0, rz] }, head.fn);
  };
  tool(-0.3, 1.75, lean, 0.03, 0xc8b8a0, {
    at: 1.72,
    fn: () => {
      k.box('iron', 0.2, 0.03, 0.02, { pos: [0, 0.0, 0], tint: 0x5a5a60, grime: 0 });
      for (const sx of [-1, 0, 1]) k.box('iron', 0.016, 0.3, 0.014, { pos: [sx * 0.085, 0.15, 0], tint: 0x5a5a60, taper: [0.4, 1], grime: 0 });
    },
  });
  tool(0.0, 1.7, lean - 0.03, -0.02, 0xd0c0a8, {
    at: 1.68,
    fn: () => {
      k.box('wood', 0.46, 0.04, 0.04, { pos: [0, 0.0, 0], tint: 0xb8a690 });
      for (let i = 0; i < 8; i++) k.box('wood', 0.014, 0.12, 0.014, { pos: [-0.2 + i * 0.057, -0.06, 0], tint: 0xa89684, grime: 0.1 });
    },
  });
  tool(0.34, 1.45, lean + 0.04, 0.05, 0xc0b09a, {
    at: 0.3,
    fn: () => {
      k.cyl('straw', 0.025, 0.1, 0.5, { pos: [0, 0.0, 0], radial: 8, tint: 0x8a7050, jitter: 0.012, cap: null, var: 0.2, grime: 0 });
      for (const y of [0.18, 0.05]) k.torus('rope', 0.05 + (0.18 - y) * 0.2, 0.01, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 8, rseg: 3 });
    },
  });
  if (!o.indoor) k.mound(0.9, 0.06, 0.25, { pos: [0, 0, 0.02], jseed: 2 });
  k.pop();
  k.circleCollider(0.55, { h: 1.7 });
  k.ud.align = 0;
  return k.build();
}
