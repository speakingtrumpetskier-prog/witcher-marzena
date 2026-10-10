// Button prompts drawn in CSS and SVG: keycaps, a mouse, pad buttons (Xbox and PlayStation sets), sticks and the
// D-pad. No image assets. Glyph elements that show a binding keep themselves current: when the player switches
// between keyboard and pad, rebinds an action or changes the button style, every live glyph redraws.
//
//   codeGlyph(code, style)                     one key, mouse button or pad button -> element
//   actionGlyph(G, action, { device, all })    the binding of an action; device 'auto' follows G.input.device
//   moveGlyph(G, device) / lookGlyph(G, device)  W A S D or the left stick / the mouse or the right stick
//   navGlyph(G, kind, device)                  menu controls: 'updown' 'leftright' 'confirm' 'back' 'clear' 'tabs'
//   hintBar(G, [[kind, 'Select'], ...])        a row of navGlyph + label pairs for a screen footer
//   glyphText(G, action)                       the binding as plain text ('Space', 'RMB', 'LB')
import { h, svg } from './dom.js';
import { keyLabel, padLabel, codeLabel, isPad, isMouse } from '../core/bindings.js';

const live = new Set();
let wired = false;

function wire(G) {
  if (wired) return;
  wired = true;
  const refresh = () => {
    for (const el of live) {
      if (!el.isConnected) { live.delete(el); continue; }
      try { el._refresh(); } catch (e) { console.error('[glyph]', e); }
    }
  };
  for (const name of ['input:device', 'input:bindings', 'input:pad']) G.events.on(name, refresh);
  G.events.on('settings', ({ key }) => { if (key === 'padStyle') refresh(); });
}

// A container whose content is rebuilt by build() whenever the input state changes.
function liveBox(G, cls, build) {
  wire(G);
  const el = h('span', { class: cls });
  el._refresh = () => { el.replaceChildren(...[].concat(build())); };
  el._refresh();
  // Prompts come and go all game; forget the ones that left the page (not the ones still being assembled).
  const now = performance.now();
  if (live.size > 120) for (const e of live) if (!e.isConnected && now - e._born > 3000) live.delete(e);
  el._born = now;
  live.add(el);
  return el;
}

const dev = (G, device) => (device && device !== 'auto' ? device : G.input?.device || 'kbm');
const styleOf = (G) => G.input?.padStyle || 'xbox';

// ---- keys and mouse ------------------------------------------------------------------------------
function cap(text, extra = '') {
  return h('span', { class: `mz-cap${text.length > 1 ? ' wide' : ''}${extra ? ` ${extra}` : ''}`, 'aria-label': text }, text);
}

// A mouse seen from above, the named button filled in.
function mouse(button) {
  const fill = 'fill="currentColor" stroke="none"';
  const parts = {
    Mouse0: `<path d="M2.8 12.4V10.4A9.2 9.2 0 0 1 12 1.2V12.4z" ${fill}/>`,
    Mouse2: `<path d="M21.2 12.4V10.4A9.2 9.2 0 0 0 12 1.2V12.4z" ${fill}/>`,
    Mouse1: `<rect x="9.9" y="3.6" width="4.2" height="7.6" rx="2.1" ${fill}/>`,
  };
  return svg(`<svg viewBox="0 0 24 32" aria-hidden="true"><rect x="2.6" y="1" width="18.8" height="30" rx="9.4" fill="rgba(8,10,14,0.6)" stroke="currentColor" stroke-width="1.5"/>${button ? parts[button] || '' : ''}<path d="M2.8 12.4h18.4M12 1.2v11.2" fill="none" stroke="rgba(8,10,14,0.85)" stroke-width="1"/><rect x="2.6" y="1" width="18.8" height="30" rx="9.4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`, 'mz-mouse');
}

// ---- pad ---------------------------------------------------------------------------------------------
const FACE_COLORS = { PadA: '#9ccf86', PadB: '#e8806a', PadX: '#82b6e6', PadY: '#ecc863' };
const PS_COLORS = { PadA: '#8fb4e8', PadB: '#e8806a', PadX: '#e6a0cc', PadY: '#92d4a4' };
const PS_SHAPES = {
  PadA: '<path d="M8.4 8.4l11.2 11.2M19.6 8.4L8.4 19.6" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
  PadB: '<circle cx="14" cy="14" r="6" fill="none" stroke-width="2.2"/>',
  PadX: '<rect x="8.4" y="8.4" width="11.2" height="11.2" fill="none" stroke-width="2.2" stroke-linejoin="round"/>',
  PadY: '<path d="M14 7.6l6.4 11H7.6z" fill="none" stroke-width="2.2" stroke-linejoin="round"/>',
};
const RING = 'fill="rgba(8,10,14,0.6)" stroke="currentColor" stroke-width="1.5"';

