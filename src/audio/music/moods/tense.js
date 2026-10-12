// tense: investigation. A low pulse like a held heartbeat, the fiddle scraping sul ponticello
// in slow glissandi, a close D and E-flat drone on the gurdy, the music box motif half-heard and
// detuned, and sudden stops.
import { Score, motif } from '../compose.js';
import { P } from './parts.js';

function pulses(S, t0, bars, r, { v = 0.6, dbl = false } = {}) {
  for (let b = 0; b < bars; b++) {
    const t = t0 + b * 3, k = 0.88 + r() * 0.24;
    S.add('pulse', t, 0.5, null, { v: v * k });
    S.add('pulse', t + 0.4 + r() * 0.05, 0.5, null, { v: v * 0.6 * k });
    if (dbl) { S.add('pulse', t + 1.5, 0.5, null, { v: v * 0.7 }); S.add('pulse', t + 1.92, 0.5, null, { v: v * 0.45 }); }
    else if (r() < 0.3) S.add('pulse', t + 2, 0.5, null, { v: v * 0.3 });
  }
  return t0 + bars * 3;
}

export default {
  name: 'tense',
  tempo: 72,
  beats: 3,
  level: 1.35,
  parts: {
    pulse: P.pulse({ level: 0.55 }),
    fiddle: P.fiddle({ level: 0.2, verb: 0.5, pan: -0.3 }),
    fiddle2: P.fiddle({ level: 0.16, verb: 0.55, pan: 0.35 }),
    gurdy: P.gurdy({ level: 0.18, pan: 0.1, lp: 3000 }),
    box: P.box({ level: 0.22, verb: 0.8 }),
    frame: P.frame({ level: 0.3 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 72);
      let t = 0;
      S.mark(0, { section: 'pulse' });
      pulses(S, t, 4, r, { v: 0.55 });
      t = 12;
      S.mark(4, { section: 'scrapes' });
      pulses(S, t, 8, r, { v: 0.6 });
      for (let k = 0; k < 3; k++) {
        const p = r.pick([74, 75, 69, 70, 81]);
        S.add('fiddle', t + k * 8 + r() * 2, 6, p, { v: 0.55, scrape: true, bend: [[3, p + r.pick([-1, 1, -2])], [5.5, p - 3]], vib: 0 });
      }
      t += 24;
      S.mark(t / 3, { section: 'cluster' });
      S.ctl('gurdy', t, { type: 'drone', p: [38, 39], v: 0.55, fade: 2 });
      pulses(S, t, 8, r, { v: 0.62 });
      S.add('fiddle', t + 3, 18, 62, { v: 0.4, trem: true, soft: true, bend: [[12, 63]] });
      S.add('fiddle2', t + 9, 12, 75, { v: 0.35, scrape: true, bend: [[8, 74]] });
      for (let b = 0; b < 8; b += 2) S.add('frame', t + b * 3 + 2.5, 0.3, null, { kind: 'ghost', v: 0.5 });
      t += 24;
      // Stop.
      S.ctl('gurdy', t, { type: 'drone', on: false, fade: 0.08 });
      S.add('pulse', t, 0.5, null, { v: 0.7 });
      t += 6;
      S.mark(t / 3, { section: 'motif' });
      pulses(S, t, 3, r, { v: 0.4 });
      motif(S, 'box', t + 1, r, { octave: 1, v: 0.5, broken: 0.45, slow: 1.1 });
      t += 9;
      S.mark(t / 3, { section: 'quickening' });
      S.ctl('gurdy', t, { type: 'drone', p: [50, 51], v: 0.5, fade: 1 });
      pulses(S, t, 6, r, { v: 0.65, dbl: true });
      S.add('fiddle', t, 17, 81, { v: 0.4, trem: true, bend: [[8, 82], [14, 80]] });
      S.add('fiddle2', t + 6, 11, 70, { v: 0.4, trem: true });
      t += 18;
      S.ctl('gurdy', t, { type: 'drone', on: false, fade: 1.5 });
      t += 6;
      S.bars(t / 3);
      yield* S.play();
    }
  },
};
