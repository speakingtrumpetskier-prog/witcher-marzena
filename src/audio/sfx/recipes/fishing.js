// Fishing recipes: the reel's clicks, the jig going into the water, the soft tick of a nibble, the whip of a strike, the
// line singing and snapping, the line dragged over the edge of the hole, a splash, a fish landed and flopping on the ice,
// ice chips from cutting a hole, and the roast (a loop). Names are listed in sfxNames.js under `fishing`.
import { burst, grains, thump, resonate, whoosh, ring, chirp, creak, mix, fade, len, hp1, Biquad, curve, white, pink, clamp } from '../kit.js';
import { makeLoop, normalize, crackle } from '../../dsp.js';

const done = (b, sr, lp = 9000) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 40); return fade(b, sr, 0.0005, 0.02); };

export const FISHING = {
  // The ratchet of the reel: a short run of clicks, three or four, evenly spaced.
  reel_click: {
    variants: 4, rate: 32000, gain: 0.42, ref: 1.6, max: 18, pitchVar: 0.05, verb: 0.05, poly: 3,
    bake: (sr, r) => {
      const dur = 0.2, b = new Float32Array(len(sr, dur));
      const n = 2 + r.int(0, 1);
      for (let k = 0; k < n; k++) {
        const t = k * (0.055 + r() * 0.012);
        const c = burst(sr, r, 0.008, { hp: 1800, env: { a: 0.0002, d: 0.0014 } });
        mix(b, resonate(c, sr, [[2600 + r() * 500, 14, 1], [4300, 12, 0.5]]), 0.7, Math.floor(t * sr));
        mix(b, thump(sr, r, 0.04, { f: 330, fEnd: 240, decay: 0.01, click: 0, noise: 0.1, lp: 1200 }), 0.25, Math.floor(t * sr));
      }
      return done(b, sr, 9500);
    },
  },

  // The jig dropping into the water, a bubble and a little ring.
  jig_plink: {
    variants: 4, gain: 0.4, ref: 2, max: 25, pitchVar: 0.08, verb: 0.15, poly: 3,
    bake: (sr, r) => {
      const dur = 0.5, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.12, { bp: 1500, q: 0.8, env: { a: 0.002, d: 0.025 } }), 0.5);
      const f = 520 + r() * 260;
      mix(b, chirp(sr, 0.1, f, f * 2.0, { tau: 0.03, attack: 0.002, k: -1 }), 0.55, Math.floor(0.012 * sr));
      mix(b, ring(sr, r, 0.3, 2300 + r() * 500, [1, 2.4], { decay: 0.07, amps: [1, 0.3] }), 0.12, Math.floor(0.004 * sr));
      return done(b, sr, 7000);
    },
  },

  // A nibble: the faint tick of the line twitching, hardly there.
  nibble: {
    variants: 5, gain: 0.28, ref: 1.4, max: 14, pitchVar: 0.1, verb: 0.04, poly: 2,
    bake: (sr, r) => {
      const dur = 0.16, b = new Float32Array(len(sr, dur));
      const c = burst(sr, r, 0.01, { hp: 1000, lp: 5000, env: { a: 0.0003, d: 0.002 } });
      mix(b, resonate(c, sr, [[1700 + r() * 600, 18, 1], [3300, 14, 0.4]]), 0.9);
      mix(b, thump(sr, r, 0.06, { f: 260, fEnd: 190, decay: 0.012, click: 0, noise: 0.2, lp: 900 }), 0.25, Math.floor(0.004 * sr));
      return done(b, sr, 7500);
    },
  },

  // Setting the hook: a whip of the rod and a high zip of line.
  strike_whip: {
    variants: 3, gain: 0.5, ref: 2.2, max: 28, pitchVar: 0.05, verb: 0.1, poly: 2,
    bake: (sr, r) => {
      const dur = 0.5, b = new Float32Array(len(sr, dur));
      mix(b, whoosh(sr, r, 0.28, { f0: 600, f1: 3400, q: 1.6, peak: 0.45, color: 'white' }), 0.7);
      mix(b, ring(sr, r, 0.28, 3100 + r() * 400, [1, 1.5], { decay: 0.08, amps: [1, 0.25] }), 0.2, Math.floor(0.06 * sr));
      mix(b, thump(sr, r, 0.12, { f: 190, fEnd: 120, decay: 0.02, click: 0.1, noise: 0.5, lp: 900 }), 0.3, Math.floor(0.1 * sr));
      return done(b, sr, 9000);
    },
  },

  // A small splash: a fish at the surface, the hook set, the jig pulled out.
  splash_small: {
    variants: 4, gain: 0.5, ref: 3, max: 40, pitchVar: 0.08, verb: 0.2, poly: 3,
    bake: (sr, r) => {
      const dur = 0.8, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.5, { bp: 1700, q: 0.6, env: { a: 0.003, d: 0.11 } }), 0.8);
      mix(b, thump(sr, r, 0.3, { f: 100, fEnd: 55, decay: 0.07, click: 0.05, noise: 0.8, lp: 400 }), 0.55);
      for (let k = 0; k < 7; k++) {
        const f = 500 + r() * 900;
        mix(b, chirp(sr, 0.06, f, f * 1.7, { tau: 0.015, attack: 0.002, k: -1 }), 0.16 * (1 - k / 9), Math.floor((0.04 + r() * 0.5) * sr));
      }
      return done(b, sr, 7500);
    },
  },

  // The line parting under tension: a twang and the recoil.
  line_snap: {
    variants: 3, rate: 32000, gain: 0.6, ref: 3, max: 40, pitchVar: 0.04, verb: 0.15, poly: 1,
    bake: (sr, r) => {
      const dur = 0.9, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.012, { hp: 1500, env: { a: 0.0002, d: 0.002 } }), 0.8);
      const f = 1500 + r() * 400;
      mix(b, chirp(sr, 0.5, f * 1.6, f, { tau: 0.16, attack: 0.001, k: 0.7 }), 0.45);
      mix(b, ring(sr, r, 0.6, f * 1.4, [1, 2.02, 3.1], { decay: 0.16, amps: [1, 0.35, 0.15] }), 0.18);
      mix(b, whoosh(sr, r, 0.25, { f0: 1200, f1: 4500, q: 1.4, peak: 0.3, color: 'white' }), 0.4, Math.floor(0.015 * sr));
      return done(b, sr, 10000);
    },
  },

  // The line over the sharp edge of the hole: a thin, rising scrape.
  ice_scrape: {
    variants: 3, gain: 0.45, ref: 2.4, max: 28, pitchVar: 0.08, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 1.1 + r() * 0.3, b = new Float32Array(len(sr, dur));
      const rc = curve([[0, 70], [dur * 0.5, 150 + r() * 40], [dur, 90]]);
      mix(b, creak(sr, r, dur, { rate: rc, modes: [[1400 + r() * 300, 14, 1], [2600, 16, 0.6], [4100, 18, 0.3]], jitter: 0.3, env: (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) ** 0.8 }), 0.6);
      mix(b, burst(sr, r, dur, { color: 'pink', bp: 3600, q: 1.2, env: [[0, 0], [dur * 0.3, 0.6], [dur, 0]] }), 0.25);
      return done(b, sr, 8500);
    },
  },

  // A fish landed on the ice, slid out of the hole and thrown down: wet slap, thump, droplets.
  fish_land: {
    variants: 3, gain: 0.6, ref: 3, max: 40, pitchVar: 0.06, verb: 0.1, poly: 2,
    bake: (sr, r) => {
      const dur = 1.0, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.35, { color: 'pink', bp: 1300, q: 0.7, env: [[0, 0], [0.04, 1], [0.35, 0]] }), 0.6);
      mix(b, thump(sr, r, 0.35, { f: 130, fEnd: 70, decay: 0.06, click: 0.1, noise: 0.9, lp: 700 }), 0.8, Math.floor(0.12 * sr));
      mix(b, grains(sr, r, 0.5, { count: 60, bands: [[2400, 2], [4200, 2.5]], decay: 0.0009, spread: 0.7 }), 0.25, Math.floor(0.12 * sr));
      return done(b, sr, 7000);
    },
  },

  // Flopping on the ice: wet slaps that come further apart and weaker.
  fish_flop: {
    variants: 4, gain: 0.55, ref: 3, max: 40, pitchVar: 0.08, verb: 0.08, poly: 2,
    bake: (sr, r) => {
      const dur = 2.0, b = new Float32Array(len(sr, dur));
      let t = 0.02, a = 1;
      for (let k = 0; k < 6; k++) {
        mix(b, thump(sr, r, 0.18, { f: 150 + r() * 40, fEnd: 90, decay: 0.03, click: 0.05, noise: 1.0, lp: 1100 }), 0.8 * a, Math.floor(t * sr));
        mix(b, burst(sr, r, 0.12, { color: 'pink', bp: 1900, q: 0.8, env: [[0, 0], [0.01, 1], [0.12, 0]] }), 0.4 * a, Math.floor(t * sr));
        t += (0.1 + k * 0.07) * (0.8 + r() * 0.5);
        a *= 0.78;
      }
      return done(b, sr, 6500);
    },
  },

  // Cutting a hole: the blade into the ice, chips flying.
  hole_chip: {
    variants: 5, gain: 0.62, ref: 4, max: 60, pitchVar: 0.06, verb: 0.25, poly: 2,
    bake: (sr, r) => {
      const dur = 0.7, b = new Float32Array(len(sr, dur));
      mix(b, burst(sr, r, 0.012, { hp: 500, env: { a: 0.0002, d: 0.0018 } }), 0.8);
      mix(b, thump(sr, r, 0.4, { f: 110, fEnd: 55, decay: 0.08, click: 0.2, noise: 0.7, lp: 450 }), 0.8);
      mix(b, resonate(burst(sr, r, 0.008, { hp: 900, env: { a: 0.0002, d: 0.0012 } }), sr, [[1900 + r() * 400, 10, 1], [3300, 12, 0.5]]), 0.5, Math.floor(0.005 * sr));
      mix(b, grains(sr, r, 0.5, { count: 120, bands: [[2200, 2], [3800, 2.4], [5200, 2.8]], decay: 0.0007, spread: 0.6 }), 0.5, Math.floor(0.02 * sr));
      return done(b, sr, 8500);
    },
  },
};

