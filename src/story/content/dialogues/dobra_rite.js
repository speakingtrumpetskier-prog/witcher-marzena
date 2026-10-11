// dobra_rite: the effigy maker's workshop, morning of day 2 (after the dawn transition).
//
// Entry: first real talk with Dobra (not met_dobra), normally the Q5 stage "Ask Dobra about the rite".
// cast: dobra. Her hands never stop; use `a: 'mend_net'` on her lines.
// Sets:  met_dobra (start), dobra_knot_noticed (the knot beat; it fires from the "red thread" topic
//        or, if Vesna never asks, as she turns to leave, so it always happens).
// Reads: lair_seen (the belfry topic, where Dobra tells the story of her boy under the bed).
//        knows_wiesia: without it Vesna asks after Hanka's older girl without the name, and Dobra says it (sets it).
// Sets:  matka_asked (the Matka topic; the bestiary page quotes her).
// Topics (all `once`): how long one takes, the rite, why not turn round (follows the rite), how old it
//        is (the island stones), the red thread, Wiesia, the tower, Matka (needs matka_seen).
export default {
  id: 'dobra_rite',
  cast: ['dobra'],
  start: 'd1',
  nodes: {
    d1: { s: 'dobra', t: "Mind your feet, that's tonight's.", a: 'mend_net', do: (S) => S.set('met_dobra'), next: 'd2' },
    d2: { s: 'vesna', t: 'Sorry.', next: 'd3' },
    d3: { s: 'dobra', t: "Not there either, that's the hair.", next: 'd4' },
    d4: { s: 'vesna', t: 'Where do I stand?', next: 'd5' },
    d5: { s: 'dobra', t: "By the door. You'll be out of my light.", next: 'hub' },

    hub: {
      choices: [
        { t: 'How long does one take to make?', next: 'ti1', once: true },
        { t: 'Tell me how the rite goes.', next: 'ri1', once: true },
        { t: 'How old is it, the rite?', next: 'ol1', once: true },
        { t: 'The straw ones on the ice had red thread at the neck.', next: 'kn1', once: true },
        { t: (S) => (S.flag('knows_wiesia') ? 'Hanka\'s older girl. Wiesia.' : 'Hanka\'s older girl.'), next: 'wi1', once: true },
        { t: 'I was in the drowned tower last night.', next: 'to1', once: true, if: (S) => !!S.flag('lair_seen') },
        { t: 'Something very big goes round the valley.', next: 'mt1', once: true, if: (S) => !!S.flag('matka_seen') },
        { t: 'That is all I wanted.', next: 'leave', exit: true },
      ],
    },

    ti1: { s: 'vesna', t: 'How long does one take to make?', next: 'ti2' },
    ti2: { s: 'dobra', t: 'Three days. Two, if nobody talks to me.', a: 'mend_net', next: 'ti3' },
    ti3: { s: 'vesna', t: "I'll be quick.", next: 'ti4' },
    ti4: { s: 'dobra', t: 'You won\'t. They never are. Hand me that. No, the long one.', next: 'hub' },

    ri1: { s: 'vesna', t: 'Tell me how the rite goes.', next: 'ri2' },
    ri2: { s: 'dobra', t: 'Every year I make her and every year they drown her. My mother made them before me.', a: 'mend_net', next: 'ri3' },
    ri3: { s: 'dobra', t: "You walk her out, you burn her, in she goes, you walk back singing. You don't turn round. That's all there is to it.", wait: 1.0, next: 'riq' },
    riq: {
      choices: [
        { t: 'Why not turn round?', next: 'ri4', once: true },
        { t: 'All right.', next: 'hub' },
      ],
    },
    ri4: { s: 'vesna', t: 'Why not turn round?', next: 'ri5' },
    ri5: { s: 'dobra', t: "Because you don't. My mother didn't. Her mother didn't.", next: 'hub' },

    ol1: { s: 'vesna', t: 'How old is it, the rite?', next: 'ol2' },
    ol2: { s: 'dobra', t: "Older than me. There's old stones out on the island with pictures cut in them.", next: 'ol3' },
    ol3: { s: 'dobra', t: "My grandmother used to say it was real girls once, before the straw. I don't know. She said a lot of things.", wait: 0.8, next: 'ol4' },
    ol4: { s: 'dobra', t: "Bogdan's been out to look at those stones. Twice this winter.", wait: 1.0, next: 'ol5' },
    ol5: { s: 'vesna', t: 'Why?', next: 'ol6' },
    ol6: { s: 'dobra', t: 'Ask Bogdan.', a: 'mend_net', next: 'hub' },

    // the knot
    kn1: { s: 'vesna', t: 'The straw ones on the ice had red thread at the neck. All of them.', next: 'kn2' },
    kn2: { s: 'dobra', t: 'Mine. I tie every one. Why, did they come undone?', next: 'kn3' },
    kn3: { s: 'vesna', t: 'No.', next: 'kn4' },
    kn4: { s: 'dobra', t: 'Good.', next: 'kn5' },
    kn5: { s: 'narrator', t: 'Dobra looks up. Her eyes go to the cord at Vesna\'s neck, and the red knot tied in it. Her hands stop.', italic: true, dur: 4.2, cam: 'close', next: 'kn6' },
    kn6: { s: 'dobra', t: 'Where did you get that?', wait: 0.6, next: 'kn7' },
    kn7: { s: 'vesna', t: "I've always had it.", next: 'kn8' },
    kn8: { s: 'dobra', t: 'Hm.', next: 'kn9' },
    kn9: { s: 'narrator', t: 'She goes back to work, faster.', italic: true, dur: 2.4, do: (S, D) => { S.set('dobra_knot_noticed'); D.actor('dobra')?.play('mend_net'); }, next: 'kn10' },
    kn10: { s: 'dobra', t: 'Do you sing, hunter?', wait: 3.0, next: 'kn11' },
    kn11: { s: 'vesna', t: 'No.', next: 'kn12' },
    kn12: { s: 'dobra', t: 'No.', wait: 0.8, next: 'hub' },

    wi1: {
      s: 'vesna',
      t: (S) => (S.flag('knows_wiesia') ? "Hanka's older girl. Wiesia. Did you know her?" : "Hanka's older girl, the one who drowned. Did you know her?"),
      next: (S) => (S.flag('knows_wiesia') ? 'wi2' : 'wi1b'),
    },
    wi1b: { s: 'dobra', t: 'Wiesia.', a: 'mend_net', wait: 0.8, do: (S) => S.set('knows_wiesia'), next: 'wi2' },
    wi2: { s: 'dobra', t: "She helped me one winter. Good hands. Tied a better knot than me by the end. Don't tell her mother I said that.", a: 'mend_net', next: 'wi3' },
    wi3: { s: 'vesna', t: 'Why not?', next: 'wi4' },
    wi4: { s: 'dobra', t: "She'd only go home and think about it.", next: 'hub' },

    // the belfry
    to1: { s: 'vesna', t: 'There is a room at the top of the drowned tower. Seventeen straw figures sitting round a table.', next: 'to2' },
    to2: { s: 'dobra', t: 'Seventeen.', next: 'to3' },
    to3: { s: 'vesna', t: 'Frozen bread on the table. A music box. And a girl asked if her mother sent me.', next: 'to4' },
    to4: { s: 'narrator', t: 'Dobra is quiet a while.', italic: true, dur: 3, next: 'to5' },
    to5: { s: 'dobra', t: "My boy, when he was little, he'd get under the bed when it thundered. You couldn't pull him out. You had to sit on the floor and wait.", next: 'to6' },
    to6: { s: 'narrator', t: 'She ties off a knot.', italic: true, dur: 2, do: (S, D) => D.actor('dobra')?.play('mend_net'), next: 'to7' },
    to7: { s: 'dobra', t: 'Took half the night, some nights.', next: 'to8' },
    to8: { s: 'vesna', t: 'And then?', next: 'to9' },
    to9: { s: 'dobra', t: 'Then he came out. He was hungry.', wait: 0.6, next: 'to10' },
    to10: { s: 'dobra', t: 'Always hungry after.', next: 'hub' },

    // the big one over the valley (needs matka_seen, set when Vesna has watched her a while)
    mt1: { s: 'vesna', t: 'Something very big goes round the valley. High up, with lights in it.', next: 'mt2' },
    mt2: { s: 'dobra', t: 'Matka.', a: 'mend_net', next: 'mt3' },
    mt3: { s: 'vesna', t: 'Does she ever come down?', next: 'mt4' },
    mt4: { s: 'dobra', t: "She's never once looked down. Not in my time, not in my mother's.", do: (S) => S.set('matka_asked'), next: 'mt5' },
    mt5: { s: 'dobra', t: 'Hand me the long one. No. The long one.', next: 'hub' },

    // leaving
    leave: { next: (S) => (S.flag('dobra_knot_noticed') ? 'bye' : 'ka1') },
    ka1: { s: 'narrator', t: "As Vesna turns, the cord swings out of her collar. Dobra's hands stop.", italic: true, dur: 3.4, cam: 'close', next: 'ka2' },
    ka2: { s: 'dobra', t: 'Where did you get that?', wait: 0.6, next: 'ka3' },
    ka3: { s: 'vesna', t: "I've always had it.", next: 'ka4' },
    ka4: { s: 'dobra', t: 'Hm.', next: 'ka5' },
    ka5: { s: 'narrator', t: 'She goes back to work, faster.', italic: true, dur: 2.4, do: (S, D) => { S.set('dobra_knot_noticed'); D.actor('dobra')?.play('mend_net'); }, next: 'ka6' },
    ka6: { s: 'dobra', t: 'Do you sing, hunter?', wait: 3.0, next: 'ka7' },
    ka7: { s: 'vesna', t: 'No.', next: 'ka8' },
    ka8: { s: 'dobra', t: 'No.', wait: 0.8, next: 'bye' },

    bye: { s: 'dobra', t: 'Mind the straw on your way out.', a: 'mend_net', end: true },
  },
};
