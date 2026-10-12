// rs_goat_owner: Zofia, outside the west gate by day, whose goat is out (src/story/controller/roadside/goat.js).
//
// Entry: the controller starts it at 'entry'. First meeting: she asks after the goat (a1) and Vesna can say she will look
// (sets goat_asked, which opens the journal entry). With the goat on the rope behind her (flag goat_tied) the talk is 'r1' and
// ends at 'pay': the controller hands the rope over and gives three eggs. Afterwards, with the goat home, 'after'.
// cast: goat_owner. Sets: goat_asked.
export default {
  id: 'rs_goat_owner',
  cast: ['goat_owner'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('goat_home') ? 'after' : S.flag('goat_tied') ? 'r1' : S.flag('goat_asked') ? 'again' : 'a1') },

    a1: { s: 'goat_owner', t: 'You came down the pass road. Did you see a goat? White, one ear folded over.', a: 'point', next: 'a2' },
    a2: { s: 'vesna', t: 'No.', next: 'a3' },
    a3: { s: 'goat_owner', t: "She was through the fence yesterday. The wind drops it. She's never gone far, but there's nothing to eat out here and she'll have gone looking.", next: 'hub' },

    hub: {
      choices: [
        { t: 'Where would she look?', next: 'w1', once: true },
        { t: "I'll look for her.", next: 'l1' },
        { t: 'Not my business.', next: 'n1', exit: true },
      ],
    },

    w1: { s: 'vesna', t: 'Where would she look?', next: 'w2' },
    w2: { s: 'goat_owner', t: "Where it's green. There's nothing green. My husband says there's grass under the twisted pines past the marsh, a little, where the branches keep the snow off. Don't ask me how he knows.", next: 'hub' },

    l1: { s: 'vesna', t: "I'll look for her.", next: 'l2' },
    l2: { s: 'goat_owner', t: "She bites. If you bring her back, there's three eggs, and they're not for anyone else.", do: (S) => S.set('goat_asked'), end: true },

    n1: { s: 'vesna', t: 'Not my business.', next: 'n2' },
    n2: { s: 'goat_owner', t: "No. I wouldn't think so.", end: true },

    again: { s: 'goat_owner', t: 'Any sign of her?', next: 'ag2' },
    ag2: { s: 'vesna', t: 'Not yet.', next: 'ag3' },
    ag3: { s: 'goat_owner', t: "She'll be cold.", end: true },

    r1: { s: 'goat_owner', t: "That's her. That's her, look. Come here. Come here, you stupid animal.", a: 'wave', next: 'r2' },
    r2: { s: 'vesna', t: 'She was in the twisted pines, under the trees.', next: 'r3' },
    r3: { s: 'goat_owner', t: "Jan was right, then. He'll be unbearable.", next: 'r4' },
    r4: { s: 'goat_owner', t: "Three eggs, as I said. I'll not have it said I didn't pay.", next: 'pay' },
    pay: { s: 'vesna', t: 'All right.', end: true },

    after: { s: 'goat_owner', t: "She won't leave my side now. Jan wants to mend the fence. He's wanted to mend the fence since the autumn.", end: true },
  },
};
