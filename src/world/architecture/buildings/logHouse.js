// logHouse: the village's basic dwelling in several variants (size, floors, porch, gallery,
// woodshed). Seeded: every instance leans, sags and weathers differently.
import { Kit, PAL } from '../kit.js';
import { cabin } from '../cabin.js';

const SIZES = { small: [5.0, 4.4], medium: [6.4, 5.4], large: [7.8, 6.6] };

export function logHouse(opts = {}) {
  const seed = opts.seed ?? 1;
  const kit = new Kit(seed, 'logHouse');
  const size = opts.size ?? 'medium';
  const [w0, d0] = SIZES[size] || SIZES.medium;
  const w = opts.w ?? w0, d = opts.d ?? d0;
  const floors = opts.floors ?? 1;
  const shutters = opts.shutters ?? kit.pick(['blue', 'blue', 'red', 'cream']);
  const porch = opts.porch ?? false;
  const doorS = opts.doorS ?? (porch ? 0 : kit.pick([-1, 1]) * w * 0.17);
  const windows = [];
  const hasPorch = !!porch;
  // Front wall: door plus windows on the far side.
  const wf = w - 1.6;
  const frontSlots = [];
  for (let s = -wf / 2 + 0.5; s <= wf / 2 - 0.5; s += 1.9) frontSlots.push(s);
  for (const s of frontSlots) if (Math.abs(s - doorS) > 1.5) windows.push({ wall: 'front', s, y: 1.05 });
  if (floors > 1) for (const s of [-w * 0.2, w * 0.2]) windows.push({ wall: 'front', s, y: 0.95, level: 1 });
  // Side walls.
  const nSide = d > 6 ? 2 : 1;
  for (const wall of ['left', 'right']) {
    for (let i = 0; i < nSide; i++) {
      const s = nSide === 1 ? kit.rs() * 0.5 : (i - 0.5) * d * 0.5;
      windows.push({ wall, s, y: 1.05, lit: kit.chance(0.85) });
      if (floors > 1) windows.push({ wall, s, y: 0.95, level: 1, lit: kit.chance(0.7) });
    }
  }
  windows.push({ wall: 'back', s: kit.rs() * 1.5, y: 1.1, lit: kit.chance(0.5) });
  const paint = opts.paint ?? kit.pick([PAL.red, PAL.blueFaded, PAL.ochre]);
  const spec = {
    w, d, courses: opts.courses ?? 8, storeys: floors, shutters, paint,
    doors: [{ wall: 'front', s: doorS, leaf: opts.doorLeaf ?? 'closed', id: 'front' }],
    windows,
    chimney: opts.chimney === false ? null : { wall: 'back', s: kit.rs() * 0.4, w: 1.5 },
    porch: hasPorch ? { wall: 'front', s: doorS, w: Math.min(3.4, w - 0.6), depth: 1.9, benches: true, doorS } : null,
    leanTo: opts.woodshed ? { wall: opts.woodshedSide ?? (kit.chance(0.5) ? 'left' : 'right'), s: -d * 0.12, len: Math.min(3.4, d - 1.4), depth: 1.5 } : null,
    gable: opts.gable ?? 'planks',
    snow: opts.snow ?? 0.28,
    pitch: opts.pitch ?? 0.86 + kit.rs() * 0.03,
    interior: opts.interior ?? false,
  };
  const info = cabin(kit, spec);
  const doorsOut = info.doorRecs;
  kit.anchor('door', doorsOut[0].x, 0, doorsOut[0].z);
  return kit.finish({ info });
}
