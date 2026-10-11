// Live instruments: expressive monophonic lines built once per mood as a small fixed node graph
// and then played purely by AudioParam automation (no nodes created per note). This is what lets
// the voice slide, scoop, bloom its vibrato late and fall at phrase ends, and lets the fiddle and
// gurdy glide between notes. Plucked and struck instruments are baked samples (baked.js).
//
// Every instrument exposes: out (GainNode), play(ev, when, durSec, secPerBeat), dispose(when).
// Event fields used here (all optional except p): p midi, v 0..1, tie (legato into next note),
// slide (slow portamento from previous), scoop (semitones from below), fall (semitones fall-off
// at the end), g (grace pitch to start on), bend [[beats, midi], ...], vib (vibrato amount),
// vowel 'a e i o u m', c consonant, breath (audible inhale before), trem, scrape, dbl.
import { mtof } from '../dsp.js';
import { vowelAt, bankLevel } from './formants.js';

const semis = (s) => Math.pow(2, s / 12);

// Periodic waves are cached per context.
const WAVES = {
  glottal: (k) => Math.pow(k, -1.25),
  glottalPressed: (k) => (k === 1 ? 0.75 : Math.pow(k, -1.02)),
  glottalSoft: (k) => Math.pow(k, -1.75),
  saw: (k) => 1 / k,
  fiddle: (k) => (1 / k) * (0.25 + Math.abs(Math.sin(Math.PI * k / 7.3))),
  gurdy: (k) => Math.pow(k, -0.85) * (k >= 3 && k <= 8 ? 1.45 : 1),
  buzz: (k) => Math.pow(k, -0.45),
  flute: (k) => [0, 1, 0.2, 0.08, 0.035, 0.015, 0.008][k] || 0,
  // A bowed or bellows drone: falling harmonics with a soft bump near the fourth (warmth, no edge).
  drone: (k) => Math.pow(k, -1.6) * (1 + 0.7 * Math.exp(-((k - 4) ** 2) / 5)),
  // The same, hollower (odd harmonics lead): the cold night drone.
  droneHollow: (k) => Math.pow(k, -1.5) * (k % 2 ? 1 : 0.35),
};
export function wave(eng, name) {
  eng._waves = eng._waves || {};
  if (eng._waves[name]) return eng._waves[name];
  const n = name === 'flute' ? 8 : name.startsWith('drone') ? 24 : 64;
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = WAVES[name](k);
  return (eng._waves[name] = eng.ctx.createPeriodicWave(real, imag));
}

// Filter sweeps here are slow (time constants of 10 ms and up), so their coefficients can follow once per 128-sample
// block: with the default a-rate, a filter under automation recomputes them every sample (about 3x the cost).
export function kRate(b) {
  for (const k of ['frequency', 'Q', 'gain', 'detune']) { try { b[k].automationRate = 'k-rate'; } catch { /* fixed rate */ } }
  return b;
}

class Live {
  constructor(eng) {
    this.eng = eng;
    this.ctx = eng.ctx;
    this.out = this.g(1);
    this._srcs = [];
    this.busy = 0;
    this.tied = false;
  }
  g(v = 0) { const n = this.ctx.createGain(); n.gain.value = v; return n; }
  bq(type, f, q = 0.707, gain = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
    return kRate(b);
  }
  osc(w, f) {
    const o = this.ctx.createOscillator();
    if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w);
    o.frequency.value = f;
    this._srcs.push(o);
    return o;
  }
  loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    this._srcs.push(s);
    return s;
  }
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }
  start() {
    const t = this.ctx.currentTime;
    for (const s of this._srcs) {
      if (s.buffer) s.start(t, this.eng.random() * s.buffer.duration * 0.9);
      else s.start(t);
    }
  }
  // Cancel automation from t on (an overlapping note took over the line).
  cancel(t, params) { for (const p of params) p.cancelScheduledValues(t); }
  dispose(when) {
    const t = Math.max(when, this.ctx.currentTime);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    let first = true;
    for (const s of this._srcs) {
      try { s.stop(t + 0.4); } catch { /* already stopped */ }
      if (first) { s.onended = () => this.out.disconnect(); first = false; }
    }
  }
  at(t) { return Math.max(t, this.ctx.currentTime + 0.004); }
}

// Consonant gestures: voicing dip, fricative noise burst, nasal formants, glides.
const CONS = {
  m: { dur: 0.085, voice: 0.55, nasal: 1 }, n: { dur: 0.07, voice: 0.55, nasal: 1 },
  z: { dur: 0.075, voice: 0.55, fric: 0.1, ff: 4200 }, v: { dur: 0.06, voice: 0.5, fric: 0.05, ff: 2600 },
  w: { dur: 0.06, voice: 0.75, glide: 'u' }, j: { dur: 0.05, voice: 0.8, glide: 'i' }, l: { dur: 0.05, voice: 0.75, glide: 'e' },
  s: { dur: 0.09, voice: 0, fric: 0.16, ff: 5000 }, f: { dur: 0.08, voice: 0, fric: 0.09, ff: 3600 }, h: { dur: 0.07, voice: 0, fric: 0.08, ff: 1700 },
  t: { dur: 0.045, voice: 0, fric: 0.1, ff: 4000, stop: 1 }, k: { dur: 0.05, voice: 0, fric: 0.09, ff: 2500, stop: 1 },
  p: { dur: 0.045, voice: 0, fric: 0.05, ff: 1500, stop: 1 }, d: { dur: 0.04, voice: 0.22, fric: 0.05, ff: 3600, stop: 1 },
  g: { dur: 0.045, voice: 0.22, fric: 0.05, ff: 2300, stop: 1 }, b: { dur: 0.04, voice: 0.22, fric: 0.03, ff: 1200, stop: 1 },
  r: { dur: 0.05, voice: 0.65, tap: 1 },
};

