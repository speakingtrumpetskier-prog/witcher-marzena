// The cast table: named villagers with explicit schedules, and the role templates that turn the
// stations a village registers into a believable crowd of 30 to 40 ambient people (DESIGN 2.4 and
// 3.2, VILLAGE.md "NPC stations").
//
//   NAMED                       defs for G.npcs.spawn (Hanka, Bogdan, Dobra, Zbyszek, Jarek, Ola, the mill family)
//   buildAmbient(G, opts)       -> [def] ambient villagers, children and fishermen with concrete schedules
//
// A schedule is a list of { from, to, at, hidden? } in game hours (wraps past midnight). `at` is a
// station id (G.world.stations) or an inline station object. Named NPCs carry an `anchor` so a
// missing station id still resolves to somewhere sensible near their home.
import { LOC } from '../../world/layout.js';
import { allStations } from './stations.js';
import { rng, hashString } from '../../core/util.js';

const at = (from, to, st, extra) => ({ from, to, at: st, ...extra });

export const NAMED = [
  {
    id: 'hanka', preset: 'hanka', name: 'Hanka', anchor: LOC.hanka, hardy: 0.9,
    schedule: [
      at(22, 6, 'hanka_bed', { hidden: true }),
      at(6, 7.2, 'hanka_porch', { anim: 'warm_hands' }),
      at(7.2, 17, 'hanka_loom', { anim: 'mend_net' }),
      at(17, 17.8, 'hanka_milk', { anim: 'kneel_idle' }),
      at(17.8, 22, 'hanka_loom', { anim: 'mend_net' }),
    ],
  },
  {
    id: 'bogdan', preset: 'bogdan', name: 'Bogdan Kral', anchor: LOC.longhouse, hardy: 0.8,
    schedule: [
      at(23, 6.5, 'bogdan_bed', { hidden: true }),
      at(6.5, 8.5, 'bogdan_table', { anim: 'sit_bench' }),
      at(8.5, 9.6, 'bogdan_square', { anim: 'hands_hips' }),
      at(9.6, 14, 'bogdan_table', { anim: 'sit_bench' }),
      at(14, 15, 'notice_board', { anim: 'cross_arms' }),
      at(15, 23, 'bogdan_table', { anim: 'sit_bench' }),
    ],
  },
  {
    id: 'dobra', preset: 'dobra', name: 'Dobra', anchor: LOC.dobra, hardy: 0.9,
    schedule: [
      at(21.5, 5.5, 'dobra_bed', { hidden: true }),
      at(5.5, 12, 'dobra_work', { anim: 'mend_net' }),
      at(12, 13, 'dobra_porch', { anim: 'sit_bench' }),
      at(13, 21.5, 'dobra_work', { anim: 'mend_net' }),
    ],
  },
  {
    id: 'zbyszek', preset: 'zbyszek', name: 'Zbyszek', anchor: LOC.tavern, hardy: 0.9,
    schedule: [
      at(23.5, 9.5, 'zbyszek_bed', { hidden: true }),
      at(9.5, 13, 'tavern_bar', { anim: 'hands_hips' }),
      at(13, 13.6, 'tavern_porch', { anim: 'lean_wall' }),
      at(13.6, 23.5, 'tavern_bar', { anim: 'hands_hips' }),
    ],
  },
  {
    id: 'jarek', preset: 'jarek', name: 'Jarek', anchor: LOC.fishingHuts, hardy: 0.95,
    schedule: [
      at(2, 8, 'jarek_bed', { hidden: true }),
      at(8, 15, 'jarek_net', { anim: 'mend_net' }),
      at(15, 18, 'jarek_dock', { anim: 'sit_ground' }),
      at(18, 2, 'tavern_corner', { anim: 'sit_bench' }),
    ],
  },
  {
    id: 'ola', preset: 'ola', name: 'Ola', anchor: LOC.hanka, hardy: 0.5, child: true,
    schedule: [
      at(20, 7, 'hanka_bed', { hidden: true }),
      at(7, 8.5, 'hanka_porch', { anim: 'child_play' }),
      at(8.5, 12.2, 'tag:bale', { anim: 'child_play' }),
      at(12.2, 13.2, 'hanka_porch', { anim: 'child_play' }),
      at(13.2, 16.6, 'tag:sled', { anim: 'child_play' }),
      at(16.6, 19.2, 'tag:fort', { anim: 'sit_ground' }),
      at(19.2, 20, 'hanka_porch', { anim: 'child_play' }),
    ],
  },
];

