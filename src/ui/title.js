// Title screen: G.ui.title() -> Promise<'new' | 'continue'>.
//
// Drives the camera itself (G.cameraOwner = 'title') through the living picture in titleScene.js
// (the ritual ring against the low sun), and restores the previous owner and field of view when
// it closes. The picture fades up from black alone, the name follows, and the first key or click
// (browsers need a gesture for sound anyway) brings in the main theme ('reveal') and the menu,
// unless opts.mood === false. With sound already running there is no wait for a key. A choice resolves the promise at once (the story flow
// then fades to black and loads); the screen keeps drifting under that fade and removes itself
// opts.linger ms later (default 1500). It never lifts a fade itself.
// Options: hour (set the clock, the story flow already does), weather, startAt (seconds into the
// drift), fov, mood.
import { h, svg } from './dom.js';
import { ICON } from './icons.js';
import { menuList } from './menus.js';
import { TitleScene, TITLE_SHOT } from './titleScene.js';

const THREAD = 'M2 8 C 46 3, 98 12, 160 6 S 268 4, 318 7';

export class Title {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.active = false;
    this.t = 0;
    this.scene = new TitleScene(G);
  }

  open(opts = {}) {
    const G = this.G, ui = this.ui;
    if (this.active) return this.promise;
    this.active = true;
    ui.titleActive = true;
    this.t = opts.startAt ?? 0;
    this.opts = opts;
    this.prev = {
      owner: G.cameraOwner,
      fov: G.camera?.fov,
      pos: G.camera?.position.clone(),
      quat: G.camera?.quaternion.clone(),
    };
    G.cameraOwner = 'title';
    if (G.camera && opts.fov !== false) { G.camera.fov = opts.fov ?? TITLE_SHOT.fov; G.camera.updateProjectionMatrix(); }
    // The picture is lit for one hour of the afternoon; the flow holds the clock still.
    try { G.time?.setHours(opts.hour ?? TITLE_SHOT.hour); } catch { /* optional */ }
    this.scene.start();
    if (opts.weather) { try { G.weather?.set?.(opts.weather, 0); } catch { /* optional */ } }
    this.titleFov = G.camera?.fov;
    G.events.emit('title:open', {});

    const hasSave = !!G.state?.hasSave?.();
    const logo = h('div', { class: 'logo' }, 'MARZENA');
    const line = h('div', { class: 'line' },
      svg(`<svg viewBox="0 0 320 14" preserveAspectRatio="none"><path d="${THREAD}" pathLength="1"/></svg>`, 'thread'), svg(ICON.knot, 'kn'));
    const menu = menuList([
      { id: 'new', label: 'New Game' },
      { id: 'continue', label: 'Continue', disabled: !hasSave },
      { id: 'settings', label: 'Settings' },
    ], { onSelect: (it) => this._choose(it.id), sfx: (n) => ui.sfx(n, { volume: 0.4 }) });
    this.menu = menu;
    const cover = h('div', { class: 'cover' });
    const press = h('div', { class: 'press' }, 'Press any key or button');
    const el = h('div', { class: 'mz-title' }, h('div', { class: 'shade' }), h('div', { class: 'box' }, logo, line), h('div', { class: 'menuwrap' }, menu.el), press, cover);
    this.el = el;

    // Wait for a key before the menu when sound is not running yet: the first gesture unlocks it
    // and the theme comes in with the menu.
    this.attract = !G.audio?.ready && !opts.noAttract;
    this._swallow = 0;
    this._unlocked = false;
    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      try { G.audio?.unlock?.(); } catch { /* optional */ }
      if (opts.mood !== false) { try { G.audio?.setMood?.(opts.mood || 'reveal', { fade: 1.5 }); } catch { /* optional */ } }
      if (this.attract) {
        this.attract = false;
        this._swallow = performance.now() + 300; // the key that woke the menu does not also press it
        el.classList.remove('attract');
        el.classList.add('ready');
      }
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this._unlockCleanup = () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };

    this.scr = ui.openScreen({ name: 'title', el, swallow: false, onKey: (e) => { if (!this.attract && performance.now() > this._swallow) menu.key(e); } });
    el.classList.add('intro');
    if (this.attract) el.classList.add('attract');
    else el.classList.add('auto');
    // On first boot the title opens under the loading screen while shaders compile: start the fade up
    // and the camera's opening move only when that screen lifts, so the whole opening is seen.
    (G.loadingDone || Promise.resolve()).then(() => {
      this.scene.t = opts.startAt ?? 0;
      setTimeout(() => el.classList.remove('intro'), 60);
    });
    this.promise = new Promise((resolve) => { this._resolve = resolve; });
    return this.promise;
  }

  async _choose(id) {
    if (this._busy) return;
    if (id === 'settings') { this.ui.openSettings(); return; }
    this._busy = true;
    const G = this.G, ui = this.ui;
    this.el.classList.add('leaving');
    G.events.emit('title:close', { choice: id });
    // Resolve at once: the story flow fades to black and loads while we keep the camera drifting.
    // The screen itself goes away a moment later, under that black.
    this._resolve(id);
    await new Promise((r) => setTimeout(r, this.opts.linger ?? 1500));
    this.scr.close();
    this._unlockCleanup?.();
    this.scene.stop();
    this.active = false;
    ui.titleActive = false;
    if (G.cameraOwner === 'title') G.cameraOwner = this.prev.owner === 'title' ? 'rig' : this.prev.owner;
    if (G.camera && this.prev.fov && G.camera.fov === this.titleFov) { G.camera.fov = this.prev.fov; G.camera.updateProjectionMatrix(); }
    this._busy = false;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.G.cameraOwner !== 'title') return;
    this.scene.update(dt);
  }
}
