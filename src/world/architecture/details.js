// Reusable building details: stone chimney, porch, steps, railings, woodshed lean-to, benches,
// firewood, hanging sign brackets, ladders. All write into the kit's material builders.
import * as THREE from 'three';
import { C, mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';
import { shedRoof, icicles, snowLayer, smooth } from './roofs.js';
import { dropsShape } from './carve.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const stoneTone = (kit, k = 1) => mixC(PAL.stoneDark, PAL.stoneWarm, kit.rand()).multiplyScalar(GAIN * kit.r(0.9, 1.1) * k);

// Snow pillow sitting on a flat top. Rounded loaf, slightly irregular. Lives in kit.snow.
export function snowPillow(kit, cx, cy, cz, rx, ry, rz, o = {}) {
  const nu = o.nu ?? 7, nv = o.nv ?? 10;
  const rows = [];
  const base = [];
  const n = o.noise ?? 0.14;
  for (let i = 0; i <= nu; i++) {
    const a = (i / nu) * (Math.PI / 2); // 0 at the rim, pi/2 at the crown
    const row = [], brow = [];
    for (let j = 0; j <= nv; j++) {
      const b = (j / nv) * Math.PI * 2;
      const k = 1 + (kit.n2(cx * 1.3 + Math.cos(b) * 2 + 5, cz * 1.3 + Math.sin(b) * 2) - 0.5) * n * 2;
      const x = cx + Math.cos(b) * rx * Math.cos(a) * k, z = cz + Math.sin(b) * rz * Math.cos(a) * k;
      const y = cy + ry * Math.sin(a) * (0.9 + 0.2 * k);
      row.push([x, y, z]);
      brow.push([x, cy, z]);
    }
    rows.push(row); base.push(brow);
  }
  // Rows go rim -> crown. Flip so the outward normal faces up.
  kit.snow.grid(rows, C(PAL.snow), {
    flip: true, uv: [2, 2],
    colorFn: (i, j, p) => mixC(PAL.snowBlue, PAL.snow, 0.5 + 0.5 * kit.n2(p.x * 2, p.z * 2)),
    baseFn: (i, j) => base[i][j],
  });
}

// ---------- chimney ----------
// Stone stack against a wall. Local frame: x along the wall, z outward from the wall plane (use
// inside kit.frame). Returns the smoke anchor height.
export function chimney(kit, f, o) {
  const { s, yTop, w = 1.35, d = 0.95, z0 = 0 } = o;
  const lean = o.lean ?? kit.rs() * 0.012;
  const yBot = o.yBot ?? -0.5;
  const out = [];
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const hot = o.hot !== false;
    const segs = 6;
    const hTotal = yTop - yBot;
    // Tapering stack made of stacked, slightly offset blocks.
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const sw = w * (1 - 0.34 * smooth(0.0, 0.62, t0)), sd = d * (1 - 0.25 * smooth(0.0, 0.62, t0));
      const h = hTotal * (t1 - t0) + 0.04;
      const col = stoneTone(kit);
      kit.stone.box(s + kit.rs() * 0.02 + lean * hTotal * t0, yBot + hTotal * t0 + h / 2, z0 + sd / 2 + kit.rs() * 0.015, sw, h, sd, col, {
        ry: kit.rs() * 0.025, uv: [2, 2], top: scaleC(col, 1.08), skip: '-y',
      });
    }
    // Cap: wide slab with a flue block, and a snow pillow.
    const sw = w * 0.66, sd = d * 0.75;
    const cx = s + lean * hTotal;
    kit.stone.box(cx, yTop + 0.06, z0 + d / 2, sw + 0.25, 0.12, sd + 0.25, stoneTone(kit, 0.9), { uv: [2, 2] });
    kit.stone.box(cx - sw * 0.2, yTop + 0.3, z0 + d / 2, sw * 0.28, 0.4, sd * 0.45, stoneTone(kit, 0.75), { uv: [2, 2] });
    kit.stone.box(cx + sw * 0.2, yTop + 0.3, z0 + d / 2, sw * 0.28, 0.4, sd * 0.45, stoneTone(kit, 0.75), { uv: [2, 2] });
    if (o.snow !== false) snowPillow(kit, cx, yTop + 0.12, z0 + d / 2, (sw + 0.25) * 0.55, 0.2, (sd + 0.25) * 0.55);
    out.push([cx, yTop + 0.55, z0 + d / 2]);
    void hot;
  });
  const p = out[0];
  const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  return V3(f.x + p[0] * c + p[2] * sn, p[1], f.z - p[0] * sn + p[2] * c);
}