// The mill family lives far from the village (LOC.mill); they only exist when the player is near.
export const MILL = [
  {
    id: 'miller', preset: 'miller', name: 'Gniewko', anchor: LOC.mill, hardy: 0.85,
    schedule: [at(20, 6, 'mill_bed', { hidden: true }), at(6, 20, 'mill_work', { anim: 'carry_bucket' })],
  },
  {
    id: 'miller_wife', preset: 'miller_wife', name: 'Bozena', anchor: LOC.mill, hardy: 0.8,
    schedule: [at(20.5, 6.5, 'mill_bed', { hidden: true }), at(6.5, 20.5, 'mill_house', { anim: 'stir' })],
  },
  {
    id: 'child_e', preset: 'child_e', name: 'Child', anchor: LOC.mill, hardy: 0.4, child: true,
    schedule: [at(19, 7, 'mill_bed', { hidden: true }), at(7, 19, 'mill_yard', { anim: 'child_play' })],
  },
  {
    id: 'child_f', preset: 'child_f', name: 'Child', anchor: LOC.mill, hardy: 0.4, child: true,
    schedule: [at(19, 7.5, 'mill_bed', { hidden: true }), at(7.5, 19, 'mill_yard', { anim: 'child_play' })],
  },
];

// ---------------------------------------------------------------------------------------------
// Role templates. work: a station tag (or list tried in order); `home`: hour they head home;
// `evening`: what they do instead of going straight home.
const ROLES = [
  { role: 'smith', pool: 'm', count: 1, work: ['forge'], wake: 6.2, home: 18.6, evening: 'tavern', hardy: 0.95 },
  { role: 'seller', pool: 'mf', count: 2, work: ['market'], wake: 7.0, home: 17.0, evening: 'home', hardy: 0.4, noErrand: true },
  { role: 'woodcutter', pool: 'm', count: 2, work: ['chop'], wake: 6.6, home: 17.0, evening: 'tavern', hardy: 0.7 },
  { role: 'fishwife', pool: 'f', count: 2, work: ['fish_rack'], wake: 6.8, home: 17.0, evening: 'social', hardy: 0.6 },
  { role: 'netmender', pool: 'fisher', count: 2, work: ['net'], wake: 6.6, home: 17.2, evening: 'tavern', hardy: 0.97 },
  { role: 'icefisher', pool: 'fisher', count: 2, work: ['ice_hole'], wake: 7.0, home: 15.9, evening: 'home', hardy: 0.98, noLunch: true, noErrand: true },
  { role: 'water', pool: 'f', count: 2, work: ['well'], wake: 6.4, home: 17.2, evening: 'social', hardy: 0.6, carry: 'bucket' },
  { role: 'child', pool: 'child', count: 4, work: ['bale', 'sled', 'fort'], wake: 7.6, home: 17.6, evening: 'home', hardy: 0.4, child: true },
  { role: 'shoveler', pool: 'm', count: 2, work: ['shovel'], wake: 6.5, home: 17.0, evening: 'tavern', hardy: 0.6 },
  { role: 'elder', pool: 'elder_m', count: 1, work: ['porch'], wake: 8.0, home: 17.4, evening: 'porch', hardy: 0.3 },
  { role: 'pilgrim', pool: 'elder_f', count: 1, work: ['shrine'], wake: 7.4, home: 16.4, evening: 'home', hardy: 0.35, noErrand: true },
  { role: 'courier', pool: 'mf', count: 3, work: [], wake: 6.8, home: 17.2, evening: 'social', hardy: 0.55, wander: true, carry: 'basket' },
  { role: 'launderer', pool: 'f', count: 1, work: ['laundry'], wake: 7.2, home: 16.8, evening: 'home', hardy: 0.45 },
  { role: 'goatherd', pool: 'm', count: 1, work: ['goat_pen'], wake: 6.6, home: 17.4, evening: 'tavern', hardy: 0.7 },
  { role: 'gate', pool: 'm', count: 1, work: ['gate'], wake: 7.0, home: 18.4, evening: 'tavern', hardy: 0.8 },
  { role: 'woodcutter', pool: 'm', count: 1, work: ['chop'], wake: 6.9, home: 17.2, evening: 'porch', hardy: 0.7 },
  { role: 'courier', pool: 'mf', count: 2, work: [], wake: 7.0, home: 17.0, evening: 'home', hardy: 0.5, wander: true, carry: 'bucket' },
  { role: 'seller', pool: 'mf', count: 1, work: ['market', 'porch'], wake: 7.4, home: 17.0, evening: 'social', hardy: 0.4, noErrand: true },
];

