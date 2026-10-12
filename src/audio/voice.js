// Voice player (G.voice, also G.audio.voice). Plays pre-rendered voice lines made offline by
// scripts/voice/generate.py (see docs/VOICES.md). Everything here is optional and failure-proof:
// no manifest, no file, no audio context, a decode error or a slow network all mean "this line
// is unvoiced", and the caller carries on exactly as it did before voices existed.
//
//   const line = await G.voice.prepare('hanka', text)   -> VoiceLine | null  (fetches and decodes)
//   line.dur                                            seconds of audio (the subtitle should last this plus VOICE_TAIL)
//   line.play({ character, at, duck, volume })          start now; character drives the jaw from the voice's loudness
//   line.stop(fade)                                     early stop (skip, dialogue end)
//   G.voice.canVoice(speaker, text)                     sync: is there a clip for this line right now
//   G.voice.prefetch(speaker, text) / prefetchNodes(def, nodeId, { depth, max, self })
//   G.voice.bark(npc, text)                             positional bark in a stable villager voice, fire and forget
//   G.voice.say(speaker, text, opts)                    prepare + play, for one-off lines (Vesna's exploration barks)
//   G.voice.stopAll(fade)                               stop spoken lines (not barks)
//   G.voice.report()                                    { entries, loaded, played, missing: [...] } for debugging
//
// Lines are found by lineHash(speaker, text) (src/audio/voiceKey.js) in voice/manifest.json:
//   { "<hash>": { "file": "voice/<speaker>/<hash>.mp3", "dur": 2.4, "speaker": "hanka", "text": "..." } }
//
// Audio graph: source -> [analyser tap] -> [air lowpass -> panner for barks] -> voice bus -> master
// (the limiter lives on master), plus a small send into the environment reverb so voices sit in
// the same room as the effects. While a spoken line plays the music is ducked (mixer.duck) and the
// ambience bed is lowered through the mixer's ambIn / ambVerbIn gain nodes.
//
// URL: ?novoice disables it, ?voicebase=/some/path/ loads voice/manifest.json and the clips from
// another folder laid out like public/, ?voicelog logs every line that has no clip.
import { lineHash, canonSpeaker } from './voiceKey.js';

