// Per-character animation runtime.
//
// Layers, evaluated each update:
//   base   stack of states (a full-body clip or the locomotion blend tree) crossfaded by weight
//   upper  stack masked to the upper body (playUpper), layered over base
//   add    additive one-shots on top (nod, shake_head, hit flinches)
// then procedural: posture (elder stoop), breathing, idle sway, turn lean, cold shiver,
// look-at (chest/neck/head/eyes with limits and smoothing, lids follow gaze), blinking,
// expressions and talking (face bones), all written to the bones.
// Locomotion: idle / walk / run / sprint blended by speed with one shared phase; playback rate
// follows speed / stride so planted feet do not slide (stride scales with leg length).
import * as THREE from 'three';
import { BODY_BONES, FPS, sampleTrack, FACE_KEYS } from './clips/pose.js';
import { getClip } from './clips/index.js';
import { REF_HIP_Y } from './clips/locomotion.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const D2R = Math.PI / 180;

const UPPER_MASK = {
  spine: 0.35, chest: 0.8, neck: 1, head: 1, jaw: 1,
  shoulderL: 1, armL: 1, forearmL: 1, handL: 1, fingersL: 1, fingers2L: 1, thumbL: 1,
  shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1,
};

// Face rig: per expression, bone position offsets (head-local meters, reference head) and
// rotations (degrees, local).
const FACE = {
  smile: { mouthL: [0.0035, 0.0035, -0.002], mouthR: [-0.0035, 0.0035, -0.002], cheekL: [0.0008, 0.0028, 0.001], cheekR: [-0.0008, 0.0028, 0.001], lidLL: { r: [-7, 0, 0] }, lidLR: { r: [-7, 0, 0] } },
  frown: { mouthL: [0.001, -0.0035, -0.0005], mouthR: [-0.001, -0.0035, -0.0005], browIL: [-0.001, -0.0015, 0], browIR: [0.001, -0.0015, 0], jaw: { r: [2, 0, 0] } },
  browUp: { browIL: [0, 0.004, 0.0005], browIR: [0, 0.004, 0.0005], browOL: [0, 0.0035, 0], browOR: [0, 0.0035, 0], lidUL: { r: [-6, 0, 0] }, lidUR: { r: [-6, 0, 0] } },
  browDown: { browIL: [-0.0022, -0.0032, 0.001], browIR: [0.0022, -0.0032, 0.001], browOL: [0, -0.0015, 0], browOR: [0, -0.0015, 0], lidUL: { r: [5, 0, 0] }, lidUR: { r: [5, 0, 0] } },
  browSad: { browIL: [-0.0008, 0.0035, 0.0005], browIR: [0.0008, 0.0035, 0.0005], browOL: [0, -0.0012, 0], browOR: [0, -0.0012, 0], mouthL: [0, -0.002, 0], mouthR: [0, -0.002, 0] },
  squint: { lidLL: { r: [-12, 0, 0] }, lidLR: { r: [-12, 0, 0] }, lidUL: { r: [8, 0, 0] }, lidUR: { r: [8, 0, 0] }, cheekL: [0, 0.0015, 0], cheekR: [0, 0.0015, 0] },
  eyesClosed: { lidUL: { r: [40, 0, 0] }, lidUR: { r: [40, 0, 0] }, lidLL: { r: [-6, 0, 0] }, lidLR: { r: [-6, 0, 0] } },
  jawOpen: { jaw: { r: [16, 0, 0] }, mouthL: [-0.001, -0.004, 0], mouthR: [0.001, -0.004, 0] },
  mouthNarrow: { mouthL: [-0.005, 0, 0.003], mouthR: [0.005, 0, 0.003] },
  // resting-face shapes
  heavyLids: { lidUL: { r: [13, 0, 0] }, lidUR: { r: [13, 0, 0] }, browOL: [0, -0.001, 0], browOR: [0, -0.001, 0] },
  eyesWide: { lidUL: { r: [-7, 0, 0] }, lidUR: { r: [-7, 0, 0] }, lidLL: { r: [4, 0, 0] }, lidLR: { r: [4, 0, 0] }, browIL: [0, 0.0012, 0], browIR: [0, 0.0012, 0] },
  smirk: { mouthL: [0.0014, 0.0024, -0.0008], cheekL: [0.0004, 0.0013, 0.0005], lidLL: { r: [-4, 0, 0] } },
  press: { mouthL: [-0.0012, -0.0007, 0.0004], mouthR: [0.0012, -0.0007, 0.0004], cheekL: [0, -0.0004, 0], cheekR: [0, -0.0004, 0], jaw: { r: [-1.2, 0, 0] } },
  browUpL: { browIL: [0, 0.0022, 0.0003], browOL: [0, 0.0034, 0] },
};
const FACE_BONES = ['jaw', 'mouthL', 'mouthR', 'cheekL', 'cheekR', 'browIL', 'browIR', 'browOL', 'browOR', 'lidUL', 'lidUR', 'lidLL', 'lidLR'];

