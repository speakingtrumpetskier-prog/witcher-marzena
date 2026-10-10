// Dynamic resolution: holds the frame rate near a target by scaling the internal render resolution
// between a floor and the quality's pixel-ratio cap. G.dynamicRes.
//
//   .enabled        on by default, persisted (marzena.dynres); off restores the full cap
//   .scale          current renderer pixel ratio
//   .targetMs       frame time to hold (33.3 = 30 fps)
//   .setEnabled(on)
//
// It starts from a pixel budget for the quality level, then adjusts.
// Changes are stepped and rare: every change reallocates the post-processing targets, so it waits
// at least 2.5 s between steps, drops faster than it climbs, and ignores single hitches (shader
// compiles, autosaves) and hidden tabs. ?res=0.75 pins a fixed pixel ratio instead.
import { ORDER } from '../core/G.js';

const KEY = 'marzena.dynres';

export function installDynamicRes(G) {
  const R = G.renderer;
  const dpr = window.devicePixelRatio || 1;
  const capByQuality = G.quality === 'high' ? 1.5 : G.quality === 'medium' ? 1.25 : 1;
  const cap = Math.min(dpr, capByQuality);
  const floor = Math.max(0.5, Math.min(cap, dpr) * 0.5);

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
  const pinned = parseFloat(G.params.get('res'));

  const D = {
    enabled: stored !== '0' && !(pinned > 0),
    scale: R.getPixelRatio(),
    targetMs: 1000 / 30,
    cap, floor,
    setEnabled(on) {
      D.enabled = !!on;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
      if (!D.enabled) apply(cap);
    },
  };
  G.dynamicRes = D;

  function apply(s) {
    s = Math.round(Math.min(cap, Math.max(floor, s)) * 20) / 20;
    if (Math.abs(s - R.getPixelRatio()) < 0.01) return;
    D.scale = s;
    R.setPixelRatio(s);
    const el = R.domElement.parentElement || R.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    R.setSize(w, h);
    G.events.emit('resize', { w, h });
  }

  if (pinned > 0) { apply(pinned); return D; }

  // Start near the right resolution instead of climbing down to it from the cap over several slow
  // seconds: a pixel budget per quality (integrated graphics at medium hold ~30 fps at about 1 MP).
  if (D.enabled) {
    const budget = { low: 0.6e6, medium: 1.0e6, high: 3.7e6 }[G.quality] || 1.0e6;
    const el = R.domElement.parentElement || R.domElement;
    const css = Math.max(1, el.clientWidth * el.clientHeight);
    apply(Math.sqrt(budget / css));
  }

  let ready = false, settleUntil = 0;
  G.events.once?.('loading:done', () => { ready = true; settleUntil = performance.now() + 4000; });
  // Scene loads (?scene=) never emit loading:done; arm after a grace period instead.
  setTimeout(() => { if (!ready) { ready = true; settleUntil = performance.now() + 4000; } }, 60000);

  let last = performance.now(), ema = D.targetMs, lastChange = 0, goodSince = 0;
  G.addSystem('dynamic-res', () => {
    const now = performance.now();
    const ms = now - last;
    last = now;
    if (!D.enabled || !ready || document.hidden || now < settleUntil) return;
    if (ms > 400) return; // a hitch, not a trend
    ema += (ms - ema) * 0.06;
    if (now - lastChange < 2500) return;
    const t = D.targetMs;
    if (ema > t * 1.18) {
      // Too slow: step down in proportion, at most a quarter at a time.
      apply(R.getPixelRatio() * Math.min(0.93, Math.max(0.75, Math.sqrt(t / ema))));
      lastChange = now; goodSince = 0;
    } else if (ema < t * 0.72 && R.getPixelRatio() < cap - 0.01) {
      // Comfortably fast for a while: climb back a small step.
      if (!goodSince) goodSince = now;
      if (now - goodSince > 4000) { apply(R.getPixelRatio() * 1.1); lastChange = now; goodSince = 0; }
    } else goodSince = 0;
  }, ORDER.late + 60);
  return D;
}
