// Title screen: G.ui.title() -> Promise<'new' | 'continue'>.
//
// Drives the camera itself (G.cameraOwner = 'title') in a slow drift over the frozen lake toward the
// drowned bell tower at dusk, and restores the previous owner and field of view when it closes.
// The first click or key calls G.audio.unlock() (browsers need a gesture) and starts the quiet
// 'night' mood unless opts.mood === false. A choice resolves the promise at once (the story flow
// then fades to black and loads); the screen keeps drifting under that fade and removes itself
// opts.linger ms later (default 1500). It never lifts a fade itself.
// Options: hour (set the clock, the story flow already does), weather, startAt (seconds into the
// drift), fov, mood.
import * as THREE from 'three';
import { h, svg } from './dom.js';
import { ICON } from './icons.js';
import { menuList } from './menus.js';
import { LOC } from '../world/layout.js';

const THREAD = 'M2 8 C 46 3, 98 12, 160 6 S 268 4, 318 7';

export class Title {
  constructor(G, ui) {
    this.G = G;
    this.ui = ui;
    this.active = false;
    this.t = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._look = new THREE.Vector3();
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
    if (G.camera && opts.fov !== false) { G.camera.fov = opts.fov ?? 40; G.camera.updateProjectionMatrix(); }
    // The story flow sets the dusk clock and clear weather before calling us; the gallery asks for it.
    if (opts.hour != null) { try { G.time?.setHours(opts.hour); } catch { /* optional */ } }
    if (opts.weather) { try { G.weather?.set?.(opts.weather, 0); } catch { /* optional */ } }
    this.titleFov = G.camera?.fov;
    G.events.emit('title:open', {});

    const hasSave = !!G.state?.hasSave?.();
    const logo = h('div', { class: 'logo' }, 'MARZENA');
    const line = h('div', { class: 'line' },
      svg(`<svg viewBox="0 0 320 14" preserveAspectRatio="none"><path d="${THREAD}" pathLength="1"/></svg>`, 'thread'), svg(ICON.knot, 'kn'));
    const tag = h('div', { class: 'tag' }, 'A tale of the long winter');
    const menu = menuList([
      { id: 'new', label: 'New Game' },
      { id: 'continue', label: 'Continue', disabled: !hasSave },
      { id: 'settings', label: 'Settings' },
    ], { onSelect: (it) => this._choose(it.id), sfx: (n) => ui.sfx(n, { volume: 0.4 }) });
    this.menu = menu;
    const foot = h('div', { class: 'foot' }, h('span', null, 'Made with three.js and WebAudio, entirely from code'));
    const cover = h('div', { class: 'cover' });
    const el = h('div', { class: 'mz-title' }, h('div', { class: 'shade' }), h('div', { class: 'box' }, logo, line, tag), h('div', { class: 'menuwrap' }, menu.el), foot, cover);
    this.el = el;

    // First gesture: unlock audio, begin the quiet music.
    this._unlocked = false;
    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      try { G.audio?.unlock?.(); } catch { /* optional */ }
      if (opts.mood !== false) { try { G.audio?.setMood?.(opts.mood || 'night', { fade: 4 }); } catch { /* optional */ } }
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this._unlockCleanup = () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };

    this.scr = ui.openScreen({ name: 'title', el, swallow: false, onKey: (e) => menu.key(e) });
    el.classList.add('intro');
    setTimeout(() => el.classList.remove('intro'), 60);
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
    this.active = false;
    ui.titleActive = false;
    if (G.cameraOwner === 'title') G.cameraOwner = this.prev.owner === 'title' ? 'rig' : this.prev.owner;
    if (G.camera && this.prev.fov && G.camera.fov === this.titleFov) { G.camera.fov = this.prev.fov; G.camera.updateProjectionMatrix(); }
    this._busy = false;
  }

  // Camera drift: a slow ping-pong along a gentle arc over the ice, always looking at the tower.
  update(dt) {
    if (!this.active) return;
    const G = this.G;
    this.t += dt;
    if (G.cameraOwner !== 'title' || !G.camera) return;
    const tower = LOC.bellTower;
    const u = (1 - Math.cos(this.t * 0.05)) / 2; // 0..1..0, period about 125 s
    const e = u * u * (3 - 2 * u);
    const a = this._a.set(-150, 9.5, 64), b = this._b.set(-52, 8.2, -34);
    const cam = G.camera;
    cam.position.lerpVectors(a, b, e);
    cam.position.y += Math.sin(this.t * 0.31) * 0.35;
    cam.position.x += Math.sin(this.t * 0.17) * 1.5;
    const gy = G.world?.heightAt?.(cam.position.x, cam.position.z);
    if (Number.isFinite(gy) && cam.position.y < gy + 4) cam.position.y = gy + 4;
    // look slightly left of the tower early on, settle onto it as we drift in
    this._look.set(tower.x - 38 + e * 30, 20 + Math.sin(this.t * 0.11) * 0.8 - e * 3, tower.z + 6);
    cam.lookAt(this._look);
  }
}
