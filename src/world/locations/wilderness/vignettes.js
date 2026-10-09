// Between places: small stories along the roads, one every 80 to 150 m. Wayside shrines (one with a horse skull
// on a pole, one with a milk bowl), a broken wheel in the ditch, cairns with red rags, an abandoned sledge with
// firewood and boot prints walking away from it, a fallen spruce across the forest track with a gap sawn
// through it, a hunter's blind above the road, a woodcutter's lean-to with frozen laundry, deer tracks with a
// wolf following, a raven on a snag over a carcass, a half-eaten goat on the mill road, a milestone, a drying
// rack on the shore road, pilgrims' cairns and an offering stump on the idol path.
// Every one is specific and small: a prop group of 6 to 20 pieces merged into a handful of draw calls.
//
// G.world.locations.vignettes:
//   list [{ id, type, road, x, y, z, label }], ravens [Vector3] (perches for the animals builder),
//   shrines [{ x, y, z, candle }], tracks [{ id, points, kind }] (senses trails), carcasses []
import * as THREE from 'three';
import { ROADS, LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf, alongPath, pathLength, spotOk, rockBlocks } from './compose.js';
import { cairn, fallenTree, gallowsTree, hunterBlind, leanTo, snareLine } from './objects.js';
import { coldFire, spearRack } from './objects2.js';
import { tex, groundRibbon } from './decals.js';

// [road id, arc length s, side (+1 / -1), offset from the center line, type, seed]
const PLAN = [
  ['pass', 135, 1, 9, 'shrine', 1],
  ['pass', 205, -1, 6.5, 'wheelDitch', 2],
  ['pass', 262, 1, 7, 'cairn', 3],
  ['pass', 332, -1, 8, 'sledge', 4],
  ['pass', 398, 1, 10, 'raven', 5],
  ['pass', 470, 0, 12, 'blind', 6],
  ['pass', 548, -1, 11, 'laundry', 7],
  ['pass', 622, 1, 8, 'shrineMilk', 8],
  ['pass', 695, 0, 0, 'tracks', 9],
  ['forest', 60, 0, 0, 'fallenTree', 10],
  ['forest', 118, 0, 0, 'tracksFox', 11],
  ['forest', 176, 1, 8, 'sledge', 12],
  ['forest', 236, -1, 7, 'cairnGrave', 13],
  ['forest', 300, 1, 8, 'shrineHorse', 14],
  ['forest', 352, -1, 9, 'raven', 15],
  ['forest', 412, 1, 6.5, 'wheelDitch', 16],
  ['mill', 72, 1, 7, 'milepost', 17],
  ['mill', 142, -1, 8, 'dryingRack', 18],
  ['mill', 218, 1, 11, 'blind', 19],
  ['mill', 292, 0, 6, 'carcassGoat', 20],
  ['mill', 362, -1, 8, 'shrine', 21],
  ['idol', 58, 1, 6, 'cairnPilgrim', 22],
  ['idol', 120, -1, 5, 'offeringStump', 23],
];

export async function build(W) {
  const { G } = W;
  const out = { list: [], ravens: [], shrines: [], tracks: [], carcasses: [] };
  const roads = Object.fromEntries(ROADS.map((r) => [r.id, r]));
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  let built = 0;

  for (const [rid, s0, side0, off0, type, seed] of PLAN) {
    const road = roads[rid];
    if (!road) continue;
    const len = pathLength(road.pts);
    const rnd = rngOf(seed * 977);
    let site = null;
    // find a clear spot: try nearby arc lengths and both sides, widening the offset a little
    for (const ds of [0, 6, -6, 12, -12, 20, -20, 30]) {
      for (const sg of side0 === 0 ? [0] : [side0, -side0]) {
        for (const doff of [0, 2.5, 5]) {
          const s = Math.max(5, Math.min(len - 5, s0 + ds));
          const a = alongPath(road.pts, s);
          if (!a) continue;
          const off = sg * (off0 + doff * Math.sign(sg || 1));
          const x = a.x + a.nx * off, z = a.z + a.nz * off;
          if (type !== 'tracks' && type !== 'tracksFox' && type !== 'fallenTree' && !spotOk(G, x, z, { rad: 2.2, maxSlope: type === 'blind' ? 0.8 : 0.5 })) continue;
          if (G.world.isLake(x, z) && type !== 'dryingRack') continue;
          if (nearLoc(x, z)) continue;
          site = { x, z, a, off, sg, s };
          break;
        }
        if (site) break;
      }
      if (site) break;
    }
    if (!site) { console.warn(`[vignettes] no site for ${type} on ${rid} near ${s0}`); continue; }
    try {
      const rec = await place(W, type, site, road, rnd, seed, out);
      if (rec) {
        out.list.push({ id: `${rid}_${type}_${seed}`, type, road: rid, ...rec });
        built++;
      }
    } catch (e) {
      console.warn(`[vignettes] ${type}`, e);
      G.errors.push(`vignette ${type}: ${e.message}`);
    }
    if (built % 3 === 0) await W.pause();
  }
  W.loc('vignettes', out);
  void v;
}

