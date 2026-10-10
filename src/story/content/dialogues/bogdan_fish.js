// bogdan_fish: Vesna and the reeve about fish. A rod from the beam over his cold hearth, the fish she has caught (he
// weighs them on the grain scale and pays out of the village money), what bites where, and the old pike under the bell
// tower: his father's waxed line and the thin place by the tower (side_oldone).
//
// Entry: the story controller (controller/npcs.js) offers it before the usual talk when she has fish to sell, has been
//        out on the ice, has been turned away from a hole for want of a rod, or has landed the pike. cast: bogdan.
//        Ends at 'regular' (she wants the ordinary talk after all) or at 'bye'.
// Sets:  bogdan_fish_met, rod_lent (item rod), oldone_heard, oldone_asked (item strong_line), oldone_paid (the pike's price
//        in coins; the line goes back to him). Selling goes through G.fishing.sellAll, which leaves the pike in the basket.
// The amounts are not spoken (so every line stays one fixed text that can be voiced): the HUD note "+N grosze" says what she was paid.
const money = (D) => D.G.fishing?.lastSale?.coins ?? 0;

export default {
  id: 'bogdan_fish',
  cast: ['bogdan'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S) => {
        if (S.flag('oldone_landed') && !S.flag('oldone_paid')) return 'p1';
        return S.flag('bogdan_fish_met') ? 'again' : 'g1';
      },
    },

    // ---- first word about it ---------------------------------------------------------------------------------------
    g1: {
      s: 'bogdan', a: 'sit_bench', do: (S) => S.set('bogdan_fish_met'),
      t: (S) => (S.flag('fished') ? 'They tell me you were out on the shelf with a rod.' : 'Somebody said you were standing at a hole with nothing in your hands.'),
      next: 'g2',
    },
    g2: { s: 'bogdan', t: "It's no business of mine. What comes up goes in the stores, and I'll buy what you bring.", next: 'hub' },
    again: { s: 'bogdan', t: 'Yes?', next: 'hub' },

    hub: {
      choices: [
        { t: 'I need a rod.', next: 'rod1', if: (S) => !S.count('rod') },
        { t: 'I have fish for you.', next: 'sell1', if: (S) => !!S.data.fish?.basket?.some((e) => !e.special) },
        { t: 'What bites out there, and where?', next: 'bite1', once: true },
        { t: 'About the pike by the tower.', next: 'old1', if: (S) => !!S.flag('oldone_heard') && !S.flag('oldone_asked') },
        { t: 'Something else.', next: 'regular' },
        { t: "That's all.", next: 'bye', exit: true },
      ],
    },

    // ---- a rod ----------------------------------------------------------------------------------------------------------
    rod1: { s: 'vesna', t: 'I need a rod. For the ice.', next: 'rod2' },
    rod2: { s: 'bogdan', t: "There's one on the beam over the hearth. It was my father's. Nobody's lit that hearth since October.", next: 'rod3' },
    rod3: { s: 'bogdan', t: 'Take it down yourself. Mind the tip, Jarek spliced it.', next: 'rod4' },
    rod4: {
      s: 'vesna', t: 'Thank you.',
      do: (S, D) => { S.give('rod', 1); S.set('rod_lent'); D.G.ui?.notify?.('Ice rod', 'item'); D.G.audio?.sfx?.('item_pickup', { volume: 0.6 }); },
      next: 'rod5',
    },
    rod5: { s: 'bogdan', t: 'Bring it back if you go over the pass.', next: 'hub' },

    // ---- selling --------------------------------------------------------------------------------------------------------
    sell1: { s: 'vesna', t: 'I have fish for you.', next: 'sell2' },
    sell2: { s: 'bogdan', t: 'Put them on the scale.', a: 'cross_arms', do: (S, D) => { D.G.fishing?.sellAll?.(); }, next: 'sell3' },
    sell3: { s: 'bogdan', t: (S, D) => D.G.fishing?.lastSale?.line || 'Nothing.', wait: 1.2, next: 'sell4' },
    sell4: { s: 'bogdan', t: "I'll put it in the book.", next: 'sell5' },
    sell5: { if: (S, D) => money(D) >= 25, else: 'hub', s: 'bogdan', t: "The big ones go to Pawlak's first. She has seven at the table.", next: 'hub' },

    // ---- what bites -----------------------------------------------------------------------------------------------------
    bite1: { s: 'vesna', t: 'What bites out there, and where?', next: 'bite2' },
    bite2: { s: 'bogdan', t: "On the shelf in front of the huts it's perch and roach. Midday, high in the water. Children's fish.", next: 'bite3' },
    bite3: { s: 'bogdan', t: "Out past the shelf you get bream, and burbot if you stay after dark. Burbot lies on the bottom. Pike you get at first light or at dusk, and you'll know it when you have one.", next: 'bite4' },
    bite4: { s: 'bogdan', t: "Go on a clear night, when they're low over the lake. They bite then. All of them.", next: 'bite5' },
    bite5: { s: 'vesna', t: 'Who says?', next: 'bite6' },
    bite6: { s: 'bogdan', t: 'Anybody who has sat out there.', next: 'bite7' },
    bite7: { s: 'vesna', t: 'And by the tower?', next: 'bite8' },
    bite8: { s: 'bogdan', t: "Nobody sits by the tower.", wait: 1.0, next: 'bite9' },
    bite9: { s: 'vesna', t: 'Why not?', next: 'bite10' },
    bite10: { s: 'bogdan', t: "There's a pike under it.", next: 'bite11' },
    bite11: { s: 'bogdan', t: "My father hooked it once. It took forty yards of line and the stick it was tied to. I had it on myself when I was nineteen, most of an hour. Then the line went.", do: (S) => S.set('oldone_heard'), next: 'bite12' },
    bite12: { s: 'bogdan', t: "Everyone's lost a line there. Jarek. The Wrona boys. Stach lost two.", next: 'hub' },

    // ---- the old pike ---------------------------------------------------------------------------------------------------
    old1: { s: 'vesna', t: 'About the pike. How big?', next: 'old2' },
    old2: { s: 'bogdan', t: "Twenty kilos. More. I've seen it come up under the ice in the dark, a shape as long as that bench.", a: 'point', next: 'old3' },
    old3: { s: 'vesna', t: 'You want it.', next: 'old4' },
    old4: { s: 'bogdan', t: "I want it on a table. That's a week for Pawlak's house and the Nowaks and half the shelf.", next: 'old5' },
    old5: { s: 'vesna', t: 'It breaks lines.', next: 'old6' },
    old6: { s: 'bogdan', t: "Not this one.", next: 'old7' },
    old7: { s: 'bogdan', t: "It was my father's. Horsehair and flax, waxed. I have never let anyone put it in the water.", next: 'old8' },
    old8: { s: 'vesna', t: 'Why me?', next: 'old9' },
    old9: { s: 'bogdan', t: "You have nothing to do till tomorrow night. And nobody here has the evenings.", next: 'old10' },
    old10: { s: 'bogdan', t: "There's a place by the tower where the ice is thin. Somebody tied a rag to a stake there, years ago, I don't know who. Cut a hole there. Not wider than a bucket.", next: 'old11' },
    old11: { s: 'bogdan', t: "Go at night, and keep it on the bottom, and be patient. It doesn't come to a jig by day. I've tried.", next: 'oldc' },
    oldc: {
      choices: [
        { t: "All right. I'll try.", next: 'take' },
        { t: 'Not now.', next: 'hub', exit: false },
      ],
    },
    take: {
      s: 'vesna', t: "All right.",
      do: (S, D) => { S.give('strong_line', 1); S.set('oldone_asked'); D.G.ui?.notify?.("Bogdan's line", 'item'); D.G.audio?.sfx?.('item_pickup', { volume: 0.6 }); },
      next: 'take2',
    },
    take2: { s: 'bogdan', t: "Don't lose the line.", next: 'hub' },

    // ---- she has landed it ---------------------------------------------------------------------------------------------
    p1: { s: 'vesna', t: "I've got it.", next: 'p2' },
    p2: { s: 'bogdan', t: 'Put it on the scale.', a: 'cross_arms', wait: 0.8, next: 'p3' },
    p3: { s: 'bogdan', t: (S, D) => D.G.fishing?.pikeWeightText?.() || 'Over twenty kilos.', wait: 1.3, next: 'p3b' },
    p3b: { s: 'bogdan', t: "I'll pay by the kilo, like anything else.", next: 'p4' },
    p4: { s: 'vesna', t: 'There were hooks in its jaw. Three. One still had line on it, tied with red wool.', next: 'p5' },
    p5: { s: 'bogdan', t: "That's Stach's.", wait: 1.8, next: 'p6' },
    p6: {
      s: 'bogdan', t: 'And the line, if you have it.',
      do: (S, D) => {
        D.G.fishing?.payOldOne?.();
        S.take('strong_line', S.count('strong_line'));
        S.set('oldone_paid');
      },
      next: 'p7',
    },
    p7: { s: 'bogdan', t: "The first of it goes to Pawlak's. She has seven at the table.", next: 'hub' },

    regular: { end: true },
    bye: { s: 'bogdan', t: 'Close the door.', end: true },
  },
};
