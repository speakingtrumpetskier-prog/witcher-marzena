#!/usr/bin/env node
// Save and Continue at every stage of the main story (logic only, about 15 minutes).
//
// One browser profile, one page load per stage: the first run plays a new game to the second stage and saves there
// (the real save); every next load presses Continue, checks she is back in play, plays on to the next stage and
// saves again. So each stage boundary is crossed by a real save, a fresh page and a real load, and the story still
// has to finish. Prints every FAIL and WARN with the stage it belongs to.
//
//   node scripts/savetest.mjs [--choice strike|call|step] [--from <n>] [--q "side=0"]
/* global window */
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QUESTS, { MAIN_ORDER } from '../src/story/content/quests.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const choice = arg('choice', 'strike');
const extra = arg('q', '');
const ORDER = [];
for (const q of MAIN_ORDER) for (const s of QUESTS[q].stages) ORDER.push(`${q}:${s.id}`);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  try { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); } catch { /* next */ }
  return await import('playwright-core');
}
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });

async function run(query, label) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`page error: ${e.message}`));
  const t0 = Date.now();
  await page.goto(`${base}/witcher-marzena/?shot&scene=playthrough&lite=1&quality=low&choice=${choice}${extra ? `&${extra}` : ''}&${query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__playthrough?.done === true, null, { timeout: 1500000, polling: 500 });
  const r = await page.evaluate(() => { const p = window.__playthrough; return { rows: p.rows.filter((x) => x.level !== 'pass'), pass: p.pass, fail: p.fail, warn: p.warn, errors: p.errors, stoppedAt: p.stoppedAt || null, continuedAt: p.continuedAt || null, ending: p.ending }; });
  await page.close();
  console.log(`${label}: ${r.pass} passed, ${r.fail} failed, ${r.warn} warnings${r.continuedAt ? `, continued at ${r.continuedAt}` : ''}${r.stoppedAt ? `, saved at ${r.stoppedAt}` : r.ending ? `, ending ${r.ending}` : ', did not stop'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const row of r.rows) console.log(`   ${row.level.toUpperCase()} ${row.step} :: ${row.name}${row.detail ? `  [${row.detail}]` : ''}`);
  for (const e of [...r.errors, ...errs].slice(0, 6)) console.log(`   error: ${e}`);
  return r;
}

let fails = 0;
const first = Math.max(1, +arg('from', 1));
let k = first;
// The save to start from: a new game played to ORDER[first].
let r = await run(`stopAt=${ORDER[k]}`, `new game to ${ORDER[k]}`);
fails += r.fail;
while (r.stoppedAt && k < ORDER.length) {
  // Continue, play to the next stage that the run can stop at, save there.
  let stop = k + 1;
  let rr = null;
  for (; stop <= ORDER.length; stop++) {
    const q = stop < ORDER.length ? `continue=1&stopAt=${ORDER[stop]}` : 'continue=1';
    rr = await run(q, `continue at ${ORDER[k]}${stop < ORDER.length ? ` to ${ORDER[stop]}` : ' to the end'}`);
    fails += rr.fail;
    if (rr.stoppedAt || stop >= ORDER.length) break;
    // The run went past that stage without standing at it between steps (one step of the story covers two stages):
    // the save was not replaced, so the same save is continued again with the next stage as the stop.
  }
  r = rr;
  k = stop;
}
console.log(`savetest: ${fails} failed checks`);
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
