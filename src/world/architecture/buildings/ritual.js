// Ritual and memorial structures: the chram (ring of carved posts around a fire pit with a roofed
// altar), wayside shrines, carved grave posts, and the stone circle of the first rite.
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { C, mixC, scaleC } from '../mb.js';
import { hewn, boulder, stroke } from '../masonry.js';
import { gableRoof } from '../roofs.js';
import { snowPillow, bench } from '../details.js';
import { sunShape, horseHeadShape } from '../carve.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const wood = (k = 1) => mixC(PAL.logDark, PAL.logWeathered, 0.4).multiplyScalar(GAIN * k);
const redPaint = () => scaleC(PAL.red, GAIN * 0.95);

// Carved face on a post, facing local +z, centered at (0, y, zFace). s = scale.
function postFace(kit, y, zFace, s, variant) {
  const raised = mixC(PAL.logWeathered, PAL.logSilver, 0.35).multiplyScalar(GAIN * 1.05);
  const dark = scaleC(0x18130f, 1);
  const mb = kit.wood;
  mb.box(0, y, zFace + 0.01 * s, 0.34 * s, 0.46 * s, 0.03 * s, raised, { grain: 'y' });
  mb.box(0, y + 0.17 * s, zFace + 0.04 * s, 0.4 * s, 0.07 * s, 0.07 * s, raised, { grain: 'x' });
  for (const sx of [-1, 1]) {
    mb.box(sx * 0.09 * s, y + 0.07 * s, zFace + 0.045 * s, 0.1 * s, 0.045 * s, 0.03 * s, dark, {});
    mb.box(sx * 0.17 * s, y - 0.06 * s, zFace + 0.035 * s, 0.06 * s, 0.1 * s, 0.03 * s, raised, {});
  }
  mb.box(0, y - 0.02 * s, zFace + 0.07 * s, 0.07 * s, 0.22 * s, 0.1 * s, raised, { grain: 'y' });
  mb.box(0, y - 0.19 * s, zFace + 0.04 * s, 0.17 * s, 0.035 * s, 0.03 * s, dark, {});
  if (variant % 3 === 0) {
    mb.at(0, y - 0.2 * s, zFace + 0.03 * s, 0, (m) => { m.extrude([[-0.15 * s, 0], [0.15 * s, 0], [0.07 * s, -0.3 * s], [-0.07 * s, -0.3 * s]], 0.04 * s, raised, { uv: [1, 3] }); });
  } else if (variant % 3 === 1) {
    for (const sx of [-1, 1]) mb.sweep([[sx * 0.18 * s, y + 0.22 * s, zFace + 0.02 * s], [sx * 0.3 * s, y + 0.36 * s, zFace], [sx * 0.34 * s, y + 0.56 * s, zFace - 0.03 * s]], 0.025 * s, raised, { seg: 5, ao: 0.1 });
  } else {
    for (const sx of [-1, 1]) mb.box(sx * 0.2 * s, y - 0.2 * s, zFace + 0.03 * s, 0.06 * s, 0.5 * s, 0.03 * s, scaleC(0x15110e, 1), {});
  }
}

