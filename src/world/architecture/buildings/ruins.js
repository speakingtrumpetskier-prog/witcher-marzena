// Ruins and abandoned places: the watchtower on the ridge (climbable to the valley viewpoint), the
// trapper's cabin, the ruined bathhouse at the hot spring, the charcoal burners' cold kiln and hut.
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { C, mixC, scaleC } from '../mb.js';
import { stoneRing, boulder, stroke, stoneTone } from '../masonry.js';
import { cabin } from '../cabin.js';
import { slab, snowLayer, icicles } from '../roofs.js';
import { stairs, snowPillow, bench } from '../details.js';
import { wallFrame, toLocal, logWall } from '../walls.js';
import { stool } from '../furnish.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const wood = (k = 1) => mixC(PAL.logDark, PAL.logWeathered, 0.45).multiplyScalar(GAIN * k);

// Minimal stroke font (unit cell 0..1 x 0..1) for scrawled text on boards and beams.
const FONT = {
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.7, 0.5]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.4], [0.8, 0.4]]],
  K: [[[0, 0], [0, 1]], [[1, 1], [0, 0.5], [1, 0]]],
  S: [[[1, 0.9], [0.1, 0.95], [0, 0.55], [0.9, 0.45], [1, 0.05], [0, 0.1]]],
  I: [[[0.5, 0], [0.5, 1]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  G: [[[1, 0.9], [0, 0.9], [0, 0.1], [1, 0.1], [1, 0.45], [0.5, 0.45]]],
  J: [[[0.8, 1], [0.8, 0.2], [0.5, 0], [0.1, 0.15]]],
  W: [[[0, 1], [0.25, 0], [0.5, 0.7], [0.75, 0], [1, 1]]],
  '+': [[[0.5, 0.2], [0.5, 0.8]], [[0.2, 0.5], [0.8, 0.5]]],
  ' ': [],
};
// Draw text on a plane. frame: { origin: [x,y,z], ax: Vector3 (reading direction), ay: Vector3 (up), n: Vector3 (normal) }
export function scrawl(mb, text, frame, h, col, o = {}) {
  const w = h * 0.62, gap = h * 0.28;
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch];
    if (!g) { x += w + gap; continue; }
    for (const poly of g) {
      const pts = poly.map(([a, b]) => [x + a * w + (o.jitter ? (Math.sin(a * 9 + b * 5 + x) * 0.02) * h : 0), b * h]);
      stroke(mb, pts, o.width ?? h * 0.09, frame.origin, frame.ax, frame.ay, frame.n, col, o.lift ?? 0.012);
    }
    x += w + gap;
  }
  return x;
}

