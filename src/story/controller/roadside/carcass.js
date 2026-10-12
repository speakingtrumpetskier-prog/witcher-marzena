// Wolves at a kill (side_carcass, "Wolves on the Forest Track"). At dusk three wolves stand over a roe deer in an open patch
// eighteen metres off the forest track. They are not looking for her: with the sword sheathed they leave her alone beyond
// eleven metres (the track is eighteen), and a drawn blade or a step closer wakes them. Go round, or fight. The deer, the blood
// on the snow, the drag marks and the wolf tracks stay for good once she has seen them; if the wolves are killed they do not
// come back, and crows are on the kill in daylight from then on.
//
//   where   the forest track, arc 190, east side (the sledge vignette is on the other side at 176)
//   when    15:00 to 19:50, any weather but a blizzard, until the wolves are dead (flag carcass_wolves_dead)
//   flags   carcass_seen (the kill exists), carcass_said (her remark), carcass_wolves_dead
//   state   C.roadside.carcass { spot, zone, crows }
import * as THREE from 'three';
import { deerKill } from './things.js';
import { groundPatch, groundRibbon, tex } from '../../../world/locations/wilderness/decals.js';

const ARC = 190, OFF = -18, DUSK = [15.0, 19.8], DAY = [7.0, 19.0];

export function install(C, K) {
  const { G } = C;
  const rd = K.road('forest', ARC, OFF);
  const spot = K.openSpot(rd.x, rd.z, { rad: 4.5, maxR: 22 });
  const base = K.road('forest', ARC, 0);
  const toRoad = Math.atan2(base.x - spot.x, base.z - spot.z);
  const yaw = toRoad + 1.35;
  G.vegetation?.clearArea?.(spot.x, spot.z, 7);
  const st = { spot, yaw, zone: null, crows: null };
  C.roadside.carcass = st;

  // ---- what stays: the deer, the blood, the drag and the tracks ---------------------------------------
  const syncKill = K.persist(() => C.has('carcass_seen'), () => {
    const g = new THREE.Group();
    g.name = 'rs_carcass';
    const deer = deerKill({ seed: 4 });
    K.settle(deer, spot.x, spot.z, yaw, 2.4, 1.0);
    g.add(deer);
    const fx = Math.sin(toRoad), fz = Math.cos(toRoad), sx = Math.cos(toRoad), sz = -Math.sin(toRoad);
    // blood on the snow under and beside it
    g.add(groundPatch(G, { x: spot.x + sx * 0.5, z: spot.z + sz * 0.5, w: 3.6, d: 3.2, yaw, map: tex.blob('blood', { r: 118, g: 26, b: 22, a: 0.9, seed: 6, solid: 0.5, ragged: 1.2 }), lift: 0.03, order: 4, name: 'blood' }));
    g.add(groundPatch(G, { x: spot.x + fx * 2.6, z: spot.z + fz * 2.6, w: 1.6, d: 1.4, yaw: yaw + 0.8, map: tex.blob('blood', { r: 118, g: 26, b: 22, a: 0.9, seed: 6, solid: 0.5, ragged: 1.2 }), lift: 0.03, order: 4, name: 'blood2' }));
    // where it was dragged from, toward the track, and the wolf tracks that came out of the trees for it
    g.add(groundRibbon(G, { pts: [[spot.x + fx * 15, spot.z + fz * 15], [spot.x + fx * 9 + sx * 1.2, spot.z + fz * 9 + sz * 1.2], [spot.x + fx * 3, spot.z + fz * 3]], width: 0.9, map: tex.drag(5), repeat: 6, lift: 0.03, opacity: 0.85, order: 4, name: 'killDrag' }));
    g.add(groundRibbon(G, { pts: [[spot.x - fx * 16 + sx * 3, spot.z - fz * 16 + sz * 3], [spot.x - fx * 8 + sx * 1.5, spot.z - fz * 8 + sz * 1.5], [spot.x - fx * 2, spot.z - fz * 2]], width: 1.1, map: tex.tracks('wolf', 9), repeat: 6, lift: 0.03, opacity: 0.8, order: 4, name: 'killTracks' }));
    g.add(groundRibbon(G, { pts: [[spot.x - fx * 14 - sx * 4, spot.z - fz * 14 - sz * 4], [spot.x - fx * 7 - sx * 2, spot.z - fz * 7 - sz * 2], [spot.x - sx * 2.5, spot.z - sz * 2.5]], width: 1.1, map: tex.tracks('wolf', 12), repeat: 6, lift: 0.03, opacity: 0.8, order: 4, name: 'killTracks2' }));
    return { obj: g, own: false };
  }, ['carcass_seen']);
  C.interact({
    id: 'carcass', pos: C.at(spot.x, spot.z, 0.5), radius: 2.7, verb: 'Examine', label: 'Roe deer',
    enabled: () => C.has('carcass_seen'),
    onUse: async () => {
      K.say(C.has('carcass_wolves_dead') ? 'A roe deer. Not much left of it.' : 'Roe deer. They pulled it down this morning.', 3.4);
    },
  });

  // ---- the wolves, at dusk ---------------------------------------------------------------------------
  const live = () => !C.has('carcass_wolves_dead') && C.hour() >= DUSK[0] && C.hour() < DUSK[1] && G.weather?.state !== 'blizzard';
  st.zone = K.zone({
    id: 'carcass', x: spot.x, z: spot.z, r: 90, enabled: live,
    build(bag) {
      if (!G.creatures) return;
      if (!C.has('carcass_seen')) { C.set('carcass_seen'); syncKill(); }
      const pack = G.creatures.spawnWolves(spot.x, spot.z, 3, { aggro: 11, spread: 2.4, feed: { x: spot.x, z: spot.z } });
      pack.forEach((w, i) => {
        const a = yaw + 1.0 + i * 2.1, r = 1.9 + 0.25 * i;
        w.position.set(spot.x + Math.sin(a) * r, 0, spot.z + Math.cos(a) * r);
        w.position.y = C.ground(w.position.x, w.position.z);
        w.heading = Math.atan2(spot.x - w.position.x, spot.z - w.position.z);
        w.root.rotation.y = w.heading;
        w.slot = { x: w.position.x, z: w.position.z };
      });
      st.pack = pack;
      bag.onFree(() => { for (const w of pack) if (!w.disposed) G.creatures.remove(w); if (st.pack === pack) st.pack = null; });
      // while a wolf is in the fight the zone stays up; when the last is dead the kill is theirs no more
      let t = 0, over = false;
      bag.system('carcass-wolves', (dt) => {
        t += dt;
        if (t < 0.4) return;
        t = 0;
        const alive = pack.filter((w) => w.alive && !w.disposed);
        if (!over) bag.busy = alive.some((w) => w.engaged);
        if (!over && !alive.length) {
          over = true;
          bag.busy = true; // the bodies lie there a while yet
          K.finish('carcass_wolves_dead');
          C.later(28, () => { bag.busy = false; });
        }
        // her remark, once, when she first sees them over the kill from the track
        if (!C.has('carcass_said') && alive.length && !G.story?.busy && C.dist(spot.x, spot.z) < 34 && G.cameraOwner === 'rig') {
          C.set('carcass_said');
          K.say("Wolves on a kill. They haven't seen me.", 4.2);
        }
      });
      K.begin('side_carcass');
    },
  });

  // ---- after: crows on the kill, by day ---------------------------------------------------------------
  st.crowZone = K.zone({
    id: 'carcass_crows', x: spot.x, z: spot.z, r: 70,
    enabled: () => C.has('carcass_wolves_dead') && C.hour() >= DAY[0] && C.hour() < DAY[1],
    build(bag) {
      const A = G.npcs?.animals;
      if (!A) return;
      const crows = [];
      for (let i = 0; i < 3; i++) {
        const a = i * 2.2 + 0.4, r = 1.8 + i * 0.7;
        const c = A.spawn('crow', spot.x + Math.sin(a) * r, spot.z + Math.cos(a) * r, { ground: true, r: 4, home: { x: spot.x, z: spot.z }, seed: 40 + i });
        if (c) { bag.animal(c); crows.push(c); }
      }
      st.crows = crows;
    },
  });
}
