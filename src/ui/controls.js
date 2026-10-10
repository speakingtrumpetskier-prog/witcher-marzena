// The Controls screen: every action with its keyboard and mouse bindings (two slots) and its pad button, rebinding
// with conflict handling, the camera settings and the controller settings. Reached from Settings (title and
// pause) and from the pause menu. G.ui.openControls({ tab }) opens it, tab: 'bindings' | 'camera' | 'controller'.
//
// Keyboard and pad work everywhere (pads arrive as key events, see core/Input.js): Up and Down pick a row, Left
// and Right a column, Enter (A) rebinds, Delete (X) clears a slot, Q and E (LB and RB) switch tabs, Esc (B) goes
// back. Mouse: hover, click a cell to rebind, click a tab.
// Rebinding: the next key or mouse button (keyboard cells) or pad button (pad cell) is taken; Esc cancels. A code
// another action already uses in the same context asks: Swap, Replace or Cancel. Reserved codes (Esc, Start) refuse.
import { h, svg, clear } from './dom.js';
import { gwiazda, strip } from './wycinanki.js';
import { ICON } from './icons.js';
import { ACTIONS, GROUPS, ACTION, codeLabel, isPad, padLabel } from '../core/bindings.js';
import { codeGlyph, lookGlyph, moveGlyph, hintBar, navGlyph } from './glyphs.js';
import { RowList } from './setrows.js';
import { SCHEMA, CAMERA_KEYS } from './settings.js';

const TABS = [['bindings', 'Bindings'], ['camera', 'Camera'], ['controller', 'Controller']];
const LISTEN_SECONDS = 12;
// Pad glyphs that carry their own name; the rest get a word beside them.
const SELF_NAMED = new Set(['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT']);
const MOUSE_WORDS = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click' };
const BASE_FOV = 54;

