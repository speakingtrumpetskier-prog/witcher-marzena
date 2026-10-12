// Tavern dice: bone and wood on a table, a hand rattling five dice, a die tumbling over its edge, coins going
// into a pot and being swept away. Played by src/minigames/dice (positional at the table).
// Each recipe: { variants, gain, ref, max, pitchVar, verb, poly, bake(sr, r, i) } like the other recipe files.
import { burst, resonate, ring, mix, fade, len, hp1, Biquad, grains, thump, envAD } from '../kit.js';

const done = (b, sr, lp = 9500) => { new Biquad(sr, 'lowpass', lp, 0.7).run(b); hp1(b, sr, 70); return fade(b, sr, 0.0003, 0.025); };

// One die striking wood: a click through the table's low resonances and a short bright ring from the bone.
function knock(sr, r, { f = 260, q = 11, snap = 1, dur = 0.16, body = 1 } = {}) {
  const b = new Float32Array(len(sr, dur));
  const src = burst(sr, r, dur, { hp: 500, env: { a: 0.0001, d: 0.0016 } });
  mix(b, resonate(src, sr, [[f, q, 1], [f * 2.4, q + 5, 0.5], [f * 4.2, q + 9, 0.25]]), 1.5 * body);
  mix(b, burst(sr, r, 0.008, { hp: 2200, env: { a: 0.00012, d: 0.0011 } }), 0.5 * snap);
  mix(b, ring(sr, r, 0.09, 3000 + r() * 800, [1, 1.9], { decay: 0.013 }), 0.1 * snap);
  return b;
}

// A clack inside a hand: small, dry and high.
function clack(sr, r, f) {
  const b = new Float32Array(len(sr, 0.05));
  const src = burst(sr, r, 0.05, { hp: 1200, env: { a: 0.00008, d: 0.0011 } });
  mix(b, resonate(src, sr, [[f, 14, 1], [f * 1.9, 18, 0.45]]), 1.3);
  mix(b, burst(sr, r, 0.004, { hp: 3000, env: { a: 0.0001, d: 0.0007 } }), 0.4);
  return b;
}

export const DICE = {
  // A die lands. Variants differ in pitch and weight.
  dice_land: {
    variants: 6, gain: 0.55, ref: 1.6, max: 22, pitchVar: 0.07, verb: 0.1, poly: 6,
    bake: (sr, r, i) => done(knock(sr, r, { f: 190 + i * 28 + r() * 30, q: 10 + (i % 3) * 2, snap: 0.8 + (i % 2) * 0.3, body: 0.9 + (i % 3) * 0.1 }), sr),
  },
  // Five dice shaken in a closed hand: a swarm of small clacks over a soft rumble.
  dice_rattle: {
    variants: 3, gain: 0.5, ref: 1.6, max: 22, pitchVar: 0.04, verb: 0.1, poly: 2,
    bake: (sr, r) => {
      const dur = 0.95, b = new Float32Array(len(sr, dur));
      const n = 42 + r.int(0, 10);
      for (let k = 0; k < n; k++) {
        // clacks come in bursts of two or three as the dice knock round
        const t = (Math.pow(r(), 0.8) * 0.88 + (k % 3) * 0.004) * dur;
        const a = (0.35 + r() * 0.65) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t / dur)));
        mix(b, clack(sr, r, 900 + r() * 1700), a, Math.floor(t * sr));
      }
      const rumble = grains(sr, r, dur, { count: 90, bands: [[700, 2], [1500, 2.5]], decay: 0.0012, spread: 0.3, env: (t) => 0.55 * Math.sin(Math.PI * Math.min(1, t / dur)) });
      mix(b, rumble, 0.4);
      return done(b, sr, 8500);
    },
  },
  // A die turning over its edge on the table: two or three soft knocks, closer and closer together.
  dice_tumble: {
    variants: 3, gain: 0.45, ref: 1.6, max: 20, pitchVar: 0.06, verb: 0.08, poly: 5,
    bake: (sr, r, i) => {
      const dur = 0.5, b = new Float32Array(len(sr, dur));
      let t = 0, g = 0.7;
      for (let k = 0; k < 3 + (i % 2); k++) {
        mix(b, knock(sr, r, { f: 230 + r() * 70, q: 9, snap: 0.5, dur: 0.12, body: 0.7 }), g, Math.floor(t * sr));
        t += 0.1 - k * 0.018;
        g *= 0.62;
      }
      mix(b, grains(sr, r, 0.3, { count: 40, bands: [[1100, 1.6], [2200, 2]], decay: 0.001, spread: 0.6 }), 0.15);
      return done(b, sr, 7500);
    },
  },
  // A tiny wooden tick for picking a die (not positional).
  dice_tick: {
    variants: 3, gain: 0.35, ref: 1, max: 10, pitchVar: 0.05, verb: 0, poly: 3, ui: true,
    bake: (sr, r, i) => done(clack(sr, r, 1100 + i * 220), sr, 8000),
  },
  // Coins dropped onto a pile: five or six small rings, each a little different.
  coin_pile: {
    variants: 3, rate: 32000, gain: 0.45, ref: 1.6, max: 20, pitchVar: 0.04, verb: 0.1, poly: 3,
    bake: (sr, r) => {
      const dur = 0.8, b = new Float32Array(len(sr, dur));
      const n = 5 + r.int(0, 2);
      for (let k = 0; k < n; k++) {
        const t = k * 0.055 + r() * 0.04;
        mix(b, ring(sr, r, 0.35, 2300 + r() * 1100, [1, 1.47, 2.09, 2.56], { decay: 0.12 + r() * 0.1, amps: [1, 0.55, 0.3, 0.16] }), 0.28 * (1 - k * 0.07), Math.floor(t * sr));
      }
      mix(b, thump(sr, r, 0.12, { f: 420, fEnd: 240, decay: 0.012, click: 0.25, noise: 0.25 }), 0.2);
      mix(b, grains(sr, r, 0.25, { count: 40, bands: [[3000, 3], [4800, 3]], decay: 0.0008 }), 0.1);
      return done(b, sr, 10000);
    },
  },
  // The pot pushed across the cloth toward whoever won it: sliding metal and a settling run of rings.
  coin_slide: {
    variants: 2, rate: 32000, gain: 0.5, ref: 1.6, max: 20, pitchVar: 0.03, verb: 0.1, poly: 2,
    bake: (sr, r) => {
      const dur = 1.2, b = new Float32Array(len(sr, dur));
      const slide = grains(sr, r, 0.7, { count: 160, bands: [[2800, 3], [4600, 3.5], [1800, 2.5]], decay: 0.0009, spread: 0.7, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.7)) });
      mix(b, slide, 0.45);
      for (let k = 0; k < 7; k++) {
        const t = 0.05 + k * 0.08 + r() * 0.05;
        mix(b, ring(sr, r, 0.3, 2400 + r() * 1200, [1, 1.47, 2.09], { decay: 0.1 + r() * 0.08, amps: [1, 0.5, 0.25] }), 0.2 * (1 - k * 0.08), Math.floor(t * sr));
      }
      const tail = burst(sr, r, 0.3, { color: 'pink', bp: 2600, q: 1.2, env: { a: 0.01, d: 0.08 } });
      envAD(tail, sr, 0.02, 0.1);
      mix(b, tail, 0.12, Math.floor(0.5 * sr));
      return done(b, sr, 10000);
    },
  },
};
