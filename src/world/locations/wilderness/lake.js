// Lake set pieces (LOC.iceCamp, LOC.ritual) and the boats frozen near the shores.
//
// Ice-fishing camp: three holes cut in the ice (G.water.addHole) with their rods, the faint scuffed rings
// where three stools stood and one overturned stool, a windbreak with its hide flapping, a cold fire pit,
// a tilted bucket with frozen fish, the fishermen's tent and sled, a lantern left burning on its side, loose
// straw, the darned mitten, and two furrows (heels) running off north toward the poles.
// Ritual site: a ring of birch ribbon poles, the old hole frozen over as a faint milky circle with thin-ice
// cracks around it, a few offerings, and the hole the rite will cut (story opens it later).
//
// G.world.locations.iceCamp:  center, holes[3] { x, z, id }, stoolSpots[3], overturnedStool, mitten (clue), windbreak,
//                             lantern, campfire, straw[], drag { points[[x,z]], from, to } (senses trail: kind 'drag')
// G.world.locations.ritual:   center, ring { radius, poles[] }, oldHole { x, z, r } (echo spot), hole { x, z, r, open(), close(), steam },
//                             echo (clue position), approach (from the shore), offerings[]
// G.world.locations.boats:    [{ x, z, yaw }]
import * as THREE from 'three';
import { LOC, LAKE } from '../../layout.js';
import { Composer, rngOf, rot2, smoothPath } from './compose.js';
import { coldFire } from './objects2.js';
import { mitten } from './objects.js';
import { tex, icePlane, groundRibbon } from './decals.js';

export async function build(W) {
  await iceCamp(W);
  await W.pause();
  await ritual(W);
  await W.pause();
  await boats(W);
}