// A formant bank (5 parallel bandpasses with alternating signs plus a low "warmth" path).
class FormantBank {
  constructor(inst, type, { bw = 1, warmth = 0.3, scale = 1 } = {}) {
    this.inst = inst;
    this.type = type;
    this.bwScale = bw;
    this.scale = scale;
    this.in = inst.g(1);
    this.out = inst.g(1);
    this.F = [];
    for (let i = 0; i < 5; i++) {
      const bp = inst.bq('bandpass', 800 + i * 900, 8);
      const gn = inst.g(0);
      this.in.connect(bp); bp.connect(gn); gn.connect(this.out);
      this.F.push({ bp, gn });
    }
    this.h1 = inst.bq('lowpass', 400, 0.7);
    this.h1g = inst.g(warmth);
    this.in.connect(this.h1); this.h1.connect(this.h1g); this.h1g.connect(this.out);
    this.warmth = warmth;
    // Loudness compensation across vowels and pitches (see bankLevel).
    this.norm = inst.g(1);
    this.final = this.norm;
    this.out.connect(this.norm);
    this.ref = bankLevel(vowelAt(type, 'a', 330, scale), 330, warmth, bw);
    this.vowel = 'a';
  }
  set(vowel, t, f0, tc = 0.03) {
    const fm = vowelAt(this.type, vowel, f0, this.scale);
    for (let i = 0; i < 5; i++) {
      const [f, bw, gl] = fm[i];
      const { bp, gn } = this.F[i];
      bp.frequency.setTargetAtTime(f, t, tc);
      bp.Q.setTargetAtTime(f / (bw * this.bwScale), t, tc);
      gn.gain.setTargetAtTime((i % 2 ? -1 : 1) * gl, t, tc);
    }
    this.h1.frequency.setTargetAtTime(Math.min(900, f0 * 1.7), t, tc);
    const lvl = bankLevel(fm, f0, this.warmth, this.bwScale);
    // Mostly (not fully) compensated: a little natural vowel color in loudness is kept.
    this.norm.gain.setTargetAtTime(Math.min(4, Math.pow(this.ref / Math.max(1e-6, lvl), 0.85)), t, tc);
    if (vowel !== 'm') this.vowel = vowel;
  }
}

