// rs_shrine_woman: the old woman at the wayside shrine on the pass road, by day (src/story/controller/roadside/scarf.js).
//
// Entry: the controller starts it at 'entry'. First time: she asks after her son Jasiek, who took the sledge up the pass for
// wood four days ago (sets scarf_asked, which opens the journal entry and the clue on the road). With his scarf in the pack
// (scarf_found) the talk is 'b1' and ends at 'pay': the controller takes the scarf, hangs it on the shrine and gives her eight
// grosze to Vesna. Afterwards, 'after'. cast: old_woman. Sets: scarf_asked.
export default {
  id: 'rs_shrine_woman',
  cast: ['old_woman'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('scarf_returned') ? 'after' : S.flag('scarf_found') ? 'b1' : S.flag('scarf_asked') ? 'again' : 'a1') },

    a1: { s: 'old_woman', t: 'Are you from the pass?', next: 'a2' },
    a2: { s: 'vesna', t: (S, D) => ((D.G.time?.day ?? 1) >= 2 ? 'I came down it yesterday.' : 'I came down it today.'), next: 'a3' },
    a3: { s: 'old_woman', t: "My Jasiek went up four days ago with the sledge, for wood. He's sixteen. I put the milk here for him, in case he comes by this way. It's no use to the shrine.", next: 'a4' },
    a4: { s: 'vesna', t: 'What does he look like?', next: 'a5' },
    a5: { s: 'old_woman', t: "Tall. He stoops. A grey scarf with a red stripe, I knitted it, it's too long, he trips on it.", next: 'a6' },
    a6: { s: 'vesna', t: 'I saw a cart on the pass. A man, a woman, a girl.', next: 'a7' },
    a7: { s: 'old_woman', t: "Not him. He's by himself.", next: 'a8' },
    a8: { s: 'vesna', t: "I'll keep an eye out.", next: 'a9' },
    a9: { s: 'old_woman', t: 'He knows the road.', do: (S) => S.set('scarf_asked'), end: true },

    again: { s: 'old_woman', t: 'Any sign?', next: 'ag2' },
    ag2: { s: 'vesna', t: 'Not yet.', next: 'ag3' },
    ag3: { s: 'old_woman', t: "He'll be hungry.", end: true },

    b1: { s: 'vesna', t: 'Is this his?', next: 'b2' },
    b2: { s: 'old_woman', t: "That's mine. I bought the wool off the Kowal woman.", wait: 1.4, next: 'b3' },
    b3: { s: 'vesna', t: 'It was on the pass road, past the sledge. By itself.', next: 'b4' },
    b4: { s: 'old_woman', t: 'By itself.', wait: 1.2, next: 'b5' },
    b5: { s: 'vesna', t: "I didn't find anything else. It had snowed over everything.", next: 'b6' },
    b6: { s: 'old_woman', t: 'Yes.', wait: 1.0, next: 'b7' },
    b7: { s: 'old_woman', t: "I'll put it up on the post. He'll see it from the road.", next: 'b8' },
    b8: { s: 'old_woman', t: "You'll want paying. It's eight grosze, it's what's in the jar. I'd rather it went somewhere.", next: 'b9' },
    b9: { s: 'vesna', t: 'All right.', next: 'pay' },
    pay: { s: 'old_woman', t: 'Thank you.', end: true },

    after: { s: 'old_woman', t: 'I still bring the milk.', end: true },
  },
};
