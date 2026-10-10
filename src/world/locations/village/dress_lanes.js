// Density pass for the village streets and the square: trodden ground and ruts, plank walks over the mud at the
// doors, hitching rails, troughs, carts and sledges parked where people stop, wood being cut, a hay paddock, fence
// lines in front of the yards, stakes down the lanes. Dark timber, rope and straw: the things that read against
// full-sun snow. Before this the square and the main street west of it were one white sheet until somebody
// stood in them. Nothing here stands on a road or a door; the stations are checked after the build (see
// scripts/density-check in docs/PROGRESS.md).
import { frame, seeded } from './util.js';
import { SQUARE } from './plan.js';
import { nearestRoad } from '../../layout.js';
import { roadById, sampleAt, pathLength, lanePaths, patch, stakeLine, railLine, at, yawX, yawZ } from './dress_lib.js';

const PI = Math.PI;

export function dressLanes(D) {
  const rng = seeded('lanes');
  // Keep every doorstep clear, and the stable's front, where the horse and the ostler stand (life.js stations).
  for (const r of D.V.placed) for (const d of r.p.doors) D.claim(d.x, d.z, 2.2);
  { const st = D.V.byId.stable; if (st) { const f = frame(st.x, st.z, st.yaw); D.claim(...f.at(st.fp.hw + 1.4, 3.2), 1.8); D.claim(...f.at(st.fp.hw + 2.6, 0), 2.4); } }
  // ... the square's standing places (life.js: well, stall customers, the four talkers) and the notice board
  {
    const V = D.V, w = V.byId.well;
    if (w) for (const [dx, dz] of [[0.2, 1.7], [-2.8, -0.4], [-1.6, -0.9]]) D.claim(w.x + dx, w.z + dz, 1.3);
    for (const id of ['stall_fish', 'stall_spoons', 'stall_dolls', 'stall_bread']) { const r = V.byId[id]; if (r) D.claim(...frame(r.x, r.z, r.yaw).at(-0.8, 1.9), 1.4); }
    const sq = frame(0, 118, 0);
    for (const [lx, lz] of [[-4, 6], [-3, 7.2], [14, -3], [13, -4.2]]) D.claim(...sq.at(lx, lz), 1.3);
    const nb = V.byId.noticeBoard;
    if (nb) D.claim(nb.x, nb.z, 3.0);
  }
  dressSquare(D, rng);
  dressPaddock(D, rng);
  dressMainStreet(D, rng);
  dressNorthStreet(D, rng);
  dressWestStreet(D, rng);
  dressSouthLane(D, rng);
}

