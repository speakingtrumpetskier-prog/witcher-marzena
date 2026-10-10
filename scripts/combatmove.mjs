#!/usr/bin/env node
// Functional test of fighting on the move: lock-on strafing on foot and fighting from the saddle. Drives the combat arena
// (scene=arena&lite=1, real Player, Horse, Combat and creatures, simulated by fixed steps through __arena.advance) in a real
// browser and prints PASS or FAIL per check.
//
//   MZ_CHROME=1 node scripts/combatmove.mjs [strafe|ride|fall]      (no argument runs all three, about 2 minutes)
//
//   strafe  locked on: she faces the target while the stick walks her left, right, back, forward and on the diagonals; the
//           lock-on steps and the turn-in-place steps play; sprint still runs where the stick points; planted feet do not
//           slide in the real game (bones measured each frame); unlocked she moves exactly as before
//   ride    on Kasza: draw and sheathe, the swing goes to the locked target's side, to the nearest enemy, or to the camera's
//           side; a wolf beside the horse takes damage, more at a trot and a gallop; Kasza shies when a wolf launches at her
//   fall    a bite while winded or a heavy blow throws her; a short fall, then on her feet in guard; every hit is ignored
//           meanwhile; Kasza bolts a few metres, answers the whistle and can be mounted again
// Needs `npm install --no-save playwright-core` and a local Google Chrome (set MZ_CHROME=1), like shot.mjs.
/* global window */
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

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const logs = [];

// The snow by the village shore: the horse will not stand on ice and the arena's default spot is the lake.
const SNOW = 'site=-10,70';
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/witcher-marzena/?shot&scene=arena&lite=1&quality=low&hud=0&god=1&${SNOW}&${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 240000, polling: 250 });
  return page;
}

