// The night at the watchtower (docs/STORY.md Q1, before C2): about 22 s. The blizzard has not let up. In the lee
// of the ruin's east wall, under the watch's old lean-to, Vesna gets a fire going in the hearth, Kasza stands
// in close by the wall, the wind tears at the flames. Fade to black: the night. It ends at a quarter to eight
// on day 1 (the prologue is day 0) with the storm blown out and a last few flakes in the air, the ashes smoking,
// the screen still black so C2 The Valley follows straight on.
// Trigger: E "Shelter for the night" at the hearth (story controller act1.js). Sets sheltered.
// Positions are taken in the ruin's own frame (it is placed with yaw 0 at LOC.watchtower: +x is east, the lee).
import { kit, ground, V3 } from './_cine.js';
import { LOC } from '../../../world/layout.js';

export default async function shelter(d) {
  const G = d.G, K = kit(d);
  const W = G.world?.locations?.watchtower;
  const L = LOC.watchtower;
  const T = (lx, lz, h = 0) => ground(G, L.x + lx, L.z + lz, h);
  const hearth = W?.hearth ? { x: W.hearth.x, z: W.hearth.z } : { x: L.x + 6.3, z: L.z - 0.4 };
  const seat = W?.seat || { x: L.x + 4.25, z: L.z - 0.4, yaw: Math.PI / 2 };
  const hs = W?.horse || { x: L.x + 7.5, z: L.z - 3.3, yaw: 1.27 };
  try {
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    // Dusk in the white-out: an early arrival waits for the light to go.
    const h0 = G.time?.hours ?? 17;
    d.setup({ time: h0 >= 6 && h0 < 16.9 ? 16.9 : h0, weather: 'blizzard', music: 'silence' });
    await d.fade(1, 0.6);
    W?.fire?.('out');
    const vesna = d.player(), kasza = d.horse();
    d.place(kasza, hs.x, hs.z, hs.yaw);
    kasza.c.setGait?.(0);
    // She kneels at the hearth, on the open side, facing the lean-to, to get it going.
    d.place(vesna, hearth.x + 0.85, hearth.z + 0.1, -Math.PI / 2);
    vesna.play('kneel_idle', { loop: true, fade: 0 });
    const eye = () => vesna.eye(V3(0, 0, 0));
    const fireAt = ground(G, hearth.x, hearth.z, 0.35);

    // 1. WIDE from the east-north-east, through the snow: the east wall going up into the white, the lean-to against
    //    it, Kasza standing in close on the right, a small figure at the hearth. The fire catches.
    const w0 = T(13.2, -3.0, 2.0), w1 = T(12.0, -2.6, 1.9);
    const wLook = T(5.6, -0.7, 1.1);
    d.cut({ pos: w0, look: wLook, fov: 44, shake: 0.3 });
    d.fade(0, 1.8);
    d.shot({ from: w0, to: w1, look: wLook, fov: 44, fovTo: 40, dur: 8.0, ease: 'linear', shake: 0.3 });
    G.weather?.gustNow?.(0.8);
    await d.wait(2.6);
    W?.fire?.('lit');
    d.sfx('ignite', fireAt, { volume: 0.6 });
    await d.wait(1.4);
    d.sfx('fire_crackle', fireAt, { volume: 0.5 });
    await d.wait(3.4);

    // 2. MEDIUM, from beyond the fire on the horse's side: she sits under the lean-to with her back to the wall, the
    //    hide's edge over her, the flames beside her in the frame. She looks over at the horse.
    d.place(vesna, seat.x, seat.z, seat.yaw);
    vesna.play('sit_ground', { loop: true, fade: 0 });
    const m0 = T(8.3, -1.8, 1.2);
    d.cut({ pos: m0, look: () => eye().add(V3(0, -0.06, 0)), fov: 34, frame: [0.12, 0.04], shake: 0.12 });
    d.shot({ from: m0, to: m0.clone().add(V3(-0.22, 0.0, 0.06)), look: () => eye().add(V3(0, -0.06, 0)), fov: 34, frame: [0.12, 0.04], dur: 7.0, ease: 'linear', shake: 0.12 });
    await d.wait(2.2);
    d.sfx('horse_snort', kasza, { volume: 0.5 });
    kasza.play('snort');
    d.lookAt(vesna, kasza);
    await d.wait(1.0);
    await d.say(vesna, "We're not going down in this.", 2.6);
    await d.wait(0.6);
    d.lookAt(vesna, fireAt);
    await d.wait(0.8);

    // 3. WIDE and further out: the ruin black against the storm, the fire a small glow in its lee. Fade to black.
    const f0 = T(17.5, -7.0, 2.8), f1 = T(18.6, -7.6, 3.0);
    const fLook = T(4.6, -0.6, 2.4);
    d.cut({ pos: f0, look: fLook, fov: 40, shake: 0.25 });
    d.shot({ from: f0, to: f1, look: fLook, fov: 40, dur: 7, ease: 'linear', shake: 0.25 });
    G.weather?.gustNow?.(1.0);
    await d.wait(2.6);
    await d.fade(1, 2.8);
    d.lookAt(vesna, null);
    await d.wait(1.6);

    // The night. Morning of day 1: the storm has blown itself out, a last few flakes still coming down.
    d.flag('sheltered');
    d.time(7.75, { day: 1 });
    G.weather?.set?.('clear', 0);
    if (G.weather?.params) { G.weather.params.snowfall = 0.08; G.weather.params.wind = 0.1; }
    W?.fire?.('smoke');
    d.end({ player: { x: seat.x, z: seat.z, yaw: seat.yaw }, weatherAuto: false, fadeIn: false });
    G.horse?.teleport?.(hs.x, hs.z, hs.yaw);
  } finally {
    K.run();
  }
}
