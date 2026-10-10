// Whose hole (side_fishers, "Whose Hole"). On the ice at the river mouth, in the morning, two fishermen are quarrelling over one hole: Wacław
// says his father cut it and he has cut it every freeze; Franek has been on it since before light and says it is the river's. They turn to
// her to say whose it is. Three answers: Wacław's (Franek goes, Wacław pays four grosze), Franek's for the day (Wacław goes, Franek pays four
// grosze), or ice enough for two, and a second hole is cut a few paces over (nobody pays). Or she walks away and they go on.
// Whatever she says, the hole and the stool stay, and on later mornings the ones who stayed are there fishing.
//
//   where   the lake ice at the river mouth, (292, -80), fourteen paces from the shore
//   when    6:30 to 11:00, any weather but a blizzard; the quarrel is once (flag fishers_settled: 'old' | 'young' | 'both')
//   state   C.roadside.fishers { hole, zone, old, young }
import * as THREE from 'three';
import { props } from '../../../world/props/index.js';
import { SPECS } from './people.js';

const H = { x: 292, z: -80 }, H2 = { x: 295.6, z: -78.6 }, WINDOW = [6.5, 11];
const OLD_AT = { x: H.x, z: H.z - 1.5 }, YOUNG_AT = { x: H.x + 0.2, z: H.z + 1.6 };

const ARGUE = [
  ['old', 'My father cut this hole.'], ['young', "Your father's not here."], ['old', 'Move your bucket.'],
  ['young', 'I was here first.'], ['old', "Since when?"], ['young', 'Since before light.'],
];

