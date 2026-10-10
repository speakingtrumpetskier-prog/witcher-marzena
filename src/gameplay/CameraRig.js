// Third-person camera rig. G.cameraRig. Only writes G.camera while G.cameraOwner === 'rig'; it keeps
// tracking the player otherwise so the hand-back from a cutscene is a short blend, not a jump.
//
//   G.cameraRig.yaw / pitch        heading of the camera (radians, yaw 0 looks along +Z) and how far it looks down
//   .mode                          'explore' | 'combat' | 'mounted' | 'interior' (auto; setMode(m | null) overrides)
//   .shake(intensity, seconds)     trauma shake, intensity 0..1
//   .setTarget(objOrNull)          lock-on: frames you and the target (object with position or root, height)
//   .target                        the locked object
//   .snapBehind(yaw)               put the camera right behind the player now (teleports, scene ends)
//   .recenter()                    ease the camera behind the player (T with nothing to lock)
//   .forward(out) / .aimDir(out)   camera forward as a unit Vector3
//   .sideK                         -1 .. 1, which shoulder the camera is over right now (eases between the two)
//
// Framing (W3): over the right shoulder, the character a little left of center, the horizon near the
// upper third. The camera looks down by `pitch` (default 9 degrees) at a pivot at head height; the
// shoulder offset slides the camera sideways without rotating it, which puts the character left of
// center.
//
// Settings (G.settings, src/ui/settings.js): mouseSensX / mouseSensY and padSensX / padSensY, invertX / invertY,
// fovOffset (degrees), camDist (multiplier of each mode's distance; the wheel zooms around it), shoulder
// ('right' | 'left', swapped by the 'shoulder' action with an eased slide), recenter ('auto' | 'off' | 'gentle' |
// 'strong'), padRamp. The mouse gives pixels per frame; the right stick (G.input.lookPad) is integrated here with dt,
// and a held full deflection ramps up to 1.6x.
//
// Recenter: while the player runs and nothing has touched the look controls for a moment, the camera swings
// behind the direction of travel (not when she runs toward the lens). 'auto' is gentle with a pad, off with a mouse.
//
// Lock-on switching: while locked, a quick sideways flick of the mouse (or a push of the right stick) hands the
// lock to the next target on that side. Emits 'camera:retarget' { target }; 'camera:shoulder' { side }.
//
// Collision: a sphere (radius ~0.26 m) is marched from the head pivot to the wanted lens position against the
// collision world and the terrain, so corners and thin posts stop the lens. It pulls in at once and eases back
// out after a short hold, so a pole edge does not make it flutter.
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { clamp, damp, dampAngle, wrapAngle, smoothstep } from '../core/util.js';
import { enemyPos, stepTarget } from './player/lock.js';

const MODES = {
  explore: { dist: 3.5, side: 0.58, pivotH: 1.5, fov: 54, pitch: 0.16 },
  combat: { dist: 4.6, side: 0.78, pivotH: 1.55, fov: 52, pitch: 0.22 },
  mounted: { dist: 4.9, side: 0.85, pivotH: 2.35, fov: 56, pitch: 0.17 },
  interior: { dist: 2.5, side: 0.38, pivotH: 1.55, fov: 56, pitch: 0.12 },
};
const PITCH_MIN = -0.5, PITCH_MAX = 1.12;
const ZOOM_MIN = 0.55, ZOOM_MAX = 1.65;
const MOUSE_SENS = 0.0022; // radians per pixel at sensitivity 1
const PAD_YAW = 2.9, PAD_PITCH = 1.9; // radians per second at full stick, sensitivity 1
const RECENTER = { gentle: { delay: 1.5, rate: 0.55 }, strong: { delay: 0.7, rate: 1.7 } };
const FLICK_PX = 110; // mouse pixels (decaying) that count as a flick while locked on
const LENS = 0.26, LENS_TIGHT = 0.16; // collision sphere radius, and indoors

