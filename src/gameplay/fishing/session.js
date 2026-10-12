// One sitting at a hole, from the walk to the stool to getting up. Owns Vesna and the camera while it runs
// (G.player.control off, G.cameraOwner 'fishing') and hands both back cleanly.
//
// Phases: walk, sit, fish (lower the jig, jig it, wait; nibbles, a bite, the strike), fight (tension against the pull
// and the runs), land (the fish out of the hole, on the ice, in the basket), stand. The model is in model.js; this file
// is the doing and the showing: animation, rod and line, camera, sound, rumble, the HUD, and the rules that decide when
// the old pike comes.
import * as THREE from 'three';
import { clamp, smoothstep, damp, wrapAngle } from '../../core/util.js';
import { semToQuat } from '../../characters/clips/pose.js';
import { SPECIES } from './species.js';
import { Line, Bite, Fight, OldOne, speciesTerms, totalRate, pickSpecies, rollWeight, makeEnv, kg, sizeWord } from './model.js';
import { recordCatch } from './store.js';
import { TUNE } from '../player/stats.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function bump(out, idx, bone, sem) {
  const i = idx[bone];
  if (i === undefined) return;
  semToQuat(bone, sem, _q2);
  _q.fromArray(out, i * 4).multiply(_q2).toArray(out, i * 4);
}

export class FishSession {
  constructor(F, spot, opts = {}) {
    this.F = F;
    this.G = F.G;
    this.spot = spot;
    this.opts = opts;
    this.P = this.G.player;
    this.c = this.P.character;
    this.phase = 'walk';
    this.t = 0;
    this.phaseT = 0;
    this.W = spot.depth;
    this.line = new Line(this.W);
    this.lineType = F.lineFor(spot);
    this.bite = null;
    this.cool = 4 + F.rnd() * 3;
    this.hazard = 0;
    this.thresh = -Math.log(1 - F.rnd());
    this.fight = null;
    this.catches = 0;
    this.oldOne = F.oldOneActive(spot) ? new OldOne(F.rnd) : null;
    this.pose = { jig: 0, strike: 0, dip: 0, tremble: 0, bite: 0, recoil: 0 };
    this.env = makeEnv({});
    this.envT = 0;
    this.holeV = new THREE.Vector3(spot.hole.x, 0, spot.hole.z);
    this.camBlend = 0;
    this.look = { yaw: 0, pitch: 0, idle: 0 };
    this.kick = 0;
    this.shake = 0;
    this.reelT = 0;
    this.rumbleT = 0;
    this.hiss = null;
    this.sink = 0;
    this.pending = []; // [{ t, fn }] small timers on the session clock
    this.landed = null;
    this.walkDone = false;
    this.ended = false;
    this.endReason = null;
    this.post = (out, idx) => this._post(out, idx);
    this.done = new Promise((r) => { this._resolve = r; });
  }

  get active() { return !this.ended; }

  // ---- start and end ---------------------------------------------------------------------------------------------------
  begin() {
    const { G, F, P, c, spot } = this;
    if (P.mounted) P.dismountInstant?.();
    P.setControl(false);
    G.cameraOwner = 'fishing';
    this.cam0 = { pos: G.camera.position.clone(), quat: G.camera.quaternion.clone(), fov: G.camera.fov };
    F.view.setHole(spot.hole.x, spot.hole.z, spot.hole.r);
    c.walkTo(spot.seat.x, spot.seat.z, { stopDist: 0.05, face: spot.seat.yaw, speed: 1.4 }).then((ok) => { if (ok) this.walkDone = true; });
    this.F.sfx('item_pickup', { volume: 0.25 });
    G.events.emit('fishing:start', { spot: spot.id });
  }

  _toSit() {
    const { c, F, spot } = this;
    this.phase = 'sit';
    this.phaseT = 0;
    c.setPosition(spot.seat.x, spot.seat.z);
    c.yaw = spot.seat.yaw;
    c.play('fish_sit', { loop: true, fade: 0.8 });
    c.lookAt(this.holeV.clone().setY(-0.2));
    c.anim.post = this.post;
    F.view.attach(c);
    F.hud.show(true);
    F.hud.keys(true, {});
    this.sinkLine();
  }