// Solo singer: white voice, alto, low male drone ('bass' or 'throat'), or a hum.
export class Singer extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.type = o.type || 'white';
    // Calibrated so a singer at level L sits with a fiddle at level L (render-audio inst tests).
    this.level = (o.level ?? 0.5) * 1.8;
    this.vibMax = o.vibDepth ?? 40;
    this.vibMin = o.vibMin ?? 5;
    this.attack = o.attack ?? 0.035;
    this.release = o.release ?? 0.09;
    const wv = o.wave || (this.type === 'white' ? 'glottalPressed' : this.type === 'hum' ? 'glottalSoft' : 'glottal');
    this.src = this.osc(wave(eng, wv), 220);
    this.voicing = this.g(1);
    this.src.connect(this.voicing);
    // Vibrato (with a slightly wandering rate) and jitter.
    this.lfo = this.osc('sine', o.vibRate ?? 5.5);
    this.vib = this.g(0);
    this.chain(this.lfo, this.vib, this.src.detune);
    this.jit = this.loop(eng.jitterBuf);
    this.jitDepth = this.g(o.jitter ?? 8);
    this.chain(this.jit, this.jitDepth, this.src.detune);
    const rateWob = this.g(0.35);
    this.chain(this.jit, rateWob, this.lfo.frequency);
    const shimmer = this.g(o.shimmer ?? 0.05);
    this.chain(this.jit, shimmer, this.voicing.gain);
    // Breath noise through the same formants.
    this.noise = this.loop(eng.noiseBuf);
    this.breath = this.g(o.breath ?? 0.02);
    this.noise.connect(this.breath);
    this.bank = new FormantBank(this, this.type, { bw: o.bw ?? 1.35, warmth: o.warmth ?? 0.32 });
    this.voicing.connect(this.bank.in);
    this.breath.connect(this.bank.in);
    this.post = this.bq('lowpass', o.lp ?? 6000, 0.6);
    this.amp = this.g(0);
    this.chain(this.bank.final, this.post, this.amp, this.out);
    // Consonant noise and inhales bypass the amp envelope.
    this.fricBp = this.bq('bandpass', 4000, 1.6);
    this.fric = this.g(0);
    this.chain(this.noise, this.fricBp, this.fric, this.out);
    this.inBp = this.bq('bandpass', 1500, 0.8);
    this.inhale = this.g(0);
    this.chain(this.noise, this.inBp, this.inhale, this.out);
    this.f0 = 220;
    this.bank.set(o.vowel || 'a', this.ctx.currentTime, 220, 0.001);
    this.start();
  }

  consonant(c, t, f) {
    const k = CONS[c];
    if (!k) return { vt: t, t0: t, voiced: false };
    const t0 = this.at(t - k.dur * 0.55), t1 = t0 + k.dur;
    const vg = this.voicing.gain;
    vg.setTargetAtTime(k.voice, t0, 0.01);
    if (k.tap) { vg.setTargetAtTime(0.25, t0 + 0.018, 0.004); vg.setTargetAtTime(k.voice, t0 + 0.03, 0.006); }
    vg.setTargetAtTime(1, t1, 0.012);
    if (k.fric) {
      const lvl = k.fric * this.level * 1.6;
      const fs = k.stop ? t1 - 0.014 : t0;
      this.fricBp.frequency.setValueAtTime(k.ff, fs);
      this.fric.gain.setTargetAtTime(lvl, fs, 0.005);
      this.fric.gain.setTargetAtTime(0, k.stop ? t1 + 0.004 : t1 - 0.012, 0.01);
    }
    if (k.nasal) this.bank.set('m', t0, f, 0.008);
    if (k.glide) this.bank.set(k.glide, t0, f, 0.01);
    return { vt: k.nasal || k.glide ? t1 - 0.012 : t0 + k.dur * 0.5, t0, voiced: k.voice > 0.3 };
  }

  play(ev, t, dur, sec) {
    t = this.at(t);
    const p = Array.isArray(ev.p) ? ev.p[0] : ev.p;
    const f = mtof(p + (ev.cents || 0) / 100);
    const legato = this.tied;
    const fp = this.src.frequency, amp = this.amp.gain, vd = this.vib.gain;
    if (t < this.busy && !legato) this.cancel(t, [fp, amp, vd]);
    if (ev.breath && !legato) {
      const b0 = this.at(t - 0.42);
      this.inhale.gain.setTargetAtTime(this.level * 0.09 * (ev.v ?? 0.8), b0, 0.09);
      this.inhale.gain.setTargetAtTime(0, this.at(t - 0.08), 0.03);
    }
    let vt = t, at = t;
    if (ev.c && !(legato && ev.c === 'none')) {
      const r = this.consonant(ev.c, t, f);
      vt = r.vt;
      if (r.voiced && !legato) at = r.t0;
    }
    const vowel = ev.vowel || this.bank.vowel;
    if (ev.morph) {
      const step = dur / ev.morph.length;
      ev.morph.forEach((v, i) => this.bank.set(v, vt + i * step, f, i === 0 ? 0.05 : step * 0.35));
    } else this.bank.set(vowel, vt, f, legato ? 0.045 : 0.012);
    // Pitch.
    const start = ev.g != null ? mtof(ev.g) : f;
    if (legato) fp.setTargetAtTime(start, t, ev.slide ? (ev.slideTc ?? 0.085) : 0.022);
    else if (ev.scoop) {
      fp.setValueAtTime(f * semis(-ev.scoop), at);
      fp.setTargetAtTime(f, t + 0.025, ev.scoopTc ?? 0.06);
    } else fp.setValueAtTime(start, at);
    if (ev.g != null) fp.setTargetAtTime(f, t + (ev.gt ?? 0.07), 0.015);
    // Amplitude.
    const pk = this.level * (ev.v ?? 0.8);
    if (!legato) {
      amp.setTargetAtTime(pk, at, ev.soft ? 0.1 : this.attack);
    } else amp.setTargetAtTime(pk, t, 0.06);
    if (dur > 1.3 && !ev.flat) amp.setTargetAtTime(pk * 1.14, t + dur * 0.4, dur * 0.25);
    // Vibrato blooms late in the note.
    vd.setTargetAtTime(this.vibMin, t, 0.05);
    if (dur > 0.45 && ev.vib !== 0) {
      vd.setTargetAtTime(this.vibMax * (ev.vib ?? 1), t + Math.min(0.75, dur * 0.45), Math.max(0.1, dur * 0.18));
    }
    if (ev.bend) for (const [b, bp] of ev.bend) fp.setTargetAtTime(mtof(bp), t + b * sec, ev.bendTc ?? 0.02);
    // End of note.
    const end = t + dur;
    this.tied = !!ev.tie;
    if (!ev.tie) {
      if (ev.fall) {
        fp.setTargetAtTime(f * semis(-ev.fall), this.at(end - 0.05), ev.fallTc ?? 0.13);
        vd.setTargetAtTime(0, this.at(end - 0.06), 0.05);
        amp.setTargetAtTime(0, end + 0.03, ev.rel ?? 0.11);
      } else amp.setTargetAtTime(0, this.at(end - 0.02), ev.rel ?? this.release);
      this.busy = end + 0.2;
    } else this.busy = end;
    this.f0 = f;
  }
}