function padSvg(inner, wide = false) {
  return svg(`<svg viewBox="0 0 ${wide ? 38 : 28} 28" aria-hidden="true">${inner}</svg>`, `mz-pad${wide ? ' wide' : ''}`);
}

// A stick seen from above: the well, the cap with its letter. A click is shown by the cap pressed in (dashed ring).
function stick(label, clicked) {
  return padSvg(`<circle cx="14" cy="14" r="11.8" ${RING}/><circle cx="14" cy="14" r="${clicked ? 6.6 : 7.8}" fill="currentColor" opacity="0.92"/>${clicked ? '<circle cx="14" cy="14" r="9.4" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2.2"/>' : ''}<text x="14" y="${clicked ? 16.8 : 17.2}" text-anchor="middle" font-size="${label.length > 1 ? 7 : 9.5}" font-weight="700" fill="#0b0d12" stroke="none">${label}</text>`);
}

function dpad(arms) {
  const on = (a) => (arms.includes(a) ? 'currentColor' : 'rgba(8,10,14,0.6)');
  const arm = (a, d) => `<path d="${d}" fill="${on(a)}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`;
  return padSvg(
    arm('up', 'M10.5 3h7v8.5h-7z') + arm('down', 'M10.5 16.5h7V25h-7z') + arm('left', 'M3 10.5h8.5v7H3z') + arm('right', 'M16.5 10.5H25v7h-8.5z')
    + '<rect x="10.5" y="10.5" width="7" height="7" fill="rgba(8,10,14,0.6)" stroke="currentColor" stroke-width="1.3"/>',
  );
}

