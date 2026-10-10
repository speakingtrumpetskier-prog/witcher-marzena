// MARZENA UI entry. Builds G.ui (see docs/ARCHITECTURE.md "UI") out of the pieces in this folder:
//   overlays.js  subtitle, bark, notify, prompt, letterbox, fade, titleCard
//   hud.js       stat lines, sign selector, Thaw count, compass strip
//   choices.js   dialogue choices, hold prompt
//   note.js      readNote;  journal.js  quests / notes / bestiary;  map.js  painted map
//   menus.js     pause and settings;  title.js  title screen;  credits.js  credits
//   controls.js  keys, buttons, camera and controller settings;  hints.js  first-use hint cards (G.hints)
//   glyphs.js    keycaps and pad buttons drawn in SVG;  setrows.js  setting rows
//
// Menus follow one rule: while a screen is open G.input.context is 'ui', the pointer lock is
// released and the clock is frozen; all of it is restored when the last screen closes.
// A pad drives the menus through G.input.nav: buttons arrive as key events (see core/Input.js), and the
// journal and map get their own button mapping from _padNavKey below (a screen may also set scr.padKey, as the dice game does).
//
// Public API (G.ui):
//   subtitle(speaker, text, seconds) -> Promise, bark(name, text, worldPos), notify(text, kind),
//   prompt(text | null), letterbox(on), fade(to, seconds) -> Promise, titleCard(title, sub) -> Promise,
//   choices(list, { timer, decisive }) -> Promise<index>, readNote(note) -> Promise,
//   hold(text, seconds, window) -> Promise<boolean>, openJournal(), openMap(), openPause(),
//   title() -> Promise<'new' | 'continue'>, credits() -> Promise, hud.show()/hide().
// Extras: registerNotes(map), registerBestiary(list), openSettings(), openControls({ tab }), closeAll(), isOpen(),
//   clearSubtitle(), hideTitleCard(), skipRing(p), banner(name, sub), hint([[key, label]], seconds) (a story
//   card through G.hints; key names a default key and shows the player's real binding).
// Events emitted: ui:open, ui:close ({ name }), title:open, title:close. Listened: discover, inventory,
//   note, location:enter, game:ready.
import './ui.css';
import './book.css';
import './menus.css';
import './hints.css';
import './controls.css';
import { ORDER } from '../core/G.js';
import { h } from './dom.js';
import { Overlays } from './overlays.js';
import { Hud } from './hud.js';
import { Choices } from './choices.js';
import { NOTES, BESTIARY } from './content.js';
import { Settings } from './settings.js';
import { NoteView } from './note.js';
import { Journal } from './journal.js';
import { MapView } from './map.js';
import { Menus } from './menus.js';
import { Controls } from './controls.js';
import { Hints } from './hints.js';
import { Title } from './title.js';
import { Credits } from './credits.js';
import { LOC } from '../world/layout.js';

class UI {
  constructor(G) {
    this.G = G;
    this.root = document.getElementById('ui-root');
    if (!this.root) {
      this.root = h('div', { id: 'ui-root' });
      document.body.appendChild(this.root);
    }
    if (G.shot) this.root.classList.add('mz-shot');
    if (G.quality === 'low') this.root.classList.add('q-low');
    this.keyStack = [];
    this.screens = [];
    this.menuDepth = 0;
    this.menuOpen = false;
    this.titleActive = false;
    this.notes = { ...NOTES };
    this.bestiary = [...BESTIARY];
    this._unlockUntil = 0;
    this._wasLocked = false;
    this._relock = false;
    this._ctx = null;
    this.settings = new Settings(G);

    this.overlays = new Overlays(G, this.root);
    this.hud = new Hud(G, this.root, this);
    this.choicesUI = new Choices(G, this.root, this);
    this.noteView = new NoteView(G, this);
    this.journal = new Journal(G, this);
    this.mapView = new MapView(G, this);
    this.menus = new Menus(G, this);
    this.controls = new Controls(G, this);
    this.hints = new Hints(G, this);
    G.hints = this.hints;
    this.titleScreen = new Title(G, this);
    this.creditsScreen = new Credits(G, this);

    window.addEventListener('keydown', (e) => this._keydown(e), true);
    // A pad's buttons become key events while a screen or a choice list wants keys.
    if (G.input) {
      G.input.nav = {
        // Photo mode reads the pad itself (sticks fly the camera), so it is not a menu here.
        active: () => (this.menuOpen || this.keyStack.length > 0) && !G.photoMode?.active,
        key: (btn) => this._padNavKey(btn),
      };
    }
    document.addEventListener('pointerlockchange', () => this._lockChange());
    this._lastLocked = false;

    this._wireEvents();
  }

