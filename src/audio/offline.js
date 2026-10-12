// Offline rendering through the real engine (OfflineAudioContext), for scripts/render-audio.mjs
// and the audition page. The engine's scheduler is driven by ctx.suspend() steps exactly like the
// realtime frame loop drives it, so what renders here is what plays in the game.
//
//   const { channels, sr } = await renderJob({ kind: 'mood', name: 'village', seconds: 90 })
//   kinds: mood | stinger | stingers | sfx | ambience | sequence | inst | repeat
import { createEngine } from './engine.js';
import { MOOD_DEFS } from './music/moods/index.js';
import { STINGER_DEFS } from './music/stingers.js';
import { Score, theme, phrase, groove, motif, N } from './music/compose.js';
import { P } from './music/moods/parts.js';
import { rng, hash } from './dsp.js';
import { RECIPES } from './sfx/recipes/index.js';

const STEP = 0.05;

// Solo instrument sketches for calibration (each a short finite score).
const solo = (tempo, parts, write) => ({ tempo, beats: 3, level: 1, parts, tail: 4, *score(r) { const S = new Score(3, tempo); write(S, r); yield* S.play(); } });
export const TESTS = {
  voice: solo(72, { v: P.voice() }, (S, r) => theme(S, 'v', 0, r, { from: 0, to: 8, lyrics: true, v: 0.85 })),
  choir: solo(66, { f: P.choirF({ singers: 8 }), m: P.choirM({ singers: 5 }) }, (S, r) => { theme(S, 'f', 0, r, { style: 'choir', lyrics: true, from: 0, to: 8 }); theme(S, 'm', 0, r, { style: 'choir', lyrics: true, from: 0, to: 8, octave: -1 }); }),
  fiddle: solo(80, { v: P.fiddle() }, (S, r) => theme(S, 'v', 0, r, { style: 'fiddle', from: 0, to: 8, orn: 0.4 })),
  flute: solo(80, { v: P.flute() }, (S, r) => theme(S, 'v', 0, r, { style: 'flute', from: 0, to: 8, orn: 0.4 })),
  gurdy: solo(80, { v: P.gurdy() }, (S, r) => {
    S.ctl('v', 0, { type: 'drone', p: [50, 57], v: 0.6 });
    for (let b = 0; b < 8; b++) { S.ctl('v', b * 3, { type: 'buzz', v: 0.7 }); S.ctl('v', b * 3 + 2, { type: 'buzz', v: 0.4 }); }
    theme(S, 'v', 0, r, { style: 'gurdy', from: 0, to: 8, orn: 0.4 });
    S.ctl('v', 24, { type: 'drone', on: false });
  }),
  throat: solo(60, { v: P.throat() }, (S) => S.add('v', 0, 12, N('D2'), { v: 0.6, morph: ['u', 'o', 'a', 'e', 'o', 'u'] })),
  zither: solo(80, { v: P.zither() }, (S, r) => theme(S, 'v', 0, r, { style: 'zither', from: 0, to: 8 })),
  box: solo(70, { v: P.box() }, (S, r) => { motif(S, 'v', 0, r, { octave: 1 }); motif(S, 'v', 9, r, { octave: 1, broken: 0.6, slow: 1.5 }); }),
  drums: solo(80, { f: P.frame(), w: P.war(), p: P.pulse() }, (S, r) => { groove(S, 'f', 0, 4, 'waltzFull', r); for (let b = 0; b < 4; b++) S.add('w', b * 3, 1, null, { v: 0.8 }); S.add('p', 12, 1, null, { v: 0.7 }); S.add('w', 15, 1, null, { v: 0.8, muffled: true }); }),
  bells: solo(60, { v: P.bell() }, (S) => { S.add('v', 0, 6, N('D4'), { v: 0.7 }); S.add('v', 6, 9, N('D3'), { v: 0.8, muffled: true }); }),
  wind: solo(54, { v: P.wind() }, (S) => { S.add('v', 0, 6, [50, 57, 62, 65], { v: 0.6, fade: 2 }); S.add('v', 6, 6, [48, 55, 64, 67], { v: 0.6, fade: 2 }); }),
  ensemble: solo(66, { f: P.fiddle(), z: P.zither(), g: P.gurdy(), v: P.voice() }, (S, r) => { phrase(S, 'f', 0, [['A4', 3], ['D5', 3]], r); }),
};