// ---------- steps ----------
// Wooden steps going out from (x, z) toward direction ang (three yaw: 0 faces +z). n treads.
export function steps(kit, x, z, yaw, width, n, rise = 0.17, run = 0.32, topY = 0.2) {
  kit.frame(x, 0, z, yaw, () => {
    for (let i = 0; i < n; i++) {
      const y = topY - (i + 1) * rise;
      const col = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN);
      kit.wood.box(0, y + rise / 2 - 0.02, (i + 0.5) * run, width + kit.rs() * 0.03, rise - 0.01, run - 0.015, col, { grain: 'x', top: scaleC(col, 1.05), uv: [1, 3] });
    }
  });
}

// ---------- railing ----------
// Rail between two points at deck level y: posts, top rail and balusters.
export function railing(kit, ax, az, bx, bz, y, o = {}) {
  const h = o.h ?? 0.95;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) - Math.PI / 2; // local x along the rail
  const col = mixC(PAL.plank, PAL.logWeathered, 0.4).multiplyScalar(GAIN);
  kit.frame(ax, y, az, -Math.atan2(dz, dx), () => {
    kit.wood.box(len / 2, h, 0, len, 0.07, 0.1, col, { grain: 'x', top: scaleC(col, 1.1) });
    kit.wood.box(len / 2, h * 0.45, 0, len, 0.05, 0.07, scaleC(col, 0.9), { grain: 'x' });
    const n = Math.max(2, Math.round(len / 0.16));
    for (let i = 0; i <= n; i++) {
      if (o.gap && kit.chance(0.05)) continue;
      const lean = kit.rs() * 0.02;
      kit.wood.box((i / n) * len, h * 0.5, 0, 0.04, h - 0.06, 0.04, scaleC(col, 0.95), { grain: 'y', rz: lean });
    }
  });
  void yaw;
}

// ---------- bench ----------
export function bench(kit, x, y, z, yaw, len = 1.6, o = {}) {
  const col = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.4).multiplyScalar(GAIN);
  kit.frame(x, y, z, yaw, () => {
    kit.wood.box(0, 0.44, 0, len, 0.05, 0.34, col, { grain: 'x', top: scaleC(col, 1.08) });
    for (const sx of [-1, 1]) kit.wood.box(sx * (len / 2 - 0.15), 0.21, 0, 0.06, 0.42, 0.3, scaleC(col, 0.85), { grain: 'y' });
    if (o.back) kit.wood.box(0, 0.8, -0.16, len, 0.2, 0.04, scaleC(col, 0.95), { grain: 'x' });
  });
}

// ---------- firewood ----------
// A neat stack of split logs, ends facing +z (local), n columns by m rows, log length ll.
export function firewoodStack(kit, x, y, z, yaw, cols = 8, rows = 5, ll = 0.55, o = {}) {
  const r = o.r ?? 0.075;
  kit.frame(x, y, z, yaw, () => {
    // Back plane keeps gaps from showing the interior.
    kit.wood.box(0, rows * r * 0.9, 0, cols * r * 2, rows * r * 1.8, ll * 0.8, scaleC(PAL.logDark, GAIN * 0.8), { grain: 'z', skip: '-y' });
    for (let j = 0; j < rows; j++) {
      const rowOff = (j % 2) * r;
      for (let i = 0; i < cols - (j % 2); i++) {
        if (kit.chance(0.03)) continue;
        const rr = r * kit.r(0.8, 1.15);
        const col = mixC(0xb08a5a, PAL.logWeathered, kit.rand() * 0.8).multiplyScalar(GAIN * kit.r(0.8, 1.1));
        const px = (i - cols / 2 + 0.5) * r * 2 + rowOff, py = r + j * r * 1.75;
        const len = ll * kit.r(0.9, 1.1);
        kit.wood.tube([px, py, -len / 2 + ll * 0.1], [px, py, len / 2 + ll * 0.1], rr, rr, col, { seg: 6, lenSeg: 1, ao: 0.1, endCol: 0xd2b080 });
      }
    }
    // Snow on top.
    if (o.snow !== false) snowPillow(kit, 0, rows * r * 1.8 - 0.05, 0.05, cols * r * 1.0, 0.1, ll * 0.5, { nu: 3, nv: 8 });
  });
}

