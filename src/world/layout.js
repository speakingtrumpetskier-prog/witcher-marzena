// CANONICAL WORLD LAYOUT. Every builder places content relative to these numbers.
// Units: meters. +X east, -Z north, +Y up. Ice surface of the lake is y = 0.
// Changing a location here moves it everywhere (terrain shaping, vegetation exclusion, map,
// quests). Coordinate with the designer (docs/DESIGN.md) before changing.

export const WORLD = {
  playable: 620, // soft boundary half-size; beyond this the player is turned back
  gridHalf: 800, // cached height grid covers [-800, 800]
  farHalf: 4200, // far terrain (mountain horizon) extent
  iceLevel: 0,
};

// The lake: an irregular ellipse. Shoreline radius is perturbed by noise in heightfield.js.
export const LAKE = { x: 40, z: -120, rx: 270, rz: 170, bed: -4 };

// Points of interest. `r` is the footprint radius used for terrain flattening and
// vegetation exclusion. `y` is a design hint, actual height comes from the heightfield.
export const LOC = {
  village: { name: 'Marzena', x: 0, z: 115, r: 100, map: true },
  square: { name: 'Village Square', x: 0, z: 118, r: 16 },
  longhouse: { name: "Reeve's Longhouse", x: 5, z: 90, r: 14 },
  tavern: { name: 'The Drowned Bell', x: -34, z: 104, r: 11 },
  smithy: { name: 'Smithy', x: 33, z: 128, r: 9 },
  shrine: { name: 'Shrine', x: -5, z: 168, r: 12 },
  dobra: { name: "Dobra's Workshop", x: -74, z: 152, r: 12 },
  hanka: { name: "Hanka's House", x: 80, z: 70, r: 9 },
  banya: { name: 'Bathhouse', x: -50, z: 72, r: 7 },
  westGate: { name: 'West Gate', x: -88, z: 128, r: 6 },
  fishingHuts: { name: 'Fishing Huts', x: -15, z: 54, r: 70 },
  iceCamp: { name: 'Ice-fishing Camp', x: -70, z: 5, r: 14, map: true },
  ritual: { name: 'Ritual Site', x: 10, z: -30, r: 16, map: true },
  bellTower: { name: 'The Drowned Bell Tower', x: 120, z: -150, r: 10, map: true },
  island: { name: 'Stone Circle Isle', x: -120, z: -190, r: 28, map: true },
  marsh: { name: 'Reed Marsh', x: -262, z: -80, r: 45, map: true },
  hotSpring: { name: 'Hot Spring', x: -90, z: -342, r: 18, map: true },
  bearDen: { name: 'Bear Den', x: 150, z: -362, r: 12, map: true },
  hunterCabin: { name: "Trapper's Cabin", x: -400, z: -200, r: 12, map: true },
  charcoal: { name: "Charcoal Burners' Camp", x: -330, z: 20, r: 16, map: true },
  crossroads: { name: 'Crossroads', x: -230, z: 230, r: 12, map: true },
  watchtower: { name: 'Watchtower Ruin', x: -360, z: 340, r: 12, map: true },
  passStart: { name: 'Hollow Pass', x: -560, z: 520, r: 14, map: true },
  idol: { name: 'Idol Hill', x: 200, z: 230, r: 14, map: true },
  graveyard: { name: 'Graveyard', x: 95, z: 166, r: 16, map: true },
  sledHill: { name: 'Sledding Hill', x: -40, z: 208, r: 14 },
  mill: { name: 'Frozen Mill', x: 362, z: -58, r: 14, map: true },
  waterfall: { name: 'Frozen Falls', x: 446, z: -82, r: 16, map: true },
};

// Where the roadside encounters (src/story/controller/roadside) put people and things, for the village and
// approach dressing to keep clear of: [x, z, radius]. The encounters own the exact positions; keep these in step.
export const ENCOUNTER_SPOTS = [
  [-249, 243, 7], // the tinker's sledge on the pass road, the runner scrap left after
  [-19.5, 113.5, 2.6], // the tinker's morning spot by the stalls
  [-158.7, 168.2, 3.2], // the old woman at the milk shrine
  [-107, 133, 4.5], // Zofia at the west gate, and her goat on its rope after
];

