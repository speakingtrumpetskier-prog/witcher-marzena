// Household props: bench, table, stool, shelf, spoon rack, bed, chest, rug, tapestry, pot,
// cauldron, wash tub, music box, bird carving, hand-bell, toys, snowman.
import * as THREE from 'three';
import { Kit, TAU } from './kit.js';

const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];
export const FOLK_RED = 0x8a281e;

// UV rectangle of a cell of the folk atlas (4 x 2).
export function folkRect(cell) {
  const cx = cell % 4, cy = Math.floor(cell / 4);
  const e = 0.004;
  return [cx / 4 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 4 - e, 1 - cy / 2 - e];
}

export function bench(o = {}) {
  const k = new Kit('bench', o);
  const L = (o.length || 1.5) + k.rs(0.2);
  const logSeat = (o.variant || k.pick(['plank', 'plank', 'log'])) === 'log';
  k.push({ yaw: o.yaw || 0 });
  // Sitting spots (NPC stations): local seat centers along the bench.
  k.anchor('seat', 0, 0.46, 0); k.anchor('seatA', -L * 0.25, 0.46, 0); k.anchor('seatB', L * 0.25, 0.46, 0);
  if (logSeat) {
    k.log(0.14, L, { lie: 'x', pos: [0, 0.39, 0], radial: 8, tint: 0xd8cdc0 });
    k.box('planks', L * 0.99, 0.02, 0.2, { pos: [0, 0.505, 0.0], tint: 0xe8dccb, jitter: 0.004, grain: 'x' });
    for (const sx of [-1, 1]) k.box('wood', 0.07, 0.34, 0.2, { pos: [sx * (L / 2 - 0.2), 0.17, 0], tint: 0x8a7a6a, jitter: 0.004 });
  } else {
    k.box('planks', L, 0.045, 0.3, { pos: [0, 0.44, 0], tint: k.pick(WOOD), jitter: 0.005, seg: [3, 1, 1], grain: 'x' });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box('wood', 0.06, 0.45, 0.05, { pos: [sx * (L / 2 - 0.2), 0.215, sz * 0.1], rot: [sz * 0.14, 0, 0], tint: 0x9a8a7a, jitter: 0.004 });
    }
    k.box('wood', L * 0.7, 0.04, 0.04, { pos: [0, 0.2, 0], tint: 0x9a8a7a });
  }
  if (!o.indoor) k.mound(L * 0.8, 0.07, 0.24, { pos: [k.rs(0.1), logSeat ? 0.5 : 0.465, 0], jseed: 3 });
  k.pop();
  k.boxCollider(L / 2, 0.2, { h: 0.55 });
  k.ud.align = 0.2;
  return k.build();
}

export function stool(o = {}) {
  const k = new Kit('stool', o);
  const log = (o.variant || k.pick(['legs', 'legs', 'log'])) === 'log';
  k.push({ yaw: k.r(0, TAU) });
  k.anchor('seat', 0, log ? 0.4 : 0.45, 0);
  if (log) {
    k.cyl('bark', 0.16, 0.18, 0.38, { pos: [0, 0.19, 0], radial: 9, cap: 'logEnd', noBottom: true, jitter: 0.01, tint: 0xe0d4c8 });
  } else {
    k.cyl('planks', 0.15, 0.15, 0.04, { pos: [0, 0.42, 0], radial: 10, tint: k.pick(WOOD), jitter: 0.004 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      k.cyl('wood', 0.018, 0.024, 0.46, { pos: [Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12], rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2], radial: 5, tint: 0xa8967e, cap: null });
    }
  }
  if (!o.indoor && k.chance(0.5)) k.mound(0.3, 0.04, 0.3, { pos: [0, log ? 0.38 : 0.44, 0], jseed: 1 });
  k.pop();
  k.circleCollider(0.2, { h: 0.45 });
  k.ud.align = 0.5;
  return k.build();
}