export class Animator {
  constructor(ch) {
    this.ch = ch;
    const by = ch.rig.byName;
    this.names = BODY_BONES.filter((n) => by[n]);
    this.n = this.names.length;
    this.idx = {};
    this.names.forEach((nm, i) => { this.idx[nm] = i; });
    this.boneObjs = this.names.map((nm) => by[nm]);
    this.out = new Float32Array(this.n * 4);
    this.tmp = new Float32Array(this.n * 4);
    this.up = new Float32Array(this.n * 4);
    this.hips = new Float32Array(3);
    this.tmpH = new Float32Array(3);
    this.upH = new Float32Array(3);
    this.face = {};
    this.faceTmp = {};
    for (const f of FACE_KEYS) { this.face[f] = 0; this.faceTmp[f] = 0; }
    this.base = [];
    this.upper = [];
    this.adds = [];
    this.loco = { speed: 0, phase: 0, set: { idle: 'idle', walk: 'walk', run: 'run', sprint: 'sprint' }, wMove: 0 };
    this.legScale = ch.M.hipJY / REF_HIP_Y;
    this.hipsBind = ch.rig.world.hips.clone();
    this.mode = 'loco';
    this.time = 0;
    // procedural state
    this.look = { target: null, yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0, w: 0 };
    this.blink = { t: 1 + Math.random() * 3, v: 0 };
    this.expr = {}; // name -> { v, target, rate }
    // resting face (character temperament); any expression set through the API overrides it
    this.rest = { ...(ch.look?.FP?.rest || {}) };
    this.talking = false;
    this.talkS = { jaw: 0, target: 0, next: 0, narrow: 0, nod: 0, nodV: 0, gestureT: 2 + Math.random() * 2 };
    this.lean = 0;
    this.yawRate = 0;
    this.shiver = 0;
    this.faceBind = {};
    for (const b of FACE_BONES) if (by[b]) this.faceBind[b] = by[b].position.clone();
    this.headK = ch.M.headK;
    this.base.push(this._locoState(1));
  }

  _locoState(w) {
    return { kind: 'loco', w, rate: 0, t: 0 };
  }