export function install(C, K) {
  const { G, S } = C;
  const st = { hole: H, zone: null, old: null, young: null };
  C.roadside.fishers = st;
  const open = () => C.hour() >= WINDOW[0] && C.hour() < WINDOW[1] && G.weather?.state !== 'blizzard';
  const settled = () => C.flag('fishers_settled');

  // ---- what is always there: the hole, Wacław's stool, Franek's bucket ---------------------------------
  const holeSet = (x, z, seed, withStool = true) => {
    const g = new THREE.Group();
    g.name = 'rs_hole';
    const hole = props.iceFishingHole({ radius: 0.34, rod: false, seed, fx: false });
    hole.position.set(x, 0, z);
    g.add(hole);
    if (withStool) {
      const stool = props.fishingStool({ variant: 'bucket', seed, fx: false });
      stool.position.set(x, 0, z - 1.5);
      g.add(stool);
      const pail = props.bucket({ seed, fx: false });
      pail.position.set(x + 0.9, 0, z + 1.7);
      g.add(pail);
    }
    return g;
  };
  K.persist(() => true, () => ({ obj: holeSet(H.x, H.z, 4), own: false }));
  K.persist(() => settled() === 'both', () => {
    const g = holeSet(H2.x, H2.z, 7, false);
    const stool = props.fishingStool({ variant: 'legs', seed: 7, fx: false });
    stool.position.set(H2.x + 0.4, 0, H2.z + 1.5);
    g.add(stool);
    return { obj: g, own: false };
  }, ['fishers_settled']);

  const rod = (c) => K.tool(c, 'rod');

  // someone who goes: walks off the ice, then is gone (the bag stays up while he does)
  function leave(bag, c, toward) {
    bag.busy = true;
    c.walkTo(toward, { speed: 1.35 });
    bag.system('fisher-leave', () => {
      if (c._walk == null || C.dist(c.root.position.x, c.root.position.z) > 55) {
        c.setVisible(false);
        bag.busy = false;
      }
    });
  }

  async function talk(bag, old, young) {
    const r = await C.talk('rs_fishers', { actors: { fisher_old: old, fisher_young: young } });
    if (!G.quests.rec('side_fishers')) K.begin('side_fishers');
    if (settled()) return;
    const how = r?.end === 'end_old' ? 'old' : r?.end === 'end_young' ? 'young' : r?.end === 'end_both' ? 'both' : null;
    if (!how) return;
    st.argue = false;
    if (how !== 'both') { S.give('coins', 4); C.sfx('coin'); }
    bag.busy = true;
    try {
      if (how === 'old') {
        K.finish('fishers_settled', 'old');
        leave(bag, young, [{ x: 318, z: -68 }, { x: 330, z: -44 }]);
        old.play('fish_ice', { loop: true, fade: 0.4 });
        rod(old);
      } else if (how === 'young') {
        K.finish('fishers_settled', 'young');
        leave(bag, old, [{ x: 312, z: -104 }, { x: 332, z: -112 }]);
        young.walkTo(H.x, H.z - 1.5, { speed: 1.2 });
        await C.until(() => young._walk == null, 8, 0.2);
        young.yaw = 0;
        young.play('fish_ice', { loop: true, fade: 0.4 });
        rod(young);
      } else {
        // he cuts the second hole himself, and they fish a few paces apart
        young.walkTo(H2.x, H2.z + 1.2, { speed: 1.3 });
        await C.until(() => young._walk == null, 8, 0.2);
        young.play('chop_wood', { loop: true, fade: 0.3 });
        for (let i = 0; i < 5; i++) { await C.sleep(0.7); C.sfx('axe_chop', { volume: 0.5, pos: young.root.position }); }
        K.finish('fishers_settled', 'both');
        young.walkTo(H2.x + 0.4, H2.z + 1.5, { speed: 1.2 });
        await C.until(() => young._walk == null, 5, 0.2);
        young.yaw = Math.PI;
        young.play('fish_ice', { loop: true, fade: 0.4 });
        rod(young);
        old.play('fish_ice', { loop: true, fade: 0.4 });
        rod(old);
        bag.busy = false;
      }
    } catch (e) { bag.busy = false; throw e; }
  }

  st.zone = K.zone({
    id: 'fishers', x: H.x, z: H.z, r: 65, enabled: open,
    build(bag) {
      const res = settled();
      bag.onFree(() => { st.old = null; st.young = null; st.argue = false; });
      const place =(spec, at, yaw, anim) => bag.char(spec, { x: at.x, z: at.z, yaw, anim, lowDetail: true });
      if (!res) {
        // the quarrel
        const old = place(SPECS.fisherOld(), OLD_AT, 0, 'hands_hips');
        const young = place(SPECS.fisherYoung(), YOUNG_AT, Math.PI, 'cross_arms');
        st.old = old; st.young = young;
        bag.talkTo(old, { id: 'rs_fishers_old', label: 'Wacław', enabled: () => bag.live && !bag.busy, onUse: () => talk(bag, old, young) });
        bag.talkTo(young, { id: 'rs_fishers_young', label: 'Franek', enabled: () => bag.live && !bag.busy, onUse: () => talk(bag, old, young) });
        st.argue = true;
        let t = 2, i = 0;
        bag.system('fishers-argue', (dt) => {
          if (!st.argue || bag.busy || G.story?.busy || C.dist(H.x, H.z) > 30) return;
          t -= dt;
          if (t > 0) return;
          t = 5.5;
          const [who, line] = ARGUE[i++ % ARGUE.length];
          const c = who === 'old' ? old : young;
          K.bark(c, who === 'old' ? 'fisher_old' : 'fisher_young', who === 'old' ? 'Wacław' : 'Franek', line);
          c.gesture(who === 'old' ? 'point' : 'shrug');
        });
        return;
      }
      // the morning after: whoever stayed is fishing
      const sit = (spec, at, yaw) => { const c = place(spec, at, yaw, 'fish_ice'); rod(c); return c; };
      const oldTalk = (c) => bag.talkTo(c, { id: 'rs_fisher_old', label: 'Wacław', onUse: () => C.talk('rs_fisher_old', { actors: { fisher_old: c } }) });
      const youngTalk = (c) => bag.talkTo(c, { id: 'rs_fisher_young', label: 'Franek', onUse: () => C.talk('rs_fisher_young', { actors: { fisher_young: c } }) });
      if (res === 'old') {
        st.old = sit(SPECS.fisherOld(), OLD_AT, 0);
        oldTalk(st.old);
      } else if (res === 'young') {
        st.young = sit(SPECS.fisherYoung(), { x: H.x, z: H.z - 1.5 }, 0);
        youngTalk(st.young);
      } else {
        st.old = sit(SPECS.fisherOld(), OLD_AT, 0);
        st.young = sit(SPECS.fisherYoung(), { x: H2.x + 0.4, z: H2.z + 1.5 }, Math.PI);
        oldTalk(st.old);
        youngTalk(st.young);
      }
    },
  });
}
