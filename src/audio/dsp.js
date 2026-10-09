// Pure-JS DSP toolkit. Everything that is baked once (instrument samples, SFX variants, ambience
// beds, reverb impulses) is computed here into Float32Arrays, with no WebAudio dependency, so a
// given seed always produces the same sound and the work can run in small idle slices.
// The sample rate is always an explicit argument.

export const TAU = Math.PI * 2;

// Seeded PRNG (mulberry32) with helpers.
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.bi = () => f() * 2 - 1;
  // Roughly gaussian in [-1, 1] (sum of three uniforms).
  f.soft = () => (f() + f() + f()) / 1.5 - 1;
  return f;
}

export function hash(str, n = 0) {
  let h = (2166136261 ^ n) >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// RBJ cookbook biquad, transposed direct form II. `set` may be called while running (sweeps).
export class Biquad {
  constructor(sr, type = 'lowpass', f = 1000, q = 0.707, gain = 0) {
    this.sr = sr;
    this.z1 = 0;
    this.z2 = 0;
    this.set(type, f, q, gain);
  }
  set(type, f, q = 0.707, gain = 0) {
    f = clamp(f, 5, this.sr * 0.48);
    const w = (TAU * f) / this.sr, c = Math.cos(w), s = Math.sin(w);
    const al = s / (2 * Math.max(q, 1e-4));
    const A = Math.pow(10, gain / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'bandpass': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'peaking': b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; break;
      case 'lowshelf': {
        const r = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 - (A - 1) * c + r); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - r);
        a0 = A + 1 + (A - 1) * c + r; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - r; break;
      }
      case 'highshelf': {
        const r = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * c + r); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - r);
        a0 = A + 1 - (A - 1) * c + r; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - r; break;
      }
      default: b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  run(buf, from = 0, to = buf.length) {
    for (let i = from; i < to; i++) buf[i] = this.tick(buf[i]);
    return buf;
  }
}

// In-place filter helpers.
export function filt(buf, sr, type, f, q = 0.707, gain = 0) {
  return new Biquad(sr, type, f, q, gain).run(buf);
}
// Time-varying filter. fFn(t seconds) returns the cutoff; qFn optional.
export function sweep(buf, sr, type, fFn, q = 0.707, step = 32) {
  const bq = new Biquad(sr, type, fFn(0), q);
  for (let i = 0; i < buf.length; i += step) {
    const t = i / sr;
    bq.set(type, fFn(t), typeof q === 'function' ? q(t) : q);
    bq.run(buf, i, Math.min(buf.length, i + step));
  }
  return buf;
}
export function lp1(buf, sr, f) {
  const a = 1 - Math.exp((-TAU * f) / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] = y; }
  return buf;
}
export function hp1(buf, sr, f) {
  const a = 1 - Math.exp((-TAU * f) / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] -= y; }
  return buf;
}
export function dcBlock(buf) {
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const y = buf[i] - x1 + 0.9975 * y1;
    x1 = buf[i]; y1 = y; buf[i] = y;
  }
  return buf;
}

// Noise.
export function white(n, r) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
  return b;
}
export function pink(n, r) {
  const b = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    b[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return b;
}
export function brown(n, r) {
  const b = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = (y + 0.02 * (r() * 2 - 1)) / 1.02; b[i] = y * 3.5; }
  return b;
}
// Smooth random control signal in [-1, 1] with about `hz` bandwidth (for jitter, drift, gusts).
export function wander(n, sr, hz, r) {
  const b = new Float32Array(n);
  const step = Math.max(1, Math.floor(sr / hz));
  let a = r.bi(), c = r.bi();
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0) { a = c; c = r.bi(); }
    const t = k / step, s = t * t * (3 - 2 * t);
    b[i] = a + (c - a) * s;
  }
  return b;
}

