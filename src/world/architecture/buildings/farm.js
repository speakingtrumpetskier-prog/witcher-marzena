// Outbuildings and workplaces built on the cabin generator: granary (on posts), barn, stable, shed,
// outhouse, boathouse, banya (bathhouse with steam), workshop (Dobra's open barn full of straw).
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { wallFrame } from '../walls.js';
import { doorLeaf } from '../openings.js';
import { ladder } from '../details.js';
import { shedRoof } from '../roofs.js';
import { table, stool, barrel, sack, lantern } from '../furnish.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Two plank door leaves across an opening, slightly ajar. s = center along the wall.
function doubleDoor(kit, f, s, w, h, r, ajar = 0.0) {
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const casing = scaleC(PAL.plankDark, GAIN * 1.2);
    kit.wood.box(s - w / 2 - 0.14, h / 2, r, 0.28, h + 0.2, 0.12, casing, { grain: 'y' });
    kit.wood.box(s + w / 2 + 0.14, h / 2, r, 0.28, h + 0.2, 0.12, casing, { grain: 'y' });
    kit.wood.box(s, h + 0.16, r, w + 0.7, 0.3, 0.14, casing, { grain: 'x' });
    kit.wood.at(s - w / 2, 0.02, 0.0, ajar * 0.6, () => doorLeaf(kit, kit.wood, w / 2 - 0.01, h - 0.05, true));
    kit.wood.at(s + w / 2, 0.02, 0.0, -ajar * 0.4, () => doorLeaf(kit, kit.wood, w / 2 - 0.01, h - 0.05, false));
  });
}

// ---------------- granary ----------------
export function granary(opts = {}) {
  const kit = new Kit(opts.seed ?? 3, 'granary');
  kit.noFoundation = true;
  const lift = 1.15;
  const w = opts.w ?? 3.6, d = opts.d ?? 3.4, r = 0.18;
  const info = cabin(kit, {
    w, d, r, courses: 6, lift, plinth: false, pitch: 0.95, oe: 0.9, og: 0.55, snow: 0.3, paint: PAL.ochre,
    doors: [{ wall: 'front', s: 0, w: 0.9, h: 1.6, leaf: 'closed', step: false }],
    windows: [{ wall: 'right', s: 0.4, y: 1.0, w: 0.4, h: 0.4, shutters: 'none', carved: false }],
    shutters: 'red', atticWindow: false, smokeHole: false,
  });
  const hw = info.hw, hd = info.hd;
  // Posts with stone mushroom caps, bearers, and a front deck with a ladder.
  const posts = [[-hw + 0.2, -hd + 0.2], [hw - 0.2, -hd + 0.2], [-hw + 0.2, hd - 0.2], [hw - 0.2, hd - 0.2], [0, -hd + 0.2], [0, hd - 0.2]];
  const col = mixC(PAL.logDark, PAL.logWeathered, 0.4).multiplyScalar(GAIN);
  for (const [px, pz] of posts) {
    kit.wood.tube([px, -1.2, pz], [px, lift - 0.45, pz], 0.15, 0.14, col, { seg: 8, lenSeg: 3, ao: 0.3, wobble: 0.02, ph: kit.rand() * 5 });
    const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN);
    kit.stone.lathe([[0.16, lift - 0.62], [0.34, lift - 0.5], [0.34, lift - 0.42], [0.2, lift - 0.4]], sc, { seg: 9, closeTop: true, uv: [1, 1] });
    kit.circle(px, pz, 0.2);
  }
  for (const sg of [-1, 1]) kit.wood.tube([sg * (hw - 0.2), lift - 0.3, -hd - 0.1], [sg * (hw - 0.2), lift - 0.3, hd + 0.1], 0.16, 0.15, col, { seg: 8, lenSeg: 3, ao: 0.3, uo: kit.rand() });
  // Front deck.
  kit.wood.box(0, lift - 0.04, hd + 0.8, 2.0, 0.08, 1.0, mixC(PAL.plank, PAL.plankDark, 0.3).multiplyScalar(GAIN), { grain: 'x', top: scaleC(PAL.plank, GAIN * 1.1) });
  ladder(kit, 0.3, 0, hd + 1.55, Math.PI, lift + 0.05, 0.25, 0.55);
  kit.box(0, 0, hw, hd, 0, { y0: lift - 0.3 });
  // Roof gets one more half meter of overhang by default; mark footprint small.
  kit.footprint = { hw: hw + 0.3, hd: hd + 0.3 };
  kit.anchor('door', info.doorRecs[0].x, lift, info.doorRecs[0].z);
  return kit.finish({ info, noFoundation: true });
}

