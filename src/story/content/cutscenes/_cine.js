// Shared helpers for the cutscene scripts (no default export, so it is never played itself).
// Staging math, anchors with fallbacks, riding Kasza, torches and a little crowd work.
//   kit(d)                       cleanup bag: K.add(fn); K.run() in a finally block
//   off(x, z, yaw, right, fwd)   world [x, z] from a position and facing (right-hand positive)
//   ground(G, x, z, h)           Vector3 on the terrain
//   spawn(d, id, preset, x, z, yaw, o)      actor with a frame break after (characters are slow to build)
//   seat(d, rider, horse) / unseat(d, rider, horse, { instant }) / moveAlong(d, mover, pts, o)
//   torchFor(d, K, actor) / carry(actor, clip) / jolt(d, amount, secs) / lookDir(...)
import * as THREE from 'three';
import { props } from '../../../world/props/index.js';
import { LOC } from '../../../world/layout.js';
import { presetSpec } from '../../../characters/presets.js';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const lerp = (a, b, t) => a + (b - a) * t;
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

export function kit(d) {
  const bag = [];
  return {
    add(fn) { bag.push(fn); return fn; },
    run() { for (const f of bag.splice(0).reverse()) { try { f(); } catch (e) { console.warn('[cine cleanup]', e); } } },
    d,
  };
}

// World offset from (x, z) for something facing `yaw`: right is the facing person's right hand.
export function off(x, z, yaw, right = 0, fwd = 0) {
  return [x + right * -Math.cos(yaw) + fwd * Math.sin(yaw), z + right * Math.sin(yaw) + fwd * Math.cos(yaw)];
}

export function ground(G, x, z, h = 0) {
  return V3(x, (G.world?.heightAt?.(x, z) ?? 0) + h, z);
}

export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Anchors published by the location builders, else a fallback built from layout.js.
export function anchors(G, id) { return G.world?.locations?.[id] || null; }

// ---- the pass (C1) ------------------------------------------------------------------------------------
export function passSite(G) {
  const A = anchors(G, 'passStart');
  const L = LOC.passStart;
  const F = { x: 0.72, z: -0.69 };
  const yawF = Math.atan2(F.x, F.z);
  const g = (x, z) => G.world.heightAt(x, z);
  const cart = { x: L.x + F.x * 0.3, z: L.z + F.z * 0.3, yaw: 0.55 };
  const xl = { x: Math.cos(cart.yaw), z: -Math.sin(cart.yaw) };
  const a = { x: Math.sin(cart.yaw), z: Math.cos(cart.yaw) };
  const at = (dx, dz) => ({ x: cart.x + xl.x * dx + a.x * dz, z: cart.z + xl.z * dx + a.z * dz });
  const fa = at(2.7, 1.5), mo = at(2.1, -0.5);
  const gy = g(L.x, L.z);
  const S = {
    F, yawF, gy,
    center: V3(L.x, gy, L.z),
    along: (s) => ({ x: L.x + F.x * s, z: L.z + F.z * s }), // s meters along the road from the cart (negative: before it)
    cart: V3(cart.x, gy + 0.8, cart.z),
    father: V3(fa.x, gy, fa.z),
    mother: V3(mo.x, gy, mo.z),
    fatherHead: V3(fa.x, gy + 1.05, fa.z),
    faceCam: V3(fa.x + F.x * 1.6 + 0.5, gy + 1.15, fa.z + F.z * 1.6 + 0.3),
    lowCam: V3(mo.x + xl.x * 0.6 + a.x * 1.2, gy + 0.25, mo.z + xl.z * 0.6 + a.z * 1.2),
    vesna: V3(fa.x - a.x * 1.1 + xl.x * 0.9, gy, fa.z - a.z * 1.1 + xl.z * 0.9),
    stop: -11,
  };
  if (A?.father) {
    S.father = V3(A.father.x, A.father.y, A.father.z);
    S.fatherHead = S.father.clone().setY(S.father.y + 1.05);
    if (A.father.headLook) S.F = A.father.headLook;
  }
  if (A?.cart) S.cart = V3(A.cart.x, A.cart.y + 0.2, A.cart.z);
  if (A?.mother) S.mother = V3(A.mother.x, A.mother.y, A.mother.z);
  if (A?.marks) {
    S.faceCam = A.marks.cameraFace.clone();
    S.lowCam = A.marks.cameraLow.clone();
    S.vesna = A.marks.vesna.clone();
  }
  return S;
}

