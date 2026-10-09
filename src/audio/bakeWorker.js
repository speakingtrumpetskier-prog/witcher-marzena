// Web Worker that bakes SFX variants and loops off the main thread. Same seeds as Bank.get
// (rng(hash(key))), so a buffer baked here is identical to one baked synchronously.
// Message in:  { key, kind: 'sfx' | 'loop' | 'music', name, i, rate }
// Message out: { key, rate, data: [Float32Array, ...] } (transferred)
import { RECIPES, LOOPS } from './sfx/recipes/index.js';
import { rng, hash, normalize, trimTail } from './dsp.js';
import { bakeByKey } from './instruments/baked.js';

self.onmessage = (e) => {
  const { key, kind, name, i, rate } = e.data;
  try {
    let d;
    if (kind === 'music') d = bakeByKey(key, rate, rng(hash(key)));
    else {
      const rec = kind === 'loop' ? LOOPS[name] : RECIPES[name];
      d = kind === 'loop' ? rec.bake(rate, rng(hash(key))) : rec.bake(rate, rng(hash(key)), i);
      if (!Array.isArray(d)) d = [d];
      d = d.map((c) => normalize(c, 0.89));
      if (kind !== 'loop') d = trimTail(d, rate);
    }
    self.postMessage({ key, rate, data: d }, d.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ key, error: String(err && err.message) });
  }
};
