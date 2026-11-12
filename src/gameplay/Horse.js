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
// trees and the lake, and stops broadside so the mount side faces you. She comes by a route (the villagers' path grid:
// through the gates and down the streets, not into the palisade); with Vesna indoors she waits outside, a few steps
// clear of the door. Standing idle she gives way when Vesna pushes against her (she used to bar a doorway for good).
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
import { Nav } from './npcs/nav.js';

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
    bolt: null, // Kasza running off after she threw her rider (tickBolt)
    path: null, pathI: 0, goal: null, planAt: null, planT: 0, placeTries: 0, lastX: 0, lastZ: 0, blind: 0, nav: null, // the way in when called (tickCalled)
    nudge: false, press: 0, yielding: null, // Vesna pushing against her, and the steps she takes out of the way
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

  function blockedAt(x, z, r = 0.9) {
    const w = G_.world;
    if (w?.lakeSDF && w.lakeSDF(x, z) < 1.2) return true;
    if (G_.physics.query(x, z, r).length) return true;
    if (w?.indoors?.(x, z)) return true; // a house is four thin walls round an empty floor: the floor is not hers
    return false;
  }
  // Nothing in the way for `len` meters along a heading, sampled every step of her own width (a wall is 0.4 m thick:
  // two probes 2.5 and 6 m out used to straddle it, and she walked into the side of a house and stayed there).
  function clearAhead(yaw, len) {
    const p = h.root.position, sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (let t = 1.1; t <= len + 0.01; t += 0.8) if (blockedAt(p.x + sx * t, p.z + cz * t, 0.65)) return false;
    return true;
  }

  // Look for a clear heading near the wanted one: 6 m of clear ground, alternating sides and keeping to the side
  // that worked last; failing that, whatever is clear for a couple of steps.
  const STEER = [0, 0.45, -0.45, 0.9, -0.9, 1.45, -1.45, 2.1, -2.1];
  function steer(goalYaw) {
    for (const len of [6, 2.7]) {
      for (const o of STEER) {
        const y = goalYaw + o * H.avoid;
        if (clearAhead(y, len)) {
          if (o !== 0) H.avoid = Math.sign(o) * H.avoid || H.avoid;
          return y;
        }
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

  // ---- the way to her: a route on a grid of her own ------------------------------------------------------
  // The villagers' grid is cut for a villager's shoulders (and runs through doors). Kasza has her own, built the
  // same way with room for a horse, the lake ice and every floor under a roof shut: a route on it is one she fits.
  const navGrid = () => (H.nav ||= new Nav(G_, { agent: 0.9, margin: 1.7, noIce: true, outdoor: true }));
  const pathLen = (path, x, z) => { let l = 0; for (const q of path) { l += Math.hypot(q.x - x, q.z - z); x = q.x; z = q.z; } return l; };
  // Route from (x, z) to the goal, or null. Planned from the goal's side so its region is the one searched.
  function routeFrom(x, z, g) {
    try {
      const N = navGrid();
      N.ensure(g.x, g.z);
      const back = N.plan(g.x, g.z, x, z);
      if (!back || !back.length) return null;
      const path = back.slice(0, -1).reverse();
      path.push({ x: g.x, z: g.z });
      return path;
    } catch { return null; }
  }
  // Where she is to come to. Vesna herself as a rule. With Vesna in a house: a clear spot outside it a few steps
  // from the door (the nearest open ground by the way Vesna would walk out), so she neither noses at the wall nor
  // bars the door. With Vesna out on the ice: the shore nearest her.
  function standPoint() {
    const p = P().position, w = G_.world;
    const here = { x: p.x, z: p.z, indoor: false };
    try {
      if (w.lakeSDF && w.lakeSDF(p.x, p.z) < 1.2 && !w.indoors?.(p.x, p.z)) {
        let x = p.x, z = p.z;
        for (let i = 0; i < 40; i++) {
          const sd = w.lakeSDF(x, z);
          if (sd > 3.2) return { x, z, indoor: true };
          const gx = w.lakeSDF(x + 1, z) - w.lakeSDF(x - 1, z), gz = w.lakeSDF(x, z + 1) - w.lakeSDF(x, z - 1), gl = Math.hypot(gx, gz) || 1;
          const st = Math.max(1.5, Math.min(12, 3.4 - sd));
          x += (gx / gl) * st; z += (gz / gl) * st;
        }
        return here;
      }
      const N = navGrid();
      N.ensure(p.x, p.z);
      const room = w.roomAt?.(p.x, p.z, p.y) || (w.indoors?.(p.x, p.z) ? w.roomAt?.(p.x, p.z) : null);
      if (room) {
        // The same room as last time: the same spot.
        if (H.standFor && H.standFor.room === room.id) return H.standFor.at;
        let at = null;
        // Outside the nearest door of that room, off to one side of the way out.
        const b = room.box;
        let door = null;
        if (b) {
          const c = Math.cos(b.yaw || 0), sn = Math.sin(b.yaw || 0);
          for (const d of w.doors || []) {
            const r = d.rec;
            if (!r) continue;
            const dx = r.x - b.x, dz = r.z - b.z;
            const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
            if (Math.abs(lx) > b.hw + 1 || Math.abs(lz) > b.hd + 1) continue; // some other house's door
            const onX = Math.abs(lx) / b.hw > Math.abs(lz) / b.hd;
            const nlx = onX ? Math.sign(lx) : 0, nlz = onX ? 0 : Math.sign(lz);
            const far = Math.hypot(r.x - p.x, r.z - p.z);
            if (!door || far < door.far) door = { x: r.x, z: r.z, nx: nlx * c + nlz * sn, nz: -nlx * sn + nlz * c, far };
          }
        }
        if (door) {
          search: for (const out of [5, 6.5, 8, 10]) for (const side of [3, -3, 4.5, -4.5, 1.5, -1.5]) {
            const x = door.x + door.nx * out - door.nz * side, z = door.z + door.nz * out + door.nx * side;
            if (w.indoors(x, z) || N.flag(x, z) !== 0) continue;
            at = { x, z, indoor: true };
            break search;
          }
        }
        H.standFor = { room: room.id, at: at || here };
        if (at) return at;
      } else H.standFor = null;
      // Somewhere she cannot stand (a porch, a pier, a cellar): the nearest ground that is hers.
      if (N.flag(p.x, p.z) === 1) {
        const q = N.snap(p.x, p.z, { x: 0, z: 0 }, 14);
        if (Math.hypot(q.x - p.x, q.z - p.z) > 2.2) return { x: q.x, z: q.z, indoor: true };
      }
      return here;
    } catch { return here; }
  }
  function planRoute() {
    const pos = h.root.position, p = P().position;
    H.goal = standPoint();
    H.planAt = { x: p.x, z: p.z };
    H.path = routeFrom(pos.x, pos.z, H.goal);
    H.pathI = 0;
    H.planT = 3;
  }

  // Rings to appear in, nearer each time she has had to give up on a way in.
  const RINGS = [[55, 25], [28, 16], [12, 8]];
  function placeOffscreen() {
    const p = P().position;
    const camYaw = G_.cameraRig ? G_.cameraRig.yaw : P().yaw;
    const g = H.goal || { x: p.x, z: p.z };
    const [r0, r1] = RINGS[Math.min(H.placeTries, RINGS.length - 1)];
    H.placeTries++;
    let best = null, plans = 0;
    for (let i = 0; i < 40 && !best; i++) {
      const ang = camYaw + Math.PI + (Math.random() - 0.5) * 2.4 + (i > 20 ? (Math.random() - 0.5) * 4 : 0);
      const d = r0 + Math.random() * r1;
      const x = clamp(p.x + Math.sin(ang) * d, -WORLD.playable + 10, WORLD.playable - 10);
      const z = clamp(p.z + Math.cos(ang) * d, -WORLD.playable + 10, WORLD.playable - 10);
      if (blockedAt(x, z) || (G_.world.lakeSDF?.(x, z) ?? 99) < 10) continue;
      if (G_.world.indoors?.(x, z)) continue;
      if (slopeAt(x, z, 0, 1, H.tmp).ny < STEEP + 0.12) continue;
      if (i < 30 && inView(x, z)) continue;
      // A spot she can come in from: there is a way, and not one that goes round the whole village.
      if (plans < 12) {
        plans++;
        const path = routeFrom(x, z, g);
        if (!path || pathLen(path, x, z) > d * 2.2 + 25) continue;
      }
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
    H.bolt = null; // a whistle stops her running off
    G_.events.emit('horse:call', {});
    const c = P().character;
    if (!c.swordDrawn && !P().moves.act) c.gesture?.('beckon');
    H.state = 'called';
    H.arrived = false;
    H.callDelay = 1.0;
    H.stuck = 0;
    H.placeTries = 0;
    H.lastX = h.root.position.x; H.lastZ = h.root.position.z;
    H.blind = 0;
    H.standFor = null;
    H.path = null;
    H.goal = null;
    H.yielding = null;
    const d = dist2(P().position);
    if (d > 140 || (G_.world.lakeSDF?.(h.root.position.x, h.root.position.z) ?? 9) < 0) H.needPlace = true;
    return true;
  };

  function tickCalled(dt) {
    const player = P();
    if (H.callDelay > 0) {
      H.callDelay -= dt;
      if (H.callDelay <= 0) {
        // From where she stands when there is a way and it is not far; otherwise from out of sight.
        if (!H.needPlace) {
          planRoute();
          if (!H.path && dist2(player.position) > 30) H.needPlace = true;
        } else H.goal = standPoint();
        if (H.needPlace) {
          H.needPlace = false;
          placeOffscreen();
          planRoute();
          G_.audio?.sfx?.('horse_whinny', { pos: h.root.position, volume: 0.7 });
        }
      }
      h.setGait(0);
      return;
    }
    const pos = h.root.position;
    // Vesna has moved on (or gone in, or come out), or it has been a while: a new way from where Kasza is now.
    H.planT -= dt;
    if (!H.planAt || H.planT <= 0 || Math.hypot(player.position.x - H.planAt.x, player.position.z - H.planAt.z) > 6) planRoute();
    const g = H.goal || { x: player.position.x, z: player.position.z, indoor: false };
    const tx = g.indoor ? g.x : player.position.x, tz = g.indoor ? g.z : player.position.z;
    const stop = g.indoor ? 0.9 : STOP_DIST;
    const dx = tx - pos.x, dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    const yaw = h.root.rotation.y;
    if (d > stop + 0.4) {
      // By the route, corner to corner, then straight to her; with no route, the old way: at her, round what is seen.
      let want = Math.atan2(dx, dz);
      if (H.path) {
        const last = H.path.length - 1;
        while (H.pathI < last && Math.hypot(H.path[H.pathI].x - pos.x, H.path[H.pathI].z - pos.z) < 1.9) H.pathI++;
        if (H.pathI < last) want = Math.atan2(H.path[H.pathI].x - pos.x, H.path[H.pathI].z - pos.z);
      } else if (d > 14) want = steer(want);
      const rate = turnRate(h.speed);
      h.root.rotation.y = wrapAngle(yaw + clamp(wrapAngle(want - yaw) * Math.min(1, dt * 5), -rate * dt, rate * dt));
      let goalSpeed = d > 14 ? 4.7 : clamp(0.6 + (d - stop) * 0.7, 0.9, SPEEDS.trot);
      goalSpeed *= 0.35 + 0.65 * smoothstep(-0.2, 0.8, Math.cos(wrapAngle(want - h.root.rotation.y)));
      const s = slopeAt(pos.x, pos.z, Math.sin(yaw), Math.cos(yaw), H.tmp);
      goalSpeed *= moveFactor(s);
      const ice = iceAhead(h.root.rotation.y, h.speed);
      if (ice) goalSpeed = 0;
      h.setGait(goalSpeed);
      advance(dt);
      // Stuck behind something for a few seconds (by the ground she covers: her gait keeps its speed against a
      // wall): come in from somewhere else, nearer each time. Vesna out on the ice, or nowhere a horse can get to:
      // she comes as near as she can and waits there.
      const went = Math.hypot(pos.x - H.lastX, pos.z - H.lastZ) / Math.max(dt, 1e-3);
      H.lastX = pos.x; H.lastZ = pos.z;
      H.stuck = went < 0.4 ? H.stuck + dt : 0;
      // With no route she goes by eye, and among houses that can go round in circles: not for long.
      H.blind = H.path ? 0 : H.blind + dt;
      if (H.stuck > (ice ? 1.2 : 4) || H.blind > 9) {
        H.blind = 0;
        if (ice || H.placeTries >= 4) {
          H.state = 'idle';
          H.path = null;
          h.setGait(0);
          h.play('snort');
          G_.audio?.sfx?.('horse_snort', { pos: h.root.position, volume: 0.7 });
        } else { placeOffscreen(); planRoute(); }
      }
    } else {
      // Settle broadside: her left side toward the player so she can be mounted (outside a house, as she stands).
      const final = g.indoor ? yaw : Math.atan2(-dz, dx);
      const rate = 2.2;
      const err = wrapAngle(final - yaw);
      h.root.rotation.y = wrapAngle(yaw + clamp(err, -rate * dt, rate * dt));
      h.setGait(Math.abs(err) > 0.12 ? 1.0 : 0);
      advance(dt, Math.abs(err) > 0.12 && h.speed < 1.4);
      if (Math.abs(err) < 0.12 && h.speed < 0.25) {
        H.state = 'idle';
        H.arrived = true;
        H.path = null;
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
    c.anim.post = null; // the saddle carries the lean from here
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
    if (!player || H.state === 'mounted' || H.state === 'mounting' || H.state === 'dismounting' || H.state === 'thrown' || !player.control || player.dead) return false;
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

  // Where the root of a character playing the mount or dismount clip stands: w = 0 on the ground beside the horse, w = 1
  // where its pelvis (SADDLE_H above the root, 0.55 m to the right of it in the clip) is exactly on the saddle anchor,
  // whatever the slope and the lean of the spine. The swap to the saddle then moves nothing.
  const _s = new THREE.Vector3(), _climb = new THREE.Vector3(), _spot = new THREE.Vector3();
  function climbRoot(c, w) {
    const ls = c.anim.legScale ?? 1;
    h.saddle.updateWorldMatrix(true, false);
    _s.setFromMatrixPosition(h.saddle.matrixWorld);
    const yaw = h.root.rotation.y;
    const spot = mountSpot(_spot);
    const gy = G_.world.heightAt(spot.x, spot.z);
    return _climb.set(
      lerp(spot.x, _s.x + Math.cos(yaw) * 0.55 * ls, w),
      lerp(gy, _s.y - SADDLE_H * ls, w),
      lerp(spot.z, _s.z - Math.sin(yaw) * 0.55 * ls, w),
    );
  }
  // The horse leans with the slope and the seated rider with it. During the climb the rider hangs from a root on the
  // ground, so the lean is added at the pelvis as she nears the saddle (and taken off again on the way down).
  H.climbW = 0;
  function climbLean(c) {
    c.anim.post = (out, idx, dt, addEuler) => addEuler(out, idx.hips, h.root.rotation.x * (180 / Math.PI) * H.climbW, 0, 0);
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
        H.climbW = 0;
        climbLean(c);
        c.play('mount', { fade: 0.15 });
      }
      return;
    }
    // Clip phase: stand at her left and climb on; swap to the saddle at the end of the clip. Her root drifts from the
    // spot beside the horse to where the clip's last pose has the pelvis on the saddle (see climbRoot).
    H.climbW = smoothstep(0.9, 1.75, S.t);
    c.root.position.copy(climbRoot(c, H.climbW));
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
    // The blade goes away for the climb down (it would be in the way of the saddle) and any swing or ready pose stops.
    player.moves.cancelAll();
    c.stopUpper(0.05);
    c._setSword?.(false);
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
    H.climbW = 1;
    climbLean(c);
    c.play('dismount', { fade: 0 });
    return true;
  };

  function tickDismounting(dt) {
    const player = P(), c = player.character, S = H.seq;
    S.t += dt;
    h.setGait(0);
    H.climbW = 1 - smoothstep(0, 0.7, S.t);
    c.root.position.copy(climbRoot(c, H.climbW));
    c.root.rotation.y = h.root.rotation.y;
    player.position.copy(c.root.position);
    player.position.y = G_.world.heightAt(c.root.position.x, c.root.position.z);
    if (S.t >= 1.45) {
      player._mounting = false;
      H.state = 'idle';
      H.seq = null;
      c.autoGround = true;
      c.anim.post = null;
      player.loco.reset(h.root.rotation.y);
      c.stop(0.2);
      G_.events.emit('horse:dismount', {});
    }
  }

  // ---- thrown, and bolting -------------------------------------------------------------------------------
  // A heavy blow, or a bite while she is winded (player/mounted.js hurt), throws Vesna out of the saddle: a clip of the
  // fall (ride_thrown_l / _r), the root carried sideways from the seat to where she lands, input dead and every hit
  // ignored until she is up in guard. Kasza bolts forward a few metres, veering away, then stands snorting; X whistles her
  // back as ever.
  const FALL = { dur: 2.35, land: 0.66, away: 1.9, ahead: 0.5, slide: 0.35 };
  const _tp = new THREE.Vector3();

  H.throwRider = function throwRider(o = {}) {
    const player = P();
    if (!player || H.state !== 'mounted') return false;
    const c = player.character;
    const hy = h.root.rotation.y;
    const lx = Math.cos(hy), lz = -Math.sin(hy);
    // away from whatever hit her (ax, az point at it); with nothing to go by, away from the camera's side
    const lat = (o.ax ?? 0) * lx + (o.az ?? 0) * lz;
    let side;
    if (Math.abs(lat) > 0.15) side = lat > 0 ? -1 : 1;
    else {
      const cam = G_.camera.position;
      side = (cam.x - h.root.position.x) * lx + (cam.z - h.root.position.z) * lz > 0 ? -1 : 1;
    }
    player.moves.cancelAll();
    c.stopUpper(0.05);
    h.saddle.updateWorldMatrix(true, false);
    const sp = _tp.setFromMatrixPosition(h.saddle.matrixWorld);
    G_.scene.add(c.root);
    c.root.position.set(sp.x, G_.world.heightAt(sp.x, sp.z), sp.z);
    c.root.rotation.set(0, hy, 0);
    c.autoGround = true; // the clip carries the pelvis up and down; the root follows the ground
    player.mounted = false;
    player._mounting = true;
    player.position.copy(c.root.position);
    player.loco.reset(hy);
    H.mounted = false;
    H.state = 'thrown';
    H.ride = '';
    H.wantDismount = false;
    H.seq = { t: 0, side, x0: sp.x, z0: sp.z, hy, landed: false };
    c.play(side > 0 ? 'ride_thrown_l' : 'ride_thrown_r', { fade: 0 });
    // Kasza: a start, then away
    H.bolt = { t: 0, turn: -side * 0.5, v0: h.speed };
    h.play('rear', { amount: 0.5, speed: 1.6 });
    G_.audio?.sfx?.('horse_whinny', { pos: h.root.position, volume: 0.9 });
    G_.audio?.sfx?.('vesna_effort', { volume: 0.7 });
    G_.events.emit('horse:thrown', { side });
    return true;
  };

  function endThrow() {
    const player = P(), c = player.character;
    player._mounting = false;
    H.state = 'idle';
    H.seq = null;
    c.autoGround = true;
    player.position.copy(c.root.position);
    player.position.y = G_.world.heightAt(player.position.x, player.position.z);
    player.loco.reset(c.root.rotation.y);
    c.stop(0.3);
    player.moves.mercy = Math.max(player.moves.mercy, 0.8);
    G_.events.emit('horse:thrown_end', {});
  }
  H.endThrow = function () { if (H.state === 'thrown') endThrow(); };

  function tickThrown(dt) {
    const player = P(), c = player.character, S = H.seq;
    S.t += dt;
    const e1 = (u) => 1 - (1 - Math.min(1, Math.max(0, u))) * (1 - Math.min(1, Math.max(0, u)));
    // out and down to where she lands, then a short slide on the snow
    const k = e1(S.t / FALL.land) + FALL.slide / FALL.away * e1((S.t - FALL.land) / 0.5);
    const lx = Math.cos(S.hy), lz = -Math.sin(S.hy), fx = Math.sin(S.hy), fz = Math.cos(S.hy);
    const away = FALL.away * k * S.side, ahead = FALL.ahead * k;
    const p = c.root.position;
    p.x = S.x0 + lx * away + fx * ahead;
    p.z = S.z0 + lz * away + fz * ahead;
    G_.physics.resolve(p, 0.38);
    player.position.copy(p);
    player.position.y = G_.world.heightAt(p.x, p.z);
    if (!S.landed && S.t >= FALL.land) {
      S.landed = true;
      G_.audio?.sfx?.('body_fall', { volume: 0.9 });
      G_.cameraRig?.shake?.(0.35, 0.3);
      G_.postfx?.flash?.(0xffffff, 0.12);
    }
    tickBolt(dt);
    if (S.t >= FALL.dur) endThrow();
  }

  // Kasza running off: up to a gallop in a third of a second, a little more than a second of it, then easing to a stop
  // about seven metres on. She veers away from the fallen rider and steers round trees and the lake.
  function tickBolt(dt) {
    const B = H.bolt;
    if (!B) return;
    B.t += dt;
    const run = B.t < 0.7 ? 6.2 * smoothstep(0, 0.35, B.t) : 6.2 * (1 - smoothstep(0.7, 1.9, B.t));
    const v = Math.max(run, B.v0 * (1 - smoothstep(0.1, 1.6, B.t))); // she was already moving when it happened
    const yaw = h.root.rotation.y;
    const want = steer(yaw + B.turn * Math.min(1, B.t) * 0.5);
    h.root.rotation.y = wrapAngle(yaw + clamp(wrapAngle(want - yaw), -1.6 * dt, 1.6 * dt));
    let speed = v;
    if (iceAhead(h.root.rotation.y, speed)) speed = 0;
    h.speed = speed;
    h.setGait(speed);
    advance(dt);
    if (B.t > 2 && h.speed < 0.3) {
      H.bolt = null;
      h.setGait(0);
      h.play('snort');
      G_.audio?.sfx?.('horse_snort', { pos: h.root.position, volume: 0.7 });
    }
  }

  // A wolf launching itself at her head: a start away from it, a small rear (a hop at speed) and a step to the side.
  // Once every few seconds; the bite it aimed at her is easier to dodge for it, harder to land.
  H.shyT = 0;
  H.shyDir = 0;
  H.shyCool = 0;
  H.shy = function shy(wolfSide) {
    if (H.shyT > 0 || H.state === 'thrown' || H.scripted) return false;
    H.shyCool = 3.5;
    H.shyT = 1e-4;
    H.shyDir = wolfSide >= 0 ? -1 : 1;
    const fast = h.speed > 3.5;
    h.play('rear', { amount: fast ? 0.25 : 0.5, speed: fast ? 2.2 : 1.7 });
    G_.audio?.sfx?.('horse_whinny', { pos: h.root.position, volume: 0.7 });
    G_.events.emit('horse:shy', { dir: H.shyDir });
    return true;
  };
  const SHY = { dur: 0.45, step: 0.8, twist: 0.2 };
  function shyStep(dt) {
    if (H.shyT <= 0) return;
    const e = (t) => { const u = Math.min(1, t / SHY.dur); return 1 - (1 - u) * (1 - u); };
    const prev = H.shyT;
    H.shyT += dt;
    const d = (e(H.shyT) - e(prev)) * SHY.step * H.shyDir;
    const yaw = h.root.rotation.y;
    const pos = h.root.position;
    pos.x += Math.cos(yaw) * d;
    pos.z -= Math.sin(yaw) * d;
    G_.physics.resolve(pos, RADIUS);
    const sway = (Math.sin(Math.PI * Math.min(1, H.shyT / SHY.dur)) - Math.sin(Math.PI * Math.min(1, prev / SHY.dur)));
    h.root.rotation.y = wrapAngle(yaw + sway * SHY.twist * H.shyDir);
    if (H.shyT >= SHY.dur) H.shyT = 0;
  }
  function shyCheck(dt) {
    if (H.shyCool > 0) H.shyCool -= dt;
    const list = G_.combat?.enemies;
    if (!list || H.shyCool > 0 || H.shyT > 0) return;
    const p = h.root.position, hy = h.root.rotation.y;
    const lx = Math.cos(hy), lz = -Math.sin(hy), fx = Math.sin(hy), fz = Math.cos(hy);
    for (const e of list) {
      if (e.kind !== 'wolf' || !e.alive || e.state !== 'lunge' || !e.attack || e._shy === e.attack) continue;
      const dx = e.position.x - p.x, dz = e.position.z - p.z;
      const f = dx * fx + dz * fz, s = dx * lx + dz * lz;
      if (f > 0.6 && f < 4.8 && Math.abs(s) < 2.2 && e.stateT < 0.3) {
        e._shy = e.attack;
        H.shy(s);
        break;
      }
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
      // Shift gallops whatever the walk toggle says, as it sprints on foot.
      if (inp.down('sprint') && !H.tired && player.stamina > 2) base = SPEEDS.gallop;
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

  // ---- giving way ------------------------------------------------------------------------------------
  // Vesna walking into her (the player's push-out reports it, locomotion.js): after a moment of it she turns away
  // from where she is being pushed from and walks a few steps off, round whatever is in front of her.
  H.nudged = () => { H.nudge = true; };
  function tickYield(dt) {
    const Y = H.yielding;
    Y.t += dt;
    const pos = h.root.position, yaw = h.root.rotation.y;
    const want = steer(Y.away);
    const err = wrapAngle(want - yaw);
    h.root.rotation.y = wrapAngle(yaw + clamp(err, -2.6 * dt, 2.6 * dt));
    const go = Math.abs(err) < 0.75;
    let speed = go ? 1.7 : 1.0;
    if (iceAhead(h.root.rotation.y, speed)) speed = 0;
    h.setGait(speed);
    advance(dt, !go);
    if (Math.hypot(pos.x - Y.x0, pos.z - Y.z0) > 3.4 || Y.t > 5) { H.yielding = null; h.setGait(0); }
  }

  // ---- idle life ------------------------------------------------------------------------------------
  function tickIdle(dt) {
    if (H.bolt) { tickBolt(dt); return; }
    const pl = P();
    H.press = H.nudge ? H.press + dt : Math.max(0, H.press - dt * 2);
    H.nudge = false;
    if (H.yielding) { tickYield(dt); return; }
    if (H.press > 0.5 && pl && !pl.mounted && !H.scripted) {
      const pos = h.root.position;
      H.press = 0;
      H.yielding = { t: 0, x0: pos.x, z0: pos.z, away: Math.atan2(pos.x - pl.position.x, pos.z - pl.position.z) };
      return;
    }
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
        if (dist2(player.position) < MOUNT_RANGE && !H.needPlace && H.callDelay <= 0 && !H.bolt) H.mount();
        else if (H.state === 'idle') H.call();
      }
    }
    if (H.state !== 'idle') { H.yielding = null; H.press = 0; H.nudge = false; }
    switch (H.state) {
      case 'called': tickCalled(dt); break;
      case 'mounting': tickMounting(dt); break;
      case 'mounted': tickMounted(dt); break;
      case 'dismounting': tickDismounting(dt); break;
      case 'thrown': tickThrown(dt); break;
      default: tickIdle(dt);
    }
    if (H.state === 'mounted' || H.state === 'idle') { shyCheck(dt); shyStep(dt); }
    hooves();
  }
  G_.addSystem('horse', update, ORDER.logic + 3);

  H.teleport = function teleport(x, z, yaw = h.root.rotation.y) {
    if (H.mounted) H.dismount({ instant: true });
    H.endThrow();
    H.bolt = null;
    H.shyT = 0;
    h.setPosition(x, z);
    h.root.rotation.y = yaw;
    h.speed = 0;
    h.setGait(0);
    H.state = 'idle';
    H.arrived = true;
    H.needPlace = false;
  };
}
