// The idol: a 10 m four-faced stone pillar (Swiatowid-like) on a stepped plinth ringed with a cairn.
// Four carved faces under one round cap, arms in relief, a drinking horn on the south face, belt
// and zigzag bands, lichen and weathering. Offerings at the base. The valley's landmark.
//   Faces look to the four directions: face index 0 = +z (south), 1 = +x (east), 2 = -z (north), 3 = -x (west).
//   anchors: top, face0..face3, offerings, sit, base, view
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { C, mixC, scaleC } from '../mb.js';
import { hewn, boulder, stroke } from '../masonry.js';
import { snowPillow } from '../details.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SC = 1.3; // face feature scale (head block is 2.3 m wide)

export function idol(opts = {}) {
  const kit = new Kit(opts.seed ?? 31, 'idol');
  const mb = kit.rock;
  const dark = scaleC(0x1e1d1a, 1);
  kit.footprint = { hw: 2.6, hd: 2.6 };

  // ---- plinth: three stepped slabs, then the cairn of boulders ----
  const steps = [[-0.6, 5.0, 1.05], [0.45, 4.0, 0.5], [0.95, 3.2, 0.4]];
  steps.forEach(([y, w, h], i) => hewn(kit, { y, w0: w, d0: w, h, yaw: kit.rs() * 0.06, amp: 0.05, nu: 8, nv: 3, wet: 0.6, lichen: 0.18, k: 0.88 - i * 0.03 }));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + kit.rs() * 0.12;
    const rr = kit.r(2.9, 3.7);
    const s = kit.r(0.6, 1.15);
    boulder(kit, Math.cos(a) * rr, -0.55, Math.sin(a) * rr, s * kit.r(1.0, 1.5), s * kit.r(0.9, 1.5), s * kit.r(0.9, 1.3), { seg: 8, rings: 4 });
  }

  // ---- tiers ----
  const tiers = [
    { y: 1.35, h: 2.2, w0: 2.05, w1: 1.88 },
    { y: 3.55, h: 2.1, w0: 1.88, w1: 1.74 },
    { y: 5.65, h: 1.55, w0: 1.74, w1: 1.62 },
    { y: 7.2, h: 2.2, w0: 2.3, w1: 2.26 },
  ];
  tiers.forEach((t, i) => {
    hewn(kit, { y: t.y, w0: t.w0, d0: t.w0, w1: t.w1, d1: t.w1, h: t.h, yaw: kit.rs() * 0.02, amp: i === 3 ? 0.025 : 0.035, nu: 7, nv: i === 3 ? 6 : 9, wet: i === 0 ? 1 : 0.4, lichen: 0.16 - i * 0.03, k: 0.95 + i * 0.02, base: i === 3 ? PAL.stoneWarm : PAL.stone });
  });
  // Shoulders: the pillar flares into the head block.
  hewn(kit, { y: 7.06, w0: 1.62, d0: 1.62, w1: 2.28, d1: 2.28, h: 0.16, amp: 0.01, nu: 6, nv: 2, noTop: true, k: 1.0 });
  const halfAt = (y) => {
    for (const t of tiers) if (y >= t.y && y <= t.y + t.h) return (t.w0 + (t.w1 - t.w0) * ((y - t.y) / t.h)) / 2;
    return 0.85;
  };

  const raised = scaleC(PAL.stoneWarm, GAIN * 0.95);
  const zig = (y, hwid, n = 8, amp = 0.08) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([-hwid + (2 * hwid * i) / n, y + (i % 2 ? amp : -amp)]);
    return pts;
  };
  const ringPts = (cx, cy, r, n = 14) => { const p = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };

  const horn = C(0xcfc5ad).clone().multiplyScalar(GAIN * 0.85);
  for (let k = 0; k < 4; k++) {
    mb.at(0, 0, 0, (k * Math.PI) / 2, () => {
      const F = (y) => halfAt(y);
      const ax = V3(1, 0, 0), ay = V3(0, 1, 0), nz = V3(0, 0, 1);
      // Tier 1: zigzag bands and a sun wheel.
      for (const y of [1.85, 2.2, 2.55]) stroke(mb, zig(y, F(y) - 0.2), 0.055, [0, 0, F(y)], ax, ay, nz, dark, 0.014);
      stroke(mb, ringPts(0, 3.1, 0.4), 0.05, [0, 0, F(3.1)], ax, ay, nz, dark, 0.014);
      stroke(mb, ringPts(0, 3.1, 0.2), 0.05, [0, 0, F(3.1)], ax, ay, nz, dark, 0.014);
      for (let a = 0; a < 8; a++) { const an = (a / 8) * Math.PI * 2; stroke(mb, [[Math.cos(an) * 0.44, 3.1 + Math.sin(an) * 0.44], [Math.cos(an) * 0.62, 3.1 + Math.sin(an) * 0.62]], 0.05, [0, 0, F(3.1)], ax, ay, nz, dark, 0.014); }
      // Tier 2: the chest: arms in relief.
      const zc = F(4.5);
      const arm = (p0, p1, p2, r = 0.13) => {
        mb.tube([p0[0], p0[1], zc + 0.03], [p1[0], p1[1], zc + 0.1], r, r * 0.9, raised, { seg: 7, lenSeg: 1, ao: 0.1, uv: [3, 3], endCol: raised });
        mb.tube([p1[0], p1[1], zc + 0.1], [p2[0], p2[1], zc + 0.04], r * 0.9, r * 0.75, raised, { seg: 7, lenSeg: 1, ao: 0.1, uv: [3, 3], endCol: raised });
        mb.ellipsoid(p2[0], p2[1], zc + 0.06, r * 1.0, r * 0.9, r * 0.8, raised, { seg: 7, rings: 4 });
      };
      if (k === 0) {
        arm([-0.62, 5.4], [-0.72, 4.6], [-0.26, 4.0]);
        arm([0.62, 5.4], [0.68, 4.55], [0.22, 4.3]);
        // The drinking horn held in the left hand, raised high.
        const hp = [[-0.26, 4.0, zc + 0.16], [-0.46, 4.4, zc + 0.6], [-0.66, 4.95, zc + 0.95], [-0.8, 5.6, zc + 1.1], [-0.84, 6.25, zc + 1.05]];
        mb.sweep(hp, (t) => 0.045 + t * t * 0.17, horn, { seg: 8, ao: 0.2, uv: [1, 1], endCol: dark });
        mb.sweep([[-0.84, 6.25, zc + 1.05], [-0.845, 6.33, zc + 1.045]], 0.19, scaleC(PAL.bronze, GAIN * 0.8), { seg: 8, ao: 0, uv: [1, 1] });
      } else {
        arm([-0.64, 5.35], [-0.6, 4.55], [0.34, 4.28]);
        arm([0.64, 5.35], [0.6, 4.55], [-0.34, 4.1]);
      }
      // Belt (tier 3 base) with a diamond buckle and hanging straps.
      const zb = F(5.7);
      mb.box(0, 5.74, zb + 0.02, zb * 2 + 0.06, 0.24, 0.06, raised, { uv: [3, 3] });
      mb.box(0, 5.74, zb + 0.08, 0.28, 0.28, 0.06, scaleC(PAL.bronze, GAIN * 0.8), { uv: [1, 1], rz: Math.PI / 4 });
      for (const sx of [-0.2, 0.2]) mb.box(sx, 5.28, zb + 0.04, 0.1, 0.9, 0.05, raised, { uv: [3, 3] });
      // Head, carved in relief like the Zbruch idol: a domed face, arched brow ridges over deep almond
      // eye hollows, a long nose swept down from the brow, a drooping moustache, a small mouth, beard
      // and headband. Smooth forms (no blocks) so it reads as worn stone, not a tiki mask.
      const zh = 1.15;
      const yc = 8.2;
      const f = SC;
      const worn = scaleC(PAL.stone, GAIN * 0.5);
      mb.ellipsoid(0, yc + 0.02, zh + 0.0, 0.74, 0.92, 0.14, raised, { seg: 14, rings: 8 });
      mb.box(0, yc + 0.84 * f * 0.8, zh + 0.05, 2.1, 0.18, 0.11, scaleC(PAL.stone, GAIN * 0.85), { uv: [3, 3] });
      for (const sx of [-1, 1]) {
        // Brow ridge: an arch from the nose bridge out over the eye.
        mb.sweep([[sx * 0.03, yc + 0.44, zh + 0.15], [sx * 0.24, yc + 0.52, zh + 0.15], [sx * 0.46, yc + 0.5, zh + 0.12], [sx * 0.62, yc + 0.4, zh + 0.07]], (t) => 0.075 - t * 0.03, raised, { seg: 7, ao: 0.25, uv: [3, 3] });
        // Eye: a dark hollow under a heavy lid, an almond tilted down at the outer corner.
        mb.ellipsoid(sx * 0.33, yc + 0.3, zh + 0.1, 0.2, 0.08, 0.05, dark, { seg: 10, rings: 4 });
        mb.sweep([[sx * 0.15, yc + 0.34, zh + 0.14], [sx * 0.33, yc + 0.39, zh + 0.15], [sx * 0.51, yc + 0.32, zh + 0.12]], 0.035, raised, { seg: 6, ao: 0.2, uv: [3, 3] });
        // Cheek, and the ear block at the side of the head.
        mb.ellipsoid(sx * 0.46, yc - 0.08, zh + 0.07, 0.27, 0.24, 0.05, raised, { seg: 12, rings: 6 });
        mb.box(sx * 1.1, yc + 0.0, zh - 0.2, 0.12, 0.45, 0.2, raised, { uv: [3, 3] });
        // Moustache: from under the nose, out and down past the mouth.
        if (k !== 3) mb.sweep([[sx * 0.06, yc - 0.38, zh + 0.27], [sx * 0.24, yc - 0.42, zh + 0.24], [sx * 0.42, yc - 0.52, zh + 0.18], [sx * 0.52, yc - 0.7, zh + 0.12]], (t) => 0.07 - t * 0.035, raised, { seg: 7, ao: 0.25, uv: [3, 3] });
        // Lichen: small dark crusts scattered on the weather side of the face.
        for (let q = 0; q < 4; q++) {
          mb.ellipsoid(sx * (0.15 + kit.rand() * 0.5), yc + kit.rs() * 0.6, zh + 0.1, kit.r(0.02, 0.05), kit.r(0.015, 0.035), 0.012, scaleC(mixC(0x4a5032, 0x3a3a2c, kit.rand()), GAIN * 0.55), { seg: 8, rings: 3 });
        }
      }
      // Nose: a long wedge from the brow to a broad tip, with nostrils cut in.
      mb.sweep([[0, yc + 0.44, zh + 0.15], [0, yc + 0.1, zh + 0.24], [0, yc - 0.24, zh + 0.3], [0, yc - 0.32, zh + 0.27]], (t) => 0.06 + t * 0.07, raised, { seg: 8, ao: 0.25, uv: [3, 3] });
      for (const sx of [-1, 1]) mb.ellipsoid(sx * 0.07, yc - 0.34, zh + 0.27, 0.035, 0.025, 0.03, worn, { seg: 6, rings: 3 });
      // Mouth: a short carved line under the moustache.
      mb.ellipsoid(0, yc - 0.56, zh + 0.14, 0.17, 0.03, 0.035, dark, { seg: 8, rings: 3 });
      if (k === 0 || k === 2) {
        mb.at(0, yc - 0.82, zh + 0.1, 0, (m) => {
          m.extrude([[-0.5, 0], [0.5, 0], [0.34, -0.5], [0.12, -0.84], [-0.12, -0.84], [-0.34, -0.5]], 0.16, raised, { uv: [3, 3] });
        });
        // Braided strands down the beard.
        for (let q = -2; q <= 2; q++) stroke(mb, [[q * 0.17, yc - 0.9], [q * 0.17 * 0.8, yc - 1.25], [q * 0.17 * 0.45, yc - 1.55]], 0.028, [0, 0, zh + 0.272], V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1), scaleC(0x2a2824, 1), 0.008);
      }
      mb.box(0, 9.28, zh + 0.0, 2.3, 0.14, 0.04, scaleC(PAL.stone, GAIN * 0.8), { uv: [3, 3] });
    });
  }

  // ---- the round cap (kolpak) ----
  const capCol = mixC(PAL.stoneDark, PAL.stone, 0.4).multiplyScalar(GAIN * 0.95);
  mb.lathe([[1.1, 9.3], [1.78, 9.34], [1.9, 9.5], [1.8, 9.66], [1.34, 9.78], [1.26, 10.12], [1.08, 10.55], [0.72, 10.9], [0.3, 11.06], [0.001, 11.1]], capCol, { seg: 18, uv: [3, 3], wobble: 0.012, ph: 2 });
  mb.lathe([[1.1, 9.3], [1.78, 9.34]], scaleC(capCol, 0.5), { seg: 18, uv: [3, 3] });
  // Snow on the brim and on top of the cap.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    kit.snow.at(Math.cos(a) * 1.55, 9.68, Math.sin(a) * 1.55, -a + Math.PI / 2, (m) => {
      snowPillowOn(m, kit, 0, 0, 0, 0.5, 0.17, 0.28);
    });
  }
  snowPillow(kit, 0, 10.86, 0, 0.78, 0.34, 0.78);

  // ---- offerings at the foot ----
  const oy = 0.95 + 0.4;
  const bowl = (r, col, filled) => {
    kit.wood.lathe([[r * 0.55, oy], [r, oy + r * 0.45], [r * 0.95, oy + r * 0.5], [r * 0.5, oy + r * 0.12]], col, { seg: 9, uv: [1, 1] });
    if (filled) kit.straw.ellipsoid(0, oy + r * 0.28, 0, r * 0.78, r * 0.3, r * 0.78, filled, { seg: 8, rings: 3 });
  };
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36, rr = 1.7 + kit.rand() * 0.6;
    kit.wood.at(Math.sin(a) * rr, 0, Math.cos(a) * rr + 0.2, 0, () => bowl(kit.r(0.11, 0.17), scaleC(PAL.plankDark, GAIN * 1.2), kit.chance(0.7) ? mixC(PAL.straw, 0xa07a40, kit.rand()).multiplyScalar(1.1) : null));
  }
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.3 + kit.rs() * 0.08, rr = 1.65 + kit.rand() * 0.7;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr + 0.1;
    const h = kit.r(0.1, 0.22);
    kit.wood.tube([x, oy, z], [x, oy + h, z], 0.022, 0.022, C(0xe8dcc0).clone().multiplyScalar(GAIN * 0.8), { seg: 6, lenSeg: 1, ao: 0, uv: [1, 1] });
    kit.ember.box(x, oy + h + 0.02, z, 0.02, 0.04, 0.02, new THREE.Color(3.0, 1.5, 0.4), {});
    if (i % 3 === 0) kit.light(x, oy + h + 0.3, z, { color: 0xffa860, intensity: 0.35, radius: 4, kind: 'candle' });
  }
  // Red ribbons knotted around the belt.
  for (let k = 0; k < 4; k++) {
    kit.cloth.at(0, 0, 0, (k * Math.PI) / 2, () => {
      for (let i = 0; i < 4; i++) {
        const x = -0.65 + i * 0.43 + kit.rs() * 0.06;
        const rows = [];
        const zz = halfAt(5.6) + 0.1;
        for (let r = 0; r <= 6; r++) {
          const t = r / 6;
          rows.push([[x - 0.04, 5.65 - t * (0.7 + kit.rand() * 0.25), zz + t * 0.05 + Math.sin(t * 4 + i) * 0.02], [x + 0.04, 5.65 - t * 0.8, zz + t * 0.05 + Math.sin(t * 4 + i + 1) * 0.02]]);
        }
        kit.cloth.grid(rows, scaleC(PAL.red, 1.0), { flip: true, uv: [0.5, 0.5] });
      }
    });
  }
  // Antlers as old offerings.
  for (const sx of [-1, 1]) {
    kit.wood.sweep([[sx * 1.9, oy, 2.3], [sx * 2.0, oy + 0.25, 2.4], [sx * 2.2, oy + 0.55, 2.4], [sx * 2.3, oy + 0.85, 2.35]], 0.03, C(0xc9bfa8).clone().multiplyScalar(GAIN * 0.8), { seg: 5, ao: 0.1, uv: [1, 1] });
  }

  // ---- colliders and anchors ----
  kit.circle(0, 0, 2.5);
  kit.anchor('base', 0, 0, 0);
  kit.anchor('top', 0, 11.1, 0);
  const faceY = 8.2;
  kit.anchor('face0', 0, faceY, 1.5); kit.anchor('face1', 1.5, faceY, 0); kit.anchor('face2', 0, faceY, -1.5); kit.anchor('face3', -1.5, faceY, 0);
  kit.anchor('offerings', 0, oy, 2.1);
  kit.anchor('sit', 1.9, oy - 0.2, 2.5);
  kit.anchor('view', 0, 1.3, 4.2);
  return kit.finish({});
}

// Snow pillow inside an existing frame (kit.snow already transformed by m).
function snowPillowOn(m, kit, cx, cy, cz, rx, ry, rz) {
  const rows = [], base = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    const row = [], br = [];
    for (let j = 0; j <= 8; j++) {
      const b = (j / 8) * Math.PI * 2;
      const k2 = 1 + (kit.n2(cx + Math.cos(b) * 2 + 3, cz + Math.sin(b) * 2) - 0.5) * 0.3;
      const x = cx + Math.cos(b) * rx * Math.cos(a) * k2, z = cz + Math.sin(b) * rz * Math.cos(a) * k2;
      row.push([x, cy + ry * Math.sin(a), z]);
      br.push([x, cy, z]);
    }
    rows.push(row); base.push(br);
  }
  m.grid(rows, C(PAL.snow), { flip: true, uv: [2, 2], baseFn: (i, j) => base[i][j], colorFn: () => C(PAL.snowBlue).clone().lerp(C(PAL.snow), 0.6) });
}
