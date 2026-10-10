#!/usr/bin/env node
// Pure-logic test of the fishing model (no browser): bite tables, the strike, the fight against a few kinds of player,
// the old pike's patience, prices and cooking values.   node scripts/fishtest.mjs [--verbose]
// Exits 1 if a check fails.
import { SPECIES, SPECIES_IDS, WEATHERS } from '../src/gameplay/fishing/species.js';
import {
  LINES, Line, Bite, Fight, OldOne, FIGHT, makeEnv, speciesTerms, totalRate, pickSpecies, rollWeight, hourFit,
  priceOf, perKg, cookValue, forceFor, lengthOf, kg, sizeWord, isNight,
} from '../src/gameplay/fishing/model.js';
import { rng } from '../src/core/util.js';

const verbose = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};
const note = (...a) => { if (verbose) console.log('      ', ...a); };
const pct = (x) => `${Math.round(x * 100)}%`;

// ---- the table ---------------------------------------------------------------------------------------------------
{
  const text = JSON.stringify(SPECIES);
  check('species text has no em dashes', !/[â€”â€“]/.test(text));
  check('six species and the old one', SPECIES_IDS.length === 6 && !!SPECIES.oldone && SPECIES.oldone.special);
  check('every species has weights in order and every weather', SPECIES_IDS.every((id) => {
    const s = SPECIES[id];
    return s.w[0] < s.w[1] && s.w[1] < s.w[2] && WEATHERS.every((w) => typeof s.weather[w] === 'number') && s.hours[0][0] === 0 && s.hours[s.hours.length - 1][0] === 24;
  }));
  check('hours wrap at midnight', SPECIES_IDS.every((id) => Math.abs(hourFit(SPECIES[id].hours, 0) - hourFit(SPECIES[id].hours, 24)) < 1e-9));
  check('night starts at 18:30 and ends at 6:00', isNight(23) && isNight(3) && !isNight(12) && !isNight(6.5));
  check('lengths scale with weight', lengthOf('pike', 8) > lengthOf('pike', 3) && lengthOf('pike', 3) > 0.6 && lengthOf('perch', 0.3) > 0.15 && lengthOf('perch', 0.3) < 0.25, `pike 3kg ${lengthOf('pike', 3).toFixed(2)} m`);
}

// ---- bite tables -------------------------------------------------------------------------------------------------
function shares(env, spot, depth, n = 6000, jig = false) {
  const R = rng(11), terms = speciesTerms(env, spot, depth, jig), count = {};
  for (const id of SPECIES_IDS) count[id] = 0;
  for (let i = 0; i < n; i++) { const id = pickSpecies(terms, R); if (id) count[id]++; }
  const out = {};
  for (const id of SPECIES_IDS) out[id] = count[id] / n;
  return { out, total: totalRate(terms), terms };
}
const spotOf = (depth, o = {}) => ({ depth, rich: 1, sizeBias: 1, ...o });
const fmt = (s) => SPECIES_IDS.map((id) => `${id} ${pct(s.out[id])}`).join(', ');

