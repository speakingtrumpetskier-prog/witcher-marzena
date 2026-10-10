// Registry of every renderable vegetation "kind" (one geometry family with up to three LODs).
// Owner: vegetation builder. Pure: builds geometry and materials, never touches the scene.
//
// A kind: { id, species, group, height, radius, trunkR, lods: [{ parts: [{ geometry, material,
//           depth, noShadow, leaves }] }], lodU: [uniform per lod], lodCount, impostor }
// species: spruce sapling pine birch snag juniper snowbush log stump grass reed, plus larch oldspruce rowan
//          krummholz (common extras) and corkscrew oak weeping bottle knot ice arch (rare odd trees, see rare.js)
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
import { birchAtlas, needleAtlas } from './textures.js';
import { buildCork, CORK_VARIANTS } from './corkscrew.js';
import { buildOak, OAK_VARIANTS } from './oak.js';
import { buildWeeping, WEEP_VARIANTS } from './weeping.js';
import { buildBottle, BOTTLE_VARIANTS } from './bottle.js';
import { buildKnot, KNOT_VARIANTS } from './knot.js';
import { buildArch, ARCH_VARIANTS } from './archtree.js';
import { buildIce, ICE_VARIANTS } from './icetree.js';
import { buildLarch, LARCH_VARIANTS } from './larch.js';
import { buildRowan, ROWAN_VARIANTS } from './rowan.js';
import { buildOldSpruce, OLDSPRUCE_VARIANTS } from './oldspruce.js';
import { buildKrummholz, KRUMMHOLZ_VARIANTS } from './krummholz.js';
import { oddAtlas } from './oddAtlas.js';
import { makeBarkMaterial } from './oddMaterials.js';

// builder(lod) returns { parts: [{ geometry, mode, ... }], height, radius, trunkR }
function makeKind(def, builder, lodCount) {
  const kind = {
    id: def.id, species: def.species, group: def.group || 'tree', impostor: !!def.impostor,
    height: 0, radius: 0, trunkR: 0, lods: [], lodU: [], lodCount, meta: def.variant || {},
    windType: def.windType || 'tree',
    impLod: def.impLod || 0, // the LOD the far impostor is baked from
    colliders: null, // optional [{ x, z, r }] in local space: several trunk circles instead of one (arch, hollow oak)
  };
  for (let l = 0; l < lodCount; l++) {
    const out = builder(l);
    kind.height = Math.max(kind.height, out.height);
    kind.radius = Math.max(kind.radius, out.radius);
    if (l === 0) { kind.trunkR = out.trunkR ?? 0; kind.colliders = out.colliders || null; }
    const lu = lodUniform();
    kind.lodU.push(lu);
    const parts = out.parts.map((p) => {
      const wind = {
        type: def.windType || 'tree',
        strength: def.windStrength ?? 1,
        height: out.windHeight ?? Math.max(1.2, out.height),
      };
      const map = p.map || (p.tex === 'needle' ? needleAtlas() : p.card ? birchAtlas() : undefined);
      const alphaTest = p.haze ? 0.03 : p.tex === 'needle' ? 0.42 : p.card ? 0.32 : 0;
      // p.material(lodUniform, wind) builds a custom material (the ice tree's glaze) instead of the vegetation one
      const material = p.material ? p.material(lu, wind) : makeVegMaterial({ mode: p.mode || 'foliage', wind, lod: lu, map, alphaTest, springColor: def.springColor, transparent: !!p.haze });
      const depth = makeDepthMaterial(wind, { map, alphaTest: p.haze ? 0.3 : alphaTest });
      return { geometry: p.geometry, material, depth, noShadow: !!p.noShadow, leaves: !!p.leaves, mode: p.mode || 'foliage', card: !!p.card, haze: !!p.haze, tex: p.tex || null };
    });
    kind.lods.push({ parts });
  }
  return kind;
}

