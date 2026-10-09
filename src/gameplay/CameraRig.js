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
//
// Framing (W3): over the right shoulder, the character a little left of center, the horizon near the
// upper third. The camera looks down by `pitch` (default 9 degrees) at a pivot at head height; the
// shoulder offset slides the camera sideways without rotating it, which puts the character left of
// center. Mouse look is multiplied by G.settings.mouseSens and honors G.settings.invertY.
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { clamp, damp, dampAngle, wrapAngle, smoothstep } from '../core/util.js';
import { enemyPos } from './player/lock.js';

const MODES = {
  explore: { dist: 3.5, side: 0.58, pivotH: 1.5, fov: 54, pitch: 0.16 },
  combat: { dist: 4.6, side: 0.78, pivotH: 1.55, fov: 52, pitch: 0.22 },
  mounted: { dist: 5.4, side: 0.85, pivotH: 2.45, fov: 56, pitch: 0.17 },
  interior: { dist: 2.5, side: 0.38, pivotH: 1.55, fov: 56, pitch: 0.12 },
};
const PITCH_MIN = -0.5, PITCH_MAX = 1.12;
const ZOOM_MIN = 0.55, ZOOM_MAX = 1.65;

const _dir = new THREE.Vector3(), _pivot = new THREE.Vector3(), _want = new THREE.Vector3();
const _look = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0), _nd = new THREE.Vector3();

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
    trauma: 0,
    decay: 0,
    prevOwner: null,
    blend: 0,
    blendPos: new THREE.Vector3(),
    blendQuat: new THREE.Quaternion(),
    blendFov: 54,
    snap: true,
    idle: 0,
    recentering: false,
    headHidden: false,
    fovKick: 0,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    t: Math.random() * 100,

    setMode(m) { this._override = MODES[m] ? m : null; },
    setTarget(obj) { this.target = obj || null; },
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

  function update(dt) {
    const P = G_.player;
    const cam = G_.camera;
    if (!P || !cam) return;
    const owner = G_.cameraOwner;
    const owned = owner === 'rig' && R.enabled;

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
    if (owned && inp.context === 'game' && !G_.story?.busy && P.control) {
      const sens = 0.0022 * (G_.settings?.mouseSens ?? 1);
      const inv = G_.settings?.invertY ? -1 : 1;
      const dx = inp.look.dx, dy = inp.look.dy;
      if (dx || dy) {
        moved = true;
        R.recentering = false;
        if (!R.target) R.yaw = wrapAngle(R.yaw - dx * sens);
        R.pitch = clamp(R.pitch + dy * sens * inv, PITCH_MIN, PITCH_MAX);
      }
      if (inp.wheel) R.zoom = clamp(R.zoom * (1 + inp.wheel * 0.12), ZOOM_MIN, ZOOM_MAX);
    }
    R.idle = moved ? 0 : R.idle + dt;

    // ---- mode and parameters ---------------------------------------------------------------
    R.mode = pickMode(P);
    const M = MODES[R.mode];
    const k = R.snap ? 1 : 1 - Math.exp(-3.2 * dt);
    const cur = R.cur;
    let distGoal = M.dist * (R.mode === 'combat' ? 1 : R.zoom);
    let fovGoal = M.fov;
    if (R.mode === 'mounted') {
      const sp = G_.horse?.speed ?? 0;
      fovGoal += clamp(sp / 9.5, 0, 1) * 9;
    } else if (P.loco?.sprinting) fovGoal += 3;

    // Lock-on: the camera swings to look at the target and pulls back to keep both in frame.
    let focusLerp = 0;
    const tgt = R.target;
    if (tgt) {
      const tp = targetPos(tgt, _look);
      const dx = tp.x - P.position.x, dz = tp.z - P.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) R.yaw = dampAngle(R.yaw, Math.atan2(dx, dz), R.snap ? 100 : 4.2, dt);
      R.pitch = damp(R.pitch, M.pitch + clamp(d * 0.012, 0, 0.1), 2.2, dt);
      distGoal += clamp(d * 0.32, 0, 3.4);
      focusLerp = 0.26;
    } else if (R.recentering) {
      R.yaw = dampAngle(R.yaw, P.yaw, 6, dt);
      if (Math.abs(wrapAngle(R.yaw - P.yaw)) < 0.02) R.recentering = false;
    } else if (R.mode === 'mounted' && R.idle > 1.2 && (G_.horse?.speed ?? 0) > 2 && Math.abs(inp.move.x) < 0.2) {
      // Riding with the mouse idle: drift behind the horse so roads are followable without the mouse.
      R.yaw = dampAngle(R.yaw, P.yaw, 1.1, dt);
      R.pitch = damp(R.pitch, M.pitch, 0.8, dt);
    }

    cur.dist += (distGoal - cur.dist) * k;
    cur.side += (M.side - cur.side) * k;
    cur.pivotH += (M.pivotH - cur.pivotH) * k;
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
    _want.x += rx * cur.side;
    _want.z += rz * cur.side;

    // Collision: pull in at once when something is between the head and the camera, ease back out.
    _nd.copy(_want).sub(_pivot);
    const len = _nd.length();
    if (len > 1e-3 && G_.physics) {
      _nd.multiplyScalar(1 / len);
      const free = G_.physics.raycast(_pivot, _nd, len);
      const kk = free < len ? clamp((free - 0.3) / len, 0.18, 1) : 1;
      R.collK = kk < R.collK || R.snap ? kk : damp(R.collK, kk, 4, dt);
      _want.copy(_pivot).addScaledVector(_nd, len * R.collK);
    }
    if (G_.world?.heightAt) {
      const gy = G_.world.heightAt(_want.x, _want.z) + 0.4;
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
    if (roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_dir.set(0, 0, 1), roll));
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