// ---- riding ---------------------------------------------------------------------------------------------
// Seat the rider on the horse's saddle anchor (as the gameplay Horse does) and start the ride clip.
export function seat(d, rider, horse, clip = 'ride_idle') {
  const rc = rider.c, hc = horse.c;
  if (!hc.saddle) return;
  hc.saddle.add(rc.root);
  rc.root.position.set(0, 0, 0);
  rc.root.rotation.set(0, 0, 0);
  rc.autoGround = false;
  rider.seated = true;
  rider.play(clip, { loop: true, fade: 0.1 });
}

export function mountSpot(horse) {
  const y = horse.yaw, p = horse.c.root.position;
  return [p.x + Math.cos(y) * 0.55 - Math.sin(y) * 0.04, p.z - Math.sin(y) * 0.55 - Math.cos(y) * 0.04];
}

// Put the rider back on the ground at the horse's left side. Plays the dismount clip unless instant.
export async function unseat(d, rider, horse, { instant = false } = {}) {
  const G = d.G, rc = rider.c;
  if (!rider.seated && rc.root.parent === G.scene) return;
  const [x, z] = mountSpot(horse);
  G.scene.add(rc.root);
  rc.autoGround = true;
  rc.root.rotation.set(0, horse.yaw, 0);
  rider.setPosition(x, z, horse.yaw);
  rider.seated = false;
  if (instant) { rc.stop?.(0); return; }
  await d.anim(rider, 'dismount', { fade: 0 });
  rc.stop?.(0.2);
}

// Move an actor along a polyline [[x, z], ...] at `speed` m/s, facing the way it goes. Works for
// horses (setGait) and for characters (locomotion). brake: fraction of the time spent slowing to a halt.
export function moveAlong(d, mover, pts, { speed = 1.7, brake = 0.25, gait = true, turn = 4 } = {}) {
  const G = d.G;
  const segs = [];
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push({ a: pts[i], b: pts[i + 1], l, s: len });
    len += l;
  }
  const dur = len / (Math.max(0.1, speed) * (1 - brake * 0.5));
  const c = mover.c;
  const at = (dist, out) => {
    let sg = segs[segs.length - 1];
    for (const s of segs) if (dist <= s.s + s.l) { sg = s; break; }
    const u = sg.l > 0 ? Math.min(1, Math.max(0, (dist - sg.s) / sg.l)) : 1;
    out.x = sg.a[0] + (sg.b[0] - sg.a[0]) * u;
    out.z = sg.a[1] + (sg.b[1] - sg.a[1]) * u;
    out.yaw = Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
    return out;
  };
  const tmp = { x: 0, z: 0, yaw: 0 }, ahead = { x: 0, z: 0, yaw: 0 };
  let braking = false;
  if (gait && c.setGait) c.setGait(speed);
  else c.setLocomotion?.(speed);
  const b0 = 1 - brake;
  const p = G.story.sched.tween({
    dur, ease: 'linear',
    step: (t) => {
      // Constant speed, then a smooth stop over the last `brake` of the time.
      let u;
      if (t <= b0) u = t / (b0 + brake * 0.5);
      else { const w = (t - b0) / brake; u = (b0 + brake * (w - w * w * 0.5)) / (b0 + brake * 0.5); }
      u = Math.min(1, u);
      at(len * u, tmp);
      mover.setPosition(tmp.x, tmp.z);
      at(Math.min(len, len * u + 1.5), ahead);
      const want = len * u >= len - 0.05 ? mover.yaw : ahead.yaw;
      mover.yaw = mover.yaw + wrap(want - mover.yaw) * Math.min(1, 0.12 * turn);
      if (!braking && t > b0 + brake * 0.35) { braking = true; if (gait && c.setGait) c.setGait(0); }
    },
  });
  return p.then(() => { if (gait && c.setGait) c.setGait(0); else c.setLocomotion?.(0); });
}