  // ---------------------------------------------------------------- API used by Character
  play(name, o = {}) {
    const clip = getClip(name);
    if (!clip) { console.warn(`[characters] unknown clip ${name}`); return Promise.resolve(); }
    const fade = o.fade ?? clip.fadeIn ?? 0.25;
    const loop = o.loop ?? clip.loop;
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    const st = { kind: 'clip', clip, t: o.start ?? 0, speed: o.speed ?? 1, loop, w: fade > 0 ? 0 : 1, rate: fade > 0 ? 1 / fade : 0, resolve, hold: o.hold ?? clip.hold, then: o.then ?? clip.then, evI: 0, fadeOut: o.fadeOut ?? clip.fadeOut ?? 0.3, onEvent: o.onEvent };
    this._finishTop(this.base);
    this.base.push(st);
    this.mode = 'clip';
    return p;
  }
  playUpper(name, o = {}) {
    const clip = getClip(name);
    if (!clip) return Promise.resolve();
    const fade = o.fade ?? 0.25;
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    this._finishTop(this.upper);
    this.upper.push({ kind: 'clip', clip, t: o.start ?? 0, speed: o.speed ?? 1, loop: o.loop ?? clip.loop, w: fade > 0 ? 0 : 1, rate: fade > 0 ? 1 / fade : 0, resolve, hold: o.hold, evI: 0, mask: o.mask || clip.upperMask || UPPER_MASK, fadeOut: o.fadeOut ?? 0.3, onEvent: o.onEvent, maxW: o.weight ?? 1 });
    this.upperW = this.upperW ?? 0;
    this.upperOn = true;
    return p;
  }
  stopUpper(fade = 0.3) {
    this.upperOn = false;
    this.upperFade = fade;
  }
  additive(name, o = {}) {
    const clip = getClip(name);
    if (!clip) return Promise.resolve();
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    this.adds.push({ clip, t: 0, speed: o.speed ?? 1, w: o.weight ?? 1, resolve });
    return p;
  }
  toLoco(fade = 0.3) {
    if (this.mode === 'loco') return;
    this._finishTop(this.base);
    this.base.push({ ...this._locoState(fade > 0 ? 0 : 1), rate: fade > 0 ? 1 / fade : 0 });
    this.mode = 'loco';
  }
  _finishTop(stack) {
    const top = stack[stack.length - 1];
    if (top && top.resolve && !top.resolved) { top.resolved = true; top.resolve(false); }
  }
  setExpression(name, v, fade = 0.25) {
    const e = this.expr[name] || (this.expr[name] = { v: 0, target: 0, rate: 4 });
    e.target = v;
    e.rate = fade > 0 ? 1 / fade : 1000;
  }

  // ---------------------------------------------------------------- evaluation
  update(dt, ctx) {
    this.time += dt;
    // locomotion phase
    const L = this.loco;
    const vRef = Math.max(0, L.speed) / this.legScale;
    const ws = locoWeights(vRef, L.set);
    L.weights = ws;
    let stride = 0, wsum = 0;
    for (const [nm, w] of ws) {
      if (nm === L.set.idle) continue;
      const c = getClip(nm);
      if (c && c.stride) { stride += c.stride * w; wsum += w; }
    }
    L.wMove = wsum;
    if (wsum > 0) {
      const D = (stride / wsum) * Math.max(wsum, 0.4);
      L.phase = (L.phase + (vRef / D) * dt) % 1;
    } else if (Math.abs(this.yawRate) > 0.8) {
      L.phase = (L.phase + Math.min(2, Math.abs(this.yawRate)) * 0.35 * dt) % 1;
    }
    this._evalStack(this.base, dt, this.out, this.hips, true);
    // upper layer
    if (this.upper.length) {
      const target = this.upperOn ? (this.upper[this.upper.length - 1].maxW ?? 1) : 0;
      const rate = this.upperOn ? 4 : 1 / Math.max(0.05, this.upperFade || 0.3);
      this.upperW = approach(this.upperW ?? 0, target, rate * dt);
      this._evalStack(this.upper, dt, this.up, this.upH, false);
      const mask = this.upper[this.upper.length - 1].mask || UPPER_MASK;
      const W = this.upperW;
      for (let i = 0; i < this.n; i++) {
        const m = (mask[this.names[i]] ?? 0) * W;
        if (m <= 0) continue;
        slerpArr(this.out, this.up, i * 4, m);
      }
      if (!this.upperOn && this.upperW <= 0.001) {
        for (const s of this.upper) if (s.resolve && !s.resolved) { s.resolved = true; s.resolve(false); }
        this.upper.length = 0;
      }
    }
    // additive gestures
    for (let a = this.adds.length - 1; a >= 0; a--) {
      const A = this.adds[a];
      A.t += dt * A.speed;
      const c = A.clip;
      const f = Math.min(c.frames - 1, (A.t / c.dur) * (c.frames - 1));
      const env = Math.min(1, A.t / 0.12, (c.dur - A.t) / 0.15) * A.w;
      for (const b in c.tracks) {
        const i = this.idx[b];
        if (i === undefined) continue;
        sampleTrack(c.tracks[b], c.frames, f, this.tmp, i * 4);
        // delta from the clip's first frame
        _q.fromArray(c.tracks[b], 0).invert();
        _q2.fromArray(this.tmp, i * 4);
        _q.multiply(_q2);
        _q2.identity().slerp(_q, Math.max(0, env));
        _q3.fromArray(this.out, i * 4).multiply(_q2);
        _q3.toArray(this.out, i * 4);
      }
      if (A.t >= c.dur) { this.adds.splice(a, 1); A.resolve(true); }
    }
    this._procedural(dt, ctx);
  }

