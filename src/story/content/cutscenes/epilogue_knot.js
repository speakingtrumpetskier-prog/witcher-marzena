// Epilogue: Dobra's Knot (docs/STORY.md), about 95 s plus the credits. Morning at the west gate. Dobra
// brings a hand-sized straw doll with her red knot and says what she has never said. Vesna rides out; a
// [Hold E] Look back prompt decides whether the camera turns for one last look at the gate.
// Trigger: after any ending, once the player is back at the west gate with Kasza (or on a short timer
// after the ending cutscene). Reads ending ('thaw' | 'looking_back' | 'nothing_changes'), wit_sword.
// Sets looked_back (only if the prompt is held), the item straw_doll, and plays G.ui.credits() at the end.
// Weather and the world match the ending (spring sun for A and B, grey snowfall for C). In shot mode the
// credits are skipped; flags _hold = yes | no answers the prompt, _credits = 1 runs the credits anyway.
import { kit, anchors, seat, unseat, moveAlong, strawDoll, applyEndingWorld, off, ground, V3, yawTo, spawn } from './_cine.js';
import { LOC } from '../../../world/layout.js';

const OPTIONS = [
  'Why didn\'t you come looking?',
  'I know that song. I never knew where from.',
  '(Say nothing.)',
];

export default async function epilogue(d) {
  const G = d.G, K = kit(d);
  try {
    const ending = G.state.flag('ending') || 'looking_back';
    const grey = ending === 'nothing_changes';
    const witSword = !!G.state.flag('wit_sword');
    const olaAlive = !grey;
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    applyEndingWorld(G, ending);
    d.setup({ time: 7.9, day: 3, weather: grey ? 'snow' : 'clear', music: 'lullaby' });
    d.fade(1, 0);
    const Vv = anchors(G, 'village');
    const gate = Vv?.gate ? { x: Vv.gate.x, z: Vv.gate.z } : { x: LOC.westGate.x, z: LOC.westGate.z };
    const out = [-110, 140];
    const yo = yawTo(gate.x, gate.z, out[0], out[1]);
    const at = (back, right = 0, h = 0, ref = gate) => { const [x, z] = off(ref.x, ref.z, yo, right, -back); return ground(G, x, z, h); };
    const vPos = off(gate.x, gate.z, yo, 0, 4.2);
    const kPos = off(vPos[0], vPos[1], yo, -1.35, 0.4);
    const vesna = d.player(), kasza = d.horse();
    d.place(kasza, kPos[0], kPos[1], yo - 0.15);
    const ms = (() => { const y = kasza.yaw; return [kPos[0] + Math.cos(y) * 0.8, kPos[1] - Math.sin(y) * 0.8]; })();
    d.place(vesna, ms[0], ms[1], yawTo(ms[0], ms[1], kPos[0], kPos[1]));
    vesna.play('idle_cold', { loop: true, fade: 0 });
    const yard = Vv?.workshopYard ? { x: Vv.workshopYard.x, z: Vv.workshopYard.z } : { x: -76, z: 153 };
    const dobra = await spawn(d, 'dobra', 'dobra', yard.x, yard.z, 0, {});
    d.place(dobra, yard.x, yard.z, yawTo(yard.x, yard.z, gate.x, gate.z));
    const doll = strawDoll(K);
    dobra.c.attach('handR', doll);
    doll.position.set(0, 0.02, 0.03);
    doll.rotation.set(0.2, 0, 0);
    const eye = () => vesna.eye(V3(0, 0, 0));

    // 1. Morning at the west gate. Vesna saddles Kasza.
    const est = at(-6.5, 5.5, 2.4);
    d.cut({ pos: est, look: () => vesna.at(0.7, V3(0, 0, 0)), fov: 40, shake: 0.05 });
    d.fade(0, 1.8);
    d.shot({ from: est, to: at(-5.2, 4.4, 2.2), look: () => vesna.at(0.7, V3(0, 0, 0)), fov: 40, dur: 7.5, ease: 'sine', shake: 0.05 });
    await d.wait(1.8);
    d.anim(vesna, 'crouch_examine', { loop: true });
    d.sfx('horse_snort', kasza);
    kasza.play('snort');
    await d.wait(3.6);
    vesna.play('idle_cold', { loop: true, fade: 0.4 });

    // 2. Dobra comes down the path with a tiny straw doll, a red knot at its neck.
    const wp = [[yard.x, yard.z], [gate.x - 3.0, gate.z + 12], [gate.x + 0.4, gate.z + 5.6]];
    const walk = d.walk(dobra, wp[2][0], wp[2][1], { speed: 1.05 });
    d.walk(dobra, wp[1][0], wp[1][1], { speed: 1.05 });
    const dobraCam = ground(G, gate.x + 5, gate.z + 15, 1.6);
    d.cut({ pos: dobraCam, look: () => dobra.at(0.62, V3(0, 0, 0)), fov: 34 });
    await d.wait(4.0);
    d.follow(dobra, [-1.8, 1.4, 2.6], () => dobra.at(0.72, V3(0, 0, 0)), 0, { lag: 2.4, fov: 36, shake: 0.06 });
    await walk;
    d.face(vesna, dobra);
    d.face(dobra, vesna);
    d.lookAt(vesna, dobra);
    d.lookAt(dobra, vesna);
    dobra.play('hands_hips', { loop: true, fade: 0.3 });
    d.cut(d.two(vesna, dobra));
    await d.wait(1.2);

    // 3. Dobra's story.
    d.cut(d.single(dobra, vesna));
    await d.say(dobra, 'Wait. Wait, I\'m old.', 2.4);
    await d.wait(1.4);
    dobra.play('hands_hips', { loop: true, fade: 0.3 });
    await d.say(dobra, "There was a winter, before you'd remember anything. We were boiling bark. The wolves came down and got into the graves.", 6.4);
    await d.wait(0.8);
    d.cut(d.ots(vesna, dobra));
    await d.say(dobra, 'A hunter came through. One of yours. Lynx. We had nothing to give him.', 5.0);
    await d.wait(0.9);
    d.cut(d.close(dobra, vesna));
    await d.say(dobra, "I had a baby I couldn't feed.", 3.2);
    await d.wait(1.4);
    // She reaches out and touches the knot on Vesna's chain without asking.
    d.cut(d.two(vesna, dobra));
    const reach = d.walk(dobra, vesna.pos(V3(0, 0, 0)).x + Math.sin(vesna.yaw + Math.PI) * 0.75, vesna.pos(V3(0, 0, 0)).z + Math.cos(vesna.yaw + Math.PI) * 0.75, { speed: 0.7 });
    await reach;
    d.face(dobra, vesna);
    const chest = vesna.at(0.74, V3(0, 0, 0));
    d.cut({ pos: V3(chest.x + 0.55, chest.y + 0.15, chest.z + 0.65), look: chest.clone().add(V3(0, 0.02, 0)), fov: 24, shake: 0.06 });
    d.anim(dobra, 'point');
    await d.wait(2.2);
    d.cut(d.close(dobra, vesna));
    await d.say(dobra, 'I tie it the same way every time. I can\'t do it any other way.', 5.0);
    await d.wait(1.6);

    // The sword with the silver: before the choice.
    if (witSword) {
      d.cut(d.single(vesna, dobra));
      await d.say(vesna, 'His name was Wit. He told me he found me in a ditch.', 4.2);
      d.cut(d.single(dobra, vesna));
      await d.say(dobra, 'He came back. Years after. Asked did I want to know where you were.', 4.6);
      await d.wait(1.0);
      await d.say(dobra, 'I said no.', 2.0);
      await d.wait(1.8);
    }

    // The long beat, and the choice.
    d.cut(d.two(vesna, dobra, { wide: true }));
    await d.wait(2.6);
    const pick = await d.choice(OPTIONS, { default: 2 });
    if (pick === 0) {
      d.cut(d.single(dobra, vesna));
      await d.say(dobra, 'Where would I have looked?', 2.8);
      await d.wait(1.2);
    } else if (pick === 1) {
      d.cut(d.close(dobra, vesna));
      await d.wait(1.0);
      d.sub('Marzanno, Marzanno, white bride of the', 2.6, { italic: true });
      dobra.c.talk?.(true);
      await d.wait(2.6);
      dobra.c.talk?.(false);
      await d.wait(1.8);
    } else {
      d.cut(d.single(dobra, vesna));
      d.anim(dobra, 'nod');
      await d.wait(2.4);
    }
    // She presses the doll into Vesna's hand anyway.
    d.cut(d.two(vesna, dobra));
    d.anim(dobra, 'beckon');
    await d.wait(1.0);
    doll.parent?.remove(doll);
    try { vesna.c.attach('handR', doll); doll.position.set(0, 0.02, 0.03); } catch { /* optional */ }
    d.give('straw_doll');
    if (G.ui?.hold && !G.shot) { try { await G.ui.hold('[E] Take it', 0.3, 5); } catch { /* optional */ } }
    await d.wait(1.8);
    doll.parent?.remove(doll);
    d.stinger('discover');

    // 4. Vesna mounts and rides down the road. WIDE: a rider small on the road.
    d.cut({ pos: at(-3.5, 4.0, 1.7), look: () => vesna.at(0.7, V3(0, 0, 0)), fov: 38 });
    d.face(vesna, kasza);
    await d.anim(vesna, 'mount', { fade: 0.1 });
    seat(d, vesna, kasza, 'ride_idle');
    const road = [[kPos[0], kPos[1]], [out[0], out[1]], [-140, 165], [-185, 196], [-230, 230]];
    const ride = moveAlong(d, kasza, road, { speed: 3.4, brake: 0.05, turn: 3 });
    const gateHi = ground(G, gate.x + 6, gate.z + 9, 5.5);
    d.cut({ pos: gateHi, look: () => ground(G, kasza.c.root.position.x, kasza.c.root.position.z, 1.4), fov: 30 });
    await d.wait(6.5);

    // 5. [Hold E] Look back. A five second window.
    const forced = G.state.flag('_hold');
    let looked = false;
    if (forced === 'yes') looked = true;
    else if (forced === 'no') looked = false;
    else if (G.ui?.hold && !d.skipping) looked = !!(await G.ui.hold('[Hold E] Look back', 1.1, 5));
    const rider = () => eye();
    if (looked) {
      d.flag('looked_back');
      d.music('lullaby');
      // The camera turns past Vesna's shoulder: Dobra on the rise by the gate, holding up the little doll.
      const fw = () => V3(Math.sin(kasza.yaw), 0, Math.cos(kasza.yaw));
      const cp = () => rider().addScaledVector(fw(), -0.7).add(V3(0.3, 0.12, 0));
      vesna.c.playUpper?.('look_back', { loop: false, fade: 0.3, hold: true });
      const dp = V3(gate.x + 1.0, 0, gate.z + 3.0);
      d.place(dobra, dp.x, dp.z, yawTo(dp.x, dp.z, kasza.c.root.position.x, kasza.c.root.position.z));
      const twin = strawDoll(K);
      dobra.c.attach('handR', twin);
      twin.position.set(0, 0.02, 0.03);
      dobra.play('wave', { loop: false, fade: 0.2 });
      dobra.c.playUpper?.('wave', { loop: true, fade: 0.2 });
      const fwdLook = () => cp().addScaledVector(fw(), 9);
      const sideLook = () => cp().add(V3(-fw().z, 0, fw().x).multiplyScalar(-9));
      const gateLook = () => ground(G, dp.x, dp.z, 1.7);
      await d.shot({ from: cp, to: cp, look: fwdLook, lookTo: sideLook, fov: 40, dur: 0.9, ease: 'in', shake: 0.2 });
      await d.shot({ from: cp, to: cp, look: sideLook, lookTo: gateLook, fov: 40, fovTo: 22, dur: 1.4, ease: 'out', shake: 0.2 });
      d.shot({ from: cp, to: cp, look: gateLook, fov: 22, fovTo: 14, dur: 5.5, ease: 'sine', shake: 0.12 });
      if (olaAlive) {
        const fence = [gate.x - 3.0, gate.z + 8.0];
        const o = await spawn(d, 'ola_wave', 'ola', fence[0] + 4, fence[1] + 3, 0, {});
        d.place(o, fence[0], fence[1], yawTo(fence[0], fence[1], kasza.c.root.position.x, kasza.c.root.position.z));
        o.play('wave', { loop: true, fade: 0.1 });
      }
      await d.wait(2.4);
      d.anim(vesna, 'wave');
      await d.wait(3.6);
    } else {
      // The road, the snow or the green, Kasza's ears, onward.
      const ears = () => V3(0, 0, 0).copy(kasza.c.root.position).add(V3(Math.sin(kasza.yaw) * 0.42, 2.2, Math.cos(kasza.yaw) * 0.42));
      const ahead = () => V3(0, 0, 0).copy(kasza.c.root.position).add(V3(Math.sin(kasza.yaw) * 14, 1.4, Math.cos(kasza.yaw) * 14));
      await d.shot({ from: ears, to: ears, look: ahead, fov: 44, dur: 6.0, ease: 'linear', shake: 0.2 });
    }
    await ride;

    // 6. Credits over the full song: the lullaby, then the ensemble.
    d.music('lullaby');
    await d.fade(1, 1.8);
    if (G.ui?.credits && (!G.shot || G.state.flag('_credits'))) {
      setTimeout(() => G.audio?.setMood?.(grey ? 'sorrow' : 'thaw', { fade: 4 }), 22000);
      await G.ui.credits();
    }
    const kp = kasza.c.root.position;
    G.horse?.teleport?.(kp.x, kp.z, kasza.yaw);
    d.end({ player: { x: kp.x, z: kp.z, yaw: kasza.yaw }, weatherAuto: false, fadeIn: 1.5 });
  } finally {
    K.run();
    try { await unseat(d, d.player(), d.horse(), { instant: true }); } catch { /* already on foot */ }
  }
}
