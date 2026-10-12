// dice_halina: Halina, who sells the smoked fish and sits at the middle table of the Drowned Bell from the middle of the day.
// She plays Kosci (src/minigames/dice) quietly, for small stakes, and now and then raises on nothing.
//
// Entry: Talk to Halina (src/story/controller/npcs.js). cast: halina. She is seated: no animations on her lines.
// Sets:  dice_met_halina (first talk; the side quest "Dice at the Drowned Bell" starts), dice_known.
// Ends:  at the node 'dice_go' the controller starts the match (result.end === 'dice_go').
export default {
  id: 'dice_halina',
  cast: ['halina'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S, D) => {
        // The evening of the rite everyone goes down to the shore.
        if ((D.G.time?.day ?? 1) >= 2 && (D.G.time?.hours ?? 12) >= 18.5 && !S.flag('ending')) return 'late';
        if (!S.flag('dice_met_halina')) return 'h1';
        return S.flag('dice_beat_halina') ? 'back_won' : 'back';
      },
    },

    // ---- first time ---------------------------------------------------------------------------
    h1: { s: 'halina', t: "Mind where you sit. That end's Wojtek's.", do: (S) => { S.set('dice_met_halina'); S.set('dice_known'); }, next: 'h2' },
    h2: { s: 'vesna', t: 'I heard dice.', next: 'h3' },
    h3: { s: 'halina', t: "You heard Wojtek. I play quieter.", next: 'h4' },
    h4: { s: 'halina', t: "Two grosze a round, if you want it, and six at the most. I've flour to buy at the end of the month.", next: 'ask' },

    ask: {
      choices: [
        { t: 'Deal me in.', next: 'check1' },
        { t: 'How does it go?', next: 'rules1', once: true },
        { t: 'Not now.', next: 'bye' },
      ],
    },
    rules1: { s: 'vesna', t: 'How does it go?', next: 'rules2' },
    rules2: { s: 'halina', t: "Five dice each, and you may roll any of them again, once. After the first throw anyone can raise. Once.", next: 'rules3' },
    rules3: { s: 'halina', t: "The one who's raised against can fold. I've done it. I'll do it again.", next: 'ask' },

    // Can she cover it, can she: the dice game knows (G.dice), until it has loaded the coins are all there is to check.
    check1: { if: (S, D) => (D.G.dice ? D.G.dice.canPlay('halina').reason !== 'player_short' : S.has('coins', 4)), else: 'poor', next: 'check2' },
    check2: { if: (S, D) => !D.G.dice || D.G.dice.canPlay('halina').reason !== 'opp_short', else: 'broke', next: 'dice_go' },
    poor: { s: 'halina', t: "Four grosze on you, at least. I don't take promises.", next: 'ask' },
    broke: { s: 'halina', t: "I've put out what I brought. Ask me tomorrow.", end: true },

    // The controller reads the end node: 'dice_go' starts the match.
    dice_go: { s: 'halina', t: 'Sit, then. Put it down where I can see it.', end: true },

    bye: { s: 'halina', t: "Another time, then.", end: true },

    late: { s: 'halina', t: "Not tonight. I'm walking down with the rest.", end: true },

    // ---- later ----------------------------------------------------------------------------------
    back: { s: 'halina', t: 'Back? Sit.', next: 'ask' },
    back_won: { s: 'halina', t: "You had the luck, that's all. Sit, if you like.", next: 'ask' },
  },
};