// A choir section: several singers with their own pitch, timing and vibrato sharing two formant
// banks (so it costs a few singers, not a few choirs). Heterophony comes from per-singer
// lateness, scoops and pitch error, like villagers singing together outdoors.
export class Choir extends Live {
  constructor(eng, o = {}) {
    super(eng);
    const r = eng.rngFor(o.seed || 'choir');
    this.type = o.type || 'alto';
    this.level = o.level ?? 0.22;
    this.loose = o.loose ?? 1;
    const nb = o.banks ?? 2, ns = o.singers ?? 6;
    this.post = this.bq('lowpass', o.lp ?? 5200, 0.6);
    this.chain(this.post, this.out);
    this.noise = this.loop(eng.noiseBuf);
    this.banks = [];
    for (let b = 0; b < nb; b++) {
      const bank = new FormantBank(this, this.type, { bw: o.bw ?? 1.6, warmth: o.warmth ?? 0.3, scale: 0.95 + (b / Math.max(1, nb - 1)) * 0.09 });
      const br = this.g(o.breath ?? 0.03);
      this.chain(this.noise, br, bank.in);
      bank.final.connect(this.post);
      bank.set('a', this.ctx.currentTime, 220, 0.001);
      this.banks.push(bank);
    }
    this.fricBp = this.bq('bandpass', 4000, 1.5);
    this.fric = this.g(0);
    this.chain(this.noise, this.fricBp, this.fric, this.out);
    this.singers = [];
    for (let i = 0; i < ns; i++) {
      const src = this.osc(wave(eng, i % 3 === 0 ? 'glottalPressed' : 'glottal'), 220);
      const lfo = this.osc('sine', r.range(4.8, 6.2));
      const vib = this.g(0);
      this.chain(lfo, vib, src.detune);
      const jit = this.loop(eng.jitterBuf);
      const jd = this.g(r.range(6, 12));
      this.chain(jit, jd, src.detune);
      const amp = this.g(0);
      const voicing = this.g(1);
      this.chain(src, voicing, amp, this.banks[i % nb].in);
      this.singers.push({
        src, vib, amp, voicing, tied: false, busy: 0,
        late: r.range(-0.015, 0.05) * this.loose,
        cents: r.range(-9, 9) * this.loose,
        gain: r.range(0.75, 1.1),
        scoopy: r.range(0, 1),
        r: eng.rngFor(`${o.seed || 'choir'}:${i}`),
      });
    }
    this.start();
  }

  play(ev, t, dur, sec) {
    t = this.at(t);
    const ps = Array.isArray(ev.p) ? ev.p : [ev.p];
    const f0 = mtof(ps[0]);
    let vt = t;
    const k = ev.c ? CONS[ev.c] : null;
    const t0 = k ? this.at(t - k.dur * 0.55) : t;
    if (k) {
      const t1 = t0 + k.dur;
      if (k.fric) {
        const fs = k.stop ? t1 - 0.014 : t0;
        this.fricBp.frequency.setValueAtTime(k.ff, fs);
        this.fric.gain.setTargetAtTime(k.fric * this.level * (ev.v ?? 0.8) * 2.2, fs, 0.006);
        this.fric.gain.setTargetAtTime(0, k.stop ? t1 + 0.004 : t1 - 0.012, 0.012);
      }
      for (const b of this.banks) {
        if (k.nasal) b.set('m', t0, f0, 0.01);
        if (k.glide) b.set(k.glide, t0, f0, 0.012);
      }
      vt = k.nasal || k.glide ? t1 - 0.012 : t0 + k.dur * 0.5;
    }
    const vowel = ev.vowel || this.banks[0].vowel;
    for (const b of this.banks) b.set(vowel, vt, f0, 0.04);
    const n = this.singers.length;
    const use = ev.singers ?? n;
    for (let i = 0; i < n; i++) {
      const s = this.singers[i];
      if (i >= use) {
        if (s.busy > t || s.tied) { s.amp.gain.setTargetAtTime(0, t, 0.08); s.tied = false; s.busy = t; }
        continue;
      }
      const p = ps[i % ps.length] + (ev.cents || 0) / 100;
      const late = ev.tight ? s.late * 0.3 : s.late;
      const ts = this.at(t + late + s.r.range(-0.012, 0.012) * this.loose);
      const err = (s.cents + s.r.range(-6, 6) * this.loose) / 100;
      const f = mtof(p + err);
      const fp = s.src.frequency, amp = s.amp.gain, vd = s.vib.gain;
      const legato = s.tied;
      if (ts < s.busy && !legato) this.cancel(ts, [fp, amp, vd]);
      if (k && k.voice < 0.9) {
        s.voicing.gain.setTargetAtTime(k.voice, this.at(t0 + late), 0.01);
        s.voicing.gain.setTargetAtTime(1, this.at(t0 + late + k.dur), 0.012);
      }
      if (legato) fp.setTargetAtTime(f, ts, ev.slide ? 0.09 : 0.03);
      else if ((ev.scoop || s.scoopy > 0.7) && !ev.tight) {
        fp.setValueAtTime(f * semis(-(ev.scoop || 1.5)), ts);
        fp.setTargetAtTime(f, ts + 0.03, 0.07);
      } else fp.setValueAtTime(f, ts);
      const pk = this.level * (ev.v ?? 0.8) * s.gain;
      if (!legato) {
        amp.setTargetAtTime(pk, ts, ev.soft ? 0.12 : 0.05);
      } else amp.setTargetAtTime(pk, ts, 0.07);
      vd.setTargetAtTime(4, ts, 0.06);
      if (dur > 0.5) vd.setTargetAtTime((ev.vib ?? 1) * 26, ts + Math.min(0.8, dur * 0.5), dur * 0.2);
      if (ev.bend) for (const [b, bp] of ev.bend) fp.setTargetAtTime(mtof(bp + err), ts + b * sec, 0.03);
      const end = ts + dur + s.r.range(-0.03, 0.06) * this.loose;
      s.tied = !!ev.tie;
      if (!ev.tie) {
        if (ev.fall) {
          fp.setTargetAtTime(f * semis(-ev.fall * s.r.range(0.7, 1.2)), this.at(end - 0.05), 0.15);
          amp.setTargetAtTime(0, end + 0.02, 0.12);
        } else amp.setTargetAtTime(0, this.at(end - 0.02), ev.rel ?? 0.12);
        s.busy = end + 0.2;
      } else s.busy = end;
    }
  }
}

