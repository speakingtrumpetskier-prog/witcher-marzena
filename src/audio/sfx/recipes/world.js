// World recipes: the ice (cracks, groans, the dispersive "singing" pings, spikes), effigies,
// the drowned bell, the boss scream; loop beds (fires, torches, water, crowd, senses hum,
// heartbeat) and ambience-only sounds (names starting with '_', not part of the public list).
import { burst, grains, thump, resonate, whoosh, ring, chirp, creak, fire, vocal, mix, fade, len, hp1, lp1, Biquad, envAD, shape, osc, curve, clamp, white, pink, brown } from '../kit.js';
import { renderBell } from '../../instruments/baked.js';
import { makeLoop, widen, wander, normalize } from '../../dsp.js';

const done = (b, sr, lp = 9000) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 30); return fade(b, sr, 0.001, 0.05); };

// Flexural waves in ice are dispersive: high frequencies arrive first, so a crack far away
// "sings" as a falling whistle. A few of these with echoes is the voice of the frozen lake.
function iceSing(sr, r, dur, { f0 = 3000, f1 = 180, tau = 0.5, echoes = 2 } = {}) {
  const b = new Float32Array(len(sr, dur));
  const one = () => {
    const c = chirp(sr, Math.min(dur, 1.2), f0, f1, { tau, attack: 0.003, k: 0.6 });
    const nz = white(c.length, r);
    new Biquad(sr, 'bandpass', 1200, 0.5).run(nz);
    envAD(nz, sr, 0.001, 0.03);
    mix(c, nz, 0.15);
    return c;
  };
  mix(b, one(), 0.8);
  let t = 0;
  for (let k = 1; k <= echoes; k++) {
    t += 0.22 + r() * 0.3;
    mix(b, one(), 0.5 * Math.pow(0.55, k), Math.floor(t * sr));
  }
  return b;
}

function babble(sr, r, dur, { voices = 7, lp = 1600, rate = 4 } = {}) {
  const n = len(sr, dur), b = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const male = r() < 0.55;
    let t = r() * 1.5;
    while (t < dur - 0.3) {
      const words = r.int(3, 9);
      const f0 = male ? 105 + r() * 35 : 190 + r() * 50;
      for (let w = 0; w < words && t < dur - 0.3; w++) {
        const d = 0.08 + r() * 0.16;
        const v1 = r.pick(['a', 'e', 'o', 'u', 'i']);
        const s = vocal(sr, r, d, { f0: (x) => f0 * (1 + 0.15 * Math.sin(x * 9 + w)), vowel: () => v1, type: male ? 'tenor' : 'alto', breath: 0.15, jitter: 0.02, env: (x) => Math.sin(Math.PI * clamp(x / d, 0, 1)) });
        mix(b, s, 0.5 + r() * 0.5, Math.floor(t * sr));
        t += d + 0.02 + r() * 0.06;
      }
      t += 0.4 + r() * rate;
    }
  }
  new Biquad(sr, 'lowpass', lp, 0.7).run(b);
  return b;
}