// ---------------- barn ----------------
export function barn(opts = {}) {
  const kit = new Kit(opts.seed ?? 4, 'barn');
  const w = 8.6, d = 11.6, r = 0.2;
  const info = cabin(kit, {
    w, d, r, courses: 8, pitch: 0.78, oe: 0.95, og: 0.8, snow: 0.3, paint: PAL.ochre, shutters: 'none', style: { low: 0x30281f, mid: 0x544a3f, high: 0x7d776c },
    doors: [{ wall: 'front', s: 0, w: 3.6, h: 2.9, leaf: 'open', step: false }],
    windows: [{ wall: 'right', s: -2.4, y: 1.8, w: 0.5, h: 0.5, shutters: 'none', carved: false, lit: false }, { wall: 'left', s: 2.4, y: 1.8, w: 0.5, h: 0.5, shutters: 'none', carved: false, lit: false }],
    atticWindow: false, smokeHole: false, snowSlide: true,
    leanTo: { wall: 'left', s: -1.5, len: 5.0, depth: 2.0, wood: true, hHigh: 2.9, hLow: 2.1 },
  });
  const f = wallFrame('front', info.hw, info.hd);
  doubleDoor(kit, f, 0, 3.6, 2.9, r, opts.ajar ?? 0.6);
  // Hay-loft hatch in the gable.
  kit.frame(0, 0, info.hd, 0, () => {
    const y = info.yEave + 0.6;
    kit.wood.box(0, y + 0.5, 0.21, 1.0, 1.0, 0.04, scaleC(PAL.plankDark, GAIN), { grain: 'y' });
    kit.wood.box(0, y + 0.5, 0.24, 1.14, 0.08, 0.06, scaleC(PAL.plank, GAIN), { grain: 'x' });
    kit.wood.box(0, y + 1.04, 0.24, 1.14, 0.08, 0.06, scaleC(PAL.plank, GAIN), { grain: 'x' });
    for (const sx of [-1, 1]) kit.wood.box(sx * 0.57, y + 0.52, 0.24, 0.08, 1.1, 0.06, scaleC(PAL.plank, GAIN), { grain: 'y' });
    kit.wood.tube([0, y + 1.3, 0.3], [0, y + 1.3, 1.5], 0.04, 0.04, scaleC(PAL.iron, GAIN * 0.8), { seg: 5, lenSeg: 1, ao: 0 });
  });
  kit.anchor('door', 0, 0, info.hd + 1.2);
  return kit.finish({ info });
}

// ---------------- stable ----------------
export function stable(opts = {}) {
  const kit = new Kit(opts.seed ?? 6, 'stable');
  const w = 5.6, d = 10.8;
  const doors = [];
  const windows = [];
  for (const s of [-3.5, 0, 3.5]) doors.push({ wall: 'right', s, w: 1.1, h: 1.75, leaf: 'closed', step: false });
  for (const s of [-1.75, 1.75]) windows.push({ wall: 'right', s, y: 1.3, w: 0.5, h: 0.45, shutters: 'blue', carved: false });
  for (const s of [-3.2, 0, 3.2]) windows.push({ wall: 'left', s, y: 1.3, w: 0.5, h: 0.45, shutters: 'blue', carved: false, lit: kit.chance(0.5) });
  const info = cabin(kit, {
    w, d, r: 0.19, courses: 6, pitch: 0.72, oe: 0.85, og: 0.6, snow: 0.3, paint: PAL.blueFaded, doors, windows, atticWindow: false, smokeHole: false,
    leanTo: { wall: 'left', s: 0, len: 6, depth: 1.6, wood: true },
  });
  kit.anchor('door', info.doorRecs[1].x, 0, info.doorRecs[1].z);
  return kit.finish({ info });
}

