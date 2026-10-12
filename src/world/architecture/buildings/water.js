// Shore and water structures: the fishing hut on stilts (half over the ice) and the frozen mill with
// its waterwheel as a separate animatable object.
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { C, mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { wallFrame, toLocal } from '../walls.js';
import { stoneRing } from '../masonry.js';
import { icicles, shedRoof, snowLayer, smooth } from '../roofs.js';
import { ladder, snowPillow, railing, firewoodStack } from '../details.js';
import { barrel, sack } from '../furnish.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const wood = (k = 1) => mixC(PAL.logDark, PAL.logWeathered, 0.45).multiplyScalar(GAIN * k);

// ---------------- fishing hut on stilts ----------------
export function fishingHut(opts = {}) {
  const kit = new Kit(opts.seed ?? 301, 'fishingHut');
  kit.noFoundation = true;
  kit.skirt = false;
  const lift = 1.55;
  const w = 3.4, d = 3.8, r = 0.17;
  const info = cabin(kit, {
    w, d, r, courses: 6, lift, plinth: false, pitch: 0.7, oe: 0.7, og: 0.5, snow: 0.3, paint: kit.pick([PAL.blueFaded, PAL.red, PAL.ochre]), shutters: 'blue',
    style: { low: 0x2a241f, mid: 0x4d453b, high: 0x716b60, silver: 0.55 },
    doors: [{ wall: 'front', s: 0.5, w: 0.9, h: 1.75, leaf: 'object', id: 'front', hingeLeft: false, step: false }],
    windows: [{ wall: 'front', s: -0.8, y: 1.0, w: 0.6, h: 0.6, shutters: 'blue' }, { wall: 'right', s: 0.2, y: 1.0, w: 0.6, h: 0.6, shutters: 'blue' }, { wall: 'left', s: -0.2, y: 1.0, w: 0.6, h: 0.6, shutters: 'blue', lit: kit.chance(0.8) }],
    atticWindow: false, smokeHole: false,
  });
  const hw = info.hw, hd = info.hd;
  // Stovepipe through the roof, smoke anchor on top.
  const px = 0.9, pz = -0.8;
  const ry = info.roof.topY(px, pz);
  const iron = scaleC(PAL.iron, GAIN * 0.7);
  kit.frame(0, lift, 0, 0, () => {
    kit.metal.tube([px, ry - 0.4, pz], [px, ry + 0.95, pz], 0.07, 0.065, iron, { seg: 7, lenSeg: 2, ao: 0.1, uv: [1, 1] });
    kit.metal.tube([px, ry + 0.95, pz], [px, ry + 1.05, pz], 0.14, 0.14, iron, { seg: 7, lenSeg: 1, ao: 0, uv: [1, 1] });
    kit.metal.tube([px, ry + 1.0, pz], [px, ry + 1.25, pz], 0.14, 0.005, iron, { seg: 7, lenSeg: 1, ao: 0, capA: false });
  });
  kit.anchor('smoke', px, lift + ry + 1.0, pz);
  // Deck on joists around the hut, wider at the front (the shore side).
  const dx0 = -hw - 1.1, dx1 = hw + 1.1, dz0 = -hd - 0.8, dz1 = hd + 1.8;
  const nb = Math.round((dz1 - dz0) / 0.24);
  for (let i = 0; i < nb; i++) {
    const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.1));
    kit.wood.box((dx0 + dx1) / 2 + kit.rs() * 0.03, lift - 0.04, dz0 + (i + 0.5) * ((dz1 - dz0) / nb), dx1 - dx0, 0.07, (dz1 - dz0) / nb - 0.012, c, { grain: 'x', top: scaleC(c, 1.08), uv: [1, 3] });
  }
  for (const x of [dx0 + 0.3, 0, dx1 - 0.3]) kit.wood.tube([x, lift - 0.25, dz0 - 0.1], [x, lift - 0.25, dz1 + 0.1], 0.12, 0.12, wood(1.1), { seg: 7, lenSeg: 4, ao: 0.3, uo: kit.rand() });
  for (const z of [dz0 + 0.5, (dz0 + dz1) / 2, dz1 - 0.5]) kit.wood.tube([dx0 - 0.1, lift - 0.34, z], [dx1 + 0.1, lift - 0.34, z], 0.1, 0.1, wood(1.1), { seg: 7, lenSeg: 4, ao: 0.3, uo: kit.rand() });
  // Stilts: log pilings driven through the ice, with cross-bracing.
  const stilts = [[dx0 + 0.3, dz0 + 0.3], [dx1 - 0.3, dz0 + 0.3], [dx0 + 0.3, dz1 - 0.3], [dx1 - 0.3, dz1 - 0.3], [dx0 + 0.3, (dz0 + dz1) / 2], [dx1 - 0.3, (dz0 + dz1) / 2], [0, dz1 - 0.3], [0, dz0 + 0.3]];
  for (const [sx, sz] of stilts) {
    kit.wood.tube([sx, -2.4, sz], [sx + kit.rs() * 0.03, lift - 0.2, sz], 0.15, 0.13, wood(1.0), { seg: 8, lenSeg: 4, ao: 0.3, wobble: 0.03, ph: kit.rand() * 5, uo: kit.rand() });
    kit.circle(sx, sz, 0.18, { y1: lift + 1.4 });
    // A ring of frozen spray at the waterline.
    kit.ice.tube([sx, 0.0, sz], [sx, 0.38 + kit.rand() * 0.2, sz], 0.22 + kit.rand() * 0.06, 0.14, mixC(PAL.ice, PAL.iceDeep, 0.25 + kit.rand() * 0.3), { seg: 7, lenSeg: 1, ao: 0, capA: false, wobble: 0.15, ph: kit.rand() * 5 });
  }
  for (const [ax, az, bx, bz] of [[dx0 + 0.3, dz0 + 0.3, dx1 - 0.3, dz0 + 0.3], [dx0 + 0.3, dz1 - 0.3, dx1 - 0.3, dz1 - 0.3], [dx0 + 0.3, dz0 + 0.3, dx0 + 0.3, dz1 - 0.3], [dx1 - 0.3, dz0 + 0.3, dx1 - 0.3, dz1 - 0.3]]) {
    kit.wood.tube([ax, 0.2, az], [bx, lift - 0.5, bz], 0.06, 0.06, wood(1.0), { seg: 5, lenSeg: 2, ao: 0.2 });
    kit.wood.tube([bx, 0.2, bz], [ax, lift - 0.5, az], 0.06, 0.06, wood(1.0), { seg: 5, lenSeg: 2, ao: 0.2 });
  }
  // Railing, open at the ladder and in front of the door.
  railing(kit, dx0 + 0.1, dz0 + 0.1, dx1 - 0.1, dz0 + 0.1, lift, { h: 0.95 });
  railing(kit, dx0 + 0.1, dz0 + 0.1, dx0 + 0.1, dz1 - 0.1, lift, { h: 0.95 });
  railing(kit, dx1 - 0.1, dz0 + 0.1, dx1 - 0.1, dz1 - 0.1, lift, { h: 0.95 });
  railing(kit, dx0 + 0.1, dz1 - 0.1, dx0 + 1.2, dz1 - 0.1, lift, { h: 0.95 });
  railing(kit, dx1 - 1.9, dz1 - 0.1, dx1 - 0.1, dz1 - 0.1, lift, { h: 0.95 });
  ladder(kit, dx1 - 1.0, 0, dz1 + 0.5, Math.PI, lift + 0.9, 0.35, 0.6);
  // Fish-drying rack on the deck and a hanging net bundle.
  const rx = dx0 + 0.7, rz = dz1 - 1.3;
  kit.wood.tube([rx, lift, rz], [rx, lift + 1.6, rz], 0.05, 0.05, wood(1.0), { seg: 5, lenSeg: 1, ao: 0.2 });
  kit.wood.tube([rx + 1.4, lift, rz], [rx + 1.4, lift + 1.6, rz], 0.05, 0.05, wood(1.0), { seg: 5, lenSeg: 1, ao: 0.2 });
  kit.wood.tube([rx - 0.1, lift + 1.55, rz], [rx + 1.5, lift + 1.55, rz], 0.04, 0.04, wood(1.0), { seg: 5, lenSeg: 1, ao: 0.2 });
  for (let i = 0; i < 6; i++) kit.wood.box(rx + 0.15 + i * 0.22, lift + 1.2, rz, 0.05, 0.38, 0.1, mixC(0x8a8a82, 0xb09a78, kit.rand()).multiplyScalar(GAIN * 0.8), { rz: kit.rs() * 0.1 });
  kit.anchor('rack', rx + 0.7, lift + 1.2, rz);
  kit.anchor('ladder', dx1 - 1.0, 0, dz1 + 0.9);
  kit.anchor('deck', 0, lift, dz1 - 0.7);
  kit.anchor('hole', 1.5, 0, dz1 + 2.2);
  kit.footprint = { hw: Math.max(dx1, -dx0) + 0.3, hd: Math.max(dz1, -dz0) + 0.3 };
  kit.anchor('door', info.doorRecs[0].x, lift, info.doorRecs[0].z);
  kit.walk.floors.push({ y: lift, polygon: [[dx0, dz0], [dx1, dz0], [dx1, dz1], [dx0, dz1]], tag: 'deck' });
  return kit.finish({ info, noFoundation: true });
}

