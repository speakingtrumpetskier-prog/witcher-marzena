// First-use hints (G.hints): a small, calm card the first time a mechanic becomes relevant, showing the
// player's real binding for the device in hand (keycaps for keyboard and mouse, button glyphs for a pad).
//
// What shows when is data in hintDefs.js. This file is the machinery:
//   - one card at a time on the left (the most urgent first, a pause of a few seconds between cards) and one on
//     the right, which only the skip-the-cutscene hint uses, so a story card and the skip hint can share a scene;
//   - a card ends when the player does the thing (the row ticks, then it fades), or after its timeout;
//   - nothing appears during cutscenes, dialogue, menus, the title, letterbox or a fade, and a card on screen
//     leaves at once when one of those begins (it comes back later unless it had been there for a while);
//   - each hint is shown once per profile (localStorage 'marzena.hints.seen'); G.settings.hints = false silences
//     them all, and reset() brings them back.
//
//   G.hints.show(id, { force })       show one now (force ignores seen, the setting and the live checks)
//   G.hints.prompt([[key, label]], s) a card for story code (G.ui.hint): immediate, not persisted, null clears it.
//                                     key names a default key ('E', 'Hold RMB', 'Move') and shows the real binding
//   G.hints.hide()  G.hints.seen(id)  G.hints.markSeen(id)  G.hints.reset()  G.hints.ids  G.hints.enabled
//   G.hints.cur                       the card on screen (left, else right) or null
// In shot mode (the harness) the automatic hints stay off unless the URL has &hints; show() still works.
import { h, svg, clear, store } from './dom.js';
import { actionGlyph, moveGlyph, lookGlyph, labelGlyph, labelAction } from './glyphs.js';
import { HINTS, EVENTS } from './hintDefs.js';

const SEEN_KEY = 'marzena.hints.seen';
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6l3.2 3.2L13 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ENDING = 0.9; // seconds a finished card stays before it fades
const SCAN = 0.2;
const SLOTS = ['left', 'right'];

