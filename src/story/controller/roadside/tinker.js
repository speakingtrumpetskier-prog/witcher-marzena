// The tinker's sledge (side_tinker, "The Tinker's Sledge"). A tinker coming down the pass with a loaded sledge whose
// left runner has split at the knee. He needs the corner held up while he lashes it: talk to him, then HOLD E (the ring
// is the lift; the sledge rises with it). Afterwards he sells a Thaw draught for eight grosze (the tavern asks twelve),
// hauls the sledge off toward the village, and from then on stands at the stalls in the square in the afternoons.
//
//   where   the pass road, arc 505 (below the hunter's blind, short of the crossroads), on the shoulder where it levels
//   when    8:00 to 17:00, any weather but a blizzard; once (flag tinker_helped)
//   flags   tinker_met, tinker_helped, tinker_day / tinker_hour (when), tinker_stock (draughts he has left, 3 to begin)
//   state   C.roadside.tinker { zone, sled, tinker, haul, village }
import * as THREE from 'three';
import { tinkerSledge, runnerScrap } from './things.js';
import { SPECS } from './people.js';

const ARC = 505, SIDE = 2.7, WINDOW = [8, 17];
const PRICE = 8;
// A free spot by the spoons stall in the square (the seller stands behind the counter; this is the end of it).
const STALL = { kind: 'work', x: -19.5, z: 113.5, yaw: -1.2, anim: 'idle_cold' };

