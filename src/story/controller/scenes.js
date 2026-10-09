// Scenes for the controller: C.scene(id) plays a cutscene and C.talk(id) a dialogue, with a
// placeholder (stubs.js) when the real file is not there yet, and a set of end-state guarantees
// so a scene that was skipped, cut short or is still a stub always leaves the world in the state
// the quests expect (flags, clock, weather, where Vesna stands).
//
//   await C.scene('c4_echo')               -> { skipped, picks } | null
//   await C.talk('hanka_first', opts)      -> { end, picks } | null
//   C.ensureGain(item, before, n)          top an item up to `before + n` if the scene did not give it
import { DIALOGUE_STUBS, makeCutsceneStubs } from './stubs.js';

export function install(C) {
  const { G } = C;
  const stubs = makeCutsceneStubs(C);
  const warned = new Set();
  const warn = (kind, id) => {
    if (warned.has(`${kind}:${id}`)) return;
    warned.add(`${kind}:${id}`);
    console.warn(`[story controller] ${kind} "${id}" is not in src/story/content yet: running a placeholder`);
  };

  // What must be true after each scene, whether it played, was skipped or is a stub.
  const END = {
    c2_valley() {
      C.set('prologue_done');
      if (G.weather?.state !== 'clear') G.weather?.set?.('clear', 0);
      if (C.hour() < 15.4 || C.hour() > 16.5) G.time?.setHours?.(15.67);
    },
    c3_song() {
      C.set('song_heard');
      C.set('met_ola');
      if (C.hour() < 16 || C.hour() > 17.4) G.time?.setHours?.(16.5);
    },
    c4_echo() { C.set('echo_seen'); if (G.postfx && G.postfx.echo > 0) G.postfx.echo = 0; },
    c5_lair() { C.set('lair_seen'); C.set('wiesia_spoke'); },
    dawn() {
      // Day 2, 7:30, fog, Vesna on the shore by the huts.
      if (C.day() < 2) G.time.day = 2;
      if (C.hour() < 6.5 || C.hour() > 9) G.time.setHours(7.5);
      if (G.weather?.state !== 'fog') G.weather?.set?.('fog', 0);
      const w = C.V.boardwalk?.[24];
      const wx = w ? w.x : 0, wz = w ? w.z + 1 : 51.5;
      const p = C.ppos();
      // Anywhere near the shore will do; a scene that left her at the tower gets moved.
      if (Math.hypot(p.x - wx, p.z - wz) > 70) C.place(wx, wz, 0);
      C.set('dawn_done');
    },
    c6_procession() {
      C.set('rite_started');
      C.L.ritual?.hole?.open?.();
      if (C.hour() < 20) G.time?.setHours?.(20.1);
      if (G.weather?.state !== 'blizzard' && G.weather?.state !== 'snow') G.weather?.set?.('blizzard', 0);
    },
    c7_emergence() { C.set('boss_started'); },
    ending_thaw() { if (C.flag('ending') !== 'thaw') C.set('ending', 'thaw'); },
    ending_looking_back() { if (C.flag('ending') !== 'looking_back') C.set('ending', 'looking_back'); },
    ending_nothing_changes() { if (C.flag('ending') !== 'nothing_changes') C.set('ending', 'nothing_changes'); },
    epilogue_knot() { /* the credits follow; nothing to guarantee */ },
  };

  C.scene = async (id, opts = {}) => {
    const key = `scene:${id}`;
    if (C.running.has(key)) return null;
    C.running.add(key);
    let res = null;
    try {
      // Scenes stage Vesna on foot.
      if (G.player?.mounted) G.player.dismountInstant?.();
      if (G.cutscenes.has(id)) res = await G.cutscenes.play(id, opts.play);
      else if (stubs[id]) {
        warn('cutscene', id);
        res = await G.cutscenes.play(stubs[id], opts.play);
      } else console.warn(`[story controller] cutscene "${id}" not found and no placeholder`);
      try { END[id]?.(res); } catch (e) { console.error(`[story controller] end state ${id}`, e); G.errors.push(`ctl end ${id}: ${e.message}`); }
      try { opts.ensure?.(res); } catch (e) { console.error(`[story controller] ensure ${id}`, e); G.errors.push(`ctl ensure ${id}: ${e.message}`); }
    } finally {
      C.running.delete(key);
    }
    return res;
  };

  C.talk = async (id, opts = {}) => {
    const key = `talk:${typeof id === 'string' ? id : id.id}`;
    if (C.running.has(key)) return null;
    C.running.add(key);
    try {
      if (typeof id !== 'string') return await G.dialogue.start(id, opts);
      if (G.dialogue.has(id)) return await G.dialogue.start(id, opts);
      const def = DIALOGUE_STUBS[id];
      if (!def) { console.warn(`[story controller] dialogue "${id}" not found and no placeholder`); return null; }
      warn('dialogue', id);
      return await G.dialogue.start(def, opts);
    } finally {
      C.running.delete(key);
    }
  };

  C.ensureGain = (item, before, n) => {
    const got = C.count(item) - before;
    if (got < n) C.G.state.give(item, n - got);
  };
}
