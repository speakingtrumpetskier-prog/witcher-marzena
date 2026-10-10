// Pause menu (Esc, Start) and the settings panel (also reachable from the title screen).
//   Pause: Resume, Journal, Map, Photo mode, Settings, Controls, Save, Quit to Title.
//   Settings: volumes (G.audio.volumes), subtitle size, quality (reloads with ?quality=), and a way into the
//   Controls screen (controls.js: bindings, camera, controller).
import { h, svg, clear } from './dom.js';
import { ICON } from './icons.js';
import { VOLUME_KEYS } from './settings.js';
import { RowList } from './setrows.js';
import { hintBar } from './glyphs.js';

const dayPart = (hr) => (hr < 5 ? 'night' : hr < 9 ? 'morning' : hr < 12 ? 'forenoon' : hr < 17 ? 'afternoon' : hr < 20 ? 'evening' : 'night');

// Generic vertical menu list with a selection marker, keyboard and mouse.
export function menuList(items, { onSelect, sfx } = {}) {
  const el = h('nav', { class: 'mz-menu' });
  let sel = Math.max(0, items.findIndex((i) => !i.disabled));
  const rows = items.map((it, i) => {
    const r = h('button', { class: 'mz-mi' + (it.disabled ? ' dis' : ''), type: 'button', tabindex: '-1' }, svg(ICON.knot, 'mk'), h('span', { class: 'lab' }, it.label));
    r.addEventListener('mouseenter', () => { if (!it.disabled && sel !== i) { sel = i; paint(); sfx?.('ui_hover'); } });
    r.addEventListener('click', () => choose(i));
    el.appendChild(r);
    return r;
  });
  function paint() { rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); }
  function choose(i) {
    const it = items[i];
    if (it.disabled) { rows[i].classList.remove('shake'); void rows[i].offsetWidth; rows[i].classList.add('shake'); return; }
    sfx?.('ui_select');
    onSelect?.(it, i);
  }
  function move(d) {
    const n = items.length;
    let i = sel;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!items[i].disabled) break; }
    sel = i;
    paint();
    sfx?.('ui_hover');
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
    this.ui.controls?.scr?.close();
    this.settings?.close();
    this.pause?.close();
  }

  // ---- pause --------------------------------------------------------------------------------
  openPause() {
    if (this.pause?.open) return this.pause.closed;
    const G = this.G, ui = this.ui;
    // Photo mode needs free play under the menu (the menu itself is what makes canEnter false right now).
    this._photoReady = G.input?.context === 'game' && G.cameraOwner === 'rig' && !G.story?.busy && !G.player?.dead;
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
        { id: 'photo', label: 'Photo mode', disabled: !G.photoMode || !this._photoReady },
        { id: 'settings', label: 'Settings' },
        { id: 'controls', label: 'Controls' },
        { id: 'save', label: this._saved ? 'Saved' : 'Save' },
        { id: 'quit', label: 'Quit to Title' },
      ], { onSelect: (it) => act(it.id), sfx: (n) => ui.sfx(n, { volume: 0.45 }) });
      body.appendChild(list.el);
      updateFoot();
    };
    const showConfirm = () => {
      confirming = true;
      clear(body);
      list = menuList([{ id: 'stay', label: 'Stay' }, { id: 'leave', label: 'Leave the valley' }], { onSelect: (it) => act(it.id), sfx: (n) => ui.sfx(n, { volume: 0.45 }) });
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
      try { ok = G.story?.save ? G.story.save() !== false : !!G.state?.save?.(extra); } catch { ok = false; }
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
        // Close the pause menu first (that hands the context back to play), then step into photo mode.
        case 'photo': if (ui._ctx) ui._ctx.locked = false; this.pause.close(); G.photoMode?.enter(); break;
        case 'settings': this.openSettings(); break;
        case 'controls': this.openControls(); break;
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
        if (G.input.matches('journal', e.code) && !e.repeat) { ui.openJournal(); return true; }
        if (G.input.matches('map', e.code) && !e.repeat) { ui.openMap(); return true; }
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
    const list = new RowList({ sfx: (n) => ui.sfx(n, { volume: 0.3 }) });

    for (const [k, label] of VOLUME_KEYS) list.slider(label, () => S.getVolume(k), (v) => S.setVolume(k, v));
    list.segmented('Subtitles', [[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large']], () => S.subScale, (v) => S.setSubScale(v));
    list.segmented('Picture', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => pendingQuality, (v) => { pendingQuality = v; }, (n) => {
      if (!n) return;
      clear(n);
      if (pendingQuality !== G.quality) {
        const b = h('button', { class: 'apply', type: 'button', tabindex: '-1' }, 'Apply and reload');
        b.addEventListener('click', () => S.reloadWithQuality(pendingQuality));
        n.append(b);
      } else n.textContent = '';
    });
    list.button('Keys, buttons and camera', 'Open controls', () => this.openControls());
    list.setFocus(0);

    const back = h('button', { class: 'mz-back', type: 'button', tabindex: '-1' }, svg(ICON.knot), h('span', null, 'Back'));
    const el = h('div', { class: 'mz-settings' },
      h('div', { class: 'mz-set-panel' },
        h('div', { class: 'mz-set-head' }, h('h2', null, 'Settings'), h('div', { class: 'thread' })),
        list.el, back,
        hintBar(G, [['updown', 'Select'], ['leftright', 'Change'], ['confirm', 'Choose'], ['back', 'Back']], 'mz-set-hint mz-hintbar')));
    back.addEventListener('click', () => this.settings.close());
    this.settings = ui.openScreen({
      name: 'settings',
      el,
      swallow: true,
      onKey: (e) => {
        if (e.code === 'Escape' || e.code === 'Backspace') { if (!e.repeat) this.settings.close(); return true; }
        if ((e.code === 'Enter' || e.code === 'KeyE') && pendingQuality !== G.quality) { S.reloadWithQuality(pendingQuality); return true; }
        return list.key(e);
      },
    });
    return this.settings.closed;
  }

  // ---- controls (keys, buttons, camera) --------------------------------------------------------
  openControls(opts) { return this.ui.controls.open(opts); }
}
