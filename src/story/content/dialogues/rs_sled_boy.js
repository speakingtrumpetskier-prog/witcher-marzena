// rs_sled_boy: the boy with the stuck sled on the bank of the river by the mill (src/story/controller/roadside/sled.js).
//
// Entry: the controller starts it at 'entry' (first meeting 'a1', after that 'again'). Ending at 'push' starts the pushing (tap E);
// afterwards the controller starts it at 'd1' (the thanks and his grosz). Ending at 'pay' gives Vesna one grosz. cast: sled_boy.
// Sets: sled_met.
export default {
  id: 'rs_sled_boy',
  cast: ['sled_boy'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('sled_freed') ? 'after' : S.flag('sled_met') ? 'again' : 'a1') },

    a1: { s: 'sled_boy', t: "It's not stuck. It's just stopped.", do: (S) => S.set('sled_met'), next: 'a2' },
    a2: { s: 'vesna', t: 'Looks stuck.', next: 'a3' },
    a3: { s: 'sled_boy', t: "It's the runner. It went in at the edge of the bank and now it won't come out. Mama says I have to be home with the wood before dark.", next: 'a4' },
    a4: { s: 'vesna', t: "Isn't there wood nearer the houses?", next: 'a5' },
    a5: { s: 'sled_boy', t: "There's none. And the reeve says leave the fences alone.", next: 'hub' },

    again: { s: 'sled_boy', t: "It's still stuck. I mean stopped.", next: 'hub' },

    hub: {
      choices: [
        { t: "I'll push. You pull.", next: 'p1' },
        { t: 'Not now.', next: 'n1', exit: true },
      ],
    },

    p1: { s: 'vesna', t: "I'll push. You pull.", next: 'p2' },
    p2: { s: 'sled_boy', t: "I am pulling.", wait: 0.6, next: 'p3' },
    p3: { s: 'sled_boy', t: 'All right.', next: 'push' },
    push: { s: 'sled_boy', t: 'Ready.', end: true },

    n1: { s: 'vesna', t: 'Not now.', next: 'n2' },
    n2: { s: 'sled_boy', t: 'Fine.', end: true },

    // after the sled is out
    d1: { s: 'sled_boy', t: 'It came out.', next: 'd2' },
    d2: { s: 'vesna', t: 'Get it home.', next: 'd3' },
    d3: { s: 'sled_boy', t: "You're the hunter. Ola says your eyes are just yellow.", next: 'd4' },
    d4: { s: 'vesna', t: 'They are.', next: 'd5' },
    d5: { s: 'sled_boy', t: "I thought they'd glow.", wait: 0.8, next: 'd6' },
    d6: { s: 'sled_boy', t: "I've one grosz. Mama said if anybody helped I was to give them something.", next: 'd7' },
    d7: { s: 'vesna', t: 'Keep it.', next: 'd8' },
    d8: { s: 'sled_boy', t: "She'll ask.", next: 'd9' },
    d9: { s: 'vesna', t: "Then I'll take it.", next: 'pay' },
    pay: { s: 'sled_boy', t: 'Thank you.', end: true },

    after: { s: 'sled_boy', t: 'I have to get this home.', end: true },
  },
};
