// One match of Kosci: the rounds, the pot, the betting, the dice and who wins. Pure state machine; the table
// scene, the screen and the story call its methods in order and wait on whatever they animate in between.
//
//   const m = new Match({ opp, ante, rand, coins, purse })     opp: an entry of OPPONENTS (or { personality, ... })
//   m.canStartRound()           -> { ok, reason }       both sides must cover a round and one raise (2 x ante)
//   m.beginRound()              both stake the ante                                phase 'roll1'
//   m.rollFirst()               -> { player: [5], opp: [5] }                        phase 'bet'
//   m.playerBet('hold' | 'raise' | 'fold')                                          phase 'ai' (or the round ends)
//   m.aiBet()                   -> { action: 'call' | 'fold' | 'raise' | 'hold', bluff, pw }   'select' or 'respond'
//   m.playerRespond('call' | 'fold')   after the other side raised                  phase 'select'
//   m.setPlayerReroll(mask)     mask: five booleans, true rolls that die again
//   m.aiReroll()                -> mask                                              (the opponent chooses)
//   m.rollSecond()              -> { player: [5], opp: [5], mask: { player, opp } }  phase 'show'
//   m.settle()                  -> result of the round (see below); phase 'round' or 'over'
//   m.leave()                   forfeit the round in play and end the match
//
// A round is staked at `ante` by each side. After the first roll the player acts first: hold, raise by the ante,
// or (facing a raise) fold. If the player holds, the opponent may raise by the ante; the player then calls or folds.
// There is at most one raise a round. A fold gives the pot to the other side at once. After the betting each side
// rolls again whichever of its dice it picks, once; then the better hand takes the pot (a tie returns both
// stakes and the round is played again). The first to win two rounds wins the match; there are at most five rounds
// (drawn rounds are replayed), and a side that cannot cover another round ends the match.
//
// Result of a round: { round, winner: 'player' | 'opp' | 'draw', how: 'showdown' | 'fold' | 'forfeit', pot, gain (the
// player's net change this round), hands: { player, opp } (evaluate()), over: bool, verdict }.
import { rollDice, evaluate, compare, DICE } from './rules.js';
import { createAI } from './ai.js';

const side = (s) => (s === 'player' ? 'opp' : 'player');

export class Match {
  constructor({ opp, ante, rand = Math.random, coins = 0, purse = 0, winsNeeded = 2, maxRounds = 5 }) {
    this.opp = opp;
    this.ante = Math.max(1, Math.floor(ante));
    this.rand = rand;
    this.winsNeeded = winsNeeded;
    this.maxRounds = maxRounds;
    this.ai = createAI(opp.personality || 'cautious', rand);
    this.coins = { player: coins, opp: purse };
    this.start = { player: coins, opp: purse };
    this.stake = { player: 0, opp: 0 };
    this.wins = { player: 0, opp: 0 };
    this.draws = 0;
    this.round = 0;
    this.phase = 'ready';
    this.dice = { player: [1, 1, 1, 1, 1], opp: [1, 1, 1, 1, 1] };
    this.first = { player: null, opp: null }; // the first roll, kept for the screen
    this.mask = { player: [false, false, false, false, false], opp: [false, false, false, false, false] };
    this.plan = null;
    this.raised = null; // { by: 'player' | 'opp' }
    this.bluff = false; // the opponent raised on a hand it does not believe in
    this.over = false;
    this.verdict = null;
    this.reason = null;
    this.results = [];
    this.bestHand = null; // the player's best hand shown down
  }

  get pot() { return this.stake.player + this.stake.opp; }
  get raiseAmount() { return this.ante; }
  get net() { return this.coins.player - this.start.player; }

  _need(phase) {
    if (this.phase !== phase) throw new Error(`dice: expected phase ${phase}, in ${this.phase}`);
  }

  canStartRound() {
    if (this.over) return { ok: false, reason: 'over' };
    if (this.round >= this.maxRounds) return { ok: false, reason: 'rounds' };
    if (this.coins.player < this.ante * 2) return { ok: false, reason: 'player_short' };
    if (this.coins.opp < this.ante * 2) return { ok: false, reason: 'opp_short' };
    return { ok: true, reason: null };
  }

  beginRound() {
    if (this.phase !== 'ready' && this.phase !== 'round') throw new Error(`dice: cannot begin a round in ${this.phase}`);
    const c = this.canStartRound();
    if (!c.ok) throw new Error(`dice: cannot start a round (${c.reason})`);
    this.round++;
    this.stake.player = this.stake.opp = this.ante;
    this.coins.player -= this.ante;
    this.coins.opp -= this.ante;
    this.raised = null;
    this.bluff = false;
    this.mask.player = [false, false, false, false, false];
    this.mask.opp = [false, false, false, false, false];
    this.phase = 'roll1';
    return { round: this.round, ante: this.ante, pot: this.pot };
  }

  rollFirst() {
    this._need('roll1');
    this.dice.player = rollDice(this.rand);
    this.dice.opp = rollDice(this.rand);
    this.first.player = [...this.dice.player];
    this.first.opp = [...this.dice.opp];
    // The opponent's mind is made up once the dice are down: what it would do if the player holds (raise or not, and
    // whether that is a bluff) and if the player raises (call or fold). The screen reads mood() for what it says.
    this.plan = {
      raise: this.ai.decideRaise(this.dice.opp, this.dice.player),
      call: this.ai.decideCall(this.dice.opp, this.dice.player),
    };
    this.phase = 'bet';
    return { player: [...this.dice.player], opp: [...this.dice.opp] };
  }

  // How the opponent feels about its first roll: 'good' | 'bad' | 'plain' (a bluffer who means to raise says 'good').
  mood() {
    return this.ai.moodAfterRoll(this.dice.opp, this.dice.player, !!(this.plan?.raise.raise && this.plan.raise.bluff));
  }

