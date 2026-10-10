// Kosci in the story (the game itself is src/minigames/dice). This file is the part the world sees: who starts a match,
// the chalked rules, and what winning does to the side quest "Dice at the Drowned Bell".
//
//   await C.dice.play('zbyszek' | 'wojtek' | 'halina')   -> the result of the match (game.js) or { played: false, reason }
//   C.dice.test                                          options added to every match by a test: { seed, speed, drive }
//
// Who starts it: the talk with each of the three ends at the dialogue node 'dice_go' (zbyszek_hub, dice_wojtek, dice_halina),
// and npcs.js calls C.dice.play for it. The match module loads the first time it is needed (it is bigger than the
// rest of the controller's tavern put together and nobody needs it at boot).
//
// Flags: dice_known (somebody explained the game; starts the quest), dice_met_wojtek, dice_met_halina, dice_zbyszek_met,
// dice_beat_<id> (a whole match won, set by the game), dice_all_beaten (all three), dice_bone_set (Zbyszek gave her the
// bone dice; her dice are bone with red pips from then on).
// Quest: side_dice, "Dice at the Drowned Bell" (quests.js): beat the three, then tell Zbyszek.
// Notes: note_dice_rules (read at the tavern, or the first time she sits down), item_bone_dice.
import { OPPONENTS } from '../../minigames/dice/opponents.js';

const IDS = ['zbyszek', 'wojtek', 'halina'];

export function install(C) {
  const { G, S } = C;
  let loading = null;
  const load = () => (loading ||= import('../../minigames/dice/index.js').then((m) => m.init(G)).catch((e) => {
    console.error('[story controller] dice', e);
    G.errors.push(`ctl dice: ${e.message}`);
    loading = null;
    return null;
  }));

  C.dice = {
    test: null,
    load,
    async play(id) {
      const dice = await load();
      if (!dice || !OPPONENTS[id]) return { played: false, reason: 'no_table' };
      const can = dice.canPlay(id);
      if (!can.ok) {
        // The talk already turned her away with a line where it could; this is what is left (a debug call, a race).
        if (can.reason === 'opp_short') C.bark(id, OPPONENTS[id].lines.broke[0]);
        return { played: false, reason: can.reason };
      }
      // The rules are chalked up in the tavern; the first time she sits down she has read them.
      if (!S.data.notes.includes('note_dice_rules')) S.readNote('note_dice_rules');
      const res = await dice.play(id, { ...(C.dice.test || {}) });
      return res;
    },
  };

  // The game is ready by the time anybody asks (idle, after the world is up).
  C.on('game:ready', () => setTimeout(load, 2500));

  // ---- the book ---------------------------------------------------------------------------------------------------
  const start = () => { if (!G.quests.rec('side_dice')) G.quests.start('side_dice'); };
  C.watch('dice_known', (v) => { if (v) start(); });
  for (const id of IDS) {
    C.watch(`dice_beat_${id}`, () => {
      start();
      if (IDS.every((o) => C.has(`dice_beat_${o}`))) C.set('dice_all_beaten');
    });
  }
  C.watch('dice_bone_set', (v) => {
    if (!v) return;
    C.notify('Bone dice', 'item');
    C.sfx('item_pickup', { volume: 0.6 });
    S.readNote('item_bone_dice');
  });

  // ---- the rules, chalked on the beam over the bar ------------------------------------------------------------------
  const tavern = G.world?.locations?.village?.buildings?.tavern?.p;
  if (tavern) {
    const at = tavern.localToWorld(-0.9, 1.7, -3.2);
    C.interact({
      id: 'dice_rules', pos: at, radius: 2.4, facing: false, verb: 'Read', label: 'The rules of Kosci',
      onUse: async () => { await C.read('note_dice_rules'); },
    });
  }
}
