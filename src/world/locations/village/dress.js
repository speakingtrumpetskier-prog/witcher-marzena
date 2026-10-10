// Dressing: every porch, yard, street and hero place gets props through ONE PropBatch (merged per
// material, so the whole village costs a few dozen draw calls). A spot manager keeps props off roads,
// walls, fences, the lake and tree trunks. Other files add their own places:
//   dress_heroes.js (longhouse, tavern, smithy, shrine, workshop, banya, Hanka, square, gates)
//   dress_edges.js  (shore, graveyard, sled hill, fields, forest edge)
import * as THREE from 'three';
import { distToSegment } from '../../../core/util.js';
import { frame, inRect, roadGap, seeded, tick } from './util.js';
import { buildRibbons } from './paths.js';
import { dressHeroes } from './dress_heroes.js';
import { dressEdges } from './dress_edges.js';
import { dressStreets } from './dress_streets.js';
import { dressLanes } from './dress_lanes.js';
import { nearestRoad, ENCOUNTER_SPOTS } from '../../layout.js';
import { SQUARE } from './plan.js';

const PI = Math.PI;

function makeSpots(V) {
  const { G } = V;
  const used = [];
  const D = {
    V, G, used,
    named: {},
    handles: [],
    batch: null,
    add(name, x, z, o = {}) {
      const h = D.batch.add(name, x, z, o);
      D.handles.push(h);
      if (o.id) D.named[o.id] = h;
      return h;
    },
    // true when a prop of radius r fits at (x, z); `why` is the reason it does not (for the debug log)
    free(x, z, r = 0.6, o = {}) { return !D.blocked(x, z, r, o); },
    // o.noRects: skip the building footprints (ground cover laid by a door: planks, mats)
    blocked(x, z, r = 0.6, o = {}) {
      if (roadGap(x, z) < r + (o.roadPad ?? 0.5)) return 'road';
      if (G.world.lakeSDF(x, z) < (o.lake ?? 0.8)) return 'lake';
      if (!o.noRects) {
        for (const s of V.placed) {
          if (s.meta.prop && !o.vsProps) continue;
          if (inRect(x, z, s.rect.x, s.rect.z, s.rect.hw, s.rect.hd, s.rect.yaw, r + 0.2)) return `building ${s.id}`;
        }
      }
      for (const u of used) if (Math.hypot(u.x - x, u.z - z) < u.r + r) return `prop at ${u.x.toFixed(0)},${u.z.toFixed(0)}`;
      for (const b of V.barriers || []) {
        for (let i = 0; i < b.length - 1; i++) {
          if (distToSegment(x, z, b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]).d < r + 0.5) return 'fence';
        }
      }
      if (!o.trees && G.vegetation?.treeAt?.(x, z, r)) return 'tree';
      return null;
    },
    claim(x, z, r) { used.push({ x, z, r }); },
    // place the first candidate [x, z, yaw?] that fits; returns the handle or null
    tryPut(name, cands, o = {}, r = 0.7) {
      for (const c of cands) {
        if (D.free(c[0], c[1], r, o)) {
          D.claim(c[0], c[1], r);
          return D.add(name, c[0], c[1], { yaw: c[2] ?? 0, ...o });
        }
      }
      D.fails.push(`${name}@${cands[0][0].toFixed(0)},${cands[0][1].toFixed(0)}(${D.blocked(cands[0][0], cands[0][1], r, o)})`);
      return null;
    },
    fails: [],
    // place unconditionally (hero places where the spot is planned by hand)
    put(name, x, z, o = {}, r = 0.5) {
      D.claim(x, z, r);
      return D.add(name, x, z, o);
    },
  };
  return D;
}

// ---------------------------------------------------------------------------------------------
// Houses: porch clutter (at least 3 props), a woodpile, one story object, drifts, a path to the street.
const PORCH_POOL = ['bucket', 'sled', 'skis', 'snowShovel', 'tools', 'washTub', 'barrel', 'crate', 'sack', 'jug', 'lantern', 'wheelbarrow', 'fishBasket'];
const STORIES = ['cart', 'snowman', 'laundry', 'chop', 'haystack', 'kennel', 'beehive', 'sleds', 'tub', 'boat', 'toys', 'drying'];

