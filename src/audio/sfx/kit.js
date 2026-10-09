// Building blocks for procedural SFX, on top of dsp.js. Each returns a new Float32Array at the
// given sample rate. Recipes (recipes/*.js) combine these into named sounds.
import {
  Biquad, white, pink, brown, lp1, hp1, envAD, shape, curve, mix, normalize, fade, modal,
  glottal, formants, osc, crackle, TAU, clamp,
} from '../dsp.js';
import { vowelAt } from '../instruments/formants.js';

export const len = (sr, sec) => Math.max(1, Math.floor(sec * sr));
export { curve, mix, normalize, fade, envAD, shape, modal, lp1, hp1, crackle, clamp };

// Shaped noise burst. env: [[t, v], ...] or { a, d } (attack, decay tau).
export function burst(sr, r, dur, { color = 'white', lp, hp, bp, q = 1, env = { a: 0.002, d: dur / 4 }, sweep = null } = {}) {
  const n = len(sr, dur);
  const b = color === 'pink' ? pink(n, r) : color === 'brown' ? brown(n, r) : white(n, r);
  if (hp) new Biquad(sr, 'highpass', hp, 0.7).run(b);
  if (lp) new Biquad(sr, 'lowpass', lp, 0.7).run(b);
  if (bp && !sweep) new Biquad(sr, 'bandpass', bp, q).run(b);
  if (sweep) {
    const bq = new Biquad(sr, 'bandpass', sweep(0), q);
    for (let i = 0; i < n; i += 32) { bq.set('bandpass', sweep(i / sr), q); bq.run(b, i, Math.min(n, i + 32)); }
  }
  if (Array.isArray(env)) shape(b, sr, curve(env));
  else envAD(b, sr, env.a ?? 0.002, env.d ?? dur / 4);
  return b;
}

// Granular crunch (snow, straw, gravel): many tiny grains through a few resonant bands.
export function grains(sr, r, dur, { count = 60, bands = [[1800, 2.5], [3200, 3], [900, 2]], spread = 1, decay = 0.0012, env = null, squeak = 0 } = {}) {
  const n = len(sr, dur);
  const out = new Float32Array(n);
  const per = bands.map(() => new Float32Array(n));
  for (let g = 0; g < count; g++) {
    // Front-loaded: most grains in the first part (the weight lands, then settles).
    const t = Math.pow(r(), 1.6 * spread) * n * 0.9;
    const i0 = Math.floor(t);
    const a = (0.3 + r() * 0.7) * (env ? env(t / sr) : 1) * r.sign();
    const k = Math.floor(r() * bands.length);
    const tau = decay * sr * (0.5 + r());
    const L = Math.min(n - i0, Math.floor(tau * 6));
    for (let j = 0; j < L; j++) per[k][i0 + j] += a * (r() * 2 - 1) * Math.exp(-j / tau);
  }
  bands.forEach(([f, q], k) => {
    new Biquad(sr, 'bandpass', f * (0.9 + r() * 0.2), q).run(per[k]);
    mix(out, per[k], 1.6);
  });
  if (squeak) {
    // Cold snow squeaks: a short resonant chirp riding on the crunch.
    const f0 = 1100 + r() * 900;
    const sq = osc(sr, len(sr, 0.06), (t) => f0 * (1 + t * 3), 'saw');
    new Biquad(sr, 'bandpass', f0 * 1.3, 6).run(sq);
    envAD(sq, sr, 0.004, 0.015);
    mix(out, sq, squeak * 0.25, Math.floor(r() * 0.03 * sr));
  }
  return out;
}

// Low thump with a pitch drop (footfalls, body hits, drums of the earth).
export function thump(sr, r, dur, { f = 80, fEnd = 45, decay = 0.05, click = 0.3, noise = 0.3, lp = 400 } = {}) {
  const n = len(sr, dur);
  const b = osc(sr, n, (t) => fEnd + (f - fEnd) * Math.exp(-t / (decay * 0.6)), 'sine');
  envAD(b, sr, 0.001, decay);
  if (noise) {
    const nz = burst(sr, r, dur, { color: 'brown', lp, env: { a: 0.001, d: decay * 0.6 } });
    mix(b, nz, noise * 2);
  }
  if (click) {
    const c = burst(sr, r, 0.006, { hp: 1500, env: { a: 0.0003, d: 0.0012 } });
    mix(b, c, click);
  }
  return b;
}

// Parallel bank of resonators excited by `src`. modes: [[f, q, gain], ...]
export function resonate(src, sr, modes) {
  const out = new Float32Array(src.length);
  for (const [f, q, g] of modes) {
    const tmp = src.slice();
    new Biquad(sr, 'bandpass', f, q).run(tmp);
    mix(out, tmp, g);
  }
  return out;
}

