#!/usr/bin/env node
// Performance and flicker probes. Starts a Vite dev server (or reuses --server), drives Chrome the
// same way scripts/shot.mjs does (MZ_CHROME=1 for the installed Google Chrome on the GPU, MZ_GPU=1
// for Playwright's Chromium on the GPU, software otherwise) and prints a short report.
//
//   node scripts/perf.mjs boot    [--w 1920 --h 1080 --dpr 1.25 --secs 20 --q "quality=medium"]
//     boot milestones (modules, shader warm-up, first frames, title), long blocking frames, then the
//     title's frame times with no screenshots, the pixel ratio dynamic resolution settled on, draw calls
//   node scripts/perf.mjs flicker [--secs 40 --run 1]
//     per-frame mean brightness of the lower and upper picture (downsampled, so grain averages out),
//     single-frame spikes, steps between half-second windows, environment-map swaps, and which
//     uniforms and lights changed in steps. --run 1 lets the clock run (the title holds it).
//   node scripts/perf.mjs cost    [--res 0.65]
//     hides the heaviest top-level scene groups one at a time (no shader recompiles) and reports the
//     median frame time without each, plus shadows frozen and bloom/rays off.
// Common: --server http://127.0.0.1:5173 (reuse), --timeout 900000, --out shots/perf.png (one picture at the end)
// Never time frames in a hidden browser pane or a background tab: they pause requestAnimationFrame.
/* global window, document, requestAnimationFrame */
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  try { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); } catch { /* fall through */ }
  try { return await import('playwright-core'); } catch { /* fall through */ }
  console.error('Playwright is not installed. With Google Chrome:  npm install --no-save playwright-core  and set MZ_CHROME=1');
  process.exit(2);
}

const argv = process.argv.slice(2);
const mode = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'boot';
const opts = { w: 1280, h: 720, dpr: 1, secs: mode === 'flicker' ? 40 : 20, q: '', timeout: 900000, res: '0.65', run: 0 };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const v = argv[i + 1]; opts[argv[i].slice(2)] = isNaN(+v) ? v : +v; i++; }

let server = null, base = opts.server;
if (!base) {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
}
const { chromium } = await loadPlaywright();
const CHROME = process.env.MZ_CHROME === '1';
const GPU = process.env.MZ_GPU === '1' || CHROME;
const browser = await chromium.launch({
  ...(CHROME ? { channel: 'chrome' } : GPU ? { channel: 'chromium' } : {}),
  headless: process.env.MZ_HEADED !== '1',
  args: GPU ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: opts.dpr });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/^\[boot\]/.test(t) || m.type() === 'error') logs.push(t.slice(0, 300)); });
page.on('pageerror', (e) => logs.push('pageerror ' + String(e).slice(0, 300)));

