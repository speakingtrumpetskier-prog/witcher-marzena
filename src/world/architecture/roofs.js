// Roofs and the soft snow that sits on them.
//
//   snowLayer(kit, {P, T, ...})   generic snow blanket over a grid of surface points, with rounded
//                                 overhanging lips on chosen edges. Own mesh (kit.snow), melts via snowBase.
//   slab(kit, {E0,E1,R0,R1,...})  one planar shingle slab with thickness, jagged eave, wavy surface
//   gableRoof(kit, {...})         two slabs + ridge log + snow + icicles + rafter tails + bargeboards + horse heads
//   shedRoof(kit, {...})          mono-pitch roof for porches, lean-tos and sheds
//   icicles(kit, ...)             hanging ice along an eave line
import * as THREE from 'three';
import { C, mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';
import { boardShape, horseHeadShape, sunShape } from './carve.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ----- generic snow blanket -----
// P[i][j]: roof top surface points. T[i][j]: snow thickness. lip: [i0, i1, j0, j1] edges that
// curl over into a rounded overhang. Returns nothing; writes into kit.snow.
export function snowLayer(kit, o) {
  const { P, T } = o;
  const K = o.K ?? 4;
  const lip = o.lip ?? [1, 1, 1, 1];
  const under = o.under ?? 0.1;
  const lipMax = o.lipOut ?? 0.18;
  const ni = P.length, nj = P[0].length;
  // Surface normals (pointing up).
  const N = P.map((row, i) => row.map((p, j) => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(ni - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nj - 1, j + 1);
    const di = V3().subVectors(P[i1][j], P[i0][j]);
    const dj = V3().subVectors(P[i][j1], P[i][j0]);
    const n = V3().crossVectors(dj, di).normalize();
    if (n.y < 0) n.negate();
    return n;
  }));
  const pi0 = lip[0] ? K : 0, pi1 = lip[1] ? K : 0, pj0 = lip[2] ? K : 0, pj1 = lip[3] ? K : 0;
  const rows = [], bases = [], shadeRow = [];
  for (let a = -pi0; a < ni + pi1; a++) {
    const row = [], brow = [], srow = [];
    for (let b = -pj0; b < nj + pj1; b++) {
      const ci = clamp(a, 0, ni - 1), cj = clamp(b, 0, nj - 1);
      const da = a < 0 ? -a : a > ni - 1 ? a - (ni - 1) : 0;
      const db = b < 0 ? -b : b > nj - 1 ? b - (nj - 1) : 0;
      const Pc = P[ci][cj], Nc = N[ci][cj], Tc = T[ci][cj];
      const pos = Pc.clone();
      let under_ = 1;
      if (da === 0 && db === 0) {
        pos.addScaledVector(Nc, Tc);
      } else {
        const oi = a < 0 ? V3().subVectors(P[0][cj], P[Math.min(1, ni - 1)][cj]) : a > ni - 1 ? V3().subVectors(P[ni - 1][cj], P[Math.max(0, ni - 2)][cj]) : V3();
        const oj = b < 0 ? V3().subVectors(P[ci][0], P[ci][Math.min(1, nj - 1)]) : b > nj - 1 ? V3().subVectors(P[ci][nj - 1], P[ci][Math.max(0, nj - 2)]) : V3();
        if (oi.lengthSq() > 0) oi.normalize();
        if (oj.lengthSq() > 0) oj.normalize();
        const out = V3().addScaledVector(oi, da).addScaledVector(oj, db).normalize();
        const rho = Math.min(1, Math.hypot(da, db) / K);
        const phi = rho * Math.PI;
        const lo = lipMax * (0.35 + 0.65 * Math.min(1, Tc / 0.3)) * (Tc < 0.03 ? Tc / 0.03 : 1);
        const h = phi < Math.PI / 2 ? Tc * Math.cos(phi) : under * Math.cos(phi);
        pos.addScaledVector(Nc, h).addScaledVector(out, lo * Math.sin(phi));
        pos.y -= lo * 0.45 * Math.sin(phi);
        if (phi > Math.PI / 2) under_ = 0.78;
      }
      row.push(pos);
      brow.push(Pc);
      srow.push(under_);
    }
    rows.push(row); bases.push(brow); shadeRow.push(srow);
  }
  const white = C(PAL.snow), blue = C(PAL.snowBlue);
  const tmp = new THREE.Color();
  kit.snow.grid(rows, white, {
    uv: [2, 2],
    colorFn: (i, j, p) => {
      const n = kit.n2(p.x * 0.9 + 3, p.z * 0.9 + p.y * 0.3);
      const k = 0.93 + 0.07 * n;
      mixC(blue, white, 0.35 + 0.65 * n, tmp);
      const s = shadeRow[i][j] * k;
      return tmp.setRGB(tmp.r * s, tmp.g * s, tmp.b * s);
    },
    baseFn: (i, j) => [bases[i][j].x, bases[i][j].y, bases[i][j].z],
  });
}

