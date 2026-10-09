// Hanka's house: a small, poor, cold dwelling on the shore. Patched roof, shuttered windows, no smoke.
// Inside: a cold stove, two beds (one a child's, one made and never slept in), a table with two
// bowls, an empty shelf, a red ribbon on a nail. Enterable.
//   anchors: door, doorInside, hearth (cold), table, bed1, bed2, ribbon, milk (bowls left on the ice, outside the back)
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { stove, table, stool, bed, shelf, chest, rug, lantern } from '../furnish.js';

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
  // Bowls of milk set out on the ice behind the house, facing the lake.
  kit.anchor('milk', 0, 0, -hd - 3.2);
  for (const dx of [-0.5, 0.2, 0.9]) {
    kit.wood.at(dx, 0.0, -hd - 3.2, 0, (m) => { m.lathe([[0.06, 0.02], [0.14, 0.1], [0.135, 0.13], [0.06, 0.07]], scaleC(PAL.plank, GAIN * 1.1), { seg: 9, uv: [1, 1] }); });
    kit.ice.at(dx, 0.0, -hd - 3.2, 0, (m) => { m.lathe([[0.001, 0.115], [0.115, 0.115]], mixC(0xe8eef2, PAL.ice, 0.3), { seg: 9 }); });
  }
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  kit.anchor('doorInside', 0.8, y, hd - 1.2);
  return kit.finish({ info });
}
