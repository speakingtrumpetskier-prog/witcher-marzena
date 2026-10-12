// C5 The Lair (docs/STORY.md): about 45 s in the belfry of the drowned bell tower, night 1. A frost-made
// room: a table of ice planks, frozen bread, seventeen straw effigies seated round it like a family at
// supper, a music box, a red ribbon on the bell rope. Under the clear ice below: three men, faces up.
// A girl's voice. Nothing there.
// Trigger: the player comes up through the belfry hatch (G.world.locations.bellTower.belfry.hatch), once,
// lair_seen unset. Sets lair_seen and wiesia_spoke. Ends with Vesna standing at the table.
// If bird_taken and not bird_given the controller offers "Leave the bird" at belfry.birdSpot afterwards.
import { kit, towerSite, off, V3, yawTo, hold } from './_cine.js';

export default async function c5(d) {
  const G = d.G, K = kit(d);
  const T = towerSite(G);
  const { S, floor: F } = T;
  const glow = T.underGlow;
  try {
    d.setup({ time: 23.0, weather: 'clear', music: 'night' });
    d.fade(1, 0);
    G.audio?.setEnvironment?.('room');
    K.add(() => G.audio?.setEnvironment?.('hall'));
    const vesna = d.player();
    vesna.c.autoGround = false;
    K.add(() => { vesna.c.autoGround = true; });
    // place() and a skipped walk snap her to the terrain far below; keep her on the belfry floor.
    const onFloor = () => { vesna.c.root.position.y = F; };
    const hatch = T.hatch;
    // She comes up out of the hatch, facing the head of the table.
    const faceYaw = T.yaw + yawTo(0, 0, -1, -0.2); // toward the head of the table (local -x)
    vesna.c.root.position.set(hatch.x, F - 1.45, hatch.z);
    vesna.yaw = faceYaw;
    vesna.play('idle_cold', { loop: true, fade: 0 });

    // 1. Vesna rises through the trapdoor. Handheld-feel slow push.
    const c1 = S(3.1, F + 0.42, 2.9);
    const lk1 = S(1.65, F + 0.55, 1.1);
    d.cut({ pos: c1, look: lk1, fov: 50, shake: 0.7 });
    d.fade(0, 1.2);
    d.shot({ from: c1, to: S(2.8, F + 0.6, 2.35), look: () => vesna.c.root.position.clone().add(V3(0, 1.0, 0)), fov: 50, dur: 5.6, ease: 'sine', shake: 0.7 });
    await d.wait(0.8);
    d.tween(vesna.c.root.position, 'y', F, 3.0, 'inOut');
    await d.wait(3.3);
    vesna.play('idle_cold', { loop: true, fade: 0.4 });
    d.stinger('discover');
    await d.wait(1.5);

    // 2. WIDE: the belfry made into a room. Seventeen effigies at supper, heads tilted.
    const w2 = S(-2.7, F + 1.65, 2.75);
    const l2 = S(0.5, F + 0.95, -0.2);
    d.cut({ pos: w2, look: l2, fov: 64, shake: 0.35 });
    d.shot({ from: w2, to: S(-2.2, F + 1.6, 2.35), look: l2, fov: 64, dur: 7.5, ease: 'sine', shake: 0.35 });
    d.walk(vesna, S(1.2, F, 1.9).x, S(1.2, F, 1.9).z, { speed: 0.9 }).then(onFloor);
    await d.wait(7.2);

    // 3. CLOSE: a small music box on the table. Vesna turns the crank and lets it play to the end.
    const bx = T.box;
    const c3 = S(3.0, F + 1.6, -1.5);
    const stand = S(2.05, F, 1.5);
    d.place(vesna, stand.x, stand.z, yawTo(stand.x, stand.z, bx.x, bx.z));
    onFloor();
    d.face(vesna, bx, { instant: true });
    d.cut({ pos: c3, look: bx.clone().add(V3(0, 0.1, 0.45)), fov: 34, frame: [0.0, 0.0], shake: 0.2 });
    d.anim(vesna, 'stir', { loop: true });
    d.music('night');
    d.stinger('echo');
    d.shot({ from: c3, to: S(2.8, F + 1.45, -1.0), look: bx.clone().add(V3(0, 0.1, 0.45)), fov: 34, dur: 7.0, ease: 'sine', shake: 0.2 });
    await d.wait(7.0);
    vesna.play('idle_cold', { loop: true, fade: 0.4 });

    // 4. Insert: a red ribbon tied to the bell rope.
    const rp = T.ribbon.clone();
    d.cut({ pos: rp.clone().add(S(0.9, 0.2, 1.0).sub(S(0, 0, 0))), look: rp, fov: 26 });
    d.shot({ from: rp.clone().add(S(0.9, 0.2, 1.0).sub(S(0, 0, 0))), to: rp.clone().add(S(0.7, 0.15, 0.8).sub(S(0, 0, 0))), look: rp, fov: 26, dur: 3.0, ease: 'sine', shake: 0.12 });
    await d.wait(3.0);

    // 5. She looks down through the gap in the floor: three men under the clear ice, faces up.
    const ld = T.lookDown;
    d.walk(vesna, ld.x, ld.z, { speed: 1.0 }).then(onFloor);
    hold(d, { pos: S(2.6, F + 2.15, 1.2), look: () => vesna.c.root.position.clone().add(V3(0, 0.9, 0)), fov: 38, frame: [0.1, -0.02], shake: 0.2 });
    await d.wait(3.0);
    d.face(vesna, T.menCenter);
    vesna.c.lookAt?.(T.menCenter.clone().setY(-0.4));
    const eye = () => vesna.eye(V3(0, 0, 0));
    const over = S(2.2, F + 1.3, 3.25);
    d.cut({ pos: over, look: T.menCenter.clone().add(V3(0, -0.1, 0)), fov: 52, shake: 0.2 });
    d.shot({ from: over, to: over.clone().lerp(T.menCenter, 0.06), look: T.menCenter.clone().add(V3(0, -0.1, 0)), fov: 52, dur: 4.4, ease: 'sine', shake: 0.2 });
    await d.wait(4.2);

    // 6. A girl's voice, close, wet, small.
    vesna.c.lookAt?.(null);
    d.face(vesna, faceYaw, { instant: true });
    const e6 = eye();
    const c6 = off(e6.x, e6.z, vesna.yaw, 0.35, 1.25);
    d.cut({ pos: V3(c6[0], e6.y, c6[1]), look: e6, fov: 24, frame: [-0.1, 0.05], shake: 0.1 });
    G.audio?.sfx?.('heartbeat');
    await d.wait(1.2);
    await d.say('wiesia', 'Did Mama send you?', 2.8);
    d.flag('wiesia_spoke');

    // 7. Vesna turns: nothing. Under the ice a pale shape slides away, trailing hair.
    const turnTo = S(-1.0, F, 3.0);
    d.face(vesna, turnTo);
    const wide7 = S(2.6, F + 1.7, -2.4);
    hold(d, { pos: wide7, look: () => vesna.c.root.position.clone().add(V3(0, 1.0, 0)), fov: 46, shake: 0.2 });
    await d.wait(2.2);
    const g0 = T.glide.from, g1 = T.glide.to;
    const pale = V3(0, 0, 0);
    const view = S(2.2, F + 1.3, 3.25);
    d.cut({ pos: view, look: pale.copy(g0), fov: 52, shake: 0.2 });
    const slide = G.story.sched.tween({
      dur: 5.2, ease: 'sine',
      step: (u) => {
        pale.lerpVectors(g0, g1, u);
        const k = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 1.35;
        G.water?.setUnderGlow?.(pale.x, pale.z, 4.2, k, 0x9ff5ff);
      },
    });
    d.shot({ from: view, to: view.clone().add(V3(0, 0.1, 0)), look: () => pale, fov: 52, dur: 5.2, ease: 'linear', shake: 0.2 });
    await slide;
    G.water?.setUnderGlow?.(glow.x, glow.z, glow.radius, 0);
    K.add(() => G.water?.setUnderGlow?.(glow.x, glow.z, glow.radius, 0));

    // 8. Vesna puts the music box back exactly where it was. No line.
    const back = S(2.7, F, 1.2);
    d.walk(vesna, back.x, back.z, { speed: 1.0 }).then(onFloor);
    const c8 = S(-1.6, F + 1.75, 2.8);
    hold(d, { pos: c8, look: () => vesna.c.root.position.clone().add(V3(0, 0.95, 0)), fov: 36, frame: [-0.05, 0.0], shake: 0.12 });
    await d.wait(2.4);
    d.face(vesna, bx);
    d.anim(vesna, 'crouch_examine');
    await d.wait(2.8);
    d.anim(vesna, 'stand_up');
    await d.wait(1.8);

    d.flag('lair_seen');
    onFloor();
    const vp = vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: vp.x, y: F, z: vp.z, yaw: vesna.yaw }, fadeIn: 0.8 });
  } finally {
    G.water?.setUnderGlow?.(glow.x, glow.z, glow.radius, 0);
    K.run();
  }
}