// ---- small props and acting -------------------------------------------------------------------------------
// Looping upper-body clip over locomotion (carry_torch, carry_pole, look_back).
export function carry(actor, clip, o = {}) {
  try { actor.c.playUpper?.(clip, { loop: true, fade: 0.25, ...o }); } catch (e) { console.warn('[cine] carry', e); }
}
export function uncarry(actor, fade = 0.3) { try { actor.c.stopUpper?.(fade); } catch { /* optional */ } }

// A lit torch in the actor's right hand, removed by K.run().
export function torchFor(K, actor, o = {}) {
  let g = null;
  try {
    g = props.torch({ variant: 'hand', lit: true, light: o.light ?? false, scale: o.scale ?? 1 });
    actor.c.attach('handR', g);
    g.rotation.set(0, 0, 0);
    g.position.set(0, 0, 0);
    K.add(() => disposeProp(g));
  } catch (e) { console.warn('[cine] torch', e); }
  return g;
}

export function disposeProp(g) {
  if (!g) return;
  g.traverse((o) => { o.userData?.emitter?.dispose?.(); });
  g.parent?.remove(g);
}

// A cut whose look (or position) follows a moving actor. CineCamera.cut() resolves function specs once, so a
// long hold is run as a shot that stays on the target until the next cut or shot replaces it.
export function hold(d, o) {
  if (typeof o.look !== 'function' && typeof o.pos !== 'function') { d.cut(o); return; }
  d.shot({ from: o.pos, look: o.look, fov: o.fov, frame: o.frame || [0, 0], roll: o.roll, shake: o.shake ?? 0, label: o.label, dur: 900, ease: 'linear' });
}

// Camera impact: handheld shake that settles.
export function jolt(d, amount = 1.2, secs = 1.2) {
  const cam = d.G.story.cam;
  cam.shake = Math.max(cam.shake || 0, amount);
  return d.G.story.sched.prop(cam, 'shake', 0, secs, 'out');
}

// Spawn many actors, yielding a frame between builds so the page keeps drawing.
export async function spawn(d, id, preset, x, z, yaw = 0, o = {}) {
  const a = d.actor(id, { preset, at: [x, z], yaw, spec: o.low ? { lowDetail: true } : undefined });
  if (o.pose) a.play(o.pose, { loop: true, fade: 0 });
  if (!d.skipping) await frame();
  return a;
}

export function setVisible(actor, on) { if (on) actor.show(); else actor.hide(); }

// Place, face and idle an actor in one go.
export function stand(d, actor, x, z, yaw, clip) {
  d.place(actor, x, z, yaw);
  if (clip) actor.play(clip, { loop: true, fade: 0 });
}

// Camera position helpers.
export function camAt(G, x, z, h) { return ground(G, x, z, h); }

// ---- the village at the rite (C6 to C7, the endings) -------------------------------------------------------
// Specs for the people in white: headscarf and shawl, the way the women of Marzena go to the water.
export function whiteWoman(id) {
  const s = presetSpec(id);
  if (!s) return id;
  s.hat = { type: 'kerchief', color: '#e7e1d3', open: 0.14 };
  s.outfit = { ...s.outfit, shawl: { color: '#d6d0c1', tile: 'wool' } };
  delete s.outfit.coat;
  return s;
}

