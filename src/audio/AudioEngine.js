/**
 * AudioEngine.js
 *
 * Web Audio API-based audio engine for the Witcher Marzena 3D experience.
 * Provides ambient drone layers, mood transitions, and synthesized sound effects
 * (footsteps, door creaks, sword draws, magic, environmental ambience, etc.).
 *
 * Extracted from witcher-marzena-3d.jsx
 */

// ─── AUDIO ENGINE (Web Audio API) ───────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.layers = {};
    this.master = null;
    this.currentMood = "silence";
  }

  async start() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.09;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Drone layers: each is a set of sine oscillators through a lowpass filter
      this.layers.village  = this._drone([110, 131, 165],       320, 0.12);
      this.layers.night    = this._drone([82.4, 98, 123.5],     180, 0.10);
      this.layers.forest   = this._drone([73.4, 87.3, 110],     250, 0.11);
      this.layers.clearing = this._drone([220, 277.2, 330, 440],600, 0.07);
      this.layers.tension  = this._drone([110, 155.6],           200, 0.04); // tritone
      this.layers.ending   = this._drone([165, 220, 330],        500, 0.06);
      this.layers.sorrow   = this._drone([98, 130.8, 164.8],    300, 0.07); // kill ending
      this.layers.transcend= this._drone([220, 293.7, 370, 440],800, 0.06); // bind ending
      this.layers.wind     = this._noise(160, 0.03);
      this.started = true;
    } catch(e) { console.warn("Audio init failed:", e); }
  }

  _drone(freqs, filterFreq, maxVol) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0.001;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    gain.connect(filter);
    filter.connect(this.master);
    freqs.forEach(f => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 8;
      osc.connect(gain);
      osc.start();
    });
    return { gain, filter, maxVol };
  }

  _noise(filterFreq, maxVol) {
    const size = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) {
      d[i] = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      last = d[i];
      d[i] *= 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.001;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    src.connect(gain); gain.connect(filter); filter.connect(this.master);
    src.start();
    return { gain, filter, maxVol };
  }

  setMood(mood, fade = 3.5) {
    if (!this.started || mood === this.currentMood) return;
    this.currentMood = mood;
    const now = this.ctx.currentTime;
    const presets = {
      village:   { village: 1, wind: 0.4 },
      night:     { night: 1, tension: 0.6, wind: 0.7 },
      forest:    { forest: 1, tension: 0.5, wind: 0.5 },
      clearing:  { clearing: 1 },
      kill:      { sorrow: 1, wind: 0.3 },
      free:      { ending: 1, wind: 0.2 },
      confront:  { night: 0.5, tension: 0.3, wind: 0.6 },
      bind:      { transcend: 1 },
      silence:   {},
    };
    const targets = presets[mood] || {};
    Object.entries(this.layers).forEach(([name, layer]) => {
      const target = (targets[name] || 0) * layer.maxVol;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(Math.max(0.001, target), now + fade);
    });
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }
  stop() { if (this.ctx) { this.setMood("silence", 1); setTimeout(() => { try { this.ctx.close(); } catch(e){} }, 2000); } }

  // ── SOUND EFFECTS (synthesized) ──
  playSFX(type) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sfxGain = this.ctx.createGain();
    sfxGain.connect(this.master);

    if (type === "footstep") {
      // Low thud with noise burst
      sfxGain.gain.setValueAtTime(0.6, now);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(60 + Math.random() * 20, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
      const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
      const nD = nBuf.getChannelData(0);
      for (let i = 0; i < nD.length; i++) nD[i] = (Math.random() * 2 - 1) * 0.3;
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = nBuf;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.4, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      const nFilt = this.ctx.createBiquadFilter();
      nFilt.type = "lowpass"; nFilt.frequency.value = 400;
      nSrc.connect(nGain); nGain.connect(nFilt); nFilt.connect(this.master);
      osc.connect(sfxGain);
      osc.start(now); osc.stop(now + 0.15);
      nSrc.start(now); nSrc.stop(now + 0.1);
    } else if (type === "door_creak") {
      // Pitched sine sweep with harmonics
      sfxGain.gain.setValueAtTime(0.3, now);
      sfxGain.gain.linearRampToValueAtTime(0.5, now + 0.15);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      [1, 2.2, 3.7].forEach(mult => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(320 * mult, now);
        osc.frequency.linearRampToValueAtTime(180 * mult, now + 0.3);
        osc.frequency.linearRampToValueAtTime(400 * mult, now + 0.5);
        osc.frequency.linearRampToValueAtTime(200 * mult, now + 0.7);
        const g = this.ctx.createGain();
        g.gain.value = 0.15 / mult;
        osc.connect(g); g.connect(sfxGain);
        osc.start(now); osc.stop(now + 0.75);
      });
    } else if (type === "interact") {
      // Soft chime / witcher senses ping
      sfxGain.gain.setValueAtTime(0.4, now);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      [660, 880, 1320].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, now + i * 0.06);
        g.gain.linearRampToValueAtTime(0.25 - i * 0.06, now + i * 0.06 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(g); g.connect(sfxGain);
        osc.start(now + i * 0.06); osc.stop(now + 1.3);
      });
    } else if (type === "sword_draw") {
      // Metallic scrape
      sfxGain.gain.setValueAtTime(0.5, now);
      sfxGain.gain.linearRampToValueAtTime(0.7, now + 0.15);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
      const nD = nBuf.getChannelData(0);
      for (let i = 0; i < nD.length; i++) nD[i] = (Math.random() * 2 - 1);
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = nBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass"; filt.frequency.value = 3000; filt.Q.value = 8;
      filt.frequency.linearRampToValueAtTime(6000, now + 0.4);
      nSrc.connect(filt); filt.connect(sfxGain);
      nSrc.start(now); nSrc.stop(now + 0.85);
    } else if (type === "yrden") {
      // Low magical hum building
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.6, now + 0.8);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      [110, 165, 220, 330].forEach(f => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.detune.value = Math.random() * 10 - 5;
        const g = this.ctx.createGain();
        g.gain.value = 0.12;
        osc.connect(g); g.connect(sfxGain);
        osc.start(now); osc.stop(now + 2.6);
      });
    } else if (type === "whisper") {
      // Eerie filtered noise
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.3, now + 0.4);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const nD = nBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < nD.length; i++) { nD[i] = (last + 0.02 * (Math.random()*2-1))/1.02; last = nD[i]; nD[i] *= 2; }
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = nBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass"; filt.frequency.value = 800; filt.Q.value = 3;
      filt.frequency.linearRampToValueAtTime(1200, now + 0.5);
      filt.frequency.linearRampToValueAtTime(600, now + 1.5);
      nSrc.connect(filt); filt.connect(sfxGain);
      nSrc.start(now); nSrc.stop(now + 2);
    } else if (type === "fire_crackle") {
      // Hearth fire crackling (for elder hall / indoor scenes)
      sfxGain.gain.setValueAtTime(0.2, now);
      sfxGain.gain.linearRampToValueAtTime(0.25, now + 0.5);
      for (let c = 0; c < 6; c++) {
        const t = c * 0.4 + Math.random() * 0.2;
        const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
        const nD = nBuf.getChannelData(0);
        for (let i = 0; i < nD.length; i++) nD[i] = (Math.random() * 2 - 1) * 0.4;
        const nSrc = this.ctx.createBufferSource(); nSrc.buffer = nBuf;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.15 + Math.random() * 0.1, now + t);
        g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.1);
        const filt = this.ctx.createBiquadFilter();
        filt.type = "highpass"; filt.frequency.value = 800 + Math.random() * 600;
        nSrc.connect(g); g.connect(filt); filt.connect(sfxGain);
        nSrc.start(now + t); nSrc.stop(now + t + 0.12);
      }
    } else if (type === "wind_gust") {
      // Wind howl for outdoor night scenes
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.35, now + 0.8);
      sfxGain.gain.linearRampToValueAtTime(0.15, now + 1.5);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
      const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
      const nD = nBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < nD.length; i++) { nD[i] = (last + 0.02*(Math.random()*2-1))/1.02; last = nD[i]; nD[i] *= 3; }
      const nSrc = this.ctx.createBufferSource(); nSrc.buffer = nBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass"; filt.frequency.value = 300; filt.Q.value = 1.5;
      filt.frequency.linearRampToValueAtTime(500, now + 1);
      filt.frequency.linearRampToValueAtTime(200, now + 2.5);
      nSrc.connect(filt); filt.connect(sfxGain);
      nSrc.start(now); nSrc.stop(now + 3.2);
    } else if (type === "loom_rhythm") {
      // Weaving room: repeating pattern for ~25s
      // shuttle clack + frame thud + thread tension creak, looped
      sfxGain.gain.setValueAtTime(0.5, now);
      sfxGain.gain.setValueAtTime(0.5, now + 22);
      sfxGain.gain.linearRampToValueAtTime(0.001, now + 25);
      const beatLen = 1.3; // one full loom cycle
      for (let rep = 0; rep < 18; rep++) {
        const base = rep * beatLen;
        // 1. Frame thud (heavy, low)
        const thud = this.ctx.createOscillator();
        thud.type = "sine";
        thud.frequency.setValueAtTime(70, now + base);
        thud.frequency.exponentialRampToValueAtTime(35, now + base + 0.15);
        const tG = this.ctx.createGain();
        tG.gain.setValueAtTime(0.4, now + base);
        tG.gain.exponentialRampToValueAtTime(0.001, now + base + 0.2);
        thud.connect(tG); tG.connect(sfxGain);
        thud.start(now + base); thud.stop(now + base + 0.25);

        // 2. Shuttle clack (sharp, wooden, higher pitched) offset by half beat
        const clackT = base + beatLen * 0.45;
        const clackBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
        const clD = clackBuf.getChannelData(0);
        for (let i = 0; i < clD.length; i++) clD[i] = (Math.random() * 2 - 1) * 0.5;
        const clSrc = this.ctx.createBufferSource(); clSrc.buffer = clackBuf;
        const clG = this.ctx.createGain();
        clG.gain.setValueAtTime(0.35, now + clackT);
        clG.gain.exponentialRampToValueAtTime(0.001, now + clackT + 0.06);
        const clF = this.ctx.createBiquadFilter();
        clF.type = "bandpass"; clF.frequency.value = 2000 + (rep % 3) * 300; clF.Q.value = 3;
        clSrc.connect(clG); clG.connect(clF); clF.connect(sfxGain);
        clSrc.start(now + clackT); clSrc.stop(now + clackT + 0.08);

        // 3. Thread tension creak (every 3rd beat, subtle)
        if (rep % 3 === 0) {
          const creakT = base + beatLen * 0.7;
          const creak = this.ctx.createOscillator();
          creak.type = "sine";
          creak.frequency.setValueAtTime(400 + rep * 10, now + creakT);
          creak.frequency.linearRampToValueAtTime(280, now + creakT + 0.2);
          const crG = this.ctx.createGain();
          crG.gain.setValueAtTime(0.08, now + creakT);
          crG.gain.exponentialRampToValueAtTime(0.001, now + creakT + 0.25);
          creak.connect(crG); crG.connect(sfxGain);
          creak.start(now + creakT); creak.stop(now + creakT + 0.3);
        }
      }
    } else if (type === "child_hum") {
      // Eerie childlike humming for children scene
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.2, now + 0.5);
      sfxGain.gain.linearRampToValueAtTime(0.15, now + 1.5);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      const notes = [330, 294, 330, 262];
      notes.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 20;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, now + i * 0.5);
        g.gain.linearRampToValueAtTime(0.08, now + i * 0.5 + 0.1);
        g.gain.linearRampToValueAtTime(0.06, now + i * 0.5 + 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.5 + 0.5);
        osc.connect(g); g.connect(sfxGain);
        osc.start(now + i * 0.5); osc.stop(now + i * 0.5 + 0.55);
      });
    } else if (type === "well_water") {
      // Water dripping / sloshing for the well/confrontation scene
      sfxGain.gain.setValueAtTime(0.3, now);
      for (let d = 0; d < 3; d++) {
        const t = d * 0.7 + Math.random() * 0.3;
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200 + Math.random() * 400, now + t);
        osc.frequency.exponentialRampToValueAtTime(400, now + t + 0.15);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.2, now + t);
        g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
        osc.connect(g); g.connect(sfxGain);
        osc.start(now + t); osc.stop(now + t + 0.25);
      }
    } else if (type === "medallion") {
      // Witcher medallion vibration / hum
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.5, now + 0.15);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sine"; osc1.frequency.value = 440;
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sine"; osc2.frequency.value = 443; // beating
      const g1 = this.ctx.createGain(); g1.gain.value = 0.15;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.15;
      osc1.connect(g1); g1.connect(sfxGain);
      osc2.connect(g2); g2.connect(sfxGain);
      osc1.start(now); osc1.stop(now + 1.6);
      osc2.start(now); osc2.stop(now + 1.6);
    } else if (type === "magic_burst") {
      // Clearing reveal / magic surge
      sfxGain.gain.setValueAtTime(0.01, now);
      sfxGain.gain.linearRampToValueAtTime(0.7, now + 0.3);
      sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      [220, 330, 440, 554, 660].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.linearRampToValueAtTime(f * 1.5, now + 1.0);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, now + i * 0.04);
        g.gain.linearRampToValueAtTime(0.12, now + i * 0.04 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        osc.connect(g); g.connect(sfxGain);
        osc.start(now + i * 0.04); osc.stop(now + 2.1);
      });
    }
  }


export default AudioEngine;
