// pass: the prologue blizzard. The wind itself is tuned to D minor and slowly changes chord, a
// low male throat drone sweeps its vowels, and far away, through the snow, a woman sings two
// bars of the song and falls silent. A distant drum like thunder. Long empty stretches.
import { Score, theme } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'pass',
  tempo: 54,
  beats: 3,
  level: 0.44,
  parts: {
    wind: P.wind({ level: 0.55, verb: 0.45 }),
    throat: P.throat(),
    voice: P.voiceFar({ level: 0.32, lp: 2400 }),
    war: P.war({ level: 0.5, verb: 0.6 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 54);
      const dm = [50, 57, 62, 65], c = [48, 55, 64, 67], am = [45, 57, 60, 64];
      S.mark(0, { section: 'wind' });
      S.add('wind', 0, 12, dm, { v: 0.6, fade: 4, body: 0.18 });
      S.add('throat', 6, 24, 38, { v: 0.6, vowel: 'u', morph: ['u', 'o', 'a', 'o', 'u'], soft: true, vib: 0.3 });
      S.add('war', 12, 2, null, { v: 0.45, muffled: true });
      // The far voice: Marzanno, Marzanno.
      S.mark(8, { section: 'far voice' });
      theme(S, 'voice', 24, r, { from: 0, to: 2, lyrics: true, v: 0.7, falls: 1, scoop: 0.8 });
      S.add('wind', 36, 12, cycle % 2 ? am : c, { v: 0.55, fade: 5 });
      S.add('war', 42, 2, null, { v: 0.35, muffled: true });
      S.add('wind', 54, 12, dm, { v: 0.6, fade: 5 });
      S.add('throat', 54, 21, 38, { v: 0.55, vowel: 'o', morph: ['o', 'a', 'e', 'a', 'o'], soft: true, vib: 0.3 });
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