export function table(o = {}) {
  const k = new Kit('table', o);
  const w = 1.5 + k.rs(0.2), d = 0.8 + k.rs(0.08);
  const set = o.set != null ? o.set : k.chance(0.7);
  k.push({ yaw: o.yaw || 0 });
  // Top: individual boards with slightly uneven gaps.
  const nb = 4;
  for (let i = 0; i < nb; i++) {
    k.box('planks', w, 0.045, d / nb - 0.008, { pos: [0, 0.77, -d / 2 + (i + 0.5) * (d / nb)], tint: k.pick(WOOD), jitter: 0.004, rot: [0, k.rs(0.006), 0], grain: 'x', seg: [3, 1, 1] });
  }
  for (const sx of [-1, 1]) {
    k.box('wood', 0.06, 0.05, d - 0.06, { pos: [sx * (w / 2 - 0.2), 0.73, 0], tint: 0x8a7a68 });
    for (const sz of [-1, 1]) k.box('wood', 0.075, 0.76, 0.075, { pos: [sx * (w / 2 - 0.15), 0.38, sz * (d / 2 - 0.1)], rot: [sz * 0.06, 0, sx * -0.05], tint: 0x9a8a78, jitter: 0.004 });
    k.box('wood', 0.04, 0.04, d - 0.2, { pos: [sx * (w / 2 - 0.17), 0.22, 0], tint: 0x8a7a68 });
  }
  k.box('wood', w - 0.4, 0.04, 0.05, { pos: [0, 0.22, 0], tint: 0x8a7a68 });
  if (set) {
    // Wooden bowls, a loaf, a jug and a knife.
    const bowl = (x, z, r) => {
      k.lathe('wood', [[0.001, 0], [r * 0.6, 0.002], [r, 0.05], [r * 0.95, 0.052], [r * 0.58, 0.012]], { pos: [x, 0.795, z], radial: 10, tint: 0xb8a088, grime: 0, uRepeat: 1 });
    };
    bowl(-0.35, 0.05, 0.1); bowl(0.3, -0.12, 0.085);
    k.blob('burlap', 0.1, { pos: [0.02, 0.84, 0.18], scale: [1.5, 0.7, 0.9], detail: 1, tint: 0xd8b878, jitter: 0.012 });
    k.lathe('clay', [[0.001, 0], [0.06, 0.01], [0.075, 0.1], [0.05, 0.2], [0.035, 0.24], [0.05, 0.26]], { pos: [-0.62, 0.795, -0.12], radial: 10, tint: 0x9a7a62 });
    k.box('iron', 0.14, 0.004, 0.02, { pos: [0.55, 0.797, 0.2], yaw: 0.6, tint: 0x8a8a90, grime: 0 });
  }
  if (!o.indoor) k.mound(w * 0.7, 0.05, d * 0.6, { pos: [k.rs(0.1), 0.795, 0], jseed: 2 });
  k.pop();
  k.boxCollider(w / 2, d / 2, { h: 0.8 });
  k.ud.align = 0.1;
  return k.build();
}