  _evalStack(stack, dt, out, hipsOut, isBase) {
    // advance and fade
    for (let s = 0; s < stack.length; s++) {
      const st = stack[s];
      if (st.w < 1 && st.rate > 0) st.w = Math.min(1, st.w + st.rate * dt);
      else if (st.rate === 0) st.w = 1;
      if (st.kind === 'clip') this._advance(st, dt, isBase, stack);
    }
    // drop states fully covered by a later full-weight state
    for (let s = stack.length - 1; s > 0; s--) {
      if (stack[s].w >= 1) {
        const removed = stack.splice(0, s);
        for (const r of removed) if (r.resolve && !r.resolved) { r.resolved = true; r.resolve(false); }
        break;
      }
    }
    for (let s = 0; s < stack.length; s++) {
      const st = stack[s];
      const target = s === 0 ? out : this.tmp;
      const th = s === 0 ? hipsOut : this.tmpH;
      if (st.kind === 'loco') this._sampleLoco(target, th);
      else this._sampleClip(st, target, th);
      if (s > 0) {
        for (let i = 0; i < this.n; i++) slerpArr(out, this.tmp, i * 4, st.w);
        for (let c = 0; c < 3; c++) hipsOut[c] += (this.tmpH[c] - hipsOut[c]) * st.w;
      }
    }
    // face channels from the top clip (weighted)
    if (isBase) {
      for (const f of FACE_KEYS) this.faceTmp[f] = 0;
      for (const st of stack) {
        if (st.kind !== 'clip' || !st.clip.face) continue;
        const fr = Math.min(st.clip.frames - 1, (st.t / st.clip.dur) * (st.clip.frames - 1));
        for (const f in st.clip.face) {
          const arr = st.clip.face[f];
          const i0 = Math.floor(fr), i1 = Math.min(arr.length - 1, i0 + 1);
          this.faceTmp[f] += (arr[i0] + (arr[i1] - arr[i0]) * (fr - i0)) * st.w;
        }
      }
    }
  }

  _advance(st, dt, isBase, stack) {
    const c = st.clip;
    const prev = st.t;
    st.t += dt * st.speed;
    // events
    if (c.events.length) {
      for (const ev of c.events) {
        const crossed = st.loop ? ((prev % c.dur) < ev.t && (st.t % c.dur) >= ev.t) || (st.t % c.dur < prev % c.dur && ev.t > prev % c.dur) : prev < ev.t && st.t >= ev.t;
        if (crossed) {
          this.ch._clipEvent(ev.name, c.name);
          if (st.onEvent) st.onEvent(ev.name);
        }
      }
    }
    if (st.loop) {
      if (st.t >= c.dur) st.t %= c.dur;
      return;
    }
    if (st.t >= c.dur && !st.ended) {
      st.ended = true;
      st.t = c.dur;
      if (st.resolve && !st.resolved) { st.resolved = true; st.resolve(true); }
      if (stack[stack.length - 1] !== st) return;
      if (st.then) {
        const nxt = getClip(st.then);
        if (nxt) {
          stack.push({ kind: 'clip', clip: nxt, t: 0, speed: 1, loop: nxt.loop, w: 0, rate: 1 / 0.2, hold: nxt.hold, then: nxt.then, evI: 0, mask: st.mask });
          return;
        }
      }
      if (st.hold) return;
      if (isBase) {
        stack.push({ ...this._locoState(0), rate: 1 / Math.max(0.05, st.fadeOut) });
        this.mode = 'loco';
      } else {
        this.upperOn = false;
        this.upperFade = st.fadeOut;
      }
    }
  }