  // What the player is allowed to do right now.
  options() {
    if (this.phase === 'bet') {
      return { raise: this.coins.player >= this.raiseAmount, hold: true, fold: false };
    }
    if (this.phase === 'respond') return { call: this.coins.player >= this.raiseAmount, fold: true };
    return {};
  }

  _pay(who, n) {
    this.coins[who] -= n;
    this.stake[who] += n;
  }

  playerBet(action) {
    this._need('bet');
    if (action === 'fold') return this._fold('player');
    if (action === 'raise') {
      if (this.coins.player < this.raiseAmount) throw new Error('dice: the player cannot cover a raise');
      this._pay('player', this.raiseAmount);
      this.raised = { by: 'player' };
    } else if (action !== 'hold') throw new Error(`dice: unknown bet ${action}`);
    this.phase = 'ai';
    return { phase: this.phase };
  }

  aiBet() {
    this._need('ai');
    if (this.raised?.by === 'player') {
      const d = this.plan.call;
      if (d.call && this.coins.opp >= this.raiseAmount) {
        this._pay('opp', this.raiseAmount);
        this.phase = 'select';
        return { action: 'call', pw: d.pw, bluff: false };
      }
      this._fold('opp');
      return { action: 'fold', pw: d.pw, bluff: false };
    }
    const d = this.plan.raise;
    if (d.raise && this.coins.opp >= this.raiseAmount) {
      this._pay('opp', this.raiseAmount);
      this.raised = { by: 'opp' };
      this.bluff = d.bluff;
      this.phase = 'respond';
      return { action: 'raise', pw: d.pw, bluff: d.bluff };
    }
    this.phase = 'select';
    return { action: 'hold', pw: d.pw, bluff: false };
  }

  playerRespond(action) {
    this._need('respond');
    if (action === 'fold') return this._fold('player');
    if (action !== 'call') throw new Error(`dice: unknown response ${action}`);
    if (this.coins.player < this.raiseAmount) throw new Error('dice: the player cannot cover the raise');
    this._pay('player', this.raiseAmount);
    this.phase = 'select';
    return { phase: this.phase };
  }

  _fold(who) {
    this._folded = who;
    return this.settle(side(who), 'fold');
  }

  setPlayerReroll(mask) {
    this._need('select');
    this.mask.player = Array.from({ length: DICE }, (_, i) => !!mask[i]);
  }

  aiReroll() {
    this._need('select');
    const pick = this.ai.chooseReroll(this.dice.opp, this.dice.player);
    this.mask.opp = pick.mask.map(Boolean);
    return this.mask.opp;
  }

  rollSecond() {
    this._need('select');
    for (const who of ['player', 'opp']) {
      this.dice[who] = this.dice[who].map((v, i) => (this.mask[who][i] ? 1 + Math.floor(this.rand() * 6) : v));
    }
    this.phase = 'show';
    return { player: [...this.dice.player], opp: [...this.dice.opp], mask: { player: [...this.mask.player], opp: [...this.mask.opp] } };
  }

  // The round ends. Called with no arguments after rollSecond(); folds and forfeits pass the winner and how.
  settle(forceWinner = null, how = 'showdown') {
    if (forceWinner == null) this._need('show');
    const hands = { player: evaluate(this.dice.player), opp: evaluate(this.dice.opp) };
    let winner = forceWinner;
    if (!winner) {
      const c = compare(this.dice.player, this.dice.opp);
      winner = c > 0 ? 'player' : c < 0 ? 'opp' : 'draw';
    }
    const pot = this.pot;
    // The player's net this round: what came back minus what went in.
    const net = winner === 'player' ? pot - this.stake.player : winner === 'opp' ? -this.stake.player : 0;
    if (winner === 'draw') {
      this.coins.player += this.stake.player;
      this.coins.opp += this.stake.opp;
      this.draws++;
    } else {
      this.coins[winner] += pot;
      this.wins[winner]++;
    }
    if (how === 'showdown' && winner === 'player' && (!this.bestHand || hands.player.score > this.bestHand.score)) this.bestHand = hands.player;
    this.stake.player = this.stake.opp = 0;
    this.phase = 'round';
    const lead = this.wins.player > this.wins.opp ? 'player' : this.wins.opp > this.wins.player ? 'opp' : 'draw';
    let verdict = null, reason = null;
    if (this.wins.player >= this.winsNeeded) { verdict = 'player'; reason = 'wins'; }
    else if (this.wins.opp >= this.winsNeeded) { verdict = 'opp'; reason = 'wins'; }
    else if (this.round >= this.maxRounds) { verdict = lead; reason = 'rounds'; }
    else {
      const c = this.canStartRound();
      if (!c.ok) { verdict = lead; reason = c.reason; }
    }
    if (verdict) { this.over = true; this.verdict = verdict; this.reason = reason; this.phase = 'over'; }
    const result = {
      round: this.round, winner, how, pot, gain: net, hands, over: this.over, verdict: this.verdict, reason: this.reason,
      folded: how === 'fold' ? this._folded : null, wins: { ...this.wins },
    };
    this._folded = null;
    this.results.push(result);
    return result;
  }

  // The player gets up from the table. The round in play is lost; the match ends with no winner.
  leave() {
    if (this.over) return null;
    let result = null;
    if (this.phase !== 'ready' && this.phase !== 'round') {
      this._folded = 'player';
      result = this.settle('opp', 'forfeit');
    }
    this.over = true;
    this.verdict = 'left';
    this.reason = 'left';
    this.phase = 'over';
    if (result) { result.over = true; result.verdict = 'left'; result.reason = 'left'; }
    return result;
  }
}
