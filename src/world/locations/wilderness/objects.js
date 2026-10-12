// Custom story objects for the wilderness, drawn with the props Kit primitives (box, cyl, blob, tube,
// mound...). Each function draws into a Kit at its current transform (use Composer.at), origin on the
// ground. They are one-offs that the props catalog does not have: the dead mule, a sprung bear trap,
// a snare line with a frozen hare, a darned mitten, a silver sword, a cairn, a fallen tree, the
// gallows tree, a hunter's blind, a woodcutter's lean-to, ice crystals.
import { TAU } from '../../props/kit.js';

// A pack mule dead in its harness, lying on its right flank half buried; legs stiff, sticking out sideways
// from the belly. Long axis +z, head at +z. Hide is the plain 'matte' material (the fur texture reads as wood
// at close range), tinted per part.
export function deadMule(k, o = {}) {
  const s = o.scale || 1;
  k.push({ scale: s });
  const hide = (v) => [0x5e4e42, 0x56473c, 0x66574a][v % 3];
  // torso: low and long, since the animal lies on its side
  k.blob('matte', 1, { pos: [0, 0.34, -0.05], scale: [0.5, 0.35, 1.15], detail: 2, tint: hide(0), jitter: 0.03, grime: 0.1 });
  k.blob('matte', 1, { pos: [0.02, 0.36, 0.85], scale: [0.5, 0.38, 0.52], detail: 2, tint: hide(1), jitter: 0.03, grime: 0.1 });
  k.blob('matte', 1, { pos: [0, 0.33, -0.95], scale: [0.48, 0.34, 0.5], detail: 2, tint: hide(2), jitter: 0.03, grime: 0.1 });
  // pale belly toward +x
  k.blob('matte', 1, { pos: [0.34, 0.3, 0.0], scale: [0.2, 0.2, 1.0], detail: 1, tint: 0x9a8c7a, jitter: 0.02, grime: 0 });
  // neck lying flat on the snow, head resting
  k.tube('matte', [[0, 0.4, 1.2], [0.05, 0.3, 1.7], [0.12, 0.2, 2.15]], (t) => 0.23 - 0.1 * t, { radial: 8, tint: hide(1), grime: 0.1 });
  k.blob('matte', 1, { pos: [0.14, 0.17, 2.46], scale: [0.14, 0.13, 0.32], detail: 1, tint: hide(0), jitter: 0.015, grime: 0.1 });
  k.blob('matte', 1, { pos: [0.16, 0.13, 2.74], scale: [0.1, 0.09, 0.16], detail: 1, tint: 0x8a7c6c, jitter: 0.01, grime: 0 });
  for (const sx of [-1, 1]) k.cyl('matte', 0.001, 0.04, 0.24, { pos: [0.14 + sx * 0.07, 0.34, 2.3], rot: [-0.5, 0, sx * 0.5], radial: 5, tint: hide(1), grime: 0.1 });
  k.sph('matte', 0.022, { pos: [0.27, 0.21, 2.52], tint: 0x14100c, grime: 0, var: 0, ws: 6, hs: 4 });
  // stiff mane along the dorsal edge (-x), frozen in clumps
  for (let i = 0; i < 9; i++) k.blade('straw', 0.05, 0.2, { pos: [-0.12, 0.42 - i * 0.012, 1.05 + i * 0.14], rot: [0.1, 0, -0.5], tint: 0x2e2620, var: 0.1, grime: 0 });
  // four legs out of the belly, stiff, with bent knees and hocks; hooves dark
  const leg = (z, bend, up) => {
    k.tube('matte', [[0.4, 0.34, z], [0.85, 0.38 + up, z + bend], [1.28, 0.28 + up * 1.5, z + bend * 1.8]], (t) => 0.11 - 0.055 * t, { radial: 6, tint: 0x4a3c32, grime: 0.1 });
    k.box('iron', 0.17, 0.1, 0.11, { pos: [1.36, 0.27 + up * 1.6, z + bend * 1.9], rot: [0, 0, -0.2], tint: 0x1a1613, grime: 0 });
  };
  leg(0.84, 0.14, 0.12); leg(0.56, -0.12, 0.2); leg(-0.62, -0.24, 0.14); leg(-0.92, 0.06, 0.04);
  // tail
  k.tube('matte', [[0, 0.3, -1.4], [0.04, 0.22, -1.75], [0.18, 0.12, -2.0]], 0.045, { radial: 5, tint: 0x2e2620, grime: 0 });
  // harness: collar, back band, belly strap, traces to the cart, the snapped shaft
  k.torus('iron', 0.28, 0.05, { pos: [0.04, 0.33, 1.02], rot: [0, Math.PI / 2, 0.15], tint: 0x34281e, grime: 0, seg: 10, rseg: 4, tile: 0.4, scale: [1, 0.8, 1] });
  k.box('wood', 0.9, 0.05, 0.1, { pos: [0.0, 0.62, 0.15], rot: [0, 0, 0.05], tint: 0x32261e, grime: 0 });
  for (const sx of [0.25, -0.25]) k.tube('rope', [[sx, 0.5, 1.0], [sx + 0.1, 0.3, 0.2], [sx, 0.22, -1.2], [sx + 0.1, 0.1, -2.7]], 0.02, { radial: 4, tint: 0x6a5a42 });
  k.cyl('wood', 0.04, 0.05, 2.4, { pos: [0.7, 0.14, -0.4], rot: [Math.PI / 2 - 0.08, 0, 0.05], radial: 6, tint: 0xa89684, cap: 'logEnd' });
  // drift over the upper flank and the back, rime on the hide, a little snow by the muzzle
  k.mound(0.9, 0.2, 2.3, { pos: [-0.12, 0.55, -0.15], jseed: 2 });
  k.mound(0.5, 0.13, 0.9, { pos: [0.1, 0.34, 1.65], jseed: 4 });
  k.mound(1.4, 0.25, 1.2, { pos: [-0.5, 0.0, -0.4], jseed: 6 });
  k.pop();
}