function makePools(rand) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nums = (n) => Array.from({ length: n }, (_, i) => i + 1);
  return {
    m: shuffle(nums(12).map((i) => `villager_m_${i}`)),
    f: shuffle(nums(12).map((i) => `villager_f_${i}`)),
    fisher: shuffle(nums(4).map((i) => `fisherman_${i}`)),
    child: shuffle(['child_a', 'child_b', 'child_c', 'child_d']),
    elder_m: ['elder_m'],
    elder_f: ['elder_f'],
  };
}

export function buildAmbient(G, opts = {}) {
  const count = opts.count ?? 30;
  const rand = rng(opts.seed ?? 4242);
  const all = allStations(G);
  const byTag = new Map(), byKind = new Map();
  for (const s of all) {
    if (s.animal || s.reserved) continue;
    if (s.tag) { if (!byTag.has(s.tag)) byTag.set(s.tag, []); byTag.get(s.tag).push(s); }
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind).push(s);
  }
  const workUse = new Map(); // station id -> people (whole workday)
  const blockUse = { lunch: new Map(), eve: new Map(), morn: new Map() };
  const used = (m, id) => m.get(id) || 0;
  const claimWork = (tag) => {
    for (const s of byTag.get(tag) || []) {
      if (s.kind === 'talk' || s.kind === 'bed') continue;
      if (used(workUse, s.id) < s.capacity) { workUse.set(s.id, used(workUse, s.id) + 1); return s; }
    }
    return null;
  };
  const claimSeat = (list, block) => {
    for (const s of list || []) {
      if (used(blockUse[block], s.id) < s.capacity) { blockUse[block].set(s.id, used(blockUse[block], s.id) + 1); return s; }
    }
    return null;
  };
  const beds = byKind.get('bed') || [];
  const talks = byKind.get('talk') || [];
  const sits = (byKind.get('sit') || []).filter((s) => !s.indoor);
  const tavernSeats = byTag.get('tavern_seat') || [];
  const wanders = byKind.get('wander') || [];
  const nearestBed = (x, z) => {
    let best = null, bd = 1e9;
    for (const b of beds) {
      const d = Math.hypot(b.x - x, b.z - z) + rand() * 25;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  const pools = makePools(rand);
  const takePreset = (pool) => {
    const out = [];
    for (const key of pool === 'mf' ? [rand() < 0.5 ? 'm' : 'f'] : [pool]) {
      const arr = pools[key];
      if (arr && arr.length) out.push(arr.shift());
    }
    return out[0] || null;
  };
  const defs = [];
  const pairs = [];
  const roles = ROLES.slice(0, Math.max(0, count));
  let made = 0;
  for (const R of roles) {
    for (let k = 0; k < R.count && made < count; k++) {
      let preset = takePreset(R.pool);
      if (!preset && R.pool !== 'm') preset = takePreset('m');
      if (!preset) continue;
      let work = null;
      if (!R.wander) {
        const tags = Array.isArray(R.work) ? R.work : [R.work];
        for (let i = 0; i < tags.length && !work; i++) {
          if (R.role === 'child') { work = claimShared(byTag, tags[(k + i) % tags.length], k + made); } else work = claimWork(tags[i]);
        }
        // no station for this role in this village: work stays null and they wander the square instead
      }
      const id = preset;
      const home = work ? nearestBed(work.x, work.z) : nearestBed(LOC.square.x, LOC.square.z);
      const skew = (rand() - 0.5) * 0.7;
      const def = {
        id, preset, role: R.role, hardy: R.hardy, child: !!R.child, skew, carry: R.carry || null,
        noErrand: !!R.noErrand, anchor: work ? { x: work.x, z: work.z } : LOC.square, home: home ? home.id : null,
        schedule: [], _R: R, _work: work,
      };
      defs.push(def);
      made++;
      if (R.evening === 'social' || (!R.noLunch && !R.child)) pairs.push(def);
    }
  }
  // Lunch and evening pairs share talk stations (same hours so partners meet).
  const lunchPairs = [];
  const shuffled = pairs.filter((d) => !d._R.noLunch && !d._R.child && d._R.role !== 'elder' && d._R.role !== 'pilgrim').sort(() => rand() - 0.5);
  for (let i = 0; i + 1 < shuffled.length; i += 2) lunchPairs.push([shuffled[i], shuffled[i + 1]]);
  const lunchOf = new Map();
  for (const [a, b] of lunchPairs) {
    const st = claimSeat(talks, 'lunch') || null;
    if (!st) break;
    claimSeat([st], 'lunch'); // fills the second slot
    const M = 11.8 + rand() * 0.9;
    lunchOf.set(a, { st, M }); lunchOf.set(b, { st, M });
  }
  // A short mid-morning gossip break for a couple of other pairs.
  const mornOf = new Map();
  const mornCands = shuffled.slice().sort(() => rand() - 0.5);
  for (let i = 0, made2 = 0; i + 1 < mornCands.length && made2 < 3; i += 2, made2++) {
    const st = claimSeat(talks, 'morn');
    if (!st) break;
    claimSeat([st], 'morn');
    const M = 10.1 + rand() * 0.5;
    mornOf.set(mornCands[i], { st, M }); mornOf.set(mornCands[i + 1], { st, M });
  }
  const evePairs = [];
  const eveCands = defs.filter((d) => d._R.evening === 'social');
  for (let i = 0; i + 1 < eveCands.length; i += 2) evePairs.push([eveCands[i], eveCands[i + 1]]);
  const eveOf = new Map();
  for (const [a, b] of evePairs) {
    const st = claimSeat(talks, 'eve');
    if (!st) break;
    claimSeat([st], 'eve');
    const E = 17.3 + rand() * 0.8;
    eveOf.set(a, { st, E }); eveOf.set(b, { st, E });
  }
  for (const d of defs) {
    const R = d._R;
    const home = d.home ? { at: d.home, hidden: true } : null;
    const wake = R.wake + d.skew * 0.8;
    const homeAt = R.home + d.skew * 0.9;
    const workAt = d._work ? d._work.id : (R.wander ? (wanders.length ? wanders[Math.floor(rand() * wanders.length)].id : { kind: 'wander', x: LOC.square.x + (rand() - 0.5) * 30, z: LOC.square.z + (rand() - 0.5) * 20, r: 28, anim: 'idle' }) : { kind: 'wander', x: LOC.square.x, z: LOC.square.z, r: 30, anim: 'idle' });
    const sched = [];
    const lunch = lunchOf.get(d);
    const wrap = (x) => ((x % 24) + 24) % 24;
    // night
    const nightFrom = homeAt;
    const eve = eveOf.get(d);
    let eveStation = null, eveEnd = 0;
    if (R.evening === 'tavern' && (tavernSeats.length || true)) {
      eveStation = claimSeat(tavernSeats, 'eve');
      eveEnd = 20.5 + rand() * 1.8;
    } else if (R.evening === 'social' && eve) {
      eveStation = eve.st; eveEnd = 19.8 + rand() * 1.2;
    } else if (R.evening === 'porch') {
      eveStation = claimSeat(sits, 'eve'); eveEnd = 19.5 + rand() * 1.0;
    }
    const lunchLen = 1.1;
    const morn = mornOf.get(d);
    if (lunch || morn) {
      let cur = wake;
      if (morn) {
        sched.push({ from: cur, to: morn.M, at: workAt });
        sched.push({ from: morn.M, to: morn.M + 1.0, at: morn.st.id });
        cur = morn.M + 1.0;
      }
      if (lunch) {
        sched.push({ from: cur, to: lunch.M, at: workAt });
        sched.push({ from: lunch.M, to: lunch.M + lunchLen, at: lunch.st.id });
        cur = lunch.M + lunchLen;
      }
      sched.push({ from: cur, to: nightFrom, at: workAt });
    } else if (R.child) {
      const second = (d._work && d._work.tag === 'bale') ? 'sled' : 'fort';
      const w2 = claimShared(byTag, second, 3) || d._work;
      sched.push({ from: wake, to: 12.2 + d.skew * 0.5, at: workAt });
      sched.push({ from: 12.2 + d.skew * 0.5, to: nightFrom, at: w2 ? w2.id : workAt });
    } else {
      sched.push({ from: wake, to: nightFrom, at: workAt });
    }
    if (eveStation) {
      sched.push({ from: nightFrom, to: eveEnd, at: eveStation.id });
      if (home) sched.push({ from: eveEnd, to: wake, ...home });
    } else if (home) {
      sched.push({ from: nightFrom, to: wake, ...home });
    }
    d.schedule = sched.map((e) => ({ ...e, from: wrap(e.from), to: wrap(e.to) }));
    d.errand = d._R.noErrand ? 0 : (d._R.wander ? 1 : 0.5);
    delete d._R; delete d._work;
  }
  return defs;
}

function claimShared(byTag, tag, k) {
  const list = byTag.get(tag) || [];
  if (!list.length) return null;
  return list[k % list.length];
}

export function seedFor(id) { return hashString(id); }
