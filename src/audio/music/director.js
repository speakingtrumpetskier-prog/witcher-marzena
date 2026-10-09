// Music director. Each mood is a composition whose score generator yields bars; a Player pulls
// bars just ahead of the audio clock (lookahead) and turns notes into instrument automation.
// Mood changes crossfade on the outgoing mood's next bar line (or beat line when a bar line is
// too far away). Stingers are short finite scores on their own bus that dip the moods a little.
import { Singer, Choir, Fiddle, Flute, Gurdy, WindTone } from '../instruments/live.js';
import { Sampler, sampleKeys } from '../instruments/baked.js';
import { MOOD_DEFS } from './moods/index.js';
import { STINGER_DEFS } from './stingers.js';

const LOOKAHEAD = 1.4;

export function createInstrument(eng, spec) {
  switch (spec.inst) {
    case 'singer': return new Singer(eng, spec);
    case 'choir': return new Choir(eng, spec);
    case 'fiddle': return new Fiddle(eng, spec);
    case 'flute': return new Flute(eng, spec);
    case 'gurdy': return new Gurdy(eng, spec);
    case 'wind': return new WindTone(eng, spec);
    default: return new Sampler(eng, spec.inst, spec);
  }
}

class Part {
  constructor(player, name, spec) {
    const ctx = player.eng.ctx;
    this.ctx = ctx;
    this.spec = spec;
    this.inst = createInstrument(player.eng, { seed: `${player.name}:${name}`, ...spec });
    this.gain = ctx.createGain();
    this.gain.gain.value = spec.gain ?? 1;
    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = spec.pan ?? 0;
    this.send = ctx.createGain();
    this.send.gain.value = spec.verb ?? 0.25;
    this.inst.out.connect(this.gain);
    this.gain.connect(this.pan);
    this.pan.connect(player.dry);
    this.pan.connect(this.send);
    this.send.connect(player.wet);
  }
  play(ev, t, d, sec) {
    const now = this.ctx.currentTime;
    if (ev.type === 'level') { this.gain.gain.setTargetAtTime((this.spec.gain ?? 1) * ev.v, Math.max(t, now), ev.ramp ?? 0.6); return; }
    if (ev.type === 'pan') { this.pan.pan.setTargetAtTime(ev.v, Math.max(t, now), ev.ramp ?? 0.5); return; }
    if (ev.type === 'verb') { this.send.gain.setTargetAtTime(ev.v, Math.max(t, now), ev.ramp ?? 0.5); return; }
    this.inst.play(ev, t, d, sec);
  }
  dispose(t) { this.inst.dispose(t); }
}

class Player {
  constructor(eng, name, def, at, fadeIn, stinger = false) {
    this.eng = eng;
    this.name = name;
    this.def = def;
    const ctx = eng.ctx, mx = eng.mixer;
    this.level = def.level ?? 1;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.fadeStart = at;
    this.fadeEnd = at + Math.max(0.02, fadeIn);
    for (const g of [this.dry, this.wet]) {
      g.gain.value = 0;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(this.level, this.fadeEnd);
    }
    this.dry.connect(stinger ? mx.stingerIn : mx.moodIn);
    this.wet.connect(stinger ? mx.musicVerbIn : mx.moodVerbIn);
    this.parts = {};
    this.r = eng.rngFor(`mood:${name}`, true);
    this.gen = def.score(this.r);
    this.nextBar = at;
    this.endAt = Infinity;
    this.disposeAt = Infinity;
    this.recent = [];
    this.bar = 0;
    this.done = false;
    this.section = '';
  }

  part(name) {
    if (this.parts[name]) return this.parts[name];
    const spec = this.def.parts[name];
    if (!spec) { this.eng.warnOnce(`music: mood ${this.name} has no part ${name}`); return null; }
    return (this.parts[name] = new Part(this, name, spec));
  }

  schedule(until) {
    while (!this.done && this.nextBar < until && this.nextBar < this.endAt - 1e-4) {
      const it = this.gen.next();
      if (it.done) {
        this.done = true;
        this.disposeAt = this.nextBar + (this.def.tail ?? 5);
        break;
      }
      this.playBar(it.value);
    }
  }

  playBar(bar) {
    const sec = 60 / (bar.tempo || this.def.tempo || 60);
    const start = this.nextBar;
    for (const ev of bar.notes) {
      const p = this.part(ev.part);
      if (!p) continue;
      const t = start + ev.t * sec + (ev.type ? 0 : this.r.bi() * 0.004);
      p.play(ev, t, (ev.d ?? 0.5) * sec, sec);
    }
    this.recent.push({ start, sec, beats: bar.beats });
    if (this.recent.length > 8) this.recent.shift();
    if (bar.lyric) this.eng.at(start, () => this.eng.emit('music:lyric', { mood: this.name, ...bar.lyric }));
    if (bar.section) this.section = bar.section;
    this.nextBar = start + bar.beats * sec;
    this.bar++;
  }

