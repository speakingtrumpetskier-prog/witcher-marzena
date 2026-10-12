// rs_fishers: Wacław and Franek quarrelling over a hole in the ice at the river mouth (src/story/controller/roadside/fishers.js).
//
// Entry: the quarrel, only before it is settled (afterwards rs_fisher_old and rs_fisher_young). Vesna is asked to say whose the hole is; there are
// three answers and a way out. The end nodes decide it: 'end_old' (Wacław keeps the hole, Franek goes), 'end_young' (Franek keeps it for the
// day, Wacław goes) and 'end_both' (a second hole is cut a few paces over). The controller reads the end node, sets fishers_settled to
// 'old', 'young' or 'both' and pays four grosze to Vesna from whoever she favoured (not in the third case). cast: fisher_old, fisher_young.
export default {
  id: 'rs_fishers',
  cast: ['fisher_old', 'fisher_young'],
  start: 'a1',
  nodes: {
    a1: { s: 'fisher_old', t: 'I cut this hole. My father cut it before me, at this bend, every freeze.', a: 'point', next: 'a2' },
    a2: { s: 'fisher_young', t: "And I've been on it since before light. My line's in it.", next: 'a3' },
    a3: { s: 'fisher_old', t: "Your line is in my hole.", next: 'a4' },
    a4: { s: 'fisher_young', t: "It's the river's hole. It's where the water comes in. Anyone can fish where the water comes in.", next: 'a5' },
    a5: { s: 'fisher_old', t: 'Then cut your own.', next: 'a6' },
    a6: { s: 'fisher_young', t: "The fish come where the river comes in. There's no sense cutting a hole where there's nothing.", next: 'a7' },
    a7: { s: 'fisher_old', t: "You. Hunter. You've no stake in it. Say whose it is.", next: 'hub' },

    hub: {
      choices: [
        { t: "It's his. He cut it.", next: 'o1' },
        { t: "He's got his line in it. It's his for today.", next: 'y1' },
        { t: "There's ice enough for two. Cut another a few paces over.", next: 'b1' },
        { t: "I'm not here for this.", next: 'n1', exit: true },
      ],
    },

    o1: { s: 'vesna', t: "It's his. He cut it.", next: 'o2' },
    o2: { s: 'fisher_young', t: "Of course. It's always the old ones' holes.", next: 'o3' },
    o3: { s: 'fisher_young', t: "Fine. There'll be fish downstream.", next: 'o4' },
    o4: { s: 'fisher_old', t: "There won't.", next: 'o5' },
    o5: { s: 'fisher_young', t: "Then I'll catch nothing somewhere else.", next: 'o6' },
    o6: { s: 'narrator', t: 'He gathers his bucket and his line and goes off across the ice toward the shore.', italic: true, dur: 3.2, next: 'o7' },
    o7: { s: 'fisher_old', t: "Here. For your trouble.", wait: 0.8, next: 'o8' },
    o8: { s: 'vesna', t: "You don't have to.", next: 'o9' },
    o9: { s: 'fisher_old', t: 'I know I don\'t.', next: 'end_old' },
    end_old: { s: 'narrator', t: 'He counts four grosze into her hand and turns back to the hole.', italic: true, dur: 3, end: true },

    y1: { s: 'vesna', t: "He's got his line in it. It's his for today.", next: 'y2' },
    y2: { s: 'fisher_old', t: 'For today.', wait: 0.8, next: 'y3' },
    y3: { s: 'fisher_old', t: "Thirty winters I've cut that hole.", next: 'y4' },
    y4: { s: 'fisher_young', t: "I didn't ask for it.", next: 'y5' },
    y5: { s: 'fisher_old', t: 'No.', wait: 0.8, next: 'y6' },
    y6: { s: 'narrator', t: 'The old man takes up his stool and his basket and walks off along the shore without looking round.', italic: true, dur: 3.4, next: 'y7' },
    y7: { s: 'fisher_young', t: "Here. It's not much.", next: 'end_young' },
    end_young: { s: 'narrator', t: 'He gives her four grosze and sits down at the hole.', italic: true, dur: 2.8, end: true },

    b1: { s: 'vesna', t: "There's ice enough for two. Cut another a few paces over.", next: 'b2' },
    b2: { s: 'fisher_old', t: "That's an hour's work.", next: 'b3' },
    b3: { s: 'fisher_young', t: "I'll do it.", next: 'b4' },
    b4: { s: 'fisher_old', t: "You'll cut it too close.", next: 'b5' },
    b5: { s: 'fisher_young', t: "I'll cut it where I like.", next: 'b6' },
    b6: { s: 'fisher_old', t: 'Mind the slush. It goes in the hole.', next: 'end_both' },
    end_both: { s: 'narrator', t: 'The young man takes up the ice axe. The old man watches him do it, and says nothing.', italic: true, dur: 3.4, end: true },

    n1: { s: 'vesna', t: "I'm not here for this.", next: 'n2' },
    n2: { s: 'fisher_old', t: 'No one is.', end: true },
  },
};
