// Keyboard, mouse and gamepad input with action mapping, edge detection, rebinding and pointer lock.
//
// Read state each frame:
//   G.input.down('attack')      held this frame
//   G.input.pressed('interact') went down this frame
//   G.input.released('senses')  went up this frame
//   G.input.move                { x, y } in [-1, 1], y = forward. Keyboard is digital, the left stick is analog
//                               (radial dead zone, response curve) so its length picks walk or run
//   G.input.look                { dx, dy } mouse delta in pixels since last frame
//   G.input.lookPad             { x, y } right stick in [-1, 1] (dead zone and curve applied, y down is +).
//                               The camera integrates it with dt, so it scales on its own from the mouse
//   G.input.wheel               wheel notches since last frame
//
// Devices: G.input.device is 'kbm' or 'pad', switched by the last meaningful input (a key, a click, a mouse
// move of a few pixels, a pad button or a stick pushed past the dead zone). Emits 'input:device' { device } so
// prompts can swap glyphs; 'input:pad' { connected, name, style } when a pad appears or leaves.
//
// Gamepad: Gamepad API standard mapping (PAD_INDEX in bindings.js). Pad buttons live in the same sets as keys
// under the names 'PadA' ... so down/pressed/released treat both alike; triggers read as buttons with hysteresis.
// The sprint button latches while the stick is held (clicking the stick and pushing it is awkward).
//
// Bindings: BINDINGS (keyboard and mouse) and PAD_BINDINGS are live objects of action -> [codes], at most two
// per action. Defaults live in bindings.js; changes persist in localStorage ('marzena.bindings', only the
// differences). bind / unbind / reset / findConflicts drive the Controls screen; 'input:bindings' announces a change.
//
// Menus: while a screen is open (G.input.nav.active()) pad buttons and the left stick are turned into real
// KeyboardEvents (marked __pad, ignored by this class) so every existing key handler works with a pad. A button
// the UI consumed is hidden from the game until it is released.
//
// Rumble: G.input.rumble(strong, weak, ms), only on a pad, honouring G.settings.rumble.
//
// Context: G.input.context is 'game' | 'ui' | 'cutscene'. Gameplay code should ignore actions unless
// context === 'game'. UI code sets context while menus are open.
import { G } from './G.js';
import { store } from '../ui/dom.js';
import {
  DEFAULT_KBM, DEFAULT_PAD, ACTIONS, ACTION, PAD_INDEX, RESERVED_KBM, RESERVED_PAD, clash, setLayoutMap,
} from './bindings.js';

const copy = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.slice()]));
export const BINDINGS = copy(DEFAULT_KBM);
export const PAD_BINDINGS = copy(DEFAULT_PAD);

const STORE_KEY = 'marzena.bindings';
const PREVENT = new Set(['Space', 'Tab', 'F1', 'AltLeft', 'AltRight']);
const PAD_NAMES = Object.keys(PAD_INDEX);
const DPAD = new Set(['PadUp', 'PadDown', 'PadLeft', 'PadRight']);

// What a pad button means to a menu, unless the open screen says otherwise (nav.key).
const NAV_KEYS = {
  PadA: 'Enter', PadB: 'Escape', PadStart: 'Escape', PadX: 'Delete', PadLB: 'KeyQ', PadRB: 'Tab',
  PadUp: 'ArrowUp', PadDown: 'ArrowDown', PadLeft: 'ArrowLeft', PadRight: 'ArrowRight',
};
const STICK_NAV = { StickUp: 'ArrowUp', StickDown: 'ArrowDown', StickLeft: 'ArrowLeft', StickRight: 'ArrowRight' };
const REPEATING = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const NAV_DELAY = 0.4, NAV_RATE = 0.085;

// Radial dead zone: inside it nothing, outside it the remaining range is rescaled to 0..1 and shaped by
// `power` (above 1 gives fine control near the centre). Writes into out and returns the length.
function radial(x, y, dz, power, out) {
  const m = Math.hypot(x, y);
  if (m <= dz) { out.x = out.y = 0; return 0; }
  const k = Math.min(1, (m - dz) / (0.97 - dz));
  const s = Math.pow(k, power) / m;
  out.x = x * s; out.y = y * s;
  return Math.pow(k, power);
}

function validCodes(list) {
  return Array.isArray(list) ? list.filter((c) => typeof c === 'string' && c.length < 24).slice(0, 2) : null;
}

