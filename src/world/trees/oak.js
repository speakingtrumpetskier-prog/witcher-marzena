// Hollow oak: an ancient oak split by lightning. The trunk is a ring of fused wooden pillars that
// rise to different heights (the tall half still carries a great bare crown, the other half is
// snapped into splintered stumps). One gap in the ring is a doorway you can walk through: a swept
// lintel arch over it, a charred hollow inside with snow blown across the floor, and a red ribbon
// tied at the mouth. Owner: vegetation builder.
// Rare, odd (see rare.js). lod 0 about 12k triangles, lod 1 about 2k, lod 2 about 500.
//
// Local frame: the doorway faces +Z (yaw turns it). Colliders are the pillars, so the door stays open.
import { GeoBuilder, rng, rgb, mixRGB } from './geo.js';
import { sweep, grow, ribbon, berry, snowMound, finish, furrow, sstep, dot3, norm3 } from './oddgeo.js';

export const OAK_VARIANTS = [
  { id: 'oak_a', seed: 7101, H: 12.5, n: 8, rho: 1.65, pr: 0.82, crown: 1.0, tall: [1, 2, 3] },
];

const PAL = {
  dark: rgb('#2a1f17'),
  mid: rgb('#54463a'),
  light: rgb('#8f8070'),
  char: rgb('#0e0a08'),
  raw: rgb('#b7a483'),
  limb: rgb('#5a4c40'),
  red: rgb('#a3211b'),
  floor: rgb('#1f1812'),
  cream: rgb('#d8cdb4'),
};

