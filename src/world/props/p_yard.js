// Yard and roadside props for the village dressing pass: hitching rail, frozen trough, plank walk, hay rack,
// wayside cross, freight sledge, sawbuck, snow fence. Dark timber, rope and straw: the things that read against
// full-sun snow. Local +z is the front, y = 0 is the ground, every prop is kept to a few hundred triangles.
import { Kit, TAU } from './kit.js';
import { FOLK_RED } from './p_household.js';
import { hayBale } from './p_work.js';

const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];

// Two peeled posts and a rail at horse height, rope lashed, with a tether hanging and a ring on one post.
// variant 'single' | 'double' (a second rail low down).
export function hitchingRail(o = {}) {
  const k = new Kit('hitchingRail', o);
  const L = (o.length || 2.6) + k.rs(0.15);
  const double = (o.variant || k.pick(['single', 'double'])) === 'double';
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) {
    k.log(0.075, 1.35, { pos: [sx * L / 2, 0.58, 0], rot: [k.rs(0.03), 0, k.rs(0.04)], radial: 7, tint: k.pick(WOOD) });
    k.torus('rope', 0.082, 0.011, { pos: [sx * L / 2, 1.02, 0], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 8, rseg: 3 });
  }
  k.log(0.05, L + 0.3, { lie: 'x', pos: [0, 1.02, 0], radial: 7, tint: k.pick(WOOD) });
  if (double) k.log(0.045, L + 0.2, { lie: 'x', pos: [0, 0.62, 0], radial: 7, tint: k.pick(WOOD) });
  k.torus('iron', 0.035, 0.006, { pos: [L / 2, 0.8, 0.085], tint: 0x4a4a4e, seg: 8, rseg: 3 });
  for (const t of [-0.28, 0.12]) {
    const x = t * L;
    k.tube('rope', [[x, 1.0, 0.05], [x + 0.03, 0.8, 0.09], [x + 0.08, 0.62, 0.07], [x + 0.22, 0.55, 0.1]], 0.011, { radial: 4, tint: 0xa8946a, grime: 0.1 });
  }
  if (!o.indoor) {
    k.mound(L * 0.85, 0.07, 0.13, { pos: [0, 1.07, 0], jseed: 3 });
    for (const sx of [-1, 1]) k.mound(0.22, 0.05, 0.22, { pos: [sx * L / 2, 1.3, 0], jseed: 5 + sx });
  }
  k.pop();
  k.boxCollider(L / 2 + 0.1, 0.14, { h: 1.2 });
  k.ud.align = 0;
  return k.build();
}

// A water trough on trestles, iced over with a broken corner where somebody chopped it open.
export function trough(o = {}) {
  const k = new Kit('trough', o);
  const L = (o.length || 1.7) + k.rs(0.15), W = 0.44;
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick(WOOD);
  k.box('planks', L, 0.04, W, { pos: [0, 0.3, 0], tint: wood, jitter: 0.004, grain: 'x' });
  for (const sz of [-1, 1]) k.box('planks', L, 0.28, 0.045, { pos: [0, 0.45, sz * (W / 2 - 0.022)], rot: [sz * 0.08, 0, 0], tint: k.pick(WOOD), jitter: 0.004, grain: 'x' });
  for (const sx of [-1, 1]) k.box('planks', 0.05, 0.28, W, { pos: [sx * (L / 2 - 0.025), 0.45, 0], tint: wood, jitter: 0.004, grain: 'z' });
  k.box('ice', L - 0.14, 0.012, W - 0.12, { pos: [0, 0.54, 0], tint: 0xcfe4f0, grime: 0, jitter: 0.006, seg: [4, 1, 2] });
  // the hole chopped at one end: dark water, slabs of ice floating in it
  k.box('matte', 0.4, 0.014, W - 0.16, { pos: [L / 2 - 0.4, 0.545, 0], tint: 0x101a24, grime: 0 });
  k.box('ice', 0.2, 0.03, 0.14, { pos: [L / 2 - 0.45, 0.55, 0.04], rot: [0, 0.5, 0.08], tint: 0xdcecf6, grime: 0 });
  for (const sx of [-1, 1]) {
    k.box('wood', 0.09, 0.3, W + 0.1, { pos: [sx * (L / 2 - 0.28), 0.14, 0], tint: 0x8a7a68, jitter: 0.004 });
    k.box('wood', 0.07, 0.07, W + 0.2, { pos: [sx * (L / 2 - 0.28), 0.04, 0], tint: 0x7a6a58 });
  }
  k.tube('iron', [[-L / 2 + 0.2, 0.62, W / 2 + 0.01], [-L / 2 + 0.2, 0.7, W / 2 + 0.05], [-L / 2 + 0.34, 0.66, W / 2 + 0.05]], 0.008, { radial: 4, tint: 0x4a4a4e });
  if (!o.indoor) k.mound(L * 0.8, 0.05, 0.12, { pos: [-0.1, 0.62, -W / 2 + 0.03], jseed: 2 });
  k.pop();
  k.boxCollider(L / 2 + 0.05, W / 2 + 0.1, { h: 0.6 });
  k.ud.align = 0.2;
  return k.build();
}

