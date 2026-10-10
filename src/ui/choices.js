// Dialogue choices (bottom right) and the timed "[Hold E] Look back" prompt.
//
//   choices(list, { timer, decisive, default }) -> Promise<index>   timeout resolves -1
//     list items: 'text' or { t, decisive, disabled }
//   hold(text, seconds, window) -> Promise<boolean>
//
// Choices swallow the keys they use so the confirming E does not leak into a dialogue advance.
import { h, svg, markup } from './dom.js';
import { ICON } from './icons.js';
import { labelAction, labelGlyph } from './glyphs.js';

export class Choices {
  constructor(G, root, ui) {
    this.G = G;
    this.ui = ui;
    this.layer = h('div', { class: 'mz-layer mz-choices' });
    this.holdLayer = h('div', { class: 'mz-layer mz-holdlayer' });
    root.append(this.layer, this.holdLayer);
    this.cur = null;
    this.hcur = null;
    this.eHeld = false;
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyE') this.eHeld = true; }, true);
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyE') this.eHeld = false; }, true);
    window.addEventListener('blur', () => { this.eHeld = false; });
  }

  // ---- choices ----------------------------------------------------------------------------
  choices(list, opts = {}) {
    if (this.cur) this._finish(this.cur, -1, false);
    const items = (list || []).map((it) => {
      const o = typeof it === 'string' ? { t: it } : { ...it };
      o.t = o.t ?? o.text ?? '';
      o.decisive = !!(o.decisive ?? opts.decisive);
      o.disabled = !!(o.disabled || o.enabled === false);
      return o;
    });
    if (!items.length) return Promise.resolve(-1);

    const timer = Number(opts.timer) > 0 ? Number(opts.timer) : 0;
    const rows = items.map((o, i) => {
      const row = h('div', { class: 'mz-ch' + (o.disabled ? ' dis' : '') + (o.seen ? ' seen' : '') },
        h('span', { class: 'num' }, String(i + 1)),
        o.decisive ? svg(ICON.knot, 'knot') : null,
        h('span', { class: 't' }, markup(o.t)));
      row.addEventListener('mouseenter', () => this._select(c, i));
      row.addEventListener('click', () => this._confirm(c, i));
      return row;
    });
    const tbar = timer ? h('div', { class: 'mz-ctimer', style: `--mz-t:${timer}s` }, h('i')) : null;
    const el = h('div', { class: 'mz-clist' }, ...rows, tbar);
    const c = { el, rows, items, sel: 0, openedAt: performance.now(), done: false, timer: 0, resolve: null, handler: null, wasLocked: false };
    c.sel = Math.max(0, Math.min(items.length - 1, opts.default ?? 0));
    if (items[c.sel].disabled) c.sel = Math.max(0, items.findIndex((o) => !o.disabled));
    this.layer.appendChild(el);
    this._paint(c);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));

    // Free the cursor so the mouse works; the lock comes back on resolve (a click or key is a gesture).
    const G = this.G;
    if (G.input?.locked) { c.wasLocked = true; this.ui.releaseLock(); }
    if (items.some((o) => o.decisive)) { try { G.audio?.stinger?.('choice'); } catch { /* optional */ } }

    c.handler = {
      swallow: true,
      onKey: (e) => this._key(c, e),
    };
    this.ui.pushKeys(c.handler);
    this.ui.root.classList.add('choices-open');
    this.ui.overlays.scrim('choices', true);
    if (timer) c.timer = setTimeout(() => this._finish(c, -1, true), timer * 1000);
    this.cur = c;
    return new Promise((resolve) => { c.resolve = resolve; });
  }

  _paint(c) {
    c.rows.forEach((r, i) => r.classList.toggle('sel', i === c.sel));
  }

  _select(c, i) {
    if (c.done || c.items[i].disabled || i === c.sel) return;
    c.sel = i;
    this._paint(c);
    this.ui.sfx('ui_hover', { volume: 0.4 });
  }

  _move(c, d) {
    const n = c.items.length;
    let i = c.sel;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!c.items[i].disabled) break;
    }
    this._select(c, i);
  }

  _confirm(c, i) {
    if (c.done || c.items[i].disabled) return;
    if (performance.now() - c.openedAt < 220) return; // ignore the key that dismissed the last line
    c.sel = i;
    this._paint(c);
    this.ui.sfx('ui_select', { volume: 0.6 });
    this._finish(c, i, false);
  }

  _key(c, e) {
    if (e.repeat) return true;
    const k = e.code;
    if (/^(Digit|Numpad)[1-9]$/.test(k)) {
      const i = parseInt(k.slice(-1), 10) - 1;
      if (i < c.items.length) this._confirm(c, i);
      return true;
    }
    if (k === 'KeyW' || k === 'ArrowUp') { this._move(c, -1); return true; }
    if (k === 'KeyS' || k === 'ArrowDown') { this._move(c, 1); return true; }
    if (k === 'KeyE' || k === 'Enter' || k === 'NumpadEnter') { this._confirm(c, c.sel); return true; }
    return false;
  }

  _finish(c, index, timedOut) {
    if (c.done) return;
    c.done = true;
    clearTimeout(c.timer);
    this.ui.popKeys(c.handler);
    if (this.cur === c) {
      this.cur = null;
      this.ui.root.classList.remove('choices-open');
      this.ui.overlays.scrim('choices', false);
    }
    if (!timedOut && index >= 0) c.rows[index].classList.add('sel');
    c.el.classList.add('off');
    c.el.classList.remove('on');
    setTimeout(() => c.el.remove(), 450);
    if (c.wasLocked) this.ui.restoreLock();
    c.resolve(index);
  }

  get active() { return !!this.cur || !!this.hcur; }

  // ---- hold prompt ------------------------------------------------------------------------
  // hold('[Hold E] Look back', 1.2, 5): resolves true if E is held for `seconds` (progress decays
  // slowly while released) before `window` seconds run out, otherwise false.
  hold(text, seconds = 1.2, windowSecs = 5) {
    if (this.hcur) this._holdEnd(this.hcur, false);
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(text || '[Hold E] Look back');
    let key = 'E', label = text || 'Look back', verb = '';
    if (m) {
      const parts = m[1].trim().split(/\s+/);
      if (parts.length > 1 && /^hold$/i.test(parts[0])) { verb = 'Hold'; key = parts.slice(1).join(' '); } else key = m[1];
      label = m[2] || label;
    }
    const keyEl = labelAction(key) ? h('span', { class: 'mz-hold-glyph' }, labelGlyph(this.G, key)) : h('span', { class: 'mz-key' }, key);
    const ring = h('div', { class: 'mz-hold-ring' },
      svg('<svg viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="24"/><circle class="fg" cx="29" cy="29" r="24"/></svg>'), keyEl);
    const wbar = h('i');
    const el = h('div', { class: 'mz-hold' }, ring,
      h('div', { class: 'mz-hold-text' }, verb ? h('b', null, verb) : null, label),
      h('div', { class: 'mz-hold-window' }, wbar));
    this.holdLayer.appendChild(el);
    this.ui.overlays.scrim('hold', true);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    const hc = {
      el, fg: ring.querySelector('circle.fg'), wbar, need: Math.max(0.2, seconds), win: Math.max(1, windowSecs),
      t: 0, p: 0, needRelease: this.eHeld, resolve: null, done: false, last: -1,
    };
    this.hcur = hc;
    return new Promise((resolve) => { hc.resolve = resolve; });
  }

  _holdEnd(hc, ok) {
    if (hc.done) return;
    hc.done = true;
    if (this.hcur === hc) this.hcur = null;
    hc.el.classList.add(ok ? 'done' : 'miss');
    if (ok) hc.fg.style.strokeDashoffset = '0';
    setTimeout(() => { hc.el.classList.remove('on'); }, ok ? 700 : 0);
    setTimeout(() => { hc.el.remove(); if (!this.hcur) this.ui.overlays.scrim('hold', false); }, ok ? 1500 : 900);
    hc.resolve(ok);
  }

  update(dt) {
    const hc = this.hcur;
    if (!hc || hc.done) return;
    const G = this.G;
    const held = this.eHeld || (G.input?.context !== 'ui' && G.input?.down?.('interact'));
    if (hc.needRelease && !held) hc.needRelease = false;
    hc.t += dt;
    if (held && !hc.needRelease) hc.p += dt; else hc.p = Math.max(0, hc.p - dt * 0.6);
    const f = Math.min(1, hc.p / hc.need);
    const off = (150.8 * (1 - f)).toFixed(1);
    if (off !== hc.last) { hc.last = off; hc.fg.style.strokeDashoffset = off; }
    hc.wbar.style.transform = `scaleX(${Math.max(0, 1 - hc.t / hc.win).toFixed(3)})`;
    if (f >= 1) this._holdEnd(hc, true);
    else if (hc.t >= hc.win) this._holdEnd(hc, false);
  }
}