// ----- planar shingle slab -----
// E0,E1 eave line ends, R0,R1 the matching ridge/attach line ends (top surface points).
// o: th (thickness), nu rows, step (column spacing m), jag (0..1 chance of ragged eave), tone (color),
//    wave (surface wobble m), noff (noise offset), edgeCol, undersideCol, eaveEdge (bool), rakeEdges (bool)
export function slab(kit, E0, E1, R0, R1, o = {}) {
  const th = o.th ?? 0.1;
  const nu = o.nu ?? 5;
  const len = E0.distanceTo(E1);
  const nj = Math.max(2, Math.round(len / (o.step ?? 0.22)));
  const noff = o.noff ?? 0;
  const wave = o.wave ?? 0.03;
  const jag = o.jag ?? 0.16;
  const cut = [];
  for (let j = 0; j <= nj; j++) {
    const roll = kit.rand();
    cut.push(roll < jag ? 0.06 + kit.rand() * (kit.chance(0.2) ? 0.3 : 0.12) : kit.rand() * 0.03);
  }
  const slopeLen = V3().subVectors(R0, E0).length();
  const P = [], U = [];
  for (let i = 0; i <= nu; i++) {
    const s = i / nu;
    const rowP = [], rowU = [];
    for (let j = 0; j <= nj; j++) {
      const t = j / nj;
      const e = V3().lerpVectors(E0, E1, t), r = V3().lerpVectors(R0, R1, t);
      const sShift = i === 0 ? cut[j] / slopeLen : 0;
      const ss = s * (1 - sShift) + sShift * (i === 0 ? 1 : 0);
      const p = V3().lerpVectors(e, r, ss);
      if (o.surface) p.y = o.surface(p.x, p.z);
      const w = (kit.n2(p.x * 0.9 + noff, p.z * 0.9 + p.y * 0.4) - 0.5) * wave * 2;
      p.y += w;
      rowP.push(p);
      rowU.push(V3(p.x, p.y - th / Math.cos(o.pitch ?? 0.8), p.z));
    }
    P.push(rowP); U.push(rowU);
  }
  // Orientation test: normal of the first cell should point up.
  const dPi = V3().subVectors(P[1][0], P[0][0]), dPj = V3().subVectors(P[0][1], P[0][0]);
  const up = V3().crossVectors(dPj, dPi).y >= 0;
  const tone = o.tone ?? scaleC(PAL.shingle, GAIN * 0.95);
  kit.shingle.grid(P, tone, {
    flip: !up, uv: [1.2, 1.2],
    colorFn: (i, j, p) => {
      const q = kit.n2(p.x * 0.8 + 20 + noff, p.z * 0.8 + p.y * 0.3);
      const q2 = kit.n2(p.x * 3.1 + 7, p.z * 3.1 + p.y);
      let k = 0.82 + 0.3 * q2;
      const c = C(tone).clone();
      c.multiplyScalar(k);
      if (q > 0.80) c.lerp(C(0xb8946a).clone().multiplyScalar(0.8), 0.55 * smooth(0.8, 0.9, q)); // repaired patch, fresh wood
      else if (q < 0.16) c.lerp(C(PAL.moss).clone().multiplyScalar(0.8), 0.5 * smooth(0.16, 0.05, q));
      if (q2 > 0.9 && kit.n2(p.x * 1.3 + 90, p.z * 1.3) > 0.55) c.multiplyScalar(0.3); // a missing shingle: dark boards showing
      if (i === 0) c.multiplyScalar(0.85);
      return c;
    },
  });
  // Underside boards (coarse: only the interior ever sees them).
  const uCol = o.undersideCol ?? scaleC(PAL.plankDark, GAIN * 1.1);
  const Uc = [U[0], U[U.length - 1]].map((row) => row.filter((_, j) => j % 3 === 0 || j === row.length - 1));
  kit.wood.grid(Uc, uCol, { flip: up, uv: [1, 3], uo: kit.rand(), vo: kit.rand() });
  // Edge strips.
  const edge = o.edgeCol ?? scaleC(PAL.shingleDark, GAIN * 1.6);
  const strip = (a0, a1, b1, b0, out, mb, col) => {
    const n = V3().subVectors(a1, a0).cross(V3().subVectors(b0, a0));
    if (n.dot(out) >= 0) mb.quad(a0, a1, b1, b0, col); else mb.quad(a0, b0, b1, a1, col);
  };
  if (o.eaveEdge !== false) {
    for (let j = 0; j < nj; j++) {
      const out = V3().subVectors(P[0][j], P[1][j]).add(V3(0, -0.2, 0));
      strip(P[0][j], P[0][j + 1], U[0][j + 1], U[0][j], out, kit.shingle, edge);
    }
  }
  if (o.rakeEdges !== false) {
    for (let i = 0; i < nu; i++) {
      strip(P[i][0], P[i + 1][0], U[i + 1][0], U[i][0], V3().subVectors(P[i][0], P[i][1]), kit.wood, edge);
      strip(P[i][nj], P[i + 1][nj], U[i + 1][nj], U[i][nj], V3().subVectors(P[i][nj], P[i][nj - 1]), kit.wood, edge);
    }
  }
  return { P, U, nu, nj, up };
}

