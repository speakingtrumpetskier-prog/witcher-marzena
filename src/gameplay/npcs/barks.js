// Ambient barks (docs/STORY.md section 5, voice rules at the top of that file) and how they are chosen.
//
//   chooseBark(G, npc, rand)       -> string | null   one line for this villager right now
//   chooseExchange(G, a, b, rand)  -> [string, ...] | null   a short back-and-forth for a pair
//
// Selection looks at: who (child, fisherman, named, role tag), when (night after 18:30, before
// 6:00), and story flags (`lair_seen` switches the pairs to the day 2 talk about tonight's rite). A short global
// memory keeps the same line from being heard twice in a row.

const DAY = [
  "Don't look at her eyes.",
  "Hunter. We've nothing to pay you with, you know.",
  'Did you hear it last night? Out on the lake?',
  "Have you got any tallow? I'll give you eggs. Well. One egg.",
  "Mind the goat, she bites.",
  'Three sacks of rye left. Three.',
  'Wind is from the pass again.',
  'Has anyone seen my dog?',
];
const NIGHT = [
  "Get indoors, it's past dusk.",
  "Don't go past the poles.",
  'Hear that? No. Nothing. Go on.',
];
const DAY2 = ['Are you going tonight?', 'Is it the Wrona girl?'];
const FISHER = [
  'Not past the poles. Never past the poles.',
  "Herring's thin this year.",
  "You're standing on my line.",
  'Ice is thick here. Thick as my head.',
];
const CHILD = [
  "You're Marzanna!",
  'Witch! Do your eyes glow?',
  'If you look back she gets you!',
];
const SELLER = ["Bread's three grosze now. Three!"];
const SMITH = ['Stand back from the sparks.', 'Not today. Come back when it is cooler.'];
const ZBYSZEK = ["Shut the door, you're letting the heat out.", 'Wipe your boots.'];
const DOBRA = ['Straw, straw, straw.', 'Hands, girl. Use your hands.'];
const BOGDAN = ['Forty-one sacks.', 'Stay off the lake.'];
const HANKA = ['The milk freezes by morning.'];
const JAREK = ['Not now.', 'Sit somewhere else.'];

// Pairs: lines alternate A, B, A...
const PAIRS = [
  ['Is that a witch?', 'Hush. Walk.'],
  ['When did you last see grass?', "Don't."],
];
const PAIRS_DAY2 = [
  ['Is it the Wrona girl?', 'No. Hanka\'s.', "Hanka's? Her other one?"],
  ['Are you going tonight?', "Course I'm going. Everyone's going."],
];
const CHILD_PAIRS = [
  ["You're Marzanna!", 'No, you are!'],
  ['If you look back she gets you!', 'Does not!'],
];

const recent = [];
function remember(t) {
  recent.push(t);
  if (recent.length > 7) recent.shift();
}
function pick(arr, rand) {
  for (let k = 0; k < 6; k++) {
    const t = arr[Math.floor(rand() * arr.length)];
    if (!recent.includes(t)) return t;
  }
  return arr[Math.floor(rand() * arr.length)];
}

export function isNight(G) { return G.time.hours > 18.5 || G.time.hours < 6.0; }

export function chooseBark(G, npc, rand = Math.random) {
  const id = npc.id, preset = npc.preset || id, tag = npc.station?.tag || '';
  let pool;
  if (id === 'zbyszek') pool = ZBYSZEK;
  else if (id === 'dobra') pool = DOBRA;
  else if (id === 'bogdan') pool = BOGDAN;
  else if (id === 'hanka') pool = HANKA;
  else if (id === 'jarek') pool = JAREK;
  else if (/^(ola|child_)/.test(preset)) pool = CHILD;
  else if (/^fisherman/.test(preset) || tag === 'net' || tag === 'ice_hole') pool = FISHER;
  else if (tag === 'market') pool = SELLER;
  else if (tag === 'forge') pool = SMITH;
  else if (isNight(G)) pool = NIGHT;
  else if (G.state && G.state.flag('lair_seen') && rand() < 0.5) pool = DAY2;
  else pool = DAY;
  if (npc.def.barks) pool = Array.isArray(npc.def.barks) ? npc.def.barks : pool;
  if (!pool || !pool.length) return null;
  const t = pick(pool, rand);
  remember(t);
  return t;
}

export function chooseExchange(G, a, b, rand = Math.random) {
  const kids = /^(ola|child_)/.test(a.preset || a.id) && /^(ola|child_)/.test(b.preset || b.id);
  if (kids) return pick(CHILD_PAIRS, rand);
  if (isNight(G)) return null;
  if (G.state && G.state.flag('lair_seen')) return pick(PAIRS_DAY2, rand);
  return pick(PAIRS, rand);
}