const single = (o, mode, tex = null) => ({ parts: [{ geometry: o.geometry, mode, tex }], height: o.height, radius: o.radius, trunkR: o.trunkR, windHeight: o.windHeight });
// Needle (or card) trees with one part per LOD: lod 0 textured through `map` (the needle atlas by default),
// lower LODs plain foliage. Solid wood in lod 0 points at the atlas' opaque texel (see the builders).
const needleTree = (build, v, map, texLods = 1) => (l) => {
  const o = build(v, l);
  return { parts: [{ geometry: o.geometry, mode: l < texLods ? 'needles' : 'foliage', tex: l < texLods ? 'needle' : null, map: l < texLods ? map : undefined }], height: o.height, radius: o.radius, trunkR: o.trunkR, windHeight: o.windHeight, colliders: o.colliders };
};
// Wood with the procedural fissured bark (oddMaterials.js) in every LOD, one part. Geometry must carry sweep uvs.
const barkTree = (build, v, opts = {}) => (l) => {
  const o = build(v, l);
  return { parts: [{ geometry: o.geometry, mode: 'bark', material: (lu, wind) => makeBarkMaterial(lu, wind, opts) }], height: o.height, radius: o.radius, trunkR: o.trunkR, windHeight: o.windHeight, colliders: o.colliders };
};

export function createKinds() {
  const kinds = [];
  for (const v of SPRUCE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'spruce', impostor: true, variant: v }, (l) => (l === 0 ? single(buildSpruce(v, l), 'needles', 'needle') : single(buildSpruce(v, l), 'foliage')), 3));
  }
  for (const v of PINE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'pine', impostor: true, variant: v }, (l) => (l === 0 ? single(buildPine(v, l), 'needles', 'needle') : single(buildPine(v, l), 'foliage')), 3));
  }
  for (const v of BIRCH_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'birch', impostor: true, variant: v }, (l) => buildBirch(v, l), 3));
  }
  for (const v of SNAG_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'snag', impostor: true, variant: v }, (l) => single(buildSnag(v, l), 'bark'), 3));
  }
  // Extra species. Draw calls scale with kinds x LODs x parts, so the new kinds have two LODs and hand over to
  // a second, nearer billboard layer (see Vegetation.js, kind.lodCount === 2), one variant each except the larch
  // (tall and wind-bent) and the corkscrew (living and dead). Only the ice tree keeps three LODs: its
  // translucent glaze has no impostor.
  // extra common species (placed through placement.js substitutions)
  for (const v of LARCH_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'larch', impostor: true, impLod: 1, variant: v }, needleTree(buildLarch, v, oddAtlas()), 2));
  }
  for (const v of OLDSPRUCE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'oldspruce', impostor: true, impLod: 1, variant: v }, needleTree(buildOldSpruce, v), 2));
  }
  for (const v of ROWAN_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'rowan', impostor: true, impLod: 1, variant: v }, needleTree(buildRowan, v, oddAtlas()), 2));
  }
  // rare and odd trees (placed by rare.js): one or a few of each, see the species files
  for (const v of CORK_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'corkscrew', impostor: true, impLod: 1, variant: v, windStrength: 0.8 }, needleTree(buildCork, v, undefined, 2), 2));
  }
  for (const v of OAK_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'oak', impostor: true, impLod: 1, variant: v, windStrength: 0.45 }, barkTree(buildOak, v, { lichen: 0.4 }), 2));
  }
  for (const v of WEEP_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'weeping', impostor: true, impLod: 1, variant: v, windStrength: 0.8 }, (l) => buildWeeping(v, l), 2));
  }
  for (const v of BOTTLE_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'bottle', impostor: true, impLod: 1, variant: v, windStrength: 0.9 }, barkTree(buildBottle, v, { lichen: 0.3 }), 2));
  }
  for (const v of KNOT_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'knot', impostor: true, impLod: 1, variant: v, windStrength: 0.6 }, barkTree(buildKnot, v, { lichen: 0.15 }), 2));
  }
  for (const v of ARCH_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'arch', impostor: true, impLod: 1, variant: v, windStrength: 0.5 }, (l) => buildArch(v, l), 2));
  }
  for (const v of ICE_VARIANTS) {
    // translucent glaze: no far impostor, the last LOD fades out instead
    kinds.push(makeKind({ id: v.id, species: 'ice', impostor: false, variant: v, windStrength: 0.6 }, (l) => buildIce(v, l), 3));
  }
  for (const v of SAPLING_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'sapling', group: 'bush', variant: v }, (l) => (l === 0 ? single({ ...buildSpruce(v, l), trunkR: 0 }, 'needles', 'needle') : single({ ...buildSpruce(v, l), trunkR: 0 }, 'foliage')), 2));
  }
  for (const v of KRUMMHOLZ_VARIANTS) {
    kinds.push(makeKind({ id: v.id, species: 'krummholz', group: 'bush', variant: v, windStrength: 0.5 }, needleTree(buildKrummholz, v, undefined, 2), 2));
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