// ---------------- watchtower ruin ----------------
export function watchtowerRuin(opts = {}) {
  const kit = new Kit(opts.seed ?? 201, 'watchtowerRuin');
  kit.footprint = { hw: 4.4, hd: 4.4 };
  kit.skirt = false;
  const HO = 2.9, HI = 1.9;
  const topFn = (wall, s) => {
    const nz = (s0) => 0.35 * Math.sin(s * 2.1 + s0) + 0.2 * Math.sin(s * 5.3 + s0 * 2);
    switch (wall) {
      case 'back': return 9.3 - Math.abs(s) * 0.35 + nz(1);
      case 'right': return 6.4 + (s + HO) * 0.5 + nz(2); // s > 0 runs north
      case 'left': return 8.4 - (s + HO) * 0.95 + nz(3); // s > 0 runs south
      default: return 2.5 + 0.25 * Math.abs(s) + nz(4);
    }
  };
  stoneRing(kit, {
    hw: HO, hd: HO, inner: HI, y0: -0.8, batter: 0.025, bh: 0.44,
    holes: [
      { wall: 'front', s0: -0.7, s1: 0.7, y0: -0.8, y1: 2.15 },
      { wall: 'right', s0: -0.3, s1: -0.08, y0: 3.7, y1: 4.9 },
      { wall: 'back', s0: 0.9, s1: 1.12, y0: 5.2, y1: 6.7 },
      { wall: 'left', s0: -1.2, s1: -0.98, y0: 4.4, y1: 5.6 },
    ],
    jag: 0.6, lichen: 0.1, ruin: 0.012, top: topFn,
  });
  // A heavy lintel stone over the door.
  kit.stone.box(0, 2.28, HO - 0.5, 1.7, 0.34, 1.0, scaleC(PAL.stone, GAIN * 0.85), { uv: [2, 2], ry: 0.02 });
  // Fallen blocks and rubble heaps in and around.
  for (let i = 0; i < 14; i++) {
    const a = kit.rand() * Math.PI * 2, r = kit.r(0.0, 1.5);
    boulder(kit, Math.cos(a) * r * 0.9, -0.1, Math.sin(a) * r * 0.9, kit.r(0.3, 0.7), kit.r(0.2, 0.5), kit.r(0.3, 0.6), { seg: 6, rings: 3 });
  }
  for (let i = 0; i < 12; i++) {
    const a = kit.rand() * Math.PI * 2, r = kit.r(3.3, 5.4);
    boulder(kit, Math.cos(a) * r, -0.15, Math.sin(a) * r, kit.r(0.35, 0.9), kit.r(0.25, 0.6), kit.r(0.35, 0.8), { seg: 7, rings: 3 });
  }
  // Packed floor and snow drifted in through the door.
  kit.stone.box(0, -0.05, 0, 3.7, 0.1, 3.7, scaleC(0x4a443e, GAIN * 0.7), { uv: [3, 3] });
  snowPillow(kit, 0.2, 0.0, 1.4, 1.5, 0.5, 1.2, { nu: 4, nv: 10 });
  snowPillow(kit, -1.0, 0.0, -1.0, 0.9, 0.35, 0.8, { nu: 3, nv: 8 });
  // Snow on the broken wall crowns: lumps along the high edges.
  for (let i = 0; i < 26; i++) {
    const wallN = ['back', 'right', 'left', 'front'][i % 4];
    const f = wallFrame(wallN, HO - 0.5, HO - 0.5);
    const s = kit.r(-HO + 0.6, HO - 0.6);
    const y = topFn(wallN, s) + 0.02;
    const p = toLocal(f, s, y, 0);
    snowPillow(kit, p[0], p[1], p[2], kit.r(0.35, 0.8), kit.r(0.1, 0.25), 0.5, { nu: 3, nv: 8 });
  }
  // Floor beam stubs through the walls (timber floors at 3.2 and 6.2) and a collapsed frame inside.
  const beamC = wood(1.15);
  for (const [y, n] of [[3.2, 5], [6.2, 4]]) {
    for (let i = 0; i < n; i++) {
      const s = -1.4 + (2.8 * i) / (n - 1);
      for (const wallN of ['right', 'left']) {
        const f = wallFrame(wallN, HO, HO);
        if (y > topFn(wallN, s) - 0.5) continue;
        const a = toLocal(f, s, y, -2.0), b = toLocal(f, s, y + kit.rs() * 0.05, 0.25 + kit.r(0, 0.25));
        kit.wood.tube(a, b, 0.13, 0.12, beamC, { seg: 7, lenSeg: 2, ao: 0.28, uo: kit.rand() });
      }
    }
  }
  // Timber that fell: beams leaning from the high corner, planks on the rubble.
  kit.wood.tube([2.1, 7.6, -2.1], [-0.3, 3.5, 0.2], 0.16, 0.14, beamC, { seg: 8, lenSeg: 3, ao: 0.28, bow: [0, -0.1, 0] });
  kit.wood.tube([-2.0, 7.9, -2.1], [0.8, 4.2, -0.6], 0.14, 0.13, beamC, { seg: 8, lenSeg: 3, ao: 0.28 });
  kit.wood.tube([1.8, 6.4, 1.9], [0.0, 2.0, 0.6], 0.12, 0.11, beamC, { seg: 7, lenSeg: 3, ao: 0.28 });
  for (let i = 0; i < 9; i++) {
    const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.6).multiplyScalar(GAIN);
    kit.wood.box(kit.rs() * 1.3, 0.12 + kit.rand() * 0.5, kit.rs() * 1.3, kit.r(1.0, 2.2), 0.05, 0.22, c, { ry: kit.rand() * 3, rz: kit.rs() * 0.5, rx: kit.rs() * 0.3, uv: [1, 3] });
  }
  // A section of the fallen shingle roof lying on the rubble on the east side, with its own snow.
  {
    const sl = slab(kit, V3(3.0, 0.6, 1.2), V3(3.0, 0.8, 4.2), V3(5.6, 1.9, 1.2), V3(5.6, 2.1, 4.2), { th: 0.1, nu: 4, pitch: 0.5, step: 0.25, jag: 0.25, wave: 0.05 });
    const P = sl.P, T = P.map((row, i) => row.map((p, j) => Math.max(0.035, 0.2 * (0.6 + 0.5 * kit.n2(p.x * 0.7, p.z * 0.7)) * (j > 0 && j < row.length - 1 ? 1 : 0.5))));
    snowLayer(kit, { P, T, lip: [1, 0, 1, 1], lipOut: 0.15, under: 0.14 });
    kit.wood.tube([3.3, 0.3, 1.0], [5.4, 1.2, 4.6], 0.1, 0.09, beamC, { seg: 6, lenSeg: 2, ao: 0.25 });
    kit.wood.tube([4.0, 0.6, 1.0], [5.9, 1.7, 4.8], 0.1, 0.09, beamC, { seg: 6, lenSeg: 2, ao: 0.25 });
  }
  // Tally marks scratched into a smooth panel on the inner face of the north wall, and the stash stone.
  {
    const zi = -(HO - (HO - HI)) + 0.06; // inner face of the back wall
    kit.stone.box(-0.2, 1.5, zi + 0.0, 2.4, 1.1, 0.09, scaleC(PAL.stoneWarm, GAIN * 0.95), { uv: [2, 2] });
    const ax = V3(1, 0, 0), ay = V3(0, 1, 0), nz = V3(0, 0, 1);
    const ink = scaleC(0x23201b, 1);
    let count = 0;
    for (let row = 0; row < 3; row++) {
      for (let g = 0; g < 5; g++) {
        const gx = -1.25 + g * 0.42, gy = 1.18 + row * 0.33;
        for (let k = 0; k < 4; k++) stroke(kit.stone, [[gx + k * 0.06, gy], [gx + k * 0.06 + kit.rs() * 0.01, gy + 0.2]], 0.014, [0, 0, zi + 0.045], ax, ay, nz, ink, 0.01);
        stroke(kit.stone, [[gx - 0.03, gy + 0.03], [gx + 0.23, gy + 0.17]], 0.014, [0, 0, zi + 0.045], ax, ay, nz, ink, 0.01);
        count++;
      }
    }
    void count;
    kit.anchor('tally', -0.2, 1.7, zi + 0.2);
    // The loose stone: sits slightly proud at the base of the west wall with a dark gap behind.
    kit.stone.box(-(HO - (HO - HI)) + 0.15, 0.3, 0.6, 0.5, 0.42, 0.6, scaleC(PAL.stone, GAIN * 1.05), { uv: [2, 2], ry: 0.08 });
    kit.stone.box(-(HO - (HO - HI)) - 0.1, 0.3, 0.6, 0.2, 0.36, 0.5, scaleC(0x0c0b0a, 1), { uv: [1, 1] });
    kit.anchor('stash', -(HO - (HO - HI)) + 0.6, 0.3, 0.6);
  }
  // ---- exterior wooden stairs to the viewpoint ----
  const yA = 3.36, yB = 6.72;
  kit.indoor(false);
  stairs(kit, -3.5, 0, 3.2, Math.PI, { width: 1.0, steps: 14, rise: yA / 14, run: 0.3, rails: false });
  // Landing at the NW corner, then flight 2 east along the north face.
  const deck = (x0, z0, x1, z1, y, tag) => {
    for (let z = z0; z < z1 - 0.01; z += 0.26) {
      const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.05));
      kit.wood.box((x0 + x1) / 2, y - 0.04, z + 0.13, x1 - x0, 0.07, 0.25, c, { grain: 'x', top: scaleC(c, 1.08), uv: [1, 3] });
    }
    kit.walk.floors.push({ y, polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], tag });
  };
  deck(-4.0, -4.0, -3.0, -1.0, yA, 'landing');
  stairs(kit, -3.0, yA, -3.5, Math.PI / 2, { width: 1.0, steps: 14, rise: (yB - yA) / 14, run: 0.3, rails: false });
  for (let x = 1.2; x < 3.6; x += 0.26) {
    const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.05));
    kit.wood.box(x + 0.13, yB - 0.04, -3.5, 0.25, 0.07, 1.2, c, { grain: 'z', top: scaleC(c, 1.08), uv: [1, 3] });
  }
  kit.walk.floors.push({ y: yB, polygon: [[1.2, -4.1], [3.6, -4.1], [3.6, -2.9], [1.2, -2.9]], tag: 'viewpoint' });
  // Posts holding the stairs and platforms up, bracing, and a broken rail.
  const post = (x, z, y) => kit.wood.tube([x, -0.6, z], [x, y - 0.1, z], 0.1, 0.09, wood(1.05), { seg: 6, lenSeg: 2, ao: 0.25 });
  for (const z of [-4.0, -1.0]) { post(-4.0, z, yA); post(-3.0, z, yA); }
  for (let k = 1; k <= 3; k++) { post(-3.0 + 1.05 * k, -3.0, yA + ((yB - yA) * k) / 4 * 1.0); post(-3.0 + 1.05 * k, -4.0, yA + ((yB - yA) * k) / 4); }
  post(3.5, -4.0, yB); post(3.5, -3.0, yB);
  for (let k = 1; k <= 3; k++) { post(-3.5 - 0.0, 3.2 - 1.05 * k - 0.5, (yA * k) / 4); }
  // Rail on the viewpoint's open side with a missing section.
  kit.wood.tube([1.2, yB + 0.95, -4.1], [3.6, yB + 0.9, -4.1], 0.045, 0.045, wood(1.15), { seg: 6, lenSeg: 3, ao: 0.2 });
  for (const x of [1.3, 2.0, 3.55]) kit.wood.tube([x, yB, -4.1], [x, yB + 0.95, -4.1], 0.045, 0.045, wood(1.1), { seg: 5, lenSeg: 1, ao: 0.2 });
  // Snow on the viewpoint deck edge.
  snowPillow(kit, 3.0, yB + 0.02, -3.2, 0.5, 0.08, 0.3, { nu: 3, nv: 8 });
  kit.walk.ramps.push({ a: [-3.5, 0, 3.2], b: [-3.5, yA, -1.0], width: 1.0, tag: 'flight1' });
  kit.walk.ramps.push({ a: [-3.0, yA, -3.5], b: [1.2, yB, -3.5], width: 1.0, tag: 'flight2' });
  kit.anchor('vista', 3.0, yB, -3.5);
  kit.anchor('door', 0, 0, HO + 1.5);
  kit.anchor('inside', 0, 0, 0);
  kit.anchor('stairs', -3.5, 0, 3.5);
  // Colliders: wall segments (door gap), and the stair posts are ignored (ramps).
  const wt = HO - HI;
  kit.box(0, -(HO - wt / 2), HO, wt / 2);
  kit.box(-(HO - wt / 2), 0, wt / 2, HO);
  kit.box(HO - wt / 2, 0, wt / 2, HO);
  kit.box(-(HO + 0.7) / 2, HO - wt / 2, (HO - 0.7) / 2, wt / 2);
  kit.box((HO + 0.7) / 2, HO - wt / 2, (HO - 0.7) / 2, wt / 2);
  kit.interior = true;
  kit.walk.floors.push({ y: 0, polygon: [[-HI, -HI], [HI, -HI], [HI, HI], [-HI, HI]], tag: 'ground' });
  return kit.finish({ noFoundation: false });
}