export async function renderJob(job) {
  const sr = job.sr || 44100;
  const seconds = job.seconds || 30;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const env = { pos: { x: 0, y: 5, z: 0 }, wind: 0.25, gust: 0, weather: 'clear', hour: 12, ...(job.env || {}) };
  const eng = createEngine(ctx, { offline: true, seed: job.seed || 1, volumes: job.volumes, env: () => env });
  eng.ambience.enabled = job.kind === 'ambience' || !!job.ambience;
  const actions = [];
  const at = (t, fn) => actions.push([t, fn]);
  if (job.kind === 'mood') at(0, () => eng.director.setMood(job.name, { fade: 0.05 }));
  else if (job.kind === 'inst') at(0, () => playDef(eng, `test:${job.name}`, TESTS[job.name]));
  else if (job.kind === 'stinger') at(0.2, () => eng.director.stinger(job.name));
  else if (job.kind === 'stingers') job.names.forEach((n, i) => at(0.2 + i * (job.gap || 8), () => eng.director.stinger(n)));
  else if (job.kind === 'sfx') {
    let t = 0.2;
    for (const name of job.names) {
      const rec = RECIPES[name];
      const n = Math.min(job.variants || 3, rec?.variants || 1);
      for (let i = 0; i < n; i++) {
        const o = { variant: i, ...(job.opts || {}) };
        at(t, () => eng.sfx.play(name, o));
        t += job.gap || 1.2;
      }
      t += job.groupGap || 0.6;
    }
  } else if (job.kind === 'sequence') {
    for (const [t, what, name, o] of job.steps) {
      if (what === 'mood') at(t, () => eng.director.setMood(name, o || {}));
      else if (what === 'stinger') at(t, () => eng.director.stinger(name));
      else if (what === 'sfx') at(t, () => eng.sfx.play(name, o || {}));
      else if (what === 'duck') at(t, () => eng.mixer.duck(name, o));
      else if (what === 'env') at(t, () => Object.assign(env, name));
    }
  }
  if (job.moves) for (const [t, patch] of job.moves) at(t, () => Object.assign(env, patch));
  actions.sort((a, b) => a[0] - b[0]);
  // The listener stands at env.pos looking north (-Z), like the game camera would.
  const listen = () => eng.sfx.setListener(env.pos.x, env.pos.y, env.pos.z, 0, 0, -1);
  // Run t=0 actions before rendering starts.
  while (actions.length && actions[0][0] <= 0) actions.shift()[1]();
  listen();
  eng.tick(STEP);
  const marks = [];
  for (let t = STEP; t < seconds - STEP; t += STEP) {
    const tt = Math.round(t / STEP) * STEP;
    ctx.suspend(tt).then(() => {
      while (actions.length && actions[0][0] <= ctx.currentTime + 1e-6) actions.shift()[1]();
      listen();
      eng.tick(STEP);
      const sec = eng.director.active?.section;
      if (sec && (!marks.length || marks[marks.length - 1][1] !== sec)) marks.push([+ctx.currentTime.toFixed(2), sec]);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  return { channels, sr, marks, bakeMs: Math.round(eng.bank.bakeMs), bankMB: +(eng.bank.bytes / 1048576).toFixed(2) };
}

function playDef(eng, name, def) {
  // Play a composition definition directly (tests) through the director's machinery.
  const save = MOOD_DEFS[name];
  MOOD_DEFS[name] = def;
  eng.director.setMood(name, { fade: 0.05 });
  if (save) MOOD_DEFS[name] = save;
}

// Score-only analysis: when does a mood first repeat itself exactly? Hashes each bar (exact:
// every event field; melodic: part, timing, duration and pitch only) and finds the earliest
// 8-bar window equal to an earlier window.
export function repeatReport(name, minutes = 12, seed = 1) {
  const def = MOOD_DEFS[name];
  const gen = def.score(rng(hash(`mood:${name}`, seed)));
  const exact = [], melodic = [], times = [];
  let t = 0;
  while (t < minutes * 60) {
    const it = gen.next();
    if (it.done) break;
    const bar = it.value;
    times.push(t);
    const evs = bar.notes.map((n) => JSON.stringify(n, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
    exact.push(evs.join('|') + bar.tempo);
    melodic.push(bar.notes.map((n) => `${n.part}:${(+n.t).toFixed(2)}:${(+n.d).toFixed(2)}:${n.p}:${n.kind || ''}`).join('|') + bar.tempo);
    t += (bar.beats * 60) / (bar.tempo || def.tempo);
  }
  const firstRepeat = (seq, W = 8) => {
    const seen = new Map();
    for (let i = 0; i + W <= seq.length; i++) {
      const key = seq.slice(i, i + W).join('#');
      if (key.replace(/[#|0-9.]/g, '').length < 3 * W) continue; // skip windows of pure rests
      if (seen.has(key)) return { at: times[i], of: times[seen.get(key)] };
      seen.set(key, i);
    }
    return null;
  };
  return { name, bars: exact.length, seconds: Math.round(t), exact: firstRepeat(exact), melodic: firstRepeat(melodic) };
}

// 16-bit PCM WAV.
export function toWav16(channels, sr) {
  const n = channels[0].length, nc = channels.length;
  const buf = new ArrayBuffer(44 + n * nc * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

export function floatStats(channels) {
  let peak = 0, over = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; if (a >= 0.999) over++; }
  return { peak, over };
}

export { MOOD_DEFS, STINGER_DEFS, RECIPES };
