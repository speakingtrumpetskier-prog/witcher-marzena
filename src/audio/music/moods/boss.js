// boss: the Marzanna rises. Combat's 7/8 Phrygian machinery made heavier, with the choir
// singing the Marzanno song broken into 7/8 (each 3/4 bar limps onto 2+2+3), the white voice
// wailing its falls above, a drowned bell, and a music box that has gone out of tune.
import { Score, phrase, theme, groove, roll, motif } from '../compose.js';
import { P } from './parts.js';

const RIFF = [
  ['D3', 2], ['D4', 1], ['Eb4', 1], ['D4', 1], ['C4', 1], ['Bb3', 1],
  ['A3', 2], ['Bb3', 2], ['A3', 1], ['G3', 1], ['A3', 1],
  ['D4', 1], ['D4', 1], ['Eb4', 1], ['F4', 1], ['Eb4', 1], ['D4', 1], ['C4', 1],
  ['D4', 4], ['Eb4', 3],
];

function buzzAll(S, t0, bars, v = 0.8) {
  for (let b = 0; b < bars; b++) for (const [bt, k] of [[0, 1.1], [2, 0.8], [4, 1], [6, 0.6]]) S.ctl('gurdy', t0 + b * 7 + bt, { type: 'buzz', v: v * k, d: 0.9, len: 0.14 });
}
function heavyDrums(S, t0, bars, r, v = 1) {
  groove(S, 'frame', t0, bars, 'sevenB', r, { beats: 7, v: 0.9 * v, fill: 4 });
  for (let b = 0; b < bars; b++) for (const bt of [0, 2, 4]) S.add('war', t0 + b * 7 + bt, 2, null, { v: (bt === 0 ? 1 : 0.6) * v });
}
function wail(S, t, r, v = 0.8) {
  const p = r.pick([74, 72, 70]);
  S.add('voice', t, 3, p, { v, vowel: 'a', c: 'h', scoop: 4, vib: 1.5, tie: true });
  S.add('voice', t + 3, 3.5, p - r.pick([1, 2]), { v: v * 0.9, vowel: 'o', fall: 7, fallTc: 0.25 });
}

