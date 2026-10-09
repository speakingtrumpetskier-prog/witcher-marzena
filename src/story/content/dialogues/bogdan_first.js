// bogdan_first: the reeve in the longhouse, first meeting. The purse.
//
// Entry: first interaction with Bogdan (not met_bogdan). cast: bogdan.
// Sets:  met_bogdan, and took_reeve_money (+100 grosze, S.give('coins', 100)) or refused_reeve_money.
//        Both are set at the choice, so the journal line is always true.
// Reads: heard_of_maiden (set by zbyszek_hub). Without it Vesna asks who carries the effigy instead
//        of "And the girl?", and Bogdan answers plainly instead of "You've been talking to people."
// The scene ends on every path with the same line, so the controller does not have to check the node.
// A player who leaves the hub early still gets the purse: he was going to offer it anyway.
export default {
  id: 'bogdan_first',
  cast: ['bogdan'],
  start: 'b1',
  nodes: {
    b1: { s: 'bogdan', t: "We didn't send for anyone.", a: 'sit_bench', next: 'b2' },
    b2: { s: 'vesna', t: 'Someone did.', next: 'b3' },
    b3: { s: 'bogdan', t: 'Then someone can pay you.', next: 'b4' },
    b4: { s: 'narrator', t: 'He finishes the column he is adding. Then he looks at her.', italic: true, dur: 3.2, next: 'b5' },
    b5: { s: 'vesna', t: "Your hearth's cold.", next: 'b6' },
    b6: { s: 'bogdan', t: "I light it when the ink freezes. It hasn't frozen.", next: 'hub' },

    hub: {
      choices: [
        { t: 'How bad is it? The village.', next: 'v1', once: true },
        { t: 'Three men have gone missing.', next: 'm1', once: true },
        { t: 'There is a contract on the board. Who put it there?', next: 'c1', once: true },
        { t: 'What happens tomorrow night?', next: 'r1' },
        { t: "That's all I wanted.", next: 'x1', exit: true },
      ],
    },

    // how bad
    v1: { s: 'vesna', t: 'How bad is it?', next: 'v2' },
    v2: { s: 'bogdan', t: 'We went into the winter with ninety sacks of rye. There are forty-one.', next: 'v3' },
    v3: { s: 'bogdan', t: "There's a hundred and eighty-six of us. You can do sums.", next: 'v4' },
    v4: { s: 'vesna', t: 'How long does that last?', next: 'v5' },
    v5: { s: 'bogdan', t: 'At half a measure? Five weeks. Less, if anyone else comes over the pass.', a: 'shake_head', next: 'hub' },

    // the three
    m1: { s: 'vesna', t: 'Three men have gone missing.', next: 'm2' },
    m2: { s: 'bogdan', t: 'They went through the ice. It happens every winter.', next: 'm3' },
    m3: { s: 'vesna', t: 'Three in a month. And no bodies.', next: 'm4' },
    m4: { s: 'bogdan', t: "It's a deep lake. I'm not sending a man out to look for three men I've already lost.", next: 'm5' },
    m5: { s: 'bogdan', t: "Stach had four at home. Pawlak's taken them on her share, and Pawlak's a widow. That's seven mouths on one share, if you want it plain.", next: 'hub' },

    // the contract
    c1: { s: 'vesna', t: 'There is a contract on the board. Who put it there?', next: 'c2' },
    c2: { s: 'bogdan', t: "I don't read the board. I know what's on it.", next: 'c3' },
    c3: { s: 'vesna', t: "It's signed H.", next: 'c4' },
    c4: { s: 'bogdan', t: 'Is it.', next: 'c5' },
    c5: { s: 'narrator', t: 'The pen stops. It starts again.', italic: true, dur: 2.2, next: 'hub' },

    // the rite, and the girl
    r1: { s: 'vesna', t: 'What happens tomorrow night?', next: 'r2' },
    r2: { s: 'bogdan', t: 'Tomorrow night we do the rite, and that\'s the end of it.', next: 'r3' },
    r3: { s: 'vesna', t: (S) => (S.flag('heard_of_maiden') ? 'And the girl?' : 'Who carries her out?'), next: (S) => (S.flag('heard_of_maiden') ? 'r4' : 'r4b') },
    r4: { s: 'bogdan', t: 'You\'ve been talking to people.', wait: 1.3, a: 'cross_arms', next: 'p1' },
    r4b: { s: 'bogdan', t: 'A girl from the village. Same as every year.', next: 'p1' },

    // leaving early
    x1: { s: 'bogdan', t: 'Then we are done.', next: 'p1' },

    // the purse
    p1: { s: 'narrator', t: 'He takes a purse from inside his coat and puts it on the table.', italic: true, dur: 3, next: 'p2' },
    p2: { s: 'bogdan', t: 'A hundred grosze. The pass will take one rider, if she\'s careful.', next: 'pc' },
    pc: {
      choices: [
        { t: 'Is that what it is worth?', next: 'h1', once: true },
        { t: 'All right.', next: 'took' },
        { t: 'Keep it.', next: 'refused' },
      ],
    },
    h1: { s: 'vesna', t: 'Is that all it is worth to you?', next: 'h2' },
    h2: { s: 'bogdan', t: "I haven't got two hundred. I haven't got a hundred, if I'm honest. Take it or don't.", next: 'pc' },

    took: { s: 'vesna', t: 'All right.', do: (S) => { S.set('took_reeve_money'); S.set('met_bogdan'); S.give('coins', 100); }, next: 'took2' },
    took2: { s: 'narrator', t: 'He writes it in the ledger.', italic: true, dur: 2.2, next: 'out' },

    refused: { s: 'vesna', t: 'Keep it.', do: (S) => { S.set('refused_reeve_money'); S.set('met_bogdan'); }, next: 'refused2' },
    refused2: { s: 'bogdan', t: "A hundred. You won't be offered it twice.", next: 'refused3' },
    refused3: { s: 'narrator', t: 'He puts the purse back inside his coat.', italic: true, dur: 2.2, next: 'out' },

    out: { s: 'bogdan', t: 'And stay off the lake. People go through it.', end: true },
  },
};
