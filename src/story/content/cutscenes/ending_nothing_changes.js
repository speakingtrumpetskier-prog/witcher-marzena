// Ending C: Nothing Changes (docs/STORY.md), about 70 s. Vesna sheathes her sword and steps back. The
// marzanna sinks without a fight; the village re-forms its procession and gives Ola to the water. They
// walk home singing and nobody looks back. The snow keeps falling. Next year's effigy is already being
// stuffed in Dobra's yard.
// Trigger: the finale controller plays it when the player steps back (only offered with took_reeve_money).
// Reads ola_truth / ola_lie. Sets ending = 'nothing_changes'. Standalone: it stages the finale itself.
// Ends in the grey: snow falling, the clock at the next afternoon, Vesna on the ice at the hole.
import { kit, finaleStage, riteCast, riteSpots, ribbonFor, torchFor, carry, ground, off, V3, jolt, yawTo } from './_cine.js';

const LYRICS = [
  'Marzanno, Marzanno, white bride of the frost,',
  'we carry you, we carry you, to the water deep.',
  'Do not follow, do not follow, we will not look back.',
  'Go down, go down, and let the green come back.',
];

export async function run(d, S, K) {
  const G = d.G;
  const { H, vesna, wiesia, hanka, ola } = S;
  const lied = !!G.state.flag('ola_lie') && !G.state.flag('ola_truth');
  const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
  const sp = riteSpots(H);
  const holes = [];
  K.add(() => holes.forEach((h) => G.water?.removeHole?.(h)));

  // The village comes back onto the ice, shaking.
  const cast = await riteCast(d, K, { women: 8, men: 5, kids: 0 });
  const { bogdan, women, men } = cast;
  const real = [bogdan, ...women, ...men, ...cast.bearers];
  const faceHole = (xz) => yawTo(xz[0], xz[1], H.x, H.z);
  const far = (xz, k = 1.9) => [H.x + (xz[0] - H.x) * k, H.z + (xz[1] - H.z) * k + 5];
  bogdan.id = 'bogdan';
  d.place(bogdan, ...far(sp.bogdan), faceHole(sp.bogdan));
  women.forEach((w, i) => d.place(w, ...far(sp.women[i]), faceHole(sp.women[i])));
  men.forEach((m, i) => d.place(m, ...far(sp.men[i], 1.6), faceHole(sp.men[i])));
  cast.bearers.forEach((b, i) => d.place(b, ...far(sp.bearers[i], 1.6), faceHole(sp.bearers[i])));
  cast.ola.hide();
  for (const m of men.slice(0, 4)) { carry(m, 'carry_torch'); torchFor(K, m, { light: true }); }
  d.place(vesna, H.x + 0.9, H.z + 6.6, Math.PI);

  // 1. Vesna sheathes her sword and steps back out of the torchlight. She says nothing.
  d.music('silence');
  const m1 = P(3.5, 10.5, 1.5);
  d.cut({ pos: m1, look: () => vesna.at(0.78, V3(0, 0, 0)), fov: 36, frame: [-0.05, 0.02], shake: 0.1 });
  await d.wait(1.6);
  await d.anim(vesna, 'sheathe_sword');
  d.music('sorrow');
  const back = d.walk(vesna, H.x - 7.8, H.z + 10.4, { speed: 1.1 });
  d.follow(vesna, [2.4, 1.6, 2.2], () => vesna.eye(V3(0, 0, 0)).add(V3(0, -0.1, 0)), 0, { lag: 2.4, fov: 34, frame: [0.0, 0.02], shake: 0.12 });
  await back;
  d.face(vesna, V3(H.x, 0, H.z));
  vesna.play('idle_cold', { loop: true, fade: 0.4 });

  // 2. The marzanna, without a fight, sinks back under. The villagers re-form the procession.
  const [wx, wz] = wiesia.pos0;
  const lowCam = P(-3.2, 7.5, 0.9);
  d.cut({ pos: lowCam, look: ground(G, wx, wz, 0.7), fov: 36, shake: 0.08 });
  wiesia.c.stopUpper?.(0.6);
  d.face(wiesia, V3(wx, 0, wz + 20));
  const id = G.water?.addHole?.(wx, wz, 0.9);
  if (id != null && id >= 0) holes.push(id);
  d.sfx('ice_ping', ground(G, wx, wz, 0));
  const sink = G.story.sched.tween({
    dur: 6.5, ease: 'inOut',
    step: (u) => {
      wiesia.c.root.position.y = G.world.heightAt(wx, wz) - 2.6 * u * u;
      G.water?.setUnderGlow?.(wx, wz, 5, u < 0.3 ? 0.4 + u * 3 : 1.3 * (1 - (u - 0.3) / 0.7), 0x9ff5ff);
    },
  });
  real.forEach((a, i) => { const t = [a.pos(V3(0, 0, 0))]; void t; });
  women.forEach((w, i) => d.walk(w, sp.women[i][0], sp.women[i][1], { speed: 0.9 }));
  men.forEach((m, i) => d.walk(m, sp.men[i][0], sp.men[i][1], { speed: 0.9 }));
  cast.bearers.forEach((b, i) => d.walk(b, sp.bearers[i][0], sp.bearers[i][1], { speed: 0.9 }));
  d.walk(bogdan, sp.bogdan[0], sp.bogdan[1], { speed: 0.9 });
  d.shot({ from: lowCam, to: P(-2.6, 6.6, 1.0), look: ground(G, wx, wz, 0.7), fov: 36, dur: 6.5, ease: 'sine', shake: 0.08 });
  await sink;
  G.water?.setUnderGlow?.(wx, wz, 5, 0);
  wiesia.hide();
  await d.wait(1.0);

  // 3. They tie Ola's wrists again.
  cast.ola.show();
  const olaAt = sp.ola;
  d.place(cast.ola, olaAt[0], olaAt[1], faceHole(olaAt));
  cast.ola.id = 'ola';
  ola.hide();
  carry(cast.ola, 'warm_hands');
  d.lookAt(cast.ola, V3(H.x, 0.4, H.z));
  const olaE = cast.ola.eye(V3(0, 0, 0));
  const c3 = ground(G, olaAt[0] + 1.6, olaAt[1] + 2.4, 1.1);
  d.cut({ pos: c3, look: () => cast.ola.at(0.74, V3(0, 0, 0)), fov: 30, shake: 0.1 });
  d.music('procession');
  d.sub(LYRICS[0], 3.8, { italic: true });
  await d.wait(1.6);
  ribbonFor(K, cast.ola);
  d.sfx('page_turn', null, { volume: 0.4 });
  await d.wait(2.6);
  void olaE;

  // 4. Hanka screams at them. Two women hold her.
  const hp = hanka.pos(V3(0, 0, 0));
  d.cut({ pos: ground(G, hp.x - 3.6, hp.z + 3.4, 1.55), look: () => hanka.eye(V3(0, 0, 0)), fov: 34, frame: [0.1, 0.03], shake: 0.25 });
  hanka.c.talk?.(true);
  d.walk(hanka, olaAt[0] + 3.0, olaAt[1] + 1.2, { speed: 3.0, run: true });
  d.sfx('vesna_hurt', null, { volume: 0.4 });
  await d.wait(1.5);
  const hq = hanka.pos(V3(0, 0, 0));
  d.walk(women[0], hq.x - 0.8, hq.z - 0.2, { speed: 3.0, run: true });
  d.walk(women[1], hq.x + 0.8, hq.z - 0.2, { speed: 3.0, run: true });
  await d.wait(1.8);
  hanka.c.setLocomotion?.(0);
  d.anim(hanka, 'cry', { loop: true });
  await d.wait(2.2);
  hanka.c.talk?.(false);

  // 5. They walk Ola to the hole, singing. Wide: Vesna stands apart, watching.
  const v = vesna.pos(V3(0, 0, 0));
  const wide = off(v.x, v.z, vesna.yaw, 0.6, -1.5);
  d.sub(LYRICS[1], 3.8, { italic: true });
  d.cut({ pos: ground(G, wide[0], wide[1], 1.55), look: P(2.0, 3.2, 1.2), fov: 34, frame: [0.12, 0.0], shake: 0.12 });
  d.walk(cast.ola, H.x + 0.3, H.z + 1.9, { speed: 0.8 });
  d.walk(women[2], H.x - 1.0, H.z + 2.4, { speed: 0.8 });
  d.walk(women[3], H.x + 1.6, H.z + 2.4, { speed: 0.8 });
  for (const w of women) w.c.talk?.(true);
  await d.wait(6.5);

  // 6. Ola looks at Vesna once. (lie) OLA: "You said it wouldn't." She goes into the water.
  for (const w of women) w.c.talk?.(false);
  d.music('silence');
  cast.ola.c.stopUpper?.(0.3);
  d.face(cast.ola, vesna);
  d.lookAt(cast.ola, vesna);
  d.cut(d.single(cast.ola, vesna));
  await d.wait(2.2);
  if (lied) {
    await d.say(cast.ola, "You said it wouldn't.", 2.4);
    await d.wait(0.8);
  } else {
    await d.wait(2.0);
  }
  d.cut({ pos: ground(G, v.x - 0.9, v.z + 1.1, 1.55), look: () => vesna.eye(V3(0, 0, 0)), fov: 26, frame: [0.1, 0.04], shake: 0.08 });
  d.sfx('splash', P(0, 0, 0), { volume: 0.7 });
  holes.push(G.water?.addHole?.(H.x + 0.3, H.z + 1.9, 0.9));
  cast.ola.hide();
  await d.wait(3.4);

  // 7. They turn their backs and walk away singing. Nobody looks back.
  d.music('procession');
  d.sub(LYRICS[2], 3.8, { italic: true });
  const behind = off(v.x, v.z, vesna.yaw, 0.4, -1.8);
  d.cut({ pos: ground(G, behind[0], behind[1], 1.6), look: P(0, 4, 1.4), fov: 38, frame: [0.08, 0.0], shake: 0.1 });
  for (const a of real) {
    const p = a.pos(V3(0, 0, 0));
    a.lookAt(null);
    d.face(a, V3(p.x + 0.4, 0, p.z + 40));
    d.walk(a, p.x + (p.x - H.x) * 0.3, p.z + 16, { speed: 1.0 });
  }
  d.walk(hanka, H.x + 6, H.z + 22, { speed: 0.9 });
  hanka.c.stopUpper?.(0.2);
  await d.wait(7.5);

  // 8. The snow keeps falling. Winter does not break.
  d.sub(LYRICS[3], 4, { italic: true });
  const hi = P(-6, 14, 9);
  d.cut({ pos: hi, look: P(0, -2, 0.5), fov: 44 });
  d.shot({ from: hi, to: P(-5, 12, 10), look: P(0, -2, 0.5), fov: 44, dur: 5.5, ease: 'sine', shake: 0.05 });
  G.weather?.gustNow?.(0.6);
  await d.wait(5.0);
  await d.fade(1, 1.2);

  // 9. Later, by day: children stuffing next year's effigy in Dobra's yard, singing.
  d.flag('ending', 'nothing_changes');
  d.weather('snow', 0);
  d.time(14.4, { day: 3 });
  await yardEpilogue(d, K);
  await d.fade(1, 1.4);
  void jolt;
}

