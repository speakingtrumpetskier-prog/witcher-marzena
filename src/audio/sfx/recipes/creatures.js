// Creature and people recipes: wolves, the horse and Vesna's whistle, dogs, crows and ravens,
// chickens, goats, a child's laugh, the owl, and small winter birds. All vocalizations are a
// glottal source through moving formants (kit.vocal) with animal-shaped pitch contours.
import { burst, thump, ring, chirp, vocal, mix, fade, len, hp1, Biquad, shape, osc, curve, clamp, white, lp1 } from '../kit.js';

const done = (b, sr, lp = 9000) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 50); return fade(b, sr, 0.001, 0.03); };
const F = (...fs) => fs.map(([f, bw, db]) => [f, bw, Math.pow(10, db / 20)]);

// Canine mouth shapes (wolf, dog): longer vocal tract than ours, nasal.
const MUZZLE = {
  u: F([420, 90, 0], [900, 120, -14], [2100, 200, -26], [3200, 250, -34], [4200, 300, -44]),
  o: F([560, 100, 0], [1050, 130, -10], [2300, 200, -22], [3300, 250, -30], [4300, 300, -40]),
  a: F([720, 120, 0], [1300, 150, -8], [2500, 220, -18], [3400, 250, -26], [4400, 300, -36]),
  r: F([300, 120, 0], [800, 160, -8], [1700, 220, -14], [2900, 260, -22], [4000, 300, -30]),
};
const lerpF = (a, b, t) => a.map((x, i) => x.map((v, k) => v + (b[i][k] - v) * t));

