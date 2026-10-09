// wild: wilderness by day. A wooden flute alone with the hills: a phrase of the song, then a
// call answered by nothing, a few zither notes, a warm drone that comes and goes, and long
// silences where the wind and the birds take over.
import { Score, theme, phrase, improv, N } from '../compose.js';
import { P } from './parts.js';

export default {
  name: 'wild',
  tempo: 63,
  beats: 3,
  level: 0.59,
  parts: {
    flute: P.flute({ level: 0.3, pan: 0.1, verb: 0.45 }),
    gurdy: P.gurdy({ level: 0.16, pan: -0.25, verb: 0.35 }),
    zither: P.zither({ level: 0.38, verb: 0.4 }),
    fiddle: P.fiddle({ level: 0.2, verb: 0.4, pan: -0.35 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 63);
      let t = 0;
      S.mark(0, { section: 'drone' });
      S.ctl('gurdy', 0, { type: 'drone', p: [50, 57], v: 0.35, fade: 3 });
      t = 6;
      // A phrase of the song, ornamented like a shepherd would.
      S.mark(2, { section: 'flute song' });
      const ph = r.pick([[0, 4], [4, 8], [8, 12]]);
      t = theme(S, 'flute', t, r, { from: ph[0], to: ph[1], style: 'flute', v: 0.65, orn: 0.5, falls: 0.6, octave: 1 });
      t += 3 * r.int(2, 4);
      // A few plucked notes.
      S.mark(t / 3, { section: 'zither' });
      for (let i = 0; i < 3; i++) S.add('zither', t + i * r.pick([1.5, 2, 3]), 3, r.pick([N('D4'), N('A4'), N('F4'), N('C5'), N('A3')]), { v: 0.45 + r() * 0.2 });
      t += 9;
      // A call, improvised on the mode, ending on the fifth.
      S.mark(t / 3, { section: 'call' });
      t = phrase(S, 'flute', t, improv(r, { bars: r.int(2, 3), start: N('A5'), end: N('A5'), lo: N('D5'), hi: N('E6') }).map(([p, d]) => [p, d]), r, { style: 'flute', v: 0.6, orn: 0.45, slur: 0.3 });
      S.ctl('gurdy', t, { type: 'drone', on: false, fade: 3 });
      // Silence. Let the valley speak.
      t += 3 * r.int(5, 7);
      S.mark(t / 3, { section: 'answer' });
      if (r() < 0.6) S.add('fiddle', t, 6, N('D4'), { v: 0.5, soft: true, dbl: N('A3') });
      t = phrase(S, 'flute', t + 3, improv(r, { bars: 3, start: N('D6'), end: N('D5'), lo: N('D5'), hi: N('D6') }).map(([p, d]) => [p, d]), r, { style: 'flute', v: 0.55, orn: 0.4, slur: 0.35 });
      S.add('zither', t, 4, [N('D3'), N('A3'), N('D4')], { v: 0.4, strum: 0.08 });
      t += 6;
      // The B phrase if the day is long.
      if (cycle % 2 === 0) {
        S.ctl('gurdy', t, { type: 'drone', p: [45, 50], v: 0.3, fade: 2 });
        t = theme(S, 'flute', t + 3, r, { from: 8, to: 12, style: 'flute', v: 0.6, orn: 0.45, falls: 1, octave: 1 });
        S.ctl('gurdy', t, { type: 'drone', on: false, fade: 4 });
      }
      t += 3 * r.int(6, 9);
      S.bars(Math.ceil(t / 3));
      yield* S.play();
    }
  },
};
