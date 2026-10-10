// Props kit public API (see docs/ARCHITECTURE.md "Props kit").
//
//   import { props, PropBatch } from '../world/props/index.js';
//   const obj = props.barrel({ seed: 3 });        Group at the origin, y = 0 is the ground, merged per material
//
// Every prop returns a THREE.Group with userData:
//   collider    first collider, or null:  { type: 'circle', r, x, z, h } | { type: 'box', hw, hd, x, z, yaw, h }
//   colliders   all of them (local space; h is the blocking height above the ground)
//   anchors     named local-space Vector3 (fire, light, flame, seat, work, sleep, hitch, head, knot, ...)
//   bounds      Box3, height, tris, prop (name), snow (true unless indoor)
//
// Placement of many props:
//   const batch = new PropBatch(G, 'village');    merged static placement, ~1500 props in about 60 draw calls
//   const h = batch.add('barrel', x, z, { yaw, scale, y, seed, snap: true, collide: true, align });
//   batch.build();   or   await batch.buildAsync({ budgetMs: 10, onProgress })      h.anchors.* are world space
//
// Fx (one shared pooled particle system, one draw call, one update system):
//   props.fx.fire({ position, parent, scale, light, smoke })     props.fx.smoke({ position, parent, height })
//   props.fx.steam / sparks / torch / candle / glow / wisp / breath({ parent: headBone }) / burst(kind, pos)
//
// Misc: props.make(name, opts)  props.list()  props.categories  await props.preload(onProgress)
//
// Common builder options: seed (variant), indoor (no snow patch on upward faces), variant (named
// variant where a prop has them), fx (default true: spawn live fx emitters; PropBatch passes false
// and spawns them itself).
import { PropBatch } from './batch.js';
import { fx } from './fx.js';
import { getMat, MAT_INFO } from './mats.js';
import * as basic from './p_basic.js';
import * as work from './p_work.js';
import * as household from './p_household.js';
import * as fishing from './p_fishing.js';
import * as ritual from './p_ritual.js';
import * as misc from './p_misc.js';

const MODULES = [basic, work, household, fishing, ritual, misc];

const raw = {};
for (const m of MODULES) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn === 'function' && !name.startsWith('_') && name !== 'folkRect' && name !== 'fishShape' && name !== 'addFish') raw[name] = fn;
  }
}

// Turn fx markers into live emitters (standalone use). Markers stay as the emitter anchors.
function spawnLive(group) {
  const markers = [];
  group.traverse((o) => { if (o.userData && o.userData.fxSpec && !o.userData.emitter) markers.push(o); });
  for (const m of markers) {
    const spec = m.userData.fxSpec;
    const parent = m.parent || group;
    const em = fx.fromSpec(spec, spec.pos, parent);
    if (em) {
      em.object.userData.fxSpec = spec;
      m.userData.emitter = em;
      parent.remove(m);
    }
  }
}

function wrap(name, fn) {
  const w = (opts = {}) => {
    const g = fn(opts);
    g.userData.prop = name;
    if (opts.fx !== false) spawnLive(g);
    return g;
  };
  w.raw = fn;
  w.propName = name;
  return w;
}

export const props = { fx };
for (const [name, fn] of Object.entries(raw)) props[name] = wrap(name, fn);

props.make = (name, opts = {}) => {
  const f = props[name];
  if (!f || name === 'fx') throw new Error(`props: unknown prop "${name}"`);
  return f(opts);
};
props.list = () => Object.keys(raw);
props.catalog = props.list();

// Suggested groupings for dressing: pick from a category when furnishing a location.
props.categories = {
  porch: ['wheelbarrow', 'tools', 'jug', 'snowDrift', 'barrel', 'crate', 'sack', 'bucket', 'firewoodStack', 'choppingBlock', 'sled', 'skis', 'snowShovel', 'bench', 'lantern', 'ladder', 'fishString', 'laundryLine', 'toys', 'snowman', 'washTub', 'stump', 'logs', 'barrelStack', 'crateStack', 'woodpile', 'icicles', 'cartWheel', 'dogKennel', 'chickenCoop', 'beehive'],
  interior: ['herbs', 'jug', 'bed', 'chest', 'rug', 'tapestry', 'table', 'stool', 'shelf', 'spoonRack', 'pot', 'cauldron', 'musicBox', 'birdCarving', 'bench', 'barrel', 'crate', 'sack', 'lantern', 'toys'],
  forge: ['anvil', 'quenchBarrel', 'grindstone', 'brazier', 'torch', 'woodpile', 'barrel'],
  fishing: ['dryingRack', 'fishBasket', 'fishString', 'net', 'boat', 'iceFishingHole', 'fishingStool', 'windbreak', 'tent', 'bucket', 'campfire', 'barrel', 'skinFrame'],
  ritual: ['effigy', 'effigyHead', 'ribbonPole', 'handBell', 'offering', 'gravePostSmall', 'strawPile', 'bones', 'skull', 'horseHead', 'roofFinial', 'signpost'],
  farm: ['hayBale', 'haystack', 'woodpile', 'cart', 'cartWheel', 'sled', 'strawPile', 'dogKennel', 'chickenCoop', 'beehive', 'skinFrame'],
  wilderness: ['rockSmall', 'logs', 'stump', 'bones', 'skull', 'campfire', 'tent', 'signpost', 'torch', 'cart'],
  fire: ['campfire', 'brazier', 'torch', 'lantern', 'cauldron', 'offering'],
};

// Optional: generate every canvas texture and the fx atlas up front, yielding to the event loop between
// textures so a loading screen keeps moving (about 0.5 to 1 s of work in total). Otherwise textures are
// generated lazily the first time a prop that needs them is built.
props.preload = async (onProgress) => {
  const names = Object.keys(MAT_INFO);
  for (let i = 0; i < names.length; i++) {
    getMat(names[i]);
    if (onProgress) onProgress((i + 1) / (names.length + 1), names[i]);
    await new Promise((r) => setTimeout(r, 0));
  }
  fx.install();
  if (onProgress) onProgress(1, 'fx');
};

PropBatch.make = props.make;

export { PropBatch, fx };