function nearLoc(x, z) {
  for (const l of Object.values(LOC)) {
    if (l === LOC.village || l === LOC.fishingHuts || l === LOC.square) continue;
    if (Math.hypot(x - l.x, z - l.z) < l.r + 6) return true;
  }
  return Math.hypot(x - LOC.village.x, z - LOC.village.z) < LOC.village.r + 4;
}

// ---------------------------------------------------------------------------------------------
async function place(W, type, site, road, rnd, seed, out) {
  const { G } = W;
  const { x, z, a } = site;
  const gy = G.world.heightAt(x, z);
  const faceRoad = Math.atan2(a.x - x, a.z - z); // +z of a prop points at the road
  const c = new Composer(G, W.ctx, `vig_${type}_${seed}`, x, z, { seed });
  const rec = { x, y: gy, z, label: type };
  const clear = (r) => W.clear(x, z, r);

  switch (type) {
    case 'shrine':
    case 'shrineMilk':
    case 'shrineHorse': {
      clear(4);
      const b = buildings.waysideShrine({ seed: 51 + seed, h: 2.4 + rnd.range(0, 0.6) });
      const p = placeBuilding(G, b, x, z, faceRoad + rnd.signed(0.3), { foundation: true, skirt: true, tag: 'waysideShrine' });
      for (const l of p.lights) W.light(l);
      const px = (lx, lz) => { const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw); return { x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs }; };
      const o1 = px(0.5, 1.0), o2 = px(-0.5, 1.3);
      c.prop('offering', o1.x, o1.z, { seed: 3, yaw: rnd.range(0, 6), opts: { variant: type === 'shrineMilk' ? 'bowl' : 'candle' }, collide: false });
      c.prop('offering', o2.x, o2.z, { seed: 5, yaw: rnd.range(0, 6), opts: { variant: type === 'shrineHorse' ? 'bread' : 'bowl' }, collide: false });
      if (type === 'shrineHorse') {
        const hp = px(-1.7, 0.4);
        c.prop('horseHead', hp.x, hp.z, { seed: 2, yaw: p.yaw + 0.2 });
        const bn = px(1.8, 0.8);
        c.prop('skull', bn.x, bn.z, { seed: 4, opts: { variant: 'wolf' }, yaw: 1 });
      }
      c.at(x, z, { yaw: p.yaw }, (k) => {
        k.hang('ribbon', 0.05, 0.5, { pos: [0.18, 1.5, 0.3], tint: 0x7a241a, sway: 0.8, wave: 0.03 });
        k.hang('ribbon', 0.05, 0.4, { pos: [-0.15, 1.45, 0.3], tint: 0x8a2a1e, sway: 0.8, wave: 0.03 });
      });
      c.build();
      const candle = p.anchors.shrine ? p.anchors.shrine.clone() : v3(x, gy + 1.8, z);
      out.shrines.push({ x, y: gy, z, candle, variant: type });
      return { ...rec, label: type === 'shrineHorse' ? 'Wayside shrine with a horse skull' : type === 'shrineMilk' ? 'Wayside shrine, a bowl of milk' : 'Wayside shrine' };
    }
    case 'wheelDitch': {
      clear(3);
      c.prop('cartWheel', x, z, { seed: 3, rot: [0.15, 0, 0.25], dy: -0.12 });
      c.at(x + 1.2, z + 0.6, { yaw: rnd.range(0, 6) }, (k) => {
        for (let i = 0; i < 3; i++) k.box('planks', 0.18, 0.04, rnd.range(0.8, 1.6), { pos: [i * 0.3, 0.05, rnd.signed(0.3)], rot: [0.1, rnd.range(0, 3), 0.2], tint: rnd.pick([0xc8b8a0, 0xb8a890]), grime: 0.3 });
        k.cyl('iron', 0.05, 0.04, 0.09, { pos: [-0.6, 0.05, 0.4], rot: [0, 0, 1.4], radial: 8, tint: 0x6a6a70 });
        k.mound(1.4, 0.18, 1.0, { pos: [0.2, 0.0, 0.0], jseed: 2 });
      });
      c.prop('sack', x - 1.0, z - 0.8, { seed: 2, yaw: 2.0, rot: [0, 0, 0.8], dy: 0.1 });
      c.build();
      return { ...rec, label: 'Broken cart wheel in the ditch' };
    }
    case 'cairn':
    case 'cairnGrave':
    case 'cairnPilgrim': {
      clear(3);
      const blocks = [{ v: 0, x, y: gy - 0.2, z, s: [1.1, 0.8, 1.0], ry: rnd.range(0, 6), embed: 0.3 }];
      if (type !== 'cairn') blocks.push({ v: 2, x: x + 1.6, y: gy - 0.2, z: z - 0.6, s: [0.6, 0.45, 0.55], ry: 1 });
      rockBlocks(G, blocks, { tone: 0.85, name: `${type}Rock` });
      c.at(x, z, { y: gy + 0.45 }, (k) => cairn(k, { n: type === 'cairn' ? 7 : 6, scale: 1.2, rag: type !== 'cairnGrave' }));
      c.at(x + 1.6, z - 0.6, { y: gy + 0.2 }, (k) => cairn(k, { n: 4, scale: 0.8 }));
      if (type === 'cairnGrave') {
        c.prop('gravePostSmall', x - 1.3, z + 0.9, { seed: 2, yaw: faceRoad });
        c.prop('offering', x - 0.8, z + 1.5, { seed: 6, yaw: 0.4, opts: { variant: 'bread' }, collide: false });
      }
      if (type === 'cairnPilgrim') c.prop('ribbonPole', x - 1.5, z + 0.6, { seed: 3, opts: { height: 2.2, ribbons: 6 } });
      c.build();
      return { ...rec, label: type === 'cairnGrave' ? 'A traveller\'s grave under stones' : 'Cairn with a red rag' };
    }
    case 'sledge': {
      clear(4);
      c.prop('sled', x, z, { seed: 2, yaw: faceRoad + 0.5, rot: [0.05, 0, 0.08], opts: { variant: 'wood' } });
      c.prop('firewoodStack', x + 1.6, z - 0.8, { seed: 3, yaw: faceRoad + 1.2 });
      c.prop('choppingBlock', x - 1.8, z + 0.6, { seed: 2, yaw: 0.4 });
      c.at(x, z, { yaw: faceRoad + 0.5 }, (k) => {
        k.tube('rope', [[0, 0.1, 1.0], [0.4, 0.04, 1.8], [1.4, 0.02, 2.6], [2.4, 0.02, 3.2]], 0.014, { radial: 4, tint: 0xa8946a });
        k.mound(1.2, 0.2, 2.2, { pos: [0.2, 0.0, 0.0], jseed: 4 });
      });
      c.build();
      // boot prints walking off toward the road, then nothing
      const pts = [[x + 0.8, z + 1.8], [a.x + a.nx * 2, a.z + a.nz * 2], [a.x - a.tx * 8, a.z - a.tz * 8]];
      const trail = groundRibbon(G, { pts, width: 0.7, map: tex.tracks('boot', 3), repeat: 7, lift: 0.04, opacity: 0.8, name: 'sledgeSteps', order: 4 });
      void trail;
      out.tracks.push({ id: `sledge_${seed}`, points: pts, kind: 'footprints' });
      return { ...rec, label: 'Abandoned sledge with firewood' };
    }
    case 'raven': {
      clear(3);
      // a snag with a raven perch over a carcass; use a vegetation snag if one is near, else raise one
      let perch = null;
      const snags = G.vegetation?.snagsNear?.(x, z, 22) || [];
      if (snags.length) {
        const sn = snags.sort((p1, p2) => Math.hypot(p1.x - x, p1.z - z) - Math.hypot(p2.x - x, p2.z - z))[0];
        perch = v3(sn.x, sn.top ?? sn.y + 5, sn.z);
      } else {
        let tip = null;
        c.at(x, z, { yaw: rnd.range(0, 6), dy: -0.1 }, (k) => { tip = gallowsTree(k, { scale: 0.7 }).tip; });
        perch = v3(x + tip[0], gy + tip[1], z + tip[2] * 0.5);
        c.circle(x, z, 0.4, gy - 1, gy + 5, 'snag');
      }
      c.at(x + 2.2, z + 1.0, { yaw: rnd.range(0, 6) }, (k) => carcass(k, rnd, 'deer'));
      c.build();
      out.ravens.push(perch);
      out.carcasses.push(v3(x + 2.2, gy, z + 1.0));
      return { ...rec, label: 'Raven on a dead tree', perch };
    }
    case 'blind': {
      clear(4.5);
      c.at(x, z, { yaw: faceRoad }, (k) => hunterBlind(k));
      c.at(x - Math.sin(faceRoad) * 3.2, z - Math.cos(faceRoad) * 3.2, { yaw: 0.5 }, (k) => coldFire(k, { r: 0.45 }));
      c.build();
      return { ...rec, label: 'Hunter\'s blind above the road' };
    }
    case 'laundry': {
      clear(5);
      c.at(x, z, { yaw: faceRoad }, (k) => leanTo(k, { width: 3.4, depth: 2.2 }));
      c.prop('laundryLine', x + Math.cos(faceRoad) * 3.8, z - Math.sin(faceRoad) * 3.8, { seed: 2, yaw: faceRoad + 1.5 + Math.PI / 2, opts: { length: 3.4 } });
      c.prop('choppingBlock', x - Math.cos(faceRoad) * 3.2, z + Math.sin(faceRoad) * 3.2 + 1.8, { seed: 3, yaw: 0.3 });
      c.prop('woodpile', x - Math.cos(faceRoad) * 4.6, z + Math.sin(faceRoad) * 4.6, { seed: 3, yaw: faceRoad });
      c.prop('bucket', x + Math.sin(faceRoad) * 2.4, z + Math.cos(faceRoad) * 2.4, { seed: 2, rot: [0, 0, 1.3], dy: 0.2 });
      c.build();
      return { ...rec, label: 'Woodcutter\'s lean-to, laundry frozen on the line' };
    }
    case 'tracks':
    case 'tracksFox': {
      // deer crossing the road with a wolf (or fox) a few steps behind: two ribbons, ~40 m long
      const n = { x: a.nx, z: a.nz };
      const mk = (off0, kind, seedT, width) => {
        const pts = [];
        for (let i = -4; i <= 4; i++) {
          const t = i / 4;
          pts.push([a.x + n.x * 20 * t + a.tx * (off0 + Math.sin(t * 3 + seedT) * 2), a.z + n.z * 20 * t + a.tz * (off0 + Math.sin(t * 3 + seedT) * 2)]);
        }
        groundRibbon(G, { pts, width, map: tex.tracks(kind, seedT), repeat: 6, lift: 0.04, opacity: 0.8, name: `${kind}Tracks`, order: 4 });
        return pts;
      };
      const p1 = mk(0, type === 'tracks' ? 'deer' : 'hare', 4, 1.1);
      const p2 = mk(-5, type === 'tracks' ? 'wolf' : 'fox', 7, 1.1);
      out.tracks.push({ id: `${type}_${seed}_a`, points: p1, kind: 'footprints' }, { id: `${type}_${seed}_b`, points: p2, kind: 'footprints' });
      return { ...rec, x: a.x, y: G.world.heightAt(a.x, a.z), z: a.z, label: type === 'tracks' ? 'Deer tracks, a wolf behind' : 'Hare and fox tracks' };
    }
    case 'fallenTree': {
      clear(8);
      const yawT = Math.atan2(-a.nz, a.nx);
      c.at(a.x, a.z, { yaw: yawT, dy: 0 }, (k) => fallenTree(k, { length: 11.5, gap: 3.4 }));
      c.build();
      return { ...rec, x: a.x, y: G.world.heightAt(a.x, a.z), z: a.z, label: 'Fallen spruce across the track, a gap sawn through' };
    }
    case 'carcassGoat': {
      clear(4);
      c.at(a.x + a.nx * 5, a.z + a.nz * 5, { yaw: rnd.range(0, 6) }, (k) => carcass(k, rnd, 'goat'));
      c.build();
      const pts = [[a.x + a.nx * 5 + 16, a.z + a.nz * 5 + 4], [a.x + a.nx * 5 + 6, a.z + a.nz * 5 + 1], [a.x + a.nx * 5, a.z + a.nz * 5], [a.x + a.nx * 5 - 10, a.z + a.nz * 5 - 8]];
      groundRibbon(G, { pts, width: 1.2, map: tex.tracks('wolf', 12), repeat: 7, lift: 0.04, opacity: 0.8, name: 'goatTracks', order: 4 });
      out.tracks.push({ id: `goat_${seed}`, points: pts, kind: 'footprints' });
      out.carcasses.push(v3(a.x + a.nx * 5, G.world.heightAt(a.x + a.nx * 5, a.z + a.nz * 5), a.z + a.nz * 5));
      return { ...rec, x: a.x + a.nx * 5, z: a.z + a.nz * 5, label: 'Half-eaten goat, wolf tracks' };
    }
    case 'milepost': {
      clear(2.5);
      c.at(x, z, { yaw: faceRoad + 0.2 }, (k) => {
        k.box('stone', 0.42, 1.25, 0.3, { pos: [0, 0.6, 0], rot: [0.02, 0, 0.04], tint: 0xa8a29a, taper: [0.8, 0.8], grime: 0.4 });
        for (let i = 0; i < 5; i++) k.box('paint', 0.22, 0.02, 0.01, { pos: [0, 0.35 + i * 0.12, 0.155], tint: 0x2a2622, grime: 0 });
        k.box('paint', 0.03, 0.26, 0.01, { pos: [0.06, 0.95, 0.155], rot: [0, 0, 0.5], tint: 0x2a2622, grime: 0 });
        k.mound(0.5, 0.08, 0.4, { pos: [0, 1.24, 0], jseed: 3 });
        k.mound(0.9, 0.12, 0.8, { pos: [0, 0, 0], jseed: 4 });
      });
      c.build();
      return { ...rec, label: 'Milestone' };
    }
    case 'dryingRack': {
      clear(3);
      c.prop('dryingRack', x, z, { seed: 2, yaw: faceRoad + Math.PI / 2 });
      c.prop('fishBasket', x + 2.0, z + 0.4, { seed: 2, yaw: 0.5 });
      c.prop('bucket', x - 1.6, z + 0.8, { seed: 3, rot: [0, 0, 1.4], dy: 0.2 });
      c.build();
      return { ...rec, label: 'Fish drying rack by the shore road' };
    }
    case 'offeringStump': {
      clear(2.5);
      c.prop('stump', x, z, { seed: 3, opts: { height: 0.6 } });
      c.prop('offering', x + 0.05, z + 0.05, { seed: 4, y: gy + 0.62, opts: { variant: 'bowl' }, collide: false });
      c.at(x, z, { yaw: faceRoad }, (k) => {
        k.hang('ribbon', 0.05, 0.4, { pos: [0.2, 0.6, 0.1], tint: 0x7a241a, sway: 0.7, wave: 0.03 });
        k.mound(0.8, 0.06, 0.8, { pos: [0, 0, 0], jseed: 4 });
      });
      c.build();
      return { ...rec, label: 'Offering on a stump' };
    }
    default:
      return null;
  }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// A carcass half buried in a drift: deer or goat, ribs showing through the torn flank.
