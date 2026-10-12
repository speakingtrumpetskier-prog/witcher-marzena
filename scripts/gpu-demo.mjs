#!/usr/bin/env node
// The render loop on your own GPU, timed against software rendering (what the cloud container
// uses). Works on Windows, macOS and Linux. It renders one 1280x720 full-world frame showing the
// latest gameplay tweak (running in snow kicks up powder at each footfall), prints the renderer and
// the time, and opens the picture.
//
//   node scripts/gpu-demo.mjs            GPU render, then the same frame in software, with timings
//   node scripts/gpu-demo.mjs gpu        GPU only
// Needs: npm install, then  npm install --no-save playwright  and  npx playwright install chromium
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = 'cam=-38.8,1.9,27.2&look=-40,0.7,31&hour=15.2&fov=50&hud=0';
const EVAL = "__G.player.teleport(-40,30,3.14); await new Promise(r=>setTimeout(r,1500)); for (let i=0;i<10;i++){ __G.events.emit('player:step',{surface:'snow',foot:i%2?'R':'L',speed:6.4}); await new Promise(r=>setTimeout(r,90)); }";
fs.mkdirSync(path.join(ROOT, 'shots', 'gpu-demo'), { recursive: true });

function run(label, gpu) {
  const out = path.join('shots', 'gpu-demo', `${label}.png`);
  console.log(`\n${label.toUpperCase()}: rendering ${out} ...`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['scripts/shot.mjs', '--w', '1280', '--h', '720', '--q', Q, '--eval', EVAL, '--out', out, '--timeout', '1500000'], {
    cwd: ROOT, env: { ...process.env, MZ_GPU: gpu ? '1' : '' }, encoding: 'utf8',
  });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  for (const line of text.split('\n')) if (/renderer|OK |FAIL|Error/.test(line)) console.log(' ', line.trim());
  console.log(`  ${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
  return path.join(ROOT, out);
}

const gpuPng = run('gpu', true);
if (process.argv[2] !== 'gpu') run('software', false);

// Open the GPU picture with the system viewer.
const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', gpuPng]] : process.platform === 'darwin' ? ['open', [gpuPng]] : ['xdg-open', [gpuPng]];
try { spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* no viewer */ }
