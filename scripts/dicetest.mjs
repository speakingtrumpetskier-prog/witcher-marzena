#!/usr/bin/env node
// Pure-logic tests for Kosci (dice poker): hand ranking, tie breaks, rerolling, the AI's decisions and the match
// state machine. No browser. Run: node scripts/dicetest.mjs     (exit code 1 if anything fails)
import { evaluate, compare, scoreOf, ordinalOf, RANK, RANK_NAMES, eachOutcome, distribution, MASKS, rng, madeDice, ORDINALS_COUNT, winChance } from '../src/minigames/dice/rules.js';
import { createAI, PERSONALITIES } from '../src/minigames/dice/ai.js';
import { Match } from '../src/minigames/dice/match.js';
import { OPPONENTS, pickLine, voiceLines } from '../src/minigames/dice/opponents.js';
import * as THREE from 'three';
import { planRoll, planShake, planHop, faceUp, topFace } from '../src/minigames/dice/roll.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${detail ? `   [${detail}]` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const rankOf = (d) => evaluate(d).rank;
const beats = (a, b) => compare(a, b) > 0;
const tie = (a, b) => compare(a, b) === 0;

// ---- the ranks ----------------------------------------------------------------------------------
const SAMPLE = {
  [RANK.nothing]: [6, 4, 3, 2, 1],
  [RANK.pair]: [2, 2, 4, 5, 6],
  [RANK.twoPairs]: [3, 3, 5, 5, 1],
  [RANK.three]: [4, 4, 4, 1, 2],
  [RANK.smallStraight]: [3, 1, 2, 5, 4],
  [RANK.bigStraight]: [6, 2, 5, 4, 3],
  [RANK.fullHouse]: [2, 5, 2, 5, 5],
  [RANK.four]: [6, 6, 1, 6, 6],
  [RANK.five]: [3, 3, 3, 3, 3],
};
for (const [rank, dice] of Object.entries(SAMPLE)) eq(`rank of ${dice.join('')} is ${RANK_NAMES[rank]}`, rankOf(dice), +rank);
for (let r = 1; r <= 8; r++) ok(`${RANK_NAMES[r]} beats ${RANK_NAMES[r - 1]}`, beats(SAMPLE[r], SAMPLE[r - 1]));
ok('the weakest pair beats the best nothing', beats([1, 1, 2, 3, 4], [6, 5, 4, 3, 1]));
ok('the weakest two pairs beat the best pair', beats([2, 2, 1, 1, 3], [6, 6, 5, 4, 3]));
ok('the weakest three beat the best two pairs', beats([1, 1, 1, 2, 3], [6, 6, 5, 5, 4]));
ok('any straight beats the best three of a kind', beats([1, 2, 3, 4, 5], [6, 6, 6, 5, 4]));
ok('a big straight beats a small one', beats([2, 3, 4, 5, 6], [1, 2, 3, 4, 5]));
ok('the weakest full house beats a big straight', beats([1, 1, 1, 2, 2], [2, 3, 4, 5, 6]));
ok('the weakest four of a kind beats the best full house', beats([1, 1, 1, 1, 2], [6, 6, 6, 5, 5]));
ok('the weakest five of a kind beats the best four', beats([1, 1, 1, 1, 1], [6, 6, 6, 6, 5]));
ok('1 2 3 4 6 is not a straight', rankOf([1, 2, 3, 4, 6]) === RANK.nothing);
ok('1 2 3 5 6 is not a straight', rankOf([1, 2, 3, 5, 6]) === RANK.nothing);
ok('dice order does not matter', tie([5, 1, 3, 3, 6], [3, 6, 1, 5, 3]));

