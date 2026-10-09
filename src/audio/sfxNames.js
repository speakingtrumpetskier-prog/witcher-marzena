// Public sound names for G.audio. Other builders use these strings with G.audio.sfx(name),
// G.audio.loop(name), G.audio.setMood(name) and G.audio.stinger(name). Unknown names warn once
// in the console and are ignored, so a typo never throws.
//
// Conventions for callers:
// - Footsteps: call once per footfall with the surface from G.world.surfaceAt (step_snow,
//   step_ice, step_wood, step_road). Pass { volume } around 0.6 for walking and 1 for running.
// - Hooves: call once per hoof strike (hoof_walk, hoof_trot, hoof_gallop).
// - Positional sounds: pass { pos } (a THREE.Vector3 or {x,y,z}). Sounds made by the player
//   (her steps, grunts, sword) can omit pos so they stay centered and dry.

export const MOODS = [
  'pass', 'reveal', 'wild', 'village', 'night', 'tense', 'combat', 'boss',
  'procession', 'thaw', 'sorrow', 'lullaby', 'silence',
];

export const STINGERS = ['discover', 'quest', 'echo', 'danger', 'choice', 'death', 'reveal'];

// Grouped for the audition page and for docs. SFX_NAMES is the flat list.
export const SFX_GROUPS = {
  footsteps: ['step_snow', 'step_ice', 'step_wood', 'step_road'],
  sword: [
    'sword_whoosh', 'sword_whoosh_heavy', 'hit_flesh', 'hit_straw', 'hit_ice', 'parry', 'block',
    'sword_draw', 'sword_sheathe', 'dodge', 'roll', 'body_fall',
  ],
  signs: ['sign_ember', 'sign_gale', 'sign_ward', 'ward_hit', 'senses_on', 'senses_off'],
  vesna: ['vesna_hurt', 'vesna_effort', 'vesna_death'],
  wolves: ['wolf_growl', 'wolf_howl', 'wolf_bite', 'wolf_yelp', 'bear_roar', 'bear_huff', 'paw_snow'],
  effigy: ['effigy_creak', 'effigy_burn', 'effigy_collapse'],
  ice: ['ice_crack', 'ice_groan', 'ice_ping', 'ice_spike', 'bell_under_ice', 'boss_scream', 'splash'],
  horse: ['horse_whinny', 'horse_snort', 'hoof_walk', 'hoof_trot', 'hoof_gallop', 'whistle'],
  world: [
    'door', 'door_close', 'page_turn', 'coin', 'item_pickup', 'potion_drink', 'forge_hammer',
    'axe_chop', 'snowball_hit', 'heartbeat', 'ignite', 'gust',
  ],
  creatures: ['dog_bark', 'crow', 'raven', 'chicken', 'goat', 'child_laugh', 'owl', 'bird'],
  ui: ['ui_select', 'ui_hover', 'ui_open', 'ui_close'],
};

export const SFX_NAMES = Object.values(SFX_GROUPS).flat();

// Looping sounds for G.audio.loop(name, { pos, volume }). Positional loops only run while the
// listener is within earshot, so it is fine to create one per fire in the world at load.
export const LOOP_NAMES = [
  'fire_crackle', // hearths, campfires, braziers
  'torch', // carried torches (procession)
  'effigy_fire', // a burning effigy or big bonfire
  'senses_hum', // while hunter senses are held (no pos)
  'heartbeat', // low health or a cutscene beat (no pos)
  'water_flow', // open water after the thaw, the river
  'crowd_murmur', // a gathered crowd or the tavern interior
];
