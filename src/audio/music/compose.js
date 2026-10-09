// Composition toolkit. A mood's score is a generator that yields bars; sections are written on a
// Score timeline (absolute beats) and then sliced into bars. Helpers here add human expression
// (scoops, falls, grace notes, rolls, slurs, breaths), accompaniment patterns and seeded
// improvisation, so every pass through a mood is a new performance of the same composition.
import { N, step, chord, toMode, MODES, TONIC } from './theory.js';
import { themeNotes, HARMONY, TO_SEVEN, LYRICS, MOTIF } from './theme.js';

export class Score {
  constructor(beats = 3, tempo = 72) {
    this.beats = beats;
    this.tempo = tempo;
    this.notes = [];
    this.n = 0;
    this.tempos = [];
    this.meta = [];
  }
  bars(n) { this.n = Math.max(this.n, n); return this; }
  add(part, t, d, p, o = {}) {
    const ev = { part, t, d, p, ...o };
    this.notes.push(ev);
    const b = Math.floor(t / this.beats + 1e-6) + 1;
    if (b > this.n) this.n = b;
    return ev;
  }
  // Control event (drone on/off, buzz, level, crank...).
  ctl(part, t, o) { return this.add(part, t, o.d ?? 0.5, o.p, o); }
  // Sequential line: seq = [[pitch|name|null, beats, opts?], ...]. Returns the end beat.
  line(part, t, seq, o = {}) {
    for (const [p, d, x] of seq) {
      if (p != null) this.add(part, t, d * (o.legatoScale ?? 1), Array.isArray(p) ? p.map(N) : N(p), { ...o, ...(x || {}) });
      t += d;
    }
    return t;
  }
  tempoAt(bar, bpm) { this.tempos[bar] = bpm; return this; }
  ramp(b0, b1, from, to) {
    for (let b = b0; b <= b1; b++) this.tempos[b] = from + ((to - from) * (b - b0)) / Math.max(1, b1 - b0);
    return this;
  }
  mark(bar, data) { this.meta[bar] = { ...(this.meta[bar] || {}), ...data }; if (bar + 1 > this.n) this.n = bar + 1; return this; }
  *play() {
    const bins = Array.from({ length: this.n }, () => []);
    for (const ev of this.notes) {
      const b = Math.min(this.n - 1, Math.max(0, Math.floor(ev.t / this.beats + 1e-6)));
      bins[b].push({ ...ev, t: ev.t - b * this.beats });
    }
    for (let b = 0; b < this.n; b++) {
      bins[b].sort((x, y) => x.t - y.t);
      yield { beats: this.beats, tempo: this.tempos[b] ?? this.tempo, notes: bins[b], ...(this.meta[b] || {}) };
    }
  }
}

// An empty stretch of bars (rests are music too).
export function* rest(bars, beats = 3, tempo = 60) {
  for (let i = 0; i < bars; i++) yield { beats, tempo, notes: [] };
}

// --- Theme writing with expression -----------------------------------------------------------

// Write theme bars [from, to) for a part starting at beat t0. style: 'voice' | 'choir' | 'fiddle'
// | 'gurdy' | 'flute' | 'box' | 'zither'. Returns the end beat.
export function theme(S, part, t0, r, o = {}) {
  const {
    mode = 'dorian', from = 0, to = 16, octave = 0, v = 0.8, style = 'voice', orn = 0.3,
    seven = false, lyrics = false, hold = 0, falls = 1, vowel = null, scoop = 0.5, transpose = 0,
    extra = {}, cadenceFall = true,
  } = o;
  const notes = themeNotes({ mode, from, to, octave });
  const barLen = seven ? 7 : 3;
  const map = (bt) => (seven ? TO_SEVEN(bt) : bt);
  notes.forEach((n, k) => {
    const barStart = (n.bar - from) * barLen;
    const inBar = n.t - (n.bar - from) * 3;
    let t = t0 + barStart + map(inBar);
    let d = map(inBar + n.d) - map(inBar);
    const phraseStart = n.bar % 4 === 0 && n.i === 0;
    const phraseEnd = n.bar % 4 === 3 && n.last;
    const next = notes[k + 1];
    const ev = { v: v * (phraseStart ? 1.05 : 1) * (0.94 + r() * 0.08), ...extra };
    if (transpose) n.p += transpose;
    if (n.cadence || (phraseEnd && next == null)) d += hold;
    if (style === 'voice' || style === 'choir') {
      if (lyrics) { ev.vowel = vowel || n.vowel; ev.c = n.c; } else ev.vowel = vowel || (n.vowel === 'i' || n.vowel === 'u' ? 'o' : n.vowel);
      if (!phraseEnd && next) ev.tie = true;
      if (n.slide) ev.slide = true;
      if (phraseStart) { ev.breath = true; if (r() < scoop) ev.scoop = r.pick([1, 2, 2, 3]); }
      if (phraseEnd || n.cadence) {
        ev.vib = 1.25;
        if (r() < falls || (n.fall && cadenceFall)) ev.fall = (cadenceFall && n.fall) || r.pick([3, 4, 5]);
        if (!cadenceFall && n.cadence) delete ev.fall;
      } else if (d >= 2 && r() < orn) {
        // A flip up a step late in a long note, the white voice's little cry.
        const up = step(n.p, 1, mode);
        ev.bend = [[d * 0.62, up], [d * 0.62 + 0.18, n.p]];
      } else if (d <= 1 && r() < orn * 0.5 && !n.c) {
        ev.g = step(n.p, 1, mode);
        ev.gt = 0.07;
      }
    } else if (style === 'fiddle' || style === 'flute' || style === 'gurdy') {
      ornamentInstrument(ev, n.p, d, r, style, mode, orn, phraseEnd);
      if (style === 'fiddle' && !phraseEnd && next && r() < 0.55) ev.tie = true;
      // The wheel keeps the gurdy string sounding; only a repeated note lifts the key.
      if (style === 'gurdy' && !phraseEnd && next && next.p !== n.p) ev.tie = true;
      if (style === 'flute' && !phraseEnd && next && r() < 0.35) ev.tie = true;
      if (phraseEnd && style !== 'gurdy' && r() < falls * 0.5) ev.fall = 2;
    }
    S.add(part, t, d, n.p, ev);
    if (lyrics && n.bar % 4 === 0 && n.i === 0) S.mark(Math.floor(t / barLen + 1e-6), { lyric: { line: (n.bar / 4) | 0, text: LYRICS[(n.bar / 4) | 0] } });
  });
  return t0 + (to - from) * barLen + hold;
}