// ---------- lean-to woodshed ----------
// Against a wall, in the wall frame (x along the wall, z outward). Returns nothing.
// o: s, len, depth, hHigh, hLow, wood (bool)
export function leanTo(kit, f, o) {
  const { s, len, depth } = o;
  const hHigh = o.hHigh ?? 2.35, hLow = o.hLow ?? 1.85;
  const z0 = o.z0 ?? 0.35;
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const col = mixC(PAL.logDark, PAL.logWeathered, 0.5).multiplyScalar(GAIN);
    const nPosts = Math.max(2, Math.round(len / 1.7) + 1);
    for (let i = 0; i < nPosts; i++) {
      const px = s - len / 2 + (len * i) / (nPosts - 1);
      const lean = kit.rs() * 0.02;
      kit.wood.tube([px, -0.25, z0 + depth], [px + lean * hLow, hLow, z0 + depth], 0.075, 0.07, col, { seg: 6, lenSeg: 1, ao: 0.2 });
    }
    // Front beam.
    kit.wood.tube([s - len / 2 - 0.15, hLow, z0 + depth], [s + len / 2 + 0.15, hLow, z0 + depth], 0.07, 0.07, col, { seg: 6, lenSeg: 1, ao: 0.2 });
    // Rafters.
    for (let i = 0; i < nPosts; i++) {
      const px = s - len / 2 + (len * i) / (nPosts - 1);
      kit.wood.tube([px, hHigh, 0.2], [px, hLow + 0.05, z0 + depth + 0.3], 0.045, 0.045, col, { seg: 5, lenSeg: 1, ao: 0.2 });
    }
    // Roof: high edge at the wall.
    shedRoof(kit, V3(s - len / 2 - 0.2, hHigh + 0.07, 0.2), V3(s + len / 2 + 0.2, hHigh + 0.07, 0.2),
      V3(s - len / 2 - 0.2, hLow + 0.1, z0 + depth + 0.45), V3(s + len / 2 + 0.2, hLow + 0.1, z0 + depth + 0.45),
      { th: 0.07, snow: 0.2, pitch: Math.atan2(hHigh - hLow, depth + 0.3), nu: 3, jag: 0.2 });
    if (o.wood !== false) {
      const cols = Math.max(4, Math.round(len / 0.16));
      firewoodStack(kit, s, 0, z0 + depth * 0.5, Math.PI / 2 * 0, cols, 6, depth * 0.8, { snow: false });
    }
  });
}

