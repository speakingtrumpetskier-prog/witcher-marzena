// Gameplay playground: the real world modules with Vesna and Kasza on the village shore.
//
//   ?scene=playground               play it: WASD, mouse (click to lock), Shift sprint, Space dodge (double-tap rolls),
//                                   R sword, LMB light combo, RMB heavy, F parry/block, 1/2/3 + Q signs, H Thaw,
//                                   T lock-on, X whistle/mount/dismount, CapsLock or Alt walk toggle.
//   &start=x,z,yaw                  spawn (default -10,70 facing the lake)       &dummy=1 straw target ahead (also in combat demos)
//   &camyaw=1.2                     camera yaw offset from behind the player       &zoom=0.8   &hud=0 hide the HUD
//   &mounted=1                      start in the saddle                            &warmth=0.2 &hp=40 &signs=0.3 test vitals
//   &demo=run|turn|sprint|dodge|combo|heavy|sign|ice|call|mount|gallop|block     scripted input, run on game ready
// Test hooks (window.__pg): run(events), key(code, down), tap(code), click(button), demo(name),
// sheet(name, { frames, cols, every }) frame sheet drawn into an overlay (screenshot it), status().
// Script events are in GAME seconds: { t, down|up|tap: 'KeyW', click: 0|1|2, camYaw, dur, fn }.
//   node scripts/shot.mjs --w 1120 --h 630 --timeout 900000 --q "scene=playground&only=atmosphere,sky,terrain,water,rocks,characters,gameplay,ui,postfx&hour=16.5&hud=0" \
//     --eval "await __pg.sheet('combo', { frames: 12, every: 0.25 })" --out shots/gameplay/combo.png
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';

const Q = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = [
  'atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'vegetation', 'locations',
  'characters', 'ui', 'audio', 'gameplay', 'postfx',
];

const START = { x: -10, z: 70, yaw: Math.PI };

function makeDummy(G, x, z) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b4a38, roughness: 0.95 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), wood);
  post.position.y = 0.95;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), wood);
  bar.rotation.z = Math.PI / 2; bar.position.y = 1.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.75, 10), straw);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), straw);
  head.position.y = 1.78;
  g.add(post, bar, body, head);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, G.world.heightAt(x, z), z);
  G.scene.add(g);
  return {
    root: g, position: g.position, radius: 0.5, height: 1.9, health: 1e6, maxHealth: 1e6, alive: true, faction: 'dummy',
    wobble: 0, hits: 0,
    takeHit(hit) { this.wobble = 1; this.hits++; void hit; },
  };
}

// A 240 m patch of snow and ice built from G.world, 3 m cells: cheap to render in software.
function liteGround(G, [cx, cz]) {
  const N = 80, S = 240, step = S / N;
  const pos = new Float32Array((N + 1) * (N + 1) * 3), col = new Float32Array((N + 1) * (N + 1) * 3);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = cx - S / 2 + i * step, z = cz - S / 2 + j * step;
      const o = (j * (N + 1) + i) * 3;
      pos[o] = x; pos[o + 1] = G.world.heightAt(x, z); pos[o + 2] = z;
      const lake = G.world.lakeSDF(x, z) < 0;
      const k = 0.92 + 0.05 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
      col[o] = lake ? 0.62 : k; col[o + 1] = lake ? 0.76 : k + 0.01; col[o + 2] = lake ? 0.9 : k + 0.03;
    }
  }
  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  m.receiveShadow = true;
  m.name = 'lite_ground';
  G.scene.add(m);
}

