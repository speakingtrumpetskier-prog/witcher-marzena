// hanka_first: Hanka's house, day 1. The contract is hers. She pays, Ola comes in.
//
// Entry: first interaction with Hanka at her house (not met_hanka). cast: hanka. Ola joins mid-scene
//        (node o1): pass opts.spawnAt = { ola: [x, z] } just inside the door if she is elsewhere.
// Sets:  met_hanka (start), hanka_hired (at the payment).
// Gives: S.give('coins', 61) and S.give('ring', 1) at the payment, once (guarded by hanka_hired).
// Topics after Ola leaves (all `once`): the bowl, the daughter who drowned, where the men went out
//        from, tomorrow night, the dress. The scene always ends on the same ordinary line.
export default {
  id: 'hanka_first',
  cast: ['hanka'],
  start: 'h1',
  nodes: {
    h1: { s: 'vesna', t: 'Hanka?', do: (S) => S.set('met_hanka'), next: 'h2' },
    h2: { s: 'hanka', t: 'Yes.', a: 'mend_net', next: 'h3' },
    h3: { s: 'narrator', t: 'Vesna lays the contract on the table.', italic: true, dur: 2.2, next: 'h4' },
    h4: { s: 'hanka', t: "I didn't think anyone would come.", wait: 1.4, cam: 'close', next: 'h5' },
    h5: { s: 'vesna', t: "Tell me what it doesn't say.", next: 'h6' },
    h6: { s: 'hanka', t: "They've picked Ola. My youngest.", next: 'h7' },
    h7: { s: 'vesna', t: 'For the rite.', next: 'h8' },
    h8: { s: 'hanka', t: 'For the rite.', wait: 0.8, next: 'h9' },
    h9: { s: 'hanka', t: "They say the goddess took one from this house, so she'll want the other. That's what they're saying.", next: 'h10' },
    h10: { s: 'hanka', t: "If whatever's out there is dead before tomorrow night, they'll have no reason.", next: 'h11' },
    h11: { s: 'vesna', t: 'Do you know what it is?', next: 'h12' },
    h12: { s: 'hanka', t: 'No.', wait: 1.2, next: 'h13' },
    h13: { s: 'hanka', t: 'No.', next: 'h14' },
    h14: { s: 'vesna', t: 'What can you pay?', next: 'h15' },
    h15: { s: 'narrator', t: 'Hanka puts a purse on the table, and beside it a ring on a string.', italic: true, dur: 3.2, next: 'h16' },
    h16: { s: 'hanka', t: 'Sixty-one grosze. And this.', next: 'h17' },
    h17: { s: 'vesna', t: "That's not much.", next: 'h18' },
    h18: { s: 'hanka', t: "It's all there is in the house.", wait: 0.6, next: 'h19' },
    h19: { s: 'vesna', t: 'Keep the ring.', next: 'h20' },
    h20: { s: 'hanka', t: "Take it. It's what I've got.", next: 'h21' },
    h21: {
      s: 'narrator', t: 'Vesna takes the purse. After a moment, the ring.', italic: true, dur: 3,
      do: (S) => { if (!S.flag('hanka_hired')) { S.give('coins', 61); S.give('ring', 1); } S.set('hanka_hired'); },
      next: 'o1',
    },

    // Ola
    o1: { s: 'narrator', t: 'The door bangs. Ola comes in, stamping snow off her boots.', italic: true, dur: 3, next: 'o2' },
    o2: { s: 'ola', t: "It's the witch.", next: 'o3' },
    o3: { s: 'hanka', t: 'Ola.', next: 'o4' },
    o4: { s: 'ola', t: "She said she isn't one.", next: 'o5' },
    o5: { s: 'narrator', t: 'Ola scoops a handful of snow off her sleeve and drops it in the bowl by the door.', italic: true, dur: 3.4, next: 'o6' },
    o6: { s: 'narrator', t: 'Hanka goes very still.', italic: true, dur: 2.4, next: 'o7' },
    o7: { s: 'ola', t: 'It was already frozen.', next: 'o8' },
    o8: { s: 'hanka', t: 'Go and bring the wood in.', next: 'o9' },
    o9: { s: 'ola', t: 'I brought the wood.', next: 'o10' },
    o10: { s: 'hanka', t: 'Then bring more.', next: 'o11' },
    o11: { s: 'ola', t: "They're still yellow.", look: 'vesna', next: 'o12' },
    o12: { s: 'vesna', t: 'Still.', next: 'o13' },
    o13: { s: 'ola', t: 'Okay.', next: 'hub' },

    hub: {
      choices: [
        { t: 'The bowl by the door.', next: 'bw1', once: true },
        { t: 'The one the goddess took.', next: 'wi1', once: true },
        { t: 'Where did the three go out from?', next: 'ca1', once: true },
        { t: 'What do they do with her tomorrow night?', next: 'ri1', once: true },
        { t: "That's a good dress.", next: 'dr1', once: true },
        { t: "I'll go out when it's dark.", next: 'bye', exit: true },
      ],
    },

    bw1: { s: 'vesna', t: 'The bowl by the door.', next: 'bw2' },
    bw2: { s: 'hanka', t: "It's nothing. It freezes by morning anyway.", a: 'mend_net', next: 'bw3' },
    bw3: { s: 'vesna', t: 'All right.', next: 'hub' },

    wi1: { s: 'vesna', t: 'You said the goddess took one from this house.', next: 'wi2' },
    wi2: { s: 'hanka', t: 'She drowned. Three years ago. At the rite.', cam: 'close', next: 'wi3' },
    wi3: { s: 'vesna', t: 'What was her name?', next: 'wi4' },
    wi4: { s: 'hanka', t: 'Wiesia.', next: 'wi5' },
    wi5: { s: 'narrator', t: 'She picks the dress back up. That is all.', italic: true, dur: 2.8, do: (S, D) => D.actor('hanka')?.play('mend_net'), next: 'hub' },

    ca1: { s: 'vesna', t: 'Where did the three go out from?', next: 'ca2' },
    ca2: { s: 'hanka', t: 'The camp, past the huts, west of the poles. Three holes. Stach had the one nearest the poles.', next: 'ca3' },
    ca3: { s: 'vesna', t: 'And it comes after dark.', next: 'ca4' },
    ca4: { s: 'hanka', t: "That's what they say. I don't go out after dark.", next: 'ca5' },
    ca5: { s: 'vesna', t: "Then I'll go after dark.", next: 'hub' },

    ri1: { s: 'vesna', t: 'What do they do with her tomorrow night?', next: 'ri2' },
    ri2: { s: 'hanka', t: "She carries the effigy. That's what they say.", next: 'ri3' },
    ri3: { s: 'hanka', t: "A woman came round with a red ribbon. She measured Ola's wrists with it.", next: 'ri4' },
    ri4: { s: 'vesna', t: 'Which woman?', next: 'ri5' },
    ri5: { s: 'hanka', t: "It doesn't matter which. She was polite about it.", wait: 0.9, next: 'hub' },

    dr1: { s: 'vesna', t: "That's a good dress.", next: 'dr2' },
    dr2: { s: 'hanka', t: "It's too long. She'll catch her heel on it.", a: 'mend_net', next: 'dr3' },
    dr3: { s: 'vesna', t: 'Take it up.', next: 'dr4' },
    dr4: { s: 'hanka', t: "I left it long. She'll grow into it.", next: 'dr5' },
    dr5: { s: 'narrator', t: 'Her needle stops.', italic: true, dur: 2.6, next: 'dr6' },
    dr6: { s: 'hanka', t: 'Is there anything else you need to know?', wait: 1.6, next: 'hub' },

    bye: { s: 'vesna', t: "I'll go out when it's dark.", next: 'bye2' },
    bye2: { s: 'hanka', t: 'Yes.', next: 'bye3' },
    bye3: { s: 'hanka', t: 'Pull the door hard, it sticks.', end: true },
  },
};