export default {
  name: 'boss',
  tempo: 288,
  beats: 7,
  level: 0.9,
  fadeIn: 0.4,
  parts: {
    gurdy: P.gurdy({ level: 0.3, lp: 4200 }),
    fiddle: P.fiddle({ level: 0.26, pan: -0.32 }),
    frame: P.frame({ level: 0.48 }),
    war: P.war({ level: 0.6 }),
    choirF: P.choirF({ singers: 6, level: 0.16 }),
    choirM: P.choirM({ singers: 5, level: 0.2 }),
    voice: P.voice({ level: 0.36, verb: 0.5, pan: 0.12 }),
    box: P.box({ level: 0.28, verb: 0.7 }),
    bell: P.bell({ level: 0.5 }),
  },
  *score(r) {
    for (let cycle = 0; ; cycle++) {
      const S = new Score(7, 288);
      let t = 0;
      // Intro: the drowned bell, a choir cluster rising, war drum from muffled to open.
      S.mark(0, { section: 'emergence' });
      S.add('bell', 0, 14, 50, { v: 0.9, muffled: true });
      S.add('choirM', 0, 26, [38, 45], { vowel: 'o', v: 0.7, soft: true });
      S.add('choirF', 7, 19, [62, 63], { vowel: 'u', v: 0.55, soft: true, tie: true });
      S.add('choirF', 26, 2, [62, 63], { vowel: 'a', v: 0.75, fall: 3 });
      S.add('war', 0, 2, null, { v: 0.7, muffled: true });
      S.add('war', 14, 2, null, { v: 0.8, muffled: true });
      S.add('war', 21, 2, null, { v: 1 });
      roll(S, 'frame', 21, 7, r, { v0: 0.3, v1: 1, rate: 0.5, kind: 'tek' });
      S.ctl('gurdy', 14, { type: 'drone', p: [50, 51], v: 0.6, fade: 1, trompette: 62 });
      S.ctl('gurdy', 14, { type: 'crank', rate: 2.4, depth: 0.05 });
      t = 28;
      // Riff, heavy.
      S.mark(t / 7, { section: 'riff' });
      S.ctl('gurdy', t, { type: 'drone', p: [50, 57], v: 0.6, fade: 0.1, trompette: 62 });
      phrase(S, 'gurdy', t, RIFF, r, { style: 'gurdy', mode: 'phrygian', v: 0.9, orn: 0.2 });
      phrase(S, 'gurdy', t + 28, RIFF, r, { style: 'gurdy', mode: 'phrygian', v: 0.95, orn: 0.35 });
      heavyDrums(S, t, 8, r);
      buzzAll(S, t, 8);
      t += 56;
      // The choir sings the song, broken.
      S.mark(t / 7, { section: 'song broken A' });
      theme(S, 'choirF', t, r, { mode: 'phrygian', from: 0, to: 8, seven: true, style: 'choir', lyrics: true, v: 0.75, falls: 0.6 });
      theme(S, 'choirM', t, r, { mode: 'phrygian', from: 0, to: 8, seven: true, style: 'choir', lyrics: true, v: 0.8, octave: -1, falls: 0.6 });
      for (let b = 0; b < 8; b++) S.add('gurdy', t + b * 7, 6.8, b % 4 === 3 ? 51 : 50, { v: 0.5 });
      groove(S, 'frame', t, 8, 'seven', r, { beats: 7, v: 0.8, fill: 4 });
      for (let b = 0; b < 8; b++) S.add('war', t + b * 7, 2, null, { v: 0.85 });
      buzzAll(S, t, 8, 0.6);
      t += 56;
      // Riff with wails and fiddle tremolo.
      S.mark(t / 7, { section: 'riff and wail' });
      phrase(S, 'gurdy', t, RIFF, r, { style: 'gurdy', mode: 'phrygian', v: 0.9, orn: 0.35 });
      phrase(S, 'gurdy', t + 28, RIFF, r, { style: 'gurdy', mode: 'phrygian', v: 0.95, orn: 0.35, octave: 1 });
      for (let b = 0; b < 8; b += 2) S.add('fiddle', t + b * 7, 13.5, r.pick([69, 70, 74]), { v: 0.6, trem: true, bend: [[10, 69]] });
      heavyDrums(S, t, 8, r);
      buzzAll(S, t, 8);
      wail(S, t + 7, r);
      wail(S, t + 35, r, 0.9);
      t += 56;
      // The choir sings B, the voice above it; the fiddle saws.
      S.mark(t / 7, { section: 'song broken B' });
      theme(S, 'choirF', t, r, { mode: 'phrygian', from: 8, to: 16, seven: true, style: 'choir', lyrics: true, v: 0.8, falls: 0.7 });
      theme(S, 'choirM', t, r, { mode: 'phrygian', from: 8, to: 16, seven: true, style: 'choir', lyrics: true, v: 0.85, octave: -1, falls: 0.7 });
      theme(S, 'voice', t + 28, r, { mode: 'phrygian', from: 12, to: 16, seven: true, lyrics: false, v: 0.8, octave: 1, falls: 1 });
      phrase(S, 'gurdy', t, RIFF, r, { style: 'gurdy', mode: 'phrygian', v: 0.6, orn: 0.2, octave: -1 });
      heavyDrums(S, t, 8, r, 0.9);
      buzzAll(S, t, 8, 0.7);
      t += 56;
      // Breakdown: the out-of-tune music box over a hum; heartbeat drums.
      S.mark(t / 7, { section: 'music box' });
      S.ctl('gurdy', t, { type: 'drone', p: [38, 45], v: 0.45, fade: 0.4 });
      S.add('choirM', t, 27, [38], { vowel: 'u', v: 0.55, soft: true });
      motif(S, 'box', t + 2, r, { octave: 1, v: 0.65, broken: 0.6, slow: 2.2, mode: 'phrygian' });
      for (let b = 0; b < 4; b++) {
        S.add('war', t + b * 7, 2, null, { v: 0.55, muffled: true });
        S.add('war', t + b * 7 + 1.4, 2, null, { v: 0.35, muffled: true });
      }
      t += 28;
      // Climax: the first phrase hammered by everyone.
      S.mark(t / 7, { section: 'climax' });
      S.ctl('gurdy', t, { type: 'drone', p: [50, 57], v: 0.65, fade: 0.05, trompette: 62 });
      for (let k = 0; k < 2; k++) {
        theme(S, 'choirF', t + k * 28, r, { mode: 'phrygian', from: 0, to: 4, seven: true, style: 'choir', lyrics: true, v: 0.85, falls: 1 });
        theme(S, 'choirM', t + k * 28, r, { mode: 'phrygian', from: 0, to: 4, seven: true, style: 'choir', lyrics: true, v: 0.85, octave: -1, falls: 1 });
        theme(S, 'gurdy', t + k * 28, r, { mode: 'phrygian', from: 0, to: 4, seven: true, style: 'gurdy', v: 0.85, orn: 0.3 });
      }
      for (let b = 0; b < 8; b += 2) S.add('fiddle', t + b * 7, 13.5, 62 + (b % 4 ? 1 : 0), { v: 0.55, trem: true, dbl: 69 });
      heavyDrums(S, t, 8, r, 1.05);
      buzzAll(S, t, 8, 0.9);
      wail(S, t + 42, r, 0.95);
      t += 56;
      yield* S.play();
    }
  },
};