{
  const shallowDay = shares(makeEnv({ hours: 11, weather: 'clear' }), spotOf(1.2), 0.5);
  note('huts, noon:', fmt(shallowDay), `${(shallowDay.total * 60).toFixed(2)}/min`);
  check('the shelf by the huts gives perch and roach by day', shallowDay.out.perch + shallowDay.out.roach > 0.93, fmt(shallowDay));
  check('nothing deep bites in a metre of water', shallowDay.out.burbot + shallowDay.out.whitefish + shallowDay.out.bream === 0);

  const deepNight = shares(makeEnv({ hours: 1, weather: 'clear' }), spotOf(10), 9.6);
  note('deep, 1 am, on the bottom:', fmt(deepNight), `${(deepNight.total * 60).toFixed(2)}/min`);
  check('burbot take the bottom of the deep hole at night', deepNight.out.burbot > 0.45, fmt(deepNight));

  const deepMorning = shares(makeEnv({ hours: 8, weather: 'clear' }), spotOf(10), 7.0);
  note('deep, 8 am, 7 m:', fmt(deepMorning), `${(deepMorning.total * 60).toFixed(2)}/min`);
  check('whitefish rise to the jig in the clear morning', deepMorning.out.whitefish > 0.2, fmt(deepMorning));

  const deepNoonWhite = shares(makeEnv({ hours: 8, weather: 'snow' }), spotOf(10), 7.0);
  check('snow cuts the whitefish', deepNoonWhite.out.whitefish < deepMorning.out.whitefish * 0.7, `${pct(deepNoonWhite.out.whitefish)} vs ${pct(deepMorning.out.whitefish)}`);

  const mid = (h, wx) => shares(makeEnv({ hours: h, weather: wx }), spotOf(4), 2.2);
  const dusk = mid(18, 'overcast'), noon = mid(12.5, 'clear');
  note('mid, dusk overcast:', fmt(dusk), '| noon clear:', fmt(noon));
  check('pike like the dusk and the grey sky', dusk.out.pike > noon.out.pike * 2, `${pct(dusk.out.pike)} vs ${pct(noon.out.pike)}`);
  check('perch like noon', noon.out.perch > dusk.out.perch, `${pct(noon.out.perch)} vs ${pct(dusk.out.perch)}`);

  const clearNight = makeEnv({ hours: 23, weather: 'clear', herdersLow: 0 }), withHerders = makeEnv({ hours: 23, weather: 'clear', herdersLow: 1 });
  const base = shares(clearNight, spotOf(8), 7.5), lowHerders = shares(withHerders, spotOf(8), 7.5);
  note(`night, herders low: ${(base.total * 60).toFixed(2)} -> ${(lowHerders.total * 60).toFixed(2)}/min`);
  check('they bite better when the herders hang low and many', lowHerders.total > base.total * 1.2, `x${(lowHerders.total / base.total).toFixed(2)}`);
  const snowy = shares(makeEnv({ hours: 23, weather: 'snow', herdersLow: 0 }), spotOf(8), 7.5);
  const blizz = shares(makeEnv({ hours: 23, weather: 'blizzard' }), spotOf(8), 7.5);
  check('a clear frost beats snow, and snow beats a blizzard', lowHerders.total > snowy.total && snowy.total > blizz.total, `${(lowHerders.total * 60).toFixed(2)} / ${(snowy.total * 60).toFixed(2)} / ${(blizz.total * 60).toFixed(2)}`);
  check('the best nights give a bite every half minute or so', lowHerders.total * 60 > 1.3 && lowHerders.total * 60 < 4.5, `${(lowHerders.total * 60).toFixed(2)}/min`);
  check('a poor shelf at noon in snow is slow but not dead', (() => { const s = shares(makeEnv({ hours: 12, weather: 'snow' }), spotOf(1.2), 0.5); return s.total * 60 > 0.4 && s.total * 60 < 2; })());

  const jig0 = shares(makeEnv({ hours: 11 }), spotOf(3), 1.4, 100, false), jig1 = shares(makeEnv({ hours: 11 }), spotOf(3), 1.4, 100, true);
  check('jigging brings them in faster', jig1.total > jig0.total * 1.5);

  // depth matters: the same hour at the wrong depth gives much less
  const right = shares(makeEnv({ hours: 11 }), spotOf(6), 2.7), wrong = shares(makeEnv({ hours: 11 }), spotOf(6), 5.6);
  check('the depth of the jig matters', right.total > wrong.total * 1.8, `${(right.total * 60).toFixed(2)} vs ${(wrong.total * 60).toFixed(2)}/min`);
}

