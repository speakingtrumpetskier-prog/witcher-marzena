// Story controller (owner: story controller builder). Wires the finished systems into the story of
// MARZENA: triggers and zones, interactions and clues, NPC conversations, quest advancement, the
// boss fight and the decisive choice, the three endings, the epilogue and the credits, the snow fight,
// and the small reactions of the world. Content (dialogues, cutscenes) is loaded by id; where a file is
// not written yet a short placeholder runs and sets the same flags (stubs.js).
//
//   import('./controller/index.js').then((m) => m.init(G))    called once from src/story/index.js
//   G.storyCtl           the shared context (context.js): flags, zones, interactions, C.scene, C.talk, C.rest,
//                        C.buy, C.snowfight, C.finale, C.dice
//
// Files by area:  context.js (toolbox)  scenes.js stubs.js (scenes with placeholders and end-state guarantees)
//   act1.js (pass, wolves, valley, village arrival, notice board)   act2.js (night, ice, echo, tower, belfry, dawn)
//   npcs.js (what each person says and what it owes the quests)    side.js (bird, ledger, wisps, wolves, bear, island)
//   clues.js (nooks and readable things)   world.js (rest, weather, gear, doors, ambient)
//   snowfight.js   finale.js (rite, boss, choice, endings, credits)   dice.js (Kosci in the tavern: who plays, the quest)
//   roadside/ (small encounters on the roads: tinker, wolves at a kill, goat, scarf, sled, poacher, fishermen)
// Flags and quests: docs/STORY.md sections 1 and 2; quest definitions in src/story/content/quests.js.
import { createContext } from './context.js';
import * as scenes from './scenes.js';
import * as npcs from './npcs.js';
import * as act1 from './act1.js';
import * as act2 from './act2.js';
import * as side from './side.js';
import * as clues from './clues.js';
import * as world from './world.js';
import * as snowfight from './snowfight.js';
import * as finale from './finale.js';
import * as dice from './dice.js';
import * as roadside from './roadside/index.js';

const MODULES = [
  ['scenes', scenes], ['npcs', npcs], ['act1', act1], ['act2', act2], ['side', side],
  ['clues', clues], ['world', world], ['snowfight', snowfight], ['finale', finale], ['dice', dice],
  ['roadside', roadside],
];

export async function init(G) {
  if (G.storyCtl) return G.storyCtl;
  if (!G.story || !G.state || !G.world) return null;
  const C = createContext(G);
  G.storyCtl = C;
  C.installed = [];
  for (const [name, mod] of MODULES) {
    try {
      await mod.install(C);
      C.installed.push(name);
    } catch (e) {
      console.error(`[story controller] ${name}`, e);
      G.errors.push(`story controller ${name}: ${e.message}`);
    }
  }
  // Props that state changed (an opened hatch, a bird on the table) are put back after a load or a reset.
  G.events.on('loaded', () => C.runRestorers());
  G.events.on('reset', () => C.runRestorers());
  return C;
}
