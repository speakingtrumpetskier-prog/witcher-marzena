// ola_day1: Ola in the village on day 1, after the song at the workshop (song_heard / met_ola).
// She is at the bales, the fort under the boardwalk or the sledding hill, busy with something.
//
// Entry: Vesna talks to Ola outside her house, any time after C3 and before the snow fight.
// cast: ola. Sets nothing (met_ola belongs to C3).
// Reads: hanka_hired (she knows the dress and the broom practice only makes sense once Vesna has met
//        Hanka; the "carrying" topic is hidden until then).
// Topics (all `once`): what she is making, the horse, the song, the bowl at home, carrying it.
export default {
  id: 'ola_day1',
  cast: ['ola'],
  start: 'o1',
  nodes: {
    o1: { s: 'ola', t: "You're still here.", a: 'child_play', next: 'o2' },
    o2: { s: 'vesna', t: 'I only got here.', next: 'o3' },
    o3: { s: 'ola', t: 'Kuba said witches go before it gets dark.', next: 'o4' },
    o4: { s: 'vesna', t: "I'm not one.", next: 'o5' },
    o5: { s: 'ola', t: 'I know. I said.', wait: 0.5, next: 'hub' },

    hub: {
      choices: [
        { t: 'What are you making?', next: 'mk1', once: true },
        { t: 'Do you want to see the horse?', next: 'hs1', once: true },
        { t: 'That song. Do you know all of it?', next: 'so1', once: true },
        { t: 'Your mother puts a bowl out at the door.', next: 'bw1', once: true, if: (S) => !!S.flag('hanka_hired') },
        { t: "I heard you're carrying her this year.", next: 'ca1', once: true, if: (S) => !!S.flag('hanka_hired') },
        { t: 'Your lips are moving. What are you counting?', next: 'cn1', once: true },
        { t: 'I have to go.', next: 'bye', exit: true },
      ],
    },

    mk1: { s: 'vesna', t: 'What are you making?', next: 'mk2' },
    mk2: { s: 'ola', t: "A Marzanna. A little one, for the little ones. Dobra does the big one.", next: 'mk3' },
    mk3: { s: 'vesna', t: 'What do you do with it?', next: 'mk4' },
    mk4: { s: 'ola', t: "You sing and you throw it in and you don't look. If you look she gets you.", a: 'shrug', next: 'mk5' },
    mk5: { s: 'vesna', t: 'Gets you how?', next: 'mk6' },
    mk6: { s: 'ola', t: "I don't know. Nobody's looked.", next: 'hub' },

    hs1: { s: 'vesna', t: 'I have a horse, if you want to see her.', next: 'hs2' },
    hs2: { s: 'ola', t: "What's she called?", next: 'hs3' },
    hs3: { s: 'vesna', t: 'Kasza.', next: 'hs4' },
    hs4: { s: 'ola', t: 'Like porridge.', next: 'hs5' },
    hs5: { s: 'vesna', t: 'Like porridge.', next: 'hs6' },
    hs6: { s: 'ola', t: 'Does she bite?', next: 'hs7' },
    hs7: { s: 'vesna', t: "Only on the ice. She doesn't like it.", next: 'hs8' },
    hs8: { s: 'ola', t: "Then why's she here? It's all ice here.", next: 'hs9' },
    hs9: { s: 'vesna', t: "She goes where I go. She doesn't like it.", next: 'hub' },

    so1: { s: 'vesna', t: 'That song. Do you know all of it?', next: 'so2' },
    so2: { s: 'ola', t: 'Everybody knows it. You know it.', next: 'so3' },
    so3: { s: 'vesna', t: 'Do I.', next: 'so4' },
    so4: { s: 'ola', t: 'You did the mouth. At the end. Like this.', a: 'point', next: 'so5' },
    so5: { s: 'vesna', t: "I don't sing.", next: 'so6' },
    so6: { s: 'ola', t: 'I saw.', wait: 0.7, next: 'hub' },

    bw1: { s: 'vesna', t: 'Your mother puts a bowl of milk out at the door.', next: 'bw2' },
    bw2: { s: 'ola', t: "It's stupid. It freezes. I told her.", next: 'bw3' },
    bw3: { s: 'vesna', t: 'Who is it for?', next: 'bw4' },
    bw4: { s: 'ola', t: "It's for Wiesia. She's dead. She can't drink it.", cam: 'close', next: 'bw5' },
    bw5: { s: 'ola', t: 'Dobra says she tied good knots.', wait: 0.9, next: 'hub' },

    ca1: { s: 'vesna', t: "I heard you're carrying her this year.", next: 'ca2' },
    ca2: { s: 'ola', t: "The big one. Dobra said I can hold the pole.", next: 'ca3' },
    ca3: { s: 'ola', t: "It's heavy. I have to practise.", next: 'ca4' },
    ca4: { s: 'vesna', t: 'How?', next: 'ca5' },
    ca5: { s: 'ola', t: 'With a broom.', next: 'ca6' },
    ca6: { s: 'vesna', t: 'Both hands. Low.', next: 'ca7' },
    ca7: { s: 'ola', t: 'I know.', a: 'shrug', wait: 0.6, next: 'hub' },

    // she is counting the herders over the roofs; Kuba's rule is about twenty
    cn1: { s: 'vesna', t: 'Your lips are moving. What are you counting?', next: 'cn2' },
    cn2: { s: 'ola', t: "Herders. Don't talk, I'll lose it.", a: 'child_play', next: 'cn3' },
    cn3: { s: 'ola', t: 'Eleven. Twelve.', wait: 1.2, next: 'cn4' },
    cn4: { s: 'vesna', t: 'Where?', next: 'cn5' },
    cn5: { s: 'ola', t: "Over the roofs. You have to look past, they're thin in the light.", next: 'cn6' },
    cn6: { s: 'vesna', t: 'Why count them?', next: 'cn7' },
    cn7: { s: 'ola', t: 'Kuba says if you get past twenty one comes down.', next: 'cn8' },
    cn8: { s: 'vesna', t: 'Comes down where?', next: 'cn9' },
    cn9: { s: 'ola', t: "Just down. Nobody's got past twenty. I got to eighteen once and Kuba sneezed.", next: 'cn10' },
    cn10: { s: 'vesna', t: 'What happened?', next: 'cn11' },
    cn11: { s: 'ola', t: 'Nothing. I started again.', wait: 0.5, do: (S) => S.set('herders_counted'), next: 'hub' },

    bye: { s: 'ola', t: 'Straw. I have to do the straw.', a: 'child_play', end: true },
  },
};