// Duckboards laid over churned ground: planks across two stringers. length along local z, width across x.
export function plankWalk(o = {}) {
  const k = new Kit('plankWalk', o);
  const L = o.length || 3.0, W = o.width || 0.95;
  const n = Math.max(3, Math.round(L / 0.27));
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) k.box('wood', 0.07, 0.07, L, { pos: [sx * (W / 2 - 0.12), 0.035, 0], tint: 0x7a6a58, jitter: 0.004, seg: [1, 1, 2] });
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && k.chance(0.06)) continue; // one gone
    const z = -L / 2 + (i + 0.5) * (L / n) + k.rs(0.01);
    const lift = k.chance(0.12) ? 0.03 : 0;
    k.box('planks', W + k.rs(0.04), 0.035, 0.215, { pos: [k.rs(0.02), 0.085 + lift, z], rot: [k.rs(0.02) + lift * 1.5, k.rs(0.04), k.rs(0.025)], tint: k.pick(WOOD), jitter: 0.003, grain: 'x', seg: [2, 1, 1] });
  }
  if (!o.indoor) {
    k.mound(0.5, 0.025, 0.14, { pos: [k.rs(0.2), 0.1, -L * 0.3], jseed: 1 });
    k.mound(0.4, 0.02, 0.12, { pos: [k.rs(0.2), 0.1, L * 0.25], jseed: 2 });
  }
  k.pop();
  k.ud.align = 0.9;
  return k.build();
}

