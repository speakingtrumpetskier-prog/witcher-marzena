// Ambient barks (docs/STORY.md section 5, voice rules at the top of that file) and how they are chosen.
//
//   chooseBark(G, npc, rand)       -> string | null   one line for this villager right now
//   chooseExchange(G, a, b, rand)  -> [string, ...] | null   a short back-and-forth for a pair
//
// Selection looks at: who (child, fisherman, named, role tag), when (night after 18:30, before
// 6:00), the weather, and story flags (`lair_seen` switches the pairs to the day 2 talk about tonight's rite;
// `planetnicy_seen` lets the SKY_ pools in, now and then). A short global memory keeps the same line from being
// heard twice in a row. While Matka Chmur swells nobody outdoors says anything (see swelling()).

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
// What the fishermen say to someone who has a rod in her hand (once she has fished or been lent one).
const FISHER_TIPS = [
  'Nobody sits under the tower.',
  'Keep the jig high on the shelf. Perch like the top.',
  'Burbot want the bottom, and they want the dark.',
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

// The herders (planetnicy) as ordinary weather, said in passing. Only once the player has seen them (flag
// planetnicy_seen), so she knows who is being talked about. Nobody explains them or marvels at them: fishermen
// read them for tomorrow's snow, mothers tell children to put a hand down, nobody counts past twenty.
const SKY_FISHER_CLEAR = [
  'Low tonight. No snow by morning.',
  "They're thick over the poles. Hard frost.",
  'Low and many. Bring your water in.',
];
const SKY_FISHER_SNOW = [
  'Not one up since dawn. Snow by noon.',
  "They've gone high. Cover your nets.",
  "Can't see a single herder. I'm going home.",
];
const SKY_NIGHT = [
  'Clear tonight. Bank the fire.',
  "They're down low. The well will freeze.",
  'Put your hand down. Not at them.',
];
const SKY_DAY = [
  "Didn't see one this morning. I'm taking the washing in.",
  "They're sitting over the roofs again. It'll snow on somebody's yard.",
  'Put your hand down, you will lose a day.',
];
const SKY_CHILD = [
  'Nine! Ten!',
  "There's a pink one! There's a pink one!",
  'Stop at twenty, Kuba!',
  "Don't talk to me, I'm at seventeen.",
];

// Once Vesna has cut down the hanged man at the crossroads (flag hanged_cut): said in passing for a day or so,
// by grown-ups in daylight, now and then. Nobody thanks her and nobody says it was right.
const HANGED = [
  "Somebody's cut Agnieszka's brother down.",
  "He'll keep till the thaw. Can't dig in this.",
  'Agnieszka took bread out to the crossroads this morning.',
];
const HANGED_BOGDAN = ["I'll send the sledge for him when the road's clear."];
const HANGED_PAIRS = [
  ['Who cut him down?', "Nobody's saying."],
  ['Bogdan went out to the crossroads.', 'And?', 'Stood there. Came back.'],
];

// Pairs: lines alternate A, B, A...
const SKY_PAIRS = [
  ['Where are they today?', 'Up. Snow by evening.'],
  ["Matka's early.", "She's no earlier than yesterday."],
  ["They're over the mill again.", "They're always over the mill."],
];
const SKY_CHILD_PAIRS = [
  ['Eleven. Twelve.', 'Stop at twenty.'],
  ['Is that Matka?', "That's a cloud."],
];
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

// While Matka Chmur swells (about half a minute, every 29 s), whoever is outdoors stops talking and waits
// for her to let her breath out. Nothing is said about it; the barks just go quiet.
function swelling(G) {
  const c = G.spirits?.cathedral;
  return !!c && c.pulse > 0.18;
}

const seenSky = (G) => !!G.state?.flag('planetnicy_seen');
const cutDown = (G) => !!G.state?.flag('hanged_cut');

// A line about the herders for this person now, or null (most of the time). Named people keep their own.
function skyPool(G, npc, preset, tag, rand) {
  if (!seenSky(G) || rand() > 0.3) return null;
  const clear = G.weather?.state === 'clear';
  const h = G.time.hours;
  if (/^(ola|child_)/.test(preset)) return SKY_CHILD;
  if (/^fisherman/.test(preset) || tag === 'net' || tag === 'ice_hole') {
    if (clear) return h >= 15 || h < 9 ? SKY_FISHER_CLEAR : null;
    return SKY_FISHER_SNOW;
  }
  if (isNight(G)) return clear ? SKY_NIGHT : null;
  return SKY_DAY;
}

export function chooseBark(G, npc, rand = Math.random) {
  const id = npc.id, preset = npc.preset || id, tag = npc.station?.tag || '';
  if (swelling(G)) return null;
  const named = id === 'zbyszek' || id === 'dobra' || id === 'bogdan' || id === 'hanka' || id === 'jarek';
  let pool;
  const sky = named ? null : skyPool(G, npc, preset, tag, rand);
  if (sky) pool = sky;
  else if (id === 'zbyszek') pool = ZBYSZEK;
  else if (id === 'dobra') pool = DOBRA;
  else if (id === 'bogdan') pool = cutDown(G) && rand() < 0.4 ? HANGED_BOGDAN : BOGDAN;
  else if (id === 'hanka') pool = HANKA;
  else if (id === 'jarek') pool = JAREK;
  else if (/^(ola|child_)/.test(preset)) pool = CHILD;
  else if (/^fisherman/.test(preset) || tag === 'net' || tag === 'ice_hole') pool = G.state && (G.state.count('rod') || G.state.flag('fished')) ? [...FISHER, ...FISHER_TIPS] : FISHER;
  else if (tag === 'market') pool = SELLER;
  else if (tag === 'forge') pool = SMITH;
  else if (isNight(G)) pool = NIGHT;
  else if (cutDown(G) && rand() < 0.22) pool = HANGED;
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
  if (swelling(G)) return null;
  if (kids) return seenSky(G) && rand() < 0.35 ? pick(SKY_CHILD_PAIRS, rand) : pick(CHILD_PAIRS, rand);
  if (isNight(G)) return null;
  if (seenSky(G) && rand() < 0.3) return pick(SKY_PAIRS, rand);
  if (cutDown(G) && rand() < 0.25) return pick(HANGED_PAIRS, rand);
  if (G.state && G.state.flag('lair_seen')) return pick(PAIRS_DAY2, rand);
  return pick(PAIRS, rand);
}