// ----- icicles -----
// Hang icicles from points (array of {x,y,z}) outward along a direction. Uses kit.ice (melts with snow).
export function icicles(kit, pts, o = {}) {
  const max = o.max ?? 0.55;
  for (const p of pts) {
    const len = 0.08 + kit.rand() * kit.rand() * max;
    const r = 0.015 + kit.rand() * 0.028;
    const bend = (kit.rand() - 0.5) * 0.05;
    const top = [p.x, p.y, p.z];
    const col = mixC(PAL.ice, 0xffffff, 0.35 + kit.rand() * 0.4);
    // 5-sided cone with a slightly bent tip.
    kit.ice.save();
    const seg = 5;
    const ring = [];
    const tip = [p.x + bend, p.y - len, p.z + (o.dz ?? 0) * 0.0];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ring.push(kit.ice.v(p.x + ca * r, p.y, p.z + sa * r, ca * 0.9, 0.35, sa * 0.9, j / seg, 0, col, top[0], top[1], top[2]));
    }
    const ti = kit.ice.v(tip[0], tip[1], tip[2], 0, -1, 0, 0.5, 1, col, top[0], top[1], top[2]);
    for (let j = 0; j < seg; j++) kit.ice.tri(ring[j], ti, ring[j + 1]);
    kit.ice.restore();
  }
}

