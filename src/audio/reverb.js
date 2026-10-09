// Generated impulse responses for the shared convolution reverbs:
//   hall  the outdoor valley: long, dark, cold, with faint mountain echoes (music uses it too)
//   room  the tavern and log interiors: short, dense, warm wood
//   cave  the ice cave behind the frozen falls: bright flutter, glassy ringing tail
// makeIR returns [L, R] Float32Arrays; the mixer wraps them in AudioBuffers.
import { rng, white, lp1, hp1, Biquad, TAU } from './dsp.js';

const SPECS = {
  hall: { rt60: 4.6, pre: 0.028, fStart: 7000, fEnd: 900, early: 9, earlyMax: 0.11, earlyGain: 0.45, echoes: [[0.43, 0.1], [0.91, 0.05], [1.47, 0.025]], hp: 90, width: 1 },
  room: { rt60: 0.75, pre: 0.004, fStart: 6500, fEnd: 1800, early: 14, earlyMax: 0.035, earlyGain: 0.8, echoes: [], hp: 120, width: 0.7 },
  cave: { rt60: 2.9, pre: 0.012, fStart: 9000, fEnd: 2600, early: 10, earlyMax: 0.06, earlyGain: 0.6, echoes: [], flutter: 0.023, ring: [1180, 2310, 3470], hp: 150, width: 0.9 },
};

export function makeIR(sr, kind = 'hall', seed = 7) {
  const s = SPECS[kind] || SPECS.hall;
  const len = Math.floor((s.rt60 * 1.15 + s.pre) * sr);
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed * 31 + ch * 7 + kind.length);
    const b = white(len, r);
    // Exponential decay reaching -60 dB at rt60, with a soft onset after the pre-delay.
    const pre = Math.floor(s.pre * sr);
    const k = 6.9078 / (s.rt60 * sr);
    for (let i = 0; i < len; i++) {
      if (i < pre) { b[i] = 0; continue; }
      const j = i - pre;
      const onset = Math.min(1, j / (0.012 * sr));
      b[i] *= Math.exp(-k * j) * onset;
    }
    // Frequency-dependent decay: a one-pole lowpass whose cutoff falls exponentially over time.
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const f = s.fStart * Math.pow(s.fEnd / s.fStart, Math.min(1, t * 1.6));
      const a = 1 - Math.exp((-TAU * f) / sr);
      y += a * (b[i] - y);
      b[i] = y;
    }
    // Early reflections: sparse taps, slightly different per channel for width.
    for (let e = 0; e < s.early; e++) {
      const t = s.pre + Math.pow(r(), 1.4) * s.earlyMax;
      const i = Math.floor(t * sr);
      const g = s.earlyGain * (1 - (t - s.pre) / (s.earlyMax * 1.4)) * (r() < 0.5 ? -1 : 1) * (0.5 + 0.5 * r());
      for (let j = 0; j < 24 && i + j < len; j++) b[i + j] += g * Math.exp(-j / 4) * (j === 0 ? 1 : 0.4 * (r() - 0.5));
    }
    // Flutter echo between parallel ice walls.
    if (s.flutter) {
      for (let m = 1; m < 18; m++) {
        const i = Math.floor((s.pre + m * s.flutter * (1 + (ch ? 0.04 : 0))) * sr);
        if (i < len) b[i] += 0.35 * Math.pow(0.82, m) * (m % 2 ? 1 : -1);
      }
    }
    // Distant mountain echoes: lowpassed copies of a short burst.
    for (const [t, g] of s.echoes) {
      const i0 = Math.floor((t + (ch ? 0.013 : 0)) * sr);
      const burst = white(Math.floor(0.09 * sr), r);
      lp1(burst, sr, 1400);
      lp1(burst, sr, 1400);
      for (let j = 0; j < burst.length && i0 + j < len; j++) b[i0 + j] += burst[j] * g * 3 * Math.exp(-j / (0.03 * sr));
    }
    // Glassy ringing modes for the cave.
    if (s.ring) {
      for (const f of s.ring) {
        const bq = new Biquad(sr, 'peaking', f * (1 + (ch ? 0.01 : 0)), 18, 7);
        bq.run(b);
      }
    }
    hp1(b, sr, s.hp);
    out.push(b);
  }
  // Partial decorrelation control: blend channels toward mid for narrower rooms.
  if (s.width < 1) {
    const [L, R] = out, w = s.width;
    for (let i = 0; i < L.length; i++) {
      const m = (L[i] + R[i]) * 0.5;
      L[i] = m + (L[i] - m) * w;
      R[i] = m + (R[i] - m) * w;
    }
  }
  // Normalize energy so different rooms sit at comparable wet levels.
  let e = 0;
  for (const b of out) for (let i = 0; i < b.length; i++) e += b[i] * b[i];
  const g = 1 / Math.sqrt(e / 2 + 1e-9) * 0.5;
  for (const b of out) for (let i = 0; i < b.length; i++) b[i] *= g;
  return out;
}