export const WORLD = {
  ice_crack: {
    variants: 5, gain: 0.7, ref: 12, max: 500, pitchVar: 0.08, verb: 0.35, poly: 3,
    bake: (sr, r) => {
      const dur = 1.8, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.01, { hp: 500, env: { a: 0.0002, d: 0.0015 } }), 0.9);
      mix(b, iceSing(sr, r, 1.4, { f0: 3200 + r() * 1000, f1: 300, tau: 0.25, echoes: 1 }), 0.45);
      mix(b, thump(sr, r, 1.0, { f: 60, fEnd: 34, decay: 0.28, click: 0, noise: 0.7, lp: 220 }), 0.9);
      const cr = white(len(sr, 0.4), r);
      const cc = new Float32Array(cr.length);
      for (let i = 0; i < cr.length; i++) cc[i] = r() < 0.004 * Math.exp(-i / (0.12 * sr)) ? r.bi() : 0;
      new Biquad(sr, 'highpass', 900, 0.7).run(cc);
      mix(b, resonate(cc, sr, [[1500, 3, 1], [2600, 4, 0.6]]), 1.5);
      return done(b, sr, 8000);
    },
  },
  ice_groan: {
    variants: 5, gain: 0.75, ref: 25, max: 900, pitchVar: 0.1, verb: 0.45, poly: 3,
    bake: (sr, r) => {
      const dur = 2.8 + r() * 1.4, b = new Float32Array(len(sr, dur));
      const rc = curve([[0, 22], [dur * 0.3, 55 + r() * 25], [dur * 0.65, 30], [dur, 14]]);
      const g = creak(sr, r, dur, { rate: rc, modes: [[85 + r() * 20, 4, 1], [170 + r() * 30, 5, 0.6], [300 + r() * 50, 6, 0.35], [520, 7, 0.15]], jitter: 0.3, env: (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) ** 0.7 });
      mix(b, g, 0.8);
      mix(b, burst(sr, r, dur, { color: 'brown', lp: 120, env: [[0, 0], [dur * 0.3, 1], [dur, 0]] }), 1.2);
      mix(b, iceSing(sr, r, 1.6, { f0: 900 + r() * 400, f1: 110, tau: 0.6, echoes: 1 }), 0.3, Math.floor(dur * (0.3 + r() * 0.4) * sr));
      return done(b, sr, 3500);
    },
  },
  ice_ping: {
    variants: 6, gain: 0.45, ref: 25, max: 900, pitchVar: 0.1, verb: 0.55, poly: 4,
    bake: (sr, r) => done(iceSing(sr, r, 2.2, { f0: 2400 + r() * 1800, f1: 150 + r() * 120, tau: 0.35 + r() * 0.3, echoes: r.int(1, 3) }), sr, 7000),
  },
  ice_spike: {
    variants: 4, gain: 0.6, ref: 5, max: 80, pitchVar: 0.08, verb: 0.25, poly: 4,
    bake: (sr, r) => {
      const dur = 1.0, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.012, { hp: 600, env: { a: 0.0002, d: 0.002 } }), 0.7);
      mix(b, grains(sr, r, 0.5, { count: 220, bands: [[1800, 2], [3200, 2.5], [4600, 3]], decay: 0.0007, spread: 0.6 }), 0.6);
      mix(b, whoosh(sr, r, 0.35, { f0: 800, f1: 3500, q: 1.5, peak: 0.6, color: 'white' }), 0.25);
      mix(b, ring(sr, r, 0.8, 1900 + r() * 600, [1, 1.5, 2.3], { decay: 0.25 }), 0.15, Math.floor(0.1 * sr));
      mix(b, thump(sr, r, 0.5, { f: 85, fEnd: 45, decay: 0.08, click: 0.1, noise: 0.6 }), 0.6);
      return done(b, sr, 7500);
    },
  },
  bell_under_ice: {
    variants: 2, gain: 0.85, ref: 40, max: 1200, pitchVar: 0, verb: 0.5, poly: 2,
    bake: (sr, r, i) => renderBell(sr, r, i ? 45 : 50, true),
  },
  boss_scream: {
    variants: 3, gain: 0.75, ref: 15, max: 600, pitchVar: 0.04, verb: 0.4, poly: 1,
    bake: (sr, r) => {
      const dur = 2.6, b = new Float32Array(len(sr, dur));
      const fc = curve([[0, 480], [0.35, 880 + r() * 100], [1.4, 760], [2.1, 520], [2.6, 300]]);
      const env = (t) => clamp(t / 0.08, 0, 1) * clamp((dur - t) / 0.6, 0, 1);
      mix(b, vocal(sr, r, dur, { f0: (t) => fc(t) * (1 + 0.02 * Math.sin(t * 6.283 * 7)), vowel: (t) => (t < 0.8 ? 'a' : t < 1.6 ? 'e' : 'a'), type: 'soprano', breath: 0.3, jitter: 0.035, rough: 0.35, shimmer: 0.2, env }), 0.7);
      mix(b, vocal(sr, r, dur, { f0: (t) => fc(t) * 0.5, vowel: () => 'o', type: 'bass', breath: 0.3, jitter: 0.05, rough: 0.6, env }), 0.5);
      const sh = whoosh(sr, r, 1.6, { f0: 3000, f1: 1600, q: 3, peak: 0.3, color: 'white' });
      mix(b, sh, 0.2, Math.floor(0.2 * sr));
      mix(b, burst(sr, r, dur, { color: 'brown', lp: 90, env: [[0, 0], [0.3, 1], [dur, 0]] }), 1.6);
      return done(b, sr, 7000);
    },
  },
  effigy_creak: {
    variants: 5, gain: 0.55, ref: 4, max: 60, pitchVar: 0.08, verb: 0.15, poly: 3,
    bake: (sr, r) => {
      const dur = 0.8 + r() * 0.4, b = new Float32Array(len(sr, dur));
      const rc = curve([[0, 40], [dur * 0.4, 110 + r() * 40], [dur, 50]]);
      mix(b, creak(sr, r, dur, { rate: rc, modes: [[330 + r() * 60, 10, 1], [760, 12, 0.5], [1500, 14, 0.22]], env: (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) }), 0.6);
      mix(b, grains(sr, r, dur, { count: 50, bands: [[2400, 1.2], [3900, 1.5]], decay: 0.001, spread: 0.3 }), 0.25);
      return done(b, sr, 7000);
    },
  },
  effigy_burn: {
    variants: 2, gain: 0.65, ref: 5, max: 90, pitchVar: 0.04, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 3.6, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 1.0, { f0: 140, f1: 1200, q: 0.7, peak: 0.3 }), 0.9);
      const f = fire(sr, r, 3.3, { roar: 0.7, crackles: 40, pops: 5, hiss: 0.3 });
      shape(f, sr, (t) => clamp(t / 0.4, 0, 1) * clamp((3.3 - t) / 1.2, 0, 1));
      mix(b, f, 0.9, Math.floor(0.2 * sr));
      return done(b, sr, 7500);
    },
  },
  effigy_collapse: {
    variants: 3, gain: 0.7, ref: 5, max: 90, pitchVar: 0.05, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 2.0, b = new Float32Array(len(sr, dur));
      mix(b, grains(sr, r, 1.5, { count: 420, bands: [[1500, 1], [3000, 1.2], [800, 1]], decay: 0.0011, spread: 0.45 }), 0.55);
      for (const t of [0, 0.22 + r() * 0.1, 0.55 + r() * 0.15]) mix(b, thump(sr, r, 0.5, { f: 95, fEnd: 50, decay: 0.07, click: 0.1, noise: 1, lp: 500 }), 0.6, Math.floor(t * sr));
      mix(b, burst(sr, r, 1.4, { color: 'brown', lp: 400, env: { a: 0.05, d: 0.35 } }), 0.6);
      const hs = burst(sr, r, 1.2, { hp: 2500, lp: 6500, env: [[0, 0], [0.4, 0.6], [1.2, 0]] });
      mix(b, hs, 0.12, Math.floor(0.5 * sr));
      return done(b, sr, 7000);
    },
  },
  // Ambience-only spot sounds.
  _tree_creak: {
    variants: 4, gain: 0.45, ref: 8, max: 150, pitchVar: 0.1, verb: 0.3, poly: 2,
    bake: (sr, r) => {
      const dur = 1.2 + r() * 1.2;
      const rc = curve([[0, 15], [dur * 0.5, 45 + r() * 30], [dur, 12]]);
      return done(creak(sr, r, dur, { rate: rc, modes: [[180 + r() * 60, 8, 1], [420 + r() * 80, 10, 0.5], [900, 12, 0.2]], jitter: 0.25, env: (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) }), sr, 4000);
    },
  },
  _fire_pop: {
    variants: 6, gain: 0.35, ref: 2, max: 20, pitchVar: 0.2, verb: 0.05, poly: 6,
    bake: (sr, r) => {
      const b = burst(sr, r, 0.05, { bp: 900 + r() * 1800, q: 1.2, env: { a: 0.0003, d: 0.004 } });
      return done(b, sr, 8000);
    },
  },
};