export function shelf(o = {}) {
  const k = new Kit('shelf', o);
  const w = (o.width || 1.2) + k.rs(0.1);
  k.push({ yaw: o.yaw || 0 });
  // Wall at z = 0 (back), shelves project to +Z.
  for (const y of [0.0, 0.42]) {
    k.box('planks', w, 0.035, 0.26, { pos: [0, 1.1 + y, 0.13], tint: k.pick(WOOD), jitter: 0.004, grain: 'x' });
    for (const sx of [-1, 1]) k.box('wood', 0.03, 0.2, 0.2, { pos: [sx * (w / 2 - 0.1), 1.0 + y, 0.12], rot: [0, 0, 0], tint: 0x8a7a68 });
  }
  const jar = (x, y, r, h, c) => k.lathe('clay', [[0.001, 0], [r, 0.005], [r * 1.05, h * 0.6], [r * 0.7, h], [r * 0.75, h + 0.02]], { pos: [x, y, 0.13], radial: 9, tint: c });
  jar(-0.4, 1.12, 0.06, 0.14, 0x8a6a52); jar(-0.25, 1.12, 0.05, 0.1, 0xa88a6a); jar(0.3, 1.12, 0.07, 0.17, 0x7a5a48);
  k.lathe('wood', [[0.001, 0], [0.06, 0.002], [0.1, 0.05], [0.095, 0.052], [0.055, 0.012]], { pos: [0.0, 1.12, 0.14], radial: 9, tint: 0xb8a088, uRepeat: 1 });
  k.blob('straw', 0.09, { pos: [-0.1, 1.55, 0.13], scale: [1.4, 0.7, 1], detail: 1, tint: 0xd8c898 });
  k.box('iron', 0.1, 0.12, 0.1, { pos: [0.35, 1.58, 0.13], tint: 0x5a5a5e });
  // Hanging herbs
  for (let i = 0; i < 3; i++) {
    const x = -0.45 + i * 0.4;
    k.box('wood', 0.012, 0.012, 0.012, { pos: [x, 1.98, 0.05] });
    k.cone('matte', 0.045, 0.2, { pos: [x, 1.86, 0.05], rot: [Math.PI, 0, 0], radial: 6, tint: k.pick([0x5a6a44, 0x7a7048, 0x4e5e3c]), jitter: 0.008 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}

// Carved spoon rack: a board with a carved crest, pegs and spoons hanging.
export function spoonRack(o = {}) {
  const k = new Kit('spoonRack', o);
  k.push({ yaw: o.yaw || 0 });
  const w = 0.5;
  k.box('planks', w, 0.2, 0.025, { pos: [0, 1.4, 0], tint: 0xc4ae98, jitter: 0.003 });
  // Carved crest: three scallops and a small rosette.
  for (let i = -1; i <= 1; i++) k.cyl('wood', 0.08, 0.08, 0.025, { pos: [i * 0.16, 1.5, 0], rot: [Math.PI / 2, 0, 0], radial: 10, tint: 0xc4ae98, cap: 'wood' });
  k.cyl('paint', 0.035, 0.035, 0.02, { pos: [0, 1.4, 0.014], rot: [Math.PI / 2, 0, 0], radial: 8, tint: FOLK_RED, cap: 'paint' });
  for (let i = 0; i < 5; i++) {
    const x = -0.2 + i * 0.1;
    k.cyl('wood', 0.01, 0.01, 0.04, { pos: [x, 1.32, 0.03], rot: [Math.PI / 2, 0, 0], radial: 5, tint: 0x7a6a58, cap: null });
    const len = k.r(0.2, 0.28);
    k.cyl('wood', 0.008, 0.01, len, { pos: [x, 1.32 - len / 2, 0.045], rot: [0, 0, k.rs(0.08)], radial: 5, tint: 0xd8c8a8, cap: null });
    k.sph('wood', 0.028, { pos: [x, 1.32 - len - 0.01, 0.045], scale: [1, 1.3, 0.4], tint: 0xd8c8a8, ws: 7, hs: 5 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function bed(o = {}) {
  const k = new Kit('bed', Object.assign({ indoor: true }, o));
  const L = 1.95, W = 0.95;
  k.push({ yaw: o.yaw || 0 });
  k.anchor('sleep', 0, 0.6, 0.1);
  const wood = 0xb8a690;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('wood', 0.08, sz < 0 ? 1.1 : 0.62, 0.08, { pos: [sx * (W / 2), sz < 0 ? 0.55 : 0.31, sz * (L / 2)], tint: wood, jitter: 0.004 });
  }
  for (const sx of [-1, 1]) k.box('planks', 0.05, 0.16, L, { pos: [sx * W / 2, 0.34, 0], tint: wood, jitter: 0.004, grain: 'z' });
  k.box('planks', W, 0.16, 0.05, { pos: [0, 0.34, L / 2], tint: wood });
  // Headboard slats with a carved crest
  k.box('planks', W, 0.5, 0.04, { pos: [0, 0.8, -L / 2], tint: wood, jitter: 0.004 });
  for (const sx of [-1, 1]) k.cyl('wood', 0.05, 0.05, 0.04, { pos: [sx * (W / 2 - 0.05), 1.1, -L / 2], rot: [Math.PI / 2, 0, 0], radial: 8, tint: wood, cap: 'wood' });
  k.cyl('paint', 0.07, 0.07, 0.045, { pos: [0, 0.82, -L / 2 + 0.005], rot: [Math.PI / 2, 0, 0], radial: 8, tint: FOLK_RED, cap: 'paint' });
  // Mattress, sheepskin, and a folk wool cover.
  k.blob('straw', 0.5, { pos: [0, 0.46, 0], scale: [W * 0.92, 0.18, L * 0.5], detail: 2, tint: 0xd8c898, jitter: 0.02 });
  k.plane('folk', W * 0.88, L * 0.62, { pos: [0, 0.56, 0.3], rot: [-Math.PI / 2, 0, 0], uvRect: folkRect(k.pick([0, 1, 6])), sx: 8, sy: 8, tint: 0xffffff, grime: 0, var: 0.04, bend: (x, y) => [0, 0, Math.sin(x * 9 + y * 5) * 0.012 + Math.sin(y * 4) * 0.01] });
  k.blob('fur', 0.3, { pos: [0, 0.57, -0.55], scale: [1.4, 0.18, 1.0], detail: 1, tint: 0xd8cdbd });
  k.blob('linen', 0.18, { pos: [0, 0.62, -0.78], scale: [2.0, 0.55, 1.0], detail: 1, tint: 0xe8e2d4, jitter: 0.015 });
  k.pop();
  k.boxCollider(W / 2 + 0.05, L / 2 + 0.05, { h: 0.6 });
  k.ud.align = 0;
  return k.build();
}

export function chest(o = {}) {
  const k = new Kit('chest', o);
  const w = 0.92 + k.rs(0.1), d = 0.5, h = 0.46;
  const painted = (o.variant || k.pick(['plain', 'painted', 'plain'])) === 'painted';
  const open = o.open != null ? o.open : k.chance(0.2);
  k.push({ yaw: o.yaw || 0 });
  const body = painted ? 'paint' : 'planks';
  const tint = painted ? FOLK_RED : k.pick(WOOD);
  k.box(body, w, h, d, { pos: [0, h / 2, 0], tint, jitter: 0.004, grain: 'x' });
  // Lid: arched cylinder section (half cylinder) hinged at the back.
  k.with({ pos: [0, h, open ? -d / 2 : 0], rot: [open ? -1.25 : 0, 0, 0] }, () => {
    k.with({ pos: [0, 0, open ? d / 2 : 0] }, () => {
      const g = new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.PI / 2);
      k.emit(g, body, { uv: 'box', grain: 'x', tint, jitter: 0.003 });
    });
  });
  // Iron bands and a lock plate
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    k.box('iron', 0.045, h + 0.012, d + 0.012, { pos: [x, h / 2, 0], tint: 0x3a3a3e, grime: 0 });
    if (!open) k.box('iron', 0.045, 0.012, d + 0.012, { pos: [x, h + d / 2 + 0.004, 0], tint: 0x3a3a3e, grime: 0 });
  }
  k.box('iron', 0.08, 0.1, 0.02, { pos: [0, h - 0.02, d / 2 + 0.012], tint: 0x6a6a70, grime: 0 });
  if (painted) {
    for (let i = 0; i < 5; i++) k.box('matte', 0.04, 0.04, 0.01, { pos: [-0.28 + i * 0.14, 0.2, d / 2 + 0.006], rot: [0, 0, Math.PI / 4], tint: 0xe8e0d0, grime: 0 });
  }
  if (open) k.blob('linen', 0.2, { pos: [0, h - 0.05, 0.02], scale: [w * 1.6, 0.4, 1.2], detail: 1, tint: 0xd8d0c0 });
  if (!o.indoor && !open) k.mound(w * 0.85, 0.07, d * 0.8, { pos: [0, h + d / 2 - 0.02, 0], jseed: 2 });
  k.pop();
  k.boxCollider(w / 2, d / 2, { h: h + d / 2 });
  k.ud.align = 0.1;
  return k.build();
}

export function rug(o = {}) {
  const k = new Kit('rug', Object.assign({ indoor: true }, o));
  const cell = o.cell != null ? o.cell : k.pick([0, 1, 2, 3, 5, 6, 7]);
  const w = (o.width || 1.7) + k.rs(0.2), d = (o.depth || 1.1) + k.rs(0.1);
  k.push({ yaw: o.yaw || 0 });
  k.plane('folk', w, d, {
    pos: [0, 0.014, 0], rot: [-Math.PI / 2, 0, 0], uvRect: folkRect(cell), sx: 12, sy: 8, tint: k.pick([0xffffff, 0xe8e0d8, 0xd8d0c8]), grime: 0, var: 0.05,
    bend: (x, y) => [0, 0, Math.sin(x * 7 + y * 3 + k.seed) * 0.006 + Math.pow(Math.abs(x) / (w / 2), 8) * 0.025 + Math.pow(Math.abs(y) / (d / 2), 8) * 0.02],
  });
  // Fringe tassels on both short ends.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const z = -d / 2 + 0.04 + (i / 13) * (d - 0.08);
      k.box('linen', 0.07, 0.004, 0.008, { pos: [sx * (w / 2 + 0.032), 0.012, z], rot: [0, k.rs(0.25), 0], tint: 0xd8d0c0, grime: 0 });
    }
  }
  k.pop();
  k.ud.align = 0.3;
  return k.build();
}

export function tapestry(o = {}) {
  const k = new Kit('tapestry', Object.assign({ indoor: true }, o));
  const cell = o.cell != null ? o.cell : k.pick([2, 6, 0, 7]);
  const w = (o.width || 0.95) + k.rs(0.1), h = (o.height || 1.4) + k.rs(0.1);
  k.push({ yaw: o.yaw || 0 });
  // Hangs on a rod, wall at z = 0.
  k.cyl('wood', 0.02, 0.02, w + 0.2, { pos: [0, h + 0.02, 0.04], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0x7a6a58, cap: 'wood' });
  for (const sx of [-1, 1]) k.sph('wood', 0.03, { pos: [sx * (w / 2 + 0.1), h + 0.02, 0.04], tint: 0x6a5a48, ws: 6, hs: 5 });
  k.plane('folk', w, h, { pos: [0, h / 2, 0.045], uvRect: folkRect(cell), sx: 10, sy: 12, tint: 0xffffff, grime: 0, var: 0.04, bend: (x, y) => [0, 0, Math.sin(y * 5 + x * 3 + k.seed) * 0.012 * (1 - (y + h / 2) / h * 0.5)] });
  // Fringe along the bottom edge and a cord loop.
  for (let i = 0; i < 18; i++) k.box('linen', 0.01, 0.07, 0.004, { pos: [-w / 2 + 0.03 + (i / 17) * (w - 0.06), -0.03, 0.045], tint: 0xd8d0c0, grime: 0 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function pot(o = {}) {
  const k = new Kit('pot', o);
  const variant = o.variant || k.pick(['ground', 'ground', 'lidded']);
  const r = 0.2 + k.rs(0.03);
  k.push({ yaw: k.r(0, TAU) });
  const body = [[0.001, 0.0], [r * 0.7, 0.01], [r * 1.0, 0.1], [r * 1.05, 0.2], [r * 0.9, 0.3], [r * 0.82, 0.32], [r * 0.9, 0.335]];
  k.lathe('iron', body, { radial: 12, tint: 0x9a9aa0, uRepeat: 2, noUOffset: false });
  if (variant === 'lidded') {
    k.cyl('iron', r * 0.84, r * 0.84, 0.02, { pos: [0, 0.34, 0], radial: 12, tint: 0x8a8a90 });
    k.sph('iron', 0.025, { pos: [0, 0.37, 0], tint: 0x6a6a70 });
  } else {
    const fill = k.pick(['ice', 'dark', 'stew']);
    const c = fill === 'ice' ? 0xd0e6f2 : fill === 'dark' ? 0x1a1612 : 0x5a3a24;
    k.cyl(fill === 'ice' ? 'ice' : 'matte', r * 0.82, r * 0.82, 0.01, { pos: [0, 0.27, 0], radial: 12, tint: c, grime: 0 });
  }
  // Handle (bail) and three stubby legs
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([Math.cos(a) * r * 0.9, 0.33 + Math.sin(a) * 0.17, 0]); }
  k.tube('iron', pts, 0.008, { radial: 4, tint: 0x4a4a4e });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    k.cyl('iron', 0.012, 0.016, 0.06, { pos: [Math.cos(a) * r * 0.55, 0.02, Math.sin(a) * r * 0.55], radial: 4, tint: 0x4a4a4e, cap: null });
  }
  if (!o.indoor) k.mound(r * 1.4, 0.04, r * 1.4, { pos: [0, variant === 'lidded' ? 0.35 : 0.33, 0], jseed: 2 });
  k.pop();
  k.circleCollider(r * 1.05, { h: 0.35 });
  k.ud.align = 0.3;
  return k.build();
}

// Cauldron on a tripod over a fire (cooking spot). fire: false for a cold one.
export function cauldron(o = {}) {
  const k = new Kit('cauldron', o);
  const fire = o.fire !== false;
  k.push({ yaw: k.r(0, TAU) });
  k.anchor('stir', 0, 0.0, 0.85);
  // Tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
    k.cyl('wood', 0.03, 0.04, 1.55, { pos: [x * 0.52, 0.76, z * 0.52], rot: [Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38], radial: 6, tint: 0x7a6a5a, jitter: 0.004, cap: 'logEnd' });
  }
  // Chain and cauldron
  k.tube('iron', [[0, 1.46, 0], [0, 1.2, 0], [0, 1.0, 0]], 0.012, { radial: 4, tint: 0x3a3a3e, tile: 0.1 });
  const r = 0.3;
  k.lathe('iron', [[0.001, 0.0], [r * 0.6, 0.01], [r * 0.98, 0.12], [r, 0.26], [r * 0.85, 0.36], [r * 0.9, 0.375]], { pos: [0, 0.62, 0], radial: 14, tint: 0x8a8a92, uRepeat: 2 });
  k.cyl('matte', r * 0.84, r * 0.84, 0.01, { pos: [0, 0.96, 0], radial: 12, tint: 0x3a2a1c, grime: 0 });
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([Math.cos(a) * r * 0.9, 0.99 + Math.sin(a) * 0.13, 0]); }
  k.tube('iron', pts, 0.01, { radial: 4, tint: 0x3a3a3e });
  // Stones and logs under it
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + k.rs(0.2);
    k.blob('stone', 0.1, { pos: [Math.cos(a) * 0.38, 0.05, Math.sin(a) * 0.38], scale: [1.2, 0.8, 1], detail: 1, tint: k.pick([0xffffff, 0xd8d8d8, 0xb8b8c0]) });
  }
  k.plane('decal', 2.4, 2.4, { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x6a5a4c, grime: 0 });
  if (fire) {
    for (let i = 0; i < 3; i++) k.log(0.04, 0.5, { lie: 'x', pos: [0, 0.07 + i * 0.03, 0], yaw: i * 1.05, radial: 6, tint: 0x3a3430, nosnow: true });
    k.cyl('coal', 0.14, 0.18, 0.04, { pos: [0, 0.06, 0], radial: 8, tint: 0xffffff, grime: 0 });
    k.anchor('fire', 0, 0.1, 0);
    k.fx('fire', [0, 0.1, 0], { scale: 0.85, radius: 0.2, height: 0.5, light: true, smoke: false });
  }
  k.pop();
  k.circleCollider(0.7, { h: 0.9 });
  k.ud.align = 0;
  return k.build();
}

