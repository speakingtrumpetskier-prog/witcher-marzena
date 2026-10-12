// Story controller context (C): the small toolbox every controller module shares. It wraps the
// pieces the controller keeps reaching for (flags, zones, interactions, clues, notes, waits,
// barks) so each module reads like a script, and it tracks what it registered so a reset or a
// debug run can take it all down again.
//
//   C.G, C.S                     the game context and G.state
//   C.L, C.V                     G.world.locations and the village anchors (live getters)
//   C.has(k) C.flag(k) C.set(k)  flags (has is boolean)         C.stage(q)  quest stage or null
//   C.day() C.hour()             clock                          C.ppos()    player position
//   C.dist(x, z)                 flat distance from the player  C.near(x, z, r)
//   C.zone(def) C.interact(def) C.clue(def) C.trail(def)        registered through G.story / G.interact / G.senses
//   C.sleep(s) C.later(s, fn)    story clock waits (skippable, scaled by the story speed)
//   C.say(text, secs, who)       subtitle line (Vesna by default)     C.notify(text, kind)
//   C.read(noteId, opts)         open a readable note, mark it read, set opts.flag
//   C.pickup(item, label, n)     give an item with the usual feedback
//   C.restore(fn)                run fn now and again after every load or reset (re-place props that state changed)
//   C.watch(key, fn)             call fn(value) when a flag changes
//   C.scene(id, opts) C.talk(id, opts)   cutscene / dialogue with a placeholder when the content file is missing (scenes.js)
//   C.running                    Set of scene ids in flight (guards against double starts)
import * as THREE from 'three';

