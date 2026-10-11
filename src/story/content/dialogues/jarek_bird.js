// jarek_bird: side quest "A Bird for Wiesia". Jarek at the Drowned Bell after dark (the corner), or
// mending nets at the fishing huts by day.
//
// Entry: any interaction with Jarek before bird_given. cast: jarek.
//   not jarek_met                -> the full scene
//   jarek_met, not bird_taken    -> he asks again (she declined or walked away)
//   bird_taken, not bird_given   -> a short reminder
// Sets:  jarek_met (start), bird_taken (on accepting, with S.give('bird', 1)).
// Reads: miller_warm_water (the line that makes him cry), time of day (tavern at night, huts by day).
//        knows_wiesia: without it she has not heard the name, so she asks who Wiesia is and he tells her (sets it).
export default {
  id: 'jarek_bird',
  cast: ['jarek'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S, D) => {
        if (S.flag('bird_taken')) return 'rem1';
        if (S.flag('jarek_met')) return 'ag1';
        const h = D.G.time?.hours ?? 12;
        return h >= 18 || h < 4 ? 'jn' : 'jd';
      },
    },

    jn: { s: 'narrator', t: 'Jarek sits in the corner with an empty mug. He watches her cross the room.', italic: true, dur: 3.4, do: (S) => S.set('jarek_met'), next: 'j1' },
    jd: { s: 'narrator', t: 'Jarek is mending a net, badly. His fingers are blue.', italic: true, dur: 3, do: (S) => S.set('jarek_met'), next: 'j1' },
    j1: { s: 'jarek', t: "You're going out there. To her.", next: 'j2' },
    j2: { s: 'vesna', t: 'To who?', next: 'j3' },
    j3: { s: 'jarek', t: 'Wiesia.', wait: 1.2, next: 'j4' },
    j4: { if: (S) => !!S.flag('knows_wiesia'), else: 'j4b', s: 'vesna', t: "Hanka's girl.", next: 'j5' },
    j4b: { s: 'vesna', t: "Who's Wiesia?", next: 'j4c' },
    j4c: { s: 'jarek', t: "Hanka's girl. She went through the ice at the rite.", wait: 0.8, next: 'j5' },
    j5: { s: 'jarek', t: 'She was fourteen.', do: (S) => S.set('knows_wiesia'), next: 'j6' },
    j6: { s: 'narrator', t: 'He takes a small carved bird out of his coat.', italic: true, dur: 2.6, next: 'j7' },
    j7: { s: 'jarek', t: 'I made this. For the rite. For after. I was going to give it to her after.', next: 'j8' },
    j8: { s: 'vesna', t: 'A waxwing.', next: 'j9' },
    j9: { s: 'jarek', t: "They come to the rowan by the well. She'd stand under it an hour.", wait: 0.8, next: 'j10' },
    j10: { s: 'jarek', t: 'I was drunk. I was drunk the night they cut the hole.', wait: 1.4, next: 'j11' },
    j11: { s: 'jarek', t: 'Maybe I cut it in the wrong place. Maybe the ice was thin because of me.', next: 'q1' },

    q1: {
      choices: [
        { t: "It wasn't you. Warm water comes up under the poles.", next: 'w1', if: (S) => !!S.flag('miller_warm_water') },
        { t: "You don't know that it was you.", next: 'u1', once: true },
        { t: 'Why not take it yourself?', next: 'y1', once: true },
        { t: '(Say nothing.)', next: 'sil1', once: true },
        { t: '(Wait.)', next: 'ask' },
      ],
    },

    w1: { s: 'vesna', t: "It wasn't you. Warm water comes up under the poles.", next: 'w2' },
    w2: { s: 'jarek', t: 'What?', next: 'w3' },
    w3: { s: 'vesna', t: "The miller's father wouldn't let anyone fish near them. You put your hand in a hole there and it isn't cold like the others.", next: 'w4' },
    w4: { s: 'jarek', t: 'The ice.', wait: 1.2, next: 'w5' },
    w5: { s: 'jarek', t: "It wasn't me.", a: 'cry', wait: 0.8, next: 'w6' },
    w6: { s: 'narrator', t: 'He cries. Vesna waits.', italic: true, dur: 3.4, next: 'ask' },

    u1: { s: 'vesna', t: "You don't know that it was you.", next: 'u2' },
    u2: { s: 'jarek', t: "You don't know it wasn't.", next: 'u3' },
    u3: { s: 'vesna', t: "No. I don't.", next: 'q1' },

    y1: { s: 'vesna', t: 'Why not take it out there yourself?', next: 'y2' },
    y2: { s: 'jarek', t: "I went. Twice. I got as far as the huts and my feet wouldn't go.", next: 'q1' },

    sil1: { s: 'narrator', t: 'Vesna says nothing.', italic: true, dur: 2.2, next: 'sil2' },
    sil2: { s: 'jarek', t: "Everyone does that.", next: 'q1' },

    ask: { s: 'jarek', t: 'Give it to her. Please.', next: 'dec' },
    dec: {
      choices: [
        { t: "I'll take it.", next: 'take' },
        { t: 'No.', next: 'no1' },
      ],
    },
    take: { s: 'vesna', t: "I'll take it.", do: (S) => { S.set('bird_taken'); if (!S.has('bird')) S.give('bird', 1); }, next: 'take2' },
    take2: { s: 'narrator', t: 'He puts the bird in her hand.', italic: true, dur: 3.2, next: 'take3' },
    take3: { s: 'jarek', t: "Out by the old tower, where the bell is. That's where she'd be, I think.", next: 'take4' },
    take4: { s: 'vesna', t: "I'll leave it where she'll find it.", end: true },

    no1: { s: 'vesna', t: 'No.', next: 'no2' },
    no2: { s: 'jarek', t: 'All right.', wait: 1.0, next: 'no3' },
    no3: { s: 'jarek', t: "All right. That's fair.", end: true },

    // asked again
    ag1: { s: 'jarek', t: 'Have you thought about it?', next: 'ag2' },
    ag2: { s: 'narrator', t: 'He is holding the bird in both hands.', italic: true, dur: 2.6, next: 'ask' },

    // reminder
    rem1: { s: 'jarek', t: 'Have you been out there?', next: 'rem2' },
    rem2: { s: 'vesna', t: 'Not yet.', next: 'rem3' },
    rem3: { s: 'jarek', t: 'Yes. At dark.', wait: 0.6, end: true },
  },
};