// Envelopes and shaping.
export function curve(points) {
  // Piecewise linear function of t (seconds) from [[t, v], ...].
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) {
        const [t0, v0] = points[i - 1];
        return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
      }
    }
    return points[points.length - 1][1];
  };
}
export function shape(buf, sr, fn) {
  for (let i = 0; i < buf.length; i++) buf[i] *= fn(i / sr);
  return buf;
}
// Attack (linear) then exponential decay with time constant tau.
export function envAD(buf, sr, attack, tau, delay = 0) {
  const a = Math.max(1, attack * sr), d0 = delay * sr;
  for (let i = 0; i < buf.length; i++) {
    const j = i - d0;
    buf[i] *= j < 0 ? 0 : j < a ? j / a : Math.exp(-(j - a) / (tau * sr));
  }
  return buf;
}
export function fade(buf, sr, fin = 0.002, fout = 0.02) {
  const a = Math.floor(fin * sr), b = Math.floor(fout * sr), n = buf.length;
  for (let i = 0; i < a && i < n; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < n; i++) buf[n - 1 - i] *= i / b;
  return buf;
}
export function mix(dst, src, gain = 1, offset = 0) {
  const o = Math.floor(offset);
  for (let i = 0; i < src.length; i++) {
    const j = i + o;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
  return dst;
}
export function peak(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
  return p;
}
export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}
export function normalize(buf, target = 0.9) {
  const p = peak(buf);
  if (p > 1e-9) { const g = target / p; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}
export function scale(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}
export function softclip(buf, drive = 1) {
  const k = Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / k;
  return buf;
}
// Crossfade the tail into the head so the buffer loops without a seam. Returns a shorter buffer.
export function makeLoop(buf, sr, xfade = 0.5) {
  const x = Math.min(Math.floor(xfade * sr), Math.floor(buf.length / 3));
  const n = buf.length - x;
  const out = buf.slice(0, n);
  for (let i = 0; i < x; i++) {
    const t = i / x;
    // Equal-power crossfade of the tail onto the start.
    out[i] = buf[i] * Math.sin(t * Math.PI / 2) + buf[n + i] * Math.cos(t * Math.PI / 2);
  }
  return out;
}
// Simple feedback echo (for small slaps baked into SFX).
export function echo(buf, sr, time, fb = 0.3, wet = 0.3, lpHz = 3000) {
  const d = Math.floor(time * sr);
  const line = new Float32Array(d);
  const a = 1 - Math.exp((-TAU * lpHz) / sr);
  let y = 0, k = 0;
  for (let i = 0; i < buf.length; i++) {
    const delayed = line[k];
    y += a * (delayed - y);
    line[k] = buf[i] + y * fb;
    buf[i] += y * wet;
    k = (k + 1) % d;
  }
  return buf;
}

// Oscillators. fFn may be a number or a function of t (seconds). Phase-accumulating, so sweeps are smooth.
export function osc(sr, n, fFn, type = 'sine', phase = 0) {
  const b = new Float32Array(n);
  const fixed = typeof fFn === 'number';
  let p = phase;
  for (let i = 0; i < n; i++) {
    const f = fixed ? fFn : fFn(i / sr);
    const dt = f / sr;
    let v;
    if (type === 'sine') v = Math.sin(TAU * p);
    else if (type === 'tri') v = 1 - 4 * Math.abs(p - 0.5);
    else if (type === 'saw') v = 2 * p - 1 - polyblep(p, dt);
    else v = (p < 0.5 ? 1 : -1) + polyblep(p, dt) - polyblep((p + 0.5) % 1, dt);
    b[i] = v;
    p += dt;
    if (p >= 1) p -= Math.floor(p);
  }
  return b;
}
function polyblep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Modal synthesis: a sum of exponentially decaying sinusoids computed with recursive
// oscillators (no Math.sin per sample). partials: [{ f, a, d (seconds to 1/e), glide?, gt? }].
// `glide` is a relative pitch offset at t=0 that relaxes with time constant gt (drum skins).
export function modal(sr, dur, partials, out = null, offset = 0) {
  const n = Math.floor(dur * sr);
  const b = out || new Float32Array(n);
  for (const p of partials) {
    if (p.f >= sr * 0.47 || p.a === 0) continue;
    const r = Math.exp(-1 / (p.d * sr));
    const len = Math.min(b.length - offset, Math.floor(p.d * sr * 9));
    if (p.glide) {
      let ph = p.ph || 0, amp = p.a;
      for (let i = 0; i < len; i++) {
        const f = p.f * (1 + p.glide * Math.exp(-i / (p.gt * sr)));
        b[i + offset] += amp * Math.sin(ph);
        ph += (TAU * f) / sr;
        amp *= r;
      }
      continue;
    }
    const w = (TAU * p.f) / sr;
    const c = 2 * Math.cos(w);
    let y1 = Math.sin((p.ph || 0) - w) * p.a / r, y2 = Math.sin((p.ph || 0) - 2 * w) * p.a / (r * r);
    const cr = c * r, r2 = r * r;
    for (let i = 0; i < len; i++) {
      const y = cr * y1 - r2 * y2;
      b[i + offset] += y;
      y2 = y1; y1 = y;
    }
  }
  return b;
}

// Karplus-Strong plucked string with fractional-delay tuning, adjustable brightness and pick
// position, and a decay time t60 (seconds) for the fundamental.
export function pluck(sr, freq, dur, r, { t60 = 3, bright = 0.5, pick = 0.15, hardness = 0.7, out = null } = {}) {
  const n = Math.floor(dur * sr);
  const y = out || new Float32Array(n);
  const s = clamp(0.5 * (1 - bright), 0.02, 0.5); // one-zero loop filter weight (delay s samples)
  const period = sr / freq;
  const D = period - s;
  let N = Math.floor(D - 0.2);
  if (N < 2) N = 2;
  const frac = D - N;
  const ap = (1 - frac) / (1 + frac);
  const g = Math.pow(10, -3 / (t60 * freq)); // per-period loss for the fundamental
  // Excitation: lowpassed noise burst, comb-filtered by the pick position.
  const ex = white(N, r);
  lp1(ex, sr, 1500 + hardness * 9000);
  const pk = Math.max(1, Math.floor(N * pick));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = ex[i] - (i >= pk ? ex[i - pk] : 0) * 0.9;
  let idx = 0, prev = 0, apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const out0 = line[idx];
    const lp = (1 - s) * out0 + s * prev;
    prev = out0;
    const a = ap * lp + apx - ap * apy;
    apx = lp; apy = a;
    line[idx] = a * g;
    y[i] += out0;
    idx++;
    if (idx >= N) idx = 0;
  }
  return y;
}

