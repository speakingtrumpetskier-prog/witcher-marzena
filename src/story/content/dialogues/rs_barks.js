// rs_barks: the floating lines of the roadside encounters (src/story/controller/roadside). NOT a scene: nothing starts this. The
// controller says each of these as a bark over the person's head (K.bark), and the voice tools read this file like any dialogue so that
// they get voice clips under the speaker's own id. Keep the speaker and the text identical to the code that says it.
export default {
  id: 'rs_barks',
  cast: [],
  start: 't1',
  nodes: {
    // the tinker, on the pass road and at the stalls (tinker.js)
    t1: { s: 'tinker', t: 'Hunter! Over here, if you have a minute.', end: true },
    t2: { s: 'tinker', t: "Up. I can't tie it from the ground.", end: true },
    t3: { s: 'tinker', t: 'Another time, then.', end: true },
    t4: { s: 'tinker', t: 'Down. Slowly.', end: true },
    t5: { s: 'tinker', t: 'There you are.', end: true },
    t6: { s: 'tinker', t: 'Pots mended. Spoons. Kettles.', end: true },
    t7: { s: 'tinker', t: 'Thaw draught, eight grosze.', end: true },
    t8: { s: 'tinker', t: 'Mind the load.', end: true },
    // the man with the lantern (poacher.js)
    p1: { s: 'poacher', t: "Who's there?", end: true },
    // the quarrel at the river mouth, said in turn while she is near (fishers.js)
    f1: { s: 'fisher_old', t: 'My father cut this hole.', end: true },
    f2: { s: 'fisher_young', t: "Your father's not here.", end: true },
    f3: { s: 'fisher_old', t: 'Move your bucket.', end: true },
    f4: { s: 'fisher_young', t: 'I was here first.', end: true },
    f5: { s: 'fisher_old', t: 'Since when?', end: true },
    f6: { s: 'fisher_young', t: 'Since before light.', end: true },
    // the boy, when she gives up on the sled (sled.js)
    b1: { s: 'sled_boy', t: 'Never mind. I will manage.', end: true },
    // Vesna's remarks (K.say: the subtitle, and her voice clip if there is one)
    v1: { s: 'vesna', t: 'Come on, then.', end: true },
    v2: { s: 'vesna', t: 'Left her behind.', end: true },
    v3: { s: 'vesna', t: "Wolves on a kill. They haven't seen me.", end: true },
    v4: { s: 'vesna', t: 'Roe deer. They pulled it down this morning.', end: true },
    v5: { s: 'vesna', t: 'A roe deer. Not much left of it.', end: true },
  },
};