function dressHouse(D, rec, index) {
  const { V } = D;
  const rng = seeded(`house:${rec.id}`);
  const doorRec = rec.p.doors.find((d) => d.id === 'front') || rec.p.doors[0];
  if (!doorRec) return;
  const F = frame(doorRec.x, doorRec.z, doorRec.yaw);
  const porch = !!rec.meta.o?.porch;
  const wallBack = (lz) => F.at(0, lz);
  void wallBack;

  // ----- porch / doorstep clutter -----
  const slots = porch
    ? [[-2.6, 0.7], [2.6, 0.7], [-3.0, 1.7], [3.0, 1.7], [-2.3, 2.6], [2.3, 2.6], [-1.2, 2.7], [1.2, 2.7]]
    : [[-1.9, 0.5], [1.9, 0.5], [-2.7, 0.9], [2.7, 0.9], [-1.1, 1.3], [1.1, 1.3], [-3.4, 0.6], [3.4, 0.6]];
  const items = ['firewoodStack'];
  const pool = [...PORCH_POOL];
  for (let i = 0; i < 3 + (rng() < 0.5 ? 1 : 0); i++) items.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const order = rng() < 0.5 ? slots : [...slots].reverse();
  let si = 0;
  for (const name of items) {
    for (; si < order.length; si++) {
      const [lx, lz] = order[si];
      const [x, z] = F.at(lx, lz);
      if (!D.free(x, z, 0.5, { roadPad: 0.3 })) continue;
      D.claim(x, z, 0.5);
      const wall = name === 'firewoodStack' || name === 'tools' || name === 'snowShovel' || name === 'skis' || name === 'sled';
      const o = { yaw: F.yaw + (wall ? 0 : (rng() - 0.5) * 1.2) + (name === 'sled' ? PI / 2 * (rng() < 0.5 ? 1 : -1) : 0), seed: Math.floor(rng() * 4) };
      if (name === 'lantern') o.opts = { mount: 'ground' };
      if (name === 'bucket' || name === 'barrel') o.scale = 0.9 + rng() * 0.2;
      D.add(name, x, z, o);
      si++;
      break;
    }
  }

  // a bench on the porch deck for the elders (station porch_bench_<id>)
  if (porch) {
    const sg = rec.id.length % 2 ? 1 : -1;
    const [bx, bz] = F.at(sg * 1.2, 0.9);
    D.add('bench', bx, bz, { snap: false, y: rec.p.y + 0.22, yaw: F.yaw, collide: false, opts: { length: 1.3 } });
  }

  // ----- the yard: side or back -----
  const c = frame(rec.x, rec.z, rec.yaw);
  const hw = rec.fp.hw, hd = rec.fp.hd;
  const sideSign = rng() < 0.5 ? 1 : -1;
  const yardCands = [];
  for (const sg of [sideSign, -sideSign]) for (const dz of [0.5, -1.8, 2.2]) yardCands.push([sg * (hw + 3.2 + rng() * 0.8), dz]);
  yardCands.push([sideSign * 1.5, -(hd + 3.0)], [-sideSign * 2.0, -(hd + 3.4)]);
  const cands = yardCands.map(([lx, lz]) => { const [x, z] = c.at(lx, lz); return [x, z, rec.yaw + (rng() - 0.5) * 1.4]; });

  // woodpile against the house side / back
  const wp = [];
  for (const sg of [-sideSign, sideSign]) wp.push(c.at(sg * (hw + 1.1), -hd * 0.3 + rng()), c.at(sg * (hw + 1.1), hd * 0.5));
  wp.push(c.at(1.8, -(hd + 1.2)), c.at(-1.8, -(hd + 1.2)));
  D.tryPut('woodpile', wp.map(([x, z]) => [x, z, rec.yaw + (wp.length % 2 ? PI / 2 : 0)]), { seed: Math.floor(rng() * 4) }, 1.0);

  const story = STORIES[(index * 5 + Math.floor(rng() * 3)) % STORIES.length];
  const at = (n) => cands[n % cands.length];
  const tp = (name, n, o = {}, r = 1.0) => D.tryPut(name, cands.slice(n).concat(cands.slice(0, n)), o, r);
  switch (story) {
    case 'cart': tp('cart', 0, { opts: { variant: rng() < 0.5 ? 'empty' : 'firewood' }, align: 0.2 }, 1.6); break;
    case 'snowman': tp('snowman', 1, {}, 0.7); tp('toys', 2, {}, 0.5); break;
    case 'laundry': tp('laundryLine', 0, { opts: { length: 4.5 } }, 2.4); break;
    case 'chop': tp('choppingBlock', 0, {}, 0.7); tp('logs', 1, {}, 0.8); break;
    case 'haystack': tp('haystack', 0, {}, 1.5); tp('hayBale', 2, {}, 0.6); break;
    case 'kennel': tp('dogKennel', 1, {}, 0.9); tp('bucket', 2, {}, 0.4); break;
    case 'beehive': tp('beehive', 1, {}, 0.6); tp('beehive', 2, {}, 0.6); break;
    case 'sleds': tp('sled', 0, { yaw: rec.yaw }, 0.9); tp('sled', 2, {}, 0.9); tp('skis', 1, {}, 0.5); break;
    case 'tub': tp('washTub', 0, {}, 0.7); tp('barrel', 1, {}, 0.5); tp('crateStack', 2, {}, 0.8); break;
    case 'boat': tp('boat', 0, { opts: { variant: 'overturned' } }, 1.8); break;
    case 'toys': tp('toys', 0, {}, 0.5); tp('snowman', 2, {}, 0.7); break;
    default: tp('dryingRack', 0, {}, 1.3); break;
  }
  void at;
  // a few more scraps so no yard is bare
  const extras = ['barrel', 'crate', 'stump', 'sack', 'bucket', 'rockSmall'];
  for (let i = 0; i < 2; i++) tp(extras[Math.floor(rng() * extras.length)], i + 1, { seed: Math.floor(rng() * 4) }, 0.6);
  // drifts banked against the walls
  for (const [lx, lz, w] of [[hw + 0.9, -hd * 0.4, 2.2], [-(hw + 0.9), hd * 0.2, 1.8], [0, -(hd + 0.9), 3.4]]) {
    const [x, z] = c.at(lx, lz);
    if (D.free(x, z, 0.4, { roadPad: 0.2 })) D.add('snowDrift', x, z, { yaw: rec.yaw + (lx ? PI / 2 : 0), opts: { width: w, depth: 0.9, height: 0.55 }, collide: false });
  }

  // ----- footpath from the door to the nearest road -----
  const nr = nearestRoad(doorRec.x, doorRec.z);
  if (nr && nr.d < 40) {
    const [sx, sz] = F.at(0, 0.6);
    // nearly straight, with one gentle kink
    const mx = (sx + nr.x) / 2 + (rng() - 0.5) * 0.9, mz = (sz + nr.z) / 2 + (rng() - 0.5) * 0.9;
    V.paths.push({ pts: [[sx, sz], [mx, mz], [nr.x, nr.z]], width: 1.05, kind: 'path', alpha: 0.34 });
  }
}

