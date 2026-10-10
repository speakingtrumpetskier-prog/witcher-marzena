// Default bindings, the action table and display names for keys and pad buttons. G.input (Input.js)
// owns the live, rebindable copy; the Controls screen reads ACTIONS to build its list.
//
//   DEFAULT_KBM / DEFAULT_PAD   action -> codes. Keyboard codes are KeyboardEvent.code ('KeyW'), mouse buttons are
//                               'Mouse0' (left) 'Mouse1' (middle) 'Mouse2' (right), pad buttons are 'PadA' ... (PAD_INDEX).
//   ACTIONS                     [{ id, label, group, ctx, fixed, hold, mode }] in display order
//   keyLabel(code) / padLabel(code, style)   plain text for a code ('W', 'Space', 'RMB', 'LB')
//
// ctx says where an action is read: 'game' (free play) or 'scene' (cutscenes and dialogue). Two actions
// only conflict when they share a code AND a context; `mode` marks the pair that is exclusive by design
// (heavy attack needs the sword drawn, hunter senses need it sheathed, so both sit on the right mouse button).

// Standard-mapping button indices (Gamepad API). Triggers (6, 7) are analog and read as buttons here.
export const PAD_INDEX = {
  PadA: 0, PadB: 1, PadX: 2, PadY: 3, PadLB: 4, PadRB: 5, PadLT: 6, PadRT: 7,
  PadBack: 8, PadStart: 9, PadL3: 10, PadR3: 11, PadUp: 12, PadDown: 13, PadLeft: 14, PadRight: 15,
};

export const DEFAULT_KBM = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  walk: ['AltLeft', 'AltRight'],
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
  shoulder: ['KeyV'],
  parry: ['KeyF'],
  interact: ['KeyE'],
  horse: ['KeyX'],
  potion: ['KeyH'],
  journal: ['KeyJ'],
  map: ['KeyM'],
  pause: ['Escape'],
  skip: ['Space'],
  advance: ['Space', 'Enter', 'Mouse0', 'KeyE'],
  debugCam: ['F1'],
};

export const DEFAULT_PAD = {
  forward: [], back: [], left: [], right: [], // the left stick
  sprint: ['PadL3'],
  walk: [],
  dodge: ['PadB'],
  attack: ['PadX'],
  heavy: ['PadY'],
  senses: ['PadLT'],
  draw: [],
  sign: ['PadRT'],
  sign1: ['PadLeft'],
  sign2: ['PadUp'],
  sign3: ['PadRight'],
  lock: ['PadR3'],
  shoulder: [],
  parry: ['PadRB'],
  interact: ['PadA'],
  horse: ['PadLB'],
  potion: ['PadDown'],
  journal: [],
  map: ['PadBack'],
  pause: ['PadStart'],
  skip: ['PadB'],
  advance: ['PadA'],
  debugCam: [],
};

export const GROUPS = ['Movement', 'Camera', 'Combat', 'Signs', 'Horse', 'Interaction and senses', 'Menus'];

