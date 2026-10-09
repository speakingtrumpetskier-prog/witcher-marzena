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
};

// kind: letter | diary | ledger | scrawl | carving | drawing | inscription | object
// text: paragraphs separated by \n. sign: closing line, drawn like a signature.
export const NOTES = {
  note_cart_family: {
    title: 'A Letter from the Cart', where: 'The Hollow Pass', kind: 'letter',
    text: 'Brother.\nIf this finds you, we did not make it over. Three winters and the snow up here has not gone soft once, not even at midsummer. The old women in Marzena say the lake will not let anyone leave until it gets what it wants. I say a man can walk. Mira says I am a fool. Zosia asked me if the goddess is angry with her. I told her goddesses do not know her name.',
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
    text: 'He took three loaves for my children. The reeve wept when he gave the order. I will not weep for the reeve. If you mean to hang me too, find a better rope. This one is frayed, and we have no other.',
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
    text: 'Carvings older than the church. Women on the ice with a girl between them. A hole. The girl going down.\nThe next stone: a straw girl going down instead, and the women dancing.\nSomebody, a long time ago, decided this was better.',
  },
  note_ledger: {
    title: 'The Reeve’s Ledger', where: 'Longhouse cellar', kind: 'ledger',
    text: 'Sacks: 41.\nMouths: 186.\nRation: half a measure.\nKral household: Bogdan. Mateusz (crossed out).\nKral ration given to the Nowak children.\nGiven to widow Pawlak.\nGiven to the Wrona girl.\nSacks at the thaw, if the thaw comes: 0. If it does not come: 0.',
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
  item_ring: { title: 'A Wedding Ring', where: 'Hanka', kind: 'object', text: 'A thin wedding ring on a string. Hanka’s.' },
  item_bird: { title: 'The Waxwing', where: 'Jarek', kind: 'object', text: 'A waxwing carved from birch, the crest done with care. Never given.' },
  item_music_box: { title: 'Music Box', where: 'The belfry', kind: 'object', text: 'A tin music box with a crank. It plays four notes and a fall.' },
  item_ribbon: { title: 'Red Ribbon', where: 'The belfry', kind: 'object', text: 'A red ribbon, stiff with frost, tied in Dobra’s knot.' },
  item_straw_doll: { title: 'Straw Doll', where: 'Dobra', kind: 'object', text: 'A straw doll the size of a hand. Red thread at the neck.' },
};

// Unlock rules read G.state (flags and quest stages). Anything can also unlock an entry by
// setting the flag 'bestiary_<id>'.
export const BESTIARY = [
  {
    id: 'wolf', name: 'Wolves', sub: 'Grey wolf, northern, starving', sketch: 'wolf',
    unlock: (S) => !!(S.flag('wolves_seen') || S.flag('wolves_fought') || S.data.stats?.kills > 0 || S.data.quests?.main_pass?.stage >= 3),
    text: [
      'Grey wolf. Pack of three or four, led by whoever eats last and fights first. These are thin, and thin wolves come down to roads.',
      'They circle. They feint at the legs, then go for the hamstring, never the throat. Do not turn your back. Do not run. Do not be clever.',
      'They came down the pass in daylight. Wolves do not do that. Something pushed them.',
    ],
    weak: 'Ember. A cone of fire and they remember being afraid.',
    beware: 'They flank. Put a wall at your back.',
  },
  {
    id: 'marzanny', name: 'Marzanny', sub: 'The straw girls', sketch: 'marzanny',
    unlock: (S) => !!(S.flag('effigies_fought') || S.flag('trail_found')),
    text: [
      'Effigies. Straw bodies, a white rag for a dress, a pale wooden face nailed on. They have no business walking.',
      'Slow, until they are not. One heavy swing from above, then a grab, and a grab holds. I have not worked out what they want, so I assume company.',
      'Straw burns. Ember and they come apart into wet hay, and each leaves a red knot where its neck was. Tied tight and tied neat. Somebody took pride.',
    ],
    weak: 'Ember. Fire jumps between them, which is a mercy.',
    beware: 'Dodge the swing. Do not stand and block it.',
  },
  {
    id: 'marzanna', name: 'The Marzanna', sub: 'A girl, three winters in the water', sketch: 'marzanna',
    unlock: (S) => !!(S.flag('lair_seen') || S.flag('wiesia_spoke') || S.flag('boss_started')),
    text: [
      'Not a monster the way a wolf is. A girl holding a door shut so the light stays out. Fourteen, and three winters under the ice.',
      'White cloth and frost, hair that floats on no water, a crown of frozen straw. Four meters tall at her worst. She screams when she is frightened, which is most of the time.',
      'Gale breaks the ice on her. Ward takes the scream. The rest is patience, and, I suspect, a mother.',
    ],
    weak: 'Gale. It cracks the ice armor.',
    beware: 'A pale glow under your feet means she is beneath you. Move.',
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
