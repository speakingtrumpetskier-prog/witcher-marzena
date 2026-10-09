// Assembles a character from a resolved spec: skeleton, merged skinned geometry (body,
// garments, head, hair, accessories), face texture and the single material.
// Returns { mesh, rig, material, faceTex, info, extra } (extra = separate attachables like swords).
import * as THREE from 'three';
import { measure, buildSkeleton } from './rig.js';
import { MeshBuilder } from './geom.js';
import { faceParams, buildHead, buildNeck, paintFace } from './head.js';
import { makeFaceCanvas, faceTexture } from './textures.js';
import { createCharacterMaterial, createFloatDepthMaterial } from './material.js';
import { buildBody } from './body.js';
import { buildHair } from './hair.js';
import { col } from './util.js';

export function buildCharacter(spec) {
  const M = measure(spec.body || {});
  const look = resolveLook(spec, M);
  const rigOpts = { ...look.rigOpts };
  const rig = buildSkeleton(M, rigOpts);
  const mb = new MeshBuilder(rig.index);
  const FP = faceParams(spec, M);
  look.FP = FP;
  const tri = {};
  let i0 = 0;
  const mark = (k) => { tri[k] = (mb.I.length - i0) / 3; i0 = mb.I.length; };
  const info = buildHead(mb, rig, FP, look);
  mark('head');
  buildNeck(mb, rig, look);
  mark('neck');
  const extra = {};
  if (!look.headOnly) {
    buildHair(mb, rig, look, info);
    mark('hair');
    buildBody(mb, rig, look, extra);
    mark('body');
  }
  tri.total = mb.I.length / 3;
  const geometry = mb.build();
  smoothGridNormals(geometry, info.grid, info.slitRow);
  const size = look.faceRes;
  const canvas = makeFaceCanvas(size);
  canvas.height = Math.round(size * 1.25);
  paintFace(canvas, info, FP, look);
  const faceTex = faceTexture(canvas);
  const material = createCharacterMaterial({
    faceTex,
    ghost: !!look.ghost,
    rim: look.rim || null,
    glow: look.glow ? col(look.glow) : null,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = spec.id || 'character';
  mesh.add(rig.bones[0]);
  mesh.bind(rig.skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Static bounds (never recomputed per frame): generous sphere around the body.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, M.H * 0.5, 0), M.H * 0.9);
  if (look.ghost) mesh.customDepthMaterial = createFloatDepthMaterial();
  return { mesh, rig, material, faceTex, info, extra, look, M, FP, canvas, tri };
}

// Fills defaults: skin, hair, resolution, and the rig options garments need.
function resolveLook(spec, M) {
  const look = {
    ...spec,
    seed: spec.seed ?? 1,
    skin: spec.skin || spec.face?.skin || '#d8ae94',
    hair: spec.hair || { style: 'short', color: '#4a3a2c' },
    headRes: spec.headRes || 'high',
    faceRes: spec.faceRes || (spec.headRes === 'low' ? 256 : 512),
    ghost: !!spec.ghost,
    rigOpts: {},
  };
  const outfit = spec.outfit || {};
  // Skirts and long coats get spring chains around the hips.
  const lower = outfit.coat?.length ?? 0;
  const skirtLen = Math.max(lower, outfit.skirt?.length ?? 0, outfit.dress?.length ?? 0);
  if (skirtLen > 0.25) {
    look.rigOpts.skirt = 8;
    look.rigOpts.skirtLen = (M.hipJY + 0.03 * M.k) * skirtLen;
  }
  if (look.hair.style === 'braid' || look.hair.braid) {
    const k = M.headK;
    look.rigOpts.braid = 5;
    look.rigOpts.braidStart = new THREE.Vector3(0, 0.035 * k, -0.095 * k);
    look.rigOpts.braidSeg = (look.hair.braidLen || 0.42) * M.k / 5;
  }
  if (outfit.cape) {
    look.rigOpts.cape = { cols: 3, len: outfit.cape.length * M.H * 0.55, top: M.shoulderY + 0.01, width: M.shoulderX * 0.7, depth: M.chestD * 1.2 };
  }
  if (outfit.swords) look.rigOpts.sheaths = true;
  if (look.hair.style === 'pigtails') {
    const k = M.headK;
    const hp = (x) => new THREE.Vector3(x * 0.072 * k, M.headPivotY + 0.035 * k, -0.035 * k);
    look.rigOpts.tails = [
      { name: 'pigL', parent: 'head', at: hp(1), len: 0.16 * M.k },
      { name: 'pigR', parent: 'head', at: hp(-1), len: 0.16 * M.k },
    ];
  }
  const hatT = spec.hat?.type;
  if (hatT === 'scarf' || hatT === 'kerchief' || hatT === 'hood' || (hatT === 'knit' && (spec.hat.low ?? 1) > 0.5)) look.hideEars = true;
  return look;
}

// Soften faceting on the head grid: average each normal with its grid neighbours (twice).
function smoothGridNormals(geo, grid, slit) {
  const na = geo.attributes.normal.array;
  const rows = grid.length, cols = grid[0].length;
  for (let it = 0; it < 2; it++) {
    const next = new Float32Array(na.length);
    next.set(na);
    for (let i = 1; i < rows - 1; i++) {
      if (Math.abs(i - slit) <= 1) continue;
      for (let j = 0; j < cols; j++) {
        const v = grid[i][j];
        let x = na[v * 3] * 2, y = na[v * 3 + 1] * 2, z = na[v * 3 + 2] * 2;
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const jj = (j + dj + cols - 1) % (cols - 1);
          const w = grid[i + di][dj === 0 ? j : jj];
          x += na[w * 3]; y += na[w * 3 + 1]; z += na[w * 3 + 2];
        }
        const l = Math.hypot(x, y, z) || 1;
        next[v * 3] = x / l; next[v * 3 + 1] = y / l; next[v * 3 + 2] = z / l;
      }
    }
    na.set(next);
  }
}
