// C7 Emergence (docs/STORY.md): about 28 s. A pale glow rises under the ice, effigies burst out of the
// drifts, the hole erupts and the marzanna rises: four meters of white cloth and ice, hair floating as if
// underwater, a crown of frozen straw. The villagers run; Hanka does not move. Wiesia's voice, layered
// with a howl. Vesna draws the silver sword and the fight begins.
// Trigger: play straight after c6_procession (it starts from black). Reads nothing. Sets boss_started.
// Boss: uses G.creatures.spawnBoss(x, z, { passive: true }) and boss.emerge() when they exist, otherwise a
// scaled-up wiesia_ghost. At the end the real boss is released with boss.activate() (fight on); Hanka is
// left standing on the ice, paused (the finale controller moves her).
import { kit, anchors, riteCast, riteSpots, ribbonFor, off, ground, V3, jolt, yawTo, carry, torchFor } from './_cine.js';
import { props } from '../../../world/props/index.js';

export default async function c7(d) {
  const G = d.G, K = kit(d);
  let boss = null, fake = null;
  try {
    const R = anchors(G, 'ritual');
    const H = R?.hole ? { x: R.hole.x, z: R.hole.z } : (R?.oldHole ? { x: R.oldHole.x, z: R.oldHole.z } : { x: 11.2, z: -30.8 });
    const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
    d.setup({ time: 20.7, day: 2, weather: 'blizzard', music: 'silence' });
    d.fade(1, 0);
    G.audio?.duck?.(0, 0.1);
    const spots = riteSpots(H);
    const cast = await riteCast(d, K, { women: 8, men: 5, kids: 3 });
    const { bogdan, hanka, ola, women, men, kids, bearers } = cast;
    const vesna = d.player();
    const faceHole = (xz) => yawTo(xz[0], xz[1], H.x, H.z);
    const put = (a, xz, yaw) => d.place(a, xz[0], xz[1], yaw ?? faceHole(xz));
    put(bogdan, spots.bogdan); put(ola, spots.ola); put(bearers[0], spots.bearers[0]); put(bearers[1], spots.bearers[1]);
    put(hanka, spots.hanka);
    women.forEach((w, i) => put(w, spots.women[i])); men.forEach((m, i) => put(m, spots.men[i])); kids.forEach((k, i) => put(k, spots.kids[i]));
    put(vesna, [spots.vesna[0] + 3, spots.vesna[1] - 4]);
    for (const m of men.slice(0, 3)) { carry(m, 'carry_torch'); torchFor(K, m, { light: true }); }
    carry(ola, 'warm_hands');
    if (R?.hole?.open) R.hole.open(); else G.water?.addHole?.(H.x, H.z, 0.95);
    G.water?.setCracks?.(H.x, H.z, 24, 0.8);
    for (const a of cast.all) a.lookAt(V3(H.x, 0, H.z));
    vesna.play('idle_cold', { loop: true, fade: 0 });
    // Keep Hanka standing on the ice for the fight and the endings.
    const hn = G.npcs?.get?.('hanka');
    if (hn) G.events.once('cutscene:end', () => { try { hn.pause?.(true); hn.character?.setVisible?.(true); } catch { /* optional */ } });

    const glow = (r, k) => G.water?.setUnderGlow?.(H.x, H.z, r, k, 0x9ff5ff);
    K.add(() => glow(8, 0));

    // 1. LOW ANGLE on the ice: a pale glow spreads beneath like a lantern rising through deep water.
    const low = P(-1.5, 6.5, 0.28);
    d.cut({ pos: low, look: P(0.2, 0, 0.4), fov: 46, shake: 0.18 });
    d.fade(0, 1.0);
    G.story.sched.tween({ dur: 5.0, ease: 'in', step: (u) => glow(2 + 7 * u, 1.6 * u) });
    d.shot({ from: low, to: P(-1.2, 5.6, 0.3), look: P(0.2, 0, 0.4), fov: 46, dur: 4.6, ease: 'sine', shake: 0.2 });
    d.sfx('ice_groan', P(0, 0, 0));
    await d.wait(3.6);

    // 2. Effigies burst up out of the snow drifts around the ring, ice cracking off them.
    const ringAt = [[-9.5, 2], [9.8, 1], [-7, -8.5], [7.6, -8.2], [0.4, -11], [-10.8, -3.5]];
    const risers = ringAt.map(([dx, dz], i) => {
      const g = props.effigy({ variant: 'frozen', seed: 20 + i, fx: false });
      const y = G.world.heightAt(H.x + dx, H.z + dz);
      g.position.set(H.x + dx, y - 2.2, H.z + dz);
      g.rotation.y = yawTo(H.x + dx, H.z + dz, H.x, H.z);
      g.scale.setScalar(1.22);
      G.scene.add(g);
      K.add(() => g.parent?.remove(g));
      return { g, y };
    });
    let burst = d.cut({ pos: P(0.5, 7.5, 1.3), look: P(0, -7, 1.5), fov: 62, shake: 0.35 });
    void burst;
    jolt(d, 1.0, 2.0);
    d.sfx('ice_crack', P(-8, -4, 0));
    d.sfx('effigy_creak', P(8, -5, 0));
    risers.forEach((r, i) => {
      d.wait(i * 0.28).then(() => {
        d.tween(r.g.position, 'y', r.y, 1.1, 'out');
        d.tween(r.g.rotation, 'z', (i % 2 ? 1 : -1) * 0.12, 1.1, 'out');
      });
    });
    d.shot({ from: P(0.5, 7.5, 1.3), to: P(0.2, 6.6, 1.5), look: P(0, -7, 1.5), fov: 62, dur: 3.4, ease: 'linear', shake: 0.35 });
    await d.wait(3.2);

    // 3. The hole erupts. The marzanna rises.
    G.postfx?.flash?.(0xcfeeff, 0.7);
    d.music('boss');
    d.sfx('boss_scream', P(0, 1, 0), { volume: 0.9 });
    if (G.creatures?.spawnBoss) {
      boss = G.creatures.spawnBoss(H.x, H.z, { passive: true, emerge: false, yaw: Math.PI });
      boss.emerge?.();
    } else {
      fake = d.actor('boss_stand_in', { preset: 'wiesia_ghost', at: [H.x, H.z], yaw: Math.PI });
      fake.c.autoGround = false;
      fake.c.root.scale.set(2.5, 2.72, 2.5);
      fake.c.root.position.y = -4.8;
      d.tween(fake.c.root.position, 'y', 0.62, 4.4, 'out');
      fake.play('idle', { loop: true });
      K.add(() => { fake.c.root.scale.set(1, 1, 1); fake.c.autoGround = true; });
    }
    const bossHead = () => {
      if (boss?.root) return boss.root.getWorldPosition(V3(0, 0, 0)).add(V3(0, 3.3, 0));
      return fake ? fake.c.root.position.clone().add(V3(0, 3.1, 0)) : P(0, 3.5, 0);
    };
    const eruptCam = P(-0.6, 8.5, 0.5);
    d.cut({ pos: eruptCam, look: P(0, 0.4, 0), fov: 52, shake: 0.5 });
    glow(9, 2.2);
    jolt(d, 1.4, 3.0);
    d.shot({ from: eruptCam, to: P(-0.2, 9.5, 1.3), look: P(0, 0.6, 0), lookTo: bossHead, fov: 52, fovTo: 56, dur: 5.4, ease: 'inOut', shake: 0.4 });

    // 4. The villagers scatter. Hanka does not move.
    await d.wait(1.0);
    const scatter = [...women, ...men, ...kids, ...bearers, bogdan, ola];
    scatter.forEach((a, i) => {
      const p = a.pos(V3(0, 0, 0));
      const away = yawTo(H.x, H.z, p.x, p.z) + (i % 3 - 1) * 0.35;
      const [x, z] = off(p.x, p.z, away, 0, 12 + (i % 4));
      a.c.stopUpper?.(0.1);
      d.walk(a, x, z, { speed: 3.3, run: true });
      a.c.talk?.(true);
    });
    hanka.c.lookAt?.(bossHead());
    await d.wait(2.8);
    for (const a of scatter) a.c.talk?.(false);

    // 5. WIESIA, her voice layered with a howl: "Don't go. Don't go. Don't go."
    const vp = vesna.pos(V3(0, 0, 0));
    const c5 = off(vp.x, vp.z, vesna.yaw, 0.7, 1.7);
    d.cut({ pos: ground(G, c5[0], c5[1], 1.45), look: () => vesna.eye(V3(0, 0, 0)), fov: 28, frame: [0.1, 0.05], shake: 0.25 });
    for (let i = 0; i < 3; i++) {
      d.sfx('boss_scream', P(0, 2, 0), { volume: 0.6 + i * 0.15 });
      await d.say('wiesia', "Don't go.", 1.3);
      jolt(d, 0.9, 1.0);
    }

    // 6. Vesna draws her silver sword. The fight begins.
    const eye = () => vesna.eye(V3(0, 0, 0));
    const c6 = off(vp.x, vp.z, vesna.yaw, -0.6, -2.4);
    d.cut({ pos: ground(G, c6[0], c6[1], 1.25), look: () => eye().add(V3(0, 0.1, 3.0)), fov: 40, frame: [0.0, -0.05], shake: 0.2 });
    d.face(vesna, V3(H.x, 0, H.z));
    await d.wait(0.5);
    const draw = vesna.c.drawSword ? Promise.resolve(vesna.c.drawSword('silver')) : d.anim(vesna, 'draw_sword');
    d.shot({ from: ground(G, c6[0], c6[1], 1.25), to: ground(G, c6[0] + Math.sin(vesna.yaw) * 1.0, c6[1] + Math.cos(vesna.yaw) * 1.0, 1.3), look: () => eye().add(V3(0, 0.2, 3.0)), lookTo: bossHead, fov: 40, dur: 3.6, ease: 'sine', shake: 0.2 });
    d.sfx('sword_draw');
    await d.wait(3.4);
    void draw;

    d.flag('boss_started');
    const pp = vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: pp.x, z: pp.z, yaw: vesna.yaw }, fadeIn: 0.4 });
    if (boss) { boss.passive = false; boss.activate?.(); }
    void ribbonFor;
  } finally {
    glowOff(G, H0(G));
    K.run();
    if (!boss && fake) { /* the stand-in is a scene actor and is released with the stage */ }
  }
}

function H0(G) {
  const R = anchors(G, 'ritual');
  return R?.hole ? { x: R.hole.x, z: R.hole.z } : { x: 11.2, z: -30.8 };
}
function glowOff(G, H) { G.water?.setUnderGlow?.(H.x, H.z, 8, 0); }