// ---- sizes -------------------------------------------------------------------------------------------------------
{
  const R = rng(5);
  for (const id of SPECIES_IDS) {
    const sp = SPECIES[id];
    const ws = Array.from({ length: 4000 }, () => rollWeight(sp, R));
    const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
    const mn = Math.min(...ws), mx = Math.max(...ws);
    note(id, `mean ${mean.toFixed(2)} min ${mn} max ${mx}`);
    check(`${id}: weights stay in range and centre near the mean`, mn >= sp.w[0] && mx <= sp.w[2] && mean > sp.w[1] * 0.8 && mean < sp.w[1] * 1.3, `mean ${mean.toFixed(2)} (${sp.w[1]})`);
    check(`${id}: sizes vary`, mx > mn * 3);
  }
  const bigger = rollWeight(SPECIES.pike, rng(3), 1.4) >= 0.9;
  check('a spot can bias the size', bigger);
}

// ---- the bite --------------------------------------------------------------------------------------------------------
{
  const R = rng(21);
  let ordered = true, inWindow = 0, hooked = 0, spook = { perch: 0, whitefish: 0 }, tries = { perch: 0, whitefish: 0 };
  for (const id of SPECIES_IDS) {
    for (let k = 0; k < 200; k++) {
      const b = new Bite(SPECIES[id], 1, R);
      const evs = [];
      for (let t = 0; t < 8 && b.state !== 'gone'; t += 1 / 30) evs.push(...b.update(1 / 30));
      const types = evs.map((e) => e.type);
      const nibs = types.filter((x) => x === 'nibble').length;
      if (types[types.length - 1] !== 'gone' || types.indexOf('bite') < nibs || nibs < SPECIES[id].bite.nibbles[0] || nibs > SPECIES[id].bite.nibbles[1]) ordered = false;
    }
  }
  check('every approach runs nibbles, then a bite, then it is gone', ordered);
  for (let k = 0; k < 2000; k++) {
    const b = new Bite(SPECIES.pike, 3, R);
    while (b.state === 'near') b.update(1 / 30);
    b.update(0.1 + 0.4 * R());
    if (b.state === 'bite') { inWindow++; if (b.strike().result === 'hooked') hooked++; }
  }
  check('a strike inside the window hooks it most of the time', hooked / inWindow > 0.78 && hooked / inWindow < 0.97, pct(hooked / inWindow));
  for (const id of ['perch', 'whitefish']) {
    for (let k = 0; k < 2000; k++) {
      const b = new Bite(SPECIES[id], 1, R);
      b.update(0.2);
      if (b.state !== 'near') continue;
      tries[id]++;
      if (b.strike().result === 'spooked') spook[id]++;
    }
  }
  check('a jerk before the bite scares a whitefish far more than a perch', spook.whitefish / tries.whitefish > 2.5 * (spook.perch / tries.perch), `${pct(spook.whitefish / tries.whitefish)} vs ${pct(spook.perch / tries.perch)}`);
  const late = new Bite(SPECIES.perch, 1, R);
  for (let i = 0; i < 400; i++) late.update(1 / 30);
  check('a strike after the window finds nothing', late.strike().result === 'none');
}

// ---- the line ------------------------------------------------------------------------------------------------------
{
  const L = new Line(4);
  for (let i = 0; i < 300; i++) L.update(1 / 30, { slack: true });
  check('holding slack lets the jig sink to the floor and stop', L.bottom && L.depth <= 4 && L.depth > 3.5, `depth ${L.depth.toFixed(2)}`);
  for (let i = 0; i < 30; i++) L.update(1 / 30, { reel: true });
  check('reeling raises it', L.depth < 3.5 && !L.bottom);
  const d0 = L.at;
  L.jig();
  check('a jig lifts it a moment and it falls back', L.at < d0 - 0.3 && L.jigged);
  for (let i = 0; i < 60; i++) L.update(1 / 30, {});
  check('and it settles', Math.abs(L.at - L.depth) < 1e-6);
}

