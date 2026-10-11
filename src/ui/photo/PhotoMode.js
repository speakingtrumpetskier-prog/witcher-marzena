// Photo mode (G.photoMode): the world stops, the camera comes loose within a short tether of Vesna, and a
// panel on the right sets the lens, the look and the frame. The picture is saved as a PNG.
//
//   G.photoMode.enter() / exit() / toggle()   enter only from free play (canEnter() says when)
//   G.photoMode.active
//   G.photoMode.capture()                     save the current view (the panel and guides are not in it)
//   G.photoMode.settings                      the live values the panel edits (see DEFAULTS)
//   G.photoMode.lastCapture                   { name, w, h, bytes } of the last saved picture
//
// While active the engine (core/Engine.js) runs only the systems in RUNS (input, the photo camera, the
// sky and lighting, terrain and foliage streaming, UI and audio), holds the clock and the shader time, and
// draws a frame only when something changed. Everything that moves (people, creatures, Kasza, snow, the
// story's timers) is simply not updated, so the scene holds exactly as it was.
//
// Keyboard and mouse: drag to look, W A S D to move, Q and E for height, Shift faster, Alt slower, wheel to
// zoom, Z and C to tilt, click the picture to focus, Space takes the photo, H hides the panel, R resets the
// view, the arrow keys work the panel, Esc or the photo key leaves.
// Pad: left stick move, right stick look, LT and RT height, LB and RB zoom, D-pad works the panel,
// A takes the photo, X hides the panel, Y resets the view, B or Menu leaves.
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';
import { store } from '../dom.js';
import { groundY } from '../../gameplay/player/ground.js';
import { PhotoPass, FILTERS } from './photoPass.js';
import { CROPS, BORDERS, cropRect, paintBorder } from './frames.js';
import { PhotoPanel } from './panel.js';

const RUNS = new Set([
  'input', 'time', 'photo', 'sky', 'atmosphere', 'water', 'vegetation', 'terrain', 'rocks', 'interiors',
  'light-pool', 'village-lod', 'ui', 'audio', 'voice',
]);
const RUN_PREFIX = ['wildFade:'];

const SAVE_KEY = 'marzena.photo';
const TETHER = 16; // metres from Vesna the camera may go
const SAVED = ['dof', 'filter', 'vignette', 'grain', 'crop', 'border', 'grid'];