// Bear trap, sprung on a stick: toothed jaws shut, chain to a drag log.
export function bearTrap(k, o = {}) {
  const s = o.scale || 1;
  k.push({ scale: s, yaw: o.yaw || 0 });
  const iron = 0x4a4540;
  k.box('iron', 0.5, 0.025, 0.3, { pos: [0, 0.02, 0], tint: iron, grime: 0.2 });
  // jaws: two curved plates closed into a flat ring with interlocked teeth
  for (const sz of [-1, 1]) {
    k.torus('iron', 0.19, 0.016, { pos: [0, 0.07, sz * 0.02], rot: [Math.PI / 2 - sz * 0.12, 0, 0], tint: 0x5a544d, seg: 14, rseg: 3, grime: 0.1 });
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      k.cyl('iron', 0.0, 0.016, 0.06, { pos: [Math.sin(a) * 0.19, 0.1, sz * (0.03 + Math.cos(a) * 0.17)], rot: [sz * 0.1, 0, 0], radial: 4, tint: 0x6a645c });
    }
  }
  // the pan and spring
  k.cyl('iron', 0.06, 0.06, 0.012, { pos: [0, 0.045, 0], radial: 8, tint: 0x3e3a35 });
  k.tube('iron', [[-0.18, 0.04, -0.14], [-0.3, 0.1, -0.2], [-0.34, 0.08, -0.08]], 0.012, { radial: 4, tint: 0x4a4540 });
  // snapped branch caught in the teeth
  k.cyl('wood', 0.02, 0.03, 0.5, { pos: [0.05, 0.1, 0.0], rot: [0.05, 0.3, Math.PI / 2 + 0.1], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
  // chain to the drag log
  const ch = [[0.25, 0.03, 0.0], [0.6, 0.02, 0.1], [1.0, 0.03, 0.0], [1.4, 0.02, -0.1]];
  k.tube('iron', ch, 0.012, { radial: 4, tint: 0x4a4540, grime: 0 });
  k.log(0.1, 1.1, { lie: 'x', pos: [1.9, 0.1, -0.12], yaw: 0.12, tint: 0x9a8e82 });
  k.mound(0.5, 0.05, 0.4, { pos: [0, 0.0, 0.1], jseed: 1 });
  k.pop();
}

// A snare line: two stakes, a taut cord, loops hanging from it, one holding a frozen hare.
export function snareLine(k, o = {}) {
  const L = o.length || 3.0;
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) {
    k.cyl('wood', 0.018, 0.026, 1.0, { pos: [sx * L / 2, 0.5, 0], rot: [0, 0, sx * 0.08], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
    k.mound(0.3, 0.1, 0.3, { pos: [sx * L / 2, 0.0, 0], jseed: sx + 3 });
  }
  k.tube('rope', [[-L / 2, 0.95, 0], [-L / 4, 0.9, 0.03], [0, 0.88, 0.0], [L / 4, 0.9, -0.03], [L / 2, 0.95, 0]], 0.006, { radial: 3, tint: 0x8a7a62, grime: 0 });
  for (const x of [-L * 0.28, 0, L * 0.3]) {
    k.torus('rope', 0.1, 0.005, { pos: [x, 0.74, 0.02], rot: [0.1, 0.4, 0], tint: 0x8a7a62, seg: 10, rseg: 3, grime: 0 });
    k.tube('rope', [[x, 0.88, 0], [x + 0.01, 0.82, 0.01], [x, 0.76, 0.02]], 0.004, { radial: 3, tint: 0x8a7a62, grime: 0 });
  }
  if (o.hare !== false) {
    // frozen hare hanging by the neck, stiff, rimed
    const x = L * 0.3;
    k.blob('fur', 0.11, { pos: [x, 0.5, 0.02], scale: [0.7, 1.9, 0.9], detail: 1, tint: 0xcfc8be, jitter: 0.01 });
    k.blob('fur', 0.06, { pos: [x, 0.7, 0.0], scale: [0.8, 0.9, 1.2], detail: 1, tint: 0xd8d2c8, jitter: 0.008 });
    for (const sx of [-1, 1]) k.cyl('fur', 0.001, 0.014, 0.18, { pos: [x + sx * 0.025, 0.8, -0.02], rot: [0, 0, sx * 0.15], radial: 4, tint: 0xcfc8be });
    k.blob('ice', 0.05, { pos: [x, 0.42, 0.06], scale: [1.4, 1.2, 0.5], detail: 0, tint: 0xd6e8f4, flat: true });
  }
  k.pop();
}

// A darned red wool mitten lying flat (the clue at the ice camp).
export function mitten(k, o = {}) {
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  k.blob('cloth', 0.075, { pos: [0, 0.03, 0], scale: [0.85, 0.34, 1.35], detail: 1, tint: 0x8a3a2c, jitter: 0.006, grime: 0.1 });
  k.blob('cloth', 0.04, { pos: [-0.075, 0.03, -0.03], scale: [1.0, 0.5, 1.4], rot: [0, 0.5, 0], detail: 1, tint: 0x8a3a2c, jitter: 0.004, grime: 0.1 });
  // grey darning patch on the palm, cuff band
  k.box('cloth', 0.07, 0.006, 0.07, { pos: [0.005, 0.054, 0.015], rot: [0, 0.2, 0], tint: 0xb8b0a2, grime: 0, var: 0.2 });
  k.box('cloth', 0.15, 0.04, 0.03, { pos: [0, 0.03, 0.095], tint: 0xc4b8a0, grime: 0.1 });
  k.mound(0.12, 0.012, 0.1, { pos: [0.02, 0.05, -0.03], jseed: 5 });
  k.pop();
}

// A silver sword with a bound grip, lying (or leaning with `lean`).
export function silverSword(k, o = {}) {
  const lean = o.lean || 0;
  k.push({ yaw: o.yaw || 0, pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0] });
  k.push({ rot: [0, 0, lean] });
  const sil = 0xd8dee6;
  k.box('iron', 0.045, 1.05, 0.012, { pos: [0, 0.65, 0], tint: sil, grime: 0, var: 0.03, taper: [0.6, 1] });
  k.box('iron', 0.012, 0.9, 0.016, { pos: [0, 0.62, 0], tint: 0xb0b8c2, grime: 0, var: 0.02 });
  k.box('iron', 0.2, 0.026, 0.03, { pos: [0, 0.1, 0], tint: 0x8a8f96, grime: 0, var: 0.04 });
  k.cyl('burlap', 0.016, 0.016, 0.16, { pos: [0, 0.01, 0], radial: 6, tint: 0x3a2e24, grime: 0 });
  k.sph('iron', 0.026, { pos: [0, -0.08, 0], tint: 0x9aa0a8, grime: 0, ws: 7, hs: 5 });
  k.pop();
  k.pop();
}

// Cairn: a stack of flat stones with a rag tied on top.
export function cairn(k, o = {}) {
  const n = o.n || 6;
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  let y = 0, r = 0.5;
  for (let i = 0; i < n; i++) {
    const rr = r * (0.9 + k.rs(0.12));
    k.blob('stone', rr, { pos: [k.rs(0.06), y + rr * 0.32, k.rs(0.06)], scale: [1.1, 0.42, 1.0], rot: [k.rs(0.1), k.r(0, TAU), k.rs(0.1)], detail: 1, tint: k.pick([0xb0aaa4, 0x9a948e, 0xc0bab2]), flat: true, jitter: rr * 0.1 });
    y += rr * 0.62; r *= 0.82;
  }
  if (o.rag !== false) k.hang('ribbon', 0.07, 0.55, { pos: [0.05, y + 0.1, 0.03], tint: 0x7a241a, sway: 1.1, wave: 0.03 });
  k.mound(0.7, 0.14, 0.7, { pos: [0, y * 0.45, 0], jseed: 4 });
  k.pop();
}

// A big spruce trunk fallen across the track with a gap sawn through it. Lies along +x, centered.
export function fallenTree(k, o = {}) {
  const L = o.length || 11, gap = o.gap || 3.2, r = o.radius || 0.42;
  k.push({ yaw: o.yaw || 0 });
  const half = (L - gap) / 2;
  const bark = [0x8a7e72, 0x7c7064, 0x948878];
  for (const sg of [-1, 1]) {
    const cx = sg * (gap / 2 + half / 2);
    const rr = r * (sg > 0 ? 0.8 : 1.05);
    k.log(rr, half, { lie: 'x', pos: [cx, rr * 0.92, 0], tint: k.pick(bark), radial: 11, jitter: rr * 0.1 });
    // branches (stubs and a broken limb)
    for (let i = 0; i < 5; i++) {
      const bx = cx + k.rs(half * 0.42), a = k.r(0.4, 2.6);
      k.tube('bark', [[bx, rr * 1.4, 0], [bx + k.rs(0.2), rr * 1.4 + 0.6 * Math.sin(a), 0.7 * Math.cos(a) * (i % 2 ? 1 : -1)], [bx + k.rs(0.4), rr * 1.5 + 0.9 * Math.sin(a), 1.4 * Math.cos(a) * (i % 2 ? 1 : -1)]], 0.05, { radial: 5, tint: 0x6a5e52 });
    }
    k.mound(half * 0.8, rr * 0.7, rr * 2.3, { pos: [cx, rr * 1.7, 0], jseed: sg + 3 });
  }
  // root plate at the left end
  k.cyl('bark', r * 1.9, r * 2.3, 0.35, { pos: [-L / 2 - 0.1, r * 1.8, 0], rot: [0, 0, Math.PI / 2 - 0.15], radial: 9, tint: 0x5a4c40, cap: 'logEnd', jitter: 0.1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    k.tube('bark', [[-L / 2 - 0.1, r * 1.8, 0], [-L / 2 - 0.5, r * 1.8 + Math.cos(a) * 0.9, Math.sin(a) * 0.9], [-L / 2 - 0.9, r * 1.8 + Math.cos(a) * 1.4, Math.sin(a) * 1.5]], 0.09, { radial: 5, tint: 0x5a4c40 });
  }
  // sawn rounds rolled aside, chips on the snow
  for (let i = 0; i < 3; i++) k.cyl('logEnd', r * 0.95, r * 0.95, 0.38, { pos: [gap / 2 + 0.2 + i * 0.8, 0.19, 1.6 + k.rs(0.4)], rot: [0, 0, Math.PI / 2 * (i % 2)], radial: 10, tint: 0xd8c8a8, cap: 'logEnd', jitter: 0.01 });
  for (let i = 0; i < 12; i++) k.box('wood', 0.16, 0.012, 0.06, { pos: [k.rs(gap * 0.5), 0.02, k.rs(0.9)], rot: [0, k.r(0, TAU), 0], tint: 0xd8c4a0, grime: 0, var: 0.1 });
  k.pop();
}

// The gallows tree: a dead pine with one strong low limb. Returns the limb tip (local) for the rope.
export function gallowsTree(k, o = {}) {
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  const bark = 0x6a6056;
  k.tube('bark', [[0, -0.4, 0], [0.05, 2.0, 0.02], [-0.05, 4.2, -0.05], [0.1, 6.4, 0.05], [0.0, 7.6, 0.0]], (t) => 0.55 - 0.4 * t, { radial: 10, tint: bark, tile: 0.5, segs: 22 });
  // the limb, low and strong, rising a little toward its tip
  const limb = [[0, 2.8, 0], [0.9, 3.02, 0.1], [2.0, 3.22, 0.25], [3.0, 3.28, 0.2], [3.7, 3.2, 0.2]];
  k.tube('bark', limb, (t) => 0.24 - 0.13 * t, { radial: 8, tint: bark });
  k.tube('bark', [[3.0, 3.28, 0.2], [3.7, 3.9, 0.3], [4.0, 4.5, 0.2]], 0.045, { radial: 5, tint: bark });
  k.tube('bark', [[0, 4.1, 0], [-0.8, 4.8, -0.2], [-1.6, 5.5, -0.4]], (t) => 0.16 - 0.1 * t, { radial: 6, tint: bark });
  k.tube('bark', [[0.05, 5.4, 0], [1.0, 6.0, 0.3], [1.9, 6.6, 0.3]], (t) => 0.13 - 0.08 * t, { radial: 6, tint: bark });
  k.tube('bark', [[0.05, 6.6, 0], [-0.9, 7.0, 0.2], [-1.7, 7.9, 0.4]], (t) => 0.11 - 0.07 * t, { radial: 6, tint: bark });
  for (let i = 0; i < 14; i++) {
    const y = 3.4 + i * 0.32, a = i * 2.4;
    k.tube('bark', [[0, y, 0], [Math.cos(a) * 0.5, y + 0.3, Math.sin(a) * 0.5], [Math.cos(a) * 1.0, y + 0.5, Math.sin(a) * 1.0]], 0.03, { radial: 4, tint: bark });
  }
  // roots and the snow drifted round the foot
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.4;
    k.tube('bark', [[0, 0.3, 0], [Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6], [Math.cos(a) * 1.3, -0.05, Math.sin(a) * 1.3]], 0.12, { radial: 5, tint: 0x5a5046 });
  }
  k.mound(0.9, 0.2, 0.5, { pos: [1.4, 3.2, 0.3], jseed: 2 });
  k.mound(0.5, 0.14, 0.4, { pos: [0, 3.0, 0.0], jseed: 3 });
  k.mound(1.6, 0.3, 1.6, { pos: [0, 0.0, 0], jseed: 8 });
  k.pop();
  return { tip: [3.7 * (o.scale || 1), 3.2 * (o.scale || 1), 0.2 * (o.scale || 1)] };
}

// A hunter's blind: a curved screen of woven branches and boughs with a log seat, open on the lee side.
export function hunterBlind(k, o = {}) {
  k.push({ yaw: o.yaw || 0 });
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = -1.25 + (i / (n - 1)) * 2.5;
    const x = Math.sin(a) * 1.5, z = Math.cos(a) * 1.0 - 0.9;
    k.cyl('wood', 0.025, 0.03, 1.5 + k.rs(0.15), { pos: [x, 0.72, z], rot: [k.rs(0.05), 0, k.rs(0.08)], radial: 5, tint: 0xa89684, cap: null });
    k.box('wicker', 0.34, 1.05, 0.06, { pos: [x * 1.0, 0.65, z + 0.02], yaw: -a * 0.9, tint: k.pick([0xd8cdb8, 0xc8b898, 0xbfae92]), grime: 0.4 });
  }
  // dry spruce boughs piled along the top
  for (let i = 0; i < 18; i++) {
    const a = -1.2 + (i / 17) * 2.4;
    k.blob('bark', 0.2, { pos: [Math.sin(a) * 1.5, 1.35 + k.rs(0.1), Math.cos(a) * 1.0 - 0.9], scale: [1.3, 0.5, 0.8], detail: 1, tint: k.pick([0x4a463a, 0x5a5646, 0x3e3a30]), jitter: 0.03 });
  }
  k.mound(3.0, 0.25, 0.6, { pos: [0, 1.4, -0.9], jseed: 3 });
  // log seat and a bed of boughs, a cold fire ring outside
  k.log(0.14, 1.1, { lie: 'x', pos: [0.2, 0.14, -0.2], tint: 0xa89684 });
  k.blob('straw', 0.4, { pos: [-0.5, 0.06, -0.2], scale: [1.2, 0.2, 0.9], detail: 1, tint: 0xb8a878 });
  k.pop();
}