export function buildOak(v, lod = 0) {
  const r = rng(v.seed);
  const b = new GeoBuilder();
  const n = v.n, D = (Math.PI * 2) / n;
  const rho = v.rho;
  const H = v.H;
  const sides = [16, 8, 5][lod];
  const stepY = [0.6, 1.4, 2.6][lod];
  const doorTop = 2.55; // underside of the lintel at the jambs
  const colliders = [];

  // pillar table: angle (0 = door axis, toward +Z, positive toward +X), height, role
  const pillars = [];
  for (let j = 0; j < n; j++) {
    const th = (j + 0.5) * D;
    const bridge = j === 0 || j === n - 1;
    const tall = v.tall.includes(j);
    let hj;
    if (bridge) hj = H * (0.52 + 0.1 * r());
    else if (tall) hj = H * (j === v.tall[0] ? 1.0 : 0.8 + 0.12 * r());
    else hj = H * (0.3 + 0.22 * r());
    pillars.push({ j, th, hj, bridge, tall, y0: bridge ? doorTop + 0.5 : -0.6 });
  }
  const center = (p, y) => {
    const rr = rho * (1 + 0.03 * Math.max(0, y)) * (1 + 0.08 * Math.sin(y * 0.7 + p.j * 1.7));
    return [Math.sin(p.th) * rr, y, Math.cos(p.th) * rr];
  };

  const trunkV0 = b.vcount;
  const trunkT0 = b.tcount;
  for (const p of pillars) {
    const pts = [];
    const span = p.hj - p.y0;
    const nr = Math.max(3, Math.round(span / stepY));
    for (let i = 0; i <= nr; i++) pts.push(center(p, p.y0 + span * (i / nr)));
    const seed = r() * 20;
    const jamb = p.j === 1 || p.j === n - 2;
    const scar = p.j === v.tall[0];
    const out = [Math.sin(p.th), 0, Math.cos(p.th)];
    const toDoor = norm3([-Math.sin(p.th) * rho, 0, rho - Math.cos(p.th) * rho]);
    const broken = !p.tall;
    const m1 = lod === 0 ? 7 : 5;
    sweep(b, pts, sides, {
      radius: (i, t, ang, k, dir) => {
        const y = pts[i][1];
        let a = v.pr * (1 + 0.6 * Math.exp(-Math.max(0, y) / 0.9)) * (1 - 0.3 * Math.min(1, Math.max(0, y) / p.hj));
        if (p.bridge) a *= 0.4 + 0.6 * sstep(0, 1.2, y - p.y0);
        if (jamb) {
          // callus roll round the top of the door, a flattened reveal on the door side below it
          a *= 1 + 0.12 * sstep(doorTop + 0.6, doorTop - 0.4, y);
          const dd = dot3(dir, toDoor);
          a *= 1 - 0.26 * sstep(0.1, 0.8, dd) * sstep(doorTop + 0.3, doorTop - 0.6, y);
        }
        if (p.tall && t > 0.88) a *= 1 - 0.55 * sstep(0.88, 1, t);
        if (broken && t > 0.9) a *= 1 - 0.2 * sstep(0.9, 1, t);
        const fr = lod === 0 ? furrow(ang, y, m1, seed, 0.32) : 0.7;
        const fr2 = lod === 0 ? furrow(ang, y, 13, seed * 2, -0.5) : 0.7;
        const ledge = lod === 0 ? 0.035 * (((y * 1.15 + seed) % 1) - 0.5) : 0;
        return a * (1 + 0.13 * (fr - 0.7) + 0.04 * (fr2 - 0.7) + ledge);
      },
      color: (i, t, ang, k, dir) => {
        const y = pts[i][1];
        const o = dot3(dir, out);
        const inside = sstep(0.1, -0.7, o); // faces the hollow
        const fr = lod === 0 ? furrow(ang, y, m1, seed, 0.32) : 0.7;
        let c = mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.light, 0.15 + 0.7 * fr * fr), 0.25 + 0.75 * sstep(0.2, 0.95, fr));
        c = mixRGB(PAL.dark, c, 0.45 + 0.55 * sstep(-0.3, 0.9, o));
        // pale lichen on the weather side, higher up
        if (scar && o > 0.8 + 0.06 * Math.sin(y * 0.9) && y > 0.4) {
          c = mixRGB(c, sstep(0.8, 0.95, o) > 0.5 ? PAL.raw : PAL.char, 0.8);
        }
        if (inside > 0.01) c = mixRGB(c, PAL.char, Math.min(1, inside * 1.2) * sstep(5.5, 1.5, y) * 0.9);
        return c;
      },
      flex: 0.02,
      phase: p.j,
      uv: true,
      capEnd: broken ? { color: PAL.raw, snow: 0.95 } : { color: PAL.mid, snow: 0.8 },
      offset: broken ? (i, t, ang) => {
        if (i < nr - 1) return null;
        const jag = 0.15 + 1.5 * Math.pow(0.5 + 0.5 * Math.sin(ang * 1.0 + seed), 1.6);
        return [0, i === nr ? jag : jag * 0.22, 0];
      } : null,
    });
    if (!p.bridge) colliders.push({ x: Math.sin(p.th) * rho, z: Math.cos(p.th) * rho, r: v.pr * 0.95 });
  }

  // the lintel: an arch of living wood along the ring, over the doorway
  {
    const a0 = -1.5 * D, a1 = 1.5 * D;
    const pts = [];
    const nl = lod === 0 ? 14 : lod === 1 ? 7 : 4;
    for (let i = 0; i <= nl; i++) {
      const f = i / nl;
      const a = a0 + (a1 - a0) * f;
      const arch = Math.cos((f - 0.5) * Math.PI);
      pts.push([Math.sin(a) * rho, doorTop - 0.1 + 0.6 * arch, Math.cos(a) * rho]);
    }
    sweep(b, pts, lod === 0 ? 11 : 5, {
      radius: (i, t, ang) => (0.44 + (lod === 0 ? 0.05 * Math.sin(ang * 4 + i) : 0)) * (1 + 0.3 * Math.pow(Math.abs(t - 0.5) * 2, 2.5)),
      color: (i, t, ang, k, dir) => mixRGB(PAL.dark, mixRGB(PAL.mid, PAL.light, 0.35), 0.25 + 0.75 * sstep(-0.3, 0.9, dir[1] * 0.4 + dir[2] * 0.6)),
      flex: 0,
      uv: true,
    });
  }

  // interior: charred wall ring, floor, drifted snow in the doorway
  const inner = rho - v.pr * 0.62;
  {
    const pts = [];
    for (let i = 0; i <= 4; i++) pts.push([0, i * 1.5, 0]);
    sweep(b, pts, lod === 0 ? 14 : 8, {
      radius: (i, t, ang) => inner * (1 + 0.06 * Math.sin(ang * 3)),
      color: (i, t) => mixRGB(PAL.char, PAL.dark, t * 0.8),
      flex: 0,
      uv: true,
      uvAround: 12,
    });
    // floor: a dark disc, drifted snow toward the door
    const c0 = b.v(0, 0.06, 0, 0, 1, 0, PAL.floor, 0, 0, 0.1, 0, 0);
    const ring = [];
    const ns = 12;
    for (let k = 0; k < ns; k++) {
      const a = (k / ns) * Math.PI * 2;
      const door = Math.max(0, Math.cos(a));
      ring.push(b.v(Math.sin(a) * inner * 1.05, 0.06, Math.cos(a) * inner * 1.05, 0, 1, 0, PAL.floor, 0, 0, 0.15 + 0.85 * Math.pow(door, 3), 0, 0));
    }
    for (let k = 0; k < ns; k++) b.triFacing(c0, ring[k], ring[(k + 1) % ns], 0, 1, 0);
    snowMound(b, r, [0.1, 0.0, rho - 0.2], 1.15, 0.28, 7, 0);
    snowMound(b, r, [-0.5, 0.0, rho - 1.2], 0.7, 0.2, 6, 0);
  }

  // buttress roots outside the ring (not across the doorway)
  if (lod < 2) {
    const nR = lod === 0 ? 8 : 4;
    for (let q = 0; q < nR; q++) {
      const th = (q + 0.25 + 0.5 * r()) * (Math.PI * 2 / nR) + 0.9;
      const dz = Math.cos(th), dx = Math.sin(th);
      if (Math.abs(Math.atan2(dx, dz)) < 1.7 * D) continue;
      const L = 1.8 + r() * 1.6;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const dd = rho + 0.2 + L * t;
        pts.push([dx * dd, 1.2 * Math.pow(1 - t, 1.7) - 0.4 * t, dz * dd]);
      }
      const rs = 0.5 + r() * 0.2;
      sweep(b, pts, lod === 0 ? 8 : 4, {
        radius: (i, t) => rs * (1 - 0.7 * t) + 0.07,
        color: (i, t, ang, k, dir) => mixRGB(PAL.dark, PAL.mid, 0.2 + 0.5 * sstep(-0.2, 0.9, dir[1])),
        flex: 0,
        uv: true,
      });
    }
  }
  b.tint(trunkV0, (x, y) => 0.55 + 0.45 * sstep(-0.3, 1.8, y));
  finish(b, trunkV0, trunkT0, [0.4, 0.8, 0.95]);
  // snow packed into the foot of the trunk
  for (let k = trunkV0; k < b.vcount; k++) {
    const y = b.p[k * 3 + 1];
    if (y < 0.25) b.s[k] = Math.max(b.s[k], 0.85);
  }

  // the great crown on the tall pillars
  const crownV0 = b.vcount;
  const crownT0 = b.tcount;
  const cfg = {
    r, bend: 0.5, up: 0.12, grav: 0.38, taper: 0.26, kidAt: [0.22, 0.9], spread: [0.55, 1.2], kidLen: [0.5, 0.8], kidRad: 0.62, minLen: 0.45,
    segs: (depth) => (lod === 0 ? (depth > 1 ? 5 : 3) : 3),
    sides: (rad) => (lod === 0 ? (rad > 0.22 ? 9 : rad > 0.09 ? 5 : 3) : rad > 0.15 ? 5 : 3),
    color: (depth, t) => mixRGB(mixRGB(PAL.limb, PAL.light, 0.3), PAL.dark, Math.min(1, 0.22 * (3 - depth) + t * 0.25)),
    finish: true,
    uv: true,
    flex: (depth, t) => Math.min(1, 0.05 + (3 - depth) * 0.22 + t * 0.2),
    kids: (depth) => (depth >= 3 ? 3 : depth === 2 ? 3 : 2),
    tip: null,
  };
  const crownDepth = [3, 2, 1][lod];
  for (const p of pillars) {
    if (p.bridge && lod === 2) continue;
    const nl = p.tall ? (lod === 2 ? 2 : p.j === v.tall[0] ? 5 : 4) : p.bridge ? 1 : 2;
    for (let m = 0; m < nl; m++) {
      const y = p.hj * (p.tall ? 0.45 + 0.5 * (m / nl) : 0.55 + 0.4 * (m / nl)) + r() * 0.3;
      const c0 = center(p, Math.min(y, p.hj - 0.2));
      const az = p.th + (r() - 0.5) * 2.6;
      const el = (p.tall ? 0.18 + r() * 0.55 : 0.1 + r() * 0.3);
      const d = norm3([Math.sin(az) * Math.cos(el), Math.sin(el) * 1.1, Math.cos(az) * Math.cos(el)]);
      const L = (p.tall ? 6.4 + r() * 3.2 : 4.0 + r() * 2.4) * v.crown;
      grow(b, cfg, c0, d, L, (p.tall ? 0.58 : 0.4) * (0.8 + 0.4 * r()) * Math.sqrt(v.crown), crownDepth);
    }
    if (p.tall) {
      const top = center(p, p.hj - 0.1);
      grow(b, cfg, top, [(r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4], (3.6 + r() * 1.6) * v.crown, 0.36, Math.max(0, crownDepth - 1));
    }
  }
  finish(b, crownV0, crownT0, [0.35, 0.8, 0.95]);

  // the red ribbon at the mouth: a band knotted round the left jamb pillar with two tails, and one
  // more tail from the middle of the lintel hanging into the doorway
  {
    const a = -1.5 * D; // the left jamb pillar, seen from outside
    const jc = [Math.sin(a) * rho, 0, Math.cos(a) * rho];
    const toDoor = norm3([-jc[0], 0, rho - jc[2]]);
    const jr = 0.98;
    const yb = 1.6;
    const base = Math.atan2(toDoor[0], toDoor[2]);
    const arc = [];
    const nA = lod === 0 ? 14 : 7;
    for (let i = 0; i <= nA; i++) {
      const q = base - 1.9 + (3.8 * i) / nA;
      arc.push([jc[0] + Math.sin(q) * jr, yb + 0.04 * Math.sin(i * 1.3), jc[2] + Math.cos(q) * jr]);
    }
    sweep(b, arc, 4, { radius: () => 0.065, color: () => PAL.red, flex: 0 });
    const knot = [jc[0] + toDoor[0] * jr, yb - 0.02, jc[2] + toDoor[2] * jr];
    const side = norm3([toDoor[2], 0, -toDoor[0]]);
    const mkTail = (o, len, sway, phase, w, col = PAL.red) => {
      const pts = [];
      const m = lod === 0 ? 8 : 4;
      for (let i = 0; i <= m; i++) {
        const t = i / m;
        const sw = sway * Math.sin(t * 3 + phase) * t;
        pts.push([o[0] + toDoor[0] * 0.06 * t + side[0] * sw, o[1] - len * t, o[2] + toDoor[2] * 0.06 * t + side[2] * sw]);
      }
      ribbon(b, pts, w, col, side, phase, 0.05);
    };
    // the long red ribbon and its short twin hang from the knot at the jamb
    mkTail(knot, 2.0, 0.1, 0.4, 0.11);
    mkTail([knot[0] + side[0] * 0.09, knot[1], knot[2] + side[2] * 0.09], 1.3, 0.08, 2.1, 0.085);
    berry(b, knot, 0.12, PAL.red);
    // votive strips tied along the lintel: red, red and a faded cream one, as on a wishing tree
    if (lod < 2) {
      const strips = [[-0.9, 0.9, PAL.red, 0.09], [-0.3, 1.5, PAL.red, 0.1], [0.35, 1.1, PAL.cream, 0.08], [0.95, 0.8, PAL.red, 0.08]];
      strips.forEach(([f, len, col, w], i) => {
        const a = f * D * 1.2;
        const arch = Math.cos((f / 1.5) * Math.PI * 0.5 * 0.9);
        const o = [Math.sin(a) * (rho + 0.18), doorTop - 0.1 + 0.6 * arch - 0.34, Math.cos(a) * (rho + 0.18)];
        const m = lod === 0 ? 7 : 4;
        const pts = [];
        for (let q = 0; q <= m; q++) {
          const t = q / m;
          pts.push([o[0] + Math.sin(a) * 0.04 * t + Math.cos(a) * 0.05 * Math.sin(t * 3 + i) * t, o[1] - len * t, o[2] + Math.cos(a) * 0.04 * t - Math.sin(a) * 0.05 * Math.sin(t * 3 + i) * t]);
        }
        ribbon(b, pts, w, col, [Math.cos(a), 0, -Math.sin(a)], i * 1.7, 0.05);
      });
    }
  }
  return {
    geometry: b.toGeometry(),
    height: H * 1.12,
    radius: rho + v.pr + 8.0 * v.crown + 1.2,
    trunkR: rho + v.pr * 0.6,
    windHeight: 26,
    colliders,
  };
}