// ---------- porch ----------
// Covered porch in the wall frame, centered at s. Deck raised 0.2 m with steps on the free side.
// o: s, w, depth, hHigh (roof attach height at the wall), hLow, benches (bool), railing (bool)
export function porch(kit, f, o) {
  const { s, w, depth, r } = o;
  const hHigh = o.hHigh ?? 3.15, hLow = o.hLow ?? 2.35;
  const deckY = 0.2;
  const z0 = r + 0.02;
  const colPost = mixC(PAL.logWeathered, PAL.logDark, 0.35).multiplyScalar(GAIN);
  const postsOut = [];
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    // Deck: boards along x on joists, stone footers.
    const n = Math.round(depth / 0.24);
    for (let i = 0; i < n; i++) {
      const col = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN * kit.r(0.85, 1.1));
      kit.wood.box(s, deckY - 0.03, z0 + (i + 0.5) * (depth / n), w, 0.06, depth / n - 0.01, col, { grain: 'x', top: scaleC(col, 1.08), skip: '-y', uv: [1, 3] });
    }
    kit.wood.box(s, deckY - 0.2, z0 + depth - 0.05, w, 0.18, 0.1, scaleC(PAL.plankDark, GAIN), { grain: 'x' });
    for (const sx of [-1, 1]) {
      const sc = stoneTone(kit);
      kit.stone.box(s + sx * (w / 2 - 0.1), -0.15, z0 + depth - 0.1, 0.5, 0.5, 0.5, sc, { ry: kit.rs() * 0.5, uv: [2, 2] });
      kit.stone.box(s + sx * (w / 2 - 0.1), -0.15, z0 + 0.4, 0.5, 0.5, 0.5, stoneTone(kit), { ry: kit.rs() * 0.5, uv: [2, 2] });
    }
    // Posts at the outer corners, with brackets.
    for (const sx of [-1, 1]) {
      const px = s + sx * (w / 2 - 0.12);
      const pz = z0 + depth - 0.12;
      const lean = [kit.rs() * 0.025, kit.rs() * 0.025];
      kit.wood.tube([px, -0.15, pz], [px + lean[0] * hLow, hLow - 0.06, pz + lean[1] * hLow], 0.1, 0.085, colPost, { seg: 7, lenSeg: 2, ao: 0.25, wobble: 0.02, ph: kit.rand() * 5 });
      kit.wood.box(px + sx * -0.2, hLow - 0.25, pz, 0.45, 0.06, 0.1, colPost, { grain: 'x', rz: sx * 0.7 });
      kit.wood.box(px, hLow - 0.25, pz - 0.2, 0.1, 0.06, 0.45, colPost, { grain: 'z', rx: 0.7 });
      postsOut.push([px, pz]);
    }
    // Front beam + carved drops.
    kit.wood.tube([s - w / 2 - 0.1, hLow - 0.02, z0 + depth - 0.12], [s + w / 2 + 0.1, hLow - 0.02, z0 + depth - 0.12], 0.1, 0.1, colPost, { seg: 7, lenSeg: 2, ao: 0.25, bow: [0, -0.015, 0] });
    kit.wood.at(s - w / 2 + 0.05, hLow - 0.42, z0 + depth - 0.1, 0, (m) => {
      m.extrude(dropsShape(w - 0.1, 0.28), 0.035, scaleC(o.paint ?? PAL.blueFaded, GAIN * 0.9), { uv: [1, 3] });
    });
    // Rafters from the wall to the front beam.
    const nR = Math.max(3, Math.round(w / 0.9));
    for (let i = 0; i < nR; i++) {
      const px = s - w / 2 + 0.1 + ((w - 0.2) * i) / (nR - 1);
      kit.wood.tube([px, hHigh - 0.02, z0], [px, hLow + 0.03, z0 + depth - 0.1], 0.05, 0.05, colPost, { seg: 5, lenSeg: 1, ao: 0.2 });
    }
    // Roof.
    shedRoof(kit,
      V3(s - w / 2 - 0.25, hHigh + 0.08, z0 - 0.02), V3(s + w / 2 + 0.25, hHigh + 0.08, z0 - 0.02),
      V3(s - w / 2 - 0.25, hLow + 0.1, z0 + depth + 0.45), V3(s + w / 2 + 0.25, hLow + 0.1, z0 + depth + 0.45),
      { th: 0.09, snow: 0.24, pitch: Math.atan2(hHigh - hLow, depth + 0.45), nu: 4, jag: 0.18 });
    // Side railings and benches.
    if (o.railing !== false) {
      for (const sx of [-1, 1]) {
        railing(kit, s + sx * (w / 2 - 0.12), z0 + 0.3, s + sx * (w / 2 - 0.12), z0 + depth - 0.12, deckY, { h: 0.85 });
      }
    }
    if (o.benches) {
      for (const sx of [-1, 1]) {
        if (sx * (o.doorS - s) > -0.9) continue;
        bench(kit, s + sx * (w / 2 - 0.55), deckY, z0 + 0.25, 0, 1.2);
      }
    }
    // Steps down the front.
    if (o.steps !== false) steps(kit, s - (o.stepsShift ?? 0), z0 + depth, 0, Math.min(1.4, w * 0.45), 2, 0.1, 0.3, deckY);
  });
  // Posts become colliders.
  for (const [px, pz] of postsOut) {
    const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    kit.circle(f.x + px * c + pz * sn, f.z - px * sn + pz * c, 0.14);
  }
  const hp = 0;
  void hp;
  const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  const px = s, pz = z0 + depth * 0.5;
  return V3(f.x + px * c + pz * sn, deckY, f.z - px * sn + pz * c);
}

// ---------- ladder ----------
export function ladder(kit, x, y0, z, yaw, h, lean = 0.2, w = 0.5) {
  const col = mixC(PAL.plank, PAL.logWeathered, 0.4).multiplyScalar(GAIN);
  kit.frame(x, y0, z, yaw, () => {
    for (const sx of [-1, 1]) kit.wood.tube([sx * w / 2, 0, 0], [sx * w / 2, h, -lean], 0.035, 0.035, col, { seg: 5, lenSeg: 1, ao: 0.2 });
    const n = Math.floor(h / 0.3);
    for (let i = 1; i <= n; i++) {
      const t = (i * 0.3) / h;
      kit.wood.tube([-w / 2, i * 0.3, -lean * t], [w / 2, i * 0.3, -lean * t], 0.022, 0.022, col, { seg: 5, lenSeg: 1, ao: 0.2 });
    }
  });
}