  sinkLine() {
    this.line.depth = 0.4;
    this.line.lift = 0;
  }

  // Getting up. `quick` skips the stand-up (a cutscene is taking her).
  stand(reason = 'left', quick = false) {
    if (this.phase === 'stand' || this.ended) return;
    const { c, F, G } = this;
    this.endReason = reason;
    this.phase = 'stand';
    this.phaseT = 0;
    this.quick = quick || !!(G.story?.busy || G.cutscenes?.active || G.dialogue?.active);
    this._stopHiss();
    F.hud.fight(false); F.hud.strike(false); F.hud.gauge(false); F.hud.keys(false); F.hud.hideCard();
    F.view.hideFish();
    c.stopUpper(0.25);
    c.lookAt(null);
    if (!this.quick) c.stop(0.6);
    this.fight = null;
    this.bite = null;
    if (this.quick) this._finish();
  }

  _finish() {
    if (this.ended) return;
    const { G, F, P, c } = this;
    this.ended = true;
    c.anim.post = null;
    F.view.detach();
    F.hud.show(false);
    const busy = !!(G.story?.busy || G.cutscenes?.active || G.dialogue?.active);
    if (!busy) {
      P.setControl(true);
      if (G.cameraOwner === 'fishing') {
        G.cameraOwner = 'rig';
        const rig = G.cameraRig;
        if (rig) { rig.snapBehind(this.spot.seat.yaw + Math.PI); }
      }
    } else if (G.cameraOwner === 'fishing') G.cameraOwner = 'rig';
    G.events.emit('fishing:end', { spot: this.spot.id, reason: this.endReason, catches: this.catches });
    this._resolve({ reason: this.endReason, catches: this.catches });
  }

  // ---- input -------------------------------------------------------------------------------------------------------------
  readInput() {
    const T = this.F.testInput;
    if (T) { const o = { reel: !!T.reel, slack: !!T.slack, jig: !!T.jig, leave: !!T.leave }; T.jig = false; T.leave = false; return o; }
    const I = this.G.input;
    return { reel: I.down('fishReel'), slack: I.down('fishSlack'), jig: I.pressed('fishJig'), leave: I.pressed('fishLeave') };
  }