export function createContext(G) {
  const S = G.state;
  const C = {
    G, S, THREE,
    verbose: G.params.has('ctlog'),
    running: new Set(),
    restorers: [],
    zones: [],
    interacts: [],
    clues: [],
    trails: [],
    offs: [],
  };

  Object.defineProperty(C, 'L', { get: () => G.world?.locations || {} });
  Object.defineProperty(C, 'V', { get: () => G.world?.locations?.village || {} });
  Object.defineProperty(C, 'Q', { get: () => G.quests });

  C.log = (...a) => { if (C.verbose) console.log('[ctl]', ...a); };
  C.has = (k) => !!S.flag(k);
  C.flag = (k) => S.flag(k);
  C.set = (k, v = true) => S.set(k, v);
  C.stage = (q) => G.quests?.stage(q) ?? null;
  C.active = (q) => !!G.quests?.isActive(q);
  C.day = () => G.time?.day ?? 1;
  C.hour = () => G.time?.hours ?? 12;
  C.count = (item) => S.count(item);
  C.ppos = () => G.player?.position || G.camera.position;
  C.dist = (x, z) => { const p = C.ppos(); return Math.hypot(p.x - x, p.z - z); };
  C.near = (x, z, r) => C.dist(x, z) < r;
  C.ground = (x, z) => G.world?.heightAt?.(x, z) ?? 0;
  C.v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  C.at = (x, z, dy = 0) => new THREE.Vector3(x, C.ground(x, z) + dy, z);
  C.busy = () => !!G.story?.busy;
  C.ui = () => (G.ui && !G.ui.stub ? G.ui : G.story?.ui);

  // ---- waits --------------------------------------------------------------------------------
  C.sleep = (s) => G.story.sched.wait(s);
  C.later = (s, fn) => {
    C.sleep(s).then(fn).catch((e) => { console.error('[ctl later]', e); G.errors.push(`ctl later: ${e.message}`); });
  };
  // Resolves on the next frame in which `action` was pressed (input actions: interact, attack, ...).
  C.press = (action) => new Promise((resolve) => {
    const off = G.addSystem(`ctl-press-${action}`, () => { if (!G.input || G.input.pressed(action)) { off(); resolve(); } }, 5);
  });
  // Poll a condition on the story clock; resolves true, or false after `timeout` seconds.
  C.until = async (pred, timeout = 30, step = 0.25) => {
    let t = 0;
    while (t < timeout) {
      let ok = false;
      try { ok = !!pred(); } catch { ok = false; }
      if (ok) return true;
      await C.sleep(step);
      t += step;
    }
    return false;
  };

  // ---- registration -------------------------------------------------------------------------
  C.zone = (def) => {
    const id = G.story.zone({ r: 6, ...def, id: def.id ? `ctl:${def.id}` : undefined });
    C.zones.push(id);
    return id;
  };
  // Things she uses happen on foot: a rider is put down first.
  C.foot = () => { if (G.player?.mounted) G.player.dismountInstant?.(); };
  C.interact = (def) => {
    if (!G.interact) return null;
    const onUse = def.onUse;
    const id = G.interact.add({ facing: true, ...def, id: `ctl:${def.id}`, onUse: onUse && ((it) => { C.foot(); return onUse(it); }) });
    C.interacts.push(id);
    return id;
  };
  C.clue = (def) => {
    if (!G.senses) return null;
    const onExamine = def.onExamine;
    const id = G.senses.addClue({ ...def, id: `ctl:${def.id}`, onExamine: onExamine && ((cl) => { C.foot(); return onExamine(cl); }) });
    C.clues.push(id);
    return id;
  };
  C.trail = (def) => {
    if (!G.senses) return null;
    const id = G.senses.addTrail({ ...def, id: `ctl:${def.id}` });
    C.trails.push(id);
    return id;
  };
  C.watch = (key, fn) => {
    const off = G.events.on('flag', (p) => { if (p.key === key) fn(p.value, p.old); });
    C.offs.push(off);
    return off;
  };
  C.on = (ev, fn) => {
    const off = G.events.on(ev, fn);
    C.offs.push(off);
    return off;
  };
  C.restore = (fn) => {
    C.restorers.push(fn);
    try { fn(); } catch (e) { console.error('[ctl restore]', e); G.errors.push(`ctl restore: ${e.message}`); }
  };
  C.runRestorers = () => {
    for (const fn of C.restorers) {
      try { fn(); } catch (e) { console.error('[ctl restore]', e); G.errors.push(`ctl restore: ${e.message}`); }
    }
  };

  // ---- feedback -----------------------------------------------------------------------------
  C.notify = (text, kind = 'info') => C.ui()?.notify?.(text, kind);
  C.say = (text, secs, who = 'Vesna') => {
    const t = secs ?? Math.max(2, String(text).length / 14 + 0.6);
    return C.ui()?.subtitle?.(who, text, t);
  };
  C.hint = (items, secs = 8) => G.ui?.hint?.(items, secs);
  // A hint for play, not for a cutscene: waits for free play with the hint card empty, after the
  // first-use Move card has had its turn (falling back to plain free play after 40 s), then shows it
  // if `when` still holds.
  C.hintFree = (items, secs = 8, when = null) => {
    const free = () => !C.busy() && G.cameraOwner === 'rig' && (!G.hints || G.hints._live());
    const clear = () => free() && (!G.hints || (!G.hints.slot.left && (G.hints.seen('move') || G.hints.walked >= 2)));
    (async () => {
      if (!(await C.until(clear, 40, 0.5)) && !(await C.until(free, 60, 0.5))) return;
      if (!when || when()) C.hint(items, secs);
    })().catch(() => {});
  };
  C.sfx = (name, o) => { try { G.audio?.sfx?.(name, o); } catch { /* audio is optional */ } };
  C.bark = (npcId, text) => {
    const n = G.npcs?.get?.(npcId);
    if (n && text) n.bark(text);
  };

  // Notes: opens the parchment and waits for it to close; the NoteView marks the note read.
  C.read = async (id, { flag, silent } = {}) => {
    const ui = G.ui;
    if (ui?.readNote) await ui.readNote(id);
    else if (!silent) C.say(String(id));
    S.readNote?.(id);
    if (flag) C.set(flag);
  };

  C.pickup = (item, label, n = 1) => {
    S.give(item, n);
    C.sfx('item_pickup', { volume: 0.7 });
    if (label) C.notify(label, 'item');
  };

  // The player teleport that every scripted jump uses (dismounts, resets locomotion).
  C.place = (x, z, yaw) => {
    if (G.story?.place) G.story.place(x, z, yaw);
    else G.player?.teleport?.(x, z, yaw);
  };

  // An Object3D (or Character) to light up in the senses pass, when the anchor carries one.
  C.obj = (o) => (o?.root || o?.object || (o?.isObject3D ? o : null)) || null;

  // Yaw that looks from (ax, az) toward (bx, bz).
  C.yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

  return C;
}
