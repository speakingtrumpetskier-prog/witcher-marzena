// bogdan_later: Vesna goes back to the reeve after the echo (echo_seen) and tells him what happened
// at the poles three years ago.
//
// Entry: met_bogdan and echo_seen and not reeve_told. cast: bogdan.
// Sets:  reeve_told, only on the ledger path (needs ledger_found: Vesna reads the cellar ledger to him).
//        bogdan_threw_out when she tries without the ledger; he lets her back in later (greeting changes,
//        the scene is the same), so she can come again with it.
// Reads: ledger_found, miller_warm_water (an extra argument, it does not unlock reeve_told by itself).
//        knows_wiesia (she says the girl's name only if she has heard it), the day (the echo can be the same night).
// If reeve_told is already set the scene is a short, quiet exchange and changes nothing.
export default {
  id: 'bogdan_later',
  cast: ['bogdan'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('reeve_told') ? 'told1' : 'l1') },

    l1: {
      s: 'bogdan', a: 'sit_bench',
      t: (S) => (S.flag('bogdan_threw_out') ? 'I told you to get out.' : 'You again.'),
      next: 'hub',
    },

    hub: {
      choices: [
        { t: 'About the rite three years ago.', next: 'a1', if: (S) => !!S.flag('echo_seen') },
        { t: 'Why Ola?', next: 'o1', once: true },
        { t: 'Never mind.', next: 'bye', exit: true },
      ],
    },

    // why Ola
    o1: { s: 'vesna', t: 'Why Ola?', next: 'o2' },
    o2: { s: 'bogdan', t: "The goddess took one from that house. She's owed the other.", next: 'o3' },
    o3: { s: 'vesna', t: 'Who says?', next: 'o4' },
    o4: { s: 'bogdan', t: "The elders. Pawlak, Rybak, the old women. It isn't a thing I decided.", next: 'o5' },
    o5: { s: 'vesna', t: "You're the reeve.", next: 'o6' },
    o6: { s: 'bogdan', t: "I'm the reeve. I count the grain.", wait: 1.2, a: 'shake_head', next: 'hub' },

    bye: { s: 'bogdan', t: 'Then close the door.', end: true },

    // the rite three years ago
    a1: {
      s: 'vesna', cam: 'close',
      t: (S) => (S.flag('knows_wiesia')
        ? "Wiesia didn't just fall in. Her mother saw her in the water, and everyone kept walking."
        : "Hanka's girl didn't just fall in. Hanka saw her in the water, and everyone kept walking."),
      next: 'a2',
    },
    a2: { s: 'narrator', t: 'Bogdan puts the pen down and stands.', italic: true, dur: 2.4, next: 'a3' },
    a3: { s: 'bogdan', t: 'Who told you that?', next: 'say' },

    say: {
      choices: [
        { t: 'I was there. I saw it, at the poles.', next: 's1' },
        { t: 'The ice at the poles is thin. Warm water comes up under it.', next: 'w1', once: true, if: (S) => !!S.flag('miller_warm_water') },
        { t: "I was in your cellar. You've been giving your own ration to the Nowak children.", next: 'L1', if: (S) => !!S.flag('ledger_found') },
        { t: 'Never mind.', next: 'n1', exit: true },
      ],
    },

    // without the ledger
    s1: { s: 'vesna', t: (S, D) => ((D.G.time?.day ?? 1) >= 2 ? 'I was at the poles last night. I saw it.' : 'I was at the poles tonight. I saw it.'), next: 's2' },
    s2: { s: 'bogdan', t: (S, D) => ((D.G.time?.day ?? 1) >= 2 ? 'You got here yesterday.' : 'You got here this morning.'), next: 's3' },
    s3: { s: 'bogdan', t: 'Get out of my house.', do: (S) => S.set('bogdan_threw_out'), end: true },

    n1: { s: 'bogdan', t: 'Then sit down or go.', end: true },

    // the warm water
    w1: { s: 'vesna', t: "Gniewko the miller says his father wouldn't let anyone fish by the poles. Warm water comes up there.", next: 'w2' },
    w2: { s: 'bogdan', t: 'Everybody knows not to fish there.', next: 'w3' },
    w3: { s: 'vesna', t: 'You cut the hole there.', next: 'w4' },
    w4: { s: 'bogdan', t: "It's always cut there. My father cut it there.", wait: 1.0, next: 'w5' },
    w5: { s: 'bogdan', t: 'His father.', wait: 0.9, next: 'say' },

    // with the ledger
    L1: { s: 'vesna', t: "I was in your cellar. You've been giving your own ration to the Nowak children.", cam: 'close', next: 'L2' },
    L2: { s: 'narrator', t: 'He looks at her a long time.', italic: true, dur: 3.4, next: 'L3' },
    L3: { s: 'vesna', t: "Ola's eleven.", next: 'L4' },
    L4: { s: 'narrator', t: "Bogdan sits down. He doesn't say anything else.", italic: true, dur: 3.2, do: (S) => S.set('reeve_told'), end: true },

    // already told
    told1: { s: 'narrator', t: "Bogdan doesn't look up. The ledger is open, and he hasn't written anything.", italic: true, dur: 3.2, next: 'told2' },
    told2: { s: 'bogdan', t: "I've counted the torches. Eighty-two.", next: 'told3' },
    told3: { s: 'bogdan', t: "I don't know why I counted.", wait: 1.2, end: true },
  },
};
