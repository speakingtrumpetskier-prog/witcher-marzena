// night: outdoors after dark. The night's own suite, sparser, lower and slower than the day's (day.js): a low drone
// that comes and goes, Wiesia's music box surfacing in pieces (sometimes a little broken), the song's phrases picked
// out low on the zither, slow harp chords with a few notes above them, the drowned bell once in a while, and now
// and then, very far off on the lake, the white voice with two bars of the song. Mostly room and cold. Nothing is
// bowed and nothing growls (the old night had a throat drone and a high fiddle harmonic). Sections are dealt in a new
// order every time round and written afresh, with a breath of drone or of nothing after each; 44 to 48 in 3/4, and a
// time round lasts six minutes or so.
import { Score, theme, motif, pluck, broken, vary, themeLine, improv, deal, chord, N } from '../compose.js';
import { P } from './parts.js';

const PROGS = [['Dm', 'Am', 'Dm', 'C'], ['Dm', 'F', 'Am', 'Dm'], ['Am', 'Dm', 'C', 'Dm'], ['Dm', 'C', 'Am', 'Am']];
const SLOW = [[3], [3], [2, 1], [1, 2], [1.5, 1.5]];
const droneOn = (S, t, c, p = [38, 45], o = {}) => S.ctl('drone', t, { type: 'drone', p, v: c.droneV, fade: 4, ...o });
const droneOff = (S, t, fade = 5) => S.ctl('drone', t, { type: 'drone', on: false, fade });

const SECTIONS = {
  // The drone alone, coming up out of nothing.
  deep(S, t, r, c) {
    droneOn(S, t, c, r.pick([[38, 45], [38, 45], [33, 45]]), { fade: 6 });
    return t + 3 * r.int(5, 8);
  },

  // The music box: its tune, or a piece of it, and sometimes a second piece after a silence, a little broken.
  box(S, t, r, c) {
    if (r() < 0.7) droneOn(S, t, c, [38, 45], { v: c.droneV * 0.8 });
    t += 3 * r.int(1, 2);
    t = motif(S, 'box', t, r, { octave: 1, v: 0.5, broken: c.cycle % 3 === 2 ? 0.3 : 0, slow: r.pick([1.2, 1.4, 1.6]) });
    if (r() < 0.5) {
      t += 3 * r.int(2, 4);
      t = motif(S, 'box', t, r, { octave: 1, v: 0.4, broken: 0.15 + 0.2 * r(), slow: 1.6 });
    }
    return t + 3;
  },

  // Slow harp chords low on the zither, and three or four notes picked out above them.
  harp(S, t, r, c) {
    if (r() < 0.5) droneOff(S, t, 5); else droneOn(S, t, c, [38, 45], { v: c.droneV * 0.7 });
    const prog = r.pick(PROGS);
    broken(S, 'zither', t, prog, r, { per: 6, style: 'harp', v: 0.3, low: 38 });
    const line = improv(r, { bars: 6, cells: SLOW, start: N('A3'), end: N('D4'), lo: N('D3'), hi: N('D4'), leap: 0.15 });
    pluck(S, 'zither', t + 6, line.slice(0, r.int(3, 5)), r, { v: 0.32, dyad: 0, grace: 0.05 });
    return t + prog.length * 6;
  },

  // Four bars of the song, an octave down on the zither, over the drone; never the same four twice running.
  song(S, t, r, c) {
    const starts = [0, 4, 8, 12].filter((a) => a !== c.lastSong);
    const from = r.pick(starts);
    c.lastSong = from;
    droneOn(S, t, c);
    t += 3;
    t = pluck(S, 'zither', t, vary(themeLine(from, from + 4, { octave: -1 }), r, { amount: 0.1 }), r, { v: 0.42, dyad: 0.3, grace: 0.06 });
    return t + 3;
  },

  // Very far off: the white voice, two or three bars, and the drone under it.
  far(S, t, r, c) {
    droneOn(S, t, c, [38, 45], { v: c.droneV * 0.9 });
    t += 3 * r.int(1, 2);
    const from = r.pick([0, 8, 12]);
    t = theme(S, 'voice', t, r, { from, to: from + r.int(2, 3), lyrics: true, v: 0.5, falls: 1, hold: 2 });
    return t + 6;
  },

  // The bell under the ice: one stroke, and sometimes a second, lower.
  bell(S, t, r, c) {
    if (r() < 0.6) droneOff(S, t, 6);
    S.add('bell', t + 3, 12, N('D3'), { v: 0.55, muffled: true });
    if (r() < 0.45) S.add('bell', t + 3 + 3 * r.int(3, 4), 12, N('A2'), { v: 0.42, muffled: true });
    void c;
    return t + 3 * r.int(6, 8);
  },

  // Room: the drone alone, moved to the fifth or left where it is, or nothing at all, and once in a while one low note.
  breath(S, t, r, c) {
    const bars = r.int(c.breath[0], c.breath[1]);
    if (r() < c.keepDrone) droneOn(S, t, c, r.pick([[38, 45], [45, 52], [33, 45]]), { v: c.droneV * 0.8, fade: 5, glide: 1.5 });
    else {
      droneOff(S, t, 6);
      if (r() < 0.3) S.add('zither', t + 3 * (bars - 1), 3, chord(r.pick(['Dm', 'Am']), 38, 1)[0], { v: 0.24 });
    }
    return t + bars * 3;
  },
};

export default {
  name: 'night',
  tempo: 46,
  beats: 3,
  level: 0.76,
  parts: {
    drone: P.drone({ level: 0.3, lp: 620, verb: 0.5 }),
    box: P.box({ level: 0.24, verb: 0.75, pan: 0.25 }),
    zither: P.zither({ level: 0.3, verb: 0.55, pan: -0.2 }),
    bell: P.bell({ level: 0.3, verb: 0.8, pan: -0.3 }),
    voice: P.voiceFar({ level: 0.26, lp: 2000, verb: 0.85, retire: 20 }),
  },
  *score(r) {
    const c = { droneV: 0.5, breath: [4, 8], keepDrone: 0.4, lastSong: -1, cycle: 0 };
    let last = null;
    for (; ; c.cycle++) {
      const tempo = r.int(44, 48);
      // The far voice at most once a round, and not in the first.
      const deck = ['box', 'harp', 'song', 'bell', 'box', 'harp', ...(c.cycle > 0 ? ['far'] : ['song'])];
      const order = ['deep', ...deal(r, deck, last)];
      for (const name of order.flatMap((n, i) => (i > 0 ? ['breath', n] : [n]))) {
        const S = new Score(3, tempo);
        S.mark(0, { section: name });
        const end = SECTIONS[name](S, 0, r, c);
        S.bars(Math.max(1, Math.ceil(end / 3 - 1e-6)));
        yield* S.play();
      }
      last = order[order.length - 1];
      const S = new Score(3, tempo);
      S.mark(0, { section: 'breath' });
      S.bars(Math.ceil(SECTIONS.breath(S, 0, r, { ...c, keepDrone: 0.2, breath: [6, 10] }) / 3));
      yield* S.play();
    }
  },
};
