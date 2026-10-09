// Placeholder interior furniture, built from boxes and lathes inside the building's own meshes
// (so interiors cost no extra draw calls). The props kit (src/world/props) has the full-quality
// versions; these are simple but convincing stand-ins that need no cross-module dependency.
// All functions place into the building-local frame: (x, y, z) is the floor point, yaw in three.js convention.
import * as THREE from 'three';
import { mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';

const plank = (kit, k = 1) => mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN * k * kit.r(0.85, 1.1));

export function table(kit, x, y, z, yaw, w = 1.8, d = 0.9, h = 0.78) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 1.0);
    kit.wood.box(0, h - 0.03, 0, w, 0.06, d, c, { grain: 'x', top: scaleC(c, 1.08) });
    kit.wood.box(0, h - 0.12, 0, w - 0.2, 0.1, d - 0.2, scaleC(c, 0.8), { grain: 'x' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.wood.box(sx * (w / 2 - 0.1), (h - 0.06) / 2, sz * (d / 2 - 0.1), 0.09, h - 0.06, 0.09, scaleC(c, 0.85), { grain: 'y' });
    kit.wood.box(0, 0.25, 0, w - 0.3, 0.05, 0.07, scaleC(c, 0.8), { grain: 'x' });
  });
}

export function stool(kit, x, y, z, yaw = 0, h = 0.45, r = 0.19) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 1.05);
    kit.wood.tube([0, h, 0], [0, h - 0.06, 0], r, r, c, { seg: 8, lenSeg: 1, ao: 0.1 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      kit.wood.tube([Math.cos(a) * r * 0.55, h - 0.06, Math.sin(a) * r * 0.55], [Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85], 0.025, 0.03, scaleC(c, 0.85), { seg: 5, lenSeg: 1, ao: 0.1 });
    }
  });
}

export function bench(kit, x, y, z, yaw, len = 1.8, h = 0.45, depth = 0.32) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 1.0);
    kit.wood.box(0, h - 0.025, 0, len, 0.05, depth, c, { grain: 'x', top: scaleC(c, 1.08) });
    for (const sx of [-1, 1]) kit.wood.box(sx * (len / 2 - 0.18), (h - 0.05) / 2, 0, 0.06, h - 0.05, depth - 0.06, scaleC(c, 0.85), { grain: 'y' });
  });
}

export function chest(kit, x, y, z, yaw, w = 0.9, h = 0.5, d = 0.5) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 0.9);
    kit.wood.box(0, h / 2 - 0.04, 0, w, h - 0.08, d, c, { grain: 'x' });
    kit.wood.box(0, h - 0.04, 0, w + 0.02, 0.08, d + 0.02, scaleC(c, 1.1), { grain: 'x', rz: 0 });
    for (const sx of [-0.3, 0.3]) kit.wood.box(sx * w, h / 2, d / 2 + 0.005, 0.07, h, 0.01, scaleC(PAL.iron, GAIN * 0.8), { grain: 'y' });
  });
}

export function barrel(kit, x, y, z, h = 0.9, r = 0.37, o = {}) {
  kit.frame(x, y, z, 0, () => {
    const c = plank(kit, 0.95);
    const prof = [[r * 0.82, 0], [r * 0.95, h * 0.12], [r, h * 0.5], [r * 0.95, h * 0.88], [r * 0.82, h]];
    kit.wood.lathe(prof, c, { seg: 12, uv: [1, 1.5], closeTop: true, closeBottom: false });
    for (const t of [0.14, 0.4, 0.62, 0.86]) {
      const rr = r * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.17) + 0.012;
      kit.wood.tube([0, h * t - 0.025, 0], [0, h * t + 0.025, 0], rr, rr, scaleC(PAL.iron, GAIN * 0.8), { seg: 12, lenSeg: 1, ao: 0, capA: false, capB: false });
    }
    if (o.lid !== false) kit.wood.tube([0, h - 0.005, 0], [0, h + 0.02, 0], r * 0.8, r * 0.8, scaleC(c, 1.05), { seg: 12, lenSeg: 1, ao: 0 });
  });
}

export function sack(kit, x, y, z, yaw = 0, s = 1) {
  kit.frame(x, y, z, yaw, () => {
    const c = mixC(0xb8a47a, 0x8a7a58, kit.rand()).multiplyScalar(1.1);
    kit.straw.ellipsoid(0, 0.3 * s, 0, 0.27 * s, 0.34 * s, 0.22 * s, c, { seg: 8, rings: 5 });
  });
}

