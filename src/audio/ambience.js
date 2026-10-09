// Automatic ambience. Reads an env snapshot each frame (listener position, wind strength and
// gust, weather state, hour, night amount, interior) and crossfades:
//   wind     a live graph: body, moaning resonant bands that wander (strong in a blizzard),
//            blowing-snow hiss; muffled indoors
//   forest   wind in spruce (scaled by wind), birds by day, creaks, ravens, owls and far wolves at night
//   lake     near silence, distant ice groans and dispersive pings that travel (more at night: the lake sings)
//   village  distant murmur by day, dogs, chickens, goats, doors, a child, axes, the forge near the smithy
// Zone weights come from the camera position against LOC and the lake shoreline.
import { LOC } from '../world/layout.js';
import { lakeSDF as lakeSDFImport } from '../world/heightfield.js';

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const WEATHER_WIND = { clear: 0.22, overcast: 0.35, snow: 0.5, blizzard: 0.92, fog: 0.1 };

// Spot sounds: zone, rate per minute at full zone weight, distance band, and time filters.
const SPOTS = [
  { name: 'bird', zone: 'forest', rate: 6, d: [20, 90], vol: 0.7, day: 1 },
  { name: 'raven', zone: 'forest', rate: 0.9, d: [40, 170], vol: 0.7 },
  { name: 'crow', zone: 'forest', rate: 0.5, d: [60, 180], vol: 0.6, day: 1 },
  { name: '_tree_creak', zone: 'forest', rate: 2.2, d: [8, 45], vol: 0.6, wind: 1 },
  { name: 'owl', zone: 'forest', rate: 1.3, d: [60, 220], vol: 0.8, night: 1 },
  { name: 'wolf_howl', zone: 'forest', rate: 0.35, d: [260, 520], vol: 0.8, night: 1, farFromVillage: 260, burst: [1, 3, 1.4] },
  { name: 'ice_ping', zone: 'lake', rate: 2.2, nightMul: 2.6, d: [70, 330], vol: 0.8, ice: 1 },
  { name: 'ice_groan', zone: 'lake', rate: 0.9, nightMul: 1.8, d: [100, 380], vol: 0.9, ice: 1 },
  { name: 'ice_crack', zone: 'lake', rate: 0.25, nightMul: 1.5, d: [120, 400], vol: 0.6, ice: 1 },
  { name: 'dog_bark', zone: 'village', rate: 3, nightMul: 0.35, inVillage: 1, vol: 0.8, burst: [1, 4, 0.6] },
  { name: 'chicken', zone: 'village', rate: 3.5, inVillage: 1, vol: 0.7, day: 1 },
  { name: 'goat', zone: 'village', rate: 1, inVillage: 1, vol: 0.7, day: 1 },
  { name: 'door', zone: 'village', rate: 1.2, nightMul: 0.3, inVillage: 1, vol: 0.6, near: 15 },
  { name: 'door_close', zone: 'village', rate: 1.2, nightMul: 0.3, inVillage: 1, vol: 0.6, near: 15 },
  { name: 'child_laugh', zone: 'village', rate: 1.3, inVillage: 1, vol: 0.7, day: 1 },
  { name: 'crow', zone: 'village', rate: 1.3, d: [30, 120], vol: 0.7, day: 1 },
  { name: 'axe_chop', zone: 'village', rate: 0.7, inVillage: 1, vol: 0.7, day: 1, burst: [2, 6, 1.5] },
  { name: 'owl', zone: 'village', rate: 0.4, d: [90, 200], vol: 0.7, night: 1 },
];

export class Ambience {
  constructor(eng, env) {
    this.eng = eng;
    this.ctx = eng.ctx;
    this.env = env;
    this.enabled = true;
    this.started = false;
    this.w = { village: 0, lake: 0, forest: 0, indoor: 0, night: 0, wind: 0.2, gust: 0 };
    this.acc = 0;
    this.gust = 0;
    this.gustTarget = 0;
    this.gustTimer = 0;
    this.forge = { t: 0, left: 0 };
    this.pending = [];
    this.space = 'hall';
  }

