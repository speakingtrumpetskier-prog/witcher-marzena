// The frozen mill (LOC.mill): the kit mill on the river bank with its frozen wheel and flume, the miller family's
// yard in front of it: woodpile and chopping block, a dog kennel with a broken chain and an empty bowl (the wolves
// took the dog), frozen washing, a washtub, sacks, a handcart, a split-rail fence with a gap for the path, the
// children's snowman and toys, a brazier by the door, chimney smoke, a lit lantern at night. Registers the
// NPC stations for Gniewko, Bozena and the two children.
//
// G.world.locations.mill:
//   placed, door, wheel, flume, yard (center), kennel, brokenChain, brazier, snowman, stations[ids], fire
// Stations (G.world.stations): mill_miller_work, mill_miller_talk, mill_wife_work, mill_wife_door, mill_kid_a_play,
//   mill_kid_b_play, mill_kid_sit, mill_night_miller, mill_night_wife, mill_night_kids (indoor, hidden)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf, rot2 } from './compose.js';
import { brokenChain } from './objects2.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.mill;
  const rnd = rngOf(362);
  W.clear(L.x, L.z, 18);
  const O = { x: L.x - 5, z: L.z + 2 };
  const yaw = 0.55;
  const b = buildings.mill({ seed: 311 });
  // the kit footprint spans wheel and flume, so snapping would raise the whole mill and wall it in: set the floor from the
  // building body only (terrain under the stone base, which reaches a metre below the floor)
  let yMax = -1e9;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const [dx, dz] = rot2(i * 1.7, j * 2.1, yaw);
    yMax = Math.max(yMax, G.world.heightAt(O.x + dx, O.z + dz));
  }
  const p = placeBuilding(G, b, O.x, O.z, yaw, { snap: false, y: yMax + 0.25, foundation: false, skirt: false, tag: 'mill' });
  for (const l of p.lights) W.light(l);
  const A = p.anchors;
  const P = (lx, lz) => { const [dx, dz] = rot2(lx, lz, yaw); return { x: O.x + dx, z: O.z + dz }; };
  const face = (lx, lz, tx, tz) => { const a = P(lx, lz), t = P(tx, tz); return Math.atan2(t.x - a.x, t.z - a.z); };

  // chimney smoke
  W.smoke([A.smoke.x, A.smoke.y, A.smoke.z], { height: 30, rate: 2.2 });

  const c = new Composer(G, W.ctx, 'mill', O.x, O.z, { seed: 36 });
  const wp = P(-6.4, 8.6);
  c.prop('woodpile', wp.x, wp.z, { seed: 2, yaw: yaw + Math.PI / 2 });
  const cb = P(-3.4, 9.2);
  c.prop('choppingBlock', cb.x, cb.z, { seed: 2, yaw: yaw + 0.5 });
  c.prop('firewoodStack', P(-7.6, 11.2).x, P(-7.6, 11.2).z, { seed: 1, yaw: yaw + Math.PI / 2 });
  // the kennel with the broken chain and the empty bowl
  const kn = P(5.2, 8.8);
  c.prop('dogKennel', kn.x, kn.z, { seed: 1, yaw: yaw + 0.2 });
  const ch = P(4.0, 9.8);
  c.at(ch.x, ch.z, { yaw: yaw + 2.6 }, (k) => brokenChain(k));
  // washing and the tub
  const lt = P(2.0, 12.6);
  c.prop('laundryLine', lt.x, lt.z, { seed: 2, yaw: yaw + 0.1, opts: { length: 3.6 } });
  const tub = P(-1.3, 11.4);
  c.prop('washTub', tub.x, tub.z, { seed: 1, yaw: yaw + 0.8 });
  // sacks at the door, a handcart, barrels
  c.prop('sack', P(-2.0, 5.6).x, P(-2.0, 5.6).z, { seed: 1, yaw: 0.4 });
  c.prop('sack', P(1.8, 5.3).x, P(1.8, 5.3).z, { seed: 2, yaw: 2.0 });
  c.prop('sack', P(2.4, 5.9).x, P(2.4, 5.9).z, { seed: 3, yaw: 1.0 });
  c.prop('cart', P(8.6, 6.2).x, P(8.6, 6.2).z, { seed: 2, yaw: yaw + 1.7, opts: { variant: 'sacks' } });
  c.prop('barrelStack', P(-8.4, 4.0).x, P(-8.4, 4.0).z, { seed: 1, yaw: yaw + 0.2 });
  // the children: a snowman with a carrot-less face, toys, a small sled
  const sn = P(7.0, 11.8);
  c.prop('snowman', sn.x, sn.z, { seed: 2, yaw: yaw + 3.3 });
  c.prop('toys', P(-4.8, 12.2).x, P(-4.8, 12.2).z, { seed: 1, yaw: 0.6 });
  c.prop('sled', P(4.4, 13.4).x, P(4.4, 13.4).z, { seed: 1, yaw: yaw + 0.4, opts: { variant: 'kid' } });
  // a brazier by the door where the family warms their hands, and a lantern on a post
  const br = P(3.2, 5.8);
  const brh = c.prop('brazier', br.x, br.z, { seed: 1, opts: { variant: 'low' } });
  const lnp = P(-3.4, 5.0);
  const lnh = c.prop('lantern', lnp.x, lnp.z, { seed: 1, opts: { mount: 'post' } });
  c.build();
  if (brh.anchors.fire) {
    W.fx?.fire?.({ position: [brh.anchors.fire.x, brh.anchors.fire.y, brh.anchors.fire.z], parent: G.scene, scale: 0.7, light: true, smoke: false });
    W.fire(br.x, br.z, 6);
  }
  if (lnh.anchors.light) {
    W.fx?.glow?.({ position: [lnh.anchors.light.x, lnh.anchors.light.y, lnh.anchors.light.z], parent: G.scene, size: 0.9, color: [1.0, 0.6, 0.25], strength: 0.7 });
    W.light({ x: lnh.anchors.light.x, y: lnh.anchors.light.y, z: lnh.anchors.light.z, color: 0xffa860, intensity: 0.9, radius: 8, kind: 'lantern' });
  }

  // split-rail fence round the yard, with a gap on the south side for the path and a gate gap east
  const fenceA = [P(-9.4, 4.0), P(-9.4, 15.0), P(-1.8, 15.2)].map((q) => [q.x, q.z]);
  const fenceB = [P(1.8, 15.2), P(9.4, 15.0), P(9.4, 9.0)].map((q) => [q.x, q.z]);
  for (const pts of [fenceA, fenceB]) {
    const f = buildings.fence({ points: pts, style: 'rail', heightAt: (x, z) => G.world.heightAt(x, z), seed: 111 + pts.length });
    placeBuilding(G, f, 0, 0, 0, { snap: false, y: 0, foundation: false, skirt: false, tag: 'millFence' });
  }

  // ---- NPC stations ---------------------------------------------------------------------------------------
  const st = (id, lx, lz, tx, tz, anim, kind, extra = {}) => {
    const q = P(lx, lz);
    W.station(id, { x: q.x, z: q.z, yaw: face(lx, lz, tx, tz), anim, kind, ...extra });
  };
  st('mill_miller_work', -3.4, 10.2, -3.4, 9.2, 'chop_wood', 'work');
  st('mill_miller_talk', 0.8, 7.6, 0.8, 12, 'cross_arms', 'talk');
  st('mill_wife_work', -1.3, 12.4, -1.3, 11.4, 'stir', 'work');
  st('mill_wife_door', 1.0, 6.2, 1.0, 10, 'sweep', 'work');
  st('mill_kid_a_play', 6.2, 10.6, 7.0, 11.8, 'child_play', 'wander');
  st('mill_kid_b_play', 5.0, 12.4, 6.2, 10.6, 'throw_snowball', 'wander');
  st('mill_kid_sit', -4.6, 13.0, -4.8, 12.2, 'sit_ground', 'sit');
  st('mill_night_miller', -0.6, 4.6, -0.6, 8, 'idle', 'bed', { indoor: true, hidden: true });
  st('mill_night_wife', -0.2, 4.6, -0.2, 8, 'idle', 'bed', { indoor: true, hidden: true });
  st('mill_night_kids', 0.4, 4.6, 0.4, 8, 'idle', 'bed', { indoor: true, hidden: true });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const yc = P(0.5, 9.5);
  W.loc('mill', {
    id: 'mill',
    placed: p,
    door: A.door.clone(),
    wheel: A.wheel.clone(),
    flume: A.flume.clone(),
    waterwheel: p.objects?.waterwheel || null,
    yard: v(yc.x, G.world.heightAt(yc.x, yc.z), yc.z),
    kennel: v(kn.x, G.world.heightAt(kn.x, kn.z), kn.z),
    brokenChain: v(ch.x, G.world.heightAt(ch.x, ch.z), ch.z),
    brazier: v(br.x, G.world.heightAt(br.x, br.z), br.z),
    snowman: v(sn.x, G.world.heightAt(sn.x, sn.z), sn.z),
    fire: v(br.x, G.world.heightAt(br.x, br.z), br.z),
    stations: ['mill_miller_work', 'mill_miller_talk', 'mill_wife_work', 'mill_wife_door', 'mill_kid_a_play', 'mill_kid_b_play', 'mill_kid_sit', 'mill_night_miller', 'mill_night_wife', 'mill_night_kids'],
  });
  void rnd;

  // the falls: den and ice cave live in waterfall.js
  try {
    const mod = await import('./waterfall.js');
    await mod.build(W);
  } catch (e) {
    console.error('[wilderness waterfall]', e);
    G.errors.push(`wilderness waterfall: ${e.message}`);
  }
}
