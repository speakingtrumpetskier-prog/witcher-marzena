// C2 The Valley (docs/STORY.md): the reveal, about 42 s, the morning after the night at the watchtower. The
// blizzard has blown itself out; fresh snow, a cold low sun, a last few flakes in the air. Vesna gets up from the
// ashes in the lee of the ruin, rides Kasza out to the crest, and the camera rises over her as the valley opens
// below. Ends on the MARZENA title card, then fades to gameplay at the watchtower.
// Trigger: straight after c2_shelter (story controller act1.js). Sets prologue_done. Day 1, about 8:00.
// Ends with Vesna on foot at the crest, Kasza beside her, the weather clear and auto off.
// The ruin is placed with yaw 0 at LOC.watchtower (+x east, the lee side); every camera here is at least 6 m
// from its walls, the lean-to and the fallen roof (the crest itself is 13 m out on the road).
import { kit, anchors, seat, unseat, moveAlong, off, ground, V3 } from './_cine.js';
import { LOC } from '../../../world/layout.js';

export default async function c2(d) {
  const G = d.G, K = kit(d);
  try {
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    const W = anchors(G, 'watchtower');
    const L = LOC.watchtower;
    const T = (lx, lz, h = 0) => ground(G, L.x + lx, L.z + lz, h);
    const crest = W?.crest ? { x: W.crest.x, z: W.crest.z } : { x: -350.6, z: 331.0 };
    const hearth = W?.hearth ? { x: W.hearth.x, z: W.hearth.z } : { x: L.x + 6.3, z: L.z - 0.4 };
    const hs = W?.horse || { x: L.x + 6.9, z: L.z - 2.5, yaw: 1.27 };
    const tower = LOC.bellTower, village = LOC.village, idol = LOC.idol;
    const yaw = W?.yawToValley ?? Math.atan2(tower.x - crest.x, tower.z - crest.z);
    const FW = V3(Math.sin(yaw), 0, Math.cos(yaw));
    const at = (back, right = 0, h = 0) => { const [x, z] = off(crest.x, crest.z, yaw, right, -back); return ground(G, x, z, h); };
    const toward = (p, k) => p.clone().addScaledVector(FW, k);

    // The morning after the shelter: keep its clock, else a quarter past eight.
    const h0 = G.time?.hours ?? 8;
    d.setup({ time: h0 >= 7.4 && h0 <= 9.2 ? h0 : 8.25, day: 1, music: 'silence' });
    if (G.weather?.state !== 'clear') {
      G.weather?.set?.('clear', 0);
      if (G.weather?.params) { G.weather.params.snowfall = 0.08; G.weather.params.wind = 0.1; }
    }
    if (W?.fire && W.fire() === 'out') W.fire('smoke');
    d.fade(1, 0);
    const vesna = d.player(), kasza = d.horse();
    d.place(kasza, hs.x, hs.z, hs.yaw);
    kasza.c.setGait?.(0);
    d.place(vesna, hearth.x - 0.95, hearth.z, Math.PI / 2);
    vesna.play('kneel_idle', { loop: true, fade: 0 });
    const eye = () => vesna.eye(V3(0, 0, 0));

    // 1. WIDE from the south-east, the sun behind the camera: the ruin's east face lit low and gold, fresh snow
    //    smooth to the walls, a thread of smoke from the ashes. Vesna at the hearth gets up and goes to the horse.
    const w0 = T(13.0, 5.6, 1.7), w1 = T(12.2, 5.0, 1.75);
    const wLook = T(5.8, -1.0, 1.4);
    d.cut({ pos: w0, look: wLook, fov: 42, shake: 0.08 });
    d.fade(0, 2.6);
    d.shot({ from: w0, to: w1, look: wLook, fov: 42, dur: 8.6, ease: 'linear', shake: 0.08 });
    d.weather('clear', 18);
    await d.wait(3.0);
    d.sfx('horse_snort', kasza, { volume: 0.4 });
    await d.anim(vesna, 'stand_up', { fade: 0.4 });
    vesna.play('idle_cold', { loop: true, fade: 0.3 });
    d.lookAt(vesna, kasza);
    d.walk(vesna, hs.x - 0.6, hs.z + 1.0, { speed: 1.2 });
    await d.wait(3.6);

    // 2. From the north-east, on the crest side: she rides out of the lee toward the camera and past it.
    d.lookAt(vesna, null);
    const path = [[hs.x, hs.z], [L.x + 7.6, L.z - 4.6], [crest.x - FW.x * 2.6, crest.z - FW.z * 2.6], [crest.x, crest.z]];
    d.place(kasza, hs.x, hs.z, Math.atan2(path[1][0] - hs.x, path[1][1] - hs.z));
    seat(d, vesna, kasza);
    const c2a = T(12.6, -5.6, 1.55);
    const rider = () => eye().add(V3(0, -0.35, 0));
    d.shot({ from: c2a, to: c2a.clone().add(V3(0.1, 0.05, -0.2)), look: rider, fov: 38, frame: [0.0, 0.0], dur: 30, ease: 'linear', shake: 0.12 });
    const ride = moveAlong(d, kasza, path, { speed: 1.75, brake: 0.3, turn: 2.4 });
    await d.wait(3.4);
    await ride;
    kasza.c.setGait?.(0);
    d.place(kasza, crest.x, crest.z, yaw);

    // 3. MEDIUM from behind at the crest, then CRANE UP and over her: the valley opens below. The lake, the bell
    //    tower in the ice, the chimney smoke over the village, the idol on its hill in the low sun.
    const back0 = at(3.7, 0.5, 1.7);
    d.cut({ pos: back0, look: () => eye().add(V3(0, -0.15, 0)), fov: 38, frame: [-0.12, 0.02], shake: 0.12 });
    d.shot({ from: back0, to: toward(back0, 0.5), look: () => eye().add(V3(0, -0.15, 0)), fov: 38, frame: [-0.12, 0.02], dur: 3.0, ease: 'linear', shake: 0.12 });
    d.stinger('reveal');
    await d.wait(2.4);
    d.music('reveal');
    const hiFwd = at(-9, 1.0, 17);
    const mid = at(-1.5, 1.4, 6.5);
    const look = ground(G, tower.x * 0.55 + village.x * 0.45, tower.z * 0.55 + village.z * 0.45, 8);
    await d.shot({
      from: toward(back0, 0.5), via: [mid], to: hiFwd,
      look: () => eye().add(V3(0, -0.1, 0)), lookTo: look, fov: 38, fovTo: 52, dur: 9.5, ease: 'inOut', shake: 0.12,
    });
    await d.wait(1.4);

    // 4. SLOW PUSH toward the bell tower. The theme swells.
    const tw = ground(G, tower.x, tower.z, 9);
    d.shot({ from: hiFwd, to: toward(hiFwd, 26).add(V3(0, -4, 0)), look, lookTo: tw, fov: 48, fovTo: 40, dur: 8.2, ease: 'sine', shake: 0.08 });
    await d.wait(7.8);

    // 5. CLOSE on Vesna, the low sun on the side of her face, eyes narrowed against the snow glare. She breathes out.
    const face = eye();
    const c5 = face.clone().addScaledVector(FW, 1.5).add(V3(0.3, 0.12, 0.15));
    vesna.c.expression?.('squint', 0.9, 0.5);
    d.cut({ pos: c5, look: face.clone().add(V3(0, -0.03, 0)), fov: 26, frame: [0.06, 0.05], shake: 0.1 });
    d.shot({ from: c5, to: c5.clone().addScaledVector(FW, -0.18), look: () => eye().add(V3(0, -0.03, 0)), fov: 26, frame: [0.06, 0.05], dur: 4.2, ease: 'sine', shake: 0.1 });
    await d.wait(1.6);
    vesna.c.expression?.('squint', 0.35, 1.2);
    d.anim(vesna, 'nod');
    await d.wait(2.6);

    // 6. WIDE, the camera drifting down toward the village. Title card: MARZENA.
    const hi = at(-60, 20, 55);
    const lo = at(-130, 36, 26);
    const vLook = ground(G, village.x * 0.7 + idol.x * 0.3, village.z * 0.7 + idol.z * 0.3, 6);
    d.cut({ pos: hi, look: vLook, fov: 42 });
    d.shot({ from: hi, to: lo, look: vLook, lookTo: ground(G, village.x, village.z, 8), fov: 42, fovTo: 38, dur: 9.5, ease: 'inOut' });
    await d.wait(1.2);
    d.titleCard('MARZENA', 'A tale of the long winter', 6.2);
    await d.wait(1.5);
    await d.fade(1, 1.8);

    // End state: on foot at the crest, the storm gone for good.
    d.flag('prologue_done');
    G.weather?.set?.('clear', 0);
    await unseat(d, vesna, kasza, { instant: true });
    const ex = crest.x + FW.x * 1.2 + FW.z * 1.3, ez = crest.z + FW.z * 1.2 - FW.x * 1.3;
    d.place(vesna, ex, ez, yaw);
    d.end({ player: { x: ex, z: ez, yaw }, weatherAuto: false, fadeIn: 1.4 });
    G.horse?.teleport?.(crest.x, crest.z, yaw);
  } finally {
    K.run();
    try { await unseat(d, d.player(), d.horse(), { instant: true }); } catch { /* already on foot */ }
  }
}