// A woodcutter's lean-to: roof poles on two forked posts, boughs and snow on top, open front.
export function leanTo(k, o = {}) {
  const W = o.width || 3.4, D = o.depth || 2.2;
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) {
    k.tube('bark', [[sx * W / 2, 0, -D / 2 + 0.2], [sx * W / 2, 1.1, -D / 2 + 0.15], [sx * W / 2 + sx * 0.1, 1.9, -D / 2 + 0.1]], 0.08, { radial: 6, tint: 0x6a5e52 });
    k.tube('bark', [[sx * W / 2, 0, D / 2 - 0.2], [sx * W / 2, 0.7, D / 2 - 0.2], [sx * W / 2, 1.05, D / 2 - 0.2]], 0.07, { radial: 6, tint: 0x6a5e52 });
  }
  k.log(0.07, W + 0.4, { lie: 'x', pos: [0, 1.95, -D / 2 + 0.1], tint: 0x8a7e72 });
  k.log(0.07, W + 0.4, { lie: 'x', pos: [0, 1.07, D / 2 - 0.2], tint: 0x8a7e72 });
  // rafters and cladding
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.1 + (i / 8) * (W - 0.2);
    k.tube('bark', [[x, 1.98, -D / 2 + 0.1], [x, 1.52, 0], [x, 1.05, D / 2 + 0.2]], 0.045, { radial: 5, tint: 0x7a6e62 });
  }
  for (let r = 0; r < 4; r++) k.box('planks', W + 0.3, 0.04, 0.3, { pos: [0, 1.88 - r * 0.28, -D / 2 + 0.3 + r * 0.55], rot: [0.45, 0, 0], tint: k.pick([0xc8b8a0, 0xb8a890, 0xa89880]), grime: 0.3 });
  k.mound(W + 0.2, 0.28, D * 0.9, { pos: [0, 1.62, 0.0], rot: [0.42, 0, 0], jseed: 4 });
  // back wall of stacked split logs
  for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) {
    k.log(0.07, 0.55, { lie: 'z', pos: [-W / 2 + 0.25 + i * (W - 0.4) / 11, 0.1 + r * 0.14, -D / 2 + 0.45], radial: 6, tint: k.pick([0xe0d2c0, 0xc4b6a4, 0xb8a898]) });
  }
  k.pop();
}

