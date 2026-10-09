// Trapper's cabin (LOC.hunterCabin): the kit's ruined log cabin in the NW forest, its west wall fallen. The
// trapper's diary lies on the table inside (note_trapper: wolves coming down from the pass "as if pushed", the
// bell heard from the lake). Outside: the big bear trap sprung by the door, wolf pelts stretched on frames,
// snare lines at the tree edge with a frozen hare, a cold fire and a chopping block with the axe in it, woodpile,
// snowshoes and a sled, and wolf tracks that run past the cabin in a hurry.
//
// G.world.locations.hunterCabin:
//   placed, door, diary (note_trapper clue), trap (sprung bear trap), pelts[], snares[], fire, axe, tracks { points, kind: 'footprints' }
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf, smoothPath } from './compose.js';
import { bearTrap, snareLine } from './objects.js';
import { coldFire, wolfPelt } from './objects2.js';
import { tex, groundRibbon } from './decals.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.hunterCabin;
  const rnd = rngOf(400);
  W.clear(L.x, L.z, 15);
  const yaw = 0.2;
  const b = buildings.trapperCabin({ seed: 211 });
  const p = placeBuilding(G, b, L.x, L.z, yaw, { foundation: true, skirt: false, tag: 'trapperCabin' });
  const S = (lx, ly, lz) => p.localToWorld(lx, ly, lz);
  const Pw = (lx, lz) => { const q = S(lx, 0, lz); return { x: q.x, z: q.z }; };
  for (const l of p.lights) W.light(l);
  W.interior({ id: 'trapperCabin', polygon: [[-2.2, -1.9], [2.2, -1.9], [2.2, 1.9], [-2.2, 1.9]].map(([x, z]) => { const q = S(x, 0, z); return [q.x, q.z]; }), y0: p.y - 0.5, y1: p.y + 3, env: 'room' });

  const c = new Composer(G, W.ctx, 'cabin', L.x, L.z, { seed: 21 });
  // the diary on the table: a cracked leather book lying open, an ink pot, a candle stub, frost on the pages
  const dt = S(1.0, 0.51, -1.0);
  c.at(dt.x, dt.z, { y: dt.y, yaw: yaw + 0.25 }, (k) => {
    k.box('face', 0.2, 0.03, 0.28, { pos: [0, 0.015, 0], tint: 0x3a2a1e, grime: 0.1, tile: 0.2 });
    k.box('face', 0.19, 0.012, 0.26, { pos: [-0.0, 0.036, 0.0], tint: 0xe6dcc0, grime: 0, tile: 0.2 });
    k.box('paint', 0.002, 0.014, 0.26, { pos: [0, 0.038, 0], tint: 0x2a2018, grime: 0 });
    k.box('face', 0.19, 0.012, 0.26, { pos: [0.0, 0.05, 0.0], rot: [0, 0, -0.18], tint: 0xdcd2b6, grime: 0, tile: 0.2 });
    k.cyl('clay', 0.035, 0.04, 0.07, { pos: [0.28, 0.035, -0.05], radial: 8, tint: 0x3a3028 });
    k.cyl('wood', 0.008, 0.008, 0.2, { pos: [0.3, 0.13, -0.05], rot: [0, 0, 0.5], radial: 4, tint: 0xd8d0c0, cap: null, grime: 0 });
    k.cyl('face', 0.02, 0.02, 0.07, { pos: [-0.3, 0.035, 0.12], radial: 6, tint: 0xd8cca8, grime: 0 });
    k.blob('ice', 0.04, { pos: [0.05, 0.06, 0.05], scale: [1.6, 0.25, 1.2], detail: 0, flat: true, tint: 0xe2f0f8, grime: 0 });
  });

  // by the door: the big trap sprung on a stick, with its drag log
  const door = p.anchors.door;
  const tp = Pw(1.9, 2.9);
  c.at(tp.x, tp.z, { yaw: yaw + 0.4 }, (k) => bearTrap(k, { scale: 1.3 }));
  c.circle(tp.x, tp.z, 0.4, p.y - 1, p.y + 0.6, 'bear trap');

  // wolf pelts on frames along the east wall, a hide frame next to them
  const pelts = [];
  for (const [lx, lz, a] of [[4.3, -0.2, -0.2], [4.4, 1.5, 0.15], [4.2, -1.9, -0.45]]) {
    const q = Pw(lx, lz);
    c.at(q.x, q.z, { yaw: yaw + Math.PI / 2 + a }, (k) => wolfPelt(k, { tint: rnd.pick([0x5a5248, 0x6a6258, 0x4a443c, 0x7a7266]) }));
    pelts.push(new THREE.Vector3(q.x, p.y + 0.8, q.z));
  }
  const sf = Pw(5.2, 3.6);
  c.prop('skinFrame', sf.x, sf.z, { seed: 2, yaw: yaw + 1.2 });

  // camp: cold fire with a log seat, chopping block and axe, woodpile, sled, snowshoes, bucket, a spilled pack
  const fp = Pw(-2.2, 5.6);
  c.at(fp.x, fp.z, { yaw: 0.2 }, (k) => coldFire(k, { r: 0.6 }));
  c.prop('logs', Pw(-0.4, 6.4).x, Pw(-0.4, 6.4).z, { seed: 2, yaw: yaw + 1.4, opts: { count: 1, length: 1.4 } });
  const cb = Pw(3.8, 5.6);
  const cbh = c.prop('choppingBlock', cb.x, cb.z, { seed: 1, yaw: yaw + 0.6 });
  c.prop('woodpile', Pw(-4.9, -0.8).x, Pw(-4.9, -0.8).z, { seed: 2, yaw: yaw + Math.PI / 2 });
  c.prop('sled', Pw(5.8, -3.8).x, Pw(5.8, -3.8).z, { seed: 3, yaw: yaw + 0.8, opts: { variant: 'wood' } });
  c.prop('skis', Pw(-3.4, 2.4).x, Pw(-3.4, 2.4).z, { seed: 1, yaw: yaw + Math.PI, rot: [0.3, 0, 0], dy: 0.5 });
  c.prop('bucket', Pw(0.5, 4.6).x, Pw(0.5, 4.6).z, { seed: 2, rot: [0, 0, 1.4], dy: 0.2 });
  c.prop('sack', Pw(-1.3, 3.6).x, Pw(-1.3, 3.6).z, { seed: 3, yaw: 0.3 });
  c.prop('lantern', Pw(2.6, 4.5).x, Pw(2.6, 4.5).z, { seed: 2, rot: [0, 0, 1.45], dy: 0.1, opts: { mount: 'ground' } });
  c.prop('firewoodStack', Pw(-5.4, 3.4).x, Pw(-5.4, 3.4).z, { seed: 1, yaw: yaw + 0.2 });

  // snare lines along the trees to the north-east: three taut cords, only one caught anything
  const snares = [];
  [[-6, -9, 0.3, true], [-1, -11, -0.1, false], [5, -9.5, 0.5, false]].forEach(([lx, lz, a, hare]) => {
    const q = Pw(lx, lz);
    c.at(q.x, q.z, { yaw: yaw + a }, (k) => snareLine(k, { length: 3.0, hare }));
    snares.push(new THREE.Vector3(q.x, G.world.heightAt(q.x, q.z) + 0.8, q.z));
  });
  c.build();

  // wolf tracks: running past the cabin from the north, in a hurry (long, even stride), and away south
  const trk = smoothPath([[L.x - 12, L.z - 36], [L.x - 8, L.z - 22], [L.x - 4, L.z - 10], [L.x - 8, L.z + 2], [L.x - 12, L.z + 16], [L.x - 12, L.z + 34]], 1.6);
  groundRibbon(G, { pts: trk, width: 1.1, map: tex.tracks('wolf', 5), repeat: 9, lift: 0.04, opacity: 0.7, name: 'wolfRun', order: 4 });
  const trk2 = smoothPath([[L.x + 3, L.z - 30], [L.x + 4, L.z - 16], [L.x + 7, L.z - 4], [L.x + 14, L.z + 8], [L.x + 22, L.z + 22]], 1.6);
  groundRibbon(G, { pts: trk2, width: 1.1, map: tex.tracks('wolf', 8), repeat: 9, lift: 0.04, opacity: 0.6, name: 'wolfRun2', order: 4 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('hunterCabin', {
    id: 'hunterCabin',
    placed: p,
    walk: p.walk,
    door: door.clone(),
    diary: v(dt.x, dt.y + 0.1, dt.z), // note_trapper
    trap: v(tp.x, G.world.heightAt(tp.x, tp.z) + 0.1, tp.z),
    pelts,
    snares,
    fire: v(fp.x, G.world.heightAt(fp.x, fp.z), fp.z),
    axe: v(cb.x, G.world.heightAt(cb.x, cb.z) + 0.6, cb.z),
    tracks: { points: trk, kind: 'footprints' },
  });
  void cbh;
}
