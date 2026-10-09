// Keyboard and mouse input with action mapping, edge detection, and pointer lock.
//
// Read state each frame:
//   G.input.down('attack')      held this frame
//   G.input.pressed('interact') went down this frame
//   G.input.released('senses')  went up this frame
//   G.input.move                { x, y } in [-1, 1], y = forward
//   G.input.look                { dx, dy } mouse delta in pixels since last frame
//
// Context: G.input.context is 'game' | 'ui' | 'cutscene'. Gameplay code should ignore
// actions unless context === 'game'. UI code sets context while menus are open.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  dodge: ['Space'],
  attack: ['Mouse0'],
  heavy: ['Mouse2'], // also hunter senses while sheathed
  senses: ['Mouse2'],
  draw: ['KeyR'],
  sign: ['KeyQ'],
  sign1: ['Digit1'],
  sign2: ['Digit2'],
  sign3: ['Digit3'],
  lock: ['Mouse1', 'KeyT'],
  parry: ['KeyF'],
  interact: ['KeyE'],
  horse: ['KeyX'],
  potion: ['KeyH'],
  journal: ['KeyJ'],
  map: ['KeyM'],
  pause: ['Escape'],
  skip: ['Space', 'Escape', 'Enter'],
  advance: ['Space', 'Enter', 'Mouse0', 'KeyE'],
  debugCam: ['F1'],
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
    this.wheel = 0;
    this._lookAcc = { dx: 0, dy: 0 };
    this._wheelAcc = 0;
    this.context = 'game';
    this.locked = false;
    this.enabled = true;
    this.lastTap = {};

    const kd = (e) => {
      if (e.repeat) return;
      if (['Space', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.frameDown.add(e.code);
    };
    const ku = (e) => {
      this.keys.delete(e.code);
      this.frameUp.add(e.code);
    };
    const md = (e) => {
      const c = 'Mouse' + e.button;
      this.keys.add(c);
      this.frameDown.add(c);
    };
    const mu = (e) => {
      const c = 'Mouse' + e.button;
      this.keys.delete(c);
      this.frameUp.add(c);
    };
    const mm = (e) => {
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
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) {
      try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Called once per frame by the engine before systems update.
  poll() {
    this.look.dx = this._lookAcc.dx;
    this.look.dy = this._lookAcc.dy;
    this._lookAcc.dx = this._lookAcc.dy = 0;
    this.wheel = this._wheelAcc;
    this._wheelAcc = 0;
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
  }

  _codes(action) { return BINDINGS[action] || [action]; }
  down(action) {
    if (!this.enabled) return false;
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
  // True if the action was pressed twice within `window` seconds (e.g. double-tap dodge to roll).
  doubleTapped(action, now, window = 0.3) {
    if (!this.pressed(action)) return false;
    const last = this.lastTap[action] || -10;
    this.lastTap[action] = now;
    return now - last < window;
  }
}
