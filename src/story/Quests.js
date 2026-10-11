// Quests and journal (G.quests). Definitions: src/story/content/quests.js. State lives in
// G.state.data.quests[id] = { stage, done, failed, subs: { subId: true }, log: [{ stage, text, day, hours }] }
// and the tracked quest id in G.state.data.tracked, so saves carry everything.
//
//   G.quests.start(id, stage?)     G.quests.advance(id, stage)   (stage id or index)
//   G.quests.complete(id)          G.quests.fail(id)
//   G.quests.stage(id) -> stage id | null       G.quests.isActive(id)   G.quests.isDone(id)
//   G.quests.track(id)             G.quests.tracked -> id | null
//   G.quests.objectives() -> [{ questId, title, text, marker: [x, z] | null, tracked, sub }]
//   G.quests.list() -> [{ id, title, kind, status, stage, objective, entries: [text] }]  (journal)
//   G.quests.def(id)  G.quests.defs   G.quests.check()  (re-evaluate auto conditions)
// Emits 'quest:update' { id, stage, kind: 'start' | 'advance' | 'sub' | 'complete' | 'fail' }.
// Stages with `done(S, G)` or `reach` advance on their own (see content/quests.js).
import QUESTS from './content/quests.js';
import { LOC } from '../world/layout.js';

export class Quests {
  constructor(G, story) {
    this.G = G;
    this.story = story;
    this.defs = QUESTS;
    this._zones = new Map();
    this._checking = false;
    const recheck = () => this.check();
    for (const ev of ['flag', 'inventory', 'time:hour', 'time:jump', 'note']) G.events.on(ev, recheck);
    G.events.on('loaded', () => this._rebuildZones());
    G.events.on('reset', () => this._rebuildZones());
  }

  get data() { return (this.G.state.data.quests ||= {}); }
  get tracked() { return this.G.state.data.tracked || null; }

  def(id) { return this.defs[id] || null; }
  rec(id) { return this.data[id] || null; }
  stage(id) { const r = this.rec(id); return r && !r.done && !r.failed ? r.stage : null; }
  isActive(id) { const r = this.rec(id); return !!r && !r.done && !r.failed; }
  isDone(id) { return !!this.rec(id)?.done; }
  isFailed(id) { return !!this.rec(id)?.failed; }

  _stageDef(id, stage) {
    const q = this.def(id);
    if (!q) return null;
    if (typeof stage === 'number') return q.stages[stage] || null;
    return q.stages.find((s) => s.id === stage) || null;
  }

  _text(v) {
    if (typeof v === 'function') { try { return v(this.G.state, this.G); } catch (e) { console.error(e); return ''; } }
    return v;
  }

  _log(id, stage, text) {
    const t = this._text(text);
    if (!t) return;
    const r = this.rec(id);
    if (!r) return;
    const last = r.log[r.log.length - 1];
    if (last && last.text === t) return;
    r.log.push({ stage, text: t, day: this.G.time?.day ?? 1, hours: Math.round((this.G.time?.hours ?? 0) * 100) / 100 });
  }

  _enter(id, sd, { silent = false } = {}) {
    const r = this.rec(id);
    r.stage = sd.id;
    r.subs = {};
    if (!silent) this._log(id, sd.id, sd.journal);
    try { sd.enter?.(this.G.state, this.G); } catch (e) { console.error(`[quest ${id}] enter`, e); }
    this._zoneFor(id, sd);
  }

  _leave(id, sd) {
    if (!sd) return;
    this._log(id, sd.id, sd.log);
    try { sd.exit?.(this.G.state, this.G); } catch (e) { console.error(`[quest ${id}] exit`, e); }
    this._dropZone(id);
  }

  _notify(text, kind) {
    if (!this.quiet) this.story.ui?.notify?.(text, kind);
  }

  start(id, stage) {
    const q = this.def(id);
    if (!q) { console.warn(`[quests] unknown quest ${id}`); return false; }
    const r = this.rec(id);
    if (r && !r.done && !r.failed) {
      if (stage != null) return this.advance(id, stage);
      return false;
    }
    if (r && (r.done || r.failed)) return false;
    const sd = stage != null ? this._stageDef(id, stage) : q.stages[0];
    if (!sd) return false;
    this.data[id] = { stage: sd.id, done: false, failed: false, subs: {}, log: [], started: this.G.time?.day ?? 1 };
    this._enter(id, sd);
    if (!this.tracked || q.kind === 'main' || !this.isActive(this.tracked)) this.G.state.data.tracked = id;
    this._notify(`New quest: ${q.title}`, 'quest');
    if (!this.quiet) this.G.audio?.stinger?.('quest');
    this.G.events.emit('quest:update', { id, stage: sd.id, kind: 'start' });
    this.check();
    return true;
  }

  advance(id, stage) {
    const q = this.def(id);
    if (!q) return false;
    if (!this.rec(id)) return this.start(id, stage);
    const r = this.rec(id);
    if (r.done || r.failed) return false;
    const sd = this._stageDef(id, stage);
    if (!sd) { console.warn(`[quests] ${id} has no stage ${stage}`); return false; }
    if (sd.id === r.stage) return false;
    this._leave(id, this._stageDef(id, r.stage));
    this._enter(id, sd);
    this._notify(`Quest updated: ${q.title}`, 'journal');
    this.G.events.emit('quest:update', { id, stage: sd.id, kind: 'advance' });
    this.check();
    return true;
  }

  // Move on from the current stage: explicit `next`, the following stage, or completion.
  next(id) {
    const q = this.def(id), r = this.rec(id);
    if (!q || !r || r.done || r.failed) return false;
    const cur = this._stageDef(id, r.stage);
    const idx = q.stages.indexOf(cur);
    const nx = cur?.next || q.stages[idx + 1]?.id;
    return nx ? this.advance(id, nx) : this.complete(id);
  }

