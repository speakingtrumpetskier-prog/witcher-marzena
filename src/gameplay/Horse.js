// Kasza: the horse. G.horse wraps createHorse('kasza') (src/characters/horse.js).
//
//   G.horse.horse / .character     the Horse character (setGait, play('snort' | 'rear'), saddle anchor)
//   .root, .position, .yaw, .speed, .gait       .state 'idle' | 'called' | 'mounting' | 'mounted' | 'dismounting'
//   .mounted, .mounting                          .call()  whistle (X away from her)
//   .mount() / .dismount({ instant })            .teleport(x, z, yaw)
//
// X: mounted -> dismount (she brakes first when fast); near her (3.6 m) -> mount from her left
// (Vesna walks around the head if she is on the right side, plays the mount clip, then rides
// parented to the saddle anchor); far away -> whistle: she trots in from out of view, steers around
// trees and the lake, and stops broadside so the mount side faces you.
// Riding: WASD steers camera-relative (turning radius grows with speed), Shift gallops while stamina
// lasts, CapsLock/Alt walk. She will not set a hoof on lake ice: she stops at the shore with a snort
// (a rear if galloping) and Vesna says so. Holding forward on a road gently follows it.
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { createHorse } from '../characters/index.js';
import { SPAWN, nearestRoad, WORLD } from '../world/layout.js';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../core/util.js';
import { slopeAt, moveFactor, blocked, STEEP } from './player/ground.js';
import { TUNE } from './player/stats.js';
import { SADDLE_H } from '../characters/clips/library.js';

const SPEEDS = { walk: 1.8, trot: 4.3, gallop: 9.2 };
const RADIUS = 0.75;
const MOUNT_RANGE = 3.6;
const STOP_DIST = 2.3;
const GAIT_OFFS = { walk: [0, 0.25, 0.5, 0.75], trot: [0, 0.5, 0.5, 0], gallop: [0, 0.32, 0.12, 0.44] };
const HOOF_SFX = { walk: ['hoof_walk', 0.45], trot: ['hoof_trot', 0.6], gallop: ['hoof_gallop', 0.8] };
const _v = new THREE.Vector3();

const fwd = (yaw, out) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

