// dobra_short: every other visit to the workshop.
//
// Entry: any interaction with Dobra that is not dobra_rite. Branches on: not yet met (day 1: she is
// curt), met (day 2, the day of the rite: Vesna can help with the straw), ending set (after the rite).
// cast: dobra. Sets nothing.
export default {
  id: 'dobra_short',
  cast: ['dobra'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S) => {
        if (S.flag('ending')) return 'end1';
        return S.flag('met_dobra') ? 'm1' : 'u1';
      },
    },

    // not met yet (day 1)
    u1: { s: 'vesna', t: 'Are you the one who makes the effigies?', next: 'u2' },
    u2: { s: 'dobra', t: "I'm the one making this one. Mind the straw.", a: 'mend_net', next: 'u3' },
    u3: { s: 'vesna', t: 'I can come back.', next: 'u4' },
    u4: { s: 'dobra', t: 'In the morning. I have more hands in the morning.', end: true },

    // met, day of the rite
    m1: { s: 'dobra', t: "Torches, and a pole, and the hair isn't done. Don't stand there.", a: 'mend_net', next: 'm2' },
    m2: { s: 'vesna', t: 'Can I help?', next: 'm3' },
    m3: { s: 'dobra', t: 'Can you twist?', next: 'm4' },
    m4: { s: 'vesna', t: 'Show me.', next: 'm5' },
    m5: { s: 'narrator', t: 'Dobra puts a handful of straw in her hands. Vesna twists it.', italic: true, dur: 3, next: 'm6' },
    m6: { s: 'dobra', t: 'Too tight, it\'ll snap. Like that.', next: 'm7' },
    m7: { s: 'dobra', t: "You've done this before.", wait: 1.4, next: 'm8' },
    m8: { s: 'vesna', t: 'Never.', next: 'm9' },
    m9: { s: 'dobra', t: 'Hm.', wait: 0.8, next: 'm10' },
    m10: { s: 'dobra', t: 'Put it on that pile. No, the other pile.', end: true },

    // after the rite
    end1: {
      s: 'dobra', a: 'mend_net',
      t: (S) => {
        const e = S.flag('ending');
        if (e === 'thaw') return 'Nothing to make. First time in my life.';
        if (e === 'looking_back') return "There's nothing to make. I keep picking up straw anyway.";
        return "Next year's. I'll start in the autumn.";
      },
      end: true,
    },
  },
};
