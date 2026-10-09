// C2 The Valley (docs/STORY.md): the reveal, about 36 s. Vesna and Kasza stand in the white-out on the
// watchtower ridge; the storm tears open and the whole valley lies below in golden light. Ends on the
// MARZENA title card, then fades to gameplay at the watchtower.
// Trigger: when the player reaches the ridge crest (G.world.locations.watchtower.crest, or LOC.watchtower).
// Sets prologue_done. Ends with Vesna on foot at the crest and the weather clear and auto off.
import { kit, anchors, seat, unseat, off, ground, V3, jolt } from './_cine.js';
import { LOC } from '../../../world/layout.js';

export default async function c2(d) {
  const G = d.G, K = kit(d);
  try {
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    const W = anchors(G, 'watchtower');
    const crest = W?.crest ? { x: W.crest.x, z: W.crest.z } : { x: -362, z: 342 };
    const tower = LOC.bellTower, village = LOC.village, idol = LOC.idol, falls = LOC.waterfall;
    const yaw = W?.yawToValley ?? Math.atan2(tower.x - crest.x, tower.z - crest.z);
    const FW = V3(Math.sin(yaw), 0, Math.cos(yaw));
    const at = (back, right = 0, h = 0) => { const [x, z] = off(crest.x, crest.z, yaw, right, -back); return ground(G, x, z, h); };
    const toward = (p, k) => p.clone().addScaledVector(FW, k);

    d.setup({ time: 15.67, weather: 'blizzard', music: 'pass' });
    d.fade(1, 0);
    const vesna = d.player(), kasza = d.horse();
    d.place(kasza, crest.x, crest.z, yaw);
    seat(d, vesna, kasza);
    kasza.c.setGait?.(0);
    const eye = () => vesna.eye(V3(0, 0, 0));

    // 1. MEDIUM from behind: she and Kasza in the white-out. Only the wind.
    const back0 = at(3.7, 0.5, 1.7);
    d.cut({ pos: back0, look: () => eye().add(V3(0, -0.15, 0)), fov: 38, frame: [-0.12, 0.02], shake: 0.35 });
    d.fade(0, 1.4);
    d.shot({ from: back0, to: back0.clone().addScaledVector(FW, 0.7), look: () => eye().add(V3(0, -0.15, 0)), fov: 38, frame: [-0.12, 0.02], dur: 6.2, ease: 'linear', shake: 0.35 });
    await d.wait(2.2);

    // 2. The wind drops. The snow thins. Light breaks gold across her shoulders.
    G.weather?.gustNow?.(0.2);
    d.weather('clear', 7.5);
    d.stinger('reveal');
    await d.wait(4.0);
    d.music('reveal');

    // 3. CRANE UP and over her: the valley opens below.
    const hiFwd = at(-9, 1.0, 17);
    const mid = at(-1.5, 1.4, 6.5);
    const look = ground(G, tower.x * 0.55 + village.x * 0.45, tower.z * 0.55 + village.z * 0.45, 8);
    await d.shot({
      from: back0.clone().addScaledVector(FW, 0.7), via: [mid], to: hiFwd,
      look: () => eye().add(V3(0, -0.1, 0)), lookTo: look, fov: 38, fovTo: 52, dur: 9.5, ease: 'inOut', shake: 0.2,
    });
    await d.wait(1.6);

    // 4. SLOW PUSH toward the bell tower. The theme swells.
    const tw = ground(G, tower.x, tower.z, 9);
    d.shot({ from: hiFwd, to: toward(hiFwd, 26).add(V3(0, -4, 0)), look, lookTo: tw, fov: 48, fovTo: 40, dur: 8.2, ease: 'sine', shake: 0.12 });
    await d.wait(7.8);

    // 5. CUT to CLOSE on Vesna squinting into the light. She breathes out.
    const face = eye();
    const c5 = face.clone().addScaledVector(FW, 1.5).add(V3(0.3, 0.12, 0.15));
    vesna.c.expression?.('squint', 0.9, 0.5);
    d.cut({ pos: c5, look: face.clone().add(V3(0, -0.03, 0)), fov: 26, frame: [0.06, 0.05], shake: 0.15 });
    d.shot({ from: c5, to: c5.clone().addScaledVector(FW, -0.18), look: () => eye().add(V3(0, -0.03, 0)), fov: 26, frame: [0.06, 0.05], dur: 4.2, ease: 'sine', shake: 0.15 });
    await d.wait(1.6);
    vesna.c.expression?.('squint', 0.35, 1.2);
    d.anim(vesna, 'nod');
    await d.wait(2.6);

    // 6. WIDE, the camera drifting down toward the village. Title card: MARZENA.
    const hi = at(-60, 20, 55);
    const lo = at(-130, 36, 26);
    d.cut({ pos: hi, look: ground(G, village.x * 0.7 + idol.x * 0.3, village.z * 0.7 + idol.z * 0.3, 6), fov: 42 });
    d.shot({ from: hi, to: lo, look: ground(G, village.x * 0.7 + idol.x * 0.3, village.z * 0.7 + idol.z * 0.3, 6), lookTo: ground(G, village.x, village.z, 8), fov: 42, fovTo: 38, dur: 9.5, ease: 'inOut' });
    await d.wait(1.2);
    d.titleCard('MARZENA', 'A tale of the long winter', 6.2);
    await d.wait(1.5);
    await d.fade(1, 1.8);
    void falls; void jolt;

    // End state: on foot at the crest, the storm gone for good.
    d.flag('prologue_done');
    G.weather?.set?.('clear', 0);
    await unseat(d, vesna, kasza, { instant: true });
    d.place(vesna, crest.x + FW.x * 1.2 + FW.z * 1.3, crest.z + FW.z * 1.2 - FW.x * 1.3, yaw);
    d.end({ player: { x: crest.x + FW.x * 1.2 + FW.z * 1.3, z: crest.z + FW.z * 1.2 - FW.x * 1.3, yaw }, weatherAuto: false, fadeIn: 1.4 });
    G.horse?.teleport?.(crest.x, crest.z, yaw);
  } finally {
    K.run();
    try { await unseat(d, d.player(), d.horse(), { instant: true }); } catch { /* already on foot */ }
  }
}
