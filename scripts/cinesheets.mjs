#!/usr/bin/env node
// Contact sheets of the cutscenes: one world load, every scene played through the cinematics preview
// (src/debug/scenes/cinematics.js, window.__cine.sheet), a tile at every camera setup and every few seconds, with
// the letterbox and the subtitle on each tile. Writes shots/cine/<id>_<page>.png (4 x 3 tiles a page).
//
//   node scripts/cinesheets.mjs [ids...] [--every 3] [--out shots/cine] [--flags a,b] [--w 1280 --h 720]
//   ids default to every scene in src/story/content/cutscenes (not _cine, _sample)
// Software rendering takes about half a minute a tile; MZ_GPU=1 or MZ_CHROME=1 as for shot.mjs.
/* global window, document, Image */
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ids = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { i++; continue; } ids.push(argv[i]); }
const all = fs.readdirSync(path.join(ROOT, 'src/story/content/cutscenes')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.replace(/\.js$/, ''));
const list = ids.length ? ids : all;
const outDir = path.resolve(ROOT, opt('out', 'shots/cine'));
fs.mkdirSync(outDir, { recursive: true });
const W = +opt('w', 1280), H = +opt('h', 720), every = +opt('every', 3), flags = opt('flags', '');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  try { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); } catch { /* next */ }
  return await import('playwright-core');
}
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const { chromium } = await loadPlaywright();
const CHROME = process.env.MZ_CHROME === '1', GPU = process.env.MZ_GPU === '1' || CHROME;
const browser = await chromium.launch({
  ...(CHROME ? { channel: 'chrome' } : GPU ? { channel: 'chromium' } : {}),
  args: [...(GPU ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']), '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(`${base}/witcher-marzena/?shot&scene=cinematics&gp=1&fps=30`, { waitUntil: 'domcontentloaded', timeout: 1500000 });
await page.waitForFunction(() => window.__MZ_READY === true && !!window.__cine, null, { timeout: 1500000, polling: 250 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${list.length} scenes`);
let seen = 0;
for (const id of list) {
  const t = Date.now();
  try {
    const pages = await page.evaluate(async ({ id, every, flags }) => {
      const n = await window.__cine.sheet(id, { cols: 4, rows: 3, every, flags, show: false });
      const tiles = window.__cine.tiles;
      const out = [];
      const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
      for (let p = 0; p * 12 < tiles.length; p++) {
        const ims = await Promise.all(tiles.slice(p * 12, p * 12 + 12).map(load));
        const tw = ims[0].width, th = ims[0].height;
        const c = document.createElement('canvas');
        c.width = tw * 4; c.height = th * 3;
        const g = c.getContext('2d');
        g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
        ims.forEach((im, i) => g.drawImage(im, (i % 4) * tw, Math.floor(i / 4) * th));
        out.push(c.toDataURL('image/jpeg', 0.9));
      }
      return { n, pages: out, log: window.__cine.log[window.__cine.log.length - 1] };
    }, { id, every, flags });
    pages.pages.forEach((d, i) => fs.writeFileSync(path.join(outDir, `${id}_${i}.jpg`), Buffer.from(d.split(',')[1], 'base64')));
    const fresh = [...new Set(errs.slice(seen))]; seen = errs.length;
    console.log(`OK ${id}: ${pages.n} tiles, ${pages.pages.length} page(s), ${pages.log?.secs} s of scene, ${((Date.now() - t) / 1000).toFixed(0)} s${fresh.length ? `\n   console: ${fresh.slice(0, 4).join(' | ')}` : ''}`);
  } catch (e) {
    console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
await server.close();
process.exit(0);