// Ola in the white dress Hanka sewed: no coat, red embroidery at the hem and cuffs.
export function olaInWhite() {
  const s = presetSpec('ola');
  s.outfit = {
    ...s.outfit,
    dress: { color: '#ebe8df', tile: 'linen', length: 0.92, emb: 4, embH: 0.07, flare: 0.3 },
    shirt: { color: '#ebe8df', tile: 'linen', cuff: { tile: 'emb', emb: 4 } },
  };
  delete s.outfit.coat;
  delete s.outfit.collar;
  s.hat = null;
  s.hair = { ...s.hair, style: 'pigtails' };
  return s;
}

// A ribbon of red wool, tied between the wrists.
export function ribbonFor(K, actor) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: 0x9a2e22, roughness: 0.85 }));
  try { actor.c.attach('handR', g); g.position.set(0, 0.0, 0.03); g.rotation.set(0, 0, 0.3); } catch { return null; }
  K.add(() => g.parent?.remove(g));
  return g;
}

// The people of the rite, built low-detail. Returns { bogdan, hanka, ola, women[], men[], kids[], bearers[], all[] }.
export async function riteCast(d, K, { women = 8, men = 5, kids = 3 } = {}) {
  const mk = (id, preset, o) => spawn(d, id, preset, 0, 0, 0, { low: true, ...o });
  const out = { women: [], men: [], kids: [], bearers: [] };
  out.bogdan = await mk('bogdan', 'bogdan');
  out.hanka = await mk('hanka', 'hanka');
  // Ola in her rite dress is a spawned double; the village Ola is put away while the scene runs.
  out.ola = await mk('rite_ola', olaInWhite());
  out.ola.id = 'ola';
  const real = d.G.npcs?.get?.('ola');
  if (real?.character) {
    const wasVisible = real.character.root.visible;
    try { real.pause?.(true); real.character.setVisible?.(false); } catch { /* optional */ }
    K.add(() => { try { real.character.setVisible?.(wasVisible); real.pause?.(false); } catch { /* optional */ } });
  }
  const wIds = [1, 3, 5, 6, 8, 9, 11, 12, 2, 4];
  for (let i = 0; i < women; i++) out.women.push(await mk(`rite_w${i}`, whiteWoman(`villager_f_${wIds[i % wIds.length]}`)));
  const mIds = [2, 4, 5, 7, 9, 10, 1, 3];
  for (let i = 0; i < men; i++) out.men.push(await mk(`rite_m${i}`, `villager_m_${mIds[i % mIds.length]}`));
  for (let i = 0; i < kids; i++) out.kids.push(await mk(`rite_k${i}`, `child_${'abcdef'[i % 6]}`));
  out.bearers.push(await mk('rite_b0', 'villager_m_6'), await mk('rite_b1', 'villager_m_8'));
  out.all = [out.bogdan, out.hanka, out.ola, ...out.women, ...out.men, ...out.kids, ...out.bearers];
  return out;
}

// The ritual hole (the one the rite cuts): { x, z, open() } from the wilderness anchors, else the old hole.
export function ritualHole(G) {
  const R = anchors(G, 'ritual');
  const base = R?.hole ? { x: R.hole.x, z: R.hole.z } : (R?.oldHole ? { x: R.oldHole.x, z: R.oldHole.z } : { x: 11.2, z: -30.8 });
  return {
    ...base,
    open() {
      if (R?.hole?.open) R.hole.open();
      else if (!G._cineHole) G._cineHole = G.water?.addHole?.(base.x, base.z, 0.95);
    },
  };
}

// Where everyone stands round the hole once the procession has arrived (+z is toward the shore).
export function riteSpots(H) {
  const at = (dx, dz) => [H.x + dx, H.z + dz];
  const women = [], men = [], kids = [];
  for (let i = 0; i < 8; i++) { const a = -0.95 + i * 0.27; women.push(at(Math.sin(a) * 6.6, Math.cos(a) * 6.6 + 0.6)); }
  for (let i = 0; i < 5; i++) { const a = -1.15 + i * 0.58; men.push(at(Math.sin(a) * 8.4, Math.cos(a) * 8.4 + 0.2)); }
  for (let i = 0; i < 3; i++) kids.push(at(-2.4 + i * 0.7, 9.0));
  return {
    bogdan: at(-1.7, 3.1), ola: at(0.5, 4.3), bearers: [at(2.3, 4.5), at(3.6, 4.0)],
    hanka: at(7.2, 5.6), vesna: at(-6.2, 11), women, men, kids,
  };
}

