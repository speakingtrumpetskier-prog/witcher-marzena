// Combat recipes: sword swings, impacts on flesh, straw and ice, parry and block, draw and
// sheathe, dodge and roll, body falls, the three signs, senses, and Vesna's non-verbal voice.
import { burst, grains, thump, whoosh, ring, chirp, fire, vocal, mix, fade, len, hp1, Biquad, envAD, shape, osc, curve, clamp } from '../kit.js';
import { mtof } from '../../dsp.js';

const done = (b, sr, lp = 9000) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 40); return fade(b, sr, 0.0005, 0.02); };

export const COMBAT = {
  sword_whoosh: {
    variants: 6, rate: 32000, gain: 0.5, ref: 2, max: 30, pitchVar: 0.07, verb: 0.05, poly: 4,
    bake: (sr, r) => {
      const dur = 0.26 + r() * 0.06;
      const b = whoosh(sr, r, dur, { f0: 350 + r() * 150, f1: 1700 + r() * 600, q: 1.5, peak: 0.45 + r() * 0.1, tone: 0.03, toneF: 2400 + r() * 400 });
      return done(b, sr, 7500);
    },
  },
  sword_whoosh_heavy: {
    variants: 4, gain: 0.6, ref: 2, max: 30, pitchVar: 0.06, verb: 0.05, poly: 3,
    bake: (sr, r) => {
      const dur = 0.45 + r() * 0.08, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, dur, { f0: 170, f1: 900 + r() * 200, q: 1.0, peak: 0.5 }), 1);
      mix(b, whoosh(sr, r, dur, { f0: 80, f1: 260, q: 0.8, peak: 0.5, color: 'pink' }), 0.6);
      return done(b, sr, 6500);
    },
  },
  hit_flesh: {
    variants: 6, gain: 0.7, ref: 2.5, max: 35, pitchVar: 0.07, verb: 0.08, poly: 4,
    bake: (sr, r) => {
      const dur = 0.35, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 115 + r() * 20, fEnd: 60, decay: 0.06, click: 0.2, noise: 1.0, lp: 650 }), 1);
      mix(b, burst(sr, r, 0.06, { bp: 1100 + r() * 300, q: 0.8, env: { a: 0.0005, d: 0.012 } }), 0.6);
      mix(b, burst(sr, r, 0.14, { hp: 2600, lp: 6000, env: { a: 0.002, d: 0.03 } }), 0.15);
      mix(b, grains(sr, r, 0.15, { count: 18, bands: [[600, 2], [1100, 2]], decay: 0.002 }), 0.35);
      return done(b, sr, 6500);
    },
  },
  hit_straw: {
    variants: 5, gain: 0.6, ref: 2.5, max: 35, pitchVar: 0.08, verb: 0.08, poly: 4,
    bake: (sr, r) => {
      const dur = 0.45, b = new Float32Array(len(sr, dur));
      mix(b, grains(sr, r, dur, { count: 170, bands: [[2100, 1.2], [3600, 1.5], [1100, 1.2]], decay: 0.001, spread: 0.7 }), 0.55);
      mix(b, thump(sr, r, dur, { f: 125, fEnd: 70, decay: 0.04, click: 0.1, noise: 0.7, lp: 500 }), 0.6);
      return done(b, sr, 7000);
    },
  },
  hit_ice: {
    variants: 5, rate: 32000, gain: 0.6, ref: 2.5, max: 40, pitchVar: 0.06, verb: 0.15, poly: 4,
    bake: (sr, r) => {
      const dur = 0.7, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.012, { hp: 700, env: { a: 0.0002, d: 0.002 } }), 0.6);
      mix(b, ring(sr, r, 0.6, 2300 + r() * 700, [1, 1.53, 2.31, 3.1], { decay: 0.16, amps: [1, 0.6, 0.35, 0.18] }), 0.25);
      mix(b, grains(sr, r, 0.4, { count: 60, bands: [[3000, 3], [4500, 3], [2000, 2]], decay: 0.0007, spread: 0.5 }), 0.4, Math.floor(0.005 * sr));
      mix(b, thump(sr, r, 0.3, { f: 95, fEnd: 60, decay: 0.04, click: 0, noise: 0.6, lp: 500 }), 0.5);
      return done(b, sr, 7500);
    },
  },
  parry: {
    variants: 4, rate: 32000, gain: 0.55, ref: 3, max: 50, pitchVar: 0.04, verb: 0.15, poly: 3,
    bake: (sr, r) => {
      const dur = 1.3, b = new Float32Array(len(sr, dur));
      mix(b, ring(sr, r, dur, 820 + r() * 160, [1, 2.76, 5.4, 8.93, 1.51, 3.6], { decay: 0.9, amps: [1, 0.7, 0.4, 0.15, 0.45, 0.3], spread: 0.004 }), 0.45);
      mix(b, burst(sr, r, 0.05, { hp: 2800, lp: 7000, env: { a: 0.0003, d: 0.01 } }), 0.4);
      mix(b, thump(sr, r, 0.2, { f: 200, fEnd: 140, decay: 0.015, click: 0.3, noise: 0.3, lp: 1000 }), 0.4);
      return done(b, sr, 8000);
    },
  },
  block: {
    variants: 4, rate: 32000, gain: 0.55, ref: 3, max: 45, pitchVar: 0.05, verb: 0.1, poly: 3,
    bake: (sr, r) => {
      const dur = 0.6, b = new Float32Array(len(sr, dur));
      mix(b, ring(sr, r, dur, 560 + r() * 120, [1, 2.4, 4.1, 5.9], { decay: 0.22, amps: [1, 0.5, 0.3, 0.15] }), 0.45);
      mix(b, thump(sr, r, dur, { f: 140, fEnd: 90, decay: 0.04, click: 0.4, noise: 0.8, lp: 800 }), 0.7);
      return done(b, sr, 7000);
    },
  },
  sword_draw: {
    variants: 3, rate: 32000, gain: 0.3, ref: 2, max: 20, pitchVar: 0.03, verb: 0.08, poly: 2,
    bake: (sr, r) => {
      const dur = 1.2, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.55, { q: 4, sweep: (t) => 2400 + 3000 * (t / 0.55), env: [[0, 0], [0.04, 0.6], [0.38, 1], [0.5, 0.25], [0.55, 0]] }), 0.5);
      mix(b, burst(sr, r, 0.55, { q: 1.2, sweep: (t) => 900 + 600 * (t / 0.55), env: [[0, 0], [0.05, 0.5], [0.45, 0.6], [0.55, 0]] }), 0.3);
      mix(b, ring(sr, r, 0.7, 1750 + r() * 200, [1, 2.76, 5.4], { decay: 0.45, amps: [1, 0.4, 0.15] }), 0.18, Math.floor(0.47 * sr));
      return done(b, sr, 7500);
    },
  },
  sword_sheathe: {
    variants: 3, gain: 0.5, ref: 2, max: 20, pitchVar: 0.03, verb: 0.08, poly: 2,
    bake: (sr, r) => {
      const dur = 0.7, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.45, { q: 4, sweep: (t) => 4800 - 2600 * (t / 0.45), env: [[0, 0], [0.04, 0.8], [0.35, 0.7], [0.45, 0]] }), 0.45);
      mix(b, thump(sr, r, 0.25, { f: 170, fEnd: 110, decay: 0.03, click: 0.5, noise: 0.6, lp: 900 }), 0.6, Math.floor(0.44 * sr));
      return done(b, sr, 7000);
    },
  },
  dodge: {
    variants: 4, gain: 0.5, ref: 2, max: 25, pitchVar: 0.07, verb: 0.03, poly: 2,
    bake: (sr, r) => {
      const dur = 0.4, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.32, { f0: 240, f1: 950, q: 0.7, peak: 0.4 }), 0.8);
      mix(b, grains(sr, r, 0.3, { count: 45, bands: [[1500, 1.5], [3000, 2]], decay: 0.001, spread: 0.8 }), 0.35, Math.floor(0.12 * sr));
      return done(b, sr, 7000);
    },
  },
  roll: {
    variants: 3, gain: 0.55, ref: 2, max: 25, pitchVar: 0.05, verb: 0.03, poly: 2,
    bake: (sr, r) => {
      const dur = 0.8, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.5, { f0: 200, f1: 800, q: 0.7, peak: 0.35 }), 0.7);
      mix(b, thump(sr, r, 0.4, { f: 90, fEnd: 55, decay: 0.06, click: 0.05, noise: 0.9, lp: 450 }), 0.7, Math.floor(0.25 * sr));
      mix(b, grains(sr, r, 0.5, { count: 120, bands: [[1400, 1.5], [2800, 2]], decay: 0.001, spread: 0.6 }), 0.4, Math.floor(0.2 * sr));
      return done(b, sr, 7000);
    },
  },
  body_fall: {
    variants: 3, gain: 0.7, ref: 3, max: 40, pitchVar: 0.05, verb: 0.08, poly: 3,
    bake: (sr, r) => {
      const dur = 0.9, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, 0.6, { f: 75, fEnd: 40, decay: 0.12, click: 0.05, noise: 1.2, lp: 500 }), 1);
      mix(b, thump(sr, r, 0.3, { f: 110, fEnd: 60, decay: 0.05, click: 0.05, noise: 0.8, lp: 600 }), 0.5, Math.floor((0.14 + r() * 0.08) * sr));
      mix(b, grains(sr, r, 0.6, { count: 130, bands: [[1300, 1.5], [2600, 2]], decay: 0.0012, spread: 0.9 }), 0.4);
      return done(b, sr, 6500);
    },
  },
  sign_ember: {
    variants: 3, gain: 0.7, ref: 3, max: 40, pitchVar: 0.04, verb: 0.15, poly: 2,
    bake: (sr, r) => {
      const dur = 1.5, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.75, { f0: 110, f1: 750, q: 0.6, peak: 0.22 }), 1);
      mix(b, thump(sr, r, 0.6, { f: 70, fEnd: 40, decay: 0.18, click: 0, noise: 0.5, lp: 250 }), 0.8);
      const f = fire(sr, r, 1.2, { roar: 0.5, crackles: 45, pops: 5 });
      envAD(f, sr, 0.05, 0.3);
      mix(b, f, 0.8, Math.floor(0.1 * sr));
      return done(b, sr, 7000);
    },
  },
  sign_gale: {
    variants: 3, gain: 0.45, ref: 3, max: 45, pitchVar: 0.04, verb: 0.15, poly: 2,
    bake: (sr, r) => {
      const dur = 1.2, b = new Float32Array(len(sr, dur));
      const w = whoosh(sr, r, 1.0, { f0: 300, f1: 2400, q: 0.6, peak: 0.18, color: 'white' });
      shape(w, sr, (t) => 1 - 0.35 * (0.5 + 0.5 * Math.sin(t * 6.283 * 17)));
      mix(b, w, 0.8);
      mix(b, burst(sr, r, 0.6, { color: 'brown', lp: 220, env: { a: 0.01, d: 0.18 } }), 1.4);
      mix(b, whoosh(sr, r, 0.9, { f0: 150, f1: 500, q: 0.9, peak: 0.25 }), 0.6, Math.floor(0.05 * sr));
      return done(b, sr, 6500);
    },
  },
  sign_ward: {
    variants: 2, rate: 32000, gain: 0.5, ref: 3, max: 30, pitchVar: 0.01, verb: 0.3, poly: 2,
    bake: (sr, r) => {
      const dur = 1.8, n = len(sr, dur), b = new Float32Array(n);
      [74, 81, 86, 89, 93].forEach((m, k) => {
        const s = osc(sr, n, mtof(m) * (1 + r.bi() * 0.002), 'sine');
        const rate = 6 + r() * 6, ph = r() * 6;
        shape(s, sr, (t) => clamp(t / 0.15, 0, 1) * Math.exp(-t / (0.9 - k * 0.1)) * (0.7 + 0.3 * Math.sin(t * rate * 6.283 + ph)));
        mix(b, s, 0.22 / (1 + k * 0.4));
      });
      mix(b, chirp(sr, 0.5, 400, 1600, { tau: 0.2, attack: 0.05, k: -1 }), 0.15);
      mix(b, ring(sr, r, 1.2, 1400, [1, 1.6, 2.4], { decay: 0.5, amps: [1, 0.5, 0.3] }), 0.15, Math.floor(0.03 * sr));
      return done(b, sr, 7000);
    },
  },
  ward_hit: {
    variants: 3, rate: 32000, gain: 0.55, ref: 3, max: 35, pitchVar: 0.04, verb: 0.25, poly: 2,
    bake: (sr, r) => {
      const dur = 1.0, b = new Float32Array(len(sr, dur));
      mix(b, ring(sr, r, dur, 1250 + r() * 200, [1, 1.6, 2.41, 3.2], { decay: 0.45, amps: [1, 0.6, 0.4, 0.2] }), 0.35);
      mix(b, thump(sr, r, 0.3, { f: 120, fEnd: 70, decay: 0.04, click: 0.2, noise: 0.5 }), 0.6);
      mix(b, burst(sr, r, 0.4, { hp: 2000, lp: 6000, env: { a: 0.002, d: 0.08 } }), 0.12);
      return done(b, sr, 7000);
    },
  },
  senses_on: {
    variants: 1, gain: 0.45, verb: 0.3, poly: 1, pitchVar: 0, ui: true,
    bake: (sr, r) => {
      const dur = 1.4, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 1.0, { f0: 120, f1: 900, q: 1.2, peak: 0.6 }), 0.7);
      mix(b, thump(sr, r, 0.5, { f: 60, fEnd: 42, decay: 0.09, click: 0, noise: 0.1, lp: 200 }), 0.8, Math.floor(0.55 * sr));
      const s = osc(sr, len(sr, 1.0), (t) => 1175 * (1 + t * 0.02), 'sine');
      shape(s, sr, (t) => Math.sin(Math.PI * clamp(t, 0, 1)) ** 2);
      mix(b, s, 0.05, Math.floor(0.35 * sr));
      return done(b, sr, 6000);
    },
  },
  senses_off: {
    variants: 1, gain: 0.4, verb: 0.25, poly: 1, pitchVar: 0, ui: true,
    bake: (sr, r) => {
      const dur = 0.9, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.8, { f0: 900, f1: 150, q: 1.2, peak: 0.2 }), 0.6);
      return done(b, sr, 6000);
    },
  },
  vesna_hurt: {
    variants: 6, gain: 0.55, ref: 2, max: 25, pitchVar: 0.04, verb: 0.05, poly: 1, cool: 0.25,
    bake: (sr, r, i) => {
      const dur = 0.2 + r() * 0.18;
      const f0 = 215 + r() * 40, drop = 0.75 + r() * 0.1;
      const v1 = ['u', 'a', 'e', 'o', 'a', 'u'][i % 6], v2 = r.pick(['a', 'o', 'u']);
      const b = vocal(sr, r, dur, {
        f0: (t) => f0 * (1 + 0.12 * Math.exp(-t / 0.02)) * (1 - (1 - drop) * (t / dur)), vowel: (t) => (t < dur * 0.4 ? v1 : v2),
        type: 'alto', breath: 0.18, jitter: 0.03, rough: 0.3, shimmer: 0.15,
        env: (t) => clamp(t / 0.012, 0, 1) * Math.exp(-t / (dur * 0.45)),
      });
      mix(b, burst(sr, r, 0.08, { bp: 1500, q: 0.7, env: { a: 0.002, d: 0.02 } }), 0.15);
      return done(b, sr, 6500);
    },
  },
  vesna_effort: {
    variants: 6, gain: 0.45, ref: 2, max: 25, pitchVar: 0.04, verb: 0.05, poly: 1, cool: 0.2,
    bake: (sr, r) => {
      const dur = 0.22 + r() * 0.1;
      const f0 = 200 + r() * 30, v = r.pick(['a', 'e', 'a']);
      const b = vocal(sr, r, dur, {
        f0: (t) => f0 * (1 - 0.15 * t / dur), vowel: () => v, type: 'alto', breath: 0.55, jitter: 0.03, rough: 0.2,
        env: (t) => clamp(t / 0.01, 0, 1) * Math.exp(-t / (dur * 0.4)),
      });
      return done(b, sr, 6500);
    },
  },
  vesna_death: {
    variants: 2, heavy: true, gain: 0.4, ref: 2, max: 25, pitchVar: 0.02, verb: 0.1, poly: 1,
    bake: (sr, r) => {
      const dur = 1.3;
      const fc = curve([[0, 250], [0.15, 235], [0.9, 150], [1.3, 120]]);
      const b = vocal(sr, r, dur, {
        f0: fc, vowel: (t) => (t < 0.3 ? 'a' : t < 0.8 ? 'o' : 'u'), type: 'alto', breath: 0.3, jitter: 0.035, rough: 0.35,
        env: (t) => clamp(t / 0.02, 0, 1) * (t < 0.4 ? 1 : Math.exp(-(t - 0.4) / 0.35)),
      });
      return done(b, sr, 6500);
    },
  },
};
