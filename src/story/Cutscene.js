// Cutscene director (G.cutscenes). Scripts: src/story/content/cutscenes/<id>.js exporting
// `default async function (d) {}` (see content/cutscenes/_sample.js and ARCHITECTURE.md).
//
//   const { skipped, picks } = await G.cutscenes.play('c2_valley', { skippable: true, actors: { id: character } })
//   G.cutscenes.active  G.cutscenes.id  G.cutscenes.has(id)  G.cutscenes.ids()
//   G.cutscenes.register(id, fn)   inline scripts (tests, generated scenes)
//   G.cutscenes.skip()             same as holding Space for 0.8 s
//
// Director `d` (every method is safe to call while skipping):
//   d.setup({ time, day, weather, music, letterbox = true })
//   d.actor(id, { preset, at: [x, z], yaw, persist })  d.player()  d.horse()
//   d.place(actor, x, z, yaw)   d.face(actor, target, { instant })   d.lookAt(actor, target)
//   d.shot({ from | pos, to, via, look, lookTo, fov, fovTo, frame, frameTo, roll, dur, ease, shake })
//   d.cut({ pos, look, fov, frame })   d.follow(actor, offset, look, dur, opts)
//   d.orbit(center, radius, height, fromAngle, toAngle, dur, opts)
//   d.say(speaker, text, dur?)  d.sub(text, dur, { italic, voice })  d.wait(s)  d.fade(to, s)
//     (voiced lines: when voice/manifest.json has a clip for the speaker's text, the subtitle lasts as long as the
//      audio plus a tail, at least `dur`; d.sub voices a line only when given { voice: 'speaker_id' }; see src/audio/voice.js)
//   d.letterbox(on)  d.titleCard(title, sub, dur = 5)  d.music(mood)  d.stinger(name)
//   d.sfx(name, pos, opts)  d.weather(state, s)  d.time(h, { day })
//   d.anim(actor, clip, opts) -> Promise (one-shots)  d.walk(actor, x, z, opts) -> Promise
//   d.choice(options, { timer, default, decisive }) -> index   (skipping stops here)
//   d.tween(obj, prop, to, s, ease)  d.uniform(name, to, s, ease)  d.postfx(prop, to, s, ease)
//   d.atmosphere(override | null)    d.parallel(...promises)   d.skipping (bool)
//   d.end({ player: { x, z, yaw }, fadeIn = 1 })
// Helpers: d.ground(x, z, h) d.rel(actor, [right, up, forward]) d.head(actor) d.at(actor, frac)
//   d.two(a, b, { wide }) d.ots(subject, over) d.close(subject, toward) d.single(subject, toward)
//   d.ghost(actor, on, { color, opacity }) d.hide(actor) d.show(actor) d.dialogue(id, opts)
//   d.flag(key, value) d.give(item, n) d.quest(id, stage) d.G d.S
//
// Skipping: hold Space. Timed awaits resolve at once, camera moves jump to their end, walks
// teleport, fades and subtitles are suppressed, so the script runs to its end state (flags,
// time, weather, positions) behind a black frame. A choice() stops the skip.
import * as THREE from 'three';
import { Actor, ActorStage, displayName } from './director/Actors.js';
import { Coverage } from './director/Coverage.js';
import { VOICE_TAIL } from '../audio/voice.js';

const CONTENT = import.meta.glob('./content/cutscenes/*.js');
const HOLD_TO_SKIP = 0.8;

export class Cutscenes {
  constructor(G, story) {
    this.G = G;
    this.story = story;
    this.active = false;
    this.id = null;
    this.stage = null;
    this.skipping = false;
    this.inline = new Map();
    this._queue = Promise.resolve();
    this._hold = 0;
    this._choiceOpen = false;
    this._d = null;
  }

  ids() { return [...this.inline.keys(), ...Object.keys(CONTENT).map((p) => p.replace(/^.*\/(.+)\.js$/, '$1'))]; }
  has(id) { return this.inline.has(id) || !!CONTENT[`./content/cutscenes/${id}.js`]; }
  register(id, fn) { this.inline.set(id, fn); }

  async load(id) {
    if (typeof id === 'function') return id;
    if (this.inline.has(id)) return this.inline.get(id);
    const loader = CONTENT[`./content/cutscenes/${id}.js`];
    if (!loader) return null;
    const mod = await loader();
    return mod.default || mod.cutscene || null;
  }

  play(id, opts = {}) {
    const p = this._queue.then(() => this._play(id, opts));
    this._queue = p.catch(() => {});
    return p;
  }