const loopOf = (b, sr, x = 0.4) => makeLoop(b, sr, x);
export const FISHING_LOOPS = {
  // Fat in a fire: a dense fine crackle and a bright hiss, with a pop now and then.
  sizzle: {
    gain: 0.5, rate: 24000, ref: 1.8, max: 16, verb: 0.05, bake: (sr, r) => {
      const dur = 5, n = len(sr, dur);
      const c = crackle(sr, n, r, { rate: 150, decay: 0.0005, amp: 0.9, ampVar: 0.9 });
      new Biquad(sr, 'highpass', 1800, 0.7).run(c);
      new Biquad(sr, 'lowpass', 7500, 0.7).run(c);
      const hiss = pink(n, r);
      new Biquad(sr, 'bandpass', 4600, 0.7).run(hiss);
      mix(c, hiss, 0.45);
      const pops = crackle(sr, n, r, { rate: 2.5, decay: 0.004, amp: 1 });
      new Biquad(sr, 'bandpass', 800, 1).run(pops);
      mix(c, pops, 1.1);
      return loopOf(normalize(c, 0.8), sr);
    },
  },
  // The line running out: a thin bright hiss that wavers.
  line_hiss: {
    gain: 0.4, rate: 24000, ref: 2, max: 22, verb: 0.08, bake: (sr, r) => {
      const dur = 2.4, n = len(sr, dur);
      const b = white(n, r);
      new Biquad(sr, 'highpass', 3200, 0.7).run(b);
      new Biquad(sr, 'bandpass', 5600, 0.9).run(b);
      for (let i = 0; i < n; i++) b[i] *= 0.65 + 0.35 * Math.sin((i / sr) * 6.283 * 7.3 + Math.sin((i / sr) * 6.283 * 1.7) * 2);
      const z = pink(n, r);
      new Biquad(sr, 'bandpass', 1300, 3).run(z);
      mix(b, z, 0.12);
      return loopOf(normalize(b, 0.7), sr, 0.3);
    },
  },
};