// ---------------------------------------------------------------------------------------------
// Street clusters: small scenes laid beside a road in the road's own frame (u along it, v away from it).
//   [name, u, v, yaw, opts, r]   yaw: 'z' long axis of the prop along the road, 'x' likewise for props built along x,
//                                 'face' front toward the road, 'away', or a number (radians added to the road's yaw)
export const CLUSTERS = {
  woodyard: { patch: [3.6, 2.2], items: [
    ['sawbuck', 0, 0, 'x', {}, 1.0], ['firewoodStack', -2.3, 0.9, 'x', { opts: { rows: 5 } }, 1.0], ['choppingBlock', 0.4, -1.7, 0, {}, 0.6],
    ['logs', 1.8, 1.9, 'z', {}, 0.9], ['stump', -1.2, -1.5, 0, {}, 0.5],
  ] },
  haulSledge: { patch: [3.8, 2.0], items: [
    ['logSledge', 0, 0, 'z', { opts: { variant: 'loaded' } }, 2.2], ['logs', 2.9, 1.8, 'z', {}, 0.9], ['choppingBlock', -2.7, -1.4, 0, {}, 0.6],
    ['stake', 1.8, -1.7, 0, { collide: false, opts: { height: 1.6, flag: true } }, 0.2],
  ] },
  emptySledge: { patch: [3.2, 1.8], items: [
    ['logSledge', 0, 0, 'z', { opts: { variant: 'empty' } }, 2.2], ['logs', 3.0, 1.2, 'x', {}, 0.9], ['bucket', -2.4, -1.3, 0, { opts: { fill: 'ice' } }, 0.4],
    ['sack', -2.2, 1.6, 0.5, {}, 0.4],
  ] },
  cartHalt: { patch: [3.8, 2.2], items: [
    ['cart', 0, 0, 'z', { opts: { variant: 'sacks' } }, 1.8], ['sack', -1.9, 1.5, 0.4, {}, 0.4], ['crate', -2.9, 1.9, 0.3, {}, 0.5],
    ['hitchingRail', 3.4, -1.2, 'x', { opts: { variant: 'single' } }, 1.2], ['bucket', 2.2, 1.9, 0.5, { opts: { fill: 'ice' } }, 0.4],
  ] },
  firewoodCart: { patch: [3.6, 2.0], items: [
    ['cart', 0, 0, 'z', { opts: { variant: 'firewood' } }, 1.8], ['sawbuck', -3.6, 1.0, 'x', {}, 1.0], ['logs', 2.9, 1.4, 'z', {}, 0.9], ['stump', 2.0, -1.6, 0, {}, 0.5],
  ] },
  trestle: { patch: [3.4, 2.0], items: [
    ['table', 0, 0, 'x', { opts: { set: true } }, 1.3], ['bench', 0, 1.5, 'x', { opts: { length: 1.7 } }, 0.8], ['bench', 0, -1.4, 'x', { opts: { length: 1.7 } }, 0.8],
    ['barrel', 2.7, 0.9, 0, { seed: 2 }, 0.5], ['crate', -2.8, -0.2, 0.3, {}, 0.5], ['sack', 2.9, -1.0, 0.6, {}, 0.4],
  ] },
  fishSled: { patch: [3.0, 1.7], items: [
    ['sled', 0, 0, 'z', { opts: { variant: 'wood' } }, 1.2], ['fishBasket', 1.7, 1.3, 0.7, { seed: 1 }, 0.5], ['fishBasket', 2.4, 0.3, 2.0, { seed: 2 }, 0.5],
    ['bucket', -1.0, -1.3, 0, { opts: { fill: 'ice' } }, 0.4], ['fishingStool', -2.2, -0.5, 0, {}, 0.4],
  ] },
  hayStop: { patch: [3.4, 2.0], items: [
    ['hayRack', 0, 0, 'x', {}, 1.7], ['hayBale', 3.0, 1.0, 0.4, {}, 0.6], ['wheelbarrow', -3.0, 1.2, 'z', { opts: { variant: 'straw' } }, 0.9],
    ['strawPile', 0.8, 2.0, 0.7, { collide: false }, 0.5],
  ] },
  barrels: { patch: [3.0, 1.8], items: [
    ['barrel', 0, 0, 0.3, { seed: 1 }, 0.55], ['barrel', 0.9, 0.7, 0, { seed: 2 }, 0.5], ['barrel', 1.9, 0.1, 0, { seed: 3, opts: { variant: 'open' } }, 0.5],
    ['trough', -2.9, 0.6, 'x', {}, 1.1], ['bucket', -1.0, 1.4, 0.4, { opts: { fill: 'ice' } }, 0.4],
  ] },
  tools: { patch: [2.6, 1.6], items: [
    ['wheelbarrow', 0, 0, 'z', { opts: { variant: 'snow' } }, 0.9], ['snowShovel', 1.4, 0.6, 0.4, { collide: false, opts: { variant: 'stuck' } }, 0.3], ['snowShovel', 2.0, -0.2, 1.0, { collide: false, opts: { variant: 'stuck' } }, 0.3],
    ['skis', -1.4, -1.4, 0.2, {}, 0.5],
  ] },
  kennel: { patch: [2.4, 1.5], items: [
    ['dogKennel', 0, 0, 'face', {}, 1.0], ['bucket', 1.6, 0.8, 0.2, { opts: { fill: 'ice' } }, 0.4], ['bones', 1.2, 1.7, 0.5, { collide: false }, 0.3], ['stake', -1.5, 1.0, 0, { collide: false, opts: { height: 1.2 } }, 0.2],
  ] },
  broken: { patch: [3.4, 2.0], items: [
    ['cart', 0, 0, 'z', { opts: { variant: 'broken' } }, 1.8], ['crate', 2.7, 1.3, 0.5, { opts: { variant: 'open' } }, 0.5], ['sack', 2.2, -0.8, 1.2, { collide: false }, 0.4],
    ['stake', -2.0, 0.2, 0, { collide: false, opts: { height: 1.5, flag: true } }, 0.2],
  ] },
};
// Frame at road point p, `off` meters out on `side`, `along` meters down the road.
export function frameAt(p, side, off, along = 0) {
  const [x, z] = at(p, side * off, along);
  const Nx = side * p.nx, Nz = side * p.nz;
  return {
    x, z,
    pt: (u, v) => [x + p.tx * u + Nx * v, z + p.tz * u + Nz * v],
    yaw: (kind, extra = 0) => {
      if (typeof kind === 'number') return yawZ(p.tx, p.tz) + kind;
      if (kind === 'z') return yawZ(p.tx, p.tz) + extra;
      if (kind === 'x') return yawX(p.tx, p.tz) + extra;
      if (kind === 'face') return Math.atan2(-Nx, -Nz) + extra;
      return extra;
    },
    ang: Math.atan2(p.tz, p.tx),
  };
}

