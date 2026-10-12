// Village furniture: well, market stall, notice board, fences (wattle and split-rail), palisade,
// gate, boardwalk, bridge. Linear structures take a polyline and an optional ground function:
//   fence({ points: [[x, z], ...], style: 'wattle' | 'rail', heightAt: (x, z) => y })
// The result is a group at the origin (use placeBuilding with snap: false, y: 0 for these).
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { MB, C, mixC, scaleC } from '../mb.js';
import { gableRoof, shedRoof, snowLayer, icicles, smooth } from '../roofs.js';
import { snowPillow } from '../details.js';
import { horseHeadShape, signShape } from '../carve.js';
import { boulder } from '../masonry.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const wood = (k = 1) => mixC(PAL.logDark, PAL.logWeathered, 0.45).multiplyScalar(GAIN * k);
const plankC = (kit) => mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.1));

// ---------------- well ----------------
export function well(opts = {}) {
  const kit = new Kit(opts.seed ?? 81, 'well');
  kit.footprint = { hw: 1.3, hd: 1.3 };
  // Stone curb of rough blocks, 16 around, two courses.
  for (let c = 0; c < 3; c++) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (c % 2) * (Math.PI / n);
      const col = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN * kit.r(0.85, 1.05));
      kit.stone.at(Math.cos(a) * 0.82, c * 0.34, Math.sin(a) * 0.82, -a + Math.PI / 2, (m) => {
        m.box(0, 0.17, 0, 0.62, 0.34, 0.42, col, { ry: kit.rs() * 0.05, uv: [2, 2], top: scaleC(col, 1.1) });
      });
    }
  }
  kit.stone.tube([0, 0.0, 0], [0, 0.04, 0], 0.95, 0.95, scaleC(PAL.stoneDark, GAIN * 0.3), { seg: 14, lenSeg: 1, ao: 0, uv: [2, 2] });
  // Frozen water far below, as a dark disc inside, and ice crust rim.
  kit.ice.tube([0, 0.95, 0], [0, 0.99, 0], 0.62, 0.62, mixC(PAL.iceDeep, PAL.ice, 0.4), { seg: 14, lenSeg: 1, ao: 0 });
  // Posts and roof.
  const h = 2.5;
  for (const sx of [-1, 1]) {
    kit.wood.tube([sx * 0.95, 0.3, 0], [sx * 0.95 + kit.rs() * 0.02, h, 0], 0.1, 0.09, wood(1.05), { seg: 8, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 5 });
    kit.wood.tube([sx * 0.95, h - 0.2, 0], [sx * 0.55, h + 0.35, 0], 0.045, 0.045, wood(), { seg: 5, lenSeg: 1, ao: 0.2 });
  }
  // Windlass: crank, rope and bucket.
  kit.wood.tube([-1.15, 1.7, 0], [1.15, 1.7, 0], 0.11, 0.11, wood(1.1), { seg: 8, lenSeg: 2, ao: 0.25 });
  kit.wood.tube([1.15, 1.7, 0], [1.4, 1.7, 0], 0.03, 0.03, scaleC(PAL.iron, GAIN * 0.7), { seg: 5, lenSeg: 1, ao: 0 });
  kit.wood.tube([1.4, 1.7, 0], [1.4, 1.35, 0.0], 0.025, 0.025, scaleC(PAL.iron, GAIN * 0.7), { seg: 5, lenSeg: 1, ao: 0 });
  kit.wood.tube([1.4, 1.35, 0], [1.55, 1.35, 0], 0.04, 0.04, wood(), { seg: 6, lenSeg: 1, ao: 0 });
  kit.wood.tube([0.0, 1.62, 0.05], [0.0, 1.0, 0.05], 0.012, 0.012, scaleC(0xb0a080, 1), { seg: 4, lenSeg: 2, ao: 0 });
  kit.wood.lathe([[0.1, 0.78], [0.14, 0.78 + 0.0], [0.16, 0.98], [0.13, 1.0]], scaleC(PAL.plankDark, GAIN * 1.2), { seg: 8, uv: [1, 1] });
  kit.frame(0, 0, 0, 0, () => {
    gableRoof(kit, { hw: 1.05, hd: 1.0, yE: h + 0.25, pitch: 0.82, oe: 0.35, og: 0.3, th: 0.06, sag: 0.03, snow: 0.2, iceMax: 0.35, ornament: true, sun: false, nu: 3, jag: 0.12, cap: 0.08 });
  });
  // Ice skirt of spilled water around the base.
  const rows = [], bases = [];
  for (let i = 0; i <= 3; i++) {
    const row = [], br = [];
    for (let j = 0; j <= 20; j++) {
      const a = (j / 20) * Math.PI * 2;
      const r = 1.05 + i * 0.28 + (kit.n2(Math.cos(a) * 2, Math.sin(a) * 2 + i) - 0.5) * 0.25;
      const y = 0.03 + (3 - i) * 0.03;
      row.push([Math.cos(a) * r, y, Math.sin(a) * r]); br.push([Math.cos(a) * r, 0.01, Math.sin(a) * r]);
    }
    rows.push(row); bases.push(br);
  }
  kit.ice.grid(rows, C(PAL.ice), { flip: true, uv: [2, 2], baseFn: (i, j) => bases[i][j], colorFn: (i, j, p) => mixC(PAL.ice, 0xffffff, 0.3 + 0.4 * kit.n2(p.x * 2, p.z * 2)) });
  kit.circle(0, 0, 1.05, { y1: 1.2 });
  kit.anchor('well', 0, 0.9, 0);
  kit.anchor('door', 0, 0, 1.6);
  return kit.finish({});
}

