// jarek_after: Jarek once the bird has been left in the belfry (bird_given).
//
// Entry: any interaction with Jarek with bird_given set. cast: jarek. Sets nothing.
// Vesna chooses how much to tell him. Day or night (the huts or the corner) does not change the lines.
export default {
  id: 'jarek_after',
  cast: ['jarek'],
  start: 'a1',
  nodes: {
    a1: { s: 'narrator', t: 'Jarek looks up as soon as he sees her.', italic: true, dur: 2.8, next: 'a2' },
    a2: { s: 'jarek', t: 'Did you go?', next: 'a3' },
    a3: { s: 'vesna', t: 'I went.', next: 'q' },

    q: {
      choices: [
        { t: "It's on the table, at the top of the tower.", next: 't1' },
        { t: 'She asked if her mother sent me.', next: 'm1' },
      ],
    },

    t1: { s: 'vesna', t: "It's on the table, at the top of the tower.", next: 't2' },
    t2: { s: 'jarek', t: 'On a table.', next: 't3' },
    t3: { s: 'vesna', t: 'With the bread.', next: 't4' },
    t4: { s: 'jarek', t: 'Good.', wait: 1.2, next: 't5' },
    t5: { s: 'jarek', t: "That's good. Did she see it?", next: 't6' },
    t6: { s: 'vesna', t: "I don't know.", next: 'fin' },

    m1: { s: 'vesna', t: 'She asked if her mother sent me.', next: 'm2' },
    m2: { s: 'jarek', t: 'Her mother.', wait: 1.4, next: 'm3' },
    m3: { s: 'jarek', t: "She'd ask that. She used to wait at the door for her to come in.", next: 'm4' },
    m4: { s: 'vesna', t: 'I left the bird where she would see it.', next: 'fin' },

    fin: { s: 'jarek', t: 'I gave her a scarf once. She said it itched. She wore it all the same.', wait: 0.8, next: 'fin2' },
    fin2: { s: 'narrator', t: 'He turns back to what he was doing.', italic: true, dur: 2.2, next: 'fin3' },
    fin3: { s: 'jarek', t: "I should get on.", end: true },
  },
};
