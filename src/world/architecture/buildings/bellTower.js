// The drowned bell tower of Old Marzena: a stone tower frozen into the lake ice, a leaning wooden
// belfry with a bronze bell and a snow-heavy tented roof, an iron cross. You walk in through a
// broken window at ice level, climb wooden stairs inside the stone shaft and come up through a
// hatch into the frost room: a long table with frozen bread and seats for seventeen effigies.
//
// Origin: ice surface at y = 0, tower center at (0, 0). Visible height about 16 m.
//   anchors: door (entrance), inside, top (cross tip), table, musicbox, ribbon, bell, hatch, vista, seat1..seat17
//   objects.seats: 17 x { x, y, z, yaw, side } for the effigies (yaw faces the table)
//   walk.floors: ice floor (y 0.3), two landings, the belfry floor (with hatch hole)
//   walk.ramps: ice ramp and the three stair flights
import * as THREE from 'three';
import { Kit, PAL, GAIN } from '../kit.js';
import { C, mixC, scaleC } from '../mb.js';
import { stoneRing } from '../masonry.js';
import { wallFrame } from '../walls.js';
import { slab, snowLayer, icicles, smooth } from '../roofs.js';
import { stairs, snowPillow, icePatch } from '../details.js';
import { table, bench } from '../furnish.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function bellTower(opts = {}) {
  const kit = new Kit(opts.seed ?? 77, 'bellTower');
  kit.mergeIce = false;
  kit.mergeMetal = false;
  kit.noFoundation = true;
  kit.skirt = false;
  const HO = 3.0, HI = 2.15, TOP = 5.1, FLOOR = 5.4, ICEY = 0.3;
  const BH = 3.0; // belfry post line half-width
  kit.footprint = { hw: 3.6, hd: 3.6 };

  // ---------------- stone shaft ----------------
  const holes = [
    { wall: 'front', s0: -0.95, s1: 0.95, y0: -0.5, y1: 1.85 }, // the broken window at ice level
    { wall: 'right', s0: -0.4, s1: 0.4, y0: 3.0, y1: 4.3 },
    { wall: 'left', s0: -0.4, s1: 0.4, y0: 3.0, y1: 4.3 },
    { wall: 'back', s0: -0.4, s1: 0.4, y0: 3.0, y1: 4.3 },
    { wall: 'back', s0: 1.1, s1: 1.3, y0: 1.2, y1: 2.2 },
    { wall: 'left', s0: -1.2, s1: -1.0, y0: 1.2, y1: 2.2 },
    { wall: 'right', s0: 0.8, s1: 1.0, y0: 1.2, y1: 2.2 },
  ];
  stoneRing(kit, {
    hw: HO, hd: HO, inner: HI, y0: -1.2, batter: 0.03, bh: 0.42, holes, jag: 0.45, lichen: 0.08,
    top: (wall, s) => TOP + 0.1 * Math.sin(s * 1.7 + (wall === 'front' ? 1 : wall === 'back' ? 3 : 2)),
  });
  // Old plaster clinging to the stone in ragged patches (breaks up the block grid, reads as a church tower).
  for (const wallN of ['front', 'right', 'back', 'left']) {
    for (let i = 0; i < 6; i++) {
      const w = kit.r(0.9, 2.0), h = kit.r(0.8, 1.7);
      const sc = kit.rs() * (HO - w / 2 - 0.4), yc = kit.r(0.6, TOP - 0.9);
      if (wallN === 'front' && Math.abs(sc) < 1.3 + w / 2 && yc - h / 2 < 2.1) continue;
      if (holes.some((ho) => ho.wall === wallN && sc + w / 2 > ho.s0 - 0.2 && sc - w / 2 < ho.s1 + 0.2 && yc + h / 2 > ho.y0 - 0.2 && yc - h / 2 < ho.y1 + 0.2)) continue;
      const hwo = HO - 0.03 * 1.2; // outer face at y = 0; the tilt below follows the batter
      const fr = wallFrame(wallN, hwo, hwo);
      const pts = [];
      const nv = 9, ph = kit.rand() * 6;
      for (let k = 0; k < nv; k++) {
        const a = (k / nv) * Math.PI * 2;
        const rr = 0.72 + 0.28 * kit.n2(Math.cos(a) * 2 + ph, Math.sin(a) * 2) + 0.12 * Math.sin(a * 3 + ph);
        pts.push([Math.cos(a) * w * 0.5 * rr, Math.sin(a) * h * 0.5 * rr]);
      }
      const col = mixC(0xb4ab98, 0x8f8878, kit.rand() * 0.6).multiplyScalar(GAIN * 0.85);
      kit.rock.at(fr.x, 0, fr.z, fr.yaw, (m) => {
        m.at(sc, yc, 0.12, 0, (mm) => mm.extrude(pts, 0.03, col, { uv: [1.4, 1.4] }));
      }, -0.03, 0);
    }
  }
  // ---------------- drowned: the lake stood higher once ----------------
  // A dark water stain climbing the stone from the ice to a ragged tide line, an older fainter line
  // above it, rime on the windward faces, and frozen drips under the lintels and round the crown.
  // Thin plates on the wall faces like the plaster above; nothing here is walked on.
  const faceAt = (y) => HO - 0.03 * 1.2 - 0.03 * y; // outer face (the walls batter inward)
  const band = (wallN, s0, s1, yBot, yTop, amp, col, depth) => {
    const fr = wallFrame(wallN, HO - 0.03 * 1.2, HO - 0.03 * 1.2);
    const n = Math.max(4, Math.round((s1 - s0) / 0.22));
    const pts = [[s0, yBot], [s1, yBot]];
    const ph = kit.rand() * 9;
    for (let i = n; i >= 0; i--) {
      const s = s0 + ((s1 - s0) * i) / n;
      pts.push([s, yTop + (kit.n2(s * 1.4 + ph, yTop * 0.7) - 0.5) * amp + kit.rs() * amp * 0.2]);
    }
    kit.rock.at(fr.x, 0, fr.z, fr.yaw, (m) => { m.at(0, 0, depth, 0, (mm) => mm.extrude(pts, 0.006, col, { uv: [1.4, 1.4] })); }, -0.03, 0);
  };
  const stain = (k) => mixC(0x2b3127, 0x4a4838, k).multiplyScalar(GAIN * 0.72);
  for (const wallN of ['front', 'right', 'back', 'left']) {
    const spans = wallN === 'front' ? [[-HO + 0.06, -1.05], [1.05, HO - 0.06]] : [[-HO + 0.06, HO - 0.06]];
    for (const [s0, s1] of spans) {
      band(wallN, s0, s1, -0.25, 1.05 + kit.rs() * 0.08, 0.26, stain(kit.rand() * 0.4), 0.152);
      // The old line: a thin darker crust where the water stood for a long time.
      band(wallN, s0, s1, 2.32 + kit.rs() * 0.05, 2.46, 0.06, stain(0.15), 0.153);
    }
  }
  // Rime: pale crust blown onto the north and west faces.
  for (const wallN of ['back', 'left']) {
    for (let i = 0; i < 7; i++) {
      const w = kit.r(0.5, 1.3), h = kit.r(0.3, 0.8);
      const sc = kit.rs() * (HO - w / 2 - 0.3), yc = kit.r(1.4, TOP - 0.5);
      if (holes.some((ho) => ho.wall === wallN && sc + w / 2 > ho.s0 - 0.1 && sc - w / 2 < ho.s1 + 0.1 && yc + h / 2 > ho.y0 - 0.1 && yc - h / 2 < ho.y1 + 0.1)) continue;
      const fr = wallFrame(wallN, HO - 0.03 * 1.2, HO - 0.03 * 1.2);
      const pts = [];
      const nv = 10, ph = kit.rand() * 6;
      for (let k = 0; k < nv; k++) {
        const a = (k / nv) * Math.PI * 2;
        const rr = 0.6 + 0.4 * kit.n2(Math.cos(a) * 2.2 + ph, Math.sin(a) * 2.2);
        pts.push([Math.cos(a) * w * 0.5 * rr, Math.sin(a) * h * 0.5 * rr]);
      }
      kit.rock.at(fr.x, 0, fr.z, fr.yaw, (m) => {
        m.at(sc, yc, 0.154, 0, (mm) => mm.extrude(pts, 0.008, mixC(0xdfe8ee, 0xc8d6e0, kit.rand()).multiplyScalar(GAIN * 0.95), { uv: [1.4, 1.4] }));
      }, -0.03, 0);
    }
  }
  // Frozen drips: under the broken window's lintel, the high windows' lintels and round the crown.
  {
    const drips = [];
    const along = (wallN, s, y, out = 0.05) => {
      const f = faceAt(y) + out;
      if (wallN === 'front') drips.push({ x: s, y, z: f });
      else if (wallN === 'back') drips.push({ x: -s, y, z: -f });
      else if (wallN === 'right') drips.push({ x: f, y, z: -s });
      else drips.push({ x: -f, y, z: s });
    };
    for (let i = 0; i < 9; i++) along('front', -0.85 + (1.7 * i) / 8 + kit.rs() * 0.05, 1.86);
    for (const wallN of ['right', 'left', 'back']) for (let i = 0; i < 4; i++) along(wallN, -0.36 + (0.72 * i) / 3, 4.31);
    for (const wallN of ['front', 'right', 'back', 'left']) {
      for (let i = 0; i < 14; i++) if (kit.rand() < 0.75) along(wallN, -HO + 0.3 + ((2 * HO - 0.6) * i) / 13 + kit.rs() * 0.08, TOP - 0.04, 0.08);
    }
    icicles(kit, drips, { max: 0.6 });
  }

  const wc = (k = 1) => scaleC(PAL.logDark, GAIN * 1.3 * k);
  // Dressed stones jutting around the broken window.
  for (let i = 0; i < 5; i++) {
    const sx = kit.rs() * 1.1;
    const sc = mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN);
    kit.rock.box(sx, 1.85 + kit.rs() * 0.08, HO - 0.5, kit.r(0.3, 0.5), kit.r(0.2, 0.3), kit.r(0.4, 0.8), sc, { ry: kit.rs() * 0.3, rz: kit.rs() * 0.2, uv: [3, 3] });
  }
  // Window frame remnants.
  kit.wood.box(0, 0.35, HO - 0.2, 1.4, 0.1, 0.3, wc(), { grain: 'x', rz: 0.04 });
  kit.wood.tube([-0.5, 0.35, HO - 0.25], [-0.46, 1.4, HO - 0.25], 0.045, 0.04, wc(), { seg: 5, lenSeg: 1, ao: 0.2 });
  kit.wood.tube([0.35, 0.35, HO - 0.25], [0.3, 0.95, HO - 0.25], 0.045, 0.035, wc(), { seg: 5, lenSeg: 1, ao: 0.2 });
  // Timber lintels over the high windows.
  for (const ry of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    kit.wood.at(0, 0, 0, ry, () => { kit.wood.box(0, 4.4, HO - 0.5, 1.2, 0.22, 0.9, wc(), { grain: 'x' }); });
  }

  // ---------------- ice: floor inside, collar and plates outside ----------------
  const ice = kit.ice;
  const iceTone = (k) => mixC(PAL.ice, 0xffffff, k);
  ice.box(0, ICEY / 2 - 0.1, 0, HI * 2 - 0.1, ICEY + 0.2, HI * 2 - 0.1, iceTone(0.45), { uv: [2, 2] });
  for (let i = 0; i < 9; i++) {
    ice.box(kit.rs() * 1.6, ICEY + 0.004, kit.rs() * 1.6, kit.r(0.5, 1.4), 0.004, 0.03, scaleC(PAL.iceDeep, 0.9), { ry: kit.rand() * 3, uv: [1, 1] });
  }
  {
    const ringN = 96;
    const rows = [], bases = [];
    const rings = [0, 0.35, 0.8, 1.4, 2.2, 3.2, 4.3];
    for (let k = 0; k < rings.length; k++) {
      const row = [], br = [];
      for (let i = 0; i <= ringN; i++) {
        const ph = ((i % ringN) / ringN) * Math.PI * 2;
        const dx = Math.cos(ph), dz = Math.sin(ph);
        const tt = 1 / Math.max(Math.abs(dx), Math.abs(dz));
        let ox = dx * tt * (HO - 0.0), oz = dz * tt * (HO - 0.0);
        const nx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0, nzz = Math.abs(dz) >= Math.abs(dx) ? Math.sign(dz) : 0;
        const d = rings[k] * (0.85 + 0.35 * kit.n2(i * 0.3, k * 1.7));
        const diag = Math.abs(dx) > 0.5 && Math.abs(dz) > 0.5;
        ox += (diag ? nx * 0.7071 : nx) * d; oz += (diag ? nzz * 0.7071 : nzz) * d;
        const t = rings[k] / rings[rings.length - 1];
        const lump = 0.7 + 0.6 * kit.n2(ox * 0.5 + 9, oz * 0.5);
        row.push([ox, 0.9 * Math.pow(1 - t, 1.7) * lump + 0.03, oz]);
        br.push([ox, 0.02, oz]);
      }
      rows.push(row); bases.push(br);
    }
    ice.grid(rows, C(PAL.ice), {
      flip: true, uv: [2, 2],
      colorFn: (i, j, p) => mixC(PAL.ice, 0xffffff, 0.2 + 0.55 * kit.n2(p.x * 0.9, p.z * 0.9)).multiplyScalar(0.9 + 0.1 * kit.n2(p.x * 3, p.z * 3)),
      baseFn: (i, j) => bases[i][j],
    });
  }
  // Heaved plates: faceted shards leaning against the tower.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + kit.rs() * 0.2;
    const r = kit.r(3.5, 5.0);
    const h = kit.r(0.35, 1.2), w = kit.r(0.3, 0.75);
    ice.at(Math.cos(a) * r, 0.0, Math.sin(a) * r, -a + Math.PI / 2, (m) => {
      m.extrude([[-w / 2, 0], [w / 2, 0], [w * 0.15, h], [-w * 0.3, h * 0.82]], kit.r(0.1, 0.2), mixC(PAL.ice, PAL.iceDeep, 0.25 + kit.rand() * 0.55).multiplyScalar(0.95), { uv: [1, 1] });
    }, -kit.r(0.15, 0.5), kit.rs() * 0.25);
  }
  // A ramp of snow-ice up to the entrance, so you can walk in.
  {
    const rows = [], bases = [];
    for (let i = 0; i <= 5; i++) {
      const row = [], br = [];
      const t = i / 5;
      for (let j = 0; j <= 8; j++) {
        const u = (j / 8 - 0.5) * 2.6 * (1 + t * 0.4);
        const z = HO - 0.1 + t * 3.0;
        row.push([u, ICEY * (1 - t) ** 1.2 + 0.03 + (kit.n2(u * 2, z * 2) - 0.5) * 0.04 * (1 - t), z]);
        br.push([u, 0.02, z]);
      }
      rows.push(row); bases.push(br);
    }
    ice.grid(rows, C(PAL.ice), { uv: [2, 2], colorFn: () => mixC(PAL.ice, 0xffffff, 0.5), baseFn: (i, j) => bases[i][j], flip: true });
  }
  // Snow caps the shaft's crown.
  for (const [sx, sz, rx, rz] of [[0, HO - 0.5, 2.6, 0.45], [0, -(HO - 0.5), 2.6, 0.45], [HO - 0.5, 0, 0.45, 2.6], [-(HO - 0.5), 0, 0.45, 2.6]]) snowPillow(kit, sx, TOP + 0.02, sz, rx, 0.25, rz, { nu: 4, nv: 10 });

  // ---------------- stairs inside the shaft ----------------
  kit.indoor(true);
  const NS = 9;
  const rise = (FLOOR - ICEY) / (NS * 3);
  const yL1 = ICEY + NS * rise, yL2 = ICEY + 2 * NS * rise;
  const run = 0.28, fw = 1.0, cx = HI - fw / 2;
  stairs(kit, -cx, ICEY, 1.7, Math.PI, { width: fw, steps: NS, rise, run, rails: true }); // west wall, climbing north
  stairs(kit, -HI + fw, yL1, -cx, Math.PI / 2, { width: fw, steps: NS, rise, run, rails: true }); // north wall, climbing east
  stairs(kit, cx, yL2, -HI + fw, 0, { width: fw, steps: NS, rise, run, rails: true }); // east wall, climbing south
  const landing = (x0, z0, x1, z1, y, tag) => {
    kit.wood.box((x0 + x1) / 2, y - 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, scaleC(PAL.plank, GAIN), { grain: 'x', top: scaleC(PAL.plank, GAIN * 1.1) });
    kit.walk.floors.push({ y, polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], tag });
  };
  landing(-HI, -HI, -HI + fw, 1.7 - NS * run, yL1, 'landing1');
  landing(HI - fw, -HI, HI, -HI + fw, yL2, 'landing2');
  for (const [px, pz, py] of [[-HI + fw - 0.1, -HI + 0.1, yL1], [-HI + 0.1, 1.7 - NS * run + 0.1, yL1], [HI - fw + 0.1, -HI + 0.1, yL2], [HI - 0.1, -HI + fw - 0.1, yL2]]) {
    kit.wood.tube([px, ICEY - 0.1, pz], [px, py - 0.1, pz], 0.1, 0.1, wc(1.1), { seg: 6, lenSeg: 2, ao: 0.2 });
  }
  kit.indoor(false);

  // ---------------- belfry floor ----------------
  for (const z of [-2.9, -1.5, 0, 1.5, 2.9]) kit.wood.tube([-3.35, FLOOR - 0.19, z], [3.35, FLOOR - 0.19, z], 0.15, 0.15, wc(), { seg: 8, lenSeg: 3, ao: 0.3, uo: kit.rand() });
  for (let i = -3; i <= 3; i++) {
    for (const sg of [-1, 1]) {
      kit.wood.tube([i * 0.85, TOP - 0.85, sg * (HO - 0.15)], [i * 0.85, FLOOR - 0.26, sg * 3.2], 0.1, 0.1, wc(), { seg: 6, lenSeg: 1, ao: 0.2 });
      kit.wood.tube([sg * (HO - 0.15), TOP - 0.85, i * 0.85], [sg * 3.2, FLOOR - 0.26, i * 0.85], 0.1, 0.1, wc(), { seg: 6, lenSeg: 1, ao: 0.2 });
    }
  }
  const Y0A = 3.8;
  const hatch = { x0: 1.1, x1: 2.2, z0: -1.2, z1: 1.6 };
  {
    const bw = 0.27;
    const FW = 6.4;
    const n = Math.round(FW / bw);
    for (let i = 0; i < n; i++) {
      const z0 = -FW / 2 + i * bw, z1 = z0 + bw - 0.012;
      const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.5).multiplyScalar(GAIN * kit.r(0.8, 1.1));
      const inHatch = z1 > hatch.z0 && z0 < hatch.z1;
      const o = { grain: 'x', top: scaleC(c, 1.05), uv: [1, 3], bottom: scaleC(c, 0.6) };
      if (!inHatch) kit.wood.box(0, FLOOR - 0.03, (z0 + z1) / 2, FW, 0.06, bw - 0.012, c, o);
      else {
        kit.wood.box((-FW / 2 + hatch.x0) / 2, FLOOR - 0.03, (z0 + z1) / 2, hatch.x0 + FW / 2, 0.06, bw - 0.012, c, o);
        kit.wood.box((hatch.x1 + FW / 2) / 2, FLOOR - 0.03, (z0 + z1) / 2, FW / 2 - hatch.x1, 0.06, bw - 0.012, c, o);
      }
    }
  }
  // Frost lumps creeping over the floor edges.
  for (let i = 0; i < 18; i++) {
    const a = kit.rand() * Math.PI * 2;
    const rr = kit.r(2.0, 3.0);
    icePatch(kit, Math.cos(a) * rr, FLOOR + 0.005, Math.sin(a) * rr, kit.r(0.3, 0.8), kit.r(0.25, 0.6));
  }

  // ---------------- the leaning belfry (everything above the floor) ----------------
  const mk = kit.mark();
  kit.frame(0, FLOOR, 0, 0, () => {
    const post = (x, z, h0, h1, r) => {
      kit.wood.tube([x, h0, z], [x + kit.rs() * 0.02, h1, z], r, r * 0.92, wc(1.05), { seg: 9, lenSeg: 3, ao: 0.3, wobble: 0.025, ph: kit.rand() * 5, uo: kit.rand() });
    };
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
      if (sx === 0 && sz === 0) continue;
      const corner = sx !== 0 && sz !== 0;
      post(sx * BH, sz * BH, -0.1, 3.95, corner ? 0.23 : 0.16);
    }
    const bays = [-BH / 2, BH / 2];
    for (const wall of [0, 1, 2, 3]) {
      kit.wood.at(0, 0, 0, (wall * Math.PI) / 2, () => {
        for (let row = 0; row < 7; row++) {
          const c = mixC(PAL.plank, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.8, 1.1));
          kit.wood.box(0, 0.1 + row * 0.17, BH + 0.05, BH * 2 + 0.2, 0.16, 0.07, c, { grain: 'x', uv: [1, 3] });
        }
        kit.wood.box(0, 1.24, BH + 0.05, BH * 2 + 0.3, 0.1, 0.18, scaleC(PAL.logWeathered, GAIN * 1.1), { grain: 'x', top: scaleC(PAL.logWeathered, GAIN * 1.2) });
        for (const bx of bays) {
          const bw = BH - 0.1, ySpr = 2.3, yTop = 3.65;
          const sh = new THREE.Shape();
          sh.moveTo(-bw / 2, ySpr);
          sh.absarc(0, ySpr, bw / 2, Math.PI, 0, true);
          sh.lineTo(bw / 2, yTop);
          sh.lineTo(-bw / 2, yTop);
          sh.closePath();
          kit.wood.at(bx, 0, BH - 0.02, 0, (m) => { m.extrude(sh, 0.14, mixC(PAL.plank, PAL.plankDark, 0.35).multiplyScalar(GAIN), { uv: [1, 3], curve: 10 }); });
        }
      });
    }
    // Plate ring beam under the roof.
    for (const sg of [-1, 1]) {
      kit.wood.tube([-3.3, 3.9, sg * BH], [3.3, 3.9, sg * BH], 0.2, 0.2, wc(), { seg: 8, lenSeg: 4, ao: 0.3, bow: [0, -0.02, 0] });
      kit.wood.tube([sg * BH, 3.9, -3.3], [sg * BH, 3.9, 3.3], 0.2, 0.2, wc(), { seg: 8, lenSeg: 4, ao: 0.3, bow: [0, -0.02, 0] });
    }
    // Bell yoke and the bell.
    kit.wood.tube([-BH, 3.7, 0], [BH, 3.7, 0], 0.2, 0.2, wc(), { seg: 8, lenSeg: 4, ao: 0.3 });
    const bronze = mixC(0x6a4e2c, 0x3f6a54, 0.45).multiplyScalar(GAIN * 0.8);
    kit.metal.lathe([[0.82, 2.1], [0.78, 2.35], [0.66, 2.6], [0.54, 2.95], [0.43, 3.25], [0.28, 3.43], [0.18, 3.53], [0.001, 3.55]], bronze, { seg: 16, closeBottom: false, uv: [1, 1], wobble: 0.01 });
    kit.metal.lathe([[0.82, 2.1], [0.85, 2.14], [0.84, 2.22], [0.78, 2.25]], scaleC(bronze, 0.7), { seg: 16, uv: [1, 1] });
    kit.metal.tube([0, 2.5, 0], [0, 2.1, 0], 0.06, 0.14, scaleC(PAL.iron, GAIN * 0.7), { seg: 8, lenSeg: 1, ao: 0, capA: false });
    kit.metal.box(0, 3.63, 0, 0.5, 0.12, 0.34, scaleC(PAL.iron, GAIN * 0.7), {});
    // Tent roof: four concave shingled faces, flared eaves.
    const Wb = 3.85, Y0 = 3.8, H = 6.6;
    const surface = (x, z) => {
      const d = Math.max(Math.abs(x), Math.abs(z)) / Wb;
      const u = Math.max(0, 1 - d);
      return Y0 + H * Math.pow(u, 1.45) + 0.45 * Math.pow(u, 6);
    };
    const apex = V3(0, Y0 + H + 0.45, 0);
    const faces = [
      [V3(-Wb, surface(-Wb, 0), -Wb), V3(-Wb, surface(-Wb, 0), Wb)],
      [V3(-Wb, surface(0, Wb), Wb), V3(Wb, surface(0, Wb), Wb)],
      [V3(Wb, surface(Wb, 0), Wb), V3(Wb, surface(Wb, 0), -Wb)],
      [V3(Wb, surface(0, -Wb), -Wb), V3(-Wb, surface(0, -Wb), -Wb)],
    ];
    for (const [E0, E1] of faces) {
      const sl = slab(kit, E0, E1, apex, apex, { th: 0.12, nu: 10, pitch: 1.15, step: 0.24, jag: 0.14, noff: kit.rand() * 30, wave: 0.02, surface });
      const P = sl.P, T = [];
      for (let i = 0; i < P.length; i++) {
        const row = [];
        for (let j = 0; j < P[i].length; j++) {
          const p = P[i][j];
          const tt = i / (P.length - 1);
          const lump = 0.7 + 0.6 * kit.n2(p.x * 0.5 + 3, p.z * 0.5 + p.y * 0.2);
          const edge = 0.5 + 0.5 * smooth(0, 0.3, Math.min(j, P[i].length - 1 - j) * 0.24);
          const slide = smooth(0.7, 0.84, kit.n2(p.x * 0.4 + 40, p.z * 0.4 + p.y * 0.3)) * (1 - tt);
          row.push(Math.max(0.035, 0.3 * (0.6 + 0.5 * tt) * lump * edge * (1 - 0.9 * slide)));
        }
        T.push(row);
      }
      snowLayer(kit, { P, T, lip: [1, 0, 1, 1], lipOut: 0.2, under: 0.2 });
      const pts = [];
      for (let j = 1; j < P[0].length - 1; j++) if (kit.chance(0.45)) pts.push({ x: P[0][j].x + Math.sign(P[0][j].x) * 0.08, y: P[0][j].y - 0.22, z: P[0][j].z + Math.sign(P[0][j].z) * 0.08 });
      icicles(kit, pts, { max: 0.9 });
    }
    // Onion cupola, neck and cross at the apex.
    const AY = apex.y - 0.25;
    const cup = mixC(0x2c403c, 0x4c5648, 0.4).multiplyScalar(GAIN * 0.7);
    kit.metal.lathe([[0.26, AY], [0.3, AY + 0.14], [0.5, AY + 0.45], [0.66, AY + 0.85], [0.64, AY + 1.2], [0.47, AY + 1.58], [0.23, AY + 1.92], [0.07, AY + 2.2], [0.001, AY + 2.32]], cup, { seg: 14, uv: [1, 1] });
    const iron = scaleC(PAL.iron, GAIN * 0.7);
    kit.metal.tube([0, AY + 2.2, 0], [0, AY + 3.7, 0], 0.05, 0.04, iron, { seg: 5, lenSeg: 1, ao: 0, endCol: iron });
    kit.metal.box(0, AY + 3.4, 0, 0.9, 0.07, 0.07, iron, {});
    kit.metal.box(0, AY + 3.65, 0, 0.55, 0.055, 0.055, iron, {});
    kit.metal.box(0, AY + 3.15, 0, 0.6, 0.055, 0.055, iron, { rz: 0.35 });
    // Icicles from the arches (the frost room).
    const arch = [];
    for (const wall of [0, 1, 2, 3]) {
      for (const bx of bays) {
        for (let k = 0; k <= 10; k++) {
          const a = Math.PI * (k / 10);
          const lx = bx - Math.cos(a) * (BH / 2 - 0.05), ly = 2.55 + Math.sin(a) * (BH / 2 - 0.05);
          if (!kit.chance(0.5)) continue;
          const ca = Math.cos((wall * Math.PI) / 2), sa = Math.sin((wall * Math.PI) / 2);
          arch.push({ x: lx * ca + (BH - 0.05) * sa, y: ly, z: -lx * sa + (BH - 0.05) * ca });
        }
      }
    }
    icicles(kit, arch, { max: 1.0 });
    for (const wall of [0, 1, 2, 3]) {
      kit.ice.at(0, 0, 0, (wall * Math.PI) / 2, () => {
        for (let i = 0; i < 12; i++) kit.ice.box(-2.7 + i * 0.47 + kit.rs() * 0.1, 1.34, BH + 0.05, kit.r(0.2, 0.55), kit.r(0.04, 0.12), kit.r(0.12, 0.24), mixC(PAL.ice, 0xffffff, 0.5), { ry: kit.rs() * 0.1 });
      });
    }
  });
  // Bend the whole belfry and roof a few degrees; the base stays on the floor.
  kit.shear(mk, FLOOR, 0.055, 0.02, 0.01);

  // ---------------- the frost room: table, benches, frozen bread ----------------
  const ty = FLOOR;
  table(kit, 0, ty, 0, 0, 4.8, 1.0, 0.8);
  kit.ice.box(0, ty + 0.805, 0, 4.7, 0.015, 0.95, mixC(PAL.ice, 0xffffff, 0.6), { uv: [1, 1] });
  for (const sz of [-1, 1]) bench(kit, 0, ty, sz * 0.98, 0, 5.0);
  kit.wood.box(-2.62, ty + 0.25, 0, 0.42, 0.5, 0.5, scaleC(PAL.plank, GAIN), { grain: 'y' });
  for (let i = 0; i < 9; i++) {
    const x = -2.0 + i * 0.5 + kit.rs() * 0.1, z = kit.rs() * 0.28;
    ice.ellipsoid(x, ty + 0.83, z, kit.r(0.1, 0.16), kit.r(0.05, 0.08), kit.r(0.07, 0.1), mixC(0xd8c090, 0xeef4f8, 0.35), { seg: 8, rings: 4 });
  }
  for (const x of [-1.3, 0.2, 1.5]) ice.lathe([[0.001 + x * 0, ty + 0.805], [0.12, ty + 0.81], [0.17, ty + 0.9], [0.15, ty + 0.92]], mixC(PAL.ice, 0xffffff, 0.4), { seg: 9 });
  // 17 seats: 8 along each bench and one at the head.
  const seats = [];
  for (let i = 0; i < 8; i++) {
    const x = -2.17 + i * 0.62;
    seats.push({ x, y: ty + 0.45, z: -0.98, yaw: 0, side: 'north' });
    seats.push({ x, y: ty + 0.45, z: 0.98, yaw: Math.PI, side: 'south' });
  }
  seats.push({ x: -2.65, y: ty + 0.5, z: 0, yaw: Math.PI / 2, side: 'head' });
  kit.objects.seats = seats;
  seats.forEach((s, i) => kit.anchor(`seat${i + 1}`, s.x, s.y, s.z));
  kit.anchor('table', 0, ty + 0.8, 0);
  kit.anchor('musicbox', 2.05, ty + 0.83, 0);
  kit.anchor('ribbon', -2.4, ty + 0.83, 0.3);
  kit.anchor('hatch', (hatch.x0 + hatch.x1) / 2, ty, (hatch.z0 + hatch.z1) / 2);
  kit.anchor('bell', 0.12, FLOOR + 2.8, 0);
  kit.anchor('vista', 0, ty, 2.5);
  kit.anchor('top', 0.85, FLOOR + Y0A + 6.6 + 0.45 + 3.7, 0.3);
  kit.light(0, ty + 1.8, 0, { color: 0x9ff5ff, intensity: 1.4, radius: 11, kind: 'ghost' });
  kit.light(0, ICEY + 1.6, 0, { color: 0x9ff5ff, intensity: 0.5, radius: 6, kind: 'ghost' });
  kit.door({ x: 0, z: HO + 0.1, y: ICEY, yaw: 0, w: 1.9, h: 1.7, kind: 'open', id: 'window' });
  kit.anchor('door', 0, ICEY, HO + 1.8);
  kit.anchor('inside', 0, ICEY, 0.9);

  // ---------------- colliders and walk surfaces ----------------
  const wt = HO - HI;
  const wall = (x, z, hw, hd) => kit.box(x, z, hw, hd, 0, { y0: -2, y1: TOP + 0.2 });
  wall(0, -(HO - wt / 2), HO, wt / 2);
  wall(-(HO - wt / 2), 0, wt / 2, HO);
  wall(HO - wt / 2, 0, wt / 2, HO);
  wall(-(HO + 0.95) / 2, HO - wt / 2, (HO - 0.95) / 2, wt / 2);
  wall((HO + 0.95) / 2, HO - wt / 2, (HO - 0.95) / 2, wt / 2);
  for (const [x, z, hx, hz] of [[0, BH + 0.05, BH + 0.1, 0.15], [0, -BH - 0.05, BH + 0.1, 0.15], [BH + 0.05, 0, 0.15, BH + 0.1], [-BH - 0.05, 0, 0.15, BH + 0.1]]) kit.box(x, z, hx, hz, 0, { y0: FLOOR - 0.1, y1: FLOOR + 1.4 });
  kit.box(0, 0, 2.45, 0.55, 0, { y0: FLOOR - 0.1, y1: FLOOR + 0.9 });
  const sq = (h, y, tag) => ({ y, polygon: [[-h, -h], [h, -h], [h, h], [-h, h]], tag });
  kit.walk.floors.push(sq(HI - 0.1, ICEY, 'ice'));
  const bf = sq(BH - 0.2, FLOOR, 'belfry');
  bf.holes = [[[hatch.x0, hatch.z0], [hatch.x1, hatch.z0], [hatch.x1, hatch.z1], [hatch.x0, hatch.z1]]];
  kit.walk.floors.push(bf);
  kit.walk.ramps.push({ a: [0, 0, HO + 3.0], b: [0, ICEY, HO - 0.2], width: 2.2, tag: 'ice ramp' });
  void yL1; void yL2;
  kit.interior = true;
  return kit.finish({});
}