  _sampleClip(st, out, hipsOut) {
    const c = st.clip;
    const f = Math.min(c.frames - 1, (st.t / c.dur) * (c.frames - 1));
    this._sampleClipAt(c, f, out, hipsOut);
  }

  _sampleClipAt(c, f, out, hipsOut) {
    for (let i = 0; i < this.n; i++) {
      const tr = c.tracks[this.names[i]];
      if (tr) sampleTrack(tr, c.frames, f, out, i * 4);
      else { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 1; }
    }
    if (c.hips) {
      const i0 = Math.floor(f), i1 = Math.min(c.frames - 1, i0 + 1), fr = f - i0;
      for (let k = 0; k < 3; k++) hipsOut[k] = c.hips[i0 * 3 + k] + (c.hips[i1 * 3 + k] - c.hips[i0 * 3 + k]) * fr;
    } else { hipsOut[0] = 0; hipsOut[1] = 0; hipsOut[2] = 0; }
  }

  _sampleLoco(out, hipsOut) {
    const L = this.loco;
    const ws = L.weights || [[L.set.idle, 1]];
    let first = true;
    let acc = 0;
    const buf = this._locoBuf || (this._locoBuf = new Float32Array(this.n * 4));
    const hb = this._locoH || (this._locoH = new Float32Array(3));
    for (const [nm, w] of ws) {
      if (w <= 0.001) continue;
      const c = getClip(nm);
      if (!c) continue;
      const f = c.stride ? L.phase * (c.frames - 1) : ((this.time / c.dur) % 1) * (c.frames - 1);
      if (first) {
        this._sampleClipAt(c, f, out, hipsOut);
        first = false;
        acc = w;
        continue;
      }
      this._sampleClipAt(c, f, buf, hb);
      acc += w;
      const t = w / acc;
      for (let i = 0; i < this.n; i++) slerpArr(out, buf, i * 4, t);
      for (let k = 0; k < 3; k++) hipsOut[k] += (hb[k] - hipsOut[k]) * t;
    }
  }