function loadBindings() {
  let saved = null;
  try { saved = JSON.parse(store.get(STORE_KEY) || 'null'); } catch { saved = null; }
  if (!saved) return;
  for (const [maps, live, reserved] of [[saved.k, BINDINGS, RESERVED_KBM], [saved.p, PAD_BINDINGS, RESERVED_PAD]]) {
    if (!maps) continue;
    for (const [action, list] of Object.entries(maps)) {
      const a = ACTION[action];
      const v = validCodes(list);
      if (a && !a.fixed && v) live[action] = v.filter((c) => !reserved.has(c));
    }
  }
}

function saveBindings() {
  const diff = { k: {}, p: {} };
  for (const a of ACTIONS) {
    if (a.fixed) continue;
    if (JSON.stringify(BINDINGS[a.id]) !== JSON.stringify(DEFAULT_KBM[a.id])) diff.k[a.id] = BINDINGS[a.id];
    if (JSON.stringify(PAD_BINDINGS[a.id]) !== JSON.stringify(DEFAULT_PAD[a.id])) diff.p[a.id] = PAD_BINDINGS[a.id];
  }
  const empty = !Object.keys(diff.k).length && !Object.keys(diff.p).length;
  store.set(STORE_KEY, empty ? '' : JSON.stringify(diff));
}