// ---------------- trapper's cabin (ruined) ----------------
export function trapperCabin(opts = {}) {
  const kit = new Kit(opts.seed ?? 211, 'trapperCabin');
  const w = 4.4, d = 3.8;
  const info = cabin(kit, {
    w, d, r: 0.17, courses: 7, pitch: 0.82, oe: 0.7, og: 0.4, snow: 0.34, doorLantern: false, lean: 2.5, paint: PAL.plankDark, shutters: 'none', atticWindow: false, smokeHole: false, interior: true,
    roofOpts: { ruin: { leftGone: true }, ornament: false, sag: 0.18, jag: 0.35 },
    style: { low: 0x1f1b17, mid: 0x3e362f, high: 0x625c52, silver: 0.3 },
    doors: [{ wall: 'front', s: -0.6, w: 0.95, h: 1.75, leaf: 'open', step: false }],
    windows: [{ wall: 'right', s: 0.2, y: 1.0, w: 0.6, h: 0.6, shutters: 'none', lit: false, carved: false }],
    chimney: { wall: 'back', s: 0.3, w: 1.2, d: 0.8, smoke: false, above: 0.4 },
    dropLog: (wall, k, sm, len) => {
      if (wall === 'left' && k >= 3) return true; // west wall fallen above the third course
      if (wall === 'front' && k >= 4 && sm < 0.4) return true;
      if (wall === 'back' && k >= 6) return kit.chance(0.5);
      if (wall === 'right' && k >= 6 && sm > 0.8) return true;
      return len < 0.6 && kit.chance(0.25);
    },
  });
  void info;
  // Missing rafters on the fallen side: bare poles, some broken, some on the ground.
  const rafter = wood(1.1);
  const ridgeY = info.roof.ridgeY - 0.2;
  for (let z = -d / 2 - 0.2; z < d / 2 + 0.3; z += 0.9) {
    if (kit.chance(0.35)) continue;
    const broken = kit.chance(0.4);
    kit.wood.tube([0.0, ridgeY, z], [broken ? -w * 0.28 : -w / 2 - 0.5, broken ? ridgeY - 1.0 - kit.rand() * 0.8 : info.yEave - 0.15, z], 0.07, 0.06, rafter, { seg: 6, lenSeg: 2, ao: 0.25 });
  }
  for (let i = 0; i < 7; i++) {
    kit.wood.box(-w / 2 - 0.2 + kit.rs() * 1.5, 0.15 + kit.rand() * 0.4, kit.rs() * 1.5, kit.r(0.8, 1.8), 0.05, 0.2, mixC(PAL.plank, PAL.plankDark, kit.rand()).multiplyScalar(GAIN * 0.9), { ry: kit.rand() * 3, rz: kit.rs() * 0.5, uv: [1, 3] });
  }
  // Snow drifted inside; a table and a bunk skeleton; the trapper's wolf pelts (dark hide quads) on the wall.
  kit.indoor(true);
  snowPillow(kit, -0.8, 0.05, 0.3, 1.5, 0.35, 1.2, { nu: 3, nv: 10 });
  kit.indoor(false);
  kit.wood.box(1.0, 0.45, -1.0, 0.9, 0.06, 1.8, scaleC(PAL.plankDark, GAIN), { grain: 'z' });
  for (const [sx, sz] of [[0.6, -1.9], [1.4, -1.9], [0.6, -0.1], [1.4, -0.1]]) kit.wood.tube([sx, 0.02, sz], [sx, 0.44, sz], 0.04, 0.04, wood(1), { seg: 5, lenSeg: 1, ao: 0.2 });
  kit.anchor('door', info.doorRecs[0].x, 0, info.doorRecs[0].z);
  kit.anchor('diary', 1.0, 0.5, -1.0);
  return kit.finish({ info });
}