// Glottal source: Rosenberg pulse derivative with jitter, shimmer and aspiration.
// f0 is a function of t (seconds) or a number. Returns a buffer normalized to about +-1.
export function glottal(sr, n, f0, r, { open = 0.55, close = 0.3, jitter = 0.006, shimmer = 0.05, breath = 0.05, rough = 0 } = {}) {
  const b = new Float32Array(n);
  const fixed = typeof f0 === 'number';
  const jit = wander(n, sr, 18, r);
  const shim = wander(n, sr, 25, r);
  let p = 0, prevFlow = 0, rough1 = 1;
  for (let i = 0; i < n; i++) {
    const f = (fixed ? f0 : f0(i / sr)) * (1 + jitter * jit[i]);
    p += f / sr;
    if (p >= 1) { p -= 1; rough1 = 1 - rough * r(); }
    let flow;
    if (p < open) flow = 0.5 * (1 - Math.cos((Math.PI * p) / open));
    else if (p < open + close) flow = Math.cos((Math.PI / 2) * ((p - open) / close));
    else flow = 0;
    const d = (flow - prevFlow) * (sr / Math.max(40, f)) * 0.25;
    prevFlow = flow;
    const asp = (r() * 2 - 1) * breath * (0.4 + flow);
    b[i] = (d * (1 + shimmer * shim[i]) * rough1 + asp);
  }
  return b;
}

// Parallel formant filter bank with time-varying formants. track(t) returns [[f, bw, gain], ...].
// Alternating output signs (Klatt) avoid phase cancellation between neighbouring formants.
export function formants(src, sr, track, step = 64) {
  const out = new Float32Array(src.length);
  const init = track(0);
  const bqs = init.map(([f, bw]) => new Biquad(sr, 'bandpass', f, f / bw));
  for (let i = 0; i < src.length; i += step) {
    const fm = track(i / sr);
    const end = Math.min(src.length, i + step);
    for (let k = 0; k < bqs.length; k++) {
      const [f, bw, g] = fm[k];
      const bq = bqs[k].set('bandpass', f, f / Math.max(10, bw));
      const sg = k % 2 ? -g : g;
      for (let j = i; j < end; j++) out[j] += bq.tick(src[j]) * sg;
    }
  }
  return out;
}

// Random impulse train (crackles, grains). Each impulse is a tiny decaying noise blip.
export function crackle(sr, n, r, { rate = 20, decay = 0.0015, amp = 1, ampVar = 0.8, density = null } = {}) {
  const b = new Float32Array(n);
  const tau = decay * sr;
  let t = 0;
  while (t < n) {
    const dens = density ? Math.max(0.01, density(t / sr)) : 1;
    t += Math.max(1, Math.floor((-Math.log(1 - r() * 0.999) / (rate * dens)) * sr));
    if (t >= n) break;
    const a = amp * (1 - ampVar * r()) * r.sign();
    const len = Math.min(n - t, Math.floor(tau * 6));
    for (let j = 0; j < len; j++) b[t + j] += a * (r() * 2 - 1) * Math.exp(-j / tau);
  }
  return b;
}

// Stereo helper: returns [L, R] by delaying/detuning a mono source slightly for width.
export function widen(mono, sr, ms = 9, amount = 0.6) {
  const d = Math.floor((ms / 1000) * sr);
  const L = mono.slice(), R = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) R[i] = mono[i] * (1 - amount) + (i >= d ? mono[i - d] : 0) * amount;
  return [L, R];
}

// Drop the silent tail of a one-shot (below about -66 dBFS after normalization), with a short
// fade, so baked SFX cost only the memory they sound for. Never use on loops.
export function trimTail(chs, sr, floor = 5e-4) {
  let last = 0;
  for (const c of chs) for (let i = c.length - 1; i > last; i--) if (Math.abs(c[i]) > floor) { last = i; break; }
  const n = Math.min(chs[0].length, last + Math.floor(0.03 * sr));
  return chs.map((c) => fade(c.slice(0, n), sr, 0, Math.min(0.03, n / sr / 4)));
}
