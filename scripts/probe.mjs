#!/usr/bin/env node
// Run a probe: a script from src/debug/scenes/probes/ on the playthrough autopilot's kit (logic only, no rendering).
//
//   node scripts/probe.mjs <name> [--q "from=main_ice:board&side=0"] [--all] [--timeout 1500000]
//   node scripts/probe.mjs story --q "walk=1&choice=strike"     the story run itself (here: on foot), with its rows printed
//   node scripts/probe.mjs eval --q "from=main_ice:ask" --js my.js   an ad hoc question (see probes/eval.js)
//
// Probes: walk (the story on foot), chaos (places out of order), death (dying in every fight), saves (save and continue
// at every stage), scenes (cutscenes played to the end and skipped half way), clock (sleeping through things).
// Prints the probe's own lines ("[probe] ..."), every FAIL and WARN row, and the totals; --all prints the passes too.
// Exit code 1 when a check failed.
/* global window */
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) { console.error('usage: node scripts/probe.mjs <name> [--q "..."] [--all]'); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const ALL = process.argv.includes('--all');
const TIMEOUT = +arg('timeout', 1500000);

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
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[probe]')) console.log(t.slice(8));
  else if (m.type() === 'error' && !/Failed to load resource/.test(t)) console.log(`  console error: ${t.slice(0, 300)}`);
});
page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
const extra = arg('q', '');
// --js <file>: code for the `eval` probe (a file, so it needs no URL escaping)
const jsFile = arg('js', null);
if (jsFile) { const code = (await import('node:fs')).readFileSync(path.resolve(ROOT, jsFile), 'utf8'); await page.addInitScript((c) => { window.__probeJs = c; }, code); }
const t0 = Date.now();
await page.goto(`${base}/witcher-marzena/?shot&scene=playthrough&lite=1&quality=low${name === 'story' ? '' : `&probe=${name}`}${extra && extra !== true ? `&${extra}` : ''}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
await page.waitForFunction(() => window.__playthrough?.done === true, null, { timeout: TIMEOUT, polling: 500 });
const r = await page.evaluate(() => { const p = window.__playthrough; return { rows: p.rows, pass: p.pass, fail: p.fail, warn: p.warn, errors: p.errors }; });
for (const row of r.rows) {
  if (!ALL && row.level === 'pass') continue;
  console.log(`${row.level.toUpperCase().padEnd(4)} ${row.step} :: ${row.name}${row.detail ? `  [${row.detail}]` : ''}`);
}
console.log(`${name}: ${r.pass} passed, ${r.fail} failed, ${r.warn} warnings, ${r.errors.length} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const e of r.errors.slice(0, 10)) console.log(`  error: ${e}`);
await browser.close();
await server.close();
process.exit(r.fail ? 1 : 0);
