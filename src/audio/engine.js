// The audio engine: one per AudioContext (realtime in the game, OfflineAudioContext in the render
// script). Owns the mixer, the sample bank, the music director, the SFX player and the ambience.
// It knows nothing about G: the game passes an `env` function (listener position, weather, time)
// and an `emit` function for events, so the same code renders offline.
import { Mixer } from './mixer.js';
import { Bank, BAKE_RATE } from './bank.js';
import { Director } from './music/director.js';
import { SfxPlayer } from './sfx/player.js';
import { Ambience } from './ambience.js';
import { rng, hash, white, pink, wander, makeLoop } from './dsp.js';

export function createEngine(ctx, { offline = false, seed = 1, volumes, quality = 'high', env = null, emit = null } = {}) {
  const eng = { ctx, offline, quality };
  const sessionSeed = offline ? seed : (Math.random() * 1e9) | 0;
  const base = rng(seed * 7919 + 1);
  eng.random = offline ? base : Math.random;
  eng.rngFor = (key, session = false) => rng(hash(key, session ? sessionSeed : seed));
  eng.emit = emit || (() => {});
  const warned = new Set();
  eng.warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn(msg); } };

  // Timers on the audio clock (run from tick; safe offline).
  eng.timers = [];
  eng.at = (time, fn) => { eng.timers.push({ time, fn }); };

  eng.mixer = new Mixer(ctx, { volumes });
  eng.bank = new Bank(ctx);
  // Realtime: SFX and loops bake in a worker so the game never stalls. Offline renders bake inline.
  if (!offline && typeof Worker !== 'undefined') {
    try { eng.bank.attachWorker(new Worker(new URL('./bakeWorker.js', import.meta.url), { type: 'module' })); }
    catch (e) { console.warn('[audio] bake worker unavailable, baking on the main thread', e); }
  }

  // Shared modulation and noise sources for live instruments.
  const mk = (data, rate) => {
    const b = ctx.createBuffer(1, data.length, rate);
    b.copyToChannel(data, 0);
    return b;
  };
  const r = rng(hash('shared-buffers', 3));
  // All three loop forever under every live voice, so each must loop without a seam (white noise has none to
  // hide; pink is crossfaded tail into head; the jitter eases back to its first point).
  eng.noiseBuf = mk(white(BAKE_RATE * 3, r), BAKE_RATE);
  eng.pinkBuf = mk(makeLoop(pink(BAKE_RATE * 8 + BAKE_RATE / 2, r), BAKE_RATE, 0.5), BAKE_RATE);
  eng.jitterBuf = mk(wander(8000 * 20, 8000, 9, r, true), 8000);

  eng.director = new Director(eng);
  eng.sfx = new SfxPlayer(eng);
  eng.ambience = new Ambience(eng, env || (() => ({})));

  eng.tick = (dt = 1 / 60) => {
    eng.director.tick();
    eng.sfx.tick(dt);
    eng.ambience.update(dt);
    if (eng.timers.length) {
      const now = ctx.currentTime;
      const due = eng.timers.filter((t) => t.time <= now);
      if (due.length) {
        eng.timers = eng.timers.filter((t) => t.time > now);
        for (const t of due) { try { t.fn(); } catch (e) { console.error(e); } }
      }
    }
  };
  return eng;
}
