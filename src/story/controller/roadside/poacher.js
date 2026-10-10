// A lantern in the forest (side_poacher, "A Lantern in the Forest"). At night, thirty metres off the forest track, a man with a lantern is
// setting snares. If she comes within fifteen metres he bolts, still carrying the lantern, so the light goes away through the trees,
// and out to the track and off north. What he leaves for good: the snares (one with a hare in it) and a satchel with a tally in it:
// hares this week, and which households got them. "Not a word to B." Nothing happens to him; nobody is told.
//
//   where   the forest, 30 m west of the track at arc 205 (north of the sledge vignette, south of the charcoal camp)
//   when    21:00 to 04:00, any weather but a blizzard; once he has run (flag poacher_chased); the tally read sets poacher_note
//   state   C.roadside.poacher { spot, zone, man }
import * as THREE from 'three';
import { Kit } from '../../../world/props/kit.js';
import { props } from '../../../world/props/index.js';
import { snareLine } from '../../../world/locations/wilderness/objects.js';
import { satchel } from './things.js';
import { SPECS } from './people.js';

const ARC = 205, OFF = 30, NOTICE = 15;

export function install(C, K) {
  const { G } = C;
  const rd = K.road('forest', ARC, OFF);
  const spot = K.openSpot(rd.x, rd.z, { rad: 3.2, maxR: 22 });
  const base = K.road('forest', ARC, 0);
  const toRoad = Math.atan2(base.x - spot.x, base.z - spot.z);
  G.vegetation?.clearArea?.(spot.x, spot.z, 5);
  const st = { spot, zone: null, man: null };
  C.roadside.poacher = st;
  const night = () => { const h = C.hour(); return h >= 21 || h < 4; };

  // The set of things he leaves: two snare lines (one with a hare) and the satchel. Positions relative to his spot.
  const at = (lx, lz) => K.at(spot.x, spot.z, toRoad, lx, lz);
  const [sx, sz] = at(-1.6, 0.4);
  const [tx, tz] = at(1.5, -0.8);
  const [qx, qz] = at(0.8, 1.7);
  function snares() {
    const g = new THREE.Group();
    g.name = 'rs_snares';
    for (const [x, z, yaw, hare] of [[sx, sz, toRoad + Math.PI / 2, true], [tx, tz, toRoad + Math.PI / 2 + 0.3, false]]) {
      const k = new Kit('poacherSnares', { seed: hare ? 3 : 5 });
      snareLine(k, { length: 3.0, yaw: 0, hare });
      const m = k.build();
      K.settle(m, x, z, yaw, 1, 1);
      g.add(m);
    }
    const bag = satchel({ seed: 2 });
    K.settle(bag, qx, qz, toRoad + 0.7, 0.4, 0.3);
    g.add(bag);
    return g;
  }
  K.persist(() => C.has('poacher_chased'), () => ({ obj: snares(), own: false }), ['poacher_chased']);

  // the satchel: look inside
  C.interact({
    id: 'poacher_satchel', pos: C.at(qx, qz, 0.25), radius: 2.1, verb: 'Search', label: 'Canvas satchel',
    enabled: () => C.has('poacher_chased') && !C.has('poacher_note'),
    onUse: async () => {
      G.player?.character?.play?.('crouch_examine', { loop: false, fade: 0.25 });
      await C.sleep(0.7);
      await C.read('note_poacher');
      K.finish('poacher_note');
    },
  });

  // ---- the man and his lantern ------------------------------------------------------------------------
  st.zone = K.zone({
    id: 'poacher', x: spot.x, z: spot.z, r: 80,
    enabled: () => !C.has('poacher_chased') && night() && G.weather?.state !== 'blizzard',
    build(bag) {
      const live = snares();
      bag.mesh(live);
      const c = bag.char(SPECS.poacher(), { x: spot.x, z: spot.z, yaw: toRoad + Math.PI / 2 - 0.3, anim: 'crouch_examine', lowDetail: true });
      st.man = c;
      const lamp = props.lantern({ mount: 'hand', fx: false, scale: 1.0 });
      lamp.position.y = -0.3;
      c.attach('handR', lamp);
      const light = bag.light({ x: spot.x, y: C.ground(spot.x, spot.z) + 0.8, z: spot.z, color: 0xffb060, intensity: 1.35, radius: 9, kind: 'lantern', importance: 2 });
      const hand = new THREE.Vector3();
      let fled = false, away = 0, done = false;
      const run = () => {
        fled = true;
        bag.busy = true;
        K.facePlayer(c);
        K.bark(c, 'poacher', 'Man', "Who's there?");
        // what he leaves stays where it is for good; the one in the bag gives way to the one in the world
        C.set('poacher_chased');
        if (live.parent) live.parent.remove(live);
        K.begin('side_poacher');
        const out = K.road('forest', ARC + 8, 0);
        const path = [{ x: out.x, z: out.z }, ...K.roadPath('forest', ARC + 8, ARC + 230, 10, 1.2)];
        c.walkTo(path, { run: true, speed: 4.6 });
      };
      // out of sight: take him and his light away
      const finish = () => {
        if (done) return;
        done = true;
        bag.busy = false;
        c.detach(lamp);
        light.remove();
        c.setVisible(false);
      };
      bag.system('poacher', (dt) => {
        lamp.getWorldPosition(hand);
        light.desc.x = hand.x; light.desc.y = hand.y + 0.15; light.desc.z = hand.z;
        if (done) return;
        if (!fled) {
          if (C.dist(spot.x, spot.z) < NOTICE && !G.story?.busy) run();
        } else {
          away += dt;
          if (C.dist(c.root.position.x, c.root.position.z) > 70 || away > 60 || c._walk == null) finish();
        }
      });
    },
  });
}