  complete(id) {
    const q = this.def(id), r = this.rec(id);
    if (!q) return false;
    if (!r) { this.start(id); return this.complete(id); }
    if (r.done || r.failed) return false;
    this._leave(id, this._stageDef(id, r.stage));
    r.done = true;
    this._notify(`Quest completed: ${q.title}`, 'quest');
    if (!this.quiet) this.G.audio?.stinger?.('quest');
    this.G.events.emit('quest:update', { id, stage: r.stage, kind: 'complete' });
    if (this.tracked === id) this.G.state.data.tracked = null;
    if (q.next) this.start(q.next);
    if (!this.tracked) this._autoTrack();
    return true;
  }

  fail(id) {
    const q = this.def(id), r = this.rec(id);
    if (!q || !r || r.done || r.failed) return false;
    this._dropZone(id);
    r.failed = true;
    this._notify(`Quest failed: ${q.title}`, 'quest');
    this.G.events.emit('quest:update', { id, stage: r.stage, kind: 'fail' });
    if (this.tracked === id) { this.G.state.data.tracked = null; this._autoTrack(); }
    return true;
  }

  track(id) {
    if (id && !this.isActive(id)) return false;
    this.G.state.data.tracked = id || null;
    this.G.events.emit('quest:update', { id, stage: this.stage(id), kind: 'track' });
    return true;
  }

  _autoTrack() {
    const active = Object.keys(this.data).filter((k) => this.isActive(k));
    const main = active.find((k) => this.def(k)?.kind === 'main');
    this.G.state.data.tracked = main || active[0] || null;
  }

  marker(m) {
    const v = typeof m === 'function' ? m(this.G.state, this.G) : m;
    if (!v) return null;
    if (typeof v === 'string') { const l = LOC[v]; return l ? [l.x, l.z] : null; }
    if (Array.isArray(v)) return [v[0], v[1]];
    if (v.x != null) return [v.x, v.z];
    return null;
  }

  objectives() {
    const out = [];
    const ids = Object.keys(this.data).filter((k) => this.isActive(k));
    const tr = this.tracked;
    ids.sort((a, b) => (a === tr ? -1 : b === tr ? 1 : 0));
    for (const id of ids) {
      const q = this.def(id), r = this.rec(id), sd = this._stageDef(id, r.stage);
      if (!q || !sd) continue;
      if (sd.objectives?.length) {
        for (const sub of sd.objectives) {
          if (r.subs?.[sub.id]) continue;
          out.push({ questId: id, title: q.title, text: this._text(sub.text), marker: this.marker(sub.marker), tracked: id === tr, sub: sub.id });
        }
      } else {
        const text = this._text(sd.objective);
        if (text) out.push({ questId: id, title: q.title, text, marker: this.marker(sd.marker), tracked: id === tr, sub: null });
      }
    }
    return out;
  }

  list() {
    return Object.keys(this.data).map((id) => {
      const q = this.def(id) || { title: id, kind: 'side' }, r = this.rec(id);
      const sd = this._stageDef(id, r.stage);
      return {
        id, title: q.title, kind: q.kind,
        status: r.done ? 'done' : r.failed ? 'failed' : 'active',
        stage: r.stage, objective: sd && !r.done ? this._text(sd.objective) : null,
        tracked: id === this.tracked,
        entries: r.log.map((e) => e.text),
      };
    });
  }

  // Evaluate `done` predicates of every active stage and its sub-objectives.
  check() {
    if (this._checking) return;
    this._checking = true;
    try {
      const S = this.G.state;
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (const id of Object.keys(this.data)) {
          if (!this.isActive(id)) continue;
          const r = this.rec(id), sd = this._stageDef(id, r.stage);
          if (!sd) continue;
          if (sd.objectives?.length) {
            let all = true;
            for (const sub of sd.objectives) {
              if (r.subs[sub.id]) continue;
              let ok = false;
              try { ok = !!sub.done?.(S, this.G); } catch (e) { console.error(e); }
              if (ok) {
                r.subs[sub.id] = true;
                this._log(id, sd.id, sub.log);
                this._notify(`Quest updated: ${this.def(id).title}`, 'journal');
                this.G.events.emit('quest:update', { id, stage: sd.id, kind: 'sub', sub: sub.id });
              } else all = false;
            }
            if (all) { this.next(id); moved = true; continue; }
          }
          let ok = false;
          try { ok = !!sd.done?.(S, this.G); } catch (e) { console.error(e); }
          if (ok) { this.next(id); moved = true; }
        }
        if (!moved) break;
      }
    } finally {
      this._checking = false;
    }
  }

  _zoneFor(id, sd) {
    this._dropZone(id);
    if (!sd.reach || !this.story.zone) return;
    const t = typeof sd.reach === 'string' ? LOC[sd.reach] : sd.reach;
    if (!t) return;
    const zid = this.story.zone({
      id: `quest:${id}:${sd.id}`, x: t.x, z: t.z, r: t.r || 12, once: true,
      onEnter: () => { if (this.stage(id) === sd.id) this.next(id); },
    });
    this._zones.set(id, zid);
  }

  _dropZone(id) {
    const z = this._zones.get(id);
    if (z != null) { this.story.removeZone?.(z); this._zones.delete(id); }
  }

  _rebuildZones() {
    for (const id of [...this._zones.keys()]) this._dropZone(id);
    for (const id of Object.keys(this.data)) {
      if (!this.isActive(id)) continue;
      const sd = this._stageDef(id, this.rec(id).stage);
      if (sd) this._zoneFor(id, sd);
    }
  }
}
