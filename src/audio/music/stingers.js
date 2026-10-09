// Stingers: short finite scores played over the music on their own bus (the playing mood dips
// a little under them). All in D so they sit on any mood.
import { Score, motif, N } from './compose.js';
import { P } from './moods/parts.js';

function def(tempo, parts, write, extra = {}) {
  return {
    tempo, beats: 3, level: 1, parts, tail: 6, ...extra,
    *score(r) { const S = new Score(3, tempo); write(S, r); yield* S.play(); },
  };
}

export const STINGER_DEFS = {
  // A new place: a zither chord falling open, a drone breath, the voice's falling call.
  discover: def(84, { zither: P.zither({ level: 0.45 }), gurdy: P.gurdy({ level: 0.2 }), voice: P.voice({ level: 0.32, verb: 0.55 }) }, (S) => {
    S.ctl('gurdy', 0, { type: 'drone', p: [50, 57], v: 0.5, fade: 0.25 });
    S.ctl('gurdy', 4, { type: 'drone', on: false, fade: 0.8 });
    S.add('zither', 0, 4, [50, 57, 62, 65, 69], { v: 0.6, strum: 0.07 });
    S.add('voice', 0.5, 1.5, N('D5'), { v: 0.55, vowel: 'a', scoop: 2, tie: true, soft: true });
    S.add('voice', 2, 2.5, N('A4'), { v: 0.5, vowel: 'a', slide: true, fall: 4 });
    S.bars(3);
  }, { duck: 3.5 }),
  // Journal updated: a quick drum and a low two-note pluck answered by the fiddle.
  quest: def(96, { zither: P.zither({ level: 0.42 }), frame: P.frame({ level: 0.35 }), fiddle: P.fiddle({ level: 0.24 }) }, (S) => {
    S.add('frame', 0, 0.5, null, { kind: 'dum', v: 0.7 });
    S.add('frame', 0.5, 0.5, null, { kind: 'tek', v: 0.4 });
    S.add('zither', 0, 2, [N('D3'), N('A3')], { v: 0.6, strum: 0.04 });
    S.add('fiddle', 1, 1, N('A4'), { v: 0.6, tie: true });
    S.add('fiddle', 2, 1.6, N('D5'), { v: 0.6, slide: true, fall: 1 });
    S.bars(2);
  }, { duck: 2.2, duckAmount: 0.3 }),
  // Echo: the music box surfacing in a cold shimmer, a low hum underneath.
  echo: def(60, { box: P.box({ level: 0.4, verb: 0.9 }), wind: P.wind({ level: 0.4, verb: 0.8 }), throat: P.throat({ level: 0.4 }) }, (S, r) => {
    S.add('wind', 0, 9, [N('D6'), N('A5'), N('E6')], { v: 0.5, fade: 0.8, q: 70, body: 0.05, bodyF: 2000 });
    S.add('wind', 9, 3, [], { fade: 1.2 });
    S.add('throat', 0.5, 8, N('D2'), { v: 0.45, vowel: 'u', morph: ['u', 'o', 'u'], soft: true });
    motif(S, 'box', 1, r, { octave: 1, v: 0.6, slow: 0.9 });
    S.bars(4);
  }, { duck: 6, duckAmount: 0.5 }),
  // Danger: a war drum blow, a buzzing semitone cluster on the gurdy, a fiddle scrape.
  danger: def(90, { war: P.war({ level: 0.6 }), gurdy: P.gurdy({ level: 0.32 }), fiddle: P.fiddle({ level: 0.26 }) }, (S) => {
    S.add('war', 0, 2, null, { v: 1 });
    S.ctl('gurdy', 0, { type: 'drone', p: [50, 51], v: 0.8, fade: 0.02, trompette: 62 });
    for (const bt of [0, 0.5, 1, 1.5]) S.ctl('gurdy', bt, { type: 'buzz', v: 1 - bt * 0.3, d: 0.4 });
    S.ctl('gurdy', 2.5, { type: 'drone', on: false, fade: 0.4 });
    S.add('fiddle', 0.05, 2.5, N('Eb5'), { v: 0.7, scrape: true, bend: [[1, N('D5')]], fall: 3 });
    S.bars(2);
  }, { duck: 2.5, duckAmount: 0.5 }),
  // A decisive choice: a bell, an unresolved choir chord, two heartbeats.
  choice: def(60, { bell: P.bell({ level: 0.36 }), choirF: P.choirF({ level: 0.16 }), pulse: P.pulse({ level: 0.5 }) }, (S) => {
    S.add('bell', 0, 6, N('D4'), { v: 0.6 });
    S.add('choirF', 0, 3.5, [N('A3'), N('D4'), N('E4'), N('A4')], { vowel: 'o', v: 0.65, soft: true });
    S.add('pulse', 1.5, 0.5, null, { v: 0.7 });
    S.add('pulse', 1.92, 0.5, null, { v: 0.45 });
    S.add('pulse', 3, 0.5, null, { v: 0.6 });
    S.add('pulse', 3.42, 0.5, null, { v: 0.38 });
    S.bars(2);
  }, { duck: 4, duckAmount: 0.5 }),
  // Death: low voices falling, a muffled drum, the music box running down.
  death: def(54, { choirM: P.choirM({ level: 0.2 }), throat: P.throat({ level: 0.42 }), war: P.war({ level: 0.5 }), box: P.box({ level: 0.3 }) }, (S, r) => {
    S.add('war', 0, 2, null, { v: 0.9, muffled: true });
    S.add('choirM', 0, 5, [N('D3'), N('A3')], { vowel: 'o', v: 0.75, fall: 4 });
    S.add('throat', 0, 6, N('D2'), { v: 0.6, vowel: 'a', morph: ['a', 'o', 'u'], fall: 3 });
    S.add('war', 3, 2, null, { v: 0.6, muffled: true });
    motif(S, 'box', 3.5, r, { octave: 1, v: 0.5, broken: 0.8, slow: 1.8 });
    S.bars(5);
  }, { duck: 8, duckAmount: 0.7 }),
  // The title card: one great blow and the whole ensemble on D minor, the voice falling to D.
  reveal: def(66, {
    war: P.war({ level: 0.62 }), gurdy: P.gurdy({ level: 0.3 }), choirF: P.choirF({ level: 0.17 }), choirM: P.choirM({ level: 0.2 }),
    voice: P.voice({ level: 0.46 }), bell: P.bell({ level: 0.3 }), frame: P.frame({ level: 0.4 }),
  }, (S) => {
    S.add('war', 0, 2, null, { v: 1 });
    S.add('bell', 0, 9, N('D3'), { v: 0.7 });
    S.ctl('gurdy', 0, { type: 'drone', p: [38, 45], v: 0.75, fade: 0.05, trompette: 50 });
    for (const bt of [0, 1, 2, 3]) S.ctl('gurdy', bt, { type: 'buzz', v: 0.9 - bt * 0.15, d: 0.8 });
    S.ctl('gurdy', 7, { type: 'drone', on: false, fade: 1.5 });
    S.add('choirF', 0, 7, [N('D4'), N('F4'), N('A4')], { vowel: 'a', v: 0.75 });
    S.add('choirM', 0, 7, [N('D3'), N('A3')], { vowel: 'a', v: 0.8 });
    S.add('voice', 0.3, 3, N('A4'), { v: 0.9, vowel: 'a', scoop: 2, tie: true, vib: 1.2 });
    S.add('voice', 3.3, 1.2, N('F4'), { v: 0.85, vowel: 'a', tie: true, slide: true });
    S.add('voice', 4.5, 3, N('D4'), { v: 0.85, vowel: 'a', slide: true, fall: 4 });
    S.add('war', 3, 2, null, { v: 0.55 });
    S.bars(4);
  }, { duck: 8, duckAmount: 0.6 }),
};
