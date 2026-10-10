// SFX and loop recipe registry.
import { FOLEY } from './foley.js';
import { COMBAT } from './combat.js';
import { CREATURES } from './creatures.js';
import { WORLD, LOOPS } from './world.js';
import { DICE } from './dice.js';

export const RECIPES = { ...FOLEY, ...COMBAT, ...CREATURES, ...WORLD, ...DICE };
export { LOOPS };
