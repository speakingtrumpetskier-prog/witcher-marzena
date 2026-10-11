// night: outdoors after dark. A low throat drone breathing slow vowels, the white voice very
// far away on the lake singing fragments of the song, and Wiesia's music box surfacing in
// pieces, sometimes a little out of tune. Mostly silence and cold.
import { Score, theme, motif } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'night',
  tempo: 50,
  beats: 3,
  level: 0.6,
  parts: {
    throat: P.throat({ level: 0.42 }),
    voice: P.voiceFar({ level: 0.36, lp: 2200, verb: 0.85 }),
    box: P.box({ level: 0.26, verb: 0.75, pan: 0.25 }),
    fiddle: P.fiddle({ level: 0.12, verb: 0.7, pan: -0.4, lp: 4000 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 50);
      S.mark(0, { section: 'drone' });
      S.add('throat', 3 * r.int(0, 2), 24, r.pick([38, 38, 45]), { v: 0.5 + r() * 0.1, vowel: 'u', morph: r.pick([['u', 'o', 'u', 'o'], ['o', 'u', 'a', 'u'], ['m', 'u', 'o', 'u']]), soft: true, vib: 0.2 });
      // Far voice: the B phrase, slow.
      S.mark(4, { section: 'far voice' });
      const ph = r.pick([[8, 12], [0, 4], [12, 16]]);
      let t = theme(S, 'voice', 12, r, { from: ph[0], to: ph[1], lyrics: true, v: 0.6, falls: 1, hold: 2 });
      // A high bowed harmonic, barely there.
      if (r() < 0.6) S.add('fiddle', t - 6, 9, r.pick([81, 76, 74]), { v: 0.5, soft: true, vib: 0.6 });
      t += 9;
      S.mark(t / 3, { section: 'music box' });
      t = motif(S, 'box', t, r, { octave: 1, v: 0.55, broken: cycle % 3 === 2 ? 0.35 : 0, slow: 1.2 });
      t += 12;
      S.add('throat', t, 18, r.pick([38, 33]), { v: 0.5, vowel: 'o', morph: ['o', 'a', 'o', 'u'], soft: true, vib: 0.2 });
      t += 21;
      // A fragment: only Marzanno, Marzanno.
      S.mark(t / 3, { section: 'fragment' });
      t = theme(S, 'voice', t, r, { from: 0, to: 2, lyrics: true, v: 0.55, falls: 1, hold: 1 });
      t += 15;
      if (r() < 0.7) t = motif(S, 'box', t, r, { octave: 1, v: 0.45, broken: 0.15 * (cycle % 2), slow: 1.4 }) + 3;
      t += 12;
      S.bars(Math.ceil(t / 3));
      yield* S.play();
    }
  },
};
