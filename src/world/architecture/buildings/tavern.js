// The Drowned Bell: the village tavern. Big log hall, deep porch with benches, a hanging sign with
// a bell, a stone fireplace and a warm, crowded interior. Enterable.
//   anchors: door, porch, sign, hearth, bar, keeper, table1..table4, smoke, chimney, barTop and tableTop2 (the counter
//   and the middle table at table height: where the dice are played, src/minigames/dice/sites.js)
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { hangingSign, bellObject } from '../details.js';
import { bellShape } from '../carve.js';
import { table, bench, stool, barrel, shelf, fireplace, rug, lantern, chest, sack } from '../furnish.js';

export function tavern(opts = {}) {
  const kit = new Kit(opts.seed ?? 5, 'tavern');
  const w = 8.8, d = 11.2, r = 0.2;
  const windows = [];
  for (const s of [-2.9, 2.9]) windows.push({ wall: 'front', s, y: 1.1, w: 0.95, h: 1.0, shutters: 'blue' });
  for (const wall of ['left', 'right']) for (const s of [-3.4, -0.4, 2.6]) windows.push({ wall, s, y: 1.1, w: 0.95, h: 1.0, shutters: wall === 'left' ? 'red' : 'blue', lit: kit.chance(0.9) });
  for (const s of [-2.6, 2.6]) windows.push({ wall: 'back', s, y: 1.1, w: 0.9, h: 1.0, shutters: 'blue' });
  const spec = {
    w, d, courses: 10, storeys: 1, interior: true, ceiling: true, pitch: 0.8, snow: 0.3, paint: PAL.red, shutters: 'blue',
    doors: [
      { wall: 'front', s: 0, w: 1.3, h: 2.1, leaf: 'object', id: 'front', openState: opts.open ?? 0.55, hingeLeft: true },
      { wall: 'back', s: -2.6, w: 1.1, h: 1.95, leaf: 'object', id: 'back', hingeLeft: false },
    ],
    windows,
    chimney: { wall: 'back', s: -2.0, w: 2.0, d: 1.1 },
    porch: { wall: 'front', s: 0, w: 5.6, depth: 2.3, benches: true, doorS: 0, paint: PAL.red, hHigh: 3.5, hLow: 2.55, steps: true },
    leanTo: { wall: 'right', s: 2.4, len: 4.0, depth: 1.7, wood: true, hHigh: 2.6, hLow: 2.0 },
    gable: 'planks',
  };
  const info = cabin(kit, spec);
  const hw = info.hw, hd = info.hd;
  const fy = 0.05;

  // ---- hanging sign with a bell, at the front-left corner of the porch ----
  const sx = -hw - 0.3, sz = hd + 1.2;
  kit.frame(sx, 2.9, sz, -Math.PI / 2, () => {
    hangingSign(kit, 0, 0, 0, 0, { w: 0.8, h: 0.62, col: PAL.plankDark });
    // Painted bell emblem on both faces of the board.
    kit.wood.at(0.62, -0.4, 0.03, 0, (m) => {
      m.extrude(bellShape(1.0), 0.012, scaleC(PAL.bronze, GAIN * 1.2), { uv: [1, 1] });
    });
    kit.wood.at(0.62, -0.4, -0.04, Math.PI, (m) => {
      m.extrude(bellShape(1.0), 0.012, scaleC(PAL.bronze, GAIN * 1.2), { uv: [1, 1] });
    });
  });
  // The wall bracket post for the sign.
  kit.wood.tube([sx - 0.05, 0.0, sz - 1.2 + 0.2], [sx - 0.05, 3.0, sz - 1.2 + 0.2], 0.08, 0.07, scaleC(PAL.logDark, GAIN * 1.3), { seg: 6, lenSeg: 2, ao: 0.2 });
  void bellObject;
  kit.anchor('sign', sx, 2.4, sz + 0.6);

  // ---- interior ----
  kit.indoor(true);
  const y = fy;
  // Fireplace on the back wall, under the chimney (back-wall s = -2.0 is local x = +2.0).
  fireplace(kit, 2.0, y, -hd + r * 0.9, 0, { w: 2.5, d: 1.0, h: 2.8, name: 'hearth' });
  kit.box(2.0, -hd + r + 0.5, 1.25, 0.55, 0);
  rug(kit, 2.0, y, -hd + 2.3, 0, 2.2, 1.6, PAL.red);
  // Bar: counter along the back-left, barrels and shelves behind it.
  const bx = -2.3, bz = -3.5;
  kit.frame(bx, y, bz, 0, () => {
    const c = mixC(PAL.plank, PAL.plankDark, 0.3).multiplyScalar(GAIN);
    kit.wood.box(0, 0.54, 0, 3.8, 1.04, 0.7, c, { grain: 'x', top: scaleC(c, 1.1) });
    kit.wood.box(0, 1.08, 0.02, 3.95, 0.07, 0.86, scaleC(c, 1.12), { grain: 'x' });
    // Tap and mugs.
    kit.wood.tube([-1.0, 1.12, 0], [-1.0, 1.4, 0], 0.03, 0.03, scaleC(PAL.iron, GAIN * 0.8), { seg: 6, lenSeg: 1, ao: 0 });
    for (let i = 0; i < 4; i++) kit.wood.tube([-0.3 + i * 0.28, 1.12, 0.1], [-0.3 + i * 0.28, 1.25, 0.1], 0.05, 0.045, scaleC(PAL.plankDark, GAIN * 1.2), { seg: 7, lenSeg: 1, ao: 0.2 });
  });
  kit.box(bx, bz, 1.95, 0.4, 0);
  for (let i = 0; i < 4; i++) { stool(kit, bx - 1.5 + i * 1.0, y, bz + 1.0, kit.rs() * 0.3, 0.7, 0.2); }
  barrel(kit, -3.7, y, -hd + 0.7, 1.0, 0.4); kit.circle(-3.7, -hd + 0.7, 0.4);
  barrel(kit, -2.9, y, -hd + 0.65, 1.0, 0.4); kit.circle(-2.9, -hd + 0.65, 0.4);
  barrel(kit, -2.1, y, -hd + 0.65, 0.9, 0.37); kit.circle(-2.1, -hd + 0.65, 0.37);
  shelf(kit, -0.8, y + 0.6, -hd + 0.45, 0, 1.4, 3, 0.4);
  shelf(kit, -3.4, y + 1.2, -hd + 0.4, 0, 1.2, 2, 0.4);
  // Tables with benches.
  const tbl = [[-2.6, 0.6, 0.05], [0.6, 0.7, -0.03], [-1.8, 3.3, 0.04], [2.2, 3.0, 0]];
  tbl.forEach(([tx, tz, ya], i) => {
    table(kit, tx, y, tz, ya, 2.3, 0.9);
    kit.box(tx, tz, 1.15, 0.45, ya);
    bench(kit, tx, y, tz - 0.78, ya, 2.2);
    bench(kit, tx, y, tz + 0.78, ya, 2.2);
    kit.anchor(`table${i + 1}`, tx, y, tz);
  });
  // Corner clutter.
  chest(kit, hw - 0.75, y, 1.8, Math.PI / 2, 1.0, 0.55, 0.55); kit.box(hw - 0.75, 1.8, 0.28, 0.5, Math.PI / 2);
  sack(kit, hw - 0.7, y, 2.7, 0.3, 1.1); sack(kit, hw - 0.75, y, 3.1, 1.2, 0.9);
  // Wagon-wheel chandelier on the ceiling beams.
  const cy = 3.0;
  kit.wood.tube([0, 3.35, 0.5], [0, cy + 0.06, 0.5], 0.015, 0.015, scaleC(PAL.iron, GAIN * 0.7), { seg: 4, lenSeg: 1, ao: 0 });
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    kit.wood.tube([Math.cos(a0) * 0.75, cy, 0.5 + Math.sin(a0) * 0.75], [Math.cos(a1) * 0.75, cy, 0.5 + Math.sin(a1) * 0.75], 0.03, 0.03, scaleC(PAL.logDark, GAIN * 1.2), { seg: 5, lenSeg: 1, ao: 0 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.glow.box(Math.cos(a) * 0.75, cy + 0.1, 0.5 + Math.sin(a) * 0.75, 0.05, 0.12, 0.05, new THREE.Color(1, 0.85, 0.6), { uv: [40, 40], uo: 0.5, vo: 0.5 });
  }
  kit.light(0, cy, 0.5, { color: 0xffb060, intensity: 1.3, radius: 10, kind: 'lantern' });
  lantern(kit, -hw + 0.5, 2.3, 1.5, { intensity: 0.9 });
  lantern(kit, hw - 0.5, 2.3, -1.5, { intensity: 0.9 });
  kit.indoor(false);
  // Anchors for NPC placement.
  kit.anchor('bar', bx, y, bz + 0.8);
  kit.anchor('keeper', bx + 0.4, y, bz - 0.7);
  kit.anchor('barTop', bx, y + 1.115, bz);
  kit.anchor('tableTop2', tbl[1][0], y + 0.78, tbl[1][1]);
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  kit.anchor('doorInside', 0, y, hd - 1.2);
  return kit.finish({ info });
}