// ---------------------------------------------------------------------------------------------------------
async function testStrafe() {
  console.log('--- lock-on strafing on foot');
  const page = await open('enemy=effigies&n=1');
  const r = await page.evaluate(async () => {
    const G = window.__G, P = G.player, A = window.__arena;
    A.clear();
    G.horse.teleport(10, 40, 0);
    P.teleport(-10, 70, Math.PI);
    G.cameraRig.snapBehind(Math.PI);
    const root = new G.THREE.Group(); G.scene.add(root); root.position.set(-10, G.world.heightAt(-10, 60), 60);
    const dummy = G.combat.register({ root, position: root.position, radius: 0.5, height: 1.6, health: 1e6, maxHealth: 1e6, alive: true, faction: 'hostile', takeHit() { return { hit: true, damage: 0 }; }, kind: 'dummy' });
    A.advance(0.6);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const c = P.character, L = c.anim.loco;
    const bearing = () => Math.atan2(dummy.position.x - P.position.x, dummy.position.z - P.position.z);
    const names = () => (L.weights || []).filter(([, w]) => w > 0.2).map(([n]) => n);
    const out = {};
    // unlocked: she runs where the stick points, as before
    A.key('KeyA', true); A.advance(1.0);
    out.unlocked = { strafing: P._strafing, faceErr: Math.abs(wrap(P.loco.yaw - bearing())), names: names() };
    A.key('KeyA', false); A.advance(0.6);
    // lock on
    A.tap('KeyT'); A.advance(0.5);
    out.locked = !!P.target;
    // feet: sample the ankle bones and the body each frame while she steps
    const gy = (x, z) => G.world.heightAt(x, z);
    const ankleH = c.M.ankleY;
    const probe = (keys, secs, label) => {
      for (const k of keys) A.key(k, true);
      A.advance(0.6);
      let slipSum = 0, slipN = 0, errMax = 0;
      const prev = {};
      for (let i = 0; i < Math.round(secs * 30); i++) {
        A.advance(1 / 30, 1 / 30);
        c.root.updateMatrixWorld(true);
        errMax = Math.max(errMax, Math.abs(wrap(P.loco.yaw - bearing())));
        for (const S of ['L', 'R']) {
          const p = c.bones['foot' + S].getWorldPosition(new G.THREE.Vector3());
          const planted = p.y - gy(p.x, p.z) < ankleH + 0.012;
          const q = prev[S];
          if (q && planted && q.planted && P.loco.speed > 0.8) {
            const d = Math.hypot(p.x - q.x, p.z - q.z) / (P.loco.speed / 30);
            slipSum += d; slipN++;
          }
          prev[S] = { x: p.x, z: p.z, planted };
        }
      }
      const lx = L.lx, lz = L.lz;
      const res = { label, speed: +P.loco.speed.toFixed(2), lx: +lx.toFixed(2), lz: +lz.toFixed(2), faceErr: +errMax.toFixed(3), strafing: P._strafing, names: names(), slip: slipN ? +(slipSum / slipN).toFixed(2) : null, slipN };
      for (const k of keys) A.key(k, false);
      A.advance(0.7);
      res.stopped = P.loco.speed < 0.1;
      return res;
    };
    out.left = probe(['KeyA'], 1.2, 'left');
    out.right = probe(['KeyD'], 1.2, 'right');
    out.back = probe(['KeyS'], 1.2, 'back');
    out.fwd = probe(['KeyW'], 0.8, 'forward');
    out.fl = probe(['KeyW', 'KeyA'], 1.0, 'forward-left');
    out.br = probe(['KeyS', 'KeyD'], 1.0, 'back-right');
    // sprint breaks the lock stance and runs where the stick points
    A.key('KeyA', true); A.key('ShiftLeft', true); A.advance(1.0);
    out.sprint = { strafing: P._strafing, faceErr: Math.abs(wrap(P.loco.yaw - bearing())), speed: P.loco.speed };
    A.key('KeyA', false); A.key('ShiftLeft', false); A.advance(1.2);
    // standing still while the target circles her: she turns with it, in steps
    let turnW = 0, errMax = 0;
    const R0 = 6; let ang = 0;
    for (let i = 0; i < 120; i++) {
      ang += (1.4 / 30);
      dummy.position.set(P.position.x + Math.sin(ang) * R0, dummy.position.y, P.position.z + Math.cos(ang) * R0);
      A.advance(1 / 30, 1 / 30);
      for (const [n, w] of L.weights || []) if (/turn/.test(n)) turnW = Math.max(turnW, w);
      if (i > 20) errMax = Math.max(errMax, Math.abs(wrap(P.loco.yaw - bearing())));
    }
    out.turn = { turnW: +turnW.toFixed(2), faceErr: +errMax.toFixed(3), spin: +Math.abs(L.sw).toFixed(2) };
    // far targets are only a camera lock
    dummy.position.set(P.position.x, dummy.position.y, P.position.z - 30);
    A.key('KeyA', true); A.advance(0.8);
    out.far = { strafing: P._strafing };
    A.key('KeyA', false);
    return out;
  });
  console.log('   ', JSON.stringify(r.left), '\n   ', JSON.stringify(r.back));
  check('without a lock she still turns to run where the stick points', !r.unlocked.strafing && r.unlocked.faceErr > 1.0, JSON.stringify(r.unlocked));
  check('T locks the target', r.locked === true);
  for (const k of ['left', 'right', 'back', 'fwd', 'fl', 'br']) {
    const x = r[k];
    check(`${x.label}: the body stays on the target (worst ${(x.faceErr * 57.3).toFixed(1)} degrees) and she moves`, x.strafing && x.faceErr < 0.12 && x.speed > 0.9, JSON.stringify({ speed: x.speed, lx: x.lx, lz: x.lz }));
    check(`${x.label}: the lock-on steps play (${x.names.map((n) => n.replace('strafe_guard_', '')).join(' ')}) and she stops when the stick is released`, x.names.some((n) => /strafe_guard/.test(n)) && x.stopped);
  }
  check('left moves to her left, right to her right, back backwards', r.left.lx > 1.5 && r.right.lx < -1.5 && r.back.lz < -1.2 && r.fwd.lz > 0.8);
  check('the diagonals blend the neighbouring steps', r.fl.lx > 1 && r.fl.lz > 1 && r.br.lx < -0.8 && r.br.lz < -0.8);
  for (const k of ['left', 'right', 'back']) {
    const x = r[k];
    check(`${x.label}: planted feet slide ${x.slip == null ? 'n/a' : Math.round(x.slip * 100) + '%'} of her speed on the snow (${x.slipN} samples)`, x.slip != null && x.slip < 0.35);
  }
  check('sprint with a lock runs where the stick points, not in the lock stance', !r.sprint.strafing && r.sprint.faceErr > 1 && r.sprint.speed > 3.5, JSON.stringify(r.sprint));
  check('standing, a target circling her turns her with it in turn steps', r.turn.turnW > 0.3 && r.turn.faceErr < 0.2, JSON.stringify(r.turn));
  check('a target more than 24 m away is only a camera lock', r.far.strafing === false);
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
async function testRide() {
  console.log('--- fighting from the saddle');
  const page = await open('enemy=effigies&n=1&mounted=1');
  const r = await page.evaluate(async () => {
    const G = window.__G, P = G.player, H = G.horse, A = window.__arena;
    A.clear();
    A.advance(0.8);
    const out = {};
    const top = () => { const u = P.character.anim.upper; return u.length ? u[u.length - 1].clip.name : '-'; };
    out.start = { mounted: P.mounted, sword: P.swordDrawn, upper: top() };
    // sheathe and draw again with the key
    A.tap('KeyR'); A.advance(1.6);
    out.sheathed = { sword: P.swordDrawn, upper: top() };
    A.tap('KeyR'); A.advance(1.6);
    out.redrawn = { sword: P.swordDrawn, upper: top() };
    const clipOf = () => { const u = P.character.anim.upper; return u.length ? u[u.length - 1].clip.name : '-'; };
    const swing = (kind = 0) => { A.click(kind); A.advance(0.45); const c = clipOf(); A.advance(1.1); return c; };
    const hy = H.yaw, lx = Math.cos(hy), lz = -Math.sin(hy);
    const hp = H.position.clone();
    // a real wolf asleep beside the horse takes a real blow
    const wolf = G.creatures.spawnWolves(hp.x + lx * 1.7, hp.z + lz * 1.7, 1, { engaged: false, yaw: 0 })[0];
    wolf.health = wolf.maxHealth = 400;
    A.advance(0.3);
    P.setTarget(wolf); A.advance(0.3);
    const w0 = wolf.health;
    out.wolf = { clip: swing(), lost: +(w0 - wolf.health).toFixed(0) };
    P.setTarget(null);
    wolf.alive = false; G.combat.unregister(wolf); wolf.root.visible = false;
    // two stand-ins that stay where they are (a hurt wolf wakes and circles), one each side of the horse
    const dummy = (x, z) => {
      const root = new G.THREE.Group(); G.scene.add(root); root.position.set(x, G.world.heightAt(x, z), z);
      return G.combat.register({ root, position: root.position, radius: 0.5, height: 0.95, health: 1e6, maxHealth: 1e6, alive: true, faction: 'hostile', kind: 'dummy', n: 0, takeHit() { this.n++; return { hit: true, damage: 0 }; } });
    };
    const dl = dummy(hp.x + lx * 1.7, hp.z + lz * 1.7), dr = dummy(hp.x - lx * 1.7, hp.z - lz * 1.7);
    A.advance(0.3);
    const count = () => [dl.n, dr.n];
    const reset = () => { dl.n = 0; dr.n = 0; };
    P.setTarget(dl); A.advance(0.3); reset();
    out.lockLeft = { clip: swing(), hit: count() };
    P.setTarget(dr); A.advance(0.3); reset();
    out.lockRight = { clip: swing(), hit: count() };
    reset();
    out.heavy = { clip: swing(2), hit: count() };
    // no lock: the nearest enemy in front of the camera (the left one moves away)
    P.setTarget(null); dl.position.set(hp.x + lx * 6, dl.position.y, hp.z + lz * 6);
    A.advance(0.3); reset();
    out.nearest = { clip: swing(), hit: count() };
    // nothing to hit: the camera's side, both shoulders (the camera put straight behind her first)
    for (const d of [dl, dr]) { d.alive = false; G.combat.unregister(d); d.root.visible = false; }
    A.advance(0.3);
    G.settings.set('shoulder', 'right'); G.cameraRig.snapBehind(H.yaw); A.advance(1.0);
    out.camRight = swing();
    G.settings.set('shoulder', 'left'); G.cameraRig.snapBehind(H.yaw); A.advance(1.0);
    out.camLeft = swing();
    G.settings.set('shoulder', 'right'); G.cameraRig.snapBehind(H.yaw); A.advance(1.0);
    // damage by speed (the swing event)
    const swings = [];
    G.events.on('player:swing', (s) => swings.push({ dmg: s.damage, stagger: s.stagger, speed: s.speed }));
    for (const keys of [[], ['KeyW'], ['KeyW', 'ShiftLeft']]) {
      P.stamina = 100; H.tired = false;
      H.position.set(-10, G.world.heightAt(-10, 92), 92); // start far enough from the lake to run 2 s north on snow
      H.yaw = Math.PI; G.cameraRig.snapBehind(Math.PI);
      A.advance(0.4);
      for (const k of keys) A.key(k, true);
      A.advance(2.4);
      swings.length = 0; P.stamina = 100;
      A.click(0); A.advance(0.5);
      out['speed_' + (keys.join('+') || 'still')] = swings[0] || null;
      for (const k of keys) A.key(k, false);
      A.advance(2.6);
    }
    // swing costs stamina; with none left she cannot swing
    P.stamina = 0; swings.length = 0; A.click(0); A.advance(0.6);
    out.noStamina = swings.length;
    P.stamina = 100;
    // Kasza shies when a wolf launches at her head
    const shies = [];
    G.events.on('horse:shy', (e) => shies.push(e));
    const hp2 = H.position.clone(), hy2 = H.yaw;
    const lunger = G.creatures.spawnWolves(hp2.x + Math.sin(hy2) * 3.6, hp2.z + Math.cos(hy2) * 3.6, 1, { engaged: true, yaw: hy2 + Math.PI })[0];
    lunger.go('telegraph', { quick: true });
    let moved = 0;
    for (let i = 0; i < 60; i++) { A.advance(1 / 30, 1 / 30); moved = Math.max(moved, Math.abs((H.position.x - hp2.x) * Math.cos(hy2) - (H.position.z - hp2.z) * Math.sin(hy2))); }
    out.shy = { events: shies.length, sidestep: +moved.toFixed(2), mounted: P.mounted };
    return out;
  });
  check('she starts in the saddle with the blade out and the ready pose up', r.start.mounted && r.start.sword && r.start.upper === 'ride_ready', JSON.stringify(r.start));
  check('R sheathes the sword in the saddle', r.sheathed.sword === false, JSON.stringify(r.sheathed));
  check('R draws it again and the ready pose returns', r.redrawn.sword === true && r.redrawn.upper === 'ride_ready', JSON.stringify(r.redrawn));
  check('a real wolf beside the horse, locked, takes a left swing', r.wolf.clip === 'ride_slash_l' && r.wolf.lost >= 15, JSON.stringify(r.wolf));
  check('locked on the left the swing goes left and only the left one is struck', r.lockLeft.clip === 'ride_slash_l' && r.lockLeft.hit[0] >= 1 && r.lockLeft.hit[1] === 0, JSON.stringify(r.lockLeft));
  check('locked on the right it goes right and only the right one is struck', r.lockRight.clip === 'ride_slash_r' && r.lockRight.hit[1] >= 1 && r.lockRight.hit[0] === 0, JSON.stringify(r.lockRight));
  check('the heavy blow chops to the locked side', r.heavy.clip === 'ride_chop_r' && r.heavy.hit[1] >= 1 && r.heavy.hit[0] === 0, JSON.stringify(r.heavy));
  check('with no lock the swing goes to the nearest enemy beside the horse', r.nearest.clip === 'ride_slash_r' && r.nearest.hit[1] >= 1, JSON.stringify(r.nearest));
  check('with nothing to hit it goes to the side the camera is on', r.camRight === 'ride_slash_r' && r.camLeft === 'ride_slash_l', `${r.camRight} / ${r.camLeft}`);
  const s0 = r.speed_still, s1 = r['speed_KeyW'], s2 = r['speed_KeyW+ShiftLeft'];
  check('the blow grows with the horse\'s speed and a gallop staggers', s0 && s1 && s2 && s0.dmg < s1.dmg && s1.dmg < s2.dmg && s2.stagger && !s0.stagger, JSON.stringify([s0, s1, s2]));
  check('a swing needs stamina', r.noStamina === 0);
  check('Kasza shies when a wolf launches at her head: an event and a step to the side, the rider stays up', r.shy.events >= 1 && r.shy.sidestep > 0.3 && r.shy.mounted, JSON.stringify(r.shy));
  await page.close();
}

// ---------------------------------------------------------------------------------------------------------
async function testFall() {
  console.log('--- thrown from the saddle');
  const page = await open('enemy=effigies&n=1&mounted=1');
  const r = await page.evaluate(async () => {
    const G = window.__G, P = G.player, H = G.horse, A = window.__arena;
    A.clear();
    A.advance(0.8);
    const out = {};
    const c = P.character;
    // something that bites from her left (side 1) or right (side -1) as she sits now
    const fake = (side) => {
      const lx = Math.cos(H.yaw), lz = -Math.sin(H.yaw);
      return { position: new G.THREE.Vector3(H.position.x + lx * 1.5 * side, H.position.y, H.position.z + lz * 1.5 * side), root: { parent: G.scene } };
    };
    const dist = () => Math.hypot(H.position.x - P.position.x, H.position.z - P.position.z);
    // an ordinary bite
    P.health = P.maxHealth; P.stamina = 100;
    const h0 = P.health;
    let res = P.damage(11, { from: fake(1), knockback: 0.7 });
    A.advance(0.6);
    out.bite = { result: res.result, lost: +(h0 - P.health).toFixed(0), mounted: P.mounted };
    // a bite while winded
    P.health = P.maxHealth; P.stamina = 8; P.moves.mercy = 0;
    const p0 = H.position.clone();
    const hp0 = P.health;
    res = P.damage(11, { from: fake(1), knockback: 0.7 });
    out.winded = { result: res.result, lost: +(hp0 - P.health).toFixed(0), horse: H.state, mounted: P.mounted };
    let minHips = 9, inv = null, rootBelow = 0;
    for (let i = 0; i < 75; i++) {
      A.advance(1 / 30, 1 / 30);
      c.root.updateMatrixWorld(true);
      const hp = c.bones.hips.getWorldPosition(new G.THREE.Vector3());
      const g = G.world.heightAt(hp.x, hp.z);
      minHips = Math.min(minHips, hp.y - g);
      rootBelow = Math.min(rootBelow, c.root.position.y - G.world.heightAt(c.root.position.x, c.root.position.z));
      if (i === 25) inv = P.damage(11, { from: fake(-1) }).result;
    }
    out.fall = { minHips: +minHips.toFixed(2), rootBelow: +rootBelow.toFixed(3), hitDuring: inv, landedAway: +Math.hypot(P.position.x - p0.x, P.position.z - p0.z).toFixed(2) };
    A.advance(0.4);
    out.after = { horse: H.state, mounting: P._mounting, state: P.state, sword: P.swordDrawn, control: P.control, horseDist: +dist().toFixed(1), clip: c.anim.mode };
    A.advance(1.5);
    out.bolted = { dist: +dist().toFixed(1), speed: +H.speed.toFixed(2) };
    A.tap('KeyX'); A.advance(0.3);
    out.whistle = { horse: H.state };
    A.advance(9);
    out.arrived = { horse: H.state, dist: +dist().toFixed(1) };
    A.tap('KeyX'); A.advance(4.5);
    out.remount = { horse: H.state, mounted: P.mounted };
    // a heavy blow at full stamina, from the right: she is thrown to her left
    P.stamina = 100; P.health = P.maxHealth; P.moves.mercy = 0;
    res = P.damage(17, { from: fake(-1), knockback: 1.4, stagger: true });
    out.heavy = { result: res.result, horse: H.state, side: H.seq ? H.seq.side : null };
    A.advance(3);
    out.heavyAfter = { horse: H.state, state: P.state };
    // mounting while the fall is on is refused, and a teleport ends it cleanly
    A.tap('KeyX'); A.advance(10);
    A.tap('KeyX'); A.advance(4.5);
    P.stamina = 5; P.moves.mercy = 0;
    P.damage(11, { from: fake(1) });
    A.advance(0.6);
    const refused = H.mount();
    P.teleport(-30, 70, 0);
    out.teleport = { refused: refused === false, horse: H.state, mounting: P._mounting, autoGround: c.autoGround };
    return out;
  });
  check('a bite at full stamina costs health and she stays up', r.bite.result === 'hit' && r.bite.lost === 11 && r.bite.mounted, JSON.stringify(r.bite));
  check('a bite while winded costs health and throws her', r.winded.lost === 11 && r.winded.horse === 'thrown' && !r.winded.mounted, JSON.stringify(r.winded));
  check('the fall: the pelvis comes down to the ground and stays above it, the root never goes under the snow', r.fall.minHips > 0.05 && r.fall.minHips < 0.3 && r.fall.rootBelow > -0.02, JSON.stringify(r.fall));
  check('she lands to the side, away from where the wolf was', r.fall.landedAway > 1.6 && r.fall.landedAway < 3.4, `${r.fall.landedAway} m`);
  check('every hit during the fall is ignored', r.fall.hitDuring === 'dodged');
  check('afterwards she is on her feet with control and the blade still in hand', r.after.horse === 'idle' && !r.after.mounting && r.after.control && r.after.sword, JSON.stringify(r.after));
  check('Kasza has bolted a few metres and stopped', r.after.horseDist > 4 && r.after.horseDist < 14 && r.bolted.speed < 0.3, JSON.stringify(r.bolted));
  check('X whistles her back', r.whistle.horse === 'called' && r.arrived.dist < 4.2, `${JSON.stringify(r.whistle)} ${JSON.stringify(r.arrived)}`);
  check('and she can be mounted again', r.remount.mounted === true, JSON.stringify(r.remount));
  check('a heavy blow throws her at full stamina, away from the attacker', r.heavy.horse === 'thrown' && r.heavy.side === 1 && r.heavyAfter.horse === 'idle', JSON.stringify([r.heavy, r.heavyAfter]));
  check('mounting during the fall is refused; a teleport ends it', r.teleport.refused && r.teleport.horse === 'idle' && !r.teleport.mounting && r.teleport.autoGround, JSON.stringify(r.teleport));
  await page.close();
}

const tests = { strafe: testStrafe, ride: testRide, fall: testFall };
for (const [name, fn] of Object.entries(tests)) {
  if (only && only !== name) continue;
  try { await fn(); } catch (e) { fail++; console.log('FAIL  ' + name + ' threw: ' + e.message); }
}
console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
const uniq = [...new Set(logs)];
console.log('console errors:', uniq.length);
for (const l of uniq.slice(0, 20)) console.log('  ' + l);
await browser.close();
await server.close();
process.exit(fail || uniq.length ? 1 : 0);
