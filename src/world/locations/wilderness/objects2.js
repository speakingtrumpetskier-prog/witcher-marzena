// More custom story objects (see objects.js): cold fire, the watch's spear rack, a dice table, hide frames,
// the old hunter's remains, a miller's kennel chain, a grotto's bedding, kiln hatch, den bones.
import { TAU } from '../../props/kit.js';

// A cold fire pit: ring of stones, charred logs, ash gone grey under a skin of snow.
export function coldFire(k, o = {}) {
  const r = o.r || 0.55;
  k.push({ yaw: o.yaw || 0 });
  k.plane('decal', r * 5.0, r * 5.0, { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x6a5a4c, grime: 0, var: 0.1 });
  k.plane('decal', r * 2.8, r * 2.8, { pos: [0, 0.034, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x34312e, grime: 0, var: 0.2, jseed: 3 });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k.rs(0.12), sr = k.r(0.09, 0.15);
    k.blob('stone', sr, { pos: [Math.cos(a) * r, sr * 0.45, Math.sin(a) * r], scale: [1.1, 0.75, 1], tint: k.pick([0xffffff, 0xd8d8d8, 0xb8b8c0, 0xe8e0d8]), detail: 1 });
    if (k.chance(0.6)) k.mound(sr * 1.6, 0.04, sr * 1.6, { pos: [Math.cos(a) * r, sr * 0.78, Math.sin(a) * r], jseed: i });
  }
  for (let i = 0; i < 3; i++) k.log(0.055, 0.8 + k.rs(0.1), { lie: 'x', pos: [0, 0.07 + i * 0.03, 0], yaw: (i / 3) * Math.PI + k.rs(0.3), rot: [0, 0, k.rs(0.15)], radial: 6, tint: 0x3a3430, nosnow: true });
  k.mound(r * 1.4, 0.05, r * 1.4, { pos: [0.05, 0.1, -0.05], jseed: 5 });
  k.pop();
}