// Grace notes, mordents, rolls, slides and trills for instrumental lines.
export function ornamentInstrument(ev, p, d, r, style, mode, amount, phraseEnd) {
  const up = step(p, 1, mode), dn = step(p, -1, mode);
  const x = r();
  if (x > amount) { if (style === 'fiddle' && d >= 2 && r() < 0.5) ev.scoop = 1; return ev; }
  if (style === 'gurdy') {
    if (d >= 1.5) ev.bend = [[0.0, p], [d * 0.5, up], [d * 0.5 + 0.08, p]];
    else ev.g = up, ev.gt = 0.045;
  } else if (style === 'flute') {
    if (d >= 2 && r() < 0.5) ev.bend = [[0.02, up], [0.1, p], [0.18, dn], [0.26, p]]; // a roll
    else ev.g = step(p, 2, mode), ev.gt = 0.04; // a cut
  } else {
    if (d >= 1.5 && r() < 0.4) ev.bend = trill(p, up, d * 0.5, d * 0.85, 0.11);
    else if (r() < 0.5) ev.g = up, ev.gt = 0.06;
    else ev.scoop = 1;
  }
  if (phraseEnd && d >= 1.5) ev.vib = 1.3;
  return ev;
}

export function trill(p, up, from, to, rate = 0.12) {
  const b = [];
  let k = 0;
  for (let t = from; t < to; t += rate) b.push([t, k++ % 2 ? p : up]);
  b.push([to, p]);
  return b;
}

// An instrumental phrase from note names with ornaments and slurs. seq: [[name|null, beats, x?]].
export function phrase(S, part, t0, seq, r, { style = 'fiddle', mode = 'dorian', orn = 0.3, v = 0.7, octave = 0, slur = 0.5, dbl = null, extra = {}, falls = 0.4 } = {}) {
  let t = t0;
  seq.forEach(([name, d, x], i) => {
    if (name == null) { t += d; return; }
    const p = toMode(N(name), mode) + octave * 12;
    const ev = { v: v * (0.92 + r() * 0.12), ...extra };
    const next = seq[i + 1];
    const end = !next || next[0] == null;
    ornamentInstrument(ev, p, d, r, style, mode, orn, end);
    Object.assign(ev, x || {});
    if (!end && r() < slur && style !== 'gurdy') ev.tie = true;
    if (!end && style === 'gurdy' && N(next[0]) !== N(name)) ev.tie = true;
    if (end && d >= 1.5 && r() < falls && style !== 'gurdy') ev.fall = r.pick([1, 2, 2]);
    if (dbl != null && d >= 1 && p > dbl + 2 && r() < 0.6) ev.dbl = dbl;
    S.add(part, t, d * 0.98, p, ev);
    t += d;
  });
  return t;
}

