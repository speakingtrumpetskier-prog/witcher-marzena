// Foley recipes: footsteps per surface, hooves per gait, doors, pages, coins, pickups, potion,
// snowballs, splashes, heartbeat, the forge hammer, axe chops and the UI.
// Each recipe: { variants, gain, ref, max, pitchVar, verb, poly, bake(sr, r, i) }.
import { burst, grains, thump, resonate, whoosh, ring, chirp, creak, fire, vocal, mix, fade, len, hp1, Biquad, envAD, curve } from '../kit.js';
import { pluck } from '../../dsp.js';

const done = (b, sr, lp = 9000) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 40); return fade(b, sr, 0.0005, 0.02); };

function snowStep(sr, r, i, { heavy = 1, dur = 0.34 } = {}) {
  const n = len(sr, dur);
  const b = new Float32Array(n);
  // Heel then toe: two clusters of crunch.
  const heel = grains(sr, r, dur, { count: Math.floor(60 * heavy + r() * 40), bands: [[1400 + r() * 300, 2.2], [2600 + r() * 500, 2.8], [4200, 3]], decay: 0.0009, spread: 1.3, squeak: r() < 0.5 ? 0.6 + r() * 0.6 : 0 });
  const toe = grains(sr, r, dur * 0.7, { count: Math.floor(30 * heavy), bands: [[1800, 2.4], [3200, 2.8]], decay: 0.0008, spread: 1.2 });
  mix(b, heel, 0.55);
  mix(b, toe, 0.35, Math.floor((0.07 + r() * 0.04) * sr));
  mix(b, thump(sr, r, dur, { f: 95 + r() * 20, fEnd: 50, decay: 0.035, click: 0.05, noise: 0.7, lp: 330 }), 0.75 * heavy);
  return done(b, sr, 7000);
}