// Bandpassed noise sweep with a bell-shaped amplitude (whooshes, wind blasts, swings).
export function whoosh(sr, r, dur, { f0 = 300, f1 = 1500, q = 1.2, peak = 0.45, color = 'pink', tone = 0, toneF = 0 } = {}) {
  const n = len(sr, dur);
  const b = color === 'white' ? white(n, r) : pink(n, r);
  const bq = new Biquad(sr, 'bandpass', f0, q);
  for (let i = 0; i < n; i += 32) {
    const t = i / n;
    const f = f0 * Math.pow(f1 / f0, t < peak ? t / peak : 1 - (t - peak) / (1 - peak) * 0.7);
    bq.set('bandpass', f, q);
    bq.run(b, i, Math.min(n, i + 32));
  }
  shape(b, sr, (t) => {
    const x = t / dur;
    return x < peak ? Math.pow(x / peak, 2) : Math.pow(Math.max(0, 1 - (x - peak) / (1 - peak)), 1.8);
  });
  if (tone) {
    const s = osc(sr, n, (t) => toneF * (1 + 0.3 * Math.sin((t / dur) * Math.PI)), 'sine');
    shape(s, sr, (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) ** 2);
    mix(b, s, tone);
  }
  return b;
}

// A sung or animal vocalization: glottal source through formants. f0 and vowel are functions of
// t; vowel returns a vowel letter or a [[f, bw, gainLin], ...] set. type: formant table.
export function vocal(sr, r, dur, { f0, vowel = () => 'a', type = 'alto', scale = 1, breath = 0.06, jitter = 0.01, shimmer = 0.08, rough = 0, open = 0.55, env = null, lp = 7000 } = {}) {
  const n = len(sr, dur);
  const fFn = typeof f0 === 'number' ? () => f0 : f0;
  const src = glottal(sr, n, fFn, r, { jitter, shimmer, breath, rough, open });
  const track = (t) => {
    const v = vowel(t);
    return Array.isArray(v) ? v : vowelAt(type, v, fFn(t), scale);
  };
  const out = formants(src, sr, track);
  // A little of the source low end for body.
  const low = src.slice();
  lp1(low, sr, 500);
  mix(out, low, 0.25);
  new Biquad(sr, 'lowpass', lp, 0.7).run(out);
  if (env) shape(out, sr, env);
  return out;
}

// Exponential chirp (dispersive ice pings, bird calls, bubbles).
export function chirp(sr, dur, f0, f1, { tau = dur / 3, attack = 0.002, type = 'sine', k = 1 } = {}) {
  const n = len(sr, dur);
  const b = osc(sr, n, (t) => f1 + (f0 - f1) * Math.exp((-t * k) / Math.max(1e-4, dur / 4)), type);
  envAD(b, sr, attack, tau);
  return b;
}

// Stick-slip friction (creaks): a pulse train at a varying rate exciting resonant modes.
export function creak(sr, r, dur, { rate = () => 60, modes = [[400, 8, 1], [900, 10, 0.6], [1700, 12, 0.3]], jitter = 0.15, env = null } = {}) {
  const n = len(sr, dur);
  const imp = new Float32Array(n);
  let t = 0;
  while (t < n) {
    const f = Math.max(5, rate(t / sr));
    const a = env ? env(t / sr) : 1;
    imp[Math.floor(t)] += a * (0.6 + r() * 0.4);
    t += (sr / f) * (1 + (r() - 0.5) * jitter);
  }
  return resonate(imp, sr, modes);
}

// Metallic ring from inharmonic partials.
export function ring(sr, r, dur, f, ratios, { decay = 0.6, amps = null, spread = 0.002 } = {}) {
  const parts = [];
  ratios.forEach((k, i) => {
    const a = amps ? amps[i] : 1 / (1 + i * 0.7);
    const d = decay / (1 + i * 0.35);
    parts.push({ f: f * k, a, d, ph: r() * TAU });
    parts.push({ f: f * k * (1 + spread * (0.5 + r())), a: a * 0.5, d: d * 0.9, ph: r() * TAU });
  });
  return modal(sr, dur, parts);
}

// Fire: roar (brown noise) plus crackles and pops.
export function fire(sr, r, dur, { roar = 0.5, crackles = 18, pops = 2, hiss = 0.15 } = {}) {
  const n = len(sr, dur);
  const b = brown(n, r);
  lp1(b, sr, 500);
  for (let i = 0; i < n; i++) b[i] *= roar * (0.75 + 0.25 * Math.sin(i / sr * 2.1 + Math.sin(i / sr * 0.7) * 2));
  const c = crackle(sr, n, r, { rate: crackles, decay: 0.0008, amp: 0.9 });
  new Biquad(sr, 'highpass', 1200, 0.7).run(c);
  new Biquad(sr, 'lowpass', 6500, 0.7).run(c);
  mix(b, c, 0.8);
  const p = crackle(sr, n, r, { rate: pops, decay: 0.004, amp: 1 });
  new Biquad(sr, 'bandpass', 700, 1).run(p);
  mix(b, p, 1.5);
  if (hiss) {
    const h = pink(n, r);
    new Biquad(sr, 'bandpass', 3000, 0.6).run(h);
    mix(b, h, hiss * 0.3);
  }
  return b;
}

export { Biquad, white, pink, brown, osc, glottal, formants, vowelAt };