// ---- the fight -------------------------------------------------------------------------------------------------------
// Players: the pulse (reel while it rests, give line when it runs or the tension climbs), always reeling, never touching.
function bot(kind, delay = 0.2) {
  const q = [];
  return (f, dt) => {
    q.push({ T: f.T, Fn: f.Fn, Fr: f.Fr, inc: f.incoming, ph: f.phase });
    const seen = q.length > Math.round(delay / dt) ? q[q.length - 1 - Math.round(delay / dt)] : q[0];
    if (kind === 'reel') return { reel: true };
    if (kind === 'idle') return {};
    if (seen.inc) return seen.ph === 'pull' ? {} : { slack: true };
    if (seen.Fn > 0.85 || seen.T > 0.86) return { slack: true };
    if (seen.Fr < 0.62 && seen.T < 0.66) return { reel: true };
    return {};
  };
}
function fightOnce(id, w, kind, seed, line = LINES.normal, delay = 0.2, dist = null) {
  const R = rng(seed);
  const f = new Fight({ sp: SPECIES[id], w, rnd: R, line, dist: dist ?? 3 + R() * 3 });
  const play = bot(kind, delay);
  const dt = 1 / 30;
  while (!f.ended && f.t < 150) f.update(dt, play(f, dt));
  return { state: f.ended ? f.state : 'timeout', t: f.t, peak: f.hist.peakT, runs: f.hist.runs };
}
function trial(id, w, kind, n = 300, line = LINES.normal, delay = 0.2, dist = null) {
  const c = { landed: 0, snapped: 0, thrown: 0, spooled: 0, timeout: 0 }, ts = [];
  for (let i = 0; i < n; i++) {
    const r = fightOnce(id, w, kind, 1000 + i, line, delay, dist);
    c[r.state]++;
    if (r.state === 'landed') ts.push(r.t);
  }
  const mean = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 0;
  return { ...c, n, rate: c.landed / n, time: mean };
}
const row = (id, w, r) => `${id} ${w} kg: landed ${pct(r.rate)} in ${r.time.toFixed(1)} s, snapped ${pct(r.snapped / r.n)}, thrown ${pct(r.thrown / r.n)}, spooled ${pct(r.spooled / r.n)}, stalled ${pct(r.timeout / r.n)}`;

