// Architecture kit catalog. Pure builders: each returns { group, colliders, doors, anchors,
// lights, interior, walk, objects, footprint, stats } at the origin. Use place.js to put one
// in the world. See docs/ARCHITECTURE.md "Architecture kit".
import { logHouse } from './buildings/logHouse.js';

export const buildings = {
  logHouse,
};

export { placeBuilding } from './place.js';
