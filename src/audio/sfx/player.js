// SFX player: one-shots with variants, pitch and level variation, polyphony limits, positional
// panning (PannerNode, listener follows the camera) with air absorption and distance-scaled
// reverb, and virtual loops that only run while the listener is within earshot.
import { RECIPES, LOOPS } from './recipes/index.js';
import { normalize } from '../dsp.js';

const DEF = { variants: 3, gain: 1, ref: 3, max: 80, pitchVar: 0.04, verb: 0.12, poly: 6, cool: 0 };
const LOOP_DEF = { gain: 0.5, ref: 3, max: 40, verb: 0.1 };

const norm = (d) => (Array.isArray(d) ? d.map((c) => normalize(c, 0.89)) : normalize(d, 0.89));

export class SfxPlayer {
  constructor(eng) {
    this.eng = eng;
    this.ctx = eng.ctx;
    this.mx = eng.mixer;
    this.listener = { x: 0, y: 0, z: 0 };
    this.recipes = {};
    this.lastVariant = {};
    this.lastTime = {};
    this.active = {};
    this.loops = new Set();
    this.hrtf = eng.quality === 'high' && !eng.offline;
    this.count = 0;
  }

  recipe(name) {
    if (this.recipes[name]) return this.recipes[name];
    const r = RECIPES[name];
    return r ? (this.recipes[name] = { ...DEF, ...r }) : null;
  }

  buffer(name, rec, i) {
    return this.eng.bank.get(`sfx:${name}:${i}`, (sr, r) => norm(rec.bake(sr, r, i)));
  }

  // Bake every variant of every SFX in idle slices.
  prebake(names = Object.keys(RECIPES)) {
    const items = [];
    for (const name of names) {
      const rec = this.recipe(name);
      if (!rec) continue;
      for (let i = 0; i < rec.variants; i++) items.push([`sfx:${name}:${i}`, (sr, r) => norm(rec.bake(sr, r, i))]);
    }
    for (const [name, l] of Object.entries(LOOPS)) items.push([`loop:${name}`, (sr, r) => norm(l.bake(sr, r))]);
    this.eng.bank.prebake(items);
  }

  setListener(px, py, pz, fx, fy, fz, ux = 0, uy = 1, uz = 0) {
    this.listener.x = px; this.listener.y = py; this.listener.z = pz;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(px, t); L.positionY.setValueAtTime(py, t); L.positionZ.setValueAtTime(pz, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
    } else {
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  dist(p) {
    const l = this.listener;
    return Math.hypot(p.x - l.x, (p.y ?? l.y) - l.y, p.z - l.z);
  }

  // Positional output chain: [air lowpass] -> panner -> dry bus, panner -> send -> reverb bus.
  spatial(node, pos, rec, dist, dry, wet) {
    const ctx = this.ctx;
    const nodes = [];
    if (dist > 12) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(450, Math.min(16000, 16000 / (1 + dist / 28)));
      lp.Q.value = 0.5;
      node.connect(lp);
      node = lp;
      nodes.push(lp);
    }
    const p = ctx.createPanner();
    p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = rec.ref;
    p.rolloffFactor = 1;
    p.maxDistance = 20000;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? this.listener.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y ?? this.listener.y, pos.z);
    node.connect(p);
    p.connect(dry);
    const s = ctx.createGain();
    s.gain.value = Math.min(1, (rec.verb ?? 0.1) + dist / 220);
    p.connect(s);
    s.connect(wet);
    nodes.push(p, s);
    return { panner: p, nodes };
  }

  play(name, o = {}) {
    const rec = this.recipe(name);
    if (!rec) { this.eng.warnOnce(`audio: unknown sfx "${name}"`); return null; }
    const ctx = this.ctx, eng = this.eng;
    const now = ctx.currentTime;
    if (rec.cool && now - (this.lastTime[name] ?? -99) < rec.cool) return null;
    const pos = o.pos && !rec.ui ? o.pos : null;
    const dist = pos ? this.dist(pos) : 0;
    if (pos && dist > rec.max * (o.range ?? 1)) return null;
    const list = this.active[name] || (this.active[name] = []);
    while (list.length >= rec.poly) list.shift().stop();
    let i = o.variant ?? Math.floor(eng.random() * rec.variants);
    if (rec.variants > 1 && o.variant == null && i === this.lastVariant[name]) i = (i + 1) % rec.variants;
    this.lastVariant[name] = i;
    this.lastTime[name] = now;
    const buf = this.buffer(name, rec, i);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.pitch ?? 1) * (1 + (eng.random() * 2 - 1) * rec.pitchVar);
    const g = ctx.createGain();
    g.gain.value = rec.gain * (o.volume ?? 1) * (0.9 + 0.2 * eng.random());
    src.connect(g);
    const amb = o.bus === 'amb';
    const dry = amb ? this.mx.ambIn : this.mx.sfxIn, wet = amb ? this.mx.ambVerbIn : this.mx.sfxVerbIn;
    let nodes = [g];
    if (pos) nodes = nodes.concat(this.spatial(g, pos, rec, dist, dry, wet).nodes);
    else {
      let out = g;
      if (o.pan) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = Math.max(-1, Math.min(1, o.pan));
        g.connect(sp);
        out = sp;
        nodes.push(sp);
      }
      out.connect(dry);
      if (rec.verb) {
        const s = ctx.createGain();
        s.gain.value = rec.verb;
        out.connect(s);
        s.connect(wet);
        nodes.push(s);
      }
    }
    const when = now + Math.max(0, o.delay || 0);
    src.start(when);
    const voice = {
      name, src,
      stop: () => {
        try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.015); src.stop(ctx.currentTime + 0.08); } catch { /* ended */ }
      },
    };
    list.push(voice);
    this.count++;
    src.onended = () => {
      const k = list.indexOf(voice);
      if (k >= 0) list.splice(k, 1);
      for (const n of nodes) n.disconnect();
      this.count--;
    };
    if (rec.extra) rec.extra(this, o);
    return voice;
  }

  loop(name, o = {}) {
    const h = this.bed(name, o);
    if (h) this.loops.add(h);
    return h;
  }

  // An unmanaged loop handle (the ambience starts and stops its beds itself).
  bed(name, o = {}) {
    const def = LOOPS[name];
    if (!def) { this.eng.warnOnce(`audio: unknown loop "${name}"`); return null; }
    return new LoopHandle(this, name, { ...LOOP_DEF, ...def }, o);
  }

  tick(dt) {
    for (const h of this.loops) h.update(dt);
  }
}

