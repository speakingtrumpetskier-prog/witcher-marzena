// Station registry helpers. Locations register `G.world.stations[id] = { x, z, yaw, anim, kind, ... }`
// (docs/ARCHITECTURE.md); this file fills in the optional fields the NPC system understands and
// answers "which stations of kind/tag X exist".
//
// Station fields (only x and z are required):
//   x, z, yaw        spot and facing (rotation.y; 0 faces +Z). For `talk`, yaw is the facing of slot 0;
//                    two people stand 0.55 m either side of (x, z) looking at each other.
//   kind             'work' (default) | 'sit' | 'talk' | 'bed' | 'wander'
//   anim             clip name to loop (chop_wood, hammer, sweep, stir, fish_ice, mend_net, carry_bucket,
//                    warm_hands, sit_bench, sit_ground, lean_wall, pray, kneel_idle, cross_arms, hands_hips,
//                    child_play, idle ...). Missing: guessed from `tag`.
//   tag              what it is: chop forge well market fish_rack net ice_hole shovel laundry shrine porch
//                    gate goat_pen bar tavern_seat tavern_corner bale sled fort social loom table errand ...
//                    Missing: guessed from the id ('chop_2' -> 'chop') or the anim.
//   indoor           true when it is inside a building (sheltered in a blizzard, entered through `door`)
//   door             { x, z } point outside the door; the last leg to an indoor station goes through it
//   y                floor height for stations on an interior floor (default: terrain)
//   capacity         people at once (default 1; 2 for talk; unlimited for bed)
//   r                radius for `wander` stations (default 12)
//   tool             'axe' | 'hammer' | 'broom' | 'shovel' | 'bucket' | 'rod' | 'net' | 'basket' | 'spoon' | 'none'
//   (ids starting with hanka_, bogdan_, dobra_, zbyszek_, jarek_, ola_, mill_, wojtek_, halina_ are reserved for that named person)
//   animal           'dog' | 'chicken' | 'goat' | 'cat' | 'raven' | 'crow': spawn an animal here instead
//                    (with `perch: true` and `y` for roofs, `count` for flocks)
const TAG_BY_ANIM = {
  chop_wood: 'chop', hammer: 'forge', stir: 'well', fish_ice: 'ice_hole', mend_net: 'net', sweep: 'shovel',
  pray: 'shrine', carry_bucket: 'goat_pen', child_play: 'bale', sit_bench: 'porch', lean_wall: 'porch',
};
const ANIM_BY_TAG = {
  chop: 'chop_wood', forge: 'hammer', well: 'stir', market: 'hands_hips', fish_rack: 'mend_net', net: 'mend_net',
  ice_hole: 'fish_ice', shovel: 'sweep', laundry: 'mend_net', shrine: 'pray', porch: 'sit_bench', gate: 'lean_wall',
  goat_pen: 'carry_bucket', bar: 'hands_hips', tavern_seat: 'sit_bench', tavern_corner: 'sit_bench', bale: 'child_play',
  sled: 'child_play', fort: 'sit_ground', loom: 'mend_net', table: 'sit_bench', social: 'idle', milk: 'kneel_idle',
  mill: 'carry_bucket', dock: 'sit_ground',
};
const KIND_BY_ANIM = { sit_bench: 'sit', sit_ground: 'sit', kneel_idle: 'sit' };

// Stations named after a person or the tavern's own spots belong to that person; ambient roles skip them.
const RESERVED = /^(hanka|bogdan|dobra|zbyszek|jarek|ola|mill|miller|wojtek|halina)_|^(tavern_(bar|corner|porch)|notice_board)$/;

const cache = new WeakMap();

function tagFromId(id) {
  const toks = String(id).replace(/_\d+$/, '').split('_');
  for (let len = Math.min(2, toks.length); len >= 1; len--) {
    for (let i = 0; i + len <= toks.length; i++) {
      const t = toks.slice(i, i + len).join('_');
      if (ANIM_BY_TAG[t]) return t;
    }
  }
  return null;
}

export function normalize(id, st) {
  let n = cache.get(st);
  if (n) return n;
  const isBedId = /(^|_)bed(_|\d|$)/.test(String(id));
  let tag = st.tag || tagFromId(id) || TAG_BY_ANIM[st.anim] || null;
  const kind = st.kind || (isBedId ? 'bed' : null) || (tag === 'social' ? 'talk' : null) || KIND_BY_ANIM[st.anim] || 'work';
  if (!tag && kind === 'talk') tag = 'social';
  const anim = st.anim || ANIM_BY_TAG[tag] || 'idle';
  n = {
    id, src: st, x: st.x, z: st.z, yaw: st.yaw || 0, kind, tag, anim,
    indoor: !!st.indoor || kind === 'bed',
    door: st.door || st.approach || null,
    y: st.y ?? null,
    capacity: st.capacity ?? (kind === 'talk' ? 2 : kind === 'bed' ? 99 : 1),
    r: st.r ?? 12,
    tool: st.tool,
    animal: st.animal || null,
    perch: !!st.perch,
    count: st.count || 1,
    hidden: kind === 'bed',
    reserved: RESERVED.test(String(id)) && tag !== 'bale',
  };
  cache.set(st, n);
  return n;
}

// Slot position for a station: talk stations place two people either side of the center.
export function slotPos(n, slot, out) {
  if (n.kind !== 'talk') { out.x = n.x; out.z = n.z; out.yaw = n.yaw; return out; }
  const s = slot === 0 ? -1 : 1;
  const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
  out.x = n.x + fx * 0.55 * s;
  out.z = n.z + fz * 0.55 * s;
  out.yaw = slot === 0 ? n.yaw : n.yaw + Math.PI;
  return out;
}

export function allStations(G) {
  const out = [];
  const reg = G.world && G.world.stations;
  if (!reg) return out;
  for (const id of Object.keys(reg)) {
    const st = reg[id];
    if (!st || !Number.isFinite(st.x) || !Number.isFinite(st.z)) continue;
    out.push(normalize(id, st));
  }
  return out;
}

export function getStation(G, id) {
  const st = G.world && G.world.stations && G.world.stations[id];
  return st ? normalize(id, st) : null;
}
