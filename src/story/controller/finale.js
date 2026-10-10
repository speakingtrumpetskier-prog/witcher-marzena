// Act III: The Drowning of Marzanna (Q6 main_rite). From the procession to the credits.
//
//   site      at 20:00 on the second day, arriving at the ritual ring starts the finale (a failsafe at 21:30
//             carries her there if she has not come)
//   c6        C6 The Procession, then C7 Emergence; the boss rises at the hole and is let loose
//   survive   the fight. Hanka and Ola stand at the edge of the ring while it runs. A death resets the boss to
//             its first phase; a loaded save is picked up again (see resume)
//   choose    boss:yield at 25 percent: clear the field, freeze combat, the shattered marzanna becomes Wiesia
//             kneeling on the ice; the decisive choice (15 s) strike / Hanka / step back (only after taking
//             the reeve's money). Running out the timer is "Hanka."
//   ending    ending_thaw / ending_looking_back / ending_nothing_changes, then epilogue_knot, then the credits
//
//   G.storyCtl.finale  { phase, boss, start(), choose(key), resume() }   for tests and scripts
import { props } from '../../world/props/index.js';

const ENDINGS = {
  strike: { ending: 'thaw', scene: 'ending_thaw' },
  call: { ending: 'looking_back', scene: 'ending_looking_back' },
  step: { ending: 'nothing_changes', scene: 'ending_nothing_changes' },
};