  skip() {
    if (!this.active || this.skipping || this._choiceOpen || this._d?.opts.skippable === false) return;
    const { sched, cam, ui } = this.story;
    this.skipping = true;
    this._d._skipped = true;
    ui.skipRing(null);
    ui.fade(1, 0.25);
    ui.clearSubtitle();
    this.G.voice?.stopAll?.(0.1);
    ui.hideTitleCard?.();
    sched.instant = true;
    for (const w of this._d._walks) {
      try { w.actor.c.stop?.(0.1); } catch { /* optional */ }
      w.actor.setPosition(w.x, w.z);
      w.done();
    }
    this._d._walks.length = 0;
    this._d._skipSignal.resolve();
    cam.finish();
    sched.flush();
  }

  _stopSkip() {
    if (!this.skipping) return;
    this.skipping = false;
    this.story.sched.instant = false;
    this._d._skipSignal = deferred();
    this.story.ui.fade(0, 0.5);
  }

  update(dt) {
    if (!this.active) return;
    const keys = this.G.input?.keys;
    const held = !!keys && keys.has('Space') && !this._choiceOpen && this._d?.opts.skippable !== false && !this.skipping;
    if (held) {
      this._hold += dt;
      if (this._hold > 0.12) this.story.ui.skipRing((this._hold - 0.12) / (HOLD_TO_SKIP - 0.12));
      if (this._hold >= HOLD_TO_SKIP) this.skip();
    } else if (this._hold > 0) {
      this._hold = 0;
      this.story.ui.skipRing(null);
    }
  }

  async _play(id, opts) {
    const G = this.G;
    const fn = await this.load(id);
    if (!fn) {
      console.warn(`[cutscene] "${id}" not found`);
      return null;
    }
    const { ui, cam, sched } = this.story;
    const name = typeof id === 'string' ? id : fn.name || 'inline';
    const saved = {
      scale: G.time?.scale, auto: G.weather?.auto, context: G.input?.context,
    };
    this.active = true;
    this.id = name;
    this.stage = new ActorStage(G);
    // Characters the caller already has on stage (not disposed at the end).
    for (const [aid, c] of Object.entries(opts.actors || {})) if (c) this.stage.get(aid, { character: c });
    this.skipping = false;
    sched.instant = false;
    const d = this._director(name, opts);
    this._d = d;
    G.events.emit('cutscene:start', { id: name });

    G.player?.setControl?.(false);
    if (G.input) G.input.context = 'cutscene';
    if (G.time && !G.shot) G.time.scale = 0;
    if (G.weather && 'auto' in G.weather) G.weather.auto = false;
    ui.prompt(null);
    ui.hud(false);
    cam.take();
    ui.letterbox(opts.letterbox !== false);

    try {
      await fn(d);
    } catch (e) {
      console.error(`[cutscene ${name}]`, e);
      G.errors?.push?.(`cutscene ${name}: ${e.message}`);
    }

    // End state.
    const endOpts = d._end || {};
    const wasSkipped = d._skipped;
    sched.instant = false;
    this.skipping = false;
    ui.skipRing(null);
    ui.clearSubtitle();
    ui.hideTitleCard?.();
    const playerActor = this.stage.has('vesna') ? this.stage.get('vesna') : null;
    for (const a of this.stage.list()) { a.talk(false); a.lookAt(null); }
    if (endOpts.player && G.player?.teleport) G.player.teleport(endOpts.player.x, endOpts.player.z, endOpts.player.yaw ?? G.player.yaw);
    else if (playerActor?.isPlayer) this.story.syncPlayer(playerActor);
    this.stage.releaseAll();
    this.stage = null;
    if (G.atmosphere && d._atmo) G.atmosphere.override = null;
    cam.release(endOpts.camera || null);
    ui.letterbox(false);
    ui.hud(true);
    if (G.time && saved.scale != null && !G.shot) G.time.scale = saved.scale;
    if (G.weather && saved.auto != null) G.weather.auto = endOpts.weatherAuto ?? saved.auto;
    G.player?.setControl?.(true);
    if (G.input) G.input.context = saved.context === 'cutscene' ? 'game' : saved.context || 'game';
    this.active = false;
    this.id = null;
    this._d = null;
    if (wasSkipped || ui.fadeLevel > 0) {
      if (endOpts.fadeIn !== false) ui.fade(0, typeof endOpts.fadeIn === 'number' ? endOpts.fadeIn : 1.0);
    }
    G.events.emit('cutscene:end', { id: name, skipped: wasSkipped });
    return { skipped: wasSkipped, picks: d._picks };
  }

