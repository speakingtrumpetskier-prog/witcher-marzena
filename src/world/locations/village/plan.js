// Village plan: every position, yaw and variant in one place. Coordinates are meters (layout.js),
// yaw is the direction the front faces (0 south, PI north, PI/2 east, -PI/2 west).
// docs/VILLAGE.md gives the targets; the entries below are those targets nudged where the real
// terrain, roads or neighbors needed it (each nudge is noted).
import { PAL } from '../../architecture/kit.js';

const PI = Math.PI;

// Hero buildings.
export const HEROES = {
  longhouse: { x: 5, z: 90, yaw: 0, seed: 9 },
  tavern: { x: -34, z: 104, yaw: 0, seed: 5 },
  smithy: { x: 33, z: 128, yaw: PI, seed: 21 },
  // The ring's entrance gap faces the village (north) so the south lane runs into it.
  shrine: { x: -5, z: 168, yaw: PI, seed: 41 },
  // Moved 6 m west so the west lane ends at the open barn mouth, with the yard in front.
  workshop: { x: -81, z: 153, yaw: PI / 2, seed: 17 },
  // On the shore: the kit puts the milk bowls behind the house, on the ice side.
  hanka: { x: 80, z: 57.5, yaw: 0, seed: 61 },
  banya: { x: -50, z: 74, yaw: PI, seed: 15 },
};

// Log houses. `o` goes to buildings.logHouse. Neighbors differ in size, floors, porch, shutter colour,
// gable style and roof paint; seeds differ so logs lean differently.
const B = PAL.blueFaded, R = PAL.red, O = PAL.ochre;
export const HOUSES = [
  // north of the main street (face south to it)
  { id: 'n1', x: -60, z: 100, yaw: 0, o: { size: 'medium', porch: true, shutters: 'blue', paint: R, seed: 101 } },
  { id: 'n2', x: -46, z: 86, yaw: 0.3, o: { size: 'small', woodshed: true, shutters: 'red', paint: B, seed: 102, gable: 'logs' } },
  { id: 'n3', x: -77, z: 84, yaw: -0.2, o: { size: 'large', floors: 2, gallery: true, shutters: 'blue', paint: O, seed: 103 } },
  { id: 'n4', x: 26, z: 99, yaw: 0, o: { size: 'medium', porch: true, shutters: 'red', paint: B, seed: 104, w: 7.0 } },
  { id: 'n5', x: 46, z: 92, yaw: -0.15, o: { size: 'small', shutters: 'blue', paint: O, seed: 105 } },
  { id: 'n6', x: 31, z: 75, yaw: 0.1, o: { size: 'medium', woodshed: true, woodshedSide: 'right', shutters: 'ochre', paint: R, seed: 106, gable: 'logs' } },
  { id: 'n7', x: -30, z: 80, yaw: 0.2, o: { size: 'large', floors: 2, shutters: 'blue', paint: B, seed: 107, porch: true } },
  { id: 'n8', x: -80, z: 97, yaw: 0.12, o: { size: 'small', woodshed: true, woodshedSide: 'left', shutters: 'ochre', paint: B, seed: 108 } },
  { id: 'n9', x: 62, z: 90, yaw: -0.35, o: { size: 'small', porch: true, shutters: 'red', paint: O, seed: 109, d: 5.0 } },
  { id: 'n10', x: 13, z: 72, yaw: -0.1, o: { size: 'small', shutters: 'blue', paint: R, seed: 110, w: 5.6 } },
  { id: 'n11', x: -21, z: 94, yaw: 0.25, o: { size: 'small', shutters: 'ochre', paint: O, seed: 124 } },
  // south of the main street (face north to it)
  { id: 's1', x: -40, z: 141, yaw: PI, o: { size: 'medium', porch: true, shutters: 'blue', paint: B, seed: 111 } },
  { id: 's2', x: -22, z: 146, yaw: PI, o: { size: 'small', shutters: 'red', paint: O, seed: 112, gable: 'logs' } },
  { id: 's3', x: 18, z: 146, yaw: PI + 0.1, o: { size: 'large', floors: 2, gallery: true, shutters: 'blue', paint: R, seed: 113 } },
  { id: 's4', x: 47, z: 142, yaw: PI - 0.12, o: { size: 'medium', woodshed: true, woodshedSide: 'left', shutters: 'red', paint: B, seed: 114 } },
  { id: 's5', x: 62, z: 124, yaw: -PI / 2, o: { size: 'small', porch: true, shutters: 'ochre', paint: R, seed: 115 } },
  { id: 's6', x: -56, z: 166, yaw: PI / 2, o: { size: 'medium', shutters: 'blue', paint: O, seed: 116, floors: 2 } },
  { id: 's7', x: 22, z: 170, yaw: PI, o: { size: 'small', woodshed: true, woodshedSide: 'right', shutters: 'red', paint: B, seed: 117 } },
  { id: 's8', x: 66, z: 154, yaw: PI + 0.2, o: { size: 'medium', porch: true, shutters: 'blue', paint: R, seed: 118, gable: 'logs' } },
  { id: 's9', x: -91, z: 106, yaw: PI / 2, o: { size: 'small', shutters: 'blue', paint: B, seed: 119 } },
  { id: 's10', x: -26, z: 170, yaw: PI - 0.2, o: { size: 'medium', shutters: 'ochre', paint: B, seed: 120, porch: true } },
  { id: 's11', x: 40, z: 172, yaw: PI + 0.35, o: { size: 'small', shutters: 'blue', paint: O, seed: 121 } },
  { id: 's12', x: -77, z: 135, yaw: PI / 2 - 0.2, o: { size: 'small', shutters: 'red', paint: B, seed: 122, woodshed: true, woodshedSide: 'left' } },
  { id: 's13', x: -50, z: 135, yaw: PI + 0.08, o: { size: 'medium', shutters: 'red', paint: R, seed: 125, woodshed: true, woodshedSide: 'right' } },
  { id: 's14', x: 7, z: 151, yaw: PI - 0.2, o: { size: 'small', shutters: 'blue', paint: O, seed: 126, porch: true } },
  { id: 's15', x: -43, z: 177, yaw: PI + 0.1, o: { size: 'medium', shutters: 'blue', paint: R, seed: 127, gable: 'logs' } },
  { id: 'n12', x: -6, z: 72, yaw: 0.1, o: { size: 'small', shutters: 'red', paint: B, seed: 128, woodshed: true, woodshedSide: 'left' } },
  { id: 'n13', x: 62, z: 78, yaw: -0.2, o: { size: 'small', shutters: 'ochre', paint: B, seed: 129, porch: true } },
  { id: 'n14', x: -65, z: 78, yaw: 0.3, o: { size: 'small', shutters: 'blue', paint: O, seed: 130 } },
  // Dobra's hut, next to her workshop.
  { id: 'dobra_hut', x: -70, z: 172, yaw: PI / 2, o: { size: 'small', shutters: 'red', paint: R, seed: 123, woodshed: true, woodshedSide: 'right' } },
];

