// The bus graph. Everything ends in master -> limiter -> soft clip -> destination, so nothing
// can clip whatever the game throws at it.
//
//   moods  -> moodDuck --+                      (stingers bypass moodDuck so they sit on top)
//   stingers ------------+-> music -> musicDuck -> master
//   music reverb sends ---> musicVerb (tracks music volume and duck) -> hall
//   sfx     -> sfxVol  -> master        sfx sends -> sfxVerb -> env split
//   ambience-> ambVol  -> master        amb sends -> ambVerb -> env split
//   env split -> room | hall | cave convolvers (crossfaded by environment) -> master
import { makeIR } from './reverb.js';

export class Mixer {
  constructor(ctx, { volumes } = {}) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.vol = { master: 0.9, music: 0.75, sfx: 0.9, ambience: 0.8, ...(volumes || {}) };

    // Limiter: fast, high ratio. The compressor adds its own makeup gain (spec behavior), which
    // the master gain accounts for. A gentle shaper after it catches lookahead overshoots.
    this.master = g(this.vol.master);
    // DC and subsonic guard (noise beds can drift), then the limiter.
    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = 'highpass';
    this.dcBlock.frequency.value = 18;
    this.dcBlock.Q.value = 0.6;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -7;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.22;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClipCurve();
    this.clip.oversample = '2x';
    this.master.connect(this.dcBlock);
    this.dcBlock.connect(this.limiter);
    this.limiter.connect(this.clip);
    this.clip.connect(ctx.destination);
    this.out = this.clip;

    // Reverbs.
    this.verbs = {};
    for (const kind of ['hall', 'room', 'cave']) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      const [L, R] = makeIR(ctx.sampleRate, kind);
      const buf = ctx.createBuffer(2, L.length, ctx.sampleRate);
      buf.copyToChannel(L, 0);
      buf.copyToChannel(R, 1);
      conv.buffer = buf;
      const ret = g(kind === 'hall' ? 1 : 0.9);
      conv.connect(ret);
      ret.connect(this.master);
      this.verbs[kind] = { conv, ret };
    }

    // Music. A gentle bus EQ: synthesized folk instruments pile up around 300 Hz (fundamentals
    // of the fiddle, voice and zither chords), so dip that a little and lift the presence.
    this.music = g(this.vol.music);
    this.musicDuck = g(1);
    const eq = (type, f, q, gain) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    this.musicEq = [eq('peaking', 300, 0.9, -2.5), eq('highshelf', 3500, 0.7, 2)];
    this.music.connect(this.musicEq[0]);
    this.musicEq[0].connect(this.musicEq[1]);
    this.musicEq[1].connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    this.moodIn = g(1);
    this.moodDuck = g(1);
    this.moodIn.connect(this.moodDuck);
    this.moodDuck.connect(this.music);
    this.stingerIn = g(1);
    this.stingerIn.connect(this.music);
    // Reverb send path mirrors the dry path's gains so ducks and volumes apply to the tail too.
    this.moodVerbIn = g(1);
    this.moodVerbDuck = g(1);
    this.moodVerbIn.connect(this.moodVerbDuck);
    this.musicVerbIn = g(1);
    this.moodVerbDuck.connect(this.musicVerbIn);
    this.musicVerbVol = g(this.vol.music);
    this.musicVerbDuck = g(1);
    this.musicVerbIn.connect(this.musicVerbVol);
    this.musicVerbVol.connect(this.musicVerbDuck);
    this.musicVerbDuck.connect(this.verbs.hall.conv);

    // SFX and ambience with environment reverb.
    this.envSplit = g(1);
    this.envSends = {};
    for (const kind of ['hall', 'room', 'cave']) {
      const s = g(kind === 'hall' ? 1 : 0);
      this.envSplit.connect(s);
      s.connect(this.verbs[kind].conv);
      this.envSends[kind] = s;
    }
    this.environment = 'hall';
    this.sfx = g(this.vol.sfx);
    this.sfx.connect(this.master);
    this.sfxVerb = g(this.vol.sfx);
    this.sfxVerb.connect(this.envSplit);
    this.amb = g(this.vol.ambience);
    // Distant murmur, animals and wind pile up in the low mids; dip them like the music bus.
    this.ambEq = ctx.createBiquadFilter();
    this.ambEq.type = 'peaking';
    this.ambEq.frequency.value = 320;
    this.ambEq.Q.value = 0.9;
    this.ambEq.gain.value = -3;
    this.amb.connect(this.ambEq);
    this.ambEq.connect(this.master);
    this.ambVerb = g(this.vol.ambience);
    this.ambVerb.connect(this.envSplit);
    // Busses that need a one-node entry point.
    this.sfxIn = g(1);
    this.sfxIn.connect(this.sfx);
    this.sfxVerbIn = g(1);
    this.sfxVerbIn.connect(this.sfxVerb);
    this.ambIn = g(1);
    this.ambIn.connect(this.amb);
    this.ambVerbIn = g(1);
    this.ambVerbIn.connect(this.ambVerb);

    this._duckUntil = 0;
    this._duckHold = 0;
  }

  now() { return this.ctx.currentTime; }

  setVolume(key, v) {
    v = Math.max(0, Math.min(1.5, Number(v) || 0));
    this.vol[key] = v;
    const t = this.now();
    const set = (node) => node.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'master') set(this.master);
    else if (key === 'music') { set(this.music); set(this.musicVerbVol); }
    else if (key === 'sfx') { set(this.sfx); set(this.sfxVerb); }
    else if (key === 'ambience') { set(this.amb); set(this.ambVerb); }
  }

  // Lower the music (and its reverb) by `amount` (0..1). With seconds > 0 it recovers on its
  // own; with no seconds it holds until duck(0).
  duck(amount = 0.5, seconds) {
    const t = this.now();
    const target = Math.max(0.03, 1 - Math.max(0, Math.min(1, amount)));
    for (const n of [this.musicDuck, this.musicVerbDuck]) {
      n.gain.cancelScheduledValues(t);
      n.gain.setValueAtTime(n.gain.value, t);
      n.gain.setTargetAtTime(target, t, amount > 0 ? 0.12 : 0.5);
      if (seconds > 0 && amount > 0) n.gain.setTargetAtTime(1, t + seconds, 0.6);
    }
  }

  // Dip the moods under a stinger without touching the stinger itself.
  stingerDuck(when, length, amount = 0.45) {
    for (const n of [this.moodDuck, this.moodVerbDuck]) {
      n.gain.setTargetAtTime(1 - amount, when, 0.08);
      n.gain.setTargetAtTime(1, when + length, 0.9);
    }
  }

  // Crossfade the environment reverb: 'hall' outdoors, 'room' interiors, 'cave' in the ice cave.
  setEnvironment(kind = 'hall', seconds = 0.8) {
    if (!this.envSends[kind]) kind = 'hall';
    if (kind === this.environment) return;
    this.environment = kind;
    const t = this.now();
    for (const [k, s] of Object.entries(this.envSends)) s.gain.setTargetAtTime(k === kind ? 1 : 0, t, seconds / 3);
  }

  analyser() {
    if (!this._an) {
      this._an = this.ctx.createAnalyser();
      this._an.fftSize = 2048;
      this.clip.connect(this._an);
    }
    return this._an;
  }
}

// Linear to about 0.85, then a smooth knee that never exceeds 0.985.
function softClipCurve() {
  const n = 4096, c = new Float32Array(n), knee = 0.85, ceil = 0.985;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}
