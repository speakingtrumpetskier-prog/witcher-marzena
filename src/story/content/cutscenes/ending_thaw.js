// Ending A: The Thaw (docs/STORY.md), about 80 s. Vesna strikes. Wiesia comes apart into snow, the ice
// breaks outward in a ring, the bell tower sinks, and the whole valley thaws in one dawn. The village
// cheers, then stops when they look at Vesna. Hanka kneels at the waterline alone.
// Trigger: the finale controller plays it when the player picks "Strike" at the 25 percent choice
// (or finale_choice runs it inline). Reads bird_given. Sets ending = 'thaw'. Standalone: it stages the
// finale itself. Ends at dawn (day 3, 07:36), weather clear and auto on, snow gone, spring in, the
// lake open water, the player standing on the shore.
import { kit, finaleStage, dissolve, waterline, ground, off, V3, jolt, yawTo, spawn, whiteWoman } from './_cine.js';
import { thaw, shatterIce } from '../thaw.js';
import { props } from '../../../world/props/index.js';

// The village on the shore: a small crowd, built low-detail.
export async function shoreCrowd(d, K, at, n = 11) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const woman = i % 3 !== 2;
    const preset = woman ? whiteWoman(`villager_f_${[1, 3, 5, 6, 8, 9, 11, 12][i % 8]}`) : `villager_m_${[2, 4, 5, 7, 9, 10][i % 6]}`;
    const a = await spawn(d, `shore_${i}`, i === n - 1 ? 'child_b' : preset, 0, 0, 0, { low: true });
    const ang = (i / n) * 2.2 - 1.1;
    const x = at.x + Math.sin(ang) * 6.5 + ((i * 37) % 7) * 0.2, z = at.z + 1.2 + Math.cos(ang) * 2.6 + (i % 3) * 1.0;
    d.place(a, x, z, Math.PI);
    a.play('idle_cold', { loop: true, fade: 0 });
    out.push(a);
  }
  return out;
}

export async function run(d, S, K) {
  const G = d.G;
  const { H, vesna, wiesia, hanka, ola } = S;
  const bird = !!S.bird;
  const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
  const wz = wiesia.pos(V3(0, 0, 0));
  const wf = () => wiesia.eye(V3(0, 0, 0));

  // 1. Silver goes in. Wiesia gasps, surprised, almost relieved: "Oh." She comes apart into snow on the wind.
  d.music('silence');
  const to = [wz.x + Math.sin(vesna.yaw) * -1.7, wz.z + Math.cos(vesna.yaw) * -1.7];
  const closeIn = d.walk(vesna, to[0], to[1], { speed: 1.5 });
  d.cut({ pos: P(4.2, 4.6, 1.5), look: () => wiesia.at(0.55, V3(0, 0, 0)), fov: 38, frame: [0.0, 0.03], shake: 0.12 });
  d.shot({ from: P(4.2, 4.6, 1.5), to: P(3.5, 3.9, 1.45), look: () => wiesia.at(0.55, V3(0, 0, 0)), fov: 38, dur: 3.6, ease: 'linear', shake: 0.12 });
  await closeIn;
  d.face(vesna, wiesia);
  await d.wait(0.9);
  const eyeV = vesna.pos(V3(0, 0, 0));
  d.cut({ pos: ground(G, wz.x - 1.7, wz.z + 0.5, 1.0), look: () => wf().add(V3(0, -0.02, 0)), fov: 26, frame: [0.05, 0.05], shake: 0.1 });
  d.anim(vesna, 'heavy_attack');
  await d.wait(0.95);
  d.sfx('hit_ice');
  G.postfx?.flash?.(0xeaf6ff, 0.35);
  jolt(d, 0.9, 1.0);
  wiesia.c.stopUpper?.(0.1);
  wiesia.c.expression?.('eyesWide', 0.5, 0.1);
  d.stinger('reveal');
  await d.say('wiesia', 'Oh.', 1.8);
  void eyeV;
  G.weather?.gustNow?.(1.2);
  G.weather?.set?.('clear', 7);
  dissolve(d, wiesia, { secs: 2.6, drift: V3(1.6, 1.8, -1.2) });
  d.shot({ from: ground(G, wz.x - 1.7, wz.z + 0.5, 1.0), to: ground(G, wz.x - 2.2, wz.z + 1.3, 1.5), look: () => P(0.6, 2.0, 1.3), fov: 30, dur: 3.6, ease: 'sine', shake: 0.15 });
  await d.wait(3.4);
  vesna.c.sheatheSword?.();

  // 2. Silence. Then a crack like the world breaking. The ice shatters outward in a ring from the hole.
  d.music('silence');
  await d.wait(1.4);
  const hi = P(0, -17, 14);
  d.cut({ pos: hi, look: P(0, 4, 0), fov: 56 });
  d.sfx('ice_crack', P(0, 0, 0), { volume: 1 });
  d.shot({ from: hi, to: P(0, -22, 18), look: P(0, 4, 0), fov: 56, dur: 5.5, ease: 'out', shake: 0.45 });
  jolt(d, 1.4, 3.0);
  await shatterIce(G, d, { x: H.x, z: H.z, radius: 95, dur: 4.0 });
  d.sfx('ice_groan', P(0, 0, 0));

  // 3. The bell tower groans, leans, and slowly sinks into the black water, the bell tolling once.
  const tw = G.world.locations?.bellTower?.placed;
  const T = ground(G, 120, -150, 8);
  d.cut({ pos: P(-3, 0, 2.2), look: T, fov: 18 });
  d.sfx('ice_groan', T);
  const sinking = import('../thaw.js').then((m) => m.sinkTower(G, d, { dur: 9 }));
  d.shot({ from: P(-3, 0, 2.2), to: P(-1, -1, 2.4), look: T, fov: 18, dur: 9, ease: 'linear', shake: 0.08 });
  await d.wait(4.5);
  d.music('thaw');
  await sinking;
  void tw;

  // 4. Dawn time-lapse: the snow slides off, the lake opens on a gold sky, leaves, green, birds.
  const L = thawShots(d, S, K);
  await d.fade(1, 0.9);
  const lapse = thaw(G, d, { speed: 1, gentle: false, tower: false, startHour: 4.7 });
  L.placeShore();
  await L.run();
  await lapse;

  // 5 to 7. The village on the shore.
  await L.shore();
  d.flag('ending', 'thaw');
  void bird; void hanka; void ola; void off; void yawTo; void props;
}

