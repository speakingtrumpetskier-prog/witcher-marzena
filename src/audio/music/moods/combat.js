// combat: D Phrygian in 7/8 (2+2+3). Frame drums drive the groove, the hurdy-gurdy saws a riff
// with its trompette buzzing on every group, the fiddle answers, the war drum marks phrases,
// and the voice throws short cries. Midway the gurdy limps through the Marzanno song in 7/8.
import { Score, phrase, theme, groove, roll, step } from '../compose.js';
import { P } from './parts.js';

// Riffs in eighths, Phrygian.
const RIFF_A = [
  ['D4', 1], ['D4', 1], ['Eb4', 1], ['D4', 1], ['C4', 1], ['Bb3', 1], ['A3', 1],
  ['D4', 2], ['F4', 1], ['Eb4', 1], ['D4', 2], ['A3', 1],
  ['G4', 1], ['F4', 1], ['Eb4', 1], ['D4', 1], ['Eb4', 3],
  ['D4', 1], ['C4', 1], ['Bb3', 1], ['C4', 1], ['D4', 3],
];
const RIFF_B = [
  ['A4', 2], ['Bb4', 1], ['A4', 1], ['G4', 1], ['F4', 1], ['Eb4', 1],
  ['D4', 2], ['F4', 2], ['A4', 3],
  ['Bb4', 1], ['A4', 1], ['G4', 1], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1],
  ['A4', 4], ['D5', 3],
];
const transpose = (seq, k) => seq.map(([n, d]) => [n && step(nameToMidi(n), k, 'phrygian'), d]);
function nameToMidi(n) { return typeof n === 'number' ? n : { D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, C: 0 }[n[0]] + (n[1] === 'b' ? -1 : n[1] === '#' ? 1 : 0) + 12 * (+n[n.length - 1] + 1); }

function buzzGroups(S, t0, bars, r, v = 0.7) {
  for (let b = 0; b < bars; b++) {
    const t = t0 + b * 7;
    S.ctl('gurdy', t, { type: 'buzz', v: v * 1.1, d: 0.8, len: 0.13 });
    S.ctl('gurdy', t + 2, { type: 'buzz', v: v * 0.8, d: 0.8 });
    S.ctl('gurdy', t + 4, { type: 'buzz', v: v * 0.95, d: 0.8 });
    if (r() < 0.5) S.ctl('gurdy', t + 6, { type: 'buzz', v: v * 0.5, d: 0.5 });
  }
}
function cry(S, t, r, v = 0.8) {
  S.add('voice', t, 1.6, r.pick([74, 72, 69]), { v, vowel: r.pick(['e', 'a']), c: 'h', scoop: 3, fall: r.pick([5, 7]), vib: 0, fallTc: 0.08 });
}

