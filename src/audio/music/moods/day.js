// The daylight exploration music, shared by `village` and `wild` (they differ in what leads and how much room is
// left). Slow (52 to 60 in 3/4), long-breathed and soft: a plucked zither and a low drone carry it and the wooden
// flute sings in its low register; nothing is bowed or buzzes. It is a suite of sections dealt in a new order every
// time round, each written afresh (varied phrases, who plays what, registers, voicings), with stretches of only the
// drone, or nothing, between them. One time round lasts five or six minutes and the next is a different one.
// Material, all D Dorian: the Marzanno song, the old village dance slowed into a song, and two tunes of the valley's
// own, VALLEY (stepwise, the song's falling line) and HILLS (wider, the song's climb to the high D).
import { Score, theme, phrase, pluck, broken, vary, themeLine, improv, deal, harmonyOf, chord, N } from '../compose.js';

const L = (seq) => seq.map(([p, d]) => [N(p), d]);

// Four phrases of four bars each, with a chord per bar.
export const VALLEY = [
  L([['D4', 2], ['E4', 1], ['F4', 3], ['A4', 2], ['G4', 1], ['E4', 3]]),
  L([['F4', 2], ['G4', 1], ['A4', 2], ['C5', 1], ['B4', 2], ['G4', 1], ['A4', 3]]),
  L([['D5', 3], ['C5', 2], ['A4', 1], ['G4', 2], ['A4', 1], ['F4', 1], ['E4', 2]]),
  L([['D4', 2], ['F4', 1], ['E4', 2], ['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['D4', 3]]),
];
const VALLEY_H = [['Dm', 'F', 'Am', 'C'], ['F', 'Am', 'G', 'Am'], ['Dm', 'F', 'C', 'C'], ['Dm', 'C', 'Dm', 'Dm']];
export const HILLS = [
  L([['A4', 3], ['D5', 2], ['C5', 1], ['A4', 3], ['G4', 2], ['E4', 1]]),
  L([['G4', 2], ['A4', 1], ['C5', 3], ['A4', 2], ['G4', 1], ['A4', 3]]),
  L([['D5', 2], ['E5', 1], ['D5', 2], ['C5', 1], ['A4', 3], ['C5', 1], ['A4', 1], ['G4', 1]]),
  L([['E4', 2], ['G4', 1], ['A4', 2], ['G4', 1], ['E4', 2], ['D4', 1], ['D4', 3]]),
];
const HILLS_H = [['Dm', 'Dm', 'F', 'C'], ['C', 'F', 'Am', 'Am'], ['Dm', 'Dm', 'F', 'C'], ['C', 'Am', 'Am', 'Dm']];
// The village dance (a kujawiak), played here as a song.
const DANCE_A = L([
  ['D5', 0.75], ['C5', 0.25], ['A4', 1], ['A4', 1], ['G4', 0.5], ['A4', 0.5], ['F4', 1], ['E4', 1],
  ['D4', 0.75], ['E4', 0.25], ['F4', 1], ['G4', 1], ['A4', 1.5], ['G4', 0.5], ['A4', 1],
  ['C5', 0.75], ['B4', 0.25], ['A4', 1], ['G4', 1], ['F4', 0.5], ['G4', 0.5], ['A4', 1], ['F4', 1],
  ['E4', 0.75], ['F4', 0.25], ['E4', 1], ['C4', 1], ['D4', 3],
]);
const DANCE_B = L([
  ['A4', 1], ['D5', 1.5], ['C5', 0.5], ['A4', 1], ['G4', 1], ['A4', 1],
  ['C5', 0.75], ['D5', 0.25], ['E5', 1], ['D5', 1], ['C5', 1.5], ['A4', 1.5],
  ['G4', 1], ['A4', 0.5], ['G4', 0.5], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
  ['A4', 0.75], ['G4', 0.25], ['F4', 1], ['E4', 1], ['D4', 3],
]);
const DANCE_HA = ['Dm', 'C', 'Dm', 'Am', 'G', 'F', 'C', 'Dm'];
const DANCE_HB = ['Dm', 'Dm', 'C', 'F', 'G', 'C', 'Am', 'Dm'];
const PROGS = [['Dm', 'C', 'F', 'Am'], ['Dm', 'Am', 'C', 'Dm'], ['F', 'C', 'Dm', 'Am'], ['Dm', 'F', 'G', 'Dm'], ['Am', 'C', 'Dm', 'Dm']];
// Rhythm cells for slow improvised calls: no quick notes.
const SLOW = [[3], [2, 1], [1, 2], [1.5, 1.5], [1, 1, 1], [2, 1]];

const rootFifth = (sym, low = 36) => { const p = chord(Array.isArray(sym) ? sym[0] : sym, low, 1)[0]; return [p, p + 7]; };
const droneOn = (S, t, c, p = [38, 45], o = {}) => S.ctl('drone', t, { type: 'drone', p, v: c.droneV, fade: 2.5, ...o });
const droneOff = (S, t, fade = 3) => S.ctl('drone', t, { type: 'drone', on: false, fade });
// The lead for a phrase: the flute (blown, with its own ornaments) or the zither (plucked).
function lead(S, who, t, seq, r, c, o = {}) {
  if (who === 'flute') return phrase(S, 'flute', t, seq, r, { style: 'flute', v: 0.52, orn: c.orn, slur: 0.45, falls: 0.3, ...o });
  return pluck(S, 'zither', t, seq, r, { v: 0.5, grace: 0.14, dyad: 0.22, ...o });
}
const pickLead = (r, c) => (r() < c.flute ? 'flute' : 'zither');

export const SECTIONS = {
  // The zither alone, slow broken chords; the drone comes in under the second chord.
  prelude(S, t, r, c) {
    const prog = r.pick(PROGS);
    droneOn(S, t + 6, c, [38, 45], { fade: 4 });
    return broken(S, 'zither', t, prog, r, { per: 6, style: r.pick(['harp', 'open']), v: 0.44, low: 45 });
  },

  // VALLEY: four phrases, a lead per phrase, bass plucks under a plucked lead and fuller chords under the flute.
  valley(S, t, r, c) {
    droneOn(S, t, c);
    const amt = c.seen.valley ? 0.35 : 0.12;
    c.seen.valley = true;
    VALLEY.forEach((ph, i) => {
      const who = pickLead(r, c);
      lead(S, who, t, vary(ph, r, { amount: amt }), r, c);
      broken(S, 'zither', t, VALLEY_H[i], r, { per: 3, style: who === 'flute' ? r.pick(['open', 'bass']) : 'bass', v: 0.36, low: 45 });
      t += 12;
    });
    return t;
  },

  // HILLS: the flute's tune; the zither only marks every other bar, or takes a phrase itself.
  hills(S, t, r, c) {
    droneOn(S, t, c, r() < 0.5 ? [38, 45] : [38, 50]);
    const amt = c.seen.hills ? 0.35 : 0.1;
    c.seen.hills = true;
    HILLS.forEach((ph, i) => {
      const who = r() < c.flute + 0.15 ? 'flute' : 'zither';
      lead(S, who, t, vary(ph, r, { amount: amt }), r, c);
      HILLS_H[i].forEach((sym, b) => { if (b % 2 === 0 || who === 'zither') S.add('zither', t + b * 3, 3, chord(sym, 45, 1)[0], { v: 0.34 + r() * 0.06 }); });
      t += 12;
    });
    return t;
  },

  // The old dance as a song: zither melody over a soft bass and an off-beat dyad (the only lilt in the day), then
  // the second strain on the flute or the zither again; no drone.
  dance(S, t, r, c) {
    droneOff(S, t, 2);
    const acc = (t0, hs) => hs.forEach((sym, b) => {
      const root = chord(sym, 45, 1)[0], up = chord(sym, root + 12, 3);
      S.add('zither', t0 + b * 3, 2, root, { v: 0.38 + r() * 0.05 });
      S.add('zither', t0 + b * 3 + 2, 1, [root + 7, up[1]], { v: 0.22 + r() * 0.05, strum: 0.05 });
    });
    pluck(S, 'zither', t, vary(DANCE_A, r, { amount: c.seen.dance ? 0.3 : 0.1 }), r, { v: 0.5, dyad: 0.1, grace: 0.08 });
    acc(t, DANCE_HA);
    t += 24;
    const who = r() < c.flute + 0.2 ? 'flute' : 'zither';
    lead(S, who, t, vary(DANCE_B, r, { amount: 0.2 }), r, c);
    acc(t, DANCE_HB);
    c.seen.dance = true;
    return t + 24;
  },

  // Two phrases of the Marzanno song over open chords and the drone.
  song(S, t, r, c) {
    const pairs = [[0, 8], [8, 16], [4, 12]].filter(([a]) => a !== c.lastSong);
    const [from, to] = r.pick(pairs);
    c.lastSong = from;
    droneOn(S, t, c);
    const who = pickLead(r, c);
    if (who === 'flute') theme(S, 'flute', t, r, { from, to, style: 'flute', v: 0.52, orn: c.orn, falls: 0.4 });
    else pluck(S, 'zither', t, vary(themeLine(from, to), r, { amount: 0.15 }), r, { v: 0.52, dyad: 0.25 });
    const hs = Array.from({ length: to - from }, (_, b) => harmonyOf('dorian', from + b));
    broken(S, 'zither', t, hs, r, { per: 3, style: who === 'flute' ? 'open' : 'bass', v: 0.34, low: 45 });
    return t + (to - from) * 3 + 3;
  },

  // Half of the song at half speed, the drone moving with its harmony: the slowest, stateliest thing in the day.
  stately(S, t, r, c) {
    const from = r() < 0.6 ? 8 : 0, to = from + 8;
    const who = r() < c.flute ? 'flute' : 'zither';
    for (let b = from; b < to; b++) droneOn(S, t + (b - from) * 6, c, rootFifth(harmonyOf('dorian', b)), { fade: 2, glide: 0.9 });
    const line = themeLine(from, to, { k: 2 });
    if (who === 'flute') phrase(S, 'flute', t, line, r, { style: 'flute', v: 0.5, orn: c.orn * 0.6, slur: 0.6, falls: 0.6 });
    else pluck(S, 'zither', t, line, r, { v: 0.5, dyad: 0.35, grace: 0.1 });
    return t + (to - from) * 6 + 3;
  },

  // A shepherd's call on the flute, improvised and slow, and the zither answering an octave down; twice.
  call(S, t, r, c) {
    droneOn(S, t, c, [38, 45], { v: c.droneV * 0.8 });
    t += 3;
    for (let k = 0; k < 2; k++) {
      const seq = improv(r, { bars: r.int(2, 3), cells: SLOW, start: r.pick([N('A4'), N('D5')]), end: r.pick([N('A4'), N('D5'), N('E5')]), lo: N('D4'), hi: N('G5'), leap: 0.3 });
      t = phrase(S, 'flute', t, seq.map(([p, d]) => [p, d]), r, { style: 'flute', v: 0.5, orn: c.orn, slur: 0.35, falls: 0.5 });
      t += 3 * r.int(1, 2);
      t = pluck(S, 'zither', t, seq.slice(-2).map(([p, d]) => [p - 12, Math.max(1.5, d)]), r, { v: 0.4, dyad: 0 });
      t += 3 * r.int(1, 2);
    }
    return t;
  },

  // The zither alone: slow harp chords and a few notes picked out above them.
  zither(S, t, r) {
    droneOff(S, t, 4);
    const prog = [...r.pick(PROGS), ...r.pick(PROGS)];
    broken(S, 'zither', t, prog, r, { per: 6, style: 'harp', v: 0.4, low: 45 });
    const line = improv(r, { bars: 12, cells: SLOW, start: N('A4'), end: N('D5'), lo: N('F4'), hi: N('F5'), leap: 0.2 });
    pluck(S, 'zither', t + 3, line.slice(0, Math.max(4, line.length - 2)), r, { v: 0.4, dyad: 0, grace: 0.1 });
    return t + prog.length * 6;
  },

  // The drone alone, coming in.
  drone(S, t, r, c) {
    droneOn(S, t, c, [38, 45], { fade: 5 });
    return t + 3 * r.int(3, 5);
  },

  // Room to breathe: the drone alone (or moved to the fifth), or nothing at all.
  breath(S, t, r, c) {
    const bars = r.int(c.breath[0], c.breath[1]);
    if (r() < c.keepDrone) droneOn(S, t, c, r.pick([[38, 45], [45, 52], [38, 50]]), { v: c.droneV * 0.85, fade: 3, glide: 1.2 });
    else {
      droneOff(S, t, 4);
      if (r() < 0.4) S.add('zither', t + 3 * (bars - 1), 3, r.pick([N('A4'), N('D5'), N('F4')]), { v: 0.26 });
    }
    return t + bars * 3;
  },
};

// The day suite. flavour: tempo range, which sections, how often the flute leads, how much space.
export function* dayScore(r, f) {
  const c = { seen: {}, ...f };
  let last = null;
  for (let cycle = 0; ; cycle++) {
    const tempo = r.int(f.tempo[0], f.tempo[1]);
    const order = [f.opener, ...deal(r, f.deck, last)];
    // Ornament grows a little after the first time round.
    c.orn = f.orn + Math.min(0.15, cycle * 0.05);
    for (let i = 0; i < order.length; i++) {
      for (const name of i > 0 && i % f.every === 0 ? ['breath', order[i]] : [order[i]]) {
        const S = new Score(3, tempo);
        S.mark(0, { section: name });
        const end = SECTIONS[name](S, 0, r, c);
        S.bars(Math.max(1, Math.ceil(end / 3 - 1e-6)));
        yield* S.play();
      }
    }
    last = order[order.length - 1];
    // A long breath at the end of the round.
    const S = new Score(3, tempo);
    S.mark(0, { section: 'breath' });
    S.bars(Math.ceil(SECTIONS.breath(S, 0, r, { ...c, keepDrone: c.keepDrone * 0.5 }) / 3));
    yield* S.play();
  }
}