// A feeding rack: slatted sides on splayed legs, hay heaped in the top and pulled out in wisps.
export function hayRack(o = {}) {
  const k = new Kit('hayRack', o);
  const L = (o.length || 2.7) + k.rs(0.2), D = 0.74, H = 1.0;
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick(WOOD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('wood', 0.034, 0.042, H + 0.2, { pos: [sx * (L / 2 - 0.02) + sx * 0.05, (H + 0.1) / 2 - 0.1, sz * D / 2 + sz * 0.04], rot: [sz * 0.08, 0, -sx * 0.06], radial: 6, tint: wood, jitter: 0.004 });
  }
  for (const sz of [-1, 1]) {
    k.box('wood', L + 0.1, 0.05, 0.05, { pos: [0, H, sz * (D / 2 + 0.03)], tint: wood, jitter: 0.004 });
    k.box('wood', L, 0.045, 0.045, { pos: [0, 0.3, sz * (D / 2 + 0.01)], tint: 0x8a7a68 });
  }
  for (const sx of [-1, 1]) k.box('wood', 0.05, 0.05, D + 0.1, { pos: [sx * (L / 2 + 0.02), H, 0], tint: wood });
  const n = Math.floor(L / 0.3);
  for (const sz of [-1, 1]) for (let i = 0; i < n; i++) {
    if (k.chance(0.07)) continue;
    k.box('planks', 0.03, H - 0.3, 0.024, { pos: [-L / 2 + 0.1 + i * ((L - 0.2) / (n - 1)), 0.3 + (H - 0.3) / 2, sz * (D / 2 + 0.012)], rot: [0, 0, k.rs(0.03)], tint: k.pick(WOOD), grain: 'y' });
  }
  k.box('planks', L - 0.1, 0.03, D - 0.05, { pos: [0, 0.32, 0], tint: 0x7a6a58 });
  // hay: a heap above the rim, a tuft dragged out through the slats on each side, wisps fallen below
  // two baled forkfuls lying in the top, a rough heap between and tufts dragged out through the slats
  for (const [t, a] of [[-0.24, 0.1], [0.26, -0.15]]) k.addGroup(hayBale({ seed: k.seed + (t > 0 ? 3 : 1), stacked: false, indoor: o.indoor, fx: false }), { pos: [t * L, H + 0.02, k.rs(0.04)], yaw: a + k.rs(0.1) });
  k.blob('straw', 0.5, { pos: [0, H + 0.14, 0], scale: [L * 0.2, 0.34, 0.6], detail: 1, tint: k.pick([0xcbbd8a, 0xbfae7c]), jitter: 0.1, jfreq: 3.5 });
  for (const sz of [-1, 1]) k.blob('straw', 0.2, { pos: [k.rs(0.6), 0.78, sz * (D / 2 + 0.05)], scale: [2.2, 0.8, 0.5], detail: 1, tint: 0xc4b682, jitter: 0.05 });
  for (let i = 0; i < 7; i++) k.blade('straw', 0.03, k.r(0.25, 0.5), { pos: [k.rs(L * 0.6), 0.04, (i % 2 ? 1 : -1) * k.r(D / 2 + 0.1, D / 2 + 0.5)], rot: [Math.PI / 2 + k.rs(0.3), k.r(0, TAU), 0], tint: 0xdac98a, grime: 0.1 });
  k.blob('straw', 0.3, { pos: [k.rs(0.5), 0.05, D / 2 + 0.35], scale: [1.6, 0.2, 0.9], detail: 1, tint: 0xcdbd88, jitter: 0.04 });
  if (!o.indoor) k.mound(L * 0.5, 0.1, 0.4, { pos: [0, H + 0.5, 0], jseed: 3 });
  k.pop();
  k.boxCollider(L / 2 + 0.05, D / 2 + 0.08, { h: H + 0.3 });
  k.ud.align = 0;
  return k.build();
}

