// G.audio: music director, instruments, SFX and ambience (docs/ARCHITECTURE.md "Audio").
//
//   G.audio.unlock()                          call from a user gesture (also auto on first click/key)
//   G.audio.setMood(name, { fade = 3 })       DESIGN 6.2 moods; 'silence' stops music. Crossfades on bar lines
//   G.audio.stinger(name)                     'discover' | 'quest' | 'echo' | 'danger' | 'choice' | 'death' | 'reveal'
//   G.audio.sfx(name, { pos, volume, pitch }) one-shot, positional if pos given; names in sfxNames.js
//   const h = G.audio.loop(name, { pos, volume, follow })  h.setPos(v), h.setVolume(v), h.stop(fade)
//   G.audio.duck(amount, seconds)             lower music under dialogue (no seconds: hold until duck(0))
//   G.audio.volumes = { master, music, sfx, ambience, voice }   (each 0..1; also settable one at a time)
//   G.voice (also G.audio.voice)              voice-over player, see src/audio/voice.js and docs/VOICES.md
//   G.audio.setEnvironment('hall' | 'room' | 'cave')     reverb space and muffled outdoors for interiors
//   G.audio.mood, G.audio.ready, G.audio.info(), G.audio.stats() (output buffer, dropouts; ?audiolatency= to change it)
// Events emitted: 'music:mood' { mood }, 'music:lyric' { mood, line, text } (procession subtitles).
//
// Before unlock every call is a safe no-op (setMood and loops are remembered and start on unlock).
// Shot mode (G.shot) never creates an AudioContext.
import { ORDER } from '../core/G.js';
import { createEngine } from './engine.js';
import { MOODS } from './sfxNames.js';
import { Voice } from './voice.js';

const VOL_KEY = 'marzena.audio.volumes';
const DEFAULT_VOL = { master: 0.9, music: 0.75, sfx: 0.9, ambience: 0.8, voice: 1 };

class FacadeLoop {
  constructor(a, name, o) {
    this.a = a;
    this.name = name;
    this.o = { ...o };
    if (o.pos) this.o.pos = { x: o.pos.x, y: o.pos.y ?? 0, z: o.pos.z };
    this.h = null;
    this.stopped = false;
  }
  attach(eng) { if (!this.stopped && !this.h) this.h = eng.sfx.loop(this.name, this.o); }
  setPos(v) { this.o.pos = { x: v.x, y: v.y ?? 0, z: v.z }; this.h?.setPos(v); }
  setVolume(v) { this.o.volume = v; this.h?.setVolume(v); }
  stop(fade = 0.5) { this.stopped = true; this.a._loops.delete(this); this.h?.stop(fade); }
  get playing() { return !!this.h?.playing; }
}

class AudioFacade {
  constructor(G) {
    this.G = G;
    this.ready = false;
    this.ctx = null;
    this.eng = null;
    this.mood = 'silence';
    this._want = null;
    this._loops = new Set();
    this._space = 'hall';
    this._vol = { ...DEFAULT_VOL, ...loadVolumes() };
    const self = this;
    this._volProxy = {};
    for (const k of Object.keys(DEFAULT_VOL)) {
      Object.defineProperty(this._volProxy, k, {
        enumerable: true,
        get: () => self._vol[k],
        set: (v) => { self._setVol(k, v); },
      });
    }
    this._dir = null;
  }

  get volumes() { return this._volProxy; }
  set volumes(v) {
    for (const k of Object.keys(DEFAULT_VOL)) if (v && v[k] != null) this._setVol(k, v[k]);
  }
  _setVol(k, v) {
    this._vol[k] = Math.max(0, Math.min(1, Number(v) || 0));
    this.eng?.mixer.setVolume(k, this._vol[k]);
    if (k === 'voice') this.voice?.setVolume(this._vol[k]);
    try { localStorage.setItem(VOL_KEY, JSON.stringify(this._vol)); } catch { /* storage blocked */ }
  }

  unlock() {
    if (this.G.shot) return Promise.resolve(false);
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return Promise.resolve(this.ready);
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    try {
      // A 40 ms output buffer: with the 10 ms 'interactive' one, any moment the audio thread waits longer than that for
      // the CPU (a loaded laptop, the GPU driver busy) is a gap in the music. 40 ms of latency is not felt in play.
      // ?audiolatency=interactive|balanced|playback|<seconds> overrides it.
      const lat = new URLSearchParams(location.search).get('audiolatency');
      this.ctx = new AC({ latencyHint: lat ? (Number.isFinite(+lat) ? +lat : lat) : 0.04 });
      this.ctx.resume?.().catch(() => {});
      this.eng = createEngine(this.ctx, {
        volumes: this._vol,
        quality: this.G.quality,
        env: () => this._env(),
        emit: (n, p) => this.G.events.emit(n, p),
      });
    } catch (e) {
      console.error('[audio] unlock failed', e);
      this.G.errors.push(`audio: ${e.message}`);
      return Promise.resolve(false);
    }
    this.ready = true;
    this.eng.mixer.setEnvironment(this._space, 0.01);
    if (this._want) this.eng.director.setMood(this._want.name, { fade: this._want.fade });
    for (const h of this._loops) h.attach(this.eng);
    // Bake every SFX variant (worker) and every sampled music note (idle slices) so first plays
    // never stall.
    setTimeout(() => { this.eng?.sfx.prebake(); this.eng?.director.prebake(); }, 1200);
    return Promise.resolve(true);
  }

