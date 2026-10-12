// C4 The Echo (docs/STORY.md): about 60 s. At the old hole in the ice Vesna reads the place: the world
// drains to cold blue and the rite of three years ago walks across the ice again, pale turquoise and
// translucent. Wiesia goes through; the procession turns for home and does not look back. Hanka does,
// for one heartbeat.
// Trigger: G.senses echo clue at LOC.ritual (G.senses.addClue({ kind: 'echo', cutscene: 'c4_echo' })), night 1.
// Sets echo_seen. Ends with Vesna standing at the hole looking at the shore; the look returns to night.
import { kit, anchors, torchFor, carry, uncarry, off, ground, V3, jolt, spawn, yawTo, disposeProp, ghostHands } from './_cine.js';
import { props } from '../../../world/props/index.js';
import { LOC } from '../../../world/layout.js';

const LYRICS = [
  'Marzanno, Marzanno, white bride of the frost,',
  'we carry you, we carry you, to the water deep.',
  'Do not follow, do not follow, we will not look back.',
  'Go down, go down, and let the green come back.',
];

export default async function c4(d) {
  const G = d.G, K = kit(d);
  const holeIds = [];
  try {
    const R = anchors(G, 'ritual');
    const H = R?.oldHole ? { x: R.oldHole.x, z: R.oldHole.z } : { x: 11.2, z: -30.8 };
    const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
    d.setup({ time: 22.0, weather: 'clear', music: 'night' });
    d.fade(1, 0);
    G.water?.setCracks?.(H.x, H.z, 3, 0);
    const vesna = d.player();
    const west = off(H.x, H.z, Math.PI / 2, 0, -2.3);
    d.place(vesna, H.x - 2.3, H.z + 0.4, Math.PI / 2);
    vesna.play('kneel_idle', { loop: true, fade: 0 });
    void west;

    // Ghost cast, built low-detail and kept off screen until the vision starts.
    const roster = [
      ['wiesia', 'wiesia_ghost'], ['hanka', 'hanka'], ['marta', 'villager_f_6'],
      ['w3', 'villager_f_2'], ['w4', 'villager_f_9'], ['w5', 'villager_f_4'], ['w6', 'villager_f_11'],
      ['w7', 'elder_f'], ['w8', 'villager_f_8'], ['w9', 'villager_f_3'], ['w10', 'villager_f_12'],
    ];
    const gh = {};
    for (const [id, preset] of roster) {
      const a = await spawn(d, `c4_${id}`, preset, H.x, H.z + 40, Math.PI, { low: true });
      a.hide();
      gh[id] = a;
    }
    const all = roster.map(([id]) => gh[id]);
    const wiesia = gh.wiesia, hanka = gh.hanka, marta = gh.marta;

    // Formation: Wiesia in front, Hanka behind her; Marta beside Hanka; the rest in pairs.
    const start = { x: H.x, z: H.z + 15.5 };
    const slot = (i) => {
      if (i === 0) return [0, 0];
      const row = Math.ceil(i / 2);
      const lat = i % 2 ? -0.85 : 0.85;
      return [lat, row * 1.75];
    };
    const spots = (zFront) => all.map((a, i) => { const [lat, back] = slot(i); return [H.x + lat, zFront + back]; });
    const startPos = spots(start.z);
    all.forEach((a, i) => { d.place(a, startPos[i][0], startPos[i][1], Math.PI); });

    // Torches in every hand but Wiesia's; she carries the straw Marzanna on its pole.
    for (const a of all) {
      if (a === wiesia) continue;
      carry(a, 'carry_torch');
      torchFor(K, a, { light: false });
    }
    carry(wiesia, 'carry_pole');
    let effigy = null;
    try {
      effigy = props.effigy({ variant: 'pole', seed: 3, fx: false });
      wiesia.c.root.add(effigy);
      effigy.position.set(0.04, 0.2, 0.46);
      effigy.scale.setScalar(0.8);
      K.add(() => disposeProp(effigy));
    } catch (e) { console.warn('[c4] effigy', e); }

    const eye = () => vesna.eye(V3(0, 0, 0));
    const fadeGhosts = (to, secs) => {
      const m = wiesia._ghost?.[0]?.[0]?.material;
      return m ? d.tween(m, 'opacity', to, secs, 'inOut') : Promise.resolve();
    };

    // 1. Vesna kneels at the old hole: the faint circle in the ice. Senses pulse; the world drains to blue.
    d.cut({ pos: P(-1.3, 4.4, 1.0), look: () => V3(H.x - 1.5, G.world.heightAt(H.x, H.z) + 0.6, H.z + 0.3), fov: 36, frame: [0.02, 0.04], shake: 0.12 });
    d.fade(0, 1.6);
    await d.wait(1.8);
    d.stinger('echo');
    d.uniform('uSenses', 1, 1.4);
    d.shot({ from: P(-1.3, 4.4, 1.0), to: P(-0.9, 3.6, 0.85), look: () => V3(H.x - 1.5, G.world.heightAt(H.x, H.z) + 0.6, H.z + 0.3), fov: 36, frame: [0.02, 0.04], dur: 5.2, ease: 'sine', shake: 0.12 });
    await d.wait(2.4);
    d.postfx('echo', 1, 3.2);
    d.music('silence');
    await d.wait(2.6);
    d.uniform('uSenses', 0, 1.6);

    // 2. WIDE: ghost figures fade in. A procession of women in white with torches, singing from far off.
    for (const a of all) { a.show(); d.ghost(a, true); }
    const gm = wiesia._ghost?.[0]?.[0]?.material;
    if (gm) { const op = gm.opacity; gm.opacity = 0; K.add(() => { gm.opacity = op; }); }
    d.music('procession');
    G.audio?.duck?.(0.55, 40);
    const wide = P(5.5, -6.5, 1.7);
    d.cut({ pos: wide, look: P(0, 8, 1.2), fov: 42, frame: [0.0, 0.02] });
    d.shot({ from: wide, to: P(5.9, -6.9, 1.8), look: P(0, 8, 1.2), fov: 42, dur: 7.5, ease: 'linear', shake: 0.1 });
    fadeGhosts(0.42, 2.4);
    d.sub(LYRICS[0], 3.6, { italic: true });
    const walks = all.map((a, i) => {
      const [lat, back] = slot(i);
      const zStop = H.z + 2.1 + back * 1.0;
      return d.walk(a, H.x + lat * 1.0, zStop, { speed: 1.35 });
    });
    await d.wait(3.8);
    d.sub(LYRICS[1], 3.6, { italic: true });
    await d.wait(3.4);

    // 3. MEDIUM on Wiesia, solemn, proud, the straw Marzanna on its pole, her mother walking behind her.
    d.follow(wiesia, [2.4, 1.3, 2.4], () => wiesia.eye(V3(0, 0, 0)).add(V3(0, -0.12, 0)), 0, { lag: 3.0, fov: 32, frame: [-0.12, 0.03], shake: 0.1 });
    d.sub(LYRICS[2], 3.6, { italic: true });
    await Promise.all(walks);
    await d.wait(0.5);

    // 4. The effigy is set alight (pale fire) and pushed into the hole. Wiesia steps back; the ice cracks.
    for (const a of all) { a.c.stopUpper?.(0.2); }
    for (const a of all) if (a !== wiesia) carry(a, 'carry_torch');
    d.face(wiesia, V3(H.x, 0, H.z), { instant: true });
    d.cut({ pos: P(3.8, 0.4, 1.3), look: P(0, 1.6, 1.15), fov: 36, frame: [0.0, 0.05] });
    let flame = null;
    try {
      flame = props.fx.fire({ position: [0, 1.5, 0.02], parent: effigy, scale: 1.1, light: false, smoke: false });
      K.add(() => flame?.dispose?.());
    } catch { /* optional */ }
    d.sfx('ignite', P(0, 1.8, 1));
    await d.wait(1.8);
    if (effigy) {
      d.tween(effigy.position, 'z', 1.55, 1.6, 'inOut');
      d.tween(effigy.position, 'y', -0.2, 1.6, 'in');
      d.tween(effigy.rotation, 'x', 0.9, 1.6, 'in');
    }
    d.sfx('splash', P(0, -0.4, 0));
    await d.wait(1.7);
    if (effigy) effigy.visible = false;
    flame?.setActive?.(false);
    const wp = wiesia.pos(V3(0, 0, 0));
    wiesia.c.stopUpper?.(0.2);
    const back = off(wp.x, wp.z, wiesia.yaw, 0, -0.9);
    d.tween(wiesia.c.root.position, 'x', back[0], 0.9, 'out');
    d.tween(wiesia.c.root.position, 'z', back[1], 0.9, 'out');
    G.water?.setCracks?.(back[0], back[1], 3.5, 0);
    d.sfx('ice_groan', P(0, 1.5, 0));
    await d.wait(0.9);

    // 5. CLOSE on her feet. A web of cracks. She goes through.
    const foot = V3(back[0], G.world.heightAt(back[0], back[1]) + 0.05, back[1]);
    d.cut({ pos: foot.clone().add(V3(0.8, 0.5, -0.9)), look: foot.clone().add(V3(0, 0.05, 0)), fov: 30, shake: 0.1 });
    const crack = G.story.sched.tween({ dur: 1.4, ease: 'in', step: (u) => G.water?.setCracks?.(back[0], back[1], 3.8, u) });
    d.sfx('ice_crack', foot);
    await d.wait(0.9);
    const hid = G.water?.addHole?.(back[0], back[1], 0.85);
    if (hid != null && hid >= 0) holeIds.push(hid);
    d.sfx('splash', foot);
    const fall = d.anim(wiesia, 'fall_through_ice', { fade: 0.05 });
    d.cut({ pos: foot.clone().add(V3(1.8, 1.3, 2.0)), look: foot.clone().add(V3(0, 0.6, 0)), fov: 40 });
    await crack;
    await fall;

    // 6. WIDE: the procession has already turned and walks back toward the shore, singing, not looking back.
    d.sub(LYRICS[3], 3.8, { italic: true });
    const away = P(-6.5, -5.5, 1.8);
    d.cut({ pos: away, look: P(0.4, 5, 1.3), fov: 38 });
    d.shot({ from: away, to: P(-6.0, -5.1, 1.9), look: P(0.4, 5, 1.3), fov: 38, dur: 5.5, ease: 'linear', shake: 0.08 });
    const others = all.filter((a) => a !== wiesia);
    others.forEach((a, i) => {
      const p = a.pos(V3(0, 0, 0));
      d.face(a, V3(H.x, 0, H.z + 40), { rate: 4 });
      d.walk(a, H.x + (i % 2 ? -0.9 : 0.9) + (i * 0.07), p.z + 9 + i * 0.8, { speed: 1.2 });
    });
    await d.wait(2.6);

    // 7. CLOSE on the ice: two small hands on the broken edge.
    wiesia.hide();
    const hole = { x: back[0], z: back[1] };
    const hands = ghostHands(d, K, hole.x, hole.z + 0.8, 0);
    const hp0 = V3(hole.x, G.world.heightAt(hole.x, hole.z) + 0.03, hole.z + 0.88);
    const c7 = V3(hole.x + 0.7, G.world.heightAt(hole.x, hole.z) + 0.2, hole.z + 1.4);
    d.cut({ pos: c7, look: hp0, fov: 30, shake: 0.1 });
    d.shot({ from: c7, to: V3(c7.x - 0.12, c7.y - 0.03, c7.z - 0.18), look: hp0, fov: 30, dur: 3.4, ease: 'sine', shake: 0.1 });
    await d.wait(3.2);

    // 8. MEDIUM on Hanka: she turns her head. Her face. She sees. She stops for one heartbeat.
    const hp = hanka.pos(V3(0, 0, 0));
    d.cut({ pos: V3(hp.x - 2.4, hp.y + 1.55, hp.z + 3.0), look: () => hanka.eye(V3(0, 0, 0)), fov: 30, frame: [0.0, 0.05] });
    hanka.c.playUpper?.('look_back', { loop: false, fade: 0.3, hold: true });
    await d.wait(2.2);
    hanka.c.setLocomotion?.(0);
    hanka.c.targetSpeed = 0;
    await d.wait(1.1);

    // 9. The woman beside her takes her arm, still singing. Hanka turns forward again and walks on.
    const mp = marta.pos(V3(0, 0, 0));
    d.walk(marta, hp.x + 0.5, hp.z + 0.1, { speed: 1.4 });
    await d.wait(0.9);
    hanka.c.stopUpper?.(0.5);
    d.walk(hanka, hp.x + 0.4, hp.z + 9, { speed: 1.2 });
    void mp;
    await d.wait(2.2);

    // 10. CLOSE: the hands slip under. Slush closes. Silence.
    d.cut({ pos: c7.clone().add(V3(-0.3, 0.02, -0.2)), look: hp0, fov: 24, shake: 0.08 });
    d.music('silence');
    G.audio?.duck?.(0, 0.1);
    await d.wait(1.1);
    const slip = hands.slip(1.9);
    d.sfx('splash', hp0, { volume: 0.4 });
    await slip;
    await d.wait(1.2);

    // 11. The ghosts fade. Back to night colors. Vesna stays kneeling a moment, then looks to the shore.
    d.postfx('echo', 0, 3.0);
    fadeGhosts(0, 2.4);
    d.cut({ pos: P(-1.3, 4.4, 1.0), look: () => V3(H.x - 1.5, G.world.heightAt(H.x, H.z) + 0.6, H.z + 0.3), fov: 36, frame: [0.02, 0.04], shake: 0.1 });
    await d.wait(3.0);
    d.music('sorrow');
    for (const id of holeIds.splice(0)) G.water?.removeHole?.(id);
    G.water?.setCracks?.(H.x, H.z, 3, 0);
    for (const a of all) a.hide();
    d.anim(vesna, 'stand_up');
    await d.wait(1.8);
    const hk = { x: LOC.hanka.x, z: LOC.hanka.z };
    const look = yawTo(H.x - 2.3, H.z + 0.4, hk.x, hk.z);
    d.face(vesna, look);
    const vp = vesna.pos(V3(0, 0, 0));
    const c11 = off(vp.x, vp.z, look, 0.5, -3.4);
    d.shot({ from: ground(G, c11[0], c11[1], 1.5), to: ground(G, c11[0] + Math.sin(look) * 1.2, c11[1] + Math.cos(look) * 1.2, 1.55), look: ground(G, hk.x, hk.z, 3.0), fov: 40, frame: [-0.15, 0.04], dur: 6, ease: 'sine', shake: 0.1 });
    await d.wait(5.4);
    void eye; void jolt; void uncarry;

    d.flag('echo_seen');
    d.end({ player: { x: vp.x, z: vp.z, yaw: look }, fadeIn: 0.6 });
  } finally {
    for (const id of holeIds) G.water?.removeHole?.(id);
    G.postfx && (G.postfx.echo = 0);
    G.uniforms.uSenses.value = 0;
    K.run();
  }
}