// ---------------- shrine (chram) ----------------
export function shrine(opts = {}) {
  const kit = new Kit(opts.seed ?? 41, 'shrine');
  const R = opts.radius ?? 5.4;
  const N = opts.posts ?? 11;
  kit.footprint = { hw: R + 1.2, hd: R + 1.2 };
  kit.noFoundation = true;
  kit.skirt = false;
  // Pounded earth and a ring of low stones define the ground.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    boulder(kit, Math.cos(a) * (R + 0.9), -0.1, Math.sin(a) * (R + 0.9), kit.r(0.35, 0.6), kit.r(0.25, 0.4), kit.r(0.35, 0.55), { seg: 7, rings: 3 });
  }
  // The ring of posts, faces turned inward. A gap is left on the south side (+z) for the entrance.
  const posts = [];
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / N) * Math.PI * 2; // start at south, skip the gate arc
    const ang = a;
    if (Math.abs(Math.atan2(Math.sin(ang - Math.PI / 2), Math.cos(ang - Math.PI / 2))) < (Math.PI * 2) / N * 0.5) continue;
    posts.push(ang);
  }
  posts.forEach((a, i) => {
    const px = Math.cos(a) * R, pz = Math.sin(a) * R;
    const h = kit.r(3.2, 4.2);
    const lean = [kit.rs() * 0.025, kit.rs() * 0.025];
    const yaw = Math.atan2(-px, -pz); // local +z toward the center
    const col = wood(kit.r(0.9, 1.15));
    kit.wood.at(px, 0, pz, yaw, () => {
      kit.wood.tube([0, -0.5, 0], [lean[0] * h, h, lean[1] * h], 0.21, 0.18, col, { seg: 9, lenSeg: 4, ao: 0.28, wobble: 0.025, ph: kit.rand() * 5, uo: kit.rand() });
      postFace(kit, h - 0.85, 0.2, 1.6, i);
      // Painted red bands and a zigzag.
      for (const y of [0.9, 1.3, h - 1.7]) kit.wood.tube([0, y - 0.04, 0], [0, y + 0.04, 0], 0.222, 0.222, redPaint(), { seg: 9, lenSeg: 1, ao: 0, capA: false, capB: false });
      // Pointed cap with snow.
      kit.wood.tube([lean[0] * h, h, lean[1] * h], [lean[0] * h, h + 0.34, lean[1] * h], 0.19, 0.03, col, { seg: 9, lenSeg: 1, ao: 0.1, capA: false });
      snowPillow(kit, lean[0] * h, h + 0.1, lean[1] * h, 0.22, 0.14, 0.22, { nu: 4, nv: 8 });
    });
    kit.circle(px, pz, 0.25);
    // Red ribbons on some posts.
    if (i % 2 === 0) {
      kit.cloth.at(px, 0, pz, yaw, () => {
        for (let k = 0; k < 3; k++) {
          const rows = [];
          const x = -0.12 + k * 0.12;
          for (let r = 0; r <= 5; r++) { const t = r / 5; rows.push([[x - 0.025, 2.0 - t * 0.9, 0.22 + t * 0.03], [x + 0.025, 2.0 - t * 0.9, 0.22 + t * 0.03 + Math.sin(t * 5 + k) * 0.02]]); }
          kit.cloth.grid(rows, redPaint(), { flip: true, uv: [0.5, 0.5] });
        }
      });
    }
  });
  // Entrance: two taller gate posts and a lintel with a horse-head pair.
  for (const sx of [-1, 1]) {
    const gx = sx * 1.4, gz = R + 0.2;
    kit.wood.tube([gx, -0.5, gz], [gx, 4.7, gz], 0.24, 0.2, wood(1.05), { seg: 9, lenSeg: 4, ao: 0.28, wobble: 0.025, uo: kit.rand() });
    for (const y of [1.0, 1.5]) kit.wood.tube([gx, y - 0.04, gz], [gx, y + 0.04, gz], 0.252, 0.252, redPaint(), { seg: 9, lenSeg: 1, ao: 0, capA: false, capB: false });
    kit.circle(gx, gz, 0.28);
  }
  kit.wood.tube([-1.7, 4.4, R + 0.2], [1.7, 4.4, R + 0.2], 0.17, 0.17, wood(1.1), { seg: 8, lenSeg: 3, ao: 0.28 });
  for (const sx of [-1, 1]) {
    kit.wood.at(sx * 1.5, 4.5, R + 0.1, sx < 0 ? Math.PI : 0, (m) => { m.extrude(horseHeadShape(0.9), 0.1, scaleC(PAL.plank, GAIN * 0.9), { uv: [1, 3] }); }, 0, sx < 0 ? -0.1 : 0.1);
  }
  snowPillow(kit, 0, 4.55, R + 0.2, 1.7, 0.22, 0.28, { nu: 4, nv: 10 });

  // ---- the fire pit ----
  const fx = 0, fz = 0.6;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN);
    kit.stone.box(fx + Math.cos(a) * 1.15, 0.12, fz + Math.sin(a) * 1.15, 0.5, 0.3, 0.4, sc, { ry: -a + kit.rs() * 0.2, uv: [2, 2], top: scaleC(sc, 1.1) });
  }
  kit.stone.box(fx, 0.02, fz, 2.1, 0.05, 2.1, scaleC(PAL.stoneDark, GAIN * 0.4), { uv: [2, 2] });
  kit.ember.quad([fx - 0.8, 0.07, fz - 0.8], [fx - 0.8, 0.07, fz + 0.8], [fx + 0.8, 0.07, fz + 0.8], [fx + 0.8, 0.07, fz - 0.8], new THREE.Color(2.4, 0.9, 0.22), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    kit.wood.tube([fx + Math.cos(a) * 0.8, 0.14, fz + Math.sin(a) * 0.8], [fx - Math.cos(a) * 0.1, 0.5, fz - Math.sin(a) * 0.1], 0.08, 0.07, scaleC(PAL.logDark, GAIN * 0.6), { seg: 6, lenSeg: 1, ao: 0 });
  }
  kit.light(fx, 0.9, fz, { color: 0xff8a30, intensity: 2.0, radius: 12, kind: 'fire' });
  kit.anchor('fire', fx, 0.4, fz);
  kit.anchor('smoke', fx, 0.9, fz);
  kit.circle(fx, fz, 1.25, { y1: 0.5 });

  // ---- the roofed altar behind the fire ----
  const az = -2.6;
  kit.stone.box(0, 0.3, az, 1.9, 0.6, 1.3, scaleC(PAL.stone, GAIN * 0.85), { uv: [2, 2], top: scaleC(PAL.stone, GAIN * 0.95) });
  kit.wood.box(0, 0.78, az, 1.5, 0.12, 0.9, scaleC(PAL.plank, GAIN), { grain: 'x', top: scaleC(PAL.plank, GAIN * 1.1) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 0.85, pz = az + sz * 0.5;
    kit.wood.tube([px, 0.5, pz], [px + kit.rs() * 0.02, 2.5, pz], 0.09, 0.08, wood(1.1), { seg: 7, lenSeg: 2, ao: 0.25 });
  }
  kit.frame(0, 0, az, 0, () => {
    gableRoof(kit, { hw: 0.9, hd: 0.55, yE: 2.45, pitch: 0.95, oe: 0.4, og: 0.3, th: 0.07, sag: 0.03, snow: 0.2, iceMax: 0.35, ornament: false, nu: 3, jag: 0.1, cap: 0.07 });
    // Offerings on the altar.
    for (let i = 0; i < 5; i++) {
      kit.wood.at(-0.55 + i * 0.28, 0, 0, 0, (m) => {
        m.lathe([[0.04, 0.84], [0.09, 0.9], [0.085, 0.92], [0.04, 0.86]], scaleC(PAL.plankDark, GAIN * 1.2), { seg: 8, uv: [1, 1] });
      });
    }
  });
  kit.anchor('altar', 0, 0.85, az);
  kit.box(0, az, 1.0, 0.7, 0, { y1: 1.0 });
  // Benches outside the gate.
  bench(kit, -2.6, 0, R + 1.2, 0.2, 1.8);
  kit.anchor('door', 0, 0, R + 1.8);
  kit.anchor('center', 0, 0, 0.6);
  return kit.finish({ noFoundation: true });
}

