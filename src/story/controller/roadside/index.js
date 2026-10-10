// Roadside encounters: small situations on the roads, the lake edge and the forest track that she comes across, each
// with a beginning, something to do or decide, and an end the world keeps. Optional: nothing in the main story reads
// any of their flags. Docs: docs/STORY.md section 9.
//
//   tinker.js     the tinker's sledge on the pass road: hold E to lift the corner while he lashes the runner
//   carcass.js    wolves at a deer on the forest track at dusk: go round them, or fight; the kill and the crows stay
//   goat.js       a goat strayed into the corkscrew pines, led home on a rope to the woman at the west gate (eggs)
//   scarf.js      an old woman at the shrine on the pass road asks after her son; his scarf is found with senses
//   sled.js       a boy's sled stuck on the river bank: tap E to push it out
//   poacher.js    a lantern among the trees at night: he runs, and leaves snares and a tally behind
//   fishers.js    two fishermen quarrelling over a hole at the river mouth: she settles it, or not
//
// Everything lives in the C toolbox (context.js) and the roadside kit (kit.js): a zone builds an encounter into a Bag when
// she comes within range at a fitting hour, the Bag frees it when she is gone, flags keep it once-only, and
// K.persist puts back what the world remembers after a load. No per-frame work runs while no encounter is live.
import { createKit } from './kit.js';
import * as tinker from './tinker.js';

const ENCOUNTERS = [['tinker', tinker]];

export function install(C) {
  const K = createKit(C);
  C.roadside = K;
  K.installed = [];
  for (const [name, mod] of ENCOUNTERS) {
    try {
      mod.install(C, K);
      K.installed.push(name);
    } catch (e) {
      console.error(`[roadside] ${name}`, e);
      C.G.errors.push(`roadside ${name}: ${e.message}`);
    }
  }
}