// ---- tie breaks -------------------------------------------------------------------------------------
ok('pair of sixes beats pair of fives', beats([6, 6, 1, 2, 3], [5, 5, 6, 4, 3]));
ok('same pair: the highest kicker decides', beats([4, 4, 6, 2, 1], [4, 4, 5, 3, 2]));
ok('same pair: the second kicker decides', beats([4, 4, 6, 3, 1], [4, 4, 6, 2, 1]));
ok('same pair: the last kicker decides', beats([4, 4, 6, 3, 2], [4, 4, 6, 3, 1]));
ok('same pair, same kickers: a tie', tie([4, 4, 6, 3, 2], [3, 6, 4, 2, 4]));
ok('two pairs: the higher pair decides', beats([6, 6, 1, 1, 2], [5, 5, 4, 4, 6]));
ok('two pairs: the lower pair decides', beats([5, 5, 4, 4, 1], [5, 5, 3, 3, 6]));
ok('two pairs: the kicker decides', beats([5, 5, 4, 4, 3], [5, 5, 4, 4, 2]));
ok('three of a kind: the triple decides', beats([3, 3, 3, 1, 2], [2, 2, 2, 6, 5]));
ok('three of a kind: the kickers decide', beats([3, 3, 3, 6, 1], [3, 3, 3, 5, 4]));
ok('full house: the triple decides, not the pair', beats([3, 3, 3, 1, 1], [2, 2, 2, 6, 6]));
ok('full house: the pair decides', beats([3, 3, 3, 5, 5], [3, 3, 3, 4, 4]));
ok('four of a kind: the four decides', beats([2, 2, 2, 2, 6], [1, 1, 1, 1, 6]));
ok('four of a kind: the odd die decides', beats([2, 2, 2, 2, 5], [2, 2, 2, 2, 4]));
ok('five of a kind: the value decides', beats([4, 4, 4, 4, 4], [3, 3, 3, 3, 3]));
ok('nothing: the second die decides', beats([6, 5, 3, 2, 1], [6, 4, 3, 2, 1]));
ok('nothing: the last die decides', beats([6, 5, 4, 3, 1], [6, 5, 4, 2, 1]));
ok('two small straights tie', tie([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]));
ok('two big straights tie', tie([2, 3, 4, 5, 6], [6, 5, 4, 3, 2]));
ok('a hand ties itself', tie([1, 3, 3, 4, 6], [3, 4, 1, 6, 3]));
eq('names: pair', evaluate([4, 4, 1, 2, 6]).name, 'Pair of fours');
eq('names: two pairs', evaluate([6, 1, 6, 1, 3]).name, 'Two pairs, sixes and ones');
eq('names: full house', evaluate([2, 2, 5, 5, 5]).name, 'Full house, fives over twos');
eq('names: nothing', evaluate([6, 4, 3, 2, 1]).name, 'Nothing, six high');
eq('names: three', evaluate([3, 3, 3, 1, 2]).name, 'Three threes');
eq('which dice make a pair', madeDice([1, 4, 2, 4, 6]), [1, 3]);
eq('which die makes nothing', madeDice([1, 5, 2, 3, 6]), [4]);

// ---- every possible roll --------------------------------------------------------------------------------
{
  const counts = new Array(9).fill(0);
  let consistent = true, nothingOk = true;
  const d = [0, 0, 0, 0, 0];
  for (let i = 0; i < 7776; i++) {
    let x = i;
    for (let k = 0; k < 5; k++) { d[k] = 1 + (x % 6); x = Math.floor(x / 6); }
    const h = evaluate(d);
    counts[h.rank]++;
    if (h.rank === RANK.nothing && !(Math.max(...d) === 6 && Math.min(...d) === 1 && h.name === 'Nothing, six high')) nothingOk = false;
    if (h.score !== scoreOf(d)) consistent = false;
  }
  ok('every nothing hand is six high and one low', nothingOk);
  eq('counts of each hand over all 7776 rolls', counts, [480, 3600, 1800, 1200, 120, 120, 300, 150, 6]);
  ok('scoreOf agrees with evaluate on every roll', consistent);
  ok('252 distinct hands', ORDINALS_COUNT() === 252, `${ORDINALS_COUNT()}`);
  const r = rng(11);
  let order = true;
  for (let i = 0; i < 3000; i++) {
    const a = Array.from({ length: 5 }, () => 1 + Math.floor(r() * 6)), b = Array.from({ length: 5 }, () => 1 + Math.floor(r() * 6));
    const c = compare(a, b);
    if (c !== -compare(b, a) || c !== Math.sign(ordinalOf(a) - ordinalOf(b))) order = false;
  }
  ok('compare is antisymmetric and follows the ordinal', order);
}