// A second voice in parallel diatonic thirds (or sixths) below a list of theme notes, closing to
// the fifth or unison on phrase ends, as Slavic village singers harmonize.
export function harmonize(S, part, t0, r, o = {}) {
  const { mode = 'dorian', from = 0, to = 16, steps = -2, v = 0.6, style = 'fiddle', octave = 0, orn = 0.15 } = o;
  const notes = themeNotes({ mode, from, to, octave });
  notes.forEach((n, k) => {
    const end = n.bar % 4 === 3 && n.last;
    const p = end ? step(n.p, n.p % 12 === 2 ? -7 : -4, mode) : step(n.p, steps, mode);
    const ev = { v: v * (0.9 + r() * 0.15) };
    if (!end && notes[k + 1] && r() < 0.6) ev.tie = true;
    if (style !== 'voice') ornamentInstrument(ev, p, n.d, r, style, mode, orn, end);
    S.add(part, t0 + n.t - from * 3, n.d, p, ev);
  });
  return t0 + (to - from) * 3;
}

// Birdsong on the flute: short high calls with trills, spaced irregularly over `beats`.
export function birds(S, part, t0, beats, r, { mode = 'major', v = 0.45, density = 0.5 } = {}) {
  let t = t0 + r() * 1.5;
  while (t < t0 + beats - 1) {
    const base = toMode(r.pick([N('A5'), N('F#5'), N('D6'), N('B5'), N('E5')]), mode, 'major');
    const kind = r.int(0, 3);
    if (kind === 0) { // two-note call
      S.add(part, t, 0.25, base, { v, g: step(base, 2, mode), gt: 0.03 });
      S.add(part, t + 0.35, 0.4, step(base, -1, mode), { v: v * 0.8 });
      t += 0.9;
    } else if (kind === 1) { // trill
      const up = step(base, 1, mode);
      S.add(part, t, 0.9, base, { v: v * 0.9, bend: trill(base, up, 0.05, 0.8, 0.07), vib: 0 });
      t += 1.1;
    } else if (kind === 2) { // falling chirps
      for (let i = 0; i < 3; i++) S.add(part, t + i * 0.22, 0.15, step(base, -i, mode), { v: v * (1 - i * 0.15), g: step(base, 3 - i, mode), gt: 0.03 });
      t += 0.9;
    } else { // long whistle with a lift
      S.add(part, t, 1.2, base, { v: v * 0.7, scoop: 2, vib: 1.4 });
      t += 1.4;
    }
    t += r.range(0.6, 3.5) / Math.max(0.2, density);
  }
  return t0 + beats;
}

// --- Accompaniment -------------------------------------------------------------------------

export const harmonyOf = (mode, bar) => HARMONY[mode][bar % 16];

// Zither patterns over a list of chord symbols (one per bar). Returns end beat.
export function zither(S, part, t0, chords, r, { pattern = 'oompah', v = 0.55, beats = 3, low = 38, high = 60 } = {}) {
  chords.forEach((sym, b) => {
    const t = t0 + b * beats;
    const [a, z] = Array.isArray(sym) ? sym : [sym, sym];
    const bass = chord(a, low, 1)[0];
    const tri = chord(a, high, 3);
    const tri2 = chord(z, high, 3);
    const hv = () => v * (0.85 + r() * 0.2);
    if (pattern === 'oompah') {
      S.add(part, t, 1, bass, { v: hv() * 1.05 });
      if (r() < 0.85) S.add(part, t + 1, 0.9, tri, { v: hv() * 0.6, strum: 0.018, damp: 0.12 });
      S.add(part, t + 2, 0.9, tri2, { v: hv() * 0.55, strum: 0.018, damp: 0.12 });
    } else if (pattern === 'kujawiak') {
      S.add(part, t, 2, bass, { v: hv() });
      S.add(part, t + 2, 1, tri2, { v: hv() * 0.55, strum: 0.03 });
    } else if (pattern === 'strum') {
      S.add(part, t, beats, [bass, ...tri], { v: hv(), strum: 0.035 });
    } else if (pattern === 'arp') {
      const notes = [bass, tri[0], tri[1], tri[2], tri[1] + 12 > 81 ? tri[0] : tri[1] + 0, tri[0] + 12];
      for (let i = 0; i < beats * 2; i++) S.add(part, t + i * 0.5, 1.5, notes[i % notes.length], { v: hv() * (i === 0 ? 1 : 0.6) });
    } else if (pattern === 'sparse') {
      S.add(part, t, beats, bass + 12, { v: hv() * 0.8 });
      if (r() < 0.5) S.add(part, t + r.pick([1, 1.5, 2]), 2, r.pick(tri), { v: hv() * 0.5 });
    }
  });
  return t0 + chords.length * beats;
}

