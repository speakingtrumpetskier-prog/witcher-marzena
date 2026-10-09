// Smithy: a log forge open to the village on its front gable. Stone forge with a glowing hearth
// against the back wall, anvil on a stump, quench barrel, bellows, tool racks, charcoal sacks.
//   anchors: forge (glow, always lit), anvil, quench, door (the open front), smoke, chimney
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { mixC, scaleC } from '../mb.js';
import { cabin } from '../cabin.js';
import { barrel, sack, lantern } from '../furnish.js';
import { firewoodStack } from '../details.js';

export function smithy(opts = {}) {
  const kit = new Kit(opts.seed ?? 21, 'smithy');
  const w = 6.8, d = 7.2, r = 0.2;
  const info = cabin(kit, {
    w, d, r, courses: 8, interior: true, floor: 'none', openWalls: ['front'], pitch: 0.8, oe: 0.85, og: 1.2, snow: 0.28, paint: PAL.red, shutters: 'blue',
    style: { low: 0x1f1a16, mid: 0x3a322b, high: 0x6a645a, silver: 0.4 },
    windows: [{ wall: 'right', s: -1.0, y: 1.3, w: 0.7, h: 0.7, shutters: 'blue', lit: true }],
    chimneys: [{ wall: 'back', s: 0, w: 2.0, d: 1.2, above: 1.4 }],
    leanTo: { wall: 'left', s: 0.6, len: 4.2, depth: 1.6, wood: false, hHigh: 2.7, hLow: 2.0 },
    atticWindow: false,
  });
  const hw = info.hw, hd = info.hd, y = 0.0;
  // Hard-packed floor with soot and scale.
  kit.stone.box(0, -0.05, 0, w - 0.2, 0.1, d - 0.2, scaleC(0x4a443e, GAIN * 0.75), { uv: [3, 3] });
  kit.walk.floors.push({ y: 0, polygon: [[-hw + 0.1, -hd + 0.1], [hw - 0.1, -hd + 0.1], [hw - 0.1, hd - 0.1], [-hw + 0.1, hd - 0.1]] });
  const tone = (k = 1) => mixC(PAL.stoneDark, PAL.stoneWarm, kit.rand()).multiplyScalar(GAIN * kit.r(0.8, 1.0) * k);

  // ---- the forge: a rough stone block with a hood, glowing coals ----
  const fz = -hd + r + 0.9;
  kit.frame(0, y, fz, 0, () => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
      kit.stone.box(-1.0 + i * 0.4 + kit.rs() * 0.04, 0.17 + j * 0.28, 0.0, kit.r(0.36, 0.46), 0.27, 1.3, tone(0.95), { ry: kit.rs() * 0.05, uv: [2, 2] });
    }
    // Hearth bed: dark slab with glowing coals and a hot core.
    kit.stone.box(0, 1.14, 0.0, 2.2, 0.06, 1.3, scaleC(PAL.stoneDark, GAIN * 0.35), { uv: [2, 2] });
    kit.ember.quad([-0.8, 1.18, -0.5], [-0.8, 1.18, 0.5], [0.8, 1.18, 0.5], [0.8, 1.18, -0.5], new THREE.Color(2.6, 0.9, 0.2), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    kit.ember.quad([-0.35, 1.19, -0.25], [-0.35, 1.19, 0.25], [0.35, 1.19, 0.25], [0.35, 1.19, -0.25], new THREE.Color(4.0, 2.2, 0.7), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // Hood tapering into the wall.
    for (let k = 0; k < 4; k++) {
      kit.stone.box(0, 1.5 + k * 0.42, -0.1 - k * 0.0, 2.0 - k * 0.35, 0.44, 1.2 - k * 0.12, tone(0.75), { uv: [2, 2] });
    }
    // Hearth lip toward the room, tuyere pipe and the bellows.
    kit.stone.box(0, 0.06, 0.9, 2.4, 0.12, 0.5, tone(), { uv: [2, 2] });
    kit.metal.tube([0.9, 1.35, 0.55], [0.35, 1.25, 0.1], 0.04, 0.035, scaleC(PAL.iron, GAIN * 0.7), { seg: 6, lenSeg: 1, ao: 0 });
    kit.wood.box(1.4, 0.9, 0.8, 0.8, 0.12, 0.45, scaleC(PAL.logDark, GAIN * 1.2), { rz: -0.12 });
    kit.wood.box(1.4, 1.15, 0.8, 0.8, 0.22, 0.4, scaleC(0x6a4a30, GAIN), { rz: -0.12 });
    kit.wood.tube([1.0, 0.95, 0.8], [0.7, 1.2, 0.7], 0.02, 0.02, scaleC(PAL.iron, GAIN * 0.8), { seg: 4, lenSeg: 1, ao: 0 });
  });
  kit.box(0, fz, 1.3, 0.75, 0);
  kit.light(0, y + 1.5, fz + 1.2, { color: 0xff7a22, intensity: 2.6, radius: 12, kind: 'forge' });
  kit.anchor('forge', 0, y + 1.2, fz + 0.2);

  // ---- anvil on a stump ----
  const ax = -0.2, az = 0.3;
  kit.wood.tube([ax, y - 0.05, az], [ax, y + 0.62, az], 0.3, 0.26, scaleC(PAL.logDark, GAIN * 1.2), { seg: 10, lenSeg: 2, ao: 0.2, wobble: 0.05, ph: 2 });
  kit.frame(ax, y + 0.62, az, 0.15, () => {
    const iron = scaleC(PAL.iron, GAIN * 0.85);
    kit.metal.box(0, 0.09, 0, 0.34, 0.18, 0.28, iron, {});
    kit.metal.box(0, 0.24, 0, 0.62, 0.13, 0.27, scaleC(PAL.iron, GAIN * 1.0), {});
    kit.metal.box(0.42, 0.25, 0, 0.3, 0.07, 0.12, iron, { rz: -0.05 });
    kit.metal.box(-0.34, 0.25, 0, 0.1, 0.06, 0.1, iron, {});
  });
  kit.circle(ax, az, 0.4);
  kit.anchor('anvil', ax, y + 0.9, az);
  // Quench barrel with a skin of ice, tongs rack, hammers.
  barrel(kit, 1.5, y, -0.1, 0.8, 0.34, { lid: false }); kit.circle(1.5, -0.1, 0.36);
  kit.snow.box(1.5, y + 0.74, -0.1, 0.5, 0.03, 0.5, new THREE.Color(0.6, 0.78, 0.85), { uv: [1, 1] });
  kit.anchor('quench', 1.5, y + 0.8, -0.1);
  // Tool wall on the right: a plank rack with hammers, tongs and swords-in-progress.
  kit.frame(hw - r - 0.1, 0, -0.5, -Math.PI / 2, () => {
    kit.wood.box(0, 1.5, 0, 2.4, 1.1, 0.06, scaleC(PAL.plankDark, GAIN * 1.1), { grain: 'x' });
    for (let i = 0; i < 7; i++) {
      const tx = -1.0 + i * 0.33;
      kit.metal.box(tx, 1.55, 0.06, 0.04, 0.5 + (i % 3) * 0.1, 0.03, scaleC(PAL.iron, GAIN * 0.8), { rz: kit.rs() * 0.05 });
      kit.wood.box(tx, 1.95, 0.06, 0.08, 0.14, 0.05, scaleC(PAL.logDark, GAIN), {});
    }
  });
  // Charcoal sacks, an iron stock pile and woodpile outside under the lean-to.
  sack(kit, -hw + 0.6, y, -hd + 1.0, 0.2, 1.2); sack(kit, -hw + 0.9, y, -hd + 1.5, 1.2, 1.0); sack(kit, -hw + 0.55, y, -hd + 1.9, 0.6, 1.1);
  barrel(kit, -hw + 0.7, y, 0.8, 0.9, 0.35); kit.circle(-hw + 0.7, 0.8, 0.35);
  lantern(kit, 1.8, 2.3, 1.8, { intensity: 0.9 });
  void firewoodStack;
  // The roof beams over the open front and the corner posts are in cabin(); add a hanging sign: a hammer.
  kit.frame(-hw - 0.55, 2.55, hd + 0.1, 0, () => {
    kit.metal.box(0.3, 0, 0, 0.7, 0.04, 0.04, scaleC(PAL.iron, GAIN * 0.8), {});
    kit.metal.box(0.3, -0.45, 0, 0.14, 0.5, 0.05, scaleC(PAL.iron, GAIN * 0.9), {});
    kit.metal.box(0.3, -0.18, 0, 0.5, 0.12, 0.06, scaleC(PAL.iron, GAIN * 0.9), {});
  });
  kit.anchor('door', 0, 0, hd + 1.0);
  kit.anchor('smoke2', 0, y + 1.4, fz + 0.2);
  return kit.finish({ info });
}
