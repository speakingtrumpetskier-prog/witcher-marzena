// Gameplay module entry (owned by the lead). Initializes each gameplay subsystem in order through
// isolated dynamic imports, so a missing or broken subsystem never blocks the others.
// Subsystem owners (see docs/ARCHITECTURE.md): Interact and Senses (story systems builder),
// Player, CameraRig, Horse (gameplay core builder), combat and creatures (combat builder),
// npcs (NPC builder).

const SUBSYSTEMS = [
  ['interact', () => import('./Interact.js')],
  ['senses', () => import('./Senses.js')],
  ['player', () => import('./Player.js')],
  ['cameraRig', () => import('./CameraRig.js')],
  ['horse', () => import('./Horse.js')],
  ['combat', () => import('./combat/index.js')],
  ['creatures', () => import('./creatures/index.js')],
  ['npcs', () => import('./npcs/index.js')],
];

export async function init(G) {
  const skip = (G.params.get('skipGameplay') || '').split(',');
  for (const [name, load] of SUBSYSTEMS) {
    if (skip.includes(name)) continue;
    let mod;
    try {
      mod = await load();
    } catch (e) {
      // Not built yet is expected during development; anything else is a real error.
      if (!/Failed to fetch|Cannot find|does not provide|404|Unknown variable dynamic import/i.test(e.message)) {
        console.error(`[gameplay ${name}]`, e);
        G.errors.push(`gameplay ${name}: ${e.message}`);
      }
      continue;
    }
    try {
      if (mod.init) await mod.init(G);
    } catch (e) {
      console.error(`[gameplay ${name}]`, e);
      G.errors.push(`gameplay ${name}: ${e.message}`);
    }
  }
}
