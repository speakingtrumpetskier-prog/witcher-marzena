// Credits: G.ui.credits() -> Promise. A slow scroll over black that stops with the last lyric line
// of the song centred, holds, and fades. Editable copy lives in content.js (CREDITS). After a few
// seconds any of Esc, Enter or Space skips to the last line.
import { h, svg } from './dom.js';
import { ICON } from './icons.js';
import { CREDITS, CREDITS_LAST_LINE } from './content.js';

const SPEED = 46; // px per second

export class Credits {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.active = false;
  }

  open(opts = {}) {
    if (this.active) return this.promise;
    const ui = this.ui;
    this.active = true;
    const sections = CREDITS.map((s) => h('section', { class: 'cr-sec' },
      h('h3', null, s.head),
      ...s.lines.map((l) => (Array.isArray(l)
        ? h('p', { class: 'cr-line' }, h('span', { class: 'role' }, l[0]), h('span', { class: 'name' }, l[1]))
        : h('p', { class: 'cr-text' }, l)))));
    this.last = h('p', { class: 'cr-last' }, opts.last || CREDITS_LAST_LINE);
    this.roll = h('div', { class: 'cr-roll' },
      h('div', { class: 'cr-logo' }, 'MARZENA'),
      h('div', { class: 'cr-thread' }, svg(ICON.knot)),
      h('div', { class: 'cr-tag' }, 'A tale of the long winter'),
      h('div', { class: 'cr-gap' }),
      ...sections,
      h('section', { class: 'cr-sec cr-made' },
        h('p', { class: 'cr-text' }, 'Made with three.js and WebAudio,'),
        h('p', { class: 'cr-text' }, 'entirely from code.')),
      h('div', { class: 'cr-gap big' }),
      this.last);
    this.el = h('div', { class: 'mz-credits' }, this.roll, h('div', { class: 'cr-skip' }, 'Esc to skip'));
    this.scr = ui.openScreen({
      name: 'credits',
      el: this.el,
      swallow: true,
      onKey: (e) => {
        if (['Escape', 'Enter', 'Space', 'KeyE'].includes(e.code) && !e.repeat && this.t > 3) { this._skip(); return true; }
        return true;
      },
    });
    this.t = 0;
    this.y = window.innerHeight + 40;
    this.state = 'roll';
    this._measure();
    this._remeasure = 0;
    this.promise = new Promise((resolve) => { this._resolve = resolve; });
    return this.promise;
  }

  // offsetTop forces layout, so this is exact as soon as the element is in the DOM; it is repeated
  // every few seconds in case web fonts arrive late and change the line heights.
  _measure() {
    const vh = window.innerHeight;
    const lastMid = this.last.offsetTop + this.last.offsetHeight / 2;
    this.endY = vh / 2 - lastMid;
  }

  _skip() {
    if (this.state !== 'roll') return;
    this.y = this.endY;
    this._apply();
  }

  update(dt) {
    if (!this.active || this.endY == null) return;
    this.t += dt;
    this._remeasure += dt;
    if (this._remeasure > 3) { this._remeasure = 0; this._measure(); }
    if (this.state === 'roll') {
      this.y -= SPEED * dt;
      if (this.y <= this.endY) { this.y = this.endY; this.state = 'hold'; this.hold = 0; this.last.classList.add('lit'); }
      this._apply();
    } else if (this.state === 'hold') {
      this.hold += dt;
      if (this.hold > 6) { this.state = 'out'; this.el.classList.add('out'); this.hold = 0; }
    } else if (this.state === 'out') {
      this.hold += dt;
      if (this.hold > 2.6) this._finish();
    }
  }

  _apply() {
    this.roll.style.transform = `translate3d(0, ${this.y.toFixed(1)}px, 0)`;
  }

  _finish() {
    if (!this.active) return;
    this.state = 'done';
    this.active = false;
    this.scr.close();
    this._resolve();
  }
}