// ---------------- shed ----------------
export function shed(opts = {}) {
  const kit = new Kit(opts.seed ?? 8, 'shed');
  const info = cabin(kit, {
    w: 3.2, d: 3.0, r: 0.17, courses: 5, pitch: 0.9, oe: 0.7, og: 0.45, snow: 0.26, paint: PAL.blueFaded, shutters: 'none',
    doors: [{ wall: 'front', s: 0.0, w: 0.95, h: 1.55, leaf: 'closed', step: false }],
    windows: [], atticWindow: false, smokeHole: false, ...(opts.spec || {}),
  });
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  return kit.finish({ info });
}

// ---------------- outhouse ----------------
export function outhouse(opts = {}) {
  const kit = new Kit(opts.seed ?? 12, 'outhouse');
  const w = 1.3, d = 1.4, h = 2.0;
  kit.footprint = { hw: w / 2 + 0.1, hd: d / 2 + 0.1 };
  const plank = () => mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.6).multiplyScalar(GAIN * kit.r(0.85, 1.1));
  const tilt = kit.rs() * 0.02;
  kit.frame(0, 0, 0, 0, () => {
    kit.stone.box(0, -0.2, 0, w + 0.2, 0.4, d + 0.2, scaleC(PAL.stoneDark, GAIN * 0.9), { uv: [2, 2] });
    // Walls from vertical boards.
    const board = (x0, z0, x1, z1, hh) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 0.17);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const hx = x0 + (x1 - x0) * t, hz = z0 + (z1 - z0) * t;
        kit.wood.box(hx, hh / 2, hz, len / n - 0.01, hh, 0.05, plank(), { grain: 'y', ry: Math.atan2(-(z1 - z0), x1 - x0), rz: tilt, skip: '-y' });
      }
    };
    board(-w / 2, d / 2, w / 2, d / 2, h + 0.1);
    board(-w / 2, -d / 2, w / 2, -d / 2, h + 0.35);
    board(-w / 2, -d / 2, -w / 2, d / 2, h + 0.22);
    board(w / 2, -d / 2, w / 2, d / 2, h + 0.22);
    // Door with a crescent cutout.
    kit.wood.box(0, 0.95, d / 2 + 0.04, 0.8, 1.8, 0.04, scaleC(PAL.plankDark, GAIN * 1.1), { grain: 'y', ry: 0.05 });
    kit.wood.box(0, 1.55, d / 2 + 0.07, 0.12, 0.2, 0.012, scaleC(0x0a0806, 1), { rz: 0.4 });
    kit.wood.box(0, 1.5, d / 2 + 0.07, 0.17, 0.05, 0.012, scaleC(0x0a0806, 1), {});
    kit.wood.tube([0.3, 0.95, d / 2 + 0.07], [0.3, 1.05, d / 2 + 0.07], 0.012, 0.012, scaleC(PAL.iron, GAIN * 0.8), { seg: 4, lenSeg: 1, ao: 0 });
    shedRoof(kit, V3(-w / 2 - 0.25, h + 0.4, -d / 2 - 0.1), V3(w / 2 + 0.25, h + 0.4, -d / 2 - 0.1), V3(-w / 2 - 0.25, h + 0.1, d / 2 + 0.35), V3(w / 2 + 0.25, h + 0.1, d / 2 + 0.35), { th: 0.06, snow: 0.2, pitch: 0.25, nu: 2, jag: 0.25 });
  });
  kit.box(0, 0, w / 2, d / 2, 0);
  kit.anchor('door', 0, 0, d / 2 + 0.6);
  return kit.finish({});
}