// Trodden paths across the square: doors and stalls to the well, a ring round the well.
function squarePaths(D) {
  const { V } = D;
  const w = [SQUARE.well.x, SQUARE.well.z + 0.8];
  const door = (id, d = 3.2) => { const r = V.byId[id]; const dd = r.p.doors[0]; return frame(dd.x, dd.z, dd.yaw).at(0, d); };
  for (const id of ['longhouse', 'tavern']) {
    const [x, z] = door(id, 3.6);
    V.paths.push({ pts: [[x, z], [(x + w[0]) / 2 + 0.6, (z + w[1]) / 2], w], width: 1.5, kind: 'path', alpha: 0.4 });
  }
  const sm = V.byId.smithy;
  const sa = sm.p.anchors.door;
  V.paths.push({ pts: [[sa.x, sa.z - 1], [(sa.x + w[0]) / 2, (sa.z + w[1]) / 2 + 1], w], width: 1.5, kind: 'path', alpha: 0.4 });
  for (const id of ['stall_fish', 'stall_spoons', 'stall_dolls', 'stall_bread']) {
    const r = V.byId[id];
    const [x, z] = frame(r.x, r.z, r.yaw).at(0, 2.2);
    V.paths.push({ pts: [[x, z], [(x + w[0]) / 2, (z + w[1]) / 2], w], width: 1.1, kind: 'path', alpha: 0.3 });
  }
  const ring = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * PI * 2; ring.push([w[0] + Math.cos(a) * 3.4, w[1] - 0.8 + Math.sin(a) * 3.0]); }
  V.paths.push({ pts: ring, width: 1.3, kind: 'path', alpha: 0.36 });
}

export async function buildDressing(V) {
  const { G } = V;
  if (!V.PropBatch) return;
  V.paths = V.paths || [];
  const D = makeSpots(V);
  D.batch = new V.PropBatch(G, 'village', { chunk: 'auto' });
  V.dress = D;
  // The roadside encounters stand people here (layout.js ENCOUNTER_SPOTS): no pass may put a prop on them.
  for (const [x, z, r] of ENCOUNTER_SPOTS) D.claim(x, z, r);

  // houses first (they claim yard space), then the hero places
  let i = 0;
  for (const rec of V.placed) {
    if (!rec.meta.house) continue;
    dressHouse(D, rec, i++);
  }
  await tick();
  dressHeroes(D);
  if (V.G.quality !== 'low') dressStreets(D);
  squarePaths(D);
  await tick();
  dressEdges(D);
  await tick();
  // The density pass comes last so the props the other passes registered keep their order (life.js picks
  // stations from the first chopping blocks, racks and laundry lines it finds).
  const failsBefore = D.fails.length;
  D.firstDensity = D.handles.length; // handles from here on belong to the density pass (checked against stations in the tests)
  if (V.G.quality !== 'low') {
    dressLanes(D);
    await tick();
  }
  if (G.params.has('vdebug')) console.warn(`[village] density pass placements that did not fit (${D.fails.length - failsBefore}): ${D.fails.slice(failsBefore).join(' ')}`);

  const t0 = performance.now();
  await D.batch.buildAsync({ budgetMs: 8 });
  V.log(`dressing: ${D.handles.length} props, ${(performance.now() - t0).toFixed(0)} ms`, D.batch.stats);
  V.propStats = D.batch.stats;

  // Footpaths and sled tracks.
  buildRibbons(G, V.paths);
  void THREE;
}