// ---------------- waysideShrine ----------------
export function waysideShrine(opts = {}) {
  const kit = new Kit(opts.seed ?? 51, 'waysideShrine');
  kit.footprint = { hw: 0.9, hd: 0.9 };
  const h = opts.h ?? 2.6;
  const col = wood(1.05);
  kit.stone.box(0, 0.18, 0, 0.9, 0.36, 0.9, scaleC(PAL.stone, GAIN * 0.85), { uv: [2, 2], ry: kit.rs() * 0.2 });
  const lean = [kit.rs() * 0.02, kit.rs() * 0.02];
  kit.wood.tube([0, 0.3, 0], [lean[0] * h, h, lean[1] * h], 0.13, 0.11, col, { seg: 8, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 4 });
  // The niche box with a tiny gabled roof.
  kit.frame(lean[0] * h, h - 0.6, lean[1] * h, 0, () => {
    kit.wood.box(0, 0.1, 0.05, 0.5, 0.62, 0.35, scaleC(PAL.plankDark, GAIN * 1.1), { grain: 'y' });
    kit.wood.box(0, 0.12, 0.23, 0.36, 0.44, 0.03, scaleC(0x1b1511, 1), {});
    // The figure: a robed little saint with a head.
    kit.wood.box(0, 0.05, 0.2, 0.15, 0.26, 0.1, scaleC(PAL.ochre, GAIN * 0.9), { grain: 'y' });
    kit.wood.tube([0, 0.2, 0.2], [0, 0.31, 0.2], 0.055, 0.055, scaleC(PAL.cream, GAIN * 0.9), { seg: 7, lenSeg: 1, ao: 0 });
    kit.ember.box(0.12, 0.0, 0.2, 0.025, 0.05, 0.025, new THREE.Color(3, 1.4, 0.35), {});
    kit.light(0.12, 0.1, 0.3, { color: 0xffa860, intensity: 0.4, radius: 5, kind: 'candle' });
  });
  const roof = new Kit(kit.seed + 3, 'tmp');
  void roof;
  kit.frame(lean[0] * h, h - 0.3, lean[1] * h, 0, () => {
    gableRoof(kit, { hw: 0.32, hd: 0.26, yE: 0.28, pitch: 0.95, oe: 0.18, og: 0.14, th: 0.04, sag: 0.0, snow: 0.16, ornament: false, nu: 2, jag: 0.1, cap: 0.04, iceMax: 0.2 });
  });
  // A red thread tied round the post.
  kit.wood.tube([lean[0] * 1.2, 1.1, lean[1] * 1.2], [lean[0] * 1.2, 1.18, lean[1] * 1.2], 0.14, 0.14, redPaint(), { seg: 8, lenSeg: 1, ao: 0, capA: false, capB: false });
  kit.circle(0, 0, 0.35);
  kit.anchor('shrine', 0, 1.9, 0.3);
  return kit.finish({});
}