export function washTub(o = {}) {
  const k = new Kit('washTub', o);
  const r = 0.34, h = 0.32;
  k.push({ yaw: k.r(0, TAU) });
  const wood = k.pick(WOOD);
  k.lathe('planks', [[r * 0.92, 0], [r, h * 0.5], [r * 1.04, h]], { radial: 14, flat: true, uRepeat: 4, tint: wood });
  k.lathe('planks', [[r * 1.04 - 0.014, h], [r - 0.014, h * 0.5], [r * 0.92 - 0.014, 0.02]], { radial: 14, flat: true, uRepeat: 4, tint: 0x4a3e34, grime: 0 });
  k.cyl('planks', r * 0.9, r * 0.9, 0.02, { pos: [0, 0.03, 0], radial: 12, tint: 0x4a3e34 });
  for (const y of [0.06, h - 0.06]) k.cyl('iron', r + 0.012 + y * 0.12, r + 0.012 + y * 0.12, 0.028, { pos: [0, y, 0], radial: 14, open: true, tint: 0x4c4844 });
  k.cyl('ice', r * 0.97, r * 0.97, 0.01, { pos: [0, h - 0.07, 0], radial: 12, tint: 0xd0e6f2, grime: 0 });
  // Frozen-in shirt corner and a washboard leaning on the rim.
  k.blob('linen', 0.11, { pos: [0.1, h - 0.06, 0.05], scale: [1.5, 0.3, 1], detail: 1, tint: 0xd8d4c8 });
  k.box('wood', 0.26, 0.5, 0.025, { pos: [-r + 0.02, 0.28, 0], rot: [0, 0, -0.5], tint: 0xb8a690 });
  for (let i = 0; i < 6; i++) k.box('iron', 0.2, 0.012, 0.006, { pos: [-r + 0.02 + 0.01 * i, 0.2 + i * 0.045 - 0.05, 0.016], rot: [0, 0, -0.5], tint: 0x6a6a70, grime: 0 });
  if (!o.indoor) k.mound(0.5, 0.03, 0.2, { pos: [-r + 0.02, 0.5, 0], jseed: 2 });
  k.pop();
  k.circleCollider(r + 0.1, { h });
  k.ud.align = 0.4;
  return k.build();
}