// ---- rerolling ------------------------------------------------------------------------------------------------
{
  let n = 0;
  eq('rolling no dice again has one outcome', eachOutcome([1, 2, 3, 4, 5], MASKS[0], () => { n++; }), 1);
  eq('rolling two dice again has 36', eachOutcome([1, 2, 3, 4, 5], [true, false, true, false, false], () => {}), 36);
  eq('rolling all five has 7776', eachOutcome([1, 1, 1, 1, 1], [true, true, true, true, true], () => {}), 7776);
  const D = distribution([1, 1, 1, 1, 1], [true, true, true, true, true]);
  ok('a reroll distribution sums to one', Math.abs(D.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const keep4 = distribution([6, 6, 6, 6, 1], [false, false, false, false, true]);
  const five = keep4[ordinalOf([6, 6, 6, 6, 6])];
  ok('four sixes and one die to roll: one in six for five sixes', Math.abs(five - 1 / 6) < 1e-9);
  void n;
}

// ---- the AI ---------------------------------------------------------------------------------------------------
const calm = { risk: 0, raiseAt: 0.6, raiseP: 1, callAt: 0.4, bluff: 0, bluffBelow: 0, stubborn: 0, noise: 0 };
{
  const ai = createAI(calm, rng(1));
  const mask = (mine, theirs = [1, 2, 4, 5, 6]) => ai.chooseReroll(mine, theirs).mask.map(Number);
  eq('five of a kind: keep everything', mask([4, 4, 4, 4, 4]), [0, 0, 0, 0, 0]);
  eq('four of a kind: roll only the odd die', mask([4, 4, 2, 4, 4]), [0, 0, 1, 0, 0]);
  eq('full house: keep everything', mask([3, 3, 5, 5, 3]), [0, 0, 0, 0, 0]);
  eq('big straight: keep everything', mask([2, 3, 4, 5, 6]), [0, 0, 0, 0, 0]);
  eq('small straight: keep everything', mask([1, 2, 3, 4, 5]), [0, 0, 0, 0, 0]);
  eq('three of a kind: roll the other two', mask([5, 1, 5, 2, 5]), [0, 1, 0, 1, 0]);
  eq('two pairs: roll the odd die', mask([2, 2, 6, 6, 3]), [0, 0, 0, 0, 1]);
  eq('a pair: keep it and roll the other three', mask([3, 3, 1, 5, 6]), [0, 0, 1, 1, 1]);
  const lost = ai.chooseReroll([1, 2, 3, 5, 6], [6, 6, 6, 6, 1]);
  ok('nothing against four of a kind still chases the best draw (rolls at least three)', lost.mask.filter(Boolean).length >= 3, JSON.stringify(lost.mask));
}
{
  // every personality keeps a made four of a kind, and none is ever worse than keeping all five
  for (const name of Object.keys(PERSONALITIES)) {
    const ai = createAI(name, rng(5));
    ai.params.noise = 0;
    const mk = ai.chooseReroll([6, 6, 6, 6, 2], [1, 2, 3, 5, 6]).mask.map(Number);
    ok(`${name}: keeps four sixes`, mk[0] + mk[1] + mk[2] + mk[3] === 0, JSON.stringify(mk));
  }
}
{
  // raising and calling over a spread of hands (fresh random hands, many trials)
  const trial = (name, times) => {
    const r = rng(77);
    const ai = createAI(name, rng(9));
    const roll = () => Array.from({ length: 5 }, () => 1 + Math.floor(r() * 6));
    let raises = 0, bluffs = 0, calls = 0, weakHands = 0, weakRaises = 0, weakCalls = 0, weakN = 0, strongRaises = 0, strongN = 0;
    for (let i = 0; i < times; i++) {
      const mine = roll(), theirs = roll();
      const a = ai.assess(mine, theirs);
      const rr = ai.decideRaise(mine, theirs);
      if (rr.raise) raises++;
      if (rr.bluff) bluffs++;
      const cc = ai.decideCall(mine, theirs);
      if (cc.call) calls++;
      if (a.pw < 0.35) { weakHands++; weakN++; if (rr.raise) weakRaises++; if (cc.call) weakCalls++; }
      if (a.pw > 0.8) { strongN++; if (rr.raise) strongRaises++; }
    }
    return { raises: raises / times, bluffs, calls: calls / times, weakRaises: weakRaises / Math.max(1, weakN), weakCalls: weakCalls / Math.max(1, weakN), strongRaises: strongRaises / Math.max(1, strongN), weakHands };
  };
  const c = trial('cautious', 400), b = trial('bold', 400), l = trial('bluffer', 400);
  ok('the cautious one never raises on a weak hand', c.weakRaises === 0 && c.bluffs === 0, JSON.stringify(c));
  ok('the bold one raises more than the cautious one', b.raises > c.raises + 0.1, `${b.raises.toFixed(2)} vs ${c.raises.toFixed(2)}`);
  ok('the bold one calls more than the cautious one', b.calls > c.calls + 0.1, `${b.calls.toFixed(2)} vs ${c.calls.toFixed(2)}`);
  ok('the bluffer raises on weak hands sometimes', l.weakRaises > 0.12 && l.weakRaises < 0.7 && l.bluffs > 10, JSON.stringify(l));
  ok('the bluffer also raises on strong hands', l.strongRaises > 0.3, JSON.stringify(l));
  ok('the cautious one folds most weak hands to a raise', c.weakCalls < 0.15, JSON.stringify(c));
  ok('the bold one still folds the worst', b.weakCalls < 0.6, JSON.stringify(b));
  ok('a strong hand is raised by every personality sometimes', c.strongRaises > 0.2 && b.strongRaises > 0.4 && l.strongRaises > 0.2, JSON.stringify([c.strongRaises, b.strongRaises, l.strongRaises]));
}
{
  // The bluffer says the roll is good while she bluffs; the others say what they see.
  const ai = createAI('bluffer', rng(2));
  eq('a bluffing roll is announced as good', ai.moodAfterRoll([1, 2, 3, 5, 6], [6, 6, 6, 2, 1], true), 'good');
  eq('five sixes look good', createAI('cautious', rng(2)).moodAfterRoll([6, 6, 6, 6, 6], [1, 2, 3, 5, 6]), 'good');
  eq('nothing looks bad', createAI('cautious', rng(2)).moodAfterRoll([1, 2, 3, 5, 6], [6, 6, 6, 2, 1]), 'bad');
  ok('the win chance of a better hand is high', winChance([6, 6, 6, 6, 1], [1, 2, 3, 5, 6]) > 0.8);
  ok('and of a worse one is low', winChance([1, 2, 3, 5, 6], [6, 6, 6, 6, 1]) < 0.2);
}

// ---- the match ----------------------------------------------------------------------------------------------
function play(seed, { opp = OPPONENTS.wojtek, ante = 3, coins = 40, purse = 60, script = null } = {}) {
  const r = rng(seed);
  const m = new Match({ opp, ante, rand: r, coins, purse });
  const total = () => m.coins.player + m.coins.opp + m.stake.player + m.stake.opp;
  const sum = total();
  let steps = 0, conserved = true;
  const log = [];
  while (!m.over && steps++ < 50) {
    if (!m.canStartRound().ok) break;
    m.beginRound();
    conserved = conserved && total() === sum;
    m.rollFirst();
    const bet = script?.bet?.(m) ?? 'hold';
    const out = m.playerBet(bet);
    conserved = conserved && total() === sum;
    if (out?.winner) { log.push(out); continue; }
    const ai = m.aiBet();
    if (m.phase === 'round' || m.phase === 'over') { log.push(m.results[m.results.length - 1]); continue; }
    if (ai.action === 'raise') {
      const resp = script?.respond?.(m) ?? 'call';
      const o2 = m.playerRespond(resp);
      if (o2?.winner) { log.push(o2); continue; }
    }
    m.setPlayerReroll(script?.reroll?.(m) ?? [false, false, false, false, false]);
    m.aiReroll();
    m.rollSecond();
    log.push(m.settle());
    conserved = conserved && total() === sum;
  }
  return { m, log, conserved, sum, total: total() };
}
{
  const a = play(123), b = play(123), c = play(124);
  eq('the same seed plays the same match', a.log.map((x) => [x.winner, x.pot]), b.log.map((x) => [x.winner, x.pot]));
  ok('a different seed can differ', JSON.stringify(a.log.map((x) => x.hands.player.score)) !== JSON.stringify(c.log.map((x) => x.hands.player.score)));
  ok('no coin is made or lost inside a match', a.conserved && a.total === a.sum);
  ok('a match ends with a verdict', a.m.over && ['player', 'opp', 'draw'].includes(a.m.verdict), a.m.verdict);
  ok('the first to two rounds takes the match', a.m.reason === 'wins' ? Math.max(a.m.wins.player, a.m.wins.opp) === 2 : true);
}
{
  // many seeded matches: the rules always hold
  let bad = '';
  const verdicts = { player: 0, opp: 0, draw: 0 };
  for (let seed = 1; seed <= 400; seed++) {
    const opp = Object.values(OPPONENTS)[seed % 3];
    const { m, conserved, sum, total } = play(seed, { opp, ante: 1 + (seed % 3), coins: 30, purse: 40 });
    if (!conserved || sum !== total) bad = `money, seed ${seed}`;
    if (!m.over) bad = `not over, seed ${seed}`;
    if (m.round > 5) bad = `too many rounds, seed ${seed}`;
    if (m.coins.player < 0 || m.coins.opp < 0) bad = `negative coins, seed ${seed}`;
    if (m.reason === 'wins' && Math.max(m.wins.player, m.wins.opp) !== 2) bad = `wins, seed ${seed}`;
    verdicts[m.verdict]++;
  }
  ok('400 seeded matches: money kept, rounds bounded, verdicts valid', bad === '', bad);
  ok('both sides win matches', verdicts.player > 50 && verdicts.opp > 50, JSON.stringify(verdicts));
}
{
  // folds and raises
  const raiseAll = { bet: () => 'raise', respond: () => 'call' };
  let sawFold = false, sawCall = false;
  for (let seed = 1; seed <= 40 && !(sawFold && sawCall); seed++) {
    const { log, conserved } = play(seed, { opp: OPPONENTS.zbyszek, ante: 2, coins: 40, purse: 24, script: raiseAll });
    ok(`seed ${seed}: money kept through raises`, conserved);
    for (const r of log) { if (r.how === 'fold' && r.folded === 'opp') sawFold = true; if (r.how === 'showdown' && r.pot === 8) sawCall = true; }
  }
  ok('the cautious one sometimes folds to a raise', sawFold);
  ok('and sometimes calls it (the pot is four times the ante)', sawCall);
  const foldAll = play(5, { script: { bet: () => 'hold', respond: () => 'fold' } });
  ok('folding to a raise loses the stake only', foldAll.conserved);
  const m = new Match({ opp: OPPONENTS.wojtek, ante: 2, rand: rng(3), coins: 10, purse: 50 });
  m.beginRound(); m.rollFirst();
  const r = m.playerBet('fold');
  ok('folding at the bet gives the pot away', r.winner === 'opp' && r.how === 'fold' && m.coins.player === 8, JSON.stringify([r.winner, m.coins.player]));
  ok('a fold shows who folded', r.folded === 'player');
}
{
  // covering the match
  const m = new Match({ opp: OPPONENTS.halina, ante: 3, rand: rng(4), coins: 5, purse: 50 });
  eq('five grosze cannot cover a stake of three (one raise too)', m.canStartRound(), { ok: false, reason: 'player_short' });
  let threw = false;
  try { m.beginRound(); } catch { threw = true; }
  ok('a round does not begin when the player cannot cover it', threw);
  const m2 = new Match({ opp: OPPONENTS.halina, ante: 3, rand: rng(4), coins: 50, purse: 5 });
  eq('a purse too small is refused too', m2.canStartRound(), { ok: false, reason: 'opp_short' });
  const m3 = new Match({ opp: OPPONENTS.halina, ante: 3, rand: rng(4), coins: 6, purse: 60 });
  ok('exactly twice the stake is enough', m3.canStartRound().ok);
  // running out between rounds ends the match
  const t = play(8, { opp: OPPONENTS.wojtek, ante: 3, coins: 6, purse: 60 });
  ok('a player who cannot cover another round ends the match', t.m.over, `${t.m.reason} ${t.m.verdict}`);
}
{
  // getting up
  const m = new Match({ opp: OPPONENTS.zbyszek, ante: 2, rand: rng(9), coins: 20, purse: 24 });
  m.beginRound(); m.rollFirst();
  const res = m.leave();
  ok('leaving mid-round loses the round, no winner of the match', res.winner === 'opp' && m.over && m.verdict === 'left' && m.coins.player === 18);
  ok('and the pot goes to the other side', m.coins.opp === 26);
  const m2 = new Match({ opp: OPPONENTS.zbyszek, ante: 2, rand: rng(9), coins: 20, purse: 24 });
  eq('leaving before a round costs nothing', [m2.leave(), m2.coins.player], [null, 20]);
}
{
  // a draw returns both stakes
  const m = new Match({ opp: OPPONENTS.zbyszek, ante: 2, rand: rng(1), coins: 20, purse: 24 });
  m.beginRound(); m.rollFirst();
  m.dice.player = [2, 3, 4, 5, 6]; m.dice.opp = [6, 5, 4, 3, 2];
  m.phase = 'show';
  const r = m.settle();
  ok('equal hands draw and give both stakes back', r.winner === 'draw' && m.coins.player === 20 && m.coins.opp === 24 && m.wins.player === 0 && m.draws === 1);
  ok('a drawn round is replayed (the match goes on)', !m.over);
}

// ---- the roll: a scripted path that always ends on the chosen face --------------------------------------
{
  const SIZE = 0.05, TABLE = 0.9, REST = TABLE + SIZE / 2;
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), prevP = new THREE.Vector3(), prevQ = new THREE.Quaternion();
  let badFace = 0, badPos = 0, belowTable = 0, jumpP = 0, jumpQ = 0, maxDur = 0, minDur = 9, events = 0, plans = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 31);
    const value = 1 + (seed % 6);
    const dir = seed % 2 ? 1 : -1;
    const slot = new THREE.Vector3((seed % 5 - 2) * 0.085, REST, dir * 0.17);
    const plan = planRoll({ start: new THREE.Vector3(slot.x * 0.5, TABLE + 0.2, -dir * 0.3), slot, value, size: SIZE, tableY: TABLE, rand: r, dir, delay: (seed % 3) * 0.05 });
    plans++;
    maxDur = Math.max(maxDur, plan.duration); minDur = Math.min(minDur, plan.duration);
    events += plan.events.length;
    plan.sample(plan.duration + 0.5, pos, q);
    if (topFace(q) !== value) badFace++;
    if (pos.distanceTo(slot) > 1e-4) badPos++;
    const steps = Math.ceil(plan.duration * 120);
    for (let i = 0; i <= steps; i++) {
      plan.sample(i / 120, pos, q);
      if (pos.y < REST - 1e-5) belowTable++;
      if (i) {
        if (pos.distanceTo(prevP) > 0.05) jumpP++;
        if (2 * Math.acos(Math.min(1, Math.abs(q.dot(prevQ)))) > 0.75) jumpQ++;
      }
      prevP.copy(pos); prevQ.copy(q);
    }
  }
  ok('300 rolls end with the chosen face up', badFace === 0, `${badFace} wrong`);
  ok('and end exactly on their slot', badPos === 0, `${badPos} off`);
  ok('no die sinks into the table on the way', belowTable === 0, `${belowTable} samples`);
  ok('no jumps in position (0.05 m in 1/120 s) or in turning (0.75 rad)', jumpP === 0 && jumpQ === 0, `pos ${jumpP}, turn ${jumpQ}`);
  ok('a roll takes between three quarters of a second and a second and a half', minDur > 0.7 && maxDur < 1.6, `${minDur.toFixed(2)} to ${maxDur.toFixed(2)}`);
  ok('every roll has its landing events', events >= plans * 3);
  const rest = faceUp(5, 0.2);
  ok('faceUp rests a die with that face up', topFace(rest) === 5 && topFace(faceUp(1, 1)) === 1 && topFace(faceUp(6, -2)) === 6);
  const hop = planHop({ p0: new THREE.Vector3(0, REST, 0), p1: new THREE.Vector3(0.1, REST + 0.02, 0.1), q0: faceUp(3), q1: faceUp(3, 0.5), dur: 0.2 });
  hop.sample(1, pos, q);
  ok('a hop ends where it was sent', pos.distanceTo(new THREE.Vector3(0.1, REST + 0.02, 0.1)) < 1e-6);
  const shake = planShake({ center: new THREE.Vector3(0, TABLE + 0.2, -0.3), q0: faceUp(2), dur: 0.8, rand: rng(2) });
  let far = 0;
  for (let i = 0; i < 100; i++) { shake.sample(i * 0.008, pos, q); far = Math.max(far, pos.distanceTo(new THREE.Vector3(0, TABLE + 0.2, -0.3))); }
  ok('a shake stays within a few centimetres of its centre', far > 0.004 && far < 0.03, far.toFixed(4));
}

