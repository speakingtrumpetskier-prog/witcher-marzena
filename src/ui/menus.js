// Pause menu (Esc) and the settings panel (also reachable from the title screen).
//   Pause: Resume, Journal, Map, Settings, Save, Quit to Title.
//   Settings: volumes (G.audio.volumes), mouse sensitivity, subtitle size, quality (reloads with ?quality=).
import { h, svg, clear } from './dom.js';
import { ICON } from './icons.js';
import { VOLUME_KEYS } from './settings.js';

const dayPart = (hr) => (hr < 5 ? 'night' : hr < 9 ? 'morning' : hr < 12 ? 'forenoon' : hr < 17 ? 'afternoon' : hr < 20 ? 'evening' : 'night');

// Generic vertical menu list with a selection marker, keyboard and mouse.
export function menuList(items, { onSelect } = {}) {
  const el = h('nav', { class: 'mz-menu' });
  let sel = Math.max(0, items.findIndex((i) => !i.disabled));
  const rows = items.map((it, i) => {
    const r = h('button', { class: 'mz-mi' + (it.disabled ? ' dis' : ''), type: 'button', tabindex: '-1' }, svg(ICON.knot, 'mk'), h('span', { class: 'lab' }, it.label));
    r.addEventListener('mouseenter', () => { if (!it.disabled) { sel = i; paint(); } });
    r.addEventListener('click', () => choose(i));
    el.appendChild(r);
    return r;
  });
  function paint() { rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); }
  function choose(i) {
    const it = items[i];
    if (it.disabled) { rows[i].classList.remove('shake'); void rows[i].offsetWidth; rows[i].classList.add('shake'); return; }
    onSelect?.(it, i);
  }
  function move(d) {
    const n = items.length;
    let i = sel;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!items[i].disabled) break; }
    sel = i;
    paint();
  }
  paint();
  return {
    el, rows, move, paint,
    get sel() { return sel; },
    set sel(v) { sel = v; paint(); },
    choose: () => choose(sel),
    key(e) {
      if (e.repeat && !/Arrow|KeyW|KeyS/.test(e.code)) return true;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') { move(-1); return true; }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') { move(1); return true; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE' || e.code === 'Space') { choose(sel); return true; }
      return false;
    },
  };
}

