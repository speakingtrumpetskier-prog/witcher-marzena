// MARZENA UI entry. Builds G.ui (see docs/ARCHITECTURE.md "UI") out of the pieces in this folder:
//   overlays.js  subtitle, bark, notify, prompt, letterbox, fade, titleCard
//   hud.js       stat lines, sign selector, Thaw count, compass strip
//   choices.js   dialogue choices, hold prompt
//   note.js      readNote;  journal.js  quests / notes / bestiary;  map.js  painted map
//   menus.js     pause and settings;  title.js  title screen;  credits.js  credits
//
// Menus follow one rule: while a screen is open G.input.context is 'ui', the pointer lock is
// released and the clock is frozen; all of it is restored when the last screen closes.
//
// Public API (G.ui):
//   subtitle(speaker, text, seconds) -> Promise, bark(name, text, worldPos), notify(text, kind),
//   prompt(text | null), letterbox(on), fade(to, seconds) -> Promise, titleCard(title, sub) -> Promise,
//   choices(list, { timer, decisive }) -> Promise<index>, readNote(note) -> Promise,
//   hold(text, seconds, window) -> Promise<boolean>, openJournal(), openMap(), openPause(),
//   title() -> Promise<'new' | 'continue'>, credits() -> Promise, hud.show()/hide().
// Extras: registerNotes(map), registerBestiary(list), openSettings(), closeAll(), isOpen().
import './ui.css';
import './book.css';
import './menus.css';
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
    this.keyStack = [];
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
    this.titleScreen = new Title(G, this);
    this.creditsScreen = new Credits(G, this);

    window.addEventListener('keydown', (e) => this._keydown(e), true);
    document.addEventListener('pointerlockchange', () => this._lockChange());
    this._lastLocked = false;

    this._wireEvents();
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
    if (e.repeat || this.titleActive || this.G.input?.context !== 'game') return;
    if (e.code === 'KeyJ') { this.openJournal(); e.preventDefault(); } else if (e.code === 'KeyM') { this.openMap(); e.preventDefault(); } else if (e.code === 'Escape') { this.openPause(); e.preventDefault(); }
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
      if (G.input) G.input.context = c.context;
      if (G.time) G.time.frozen = c.frozen;
      if (c.locked && c.context === 'game') this.restoreLock();
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
    const handler = { onKey: onKey || (() => false), swallow };
    this.pushKeys(handler);
    if (contextual) this.enterMenu(name);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    let resolve;
    const closed = new Promise((r) => { resolve = r; });
    const scr = {
      name, el, closed, open: true,
      close: () => {
        if (!scr.open) return closed;
        scr.open = false;
        this.popKeys(handler);
        el.classList.remove('on');
        el.classList.add('leaving');
        if (contextual) this.exitMenu(name);
        try { onClose?.(); } catch (err) { console.error(err); }
        setTimeout(() => { el.remove(); resolve(); }, 420);
        return closed;
      },
    };
    return scr;
  }

  // ---- events -> notifications -------------------------------------------------------------
  _wireEvents() {
    const G = this.G;
    G.events.on('discover', ({ id }) => {
      const loc = LOC[id];
      if (loc?.map) this.overlays.notify(`New location: ${loc.name}`, 'location');
    });
    G.events.on('inventory', ({ item, n }) => {
      if (n > 0 && item === 'coins') this.overlays.notify(`+${n} grosze`, 'coin');
      else if (n > 0 && item === 'thaw') this.overlays.notify(`Thaw draught${n > 1 ? ` x${n}` : ''}`, 'item');
    });
    G.events.on('note', ({ id }) => {
      const n = this.noteInfo(id);
      if (n) this.overlays.notify(`Note: ${n.title}`, 'note');
    });
    G.events.on('game:ready', () => this.settings.apply());
  }

  // ---- content registries ------------------------------------------------------------------
  noteInfo(idOrObj) {
    if (!idOrObj) return null;
    if (typeof idOrObj === 'object') {
      const base = idOrObj.id ? this.notes[idOrObj.id] || this.notes[`note_${idOrObj.id}`] : null;
      return { ...(base || {}), ...idOrObj };
    }
    return this.notes[idOrObj] || this.notes[`note_${idOrObj}`] || null;
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
  closeAll() {
    this.journal.close(); this.mapView.close(); this.menus.closeAll(); this.noteView.close();
  }
  isOpen() { return this.menuOpen; }

  update(dt) {
    this.overlays.updateBarks(dt);
    this.hud.update(dt);
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
