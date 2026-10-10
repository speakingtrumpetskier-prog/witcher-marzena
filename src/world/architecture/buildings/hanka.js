// Hanka's house: a small, poor, cold dwelling on the shore. Patched roof, shuttered windows, no smoke.
// Inside: a cold stove, two beds (one a child's, one made and never slept in), a table with two
// bowls, an empty shelf, a red ribbon on a nail. Enterable.
//   anchors: door, doorInside, hearth (cold), table, bed1, bed2, ribbon, milk (bowls left on the ice, outside the back)
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { stove, table, stool, bed, shelf, chest, rug, lantern } from '../furnish.js';
import { snowPillow, icePatch } from '../details.js';

export function hankaHouse(opts = {}) {
  const kit = new Kit(opts.seed ?? 61, 'hankaHouse');
  const w = 5.2, d = 4.8, r = 0.19;
  const info = cabin(kit, {
    w, d, r, courses: 8, interior: true, doorLantern: false, lean: 1.6, pitch: 0.84, oe: 0.7, og: 0.5, snow: 0.36, paint: PAL.plankDark, shutters: 'blue',
    style: { low: 0x2a231d, mid: 0x4a4137, high: 0x6f6a60, silver: 0.5 },
    roofOpts: { jag: 0.38, sag: 0.16 },
    doors: [{ wall: 'front', s: 0.8, w: 0.95, h: 1.85, leaf: 'object', id: 'front', hingeLeft: false, openState: opts.open ?? 0 }],
    windows: [
      { wall: 'front', s: -1.1, y: 1.05, w: 0.7, h: 0.8, shutters: 'blue', lit: false, closed: true },
      { wall: 'left', s: 0.2, y: 1.05, w: 0.7, h: 0.8, shutters: 'blue', lit: false },
      { wall: 'right', s: -0.4, y: 1.05, w: 0.7, h: 0.8, shutters: 'blue', lit: opts.candle ?? false },
    ],
    chimney: { wall: 'back', s: -1.0, w: 1.3, d: 0.85, smoke: false, above: 0.7 },
    porch: null,
    leanTo: { wall: 'right', s: 0.2, len: 2.6, depth: 1.1, wood: false, hHigh: 2.25, hLow: 1.8 },
    atticWindow: false, smokeHole: false,
  });
  const hw = info.hw, hd = info.hd, y = 0.05;
  kit.indoor(true);
  // Cold stove under the chimney (back-wall s = -1.0 is local x = +1.0), no light.
  stove(kit, 1.0, y, -hd + r + 0.76, 0, { w: 1.5, d: 1.4, h: 1.8, cold: true, name: 'hearth' });
  table(kit, -0.9, y, -0.4, 0.1, 1.4, 0.8, 0.76);
  kit.box(-0.9, -0.4, 0.7, 0.4, 0.1);
  stool(kit, -0.9, y, 0.45, 0.2); stool(kit, -1.6, y, -0.4, 1.4); stool(kit, -0.2, y, -0.45, 2.0);
  // Two bowls on the table: one for each of the people who still sit down.
  for (const x of [-1.2, -0.6]) kit.wood.at(x, y + 0.76, -0.4, 0, (m) => { m.lathe([[0.05, 0], [0.1, 0.03], [0.095, 0.05], [0.04, 0.012]], scaleC(PAL.plankDark, GAIN * 1.2), { seg: 8, uv: [1, 1] }); });
  bed(kit, -hw + 0.7, y, -hd + 1.4, 0, 0.85, 1.9); kit.box(-hw + 0.7, -hd + 1.4, 0.45, 0.95, 0);
  bed(kit, -hw + 0.6, y, 1.2, 0, 0.7, 1.5); kit.box(-hw + 0.6, 1.2, 0.38, 0.8, 0);
  kit.anchor('bed1', -hw + 0.7, y + 0.4, -hd + 1.4);
  kit.anchor('bed2', -hw + 0.6, y + 0.4, 1.2);
  shelf(kit, hw - 0.4, y, 0.6, -Math.PI / 2, 1.0, 3, 0.5);
  chest(kit, 1.6, y, 1.6, 0.4, 0.8, 0.5, 0.5); kit.box(1.6, 1.6, 0.4, 0.28, 0.4);
  rug(kit, -0.5, y, 1.0, 0.1, 1.2, 1.7, 0x5a3a2a);
  // A red ribbon on a nail by the child's bed.
  kit.cloth.at(-hw + 0.3, 1.5, 1.6, Math.PI / 2, () => {
    const rows = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; rows.push([[-0.02, 0.4 - t * 0.5, 0.01 * t], [0.02, 0.4 - t * 0.5, 0.01 * t + Math.sin(t * 3) * 0.01]]); }
    kit.cloth.grid(rows, scaleC(PAL.red, 1.0), { flip: true, uv: [0.3, 0.3] });
  });
  kit.anchor('ribbon', -hw + 0.4, 1.5, 1.6);
  kit.anchor('table', -0.9, y + 0.76, -0.4);
  // One dim unlit lantern by the door (gameplay can light it).
  lantern(kit, 1.5, 2.2, 0.6, { intensity: 0.0, radius: 3 });
  kit.indoor(false);
  kit.lights = kit.lights.filter((l) => l.intensity > 0 || l.kind !== 'lantern');
  // The milk shelf set out on the shore behind the house, open to the lake (the anchor stays where the story
  // expects it: bowls on the low tier, 3.2 m behind the back wall).
  kit.anchor('milk', 0, 0, -hd - 3.2);
  milkShelf(kit, 0, -hd - 3.2);
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  kit.anchor('doorInside', 0.8, y, hd - 1.2);
  return kit.finish({ info });
}