export async function init(G) {
  const P = G.player;
  const pg = { t0: 0, queue: [], yawTween: null, hits: 0, dummies: [] };
  window.__pg = pg;
  if (!P || !G.cameraRig) throw new Error('playground needs the gameplay module (player and camera rig)');

  // Time and weather defaults for a golden-hour look unless the URL says otherwise.
  if (!Q.has('hour')) G.time.setHours(16.4);
  G.time.setHours(G.time.hours);
  G.input.context = 'game';
  if (!Q.has('cam')) G.cameraOwner = 'rig';
  if (Q.get('hud') === '0') G.ui?.hud?.hide?.();

  // Without the terrain module (fast sheets) draw a coarse stand-in ground from the height grid.
  if (!G.terrain) liteGround(G, Q.get('start') ? Q.get('start').split(',').map(Number) : [START.x, START.z]);

  // Fires (warmth test): a campfire ring on the shore road.
  G.world.fires = G.world.fires || [];
  if (Q.has('fire')) G.world.fires.push({ x: START.x + 8, z: START.z - 2, r: 7 });

  // Spawn.
  const [sx, sz, sy] = (Q.get('start') || '').split(',').map(Number);
  const spawn = Number.isFinite(sx) && Number.isFinite(sz) ? { x: sx, z: sz, yaw: Number.isFinite(sy) ? sy : START.yaw } : START;
  P.teleport(spawn.x, spawn.z, spawn.yaw);
  P.walkToggle = false;
  if (Q.has('warmth')) P.warmth = parseFloat(Q.get('warmth'));
  if (Q.has('hp')) P.health = parseFloat(Q.get('hp'));
  if (Q.has('signs')) P.signEnergy = parseFloat(Q.get('signs'));
  if (G.state) G.state.data.inventory.thaw = 3;

  // Kasza waits a few steps away, broadside.
  const H = G.horse;
  const place = (px, pz, yaw) => {
    P.teleport(px, pz, yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    H?.teleport(px + rx * 2.4 + fx * 0.2, pz + rz * 2.4 + fz * 0.2, yaw);
  };
  place(spawn.x, spawn.z, spawn.yaw);
  G.cameraRig.snapBehind(spawn.yaw + parseFloat(Q.get('camyaw') || '0'));
  if (Q.has('zoom')) G.cameraRig.zoom = parseFloat(Q.get('zoom'));

  // A straw dummy and a minimal enemy list so lock-on, lunges and the swing contract can be tried
  // without the combat module. A real G.combat (when it exists) is left alone.
  const ownCombat = !G.combat;
  if (ownCombat) G.combat = { enemies: [], inCombat: false, register(e) { this.enemies.push(e); } };
  const addDummy = (dist, side = 0) => {
    const yaw = P.yaw;
    const x = P.position.x + Math.sin(yaw) * dist - Math.cos(yaw) * side;
    const z = P.position.z + Math.cos(yaw) * dist + Math.sin(yaw) * side;
    const d = makeDummy(G, x, z);
    G.combat.register?.(d);
    pg.dummies.push(d);
    return d;
  };
  pg.addDummy = addDummy;
  if (Q.has('dummy')) addDummy(3.4);

  G.events.on('player:swing', (s) => {
    for (const d of pg.dummies) {
      const dx = d.position.x - s.origin.x, dz = d.position.z - s.origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > s.reach + d.radius) continue;
      const cos = (dx * s.dir.x + dz * s.dir.z) / (dist || 1);
      if (Math.acos(Math.min(1, Math.max(-1, cos))) > s.arc / 2) continue;
      d.takeHit(s);
      pg.hits++;
      G.audio?.sfx?.('hit_straw', { pos: d.position });
      G.cameraRig.shake(s.kind === 'heavy' ? 0.35 : 0.18, 0.2);
    }
  });
  G.addSystem('pg-dummies', (dt) => {
    for (const d of pg.dummies) {
      d.wobble = Math.max(0, d.wobble - dt * 2.2);
      d.root.rotation.z = Math.sin(G.clock.elapsed * 22) * 0.12 * d.wobble * d.wobble;
    }
  }, ORDER.logic + 8);

  // &wall=1: a log wall just behind the player to try the camera pull-in.
  if (Q.has('wall')) {
    const yaw = spawn.yaw;
    const wx = spawn.x - Math.sin(yaw) * 2.6, wz = spawn.z - Math.cos(yaw) * 2.6;
    const wy = G.world.heightAt(wx, wz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.95 }));
    wall.position.set(wx, wy + 1.3, wz);
    wall.rotation.y = yaw;
    wall.castShadow = wall.receiveShadow = true;
    G.scene.add(wall);
    G.physics.addBox(wx, wz, 4, 0.25, yaw, { y0: wy - 1, y1: wy + 3, tag: 'playground_wall' });
  }

  // ---- scripted input -----------------------------------------------------------------------------
  const fireKey = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const fireMouse = (button, down) => {
    const ev = new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true });
    (down ? G.renderer.domElement : window).dispatchEvent(ev);
  };
  pg.key = fireKey;
  pg.mouse = fireMouse;
  pg.tap = (code, hold = 0.06) => { fireKey(code, true); pg.queue.push({ t: G.clock.elapsed - pg.t0 + hold, up: code }); pg.queue.sort((a, b) => a.t - b.t); };
  pg.click = (button = 0, hold = 0.06) => { fireMouse(button, true); pg.queue.push({ t: G.clock.elapsed - pg.t0 + hold, mouseUp: button }); pg.queue.sort((a, b) => a.t - b.t); };

  function apply(e) {
    if (e.down) fireKey(e.down, true);
    if (e.up) fireKey(e.up, false);
    if (e.tap) pg.tap(e.tap, e.hold ?? 0.06);
    if (e.click != null) pg.click(e.click, e.hold ?? 0.06);
    if (e.mouseUp != null) fireMouse(e.mouseUp, false);
    if (e.camYaw != null) {
      pg.yawTween = { from: G.cameraRig.yaw, to: e.camYaw, t: 0, dur: e.dur || 0.01 };
    }
    if (e.fn) e.fn();
  }
  // Runs before Input.poll (order -100) so injected events land in the same frame.
  G.addSystem('pg-script', (dt) => {
    const now = G.clock.elapsed - pg.t0;
    while (pg.queue.length && pg.queue[0].t <= now) apply(pg.queue.shift());
    const tw = pg.yawTween;
    if (tw) {
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur);
      let d = tw.to - tw.from;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      G.cameraRig.yaw = tw.from + d * (u * u * (3 - 2 * u));
      if (u >= 1) pg.yawTween = null;
    }
  }, -101);
  pg.run = (events) => {
    pg.t0 = G.clock.elapsed;
    pg.queue = events.map((e) => ({ ...e })).sort((a, b) => a.t - b.t);
  };
  pg.release = () => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) fireKey(k, false);
  };

  // ---- demos --------------------------------------------------------------------------------------
  const DEMOS = {
    run: { camOff: 0.9, script: [
      { t: 0.2, down: 'KeyW' }, { t: 1.4, camYaw: 'R+1.4', dur: 1.3 }, { t: 3.4, camYaw: 'R-0.4', dur: 1.2 }, { t: 4.8, up: 'KeyW' },
    ] },
    turn: { camOff: 0.9, script: [
      { t: 0.2, down: 'KeyW' }, { t: 1.6, up: 'KeyW' }, { t: 1.6, down: 'KeyS' }, { t: 3.2, up: 'KeyS' },
    ] },
    sprint: { camOff: 0.7, script: [
      { t: 0.2, down: 'KeyW' }, { t: 0.6, down: 'ShiftLeft' }, { t: 3.8, up: 'ShiftLeft' }, { t: 4.4, up: 'KeyW' },
    ] },
    dodge: { camOff: 1.0, script: [
      { t: 0.2, down: 'KeyA' }, { t: 0.3, tap: 'Space' }, { t: 0.9, up: 'KeyA' },
      { t: 1.8, tap: 'Space' },
      { t: 3.0, down: 'KeyD' }, { t: 3.1, tap: 'Space' }, { t: 3.25, tap: 'Space' }, { t: 3.8, up: 'KeyD' },
    ] },
    combo: { dummy: 3.0, camOff: 1.15, script: [
      { t: 0.1, tap: 'KeyR' }, { t: 1.3, click: 0 }, { t: 1.55, click: 0 }, { t: 2.2, click: 0 }, { t: 2.45, click: 0 },
    ] },
    heavy: { dummy: 3.0, camOff: 1.15, script: [
      { t: 0.1, tap: 'KeyR' }, { t: 1.3, click: 2 },
    ] },
    sign: { camOff: 1.0, script: [
      { t: 0.2, tap: 'Digit2' }, { t: 0.4, tap: 'KeyQ' }, { t: 2.0, tap: 'Digit3' }, { t: 2.1, tap: 'KeyQ' },
    ] },
    block: { dummy: 3.0, camOff: 1.0, script: [
      { t: 0.1, tap: 'KeyR' }, { t: 1.3, tap: 'KeyF' }, { t: 2.2, down: 'KeyF' }, { t: 3.4, up: 'KeyF' },
    ] },
    ice: { start: [-10, 54, Math.PI], camOff: 0.8, script: [
      { t: 0.2, down: 'KeyW' }, { t: 0.6, down: 'ShiftLeft' }, { t: 3.2, up: 'KeyW' }, { t: 3.2, up: 'ShiftLeft' },
    ] },
    call: { camOff: 0, horseAt: 'far', horse: true, script: [{ t: 0.5, tap: 'KeyX' }] },
    mount: { camOff: 0.3, horse: true, script: [{ t: 0.3, tap: 'KeyX' }] },
    gallop: { camOff: 0, horse: true, script: [
      { t: 0.3, tap: 'KeyX' }, { t: 3.4, down: 'KeyW' }, { t: 4.2, down: 'ShiftLeft' }, { t: 9.0, up: 'ShiftLeft' }, { t: 9.5, up: 'KeyW' },
    ] },
  };
  pg.demo = (name) => {
    const d = DEMOS[name];
    if (!d) throw new Error(`unknown demo ${name}`);
    pg.release();
    for (const x of pg.dummies) { G.combat.enemies = G.combat.enemies.filter((e) => e !== x); x.root.parent?.remove(x.root); }
    pg.dummies.length = 0;
    const st = d.start || [spawn.x, spawn.z, spawn.yaw];
    place(st[0], st[1], st[2]);
    P.stamina = P.maxStamina; P.health = P.maxHealth; P.signEnergy = 1;
    P.character._setSword?.(false);
    if (d.horseAt === 'far') H?.teleport(st[0] - Math.sin(st[2]) * 62 + 12, st[1] - Math.cos(st[2]) * 62, st[2]);
    else if (!d.horse) H?.teleport(st[0] + Math.cos(st[2]) * 22, st[1] - Math.sin(st[2]) * 22, st[2]); // out of the way
    G.cameraRig.snapBehind(st[2] + (Q.has('camyaw') ? parseFloat(Q.get('camyaw')) : d.camOff || 0));
    if (d.dummy) addDummy(d.dummy);
    const base = G.cameraRig.yaw;
    const script = d.script.map((e) => {
      if (typeof e.camYaw === 'string') {
        const m = /^R([+-][\d.]+)$/.exec(e.camYaw);
        return { ...e, camYaw: base + parseFloat(m[1]) };
      }
      return e;
    });
    pg.run(script);
    return script.length;
  };

  // Contact sheet: one tile every `every` game seconds, composed into a full-window overlay.
  pg.sheet = async (name, { frames = 12, cols = 4, every = 0.25, label = true } = {}) => {
    if (name) pg.demo(name);
    const src = G.renderer.domElement;
    const tiles = [];
    const TW = Math.floor(window.innerWidth / cols), TH = Math.floor(TW * (src.height / src.width));
    const t0 = G.clock.elapsed;
    const off = G.addSystem('pg-sheet', () => {
      const t = G.clock.elapsed - t0;
      if (tiles.length >= frames || t < tiles.length * every) return;
      const c = document.createElement('canvas');
      c.width = TW; c.height = TH;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0, TW, TH);
      if (label) {
        g.fillStyle = '#ffe2a8';
        g.font = `${Math.max(11, Math.round(TW / 30))}px monospace`;
        const a = P.moves.act;
        g.fillText(`${tiles.length} ${t.toFixed(2)}s ${P.state}${a ? ' ' + (a.id || a.kind) : ''} v=${P.loco.speed.toFixed(1)}`, 6, 16);
      }
      tiles.push(c);
    }, ORDER.late + 50);
    while (tiles.length < frames) await new Promise((r) => setTimeout(r, 150));
    off();
    pg.release();
    const out = document.createElement('canvas');
    const rows = Math.ceil(frames / cols);
    out.width = cols * TW; out.height = rows * TH;
    const g = out.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, out.width, out.height);
    tiles.forEach((t, i) => g.drawImage(t, (i % cols) * TW, Math.floor(i / cols) * TH));
    const img = document.createElement('img');
    img.src = out.toDataURL('image/png');
    Object.assign(img.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: 9999, objectFit: 'contain', background: '#111' });
    document.body.appendChild(img);
    await new Promise((r) => { img.onload = r; setTimeout(r, 600); });
    return tiles.length;
  };

  pg.status = () => ({
    pos: P.position.toArray().map((v) => +v.toFixed(2)), yaw: +P.yaw.toFixed(2), state: P.state, speed: +P.loco.speed.toFixed(2),
    surface: P.surface, hp: +P.health.toFixed(1), stamina: +P.stamina.toFixed(1), warmth: +P.warmth.toFixed(2), sign: P.sign, signEnergy: +P.signEnergy.toFixed(2),
    act: P.moves.act?.id || P.moves.act?.kind || null, sword: P.swordDrawn, mounted: P.mounted, horse: H ? { state: H.state, speed: +H.speed.toFixed(2), gait: H.gait, pos: H.position.toArray().map((v) => +v.toFixed(1)) } : null,
    cam: { yaw: +G.cameraRig.yaw.toFixed(2), mode: G.cameraRig.mode }, hits: pg.hits,
  });

  if (Q.get('mounted') === '1' && H) H.mount({ instant: true });
  if (Q.has('demo')) G.events.once('game:ready', () => pg.demo(Q.get('demo')));
}
