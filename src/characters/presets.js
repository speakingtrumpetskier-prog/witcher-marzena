// Character presets (DESIGN 3.2) and the seeded villager generator.
//
// A spec: { id, name, body: { sex, age, height, mass, muscle, shoulders, hips, stoop },
//   skin, face: {...} (head.js faceParams), hair: { style, color, streak, ... },
//   beard: { style: 'full'|'short'|'thin'|'mustache', color, length },
//   hat: { type: 'fur'|'knit'|'felt'|'scarf'|'kerchief'|'hood'|'crown', color },
//   outfit: { shirt, dress, coat, vest, skirt, apron, trousers, boots, hands, collar, hood,
//             shawl, cape, belt, harness, swords, medallion, pouch },
//   ghost, rim, glow, loco: { idle, walk } default locomotion variants, headRes }
// Palette: wool browns, greys, faded blues, linen whites, folk red accents, sheepskin creams.
import { rng, hashStr } from './util.js';

export const PAL = {
  woolBrown: ['#5a4636', '#6b5442', '#4a3a2c', '#7a6048', '#584232'],
  woolGrey: ['#5f5a54', '#6e6862', '#4c4844', '#7a746c'],
  fadedBlue: ['#4a5868', '#56667a', '#3e4a58', '#62707e'],
  linen: ['#d8cfbc', '#cfc4ae', '#e0d8c6', '#c6baa2'],
  red: ['#9a2e22', '#8a3428', '#a8402e'],
  cream: ['#d9ccb0', '#cdbd9c', '#e2d6bc'],
  dark: ['#2e2824', '#3a322c', '#2a2624'],
  green: ['#4e5a44', '#5a6248'],
  ochre: ['#8a6a3a', '#9a7a48'],
  suede: ['#9a7a54', '#8a6a48', '#a8865c', '#7a5c40'],
  hair: ['#3a2c22', '#4a3a2c', '#5e4630', '#2a2420', '#6b4a2e', '#8a6a48', '#a08460'],
  grey: ['#8c8680', '#a09a92', '#b8b2aa', '#cfcac2'],
  skin: ['#d8ae94', '#d2a68a', '#dcb49a', '#c99c80', '#e0b8a0', '#cfa48c'],
};

