// The fishing model, with no THREE and no DOM so it runs in Node (scripts/fishtest.mjs): what bites, when, how big,
// how the bite plays out, how the fight goes and what a fish is worth.
//
//   Line                        the jig on its line: how deep it hangs, sinking, raising, jigging
//   speciesTerms(env, spot, d, jig) -> [{ id, rate }]     nibbles per second for each species at line depth d
//   pickSpecies(terms, rnd), rollWeight(sp, rnd, bias)    which fish, how big
//   Bite                        one fish's approach: nibbles, then a short window to strike
//   Fight                       tension against the fish's pull and runs; reel while it rests, give line when it runs
//   OldOne                      the patience the pike under the bell tower wants before it takes a line
//   priceOf(id, w), cookValue(id, w), lengthOf(id, w)
//
// Units: meters, seconds, kilograms. Force is in line strengths: a hemp line (strength 1) snaps at tension 1.
import { clamp } from '../../core/util.js';
import { SPECIES, SPECIES_IDS } from './species.js';

export const LINES = {
  normal: { id: 'normal', name: 'Hemp line', strength: 1.0, length: 22 },
  strong: { id: 'strong', name: 'Waxed horsehair line', strength: 1.8, length: 30 },
};

// ---- small helpers --------------------------------------------------------------------------------------------------
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function gauss(rnd) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const between = (rnd, [a, b]) => a + (b - a) * rnd();

