// Architecture kit catalog. Pure builders: each returns
//   { group, colliders, doors, anchors, lights, interior, walk, objects, footprint, skirtExclude, stats }
// at the origin. Use placeBuilding (place.js) to put one into the world.
//
//   import { buildings, placeBuilding } from '../world/architecture/index.js';
//   const b = buildings.logHouse({ seed: 12, size: 'medium', floors: 1, porch: true, gallery: false, woodshed: true });
//   const p = placeBuilding(G, b, x, z, yaw, { foundation: true, skirt: true });
//   p.doors[i] -> { x, z, y, yaw, w, h, kind: 'leaf' | 'closed' | 'open', pivot?, setOpen?(0..1), id }  (world space)
//   p.anchors.smoke / chimney / door / hearth / ... (THREE.Vector3, world space)
//   p.lights -> [{ x, y, z, color, intensity, radius, kind: 'window'|'lantern'|'hearth'|'forge'|'fire'|'candle'|'ghost', dir? }]
//   p.walk -> { floors: [{ y, polygon: [[x, z], ...], holes?, tag }], ramps: [{ a: [x,y,z], b: [x,y,z], width, tag }] }
//   p.dispose()
//
// Catalog (all take { seed, ...options }):
//   houses      logHouse (size small|medium|large, floors, porch, gallery, woodshed), longhouse (cellar), longhouseInterior,
//               tavern (enterable), hankaHouse (enterable), workshop (enterable), smithy, banya (enterable), granary,
//               barn, stable, shed, outhouse, boathouse, fishingHut, mill (objects.waterwheel), trapperCabin
//   landmarks   bellTower (walkable, objects.seats), idol, watchtowerRuin (climbable), stoneCircle, shrine
//   small       well, noticeBoard, marketStall, waysideShrine, gravePost (variant plain|wiesia|son), charcoalKiln, ruinedBathhouse
//   linear      fence({ points, style: 'wattle'|'rail', heightAt }), palisade({ points, heightAt }), boardwalk({ points, heightAt, rails }),
//               gate({ width }) with leaf doors, bridge({ length, width, rise })
import { logHouse } from './buildings/logHouse.js';
import { tavern } from './buildings/tavern.js';
import { longhouse, longhouseInterior } from './buildings/longhouse.js';
import { granary, barn, stable, shed, outhouse, boathouse, banya, workshop } from './buildings/farm.js';
import { smithy } from './buildings/smithy.js';
import { idol } from './buildings/idol.js';
import { bellTower } from './buildings/bellTower.js';
import { hankaHouse } from './buildings/hanka.js';
import { fishingHut, mill } from './buildings/water.js';
import { watchtowerRuin, trapperCabin, ruinedBathhouse, charcoalKiln } from './buildings/ruins.js';
import { shrine, waysideShrine, gravePost, stoneCircle } from './buildings/ritual.js';
import { well, noticeBoard, marketStall, fence, palisade, gate, boardwalk, bridge } from './buildings/village.js';

export const buildings = {
  logHouse,
  tavern,
  longhouse,
  longhouseInterior,
  granary, barn, stable, shed, outhouse, boathouse, banya, workshop,
  smithy,
  idol,
  bellTower,
  hankaHouse,
  fishingHut, mill,
  watchtowerRuin, trapperCabin, ruinedBathhouse, charcoalKiln,
  shrine, waysideShrine, gravePost, stoneCircle,
  well, noticeBoard, marketStall, fence, palisade, gate, boardwalk, bridge,
};

export { placeBuilding } from './place.js';
