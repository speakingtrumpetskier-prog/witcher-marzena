// thaw: endings A and B. The song resolved into D major. Birdsong on the flute over zither
// arpeggios, the voice alone in major, the fiddle in thirds, then a dance that finally sounds
// glad, then everyone (choir, voice, gurdy, drums) in the full theme. The last fall turns into
// a rise: the voice looks up instead of down. The music box plays the motif once, at peace.
import { Score, theme, harmonize, phrase, zither, groove, birds, motif, harmonyOf } from '../compose.js';
import { P } from './parts.js';

const H = (from, to) => Array.from({ length: to - from }, (_, i) => harmonyOf('major', from + i));
const DANCE = [
  ['D5', 0.75], ['C5', 0.25], ['A4', 1], ['A4', 1], ['G4', 0.5], ['A4', 0.5], ['F4', 1], ['E4', 1],
  ['D4', 0.75], ['E4', 0.25], ['F4', 1], ['G4', 1], ['A4', 1.5], ['G4', 0.5], ['A4', 1],
  ['B4', 0.75], ['C5', 0.25], ['D5', 1], ['B4', 1], ['A4', 0.5], ['G4', 0.5], ['F4', 1], ['A4', 1],
  ['E4', 0.75], ['F4', 0.25], ['G4', 1], ['C4', 1], ['D4', 2], [null, 1],
];
const HD = ['D', 'A', 'D', 'A', 'G', 'D', 'A', 'D'];

