// village: a subdued kujawiak, hungry not merry. A fiddle dance tune in D Dorian over zither
// oom-pah-pah, a soft frame drum, and pauses where only the zither keeps going. Midway the
// fiddle drifts into the Marzanno song over a hurdy-gurdy drone, as if it cannot help it.
import { Score, phrase, theme, zither, groove, harmonyOf } from '../compose.js';
import { P } from './parts.js';

const TUNE_A = [
  ['D5', 0.75], ['C5', 0.25], ['A4', 1], ['A4', 1],
  ['G4', 0.5], ['A4', 0.5], ['F4', 1], ['E4', 1],
  ['D4', 0.75], ['E4', 0.25], ['F4', 1], ['G4', 1],
  ['A4', 1.5], ['G4', 0.5], ['A4', 1],
  ['C5', 0.75], ['B4', 0.25], ['A4', 1], ['G4', 1],
  ['F4', 0.5], ['G4', 0.5], ['A4', 1], ['F4', 1],
  ['E4', 0.75], ['F4', 0.25], ['E4', 1], ['C4', 1],
  ['D4', 2], [null, 1],
];
const TUNE_B = [
  ['A4', 1], ['D5', 1.5], ['C5', 0.5],
  ['A4', 1], ['G4', 1], ['A4', 1],
  ['C5', 0.75], ['D5', 0.25], ['E5', 1], ['D5', 1],
  ['C5', 1.5], ['A4', 1.5],
  ['G4', 1], ['A4', 0.5], ['G4', 0.5], ['F4', 1],
  ['E4', 1], ['F4', 1], ['G4', 1],
  ['A4', 0.75], ['G4', 0.25], ['F4', 1], ['E4', 1],
  ['D4', 3],
];
const HA = ['Dm', 'C', 'Dm', 'Am', 'G', 'F', 'C', 'Dm'];
const HB = ['Dm', 'Dm', 'C', 'F', 'G', 'C', 'Am', 'Dm'];

export default {
  name: 'village',
  tempo: 92,
  beats: 3,
  level: 1,
  parts: {
    fiddle: P.fiddle({ level: 0.3 }),
    zither: P.zither({ level: 0.4 }),
    frame: P.frame({ level: 0.32 }),
    gurdy: P.gurdy({ level: 0.18, pan: -0.35 }),
    flute: P.flute({ level: 0.2 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const tempo = 88 + r.int(0, 6);
      const S = new Score(3, tempo);
      const pat = r.pick(['oompah', 'oompah', 'kujawiak']);
      let t = 0;
      // Intro: the zither alone, sparse.
      S.mark(0, { section: 'intro' });
      t = zither(S, 'zither', t, ['Dm', 'C', 'Dm', 'Am'], r, { pattern: 'sparse', v: 0.5 });
      // A: the fiddle tune, then again with more ornament and double stops on the open D.
      S.mark(4, { section: 'tune A' });
      phrase(S, 'fiddle', t, TUNE_A, r, { v: 0.62, orn: 0.25, slur: 0.45 });
      t = zither(S, 'zither', t, HA, r, { pattern: pat, v: 0.42 });
      phrase(S, 'fiddle', t, TUNE_A, r, { v: 0.66, orn: 0.45, slur: 0.5, dbl: 62 });
      groove(S, 'frame', t + 12, 4, 'waltz', r, { v: 0.45 });
      t = zither(S, 'zither', t, HA, r, { pattern: pat, v: 0.42 });
      // B: higher and plaintive; on odd cycles the flute answers in heterophony.
      S.mark(t / 3, { section: 'tune B' });
      phrase(S, 'fiddle', t, TUNE_B, r, { v: 0.66, orn: 0.3, slur: 0.5 });
      groove(S, 'frame', t, 8, 'waltz', r, { v: 0.48, fill: 8 });
      t = zither(S, 'zither', t, HB, r, { pattern: 'kujawiak', v: 0.42 });
      if (cycle % 2) {
        phrase(S, 'flute', t, TUNE_B, r, { style: 'flute', v: 0.55, orn: 0.4, slur: 0.3, octave: 0 });
        phrase(S, 'fiddle', t, TUNE_B, r, { v: 0.5, orn: 0.2, slur: 0.6, octave: -1 });
      } else phrase(S, 'fiddle', t, TUNE_B, r, { v: 0.62, orn: 0.5, slur: 0.45, dbl: 57 });
      groove(S, 'frame', t, 8, 'waltz', r, { v: 0.45, fill: 4 });
      t = zither(S, 'zither', t, HB, r, { pattern: pat, v: 0.4 });
      // Interlude: the zither picks out the song's first phrase; a drone hums under it.
      S.mark(t / 3, { section: 'zither song' });
      S.ctl('gurdy', t, { type: 'drone', p: [50, 57], v: 0.4, fade: 1.2 });
      theme(S, 'zither', t, r, { from: 0, to: 4, style: 'zither', v: 0.55 });
      t += 12;
      // The fiddle plays the Marzanno song, slower, the dance forgotten for a moment.
      S.mark(t / 3, { section: 'song' });
      for (let b = 0; b < 8; b++) S.tempoAt(t / 3 + b, tempo - 8);
      theme(S, 'fiddle', t, r, { from: 0, to: 8, style: 'fiddle', v: 0.6, orn: 0.35, falls: 0.6 });
      for (let b = 0; b < 8; b++) S.add('zither', t + b * 3, 3, [38 + (harmonyOf('dorian', b) === 'C' ? -2 : harmonyOf('dorian', b) === 'F' ? 3 : 0)], { v: 0.45 });
      t += 24;
      S.ctl('gurdy', t, { type: 'drone', on: false, fade: 1.5 });
      // A breath of nothing.
      t += 6;
      // A again, with the flute doubling, slowing at the end.
      S.mark(t / 3, { section: 'tune A again' });
      phrase(S, 'fiddle', t, TUNE_A, r, { v: 0.6, orn: 0.4, slur: 0.5, dbl: 62 });
      if (cycle % 3 !== 1) phrase(S, 'flute', t, TUNE_A, r, { style: 'flute', v: 0.45, orn: 0.4, slur: 0.3, octave: 1 });
      groove(S, 'frame', t, 6, 'waltz', r, { v: 0.4 });
      t = zither(S, 'zither', t, HA, r, { pattern: pat, v: 0.38 });
      S.ramp(t / 3 - 3, t / 3 - 1, tempo, tempo - 14);
      S.bars(t / 3 + 2);
      yield* S.play();
    }
  },
};
