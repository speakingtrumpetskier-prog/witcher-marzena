// Kosci (dice poker): the rules, as pure functions. No DOM, no three.js, so the tests in
// scripts/dicetest.mjs and the AI run on them directly.
//
//   evaluate(dice)            -> { rank, name, text, score, made }   one hand of five dice
//   compare(a, b)             -> -1 | 0 | 1                          which hand wins (dice arrays)
//   RANK_NAMES / RANK         hand names, low to high, and their ranks
//   scoreOf(dice)             -> integer; a larger score is a better hand, equal scores tie
//   ordinalOf(dice)           -> 0..ORDINALS-1; the same ordering with no gaps (for tables)
//   outcomes(dice, mask)      -> iterate every result of rolling the dice picked by mask once more
//   distribution(dice, mask)  -> Float64Array over ordinals: the chance of each final hand
//   rng(seed), rollDice(r, n) seeded random numbers and dice
//
// Hands, low to high: nothing (high die), pair, two pairs, three of a kind, small straight (1 to 5),
// big straight (2 to 6), full house, four of a kind, five of a kind. Two hands of the same rank are
// split by the values that make the hand (the higher pair first, the triple before the pair in a full
// house), then by the remaining dice from the highest down. Straights have no values to compare, so two
// straights of one kind tie, as do two hands equal in every die value.
import { rng } from '../../core/util.js';

export { rng };

export const DICE = 5;
export const RANK = {
  nothing: 0, pair: 1, twoPairs: 2, three: 3, smallStraight: 4, bigStraight: 5, fullHouse: 6, four: 7, five: 8,
};
export const RANK_NAMES = [
  'Nothing', 'Pair', 'Two pairs', 'Three of a kind', 'Small straight', 'Big straight', 'Full house', 'Four of a kind', 'Five of a kind',
];
const WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
const PLURAL = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

export const rollDice = (r, n = DICE) => Array.from({ length: n }, () => 1 + Math.floor(r() * 6));

// ---- classification --------------------------------------------------------------------------
// The tie-break digits of a hand, most important first, as values 1 to 6 (shorter lists pad with 0).
// Returns { rank, digits, made } where made is the list of die values that form the hand.
function classify(dice) {
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (const v of dice) count[v]++;
  const groups = []; // [value, count], biggest group first, then the higher value
  for (let v = 6; v >= 1; v--) if (count[v]) groups.push([v, count[v]]);
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = groups[0][1], second = groups[1] ? groups[1][1] : 0;
  const sorted = [...dice].sort((a, b) => b - a);
  const kickers = (used) => sorted.filter((v) => !used.includes(v));
  if (top === 5) return { rank: RANK.five, digits: [groups[0][0]], made: [groups[0][0]] };
  if (top === 4) return { rank: RANK.four, digits: [groups[0][0], groups[1][0]], made: [groups[0][0]] };
  if (top === 3 && second === 2) return { rank: RANK.fullHouse, digits: [groups[0][0], groups[1][0]], made: [groups[0][0], groups[1][0]] };
  const distinct = groups.length === 5;
  if (distinct && count[6] === 0) return { rank: RANK.smallStraight, digits: [], made: [1, 2, 3, 4, 5] };
  if (distinct && count[1] === 0) return { rank: RANK.bigStraight, digits: [], made: [2, 3, 4, 5, 6] };
  if (top === 3) return { rank: RANK.three, digits: [groups[0][0], ...kickers([groups[0][0]])], made: [groups[0][0]] };
  if (top === 2 && second === 2) {
    const hi = groups[0][0], lo = groups[1][0];
    return { rank: RANK.twoPairs, digits: [hi, lo, groups[2][0]], made: [hi, lo] };
  }
  if (top === 2) return { rank: RANK.pair, digits: [groups[0][0], ...kickers([groups[0][0]])], made: [groups[0][0]] };
  return { rank: RANK.nothing, digits: sorted, made: [sorted[0]] };
}

// Base 7 digits so every distinct hand has its own integer: rank, then up to five tie-break digits.
function encode(rank, digits) {
  let s = rank;
  for (let i = 0; i < DICE; i++) s = s * 7 + (digits[i] || 0);
  return s;
}

function describe(rank, digits) {
  switch (rank) {
    case RANK.five: return `Five ${PLURAL[digits[0]]}`;
    case RANK.four: return `Four ${PLURAL[digits[0]]}`;
    case RANK.fullHouse: return `Full house, ${PLURAL[digits[0]]} over ${PLURAL[digits[1]]}`;
    case RANK.bigStraight: return 'Big straight, two to six';
    case RANK.smallStraight: return 'Small straight, one to five';
    case RANK.three: return `Three ${PLURAL[digits[0]]}`;
    case RANK.twoPairs: return `Two pairs, ${PLURAL[digits[0]]} and ${PLURAL[digits[1]]}`;
    case RANK.pair: return `Pair of ${PLURAL[digits[0]]}`;
    default: return `Nothing, ${WORD[digits[0]]} high`;
  }
}

// ---- lookup tables over every possible roll (6^5 = 7776) ---------------------------------------
// The index of a roll is its dice read as base 6 digits, die 0 least significant.
const N = 7776;
const SCORE = new Uint32Array(N);
let ORD = null; // roll index -> ordinal
let ORDINALS = 0;
let ORD_SCORES = null; // ordinal -> score
const POW6 = [1, 6, 36, 216, 1296];