// A rack of spears leaning on a crossbar (the soldiers' watch), one head snapped, a rag banner.
export function spearRack(k, o = {}) {
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) k.cyl('wood', 0.04, 0.05, 1.3, { pos: [sx * 0.7, 0.62, 0], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
  k.cyl('wood', 0.03, 0.03, 1.6, { pos: [0, 1.25, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
  for (let i = 0; i < 4; i++) {
    const x = -0.45 + i * 0.3;
    k.cyl('wood', 0.018, 0.022, 2.1, { pos: [x, 0.95, 0.32], rot: [-0.3, 0, k.rs(0.05)], radial: 5, tint: 0xa89684, cap: null });
    if (i !== 2) k.cone('iron', 0.032, 0.2, { pos: [x, 1.95, -0.3], rot: [-0.3, 0, 0], radial: 4, tint: 0x6a6a70, grime: 0 });
  }
  k.hang('cloth', 0.34, 0.55, { pos: [0, 1.25, 0.04], tint: 0x6a3c32, sway: 0.9, wave: 0.05 });
  k.mound(1.2, 0.2, 0.8, { pos: [0, 0, 0.2], jseed: 3 });
  k.pop();
}

// Dice on a flat stone with a bone cup: Kazimierz's game.
export function diceTable(k, o = {}) {
  k.push({ yaw: o.yaw || 0 });
  k.blob('stone', 0.5, { pos: [0, 0.2, 0], scale: [1.3, 0.55, 1.0], detail: 1, tint: 0xa8a29a, flat: true, jitter: 0.04 });
  for (let i = 0; i < 3; i++) k.box('paint', 0.035, 0.035, 0.035, { pos: [-0.1 + i * 0.1, 0.41, 0.05 + (i % 2) * 0.08], rot: [0, k.r(0, TAU), 0], tint: 0xe6dcc0, grime: 0, var: 0.05 });
  k.cyl('face', 0.06, 0.05, 0.1, { pos: [0.28, 0.45, -0.1], rot: [0, 0, 1.2], radial: 8, tint: 0xd0c6aa, cap: null, grime: 0 });
  k.mound(0.5, 0.05, 0.4, { pos: [-0.2, 0.4, -0.1], jseed: 2 });
  k.pop();
}

// An old hunter's remains: a skeleton slumped against rock in the tatters of a Lynx coat, skull tilted,
// ribcage showing through, boots on. Origin at his seat, he faces +z. The silver sword lies by his hand
// (see objects.silverSword). Bones use the pale 'face' material.
export function huntersRemains(k, o = {}) {
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  const bone = 0xe4dcc8, bone2 = 0xcfc6b0;
  const cloth = 0x3a4452;
  const B = (pts, r, tint = bone) => k.tube('face', pts, r, { radial: 5, tint, grime: 0.05, tile: 0.2 });
  // pelvis and spine
  k.box('face', 0.28, 0.08, 0.16, { pos: [0, 0.14, -0.02], tint: bone2, grime: 0.1, tile: 0.2 });
  B([[0, 0.16, -0.06], [0, 0.4, -0.12], [0.0, 0.62, -0.1], [0.02, 0.8, -0.04]], 0.022, bone2);
  // ribcage: curved ribs round the spine, slumped forward
  for (let i = 0; i < 7; i++) {
    const y = 0.3 + i * 0.065, r = 0.17 - Math.abs(i - 3) * 0.012;
    for (const sx of [-1, 1]) B([[0, y, -0.1 + i * 0.006], [sx * r, y - 0.02, 0.0 + i * 0.01], [sx * r * 0.7, y - 0.05, 0.14 + i * 0.012], [sx * 0.03, y - 0.07, 0.17 + i * 0.012]], 0.009);
  }
  B([[0, 0.34, 0.2], [0, 0.55, 0.22], [0, 0.66, 0.2]], 0.014); // sternum
  // legs: femurs forward, shins down, boots
  for (const sx of [-1, 1]) {
    B([[sx * 0.12, 0.16, 0.0], [sx * 0.13, 0.3, 0.3], [sx * 0.13, 0.36, 0.48]], 0.026);
    B([[sx * 0.13, 0.36, 0.48], [sx * 0.14, 0.2, 0.62], [sx * 0.14, 0.09, 0.72]], 0.02);
    k.box('wood', 0.14, 0.12, 0.34, { pos: [sx * 0.14, 0.07, 0.86], rot: [0.12, sx * 0.14, 0], tint: 0x34281e, grime: 0.2 });
    k.cyl('wood', 0.07, 0.065, 0.2, { pos: [sx * 0.14, 0.2, 0.7], rot: [0.5, 0, 0], radial: 7, tint: 0x3a2e22, grime: 0.2 });
  }
  // arms: one in the lap, one fallen beside the sword
  B([[0.17, 0.8, -0.02], [0.27, 0.62, 0.08], [0.3, 0.45, 0.28]], 0.02);
  B([[0.3, 0.45, 0.28], [0.3, 0.3, 0.46], [0.27, 0.22, 0.58]], 0.016);
  for (let i = 0; i < 4; i++) B([[0.27, 0.22, 0.58], [0.26 + i * 0.015, 0.18, 0.7 + i * 0.01]], 0.007, bone2);
  B([[-0.17, 0.8, -0.02], [-0.3, 0.55, 0.06], [-0.44, 0.26, 0.2]], 0.02);
  B([[-0.44, 0.26, 0.2], [-0.52, 0.1, 0.4]], 0.015);
  for (let i = 0; i < 4; i++) B([[-0.52, 0.1, 0.4], [-0.55 - i * 0.012, 0.05, 0.5 + i * 0.015]], 0.007, bone2);
  // clavicles and the skull, tilted down and to one side, jaw dropped
  B([[-0.18, 0.82, 0.0], [0, 0.86, 0.04], [0.18, 0.82, 0.0]], 0.012);
  k.sph('face', 0.105, { pos: [0.03, 0.98, 0.12], scale: [0.88, 1.05, 1.0], tint: bone, grime: 0.05, ws: 10, hs: 8, rot: [0.45, 0.35, 0.2], tile: 0.2 });
  k.box('face', 0.085, 0.045, 0.08, { pos: [0.04, 0.9, 0.2], rot: [0.5, 0.2, 0.1], tint: bone2, grime: 0.05, tile: 0.2 });
  for (const sx of [-1, 1]) k.sph('matte', 0.026, { pos: [0.04 + sx * 0.04, 1.0, 0.21], tint: 0x12100e, grime: 0, var: 0, ws: 6, hs: 4 });
  // the coat: a torn mantle of sheepskin on the shoulders, tatters of the blue-grey wool hanging and in the lap
  k.blob('fur', 0.2, { pos: [0, 0.8, -0.04], scale: [1.35, 0.4, 1.0], detail: 1, tint: 0x8a7e70, jitter: 0.03 });
  k.hang('cloth', 0.34, 0.6, { pos: [-0.2, 0.78, 0.08], tint: cloth, sway: 0.2, wave: 0.05, sy: 5 });
  k.hang('cloth', 0.3, 0.5, { pos: [0.2, 0.76, 0.08], tint: cloth, sway: 0.2, wave: 0.05, sy: 5 });
  k.hang('cloth', 0.5, 0.7, { pos: [0, 0.84, -0.2], tint: 0x323a46, sway: 0.15, wave: 0.07, sy: 6 });
  k.blob('cloth', 0.22, { pos: [0.02, 0.2, 0.34], scale: [1.4, 0.3, 1.2], detail: 1, tint: cloth, jitter: 0.03, grime: 0.3 });
  // belt, pouch, scabbard, the lynx medallion on its chain in the ribs
  k.torus('wood', 0.17, 0.02, { pos: [0, 0.22, 0.02], rot: [Math.PI / 2, 0, 0], seg: 10, rseg: 3, tint: 0x3a2a1e, grime: 0.1, scale: [1, 0.85, 1] });
  k.box('wood', 0.12, 0.1, 0.07, { pos: [0.26, 0.2, 0.2], tint: 0x4a3a2a, grime: 0.2 });
  k.cyl('wood', 0.025, 0.02, 0.9, { pos: [-0.3, 0.12, 0.45], rot: [Math.PI / 2, 0, 0.15], radial: 5, tint: 0x2e2218, cap: null });
  k.tube('iron', [[0.0, 0.84, 0.06], [0.01, 0.7, 0.2], [0.0, 0.58, 0.24]], 0.005, { radial: 3, tint: 0x9a9a9a, grime: 0 });
  k.cyl('iron', 0.032, 0.032, 0.008, { pos: [0.0, 0.56, 0.25], rot: [Math.PI / 2, 0, 0], radial: 8, tint: 0xb0a070, grime: 0, cap: 'iron' });
  k.mound(0.5, 0.1, 0.4, { pos: [-0.15, 0.96, -0.1], jseed: 3 });
  k.mound(0.9, 0.06, 0.6, { pos: [0.0, 0.0, 0.5], jseed: 5 });
  k.pop();
}

// Hide stretched on a lashed frame, as a dark wolf pelt (uses the fur material).
export function wolfPelt(k, o = {}) {
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  const w = 0.8, h = 1.1;
  // frame
  for (const sx of [-1, 1]) k.cyl('wood', 0.025, 0.03, h + 0.4, { pos: [sx * (w / 2 + 0.06), (h + 0.4) / 2, 0], rot: [0, 0, sx * -0.04], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
  k.cyl('wood', 0.025, 0.025, w + 0.2, { pos: [0, 0.2, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
  k.cyl('wood', 0.025, 0.025, w + 0.2, { pos: [0, h + 0.3, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
  // the pelt: a long diamond with legs and a tail, laced to the frame
  k.blob('fur', 0.5, { pos: [0, h / 2 + 0.25, 0], scale: [0.78, 1.05, 0.06], detail: 1, tint: o.tint || 0x5a5248, jitter: 0.03 });
  for (const sx of [-1, 1]) for (const y of [0.45, 1.05]) k.blob('fur', 0.16, { pos: [sx * 0.34, y, 0], scale: [0.8, 1.2, 0.2], detail: 0, tint: o.tint || 0x5a5248, jitter: 0.02 });
  k.tube('fur', [[0, 0.3, 0], [0.04, 0.1, 0.02], [0.02, 0.0, 0.03]], 0.06, { radial: 5, tint: 0x4a443c });
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    k.tube('rope', [[-w / 2 - 0.04 + t * 0.0, 0.3 + t * (h - 0.1), 0], [-0.3, 0.3 + t * (h - 0.1), 0.01]], 0.006, { radial: 3, tint: 0x8a7a62, grime: 0 });
  }
  k.mound(w + 0.4, 0.05, 0.12, { pos: [0, h + 0.34, 0], jseed: 4 });
  k.pop();
}

// A kennel's broken chain and an empty bowl (the miller's dog is gone).
export function brokenChain(k, o = {}) {
  k.push({ yaw: o.yaw || 0 });
  k.cyl('wood', 0.03, 0.04, 0.5, { pos: [0, 0.2, 0], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
  k.tube('iron', [[0, 0.3, 0], [0.4, 0.04, 0.1], [0.9, 0.02, -0.1], [1.3, 0.03, 0.15]], 0.01, { radial: 4, tint: 0x4a4540, grime: 0 });
  k.cyl('clay', 0.1, 0.07, 0.07, { pos: [1.6, 0.04, 0.1], rot: [0.0, 0, 0.1], radial: 8, tint: 0xb8a088, cap: 'clay' });
  k.mound(0.3, 0.06, 0.3, { pos: [1.6, 0.06, 0.1], jseed: 2 });
  k.pop();
}

// Bedding of trampled boughs and fur (the bear's, the wolves').
export function bedding(k, o = {}) {
  const r = o.r || 1.4;
  k.push({ yaw: o.yaw || 0 });
  for (let i = 0; i < 24; i++) {
    const a = k.r(0, TAU), d = Math.sqrt(k.r(0, 1)) * r;
    k.cyl('bark', 0.025, 0.03, k.r(0.5, 1.1), { pos: [Math.cos(a) * d, 0.06 + k.r(0, 0.1), Math.sin(a) * d], rot: [Math.PI / 2, 0, 0], yaw: k.r(0, TAU), radial: 4, tint: k.pick([0x4a463a, 0x5a5646, 0x3e3a30]), cap: null });
  }
  k.blob('fur', r * 0.4, { pos: [0.1, 0.1, 0.0], scale: [1.5, 0.3, 1.1], detail: 1, tint: 0x4e4036, jitter: 0.05 });
  k.pop();
}

// A shed antler, a gnawed leg bone and a scatter of small bones (the den's floor).
export function denBones(k, o = {}) {
  const n = o.n || 8;
  k.push({ yaw: o.yaw || 0 });
  for (let i = 0; i < n; i++) {
    const a = k.r(0, TAU), d = k.r(0.1, o.r || 1.2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const L = k.r(0.18, 0.5);
    k.cyl('face', 0.018, 0.018, L, { pos: [x, 0.03, z], rot: [Math.PI / 2, 0, 0], yaw: k.r(0, TAU), radial: 5, tint: 0xd0c8b4, cap: 'face', grime: 0.1 });
    k.sph('face', 0.03, { pos: [x + Math.cos(a) * L * 0.5, 0.035, z + Math.sin(a) * L * 0.5], tint: 0xd0c8b4, grime: 0, ws: 6, hs: 4 });
  }
  k.pop();
}
