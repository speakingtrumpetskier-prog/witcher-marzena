// ─── WORLD LAYOUT ───────────────────────────────────
export const BUILDINGS = [
  { x: 15, z: -5, w: 8, d: 7, h: 4.5, roof: 0x3a2218 },
  { x: 0, z: 14, w: 5, d: 5, h: 3.5 },
  { x: -16, z: -3, w: 7, d: 5, h: 3.5 },
  { x: -8, z: 10, w: 4, d: 4, h: 3 },
  { x: 10, z: 12, w: 4, d: 5, h: 3 },
  { x: -12, z: -16, w: 5, d: 4, h: 3 },
  { x: 9, z: -17, w: 4, d: 4, h: 3.2 },
  { x: -4, z: -22, w: 5, d: 5, h: 3 },
  { x: 18, z: -18, w: 4, d: 4, h: 3 },
];

export const getInteractions = (flags) => [
  { id: "elder_hall", pos: [15, 0, -1], radius: 5, label: "Elder's Hall",
    visible: !flags.met_elder },
  { id: "children", pos: [0, 0, 17], radius: 4, label: "Blacksmith's Loft",
    visible: flags.met_elder && !flags.visited_children && !flags.night_done },
  { id: "forest_edge", pos: [0, 0, -32], radius: 5, label: "Forest Edge",
    visible: flags.met_elder && !flags.visited_forest && !flags.night_done },
  { id: "families", pos: [-16, 0, 0], radius: 4, label: "Common House",
    visible: flags.met_elder && !flags.visited_families && !flags.night_done },
  { id: "night", pos: [0, 0, 17], radius: 4, label: "Your Room",
    visible: flags.met_elder && !flags.night_done &&
      (flags.visited_children || flags.visited_forest || flags.visited_families) },
  { id: "confrontation", pos: [0, 0, 0], radius: 4, label: "Borislav",
    visible: flags.night_done && !flags.confrontation_done },
  { id: "deep_forest", pos: [0, 0, -80], radius: 8, label: "The Clearing",
    visible: flags.confrontation_done && !flags.forest_done },
];