  // ---------------------------------------------------------------- procedural layers
  _procedural(dt, ctx) {
    const ch = this.ch;
    const T = this.time;
    const moving = this.loco.wMove;
    // posture: elders stoop, everyone a little tired
    const stoop = ch.M.stoop || 0;
    if (stoop > 0) {
      addEuler(this.out, this.idx.spine, 7 * stoop, 0, 0);
      addEuler(this.out, this.idx.chest, 10 * stoop, 0, 0);
      addEuler(this.out, this.idx.neck, 12 * stoop, 0, 0);
      addEuler(this.out, this.idx.head, -16 * stoop, 0, 0);
      for (const S of ['L', 'R']) {
        addEuler(this.out, this.idx['thigh' + S], -6 * stoop, 0, 0);
        addEuler(this.out, this.idx['shin' + S], 9 * stoop, 0, 0);
        addEuler(this.out, this.idx['foot' + S], -3 * stoop, 0, 0);
      }
      this.hips[1] -= 0.012 * stoop;
    }
    if (ctx.lod > 1) return this._write(dt, ctx);
    // breathing
    const br = Math.sin(T * (1.4 + moving * 1.2) + ch.seedPhase);
    addEuler(this.out, this.idx.chest, -0.9 * br, 0, 0);
    addEuler(this.out, this.idx.spine, 0.4 * br, 0, 0);
    if (this.idx.shoulderL !== undefined) {
      addEuler(this.out, this.idx.shoulderL, 0, 0, 0.8 * br, 'L');
      addEuler(this.out, this.idx.shoulderR, 0, 0, 0.8 * br, 'R');
    }
    // turn lean and acceleration lean
    const speed = this.loco.speed;
    const leanT = clampV((this.yawRate / D2R) * speed * 0.045, -14, 14);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 5);
    if (Math.abs(this.lean) > 0.05) {
      addEuler(this.out, this.idx.hips, 0, 0, -this.lean * 0.6);
      addEuler(this.out, this.idx.spine, 0, 0, -this.lean * 0.3);
      addEuler(this.out, this.idx.head, 0, 0, this.lean * 0.5);
    }
    // cold shiver
    if (this.shiver > 0) {
      const s = this.shiver * (0.6 + 0.4 * Math.sin(T * 0.7));
      addEuler(this.out, this.idx.chest, Math.sin(T * 37) * 0.6 * s, 0, Math.sin(T * 41) * 0.5 * s);
      if (this.idx.shoulderL !== undefined) {
        addEuler(this.out, this.idx.shoulderL, 0, 0, Math.sin(T * 33) * 1.2 * s, 'L');
        addEuler(this.out, this.idx.shoulderR, 0, 0, Math.sin(T * 35 + 1) * 1.2 * s, 'R');
      }
      this.faceTmp.jawOpen += (0.04 + 0.04 * Math.sin(T * 45)) * s;
    }
    this._write(dt, ctx);
  }

  _write(dt, ctx) {
    const ch = this.ch;
    // look-at and talking head motion are applied on top of the pose
    if (ctx.lod <= 1) this._lookAt(dt, ctx);
    for (let i = 0; i < this.n; i++) this.boneObjs[i].quaternion.fromArray(this.out, i * 4);
    const ls = this.legScale;
    ch.rig.byName.hips.position.set(this.hipsBind.x + this.hips[0] * ls, this.hipsBind.y + this.hips[1] * ls, this.hipsBind.z + this.hips[2] * ls);
    if (ctx.lod <= 1) this._face(dt);
  }

  _lookAt(dt, ctx) {
    const L = this.look;
    const ch = this.ch;
    const by = ch.rig.byName;
    let wantYaw = 0, wantPitch = 0, active = 0;
    if (L.target) {
      const tp = L.target.isVector3 ? L.target : L.target.getWorldPosition(_v2);
      // express target in the character's root frame, relative to the head position (approx)
      ch.root.updateMatrixWorld();
      _m.copy(ch.root.matrixWorld).invert();
      _v.copy(tp).applyMatrix4(_m);
      const hy = by.head.getWorldPosition(_v2).applyMatrix4(_m);
      const dx = _v.x - hy.x, dy = _v.y - hy.y - 0.07 * ch.M.headK, dz = _v.z - hy.z;
      wantYaw = Math.atan2(dx, dz);
      wantPitch = -Math.atan2(dy, Math.hypot(dx, dz));
      active = Math.abs(wantYaw) < 2.4 ? 1 : 0;
    }
    L.w = approach(L.w, active, dt * 3);
    const yawLim = 1.2, pitchLim = 0.55;
    const ty = clampV(wantYaw, -yawLim, yawLim) * L.w, tp2 = clampV(wantPitch, -pitchLim, pitchLim) * L.w;
    // head follows with a damped spring; eyes lead
    const k = 1 - Math.exp(-dt * 5);
    L.yaw += (ty - L.yaw) * k;
    L.pitch += (tp2 - L.pitch) * k;
    const ke = 1 - Math.exp(-dt * 18);
    const eyT = clampV((wantYaw * L.w) - L.yaw, -0.45, 0.45), epT = clampV((wantPitch * L.w) - L.pitch, -0.3, 0.3);
    L.eyeYaw += (eyT - L.eyeYaw) * ke;
    L.eyePitch += (epT - L.eyePitch) * ke;
    // talking head bobs
    const ts = this.talkS;
    const nod = ts.nod;
    const yawD = L.yaw / D2R, pitD = L.pitch / D2R + nod;
    if (Math.abs(yawD) > 0.01 || Math.abs(pitD) > 0.01) {
      preEuler(this.out, this.idx.chest, pitD * 0.05, yawD * 0.12, 0);
      preEuler(this.out, this.idx.neck, pitD * 0.4, yawD * 0.38, 0);
      preEuler(this.out, this.idx.head, pitD * 0.55, yawD * 0.5, 0);
    }
    if (by.eyeL) {
      _e.set(L.eyePitch, L.eyeYaw, 0, 'YXZ');
      by.eyeL.quaternion.setFromEuler(_e);
      by.eyeR.quaternion.setFromEuler(_e);
    }
    void ctx;
  }

  _face(dt) {
    const by = this.ch.rig.byName;
    if (!by.jaw) return;
    const F = this.faceTmp;
    // expressions set through the API
    let api = 0;
    for (const nm in this.expr) {
      const e = this.expr[nm];
      e.v = approach(e.v, e.target, e.rate * dt);
      F[nm] = (F[nm] || 0) + e.v;
      if (nm !== 'browUp' || !this.talking) api = Math.max(api, e.v);
    }
    const restK = 1 - Math.min(1, api * 1.4);
    if (restK > 0) for (const nm in this.rest) F[nm] = (F[nm] || 0) + this.rest[nm] * restK;
    // talking: syllable-like jaw flaps
    const ts = this.talkS;
    if (this.talking) {
      ts.next -= dt;
      if (ts.next <= 0) {
        const pause = Math.random() < 0.12;
        ts.target = pause ? 0 : 0.25 + Math.random() * 0.75;
        ts.narrow = Math.random() < 0.3 ? Math.random() * 0.6 : 0;
        ts.next = pause ? 0.25 + Math.random() * 0.2 : 0.07 + Math.random() * 0.11;
        if (Math.random() < 0.08) ts.nodV = (Math.random() * 2 - 1) * 3;
      }
      ts.gestureT -= dt;
      if (ts.gestureT <= 0) {
        ts.gestureT = 3 + Math.random() * 4;
        if (!this.upper.length && this.mode === 'loco' && this.loco.speed < 0.2) this.ch.gesture(['talk_1', 'talk_2', 'talk_3'][Math.floor(Math.random() * 3)], { weight: 0.7 });
        if (Math.random() < 0.5) this.setExpression('browUp', 0.35, 0.2), setTimeout(() => this.setExpression('browUp', 0, 0.4), 500);
      }
    } else ts.target = 0;
    ts.jaw += (ts.target - ts.jaw) * Math.min(1, dt * 22);
    ts.nod += (ts.nodV - ts.nod) * Math.min(1, dt * 4);
    ts.nodV *= Math.max(0, 1 - dt * 3);
    F.jawOpen = (F.jawOpen || 0) + ts.jaw * 0.55;
    F.mouthNarrow = (F.mouthNarrow || 0) + ts.narrow * ts.jaw;
    // blinking
    const B = this.blink;
    B.t -= dt;
    if (B.t <= 0) { B.v = 1; B.t = 2 + Math.random() * 4.5; if (Math.random() < 0.15) B.t = 0.25; }
    const blinkAmt = B.v > 0 ? Math.sin(Math.min(1, B.v) * Math.PI) : 0;
    if (B.v > 0) B.v -= dt / 0.16;
    F.eyesClosed = Math.min(1, (F.eyesClosed || 0) + blinkAmt);
    // lids follow vertical gaze
    const gaze = this.look.eyePitch / D2R;
    // compose face bones
    const hk = this.headK;
    for (const b of FACE_BONES) {
      const bone = by[b];
      if (!bone) continue;
      const bp = this.faceBind[b];
      let px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0;
      for (const nm of FACE_KEYS) {
        const w = F[nm];
        if (!w) continue;
        const d = FACE[nm][b];
        if (!d) continue;
        if (Array.isArray(d)) { px += d[0] * w; py += d[1] * w; pz += d[2] * w; }
        else if (d.r) { rx += d.r[0] * w; ry += d.r[1] * w; rz += d.r[2] * w; }
      }
      if (b === 'lidUL' || b === 'lidUR') rx += gaze * 0.5;
      if (b === 'lidLL' || b === 'lidLR') rx += gaze * 0.25;
      bone.position.set(bp.x + px * hk, bp.y + py * hk, bp.z + pz * hk);
      if (b === 'jaw' || b.startsWith('lid')) {
        if (b.startsWith('lidU')) rx = Math.min(rx, 44);
        _e.set(rx * D2R, ry * D2R, rz * D2R, 'XYZ');
        bone.quaternion.setFromEuler(_e);
      }
    }
  }
}