// ----- gable roof -----
// o: hw, hd (half width across ridge, half length along ridge, measured at wall plane), yE (wall top),
//    pitch (rad), oe (eave overhang), og (gable overhang), th, sag, snow (m), ornament (bool),
//    paint (bargeboard color), snowFall (0..1 snow cover multiplier), cap (ridge log radius)
export function gableRoof(kit, o) {
  const { hw, hd, yE } = o;
  const pitch = o.pitch ?? 0.84;
  const tan = Math.tan(pitch), cos = Math.cos(pitch), sin = Math.sin(pitch);
  const oe = o.oe ?? 0.75, og = o.og ?? 0.55;
  const th = o.th ?? 0.1;
  const sag = o.sag ?? 0.09;
  const snowAmt = o.snow ?? 0.28;
  const X = hw + oe, Z = hd + og;
  const noff = kit.rand() * 50;
  const topY = (x, z) => {
    const ax = Math.abs(x);
    const base = yE - 0.08 + (hw - ax) * tan + th / cos;
    const zn = z / Z;
    const k = 0.4 + 0.6 * (1 - Math.min(1, ax / X));
    return base - sag * (1 - zn * zn) * k;
  };
  const nu = o.nu ?? 6;
  const slabOpts = { th, nu, pitch, step: 0.22, noff, jag: o.jag ?? 0.16, surface: topY };
  const mkSlab = (sgn) => slab(kit,
    V3(sgn * X, topY(sgn * X, -Z), -Z), V3(sgn * X, topY(sgn * X, Z), Z),
    V3(0, topY(0, -Z), -Z), V3(0, topY(0, Z), Z), slabOpts);
  const ruin = o.ruin || null;
  const Lslab = ruin?.leftGone ? null : mkSlab(-1), Rslab = mkSlab(1);

  // Ridge log following the sag, protruding past both gables.
  const rp = [];
  const nR = 14;
  for (let k = 0; k <= nR; k++) {
    const z = -Z - 0.45 + ((2 * Z + 0.9) * k) / nR;
    const zc = clamp(z, -Z, Z);
    rp.push(V3((kit.n2(z * 0.3, 4) - 0.5) * 0.04, topY(0, zc) + 0.1 - (Math.abs(z) > Z ? 0.02 * (Math.abs(z) - Z) : 0), z));
  }
  const capR = o.cap ?? 0.17;
  kit.wood.sweep(rp, (t) => capR * (0.95 + 0.1 * Math.sin(t * 9)), scaleC(PAL.logWeathered, GAIN * 0.9), { seg: 8, ao: 0.3, uo: kit.rand() });

  // Snow blanket over both slopes, one grid across the ridge.
  if (snowAmt > 0) {
    const P = [], T = [];
    const rowsR = Rslab.P;
    const stackRows = Lslab ? [...Lslab.P, ...rowsR.slice(0, -1).reverse()] : [...rowsR].reverse();
    for (let i = 0; i < stackRows.length; i++) {
      const rowP = [], rowT = [];
      for (let j = 0; j < stackRows[i].length; j++) {
        const src = stackRows[i][j];
        // Snow sits on the smooth nominal roof, not on ragged eave rows.
        const jt = j / (stackRows[i].length - 1);
        const z = -Z + 2 * Z * jt;
        const x = src.x;
        const nominal = V3(x, topY(x, z) + (kit.n2(x * 0.9 + noff, z * 0.9 + topY(x, z) * 0.4) - 0.5) * 0.06, z);
        rowP.push(nominal);
        const ax = Math.abs(x) / X;
        const profile = 0.6 + 0.4 * Math.pow(1 - ax, 0.7);
        const lump = 0.75 + 0.55 * kit.n2(x * 0.55 + 11, z * 0.55);
        const slide = smooth(0.74, 0.86, kit.n2(x * 0.35 + 40, z * 0.3 + 7)) * smooth(0.35, 0.75, ax);
        const ends = 0.45 + 0.55 * smooth(0, 0.5, Z - Math.abs(z));
        rowT.push(Math.max(0.035, snowAmt * profile * lump * (1 - 0.92 * slide) * ends));
      }
      P.push(rowP); T.push(rowT);
    }
    snowLayer(kit, { P, T, lip: [1, 1, 1, 1], lipOut: 0.2, under: th + 0.05 });
    // Icicles under the eave lips.
    const ice = [];
    for (const sgn of [-1, 1]) {
      if (ruin?.leftGone && sgn < 0) continue;
      let z = -Z + 0.2 + kit.rand() * 0.3;
      while (z < Z - 0.15) {
        const jt = (z + Z) / (2 * Z);
        const iRow = sgn < 0 ? 0 : stackRows.length - 1;
        const tIdx = Math.round(jt * (T[iRow].length - 1));
        if (T[iRow][tIdx] > 0.12 && kit.chance(0.78)) {
          ice.push({ x: sgn * (X + 0.1), y: topY(sgn * X, z) - th / cos - 0.07, z });
        }
        z += 0.14 + kit.rand() * kit.rand() * 0.55;
      }
    }
    icicles(kit, ice, { max: o.iceMax ?? 0.6 });
  }

  // Rafter tails under the eaves.
  const tailCol = scaleC(PAL.logDark, GAIN * 1.3);
  for (const sgn of [-1, 1]) {
    if (ruin?.leftGone && sgn < 0) continue;
    for (let z = -Z + 0.5; z < Z - 0.3; z += 0.85 + kit.rand() * 0.1) {
      const ex = sgn * X;
      kit.wood.at(ex - sgn * 0.1, topY(ex, z) - th / cos - 0.07, z, 0, (m) => {
        m.box(sgn * 0.0, 0, 0, 0.7, 0.12, 0.11, tailCol, { grain: 'x', uv: [1, 3] });
      }, 0, sgn * -pitch);
    }
  }

  // Bargeboards, crossed horse heads and a sun roundel on each gable.
  if (o.ornament !== false) {
    const paint = o.paint ?? kit.pick([PAL.red, PAL.blueFaded, PAL.ochre]);
    const gz = o.gz ?? hd + 0.07;
    const heads = o.heads ?? kit.chance(0.8);
    kit.wood.at(0, 0, 0, 0, () => gableOrnament(kit, { X, Z, gz, topY, th, cos, sin, pitch, paint, sun: o.sun, heads }));
    kit.wood.at(0, 0, 0, Math.PI, () => gableOrnament(kit, { X, Z, gz, topY, th, cos, sin, pitch, paint, sun: o.sun, heads }));
  }
  return { topY, X, Z, pitch, ridgeY: topY(0, 0), cos, sin, tan, th };
}

