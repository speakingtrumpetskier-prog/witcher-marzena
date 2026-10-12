// The photo mode panel: settings rows on the right, the controls along the bottom, the rule-of-thirds
// guide over the crop, the focus mark and the "saved" card. None of it is part of the saved picture.
import { h, clear } from '../dom.js';
import { RowList } from '../setrows.js';
import { codeGlyph } from '../glyphs.js';
import { FILTERS } from './photoPass.js';
import { CROPS, BORDERS } from './frames.js';

const hhmm = (v) => {
  const t = ((v % 24) + 24) % 24, hh = Math.floor(t), mm = Math.round((t - hh) * 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const metres = (d) => (d < 10 ? `${d.toFixed(1)} m` : `${Math.round(d)} m`);
// The focus slider runs on a log scale: 0.4 m to 120 m.
const FMIN = 0.4, FMAX = 120;
const toT = (d) => Math.log(Math.max(FMIN, Math.min(FMAX, d)) / FMIN) / Math.log(FMAX / FMIN);
const fromT = (t) => FMIN * Math.pow(FMAX / FMIN, t);

export class PhotoPanel {
  constructor(G, mode) {
    this.G = G;
    this.mode = mode;
    this.hidden = false;
    const s = mode.settings;
    const set = (k) => (v) => mode.set(k, v);
    const list = new RowList({ sfx: (n) => G.uiImpl?.sfx(n, { volume: 0.25 }) });
    this.list = list;
    this.byKey = {};

    list.group('Lens');
    this.byKey.fov = list.slider('Field of view', () => s.fov, set('fov'), { min: 12, max: 95, step: 1, fmt: (v) => `${Math.round(v)}°` });
    this.byKey.tilt = list.slider('Tilt', () => s.tilt, set('tilt'), { min: -30, max: 30, step: 1, fmt: (v) => `${Math.round(v)}°` });
    this.byKey.dof = list.slider('Depth of field', () => s.dof, set('dof'), { min: 0, max: 1, step: 0.05, fmt: (v) => (v <= 0 ? 'Off' : `${Math.round(v * 100)}`) });
    this.byKey.focusMode = list.segmented('Focus on', [['subject', 'Vesna'], ['manual', 'A point']], () => s.focusMode, set('focusMode'),
      (el) => { el.textContent = s.focusMode === 'manual' ? 'Click the picture to choose the point.' : ''; });
    this.byKey.focus = list.slider('Focus distance', () => toT(s.focus), (t) => mode.set('focus', fromT(t)), { min: 0, max: 1, step: 0.01, fmt: (t) => metres(fromT(t)) });

    list.group('Look');
    this.byKey.exposure = list.slider('Exposure', () => s.exposure, set('exposure'), { min: -2, max: 2, step: 0.1, fmt: (v) => `${v > 0.04 ? '+' : ''}${v.toFixed(1)}` });
    this.byKey.filter = this._cycle('Filter', FILTERS, () => s.filter, set('filter'));
    this.byKey.vignette = list.slider('Vignette', () => s.vignette, set('vignette'));
    this.byKey.grain = list.slider('Grain', () => s.grain, set('grain'));

    list.group('Frame');
    this.byKey.crop = this._cycle('Crop', CROPS.map((c) => c.id), () => s.crop, set('crop'), (id) => CROPS.find((c) => c.id === id)?.label || id);
    this.byKey.border = this._cycle('Border', BORDERS, () => s.border, set('border'));
    this.byKey.grid = list.segmented('Thirds guide', [[false, 'Off'], [true, 'On']], () => s.grid, (v) => { mode.set('grid', v); this._guides(); });

    list.group('Scene');
    this.byKey.hour = list.slider('Time of day', () => s.hour, set('hour'), { min: 0, max: 23.75, step: 0.25, fmt: hhmm });
    this.byKey.hideVesna = list.segmented('Vesna', [[false, 'Shown'], [true, 'Hidden']], () => s.hideVesna, set('hideVesna'));
    this.byKey.hideSnow = list.segmented('Falling snow', [[false, 'Shown'], [true, 'Hidden']], () => s.hideSnow, set('hideSnow'));
    list.setFocus(0);

    this.foot = h('div', { class: 'mz-photo-foot' });
    this.panel = h('div', { class: 'mz-photo-panel' }, h('h2', null, 'Photo mode'), list.el);
    this.grid = h('div', { class: 'mz-photo-grid' }, ...[1, 2].map((i) => h('i', { class: `v v${i}` })), ...[1, 2].map((i) => h('i', { class: `h h${i}` })));
    this.mark = h('div', { class: 'mz-photo-mark' }, h('i'), h('span'));
    this.toastEl = h('div', { class: 'mz-photo-toast' });
    this.flashEl = h('div', { class: 'mz-photo-flash' });
    this.el = h('div', { class: 'mz-photo' }, this.grid, this.mark, this.flashEl, this.panel, this.foot, this.toastEl);
    (G.uiImpl?.root || document.body).appendChild(this.el);
    this._fillFoot();
    this._offs = [G.events.on('input:device', () => this._fillFoot()), G.events.on('input:bindings', () => this._fillFoot())];
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('on')));
    this._guides();
  }

  // A row that steps through a list with the arrows, or with the small buttons either side.
  _cycle(label, values, get, set, name = (v) => v) {
    const val = h('span', { class: 'cyc-val' });
    const prev = h('button', { class: 'cyc-btn', type: 'button', tabindex: '-1', 'aria-label': 'Previous' }, '‹');
    const next = h('button', { class: 'cyc-btn', type: 'button', tabindex: '-1', 'aria-label': 'Next' }, '›');
    const el = h('div', { class: 'mz-set-row seg-row cyc-row' }, h('span', { class: 'lab' }, label), h('span', { class: 'cyc' }, prev, val, next));
    const step = (d) => {
      const i = Math.max(0, values.indexOf(get()));
      set(values[(i + d + values.length) % values.length]);
      row.repaint();
    };
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    const row = {
      adjust: (d) => step(d),
      activate: () => { step(1); return true; },
      repaint: () => { val.textContent = name(get()); },
    };
    row.repaint();
    return this.list._add(el, row);
  }

  _fillFoot() {
    const G = this.G, pad = G.input?.device === 'pad', style = G.input?.padStyle || 'xbox';
    const item = (code, label) => h('span', { class: 'it' }, codeGlyph(code, style), h('span', { class: 'lab' }, label));
    clear(this.foot);
    if (pad) {
      this.foot.append(
        h('div', { class: 'row' }, item('PadA', 'Take photo'), item('PadX', 'Hide panel'), item('PadY', 'Reset view'), item('PadB', 'Leave')),
        h('div', { class: 'row small' }, 'Left stick to move, right stick to look, LT and RT for height, LB and RB to zoom, the D-pad for the settings'),
      );
    } else {
      this.foot.append(
        h('div', { class: 'row' }, item('Space', 'Take photo'), item('KeyH', 'Hide panel'), item('KeyR', 'Reset view'), item('Escape', 'Leave')),
        h('div', { class: 'row small' }, 'Drag to look, W A S D to move, Q and E for height, wheel to zoom, Z and C to tilt, click to focus, arrow keys for the settings'),
      );
    }
  }

  key(e) { return this.list.key(e); }

  repaint(key) {
    if (key) this.byKey[key]?.repaint?.();
    else for (const r of this.list.rows) r.repaint?.();
  }

  toggle() {
    this.hidden = !this.hidden;
    this.el.classList.toggle('bare', this.hidden);
  }

  // Place the thirds guide over the crop (uv rect, y up) in page pixels.
  layoutGuides(rect) {
    this._rect = rect;
    this._guides();
  }
  _guides() {
    const r = this._rect || [0, 0, 1, 1], on = !!this.mode.settings.grid;
    this.grid.style.display = on ? '' : 'none';
    if (!on) return;
    const c = this.G.renderer.domElement.getBoundingClientRect();
    Object.assign(this.grid.style, {
      left: `${c.left + r[0] * c.width}px`, top: `${c.top + (1 - r[3]) * c.height}px`,
      width: `${(r[2] - r[0]) * c.width}px`, height: `${(r[3] - r[1]) * c.height}px`,
    });
  }

  markFocus(x, y, z) {
    this.mark.style.left = `${x}px`;
    this.mark.style.top = `${y}px`;
    this.mark.querySelector('span').textContent = metres(z);
    this.mark.classList.remove('show');
    void this.mark.offsetWidth;
    this.mark.classList.add('show');
    this.repaint('focus');
    this.repaint('focusMode');
    this.repaint('dof');
  }

  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  toast(url, text) {
    clear(this.toastEl);
    if (url) this.toastEl.appendChild(h('img', { src: url, alt: '' }));
    this.toastEl.appendChild(h('span', null, text));
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), 4200);
  }

  dispose() {
    for (const off of this._offs) off?.();
    clearTimeout(this._toastT);
    const el = this.el;
    el.classList.remove('on');
    setTimeout(() => el.remove(), 350);
  }
}
