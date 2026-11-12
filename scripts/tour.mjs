#!/usr/bin/env node
// A tour: one world load, many pictures. shot.mjs pays the whole boot for every picture; this loads the game once
// and walks a plan of stops, so thirty views cost one boot plus thirty frames.
//
//   node scripts/tour.mjs --plan shots/tour/plan.json --out shots/tour [--w 960 --h 540] [--q "quality=low"]
//        [--only a,b] [--game] [--timeout 1500000]
//
// The plan is a JSON array of stops:
//   { "name": "tavern_bar",                 file name (shots/tour/tavern_bar.png)
//     "at": [x, z, yaw],                    optional: put Vesna there (on foot, facing yaw) with the play camera behind her
//     "cam": [x, y, z], "look": [x, y, z],  optional: a fixed camera instead (y is absolute; "camUp": h lifts both by the ground there)
//     "hour": 15.5, "weather": "clear",     optional
//     "js": "await ...",                    optional: runs in the page with G in scope, after the above
//     "frames": 4,                          frames to render before the picture (default 4)
//     "ui": true }                          include the DOM (HUD, prompts, menus) with page.screenshot; default canvas only
// Shot mode (frozen clock, no title, no audio) unless --game. Prints one line per stop with draw calls and any new
// console errors, and writes <out>/index.json. Rendering follows shot.mjs: software unless MZ_GPU=1 or MZ_CHROME=1.
/* global window, document, requestAnimationFrame */
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v == null || v.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; }
}
if (!args.plan) { console.error('usage: node scripts/tour.mjs --plan plan.json --out shots/tour'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.plan), 'utf8'));
const only = args.only ? String(args.only).split(',') : null;
const stops = only ? plan.filter((s) => only.includes(s.name)) : plan;
const outDir = path.resolve(ROOT, args.out || 'shots/tour');
fs.mkdirSync(outDir, { recursive: true });
const W = +(args.w || 960), H = +(args.h || 540), TIMEOUT = +(args.timeout || 1500000);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  try { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); } catch { /* next */ }
  return await import('playwright-core');
}

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const { chromium } = await loadPlaywright();
const CHROME = process.env.MZ_CHROME === '1';
const GPU = process.env.MZ_GPU === '1' || CHROME;
const browser = await chromium.launch({
  ...(CHROME ? { channel: 'chrome' } : GPU ? { channel: 'chromium' } : {}),
  headless: process.env.MZ_HEADED !== '1',
  args: [...(GPU ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']), '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const q = [args.game ? '' : 'shot', args.q || ''].filter(Boolean).join('&');
const t0 = Date.now();
await page.goto(`${base}/witcher-marzena/?${q}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: TIMEOUT, polling: 250 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${stops.length} stops`);

const index = [];
let seen = 0;
for (const s of stops) {
  const t = Date.now();
  let err = null;
  try {
    await page.evaluate(async (s) => {
      const G = window.__G;
      const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      if (s.hour != null) G.time.setHours ? G.time.setHours(s.hour) : (G.time.hours = s.hour);
      if (s.weather) G.weather?.set?.(s.weather, 0);
      if (s.at) {
        const [x, z, yaw = 0] = s.at;
        if (G.player?.mounted) G.player.dismountInstant?.();
        G.player?.teleport?.(x, z, yaw);
        G.cameraOwner = 'rig';
        G.cameraRig?.snapBehind?.(yaw);
      }
      if (s.cam) {
        G.cameraOwner = 'shot';
        const up = s.camUp != null ? G.world.heightAt(s.cam[0], s.cam[2]) + s.camUp - s.cam[1] : 0;
        G.camera.position.set(s.cam[0], s.cam[1] + up, s.cam[2]);
        if (s.look) G.camera.lookAt(s.look[0], s.look[1] + (s.lookUp != null ? G.world.heightAt(s.look[0], s.look[2]) + s.lookUp - s.look[1] : 0), s.look[2]);
        if (s.fov) { G.camera.fov = s.fov; G.camera.updateProjectionMatrix(); }
      }
      if (s.js) await new Function('G', 'frames', `return (async () => { ${s.js} })()`)(G, frames);
      // When the play camera takes over from another owner it eases across from where the lens was (about a second
      // of game time, many software frames): cut straight to it.
      await frames(2);
      if (G.cameraOwner === 'rig' && G.cameraRig) G.cameraRig.blend = 0;
      await frames(s.frames || 4);
    }, s);
  } catch (e) { err = e.message.split('\n')[0]; }
  const file = path.join(outDir, `${s.name}.png`);
  try {
    if (s.ui) await page.screenshot({ path: file, timeout: 60000, animations: 'disabled' });
    else throw new Error('canvas');
  } catch {
    const dataUrl = await page.evaluate(() => document.querySelector('#app canvas').toDataURL('image/png'));
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  const info = await page.evaluate(() => ({ stats: window.__MZ_STATS || {}, errors: (window.__G.errors || []).length, p: window.__G.player ? [+window.__G.player.position.x.toFixed(1), +window.__G.player.position.y.toFixed(2), +window.__G.player.position.z.toFixed(1)] : null }));
  const fresh = logs.slice(seen); seen = logs.length;
  index.push({ name: s.name, secs: +((Date.now() - t) / 1000).toFixed(1), calls: info.stats.calls, tris: info.stats.triangles, player: info.p, err, console: fresh });
  console.log(`${err ? 'FAIL' : 'OK'} ${s.name}  ${((Date.now() - t) / 1000).toFixed(1)}s  calls=${info.stats.calls} tris=${info.stats.triangles}${err ? `  ${err}` : ''}${fresh.length ? `\n   console: ${[...new Set(fresh)].slice(0, 4).join(' | ')}` : ''}`);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1));
const errs = await page.evaluate(() => window.__G.errors || []);
if (errs.length) console.log(`G.errors: ${errs.slice(0, 8).join(' | ')}`);
await browser.close();
await server.close();
process.exit(0);