export function musicBox(o = {}) {
  const k = new Kit('musicBox', Object.assign({ indoor: true }, o));
  const open = o.open != null ? o.open : true;
  k.push({ yaw: o.yaw || 0 });
  const w = 0.16, d = 0.11, h = 0.07;
  // Pale-grained walnut: the 'face' material is a light base that takes warm tints well.
  k.box('face', w, h, d, { pos: [0, h / 2, 0], tint: 0x9a7448, jitter: 0.0008, grime: 0.2, tile: 0.2 });
  k.box('paint', w + 0.002, 0.012, d + 0.002, { pos: [0, h * 0.5, 0], tint: FOLK_RED, grime: 0, tile: 0.2 });
  // Brass corner caps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('iron', 0.012, 0.012, 0.012, { pos: [sx * (w / 2 - 0.004), 0.004, sz * (d / 2 - 0.004)], tint: 0xc8a050, grime: 0 });
  // Lid (open: tilted back) with a folk-pattern inlay.
  k.with({ pos: [0, h, -d / 2], rot: [open ? -1.9 : 0, 0, 0] }, () => {
    k.box('face', w, 0.014, d, { pos: [0, 0.007, d / 2], tint: 0xa87c4c, jitter: 0.0008, tile: 0.2 });
    k.plane('folk', w * 0.7, d * 0.62, { pos: [0, 0.0155, d / 2], rot: [-Math.PI / 2, 0, 0], uvRect: folkRect(2), tint: 0xffffff, grime: 0, var: 0.02 });
  });
  if (open) {
    k.box('iron', w * 0.8, 0.004, 0.03, { pos: [0, h + 0.002, 0.01], tint: 0xc8a050, grime: 0 });
    k.cyl('iron', 0.012, 0.012, w * 0.78, { pos: [0, h + 0.008, -0.02], rot: [0, 0, Math.PI / 2], radial: 8, tint: 0xd8b060, grime: 0, cap: null });
    for (let i = 0; i < 9; i++) k.box('iron', 0.0015, 0.004, 0.02, { pos: [-0.06 + i * 0.015, h + 0.005, 0.013], tint: 0xe0c070, grime: 0 });
  }
  k.cyl('iron', 0.003, 0.003, 0.03, { pos: [w / 2 + 0.015, 0.04, 0], rot: [0, 0, Math.PI / 2], radial: 4, tint: 0xc8a050, cap: null });
  k.box('iron', 0.004, 0.035, 0.004, { pos: [w / 2 + 0.03, 0.022, 0], tint: 0xc8a050, grime: 0 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function birdCarving(o = {}) {
  const k = new Kit('birdCarving', Object.assign({ indoor: true }, o));
  k.push({ yaw: o.yaw || 0 });
  const wood = 0xe6d6b2;
  // Little plinth, then a plump bird: body, head, beak, tail fan, wing grooves, painted breast.
  k.cyl('wood', 0.05, 0.06, 0.035, { pos: [0, 0.0175, 0], radial: 8, tint: 0x8a7458 });
  k.sph('face', 0.045, { pos: [0, 0.088, 0], scale: [0.9, 0.85, 1.35], ws: 10, hs: 8, tint: wood, tile: 0.2, grime: 0.1 });
  k.sph('face', 0.028, { pos: [0, 0.118, 0.055], tint: wood, ws: 8, hs: 6, tile: 0.2, grime: 0 });
  k.cone('face', 0.012, 0.03, { pos: [0, 0.115, 0.093], rot: [Math.PI / 2, 0, 0], radial: 5, tint: 0xc89850, tile: 0.2, grime: 0 });
  k.box('face', 0.06, 0.006, 0.07, { pos: [0, 0.083, -0.075], rot: [0.3, 0, 0], tint: wood, taper: [1.6, 1], tile: 0.2, grime: 0 });
  for (const sx of [-1, 1]) k.box('face', 0.008, 0.03, 0.07, { pos: [sx * 0.038, 0.093, -0.005], rot: [0.12, 0, sx * -0.22], tint: 0xd6c49c, tile: 0.2, grime: 0 });
  for (const sx of [-1, 1]) k.sph('matte', 0.005, { pos: [sx * 0.02, 0.124, 0.07], tint: 0x201a16, ws: 5, hs: 4, grime: 0 });
  k.sph('paint', 0.03, { pos: [0, 0.083, 0.03], scale: [1.1, 0.9, 0.55], tint: FOLK_RED, ws: 8, hs: 6, grime: 0, tile: 0.2 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

// A brass hand-bell about a fist across at the lip, hung by a cord. Origin at the lip, y up; the cord runs up and
// toward local +x, where the pole it is tied to stands. A rag is knotted round the clapper (o.rag = false: free).
export function handBell(o = {}) {
  const k = new Kit('handBell', Object.assign({ indoor: true }, o));
  k.push({ yaw: o.yaw || 0 });
  const brass = 0xd2a548, tarnish = 0x7f9c76, cord = 0xa8946f;
  k.lathe('iron', [[0.063, 0.0], [0.061, 0.008], [0.052, 0.04], [0.041, 0.08], [0.03, 0.112], [0.02, 0.13], [0.012, 0.14], [0.001, 0.146]], { radial: 14, tint: brass, grime: 0.35, var: 0.06 });
  k.cyl('iron', 0.0645, 0.0635, 0.016, { pos: [0, 0.008, 0], radial: 14, cap: null, tint: tarnish, grime: 0.2, var: 0.08 });
  k.torus('iron', 0.016, 0.004, { pos: [0, 0.158, 0], rot: [0, Math.PI / 2, 0], seg: 10, rseg: 5, tint: brass, grime: 0.3 });
  k.cyl('linen', 0.0045, 0.0045, 0.3, { pos: [0, 0.31, 0], radial: 5, cap: null, tint: cord });
  k.cyl('linen', 0.0045, 0.0045, 0.14, { pos: [0.07, 0.46, 0], rot: [0, 0, Math.PI / 2], radial: 5, cap: null, tint: cord });
  k.cyl('iron', 0.004, 0.004, 0.06, { pos: [0, -0.01, 0], radial: 5, cap: null, tint: 0x5a4a38 });
  k.sph('iron', 0.012, { pos: [0, -0.045, 0], ws: 6, hs: 5, tint: 0x5a4a38 });
  if (o.rag !== false) k.sph('linen', 0.022, { pos: [0, -0.04, 0], scale: [1, 1.2, 1], ws: 7, hs: 5, tint: 0xcfc2a8, var: 0.1 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

// Cluster of broken or forgotten toys: wooden horse on a stick, rag doll, top.
export function toys(o = {}) {
  const k = new Kit('toys', o);
  k.push({ yaw: k.r(0, TAU) });
  // Horse on a stick (head snapped off and lying beside it).
  k.cyl('wood', 0.012, 0.012, 0.55, { pos: [0, 0.22, 0], rot: [0.9, 0, 0.1], radial: 5, tint: 0xb8a088, cap: null });
  const hh = new THREE.Shape();
  hh.moveTo(0, 0); hh.lineTo(0.09, 0.02); hh.lineTo(0.12, 0.1); hh.lineTo(0.17, 0.16); hh.lineTo(0.14, 0.2); hh.lineTo(0.07, 0.18); hh.lineTo(0.02, 0.24); hh.lineTo(-0.02, 0.1); hh.closePath();
  k.extrude('wood', hh, 0.025, { pos: [0.28, 0.02, 0.08], rot: [-Math.PI / 2, 0, 0.8], tint: 0xc4ae98 });
  // Rag doll face down
  k.cyl('linen', 0.035, 0.04, 0.2, { pos: [-0.25, 0.03, -0.1], rot: [0, 0, Math.PI / 2], radial: 7, tint: 0xd8c8b0, cap: 'linen' });
  k.sph('linen', 0.04, { pos: [-0.38, 0.04, -0.1], tint: 0xe0d4c0, ws: 8, hs: 6 });
  k.cyl('paint', 0.04, 0.045, 0.1, { pos: [-0.25, 0.03, -0.1], rot: [0, 0, Math.PI / 2], radial: 7, tint: FOLK_RED, cap: null });
  // Top and a stone marble
  k.lathe('wood', [[0.001, 0], [0.03, 0.02], [0.04, 0.05], [0.025, 0.08], [0.005, 0.1]], { pos: [0.05, 0.0, -0.3], rot: [0, 0, 1.4], radial: 8, tint: 0xa88a6a });
  k.sph('stone', 0.012, { pos: [-0.1, 0.012, 0.25], tint: 0xe0d8c8, ws: 6, hs: 5 });
  if (!o.indoor) k.mound(0.5, 0.025, 0.4, { pos: [0.0, 0.02, 0.0], jseed: 3 });
  k.pop();
  k.ud.align = 0.8;
  return k.build();
}

export function snowman(o = {}) {
  const k = new Kit('snowman', o);
  const melt = o.melt != null ? o.melt : 0.5;
  k.push({ yaw: k.r(0, TAU), rot: [0, 0, 0.06 * (k.chance(0.5) ? 1 : -1)] });
  const lump = (r, y, sy, o2 = {}) => k.blob('snowMound', r, { pos: [0, y, 0], scale: [1, sy, 1], detail: 2, tint: 0xf4f6fa, grime: 0.05, var: 0.03, jitter: r * 0.12, ...o2 });
  // Snow blobs are drawn with the lit snow material (they do not shrink on the thaw: they ARE the melt).
  lump(0.42, 0.34, 0.8 - melt * 0.2);
  lump(0.3, 0.8 - melt * 0.08, 0.85, { pos: [0.02, 0.78 - melt * 0.08, 0.0] });
  lump(0.22, 1.13 - melt * 0.15, 0.9, { pos: [0.06 * melt * 2, 1.1 - melt * 0.13, 0.0] });
  // Coal eyes and mouth, carrot nose, stick arms, a battered pot as a hat.
  for (const sx of [-1, 1]) k.sph('coal', 0.022, { pos: [sx * 0.08 + 0.05 * melt * 2, 1.17 - melt * 0.14, 0.215], ws: 5, hs: 4, tint: 0x222222, grime: 0 });
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; k.sph('coal', 0.012, { pos: [0.05 * melt * 2 + Math.sin(a) * 0.1, 1.04 - melt * 0.14 + Math.cos(a * 1.6) * 0.03, 0.2 + Math.cos(a) * 0.015], ws: 4, hs: 3, tint: 0x222222, grime: 0 }); }
  k.cone('paint', 0.03, 0.24, { pos: [0.05 * melt * 2, 1.1 - melt * 0.14, 0.33], rot: [Math.PI / 2, 0, 0], radial: 6, tint: 0xc8662a, grime: 0 });
  // Red wool scarf with a hanging tail.
  k.torus('ribbon', 0.17, 0.035, { pos: [0.03 * melt * 2, 0.97 - melt * 0.1, 0], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 4, tint: 0x7a241a, grime: 0, var: 0.05 });
  k.hang('ribbon', 0.06, 0.32, { pos: [0.1, 0.96 - melt * 0.1, 0.17], rot: [0, 0.2, 0], tint: 0x6e2018, sway: 0.9, grime: 0, var: 0 });
  for (const sx of [-1, 1]) k.cyl('wood', 0.01, 0.014, 0.6, { pos: [sx * 0.42, 0.85 - melt * 0.1, 0.0], rot: [0, 0, sx * -(1.1 - melt * 0.4)], radial: 4, tint: 0x5a4a3a, cap: null });
  k.lathe('iron', [[0.001, 0.0], [0.1, 0.0], [0.115, 0.1], [0.1, 0.13]], { pos: [0.1 * melt * 2, 1.27 - melt * 0.17, 0], rot: [0, 0, 0.3 + melt * 0.3], radial: 8, tint: 0x6a6a70 });
  k.pop();
  k.circleCollider(0.4, { h: 1.2 });
  k.ud.align = 0.6;
  return k.build();
}

export function jug(o = {}) {
  const k = new Kit('jug', o);
  const tall = k.chance(0.5);
  const r = 0.09 + k.rs(0.01), h = tall ? 0.32 : 0.24;
  k.push({ yaw: k.r(0, TAU), rot: o.tipped ? [0, 0, 1.4] : [0, 0, 0], pos: o.tipped ? [0, r * 1.05, 0] : [0, 0, 0] });
  k.lathe('clay', [[0.001, 0], [r * 0.7, 0.004], [r * 1.05, h * 0.3], [r * 0.95, h * 0.62], [r * 0.5, h * 0.88], [r * 0.52, h], [r * 0.62, h + 0.02]], { radial: 11, tint: k.pick([0xffffff, 0xd8c0a8, 0xb89a80]), uRepeat: 2 });
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; pts.push([Math.sin(a) * 0.003 + r * 0.55 + Math.sin(a) * r * 0.45, h * 0.82 - (1 - Math.cos(a)) * h * 0.3, 0]); }
  k.tube('clay', pts, 0.012, { radial: 5, tint: 0xc8a888 });
  if (!o.indoor && !o.tipped) k.mound(r * 1.0, 0.025, r * 1.0, { pos: [0, h + 0.015, 0], jseed: 1 });
  k.pop();
  k.circleCollider(r * 1.1, { h });
  k.ud.align = 0.4;
  return k.build();
}

// Bundles of drying herbs hung from a rod (origin at the rod, bunches hang down).
export function herbs(o = {}) {
  const k = new Kit('herbs', Object.assign({ indoor: true }, o));
  const n = o.count || 6;
  const W = n * 0.16 + 0.1;
  k.push({ yaw: o.yaw || 0 });
  k.cyl('wood', 0.012, 0.012, W + 0.1, { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x8a7a68, cap: null });
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.1 + i * 0.16;
    const len = k.r(0.22, 0.4);
    k.tube('rope', [[x, 0, 0], [x, -0.07, 0]], 0.004, { radial: 3, tint: 0xb89c6c });
    k.cyl('matte', 0.01, 0.06, len, { pos: [x, -0.07 - len / 2, 0], radial: 7, tint: k.pick([0x5a6a44, 0x6a6a48, 0x7a7048, 0x4e5e3c, 0x6a4e34]), jitter: 0.012, cap: null, var: 0.25, grime: 0 });
    k.torus('rope', 0.022, 0.006, { pos: [x, -0.1, 0], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 6, rseg: 3 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}