  _director(name, opts) {
    const G = this.G;
    const self = this;
    const { ui, cam, sched } = this.story;
    const stage = () => self.stage;
    const actorOf = (a) => (a instanceof Actor ? a : typeof a === 'string' ? stage().get(a, { spawn: false }) : null);
    // Promise that resolves on a timer, or at once when a skip starts.
    const skippable = (p) => (sched.instant ? Promise.resolve() : Promise.race([p, d._skipSignal.promise]));
    const cover = (a, b) => new Coverage(G, ui).setup(a, b);

    const d = {
      G, S: G.state, id: name, opts,
      _picks: [], _walks: [], _skipped: false, _end: null, _atmo: false, _skipSignal: deferred(),
      get skipping() { return self.skipping; },

      setup({ time, day, weather, music, letterbox = true, hud = false } = {}) {
        if (day != null && G.time) G.time.day = day;
        if (time != null) G.time?.setHours?.(time);
        if (weather) G.weather?.set?.(weather, 0);
        if (music) G.audio?.setMood?.(music, { fade: 2 });
        ui.letterbox(letterbox);
        ui.hud(hud);
      },

      actor(id, o = {}) { return stage().get(id, o); },
      player() { return stage().get('vesna', { preset: 'vesna' }); },
      horse() { return stage().get('kasza', { preset: 'kasza' }); },
      place(actor, x, z, yaw) { actorOf(actor)?.setPosition(x, z, yaw); },
      face(actor, target, o) { actorOf(actor)?.face(actorOf(target) || target, { instant: sched.instant, ...o }); },
      lookAt(actor, target) { actorOf(actor)?.lookAt(actorOf(target) || target); },

      shot(o = {}) {
        const spec = { ...o };
        if (spec.pos && !spec.from) spec.from = spec.pos;
        return cam.shot(spec);
      },
      cut(o = {}) { cam.cut(o); },
      follow(actor, offset, look, dur, o) { return skippable(cam.follow(actorOf(actor), offset, look, dur, o)); },
      orbit(center, radius, height, a0, a1, dur, o) { return cam.orbit(actorOf(center) || center, radius, height, a0, a1, dur, o); },

      say(speaker, text, dur, o = {}) {
        const a = actorOf(speaker);
        const sid = a ? a.id : speaker;
        const len = dur ?? Math.max(1.6, String(text).length / 14 + 0.35);
        if (sched.instant) return Promise.resolve();
        const italic = o.italic ?? (sid === 'wiesia' || sid === 'wiesia_ghost');
        const vid = sid === 'player' ? 'vesna' : sid;
        const show = (vl) => {
          if (sched.instant) return Promise.resolve(); // a skip began while the clip loaded
          const t = vl ? Math.max(vl.dur + VOICE_TAIL, dur ?? 0) : len;
          const tok = ui.subtitle(o.name ?? displayName(G, vid), text, Infinity, { italic });
          a?.talk(true);
          if (vl) vl.play({ character: a?.c }); else G.audio?.duck?.(0.35, len);
          if (o.anim) a?.play(o.anim);
          return sched.wait(t).then(() => { a?.talk(false); vl?.stop(0.1); ui.clearSubtitle(tok); });
        };
        // A voiced line waits for its clip (usually already cached); an unvoiced one runs as it always did.
        return G.voice?.canVoice?.(vid, text) && !self.skipping ? G.voice.prepare(vid, text).then(show) : show(null);
      },
      sub(text, dur, o = {}) {
        const len = dur ?? Math.max(1.6, String(text).length / 14 + 0.35);
        if (sched.instant) return Promise.resolve();
        const show = (vl) => {
          if (sched.instant) return Promise.resolve();
          const t = vl ? Math.max(vl.dur + VOICE_TAIL, dur ?? 0) : len;
          const tok = ui.subtitle(o.name || '', text, Infinity, { italic: !!o.italic });
          if (vl) vl.play({});
          return sched.wait(t).then(() => { vl?.stop(0.1); ui.clearSubtitle(tok); });
        };
        // d.sub is narration unless the script names who speaks: d.sub('Did Mama send you?', 3, { voice: 'wiesia' }).
        return o.voice && G.voice?.canVoice?.(o.voice, text) && !self.skipping ? G.voice.prepare(o.voice, text).then(show) : show(null);
      },
      wait(s) { return sched.wait(s); },
      fade(to, s = 1) {
        if (sched.instant) { d._fadeTarget = to; return Promise.resolve(); }
        return skippable(ui.fade(to, s));
      },
      letterbox(on) { ui.letterbox(on); },
      titleCard(title, sub, dur = 5) {
        if (sched.instant) return Promise.resolve();
        ui.titleCard(title, sub, dur);
        return sched.wait(dur);
      },
      music(mood, o = {}) { G.audio?.setMood?.(mood, { fade: sched.instant ? 0.5 : 2.5, ...o }); },
      stinger(n) { if (!sched.instant) G.audio?.stinger?.(n); },
      sfx(n, pos, o = {}) {
        if (sched.instant) return;
        const p = pos ? cam.point(actorOf(pos) || pos, new THREE.Vector3()) : undefined;
        G.audio?.sfx?.(n, { pos: p, ...o });
      },
      weather(state, s = 30) {
        G.weather?.set?.(state, sched.instant ? 0 : s);
        return sched.wait(s);
      },
      time(h, o = {}) {
        if (o.day != null && G.time) G.time.day = o.day;
        G.time?.setHours?.(h);
      },
      anim(actor, clip, o) {
        const a = actorOf(actor);
        if (!a) return Promise.resolve();
        return skippable(a.play(clip, o));
      },
      walk(actor, x, z, o = {}) {
        const a = actorOf(actor);
        if (!a) return Promise.resolve();
        const last = Array.isArray(x) ? x[x.length - 1] : { x, z };
        const tx = last.x ?? last[0], tz = last.z ?? last[1];
        if (sched.instant) {
          const p = a.pos(new THREE.Vector3());
          if (Math.hypot(tx - p.x, tz - p.z) > 0.05) a.face(new THREE.Vector3(tx, 0, tz), { instant: true });
          a.setPosition(tx, tz);
          return Promise.resolve();
        }
        let done;
        const finished = new Promise((r) => { done = r; });
        const w = { actor: a, x: tx, z: tz, done };
        d._walks.push(w);
        const pts = Array.isArray(x) ? x.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p)) : null;
        Promise.resolve(pts ? a.walkTo(pts, o) : a.walkTo(x, z, o)).then(() => {
          const i = d._walks.indexOf(w);
          if (i >= 0) d._walks.splice(i, 1);
          done();
        });
        return finished;
      },
      async choice(options, o = {}) {
        if (self.skipping) self._stopSkip();
        const items = options.map((op) => (typeof op === 'string' ? { text: op } : { text: op.t || op.text, decisive: !!op.decisive }))
          .map((it) => ({ ...it, t: it.text, decisive: it.decisive || !!o.decisive }));
        self._choiceOpen = true;
        let i;
        const ap = G.dialogue?.autopick;
        if (ap != null) {
          await sched.wait(1);
          i = Array.isArray(ap) ? (ap.length ? ap.shift() : 0) : typeof ap === 'function' ? ap(null, items) : 0;
        } else {
          if (o.decisive) G.audio?.stinger?.('choice');
          i = await ui.choices(items, { timer: o.timer || 0, decisive: !!o.decisive });
        }
        self._choiceOpen = false;
        if (i == null || i < 0 || i >= items.length) i = o.default ?? 0;
        d._picks.push(i);
        return i;
      },
      tween(obj, prop, to, s = 1, ease) { return sched.prop(obj, prop, to, s, ease); },
      uniform(n, to, s = 1, ease) {
        const u = G.uniforms?.[n];
        return u ? sched.prop(u, 'value', to, s, ease) : Promise.resolve();
      },
      postfx(prop, to, s = 1, ease) {
        if (!G.postfx) return Promise.resolve();
        if (typeof G.postfx[prop] !== 'number') { G.postfx[prop] = to; return Promise.resolve(); }
        return sched.prop(G.postfx, prop, to, s, ease);
      },
      atmosphere(override) {
        if (!G.atmosphere) return;
        G.atmosphere.override = override;
        d._atmo = !!override;
      },
      parallel(...ps) { return Promise.all(ps.flat()); },
      end(o = {}) { d._end = o; return Promise.resolve(); },