{
  const cases = [['perch', 0.3], ['roach', 0.25], ['bream', 1.0], ['whitefish', 0.7], ['burbot', 1.2], ['pike', 3], ['pike', 8]];
  const smart = {};
  for (const [id, w] of cases) { const key = `${id}${w}`; smart[key] = trial(id, w, 'pulse', 300, LINES.normal, 0.35); note('pulse (0.35 s hands):', row(id, w, smart[key])); }
  const expert = trial('pike', 8, 'pulse', 300, LINES.normal, 0.15);
  note('pulse (0.15 s hands):', row('pike', 8, expert));
  check('quicker hands land more pike', expert.rate > smart.pike8.rate + 0.05, `${pct(expert.rate)} vs ${pct(smart.pike8.rate)}`);
  check('a careful player lands the small fish nearly always', smart['perch0.3'].rate > 0.9 && smart['roach0.25'].rate > 0.9, `${pct(smart['perch0.3'].rate)}, ${pct(smart['roach0.25'].rate)}`);
  check('and the middling ones most of the time', smart.bream1.rate > 0.8 && smart['whitefish0.7'].rate > 0.75 && smart['burbot1.2'].rate > 0.8, `${pct(smart.bream1.rate)}, ${pct(smart['whitefish0.7'].rate)}, ${pct(smart['burbot1.2'].rate)}`);
  check('a pike is a real fight: sometimes it wins', smart.pike3.rate > 0.85 && smart.pike8.rate > 0.35 && smart.pike8.rate < 0.9, `${pct(smart.pike3.rate)}, ${pct(smart.pike8.rate)}`);
  check('and takes longer than a perch', smart.pike3.time > smart['perch0.3'].time * 2, `${smart.pike3.time.toFixed(1)} s vs ${smart['perch0.3'].time.toFixed(1)} s`);
  check('fights end in a sensible time', cases.every(([id, w]) => smart[`${id}${w}`].time > 3 && smart[`${id}${w}`].time < 70), cases.map(([id, w]) => `${id}${smart[`${id}${w}`].time.toFixed(0)}`).join(' '));
  check('big fish fight harder than small ones of the same kind', smart.pike8.time >= smart.pike3.time * 0.9 && forceFor(SPECIES.pike, 8) > forceFor(SPECIES.pike, 3));

  const greedy = {};
  for (const [id, w] of [['perch', 0.3], ['pike', 3], ['pike', 8]]) { greedy[`${id}${w}`] = trial(id, w, 'reel', 200); note('always reeling:', row(id, w, greedy[`${id}${w}`])); }
  check('reeling through everything snaps a pike', greedy.pike3.snapped / greedy.pike3.n > 0.65 && greedy.pike8.snapped / greedy.pike8.n > 0.9, `${pct(greedy.pike3.snapped / greedy.pike3.n)}, ${pct(greedy.pike8.snapped / greedy.pike8.n)}`);
  check('but a perch will come in on a hard reel', greedy['perch0.3'].rate > 0.9);

  const idle = trial('pike', 3, 'idle', 100);
  note('never touching:', row('pike', 3, idle));
  check('doing nothing never lands a fish', idle.landed === 0);

  const sloppy = trial('pike', 8, 'pulse', 200, LINES.normal, 0.7);
  note('slow hands:', row('pike', 8, sloppy));
  check('slow reactions lose more pike', sloppy.rate < smart.pike8.rate - 0.25, `${pct(sloppy.rate)} vs ${pct(smart.pike8.rate)}`);

  const noSlack = (() => {
    // reels at rests but never gives line
    const n = 200, c = { landed: 0, snapped: 0 };
    for (let i = 0; i < n; i++) {
      const R = rng(500 + i), f = new Fight({ sp: SPECIES.pike, w: 5, rnd: R, dist: 4 });
      while (!f.ended && f.t < 120) f.update(1 / 30, { reel: f.Fr < 0.62 && f.T < 0.66 });
      if (f.state === 'landed') c.landed++; else if (f.state === 'snapped') c.snapped++;
    }
    return c;
  })();
  note('never gives line, pike 5 kg:', JSON.stringify(noSlack));
  check('giving line is needed against a pike', noSlack.snapped / 200 > 0.35, `${pct(noSlack.snapped / 200)} snapped`);
}

// the whitefish and the slack line
{
  const lost = { whitefish: 0, bream: 0 }, N = 200;
  for (const id of ['whitefish', 'bream']) {
    for (let i = 0; i < N; i++) {
      const R = rng(900 + i), f = new Fight({ sp: SPECIES[id], w: SPECIES[id].w[1], rnd: R, dist: 4 });
      while (!f.ended && f.t < 40) f.update(1 / 30, { slack: f.Fr < 0.4 });
      if (f.state === 'thrown') lost[id]++;
    }
  }
  check('too much slack lets the fish throw the hook, whitefish sooner than bream', lost.whitefish / N > 0.6 && lost.whitefish >= lost.bream, `${pct(lost.whitefish / N)} / ${pct(lost.bream / N)}`);
  const spool = (() => { let n = 0; for (let i = 0; i < 60; i++) { const f = new Fight({ sp: SPECIES.pike, w: 6, rnd: rng(40 + i), dist: 5 }); while (!f.ended && f.t < 200) f.update(1 / 30, { slack: true }); if (f.state === 'spooled' || f.state === 'thrown') n++; } return n; })();
  check('letting it all go ends the fight one way or the other', spool === 60);
}