// ---------------- ruined bathhouse at the hot spring ----------------
export function ruinedBathhouse(opts = {}) {
  const kit = new Kit(opts.seed ?? 221, 'ruinedBathhouse');
  kit.footprint = { hw: 4.6, hd: 3.8 };
  kit.skirt = false;
  const w = 7.0, d = 5.0, r = 0.19, P = 2 * r * 0.9;
  // Low fieldstone foundation walls with moss.
  stoneRing(kit, { hw: w / 2, hd: d / 2, t: 0.8, y0: -0.8, bh: 0.38, top: (wall, s) => 0.2 + 0.25 * Math.sin(s * 1.9) + (wall === 'back' ? 0.5 : 0), holes: [{ wall: 'front', s0: -0.7, s1: 0.7, y0: -1, y1: 3 }], jag: 0.3, lichen: 0.35 });
  // Log walls partially standing: back and left walls up to different heights.
  kit.indoor(false);
  for (const [wall, maxK] of [['back', 7], ['left', 5], ['right', 3], ['front', 2]]) {
    const f = wallFrame(wall, w / 2 - 0.2, d / 2 - 0.2);
    logWall(kit, f, {
      courses: 8, r, pitch: P, y0: 0.3, yOff: f.side ? P / 2 : 0, openings: wall === 'front' ? [{ s0: -0.7, s1: 0.7, y0: 0, y1: 2.2 }] : [],
      style: { low: 0x1f1b17, mid: 0x3a332c, high: 0x5d574d, silver: 0.3 },
      dropLog: (k, sm) => k >= maxK || (k >= maxK - 2 && kit.chance(0.3)) || (sm > 1.5 && k >= maxK - 1),
    });
  }
  // Moss patches on the stone (green in winter by the warm water): flat moss pads.
  for (let i = 0; i < 14; i++) {
    const a = kit.rand() * Math.PI * 2, rr = kit.r(1.5, 3.4);
    kit.stone.box(Math.cos(a) * rr * 1.1, 0.3, Math.sin(a) * rr * 0.75, kit.r(0.4, 0.9), 0.04, kit.r(0.3, 0.7), mixC(0x5d7a3a, 0x7a8f4a, kit.rand()).multiplyScalar(0.9), { ry: kit.rand() * 3, uv: [1, 1] });
  }
  // The pool: stone rim, dark teal water that never freezes, steam anchor.
  const px = 0.0, pz = 0.3, pw = 3.2, pd = 2.2;
  for (const [x, z, sx, sz] of [[px, pz - pd / 2 - 0.2, pw + 0.8, 0.4], [px, pz + pd / 2 + 0.2, pw + 0.8, 0.4], [px - pw / 2 - 0.2, pz, 0.4, pd], [px + pw / 2 + 0.2, pz, 0.4, pd]]) {
    for (let k = 0; k < 2; k++) kit.stone.box(x, 0.12 + k * 0.28, z, sx, 0.3, sz, stoneTone(kit, { lichen: 0.3 }), { uv: [2, 2], ry: kit.rs() * 0.03, top: scaleC(PAL.stone, GAIN * 1.0) });
  }
  kit.ice.box(px, 0.2, pz, pw, 0.04, pd, mixC(0x2c5a60, 0x3a7078, 0.5), { uv: [1, 1] });
  kit.anchor('steam', px, 0.4, pz);
  kit.anchor('pool', px, 0.25, pz);
  kit.circle(px, pz, 0.01);
  // Collapsed roof: leaning beams, a sagging ridge fragment and fallen shingle section.
  const beam = wood(1.15);
  kit.wood.tube([-w / 2 + 0.2, 2.8, -d / 2 + 0.2], [1.0, 0.5, 0.6], 0.14, 0.12, beam, { seg: 7, lenSeg: 3, ao: 0.28 });
  kit.wood.tube([-w / 2 + 0.2, 2.6, d / 2 - 0.2], [-0.6, 0.6, -0.3], 0.13, 0.12, beam, { seg: 7, lenSeg: 3, ao: 0.28 });
  kit.wood.tube([0.2, 2.7, -d / 2 + 0.2], [2.4, 0.9, 1.2], 0.12, 0.11, beam, { seg: 7, lenSeg: 3, ao: 0.28 });
  {
    const sl = slab(kit, V3(1.5, 0.5, 0.6), V3(1.5, 0.7, 3.4), V3(3.8, 1.6, 0.6), V3(3.8, 1.8, 3.4), { th: 0.09, nu: 4, pitch: 0.5, step: 0.25, jag: 0.3, wave: 0.05 });
    const T = sl.P.map((row) => row.map((p) => Math.max(0.035, 0.14 * (0.6 + 0.6 * kit.n2(p.x * 0.8, p.z * 0.8)))));
    snowLayer(kit, { P: sl.P, T, lip: [1, 0, 1, 1], lipOut: 0.12, under: 0.12 });
  }
  // Initials J + W carved in a standing beam above the door.
  kit.wood.tube([-w / 2 + 0.35, 0.3, d / 2 - 0.3], [-w / 2 + 0.35, 2.4, d / 2 - 0.3], 0.14, 0.13, beam, { seg: 8, lenSeg: 3, ao: 0.28 });
  kit.wood.tube([w / 2 - 0.35, 0.3, d / 2 - 0.3], [w / 2 - 0.35, 2.4, d / 2 - 0.3], 0.14, 0.13, beam, { seg: 8, lenSeg: 3, ao: 0.28 });
  kit.wood.box(0, 2.35, d / 2 - 0.3, w - 0.6, 0.32, 0.26, mixC(PAL.logDark, PAL.logWeathered, 0.3).multiplyScalar(GAIN * 1.1), { grain: 'x' });
  {
    const fr = { origin: [-0.55, 2.28, d / 2 - 0.3 + 0.13], ax: V3(1, 0, 0), ay: V3(0, 1, 0), n: V3(0, 0, 1) };
    scrawl(kit.wood, 'J + W', fr, 0.2, scaleC(0x17120e, 1), { jitter: true, lift: 0.008, width: 0.02 });
    kit.anchor('initials', -0.2, 2.4, d / 2 + 0.4);
  }
  snowPillow(kit, -2.2, 0.35, -1.4, 1.2, 0.3, 0.9, { nu: 3, nv: 9 });
  bench(kit, -2.4, 0.3, 1.3, 0.3, 1.5);
  kit.anchor('door', 0, 0, d / 2 + 1.4);
  return kit.finish({ noFoundation: true });
}

