// Photo mode check on the real game (no shot mode): boot, start a new game, skip the opening, enter photo
// mode with its key, try the settings, focus by clicking, save a picture, leave, and confirm the world was
// held while inside and runs again after. Screenshots and the saved PNGs go to --out (default shots/photo).
//
//   node scripts/phototest.mjs [--out dir] [--url http://localhost:5173/witcher-marzena/]
// Starts its own Vite server on this checkout unless --url is given. Uses installed Chrome on the GPU
// through playwright-core (the MZ_CHROME=1 setup in CLAUDE.md).
/* global window, document, getComputedStyle */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('--out', 'shots/photo');
let URL = arg('--url', null);
let server = null;
if (!URL) {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  URL = `http://127.0.0.1:${server.httpServer.address().port}/witcher-marzena/`;
}
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 240)); });
const downloads = [];
page.on('download', async (d) => { const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); downloads.push(p); });

let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`); };
const ev = (fn, a) => page.evaluate(fn, a);
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(URL, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 900000, polling: 250 });
await wait(2000);
await page.keyboard.press('Enter'); await wait(1500); await page.keyboard.press('Enter');
await wait(8000);
await page.keyboard.down('Space'); await wait(2500); await page.keyboard.up('Space');
await page.waitForFunction(() => window.__G.cameraOwner === 'rig' && window.__G.input.context === 'game' && !window.__G.story?.busy, null, { timeout: 60000, polling: 250 });
await wait(2500);

const before = await ev(() => { const G = window.__G; return { hours: G.time.hours, elapsed: G.clock.elapsed, fov: G.camera.fov, pos: G.camera.position.toArray() }; });
check(await ev(() => window.__G.photoMode?.canEnter()), 'photo mode can be entered in free play');
await page.keyboard.press('KeyP');
await wait(800);
const inside = await ev(() => { const G = window.__G; return { active: G.photoMode.active, owner: G.cameraOwner, ctx: G.input.context, frozen: G.time.frozen, panel: !!document.querySelector('.mz-photo-panel'), hudHidden: getComputedStyle(document.querySelector('#ui-root > :not(.mz-photo)') || document.body).visibility }; });
check(inside.active && inside.owner === 'photo' && inside.ctx === 'photo', 'the photo key enters photo mode', JSON.stringify(inside));
check(inside.panel, 'the panel is shown');
await shot('p0_enter');

// The world holds: the clock and shader time stand still, and with nothing changing no frames are drawn.
const held = await ev(async () => {
  const G = window.__G, t0 = G.clock.elapsed, h0 = G.time.hours;
  let renders = 0;
  const orig = G.postfx.render;
  G.postfx.render = (dt) => { renders++; return orig(dt); };
  await new Promise((r) => setTimeout(r, 1500));
  G.postfx.render = orig;
  return { dt: G.clock.elapsed - t0, dh: G.time.hours - h0, renders };
});
check(held.dt === 0 && held.dh === 0, 'the clock and the time of day are held', JSON.stringify(held));
check(held.renders <= 3, 'an unchanged view is not redrawn', `renders in 1.5 s: ${held.renders}`);

// Fly a little: back with S, then E to rise. The camera moves and stays near Vesna.
await page.keyboard.down('KeyS'); await wait(900); await page.keyboard.up('KeyS');
await page.keyboard.down('KeyE'); await wait(500); await page.keyboard.up('KeyE');
await wait(400);
const moved = await ev((b) => { const G = window.__G, p = G.camera.position; return { d: Math.hypot(p.x - b.pos[0], p.y - b.pos[1], p.z - b.pos[2]), tether: p.distanceTo(G.player.position) }; }, before);
check(moved.d > 1, 'W A S D and E move the camera', JSON.stringify(moved));
check(moved.tether < 18.5, 'the camera stays within the tether');
// Look by dragging.
await page.mouse.move(500, 360); await page.mouse.down(); await page.mouse.move(420, 330, { steps: 10 }); await page.mouse.up();
await wait(300);
// Depth of field by clicking on Vesna's area (screen centre-ish).
await page.mouse.click(640, 400);
await wait(500);
const foc = await ev(() => { const s = window.__G.photoMode.settings; return { dof: s.dof, focus: s.focus, mode: s.focusMode }; });
check(foc.dof > 0 && foc.mode === 'manual' && foc.focus > 0.2 && foc.focus < 200, 'clicking the picture sets the focus and turns on depth of field', JSON.stringify(foc));
await ev(() => window.__G.photoMode.set('dof', 0.8));
await wait(400);
await shot('p1_dof');

// Filters, crops and borders through the panel API, a screenshot of each look.
for (const [k, v, name] of [['filter', 'Silver', 'p2_silver'], ['filter', 'Duotone', 'p3_duotone'], ['crop', 'portrait', 'p4_portrait'], ['border', 'Paper cut', 'p5_papercut'], ['crop', 'wide', 'p6_wide']]) {
  await ev(([a, b]) => window.__G.photoMode.set(a, b), [k, v]);
  await wait(500);
  await shot(name);
}
await ev(() => { const P = window.__G.photoMode; P.set('filter', 'Warm'); P.set('hour', 19.25); P.set('grid', true); P.set('hideVesna', true); P.set('hideSnow', true); });
await wait(2200);
await shot('p7_dusk_grid');
const shown = await ev(() => [...document.querySelectorAll('.mz-photo .cyc-val')].map((e) => e.textContent));
check(shown.includes('Warm') && shown.includes('Paper cut'), 'the panel follows changes made elsewhere', JSON.stringify(shown));
check(await ev(() => window.__G.weather?.snowfall?.mesh?.visible === false), 'falling snow can be hidden');

// Arrow keys work the panel: the first row is Field of view; Right widens it.
const fov0 = await ev(() => window.__G.photoMode.settings.fov);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
const fov1 = await ev(() => window.__G.photoMode.settings.fov);
check(fov1 > fov0, 'the arrow keys change the focused setting', `${fov0.toFixed(1)} -> ${fov1.toFixed(1)}`);

// Save a picture.
await page.keyboard.press('Space');
await page.waitForFunction(() => !!window.__G.photoMode.lastCapture, null, { timeout: 15000, polling: 200 }).catch(() => {});
await wait(1500);
const cap = await ev(() => window.__G.photoMode.lastCapture);
check(!!cap && cap.bytes > 20000, 'Space saves a picture', JSON.stringify(cap));
check(!!cap && Math.abs(cap.w / cap.h - 2.39) < 0.03, 'the saved picture is cropped to the frame', cap ? `${cap.w}x${cap.h}` : '');
const full = await ev(() => { const D = window.__G.dynamicRes; return Math.round(window.innerWidth * (D ? D.cap : window.__G.renderer.getPixelRatio())); });
check(!!cap && cap.w >= full - 2, 'it is saved at the full resolution, not the dynamic one', `${cap?.w} vs ${full}`);
check(downloads.length >= 1, 'the browser received the file', downloads.join(', '));
await shot('p8_saved');

// H hides the panel; then leave with Esc.
await page.keyboard.press('KeyH'); await wait(500);
check(await ev(() => document.querySelector('.mz-photo')?.classList.contains('bare')), 'H hides the panel');
await shot('p9_bare');
await page.keyboard.press('Escape');
await wait(1200);
const after = await ev((b) => { const G = window.__G; return { active: G.photoMode.active, owner: G.cameraOwner, ctx: G.input.context, frozen: G.time.frozen, hours: G.time.hours, hoursBack: Math.abs(G.time.hours - b.hours) < 0.05, vesna: G.player.character.root.visible, exposure: G.postfx.exposure, elapsedRuns: G.clock.elapsed > b.elapsed, panel: !!document.querySelector('.mz-photo') }; }, before);
check(!after.active && after.owner === 'rig' && after.ctx === 'game' && !after.frozen, 'Esc leaves and hands the camera and controls back', JSON.stringify(after));
check(after.hoursBack && after.vesna && after.exposure === 1, 'the hour, Vesna and the exposure are restored');
check(await ev(() => window.__G.weather?.snowfall?.mesh?.visible !== false), 'and the snow is back');
await wait(1000);
const runs = await ev(() => { const t = window.__G.clock.elapsed; return new Promise((r) => setTimeout(() => r(window.__G.clock.elapsed - t), 800)); });
// The clock caps a frame at 0.1 s, so on a loaded machine it can lag real time; it only has to move.
check(runs > 0.1, 'the world runs again after leaving', `clock advanced ${runs.toFixed(2)} s in 0.8 s`);
await shot('p10_back');

// The pause menu entry.
await page.keyboard.press('Escape'); await wait(900);
const item = await ev(() => [...document.querySelectorAll('.mz-mi')].find((b) => b.textContent.includes('Photo mode')));
check(!!item, 'the pause menu lists Photo mode');
await ev(() => [...document.querySelectorAll('.mz-mi')].find((b) => b.textContent.includes('Photo mode'))?.click());
await wait(900);
check(await ev(() => window.__G.photoMode.active && window.__G.cameraOwner === 'photo'), 'Photo mode from the pause menu enters it');
await page.keyboard.press('Escape'); await wait(800);
check(await ev(() => !window.__G.photoMode.active && window.__G.input.context === 'game'), 'and Esc leaves it again');

check(errs.length === 0, 'no errors', JSON.stringify(errs.slice(0, 5)));
console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
await browser.close();
await server?.close();
process.exit(fail ? 1 : 0);
