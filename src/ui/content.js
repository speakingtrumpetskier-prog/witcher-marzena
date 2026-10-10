// UI-owned copy: speaker names, quest titles (fallback), readable notes, bestiary, credits.
// Other builders can add to the notes and the bestiary at runtime with G.ui.registerNotes()
// and G.ui.registerBestiary(). Voice rules: docs/STORY.md. No em dashes, ever.

const SPEAKERS = {
  vesna: 'Vesna', ola: 'Ola', hanka: 'Hanka', bogdan: 'Bogdan', dobra: 'Dobra', zbyszek: 'Zbyszek',
  jarek: 'Jarek', wiesia: 'Wiesia', wiesia_ghost: 'Wiesia', marzanna: 'Wiesia', miller: 'Gniewko',
  miller_wife: 'Bożena', kasza: 'Kasza', narrator: '', villagers: 'Villagers',
};

// Turns a speaker id ('hanka', 'villager_m_3', 'child_b') or an already-readable name into a label.
export function displayName(id) {
  if (id == null) return '';
  const s = String(id);
  if (s in SPEAKERS) return SPEAKERS[s];
  if (/^villager/.test(s)) return 'Villager';
  if (/^child/.test(s)) return 'Child';
  if (/^fisherman/.test(s)) return 'Fisherman';
  if (/^elder/.test(s)) return 'Elder';
  if (/[A-Z\s]/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// Used only when G.quests does not expose titles (docs/STORY.md section 2).
export const QUEST_FALLBACK = {
  main_pass: { title: 'The Hollow Pass', kind: 'main', order: 1 },
  main_ice: { title: 'Something Walks the Ice', kind: 'main', order: 2 },
  main_straw: { title: 'Straw and Ice', kind: 'main', order: 3 },
  main_bell: { title: 'The Bell Under the Ice', kind: 'main', order: 4 },
  main_hanka: { title: 'What Hanka Saw', kind: 'main', order: 5 },
  main_rite: { title: 'The Drowning of Marzanna', kind: 'main', order: 6 },
  main_epilogue: { title: "Dobra's Knot", kind: 'main', order: 7 },
  side_bird: { title: 'A Bird for Wiesia', kind: 'side', order: 10 },
  side_ledger: { title: "The Reeve's Ledger", kind: 'side', order: 11 },
  side_wisps: { title: 'Lights in the Reeds', kind: 'side', order: 12 },
  side_wolves: { title: 'Wolves at the Mill', kind: 'side', order: 13 },
  side_snow: { title: 'Snow Fight', kind: 'side', order: 14 },
  side_handbell: { title: 'The Hand-Bell', kind: 'side', order: 15 },
};

// kind: letter | diary | ledger | scrawl | carving | drawing | inscription | object
// text: paragraphs separated by \n. sign: closing line, drawn like a signature.
export const NOTES = {
  note_cart_family: {
    title: 'A Letter from the Cart', where: 'The Hollow Pass', kind: 'letter',
    text: 'Brother.\nIf this finds you, we did not make it over. Three winters and the snow up here has not gone soft once, not even at midsummer. The old women in Marzena say the lake will not let anyone leave until it gets what it wants. I say a man can walk. Mira says I am a fool. Zosia\'s cough is worse. We go tomorrow if it stops snowing, and the day after if it does not.',
    sign: 'Tomasz',
  },
  note_contract: {
    title: 'The Contract', where: 'Notice board, Marzena', kind: 'letter',
    text: 'Something walks the ice at night. It has taken three men from the fishing holes. Kill it before the equinox. Payment: all I have. Ask at the shore.',
    sign: 'H.',
  },
  note_wolves_contract: {
    title: 'Wolves at the Mill', where: 'Notice board, Marzena', kind: 'letter',
    text: 'WOLVES at the mill. Took my dog and near took my boy. Will pay what I have, which is not much but is honest.',
    sign: 'Gniewko, miller',
  },
  note_tally: {
    title: 'Tally Marks', where: 'Watchtower Ruin', kind: 'carving',
    text: 'Rows of tally marks scratched into the stone, hundreds of them. Beneath:\nCOLD. WOLVES. COLD. BORED.\nKAZIMIERZ WAS HERE AND IS BETTER AT DICE THAN YOU.',
  },
  note_hanged: {
    title: 'Pinned to the Coat', where: 'The hanged man’s tree', kind: 'letter',
    text: 'He took three loaves for my children. The reeve cried when he gave the order, as if that helps anyone. Cut him down if you can, I can\'t reach.',
    sign: 'Agnieszka',
  },
  note_burner: {
    title: 'The Burner’s Scrawl', where: 'Charcoal Burners’ Camp', kind: 'scrawl',
    text: 'THE LAKE SINGS. THE LAKE SINGS.\nshe sings it backwards at night.\nTHE LAKE SINGS.\ndo not answer.\nTHE LAKE',
  },
  note_trapper: {
    title: 'The Trapper’s Diary', where: 'Trapper’s Cabin', kind: 'diary',
    text: 'Day 9. Wolves down from the pass in daylight. They do not hunt. They run. As if there is something in the high snow worse than hunger.\nDay 12. Set the big trap by the door.\nDay 14. Heard the bell from the lake tonight, clear as a feast day. There has been no bell in Marzena since the water came.\nDay 15. Going down to look.',
  },
  note_island: {
    title: 'The Carvings', where: 'Stone Circle Isle', kind: 'carving',
    text: 'Carvings older than the church. Women on the ice with a girl between them. A hole. The girl going down.\nThe next stone: a straw girl going down instead, and the women dancing.\nThe stones are worn smooth where people have touched them.',
  },
  note_ledger: {
    title: 'The Reeve’s Ledger', where: 'Longhouse cellar', kind: 'ledger',
    text: 'Sacks: 41.\nMouths: 186.\nRation: half a measure.\nKral household: Bogdan. Mateusz (crossed out).\nKral ration given to the Nowak children.\nGiven to widow Pawlak.\nGiven to the Wrona girl.\nWeeks left at this ration: 5.',
  },
  note_drawing: {
    title: 'The Ice Lady', where: 'Under the boardwalk', kind: 'drawing',
    text: 'the ice lady. she is lonly. she wants her mama.',
  },
  note_smuggler: {
    title: 'A Smuggler’s Note', where: 'The west marsh', kind: 'letter',
    text: 'Key to the burners’ kilns, third mound. Do not drink it all before I’m back.',
    sign: 'B.',
  },
  note_wit: {
    title: 'For Wit of the Lynx', where: 'Bear den', kind: 'inscription',
    text: 'For Wit of the Lynx. Paid in full.',
  },
  // The herders (planetnicy) as the village knows them: weather signs, a count, a complaint, a carving.
  note_almanac: {
    title: 'Weather, Copied Out', where: 'The Drowned Bell, by the door', kind: 'ledger',
    text: 'Copied from the old book behind the bar so people stop asking me.\nHerders low and many: Clear. Hard frost by morning.\nHerders high and few: Snow before noon.\nNone to be seen: It is snowing already.\nAmber ones leading: Dry cold, no wind.\nRose ones leading: Wind by evening.\nSitting over the mill: Snow in the yard.',
    sign: 'Z.',
  },
  note_slate: {
    title: 'Slate on a Stake', where: 'The ice-fishing camp', kind: 'inscription',
    text: 'LOW ones, nights: 17.\nSnow after: 1. (wind night, not counted)\nHIGH or none, nights: 11.\nSnow after: 9. The other two I was at Bolek\'s.\nBolek says it is the wind and not them. Bolek can mind his own net.\nLOW, tonight:',
    sign: 'S.',
  },
  note_child_herders: {
    title: 'Herders, Counted', where: 'Under the boardwalk', kind: 'drawing', sketch: 'child_herders',
    text: 'the herders. i counted 19.\none is pink. dont go past 20.',
  },
  note_shrine_bells: {
    title: 'Paper Under the Bowl', where: 'The shrine', kind: 'letter',
    text: 'Hail again, and again someone is ringing a hand-bell from the shrine step.\nThe bread on the altar is for Matka. The ringing is not for the shrine. It goes at the ring on the ice, at dusk, three times, and not before.\nNinth time this spring.',
    sign: 'Józia',
  },
  note_island_sky: {
    title: 'The Higher Carvings', where: 'Stone Circle Isle', kind: 'carving',
    text: 'Higher on the same stones, above the women: a row of round shapes with lines hanging down, like lamps on chains. One is cut far larger than the rest and runs across two stones.\nIts left end is cut shorter than the right, as if the mason ran out of stone.',
  },
  item_ring: { title: 'A Wedding Ring', where: 'Hanka', kind: 'object', text: 'A thin wedding ring on a string. Hanka’s.' },
  item_bird: { title: 'The Waxwing', where: 'Jarek', kind: 'object', text: 'A waxwing carved from birch, the crest done with care. Never given.' },
  item_music_box: { title: 'Music Box', where: 'The belfry', kind: 'object', text: 'A tin music box with a crank. It plays one tune.' },
  item_ribbon: { title: 'Red Ribbon', where: 'The belfry', kind: 'object', text: 'A red ribbon, stiff with frost, tied in Dobra’s knot.' },
  item_hand_bell: { title: 'A Hand-Bell', where: 'The ritual ring', kind: 'object', text: 'A brass hand-bell the size of a fist, green at the lip. Somebody tied a rag round the clapper so it would not ring in the wind.' },
  item_straw_doll: { title: 'Straw Doll', where: 'Dobra', kind: 'object', text: 'A straw doll the size of a hand. Red thread at the neck.' },
};

// Unlock rules read G.state (flags and quest stages). Anything can also unlock an entry by
// setting the flag 'bestiary_<id>'.
export const BESTIARY = [
  {
    id: 'wolf', name: 'Wolves', sub: 'Grey wolf, northern, starving', sketch: 'wolf',
    unlock: (S) => !!(S.flag('wolves_seen') || S.flag('wolves_fought') || S.data.stats?.kills > 0 || S.data.quests?.main_pass?.stage >= 3),
    text: [
      'Grey wolf, packs of three or four. These ones are starving, which is why they are on the roads.',
      'They circle and go for the legs. One feints while another comes in from the side. Keep moving and keep them in front of you.',
      'They came down the pass in daylight. The trapper on the north side wrote the same thing.',
    ],
    weak: 'Fire. Ember breaks them up.',
    beware: 'They flank. Keep something at your back.',
  },
  {
    id: 'marzanny', name: 'Marzanny', sub: 'The straw girls', sketch: 'marzanny',
    unlock: (S) => !!(S.flag('effigies_fought') || S.flag('trail_found')),
    text: [
      'The straw effigies from the rite, the ones they drown each spring. White dress, wooden face. They get up at night and walk the ice.',
      'Slow, then a heavy swing from above, then they try to grab. The grab is the dangerous part.',
      'They burn well. When they go down they leave wet straw and the red knot from the neck. Dobra ties those knots.',
    ],
    weak: 'Fire. Ember, and it spreads between them.',
    beware: 'Dodge the swing, don\'t try to block it.',
  },
  {
    id: 'marzanna', name: 'The Marzanna', sub: 'A girl, three winters in the water', sketch: 'marzanna',
    unlock: (S) => !!(S.flag('lair_seen') || S.flag('wiesia_spoke') || S.flag('boss_started')),
    text: [
      'Wiesia, Hanka\'s daughter. Fourteen when she went through the ice at the rite, three winters ago.',
      'White cloth and ice, hair moving like it is underwater, a crown of frozen straw. Four meters tall when she rises. She screams.',
      'Gale cracks the ice on her. Ward holds against the scream. She keeps going back under the ice and coming up somewhere else.',
    ],
    weak: 'Gale. It cracks the ice armor.',
    beware: 'A pale glow under your feet means she is beneath you. Move.',
  },
  {
    id: 'planetnicy', name: 'Płanetnicy', sub: 'The cloud herders', sketch: 'planetnik',
    unlock: (S) => !!S.flag('planetnicy_seen'),
    text: [
      'Pale lights that drift over the valley, well above the roofs. Bell-shaped, or flat like a saucer, or square like a lantern, with threads hanging under them. Some are small, some the size of a cart. They come out thick on clear nights and thin when it snows. On the worst days they go up into the cloud and are not seen.',
      'The old people say they herd the weather. A płanetnik walks the clouds over the pass and the weather follows it home. Nobody here is afraid of them. They talk about them the way they talk about geese: whether there are many this year, whether they came early.',
    ],
    // Added as Vesna witnesses things (flags are set in src/story/controller/world.js, side.js and the dialogues).
    more: [
      { when: (S) => !!S.flag('planetnicy_night'), text: 'At night they give off their own light: amber, rose, pale green, violet, always a stronger colour at the heart than at the edge.' },
      { when: (S) => !!S.flag('planetnicy_sparks'), text: 'The smallest ones travel in loose crowds of ten or a dozen and keep close to each other. The big ones just drift.' },
      { when: (S) => !!S.flag('planetnicy_low'), text: 'On clear still nights a few come down over the ice, well below the top of the tower. They keep to the lake and the marsh and thin out over the village roofs.' },
      { when: (S) => !!S.data.notes?.includes('note_almanac'), text: 'Zbyszek has a page of weather signs nailed up by the tavern door. Low and many means clear and a hard frost. High and few means snow before noon. If there are none to be seen, it is snowing already. The fishermen go by it.' },
      { when: (S) => !!(S.flag('herders_counted') || S.data.notes?.includes('note_child_herders')), text: 'The children count them, and they stop at twenty. Ola says nobody has got past twenty.' },
      { when: (S) => !!S.flag('handbell_rung'), text: 'Rang a hand-bell at the ritual ring at dusk, three times, the way it was done. A handful of them came down over the ice from different sides and stayed a while, then went back up. Bożena says they do that.' },
    ],
    beware: 'Do not point at them, and do not whistle. That is how you lose a day, or a year.',
  },
  {
    id: 'matka_chmur', name: 'Matka Chmur', sub: 'The Mother of Clouds', sketch: 'matka',
    unlock: (S) => !!(S.flag('matka_seen') || S.flag('matka_pulse')),
    text: [
      'The big one. The old people call her Matka Chmur, the Mother of Clouds. She is bigger than the church and bigger than the hill behind it, and she goes the long way round the valley, very slowly, with her threads hanging down toward the lake. By day she is only a paleness in the haze, like the moon. At night there are lights in her, in rows, like windows. Dobra says she has never once looked down.',
      'When she swells, the old ones stop where they stand, take their caps off and say nothing until she lets her breath out. It takes about half a minute. Nobody remembers who started it. On the first clear night of the year they leave a heel of bread on the ice for her. The ravens eat it and nobody minds.',
    ],
    more: [
      { when: (S) => !!S.flag('matka_pulse'), text: 'Watched her swell. The light runs along her from one end to the other, slowly, holds, and lets go. A little under half a minute, every time.' },
      { when: (S) => !!S.data.notes?.includes('note_island_sky'), text: 'She is on the island stones too, cut across two of them, with her left end shorter than her right. The carving is older than the church.' },
    ],
    beware: 'When Matka Chmur swells, cap off and mouth shut.',
  },
];

// Humble on purpose; the lead edits names. Each group: heading + lines of [role, name] or plain text.
export const CREDITS = [
  { head: 'Design', lines: [['Direction and world', 'The Marzena team'], ['Valley and layout', 'The Marzena team']] },
  { head: 'Story', lines: [['Script and quests', 'The Marzena team'], ['Journal and letters', 'In Vesna’s hand']] },
  { head: 'Systems', lines: [['Engine, light and weather', 'The Marzena team'], ['Characters and combat', 'The Marzena team'], ['Music and sound', 'The Marzena team']] },
  { head: 'Song', lines: ['“Marzanno”, a lullaby for the drowning of winter'] },
];

export const CREDITS_LAST_LINE = 'Go down, go down, and let the green come back.';