// A roadside cross: a hewn post and arm under a two-board roof, a painted sun on the crossing, ribbons on the
// arms, a ledge for a candle and a bowl, flat stones at the foot. It leans a little.
export function waysideCross(o = {}) {
  const k = new Kit('waysideCross', o);
  const H = (o.height || 3.0) + k.rs(0.1);
  k.push({ yaw: o.yaw || 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.5;
    k.blob('stone', 0.28, { pos: [Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.32], scale: [1.4, 0.45, 1.2], detail: 1, tint: k.pick([0x8c8c92, 0x7c7c84, 0x9a968e]), jitter: 0.03 });
  }
  k.push({ rot: [k.rs(0.02), 0, k.rs(0.035)] });
  k.box('wood', 0.15, H, 0.13, { pos: [0, H / 2 - 0.1, 0], tint: 0xc4ae98, jitter: 0.004, seg: [1, 4, 1], grain: 'y' });
  const yA = H * 0.68;
  k.cone('wood', 0.08, 0.2, { pos: [0, H - 0.1 + 0.08, 0], radial: 4, tint: 0xa89684 });
  k.box('wood', 0.95, 0.11, 0.1, { pos: [0, yA, 0], tint: 0xc0aa94, jitter: 0.004, seg: [3, 1, 1] });
  // the roof over the arms: two boards, a ridge board, a snow load
  for (const sz of [-1, 1]) k.box('planks', 1.25, 0.025, 0.36, { pos: [0, yA + 0.2, sz * 0.14], rot: [sz * -0.6, 0, 0], tint: 0xa89684, jitter: 0.003 });
  k.box('wood', 1.28, 0.05, 0.05, { pos: [0, yA + 0.3, 0], tint: 0x8a7a68 });
  for (const sx of [-1, 1]) k.box('wood', 0.04, 0.2, 0.04, { pos: [sx * 0.55, yA + 0.13, 0], tint: 0x8a7a68 });
  // painted sun at the crossing, three ribbons, a hook for a lantern
  k.cyl('paint', 0.1, 0.1, 0.02, { pos: [0, yA, 0.07], rot: [Math.PI / 2, 0, 0], radial: 10, tint: FOLK_RED, cap: 'paint', grime: 0.1 });
  k.cyl('paint', 0.045, 0.045, 0.024, { pos: [0, yA, 0.072], rot: [Math.PI / 2, 0, 0], radial: 8, tint: 0xd8c8a0, cap: 'paint', grime: 0 });
  for (const [sx, len] of [[-0.42, 0.55], [0.42, 0.45], [0.2, 0.35]]) k.hang('ribbon', 0.05, len, { pos: [sx, yA - 0.05, 0.07], tint: k.pick([0x8a2a1e, 0x9a3224]), sway: 0.9, wave: 0.03 });
  k.tube('iron', [[0, yA - 0.07, 0.08], [0, yA - 0.2, 0.2], [0, yA - 0.3, 0.2]], 0.007, { radial: 4, tint: 0x4a4a4e });
  // offering ledge
  k.box('planks', 0.5, 0.035, 0.24, { pos: [0, 1.0, 0.18], tint: 0xb8a690, jitter: 0.003 });
  for (const sx of [-1, 1]) k.box('wood', 0.03, 0.03, 0.22, { pos: [sx * 0.2, 0.93, 0.12], rot: [0.7, 0, 0], tint: 0x8a7a68 });
  k.lathe('wood', [[0.001, 0], [0.05, 0.002], [0.085, 0.05], [0.08, 0.054], [0.045, 0.012]], { pos: [-0.12, 1.02, 0.2], radial: 9, tint: 0xb8a088, uRepeat: 1 });
  k.cyl('matte', 0.014, 0.016, 0.07, { pos: [0.13, 1.055, 0.18], radial: 5, tint: 0xe6dcc0, cap: null });
  if (!o.indoor) {
    k.mound(1.3, 0.12, 0.56, { pos: [0, yA + 0.34, 0], jseed: 4 });
    k.mound(0.46, 0.04, 0.22, { pos: [0.02, 1.03, 0.18], jseed: 2 });
    k.mound(0.7, 0.1, 0.7, { pos: [0, 0, 0], jseed: 6 });
  }
  k.pop();
  k.pop();
  k.circleCollider(0.3, { h: H });
  k.ud.align = 0;
  return k.build();
}

// Freight sledge for the woodcutters: thick runners with upturned noses, three bunks, stanchions, a stack of
// cordwood roped down, shafts forward. variant 'loaded' (default) | 'empty' (a few logs left, the rope coiled).
export function logSledge(o = {}) {
  const k = new Kit('logSledge', o);
  const loaded = (o.variant || 'loaded') !== 'empty';
  const L = 3.1, W = 1.0;
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick(WOOD);
  for (const sx of [-1, 1]) {
    const x = sx * W / 2;
    k.tube('wood', [[x, 0.1, -L / 2], [x, 0.1, L / 2 - 0.55], [x, 0.15, L / 2 - 0.12], [x, 0.4, L / 2 + 0.1]], 0.065, { radial: 5, segs: 6, tint: wood });
    k.box('iron', 0.02, 0.018, L * 0.78, { pos: [x, 0.015, -0.1], tint: 0x5a5650, grime: 0 });
  }
  const bunks = [-1.0, 0.1, 1.1];
  for (const z of bunks) k.box('wood', W + 0.34, 0.12, 0.15, { pos: [0, 0.27, z], tint: 0x8a7a68, jitter: 0.004 });
  for (const z of [bunks[0], bunks[2]]) for (const sx of [-1, 1]) k.box('wood', 0.07, 1.0, 0.07, { pos: [sx * (W / 2 + 0.14), 0.8, z], rot: [0, 0, sx * -0.03], tint: 0x9a8a78, jitter: 0.004 });
  // shafts forward and up to where the horse would stand
  for (const sx of [-1, 1]) k.cyl('wood', 0.03, 0.036, 2.0, { pos: [sx * 0.34, 0.5, L / 2 + 0.7], rot: [Math.PI / 2 - 0.22, 0, 0], radial: 6, tint: 0xa89684, jitter: 0.004, cap: 'logEnd' });
  k.cyl('wood', 0.022, 0.022, 0.8, { pos: [0, 0.78, L / 2 + 1.55], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xa89684 });
  if (loaded) {
    const layers = [[8, 0.22], [7, 0.24], [6, 0.24]];
    let y = 0.45;
    layers.forEach(([n, sp], li) => {
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * sp * 0.97 + k.rs(0.02);
        const r = 0.1 + k.rs(0.012);
        k.log(r, 1.0 + k.rs(0.18), { lie: 'x', pos: [k.rs(0.05), y + k.rs(0.01), z + (li === 1 ? sp * 0.5 : 0) * 0], radial: 5, tint: k.pick([0xffffff, 0xd8cdc0, 0xbfb3a6, 0xa89c90]) });
      }
      y += 0.17;
    });
    for (const z of [-0.5, 0.55]) k.tube('rope', [[-0.66, 0.34, z], [-0.62, 0.9, z], [0, 1.02, z], [0.62, 0.9, z], [0.66, 0.34, z]], 0.014, { radial: 4, segs: 7, tint: 0xb89c6c });
    if (!o.indoor) k.mound(1.0, 0.1, 1.3, { pos: [0, y - 0.04, 0.0], jseed: 3 });
  } else {
    for (let i = 0; i < 3; i++) k.log(0.1, 1.0 + k.rs(0.2), { lie: 'x', pos: [k.rs(0.05), 0.4 + (i === 2 ? 0.17 : 0), -0.4 + (i % 2) * 0.22 + (i === 2 ? 0.1 : 0)], radial: 6, tint: k.pick([0xffffff, 0xd8cdc0]) });
    k.torus('rope', 0.26, 0.016, { pos: [0.05, 0.4, 0.75], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4, scale: [1, 1, 1] });
    if (!o.indoor) k.mound(0.8, 0.07, 0.8, { pos: [0, 0.46, -0.3], jseed: 3 });
  }
  k.pop();
  k.boxCollider(W / 2 + 0.22, L / 2 + 0.05, { h: 1.3 });
  k.ud.align = 0.5;
  return k.build();
}

