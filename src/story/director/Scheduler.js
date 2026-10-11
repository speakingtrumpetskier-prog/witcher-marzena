// Frame-driven timers and tweens for the story systems. Everything that a cutscene can skip
// goes through here, so `flush()` can resolve every pending wait and jump every tween to its end.
//
//   const S = new Scheduler();      S.update(dt) once per frame (story/index.js does it)
//   await S.wait(1.5)               resolves after 1.5 s of game frames (instantly while flushing)
//   await S.tween({ dur, ease, step: (k) => {} })   k goes 0..1 through the easing curve
//   S.flush()                       resolve all waits now, finish all tweens (cutscene skip)
//   S.instant = true                while set, new waits and tweens complete immediately
//
// EASE: linear, in, out, inOut (default for camera moves), sine, expoOut, backOut.

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoOut: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  backOut: (t) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
};

export function easeFn(e) {
  if (typeof e === 'function') return e;
  return EASE[e] || EASE.inOut;
}

export class Scheduler {
  constructor() {
    this.waits = [];
    this.tweens = [];
    this.instant = false;
    this.time = 0;
  }

  wait(seconds = 0) {
    if (this.instant || !(seconds > 0)) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ left: seconds, resolve }));
  }

  // Generic tween. `step(k)` receives the eased progress. Returns a Promise resolved at the end
  // (or when cancelled through the returned promise's `cancel`).
  tween({ dur = 1, ease = 'inOut', step, done }) {
    const fn = easeFn(ease);
    if (this.instant || !(dur > 0)) {
      step?.(1);
      done?.();
      return Promise.resolve();
    }
    let item;
    const p = new Promise((resolve) => {
      item = { t: 0, dur, fn, step, done, resolve };
      this.tweens.push(item);
      step?.(0);
    });
    p.cancel = () => {
      const i = this.tweens.indexOf(item);
      if (i >= 0) this.tweens.splice(i, 1);
      item.resolve();
    };
    return p;
  }

  // Tween a numeric property, a Vector3 / Color (anything with lerpVectors or lerpColors), or a uniform.
  prop(obj, key, to, dur = 1, ease = 'inOut') {
    if (!obj) return Promise.resolve();
    const cur = obj[key];
    if (typeof cur === 'number') {
      const from = cur;
      return this.tween({ dur, ease, step: (k) => { obj[key] = from + (to - from) * k; } });
    }
    if (cur && typeof cur.clone === 'function' && typeof cur.copy === 'function') {
      const from = cur.clone();
      const target = Array.isArray(to) ? cur.clone().fromArray(to) : typeof to === 'number' && cur.isColor ? cur.clone().setHex(to) : to;
      return this.tween({
        dur, ease,
        step: (k) => {
          if (cur.lerpVectors) cur.lerpVectors(from, target, k);
          else if (cur.lerpColors) cur.lerpColors(from, target, k);
          else cur.copy(k >= 1 ? target : from);
        },
      });
    }
    obj[key] = to;
    return Promise.resolve();
  }

  update(dt) {
    this.time += dt;
    if (this.waits.length) {
      const ready = [];
      for (let i = this.waits.length - 1; i >= 0; i--) {
        const w = this.waits[i];
        w.left -= dt;
        if (w.left <= 0) { this.waits.splice(i, 1); ready.push(w); }
      }
      for (const w of ready) w.resolve();
    }
    if (this.tweens.length) {
      const finished = [];
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.t = Math.min(tw.dur, tw.t + dt);
        const k = tw.t / tw.dur;
        try { tw.step?.(tw.fn(k)); } catch (e) { console.error('[story tween]', e); }
        if (k >= 1) { this.tweens.splice(i, 1); finished.push(tw); }
      }
      for (const tw of finished) { tw.done?.(); tw.resolve(); }
    }
  }

  // Resolve everything now (skip). Tweens jump to their final value.
  flush() {
    const ws = this.waits.splice(0);
    const ts = this.tweens.splice(0);
    for (const tw of ts) {
      try { tw.step?.(1); } catch (e) { console.error('[story tween]', e); }
      tw.done?.();
      tw.resolve();
    }
    for (const w of ws) w.resolve();
  }
}