// Bowed village fiddle: Helmholtz-like sawtooth with a bow-position comb, body resonances,
// bow noise, delayed vibrato, slides, double stops on an open string, tremolo and scrapes.
export class Fiddle extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.level = (o.level ?? 0.32) * 0.85;
    this.src = this.osc(wave(eng, 'fiddle'), 440);
    this.voicing = this.g(1);
    this.src.connect(this.voicing);
    this.lfo = this.osc('sine', o.vibRate ?? 6.0);
    this.vib = this.g(0);
    this.chain(this.lfo, this.vib, this.src.detune);
    this.jit = this.loop(eng.jitterBuf);
    this.chain(this.jit, this.g(3.5), this.src.detune);
    this.dbl = this.osc(wave(eng, 'fiddle'), 293.66);
    this.chain(this.jit, this.g(3), this.dbl.detune);
    this.dblAmp = this.g(0);
    this.dbl.connect(this.dblAmp);
    this.noise = this.loop(eng.noiseBuf);
    this.bowBp = this.bq('bandpass', 2600, 0.9);
    this.bow = this.g(0);
    this.chain(this.noise, this.bowBp, this.bow);
    // Body.
    this.body = this.bq('highpass', 190, 0.7);
    const p1 = this.bq('peaking', 290, 2.5, 5), p2 = this.bq('peaking', 470, 3, 3), p3 = this.bq('peaking', 1150, 2, 2);
    const p4 = this.bq('peaking', 1650, 2, -4), p5 = this.bq('peaking', 2700, 1.2, 3), lp = this.bq('lowpass', o.lp ?? 5600, 0.7);
    this.amp = this.g(0);
    this.voicing.connect(this.body);
    this.dblAmp.connect(this.body);
    this.bow.connect(this.body);
    this.chain(this.body, p1, p2, p3, p4, p5, lp, this.amp, this.out);
    this.tremLfo = this.osc('sine', 11);
    this.trem = this.g(0);
    this.chain(this.tremLfo, this.trem, this.amp.gain);
    this.start();
  }

  play(ev, t, dur, sec) {
    t = this.at(t);
    const f = mtof((Array.isArray(ev.p) ? ev.p[0] : ev.p) + (ev.cents || 0) / 100);
    const fp = this.src.frequency, amp = this.amp.gain, vd = this.vib.gain;
    const legato = this.tied;
    if (t < this.busy && !legato) this.cancel(t, [fp, amp, vd, this.bow.gain, this.voicing.gain]);
    const pk = this.level * (ev.v ?? 0.75);
    const start = ev.g != null ? mtof(ev.g) : f;
    if (legato) fp.setTargetAtTime(start, t, ev.slide ? 0.07 : 0.012);
    else if (ev.scoop) { fp.setValueAtTime(f * semis(-ev.scoop), t); fp.setTargetAtTime(f, t + 0.02, 0.05); }
    else fp.setValueAtTime(start, t);
    if (ev.g != null) fp.setTargetAtTime(f, t + (ev.gt ?? 0.06), 0.01);
    // Bow: each new bow stroke has a scratchy start, a legato change only a small one.
    const bowLvl = ev.scrape ? 0.55 : 0.05;
    this.bow.gain.setTargetAtTime(pk * (legato ? 0.09 : 0.22), t, 0.006);
    this.bow.gain.setTargetAtTime(pk * bowLvl, t + 0.05, 0.04);
    this.bowBp.frequency.setTargetAtTime(ev.scrape ? 4200 : 2600, t, 0.02);
    this.voicing.gain.setTargetAtTime(ev.scrape ? 0.25 : 1, t, 0.02);
    if (!legato) {
      amp.setTargetAtTime(pk, t, ev.stacc ? 0.012 : ev.soft ? 0.09 : 0.03);
    } else amp.setTargetAtTime(pk, t, 0.04);
    if (dur > 1 && !ev.stacc) amp.setTargetAtTime(pk * 1.15, t + dur * 0.35, dur * 0.3);
    this.trem.gain.setTargetAtTime(ev.trem ? pk * 0.6 : 0, t, 0.03);
    vd.setTargetAtTime(0, t, 0.03);
    if (dur > 0.35 && ev.vib !== 0) vd.setTargetAtTime(18 * (ev.vib ?? 1), t + Math.min(0.28, dur * 0.4), 0.15);
    if (ev.dbl != null) {
      this.dbl.frequency.setValueAtTime(mtof(ev.dbl), t);
      this.dblAmp.gain.setTargetAtTime(0.45, t, 0.03);
    } else this.dblAmp.gain.setTargetAtTime(0, t, 0.05);
    if (ev.bend) for (const [b, bp] of ev.bend) fp.setTargetAtTime(mtof(bp), t + b * sec, ev.bendTc ?? 0.012);
    const end = t + dur;
    this.tied = !!ev.tie;
    if (!ev.tie) {
      if (ev.fall) fp.setTargetAtTime(f * semis(-ev.fall), this.at(end - 0.08), 0.1);
      amp.setTargetAtTime(0, this.at(end - 0.02), ev.stacc ? 0.02 : ev.rel ?? 0.07);
      this.bow.gain.setTargetAtTime(0, this.at(end - 0.02), 0.03);
      this.dblAmp.gain.setTargetAtTime(0, end, 0.06);
      this.busy = end + 0.15;
    } else this.busy = end;
  }
}

