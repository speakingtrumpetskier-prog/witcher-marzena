// Journal (J): a two page parchment spread. Tabs: Quests, Notes, Bestiary, Fish.
//
// Quests are read from G.state.data.quests[id] = { stage, done, failed, log: [entry] } where an
// entry is a string or { text, day, hours }. Titles come from G.quests (title(id) or defs[id].title)
// and fall back to content.js. The current objective comes from G.quests.objectives().
// Notes: G.state.data.notes (ids) resolved through content.js / G.ui.registerNotes.
// Bestiary: content.js BESTIARY entries unlocked by flags (see unlock()).
import { h, svg, clear, markup, store } from './dom.js';
import { ICON } from './icons.js';
import { paperCanvas, grainURL } from './paper.js';
import { drawSketch } from './sketch.js';
import { QUEST_FALLBACK } from './content.js';
import { gwiazda, leluja } from './wycinanki.js';
import { hintBar } from './glyphs.js';
import { SPECIES, JOURNAL_ORDER } from '../gameplay/fishing/species.js';
import { kg } from '../gameplay/fishing/model.js';
import { BUCKET_WORDS } from '../gameplay/fishing/store.js';

const seedOf = (t) => { let x = 7; for (const ch of String(t || '')) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x % 997; };
const rosette = (t) => gwiazda(seedOf(t), { size: 30, cls: 'jr-rosette' });

const TABS = [['quests', 'Quests'], ['notes', 'Notes'], ['bestiary', 'Bestiary'], ['fish', 'Fish']];
const SEEN_KEY = 'marzena.journal.seen';

