// pass: the prologue blizzard. The wind itself is tuned to D minor and slowly changes chord, a
// low male throat drone sweeps its vowels, and far away, through the snow, a woman sings two
// bars of the song and falls silent. A distant drum like thunder. Long empty stretches.
import { Score, theme } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'pass',
  tempo: 54,
  beats: 3,
  level: 0.56,
  parts: {
    wind: P.wind({ level: 0.55, verb: 0.45 }),
    throat: P.throat(),
    voice: P.voiceFar({ level: 0.45, lp: 2400 }),
    war: P.war({ level: 0.5, verb: 0.6 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 54);
      // Every pass picks its own voicings, vowel sweeps and timings so no two are alike.
      const dm = r.pick([[50, 57, 62, 65], [45, 57, 62, 65], [50, 57, 60, 65], [38, 50, 57, 65]]);
      const c = r.pick([[48, 55, 64, 67], [48, 55, 60, 64]]), am = r.pick([[45, 57, 60, 64], [45, 52, 60, 64]]);
      const sweeps = [['u', 'o', 'a', 'o', 'u'], ['o', 'u', 'a', 'u', 'o'], ['u', 'a', 'o', 'e', 'o'], ['m', 'u', 'o', 'a', 'o']];
      S.mark(0, { section: 'wind' });
      S.add('wind', 0, 12, dm, { v: 0.52 + r() * 0.12, fade: 3 + r() * 2.5, body: 0.14 + r() * 0.08 });
      S.add('throat', 3 * r.int(1, 3), 24, 38, { v: 0.55 + r() * 0.1, vowel: 'u', morph: r.pick(sweeps), soft: true, vib: 0.3 });
      S.add('war', 3 * r.int(3, 5), 2, null, { v: 0.35 + r() * 0.15, muffled: true });
      // The far voice: a line of the song, out of the snow.
      S.mark(8, { section: 'far voice' });
      const frag = r.pick([[0, 2], [4, 6], [8, 10], [0, 2]]);
      theme(S, 'voice', 24 + 3 * r.int(0, 1), r, { from: frag[0], to: frag[1], lyrics: true, v: 0.66 + r() * 0.08, falls: 1, scoop: 0.8 });
      S.add('wind', 36, 12, cycle % 2 ? am : c, { v: 0.55, fade: 5 });
      S.add('war', 42, 2, null, { v: 0.35, muffled: true });
      S.add('wind', 54, 12, dm, { v: 0.6, fade: 5 });
      S.add('throat', 54, 21, r.pick([38, 38, 33]), { v: 0.5 + r() * 0.1, vowel: 'o', morph: r.pick(sweeps), soft: true, vib: 0.3 });
      // Later the end of the song, the fall, then nothing but wind.
      S.mark(22, { section: 'the fall' });
      theme(S, 'voice', 66, r, { from: 14, to: 16, lyrics: true, v: 0.65, hold: 2, scoop: 0.6 });
      S.add('war', 75, 2, null, { v: 0.4, muffled: true });
      S.add('wind', 78, 15, r() < 0.5 ? c : dm, { v: 0.5, fade: 6 });
      S.add('wind', 93, 3, [], { v: 0, fade: 4 });
      S.bars(33);
      yield* S.play();
    }
  },
};