class LoopHandle {
  constructor(player, name, rec, o) {
    this.p = player;
    this.name = name;
    this.rec = rec;
    this.pos = null;
    this.follow = o.follow || null;
    if (o.pos) this.pos = { x: o.pos.x, y: o.pos.y ?? 0, z: o.pos.z };
    this.volume = o.volume ?? 1;
    this.bus = o.bus || 'sfx';
    this.live = null;
    this.stopped = false;
    this._v = { x: 0, y: 0, z: 0 };
  }
  get playing() { return !!this.live; }
  setPos(v) {
    if (!this.pos) this.pos = { x: 0, y: 0, z: 0 };
    this.pos.x = v.x; this.pos.y = v.y ?? 0; this.pos.z = v.z;
    const pn = this.live?.panner;
    if (pn) {
      const t = this.p.ctx.currentTime;
      if (pn.positionX) { pn.positionX.setTargetAtTime(v.x, t, 0.03); pn.positionY.setTargetAtTime(v.y ?? 0, t, 0.03); pn.positionZ.setTargetAtTime(v.z, t, 0.03); }
      else pn.setPosition(v.x, v.y ?? 0, v.z);
    }
  }
  setVolume(v) {
    this.volume = v;
    if (this.live) this.live.g.gain.setTargetAtTime(this.rec.gain * v, this.p.ctx.currentTime, 0.12);
  }
  stop(fade = 0.5) {
    this.stopped = true;
    this.p.loops.delete(this);
    this.kill(fade);
  }
  start() {
    const p = this.p, ctx = p.ctx, rec = this.rec;
    const buf = p.eng.bank.get(`loop:${this.name}`, (sr, r) => norm(rec.bake(sr, r)));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rec.gain * this.volume, t + 0.6);
    src.connect(g);
    const amb = this.bus === 'amb';
    const dry = amb ? p.mx.ambIn : p.mx.sfxIn, wet = amb ? p.mx.ambVerbIn : p.mx.sfxVerbIn;
    let nodes = [g], panner = null;
    if (this.pos && !rec.ui) {
      const sp = p.spatial(g, this.pos, rec, Math.min(10, p.dist(this.pos)), dry, wet);
      nodes = nodes.concat(sp.nodes);
      panner = sp.panner;
    } else {
      g.connect(dry);
      if (rec.verb) { const s = ctx.createGain(); s.gain.value = rec.verb; g.connect(s); s.connect(wet); nodes.push(s); }
    }
    src.start(t, p.eng.random() * buf.duration);
    this.live = { src, g, nodes, panner };
  }
  kill(fade = 0.8) {
    const L = this.live;
    if (!L) return;
    this.live = null;
    const t = this.p.ctx.currentTime;
    L.g.gain.cancelScheduledValues(t);
    L.g.gain.setTargetAtTime(0, t, fade / 3);
    L.src.stop(t + fade + 0.1);
    L.src.onended = () => { for (const n of L.nodes) n.disconnect(); };
  }
  update(dt) {
    if (this.stopped) return;
    if (this.follow) {
      const f = this.follow;
      // An Object3D (read its world matrix, no allocation) or anything with x, y, z.
      if (f.matrixWorld) { const e = f.matrixWorld.elements; this._v.x = e[12]; this._v.y = e[13]; this._v.z = e[14]; }
      else { this._v.x = f.x; this._v.y = f.y; this._v.z = f.z; }
      this.setPos(this._v);
    }
    const audible = !this.pos || this.rec.ui || this.p.dist(this.pos) < this.rec.max;
    if (audible && !this.live) this.start();
    else if (!audible && this.live) this.kill(1.2);
    const sp = this.rec.spawn;
    if (sp && this.live && this.p.eng.random() < sp.rate * dt) {
      this.p.play(sp.name, { pos: this.pos, volume: sp.volume * this.volume, bus: this.bus });
    }
  }
}