export class Controls {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.scr = null;
  }

  open({ tab = 'bindings' } = {}) {
    if (this.scr?.open) return this.scr.closed;
    const G = this.G, ui = this.ui;
    this.tab = TABS.some(([id]) => id === tab) ? tab : 'bindings';
    this.items = [];
    this.fixedRows = [];
    this.cur = { r: 0, c: 0 };
    this.listening = null;
    this.prompt = null;
    this.list = null;

    this.tabEls = TABS.map(([id, label]) => {
      const b = h('button', { class: 'ctl-tab', type: 'button', tabindex: '-1' }, label);
      b.addEventListener('click', () => this._setTab(id));
      return [id, b];
    });
    this.body = h('div', { class: 'ctl-body' });
    this.status = h('div', { class: 'ctl-status' });
    this.askBar = h('div', { class: 'ctl-ask' });
    this.foot = h('div', { class: 'ctl-foot' });
    const back = h('button', { class: 'mz-back', type: 'button', tabindex: '-1' }, svg(ICON.knot), h('span', null, 'Back'));
    back.addEventListener('click', () => this.scr.close());
    this.panel = h('div', { class: 'ctl-panel' },
      h('div', { class: 'ctl-border' }, strip(9, { w: 900, h: 14, color: '#b23b2b' })),
      h('div', { class: 'ctl-head' }, gwiazda(23, { size: 44, color: '#c4402f', cls: 'ctl-rosette' }), h('div', { class: 'tt' }, h('h2', null, 'Controls'), h('div', { class: 'thread' }))),
      h('div', { class: 'ctl-tabs' }, ...this.tabEls.map(([, b]) => b)),
      this.body, this.status, this.askBar,
      h('div', { class: 'ctl-bottom' }, this.foot, back));
    const el = h('div', { class: 'mz-controls' }, this.panel);

    this._onChange = () => { if (this.tab === 'bindings') this._refreshAll(); else this._padStatus?.(); };
    for (const n of ['input:bindings', 'input:pad', 'settings']) G.events.on(n, this._onChange);
    this._mouse = (e) => this._mouseDown(e);
    this.panel.addEventListener('mousedown', this._mouse, true);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());

    this.scr = ui.openScreen({
      name: 'controls', el, swallow: true,
      onKey: (e) => this._key(e),
      onClose: () => {
        this._stopListening();
        for (const n of ['input:bindings', 'input:pad', 'settings']) G.events.off(n, this._onChange);
      },
    });
    this._setTab(this.tab);
    return this.scr.closed;
  }

  // ---- tabs ----------------------------------------------------------------------------------------
  _setTab(id) {
    if (this.listening) this._stopListening();
    this._closeAsk();
    this.tab = id;
    this.tabEls.forEach(([tid, b]) => b.classList.toggle('on', tid === id));
    clear(this.body);
    this.items = [];
    this.list = null;
    this._padStatus = null;
    this.say('');
    if (id === 'bindings') this._buildBindings();
    else if (id === 'camera') this._buildCamera();
    else this._buildController();
    this._footer();
    this.ui.sfx('page_turn', { volume: 0.3 });
  }

  _cycleTab(d) {
    const i = TABS.findIndex(([id]) => id === this.tab);
    this._setTab(TABS[(i + d + TABS.length) % TABS.length][0]);
  }

  _footer() {
    const G = this.G;
    const items = this.tab === 'bindings'
      ? [['updown', 'Select'], ['leftright', 'Column'], ['confirm', 'Rebind'], ['clear', 'Clear'], ['tabs', 'Tabs'], ['back', 'Back']]
      : [['updown', 'Select'], ['leftright', 'Change'], ['tabs', 'Tabs'], ['back', 'Back']];
    clear(this.foot).appendChild(hintBar(G, items));
  }

  say(text, kind = '') {
    this.status.textContent = text;
    this.status.className = `ctl-status${kind ? ` ${kind}` : ''}`;
  }

  // ---- bindings tab ------------------------------------------------------------------------------------
  _buildBindings() {
    const head = h('div', { class: 'ctl-cols' }, h('span', null, 'Action'), h('span', { class: 'c1' }, 'Keyboard and mouse'), h('span', { class: 'c3' }, 'Controller'));
    const list = h('div', { class: 'ctl-list' });
    this.body.append(head, list);
    this.fixedRows = [];

    for (const group of GROUPS) {
      list.appendChild(h('div', { class: 'ctl-group' }, group));
      for (const a of ACTIONS.filter((x) => x.group === group)) list.appendChild(this._actionRow(a));
      if (group === 'Camera') list.append(...this._infoRows());
    }
    const restore = h('button', { class: 'ctl-restore', type: 'button', tabindex: '-1' }, 'Restore all defaults');
    const item = { kind: 'restore', el: restore, cells: [restore] };
    this.items.push(item);
    restore.addEventListener('mouseenter', () => { if (!this.listening && !this.prompt) { this.cur = { r: this.items.indexOf(item), c: 0 }; this._paintCursor(); } });
    restore.addEventListener('click', () => {
      if (this.listening || this.prompt) return;
      this.cur = { r: this.items.indexOf(item), c: 0 };
      this._paintCursor();
      this._restoreAsk();
    });
    list.appendChild(h('div', { class: 'ctl-restore-row' }, restore));
    this.cur = { r: 0, c: 0 };
    this._refreshAll();
    this._paintCursor();
  }

  _actionRow(a) {
    const mk = (kind, slot) => h('button', { class: `ctl-cell ${kind}`, type: 'button', tabindex: '-1', 'data-kind': kind, 'data-slot': slot });
    const k0 = mk('kbm', 0), k1 = mk('kbm', 1), pd = mk('pad', 0);
    const rs = h('button', { class: 'ctl-reset', type: 'button', tabindex: '-1', title: 'Restore this action' }, svg('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8a4.6 4.6 0 1 0 1.5-3.4M3 2.4v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
    const rowEl = h('div', { class: `ctl-row${a.fixed ? ' fixed' : ''}` }, h('span', { class: 'ctl-lab' }, a.label), k0, k1, pd, rs);
    const cells = [k0, k1, pd, rs];
    // Rows the player cannot change (the pause menu, dialogue) are shown but never focused.
    if (a.fixed) { this.fixedRows.push({ a, cells }); return rowEl; }
    const item = { kind: 'action', a, el: rowEl, cells };
    this.items.push(item);
    cells.forEach((cell, c) => {
      cell.addEventListener('mouseenter', () => { if (!this.listening && !this.prompt) { this.cur = { r: this.items.indexOf(item), c }; this._paintCursor(); } });
      cell.addEventListener('click', () => {
        if (this.listening || this.prompt) return;
        this.cur = { r: this.items.indexOf(item), c };
        this._paintCursor();
        this._activate();
      });
    });
    return rowEl;
  }

  // Look, zoom and target switching are not bindings, but the player should see them.
  _infoRows() {
    const G = this.G;
    const row = (label, kbm, pad) => h('div', { class: 'ctl-row info' }, h('span', { class: 'ctl-lab' }, label),
      h('span', { class: 'ctl-cell kbm static' }, kbm), h('span', { class: 'ctl-cell kbm static' }), h('span', { class: 'ctl-cell pad static' }, pad), h('span'));
    const txt = (t) => h('span', { class: 'nm' }, t);
    return [
      row('Look around', [lookGlyph(G, 'kbm'), txt('Mouse')], [lookGlyph(G, 'pad'), txt('Right stick')]),
      row('Zoom', [txt('Mouse wheel')], [txt('Camera tab')]),
      row('Switch target while locked on', [lookGlyph(G, 'kbm'), txt('Flick sideways')], [lookGlyph(G, 'pad'), txt('Flick sideways')]),
    ];
  }

  _cellContent(a, kind, slot) {
    const input = this.G.input, style = input.padStyle;
    if (kind === 'pad' && a.stick) return [moveGlyph(this.G, 'pad'), h('span', { class: 'nm' }, a.stick)];
    const code = input.codesFor(a.id, kind)[slot];
    if (!code) {
      const none = kind === 'kbm' && slot === 1 && input.codesFor(a.id, 'kbm').length ? 'Add another' : 'Unbound';
      return [h('span', { class: 'ctl-none' }, none)];
    }
    const word = isPad(code) ? (SELF_NAMED.has(code) ? null : padLabel(code, style)) : MOUSE_WORDS[code];
    return [codeGlyph(code, style), word ? h('span', { class: 'nm' }, word) : null];
  }

  _refreshAll() {
    if (this.tab !== 'bindings') return;
    const input = this.G.input;
    const all = [...this.items.filter((i) => i.kind === 'action'), ...this.fixedRows];
    for (const it of all) {
      const a = it.a;
      const [k0, k1, pd, rs] = it.cells;
      const stickOnly = !!a.stick;
      for (const [cell, kind, slot] of [[k0, 'kbm', 0], [k1, 'kbm', 1], [pd, 'pad', 0]]) {
        if (this.listening && this.listening.cell === cell) continue;
        clear(cell).append(...this._cellContent(a, kind, slot).filter(Boolean));
        cell.classList.toggle('empty', !input.codesFor(a.id, kind)[slot] && !(kind === 'pad' && stickOnly));
        cell.classList.toggle('stick', kind === 'pad' && stickOnly);
      }
      const changed = !(input.isDefault(a.id, 'kbm') && input.isDefault(a.id, 'pad'));
      rs.classList.toggle('show', changed && !a.fixed);
    }
  }

  // Columns the focused row can use: both key slots, the pad button (not for the stick), and reset when it changed.
  _cols(item) {
    if (item.kind === 'restore') return [0];
    const cols = [0, 1];
    if (!item.a.stick) cols.push(2);
    if (item.cells[3].classList.contains('show')) cols.push(3);
    return cols;
  }

  _paintCursor() {
    this.items.forEach((it, r) => {
      it.cells.forEach((cell, c) => cell.classList.toggle('cur', r === this.cur.r && c === this.cur.c));
      if (it.kind === 'action') it.el.classList.toggle('focus', r === this.cur.r);
    });
    this.items[this.cur.r]?.el.scrollIntoView?.({ block: 'nearest' });
  }

  _move(dr, dc) {
    if (this.listening || this.prompt || !this.items.length) return;
    let { r, c } = this.cur;
    if (dr) {
      r = (r + dr + this.items.length) % this.items.length;
      const cols = this._cols(this.items[r]);
      c = cols.includes(c) ? c : cols.reduce((best, x) => (Math.abs(x - c) < Math.abs(best - c) ? x : best), cols[0]);
    } else {
      const cols = this._cols(this.items[r]);
      const i = cols.indexOf(c);
      c = cols[Math.max(0, Math.min(cols.length - 1, (i < 0 ? 0 : i) + dc))];
    }
    this.cur = { r, c };
    this._paintCursor();
    this.ui.sfx('ui_hover', { volume: 0.3 });
  }

  _activate() {
    const it = this.items[this.cur.r];
    if (!it) return;
    if (it.kind === 'restore') { this._restoreAsk(); return; }
    const c = this.cur.c;
    if (c === 3) {
      this.G.input.reset(it.a.id);
      this.ui.sfx('ui_select', { volume: 0.5 });
      this.say(`${it.a.label} restored to its defaults.`);
      this.cur.c = 0;
      this._refreshAll();
      this._paintCursor();
      return;
    }
    this._listen(it, c);
  }

  _clearCell() {
    const it = this.items[this.cur.r];
    if (!it || it.kind !== 'action' || this.cur.c > 2) return;
    const kind = this.cur.c === 2 ? 'pad' : 'kbm', slot = this.cur.c === 2 ? 0 : this.cur.c;
    if (this.G.input.unbind(it.a.id, kind, slot)) {
      this.ui.sfx('ui_close', { volume: 0.4 });
      this.say(`${it.a.label}: cleared.`);
      this._refreshAll();
    }
  }

  // ---- rebinding ---------------------------------------------------------------------------------------
  _listen(item, col) {
    const input = this.G.input;
    const kind = col === 2 ? 'pad' : 'kbm', slot = col === 2 ? 0 : col;
    if (kind === 'pad' && !input.padConnected) {
      this.say('No controller found. Press a button on it, then try again.', 'warn');
      return;
    }
    this._stopListening();
    const cell = item.cells[col];
    const L = { item, a: item.a, kind, slot, cell, since: performance.now(), timer: 0, cancelPad: null };
    this.listening = L;
    cell.classList.add('listening');
    clear(cell).append(h('span', { class: 'ctl-listen' }, kind === 'pad' ? 'Press a button' : 'Press a key'));
    this.say(kind === 'pad'
      ? `New button for ${item.a.label}. Menu cancels.`
      : `New key or mouse button for ${item.a.label}. Esc cancels.`, 'listen');
    L.timer = setTimeout(() => { if (this.listening === L) { this._stopListening(); this.say('Cancelled.'); } }, LISTEN_SECONDS * 1000);
    if (kind === 'pad') {
      L.cancelPad = input.capturePad((btn) => {
        if (this.listening !== L) return;
        if (btn === 'PadStart') { this._stopListening(); this.say('Cancelled.'); } else this._assign(btn);
      });
    }
    this.ui.sfx('ui_hover', { volume: 0.4 });
  }

  _stopListening() {
    const L = this.listening;
    if (!L) return;
    this.listening = null;
    clearTimeout(L.timer);
    L.cancelPad?.();
    L.cell.classList.remove('listening');
    this._refreshAll();
  }

  _assign(code) {
    const L = this.listening;
    if (!L) return;
    const input = this.G.input;
    const r = input.bind(L.a.id, L.kind, L.slot, code);
    if (r.ok) {
      this._stopListening();
      this.ui.sfx('ui_select', { volume: 0.5 });
      this.say(`${L.a.label}: ${codeLabel(code, input.padStyle)}.`, 'ok');
      this._refreshAll();
      return;
    }
    if (r.reason === 'reserved') {
      this._stopListening();
      this.say(`${codeLabel(code, input.padStyle)} is kept for the game and cannot be used.`, 'warn');
      return;
    }
    // Another action already has it.
    this._stopListening();
    const names = [...new Set(r.conflicts.map((c) => ACTION[c.action].label))].join(' and ');
    const old = input.codesFor(L.a.id, L.kind)[L.slot];
    const opts = [];
    if (old) opts.push({ label: 'Swap', hint: `${names} takes ${codeLabel(old, input.padStyle)}`, fn: () => this._resolve(L, code, 'swap') });
    opts.push({ label: 'Replace', hint: `${names} loses it`, fn: () => this._resolve(L, code, 'steal') });
    opts.push({ label: 'Cancel', fn: () => this.say('Cancelled.') });
    this._ask(`${codeLabel(code, input.padStyle)} is already used for ${names}.`, opts);
  }

  _resolve(L, code, mode) {
    const input = this.G.input;
    input.bind(L.a.id, L.kind, L.slot, code, mode);
    this.ui.sfx('ui_select', { volume: 0.5 });
    this.say(`${L.a.label}: ${codeLabel(code, input.padStyle)}.`, 'ok');
    this._refreshAll();
  }

  _restoreAsk() {
    this._ask('Put every key and button back to its default?', [
      { label: 'Restore defaults', fn: () => { this.G.input.reset(); this.say('All bindings restored.', 'ok'); this._refreshAll(); } },
      { label: 'Keep mine', fn: () => {} },
    ]);
  }

  // A line with a few choices under the list.
  _ask(text, options) {
    this.prompt = { options, sel: 0 };
    clear(this.askBar);
    this.askBar.classList.add('on');
    const btns = options.map((o, i) => {
      const b = h('button', { class: 'ask-opt', type: 'button', tabindex: '-1', title: o.hint || '' }, o.label);
      b.addEventListener('click', () => this._pick(i));
      b.addEventListener('mouseenter', () => { this.prompt.sel = i; this._paintAsk(); });
      return b;
    });
    this.askBtns = btns;
    this.askBar.append(h('span', { class: 'ask-text' }, text), h('span', { class: 'ask-opts' }, ...btns));
    this._paintAsk();
    this.say('');
    this.ui.sfx('ui_hover', { volume: 0.4 });
  }

  _paintAsk() { this.askBtns?.forEach((b, i) => b.classList.toggle('sel', i === this.prompt?.sel)); }
  _closeAsk() { this.prompt = null; this.askBar.classList.remove('on'); clear(this.askBar); }
  _pick(i) {
    const p = this.prompt;
    if (!p) return;
    this._closeAsk();
    p.options[i].fn();
  }

  // ---- camera and controller tabs ---------------------------------------------------------------------
  _rows() {
    const list = new RowList({ sfx: (n) => this.ui.sfx(n, { volume: 0.3 }) });
    this.list = list;
    return list;
  }

  _buildCamera() {
    const G = this.G, S = this.ui.settings;
    const list = this._rows();
    const fmt2 = (v) => v.toFixed(2);
    list.group('Mouse');
    list.slider('Look speed, horizontal', () => S.mouseSensX, (v) => S.set('mouseSensX', v), { min: SCHEMA.mouseSensX.min, max: SCHEMA.mouseSensX.max, step: 0.05, fmt: fmt2 });
    list.slider('Look speed, vertical', () => S.mouseSensY, (v) => S.set('mouseSensY', v), { min: SCHEMA.mouseSensY.min, max: SCHEMA.mouseSensY.max, step: 0.05, fmt: fmt2 });
    list.group('Look direction');
    list.toggle('Invert horizontal look', () => S.invertX, (v) => S.set('invertX', v));
    list.toggle('Invert vertical look', () => S.invertY, (v) => S.set('invertY', v));
    list.group('Camera');
    list.slider('Field of view', () => S.fovOffset, (v) => S.set('fovOffset', Math.round(v)), { min: SCHEMA.fovOffset.min, max: SCHEMA.fovOffset.max, step: 1, fmt: (v) => `${BASE_FOV + Math.round(v)} degrees` });
    list.slider('Camera distance', () => S.camDist, (v) => S.set('camDist', v), { min: SCHEMA.camDist.min, max: SCHEMA.camDist.max, step: 0.05, fmt: (v) => `${(3.5 * v).toFixed(1)} m` });
    list.segmented('Camera side', [['right', 'Right shoulder'], ['left', 'Left shoulder']], () => S.shoulder, (v) => S.set('shoulder', v), (n) => {
      clear(n).append(navKey(G, 'shoulder'), ' swaps it while you play');
    });
    list.segmented('Recenter behind you', [['auto', 'Auto'], ['off', 'Off'], ['gentle', 'Gentle'], ['strong', 'Strong']], () => S.recenter, (v) => S.set('recenter', v), (n) => {
      n.textContent = S.recenter === 'auto' ? 'Gentle with a controller, off with a mouse.' : 'Swings the camera behind you while you move and are not looking around.';
    });
    list.group('Hints');
    list.toggle('Show hints', () => S.hints, (v) => S.set('hints', v));
    list.button('Hints already shown', 'Show them all again', () => {
      G.hints?.reset();
      this.ui.overlays.notify('Hints will show again', 'info');
    });
    list.group('Defaults');
    list.button('Camera settings', 'Restore defaults', () => {
      S.reset(CAMERA_KEYS);
      list.rows.forEach((r) => r.repaint?.());
      this.ui.overlays.notify('Camera settings restored', 'info');
    });
    this.body.appendChild(list.el);
    list.setFocus(0);
  }

  _buildController() {
    const G = this.G, S = this.ui.settings;
    const list = this._rows();
    const stat = h('div', { class: 'ctl-padstat' });
    const paint = () => {
      const inp = G.input;
      clear(stat);
      if (inp.padConnected) {
        stat.append(navGlyph(G, 'confirm', 'pad'), h('span', null, `${inp.padName.replace(/\s*\(.*$/, '') || 'Controller'} is connected.`));
      } else stat.append(h('span', null, 'No controller found. Press a button on it and it will appear here.'));
    };
    this._padStatus = paint;
    paint();
    this.body.append(stat);
    const fmt2 = (v) => v.toFixed(2);
    list.group('Right stick look');
    list.slider('Look speed, horizontal', () => S.padSensX, (v) => S.set('padSensX', v), { min: SCHEMA.padSensX.min, max: SCHEMA.padSensX.max, step: 0.05, fmt: fmt2 });
    list.slider('Look speed, vertical', () => S.padSensY, (v) => S.set('padSensY', v), { min: SCHEMA.padSensY.min, max: SCHEMA.padSensY.max, step: 0.05, fmt: fmt2 });
    list.toggle('Faster the longer you hold', () => S.padRamp, (v) => S.set('padRamp', v));
    list.slider('Stick dead zone', () => S.padDeadzone, (v) => S.set('padDeadzone', v), { min: SCHEMA.padDeadzone.min, max: SCHEMA.padDeadzone.max, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` });
    list.group('Feedback');
    list.toggle('Vibration', () => S.rumble, (v) => { S.set('rumble', v); if (v) G.input.rumble(0.4, 0.6, 180); });
    list.segmented('Button icons', [['auto', 'Automatic'], ['xbox', 'Xbox'], ['playstation', 'PlayStation']], () => S.padStyle, (v) => S.set('padStyle', v));
    this.body.appendChild(list.el);
    list.setFocus(0);
  }

  // ---- keys and mouse ---------------------------------------------------------------------------------
  _key(e) {
    if (this.listening) {
      if (e.repeat) return true;
      if (e.code === 'Escape') { this._stopListening(); this.say('Cancelled.'); return true; }
      if (this.listening.kind === 'kbm' && e.code && e.code !== 'Unidentified') this._assign(e.code);
      return true;
    }
    if (this.prompt) {
      const p = this.prompt;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': p.sel = (p.sel + p.options.length - 1) % p.options.length; this._paintAsk(); return true;
        case 'ArrowRight': case 'KeyD': case 'Tab': p.sel = (p.sel + 1) % p.options.length; this._paintAsk(); return true;
        case 'Enter': case 'NumpadEnter': case 'Space': case 'KeyE': if (!e.repeat) this._pick(p.sel); return true;
        case 'Escape': case 'Backspace': if (!e.repeat) this._pick(p.options.length - 1); return true;
        default: return true;
      }
    }
    if (e.code === 'Escape' || e.code === 'Backspace') { if (!e.repeat) this.scr.close(); return true; }
    if (e.code === 'KeyQ') { if (!e.repeat) this._cycleTab(-1); return true; }
    if (e.code === 'KeyE' || e.code === 'Tab') { if (!e.repeat) this._cycleTab(e.shiftKey ? -1 : 1); return true; }
    if (this.tab !== 'bindings') return this.list.key(e);
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this._move(-1, 0); return true;
      case 'KeyS': case 'ArrowDown': this._move(1, 0); return true;
      case 'KeyA': case 'ArrowLeft': this._move(0, -1); return true;
      case 'KeyD': case 'ArrowRight': this._move(0, 1); return true;
      case 'Enter': case 'NumpadEnter': case 'Space': if (!e.repeat) this._activate(); return true;
      case 'Delete': if (!e.repeat) this._clearCell(); return true;
      default: return false;
    }
  }

  // While a keyboard cell is listening, mouse buttons are bindings too: a left click on the cell itself, or any
  // other button anywhere in the panel. A left click elsewhere cancels.
  _mouseDown(e) {
    const L = this.listening;
    if (!L || L.kind !== 'kbm') return;
    if (performance.now() - L.since < 200) return;
    const onCell = L.cell.contains(e.target);
    if (e.button === 0 && !onCell) { this._stopListening(); this.say('Cancelled.'); return; }
    e.preventDefault();
    e.stopPropagation();
    this._assign(`Mouse${e.button}`);
  }
}

// The current key for one action as a small inline cap, for notes.
function navKey(G, action) {
  const c = G.input.codesFor(action, 'kbm')[0];
  return h('span', { class: 'ctl-inline' }, c ? codeGlyph(c) : 'Unbound');
}
