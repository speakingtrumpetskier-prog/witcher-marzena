// The opponents' heads: which dice to roll again, whether to raise, call or fold. Pure; takes a random
// number function so a seeded match plays out the same every time.
//
//   PERSONALITIES              cautious, bold, bluffer: the numbers below
//   createAI(personality, rand) -> {
//     personality,
//     assess(mine, theirs)             -> { pw, mask, mean }       chance of winning if I reroll the best way
//     chooseReroll(mine, theirs)       -> { mask, pw, why }        mask: five booleans, true rolls that die again
//     decideRaise(mine, theirs)        -> { raise, pw, bluff }     my turn after the first roll, nobody has raised
//     decideCall(mine, theirs)         -> { call, pw }             the other side raised: call or fold
//     moodAfterRoll(mine, theirs)      -> 'good' | 'bad' | 'plain'  what a bark about the roll should say
//   }
//
// How it thinks. For its own five dice it works out, for each of the 32 ways to roll some of them again,
// the average chance of finishing with a better hand than the other side (rules.js evaluateRerolls). The
// other side's finish is modelled as a sensible player's: they keep what the average hand value says.
// A personality changes what it wants from that table (cautious: steady results; bold: a chance of a big
// hand), how readily it raises and calls, and whether it ever raises on a hand it does not believe in.
import { evaluateRerolls, sensibleDistribution, maskCount, MASKS, DICE, evaluate, RANK } from './rules.js';

// risk: weight on the spread of outcomes (positive avoids, negative likes variance).
// raiseAt: chance of winning above which it raises; raiseP: how often it does then.
// callAt: lowest chance of winning at which it calls a raise. bluff: how often it raises anyway when it
// is below bluffBelow. stubborn: how often it calls a raise it would fold. noise: how often it takes
// the second-best reroll.
export const PERSONALITIES = {
  cautious: { risk: 0.5, raiseAt: 0.8, raiseP: 0.55, callAt: 0.55, bluff: 0, bluffBelow: 0, stubborn: 0, noise: 0.03 },
  bold: { risk: -0.45, raiseAt: 0.5, raiseP: 0.8, callAt: 0.33, bluff: 0, bluffBelow: 0, stubborn: 0.1, noise: 0.07 },
  bluffer: { risk: 0, raiseAt: 0.62, raiseP: 0.6, callAt: 0.4, bluff: 0.45, bluffBelow: 0.4, stubborn: 0.12, noise: 0.05 },
};

export function createAI(personality = 'cautious', rand = Math.random) {
  const P = typeof personality === 'string' ? PERSONALITIES[personality] : personality;
  if (!P) throw new Error(`unknown personality ${personality}`);
  const name = typeof personality === 'string' ? personality : 'custom';

  // Distribution of the other side's final hand, given their dice on the table.
  const model = (theirs) => sensibleDistribution(theirs).dist;

  function assess(mine, theirs) {
    const { best } = evaluateRerolls(mine, model(theirs));
    return { pw: best.mean, mask: best.mask, mean: best.mean };
  }

  function chooseReroll(mine, theirs) {
    const { best, table } = evaluateRerolls(mine, model(theirs));
    // What this personality makes of each row: the average chance, adjusted for how much it swings.
    const util = (r) => r.mean - P.risk * r.sd * 0.5;
    const ranked = [...table].sort((a, b) => util(b) - util(a) || a.count - b.count);
    let pick = ranked[0];
    let why = 'best';
    // Now and then it misjudges: takes the next-best choice, but only when that is nearly as good.
    if (P.noise && rand() < P.noise) {
      const near = ranked.slice(1, 4).filter((r) => util(ranked[0]) - util(r) < 0.05);
      if (near.length) { pick = near[Math.floor(rand() * near.length)]; why = 'slip'; }
    }
    return { mask: pick.mask, pw: pick.mean, best: best.mean, why };
  }

  function decideRaise(mine, theirs) {
    const { pw } = assess(mine, theirs);
    if (pw >= P.raiseAt && rand() < P.raiseP) return { raise: true, pw, bluff: false };
    if (P.bluff && pw < P.bluffBelow && rand() < P.bluff) return { raise: true, pw, bluff: true };
    return { raise: false, pw, bluff: false };
  }

  function decideCall(mine, theirs) {
    const { pw } = assess(mine, theirs);
    if (pw >= P.callAt) return { call: true, pw };
    if (P.stubborn && rand() < P.stubborn) return { call: true, pw };
    return { call: false, pw };
  }

  // How the first roll looks to its owner, for the line it says about it. A bluffer who is bluffing
  // says it looks good.
  function moodAfterRoll(mine, theirs, bluffing = false) {
    if (bluffing) return 'good';
    const h = evaluate(mine);
    const { pw } = assess(mine, theirs);
    if (h.rank >= RANK.three || pw >= 0.68) return 'good';
    // only an empty hand is called bad out loud: a pair that is behind is not "nothing"
    if (h.rank === RANK.nothing) return 'bad';
    return 'plain';
  }

  return { personality: name, params: P, assess, chooseReroll, decideRaise, decideCall, moodAfterRoll };
}

export { MASKS, maskCount, DICE };