  // The first bar line at or after t (within maxWait), else the first beat line, else t.
  lineAfter(t, maxWait = 2.6) {
    const lines = this.recent.map((b) => b.start).concat([this.nextBar]);
    for (const s of lines) if (s >= t && s <= t + maxWait) return s;
    for (const b of this.recent) {
      for (let k = 0; k <= b.beats; k++) {
        const s = b.start + k * b.sec;
        if (s >= t && s <= t + 1.2) return s;
      }
    }
    return t;
  }

  valueAt(t) {
    if (t <= this.fadeStart) return 0;
    if (t >= this.fadeEnd) return this.level;
    return (this.level * (t - this.fadeStart)) / (this.fadeEnd - this.fadeStart);
  }

  stop(at, fade) {
    this.endAt = at;
    const v = this.valueAt(at);
    for (const g of [this.dry, this.wet]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(v, at);
      g.gain.linearRampToValueAtTime(0, at + Math.max(0.05, fade));
    }
    this.disposeAt = at + Math.max(0.05, fade) + 0.3;
  }

  dispose() {
    const t = this.eng.ctx.currentTime;
    for (const p of Object.values(this.parts)) p.dispose(t);
    // Disconnect the busses once reverb and sample tails are gone.
    this.eng.at(t + 6, () => { this.dry.disconnect(); this.wet.disconnect(); });
  }
}

export class Director {
  constructor(eng) {
    this.eng = eng;
    this.players = [];
    this.active = null;
    this.mood = 'silence';
  }

  setMood(name, { fade = 3 } = {}) {
    if (name === this.mood) return;
    const def = name === 'silence' ? null : MOOD_DEFS[name];
    if (name !== 'silence' && !def) { this.eng.warnOnce(`audio: unknown mood "${name}"`); return; }
    const now = this.eng.ctx.currentTime;
    const cur = this.active;
    let at = now + 0.05;
    if (cur) {
      at = cur.lineAfter(now + 0.08);
      cur.stop(at, fade);
    }
    this.mood = name;
    this.active = null;
    if (def) {
      const fadeIn = cur ? (def.fadeIn ?? fade) : (def.fadeIn ?? 0.05);
      this.active = new Player(this.eng, name, def, at, fadeIn);
      this.players.push(this.active);
      this.active.schedule(now + LOOKAHEAD);
    }
    this.eng.emit('music:mood', { mood: name, at });
  }

  stinger(name) {
    const def = STINGER_DEFS[name];
    if (!def) { this.eng.warnOnce(`audio: unknown stinger "${name}"`); return; }
    const now = this.eng.ctx.currentTime;
    // Land on the playing mood's next beat when it is close, so the stinger feels composed in.
    let at = now + 0.03;
    if (this.active) {
      const b = this.active.lineAfter(now + 0.03, 0);
      if (b - now < 0.3) at = b;
    }
    const p = new Player(this.eng, `stinger:${name}`, def, at, 0.01, true);
    this.players.push(p);
    p.schedule(now + 30);
    this.eng.mixer.stingerDuck(at, def.duck ?? 3, def.duckAmount ?? 0.4);
  }

  tick() {
    const now = this.eng.ctx.currentTime;
    for (const p of this.players) p.schedule(now + LOOKAHEAD);
    if (this.players.some((p) => now > p.disposeAt)) {
      this.players = this.players.filter((p) => {
        if (now > p.disposeAt) { p.dispose(); return false; }
        return true;
      });
    }
  }

  // Dry-run every mood's score (cheap: just note objects) to find the sampled notes it will
  // need, and bake them in idle time so no frame ever waits for a bell or a zither string.
  prebake(bars = 140) {
    const items = new Map();
    const defs = { ...MOOD_DEFS, ...Object.fromEntries(Object.entries(STINGER_DEFS).map(([k, v]) => [`stinger:${k}`, v])) };
    for (const [name, def] of Object.entries(defs)) {
      const gen = def.score(this.eng.rngFor(`prebake:${name}`));
      for (let b = 0; b < bars; b++) {
        const it = gen.next();
        if (it.done) break;
        for (const ev of it.value.notes) {
          const spec = def.parts[ev.part];
          if (!spec || ev.type || ['singer', 'choir', 'fiddle', 'flute', 'gurdy', 'wind'].includes(spec.inst)) continue;
          for (const [key, fn] of sampleKeys(spec.inst, ev)) if (!items.has(key)) items.set(key, fn);
        }
      }
    }
    const bank = this.eng.bank;
    if (bank.worker) for (const key of items.keys()) bank.request(key, { kind: 'music', rate: bank.rate });
    else bank.prebake([...items]);
    return items.size;
  }

  info() {
    const a = this.active;
    return { mood: this.mood, section: a?.section || '', bar: a?.bar || 0, players: this.players.length };
  }
}