// The waterline on the shore below (x, z0): walks toward the lake (-z) until the ice or water begins.
export function waterline(G, x, z0 = 90, step = 0.5) {
  for (let z = z0; z > -60; z -= step) if (G.world.lakeSDF(x, z) < 0) return z + step;
  return z0;
}

// ---- the finale stage (choice at 25 percent and the three endings) ---------------------------------------
// Vesna with the silver sword drawn south of the hole, Wiesia kneeling as a girl, Hanka and Ola at the edge.
// The boss body (if the combat builder's one exists) is put away. Everything is torn down by K.run().
export async function finaleStage(d, K, { sword = true, keepBoss = false, bird = !!d.G.state.flag('bird_given') } = {}) {
  const G = d.G;
  const H = ritualHole(G);
  const sp = riteSpots(H);
  const S = { H, sp, G };
  const boss = G.creatures?.boss;
  if (boss) {
    try { boss.passive = true; if (!keepBoss) boss.root.visible = false; } catch { /* optional */ }
    // The fight is over in every ending: the body is removed for good when the scene ends.
    K.add(() => { try { G.creatures.remove(boss); } catch { try { boss.dispose?.(); } catch { /* optional */ } } });
    S.bossAt = boss.root.position.clone();
  }
  const wx = H.x + 0.2, wz = H.z + 2.1;
  S.vesna = d.player();
  const vx = H.x + 0.9, vz = H.z + 6.6;
  d.place(S.vesna, vx, vz, yawTo(vx, vz, wx, wz));
  if (sword) { S.vesna.c.swordKind = 'silver'; S.vesna.c._setSword?.(true); S.vesna.play('combat_idle', { loop: true, fade: 0 }); }
  else S.vesna.play('idle_cold', { loop: true, fade: 0 });
  K.add(() => { try { S.vesna.c._setSword?.(false); } catch { /* optional */ } });
  S.wiesia = d.actor('wiesia', { preset: 'wiesia_ghost', at: [wx, wz], yaw: yawTo(wx, wz, vx, vz) });
  S.wiesia.c.autoGround = false;
  S.wiesia.c.root.position.y = G.world.heightAt(wx, wz);
  K.add(() => { S.wiesia.c.autoGround = true; });
  S.wiesia.play('kneel_idle', { loop: true, fade: 0 });
  S.wiesia.c.playUpper?.('cry', { loop: true, fade: 0 });
  S.wiesia.pos0 = [wx, wz];
  if (bird) {
    try {
      const b = props.birdCarving({ scale: 1 });
      S.wiesia.c.attach('handR', b);
      b.position.set(0, 0.0, 0.0);
      b.rotation.set(Math.PI / 2, 0, 0);
      b.scale.setScalar(1.4);
      K.add(() => disposeProp(b));
      S.bird = b;
    } catch (e) { console.warn('[cine] bird', e); }
  }
  S.hanka = await spawn(d, 'hanka', 'hanka', sp.hanka[0], sp.hanka[1], yawTo(sp.hanka[0], sp.hanka[1], wx, wz), { low: false });
  S.hanka.play('idle_cold', { loop: true, fade: 0 });
  const ox = H.x + 5.4, oz = H.z + 8.0;
  S.ola = await spawn(d, 'rite_ola', olaInWhite(), ox, oz, yawTo(ox, oz, wx, wz), { low: false });
  S.ola.id = 'ola';
  const real = G.npcs?.get?.('ola');
  if (real?.character) {
    const was = real.character.root.visible;
    try { real.pause?.(true); real.character.setVisible?.(false); } catch { /* optional */ }
    K.add(() => { try { real.character.setVisible?.(was); real.pause?.(false); } catch { /* optional */ } });
  }
  S.ola.play('idle_cold', { loop: true, fade: 0 });
  G.water?.setCracks?.(H.x, H.z, 26, 0.75);
  K.add(() => G.water?.setCracks?.(H.x, H.z, 26, G.world.thawed ? 0 : 0));
  H.open();
  return S;
}