// The last image: Dobra's yard, a straw doll, children singing.
async function yardEpilogue(d, K) {
  const G = d.G;
  const V = G.world.locations?.village;
  const yard = V?.workshopYard ? { x: V.workshopYard.x, z: V.workshopYard.z } : { x: -76, z: 153 };
  const kids = [];
  for (let i = 0; i < 4; i++) {
    const a = (([0, 2, 3, 5][i]) / 7) * Math.PI * 2 + 0.4;
    const x = yard.x + Math.cos(a) * 2.3, z = yard.z + Math.sin(a) * 2.3;
    const k = d.actor(`yard_kid_${i}`, { preset: `child_${'adbf'[i]}`, at: [x, z], yaw: yawTo(x, z, yard.x, yard.z), spec: { lowDetail: true } });
    k.play('sit_bench', { loop: true, fade: 0 });
    k.c.talk?.(true);
    kids.push(k);
  }
  const cam = ground(G, yard.x + 6.5, yard.z - 3.5, 1.5);
  d.cut({ pos: cam, look: ground(G, yard.x, yard.z, 0.9), fov: 34 });
  d.fade(0, 1.6);
  d.music('lullaby');
  d.sub('Marzanno, Marzanno, white bride of the frost,', 4, { italic: true });
  d.shot({ from: cam, to: ground(G, yard.x + 5.2, yard.z - 2.6, 1.4), look: ground(G, yard.x, yard.z, 0.9), fov: 34, dur: 8.5, ease: 'linear', shake: 0.04 });
  await d.wait(8.5);
  void K;
}

export default async function ending(d) {
  const K = kit(d);
  try {
    const G = d.G;
    d.setup({ time: 20.9, day: 2, weather: 'blizzard', music: 'sorrow' });
    d.fade(1, 0);
    const S = await finaleStage(d, K, { sword: true });
    d.fade(0, 1.2);
    await run(d, S, K);
    G.weather?.set?.('snow', 0);
    const p = S.vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: p.x, z: p.z, yaw: S.vesna.yaw }, weatherAuto: false, fadeIn: 1.2 });
  } finally {
    K.run();
  }
}
