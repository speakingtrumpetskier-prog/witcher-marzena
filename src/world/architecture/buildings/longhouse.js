// The reeve's hall: the largest building in the valley. A long log hall with a deep carved porch,
// horse-head posts, banners and a soaring interior with a central fire pit, a private room with a
// stove and a ledger desk, and a stone cellar reached by stairs (the Reeve's Ledger side quest).
//   anchors: door, porch, hearth (fire pit), stove, ledger (cellar desk), cellarDoor, chair, smoke, chimney
//   walk.floors: ground floor and the cellar floor; walk.ramps: the cellar stairs
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { stairs } from '../details.js';
import { horseHeadShape } from '../carve.js';
import { table, bench, stool, barrel, sack, chest, shelf, rug, stove, lantern, bed } from '../furnish.js';

export function longhouse(opts = {}) {
  const kit = new Kit(opts.seed ?? 9, 'longhouse');
  const w = 10.4, d = 14.6, r = 0.21;
  const withCellar = opts.cellar !== false;
  const stairHole = { x0: -4.85, x1: -3.65, z0: -6.9, z1: -2.45 };
  const windows = [];
  for (const s of [-3.4, 3.4]) windows.push({ wall: 'front', s, y: 1.2, w: 1.05, h: 1.15, shutters: 'blue' });
  for (const wall of ['left', 'right']) for (const s of [-4.6, -1.5, 1.6, 4.4]) windows.push({ wall, s, y: 1.2, w: 1.0, h: 1.1, shutters: wall === 'left' ? 'blue' : 'red', lit: kit.chance(0.92) });
  for (const s of [-3.2, 3.2]) windows.push({ wall: 'back', s, y: 1.2, w: 0.95, h: 1.0, shutters: 'blue', lit: kit.chance(0.6) });
  const spec = {
    w, d, r, courses: 9, storeys: 1, interior: true, floorHoles: withCellar ? [stairHole] : [],
    pitch: 0.74, oe: 0.9, og: 0.7, snow: 0.34, paint: PAL.red, shutters: 'blue', atticLit: true,
    tieBeams: { step: 1.9 },
    doors: [
      { wall: 'front', s: 0, w: 1.5, h: 2.3, leaf: 'object', id: 'front', openState: opts.open ?? 0.0, hingeLeft: true, casing: 'red' },
      { wall: 'back', s: 3.4, w: 1.05, h: 1.95, leaf: 'object', id: 'back', hingeLeft: false },
    ],
    windows,
    chimneys: [{ wall: 'back', s: 2.8, w: 1.9, d: 1.1 }],
    porch: { wall: 'front', s: 0, w: 6.4, depth: 2.9, benches: false, doorS: 0, paint: PAL.red, hHigh: 3.9, hLow: 2.75, steps: true },
    leanTo: { wall: 'right', s: 4.6, len: 4.5, depth: 1.7, wood: true, hHigh: 2.7, hLow: 2.05 },
  };
  const info = cabin(kit, spec);
  const hw = info.hw, hd = info.hd;
  const y = 0.05;

  // ---- exterior carving: horse-head posts at the porch corners and red banners ----
  const pz = hd + r + 3.0;
  for (const sg of [-1, 1]) {
    const px = sg * (6.4 / 2 + 0.45);
    const col = mixC(PAL.logDark, PAL.logWeathered, 0.35).multiplyScalar(GAIN);
    kit.wood.tube([px, -0.2, pz], [px + kit.rs() * 0.03, 3.1, pz], 0.14, 0.12, col, { seg: 9, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 5 });
    kit.wood.at(px, 3.0, pz - 0.05, sg < 0 ? Math.PI : 0, (m) => {
      m.extrude(horseHeadShape(1.0), 0.1, scaleC(PAL.plank, GAIN * 0.9), { uv: [1, 3] });
    }, 0, sg < 0 ? -0.2 : 0.2);
    kit.circle(px, pz, 0.2);
  }
  // Banners hanging from the porch beam.
  for (const sx of [-2.2, 2.2]) {
    const rows = [];
    for (let i = 0; i <= 6; i++) {
      const row = [];
      for (let j = 0; j <= 3; j++) {
        const t = i / 6, u = j / 3;
        row.push([sx + (u - 0.5) * 0.75 + Math.sin(t * 5 + sx) * 0.04, 2.5 - t * 1.6, hd + r + 2.72 + Math.sin(u * 3 + t * 2) * 0.04]);
      }
      rows.push(row);
    }
    kit.cloth.grid(rows, scaleC(PAL.red, 1.0), { flip: true, uv: [0.6, 0.6] });
    kit.wood.tube([sx - 0.45, 2.52, hd + r + 2.72], [sx + 0.45, 2.52, hd + r + 2.72], 0.025, 0.025, scaleC(PAL.logDark, GAIN), { seg: 5, lenSeg: 1, ao: 0 });
  }

  // ---- interior ----
  // Planked partition between the hall and the private room.
  const pzP = -2.0;
  const wallCol = () => mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN * kit.r(0.85, 1.1));
  for (let x = -hw + 0.3; x < hw - 0.3; x += 0.22) {
    if (Math.abs(x) < 0.75) continue;
    kit.wood.box(x + 0.11, 1.6, pzP, 0.205, 3.2, 0.1, wallCol(), { grain: 'y', uv: [1, 3] });
  }
  kit.wood.box(0, 2.95, pzP, 1.6, 0.5, 0.1, wallCol(), { grain: 'x' });
  kit.wood.box(-0.8, 1.5, pzP, 0.1, 3.0, 0.16, scaleC(PAL.logDark, GAIN * 1.2), { grain: 'y' });
  kit.wood.box(0.8, 1.5, pzP, 0.1, 3.0, 0.16, scaleC(PAL.logDark, GAIN * 1.2), { grain: 'y' });
  kit.box(-(hw - 0.3 + 0.75) / 2 - 0.0, pzP, (hw - 0.3 - 0.75) / 2, 0.08, 0);
  kit.box((hw - 0.3 + 0.75) / 2, pzP, (hw - 0.3 - 0.75) / 2, 0.08, 0);
  // Ceiling over the private room only; the hall is open to the rafters.
  for (let x = -hw + 0.1; x < hw - 0.1; x += 0.26) {
    kit.wood.box(x + 0.13, 3.1, (pzP - hd) / 2, 0.25, 0.05, hd + pzP + 0.1 - 0.0, wallCol(), { grain: 'z', uv: [1, 3] });
  }

  // Central fire pit in the hall, ringed with stones, with embers and logs.
  const fx = 0, fz = 2.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN);
    kit.stone.box(fx + Math.cos(a) * 0.82, y + 0.1, fz + Math.sin(a) * 0.82, 0.38, 0.22, 0.3, sc, { ry: -a + kit.rs() * 0.2, uv: [2, 2], top: scaleC(sc, 1.1) });
  }
  kit.stone.box(fx, y + 0.02, fz, 1.5, 0.05, 1.5, scaleC(PAL.stoneDark, GAIN * 0.5), { uv: [2, 2] });
  const ec = new THREE.Color(2.4, 0.95, 0.25);
  kit.ember.quad([fx - 0.5, y + 0.07, fz - 0.5], [fx - 0.5, y + 0.07, fz + 0.5], [fx + 0.5, y + 0.07, fz + 0.5], [fx + 0.5, y + 0.07, fz - 0.5], ec, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    kit.wood.tube([fx + Math.cos(a) * 0.5, y + 0.14, fz + Math.sin(a) * 0.5], [fx - Math.cos(a) * 0.1, y + 0.3, fz - Math.sin(a) * 0.1], 0.07, 0.06, scaleC(PAL.logDark, GAIN * 0.6), { seg: 6, lenSeg: 1, ao: 0 });
  }
  kit.light(fx, y + 0.8, fz, { color: 0xff8a30, intensity: 2.2, radius: 14, kind: 'hearth' });
  kit.anchor('hearth', fx, y + 0.3, fz);
  kit.circle(fx, fz, 0.95);

  // Long tables with benches along both sides, the high seat at the head.
  for (const sg of [-1, 1]) {
    table(kit, sg * 3.1, y, 2.3, Math.PI / 2, 6.2, 0.95);
    kit.box(sg * 3.1, 2.3, 0.48, 3.1, 0);
    bench(kit, sg * 2.2, y, 2.3, Math.PI / 2, 5.8);
    bench(kit, sg * 4.0, y, 2.3, Math.PI / 2, 5.8);
  }
  kit.anchor('table1', -3.1, y, 2.3);
  kit.anchor('table2', 3.1, y, 2.3);
  // High seat (carved chair) and small desk before the partition.
  kit.frame(0, y, pzP + 0.7, 0, () => {
    const c = scaleC(PAL.logDark, GAIN * 1.3);
    kit.wood.box(0, 0.45, 0, 0.8, 0.1, 0.7, c, { grain: 'x' });
    kit.wood.box(0, 1.1, -0.3, 0.8, 1.4, 0.1, c, { grain: 'y' });
    kit.wood.box(-0.4, 0.5, 0, 0.1, 0.9, 0.7, c, { grain: 'z' });
    kit.wood.box(0.4, 0.5, 0, 0.1, 0.9, 0.7, c, { grain: 'z' });
    for (const sx of [-1, 1]) kit.wood.at(sx * 0.32, 1.85, -0.3, sx < 0 ? Math.PI : 0, (m) => { m.extrude(horseHeadShape(0.35), 0.08, scaleC(PAL.plank, GAIN), { uv: [1, 3] }); });
  });
  kit.box(0, pzP + 0.7, 0.45, 0.4, 0);
  kit.anchor('chair', 0, y, pzP + 0.7);
  rug(kit, 0, y, 0.0, 0, 2.2, 3.2, PAL.red);
  lantern(kit, -hw + 0.5, 2.5, 4.2, { intensity: 1.0 }); lantern(kit, hw - 0.5, 2.5, 4.2, { intensity: 1.0 });
  barrel(kit, hw - 0.7, y, hd - 1.0, 1.0, 0.4); kit.circle(hw - 0.7, hd - 1.0, 0.4);
  barrel(kit, -hw + 0.7, y, hd - 1.0, 1.0, 0.4); kit.circle(-hw + 0.7, hd - 1.0, 0.4);

  // Private room: stove under the chimney (back-wall s = 2.8 is local x = -2.8), bed, desk and shelves.
  stove(kit, -2.8, y, -hd + r + 0.78, 0, { w: 1.8, d: 1.5, h: 1.9, name: 'stove' });
  bed(kit, 3.9, y, -4.2, 0, 1.0, 2.1); kit.box(3.9, -4.2, 0.55, 1.05, 0);
  chest(kit, 4.1, y, -6.2, 0, 1.0, 0.6, 0.55); kit.box(4.1, -6.2, 0.5, 0.28, 0);
  table(kit, 0.6, y, -hd + 1.5, 0, 1.8, 0.8); kit.box(0.6, -hd + 1.5, 0.9, 0.4, 0);
  stool(kit, 0.6, y, -hd + 2.3, 0.2, 0.46, 0.2);
  kit.anchor('desk', 0.6, y + 0.8, -hd + 1.5);
  shelf(kit, 2.0, y, -hd + 0.5, 0, 1.4, 4, 0.5);
  sack(kit, 4.5, y, -2.7, 0.4, 1.1);
  lantern(kit, 0.6, 2.2, -hd + 1.5, { intensity: 0.9 });

  // ---- cellar ----
  if (withCellar) {
    const cy = -2.45;
    const cx0 = -4.95, cx1 = -0.35, cz0 = -6.95, cz1 = -2.3;
    // Stairs down along z (bottom at z = cz0 + 0.4, climbing toward +z), inside the floor hole.
    stairs(kit, (stairHole.x0 + stairHole.x1) / 2, cy, cz0 + 0.55, 0, { width: 1.1, steps: 12, rise: (y - cy) / 12, run: 0.3, rails: true });
    // Floor and walls.
    const flag = scaleC(PAL.stoneDark, GAIN * 0.8);
    kit.stone.box((cx0 + cx1) / 2, cy - 0.15, (cz0 + cz1) / 2, cx1 - cx0 + 1.0, 0.3, cz1 - cz0 + 1.0, flag, { uv: [2, 2] });
    const wallT = 0.5, wy0 = cy - 0.1, wh = -0.02 - wy0;
    const sc = () => mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN * kit.r(0.85, 1.05));
    kit.stone.box((cx0 + cx1) / 2, wy0 + wh / 2, cz0 - wallT / 2, cx1 - cx0 + 1.0, wh, wallT, sc(), { uv: [2, 2] });
    kit.stone.box((cx0 + cx1) / 2, wy0 + wh / 2, cz1 + wallT / 2, cx1 - cx0 + 1.0, wh, wallT, sc(), { uv: [2, 2] });
    kit.stone.box(cx0 - wallT / 2, wy0 + wh / 2, (cz0 + cz1) / 2, wallT, wh, cz1 - cz0, sc(), { uv: [2, 2] });
    kit.stone.box(cx1 + wallT / 2, wy0 + wh / 2, (cz0 + cz1) / 2, wallT, wh, cz1 - cz0, sc(), { uv: [2, 2] });
    for (const [bx, bz, bw, bd] of [[(cx0 + cx1) / 2, cz0 - wallT / 2, cx1 - cx0 + 1, wallT], [(cx0 + cx1) / 2, cz1 + wallT / 2, cx1 - cx0 + 1, wallT], [cx0 - wallT / 2, (cz0 + cz1) / 2, wallT, cz1 - cz0], [cx1 + wallT / 2, (cz0 + cz1) / 2, wallT, cz1 - cz0]]) {
      kit.box(bx, bz, bw / 2, bd / 2, 0, { y0: cy - 0.3, y1: -0.2 });
    }
    // Support posts and a heavy beam under the floor.
    for (const [px, pz] of [[-1.6, -4.0], [-1.6, -6.0]]) {
      kit.wood.tube([px, cy, pz], [px, -0.1, pz], 0.15, 0.14, scaleC(PAL.logDark, GAIN * 1.3), { seg: 8, lenSeg: 3, ao: 0.3 });
      kit.circle(px, pz, 0.18, { y0: cy - 0.3, y1: -0.2 });
    }
    kit.wood.tube([cx0 + 0.3, -0.18, -5.0], [cx1 - 0.1, -0.18, -5.0], 0.15, 0.15, scaleC(PAL.logDark, GAIN * 1.3), { seg: 8, lenSeg: 3, ao: 0.3 });
    // Stores.
    for (const [bx, bz] of [[-0.9, -6.4], [-1.65, -6.5], [-0.8, -2.9]]) { barrel(kit, bx, cy, bz, 1.0, 0.4); kit.circle(bx, bz, 0.4, { y0: cy - 0.3, y1: -0.2 }); }
    sack(kit, -0.8, cy, -3.7, 0.3, 1.2); sack(kit, -0.9, cy, -4.1, 1.1, 1.0); sack(kit, -1.2, cy, -3.5, 2.1, 0.9);
    shelf(kit, -2.9, cy, cz0 + 0.3, 0, 1.6, 3, 0.55);
    // Ledger desk: a rough table with a stool and a lantern.
    table(kit, -1.2, cy, -2.95, 0.0, 1.5, 0.75); kit.box(-1.2, -2.95, 0.75, 0.38, 0, { y0: cy - 0.3, y1: -0.2 });
    stool(kit, -1.2, cy, -2.3, 0.3, 0.45, 0.19);
    kit.anchor('ledger', -1.2, cy + 0.82, -2.95);
    kit.anchor('cellarDoor', (stairHole.x0 + stairHole.x1) / 2, y, -2.3);
    lantern(kit, -2.0, cy + 1.9, -3.8, { intensity: 1.0, radius: 8 });
    kit.walk.floors.push({ y: cy, polygon: [[cx0, cz0], [cx1, cz0], [cx1, cz1], [cx0, cz1]], tag: 'cellar' });
  }
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  kit.anchor('doorInside', 0, y, hd - 1.4);
  return kit.finish({ info });
}

export const longhouseInterior = (opts = {}) => longhouse({ ...opts, cellar: true, open: opts.open ?? 0.6 });