// ---------- hanging sign bracket + board ----------
export function hangingSign(kit, x, y, z, yaw, o = {}) {
  const dark = scaleC(PAL.iron, GAIN * 0.7);
  kit.frame(x, y, z, yaw, () => {
    kit.metal.box(0.5, 0, 0, 1.0, 0.04, 0.04, dark, { grain: 'x' });
    kit.metal.box(0.35, -0.3, 0, 0.04, 0.04, 0.04, dark);
    kit.metal.box(0.45, -0.18, 0, 0.035, 0.4, 0.035, dark, { rz: 0.9 });
    // Board hangs from two chains.
    const bw = o.w ?? 0.65, bh = o.h ?? 0.5;
    kit.wood.box(0.62, -0.38 - bh / 2, 0, bw, bh, 0.05, scaleC(o.col ?? PAL.plankDark, GAIN * 1.1), { grain: 'y', uv: [1, 3] });
    kit.metal.box(0.62 - bw / 2 + 0.05, -0.25, 0, 0.012, 0.25, 0.012, dark);
    kit.metal.box(0.62 + bw / 2 - 0.05, -0.25, 0, 0.012, 0.25, 0.012, dark);
  });
}

// ---------- stairs ----------
// Straight flight. (x, z) is the bottom front edge point, yaw faces the climbing direction
// (three.js yaw: 0 climbs toward +z). Registers a walk ramp in the kit. o: rails, col, solid (stone)
export function stairs(kit, x, y0, z, yaw, o) {
  const { width = 1.0, steps = 10, rise = 0.19, run = 0.28 } = o;
  const col = o.col ?? mixC(PAL.plank, PAL.plankDark, 0.35).multiplyScalar(GAIN);
  kit.frame(x, y0, z, yaw, () => {
    for (let i = 0; i < steps; i++) {
      const c = mixC(col, PAL.plankDark, kit.rand() * 0.3);
      if (o.stone) {
        const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN);
        kit.stone.box(0, (i + 1) * rise - (o.thick ?? 0.9) / 2 + 0.0, (i + 0.5) * run, width, o.thick ?? 0.9, run + 0.02, sc, { top: scaleC(sc, 1.1), uv: [2, 2], skip: '-y' });
      } else {
        kit.wood.box(0, (i + 1) * rise - 0.025, (i + 0.5) * run, width, 0.05, run - 0.012, c, { grain: 'x', top: scaleC(c, 1.06), uv: [1, 3] });
        if (i > 0) kit.wood.box(0, i * rise + rise / 2 - 0.02, (i + 0.0) * run - 0.0, width - 0.1, rise - 0.02, 0.03, scaleC(c, 0.7), { grain: 'x' });
      }
    }
    if (!o.stone) {
      const len = Math.hypot(steps * run, steps * rise);
      const ang = Math.atan2(steps * rise, steps * run);
      for (const sx of [-1, 1]) {
        kit.wood.box(sx * (width / 2 + 0.03), steps * rise / 2 - 0.12, steps * run / 2, 0.06, 0.28, len, scaleC(col, 0.8), { grain: 'z', rx: -ang });
      }
    }
    if (o.rails) {
      const hrise = steps * rise;
      for (const sx of [-1, 1]) {
        kit.wood.tube([sx * (width / 2 + 0.05), 0.95, 0], [sx * (width / 2 + 0.05), hrise + 0.95, steps * run], 0.035, 0.035, scaleC(col, 1.1), { seg: 6, lenSeg: 1, ao: 0.2 });
        for (let i = 0; i <= steps; i += 2) kit.wood.tube([sx * (width / 2 + 0.05), i * rise, i * run], [sx * (width / 2 + 0.05), i * rise + 0.95, i * run], 0.025, 0.025, scaleC(col, 0.9), { seg: 5, lenSeg: 1, ao: 0.1 });
      }
    }
  });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const run_ = steps * run;
  kit.walk.ramps.push({
    a: [x, y0, z], b: [x + run_ * s, y0 + steps * rise, z + run_ * c], width,
  });
}

// ---------- a bell hung from a bracket, for signs and shrines ----------
export function bellObject(kit, x, y, z, r = 0.16, o = {}) {
  const prof = [[r, 0], [r * 0.93, r * 0.45], [r * 0.7, r * 1.1], [r * 0.5, r * 1.7], [r * 0.38, r * 2.1], [r * 0.2, r * 2.25], [0.001, r * 2.3]];
  const col = mixC(PAL.bronze, 0x4a6a4a, o.patina ?? 0.15).multiplyScalar(GAIN * 0.9);
  kit.metal.at(x, y, z, 0, (m) => {
    m.lathe(prof, col, { seg: 10, closeBottom: false, uv: [1, 1] });
    m.tube([0, r * 0.05, 0], [0, -r * 0.25, 0], r * 0.07, r * 0.09, scaleC(PAL.iron, GAIN * 0.6), { seg: 6, lenSeg: 1, ao: 0 });
  });
}