// Wooden flute: soft fundamental, breath noise that tracks the pitch, chiff on attacks, a
// breathy tremolo rather than a bright vibrato.
export class Flute extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.level = o.level ?? 0.3;
    this.hissAmt = o.hiss ?? 0.06;
    this.chiff = o.chiff ?? 1.1;
    this.src = this.osc(wave(eng, 'flute'), 587);
    this.voicing = this.g(1);
    this.src.connect(this.voicing);
    this.lfo = this.osc('sine', o.vibRate ?? 4.9);
    this.vib = this.g(0);
    this.chain(this.lfo, this.vib, this.src.detune);
    this.trem = this.g(0);
    this.lfo.connect(this.trem);
    this.jit = this.loop(eng.jitterBuf);
    this.chain(this.jit, this.g(4), this.src.detune);
    this.noise = this.loop(eng.noiseBuf);
    this.brBp = this.bq('bandpass', 1200, 1.3);
    this.br = this.g(0);
    this.chain(this.noise, this.brBp, this.br);
    this.hiss = this.g(0);
    this.chain(this.noise, this.bq('highpass', 2200, 0.7), this.bq('lowpass', 5200, 0.7), this.hiss);
    this.post = this.bq('lowpass', o.lp ?? 5200, 0.6);
    this.amp = this.g(0);
    this.voicing.connect(this.post);
    this.br.connect(this.post);
    this.hiss.connect(this.post);
    this.chain(this.post, this.amp, this.out);
    this.trem.connect(this.amp.gain);
    this.start();
  }

  play(ev, t, dur, sec) {
    t = this.at(t);
    const f = mtof((Array.isArray(ev.p) ? ev.p[0] : ev.p) + (ev.cents || 0) / 100);
    const fp = this.src.frequency, amp = this.amp.gain;
    const legato = this.tied;
    if (t < this.busy && !legato) this.cancel(t, [fp, amp, this.br.gain, this.hiss.gain, this.trem.gain]);
    const pk = this.level * (ev.v ?? 0.7);
    const start = ev.g != null ? mtof(ev.g) : f;
    if (legato) fp.setTargetAtTime(start, t, ev.slide ? 0.06 : 0.01);
    else if (ev.scoop) { fp.setValueAtTime(f * semis(-ev.scoop), t); fp.setTargetAtTime(f, t + 0.02, 0.05); }
    else fp.setValueAtTime(start, t);
    if (ev.g != null) fp.setTargetAtTime(f, t + (ev.gt ?? 0.05), 0.008);
    this.brBp.frequency.setTargetAtTime(f * 2, t, 0.01);
    // Chiff: a breath burst on tongued attacks.
    this.br.gain.setTargetAtTime(pk * (legato ? 0.4 : this.chiff), t, 0.005);
    this.br.gain.setTargetAtTime(pk * 0.22, t + 0.05, 0.05);
    this.hiss.gain.setTargetAtTime(pk * this.hissAmt, t, 0.02);
    if (!legato) {
      amp.setTargetAtTime(pk, t, ev.soft ? 0.08 : 0.025);
    } else amp.setTargetAtTime(pk, t, 0.03);
    this.trem.gain.setTargetAtTime(0, t, 0.03);
    this.vib.gain.setTargetAtTime(0, t, 0.03);
    if (dur > 0.5 && ev.vib !== 0) {
      this.trem.gain.setTargetAtTime(pk * 0.12 * (ev.vib ?? 1), t + dur * 0.35, 0.2);
      this.vib.gain.setTargetAtTime(9 * (ev.vib ?? 1), t + dur * 0.35, 0.2);
    }
    if (ev.bend) for (const [b, bp] of ev.bend) fp.setTargetAtTime(mtof(bp), t + b * sec, ev.bendTc ?? 0.008);
    const end = t + dur;
    this.tied = !!ev.tie;
    if (!ev.tie) {
      if (ev.fall) fp.setTargetAtTime(f * semis(-ev.fall), this.at(end - 0.06), 0.08);
      amp.setTargetAtTime(0, this.at(end - 0.02), ev.rel ?? 0.06);
      this.br.gain.setTargetAtTime(0, end, 0.04);
      this.hiss.gain.setTargetAtTime(0, end, 0.04);
      this.busy = end + 0.15;
    } else this.busy = end;
  }
}

