// Baked instruments: notes synthesized once into AudioBuffers (through Bank) and played by a
// cheap Sampler (one buffer source and one gain per note). Plucked zither (Karplus-Strong with a
// double course), Wiesia's music box, church bells (open and drowned under the ice), the frame
// drum, the deep war drum and a soft low pulse.
import { mtof, pluck, modal, filt, white, lp1, hp1, normalize, fade, envAD, mix, clamp, Biquad } from '../dsp.js';

// --- Renderers: (sr, r, ...args) => Float32Array -------------------------------------------

export function renderZither(sr, r, midi, hard) {
  const f = mtof(midi);
  const dur = clamp(5.4 - (midi - 45) * 0.07, 2.2, 5.2);
  const opts = { t60: dur * 0.75, bright: hard ? 0.6 : 0.38, pick: 0.12 + r() * 0.04, hardness: hard ? 0.85 : 0.4 };
  const b = pluck(sr, f, dur, r, opts);
  // Second string of the course, a hair sharp: the shimmer of a gusli.
  pluck(sr, f * 1.0016, dur, r, { ...opts, out: b });
  filt(b, sr, 'peaking', 230, 2, 4);
  filt(b, sr, 'peaking', 640, 2.2, 3);
  filt(b, sr, 'highshelf', 3200, 0.7, -5);
  hp1(b, sr, 70);
  fade(b, sr, 0.001, 0.3);
  return normalize(b, 0.8);
}

export function renderBox(sr, r, midi) {
  const f = mtof(midi), dur = 3.6;
  const b = modal(sr, dur, [
    { f, a: 1, d: 1.5 - (midi - 69) * 0.02 },
    { f: f * 1.0012, a: 0.35, d: 1.2 },
    { f: f * 2.002, a: 0.05, d: 0.45 },
    { f: f * 5.38, a: 0.13, d: 0.2 },
    { f: f * 8.86, a: 0.035, d: 0.07 },
  ]);
  const click = white(Math.floor(0.004 * sr), r);
  hp1(click, sr, 2500);
  mix(b, click, 0.12);
  filt(b, sr, 'highshelf', 4500, 0.7, -6);
  fade(b, sr, 0.0005, 0.2);
  return normalize(b, 0.75);
}

// Church bell partials relative to the prime (hum, prime, tierce, quint, nominal, upper).
const BELL = [
  [0.5, 0.55, 1.0], [1.0, 0.6, 0.75], [1.19, 0.5, 0.6], [1.5, 0.22, 0.4], [2.0, 0.7, 0.45],
  [2.51, 0.22, 0.25], [2.66, 0.18, 0.2], [3.01, 0.15, 0.16], [4.02, 0.1, 0.1], [5.42, 0.05, 0.06],
];
export function renderBell(sr, r, midi, muffled = false) {
  const f = mtof(midi);
  const dur = muffled ? 9 : 7;
  const parts = [];
  for (const [ratio, a, d] of BELL) {
    const ff = f * ratio;
    const dd = d * (muffled ? 9 : 7) * Math.pow(220 / Math.max(80, ff), 0.3);
    parts.push({ f: ff, a, d: dd, ph: r() * 6 });
    parts.push({ f: ff * (1 + 0.0018 + r() * 0.002), a: a * 0.5, d: dd * 0.9, ph: r() * 6 });
  }
  const b = modal(sr, dur, parts);
  const strike = white(Math.floor(0.012 * sr), r);
  lp1(strike, sr, muffled ? 600 : 3500);
  mix(b, strike, muffled ? 0.15 : 0.35);
  if (muffled) {
    // Through ice and dark water: lowpassed, with a slow wavering of level and a wet rumble.
    filt(b, sr, 'lowpass', 520, 1.4);
    filt(b, sr, 'lowpass', 700, 0.7);
    filt(b, sr, 'peaking', 180, 1.5, 4);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      b[i] *= 1 + 0.28 * Math.sin(6.2832 * 0.7 * t + 1.3) * Math.min(1, t * 2);
    }
    const rum = white(b.length, r);
    lp1(rum, sr, 90); lp1(rum, sr, 90);
    envAD(rum, sr, 0.05, 2.5);
    mix(b, rum, 2.5);
  } else filt(b, sr, 'highshelf', 3500, 0.7, -4);
  fade(b, sr, 0.0005, 0.5);
  return normalize(b, 0.8);
}

// Frame drum: circular membrane modes. 'dum' center hit (low), 'tek' edge (bright, short),
// 'slap' between, 'ghost' a soft finger tap.
const MEMBRANE = [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5];
export function renderFrame(sr, r, kind = 'dum') {
  const f1 = 92 * (1 + r.bi() * 0.02);
  const amps = {
    dum: [1, 0.25, 0.12, 0.4, 0.08, 0.06, 0.05, 0.03],
    tek: [0.15, 0.5, 0.6, 0.3, 0.55, 0.4, 0.35, 0.3],
    slap: [0.5, 0.45, 0.5, 0.35, 0.4, 0.3, 0.25, 0.2],
    ghost: [0.25, 0.3, 0.35, 0.2, 0.3, 0.2, 0.15, 0.1],
  }[kind];
  const dec = kind === 'dum' ? 0.32 : kind === 'slap' ? 0.16 : 0.09;
  const dur = kind === 'dum' ? 1.2 : 0.6;
  const parts = MEMBRANE.map((m, i) => ({ f: f1 * m, a: amps[i] * (0.85 + r() * 0.3), d: dec / Math.sqrt(1 + i * 0.6), glide: kind === 'dum' ? 0.1 : 0.05, gt: 0.03 }));
  const b = modal(sr, dur, parts);
  const skin = white(Math.floor(0.03 * sr), r);
  const bq = new Biquad(sr, 'bandpass', kind === 'dum' ? 900 : 2600, 0.9);
  bq.run(skin);
  envAD(skin, sr, 0.0005, kind === 'dum' ? 0.006 : 0.01);
  mix(b, skin, kind === 'dum' ? 0.5 : 1.3);
  hp1(b, sr, 40);
  fade(b, sr, 0.0003, 0.08);
  return normalize(b, kind === 'ghost' ? 0.35 : kind === 'tek' ? 0.6 : 0.8);
}

