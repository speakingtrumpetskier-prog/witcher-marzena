// Idol hill (LOC.idol): the kit's four-faced idol on the summit, with offerings at its base (bread, bowls of
// frozen milk, candle stubs, ribbons on staked poles, a few old effigy heads left on stakes), cairns along the
// last stretch of the path where every pilgrim adds a stone, and a log to sit on facing the lake: the best
// sunset view in the valley.
//
// G.world.locations.idol:
//   placed, base, top, faces[4], offerings[], seat { x, y, z, yaw } (sit here), vista { cam, look } (camera spot over the lake),
//   cairns[], approach (end of the idol path), candles[]
import * as THREE from 'three';
import { LOC, LAKE } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf } from './compose.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.idol;
  const rnd = rngOf(200);
  W.clear(L.x, L.z, 16);
  const b = buildings.idol({ seed: 31 });
  const p = placeBuilding(G, b, L.x, L.z, 0, { foundation: true, skirt: true, tag: 'idol' });
  for (const l of p.lights) W.light(l);
  const A = p.anchors;

  const c = new Composer(G, W.ctx, 'idol', L.x, L.z, { seed: 20 });
  // extra offerings on the stone apron south and east of the plinth
  const offers = [], candles = [];
  const kinds = ['bread', 'bowl', 'candle', 'bowl', 'candle', 'bread', 'bowl', 'candle'];
  kinds.forEach((v, i) => {
    const a = -1.5 + i * 0.5 + rnd.signed(0.1), r = 3.9 + rnd.range(0, 1.6);
    const x = L.x + Math.sin(a) * r, z = L.z + Math.cos(a) * r;
    const h = c.prop('offering', x, z, { seed: i + 4, yaw: rnd.range(0, 6.28), opts: { variant: v }, collide: false });
    offers.push(new THREE.Vector3(x, h.y + 0.1, z));
    if (v === 'candle' && h.anchors.flame && i % 2 === 0) candles.push(h.anchors.flame.clone());
  });
  // staked ribbon poles on both sides of the approach, a cairn at each
  const cairns = [];
  for (const [dx, dz] of [[-8.5, 5.5], [-6.5, 9.5], [4.5, 8.5], [-2.0, 11.5]]) {
    const x = L.x + dx, z = L.z + dz;
    c.prop('ribbonPole', x, z, { seed: cairns.length + 5, opts: { height: 2.4, ribbons: 7 }, yaw: rnd.range(0, 6.28) });
    cairns.push(new THREE.Vector3(x, G.world.heightAt(x, z), z));
  }
  // old effigy heads left on stakes, white with frost
  for (const [dx, dz, s] of [[2.8, 4.6, 1], [4.4, 3.6, 2], [-3.4, 4.2, 3]]) c.prop('effigyHead', L.x + dx, L.z + dz, { seed: s, yaw: 0.4 + s, opts: { variant: 'frozen' } });
  // a ring of pilgrims' stones round the plinth
  c.at(L.x, L.z, { y: G.world.heightAt(L.x, L.z) }, (k) => {
    for (let i = 0; i < 20; i++) {
      const a = rnd.range(0, 6.28), r = rnd.range(5.4, 7.4);
      const s = rnd.range(0.12, 0.28);
      k.blob('stone', s, { pos: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r], scale: [1.3, 0.55, 1.0], rot: [0, rnd.range(0, 6.28), 0], detail: 1, tint: rnd.pick([0xb0aaa4, 0x9a948e, 0xc0bab2]), flat: true });
    }
  });

  // the log seat: facing the lake (north-north-west), the idol at its back
  const lakeDir = { x: LAKE.x - L.x, z: LAKE.z - L.z };
  const ll = Math.hypot(lakeDir.x, lakeDir.z);
  const ld = { x: lakeDir.x / ll, z: lakeDir.z / ll };
  const sx = L.x + ld.x * 8.2 + 1.6, sz = L.z + ld.z * 8.2 - 0.6;
  const seatYaw = Math.atan2(ld.x, ld.z); // +z faces the lake
  const sy = G.world.heightAt(sx, sz);
  c.at(sx, sz, { yaw: seatYaw + Math.PI / 2 }, (k) => {
    k.log(0.3, 2.6, { lie: 'x', pos: [0, 0.34, 0], radial: 10, tint: 0xb8aea0, jitter: 0.03 });
    for (const x of [-0.9, 0.9]) k.blob('stone', 0.3, { pos: [x, 0.1, 0.0], scale: [0.9, 0.5, 1.2], detail: 1, tint: 0x9a948e, flat: true });
    k.mound(2.2, 0.1, 0.5, { pos: [0, 0.62, 0], jseed: 3 });
    k.blob('fur', 0.28, { pos: [0.3, 0.64, 0.0], scale: [1.6, 0.18, 1.0], detail: 1, tint: 0xc8bba8 }); // a sheepskin someone left
  });
  c.build();
  for (const f of candles) W.fx?.candle?.({ position: [f.x, f.y, f.z], parent: G.scene, light: false });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const seatPos = v(sx, sy + 0.62, sz);
  W.loc('idol', {
    id: 'idol',
    placed: p,
    base: A.base.clone(),
    top: A.top.clone(),
    faces: [A.face0.clone(), A.face1.clone(), A.face2.clone(), A.face3.clone()],
    offerings: offers,
    offeringsAnchor: A.offerings.clone(),
    candles,
    seat: { x: sx, y: seatPos.y, z: sz, yaw: seatYaw }, // sit here (Sit interaction); faces the lake
    vista: { cam: v(sx, seatPos.y + 0.9, sz), look: v(LAKE.x + 20, 4, LAKE.z - 10) }, // sunset view
    cairns,
    approach: v(L.x - 20, G.world.heightAt(L.x - 20, L.z + 16), L.z + 16),
  });
}
