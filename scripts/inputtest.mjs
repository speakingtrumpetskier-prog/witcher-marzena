#!/usr/bin/env node
// Functional test for input, camera, menus, rebinding and hints. Drives the combat arena (scene=arena&lite=1)
// in a real browser with a mocked gamepad (navigator.getGamepads) and prints PASS or FAIL per check.
//
//   MZ_CHROME=1 node scripts/inputtest.mjs [input|lock|menus|hints|defs]     (no argument runs everything, about 3 minutes)
//
//   input   every pad button maps to its action, sticks (dead zone, curve, walk and run), sprint latch, camera look,
//           invert X, shoulder swap easing, FOV and distance settings, rumble
//   lock    R3 lock, right-stick and mouse flick switching, auto recenter modes, sphere-cast collision on a thin post
//   menus   pause and Controls by pad, tabs, sliders, rebinding with a key, a pad button and the mouse, conflicts
//           (swap), clearing, persistence across a reload, reset, a rebound action driving the game
//   hints   live hint sequence in a wolf fight, persistence of seen hints, the settings toggle and reset
//   defs    every hint builds for both devices with plain text, the triggers fire when their state is set up
// Needs `npm install --no-save playwright-core` and a local Google Chrome (set MZ_CHROME=1), like shot.mjs.
/* global window, document, KeyboardEvent, MouseEvent, requestAnimationFrame */
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  try { return await import('playwright-core'); } catch { /* fall through */ }
  console.error('Playwright is not installed. Run:  npm install --no-save playwright-core  and set MZ_CHROME=1');
  process.exit(2);
}
const { chromium } = await loadPlaywright();

const only = process.argv[2] || '';
const server = await createServer({ root: W, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ ...(process.env.MZ_CHROME === '1' ? { channel: 'chrome' } : {}), headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] });

const MOCK = `(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: { playEffect: (t, o) => { (window.__rumbles = window.__rumbles || []).push(o); return Promise.resolve('complete'); } } };
  window.__pad = pad; window.__padOn = true;
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
  window.__btn = (i, down, v) => { pad.buttons[i].pressed = down; pad.buttons[i].value = down ? (v ?? 1) : 0; };
  window.__ax = (i, v) => { pad.axes[i] = v; };
})();`;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const logs = [];

