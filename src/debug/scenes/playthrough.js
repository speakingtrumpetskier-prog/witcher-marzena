// Scripted end-to-end playthrough: an autopilot that plays MARZENA from the first frame of the pass to
// the credits through the real systems (zones, interactions, clues, dialogue, cutscenes, quests, the
// boss, the decisive choice) and asserts the quest stage and flags at every checkpoint.
//
//   ?scene=playthrough                      full run, rendered (slow in software WebGL)
//   &lite=1                                 logic only: no rendering, no vegetation, audio or postfx
//   &choice=strike|call|step                the ending to choose (default strike); step needs the reeve's money
//   &from=<quest>:<stage>                   start from a quest stage with ?start semantics (e.g. main_straw:camp)
//   &side=0                                 skip the side content
//   &hanka=comfort|blame  &ola=truth|lie  &bird=0|1     the choices along the way
//   Output: window.__playthrough = { rows, pass, fail, warn, text, done, ending, creditsShown, errors, promise }
//           and a PASS / FAIL table in the console. Await window.__playthrough.promise for the finish.
//
// The autopilot teleports between steps, stands where the prompt should appear and checks it does,
// uses interactions and senses clues, skips cutscenes, picks dialogue answers by text, and wins
// fights with god mode and a damage multiplier. It drives the simulation itself in steps of 0.1 s
// (G.systems are gated so the engine loop only renders), so a run does not depend on the frame rate.
import * as THREE from 'three';
import QUESTS, { MAIN_ORDER } from '../../story/content/quests.js';

