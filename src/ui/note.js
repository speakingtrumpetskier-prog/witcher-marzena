// readNote(note): a parchment sheet with a letter, diary page, ledger, scrawl or carving.
//   G.ui.readNote('note_cart_family')           an id from content.js (or registerNotes)
//   G.ui.readNote({ id, title, text, sign, kind, where })   inline note; id also marks it read
// Closes with E, Esc, Enter, Space or a click. Resolves when it has closed.
import { h, svg, markup } from './dom.js';
import { ICON } from './icons.js';
import { paperCanvas, grainURL, tornClip } from './paper.js';
import { drawSketch } from './sketch.js';
import { hashString } from '../core/util.js';

const TONES = {
  letter: [224, 207, 166], diary: [214, 196, 152], ledger: [220, 206, 170], object: [224, 207, 166],
  drawing: [228, 216, 188], scrawl: [168, 134, 96], carving: [166, 166, 158], inscription: [150, 152, 152],
};

export class NoteView {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.scr = null;
  }

  get isOpen() { return !!this.scr?.open; }
  close() { return this.scr?.close(); }

  open(note) {
    if (this.scr?.open) this.scr.close();
    const ui = this.ui;
    let info = ui.noteInfo(note);
    if (!info) info = { title: '', text: String(note ?? '') };
    const kind = TONES[info.kind] ? info.kind : 'letter';
    const regId = typeof note === 'string' ? (ui.notes[note] ? note : ui.notes[`note_${note}`] ? `note_${note}` : null) : (note?.id ?? null);
    if (regId && !note?.preview) { try { this.G.state?.readNote?.(regId); } catch { /* optional */ } }

    const seed = hashString(info.title || info.text || 'x') % 997;
    const paper = paperCanvas(300, 400, { seed, tone: TONES[kind], edge: 0.9, stain: kind === 'scrawl' ? 0.4 : 1 });
    paper.className = 'paper';
    const body = this._body(kind, info);
    const inner = h('div', { class: 'mz-sheet-in' },
      info.where ? h('div', { class: 'where' }, info.where) : null,
      info.title ? h('h2', { class: 'title' }, info.title) : null,
      h('div', { class: 'rule' }, svg(ICON.knot)),
      body,
      info.sign ? h('div', { class: 'sign' }, info.sign) : null);
    const sheet = h('div', { class: `mz-sheet kind-${kind}` }, paper, h('div', { class: 'grain', style: { backgroundImage: `url(${grainURL()})` } }), inner);
    sheet.style.clipPath = tornClip(seed, 28, kind === 'carving' || kind === 'inscription' ? 0.25 : 0.8);
    const hint = h('div', { class: 'mz-sheet-hint' }, h('span', { class: 'mz-key' }, 'E'), h('span', null, 'Close'));
    const wrap = h('div', { class: 'mz-sheetwrap' }, sheet, hint);
    const el = h('div', { class: 'mz-notemodal' }, wrap);

    const born = performance.now();
    const closeNow = () => { if (performance.now() - born > 350) this.scr.close(); };
    el.addEventListener('click', closeNow);
    this.scr = ui.openScreen({
      name: 'note',
      el,
      onKey: (e) => {
        if (e.repeat) return true;
        if (['KeyE', 'Escape', 'Enter', 'Space', 'KeyF'].includes(e.code)) { closeNow(); return true; }
        return false;
      },
    });
    return this.scr.closed;
  }

  _body(kind, info) {
    const lines = String(info.text || '').split('\n').filter((l) => l.trim());
    const root = h('div', { class: 'body' });
    if (kind === 'drawing') {
      const c = h('canvas', { class: 'drawing', width: 640, height: 440 });
      drawSketch(c, 'ice_lady', 5);
      root.append(c, ...lines.map((l, i) => this._p(l, i, 'caption')));
      return root;
    }
    if (kind === 'ledger') {
      lines.forEach((l, i) => {
        const m = /^([^:]{2,40}):\s*(.+)$/.exec(l);
        const p = m
          ? h('p', { class: 'row', style: `--i:${i}` }, h('span', { class: 'k' }, m[1]), h('span', { class: 'dots' }), h('span', { class: 'v' }, m[2].replace(/\.$/, '')))
          : this._p(l, i);
        root.appendChild(p);
      });
      return root;
    }
    if (kind === 'scrawl') {
      lines.forEach((l, i) => {
        const p = this._p(l, i);
        const a = ((hashString(l) % 100) / 100 - 0.5) * 3.6;
        const x = ((hashString(l + 'x') % 100) / 100 - 0.5) * 22;
        p.style.transform = `rotate(${a.toFixed(2)}deg) translateX(${x.toFixed(1)}px)`;
        root.appendChild(p);
      });
      return root;
    }
    if (kind === 'diary') {
      lines.forEach((l, i) => {
        const m = /^(Day \d+\.)\s*(.*)$/.exec(l);
        const p = h('p', { style: `--i:${i}` });
        if (m) p.append(h('strong', null, `${m[1]} `), markup(m[2])); else p.append(markup(l));
        root.appendChild(p);
      });
      return root;
    }
    lines.forEach((l, i) => root.appendChild(this._p(l, i)));
    return root;
  }

  _p(text, i, cls) {
    return h('p', { class: cls || null, style: `--i:${i}` }, markup(text));
  }
}
