// Sample bank: a cache of AudioBuffers baked from our own synthesis (dsp.js). Keys are strings
// like 'zither:62:h' or 'sfx:step_snow:3'.
//   get(key, fn, rate)   returns the buffer, baking synchronously on first use (music notes are
//                        a few ms each, so the music bakes lazily as it plays)
//   request(key, desc)   asks the bake worker for an SFX or loop (off the main thread); the
//                        buffer appears in the bank when it arrives
//   prebake(items)       main-thread fallback: spreads [key, fn, rate] bakes over idle time
// Rates are per item: nothing we synthesize needs content above 16 kHz, and murmurs and beds
// are fine at 16 kHz sample rate; AudioBufferSourceNode resamples for free.
import { hash, rng } from './dsp.js';

// Music samples: 24 kHz keeps everything we synthesize (the music box's highest partials sit
// near 10 kHz) at three quarters of the memory of 32 kHz.
export const BAKE_RATE = 24000;

export class Bank {
  constructor(ctx, rate = BAKE_RATE) {
    this.ctx = ctx;
    this.rate = rate;
    this.map = new Map();
    this.bytes = 0;
    this.queue = [];
    this._pumping = false;
    this.bakeMs = 0;
    this.worker = null;
    this.pending = new Set();
  }

  has(key) { return this.map.has(key); }

  put(key, data, rate) {
    if (this.map.has(key)) return this.map.get(key);
    if (data instanceof Float32Array) data = [data];
    const len = Math.max(1, data[0].length);
    const b = this.ctx.createBuffer(data.length, len, rate);
    for (let c = 0; c < data.length; c++) b.copyToChannel(data[c], c);
    this.map.set(key, b);
    this.bytes += len * data.length * 4;
    return b;
  }

  // fn(sr, r) returns a Float32Array (mono) or [L, R].
  get(key, fn, rate = this.rate) {
    const b = this.map.get(key);
    if (b) return b;
    if (!fn) return null;
    const t0 = performance.now();
    const data = fn(rate, rng(hash(key)));
    const ms = performance.now() - t0;
    this.bakeMs += ms;
    // Kept for the audition page: which bakes cost a frame.
    if (ms > 8 && (this.slow || (this.slow = [])).length < 40) this.slow.push(`${key} ${ms.toFixed(0)}ms`);
    return this.put(key, data, rate);
  }

  attachWorker(worker) {
    this.worker = worker;
    worker.onmessage = (e) => {
      const { key, rate, data, error } = e.data;
      this.pending.delete(key);
      if (error) { console.warn(`[audio] bake failed ${key}: ${error}`); return; }
      this.put(key, data, rate);
    };
  }

  // desc: { kind: 'sfx' | 'loop', name, i, rate }. Returns true if a bake was requested.
  request(key, desc) {
    if (this.map.has(key) || this.pending.has(key) || !this.worker) return false;
    this.pending.add(key);
    this.worker.postMessage({ key, ...desc });
    return true;
  }

  // Queue bakes for idle time. items: [[key, fn, rate], ...]
  prebake(items) {
    for (const it of items) if (!this.map.has(it[0])) this.queue.push(it);
    if (!this._pumping) this._pump();
  }

  _pump() {
    this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 6) {
        const [key, fn, rate] = this.queue.shift();
        if (!this.map.has(key)) this.get(key, fn, rate);
      }
      if (this.queue.length) schedule(step);
      else this._pumping = false;
    };
    schedule(step);
  }
}

function schedule(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 120 });
  else setTimeout(fn, 16);
}
