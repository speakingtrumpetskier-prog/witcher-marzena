// procession: the rite on the ice. The villagers sing the Marzanno song as they walk, a deep
// drum on beat one of every bar. Women alone first, then the men an octave below, then everyone
// with a white-voice descant soaring over and a low drone, then the women again, quieter,
// slowing. Between verses only the drum and the footsteps. Lyrics are emitted per line as
// 'music:lyric' events so the UI can subtitle them.
import { Score, theme, phrase } from '../compose.js';
import { P } from './parts.js';

const DESCANT = [
  [null, 1], ['D5', 2], ['C5', 2], ['A4', 1], ['C5', 3], ['A4', 3, { fall: 3 }],
  [null, 1], ['E5', 2], ['D5', 2], ['B4', 1], ['A4', 2], ['C5', 1], ['A4', 3, { fall: 3 }],
  ['A4', 2], ['A4', 1], ['C5', 3], ['D5', 2], ['E5', 1], ['D5', 3, { fall: 4 }],
  ['D5', 3], ['C5', 2], ['A4', 1], ['A4', 2], ['A4', 1], ['A4', 2], ['D5', 4, { fall: 5 }],
];

function drum(S, t0, bars, r, v = 0.6) {
  for (let b = 0; b < bars; b++) S.add('war', t0 + b * 3 + r.bi() * 0.01, 2, null, { v: v * (b % 2 ? 0.85 : 1) });
  return t0 + bars * 3;
}

export default {
  name: 'procession',
  tempo: 58,
  beats: 3,
  level: 1,
  parts: {
    choirF: P.choirF({ singers: 8, level: 0.15, loose: 1.1, pan: -0.15, verb: 0.42 }),
    choirM: P.choirM({ singers: 5, level: 0.19, loose: 1.2, pan: 0.18, verb: 0.42 }),
    war: P.war({ level: 0.5, verb: 0.35 }),
    voice: P.voice({ level: 0.4, verb: 0.45, pan: 0.05 }),
    gurdy: P.gurdy({ level: 0.16, pan: 0.3 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 58);
      let t = drum(S, 0, 2, r, 0.5);
      // Verse 1: women.
      S.mark(t / 3, { section: 'verse women' });
      drum(S, t, 17, r, 0.55);
      t = theme(S, 'choirF', t, r, { style: 'choir', lyrics: true, v: 0.72, hold: 3, falls: 0.25, scoop: 0.3 });
      t = drum(S, t, 2, r, 0.5);
      // Verse 2: men join an octave below.
      S.mark(t / 3, { section: 'verse all' });
      drum(S, t, 17, r, 0.6);
      theme(S, 'choirM', t, r, { style: 'choir', lyrics: true, v: 0.75, hold: 3, octave: -1, falls: 0.25, scoop: 0.2 });
      t = theme(S, 'choirF', t, r, { style: 'choir', lyrics: true, v: 0.76, hold: 3, falls: 0.25, scoop: 0.3 });
      t = drum(S, t, 1, r, 0.55);
      // Verse 3: full, with the white voice above and a drone underneath.
      S.mark(t / 3, { section: 'verse descant' });
      S.ctl('gurdy', t, { type: 'drone', p: [38, 45], v: 0.45, fade: 2 });
      drum(S, t, 17, r, 0.68);
      theme(S, 'choirM', t, r, { style: 'choir', lyrics: true, v: 0.8, hold: 3, octave: -1, falls: 0.3 });
      phrase(S, 'voice', t, DESCANT, r, { style: 'voice', v: 0.8, slur: 0.7, orn: 0, extra: { vowel: 'a', vib: 1.2 } });
      t = theme(S, 'choirF', t, r, { style: 'choir', lyrics: true, v: 0.8, hold: 3, falls: 0.3 });
      S.ctl('gurdy', t, { type: 'drone', on: false, fade: 3 });
      t = drum(S, t, 2, r, 0.55);
      // Verse 4: the women again, quieter, slowing toward the hole in the ice.
      S.mark(t / 3, { section: 'verse quiet' });
      const b0 = t / 3;
      drum(S, t, 17, r, 0.45);
      S.ramp(b0 + 11, b0 + 16, 58, 50);
      t = theme(S, 'choirF', t, r, { style: 'choir', lyrics: true, v: 0.55, hold: 3, falls: 0.4, scoop: 0.4 });
      t = drum(S, t, 3, r, 0.35);
      S.bars(t / 3);
      yield* S.play();
    }
  },
};