function loadSeen() {
  try {
    const v = JSON.parse(store.get(SEEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}

export class Hints {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.defs = new Map(HINTS.map((d) => [d.id, { ...d, _t: 0 }]));
    this.ids = HINTS.map((d) => d.id);
    this.seenSet = new Set(loadSeen());
    this.slot = { left: null, right: null };
    this.gap = { left: 1.5, right: 0 };
    this.last = {}; // event -> clock time it last fired
    this.payload = {};
    this.liveT = 0; // seconds of uninterrupted play
    this.play = 0; // seconds of play this session
    this.walked = 0; // metres on foot
    this.rode = 0; // metres on Kasza
    this.flags = { sprinted: false, galloped: false };
    this._scanT = 0;
    this._lastPos = null;
    this._eval = null; // the card whose rows are being checked (c.fired looks at its start time)
    this.c = this._makeContext();

    this.layer = h('div', { class: 'mz-layer mz-hintlayer' });
    ui.root.insertBefore(this.layer, ui.overlays.noteLayer);

    const stamp = (name) => (p) => { this.last[name] = G.clock.elapsed; this.payload[name] = p; };
    for (const name of EVENTS) if (!name.startsWith('ui:open:')) G.events.on(name, stamp(name));
    G.events.on('ui:open', (p) => stamp(`ui:open:${p?.name}`)(p));
    const redo = () => { for (const card of this._cards()) if (!card.story) this._rebuild(card); };
    G.events.on('input:device', redo);
    G.events.on('input:bindings', redo);
  }

  get enabled() {
    return this.G.settings?.hints !== false && !(this.G.shot && !this.G.params.has('hints'));
  }

  get cur() { return this.slot.left || this.slot.right; }
  _cards() { return SLOTS.map((s) => this.slot[s]).filter(Boolean); }

  seen(id) { return this.seenSet.has(id); }
  markSeen(id) {
    if (!this.defs.has(id) || this.seenSet.has(id)) return;
    this.seenSet.add(id);
    store.set(SEEN_KEY, JSON.stringify([...this.seenSet]));
  }
  reset() {
    this.seenSet.clear();
    store.set(SEEN_KEY, '');
    for (const d of this.defs.values()) d._t = 0;
    this.gap.left = 2;
  }

  // ---- context for the definitions -------------------------------------------------------------------
  _makeContext() {
    const self = this, G = this.G;
    return {
      G,
      get P() { return G.player; },
      get live() { return self.liveT; },
      get play() { return self.play; },
      get walked() { return self.walked; },
      get rode() { return self.rode; },
      get sprinted() { return self.flags.sprinted; },
      get galloped() { return self.flags.galloped; },
      get mounted() { return !!G.player?.mounted; },
      get inCombat() { return !!(G.combat?.inCombat || G.player?.state === 'combat'); },
      get skippable() { return self._sceneLive(); },
      get fishing() { return G.fishing || null; },
      enemies(r) {
        const P = G.player;
        const list = G.combat?.liveEnemies?.() || [];
        if (!P) return [];
        return list.filter((e) => {
          const p = e.position || e.root?.position;
          return p && Math.hypot(p.x - P.position.x, p.z - P.position.z) < r;
        });
      },
      since(name) { return G.clock.elapsed - (self.last[name] ?? -1e9); },
      // Did the event fire after the card being checked came up (and does its payload pass pred)?
      fired(name, pred) {
        const t0 = self._eval?.t0 ?? G.clock.elapsed;
        return (self.last[name] ?? -1e9) >= t0 && (!pred || pred(self.payload[name]));
      },
      seen: (id) => self.seenSet.has(id),
      down: (a) => G.input.down(a),
      pressed: (a) => G.input.pressed(a),
    };
  }

  // Free play, hands on the controls, nothing else asking for the screen.
  _live() {
    const G = this.G, P = G.player, ui = this.ui;
    return !!P && P.control && !P.dead && !P._respawning && G.input?.context === 'game' && !G.story?.busy
      && !G.cutscenes?.active && !ui.menuOpen && !ui.titleActive && !ui.overlays.lbOn && !ui.overlays.faded
      && G.cameraOwner === 'rig' && !ui.choicesUI.active;
  }

  // Sitting at a fishing hole with the line in the water: Vesna has no control of her feet but has hands on the rod.
  _fishing() {
    const G = this.G, ui = this.ui;
    return !!G.fishing?.active && G.fishing.phase !== 'walk' && G.fishing.phase !== 'stand' && !ui.menuOpen && !ui.titleActive
      && !ui.overlays.faded && !G.story?.busy && !ui.choicesUI.active;
  }

  // A skippable cutscene is running and nobody has started skipping it.
  _sceneLive() {
    const cs = this.G.cutscenes;
    return !!(cs?.active && !cs.skipping && cs._d?.opts.skippable !== false && !this.ui.menuOpen && !this.ui.overlays.faded);
  }

  // ---- showing ------------------------------------------------------------------------------------------
  show(id, { force = false, seconds } = {}) {
    const d = this.defs.get(id);
    if (!d) return false;
    if (!force && (!this.enabled || this.seenSet.has(id))) return false;
    const slot = d.side === 'right' ? 'right' : 'left';
    if (this.slot[slot]) this._end(this.slot[slot], false);
    return this._open(d, { force, seconds });
  }

  // Rows for the device in hand: overrides applied, rows that do not apply or have no binding dropped.
  _rowsFor(def) {
    const G = this.G, dev = G.input.device;
    const out = [];
    def.rows.forEach((r, key) => {
      const o = r[dev];
      if (o === null) return;
      const row = { ...r, ...(o || {}), key };
      if (row.when && !row.when(this.c)) return;
      if (!row.kind && !G.input.codesFor(row.action, dev).length) return;
      out.push(row);
    });
    return out;
  }

  // force: a card the live checks and the setting cannot take away (galleries, tests). seconds overrides the timeout.
  _open(def, { force = false, seconds } = {}) {
    const rows = this._rowsFor(def);
    if (!rows.length) return false;
    const G = this.G;
    const slot = def.side === 'right' ? 'right' : 'left';
    const card = {
      id: def.id, def, rows, story: false, force, slot, t: 0, t0: G.clock.elapsed, shown: 0, done: new Set(), finishing: 0,
      seconds: seconds ?? def.seconds ?? 9, moved: 0, looked: 0, lastPos: null, el: null, off: false,
    };
    card.el = h('div', { class: `mz-hintcard ${slot}` }, h('i', { class: 'thread' }), h('div', { class: 'rows' }));
    this._fill(card);
    this.layer.appendChild(card.el);
    requestAnimationFrame(() => requestAnimationFrame(() => card.el.classList.add('on')));
    this.slot[slot] = card;
    return true;
  }

  _fill(card) {
    const box = card.el.querySelector('.rows');
    clear(box);
    for (const row of card.rows) {
      row.el = this._rowEl(row);
      if (card.done.has(row.key)) row.el.classList.add('done');
      box.appendChild(row.el);
    }
  }

  _rowEl(row) {
    const G = this.G;
    let glyph;
    if (row.glyph) glyph = row.glyph(G);
    else if (row.kind === 'move') glyph = moveGlyph(G);
    else if (row.kind === 'look') glyph = lookGlyph(G);
    else glyph = actionGlyph(G, row.action);
    return h('div', { class: 'row' }, row.hold ? h('span', { class: 'hold' }, 'Hold') : null, glyph, h('span', { class: 'txt' }, row.text), svg(TICK, 'tick'));
  }

  // The device or the bindings changed under a card: redo its rows (a pad may need different ones).
  _rebuild(card) {
    const rows = this._rowsFor(card.def);
    if (!rows.length) { this._end(card, false); return; }
    card.rows = rows;
    this._fill(card);
  }

  // Story code: a short card with explicit rows, shown at once and replaced by the next call.
  prompt(items, seconds = 9) {
    if (!items || !items.length) { if (this.slot.left?.story) this._end(this.slot.left, true); return; }
    if (this.slot.left) this._end(this.slot.left, false);
    const G = this.G;
    const rows = items.map((it, key) => {
      const [k, text] = Array.isArray(it) ? it : [it.key, it.label];
      const a = labelAction(k);
      if (a?.action === 'senses') this.markSeen('senses'); // the story is teaching it right now
      return { key, text, hold: !!a?.hold, glyph: () => labelGlyph(G, k) };
    });
    const card = {
      id: 'story', def: null, rows, story: true, slot: 'left', t: 0, t0: G.clock.elapsed, shown: 0, done: new Set(), finishing: 0,
      seconds: Number.isFinite(seconds) ? seconds : 0, moved: 0, looked: 0, lastPos: null, el: null, off: false,
    };
    card.el = h('div', { class: 'mz-hintcard left story' }, h('i', { class: 'thread' }), h('div', { class: 'rows' }));
    this._fill(card);
    this.layer.appendChild(card.el);
    requestAnimationFrame(() => requestAnimationFrame(() => card.el.classList.add('on')));
    this.slot.left = card;
  }

  hide() { for (const card of this._cards()) this._end(card, false); }

  _end(card, completed) {
    if (!card || card.off) return;
    card.off = true;
    if (!card.story && (completed || card.shown >= 2)) this.markSeen(card.id);
    card.el.classList.remove('on');
    card.el.classList.add('off');
    const el = card.el;
    setTimeout(() => el.remove(), 800);
    if (this.slot[card.slot] === card) this.slot[card.slot] = null;
    this.gap[card.slot] = completed ? 2.4 : 3;
  }

  // ---- per frame ------------------------------------------------------------------------------------------
  update(dt) {
    const G = this.G, P = G.player, inp = G.input;
    if (!inp) return;
    if (!this.enabled) {
      for (const card of this._cards()) if (!card.force && !card.story) this._end(card, false);
      if (!this._cards().length) return;
    }
    const live = this._live();
    this.liveT = live ? this.liveT + dt : 0;
    if (live) {
      this.play += dt;
      const p = P.position;
      if (this._lastPos) {
        const d = Math.hypot(p.x - this._lastPos.x, p.z - this._lastPos.z);
        if (d < 3) { if (P.mounted) this.rode += d; else this.walked += d; }
      } else this._lastPos = { x: p.x, z: p.z };
      this._lastPos.x = p.x; this._lastPos.z = p.z;
      if (inp.down('sprint') && !P.mounted && inp.move.x * inp.move.x + inp.move.y * inp.move.y > 0.04) this.flags.sprinted = true;
      if (P.mounted && (G.horse?.speed ?? 0) > 7) this.flags.galloped = true;
    } else this._lastPos = null;
    const scene = this._sceneLive();
    const fishing = this._fishing();
    // which kind of moment a hint belongs to: a cutscene, a seat at a fishing hole, or free play
    const fits = (d) => (d.scene ? scene : d.fishing ? fishing : live);

    for (const card of this._cards()) {
      if (card.story) this._tickStory(card, dt);
      else if (!card.force && (!fits(card.def) || (card.def.until && card.def.until(this.c)))) this._end(card, false);
      else this._tick(card, dt);
    }
    if (!this.enabled) return;

    this._scanT -= dt;
    if (this._scanT <= 0) {
      this._scanT = SCAN;
      for (const d of this.defs.values()) {
        if (this.seenSet.has(d.id) || !fits(d)) { d._t = 0; continue; }
        let ok = false;
        try { ok = !!d.watch(this.c); } catch { ok = false; }
        d._t = ok ? d._t + SCAN : 0;
      }
    }

    // Fill each free slot with the most urgent hint that is ready for it.
    for (const slot of SLOTS) {
      this.gap[slot] -= dt;
      if (this.slot[slot] || this.gap[slot] > 0 || !(slot === 'right' ? scene : live || fishing)) continue;
      let best = null;
      for (const d of this.defs.values()) {
        if ((d.side === 'right') !== (slot === 'right')) continue;
        if (d._t < (d.delay ?? 0.8) || this.seenSet.has(d.id)) continue;
        if (!best || d.prio < best.prio) best = d;
      }
      if (best) {
        best._t = 0;
        if (!this._open(best)) this.gap[slot] = 0.5;
      }
    }
  }

  _tickStory(card, dt) {
    card.t += dt;
    if (card.seconds && card.t > card.seconds) this._end(card, true);
    // A card about play does not sit over a cutscene that starts while it is up.
    else if (this.G.cutscenes?.active) this._end(card, false);
  }

  _tick(card, dt) {
    const G = this.G, P = G.player, inp = G.input;
    card.t += dt;
    card.shown += dt;
    // What the player has done since the card came up.
    if (P) {
      if (card.lastPos) card.moved += Math.hypot(P.position.x - card.lastPos.x, P.position.z - card.lastPos.z);
      card.lastPos = { x: P.position.x, z: P.position.z };
    }
    card.looked += (Math.abs(inp.look.dx) + Math.abs(inp.look.dy)) / 280 + Math.hypot(inp.lookPad.x, inp.lookPad.y) * dt * 1.4;

    if (card.t > 0.45) {
      this._eval = card;
      for (const row of card.rows) {
        if (card.done.has(row.key) || !this._isDone(card, row)) continue;
        card.done.add(row.key);
        row.el.classList.add('done');
      }
      this._eval = null;
    }
    if (!card.finishing && card.rows.every((r) => card.done.has(r.key))) card.finishing = card.t + ENDING;
    if (card.finishing && card.t >= card.finishing) this._end(card, true);
    else if (card.t > card.seconds) this._end(card, card.done.size > 0);
  }

  _isDone(card, row) {
    const c = this.c, inp = this.G.input;
    if (typeof row.done === 'string') return (this.last[row.done] ?? -1e9) >= card.t0;
    if (typeof row.done === 'function') return !!row.done(c);
    if (row.kind === 'move') return card.moved > 2.5;
    if (row.kind === 'look') return card.looked > 0.7;
    return row.hold ? inp.down(row.action) : inp.pressed(row.action);
  }
}