// ---- what they say ------------------------------------------------------------------------------------
{
  const SITUATIONS = ['roll', 'good', 'bad', 'raise', 'call', 'fold', 'win', 'lose', 'broke'];
  for (const o of Object.values(OPPONENTS)) {
    for (const s of SITUATIONS) {
      const n = o.lines[s]?.length || 0;
      ok(`${o.name}: ${s} has three to six lines`, n >= 3 && n <= 6, `${n}`);
    }
    ok(`${o.name}: stake range sane`, o.stakes[0] >= 1 && o.stakes[1] >= o.stakes[0] && o.purse >= o.stakes[1] * 4);
    ok(`${o.name}: a known personality`, !!PERSONALITIES[o.personality]);
  }
  const all = voiceLines();
  ok('no em dashes in any line', all.every(([, t]) => !/[—–]/.test(t)));
  ok('no line is said twice by one person', new Set(all.map(([s, t]) => `${s}|${t}`)).size === all.length);
  const r = rng(5);
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 30; i++) { last = pickLine(OPPONENTS.zbyszek, 'win', r, last); seen.add(last); }
  ok('lines vary and never repeat back to back', seen.size === 4);
  let again = true;
  last = 'x';
  for (let i = 0; i < 50; i++) { const t = pickLine(OPPONENTS.halina, 'roll', r, last); if (t === last) again = false; last = t; }
  ok('pickLine avoids the line just said', again);
}

console.log(`dice tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
