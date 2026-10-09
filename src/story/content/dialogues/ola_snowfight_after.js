// ola_snowfight_after: the sled, after the snowball fight on the sledding hill (day 2 morning).
//
// Entry: the snow fight minigame has ended (start it right after). cast: ola. The two other children
//        are not in the cast; the story can send them off before it starts.
// Sets:  snowfight_done (start), and ola_truth OR ola_lie (the choice).
// Ending C reads ola_truth / ola_lie for Ola's last line.
export default {
  id: 'ola_snowfight_after',
  cast: ['ola'],
  start: 's1',
  nodes: {
    s1: { s: 'narrator', t: 'Ola sits down on the sled, out of breath. Her cap is gone.', italic: true, dur: 3, do: (S, D) => { S.set('snowfight_done'); D.actor('ola')?.play('sit_ground'); }, next: 's2' },
    s2: { s: 'ola', t: 'I won.', next: 's3' },
    s3: { s: 'vesna', t: 'You had two helpers.', next: 's4' },
    s4: { s: 'ola', t: "That's allowed.", next: 's5' },
    s5: { s: 'vesna', t: 'Your cap is in that drift.', next: 's6' },
    s6: { s: 'ola', t: "I know where it is.", wait: 0.6, next: 's7' },
    s7: { s: 'ola', t: "Mama's sewing my dress. It's very white.", wait: 1.2, next: 's8' },
    s8: { s: 'ola', t: 'Does it hurt? Drowning?', cam: 'close', wait: 1.6, next: 'q' },

    q: {
      choices: [
        { t: 'Who have you been talking to?', next: 'w1', once: true },
        { t: 'For a bit. Then it doesn\'t.', next: 'truth' },
        { t: "It won't happen.", next: 'lie' },
      ],
    },

    w1: { s: 'vesna', t: 'Who have you been talking to?', next: 'w2' },
    w2: { s: 'ola', t: "Nobody. Kuba says it's cold and then you go to sleep.", next: 'w3' },
    w3: { s: 'ola', t: "Kuba doesn't know. He's never done it.", next: 'q' },

    truth: { s: 'vesna', t: 'For a bit. Then it doesn\'t.', do: (S) => S.set('ola_truth'), next: 'truth2' },
    truth2: { s: 'narrator', t: 'Ola nods, as if she expected that. Then she shoves a handful of snow down the back of Vesna\'s collar and runs.', italic: true, dur: 4.6, end: true },

    lie: { s: 'vesna', t: "It won't happen.", do: (S) => S.set('ola_lie'), next: 'lie2' },
    lie2: { s: 'ola', t: 'Okay.', next: 'lie3' },
    lie3: { s: 'narrator', t: "She doesn't look at Vesna. She picks at the runner of the sled.", italic: true, dur: 3.6, end: true },
  },
};
