// SFX and loop recipe registry.
import { FOLEY } from './foley.js';
import { COMBAT } from './combat.js';
import { CREATURES } from './creatures.js';
import { WORLD, LOOPS as WORLD_LOOPS } from './world.js';
import { DICE } from './dice.js';
import { FISHING, FISHING_LOOPS } from './fishing.js';

export const RECIPES = { ...FOLEY, ...COMBAT, ...CREATURES, ...WORLD, ...DICE, ...FISHING };
export const LOOPS = { ...WORLD_LOOPS, ...FISHING_LOOPS };