  setMood(name, { fade = 3 } = {}) {
    if (!MOODS.includes(name)) { console.warn(`[audio] unknown mood "${name}"`); return; }
    this.mood = name;
    if (!this.ready) { this._want = { name, fade }; return; }
    this.eng.director.setMood(name, { fade });
  }

  stinger(name) { if (this.ready) this.eng.director.stinger(name); }

  sfx(name, opts = {}) { return this.ready ? this.eng.sfx.play(name, opts) : null; }

  loop(name, opts = {}) {
    const h = new FacadeLoop(this, name, opts);
    this._loops.add(h);
    if (this.ready) h.attach(this.eng);
    return h;
  }

  // Output buffer and dropouts so far (playoutStats needs Chrome with --enable-blink-features=AudioContextPlayoutStats).
  stats() {
    const c = this.ctx, p = c?.playoutStats;
    return c ? { state: c.state, rate: c.sampleRate, baseLatency: c.baseLatency, outputLatency: c.outputLatency, dropouts: p ? p.fallbackFramesEvents : null, dropoutMs: p ? p.fallbackFramesDuration : null } : null;
  }

  duck(amount = 0.5, seconds) { if (this.ready) this.eng.mixer.duck(amount, seconds); }

  setEnvironment(kind = 'hall') {
    this._space = kind || 'hall';
  }

  info() {
    if (!this.ready) return { ready: false, mood: this.mood };
    return { ready: true, state: this.ctx.state, ...this.eng.director.info(), voices: this.eng.sfx.count, loops: this.eng.sfx.loops.size, bankMB: +(this.eng.bank.bytes / 1048576).toFixed(1), bakeMs: Math.round(this.eng.bank.bakeMs) };
  }

  _env() {
    const G = this.G, U = G.uniforms, p = G.camera?.position;
    if (this.envOverride) return { ...this._baseEnv(p, U), ...this.envOverride };
    return this._baseEnv(p, U);
  }
  _baseEnv(p, U) {
    const G = this.G;
    const h = G.time?.hours ?? 12;
    const fromHour = Math.max(smooth(17.5, 19.5, h), 1 - smooth(5, 7, h));
    return {
      pos: p ? { x: p.x, y: p.y, z: p.z } : null,
      wind: U?.uWind?.value.z ?? 0.25,
      gust: U?.uWind?.value.w ?? 0,
      weather: G.weather?.state || 'clear',
      hour: h,
      night: Math.max(U?.uNight?.value ?? 0, fromHour),
      space: this._space,
      thawed: !!G.world?.thawed,
      lakeSDF: G.world?.lakeSDF,
    };
  }

  update(dt) {
    if (!this.ready) return;
    const cam = this.G.camera;
    if (cam) {
      const d = this._dir || (this._dir = new this.G.THREE.Vector3());
      cam.getWorldDirection(d);
      const q = cam.quaternion;
      // Camera up vector from its quaternion (rotate +Y).
      const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
      this.eng.sfx.setListener(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, ux, uy, uz);
    }
    this.eng.tick(dt);
  }
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function loadVolumes() {
  try { return JSON.parse(localStorage.getItem(VOL_KEY) || '{}') || {}; } catch { return {}; }
}

export async function init(G) {
  const audio = new AudioFacade(G);
  G.audio = audio;
  // Voice-over: inert until the audio context exists and a voice/manifest.json is found.
  audio.voice = G.voice = new Voice(G);
  if (G.shot) return;
  audio.voice.warm();
  G.addSystem('voice', () => audio.voice.tick(), ORDER.late + 1);
  G.addSystem('audio', (dt) => audio.update(dt), ORDER.late);
  // Fallback unlock on the first gesture, in case nobody calls unlock() explicitly.
  const gesture = () => {
    audio.unlock();
    if (audio.ready) for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, gesture, true);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, gesture, true);
  G.events.on('dialogue:start', () => audio.duck(0.55));
  G.events.on('dialogue:end', () => audio.duck(0));
  document.addEventListener('visibilitychange', () => {
    if (!audio.ctx) return;
    if (document.hidden) audio.ctx.suspend().catch(() => {});
    else audio.ctx.resume().catch(() => {});
  });
}
