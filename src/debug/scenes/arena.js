// Combat arena: Vesna on the ice near the ritual site (10, -30) at night, one fight at a time.
//
//   ?scene=arena&enemy=wolves|effigies|bear|boss        which fight (default wolves)
//   &n=4  &alpha=1                                       wolf count, scarred alpha
//   &phase=2                                             boss starts in this phase (1 to 3)       &emerge=1  boss rises from the ice
//   &lite=1                                              flat stand-in ground, no terrain or water (fast, logic only)
//   &hp=100 &god=1 &signs=1 &drawn=0                     vitals; god = 9999 health; unlimited sign energy; sword out or not
//   &mounted=1                                           start in the saddle on Kasza (sword out unless drawn=0)
//   &ap=1  &sign=ember|gale|ward                         autopilot: Vesna locks on, closes in, strikes and dodges by herself (and casts the sign)
//   &hud=0  &hour=23.2  &weather=clear|snow|blizzard|fog &dist=9 (enemy distance)  &camyaw=0.5 &zoom=0.9
//   &rig=wolf|bear                                       rig gallery: gaits and poses in a row (no gameplay)
// Test hooks (window.__arena): spawn(kind, opts), clear(), advance(sec), tap(code), click(button), run(events), status(),
//   sheet({ frames, cols, every, label, setup }) deterministic frame sheet (simulated, not real time) drawn as an overlay.
// Script events are in GAME seconds: { t, down|up|tap: 'KeyW', click: 0|1|2, camYaw, fn }.
//
//   node scripts/shot.mjs --w 1120 --h 630 --timeout 900000 --q "scene=arena&enemy=wolves&god=1&ap=1" \
//     --eval "__arena.sheet({ frames: 12, every: 0.4 })" --out shots/combat/wolves.png
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';

const Q = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = Q.has('rig')
  ? ['atmosphere', 'sky', 'postfx', 'characters']
  : Q.has('lite')
    ? ['atmosphere', 'sky', 'weather', 'characters', 'ui', 'audio', 'gameplay', 'postfx']
    : ['atmosphere', 'sky', 'terrain', 'water', 'weather', 'characters', 'ui', 'audio', 'gameplay', 'postfx'];

// The fight's spot: the ice by the ritual site by default, &site=x,z moves it (the horse will not set a hoof on ice: ride on snow, e.g. -10,60)
const SITE = (() => { const s = (Q.get('site') || '').split(',').map(Number); return s.length === 2 && s.every(Number.isFinite) ? { x: s[0], z: s[1] - 8 } : { x: 10, z: -30 }; })();

function flatGround(G, y = 0) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xaec4d4, roughness: 0.55, metalness: 0 }),
  );
  m.position.y = y;
  m.receiveShadow = true;
  m.name = 'arena_ground';
  G.scene.add(m);
  return m;
}

// ---- rig gallery ---------------------------------------------------------------------------------------
async function rigGallery(G, kind) {
  G.time.setHours(parseFloat(Q.get('hour') || '22.5'));
  flatGround(G);
  const { Quadruped, SPECS } = await import('../../gameplay/creatures/quadruped.js');
  const items = [];
  const spec = SPECS[kind];
  const speeds = [0, 1.2, 3.2, 7.5];
  const dx = kind === 'bear' ? 3.4 : 2.2;
  speeds.forEach((v, i) => {
    const q = new Quadruped(spec, { seed: i, scar: i === 3 });
    q.root.position.set((i - 1.5) * dx, 0, 0);
    q.root.rotation.y = Q.has('side') ? Math.PI / 2 : 0.5;
    if (i === 1) q.pose.lookYaw = 0.5;
    if (i === 3) { q.pose.hackles = 1; q.pose.jaw = 0.6; q.pose.ears = 0.9; q.pose.tail = 0.0; }
    if (i === 0) { q.pose.hackles = 0.6; q.pose.jaw = 0.4; q.pose.ears = 0.7; q.pose.crouch = 0.4; q.pose.neck = 0.05; q.pose.headRel = -0.1; }
    G.scene.add(q.root);
    items.push({ q, v });
  });
  G.addSystem('rig-gallery', (dt) => {
    for (const it of items) it.q.update(Q.has('still') ? 0.0001 : dt, it.v, 0);
  }, ORDER.logic);
  if (!Q.has('cam')) {
    G.cameraOwner = 'shot';
    G.camera.position.set(0, 1.5, 7.5);
    G.camera.lookAt(0, 0.6, 0);
  }
  window.__rig = { items };
}