export const CREATURES = {
  wolf_howl: {
    variants: 3, heavy: true, gain: 0.32, ref: 25, max: 900, pitchVar: 0.05, verb: 0.5, poly: 3,
    bake: (sr, r) => {
      const dur = 2.6 + r() * 1.0;
      const lo = 360 + r() * 60, hi = 500 + r() * 80;
      const fc = curve([[0, lo], [0.55, hi], [dur * 0.75, hi * 0.97], [dur, lo * 0.8]]);
      const b = vocal(sr, r, dur, {
        f0: (t) => fc(t) * (1 + 0.012 * Math.sin(t * 6.283 * 5.2) * clamp((t - 0.6) / 0.5, 0, 1)),
        vowel: (t) => lerpF(MUZZLE.u, MUZZLE.o, Math.sin(Math.PI * clamp(t / dur, 0, 1))),
        breath: 0.06, jitter: 0.004, shimmer: 0.04, open: 0.7,
        env: (t) => clamp(t / 0.25, 0, 1) * clamp((dur - t) / 0.5, 0, 1),
      });
      // Howls are nearly pure: reinforce the fundamental.
      const s = osc(sr, b.length, (t) => fc(t), 'sine');
      shape(s, sr, (t) => clamp(t / 0.25, 0, 1) * clamp((dur - t) / 0.5, 0, 1));
      mix(b, s, 0.35);
      return done(b, sr, 6000);
    },
  },
  wolf_growl: {
    variants: 4, heavy: true, gain: 0.65, ref: 4, max: 60, pitchVar: 0.06, verb: 0.1, poly: 3,
    bake: (sr, r) => {
      const dur = 1.1 + r() * 0.6;
      const f0 = 75 + r() * 20, wob = 1.6 + r() * 1.2;
      const b = vocal(sr, r, dur, {
        f0: (t) => f0 * (1 + 0.15 * Math.sin(t * 6.283 * wob)), vowel: (t) => lerpF(MUZZLE.r, MUZZLE.o, 0.5 + 0.5 * Math.sin(t * 3)),
        breath: 0.35, jitter: 0.09, shimmer: 0.4, rough: 0.6,
        env: (t) => clamp(t / 0.15, 0, 1) * clamp((dur - t) / 0.2, 0, 1) * (0.65 + 0.35 * Math.sin(t * 6.283 * 27)),
      });
      return done(b, sr, 5000);
    },
  },
  wolf_bite: {
    variants: 4, gain: 0.65, ref: 3, max: 40, pitchVar: 0.06, verb: 0.08, poly: 3,
    bake: (sr, r) => {
      const dur = 0.5, b = new Float32Array(len(sr, dur));
      const snarl = vocal(sr, r, 0.3, {
        f0: (t) => 160 - t * 150, vowel: () => MUZZLE.a, breath: 0.4, jitter: 0.08, rough: 0.6,
        env: (t) => clamp(t / 0.02, 0, 1) * Math.exp(-t / 0.1),
      });
      mix(b, snarl, 0.8);
      mix(b, ring(sr, r, 0.1, 2500 + r() * 400, [1, 1.8], { decay: 0.02 }), 0.5, Math.floor(0.12 * sr));
      mix(b, ring(sr, r, 0.1, 2200 + r() * 400, [1, 1.7], { decay: 0.015 }), 0.35, Math.floor(0.15 * sr));
      mix(b, thump(sr, r, 0.2, { f: 140, fEnd: 90, decay: 0.03, click: 0.3, noise: 0.5 }), 0.5, Math.floor(0.12 * sr));
      return done(b, sr, 7000);
    },
  },
  wolf_yelp: {
    variants: 4, gain: 0.55, ref: 5, max: 90, pitchVar: 0.06, verb: 0.15, poly: 3,
    bake: (sr, r) => {
      const dur = 0.32 + r() * 0.12;
      const pk = 1000 + r() * 250;
      const fc = curve([[0, 650], [0.05, pk], [dur, 520]]);
      const b = vocal(sr, r, dur, {
        f0: fc, vowel: (t) => lerpF(MUZZLE.a, MUZZLE.u, t / dur), breath: 0.12, jitter: 0.02, rough: 0.1,
        env: (t) => clamp(t / 0.01, 0, 1) * Math.exp(-t / (dur * 0.5)),
      });
      return done(b, sr, 7000);
    },
  },
  horse_whinny: {
    variants: 3, heavy: true, gain: 0.36, ref: 8, max: 150, pitchVar: 0.04, verb: 0.2, poly: 1,
    bake: (sr, r) => {
      const dur = 1.7, b = new Float32Array(len(sr, dur));
      const top = 1050 + r() * 150;
      const base = curve([[0, 550], [0.12, top], [1.15, 520], [1.35, 380]]);
      const trillHz = 10 + r() * 2;
      const wh = vocal(sr, r, 1.35, {
        f0: (t) => base(t) * (1 + 0.11 * Math.sin(t * 6.283 * trillHz) * clamp((t - 0.15) / 0.2, 0, 1)),
        vowel: () => F([800, 150, 0], [1600, 180, -6], [2600, 250, -14], [3500, 300, -22], [4500, 300, -30]),
        breath: 0.25, jitter: 0.02, rough: 0.15, shimmer: 0.2,
        env: (t) => clamp(t / 0.06, 0, 1) * clamp((1.35 - t) / 0.3, 0, 1),
      });
      mix(b, wh, 0.9);
      // A low nicker at the end.
      for (let k = 0; k < 3; k++) {
        const ni = vocal(sr, r, 0.09, { f0: 170 - k * 10, vowel: () => MUZZLE.o, breath: 0.4, rough: 0.4, env: (t) => Math.sin(Math.PI * clamp(t / 0.09, 0, 1)) });
        mix(b, ni, 0.5, Math.floor((1.35 + k * 0.11) * sr));
      }
      return done(b, sr, 6500);
    },
  },
  horse_snort: {
    variants: 4, gain: 0.6, ref: 4, max: 60, pitchVar: 0.06, verb: 0.1, poly: 2,
    bake: (sr, r, i) => {
      const dur = i % 2 ? 0.75 : 0.4;
      const b = burst(sr, r, dur, { color: 'pink', bp: 850 + r() * 200, q: 0.7, env: { a: 0.015, d: dur * 0.35 } });
      const fl = 26 + r() * 10;
      shape(b, sr, (t) => 0.55 + 0.45 * Math.sign(Math.sin(t * 6.283 * fl)) * (i % 2 ? 1 : 0.6));
      mix(b, burst(sr, r, dur, { color: 'brown', lp: 300, env: { a: 0.02, d: dur * 0.3 } }), 0.8);
      return done(b, sr, 5000);
    },
  },
  whistle: {
    variants: 3, heavy: true, gain: 0.17, ref: 3, max: 40, pitchVar: 0.03, verb: 0.15, poly: 1,
    bake: (sr, r, i) => {
      const two = i === 1;
      const pts = two ? [[0, 1300], [0.18, 2050], [0.28, 2050], [0.36, 1350], [0.5, 2050], [0.62, 2100], [0.8, 1500]] : [[0, 1250], [0.25, 2100], [0.4, 2150], [0.75, 1450], [0.85, 1400]];
      const dur = pts[pts.length - 1][0] + 0.05;
      const fc = curve(pts);
      const s = osc(sr, len(sr, dur), (t) => fc(t) * (1 + 0.006 * Math.sin(t * 6.283 * 6)), 'sine');
      const env = curve(two ? [[0, 0], [0.04, 1], [0.3, 0.9], [0.34, 0.2], [0.38, 0.9], [0.75, 0.8], [0.85, 0]] : [[0, 0], [0.05, 1], [0.6, 0.85], [0.9, 0]]);
      shape(s, sr, env);
      const br = white(s.length, r);
      new Biquad(sr, 'bandpass', 1800, 2).run(br);
      shape(br, sr, env);
      mix(s, br, 0.25);
      return done(s, sr, 6000);
    },
  },
  dog_bark: {
    variants: 6, heavy: true, gain: 0.55, ref: 8, max: 220, pitchVar: 0.07, verb: 0.25, poly: 3,
    bake: (sr, r, i) => {
      const dur = i % 3 === 2 ? 0.7 : 0.3, b = new Float32Array(len(sr, dur));
      const one = (f0) => vocal(sr, r, 0.22, {
        f0: (t) => f0 * (1 + 0.25 * Math.exp(-t / 0.02)) * (1 - t * 0.9), vowel: (t) => lerpF(MUZZLE.a, MUZZLE.o, t / 0.22),
        breath: 0.25, jitter: 0.04, rough: 0.45, env: (t) => clamp(t / 0.006, 0, 1) * Math.exp(-t / 0.06),
      });
      const f0 = 380 + r() * 180;
      mix(b, one(f0), 1);
      if (i % 3 === 2) mix(b, one(f0 * 0.95), 0.85, Math.floor((0.28 + r() * 0.06) * sr));
      return done(b, sr, 6000);
    },
  },
  crow: {
    variants: 5, heavy: true, gain: 0.5, ref: 10, max: 250, pitchVar: 0.05, verb: 0.3, poly: 2,
    bake: (sr, r) => {
      const n = r.int(1, 3), dur = 0.45 * n, b = new Float32Array(len(sr, dur));
      const f0 = 560 + r() * 120;
      for (let k = 0; k < n; k++) {
        const c = vocal(sr, r, 0.36, {
          f0: (t) => f0 * (1 - t * 0.35), vowel: () => F([1100, 250, 0], [1700, 300, -4], [2700, 350, -10], [3600, 400, -18], [4500, 400, -26]),
          breath: 0.35, jitter: 0.06, rough: 0.55, shimmer: 0.3, env: (t) => clamp(t / 0.02, 0, 1) * Math.exp(-t / 0.13),
        });
        mix(b, c, 1 - k * 0.1, Math.floor(k * 0.42 * sr));
      }
      return done(b, sr, 6500);
    },
  },
  raven: {
    variants: 5, heavy: true, gain: 0.5, ref: 10, max: 250, pitchVar: 0.05, verb: 0.3, poly: 2,
    bake: (sr, r, i) => {
      if (i === 4) {
        // The hollow knocking call.
        const b = new Float32Array(len(sr, 0.6));
        for (let k = 0; k < 3; k++) mix(b, ring(sr, r, 0.15, 880 + r() * 80, [1, 2.3], { decay: 0.035 }), 0.6, Math.floor(k * 0.13 * sr));
        return done(b, sr, 5000);
      }
      const n = r.int(1, 2), b = new Float32Array(len(sr, 0.5 * n));
      const f0 = 280 + r() * 50;
      for (let k = 0; k < n; k++) {
        const c = vocal(sr, r, 0.38, {
          f0: (t) => f0 * (1 - t * 0.3), vowel: () => MUZZLE.o, breath: 0.3, jitter: 0.07, rough: 0.7,
          env: (t) => clamp(t / 0.02, 0, 1) * Math.exp(-t / 0.15) * (0.7 + 0.3 * Math.sin(t * 6.283 * 34)),
        });
        mix(b, c, 1, Math.floor(k * 0.45 * sr));
      }
      return done(b, sr, 5000);
    },
  },
  chicken: {
    variants: 5, heavy: true, gain: 0.45, ref: 6, max: 120, pitchVar: 0.06, verb: 0.15, poly: 3,
    bake: (sr, r, i) => {
      const n = r.int(3, 6), b = new Float32Array(len(sr, 1.6));
      let t = 0;
      for (let k = 0; k < n; k++) {
        const f0 = 360 + r() * 80;
        const c = vocal(sr, r, 0.08, { f0: (x) => f0 * (1 + x * 2), vowel: () => 'o', type: 'alto', scale: 1.3, breath: 0.2, rough: 0.35, env: (x) => Math.sin(Math.PI * clamp(x / 0.08, 0, 1)) });
        mix(b, c, 0.8, Math.floor(t * sr));
        t += 0.12 + r() * 0.1;
      }
      if (i % 2 === 0) {
        const c = vocal(sr, r, 0.32, { f0: (x) => 430 + x * 600, vowel: (x) => (x < 0.1 ? 'o' : 'a'), type: 'alto', scale: 1.3, breath: 0.2, rough: 0.3, env: (x) => clamp(x / 0.02, 0, 1) * clamp((0.32 - x) / 0.1, 0, 1) });
        mix(b, c, 0.9, Math.floor(t * sr));
      }
      return done(b, sr, 6500);
    },
  },
  goat: {
    variants: 4, heavy: true, gain: 0.35, ref: 6, max: 140, pitchVar: 0.06, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const dur = 0.75 + r() * 0.35;
      const f0 = 380 + r() * 120, rate = 7 + r() * 2;
      const b = vocal(sr, r, dur, {
        f0: (t) => f0 * (1 + 0.05 * Math.sin(t * 6.283 * rate)) * (1 - 0.1 * t), vowel: (t) => (t < 0.08 ? 'm' : t < dur * 0.5 ? 'e' : 'a'),
        type: 'alto', scale: 1.15, breath: 0.2, jitter: 0.03, rough: 0.3,
        env: (t) => clamp(t / 0.04, 0, 1) * clamp((dur - t) / 0.15, 0, 1) * (0.6 + 0.4 * Math.sin(t * 6.283 * rate)),
      });
      return done(b, sr, 6500);
    },
  },
  child_laugh: {
    variants: 4, heavy: true, gain: 0.45, ref: 5, max: 120, pitchVar: 0.05, verb: 0.2, poly: 2,
    bake: (sr, r) => {
      const n = r.int(5, 8), b = new Float32Array(len(sr, 1.6));
      let t = 0, f0 = 430 + r() * 80;
      for (let k = 0; k < n; k++) {
        const d = 0.08 + r() * 0.04, v = k % 2 ? 'a' : r.pick(['i', 'e', 'a']);
        const c = vocal(sr, r, d, { f0: (x) => f0 * (1 - x), vowel: () => v, type: 'soprano', scale: 1.15, breath: 0.35, jitter: 0.02, env: (x) => Math.sin(Math.PI * clamp(x / d, 0, 1)) });
        mix(b, c, 0.8 * (1 - k * 0.06), Math.floor(t * sr));
        mix(b, burst(sr, r, 0.03, { bp: 1800, q: 0.8, env: { a: 0.002, d: 0.01 } }), 0.08, Math.floor((t - 0.02) * sr));
        t += d + 0.04 + r() * 0.04;
        f0 *= 0.97;
      }
      return done(b, sr, 7000);
    },
  },
  owl: {
    variants: 3, heavy: true, gain: 0.28, ref: 15, max: 400, pitchVar: 0.03, verb: 0.45, poly: 1,
    bake: (sr, r) => {
      const dur = 2.6, n = len(sr, dur), b = new Float32Array(n);
      const hoot = (start, d, f, trem) => {
        const s = osc(sr, len(sr, d), (t) => f * (1 + 0.06 * Math.sin(Math.PI * clamp(t / d, 0, 1))), 'sine');
        const h2 = osc(sr, s.length, (t) => 2 * f * (1 + 0.06 * Math.sin(Math.PI * clamp(t / d, 0, 1))), 'sine');
        mix(s, h2, 0.12);
        shape(s, sr, (t) => Math.sin(Math.PI * clamp(t / d, 0, 1)) ** 0.8 * (trem ? 0.65 + 0.35 * Math.sin(t * 6.283 * 9) : 1));
        mix(b, s, 0.6, Math.floor(start * sr));
      };
      const f = 440 + r() * 50;
      hoot(0, 0.5, f, false);
      hoot(0.95, 0.1, f * 0.95, false);
      hoot(1.2, 0.85, f * 1.02, true);
      const br = white(n, r);
      lp1(br, sr, 900);
      shape(br, sr, (t) => (t < 0.5 || (t > 1.2 && t < 2.05) ? 0.05 : 0));
      mix(b, br, 1);
      return done(b, sr, 3000);
    },
  },
  bird: {
    variants: 6, gain: 0.35, ref: 8, max: 160, pitchVar: 0.04, verb: 0.3, poly: 3,
    bake: (sr, r, i) => {
      const kind = i % 4;
      const b = new Float32Array(len(sr, 1.4));
      if (kind === 0) {
        // Great tit: "tea-cher tea-cher".
        const hi = 3300 + r() * 400, lo = hi * 0.72;
        for (let k = 0; k < r.int(2, 3); k++) {
          mix(b, chirp(sr, 0.09, hi, hi * 0.95, { tau: 0.05, attack: 0.008 }), 0.5, Math.floor(k * 0.3 * sr));
          mix(b, chirp(sr, 0.1, lo * 1.05, lo, { tau: 0.05, attack: 0.008 }), 0.45, Math.floor((k * 0.3 + 0.12) * sr));
        }
      } else if (kind === 1) {
        // Bullfinch: soft descending piping.
        for (let k = 0; k < 2; k++) mix(b, chirp(sr, 0.25, 1900 + r() * 200, 1450, { tau: 0.12, attack: 0.02 }), 0.6, Math.floor(k * 0.55 * sr));
      } else if (kind === 2) {
        // Woodpecker drumming on a dead spruce.
        const n = r.int(12, 18);
        let t = 0;
        for (let k = 0; k < n; k++) {
          mix(b, ring(sr, r, 0.06, 820 + r() * 60, [1, 2.3, 3.7], { decay: 0.012 }), 0.8 * (1 - k / (n * 1.5)), Math.floor(t * sr));
          t += 0.055 + k * 0.0015;
        }
        return done(b, sr, 6000);
      } else {
        // Small twitter.
        let t = 0;
        for (let k = 0; k < r.int(4, 7); k++) {
          const f = 2600 + r() * 1200;
          mix(b, chirp(sr, 0.05, f * 1.2, f, { tau: 0.02, attack: 0.004 }), 0.4, Math.floor(t * sr));
          t += 0.06 + r() * 0.08;
        }
      }
      return done(b, sr, 7000);
    },
  },
};
