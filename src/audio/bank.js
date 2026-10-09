// Sample bank: a cache of AudioBuffers baked from our own synthesis (dsp.js). Keys are strings
// like 'zither:62:h' or 'sfx:step_snow:3'. `get` bakes synchronously on first use (a few ms at
// most per buffer); `prebake` spreads a list of bakes over idle time so most are ready early.
//
// Baked buffers use a reduced rate (32 kHz): nothing we synthesize needs content above 16 kHz,
// it halves memory, and AudioBufferSourceNode resamples for free.
import { hash, rng } from './dsp.js';

export const BAKE_RATE = 32000;

export class Bank {
  constructor(ctx, rate = BAKE_RATE) {
    this.ctx = ctx;
    this.rate = rate;
    this.map = new Map();
    this.bytes = 0;
    this.queue = [];
    this._pumping = false;
    this.bakeMs = 0;
  }

  has(key) { return this.map.has(key); }

  // fn(sr, r) returns a Float32Array (mono) or [L, R].
  get(key, fn) {
    let b = this.map.get(key);
    if (b) return b;
    if (!fn) return null;
    const t0 = performance.now();
    let data = fn(this.rate, rng(hash(key)));
    if (data instanceof Float32Array) data = [data];
    const len = Math.max(1, data[0].length);
    b = this.ctx.createBuffer(data.length, len, this.rate);
    for (let c = 0; c < data.length; c++) b.copyToChannel(data[c], c);
    this.map.set(key, b);
    this.bytes += len * data.length * 4;
    this.bakeMs += performance.now() - t0;
    return b;
  }

  // Queue bakes for idle time. items: [[key, fn], ...]
  prebake(items) {
    for (const it of items) if (!this.map.has(it[0])) this.queue.push(it);
    if (!this._pumping) this._pump();
  }

  _pump() {
    this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 6) {
        const [key, fn] = this.queue.shift();
        if (!this.map.has(key)) this.get(key, fn);
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