// A sawbuck with a log half cut through, the bow saw left in the kerf, sawdust and billets on the ground.
export function sawbuck(o = {}) {
  const k = new Kit('sawbuck', o);
  k.push({ yaw: o.yaw || 0 });
  // two X frames of crossed planks (in the yz plane), a stretcher between them, the log lying in the vees
  for (const sx of [-1, 1]) {
    for (const s of [-1, 1]) k.box('wood', 0.055, 0.95, 0.05, { pos: [sx * 0.4, 0.45, 0], rot: [s * 0.42, 0, 0], tint: k.pick(WOOD), jitter: 0.004, seg: [1, 2, 1] });
  }
  k.box('wood', 0.95, 0.04, 0.04, { pos: [0, 0.3, 0], tint: 0x8a7a68 });
  k.log(0.1, 1.35, { lie: 'x', pos: [0, 0.78, 0], radial: 8, tint: 0xd8cdc0 });
  k.box('wood', 0.014, 0.12, 0.22, { pos: [0.18, 0.76, 0], tint: 0x2a2018, grime: 0 });
  // bow saw standing in the kerf
  k.with({ pos: [0.18, 0.9, 0], rot: [0, 0, 0.06] }, () => {
    k.box('iron', 0.006, 0.05, 0.62, { pos: [0, 0.0, 0.1], tint: 0xa8a8b0, grime: 0 });
    k.tube('wood', [[0, 0.02, -0.2], [0, 0.34, -0.26], [0, 0.4, 0.1], [0, 0.34, 0.46], [0, 0.02, 0.4]], 0.017, { radial: 5, tint: 0xd8b890 });
  });
  k.blob('straw', 0.22, { pos: [0.2, 0.02, 0.32], scale: [1.5, 0.12, 1.1], detail: 1, tint: 0xe8d8b0, jitter: 0.02 });
  for (let i = 0; i < 4; i++) k.box('wood', 0.09, 0.2, 0.09, { pos: [k.rs(0.7), 0.1, k.r(0.5, 0.9) * (i % 2 ? 1 : -1)], rot: [k.rs(0.4), k.r(0, 3), k.rs(0.4)], tint: k.pick([0xf0e4d4, 0xd8c8b0, 0xbfae98]), jitter: 0.006 });
  if (!o.indoor) k.mound(0.9, 0.06, 0.2, { pos: [-0.2, 0.88, 0], jseed: 2 });
  k.pop();
  k.boxCollider(0.75, 0.4, { h: 1.0 });
  k.ud.align = 0.2;
  return k.build();
}