// Roads as polylines of [x, z]. Width in meters (packed snow and ruts).
export const ROADS = [
  {
    id: 'pass', width: 5,
    pts: [[-620, 585], [-560, 520], [-500, 470], [-440, 410], [-385, 360], [-340, 322], [-300, 292],
      [-262, 258], [-230, 230], [-185, 196], [-140, 165], [-110, 140], [-88, 128], [-55, 122], [-20, 118], [0, 118]],
  },
  {
    id: 'forest', width: 3.5,
    pts: [[-230, 230], [-262, 170], [-290, 110], [-318, 50], [-330, 20], [-350, -40], [-372, -110], [-392, -170], [-400, -200]],
  },
  {
    id: 'mill', width: 4,
    pts: [[0, 118], [30, 116], [62, 108], [100, 100], [140, 92], [185, 74], [230, 48], [272, 18], [310, -12], [340, -40], [362, -58]],
  },
  {
    id: 'idol', width: 2.5,
    pts: [[62, 108], [80, 130], [95, 152], [118, 176], [145, 196], [172, 214], [200, 230]],
  },
  {
    id: 'shore', width: 2.5,
    pts: [[-95, 70], [-60, 66], [-25, 62], [10, 60], [45, 64], [80, 70]],
  },
  {
    id: 'village_north', width: 3,
    pts: [[0, 118], [-9, 104], [-15, 86], [-16, 66]],
  },
  {
    id: 'village_south', width: 2.5,
    pts: [[0, 118], [-3, 140], [-5, 160]],
  },
  {
    id: 'village_west', width: 2.5,
    pts: [[-55, 122], [-66, 138], [-74, 150]],
  },
];

// Walkable ice paths are implicit: the whole lake is walkable ice.

// The river: from the east mountains, over the falls, past the mill, into the lake.
// Each point is [x, z, bedHeight]. The falls drop between the 3rd and 4th points.
export const RIVER = {
  width: 12,
  pts: [[640, -66, 62], [520, -76, 44], [452, -82, 36], [440, -82, 9], [400, -72, 6], [362, -66, 3], [325, -78, 0.5], [300, -84, -1]],
};

// Spots where the designer wants a guaranteed flat pad (buildings or set pieces) and a target
// height offset relative to the surrounding natural terrain blend.
export const FLAT_PADS = [
  { x: 0, z: 115, r: 100, blend: 30 }, // village plateau
  { x: -360, z: 340, r: 14, blend: 12 }, // watchtower
  { x: -560, z: 520, r: 18, blend: 14 }, // prologue cart
  { x: -230, z: 230, r: 14, blend: 10 }, // crossroads
  { x: -330, z: 20, r: 18, blend: 12 }, // charcoal camp
  { x: -400, z: -200, r: 14, blend: 10 }, // trapper cabin
  { x: 362, z: -58, r: 16, blend: 10 }, // mill
  { x: 95, z: 166, r: 18, blend: 12 }, // graveyard
  { x: -90, z: -342, r: 20, blend: 12 }, // hot spring
];

// Story-relevant spawn points (player start, horse, set-piece cameras use their own).
export const SPAWN = {
  prologue: { x: -548, z: 510, yaw: 2.4 },
  villageGate: { x: -95, z: 130, yaw: -1.4 },
  square: { x: 4, z: 124, yaw: 3.14 },
};

// Distance to the nearest road. Returns { d, road, x, z } or null.
import { nearestOnPolyline } from '../core/util.js';
export function nearestRoad(x, z) {
  let best = null;
  for (const r of ROADS) {
    const n = nearestOnPolyline(x, z, r.pts);
    if (!best || n.d - r.width * 0.5 < best.d - best.road.width * 0.5) best = { ...n, road: r };
  }
  return best;
}

// Rough XZ ellipse test for the lake (without shoreline noise). Values < 1 are inside.
export function lakeEllipse(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  return Math.sqrt(dx * dx + dz * dz);
}
