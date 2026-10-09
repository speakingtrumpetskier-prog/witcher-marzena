// C3 The Song (docs/STORY.md): short in-engine scene, about 28 s, in Dobra's yard at 16:30. Four children
// stuff a straw doll on the bales and sing the Marzanno song; Vesna slows, knows the tune, and Ola
// notices her. Dobra watches from the doorway without being introduced.
// Trigger: the player enters the village by the west gate (zone at LOC.westGate, once, flag song_heard unset).
// Sets song_heard and met_ola. Ends with Vesna on foot in the yard, Kasza beside her.
import { kit, anchors, station, seat, unseat, moveAlong, off, ground, V3, clearArea, spawn, yawTo } from './_cine.js';

const LYRICS = [
  'Marzanno, Marzanno, white bride of the frost,',
  'we carry you, we carry you, to the water deep.',
  'Do not follow, do not follow, we will not look back.',
  'Go down, go down, and let the green come back.',
];

export default async function c3(d) {
  const G = d.G, K = kit(d);
  try {
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    const Vv = anchors(G, 'village');
    const yard = Vv?.workshopYard ? { x: Vv.workshopYard.x, z: Vv.workshopYard.z } : { x: -76, z: 153 };
    const door = station(G, 'dobra_doorway', [yard.x - 4.2, yard.z, Math.PI / 2]);
    d.setup({ time: 16.5, weather: 'clear', music: 'lullaby' });
    d.fade(1, 0);
    clearArea(d, K, yard.x, yard.z, 14, ['ola', 'dobra']);

    // The ring of bales: the children sit on four of them, facing the middle where the doll is.
    const bale = (i) => { const a = (i / 7) * Math.PI * 2 + 0.4; return { x: yard.x + Math.cos(a) * 2.3, z: yard.z + Math.sin(a) * 2.3 }; };
    const sit = (i) => { const b = bale(i); return { ...b, yaw: yawTo(b.x, b.z, yard.x, yard.z) }; };
    const sp = [sit(0), sit(2), sit(3), sit(5)];
    const ola = await spawn(d, 'ola', 'ola', sp[1].x, sp[1].z, sp[1].yaw, { low: true });
    const kidA = await spawn(d, 'c3_kid_a', 'child_b', sp[0].x, sp[0].z, sp[0].yaw, { low: true });
    const kidB = await spawn(d, 'c3_kid_b', 'child_c', sp[2].x, sp[2].z, sp[2].yaw, { low: true });
    const boy = await spawn(d, 'c3_boy', 'child_d', sp[3].x, sp[3].z, sp[3].yaw, { low: true });
    for (const k of [ola, kidA, kidB, boy]) k.play('sit_bench', { loop: true, fade: 0 });
    const dobra = d.actor('dobra', { preset: 'dobra', at: [door.x, door.z], yaw: door.yaw });
    dobra.play('cross_arms', { loop: true, fade: 0 });

    // Vesna rides in along the west lane, mounted, at a walk.
    const vesna = d.player(), kasza = d.horse();
    const lane = [[-58, 124], [-64, 134], [-70, 144], [yard.x + 3.2, yard.z - 4.4]];
    const yaw0 = yawTo(lane[0][0], lane[0][1], lane[1][0], lane[1][1]);
    d.place(kasza, lane[0][0], lane[0][1], yaw0);
    seat(d, vesna, kasza);
    const stopAt = [yard.x + 3.6, yard.z - 3.9];
    const ride = moveAlong(d, kasza, [lane[0], lane[1], lane[2], stopAt], { speed: 1.5, brake: 0.3, turn: 3 });
    const eye = () => vesna.eye(V3(0, 0, 0));

    // 1. WIDE: the yard, the doll, the song. A rider comes down the lane.
    const wideFrom = ground(G, yard.x + 15, yard.z - 12, 2.6);
    d.cut({ pos: wideFrom, look: ground(G, yard.x, yard.z, 0.9), fov: 36 });
    d.fade(0, 1.4);
    d.sub(LYRICS[0], 3.4, { italic: true });
    d.shot({ from: wideFrom, to: wideFrom.clone().add(V3(-1.6, 0.1, 1.4)), look: ground(G, yard.x, yard.z, 0.9), fov: 36, dur: 5.5, ease: 'linear', shake: 0.1 });
    await d.wait(3.5);
    d.sub(LYRICS[1], 3.4, { italic: true });
    await d.wait(2.0);

    // 2. MEDIUM, tracking: Vesna slows.
    d.follow(kasza, [-3.0, 1.8, 1.2], () => eye().add(V3(0, -0.25, 0)), 0, { lag: 2.6, fov: 34, frame: [0.1, 0.0], shake: 0.12 });
    await ride;
    d.sub(LYRICS[2], 3.2, { italic: true });
    await d.wait(0.6);

    // 3. CLOSE on Vesna. The music box, once, soft. She mouths the last bar without knowing it.
    const f = eye();
    const side = off(f.x, f.z, kasza.yaw, -1.0, 1.1);
    const c3 = V3(side[0], f.y + 0.02, side[1]);
    d.cut({ pos: c3, look: f, fov: 24, frame: [0.1, 0.06] });
    d.shot({ from: c3, to: c3.clone().lerp(f, 0.12), look: () => eye(), fov: 24, frame: [0.1, 0.06], dur: 4.6, ease: 'sine', shake: 0.08 });
    d.stinger('echo');
    await d.wait(1.3);
    d.sub(LYRICS[3], 3.0, { italic: true });
    vesna.c.talk?.(true);
    await d.wait(2.6);
    vesna.c.talk?.(false);
    d.lookAt(ola, vesna);
    d.face(ola, vesna);
    await d.wait(0.9);

    // 4. Ola looks up and sees her. Vesna gets down.
    d.cut(d.single(ola, vesna));
    ola.play('sit_bench', { loop: true, fade: 0.2 });
    await d.wait(1.3);
    const dis = unseat(d, vesna, kasza);
    d.cut({ pos: ground(G, yard.x + 6.5, yard.z - 7.2, 1.7), look: () => vesna.at(0.7, V3(0, 0, 0)), fov: 36 });
    await dis;
    d.music('village');
    const near = off(sp[1].x, sp[1].z, sp[1].yaw + Math.PI, 0, 2.2);
    await d.walk(vesna, near[0], near[1], { speed: 1.2 });
    d.face(vesna, ola);
    d.lookAt(vesna, ola);

    // 5. The exchange. Shot, reverse shot.
    d.face(ola, vesna);
    d.cut(d.ots(ola, vesna));
    ola.play('talk_1');
    await d.say(ola, 'Are you a witch?');
    d.cut(d.ots(vesna, ola));
    await d.say(vesna, 'No.', 1.4);
    d.cut(d.ots(ola, vesna));
    await d.say(ola, 'Mama says mutants eat snow.');
    d.cut(d.ots(vesna, ola));
    await d.say(vesna, 'Does she.', 1.7);
    d.cut(d.ots(ola, vesna));
    await d.say(ola, "And that you've got cat's eyes.");
    // Vesna crouches to her level and lets her look.
    d.anim(vesna, 'kneel');
    d.cut(d.two(vesna, ola));
    await d.wait(2.2);
    d.cut(d.close(ola, vesna));
    await d.wait(1.6);
    await d.say(ola, "They're just yellow.");
    await d.wait(0.5);

    // A boy calls from behind the bales. Ola does not go.
    d.cut(d.two(vesna, ola, { wide: true }));
    d.lookAt(boy, ola);
    await d.say(boy, 'Ola, come away!', 2.0, { name: 'Boy' });
    await d.wait(0.7);
    d.cut(d.ots(ola, vesna));
    await d.say(ola, 'Are you here for the ice lady?');
    d.cut(d.close(vesna, ola));
    await d.say(vesna, "Who's the ice lady?", 2.0);

    // 6. DOBRA, from the doorway, not to Vesna: "Ola. Straw."
    const dpos = dobra.pos(V3(0, 0, 0));
    const wide6 = off(yard.x, yard.z, door.yaw, 3.2, 4.6);
    d.cut({ pos: ground(G, wide6[0], wide6[1], 1.5), look: ground(G, dpos.x, dpos.z, 1.2), fov: 30, frame: [-0.1, 0.0] });
    d.lookAt(dobra, vesna);
    await d.say(dobra, 'Ola. Straw.', 1.8);
    d.anim(vesna, 'stand_up');
    ola.play('sit_bench', { loop: true, fade: 0.2 });
    const b = bale(1);
    d.walk(ola, b.x, b.z, { speed: 1.6 });
    await d.wait(1.4);

    // Dobra keeps looking a moment longer, then goes inside.
    d.cut(d.close(dobra, vesna));
    await d.wait(3.0);
    const inside = off(door.x, door.z, door.yaw, 0, -2.4);
    d.walk(dobra, inside[0], inside[1], { speed: 1.1 });
    d.sub(LYRICS[0], 3.2, { italic: true });
    await d.wait(2.4);

    d.flag('song_heard');
    d.flag('met_ola');
    await d.fade(1, 1.0);
    const vp = vesna.pos(V3(0, 0, 0));
    const vy = yawTo(vp.x, vp.z, sp[1].x, sp[1].z);
    d.end({ player: { x: vp.x, z: vp.z, yaw: vy }, fadeIn: 0.9 });
    const kp = kasza.pos(V3(0, 0, 0));
    G.horse?.teleport?.(kp.x, kp.z, kasza.yaw);
  } finally {
    K.run();
    try { await unseat(d, d.player(), d.horse(), { instant: true }); } catch { /* already on foot */ }
  }
}
