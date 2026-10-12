// The Marzanno song (DESIGN 6.1): D Dorian, 3/4, sixteen bars in four phrases A A' B B'.
// The main theme, the lullaby and the procession song are this one tune. Each note carries the
// sung vowel and leading consonant of its syllable so voices and the choir "sing the words".
import { N, toMode } from './theory.js';

// [pitch, beats, vowel, consonant, extra]
const BARS = [
  // A: Marzanno, Marzanno, white bride of the frost,
  [['A4', 1, 'a', 'm'], ['A4', 1, 'a', 'z'], ['G4', 1, 'o', 'n']],
  [['F4', 1, 'a', 'm'], ['E4', 1, 'a', 'z'], ['D4', 1, 'o', 'n']],
  [['F4', 1, 'a', 'w'], ['G4', 1, 'a', 'b'], ['A4', 1, 'o', 'v']],
  [['E4', 3, 'o', 'f']],
  // A': we carry you, we carry you, to the water deep.
  [['A4', 1, 'e', 'w'], ['A4', 1, 'a', 'k'], ['C5', 1, 'i', 'r']],
  [['B4', 1, 'u', 'j'], ['A4', 1, 'e', 'w'], ['G4', 1, 'a', 'k']],
  [['F4', 1, 'u', 'r'], ['E4', 1, 'o', 't'], ['F4', 1, 'a', 'w']],
  [['D4', 3, 'e', 'd']],
  // B: Do not follow, do not follow, we will not look back.
  [['D5', 2, 'o', 'd'], ['C5', 1, 'o', 'n']],
  [['A4', 2, 'o', 'f'], ['G4', 1, 'o', 'l']],
  [['A4', 1, 'e', 'w'], ['C5', 1, 'o', 'n'], ['D5', 1, 'u', 'l']],
  [['A4', 3, 'a', 'b']],
  // B': Go down, go down, and let the green come back. (The fall: F4 slides down to D4.)
  [['G4', 1, 'o', 'g'], ['A4', 1, 'a', 'd'], ['F4', 1, 'o', 'g']],
  [['E4', 1, 'a', 'd'], ['D4', 1, 'a', null], ['C4', 1, 'e', 'l']],
  [['D4', 1, 'e', null], ['E4', 1, 'i', 'g'], ['F4', 1, 'u', 'k']],
  [['E4', 2, 'a', 'b', { slide: true }], ['D4', 1, 'a', null, { slide: true, fall: 4, cadence: true }]],
];

export const LYRICS = [
  'Marzanno, Marzanno, white bride of the frost,',
  'we carry you, we carry you, to the water deep.',
  'Do not follow, do not follow, we will not look back.',
  'Go down, go down, and let the green come back.',
];

export const PHRASE = { A: [0, 4], A2: [4, 8], B: [8, 12], B2: [12, 16] };

// Harmony per bar (or [first two beats, last beat]) for each mode.
export const HARMONY = {
  dorian: ['Dm', 'C', 'F', 'Am', 'F', 'G', 'Dm', 'Dm', 'Dm', 'F', 'Dm', 'Am', 'C', 'Am', 'Dm', ['Am', 'Dm']],
  major: ['D', 'A', 'D', 'A', 'A', 'G', 'D', 'D', 'D', 'G', 'D', 'A', 'G', 'A', 'D', ['A', 'D']],
  phrygian: ['Dm', 'Eb', 'F', 'Eb', 'F', 'Gm', 'Dm', 'Dm', 'Dm', 'F', 'Dm', 'F', 'Cm', 'Cm', 'Dm', ['Eb', 'Dm']],
};

// Flat note list for bars [from, to): { p, t (beat from start of `from`), d, vowel, c, bar, i, ... }.
export function themeNotes({ mode = 'dorian', from = 0, to = 16, octave = 0 } = {}) {
  const out = [];
  let t = 0;
  for (let b = from; b < to; b++) {
    const bar = BARS[b];
    let bt = 0;
    bar.forEach(([name, d, vowel, c, extra], i) => {
      out.push({ p: toMode(N(name), mode) + octave * 12, t: t + bt, d, vowel, c, bar: b, i, last: i === bar.length - 1, ...(extra || {}) });
      bt += d;
    });
    t += 3;
  }
  return out;
}

// Wiesia's motif on the music box: A4 A4 G4 F4, then the fall to D4.
export const MOTIF = [['A4', 1], ['A4', 1], ['G4', 1], ['F4', 1.5], ['D4', 2.5]];

// The limping 7/8 mapping used when the theme is broken in the boss fight: the three quarter
// beats of each 3/4 bar land on eighths 0, 2 and 4 of a 2+2+3 bar.
export const TO_SEVEN = (beat) => (beat <= 0 ? 0 : beat <= 1 ? 2 * beat : beat <= 2 ? 2 + 2 * (beat - 1) : 4 + 3 * (beat - 2));
