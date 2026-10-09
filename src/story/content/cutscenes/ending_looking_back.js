// Ending B: Looking Back (docs/STORY.md), about 90 s. Vesna lowers the sword and calls Hanka. Hanka walks
// out onto the cracked ice, kneels, and does not look away. Wiesia lets go. A slow, quiet dawn.
// Then, by what Hanka was told: she goes back to Ola (hanka_comforted), or into the water after her
// daughter (hanka_blamed, also the default). Ola does not follow; Vesna holds her.
// Trigger: the finale controller plays it when the player calls "Hanka." (also the default when the
// 15 s timer runs out). Reads hanka_comforted, hanka_blamed, bird_given. Sets ending = 'looking_back'.
// Standalone: it stages the finale itself. Ends at dawn, day 3, 07:36, spring in, the lake open.
import { kit, finaleStage, ground, off, V3, jolt, yawTo, disposeProp } from './_cine.js';
import { thaw } from '../thaw.js';

export async function run(d, S, K) {
  const G = d.G;
  const { H, vesna, wiesia, hanka, ola } = S;
  const comforted = !!G.state.flag('hanka_comforted') && !G.state.flag('hanka_blamed');
  const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
  const [wx, wz] = wiesia.pos0;
  const W = (h = 0) => ground(G, wx, wz, h);
  const holes = [];

  // 1. Vesna lowers her sword. VESNA (over her shoulder): "Hanka."
  d.music('sorrow');
  const wide = P(-6.5, 4.8, 2.0);
  d.cut({ pos: wide, look: W(0.9), fov: 46, shake: 0.1 });
  d.shot({ from: wide, to: P(-5.6, 4.6, 1.9), look: W(0.9), fov: 46, dur: 4.2, ease: 'linear', shake: 0.1 });
  await d.wait(2.2);
  vesna.play('idle_cold', { loop: true, fade: 0.8 });
  await d.wait(1.8);
  const vp = vesna.pos(V3(0, 0, 0));
  const front = off(vp.x, vp.z, vesna.yaw, 1.3, 1.9);
  d.cut({ pos: ground(G, front[0], front[1], 1.5), look: () => vesna.eye(V3(0, 0, 0)), fov: 30, frame: [0.0, 0.05], shake: 0.1 });
  vesna.c.playUpper?.('look_back', { loop: false, fade: 0.4, hold: true });
  await d.wait(1.6);
  await d.say(vesna, 'Hanka.', 1.6);
  d.cut(d.single(hanka, vesna));
  hanka.play('idle_cold', { loop: true, fade: 0.2 });
  await d.wait(2.2);
  vesna.c.stopUpper?.(0.6);

  // 2. Hanka walks out alone across the cracked ice. She stops in front of her daughter and kneels.
  const stop = [wx + 0.15, wz + 1.55];
  const go = d.walk(hanka, stop[0], stop[1], { speed: 1.05 });
  d.sfx('ice_groan', P(0, 3, 0), { volume: 0.7 });
  d.follow(hanka, [-2.4, 1.55, 2.3], () => hanka.eye(V3(0, 0, 0)), 0, { lag: 2.6, fov: 36, frame: [0.08, 0.02], shake: 0.12 });
  await go;
  d.face(hanka, wiesia);
  hanka.c.lookAt?.(wiesia.c.bones?.head || null);
  await d.wait(0.6);
  d.cut(d.two(hanka, wiesia));
  d.anim(hanka, 'kneel');
  await d.wait(2.2);

  // 3. Close on Hanka's face. She does not look away.
  hanka.play('kneel_idle', { loop: true, fade: 0.2 });
  d.cut(d.close(hanka, wiesia));
  await d.wait(1.4);
  await d.say(hanka, 'Wiesiu.', 1.8);
  await d.wait(0.9);
  await d.say(hanka, "Wiesiu, I'm here. I'm sorry. I'm here.", 4.2);

  // 4. WIESIA: "Mama, it's cold." HANKA: "I know. I know it is."
  wiesia.c.stopUpper?.(0.5);
  wiesia.play('kneel_idle', { loop: true, fade: 0.4 });
  d.face(wiesia, hanka);
  wiesia.c.lookAt?.(hanka.c.bones?.head || null);
  d.cut(d.close(wiesia, hanka));
  await d.wait(1.6);
  await d.say('wiesia', "Mama, it's cold.", 2.4);
  d.cut(d.close(hanka, wiesia));
  await d.say(hanka, 'I know. I know it is.', 2.8);
  await d.wait(1.2);

  // 5. Wiesia lets go. She sinks gently, lit from below, looking up at her mother until she is a small light.
  const id = G.water?.addHole?.(wx, wz, 0.9);
  if (id != null && id >= 0) holes.push(id);
  K.add(() => holes.forEach((h) => G.water?.removeHole?.(h)));
  d.sfx('ice_ping', W(0));
  const above = W(6.2);
  d.cut({ pos: above.clone().add(V3(0.4, 0, 1.6)), look: W(0), fov: 40, shake: 0.06 });
  d.shot({ from: above.clone().add(V3(0.4, 0, 1.6)), to: above.clone().add(V3(0.2, 1.4, 0.8)), look: W(0), fov: 40, dur: 8, ease: 'sine', shake: 0.06 });
  let birdOnIce = false;
  const drop = G.story.sched.tween({
    dur: 7.2, ease: 'inOut',
    step: (u) => {
      wiesia.c.root.position.y = G.world.heightAt(wx, wz) - 2.6 * u * u;
      const k = u < 0.35 ? 0.4 + u * 2.2 : 1.2 * (1 - (u - 0.35) / 0.65) ** 1.4;
      G.water?.setUnderGlow?.(wx, wz, 6 * (1 - u * 0.78), k, 0x9ff5ff);
      if (!birdOnIce && u > 0.22 && S.bird) {
        birdOnIce = true;
        const b = S.bird;
        b.parent?.remove(b);
        b.scale.setScalar(2.2);
        b.rotation.set(0, 0.7, 0);
        b.position.set(wx + 0.28, G.world.heightAt(wx, wz) + 0.02, wz + 0.18);
        G.scene.add(b);
        K.add(() => disposeProp(b));
      }
    },
  });
  await d.wait(3.2);
  const hk = hanka.eye(V3(0, 0, 0));
  d.cut({ pos: ground(G, hk.x - 1.5, hk.z + 1.1, 1.0), look: () => hanka.eye(V3(0, 0, 0)).add(V3(0, -0.05, 0)), fov: 26, frame: [0.05, 0.05], shake: 0.06 });
  await drop;
  G.water?.setUnderGlow?.(wx, wz, 5, 0);
  wiesia.hide();
  await d.wait(1.4);

  // 6. The snow stops. The ice softens. A slow, quiet dawn; spring comes gently.
  const lapse = thaw(G, d, { speed: 1.2, gentle: true, tower: false });
  const lowSun = P(-4, 12, 1.5);
  d.cut({ pos: lowSun, look: P(0, 0, 1.2), fov: 38, shake: 0.05 });
  d.shot({ from: lowSun, to: P(-3.2, 10.5, 2.0), look: P(0, 0, 1.2), fov: 38, dur: 9, ease: 'sine', shake: 0.05 });
  await d.wait(8.4);

  // 7. Hanka goes to Ola, or into the water after Wiesia.
  hanka.play('kneel_idle', { loop: true, fade: 0.2 });
  const olaP = ola.pos(V3(0, 0, 0));
  if (comforted) {
    d.anim(hanka, 'stand_up');
    await d.wait(1.6);
    const meet = [olaP.x - 0.9, olaP.z - 0.9];
    const walk = d.walk(hanka, meet[0], meet[1], { speed: 1.2 });
    d.walk(ola, olaP.x - 0.2, olaP.z - 1.8, { speed: 1.5 });
    d.follow(hanka, [1.8, 1.5, -2.8], () => hanka.at(0.8, V3(0, 0, 0)), 0, { lag: 2.4, fov: 34, shake: 0.08 });
    await walk;
    d.face(ola, hanka);
    d.face(hanka, ola);
    d.anim(hanka, 'hug');
    d.anim(ola, 'hug');
    const both = hanka.pos(V3(0, 0, 0)).lerp(ola.pos(V3(0, 0, 0)), 0.5);
    d.cut({ pos: ground(G, both.x + 2.8, both.z + 2.6, 1.5), look: ground(G, both.x, both.z, 1.1), fov: 32, shake: 0.06 });
    await d.wait(3.0);
    // Ola looks over her mother's shoulder at Vesna and nods, like an adult.
    d.lookAt(ola, vesna);
    const oe = ola.eye(V3(0, 0, 0));
    d.cut({ pos: ground(G, oe.x - 1.2, oe.z + 1.5, 1.3), look: oe, fov: 24, frame: [0.0, 0.04], shake: 0.05 });
    await d.wait(1.8);
    d.anim(ola, 'nod');
    await d.wait(2.6);
  } else {
    d.anim(hanka, 'stand_up');
    await d.wait(1.5);
    const face = V3(wx, 0, wz);
    d.cut({ pos: P(-3.5, 9.5, 1.8), look: () => hanka.at(0.8, V3(0, 0, 0)), fov: 38, shake: 0.06 });
    const step = d.walk(hanka, wx, wz + 0.15, { speed: 0.8 });
    d.face(hanka, face);
    await d.wait(1.8);
    // Ola calls. Hanka does not turn around.
    d.face(ola, hanka);
    await d.say(ola, 'Mama!', 1.8);
    ola.play('run', { loop: true });
    d.walk(ola, wx + 2.0, wz + 2.4, { speed: 3.2, run: true });
    await step;
    hanka.c.autoGround = false;
    K.add(() => { hanka.c.autoGround = true; });
    d.tween(hanka.c.root.position, 'y', -2.4, 3.0, 'in');
    d.sfx('splash', W(0), { volume: 0.5 });
    // Vesna catches Ola before she can follow and holds her.
    const op = ola.pos(V3(0, 0, 0));
    const catchAt = [wx + 2.8, wz + 3.2];
    d.walk(vesna, catchAt[0], catchAt[1], { speed: 3.4, run: true });
    d.cut({ pos: P(-3.6, 8.4, 1.6), look: ground(G, wx + 2.5, wz + 2.7, 1.0), fov: 40, shake: 0.2 });
    await d.wait(2.2);
    d.face(vesna, ola, { instant: true });
    d.place(ola, catchAt[0] - 0.55, catchAt[1] - 0.45, yawTo(catchAt[0], catchAt[1], wx, wz));
    ola.c.setLocomotion?.(0);
    d.anim(vesna, 'hug');
    d.anim(ola, 'cry', { loop: true });
    ola.c.talk?.(true);
    void op;
    d.sfx('child_laugh', null, { volume: 0 });
    const hold = vesna.pos(V3(0, 0, 0));
    d.cut({ pos: ground(G, hold.x - 2.6, hold.z + 1.6, 1.4), look: ground(G, hold.x - 0.3, hold.z - 0.2, 1.0), fov: 30, shake: 0.08 });
    await d.wait(3.6);
    // Long shot: the two of them on the ice, the open water still.
    ola.c.talk?.(false);
    const lng = P(-14, 17, 4.5);
    d.cut({ pos: lng, look: P(1.2, 1.5, 0.6), fov: 34 });
    d.shot({ from: lng, to: P(-13, 16.5, 5.0), look: P(1.2, 1.5, 0.6), fov: 34, dur: 6, ease: 'sine', shake: 0.04 });
    await d.wait(5.6);
  }
  await lapse;
  await d.fade(1, 1.8);
  d.flag('ending', 'looking_back');
}

export default async function ending(d) {
  const K = kit(d);
  try {
    const G = d.G;
    d.setup({ time: 20.9, day: 2, weather: 'blizzard', music: 'sorrow' });
    d.fade(1, 0);
    const S = await finaleStage(d, K, { sword: true });
    d.fade(0, 1.4);
    await run(d, S, K);
    G.weather?.set?.('clear', 0);
    G.time.setHours(7.6);
    const p = S.vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: p.x, z: p.z, yaw: S.vesna.yaw }, weatherAuto: false, fadeIn: 1.2 });
    void jolt;
  } finally {
    K.run();
  }
}