export const DEFAULTS = {
  fov: 55, tilt: 0,
  dof: 0, focusMode: 'subject', focus: 6,
  exposure: 0, filter: 'None', vignette: 0.35, grain: 0.15,
  crop: 'screen', border: 'None', grid: false,
  hour: 12, hideVesna: false, hideSnow: false,
};

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class PhotoMode {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, pick(JSON.parse(store.get(SAVE_KEY) || '{}'), SAVED)); } catch { /* fresh */ }
    const s = this.settings;
    if (!FILTERS.includes(s.filter)) s.filter = DEFAULTS.filter;
    if (!CROPS.some((c) => c.id === s.crop)) s.crop = DEFAULTS.crop;
    if (!BORDERS.includes(s.border)) s.border = DEFAULTS.border;
    for (const k of ['dof', 'vignette', 'grain']) s[k] = Number.isFinite(+s[k]) ? THREE.MathUtils.clamp(+s[k], 0, 1) : DEFAULTS[k];
    s.grid = s.grid === true;
    this.pass = null;
    this.panel = null;
    this.saved = null; // what enter() changed, for exit()
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.home = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 55 };
    this.dirty = 0; // frames still to draw
    this.settleUntil = 0;
    this.wantCapture = false;
    this.lastCapture = null;
    this.drag = null;
    this._dragAcc = { dx: 0, dy: 0 };
    this._seed = 1;

    G.addSystem('photo', (dt) => this.update(dt), ORDER.camera);
    this._keys = { onKey: (e) => this._onKey(e) };
    this._wireMouse();
    // The cursor stays free in photo mode (the panel needs it); a lock that lands late is let go.
    document.addEventListener('pointerlockchange', () => { if (this.active && document.pointerLockElement) G.input.exitLock(); });
  }

  // ---- engine hooks -------------------------------------------------------------------------------
  runs(sys) {
    if (sys._photo === undefined) sys._photo = RUNS.has(sys.name) || RUN_PREFIX.some((p) => sys.name.startsWith(p));
    return sys._photo;
  }
  needsRender() {
    return this.dirty > 0 || this.wantCapture || performance.now() < this.settleUntil;
  }
  touch(frames = 2) { this.dirty = Math.max(this.dirty, frames); }
  // Keep drawing for a while (the sky rebuilds its light a beat after the hour changes).
  settle(ms = 1500) { this.settleUntil = Math.max(this.settleUntil, performance.now() + ms); this.touch(); }

  // ---- entering and leaving -----------------------------------------------------------------------
  canEnter() {
    const G = this.G, ui = G.uiImpl;
    return !this.active && !!G.player && (!G.shot || G.params.has('photo')) && G.input?.context === 'game' && G.cameraOwner === 'rig'
      && !G.story?.busy && !G.player.dead && !ui?.menuOpen && !ui?.titleActive && !ui?.overlays?.lbOn;
  }

  toggle() { if (this.active) this.exit(); else this.enter(); }

  enter() {
    if (!this.canEnter()) return false;
    const G = this.G, ui = G.uiImpl, cam = G.camera;
    this.saved = {
      owner: G.cameraOwner,
      context: G.input.context,
      frozen: G.time.frozen,
      hours: G.time.hours,
      fov: cam.fov,
      pos: cam.position.clone(),
      quat: cam.quaternion.clone(),
      vesnaVisible: G.player.character?.root?.visible ?? true,
      snowVisible: G.weather?.snowfall?.mesh?.visible ?? true,
      driftVisible: G.weather?.drift?.mesh?.visible ?? true,
      exposure: G.postfx?.exposure ?? 1,
    };
    G.cameraOwner = 'photo';
    G.input.context = 'photo';
    G.time.frozen = true;
    ui?.releaseLock?.();
    ui?.hints?.hide?.();
    _e.setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = _e.y;
    this.pitch = _e.x;
    this.vel.set(0, 0, 0);
    this.home.pos.copy(cam.position);
    this.home.yaw = this.yaw;
    this.home.pitch = this.pitch;
    this.home.fov = cam.fov;
    const s = this.settings;
    s.fov = cam.fov;
    s.tilt = 0;
    s.hour = G.time.hours;
    s.hideVesna = false;
    s.hideSnow = false;
    s.focusMode = 'subject';
    s.focus = this._subjectDistance();
    if (!this.pass) this.pass = new PhotoPass(G);
    this.active = true;
    this.panel = new PhotoPanel(G, this);
    ui?.root.classList.add('mz-photo-on');
    ui?.pushKeys(this._keys);
    G.renderer.domElement.classList.add('mz-photo-canvas');
    this._applyLook();
    this.settle(600);
    G.events.emit('photo:enter', {});
    try { G.audio?.sfx?.('ui_open', { volume: 0.4 }); } catch { /* optional */ }
    return true;
  }

  exit() {
    if (!this.active) return;
    const G = this.G, ui = G.uiImpl, cam = G.camera, sv = this.saved;
    this.active = false;
    this.wantCapture = false;
    this.drag = null;
    this.panel?.dispose();
    this.panel = null;
    ui?.root.classList.remove('mz-photo-on');
    ui?.popKeys(this._keys);
    G.renderer.domElement.classList.remove('mz-photo-canvas', 'dragging');
    if (sv) {
      cam.fov = sv.fov;
      cam.position.copy(sv.pos);
      cam.quaternion.copy(sv.quat);
      cam.updateProjectionMatrix();
      G.time.hours = sv.hours;
      G.time.frozen = sv.frozen;
      if (G.input.context === 'photo') G.input.context = sv.context === 'photo' ? 'game' : sv.context;
      if (G.cameraOwner === 'photo') G.cameraOwner = sv.owner === 'photo' ? 'rig' : sv.owner;
      if (G.player?.character?.root) G.player.character.root.visible = sv.vesnaVisible;
      this._snow(true);
      if (G.postfx) G.postfx.exposure = sv.exposure;
    }
    if (this._restorePR) { G.dynamicRes?.apply(this._restorePR); this._restorePR = 0; }
    this.saved = null;
    this._save();
    if (G.input.context === 'game') ui?.restoreLock?.();
    G.events.emit('photo:exit', {});
    try { G.audio?.sfx?.('ui_close', { volume: 0.4 }); } catch { /* optional */ }
  }

  _save() {
    store.set(SAVE_KEY, JSON.stringify(pick(this.settings, SAVED)));
  }

  // ---- settings -----------------------------------------------------------------------------------
  set(key, value) {
    const s = this.settings, G = this.G;
    if (s[key] === value) return;
    s[key] = value;
    if (key === 'focus') s.focusMode = 'manual';
    if (key === 'focusMode' && value === 'subject') s.focus = this._subjectDistance();
    if (key === 'hour') { G.time.hours = value; this.settle(1800); }
    if (key === 'hideVesna' && G.player?.character?.root) G.player.character.root.visible = !value && (this.saved?.vesnaVisible ?? true);
    if (key === 'exposure' && G.postfx) G.postfx.exposure = (this.saved?.exposure ?? 1) * Math.pow(2, value);
    if (key === 'hideSnow') this._snow(!value);
    if (key === 'fov' || key === 'tilt') this._applyLook();
    if (SAVED.includes(key)) this._save();
    this.panel?.repaint();
    this.touch();
  }

  // Falling and drifting snow on or off (as they were when photo mode began, when on).
  _snow(on) {
    const W = this.G.weather, sv = this.saved;
    if (!W || !sv) return;
    if (W.snowfall?.mesh) W.snowfall.mesh.visible = on && sv.snowVisible;
    if (W.drift?.mesh) W.drift.mesh.visible = on && sv.driftVisible;
  }

  _subjectDistance() {
    const G = this.G, P = G.player;
    if (!P) return 6;
    _v.copy(P.position);
    _v.y += P.mounted ? 2.0 : 1.35;
    return Math.max(0.4, _v.distanceTo(G.camera.position));
  }

  focusAt(clientX, clientY) {
    const el = this.G.renderer.domElement, r = el.getBoundingClientRect();
    const u = (clientX - r.left) / r.width, v = 1 - (clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1 || !this.pass) return;
    const z = this.pass.depthAt(u, v);
    if (!z) return;
    // depthAt gives distance along the view axis; the circle of confusion uses the same measure.
    this.settings.focus = z;
    this.settings.focusMode = 'manual';
    if (!(this.settings.dof > 0)) this.settings.dof = 0.45;
    this.panel?.repaint();
    this.panel?.markFocus(clientX, clientY, z);
    this.touch();
  }

  // ---- the camera --------------------------------------------------------------------------------
  _applyLook() {
    const cam = this.G.camera, s = this.settings;
    _e.set(this.pitch, this.yaw, THREE.MathUtils.degToRad(-s.tilt), 'YXZ');
    cam.quaternion.setFromEuler(_e);
    if (Math.abs(cam.fov - s.fov) > 1e-4) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
  }

  resetView() {
    const cam = this.G.camera;
    cam.position.copy(this.home.pos);
    this.yaw = this.home.yaw;
    this.pitch = this.home.pitch;
    this.vel.set(0, 0, 0);
    this.settings.fov = this.home.fov;
    this.settings.tilt = 0;
    this._applyLook();
    if (this.settings.focusMode === 'subject') this.settings.focus = this._subjectDistance();
    this.panel?.repaint();
    this.touch();
  }

  update(dt) {
    if (!this.active) return;
    const G = this.G, inp = G.input, cam = G.camera, s = this.settings;
    if (G.input.context !== 'photo' || G.cameraOwner !== 'photo') { this.exit(); return; }
    this._padButtons();
    if (!this.active) return;
    let changed = false;

    // Look.
    const zoom = s.fov / 55;
    const dx = this._dragAcc.dx, dy = this._dragAcc.dy;
    this._dragAcc.dx = this._dragAcc.dy = 0;
    const pad = inp.lookPad;
    if (dx || dy || pad.x || pad.y) {
      const inv = G.settings?.invertY ? -1 : 1;
      this.yaw -= (dx * 0.0024 + pad.x * 1.9 * dt) * zoom;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (dy * 0.0024 + pad.y * 1.5 * dt) * zoom * inv, -1.45, 1.45);
      changed = true;
    }
    // Zoom: the wheel, or LB and RB held.
    let fov = s.fov;
    if (inp.wheel) fov *= Math.exp(inp.wheel * 0.07);
    if (inp.keys.has('PadLB')) fov *= Math.exp(dt * 0.9);
    if (inp.keys.has('PadRB')) fov *= Math.exp(-dt * 0.9);
    fov = THREE.MathUtils.clamp(fov, 12, 95);
    if (Math.abs(fov - s.fov) > 1e-3) { s.fov = fov; this.panel?.repaint('fov'); changed = true; }
    // Tilt on Z and C.
    const tiltIn = (inp.keys.has('KeyC') ? 1 : 0) - (inp.keys.has('KeyZ') ? 1 : 0);
    if (tiltIn) { s.tilt = THREE.MathUtils.clamp(s.tilt + tiltIn * 24 * dt, -30, 30); this.panel?.repaint('tilt'); changed = true; }

    // Move: flat W A S D (the arrow keys belong to the panel here) or the left stick; Q and E, LT and RT for height.
    const k = (a) => inp.codesFor(a, 'kbm').some((c) => !c.startsWith('Arrow') && inp.keys.has(c));
    let mx = (k('right') ? 1 : 0) - (k('left') ? 1 : 0);
    let my = (k('forward') ? 1 : 0) - (k('back') ? 1 : 0);
    const st = inp.leftStick;
    if (st && st.mag > Math.hypot(mx, my)) { mx = st.x; my = st.y; }
    const up = (inp.keys.has('KeyE') || inp.keys.has('PadRT') ? 1 : 0) - (inp.keys.has('KeyQ') || inp.keys.has('PadLT') ? 1 : 0);
    const fast = inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight') || inp.down('sprint');
    const slow = inp.keys.has('AltLeft') || inp.keys.has('AltRight');
    const speed = 3.2 * (fast ? 3 : 1) * (slow ? 0.3 : 1);
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _v.set(0, 0, 0).addScaledVector(_fwd, my).addScaledVector(_right, mx);
    if (_v.lengthSq() > 1) _v.normalize();
    _v.multiplyScalar(speed);
    _v.y = up * speed * 0.7;
    this.vel.lerp(_v, 1 - Math.exp(-dt * 9));
    if (this.vel.lengthSq() > 1e-5) {
      cam.position.addScaledVector(this.vel, dt);
      this._constrain();
      changed = true;
    } else this.vel.set(0, 0, 0);

    if (changed) {
      this._applyLook();
      if (s.focusMode === 'subject') { s.focus = this._subjectDistance(); this.panel?.repaint('focus'); }
      this.touch();
    }
    if (this.dirty > 0) this.dirty--;
  }

  // Stay near Vesna, above the ground and out of walls.
  _constrain() {
    const G = this.G, cam = G.camera, P = G.player;
    if (P) {
      _v.copy(P.position);
      _v.y += 1.3;
      const off = cam.position.clone().sub(_v);
      if (off.length() > TETHER) cam.position.copy(_v).addScaledVector(off.normalize(), TETHER);
    }
    G.physics?.resolve?.(cam.position, 0.3);
    const gy = groundY(cam.position.x, cam.position.z, cam.position.y);
    if (Number.isFinite(gy) && cam.position.y < gy + 0.3) cam.position.y = gy + 0.3;
  }

  // ---- input ----------------------------------------------------------------------------------------
  _onKey(e) {
    if (!this.active) return false;
    const G = this.G;
    if (e.code === 'Escape' || (G.input.matches('photo', e.code) && !e.__pad)) { if (!e.repeat) this.exit(); return true; }
    if (e.repeat && !/^Arrow/.test(e.code)) return /^(Space|KeyH|KeyR)$/.test(e.code);
    switch (e.code) {
      case 'Space': this.capture(); return true;
      case 'KeyH': this.panel?.toggle(); this.touch(); return true;
      case 'KeyR': this.resetView(); return true;
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': case 'Enter': case 'NumpadEnter':
        return this.panel ? this.panel.key(e) : false;
      default: return false;
    }
  }

  _padButtons() {
    const inp = this.G.input;
    if (inp.pressed('PadB') || inp.pressed('PadStart')) { this.exit(); return; }
    if (inp.pressed('PadA')) this.capture();
    if (inp.pressed('PadX')) { this.panel?.toggle(); this.touch(); }
    if (inp.pressed('PadY')) this.resetView();
    const nav = { PadUp: 'ArrowUp', PadDown: 'ArrowDown', PadLeft: 'ArrowLeft', PadRight: 'ArrowRight' };
    for (const [btn, code] of Object.entries(nav)) if (inp.pressed(btn)) this.panel?.key({ code, repeat: false });
  }

  _wireMouse() {
    const G = this.G, el = G.renderer.domElement;
    el.addEventListener('mousedown', (e) => {
      if (!this.active || (e.button !== 0 && e.button !== 2)) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      el.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.drag) return;
      this._dragAcc.dx += e.movementX || 0;
      this._dragAcc.dy += e.movementY || 0;
      this.drag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      el.classList.remove('dragging');
      if (this.active && d.button === 0 && d.moved < 6) this.focusAt(e.clientX, e.clientY);
    });
  }

  // ---- drawing and saving ------------------------------------------------------------------------
  frameRect() {
    const R = this.G.renderer, sz = R.getDrawingBufferSize(_v2);
    const crop = CROPS.find((c) => c.id === this.settings.crop) || CROPS[0];
    return cropRect(crop.aspect, sz.x, sz.y);
  }

  _passOptions(forSave) {
    const s = this.settings, R = this.G.renderer, sz = R.getDrawingBufferSize(_v2);
    const rect = this.frameRect();
    const bw = (rect[2] - rect[0]) * sz.x, bh = (rect[3] - rect[1]) * sz.y;
    return {
      blur: s.dof > 0 ? 4 + s.dof * 14 : 0,
      strength: 0.5 + s.dof * 1.5,
      focus: s.focus,
      filter: s.filter,
      vignette: s.vignette,
      grain: s.grain,
      seed: this._seed,
      rect,
      mask: forSave ? 1 : 0.78,
      border: paintBorder(s.border, bw, bh, 3),
    };
  }

  afterRender() {
    if (!this.active || !this.pass) return;
    const save = this.wantCapture;
    this.pass.render(this._passOptions(save));
    this.panel?.layoutGuides(this.frameRect());
    if (save) {
      this.wantCapture = false;
      this._grab();
      if (this._restorePR) {
        this.G.dynamicRes?.apply(this._restorePR);
        this._restorePR = 0;
        this.touch(3);
      }
    }
  }

  // The saved picture is drawn at the full resolution of the quality level, whatever dynamic resolution
  // has lowered the view to; the old scale comes back after the grab.
  capture() {
    if (!this.active || this.wantCapture) return;
    this._seed = (this._seed + 1) % 997;
    const D = this.G.dynamicRes, R = this.G.renderer;
    if (D?.apply && R.getPixelRatio() < D.cap - 0.01) {
      this._restorePR = R.getPixelRatio();
      D.apply(D.cap);
    }
    this.wantCapture = true;
  }

  // Read the crop straight off the canvas in the same task the frame was drawn in.
  _grab() {
    const G = this.G, R = G.renderer, canvas = R.domElement;
    const W = canvas.width, H = canvas.height, r = this.frameRect();
    const sx = Math.round(r[0] * W), sw = Math.round((r[2] - r[0]) * W);
    const sy = Math.round((1 - r[3]) * H), sh = Math.round((r[3] - r[1]) * H);
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const name = `marzena-${stamp()}.png`;
    out.toBlob((blob) => {
      if (!blob) { this.panel?.toast(null, 'The picture could not be saved'); return; }
      this.lastCapture = { name, w: sw, h: sh, bytes: blob.size };
      const url = URL.createObjectURL(blob);
      if (!G.shot) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      this.panel?.toast(url, `Saved ${name}`);
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      G.events.emit('photo:capture', this.lastCapture);
    }, 'image/png');
    this.panel?.flash();
    try { G.audio?.sfx?.('ui_select', { volume: 0.5 }); } catch { /* optional */ }
  }
}

const _v2 = new THREE.Vector2();

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o && o[k] !== undefined) out[k] = o[k];
  return out;
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