function build() {
  if (ORD) return;
  const dice = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    let x = i;
    for (let d = 0; d < DICE; d++) { dice[d] = 1 + (x % 6); x = Math.floor(x / 6); }
    const c = classify(dice);
    SCORE[i] = encode(c.rank, c.digits);
  }
  const uniq = [...new Set(SCORE)].sort((a, b) => a - b);
  const index = new Map(uniq.map((s, i) => [s, i]));
  ORD = new Uint16Array(N);
  for (let i = 0; i < N; i++) ORD[i] = index.get(SCORE[i]);
  ORDINALS = uniq.length;
  ORD_SCORES = Uint32Array.from(uniq);
}
build();

export const ORDINALS_COUNT = () => ORDINALS;
export const ordinalScores = () => ORD_SCORES;

export const indexOf = (dice) => {
  let x = 0;
  for (let d = 0; d < DICE; d++) x += (dice[d] - 1) * POW6[d];
  return x;
};
export const scoreOf = (dice) => SCORE[indexOf(dice)];
export const ordinalOf = (dice) => ORD[indexOf(dice)];
export const rankOfScore = (score) => Math.floor(score / 16807);

// The full evaluation of one hand, with a name for the screen.
export function evaluate(dice) {
  if (!Array.isArray(dice) || dice.length !== DICE || dice.some((v) => !(v >= 1 && v <= 6))) throw new Error('evaluate needs five dice from 1 to 6');
  const c = classify(dice);
  return {
    rank: c.rank, rankName: RANK_NAMES[c.rank], name: describe(c.rank, c.digits), score: encode(c.rank, c.digits), digits: c.digits,
    made: c.made,
  };
}

// Which dice (indexes) form the hand; the others are kickers. Used to light them on the table.
export function madeDice(dice) {
  const c = classify(dice);
  if (c.rank === RANK.five || c.rank === RANK.fullHouse || c.rank === RANK.smallStraight || c.rank === RANK.bigStraight) return dice.map((_, i) => i);
  if (c.rank === RANK.nothing) return [dice.indexOf(c.made[0])];
  const out = [];
  dice.forEach((v, i) => { if (c.made.includes(v)) out.push(i); });
  return out;
}

export function compare(a, b) {
  const sa = scoreOf(a), sb = scoreOf(b);
  return sa > sb ? 1 : sa < sb ? -1 : 0;
}

// ---- rerolling --------------------------------------------------------------------------------
// mask is five booleans (or 0/1): true rerolls that die. cb(index) is called with the roll index of
// every outcome, with the number of outcomes returned. Allocation free.
export function eachOutcome(dice, mask, cb) {
  const free = [];
  let base = 0;
  for (let d = 0; d < DICE; d++) {
    if (mask[d]) free.push(d); else base += (dice[d] - 1) * POW6[d];
  }
  const total = 6 ** free.length;
  for (let n = 0; n < total; n++) {
    let x = base, m = n;
    for (let f = 0; f < free.length; f++) { x += (m % 6) * POW6[free[f]]; m = Math.floor(m / 6); }
    cb(x);
  }
  return total;
}

// The chance of each final hand (by ordinal) after rerolling the dice in mask.
export function distribution(dice, mask) {
  const out = new Float64Array(ORDINALS);
  const total = eachOutcome(dice, mask, (x) => { out[ORD[x]] += 1; });
  for (let i = 0; i < ORDINALS; i++) out[i] /= total;
  return out;
}

// For a distribution D over ordinals: W[o] is the chance that a hand of ordinal o beats a hand drawn from D
// (a tie counts as half).
export function winTable(D) {
  const W = new Float64Array(ORDINALS);
  let below = 0;
  for (let o = 0; o < ORDINALS; o++) {
    W[o] = below + D[o] * 0.5;
    below += D[o];
  }
  return W;
}

export const MASKS = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].map((d) => (m >> d) & 1));
export const maskCount = (mask) => mask.reduce((a, b) => a + (b ? 1 : 0), 0);

export function ordinalOfIndex(x) { return ORD[x]; }
export function scoreOfOrdinal(o) { return ORD_SCORES[o]; }

// The best a hand can do against a rival whose final hand is drawn from D: what each choice is worth and
// which is best (mean chance of winning). Returns { mask, p, table: [{ mask, mean, sd }] }.
export function evaluateRerolls(dice, D) {
  const W = winTable(D);
  const table = [];
  let best = null;
  for (let m = 0; m < 32; m++) {
    const mask = MASKS[m];
    let sum = 0, sum2 = 0;
    const total = eachOutcome(dice, mask, (x) => { const w = W[ORD[x]]; sum += w; sum2 += w * w; });
    const mean = sum / total, sd = Math.sqrt(Math.max(0, sum2 / total - mean * mean));
    const row = { mask, count: maskCount(mask), mean, sd };
    table.push(row);
    if (!best || mean > best.mean + 1e-12 || (Math.abs(mean - best.mean) <= 1e-12 && row.count < best.count)) best = row;
  }
  return { best, table };
}

// A model of what a hand will end up as when its owner rerolls sensibly: the dice that make the best
// "expected hand" are kept (the choice maximizing the average ordinal), then the rest are rolled again.
// Returns the distribution over ordinals and the mask used.
export function sensibleDistribution(dice) {
  let best = null;
  for (let m = 0; m < 32; m++) {
    const mask = MASKS[m];
    let sum = 0;
    const total = eachOutcome(dice, mask, (x) => { sum += ORD[x]; });
    const mean = sum / total;
    if (!best || mean > best.mean + 1e-9) best = { mask, mean };
  }
  return { mask: best.mask, dist: distribution(dice, best.mask), mean: best.mean / (ORDINALS - 1) };
}

// Chance, before any reroll, that `mine` ends up beating `theirs` when both play sensibly (ties half).
export function winChance(mine, theirs) {
  const D = sensibleDistribution(theirs).dist;
  return evaluateRerolls(mine, D).best.mean;
}
