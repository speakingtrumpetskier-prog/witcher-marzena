// Kosci, the tavern dice game (dice poker). G.dice is created by init(G); the story controller (src/story/controller/dice.js)
// loads this module the first time somebody asks for a game, so nothing here costs anything at boot.
//
//   G.dice.play('zbyszek' | 'wojtek' | 'halina', { seed?, speed?, drive? })  -> Promise<result>   (see game.js)
//   G.dice.canPlay(id)       -> { ok, reason }   reason: player_short | opp_short | busy | no_table
//   G.dice.purse(id)         -> grosze the opponent has in hand today
//   G.dice.record()          -> the record kept in the save (G.state.data.dice): matches, rounds, grosze, best hand
//   G.dice.active            true while a game is on (the story counts it as busy: no prompts, no barks)
//   G.dice.last              the result of the last match;  G.dice.session  the one in progress
//   events: dice:start, dice:phase { phase }, dice:round, dice:match { opp, verdict, net, wins }
// Rules in rules.js, opponents in opponents.js, the table in stage.js, the screen in ui.js, the order of things in game.js.
// Docs: docs/ARCHITECTURE.md "Kosci", docs/STORY.md "Kosci".
import { DiceSession, diceRecord, purseOf } from './game.js';
import { OPPONENTS } from './opponents.js';

export async function init(G) {
  if (G.dice) return G.dice;
  const api = {
    active: false,
    last: null,
    session: null,
    opponents: OPPONENTS,
    canPlay(id) {
      const opp = OPPONENTS[id];
      if (!opp) return { ok: false, reason: 'no_table' };
      return new DiceSession(G, { opp: id }).canPlay();
    },
    purse(id) { const opp = OPPONENTS[id]; return opp ? purseOf(G, opp).coins : 0; },
    record() { return diceRecord(G); },
    async play(id, opts = {}) {
      if (!OPPONENTS[id]) return { played: false, reason: 'no_table' };
      const s = new DiceSession(G, { ...opts, opp: id });
      api.session = s;
      try { return await s.run(); } finally { api.session = null; }
    },
  };
  G.dice = api;
  return api;
}