  // Optional UI sounds; unknown names or a missing audio module are ignored.
  sfx(name, opts) {
    try { this.G.audio?.sfx?.(name, opts); } catch { /* optional */ }
  }

  // ---- key dispatch ------------------------------------------------------------------------
  pushKeys(handler) { this.keyStack.push(handler); }
  popKeys(handler) {
    const i = this.keyStack.indexOf(handler);
    if (i >= 0) this.keyStack.splice(i, 1);
  }

  _keydown(e) {
    const top = this.keyStack[this.keyStack.length - 1];
    if (top) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
      let handled = false;
      try { handled = top.onKey(e); } catch (err) { console.error('[ui key]', err); }
      if (handled) {
        e.preventDefault();
        if (top.swallow) e.stopImmediatePropagation();
      }
      return;
    }
    if (e.repeat || this.titleActive || this.G.input?.context !== 'game' || this.G.story?.busy) return;
    const inp = this.G.input;
    if (inp.matches('journal', e.code)) { this.openJournal(); e.preventDefault(); } else if (inp.matches('map', e.code)) { this.openMap(); e.preventDefault(); } else if (inp.matches('pause', e.code)) { this.openPause(); e.preventDefault(); } else if (inp.matches('photo', e.code) && this.G.photoMode?.canEnter()) { this.G.photoMode.enter(); e.preventDefault(); }
  }

  // Which key a pad button stands for on the screen on top. null: the default (A confirms, B backs out, the
  // D-pad and left stick are the arrows, LB and RB the tabs).
  _padNavKey(btn) {
    const inp = this.G.input;
    const scr = this.screens[this.screens.length - 1];
    const top = scr?.name;
    // A screen can map buttons itself: scr.padKey(btn) returns a key code, null for nothing, undefined for the defaults.
    if (scr?.padKey) { const c = scr.padKey(btn); if (c !== undefined) return c; }
    const key = (a) => inp.codesFor(a, 'kbm')[0] || null;
    if (top === 'journal') {
      if (btn === 'PadX') return key('map');
      if (btn === 'PadBack') return key('journal');
      if (btn === 'PadRB') return 'KeyE';
    } else if (top === 'map') {
      if (btn === 'PadX') return 'Space';
      if (btn === 'PadY') return key('journal');
      if (btn === 'PadBack') return key('map');
      if (btn === 'PadLB') return 'KeyQ';
      if (btn === 'PadRB') return 'KeyE';
    }
    return null;
  }

  // The pad opens the pause menu, journal and map in play; keys do it through _keydown.
  _padMenus() {
    const inp = this.G.input;
    if (!inp || this.titleActive || inp.context !== 'game' || this.G.story?.busy || this.keyStack.length) return;
    if (inp.padPressed('pause')) this.openPause();
    else if (inp.padPressed('journal')) this.openJournal();
    else if (inp.padPressed('map')) this.openMap();
  }

  // ---- context, time and pointer lock ------------------------------------------------------
  releaseLock() {
    const inp = this.G.input;
    if (inp?.locked) {
      this._unlockUntil = performance.now() + 700;
      inp.exitLock();
    }
  }
  restoreLock() {
    try { this.G.input?.requestLock(); } catch { /* needs a gesture; the player clicks instead */ }
  }

  enterMenu(name) {
    const G = this.G;
    if (this.menuDepth === 0) {
      this._ctx = {
        context: G.input?.context ?? 'game',
        locked: !!G.input?.locked || this._relock,
        frozen: G.time?.frozen ?? false,
      };
      this._relock = false;
      if (G.input) G.input.context = 'ui';
      if (G.time) G.time.frozen = true;
      this.releaseLock();
      this.menuOpen = true;
      G.events.emit('ui:open', { name });
    }
    this.menuDepth++;
  }

  exitMenu(name) {
    const G = this.G;
    this.menuDepth = Math.max(0, this.menuDepth - 1);
    if (this.menuDepth > 0) return;
    const c = this._ctx;
    this._ctx = null;
    this.menuOpen = false;
    if (c) {
      // Only undo what we did: if a story flow already moved the context on, leave it alone, and
      // never hand back 'ui' (the title screen opens while the flow holds the context at 'ui').
      if (G.input && G.input.context === 'ui') G.input.context = c.context === 'ui' ? 'game' : c.context;
      if (G.time) G.time.frozen = c.frozen;
      if (c.locked && G.input?.context === 'game') this.restoreLock();
    }
    G.events.emit('ui:close', { name });
  }

  // Pointer lock lost while playing (Esc is swallowed by the browser): treat it as "pause".
  _lockChange() {
    const G = this.G;
    const locked = document.pointerLockElement === G.renderer?.domElement;
    const lost = this._lastLocked && !locked;
    this._lastLocked = locked;
    if (!lost || performance.now() < this._unlockUntil) return;
    if (G.input?.context !== 'game' || this.menuOpen || this.choicesUI.active || this.overlays.lbOn || this.titleActive) return;
    if (G.player?.state === 'scripted' || G.player?.state === 'dead') return;
    this._relock = true;
    this.openPause();
  }

  // Open a full-screen modal element. Returns { close(), closed: Promise }.
  openScreen({ name, el, onKey, swallow = false, onClose, contextual = true }) {
    el.classList.add('mz-modal');
    this.root.appendChild(el);
    // The screen below (pause under journal, title under settings) steps out of sight.
    const below = this.screens[this.screens.length - 1];
    below?.el.classList.add('under');
    const handler = { onKey: onKey || (() => false), swallow };
    this.pushKeys(handler);
    if (contextual) this.enterMenu(name);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    if (name !== 'title' && name !== 'credits') this.sfx(name === 'note' || name === 'journal' ? 'page_turn' : 'ui_open', { volume: 0.5 });
    let resolve;
    const closed = new Promise((r) => { resolve = r; });
    const scr = {
      name, el, closed, open: true,
      close: () => {
        if (!scr.open) return closed;
        scr.open = false;
        const si = this.screens.indexOf(scr);
        if (si >= 0) this.screens.splice(si, 1);
        this.screens[this.screens.length - 1]?.el.classList.remove('under');
        this.popKeys(handler);
        el.classList.remove('on');
        el.classList.add('leaving');
        if (contextual) this.exitMenu(name);
        if (name !== 'title' && name !== 'credits') this.sfx('ui_close', { volume: 0.4 });
        try { onClose?.(); } catch (err) { console.error(err); }
        setTimeout(() => { el.remove(); resolve(); }, 420);
        return closed;
      },
    };
    this.screens.push(scr);
    return scr;
  }

  // ---- events -> notifications -------------------------------------------------------------
  _wireEvents() {
    const G = this.G;
    G.events.on('discover', ({ id }) => {
      const loc = LOC[id];
      if (!loc?.map) return;
      this.overlays.notify(`New location: ${loc.name}`, 'location');
      const now = performance.now();
      if (now - (this._lastStinger || -1e9) > 3000) {
        this._lastStinger = now;
        try { G.audio?.stinger?.('discover'); } catch { /* optional */ }
      }
    });
    G.events.on('inventory', ({ item, n, quiet }) => {
      if (quiet) return;
      if (n > 0 && item === 'coins') this.overlays.notify(`+${n} grosze`, 'coin');
      else if (n > 0 && item === 'thaw') this.overlays.notify(`Thaw draught${n > 1 ? ` x${n}` : ''}`, 'item');
    });
    G.events.on('note', ({ id }) => {
      const n = this.noteInfo(id);
      if (n) this.overlays.notify(`Note: ${n.title}`, 'note');
    });
    // Entering a named place: a quiet banner, once per place every two minutes, never over a scene.
    this._seenPlace = new Map();
    G.events.on('location:enter', (p) => {
      const loc = LOC[p?.id] || p?.loc || p || {};
      const name = loc.name || p?.name;
      if (!name || (p?.id && LOC[p.id] && !LOC[p.id].map && p.id !== 'village')) return;
      const now = performance.now();
      if (now - (this._seenPlace.get(name) ?? -1e9) < 120000) return;
      if (this.menuOpen || this.overlays.lbOn || G.story?.busy || G.input?.context !== 'game') return;
      this._seenPlace.set(name, now);
      this.overlays.banner(name, p?.sub || '');
    });
    G.events.on('game:ready', () => this.settings.apply());
  }

  // ---- content registries ------------------------------------------------------------------
  // Notes the story passes inline ({ id, title, text }) are kept in the save so the Notes tab can
  // still show them after a reload.
  noteInfo(idOrObj) {
    if (!idOrObj) return null;
    const saved = (id) => this.G.state?.data?.uiNotes?.[id] || null;
    if (typeof idOrObj === 'object') {
      const id = idOrObj.id;
      const base = id ? this.notes[id] || this.notes[`note_${id}`] || saved(id) : null;
      return { ...(base || {}), ...idOrObj };
    }
    return this.notes[idOrObj] || this.notes[`note_${idOrObj}`] || saved(idOrObj) || null;
  }

  rememberNote(info) {
    const d = this.G.state?.data;
    if (!d || !info?.id || !info.text || this.notes[info.id] || this.notes[`note_${info.id}`]) return;
    (d.uiNotes ||= {})[info.id] = { title: info.title, text: info.text, kind: info.kind, where: info.where, sign: info.sign };
  }

  // ---- screens -----------------------------------------------------------------------------
  _closeSiblings(except) {
    if (except !== 'journal' && this.journal.isOpen) this.journal.close();
    if (except !== 'map' && this.mapView.isOpen) this.mapView.close();
  }
  // Open the new screen before closing its sibling so the menu depth never touches zero (no
  // context flicker or pointer-lock round trip when switching between journal and map).
  openJournal(opts) { const p = this.journal.open(opts); this._closeSiblings('journal'); return p; }
  openMap(opts) { const p = this.mapView.open(opts); this._closeSiblings('map'); return p; }
  openPause() { return this.menus.openPause(); }
  openSettings() { return this.menus.openSettings(); }
  openControls(opts) { return this.menus.openControls(opts); }
  closeAll() {
    this.journal.close(); this.mapView.close(); this.menus.closeAll(); this.noteView.close();
  }
  isOpen() { return this.menuOpen; }

  update(dt) {
    this._padMenus();
    this.overlays.updateBarks(dt);
    this.hud.update(dt);
    this.hints.update(dt);
    this.choicesUI.update(dt);
    this.titleScreen.update(dt);
    this.creditsScreen.update(dt);
  }
}