// ---------------- waterwheel (own animatable group) ----------------
// Axis along local x. Rotate group.rotation.x to spin. Returns { group, radius }.
function buildWheel(seed, R = 2.4, width = 1.15) {
  const wk = new Kit(seed, 'waterwheel');
  wk.mergeIce = false;
  wk.mergeMetal = false;
  const col = () => mixC(PAL.logDark, PAL.logWeathered, 0.3 + wk.rand() * 0.4).multiplyScalar(GAIN * wk.r(0.85, 1.1));
  const N = 16;
  const xs = [-width / 2 - 0.12, width / 2 + 0.12];
  for (const x of xs) {
    for (let ring = 0; ring < 2; ring++) {
      const rr = ring === 0 ? R : R - 0.45;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        wk.wood.tube([x, Math.cos(a0) * rr, Math.sin(a0) * rr], [x, Math.cos(a1) * rr, Math.sin(a1) * rr], ring === 0 ? 0.1 : 0.075, ring === 0 ? 0.1 : 0.075, col(), { seg: 6, lenSeg: 1, ao: 0.2, capA: false, capB: false, uo: wk.rand() });
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      wk.wood.tube([x, Math.cos(a) * 0.3, Math.sin(a) * 0.3], [x, Math.cos(a) * (R - 0.4), Math.sin(a) * (R - 0.4)], 0.075, 0.07, col(), { seg: 6, lenSeg: 1, ao: 0.2 });
    }
  }
  wk.wood.tube([-width / 2 - 0.35, 0, 0], [width / 2 + 0.35, 0, 0], 0.3, 0.3, wood(1.1), { seg: 10, lenSeg: 1, ao: 0.2 });
  wk.wood.tube([-width / 2 - 2.6, 0, 0], [width / 2 + 0.4, 0, 0], 0.13, 0.13, scaleC(PAL.logDark, GAIN * 1.2), { seg: 8, lenSeg: 2, ao: 0.2 });
  // Paddles (floats): thin boards between the rims, slightly tilted.
  const icePts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    wk.wood.at(0, 0, 0, 0, () => {
      wk.wood.box(0, R - 0.25, 0, width + 0.1, 0.62, 0.09, mixC(PAL.plank, PAL.plankDark, wk.rand() * 0.5).multiplyScalar(GAIN * wk.r(0.85, 1.05)), { grain: 'x', rz: 0.0, uv: [1, 3] });
    }, a, 0);
    // Frozen spray on paddles that sit in the lower half.
    const yy = Math.cos(a) * (R - 0.1);
    if (yy < 0.4) {
      wk.ice.at(0, 0, 0, 0, () => {
        wk.ice.box(0, R - 0.02, 0.05, width * wk.r(0.5, 1.0), wk.r(0.1, 0.3), wk.r(0.1, 0.2), mixC(PAL.ice, 0xffffff, 0.4 + wk.rand() * 0.3), { uv: [1, 1] });
      }, a, 0);
      for (let k = 0; k < 4; k++) {
        const x = wk.rs() * width * 0.45;
        icePts.push({ x, y: Math.cos(a) * (R - 0.0) - 0.05, z: Math.sin(a) * (R - 0.0), a });
      }
    }
  }
  // Icicles hang straight down in world space; the wheel's own frame is static at build time.
  icicles(wk, icePts, { max: 0.7 });
  const res = wk.finish();
  res.group.name = 'waterwheel';
  return { group: res.group, radius: R, width };
}