  after(seconds, fn) { this.pending.push({ t: this.t + seconds, fn }); }

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.ended) return;
    const { G, F } = this;
    const menu = G.ui?.menuOpen && !F.testInput;
    this.frozen = menu || (G.input.context !== 'game' && !F.testInput);
    if (this.frozen) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.phaseT += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].t <= this.t) { const p = this.pending.splice(i, 1)[0]; p.fn(); }
    const inp = this.readInput();
    this.envT -= dt;
    if (this.envT <= 0) { this.env = F.env(this.spot); this.envT = 0.5; }

    switch (this.phase) {
      case 'walk': this._walk(dt); break;
      case 'sit': if (this.phaseT > 0.9) { this.phase = 'fish'; this.phaseT = 0; } break;
      case 'fish': this._fish(dt, inp); break;
      case 'fight': this._fight(dt, inp); break;
      case 'land': this._land(dt, inp); break;
      case 'stand': if (this.phaseT > 0.9) this._finish(); break;
      default: break;
    }
    // the little things that fade
    const p = this.pose;
    p.strike = Math.max(0, p.strike - dt / 0.35);
    p.dip = Math.max(0, p.dip - dt / 0.3);
    p.recoil = Math.max(0, p.recoil - dt / 0.8);
    p.jig = this.line.lift / 0.5;
    this.kick = Math.max(0, this.kick - dt * 3);
    this.warmth(dt);
  }

  // After the characters have posed her: the rod, the line, the camera, the HUD.
  late(dt) {
    if (this.ended) return;
    const d = this.frozen ? 0 : Math.min(dt, 0.1);
    this.cameraUpdate(d);
    this.visuals(d);
    this.F.hud.update(d);
  }

  _walk(dt) {
    void dt;
    if (this.walkDone || this.phaseT > 4.5) this._toSit();
  }

  // ---- fishing ---------------------------------------------------------------------------------------------------------
  _fish(dt, inp) {
    const { F, line, spot } = this;
    const c = this.c;
    line.update(dt, { slack: inp.slack, reel: inp.reel });
    // the sound of the line going down and coming up
    if (inp.slack && !line.bottom) { this.sink += dt; }
    if (inp.reel && line.depth > 0.15) {
      this.reelT -= dt;
      if (this.reelT <= 0) { this.reelT = 0.2; F.sfx('reel_click', { pos: this.holeV, volume: 0.45 }); }
      c.playUpper('fish_reel', { loop: true, fade: 0.15 });
      this.reeling = true;
    } else if (this.reeling) { this.reeling = false; c.stopUpper(0.3); }
    if (line.bottom && this.wasBottom === false) F.sfx('jig_plink', { pos: this.holeV, volume: 0.25, pitch: 0.8 });
    this.wasBottom = line.bottom;

    if (inp.jig) this._jig();
    if (inp.leave && !this.bite) { this.stand('left'); return; }

    // what comes to the jig
    this.cool -= dt;
    if (this.bite) {
      for (const ev of this.bite.update(dt)) this._biteEvent(ev);
      if (this.bite && (this.bite.state === 'gone' || this.bite.state === 'spooked')) { this.bite = null; this.cool = 3 + F.rnd() * 3; F.hud.strike(false); this.pose.bite = 0; }
    } else if (this.cool <= 0) {
      const model = { depth: this.W, rich: spot.rich, sizeBias: spot.sizeBias };
      if (this.oldOne && this.oldOne.update(dt, this.env, line, model)) {
        this._startBite(SPECIES.oldone, F.oldOneWeight());
        this.oldOne.reset();
      } else {
        const terms = speciesTerms(this.env, model, line.at, line.jigged);
        this.hazard += totalRate(terms) * dt;
        if (this.hazard >= this.thresh) {
          this.hazard = 0;
          this.thresh = -Math.log(1 - F.rnd());
          const id = pickSpecies(terms, F.rnd);
          if (id) this._startBite(SPECIES[id], rollWeight(SPECIES[id], F.rnd, spot.sizeBias));
        }
      }
    }
    const bl = this.bite && this.bite.state === 'bite';
    this.pose.bite = damp(this.pose.bite, bl ? 1 : 0, 14, dt);
  }

  _startBite(sp, w) {
    this.bite = new Bite(sp, w, this.F.rnd);
    this.bite.special = !!sp.special;
    this.bite.forced = this.opts.forceBite || null;
    this.hazard = 0;
  }

  _biteEvent(ev) {
    const { F } = this;
    if (ev.type === 'nibble') {
      this.pose.dip = 1;
      F.sfx('nibble', { pos: this.holeV, volume: 0.9 });
      F.rumble(0.0, 0.3, 70);
      F.hud.gauge(true, { water: this.W, depth: this.line.at, nib: true });
      F.view.ripple(0.12, 0.45, 0.8);
    } else if (ev.type === 'bite') {
      F.sfx('nibble', { pos: this.holeV, volume: 1.2, pitch: 0.85 });
      F.rumble(0.3, 0.5, 120);
      F.hud.strike(true);
      F.view.ripple(0.15, 0.6, 0.9);
    } else if (ev.type === 'gone') {
      F.hud.strike(false);
      if (!this.bite.special) F.hud.msg('Gone.', '', 1.2);
    }
  }

  _jig() {
    const { F, line, c } = this;
    if (this.bite) {
      const r = this.bite.strike();
      if (r.result === 'hooked') { this._hook(r.q); return; }
      if (r.result === 'missed') {
        this.pose.strike = 1;
        c.playUpper('fish_strike', { loop: false, fade: 0.08, fadeOut: 0.3 });
        F.sfx('strike_whip', { volume: 0.6 });
        F.hud.msg('Missed.', 'bad', 1.4);
        F.hud.strike(false);
        this.bite = null;
        this.cool = 3 + F.rnd() * 3;
        return;
      }
      if (r.result === 'spooked') {
        F.hud.msg('Too early.', 'bad', 1.4);
        this.bite = null;
        this.cool = 4 + F.rnd() * 2;
        F.hud.strike(false);
      }
    }
    line.jig();
    this.pose.strike = Math.max(this.pose.strike, 0.25);
    F.sfx('jig_plink', { pos: this.holeV, volume: 0.35 });
    F.view.ripple(0.1, 0.4, 0.7);
    F.rumble(0, 0.1, 40);
  }

  // ---- the hook is set ----------------------------------------------------------------------------------------------------
  _hook(q) {
    const { F, c, G } = this;
    const b = this.bite;
    const dist = Math.max(this.line.depth, 1.2) + 0.5;
    this.fight = new Fight({ sp: b.sp, w: b.w, rnd: F.rnd, line: this.lineType, dist, q });
    this.fight.special = !!b.special;
    this.fight.opts = this.opts;
    this.bite = null;
    this.phase = 'fight';
    this.phaseT = 0;
    this.pose.strike = 1;
    this.reeling = false;
    this.rumbleT = 0;
    c.playUpper('fish_strike', { loop: false, fade: 0.06, fadeOut: 0.15 });
    this.after(0.55, () => { if (this.phase === 'fight') c.playUpper('fish_fight', { loop: true, fade: 0.25 }); });
    F.sfx('strike_whip', { volume: 0.9 });
    F.sfx('splash_small', { pos: this.holeV, volume: 0.9 });
    F.rumble(0.7, 0.4, 220);
    F.view.ripple(0.2, 1.1, 1.2);
    F.view.showFish(b.sp.id === 'oldone' ? 'oldone' : b.sp.id, b.w);
    F.hud.strike(false);
    F.hud.gauge(false);
    F.hud.fight(true, { T: this.fight.T, Fn: this.fight.Fn, tell: false, dist: this.fight.dist, maxDist: this.lineType.length });
    F.hud.keys(true, { fight: true });
    this.kick = 1;
    this._ensureHiss();
    G.events.emit('fishing:hooked', { id: b.sp.id, w: b.w, spot: this.spot.id });
  }

  _ensureHiss() {
    if (this.hiss || !this.G.audio?.loop) return;
    try { this.hiss = this.G.audio.loop('line_hiss', { pos: this.holeV.clone().setY(0.3), volume: 0 }); } catch { this.hiss = null; }
  }

  _stopHiss() {
    if (this.hiss) { try { this.hiss.stop(0.3); } catch { /* optional */ } this.hiss = null; }
  }

  _fight(dt, inp) {
    const { F, fight: f, c } = this;
    const evs = f.update(dt, { reel: inp.reel, slack: inp.slack });
    for (const ev of evs) {
      if (ev.type === 'tell') { F.rumble(0.0, 0.35, 60); }
      else if (ev.type === 'run') {
        F.rumble(0.25, 0.6, 160);
        if (ev.edge) { F.sfx('ice_scrape', { pos: this.holeV, volume: 0.9 }); this.shake = 0.5; }
      }
    }
    // winding
    const eff = inp.reel && !inp.slack ? Math.max(0, 1 - f.Fr * 1.15) : 0;
    if (inp.reel && !inp.slack) {
      this.reelT -= dt;
      if (this.reelT <= 0 && eff > 0.05) { this.reelT = 0.16; F.sfx('reel_click', { pos: this.holeV, volume: 0.65 }); }
      if (!this.reeling) { this.reeling = true; c.playUpper('fish_reel', { loop: true, fade: 0.12 }); }
    } else if (this.reeling) { this.reeling = false; c.playUpper('fish_fight', { loop: true, fade: 0.2 }); }
    // strain through the pad
    this.rumbleT -= dt;
    if (f.T > 0.7 && this.rumbleT <= 0) { F.rumble(0.2 + 0.6 * (f.T - 0.7), 0.4, 90); this.rumbleT = 0.1; }
    // the line singing as the fish takes it
    if (this.hiss) {
      const out = (inp.slack ? 0.7 : 0) + (f.running && !f.incoming ? 0.6 : 0) + (f.incoming ? 0.25 : 0);
      this.hiss.setVolume(clamp(out * (0.4 + 0.6 * f.Fr), 0, 1));
    }
    F.hud.fight(true, { T: f.T, Fn: f.Fn, tell: f.incoming, dist: f.dist, maxDist: this.lineType.length });
    if (f.state !== 'fight') this._fightOver(f.state);
  }

  _fightOver(state) {
    const { F, c } = this;
    const f = this.fight;
    this._stopHiss();
    this.reeling = false;
    F.hud.fight(false);
    F.hud.keys(true, {});
    if (state === 'landed') {
      this.phase = 'land';
      this.phaseT = 0;
      this.landed = { id: f.sp.id, w: f.w, special: !!f.special, depth: this.line.depth };
      c.playUpper('fish_lift', { loop: false, hold: true, fade: 0.2 });
      F.rumble(0.4, 0.3, 160);
      return;
    }
    const msgs = {
      snapped: f.special ? 'It took the line.' : 'The line snaps.',
      thrown: 'It has shaken the hook.',
      spooled: f.special ? 'It took the line.' : 'It took all the line.',
    };
    F.hud.msg(msgs[state] || 'Gone.', 'bad', 2.6);
    if (state === 'snapped' || state === 'spooled') { F.sfx('line_snap', { pos: this.holeV, volume: 0.95 }); F.rumble(0.9, 0.7, 320); this.pose.recoil = 1; this.shake = 0.8; }
    else { F.sfx('splash_small', { pos: this.holeV, volume: 0.8 }); F.rumble(0.3, 0.2, 100); }
    F.view.ripple(0.25, 1.2, 1.4);
    F.view.hideFish();
    c.stopUpper(0.4);
    G_emit(this.G, 'fishing:lost', { id: f.sp.id, w: f.w, how: state, special: !!f.special, spot: this.spot.id });
    if (f.special && this.oldOne) this.oldOne.reset();
    this.fight = null;
    this.phase = 'fish';
    this.phaseT = 0;
    this.cool = 3 + F.rnd() * 2;
    this.sinkLine();
  }

  // ---- landing ---------------------------------------------------------------------------------------------------------------
  // 0..0.9 the fish comes up out of the hole; 0.9..1.3 it swings down onto the ice; then it flops while the page of the
  // notebook shows what it was; at 4.2 it is taken.
  _land(dt, inp) {
    const { F, landed: L, c } = this;
    void dt;
    const t = this.phaseT;
    if (!this._landStep) {
      this._landStep = 1;
      F.sfx('splash_small', { pos: this.holeV, volume: 1 });
      F.view.ripple(0.3, 1.3, 1.4);
      F.view.fish.api.group.visible = true;
      this.G.scene.add(F.view.fish.api.group);
    }
    if (t > 0.9 && this._landStep === 1) {
      this._landStep = 2;
      F.sfx('fish_land', { pos: this.holeV, volume: 1 });
      F.sfx('fish_flop', { pos: this.holeV, volume: 0.9 });
      this.kick = 0.6;
      const sp = SPECIES[L.id];
      const r = recordCatch(this.G.state, { id: L.id, w: L.w, day: this.G.time.day, hours: this.G.time.hours, depth: L.depth, special: L.special });
      this.catches++;
      F.caught(this.spot, L, r);
      const remark = L.special ? '' : r.record ? 'Heaviest yet.' : r.first ? 'The first in the book.' : (() => { const w = sizeWord(L.id, L.w); return w ? w.charAt(0).toUpperCase() + w.slice(1) + '.' : ''; })();
      F.hud.card({ id: L.id === 'oldone' ? 'pike' : L.id, name: sp.name, pl: sp.pl, kg: kg(L.w), remark, seed: Math.floor(L.w * 100) });
      this.G.ui?.notify?.(`${sp.name}, ${kg(L.w)}`, 'item');
    }
    if (t > (L.special ? 6.5 : 4.4)) {
      F.view.hideFish();
      F.hud.hideCard();
      c.stopUpper(0.5);
      this._landStep = 0;
      this.landed = null;
      this.fight = null;
      this.phase = 'fish';
      this.phaseT = 0;
      this.cool = 3 + F.rnd() * 3;
      this.sinkLine();
      F.hud.keys(true, {});
      return;
    }
    if (inp.leave && t > 1.5 && !L.special) { /* the fish is taken at once */ this.phaseT = 99; }
  }

  // ---- warmth -----------------------------------------------------------------------------------------------------------------
  // Sitting on the ice in the cold costs what standing on it does (the Player's own drain is off while she has no control).
  warmth(dt) {
    const { G, P } = this;
    const h = G.time?.hours ?? 12;
    const night = h >= 19 || h < 5.5 ? 1 : h >= 17.5 ? (h - 17.5) / 1.5 : h < 7 ? 1 - (h - 5.5) / 1.5 : 0;
    const W = G.weather?.params;
    let drain = night * TUNE.nightDrain + (W ? W.snowfall * TUNE.snowDrain + Math.max(0, W.wind - 0.3) * TUNE.windDrain + W.overcast * 0.0002 : 0);
    drain *= TUNE.iceExposure * 0.85;
    P.warmth = clamp(P.warmth - drain * dt);
  }

  // ---- the pose hook (jig lift, strike, tremble) -------------------------------------------------------------------------
  _post(out, idx) {
    const p = this.pose, t = this.t;
    const fight = this.phase === 'fight';
    const lift = p.jig * 20 + p.strike * 34 - p.recoil * 10 * Math.sin(t * 28);
    if (!fight && Math.abs(lift) > 0.01) {
      bump(out, idx, 'armR', [lift, 0, 0]);
      bump(out, idx, 'forearmR', [lift * 0.35, 0, 0]);
    }
    const shiver = p.dip * Math.sin(t * 52) * 5 + (this.fight?.incoming ? Math.sin(t * 61) * 4 : 0) + p.bite * Math.sin(t * 23) * 4;
    if (Math.abs(shiver) > 0.01) bump(out, idx, 'handR', [shiver, 0, 0]);
    if (fight && this.fight) {
      const T = this.fight.T;
      bump(out, idx, 'armR', [-T * 6 + Math.sin(t * 37) * Math.max(0, T - 0.6) * 5, 0, 0]);
      bump(out, idx, 'chest', [-T * 5, 0, 0]);
    }
  }

  // ---- showing it ---------------------------------------------------------------------------------------------------------------
  visuals(dt) {
    const { F, line, fight: f, pose: p } = this;
    const v = F.view;
    let bend = 0, tremble = 0, slack = 0.35, edge = 0, runYaw = this.spot.seat.yaw, depth = line.at, fish = null;
    if (this.phase === 'fight' && f) {
      bend = clamp(f.T, 0, 1.15) * 0.95 + (f.incoming ? 0.1 * Math.sin(this.t * 44) : 0);
      tremble = f.incoming ? 0.012 : Math.max(0, f.T - 0.8) * 0.03;
      slack = clamp(1 - f.T * 3.2, 0, 1) * 0.9;
      edge = f.edge ? f.runDir : 0;
      runYaw = this.spot.seat.yaw;
      depth = Math.min(f.dist * 0.85, this.W * 0.98 + 2);
      if (f.dist < 3.6) {
        const k = f.dist / 3.6;
        fish = { depth: Math.max(0.1, f.dist * 0.75), ang: this.t * (1.1 + f.Fr) + f.runDir, rad: 0.05 + 0.25 * f.stamina * k, bend: Math.sin(this.t * 9) * f.Fr * 0.7 };
      }
    } else if (this.phase === 'land' && this.landed) {
      bend = 0.5;
      slack = 0;
      this._landFish();
    } else {
      bend = p.bite * (0.7 + 0.2 * Math.sin(this.t * 18)) + p.dip * 0.4 + p.recoil * 0.6 * Math.sin(this.t * 30);
      tremble = p.dip * 0.02 * Math.sin(this.t * 80);
      slack = line.depth < 0.15 ? 0.1 : 0.25;
    }
    v.frame({ bend, tremble, t: this.t, slack, edge, runYaw, depth, fish, air: this.phase === 'land' }, dt);
    if (this.phase === 'fish' || this.phase === 'sit') {
      this.F.hud.gauge(this.phase === 'fish' && !this.fight, { water: this.W, depth: line.at, bite: p.bite > 0.5 });
    }
    // crank follows the winding
    if (this.reeling) this.crank = (this.crank || 0) + dt * 14;
    v.rod.crank(this.crank || 0);
  }

  // The fish through the air and onto the ice.
  _landFish() {
    const { F, landed: L, spot } = this;
    const g = F.view.fish?.api.group;
    if (!g) return;
    const t = this.phaseT;
    const H = spot.hole;
    const toSeat = _a.set(spot.seat.x - H.x, 0, spot.seat.z - H.z).normalize();
    const side = _b.set(toSeat.z, 0, -toSeat.x);
    g.rotation.order = 'YXZ';
    const api = F.view.fish.api;
    const len = api.length;
    if (t < 0.9) {
      const k = smoothstep(0, 0.9, t);
      g.position.set(H.x, -0.5 + k * (0.55 + len * 0.55), H.z);
      g.rotation.set(-Math.PI / 2 + 0.2 * Math.sin(t * 9), 0, 0.3 * Math.sin(t * 7));
      api.setBend(0.4 * Math.sin(t * 16));
    } else if (t < 1.35) {
      const k = smoothstep(0, 1, (t - 0.9) / 0.45);
      const hang = H.y ?? 0;
      const ex = H.x + toSeat.x * (0.6 + len * 0.25) + side.x * 0.25, ez = H.z + toSeat.z * (0.6 + len * 0.25) + side.z * 0.25;
      g.position.set(H.x + (ex - H.x) * k, (0.55 + len * 0.55) * (1 - k * k) + 0.05 + hang, H.z + (ez - H.z) * k);
      g.rotation.set(-Math.PI / 2 * (1 - k), k * 2.2, k * (Math.PI / 2));
      api.setBend(0.5 * Math.sin(t * 20));
    } else {
      const ft = t - 1.35;
      const amp = Math.exp(-ft * 1.1) * (L.special ? 0.5 : 1);
      const ex = H.x + toSeat.x * (0.6 + len * 0.25) + side.x * 0.25, ez = H.z + toSeat.z * (0.6 + len * 0.25) + side.z * 0.25;
      const flop = Math.max(0, Math.sin(ft * 15)) * amp;
      g.position.set(ex, 0.03 + len * 0.045 + flop * 0.1, ez);
      g.rotation.set(0, 2.2 + 0.25 * Math.sin(ft * 6) * amp, Math.PI / 2 + 0.2 * Math.sin(ft * 12) * amp);
      api.setBend(Math.sin(ft * 15) * 0.9 * amp);
    }
  }

  // ---- the camera -----------------------------------------------------------------------------------------------------------------
  cameraUpdate(dt) {
    const { G, spot } = this;
    if (G.cameraOwner !== 'fishing') return;
    const cam = G.camera;
    const fightish = this.phase === 'fight' || this.phase === 'land';
    this.camBlend = Math.min(1, this.camBlend + dt / (this.phase === 'stand' ? 0.9 : 1.5));
    const y = spot.seat.yaw;
    const fx = Math.sin(y), fz = Math.cos(y);
    const rx = -Math.cos(y), rz = Math.sin(y); // her right
    // look around a little with the mouse or the right stick; it drifts back when left alone
    const I = G.input;
    const L = this.look;
    let moved = false;
    if (dt > 0 && !this.F.testInput) {
      const sx = (G.settings?.mouseSensX ?? 1) * 0.0022 * (G.settings?.invertX ? -1 : 1), sy = (G.settings?.mouseSensY ?? 1) * 0.0022 * (G.settings?.invertY ? -1 : 1);
      if (I.look.dx || I.look.dy) { L.yaw -= I.look.dx * sx; L.pitch += I.look.dy * sy; moved = true; }
      const lp = I.lookPad;
      if (Math.hypot(lp.x, lp.y) > 0.05) { L.yaw -= lp.x * 1.6 * dt; L.pitch += lp.y * 1.1 * dt; moved = true; }
    }
    L.idle = moved ? 0 : L.idle + dt;
    if (L.idle > 2) { L.yaw = damp(L.yaw, 0, 1.4, dt); L.pitch = damp(L.pitch, 0, 1.4, dt); }
    L.yaw = clamp(L.yaw, -0.5, 0.5);
    L.pitch = clamp(L.pitch, -0.3, 0.3);
    // the base position: behind and above the right shoulder, closer in a fight
    // a three-quarter view from behind her right shoulder: she is in the left of the picture, the rod crosses it, the hole is
    // in the middle. Closer and lower in a fight.
    const back = fightish ? 1.05 : 1.3, side = fightish ? 1.75 : 2.05, up = fightish ? 1.3 : 1.5;
    const sway = this.fight ? Math.sin(this.t * 1.7) * 0.02 * this.fight.Fr : 0;
    const runShift = this.fight ? (this.fight.running && !this.fight.incoming ? this.fight.runDir * 0.18 : 0) : 0;
    this.runShift = damp(this.runShift || 0, runShift, 4, dt || 0.016);
    _a.set(spot.seat.x - fx * back + rx * (side + this.runShift) + sway, up, spot.seat.z - fz * back + rz * (side + this.runShift));
    const H = this.holeV;
    // look at a point between her hands and the hole, a little past the water
    const wy = fightish ? 0.1 : 0.2;
    _b.set(spot.seat.x * 0.3 + H.x * 0.7, wy, spot.seat.z * 0.3 + H.z * 0.7);
    // the look offsets rotate the view direction
    _c.copy(_b).sub(_a);
    const dist = _c.length();
    const yaw = Math.atan2(_c.x, _c.z) + L.yaw + (this.fight && this.fight.running ? this.runShift * 0.15 : 0);
    const pitch = Math.asin(clamp(_c.y / dist, -1, 1)) + L.pitch;
    _c.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    _b.copy(_a).add(_c);
    // shakes: the strike's kick, a snap, a run under the ice
    const s = this.kick * 0.04 + this.shake * 0.05;
    if (s > 0.0005) {
      _a.x += Math.sin(this.t * 71) * s; _a.y += Math.sin(this.t * 83 + 1) * s; _a.z += Math.sin(this.t * 67 + 2) * s;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    // (a test or a screenshot can take the camera: G.fishing.debugCam = { pos, look, fov })
    const dbg = this.F.debugCam;
    if (dbg) { _a.copy(dbg.pos); _b.copy(dbg.look); }
    _m.lookAt(_a, _b, _up);
    _q.setFromRotationMatrix(_m);
    const e = dbg ? 1 : smoothstep(0, 1, this.camBlend);
    const stand = this.phase === 'stand';
    if (stand) {
      // easing back toward where the rig will take over
      cam.position.lerp(_a, 0); // keep the last pose; the rig blends from it
    } else {
      cam.position.lerpVectors(this.cam0.pos, _a, e);
      cam.quaternion.slerpQuaternions(this.cam0.quat, _q, e);
      const fov = dbg?.fov ?? (fightish ? 46 : 50) + (G.settings?.fovOffset ?? 0) * 0.5;
      const wantFov = this.cam0.fov + (fov - this.cam0.fov) * e;
      if (Math.abs(cam.fov - wantFov) > 1e-3) { cam.fov = wantFov; cam.updateProjectionMatrix(); }
    }
    cam.up.set(0, 1, 0);
  }
}

function G_emit(G, name, payload) { G.events.emit(name, payload); }

void wrapAngle;