// ---------------- gravePost ----------------
// variant: 'plain' | 'wiesia' (empty grave, red thread flowers) | 'son' (reeve's son)
export function gravePost(opts = {}) {
  const kit = new Kit(opts.seed ?? 61, 'gravePost');
  const variant = opts.variant ?? 'plain';
  kit.footprint = { hw: 0.8, hd: 1.3 };
  const h = opts.h ?? 1.9;
  const col = wood(1.0);
  // Earth mound with snow.
  snowPillow(kit, 0, 0.0, 0.7, 0.55, 0.28, 1.0, { nu: 5, nv: 10 });
  const lean = kit.rs() * 0.03;
  kit.wood.tube([0, -0.4, 0], [lean * h, h, 0], 0.09, 0.08, col, { seg: 7, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 4 });
  // Carved face of the post: a flattened plate with a sun and zigzags.
  kit.frame(lean * h * 0.8, h * 0.72, 0, 0, () => {
    kit.wood.box(0, 0, 0.065, 0.22, 0.62, 0.03, mixC(PAL.logWeathered, PAL.logSilver, 0.4).multiplyScalar(GAIN * 1.05), { grain: 'y' });
    kit.wood.at(0, 0.16, 0.085, 0, (m) => { m.extrude(sunShape(0.065, 8), 0.015, redPaint(), { uv: [1, 3] }); });
    for (let i = 0; i < 4; i++) kit.wood.box(0, -0.05 - i * 0.07, 0.085, 0.16, 0.02, 0.012, scaleC(0x15110e, 1), { rz: (i % 2 ? 0.25 : -0.25) });
  });
  // Tiny shingle roof on top.
  kit.frame(lean * h, h + 0.0, 0, 0, () => {
    gableRoof(kit, { hw: 0.22, hd: 0.2, yE: 0.1, pitch: 0.9, oe: 0.1, og: 0.08, th: 0.03, sag: 0, snow: 0.1, ornament: false, nu: 2, jag: 0.05, cap: 0.03, iceMax: 0.12 });
  });
  if (variant === 'wiesia') {
    // Flowers made of red thread, wound on twig stems.
    for (let i = 0; i < 9; i++) {
      const x = kit.rs() * 0.35, z = 0.35 + kit.rand() * 0.9;
      const hh = kit.r(0.22, 0.38);
      kit.wood.tube([x, 0.2, z], [x + kit.rs() * 0.03, 0.2 + hh, z], 0.006, 0.006, scaleC(PAL.logDark, GAIN), { seg: 4, lenSeg: 1, ao: 0 });
      kit.cloth.ellipsoid(x, 0.2 + hh, z, 0.045, 0.035, 0.045, redPaint(), { seg: 6, rings: 3 });
    }
    kit.wood.box(0.0, 0.3, 0.6, 0.26, 0.18, 0.18, scaleC(PAL.plank, GAIN), {});
  } else if (variant === 'son') {
    kit.wood.box(0.2, 0.28, 0.7, 0.3, 0.14, 0.3, scaleC(PAL.plank, GAIN), {});
    kit.wood.tube([0.2, 0.35, 0.7], [0.2, 0.55, 0.7], 0.012, 0.012, scaleC(PAL.cream, GAIN * 0.9), { seg: 5, lenSeg: 1, ao: 0 });
    kit.ember.box(0.2, 0.57, 0.7, 0.02, 0.04, 0.02, new THREE.Color(3, 1.4, 0.35), {});
  }
  kit.circle(0, 0, 0.18);
  kit.anchor('grave', 0, 0.3, 0.8);
  kit.anchor('post', 0, h, 0);
  return kit.finish({});
}