// ---------------- boathouse ----------------
export function boathouse(opts = {}) {
  const kit = new Kit(opts.seed ?? 14, 'boathouse');
  const w = 6.6, d = 9.4, r = 0.2;
  const info = cabin(kit, {
    w, d, r, courses: 8, pitch: 0.66, oe: 0.9, og: 0.8, snow: 0.3, paint: PAL.blueFaded, shutters: 'blue', style: { low: 0x2c261f, mid: 0x4f4a42, high: 0x7a766c },
    doors: [{ wall: 'front', s: 0, w: 3.4, h: 2.7, leaf: 'open', step: false }, { wall: 'left', s: -2.0, w: 0.95, h: 1.8, leaf: 'closed', step: false }],
    windows: [{ wall: 'right', s: -1.5, y: 1.3, w: 0.7, h: 0.7, shutters: 'blue' }, { wall: 'right', s: 2.0, y: 1.3, w: 0.7, h: 0.7, shutters: 'blue' }],
    atticWindow: false, smokeHole: false, interior: opts.interior ?? true, floor: 'boards',
  });
  const f = wallFrame('front', info.hw, info.hd);
  doubleDoor(kit, f, 0, 3.4, 2.7, r, opts.ajar ?? 0.9);
  // Slipway skids running out toward the water.
  const z0 = info.hd + 0.3;
  for (const sx of [-1.1, 0, 1.1]) {
    kit.wood.tube([sx, 0.02, z0 - 0.3], [sx, -0.45, z0 + 6.5], 0.1, 0.11, mixC(PAL.logDark, PAL.logWeathered, 0.5).multiplyScalar(GAIN), { seg: 7, lenSeg: 3, ao: 0.3, uo: kit.rand() });
  }
  for (let i = 0; i < 9; i++) kit.wood.box(0, -0.04 - i * 0.07, z0 + 0.5 + i * 0.72, 3.2, 0.06, 0.2, mixC(PAL.plank, PAL.plankDark, 0.5).multiplyScalar(GAIN), { grain: 'x' });
  kit.skirtExclude.push({ x: 0, z: z0 + 3.0, hw: 2.2, hd: 4, yaw: 0 });
  kit.anchor('slip', 0, 0, z0 + 6.5);
  kit.anchor('door', 0, 0.05, info.hd + 1.0);
  return kit.finish({ info });
}

// ---------------- banya ----------------
export function banya(opts = {}) {
  const kit = new Kit(opts.seed ?? 15, 'banya');
  const w = 4.6, d = 5.6, r = 0.2;
  const info = cabin(kit, {
    w, d, r, courses: 7, interior: true, pitch: 0.72, oe: 0.8, og: 0.6, snow: 0.3, paint: PAL.ochre, shutters: 'none', style: { low: 0x2a231d, mid: 0x4b4239, high: 0x6f695f },
    doors: [{ wall: 'front', s: -0.9, w: 0.9, h: 1.55, leaf: 'object', id: 'front', hingeLeft: true }],
    windows: [{ wall: 'front', s: 1.2, y: 0.95, w: 0.5, h: 0.4, shutters: 'none', carved: false }, { wall: 'left', s: 0.5, y: 1.0, w: 0.5, h: 0.4, shutters: 'none', carved: false }],
    chimney: { wall: 'back', s: 0, w: 1.7, d: 1.0 }, atticWindow: false,
    porch: { wall: 'front', s: -0.9, w: 2.4, depth: 1.5, benches: true, doorS: -0.9, hHigh: 2.7, hLow: 2.15, paint: PAL.ochre },
  });
  const hw = info.hw, hd = info.hd, y = 0.05;
  // Stove of stones with a glowing mouth, back wall under the chimney.
  kit.frame(0, y, -hd + r + 0.75, 0, () => {
    for (let i = 0; i < 24; i++) {
      const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN * kit.r(0.8, 1.05));
      kit.stone.box(kit.rs() * 0.55, 0.15 + (i % 4) * 0.28, kit.rs() * 0.3, kit.r(0.35, 0.55), kit.r(0.25, 0.35), kit.r(0.35, 0.5), sc, { ry: kit.rand() * 3, uv: [2, 2] });
    }
    kit.stone.box(0, 0.5, 0, 1.3, 1.0, 1.0, scaleC(PAL.stoneDark, GAIN * 0.7), { uv: [2, 2] });
    kit.ember.quad([-0.3, 0.2, 0.52], [0.3, 0.2, 0.52], [0.26, 0.62, 0.52], [-0.26, 0.62, 0.52], new THREE.Color(2.5, 0.95, 0.25), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  });
  kit.light(0, y + 0.8, -hd + 1.6, { color: 0xff8a30, intensity: 1.6, radius: 8, kind: 'hearth' });
  kit.anchor('hearth', 0, y + 0.6, -hd + 1.5);
  kit.box(0, -hd + r + 0.75, 0.8, 0.6, 0);
  // Three-tier sweating bench along the right wall.
  for (let t = 0; t < 3; t++) {
    const c = mixC(PAL.plank, PAL.plankDark, 0.3).multiplyScalar(GAIN);
    kit.wood.box(hw - 0.55 - t * 0.0, 0.4 + t * 0.4, -0.6, 1.0 - t * 0.3, 0.05, 2.8, c, { grain: 'z', top: scaleC(c, 1.1) });
    kit.wood.box(hw - 0.2 - 0.0, 0.2 + t * 0.2, -0.6, 0.06, 0.4 + t * 0.4, 2.7, scaleC(c, 0.8), { grain: 'y' });
  }
  kit.box(hw - 0.55, -0.6, 0.55, 1.4, 0);
  barrel(kit, -hw + 0.6, y, hd - 0.7, 0.7, 0.3); kit.circle(-hw + 0.6, hd - 0.7, 0.3);
  stool(kit, -hw + 0.7, y, 0.4, 0.3, 0.35, 0.2);
  lantern(kit, -1.2, 2.0, 0.5, { intensity: 0.6, radius: 5 });
  // Steam: from the chimney and low from the door, so it can be seen in the cold.
  const door = info.doorRecs[0];
  kit.anchor('steam', door.x, 1.6, door.z + 0.2);
  kit.anchor('steamRoof', 0, info.roof.ridgeY + 0.1, -hd - 0.3);
  kit.anchor('door', door.x, 0, door.z);
  return kit.finish({ info });
}

