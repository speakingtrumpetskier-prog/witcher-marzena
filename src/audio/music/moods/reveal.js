// reveal: the valley cinematic and title. The full theme: the white voice over hurdy-gurdy
// drones and buzzing trompette, drums swelling from a roll into the theme, then the B phrase
// with the fiddle singing thirds below, a held cadence, the gurdy taking the tune, and a full
// ensemble B section with the choir before a music box coda and a breath of silence.
import { Score, theme, harmonize, zither, groove, roll, motif, harmonyOf } from '../compose.js';
import { P } from './parts.js';

const H = (from, to) => Array.from({ length: to - from }, (_, i) => harmonyOf('dorian', from + i));

function buzz(S, t0, bars, r, pat = [[0, 0.6], [2, 0.35]], v = 1) {
  for (let b = 0; b < bars; b++) for (const [bt, vel] of pat) S.ctl('gurdy', t0 + b * 3 + bt + r.bi() * 0.01, { type: 'buzz', v: vel * v, d: 0.6 });
}

export default {
  name: 'reveal',
  tempo: 66,
  beats: 3,
  level: 0.8,
  parts: {
    voice: P.voice({ level: 0.46 }),
    gurdy: P.gurdy(),
    fiddle: P.fiddle({ pan: -0.3 }),
    zither: P.zither(),
    frame: P.frame(),
    war: P.war(),
    choirF: P.choirF(),
    choirM: P.choirM(),
    box: P.box(),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(3, 66);
      const alt = cycle % 2 === 1;
      // Intro: drones wake, a zither chord falls open, a hum and a drum roll swell.
      S.ctl('gurdy', 0, { type: 'drone', p: [50, 57], v: 0.5, fade: 1.6 });
      S.ctl('gurdy', 0, { type: 'crank', rate: 1.1, depth: 0.05 });
      S.add('zither', 0, 3, [50, 57, 62, 65, 69], { v: 0.5, strum: 0.09 });
      S.add('zither', 4.5, 3, [62, 69], { v: 0.35, strum: 0.12 });
      S.add('choirF', 6, 6, [62, 69], { vowel: 'u', v: 0.55, soft: true, tie: false });
      roll(S, 'frame', 6, 6, r, { v0: 0.05, v1: 0.7, rate: 0.25 });
      buzz(S, 9, 1, r, [[0, 0.3], [1, 0.35], [2, 0.5]]);
      // A and A': the voice alone over drones, frame drum and buzzing gurdy.
      let t = 12;
      S.mark(4, { section: 'theme A' });
      S.add('war', t, 1, null, { v: 0.95 });
      if (alt) theme(S, 'gurdy', t, r, { from: 0, to: 4, style: 'gurdy', v: 0.7, orn: 0.4 });
      theme(S, 'voice', alt ? t + 12 : t, r, { from: alt ? 4 : 0, to: 8, lyrics: true, v: 0.85, falls: 0.8 });
      groove(S, 'frame', t, 8, 'waltz', r, { v: 0.6 });
      buzz(S, t, 8, r);
      zither(S, 'zither', t, H(0, 8), r, { pattern: alt ? 'arp' : 'strum', v: 0.4 });
      S.add('war', t + 12, 1, null, { v: 0.6 });
      // B and B': fiddle in thirds, choir enters, drums build to the cadence.
      t = 36;
      S.mark(12, { section: 'theme B' });
      theme(S, 'voice', t, r, { from: 8, to: 16, lyrics: true, v: 0.92, hold: 3, falls: 1 });
      harmonize(S, 'fiddle', t, r, { from: 8, to: 16, v: 0.55 });
      groove(S, 'frame', t, 8, 'waltzFull', r, { v: 0.7, fill: 4 });
      buzz(S, t, 8, r, [[0, 0.65], [1, 0.3], [2, 0.4]]);
      zither(S, 'zither', t, H(8, 16), r, { pattern: 'strum', v: 0.45 });
      for (let b = 4; b < 8; b++) {
        S.add('war', t + b * 3, 1, null, { v: 0.45 + b * 0.07 });
        S.add('choirF', t + b * 3, 3, harmonyOf('dorian', 8 + b) === 'C' ? [60, 64, 67] : harmonyOf('dorian', 8 + b) === 'Am' ? [57, 64, 69] : [62, 65, 69], { vowel: 'a', v: 0.42, soft: true });
      }
      // The cadence: everything lands with the voice's fall onto D.
      S.add('war', 59, 1, null, { v: 1 });
      S.add('choirF', 59, 5, [62, 65, 69], { vowel: 'a', v: 0.6, fall: 2 });
      S.add('choirM', 59, 5, [38, 45], { vowel: 'o', v: 0.7, fall: 2 });
      S.add('zither', 59, 3, [38, 50, 57, 62], { v: 0.6, strum: 0.05 });
      // The gurdy takes the tune; the fiddle drones double stops under it.
      t = 66;
      S.mark(22, { section: 'gurdy theme' });
      theme(S, 'gurdy', t, r, { from: 0, to: 8, style: 'gurdy', v: 0.8, orn: 0.45 });
      buzz(S, t, 8, r, [[0, 0.7], [1, 0.35], [2, 0.5]]);
      groove(S, 'frame', t, 8, 'waltzFull', r, { v: 0.7, fill: 4 });
      for (let b = 0; b < 8; b += 2) S.add('fiddle', t + b * 3, 5.8, b % 4 ? 57 : 62, { v: 0.4, dbl: 50, soft: true });
      zither(S, 'zither', t, H(0, 8), r, { pattern: 'arp', v: 0.32 });
      // Everyone: B and B' with the choir singing the words.
      t = 90;
      S.mark(30, { section: 'full B' });
      S.add('war', t, 1, null, { v: 1 });
      theme(S, 'voice', t, r, { from: 8, to: 16, lyrics: true, v: 0.95, hold: 3, falls: 1 });
      theme(S, 'choirF', t, r, { from: 8, to: 16, style: 'choir', lyrics: true, v: 0.7, hold: 3, falls: 0.4 });
      theme(S, 'choirM', t, r, { from: 8, to: 16, style: 'choir', lyrics: true, v: 0.75, octave: -1, hold: 3, falls: 0.4 });
      harmonize(S, 'fiddle', t, r, { from: 8, to: 16, v: 0.6, steps: 2, octave: 0 });
      theme(S, 'gurdy', t, r, { from: 8, to: 16, style: 'gurdy', v: 0.55, orn: 0.2, octave: -1 });
      groove(S, 'frame', t, 8, 'waltzFull', r, { v: 0.8, fill: 4 });
      for (let b = 0; b < 8; b++) S.add('war', t + b * 3, 1, null, { v: 0.55 + (b % 4 === 0 ? 0.3 : 0) });
      buzz(S, t, 8, r, [[0, 0.75], [1, 0.4], [2, 0.5]]);
      zither(S, 'zither', t, H(8, 16), r, { pattern: 'strum', v: 0.5 });
      S.add('war', 113, 1, null, { v: 1 });
      // Coda: the music box remembers, over the drone, and the drone lets go.
      t = 117;
      S.mark(39, { section: 'coda' });
      S.add('choirF', t, 9, [62, 69], { vowel: 'u', v: 0.35, soft: true });
      motif(S, 'box', t + 3, r, { octave: 1, v: 0.55 });
      S.ctl('gurdy', t + 9, { type: 'drone', on: false, fade: 2.5 });
      S.bars(46);
      yield* S.play();
    }
  },
};