// Crossed bargeboards at the peak ending in horse heads, a pierced roundel under the peak.
// Built for the +z gable; callers rotate it by pi for the -z gable.
function gableOrnament(kit, { X, Z, gz, topY, th, cos, sin, pitch, paint, sun, heads = true }) {
  const paintCol = paint ?? kit.pick([PAL.red, PAL.blueFaded, PAL.ochre]);
  const boardCol = scaleC(PAL.plank, GAIN * 0.95);
  const depth = 0.05;
  const z0 = Z + 0.012;
  const L = X / cos + 0.05; // along-slope length to the apex
  const ext = 0.7; // beyond the apex
  const kind = kit.pick(['saw', 'scallop', 'leaf']);
  const lowY = topY(X, Z) - th / cos - 0.17;
  for (const sgn of [-1, 1]) {
    const yaw = sgn < 0 ? 0 : Math.PI;
    // Left board occupies [z0, z0+depth]; the right one is yawed, so it extrudes toward -z from oz
    // and sits just in front of the left one.
    const oz = sgn < 0 ? z0 : z0 + 2 * depth + 0.002;
    kit.wood.at(sgn * X, lowY, oz, yaw, (m) => {
      m.extrude(boardShape(L + ext, 0.3, kind), depth, boardCol, { uv: [1, 3] });
      // Painted stripe along the outer face.
      m.box((L + ext) * 0.5, 0.268, sgn < 0 ? depth + 0.002 : -0.002, L + ext, 0.028, 0.004, scaleC(paintCol, GAIN * 0.9), { grain: 'x', uv: [1, 3] });
    }, 0, pitch);
    // Horse head at the tip, overlapping the board end.
    if (!heads) continue;
    const dx = -sgn * cos, dy = sin;
    const tipX = sgn * X + dx * (L + ext - 0.18), tipY = lowY + dy * (L + ext - 0.18) + 0.02;
    kit.wood.at(tipX, tipY, oz, yaw, (m) => {
      m.extrude(horseHeadShape(0.9), depth, scaleC(PAL.plank, GAIN * 0.8), { uv: [1, 3] });
    }, 0, 0.12);
  }
  // Sun roundel on the gable wall under the peak.
  if (sun !== false) {
    kit.wood.at(0, topY(0, 0) - th / cos - 1.05, gz, 0, (m) => {
      m.extrude(sunShape(0.25, 10), 0.04, scaleC(paintCol, GAIN * 0.9), { uv: [1, 3] });
    });
  }
}

// ----- shed (mono-pitch) roof -----
// Attach line along the high side, eave on the low side. Points are top surface points.
// o: th, snow (m), lip flags, step
export function shedRoof(kit, high0, high1, low0, low1, o = {}) {
  const sl = slab(kit, low0, low1, high0, high1, {
    th: o.th ?? 0.08, nu: o.nu ?? 4, pitch: o.pitch ?? 0.5, step: 0.22, jag: o.jag ?? 0.14, noff: kit.rand() * 40, wave: 0.02,
    rakeEdges: true, ...(o.slab || {}),
  });
  const snowAmt = o.snow ?? 0.22;
  if (snowAmt > 0) {
    const P = sl.P, T = [];
    for (let i = 0; i < P.length; i++) {
      const row = [];
      for (let j = 0; j < P[i].length; j++) {
        const p = P[i][j];
        const prof = 0.7 + 0.3 * (i / (P.length - 1));
        const lump = 0.75 + 0.55 * kit.n2(p.x * 0.6 + 5, p.z * 0.6);
        const edgeJ = 0.5 + 0.5 * smooth(0, 0.4, Math.min(j, P[i].length - 1 - j) * 0.22);
        row.push(Math.max(0.035, snowAmt * prof * lump * edgeJ));
      }
      T.push(row);
    }
    snowLayer(kit, { P, T, lip: o.lip ?? [1, 0, 1, 1], lipOut: 0.16, under: (o.th ?? 0.08) + 0.04 });
    if (o.icicles !== false) {
      const ice = [];
      const row0 = P[0];
      for (let j = 1; j < row0.length - 1; j++) {
        if (kit.chance(0.4)) ice.push({ x: row0[j].x + (low0.x - high0.x) * 0.01, y: row0[j].y - (o.th ?? 0.08) - 0.06, z: row0[j].z });
      }
      icicles(kit, ice, { max: 0.35 });
    }
  }
  return sl;
}

export { gableOrnament };
