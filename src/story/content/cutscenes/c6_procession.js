// C6 The Procession (docs/STORY.md): about 70 s. Day 2, 20:00, snow rising to blizzard. Torches leave the
// village and come down onto the ice; at the poles the hole has been cut and the black water steams.
// With `reeve_told` Bogdan stops the rite himself; otherwise Vesna walks out of the snow, says it, and cuts
// Ola's ribbon. Then the bell sounds under the ice and the ice begins to break.
// Trigger: the player goes to the ritual site once the clock passes 20:00 on day 2 (quest main_rite, stage
// site), or on the wait stage ending. Reads reeve_told. Sets rite_started. Ends in a quick fade to black:
// ALWAYS follow with c7_emergence (it starts from black). The hole stays open (G.world.locations.ritual.hole).
import { kit, anchors, riteCast, riteSpots, ribbonFor, torchFor, carry, off, ground, V3, jolt, yawTo } from './_cine.js';
import { props } from '../../../world/props/index.js';

const LYRICS = [
  'Marzanno, Marzanno, white bride of the frost,',
  'we carry you, we carry you, to the water deep.',
  'Do not follow, do not follow, we will not look back.',
  'Go down, go down, and let the green come back.',
];

// The cut ribbon falls from her wrists to the ice.
function dropRibbon(d, rib) {
  if (!rib) return;
  const G = d.G;
  const p = rib.getWorldPosition(V3(0, 0, 0));
  rib.parent?.remove(rib);
  G.scene.add(rib);
  rib.position.copy(p);
  const y0 = G.world.heightAt(p.x, p.z) + 0.01;
  G.story.sched.tween({ dur: 0.7, ease: 'in', step: (u) => { rib.position.y = p.y + (y0 - p.y) * u; rib.rotation.x = u * 1.2; } });
}