export function bed(kit, x, y, z, yaw, w = 0.9, l = 1.9) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 0.95);
    kit.wood.box(0, 0.32, 0, w, 0.08, l, c, { grain: 'z' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.wood.box(sx * (w / 2 - 0.05), 0.15, sz * (l / 2 - 0.05), 0.09, 0.3, 0.09, scaleC(c, 0.8), { grain: 'y' });
    kit.wood.box(0, 0.62, -l / 2 + 0.03, w, 0.6, 0.06, scaleC(c, 0.95), { grain: 'x' });
    kit.cloth.box(0, 0.4, 0.05, w - 0.1, 0.1, l - 0.2, mixC(0x8a7a60, 0x6a4c3a, kit.rand()).multiplyScalar(1.0), { uv: [1, 1] });
    kit.cloth.box(0, 0.5, -l / 2 + 0.3, w * 0.7, 0.12, 0.35, scaleC(0xc9bfae, 1.0), { uv: [1, 1] });
  });
}

// Whitewashed Russian-style stove (pech) with a glowing mouth. Returns nothing; sets hearth light.
export function stove(kit, x, y, z, yaw, o = {}) {
  const w = o.w ?? 1.7, d = o.d ?? 1.5, h = o.h ?? 1.9;
  kit.frame(x, y, z, yaw, () => {
    const wash = mixC(0xd8cdb8, 0xc4b8a0, kit.rand() * 0.4).multiplyScalar(1.05);
    kit.stone.box(0, h / 2, 0, w, h, d, wash, { uv: [2, 2], top: scaleC(wash, 0.9), skip: '-y' });
    kit.stone.box(0, h + 0.1, 0, w + 0.15, 0.18, d + 0.15, scaleC(wash, 0.9), { uv: [2, 2] });
    // Mouth: dark arch with embers inside, facing +z.
    const mz = d / 2 + 0.005;
    kit.stone.box(0, 0.68, mz, 0.72, 0.62, 0.012, scaleC(PAL.iron, GAIN * (o.cold ? 0.3 : 0.5)), { uv: [1, 1] });
    if (!o.cold) {
      kit.ember.quad([-0.28, 0.42, mz + 0.012], [0.28, 0.42, mz + 0.012], [0.25, 0.8, mz + 0.012], [-0.25, 0.8, mz + 0.012], new THREE.Color(2.6, 1.0, 0.3), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      kit.ember.quad([-0.22, 0.3, mz + 0.011], [0.22, 0.3, mz + 0.011], [0.28, 0.42, mz + 0.011], [-0.28, 0.42, mz + 0.011], new THREE.Color(1.6, 0.5, 0.12), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    // Sleeping ledge on top.
    kit.wood.box(0, h + 0.22, 0, w - 0.1, 0.06, d - 0.1, plank(kit, 0.9), { grain: 'x' });
  });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const px = x + 0 * c + (d / 2 + 0.3) * s, pz = z - 0 * s + (d / 2 + 0.3) * c;
  if (!o.cold) kit.light(px, y + 0.8, pz, { color: 0xff8a30, intensity: 1.4, radius: 9, kind: 'hearth' });
  kit.anchor(o.name || 'hearth', px, y + 0.7, pz);
  kit.box(x, z, w / 2, d / 2, yaw);
}

// Wide open stone fireplace set into a wall (tavern, longhouse). Faces +z in the given frame.
export function fireplace(kit, x, y, z, yaw, o = {}) {
  const w = o.w ?? 2.4, d = o.d ?? 0.9, h = o.h ?? 2.6;
  kit.frame(x, y, z, yaw, () => {
    const tone = () => mixC(PAL.stoneDark, PAL.stoneWarm, kit.rand()).multiplyScalar(GAIN * kit.r(0.85, 1.1));
    // Jambs and mantel built from rough blocks.
    for (const sx of [-1, 1]) {
      for (let j = 0; j < 5; j++) kit.stone.box(sx * (w / 2 - 0.2), 0.2 + j * 0.4, d / 2, 0.4, 0.4, d, tone(), { ry: kit.rs() * 0.04, uv: [2, 2] });
    }
    kit.stone.box(0, 1.55, d / 2, w, 0.4, d, tone(), { uv: [2, 2] });
    kit.stone.box(0, 1.98, d / 2, w - 0.5, 0.45, d * 0.8, tone(), { uv: [2, 2] });
    kit.stone.box(0, 2.45, d / 2, w - 1.0, 0.6, d * 0.6, tone(), { uv: [2, 2] });
    // Back wall dark with soot, hearth stone, logs and fire glow.
    kit.stone.box(0, 0.75, 0.05, w - 0.8, 1.5, 0.1, scaleC(PAL.stoneDark, GAIN * 0.45), { uv: [2, 2] });
    kit.stone.box(0, 0.06, d / 2 + 0.1, w + 0.4, 0.12, d + 0.2, tone(), { uv: [2, 2] });
    kit.ember.quad([-0.5, 0.12, 0.3], [0.5, 0.12, 0.3], [0.45, 0.5, 0.3], [-0.45, 0.5, 0.3], new THREE.Color(2.8, 1.1, 0.3), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    kit.ember.quad([-0.38, 0.5, 0.31], [0.38, 0.5, 0.31], [0.1, 0.95, 0.31], [-0.15, 0.85, 0.31], new THREE.Color(2.2, 0.8, 0.2), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    kit.wood.tube([-0.5, 0.18, 0.5], [0.5, 0.2, 0.45], 0.08, 0.08, scaleC(PAL.logDark, GAIN * 0.7), { seg: 6, lenSeg: 1, ao: 0 });
    kit.wood.tube([-0.4, 0.28, 0.45], [0.45, 0.3, 0.4], 0.07, 0.07, scaleC(PAL.logDark, GAIN * 0.6), { seg: 6, lenSeg: 1, ao: 0 });
  });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const px = x + 0.6 * s, pz = z + 0.6 * c;
  kit.light(px, y + 0.9, pz, { color: 0xff8a30, intensity: 2.0, radius: 11, kind: 'hearth' });
  kit.anchor(o.name || 'hearth', px, y + 0.8, pz);
}

export function shelf(kit, x, y, z, yaw, w = 1.2, rows = 3, rowH = 0.38) {
  kit.frame(x, y, z, yaw, () => {
    const c = plank(kit, 0.95);
    for (const sx of [-1, 1]) kit.wood.box(sx * w / 2, rows * rowH / 2, 0, 0.04, rows * rowH, 0.28, scaleC(c, 0.85), { grain: 'y' });
    for (let i = 0; i <= rows; i++) kit.wood.box(0, i * rowH, 0, w, 0.04, 0.28, c, { grain: 'x', top: scaleC(c, 1.05) });
    for (let i = 0; i < rows; i++) {
      let px = -w / 2 + 0.15;
      while (px < w / 2 - 0.1) {
        if (kit.chance(0.7)) {
          const bh = kit.r(0.1, 0.24), bw = kit.r(0.08, 0.16);
          kit.wood.box(px + bw / 2, i * rowH + 0.02 + bh / 2, 0, bw, bh, 0.16, mixC(PAL.plankDark, PAL.ochre, kit.rand() * 0.6).multiplyScalar(GAIN * 0.9), { grain: 'y' });
          px += bw + 0.03;
        } else px += 0.12;
      }
    }
  });
}

export function rug(kit, x, y, z, yaw, w = 1.4, l = 2.0, col = PAL.red) {
  kit.frame(x, y, z, yaw, () => {
    kit.cloth.box(0, 0.012, 0, w, 0.02, l, mixC(col, 0x5a3a2a, kit.rand() * 0.4).multiplyScalar(0.9), { uv: [1, 1] });
    kit.cloth.box(0, 0.016, 0, w - 0.2, 0.01, l - 0.2, mixC(PAL.ochre, 0x3a3a50, kit.rand() * 0.5).multiplyScalar(0.7), { uv: [1, 1] });
  });
}

// Hanging lamp / lantern with glow. Registers a light.
export function lantern(kit, x, y, z, o = {}) {
  const dark = scaleC(PAL.iron, GAIN * 0.7);
  kit.metal.box(x, y + 0.2, z, 0.02, 0.4, 0.02, dark);
  kit.metal.box(x, y, z, 0.2, 0.03, 0.2, dark);
  kit.metal.box(x, y + 0.2, z, 0.18, 0.28, 0.18, dark, { skip: '' });
  const c = new THREE.Color(1.0, 0.85, 0.6);
  kit.glow.box(x, y + 0.15, z, 0.14, 0.2, 0.14, c, { uv: [40, 40], uo: 0.5, vo: 0.5 });
  kit.light(x, y + 0.1, z, { color: 0xffb060, intensity: o.intensity ?? 0.9, radius: o.radius ?? 7, kind: 'lantern' });
}

// Ceiling: tie beams and planks at height y spanning the box. Joists run along x.
export function ceiling(kit, x0, z0, x1, z1, y) {
  const n = Math.max(2, Math.round((z1 - z0) / 1.4));
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    kit.wood.tube([x0 - 0.1, y - 0.16, z], [x1 + 0.1, y - 0.16 + kit.rs() * 0.01, z], 0.16, 0.15, scaleC(PAL.logDark, GAIN * 1.25), { seg: 8, lenSeg: 2, ao: 0.3, bow: [0, -0.015, 0], uo: kit.rand(), vo: kit.rand() });
  }
  const nb = Math.max(2, Math.round((x1 - x0) / 0.25));
  for (let i = 0; i < nb; i++) {
    const c = plank(kit, 0.7);
    kit.wood.box(x0 + ((i + 0.5) * (x1 - x0)) / nb, y + 0.0, (z0 + z1) / 2, (x1 - x0) / nb - 0.01, 0.04, z1 - z0, c, { grain: 'z' });
  }
}
