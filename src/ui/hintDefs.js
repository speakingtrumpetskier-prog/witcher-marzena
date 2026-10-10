// The first-use hints: what each one says, when it becomes relevant, and what counts as the player
// having done it. The machinery (queue, card, persistence) is in hints.js.
//
// A hint is { id, prio, delay, seconds, side, scene, fishing, until, rows, watch }:
//   prio      lower shows first when several are ready
//   watch(c)  true while the hint is relevant. It must stay true for `delay` seconds (default 0.8) to appear
//   rows      what the card lists. A row is { action, text, hold } for a binding, or { kind: 'move' | 'look', text }.
//             `pad` / `kbm` override fields for one device (pad: null hides the row there); `when(c)` decides at
//             show time whether the row is needed; `done` is an event name or a function(c) saying it was done
//             (default: the action was pressed, or held for `hold` rows)
//   scene     shown during a skippable cutscene instead of free play (the skip hint)
//   fishing   shown while sitting at a fishing hole (c.fishing is G.fishing); until(c) closes the card early
// c is the context built in hints.js: c.G, c.P, c.live (seconds of uninterrupted play), c.walked and c.rode
// (metres), c.inCombat, c.enemies(r), c.since(event), c.down(a), c.pressed(a), c.sprinted ...
// Text is plain and short. The card never says what the prompt on screen already says twice.
import { LOC } from '../world/layout.js';
import { diceNumbers } from './glyphs.js';

// Events the hint system listens to. 'ui:open' also fires as 'ui:open:<name>'.
export const EVENTS = [
  'combat:start', 'player:hit', 'player:dodge', 'player:parry', 'player:block', 'player:cast', 'player:draw',
  'player:drink', 'player:lock', 'camera:retarget', 'horse:call', 'horse:mount', 'horse:dismount',
  'interact:use', 'senses:on', 'ui:open:journal', 'ui:open:map', 'ui:open:pause', 'photo:enter',
  'dice:pick', 'dice:roll', 'dice:raise',
];

const near = (c, x, z, r) => c.P && Math.hypot(c.P.position.x - x, c.P.position.z - z) < r;
// The Move card goes first on a new profile; hints about things nearby wait for it.
const settled = (c) => c.seen('move') || c.walked >= 2 || c.rode > 0;

function signHint(sign, selectAction, pickText, castText, prio, watch) {
  const cast = { action: 'sign', done: (c) => c.fired('player:cast', (p) => p?.sign === sign) };
  return {
    id: sign, prio, delay: 1, seconds: 12, watch,
    rows: [
      { action: selectAction, text: pickText, when: (c) => c.P.sign !== sign },
      { ...cast, text: 'Cast the sign', when: (c) => c.P.sign !== sign },
      { ...cast, text: castText, when: (c) => c.P.sign === sign },
    ],
  };
}