// Hurdy-gurdy: a melody string pair on the keys, two drone strings, and the trompette whose
// buzzing bridge is struck rhythmically by wrist strokes on the crank (event type 'buzz').
// The crank's slight speed wobble pumps the whole instrument a little (event type 'crank').
export class Gurdy extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.level = o.level ?? 0.25;
    const w = wave(eng, 'gurdy');
    this.m1 = this.osc(w, 440);
    this.m2 = this.osc(w, 440);
    this.m2.detune.value = 5;
    this.mel = this.g(0);
    this.m1.connect(this.mel);
    this.m2.connect(this.mel);
    this.d1 = this.osc(w, 146.83);
    this.d2 = this.osc(w, 220);
    this.drone = this.g(0);
    this.d1.connect(this.drone);
    this.d2.connect(this.drone);
    this.tOsc = this.osc(wave(eng, 'buzz'), 293.66);
    this.tBp = this.bq('bandpass', 1900, 0.8);
    this.tAmp = this.g(0);
    this.chain(this.tOsc, this.tBp, this.tAmp);
    this.noise = this.loop(eng.noiseBuf);
    this.tNoise = this.g(0);
    this.chain(this.noise, this.bq('bandpass', 3100, 1.1), this.tNoise);
    this.wheel = this.g(0);
    this.chain(this.noise, this.bq('bandpass', 2300, 0.7), this.wheel);
    this.jit = this.loop(eng.jitterBuf);
    const jd = this.g(4);
    this.jit.connect(jd);
    for (const s of [this.m1, this.m2, this.d1, this.d2, this.tOsc]) jd.connect(s.detune);
    this.body = this.bq('highpass', 110, 0.7);
    const p1 = this.bq('peaking', 330, 2, 2.5), p2 = this.bq('peaking', 1050, 1.8, 4.5), p3 = this.bq('peaking', 2400, 2, 1.5);
    const lp = this.bq('lowpass', o.lp ?? 5000, 0.7);
    this.main = this.g(1);
    for (const n of [this.mel, this.drone, this.tAmp, this.tNoise, this.wheel]) n.connect(this.body);
    this.chain(this.body, p1, p2, p3, lp, this.main, this.out);
    this.crank = this.osc('sine', 1.2);
    this.crankDepth = this.g(0.06);
    this.chain(this.crank, this.crankDepth, this.main.gain);
    this.droneOn = false;
    this.start();
  }

  play(ev, t, dur, sec) {
    t = this.at(t);
    if (ev.type === 'drone') {
      const ps = ev.p || [50, 57];
      if (ev.on === false) {
        this.drone.gain.setTargetAtTime(0, t, ev.fade ?? 0.3);
        this.wheel.gain.setTargetAtTime(0, t, ev.fade ?? 0.3);
        this.droneOn = false;
        return;
      }
      this.d1.frequency.setValueAtTime(mtof(ps[0]), t);
      this.d2.frequency.setValueAtTime(mtof(ps[1] ?? ps[0] + 7), t);
      this.tOsc.frequency.setValueAtTime(mtof(ev.trompette ?? ps[0] + 12), t);
      const lvl = this.level * (ev.v ?? 0.6) * 0.55;
      this.drone.gain.setTargetAtTime(lvl, t, ev.fade ?? 0.25);
      this.wheel.gain.setTargetAtTime(lvl * 0.05, t, 0.3);
      this.droneOn = true;
      return;
    }
    if (ev.type === 'crank') {
      this.crank.frequency.setTargetAtTime(ev.rate ?? 1, t, 0.2);
      this.crankDepth.gain.setTargetAtTime(ev.depth ?? 0.06, t, 0.2);
      return;
    }
    if (ev.type === 'buzz') {
      const v = this.level * (ev.v ?? 0.6);
      const len = Math.min(dur * 0.85, ev.len ?? 0.11);
      this.tAmp.gain.setTargetAtTime(v * 0.75, t, 0.004);
      this.tNoise.gain.setTargetAtTime(v * 0.18, t, 0.004);
      this.tAmp.gain.setTargetAtTime(0, t + len, 0.035);
      this.tNoise.gain.setTargetAtTime(0, t + len * 0.7, 0.025);
      return;
    }
    const f = mtof(Array.isArray(ev.p) ? ev.p[0] : ev.p);
    const legato = this.tied;
    const mg = this.mel.gain;
    if (t < this.busy && !legato) this.cancel(t, [mg, this.m1.frequency, this.m2.frequency]);
    const start = ev.g != null ? mtof(ev.g) : f;
    for (const o of [this.m1, this.m2]) {
      if (legato || ev.slide) o.frequency.setTargetAtTime(start, t, ev.slide ? 0.05 : 0.005);
      else o.frequency.setValueAtTime(start, t);
      if (ev.g != null) o.frequency.setTargetAtTime(f, t + (ev.gt ?? 0.05), 0.005);
      if (ev.bend) for (const [b, bp] of ev.bend) o.frequency.setTargetAtTime(mtof(bp), t + b * sec, 0.005);
    }
    const pk = this.level * (ev.v ?? 0.7) * 0.6;
    if (!legato) mg.setTargetAtTime(pk, t, 0.012);
    else mg.setTargetAtTime(pk, t, 0.02);
    const end = t + dur;
    this.tied = !!ev.tie;
    if (!ev.tie) {
      mg.setTargetAtTime(0, this.at(end - 0.015), ev.rel ?? 0.03);
      this.busy = end + 0.1;
    } else this.busy = end;
  }
}