// Ice crystal cluster: hexagonal prisms with pointed tips fanning from a base. Merge-friendly (material 'ice').
export function crystals(k, o = {}) {
  const n = o.n || 5, h = o.h || 1.2, spread = o.spread || 0.5;
  k.push({ yaw: o.yaw || 0, scale: o.scale || 1 });
  for (let i = 0; i < n; i++) {
    const a = k.r(0, TAU), tilt = k.r(0.05, spread) * (i === 0 ? 0.2 : 1), hh = h * k.r(0.45, 1.0) * (i === 0 ? 1.25 : 1), r = k.r(0.06, 0.13) * (hh / h * 0.6 + 0.5);
    k.with({ rot: [Math.sin(a) * tilt, a, Math.cos(a) * tilt] }, () => {
      k.cyl('ice', r, r * 1.15, hh * 0.72, { pos: [0, hh * 0.36, 0], radial: 6, tint: 0xbfe2f6, cap: null, grime: 0, var: 0.1 });
      k.cyl('ice', 0.002, r, hh * 0.28, { pos: [0, hh * 0.72 + hh * 0.14, 0], radial: 6, tint: 0xe2f4fc, cap: null, grime: 0, var: 0.1 });
    });
  }
  k.pop();
}

// Shrine-side extras: a skull on a post hung with a ribbon, a few candle stubs, a bowl.
export function stoneSeat(k, o = {}) {
  k.push({ yaw: o.yaw || 0 });
  k.blob('stone', 0.7, { pos: [0, 0.18, 0], scale: [1.5, 0.45, 0.9], detail: 2, tint: 0xa8a29a, flat: true, jitter: 0.06 });
  k.blob('stone', 0.4, { pos: [0.5, 0.1, -0.4], scale: [1, 0.4, 0.8], detail: 1, tint: 0x9a948e, flat: true, jitter: 0.04 });
  k.mound(1.2, 0.1, 0.8, { pos: [0, 0.36, 0], jseed: 3 });
  k.pop();
}