async function open(page, q) {
  await page.goto(`${base}/witcher-marzena/?${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 240000, polling: 250 });
}
const frames = (page, n = 3) => page.evaluate((k) => new Promise((r) => { let c = 0; const f = () => (++c >= k ? r() : requestAnimationFrame(f)); f(); }), n);
const btn = async (page, i, ms = 140) => { await page.evaluate((i2) => window.__btn(i2, true), i); await page.waitForTimeout(ms); await page.evaluate((i2) => window.__btn(i2, false), i); await page.waitForTimeout(90); };
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
const key = async (page, code, ms = 90) => {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), code);
  await page.waitForTimeout(ms);
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true })), code);
  await page.waitForTimeout(60);
};

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.addInitScript(MOCK);
  return page;
}

// ---------------------------------------------------------------------------------------------------------
async function testInput() {
  console.log('--- input, pad actions, camera');
  const page = await newPage();
  await open(page, 'scene=arena&lite=1&enemy=wolves&n=2&god=1&quality=low&hud=0');
  await page.evaluate(() => {
    const G = window.__G;
    window.__arena.clear();
    window.__seen = {};
    G.addSystem('seen', () => {
      for (const a of ['interact', 'advance', 'dodge', 'skip', 'attack', 'heavy', 'horse', 'parry', 'sign', 'sign1', 'sign2', 'sign3', 'lock', 'map', 'pause', 'potion', 'journal', 'sprint', 'senses', 'draw', 'shoulder', 'walk']) {
        if (G.input.pressed(a)) window.__seen[a] = (window.__seen[a] || 0) + 1;
      }
    }, -5);
  });
  await frames(page, 5);
  check('pad connected', await page.evaluate(() => window.__G.input.padConnected === true));
  check('starts on kbm', await page.evaluate(() => window.__G.input.device === 'kbm'));
  await btn(page, BTN.A);
  check('A press switches device to pad', await page.evaluate(() => window.__G.input.device === 'pad'));
  check('pad style xbox', await page.evaluate(() => window.__G.input.padStyle === 'xbox'));

  const expect = { A: ['interact', 'advance'], B: ['dodge', 'skip'], X: ['attack'], Y: ['heavy'], LB: ['horse'], RB: ['parry'], RT: ['sign'], R3: ['lock'], Back: ['map'], Left: ['sign1'], Up: ['sign2'], Right: ['sign3'], Down: ['potion'], L3: ['sprint'], LT: ['senses'] };
  for (const [name, acts] of Object.entries(expect)) {
    await page.evaluate(() => { window.__seen = {}; });
    if (name === 'LT') { await page.evaluate(() => window.__btn(6, true, 0.9)); await page.waitForTimeout(120); await page.evaluate(() => window.__btn(6, false)); await page.waitForTimeout(80); } else await btn(page, BTN[name]);
    const seen = await page.evaluate(() => ({ ...window.__seen }));
    const ok = acts.filter((a) => a !== 'advance' && a !== 'skip').every((a) => seen[a]);
    check(`pad ${name} -> ${acts.join(',')}`, ok, JSON.stringify(seen));
    const open2 = await page.evaluate(() => window.__G.ui.isOpen());
    if (open2) { await page.evaluate(() => window.__G.ui.closeAll()); await page.waitForTimeout(500); }
  }

  await page.evaluate(() => window.__ax(1, -1));
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__G.input._sprintOn = false; });
  await btn(page, BTN.L3);
  check('sprint latched after L3 with stick held', await page.evaluate(() => window.__G.input.down('sprint') === true));
  await page.evaluate(() => window.__ax(1, 0));
  await page.waitForTimeout(500);
  check('sprint latch drops when stick released', await page.evaluate(() => window.__G.input.down('sprint') === false));

  const p0 = await page.evaluate(() => ({ x: window.__G.player.position.x, z: window.__G.player.position.z }));
  await page.evaluate(() => window.__ax(1, -0.5));
  await page.waitForTimeout(900);
  const m1 = await page.evaluate(() => ({ my: window.__G.input.move.y, sp: window.__G.player.loco.speed }));
  check('gentle stick push is analog and walks', m1.my > 0.1 && m1.my < 0.6 && m1.sp < 2.4, JSON.stringify(m1));
  await page.evaluate(() => window.__ax(1, -1));
  await page.waitForTimeout(900);
  const m2 = await page.evaluate(() => ({ my: window.__G.input.move.y, sp: window.__G.player.loco.speed }));
  check('full stick runs', m2.my > 0.95 && m2.sp > 3, JSON.stringify(m2));
  await page.evaluate(() => window.__ax(1, 0));
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => ({ x: window.__G.player.position.x, z: window.__G.player.position.z }));
  check('player moved', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);

  await page.evaluate(() => { window.__ax(0, 0.1); window.__ax(1, 0.1); window.__ax(2, 0.08); });
  await frames(page, 4);
  const dz = await page.evaluate(() => ({ mv: window.__G.input.move.x + window.__G.input.move.y, lk: window.__G.input.lookPad.x }));
  check('stick drift inside dead zone is ignored', dz.mv === 0 && dz.lk === 0, JSON.stringify(dz));
  await page.evaluate(() => { window.__ax(0, 0); window.__ax(1, 0); window.__ax(2, 0); });

  const y0 = await page.evaluate(() => window.__G.cameraRig.yaw);
  await page.evaluate(() => window.__ax(2, 1));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__ax(2, 0));
  await frames(page, 2);
  const y1 = await page.evaluate(() => window.__G.cameraRig.yaw);
  let dyaw = y1 - y0; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  check('right stick right turns camera right', dyaw < -0.9 && dyaw > -2.6, `dyaw=${dyaw.toFixed(2)}`);
  await page.evaluate(() => window.__G.settings.set('invertX', true));
  await page.evaluate(() => window.__ax(2, 1));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__ax(2, 0));
  await frames(page, 2);
  const y3 = await page.evaluate(() => window.__G.cameraRig.yaw);
  let d2 = y3 - y1; while (d2 > Math.PI) d2 -= 2 * Math.PI; while (d2 < -Math.PI) d2 += 2 * Math.PI;
  check('invert X flips the stick turn', d2 > 0.5, `d=${d2.toFixed(2)}`);
  await page.evaluate(() => window.__G.settings.set('invertX', false));
  const pitch0 = await page.evaluate(() => window.__G.cameraRig.pitch);
  await page.evaluate(() => window.__ax(3, 1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__ax(3, 0));
  const pitch1 = await page.evaluate(() => window.__G.cameraRig.pitch);
  check('stick down pitches camera down', pitch1 > pitch0 + 0.2, `${pitch0.toFixed(2)} -> ${pitch1.toFixed(2)}`);

  await page.evaluate(() => window.__G.settings.set('shoulder', 'right'));
  await page.waitForTimeout(1000);
  const sk0 = await page.evaluate(() => window.__G.cameraRig.sideK);
  await key(page, 'KeyV');
  await page.waitForTimeout(110);
  const skMid = await page.evaluate(() => window.__G.cameraRig.sideK);
  await page.waitForTimeout(1300);
  const sk1 = await page.evaluate(() => ({ k: window.__G.cameraRig.sideK, s: window.__G.settings.shoulder }));
  check('shoulder swap slides (not a snap)', sk0 > 0.95 && skMid < 0.99 && skMid > -0.9 && sk1.k < -0.95 && sk1.s === 'left', `${sk0.toFixed(2)} ${skMid.toFixed(2)} ${sk1.k.toFixed(2)}`);
  await key(page, 'KeyV');
  await page.waitForTimeout(1200);

  const f0 = await page.evaluate(() => window.__G.camera.fov);
  await page.evaluate(() => window.__G.settings.set('fovOffset', 12));
  await page.waitForTimeout(1500);
  const f1 = await page.evaluate(() => window.__G.camera.fov);
  check('fov offset applies', Math.abs(f1 - f0 - 12) < 0.6, `${f0.toFixed(1)} -> ${f1.toFixed(1)}`);
  await page.evaluate(() => window.__G.settings.set('fovOffset', 0));
  const d0 = await page.evaluate(() => window.__G.cameraRig.cur.dist);
  await page.evaluate(() => window.__G.settings.set('camDist', 1.3));
  await page.waitForTimeout(1800);
  const d1 = await page.evaluate(() => window.__G.cameraRig.cur.dist);
  check('camera distance setting applies', d1 > d0 * 1.2, `${d0.toFixed(2)} -> ${d1.toFixed(2)}`);
  await page.evaluate(() => window.__G.settings.set('camDist', 1));

  // rumble on a hit
  await btn(page, BTN.A);
  await page.evaluate(() => { window.__rumbles = []; window.__G.events.emit('player:hit', { amount: 30 }); });
  check('rumble fires on a hit while on pad', await page.evaluate(() => window.__rumbles.length === 1));
  await page.evaluate(() => { window.__rumbles = []; window.__G.settings.set('rumble', false); window.__G.events.emit('player:hit', { amount: 30 }); });
  check('rumble off silences it', await page.evaluate(() => window.__rumbles.length === 0));
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
async function testLockAndCollision() {
  console.log('--- lock-on flick, auto recenter, collision');
  const page = await newPage();
  await open(page, 'scene=arena&lite=1&enemy=effigies&n=3&god=1&quality=low&hud=0');
  await frames(page, 6);
  await page.evaluate(() => { window.__G.input.locked = true; });
  await btn(page, BTN.R3);
  await page.waitForTimeout(400);
  const t0 = await page.evaluate(() => { const T = window.__G.cameraRig.target; return T ? { x: T.position.x, z: T.position.z } : null; });
  check('R3 locks a target', !!t0, JSON.stringify(t0));
  await page.evaluate(() => { window.__retarget = 0; window.__G.events.on('camera:retarget', () => { window.__retarget++; }); });
  await page.evaluate(() => window.__ax(2, 1));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__ax(2, 0));
  await page.waitForTimeout(500);
  const rt1 = await page.evaluate(() => window.__retarget);
  const t1 = await page.evaluate(() => { const T = window.__G.cameraRig.target; return T ? { x: T.position.x, z: T.position.z } : null; });
  check('right stick flick switches target', rt1 === 1 && t1 && (t1.x !== t0.x || t1.z !== t0.z), `retargets=${rt1}`);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new MouseEvent('mousemove', { movementX: -60, movementY: 0 })); });
  await page.waitForTimeout(500);
  const rt2 = await page.evaluate(() => window.__retarget);
  const t2 = await page.evaluate(() => { const T = window.__G.cameraRig.target; return T ? { x: T.position.x, z: T.position.z } : null; });
  check('mouse flick switches target', rt2 >= 2 && t2 && (t2.x !== t1.x || t2.z !== t1.z), `retargets=${rt2}`);
  const before = rt2;
  await page.evaluate(async () => { for (let i = 0; i < 30; i++) { window.dispatchEvent(new MouseEvent('mousemove', { movementX: 6, movementY: 0 })); await new Promise((r) => setTimeout(r, 30)); } });
  await page.waitForTimeout(300);
  check('slow mouse drift does not switch', (await page.evaluate(() => window.__retarget)) === before);
  await page.evaluate(() => { window.__G.cameraRig.setTarget(null); window.__G.player.setTarget(null); });

  await btn(page, BTN.A); // back on the pad
  const yawOf = () => page.evaluate(() => window.__G.cameraRig.yaw);
  const run = async (mode, secs, keys) => {
    await page.evaluate((m) => { const G = window.__G; G.settings.set('recenter', m); G.cameraRig.setTarget(null); G.player.teleport(-60, 20, 0); G.cameraRig.snapBehind(0); }, mode);
    await page.waitForTimeout(600);
    if (keys) { await page.evaluate(() => { for (const c of ['KeyW', 'KeyA']) window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })); }); } else await page.evaluate(() => { window.__ax(0, -0.8); window.__ax(1, -0.6); });
    let total = 0, last = await yawOf();
    for (let t = 0; t < secs; t += 150) {
      await page.waitForTimeout(150);
      const y = await yawOf();
      let d = y - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      total += d; last = y;
    }
    if (keys) { await page.evaluate(() => { for (const c of ['KeyW', 'KeyA']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })); }); } else await page.evaluate(() => { window.__ax(0, 0); window.__ax(1, 0); });
    return total;
  };
  const dOff = await run('off', 2500);
  const dGentle = await run('gentle', 4000);
  const dStrong = await run('strong', 4000);
  check('recenter off: the camera stays put', Math.abs(dOff) < 0.05, 'd=' + dOff.toFixed(2));
  check('gentle recenter follows the travel direction (left = yaw up)', dGentle > 0.15, 'd=' + dGentle.toFixed(2));
  check('strong recenter follows faster than gentle', dStrong > dGentle * 1.5, 'd=' + dStrong.toFixed(2));
  const dAuto = await run('auto', 4000);
  check('auto recenter on a pad acts like gentle', Math.abs(dAuto - dGentle) < dGentle * 0.4 + 0.1, 'd=' + dAuto.toFixed(2));
  await page.evaluate(() => { window.__G.input.device = 'kbm'; });
  const dAutoMouse = await run('auto', 2500, true);
  check('auto recenter with keyboard and mouse stays off', Math.abs(dAutoMouse) < 0.05, 'd=' + dAutoMouse.toFixed(2));

  const col = await page.evaluate(async () => {
    const G = window.__G, R = G.cameraRig, P = G.player;
    G.settings.set('recenter', 'off');
    R.setTarget(null);
    P.teleport(40, 40, 0);
    R.snapBehind(0);
    await new Promise((r) => setTimeout(r, 700));
    const piv = () => new G.THREE.Vector3(R.focus.x, R.focus.y + R.cur.pivotH, R.focus.z);
    const free = { dist: R.pos.distanceTo(piv()), collK: R.collK, camZ: R.pos.z };
    const px = 40 + (R.pos.x - 40) * 0.45, pz = 40 + (R.pos.z - 40) * 0.45;
    const off = G.physics.addCircle(px + 0.7, pz, 0.08, { tag: 'post' }); // beside the ray: should not matter
    await new Promise((r) => setTimeout(r, 500));
    const near = { collK: R.collK };
    G.physics.remove(off);
    G.physics.addCircle(px, pz, 0.08, { tag: 'post' });
    await new Promise((r) => setTimeout(r, 500));
    const post = { dist: R.pos.distanceTo(piv()), collK: R.collK, camZ: R.pos.z, near };
    // and the terrain floor: lens never below ground
    const gy = G.world.heightAt(R.pos.x, R.pos.z);
    return { free, post, lensAboveGround: R.pos.y - gy };
  });
  console.log('   collision', JSON.stringify(col));
  check('free camera is unobstructed', col.free.collK > 0.99);
  check('a post well to the side does not move the lens', col.post.near.collK > 0.99, JSON.stringify(col.post.near));
  check('a thin post on the line pulls the lens in', col.post.collK < 0.75 && col.post.dist < col.free.dist - 0.8, `dist ${col.free.dist.toFixed(2)} -> ${col.post.dist.toFixed(2)}`);
  check('lens above ground', col.lensAboveGround > 0.35, col.lensAboveGround.toFixed(2));
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
async function testMenus() {
  console.log('--- menus by pad, controls screen, rebinding, persistence');
  const page = await newPage();
  await open(page, 'scene=arena&lite=1&enemy=effigies&n=1&god=1&quality=low&hud=0');
  await page.evaluate(() => window.__arena.clear());
  await frames(page, 4);
  await page.evaluate(() => { localStorage.removeItem('marzena.bindings'); });
  await btn(page, BTN.A);
  await btn(page, BTN.Start);
  await page.waitForTimeout(500);
  check('Start opens the pause menu', await page.evaluate(() => window.__G.ui.isOpen() && window.__G.input.context === 'ui'));
  for (let i = 0; i < 4; i++) await btn(page, BTN.Down);
  const sel = await page.evaluate(() => window.__G.uiImpl.menus.pause?.el.querySelector('.mz-mi.sel .lab')?.textContent);
  check('D-pad moves the pause selection to Controls', sel === 'Controls', sel);
  await btn(page, BTN.A);
  await page.waitForTimeout(700);
  check('A opens the Controls screen', await page.evaluate(() => !!window.__G.uiImpl.controls.scr?.open));
  await btn(page, BTN.RB);
  check('RB switches to the Camera tab', await page.evaluate(() => window.__G.uiImpl.controls.tab === 'camera'));
  await btn(page, BTN.Down);
  await btn(page, BTN.Right, 100);
  await btn(page, BTN.Right, 100);
  const sens = await page.evaluate(() => window.__G.settings.mouseSensY);
  check('D-pad right raises a slider', sens > 1.05, String(sens));
  await btn(page, BTN.LB);
  check('LB goes back to Bindings', await page.evaluate(() => window.__G.uiImpl.controls.tab === 'bindings'));

  const rowId = () => page.evaluate(() => window.__G.uiImpl.controls.items[window.__G.uiImpl.controls.cur.r].a?.id);
  for (let i = 0; i < 14 && (await rowId()) !== 'attack'; i++) await btn(page, BTN.Down, 70);
  const row = await rowId();
  check('cursor on attack row', row === 'attack', row);
  await btn(page, BTN.A);
  check('A starts listening', await page.evaluate(() => !!window.__G.uiImpl.controls.listening));
  await key(page, 'KeyG');
  const k1 = await page.evaluate(() => window.__G.input.codesFor('attack', 'kbm').slice());
  check('key press rebinds attack', k1[0] === 'KeyG', JSON.stringify(k1));
  check('binding persisted', await page.evaluate(() => (localStorage.getItem('marzena.bindings') || '').includes('KeyG')));
  await btn(page, BTN.Right, 80);
  await btn(page, BTN.A);
  await key(page, 'Escape');
  check('Esc cancels listening', await page.evaluate(() => !window.__G.uiImpl.controls.listening && window.__G.uiImpl.controls.scr.open));
  await btn(page, BTN.Right, 80);
  await btn(page, BTN.A);
  check('pad cell listening', await page.evaluate(() => window.__G.uiImpl.controls.listening?.kind === 'pad'));
  await btn(page, BTN.Y, 120);
  await page.waitForTimeout(200);
  const ask = await page.evaluate(() => ({ on: !!window.__G.uiImpl.controls.prompt, txt: window.__G.uiImpl.controls.askBar.textContent }));
  check('binding a taken pad button asks', ask.on, ask.txt);
  await btn(page, BTN.A, 100);
  await page.waitForTimeout(200);
  const pb = await page.evaluate(() => ({ attack: window.__G.input.codesFor('attack', 'pad').slice(), heavy: window.__G.input.codesFor('heavy', 'pad').slice() }));
  check('swap gives attack Y and heavy X', pb.attack[0] === 'PadY' && pb.heavy[0] === 'PadX', JSON.stringify(pb));
  await btn(page, BTN.X, 100);
  const cleared = await page.evaluate(() => window.__G.input.codesFor('attack', 'pad').length);
  check('X clears the focused cell', cleared === 0);
  const shown = await page.evaluate(() => window.__G.uiImpl.controls.items[window.__G.uiImpl.controls.cur.r].cells[3].classList.contains('show'));
  check('reset button appears for a changed row', shown);

  await btn(page, BTN.B);
  await btn(page, BTN.B);
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => localStorage.getItem('marzena.bindings'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 240000, polling: 250 });
  const after = await page.evaluate(() => ({ k: window.__G.input.codesFor('attack', 'kbm').slice(), h: window.__G.input.codesFor('heavy', 'pad').slice() }));
  check('bindings survive a reload', after.k[0] === 'KeyG' && after.h[0] === 'PadX', JSON.stringify(after) + ' ' + saved);
  await page.evaluate(() => window.__G.input.reset());
  const reset = await page.evaluate(() => ({ k: window.__G.input.codesFor('attack', 'kbm').slice(), s: localStorage.getItem('marzena.bindings') }));
  check('reset restores defaults and clears storage', reset.k[0] === 'Mouse0' && !reset.s, JSON.stringify(reset));

  // ---- mouse in the Controls screen
  await page.evaluate(() => { window.__G.input.device = 'kbm'; window.__G.ui.openControls(); });
  await page.waitForTimeout(700);
  await page.click('.ctl-row:nth-of-type(2) .ctl-cell.kbm[data-slot="0"]'); // first action row, first key slot
  check('mouse click starts listening', await page.evaluate(() => !!window.__G.uiImpl.controls.listening));
  await page.waitForTimeout(300);
  await key(page, 'KeyG');
  const fw = await page.evaluate(() => window.__G.input.codesFor('forward', 'kbm').slice());
  check('mouse click then key rebinds move forward', fw[0] === 'KeyG', JSON.stringify(fw));
  await page.click('.ctl-row:nth-of-type(2) .ctl-cell.kbm[data-slot="1"]');
  await page.waitForTimeout(300);
  await page.click('.ctl-row:nth-of-type(2) .ctl-cell.kbm[data-slot="1"]', { button: 'right' });
  const ask2 = await page.evaluate(() => window.__G.uiImpl.controls.askBar.textContent);
  check('right click is captured as a binding and asks about the clash', /RMB/.test(ask2), ask2);
  await key(page, 'Escape');
  await page.click('.ctl-row:nth-of-type(2) .ctl-cell.kbm[data-slot="1"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.ctl-cell.listening').dispatchEvent(new MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true })));
  const fw2 = await page.evaluate(() => window.__G.input.codesFor('forward', 'kbm').slice());
  check('an extra mouse button binds', fw2.includes('Mouse3'), JSON.stringify(fw2));
  await page.click('.ctl-tab:nth-child(2)');
  check('clicking a tab switches', await page.evaluate(() => window.__G.uiImpl.controls.tab === 'camera'));
  await page.click('.seg:has-text("Left shoulder")');
  check('clicking a segmented option sets the camera side', await page.evaluate(() => window.__G.settings.shoulder === 'left'));
  await page.evaluate(() => window.__G.settings.set('shoulder', 'right'));
  await page.click('.ctl-tab:nth-child(1)');
  await page.click('.ctl-restore');
  await page.waitForTimeout(200);
  check('restore asks first', await page.evaluate(() => !!window.__G.uiImpl.controls.prompt));
  await page.click('.ask-opt:has-text("Restore defaults")');
  check('restore defaults works with the mouse', await page.evaluate(() => window.__G.input.codesFor('forward', 'kbm')[0] === 'KeyW'));
  await page.evaluate(() => { window.__G.ui.closeAll(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__G.input.bind('dodge', 'kbm', 0, 'KeyG', 'steal'));
  await page.evaluate(() => { window.__G.ui.closeAll(); });
  await page.waitForTimeout(400);
  const dodged = await page.evaluate(async () => {
    const G = window.__G;
    G.input.context = 'game';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const act = G.player.moves.act?.kind;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', bubbles: true }));
    return act;
  });
  check('rebinding dodge to G makes G dodge', dodged === 'dodge', String(dodged));
  await page.evaluate(() => window.__G.input.reset());
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
async function testHints() {
  console.log('--- hints');
  const page = await newPage();
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__h')) { localStorage.removeItem('marzena.hints.seen'); sessionStorage.setItem('__h', '1'); } } catch { /* none */ } });
  await open(page, 'scene=arena&lite=1&enemy=wolves&n=3&god=1&quality=low');
  const seq = [];
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const id = await page.evaluate(() => window.__G.hints.cur?.id || null);
    if (id && seq[seq.length - 1] !== id) { seq.push(id); if (seq.length <= 3) await page.screenshot({ path: `${W}/shots/ui/live_hint_${seq.length}_${id}.png` }); }
  }
  console.log('   hint sequence in 30 s of wolves:', JSON.stringify(seq));
  check('some combat hints appeared', seq.length >= 1);
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('marzena.hints.seen') || '[]'));
  console.log('   seen persisted:', JSON.stringify(seen));
  check('seen hints persisted', seen.length >= 1);
  await page.evaluate(() => { window.__G.settings.set('hints', false); });
  await page.waitForTimeout(800);
  check('hints off removes the card', await page.evaluate(() => !window.__G.hints.cur));
  await page.evaluate(() => { window.__G.settings.set('hints', true); window.__G.hints.reset(); });
  check('reset forgets seen', await page.evaluate(() => window.__G.hints.seenSet.size === 0 && !localStorage.getItem('marzena.hints.seen')));
  await page.close();
}

async function testHintDefs() {
  console.log('--- every hint builds for both devices, and its trigger can fire');
  const page = await newPage();
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__h2')) { localStorage.removeItem('marzena.hints.seen'); sessionStorage.setItem('__h2', '1'); } } catch { /* none */ } });
  await open(page, 'scene=arena&lite=1&enemy=wolves&n=1&god=1&quality=low&hints=1&hud=0');
  await page.evaluate(() => window.__arena.clear());
  await frames(page, 4);
  const rows = await page.evaluate(() => {
    const G = window.__G, out = {};
    for (const id of G.hints.ids) {
      out[id] = {};
      for (const dev of ['kbm', 'pad']) {
        G.input.device = dev;
        let n = -1, err = null, text = '';
        try { G.hints.hide(); const ok = G.hints.show(id, { force: true, seconds: Infinity }); n = ok ? G.hints.cur.rows.length : 0; text = ok ? G.hints.cur.el.textContent : ''; } catch (e) { err = e.message; }
        out[id][dev] = { n, err, text };
      }
    }
    G.hints.hide();
    return out;
  });
  for (const [id, r] of Object.entries(rows)) {
    const ok = !r.kbm.err && !r.pad.err && r.kbm.n > 0 && r.pad.n > 0;
    check(`hint ${id} builds (kbm: "${r.kbm.text}" / pad: "${r.pad.text}")`, ok, r.kbm.err || r.pad.err || '');
  }
  const bad = Object.entries(rows).filter(([, r]) => /[—]/.test(r.kbm.text + r.pad.text));
  check('no em dashes in hint text', bad.length === 0);

  // triggers: contrive the state and ask the watchers
  const w = await page.evaluate(async () => {
    const G = window.__G, H = G.hints, c = H.c, P = G.player, out = {};
    const watch = (id) => !!H.defs.get(id).watch(c);
    G.input.context = 'game';
    out.move_initial = (H.liveT = 5, H.walked = 0, watch('move'));
    H.walked = 10; out.move_after_walk = watch('move');
    // interact
    const id1 = G.interact.add({ id: 't1', pos: [P.position.x + 0.5, P.position.z], radius: 3, label: 'Thing', verb: 'Use', onUse: () => {} });
    await new Promise((r) => setTimeout(r, 300));
    out.interact = watch('interact'); G.interact.remove(id1);
    // senses
    G.senses.addClue({ id: 'tc', pos: [P.position.x + 3, P.position.z], radius: 1.5, label: 'Clue' });
    P.character._setSword?.(false);
    out.senses = watch('senses'); G.senses.removeClue('tc');
    // potion
    P.health = 20; out.potion = watch('potion'); P.health = P.maxHealth;
    // journal and map (out of combat)
    G.combat.inCombat = false; P.moves.lastCombat = -100; P.character._setSword?.(false); P.state = 'explore';
    await new Promise((r) => setTimeout(r, 200));
    out.calm = !c.inCombat;
    G.state.data.quests = { main_pass: { stage: 1, log: [] } }; H.liveT = 20; out.journal = watch('journal'); G.state.data.quests = {};
    G.state.data.discovered = ['village']; H.liveT = 60; out.map = watch('map'); G.state.data.discovered = [];
    // sprint, pause, walk
    H.walked = 40; H.liveT = 12; H.flags.sprinted = false; out.sprint = watch('sprint');
    H.play = 400; out.pause = watch('pause'); H.play = 0;
    // combat ones
    window.__arena.spawn('wolves', { n: 3, engaged: true });
    window.__arena.spawn('effigies', { n: 1, dormant: false });
    await new Promise((r) => setTimeout(r, 2600));
    P.character._setSword?.(true);
    out.inCombat = c.inCombat;
    P.signEnergy = 1; out.ember = watch('ember');
    out.gale = watch('gale');
    P.health = P.maxHealth * 0.4; out.ward = watch('ward'); P.health = P.maxHealth;
    await new Promise((r) => setTimeout(r, 1800));
    out.lock_when_unlocked = watch('lock');
    out.lockParts = { inCombat: c.inCombat, target: !!P.target, enemies14: c.enemies(14).length, since: c.since('combat:start') };
    const en = G.combat.liveEnemies(); P.setTarget(en[0]); out.switch = watch('switch'); P.setTarget(null);
    return out;
  });
  console.log('   ', JSON.stringify(w));
  check('move: shows when standing still, not after walking', w.move_initial === true && w.move_after_walk === false);
  check('interact trigger', w.interact === true);
  check('senses trigger needs a clue within 14 m and a sheathed sword', w.senses === true);
  check('potion trigger when hurt with a draught', w.potion === true);
  check('journal trigger with a quest', w.journal === true);
  check('map trigger after a discovery and some play', w.map === true);
  check('sprint trigger after walking without sprinting', w.sprint === true);
  check('pause trigger after five minutes', w.pause === true);
  check('ember, gale, ward, lock, switch triggers in a fight', w.ember === true && w.gale === true && w.ward === true && w.lock_when_unlocked === true && w.switch === true, JSON.stringify({ e: w.ember, g: w.gale, w: w.ward, l: w.lock_when_unlocked, s: w.switch }));

  // the skip hint during a skippable cutscene
  const skip = await page.evaluate(async () => {
    const G = window.__G;
    window.__arena.clear();
    G.hints.hide(); G.hints.reset();
    G.player.setTarget(null);
    G.hints.gap = 0;
    // a stand-in for a running skippable cutscene
    G.cutscenes = { active: true, skipping: false, _d: { opts: {} } };
    await new Promise((r) => setTimeout(r, 5200));
    const info = { id: G.hints.cur?.id, side: G.hints.cur?.side };
    G.cutscenes.active = false;
    await new Promise((r) => setTimeout(r, 500));
    info.after = G.hints.cur?.id || null;
    return info;
  });
  check('skip hint shows during a skippable cutscene, on the right, and leaves with it', skip.id === 'skip' && skip.side === 'right' && !skip.after, JSON.stringify(skip));
  await page.close();
}

const tests = { input: testInput, lock: testLockAndCollision, menus: testMenus, hints: testHints, defs: testHintDefs };
for (const [name, fn] of Object.entries(tests)) {
  if (only && only !== name) continue;
  try { await fn(); } catch (e) { fail++; console.log('FAIL  ' + name + ' threw: ' + e.message); }
}
console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
const uniq = [...new Set(logs)];
console.log('console messages:', uniq.length);
for (const l of uniq.slice(0, 20)) console.log('  ' + l);
await browser.close();
await server.close();
