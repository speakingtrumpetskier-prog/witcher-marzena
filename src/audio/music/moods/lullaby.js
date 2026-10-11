// lullaby: Vesna's hum, Dobra's cradle song. The song very slow, hummed with closed lips, then
// opened on a soft "a" for the B phrase. The music box remembers it once in between, and a
// single low zither string marks the start of a phrase now and then.
import { Score, theme, motif, N } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'lullaby',
  tempo: 40,
  beats: 3,
  level: 0.62,
  parts: {
    voice: P.hum({ level: 0.42 }),
    box: P.box({ level: 0.24 }),
    zither: P.zither({ level: 0.3, verb: 0.4 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 40);
      let t = 0;
      S.mark(0, { section: 'hum' });
      S.add('zither', 0, 6, r.pick([N('D3'), N('D2'), N('A2')]), { v: 0.35 + r() * 0.1 });
      t = theme(S, 'voice', t, r, { from: 0, to: 8, vowel: 'm', v: 0.7, falls: 0.4, scoop: 0.3, orn: 0.1 });
      t += 3;
      S.mark(t / 3, { section: 'music box' });
      t = motif(S, 'box', t, r, { octave: 1, v: 0.45, slow: 1 }) + 2;
      t = Math.ceil(t / 3) * 3;
      S.mark(t / 3, { section: 'open' });
      S.add('zither', t, 6, N('A2'), { v: 0.35 });
      t = theme(S, 'voice', t, r, { from: 8, to: 16, vowel: r() < 0.5 ? 'a' : 'o', v: 0.66, falls: 1, hold: 2, scoop: 0.4, orn: 0.2 });
      t += 6;
      if (cycle % 2 === 0) {
        S.mark(t / 3, { section: 'hum again' });
        for (let b = 0; b < 4; b++) S.tempoAt(t / 3 + b, 36);
        t = theme(S, 'voice', t, r, { from: 0, to: 4, vowel: 'm', v: 0.6, falls: 1, hold: 2 });
      } else {
        t = theme(S, 'box', t, r, { from: 0, to: 4, style: 'box', octave: 1, v: 0.4 });
      }
      t += 9;
      S.bars(Math.ceil(t / 3));
      yield* S.play();
    }
  },
};