// ---- the old pike -----------------------------------------------------------------------------------------------------
{
  const R = rng(77);
  const normal = trial('oldone', 21.5, 'pulse', 100, LINES.normal, 0.35, 12.5);
  const strong = trial('oldone', 21.5, 'pulse', 100, LINES.strong, 0.35, 12.5);
  note('old one, hemp:', row('oldone', 21.5, normal));
  note('old one, horsehair:', row('oldone', 21.5, strong));
  check('the old pike breaks an ordinary line', normal.rate < 0.1 && normal.snapped + normal.spooled + normal.thrown > 0.85 * normal.n, `${pct(normal.rate)} landed`);
  check('but not the waxed horsehair, for a careful player', strong.rate > 0.55, `${pct(strong.rate)}`);
  check('and it takes a long time', strong.time > 45 && strong.time < 150, `${strong.time.toFixed(0)} s`);

  const line = new Line(13); line.depth = 12.4;
  const spot = { depth: 13 };
  const ideal = makeEnv({ hours: 23, weather: 'clear', herdersLow: 0 }), withHerders = makeEnv({ hours: 23, weather: 'clear', herdersLow: 1 });
  const waits = (env, hours) => { const w = []; for (let k = 0; k < 300; k++) { const o = new OldOne(rng(2000 + k)); let t = 0; env.hours = hours ?? env.hours; while (!o.update(0.5, env, line, spot) && t < 1000) t += 0.5; w.push(t); } return w.reduce((a, b) => a + b, 0) / w.length; };
  const w0 = waits(ideal), w1 = waits(withHerders);
  note(`wait: ${w0.toFixed(0)} s, with the herders low ${w1.toFixed(0)} s`);
  check('the old pike wants a long still night: one to two minutes on the bottom', w0 > 65 && w0 < 130, `${w0.toFixed(0)} s`);
  check('the herders low over the ice shorten the wait', w1 < w0 * 0.75, `${w1.toFixed(0)} s`);
  const noon = new OldOne(R), dayEnv = makeEnv({ hours: 12 });
  let moved = false;
  for (let i = 0; i < 400; i++) moved = noon.update(0.5, dayEnv, line, spot) || moved;
  check('it never comes by day', !moved && noon.patience === 0);
  const high = new Line(13); high.depth = 4;
  const o3 = new OldOne(R); let up = false;
  for (let i = 0; i < 600; i++) up = o3.update(0.5, ideal, high, spot) || up;
  check('or to a jig hanging high above it', !up);
}

// ---- money and food -----------------------------------------------------------------------------------------------------
{
  check('a heavier fish is worth more', SPECIES_IDS.every((id) => priceOf(id, SPECIES[id].w[2]) > priceOf(id, SPECIES[id].w[0])));
  check('and dearer per kilo as it grows', SPECIES_IDS.every((id) => perKg(id, SPECIES[id].w[2]) > perKg(id, SPECIES[id].w[1]) && perKg(id, SPECIES[id].w[1]) > perKg(id, SPECIES[id].w[0])));
  check('whitefish and burbot sell dearer than roach', priceOf('whitefish', 0.7) / 0.7 > priceOf('roach', 0.7) / 0.7 * 2 && priceOf('burbot', 1) > priceOf('roach', 1) * 1.7);
  check('a small perch is a grosz', priceOf('perch', 0.25) === 1 || priceOf('perch', 0.25) === 2, String(priceOf('perch', 0.25)));
  check('an ordinary pike is worth a draught', priceOf('pike', 3) >= 12 && priceOf('pike', 3) <= 20, String(priceOf('pike', 3)));
  check('the old pike is worth a good purse, not a fortune', priceOf('oldone', 21.5) >= 50 && priceOf('oldone', 21.5) <= 100, String(priceOf('oldone', 21.5)));
  check('prices are whole grosze', SPECIES_IDS.every((id) => Number.isInteger(priceOf(id, SPECIES[id].w[1]))));
  const c = cookValue('perch', 0.3), p = cookValue('pike', 6);
  check('a roast perch is a snack and a big pike a meal', c.health >= 8 && c.health <= 20 && p.health > c.health && p.health <= 34 && c.warmth > 0.1 && p.warmth > c.warmth && p.warmth <= 0.36, JSON.stringify({ c, p }));
  check('size words', sizeWord('pike', 11) === 'a big one' && sizeWord('perch', 0.07) === 'a small one' && sizeWord('perch', 0.28) === '');
  check('weights print plainly', kg(0.3) === '0.3 kg' && kg(1) === '1 kg' && kg(1.256) === '1.26 kg');
  void FIGHT;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);




