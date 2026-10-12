// Inline SVG icons (strings). One hairline stroke style, currentColor, 24x24 viewBox.
// Everything the UI draws that is not text comes from here or from canvas code.

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICON = {
  ember: S('<path d="M12.2 2.4c.6 3.4 5.2 5.6 5.2 10.4 0 3.6-2.4 6.4-5.4 6.4s-5.4-2.8-5.4-6.4c0-2.6 1.5-4 2.6-5.6.3 1.6 1 2.6 2 3.2.4-3 .4-5.6 1-8z"/><path d="M12 19.4c-1.5 0-2.4-1.1-2.4-2.4 0-1.5 1.1-2.3 1.7-3.4.8 1 2.9 1.7 3.1 3.4.1 1.4-.9 2.4-2.4 2.4z"/>'),
  gale: S('<path d="M3 9h10a2.8 2.8 0 1 0-2.8-2.8"/><path d="M3 14h14.5a2.8 2.8 0 1 1-2.8 2.8"/><path d="M3 19h6.5"/>'),
  ward: S('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2v9.6"/><path d="M8.6 10.6 12 7.2l3.4 3.4"/>'),
  flask: S('<path d="M9.2 3h5.6"/><path d="M10.2 3v5.2L5.6 16.4A2.4 2.4 0 0 0 7.7 20h8.6a2.4 2.4 0 0 0 2.1-3.6L13.8 8.2V3"/><path d="M7.6 14.2h8.8"/>'),
  // The red thread knot: two loops and two ends. Used for decisive choices and objective markers.
  knot: S('<path d="M12 12C9.6 6.4 2.8 5.2 2.8 9.6s6.2 6.4 9.2 2.4zm0 0c2.4-5.6 9.2-6.8 9.2-2.4s-6.2 6.4-9.2 2.4z"/><path d="M12 12 8.6 20.4M12 12l3.4 8.4"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/>'),
  diamond: S('<path d="M12 3.2 19 12l-7 8.8L5 12z"/>'),
  quill: S('<path d="M20.5 3.5C14 4 9.4 8 8.4 14.6L4.6 20.4l1.2.6 3.2-3.6c5.6-.4 9.8-5 11.5-13.9z"/><path d="M9.4 15.4 15.6 9"/>'),
  scroll: S('<path d="M6.5 3h8.3l4.2 4.2V21H6.5z"/><path d="M14.8 3v4.2H19"/><path d="M9.4 12h6.2M9.4 15.6h6.2"/>'),
  coin: S('<circle cx="12" cy="12" r="8.2"/><path d="M9 12h6"/>'),
  pin: S('<path d="M12 21.2s6.2-6 6.2-11.2a6.2 6.2 0 0 0-12.4 0c0 5.2 6.2 11.2 6.2 11.2z"/><circle cx="12" cy="10" r="2.1"/>'),
  info: S('<circle cx="12" cy="12" r="2.2"/>'),
  moon: S('<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>'),
  // Small place glyphs for the compass strip.
  house: S('<path d="M4 12.2 12 5l8 7.2V20H4z"/>'),
  tower: S('<path d="M8.6 21V8.4L12 3.6l3.4 4.8V21"/><path d="M8.6 21h6.8"/>'),
  camp: S('<path d="M3.6 20 12 5l8.4 15z"/>'),
  ring: S('<circle cx="12" cy="12" r="7"/>'),
  cross: S('<path d="M12 3.6v16.8M7 9h10"/>'),
  cave: S('<path d="M3 20.4 9 10l4 6 3-4 5 8.4z"/>'),
  falls: S('<path d="M7 4v14M12 4v16M17 4v14"/>'),
  steam: S('<path d="M8 20c-2-3 2-4 0-7s2-4 0-7M15 20c-2-3 2-4 0-7s2-4 0-7"/>'),
  pass: S('<path d="M3 20 9 8l3 5 3-5 6 12"/>'),
  stone: S('<circle cx="12" cy="12" r="7"/><path d="M12 5v2.4M12 16.6V19M5 12h2.4M16.6 12H19"/>'),
};

// Objective marker: a red diamond with a small bone-coloured thread knot inside it.
export const OBJ_MARK = `<svg viewBox="0 0 24 24"><path class="dia" d="M12 1.8 22.2 12 12 22.2 1.8 12z"/><g class="kn" transform="translate(6.6 6.6) scale(.45)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path vector-effect="non-scaling-stroke" d="M12 12c-1.8-3.2-6.4-4.8-7.6-2.4S6 15.2 9.2 14.4c1.4-.4 2.2-1.2 2.8-2.4zm0 0c1.8 3.2 6.4 4.8 7.6 2.4S18 8.8 14.8 9.6c-1.4.4-2.2 1.2-2.8 2.4z"/><path vector-effect="non-scaling-stroke" d="M12 12l-2.6 7.6M12 12l2.6 7.6"/></g></svg>`;

// Which compass glyph a location gets.
export function locIconName(id) {
  switch (id) {
    case 'village': case 'hanka': case 'westGate': return 'house';
    case 'bellTower': case 'watchtower': return 'tower';
    case 'iceCamp': case 'charcoal': case 'hunterCabin': return 'camp';
    case 'ritual': case 'island': return 'stone';
    case 'graveyard': case 'crossroads': return 'cross';
    case 'bearDen': return 'cave';
    case 'waterfall': case 'mill': return 'falls';
    case 'hotSpring': case 'marsh': return 'steam';
    case 'passStart': return 'pass';
    case 'idol': return 'diamond';
    default: return 'diamond';
  }
}
