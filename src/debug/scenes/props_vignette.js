// Gallery view: a lived-in log house porch (the "nook" test). Eye level: cam=-1.2,1.6,7.8&look=0.2,1.3,0
// Everything dressing the porch comes from the props kit through one PropBatch; the house shell
// is a throwaway Kit here (the real houses come from the architecture kit).
import * as THREE from 'three';
import { Kit, TAU } from '../../world/props/kit.js';
import { FOLK_RED } from '../../world/props/p_household.js';

function houseShell() {
  const k = new Kit('porchHouse', { seed: 7 });
  const dark = [0x8a7a6c, 0x7a6a5e, 0x9a8a7c, 0x6a5a50];
  // Back wall: stacked logs lying along X with notched ends poking past the corner.
  const rows = 15;
  for (let r = 0; r < rows; r++) {
    const y = 0.2 + r * 0.2;
    k.log(0.105 + k.rs(0.006), 8.6 + (r % 2) * 0.35, { lie: 'x', pos: [(r % 2) * 0.17 - 0.1, y, -1.1], radial: 8, tint: k.pick(dark), jitter: 0.008 });
  }
  // Left side wall running toward the viewer
  for (let r = 0; r < rows; r++) {
    const y = 0.2 + r * 0.2;
    k.log(0.105 + k.rs(0.006), 3.5 + (r % 2) * 0.4, { lie: 'z', pos: [-4.1, y, 0.62 + (r % 2) * 0.12], radial: 8, tint: k.pick(dark), jitter: 0.008 });
  }
  // Porch floor, posts, steps
  const fy = 0.32;
  for (let i = 0; i < 16; i++) k.box('planks', 7.4, 0.06, 0.2, { pos: [0.2, fy, -0.9 + i * 0.19], tint: k.pick([0xe0d2c0, 0xc4ae98, 0xb8a690]), jitter: 0.004, rot: [0, k.rs(0.004), 0], grain: 'x' });
  for (const x of [-3.9, -1.2, 1.4, 3.9]) {
    k.box('wood', 0.2, 2.25, 0.2, { pos: [x, 1.47, 2.0], tint: 0x8a7a6c, jitter: 0.01, seg: [1, 4, 1] });
    // red carved bracket
    k.box('paint', 0.5, 0.07, 0.06, { pos: [x + (x < 0 ? 0.25 : -0.25), 2.38, 2.0], rot: [0, 0, x < 0 ? -0.7 : 0.7], tint: FOLK_RED, grime: 0.2 });
  }
  k.box('wood', 8.6, 0.2, 0.22, { pos: [0, 2.62, 2.0], tint: 0x7a6a5e, jitter: 0.008, seg: [6, 1, 1] });
  for (let s = 0; s < 2; s++) k.log(0.11, 2.6, { lie: 'x', pos: [0.1, 0.2 - s * 0.12, 2.15 + s * 0.3], radial: 7, tint: 0xb8aea4 });
  // Roof: planks sloping down toward the viewer, thick snow, icicles under the eave
  for (let i = 0; i < 7; i++) {
    k.box('planks', 9.0, 0.06, 0.6, { pos: [0, 3.4 - i * 0.13, -0.9 + i * 0.55], rot: [0.232, 0, 0], tint: k.pick([0x8a7a6a, 0x7a6a5a, 0x9a8a7a]), jitter: 0.006 });
  }
  k.mound(9.2, 0.5, 3.7, { pos: [0, 2.99, 0.9], rot: [0.232, 0, 0], jseed: 3 });
  k.mound(7.2, 0.24, 1.3, { pos: [0.3, 2.66, 2.1], rot: [0.232, 0, 0], jseed: 5 });
  // Door in the back wall: frame carved and painted, planks, iron straps, handle
  k.box('paint', 1.28, 0.2, 0.14, { pos: [0.6, 2.25, -0.98], tint: FOLK_RED, grime: 0.25 });
  for (const sx of [-1, 1]) k.box('paint', 0.16, 2.2, 0.14, { pos: [0.6 + sx * 0.6, 1.2, -0.98], tint: FOLK_RED, grime: 0.25 });
  for (let i = 0; i < 5; i++) k.box('planks', 0.2, 2.05, 0.06, { pos: [0.6 - 0.4 + i * 0.2, 1.15, -1.02], tint: k.pick([0xa08a74, 0x8a7662, 0xb09a84]), jitter: 0.004, grain: 'y' });
  for (const y of [0.55, 1.7]) k.box('iron', 0.95, 0.08, 0.02, { pos: [0.6, y, -0.99], tint: 0x3c3c42, grime: 0 });
  k.sph('iron', 0.04, { pos: [1.05, 1.1, -0.97], tint: 0x6a6a72 });
  // Sun symbol carved over the door (red disc with rays)
  k.cyl('paint', 0.14, 0.14, 0.03, { pos: [0.6, 2.62, -0.98], rot: [Math.PI / 2, 0, 0], radial: 10, tint: FOLK_RED, cap: 'paint', grime: 0.1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    k.box('paint', 0.04, 0.12, 0.03, { pos: [0.6 + Math.cos(a) * 0.24, 2.62 + Math.sin(a) * 0.24, -0.98], rot: [0, 0, a - Math.PI / 2], tint: FOLK_RED, grime: 0 });
  }
  // Window with blue shutters, the pane glowing warm at dusk
  const wx = -2.2;
  k.box('lamp', 0.8, 0.9, 0.04, { pos: [wx, 1.7, -0.99], tint: 0xffe0a0, grime: 0, var: 0.04 });
  k.box('wood', 0.9, 0.06, 0.12, { pos: [wx, 2.2, -0.97], tint: 0x6a5a4c });
  k.box('wood', 0.9, 0.06, 0.12, { pos: [wx, 1.2, -0.97], tint: 0x6a5a4c });
  k.box('wood', 0.04, 0.9, 0.05, { pos: [wx, 1.7, -0.97], tint: 0x5a4a3c });
  k.box('wood', 0.8, 0.04, 0.05, { pos: [wx, 1.7, -0.97], tint: 0x5a4a3c });
  for (const sx of [-1, 1]) k.box('paint', 0.44, 0.92, 0.04, { pos: [wx + sx * 0.66, 1.7, -0.9], rot: [0, sx * 0.9, 0], tint: 0x3e5a78, grime: 0.3 });
  k.mound(1.0, 0.07, 0.2, { pos: [wx, 1.18, -0.97], jseed: 6 });
  k.anchor('chimney', 1.5, 3.9, -0.4);
  // Chimney stack with a snow cap
  k.box('stone', 0.7, 1.6, 0.7, { pos: [2.6, 3.9, -0.3], tint: 0xb0aaa4, jitter: 0.01, seg: [2, 3, 2] });
  k.mound(0.9, 0.2, 0.9, { pos: [2.6, 4.7, -0.3], jseed: 8 });
  // Banked snow along the foot of the walls
  k.mound(8.0, 0.55, 0.8, { pos: [0, 0.0, -1.5], jseed: 9 });
  k.mound(1.0, 0.5, 4.0, { pos: [-4.7, 0.0, 1.0], jseed: 10 });
  return k.build();
}

export async function build(G, ctx) {
  const { PropBatch } = ctx;
  const house = houseShell();
  G.scene.add(house);
  // Chimney column (the shell is a plain Kit build, so the emitter is created here).
  ctx.props.fx.smoke({ position: [2.6, 4.75, -0.3], parent: G.scene, height: 40 });
  const b = new PropBatch(G, 'porch');
  const A = (name, x, z, o = {}) => b.add(name, x, z, o);
  // Porch dressing (floor is at y = 0.35)
  const fy = 0.35;
  A('bench', 2.0, -0.78, { y: fy, yaw: 0, seed: 1, opts: { variant: 'plank', length: 1.6 } });
  A('barrel', -1.0, -0.62, { y: fy, seed: 4 });
  A('bucket', -0.5, -0.65, { y: fy, seed: 3 });
  A('barrel', -1.55, -0.65, { y: fy, seed: 1 });
  A('firewoodStack', -3.55, 0.25, { y: fy, yaw: Math.PI / 2, seed: 2 });
  A('sack', 3.4, -0.6, { y: fy, seed: 3 });
  A('sack', 3.1, -0.45, { y: fy, seed: 1 });
  A('crateStack', 3.1, 1.0, { y: fy, seed: 1 });
  A('skis', -3.85, 1.0, { y: fy, yaw: Math.PI / 2, seed: 1 });
  A('snowShovel', -3.85, 1.55, { y: fy, yaw: Math.PI / 2, seed: 1 });
  A('lantern', 1.28, -0.98, { y: 0, seed: 1, snap: false, opts: { mount: 'wall', light: true } });
  A('toys', 1.0, 1.4, { y: fy, seed: 1 });
  A('rug', 0.6, 0.3, { y: fy + 0.012, seed: 2, snap: false, opts: { cell: 3, width: 1.5, depth: 0.9 } });
  A('offering', 2.2, 1.3, { y: fy, seed: 1, opts: { variant: 'bowl' } });
  // Yard: chopping block, sled, drying rack, laundry, snowman, well-worn path
  A('choppingBlock', -1.9, 4.3, { seed: 1 });
  A('stump', -0.9, 4.9, { seed: 2 });
  A('sled', 2.2, 3.4, { seed: 1, yaw: 0.6, opts: { variant: 'kid' } });
  A('dryingRack', 5.3, 0.6, { seed: 1, yaw: Math.PI / 2 });
  A('laundryLine', -5.8, 2.2, { seed: 2, yaw: 0.0 });
  A('snowman', 3.8, 5.2, { seed: 1 });
  A('barrelStack', -6.7, -0.2, { seed: 1, variant: 'standing', yaw: 0.2, opts: { variant: 'standing' } });
  A('woodpile', 6.3, -0.6, { seed: 1, yaw: 0.1 });
  A('cart', 6.8, 3.5, { seed: 2, yaw: 2.4, opts: { variant: 'sacks' } });
  A('campfire', 1.6, 5.4, { seed: 1, yaw: 0, opts: { smoke: true } });
  A('bench', 3.2, 5.6, { seed: 3, yaw: 1.5, opts: { variant: 'log' } });
  A('bench', 0.0, 5.9, { seed: 2, yaw: -1.6, opts: { variant: 'log' } });
  A('fishString', -2.8, -0.95, { y: 0.35, snap: false, seed: 1, yaw: 0 });
  A('ladder', 4.6, -0.95, { seed: 1, yaw: 0 });
  A('icicles', 0, 2.62, { snap: false, y: 2.57, seed: 1, yaw: 0, opts: { width: 8.6, maxLen: 0.6 } });
  A('icicles', 0.3, 2.62, { snap: false, y: 2.55, seed: 2, yaw: 0, opts: { width: 8.4, maxLen: 0.45 } });
  // Trampled path: dark packed-snow strips from the steps out to the yard
  b.build();
  // Path decals (flat blobs of packed snow)
  const k = new Kit('path', { seed: 3 });
  for (let i = 0; i < 9; i++) {
    k.plane('decal', 1.6 + k.r(0, 0.6), 1.9, { pos: [0.4 + k.rs(0.25), 0.04, 2.6 + i * 0.9], rot: [-Math.PI / 2, 0, k.rs(0.5)], tint: 0x8a96a8, grime: 0, var: 0.05 });
  }
  G.scene.add(k.build());
  G.propBatchStats = b.stats;
  console.error('[props vignette] ' + JSON.stringify(b.stats));
  // The porch emitters live in the scene; nothing else to do.
  void THREE;
}
