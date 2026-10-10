// Locations entry (owned by the lead). Preloads the props kit and its FX, then builds the
// village and each wilderness location through isolated dynamic imports so one broken location
// never blocks the rest.
// Owners: village.js and village/* (village builder); wilderness/*.js (wilderness builder).
// Each location module exports `async function build(G, ctx)`; ctx carries shared helpers.

// import.meta.glob only includes files that exist, so an unbuilt location is skipped cleanly.
const FOUND = import.meta.glob(['./village.js', './wilderness/index.js', './fishing.js']);
const LOCATIONS = [
  ['village', './village.js'],
  ['wilderness', './wilderness/index.js'],
  ['fishing', './fishing.js'], // after the wilderness: the holes sit on the ice by the camp and the bell tower
];

export async function init(G) {
  G.world.fires ||= []; // { x, z, r } warm spots read by the player's warmth system
  G.world.locations ||= {}; // id -> whatever a location wants to expose (anchors, doors, objects)

  let props = null;
  try {
    props = await import('../props/index.js');
    await props.props.preload?.(); // also installs the shared FX system
  } catch (e) {
    console.error('[locations] props preload', e);
    G.errors.push(`locations props: ${e.message}`);
  }
  const ctx = { props: props?.props, PropBatch: props?.PropBatch, fx: props?.props?.fx };

  const only = (G.params.get('loc') || '').split(',').filter(Boolean);
  for (const [name, path] of LOCATIONS) {
    if ((only.length && !only.includes(name)) || !FOUND[path]) continue;
    let mod;
    try {
      mod = await FOUND[path]();
    } catch (e) {
      console.error(`[location ${name}]`, e);
      G.errors.push(`location ${name}: ${e.message}`);
      continue;
    }
    try {
      if (mod.build) await mod.build(G, ctx);
    } catch (e) {
      console.error(`[location ${name}]`, e);
      G.errors.push(`location ${name}: ${e.message}`);
    }
  }
  try {
    (await import('./floors.js')).installFloors(G);
  } catch (e) {
    console.error('[locations] floors', e);
    G.errors.push(`locations floors: ${e.message}`);
  }
}