export function install(C, K) {
  const { G, S } = C;
  const site = K.road('pass', ARC, SIDE);
  const yaw = site.yaw; // the nose points down the road, toward the village
  const at = (lx, lz) => K.at(site.x, site.z, yaw, lx, lz);
  const open = () => { const h = C.hour(); return h >= WINDOW[0] && h < WINDOW[1] && G.weather?.state !== 'blizzard'; };
  const st = { zone: null, sled: null, tinker: null, haul: null, village: null, site, yaw };
  C.roadside.tinker = st;

  // ---- the sale -------------------------------------------------------------------------------
  function sell(c) {
    const stock = S.flag('tinker_stock') ?? 0;
    if (stock <= 0 || S.count('thaw') >= 3 || S.count('coins') < PRICE) return false;
    S.take('coins', PRICE);
    S.give('thaw');
    S.set('tinker_stock', stock - 1);
    C.sfx('coin');
    if (c) K.bark(c, 'tinker', 'Tinker', 'There you are.');
    return true;
  }
  // The talk everywhere after the sledge is mended: on the road and at the stalls.
  async function shopTalk(c) {
    const r = await C.talk('rs_tinker', { actors: { tinker: c } });
    if (r?.end === 'buy') sell(c);
  }

  // ---- the lift -------------------------------------------------------------------------------
  async function lift(bag, c, sled) {
    const P = G.player;
    const [vx, vz] = at(-1.0, -0.8);
    bag.busy = true;
    try {
      C.place(vx, vz, Math.atan2(site.x - vx, site.z - vz));
      P.setControl(false);
      const pc = P.character;
      pc.play('kneel', { loop: false, fade: 0.25 });
      await C.sleep(1.0);
      pc.play('kneel_idle', { loop: true, fade: 0.2 });
      c.playUpper('mend_net', { loop: true, fade: 0.4 });
      let ok = false;
      for (let tries = 0; tries < 3 && !ok; tries++) {
        ok = await K.hold('[Hold E] Lift', 2.8, 14, (p) => sled.setLift(p));
        if (!ok) {
          for (let i = 1; i <= 8; i++) { sled.setLift(sled.p * (1 - i / 8)); await C.sleep(0.05); }
          if (tries < 2) K.bark(c, 'tinker', 'Tinker', "Up. I can't tie it from the ground.");
        }
      }
      if (!ok) {
        K.bark(c, 'tinker', 'Tinker', 'Another time, then.');
        c.stopUpper(0.3);
        pc.play('stand_up', { loop: false, fade: 0.2 });
        await C.sleep(0.8);
        pc.play('idle', { fade: 0.3 });
        return false;
      }
      sled.setLift(1);
      // He ties it off: three blows with the mallet, rope pulled tight.
      c.playUpper('hammer', { loop: true, fade: 0.25 });
      C.sfx('effigy_creak', { volume: 0.5, pos: c.root.position });
      for (let i = 0; i < 3; i++) { await C.sleep(0.8); C.sfx('forge_hammer', { volume: 0.35, pos: c.root.position }); }
      await C.sleep(0.9);
      sled.setFixed(true);
      c.stopUpper(0.3);
      c.play('stand_up', { loop: false, fade: 0.25 });
      K.bark(c, 'tinker', 'Tinker', 'Down. Slowly.');
      await C.sleep(0.5);
      for (let i = 1; i <= 16; i++) { sled.setLift(1 - i / 16); await C.sleep(0.06); }
      pc.play('stand_up', { loop: false, fade: 0.2 });
      await C.sleep(0.9);
      pc.play('idle', { fade: 0.3 });
      c.play('idle', { fade: 0.3 });
      return true;
    } finally {
      P.setControl(true);
      bag.busy = false;
    }
  }

  // ---- the sledge goes on down the road ---------------------------------------------------------
  function haul(bag, c, sled) {
    const hb = K.bag();
    hb.adopt(bag, { chars: [c], objs: [sled.root] });
    st.haul = hb;
    hb.onFree(() => { if (st.haul === hb) st.haul = null; });
    c.lookAt(null);
    const path = K.roadPath('pass', ARC, 700, 8, 1.6);
    c.walkTo(path, { speed: 1.1 });
    const heading = new THREE.Vector3();
    let yawS = yaw;
    hb.system('tinker-haul', (dt) => {
      const p = c.root.position;
      heading.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      const tx = p.x - heading.x * 2.9, tz = p.z - heading.z * 2.9;
      let d = Math.atan2(heading.x, heading.z) - yawS;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawS += d * Math.min(1, dt * 3);
      K.settle(sled.root, tx, tz, yawS, 2.3, 0.8);
      // he has reached the village end of his road, or she has left him far behind
      if (C.dist(p.x, p.z) > 110 || c._walk == null) hb.free();
    });
  }

  // ---- the encounter -----------------------------------------------------------------------------
  st.zone = K.zone({
    id: 'tinker', x: site.x, z: site.z, r: 85,
    enabled: () => !C.has('tinker_helped') && open(),
    build(bag) {
      const sled = tinkerSledge({ seed: 5 });
      K.settle(sled.root, site.x, site.z, yaw, 2.3, 0.8);
      bag.mesh(sled.root);
      const [bx, bz] = at(0, 0);
      bag.box(bx, bz, 0.62, 1.25, yaw, { tag: 'sledge' });
      const [tx, tz] = at(-1.05, 0.5);
      const c = bag.char(SPECS.tinker(), { x: tx, z: tz, yaw: Math.atan2(site.x - tx, site.z - tz) + 0.35, anim: 'kneel_idle', lowDetail: false });
      st.sled = sled;
      st.tinker = c;
      bag.talkTo(c, {
        id: 'rs_tinker', label: 'Tinker',
        enabled: () => bag.live && !bag.busy && !st.haul,
        onUse: async () => {
          const r = await C.talk('rs_tinker', { actors: { tinker: c } });
          if (C.has('tinker_met') && !G.quests.rec('side_tinker')) K.begin('side_tinker');
          if (r?.end !== 'lift') return;
          const ok = await lift(bag, c, sled);
          if (!ok) return;
          C.set('tinker_day', C.day());
          C.set('tinker_hour', Math.round(C.hour() * 10) / 10);
          C.set('tinker_stock', 3);
          K.finish('tinker_helped');
          const r2 = await C.talk('rs_tinker', { start: 'd1', actors: { tinker: c } });
          if (r2?.end === 'buy') sell(c);
          haul(bag, c, sled);
        },
      });
      // he hails whoever comes by
      let hailed = false;
      bag.system('tinker-hail', () => {
        if (hailed || bag.busy || C.dist(site.x, site.z) > 17 || G.story?.busy) return;
        hailed = true;
        K.bark(c, 'tinker', 'Tinker', 'Hunter! Over here, if you have a minute.');
      });
    },
  });

  // What stays on the road: the broken nose of the runner, splintered, in the snow.
  K.persist(() => C.has('tinker_helped'), () => {
    const g = runnerScrap({ seed: 5 });
    const [sx, sz] = at(-1.7, 0.4);
    g.position.set(sx, C.ground(sx, sz) + 0.02, sz);
    g.rotation.y = yaw + 0.9;
    return g;
  });

  // ---- later: the village ----------------------------------------------------------------------
  // He is at the stalls from an hour or so after he left the road until half past five, every day after.
  function village() {
    if (!G.npcs?.spawn) return;
    const want = C.has('tinker_helped');
    const old = G.npcs.get('tinker');
    if (!want) { if (old) G.npcs.despawn('tinker'); st.village = null; return; }
    if (old) { st.village = old; return; }
    const from = Math.min(15.5, Math.max(9, (S.flag('tinker_hour') ?? 12) + 1.6));
    st.village = G.npcs.spawn({
      id: 'tinker', spec: SPECS.tinker(), name: 'Tinker', lowDetail: false, hardy: 0.5,
      barks: ['Pots mended. Spoons. Kettles.', 'Thaw draught, eight grosze.', 'Mind the load.'],
      schedule: [{ from, to: 17.5, at: STALL }, { from: 17.5, to: from, at: 'bed_n8', hidden: true }],
      talk: async (n) => { C.foot(); await shopTalk(n.character); },
    });
  }
  C.restore(village);
  C.watch('tinker_helped', village);
  C.on('npcs:populated', village);
  C.on('game:ready', village);
}