// Lay cluster `kind` beside the road at arc s on `side`: the first item is the anchor and picks the spot (a few
// offsets and shifts are tried); the rest are placed around it where they fit. Returns true if it landed.
export function cluster(D, rng, pts, s, side, off, kind, o = {}) {
  const def = CLUSTERS[kind];
  const p = sampleAt(pts, s);
  if (!p || !def) return false;
  const [name, , , yawKind, opts, r] = def.items[0];
  let f = null;
  for (const [dv, du] of [[0, 0], [1.5, 0], [0, 3], [0, -3], [2.5, 2], [2.5, -2], [4, 0], [-1, 0]]) {
    const fr = frameAt(p, side, off + dv, du);
    const wob = (rng() - 0.5) * 0.3;
    const yaw = fr.yaw(yawKind, wob);
    if (D.free(fr.x, fr.z, r, opts)) { f = fr; D.claim(fr.x, fr.z, r); D.add(name, fr.x, fr.z, { yaw, ...opts }); break; }
  }
  if (!f) { D.fails.push(`cluster ${kind}@${p.x.toFixed(0)},${p.z.toFixed(0)}`); return false; }
  for (const [n, u, v, yk, op, rr] of def.items.slice(1)) {
    const [x, z] = f.pt(u, v);
    const yaw = typeof yk === 'string' ? f.yaw(yk, (rng() - 0.5) * 0.5) : yk;
    D.tryPut(n, [[x, z, yaw]], op, rr);
  }
  if (def.patch && !o.noPatch) {
    const [rx, rz] = def.patch;
    const [mx, mz] = f.pt(0.3, 0.4);
    patch(D.V, mx, mz, rx, rz, f.ang, 'mud', 0.62);
  }
  return true;
}

