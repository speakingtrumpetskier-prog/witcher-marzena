// miller: Gniewko at the frozen mill. Side quest "Wolves at the Mill".
//
// Entry: any interaction with Gniewko. cast: miller.
//   not wolves_mill_done -> the contract: what happened, what he pays, where the den is
//   wolves_mill_done     -> the payment and the warm water line
// Sets:  miller_warm_water (second half only). Gives S.give('coins', 40) once (guarded by miller_paid).
// The den marker, the wolves and the journal belong to quests.js.
export default {
  id: 'miller',
  cast: ['miller'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('miller_warm_water') ? 'done1' : S.flag('wolves_mill_done') ? 'w1' : 'g1') },

    // before the wolves
    g1: { s: 'miller', t: 'Hunter.', a: 'carry_bucket', next: 'g2' },
    g2: { s: 'miller', t: 'Is it about the paper?', next: 'g3' },
    g3: { s: 'vesna', t: 'Wolves.', next: 'g4' },
    g4: { s: 'miller', t: 'Took my dog. Near took my boy.', next: 'hub' },

    hub: {
      choices: [
        { t: 'Tell me what happened.', next: 'a1', once: true },
        { t: 'How many were there?', next: 'n1', once: true },
        { t: 'Where do they go?', next: 'p1', once: true },
        { t: 'What are you paying?', next: 'pay1', once: true },
        { t: "I'll go and look.", next: 'bye', exit: true },
      ],
    },

    a1: { s: 'vesna', t: 'Tell me what happened.', next: 'a2' },
    a2: { s: 'miller', t: 'He went down to the river for water. They can all go down, they take turns, I let him go alone.', next: 'a3' },
    a3: { s: 'miller', t: "Burek went with him. Burek went between. I heard him, and then I didn't.", next: 'a4' },
    a4: { s: 'miller', t: 'The boy came back without the bucket. He hasn\'t been down since. None of them go.', next: 'a5' },
    a5: { s: 'vesna', t: 'So you melt snow.', next: 'a6' },
    a6: { s: 'miller', t: "It's a lot of snow.", wait: 0.8, next: 'hub' },

    n1: { s: 'vesna', t: 'How many were there?', next: 'n2' },
    n2: { s: 'miller', t: 'I counted four. And a big one, she stays back. Old. A scar right across the face.', next: 'n3' },
    n3: { s: 'miller', t: 'She stands at the willows and watches the house.', wait: 0.9, next: 'hub' },

    p1: { s: 'vesna', t: 'Where do they go?', next: 'p2' },
    p2: { s: 'miller', t: "Up the river, past the wheel, to the falls. There's a hollow in the rocks at the bottom.", a: 'point', next: 'p3' },
    p3: { s: 'miller', t: 'They go in at dawn. I hear them.', next: 'hub' },

    pay1: { s: 'vesna', t: 'What are you paying?', next: 'pay2' },
    pay2: { s: 'miller', t: "Forty grosze. I'd say more. The wheel's been frozen two winters, I grind by hand what people bring, and nobody brings anything.", next: 'pay3' },
    pay3: { s: 'vesna', t: 'Forty.', next: 'pay4' },
    pay4: { s: 'miller', t: "It's honest, at least.", next: 'hub' },

    bye: { s: 'miller', t: 'Mind the bank. The ice over the race is bad.', end: true },

    // after the wolves
    w1: { s: 'miller', t: 'Well?', a: 'carry_bucket', next: 'w2' },
    w2: { s: 'vesna', t: 'Four. And the old one.', next: 'w3' },
    w3: { s: 'miller', t: "She's dead? The one with the scar?", next: 'w4' },
    w4: { s: 'vesna', t: 'Yes.', next: 'w5' },
    w5: { s: 'miller', t: 'Good.', wait: 1.4, next: 'w6' },
    w6: { s: 'miller', t: "I'll let the boy down to the river tomorrow. Not today.", next: 'w7' },
    w7: { s: 'miller', t: "Forty. It's all there.", do: (S) => { if (!S.flag('miller_paid')) { S.give('coins', 40); S.set('miller_paid'); } }, next: 'w8' },
    w8: { s: 'vesna', t: "I'm working in the village, on the ice. Out by the poles.", next: 'w9' },
    w9: { s: 'miller', t: 'The poles.', wait: 1.0, next: 'w10' },
    w10: { s: 'miller', t: "My father never let anyone fish there. Warm water comes up. The ice is never as thick as it looks.", next: 'w11' },
    w11: { s: 'vesna', t: 'How do you know?', next: 'w12' },
    w12: { s: 'miller', t: "You put your hand in the hole there and it isn't cold like the other holes. My father did it, his father did it.", next: 'w13' },
    w13: { s: 'vesna', t: 'Does the reeve know?', next: 'w14' },
    w14: { s: 'miller', t: 'The old ones know. Most of them are dead.', do: (S) => S.set('miller_warm_water'), next: 'w15' },
    w15: { s: 'miller', t: "There's soup, if you want. My wife made it.", next: 'w16' },
    w16: { s: 'vesna', t: 'I will.', a: 'eat', end: true },

    // later visits
    done1: { s: 'miller', t: "The boy's been down to the river twice. He took the dog's bowl with him.", a: 'carry_bucket', next: 'done2' },
    done2: { s: 'vesna', t: 'And the bucket?', next: 'done3' },
    done3: { s: 'miller', t: 'He took the bucket.', wait: 0.6, end: true },
  },
};