  start() {
    this.started = true;
    const ctx = this.ctx, eng = this.eng, mx = eng.mixer;
    const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // Wind: two decorrelated sides.
    this.windOut = g(1);
    this.windHp = bq('highpass', 35, 0.6);
    this.windLp = bq('lowpass', 12000, 0.5);
    this.windOut.connect(this.windHp);
    this.windHp.connect(this.windLp);
    this.windLp.connect(mx.ambIn);
    this.windVerb = g(0.25);
    this.windLp.connect(this.windVerb);
    this.windVerb.connect(mx.ambVerbIn);
    this.sides = [-0.75, 0.75].map((pan) => {
      const src = ctx.createBufferSource();
      src.buffer = eng.pinkBuf;
      src.loop = true;
      src.playbackRate.value = pan < 0 ? 1 : 0.93;
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      sp.connect(this.windOut);
      const bodyLp = bq('lowpass', 500, 0.6), body = g(0);
      src.connect(bodyLp); bodyLp.connect(body); body.connect(sp);
      const howls = [0, 1].map(() => {
        const b = bq('bandpass', 400, 11), hg = g(0);
        src.connect(b); b.connect(hg); hg.connect(sp);
        return { b, hg, f: 300 + eng.random() * 300 };
      });
      const hissHp = bq('highpass', 2600, 0.6), hissLp = bq('lowpass', 6000, 0.6), hiss = g(0);
      src.connect(hissHp); hissHp.connect(hissLp); hissLp.connect(hiss); hiss.connect(sp);
      src.start(ctx.currentTime, eng.random() * 6);
      return { src, body, bodyLp, howls, hiss };
    });
    this.beds = {
      forest: eng.sfx.bed('_forest_bed', { bus: 'amb' }),
      village: eng.sfx.bed('_village_bed', { bus: 'amb' }),
      lake: eng.sfx.bed('_lake_bed', { bus: 'amb' }),
    };
  }

  zones(e) {
    const x = e.pos.x, z = e.pos.z, y = e.pos.y ?? 5;
    const V = LOC.village;
    const dv = Math.hypot(x - V.x, z - V.z);
    const village = 1 - ss(V.r * 0.7, V.r * 1.7, dv);
    const sdf = (e.lakeSDF || lakeSDFImport)(x, z);
    const lake = ss(20, -45, sdf) * (1 - village * 0.5);
    const forest = Math.max(0, 1 - village - lake) * (1 - ss(160, 320, y));
    let night = e.night;
    if (night == null) { const h = e.hour ?? 12; night = Math.max(ss(17.5, 19.5, h), 1 - ss(5, 7, h)); }
    return { village, lake, forest, night, dv };
  }

