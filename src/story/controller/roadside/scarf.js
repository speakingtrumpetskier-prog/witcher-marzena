// The boy's scarf (side_scarf, "Jasiek's Scarf"). An old woman kneels at the wayside shrine on the pass road, by day, with a bowl of
// milk. Her son took a sledge up the pass for wood four days ago. Vesna passed that sledge below the watchtower (the vignette with the
// firewood and the boot prints walking off). With hunter senses the prints go on up the road to a drift, and in the drift is his scarf,
// grey with a red stripe, stiff with frost. Nothing else. Bring it back and she hangs it on the shrine post and pays eight grosze.
//
//   where   the shrine with the bowl of milk (vignette pass_shrineMilk_8, about (-159, 168)); the scarf at pass arc 296, in the drift
//   when    8:00 to 18:00 for the woman, any weather but a blizzard; the scarf is there for good until found
//   flags   scarf_asked, scarf_found, scarf_returned;  item scarf (item_scarf note)
//   state   C.roadside.scarf { site, shrine, woman, scarf }
import { frozenScarf, hangingScarf } from './things.js';
import { SPECS } from './people.js';
import { nearestRoad } from '../../../world/layout.js';

const WINDOW = [8, 18], ARC = 296;

export function install(C, K) {
  const { G, S } = C;
  const rec = G.world.locations?.vignettes?.shrines?.find((s) => s.variant === 'shrineMilk');
  const shrine = rec ? { x: rec.x, z: rec.z } : { x: -159, z: 168 };
  const nr = nearestRoad(shrine.x, shrine.z);
  const toRoad = Math.atan2(nr.x - shrine.x, nr.z - shrine.z);
  const side = toRoad + Math.PI / 2;
  const spot = { x: shrine.x + Math.sin(toRoad) * 2.0, z: shrine.z + Math.cos(toRoad) * 2.0 };
  const roadPt = K.road('pass', ARC, 3.8);
  const site = K.openSpot(roadPt.x, roadPt.z, { rad: 0.8, maxR: 5, maxSlope: 0.7 });
  const st = { site, shrine, spot, woman: null, scarf: null };
  C.roadside.scarf = st;

  // ---- the scarf in the drift ---------------------------------------------------------------------
  const scarf = frozenScarf({ seed: 3 });
  scarf.position.set(site.x, C.ground(site.x, site.z), site.z);
  scarf.rotation.y = 0.6;
  G.scene.add(scarf);
  st.scarf = scarf;
  C.restore(() => { scarf.visible = !C.has('scarf_found'); });
  const found = () => C.has('scarf_found');
  const asked = () => C.has('scarf_asked');

  // the boot prints go on from the sledge up the road to it (senses)
  const trail = [K.road('pass', 330, 3.0), K.road('pass', 318, 3.4), K.road('pass', 306, 3.6), roadPt].map((p) => [p.x, p.z]);
  C.trail({ id: 'scarf_trail', kind: 'footprints', points: trail, enabled: () => asked() && !found() });
  C.clue({
    id: 'scarf', pos: C.at(site.x, site.z, 0.2), radius: 2.6, kind: 'clue', label: 'Wool in the drift', object: scarf,
    enabled: () => asked() && !found(),
    onExamine: async () => {
      const P = G.player;
      P.character.play('crouch_examine', { loop: false, fade: 0.25 });
      await C.sleep(0.8);
      scarf.visible = false;
      await C.read('item_scarf');
      C.pickup('scarf', 'Scarf');
      C.set('scarf_found');
    },
  });

  // ---- what stays: the scarf on the post ------------------------------------------------------------
  K.persist(() => C.has('scarf_returned'), () => {
    const g = hangingScarf({ seed: 3 });
    g.position.set(shrine.x + Math.sin(toRoad) * 0.42 + Math.sin(side) * 0.3, C.ground(shrine.x, shrine.z) + 1.5, shrine.z + Math.cos(toRoad) * 0.42 + Math.cos(side) * 0.3);
    g.rotation.y = toRoad;
    return g;
  }, ['scarf_returned']);

  // ---- the woman, by day ----------------------------------------------------------------------------
  async function talk(bag, c) {
    const r = await C.talk('rs_shrine_woman', { actors: { old_woman: c } });
    if (asked() && !G.quests.rec('side_scarf')) K.begin('side_scarf', { quiet: false });
    if (r?.end !== 'pay') return;
    S.take('scarf', 1);
    S.give('coins', 8);
    C.sfx('coin');
    C.set('scarf_returned');
  }
  st.zone = K.zone({
    id: 'scarf_woman', x: spot.x, z: spot.z, r: 55,
    enabled: () => C.hour() >= WINDOW[0] && C.hour() < WINDOW[1] && G.weather?.state !== 'blizzard',
    build(bag) {
      const c = bag.char(SPECS.oldWoman(), { x: spot.x, z: spot.z, yaw: toRoad + Math.PI, anim: 'kneel_idle', lowDetail: false });
      st.woman = c;
      bag.onFree(() => { if (st.woman === c) st.woman = null; });
      bag.talkTo(c, { id: 'rs_shrine_woman', label: 'Old woman', enabled: () => bag.live && !bag.busy, onUse: () => talk(bag, c) });
    },
  });
}
