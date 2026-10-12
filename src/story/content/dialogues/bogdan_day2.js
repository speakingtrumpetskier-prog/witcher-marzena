// bogdan_day2: short lines when Vesna comes back to the longhouse and there is nothing new to say.
// Covers day 1 returns too (before the echo) and day 2 before the rite.
//
// Entry: met_bogdan, and the full conversation does not apply (use bogdan_later when echo_seen and
//        not reeve_told). cast: bogdan. Sets nothing.
export default {
  id: 'bogdan_day2',
  cast: ['bogdan'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S, D) => {
        if (S.flag('reeve_told')) return 'told1';
        if ((D.G.time?.day ?? 1) >= 2 || S.flag('echo_seen')) return 'rite1';
        return S.flag('took_reeve_money') ? 'took1' : 'ref1';
      },
    },

    // day 1, took the money
    took1: { s: 'bogdan', t: "You've still got my hundred. The pass was open this morning.", a: 'sit_bench', next: 'took2' },
    took2: { s: 'vesna', t: "I'll go when I'm done.", next: 'took3' },
    took3: { s: 'bogdan', t: 'Done with what?', next: 'took4' },
    took4: { s: 'narrator', t: 'Vesna says nothing.', italic: true, dur: 1.8, next: 'took5' },
    took5: { s: 'bogdan', t: 'Stay off the lake.', end: true },

    // day 1, refused
    ref1: { s: 'bogdan', t: "You're still here.", a: 'sit_bench', next: 'ref2' },
    ref2: { s: 'vesna', t: 'Yes.', next: 'ref3' },
    ref3: { s: 'bogdan', t: 'I can see that.', wait: 1.0, next: 'ref4' },
    ref4: { s: 'bogdan', t: "The offer's still good until the morning. After that I need it for wood.", end: true },

    // the day of the rite
    rite1: { s: 'bogdan', t: "I've nothing for you. I'm counting torches.", a: 'sit_bench', next: 'rite2' },
    rite2: { s: 'vesna', t: 'How many?', next: 'rite3' },
    rite3: { s: 'bogdan', t: 'Sixty. I need eighty. Dobra has the girls making them.', next: 'rite4' },
    rite4: { s: 'vesna', t: 'And the weather?', next: 'rite5' },
    rite5: { s: 'bogdan', t: 'It will snow. It always snows.', wait: 0.8, next: 'rite5b' },
    rite5b: { s: 'bogdan', t: "I looked at the lake this morning. Not one herder up. That's snow by dark, and the torches won't like it.", next: 'rite6' },
    rite6: { s: 'bogdan', t: "If you're coming tonight, stay at the back.", end: true },

    // after he was told
    told1: { s: 'narrator', t: "Bogdan doesn't look up. The pen hasn't moved.", italic: true, dur: 2.6, next: 'told2' },
    told2: { s: 'bogdan', t: "I've nothing to say to you.", wait: 1.0, end: true },
  },
};