// In-page recorder: milestones, every frame's time, pixel ratio changes, and (flicker mode) a
// downsampled brightness of each final frame plus a change log of uniforms and lights.
await page.addInitScript((flicker) => {
  const P = window.__perf = { marks: [], frames: [], pr: [], rows: [], changes: [], armed: false };
  const now = () => performance.now() / 1000;
  let last = performance.now(), lastPr = 0;
  const loop = () => {
    const n = performance.now();
    P.frames.push([n / 1000, n - last]); last = n;
    const G = window.__G, pr = G && G.renderer ? G.renderer.getPixelRatio() : 0;
    if (pr !== lastPr) { P.pr.push([+(n / 1000).toFixed(1), pr]); lastPr = pr; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const hook = setInterval(() => {
    const G = window.__G;
    if (!G || !G.events || !G.renderer || !G.scene) return;
    clearInterval(hook);
    for (const e of ['game:ready', 'title:open', 'loading:done']) G.events.on(e, () => P.marks.push([e, +now().toFixed(2)]));
    if (!flicker) return;
    const R = G.renderer, orig = R.render.bind(R);
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const flat = () => {
      const out = {};
      for (const [k, u] of Object.entries(G.uniforms || {})) {
        const v = u && u.value;
        if (typeof v === 'number') out['U.' + k] = v;
        else if (v && typeof v === 'object') for (const c of ['x', 'y', 'z', 'w', 'r', 'g', 'b']) if (typeof v[c] === 'number') out['U.' + k + '.' + c] = v[c];
      }
      let li = 0;
      G.scene.traverse((o) => { if (o.isLight) { out['L' + li + '.' + (o.name || o.type) + '.i'] = o.intensity; li++; } });
      out.exposure = R.toneMappingExposure;
      out.env = G.scene.environment ? G.scene.environment.id : 0;
      return out;
    };
    let prev = null;
    R.render = function (scene, camera) {
      const r = orig(scene, camera);
      if (P.armed && R.getRenderTarget() === null) {
        cx.drawImage(R.domElement, 0, 0, 160, 90);
        const d = cx.getImageData(0, 0, 160, 90).data;
        let lo = 0, hi = 0, nl = 0, nh = 0;
        for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
          const k = (y * 160 + x) * 4, l = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
          if (y >= 50) { lo += l; nl++; } else if (y < 30) { hi += l; nh++; }
        }
        const t = +now().toFixed(3);
        P.rows.push([t, +(lo / nl).toFixed(2), +(hi / nh).toFixed(2)]);
        const cur = flat();
        if (prev) for (const k in cur) if (Math.abs(cur[k] - prev[k]) > 1e-6 * Math.max(1, Math.abs(prev[k]))) P.changes.push([t, k, prev[k], cur[k]]);
        prev = cur;
      }
      return r;
    };
  }, 10);
}, mode === 'flicker');

const q = [opts.q, mode === 'cost' ? `res=${opts.res}` : ''].filter(Boolean).join('&');
await page.goto(`${base}/witcher-marzena/${q ? '?' + q : ''}`, { waitUntil: 'commit', timeout: opts.timeout });
await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: opts.timeout, polling: 250 });
const tReady = await page.evaluate(() => performance.now() / 1000);

const stats = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), qq = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  return { n: s.length, median: qq(0.5), p95: qq(0.95), max: qq(1), fps: +(1000 / (a.reduce((x, y) => x + y, 0) / a.length)).toFixed(1) };
};