const CAST = {
  vesna: {
    name: 'Vesna',
    body: { sex: 'f', age: 38, height: 1.77, mass: 0.42, muscle: 0.85, shoulders: 1.07, hips: 0.95 },
    skin: '#d2a78c',
    face: { scar: true, slit: true, iris: '#c8902c', iris2: '#6a3e10', browColor: '#5e5244', jawW: 0.97, jawSq: 0.6, cheek: 0.8, gaunt: 0.35,
      brow: 0.45, noseBridge: 0.35, noseW: 0.95, lipFull: 0.82, blush: 0.3, noseRed: 0.25, wrinkles: 0.28, underEye: 0.45, eyeTilt: 3, lidHeavy: 0.28, fullCheek: 0.15 },
    hair: { style: 'braid', color: '#b5a88e', streak: '#dcdad4', braidLen: 0.48, thick: 0.01, peak: 0.0 },
    outfit: {
      shirt: { color: '#34312e', tile: 'wool' },
      coat: { color: '#38414e', tile: 'wool', length: 0.52, open: 0.42, vent: 0.14, lining: '#26221e', loose: 1.22, placket: true,
        cuff: { tile: 'leather', color: '#2a221c', len: 0.07 } },
      collar: { tile: 'fleece', color: '#d4c6a6', size: 0.036, v: 0.15 },
      hood: { color: '#38414e', fur: '#c8b896' },
      belt: { color: '#30241c', h: 0.05 },
      harness: { color: '#2e2219' },
      swords: true,
      medallion: { knot: true },
      trousers: { color: '#2c2a28', tile: 'wool' },
      boots: { color: '#33271e', height: 0.88, wrapped: true },
      hands: { glove: { color: '#33271e' } },
      pouch: { sides: [-1], color: '#4a3628' },
    },
    loco: { idle: 'idle', walk: 'walk' },
  },
  ola: {
    name: 'Ola',
    body: { sex: 'f', age: 11, height: 1.42, mass: 0.32 },
    skin: '#e2bba2',
    face: { missingTooth: true, iris: '#5e7656', browColor: '#5a3e28', blush: 0.75, noseRed: 0.55, freckles: 0.7, noseTip: 0.7, noseLen: 0.76, noseSize: 0.76, noseW: 0.88, jawW: 0.86, jawSq: 0.2, chin: 0.2, chinW: 0.85, faceLen: 0.86, fullCheek: 1.2, lipFull: 0.95, lipW: 0.9, eyeSize: 1.1, brow: 0.0 },
    hair: { style: 'pigtails', color: '#6b4a2e', tie: '#9a2e22' },
    hat: { type: 'knit', color: '#9a2e22', slouch: 0.008 },
    outfit: {
      dress: { color: '#5a5e7a', tile: 'wool', length: 0.6 },
      coat: { color: '#9a7a54', tile: 'leather', length: 0.56, open: 0.2, vent: 0.0, loose: 1.5, cuffPast: 0.045, lining: '#d4c6a6', liningTile: 'fleece',
        cuff: { tile: 'fleece', color: '#d4c6a6', len: 0.06 }, rough: 0.85, thick: 0.03 },
      collar: { tile: 'fleece', color: '#d9ccb0', size: 0.03, v: 0.06 },
      belt: { color: '#6a3a2a', h: 0.03, buckle: false },
      stockings: { color: '#4a4038', tile: 'knit' },
      boots: { color: '#5a4a3c', height: 0.55, tile: 'wool', wide: 1.15 },
      hands: { mitten: { color: '#8a3428' } },
    },
  },
  hanka: {
    name: 'Hanka',
    body: { sex: 'f', age: 40, height: 1.66, mass: 0.15, shoulders: 0.96 },
    skin: '#d6b09a',
    face: { iris: '#5e6a72', browColor: '#4a3e34', gaunt: 0.45, cheek: 0.7, lipFull: 0.78, blush: 0.25, noseRed: 0.35, wrinkles: 0.45, underEye: 0.85, lidHeavy: 0.4, pale: 0.12 },
    hair: { style: 'bun', color: '#4a3e34' },
    hat: { type: 'kerchief', color: '#7a7670' },
    outfit: {
      dress: { color: '#3e3a3a', tile: 'wool', length: 0.94, emb: 5 },
      shawl: { color: '#2e2a2c', tile: 'wool' },
      apron: { color: '#8a8478', tile: 'linen', length: 0.72 },
      boots: { color: '#2e2620', height: 0.4 },
      hands: { raw: true },
    },
    loco: { idle: 'idle_cold', walk: 'walk_cold' },
  },
  bogdan: {
    name: 'Bogdan Kral',
    body: { sex: 'm', age: 50, height: 1.86, mass: 0.85, muscle: 0.7, shoulders: 1.1 },
    skin: '#cfa085',
    face: { iris: '#5a4a3a', browColor: '#4a3a2c', jawW: 1.1, brow: 0.8, noseW: 1.15, noseSize: 1.1, wrinkles: 0.6, underEye: 0.7, blush: 0.55, noseRed: 0.6, lidHeavy: 0.45 },
    hair: { style: 'short', color: '#4e4034', thick: 0.008 },
    beard: { style: 'full', color: '#4a3c30', length: 0.07 },
    hat: { type: 'fur', color: '#3a2e24', height: 0.1 },
    outfit: {
      shirt: { color: '#cfc4ae', tile: 'linen' },
      coat: { color: '#4a3a2c', tile: 'wool', length: 0.6, open: 0.25, vent: 0.06, loose: 1.25, lining: '#2a2420' },
      cape: { color: '#3a2c20', tile: 'fur', length: 0.5 },
      belt: { color: '#9a2e22', h: 0.07, sash: true, emb: 4 },
      trousers: { color: '#3a342e' },
      boots: { color: '#2e241c', height: 0.82 },
    },
  },
  dobra: {
    name: 'Dobra',
    body: { sex: 'f', age: 62, height: 1.5, mass: 0.3, stoop: 0.75 },
    skin: '#d4a890',
    face: { iris: '#4e5a3e', browColor: '#9a948c', wrinkles: 1, underEye: 0.7, gaunt: 0.5, lipFull: 0.7, blush: 0.5, noseRed: 0.45, noseLen: 1.06, lidHeavy: 0.55, eyeSize: 0.96 },
    hair: { style: 'bun', color: '#a49e96', thick: 0.008 },
    straw: true,
    outfit: {
      shirt: { color: '#cfc4ae', tile: 'linen' },
      dress: { color: '#5a4636', tile: 'wool', length: 0.92 },
      vest: { color: '#c9b48e', tile: 'fleece' },
      apron: { color: '#b8ab88', tile: 'linen', length: 0.7, emb: 0, dirty: 1 },
      shawl: { color: '#6a3a2e', tile: 'wool' },
      boots: { color: '#3a2e24', height: 0.4 },
      hands: { raw: true, thread: true },
    },
  },
  zbyszek: {
    name: 'Zbyszek',
    body: { sex: 'm', age: 45, height: 1.7, mass: 1.0, shoulders: 1.0 },
    skin: '#d8ae94',
    face: { iris: '#6a5a44', browColor: '#5a4636', jawW: 1.12, fullCheek: 1, blush: 0.75, noseRed: 0.8, noseSize: 1.12, wrinkles: 0.4, stubble: 0.5 },
    hair: { style: 'fringe', color: '#5a4636' },
    beard: { style: 'mustache', color: '#5a4636' },
    outfit: {
      shirt: { color: '#d4cab4', tile: 'linen', rolled: true, cuff: { tile: 'emb', emb: 6 } },
      vest: { color: '#5a4636', tile: 'wool' },
      apron: { color: '#c8bca4', tile: 'linen', length: 0.72, dirty: 1.2 },
      trousers: { color: '#4a4038' },
      boots: { color: '#2e241c', height: 0.6 },
      belt: { color: '#3a2a20', h: 0.04 },
    },
  },
  jarek: {
    name: 'Jarek',
    body: { sex: 'm', age: 19, height: 1.84, mass: 0.15, shoulders: 0.98 },
    skin: '#d8b098',
    face: { iris: '#4e6878', browColor: '#3e3024', jawW: 0.96, gaunt: 0.5, underEye: 0.9, blush: 0.5, noseRed: 0.55, stubble: 0.2, wrinkles: 0 },
    hair: { style: 'long', color: '#3e3024', length: 0.12, thick: 0.011 },
    beard: { style: 'thin', color: '#3e3024' },
    hat: { type: 'knit', color: '#4e5a44', low: 0.3, pompom: false },
    outfit: {
      shirt: { color: '#8a8270', tile: 'wool' },
      coat: { color: '#5e5a3a', tile: 'oilskin', length: 0.55, open: 0.4, vent: 0.08, loose: 1.2, lining: '#3a3628' },
      trousers: { color: '#3e3a34' },
      boots: { color: '#2a2420', height: 0.95 },
      belt: { color: '#2e241c', h: 0.035 },
    },
  },
  wiesia_ghost: {
    name: 'Wiesia',
    body: { sex: 'f', age: 14, height: 1.58, mass: 0.2 },
    skin: '#cfdfe4',
    ghost: true,
    rim: { r: 0.45, g: 1.1, b: 1.25, p: 2.2 },
    glow: '#1a4048',
    face: { iris: '#9ff5ff', iris2: '#3a7a8a', browColor: '#2a2624', pale: 0.6, blush: 0, noseRed: 0, underEye: 1, lipColor: '#8a9aa8', ghost: true, eyeSize: 1.05 },
    hair: { style: 'float', color: '#26221f', length: 0.6 },
    hat: { type: 'crown', color: '#d8cfa8' },
    outfit: {
      dress: { color: '#e6ece8', tile: 'linen', length: 1.0, emb: 4, embH: 0.07, flare: 0.5 },
      shirt: { color: '#e6ece8', tile: 'linen', cuff: { tile: 'emb', emb: 0 } },
      belt: { color: '#9a2e22', h: 0.035, sash: true, emb: 4 },
      hands: {},
    },
  },
  miller: {
    name: 'Gniewko',
    body: { sex: 'm', age: 44, height: 1.78, mass: 0.6, muscle: 0.75 },
    skin: '#d6ac92',
    face: { iris: '#5a6a5a', browColor: '#c8c0b0', wrinkles: 0.35, blush: 0.4 },
    hair: { style: 'short', color: '#9a8a74' },
    beard: { style: 'short', color: '#9a8a74' },
    hat: { type: 'felt', color: '#d8d2c4' },
    outfit: {
      shirt: { color: '#e0d8c6', tile: 'linen', rolled: true },
      vest: { color: '#c8c0ac', tile: 'wool' },
      apron: { color: '#e4dccb', tile: 'linen', length: 0.75 },
      trousers: { color: '#b0a690' },
      boots: { color: '#5a4a3c', height: 0.6 },
    },
  },
  miller_wife: {
    name: 'Bozena',
    body: { sex: 'f', age: 40, height: 1.63, mass: 0.6 },
    skin: '#dcb49a',
    face: { iris: '#6a5a44', browColor: '#6b5442', blush: 0.6, wrinkles: 0.3, fullCheek: 0.8 },
    hair: { style: 'bun', color: '#6b5442' },
    hat: { type: 'scarf', color: '#d8d0bc', tile: 'linen' },
    outfit: {
      shirt: { color: '#e0d8c6', tile: 'linen', rolled: true },
      dress: { color: '#7a6048', tile: 'wool', length: 0.9, emb: 2 },
      apron: { color: '#e4dccb', tile: 'linen', length: 0.75, emb: 3 },
      boots: { color: '#3a2e24', height: 0.4 },
    },
  },
};