export class Menus {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.pause = null;
    this.settings = null;
  }

  closeAll() {
    this.settings?.close();
    this.pause?.close();
  }

  // ---- pause --------------------------------------------------------------------------------
  openPause() {
    if (this.pause?.open) return this.pause.closed;
    const G = this.G, ui = this.ui;
    let confirming = false;
    let list;
    const body = h('div', { class: 'mz-pause-list' });
    const head = h('div', { class: 'mz-pause-head' }, h('div', { class: 'brand' }, 'MARZENA'), h('div', { class: 'thread' }), h('div', { class: 'sub' }, 'The game is paused'));
    const foot = h('div', { class: 'mz-pause-foot' });
    const el = h('div', { class: 'mz-pause' }, h('div', { class: 'mz-pause-col' }, head, body, foot));
    const updateFoot = () => {
      const coins = G.state?.count?.('coins') ?? 0;
      const thaw = G.state?.count?.('thaw') ?? 0;
      const t = G.time;
      clear(foot);
      foot.append(
        h('span', null, `${coins} grosze`), h('i'),
        h('span', null, `${thaw} Thaw`), h('i'),
        h('span', null, t ? `Day ${t.day}, ${dayPart(t.hours)}` : ''));
    };
    const showList = () => {
      confirming = false;
      clear(body);
      list = menuList([
        { id: 'resume', label: 'Resume' },
        { id: 'journal', label: 'Journal' },
        { id: 'map', label: 'Map' },
        { id: 'settings', label: 'Settings' },
        { id: 'save', label: this._saved ? 'Saved' : 'Save' },
        { id: 'quit', label: 'Quit to Title' },
      ], { onSelect: (it) => act(it.id) });
      body.appendChild(list.el);
      updateFoot();
    };
    const showConfirm = () => {
      confirming = true;
      clear(body);
      list = menuList([{ id: 'stay', label: 'Stay' }, { id: 'leave', label: 'Leave the valley' }], { onSelect: (it) => act(it.id) });
      body.append(h('p', { class: 'mz-confirm' }, 'Return to the title? What is not saved is lost.'), list.el);
    };
    const save = () => {
      const p = G.player;
      const extra = {
        clock: G.time ? { day: G.time.day, hours: G.time.hours } : null,
        weather: G.weather?.state ?? null,
      };
      if (p?.position) extra.player = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw ?? 0 };
      let ok = false;
      try { ok = G.story?.save ? (G.story.save(), true) : G.state?.save?.(extra); } catch { ok = false; }
      ui.overlays.notify(ok ? 'Game saved' : 'Could not save', ok ? 'save' : 'info');
      this._saved = ok;
      setTimeout(() => { this._saved = false; if (this.pause?.open && !confirming) showList(); }, 2200);
      showList();
    };
    const act = (id) => {
      switch (id) {
        case 'resume': this.pause.close(); break;
        case 'journal': ui.openJournal(); break;
        case 'map': ui.openMap(); break;
        case 'settings': this.openSettings(); break;
        case 'save': save(); break;
        case 'quit': showConfirm(); break;
        case 'stay': showList(); break;
        case 'leave': location.reload(); break;
        default: break;
      }
    };
    showList();
    this.pause = ui.openScreen({
      name: 'pause',
      el,
      onKey: (e) => {
        if (e.code === 'Escape') { if (e.repeat) return true; if (confirming) showList(); else this.pause.close(); return true; }
        if (e.code === 'KeyJ' && !e.repeat) { ui.openJournal(); return true; }
        if (e.code === 'KeyM' && !e.repeat) { ui.openMap(); return true; }
        return list.key(e);
      },
    });
    return this.pause.closed;
  }

  // ---- settings -----------------------------------------------------------------------------
  openSettings() {
    if (this.settings?.open) return this.settings.closed;
    const G = this.G, ui = this.ui, S = ui.settings;
    let pendingQuality = G.quality;
    const rows = [];
    const rowsEl = h('div', { class: 'mz-set-rows' });

    const slider = (label, get, set, { min = 0, max = 1, step = 0.05, fmt = (v) => `${Math.round(v * 100)}` } = {}) => {
      const input = h('input', { type: 'range', min, max, step, tabindex: '-1' });
      input.value = get();
      const val = h('span', { class: 'val' }, fmt(get()));
      const row = h('div', { class: 'mz-set-row' }, h('span', { class: 'lab' }, label), input, val);
      const apply = (v) => { v = Math.max(min, Math.min(max, v)); set(v); input.value = v; val.textContent = fmt(v); };
      input.addEventListener('input', () => apply(parseFloat(input.value)));
      input.addEventListener('change', () => input.blur());
      rows.push({ el: row, adjust: (d) => apply(parseFloat(input.value) + d * step * (max - min > 5 ? 1 : 2)) });
      rowsEl.appendChild(row);
    };
    const segmented = (label, options, get, set, note) => {
      const btns = options.map(([v, text]) => {
        const b = h('button', { class: 'seg', type: 'button', tabindex: '-1' }, text);
        b.addEventListener('click', () => { set(v); paint(); });
        return [v, b];
      });
      const paint = () => btns.forEach(([v, b]) => b.classList.toggle('on', v === get()));
      const noteEl = note ? h('span', { class: 'note' }) : null;
      const row = h('div', { class: 'mz-set-row seg-row' }, h('span', { class: 'lab' }, label), h('span', { class: 'segs' }, ...btns.map(([, b]) => b)), noteEl);
      paint();
      rows.push({
        el: row,
        adjust: (d) => { const i = options.findIndex(([v]) => v === get()); const n = options[Math.max(0, Math.min(options.length - 1, i + d))]; set(n[0]); paint(); },
        repaint: () => { paint(); note?.(noteEl); },
      });
      note?.(noteEl);
      rowsEl.appendChild(row);
    };

    for (const [k, label] of VOLUME_KEYS) slider(label, () => S.getVolume(k), (v) => S.setVolume(k, v));
    slider('Mouse sensitivity', () => S.mouseSens, (v) => S.setMouseSens(v), { min: 0.3, max: 2.5, step: 0.05, fmt: (v) => v.toFixed(2) });
    segmented('Subtitles', [[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large']], () => S.subScale, (v) => S.setSubScale(v));
    segmented('Picture', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => pendingQuality, (v) => { pendingQuality = v; rows.at(-1)?.repaint?.(); }, (n) => {
      if (!n) return;
      clear(n);
      if (pendingQuality !== G.quality) {
        const b = h('button', { class: 'apply', type: 'button', tabindex: '-1' }, 'Apply and reload');
        b.addEventListener('click', () => S.reloadWithQuality(pendingQuality));
        n.append(b);
      } else n.textContent = '';
    });

    let focus = 0;
    const paintFocus = () => rows.forEach((r, i) => r.el.classList.toggle('focus', i === focus));
    rows.forEach((r, i) => r.el.addEventListener('mouseenter', () => { focus = i; paintFocus(); }));
    paintFocus();

    const back = h('button', { class: 'mz-back', type: 'button', tabindex: '-1' }, svg(ICON.knot), h('span', null, 'Back'));
    const el = h('div', { class: 'mz-settings' },
      h('div', { class: 'mz-set-panel' },
        h('div', { class: 'mz-set-head' }, h('h2', null, 'Settings'), h('div', { class: 'thread' })),
        rowsEl, back,
        h('div', { class: 'mz-set-hint' }, h('span', { class: 'k' }, 'W'), h('span', { class: 'k' }, 'S'), ' Select', h('i'), h('span', { class: 'k' }, 'A'), h('span', { class: 'k' }, 'D'), ' Adjust', h('i'), h('span', { class: 'k' }, 'Esc'), ' Back')));
    back.addEventListener('click', () => this.settings.close());
    this.settings = ui.openScreen({
      name: 'settings',
      el,
      swallow: true,
      onKey: (e) => {
        if (e.code === 'Escape' || e.code === 'Backspace') { if (!e.repeat) this.settings.close(); return true; }
        if (e.code === 'KeyW' || e.code === 'ArrowUp') { focus = (focus + rows.length - 1) % rows.length; paintFocus(); return true; }
        if (e.code === 'KeyS' || e.code === 'ArrowDown') { focus = (focus + 1) % rows.length; paintFocus(); return true; }
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') { rows[focus].adjust(-1); return true; }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') { rows[focus].adjust(1); return true; }
        if ((e.code === 'Enter' || e.code === 'KeyE') && pendingQuality !== G.quality) { S.reloadWithQuality(pendingQuality); return true; }
        return false;
      },
    });
    return this.settings.closed;
  }
}