export function install(C) {
  const { G, L } = C;
  const R = L.ritual;
  if (!R) return;
  const hole = () => ({ x: R.hole.x, z: R.hole.z });
  const FIN = { phase: 'idle', boss: null, forced: null };
  C.finale = FIN;

  const report = (where) => (e) => { console.error(`[finale ${where}]`, e); G.errors.push(`finale ${where}: ${e.message}`); };

  // ---- the way in --------------------------------------------------------------------------------
  const ready = () => C.stage('main_rite') === 'site' && C.hour() >= 20 && !C.has('rite_started') && !C.busy();
  C.zone({
    id: 'rite_ring', x: R.center.x, z: R.center.z, r: 34,
    enabled: ready,
    onEnter: () => { start().catch(report('start')); },
  });
  // She is still wandering at half past nine: the procession goes out without waiting, and she is on the ice.
  let wt = 0;
  G.addSystem('ctl-rite-failsafe', (dt) => {
    wt += dt;
    if (wt < 2) return;
    wt = 0;
    if (!C.has('dawn_done') || C.has('rite_started') || C.stage('main_rite') !== 'site' || C.busy() || C.running.has('finale')) return;
    if (C.hour() >= 21.5 && C.hour() < 23.5) {
      (async () => {
        await G.story.ui.fade(1, 0.8);
        C.place(R.approach.x, R.approach.z, Math.PI);
        await start();
      })().catch(report('failsafe'));
    }
  }, 14);

  // ---- C6, C7, the boss -----------------------------------------------------------------------------
  async function start() {
    if (C.running.has('finale') || C.has('rite_started')) return;
    C.running.add('finale');
    FIN.phase = 'procession';
    try {
      await C.sleep(0.9);
      await C.scene('c6_procession');
      await C.sleep(0.5);
      FIN.phase = 'emergence';
      await C.scene('c7_emergence');
      await beginBoss();
    } finally {
      C.running.delete('finale');
    }
  }

  // Hanka and Ola watch from the edge of the ring while the fight runs.
  const witnesses = [];
  function placeWitnesses() {
    witnesses.length = 0;
    const spots = [['hanka', R.center.x + 4, R.center.z + 17.5, 'idle'], ['ola', R.center.x + 5.6, R.center.z + 17.2, 'idle']];
    for (const [id, x, z, anim] of spots) {
      const n = G.npcs?.get?.(id);
      if (!n) continue;
      n.pause(true);
      const c = n.character;
      c.setPosition(x, z);
      c.yaw = Math.PI;
      c.setVisible(true);
      c.play(anim, { loop: true, fade: 0.3 });
      witnesses.push(n);
    }
  }
  function releaseWitnesses() {
    for (const n of witnesses) { n.pause(false); n.release(); }
    witnesses.length = 0;
  }

  async function beginBoss() {
    R.hole.open?.();
    placeWitnesses();
    const h = hole();
    let b = G.creatures?.boss;
    if (!b || b.disposed) b = G.creatures.spawnBoss(h.x, h.z, { emerge: true, passive: true });
    FIN.boss = b;
    if (b.state === 'hidden' || b.state === 'emerge') {
      await Promise.race([b.emerged || Promise.resolve(), C.sleep(40)]);
    }
    // The scene may have left her anywhere on the ice; the fight starts south of the hole.
    const p = C.ppos();
    if (Math.hypot(p.x - h.x, p.z - h.z) > 30) C.place(R.center.x, R.center.z + 8, Math.PI);
    if (G.player) G.player.invulnerable = false;
    b.passive = false;
    b.activate();
    FIN.phase = 'fight';
    C.log('boss let loose');
  }

  // ---- the fight resets on death, and picks up after a load -------------------------------------------
  async function rearm() {
    if (C.running.has('finale') || C.running.has('choice') || C.has('ending') || !C.has('rite_started')) return;
    C.running.add('finale');
    try {
      if (C.has('boss_yielded')) {
        // Saved at the choice: replay the choice with the boss already shattered.
        FIN.phase = 'choice';
        await C.sleep(1.2);
        await choose(null);
        return;
      }
      FIN.phase = 'resuming';
      const old = G.creatures?.boss;
      if (old && !old.disposed) G.creatures.remove(old);
      for (const e of [...(G.creatures?.effigies || []), ...(G.creatures?.wolves || [])]) G.creatures.remove(e);
      R.hole.open?.();
      C.set('boss_started');
      C.place(R.center.x, R.center.z + 8, Math.PI);
      placeWitnesses();
      await C.sleep(1.5);
      const h = hole();
      const b = G.creatures.spawnBoss(h.x, h.z, { passive: true });
      FIN.boss = b;
      await C.sleep(1.5);
      b.passive = false;
      b.activate();
      FIN.phase = 'fight';
    } finally {
      C.running.delete('finale');
    }
  }
  let rt = 0;
  const later = (why) => { clearTimeout(rt); rt = setTimeout(() => { C.log('rearm', why); rearm().catch(report('rearm')); }, 600); };
  C.on('player:respawn', () => {
    if (C.has('rite_started') && !C.has('ending') && !C.running.has('choice')) later('respawn');
  });
  C.on('loaded', () => { if (C.has('rite_started') && !C.has('ending')) later('loaded'); });

  // ---- the choice -----------------------------------------------------------------------------------
  G.events.on('boss:yield', ({ boss }) => { FIN.boss = boss || FIN.boss; choose(null, boss).catch(report('choose')); });

  function clearField() {
    const cb = G.combat;
    if (cb?.hold_) cb.release(cb.hold_, 'ended');
    for (const e of [...(G.creatures?.effigies || []), ...(G.creatures?.wolves || []), ...(G.creatures?.bears || [])]) G.creatures.remove(e);
    G.player?.setTarget?.(null);
  }

  // choose(key): skip the asking and take that ending (tests); otherwise she is asked.
  async function choose(key, bossArg) {
    if (C.running.has('choice')) return;
    C.running.add('choice');
    FIN.phase = 'choice';
    const P = G.player;
    let picked = key || FIN.forced || null;
    try {
      const boss = bossArg || FIN.boss;
      C.set('boss_yielded');
      clearField();
      if (P) P.invulnerable = true;
      await C.sleep(1.1);
      // In play the authored scene asks (the marzanna shatters, Wiesia kneels, the scripted lines) and
      // runs the ending it picks inline; tests that force an ending, and builds without it, ask here.
      let authored = false;
      if (!picked && G.cutscenes?.has?.('finale_choice')) {
        FIN.phase = 'ending';
        await C.scene('finale_choice');
        const got = String(G.state.flag('ending') || '');
        picked = Object.keys(ENDINGS).find((k) => ENDINGS[k].ending === got) || 'call';
        authored = true;
      }
      if (!picked) picked = await askChoice(boss);
      const E = ENDINGS[picked] || ENDINGS.call;
      // The marzanna is gone from the ice; what the endings show is Wiesia herself.
      if (boss && !boss.disposed) G.creatures.remove(boss);
      FIN.boss = null;
      C.set('ending', E.ending);
      FIN.phase = 'ending';
      if (P) P.invulnerable = false;
      if (!authored) {
        const sc = C.scene(E.scene);
        await C.sleep(0.4);
        G.story.ui.fade(0, 1.0);
        await sc;
      }
      releaseWitnesses();
      FIN.phase = 'epilogue';
      // The epilogue rolls the credits itself (except in shot mode); roll them here only if it did not.
      let rolled = false;
      const credits = G.ui?.credits;
      if (G.ui && credits) G.ui.credits = (...a) => { rolled = true; return credits(...a); };
      const ep = C.scene('epilogue_knot');
      await C.sleep(0.4);
      G.story.ui.fade(0, 1.0);
      try { await ep; } finally { if (G.ui && credits) G.ui.credits = credits; }
      FIN.phase = 'credits';
      if (!rolled) await G.ui?.credits?.();
      C.set('game_complete');
      G.quests.complete('main_rite');
      FIN.phase = 'done';
      G.story.save();
    } finally {
      if (P) P.invulnerable = false;
      C.running.delete('choice');
    }
  }

  // The shattered marzanna, Wiesia kneeling, and fifteen seconds.
  async function askChoice(boss) {
    const opts = [{ key: 'strike', text: 'Strike.' }, { key: 'call', text: '"Hanka."' }];
    if (C.has('took_reeve_money')) opts.push({ key: 'step', text: 'Step back. Let them finish it.' });
    let picked = 'call';
    const at = boss && !boss.disposed ? { x: boss.position.x, z: boss.position.z } : hole();
    await G.cutscenes.play(async function choice_at_yield(d) {
      d.setup({ music: 'sorrow', letterbox: true });
      const v = d.player();
      const toVesna = () => {
        const p = C.ppos();
        return Math.atan2(p.x - at.x, p.z - at.z);
      };
      const w = d.actor('wiesia_ghost', { preset: 'wiesia_ghost', at: [at.x, at.z], yaw: toVesna() });
      d.ghost(w, true);
      d.anim(w, 'kneel_idle');
      if (C.has('bird_given')) {
        try { w.c.attach('handR', props.birdCarving({ seed: 3 })); } catch { /* the bird is a bonus */ }
      }
      // She shatters: the big one goes, a girl kneels where she was.
      if (boss && !boss.disposed) {
        boss.root.visible = false;
        boss.char?.setVisible?.(false);
        G.combat?.fx?.chips?.({ x: at.x, y: 1.4, z: at.z }, { kind: 'frost', count: 40, speed: 6, up: 5 });
        G.combat?.fx?.chips?.({ x: at.x, y: 0.4, z: at.z }, { kind: 'ice', count: 12, speed: 4, up: 3 });
      }
      d.postfx('echo', 0, 0);
      G.postfx?.flash?.(0x9ff5ff, 0.3);
      d.sfx('ice_crack');
      // Vesna stands three paces off, facing her; Hanka and Ola at the edge of the ring.
      const vp = C.ppos();
      const dist = Math.hypot(vp.x - at.x, vp.z - at.z);
      if (dist > 7 || dist < 1.8) {
        const a = Math.atan2(R.center.x - at.x, R.center.z + 12 - at.z);
        d.place(v, at.x + Math.sin(a) * 3.2, at.z + Math.cos(a) * 3.2, a + Math.PI);
      }
      d.face(v, w, { instant: true });
      d.face(w, v, { instant: true });
      for (const [id, x, z] of [['hanka', R.center.x + 4, R.center.z + 17.5], ['ola', R.center.x + 5.6, R.center.z + 17.2]]) {
        const a = d.actor(id, { preset: id, at: [x, z], yaw: Math.PI });
        d.anim(a, 'idle');
        d.lookAt(a, w);
      }
      d.fade(0, 0.4);
      // Over Vesna's shoulder while Wiesia speaks, then in on her face for the question and the choice.
      d.cut(d.ots(w, v));
      await d.say(w, "I don't want to go down there. It's dark down there.", 4.2, { italic: true });
      d.lookAt(w, d.ground(R.center.x + 4, R.center.z + 17.5, 1.4));
      const cu = d.close(w, v);
      d.cut(cu);
      d.shot({ to: d.rel(w, [0.25, 1.15, 1.9]), look: d.head(w), dur: 20, ease: 'sine', fov: 38 });
      await d.say(w, 'Mama?', 2.2, { italic: true });
      const idx = await d.choice(opts.map((o) => ({ t: o.text, decisive: true })), { timer: 15, default: 1, decisive: true });
      picked = opts[idx]?.key || 'call';
      d.stinger('choice');
      await d.fade(1, 0.7);
      d.end({ fadeIn: false });
    });
    return picked;
  }

  FIN.start = start;
  FIN.choose = (key) => choose(key);
  FIN.resume = rearm;
  FIN.ENDINGS = ENDINGS;
}