// ---------------- notice board ----------------
export function noticeBoard(opts = {}) {
  const kit = new Kit(opts.seed ?? 91, 'noticeBoard');
  kit.footprint = { hw: 1.4, hd: 0.7 };
  const h = 2.45;
  for (const sx of [-1, 1]) {
    kit.wood.tube([sx * 1.1, -0.35, 0], [sx * 1.1 + kit.rs() * 0.02, h, 0], 0.1, 0.09, wood(1.05), { seg: 8, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 5 });
    kit.stone.box(sx * 1.1, -0.1, 0, 0.5, 0.3, 0.5, scaleC(PAL.stone, GAIN * 0.8), { uv: [2, 2], ry: kit.rs() * 0.5 });
  }
  // Backboard of planks and a frame.
  for (let i = 0; i < 9; i++) kit.wood.box(-1.0 + i * 0.25 + 0.125, 1.5, 0.0, 0.235, 1.35, 0.05, plankC(kit), { grain: 'y', uv: [1, 3] });
  const frameC = scaleC(PAL.plankDark, GAIN * 1.15);
  kit.wood.box(0, 2.2, 0.05, 2.35, 0.1, 0.09, frameC, { grain: 'x' });
  kit.wood.box(0, 0.8, 0.05, 2.35, 0.1, 0.09, frameC, { grain: 'x' });
  // Little roof over the board.
  kit.frame(0, 0, 0, 0, () => {
    shedRoof(kit, V3(-1.5, h + 0.25, -0.15), V3(1.5, h + 0.25, -0.15), V3(-1.5, h - 0.05, 0.65), V3(1.5, h - 0.05, 0.65), { th: 0.07, snow: 0.2, pitch: 0.3, nu: 3, jag: 0.15 });
  });
  // Pinned notes: paper quads with slight tilt, plus the contract with a red wax seal.
  const paper = () => mixC(0xd8ccae, 0xb8aa88, kit.rand());
  for (let i = 0; i < 7; i++) {
    const x = -0.85 + (i % 4) * 0.55 + kit.rs() * 0.06, y = 1.55 + (i < 4 ? 0.28 : -0.22) + kit.rs() * 0.05;
    const w = kit.r(0.2, 0.3), hh = kit.r(0.26, 0.38), tilt = kit.rs() * 0.12;
    kit.cloth.at(x, y, 0.062, 0, (m) => {
      m.quad([-w / 2, -hh / 2, 0], [w / 2, -hh / 2, 0], [w / 2, hh / 2, 0.01], [-w / 2, hh / 2, 0.01], paper(), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      m.quad([w / 2, -hh / 2, -0.002], [-w / 2, -hh / 2, -0.002], [-w / 2, hh / 2, 0.008], [w / 2, hh / 2, 0.008], paper(), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }, 0, tilt);
    kit.metal.box(x, y + hh / 2 - 0.02, 0.07, 0.025, 0.025, 0.02, scaleC(PAL.iron, GAIN * 0.8), {});
  }
  // The contract: larger, central, pale, with a red seal.
  kit.cloth.at(0.0, 1.45, 0.066, 0, (m) => {
    m.quad([-0.17, -0.22, 0], [0.17, -0.22, 0], [0.17, 0.22, 0.012], [-0.17, 0.22, 0.012], scaleC(0xe2d8bc, 1.0), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    m.quad([0.17, -0.22, -0.002], [-0.17, -0.22, -0.002], [-0.17, 0.22, 0.01], [0.17, 0.22, 0.01], scaleC(0xe2d8bc, 1.0), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  });
  kit.wood.tube([0.1, 1.28, 0.075], [0.1, 1.285, 0.075], 0.03, 0.03, scaleC(PAL.red, GAIN * 0.9), { seg: 8, lenSeg: 1, ao: 0 });
  kit.box(0, 0, 1.3, 0.2, 0);
  kit.anchor('contract', 0.0, 1.45, 0.3);
  kit.anchor('door', 0, 0, 1.4);
  return kit.finish({});
}

// ---------------- market stall ----------------
export function marketStall(opts = {}) {
  const kit = new Kit(opts.seed ?? 101, 'marketStall');
  const w = opts.w ?? 2.8, d = opts.d ?? 1.9;
  kit.footprint = { hw: w / 2 + 0.3, hd: d / 2 + 0.3 };
  const h = 2.3;
  const hh = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  hh.forEach(([sx, sz], i) => {
    const hgt = i < 2 ? h + 0.35 : h;
    kit.wood.tube([sx * w / 2, -0.25, sz * d / 2], [sx * w / 2 + kit.rs() * 0.03, hgt, sz * d / 2], 0.065, 0.06, wood(1.05), { seg: 7, lenSeg: 3, ao: 0.25, wobble: 0.03, ph: kit.rand() * 5 });
    kit.circle(sx * w / 2, sz * d / 2, 0.1, { y1: hgt });
  });
  // Counter with a planked top and goods crates.
  kit.wood.box(0, 0.95, d / 2 - 0.05, w, 0.07, 0.6, plankC(kit), { grain: 'x', top: scaleC(PAL.plank, GAIN * 1.1) });
  kit.wood.box(0, 0.5, d / 2 - 0.05, w - 0.1, 0.85, 0.5, scaleC(PAL.plankDark, GAIN * 1.1), { grain: 'x' });
  kit.box(0, d / 2 - 0.05, w / 2, 0.3, 0, { y1: 1.0 });
  kit.wood.box(0, 0.35, -d / 2 + 0.3, w - 0.3, 0.06, 0.5, plankC(kit), { grain: 'x' });
  // Cloth awning with a sag, striped.
  const cols = opts.colors || [[PAL.red, 0xc9bfa8], [0x3e5a78, 0xc9bfa8], [PAL.ochre, 0x6a4c3a]][Math.floor(kit.rand() * 3)];
  const rows = [];
  const nu = 6, nv = 14;
  for (let i = 0; i <= nu; i++) {
    const row = [];
    for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv;
      const x = (v - 0.5) * (w + 0.5);
      const z = -d / 2 - 0.15 + u * (d + 0.5);
      const y = h + 0.35 - u * 0.4 - Math.sin(v * Math.PI * 14) * 0.015 - Math.sin(u * Math.PI) * 0.06 - 0.25 * Math.pow(Math.abs(v - 0.5) * 2, 2) * 0.05;
      row.push([x, y, z]);
    }
    rows.push(row);
  }
  kit.cloth.grid(rows, C(cols[0]), {
    flip: false, uv: [0.6, 0.6],
    colorFn: (i, j) => (Math.floor(j / 1.0) % 2 === 0 ? scaleC(cols[0], 1.0) : scaleC(cols[1], 0.95)),
  });
  // Scalloped valance on the front edge.
  for (let j = 0; j < nv; j++) {
    const x0 = (j / nv - 0.5) * (w + 0.5), x1 = ((j + 1) / nv - 0.5) * (w + 0.5);
    const zf = -d / 2 - 0.15 + (d + 0.5);
    kit.cloth.quad([x0, h - 0.34, zf], [(x0 + x1) / 2, h - 0.46, zf], [x1, h - 0.34, zf], [(x0 + x1) / 2, h - 0.14, zf], j % 2 ? scaleC(cols[0], 1.0) : scaleC(cols[1], 0.95), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  // Snow on the awning.
  const sp = [];
  const sb = [];
  for (let i = 0; i <= 3; i++) { sp.push([]); sb.push([]); for (let j = 0; j <= 10; j++) { const u = (i / 3) * 0.7 + 0.1, v = j / 10; const p = [(v - 0.5) * (w + 0.1), h + 0.35 - u * 0.4 + 0.02 + Math.sin(u * Math.PI) * 0.0, -d / 2 - 0.1 + u * (d + 0.3)]; sb[i].push(p); sp[i].push([p[0], p[1] + 0.07 * Math.sin((i / 3) * Math.PI) * (0.6 + 0.8 * kit.n2(p[0] * 2, 1)), p[2]]); } }
  kit.snow.grid(sp, C(PAL.snow), { flip: true, uv: [2, 2], baseFn: (i, j) => sb[i][j], colorFn: () => mixC(PAL.snowBlue, PAL.snow, 0.7) });
  // Hanging goods: dried fish and herb bundles.
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.4 + i * (w - 0.8) / 5;
    kit.wood.tube([x, h - 0.12, d / 2 + 0.12], [x, h - 0.5 - kit.rand() * 0.25, d / 2 + 0.12], 0.03, 0.045, i % 2 ? scaleC(0x6a5a3a, GAIN) : scaleC(0x7a8a7a, GAIN * 0.8), { seg: 5, lenSeg: 1, ao: 0.1 });
  }
  kit.anchor('door', 0, 0, d / 2 + 0.9);
  kit.anchor('vendor', 0, 0, d / 2 - 0.9);
  return kit.finish({});
}

// ---------------- helpers for linear structures ----------------
function polyline(points, step) {
  // Walk the polyline emitting {x, z, tx, tz, s} every `step` meters.
  const out = [];
  let acc = 0, carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    let d = carry;
    while (d < len) {
      out.push({ x: ax + tx * d, z: az + tz * d, tx, tz, s: acc + d });
      d += step;
    }
    carry = d - len;
    acc += len;
  }
  const [lx, lz] = points[points.length - 1];
  const pl = points[points.length - 2];
  const tl = Math.hypot(lx - pl[0], lz - pl[1]) || 1;
  out.push({ x: lx, z: lz, tx: (lx - pl[0]) / tl, tz: (lz - pl[1]) / tl, s: acc });
  return out;
}

function boxesAlong(kit, points, thick, h, step = 3) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      kit.box((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2, thick, -Math.atan2(z1 - z0, x1 - x0), { y1: h });
    }
  }
}

// ---------------- fence ----------------
export function fence(opts = {}) {
  const kit = new Kit(opts.seed ?? 111, 'fence');
  const pts = opts.points || [[0, 0], [12, 0]];
  const style = opts.style || 'wattle';
  const gy = opts.heightAt || (() => 0);
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  kit.footprint = { hw: (maxx - minx) / 2 + 1, hd: (maxz - minz) / 2 + 1 };
  const H = opts.height ?? (style === 'wattle' ? 1.35 : 1.25);
  if (style === 'wattle') {
    const step = 0.3;
    const ps = polyline(pts, step);
    const withies = [];
    const rowsY = [0.28, 0.58, 0.88, 1.16];
    rowsY.forEach(() => withies.push([]));
    ps.forEach((p, i) => {
      const nx = -p.tz, nz = p.tx;
      const y0 = gy(p.x, p.z);
      const hh = H * kit.r(0.88, 1.1);
      const col = mixC(0x6a5a46, 0x8a7458, kit.rand()).multiplyScalar(GAIN);
      const lean = kit.rs() * 0.03;
      kit.wood.tube([p.x, y0 - 0.3, p.z], [p.x + nx * lean, y0 + hh, p.z + nz * lean], 0.028, 0.022, col, { seg: 5, lenSeg: 1, ao: 0.1, uv: [1, 3] });
      rowsY.forEach((ry, r) => {
        const sg = ((i + r) % 2 ? 1 : -1) * 0.035;
        withies[r].push([p.x + nx * sg, y0 + ry + Math.sin(i * 0.7 + r) * 0.02, p.z + nz * sg]);
      });
    });
    withies.forEach((w, r) => {
      kit.wood.sweep(w, 0.024, mixC(0x7a6448, 0x9a8460, (r % 2) * 0.5).multiplyScalar(GAIN), { seg: 5, ao: 0.1, uv: [1, 3] });
    });
    // Sturdier posts every 3 m and snow caps along the top.
    const strong = polyline(pts, 3);
    strong.forEach((p) => {
      const y0 = gy(p.x, p.z);
      kit.wood.tube([p.x, y0 - 0.4, p.z], [p.x + kit.rs() * 0.03, y0 + H + 0.18, p.z], 0.055, 0.05, wood(1.1), { seg: 6, lenSeg: 2, ao: 0.25 });
      snowPillow(kit, p.x, y0 + H + 0.18, p.z, 0.13, 0.08, 0.13, { nu: 3, nv: 6 });
    });
    ps.forEach((p, i) => { if (i % 2 === 0) { const y0 = gy(p.x, p.z); snowPillow(kit, p.x, y0 + H * 0.95, p.z, 0.2, 0.06 + 0.04 * kit.rand(), 0.08, { nu: 2, nv: 6 }); } });
  } else {
    // Split-rail: leaning posts with notched rails running through them.
    const ps = polyline(pts, 2.4);
    ps.forEach((p, i) => {
      const y0 = gy(p.x, p.z);
      const nx = -p.tz, nz = p.tx;
      for (const sg of [-1, 1]) {
        kit.wood.tube([p.x + nx * sg * 0.07, y0 - 0.4, p.z + nz * sg * 0.07], [p.x + nx * sg * 0.02, y0 + H + 0.15, p.z + nz * sg * 0.02], 0.045, 0.042, wood(1.1), { seg: 6, lenSeg: 2, ao: 0.25 });
      }
      if (i < ps.length - 1) {
        const q = ps[i + 1];
        const y1 = gy(q.x, q.z);
        for (let r = 0; r < 3; r++) {
          const ry = 0.28 + r * 0.38;
          const wob = kit.rs() * 0.03;
          kit.wood.tube([p.x - nx * 0.0, y0 + ry, p.z - nz * 0.0], [q.x, y1 + ry + wob, q.z], 0.05, 0.048, mixC(PAL.logWeathered, PAL.logSilver, kit.rand() * 0.5).multiplyScalar(GAIN), { seg: 6, lenSeg: 2, ao: 0.25, bow: [0, -0.015, 0] });
        }
        if (kit.chance(0.4)) snowPillow(kit, (p.x + q.x) / 2, y0 + 1.15, (p.z + q.z) / 2, 0.5, 0.06, 0.07, { nu: 2, nv: 6 });
      }
    });
  }
  boxesAlong(kit, pts, 0.12, H, 3);
  kit.skirtDisabled = true;
  return kit.finish({ noFoundation: true, skirt: false, snapY: false });
}

// ---------------- palisade ----------------
export function palisade(opts = {}) {
  const kit = new Kit(opts.seed ?? 121, 'palisade');
  const pts = opts.points || [[0, 0], [14, 0]];
  const gy = opts.heightAt || (() => 0);
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  kit.footprint = { hw: (maxx - minx) / 2 + 1, hd: (maxz - minz) / 2 + 1 };
  const H = opts.height ?? 3.4;
  const ps = polyline(pts, 0.31);
  ps.forEach((p, i) => {
    const y0 = gy(p.x, p.z);
    const hgt = H * kit.r(0.88, 1.08) + (kit.chance(0.08) ? -0.8 : 0);
    const r = kit.r(0.13, 0.17);
    const lean = kit.rs() * 0.025;
    const nx = -p.tz, nz = p.tx;
    const col = mixC(PAL.logDark, PAL.logSilver, 0.2 + kit.rand() * 0.45).multiplyScalar(GAIN * kit.r(0.8, 1.05));
    const ox = nx * kit.rs() * 0.03, oz = nz * kit.rs() * 0.03;
    kit.wood.tube([p.x + ox, y0 - 0.5, p.z + oz], [p.x + ox + nx * lean * hgt, y0 + hgt - 0.38, p.z + oz + nz * lean * hgt], r, r * 0.95, col, { seg: 6, lenSeg: 2, ao: 0.25, wobble: 0.03, ph: i, uo: kit.rand(), vo: kit.rand(), capA: false, capB: false });
    // Sharpened tip.
    kit.wood.tube([p.x + ox + nx * lean * (hgt - 0.38), y0 + hgt - 0.38, p.z + oz + nz * lean * (hgt - 0.38)], [p.x + ox + nx * lean * hgt, y0 + hgt, p.z + oz + nz * lean * hgt], r * 0.95, 0.015, mixC(col, 0xb9a687, 0.25), { seg: 6, lenSeg: 1, ao: 0.1, capA: false });
    if (i % 3 === 0) snowPillow(kit, p.x + ox, y0 + hgt - 0.2, p.z + oz, 0.17, 0.07, 0.17, { nu: 2, nv: 6 });
  });
  // Two horizontal ties on the inside.
  for (const ry of [0.9, 2.3]) {
    const rail = [];
    ps.filter((_, i) => i % 3 === 0).forEach((p) => { const nx = -p.tz, nz = p.tx; rail.push([p.x + nx * 0.22, gy(p.x, p.z) + ry, p.z + nz * 0.22]); });
    if (rail.length > 1) kit.wood.sweep(rail, 0.06, wood(1.05), { seg: 6, ao: 0.25 });
  }
  boxesAlong(kit, pts, 0.2, H, 3);
  return kit.finish({ noFoundation: true, skirt: false });
}

// ---------------- gate ----------------
// Village gate: two big posts, a roofed lintel with horse heads, double leaves on pivots.
export function gate(opts = {}) {
  const kit = new Kit(opts.seed ?? 131, 'gate');
  const W = opts.width ?? 4.2;
  kit.footprint = { hw: W / 2 + 1.5, hd: 1.5 };
  const H = 3.5;
  const wallLen = 3.2;
  // Palisade stubs on both sides.
  for (const sg of [-1, 1]) {
    for (let i = 0; i < Math.round(wallLen / 0.31); i++) {
      const x = sg * (W / 2 + 0.55 + i * 0.31);
      const hgt = 3.1 * kit.r(0.9, 1.06);
      const col = mixC(PAL.logDark, PAL.logSilver, 0.2 + kit.rand() * 0.45).multiplyScalar(GAIN);
      kit.wood.tube([x, -0.5, 0], [x + kit.rs() * 0.03, hgt - 0.35, 0], 0.15, 0.14, col, { seg: 6, lenSeg: 2, ao: 0.25, capA: false, capB: false, uo: kit.rand() });
      kit.wood.tube([x, hgt - 0.35, 0], [x, hgt, 0], 0.14, 0.015, mixC(col, 0xb9a687, 0.25), { seg: 6, lenSeg: 1, ao: 0.1, capA: false });
    }
    kit.box(sg * (W / 2 + 0.55 + wallLen / 2), 0, wallLen / 2, 0.2, 0, { y1: 3.2 });
  }
  // Gate posts: thick logs with carved tops.
  for (const sg of [-1, 1]) {
    const x = sg * (W / 2 + 0.25);
    kit.wood.tube([x, -0.6, 0], [x + kit.rs() * 0.02, H + 0.6, 0], 0.27, 0.23, wood(1.05), { seg: 9, lenSeg: 4, ao: 0.28, wobble: 0.03, ph: kit.rand() * 5, uo: kit.rand() });
    for (const y of [1.0, 1.35]) kit.wood.tube([x, y - 0.04, 0], [x, y + 0.04, 0], 0.285, 0.285, scaleC(PAL.red, GAIN * 0.95), { seg: 9, lenSeg: 1, ao: 0, capA: false, capB: false });
    kit.circle(x, 0, 0.3);
  }
  kit.wood.tube([-W / 2 - 0.7, H, 0], [W / 2 + 0.7, H, 0], 0.2, 0.2, wood(1.1), { seg: 8, lenSeg: 4, ao: 0.28, bow: [0, -0.03, 0] });
  // Brackets.
  for (const sg of [-1, 1]) kit.wood.tube([sg * (W / 2 + 0.25), H - 1.0, 0], [sg * (W / 2 - 0.8), H - 0.1, 0], 0.07, 0.07, wood(1.0), { seg: 6, lenSeg: 1, ao: 0.2 });
  // Little gabled roof over the beam, with horse heads.
  kit.frame(0, 0, 0, Math.PI / 2, () => {
    gableRoof(kit, { hw: 0.72, hd: W / 2 + 0.8, yE: H + 0.3, pitch: 0.8, oe: 0.35, og: 0.35, th: 0.08, sag: 0.04, snow: 0.26, iceMax: 0.45, ornament: true, sun: false, nu: 3, jag: 0.14, cap: 0.1 });
  });
  // Double leaves on pivots.
  const leafW = W / 2 - 0.05;
  const mkLeaf = (sg) => {
    // Hinged at the post (x = sg * W/2); the leaf extends toward the center (direction -sg).
    const tmp = new MB('leaf', { uv: [1, 3] });
    const e = -sg;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.05));
      tmp.box(e * (i + 0.5) * (leafW / n), 1.5, 0, leafW / n - 0.012, 3.0, 0.07, c, { grain: 'y', uv: [1, 3] });
    }
    for (const y of [0.5, 1.5, 2.5]) tmp.box(e * leafW / 2, y, 0.06, leafW, 0.16, 0.05, scaleC(PAL.plankDark, GAIN * 1.15), { grain: 'x' });
    const ang = Math.atan2(2.0, leafW);
    tmp.box(e * leafW / 2, 1.5, 0.095, Math.hypot(leafW, 2.0), 0.13, 0.04, scaleC(PAL.plankDark, GAIN * 1.05), { grain: 'x', rz: e > 0 ? ang : -ang });
    for (const y of [0.55, 2.45]) tmp.box(e * 0.5, y, 0.1, 1.0, 0.07, 0.02, scaleC(PAL.iron, GAIN * 0.8), { grain: 'x' });
    const mesh = new THREE.Mesh(tmp.build(), kit.mats.wood);
    mesh.castShadow = mesh.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(sg * (W / 2), 0, 0);
    pivot.add(mesh);
    kit.extra.push(pivot);
    const rec = { x: 0, z: 0.8, yaw: 0, w: W, h: 3.0, kind: 'leaf', id: sg < 0 ? 'left' : 'right', pivot };
    // Swings outward (+z): rotation.y = sg * angle (hinge at +x: local -x axis turns toward +z).
    const set = (t) => { rec.open = t; pivot.rotation.y = sg * 1.7 * t; };
    set(opts.open ?? 0.35);
    rec.setOpen = set;
    kit.door(rec);
  };
  mkLeaf(-1); mkLeaf(1);
  // Lantern hanging from the beam.
  kit.metal.box(0, H - 0.3, 0.1, 0.02, 0.5, 0.02, scaleC(PAL.iron, GAIN * 0.7), {});
  kit.metal.box(0, H - 0.65, 0.1, 0.22, 0.34, 0.22, scaleC(PAL.iron, GAIN * 0.7), {});
  kit.glow.box(0, H - 0.65, 0.1, 0.16, 0.26, 0.16, new THREE.Color(1, 0.85, 0.6), { uv: [40, 40], uo: 0.5, vo: 0.5 });
  kit.light(0, H - 0.65, 0.2, { color: 0xffb060, intensity: 1.0, radius: 9, kind: 'lantern' });
  kit.anchor('door', 0, 0, 1.2);
  return kit.finish({ noFoundation: true, skirt: false });
}