// Activity 0..1 through the day from a list of [hour, value] points covering 0 to 24.
export function hourFit(pts, hours) {
  const h = ((hours % 24) + 24) % 24;
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) {
      const [h0, v0] = pts[i - 1], [h1, v1] = pts[i];
      const t = h1 > h0 ? smooth(0, 1, (h - h0) / (h1 - h0)) : 0;
      return v0 + (v1 - v0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

export const isNight = (hours) => hours >= 18.5 || hours < 6;

// env: what the world is doing. herdersLow is 0..1: how many of the herders hang low over the ice (the fishermen read it
// as a hard clear frost; the game gives them a better bite and says nothing).
export function makeEnv(o = {}) {
  const hours = o.hours ?? 12;
  return { hours, weather: o.weather ?? 'clear', herdersLow: clamp(o.herdersLow ?? 0), night: isNight(hours) };
}

// ---- where and what ---------------------------------------------------------------------------------------------------
// spot: { depth (water under the ice, m), rich (bite rate multiplier), sizeBias (weight multiplier) }
export function preferredDepth(sp, W) {
  return clamp(sp.depth.pref * W, 0.35, Math.max(0.4, W - 0.25));
}

export function speciesTerm(sp, env, spot, lineDepth, jig = false) {
  if (sp.special) return 0;
  const W = spot.depth;
  const present = smooth(sp.depth.min - 0.4, sp.depth.min + 0.6, W);
  if (present <= 0) return 0;
  const pref = preferredDepth(sp, W);
  const sig = Math.max(0.45, sp.depth.spread * W);
  const fit = Math.exp(-0.5 * ((lineDepth - pref) / sig) ** 2);
  const hour = hourFit(sp.hours, env.hours);
  const wx = sp.weather[env.weather] ?? 1;
  const sky = 1 + (sp.sky - 1) * env.herdersLow;
  return (sp.rate / 60) * present * fit * hour * wx * sky * (spot.rich ?? 1) * (jig ? 1.8 : 1);
}

export function speciesTerms(env, spot, lineDepth, jig = false) {
  const out = [];
  for (const id of SPECIES_IDS) out.push({ id, rate: speciesTerm(SPECIES[id], env, spot, lineDepth, jig) });
  return out;
}

export const totalRate = (terms) => terms.reduce((s, t) => s + t.rate, 0);

export function pickSpecies(terms, rnd) {
  const total = totalRate(terms);
  if (total <= 0) return null;
  let r = rnd() * total;
  for (const t of terms) { r -= t.rate; if (r <= 0) return t.id; }
  return terms[terms.length - 1].id;
}

export function rollWeight(sp, rnd, bias = 1) {
  const [lo, mean, hi] = sp.w;
  const w = mean * bias * Math.exp(sp.sigma * gauss(rnd) - (sp.sigma * sp.sigma) / 2);
  return Math.round(clamp(w, lo, hi) * 100) / 100;
}

export const lengthOf = (id, w) => SPECIES[id].len * Math.cbrt(w);
export const forceFor = (sp, w) => sp.fight.power * Math.pow(w / sp.fight.ref, sp.fight.exp);

// ---- the line ---------------------------------------------------------------------------------------------------------
// Hold slack to let the jig sink, hold reel to raise it, tap to jig it (a quick lift and fall that flashes the jig).
export class Line {
  constructor(water, o = {}) {
    this.water = water;
    this.depth = o.depth ?? 0.4;
    this.lift = 0; // the jig's momentary rise (m), falls back by itself
    this.sinkSpeed = o.sinkSpeed ?? 0.9;
    this.raiseSpeed = o.raiseSpeed ?? 0.7;
    this.jigAge = 99; // seconds since the last jig
    this.bottom = false;
  }
  get floor() { return Math.max(0.3, this.water - 0.15); }
  jig() { this.lift = Math.min(0.5, this.lift + 0.5); this.jigAge = 0; }
  update(dt, inp = {}) {
    this.jigAge += dt;
    if (inp.slack) this.depth += this.sinkSpeed * dt;
    else if (inp.reel) this.depth -= this.raiseSpeed * dt;
    this.depth = clamp(this.depth, 0.1, this.floor);
    this.bottom = this.depth >= this.floor - 1e-3;
    this.lift = Math.max(0, this.lift - dt * 1.6);
  }
  // Where the jig is right now, with the jig's lift.
  get at() { return Math.max(0.1, this.depth - this.lift); }
  get jigged() { return this.jigAge < 3; }
}

// ---- one fish's approach ----------------------------------------------------------------------------------------------
// States: 'near' (it is looking; maybe nibbling), 'bite' (it has the jig: strike now), 'gone', 'spooked', 'hooked'.
export class Bite {
  constructor(sp, w, rnd) {
    const b = sp.bite;
    this.sp = sp;
    this.w = w;
    this.rnd = rnd;
    const n = b.nibbles[0] + Math.floor(rnd() * (b.nibbles[1] - b.nibbles[0] + 1));
    this.times = [];
    let t = 0.5 + rnd() * 0.6;
    for (let i = 0; i < n; i++) { this.times.push(t); t += between(rnd, b.gap); }
    this.biteAt = t + (n ? 0.1 : 0) + rnd() * 0.3;
    this.window = b.window * (0.9 + 0.2 * rnd());
    this.t = 0;
    this.nibbled = 0;
    this.state = 'near';
    this.struckAt = -1;
  }
  get timeToBite() { return this.biteAt - this.t; }
  get windowLeft() { return this.state === 'bite' ? this.biteAt + this.window - this.t : 0; }
  update(dt) {
    const ev = [];
    if (this.state !== 'near' && this.state !== 'bite') return ev;
    this.t += dt;
    while (this.nibbled < this.times.length && this.t >= this.times[this.nibbled] && this.state === 'near') {
      ev.push({ type: 'nibble', i: this.nibbled });
      this.nibbled++;
    }
    if (this.state === 'near' && this.t >= this.biteAt) {
      this.state = 'bite';
      ev.push({ type: 'bite' });
    }
    if (this.state === 'bite' && this.t >= this.biteAt + this.window) {
      this.state = 'gone';
      ev.push({ type: 'gone' });
    }
    return ev;
  }
  // The strike (a tap while the fish is here). 'early' spooks a shy fish, a bite in time hooks it, the rest does nothing.
  strike() {
    if (this.state === 'near') {
      if (this.rnd() < this.sp.bite.shy) { this.state = 'spooked'; return { result: 'spooked' }; }
      return { result: 'early' };
    }
    if (this.state !== 'bite') return { result: 'none' };
    const into = clamp((this.t - this.biteAt) / this.window);
    const p = 0.97 - 0.3 * into;
    this.struckAt = this.t;
    if (this.rnd() < p) { this.state = 'hooked'; return { result: 'hooked', q: 1 - into }; }
    this.state = 'gone';
    return { result: 'missed' };
  }
}

// ---- the fight --------------------------------------------------------------------------------------------------------
const PHASE = {
  rest: { f: 0.2, len: [0.9, 2.0] },
  pull: { f: 0.55, len: [0.9, 2.0] },
  run: { f: 1.0, len: [0.8, 1.6] },
  dive: { f: 0.78, len: [1.5, 3.0] },
  shake: { f: 0.92, len: [0.5, 1.0] },
};
export const FIGHT = {
  reelLoad: 0.28, // extra tension from winding (absolute, in line strengths)
  reelSpeed: 1.05, // meters of line per second against a resting fish
  slackSpeed: 1.3, // meters of line let out per second
  slackRelief: 0.12, // tension left on a free spool, as a fraction of the pull
  snapGrace: 0.3, // seconds above the limit before the line goes
  landDist: 0.85,
};

export class Fight {
  // sp, w, rnd; line (LINES entry); dist: meters of line out at the hook-up; q: how well it was set (0..1)
  constructor({ sp, w, rnd, line = LINES.normal, dist = 3, q = 1 }) {
    this.sp = sp;
    this.w = w;
    this.rnd = rnd;
    this.line = line;
    this.power = forceFor(sp, w);
    this.dist = Math.max(1.4, dist);
    this.stamina = 1;
    this.tireTime = sp.fight.tire * Math.pow(Math.max(0.2, w) / sp.fight.ref, 0.3);
    this.phase = 'pull';
    this.phaseT = 0;
    this.phaseLen = 0.8;
    this.F = this.power * 0.4; // the pull right now (absolute)
    this.T = 0.25; // line tension as a fraction of what the line takes
    this.over = 0;
    this.slackT = 0;
    this.t = 0;
    this.state = 'fight'; // 'fight' | 'landed' | 'snapped' | 'thrown' | 'spooled'
    this.lastRun = false;
    this.edge = false;
    this.runDir = rnd() < 0.5 ? -1 : 1;
    this.lead = 0;
    this.incoming = false; // a run is about to start
    this.reeled = 0;
    this.hist = { runs: 0, slackMax: 0, peakT: 0 };
    this.q = q;
  }

  get Fn() { return this.F / this.line.strength; } // the pull as a fraction of what the line takes
  get Fr() { return this.F / this.power; } // the pull as a fraction of this fish's best
  get spent() { return this.stamina <= 0.12; }
  get ended() { return this.state !== 'fight'; }
  get running() { return this.phase === 'run' || this.phase === 'shake'; }

  _pick() {
    const m = this.sp.fight.mix;
    const s = this.stamina;
    const w = {
      rest: m.rest * (1 + 3 * (1 - s)),
      pull: m.pull * (0.6 + 0.8 * s),
      run: m.run * s * s,
      dive: m.dive * (0.4 + s),
      shake: m.shake * s,
    };
    if (this.phase === 'run' || this.phase === 'shake') { w.rest *= 2.2; w.run *= 0.5; w.shake *= 0.4; }
    if (this.phase === 'rest') { w.rest *= 0.25; }
    if (this.spent) { w.run = 0; w.shake = 0; w.dive = 0; w.rest *= 3; }
    let total = 0;
    for (const k in w) total += w[k];
    let r = this.rnd() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'rest';
  }

  _enter(name) {
    const prevF = PHASE[this.phase]?.f ?? 0.2;
    this.phase = name;
    this.phaseT = 0;
    const [a, b] = PHASE[name].len;
    this.phaseLen = (a + (b - a) * this.rnd()) * this.sp.fight.tempo;
    // A surge is telegraphed: for `lead` seconds the pull barely rises while the rod trembles and the line starts to sing.
    const jump = PHASE[name].f - prevF;
    this.lead = jump > 0.25 ? (name === 'run' || name === 'shake' ? (this.sp.fight.lead ?? 0.4) : 0.35) : 0;
    this.leadF = Math.min(PHASE[name].f, prevF + 0.1);
    this.phaseLen += this.lead;
    this.incoming = this.lead > 0;
    this.edge = false;
    if (name === 'run') { this.hist.runs++; this.runDir = this.rnd() < 0.5 ? -1 : 1; }
  }

  // One step. inp: { reel, slack }. Returns a list of events ({ type: 'phase' | 'run' | 'snap' | 'thrown' | 'landed' | 'spooled' }).
  update(dt, inp = {}) {
    const ev = [];
    if (this.state !== 'fight') return ev;
    // Sub-steps keep the response the same at any frame rate.
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let i = 0; i < n && this.state === 'fight'; i++) this._step(h, inp, ev);
    return ev;
  }

  _step(dt, inp, ev) {
    const sp = this.sp, st = this.line.strength, fx = FIGHT;
    this.t += dt;
    this.phaseT += dt;
    // The fish's phase.
    if (this.phaseT >= this.phaseLen) {
      let next = this._pick();
      // At the hole with strength left: one last bolt.
      if (this.dist <= fx.landDist + 0.3 && !this.lastRun && this.stamina > 0.3) { next = 'run'; this.lastRun = true; }
      this._enter(next);
      ev.push({ type: 'phase', phase: next });
      if (this.incoming) ev.push({ type: 'tell', phase: next });
    }
    const P = PHASE[this.phase];
    if (this.incoming) {
      this.lead -= dt;
      if (this.lead <= 0) {
        this.incoming = false;
        this.edge = this.phase === 'run' && this.sp.fight.edge;
        if (this.phase === 'run' || this.phase === 'shake') ev.push({ type: 'run', phase: this.phase, edge: this.edge });
      }
    }
    let goal = this.power * (this.incoming ? this.leadF : P.f);
    if (this.phase === 'shake' && !this.incoming) goal *= 0.7 + 0.3 * Math.sin(this.t * 38);
    if (this.spent) goal *= 0.5;
    goal *= 0.85 + 0.15 * Math.sin(this.t * 7 + 1.3); // the pull is never quite steady
    this.F += (goal - this.F) * (1 - Math.exp(-dt * (goal > this.F ? 6 : 3.5)));
    const Fr = clamp(this.F / this.power, 0, 1.2);

    // Tension and line.
    let target;
    if (inp.slack) {
      target = this.F * fx.slackRelief;
      this.dist += fx.slackSpeed * (0.25 + 0.75 * clamp(Fr, 0, 1)) * dt; // the spool only turns as fast as the fish pulls
    } else {
      target = this.F + (inp.reel ? fx.reelLoad : 0);
      if (inp.reel) {
        const eff = clamp(1 - Fr * 1.15);
        const d = fx.reelSpeed * eff * dt;
        this.dist -= d;
        this.reeled += d;
      }
    }
    if (this.edge && !inp.slack) target *= 1.08; // the line sawing on the edge of the hole
    target /= st;
    this.T += (target - this.T) * (1 - Math.exp(-dt * (target > this.T ? 8.5 : 4.5)));
    this.hist.peakT = Math.max(this.hist.peakT, this.T);
    this.dist = Math.max(0, this.dist);

    // Tiring: it spends itself on the pull and the strain.
    const act = 0.35 + 0.65 * (P.f);
    this.stamina = clamp(this.stamina - (dt / this.tireTime) * act * (0.7 + 0.6 * Math.min(1, this.T)), 0, 1);

    // The ways to lose it.
    if (this.T > 1) this.over += dt; else this.over = Math.max(0, this.over - dt * 2);
    if (this.over > fx.snapGrace) { this.state = 'snapped'; ev.push({ type: 'snap' }); return; }
    if (this.T < 0.07 && this.dist > fx.landDist) this.slackT += dt; else this.slackT = Math.max(0, this.slackT - dt * 1.5);
    this.hist.slackMax = Math.max(this.hist.slackMax, this.slackT);
    if (this.slackT > sp.fight.soft) { this.state = 'thrown'; ev.push({ type: 'thrown' }); return; }
    if (this.dist >= this.line.length) { this.state = 'spooled'; ev.push({ type: 'spooled' }); return; }
    if (this.dist <= fx.landDist && (this.lastRun || this.stamina <= 0.3)) { this.state = 'landed'; ev.push({ type: 'landed' }); }
  }
}

// ---- the old pike -----------------------------------------------------------------------------------------------------
// It takes a line only on a long quiet night, with the jig on the bottom. Patience builds while the conditions are right
// and bleeds away when they are not; the herders hanging low over the ice shorten the wait.
export class OldOne {
  constructor(rnd, o = {}) {
    this.rnd = rnd;
    this.need = o.need ?? 70 + 50 * rnd();
    this.patience = 0;
  }
  // Rate of patience per second (1 is ideal) for the hour, the weather, the herders and how close to the bottom the jig hangs.
  static rate(env, line, spot) {
    const dark = env.hours >= 20.5 || env.hours < 4.5 ? 1 : env.hours >= 19 || env.hours < 5.5 ? 0.35 : 0;
    const wx = env.weather === 'blizzard' ? 0 : env.weather === 'snow' ? 0.5 : 1;
    const nearFloor = smooth(spot.depth - 3.2, spot.depth - 1.2, line.at) ;
    return dark * wx * nearFloor * (1 + 0.8 * env.herdersLow);
  }
  update(dt, env, line, spot) {
    const r = OldOne.rate(env, line, spot);
    this.patience = Math.max(0, this.patience + (r > 0 ? r : -0.5) * dt);
    return this.patience >= this.need;
  }
  reset() { this.patience = 0; this.need = 70 + 50 * this.rnd(); }
}

// ---- what a fish is worth ---------------------------------------------------------------------------------------------
export function priceOf(id, w) {
  const sp = SPECIES[id];
  const [lo, , hi] = sp.w;
  const rank = clamp((w - lo) / Math.max(1e-6, hi - lo));
  return Math.max(1, Math.round(sp.price * w * (0.85 + 0.5 * rank)));
}

// Grosze per kilo at this weight, before rounding and the one-grosz floor.
export function perKg(id, w) {
  const sp = SPECIES[id];
  const [lo, , hi] = sp.w;
  return sp.price * (0.85 + 0.5 * clamp((w - lo) / Math.max(1e-6, hi - lo)));
}

// Roasted: health points and warmth (0..1) for a fish of this size.
export function cookValue(id, w) {
  const sp = SPECIES[id];
  const health = Math.round(Math.min(34, (6 + 14 * Math.sqrt(w)) * sp.fat));
  const warmth = Math.round(Math.min(0.36, (0.1 + 0.1 * Math.sqrt(w)) * sp.fat) * 100) / 100;
  return { health, warmth };
}

// A short plain size word for notifications.
export function sizeWord(id, w) {
  const [lo, mean, hi] = SPECIES[id].w;
  if (w >= mean + (hi - mean) * 0.55) return 'a big one';
  if (w <= lo + (mean - lo) * 0.4) return 'a small one';
  return '';
}

export const kg = (w) => `${Number(w.toFixed(2))} kg`;