// ---------------- charcoal kiln (cold) and the burners' hut ----------------
export function charcoalKiln(opts = {}) {
  const kit = new Kit(opts.seed ?? 231, 'charcoalKiln');
  kit.footprint = { hw: 5.0, hd: 4.0 };
  kit.skirt = false;
  const rKiln = opts.radius ?? 2.4;
  // The mound: a soot-black earth dome with a chimney opening and vent holes, snow on its crown.
  const soot = mixC(0x2a2622, 0x4a4238, 0.4).multiplyScalar(GAIN * 0.55);
  const prof = [[rKiln * 1.08, 0], [rKiln * 1.04, 0.28], [rKiln * 0.94, 0.78], [rKiln * 0.74, 1.3], [rKiln * 0.46, 1.68], [rKiln * 0.2, 1.84], [0.001, 1.86]];
  kit.stone.lathe(prof, soot, { seg: 20, uv: [2.5, 2.5], wobble: 0.04, ph: 2 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    kit.stone.box(Math.cos(a) * rKiln * 1.0, 0.3, Math.sin(a) * rKiln * 1.0, 0.22, 0.2, 0.2, scaleC(0x0a0908, 1), { ry: -a, uv: [1, 1] });
  }
  kit.stone.tube([0, 1.82, 0], [0, 2.1, 0], 0.4, 0.34, scaleC(PAL.stoneDark, GAIN * 0.7), { seg: 9, lenSeg: 1, ao: 0.1, uv: [2, 2] });
  kit.stone.tube([0, 2.08, 0], [0, 2.12, 0], 0.2, 0.2, scaleC(0x050505, 1), { seg: 8, lenSeg: 1, ao: 0 });
  // Patches of snow over the dome, drifts at the base.
  for (let i = 0; i < 7; i++) {
    const a = kit.rand() * Math.PI * 2, t = kit.r(0.2, 0.8);
    const rr = rKiln * (1 - t * 0.85), yy = 0.25 + t * 1.5;
    snowPillow(kit, Math.cos(a) * rr * 0.9, yy - 0.05, Math.sin(a) * rr * 0.9, kit.r(0.4, 0.9), 0.14, kit.r(0.35, 0.7), { nu: 3, nv: 8 });
  }
  snowPillow(kit, 0, 1.78, 0, 0.55, 0.1, 0.55, { nu: 3, nv: 8 });
  // Stacked cordwood ready to burn, bark-side out, and leaning split logs.
  kit.wood.at(3.4, 0, -0.6, 0.5, () => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 9; i++) {
      kit.wood.tube([-1.2 + i * 0.27, 0.15 + j * 0.27, -0.5], [-1.2 + i * 0.27, 0.15 + j * 0.27, 0.5], 0.11, 0.11, mixC(0xa88a5a, PAL.logWeathered, kit.rand() * 0.8).multiplyScalar(GAIN * kit.r(0.75, 1.0)), { seg: 6, lenSeg: 1, ao: 0.1, endCol: 0xc9ad80 });
    }
    snowPillow(kit, 0, 1.12, 0, 1.4, 0.12, 0.55, { nu: 3, nv: 8 });
  });
  kit.circle(0, 0, rKiln * 1.0, { y1: 2.2 });
  // The burners' hut: a lean-to of logs with boards scrawled "THE LAKE SINGS".
  if (opts.hut !== false) {
    const hx = -4.2, hz = 0.8;
    kit.frame(hx, 0, hz, 0.9, () => {
      const col = () => mixC(PAL.logDark, PAL.logWeathered, kit.rand() * 0.7).multiplyScalar(GAIN * kit.r(0.8, 1.05));
      for (let i = 0; i < 12; i++) kit.wood.tube([-1.7 + i * 0.3, 0, 1.4], [-1.7 + i * 0.3 + kit.rs() * 0.02, 1.9, 0.0], 0.1, 0.1, col(), { seg: 6, lenSeg: 2, ao: 0.25, uo: kit.rand() });
      for (const sx of [-1.8, 1.8]) kit.wood.tube([sx, 0, 1.45], [sx, 1.95, 0.0], 0.1, 0.09, col(), { seg: 6, lenSeg: 2, ao: 0.25 });
      // Backboards inside, scrawled over.
      for (let i = 0; i < 8; i++) kit.wood.box(-1.5 + i * 0.4, 1.0, -0.2, 0.38, 2.0, 0.05, mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.6).multiplyScalar(GAIN), { grain: 'y', uv: [1, 3] });
      const fr = { origin: [-1.55, 1.15, -0.16], ax: V3(1, 0, 0), ay: V3(0, 1, 0), n: V3(0, 0, 1) };
      scrawl(kit.wood, 'THE LAKE SINGS', fr, 0.34, scaleC(0x120d0a, 1), { jitter: true, lift: 0.008, width: 0.035 });
      const fr2 = { origin: [-1.4, 0.55, -0.16], ax: V3(1, 0, 0), ay: V3(0, 1, 0), n: V3(0, 0, 1) };
      scrawl(kit.wood, 'THE LAKE SINGS', fr2, 0.22, scaleC(0x120d0a, 1), { jitter: true, lift: 0.008, width: 0.025 });
      // Roof of overlapping planks with snow.
      slab(kit, V3(-2.0, 2.0, 1.9), V3(2.0, 2.0, 1.9), V3(-2.0, 2.15, -0.1), V3(2.0, 2.15, -0.1), { th: 0.07, nu: 3, pitch: 0.7, step: 0.25, jag: 0.4, wave: 0.03 });
    });
    kit.box(hx, hz, 2.0, 0.9, 0.9);
    kit.anchor('hut', hx + 0.8, 0, hz + 1.2);
    kit.anchor('scrawl', hx, 1.1, hz);
  }
  kit.anchor('kiln', 0, 0.5, 0);
  kit.anchor('door', 0, 0, rKiln + 1.5);
  void icicles; void stool; void C;
  return kit.finish({ noFoundation: true });
}