// ---------------------------------------------------------------------------------------------
async function iceCamp(W) {
  const { G } = W;
  const L = LOC.iceCamp;
  const rnd = rngOf(1105);
  const c = new Composer(G, W.ctx, 'iceCamp', L.x, L.z, { seed: 5, y: 0 });
  const P = (dx, dz) => ({ x: L.x + dx, z: L.z + dz });

  // holes: three in a loose triangle, stools once beside each (all gone but one, overturned)
  const holes = [P(-2.6, -1.4), P(0.8, 1.9), P(3.5, -2.2)].map((h, i) => {
    const id = G.water?.addHole?.(h.x, h.z, 0.3);
    c.prop('iceFishingHole', h.x, h.z, { seed: i + 1, opts: { rod: i !== 1, radius: 0.28 }, collide: false, dy: 0.012 });
    return { ...h, id: id ?? -1 };
  });
  const stoolSpots = holes.map((h, i) => {
    const a = 0.9 + i * 2.1;
    return { x: h.x + Math.cos(a) * 0.95, z: h.z + Math.sin(a) * 0.95 };
  });
  stoolSpots.forEach((s, i) => {
    if (i === 1) return; // the overturned one lies here instead
    icePlane(G, { x: s.x, z: s.z, w: 0.75, d: 0.75, map: tex.stoolMark(), opacity: 0.9, lift: 0.011, name: 'stoolMark' });
  });
  const os = stoolSpots[1];
  c.prop('fishingStool', os.x + 0.15, os.z - 0.1, { seed: 3, rot: [0, 0, Math.PI - 0.35], dy: 0.34, yaw: 0.9, opts: { variant: 'legs' }, collide: false });
  icePlane(G, { x: os.x, z: os.z, w: 0.7, d: 0.7, map: tex.stoolMark(), opacity: 0.7, lift: 0.011, name: 'stoolMark' });

  // windbreak on the west side, its hide torn loose and flapping
  const wb = P(-5.4, 0.3);
  c.prop('windbreak', wb.x, wb.z, { yaw: -Math.PI / 2, opts: { noHide: true }, seed: 2, collide: true });
  c.at(wb.x, wb.z, { yaw: -Math.PI / 2 }, (k) => {
    k.hang('cloth', 1.5, 1.05, { pos: [0.1, 1.36, 0.09], tint: 0x8a7860, sway: 1.5, wave: 0.12, sy: 6, grime: 0.1 });
    k.hang('cloth', 0.5, 0.55, { pos: [-1.2, 1.35, 0.1], tint: 0x7a6a56, sway: 1.8, wave: 0.1, sy: 4, grime: 0.1 });
  });

  // a cold fire pit, bucket and spilled fish, the tent, sled and net
  const fp = P(5.0, 4.4);
  c.at(fp.x, fp.z, { yaw: 0.3 }, (k) => coldFire(k, { r: 0.6 }));
  const bk = P(2.6, 3.4);
  c.prop('bucket', bk.x, bk.z, { seed: 2, rot: [0, 0, 1.45], dy: 0.22, yaw: 0.4 });
  c.at(bk.x, bk.z, { yaw: 0.4 }, (k) => {
    for (let i = 0; i < 5; i++) k.blob('fish', 0.06, { pos: [0.18 + i * 0.1 + rnd.signed(0.04), 0.03, -0.1 + rnd.signed(0.2)], scale: [2.8, 0.34, 0.9], rot: [0, rnd.range(0, 6.28), 0], detail: 0, flat: true, tint: rnd.pick([0xc8d0d4, 0xb4bcc2, 0xd6dce0]), grime: 0 });
    k.mound(0.5, 0.025, 0.4, { pos: [0.35, 0.05, 0.0], jseed: 3 });
  });
  const tn = P(-9.2, -4.2);
  c.prop('tent', tn.x, tn.z, { yaw: 0.5, seed: 1, opts: { variant: 'aframe' } });
  const sl = P(-8.6, 2.8);
  c.prop('sled', sl.x, sl.z, { yaw: 1.3, seed: 2, opts: { variant: 'wood' } });
  c.prop('net', P(-2.2, 6.2).x, P(-2.2, 6.2).z, { yaw: 0.7, seed: 1, opts: { variant: 'heap' } });
  c.prop('fishBasket', P(1.6, -4.6).x, P(1.6, -4.6).z, { seed: 3, yaw: 0.3 });

  // the darned mitten, a lost cap button... and loose straw drifting off toward the north
  const mt = P(-3.6, 2.9);
  c.at(mt.x, mt.z, { yaw: 2.2, y: 0.005 }, (k) => mitten(k));
  const strawPts = [];
  for (let i = 0; i < 22; i++) {
    const t = i / 22, sx = L.x + 4 + t * 24 + rnd.signed(2.0), sz = L.z - 3 - t * 12 + rnd.signed(2.0);
    strawPts.push({ x: sx, z: sz });
  }
  c.at(L.x, L.z, { y: 0 }, (k) => {
    for (const s of strawPts) {
      const n = 2 + (rnd.range(0, 3) | 0);
      for (let j = 0; j < n; j++) k.blade('straw', 0.025, rnd.range(0.25, 0.5), { pos: [s.x - L.x + rnd.signed(0.5), 0.012, s.z - L.z + rnd.signed(0.5)], rot: [-Math.PI / 2, 0, rnd.range(0, 6.28)], tint: rnd.pick([0xe8d9a6, 0xdcc98c, 0xd0bd7c]), var: 0.1, grime: 0 });
    }
  });
  // a lantern left burning on its side beside the third hole
  const ln = { x: holes[2].x - 0.9, z: holes[2].z + 1.0 };
  c.prop('lantern', ln.x, ln.z, { seed: 1, rot: [0, 0, 1.45], dy: 0.1, opts: { mount: 'ground' }, collide: false });
  c.build();
  W.fx?.glow?.({ position: [ln.x, 0.2, ln.z], parent: G.scene, size: 1.1, color: [1.0, 0.6, 0.25], strength: 0.8, light: false });
  W.light({ x: ln.x, y: 0.3, z: ln.z, color: 0xffa860, intensity: 0.9, radius: 7, kind: 'lantern' });

  // furrows: two lines heel-dragged north toward the poles, with a wobble
  const dragPts = smoothPath([[L.x + 1.0, L.z - 3.2], [L.x + 5, L.z - 8], [L.x + 12, L.z - 13], [L.x + 21, L.z - 18], [L.x + 32, L.z - 21], [L.x + 45, L.z - 24], [L.x + 58, L.z - 27], [LOC.ritual.x - 14, LOC.ritual.z + 2]], 1.5);
  groundRibbon(G, { pts: dragPts, width: 1.0, map: tex.drag(5), repeat: 5, lift: 0.014, opacity: 0.85, name: 'dragMarks', order: 5 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('iceCamp', {
    id: 'iceCamp',
    center: v(L.x, 0, L.z),
    holes,
    stoolSpots: stoolSpots.map((s) => v(s.x, 0, s.z)),
    overturnedStool: v(os.x + 0.15, 0.15, os.z - 0.1),
    mitten: v(mt.x, 0.08, mt.z), // senses clue: the darned mitten
    windbreak: v(wb.x, 0.8, wb.z),
    lantern: v(ln.x, 0.2, ln.z),
    campfire: v(fp.x, 0, fp.z),
    tent: v(tn.x, 0, tn.z),
    straw: strawPts.slice(0, 6).map((s) => v(s.x, 0.02, s.z)),
    drag: { points: dragPts, from: v(L.x + 1, 0, L.z - 3.2), to: v(LOC.ritual.x - 14, 0, LOC.ritual.z + 2), kind: 'drag' },
  });
}

// ---------------------------------------------------------------------------------------------
async function ritual(W) {
  const { G } = W;
  const L = LOC.ritual;
  const rnd = rngOf(3010);
  const c = new Composer(G, W.ctx, 'ritual', L.x, L.z, { seed: 9, y: 0 });
  const R = 12.5;
  const poles = [];
  const N = 15;
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / N) * Math.PI * 2; // a gap faces the shore (south, +z)
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.2) continue;
    const x = L.x + Math.cos(a) * R + rnd.signed(0.5), z = L.z + Math.sin(a) * R + rnd.signed(0.5);
    c.prop('ribbonPole', x, z, { seed: i + 1, opts: { height: 3.3 + rnd.range(0, 0.5), ribbons: 11 }, yaw: rnd.range(0, 6.28) });
    poles.push({ x, z });
  }
  // the old hole, frozen over: a faint scar offset a little from the center
  const oh = { x: L.x + 1.2, z: L.z - 0.8, r: 1.9 };
  icePlane(G, { x: oh.x, z: oh.z, w: 7.2, d: 7.2, yaw: 0.4, map: tex.oldHole(4), opacity: 0.95, name: 'oldHole', lift: 0.012 });
  icePlane(G, { x: oh.x, z: oh.z, w: 20, d: 20, yaw: 1.1, map: tex.crackStar(3), opacity: 0.28, name: 'thinIce', lift: 0.011 });
  // offerings left at the edge by people who should not have come: bread, a candle stub, a red ribbon
  const offers = [];
  for (const [dx, dz, v] of [[-3.8, 1.6, 'candle'], [-3.2, 2.4, 'bread'], [3.9, 2.2, 'bowl']]) {
    const x = oh.x + dx, z = oh.z + dz;
    c.prop('offering', x, z, { seed: offers.length + 3, yaw: rnd.range(0, 6.28), opts: { variant: v }, dy: 0.0 });
    offers.push(new THREE.Vector3(x, 0.1, z));
  }
  c.at(oh.x - 2.4, oh.z + 3.4, { yaw: 0.2 }, (k) => {
    k.hang('ribbon', 0.05, 0.45, { pos: [0, 0.01, 0], tint: 0x7a241a, sway: 0.0, wave: 0.0 });
    k.plane('ribbon', 0.05, 0.4, { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0.9], tint: 0x7a241a, grime: 0, var: 0.02 });
  });
  c.build();

  // the hole the rite will cut: opened by the story with open(); a steam column rises when open
  let holeId = -1, steam = null;
  const hole = {
    x: oh.x, z: oh.z, r: 0.95,
    open() {
      if (holeId < 0) holeId = G.water?.addHole?.(oh.x, oh.z, 0.95) ?? -1;
      if (!steam && W.fx?.steam) steam = W.fx.steam({ position: [oh.x, 0.1, oh.z], parent: G.scene, height: 5, rate: 7, spread: 0.6, opacity: 0.42 });
      steam?.setActive(true);
      return holeId;
    },
    close() {
      if (holeId >= 0) G.water?.removeHole?.(holeId);
      holeId = -1;
      steam?.setActive(false);
    },
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('ritual', {
    id: 'ritual',
    center: v(L.x, 0, L.z),
    ring: { radius: R, poles },
    oldHole: oh,
    echo: v(oh.x, 0.05, oh.z), // senses echo clue (C4)
    hole,
    approach: v(L.x, 0, L.z + R + 6), // the procession arrives here from the shore
    offerings: offers,
  });
}

// ---------------------------------------------------------------------------------------------
async function boats(W) {
  const { G } = W;
  const rnd = rngOf(88);
  const out = [];
  const c = new Composer(G, W.ctx, 'boats', LAKE.x, LAKE.z, { seed: 31, y: 0 });
  // angle (0 = east, +pi/2 = south), inset meters inside the shore
  const spots = [[0.12, 7, 'frozen'], [4.15, 6, 'frozen'], [2.7, 6.5, 'frozen'], [3.55, 5, 'overturned']];
  for (const [a, inset, variant] of spots) {
    let p = null;
    for (let r = 1.25; r > 0.3; r -= 0.004) {
      const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
      if (G.world.lakeSDF(x, z) < -inset) { p = { x, z }; break; }
    }
    if (!p) continue;
    const yaw = rnd.range(0, 6.28);
    c.prop('boat', p.x, p.z, { seed: out.length + 1, yaw, opts: { variant }, y: variant === 'overturned' ? G.world.heightAt(p.x, p.z) : 0 });
    out.push({ x: p.x, z: p.z, yaw, variant });
  }
  c.build();
  W.loc('boats', { list: out });
  void rot2;
}