const _dir = new THREE.Vector3(), _pivot = new THREE.Vector3(), _want = new THREE.Vector3();
const _look = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0), _nd = new THREE.Vector3();
const _roll = new THREE.Quaternion(), _axis = new THREE.Vector3(0, 0, 1);

export async function init(G_) {
  const R = {
    enabled: true,
    yaw: 0,
    pitch: MODES.explore.pitch,
    mode: 'explore',
    target: null,
    zoom: 1,
    _override: null,
    focus: new THREE.Vector3(),
    cur: { ...MODES.explore },
    collK: 1,
    collHold: 0,
    sideK: G_.settings?.shoulder === 'left' ? -1 : 1,
    trauma: 0,
    decay: 0,
    prevOwner: null,
    blend: 0,
    blendPos: new THREE.Vector3(),
    blendQuat: new THREE.Quaternion(),
    blendFov: 54,
    snap: true,
    idle: 0,
    recT: 0,
    padHeld: 0,
    flickAcc: 0,
    flickCd: 0,
    stickLatch: false,
    recentering: false,
    headHidden: false,
    fovKick: 0,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    t: Math.random() * 100,

    setMode(m) { this._override = MODES[m] ? m : null; },
    setTarget(obj) { this.target = obj || null; this.flickAcc = 0; },
    shake(intensity = 0.3, seconds = 0.3) {
      this.trauma = Math.max(this.trauma, clamp(intensity, 0, 1));
      this.decay = Math.max(this.decay, this.trauma / Math.max(0.05, seconds));
    },
    snapBehind(yaw) {
      if (yaw != null) this.yaw = yaw;
      this.pitch = MODES[this.mode].pitch;
      this.snap = true;
      this.recentering = false;
      const P = G_.player;
      if (P) this.focus.copy(P.position);
    },
    recenter() { this.recentering = true; },
    forward(out = new THREE.Vector3()) {
      const cp = Math.cos(this.pitch);
      return out.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    },
    aimDir(out) { return this.forward(out); },
  };
  G_.cameraRig = R;

  const targetPos = (obj, out) => enemyPos(obj, out);

  function pickMode(P) {
    if (R._override) return R._override;
    if (P.mounted || P._mounting) return 'mounted';
    if (G_.world?.indoors?.(P.position.x, P.position.z)) return 'interior';
    if (R.target || P.state === 'combat') return 'combat';
    return 'explore';
  }

  // How far a sphere of radius r can travel from `origin` along `dir` (unit) before it meets the terrain or a
  // collider. Samples every 14 cm against one gathered candidate list, which is plenty for posts and corners.
  function castClear(origin, dir, len, r) {
    const phys = G_.physics, world = G_.world;
    if (!phys) return len;
    const cand = phys.query(origin.x + dir.x * len * 0.5, origin.z + dir.z * len * 0.5, len * 0.5 + r + 0.5);
    const step = 0.14;
    for (let t = 0.2; t <= len + 1e-4; t += step) {
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      if (world?.heightAt && py < world.heightAt(px, pz) + 0.32) return Math.max(0, t - step);
      for (let i = 0; i < cand.length; i++) {
        const it = cand[i];
        if (py + r < it.y0 || py - r > it.y1) continue;
        if (it.type === 'circle') {
          if (Math.hypot(px - it.x, pz - it.z) < it.r + r) return Math.max(0, t - step);
        } else {
          const dx = px - it.x, dz = pz - it.z;
          const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
          const cx = clamp(lx, -it.hw, it.hw), cz = clamp(lz, -it.hd, it.hd);
          if (Math.hypot(lx - cx, lz - cz) < r) return Math.max(0, t - step);
        }
      }
    }
    return len;
  }

  function update(dt) {
    const P = G_.player;
    const cam = G_.camera;
    if (!P || !cam) return;
    const owner = G_.cameraOwner;
    const owned = owner === 'rig' && R.enabled;
    const S = G_.settings;

    // Ownership change: remember where the camera was so the hand-back blends.
    if (owned && R.prevOwner !== 'rig' && R.prevOwner !== null) {
      R.blend = 1;
      R.blendPos.copy(cam.position);
      R.blendQuat.copy(cam.quaternion);
      R.blendFov = cam.fov;
    }
    R.prevOwner = owner;

    // ---- input -------------------------------------------------------------------------------
    const inp = G_.input;
    let moved = false;
    R.flickCd = Math.max(0, R.flickCd - dt);
    if (owned && inp.context === 'game' && !G_.story?.busy && P.control) {
      const invX = S?.invertX ? -1 : 1, invY = S?.invertY ? -1 : 1;
      const dx = inp.look.dx, dy = inp.look.dy;
      if (dx || dy) {
        moved = true;
        R.recentering = false;
        const sx = MOUSE_SENS * (S?.mouseSensX ?? 1) * invX, sy = MOUSE_SENS * (S?.mouseSensY ?? 1) * invY;
        if (!R.target) R.yaw = wrapAngle(R.yaw - dx * sx);
        R.pitch = clamp(R.pitch + dy * sy, PITCH_MIN, PITCH_MAX);
      }
      // The right stick: turn rate, with a ramp for a stick held near its limit.
      const lp = inp.lookPad;
      const mag = Math.hypot(lp.x, lp.y);
      if (mag > 0) {
        moved = true;
        R.recentering = false;
        R.padHeld = mag > 0.8 ? Math.min(1, R.padHeld + dt) : Math.max(0, R.padHeld - dt * 3);
        const ramp = S?.padRamp === false ? 1 : 1 + 0.6 * smoothstep(0.15, 0.7, R.padHeld);
        const sx = (S?.padSensX ?? 1) * invX * PAD_YAW * ramp, sy = (S?.padSensY ?? 1) * invY * PAD_PITCH * ramp;
        if (!R.target) R.yaw = wrapAngle(R.yaw - lp.x * sx * dt);
        R.pitch = clamp(R.pitch + lp.y * sy * dt, PITCH_MIN, PITCH_MAX);
      } else R.padHeld = 0;
      if (inp.wheel) R.zoom = clamp(R.zoom * (1 + inp.wheel * 0.12), ZOOM_MIN, ZOOM_MAX);

      // Swap shoulders: the setting changes and sideK slides to it below.
      if (inp.pressed('shoulder') && S) {
        const side = S.shoulder === 'left' ? 'right' : 'left';
        S.set('shoulder', side);
        G_.events.emit('camera:shoulder', { side });
      }

      // Lock-on: a flick hands the lock to the next target on that side.
      if (R.target) {
        R.flickAcc = R.flickAcc * Math.exp(-dt * 8) + dx;
        let dir = 0;
        if (Math.abs(lp.x) > 0.8 && !R.stickLatch) { dir = Math.sign(lp.x); R.stickLatch = true; } else if (Math.abs(lp.x) < 0.4) R.stickLatch = false;
        if (!dir && Math.abs(R.flickAcc) > FLICK_PX) dir = Math.sign(R.flickAcc);
        if (dir && R.flickCd <= 0) {
          R.flickAcc = 0;
          const next = stepTarget(P.position, R.yaw, R.target, dir);
          if (next && next !== R.target) {
            R.flickCd = 0.45;
            P.setTarget(next);
            G_.audio?.sfx?.('ui_hover', { volume: 0.4 });
            G_.events.emit('camera:retarget', { target: next });
          }
        }
      } else { R.flickAcc = 0; R.stickLatch = false; }
    }
    R.idle = moved ? 0 : R.idle + dt;

    // ---- mode and parameters ---------------------------------------------------------------
    R.mode = pickMode(P);
    const M = MODES[R.mode];
    const k = R.snap ? 1 : 1 - Math.exp(-3.2 * dt);
    const cur = R.cur;
    let distGoal = M.dist * (R.mode === 'combat' ? 1 : R.zoom) * (S?.camDist ?? 1);
    let fovGoal = M.fov + (S?.fovOffset ?? 0);
    if (R.mode === 'mounted') {
      const sp = G_.horse?.speed ?? 0;
      fovGoal += clamp(sp / 9.5, 0, 1) * 9;
    } else if (P.loco?.sprinting) fovGoal += 3;
    R.sideK = R.snap ? (S?.shoulder === 'left' ? -1 : 1) : damp(R.sideK, S?.shoulder === 'left' ? -1 : 1, 5.5, dt);

    // Lock-on: the camera swings to look at the target and pulls back to keep both in frame.
    let focusLerp = 0, tall = 0;
    const tgt = R.target;
    const rcMode = S?.recenter === 'auto' || !S?.recenter ? (inp.device === 'pad' ? 'gentle' : 'off') : S.recenter;
    const vel = P.velocity;
    const travelling = owned && P.control && inp.context === 'game' && !G_.story?.busy && R.mode !== 'mounted'
      && !!vel && Math.hypot(vel.x, vel.z) > 1.2 && R.idle > 0;
    R.recT = travelling && rcMode !== 'off' ? R.recT + dt : 0;
    if (tgt) {
      const tp = targetPos(tgt, _look);
      const dx = tp.x - P.position.x, dz = tp.z - P.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) R.yaw = dampAngle(R.yaw, Math.atan2(dx, dz), R.snap ? 100 : 4.2, dt);
      // Tall targets (the boss is about 4.5 m) need a level camera, more distance and a higher
      // pivot, or the frame cuts her off at the waist.
      tall = clamp(((tgt.height ?? 1.8) - 2.2) / 3, 0, 1);
      R.pitch = damp(R.pitch, M.pitch + clamp(d * 0.012, 0, 0.1) - tall * 0.2, 2.2, dt);
      distGoal += clamp(d * 0.32, 0, 3.4) + tall * 2.2;
      focusLerp = 0.26;
    } else if (R.recentering) {
      R.yaw = dampAngle(R.yaw, P.yaw, 6, dt);
      if (Math.abs(wrapAngle(R.yaw - P.yaw)) < 0.02) R.recentering = false;
    } else if (R.mode === 'mounted' && R.idle > 1.2 && (G_.horse?.speed ?? 0) > 2 && Math.abs(inp.move.x) < 0.2) {
      // Riding with the mouse idle: drift behind the horse so roads are followable without the mouse.
      R.yaw = dampAngle(R.yaw, P.yaw, 1.1, dt);
      R.pitch = damp(R.pitch, M.pitch, 0.8, dt);
    } else if (rcMode !== 'off' && R.recT > RECENTER[rcMode].delay) {
      // On foot with the look controls untouched: swing behind where she is heading, unless she is
      // running toward the lens (then the camera would have to spin the whole way round).
      const travel = Math.atan2(vel.x, vel.z);
      const w = 1 - smoothstep(1.1, 2.2, Math.abs(wrapAngle(travel - R.yaw)));
      const rate = RECENTER[rcMode].rate * w;
      if (rate > 0) {
        R.yaw = dampAngle(R.yaw, travel, rate, dt);
        R.pitch = damp(R.pitch, M.pitch, rate * 0.5, dt);
      }
    }

    cur.dist += (distGoal - cur.dist) * k;
    cur.side += (M.side - cur.side) * k;
    cur.pivotH += (M.pivotH + tall * 0.9 - cur.pivotH) * k;
    cur.fov += (fovGoal - cur.fov) * (R.snap ? 1 : 1 - Math.exp(-(R.mode === 'mounted' ? 2.2 : 3.2) * dt));

    // ---- follow with lag ---------------------------------------------------------------------
    const gx = P.position.x + (tgt ? (targetPos(tgt, _look).x - P.position.x) * focusLerp : 0);
    const gz = P.position.z + (tgt ? (targetPos(tgt, _look).z - P.position.z) * focusLerp : 0);
    const lam = R.mode === 'mounted' ? 10 : 13;
    if (R.snap) R.focus.set(gx, P.position.y, gz);
    else {
      R.focus.x = damp(R.focus.x, gx, lam, dt);
      R.focus.z = damp(R.focus.z, gz, lam, dt);
      R.focus.y = damp(R.focus.y, P.position.y, 7, dt);
    }

    // ---- compose -----------------------------------------------------------------------------
    R.forward(_dir);
    const rx = -Math.cos(R.yaw), rz = Math.sin(R.yaw);
    _pivot.set(R.focus.x, R.focus.y + cur.pivotH, R.focus.z);
    _want.copy(_pivot).addScaledVector(_dir, -cur.dist);
    _want.x += rx * cur.side * R.sideK;
    _want.z += rz * cur.side * R.sideK;

    // Collision: pull in at once when something is between the head and the camera, ease back out after a
    // short hold so a pole edge does not make the lens flutter.
    _nd.copy(_want).sub(_pivot);
    const len = _nd.length();
    if (len > 1e-3 && G_.physics) {
      _nd.multiplyScalar(1 / len);
      const free = castClear(_pivot, _nd, len, R.mode === 'interior' ? LENS_TIGHT : LENS);
      const kk = free < len ? clamp((free - 0.04) / len, 0.18, 1) : 1;
      if (kk < R.collK || R.snap) { R.collK = kk; R.collHold = 0.25; } else {
        R.collHold = Math.max(0, R.collHold - dt);
        if (R.collHold <= 0) R.collK = damp(R.collK, kk, 3.2, dt);
      }
      _want.copy(_pivot).addScaledVector(_nd, len * R.collK);
    }
    if (G_.world?.heightAt) {
      // The lens is a few centimetres wide: keep every edge of it above the ground.
      const w = G_.world, e = 0.35;
      const gy = Math.max(w.heightAt(_want.x, _want.z), w.heightAt(_want.x + e, _want.z), w.heightAt(_want.x - e, _want.z), w.heightAt(_want.x, _want.z + e), w.heightAt(_want.x, _want.z - e)) + 0.4;
      if (_want.y < gy) _want.y = gy;
    }

    // Shake.
    let roll = 0;
    if (R.trauma > 0) {
      R.t += dt * 38;
      const a = R.trauma * R.trauma;
      _want.x += Math.sin(R.t * 1.31) * 0.14 * a;
      _want.y += Math.sin(R.t * 1.77 + 2) * 0.14 * a;
      _want.z += Math.sin(R.t * 1.13 + 5) * 0.14 * a;
      roll = Math.sin(R.t * 1.51 + 1) * 0.012 * a;
      R.trauma = Math.max(0, R.trauma - R.decay * dt);
      if (R.trauma <= 0) R.decay = 0;
    }

    // Do not let the lens sit inside her head: hide the body mesh when the camera is that close.
    const headD = _want.distanceTo(_pivot);
    const hide = owned && headD < 0.95;
    if (hide !== R.headHidden && P.character?.mesh) {
      P.character.mesh.visible = !hide;
      R.headHidden = hide;
    }

    _look.copy(_want).add(_dir);
    _m.lookAt(_want, _look, _up);
    _q.setFromRotationMatrix(_m);
    if (roll) _q.multiply(_roll.setFromAxisAngle(_axis, roll));
    R.pos.copy(_want);
    R.quat.copy(_q);

    if (!owned) { R.snap = false; return; }

    if (R.blend > 0) {
      R.blend = Math.max(0, R.blend - dt / 0.9);
      const e = smoothstep(0, 1, R.blend);
      cam.position.lerpVectors(R.pos, R.blendPos, e);
      cam.quaternion.slerpQuaternions(R.quat, R.blendQuat, e);
      const fov = cur.fov + (R.blendFov - cur.fov) * e;
      if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    } else {
      cam.position.copy(R.pos);
      cam.quaternion.copy(R.quat);
      if (Math.abs(cam.fov - cur.fov) > 1e-3) { cam.fov = cur.fov; cam.updateProjectionMatrix(); }
    }
    cam.up.set(0, 1, 0);
    R.snap = false;
  }

  G_.addSystem('camera-rig', update, ORDER.camera);

  const P = G_.player;
  if (P) R.snapBehind(P.yaw);
}
