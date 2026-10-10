// Dawn (docs/STORY.md "Dawn transition"): about 16 s. The fade after C5. Day 2, 7:30, fog on the lake;
// Vesna stands on the shore by the huts, the drowned tower a smudge in the white.
// Trigger: the player leaves the tower after lair_seen (fade to black first, then play 'dawn').
// Sets day 2, 07:30, weather fog (auto off for the morning), flag dawn_day2. The player ends on the
// shore at LOC.fishingHuts, facing the lake.
import { kit, off, ground, V3, jolt } from './_cine.js';
import { LOC } from '../../../world/layout.js';

export default async function dawn(d) {
  const G = d.G, K = kit(d);
  try {
    d.setup({ time: 7.5, day: 2, weather: 'fog', music: 'silence' });
    d.fade(1, 0);
    const spot = { x: -15, z: 66, yaw: Math.PI };
    const vesna = d.player();
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    d.place(vesna, spot.x, spot.z, spot.yaw);
    vesna.play('idle_cold', { loop: true, fade: 0 });
    const eye = () => vesna.eye(V3(0, 0, 0));
    const tower = ground(G, LOC.bellTower.x, LOC.bellTower.z, 9);

    // Black, then the word.
    const behind = (back, right, h) => { const [x, z] = off(spot.x, spot.z, spot.yaw, right, -back); return ground(G, x, z, h); };
    d.cut({ pos: behind(3.4, 0.9, 1.65), look: () => eye().add(V3(0, -0.1, -12)), fov: 40 });
    d.titleCard('Dawn.', '', 4.6);
    await d.wait(1.6);
    d.music('wild');

    // 1. The shore in the fog. A slow push over her shoulder toward the white where the lake is.
    d.fade(0, 2.6);
    await d.shot({ from: behind(3.4, 0.9, 1.65), to: behind(1.9, 0.7, 1.6), look: () => eye().add(V3(0, 0.05, 0)).add(V3(0, 0, -6)), lookTo: () => eye().add(V3(-3, 0.2, -10)), fov: 40, frame: [-0.16, -0.02], dur: 6.4, ease: 'sine', shake: 0.14 });

    // 2. MEDIUM from the side: she breathes out, tired, not looking at anything.
    const side = off(spot.x, spot.z, spot.yaw, 2.3, 0.9);
    d.cut({ pos: ground(G, side[0], side[1], 1.5), look: () => eye().add(V3(0, -0.12, 0)), fov: 32, frame: [0.14, 0.04] });
    d.shot({ from: ground(G, side[0], side[1], 1.5), to: ground(G, side[0] - 0.3, side[1] + 0.1, 1.52), look: () => eye().add(V3(0, -0.12, 0)), fov: 32, frame: [0.14, 0.04], dur: 4.4, ease: 'linear', shake: 0.1 });
    await d.wait(1.8);
    d.lookAt(vesna, tower);
    await d.wait(2.6);

    // 3. WIDE: the tower, a dark smudge in the fog, a long way out.
    const far = behind(0.2, 0.0, 2.2);
    d.cut({ pos: far, look: tower, fov: 28 });
    d.shot({ from: far, to: far.clone().add(V3(0, 0.05, -2.2)), look: tower, fov: 28, dur: 4.6, ease: 'sine', shake: 0.08 });
    await d.wait(4.2);

    d.flag('dawn_day2');
    d.lookAt(vesna, null);
    await d.fade(1, 0.8);
    d.end({ player: { x: spot.x, z: spot.z, yaw: spot.yaw }, weatherAuto: false, fadeIn: 1.2 });
    void jolt;
  } finally {
    K.run();
  }
}