export async function init(G_) {
  const h = createHorse('kasza');
  h.root.rotation.order = 'YXZ'; // yaw first, then slope tilt about her own X axis
  G_.scene.add(h.root);
  const sp = SPAWN.villageGate;
  h.setPosition(sp.x + 5, sp.z + 6);
  h.root.rotation.y = sp.yaw;

  const H = {
    horse: h,
    character: h,
    root: h.root,
    position: h.root.position,
    state: 'idle',
    mounted: false,
    mounting: false,
    scripted: false, // a cutscene is driving her (set by the story stage): this system leaves gait and pose alone
    get yaw() { return h.root.rotation.y; },
    set yaw(v) { h.root.rotation.y = v; },
    get speed() { return h.speed; },
    get gait() { return h.gait; },
    tired: false,
    refusing: false,
    refuseCool: 0,
    barkCool: 0,
    callDelay: 0,
    needPlace: false,
    arrived: true,
    avoid: 1,
    stuck: 0,
    idleTimer: 8 + Math.random() * 10,
    tilt: 0,
    prevLeg: [0, 0, 0, 0],
    wantDismount: false,
    ride: '',
    seq: null, // mount / dismount sequence state
    tmp: {},
  };
  G_.horse = H;

  const P = () => G_.player;

  // ---- queries ---------------------------------------------------------------------------------
  const dist2 = (p) => Math.hypot(p.x - h.root.position.x, p.z - h.root.position.z);

  function iceAhead(yaw, speed) {
    const w = G_.world;
    if (!w?.lakeSDF) return false;
    const p = h.root.position;
    const look = 1.5 + (speed * speed) / 9;
    const here = w.lakeSDF(p.x, p.z);
    const ax = p.x + Math.sin(yaw) * look, az = p.z + Math.cos(yaw) * look;
    const ahead = w.lakeSDF(ax, az);
    return ahead < 0.8 && ahead < here;
  }

  function blockedAt(x, z) {
    const w = G_.world;
    if (w?.lakeSDF && w.lakeSDF(x, z) < 1.2) return true;
    if (G_.physics.query(x, z, 0.9).length) return true;
    return false;
  }

  // Look for a clear heading near the wanted one: probes 2.5 m and 6 m ahead, alternating sides.
  function steer(goalYaw) {
    const p = h.root.position;
    const offs = [0, 0.45, -0.45, 0.9, -0.9, 1.45, -1.45];
    for (const o of offs) {
      const y = goalYaw + o * H.avoid;
      const x1 = p.x + Math.sin(y) * 2.5, z1 = p.z + Math.cos(y) * 2.5;
      const x2 = p.x + Math.sin(y) * 6, z2 = p.z + Math.cos(y) * 6;
      if (!blockedAt(x1, z1) && !blockedAt(x2, z2)) {
        if (o !== 0) H.avoid = Math.sign(o) * H.avoid || H.avoid;
        return y;
      }
    }
    return goalYaw + 1.6 * H.avoid;
  }

  function turnRate(speed) {
    if (speed < 0.6) return 2.6;
    return lerp(2.4, 0.8, smoothstep(0.6, SPEEDS.gallop, speed));
  }

  // ---- movement shared by AI and rider ----------------------------------------------------------
  function advance(dt, animSpeedOnly) {
    const pos = h.root.position;
    const yaw = h.root.rotation.y;
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    let v = animSpeedOnly ? 0 : h.speed;
    if (v > 0.01) {
      const s = slopeAt(pos.x, pos.z, sx, cz, H.tmp);
      let dx = sx * v * dt, dz = cz * v * dt;
      if (blocked(s)) {
        const comp = dx * s.ux + dz * s.uz;
        dx -= comp * s.ux; dz -= comp * s.uz;
        h.speed *= 0.9;
      }
      const B = WORLD.playable;
      pos.x = clamp(pos.x + dx, -B, B);
      pos.z = clamp(pos.z + dz, -B, B);
      const ox = pos.x, oz = pos.z;
      G_.physics.resolve(pos, RADIUS);
      const pushed = Math.hypot(pos.x - ox, pos.z - oz);
      if (pushed > 0.02) h.speed *= 0.92;
    }
    pos.y = G_.world.heightAt(pos.x, pos.z);
    // Tilt with the slope along her heading.
    const hf = G_.world.heightAt(pos.x + sx * 1.2, pos.z + cz * 1.2), hb = G_.world.heightAt(pos.x - sx * 1.2, pos.z - cz * 1.2);
    const goal = -Math.atan2(hf - hb, 2.4) * 0.8;
    H.tilt = damp(H.tilt, goal, 8, dt);
    h.root.rotation.x = H.tilt;
  }

  // ---- hoofbeats -----------------------------------------------------------------------------------
  function hooves() {
    const g = h.gait;
    const offs = GAIT_OFFS[g];
    if (!offs || h.speed < 0.8) { for (let i = 0; i < 4; i++) H.prevLeg[i] = (h.phase + (offs ? offs[i] : 0)) % 1; return; }
    let strike = false;
    for (let i = 0; i < 4; i++) {
      const p = (h.phase + offs[i]) % 1;
      if (p < H.prevLeg[i] - 0.5) strike = true;
      H.prevLeg[i] = p;
    }
    if (!strike) return;
    const cam = G_.camera.position;
    if (Math.hypot(cam.x - h.root.position.x, cam.z - h.root.position.z) > 90) return;
    const [name, vol] = HOOF_SFX[g];
    G_.audio?.sfx?.(name, { pos: h.root.position, volume: vol, pitch: 0.95 + Math.random() * 0.1 });
  }

  // ---- calling her ----------------------------------------------------------------------------------
  function inView(x, z) {
    const cam = G_.camera;
    _v.set(x, G_.world.heightAt(x, z) + 1, z).project(cam);
    return _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
  }

  function placeOffscreen() {
    const p = P().position;
    const camYaw = G_.cameraRig ? G_.cameraRig.yaw : P().yaw;
    let best = null;
    for (let i = 0; i < 40 && !best; i++) {
      const ang = camYaw + Math.PI + (Math.random() - 0.5) * 2.4 + (i > 20 ? (Math.random() - 0.5) * 4 : 0);
      const d = 55 + Math.random() * 25;
      const x = clamp(p.x + Math.sin(ang) * d, -WORLD.playable + 10, WORLD.playable - 10);
      const z = clamp(p.z + Math.cos(ang) * d, -WORLD.playable + 10, WORLD.playable - 10);
      if (blockedAt(x, z) || (G_.world.lakeSDF?.(x, z) ?? 99) < 10) continue;
      if (slopeAt(x, z, 0, 1, H.tmp).ny < STEEP + 0.12) continue;
      if (i < 30 && inView(x, z)) continue;
      best = { x, z };
    }
    if (!best) best = { x: p.x - Math.sin(camYaw) * 60, z: p.z - Math.cos(camYaw) * 60 };
    h.setPosition(best.x, best.z);
    h.root.rotation.y = Math.atan2(p.x - best.x, p.z - best.z);
    h.speed = 0;
    H.stuck = 0;
  }

  H.call = function call() {
    if (H.mounted || H.mounting || !P() || P().dead) return false;
    G_.audio?.sfx?.('whistle');
    G_.events.emit('horse:call', {});
    const c = P().character;
    if (!c.swordDrawn && !P().moves.act) c.gesture?.('beckon');
    H.state = 'called';
    H.arrived = false;
    H.callDelay = 1.0;
    H.stuck = 0;
    const d = dist2(P().position);
    if (d > 140 || (G_.world.lakeSDF?.(h.root.position.x, h.root.position.z) ?? 9) < 0) H.needPlace = true;
    return true;
  };

  function tickCalled(dt) {
    const player = P();
    if (H.callDelay > 0) {
      H.callDelay -= dt;
      if (H.callDelay <= 0 && H.needPlace) { H.needPlace = false; placeOffscreen(); G_.audio?.sfx?.('horse_whinny', { pos: h.root.position, volume: 0.7 }); }
      h.setGait(0);
      return;
    }
    const pos = h.root.position;
    const dx = player.position.x - pos.x, dz = player.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    const yaw = h.root.rotation.y;
    if (d > STOP_DIST + 0.4) {
      const goal = Math.atan2(dx, dz);
      const want = d > 14 ? steer(goal) : goal;
      const rate = turnRate(h.speed);
      h.root.rotation.y = wrapAngle(yaw + clamp(wrapAngle(want - yaw) * Math.min(1, dt * 5), -rate * dt, rate * dt));
      let goalSpeed = d > 14 ? 4.7 : clamp(0.6 + (d - STOP_DIST) * 0.7, 0.9, SPEEDS.trot);
      goalSpeed *= 0.35 + 0.65 * smoothstep(-0.2, 0.8, Math.cos(wrapAngle(want - h.root.rotation.y)));
      const s = slopeAt(pos.x, pos.z, Math.sin(yaw), Math.cos(yaw), H.tmp);
      goalSpeed *= moveFactor(s);
      if (iceAhead(h.root.rotation.y, h.speed)) goalSpeed = 0;
      h.setGait(goalSpeed);
      advance(dt);
      // Stuck behind something for a few seconds: come in from somewhere else.
      H.stuck = h.speed < 0.4 ? H.stuck + dt : 0;
      if (H.stuck > 4) placeOffscreen();
    } else {
      // Settle broadside: her left side toward the player so she can be mounted.
      const final = Math.atan2(-dz, dx);
      const rate = 2.2;
      const err = wrapAngle(final - yaw);
      h.root.rotation.y = wrapAngle(yaw + clamp(err, -rate * dt, rate * dt));
      h.setGait(Math.abs(err) > 0.12 ? 1.0 : 0);
      advance(dt, Math.abs(err) > 0.12 && h.speed < 1.4);
      if (Math.abs(err) < 0.12 && h.speed < 0.25) {
        H.state = 'idle';
        H.arrived = true;
        h.setGait(0);
        h.play('snort');
        G_.audio?.sfx?.('horse_snort', { pos: h.root.position, volume: 0.7 });
        G_.events.emit('horse:arrived', {});
      }
    }
  }

  // ---- mounting -------------------------------------------------------------------------------------
  const mountSpot = (out) => {
    const y = h.root.rotation.y;
    const pos = h.root.position;
    return out.set(pos.x + Math.cos(y) * 0.55 - Math.sin(y) * 0.04, pos.y, pos.z - Math.sin(y) * 0.55 - Math.cos(y) * 0.04);
  };

  // Swap Vesna onto the saddle anchor and start riding.
  function seat() {
    const player = P(), c = player.character;
    h.saddle.add(c.root);
    c.root.position.set(0, 0, 0);
    c.root.rotation.set(0, 0, 0);
    c.autoGround = false;
    H.ride = '';
    H.state = 'mounted';
    H.mounted = true;
    H.mounting = false;
    player.mounted = true;
    player._mounting = false;
    H.seq = null;
    setRide('ride_idle', 0);
    G_.events.emit('horse:mount', {});
  }

  H.mount = function mount(opts = {}) {
    const player = P();
    if (!player || H.state === 'mounted' || H.state === 'mounting' || H.state === 'dismounting' || !player.control || player.dead) return false;
    const c = player.character;
    player.moves.cancelAll();
    if (c.swordDrawn) player.moves.toggleSword(false);
    player.loco.vel.set(0, 0, 0);
    player.loco.speed = 0;
    player.setTarget?.(null);
    H.state = 'mounting';
    H.mounting = true;
    player._mounting = true;
    h.setGait(0);
    if (opts.instant) { c._setSword?.(false); seat(); return true; }
    const start = player.position.clone();
    const end = mountSpot(new THREE.Vector3());
    const hy = h.root.rotation.y;
    const lx = (start.x - h.root.position.x) * Math.cos(hy) - (start.z - h.root.position.z) * Math.sin(hy);
    const ctrl = new THREE.Vector3();
    if (lx < 0.2) {
      // Right side or in front: swing wide around her head.
      const f = fwd(hy, _v);
      ctrl.set(h.root.position.x + f.x * 3.2, 0, h.root.position.z + f.z * 3.2);
    } else ctrl.set((start.x + end.x) / 2, 0, (start.z + end.z) / 2);
    const len = start.distanceTo(end) + (lx < 0.2 ? 3 : 0);
    H.seq = { phase: 'approach', t: 0, dur: clamp(len / 1.7, 0.4, 2.6), start, end, ctrl };
    return true;
  };

  // Where the root of a character playing the mount or dismount clip must stand so its pelvis is on the saddle.
  const _s = new THREE.Vector3();
  function seatRootY(c) {
    h.saddle.updateWorldMatrix(true, false);
    return _s.setFromMatrixPosition(h.saddle.matrixWorld).y - SADDLE_H * (c.anim.legScale ?? 1);
  }

  function tickMounting(dt) {
    const player = P(), c = player.character, S = H.seq;
    S.t += dt;
    h.setGait(0);
    if (S.phase === 'approach') {
      const u = clamp(S.t / S.dur);
      const e = u * u * (3 - 2 * u);
      const a = 1 - e;
      const px = a * a * S.start.x + 2 * a * e * S.ctrl.x + e * e * S.end.x;
      const pz = a * a * S.start.z + 2 * a * e * S.ctrl.z + e * e * S.end.z;
      const dx = px - player.position.x, dz = pz - player.position.z;
      player.position.set(px, G_.world.heightAt(px, pz), pz);
      let yaw = player.loco.yaw;
      if (Math.hypot(dx, dz) > 1e-4 && u < 0.85) yaw = dampAngle(yaw, Math.atan2(dx, dz), 12, dt);
      else yaw = dampAngle(yaw, h.root.rotation.y, 10, dt);
      player.loco.yaw = yaw;
      c.root.position.copy(player.position);
      c.root.rotation.y = yaw;
      c.speed = c.targetSpeed = u < 0.9 ? 1.5 : 0.4;
      if (S.t >= S.dur) {
        S.phase = 'clip';
        S.t = 0;
        c._setSword?.(false);
        c.speed = c.targetSpeed = 0;
        c.autoGround = false; // the root climbs to the saddle height below
        c.play('mount', { fade: 0.15 });
      }
      return;
    }
    // Clip phase: stand at her left and climb on; swap to the saddle when the clip ends. The clip puts her pelvis
    // SADDLE_H above the root, so the root drifts up or down to the height that lands it on the saddle exactly
    // (the ground beside the horse is not the ground under her, and the saddle rides the spine).
    const spot = mountSpot(_v);
    const gy = G_.world.heightAt(spot.x, spot.z);
    c.root.position.set(spot.x, lerp(gy, seatRootY(c), smoothstep(0.9, 1.75, S.t)), spot.z);
    c.root.rotation.y = h.root.rotation.y;
    player.position.copy(c.root.position);
    player.loco.yaw = c.root.rotation.y;
    if (S.t >= 1.82) seat();
  }

  function setRide(name, fade = 0.3) {
    const c = P().character;
    if (H.ride !== name) {
      H.ride = name;
      c.play(name, { loop: true, fade });
    }
  }

  H.dismount = function dismount(opts = {}) {
    const player = P();
    if (!player || H.state !== 'mounted') return false;
    if (!opts.instant && h.speed > 1.3) { H.wantDismount = true; return true; }
    H.wantDismount = false;
    const c = player.character;
    const spot = mountSpot(new THREE.Vector3());
    G_.scene.add(c.root);
    c.root.position.set(spot.x, G_.world.heightAt(spot.x, spot.z), spot.z);
    c.root.rotation.set(0, h.root.rotation.y, 0);
    c.autoGround = !!opts.instant; // the climb down moves the root from the saddle height to the ground itself
    player.mounted = false;
    player.position.copy(c.root.position);
    player.loco.reset(h.root.rotation.y);
    h.setGait(0);
    H.ride = '';
    if (opts.instant) {
      c.stop(0);
      H.state = 'idle';
      H.mounted = false;
      player._mounting = false;
      G_.events.emit('horse:dismount', {});
      return true;
    }
    player._mounting = true;
    H.state = 'dismounting';
    H.mounted = false;
    H.seq = { phase: 'clip', t: 0 };
    c.play('dismount', { fade: 0 });
    return true;
  };

  function tickDismounting(dt) {
    const player = P(), c = player.character, S = H.seq;
    S.t += dt;
    h.setGait(0);
    const spot = mountSpot(_v);
    const gy = G_.world.heightAt(spot.x, spot.z);
    c.root.position.set(spot.x, lerp(seatRootY(c), gy, smoothstep(0, 0.7, S.t)), spot.z);
    c.root.rotation.y = h.root.rotation.y;
    player.position.copy(c.root.position);
    player.position.y = gy;
    if (S.t >= 1.45) {
      player._mounting = false;
      H.state = 'idle';
      H.seq = null;
      c.autoGround = true;
      player.loco.reset(h.root.rotation.y);
      c.stop(0.2);
      G_.events.emit('horse:dismount', {});
    }
  }

  // ---- riding ---------------------------------------------------------------------------------------
  function roadAssist(wantYaw, mv) {
    if (mv.y < 0.5 || Math.abs(mv.x) > 0.2) return wantYaw;
    const pos = h.root.position;
    const r = nearestRoad(pos.x, pos.z);
    if (!r) return wantYaw;
    const reach = r.road.width * 0.5 + 6;
    if (r.d > reach) return wantYaw;
    const a = r.road.pts[r.seg], b = r.road.pts[r.seg + 1];
    let road = Math.atan2(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(wrapAngle(road - wantYaw)) > 1.5) road = wrapAngle(road + Math.PI);
    if (Math.abs(wrapAngle(road - wantYaw)) > 0.95) return wantYaw;
    // Signed offset from the road centerline (positive = to the left of the travel direction).
    const lat = (pos.x - r.x) * Math.cos(road) - (pos.z - r.z) * Math.sin(road);
    const target = road - clamp(lat * 0.22, -0.5, 0.5);
    const w = 0.7 * (1 - smoothstep(1.5, reach, r.d));
    return wantYaw + wrapAngle(target - wantYaw) * w;
  }

  function tickMounted(dt) {
    const player = P();
    const inp = G_.input;
    const ctrl = player.control && inp.context === 'game' && !player.dead;
    const pos = h.root.position;
    const yaw = h.root.rotation.y;
    const mv = ctrl ? inp.move : { x: 0, y: 0 };
    const mag = Math.hypot(mv.x, mv.y);
    const camYaw = G_.cameraRig ? G_.cameraRig.yaw : yaw;
    let goalSpeed = 0;
    let animOnly = false;
    let wantYaw = yaw;
    if (mag > 0.1 && !H.wantDismount) {
      const s = Math.sin(camYaw), k = Math.cos(camYaw);
      wantYaw = Math.atan2(s * mv.y - k * mv.x, k * mv.y + s * mv.x);
      wantYaw = roadAssist(wantYaw, mv);
      const walk = player.walkToggle || player.walkCaps;
      let base = walk ? SPEEDS.walk : SPEEDS.trot;
      if (!walk && inp.down('sprint') && !H.tired && player.stamina > 2) base = SPEEDS.gallop;
      const err = wrapAngle(wantYaw - yaw);
      const rate = turnRate(h.speed);
      h.root.rotation.y = wrapAngle(yaw + clamp(err * Math.min(1, dt * 6), -rate * dt, rate * dt));
      const align = Math.cos(wrapAngle(wantYaw - h.root.rotation.y));
      goalSpeed = base * (0.45 + 0.55 * smoothstep(-0.2, 0.8, align));
      // Sharp turn from (nearly) standing: pivot on the spot.
      if (h.speed < 1.4 && Math.abs(err) > 1.3) { goalSpeed = 1.1; animOnly = true; }
    }
    const fy = h.root.rotation.y;
    const s = slopeAt(pos.x, pos.z, Math.sin(fy), Math.cos(fy), H.tmp);
    goalSpeed *= moveFactor(s);
    // Refuse the ice: brake hard, snort (rear if she was galloping), and let Vesna say it once in a while.
    if (H.refuseCool > 0) H.refuseCool -= dt;
    H.refusing = false;
    if ((goalSpeed > 0 || h.speed > 0.5) && iceAhead(fy, h.speed)) {
      H.refusing = true;
      if (H.refuseCool <= 0) {
        H.refuseCool = 4;
        const fast = h.speed > 6;
        h.play(fast ? 'rear' : 'snort');
        G_.audio?.sfx?.(fast ? 'horse_whinny' : 'horse_snort', { pos, volume: 0.9 });
        if (H.barkCool <= 0) {
          H.barkCool = 25;
          _v.copy(player.position); _v.y += 2;
          G_.ui?.bark?.('Vesna', "Kasza won't set a hoof on the ice. Fair enough.", _v.clone());
        }
        G_.events.emit('horse:refuse', {});
      }
      goalSpeed = 0;
      animOnly = false;
      h.speed = Math.max(0, h.speed - 10 * dt);
    }
    if (H.wantDismount) goalSpeed = 0;

    // Gallop costs stamina; running dry drops her to a trot until she has caught her breath.
    const galloping = h.speed > 6.5;
    if (galloping) {
      player.stamina = Math.max(0, player.stamina - 9 * dt);
      player._s.staminaWait = TUNE.staminaDelay;
      if (player.stamina <= 2) H.tired = true;
    }
    if (H.tired && player.stamina > 30) H.tired = false;
    if (H.tired && goalSpeed > SPEEDS.trot) goalSpeed = SPEEDS.trot;

    h.setGait(goalSpeed);
    advance(dt, animOnly);

    if (H.wantDismount && h.speed < 1.3) H.dismount();
    else if (ctrl && inp.pressed('horse') && H.state === 'mounted') H.dismount();

    // Ride clip and its playback rate follow her gait.
    const sp = h.speed;
    const name = sp > 6 ? 'ride_gallop' : sp > 2.4 ? 'ride_trot' : 'ride_idle';
    setRide(name);
    const st = player.character.anim.base[player.character.anim.base.length - 1];
    if (st && st.kind === 'clip') {
      st.speed = name === 'ride_trot' ? clamp(0.2417 * sp, 0.6, 1.4) : name === 'ride_gallop' ? clamp(2.2 * sp / SPEEDS.gallop * 0.5, 0.7, 1.4) : 1;
    }
    player.character.root.position.set(0, 0, 0);
  }

  // ---- idle life ------------------------------------------------------------------------------------
  function tickIdle(dt) {
    h.setGait(0);
    advance(dt, true);
    H.idleTimer -= dt;
    const player = P();
    if (H.idleTimer <= 0) {
      H.idleTimer = 14 + Math.random() * 20;
      if (player && dist2(player.position) < 16 && !h.one) {
        h.play('snort');
        G_.audio?.sfx?.('horse_snort', { pos: h.root.position, volume: 0.5 });
      }
    }
  }

  // ---- system ---------------------------------------------------------------------------------------
  function update(dt) {
    const player = P();
    if (!player) return;
    // The cutscene director sets the gait itself; tickIdle would reset it to 0 every frame and she would glide.
    if (H.scripted) { hooves(); return; }
    const inp = G_.input;
    if (H.barkCool > 0) H.barkCool -= dt;
    // X: whistle, mount, dismount.
    if (player.control && inp.context === 'game' && !player.dead && inp.pressed('horse')) {
      if (H.state === 'idle' || H.state === 'called') {
        if (dist2(player.position) < MOUNT_RANGE && !H.needPlace && H.callDelay <= 0) H.mount();
        else if (H.state === 'idle') H.call();
      }
    }
    switch (H.state) {
      case 'called': tickCalled(dt); break;
      case 'mounting': tickMounting(dt); break;
      case 'mounted': tickMounted(dt); break;
      case 'dismounting': tickDismounting(dt); break;
      default: tickIdle(dt);
    }
    hooves();
  }
  G_.addSystem('horse', update, ORDER.logic + 3);

  H.teleport = function teleport(x, z, yaw = h.root.rotation.y) {
    if (H.mounted) H.dismount({ instant: true });
    h.setPosition(x, z);
    h.root.rotation.y = yaw;
    h.speed = 0;
    h.setGait(0);
    H.state = 'idle';
    H.arrived = true;
    H.needPlace = false;
  };
}