export default {
  name: 'thaw',
  tempo: 72,
  beats: 3,
  level: 1,
  parts: {
    voice: P.voice({ level: 0.44 }),
    choirF: P.choirF({ singers: 6, type: 'soprano' }),
    choirM: P.choirM({ type: 'tenor', singers: 4 }),
    gurdy: P.gurdy({ level: 0.22 }),
    fiddle: P.fiddle(),
    flute: P.flute({ level: 0.22, pan: 0.35, verb: 0.4 }),
    zither: P.zither(),
    frame: P.frame({ level: 0.36 }),
    war: P.war({ level: 0.45 }),
    box: P.box({ level: 0.26 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 72);
      let t = 0;
      // Morning: birds, arpeggios, a drone like warm air.
      S.mark(0, { section: 'birds' });
      S.ctl('gurdy', 0, { type: 'drone', p: [50, 57], v: 0.4, fade: 3 });
      birds(S, 'flute', 0, 24, r, { v: 0.4, density: 0.6 });
      zither(S, 'zither', 0, ['D', 'G', 'D', 'A', 'D', 'G', 'A', 'D'], r, { pattern: 'arp', v: 0.38 });
      t = 24;
      // A A': the voice in major.
      S.mark(8, { section: 'voice major' });
      theme(S, 'voice', t, r, { mode: 'major', from: 0, to: 8, lyrics: true, v: 0.8, falls: 0.5 });
      zither(S, 'zither', t, H(0, 8), r, { pattern: 'strum', v: 0.4 });
      t += 24;
      // B B': fiddle in thirds, soft frame drum, birds now and then.
      S.mark(16, { section: 'voice and fiddle' });
      theme(S, 'voice', t, r, { mode: 'major', from: 8, to: 16, lyrics: true, v: 0.85, falls: 0.4 });
      harmonize(S, 'fiddle', t, r, { mode: 'major', from: 8, to: 16, v: 0.55 });
      groove(S, 'frame', t, 8, 'waltz', r, { v: 0.45 });
      zither(S, 'zither', t, H(8, 16), r, { pattern: 'oompah', v: 0.38 });
      birds(S, 'flute', t + 6, 18, r, { v: 0.3, density: 0.25 });
      t += 24;
      // The dance, glad at last.
      S.mark(24, { section: 'dance' });
      for (let b = 24; b < 40; b++) S.tempoAt(b, 84);
      S.ctl('gurdy', t, { type: 'crank', rate: 1.4, depth: 0.05 });
      for (let k = 0; k < 2; k++) {
        const t0 = t + k * 24;
        phrase(S, 'fiddle', t0, DANCE, r, { mode: 'major', v: 0.68, orn: 0.4, slur: 0.45, dbl: k ? 62 : null });
        phrase(S, 'flute', t0, DANCE, r, { mode: 'major', style: 'flute', v: 0.45, orn: 0.45, slur: 0.3, octave: 1 });
        zither(S, 'zither', t0, HD, r, { pattern: 'oompah', v: 0.42 });
        groove(S, 'frame', t0, 8, 'waltzFull', r, { v: 0.55, fill: 8 });
        for (let b = 0; b < 8; b++) S.ctl('gurdy', t0 + b * 3, { type: 'buzz', v: 0.45, d: 0.6 });
      }
      t += 48;
      // Everyone: the full theme.
      S.mark(40, { section: 'full theme' });
      S.ctl('gurdy', t, { type: 'crank', rate: 1.1, depth: 0.05 });
      theme(S, 'voice', t, r, { mode: 'major', from: 0, to: 15, lyrics: true, v: 0.92, falls: 0.3 });
      S.add('voice', t + 45, 2, 64, { v: 0.85, vowel: 'a', c: 'b', tie: true });
      S.add('voice', t + 47, 1, 66, { v: 0.85, vowel: 'a', tie: true, slide: true });
      theme(S, 'choirF', t, r, { mode: 'major', from: 0, to: 16, style: 'choir', lyrics: true, v: 0.65, falls: 0.2, scoop: 0.2, cadenceFall: false });
      theme(S, 'choirM', t + 24, r, { mode: 'major', from: 8, to: 16, style: 'choir', lyrics: true, v: 0.7, octave: -1, falls: 0.2, cadenceFall: false });
      theme(S, 'gurdy', t, r, { mode: 'major', from: 0, to: 16, style: 'gurdy', v: 0.5, orn: 0.2, octave: -1 });
      harmonize(S, 'fiddle', t + 24, r, { mode: 'major', from: 8, to: 16, v: 0.5, steps: 2 });
      groove(S, 'frame', t, 16, 'waltzFull', r, { v: 0.6, fill: 4 });
      for (let b = 0; b < 16; b++) {
        if (b % 4 === 0 || b >= 12) S.add('war', t + b * 3, 1, null, { v: b >= 12 ? 0.5 + (b - 12) * 0.12 : 0.55 });
        S.ctl('gurdy', t + b * 3, { type: 'buzz', v: 0.5, d: 0.6 });
      }
      zither(S, 'zither', t, H(0, 16), r, { pattern: 'strum', v: 0.45 });
      birds(S, 'flute', t + 30, 18, r, { v: 0.32, density: 0.3 });
      t += 48;
      // The rise: instead of falling to D, the voice lifts to the high D and holds it in the light.
      S.mark(56, { section: 'the rise' });
      S.add('voice', t, 3, 69, { v: 0.9, vowel: 'a', tie: true, slide: true });
      S.add('voice', t + 3, 7, 74, { v: 0.95, vowel: 'a', vib: 1.3, slide: true });
      S.add('choirF', t, 10, [62, 66, 69], { vowel: 'a', v: 0.6 });
      S.add('choirM', t, 10, [38, 45, 50], { vowel: 'o', v: 0.65 });
      S.add('war', t, 1, null, { v: 0.9 });
      S.add('zither', t, 3, [38, 50, 57, 62, 66, 69], { v: 0.6, strum: 0.05 });
      motif(S, 'box', t + 4, r, { octave: 1, v: 0.5, mode: 'major' });
      t += 12;
      // Coda: birds over the zither, the drone lets go.
      S.mark(60, { section: 'coda' });
      birds(S, 'flute', t, 24, r, { v: 0.35, density: 0.5 });
      zither(S, 'zither', t, ['D', 'G', 'D', 'D', 'G', 'D', 'A', 'D'], r, { pattern: 'arp', v: 0.32 });
      S.ctl('gurdy', t + 18, { type: 'drone', on: false, fade: 3 });
      t += 24;
      S.bars(t / 3 + 2);
      yield* S.play();
    }
  },
};