// ---------------- workshop (Dobra's open barn) ----------------
export function workshop(opts = {}) {
  const kit = new Kit(opts.seed ?? 17, 'workshop');
  const w = 8.4, d = 9.2, r = 0.2;
  const info = cabin(kit, {
    w, d, r, courses: 8, interior: true, floor: 'none', openWalls: ['front'], pitch: 0.82, oe: 0.9, og: 0.9, snow: 0.3, paint: PAL.red, shutters: 'blue',
    windows: [{ wall: 'right', s: -1.5, y: 1.2, w: 0.8, h: 0.8, shutters: 'red' }, { wall: 'left', s: -1.5, y: 1.2, w: 0.8, h: 0.8, shutters: 'blue' }, { wall: 'back', s: 0, y: 1.2, w: 0.8, h: 0.8, shutters: 'red' }],
    chimney: { wall: 'back', s: 2.6, w: 1.5, d: 0.95 },
    leanTo: { wall: 'right', s: 2.0, len: 4.0, depth: 1.6, wood: true },
    atticLit: true,
  });
  const hw = info.hw, hd = info.hd, y = 0.0;
  // Beaten earth floor, scattered with straw.
  kit.stone.box(0, -0.06, 0, w - 0.2, 0.12, d - 0.2, mixC(0x6b6256, 0x5a5348, 0.5).multiplyScalar(GAIN * 0.9), { uv: [3, 3] });
  kit.walk.floors.push({ y: 0.0, polygon: [[-hw + 0.1, -hd + 0.1], [hw - 0.1, -hd + 0.1], [hw - 0.1, hd - 0.1], [-hw + 0.1, hd - 0.1]] });
  const strawCol = () => mixC(PAL.straw, 0x9a8248, kit.rand() * 0.6).multiplyScalar(1.15);
  // Straw heaps: big lumpy mounds.
  const heaps = [[-2.6, -2.9, 1.9, 1.3], [2.9, -3.2, 1.6, 1.1], [-3.1, 0.6, 1.2, 0.8], [0.5, -3.7, 1.4, 1.0], [3.2, 1.0, 1.0, 0.7]];
  for (const [hx, hz, hr, hh] of heaps) {
    kit.straw.ellipsoid(hx, y, hz, hr, hh, hr * 0.85, strawCol(), { seg: 10, rings: 6 });
    for (let k = 0; k < 4; k++) kit.straw.ellipsoid(hx + kit.rs() * hr * 0.7, y, hz + kit.rs() * hr * 0.6, hr * kit.r(0.4, 0.7), hh * kit.r(0.5, 0.9), hr * kit.r(0.4, 0.6), strawCol(), { seg: 7, rings: 4 });
    kit.circle(hx, hz, hr * 0.7);
  }
  // Sheaves leaning on the back wall and loose straw strewn on the ground.
  for (let i = 0; i < 9; i++) {
    const sx = -hw + 0.9 + i * 0.85;
    kit.straw.tube([sx, 0.0, -hd + 0.5], [sx + kit.rs() * 0.1, 1.6, -hd + 0.35], 0.12, 0.2, strawCol(), { seg: 6, lenSeg: 2, ao: 0.1, uv: [1.5, 1.5] });
  }
  for (let i = 0; i < 40; i++) {
    kit.straw.box(kit.rs() * (hw - 0.6), 0.01, kit.rs() * (hd - 0.6) + 0.3, kit.r(0.4, 1.1), 0.02, kit.r(0.15, 0.35), strawCol(), { ry: kit.rand() * 3, uv: [1.5, 1.5] });
  }
  // Tie beams with hooks for hanging effigies.
  const yb = info.yEave - 0.25;
  const hooks = [];
  for (let z = -hd + 1.5; z <= hd - 1.2; z += 2.3) {
    kit.wood.tube([-hw - 0.05, yb, z], [hw + 0.05, yb, z], 0.18, 0.17, scaleC(PAL.logDark, GAIN * 1.3), { seg: 9, lenSeg: 4, ao: 0.3, bow: [0, -0.02, 0], uo: kit.rand() });
    for (let x = -hw + 1.2; x <= hw - 1.0; x += 1.55) {
      kit.wood.box(x, yb - 0.3, z, 0.03, 0.4, 0.03, scaleC(PAL.iron, GAIN * 0.8), {});
      hooks.push([x, yb - 0.5, z]);
    }
  }
  hooks.slice(0, 12).forEach((h, i) => kit.anchor(`hook${i + 1}`, h[0], h[1], h[2]));
  // Loft over the back third, with a ladder.
  const lz0 = -hd + 0.2, lz1 = -hd + 3.4, ly = 2.55;
  for (let x = -hw + 0.2; x < hw - 0.2; x += 0.3) kit.wood.box(x + 0.15, ly, (lz0 + lz1) / 2, 0.285, 0.06, lz1 - lz0, mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN), { grain: 'z', uv: [1, 3] });
  for (const px of [-hw + 0.4, 0, hw - 0.4]) kit.wood.tube([px, 0, lz1 - 0.1], [px, ly, lz1 - 0.1], 0.13, 0.12, scaleC(PAL.logDark, GAIN * 1.3), { seg: 8, lenSeg: 2, ao: 0.3 });
  kit.wood.tube([-hw + 0.2, ly - 0.2, lz1 - 0.1], [hw - 0.2, ly - 0.2, lz1 - 0.1], 0.15, 0.15, scaleC(PAL.logDark, GAIN * 1.3), { seg: 8, lenSeg: 4, ao: 0.3 });
  ladder(kit, 1.9, 0, lz1 + 0.05, Math.PI, ly, 0.3, 0.55);
  kit.straw.ellipsoid(-1.5, ly, -hd + 1.4, 1.5, 0.6, 1.0, strawCol(), { seg: 8, rings: 4 });
  kit.anchor('loft', 0, ly, -hd + 1.6);
  kit.walk.floors.push({ y: ly, polygon: [[-hw + 0.2, lz0], [hw - 0.2, lz0], [hw - 0.2, lz1], [-hw + 0.2, lz1]], tag: 'loft' });
  kit.walk.ramps.push({ a: [1.9, 0, lz1 + 0.5], b: [1.9, ly, lz1 - 0.1], width: 0.55, ladder: true });
  // Workbench, stool, and a stove glow in the back corner.
  table(kit, 2.4, y, 0.9, Math.PI / 2, 2.2, 0.8, 0.86); kit.box(2.4, 0.9, 0.42, 1.1, 0);
  stool(kit, 1.7, y, 0.9, 0.5);
  barrel(kit, hw - 0.7, y, 2.8, 0.9, 0.35); kit.circle(hw - 0.7, 2.8, 0.35);
  sack(kit, -hw + 0.7, y, 3.0, 0.3, 1.0);
  lantern(kit, 0, yb - 0.1, 0.5, { intensity: 1.0, radius: 9 });
  kit.anchor('bench', 2.4, y + 0.86, 0.9);
  kit.anchor('door', 0, 0, hd + 1.2);
  kit.anchor('doorInside', 0, y, hd - 1.5);
  return kit.finish({ info });
}