// A two-tier shelf under a small snowed roof on four sunk posts. The low tier (y = 0 is the floor level of the house,
// the same height the old loose bowls stood at) holds the frozen bowls, the high tier the jugs Hanka carries down each
// evening, one with a cloth tied over it and a red thread round its neck; a jug has gone over and spilled; two empty
// ones and a pail stand in the snow at the posts. The ground under it is 0.2 to 0.3 below y = 0, so the posts go deep.
function milkShelf(kit, cx, cz) {
  // Silvered boards and pale glazed jugs: the back wall of the house behind is almost black, so they must read against it.
  const board = (k = 1) => scaleC(mixC(0x8e867a, 0x6c645a, kit.rand() * 0.7), GAIN * k);
  const clay = [0xb08a5e, 0xa8a090, 0x9a7a5a, 0xbab2a0];
  const lowY = 0.0, highY = 0.72;
  const PX = 1.3, PZ = 0.25;
  // posts and the rails that hold the tiers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.wood.tube([cx + sx * PX, -0.9, cz + sz * PZ], [cx + sx * PX + sx * 0.01, 1.52, cz + sz * PZ], 0.05, 0.043, board(0.85), { seg: 6, lenSeg: 1, ao: 0.15, capB: true });
  }
  kit.wood.tube([cx, -0.9, cz + 0.02], [cx, -0.04, cz + 0.02], 0.04, 0.04, board(0.8), { seg: 5, lenSeg: 1, ao: 0.1 });
  for (const y of [lowY - 0.07, highY - 0.07]) for (const sz of [-1, 1]) kit.wood.box(cx, y, cz + sz * PZ, 2.7, 0.07, 0.05, board(0.8), { grain: 'x' });
  // the two tiers: three boards each with a finger of gap, a little warped
  for (const [y, d] of [[lowY - 0.01, 0.12], [highY - 0.01, 0.135]]) {
    for (let i = -1; i <= 1; i++) kit.wood.box(cx + kit.rs() * 0.01, y + kit.rs() * 0.006, cz + i * (d + 0.012), 2.74, 0.04, d, board(1.05), { grain: 'x', top: board(1.15) });
  }
  // the roof: two boards under a ridge, a snow load and a row of icicles along the front eave
  const roofC = board(0.95);
  for (const sz of [-1, 1]) kit.wood.box(cx, 1.5, cz + sz * 0.2, 3.0, 0.035, 0.58, roofC, { rx: sz * 0.5, grain: 'x', top: scaleC(roofC, 1.1) });
  kit.wood.box(cx, 1.64, cz, 3.05, 0.06, 0.07, board(0.8), { grain: 'x' });
  snowPillow(kit, cx, 1.61, cz, 1.55, 0.2, 0.46, { nu: 5, nv: 12, noise: 0.1 });
  for (let i = 0; i < 9; i++) {
    const x = cx - 1.2 + i * 0.3 + kit.rs() * 0.05, L = kit.r(0.06, 0.22), sz = i % 2 ? 1 : -1;
    kit.ice.tube([x, 1.4 - 0.02, cz + sz * 0.45], [x, 1.4 - 0.02 - L, cz + sz * 0.45], 0.012, 0.002, mixC(PAL.ice, 0xffffff, 0.4), { seg: 4, lenSeg: 1, capA: false, capB: false, ao: 0 });
  }
  // low tier: the bowls (frozen over), one lying on its side
  for (const dx of [-0.5, 0.2, 0.9]) {
    kit.wood.at(cx + dx, lowY, cz, 0, (m) => { m.lathe([[0.06, 0.02], [0.14, 0.1], [0.135, 0.13], [0.06, 0.07]], scaleC(PAL.plank, GAIN * 1.1), { seg: 9, uv: [1, 1] }); });
    kit.ice.at(cx + dx, lowY, cz, 0, (m) => { m.lathe([[0.001, 0.115], [0.115, 0.115]], mixC(0xe8eef2, PAL.ice, 0.3), { seg: 9 }); });
  }
  kit.wood.at(cx - 1.05, lowY + 0.12, cz + 0.05, 0.5, (m) => { m.lathe([[0.06, 0.02], [0.14, 0.1], [0.135, 0.13], [0.06, 0.07]], scaleC(PAL.plank, GAIN * 1.0), { seg: 9, uv: [1, 1] }); }, 1.9, 0);
  icePatch(kit, cx - 0.95, lowY + 0.026, cz + 0.2, 0.2, 0.12, { h: 0.012 });
  snowPillow(kit, cx + 1.1, lowY + 0.02, cz - 0.06, 0.26, 0.04, 0.1, { nu: 3, nv: 8, noise: 0.06 });
  // high tier: jugs
  const jug = (x, z, tall, tint, cover) => {
    const h = tall ? 0.37 : 0.26, r = tall ? 0.105 : 0.12;
    kit.wood.at(cx + x, highY, cz + z, kit.r(0, 6), (m) => {
      m.lathe([[0.001, 0], [r * 0.62, 0.004], [r, h * 0.28], [r * 1.02, h * 0.5], [r * 0.86, h * 0.72], [r * 0.5, h * 0.88], [r * 0.5, h * 0.96], [r * 0.6, h]], scaleC(tint, GAIN), { seg: 10, uv: [0.5, 0.5] });
      m.sweep([[r * 0.5, h * 0.9, 0], [r * 0.95, h * 0.95, 0], [r * 1.35, h * 0.7, 0], [r * 1.0, h * 0.45, 0]], 0.014, scaleC(tint, GAIN * 0.9), { seg: 5, capA: false, capB: false, ao: 0.1 });
    });
    if (cover) {
      kit.cloth.ellipsoid(cx + x, highY + h + 0.005, cz + z, r * 0.8, 0.07, r * 0.8, mixC(0xd8d0bc, 0xb8b09c, kit.rand()), { seg: 8, rings: 4 });
      kit.cloth.tube([cx + x - r * 0.52, highY + h * 0.9, cz + z], [cx + x + r * 0.52, highY + h * 0.9, cz + z], 0.012, 0.012, PAL.red, { seg: 4, lenSeg: 1, ao: 0, capA: false, capB: false });
    }
  };
  jug(-0.95, -0.02, true, clay[0], false);
  jug(-0.45, 0.04, false, clay[1], true);
  jug(0.15, -0.03, true, clay[2], false);
  jug(0.62, 0.05, true, clay[3], true);
  jug(1.0, -0.02, false, clay[0], false);
  // a ladle on a nail under the roof, a red ribbon on a post
  kit.wood.tube([cx - 0.2, 1.38, cz + 0.28], [cx - 0.2, 1.1, cz + 0.3], 0.011, 0.011, board(0.9), { seg: 4, lenSeg: 1, ao: 0 });
  kit.wood.at(cx - 0.2, 1.06, cz + 0.31, 0, (m) => { m.lathe([[0.001, 0], [0.05, 0.01], [0.055, 0.04], [0.04, 0.05]], board(1.0), { seg: 7, uv: [0.5, 0.5] }); });
  const rib = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; rib.push([[cx + PX + 0.05, 1.42 - t * 0.55, cz + PZ + 0.02 + t * 0.03], [cx + PX + 0.05 + 0.04, 1.42 - t * 0.55 - 0.01, cz + PZ + 0.02 + t * 0.03 + Math.sin(t * 3) * 0.015]]); }
  kit.cloth.grid(rib, PAL.red, { flip: true, uv: [0.3, 0.3] });
  // ground: two empty jugs and a pail frosted into the snow at the posts
  const gy = -0.26;
  for (const [x, z, a] of [[-1.55, 0.35, 0.3], [1.5, -0.3, 1.1]]) {
    kit.wood.at(cx + x, gy, cz + z, a, (m) => { m.lathe([[0.001, 0], [0.07, 0.004], [0.11, 0.08], [0.1, 0.17], [0.055, 0.25], [0.055, 0.29]], scaleC(clay[(x > 0 ? 1 : 2)], GAIN), { seg: 9, uv: [0.5, 0.5] }); });
    snowPillow(kit, cx + x, gy + 0.05, cz + z, 0.2, 0.08, 0.2, { nu: 3, nv: 8, noise: 0.08 });
  }
  kit.wood.at(cx + 1.0, gy, cz + 0.55, 0.4, (m) => { m.lathe([[0.12, 0], [0.145, 0.15], [0.16, 0.3]], board(1.0), { seg: 9, uv: [1, 1] }); });
  kit.ice.at(cx + 1.0, gy, cz + 0.55, 0, (m) => { m.lathe([[0.001, 0.24], [0.14, 0.24]], mixC(0xe8eef2, PAL.ice, 0.3), { seg: 9 }); });
  kit.box(cx, cz, 1.45, 0.3, 0, { h: 1.7 });
}