// ---------------------------------------------------------------- helpers
export function locoWeights(v, set) {
  const walkV = 1.3, runV = 3.57, sprintV = 6.0;
  if (v < 0.03) return [[set.idle, 1]];
  if (v < walkV) {
    const w = smooth01(v / (walkV * 0.6));
    return [[set.idle, 1 - w], [set.walk, w]];
  }
  if (v < runV) {
    const t = smooth01((v - walkV) / (runV - walkV));
    return [[set.walk, 1 - t], [set.run, t]];
  }
  const t = smooth01((v - runV) / (sprintV - runV));
  return [[set.run, 1 - t], [set.sprint, t]];
}
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const approach = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));
const clampV = (v, a, b) => (v < a ? a : v > b ? b : v);

function slerpArr(out, src, o, t) {
  if (t <= 0) return;
  if (t >= 1) { out[o] = src[o]; out[o + 1] = src[o + 1]; out[o + 2] = src[o + 2]; out[o + 3] = src[o + 3]; return; }
  let x = src[o], y = src[o + 1], z = src[o + 2], w = src[o + 3];
  const d = out[o] * x + out[o + 1] * y + out[o + 2] * z + out[o + 3] * w;
  if (d < 0) { x = -x; y = -y; z = -z; w = -w; }
  const ox = out[o] + (x - out[o]) * t, oy = out[o + 1] + (y - out[o + 1]) * t, oz = out[o + 2] + (z - out[o + 2]) * t, ow = out[o + 3] + (w - out[o + 3]) * t;
  const l = 1 / Math.sqrt(ox * ox + oy * oy + oz * oz + ow * ow);
  out[o] = ox * l; out[o + 1] = oy * l; out[o + 2] = oz * l; out[o + 3] = ow * l;
}

// Post-multiply a local euler offset (degrees): rotation in the bone's own frame.
function addEuler(arr, i, x, y, z, side) {
  if (i === undefined) return;
  const s = side === 'R' ? -1 : 1;
  _e.set(x * D2R, y * D2R * s, z * D2R * s, 'XYZ');
  _q2.setFromEuler(_e);
  _q.fromArray(arr, i * 4).multiply(_q2).toArray(arr, i * 4);
}
// Pre-multiply (rotation in the parent's frame): used for look-at so it composes with any pose.
function preEuler(arr, i, x, y, z) {
  if (i === undefined) return;
  _e.set(x * D2R, y * D2R, z * D2R, 'YXZ');
  _q2.setFromEuler(_e);
  _q.fromArray(arr, i * 4);
  _q2.multiply(_q).toArray(arr, i * 4);
}

export { FPS };