export default async function c6(d) {
  const G = d.G, K = kit(d);
  try {
    const R = anchors(G, 'ritual');
    const H = R?.hole ? { x: R.hole.x, z: R.hole.z } : (R?.oldHole ? { x: R.oldHole.x, z: R.oldHole.z } : { x: 11.2, z: -30.8 });
    const toldBogdan = !!G.state.flag('reeve_told');
    const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
    d.setup({ time: 20.0, day: 2, weather: 'snow', music: 'procession' });
    d.fade(1, 0);
    d.atmosphere({ amount: 1, exposure: 1.55, ambientMul: 1.25 });
    d.weather('blizzard', 66);
    G.audio?.duck?.(0.5, 90);
    const spots = riteSpots(H);
    const cast = await riteCast(d, K, { women: 8, men: 5, kids: 3 });
    const { bogdan, hanka, ola, women, men, kids, bearers } = cast;
    const vesna = d.player();
    d.place(vesna, spots.vesna[0] - 12, spots.vesna[1] + 8, yawTo(spots.vesna[0] - 12, spots.vesna[1] + 8, spots.vesna[0], spots.vesna[1]));
    vesna.c.setVisible?.(false);

    // The column on the ice, front to back. z grows toward the shore; they walk north (yaw PI).
    const zLead = H.z + 44, zEnd = H.z + 17;
    const col = [];
    let ribbon = null;
    const put = (a, lat, back, o = {}) => col.push({ a, lat, back, ...o });
    put(bogdan, 0, 0, { torch: true });
    put(men[0], -1.2, 1.5, { torch: true }); put(men[1], 1.2, 1.5, { torch: true });
    put(bearers[0], 0, 3.5, { pole: true }); put(bearers[1], 0, 5.4, { pole: true });
    put(ola, 1.35, 4.4, { sing: true, bound: true });
    put(women[0], 2.55, 4.5, { sing: true }); put(women[1], -1.3, 4.4, { sing: true });
    women.slice(2).forEach((w, i) => put(w, i % 2 ? -0.95 : 0.95, 7.4 + Math.floor(i / 2) * 1.75, { sing: true }));
    kids.forEach((k, i) => put(k, (i - 1) * 0.55, 12.6 + (i % 2) * 0.6));
    men.slice(2).forEach((m, i) => put(m, i % 2 ? 2.1 : -2.1, 9.4 + i * 1.6, { torch: true }));
    put(hanka, 3.3, 10.0, {});
    for (const c of col) {
      d.place(c.a, H.x + c.lat, zLead + c.back, Math.PI);
      if (c.torch) { carry(c.a, 'carry_torch'); torchFor(K, c.a, { light: true }); }
      if (c.pole) carry(c.a, 'carry_pole');
      if (c.sing) c.a.c.talk?.(true);
      if (c.bound) { carry(c.a, 'warm_hands'); ribbon = ribbonFor(K, c.a); }
    }
    let effigy = null;
    try {
      effigy = props.effigy({ variant: 'pole', seed: 5, fx: false });
      bearers[0].c.root.add(effigy);
      effigy.position.set(0.0, 0.0, 0.95);
      effigy.rotation.y = 0;
      K.add(() => { effigy.parent?.remove(effigy); });
    } catch (e) { console.warn('[c6] effigy', e); }
    hanka.c.talk?.(false);
    ola.c.expression?.('eyesWide', 0.5, 0.3);
    const advance = () => Promise.all(col.map((c) => d.walk(c.a, H.x + c.lat, zEnd + c.back, { speed: 0.95 })));
    advance();

    // 1. WIDE from the ice looking back at the shore: a line of torches winds down onto the ice.
    const w1 = P(4.5, 3.0, 1.8);
    d.cut({ pos: w1, look: P(-1.0, 34, 2.2), fov: 46, shake: 0.12 });
    d.fade(0, 1.6);
    d.sub(LYRICS[0], 4.2, { italic: true });
    d.shot({ from: w1, to: P(3.6, 3.6, 1.9), look: P(-1.0, 34, 2.2), lookTo: P(1.0, 30, 2.0), fov: 46, dur: 9, ease: 'linear', shake: 0.12 });
    await d.wait(4.6);
    d.sub(LYRICS[1], 4.2, { italic: true });
    await d.wait(4.4);

    // 2. TRACKING: women in white headscarves and shawls, singing; men behind with torches; children by the hand.
    d.follow(women[3], [-2.7, 1.55, 0.2], () => women[3].eye(V3(0, 0, 0)).add(V3(0, -0.2, 0)), 0, { lag: 3.0, fov: 34, frame: [-0.1, 0.0], shake: 0.14 });
    d.sub(LYRICS[2], 4.2, { italic: true });
    await d.wait(5.0);
    d.follow(kids[1], [-1.8, 1.0, -1.2], () => kids[1].at(0.75, V3(0, 0, 0)), 0, { lag: 3.0, fov: 34, shake: 0.12 });
    await d.wait(3.2);

    // 3. Dobra's effigy, tall on its pole, white dress, red knot, carried by two men.
    const effHead = () => (effigy ? effigy.getWorldPosition(V3(0, 0, 0)).add(V3(0, 2.1, 0)) : bearers[0].eye(V3(0, 0, 0)));
    d.follow(bearers[0], [3.3, 0.7, 4.3], () => effHead().add(V3(0, -0.95, 0)), 0, { lag: 2.6, fov: 46, frame: [0.0, 0.0], shake: 0.14 });
    d.sub(LYRICS[3], 4.2, { italic: true });
    await d.wait(5.6);

    // 4. Beside it: Ola, in the white dress Hanka sewed, wrists tied with red ribbon, chin up, singing anyway.
    d.follow(ola, [0.3, 1.2, 1.7], () => ola.eye(V3(0, 0, 0)).add(V3(0, -0.04, 0)), 0, { lag: 3.2, fov: 28, frame: [0.0, 0.05], shake: 0.1 });
    d.sub(LYRICS[0], 4.2, { italic: true });
    await d.wait(5.8);

    // 5. Hanka walks at the edge of the procession, not singing.
    d.follow(hanka, [-1.2, 1.5, 2.3], () => hanka.eye(V3(0, 0, 0)), 0, { lag: 3.0, fov: 30, frame: [0.1, 0.03], shake: 0.1 });
    d.sub(LYRICS[1], 4.2, { italic: true });
    await d.wait(4.4);

    // 6. Bogdan in front, ledger left behind, a torch in his fist.
    d.follow(bogdan, [1.0, 0.7, 2.6], () => bogdan.at(0.8, V3(0, 0, 0)), 0, { lag: 2.6, fov: 36, shake: 0.14 });
    await d.wait(4.6);

    // 7. At the poles: the hole has been cut. Black water steams in the cold. Everyone has come to the ring.
    for (const c of col) { c.a.c.setLocomotion?.(0); c.a.c.stopUpper?.(0.05); }
    const place = (a, xz, yaw) => d.place(a, xz[0], xz[1], yaw);
    const faceHole = (xz) => yawTo(xz[0], xz[1], H.x, H.z);
    place(bogdan, spots.bogdan, Math.PI);
    place(ola, spots.ola, Math.PI);
    place(bearers[0], spots.bearers[0], Math.PI); place(bearers[1], spots.bearers[1], Math.PI);
    place(hanka, spots.hanka, faceHole(spots.hanka));
    women.forEach((w, i) => place(w, spots.women[i], faceHole(spots.women[i])));
    men.forEach((m, i) => place(m, spots.men[i], faceHole(spots.men[i])));
    kids.forEach((k, i) => place(k, spots.kids[i], faceHole(spots.kids[i])));
    for (const c of col) if (c.torch) { carry(c.a, 'carry_torch'); }
    if (toldBogdan) {
      vesna.c.setVisible?.(true);
      d.place(vesna, spots.vesna[0] + 3, spots.vesna[1] - 4, yawTo(spots.vesna[0] + 3, spots.vesna[1] - 4, H.x, H.z));
      vesna.play('idle_cold', { loop: true, fade: 0 });
    }
    carry(ola, 'warm_hands');
    for (const c of col) c.a.c.talk?.(false);
    if (R?.hole?.open) R.hole.open();
    else { G.water?.addHole?.(H.x, H.z, 0.95); }
    if (effigy) { bearers[0].c.root.remove(effigy); effigy.position.set(spots.bearers[0][0] + 1.0, 0, spots.bearers[0][1] - 0.2); effigy.rotation.set(0, 0, 0); G.scene.add(effigy); K.add(() => effigy.parent?.remove(effigy)); effigy.position.y = G.world.heightAt(effigy.position.x, effigy.position.z); }
    d.cut({ pos: P(-3.6, -8.0, 1.75), look: P(1.0, 4.0, 1.2), fov: 44, shake: 0.1 });
    d.shot({ from: P(-3.6, -8.0, 1.75), to: P(-2.4, -7.0, 1.7), look: P(1.0, 4.0, 1.2), fov: 44, dur: 5.0, ease: 'linear', shake: 0.1 });
    await d.wait(4.8);

    // 8. Bogdan at the hole.
    bogdan.c.lookAt?.(null);
    const runTo = (a, xz) => d.walk(a, xz[0], xz[1], { speed: 1.2 });
    if (toldBogdan) {
      // He stops. The song falters.
      d.cut(d.close(bogdan, ola));
      d.music('silence');
      for (const w of women) { w.c.talk?.(false); }
      await d.wait(2.0);
      await d.say(bogdan, 'Enough.', 1.8);
      // He cuts Ola's ribbon himself.
      const near = off(spots.ola[0], spots.ola[1], Math.PI, 0.0, 0.8);
      d.face(bogdan, ola);
      await runTo(bogdan, near);
      d.face(bogdan, ola);
      d.cut(d.two(bogdan, ola));
      d.anim(bogdan, 'kneel');
      await d.wait(1.8);
      cast.ola.c.stopUpper?.(0.2);
      dropRibbon(d, ribbon);
      d.sfx('sword_sheathe');
      await d.wait(0.8);
      d.sfx('crowd_murmur', null, { volume: 0.7 });
      d.cut(d.close(ola, bogdan));
      await d.wait(2.4);
      d.anim(bogdan, 'stand_up');
    } else {
      // Vesna walks out of the snow into the torchlight.
      vesna.c.setVisible?.(true);
      const from = [spots.bogdan[0] - 8.0, spots.bogdan[1] + 7.5];
      d.place(vesna, from[0], from[1], yawTo(from[0], from[1], spots.bogdan[0], spots.bogdan[1] + 2));
      const stand = [spots.bogdan[0] - 2.6, spots.bogdan[1] + 2.9];
      const wk = d.walk(vesna, stand[0], stand[1], { speed: 1.4 });
      const wide = P(-9.5, -2.0, 1.7);
      d.cut({ pos: wide, look: () => vesna.at(0.7, V3(0, 0, 0)), fov: 38, shake: 0.1 });
      await wk;
      d.face(vesna, bogdan);
      d.cut(d.ots(bogdan, vesna));
      await d.say(vesna, 'Let her go.', 1.8);
      d.cut(d.ots(vesna, bogdan));
      await d.say(bogdan, 'Stay out of this, hunter.', 2.2);
      // One stroke. The ribbon falls. The crowd gives way from the drawn sword.
      const toOla = [spots.ola[0] - 1.0, spots.ola[1] + 0.9];
      const op = ola.pos(V3(0, 0, 0));
      d.cut({ pos: V3(op.x + 2.4, op.y + 1.45, op.z + 2.5), look: () => ola.at(0.6, V3(0, 0, 0)), fov: 34, shake: 0.1 });
      d.walk(vesna, toOla[0], toOla[1], { speed: 1.3 });
      await d.anim(vesna, 'draw_sword');
      d.face(vesna, ola);
      d.anim(vesna, 'attack_1');
      await d.wait(0.35);
      dropRibbon(d, ribbon);
      d.sfx('sword_whoosh', vesna);
      ola.c.stopUpper?.(0.1);
      jolt(d, 0.6, 0.6);
      women.forEach((w) => {
        const p = w.pos(V3(0, 0, 0));
        const away = yawTo(vesna.pos(V3(0, 0, 0)).x, vesna.pos(V3(0, 0, 0)).z, p.x, p.z);
        const [x, z] = off(p.x, p.z, away, 0, 1.2);
        d.walk(w, x, z, { speed: 1.6 });
      });
      d.sfx('crowd_murmur', null, { volume: 0.8 });
      await d.wait(1.8);
      await d.anim(vesna, 'sheathe_sword');
    }

    // 9. A sound under the ice: the bell. Deep, muffled, from everywhere. Everyone stops singing.
    d.music('silence');
    for (const c of col) { c.a.c.talk?.(false); }
    const low = P(1.2, 6.2, 0.35);
    d.cut({ pos: low, look: P(0.4, 1.0, 0.9), fov: 40, shake: 0.12 });
    d.sfx('bell_under_ice', P(0, 0, 0), { volume: 1 });
    G.postfx?.flash?.(0xcfeaff, 0.4);
    d.shot({ from: low, to: P(1.0, 5.2, 0.45), look: P(0.4, 1.0, 0.9), fov: 40, dur: 4.2, ease: 'sine', shake: 0.14 });
    await d.wait(2.6);
    d.sfx('heartbeat');
    for (const c of col) c.a.lookAt?.(V3(H.x, 0, H.z));

    // 10. The ice groans. Cracks race outward from the hole. Torches tremble.
    d.sfx('ice_groan', P(0, 0, 0));
    const w10 = P(-2.5, -12.5, 6.5);
    d.cut({ pos: w10, look: P(0.5, 2.0, 0.5), fov: 48, shake: 0.2 });
    const crack = G.story.sched.tween({ dur: 4.2, ease: 'out', step: (u) => G.water?.setCracks?.(H.x, H.z, 5 + 26 * u, Math.min(1, u * 1.15)) });
    d.shot({ from: w10, to: P(-2.0, -11.5, 6.0), look: P(0.5, 2.0, 0.5), fov: 48, dur: 4.2, ease: 'linear', shake: 0.3 });
    d.sfx('ice_crack', P(0, 0, 0));
    jolt(d, 1.1, 2.5);
    await crack;
    await d.wait(0.6);

    d.flag('rite_started');
    await d.fade(1, 0.6);
    const vp = vesna.pos(V3(0, 0, 0));
    vesna.c.setVisible?.(true);
    const standEnd = toldBogdan ? [spots.vesna[0] + 2, spots.vesna[1] - 3] : [vp.x, vp.z];
    d.end({ player: { x: standEnd[0], z: standEnd[1], yaw: yawTo(standEnd[0], standEnd[1], H.x, H.z) }, fadeIn: false });
  } finally {
    K.run();
  }
}