export const OUTBUILDINGS = [
  { id: 'granary', kind: 'granary', x: 12, z: 160, yaw: 0.2, o: { seed: 3 } },
  { id: 'barn_w', kind: 'barn', x: -82, z: 186, yaw: 0.1, o: { seed: 4 } },
  { id: 'barn_e', kind: 'barn', x: 68, z: 138, yaw: -PI / 2, o: { seed: 24 } },
  { id: 'stable', kind: 'stable', x: -72, z: 113, yaw: -PI / 2, o: { seed: 6 } },
  { id: 'granary2', kind: 'granary', x: 56, z: 166, yaw: -0.3, o: { seed: 33, w: 3.2, d: 3.0 } },
  // goat pen: a shed with a goat on the roof
  { id: 'goat_shed', kind: 'shed', x: 38, z: 160, yaw: PI, o: { seed: 8 } },
  { id: 'shed3', kind: 'shed', x: -44, z: 158, yaw: PI, o: { seed: 83 } },
  { id: 'shed4', kind: 'shed', x: 52, z: 80, yaw: 0.3, o: { seed: 84 } },
  { id: 'outhouse1', kind: 'outhouse', x: -38, z: 91, yaw: 0.2, o: { seed: 12 } },
  { id: 'outhouse2', kind: 'outhouse', x: 56, z: 134, yaw: PI, o: { seed: 13 } },
  { id: 'outhouse3', kind: 'outhouse', x: -88, z: 94, yaw: 0, o: { seed: 14 } },
];

// Market stalls around the square: mostly bare (DESIGN: dried fish, spoons, straw dolls, BREAD 3 GR).
export const STALLS = [
  { id: 'stall_fish', x: 14, z: 111, yaw: 0.15, wares: 'fish', seed: 101 },
  { id: 'stall_spoons', x: -14, z: 110, yaw: -0.1, wares: 'spoons', seed: 103 },
  { id: 'stall_dolls', x: -13, z: 127, yaw: PI + 0.18, wares: 'dolls', seed: 105 },
  { id: 'stall_bread', x: 14, z: 126, yaw: PI - 0.12, wares: 'bread', seed: 107 },
];

// Square furniture (the well sits just off the road junction so nothing stands on a road).
export const SQUARE = {
  well: { x: 5.5, z: 123.5, yaw: 0 },
  board: { x: 8.5, z: 111.5, yaw: -0.45 },
};

// Shore: fishing hut x positions (z follows the real shoreline), boathouse, boardwalk lane.
export const HUT_X = [-90, -70, -30, -10, 12, 35];
export const BOATHOUSE = { x: 50, z: 55.5, yaw: PI, seed: 14 };

// Palisade and gates. The west wall runs from the shore around the gate to the south wall.
export const GATE_W = { x: -88, z: 128, yaw: -1.07 };
export const GATE_S = { x: -36, z: 192, yaw: 0, width: 3.4 };

// Graveyard (the hollow east of the village; roads and cliffs keep it outside the wall).
export const GRAVEYARD = { x: 94, z: 166 };
export const SLED = { x: -40, z: 208, top: [-68, 222], bottom: [-42, 210] };
export const FIELDS = [
  { id: 'f1', x0: 30, z0: 178, x1: 64, z1: 194 },
  { id: 'f2', x0: -4, z0: 179, x1: 26, z1: 194 },
];