// A figure comes apart into snow on the wind: scale to nothing while drifting up and across.
export function dissolve(d, actor, { secs = 2.4, drift = V3(0.6, 1.4, -0.4), at } = {}) {
  const c = actor.c.root;
  const p0 = c.position.clone();
  const s0 = c.scale.clone();
  const burst = () => {
    const q = c.position;
    try { props.fx.burst('snow', [q.x, q.y + 0.9, q.z], { count: 40, speed: 2.2, up: 1.1, size: 0.22 }); } catch { /* optional */ }
  };
  burst();
  return d.G.story.sched.tween({
    dur: secs, ease: 'in',
    step: (u) => {
      c.position.set(p0.x + drift.x * u, p0.y + drift.y * u, p0.z + drift.z * u);
      c.scale.set(s0.x * (1 - u * 0.85), s0.y * (1 - u * 0.5), s0.z * (1 - u * 0.85));
      if (u > 0.3 && !c.userData._b1) { c.userData._b1 = true; burst(); }
    },
    done: () => { actor.hide(); c.scale.copy(s0); c.position.copy(p0); delete c.userData._b1; void at; },
  });
}

// A straw doll the size of a hand, red thread at the neck (item_straw_doll). Attach it to a hand.
export function strawDoll(K) {
  const g = new THREE.Group();
  const straw = new THREE.MeshStandardMaterial({ color: 0xc9ac66, roughness: 1 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), straw);
  body.position.y = 0.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), straw);
  head.position.y = 0.115;
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6), straw);
  arms.rotation.z = Math.PI / 2;
  arms.position.y = 0.075;
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 5, 10), new THREE.MeshStandardMaterial({ color: 0x9a2e22, roughness: 0.9 }));
  knot.rotation.x = Math.PI / 2;
  knot.position.y = 0.097;
  g.add(body, head, arms, knot);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  K.add(() => g.parent?.remove(g));
  return g;
}

// Two small hands gripping an ice edge (C4). Local +z is the way the fingers point; the group sits at the
// wrists on the ice. Returns { group, slip(d, secs) } where slip lets them go and sink.
export function ghostHands(d, K, x, z, yaw = 0) {
  const G = d.G;
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6ecf2, emissive: 0x7cc4d4, emissiveIntensity: 0.7, roughness: 0.65 });
  const group = new THREE.Group();
  const capsule = (r, l) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 3, 6), mat);
  for (const sx of [-1, 1]) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), mat);
    palm.position.set(0, 0.012, 0.0);
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = capsule(0.0085, 0.045 - Math.abs(i - 1.5) * 0.004);
      f.rotation.x = Math.PI / 2 + 0.55;
      f.position.set((i - 1.5) * 0.0175, 0.003, 0.07);
      hand.add(f);
    }
    const th = capsule(0.009, 0.035);
    th.rotation.set(Math.PI / 2, 0, sx * -0.9);
    th.position.set(sx * -0.042, 0.012, 0.015);
    hand.add(th);
    const wrist = capsule(0.014, 0.06);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, 0.014, -0.085);
    hand.add(wrist);
    hand.position.x = sx * 0.17;
    hand.rotation.y = sx * 0.08;
    group.add(hand);
  }
  group.scale.setScalar(1.35);
  group.position.set(x, G.world.heightAt(x, z) + 0.006, z);
  group.rotation.y = yaw;
  G.scene.add(group);
  K.add(() => { group.parent?.remove(group); mat.dispose(); });
  return {
    group,
    slip: (secs = 1.6) => {
      const y0 = group.position.y;
      const back = V3(Math.sin(yaw), 0, Math.cos(yaw));
      const z0 = group.position.clone();
      return G.story.sched.tween({
        dur: secs, ease: 'in',
        step: (u) => { group.position.set(z0.x - back.x * 0.18 * u, y0 - 0.16 * u, z0.z - back.z * 0.18 * u); },
        done: () => { group.visible = false; },
      });
    },
  };
}

