// Fishing spots on the lake (the world side of gameplay/fishing): a handful of real holes in the ice, each with a rim of
// chipped ice, a stool or an upturned bucket and a rod rest, and one thin spot at the bell tower where a hole can be cut.
//
//   G.world.locations.fishing = { spots, byId, thin }
//   spot  { id, name, zone, depth, rich, sizeBias, hole { x, z, r, id }, seat { x, z, yaw }, rest { x, z }, open, thin,
//           group (the props, hidden when far), cutAt (where Vesna kneels to cut), cutStart() cutTo(k) cutDone() cutInstant() }
//   zone: 'huts' (the shelf in front of the village huts, about a metre of water), 'deep' (further out, three or four metres),
//         'camp' (by the ice-fishing camp), 'far' (the lonely hole), 'tower' (under the bell tower, thirteen metres)
// The seat is where the stool stands and where Vesna sits, facing the hole 1.1 m away. Spot depth is the water under the
// ice from the terrain, so it matches what the ice shader draws.
import * as THREE from 'three';
import { LOC } from '../layout.js';
import { Composer, rngOf, rot2 } from './wilderness/compose.js';
import { tex, icePlane } from './wilderness/decals.js';

const SEAT_TO_HOLE = 1.1;

// z on the shoreline-parallel line `out` meters out on the ice at world x (by bisection on the lake signed distance).
function iceZ(G, x, out) {
  let lo = -60, hi = 120;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (G.world.lakeSDF(x, mid) < -out) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export async function build(G, ctx) {
  G.world.locations ||= {};
  const out = { spots: [], byId: {}, thin: [] };
  G.world.locations.fishing = out;
  if (!ctx?.props) return;
  const tower = LOC.bellTower, camp = LOC.iceCamp;
  const towerYaw = Math.atan2(LOC.village.x - tower.x, LOC.village.z - tower.z);
  const [tdx, tdz] = rot2(-7.5, -3.0, towerYaw);

  // Where each hole is and which way she faces. face: the direction (yaw) the seat looks, toward the hole.
  const DEFS = [
    { id: 'shelf_west', name: 'Hole on the shelf', zone: 'huts', x: -52, z: iceZ(G, -52, 9), face: Math.PI + 0.25, r: 0.3, stool: 'legs', rich: 1.0, sizeBias: 0.9, seed: 3 },
    { id: 'shelf_mid', name: 'Hole on the shelf', zone: 'huts', x: -19, z: iceZ(G, -19, 10), face: Math.PI - 0.3, r: 0.3, stool: 'bucket', rich: 1.0, sizeBias: 0.9, seed: 5 },
    { id: 'shelf_east', name: 'Hole on the shelf', zone: 'huts', x: 24, z: iceZ(G, 24, 9), face: Math.PI + 0.12, r: 0.3, stool: 'legs', rich: 1.0, sizeBias: 0.9, seed: 8 },
    { id: 'deep_west', name: 'Hole past the shelf', zone: 'deep', x: -44, z: iceZ(G, -44, 32), face: Math.PI - 0.2, r: 0.32, stool: 'bucket', rich: 1.0, sizeBias: 1.0, seed: 11 },
    { id: 'deep_east', name: 'Hole past the shelf', zone: 'deep', x: 8, z: iceZ(G, 8, 36), face: Math.PI + 0.35, r: 0.32, stool: 'legs', rich: 1.0, sizeBias: 1.0, seed: 14 },
    { id: 'camp_a', name: 'Hole at the camp', zone: 'camp', x: camp.x + 9.5, z: camp.z + 4, face: -Math.PI / 2 + 0.2, r: 0.3, stool: 'legs', rich: 0.95, sizeBias: 1.0, seed: 17 },
    { id: 'camp_b', name: 'Hole at the camp', zone: 'camp', x: camp.x + 12.5, z: camp.z - 2.5, face: -Math.PI / 2 - 0.35, r: 0.3, stool: 'bucket', rich: 0.95, sizeBias: 1.0, seed: 19 },
    { id: 'far', name: 'The lonely hole', zone: 'far', x: 196, z: -104, face: Math.PI / 2 + 0.5, r: 0.36, stool: 'bucket', rich: 1.2, sizeBias: 1.25, seed: 23, lantern: true },
    { id: 'tower', name: 'Thin ice by the bell tower', zone: 'tower', x: tower.x + tdx, z: tower.z + tdz, face: towerYaw + 2.2, r: 0.55, stool: 'legs', rich: 0.9, sizeBias: 1.15, seed: 29, thin: true },
  ];

  for (const d of DEFS) {
    const depth = Math.max(0.8, -G.world.terrainAt(d.x, d.z));
    // the seat stands SEAT_TO_HOLE meters from the hole, behind her as she faces it
    const seat = { x: d.x - Math.sin(d.face) * SEAT_TO_HOLE, z: d.z - Math.cos(d.face) * SEAT_TO_HOLE, yaw: d.face };
    const [rx, rz] = rot2(-0.9, 0.35, d.face);
    const spot = {
      id: d.id, name: d.name, zone: d.zone, depth, rich: d.rich, sizeBias: d.sizeBias, thin: !!d.thin,
      hole: { x: d.x, z: d.z, r: d.r, id: -1 }, seat, rest: { x: seat.x + rx, z: seat.z + rz },
      cutAt: { x: d.x + Math.sin(d.face + 2.4) * 1.5, z: d.z + Math.cos(d.face + 2.4) * 1.5 },
      open: false, group: null, def: d,
    };
    out.spots.push(spot);
    out.byId[spot.id] = spot;
    if (spot.thin) {
      out.thin.push(spot);
      dressThin(G, ctx, spot, d);
    } else {
      openNow(G, ctx, spot, d);
    }
  }

  // The hole at a thin spot is cut by Vesna (gameplay/fishing/cut.js): cutStart() opens a crack, cutTo(k) widens it as she
  // works (0..1), cutDone() puts the rim, the stool and the rod rest in. cutInstant() is the same at once (after a load).
  for (const spot of out.thin) {
    spot.cutStart = () => {
      if (spot.open || spot.hole.id >= 0) return;
      spot.hole.id = G.water?.addHole?.(spot.hole.x, spot.hole.z, 0.05) ?? -1;
    };
    spot.cutTo = (k) => {
      const e = 1 - (1 - Math.min(1, k)) * (1 - Math.min(1, k));
      G.water?.setHoleRadius?.(spot.hole.id, 0.05 + (spot.hole.r - 0.05) * e);
    };
    spot.cutDone = () => {
      if (spot.open) return;
      if (spot.hole.id < 0) spot.cutStart();
      G.water?.setHoleRadius?.(spot.hole.id, spot.hole.r);
      dressOpen(G, ctx, spot, spot.def);
      spot.open = true;
      spot.decal?.removeFromParent?.();
    };
    spot.cutInstant = () => { spot.cutStart(); spot.cutDone(); };
  }

  // Props far from the camera are hidden (they are small, and there are nine places).
  const cam = new THREE.Vector3();
  let acc = 0;
  G.addSystem('fishing-lod', (dt) => {
    acc += dt;
    if (acc < 0.4) return;
    acc = 0;
    cam.copy(G.camera.position);
    for (const s of out.spots) {
      if (!s.group) continue;
      s.group.visible = Math.hypot(cam.x - s.hole.x, cam.z - s.hole.z) < 220;
    }
  }, 120);
}

// ---------------------------------------------------------------------------------------------------------------------
// A hole that is already cut: the water, the rim, the stool and the rod rest.
function openNow(G, ctx, spot, d) {
  spot.hole.id = G.water?.addHole?.(spot.hole.x, spot.hole.z, spot.hole.r) ?? -1;
  dressOpen(G, ctx, spot, d);
  spot.open = true;
}

function dressOpen(G, ctx, spot, d) {
  const { hole, seat, rest } = spot;
  const rnd = rngOf(900 + d.seed);
  const c = new Composer(G, ctx, `fishing_${spot.id}`, hole.x, hole.z, { seed: d.seed, y: 0 });
  c.prop('iceFishingHole', hole.x, hole.z, { seed: d.seed, opts: { open: true, radius: hole.r, skim: false }, collide: false, dy: 0.012 });
  c.prop('fishingStool', seat.x, seat.z, { seed: d.seed + 1, yaw: seat.yaw + Math.PI, opts: { variant: d.stool }, collide: false });
  c.prop('rodRest', rest.x, rest.z, { seed: d.seed + 2, yaw: seat.yaw + rnd.signed(0.6), opts: { rod: d.seed % 2 === 0 }, collide: false });
  if (d.lantern) {
    const [lx, lz] = rot2(0.9, 0.2, seat.yaw);
    c.prop('lantern', seat.x + lx, seat.z + lz, { seed: 1, rot: [0, 0, 1.45], dy: 0.1, opts: { mount: 'ground' }, collide: false });
    c.prop('bucket', seat.x - lx * 0.9, seat.z - lz * 0.9, { seed: d.seed, yaw: rnd.range(0, 6), collide: false });
  } else if (spot.zone === 'huts' || spot.zone === 'deep') {
    const [bx, bz] = rot2(0.8, 0.5, seat.yaw);
    c.prop('bucket', seat.x + bx, seat.z + bz, { seed: d.seed, yaw: rnd.range(0, 6), collide: false });
  }
  // a few frozen fish scales and chips on the ice around the rim
  c.at(hole.x, hole.z, { yaw: rnd.range(0, 6) }, (k) => {
    for (let i = 0; i < 5; i++) {
      const a = rnd.range(0, 6.28), dist = rnd.range(hole.r * 1.6, hole.r * 3.2);
      k.blob('ice', 0.05, { pos: [Math.cos(a) * dist, 0.02, Math.sin(a) * dist], scale: [1, 0.5, 1.2], rot: [0, rnd.range(0, 6.28), 0], detail: 0, flat: true, tint: rnd.pick([0xd8ecf8, 0xe8f4fc, 0xc4dcec]) });
    }
  });
  spot.group = c.build();
  spot.group.name = `fishing:${spot.id}`;
}

// The marked thin place: a stake with a red rag and a milky patch where the ice is only a hand thick.
function dressThin(G, ctx, spot, d) {
  const { hole } = spot;
  const rnd = rngOf(700 + d.seed);
  spot.decal = icePlane(G, { x: hole.x, z: hole.z, w: 5.4, d: 5.4, yaw: rnd.range(0, 6), map: tex.oldHole(d.seed), opacity: 0.8, name: 'thinIce', lift: 0.012 });
  const c = new Composer(G, ctx, `fishing_${spot.id}_mark`, hole.x, hole.z, { seed: d.seed, y: 0 });
  const [sx, sz] = rot2(1.6, 0.9, d.face);
  c.at(hole.x + sx, hole.z + sz, { yaw: d.face }, (k) => {
    k.cyl('wood', 0.02, 0.028, 1.35, { pos: [0, 0.62, 0], rot: [0.06, 0, 0.05], radial: 5, tint: 0x9a8a78, jitter: 0.004, cap: 'logEnd' });
    k.hang('ribbon', 0.06, 0.5, { pos: [0.02, 1.25, 0.02], tint: 0x7a241a, sway: 0.5, wave: 0.05, grime: 0 });
    k.mound(0.5, 0.09, 0.5, { pos: [0, 0.0, 0], jseed: 2 });
  });
  spot.markGroup = c.build();
  spot.group = spot.markGroup;
}