// ---------------- stoneCircle ----------------
// Twelve menhirs with carvings of the first drownings, a central altar slab, fallen stones.
export function stoneCircle(opts = {}) {
  const kit = new Kit(opts.seed ?? 71, 'stoneCircle');
  const R = opts.radius ?? 10;
  kit.footprint = { hw: R + 2, hd: R + 2 };
  kit.noFoundation = true;
  const rk = kit.rock;
  const dark = scaleC(0x1a1916, 1);
  const stones = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + kit.rs() * 0.06;
    const r = R + kit.rs() * 0.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = kit.r(2.4, 3.8);
    const w = kit.r(1.0, 1.5), d = kit.r(0.55, 0.9);
    const yaw = -a + Math.PI / 2 + kit.rs() * 0.12; // local +z faces the center
    if (opts.fallen !== false && (i === 4 || i === 9)) continue; // these two lie in the snow, see below
    hewn(kit, { x, y: -0.5, z, w0: w, d0: d, w1: w * 0.82, d1: d * 0.8, h: h + 0.5, yaw, amp: 0.06, nu: 6, nv: 8, lichen: 0.22, topSlope: [kit.rs() * 0.25, kit.rs() * 0.12], k: kit.r(0.85, 1.05) });
    stones.push({ x, z, a, yaw, w, h, d });
  }
  // Carvings on the inner faces.
  const ax = V3(1, 0, 0), ay = V3(0, 1, 0), nz = V3(0, 0, 1);
  const stick = (cx, cy, sc, mode) => {
    // Returns polylines for a stick figure: head circle, body, arms, legs.
    const L = [];
    const circ = []; for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI * 2; circ.push([cx + Math.cos(t) * 0.05 * sc, cy + 0.34 * sc + Math.sin(t) * 0.05 * sc]); }
    L.push(circ);
    L.push([[cx, cy + 0.29 * sc], [cx, cy + 0.02 * sc]]);
    if (mode === 'up') { L.push([[cx - 0.14 * sc, cy + 0.42 * sc], [cx, cy + 0.24 * sc], [cx + 0.14 * sc, cy + 0.42 * sc]]); } else { L.push([[cx - 0.13 * sc, cy + 0.12 * sc], [cx, cy + 0.24 * sc], [cx + 0.13 * sc, cy + 0.12 * sc]]); }
    L.push([[cx - 0.1 * sc, cy - 0.2 * sc], [cx, cy + 0.02 * sc], [cx + 0.1 * sc, cy - 0.2 * sc]]);
    return L;
  };
  stones.forEach((s, i) => {
    const kind = i % 4;
    const half = (s.d * 0.9) / 2;
    rk.at(s.x, 0, s.z, s.yaw, () => {
      const p0 = [0, 0, half + 0.04];
      const wz = s.w * 0.35;
      const draw = (pl) => stroke(rk, pl, 0.035, p0, ax, ay, nz, dark, 0.016);
      if (kind === 0) {
        // The girl with raised arms above waves, a circle for the hole in the ice.
        stick(0, 1.6, 1.4, 'up').forEach(draw);
        const wv = []; for (let k = 0; k <= 10; k++) wv.push([-wz + (2 * wz * k) / 10, 1.15 + (k % 2 ? 0.06 : -0.06)]); draw(wv);
        const wv2 = wv.map(([x, y]) => [x, y - 0.18]); draw(wv2);
        const hole = []; for (let k = 0; k <= 14; k++) { const t = (k / 14) * Math.PI * 2; hole.push([Math.cos(t) * 0.22, 0.65 + Math.sin(t) * 0.12]); } draw(hole);
      } else if (kind === 1) {
        // Procession: small figures walking away in a row.
        for (let k = 0; k < 4; k++) stick(-wz + k * (wz * 0.67), 1.5, 0.8, 'down').forEach(draw);
        const ln = []; for (let k = 0; k <= 8; k++) ln.push([-wz - 0.05 + (2 * wz * k) / 8, 1.28]); draw(ln);
      } else if (kind === 2) {
        // Spiral and concentric rings.
        const sp = []; for (let k = 0; k <= 40; k++) { const t = k / 40; const an = t * Math.PI * 5; sp.push([Math.cos(an) * t * 0.4, 1.7 + Math.sin(an) * t * 0.4]); } draw(sp);
        const ring = []; for (let k = 0; k <= 16; k++) { const t = (k / 16) * Math.PI * 2; ring.push([Math.cos(t) * 0.18, 0.9 + Math.sin(t) * 0.18]); } draw(ring);
        draw([[-0.3, 0.55], [0.3, 0.55]]); draw([[-0.25, 0.45], [0.25, 0.45]]);
      } else {
        // Sun with rays above a drowned figure lying on its side.
        const sun = []; for (let k = 0; k <= 12; k++) { const t = (k / 12) * Math.PI * 2; sun.push([Math.cos(t) * 0.16, 1.9 + Math.sin(t) * 0.16]); } draw(sun);
        for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2; draw([[Math.cos(t) * 0.22, 1.9 + Math.sin(t) * 0.22], [Math.cos(t) * 0.34, 1.9 + Math.sin(t) * 0.34]]); }
        draw([[-0.35, 0.9], [0.3, 0.92]]); draw([[-0.4, 0.95], [-0.34, 0.9], [-0.4, 0.84]]);
      }
    });
    kit.circle(s.x, s.z, Math.max(s.w, s.d) * 0.5);
    // Snow on the crown.
    snowPillow(kit, s.x, s.h - 0.05, s.z, s.w * 0.4, 0.14, s.d * 0.4, { nu: 3, nv: 8 });
  });
  // Central altar: a flat slab on three short stones, with a carved basin and a spiral.
  hewn(kit, { x: 0, y: -0.2, z: 0, w0: 2.6, d0: 1.7, w1: 2.5, d1: 1.6, h: 0.95, yaw: 0.2, amp: 0.04, nu: 8, nv: 4, lichen: 0.2, wet: 0.5 });
  rk.at(0, 0.84, 0, 0.2, () => {
    const ring = []; for (let k = 0; k <= 24; k++) { const t = (k / 24) * Math.PI * 2; ring.push([Math.cos(t) * 0.55, Math.sin(t) * 0.55]); }
    stroke(rk, ring, 0.05, [0, 0.0, 0], ax, V3(0, 0, -1), V3(0, 1, 0), dark, 0.016);
    const sp = []; for (let k = 0; k <= 50; k++) { const t = k / 50; const an = t * Math.PI * 6; sp.push([Math.cos(an) * t * 0.5, Math.sin(an) * t * 0.5]); }
    stroke(rk, sp, 0.035, [0, 0.0, 0], ax, V3(0, 0, -1), V3(0, 1, 0), dark, 0.016);
  });
  snowPillow(kit, 0.5, 0.78, 0.2, 0.7, 0.12, 0.5, { nu: 3, nv: 8 });
  kit.circle(0, 0, 1.3);
  // Fallen stones near the ring.
  for (const [fx, fz, fy] of [[R * 0.55, R * 0.7, 0.4], [-R * 0.62, -R * 0.5, 2.2]]) {
    rk.at(fx, 0.45, fz, fy, () => {
      hewn(kit, { x: 0, y: -0.3, z: -1.4, w0: 1.1, d0: 0.8, w1: 0.9, d1: 0.7, h: 2.8, amp: 0.05, nu: 5, nv: 7, lichen: 0.3 });
    }, 1.45, 0);
  }
  kit.anchor('altar', 0, 0.8, 0);
  kit.anchor('center', 0, 0, 0);
  kit.anchor('door', 0, 0, R + 1.5);
  return kit.finish({ noFoundation: true });
}