// Musical wind: noise through narrow resonant bandpasses tuned to chord tones, plus a broad
// body. Used under the prologue so the blizzard itself seems to sing in D.
export class WindTone extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.level = o.level ?? 0.5;
    this.noise = this.loop(eng.pinkBuf);
    this.sum = this.g(1);
    this.res = [];
    for (let i = 0; i < 4; i++) {
      const bp = this.bq('bandpass', 300, 40);
      const gn = this.g(0);
      this.chain(this.noise, bp, gn, this.sum);
      this.res.push({ bp, gn });
    }
    this.bodyBp = this.bq('bandpass', 420, 0.8);
    this.body = this.g(0);
    this.chain(this.noise, this.bodyBp, this.body, this.sum);
    this.amp = this.g(1);
    this.chain(this.sum, this.bq('lowpass', 3000, 0.6), this.amp, this.out);
    this.start();
  }
  play(ev, t, dur) {
    t = this.at(t);
    const tc = ev.fade ?? dur * 0.3;
    const ps = ev.p ? (Array.isArray(ev.p) ? ev.p : [ev.p]) : [];
    this.res.forEach(({ bp, gn }, i) => {
      const p = ps[i];
      if (p == null) { gn.gain.setTargetAtTime(0, t, tc); return; }
      bp.frequency.setTargetAtTime(mtof(p), t, Math.min(tc, 1.5));
      bp.Q.setTargetAtTime(ev.q ?? 45, t, 0.5);
      gn.gain.setTargetAtTime(this.level * (ev.v ?? 0.6) * (i === 0 ? 12 : 9), t, tc);
    });
    this.body.gain.setTargetAtTime(this.level * (ev.body ?? 0.15), t, tc);
    this.bodyBp.frequency.setTargetAtTime(ev.bodyF ?? 420, t, tc);
  }
}

// Drone: a soft held chord of up to three pitches under the exploration moods, the cheapest sustained voice here (no
// noise, no formants, one filter). Each pitch is a pair of oscillators a few cents apart, beating slowly like two
// strings; a slow bellows swell moves the level. Only control events play it:
//   { type: 'drone', p: [38, 45], v, fade, glide, lp }   sound these pitches (or glide to them)
//   { type: 'drone', on: false, fade }                    fade out
export class Drone extends Live {
  constructor(eng, o = {}) {
    super(eng);
    this.level = o.level ?? 0.3;
    const w = wave(eng, o.wave || 'drone');
    const beat = o.beat ?? 1.2;
    const jd = this.g(o.drift ?? 2.5);
    this.chain(this.loop(eng.jitterBuf), jd);
    this.mix = this.g(0.75);
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      const a = this.osc(w, 73.42), b = this.osc(w, 73.42);
      a.detune.value = -beat * (1 + 0.25 * i);
      b.detune.value = beat * (1 + 0.4 * i);
      jd.connect(a.detune);
      // The second string much softer than the first, so the beating is a shimmer, not a tremolo.
      const gb = this.g(0.3);
      const gn = this.g(0);
      a.connect(gn); b.connect(gb); gb.connect(gn); gn.connect(this.mix);
      this.slots.push({ a, b, gn, on: false });
    }
    this.lp = this.bq('lowpass', o.lp ?? 1000, 0.5);
    this.amp = this.g(0);
    this.chain(this.mix, this.lp, this.amp, this.out);
    this.lfo = this.osc('sine', o.breathRate ?? 0.085);
    this.lfoDepth = this.g(0);
    this.chain(this.lfo, this.lfoDepth, this.amp.gain);
    this.start();
  }

  play(ev, t) {
    if (ev.type !== 'drone') return;
    t = this.at(t);
    const fade = ev.fade ?? 1.5;
    if (ev.on === false) {
      this.amp.gain.setTargetAtTime(0, t, fade);
      this.lfoDepth.gain.setTargetAtTime(0, t, fade);
      for (const s of this.slots) s.on = false;
      return;
    }
    const ps = Array.isArray(ev.p) ? ev.p : [ev.p ?? 38];
    const sounding = this.slots.some((s) => s.on);
    this.slots.forEach((s, i) => {
      const p = ps[i];
      if (p == null) { s.gn.gain.setTargetAtTime(0, t, fade); s.on = false; return; }
      const f = mtof(p);
      // A pitch that was silent starts where it is going; a sounding one glides there.
      for (const o of [s.a, s.b]) {
        if (s.on) o.frequency.setTargetAtTime(f, t, ev.glide ?? 0.5);
        else o.frequency.setValueAtTime(f, t);
      }
      // The root carries; upper pitches sit under it.
      s.gn.gain.setTargetAtTime(i === 0 ? 1 : i === 1 ? 0.6 : 0.42, t, sounding ? fade : 0.02);
      s.on = true;
    });
    const lvl = this.level * (ev.v ?? 0.6);
    this.amp.gain.setTargetAtTime(lvl, t, fade);
    this.lfoDepth.gain.setTargetAtTime(lvl * (ev.breath ?? 0.16), t, fade);
    if (ev.lp) this.lp.frequency.setTargetAtTime(ev.lp, t, Math.max(0.5, fade));
  }
}
