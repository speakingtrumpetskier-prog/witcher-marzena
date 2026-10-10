// The roadside encounters in the logic playthrough (called from playthrough.js, step 'side: roadside'). Seven small things on the roads
// (src/story/controller/roadside): the tinker's sledge, wolves at a kill, the strayed goat, the boy's scarf, the sled on the bank, the
// lantern in the forest, the quarrel at the river mouth. Each one is walked into at its hour, played the way a player would (talk, hold E,
// tap E, senses, a drawn fight), checked for its flags, its journal entry, its reward and what it leaves behind, and left again; then
// the whole lot is checked for leaks (no `rs:` system running, nothing alive that should be gone) and for what a loaded save puts back.
//
//   &fishers=old|young|both    which way the quarrel at the river mouth is settled (default: by ending, strike old, call young, step both)

export async function roadsideSteps(env) {
  const { G, C, S, O, ok, step, tick, wait, waitFor, drive, placeAt, useIt, useClue, flagOK, stage, killAll, repair, notesRead } = env;
  const RS = C.roadside;
  const prevPick = G.dialogue.autopick;
  const coinsKept = S.count('coins');
  const thawKept = S.count('thaw');
  step('side: roadside');
  ok('the roadside kit is installed with its seven encounters', !!RS && RS.installed?.length === 7, (RS?.installed || []).join(','));
  if (!RS || RS.installed?.length !== 7) return;

  // The clock for a scene. The small hours are set without the jump event: after 20:00 the story starts night one by itself, and this
  // step is not the place for that to happen.
  const day = (h, weather = 'clear') => {
    if (h >= 20 || h < 6) G.time.hours = h; else G.time.setHours(h);
    G.weather.set(weather, 0);
  };
  const picking = (re) => (node, items) => {
    const i = items.findIndex((it) => re.test(String(it.text ?? it.t).toLowerCase()));
    if (i >= 0) return i;
    const exit = items.findIndex((it) => it.exit || /^(not now|never mind|not my business)/i.test(String(it.text ?? it.t)));
    return exit >= 0 ? 0 : 0;
  };
  const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyE' }));
  const tap = async () => { key('keydown'); key('keyup'); await tick(0.1); await tick(0.1); };
  const away = async () => { placeAt(0, 128, 3.1); await wait(0.5); };
  const liveSystems = () => G.systems.filter((s) => /^rs:/.test(s.name)).length;
  const named = (n) => !!G.scene.getObjectByName(n);

  // =============================================================================================================
  // 1. The tinker's sledge, on the pass road, by day: hold E to lift the corner while he lashes it
  // =============================================================================================================
  {
    const st = RS.tinker, s = st.site;
    S.data.inventory.coins = 40;
    const thaw0 = S.count('thaw'), coins0 = S.count('coins');
    day(18.5);
    placeAt(s.x - 12, s.z - 5, 1.0);
    await wait(1);
    ok('tinker: nobody on the road at dusk (the zone is closed from 17:00)', !st.zone.bag, `bag=${!!st.zone.bag}`);
    day(10);
    await wait(0.6);
    placeAt(s.x - 12, s.z - 5, 1.0);
    await waitFor(() => !!st.zone.bag, 6, 'tinker bag');
    ok('tinker: a tinker and a sledge on the pass road by day', !!st.tinker && !!st.sled && !st.sled.mended, `tinker=${!!st.tinker} sled=${!!st.sled}`);
    ok('tinker: his sledge is a collider she cannot walk through', [...G.physics.items.values()].some((i) => i.tag === 'sledge'));
    G.dialogue.autopick = picking(/hold it up|^eight, then/);
    const run = G.interact.use('ctl:rs_tinker');
    const ring = await waitFor(() => G.uiImpl?.choicesUI?.hcur, 60, 'lift ring');
    ok('tinker: after the talk the hold ring comes up', !!ring);
    key('keydown');
    const lifted = await waitFor(() => !G.uiImpl?.choicesUI?.hcur, 30, 'ring done');
    key('keyup');
    ok('tinker: holding E lifts the corner (the ring completes)', lifted && st.sled.p >= 0.99, `p=${st.sled.p.toFixed(2)}`);
    await drive(run, 90);
    flagOK(['tinker_met', 'tinker_helped', 'tinker_stock'], 'tinker: the sledge is mended and he has stock');
    ok('tinker: the runner is mended', st.sled.mended);
    ok('tinker: a Thaw draught bought for eight grosze', S.count('thaw') === thaw0 + 1 && S.count('coins') === coins0 - 8, `thaw ${thaw0}->${S.count('thaw')} coins ${coins0}->${S.count('coins')}`);
    ok('tinker: two draughts left to sell', S.flag('tinker_stock') === 2, `stock=${S.flag('tinker_stock')}`);
    ok('tinker: the journal has it, settled quietly', G.quests.isDone('side_tinker'), `stage=${stage('side_tinker')}`);
    ok('tinker: he sets off down the road with the sledge behind him', !!st.haul, `haul=${!!st.haul}`);
    ok('tinker: nothing in the world to stop her walking on (the collider went with the sledge)', ![...G.physics.items.values()].some((i) => i.tag === 'sledge'));
    const village = G.npcs?.get('tinker');
    ok('tinker: later he is on the village schedule, at the stalls by afternoon', !!village && village.def.schedule.some((e) => e.at?.anim === 'idle_cold'), `npc=${!!village}`);
    await away();
    await waitFor(() => !st.zone.bag && !st.haul, 25, 'tinker gone');
    ok('tinker: left behind, it is all taken down', !st.zone.bag && !st.haul && liveSystems() === 0, `bag=${!!st.zone.bag} haul=${!!st.haul} systems=${liveSystems()}`);
    ok('tinker: the splintered runner stays in the snow', named('runnerScrap'));
    placeAt(s.x - 12, s.z - 5, 1.0);
    await wait(1.2);
    ok('tinker: once only: he does not come again', !st.zone.bag);
  }

  // =============================================================================================================
  // 2. Wolves at a kill, forest track, dusk: she is not noticed from the track; a drawn fight; crows afterwards
  // =============================================================================================================
  {
    const st = RS.carcass, sp = st.spot;
    const base = RS.road('forest', 190, 0);
    day(12);
    placeAt(base.x, base.z, 0);
    await wait(1);
    ok('wolves: none by day', !st.zone.bag && !named('rs_carcass'));
    day(17.2);
    placeAt(base.x, base.z, 0);
    await waitFor(() => !!st.pack, 8, 'wolf pack');
    const pack = st.pack || [];
    ok('wolves: three of them at a kill at dusk', pack.length === 3 && pack.every((w) => w.alive), `n=${pack.length}`);
    await wait(2);
    ok('wolves: eighteen metres off they are feeding, not fighting', pack.every((w) => !w.engaged && w.state === 'idle'), pack.map((w) => w.state).join(','));
    ok('wolves: the deer and the blood are now in the world for good', S.flag('carcass_seen') && named('rs_carcass'));
    ok('wolves: she remarks on them', !!S.flag('carcass_said'));
    ok('wolves: journal entry', G.quests.isActive('side_carcass'), `stage=${stage('side_carcass')}`);
    placeAt(sp.x + 5, sp.z + 5, 0);
    await wait(1.5);
    ok('wolves: closer than eleven metres they come for her', pack.some((w) => w.engaged), pack.map((w) => w.state).join(','));
    killAll();
    await waitFor(() => S.flag('carcass_wolves_dead'), 12, 'wolves dead');
    flagOK(['carcass_wolves_dead'], 'wolves: all three killed');
    ok('wolves: the journal entry is settled', G.quests.isDone('side_carcass'), `stage=${stage('side_carcass')}`);
    await away();
    await waitFor(() => !st.zone.bag, 60, 'wolves bag gone');
    ok('wolves: left behind, the wolves are gone from the world', !st.zone.bag && (G.creatures.wolves || []).filter((w) => w.alive).length === 0, `bag=${!!st.zone.bag} alive=${(G.creatures.wolves || []).filter((w) => w.alive).length}`);
    ok('wolves: the kill is still there', named('rs_carcass'));
    day(12);
    placeAt(base.x, base.z, 0);
    await waitFor(() => (st.crows?.length || 0) === 3, 8, 'crows');
    ok('wolves: by day there are crows on the kill', (st.crows || []).length === 3, `crows=${st.crows?.length}`);
    await away();
    await waitFor(() => !st.crowZone.bag, 30, 'crows gone');
    ok('wolves: and none when she is far off', !st.crowZone.bag);
  }

  // =============================================================================================================
  // 3. The strayed goat: Zofia at the west gate, the goat under the twisted pines, the rope, the eggs
  // =============================================================================================================
  {
    const st = RS.goat, gate = st.gate, gr = st.grove;
    day(12);
    placeAt(gate.x + 5, gate.z + 3, 2.4);
    await waitFor(() => !!st.owner, 6, 'owner');
    ok('goat: Zofia stands outside the west gate by day', !!st.owner);
    G.dialogue.autopick = picking(/look for her/);
    await useIt('ctl:rs_goat_owner', { wantPrompt: true });
    flagOK(['goat_asked'], 'goat: she asks, and Vesna says she will look');
    ok('goat: the journal has it: find the goat', stage('side_goat') === 'find', `stage=${stage('side_goat')}`);
    placeAt(gr.x + 8, gr.z + 4, 4);
    await waitFor(() => !!st.goat, 6, 'goat');
    ok('goat: a goat under the twisted pines', !!st.goat && !st.tether);
    await useIt('ctl:goat_take', { wantPrompt: true });
    flagOK(['goat_tied'], 'goat: she takes the rope');
    ok('goat: the goat is on a rope, and the journal moves on to bringing her home', !!st.tether && !!st.rope && stage('side_goat') === 'return', `tether=${!!st.tether} stage=${stage('side_goat')}`);
    // she walks; the goat follows her trail
    const P = G.player;
    let p0 = { x: P.position.x, z: P.position.z };
    for (let i = 0; i < 24; i++) { p0 = { x: p0.x + 1.0, z: p0.z + 0.6 }; placeAt(p0.x, p0.z, 0.9); await tick(0.1); await tick(0.1); await tick(0.1); }
    await wait(2);
    const dg = Math.hypot(st.goat.x - P.position.x, st.goat.z - P.position.z);
    ok('goat: she follows at the end of the rope', dg < 4.5, `distance=${dg.toFixed(1)}`);
    // left far behind: the rope comes off
    placeAt(P.position.x + 160, P.position.z + 100, 0);
    await waitFor(() => !st.tether, 20, 'rope off');
    ok('goat: left far behind, the rope comes off and the flag with it', !st.tether && !S.flag('goat_tied'), `tether=${!!st.tether} tied=${S.flag('goat_tied')}`);
    placeAt(st.goat.x + 2, st.goat.z + 2, 3.9);
    await wait(0.6);
    await useIt('ctl:goat_take', { wantPrompt: true });
    ok('goat: and she can be taken up again', !!st.tether && S.flag('goat_tied') === true);
    // home: Zofia
    placeAt(gate.x - 3, gate.z - 3, 1.2);
    st.goat.x = gate.x - 5; st.goat.z = gate.z - 4;
    await waitFor(() => !!st.owner, 8, 'owner again');
    const eggs0 = S.count('egg');
    await useIt('ctl:rs_goat_owner', { wantPrompt: true });
    await waitFor(() => S.flag('goat_home'), 20, 'goat home');
    flagOK(['goat_home'], 'goat: handed over');
    ok('goat: three eggs', S.count('egg') === eggs0 + 3, `eggs=${S.count('egg')}`);
    ok('goat: the journal is settled with the fanfare of a proper quest', G.quests.isDone('side_goat'), `stage=${stage('side_goat')}`);
    ok('goat: the rope is Zofia\'s now, the goat stands at her side', !!st.goat && !st.tether && !!st.rope, `goat=${!!st.goat}`);
    await away();
    await waitFor(() => !st.gateZone.bag, 30, 'gate bag gone');
    ok('goat: left behind, goat and rope are gone from the world', !st.goat && !st.rope, `goat=${!!st.goat} rope=${!!st.rope}`);
    placeAt(gate.x + 5, gate.z + 3, 2.4);
    await waitFor(() => !!st.goat && !!st.owner, 8, 'owner and goat again');
    ok('goat: and when she comes back to the gate, Zofia has the goat on a short rope', !!st.goat && !!st.owner && !!st.rope);
  }

  // =============================================================================================================
  // 4. The boy's scarf: the old woman at the shrine, senses on the pass road, back to the shrine
  // =============================================================================================================
  {
    const st = RS.scarf, sp = st.spot;
    day(12, 'overcast');
    placeAt(sp.x + 6, sp.z + 4, 3.9);
    await waitFor(() => !!st.woman, 6, 'woman');
    ok('scarf: an old woman kneels at the shrine with the milk', !!st.woman);
    ok('scarf: the scarf is in the drift on the pass road but nobody has asked yet', st.scarf.visible && G.senses.clue('ctl:scarf')?.enabled?.() === false);
    G.dialogue.autopick = picking(/keep an eye|\w/);
    await useIt('ctl:rs_shrine_woman', { wantPrompt: true });
    flagOK(['scarf_asked'], 'scarf: she asks after her son');
    ok('scarf: the journal has it: look for the boy', stage('side_scarf') === 'look', `stage=${stage('side_scarf')}`);
    ok('scarf: the boot prints go on up the road', !!G.senses.trail('ctl:scarf_trail'));
    await useClue('ctl:scarf');
    flagOK(['scarf_found'], 'scarf: found in the drift with hunter senses');
    ok('scarf: in the pack, and read', S.count('scarf') === 1 && notesRead.includes('item_scarf'), `scarf=${S.count('scarf')}`);
    ok('scarf: the journal moves on to taking it back', stage('side_scarf') === 'return', `stage=${stage('side_scarf')}`);
    ok('scarf: gone from the road', !st.scarf.visible);
    placeAt(sp.x + 6, sp.z + 4, 3.9);
    await waitFor(() => !!st.woman, 6, 'woman again');
    const coins0 = S.count('coins');
    await useIt('ctl:rs_shrine_woman', { wantPrompt: true });
    flagOK(['scarf_returned'], 'scarf: she has it back');
    ok('scarf: eight grosze, and the scarf is out of the pack', S.count('coins') === coins0 + 8 && S.count('scarf') === 0, `coins ${coins0}->${S.count('coins')} scarf=${S.count('scarf')}`);
    ok('scarf: the journal is settled', G.quests.isDone('side_scarf'), `stage=${stage('side_scarf')}`);
    ok('scarf: it hangs on the shrine post', named('hangingScarf'));
  }

  // =============================================================================================================
  // 5. A sled on the bank: talk, then tap E to push it up out of the rut
  // =============================================================================================================
  {
    const st = RS.sled, s = st.site;
    day(12);
    placeAt(s.x + 4, s.z + 14, 3.2);
    await waitFor(() => !!st.boy, 6, 'boy');
    ok('sled: a boy and a stuck sled on the river bank', !!st.boy && !!st.sled, `boy=${!!st.boy}`);
    G.dialogue.autopick = picking(/i'll push/);
    const coins0 = S.count('coins');
    const run = G.interact.use('ctl:rs_sled_boy');
    await waitFor(() => st.zone.bag?.busy && st.push, 60, 'pushing');
    ok('sled: after the talk she is behind the sled with her hands on it', !!st.push && st.push.p < 0.2, `push=${JSON.stringify(st.push)}`);
    let pbefore = 0;
    for (let i = 0; i < 12 && !S.flag('sled_freed'); i++) {
      await tap();
      if (i === 3) pbefore = st.push?.p ?? 0;
    }
    ok('sled: each tap shoves it further up the bank', pbefore > 0.3 && pbefore < 1, `p after four taps=${pbefore.toFixed(2)}`);
    await drive(run, 90);
    flagOK(['sled_met', 'sled_freed'], 'sled: it comes out');
    ok('sled: one grosz from the boy', S.count('coins') === coins0 + 1, `coins ${coins0}->${S.count('coins')}`);
    ok('sled: the journal is settled quietly', G.quests.isDone('side_sled'), `stage=${stage('side_sled')}`);
    ok('sled: he takes it off along the road', !!st.haul);
    ok('sled: the marks stay on the bank', named('rs_sled_marks'));
    await away();
    await waitFor(() => !st.zone.bag && !st.haul, 25, 'sled gone');
    ok('sled: left behind, taken down', !st.zone.bag && !st.haul, `bag=${!!st.zone.bag} haul=${!!st.haul}`);
  }

  // =============================================================================================================
  // 6. A lantern in the forest at night: he runs, and leaves snares and a tally
  // =============================================================================================================
  {
    const st = RS.poacher, sp = st.spot;
    const road = RS.road('forest', 205, 0);
    day(12);
    placeAt(road.x, road.z, 0);
    await wait(1);
    ok('poacher: nobody there by day', !st.zone.bag && !named('rs_snares'));
    day(23);
    placeAt(road.x, road.z, 0);
    await waitFor(() => !!st.man, 8, 'poacher');
    ok('poacher: at night a man with a lantern is setting snares off the track', !!st.man && !S.flag('poacher_chased'));
    placeAt(sp.x + 9, sp.z + 5, 4);
    await waitFor(() => S.flag('poacher_chased'), 8, 'he runs');
    flagOK(['poacher_chased'], 'poacher: he bolts when she is within fifteen metres');
    ok('poacher: the journal has it', G.quests.isActive('side_poacher'), `stage=${stage('side_poacher')}`);
    ok('poacher: snares and a satchel stay behind', named('rs_snares'));
    await waitFor(() => !st.man.visible, 90, 'he is gone');
    ok('poacher: he is out of sight and his light with him', !st.man.visible, `visible=${st.man.visible}`);
    await useIt('ctl:poacher_satchel', { wantPrompt: true });
    flagOK(['poacher_note'], 'poacher: the tally read');
    ok('poacher: note read, journal settled', notesRead.includes('note_poacher') && G.quests.isDone('side_poacher'), `stage=${stage('side_poacher')}`);
    await away();
    await waitFor(() => !st.zone.bag, 25, 'poacher bag gone');
    ok('poacher: left behind, taken down; the snares stay', !st.zone.bag && named('rs_snares'));
    day(23);
    placeAt(road.x, road.z, 0);
    await wait(1.5);
    ok('poacher: once only: he does not come again', !st.zone.bag);
  }

  // =============================================================================================================
  // 7. Whose hole: two fishermen at the river mouth, in the morning; the answer decides who stays
  // =============================================================================================================
  {
    const st = RS.fishers, h = st.hole;
    const how = O.fishers || (O.choice === 'strike' ? 'old' : O.choice === 'call' ? 'young' : 'both');
    day(14);
    placeAt(h.x + 14, h.z + 8, 4.2);
    await wait(1);
    ok('fishers: nobody on the ice in the afternoon', !st.zone.bag);
    day(8);
    placeAt(h.x + 14, h.z + 8, 4.2);
    await waitFor(() => !!st.old && !!st.young, 8, 'fishers');
    ok('fishers: two men quarrelling over one hole in the morning', !!st.old && !!st.young && !S.flag('fishers_settled'));
    const coins0 = S.count('coins');
    G.dialogue.autopick = picking(how === 'old' ? /it's his\. he cut it/ : how === 'young' ? /his line in it/ : /ice enough for two/);
    await useIt('ctl:rs_fishers_old', { wantPrompt: true });
    await waitFor(() => S.flag('fishers_settled'), 40, 'settled');
    ok(`fishers: she settles it: ${how}`, S.flag('fishers_settled') === how, `settled=${S.flag('fishers_settled')}`);
    ok('fishers: four grosze from the one she favoured (nothing if she suggested two holes)', S.count('coins') === coins0 + (how === 'both' ? 0 : 4), `coins ${coins0}->${S.count('coins')}`);
    ok('fishers: the journal is settled quietly', G.quests.isDone('side_fishers'), `stage=${stage('side_fishers')}`);
    await wait(14);
    if (how === 'both') ok('fishers: a second hole is cut', named('rs_hole') && G.scene.children.filter((o) => o.name === 'rs_hole').length === 2);
    await away();
    await waitFor(() => !st.zone.bag, 30, 'fishers gone');
    ok('fishers: left behind, taken down', !st.zone.bag);
    day(8);
    placeAt(h.x + 14, h.z + 8, 4.2);
    await waitFor(() => !!(st.old || st.young), 8, 'the ones who stayed');
    const stayed = how === 'both' ? !!st.old && !!st.young : how === 'old' ? !!st.old && !st.young : !!st.young && !st.old;
    ok('fishers: next morning whoever stayed is fishing (the quarrel does not start again)', stayed, `old=${!!st.old} young=${!!st.young}`);
  }

  // =============================================================================================================
  // 8. What the world keeps, what a load puts back, and nothing left running
  // =============================================================================================================
  await away();
  await wait(8);
  ok('the roadside: with nobody near, no encounter system is running', liveSystems() === 0, `systems=${G.systems.filter((s) => /^rs:/.test(s.name)).map((s) => s.name).join(',')}`);
  ok('the roadside: no wolf, goat or crow left over in the world', (G.creatures.wolves || []).filter((w) => w.alive).length === 0 && !RS.goat.goat, `goat=${!!RS.goat.goat}`);
  for (const q of ['side_tinker', 'side_carcass', 'side_goat', 'side_scarf', 'side_sled', 'side_poacher', 'side_fishers']) ok(`journal: ${q} settled`, G.quests.isDone(q), `stage=${stage(q)}`);
  ok('the main story did not move', stage('main_straw') === 'night', `main_straw=${stage('main_straw')}`);
  // a load puts the world's memory back, and takes back what a flag no longer supports
  G.events.emit('loaded', {});
  await wait(0.5);
  ok('load: the memory of all of it is put back', ['rs_carcass', 'rs_snares', 'rs_sled_marks', 'hangingScarf', 'runnerScrap'].every(named));
  S.set('sled_freed', false);
  G.events.emit('loaded', {});
  ok('load: a flag that is not set does not leave its marks (a new game)', !named('rs_sled_marks'));
  S.set('sled_freed');
  G.events.emit('loaded', {});
  ok('load: and sets them again', named('rs_sled_marks'));
  // what the villagers say now
  const { chooseBark } = await import('../../gameplay/npcs/barks.js');
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const villager = { id: 'villager_f_2', preset: 'villager_f_2', station: { tag: '' }, def: {}, position: { x: 0, z: 100 } };
  day(12);
  const heard = new Set();
  for (let i = 0; i < 400; i++) { const line = chooseBark(G, villager, rnd); if (line) heard.add(line); }
  const mention = (re) => [...heard].some((l) => re.test(l));
  ok('barks: villagers mention the goat, the tinker, the hare, the wolves and the scarf', mention(/goat/i) && mention(/tinker/i) && mention(/hare/i) && mention(/wolves/i) && mention(/scarf/i), [...heard].filter((l) => /goat|tinker|hare|wolves|scarf|Wacław/i.test(l)).length + ' lines');
  ok('barks: and the quarrel at the river mouth', mention(/Wacław/), 'fishers');

  // put the world as the next step expects it
  G.dialogue.autopick = prevPick;
  day(17.9);
  S.data.inventory.coins = Math.max(coinsKept, S.count('coins'));
  if (S.count('thaw') < thawKept) S.data.inventory.thaw = thawKept;
  repair();
}
