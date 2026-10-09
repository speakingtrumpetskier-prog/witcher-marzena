// Pitch names, modes and chords. Everything is in D: Dorian (the song), Phrygian (combat and
// the boss), major (the thaw).
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 'D4' -> 62, 'Eb4' -> 63, 'F#3' -> 54. Numbers pass through.
export function N(s) {
  if (typeof s === 'number' || s == null) return s;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad note ${s}`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const TONIC = 62; // D4
export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

function degree(p, mode) {
  const sc = MODES[mode];
  const rel = p - TONIC;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  const i = sc.indexOf(pc);
  return i < 0 ? null : { i, oct };
}

// Map a pitch from one mode to the same scale degree in another (D Dorian F becomes F# in major).
export function toMode(p, mode, from = 'dorian') {
  if (mode === from || p == null) return p;
  const d = degree(p, from);
  if (!d) return p;
  return TONIC + d.oct * 12 + MODES[mode][d.i];
}

// Diatonic step: stepFrom(A4, +1) = B4 in Dorian, Bb4 in Phrygian.
export function step(p, k, mode = 'dorian') {
  const d = degree(p, mode);
  if (!d) return p + Math.sign(k) * 2;
  const sc = MODES[mode];
  let i = d.i + k, oct = d.oct;
  while (i < 0) { i += 7; oct--; }
  while (i > 6) { i -= 7; oct++; }
  return TONIC + oct * 12 + sc[i];
}

// Chord symbol to pitches around a register. 'Dm', 'C', 'F#m', 'Eb', 'A5' (power), 'Gsus'.
export function chord(sym, base = 50, voices = 3) {
  const m = /^([A-G])(#|b)?(m|5|sus|dim)?$/.exec(sym);
  if (!m) return [base];
  let root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  // Root at or just above base.
  let r = base - (((base % 12) - root + 12) % 12) + 12;
  if (r - base >= 12) r -= 12;
  const q = m[3];
  const iv = q === 'm' ? [0, 3, 7] : q === '5' ? [0, 7, 12] : q === 'sus' ? [0, 5, 7] : q === 'dim' ? [0, 3, 6] : [0, 4, 7];
  const out = [];
  for (let i = 0; i < voices; i++) out.push(r + iv[i % 3] + 12 * Math.floor(i / 3));
  return out;
}
export const rootOf = (sym, base = 38) => chord(sym, base, 1)[0];