if (mode === 'boot') {
  await page.waitForTimeout(opts.secs * 1000);
  const r = await page.evaluate(() => {
    const G = window.__G, R = G.renderer;
    return { P: window.__perf, q: G.quality, dyn: G.dynamicRes ? { scale: G.dynamicRes.scale, cap: G.dynamicRes.cap, floor: G.dynamicRes.floor } : null, size: [R.domElement.width, R.domElement.height], info: { calls: R.info.render.calls, tris: R.info.render.triangles, programs: (R.info.programs || []).length }, par: !!R.getContext().getExtension('KHR_parallel_shader_compile') };
  });
  const after = r.P.frames.filter((f) => f[0] > tReady + 1).map((f) => f[1]);
  console.log(`quality ${r.q}, canvas ${r.size.join('x')}, parallel compile ${r.par}, dynamic resolution ${JSON.stringify(r.dyn)}`);
  console.log('milestones (s):', JSON.stringify(r.P.marks), '| ready at', tReady.toFixed(1));
  console.log('frames over 1 s before ready:', JSON.stringify(r.P.frames.filter((f) => f[0] <= tReady && f[1] > 1000).map((f) => [+f[0].toFixed(1), Math.round(f[1])])));
  console.log('title frames:', JSON.stringify(stats(after)));
  console.log('pixel ratio over time:', JSON.stringify(r.P.pr), '| draw calls', r.info.calls, 'triangles', r.info.tris, 'programs', r.info.programs);
} else if (mode === 'flicker') {
  await page.waitForTimeout(4000);
  await page.evaluate((run) => { window.__perf.armed = true; if (run) { window.__G.time.frozen = false; if (!window.__G.time.scale) window.__G.time.scale = 60; } }, opts.run);
  await page.waitForTimeout(opts.secs * 1000);
  const P = await page.evaluate(() => ({ rows: window.__perf.rows, changes: window.__perf.changes }));
  const rows = P.rows, T0 = rows.length ? rows[0][0] : 0;
  const spikes = [];
  for (let i = 1; i < rows.length - 1; i++) { const dev = rows[i][1] - (rows[i - 1][1] + rows[i + 1][1]) / 2; if (Math.abs(dev) > 6) spikes.push([+(rows[i][0] - T0).toFixed(2), +dev.toFixed(1)]); }
  const win = (a, b) => { const s = rows.filter((r) => r[0] >= a && r[0] < b).map((r) => r[1]); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
  const steps = [];
  for (let t = T0 + 0.5; rows.length && t < rows[rows.length - 1][0] - 0.5; t += 0.25) { const a = win(t - 0.5, t), b = win(t, t + 0.5); if (a != null && b != null && Math.abs(b - a) > 2.5) steps.push([+(t - T0).toFixed(2), +(b - a).toFixed(1)]); }
  const envSwaps = P.changes.filter((c) => c[1] === 'env').map((c) => c[0]);
  const at = (t) => rows.findIndex((r) => r[0] >= t);
  const envSteps = envSwaps.map((t) => { const i = at(t); if (i < 5 || i > rows.length - 6) return null; const m = (a, b) => rows.slice(a, b).reduce((x, r) => x + r[1], 0) / (b - a); return +(m(i, i + 5) - m(i - 5, i)).toFixed(2); }).filter((v) => v !== null);
  const by = {};
  for (const [, k, a, b] of P.changes) { const e = (by[k] ||= { n: 0, max: 0 }); e.n++; e.max = Math.max(e.max, Math.abs(b - a)); }
  const frameMs = rows.slice(1).map((r, i) => (r[0] - rows[i][0]) * 1000);
  console.log('frames', rows.length, 'frame time', JSON.stringify(stats(frameMs)));
  console.log('single-frame spikes (lower half, >6/255):', spikes.length, JSON.stringify(spikes.slice(0, 20)));
  console.log('steps between half-second windows (>2.5/255):', JSON.stringify(steps.slice(0, 20)));
  console.log('environment swaps', envSwaps.length, 'step at each swap:', JSON.stringify(envSteps.slice(0, 30)));
  console.log('values that changed (count, largest single-frame step):', JSON.stringify(Object.entries(by).sort((a, b) => b[1].max - a[1].max).slice(0, 12).map(([k, e]) => `${k} x${e.n} step ${e.max.toFixed(4)}`)));
} else if (mode === 'cost') {
  await page.waitForTimeout(8000);
  const out = await page.evaluate(async () => {
    const G = window.__G, R = G.renderer;
    const median = (ms) => new Promise((res) => {
      const a = []; let last = performance.now(); const t0 = last;
      const f = () => { const n = performance.now(); a.push(n - last); last = n; if (n - t0 < ms) requestAnimationFrame(f); else { a.sort((x, y) => x - y); res(+a[Math.floor(a.length / 2)].toFixed(1)); } };
      requestAnimationFrame(f);
    });
    const tri = (o) => { let t = 0; o.traverseVisible((m) => { if (!m.isMesh || !m.geometry) return; const g = m.geometry; const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0); t += (n / 3) * (m.isInstancedMesh ? m.count : 1); }); return t; };
    const key = (o) => (o.name || o.type).replace(/[:\-_].*$/, '') || o.type;
    const groups = new Map();
    for (const c of G.scene.children) { const k = key(c); const g = groups.get(k) || { objs: [], tris: 0 }; g.objs.push(c); g.tris += tri(c); groups.set(k, g); }
    const top = [...groups.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 9);
    await median(3000);
    const res = { base: await median(3000), parts: [] };
    for (const [k, g] of top) {
      const vis = g.objs.map((o) => o.visible);
      g.objs.forEach((o) => { o.visible = false; });
      await median(800);
      const ms = await median(2500);
      g.objs.forEach((o, i) => { o.visible = vis[i]; });
      await median(800);
      res.parts.push(`${k} (${g.objs.length} objects, ${Math.round(g.tris / 1000)}k tris): ${ms} ms`);
    }
    R.shadowMap.autoUpdate = false; await median(800); res.shadowsFrozen = await median(2500); R.shadowMap.autoUpdate = true; await median(800);
    const P = G.postfx; if (P) { const b = P.bloom, r = P.rays; P.bloom = 0; P.rays = 0; await median(800); res.noBloomRays = await median(2500); P.bloom = b; P.rays = r; }
    res.baseAgain = await median(3000);
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
}
if (opts.out) await page.screenshot({ path: path.resolve(ROOT, String(opts.out)) });
console.log('console:', JSON.stringify(logs.slice(0, 6)));
await browser.close();
if (server) await server.close();