export const FOLEY = {
  step_snow: { variants: 8, gain: 0.5, ref: 2, max: 40, pitchVar: 0.06, verb: 0.05, poly: 6, bake: (sr, r, i) => snowStep(sr, r, i) },
  step_ice: {
    variants: 7, gain: 0.5, ref: 2, max: 40, pitchVar: 0.05, verb: 0.08, poly: 6,
    bake: (sr, r) => {
      const dur = 0.3, b = new Float32Array(len(sr, dur));
      const click = burst(sr, r, 0.012, { hp: 1200, env: { a: 0.0003, d: 0.0015 } });
      const hollow = resonate(click, sr, [[520 + r() * 300, 12, 1], [1150 + r() * 500, 15, 0.55], [190 + r() * 60, 6, 0.9]]);
      mix(b, hollow, 1.6);
      mix(b, thump(sr, r, dur, { f: 150, fEnd: 115, decay: 0.03, click: 0, noise: 0.25, lp: 500 }), 0.5);
      mix(b, grains(sr, r, 0.12, { count: 14, bands: [[2600, 2], [4000, 2.5]], decay: 0.0006 }), 0.25);
      return done(b, sr, 8000);
    },
  },
  step_wood: {
    variants: 6, gain: 0.5, ref: 2, max: 40, pitchVar: 0.05, verb: 0.08, poly: 6,
    bake: (sr, r, i) => {
      const dur = 0.35, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 115 + r() * 20, fEnd: 70, decay: 0.055, click: 0.15, noise: 0.5, lp: 500 }), 0.8);
      const k = burst(sr, r, 0.01, { lp: 3000, env: { a: 0.0003, d: 0.002 } });
      mix(b, resonate(k, sr, [[220 + r() * 40, 7, 1], [510 + r() * 60, 9, 0.6], [1050 + r() * 150, 10, 0.3]]), 1.4);
      if (i % 3 === 0) mix(b, creak(sr, r, 0.16, { rate: (t) => 90 - t * 250, modes: [[620, 15, 0.5], [1450, 18, 0.2]], env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.16)) }), 0.3, Math.floor(0.05 * sr));
      return done(b, sr, 7000);
    },
  },
  step_road: {
    variants: 6, gain: 0.48, ref: 2, max: 40, pitchVar: 0.06, verb: 0.05, poly: 6,
    bake: (sr, r) => {
      const dur = 0.3, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 90, fEnd: 50, decay: 0.04, click: 0.1, noise: 0.9, lp: 450 }), 0.8);
      mix(b, grains(sr, r, dur, { count: 30, bands: [[1100, 1.5], [2100, 2]], decay: 0.0016 }), 0.35);
      return done(b, sr, 5000);
    },
  },
  hoof_walk: {
    variants: 6, gain: 0.55, ref: 3, max: 50, pitchVar: 0.05, verb: 0.06, poly: 8,
    bake: (sr, r) => {
      const dur = 0.35, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 125, fEnd: 70, decay: 0.04, click: 0.3, noise: 0.6, lp: 450 }), 0.8);
      const c = burst(sr, r, 0.01, { lp: 4000, env: { a: 0.0002, d: 0.0015 } });
      mix(b, resonate(c, sr, [[760 + r() * 160, 8, 0.6], [1700 + r() * 200, 10, 0.3]]), 1.2);
      mix(b, grains(sr, r, dur, { count: 50, bands: [[1500, 2], [2800, 2.5]], decay: 0.001, spread: 1.4 }), 0.35);
      return done(b, sr, 7000);
    },
  },
  hoof_trot: {
    variants: 6, gain: 0.6, ref: 3, max: 50, pitchVar: 0.05, verb: 0.06, poly: 8,
    bake: (sr, r) => {
      const dur = 0.35, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 115, fEnd: 60, decay: 0.05, click: 0.35, noise: 0.8, lp: 500 }), 0.9);
      const c = burst(sr, r, 0.01, { lp: 4000, env: { a: 0.0002, d: 0.0015 } });
      mix(b, resonate(c, sr, [[700 + r() * 160, 8, 0.7], [1600 + r() * 200, 10, 0.3]]), 1.3);
      mix(b, grains(sr, r, dur, { count: 80, bands: [[1500, 2], [2800, 2.5]], decay: 0.001, spread: 1.2 }), 0.4);
      return done(b, sr, 7000);
    },
  },
  hoof_gallop: {
    variants: 6, gain: 0.7, ref: 3.5, max: 60, pitchVar: 0.05, verb: 0.06, poly: 8,
    bake: (sr, r) => {
      const dur = 0.45, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 100, fEnd: 48, decay: 0.065, click: 0.3, noise: 1.1, lp: 500 }), 1);
      mix(b, grains(sr, r, dur, { count: 140, bands: [[1300, 2], [2500, 2.2], [3800, 2.6]], decay: 0.0011, spread: 0.8 }), 0.45);
      return done(b, sr, 7000);
    },
  },
  door: {
    variants: 3, gain: 0.6, ref: 3, max: 45, pitchVar: 0.06, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 1.2, b = new Float32Array(len(sr, dur));
      mix(b, ring(sr, r, 0.15, 2100 + r() * 300, [1, 2.7, 4.1], { decay: 0.035 }), 0.35);
      const rc = curve([[0, 30], [0.25, 85 + r() * 30], [0.55, 45], [0.85, 70], [1, 35]]);
      const cr = creak(sr, r, 0.9, { rate: (t) => rc(t / 0.9) * (1 + 0.1 * Math.sin(t * 40)), modes: [[400 + r() * 60, 12, 1], [980 + r() * 120, 14, 0.5], [1900, 16, 0.22]], env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 0.7 });
      mix(b, cr, 0.6, Math.floor(0.08 * sr));
      return done(b, sr, 7000);
    },
  },
  door_close: {
    variants: 3, gain: 0.7, ref: 3, max: 50, pitchVar: 0.05, verb: 0.25, poly: 2,
    bake: (sr, r) => {
      const dur = 0.8, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 95, fEnd: 58, decay: 0.09, click: 0.2, noise: 1.2, lp: 650 }), 1);
      mix(b, ring(sr, r, 0.3, 1750 + r() * 200, [1, 2.3, 3.9], { decay: 0.05 }), 0.3, Math.floor(0.012 * sr));
      mix(b, grains(sr, r, 0.3, { count: 20, bands: [[900, 4], [1600, 5]], decay: 0.003 }), 0.25, Math.floor(0.03 * sr));
      return done(b, sr, 6000);
    },
  },
  page_turn: {
    variants: 4, gain: 0.45, ref: 1.5, max: 10, pitchVar: 0.08, verb: 0.05, poly: 2,
    bake: (sr, r) => {
      const dur = 0.45, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, dur, { color: 'pink', q: 0.9, sweep: (t) => 1400 + 5000 * (t / dur), env: [[0, 0], [0.08, 0.5], [0.22, 1], [0.38, 0.3], [0.45, 0]] }), 0.8);
      mix(b, grains(sr, r, dur, { count: 45, bands: [[2800, 1.4], [4500, 1.8]], decay: 0.0006, spread: 0.6, env: (t) => Math.sin(Math.PI * Math.min(1, t / dur)) }), 0.35);
      return done(b, sr, 8000);
    },
  },
  coin: {
    variants: 4, gain: 0.45, ref: 1.5, max: 12, pitchVar: 0.04, verb: 0.1, poly: 3,
    bake: (sr, r) => {
      const dur = 0.7, b = new Float32Array(len(sr, dur));
      const n = r.int(2, 3);
      for (let k = 0; k < n; k++) {
        const t = k === 0 ? 0 : 0.08 * k + r() * 0.05;
        mix(b, ring(sr, r, 0.4, 2400 + r() * 900, [1, 1.47, 2.09, 2.56], { decay: 0.18, amps: [1, 0.6, 0.35, 0.2] }), 0.5 * (1 - k * 0.25), Math.floor(t * sr));
      }
      mix(b, thump(sr, r, 0.1, { f: 400, fEnd: 250, decay: 0.01, click: 0.2, noise: 0.2 }), 0.2);
      return done(b, sr, 9000);
    },
  },
  item_pickup: {
    variants: 3, gain: 0.45, ref: 1.5, max: 12, pitchVar: 0.06, verb: 0.05, poly: 2,
    bake: (sr, r) => {
      const dur = 0.35, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.28, { color: 'pink', q: 0.8, sweep: (t) => 700 + 2200 * t / 0.28, env: [[0, 0], [0.05, 1], [0.28, 0]] }), 0.7);
      mix(b, thump(sr, r, dur, { f: 160, fEnd: 110, decay: 0.025, click: 0.1, noise: 0.5, lp: 700 }), 0.5, Math.floor(0.2 * sr));
      return done(b, sr, 7000);
    },
  },
  potion_drink: {
    variants: 2, gain: 0.55, ref: 1.5, max: 10, pitchVar: 0.03, verb: 0.05, poly: 1,
    bake: (sr, r) => {
      const dur = 2.1, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, 0.15, { f: 520, fEnd: 260, decay: 0.012, click: 0.4, noise: 0.3, lp: 2000 }), 0.6);
      for (let k = 0; k < 3; k++) {
        const t = 0.4 + k * (0.36 + r() * 0.06);
        const g = chirp(sr, 0.12, 220 + r() * 40, 420 + r() * 80, { tau: 0.04, attack: 0.006, k: -1 });
        new Biquad(sr, 'bandpass', 420, 1.2).run(g);
        mix(b, g, 1.2, Math.floor(t * sr));
        mix(b, thump(sr, r, 0.15, { f: 140, fEnd: 100, decay: 0.03, click: 0, noise: 0.4, lp: 400 }), 0.4, Math.floor((t + 0.02) * sr));
      }
      const ex = vocal(sr, r, 0.55, { f0: 180, vowel: () => 'a', breath: 0.9, jitter: 0.02, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.55)) * 0.6 });
      mix(b, ex, 0.5, Math.floor(1.45 * sr));
      return done(b, sr, 7000);
    },
  },
  snowball_hit: {
    variants: 4, gain: 0.6, ref: 2.5, max: 30, pitchVar: 0.08, verb: 0.05, poly: 3,
    bake: (sr, r) => {
      const dur = 0.4, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.25, { color: 'pink', lp: 2400, env: { a: 0.001, d: 0.05 } }), 0.8);
      mix(b, grains(sr, r, dur, { count: 70, bands: [[1200, 1.5], [2500, 2]], decay: 0.002, spread: 1.4 }), 0.5);
      mix(b, thump(sr, r, dur, { f: 130, fEnd: 70, decay: 0.03, click: 0, noise: 0.5 }), 0.5);
      return done(b, sr, 7000);
    },
  },
  splash: {
    variants: 3, gain: 0.65, ref: 4, max: 60, pitchVar: 0.06, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 1.3, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 1.0, { bp: 1400, q: 0.6, env: { a: 0.004, d: 0.22 } }), 0.9);
      mix(b, thump(sr, r, 0.6, { f: 75, fEnd: 45, decay: 0.14, click: 0.1, noise: 0.8, lp: 300 }), 0.8);
      for (let k = 0; k < 14; k++) {
        const f = 350 + r() * 900;
        const bub = chirp(sr, 0.08, f, f * 1.7, { tau: 0.02, attack: 0.002, k: -1 });
        mix(b, bub, 0.18 * (1 - k / 16), Math.floor((0.08 + r() * 0.9) * sr));
      }
      return done(b, sr, 7000);
    },
  },
  heartbeat: {
    variants: 2, gain: 0.8, ref: 2, max: 8, pitchVar: 0.02, verb: 0, poly: 2,
    bake: (sr, r) => {
      const dur = 0.8, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, 0.4, { f: 58, fEnd: 40, decay: 0.07, click: 0, noise: 0.15, lp: 200 }), 1);
      mix(b, thump(sr, r, 0.4, { f: 50, fEnd: 36, decay: 0.06, click: 0, noise: 0.15, lp: 200 }), 0.7, Math.floor(0.29 * sr));
      return done(b, sr, 1200);
    },
  },
  forge_hammer: {
    variants: 5, gain: 0.55, ref: 5, max: 110, pitchVar: 0.03, verb: 0.2, poly: 3,
    bake: (sr, r, i) => {
      const anvil = i % 3 === 2;
      const dur = anvil ? 1.1 : 0.6, b = new Float32Array(len(sr, dur));
      mix(b, ring(sr, r, dur, 980 + r() * 160, [1, 2.31, 3.9, 5.3, 6.8], { decay: anvil ? 0.6 : 0.16, amps: [1, 0.6, 0.4, 0.22, 0.1] }), anvil ? 0.6 : 0.5);
      mix(b, thump(sr, r, 0.3, { f: 190, fEnd: 120, decay: 0.02, click: 0.5, noise: 0.6, lp: 1200 }), 0.7);
      return done(b, sr, 8500);
    },
  },
  axe_chop: {
    variants: 4, gain: 0.6, ref: 4, max: 80, pitchVar: 0.05, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 0.5, b = new Float32Array(len(sr, dur));
      mix(b, thump(sr, r, dur, { f: 150, fEnd: 85, decay: 0.05, click: 0.5, noise: 0.8, lp: 900 }), 0.8);
      const k = burst(sr, r, 0.03, { lp: 4000, env: { a: 0.0003, d: 0.004 } });
      mix(b, resonate(k, sr, [[310 + r() * 40, 5, 1], [820, 7, 0.5], [1800, 9, 0.25]]), 1.2);
      mix(b, grains(sr, r, 0.25, { count: 30, bands: [[2400, 2], [3600, 2]], decay: 0.0008 }), 0.25, Math.floor(0.01 * sr));
      return done(b, sr, 7000);
    },
  },
  ignite: {
    variants: 2, gain: 0.55, ref: 3, max: 40, pitchVar: 0.05, verb: 0.15, poly: 2,
    bake: (sr, r) => {
      const dur = 1.4, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.7, { f0: 180, f1: 1100, q: 0.7, peak: 0.25 }), 0.9);
      const f = fire(sr, r, 1.2, { roar: 0.6, crackles: 30, pops: 3 });
      envAD(f, sr, 0.15, 0.35);
      mix(b, f, 0.7, Math.floor(0.15 * sr));
      return done(b, sr, 7000);
    },
  },
  ui_hover: {
    variants: 2, gain: 0.25, verb: 0, poly: 2, pitchVar: 0.01, ui: true,
    bake: (sr, r) => {
      const b = ring(sr, r, 0.1, 1650, [1, 2.4], { decay: 0.02, amps: [1, 0.3] });
      mix(b, burst(sr, r, 0.01, { lp: 3000, env: { a: 0.0003, d: 0.002 } }), 0.3);
      return done(b, sr, 6000);
    },
  },
  ui_select: {
    variants: 2, gain: 0.4, verb: 0.05, poly: 2, pitchVar: 0, ui: true,
    bake: (sr, r) => {
      const b = new Float32Array(len(sr, 0.9));
      mix(b, pluck(sr, 587.33, 0.8, r, { t60: 0.7, bright: 0.45, hardness: 0.5 }), 0.5);
      mix(b, pluck(sr, 880, 0.8, r, { t60: 0.6, bright: 0.4, hardness: 0.4 }), 0.3, Math.floor(0.05 * sr));
      mix(b, burst(sr, r, 0.01, { lp: 2500, env: { a: 0.0003, d: 0.002 } }), 0.4);
      return done(b, sr, 6000);
    },
  },
  ui_open: {
    variants: 1, gain: 0.45, verb: 0.08, poly: 1, pitchVar: 0, ui: true,
    bake: (sr, r) => {
      const b = new Float32Array(len(sr, 1.2));
      mix(b, burst(sr, r, 0.4, { color: 'pink', q: 0.8, sweep: (t) => 500 + 3000 * t / 0.4, env: [[0, 0], [0.12, 1], [0.4, 0]] }), 0.6);
      mix(b, pluck(sr, 146.83, 1.1, r, { t60: 1, bright: 0.4, hardness: 0.4 }), 0.6, Math.floor(0.06 * sr));
      mix(b, pluck(sr, 220, 1.0, r, { t60: 0.9, bright: 0.4, hardness: 0.4 }), 0.35, Math.floor(0.1 * sr));
      return done(b, sr, 6000);
    },
  },
  ui_close: {
    variants: 1, gain: 0.4, verb: 0.08, poly: 1, pitchVar: 0, ui: true,
    bake: (sr, r) => {
      const b = new Float32Array(len(sr, 1.0));
      mix(b, burst(sr, r, 0.35, { color: 'pink', q: 0.8, sweep: (t) => 3000 - 2500 * t / 0.35, env: [[0, 0], [0.1, 1], [0.35, 0]] }), 0.55);
      mix(b, pluck(sr, 110, 0.9, r, { t60: 0.8, bright: 0.35, hardness: 0.35 }), 0.6, Math.floor(0.08 * sr));
      return done(b, sr, 6000);
    },
  },
};
