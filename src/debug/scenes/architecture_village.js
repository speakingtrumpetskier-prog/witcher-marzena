// In-context check of the architecture kit on the real terrain: a rough village around the square
// plus the landmarks, placed with placeBuilding (terrain snapping, foundations, snow skirts).
// This is NOT the village layout (a later builder composes that); it only proves the kit in place.
//
//   ?scene=architecture_village&cam=0,14,175&look=0,5,100&hour=16
//   &set=village|landmarks|all (default village)
import * as THREE from 'three';
import { buildings } from '../../world/architecture/index.js';
import { placeBuilding } from '../../world/architecture/place.js';
import { LOC } from '../../world/layout.js';

export const modules = ['atmosphere', 'sky', 'terrain', 'water', 'weather', 'postfx'];
export const needsWorld = true;

export async function init(G) {
  const set = G.params.get('set') || 'village';
  const placed = [];
  const put = (id, b, x, z, yaw = 0, o = {}) => {
    try {
      placed.push({ id, p: placeBuilding(G, b, x, z, yaw, o) });
    } catch (e) {
      console.error(`[architecture_village] ${id}: ${e.stack || e.message}`);
      G.errors.push(`architecture_village ${id}: ${e.message}`);
    }
  };
  const B = buildings;
  const t0 = performance.now();

  if (set === 'village' || set === 'all') {
    put('longhouse', B.longhouse({ seed: 9 }), LOC.longhouse.x, LOC.longhouse.z, 0);
    put('tavern', B.tavern({ seed: 5 }), LOC.tavern.x, LOC.tavern.z, Math.PI / 2);
    put('smithy', B.smithy({ seed: 21 }), LOC.smithy.x, LOC.smithy.z, -Math.PI / 2);
    put('shrine', B.shrine({ seed: 41 }), LOC.shrine.x, LOC.shrine.z, 0);
    put('workshop', B.workshop({ seed: 17 }), LOC.dobra.x, LOC.dobra.z, Math.PI / 2);
    put('hanka', B.hankaHouse({ seed: 61 }), LOC.hanka.x, LOC.hanka.z, -Math.PI / 2);
    put('banya', B.banya({ seed: 15 }), LOC.banya.x, LOC.banya.z, Math.PI);
    // Houses around the square, each a different variant.
    const houses = [
      [-14, 104, 0.25, { size: 'small', porch: false }], [-22, 142, Math.PI / 2 + 0.2, { porch: true }], [22, 148, -0.3, { floors: 2, size: 'large', woodshed: true }],
      [48, 104, -1.1, { porch: true }], [-58, 102, 1.3, {}], [62, 132, -1.4, { size: 'small' }], [-64, 126, 1.5, { porch: true }],
      [-6, 190, 3.0, {}], [12, 172, 3.2, { size: 'small' }], [-44, 160, 1.9, { porch: true }],
    ];
    houses.forEach(([x, z, yaw, o], i) => put(`house${i}`, B.logHouse({ seed: 100 + i, ...o }), x, z, yaw));
    put('granary', B.granary({ seed: 3 }), -78, 112, 0.5);
    put('barn', B.barn({ seed: 4 }), 78, 150, -1.2);
    put('stable', B.stable({ seed: 6 }), 54, 168, -1.5);
    put('well', B.well({ seed: 81 }), 0, 118, 0, {});
    put('notice', B.noticeBoard({ seed: 91 }), 6, 124, Math.PI);
    put('stall1', B.marketStall({ seed: 101 }), -9, 112, 0.2);
    put('stall2', B.marketStall({ seed: 103 }), 10, 110, -0.1);
    put('outhouse', B.outhouse({ seed: 12 }), 30, 150, -0.5);
    // Shore: fishing huts and a boathouse half over the ice.
    for (const [x, z, yaw] of [[-70, 58, 0.2], [-30, 52, -0.1], [20, 54, 0.15]]) put(`fish${x}`, B.fishingHut({ seed: 300 + x }), x, z, yaw + Math.PI);
    put('boathouse', B.boathouse({ seed: 14 }), 52, 56, Math.PI);
    put('graveS', B.gravePost({ seed: 61, variant: 'wiesia' }), 92, 163, 0.3);
    put('graveB', B.gravePost({ seed: 62, variant: 'son' }), 98, 166, 0.2);
    put('graveC', B.gravePost({ seed: 63 }), 95, 171, -0.2);
    // West gate with palisade and a fence.
    put('gate', B.gate({ seed: 131 }), LOC.westGate.x, LOC.westGate.z, 1.95);
    const pal = (pts) => B.palisade({ seed: 7, points: pts, heightAt: (x, z) => G.world.heightAt(x, z) });
    put('pal1', pal([[-92, 112], [-90, 120], [-89, 125]]), 0, 0, 0, { snap: false, y: 0 });
    put('pal2', pal([[-84, 135], [-82, 142], [-80, 152]]), 0, 0, 0, { snap: false, y: 0 });
    const fn = (pts, style) => B.fence({ seed: 5, points: pts, style, heightAt: (x, z) => G.world.heightAt(x, z) });
    put('fence1', fn([[-30, 100], [-24, 98], [-16, 96]], 'wattle'), 0, 0, 0, { snap: false, y: 0 });
    put('fence2', fn([[24, 160], [36, 166], [46, 163]], 'rail'), 0, 0, 0, { snap: false, y: 0 });
    put('walk', B.boardwalk({ seed: 141, points: [[-40, 64], [-20, 62], [0, 60], [20, 62]], heightAt: (x, z) => G.world.heightAt(x, z), rails: true }), 0, 0, 0, { snap: false, y: 0 });
  }
  if (set === 'landmarks' || set === 'all') {
    put('idol', B.idol({ seed: 31 }), LOC.idol.x, LOC.idol.z, 0);
    put('bell', B.bellTower({ seed: 77 }), LOC.bellTower.x, LOC.bellTower.z, 0.4, { snap: false, y: 0, foundation: false, skirt: false });
    put('mill', B.mill({ seed: 311 }), LOC.mill.x, LOC.mill.z, Math.PI);
    put('watch', B.watchtowerRuin({ seed: 201 }), LOC.watchtower.x, LOC.watchtower.z, 0.6);
    put('circle', B.stoneCircle({ seed: 71 }), LOC.island.x, LOC.island.z, 0);
    put('trapper', B.trapperCabin({ seed: 211 }), LOC.hunterCabin.x, LOC.hunterCabin.z, 0.8);
    put('bath', B.ruinedBathhouse({ seed: 221 }), LOC.hotSpring.x, LOC.hotSpring.z, 0.2);
    put('kiln', B.charcoalKiln({ seed: 231 }), LOC.charcoal.x, LOC.charcoal.z, 0.3);
    put('wayside', B.waysideShrine({ seed: 51 }), LOC.crossroads.x + 5, LOC.crossroads.z + 4, 0.5);
  }
  console.log('[architecture village]', `${(performance.now() - t0).toFixed(0)}ms, ${placed.length} placed`);
  G.architecturePlaced = placed;
  // Make the sun and lights see the buildings from the start.
  G.scene.traverse((o) => { if (o.isMesh && o.castShadow) o.frustumCulled = true; });
  void THREE;
}
