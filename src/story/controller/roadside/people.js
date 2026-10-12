// Roadside encounters: who the strangers are. Specs start from the generic villager presets (characters/presets.js) and
// are patched so each one reads at a glance from fifteen metres: the tinker's felt hat and beard, the old woman's
// black kerchief, the poacher's dark hood. The same spec is used on the road and later in the village.
import { presetSpec } from '../../../characters/presets.js';

function spec(preset, id, patch = {}) {
  const s = presetSpec(preset);
  s.id = id;
  if (patch.body) Object.assign(s.body, patch.body);
  if (patch.hat !== undefined) s.hat = patch.hat;
  if (patch.beard !== undefined) s.beard = patch.beard;
  if (patch.hair) s.hair = { ...s.hair, ...patch.hair };
  if (patch.outfit) s.outfit = { ...s.outfit, ...patch.outfit };
  if (patch.skin) s.skin = patch.skin;
  return s;
}

export const SPECS = {
  // a tinker: felt hat, a grey beard, a wool coat gone shiny at the cuffs, wrapped boots
  tinker: () => spec('villager_m_6', 'tinker', {
    body: { age: 52, stoop: 0.2 },
    hat: { type: 'felt', color: '#4a3e34' },
    beard: { style: 'full', color: '#8a8478', length: 0.05 },
    outfit: { coat: { color: '#5a4a38', tile: 'wool', length: 0.55, open: 0.2, loose: 1.2 } },
  }),
  oldWoman: () => spec('elder_f', 'old_woman', {
    hat: { type: 'kerchief', color: '#2e2a28', tile: 'wool' },
  }),
  goatOwner: () => spec('villager_f_4', 'goat_owner', {
    body: { age: 38 },
    hat: { type: 'kerchief', color: '#9a8a6a', tile: 'wool' },
  }),
  sledBoy: () => spec('child_f', 'sled_boy', {
    hat: { type: 'knit', color: '#6a5a48' },
  }),
  fisherOld: () => spec('fisherman_2', 'fisher_old', {
    body: { age: 66, stoop: 0.45 },
    hat: { type: 'fur', color: '#3e3630' },
    beard: { style: 'full', color: '#cfcac0', length: 0.07 },
  }),
  fisherYoung: () => spec('fisherman_4', 'fisher_young', {
    body: { age: 24, stoop: 0 },
    hat: { type: 'knit', color: '#8a3a2c', low: 0.6 },
    beard: null,
  }),
  poacher: () => spec('villager_m_11', 'poacher', {
    body: { age: 34 },
    hat: { type: 'fur', color: '#2a2622' },
    outfit: { coat: { color: '#3e3830', tile: 'wool', length: 0.55, open: 0.15, loose: 1.25 } },
  }),
};