// ---- the fight ---------------------------------------------------------------------------------------------
async function fight(G) {
  const P = G.player;
  if (!P || !G.cameraRig || !G.combat || !G.creatures) throw new Error('arena needs the gameplay module (player, camera rig, combat, creatures)');
  const kind = Q.get('enemy') || 'wolves';
  const A = { t0: 0, queue: [], yawTween: null, ap: Q.has('ap'), apState: {} };
  window.__arena = A;

  // Night on the ice by default.
  if (!Q.has('hour')) G.time.setHours(23.2);
  G.time.setHours(G.time.hours);
  if (!Q.has('weather') && G.weather?.set) G.weather.set(kind === 'boss' ? 'snow' : 'clear', 0);
  G.input.context = 'game';
  if (!Q.has('cam')) G.cameraOwner = 'rig';
  if (Q.get('hud') === '0') G.ui?.hud?.hide?.();
  if (!G.terrain) flatGround(G, G.world.heightAt(SITE.x, SITE.z + 8));
  if (G.state) G.state.data.inventory.thaw = 3;
  const mounted = Q.has('mounted') && !!G.horse;
  if (G.horse?.teleport) G.horse.teleport(SITE.x + 40, SITE.z + 60, 0);
  if (G.horse?.root) G.horse.root.visible = mounted;

  // Vesna on the ice, facing north (-Z), sword out.
  const dist = parseFloat(Q.get('dist') || (kind === 'bear' ? '12' : kind === 'boss' ? '10' : kind === 'effigies' ? '9' : '10'));
  const px = SITE.x, pz = SITE.z + 8;
  P.teleport(px, pz, Math.PI);
  P.walkToggle = false;
  if (Q.has('hp')) P.health = parseFloat(Q.get('hp'));
  if (Q.has('god')) { P.maxHealth = 9999; P.health = 9999; }
  P.stamina = P.maxStamina;
  P.warmth = 1;
  if (mounted) {
    // In the saddle at the same spot, facing the enemy (the horse is the body the wolves circle).
    G.horse.teleport(px, pz, Math.PI);
    G.horse.mount({ instant: true });
  }
  if (Q.get('drawn') !== '0') { P.character._setSword?.(true); P.moves.lastDraw = P.moves.t + 1000; }
  if (Q.has('signs')) P.signEnergy = 1;
  G.cameraRig.snapBehind(Math.PI + parseFloat(Q.get('camyaw') || '0'));
  if (Q.has('zoom')) G.cameraRig.zoom = parseFloat(Q.get('zoom'));
  G.addSystem('arena-vitals', () => { if (Q.has('signs') && P.signEnergy < 1) P.signEnergy = 1; }, ORDER.logic + 2);

  // ---- spawning -----------------------------------------------------------------------------------------------
  const ex = SITE.x, ez = pz - dist;
  A.enemies = [];
  A.spawn = (what, o = {}) => {
    const C = G.creatures;
    let r = null;
    if (what === 'wolves') r = C.spawnWolves(o.x ?? ex, o.z ?? ez, o.n ?? parseInt(Q.get('n') || '3', 10), { alpha: o.alpha ?? Q.has('alpha'), engaged: o.engaged ?? true, yaw: 0, ...o });
    else if (what === 'effigies') {
      r = [];
      const n = o.n ?? parseInt(Q.get('n') || '3', 10);
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i - (n - 1) / 2) * 0.9;
        r.push(C.spawnEffigy(px + Math.sin(a) * dist, pz + Math.cos(a) * dist, { dormant: o.dormant ?? false, yaw: a + Math.PI }));
      }
    } else if (what === 'bear') r = C.spawnBear(o.x ?? ex, o.z ?? ez, { sleeping: o.sleeping ?? Q.get('sleeping') !== '0', yaw: 0 });
    else if (what === 'boss') {
      r = C.spawnBoss(o.x ?? ex, o.z ?? ez, { yaw: 0, emerge: o.emerge ?? Q.has('emerge'), passive: o.passive ?? Q.has('passive'), phase: o.phase ?? parseInt(Q.get('phase') || '1', 10) });
    }
    A.enemies.push(r);
    return r;
  };
  A.clear = () => { G.creatures.clear(); A.enemies.length = 0; };
  A.spawn(kind);
  const first = Array.isArray(A.enemies[0]) ? A.enemies[0][0] : A.enemies[0];
  void first;

  // ---- scripted input (fires before Input.poll so events land in the same frame) -------------------------------
  const fireKey = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const fireMouse = (button, down) => {
    const ev = new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true });
    (down ? G.renderer.domElement : window).dispatchEvent(ev);
  };
  A.key = fireKey;
  A.mouse = fireMouse;
  const now = () => G.clock.elapsed - A.t0;
  A.tap = (code, hold = 0.06) => { fireKey(code, true); A.queue.push({ t: now() + hold, up: code }); A.queue.sort((a, b) => a.t - b.t); };
  A.click = (button = 0, hold = 0.06) => { fireMouse(button, true); A.queue.push({ t: now() + hold, mouseUp: button }); A.queue.sort((a, b) => a.t - b.t); };
  function apply(e) {
    if (e.down) fireKey(e.down, true);
    if (e.up) fireKey(e.up, false);
    if (e.tap) A.tap(e.tap, e.hold ?? 0.06);
    if (e.click != null) A.click(e.click, e.hold ?? 0.06);
    if (e.mouseUp != null) fireMouse(e.mouseUp, false);
    if (e.camYaw != null) A.yawTween = { from: G.cameraRig.yaw, to: e.camYaw, t: 0, dur: e.dur || 0.01 };
    if (e.fn) e.fn();
  }
  G.addSystem('arena-script', (dt) => {
    const t = now();
    while (A.queue.length && A.queue[0].t <= t) apply(A.queue.shift());
    const tw = A.yawTween;
    if (tw) {
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur);
      let d = tw.to - tw.from;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      G.cameraRig.yaw = tw.from + d * (u * u * (3 - 2 * u));
      if (u >= 1) A.yawTween = null;
    }
    if (A.ap) autopilot(dt);
  }, -101);
  A.run = (events) => {
    A.t0 = G.clock.elapsed;
    A.queue = events.map((e) => ({ ...e })).sort((a, b) => a.t - b.t);
  };
  A.release = () => { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) fireKey(k, false); };

  // ---- autopilot: a plausible fighter, good enough to fill a frame sheet ------------------------------------------
  const ATTACKING = new Set(['telegraph', 'lunge', 'windup', 'slam', 'grab_wind', 'grab', 'rear', 'maul', 'claw', 'spike', 'gust', 'scream']);
  function autopilot(dt) {
    const S = A.apState;
    S.cd = (S.cd || 0) - dt;
    S.dodge = (S.dodge || 0) - dt;
    S.sign = (S.sign || 0) - dt;
    const list = G.combat.liveEnemies();
    if (!list.length || P.dead) { if (S.w) { fireKey('KeyW', false); S.w = false; } return; }
    list.sort((a, b) => Math.hypot(a.position.x - P.position.x, a.position.z - P.position.z) - Math.hypot(b.position.x - P.position.x, b.position.z - P.position.z));
    const e = list[0];
    const d = Math.hypot(e.position.x - P.position.x, e.position.z - P.position.z);
    if (!P.target) { if (!S.lockCd || S.lockCd < 0) { A.tap('KeyT'); S.lockCd = 0.6; } }
    S.lockCd = (S.lockCd || 0) - dt;
    // Dodge incoming attacks.
    const threat = list.find((o) => ATTACKING.has(o.state) && Math.hypot(o.position.x - P.position.x, o.position.z - P.position.z) < (o.isBoss ? 7 : 4.6));
    if (threat && S.dodge <= 0 && Math.random() < 0.65 && (threat.stateT || 0) > 0.25) {
      S.dodge = 1.1;
      fireKey(Math.random() < 0.5 ? 'KeyA' : 'KeyD', true);
      A.tap('Space');
      A.queue.push({ t: now() + 0.16, up: 'KeyA' }, { t: now() + 0.16, up: 'KeyD' });
      A.queue.sort((a, b) => a.t - b.t);
      return;
    }
    const reach = e.isBoss ? 4.4 : 2.1;
    const want = d > reach;
    if (want !== !!S.w) { fireKey('KeyW', want); S.w = want; }
    if (!want && S.cd <= 0) { A.click(Math.random() < 0.2 ? 2 : 0); S.cd = 0.45; }
    if (Q.get('sign') && S.sign <= 0 && d < 8) {
      S.sign = 3.5;
      A.tap(Q.get('sign') === 'gale' ? 'Digit2' : Q.get('sign') === 'ward' ? 'Digit3' : 'Digit1');
      A.queue.push({ t: now() + 0.12, tap: 'KeyQ' });
      A.queue.sort((a, b) => a.t - b.t);
    }
  }

  // ---- deterministic stepping ---------------------------------------------------------------------------------------
  // Runs every registered system with a fixed step (no rendering), so sheets do not depend on the slow software GL.
  A.advance = (sec, step = 1 / 30) => {
    let left = sec;
    while (left > 1e-6) {
      const dt = Math.min(step, left);
      left -= dt;
      G.clock.delta = dt;
      G.clock.elapsed += dt;
      G.clock.frame++;
      G.uniforms.uTime.value = G.clock.elapsed;
      for (const s of G.systems.slice()) {
        try { s.update(dt, G.clock.elapsed); } catch (err) { if (!s._errored) { console.error(`[system ${s.name}]`, err); s._errored = true; G.errors.push(`system ${s.name}: ${err.message}`); } }
      }
      // A real frame renders here, which refreshes the camera's matrices; the characters pick their detail level
      // (and whether they animate every frame) from them.
      G.camera.updateMatrixWorld();
    }
  };
  A.render = (dt = 0.016) => { if (G.postfx?.render) G.postfx.render(dt); else G.renderer.render(G.scene, G.camera); };

  // Contact sheet: one tile every `every` simulated seconds. `setup` runs once before the first tile;
  // `events` is a script (game seconds from the start).
  A.sheet = ({ frames = 12, cols = 4, every = 0.35, label = true, events = null, setup = null, warm = 0, tw = 0, cam = null } = {}) => {
    if (setup) setup();
    if (events) A.run(events);
    if (warm) A.advance(warm);
    const src = G.renderer.domElement;
    const TW = tw || Math.floor(window.innerWidth / cols), TH = Math.floor(TW * (src.height / src.width));
    const tiles = [];
    for (let i = 0; i < frames; i++) {
      if (i > 0) A.advance(every);
      if (cam) {
        const c = cam(i);
        if (c) {
          G.cameraOwner = 'shot';
          G.camera.position.set(...c.pos);
          G.camera.lookAt(...c.look);
          if (c.fov) { G.camera.fov = c.fov; G.camera.updateProjectionMatrix(); }
        }
      }
      // Screen flashes decay with the render dt, so give them real time between tiles (a long first dt for a still).
      if (i === 0) A.render(0.5);
      A.render(Math.max(every, 0.2));
      const c = document.createElement('canvas');
      c.width = TW; c.height = TH;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0, TW, TH);
      if (label) {
        g.fillStyle = '#ffe2a8';
        g.font = `${Math.max(11, Math.round(TW / 34))}px monospace`;
        const st = status();
        g.fillText(`${i} ${(i * every).toFixed(2)}s ${st.line}`, 6, 16);
      }
      tiles.push(c);
    }
    A.release();
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
    return tiles.length;
  };
  A.clearOverlay = () => { for (const i of document.querySelectorAll('img[style*="9999"]')) i.remove(); };

  function status() {
    const en = G.combat.liveEnemies();
    const b = G.creatures.boss;
    const parts = [`hp${Math.round(P.health)}`, P.moves.act ? (P.moves.act.id || P.moves.act.kind) : '-'];
    if (b) parts.push(`boss ${b.state} ph${b.phase} ${Math.round(b.health / b.maxHealth * 100)}%${b.armored ? ' A' : ''}`);
    else if (en[0]) parts.push(`${en.length}x ${en[0].state || ''}`);
    return { line: parts.join(' '), hp: P.health, enemies: en.length };
  }
  A.status = () => ({
    ...status(), combat: G.combat.inCombat, pos: P.position.toArray().map((v) => +v.toFixed(1)),
    enemies: G.combat.enemies.map((e) => ({ kind: e.kind, state: e.state, hp: +(e.health ?? 0).toFixed(1), alive: e.alive, p: [+e.position.x.toFixed(1), +e.position.z.toFixed(1)] })),
  });

  // Hide the player's HUD notifications in sheets unless asked.
  if (Q.get('hud') === '0') G.ui?.hud?.hide?.();
}

export async function init(G) {
  const kind = Q.get('rig');
  if (kind) return rigGallery(G, kind);
  return fight(G);
}