  update(dt) {
    if (!this.enabled) return;
    if (!this.started) this.start();
    const e = this.env() || {};
    if (!e.pos) return;
    const z = this.zones(e);
    const w = this.w, k = 0.8;
    w.village = damp(w.village, z.village, k, dt);
    w.lake = damp(w.lake, z.lake, k, dt);
    w.forest = damp(w.forest, z.forest, k, dt);
    w.night = damp(w.night, z.night, 0.5, dt);
    const indoor = e.space === 'room' || e.space === 'cave' || !!e.indoor;
    w.indoor = damp(w.indoor, indoor ? 1 : 0, 3, dt);
    const space = e.space || (e.indoor ? 'room' : 'hall');
    if (space !== this.space) { this.space = space; this.eng.mixer.setEnvironment(space); }
    // Wind strength: the uniform from Weather, at least the weather state's baseline, more up high.
    const base = WEATHER_WIND[e.weather] ?? 0.25;
    let s = Math.max(e.wind ?? 0, base * 0.9);
    s *= 1 + Math.max(0, Math.min(0.5, ((e.pos.y ?? 0) - 40) / 160));
    s = Math.min(1, s);
    w.wind = damp(w.wind, s, 0.4, dt);
    // Internal gusts on top of whatever the weather says.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 1.5 + this.eng.random() * 5;
      this.gustTarget = this.eng.random() < 0.4 + w.wind * 0.4 ? this.eng.random() : this.eng.random() * 0.25;
    }
    this.gust = damp(this.gust, Math.max(this.gustTarget, e.gust ?? 0), 1.2, dt);
    this.acc += dt;
    if (this.acc >= 0.1) { this.apply(this.acc, e); this.acc = 0; }
    this.spots(dt, e, z);
    this.forgeTick(dt, e);
    this.runPending();
  }

  apply(dt, e) {
    const t = this.ctx.currentTime, w = this.w, r = this.eng.random;
    const s = w.wind, gust = this.gust, out = 1 - w.indoor * 0.85;
    const blizzard = e.weather === 'blizzard' ? 1 : 0;
    for (const side of this.sides) {
      side.body.gain.setTargetAtTime(0.32 * Math.pow(s, 1.1) * (0.65 + 0.6 * gust) * out, t, 0.25);
      side.bodyLp.frequency.setTargetAtTime(220 + 1000 * s * (0.55 + 0.45 * gust), t, 0.3);
      for (const h of side.howls) {
        if (r() < dt * 0.6) h.f = 230 + r() * (380 + 400 * s);
        h.b.frequency.setTargetAtTime(h.f * (1 + 0.15 * gust), t, 1.2);
        const moan = Math.max(0, s - 0.35) / 0.65;
        h.hg.gain.setTargetAtTime(0.5 * Math.pow(moan, 1.4) * (0.4 + 0.9 * gust) * (1 + blizzard * 0.6) * out, t, 0.4);
      }
      side.hiss.gain.setTargetAtTime(0.11 * s * s * (0.5 + 0.8 * gust) * out * (1 - w.forest * 0.4), t, 0.3);
    }
    this.windLp.frequency.setTargetAtTime(w.indoor > 0.5 ? 520 : 12000, t, 0.3);
    const day = 1 - w.night * 0.85;
    this.bed('forest', w.forest * (0.25 + 0.85 * s) * 0.7 * out);
    this.bed('village', w.village * day * 0.55 * out);
    this.bed('lake', w.lake * 0.45 * out);
  }

  bed(name, v) {
    const h = this.beds[name];
    if (!h) return;
    if (v < 0.004) { if (h.live) h.kill(1.5); return; }
    if (!h.live) { h.volume = v; h.start(); }
    else h.setVolume(v);
    // start() may defer while the worker bakes the bed; it is retried on the next update.
  }

  spots(dt, e, z) {
    const w = this.w, r = this.eng.random;
    const ice = !e.thawed;
    const spring = e.thawed ? 3 : 1;
    const out = 1 - w.indoor * 0.9;
    if (out < 0.05) return;
    for (const sp of SPOTS) {
      let weight = w[sp.zone] || 0;
      if (weight < 0.02) continue;
      if (sp.day) weight *= 1 - w.night;
      if (sp.night) weight *= w.night;
      if (sp.nightMul) weight *= 1 + (sp.nightMul - 1) * w.night;
      if (sp.ice && !ice) continue;
      if (sp.wind) weight *= 0.3 + w.wind * 1.4;
      if (sp.name === 'bird') weight *= spring;
      if (sp.farFromVillage && z.dv < sp.farFromVillage) continue;
      if (r() > (sp.rate / 60) * weight * dt) continue;
      const pos = this.place(sp, e);
      if (!pos) continue;
      const n = sp.burst ? sp.burst[0] + Math.floor(r() * (sp.burst[1] - sp.burst[0] + 1)) : 1;
      for (let i = 0; i < n; i++) {
        const delay = i * (sp.burst ? sp.burst[2] * (0.6 + r() * 0.8) : 0);
        this.pending.push({ at: this.ctx.currentTime + delay, name: sp.name, pos, vol: (sp.vol ?? 0.7) * out * (0.7 + r() * 0.3) });
      }
      // Lake sounds travel: a far groan is often answered by pings from another part of the ice.
      if (sp.name === 'ice_groan' && r() < 0.6) {
        const p2 = this.place(sp, e);
        if (p2) this.pending.push({ at: this.ctx.currentTime + 0.8 + r() * 1.5, name: 'ice_ping', pos: p2, vol: 0.5 * out });
      }
    }
  }

  place(sp, e) {
    const r = this.eng.random, p = e.pos;
    if (sp.inVillage) {
      const V = LOC.village;
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * V.r * 0.85;
        const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd > (sp.near ? 6 : 12) && (!sp.near || dd < 80)) return { x, y: 4 + r() * 2, z };
      }
      return null;
    }
    const [d0, d1] = sp.d || [30, 120];
    const a = r() * Math.PI * 2, d = d0 + r() * (d1 - d0);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (sp.zone === 'lake' && (e.lakeSDF || lakeSDFImport)(x, z) > -5) return null;
    return { x, y: sp.zone === 'lake' ? 0.5 : (p.y ?? 5) + (sp.name === 'bird' || sp.name === 'owl' || sp.name === 'raven' || sp.name === 'crow' ? 8 + r() * 10 : 0), z };
  }

  forgeTick(dt, e) {
    const S = LOC.smithy, f = this.forge;
    const h = e.hour ?? 12;
    const d = Math.hypot(e.pos.x - S.x, e.pos.z - S.z);
    if (d > 140 || h < 7 || h > 18.5 || this.w.indoor > 0.5) { f.left = 0; return; }
    f.t -= dt;
    if (f.t > 0) return;
    const r = this.eng.random;
    if (f.left <= 0) { f.left = 3 + Math.floor(r() * 5); f.t = 2.5 + r() * 4; return; }
    f.left--;
    // Strikes on the hot iron; the last of a run often rings on the bare anvil (variant 2).
    const iron = [0, 1, 3, 4];
    this.eng.sfx.play('forge_hammer', { pos: { x: S.x + 1, y: 4, z: S.z }, bus: 'amb', volume: 0.8, variant: f.left === 0 && r() < 0.6 ? 2 : iron[Math.floor(r() * 4)] });
    f.t = 0.42 + r() * 0.12;
  }

  runPending() {
    if (!this.pending.length) return;
    const now = this.ctx.currentTime;
    const due = this.pending.filter((p) => p.at <= now);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) this.eng.sfx.play(p.name, { pos: p.pos, volume: p.vol, bus: 'amb' });
  }
}