export const VOICE_TAIL = 0.45;     // seconds a voiced subtitle lingers after the audio ends
const VOICE_TRIM = 0.75;            // bus trim: the clips are -18 LUFS and the master limiter sits at -7 dB
const DUCK_MUSIC = 0.45;            // how far the music drops under speech (0..1)
const DUCK_AMB = 0.5;               // ambience gain while someone speaks
const BARK_SEND = 0.25;
const CACHE_SECONDS = 150;          // decoded audio kept in memory
const FETCH_TIMEOUT = 1500;         // ms a scene waits for a clip before playing the line silently
const MALE = ['villager_m1', 'villager_m2', 'villager_m3'];
const FEMALE = ['villager_f1', 'villager_f2'];
const CHILD = ['child_f1', 'child_m1'];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function withTimeout(p, ms) {
  let t;
  const timer = new Promise((resolve) => { t = setTimeout(() => resolve(null), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

export class Voice {
  constructor(G) {
    this.G = G;
    this.enabled = !G.params?.has?.('novoice');
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    let root = G.params?.get?.('voicebase') || envBase;
    if (!root.endsWith('/')) root += '/';
    this.root = root;
    this.volume = 1;
    this.log = !!G.params?.has?.('voicelog');
    this.stats = { played: 0, missing: 0, failed: 0, fetched: 0 };
    this.missing = new Map();
    this._manifest = null;
    this._manifestP = null;
    this._cache = new Map();     // file -> { buf, t }
    this._pending = new Map();   // file -> Promise<AudioBuffer | null>
    this._bad = new Set();       // files that failed to load or decode
    this._active = new Set();
    this._ducking = 0;
    this._bus = null;
    this._tbuf = new Float32Array(512);
    this._clock = 0;
  }

  // ---- state -----------------------------------------------------------------------------
  get ctx() { const a = this.G.audio; return a?.ready && a.ctx ? a.ctx : null; }
  get mixer() { return this.G.audio?.eng?.mixer || null; }
  get ready() { return this.enabled && !!this.ctx; }
  get loaded() { return this._manifest != null; }
  get entries() { return this._manifest ? Object.keys(this._manifest).length : 0; }

  setVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1.5);
    const bus = this._bus;
    if (bus && this.ctx) bus.gain.setTargetAtTime(this.volume * VOICE_TRIM, this.ctx.currentTime, 0.05);
  }

  // Start loading the manifest (idempotent). Resolves to the manifest object (empty when absent).
  warm() {
    if (!this.enabled) return Promise.resolve({});
    if (!this._manifestP) {
      this._manifestP = (async () => {
        try {
          const res = await fetch(`${this.root}voice/manifest.json`, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`manifest ${res.status}`);
          const j = await res.json();
          this._manifest = j && typeof j === 'object' && !Array.isArray(j) ? j : {};
        } catch {
          this._manifest = {}; // no voices shipped (or a dev server answering with index.html)
        }
        try { this.G.events?.emit?.('voice:manifest', { entries: this.entries }); } catch { /* optional */ }
        return this._manifest;
      })();
    }
    return this._manifestP;
  }

  entry(speaker, text) {
    const m = this._manifest;
    if (!m || !text || !speaker) return null;
    const e = m[lineHash(speaker, text)];
    return e && e.file && !this._bad.has(e.file) ? e : null;
  }

  // Sync check used on hot paths so unvoiced lines never pay for an await.
  canVoice(speaker, text) {
    return this.ready && !!this.entry(speaker, text);
  }

  _miss(speaker, text) {
    this.stats.missing++;
    const key = `${canonSpeaker(speaker)}|${lineHash(speaker, text)}`;
    if (!this.missing.has(key) && this.missing.size < 600) {
      this.missing.set(key, text);
      if (this.log) console.info(`[voice] no clip: ${canonSpeaker(speaker)} "${text}" (${lineHash(speaker, text)})`);
    }
  }

  // ---- loading ---------------------------------------------------------------------------
  _buffer(file) {
    const hit = this._cache.get(file);
    if (hit) { hit.t = ++this._clock; return Promise.resolve(hit.buf); }
    if (this._bad.has(file)) return Promise.resolve(null);
    let p = this._pending.get(file);
    if (p) return p;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    p = (async () => {
      try {
        const res = await fetch(`${this.root}${file}`);
        if (!res.ok) throw new Error(`${file} ${res.status}`);
        const ab = await res.arrayBuffer();
        const buf = await new Promise((resolve, reject) => {
          const r = ctx.decodeAudioData(ab, resolve, reject); // callback form works in old Safari too
          if (r && typeof r.catch === 'function') r.catch(reject);
        });
        this.stats.fetched++;
        this._cache.set(file, { buf, t: ++this._clock });
        this._trim();
        return buf;
      } catch (e) {
        this._bad.add(file);
        this.stats.failed++;
        if (this.log) console.warn('[voice] cannot load', file, e?.message || e);
        return null;
      } finally {
        this._pending.delete(file);
      }
    })();
    this._pending.set(file, p);
    return p;
  }

  _trim() {
    let total = 0;
    for (const v of this._cache.values()) total += v.buf.duration;
    if (total <= CACHE_SECONDS) return;
    const order = [...this._cache.entries()].sort((a, b) => a[1].t - b[1].t);
    for (const [file, v] of order) {
      if (total <= CACHE_SECONDS * 0.8) break;
      if ([...this._active].some((l) => l.buf === v.buf)) continue;
      this._cache.delete(file);
      total -= v.buf.duration;
    }
  }

  prefetch(speaker, text) {
    if (!this.ready) return;
    const go = () => {
      const e = this.entry(speaker, text);
      if (e) this._buffer(e.file);
    };
    if (this._manifest) go(); else this.warm().then(go);
  }

  // Warm the clips for the lines that follow nodeId (static `next` links and each choice's target).
  prefetchNodes(def, nodeId, { depth = 3, max = 6, self = false } = {}) {
    try {
      if (!this.ready || !def?.nodes) return;
      let frontier = [nodeId], n = 0;
      const seen = new Set([nodeId]);
      const first = self ? def.nodes[nodeId] : null;
      if (first && typeof first.t === 'string' && first.s && first.s !== 'narrator') { this.prefetch(first.s, first.t); n++; }
      for (let d = 0; d < depth && frontier.length && n < max; d++) {
        const next = [];
        for (const id of frontier) {
          const node = def.nodes[id];
          if (!node) continue;
          const targets = [];
          if (typeof node.next === 'string') targets.push(node.next);
          if (Array.isArray(node.choices)) for (const c of node.choices) if (typeof c.next === 'string') targets.push(c.next);
          for (const t of targets) {
            if (seen.has(t)) continue;
            seen.add(t);
            const nn = def.nodes[t];
            if (!nn) continue;
            if (typeof nn.t === 'string' && nn.s && nn.s !== 'narrator' && n < max) { this.prefetch(nn.s, nn.t); n++; }
            next.push(t);
          }
        }
        frontier = next;
      }
    } catch { /* prefetch is only an optimization */ }
  }

  // ---- playing ---------------------------------------------------------------------------
  // Resolves to a VoiceLine ready to play, or null (unvoiced, still loading, failed). Never throws.
  async prepare(speaker, text, { timeout = FETCH_TIMEOUT } = {}) {
    try {
      if (!this.ready || !speaker || !text) return null;
      await this.warm();
      const e = this.entry(speaker, text);
      if (!e) { this._miss(speaker, text); return null; }
      const buf = await withTimeout(this._buffer(e.file), timeout);
      if (!buf) return null;
      return new VoiceLine(this, canonSpeaker(speaker), text, e, buf);
    } catch (err) {
      console.warn('[voice] prepare failed', err);
      return null;
    }
  }

  async say(speaker, text, opts = {}) {
    const line = await this.prepare(speaker, text);
    if (line) line.play(opts);
    return line;
  }

  // Which speaker ids can voice a bark of this NPC, best first. A villager keeps the same voice.
  barkVoices(npc) {
    const id = canonSpeaker(npc?.id);
    const preset = String(npc?.preset || npc?.id || '');
    const rot = (list) => { const k = hashId(String(npc?.id)) % list.length; return [...list.slice(k), ...list.slice(0, k)]; };
    let group;
    if (/^(ola|child_)/.test(preset)) group = rot(CHILD);
    else if (/^(fisherman|elder_m)/.test(preset)) group = ['villager_m3', ...rot(MALE.slice(0, 2))];
    else if (/^elder_f/.test(preset)) group = ['villager_f2', 'villager_f1'];
    else if (/^villager_f/.test(preset)) group = rot(FEMALE);
    else group = rot(MALE);
    return [id, ...group];
  }

  // A bark from an NPC: positional, no ducking, silent if there is no clip or a scene is running.
  bark(npc, text) {
    try {
      if (!this.ready || !text || !this._manifest) return null;
      if (this.G.dialogue?.active || this.G.cutscenes?.active) return null;
      const speaker = this.barkVoices(npc).find((s) => this.entry(s, text));
      if (!speaker) { this._miss(npc?.id || 'villager', text); return null; }
      const ch = npc.character || npc._c;
      const at = () => {
        const r = ch?.root?.position;
        return r ? { x: r.x, y: r.y + (ch.height || 1.7) * 0.9, z: r.z } : null;
      };
      return this.prepare(speaker, text, { timeout: 900 }).then((line) => {
        if (!line) return null;
        if (this.G.dialogue?.active || this.G.cutscenes?.active) return null;
        line.bark = true;
        line.play({ at, duck: false, volume: 0.9 });
        return line;
      });
    } catch (e) {
      console.warn('[voice] bark failed', e);
      return null;
    }
  }

  stopAll(fade = 0.12, { barks = false } = {}) {
    for (const l of [...this._active]) if (barks || !l.bark) l.stop(fade);
  }

  report() {
    return { entries: this.entries, loaded: this.loaded, ready: this.ready, ...this.stats, cached: this._cache.size, missing: [...this.missing.values()] };
  }

  // ---- graph -----------------------------------------------------------------------------
  _ensureBus() {
    if (this._bus) return this._bus;
    const ctx = this.ctx, mx = this.mixer;
    if (!ctx || !mx) return null;
    const bus = ctx.createGain();
    const vol = this.G.audio?._vol?.voice;
    if (vol != null) this.volume = clamp(vol, 0, 1.5);
    bus.gain.value = this.volume * VOICE_TRIM;
    bus.connect(mx.master);
    this._send = ctx.createGain();
    this._send.gain.value = 0.16;
    bus.connect(this._send);
    this._send.connect(mx.envSplit);
    this._bus = bus;
    return bus;
  }

  _duckOn(seconds) {
    const mx = this.mixer, ctx = this.ctx;
    if (!mx || !ctx) return;
    this.G.audio?.duck?.(DUCK_MUSIC, seconds + VOICE_TAIL + 0.35); // stays down through the subtitle's tail
    this._ducking++;
    const t = ctx.currentTime;
    for (const n of [mx.ambIn, mx.ambVerbIn]) {
      if (!n) continue;
      n.gain.cancelScheduledValues(t);
      n.gain.setValueAtTime(n.gain.value, t);
      n.gain.setTargetAtTime(DUCK_AMB, t, 0.2);
    }
  }

  _duckOff(early) {
    const mx = this.mixer, ctx = this.ctx;
    this._ducking = Math.max(0, this._ducking - 1);
    if (!mx || !ctx || this._ducking > 0) return;
    const t = ctx.currentTime;
    for (const n of [mx.ambIn, mx.ambVerbIn]) {
      if (!n) continue;
      n.gain.cancelScheduledValues(t);
      n.gain.setValueAtTime(n.gain.value, t);
      n.gain.setTargetAtTime(1, t + (early ? 0.1 : VOICE_TAIL + 0.35), early ? 0.4 : 0.7);
    }
    if (early) this.G.audio?.duck?.(0);
  }

  // Per frame: lip flap from the voice's loudness, bark positions.
  tick() {
    for (const l of this._active) l._tick();
  }
}

export class VoiceLine {
  constructor(voice, speaker, text, entry, buf) {
    this.v = voice;
    this.speaker = speaker;
    this.text = text;
    this.entry = entry;
    this.buf = buf;
    this.bark = false;
    this.playing = false;
    this.finished = false;
    this._nodes = [];
    this.done = new Promise((resolve) => { this._resolve = resolve; });
  }

  get dur() { return this.buf.duration; }

  // opts: character (Character whose jaw follows the voice), at (position or () => position for a
  // positional bark), duck (default true: music and ambience dip), volume.
  play({ character = null, at = null, duck = true, volume = 1 } = {}) {
    const v = this.v;
    if (this.playing || this.finished) return this;
    try {
      const ctx = v.ctx, bus = v._ensureBus();
      if (!ctx || !bus) return this._end();
      const t0 = ctx.currentTime + 0.02;
      const src = ctx.createBufferSource();
      src.buffer = this.buf;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      this._nodes.push(src, g);
      this.src = src;
      this.gain = g;
      let out = g;

      if (character?.anim?.talkS) {
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0;
        g.connect(an);
        this.an = an;
        this.char = character;
        this.peak = 0.05;
        this._nodes.push(an);
      }
      if (at) {
        this.getPos = typeof at === 'function' ? at : () => at;
        const p0 = this.getPos();
        if (p0) {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 9000;
          lp.Q.value = 0.5;
          const pan = ctx.createPanner();
          pan.panningModel = v.G.audio?.eng?.sfx?.hrtf ? 'HRTF' : 'equalpower';
          pan.distanceModel = 'inverse';
          pan.refDistance = 2.2;
          pan.rolloffFactor = 1.2;
          pan.maxDistance = 20000;
          this._setPos(pan, p0);
          out.connect(lp);
          lp.connect(pan);
          pan.connect(bus);
          const s = ctx.createGain();
          s.gain.value = BARK_SEND;
          pan.connect(s);
          s.connect(v.mixer.envSplit);
          this.pan = pan;
          this.lp = lp;
          this._nodes.push(lp, pan, s);
          out = null;
        }
      }
      if (out) out.connect(bus);

      src.onended = () => this._end();
      src.start(t0);
      this.playing = true;
      v._active.add(this);
      v.stats.played++;
      if (duck) { this.ducked = true; v._duckOn(this.dur); }
    } catch (e) {
      console.warn('[voice] play failed', e);
      this._end();
    }
    return this;
  }

  _setPos(pan, p) {
    if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
  }

  _tick() {
    if (!this.playing) return;
    if (this.pan && this.getPos) {
      const p = this.getPos();
      if (p) {
        this._setPos(this.pan, p);
        const l = this.v.G.camera?.position;
        if (l) {
          const d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
          this.lp.frequency.value = clamp(16000 / (1 + d / 10), 900, 9000);
        }
      }
    }
    const ts = this.char?.anim?.talkS;
    if (ts && this.an) {
      const buf = this.v._tbuf;
      this.an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      this.peak = Math.max(rms, this.peak * 0.996);
      const lvl = rms / Math.max(this.peak, 0.04);
      const open = clamp((lvl - 0.22) / 0.55, 0, 1);
      ts.target = Math.pow(open, 0.85);
      ts.narrow = open < 0.45 ? 0.3 * (1 - open / 0.45) : 0;
      ts.next = 0.4; // keeps the animator's random syllable flap from overwriting the target
    }
  }

  stop(fade = 0.1) {
    if (!this.playing || this.finished) return;
    const ctx = this.v.ctx;
    try {
      if (ctx && this.gain) {
        const t = ctx.currentTime;
        this.gain.gain.cancelScheduledValues(t);
        this.gain.gain.setValueAtTime(this.gain.gain.value, t);
        this.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
        this.src.stop(t + fade + 0.05);
      }
    } catch { /* already stopped */ }
    this._end(true);
  }

  _end(early = false) {
    if (this.finished) return this;
    this.finished = true;
    const wasPlaying = this.playing;
    this.playing = false;
    const v = this.v;
    v._active.delete(this);
    const ts = this.char?.anim?.talkS;
    if (ts) { ts.target = 0; ts.next = 0; }
    if (wasPlaying && this.ducked) v._duckOff(early);
    setTimeout(() => {
      for (const n of this._nodes) { try { n.disconnect(); } catch { /* gone */ } }
      this._nodes.length = 0;
    }, early ? 400 : 50);
    this._resolve?.();
    return this;
  }
}
