// hanka_confront: DECISIVE. Hanka's house, day 2 (after the echo and the tower). Vesna tells her
// what she saw at the poles. 12 second timer on the choice; running out counts as blame.
//
// Entry: echo_seen and not hanka_confronted. cast: hanka.
// Sets:  hanka_comforted OR hanka_blamed (timeout = hanka_blamed), then hanka_confronted.
// Result: result.picks has the choice; result.end is 'fin'.
export default {
  id: 'hanka_confront',
  cast: ['hanka'],
  start: 'c1',
  nodes: {
    c1: { s: 'narrator', t: 'Hanka is stitching red thread into the cuffs of the white dress.', italic: true, dur: 3, next: 'c2' },
    c2: { s: 'vesna', t: 'Is Ola about?', next: 'c3' },
    c3: { s: 'hanka', t: 'On the hill with the others. I said back by dark.', a: 'mend_net', next: 'c4' },
    c4: { s: 'hanka', t: 'Did you find it?', next: 'c5' },
    c5: { s: 'vesna', t: 'I was out at the poles last night.', next: 'c6' },
    c6: { s: 'narrator', t: 'Hanka keeps stitching.', italic: true, dur: 2.2, next: 'c7' },
    c7: { s: 'vesna', t: 'I saw what happened. Three years ago.', next: 'c8' },
    c8: { s: 'narrator', t: 'Her needle stops.', italic: true, dur: 2.2, next: 'c9' },
    c9: { s: 'vesna', t: 'You turned round.', cam: 'close', next: 'c10' },
    c10: { s: 'hanka', t: 'Everyone was singing.', wait: 3.0, next: 'c11' },
    c11: { s: 'hanka', t: 'Marta had my arm. I thought it was the torches. You look at torches and then you see things on the ice. Spots.', wait: 1.5, next: 'c12' },
    c12: { s: 'hanka', t: 'By the time I got back there was just slush.', wait: 1.5, next: 'c13' },
    c13: { s: 'narrator', t: 'Her hands start on the stitching again, badly.', italic: true, dur: 2.6, do: (S, D) => D.actor('hanka')?.play('mend_net'), next: 'c14' },
    c14: { s: 'hanka', t: 'I take milk down every night. She liked it warm. I can\'t get it out there warm.', wait: 0.6, next: 'decide' },

    decide: {
      decisive: true, timer: 12, timeout: 'tmo',
      choices: [
        { t: "Ola's still here. She needs you tonight.", next: 'k1', do: (S) => S.set('hanka_comforted') },
        { t: 'You saw her, and you kept walking.', next: 'b1', do: (S) => S.set('hanka_blamed') },
      ],
    },

    k1: { s: 'hanka', t: 'Yes.', wait: 3.0, a: 'nod', next: 'fin' },

    b1: { s: 'hanka', t: 'Yes.', wait: 1.0, next: 'b2' },
    b2: { s: 'narrator', t: 'She goes back to stitching. Her hands shake.', italic: true, dur: 3, do: (S, D) => D.actor('hanka')?.play('mend_net'), next: 'fin' },

    tmo: { s: 'narrator', t: 'Vesna says nothing.', italic: true, dur: 2.6, do: (S) => S.set('hanka_blamed'), next: 'tmo2' },
    tmo2: { s: 'hanka', t: 'Go on. Say it.', wait: 1.6, next: 'tmo3' },
    tmo3: { s: 'narrator', t: "Vesna doesn't.", italic: true, dur: 2.4, next: 'fin' },

    fin: { s: 'hanka', t: "I'll be on the ice tonight. Whatever you do.", do: (S) => S.set('hanka_confronted'), end: true },
  },
};
