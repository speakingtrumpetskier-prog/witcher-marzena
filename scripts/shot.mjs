#!/usr/bin/env node
// Screenshot harness. Starts a Vite dev server, opens the game in headless Chromium (SwiftShader
// WebGL), waits for window.__MZ_READY, and captures images. Prints errors and render stats.
//
// Single shot:
//   node scripts/shot.mjs --q "cam=0,40,260&look=0,5,100&hour=15.5" --out shots/village.png
// Several shots (one browser):
//   node scripts/shot.mjs --q "..." --out a.png --q "..." --out b.png
// From a JSON file: [{ "q": "...", "out": "...", "eval": "optional js", "w": 1280, "h": 720 }]
//   node scripts/shot.mjs --batch shots/plan.json
// Frame sequence as one contact sheet (animations, cutscenes):
//   node scripts/shot.mjs --q "scene=characters&fps=30" --out sheet.png --seq 12 --every 120 --cols 4
// After load, shot mode caps rendering at 6 fps to spare the CPU; add &fps=30 for animation sheets.
// Options: --w 1280 --h 720 --eval "await __G.foo()" --timeout 900000 --frames 4
//   --wait 0 (extra ms after ready)  --server http://127.0.0.1:5173 (reuse a running server)
// "shot" is always added to the query. Output paths are relative to the repo root.
// Rendering: software by default; MZ_GPU=1 for the local GPU, MZ_HEADED=1 for a visible window.
/* global window, document, requestAnimationFrame */
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  return await import('/opt/node-tools/node_modules/playwright/index.mjs');
}

function parseArgs(argv) {
  const shots = [];
  const opts = { w: 1280, h: 720, timeout: 900000, wait: 0 }; // generous: a loaded machine can take many minutes to build the world
  let cur = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    const take = () => { i++; return v; };
    if (a === '--q') { cur = { q: take() }; shots.push(cur); }
    else if (a === '--out') { (cur || (cur = shots[shots.push({ q: '' }) - 1])).out = take(); }
    else if (a === '--eval') { if (cur) cur.eval = take(); else opts.eval = take(); }
    else if (a === '--seq') { if (cur) cur.seq = +take(); else opts.seq = +take(); }
    else if (a === '--every') { if (cur) cur.every = +take(); else opts.every = +take(); }
    else if (a === '--cols') { if (cur) cur.cols = +take(); else opts.cols = +take(); }
    else if (a === '--batch') { shots.push(...JSON.parse(fs.readFileSync(path.resolve(ROOT, take()), 'utf8'))); }
    else if (a.startsWith('--')) { opts[a.slice(2)] = isNaN(+v) ? v : +v; i++; }
  }
  return { shots, opts };
}

const { shots, opts } = parseArgs(process.argv.slice(2));
if (!shots.length) {
  console.error('No shots. Example: node scripts/shot.mjs --q "cam=0,40,260&look=0,5,100" --out shots/x.png');
  process.exit(1);
}

let server = null;
let base = opts.server;
if (!base) {
  // No HMR or file watching: other builders edit files concurrently and a reload would land mid-capture.
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  const addr = server.httpServer.address();
  base = `http://127.0.0.1:${addr.port}`;
}
const { chromium } = await loadPlaywright();
// Default: software WebGL (SwiftShader), which works anywhere, including GPU-less cloud containers.
// MZ_GPU=1 uses the machine's GPU instead (full Chromium in new headless mode; Metal on macOS);
// MZ_HEADED=1 opens a visible window, the most reliable way to get the GPU on some desktops.
const GPU = process.env.MZ_GPU === '1';
const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'];
const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];
const browser = await chromium.launch({
  ...(GPU ? { channel: 'chromium' } : {}),
  headless: process.env.MZ_HEADED !== '1',
  args: [...(GPU ? GPU_ARGS : SOFTWARE_ARGS), '--autoplay-policy=no-user-gesture-required'],
});
let reportedRenderer = false;

let failures = 0;
for (const s of shots) {
  const w = s.w || opts.w, h = s.h || opts.h;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const q = ['shot', s.q].filter(Boolean).join('&');
  const url = `${base}/witcher-marzena/?${q}${s.frames || opts.frames ? `&frames=${s.frames || opts.frames}` : ''}`;
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeout });
    await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: s.timeout || opts.timeout, polling: 250 });
    const ev = s.eval || opts.eval;
    if (ev) await page.evaluate(`(async () => { ${ev} })()`);
    const wait = s.wait ?? opts.wait;
    if (wait) await page.waitForTimeout(wait);
    const out = path.resolve(ROOT, s.out || `shots/shot-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const seq = s.seq || opts.seq;
    if (seq) {
      const every = s.every || opts.every || 150;
      const cols = s.cols || opts.cols || 4;
      const dataUrl = await page.evaluate(async ({ seq, every, cols }) => {
        const src = document.querySelector('#app canvas');
        const cw = Math.round(src.width / 2), ch = Math.round(src.height / 2);
        const rows = Math.ceil(seq / cols);
        const c = document.createElement('canvas');
        c.width = cw * cols; c.height = ch * rows;
        const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < seq; i++) {
          await new Promise((r) => requestAnimationFrame(() => r()));
          g.drawImage(src, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
          g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(String(i), (i % cols) * cw + 6, Math.floor(i / cols) * ch + 18);
          await new Promise((r) => setTimeout(r, every));
        }
        return c.toDataURL('image/png');
      }, { seq, every, cols });
      fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    } else {
      // Under heavy CPU load the compositor can stall page.screenshot; fall back to reading the
      // WebGL canvas directly (shot mode keeps the drawing buffer). The fallback omits DOM UI.
      try {
        await page.screenshot({ path: out, timeout: Math.min(opts.timeout, 90000), animations: 'disabled' });
      } catch (err) {
        const dataUrl = await page.evaluate(() => document.querySelector('#app canvas').toDataURL('image/png'));
        fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
        console.log(`  (page.screenshot failed: ${err.message.split('\n')[0]}; saved the canvas only)`);
      }
    }
    const info = await page.evaluate(() => ({ errors: window.__MZ_ERRORS || [], stats: window.__MZ_STATS || {} }));
    if (!reportedRenderer) {
      reportedRenderer = true;
      const gl = await page.evaluate(() => {
        const c = document.querySelector('#app canvas');
        const ctx = c && (c.getContext('webgl2') || c.getContext('webgl'));
        const ext = ctx && ctx.getExtension('WEBGL_debug_renderer_info');
        return ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      console.log(`  renderer: ${gl}`);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`OK ${path.relative(ROOT, out)}  ${secs}s  calls=${info.stats.calls} tris=${info.stats.triangles}`);
    if (info.errors.length) { console.log('  module errors:'); for (const e of info.errors) console.log('   ', e); }
  } catch (e) {
    failures++;
    console.log(`FAIL ${s.out || ''}: ${e.message.split('\n')[0]}`);
    try {
      const info = await page.evaluate(() => ({ errors: window.__MZ_ERRORS || [] }));
      for (const er of info.errors) console.log('   ', er);
    } catch { /* page gone */ }
  }
  const uniq = [...new Set(logs)].slice(0, 25);
  if (uniq.length) { console.log('  console:'); for (const l of uniq) console.log('   ', l.slice(0, 400)); }
  await page.close();
}

await browser.close();
if (server) await server.close();
process.exit(failures ? 1 : 0);