function carcass(k, rnd, kind) {
  const s = kind === 'goat' ? 0.7 : 1.0;
  k.push({ scale: s });
  const hide = kind === 'goat' ? 0xb8b0a0 : 0x7a6a58;
  k.blob('matte', 1, { pos: [0, 0.3, 0], scale: [0.42, 0.26, 0.82], detail: 2, tint: hide, jitter: 0.03, grime: 0.15 });
  k.blob('matte', 1, { pos: [0.1, 0.28, 0.75], scale: [0.22, 0.2, 0.3], detail: 1, tint: hide, jitter: 0.02 });
  k.tube('matte', [[0.05, 0.3, 0.7], [0.15, 0.22, 1.05], [0.2, 0.14, 1.3]], 0.11, { radial: 6, tint: hide, grime: 0.15 });
  k.blob('matte', 1, { pos: [0.22, 0.12, 1.42], scale: [0.1, 0.09, 0.2], detail: 1, tint: hide });
  // torn flank: red-black cavity and pale ribs
  k.blob('matte', 1, { pos: [0.18, 0.4, -0.05], scale: [0.2, 0.1, 0.4], detail: 1, tint: 0x4a1c18, grime: 0, nosnow: true });
  for (let i = 0; i < 6; i++) k.tube('face', [[0.1, 0.46, -0.28 + i * 0.1], [0.3, 0.43, -0.28 + i * 0.1], [0.4, 0.3, -0.26 + i * 0.1]], 0.012, { radial: 4, tint: 0xd8d0be, grime: 0 });
  for (const [lx, lz, up] of [[0.3, 0.45, 0.0], [0.25, 0.2, 0.0], [0.3, -0.5, 0.0], [-0.1, -0.7, 0.0]]) {
    k.tube('matte', [[lx, 0.2, lz], [lx + 0.4, 0.28, lz + 0.1], [lx + 0.7, 0.2 + up, lz + 0.25]], 0.032, { radial: 5, tint: 0x4a3c32 });
  }
  k.mound(0.9, 0.18, 1.5, { pos: [-0.15, 0.4, 0.0], jseed: 3 });
  k.mound(1.4, 0.2, 2.0, { pos: [-0.4, 0.0, 0.2], jseed: 5 });
  k.pop();
  void rnd;
}

void snareLine; void spearRack; void rockBlocks;