// Clusters down one side of a road, one every `step` meters (a little irregular), cycling through `kinds`.
export function streetClusters(D, rng, pts, s0, s1, step, side, off, kinds, o = {}) {
  let n = 0;
  // ?density=0.7 thins every street and approach to about 70 percent (a cluster is two to three thousand triangles)
  const spacing = 1 / Math.max(0.2, Math.min(2, parseFloat(D.G.params.get('density')) || 1));
  for (let s = s0, i = o.start ?? 0; s <= s1; s += step * spacing * (0.85 + rng() * 0.3), i++) {
    if (cluster(D, rng, pts, s, side, off + (rng() - 0.5) * 1.6, kinds[i % kinds.length], o)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
function dressSquare(D, rng) {
  const { V } = D;
  const w = SQUARE.well;
  const put = (name, x, z, yaw, o = {}, r = 0.7) => D.tryPut(name, [[x, z, yaw]], o, r);
  // ground cover is laid without the spot manager: planks and mats at a door sit inside the building's footprint
  const lay = (name, x, z, yaw, o = {}) => D.add(name, x, z, { yaw, collide: false, ...o });

  // Trodden mud where everyone goes: the junction, the well, the stall fronts, the two big doors.
  patch(V, 0.5, 118.6, 7.5, 2.4, 0.02, 'mud', 0.5);
  patch(V, w.x, w.z + 0.3, 3.6, 3.1, 0.2, 'mud', 0.62);
  patch(V, w.x + 0.6, w.z + 1.9, 1.9, 1.1, 0.3, 'ice', 0.8); // spilled water frozen at the foot of the well
  for (const id of ['stall_fish', 'stall_spoons', 'stall_dolls', 'stall_bread']) {
    const r = V.byId[id];
    const [x, z] = frame(r.x, r.z, r.yaw).at(0, 2.3);
    patch(V, x, z, 2.5, 1.2, -r.yaw, 'mud', 0.62);
    lay('plankWalk', x, z, r.yaw + PI / 2, { opts: { length: 2.3, width: 0.9 } });
  }
  for (const id of ['tavern', 'longhouse']) {
    const d = V.byId[id].p.doors[0];
    const f = frame(d.x, d.z, d.yaw);
    const [x, z] = f.at(0, 3.2);
    patch(V, x, z, 3.4, 1.6, -d.yaw, 'mud', 0.65);
  }
  // Duckboards over the worst of it: tavern door out to the street, longhouse porch toward the notice board.
  {
    const d = V.byId.tavern.p.doors[0];
    const f = frame(d.x, d.z, d.yaw);
    for (const lz of [3.2, 5.9]) { const [x, z] = f.at(0, lz); lay('plankWalk', x, z, d.yaw, { opts: { length: 2.7 } }); }
    const l = V.byId.longhouse.p.doors[0];
    const lf = frame(l.x, l.z, l.yaw);
    for (const lz of [3.4, 6.2, 9.0]) { const [x, z] = lf.at(0, lz); lay('plankWalk', x, z, l.yaw, { opts: { length: 2.7 } }); }
  }

  // Tethering and watering: a rail by the tavern, one at the west end of the square, one on the east side,
  // a trough at the well with its ice chopped open and one by the board.
  put('hitchingRail', -24.6, 114.4, 0.05, { opts: { variant: 'double', length: 2.8 } }, 1.1);
  put('hitchingRail', -9.5, 128.4, -0.1, { opts: { variant: 'single' } }, 1.1);
  put('hitchingRail', 24.0, 121.6, 0.0, { opts: { variant: 'double' } }, 1.1);
  put('trough', w.x - 3.4, w.z + 3.6, 0.25, {}, 1.0);
  put('trough', 21.0, 110.5, 0.0, {}, 1.0);

  // A carter has stopped at the north-west corner of the square: the cart half unloaded, sacks and a crate on
  // the ground, a barrel rolled off and a wheelbarrow beside it.
  put('cart', -9.8, 113.2, 0.7, { opts: { variant: 'sacks' } }, 1.7);
  put('sack', -11.9, 111.4, 0.4, {}, 0.4);
  put('sack', -11.2, 110.3, 2.2, { collide: false }, 0.4);
  put('crate', -7.2, 110.6, 0.3, {}, 0.5);
  put('barrel', -8.6, 108.6, 0.2, { seed: 1 }, 0.5);
  put('wheelbarrow', -5.0, 108.2, 2.4, {}, 0.9);
  patch(V, -9.2, 112.0, 3.4, 1.8, 0.5, 'mud', 0.62);

  // Hay for the paddock, brought over on a cart and left at the edge of the square.
  put('cart', 26.4, 124.0, 1.4, { opts: { variant: 'straw' } }, 1.7);
  put('hayBale', 22.4, 128.3, 0.3, {}, 0.6);
  put('hayBale', 23.3, 128.9, 1.1, { collide: false }, 0.6);
  put('strawPile', 28.0, 120.6, 0.2, { collide: false }, 0.5);
  patch(V, 25.0, 123.0, 3.6, 2.0, 0.3, 'mud', 0.6);

  // The north-east corner by the board: firewood sold by the armful. A sledge of billets, a block, a sawbuck.
  put('logSledge', 15.8, 104.2, yawZ(1, 0.1), { opts: { variant: 'loaded' } }, 2.0);
  put('sawbuck', 21.0, 106.6, 0.4, {}, 1.0);
  put('choppingBlock', 22.4, 104.6, 0.0, {}, 0.6);
  patch(V, 19.0, 105.6, 4.2, 2.4, 0.2, 'mud', 0.62);

  // South of the well toward the lane: a woodyard where the street bends and a bench for whoever waits.
  put('sawbuck', -8.4, 131.8, 1.2, {}, 1.0);
  put('firewoodStack', -12.0, 133.4, 0.1, { opts: { rows: 5 } }, 1.0);
  put('woodpile', -15.0, 130.2, -0.2, {}, 1.2);
  put('choppingBlock', -6.2, 133.4, 0.0, {}, 0.6);
  put('logs', -10.0, 136.2, 1.6, {}, 1.0);
  patch(V, -9.8, 132.8, 4.8, 2.6, 0.1, 'mud', 0.62);
  put('bench', 11.0, 113.6, PI, { opts: { length: 1.7 } }, 0.8);

  // The ribbon pole is up for the rite: straw bundles waiting at its foot.
  put('strawPile', 2.4, 111.2, 0.6, { collide: false }, 0.5);
  put('strawPile', 4.8, 114.2, 1.9, { collide: false }, 0.5);
  void rng;
}

// ---------------------------------------------------------------------------------------------
// South-east of the square: a three-sided paddock of split rails with a hay rack and a trough, where the
// draught animals are fed when they are out, with the hay stacked beside it.
function dressPaddock(D) {
  const { V } = D;
  const put = (name, x, z, yaw, o = {}, r = 0.7) => D.tryPut(name, [[x, z, yaw]], o, r);
  const x0 = 6.5, x1 = 26, z0 = 130.5, z1 = 138.2;
  if (V.linear) V.linear.place('fence', [[x0, z0 + 1.5], [x0, z1], [x1, z1], [x1, z0 + 1.5]], { style: 'rail' });
  patch(V, (x0 + x1) / 2, (z0 + z1) / 2 + 0.5, 8.5, 3.0, 0, 'mud', 0.62);
  put('hayRack', 10.5, 134.2, 0.0, {}, 1.8);
  put('trough', 21.5, 135.2, 0.05, {}, 1.2);
  put('hayBale', 15.5, 132.4, 0.4, {}, 0.6);
  put('hayBale', 16.4, 132.9, 1.2, { collide: false }, 0.6);
  put('haystack', 22.4, 132.6, 0, {}, 1.4);
  put('wheelbarrow', 18.0, 136.0, 2.6, {}, 0.9);
  put('strawPile', 13.6, 136.2, 0.4, { collide: false }, 0.5);
  put('bucket', 19.6, 133.4, 0.4, { opts: { fill: 'ice' } }, 0.4);
}

// ---------------------------------------------------------------------------------------------
// The main street: the ruts are the terrain's; this fills both sides, and fences the yards that face it.
function dressMainStreet(D, rng) {
  const west = roadById('pass').pts.slice(-4);   // gate to square, 89 m
  const east = roadById('mill').pts.slice(0, 4);  // square to the east edge
  const kindsA = ['woodyard', 'cartHalt', 'tools', 'barrels', 'haulSledge', 'trestle', 'hayStop', 'firewoodCart'];
  const kindsB = ['emptySledge', 'barrels', 'kennel', 'woodyard', 'trestle', 'tools', 'cartHalt', 'hayStop'];
  yardFences(D, rng); // first: the long structures, then the clusters find their spots between them
  streetClusters(D, rng, west, 6, pathLength(west) - 12, 9, 1, 6.0, kindsA, { start: 0 });
  streetClusters(D, rng, west, 10, pathLength(west) - 14, 9, -1, 6.0, kindsB, { start: 3 });
  streetClusters(D, rng, east, 8, pathLength(east) - 2, 9.5, 1, 6.0, kindsB, { start: 1 });
  streetClusters(D, rng, east, 13, pathLength(east) - 2, 9.5, -1, 6.0, kindsA, { start: 5 });
}

// A split-rail fence across the front of every yard that faces the main street, with a gap where the path from the
// door crosses it (the path ribbon runs from the doorstep to the nearest road point; a fence section that does not
// fit is simply missing, which reads as weathered). Kept to houses a few meters from the street, never a hero place.
function yardFences(D, rng) {
  let n = 0;
  for (const rec of D.V.placed) {
    if (!rec.meta.house) continue;
    const door = rec.p.doors.find((d) => d.id === 'front') || rec.p.doors[0];
    if (!door) continue;
    const nr = nearestRoad(door.x, door.z);
    if (!nr || (nr.road.id !== 'pass' && nr.road.id !== 'mill') || nr.d > 30 || nr.x < -92 || nr.x > 66) continue;
    const f = frame(door.x, door.z, door.yaw);
    const dx = nr.x - door.x, dz = nr.z - door.z;
    const c = Math.cos(door.yaw), s = Math.sin(door.yaw);
    const lxr = dx * c - dz * s, lzr = dx * s + dz * c; // the road, in the door's frame
    const L = 5.2 + rng() * 0.8;
    if (lzr < L + 4 || lxr * lxr > lzr * lzr * 0.9) continue; // the street is not in front of this door
    const t = (L - 0.6) / (lzr - 0.6);
    const gx = lxr * t;
    const W = rec.fp.hw + 2.6;
    const left = [f.at(-W, L), f.at(Math.min(gx - 1.5, -2.0), L)];
    const right = [f.at(Math.max(gx + 1.5, 2.0), L), f.at(W, L)];
    n += railLine(D, left) + railLine(D, right);
    // the gate posts: two stakes with rags either side of the gap
    for (const lx of [Math.min(gx - 1.5, -2.0), Math.max(gx + 1.5, 2.0)]) { const [x, z] = f.at(lx, L); D.tryPut('stake', [[x, z, 0]], { collide: false, opts: { height: 1.5, flag: true } }, 0.2); }
  }
  D.V.log?.('yard fence sections', n);
}

// ---------------------------------------------------------------------------------------------
function dressNorthStreet(D, rng) {
  const { V } = D;
  const R = roadById('village_north').pts;
  // the lane itself, down to the shore, with its ruts; mud where it leaves the square and where it meets the beach
  lanePaths(V, R, 3, 54, { phase: 1.1 });
  const a = sampleAt(R, 7), b = sampleAt(R, 52);
  patch(V, a.x, a.z, 4, 2.2, Math.atan2(a.tz, a.tx), 'mud', 0.62);
  patch(V, b.x, b.z, 4.5, 2.6, Math.atan2(b.tz, b.tx), 'mud', 0.62);
  stakeLine(D, R, 14, 52, { step: 9, off: 3.0, height: 1.7 });
  streetClusters(D, rng, R, 12, 52, 11, -1, 5.2, ['fishSled', 'woodyard', 'barrels', 'fishSled', 'tools'], { start: 0 });
  streetClusters(D, rng, R, 17, 52, 11, 1, 5.2, ['haulSledge', 'fishSled', 'cartHalt', 'fishSled', 'kennel'], { start: 0 });
}

// ---------------------------------------------------------------------------------------------
// The south lane north of the wood yard (the lead dressed s 8 to 46 on its west side): the end that opens into the
// square, which is what you look down when you come in from the shrine.
function dressSouthLane(D, rng) {
  const R = roadById('village_south').pts;
  streetClusters(D, rng, R, 9, 40, 11, 1, 4.8, ['tools', 'barrels', 'hayStop', 'cartHalt'], { start: 0 });
  streetClusters(D, rng, R, 13, 40, 12, -1, 4.8, ['firewoodCart', 'trestle', 'emptySledge'], { start: 0 });
  stakeLine(D, R, 12, 44, { step: 10, off: 2.9, height: 1.7, stagger: true });
}

// ---------------------------------------------------------------------------------------------
function dressWestStreet(D, rng) {
  const { V } = D;
  const R = roadById('village_west').pts;
  lanePaths(V, R, 2, 32, { phase: 2.3 });
  stakeLine(D, R, 6, 32, { step: 8, off: 2.7, height: 1.75 });
  patch(V, R[0][0], R[0][1] + 2, 4.2, 2.4, 0.6, 'mud', 0.62);
  streetClusters(D, rng, R, 8, 30, 10, 1, 4.6, ['hayStop', 'cartHalt', 'woodyard'], { start: 0 });
  streetClusters(D, rng, R, 12, 30, 10, -1, 4.6, ['tools', 'hayStop', 'emptySledge'], { start: 0 });
}
