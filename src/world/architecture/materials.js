// Shared materials for the architecture kit. One instance of each, reused by every building,
// so the whole village costs a handful of shader programs.
//
//   woodIn / stoneIn  interior twins of wood and stone without snow dusting
//   wood     logs, boards, beams, shutters, carved boards (vertex colors tint and paint it)
//   shingle  roof shingles (slab tops and edges)
//   rock     monolithic stone: idols, menhirs, boulders
//   stone    foundations, chimneys, towers, idols
//   straw    thatch and loose hay
//   snow     the soft snow layers (own geometry), melts with uSnowCover via the snowBase attribute
//   ice      icicles and frozen collars, same melt
//   glow     windows: dark glass by day, warm emissive at dusk (uWindowLight)
//   ember    always-on hearth / forge glow (HDR vertex colors)
//   metal    iron bands, hinges, bell bronze
//   cloth    awnings, banners
//
// All use vertex colors. Snow and fog come from the global material patch (render/Materials.js);
// extra shader edits go through addCompileHook, never onBeforeCompile.
import * as THREE from 'three';
import { U } from '../../render/Uniforms.js';
import { addCompileHook } from '../../render/Materials.js';
import * as TEX from './textures.js';

let mats = null;

function melt(mat, key) {
  // Geometry carries `snowBase`: where each vertex sits when the snow is gone. uSnowCover pulls
  // the layer down onto the surface and then hides it, so the thaw ending melts roofs for free.
  addCompileHook(mat, key, (shader) => {
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 snowBase;\nuniform float uSnowCover;\nvarying float vMeltK;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat mzMelt = smoothstep(0.0, 0.5, uSnowCover);\nvMeltK = mzMelt;\ntransformed = mix(snowBase, transformed, mzMelt);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMeltK;')
      .replace('void main() {', 'void main() {\n  if (vMeltK < 0.03) discard;');
  });
}

export function getMaterials() {
  if (mats) return mats;
  const woodT = TEX.wood();
  const wood = new THREE.MeshStandardMaterial({
    map: woodT, bumpMap: woodT, bumpScale: 1.6, vertexColors: true, roughness: 0.93, metalness: 0,
  });
  wood.userData.snow = { amount: 0.75, threshold: 0.88 };

  // Interior twins: same look, no snow dusting (floors and furniture must stay clean).
  const woodIn = new THREE.MeshStandardMaterial({
    map: woodT, bumpMap: woodT, bumpScale: 1.6, vertexColors: true, roughness: 0.93, metalness: 0,
  });

  const shT = TEX.shingle();
  const shingle = new THREE.MeshStandardMaterial({
    map: shT, bumpMap: shT, bumpScale: 2.0, vertexColors: true, roughness: 0.95, metalness: 0,
  });
  shingle.userData.snow = { amount: 0.7, threshold: 0.55 };

  const rkT = TEX.rock();
  const rock = new THREE.MeshStandardMaterial({
    map: rkT, bumpMap: rkT, bumpScale: 2.2, vertexColors: true, roughness: 0.95, metalness: 0,
  });
  rock.userData.snow = { amount: 0.85, threshold: 0.6 };
  const rockIn = new THREE.MeshStandardMaterial({
    map: rkT, bumpMap: rkT, bumpScale: 2.2, vertexColors: true, roughness: 0.97, metalness: 0,
  });

  const stT = TEX.stone();
  const stone = new THREE.MeshStandardMaterial({
    map: stT, bumpMap: stT, bumpScale: 1.8, vertexColors: true, roughness: 0.96, metalness: 0,
  });
  stone.userData.snow = { amount: 0.85, threshold: 0.6 };

  const stoneIn = new THREE.MeshStandardMaterial({
    map: stT, bumpMap: stT, bumpScale: 3.0, vertexColors: true, roughness: 0.96, metalness: 0,
  });

  const straw = new THREE.MeshStandardMaterial({
    map: TEX.straw(), vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });

  const snow = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0,
    bumpMap: TEX.snowBump(), bumpScale: 0.6,
    emissive: 0x2a3550, emissiveIntensity: 0.12,
  });
  melt(snow, 'arch-melt-snow');

  const ice = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.16, metalness: 0.05,
    emissive: 0x23455a, emissiveIntensity: 0.18,
  });
  melt(ice, 'arch-melt-ice');

  const glow = new THREE.MeshStandardMaterial({
    map: TEX.glassTex(), vertexColors: true, roughness: 0.22, metalness: 0.1,
    emissive: 0xffffff, emissiveMap: TEX.glowTex(), emissiveIntensity: 2.4,
  });
  addCompileHook(glow, 'arch-window', (shader) => {
    shader.uniforms.uWindowLight = U.uWindowLight;
    shader.uniforms.uTime = U.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWindowLight;\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // At night (uWindowLight near 1) the panes get brighter still, enough to pass the bloom
        // threshold, so lit windows glow into the dark instead of reading as flat warm squares.
        float mzNight = 1.0 + 2.5 * uWindowLight * uWindowLight;
        #ifdef USE_COLOR
          float mzFl = 0.93 + 0.07 * sin(uTime * 7.0 + vColor.g * 40.0) * sin(uTime * 3.1 + vColor.r * 25.0);
          totalEmissiveRadiance *= vColor.rgb * mzFl * (0.05 + 0.95 * uWindowLight) * mzNight;
        #else
          totalEmissiveRadiance *= (0.05 + 0.95 * uWindowLight) * mzNight;
        #endif`);
  });

  const ember = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  addCompileHook(ember, 'arch-ember', (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.9 + 0.1 * sin(uTime * 9.0 + gl_FragCoord.x * 0.02) * sin(uTime * 5.3);`);
  });

  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.5 });

  const cloth = new THREE.MeshStandardMaterial({
    map: TEX.cloth(), vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });

  mats = { wood, woodIn, shingle, stone, stoneIn, rock, rockIn, straw, snow, ice, glow, ember, metal, cloth };
  return mats;
}

// Which materials receive shadows / cast them.
export const CASTS = { rock: true, rockIn: true, wood: true, woodIn: true, stoneIn: true, shingle: true, stone: true, straw: true, snow: false, ice: false, glow: false, ember: false, metal: true, cloth: true };
