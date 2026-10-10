// The people at the table: who they are, how they play, what they stake, what they say while they do.
// Pure data plus pickLine(). Lines follow docs/STORY.md "Writing voice": what a tired person at a bar would say
// about the dice in front of them, nothing clever. Every string here is unvoiced until a cloud session records it
// (scripts/voice/extract.mjs reads `voiceLines`).
//
//   OPPONENTS[id]   { id, name, npc, site, personality, stakes: [min, max], purse, dice, lines: { situation: [text] } }
//   pickLine(opp, situation, rand, avoid)   one line for the situation, not the one just said
//   voiceLines()    [[speaker, text], ...] every bark, for the voice extractor
//
// Situations: roll (as they roll), good, bad (looking at their first roll), raise, call, fold, win and lose (a
// round), broke (cannot cover another round).
//
// site: where the match is played. 'bar' is the counter in front of Zbyszek; 'table' is the middle table
// in the tavern, where Wojtek and Halina sit. purse is what they sit down with each day (they win and lose from it).
export const OPPONENTS = {
  zbyszek: {
    id: 'zbyszek', name: 'Zbyszek', npc: 'zbyszek', site: 'bar', personality: 'cautious', stakes: [1, 3], purse: 24, dice: 'bone',
    lines: {
      roll: ['Right, then.', 'Mind the mugs.', 'Give me room.', "Let's have them."],
      good: ["That'll do.", 'Not bad. Not bad at all.', "Hm. That's something.", "I've had worse."],
      bad: ["Oh, that's no use.", 'Nothing. Not a pair between them.', 'Look at that. Rubbish.', 'These have been dropped too often.'],
      raise: ["I'll put another on it.", 'Make it more.', 'One more, then.'],
      call: ['All right.', 'I can match that.', 'Go on, then.'],
      fold: ['No. Not on that.', "I'll leave it.", 'You can have this one.'],
      win: ["That's mine.", "I'll have that, thank you.", "Good. That's the candles paid.", 'Put it there, by the till.'],
      lose: ['Go on, take it.', "Well. I'll write that down.", "That's out of the till, that is.", 'Hm. Take it, then.'],
      broke: ["That's the float. I'm not touching the rest.", "I haven't any more out here.", 'Not another one. Bogdan counts the till.', "I'm done. Ask me tomorrow."],
    },
  },
  wojtek: {
    id: 'wojtek', name: 'Wojtek', npc: 'wojtek', site: 'table', personality: 'bold', stakes: [3, 10], purse: 70, dice: 'walnut',
    lines: {
      roll: ['Come on, come on.', 'Right, watch this.', 'Give us a good one.', 'Go on, you rotten things.'],
      good: ['There! Look at that.', "Now we're talking.", 'Ha. Put your coin down.', "That's more like it."],
      bad: ['Oh, you rotten...', "What's this? What is this?", "Throw them again. They've gone cold.", 'Rubbish. Pure rubbish.'],
      raise: ['Double it.', 'I\'ll go up. Go on, match it.', 'More. Put more on.'],
      call: ["I'll see that.", 'Fine. Fine, I call.', 'Go on, then.'],
      fold: ['Not that one.', "Keep it. I'm out.", "No. I'm not paying for that."],
      win: ["That's me! Pay up.", 'In my pocket.', 'Count it out, then.', 'Ha! Again?'],
      lose: ['Take it, take it.', "Beginner's luck, that.", "Hm. You didn't even blink. Take it.", 'Well. Well. Go on.'],
      broke: ["That's me done till Friday.", "I've nothing left but the axe.", 'Not a grosze more. My brother has the rest.', "That's the week's wages. All of them."],
    },
  },
  halina: {
    id: 'halina', name: 'Halina', npc: 'halina', site: 'table', personality: 'bluffer', stakes: [2, 6], purse: 45, dice: 'horn',
    lines: {
      roll: ['Mm.', "Let's see, then.", 'All right.', 'Easy now.'],
      good: ["Hm. That's something.", "I'll not complain.", "That's a decent lot.", 'Well, now.'],
      bad: ['Nothing. As usual.', "There's a poor lot.", 'Well. There it is.', "I've seen better in the fish baskets."],
      raise: ["I'll make it dearer.", 'Another on it.', 'Put some more down, if you like.'],
      call: ['I can pay for that.', 'Go on, then.', 'Fine. I call.'],
      fold: ["No, I'll leave that.", 'Not for that.', 'You have it.'],
      win: ['Thank you.', "I'll take that.", "Don't look so sorry.", "That's mine, dear."],
      lose: ['Take it, then.', 'Well played.', "Hm. You've had luck.", 'Go on. Count it.'],
      broke: ["That's all I brought.", "I'm out. I'll not borrow to play.", 'The rest is for flour.', "I haven't got more with me."],
    },
  },
};

export const OPPONENT_IDS = Object.keys(OPPONENTS);

// A line for a situation. `avoid` is the text said last, so nobody repeats themselves straight away.
export function pickLine(opp, situation, rand = Math.random, avoid = null) {
  const list = opp.lines?.[situation];
  if (!list || !list.length) return null;
  const pool = list.length > 1 ? list.filter((t) => t !== avoid) : list;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

export function voiceLines() {
  const out = [];
  for (const o of Object.values(OPPONENTS)) {
    for (const list of Object.values(o.lines)) for (const t of list) out.push([o.id, t]);
  }
  return out;
}
