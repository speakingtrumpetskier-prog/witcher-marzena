// miller_wife: Bozena at the mill house, stirring.
//
// Entry: any interaction with the miller's wife. cast: miller_wife.
// Before the wolves are dead she is short with Vesna and mostly worried; after wolves_mill_done she
// talks about the soup and the children, and (needs planetnicy_seen) the herders sitting over the yard.
// Side quest "The Hand-Bell" (docs/STORY.md, src/story/controller/side.js): she asks Vesna to ring her
// father-in-law's hand-bell at the ritual ring at dusk. The topic 'bell' sets handbell_asked when Vesna
// agrees; the controller starts the quest after the talk. After handbell_rung she pays 20 grosze once
// (handbell_paid, guarded).
// Sets:  bozena_after (first talk after the wolves), herders_over_yard (Vesna has heard the complaint),
//        handbell_asked, handbell_paid.
export default {
  id: 'miller_wife',
  cast: ['miller_wife'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S) => {
        if (!S.flag('wolves_mill_done')) return 'b1';
        if (S.flag('handbell_asked') && S.flag('handbell_rung') && !S.flag('handbell_paid')) return 'rw1';
        if (S.flag('handbell_asked') && !S.flag('handbell_rung')) return 'rm1';
        return S.flag('bozena_after') ? 'g1' : 'a1';
      },
    },

    // wolves still out there
    b1: { s: 'miller_wife', t: "Wipe your feet. I've just done it.", a: 'stir', next: 'b2' },
    // (she may come to the mill before she has read his paper on the board)
    b2: { s: 'vesna', t: (S) => (S.flag('wolves_contract_read') ? 'Your husband put up a paper.' : 'Is the miller about?'), next: 'b3' },
    b3: {
      s: 'miller_wife',
      t: (S) => (S.flag('wolves_contract_read')
        ? "He did. He won't say it, but he hasn't slept."
        : "Out at the wheel. If it's about the wolves, he put a paper up in the square. They took our dog. He hasn't slept."),
      next: 'b4',
    },
    b4: { s: 'vesna', t: 'Where are the children?', next: 'b5' },
    b5: { s: 'miller_wife', t: "Inside. They've been inside for six days. They fight.", next: 'b6' },
    b6: { s: 'miller_wife', t: 'Kill them, and you can have whatever is in the pot.', end: true },

    // after
    a1: { s: 'miller_wife', t: "Gniewko says they're gone.", a: 'stir', do: (S) => S.set('bozena_after'), next: 'a2' },
    a2: { s: 'vesna', t: 'All five.', next: 'a3' },
    a3: { s: 'miller_wife', t: 'I let them out into the yard this morning. They came back in covered in snow and I could have kissed them.', next: 'a4' },
    a4: { s: 'miller_wife', t: "There's soup. It's turnip, I'm sorry. It was turnip yesterday.", next: 'ahub' },
    g1: { s: 'miller_wife', t: "Soup's on, if you want it. Still turnip.", a: 'stir', next: 'ahub' },

    ahub: {
      choices: [
        { t: 'You have a lot of company over the yard.', next: 'sk1', once: true, if: (S) => !!S.flag('planetnicy_seen') },
        { t: (S) => (S.flag('herders_over_yard') ? 'What bell?' : 'Is there anything you need done?'), next: 'bl1', if: (S) => !S.flag('handbell_asked') && !S.flag('handbell_paid') },
        { t: 'Thank you for the soup.', next: 'bye', exit: true },
      ],
    },

    // the herders over the yard
    sk1: { s: 'vesna', t: 'You have a lot of company over the yard.', next: 'sk2' },
    sk2: { s: 'miller_wife', t: 'They sit there from noon. Then it snows on the yard. Not on the hill, not on the wheel. The yard.', a: 'stir', next: 'sk3' },
    sk3: { s: 'vesna', t: 'On the washing.', next: 'sk4' },
    sk4: { s: 'miller_wife', t: "On the line, on the step I've just swept. Gniewko says it's the same snow wherever it lands.", next: 'sk5' },
    sk5: { s: 'miller_wife', t: 'His mother would have been out with the bell by now.', do: (S) => S.set('herders_over_yard'), next: 'ahub' },

    // the hand-bell
    bl1: { s: 'vesna', t: (S) => (S.flag('herders_over_yard') ? 'What bell?' : 'Is there anything you need done?'), next: 'bl2' },
    bl2: { s: 'miller_wife', t: "Gniewko's father had a hand-bell. Brass, about so big.", a: 'stir', next: 'bl3' },
    bl3: { s: 'miller_wife', t: 'Every spring it would hail on the blossom, and he took it out to the ring on the last of the ice at dusk and rang it three times. They turned it off the orchard.', next: 'bl4' },
    bl4: { s: 'vesna', t: 'They turned it.', next: 'bl5' },
    bl5: { s: 'miller_wife', t: "The herders. They hear it and they go over. I don't know how it works. I only held the lamp.", next: 'bl6' },
    bl6: { s: 'vesna', t: "Where's the bell now?", next: 'bl7' },
    bl7: { s: 'miller_wife', t: 'He left it out there the last good spring, tied to a pole so it would be to hand.', next: 'bl7b' },
    bl7b: { s: 'miller_wife', t: 'He died the second winter. Nobody went for it.', next: 'bl8' },
    bl8: { s: 'vesna', t: 'The orchard.', next: 'bl9' },
    bl9: { s: 'miller_wife', t: 'Forty trees behind the house. Plum and apple. Not a leaf on them since the first winter.', a: 'stir', next: 'bl10' },
    bl10: { s: 'miller_wife', t: "You'll say there's no sense in it.", next: 'bl11' },
    bl11: { s: 'vesna', t: "I wasn't going to say anything.", next: 'blq' },
    blq: {
      choices: [
        { t: "I'll look for it.", next: 'ok1' },
        { t: 'Not today.', next: 'no1', exit: true },
      ],
    },
    ok1: { s: 'vesna', t: "I'll look for it.", do: (S) => S.set('handbell_asked'), next: 'ok2' },
    ok2: { s: 'miller_wife', t: "Twenty grosze for the walk. It's what there is.", next: 'ok3' },
    ok3: { s: 'miller_wife', t: 'Dusk, mind. Not before. Three times, and not a fourth.', end: true },
    no1: { s: 'vesna', t: 'Not today.', next: 'no2' },
    no2: { s: 'miller_wife', t: "It's been out there two years.", next: 'ahub' },

    // asked, not rung yet
    rm1: { s: 'miller_wife', t: "It'll be on one of the poles. Look for the rag round the clapper. Dusk, mind.", a: 'stir', end: true },

    // rung
    rw1: { s: 'miller_wife', t: 'Well?', a: 'stir', next: 'rw2' },
    rw2: { s: 'vesna', t: 'I rang it at the ring, at dusk. Three times.', next: 'rw3' },
    rw3: { s: 'miller_wife', t: 'And?', next: 'rw4' },
    rw4: { s: 'vesna', t: 'Some of them came down.', next: 'rw5' },
    rw5: { s: 'miller_wife', t: 'They do that.', wait: 0.8, next: 'rw6' },
    rw6: { s: 'miller_wife', t: "Twenty. It's all there.", do: (S) => { if (!S.flag('handbell_paid')) { S.give('coins', 20); S.set('handbell_paid'); } }, next: 'rw7' },
    rw7: { s: 'miller_wife', t: 'Leave the bell where it is. Somebody will want it again.', next: 'ahub' },

    bye: { s: 'miller_wife', t: "Eat it while it's hot.", a: 'stir', end: true },
  },
};