const G_ = ['game'];
const S_ = ['scene'];
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', ctx: G_, stick: 'Left stick' },
  { id: 'back', label: 'Move back', group: 'Movement', ctx: G_, stick: 'Left stick' },
  { id: 'left', label: 'Step left', group: 'Movement', ctx: G_, stick: 'Left stick' },
  { id: 'right', label: 'Step right', group: 'Movement', ctx: G_, stick: 'Left stick' },
  { id: 'sprint', label: 'Sprint and gallop', group: 'Movement', ctx: G_, hold: true },
  { id: 'walk', label: 'Walk (toggle)', group: 'Movement', ctx: G_ },
  { id: 'lock', label: 'Lock on, or recenter the camera', group: 'Camera', ctx: G_ },
  { id: 'shoulder', label: 'Swap shoulder', group: 'Camera', ctx: G_ },
  { id: 'attack', label: 'Light attack', group: 'Combat', ctx: G_ },
  { id: 'heavy', label: 'Heavy attack', group: 'Combat', ctx: G_, mode: 'drawn' },
  { id: 'dodge', label: 'Dodge (double tap to roll)', group: 'Combat', ctx: G_ },
  { id: 'parry', label: 'Parry, hold to block', group: 'Combat', ctx: G_, hold: true },
  { id: 'draw', label: 'Draw or sheathe the sword', group: 'Combat', ctx: G_ },
  { id: 'potion', label: 'Drink Thaw draught', group: 'Combat', ctx: G_ },
  { id: 'sign', label: 'Cast sign', group: 'Signs', ctx: G_ },
  { id: 'sign1', label: 'Select Ember', group: 'Signs', ctx: G_ },
  { id: 'sign2', label: 'Select Gale', group: 'Signs', ctx: G_ },
  { id: 'sign3', label: 'Select Ward', group: 'Signs', ctx: G_ },
  { id: 'horse', label: 'Whistle for Kasza, mount, dismount', group: 'Horse', ctx: G_ },
  { id: 'interact', label: 'Interact, talk, examine', group: 'Interaction and senses', ctx: ['game', 'scene'] },
  { id: 'senses', label: 'Hunter senses', group: 'Interaction and senses', ctx: G_, hold: true, mode: 'sheathed' },
  { id: 'skip', label: 'Skip a cutscene', group: 'Interaction and senses', ctx: S_, hold: true },
  { id: 'advance', label: 'Continue a dialogue line', group: 'Interaction and senses', ctx: S_, fixed: true },
  { id: 'journal', label: 'Journal', group: 'Menus', ctx: G_ },
  { id: 'map', label: 'Map', group: 'Menus', ctx: G_ },
  { id: 'pause', label: 'Pause menu', group: 'Menus', ctx: G_, fixed: true },
];
export const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

// Never assignable: Escape cancels a capture and leaves menus, Start opens the pause menu.
export const RESERVED_KBM = new Set(['Escape', 'F1', 'MetaLeft', 'MetaRight', 'ContextMenu']);
export const RESERVED_PAD = new Set(['PadStart']);

// Do two actions fight over a code? Only if they are read in the same context and are not the
// intentional pair (heavy attack when drawn, senses when sheathed).
export function clash(a, b) {
  if (a.id === b.id) return false;
  if (!a.ctx.some((c) => b.ctx.includes(c))) return false;
  if (a.mode && b.mode && a.mode !== b.mode) return false;
  return true;
}

// ---- display names ---------------------------------------------------------------------------
let layout = null; // navigator.keyboard layout map, so AZERTY players see Z where the code says KeyW
export function setLayoutMap(map) { layout = map; }

const KEY_NAMES = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Del',
  ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt',
  CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
  Slash: '/', Backslash: '\\', Backquote: '`', IntlBackslash: '\\', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins',
};
const MOUSE_NAMES = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };

export function isMouse(code) { return /^Mouse\d$/.test(code || ''); }
export function isPad(code) { return /^Pad[A-Z0-9]/.test(code || ''); }

export function keyLabel(code) {
  if (!code) return '';
  if (MOUSE_NAMES[code]) return MOUSE_NAMES[code];
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  const lay = layout?.get?.(code);
  if (lay && lay.length === 1) return lay.toUpperCase();
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(code);
  if (m) return `Num ${m[1].replace('Add', '+').replace('Subtract', '-').replace('Multiply', '*').replace('Divide', '/').replace('Decimal', '.')}`;
  m = /^F(\d+)$/.exec(code);
  if (m) return code;
  return code;
}

const PAD_XBOX = {
  PadA: 'A', PadB: 'B', PadX: 'X', PadY: 'Y', PadLB: 'LB', PadRB: 'RB', PadLT: 'LT', PadRT: 'RT',
  PadBack: 'View', PadStart: 'Menu', PadL3: 'Left stick click', PadR3: 'Right stick click',
  PadUp: 'D-pad up', PadDown: 'D-pad down', PadLeft: 'D-pad left', PadRight: 'D-pad right',
};
const PAD_PS = {
  PadA: 'Cross', PadB: 'Circle', PadX: 'Square', PadY: 'Triangle', PadLB: 'L1', PadRB: 'R1', PadLT: 'L2', PadRT: 'R2',
  PadBack: 'Create', PadStart: 'Options', PadL3: 'L3', PadR3: 'R3',
  PadUp: 'D-pad up', PadDown: 'D-pad down', PadLeft: 'D-pad left', PadRight: 'D-pad right',
};
export function padLabel(code, style = 'xbox') {
  return (style === 'playstation' ? PAD_PS : PAD_XBOX)[code] || code;
}

export function codeLabel(code, style) {
  return isPad(code) ? padLabel(code, style) : keyLabel(code);
}
