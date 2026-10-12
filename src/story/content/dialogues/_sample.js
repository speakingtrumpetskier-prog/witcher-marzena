// SAMPLE dialogue: proves the runner (two people, a hub with three choices, one path leading to
// a decisive timed choice). Not part of the story; flags are prefixed _sample_.
// Run: ?scene=story&play=dialogue   or   await G.dialogue.start('_sample')
export default {
  id: '_sample',
  cast: ['hanka'],
  start: 'n1',
  nodes: {
    n1: { s: 'hanka', t: "You're slower than I hoped.", a: 'cross_arms', next: 'n2' },
    n2: { s: 'vesna', t: 'Somebody had to be.', next: 'n3' },
    n3: { s: 'hanka', t: 'The milk freezes by morning. I bring more anyway.', next: 'hub' },

    hub: {
      choices: [
        { t: 'Ask about the contract.', next: 'c0', once: true },
        { t: 'Ask about Ola.', next: 'o1', once: true },
        { t: 'Tell her what you saw on the ice.', next: 'd1', decisive: true },
        { t: 'Leave.', next: 'bye', exit: true },
      ],
    },

    c0: { s: 'vesna', t: 'Your note. Tell me what it left out.', next: 'c1' },
    c1: { s: 'hanka', t: 'Something walks the ice at night. Kill it before tomorrow. Then they have no reason.', next: 'c2' },
    c2: { s: 'vesna', t: 'Sixty-one grosze and a ring. For a monster.', next: 'c3' },
    c3: { s: 'hanka', t: 'For a daughter.', a: 'shake_head', next: 'hub' },

    o1: { s: 'vesna', t: 'Your girl asked if I eat snow.', next: 'o2' },
    o2: { s: 'hanka', t: 'Ola asks everyone that. The goat too.', next: 'o3' },
    o3: { s: 'hanka', t: 'She laughs at the wrong things. Like her father did.', next: 'hub' },

    d1: { s: 'vesna', t: 'I was on the ice last night. At the poles.', next: 'd2' },
    d2: { s: 'vesna', t: 'You turned around.', cam: 'close', next: 'd3' },
    d3: { s: 'hanka', t: 'Everyone was singing...', wait: 0.8, next: 'd4' },
    d4: { s: 'hanka', t: "You don't look back. You don't. Your feet keep walking and the song keeps going.", next: 'decide' },
    decide: {
      decisive: true, timer: 12, timeout: 't1',
      choices: [
        { t: 'Ola needs you to look now. Not at the ice. At her.', next: 'k1', do: (S) => S.set('_sample_comforted') },
        { t: 'You watched her die and kept singing.', next: 'b1', do: (S) => S.set('_sample_blamed') },
      ],
    },
    k1: { s: 'hanka', t: 'Yes.', a: 'nod', wait: 1.2, next: 'fin' },
    b1: { s: 'hanka', t: 'Yes.', wait: 1.2, next: 'fin' },
    t1: { s: 'hanka', t: "You don't have to say it.", next: 'fin' },
    fin: { s: 'hanka', t: "Tonight I'll walk out there. Whatever you're going to do, I'll be on the ice.", end: true, do: (S) => S.set('_sample_done') },

    bye: { s: 'hanka', t: 'Go on, then.', end: true },
  },
};
