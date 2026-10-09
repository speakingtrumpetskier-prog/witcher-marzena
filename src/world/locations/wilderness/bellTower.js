// The drowned bell tower (LOC.bellTower): the kit tower frozen into the ice with its base on the surface,
// pressure cracks starring out from it, and the belfry dressed as Wiesia's house: the ice-plank table with
// frozen bread, seventeen effigies seated round it with frost on their faces and shoulders, a tin music box,
// a red ribbon on the bell rope, two more effigies on the inner stairs (one seated, one standing), and the
// three drowned fishermen under the clear ice beside the tower, faces up (frosted decal on the ice surface,
// the ice shader hides real geometry).
//
// G.world.locations.bellTower:
//   placed, yaw, door (the broken window at ice level), inside, top, walk (kit walk floors),
//   belfry { floorY, table, musicBox, ribbon (item_ribbon), bellRope, bell, hatch, vista, lookDown, birdSpot, seats[17] { pos, yaw, side } },
//   stairs { landing1, landing2, seated { group, pos }, standing { group, pos } },
//   drowned { center, men[3] { pos }, decal }, wiesiaGlide { from, to }  (the pale shape that slides away under the ice)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf } from './compose.js';
import { tex, icePlane } from './decals.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.bellTower;
  const rnd = rngOf(77);
  const yaw = Math.atan2(LOC.village.x - L.x, LOC.village.z - L.z); // the entrance faces the village
  const b = buildings.bellTower({ seed: 77 });
  const p = placeBuilding(G, b, L.x, L.z, yaw, { snap: false, y: 0, foundation: false, skirt: false, tag: 'bellTower' });
  const S = (lx, ly, lz) => p.localToWorld(lx, ly, lz);

  // The shaft carries on down through the water to the lake bed: dark, invisible except where the ice thins.
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 12.2, 6.1), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 }));
    m.position.set(L.x, -7.2, L.z);
    m.rotation.y = yaw;
    m.name = 'wild:bellTowerShaft';
    G.scene.add(m);
  }
  for (const l of p.lights) W.light(l);
  W.interior({ id: 'bellTower_nave', polygon: [[-1.95, -1.95], [1.95, -1.95], [1.95, 1.95], [-1.95, 1.95]].map(([x, z]) => { const q = S(x, 0, z); return [q.x, q.z]; }), y0: -1, y1: 5.2, env: 'room' });

  // ---- pressure cracks around the tower foot, and the three drowned men ---------------------------------
  icePlane(G, { x: L.x, z: L.z, w: 26, d: 26, yaw, map: tex.crackStar(8), opacity: 0.9, name: 'bellCracks', lift: 0.014 });
  const dc = S(6.3, 0, 5.4);
  const men = [{ x: -3.0, z: -0.7, ang: 0.35 }, { x: 0.1, z: 0.55, ang: -0.28 }, { x: 3.0, z: -0.25, ang: 0.85 }];
  const dW = 9.6, dD = 5.0;
  icePlane(G, { x: dc.x, z: dc.z, w: dW, d: dD, yaw, map: tex.drowned(dW, dD, men, 11), opacity: 1, name: 'drownedMen', lift: 0.02, emissive: 0xaec8d8, emissiveIntensity: 0.35, order: 7 });
  const menWorld = men.map((m) => {
    const q = new THREE.Vector3(dc.x, 0, dc.z);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    q.x += m.x * cs + m.z * sn; q.z += -m.x * sn + m.z * cs;
    return q;
  });

  // ---- the belfry ------------------------------------------------------------------------------------------
  const c = new Composer(G, W.ctx, 'bellTower', L.x, L.z, { seed: 71, y: 0 });
  const seats = p.objects.seats;
  const seatsOut = [];
  seats.forEach((s, i) => {
    const w = S(s.x, s.y - 0.43, s.z);
    const sy = yaw + s.yaw + rnd.signed(0.1);
    c.prop('effigy', w.x, w.z, { y: w.y, yaw: sy, seed: i + 1, opts: { variant: 'seated' }, collide: false });
    // hoarfrost: a crust over the face, ice on the shoulders and in the folds of the lap
    c.at(w.x, w.z, { y: w.y, yaw: sy }, (k) => {
      k.sph('ice', 0.152, { pos: [0, 1.23, 0.0], scale: [0.9, 1.16, 0.96], ws: 12, hs: 8, p0: Math.PI / 2 - 0.85, p1: 1.7, t0: 0.5, t1: 2.5, tint: 0xd6e8f4, grime: 0 });
      for (const sx of [-1, 1]) k.blob('ice', 0.07, { pos: [sx * 0.14, 0.97, -0.01], scale: [1.2, 0.5, 0.9], rot: [0, 0, sx * 0.25], detail: 0, flat: true, tint: 0xdbeaf3, grime: 0, var: 0.08 });
      if (i % 3 === 0) for (let j = 0; j < 3; j++) k.cone('ice', 0.012, 0.07 + 0.05 * j, { pos: [(j - 1) * 0.07, 0.55 - 0.04, 0.22], rot: [Math.PI, 0, 0], radial: 4, tint: 0xd6e8f4, grime: 0 });
    });
    seatsOut.push({ pos: w.clone().setY(w.y + 0.45), yaw: sy, side: s.side });
  });

  // table: jugs, candle stubs gone to ice, the music box, a ribbon, a place laid for the bird
  const tb = S(0, 5.4 + 0.82, 0);
  const tbl = (lx, lz) => S(lx, 5.4 + 0.82, lz);
  const dressTable = [['jug', -1.4, 0.18, 0.6], ['jug', 0.9, -0.2, 2.4], ['jug', 1.45, 0.25, 4.1]];
  for (const [name, lx, lz, yw] of dressTable) {
    const q = tbl(lx, lz);
    c.prop(name, q.x, q.z, { y: q.y, yaw: yaw + yw, seed: 2, collide: false, opts: { indoor: true } });
  }
  for (const [lx, lz] of [[-0.5, 0.05], [0.4, -0.12], [2.3, -0.25]]) {
    const q = tbl(lx, lz);
    c.prop('offering', q.x, q.z, { y: q.y - 0.02, yaw: yaw + 0.5, seed: 7, collide: false, opts: { variant: 'candle', indoor: true }, scale: 0.8 });
  }
  const mb = tbl(2.05, 0);
  c.prop('musicBox', mb.x, mb.z, { y: mb.y, yaw: yaw - Math.PI / 2, collide: false });
  const rb = tbl(-2.4, 0.3);
  c.at(rb.x, rb.z, { y: rb.y + 0.003, yaw: yaw + 0.7 }, (k) => {
    k.plane('ribbon', 0.05, 0.5, { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0.0], tint: 0x7a241a, grime: 0, var: 0.02 });
    k.torus('ribbon', 0.03, 0.01, { pos: [-0.1, 0.012, 0.0], rot: [Math.PI / 2, 0, 0], tint: 0x7a241a, seg: 8, rseg: 3, grime: 0 });
    k.blob('ice', 0.04, { pos: [0.05, 0.01, 0.1], scale: [1.4, 0.3, 1.0], detail: 0, flat: true, tint: 0xe2f0f8, grime: 0 });
  });
  // the bell rope with its red ribbon, tied in Dobra's knot
  const rope0 = S(0.115, 5.4 + 2.15, 0.0), rope1 = S(0.1, 5.4 + 1.2, 0.03);
  c.at(rope0.x, rope0.z, { y: rope0.y, yaw }, (k) => {
    const dy = rope1.y - rope0.y;
    k.tube('rope', [[0, 0, 0], [0.005, dy * 0.5, 0.01], [-0.01, dy, 0.02]], 0.022, { radial: 6, tint: 0xc4b08a, grime: 0 });
    k.sph('rope', 0.04, { pos: [-0.01, dy - 0.02, 0.02], tint: 0xb89c6c, grime: 0 });
    k.hang('ribbon', 0.045, 0.55, { pos: [-0.01, dy + 0.1, 0.05], tint: 0x7a241a, sway: 0.15, wave: 0.02, grime: 0 });
    k.hang('ribbon', 0.045, 0.4, { pos: [0.02, dy + 0.1, 0.0], tint: 0x8a2a1e, sway: 0.15, wave: 0.02, grime: 0 });
    for (let i = 0; i < 4; i++) k.cone('ice', 0.012, 0.09 + 0.03 * i, { pos: [0.02 * i - 0.03, dy * 0.4 - 0.04 * i, 0.03], rot: [Math.PI, 0, 0], radial: 4, tint: 0xe2f0f8, grime: 0 });
  });

  // ---- frozen spray on the shaft, above the ice collar: crusted bands with a ragged lower edge and icicles ----------
  c.at(L.x, L.z, { y: 0, yaw }, (k) => {
    const rr = 3.0;
    for (let side = 0; side < 4; side++) {
      for (let row = 0; row < 3; row++) {
        const n = 7 - row;
        for (let i = 0; i < n; i++) {
          const t = ((i + rnd.range(0.1, 0.9)) / n) * 5.4 - 2.7;
          const h = 0.85 + row * 0.42 + rnd.signed(0.08);
          const w = rnd.range(0.7, 1.3), hh = rnd.range(0.2, 0.42);
          const off = rr + rnd.range(0.0, 0.07);
          const px = side === 0 ? t : side === 1 ? off : side === 2 ? -t : -off;
          const pz = side === 0 ? off : side === 1 ? -t : side === 2 ? -off : t;
          const along = side % 2 === 0;
          k.blob('ice', 0.5, { pos: [px, h, pz], scale: along ? [w, hh, 0.16] : [0.16, hh, w], rot: [0, 0, rnd.signed(0.05)], detail: 1, flat: true, tint: rnd.pick([0xdbeaf3, 0xe6f1f8, 0xc9dfec]), grime: 0, var: 0.07 });
          if (row === 0 && rnd.chance(0.7)) for (let j = 0; j < 3; j++) k.cone('ice', rnd.range(0.025, 0.05), rnd.range(0.2, 0.65), { pos: [px + (along ? rnd.signed(w * 0.4) : 0.05), h - hh * 0.5 - 0.15, pz + (along ? 0.05 : rnd.signed(w * 0.4))], rot: [Math.PI, 0, 0], radial: 5, tint: 0xe2f0f8, grime: 0 });
        }
      }
    }
  });
  c.build();

  // ---- the inner stairs: two more effigies, one seated (it turns its head as she passes) ---------------------
  const stairs = {};
  {
    const yL1 = 0.3 + 9 * ((5.4 - 0.3) / 27), yL2 = 0.3 + 18 * ((5.4 - 0.3) / 27);
    const eff = (variant, lx, ly, lz, ly_yaw, seed) => {
      const g = W.props.effigy({ variant, seed, indoor: true, fx: false });
      const q = S(lx, ly, lz);
      g.position.copy(q);
      g.rotation.y = yaw + ly_yaw;
      G.scene.add(g);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      return { group: g, pos: q };
    };
    stairs.seated = eff('seated', -1.62, yL1 + 0.02, -1.55, Math.PI, 31);
    stairs.standing = eff('frozen', 1.66, yL2 + 0.02, -1.66, -Math.PI / 2, 32);
    stairs.landing1 = S(-1.65, yL1, -1.5);
    stairs.landing2 = S(1.65, yL2, -1.65);
  }

  const A = p.anchors;
  const floorY = 5.4;
  W.loc('bellTower', {
    id: 'bellTower',
    placed: p,
    yaw,
    walk: p.walk,
    door: A.door.clone(),
    inside: A.inside.clone(),
    top: A.top.clone(),
    belfry: {
      floorY,
      table: A.table.clone(),
      musicBox: mb.clone(),
      ribbon: rb.clone(), // item_ribbon on the table
      bellRope: rope1.clone(), // the ribbon tied on the rope (C5 insert)
      bell: A.bell.clone(),
      hatch: A.hatch.clone(),
      vista: A.vista.clone(),
      lookDown: S(2.2, floorY + 0.1, 2.5), // C5: Vesna looks down past the rail at the men under the ice
      birdSpot: tbl(-2.1, 0.0), // side quest: the waxwing is placed here
      seats: seatsOut,
    },
    stairs,
    drowned: { center: new THREE.Vector3(dc.x, 0, dc.z), men: menWorld, decal: 'drownedMen' },
    // the pale shape under the ice: slides from beside the men out toward the open lake
    wiesiaGlide: { from: S(5.5, -0.8, 3.8), to: S(-12, -1.2, 20) },
  });
  void tb;
}
