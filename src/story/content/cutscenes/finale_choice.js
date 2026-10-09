// The choice at 25 percent (docs/STORY.md "The choice at 25%"), about 30 s, and then the ending it picks
// runs inline in the same cutscene (no cut to gameplay in between). Not in the original scene list: it
// is the piece the three endings hang from, and the finale controller can use it as one call.
//
// Trigger: the boss yields (event 'boss:yield', or health at 25 percent) with Hanka on the ice. Play
// 'finale_choice'. It shatters the marzanna (the combat builder's boss body is put away and restored by
// the cleanup), shows Wiesia kneeling as a girl, offers the decisive choice (15 s timer; the default is
// "Hanka."), sets the flag ending = 'thaw' | 'looking_back' | 'nothing_changes' and plays that ending.
// Options: Strike / "Hanka." / (Step back. Let them finish it.), the last only with took_reeve_money.
// If you only want the choice, play the ending scenes yourself from the flag it sets.
import { kit, finaleStage, ground, V3, jolt } from './_cine.js';
import { props } from '../../../world/props/index.js';

export default async function choice(d) {
  const G = d.G, K = kit(d);
  try {
    d.setup({ time: 20.9, day: 2, weather: 'blizzard', music: 'boss' });
    d.fade(1, 0);
    const S = await finaleStage(d, K, { sword: true, keepBoss: true });
    const { H, vesna, wiesia } = S;
    const P = (dx, dz, h = 0) => ground(G, H.x + dx, H.z + dz, h);
    const [wx, wz] = wiesia.pos0;
    const WP = (h = 0) => ground(G, wx, wz, h);
    wiesia.hide();
    const boss = G.creatures?.boss;
    const bp = boss?.root?.position || V3(wx, 0, wz);

    // 1. The marzanna, on her knees in the storm, losing.
    const wide = P(-7.5, 7.5, 2.4);
    d.cut({ pos: wide, look: () => ground(G, bp.x, bp.z, 2.2), fov: 48, shake: 0.2 });
    d.fade(0, 1.0);
    d.shot({ from: wide, to: P(-6.2, 6.4, 2.1), look: () => ground(G, bp.x, bp.z, 2.2), fov: 48, dur: 4.2, ease: 'linear', shake: 0.2 });
    await d.wait(2.6);

    // 2. She shatters. The storm stops.
    G.postfx?.flash?.(0xdff6ff, 0.9);
    d.sfx('boss_scream', V3(bp.x, 2, bp.z), { volume: 0.9 });
    d.sfx('hit_ice', V3(bp.x, 1, bp.z));
    try { props.fx.burst('ice', [bp.x, 1.8, bp.z], { count: 140, speed: 4.5, up: 1.2, size: 0.3 }); } catch { /* optional */ }
    if (boss) boss.root.visible = false;
    jolt(d, 1.6, 2.2);
    G.weather?.set?.('snow', 6);
    d.music('sorrow');
    await d.wait(1.2);

    // 3. Wiesia kneels on the ice as a girl, ghost-pale, crying, holding herself.
    wiesia.show();
    wiesia.c.expression?.('browSad', 0.8, 0.3);
    const med = P(-3.0, 5.0, 1.15);
    d.cut({ pos: med, look: () => wiesia.at(0.6, V3(0, 0, 0)), fov: 34, frame: [0.0, 0.04], shake: 0.1 });
    d.shot({ from: med, to: P(-2.5, 4.4, 1.1), look: () => wiesia.at(0.6, V3(0, 0, 0)), fov: 34, frame: [0.0, 0.04], dur: 5, ease: 'sine', shake: 0.1 });
    await d.wait(2.0);
    d.face(wiesia, V3(wx, 0, wz + 30));
    wiesia.c.lookAt?.(V3(wx + 1, 1.2, wz + 24));
    await d.say('wiesia', "I don't want to go down there. It's dark down there.", 4.6);
    d.cut(d.close(wiesia, vesna));
    await d.wait(1.0);
    await d.say('wiesia', 'Mama?', 2.0);

    // 4. The choice. The camera holds on the faces.
    const took = !!G.state.flag('took_reeve_money');
    const options = [
      { t: 'Strike.', e: 'thaw' },
      { t: '"Hanka."', e: 'looking_back' },
      ...(took ? [{ t: '(Step back. Let them finish it.)', e: 'nothing_changes' }] : []),
    ];
    const vp = vesna.pos(V3(0, 0, 0));
    const two = P(-4.8, 3.8, 1.4);
    d.cut({ pos: two, look: ground(G, (wx + vp.x) / 2, (wz + vp.z) / 2, 1.1), fov: 40, shake: 0.08 });
    d.shot({ from: two, to: P(-4.1, 3.6, 1.35), look: ground(G, (wx + vp.x) / 2, (wz + vp.z) / 2, 1.1), fov: 40, dur: 18, ease: 'linear', shake: 0.08 });
    const pick = await d.choice(options.map((o) => ({ t: o.t, decisive: true })), { timer: 15, default: 1, decisive: true });
    const chosen = options[pick] || options[1];
    d.flag('ending', chosen.e);

    // 5. The ending, in the same breath. Bring the girl back for the strike.
    wiesia.show();
    const mod = chosen.e === 'thaw' ? await import('./ending_thaw.js') : chosen.e === 'nothing_changes' ? await import('./ending_nothing_changes.js') : await import('./ending_looking_back.js');
    await mod.run(d, S, K);
    G.weather?.set?.(chosen.e === 'nothing_changes' ? 'snow' : 'clear', 0);
    if (chosen.e !== 'nothing_changes') G.time.setHours(7.6);
    const p = vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: p.x, z: p.z, yaw: vesna.yaw }, weatherAuto: false, fadeIn: 1.2 });
  } finally {
    K.run();
  }
}