// Loop recipes: bake(sr, r) returns a seamless buffer (mono or [L, R]).
const loopOf = (b, sr, x = 0.4) => (Array.isArray(b) ? b.map((c) => makeLoop(c, sr, x)) : makeLoop(b, sr, x));
export const LOOPS = {
  fire_crackle: { gain: 0.5, ref: 2.5, max: 30, verb: 0.08, spawn: { name: '_fire_pop', rate: 1.2, volume: 0.5 }, bake: (sr, r) => loopOf(normalize(fire(sr, r, 9, { roar: 0.6, crackles: 22, pops: 2 }), 0.8), sr) },
  torch: {
    gain: 0.45, ref: 2, max: 25, verb: 0.08, bake: (sr, r) => {
      const f = fire(sr, r, 7, { roar: 0.8, crackles: 10, pops: 1, hiss: 0.1 });
      const w = wander(f.length, sr, 3, r);
      for (let i = 0; i < f.length; i++) f[i] *= 0.75 + 0.25 * w[i];
      return loopOf(normalize(f, 0.8), sr);
    },
  },
  effigy_fire: { gain: 0.7, ref: 4, max: 70, verb: 0.15, spawn: { name: '_fire_pop', rate: 3, volume: 0.8 }, bake: (sr, r) => loopOf(widen(normalize(fire(sr, r, 10, { roar: 1, crackles: 40, pops: 5, hiss: 0.3 }), 0.8), sr, 11, 0.5), sr) },
  senses_hum: {
    gain: 0.35, ui: true, verb: 0.2, bake: (sr, r) => {
      const dur = 8, n = len(sr, dur);
      const L = new Float32Array(n), R = new Float32Array(n);
      // Partials chosen to complete whole cycles in 8 s so the loop is seamless.
      for (const [f, a] of [[55, 1], [82.5, 0.5], [110.125, 0.35], [164.875, 0.15]]) {
        const s1 = osc(sr, n, f, 'sine'), s2 = osc(sr, n, f + 0.125, 'sine');
        mix(L, s1, a); mix(R, s2, a);
      }
      const br = pink(n, r);
      new Biquad(sr, 'bandpass', 700, 0.8).run(br);
      shape(br, sr, (t) => 0.5 + 0.5 * Math.sin((t / dur) * 6.283 * 2));
      mix(L, br, 0.25); mix(R, br, 0.25);
      return [normalize(L, 0.6), normalize(R, 0.6)];
    },
  },
  heartbeat: {
    gain: 0.75, ui: true, verb: 0, bake: (sr, r) => {
      const period = 60 / 66, n = len(sr, period * 4), b = new Float32Array(n);
      for (let k = 0; k < 4; k++) {
        mix(b, thump(sr, r, 0.4, { f: 58, fEnd: 40, decay: 0.07, click: 0, noise: 0.15, lp: 200 }), 1, Math.floor(k * period * sr));
        mix(b, thump(sr, r, 0.4, { f: 50, fEnd: 36, decay: 0.06, click: 0, noise: 0.15, lp: 200 }), 0.7, Math.floor((k * period + 0.29) * sr));
      }
      new Biquad(sr, 'lowpass', 1200, 0.7).run(b);
      return normalize(b, 0.8);
    },
  },
  water_flow: {
    gain: 0.45, ref: 6, max: 90, verb: 0.15, bake: (sr, r) => {
      const dur = 10, ch = [];
      for (let c = 0; c < 2; c++) {
        const b = pink(len(sr, dur + 0.5), r);
        new Biquad(sr, 'bandpass', 900, 0.5).run(b);
        const w = wander(b.length, sr, 2, r);
        for (let i = 0; i < b.length; i++) b[i] *= 0.7 + 0.3 * w[i];
        for (let k = 0; k < 60; k++) {
          const f = 500 + r() * 1500;
          mix(b, chirp(sr, 0.06, f, f * 1.6, { tau: 0.015, attack: 0.002, k: -1 }), 0.08, Math.floor(r() * dur * sr));
        }
        ch.push(normalize(b, 0.7));
      }
      return loopOf(ch, sr, 0.5);
    },
  },
  crowd_murmur: {
    gain: 0.45, ref: 5, max: 60, verb: 0.2, bake: (sr, r) => {
      const L = babble(sr, r, 12.5, { voices: 7, lp: 2600, rate: 2 }), R = babble(sr, r, 12.5, { voices: 7, lp: 2600, rate: 2 });
      return loopOf([normalize(L, 0.7), normalize(R, 0.7)], sr, 0.5);
    },
  },
  // Ambience beds (internal).
  _forest_bed: {
    gain: 0.5, ui: true, verb: 0, bake: (sr, r) => {
      const dur = 14.5, ch = [];
      for (let c = 0; c < 2; c++) {
        const b = pink(len(sr, dur), r);
        new Biquad(sr, 'lowpass', 1900, 0.6).run(b);
        new Biquad(sr, 'highpass', 150, 0.6).run(b);
        const w = wander(b.length, sr, 0.25, r);
        for (let i = 0; i < b.length; i++) b[i] *= 0.55 + 0.45 * (0.5 + 0.5 * w[i]);
        ch.push(normalize(b, 0.7));
      }
      return loopOf(ch, sr, 1.2);
    },
  },
  _village_bed: {
    gain: 0.4, ui: true, verb: 0, bake: (sr, r) => {
      const L = babble(sr, r, 12.5, { voices: 5, lp: 1200, rate: 5 }), R = babble(sr, r, 12.5, { voices: 5, lp: 1200, rate: 5 });
      return loopOf([normalize(L, 0.6), normalize(R, 0.6)], sr, 0.8);
    },
  },
  _lake_bed: {
    gain: 0.4, ui: true, verb: 0, bake: (sr, r) => {
      const dur = 12.5, ch = [];
      for (let c = 0; c < 2; c++) {
        const b = brown(len(sr, dur), r);
        lp1(b, sr, 140);
        const h = pink(b.length, r);
        new Biquad(sr, 'bandpass', 2500, 0.5).run(h);
        mix(b, h, 0.04);
        ch.push(normalize(b, 0.6));
      }
      return loopOf(ch, sr, 1);
    },
  },
};