// ---------------- boardwalk ----------------
export function boardwalk(opts = {}) {
  const kit = new Kit(opts.seed ?? 141, 'boardwalk');
  const pts = opts.points || [[0, 0], [12, 0]];
  const gy = opts.heightAt || (() => 0);
  const width = opts.width ?? 1.7;
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  kit.footprint = { hw: (maxx - minx) / 2 + 1, hd: (maxz - minz) / 2 + 1 };
  const lift = opts.lift ?? 0.35;
  const ps = polyline(pts, 0.22);
  ps.forEach((p, i) => {
    const y = gy(p.x, p.z) + lift;
    const ry = Math.atan2(-p.tx, -p.tz); // local x runs across the walk direction
    kit.wood.at(p.x, y - 0.03, p.z, ry, (m) => {
      m.box(0, 0, 0, width * kit.r(0.97, 1.02), 0.055, 0.2, plankC(kit), { grain: 'x', top: scaleC(PAL.plank, GAIN * 1.08), uv: [1, 3] });
    });
    void i;
  });
  // Stringers and posts.
  const posts = polyline(pts, 2.6);
  posts.forEach((p) => {
    const y = gy(p.x, p.z);
    const nx = -p.tz, nz = p.tx;
    for (const sg of [-1, 1]) {
      kit.wood.tube([p.x + nx * sg * (width / 2 - 0.1), y - 0.5, p.z + nz * sg * (width / 2 - 0.1)], [p.x + nx * sg * (width / 2 - 0.1), y + lift - 0.06, p.z + nz * sg * (width / 2 - 0.1)], 0.09, 0.085, wood(1.05), { seg: 7, lenSeg: 2, ao: 0.25 });
      if (opts.rails) kit.wood.tube([p.x + nx * sg * (width / 2 - 0.05), y + lift, p.z + nz * sg * (width / 2 - 0.05)], [p.x + nx * sg * (width / 2 - 0.05), y + lift + 0.95, p.z + nz * sg * (width / 2 - 0.05)], 0.05, 0.045, wood(1.1), { seg: 6, lenSeg: 1, ao: 0.2 });
    }
  });
  if (opts.rails) {
    for (const sg of [-1, 1]) {
      const rail = polyline(pts, 2.6).map((p) => [p.x + (-p.tz) * sg * (width / 2 - 0.05), gy(p.x, p.z) + lift + 0.92, p.z + p.tx * sg * (width / 2 - 0.05)]);
      if (rail.length > 1) kit.wood.sweep(rail, 0.04, wood(1.15), { seg: 6, ao: 0.2 });
    }
  }
  const ps2 = polyline(pts, 0.8);
  for (const sg of [-1, 1]) {
    const edge = ps2.map((p) => [p.x + (-p.tz) * sg * (width / 2 - 0.08), gy(p.x, p.z) + lift - 0.14, p.z + p.tx * sg * (width / 2 - 0.08)]);
    if (edge.length > 1) kit.wood.sweep(edge, 0.08, wood(1.0), { seg: 6, ao: 0.25 });
  }
  return kit.finish({ noFoundation: true, skirt: false });
}