const pretty = (id) => String(id).replace(/^(main|side)_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function readSeen() {
  try { return JSON.parse(store.get(SEEN_KEY, '{}')) || {}; } catch { return {}; }
}

export class Journal {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.scr = null;
    this.tab = 'quests';
    this.sel = { quests: 0, notes: 0, bestiary: 0, fish: 0 };
    this.seen = readSeen();
  }

  get isOpen() { return !!this.scr?.open; }
  close() { return this.scr?.close(); }

  // ---- data --------------------------------------------------------------------------------
  trackedId() {
    const q = this.G.quests;
    return q?.tracked ?? q?.trackedId ?? this.G.state?.data?.tracked ?? null;
  }

  questList() {
    const G = this.G;
    const recs = G.state?.data?.quests || {};
    let objs = [];
    try { objs = G.quests?.objectives?.() || []; } catch { objs = []; }
    const list = [];
    const defOrder = Object.keys(G.quests?.defs || {});
    for (const id of Object.keys(recs)) {
      const rec = recs[id] || {};
      const fb = QUEST_FALLBACK[id] || {};
      let def = null;
      try { def = G.quests?.def?.(id) ?? G.quests?.defs?.[id] ?? null; } catch { def = null; }
      const title = def?.title ?? null;
      const kind = def?.kind || fb.kind || (/^side/.test(id) ? 'side' : 'main');
      const log = (rec.log || []).map((e) => (typeof e === 'string' ? { text: e } : { text: e.text ?? e.t ?? e.entry ?? '', day: e.day, hours: e.hours })).filter((e) => e.text);
      const mine = objs.filter((o) => o.questId === id).map((o) => o.text).filter(Boolean);
      list.push({
        id, title: title || fb.title || pretty(id), kind, order: defOrder.includes(id) ? defOrder.indexOf(id) : fb.order ?? 50,
        state: rec.failed ? 'failed' : rec.done ? 'done' : 'active', stage: rec.stage, log, objectives: rec.done || rec.failed ? [] : mine,
      });
    }
    list.sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'main' ? -1 : 1));
    return list;
  }

  // Grouped, display order: main, side, settled.
  questRows() {
    const all = this.questList();
    return [
      ['Main', all.filter((q) => q.state === 'active' && q.kind === 'main')],
      ['Side', all.filter((q) => q.state === 'active' && q.kind === 'side')],
      ['Settled', all.filter((q) => q.state !== 'active')],
    ].filter(([, rows]) => rows.length);
  }

  noteRows() {
    const ids = this.G.state?.data?.notes || [];
    return ids.map((id) => ({ id, info: this.ui.noteInfo(id) || { title: pretty(String(id).replace(/^note_/, '')), text: '', kind: 'letter' } }));
  }

  bestiaryRows() {
    const S = this.G.state;
    return this.ui.bestiary.map((b) => {
      let open = false;
      try { open = !!(S?.flag?.(`bestiary_${b.id}`) || b.unlock?.(S)); } catch { open = false; }
      // `more`: observations Vesna adds as she witnesses things, [{ when(S), text }], kept in order.
      let paras = b.text;
      if (open && b.more) {
        try { paras = [...b.text, ...b.more.filter((m) => m.when(S)).map((m) => m.text)]; } catch { paras = b.text; }
      }
      return { ...b, open, paras };
    });
  }

  // The fish she has landed (gameplay/fishing): one page per species, drawn and written in her hand. The facts at the bottom
  // are what she has actually seen: her best, how many, and (from the second fish) the depth and the hour they took the jig.
  fishRows() {
    const S = this.G.state;
    const log = S?.data?.fish?.log || {};
    const old = S?.data?.fish?.oldone;
    return JOURNAL_ORDER.map((id) => {
      const sp = SPECIES[id];
      const L = log[id];
      const open = !!(L && L.n > 0) || (id === 'pike' && !!old);
      const paras = [...sp.note];
      const facts = [];
      if (open) {
        for (const m of sp.more || []) if (L && L.n >= m.n) paras.push(m.text);
        if (id === 'pike' && old) paras.push(`The old one under the bell tower was ${kg(old.w)}, nearly as long as I am tall, with three old hooks in its jaw.`);
        if (L) facts.push(['Best', kg(L.best)], ['Landed', String(L.n)]);
        if (L && L.n >= 2) {
          facts.push(['Jig at', L.dMax - L.dMin < 0.3 ? `${L.dMin.toFixed(1)} m` : `${L.dMin.toFixed(1)} to ${L.dMax.toFixed(1)} m`]);
          const top = L.hrs.map((n, i) => [n, i]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, i]) => BUCKET_WORDS[i].replace(/^in the /, ''));
          if (top.length) facts.push(['When', top.join(', ')]);
        }
      }
      return { id, name: sp.name, sub: sp.pl, sketch: sp.sketch, open, paras, facts };
    });
  }

  // ---- open / close ------------------------------------------------------------------------
  open(opts = {}) {
    if (this.scr?.open) return this.scr.closed;
    if (opts.tab && TABS.some(([k]) => k === opts.tab)) this.tab = opts.tab;
    this.seen = readSeen();
    this._build();
    const rows = this.questRows().flatMap(([, r]) => r);
    if (opts.quest) {
      const i = rows.findIndex((q) => q.id === opts.quest);
      if (i >= 0) this.sel.quests = i;
    } else {
      const tr = this.trackedId();
      const i = rows.findIndex((q) => q.id === tr);
      this.sel.quests = i >= 0 ? i : 0;
    }
    if (Number.isInteger(opts.index)) this.sel[this.tab] = opts.index;
    this.render();
    this.scr = this.ui.openScreen({
      name: 'journal',
      el: this.el,
      onKey: (e) => this._key(e),
      onClose: () => { store.set(SEEN_KEY, JSON.stringify(this.seen)); },
    });
    return this.scr.closed;
  }

  _build() {
    const paper = paperCanvas(640, 420, { seed: 21, spine: true, edge: 0.85 });
    paper.className = 'paper';
    this.tabsEl = h('div', { class: 'jr-tabs' });
    this.left = h('div', { class: 'jr-page left' });
    this.right = h('div', { class: 'jr-page right' });
    this.hintEl = h('div', { class: 'jr-hint' });
    const spread = h('div', { class: 'jr-spread' }, paper, h('div', { class: 'grain', style: { backgroundImage: `url(${grainURL()})` } }), this.left, this.right,
      h('div', { class: 'jr-gutter' }));
    this.book = h('div', { class: 'jr-book' }, this.tabsEl, spread, this.hintEl);
    this.el = h('div', { class: 'mz-journal' }, this.book);
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.scr?.close(); });
  }

  // ---- rendering ---------------------------------------------------------------------------
  render() {
    this._tabs();
    clear(this.left);
    clear(this.right);
    if (this.tab === 'quests') this._quests();
    else if (this.tab === 'notes') this._notes();
    else if (this.tab === 'fish') this._fish();
    else this._bestiary();
    this._hint();
    // Quests read newest-last, so start scrolled to the bottom. Before the screen is attached there is
    // no layout, so this also runs once on the next frame.
    const down = () => { const sc = this.right.querySelector('.jr-scroll'); if (sc) sc.scrollTop = this.tab === 'quests' ? 1e5 : 0; };
    down();
    requestAnimationFrame(down);
  }

  _tabs() {
    clear(this.tabsEl);
    TABS.forEach(([k, label], i) => {
      const n = k === 'quests' ? this.questList().filter((q) => q.state === 'active').length
        : k === 'notes' ? this.noteRows().length : k === 'fish' ? this.fishRows().filter((b) => b.open).length : this.bestiaryRows().filter((b) => b.open).length;
      const t = h('button', { class: 'jr-tab' + (k === this.tab ? ' on' : ''), type: 'button', tabindex: '-1' },
        h('span', { class: 'lab' }, label), n ? h('span', { class: 'n' }, String(n)) : null);
      t.addEventListener('click', () => this.setTab(k));
      this.tabsEl.appendChild(t);
      if (i < TABS.length - 1) this.tabsEl.appendChild(h('span', { class: 'sep' }, '·'));
    });
  }

  _hint() {
    clear(this.hintEl).appendChild(hintBar(this.G, [
      ['tabs', 'Tabs'], ['updown', 'Select'],
      this.tab === 'quests' ? ['confirm', 'Track'] : this.tab === 'notes' ? ['confirm', 'Read'] : null,
      ['map', 'Map'], ['back', 'Close'],
    ].filter(Boolean)));
  }

  _head(text, sub) {
    return h('div', { class: 'jr-head' }, h('div', { class: 'sub' }, sub), h('h3', null, text), h('div', { class: 'rule' }, svg(ICON.knot)));
  }

  _empty(text) {
    return h('p', { class: 'jr-empty' }, text);
  }

  _quests() {
    const groups = this.questRows();
    this.left.append(this._head('Quests', 'Vesna’s book'));
    const flat = groups.flatMap(([, r]) => r);
    if (!flat.length) {
      this.left.append(this._empty('Nothing written yet. The book is new, and so is the valley.'));
      this.right.append(h('div', { class: 'jr-blank' }, leluja(23, { w: 96, h: 160 })));
      return;
    }
    this.sel.quests = Math.max(0, Math.min(flat.length - 1, this.sel.quests));
    const tracked = this.trackedId();
    const list = h('div', { class: 'jr-list' });
    let idx = 0;
    for (const [name, rows] of groups) {
      list.append(h('div', { class: 'jr-group' }, name));
      for (const q of rows) {
        const i = idx++;
        const fresh = q.log.length > (this.seen[q.id] ?? 0) && i !== this.sel.quests;
        const row = h('button', { class: 'jr-row' + (i === this.sel.quests ? ' sel' : '') + (q.state !== 'active' ? ' done' : ''), type: 'button', tabindex: '-1' },
          h('span', { class: 'mk' }, tracked === q.id ? svg(ICON.diamond) : null),
          h('span', { class: 'tx' }, q.title),
          fresh ? h('span', { class: 'new', title: 'New entry' }) : null);
        row.addEventListener('click', () => { this.sel.quests = i; this.render(); });
        row.addEventListener('dblclick', () => this._track());
        list.append(row);
      }
    }
    this.left.append(h('div', { class: 'jr-scroll' }, list));
    const q = flat[this.sel.quests];
    this.seen[q.id] = q.log.length;

    // Right page
    const scroll = h('div', { class: 'jr-scroll' });
    const kindLabel = q.kind === 'main' ? 'Main quest' : 'Side quest';
    this.right.append(h('div', { class: 'jr-qhead' }, rosette(q.title), h('div', { class: 'sub' }, kindLabel), h('h2', null, q.title), h('div', { class: 'rule' }, svg(ICON.knot))));
    if (q.state !== 'active') this.right.append(h('div', { class: 'jr-stamp' }, q.state === 'failed' ? 'Lost' : 'Settled'));
    const entries = h('div', { class: 'jr-entries' });
    q.log.forEach((e, i) => {
      const last = i === q.log.length - 1;
      entries.append(h('div', { class: 'jr-entry' + (last ? ' latest' : '') },
        e.day >= 1 ? h('span', { class: 'day' }, `Day ${e.day}`) : null, h('p', null, markup(e.text))));
    });
    if (!q.log.length) entries.append(this._empty('Not yet written.'));
    scroll.append(entries);
    if (q.state === 'active' && q.objectives.length) {
      scroll.append(h('div', { class: 'jr-now' }, h('span', { class: 'lab' }, 'Now'), ...q.objectives.map((t) => h('p', null, t))));
    }
    this.right.append(scroll);
  }

  _notes() {
    const rows = this.noteRows();
    this.left.append(this._head('Notes', 'Read and kept'));
    if (!rows.length) {
      this.left.append(this._empty('Nothing read yet. Letters, scratched walls and other people’s last words end up here.'));
      this.right.append(h('div', { class: 'jr-blank' }, svg(ICON.scroll)));
      return;
    }
    this.sel.notes = Math.max(0, Math.min(rows.length - 1, this.sel.notes));
    const list = h('div', { class: 'jr-list' });
    rows.forEach((r, i) => {
      const row = h('button', { class: 'jr-row' + (i === this.sel.notes ? ' sel' : ''), type: 'button', tabindex: '-1' },
        h('span', { class: 'mk' }, svg(ICON.scroll)), h('span', { class: 'tx' }, r.info.title || pretty(r.id)));
      row.addEventListener('click', () => { this.sel.notes = i; this.render(); });
      row.addEventListener('dblclick', () => this._readNote());
      list.append(row);
    });
    this.left.append(h('div', { class: 'jr-scroll' }, list));
    const n = rows[this.sel.notes].info;
    const scroll = h('div', { class: 'jr-scroll' });
    this.right.append(h('div', { class: 'jr-qhead' }, rosette(n.title || ''), h('div', { class: 'sub' }, n.where || 'Found'), h('h2', null, n.title || ''), h('div', { class: 'rule' }, svg(ICON.knot))));
    const body = h('div', { class: 'jr-entries note-' + (n.kind || 'letter') });
    if (n.kind === 'drawing') {
      const c = h('canvas', { class: 'jr-sketch', width: 640, height: 440 });
      drawSketch(c, n.sketch || 'ice_lady', 5);
      this.left.append(h('div', { class: 'jr-sketchbox' }, c));
    }
    String(n.text || '').split('\n').filter((l) => l.trim()).forEach((l) => body.append(h('div', { class: 'jr-entry latest' }, h('p', null, markup(l)))));
    if (n.sign) body.append(h('div', { class: 'jr-sign' }, n.sign));
    scroll.append(body);
    this.right.append(scroll);
  }

  _bestiary() {
    const rows = this.bestiaryRows();
    this.left.append(this._head('Bestiary', 'What I have met'));
    this.sel.bestiary = Math.max(0, Math.min(rows.length - 1, this.sel.bestiary));
    const list = h('div', { class: 'jr-list' });
    rows.forEach((b, i) => {
      const row = h('button', { class: 'jr-row' + (i === this.sel.bestiary ? ' sel' : '') + (b.open ? '' : ' locked'), type: 'button', tabindex: '-1' },
        h('span', { class: 'mk' }), h('span', { class: 'tx' }, b.open ? b.name : '? ? ?'));
      row.addEventListener('click', () => { this.sel.bestiary = i; this.render(); });
      list.append(row);
    });
    this.left.append(h('div', { class: 'jr-scroll' }, list));
    const b = rows[this.sel.bestiary];
    const scroll = h('div', { class: 'jr-scroll' });
    if (!b?.open) {
      this.right.append(h('div', { class: 'jr-qhead' }, rosette('? ? ?'), h('div', { class: 'sub' }, 'Not yet met'), h('h2', null, '? ? ?'), h('div', { class: 'rule' }, svg(ICON.knot))));
      scroll.append(this._empty('I have not seen this one. When I do, I will write it down.'));
      this.right.append(scroll);
      return;
    }
    const c = h('canvas', { class: 'jr-sketch', width: 640, height: 440 });
    drawSketch(c, b.sketch, 3);
    this.left.append(h('div', { class: 'jr-sketchbox' }, c));
    this.right.append(h('div', { class: 'jr-qhead' }, rosette(b.name), h('div', { class: 'sub' }, b.sub), h('h2', null, b.name), h('div', { class: 'rule' }, svg(ICON.knot))));
    const body = h('div', { class: 'jr-entries' });
    (b.paras || b.text).forEach((p) => body.append(h('div', { class: 'jr-entry latest' }, h('p', null, markup(p)))));
    scroll.append(body);
    if (b.weak || b.beware) {
      scroll.append(h('div', { class: 'jr-facts' },
        b.weak ? h('div', null, h('span', { class: 'lab' }, 'Weak to'), b.weak) : null,
        b.beware ? h('div', null, h('span', { class: 'lab' }, 'Beware'), b.beware) : null));
    }
    this.right.append(scroll);
  }

  // The same two pages as the bestiary, for the fish: a list of the six on the left, the drawing, the notes and the facts she
  // has seen for herself on the right.
  _fish() {
    const rows = this.fishRows();
    this.left.append(this._head('Fish', 'What I have landed'));
    this.sel.fish = Math.max(0, Math.min(rows.length - 1, this.sel.fish));
    const list = h('div', { class: 'jr-list' });
    rows.forEach((b, i) => {
      const row = h('button', { class: 'jr-row' + (i === this.sel.fish ? ' sel' : '') + (b.open ? '' : ' locked'), type: 'button', tabindex: '-1' },
        h('span', { class: 'mk' }), h('span', { class: 'tx' }, b.open ? b.name : '? ? ?'));
      row.addEventListener('click', () => { this.sel.fish = i; this.render(); });
      list.append(row);
    });
    this.left.append(h('div', { class: 'jr-scroll' }, list));
    const b = rows[this.sel.fish];
    const scroll = h('div', { class: 'jr-scroll' });
    if (!b?.open) {
      this.right.append(h('div', { class: 'jr-qhead' }, rosette('? ? ?'), h('div', { class: 'sub' }, 'Not landed'), h('h2', null, '? ? ?'), h('div', { class: 'rule' }, svg(ICON.knot))));
      scroll.append(this._empty('I have not landed one of these. When I do, I will write it down.'));
      this.right.append(scroll);
      return;
    }
    const c = h('canvas', { class: 'jr-sketch wide', width: 640, height: 440 }); // a fish is long and low: cropped, so the list keeps its six rows
    drawSketch(c, b.sketch, 3);
    this.left.append(h('div', { class: 'jr-sketchbox' }, c));
    this.right.append(h('div', { class: 'jr-qhead' }, rosette(b.name), h('div', { class: 'sub' }, b.sub), h('h2', null, b.name), h('div', { class: 'rule' }, svg(ICON.knot))));
    const body = h('div', { class: 'jr-entries' });
    b.paras.forEach((p) => body.append(h('div', { class: 'jr-entry latest' }, h('p', null, markup(p)))));
    // her own numbers first, so they are not lost below a long page of notes
    if (b.facts.length) scroll.append(h('div', { class: 'jr-facts top' }, ...b.facts.map(([k, v]) => h('div', null, h('span', { class: 'lab' }, k), v))));
    scroll.append(body);
    this.right.append(scroll);
  }

  // ---- input -------------------------------------------------------------------------------
  setTab(k) {
    if (k === this.tab) return;
    this.tab = k;
    this.ui.sfx('page_turn', { volume: 0.4 });
    this.render();
  }

  _cycleTab(d) {
    const i = TABS.findIndex(([k]) => k === this.tab);
    this.setTab(TABS[(i + d + TABS.length) % TABS.length][0]);
  }

  _count() {
    return this.tab === 'quests' ? this.questRows().reduce((n, [, r]) => n + r.length, 0)
      : this.tab === 'notes' ? this.noteRows().length : this.tab === 'fish' ? this.fishRows().length : this.bestiaryRows().length;
  }

  _moveSel(d) {
    const n = this._count();
    if (!n) return;
    this.sel[this.tab] = (this.sel[this.tab] + d + n) % n;
    this.ui.sfx('ui_hover', { volume: 0.35 });
    this.render();
  }

  _track() {
    if (this.tab !== 'quests') return;
    const flat = this.questRows().flatMap(([, r]) => r);
    const q = flat[this.sel.quests];
    if (!q || q.state !== 'active') return;
    try { this.G.quests?.track?.(q.id); } catch { /* optional */ }
    this.render();
    this.ui.overlays.notify(`Tracking: ${q.title}`, 'quest');
  }

  _readNote() {
    if (this.tab !== 'notes') return;
    const r = this.noteRows()[this.sel.notes];
    if (r) this.ui.noteView.open({ ...r.info, id: r.id, preview: true });
  }

  _key(e) {
    if (e.repeat && !/Arrow|KeyW|KeyS/.test(e.code)) return true;
    const inp = this.G.input;
    if (inp.matches('journal', e.code)) { this.scr.close(); return true; }
    if (inp.matches('map', e.code)) { this.ui.openMap(); return true; }
    switch (e.code) {
      case 'Escape': this.scr.close(); return true;
      case 'KeyQ': case 'ArrowLeft': case 'KeyA': this._cycleTab(-1); return true;
      case 'KeyE': case 'ArrowRight': case 'KeyD': case 'Tab': this._cycleTab(1); return true;
      case 'KeyW': case 'ArrowUp': this._moveSel(-1); return true;
      case 'KeyS': case 'ArrowDown': this._moveSel(1); return true;
      case 'KeyT': this._track(); return true;
      case 'Enter': case 'NumpadEnter': if (this.tab === 'notes') this._readNote(); else this._track(); return true;
      case 'Digit1': this.setTab('quests'); return true;
      case 'Digit2': this.setTab('notes'); return true;
      case 'Digit3': this.setTab('bestiary'); return true;
      case 'Digit4': this.setTab('fish'); return true;
      default: return false;
    }
  }
}