// The world as the endings leave it, set at once (for scenes that follow an ending).
export function applyEndingWorld(G, ending) {
  if (ending === 'thaw' || ending === 'looking_back') {
    G.uniforms.uSnowCover.value = 0;
    G.uniforms.uSpring.value = 1;
    G.water?.setThaw?.(1);
    G.weather?.set?.('clear', 0);
  } else if (ending === 'nothing_changes') {
    G.uniforms.uSnowCover.value = 1;
    G.uniforms.uSpring.value = 0;
    G.weather?.set?.('snow', 0);
  }
}

// ---- the drowned bell tower (C5, the dawn, ending A) --------------------------------------------------------
// Local frame: the tower center is the origin, +z faces the village (the broken window), the ice is y = 0,
// the belfry floor y = 5.4, the long table runs along x. S(lx, ly, lz) converts to world space.
export function towerSite(G) {
  const A = anchors(G, 'bellTower');
  const L = LOC.bellTower;
  const yaw = A?.yaw ?? Math.atan2(LOC.village.x - L.x, LOC.village.z - L.z);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const S = (lx, ly, lz) => (A?.placed?.localToWorld
    ? A.placed.localToWorld(lx, ly, lz)
    : V3(L.x + lx * cs + lz * sn, ly, L.z - lx * sn + lz * cs));
  const F = A?.belfry?.floorY ?? 5.4;
  const men = A?.drowned?.men || [S(6.3 - 3, 0, 5.4 - 0.7), S(6.3, 0, 5.4 + 0.5), S(6.3 + 3, 0, 5.4 - 0.2)];
  return {
    yaw, S, floor: F, A,
    center: V3(L.x, 0, L.z),
    table: S(0, F + 0.82, 0),
    box: S(2.05, F + 0.84, 0),
    ribbon: A?.belfry?.bellRope?.clone() || S(0.1, F + 1.2, 0.03),
    hatch: S(1.65, F, 1.1),
    lookDown: A?.belfry?.lookDown?.clone() || S(2.2, F + 0.1, 2.5),
    men, menCenter: A?.drowned?.center?.clone() || S(6.3, 0, 5.4),
    glide: A?.wiesiaGlide || { from: S(5.5, -0.8, 3.8), to: S(-12, -1.2, 20) },
    underGlow: A?.underGlow || { x: S(6.3, 0, 5.4).x, z: S(6.3, 0, 5.4).z, radius: 7 },
  };
}

// Hide the ambient villagers (G.npcs) standing within r of a spot while a scene stages its own cast.
// `keep` lists npc ids to leave alone. Restored by K.run().
export function clearArea(d, K, x, z, r, keep = []) {
  const list = d.G.npcs?.list;
  if (!list) return;
  for (const n of list) {
    const c = n.character;
    if (!c?.root || keep.includes(n.id) || n.id === 'vesna') continue;
    const p = c.root.position;
    if (Math.hypot(p.x - x, p.z - z) > r || !c.root.visible) continue;
    try { n.pause?.(true); c.setVisible?.(false); } catch { continue; }
    K.add(() => { try { c.setVisible?.(true); n.pause?.(false); } catch { /* optional */ } });
  }
}

// Station position from the village registry, else a fallback [x, z, yaw].
export function station(G, id, fb) {
  const s = G.world?.stations?.[id];
  return s ? { x: s.x, z: s.z, yaw: s.yaw ?? 0 } : { x: fb[0], z: fb[1], yaw: fb[2] ?? 0 };
}

// Smooth bump for 0..1 (used for bells and blinks).
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
