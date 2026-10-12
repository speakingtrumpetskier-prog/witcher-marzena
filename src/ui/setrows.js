// A list of setting rows with keyboard, pad and mouse handling, shared by the Settings and Controls screens.
// One focused row at a time; Up and Down move it, Left and Right change the value, Enter acts on it.
//
//   const list = new RowList({ sfx });             list.el is the element to place in a panel
//   list.group('Look')                             a small heading
//   list.slider(label, get, set, { min, max, step, fmt })   -> row
//   list.segmented(label, [[value, 'Text'], ...], get, set, note) -> row      (note(el) fills an optional line below)
//   list.toggle(label, get, set)                   On / Off
//   list.button(label, text, onPress)              a row with one button
//   list.key(e) -> bool                            feed it keydown events
//   list.rows[] { el, adjust(d), activate(), repaint() }   list.focus   list.setFocus(i)
import { h } from './dom.js';

export class RowList {
  constructor({ sfx } = {}) {
    this.el = h('div', { class: 'mz-set-rows' });
    this.rows = [];
    this.focus = 0;
    this.sfx = sfx;
  }

  _add(el, row) {
    row.el = el;
    this.rows.push(row);
    el.addEventListener('mouseenter', () => this.setFocus(this.rows.indexOf(row)));
    this.el.appendChild(el);
    return row;
  }

  group(title) {
    this.el.appendChild(h('div', { class: 'mz-set-group' }, title));
  }

  slider(label, get, set, { min = 0, max = 1, step = 0.05, fmt = (v) => `${Math.round(v * 100)}` } = {}) {
    const input = h('input', { type: 'range', min, max, step, tabindex: '-1' });
    input.value = get();
    const val = h('span', { class: 'val' }, fmt(get()));
    const el = h('div', { class: 'mz-set-row' }, h('span', { class: 'lab' }, label), input, val);
    const apply = (v) => {
      v = Math.max(min, Math.min(max, v));
      set(v);
      v = Math.max(min, Math.min(max, get()));
      input.value = v;
      val.textContent = fmt(v);
    };
    input.addEventListener('input', () => apply(parseFloat(input.value)));
    input.addEventListener('change', () => input.blur());
    return this._add(el, {
      adjust: (d) => apply(parseFloat(input.value) + d * step * (max - min > 5 ? 1 : 2)),
      repaint: () => { input.value = get(); val.textContent = fmt(get()); },
    });
  }

  segmented(label, options, get, set, note) {
    const row = {};
    const btns = options.map(([v, text]) => {
      const b = h('button', { class: 'seg', type: 'button', tabindex: '-1' }, text);
      b.addEventListener('click', () => { set(v); row.repaint(); });
      return [v, b];
    });
    const noteEl = note ? h('span', { class: 'note' }) : null;
    const el = h('div', { class: 'mz-set-row seg-row' }, h('span', { class: 'lab' }, label), h('span', { class: 'segs' }, ...btns.map(([, b]) => b)), noteEl);
    const step = (d, wrap) => {
      const i = options.findIndex(([v]) => v === get());
      const n = wrap ? (i + d + options.length) % options.length : Math.max(0, Math.min(options.length - 1, i + d));
      set(options[n][0]);
      row.repaint();
    };
    Object.assign(row, {
      adjust: (d) => step(d, false),
      activate: () => { step(1, true); return true; },
      repaint: () => {
        btns.forEach(([v, b]) => b.classList.toggle('on', v === get()));
        note?.(noteEl);
      },
    });
    row.repaint();
    return this._add(el, row);
  }

  toggle(label, get, set) {
    return this.segmented(label, [[true, 'On'], [false, 'Off']], get, set);
  }

  button(label, text, onPress) {
    const b = h('button', { class: 'act', type: 'button', tabindex: '-1' }, text);
    b.addEventListener('click', () => onPress());
    const el = h('div', { class: 'mz-set-row seg-row' }, h('span', { class: 'lab' }, label), h('span', { class: 'segs' }, b));
    return this._add(el, { activate: () => { onPress(); return true; } });
  }

  setFocus(i, scroll = false) {
    if (i < 0 || i >= this.rows.length) return;
    this.focus = i;
    this.rows.forEach((r, k) => r.el.classList.toggle('focus', k === i));
    if (scroll) this.rows[i].el.scrollIntoView?.({ block: 'nearest' });
  }

  move(d) {
    if (!this.rows.length) return;
    this.setFocus((this.focus + d + this.rows.length) % this.rows.length, true);
    this.sfx?.('ui_hover');
  }

  key(e) {
    const row = this.rows[this.focus];
    if (!row) return false;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.move(-1); return true;
      case 'KeyS': case 'ArrowDown': this.move(1); return true;
      case 'KeyA': case 'ArrowLeft': row.adjust?.(-1); return true;
      case 'KeyD': case 'ArrowRight': row.adjust?.(1); return true;
      case 'Enter': case 'NumpadEnter': case 'Space': case 'KeyE': return !!row.activate?.();
      default: return false;
    }
  }
}
