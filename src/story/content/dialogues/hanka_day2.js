// hanka_day2: short visits to Hanka that are not the first meeting or the confrontation.
//
// Entry: met_hanka, and either not echo_seen (day 1 before the night: "is it dark yet") or
//        hanka_confronted (day 2 afterwards; the tone follows hanka_comforted / hanka_blamed).
//        If echo_seen and not hanka_confronted, start hanka_confront instead.
// cast: hanka. Sets nothing.
export default {
  id: 'hanka_day2',
  cast: ['hanka'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S) => {
        if (S.flag('hanka_confronted')) return S.flag('hanka_blamed') ? 'bl1' : 'co1';
        return 'e1';
      },
    },

    // day 1, before the night
    e1: { s: 'hanka', t: "It's not dark yet.", a: 'mend_net', next: 'e2' },
    e2: { s: 'vesna', t: 'I know. I wanted to look at the shore first.', next: 'e3' },
    e3: { s: 'hanka', t: "There's no fire, I'm sorry. I only light it when Ola's in.", next: 'e4' },
    e4: { s: 'vesna', t: "That's all right.", next: 'e5' },
    e5: { s: 'hanka', t: "She'll be back before dark. She's been told.", end: true },

    // after the confrontation, comforted
    co1: { s: 'narrator', t: 'Hanka looks up when Vesna comes in.', italic: true, dur: 2.4, next: 'co2' },
    co2: { s: 'hanka', t: "Ola's at the hill. I let her go.", next: 'co3' },
    co3: { s: 'vesna', t: 'Does anything need doing here?', next: 'co4' },
    co4: { s: 'hanka', t: "The wood needs splitting. She can't swing the axe.", next: 'co5' },
    co5: { s: 'vesna', t: "I'll do it.", next: 'co6' },
    co6: { s: 'hanka', t: 'You needn\'t.', next: 'co7' },
    co7: { s: 'vesna', t: 'I know.', next: 'co8' },
    co8: { s: 'hanka', t: 'Thank you.', wait: 0.8, a: 'nod', end: true },

    // after the confrontation, blamed
    bl1: { s: 'narrator', t: "Hanka doesn't look up.", italic: true, dur: 2.2, next: 'bl2' },
    bl2: { s: 'hanka', t: "She's at the hill.", a: 'mend_net', next: 'bl3' },
    bl3: { s: 'vesna', t: "I'll be at the shore at dark.", next: 'bl4' },
    bl4: { s: 'hanka', t: 'I know you will.', wait: 1.0, end: true },
  },
};