// The shore after the thaw: staging shared between the time-lapse and the aftermath.
function thawShots(d, S, K) {
  const G = d.G;
  const { vesna, hanka, ola } = S;
  const hx = 68, wlz = waterline(G, hx);
  const hankaAt = [hx, wlz + 1.6], olaAt = [hx + 2.2, wlz + 1.9];
  const vesnaAt = [27, waterline(G, 27) + 4.5];
  const crowdAt = { x: 49, z: waterline(G, 49) + 4 };
  let crowd = [];
  return {
    placeShore() {
      d.place(hanka, hankaAt[0], hankaAt[1], Math.PI);
      d.place(ola, olaAt[0], olaAt[1], Math.PI);
      d.place(vesna, vesnaAt[0], vesnaAt[1], Math.PI);
      hanka.play('kneel_idle', { loop: true, fade: 0 });
      ola.play('idle', { loop: true, fade: 0 });
      vesna.c._setSword?.(false);
      vesna.play('idle_cold', { loop: true, fade: 0 });
    },
    async run() {
      const hill = ground(G, -36, 190, 1.8);
      // a) the village from the sledding hill, snow sliding off roofs
      d.cut({ pos: hill, look: ground(G, 0, 90, 4), fov: 42 });
      d.fade(0, 1.2);
      d.shot({ from: hill, to: hill.clone().add(V3(7, 3.0, 4)), look: ground(G, 0, 90, 4), lookTo: ground(G, 20, 80, 5), fov: 42, dur: 7, ease: 'linear', shake: 0.05 });
      await d.wait(7);
      // b) the lake opens: low over the water at the shore, a gold sky in it
      const lake = ground(G, 8, 34, 1.7);
      d.cut({ pos: lake, look: ground(G, 90, -30, 3.0), fov: 46 });
      d.shot({ from: lake, to: ground(G, 12, 31, 2.0), look: ground(G, 90, -30, 3.0), lookTo: ground(G, 96, -22, 3.5), fov: 46, dur: 7, ease: 'linear', shake: 0.05 });
      await d.wait(7);
      // c) birches and grass on the slope above the shore, birds
      const slope = ground(G, 56, 76, 1.6);
      d.cut({ pos: slope, look: ground(G, 40, 48, 1.2), fov: 38 });
      d.shot({ from: slope, to: ground(G, 52, 72, 1.7), look: ground(G, 40, 48, 1.2), fov: 38, dur: 7, ease: 'linear', shake: 0.05 });
      await d.wait(6.5);
    },
    async shore() {
      crowd = await shoreCrowd(d, K, crowdAt, 11);
      const faceLake = Math.PI;
      for (const a of crowd) a.play('idle_cold', { loop: true, fade: 0 });
      // The village cheers.
      const wide = ground(G, crowdAt.x - 7, crowdAt.z + 8.5, 1.8);
      d.cut({ pos: wide, look: ground(G, crowdAt.x, crowdAt.z - 1, 1.3), fov: 40 });
      d.sfx('child_laugh');
      for (const a of crowd) { a.c.talk?.(true); d.anim(a, 'wave'); }
      d.shot({ from: wide, to: ground(G, crowdAt.x - 5.5, crowdAt.z + 7.2, 1.8), look: ground(G, crowdAt.x, crowdAt.z - 1, 1.3), fov: 40, dur: 4.6, ease: 'linear', shake: 0.08 });
      await d.wait(3.8);
      // Then the cheering stops: they have looked at Vesna. Nobody comes near her.
      for (const a of crowd) { a.c.talk?.(false); a.face(vesna); a.lookAt(vesna); }
      d.music('sorrow');
      const v = vesna.pos(V3(0, 0, 0));
      const c2 = ground(G, v.x + 2.7, v.z + 3.0, 1.55);
      d.cut({ pos: c2, look: () => vesna.at(0.78, V3(0, 0, 0)), fov: 32, frame: [-0.12, 0.02], shake: 0.1 });
      d.shot({ from: c2, to: ground(G, v.x + 3.4, v.z + 3.8, 1.6), look: () => vesna.at(0.78, V3(0, 0, 0)), fov: 32, frame: [-0.12, 0.02], dur: 5, ease: 'sine', shake: 0.1 });
      await d.wait(4.2);
      const far = ground(G, (v.x + crowdAt.x) / 2, v.z - 17, 2.0);
      d.cut({ pos: far, look: ground(G, (v.x + crowdAt.x) / 2, v.z + 0.5, 1.3), fov: 42 });
      await d.wait(2.6);
      // Hanka kneels at the waterline, alone, her hand in the water.
      const hk = ground(G, hankaAt[0] - 5.5, hankaAt[1] + 4.2, 1.5);
      d.cut({ pos: hk, look: () => hanka.at(0.5, V3(0, 0, 0)), fov: 34, frame: [-0.1, 0.0] });
      hanka.play('kneel_idle', { loop: true, fade: 0 });
      d.shot({ from: hk, to: ground(G, hankaAt[0] - 4.4, hankaAt[1] + 3.4, 1.4), look: () => hanka.at(0.5, V3(0, 0, 0)), fov: 34, frame: [-0.1, 0.0], dur: 6, ease: 'sine', shake: 0.08 });
      await d.wait(3.2);
      // Ola stands beside her mother and looks at Vesna. The waxwing floats in to the shore.
      d.face(ola, vesna);
      d.lookAt(ola, vesna);
      const bird = S.bird;
      if (bird) {
        const pb = bird.parent; pb?.remove(bird);
        G.scene.add(bird);
        bird.rotation.set(0, 0.6, 0);
        bird.scale.setScalar(2.2);
        const a = V3(hankaAt[0] - 0.4, 0.06, hankaAt[1] - 4.6), b = V3(hankaAt[0] - 0.25, 0.06, hankaAt[1] - 0.3);
        bird.position.copy(a);
        G.story.sched.tween({ dur: 5.0, ease: 'out', step: (u) => { bird.position.lerpVectors(a, b, u); bird.position.y = 0.05 + Math.sin(u * 14) * 0.012; } });
      }
      d.cut({ pos: ground(G, hankaAt[0] + 1.0, hankaAt[1] + 3.4, 1.2), look: () => ola.at(0.82, V3(0, 0, 0)), fov: 30, frame: [0.05, 0.0] });
      await d.wait(4.2);
      await d.fade(1, 1.6);
      void faceLake;
    },
  };
}

export default async function ending(d) {
  const K = kit(d);
  try {
    const G = d.G;
    d.setup({ time: 20.9, day: 2, weather: 'blizzard', music: 'boss' });
    d.fade(1, 0);
    const S = await finaleStage(d, K, { sword: true });
    d.fade(0, 1.4);
    await run(d, S, K);
    G.weather?.set?.('clear', 0);
    G.time.setHours(7.6);
    d.end({ player: { x: S.vesna.pos(V3(0, 0, 0)).x, z: S.vesna.pos(V3(0, 0, 0)).z, yaw: Math.PI }, weatherAuto: false, fadeIn: 1.2 });
  } finally {
    K.run();
  }
}