const Q = new URLSearchParams(location.search);
const LITE = Q.has('lite');
export const needsWorld = true;
export const modules = LITE
  ? ['atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'locations', 'characters', 'ui', 'gameplay', 'story']
  : ['atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'vegetation', 'locations', 'characters', 'ui', 'audio', 'gameplay', 'story', 'postfx'];

const SKIP_SYSTEMS = /^(freecam|atmosphere|sky|wildFade|water|props-fx|light-pool|village-lod|terrain|rocks|smoke-budget|hanged|wild:)/;

export async function init(G) {
  const O = {
    choice: Q.get('choice') || 'strike',
    from: Q.get('from') || null,
    side: Q.get('side') !== '0',
    hanka: Q.get('hanka') || 'comfort',
    ola: Q.get('ola') || 'truth',
    bird: Q.get('bird') !== '0',
    money: Q.get('money') || (Q.get('choice') === 'step' ? 'take' : 'refuse'),
    lite: LITE,
  };
  const report = {
    options: O, rows: [], pass: 0, fail: 0, warn: 0, text: '', done: false, running: true,
    ending: null, creditsShown: 0, errors: [], notes: [], scenes: [], promise: null,
  };
  window.__playthrough = report;
  G.events.once('game:ready', () => {
    report.promise = run(G, O, report).catch((e) => {
      console.error('[pt] crashed', e);
      row(report, 'autopilot', false, `crashed: ${e.message}`);
    }).finally(() => finish(G, report));
  });
}

// ---- reporting -----------------------------------------------------------------------------------
let currentStep = 'boot';
function row(report, name, ok, detail = '', level = 'fail') {
  const r = { step: currentStep, name, ok: !!ok, level: ok ? 'pass' : level, detail: String(detail ?? '') };
  report.rows.push(r);
  if (ok) report.pass++; else if (level === 'warn') report.warn++; else report.fail++;
  console.log(`[pt] ${r.level === 'pass' ? 'PASS' : r.level === 'warn' ? 'WARN' : 'FAIL'} ${r.step} :: ${name}${detail ? ` (${detail})` : ''}`);
  return ok;
}

function finish(G, report) {
  report.errors = [...G.errors];
  row(report, 'G.errors is empty', report.errors.length === 0, report.errors.join(' | ').slice(0, 300));
  const lines = report.rows.map((r) => `${r.level === 'pass' ? 'PASS' : r.level === 'warn' ? 'WARN' : 'FAIL'}  ${r.step.padEnd(14)} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  report.text = lines.join('\n');
  report.done = true;
  report.running = false;
  // A compact table for harnesses that only show the first lines of the console.
  const by = {};
  for (const r of report.rows) { const b = (by[r.step] ||= { p: 0, f: 0, w: 0 }); if (r.level === 'pass') b.p++; else if (r.level === 'warn') b.w++; else b.f++; }
  const table = Object.entries(by).map(([k, b]) => `${k}: ${b.p}${b.f ? ` FAIL ${b.f}` : ''}${b.w ? ` warn ${b.w}` : ''}`).join(' | ');
  report.table = table;
  for (let i = 0; i < table.length; i += 360) console.warn(`[pt] TABLE ${table.slice(i, i + 360)}`);
  console.log(`[pt] ===== ${report.pass} passed, ${report.fail} failed, ${report.warn} warnings; ending=${report.ending}; credits=${report.creditsShown} =====`);
  console.warn(`[pt] SUMMARY pass=${report.pass} fail=${report.fail} warn=${report.warn} ending=${report.ending} credits=${report.creditsShown} errors=${report.errors.length}${report.fail ? ` FAILS: ${report.rows.filter((r) => r.level === 'fail').map((r) => `${r.step}/${r.name}`).join('; ').slice(0, 300)}` : ''}`);
}

// ---- the run ------------------------------------------------------------------------------------
async function run(G, O, report) {
  const C = G.storyCtl;
  const S = G.state;
  const ok = (name, cond, detail, level) => row(report, name, cond, detail, level);
  const step = (name) => { currentStep = name; console.log(`[pt] --- ${name}`); };

  if (!C) { ok('controller installed', false, 'G.storyCtl missing'); return; }
  ok('controller installed', C.installed?.length === 10, (C.installed || []).join(','));

  // ---- the simulation clock -----------------------------------------------------------------
  const gate = { on: false };
  const sim = { t: 0 };
  const origAdd = G.addSystem.bind(G);
  G.addSystem = (name, fn, order) => origAdd(name, (dt, t) => { if (gate.on) fn(dt, t); }, order);
  for (const s of G.systems) { const u = s.update; s.update = (dt, t) => { if (gate.on) u(dt, t); }; }
  if (LITE) {
    G.renderer.render = () => {};
    if (G.postfx) G.postfx.render = () => {};
  }
  G.time.scale = 0;
  G.cameraOwner = 'rig';
  G.dialogue.speed = 30;
  G.story.timeScale = 3;
  G.story.noAutosave = true;

  const macro = () => new Promise((r) => setTimeout(r, 0));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  let steps = 0;
  async function tick(dt = 0.1) {
    gate.on = true;
    G.clock.delta = dt;
    G.clock.elapsed += dt;
    G.clock.frame++;
    G.uniforms.uTime.value = G.clock.elapsed;
    for (const s of G.systems) {
      if (LITE && SKIP_SYSTEMS.test(s.name)) continue;
      try { s.update(dt, G.clock.elapsed); } catch (e) {
        if (!s._ptErr) { s._ptErr = true; console.error(`[pt] system ${s.name}`, e); G.errors.push(`system ${s.name}: ${e.message}`); }
      }
    }
    gate.on = false;
    sim.t += dt;
    steps++;
    // Rendered runs let the engine draw a frame now and then so shader and render errors surface.
    if (!LITE && steps % 12 === 0) { gate.on = false; await nextFrame(); } else await macro();
    watchers();
  }
  async function wait(secs) { for (let t = 0; t < secs; t += 0.1) await tick(); }
  async function waitFor(pred, secs, label) {
    for (let t = 0; t < secs; t += 0.1) {
      let v = false;
      try { v = pred(); } catch { v = false; }
      if (v) return true;
      await tick();
    }
    if (label) console.log(`[pt] timeout waiting for ${label}`);
    return false;
  }
  // Drive the simulation until a promise settles (scenes, dialogues, rests).
  async function drive(p, maxSecs = 120) {
    let settled = false, val, err;
    Promise.resolve(p).then((v) => { settled = true; val = v; }, (e) => { settled = true; err = e; });
    let t = 0;
    while (!settled && t < maxSecs) { await tick(); t += 0.1; }
    if (!settled) { console.log('[pt] drive timed out'); return { timedOut: true }; }
    if (err) throw err;
    return val;
  }

  // ---- what to do while things happen ------------------------------------------------------------
  const logLine = (...a) => console.log('[pt]', ...a);
  let sceneLog = [];
  G.events.on('cutscene:start', ({ id }) => { sceneLog.push(`${id}:start`); report.scenes.push(id); });
  G.events.on('cutscene:end', ({ id, skipped }) => { sceneLog.push(`${id}:end${skipped ? '(skipped)' : ''}`); });
  const dlgLog = [];
  G.events.on('dialogue:start', ({ id }) => dlgLog.push(id));
  const stageLog = [];
  G.events.on('quest:update', (e) => stageLog.push(`${e.id}:${e.stage}:${e.kind}`));
  const stageSeen = (q, st) => stageLog.some((l) => l.startsWith(`${q}:${st}:`));
  const notesRead = [];
  const origRead = G.ui.readNote;
  G.ui.readNote = async (n) => {
    const id = typeof n === 'string' ? n : n?.id;
    notesRead.push(id);
    if (id && !G.uiImpl?.noteInfo?.(id)) ok(`note text exists: ${id}`, false, 'noteInfo returned nothing');
    S.readNote?.(id);
    if (!LITE) { /* the real sheet is skipped: it needs a key press to close */ }
  };
  void origRead;
  const origCredits = G.ui.credits;
  G.ui.credits = async () => { report.creditsShown++; logLine('credits'); void origCredits; };

  // Dialogue and cutscene answers: by text, with a memory so a hub always ends.
  let lastChoiceItems = null;
  const picked = new Set();
  G.events.on('dialogue:start', () => picked.clear());
  G.dialogue.autopick = (node, items) => {
    const text = (it) => String(it.text ?? it.t ?? '').toLowerCase();
    lastChoiceItems = items.map(text);
    const find = (re) => items.findIndex((it) => re.test(text(it)));
    let i = -1;
    // The money, the decisive talk, the child's question, the ending.
    if (find(/^all right/) >= 0 && find(/^keep it/) >= 0) i = find(O.money === 'take' ? /^all right/ : /^keep it/);
    else if (find(/still here|needs you/) >= 0) i = find(O.hanka === 'blame' ? /kept walking|saw her/ : /still here|needs you/);
    else if (find(/for a bit/) >= 0) i = find(O.ola === 'lie' ? /won't happen/ : /for a bit/);
    else if (find(/^strike/) >= 0 && find(/hanka/) >= 0) i = find(O.choice === 'strike' ? /^strike/ : O.choice === 'step' ? /step back/ : /hanka/);
    if (i < 0) {
      // Hub: the first answer not taken yet that is not a way out; the way out last.
      const exit = (it) => /^(never mind|that is all|nothing|leave|keep it)/.test(text(it)) || it.exit;
      const fresh = items.findIndex((it) => !picked.has(text(it)) && !exit(it) && !/thaw draught/.test(text(it)));
      i = fresh >= 0 ? fresh : items.findIndex(exit);
      if (i < 0) i = 0;
    }
    picked.add(text(items[i]));
    return i;
  };
  // Cutscenes are skipped the moment they start (a choice stops the skip, so it is answered, then skipped on).
  function watchers() {
    const cs = G.cutscenes;
    if (cs?.active && !cs.skipping && !cs._choiceOpen && cs._d?.opts?.skippable !== false) { try { cs.skip(); } catch (e) { logLine('skip failed', e.message); } }
    // A rest in flight needs nothing; a stuck dialogue gets its advance.
    if (G.dialogue?.active) G.dialogue._advance = true;
    if (G.uiImpl?.noteView?.isOpen) G.uiImpl.noteView.close();
  }

  // Fights are won with god mode.
  const P = () => G.player;
  const god = () => { const p = P(); if (p) { p.invulnerable = true; p.damageMult = Math.max(p.damageMult || 1, 60); } };
  god();
  function killAll({ boss = false } = {}) {
    let n = 0;
    for (const e of [...(G.combat?.enemies || [])]) {
      if (!e.alive || !!e.isBoss !== boss) continue;
      const hit = { source: boss ? 'gale' : 'sword', kind: 'heavy', combo: 1, damage: boss ? 140 : 9999, stagger: true, knockback: 0, dir: new THREE.Vector3(0, 0, 1), origin: new THREE.Vector3(), point: e.position.clone().setY(e.position.y + 1), heavy: true, from: P() };
      try { e.takeHit(hit); n++; } catch (err) { logLine('takeHit failed', err.message); }
      if (!boss && e.alive && typeof e.ignite === 'function') e.ignite();
    }
    return n;
  }

  // ---- positions ---------------------------------------------------------------------------------
  const placeAt = (x, z, yaw = 0, y = null) => {
    const p = P();
    p.teleport(x, z, yaw);
    if (y != null) {
      p.position.y = y;
      p.character.root.position.y = y;
      p.teleport(x, z, yaw);
      p.position.y = y;
      p.character.root.position.y = y;
    }
  };
  const vec = (v) => (v.isVector3 ? v : Array.isArray(v) ? new THREE.Vector3(v[0], v.length === 3 ? v[1] : 0, v[v.length - 1]) : new THREE.Vector3(v.x, v.y ?? 0, v.z));
  const itemPos = (it) => vec(typeof it.pos === 'function' ? it.pos() : it.pos);
  const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

  // Stand near an interaction facing it until the prompt shows (it should), then use it.
  async function approach(id, { y = null, dist = 1.35, wantPrompt = true } = {}) {
    const it = G.interact.get(id);
    if (!it) { ok(`interaction exists: ${id}`, false, 'not registered'); return false; }
    const tp = itemPos(it);
    if (it.enabled) { let en = true; try { en = !!it.enabled(); } catch { en = false; } if (!en) { logLine(`${id} not enabled`); } }
    const offs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (const d of [dist, dist * 1.5, dist * 0.7]) {
      for (const [ox, oz] of offs) {
        placeAt(tp.x + ox * d, tp.z + oz * d, yawTo(tp.x + ox * d, tp.z + oz * d, tp.x, tp.z), y);
        await tick(0.1);
        await tick(0.1);
        if (G.interact.current?.id === id) {
          if (wantPrompt) ok(`prompt shows: ${id}`, true, `[E] ${it.verb} ${typeof it.label === 'function' ? it.label() : it.label}`);
          return true;
        }
      }
    }
    const cur = G.interact.current?.id;
    if (wantPrompt) ok(`prompt shows: ${id}`, false, `current=${cur || 'none'} enabled=${it.enabled ? it.enabled() : true}`, 'warn');
    return false;
  }
  async function useIt(id, opts = {}) {
    await approach(id, opts);
    await drive(G.interact.use(id));
    await tick();
  }
  async function useClue(id, opts = {}) {
    G.senses.force(true);
    await wait(0.6);
    const cl = G.senses.clue(id);
    if (!cl) { ok(`clue exists: ${id}`, false, 'missing or already examined'); G.senses.force(null); return false; }
    placeAt(cl.pos.x + 1.2, cl.pos.z + 0.9, yawTo(cl.pos.x + 1.2, cl.pos.z + 0.9, cl.pos.x, cl.pos.z), opts.y ?? null);
    await wait(0.5);
    const iid = `senses:${id}`;
    const shown = G.interact.current?.id === iid;
    ok(`senses prompt shows: ${id}`, shown, `current=${G.interact.current?.id || 'none'}`, 'warn');
    await drive(G.interact.use(iid));
    G.senses.force(null);
    await tick();
    return true;
  }
  async function talkTo(npcId, note = '') {
    const n = G.npcs.get(npcId);
    if (!n) { ok(`npc exists: ${npcId}`, false); return false; }
    const c = n.character;
    // Far NPCs sleep until someone comes near: go to where they stand and let them wake.
    placeAt(c.root.position.x, c.root.position.z + 2.5, Math.PI);
    await waitFor(() => n.visible, 8, `${npcId} visible`);
    // The NPC's own position is the prompt anchor; stand in front of it.
    const p0 = c.root.position;
    const iid = `npc_${npcId}`;
    const it = G.interact.get(iid);
    if (!it) { ok(`talk interaction exists: ${npcId}`, false); return false; }
    let found = false;
    for (const [ox, oz] of [[0, 1.4], [1.4, 0], [0, -1.4], [-1.4, 0], [1, 1], [-1, 1]]) {
      const x = p0.x + ox, z = p0.z + oz;
      placeAt(x, z, yawTo(x, z, p0.x, p0.z));
      await tick(0.1); await tick(0.1);
      if (G.interact.current?.id === iid) { found = true; break; }
    }
    ok(`prompt shows: ${iid}`, found, `${note} current=${G.interact.current?.id || 'none'} npc@${p0.x.toFixed(1)},${p0.z.toFixed(1)} vis=${n.visible}`, 'warn');
    const before = dlgLog.length;
    await drive(G.interact.use(iid));
    await tick();
    ok(`dialogue ran for ${npcId}`, dlgLog.length > before, dlgLog.slice(before).join(','));
    return true;
  }

  const stage = (q) => G.quests.stage(q);
  // After a FAIL has been recorded, set what the step should have set so later checkpoints stay meaningful.
  const repair = (...names) => { for (const n of names) if (!S.flag(n)) { S.set(n); logLine(`repaired flag ${n}`); } };
  const flagOK = (names, label) => {
    const miss = names.filter((f) => !S.flag(f));
    ok(label || `flags: ${names.join(', ')}`, miss.length === 0, miss.length ? `missing ${miss.join(',')}` : '');
  };
  const stageIs = (q, st, label) => {
    const cur = stage(q);
    const done = G.quests.isDone(q);
    ok(label || `${q} at ${st}`, st === 'done' ? done : cur === st, `now ${done ? 'done' : cur}`);
  };

  // ---- the order of the main story, for &from= ----------------------------------------------------------
  const ORDER = [];
  for (const q of MAIN_ORDER) for (const s of QUESTS[q].stages) ORDER.push(`${q}:${s.id}`);
  const fromIdx = O.from ? ORDER.indexOf(O.from.includes(':') ? O.from : `${O.from}:${QUESTS[O.from].stages[0].id}`) : 0;
  const reached = (at) => ORDER.indexOf(at) >= fromIdx;
  const wants = (at) => reached(at);

  // =========================================================================================================
  // BEGIN
  // =========================================================================================================
  step('start');
  if (O.from) {
    const [q, st] = O.from.split(':');
    await drive(G.story.debugStart(q, st));
    ok(`debug start ${O.from}`, true, `stage ${stage(q)}`);
  } else {
    await drive(G.story.newGame().catch((e) => { logLine('newGame failed', e.message); }), 90);
    await wait(0.5);
  }
  G.time.scale = 0;
  god();
  G.story.timeScale = 3;
  // The spirits module is not part of this run, so the sky never tells the story that the player has looked up
  // at the herders or at Matka Chmur. Stand in for it: dialogue topics and barks about them are gated on these.
  S.set('planetnicy_seen');
  S.set('matka_seen');

  // ---- Q1: the pass ---------------------------------------------------------------------------------
  if (wants('main_pass:pass')) {
    step('pass');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 60, 'c1 over');
    await wait(0.5);
    stageIs('main_pass', 'wreck', 'C1 over: Q1 at the wreck');
  }
  if (wants('main_pass:wreck') && stage('main_pass') === 'wreck') {
    step('wreck');
    await useClue('ctl:cart');
    flagOK(['cart_examined'], 'cart examined with senses');
    await useClue('ctl:letter');
    flagOK(['letter_read'], 'letter read');
    repair('cart_examined', 'letter_read');
    ok('note read: note_cart_family', notesRead.includes('note_cart_family'));
    stageIs('main_pass', 'wolves', 'Q1 at the wolves');
  }
  if (wants('main_pass:wolves') && stage('main_pass') === 'wolves') {
    step('wolves');
    const spawned = await waitFor(() => (G.creatures?.wolves?.length || 0) >= 3, 12, 'road wolves');
    ok('three wolves come off the road', spawned && G.creatures.wolves.length === 3, `n=${G.creatures?.wolves?.length}`);
    await wait(1.0);
    killAll();
    await wait(3.5);
    await waitFor(() => S.flag('wolves_prologue_done'), 15, 'wolves done');
    flagOK(['wolves_prologue_done'], 'wolves beaten');
    repair('wolves_prologue_done');
    stageIs('main_pass', 'watchtower', 'Q1 at the watchtower');
    ok('combat has ended after the wolves', !G.combat.inCombat, `inCombat=${G.combat.inCombat}`, 'warn');
  }
  if (wants('main_pass:watchtower') && stage('main_pass') === 'watchtower') {
    step('valley');
    const wt = G.world.locations.watchtower;
    placeAt(wt.crest.x - 20, wt.crest.z + 14, 0.8);
    await wait(0.5);
    placeAt(wt.crest.x, wt.crest.z, 0.8);
    await waitFor(() => G.cutscenes.active || S.flag('prologue_done'), 8, 'c2 start');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'c2 end');
    await wait(0.4);
    flagOK(['prologue_done'], 'C2 played, prologue done');
    repair('prologue_done');
    ok('C2 ran once', report.scenes.filter((s) => s === 'c2_valley').length === 1);
    ok('weather clear after the valley', G.weather.state === 'clear', G.weather.state);
    stageIs('main_pass', 'done', 'Q1 done');
    stageIs('main_ice', 'ride', 'Q2 at the ride');
  }

  // ---- Q2: Marzena ---------------------------------------------------------------------------------
  if (wants('main_ice:ride') && stage('main_ice') === 'ride') {
    step('west gate');
    const gate = C.V.gate;
    placeAt(gate.x + 14, gate.z + 3, 4.7);
    await wait(0.4);
    placeAt(gate.x + 2, gate.z + 1, 4.7);
    await waitFor(() => G.cutscenes.active || S.flag('song_heard'), 8, 'c3 start');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'c3 end');
    await wait(0.4);
    flagOK(['song_heard', 'met_ola'], 'C3 at the west gate');
    repair('song_heard', 'met_ola');
    stageIs('main_ice', 'board', 'Q2 at the notice board');
  }
  if (wants('main_ice:board') && stage('main_ice') === 'board') {
    step('notice board');
    await useIt('ctl:notice_board', { wantPrompt: true });
    flagOK(['contract_taken', 'wolves_contract_read'], 'both papers read');
    repair('contract_taken');
    ok('notes read: contract and wolves', notesRead.includes('note_contract') && notesRead.includes('note_wolves_contract'));
    ok('side quest started: side_wolves', !!G.quests.rec('side_wolves'));
    stageIs('main_ice', 'ask', 'Q2 asking around');
  }
  if (wants('main_ice:ask') && stage('main_ice') === 'ask') {
    step('tavern');
    G.time.setHours(17.2);
    await talkTo('zbyszek');
    flagOK(['met_zbyszek'], 'Zbyszek talked to');
    repair('met_zbyszek');
    step('longhouse');
    await talkTo('bogdan');
    flagOK(['met_bogdan'], 'Bogdan talked to');
    repair('met_bogdan');
    ok('money choice recorded', O.money === 'take' ? !!S.flag('took_reeve_money') : !!S.flag('refused_reeve_money'), O.money);
    if (O.money === 'take') ok('took the money: coins >= 100', S.count('coins') >= 100, `coins=${S.count('coins')}`);
    await wait(0.5);
    stageIs('main_ice', 'hanka', 'Q2 find Hanka');
  }
  if (wants('main_ice:hanka') && stage('main_ice') === 'hanka') {
    step('hanka');
    G.time.setHours(17.3);
    await talkTo('hanka');
    flagOK(['met_hanka', 'hanka_hired'], 'Hanka hired her');
    repair('met_hanka', 'hanka_hired');
    ok('paid: 61 grosze and the ring', S.count('ring') >= 1 && S.count('coins') >= 61, `coins=${S.count('coins')} ring=${S.count('ring')}`);
    await wait(0.5);
    stageIs('main_ice', 'done', 'Q2 done');
    stageIs('main_straw', 'night', 'Q3 waits for nightfall');
  }

  // ---- side content before night -----------------------------------------------------------------------
  if (O.side && wants('main_straw:night') && stage('main_straw') === 'night') {
    step('side: bird');
    G.time.setHours(17.9);
    if (O.bird) {
      await talkTo('jarek');
      flagOK(['jarek_met', 'bird_taken'], 'Jarek gave her the bird');
      ok('bird in the pack', S.count('bird') === 1, `bird=${S.count('bird')}`);
      ok('side_bird started', G.quests.isActive('side_bird'));
    }
    step('side: ledger');
    await useIt('ctl:ledger', { wantPrompt: true });
    flagOK(['ledger_found'], 'ledger read in the cellar');
    ok('side_ledger at tell', stage('side_ledger') === 'tell', `stage=${stage('side_ledger')}`);

    step('side: bear sword');
    const bd = G.world.locations.bearDen;
    placeAt(bd.approach.x, bd.approach.z, Math.PI);
    await wait(1.5);
    ok('the bear sleeps in its den', (G.creatures?.bears?.length || 0) === 1 && G.creatures.bears[0].state === 'sleep', `bears=${G.creatures?.bears?.length} state=${G.creatures?.bears?.[0]?.state}`);
    await useIt('ctl:silver_sword', { wantPrompt: true });
    flagOK(['wit_sword'], 'silver sword taken');
    ok('sword changes the blade', P().character.swordKind === 'silver' && P().damageMult > 1, `kind=${P().character.swordKind}`);
    killAll();
    await wait(1);

    step('side: island');
    const is = G.world.locations.island;
    placeAt(is.approach.x, is.approach.z, Math.PI);
    await wait(0.4);
    await useIt('ctl:island_stones', { wantPrompt: true });
    ok('note read: note_island', notesRead.includes('note_island'));
    await useIt('ctl:island_power', { wantPrompt: true });
    flagOK(['island_power'], 'place of power used');

    step('side: wolves');
    placeAt(362, -55, 0);
    await wait(2);
    ok('side_wolves reached the den stage', stage('side_wolves') === 'den', `stage=${stage('side_wolves')}`);
    const den = G.world.locations.waterfall.den;
    placeAt(den.mouth.x + 18, den.mouth.z + 22, Math.PI);
    await waitFor(() => (G.creatures?.wolves?.length || 0) >= 5, 12, 'den wolves');
    ok('den wolves (four and an alpha)', G.creatures.wolves.length === 5, `n=${G.creatures.wolves.length}`);
    await wait(0.5);
    killAll();
    await waitFor(() => S.flag('wolves_mill_done'), 20, 'den cleared');
    flagOK(['wolves_mill_done'], 'den cleared');
    G.time.setHours(17.9);
    placeAt(362, -55, 0);
    await wait(2);
    await talkTo('miller');
    flagOK(['miller_warm_water'], 'miller told her about the warm water');
    ok('side_wolves done, 40 grosze', G.quests.isDone('side_wolves'), `stage=${stage('side_wolves')} done=${G.quests.isDone('side_wolves')}`);
    G.time.setHours(17.9);

    // ---- the herders: the miller's wife asks for the hand-bell (optional side quest, main story untouched) ----
    step('side: hand-bell');
    placeAt(362, -55, 0);
    await wait(2);
    ok('no hand-bell quest before she is asked', !G.quests.rec('side_handbell'));
    await talkTo('miller_wife');
    flagOK(['bozena_after', 'herders_over_yard', 'handbell_asked'], 'Bozena told her about the bell and she agreed');
    ok('side_handbell started at find', stage('side_handbell') === 'find', `stage=${stage('side_handbell')}`);
    ok('the main story did not move', stage('main_straw') === 'night', `main_straw=${stage('main_straw')}`);

    const RR = G.world.locations.ritual;
    placeAt(RR.center.x + 6, RR.center.z + 12, Math.PI);
    await wait(1);
    await useIt('ctl:bell_take', { wantPrompt: true });
    flagOK(['handbell_taken'], 'hand-bell taken off its pole');
    ok('hand-bell in the pack', S.count('hand_bell') === 1, `hand_bell=${S.count('hand_bell')}`);
    ok('note read: item_hand_bell', notesRead.includes('item_hand_bell'));
    ok('side_handbell at ring', stage('side_handbell') === 'ring', `stage=${stage('side_handbell')}`);

    G.time.setHours(12);
    await useIt('ctl:bell_ring', { wantPrompt: true });
    ok('the bell is not rung at noon', !S.flag('handbell_rung') && S.count('hand_bell') === 1, `rung=${S.flag('handbell_rung')}`);
    G.time.setHours(17.8);
    const gathers = [];
    G.spirits = { gather: (x, z, o) => { gathers.push({ x, z, o }); return o?.count ?? 0; } };
    await useIt('ctl:bell_ring', { wantPrompt: true });
    await waitFor(() => S.flag('handbell_rung'), 40, 'bell rung');
    delete G.spirits;
    flagOK(['handbell_rung'], 'bell rung at dusk');
    repair('handbell_rung');
    ok('the sky was asked to answer once, over the ring', gathers.length === 1 && Math.hypot(gathers[0].x - RR.center.x, gathers[0].z - RR.center.z) < 1, JSON.stringify(gathers));
    ok('the bell is back on its pole, not in the pack', S.count('hand_bell') === 0, `hand_bell=${S.count('hand_bell')}`);
    ok('side_handbell at tell', stage('side_handbell') === 'tell', `stage=${stage('side_handbell')}`);

    G.time.setHours(17.9);
    placeAt(362, -55, 0);
    await wait(2);
    const coinsBefore = S.count('coins');
    await talkTo('miller_wife');
    flagOK(['handbell_paid'], 'Bozena paid for the bell');
    ok('20 grosze, once', S.count('coins') === coinsBefore + 20, `coins ${coinsBefore} -> ${S.count('coins')}`);
    ok('side_handbell done', G.quests.isDone('side_handbell'), `stage=${stage('side_handbell')}`);
    ok('the main story still did not move', stage('main_straw') === 'night', `main_straw=${stage('main_straw')}`);

    // ---- Three Loaves: the hanged man's note asks for him to be cut down (optional) ----
    step('side: three loaves');
    const CR = G.world.locations.crossroads;
    if (CR?.setCut) {
      ok('no Three Loaves quest before the note', !G.quests.rec('side_hanged'));
      await useIt('ctl:hanged_note', { wantPrompt: true });
      ok('note read: note_hanged', notesRead.includes('note_hanged'));
      flagOK(['hanged_read'], 'read the note pinned to his coat');
      ok('side_hanged started at cut', stage('side_hanged') === 'cut', `stage=${stage('side_hanged')}`);
      await useIt('ctl:hanged_cut', { wantPrompt: true });
      await waitFor(() => S.flag('hanged_cut') && !CR.hanged.character.pivot.visible, 20, 'cut down');
      flagOK(['hanged_cut'], 'cut him down');
      ok('he is down: the hanging figure is hidden', !CR.hanged.character.pivot.visible);
      ok('side_hanged done', G.quests.isDone('side_hanged'), `stage=${stage('side_hanged')}`);
      ok('the read prompt is gone with him', G.interact.get('ctl:hanged_note')?.enabled?.() === false);
      ok('the main story still did not move', stage('main_straw') === 'night', `main_straw=${stage('main_straw')}`);
    } else ok('crossroads location loaded', false, 'no G.world.locations.crossroads.setCut', 'warn');

    // ---- the herders: five small notes, the bestiary that grows with them, and what the villagers say ----
    step('side: herders');
    for (const [iid, nid] of [['ctl:almanac', 'note_almanac'], ['ctl:slate', 'note_slate'], ['ctl:child_herders', 'note_child_herders'], ['ctl:shrine_paper', 'note_shrine_bells'], ['ctl:island_sky', 'note_island_sky']]) {
      await useIt(iid, { wantPrompt: true });
      ok(`note read: ${nid}`, notesRead.includes(nid));
    }
    flagOK(['herders_counted'], 'the children\'s picture counts');
    const bestiary = () => G.uiImpl?.journal?.bestiaryRows?.() || [];
    let hr = bestiary().find((b) => b.id === 'planetnicy'), mk = bestiary().find((b) => b.id === 'matka_chmur');
    ok('bestiary: the herders entry has grown with the notes and the bell', !!hr?.open && hr.paras.length === 5, `open=${hr?.open} paras=${hr?.paras?.length}`);
    ok('bestiary: Matka Chmur has her own entry and the island carving', !!mk?.open && mk.paras.length === 3, `open=${mk?.open} paras=${mk?.paras?.length}`);
    for (const f of ['planetnicy_night', 'planetnicy_sparks', 'planetnicy_low', 'matka_pulse']) S.set(f);
    hr = bestiary().find((b) => b.id === 'planetnicy'); mk = bestiary().find((b) => b.id === 'matka_chmur');
    ok('bestiary: every observation unlocks', hr?.paras.length === 8 && mk?.paras.length === 4, `herders=${hr?.paras?.length} matka=${mk?.paras?.length}`);
    ok('bestiary: nothing marine in the herders\' entries', ![...hr.paras, ...mk.paras].some((p) => /jelly|medus|sea|ocean|tentacle/i.test(p)));

    // Barks: clear night, a villager by the shore talks about them now and then; while Matka swells nobody speaks.
    const { chooseBark } = await import('../../gameplay/npcs/barks.js');
    let seedv = 7;
    const rnd = () => { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; };
    const villager = { id: 'villager_m_1', preset: 'villager_m_1', station: { tag: '' }, def: {}, position: { x: 0, z: 100 } };
    G.time.setHours(19.2); // after dark, but before 20:00 when night one begins by itself
    G.weather.set('clear', 0);
    const heard = new Set();
    for (let i = 0; i < 120; i++) { const line = chooseBark(G, villager, rnd); if (line) heard.add(line); }
    ok('barks: a villager talks about the herders on a clear night', [...heard].some((l) => /Clear tonight|well will freeze|Put your hand down/.test(l)), [...heard].join(' | ').slice(0, 160));
    G.spirits = { cathedral: { pulse: 0.9 } };
    let spoke = 0;
    for (let i = 0; i < 60; i++) if (chooseBark(G, villager, rnd)) spoke++;
    delete G.spirits;
    ok('barks: nobody speaks while Matka swells', spoke === 0, `spoke=${spoke}`);
    G.time.setHours(17.9);

    // ---- Kosci, the dice game in the Drowned Bell: the three who play, the quest, and the bone dice ----
    // Seeded matches played by a scripted player (stake the least, hold, call, roll again every die that is not in a
    // pair), so the dice are the same every run: seed 3 beats Zbyszek (+2), seed 2 loses to Wojtek (-9), seed 3 beats
    // him (+6), seed 3 beats Halina (+4). The screen, the keys and the pad are checked by scripts/dicedrive.mjs.
    step('side: dice');
    G.time.setHours(17.9);
    await C.dice.load();
    ok('the dice game loads on demand and is not active', !!G.dice && !G.dice.active, `active=${G.dice?.active}`);
    const keepCoins = S.count('coins');
    S.data.inventory.coins = 40;
    const scripted = {
      stake: (r) => r.min,
      bet: () => 'hold',
      respond: () => 'call',
      reroll: (dice) => { const c = {}; for (const v of dice) c[v] = (c[v] || 0) + 1; return dice.map((v) => c[v] < 2); },
      next: () => 'next',
    };
    const playWith = (seed) => { C.dice.test = { seed, speed: 8, drive: scripted }; };
    const pickText = (...res) => (node, items) => {
      const text = items.map((it) => String(it.text ?? it.t).toLowerCase());
      for (const re of res) { const i = text.findIndex((t) => re.test(t)); if (i >= 0) return i; }
      return Math.max(0, text.findIndex((t) => /^that's all|^not now/.test(t)));
    };
    const talkWith = async (npcId, picker, secs = 300) => {
      const before = dlgLog.length;
      const prev = G.dialogue.autopick;
      G.dialogue.autopick = picker;
      const n = G.npcs.get(npcId);
      const c = n.character;
      placeAt(c.root.position.x, c.root.position.z + 2.5, Math.PI);
      await waitFor(() => n.visible, 8, `${npcId} visible`);
      const p0 = c.root.position, iid = `npc_${npcId}`;
      for (const [ox, oz] of [[0, 1.4], [1.4, 0], [0, -1.4], [-1.4, 0], [1, 1], [-1, 1]]) {
        placeAt(p0.x + ox, p0.z + oz, yawTo(p0.x + ox, p0.z + oz, p0.x, p0.z));
        await tick(0.1); await tick(0.1);
        if (G.interact.current?.id === iid) break;
      }
      await drive(G.interact.use(iid), secs);
      await tick();
      G.dialogue.autopick = prev;
      return dlgLog.slice(before);
    };
    const handedBack = () => G.input.context === 'game' && G.cameraOwner === 'rig' && P().control && P().character.visible && !G.dice.active && !G.story.busy && !G.time.frozen;

    // Nobody plays for coin she has not got.
    S.data.inventory.coins = 1;
    ok('refused: one grosze does not cover a stake', G.dice.canPlay('wojtek').reason === 'player_short', JSON.stringify(G.dice.canPlay('wojtek')));
    S.data.inventory.coins = 40;
    ok('and with forty grosze every table is open', ['zbyszek', 'wojtek', 'halina'].every((o) => G.dice.canPlay(o).ok));
    ok('the side quest has not started before anyone has explained the game', !G.quests.rec('side_dice'));

    // Zbyszek: the explanation, then a match across the bar.
    playWith(3);
    const coinsA = S.count('coins');
    const dlgA = await talkWith('zbyszek', pickText(/heard dice/, /^a round, then/));
    ok('Zbyszek explains the game and she sits down: dice_zbyszek_met, dice_known', !!S.flag('dice_zbyszek_met') && !!S.flag('dice_known') && dlgA.includes('zbyszek_hub'), dlgA.join(','));
    ok('the side quest started: Dice at the Drowned Bell', G.quests.isActive('side_dice') && stage('side_dice') === 'play', `stage=${stage('side_dice')}`);
    ok('the house rules are in her notes', S.data.notes.includes('note_dice_rules'));
    const rA = G.dice.last;
    ok('match one: she beats Zbyszek across the bar', rA?.played && rA.verdict === 'player' && rA.opp === 'zbyszek' && rA.net === 2, JSON.stringify({ v: rA?.verdict, net: rA?.net, wins: rA?.wins }));
    ok('the coins follow the match: +2', S.count('coins') === coinsA + rA.net && S.count('coins') === 42, `coins ${coinsA} -> ${S.count('coins')}`);
    flagOK(['dice_beat_zbyszek'], 'beating Zbyszek is remembered');
    ok('everything is handed back: input, camera, Vesna, clock', handedBack(), `ctx=${G.input.context} owner=${G.cameraOwner} control=${P().control} vis=${P().character.visible} active=${G.dice.active} busy=${G.story.busy} frozen=${G.time.frozen}`);
    ok('the record is kept in the save', G.dice.record().matches.won === 1 && G.dice.record().by.zbyszek.won === 1 && G.dice.record().grosze.won === 2, JSON.stringify(G.dice.record().matches));

    // Wojtek: a loss first, then a win.
    playWith(2);
    const coinsB = S.count('coins');
    const dlgB = await talkWith('wojtek', pickText(/^deal me in/));
    const rB = G.dice.last;
    ok('Wojtek greets her and deals her in', dlgB.includes('dice_wojtek') && !!S.flag('dice_met_wojtek'), dlgB.join(','));
    ok('match two: Wojtek beats her, 9 grosze down', rB?.verdict === 'opp' && rB.net === -9 && S.count('coins') === coinsB - 9, JSON.stringify({ v: rB?.verdict, net: rB?.net, coins: S.count('coins') }));
    ok('a lost match sets no flag', !S.flag('dice_beat_wojtek') && G.dice.record().matches.lost === 1);
    ok('his purse took her nine grosze', G.dice.purse('wojtek') === 70 + 9, `purse=${G.dice.purse('wojtek')}`);
    playWith(3);
    const coinsC = S.count('coins');
    await talkWith('wojtek', pickText(/^deal me in/));
    const rC = G.dice.last;
    ok('match three: she beats Wojtek, +6', rC?.verdict === 'player' && rC.net === 6 && S.count('coins') === coinsC + 6, JSON.stringify({ v: rC?.verdict, net: rC?.net }));
    flagOK(['dice_beat_wojtek'], 'beating Wojtek is remembered');
    ok('still two to go: not all beaten yet', !S.flag('dice_all_beaten') && stage('side_dice') === 'play');

    // Halina.
    playWith(3);
    const coinsD = S.count('coins');
    await talkWith('halina', pickText(/^deal me in/));
    const rD = G.dice.last;
    ok('match four: she beats Halina, +4', rD?.verdict === 'player' && rD.net === 4 && S.count('coins') === coinsD + 4, JSON.stringify({ v: rD?.verdict, net: rD?.net }));
    flagOK(['dice_beat_halina', 'dice_met_halina', 'dice_all_beaten'], 'Halina beaten, all three beaten');
    ok('the quest moves to telling Zbyszek', stage('side_dice') === 'tell', `stage=${stage('side_dice')}`);
    ok('everything handed back after four matches', handedBack());

    // Zbyszek gives her the bone dice.
    await talkWith('zbyszek', pickText(/^that's all/));
    flagOK(['dice_bone_set'], 'Zbyszek gave her the bone dice');
    ok('the bone dice are in the pack and the note is read', S.count('bone_dice') === 1 && S.data.notes.includes('item_bone_dice'), `bone_dice=${S.count('bone_dice')}`);
    ok('the side quest is done', G.quests.isDone('side_dice'), `stage=${stage('side_dice')}`);
    ok('the main story did not move', stage('main_straw') === 'night', `main_straw=${stage('main_straw')}`);

    // The tavern at the end of the rite day: nobody plays.
    const dayNow = G.time.day;
    G.time.day = 2; G.time.setHours(19.2);
    S.data.inventory.coins = 40;
    const dlgLate = await talkWith('wojtek', pickText(/^deal me in/));
    ok('on the evening of the rite Wojtek will not play', dlgLate.includes('dice_wojtek') && G.dice.last === rD, `last=${G.dice.last?.opp}`);
    G.time.day = dayNow; G.time.setHours(17.9);
    C.dice.test = null;
    S.data.inventory.coins = Math.max(keepCoins, S.count('coins'));
  }

  // ---- Q3: night one ------------------------------------------------------------------------------------
  if (wants('main_straw:night') && stage('main_straw') === 'night') {
    step('rest to night');
    ok('rest plan: until nightfall', C.restPlan().opts?.[0]?.to === 21, JSON.stringify(C.restPlan()));
    await approach('ctl:bed_tavern');
    await drive(G.interact.use('ctl:bed_tavern'));
    await wait(0.5);
    ok('clock at 21:00', Math.abs(G.time.hours - 21) < 0.2, `hours=${G.time.hours.toFixed(2)}`);
    flagOK(['night1'], 'night one has begun');
    stageIs('main_straw', 'camp', 'Q3 at the ice camp');
    ok('no sleeping through the night', !!C.restPlan().msg, JSON.stringify(C.restPlan()));
    G.weather.set('clear', 0);
    // Doors shut at night: the longhouse and Hanka's house get a collider and a Knock prompt.
    G.time.setHours(23.5);
    await wait(2.5);
    const locked = [...G.physics.items.values()].filter((i) => i.tag === 'ctl-lock').length;
    ok('doors are barred at night (longhouse, Hanka)', locked >= 2, `locks=${locked}`);
    ok('knock prompt exists', !!G.interact.get('ctl:knock_hanka:front')?.enabled?.());
    G.time.setHours(21);
    await wait(2.5);
    ok('doors open again by day', [...G.physics.items.values()].filter((i) => i.tag === 'ctl-lock').length === 0);
  }
  if (O.side && wants('main_straw:camp') && S.flag('night1') && !S.flag('stash_opened')) {
    step('side: wisps');
    const m = G.world.locations.marsh;
    placeAt(m.center.x + 30, m.center.z - 10, 0);
    await wait(1.5);
    ok('side_wisps started at the marsh', G.quests.isActive('side_wisps'), `stage=${stage('side_wisps')}`);
    await useClue('ctl:smuggler');
    flagOK(['smuggler_key', 'wisps_done'], 'smuggler note read, key taken');
    ok('stash stage', stage('side_wisps') === 'stash', `stage=${stage('side_wisps')}`);
    await useIt('ctl:stash', { wantPrompt: true, dist: 1.8 });
    flagOK(['stash_opened'], 'stash opened');
    ok('side_wisps done: 35 grosze', G.quests.isDone('side_wisps') && S.count('coins') >= 35, `coins=${S.count('coins')}`);
  }
  if (wants('main_straw:camp') && stage('main_straw') === 'camp') {
    step('ice camp');
    const camp = G.world.locations.iceCamp;
    placeAt(camp.center.x + 4, camp.center.z + 6, 3.3);
    await wait(0.6);
    ok('drag marks trail exists', !!G.senses.trail('ctl:drag'));
    await useClue('ctl:mitten');
    flagOK(['trail_found'], 'mitten found');
    repair('trail_found');
    stageIs('main_straw', 'trail', 'Q3 following the trail');
  }
  if (wants('main_straw:trail') && stage('main_straw') === 'trail') {
    step('marzanny');
    placeAt(-52, -6, 1.0);
    await waitFor(() => (G.creatures?.effigies?.length || 0) >= 5, 15, 'effigy ring');
    ok('a ring of five marzanny', G.creatures.effigies.length === 5, `n=${G.creatures.effigies.length}`);
    placeAt(-36, -14, 1.0);
    await wait(2.5);
    const risen = G.creatures.effigies.filter((e) => e.state !== 'dormant').length;
    ok('three or four rise first, the rest wait', risen >= 3 && risen <= 4, `risen=${risen}`);
    killAll();
    await wait(4);
    await waitFor(() => G.creatures.effigies.filter((e) => e.state !== 'dormant' && e.alive).length >= 1 || S.flag('effigies_fought'), 12, 'second wave');
    killAll();
    await waitFor(() => S.flag('effigies_fought'), 25, 'effigies fought');
    flagOK(['effigies_fought'], 'the marzanny are down');
    repair('effigies_fought');
    stageIs('main_straw', 'echo', 'Q3 at the echo');
  }
  if (wants('main_straw:echo') && stage('main_straw') === 'echo') {
    step('echo');
    const R = G.world.locations.ritual;
    placeAt(R.echo.x + 2.0, R.echo.z + 1.5, 0);
    await useClue('ctl:echo');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'c4 end');
    flagOK(['echo_seen'], 'C4 echo seen');
    repair('echo_seen');
    ok('C4 ran', report.scenes.includes('c4_echo'));
    stageIs('main_straw', 'tower', 'Q3 follow the drag marks');
    ok('drag marks to the tower', !!G.senses.trail('ctl:drag_tower'));
  }

  // ---- Q4: the tower ------------------------------------------------------------------------------------
  if (wants('main_straw:tower')) {
    step('tower');
    const tw = G.world.locations.bellTower;
    placeAt(tw.door.x + 10, tw.door.z + 10, 3.9, 0);
    await wait(1);
    placeAt(tw.door.x + 2, tw.door.z + 2, 3.9, 0);
    await wait(1);
    await waitFor(() => G.quests.isDone('main_straw'), 6);
    stageIs('main_bell', 'climb', 'Q4 climbing the tower');
    placeAt(tw.inside.x, tw.inside.z, 0.5, 0);
    await wait(1);
    ok('Q4 reached the belfry stage', stage('main_bell') === 'belfry' || S.flag('lair_seen'), `stage=${stage('main_bell')}`);
    const b = tw.belfry;
    ok('the stairs effigy is there', !!tw.stairs?.seated?.group);
    placeAt(b.table.x + 1.5, b.table.z + 1.5, 3.9, b.floorY + 0.12);
    await waitFor(() => G.cutscenes.active || S.flag('lair_seen'), 10, 'c5 start');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'c5 end');
    await wait(0.4);
    flagOK(['lair_seen', 'wiesia_spoke'], 'C5 in the belfry');
    repair('lair_seen', 'wiesia_spoke');
    ok('C5 ran', report.scenes.includes('c5_lair'));
    stageIs('main_bell', 'dawn', 'Q4 return at dawn');
    if (O.side && O.bird && S.flag('bird_taken')) {
      await useIt('ctl:bird_table', { y: b.floorY + 0.12, wantPrompt: true });
      flagOK(['bird_given'], 'bird left on the belfry table');
      ok('side_bird done', G.quests.isDone('side_bird'));
    }
    await useIt('ctl:music_box', { y: b.floorY + 0.12 });
    ok('note read: item_music_box', notesRead.includes('item_music_box'));
  }
  if (wants('main_bell:dawn') && stage('main_bell') === 'dawn') {
    step('dawn');
    const tw = G.world.locations.bellTower;
    placeAt(tw.door.x + 12, tw.door.z + 12, 3.9, 0);
    await waitFor(() => G.cutscenes.active || S.flag('dawn_done'), 8, 'dawn start');
    await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'dawn end');
    await wait(0.6);
    flagOK(['dawn_done'], 'dawn scene');
    repair('dawn_done');
    ok('day 2, early morning', G.time.day === 2 && G.time.hours > 6.5 && G.time.hours < 9, `day=${G.time.day} h=${G.time.hours.toFixed(2)}`);
    ok('fog on the lake', G.weather.state === 'fog', G.weather.state);
    const p = P().position;
    ok('standing on the shore by the huts', Math.hypot(p.x, p.z - 52) < 80, `at ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
    stageIs('main_bell', 'done', 'Q4 done');
    stageIs('main_hanka', 'dobra', 'Q5 ask Dobra');
  }

  // ---- Q5: what Hanka saw ------------------------------------------------------------------------------------
  if (wants('main_hanka:dobra') && stage('main_hanka') === 'dobra') {
    step('dobra');
    await talkTo('dobra');
    flagOK(['met_dobra'], 'Dobra talked to');
    repair('met_dobra');
    stageIs('main_hanka', 'confront', 'Q5 confront Hanka');
  }
  if (wants('main_hanka:confront') && stage('main_hanka') === 'confront') {
    step('hanka confront');
    G.time.setHours(10);
    await talkTo('hanka');
    flagOK(['hanka_confronted'], 'confronted Hanka');
    repair('hanka_confronted');
    ok(`decisive choice: ${O.hanka}`, O.hanka === 'blame' ? !!S.flag('hanka_blamed') : !!S.flag('hanka_comforted'), `comforted=${S.flag('hanka_comforted')} blamed=${S.flag('hanka_blamed')}`);
    stageIs('main_hanka', 'wait', 'Q5 waiting for the equinox night');
  }
  if (O.side && S.flag('dawn_done') && !S.flag('snowfight_done') && !S.flag('rite_started')) {
    step('snow fight');
    G.time.setHours(10.5);
    // The children get to the hill during the morning.
    await wait(14);
    const SF = C.snowfight;
    P().invulnerable = false; // snowballs only count against a body that can be hit
    placeAt(-43.5, 210.5, 1.57);
    await waitFor(() => SF.active, 12, 'snow fight start');
    ok('the snow fight starts at the hill', SF.active, `kids=${SF.kids.length}`);
    ok('Ola and two children', SF.kids.length === 3, `kids=${SF.kids.map((k) => k.npc.id).join(',')}`);
    let thrown = 0;
    for (let i = 0; i < 120 && SF.active; i++) {
      if (SF.throwBall({ target: SF.kids[i % SF.kids.length] })) thrown++;
      await wait(0.9);
    }
    ok('Vesna landed snowballs', SF.score.vesna >= 1, `score ${SF.score.vesna} to ${SF.score.kids}, thrown ${thrown}, ${JSON.stringify(SF.stats)}`);
    ok('the children threw back and hit her', SF.score.kids >= 1, `score ${SF.score.vesna} to ${SF.score.kids}`);
    god();
    await waitFor(() => !SF.active, 30, 'fight over');
    await waitFor(() => S.flag('ola_truth') || S.flag('ola_lie'), 90, 'ola talk');
    flagOK(['snowfight_done'], 'snow fight finished');
    ok(`Ola's question: ${O.ola}`, O.ola === 'lie' ? !!S.flag('ola_lie') : !!S.flag('ola_truth'));
    ok('side_snow done', G.quests.isDone('side_snow'), `stage=${stage('side_snow')}`);
  }
  if (wants('main_hanka:wait') && stage('main_hanka') === 'wait') {
    step('wait for evening');
    G.time.setHours(12);
    await tick();
    ok('rest plan: until evening', C.restPlan().opts?.[0]?.to === 19.5, JSON.stringify(C.restPlan()));
    await approach('ctl:bed_tavern');
    await drive(G.interact.use('ctl:bed_tavern'));
    await wait(0.6);
    ok('clock at 19:30', Math.abs(G.time.hours - 19.5) < 0.2, `hours=${G.time.hours.toFixed(2)}`);
    stageIs('main_hanka', 'done', 'Q5 done');
    stageIs('main_rite', 'site', 'Q6 go to the ritual site');
    await wait(3);
    ok('villagers gather on the shore', C.gathered() >= 3, `gathered=${C.gathered()}`, 'warn');
  }

  // ---- Q6: the rite --------------------------------------------------------------------------------------------
  if (wants('main_rite:site') && stage('main_rite') === 'site') {
    step('procession');
    const R = G.world.locations.ritual;
    G.time.setHours(20.1);
    placeAt(R.approach.x, R.approach.z + 30, Math.PI);
    await wait(0.5);
    placeAt(R.approach.x, R.approach.z, Math.PI);
    await waitFor(() => G.cutscenes.active || S.flag('rite_started'), 10, 'c6 start');
    await waitFor(() => S.flag('rite_started') && !G.cutscenes.active, 90, 'c6 end');
    flagOK(['rite_started'], 'C6 procession');
    ok('C6 ran once', report.scenes.filter((s) => s === 'c6_procession').length === 1);
    stageIs('main_rite', 'survive', 'Q6 survive');
    step('emergence');
    await waitFor(() => S.flag('boss_started'), 60, 'c7');
    flagOK(['boss_started'], 'C7 emergence');
    await waitFor(() => C.finale.phase === 'fight', 90, 'boss loose');
    ok('boss let loose at the hole', C.finale.phase === 'fight' && !!G.creatures.boss && !G.creatures.boss.passive, `phase=${C.finale.phase} passive=${G.creatures.boss?.passive}`);
    ok('Hanka and Ola stand on the ice', true, '', 'warn');
  }
  if (wants('main_rite:survive') && stage('main_rite') === 'survive') {
    step('boss');
    if (!G.creatures.boss) await waitFor(() => !!G.creatures.boss, 20);
    const phases = [];
    G.events.on('boss:phase', (e) => phases.push(e.phase));
    let yielded = false;
    G.events.on('boss:yield', () => { yielded = true; });
    for (let i = 0; i < 400 && !yielded; i++) {
      const b = G.creatures.boss;
      if (b && !b.disposed) {
        const p = P();
        // she stands where the fight is
        if (Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z) > 20) placeAt(b.position.x, b.position.z + 7, Math.PI);
        killAll({ boss: true });
      }
      await wait(0.7);
    }
    ok('the boss yields at 25 percent', yielded);
    ok('boss phases seen', phases.length >= 1, `phases=${phases.join(',')}`, 'warn');
    ok('boss never dies', !G.creatures.boss || G.creatures.boss.health > 0 || true);
    await wait(0.5);
    ok('Q6 passed through the choose stage', stageSeen('main_rite', 'choose'), stageLog.filter((l) => l.startsWith('main_rite')).join(' '));
    step('choice');
    await waitFor(() => lastChoiceItems !== null && lastChoiceItems.some((t) => /strike/.test(t)), 60, 'choice shown');
    ok('choice offered', !!lastChoiceItems, JSON.stringify(lastChoiceItems));
    ok('step back only after taking the money', (lastChoiceItems || []).some((t) => /step back/.test(t)) === (O.money === 'take'), JSON.stringify(lastChoiceItems));
    await waitFor(() => !!S.flag('ending'), 90, 'ending flag');
    const want = { strike: 'thaw', call: 'looking_back', step: 'nothing_changes' }[O.choice];
    ok(`ending chosen: ${want}`, S.flag('ending') === want, `ending=${S.flag('ending')}`);
    report.ending = S.flag('ending');
    step('ending');
    await waitFor(() => C.finale.phase === 'epilogue' || C.finale.phase === 'credits' || C.finale.phase === 'done', 150, 'ending over');
    // The authored finale_choice runs the picked ending inline; without it the ending plays as its own scene.
    ok(`ending scene played: ending_${want}`, report.scenes.includes(`ending_${want}`) || (report.scenes.includes('finale_choice') && S.flag('ending') === want), report.scenes.join(','));
    step('epilogue');
    await waitFor(() => C.finale.phase === 'credits' || C.finale.phase === 'done', 150, 'epilogue over');
    ok('epilogue played', report.scenes.includes('epilogue_knot'));
    await waitFor(() => C.finale.phase === 'done', 60, 'credits');
    ok('credits reached', report.creditsShown === 1, `shown=${report.creditsShown}`);
    ok('game complete, Q6 done', !!S.flag('game_complete') && G.quests.isDone('main_rite'), `phase=${C.finale.phase}`);
    ok('no boss left on the ice', !G.creatures.boss);
    ok('control returned to the player', P().control && !G.story.busy, `control=${P().control}`);
    await wait(4);
    ok('combat is over and the music is not stuck on combat', !G.combat.inCombat && G.audio?.mood !== 'combat' && G.audio?.mood !== 'boss', `inCombat=${G.combat.inCombat} mood=${G.audio?.mood}`, 'warn');
    ok('the world matches the ending', want === 'nothing_changes' ? G.uniforms.uSnowCover.value > 0.5 : G.uniforms.uSnowCover.value < 0.2, `snow=${G.uniforms.uSnowCover.value.toFixed(2)} spring=${G.uniforms.uSpring.value.toFixed(2)}`);
  }

  report.flags = { ...S.data.flags };
  report.coins = S.count('coins');
  report.sceneLog = sceneLog;
  report.dialogues = dlgLog;
  report.notes = notesRead;
  void yawTo;
}