// Drum grooves. A pattern is a list of [beat, kind, velocity] for one bar.
export const GROOVES = {
  waltz: [[0, 'dum', 0.8], [2, 'tek', 0.45]],
  waltzFull: [[0, 'dum', 0.85], [1, 'tek', 0.4], [2, 'tek', 0.5], [2.5, 'ghost', 0.3]],
  march: [[0, 'dum', 0.9], [1, 'ghost', 0.3], [2, 'tek', 0.5]],
  seven: [[0, 'dum', 0.95], [1, 'tek', 0.45], [2, 'dum', 0.7], [3, 'tek', 0.45], [4, 'dum', 0.8], [5, 'tek', 0.5], [6, 'tek', 0.55]],
  sevenB: [[0, 'dum', 1], [1, 'ghost', 0.35], [2, 'slap', 0.7], [3, 'tek', 0.4], [4, 'dum', 0.85], [5, 'ghost', 0.35], [6, 'slap', 0.65]],
  sevenSparse: [[0, 'dum', 0.9], [4, 'dum', 0.6], [6, 'tek', 0.4]],
};
export function groove(S, part, t0, bars, pat, r, { beats = 3, v = 1, fill = 0, humanize = 0.012 } = {}) {
  const g = typeof pat === 'string' ? GROOVES[pat] : pat;
  for (let b = 0; b < bars; b++) {
    const t = t0 + b * beats;
    const isFill = fill && (b % fill === fill - 1);
    for (const [bt, kind, vel] of g) {
      if (isFill && bt >= beats - 3) continue;
      S.add(part, t + bt + r.bi() * humanize, 0.5, null, { kind, v: vel * v * (0.9 + r() * 0.2) });
    }
    if (isFill) {
      const n = r.pick([4, 6, 6]);
      const st = beats - 3;
      for (let i = 0; i < n; i++) S.add(part, t + st + (i * 3) / n, 0.3, null, { kind: i === n - 1 ? 'dum' : r.pick(['tek', 'tek', 'slap']), v: v * (0.45 + (i / n) * 0.5) });
    }
  }
  return t0 + bars * beats;
}

// A roll that swells (frame drum ghost notes crescendo).
export function roll(S, part, t0, beats, r, { v0 = 0.1, v1 = 0.8, rate = 0.25, kind = 'ghost' } = {}) {
  for (let t = 0; t < beats; t += rate) S.add(part, t0 + t + r.bi() * 0.01, 0.2, null, { kind, v: v0 + (v1 - v0) * (t / beats) });
  return t0 + beats;
}

// --- Improvisation -------------------------------------------------------------------------

// A seeded folk phrase: a walk on the mode with leaps toward chord tones, rhythm cells from 3/4,
// landing on a target degree. Returns [[midi, beats, opts], ...].
const CELLS3 = [[1, 1, 1], [2, 1], [1, 2], [1.5, 0.5, 1], [0.5, 0.5, 1, 1], [3], [1, 0.5, 0.5, 1]];
export function improv(r, { bars = 2, mode = 'dorian', lo = N('D4'), hi = N('D5'), start = N('A4'), end = TONIC, cells = CELLS3, leap = 0.25, restEnd = 0 } = {}) {
  const sc = MODES[mode];
  const inMode = (p) => sc.includes((((p - TONIC) % 12) + 12) % 12);
  let p = inMode(start) ? start : toMode(start, mode);
  const out = [];
  for (let b = 0; b < bars; b++) {
    const lastBar = b === bars - 1;
    const cell = lastBar ? r.pick([[1, 2], [3], [2, 1]]) : r.pick(cells);
    cell.forEach((d, i) => {
      const final = lastBar && i === cell.length - 1;
      if (final) p = end;
      else if (i > 0 || b > 0) {
        let k = r.pick([-1, -1, 1, 1, -2, 2, 0]);
        if (r() < leap) k = r.pick([-3, 3, -4, 4]);
        // Drift back toward the middle of the range.
        if (p > hi - 3) k = -Math.abs(k) || -1;
        if (p < lo + 3) k = Math.abs(k) || 1;
        p = step(p, k, mode);
      }
      out.push([p, d - (final ? restEnd : 0), {}]);
    });
  }
  return out;
}

// Music box motif (Wiesia), optionally broken (out of tune, slowing like a dying spring).
export function motif(S, part, t0, r, { octave = 1, v = 0.6, broken = 0, slow = 1, mode = 'dorian' } = {}) {
  let t = t0;
  MOTIF.forEach(([name, d], i) => {
    const p = toMode(N(name), mode) + octave * 12;
    // A wound spring is never quite even: a little rubato and touch on every playing.
    const dd = d * slow * (1 + broken * i * 0.12) * (1 + r.bi() * 0.06);
    S.add(part, t, dd, p, { v: v * (i === 0 ? 1 : 0.9) * (0.88 + r() * 0.2), cents: broken ? -broken * (20 + r() * 50) : 0, loose: broken ? 8 : 2 });
    t += dd;
  });
  return t;
}

export { N, step, chord, toMode, TONIC, MODES, themeNotes, HARMONY, TO_SEVEN, LYRICS };