// Seeded villagers: wool and sheepskin, layered against cold, worn and patched.
function villager(sex, idx, kind = 'villager') {
  const R = rng(hashStr(`${kind}_${sex}_${idx}`));
  const elder = kind === 'elder';
  const child = kind === 'child';
  const fisher = kind === 'fisher';
  const age = child ? R.int(6, 12) : elder ? R.int(62, 78) : fisher ? R.int(22, 55) : R.int(18, 58);
  const fem = sex === 'f';
  const body = {
    sex, age,
    height: child ? 1.15 + (age - 6) * 0.055 + R.range(-0.04, 0.04) : (fem ? 1.6 : 1.72) + R.range(-0.07, 0.09) - (elder ? 0.04 : 0),
    mass: R.range(0.1, 0.7) * (elder ? 0.8 : 1),
    muscle: R.range(0.3, 0.8), shoulders: R.range(0.95, 1.06),
    stoop: elder ? R.range(0.4, 0.9) : 0,
  };
  const hairC = elder ? R.pick(PAL.grey) : R.pick(PAL.hair);
  const spec = {
    name: kind,
    body,
    skin: R.pick(PAL.skin),
    face: {
      iris: R.pick(['#5a6a74', '#5e4a36', '#4e5e48', '#6a7a86', '#4a3a2c']),
      browColor: hairC, jawW: R.range(0.9, 1.1), cheek: R.range(0.3, 0.8), gaunt: R.range(0.1, 0.7), noseLen: R.range(0.92, 1.1),
      noseW: R.range(0.9, 1.15), noseBridge: R.chance(0.3) ? R.range(0.2, 0.8) : 0, lipFull: R.range(0.8, 1.1), blush: R.range(0.3, 0.8),
      noseRed: R.range(0.3, 0.8), underEye: R.range(0.4, 0.9), stubble: fem || child ? 0 : R.range(0.2, 0.7), missingTooth: R.chance(0.15),
    },
    hair: { color: hairC },
    headRes: 'mid',
    faceRes: 256,
    detail: 0.75,
    seed: hashStr(`${kind}_${sex}_${idx}`) % 997,
  };
  const outfit = {};
  const wool = () => R.pick([...PAL.woolBrown, ...PAL.woolGrey, ...PAL.fadedBlue]);
  outfit.shirt = { color: R.pick(PAL.linen), tile: 'linen', cuff: R.chance(0.5) ? { tile: 'emb', emb: R.pick([5, 6, 0]) } : null };
  if (fem) {
    spec.hair.style = 'bun';
    outfit.dress = { color: wool(), tile: 'wool', length: child ? 0.7 : R.range(0.85, 0.95), emb: R.chance(0.5) ? R.pick([2, 3, 5]) : undefined };
    if (R.chance(0.7)) outfit.apron = { color: R.pick([...PAL.linen, ...PAL.woolGrey]), tile: R.chance(0.6) ? 'linen' : 'wool', length: R.range(0.6, 0.75), emb: R.chance(0.4) ? R.pick([0, 3]) : undefined };
    const layer = R();
    if (layer < 0.55) outfit.shawl = { color: R.pick([...PAL.dark, ...PAL.red, ...PAL.woolBrown]), tile: 'wool' };
    else if (layer < 0.8) outfit.vest = { color: R.pick(PAL.cream), tile: 'fleece' };
    else outfit.coat = { color: R.pick(PAL.suede), tile: 'leather', length: 0.62, open: 0.15, loose: 1.2, lining: R.pick(PAL.cream), liningTile: 'fleece', cuff: { tile: 'fleece', color: R.pick(PAL.cream) } };
    spec.hat = { type: R.chance(0.65) ? 'kerchief' : 'scarf', color: R.pick([...PAL.red, ...PAL.linen, ...PAL.woolGrey, ...PAL.fadedBlue]), tile: R.chance(0.5) ? 'linen' : 'wool' };
    if (child && R.chance(0.5)) spec.hat = { type: 'knit', color: R.pick([...PAL.red, ...PAL.fadedBlue, ...PAL.cream]) };
    outfit.boots = { color: R.pick(PAL.dark), height: 0.45, tile: R.chance(0.3) ? 'wool' : 'leather' };
    if (R.chance(0.4)) outfit.hands = { mitten: { color: R.pick([...PAL.red, ...PAL.woolGrey]) } };
  } else {
    spec.hair.style = R.chance(0.2) ? 'long' : 'short';
    spec.hair.length = 0.1;
    if (!child && R.chance(0.6)) spec.beard = { style: R.pick(['full', 'short', 'short', 'mustache']), color: hairC, length: R.range(0.02, 0.06) };
    const ck = R();
    const coatKind = ck < 0.42 ? 0 : ck < 0.78 ? 1 : ck < 0.92 ? 2 : 3;
    if (coatKind === 0) outfit.coat = { color: R.pick(PAL.suede), tile: 'leather', length: R.range(0.45, 0.6), open: R.range(0.1, 0.35), loose: 1.25, lining: R.pick(PAL.cream), liningTile: 'fleece', cuff: { tile: 'fleece', color: R.pick(PAL.cream) } };
    else if (coatKind === 1) outfit.coat = { color: wool(), tile: 'wool', length: R.range(0.4, 0.6), open: R.range(0.15, 0.4), loose: 1.2 };
    else if (coatKind === 2) outfit.vest = { color: R.pick(PAL.cream), tile: 'fleece' };
    else outfit.shirt = { color: R.pick([...PAL.woolGrey, ...PAL.woolBrown, ...PAL.fadedBlue]), tile: 'wool' };
    if (outfit.coat && R.chance(0.5)) outfit.collar = { tile: R.chance(0.5) ? 'fleece' : 'fur', color: R.pick([...PAL.cream, '#5a4a3c']), size: 0.03 };
    outfit.belt = R.chance(0.7) ? { color: R.chance(0.3) ? R.pick(PAL.red) : '#3a2a20', h: 0.04, sash: R.chance(0.3), emb: 4 } : null;
    outfit.trousers = { color: R.pick([...PAL.woolGrey, ...PAL.woolBrown, ...PAL.dark, PAL.linen[3]]), tile: R.chance(0.7) ? 'wool' : 'linen', wrapped: false };
    if (coatKind === 2) outfit.shirt = { color: R.pick([...PAL.woolBrown, ...PAL.woolGrey, ...PAL.fadedBlue]), tile: 'wool' };
    const wraps = R.chance(0.35);
    outfit.boots = wraps ? { color: R.pick(PAL.linen), tile: 'linen', height: 0.75, wrapped: true, sole: '#8a7a50' } : { color: R.pick(PAL.dark), height: R.range(0.55, 0.85) };
    const hk = R();
    spec.hat = hk < 0.45 ? { type: 'fur', color: R.pick([...PAL.dark, '#5a4a3c', '#6a5a48', '#3e3630']), height: R.range(0.07, 0.12) }
      : hk < 0.75 ? { type: 'knit', color: R.pick([...PAL.woolGrey, ...PAL.woolBrown, ...PAL.red, ...PAL.fadedBlue]), low: R.range(0.2, 0.8) }
        : hk < 0.85 ? { type: 'felt', color: R.pick(['#4a3e34', '#5a4a3c', '#3a322c']) } : null;
    if (R.chance(0.35)) outfit.hands = { mitten: { color: R.pick([...PAL.woolGrey, ...PAL.red, ...PAL.cream]) } };
  }
  if (fisher) {
    outfit.coat = { color: R.pick(['#5e5a3a', '#4e4a36', '#6a5a3e']), tile: 'oilskin', length: 0.6, open: 0.3, loose: 1.25 };
    spec.hat = { type: R.pick(['knit', 'fur']), color: R.pick([...PAL.woolGrey, ...PAL.dark]) };
    outfit.boots = { color: '#2a2420', height: 0.95 };
  }
  if (elder && !fem) outfit.cape = null;
  spec.outfit = outfit;
  spec.loco = R.chance(0.5) ? { idle: 'idle_cold' } : {};
  return spec;
}

export function presetSpec(id) {
  if (CAST[id]) return { id, ...structuredClone(CAST[id]) };
  let m;
  if ((m = /^villager_([mf])_(\d+)$/.exec(id))) return { id, ...villager(m[1], +m[2]) };
  if ((m = /^child_([a-f])$/.exec(id))) {
    const i = m[1].charCodeAt(0) - 97;
    return { id, ...villager(i % 2 ? 'm' : 'f', i, 'child') };
  }
  if (id === 'elder_m') return { id, ...villager('m', 1, 'elder') };
  if (id === 'elder_f') return { id, ...villager('f', 1, 'elder') };
  if ((m = /^fisherman_(\d+)$/.exec(id))) return { id, ...villager('m', +m[1], 'fisher') };
  return null;
}

export const PRESET_IDS = [
  ...Object.keys(CAST),
  ...'abcdef'.split('').map((c) => `child_${c}`),
  ...Array.from({ length: 12 }, (_, i) => `villager_m_${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `villager_f_${i + 1}`),
  'elder_m', 'elder_f',
  ...Array.from({ length: 4 }, (_, i) => `fisherman_${i + 1}`),
];
export const MAIN_CAST = Object.keys(CAST);