// ---------------- mill ----------------
export function mill(opts = {}) {
  const kit = new Kit(opts.seed ?? 311, 'mill');
  kit.noFoundation = false;
  const w = 6.6, d = 8.2, r = 0.2;
  const lift = 1.0;
  // Stone base up to the floor line.
  stoneRing(kit, { hw: w / 2 + r, hd: d / 2 + r, t: 0.8, y0: -1.0, bh: 0.4, top: lift + 0.05, jag: 0, lichen: 0.12, holes: [{ wall: 'front', s0: -1.0, s1: -0.1, y0: -2, y1: lift - 0.1 }] });
  kit.rock.box(0, lift / 2 - 0.3, 0, w - 0.4, lift + 0.6, d - 0.4, scaleC(PAL.stoneDark, GAIN * 0.6), { uv: [3, 3] });
  const info = cabin(kit, {
    w, d, r, courses: 9, lift, plinth: false, pitch: 0.78, oe: 0.85, og: 0.7, snow: 0.32, paint: PAL.red, shutters: 'blue',
    doors: [{ wall: 'front', s: -0.6, w: 1.1, h: 1.95, leaf: 'object', id: 'front', hingeLeft: true, step: false }],
    windows: [
      { wall: 'front', s: 1.6, y: 1.1, w: 0.8, h: 0.9, shutters: 'blue' },
      { wall: 'left', s: -2.2, y: 1.1, w: 0.8, h: 0.9, shutters: 'blue' }, { wall: 'left', s: 1.8, y: 1.1, w: 0.8, h: 0.9, shutters: 'red' },
      { wall: 'back', s: 0.8, y: 1.1, w: 0.8, h: 0.9, shutters: 'blue', lit: false },
      { wall: 'right', s: -2.6, y: 2.5, w: 0.7, h: 0.8, shutters: 'blue' },
    ],
    chimney: { wall: 'back', s: -1.6, w: 1.3, d: 0.9 },
    atticWindow: true,
  });
  const hw = info.hw, hd = info.hd;
  // Steps up to the door.
  for (let i = 0; i < 3; i++) kit.rock.box(-0.6, lift - 0.15 - i * 0.3, hd + r + 0.35 + i * 0.35, 1.6 - i * 0.1, 0.3, 0.6, mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN), { uv: [3, 3], top: scaleC(PAL.stone, GAIN * 1.1) });
  // Hoist beam and pulley at the gable for sacks.
  kit.wood.tube([0, info.yEave + 0.8, hd + 0.2], [0, info.yEave + 0.9, hd + 1.7], 0.11, 0.1, wood(1.15), { seg: 7, lenSeg: 2, ao: 0.28 });
  kit.wood.tube([0, info.yEave + 0.9, hd + 1.65], [0.02, info.yEave - 1.0, hd + 1.65], 0.015, 0.015, scaleC(0xb0a080, 1), { seg: 4, lenSeg: 3, ao: 0 });
  kit.wood.box(0.02, info.yEave - 1.05, hd + 1.65, 0.3, 0.3, 0.3, mixC(0xa88a5a, PAL.plank, 0.5).multiplyScalar(GAIN * 0.9), {});
  // The wheel, frozen.
  const R = 2.5;
  const wheel = buildWheel(opts.seed ?? 311 + 1, R);
  const wx = hw + r + 0.9, wy = R + 0.25;
  wheel.group.position.set(wx, wy, 0);
  kit.extra.push(wheel.group);
  kit.objects.waterwheel = { group: wheel.group, axis: V3(1, 0, 0), center: V3(wx, wy, 0), radius: R, width: wheel.width, spin: (ang) => { wheel.group.rotation.x = ang; } };
  // Wheel bearing posts and the frame holding the axle.
  for (const z of [-0.95, 0.95]) {
    kit.wood.tube([wx + 1.5, -0.4, z], [wx + 1.5, wy + 0.55, z], 0.14, 0.13, wood(1.05), { seg: 8, lenSeg: 3, ao: 0.28 });
    kit.wood.box(wx + 1.5, wy + 0.5, z, 0.4, 0.25, 0.3, wood(1.2), {});
  }
  kit.wood.tube([wx + 1.5, wy + 0.5, -0.95], [wx + 1.5, wy + 0.5, 0.95], 0.1, 0.1, wood(1.15), { seg: 7, lenSeg: 2, ao: 0.25 });
  // The flume: a wooden trough on trestles feeding the top of the wheel, filled with ice, with a frozen cascade.
  const fy = wy + R + 0.45;
  const L = 8;
  for (let i = 0; i < 4; i++) {
    const x = wx - 0.3 + i * (L / 3.2);
    for (const z of [-0.55, 0.55]) kit.wood.tube([x + 0.6, -0.5, z * 1.2], [x + 0.6, fy - 0.2, z], 0.09, 0.08, wood(1.0), { seg: 6, lenSeg: 3, ao: 0.25 });
    kit.wood.tube([x + 0.6, fy - 0.25, -0.62], [x + 0.6, fy - 0.25, 0.62], 0.08, 0.08, wood(1.1), { seg: 6, lenSeg: 1, ao: 0.2 });
  }
  kit.wood.box(wx + L / 2 - 0.3, fy - 0.1, -0.52, L + 0.6, 0.38, 0.07, mixC(PAL.plank, PAL.plankDark, 0.4).multiplyScalar(GAIN), { grain: 'x' });
  kit.wood.box(wx + L / 2 - 0.3, fy - 0.1, 0.52, L + 0.6, 0.38, 0.07, mixC(PAL.plank, PAL.plankDark, 0.4).multiplyScalar(GAIN), { grain: 'x' });
  kit.wood.box(wx + L / 2 - 0.3, fy - 0.27, 0, L + 0.6, 0.06, 1.05, mixC(PAL.plank, PAL.plankDark, 0.6).multiplyScalar(GAIN), { grain: 'x' });
  kit.ice.box(wx + L / 2 - 0.3, fy - 0.12, 0, L + 0.3, 0.2, 0.95, mixC(PAL.ice, 0xffffff, 0.35), { uv: [2, 2] });
  // Frozen cascade over the lip and icicles under the trough.
  {
    const rows = [], bases = [];
    for (let i = 0; i <= 5; i++) {
      const row = [], br = [];
      const t = i / 5;
      for (let j = 0; j <= 8; j++) {
        const z = (j / 8 - 0.5) * 0.9;
        const x = wx - 0.3 - t * 0.22 * (1 + 0.5 * kit.n2(j, i));
        const y = fy - 0.02 - t * (R * 0.55) + (kit.n2(z * 4, t * 3) - 0.5) * 0.08;
        row.push([x - kit.rs() * 0.02, y, z]); br.push([x, y, z]);
      }
      rows.push(row); bases.push(br);
    }
    kit.ice.grid(rows, C(PAL.ice), { uv: [2, 2], colorFn: (i, j, p) => mixC(PAL.ice, 0xffffff, 0.3 + 0.5 * kit.n2(p.z * 6, p.y * 3)), baseFn: (i, j) => bases[i][j] });
  }
  const pts = [];
  for (let x = wx - 0.2; x < wx + L; x += 0.35 + kit.rand() * 0.5) for (const z of [-0.54, 0.54]) if (kit.chance(0.6)) pts.push({ x, y: fy - 0.28, z });
  icicles(kit, pts, { max: 0.9 });
  snowPillow(kit, wx + L / 2, fy + 0.1, 0.0, L * 0.45, 0.07, 0.4, { nu: 2, nv: 8 });
  // Millstones leaning at the wall, sacks and barrels.
  for (const [mx, mz, a] of [[-hw - 0.6, hd - 1.2, 0.3], [-hw - 0.55, hd - 2.4, -0.2]]) {
    kit.rock.at(mx, 0.0, mz, a, () => {
      kit.rock.lathe([[0.0, 0.0], [0.82, 0.0], [0.82, 0.25], [0.0, 0.25]], scaleC(PAL.stone, GAIN * 0.95), { seg: 14, uv: [3, 3] });
    }, 0, 0);
  }
  sack(kit, -0.9, lift - 0.05, hd + r + 0.6, 0.2, 1.2); sack(kit, -0.3, lift - 0.05, hd + r + 0.9, 1.0, 1.0);
  barrel(kit, hw + 0.6, 0.0, hd - 0.5, 0.9, 0.36);
  kit.circle(hw + 0.6, hd - 0.5, 0.38);
  // Colliders for the wheel frame and flume posts keep walkers off the ice-clad machinery.
  kit.box(wx, 0, R * 0.55, 1.1, 0, { y1: 3.0 });
  kit.anchor('door', info.doorRecs[0].x, lift, info.doorRecs[0].z);
  kit.anchor('wheel', wx, wy, 0);
  kit.anchor('flume', wx + L * 0.6, fy, 0);
  kit.anchor('smoke', info.hw * 0 - 1.6, info.roof.ridgeY + lift + 1.1, -hd - 0.5);
  kit.footprint = { hw: hw + R * 2 + 1.2, hd: hd + 1.0 };
  void railing; void firewoodStack; void snowLayer; void smooth; void shedRoof; void wallFrame; void toLocal;
  return kit.finish({ info });
}