export function renderWar(sr, r, muffled = false) {
  const f1 = 51 * (1 + r.bi() * 0.02);
  const dur = muffled ? 1.4 : 2.6;
  const d = muffled ? 0.35 : 0.95;
  const b = modal(sr, dur, [
    { f: f1, a: 1, d, glide: 0.32, gt: 0.06 },
    { f: f1 * 1.59, a: 0.35, d: d * 0.6, glide: 0.2, gt: 0.05 },
    { f: f1 * 2.14, a: 0.22, d: d * 0.45, glide: 0.15, gt: 0.04 },
    { f: f1 * 2.65, a: 0.1, d: d * 0.3 },
    { f: 175, a: 0.12, d: 0.18 },
  ]);
  const thump = white(Math.floor(0.05 * sr), r);
  lp1(thump, sr, muffled ? 300 : 700);
  lp1(thump, sr, muffled ? 300 : 900);
  envAD(thump, sr, 0.001, 0.012);
  mix(b, thump, muffled ? 1.5 : 2.5);
  if (muffled) filt(b, sr, 'lowpass', 400, 0.7);
  hp1(b, sr, 28);
  fade(b, sr, 0.0005, 0.2);
  return normalize(b, 0.85);
}

export function renderPulse(sr, r) {
  const b = modal(sr, 0.9, [
    { f: 55, a: 1, d: 0.16, glide: 0.25, gt: 0.03 },
    { f: 110, a: 0.25, d: 0.08 },
  ]);
  const t = white(Math.floor(0.02 * sr), r);
  lp1(t, sr, 400);
  envAD(t, sr, 0.001, 0.006);
  mix(b, t, 0.6);
  fade(b, sr, 0.004, 0.1);
  return normalize(b, 0.8);
}

// --- Sampler ---------------------------------------------------------------------------

const KINDS = {
  zither: {
    key: (ev) => { const hard = (ev.v ?? 0.6) > 0.62; return [`zither:${ev._p}:${hard ? 'h' : 's'}`, (sr, r) => renderZither(sr, r, ev._p, hard)]; },
  },
  box: { key: (ev) => [`box:${ev._p}`, (sr, r) => renderBox(sr, r, ev._p)] },
  bell: { key: (ev) => [`bell:${ev._p}:${ev.muffled ? 'm' : 'o'}`, (sr, r) => renderBell(sr, r, ev._p, !!ev.muffled)] },
  frame: { key: (ev, n) => { const k = ev.kind || 'dum'; return [`frame:${k}:${n % 3}`, (sr, r) => renderFrame(sr, r, k)]; } },
  war: { key: (ev, n) => { const m = !!ev.muffled; return [`war:${m ? 'm' : 'o'}:${n % 2}`, (sr, r) => renderWar(sr, r, m)]; } },
  pulse: { key: () => ['pulse', renderPulse] },
};

// Loudness calibration per kind (measured with scripts/render-audio.mjs --only inst) so that a
// part level means roughly the same loudness on every instrument.
const CAL = { zither: 2.4, box: 2.0, bell: 1.8, frame: 1.4, war: 1.3, pulse: 1.2 };

export class Sampler {
  constructor(eng, kind, o = {}) {
    this.eng = eng;
    this.ctx = eng.ctx;
    this.kind = kind;
    this.def = KINDS[kind];
    this.level = (o.level ?? 0.5) * (CAL[kind] ?? 1);
    this.out = this.ctx.createGain();
    this.n = 0;
    this.r = eng.rngFor(`sampler:${kind}`);
  }

  one(ev, p, t, dur, v) {
    const ctx = this.ctx;
    ev._p = Math.round(p);
    const [key, fn] = this.def.key(ev, this.n++);
    const buf = this.eng.bank.get(key, fn);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const cents = (p - Math.round(p)) * 100 + (ev.cents || 0) + this.r.bi() * (ev.loose ?? 2);
    src.detune.value = cents;
    if (ev.rate) src.playbackRate.value = ev.rate;
    const g = ctx.createGain();
    g.gain.value = this.level * v;
    src.connect(g);
    g.connect(this.out);
    src.start(t);
    // Damped notes (zither muted with the palm, music box stopped) get a quick release.
    if (ev.damp) {
      g.gain.setValueAtTime(this.level * v, t + dur);
      g.gain.setTargetAtTime(0, t + dur, ev.damp === true ? 0.08 : ev.damp);
      src.stop(t + dur + 0.6);
    } else src.stop(t + buf.duration / (ev.rate || 1) + 0.05);
    src.onended = () => g.disconnect();
  }

  play(ev, t, dur) {
    t = Math.max(t, this.ctx.currentTime + 0.002);
    const v = ev.v ?? 0.7;
    if (Array.isArray(ev.p)) {
      const gap = ev.strum ?? 0.028;
      const ps = ev.down ? [...ev.p].reverse() : ev.p;
      ps.forEach((p, i) => this.one(ev, p, t + i * gap + this.r() * 0.004, dur, v * (1 - i * 0.04)));
    } else this.one(ev, ev.p ?? 62, t, dur, v);
  }

  // Notes free themselves when they end; the mood disconnects its busses after the tail.
  dispose(when) {
    this.out.gain.setTargetAtTime(0, Math.max(when, this.ctx.currentTime) + 0.5, 0.4);
  }
}