const keyName = (code) => {
  const m = /^Key([A-Z])$/.exec(code);
  return m ? m[1].toLowerCase() : code;
};

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.prev = new Set();
    this.frameDown = new Set();
    this.frameUp = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.lookPad = { x: 0, y: 0 };
    this.wheel = 0;
    this._lookAcc = { dx: 0, dy: 0 };
    this._wheelAcc = 0;
    this.context = 'game';
    this.locked = false;
    this.enabled = true;
    this.lastTap = {};

    this.device = 'kbm';
    this.padConnected = false;
    this.padName = '';
    this.padDown = new Set(); // pad buttons physically held
    this.nav = null; // { active(): bool, key(button): code | null }, set by the UI
    this._pad = null;
    this._padIndex = -1;
    this._consumed = new Set(); // held buttons a menu took; the game never sees them
    this._navHeld = new Map(); // button -> { code, t, rep } while a menu key is held down
    this._padCapture = null;
    this._ls = { x: 0, y: 0 };
    this._rs = { x: 0, y: 0 };
    this._lsMag = 0;
    this._sprintOn = false;
    this._sprintIdle = 0;
    this._mouseMoved = 0;
    this._rumbleAt = 0;
    this._memo = new Map();

    loadBindings();

    const kd = (e) => {
      if (e.__pad || e.repeat) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      this._seen('kbm');
      this.keys.add(e.code);
      this.frameDown.add(e.code);
    };
    const ku = (e) => {
      if (e.__pad) return;
      this.keys.delete(e.code);
      this.frameUp.add(e.code);
    };
    const md = (e) => {
      const c = 'Mouse' + e.button;
      this._seen('kbm');
      this.keys.add(c);
      this.frameDown.add(c);
    };
    const mu = (e) => {
      const c = 'Mouse' + e.button;
      this.keys.delete(c);
      this.frameUp.add(c);
    };
    const mm = (e) => {
      this._mouseMoved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      if (this.locked) {
        this._lookAcc.dx += e.movementX;
        this._lookAcc.dy += e.movementY;
      }
    };
    const wh = (e) => { this._wheelAcc += Math.sign(e.deltaY); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    dom.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', mm);
    dom.addEventListener('wheel', wh, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys.clear(); this._sprintOn = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    window.addEventListener('gamepadconnected', () => this._scanPads());
    window.addEventListener('gamepaddisconnected', () => this._scanPads());
    try { navigator.keyboard?.getLayoutMap?.().then((m) => { setLayoutMap(m); G.events.emit('input:bindings', {}); }).catch(() => {}); } catch { /* optional */ }

    // Feel: a short buzz for the moments that matter. Off with G.settings.rumble = false.
    G.events.on('player:hit', (p) => this.rumble(Math.min(1, 0.35 + (p?.amount ?? 10) * 0.012), 0.6, 240));
    G.events.on('player:parry', () => this.rumble(0.2, 0.9, 120));
    G.events.on('enemy:hit', (p) => { if (p?.hit?.kind === 'heavy' || p?.hit?.stagger) this.rumble(0.55, 0.3, 140); });
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) {
      try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- device ------------------------------------------------------------------------------------
  _seen(device) {
    if (this.device === device) return;
    this.device = device;
    document.documentElement.dataset.input = device;
    G.events.emit('input:device', { device });
  }

  // 'xbox' or 'playstation': the glyph set for pad prompts (G.settings.padStyle overrides the guess).
  get padStyle() {
    const pref = G.settings?.padStyle;
    if (pref === 'xbox' || pref === 'playstation') return pref;
    const id = this.padName;
    if (/xbox|xinput|045e/i.test(id)) return 'xbox';
    return /dualshock|dualsense|054c|playstation|ps[345]|^wireless controller/i.test(id) ? 'playstation' : 'xbox';
  }

  _scanPads() {
    const list = navigator.getGamepads?.() || [];
    let pick = null;
    for (const gp of list) {
      if (!gp || !gp.connected || gp.buttons.length < 12) continue;
      if (gp.index === this._padIndex) { pick = gp; break; }
      pick = pick || gp;
    }
    this._pad = pick;
    this._padIndex = pick ? pick.index : -1;
    const connected = !!pick;
    const name = pick ? pick.id : '';
    if (connected !== this.padConnected || name !== this.padName) {
      this.padConnected = connected;
      this.padName = name;
      if (!connected) this._releasePad();
      G.events.emit('input:pad', { connected, name, style: this.padStyle });
    }
  }

  _releasePad() {
    for (const b of this.padDown) this._padRelease(b);
    this.padDown.clear();
    this._ls.x = this._ls.y = this._rs.x = this._rs.y = 0;
    this._lsMag = 0;
    this.lookPad.x = this.lookPad.y = 0;
    this._sprintOn = false;
  }

  // ---- per frame ---------------------------------------------------------------------------------
  // The left stick alone (y forward is +), for code that reads the keys separately (photo mode).
  get leftStick() { return { x: this._ls.x, y: -this._ls.y, mag: this._lsMag }; }

  // Called once per frame by the engine before systems update.
  poll(dt = 1 / 60) {
    this.look.dx = this._lookAcc.dx;
    this.look.dy = this._lookAcc.dy;
    this._lookAcc.dx = this._lookAcc.dy = 0;
    this.wheel = this._wheelAcc;
    this._wheelAcc = 0;
    if (this._mouseMoved > 14) this._seen('kbm');
    this._mouseMoved = 0;

    this._pollPad(dt);

    this._down = this.frameDown;
    this._up = this.frameUp;
    this.frameDown = new Set();
    this.frameUp = new Set();

    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    const l = Math.hypot(x, y);
    this.move.x = l > 1 ? x / l : x;
    this.move.y = l > 1 ? y / l : y;
    // The stick wins when it is pushed further than the keys.
    if (this._lsMag > Math.hypot(this.move.x, this.move.y)) {
      this.move.x = this._ls.x;
      this.move.y = -this._ls.y;
    }
    this.lookPad.x = this._rs.x;
    this.lookPad.y = this._rs.y;
  }

  _pollPad(dt) {
    this._scanPads();
    const gp = this._pad;
    if (!gp) return;
    const nowDown = new Set();
    const b = gp.buttons;
    for (const name of PAD_NAMES) {
      const idx = PAD_INDEX[name], btn = b[idx];
      if (!btn) continue;
      let on = btn.pressed;
      if (idx === 6 || idx === 7) on = this.padDown.has(name) ? btn.value > 0.35 : btn.value > 0.55;
      if (on) nowDown.add(name);
    }

    const dz = G.settings?.padDeadzone ?? 0.18;
    const ax = gp.axes;
    this._lsMag = radial(ax[0] || 0, ax[1] || 0, dz, 1.3, this._ls);
    const rMag = radial(ax[2] || 0, ax[3] || 0, Math.max(0.08, dz * 0.8), 1.7, this._rs);
    if (this._lsMag > 0.45 || rMag > 0.45) this._seen('pad');

    for (const n of nowDown) if (!this.padDown.has(n)) this._padPress(n);
    for (const n of this.padDown) if (!nowDown.has(n)) this._padRelease(n);
    this.padDown = nowDown;

    // Sprint stays on while the stick is held and drops a moment after it is let go.
    if (this._sprintOn) {
      if (this._lsMag < 0.12) this._sprintIdle += dt; else this._sprintIdle = 0;
      if (this._sprintIdle > 0.2) this._sprintOn = false;
    }

    if (this._navActive() && !this._padCapture) this._pollStickNav();
    else if (this._navHeld.size) this._releaseNav();
    this._tickNav(dt);
  }

  _navActive() { return this.nav ? !!this.nav.active() : this.context === 'ui'; }

  _padPress(btn) {
    this._seen('pad');
    if (this._padCapture) {
      const cb = this._padCapture;
      this._padCapture = null;
      this._consumed.add(btn);
      cb(btn);
      return;
    }
    if (this._navActive()) {
      const code = this.nav?.key?.(btn) ?? NAV_KEYS[btn];
      if (code) {
        const handled = this._emitKey('keydown', code, false);
        this._navHeld.set(btn, { code, t: NAV_DELAY, rep: REPEATING.has(code) });
        if (handled || DPAD.has(btn)) { this._consumed.add(btn); return; }
      } else if (DPAD.has(btn)) { this._consumed.add(btn); return; }
    }
    if (PAD_BINDINGS.sprint.includes(btn)) {
      this._sprintOn = !this._sprintOn || this._lsMag < 0.12;
      this._sprintIdle = 0;
    }
    this.keys.add(btn);
    this.frameDown.add(btn);
  }

  _padRelease(btn) {
    const held = this._navHeld.get(btn);
    if (held) { this._emitKey('keyup', held.code, false); this._navHeld.delete(btn); }
    if (this._consumed.delete(btn)) return;
    this.keys.delete(btn);
    this.frameUp.add(btn);
  }

  // The left stick as four digital directions for menus.
  _pollStickNav() {
    const { x, y } = this._ls;
    const want = { StickUp: y < -0.6, StickDown: y > 0.6, StickLeft: x < -0.6, StickRight: x > 0.6 };
    for (const [name, code] of Object.entries(STICK_NAV)) {
      const held = this._navHeld.get(name);
      if (want[name] && !held) {
        this._emitKey('keydown', code, false);
        this._navHeld.set(name, { code, t: NAV_DELAY, rep: true });
      } else if (!want[name] && held) {
        this._emitKey('keyup', code, false);
        this._navHeld.delete(name);
      }
    }
  }

  // The menu closed (or a capture began) with keys still held: let go of them.
  _releaseNav() {
    for (const h of this._navHeld.values()) this._emitKey('keyup', h.code, false);
    this._navHeld.clear();
  }

  _tickNav(dt) {
    for (const h of this._navHeld.values()) {
      if (!h.rep) continue;
      h.t -= dt;
      if (h.t <= 0) { h.t = NAV_RATE; this._emitKey('keydown', h.code, true); }
    }
  }

  _emitKey(type, code, repeat) {
    const ev = new KeyboardEvent(type, { code, key: keyName(code), repeat, bubbles: true, cancelable: true });
    ev.__pad = true;
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  // The next pad button press goes to cb(buttonName) instead of the game or the menu. Returns a cancel function.
  capturePad(cb) {
    this._padCapture = cb;
    return () => { if (this._padCapture === cb) this._padCapture = null; };
  }

  // ---- actions ------------------------------------------------------------------------------------
  _codes(action) {
    let c = this._memo.get(action);
    if (!c) {
      const k = BINDINGS[action], p = PAD_BINDINGS[action];
      c = k || p ? [...(k || []), ...(p || [])] : [action];
      this._memo.set(action, c);
    }
    return c;
  }
  down(action) {
    if (!this.enabled) return false;
    if (action === 'sprint' && this._sprintOn) return true;
    return this._codes(action).some((c) => this.keys.has(c));
  }
  pressed(action) {
    if (!this.enabled || !this._down) return false;
    return this._codes(action).some((c) => this._down.has(c));
  }
  released(action) {
    if (!this.enabled || !this._up) return false;
    return this._codes(action).some((c) => this._up.has(c));
  }
  // Pad only: the UI opens pause, journal and map from a pad press through this (keys arrive as DOM events).
  padPressed(action) {
    if (!this.enabled || !this._down) return false;
    return (PAD_BINDINGS[action] || []).some((c) => this._down.has(c));
  }
  // True if the action was pressed twice within `window` seconds (e.g. double-tap dodge to roll).
  doubleTapped(action, now, window = 0.3) {
    if (!this.pressed(action)) return false;
    const last = this.lastTap[action] || -10;
    this.lastTap[action] = now;
    return now - last < window;
  }

  // ---- bindings -------------------------------------------------------------------------------------
  // The codes bound to an action for 'kbm' or 'pad' (defaults to the device in use).
  codesFor(action, kind = this.device) { return (kind === 'pad' ? PAD_BINDINGS : BINDINGS)[action] || []; }
  // Does this key code trigger the action? (UI key handlers use it so rebinding reaches them.)
  matches(action, code) { return (BINDINGS[action] || []).includes(code); }
  isDefault(action, kind) {
    const live = kind === 'pad' ? PAD_BINDINGS : BINDINGS, def = kind === 'pad' ? DEFAULT_PAD : DEFAULT_KBM;
    return JSON.stringify(live[action]) === JSON.stringify(def[action]);
  }

  // Actions that already use `code` in a context shared with `action`: [{ action, slot }].
  findConflicts(action, kind, code) {
    const A = ACTION[action], map = kind === 'pad' ? PAD_BINDINGS : BINDINGS, out = [];
    if (!A) return out;
    for (const o of ACTIONS) {
      if (o.fixed || !clash(A, o)) continue;
      const slot = (map[o.id] || []).indexOf(code);
      if (slot >= 0) out.push({ action: o.id, slot });
    }
    return out;
  }

  // Put `code` in slot 0 or 1 of an action. With a clash and no `mode`, nothing changes and the clashes come
  // back. mode: 'swap' gives the other action what this slot held, 'steal' unbinds the other, 'both' keeps both.
  bind(action, kind, slot, code, mode) {
    const A = ACTION[action];
    if (!A || A.fixed) return { ok: false, reason: 'fixed', conflicts: [] };
    if ((kind === 'pad' ? RESERVED_PAD : RESERVED_KBM).has(code)) return { ok: false, reason: 'reserved', conflicts: [] };
    const map = kind === 'pad' ? PAD_BINDINGS : BINDINGS;
    const list = map[action] || (map[action] = []);
    if (list[slot] === code) return { ok: true, conflicts: [] };
    const conflicts = this.findConflicts(action, kind, code).filter((c) => !(c.action === action));
    if (conflicts.length && !mode) return { ok: false, reason: 'conflict', conflicts };
    const old = list[slot] ?? null;
    for (const c of conflicts) {
      const other = map[c.action];
      if (mode === 'swap' && old && !other.includes(old)) other[c.slot] = old;
      else if (mode === 'swap' || mode === 'steal') other.splice(c.slot, 1);
    }
    const dup = list.indexOf(code);
    if (dup >= 0) { list.splice(dup, 1); if (dup < slot) slot--; }
    if (slot >= list.length) list.push(code); else list[slot] = code;
    this._changed();
    return { ok: true, conflicts };
  }

  unbind(action, kind, slot) {
    const A = ACTION[action];
    if (!A || A.fixed) return false;
    const list = (kind === 'pad' ? PAD_BINDINGS : BINDINGS)[action];
    if (!list || slot >= list.length) return false;
    list.splice(slot, 1);
    this._changed();
    return true;
  }

  // Back to the defaults: one action, one kind, or everything.
  reset(action, kind) {
    for (const a of ACTIONS) {
      if (a.fixed || (action && a.id !== action)) continue;
      if (!kind || kind === 'kbm') BINDINGS[a.id] = DEFAULT_KBM[a.id].slice();
      if (!kind || kind === 'pad') PAD_BINDINGS[a.id] = DEFAULT_PAD[a.id].slice();
    }
    this._changed();
  }

  _changed() {
    this._memo.clear();
    saveBindings();
    G.events.emit('input:bindings', {});
  }

  // ---- rumble ----------------------------------------------------------------------------------------
  rumble(strong = 0.5, weak = 0.5, ms = 150) {
    if (this.device !== 'pad' || G.settings?.rumble === false) return;
    const now = performance.now();
    if (now - this._rumbleAt < 60) return;
    this._rumbleAt = now;
    const act = this._pad?.vibrationActuator;
    if (!act?.playEffect) return;
    try {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong });
      if (p && p.catch) p.catch(() => {});
    } catch { /* optional */ }
  }
}
