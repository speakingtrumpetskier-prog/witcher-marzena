// Registry of every renderable vegetation "kind" (one geometry family with up to three LODs).
// Owner: vegetation builder. Pure: builds geometry and materials, never touches the scene.
//
// A kind: { id, species, group, height, radius, trunkR, lods: [{ parts: [{ geometry, material,
//           depth, noShadow, leaves }] }], lodU: [uniform per lod], lodCount, impostor }
// species: spruce sapling pine birch snag juniper snowbush log stump grass reed
// group: 'tree' (trunk and impostor), 'bush' (understory), 'ground' (streamed ground cover),
//        'deadwood' (logs and stumps), 'reed'
import { makeVegMaterial, makeDepthMaterial, lodUniform } from './materials.js';
import { buildSpruce, SPRUCE_VARIANTS, SAPLING_VARIANTS } from './spruce.js';
import { buildPine, PINE_VARIANTS } from './pine.js';
import { buildBirch, BIRCH_VARIANTS } from './birch.js';
import { buildSnag, SNAG_VARIANTS } from './snag.js';
import { buildJuniper, buildSnowBush, JUNIPER_VARIANTS, SNOWBUSH_VARIANTS } from './bushes.js';
import { buildLog, buildStump, LOG_VARIANTS, STUMP_VARIANTS } from './deadwood.js';
import { buildGrass, buildReed, GRASS_VARIANTS, REED_VARIANTS } from './ground.js';
import { birchAtlas } from './textures.js';

// builder(lod) returns { parts: [{ geometry, mode, ... }], height, radius, trunkR }
function makeKind(def, builder, lodCount) {
  const kind = {
    id: def.id, species: def.species, group: def.group || 'tree', impostor: !!def.impostor,
    height: 0, radius: 0, trunkR: 0, lods: [], lodU: [], lodCount, meta: def.variant || {},
    windType: def.windType || 'tree',
  };
  for (let l = 0; l < lodCount; l++) {
    const out = builder(l);
    kind.height = Math.max(kind.height, out.height);
    kind.radius = Math.max(kind.radius, out.radius);
    if (l === 0) kind.trunkR = out.trunkR ?? 0;
    const lu = lodUniform();
    kind.lodU.push(lu);
    const parts = out.parts.map((p) => {
      const wind = {
        type: def.windType || 'tree',
        strength: def.windStrength ?? 1,
        height: out.windHeight ?? Math.max(1.2, out.height),
      };
      const map = p.card ? birchAtlas() : undefined;
      const alphaTest = p.haze ? 0.03 : p.card ? 0.32 : 0;
      const material = makeVegMaterial({ mode: p.mode || 'foliage', wind, lod: lu, map, alphaTest, springColor: def.springColor, transparent: !!p.haze });
      const depth = makeDepthMaterial(wind, { map, alphaTest: p.haze ? 0.3 : alphaTest });
      return { geometry: p.geometry, material, depth, noShadow: !!p.noShadow, leaves: !!p.leaves, mode: p.mode || 'foliage', card: !!p.card, haze: !!p.haze };
    });
    kind.lods.push({ parts });
  }
  return kind;
}

const single = (o, mode) => ({ parts: [{ geometry: o.geometry, mode }], height: o.height, radius: o.radius, trunkR: o.trunkR, windHeight: o.windHeight });

export function createKinds() {
  const kinds = [];
  for (const v of SPRUCE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'spruce', impostor: true, variant: v }, (l) => single(buildSpruce(v, l), 'foliage'), 3));
  }
  for (const v of PINE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'pine', impostor: true, variant: v }, (l) => single(buildPine(v, l), 'foliage'), 3));
  }
  for (const v of BIRCH_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'birch', impostor: true, variant: v }, (l) => buildBirch(v, l), 3));
  }
  for (const v of SNAG_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'snag', impostor: true, variant: v }, (l) => single(buildSnag(v, l), 'bark'), 3));
  }
  for (const v of SAPLING_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'sapling', group: 'bush', variant: v }, (l) => single({ ...buildSpruce(v, l), trunkR: 0 }, 'foliage'), 2));
  }
  for (const v of JUNIPER_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'juniper', group: 'bush', variant: v }, (l) => single(buildJuniper(v, l), 'foliage'), 2));
  }
  for (const v of SNOWBUSH_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'snowbush', group: 'bush', variant: v }, (l) => single(buildSnowBush(v, l), 'bark'), 2));
  }
  for (const v of LOG_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'log', group: 'deadwood', variant: v, windStrength: 0 }, (l) => single(buildLog(v, l), 'bark'), 2));
  }
  for (const v of STUMP_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'stump', group: 'deadwood', variant: v, windStrength: 0 }, (l) => single(buildStump(v, l), 'bark'), 2));
  }
  for (const v of GRASS_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'grass', group: 'ground', variant: v, windType: 'grass', windStrength: 1.0 }, (l) => single(buildGrass(v, l), 'grass'), 2));
  }
  for (const v of REED_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'reed', group: 'reed', variant: v, windType: 'grass', windStrength: 0.8, springColor: 0x7a9a4a }, (l) => single(buildReed(v, l), 'grass'), 2));
  }
  return kinds;
}