// ---------------- bridge ----------------
// Along the x axis, centered at the origin. Trestle supports, planked deck with a slight arch, rails.
export function bridge(opts = {}) {
  const kit = new Kit(opts.seed ?? 151, 'bridge');
  const L = opts.length ?? 14, W = opts.width ?? 3.4, rise = opts.rise ?? 0.5, y0 = opts.deckY ?? 1.2;
  kit.footprint = { hw: L / 2 + 1, hd: W / 2 + 1 };
  kit.noFoundation = true;
  const deckAt = (x) => y0 + rise * (1 - (2 * x / L) ** 2);
  // Stringer logs.
  for (const sz of [-1, 0, 1]) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const x = -L / 2 + (L * k) / 12; pts.push([x, deckAt(x) - 0.3, sz * (W / 2 - 0.4) * (sz === 0 ? 0 : 1)]); }
    kit.wood.sweep(pts, 0.2, wood(1.05), { seg: 8, ao: 0.28, uo: kit.rand() });
  }
  // Planks.
  const n = Math.round(L / 0.26);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    const slope = -2 * rise * (2 * x / L) * (2 / L);
    kit.wood.box(x, deckAt(x) - 0.03, 0, L / n - 0.015, 0.07, W, plankC(kit), { grain: 'z', top: scaleC(PAL.plank, GAIN * 1.08), rz: slope * 0.95, uv: [1, 3] });
  }
  // Trestles every ~4.5 m.
  const bays = Math.max(2, Math.round(L / 4.5));
  for (let b = 0; b <= bays; b++) {
    const x = -L / 2 + (L * b) / bays;
    for (const sz of [-1, 1]) {
      kit.wood.tube([x - 0.35, -1.6, sz * (W / 2 - 0.3)], [x, deckAt(x) - 0.45, sz * (W / 2 - 0.45)], 0.15, 0.14, wood(1.0), { seg: 7, lenSeg: 3, ao: 0.28 });
      kit.wood.tube([x + 0.35, -1.6, sz * (W / 2 - 0.3)], [x, deckAt(x) - 0.45, sz * (W / 2 - 0.45)], 0.15, 0.14, wood(1.0), { seg: 7, lenSeg: 3, ao: 0.28 });
    }
    kit.wood.tube([x, deckAt(x) - 0.55, -W / 2 + 0.2], [x, deckAt(x) - 0.55, W / 2 - 0.2], 0.17, 0.17, wood(1.1), { seg: 7, lenSeg: 2, ao: 0.28 });
    if (b > 0 && b < bays) { kit.circle(x, W / 2 - 0.4, 0.3, { y1: 0.5 }); kit.circle(x, -W / 2 + 0.4, 0.3, { y1: 0.5 }); }
  }
  // Rails and posts, snow on top rails.
  for (const sz of [-1, 1]) {
    const rail = [];
    for (let k = 0; k <= 12; k++) { const x = -L / 2 + (L * k) / 12; rail.push([x, deckAt(x) + 0.95, sz * (W / 2 - 0.12)]); }
    kit.wood.sweep(rail, 0.055, wood(1.15), { seg: 6, ao: 0.25 });
    const mid = rail.map((p) => [p[0], p[1] - 0.4, p[2]]);
    kit.wood.sweep(mid, 0.04, wood(1.05), { seg: 6, ao: 0.25 });
    for (let k = 0; k <= 12; k++) {
      const x = -L / 2 + (L * k) / 12;
      kit.wood.tube([x, deckAt(x) - 0.1, sz * (W / 2 - 0.12)], [x, deckAt(x) + 0.98, sz * (W / 2 - 0.12)], 0.06, 0.055, wood(1.1), { seg: 6, lenSeg: 2, ao: 0.25 });
      if (k % 2 === 0) snowPillow(kit, x + 0.5, deckAt(x + 0.5) + 1.0, sz * (W / 2 - 0.12), 0.55, 0.07, 0.07, { nu: 2, nv: 6 });
    }
  }
  // Colliders: rails only (the deck is walkable; gameplay follows walk.floors).
  kit.box(0, W / 2 - 0.12, L / 2, 0.1, 0, { y0: y0 + 0.2, y1: y0 + 1.6 });
  kit.box(0, -W / 2 + 0.12, L / 2, 0.1, 0, { y0: y0 + 0.2, y1: y0 + 1.6 });
  kit.walk.ramps.push({ a: [-L / 2, deckAt(-L / 2), 0], b: [0, deckAt(0), 0], width: W - 0.4, tag: 'deck' });
  kit.walk.ramps.push({ a: [0, deckAt(0), 0], b: [L / 2, deckAt(L / 2), 0], width: W - 0.4, tag: 'deck' });
  kit.anchor('west', -L / 2, y0, 0);
  kit.anchor('east', L / 2, y0, 0);
  kit.anchor('center', 0, y0 + rise, 0);
  return kit.finish({ noFoundation: true, skirt: false });
}

void boulder; void snowLayer; void icicles; void smooth; void horseHeadShape; void signShape;
