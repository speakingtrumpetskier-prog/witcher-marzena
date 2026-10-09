// miller_wife: Bozena at the mill house, stirring. Short.
//
// Entry: any interaction with the miller's wife. cast: miller_wife. Sets nothing.
// Before the wolves are dead she is short with Vesna and mostly worried; after wolves_mill_done she
// talks about the soup and the children.
export default {
  id: 'miller_wife',
  cast: ['miller_wife'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('wolves_mill_done') ? 'a1' : 'b1') },

    // wolves still out there
    b1: { s: 'miller_wife', t: "Wipe your feet. I've just done it.", a: 'stir', next: 'b2' },
    b2: { s: 'vesna', t: 'Your husband put up a paper.', next: 'b3' },
    b3: { s: 'miller_wife', t: "He did. He won't say it, but he hasn't slept.", next: 'b4' },
    b4: { s: 'vesna', t: 'Where are the children?', next: 'b5' },
    b5: { s: 'miller_wife', t: "Inside. They've been inside for six days. They fight.", next: 'b6' },
    b6: { s: 'miller_wife', t: 'Kill them, and you can have whatever is in the pot.', end: true },

    // after
    a1: { s: 'miller_wife', t: "Gniewko says they're gone.", a: 'stir', next: 'a2' },
    a2: { s: 'vesna', t: 'All five.', next: 'a3' },
    a3: { s: 'miller_wife', t: 'I let them out into the yard this morning. They came back in covered in snow and I could have kissed them.', next: 'a4' },
    a4: { s: 'miller_wife', t: "There's soup. It's turnip, I'm sorry. It was turnip yesterday.", end: true },
  },
};
