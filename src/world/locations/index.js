// Locations entry (owned by the lead). Preloads the props kit and its FX, then builds the
// village and each wilderness location through isolated dynamic imports so one broken location
// never blocks the rest.
// Owners: village.js and village/* (village builder); wilderness/*.js (wilderness builder).
// Each location module exports `async function build(G, ctx)`; ctx carries shared helpers.

const LOCATIONS = [
  ['village', () => import('./village.js')],
  ['wilderness', () => import('./wilderness/index.js')],
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
  for (const [name, load] of LOCATIONS) {
    if (only.length && !only.includes(name)) continue;
    let mod;
    try {
      mod = await load();
    } catch (e) {
      if (!/Failed to fetch|Cannot find|does not provide|404|Unknown variable dynamic import/i.test(e.message)) {
        console.error(`[location ${name}]`, e);
        G.errors.push(`location ${name}: ${e.message}`);
      }
      continue;
    }
    try {
      if (mod.build) await mod.build(G, ctx);
    } catch (e) {
      console.error(`[location ${name}]`, e);
      G.errors.push(`location ${name}: ${e.message}`);
    }
  }
}
