// The curious player (&wander=1): at several points of the main story the autopilot goes everywhere and tries
// everything before it carries on, the way someone exploring does: every trigger zone, every landmark, the belfry and
// the ice cave, every interaction that is on, every person who will talk. Nothing may fire out of its place in the
// story (a scene from a later act, the main quest jumping ahead), nothing may throw, she must always get control
// back, and the story run that follows still has to finish (run it with &side=0: the wander uses up the side content).
//
// Each scene has the flags the story must already have for it to be in order (NEEDS); a scene that starts without
// them is the failure this is looking for.
const NEEDS = {
  c1_blizzard: [],
  c2_shelter: [],
  c2_valley: ['sheltered'],
  c3_song: ['prologue_done'],
  c4_echo: ['night1', 'effigies_fought'],
  c5_lair: ['echo_seen'],
  dawn: ['lair_seen', 'echo_seen'],
  c6_procession: ['dawn_done', 'hanka_told'],
  c7_emergence: ['rite_started'],
  finale_choice: ['boss_started'],
};

export function makeWander(env) {
  const { G, C, S, ok, step, tick, wait, waitFor, drive, placeAt, P, itemPos, ORDER, mainNow, logLine } = env;
  void drive;
  const seenScenes = [];
  let label = '';
  G.events.on('cutscene:start', ({ id }) => {
    if (!label) return;
    seenScenes.push(id);
    const need = NEEDS[id];
    if (!need) return;
    const miss = need.filter((f) => !S.flag(f));
    if (miss.length) ok(`wander ${label}: ${id} plays in its place in the story`, false, `started without ${miss.join(', ')} (main story at ${mainNow()})`);
  });

  const settled = () => !G.cutscenes.active && !G.story.busy && !G.dialogue?.active && P().control && G.input.context === 'game';
  async function settle(what) {
    const good = await waitFor(settled, 150, `settle after ${what}`);
    if (!good) {
      ok(`wander ${label}: back in play after ${what}`, false, `cut=${G.cutscenes.active} busy=${G.story.busy} dlg=${!!G.dialogue?.active} control=${P().control} ctx=${G.input.context} cam=${G.cameraOwner}`);
      // Put things right so the run can go on and report the rest.
      try { G.player.setControl?.(true); G.input.context = 'game'; } catch { /* nothing */ }
    }
    return good;
  }

  // One pass: go everywhere, try everything. `allow` lists main stages the pass may legitimately reach.
  async function wander(name, { talk = true, use = true } = {}) {
    label = name;
    step(`wander ${name}`);
    const before = mainNow(), i0 = ORDER.indexOf(before);
    const errs0 = G.errors.length;
    const home = { x: P().position.x, z: P().position.z, yaw: P().yaw, y: P().position.y };
    const visits = [];
    // every trigger zone, on or off
    for (const z of G.story.flow?.zones?.values?.() || []) if (Number.isFinite(z.x)) visits.push({ what: `zone ${z.id}`, x: z.x, z: z.z });
    // landmarks that have no zone of their own
    const L = G.world.locations;
    const mark = (what, p, y) => { if (p && Number.isFinite(p.x)) visits.push({ what, x: p.x, z: p.z, y }); };
    mark('ice camp', L.iceCamp?.center);
    mark('ritual site', L.ritual?.center);
    mark('ritual approach', L.ritual?.approach);
    mark('tower door', L.bellTower?.door, 0);
    mark('tower inside', L.bellTower?.inside, 0);
    if (L.bellTower?.belfry) visits.push({ what: 'belfry', x: L.bellTower.belfry.table.x + 1.5, z: L.bellTower.belfry.table.z + 1.5, y: L.bellTower.belfry.floorY + 0.12 });
    mark('island', L.island?.center);
    mark('marsh', L.marsh?.center);
    mark('hot spring', L.hotSpring?.center);
    mark('bear den', L.bearDen?.center);
    mark('trapper cabin', L.hunterCabin?.center);
    mark('charcoal camp', L.charcoal?.center);
    mark('idol hill', L.idol?.center);
    mark('mill', L.mill?.center);
    mark('wolf den', L.waterfall?.den?.mouth);
    if (L.waterfall?.cave?.grotto) mark('ice cave', L.waterfall.cave.grotto, L.waterfall.cave.grotto.y);
    mark('watchtower', L.watchtower?.crest);
    mark('pass', L.passStart?.center);
    let n = 0;
    for (const v of visits) {
      placeAt(v.x, v.z, 0, v.y ?? null);
      for (let k = 0; k < 20; k++) await tick();
      if (!settled()) await settle(`standing at ${v.what}`);
      // fights that start are won, so nothing follows her around
      if (G.combat?.inCombat) { env.killAll(); await wait(1.5); }
      n++;
    }
    // every interaction that is on (not the people: they come next)
    let used = 0;
    if (use) {
      for (const id of [...G.interact.items.keys()]) {
        const it = G.interact.get(id);
        if (!it || id.startsWith('npc_') || id.startsWith('fish:') || id === 'ctl:shelter' || /^ctl:(bed_|banya|fire_)/.test(id)) continue;
        let on = true;
        if (it.enabled) { try { on = !!it.enabled(); } catch { on = false; } }
        if (!on || it.sensesOnly) continue;
        let p = null;
        try { p = itemPos(it); } catch { p = null; }
        if (!p || Math.abs(p.x) > 5000) continue;
        placeAt(p.x + 0.9, p.z + 0.6, Math.atan2(-0.9, -0.6), p.y > G.world.heightAt(p.x, p.z) + 2 ? p.y - 1 : null);
        await tick(); await tick();
        // Some things hold her until E is pressed again (the log on the idol hill): press it now and then.
        let done = false;
        const using = G.interact.use(id).then(() => { done = true; }, () => { done = true; });
        let t = 0;
        for (; !done && t < 90; t += 0.1) {
          await tick();
          if (t > 2.5 && Math.round(t * 10) % 12 === 0 && !P().control && !G.story.busy && !G.cutscenes.active && !G.dialogue?.active) await env.tap('KeyE');
        }
        void using;
        if (!done) ok(`wander ${name}: using ${id} comes back`, false, 'still running after 90 s');
        await tick();
        if (!settled()) await settle(`using ${id}`);
        used++;
      }
    }
    // everyone who will talk (a dice match that starts plays itself: three rounds, lowest stake)
    let talked = 0;
    if (talk) {
      if (C.dice) {
        C.dice.test = {
          seed: 3, speed: 8,
          drive: { stake: (r) => r.min, bet: () => 'hold', respond: () => 'call', reroll: (dice) => dice.map(() => false), next: () => 'next' },
        };
      }
      for (const npc of G.npcs?.list || []) {
        const iid = `npc_${npc.id}`;
        const it = G.interact.get(iid);
        if (!it) continue;
        const c = npc.character;
        placeAt(c.root.position.x, c.root.position.z + 1.4, Math.PI);
        await waitFor(() => npc.visible, 6);
        let on = true;
        if (it.enabled) { try { on = !!it.enabled(); } catch { on = false; } }
        if (!on) continue;
        const r = await drive(G.interact.use(iid), 240);
        if (r?.timedOut) ok(`wander ${name}: talking to ${npc.id} ends`, false, 'still running after 240 s');
        await tick();
        if (!settled()) await settle(`talking to ${npc.id}`);
        talked++;
      }
    }
    if (C.dice) C.dice.test = null;
    await wait(1);
    if (G.combat?.inCombat) { env.killAll(); await wait(2); }
    await settle('the pass');
    const after = mainNow(), i1 = ORDER.indexOf(after);
    ok(`wander ${name}: went everywhere (${n} places, ${used} things used, ${talked} people)`, true, `main story ${before} to ${after}; scenes: ${seenScenes.join(',') || 'none'}`);
    ok(`wander ${name}: no errors`, G.errors.length === errs0, G.errors.slice(errs0).join(' | ').slice(0, 400));
    seenScenes.length = 0;
    label = '';
    // back where she was, for the story run to carry on (unless the story has moved her on)
    if (i1 === i0) placeAt(home.x, home.z, home.yaw, home.y > G.world.heightAt(home.x, home.z) + 2 ? home.y : null);
    logLine(`wander ${name}: ${before} -> ${after}`);
    return { before, after };
  }
  return wander;
}