export async function init(G) {
  const ui = new UI(G);
  G.uiImpl = ui;
  const o = ui.overlays;
  G.ui = {
    subtitle: (...a) => o.subtitle(...a),
    clearSubtitle: () => o.clearSubtitle(),
    hideTitleCard: () => o.hideTitleCard(),
    skipRing: (p) => o.skipRing(p),
    banner: (...a) => o.banner(...a),
    hint: (...a) => o.hint(...a),
    drivesTitleCamera: true,
    bark: (...a) => o.bark(...a),
    notify: (...a) => o.notify(...a),
    prompt: (...a) => o.prompt(...a),
    letterbox: (...a) => o.letterbox(...a),
    fade: (...a) => o.fade(...a),
    titleCard: (...a) => o.titleCard(...a),
    choices: (...a) => ui.choicesUI.choices(...a),
    readNote: (n) => ui.noteView.open(n),
    hold: (...a) => ui.choicesUI.hold(...a),
    openJournal: (o2) => ui.openJournal(o2),
    openMap: (o2) => ui.openMap(o2),
    openPause: () => ui.openPause(),
    openSettings: () => ui.openSettings(),
    openControls: (o2) => ui.openControls(o2),
    title: (o2) => ui.titleScreen.open(o2),
    credits: (o2) => ui.creditsScreen.open(o2),
    hud: { show: () => ui.hud.show(), hide: () => ui.hud.hide() },
    registerNotes: (map) => Object.assign(ui.notes, map),
    registerBestiary: (list) => { for (const e of list) { const i = ui.bestiary.findIndex((b) => b.id === e.id); if (i >= 0) ui.bestiary[i] = e; else ui.bestiary.push(e); } },
    closeAll: () => ui.closeAll(),
    isOpen: () => ui.menuOpen,
    settings: ui.settings,
  };
  G.addSystem('ui', (dt) => ui.update(dt), ORDER.late);
}
