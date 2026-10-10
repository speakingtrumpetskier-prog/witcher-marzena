// Gameplay module entry (owned by the lead). Initializes each gameplay subsystem in order through
// isolated dynamic imports, so a missing or broken subsystem never blocks the others.
// Subsystem owners (see docs/ARCHITECTURE.md): Interact and Senses (story systems builder),
// Player, CameraRig, Horse (gameplay core builder), combat and creatures (combat builder),
// npcs (NPC builder).

// import.meta.glob only includes files that exist, so a subsystem that is not built yet is simply
// skipped (a plain dynamic import of a missing file fails the whole module in Vite).
const FOUND = import.meta.glob(['./Interact.js', './Senses.js', './Player.js', './CameraRig.js', './Horse.js',
  './combat/index.js', './creatures/index.js', './npcs/index.js', './SnowTracks.js', './fauna/index.js']);
const SUBSYSTEMS = [
  ['interact', './Interact.js'],
  ['senses', './Senses.js'],
  ['player', './Player.js'],
  ['cameraRig', './CameraRig.js'],
  ['horse', './Horse.js'],
  ['combat', './combat/index.js'],
  ['creatures', './creatures/index.js'],
  ['npcs', './npcs/index.js'],
  ['snowTracks', './SnowTracks.js'],
  ['fauna', './fauna/index.js'],
];

export async function init(G) {
  const skip = (G.params.get('skipGameplay') || '').split(',');
  for (const [name, path] of SUBSYSTEMS) {
    if (skip.includes(name) || !FOUND[path]) continue;
    let mod;
    try {
      mod = await FOUND[path]();
    } catch (e) {
      console.error(`[gameplay ${name}]`, e);
      G.errors.push(`gameplay ${name}: ${e.message}`);
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
