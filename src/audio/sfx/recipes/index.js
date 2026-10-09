// SFX and loop recipe registry.
import { FOLEY } from './foley.js';
import { COMBAT } from './combat.js';
import { CREATURES } from './creatures.js';
import { WORLD, LOOPS } from './world.js';

export const RECIPES = { ...FOLEY, ...COMBAT, ...CREATURES, ...WORLD };
export { LOOPS };