      ground(x, z, h = 0) { return new THREE.Vector3(x, (G.world?.heightAt?.(x, z) ?? 0) + h, z); },
      rel(actor, offset) { return { actor: actorOf(actor), offset }; },
      head(actor) { const a = actorOf(actor); return () => a.eye(new THREE.Vector3()); },
      at(actor, frac = 0.6) { const a = actorOf(actor); return () => a.at(frac, new THREE.Vector3()); },
      two(a, b, o) { return cover(actorOf(a), actorOf(b)).two(o); },
      ots(subject, over) { return cover(actorOf(over), actorOf(subject)).ots(actorOf(subject)); },
      close(subject, toward) { return cover(actorOf(toward), actorOf(subject)).close(actorOf(subject), actorOf(toward)); },
      single(subject, toward) { return cover(actorOf(toward), actorOf(subject)).single(actorOf(subject), actorOf(toward)); },
      ghost(actor, on = true, o) { actorOf(actor)?.ghost(on, o); },
      hide(actor) { actorOf(actor)?.hide(); },
      show(actor) { actorOf(actor)?.show(); },
      dialogue(id, o = {}) {
        const actors = {};
        for (const [k, v] of stage().actors) actors[k] = v;
        return G.dialogue ? G.dialogue.start(id, { ...o, actors: { ...actors, ...(o.actors || {}) } }) : Promise.resolve(null);
      },
      flag(k, v = true) { G.state.set(k, v); },
      give(item, n = 1) { G.state.give(item, n); },
      quest(id, st) { if (st == null) G.quests?.start?.(id); else G.quests?.advance?.(id, st); },
    };
    return d;
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