function padGlyph(code, style) {
  if (style === 'playstation' && PS_SHAPES[code]) {
    return padSvg(`<circle cx="14" cy="14" r="11.5" ${RING}/><g stroke="${PS_COLORS[code]}">${PS_SHAPES[code]}</g>`);
  }
  switch (code) {
    case 'PadA': case 'PadB': case 'PadX': case 'PadY':
      return padSvg(`<circle cx="14" cy="14" r="11.5" ${RING}/><text x="14" y="19.4" text-anchor="middle" font-size="15" font-weight="700" fill="${FACE_COLORS[code]}" stroke="none">${padLabel(code)}</text>`);
    case 'PadLB': case 'PadRB':
      return padSvg(`<rect x="2" y="6" width="34" height="16" rx="5" ${RING}/><text x="19" y="17.8" text-anchor="middle" font-size="11.5" font-weight="700" fill="currentColor" stroke="none">${padLabel(code, style)}</text>`, true);
    case 'PadLT': case 'PadRT':
      return padSvg(`<path d="M2.5 25.5V13a9 9 0 0 1 9-9h15a9 9 0 0 1 9 9v12.5z" ${RING} stroke-linejoin="round"/><text x="19" y="19.6" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor" stroke="none">${padLabel(code, style)}</text>`, true);
    case 'PadL3': return stick('L3', true);
    case 'PadR3': return stick('R3', true);
    case 'PadUp': return dpad(['up']);
    case 'PadDown': return dpad(['down']);
    case 'PadLeft': return dpad(['left']);
    case 'PadRight': return dpad(['right']);
    case 'PadStart':
      return padSvg(`<circle cx="14" cy="14" r="11.5" ${RING}/><path d="M8.6 10.4h10.8M8.6 14h10.8M8.6 17.6h10.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>`);
    case 'PadBack':
      return padSvg(`<circle cx="14" cy="14" r="11.5" ${RING}/><rect x="8.2" y="10" width="8.4" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11.4 10V8.4h8.4v7H18.2" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
    default:
      return cap(code.replace(/^Pad/, ''));
  }
}

// One code as a drawn glyph: keycap, mouse, or pad button.
export function codeGlyph(code, style = 'xbox') {
  if (!code) return h('span', { class: 'mz-cap none' }, 'None');
  if (isPad(code)) return padGlyph(code, style);
  if (isMouse(code)) {
    if (code === 'Mouse3' || code === 'Mouse4') return cap(keyLabel(code));
    const el = h('span', { class: 'mz-mousecap', 'aria-label': keyLabel(code) }, mouse(code));
    return el;
  }
  return cap(keyLabel(code));
}

// ---- composite glyphs -------------------------------------------------------------------------------
export function moveGlyph(G, device = 'auto') {
  return liveBox(G, 'mz-glyph', () => {
    if (dev(G, device) === 'pad') return stick('L', false);
    const codes = ['forward', 'left', 'back', 'right'].map((a) => G.input.codesFor(a, 'kbm')[0]);
    return h('span', { class: 'mz-caps' }, ...codes.map((c) => cap(c ? keyLabel(c) : '?')));
  });
}

export function lookGlyph(G, device = 'auto') {
  return liveBox(G, 'mz-glyph', () => (dev(G, device) === 'pad' ? stick('R', false) : h('span', { class: 'mz-mousecap', 'aria-label': 'Mouse' }, mouse(null))));
}

// The binding(s) of one action for a device. all: every code, otherwise just the first.
export function actionGlyph(G, action, { device = 'auto', all = false } = {}) {
  return liveBox(G, 'mz-glyph', () => {
    const d = dev(G, device);
    const codes = G.input.codesFor(action, d);
    if (!codes.length) {
      if (d === 'pad' && ['forward', 'back', 'left', 'right'].includes(action)) return stick('L', false);
      return h('span', { class: 'mz-cap none' }, 'None');
    }
    const style = styleOf(G);
    const list = (all ? codes : codes.slice(0, 1)).map((c) => codeGlyph(c, style));
    return list.length > 1 ? list.flatMap((g, i) => (i ? [h('span', { class: 'mz-or' }, 'or'), g] : [g])) : list;
  });
}

export function glyphText(G, action, device = 'auto') {
  const d = dev(G, device);
  const c = G.input.codesFor(action, d)[0];
  return c ? codeLabel(c, styleOf(G)) : 'None';
}

// ---- menu controls ------------------------------------------------------------------------------------
// The key an action has on the keyboard now, as a keycap.
const bound = (G, action, style) => {
  const c = G.input.codesFor(action, 'kbm')[0];
  return c ? codeGlyph(c, style) : cap('None', 'none');
};

export function navGlyph(G, kind, device = 'auto') {
  return liveBox(G, 'mz-glyph', () => {
    const pad = dev(G, device) === 'pad';
    const style = styleOf(G);
    switch (kind) {
      case 'updown': return pad ? dpad(['up', 'down']) : h('span', { class: 'mz-caps' }, cap('↑'), cap('↓'));
      case 'leftright': return pad ? dpad(['left', 'right']) : h('span', { class: 'mz-caps' }, cap('←'), cap('→'));
      case 'confirm': return pad ? padGlyph('PadA', style) : cap('Enter');
      case 'back': return pad ? padGlyph('PadB', style) : cap('Esc');
      case 'clear': return pad ? padGlyph('PadX', style) : cap('Del');
      case 'tabs': return pad ? h('span', { class: 'mz-caps' }, padGlyph('PadLB', style), padGlyph('PadRB', style)) : h('span', { class: 'mz-caps' }, cap('Q'), cap('E'));
      // The journal and map screens (UI.js maps the pad buttons to match).
      case 'track': return pad ? padGlyph('PadY', style) : cap('T');
      case 'map': return pad ? padGlyph('PadX', style) : bound(G, 'map', style);
      case 'journal': return pad ? padGlyph('PadY', style) : bound(G, 'journal', style);
      case 'pan': return pad ? stick('L', false) : cap('Drag');
      case 'zoom': return pad ? h('span', { class: 'mz-caps' }, padGlyph('PadLB', style), padGlyph('PadRB', style)) : cap('Wheel');
      case 'centre': return pad ? padGlyph('PadX', style) : cap('Space');
      default: return cap(String(kind));
    }
  });
}

// A footer: [glyph] label, [glyph] label ...
export function hintBar(G, items, cls = 'mz-hintbar') {
  return h('div', { class: cls }, ...items.map(([kind, label]) => h('span', { class: 'it' }, navGlyph(G, kind), h('span', { class: 'lab' }, label))));
}

// ---- keys named in prompts --------------------------------------------------------------------------
// Story code and the interaction prompt name the default keys ('E', 'LMB', 'Hold RMB'). This maps such a label
// to the action it stands for, so the prompt shows the player's real binding (or the pad button).
const LABELS = {
  E: 'interact', LMB: 'attack', RMB: 'heavy', Q: 'sign', Space: 'dodge', T: 'lock', X: 'horse', F: 'parry', R: 'draw',
  H: 'potion', M: 'map', J: 'journal', Move: 'move', Look: 'look',
};
// 'E' -> { action: 'interact', hold: false }, 'Hold RMB' -> { action: 'senses', hold: true }; null if it is a plain label.
export function labelAction(label) {
  const m = /^(hold\s+)?(.+)$/i.exec(String(label || '').trim());
  if (!m) return null;
  const hold = !!m[1];
  if (hold && m[2].toUpperCase() === 'RMB') return { action: 'senses', hold };
  const action = LABELS[m[2]] || LABELS[m[2].toUpperCase()];
  return action ? { action, hold } : null;
}

// The glyph for a labelled key: its action's binding, the movement keys, or a plain keycap for an unknown label.
export function labelGlyph(G, label) {
  const a = labelAction(label);
  if (!a) return cap(String(label));
  if (a.action === 'move') return moveGlyph(G);
  if (a.action === 'look') return lookGlyph(G);
  return actionGlyph(G, a.action);
}
