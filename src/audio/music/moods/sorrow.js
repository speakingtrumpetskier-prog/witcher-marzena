// sorrow: ending C and sad beats. The song slowed to a walk behind a coffin: the white voice
// alone, each phrase falling away into a long rest, a throat drone so low it is felt more than
// heard. On later passes the fiddle answers the ends of phrases, quietly.
import { Score, theme, themeNotes, step } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'sorrow',
  tempo: 46,
  beats: 3,
  level: 0.95,
  parts: {
    voice: P.voice({ level: 0.4, verb: 0.48, vibDepth: 48 }),
    throat: P.throat({ level: 0.32 }),
    fiddle: P.fiddle({ level: 0.2, verb: 0.5 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 46);
      S.mark(0, { section: 'drone' });
      S.add('throat', 0, 90, 38, { v: 0.5, vowel: 'u', morph: ['u', 'o', 'u', 'o', 'u', 'o'], soft: true, vib: 0.2 });
      let t = 6;
      const gaps = [2, 2, 1, 4];
      [[0, 4], [4, 8], [8, 12], [12, 16]].forEach(([a, b], k) => {
        S.mark(t / 3, { section: `phrase ${k + 1}` });
        const end = theme(S, 'voice', t, r, { from: a, to: b, lyrics: true, v: 0.75, falls: 1, hold: k === 3 ? 3 : 1, scoop: 0.7, orn: 0.4 });
        if (cycle > 0) {
          // The fiddle echoes the last three notes an octave below.
          const ns = themeNotes({ from: a, to: b }).slice(-3);
          let ft = end + 0.5;
          ns.forEach((n, i) => { S.add('fiddle', ft, n.d * 1.2, n.p - 12, { v: 0.5, tie: i < 2, soft: i === 0, fall: i === 2 ? 2 : 0 }); ft += n.d * 1.2; });
        }
        t = end + gaps[k] * 3;
      });
      if (r() < 0.5) S.add('throat', t - 6, 9, step(38, -1), { v: 0.4, vowel: 'o', soft: true });
      S.bars(Math.ceil(t / 3));
      yield* S.play();
    }
  },
};