export const HINTS = [
  {
    id: 'move', prio: 1, delay: 3, seconds: 16,
    rows: [{ kind: 'move', text: 'Move' }, { kind: 'look', text: 'Look around' }],
    watch: (c) => c.live > 3 && c.walked < 2 && !c.rode,
  },
  {
    id: 'skip', prio: 1, delay: 4, seconds: 8, side: 'right', scene: true,
    rows: [{ action: 'skip', hold: true, text: 'Skip the scene', done: (c) => c.down('skip') }],
    watch: (c) => c.skippable,
  },
  {
    id: 'interact', prio: 2, delay: 1.2, seconds: 9,
    rows: [{ action: 'interact', text: 'Talk, read or open', done: 'interact:use' }],
    watch: (c) => !!c.G.interact?.current && c.live > 2 && settled(c),
  },
  {
    id: 'senses', prio: 2, delay: 4, seconds: 11, // the story teaches it first at the cart (G.ui.hint); this covers the other clues
    rows: [{ action: 'senses', hold: true, text: 'Hunter senses', done: 'senses:on' }],
    watch: (c) => {
      const S = c.G.senses;
      if (!S || S.active || c.P?.swordDrawn || !settled(c)) return false;
      for (const cl of S.clues.values()) {
        if (cl.examined || (cl.enabled && !cl.enabled())) continue;
        if (c.P && Math.hypot(cl.pos.x - c.P.position.x, cl.pos.z - c.P.position.z) < 14) return true;
      }
      return false;
    },
  },
  {
    id: 'sprint', prio: 3, delay: 1, seconds: 9,
    rows: [{ action: 'sprint', hold: true, text: 'Sprint' }],
    watch: (c) => c.walked > 30 && !c.mounted && !c.sprinted && c.live > 8,
  },
  {
    id: 'potion', prio: 3, delay: 1, seconds: 10,
    rows: [{ action: 'potion', text: 'Drink a Thaw draught', done: 'player:drink' }],
    watch: (c) => !!c.P && !c.P.dead && (c.P.health < c.P.maxHealth * 0.5 || c.P.warmth < 0.28) && c.G.state?.count?.('thaw') > 0,
  },
  {
    id: 'draw', prio: 3, delay: 0.6, seconds: 9,
    rows: [{ action: 'draw', text: 'Draw your sword', done: 'player:draw', pad: { action: 'attack', text: 'Attack to draw your sword' } }],
    watch: (c) => c.inCombat && !c.P.swordDrawn && c.since('combat:start') < 20,
  },
  {
    id: 'attack', prio: 3, delay: 0.8, seconds: 14,
    rows: [{ action: 'attack', text: 'Light attack' }, { action: 'heavy', text: 'Heavy attack' }],
    watch: (c) => c.inCombat && c.P.swordDrawn && c.since('combat:start') > 0.6,
  },
  {
    id: 'journal', prio: 4, delay: 3, seconds: 10,
    rows: [{ action: 'journal', text: 'Open the journal', done: 'ui:open:journal', pad: { action: 'pause', text: 'Pause menu, then Journal' } }],
    watch: (c) => Object.keys(c.G.state?.data?.quests || {}).length > 0 && c.live > 10 && !c.inCombat,
  },
  {
    id: 'lock', prio: 4, delay: 0.8, seconds: 10,
    rows: [{ action: 'lock', text: 'Lock on to a target', done: (c) => c.fired('player:lock', (p) => !!p?.target) }],
    watch: (c) => c.inCombat && !c.P.target && c.enemies(14).length > 0 && c.since('combat:start') > 1.5,
  },
  {
    id: 'dodge', prio: 4, delay: 0.5, seconds: 10,
    rows: [{ action: 'dodge', text: 'Dodge, tap twice to roll', done: 'player:dodge' }],
    watch: (c) => c.inCombat && (c.since('player:hit') < 8 || c.since('combat:start') > 8),
  },
  {
    id: 'mount', prio: 4, delay: 1.2, seconds: 9,
    rows: [{ action: 'horse', text: 'Mount Kasza', done: 'horse:mount' }],
    watch: (c) => !!c.G.horse && !c.mounted && c.G.horse.state === 'idle' && near(c, c.G.horse.position.x, c.G.horse.position.z, 3.4) && c.live > 2,
  },
  {
    id: 'map', prio: 5, delay: 6, seconds: 10,
    rows: [{ action: 'map', text: 'Open the map', done: 'ui:open:map' }],
    watch: (c) => (c.G.state?.data?.discovered?.length || 0) > 0 && c.live > 45 && !c.inCombat,
  },
  {
    id: 'switch', prio: 5, delay: 1, seconds: 9,
    rows: [{ kind: 'look', text: 'Flick sideways to switch target', done: 'camera:retarget' }],
    watch: (c) => !!c.P?.target && c.enemies(26).length > 1,
  },
  {
    id: 'sign', prio: 5, delay: 2, seconds: 10,
    rows: [{ action: 'sign', text: 'Cast a sign', done: 'player:cast' }],
    watch: (c) => c.inCombat && c.P.signEnergy > 0.5 && c.since('combat:start') > 4,
  },
  // One hint per sign. If the sign is not the one in hand the card says how to pick it, then how to cast.
  signHint('ember', 'sign1', 'Ember sets straw alight', 'Cast Ember to set straw alight', 5,
    (c) => c.enemies(24).some((e) => e.kind === 'effigy') && c.P.signEnergy > 0.3),
  signHint('gale', 'sign2', 'Gale knocks enemies back', 'Cast Gale to knock enemies back', 6,
    (c) => c.enemies(11).length >= 3 && c.P.signEnergy > 0.3),
  signHint('ward', 'sign3', 'Ward stops the next blow', 'Cast Ward to stop the next blow', 6,
    (c) => c.inCombat && c.P.health < c.P.maxHealth * 0.55 && c.P.signEnergy > 0.34),
  {
    id: 'parry', prio: 6, delay: 1, seconds: 11,
    rows: [{ action: 'parry', hold: true, text: 'Parry, hold to block', done: (c) => c.down('parry') || c.fired('player:parry') || c.fired('player:block') }],
    watch: (c) => c.inCombat && c.P.swordDrawn && c.seen('dodge') && c.since('combat:start') > 14,
  },
  {
    id: 'whistle', prio: 6, delay: 2, seconds: 10,
    rows: [{ action: 'horse', text: 'Whistle for Kasza', done: 'horse:call' }],
    watch: (c) => !!c.G.horse && !c.mounted && c.G.horse.state === 'idle' && c.walked > 80 && !near(c, c.G.horse.position.x, c.G.horse.position.z, 45) && c.live > 6,
  },
  {
    id: 'gallop', prio: 5, delay: 2, seconds: 9,
    rows: [{ action: 'sprint', hold: true, text: 'Gallop', done: (c) => (c.G.horse?.speed ?? 0) > 7 }],
    watch: (c) => c.mounted && (c.G.horse?.speed ?? 0) > 3.4 && c.rode > 25 && !c.galloped,
  },
  {
    id: 'dismount', prio: 5, delay: 2.5, seconds: 9,
    rows: [{ action: 'horse', text: 'Dismount', done: 'horse:dismount' }],
    watch: (c) => c.mounted && c.rode > 40 && (c.G.horse?.speed ?? 0) < 1.2,
  },
  {
    id: 'walk', prio: 7, delay: 2, seconds: 9,
    rows: [{ action: 'walk', text: 'Walk, press to toggle', pad: { kind: 'move', text: 'Tilt the stick gently to walk' } }],
    watch: (c) => c.seen('sprint') && !c.mounted && near(c, LOC.village.x, LOC.village.z, LOC.village.r) && c.walked > 60,
  },
  // Sitting at a fishing hole (fishing: true cards show only then, see hints.js _fishing). `until` closes a card early.
  {
    id: 'fish_line', prio: 2, delay: 0.5, seconds: 16, fishing: true,
    rows: [
      { action: 'fishSlack', hold: true, text: 'Let the line down' },
      { action: 'fishJig', text: 'Jig it. Strike when the tip twitches' },
    ],
    watch: (c) => c.fishing?.phase === 'fish',
    until: (c) => c.fishing?.phase === 'fight',
  },
  {
    id: 'fish_fight', prio: 1, delay: 0.1, seconds: 15, fishing: true,
    rows: [
      { action: 'fishReel', hold: true, text: 'Reel while it rests' },
      { action: 'fishSlack', hold: true, text: 'Let line out when it runs' },
    ],
    watch: (c) => c.fishing?.phase === 'fight',
    until: (c) => c.fishing?.phase !== 'fight',
  },
  {
    id: 'fish_stand', prio: 3, delay: 1.5, seconds: 9, fishing: true,
    rows: [{ action: 'fishLeave', text: 'Stand up when you are done' }],
    watch: (c) => c.fishing?.phase === 'fish' && c.fishing.catches > 0,
  },
  {
    id: 'pause', prio: 8, delay: 3, seconds: 10,
    rows: [{ action: 'pause', text: 'Pause menu: save, settings, controls', done: 'ui:open:pause' }],
    watch: (c) => c.play > 300 && !c.inCombat,
  },
  {
    id: 'photo', prio: 9, delay: 4, seconds: 9,
    rows: [{ action: 'photo', text: 'Photo mode', done: 'photo:enter', pad: { action: 'pause', text: 'Pause menu, then Photo mode' } }],
    watch: (c) => c.play > 720 && c.live > 20 && !c.inCombat && c.seen('pause'),
  },
  // The tavern dice game (src/minigames/dice/ui.js) shows these itself, with G.hints.show(id, { force: true }), the first
  // time dice can be picked and the first time a raise is possible, and emits the dice:* events the rows wait for.
  {
    id: 'dice_pick', prio: 9, delay: 999, seconds: 14, watch: () => false, // never ready by itself: the dice game shows it
    rows: [
      {
        action: 'dice_pick', text: 'Pick the dice to roll again', done: 'dice:pick',
        kbm: { glyph: (G) => diceNumbers(G, 'kbm') }, pad: { glyph: (G) => diceNumbers(G, 'pad') },
      },
      { action: 'dice_roll', text: 'Roll them', done: 'dice:roll' },
    ],
  },
  {
    id: 'dice_raise', prio: 9, delay: 999, seconds: 12, watch: () => false,
    rows: [{ action: 'dice_raise', text: 'Raise the stake, or keep it', done: 'dice:raise' }],
  },
];

export const HINT_IDS = HINTS.map((h) => h.id);