// One 2.4 m section of split-rail fence: paired leaning posts at both ends with three rails running between them.
// Placed end to end (props.railFence through a PropBatch) it costs no extra draw calls, unlike a kit fence piece.
export function railFence(o = {}) {
  const k = new Kit('railFence', o);
  const L = (o.length || 2.4) + k.rs(0.03), H = 1.12;
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.log(0.045, H + 0.5, { pos: [sx * L / 2 + sx * sz * 0.015, (H + 0.5) / 2 - 0.3, sz * 0.075], rot: [sz * -0.03, 0, k.rs(0.03)], radial: 5, tint: k.pick(WOOD) });
  }
  for (const y of [0.3, 0.68, 1.04]) k.log(0.05, L + 0.18, { lie: 'x', pos: [0, y + k.rs(0.03), k.rs(0.01)], rot: [0, 0, k.rs(0.025)], radial: 5, tint: k.pick(WOOD) });
  if (!o.indoor && k.chance(0.6)) k.mound(L * 0.8, 0.07, 0.14, { pos: [k.rs(0.2), 1.09, 0], jseed: 2, ws: 6, hs: 2 });
  k.pop();
  k.boxCollider(L / 2 + 0.05, 0.1, { h: H });
  k.ud.align = 0;
  return k.build();
}

// A lath snow fence panel on three stakes, with the drift it has caught banked on the lee side (local -z).
export function snowFence(o = {}) {
  const k = new Kit('snowFence', o);
  const L = (o.length || 3.0) + k.rs(0.2), H = 1.25;
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 0, 1]) k.box('wood', 0.07, H + 0.35, 0.06, { pos: [sx * L / 2, (H + 0.35) / 2 - 0.2, 0], rot: [k.rs(0.04), 0, k.rs(0.04)], tint: k.pick(WOOD), jitter: 0.004, grain: 'y' });
  for (const y of [0.3, H - 0.1]) k.box('wood', L, 0.03, 0.025, { pos: [0, y, 0.04], tint: 0x6a5a48 });
  const n = Math.floor(L / 0.17);
  for (let i = 0; i < n; i++) {
    if (k.chance(0.05)) continue;
    const down = k.chance(0.1);
    k.box('planks', 0.05, H - 0.1 - (down ? 0.35 : k.r(0, 0.1)), 0.014, { pos: [-L / 2 + 0.1 + i * ((L - 0.2) / (n - 1)), 0.18 + (H - 0.1) / 2 - (down ? 0.18 : 0), 0.05], rot: [0, 0, down ? k.rs(0.25) : k.rs(0.02)], tint: k.pick(WOOD), grain: 'y' });
  }
  if (!o.indoor) {
    k.mound(L * 0.95, 1.5, 2.6, { pos: [0, -0.02, -0.95], jseed: 1 });
    k.mound(L * 0.5, 0.4, 0.7, { pos: [k.rs(0.5), -0.02, 0.4], jseed: 3 });
  }
  k.pop();
  k.boxCollider(L / 2 + 0.05, 0.08, { h: H });
  k.ud.align = 0.3;
  return k.build();
}
