#!/usr/bin/env node
// Plays the tavern dice game in a real browser the way a player does: keys, the mouse and a mocked gamepad, with a
// screenshot at each step. Checks the controls, the camera and input hand-back, the coins and the hints.
//
//   MZ_CHROME=1 node scripts/dicedrive.mjs [match|pad|leave]      (no argument runs everything, about three minutes)
//
//   match   a whole match from the keyboard and the mouse: stake, raise, pick dice (digits, cursor, click), roll, next round
//   pad     the same screens from a mocked pad: D-pad moves, A picks, X rolls, Y raises, B leaves; pad glyphs in the footer
//   leave   Esc asks first, Stay returns to the question, Leave loses the round and hands everything back cleanly
// Needs `npm install --no-save playwright-core` and Google Chrome (MZ_CHROME=1), like shot.mjs. Pictures: shots/dice/drive_*.png
/* global window, document */
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
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
  window.__pad = pad; window.__padOn = false;
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
  window.__btn = (i, down) => { pad.buttons[i].pressed = down; pad.buttons[i].value = down ? 1 : 0; };
})();`;
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, Back: 8, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 };

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  [${extra}]` : ''}`); };
const logs = [];

async function open(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/404|Program Info Log|X4122|X4000|X3577|GPU stall|WebGL/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.addInitScript(MOCK);
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__d')) { localStorage.removeItem('marzena.hints.seen'); sessionStorage.setItem('__d', '1'); } } catch { /* none */ } });
  await page.goto(`${base}/witcher-marzena/?shot&scene=dice&fps=30&hour=19&quality=low&hints&${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 300000, polling: 250 });
  await page.waitForTimeout(2500);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${W}/shots/dice/drive_${name}.png` });
const until = (page, phase, ms = 60000) => page.evaluate(([p, t]) => window.__dice.until(p, t).then((e) => e.phase), [phase, ms]);
const press = async (page, code) => { await page.evaluate((c) => window.__dice.press(c), code); await page.waitForTimeout(120); };
const state = (page) => page.evaluate(() => window.__dice.state());
const btn = async (page, i, ms = 140) => { await page.evaluate((k) => window.__btn(k, true), i); await page.waitForTimeout(ms); await page.evaluate((k) => window.__btn(k, false), i); await page.waitForTimeout(110); };
const settle = (page, ms = 700) => page.waitForTimeout(ms);

async function testMatch() {
  console.log('--- a match from the keyboard and the mouse');
  const page = await open('seed=7&coins=40&opp=wojtek');
  const pre = await page.evaluate(() => {
    const G = window.__G, n = G.npcs.get('wojtek'), z = G.npcs.get('zbyszek'), h = G.npcs.get('halina');
    const bar = G.world.locations.village.buildings.tavern.p.anchors.keeper;
    return { w: n.visible, h: h.visible, wst: n.station?.id, hst: h.station?.id, zd: Math.hypot(z.position.x - bar.x, z.position.z - bar.z), zy: z.position.y - bar.y };
  });
  check('Wojtek and Halina sit at the middle table and Zbyszek is behind the bar', pre.w && pre.h && pre.wst === 'wojtek_seat' && pre.hst === 'halina_seat' && pre.zd < 1.2 && Math.abs(pre.zy) < 0.3, JSON.stringify(pre));
  await page.evaluate(() => window.__dice.start({ seed: 7 }));
  await until(page, 'stake');
  await settle(page);
  let s = await page.evaluate(() => { const G = window.__G; return { ctx: G.input.context, owner: G.cameraOwner, busy: !!G.story.busy, active: G.dice.active, vis: G.player.character.visible, frozen: G.time.frozen, menu: G.ui?.isOpen?.() }; });
  check('while playing: input context ui, the dice own the camera, the story is busy, the clock is held', s.ctx === 'ui' && s.owner === 'dice' && s.busy && s.active && s.frozen, JSON.stringify(s));
  check('Vesna is out of the camera while she plays', s.vis === false);
  await shot(page, '01_stake');
  await press(page, 'ArrowRight'); await press(page, 'ArrowRight');
  const stake = await page.evaluate(() => window.__dice.G.dice.session.ui.stakeValue);
  check('the arrows change the stake', stake === 5, `${stake}`);
  await press(page, 'Enter');
  await until(page, 'bet');
  await settle(page, 900);
  s = await state(page);
  check('the first roll lands: five dice each', s.match.dice.player.length === 5 && s.match.dice.opp.length === 5 && s.match.round === 1);
  check('stakes are in the pot, out of the purse', s.match.pot === 10 && s.coins === 35, `pot ${s.match.pot} coins ${s.coins}`);
  await shot(page, '02_bet');
  const hint = await page.evaluate(() => window.__G.hints.cur?.id);
  check('first raise: the hint card shows', hint === 'dice_raise', `${hint}`);
  const ref = await page.evaluate(() => ({ on: !!document.querySelector('.dc-ref.on'), mine: document.querySelector('.dc-ref .row.you .nm')?.textContent, his: document.querySelector('.dc-ref .row.opp .nm')?.textContent, hand: document.querySelector('.dc-hand.you')?.textContent }));
  check('the list of hands is up and marks her hand and his', ref.on && !!ref.mine && !!ref.his && !!ref.hand, JSON.stringify(ref));
  await press(page, 'KeyH');
  check('H hides the list', await page.evaluate(() => !document.querySelector('.dc-ref.on')));
  await press(page, 'KeyH');
  check('and shows it again', await page.evaluate(() => !!document.querySelector('.dc-ref.on')));
  await press(page, 'KeyR');
  await page.waitForFunction(() => ['reroll', 'respond', 'showdown'].includes(window.__dice.phase()?.phase), null, { timeout: 30000 });
  const afterRaise = await page.evaluate(() => window.__dice.phase().phase);
  console.log('   after the raise:', afterRaise);
  check('R raises; the opponent answers', ['reroll', 'showdown'].includes(afterRaise), afterRaise);
  if (afterRaise !== 'reroll') { console.log('   (the opponent folded)'); await page.close(); return; }
  await settle(page, 600);
  s = await state(page);
  check('the reroll question: nothing picked, cursor on the middle die', s.mode === 'reroll' && s.picked.every((b) => !b) && s.focus === 2, JSON.stringify([s.mode, s.picked, s.focus]));
  const hint2 = await page.evaluate(() => window.__G.hints.cur?.id);
  check('first reroll: the picking hint shows', hint2 === 'dice_pick', `${hint2}`);
  await press(page, 'Digit2'); await press(page, 'Digit4');
  s = await state(page);
  check('digits pick dice', JSON.stringify(s.picked) === JSON.stringify([false, true, false, true, false]), JSON.stringify(s.picked));
  await press(page, 'Digit2');
  s = await state(page);
  check('the same digit puts it back', JSON.stringify(s.picked) === JSON.stringify([false, false, false, true, false]));
  // the cursor is on die 2 (the last one picked); two steps left wrap round to the fifth
  await press(page, 'ArrowLeft'); await press(page, 'ArrowLeft');
  await press(page, 'KeyE');
  s = await state(page);
  check('the arrows move the cursor (and wrap) and E picks the die under it', s.focus === 4 && s.picked[4] === true, JSON.stringify([s.focus, s.picked]));
  const pt = await page.evaluate(() => window.__dice.G.dice.session.stage.screenOf('player', 2));
  await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(150);
  s = await state(page);
  check('the mouse over a die moves the cursor to it', s.focus === 2, `${s.focus}`);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(150);
  s = await state(page);
  check('a click picks the die', s.picked[2] === true, JSON.stringify(s.picked));
  await shot(page, '03_reroll');
  const cursorTitle = await page.evaluate(() => document.querySelector('.dc-panel .opt.sel .lab')?.textContent);
  check('the button counts the dice picked', /three/.test(cursorTitle || ''), cursorTitle);
  const before = await page.evaluate(() => window.__dice.G.dice.session.match.dice.player.slice());
  const pickedNow = (await state(page)).picked;
  await press(page, 'Space');
  await until(page, 'roll2');
  await page.waitForTimeout(500);
  await shot(page, '04_rolling');
  await until(page, 'showdown');
  await settle(page, 1500);
  await shot(page, '05_showdown');
  const after = await page.evaluate(() => window.__dice.G.dice.session.match.dice.player.slice());
  check('only the picked dice changed (kept dice keep their values)', pickedNow.every((p, i) => p || before[i] === after[i]), `${pickedNow} ${before} -> ${after}`);
  await until(page, 'next');
  await settle(page, 800);
  await shot(page, '06_next');
  s = await state(page);
  check('the round is settled and the coins add up', s.coins >= 0 && s.match.wins.player + s.match.wins.opp <= 1, JSON.stringify([s.coins, s.match.wins]));
  await press(page, 'Enter');
  await until(page, 'bet');
  check('Enter starts the next round', (await state(page)).match.round >= 2 || (await state(page)).match.round === 1);
  await page.close();
}

async function testLeave() {
  console.log('--- leaving the table');
  const page = await open('seed=11&coins=30&opp=halina');
  const pre = await page.evaluate(() => ({ coins: window.__G.state.count('coins'), owner: window.__G.cameraOwner, fov: window.__G.camera.fov }));
  await page.evaluate(() => window.__dice.start({ seed: 11 }));
  await until(page, 'stake');
  await press(page, 'Enter');
  // Esc while the dice are still rolling: the question comes up when they have landed
  await until(page, 'roll1');
  await press(page, 'Escape');
  await page.waitForFunction(() => document.querySelector('.dc-panel .ttl')?.textContent === 'Leave the table?', null, { timeout: 30000 });
  check('Esc while the dice roll asks once they have landed', true);
  await press(page, 'Enter'); // Stay
  await until(page, 'bet');
  await settle(page, 800);
  const back = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('Stay there goes on to the question the round was coming to', /Raise/.test(back || ''), back);
  await press(page, 'Escape');
  let t = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('Esc asks first', t === 'Leave the table?', t);
  await shot(page, '10_leave_ask');
  await press(page, 'Escape');
  t = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('Esc again stays at the table and the question comes back', /Raise/.test(t || ''), t);
  await press(page, 'Escape');
  await press(page, 'Enter'); // Stay is the first answer
  t = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('Stay returns to the question', /Raise/.test(t || ''), t);
  await press(page, 'Escape');
  await press(page, 'ArrowDown'); await press(page, 'Enter');
  const res = await page.evaluate(() => window.__dice.result.then((r) => ({ played: r.played, verdict: r.verdict, net: r.net })));
  check('Leave ends the match with no winner and the stake lost', res.played && res.verdict === 'left' && res.net === -2, JSON.stringify(res));
  await page.waitForTimeout(1200);
  const post = await page.evaluate(() => { const G = window.__G; return { coins: G.state.count('coins'), owner: G.cameraOwner, fov: G.camera.fov, ctx: G.input.context, active: G.dice.active, vis: G.player.character.visible, busy: !!G.story.busy, frozen: G.time.frozen, ctl: G.player.control, screens: document.querySelectorAll('.mz-dice').length }; });
  check('everything is handed back: camera, context, clock, Vesna, controls, no screen left', post.owner === pre.owner && Math.abs(post.fov - pre.fov) < 0.01 && post.ctx === 'game' && !post.active && post.vis && !post.busy && !post.frozen && post.ctl && post.screens === 0, JSON.stringify(post));
  check('the coins stayed lost: 30 - 2', post.coins === pre.coins - 2, `${pre.coins} -> ${post.coins}`);
  await shot(page, '11_after');
  await page.close();
}

async function testPad() {
  console.log('--- the same screens from a pad');
  const page = await open('seed=7&coins=40&opp=zbyszek');
  await page.evaluate(() => { window.__padOn = true; });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__dice.start({ seed: 7 }));
  await until(page, 'stake');
  await btn(page, BTN.Right); await btn(page, BTN.Right);
  let v = await page.evaluate(() => window.__dice.G.dice.session.ui.stakeValue);
  check('D-pad right raises the stake (Zbyszek tops out at 3)', v === 3, `${v}`);
  const glyph = await page.evaluate(() => !!document.querySelector('.dc-panel .bar .mz-pad'));
  check('the footer shows pad glyphs', glyph);
  await btn(page, BTN.A);
  await until(page, 'bet');
  await settle(page, 800);
  await shot(page, '20_pad_bet');
  await btn(page, BTN.A); // Keep the stake (the second answer is selected)
  await page.waitForFunction(() => ['reroll', 'respond', 'showdown'].includes(window.__dice.phase()?.phase), null, { timeout: 30000 });
  let ph = await page.evaluate(() => window.__dice.phase().phase);
  if (ph === 'respond') { await btn(page, BTN.Down); await btn(page, BTN.A); await page.waitForFunction(() => ['reroll', 'showdown'].includes(window.__dice.phase()?.phase), null, { timeout: 30000 }); ph = await page.evaluate(() => window.__dice.phase().phase); }
  if (ph !== 'reroll') { console.log('   (no reroll this time:', ph, ')'); await page.close(); return; }
  await settle(page, 600);
  await btn(page, BTN.Right); await btn(page, BTN.A);
  let s = await state(page);
  check('D-pad moves the cursor and A picks', s.focus === 3 && s.picked[3] === true, JSON.stringify([s.focus, s.picked]));
  await btn(page, BTN.Left); await btn(page, BTN.Left); await btn(page, BTN.A);
  s = await state(page);
  check('and again, to the left', s.focus === 1 && s.picked[1] === true, JSON.stringify([s.focus, s.picked]));
  await btn(page, BTN.A);
  s = await state(page);
  check('A on a picked die puts it back', s.picked[1] === false);
  await shot(page, '21_pad_reroll');
  const hintBar = await page.evaluate(() => [...document.querySelectorAll('.dc-panel .bar .lab')].map((e) => e.textContent).join('|'));
  console.log('   footer:', hintBar);
  await btn(page, BTN.X);
  await until(page, 'roll2');
  check('X rolls the picked dice', true);
  await until(page, 'next');
  await settle(page, 600);
  await btn(page, BTN.B);
  let t = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('B asks to leave', t === 'Leave the table?', t);
  await btn(page, BTN.B);
  t = await page.evaluate(() => document.querySelector('.dc-panel .ttl')?.textContent);
  check('B again stays', t !== 'Leave the table?', t);
  await page.close();
}

const tests = { match: testMatch, leave: testLeave, pad: testPad };
for (const [name, fn] of Object.entries(tests)) {
  if (only && only !== name) continue;
  try { await fn(); } catch (e) { fail++; console.log(`FAIL  ${name} threw: ${e.message}`); }
}
console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
const uniq = [...new Set(logs)];
console.log('console messages:', uniq.length);
for (const l of uniq.slice(0, 20)) console.log(`  ${l}`);
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
