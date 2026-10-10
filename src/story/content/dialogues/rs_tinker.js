// rs_tinker: the tinker on the pass road, and later at the stalls in the square (src/story/controller/roadside/tinker.js).
//
// Entry: the roadside controller picks the start node. Before the sledge is mended: 'entry' (first time a1, after that
// 'again'). Ending at 'lift' starts the hold-to-lift sequence; after it the controller starts this at 'd1' (the thanks and
// the offer). Ending at 'buy' makes the controller take 8 grosze and hand over a Thaw draught if she can have one.
// Once mended, 'shop' is every talk with him, at the sledge's end of the road and in the village.
// cast: tinker. Sets: tinker_met.
export default {
  id: 'rs_tinker',
  cast: ['tinker'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('tinker_helped') ? 'shop' : S.flag('tinker_met') ? 'again' : 'a1') },

    a1: { s: 'tinker', t: "Keep to that side. It's resting on the one runner and I don't trust it.", a: 'point', do: (S) => S.set('tinker_met'), next: 'a2' },
    a2: { s: 'vesna', t: 'What happened?', next: 'a3' },
    a3: { s: 'tinker', t: "The runner split at the knee. It went on the pass, I felt it go, and I've been dragging it since. I've rope and a mallet and I haven't got a third hand.", next: 'hub' },

    again: { s: 'tinker', t: "Still down. I'd be grateful for a pair of hands.", next: 'hub' },

    hub: {
      choices: [
        { t: "What's on it?", next: 'w1', once: true },
        { t: 'Where are you headed?', next: 'h1', once: true },
        { t: "I'll hold it up.", next: 'l1' },
        { t: 'Not now.', next: 'no1', exit: true },
      ],
    },

    w1: { s: 'vesna', t: 'What are you carrying?', next: 'w2' },
    w2: { s: 'tinker', t: "Pots, kettles, ladles. A hundred and some spoons. If I unload it I only have to load it again, and my back isn't the one I came with.", a: 'shrug', next: 'hub' },

    h1: { s: 'vesna', t: 'Where are you headed?', next: 'h2' },
    h2: { s: 'tinker', t: "Marzena. I haven't been through in three years. Is Zbyszek still keeping the Bell?", next: 'h3' },
    h3: { if: (S) => !!S.flag('met_zbyszek'), else: 'h3b', s: 'vesna', t: 'He is.', next: 'h4' },
    // she has not been down to the village yet
    h3b: { s: 'vesna', t: "I haven't been down yet.", next: 'h4b' },
    h4b: { s: 'tinker', t: "The Drowned Bell. You'll find it, there's only the one. The beer was thin last time.", next: 'hub' },
    h4: { s: 'tinker', t: 'Is the beer still thin?', next: 'h5' },
    h5: { s: 'vesna', t: 'Yes.', next: 'h6' },
    h6: { s: 'tinker', t: "Good. I've told people about that beer.", next: 'hub' },

    l1: { s: 'vesna', t: "I'll hold it up.", next: 'l2' },
    l2: { s: 'tinker', t: "Take the corner by the load. Lift when I say and don't put it down till I've tied it off. It won't take long.", next: 'lift' },
    lift: { s: 'tinker', t: 'Now.', a: 'beckon', end: true },

    no1: { s: 'vesna', t: 'Not now.', next: 'no2' },
    no2: { s: 'tinker', t: "I'll be here.", end: true },

    // after the lift: the runner is lashed and the sledge is down
    d1: { s: 'tinker', t: "That's the knee. It'll get me to the village, and I'll put a proper runner on there.", a: 'nod', next: 'd2' },
    d2: { s: 'tinker', t: "I've no money to give you. I can sell you a Thaw draught for eight grosze. The tavern asks twelve.", next: 'd3' },
    d3: { s: 'vesna', t: 'Where do you get them?', next: 'd4' },
    d4: { s: 'tinker', t: 'A woman at the foot of the pass makes them. I add a grosz for the carrying.', next: 'offerRoad' },
    offerRoad: {
      choices: [
        { t: 'Eight, then.', next: 'buy' },
        { t: 'Not now.', next: 'no5', exit: true },
      ],
    },
    no5: { s: 'vesna', t: 'Not now.', next: 'no6' },
    no6: { s: 'tinker', t: "I'll be by the stalls in the square, mornings, when it isn't snowing.", end: true },

    // every later talk
    shop: { next: (S) => ((S.flag('tinker_stock') ?? 0) <= 0 ? 'sold' : S.count('thaw') >= 3 ? 'full' : S.count('coins') < 8 ? 'poor' : 's1') },
    s1: { s: 'tinker', t: 'Pots mended, spoons, kettles. Thaw draught, eight grosze.', next: 'offer' },
    full: { s: 'tinker', t: "You've three on you already. Come back when you've used one.", end: true },
    poor: { s: 'tinker', t: "Eight grosze. I can't go lower, I pay seven.", end: true },
    sold: { s: 'tinker', t: "I'm out of the draughts. Pots, spoons, kettles, if you need them.", end: true },

    offer: {
      choices: [
        { t: 'Eight, then.', next: 'buy' },
        { t: 'Not now.', next: 'no3', exit: true },
      ],
    },
    buy: { s: 'vesna', t: 'Eight, then.', end: true },
    no3: { s: 'vesna', t: 'Not now.', next: 'no4' },
    no4: { s: 'tinker', t: 'As you like.', end: true },
  },
};
