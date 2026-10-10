// dice_wojtek: Wojtek the woodcutter, at the middle table of the Drowned Bell from noon. He plays Kosci (dice
// poker, src/minigames/dice) loudly, for real money, and bets like it is not his.
//
// Entry: Talk to Wojtek (src/story/controller/npcs.js). cast: wojtek. He is seated: no animations on his lines.
// Sets:  dice_met_wojtek (first talk; the side quest "Dice at the Drowned Bell" starts), dice_known.
// Ends:  at the node 'dice_go' the controller starts the match (result.end === 'dice_go'); any other end just ends the talk.
// Needs: nothing. Coins are checked by the dice game itself (a stake of 3 grosze needs 6 on you).
export default {
  id: 'dice_wojtek',
  cast: ['wojtek'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S, D) => {
        // The evening of the rite everyone goes down to the shore.
        if ((D.G.time?.day ?? 1) >= 2 && (D.G.time?.hours ?? 12) >= 18.5 && !S.flag('ending')) return 'late';
        if (!S.flag('dice_met_wojtek')) return 'w1';
        return S.flag('dice_beat_wojtek') ? 'back_won' : 'back';
      },
    },

    // ---- first time ---------------------------------------------------------------------------
    w1: { s: 'wojtek', t: "Don't lean on the table, it's got a wobble.", do: (S) => { S.set('dice_met_wojtek'); S.set('dice_known'); }, next: 'w2' },
    w2: { s: 'vesna', t: 'I heard dice.', next: 'w3' },
    w3: { s: 'wojtek', t: "That was me. Halina says I throw them like I'm splitting wood.", next: 'w4' },
    w4: { s: 'wojtek', t: "Three grosze a round and up. Best of three. You in?", next: 'ask' },

    ask: {
      choices: [
        { t: 'Deal me in.', next: 'check1' },
        { t: 'How does it go?', next: 'rules1', once: true },
        { t: 'Not now.', next: 'bye' },
      ],
    },
    rules1: { s: 'vesna', t: 'How does it go?', next: 'rules2' },
    rules2: { s: 'wojtek', t: "Five dice each. You throw all five, you look, you pick the ones you don't like and throw those again. Once.", next: 'rules3' },
    rules3: { s: 'wojtek', t: "Pair, two pairs, three the same, then a run, three and a pair, four the same, five. Higher dice win a tie.", next: 'rules4' },
    rules4: { s: 'wojtek', t: "Zbyszek's got it chalked up behind the bar, if you can't hold it in your head.", next: 'ask' },

    // Can she cover it, can he: the dice game knows (G.dice), until it has loaded the coins are all there is to check.
    check1: { if: (S, D) => (D.G.dice ? D.G.dice.canPlay('wojtek').reason !== 'player_short' : S.has('coins', 6)), else: 'poor', next: 'check2' },
    check2: { if: (S, D) => !D.G.dice || D.G.dice.canPlay('wojtek').reason !== 'opp_short', else: 'broke', next: 'dice_go' },
    poor: { s: 'wojtek', t: "Six grosze on you, at least. I don't play for promises.", next: 'ask' },
    broke: { s: 'wojtek', t: "That's the week's wages gone. Ask me tomorrow.", end: true },

    // The controller reads the end node: 'dice_go' starts the match.
    dice_go: { s: 'wojtek', t: 'Sit, then. Put your coin where I can see it.', end: true },

    bye: { s: 'wojtek', t: 'Suit yourself.', end: true },

    late: { s: 'wojtek', t: "Not tonight. Everybody's going down to the shore.", end: true },

    // ---- later ----------------------------------------------------------------------------------
    back: { s: 'wojtek', t: 'Back for more?', next: 'ask' },
    back_won: { s: 'wojtek', t: "You again. I'm not done being angry about last time.", next: 'ask' },
  },
};