export default {
  name: 'combat',
  tempo: 320,
  beats: 7,
  level: 1,
  fadeIn: 0.25,
  parts: {
    gurdy: P.gurdy({ level: 0.3 }),
    fiddle: P.fiddle({ level: 0.3, pan: -0.28 }),
    frame: P.frame({ level: 0.5 }),
    frame2: P.frame({ level: 0.32, pan: 0.3 }),
    war: P.war({ level: 0.55 }),
    voice: P.voice({ level: 0.34, verb: 0.45, pan: 0.1 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(7, 320 + r.int(-6, 6));
      let t = 0;
      S.mark(0, { section: 'intro' });
      S.ctl('gurdy', 0, { type: 'drone', p: [50, 57], v: 0.55, fade: 0.05 });
      S.ctl('gurdy', 0, { type: 'crank', rate: 2.2, depth: 0.04 });
      S.add('war', 0, 2, null, { v: 1 });
      roll(S, 'frame', 0, 14, r, { v0: 0.2, v1: 0.9, rate: 1, kind: 'tek' });
      buzzGroups(S, 7, 1, r, 0.8);
      S.add('war', 11, 2, null, { v: 0.8 });
      t = 14;
      // Riff A twice (second time a fourth up in the middle bars on later cycles).
      S.mark(2, { section: 'riff A' });
      const ra = cycle > 0 && r() < 0.5 ? [...RIFF_A.slice(0, 10), ...transpose(RIFF_A.slice(10, 17), 3), ...RIFF_A.slice(17)] : RIFF_A;
      phrase(S, 'gurdy', t, RIFF_A, r, { style: 'gurdy', mode: 'phrygian', v: 0.8, orn: 0.15 });
      phrase(S, 'gurdy', t + 28, ra, r, { style: 'gurdy', mode: 'phrygian', v: 0.85, orn: 0.3 });
      groove(S, 'frame', t, 8, r() < 0.5 ? 'seven' : 'sevenB', r, { beats: 7, v: 0.9, fill: 4 });
      groove(S, 'frame2', t + 28, 4, 'sevenSparse', r, { beats: 7, v: 0.7 });
      buzzGroups(S, t, 8, r);
      for (let b = 0; b < 8; b += 2) S.add('war', t + b * 7, 2, null, { v: 0.75 });
      t += 56;
      // Riff B: the fiddle answers over drone and buzz.
      S.mark(t / 7, { section: 'riff B' });
      phrase(S, 'fiddle', t, RIFF_B, r, { mode: 'phrygian', v: 0.75, orn: 0.3, slur: 0.35, falls: 0.8 });
      phrase(S, 'fiddle', t + 28, RIFF_B, r, { mode: 'phrygian', v: 0.8, orn: 0.45, slur: 0.35, octave: r() < 0.4 ? 1 : 0, falls: 1 });
      groove(S, 'frame', t, 8, 'sevenB', r, { beats: 7, v: 0.85, fill: 4 });
      buzzGroups(S, t, 8, r, 0.8);
      for (let b = 4; b < 8; b++) S.add('war', t + b * 7, 2, null, { v: 0.6 + (b === 7 ? 0.3 : 0) });
      cry(S, t + 28, r);
      t += 56;
      // The song, broken into 7/8 on the gurdy, the fiddle taking the second phrase.
      S.mark(t / 7, { section: 'song in 7' });
      theme(S, 'gurdy', t, r, { mode: 'phrygian', from: 0, to: 4, seven: true, style: 'gurdy', v: 0.8, orn: 0.2 });
      theme(S, 'fiddle', t + 28, r, { mode: 'phrygian', from: 4, to: 8, seven: true, style: 'fiddle', v: 0.75, orn: 0.3, octave: 0 });
      groove(S, 'frame', t, 4, 'sevenSparse', r, { beats: 7, v: 0.8 });
      groove(S, 'frame', t + 28, 4, 'seven', r, { beats: 7, v: 0.85, fill: 4 });
      buzzGroups(S, t, 8, r, 0.65);
      S.add('war', t, 2, null, { v: 0.9 });
      S.add('war', t + 28, 2, null, { v: 0.9 });
      t += 56;
      // Break: drums alone, cries.
      S.mark(t / 7, { section: 'break' });
      groove(S, 'frame', t, 2, 'seven', r, { beats: 7, v: 1, fill: 2 });
      groove(S, 'frame2', t, 2, 'sevenSparse', r, { beats: 7, v: 0.8 });
      S.add('war', t, 2, null, { v: 1 });
      S.add('war', t + 7, 2, null, { v: 0.8 });
      S.add('war', t + 11, 2, null, { v: 0.8 });
      cry(S, t + 2, r, 0.9);
      t += 14;
      // Riff A and B together, the war drum on every bar.
      S.mark(t / 7, { section: 'riffs together' });
      phrase(S, 'gurdy', t, RIFF_A, r, { style: 'gurdy', mode: 'phrygian', v: 0.85, orn: 0.25 });
      phrase(S, 'gurdy', t + 28, ra, r, { style: 'gurdy', mode: 'phrygian', v: 0.9, orn: 0.35 });
      phrase(S, 'fiddle', t, RIFF_B, r, { mode: 'phrygian', v: 0.65, orn: 0.3, slur: 0.4, octave: 1 });
      phrase(S, 'fiddle', t + 28, RIFF_B, r, { mode: 'phrygian', v: 0.7, orn: 0.4, slur: 0.4, octave: 1, falls: 1 });
      groove(S, 'frame', t, 8, 'seven', r, { beats: 7, v: 0.95, fill: 4 });
      groove(S, 'frame2', t, 8, 'sevenB', r, { beats: 7, v: 0.6 });
      buzzGroups(S, t, 8, r, 0.85);
      for (let b = 0; b < 8; b++) S.add('war', t + b * 7, 2, null, { v: b % 4 === 0 ? 1 : 0.6 });
      if (r() < 0.7) cry(S, t + 49, r);
      t += 56;
      // Turnaround: unison hits on the groups.
      S.mark(t / 7, { section: 'turn' });
      for (const bt of [0, 2, 4, 7, 9, 11]) {
        S.add('frame', t + bt, 0.5, null, { kind: 'dum', v: 1 });
        S.add('war', t + bt, 1, null, { v: bt % 7 === 0 ? 1 : 0.7 });
        S.add('gurdy', t + bt, 1.6, bt < 7 ? 62 : 63, { v: 0.9 });
      }
      roll(S, 'frame2', t + 11, 3, r, { v0: 0.3, v1: 0.9, rate: 0.5, kind: 'tek' });
      t += 14;
      yield* S.play();
    }
  },
};
