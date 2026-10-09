// Locomotion cycles baked from foot trajectories with two-bone leg IK on the reference body,
// so feet plant without sliding when playback rate = speed / stride. Phase 0 = left heel strike.
// Gait shape: heel rocker -> flat foot -> ball rocker (toe-off) -> arcing swing; pelvis bob,
// sway, yaw and drop; counter-rotating chest; arms swing opposite with lagging forearms.
import { measure, legJoints } from '../rig.js';
import { bakeFn, mergePose, NEUTRAL } from './pose.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const REF = measure({ sex: 'm', height: 1.76 });
export const REF_HIP_Y = REF.hipJY;
const LJ = legJoints(REF, 1);
const L1 = LJ.hip.distanceTo(LJ.knee), L2 = LJ.knee.distanceTo(LJ.ankle);
const TH1B = Math.atan2(LJ.knee.z - LJ.hip.z, LJ.hip.y - LJ.knee.y);
const TH2B = Math.atan2(LJ.ankle.z - LJ.knee.z, LJ.knee.y - LJ.ankle.y);
const ANK = LJ.ankle.y; // ankle height above the sole
const HEEL = 0.056, BALL = 0.14;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// rotate (y, z) by pitch psi (toes up positive)
const rot = (y, z, psi) => [y * Math.cos(psi) + z * Math.sin(psi), z * Math.cos(psi) - y * Math.sin(psi)];

// Two-bone IK in the sagittal plane. Returns semantic degrees for thigh, shin, foot.
export function legIK(hip, ank, psi, side, sgn) {
  const dy = hip.y - ank.y, dz = ank.z - hip.z;
  let d = Math.hypot(dy, dz);
  d = Math.min(d, (L1 + L2) * 0.9995);
  const g = Math.atan2(dz, dy);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const b = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const th1 = g + a, kn = Math.PI - b, th2 = th1 - kn;
  const kb = TH1B - TH2B;
  const sideA = Math.atan2((ank.x - hip.x) * sgn, dy);
  return {
    thigh: [(th1 - TH1B) * R2D, 0, sideA * R2D + side],
    shin: [(kn - kb) * R2D, 0, 0],
    foot: [(psi - (th2 - TH2B)) * R2D, 0, -sideA * R2D * 0.5],
  };
}

// Foot state for local phase p in [0,1): returns ankle {y, z} and pitch psi (rad).
function footAt(p, g) {
  const B = g.beta;
  const Db = g.D * B;
  const flat = (s) => g.a0 - Db * s;
  if (p < B) {
    const s = p / B;
    const az = flat(s);
    if (s < g.hs) {
      const psi = lerp(g.psiHs, 0, sstep(0, g.hs, s)) ;
      const heelZ = az - HEEL;
      const [oy, oz] = rot(ANK, HEEL, psi);
      return { y: oy, z: heelZ + oz, psi, toe: 0 };
    }
    if (s < g.to) return { y: ANK, z: az, psi: 0, toe: 0 };
    const u = (s - g.to) / (1 - g.to);
    const psi = -g.psiTo * Math.pow(u, 1.4);
    const ballZ = az + BALL;
    const [oy, oz] = rot(ANK, -BALL, psi);
    return { y: oy, z: ballZ + oz, psi, toe: -psi };
  }
  // swing from toe-off to the next heel strike
  const u = (p - B) / (1 - B);
  const end = footAt(B - 1e-6, g), start = footAt(0, g);
  const zt = start.z, zf = end.z;
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const z = lerp(zf, zt, sstep(0, 1, Math.pow(u, g.swingShape ?? 1)) * 0.6 + e * 0.4);
  const lift = g.lift * Math.pow(Math.sin(Math.PI * Math.pow(u, g.liftSkew ?? 0.8)), 1.2);
  const y = lerp(end.y, start.y, u) + lift;
  const psi = lerp(-g.psiTo, -g.psiMid, sstep(0, 0.35, u)) * (1 - sstep(0.35, 0.95, u)) + g.psiHs * sstep(0.55, 1, u);
  return { y, z, psi, toe: Math.max(0, g.psiTo * (1 - sstep(0, 0.25, u))) };
}

function gaitPose(phi, g) {
  const t = phi * Math.PI * 2;
  const bob = g.bobBase + g.bob * Math.cos(2 * (t - Math.PI * 2 * g.bobPeak));
  const sway = g.sway * Math.cos(t - Math.PI * 2 * 0.3);
  const yaw = -g.yaw * Math.cos(t);
  const roll = g.roll * Math.cos(t - Math.PI * 2 * 0.8);
  const hipY = REF.hipJY + bob;
  const pose = { $hips: [sway, bob, 0] };
  for (const [sgn, S, off] of [[1, 'L', 0], [-1, 'R', 0.5]]) {
    const p = (phi + off) % 1;
    const f = footAt(p, g);
    const hip = { x: sgn * REF.hipJX + sway, y: hipY, z: sgn * REF.hipJX * Math.sin(yaw * D2R) * -1 };
    const ank = { x: sgn * g.width + sway * 0.3, y: f.y, z: f.z };
    const ik = legIK(hip, ank, f.psi, g.legOut ?? 0, sgn);
    ik.thigh[1] = 3;
    pose['thigh' + S] = ik.thigh;
    pose['shin' + S] = ik.shin;
    pose['foot' + S] = ik.foot;
    pose['toe' + S] = [f.toe * R2D * 0.8, 0, 0];
  }
  pose.hips = [g.pelvisTilt, yaw, roll];
  pose.spine = [g.lean * 0.5, -yaw * 0.6, -roll * 0.6];
  pose.chest = [g.lean * 0.5 + g.bob * 30 * Math.cos(2 * t), -yaw * 0.75, -roll * 0.3];
  pose.neck = [-g.lean * 0.4, yaw * 0.2, roll * 0.3];
  pose.head = [-g.lean * 0.45 - g.bob * 20 * Math.cos(2 * t), yaw * 0.15, roll * 0.25];
  // arms swing opposite to the legs; forearms lag
  for (const [S, off] of [['L', 0.5], ['R', 0]]) {
    const sw = Math.cos(t - Math.PI * 2 * off);
    const lag = Math.cos(t - Math.PI * 2 * (off + g.armLag));
    pose['arm' + S] = [g.armBias + g.arm * sw, 8 + g.armTwist, -26 + g.armOut];
    pose['forearm' + S] = [g.elbow + g.elbowSwing * Math.max(0, lag) + g.elbowSwing * 0.3 * lag, 10, 0];
    pose['hand' + S] = [10 + g.handFlex, 0, 4];
    pose['shoulder' + S] = [g.arm * 0.12 * sw, 0, -2 + g.shrug];
    pose['fingers' + S] = [g.fist, 0, 0];
    pose['fingers2' + S] = [g.fist * 1.2, 0, 0];
    pose['thumb' + S] = [g.fist * 0.6, 0, 0];
  }
  return pose;
}

const GAITS = {
  walk: { D: 1.3, T: 1.0, beta: 0.6, a0: 0.27, hs: 0.14, to: 0.55, psiHs: 14 * D2R, psiTo: 32 * D2R, psiMid: 12 * D2R, lift: 0.07, liftSkew: 0.7,
    bobBase: -0.022, bob: 0.014, bobPeak: 0.3, sway: 0.018, yaw: 5, roll: 3, pelvisTilt: 2, lean: 3,
    arm: 13, armBias: 2, armLag: 0.06, armTwist: 0, armOut: 0, elbow: 14, elbowSwing: 12, handFlex: 0, shrug: 0, fist: 18, width: 0.07 },
  run: { D: 2.5, T: 0.7, beta: 0.32, a0: 0.26, hs: 0.1, to: 0.45, psiHs: 8 * D2R, psiTo: 38 * D2R, psiMid: 30 * D2R, lift: 0.26, liftSkew: 0.55, swingShape: 1.3,
    bobBase: -0.05, bob: 0.03, bobPeak: 0.66, sway: 0.01, yaw: 8, roll: 3, pelvisTilt: 6, lean: 9,
    arm: 30, armBias: 14, armLag: 0.04, armTwist: 10, armOut: 6, elbow: 82, elbowSwing: 18, handFlex: 6, shrug: 2, fist: 55, width: 0.05 },
  sprint: { D: 3.6, T: 0.6, beta: 0.24, a0: 0.25, hs: 0.06, to: 0.4, psiHs: 4 * D2R, psiTo: 42 * D2R, psiMid: 40 * D2R, lift: 0.38, liftSkew: 0.5, swingShape: 1.4,
    bobBase: -0.055, bob: 0.032, bobPeak: 0.62, sway: 0.008, yaw: 9, roll: 3, pelvisTilt: 9, lean: 16,
    arm: 46, armBias: 18, armLag: 0.035, armTwist: 12, armOut: 5, elbow: 88, elbowSwing: 22, handFlex: 4, shrug: 3, fist: 70, width: 0.04 },
  walk_cold: { D: 1.0, T: 0.82, beta: 0.62, a0: 0.21, hs: 0.12, to: 0.58, psiHs: 10 * D2R, psiTo: 26 * D2R, psiMid: 10 * D2R, lift: 0.055, liftSkew: 0.7,
    bobBase: -0.03, bob: 0.012, bobPeak: 0.3, sway: 0.026, yaw: 3, roll: 4, pelvisTilt: 3, lean: 6,
    arm: 0, armBias: 0, armLag: 0, armTwist: 0, armOut: 0, elbow: 0, elbowSwing: 0, handFlex: 0, shrug: 0, fist: 30, width: 0.065 },
};

// Arms wrapped around the body against the cold, shoulders up, head down.
export const COLD_UPPER = {
  shoulderL: [10, 0, 9], shoulderR: [10, 0, 9],
  armL: [34, 52, -36], armR: [30, 48, -34],
  forearmL: [112, 30, -8], forearmR: [118, 32, -6],
  handL: [10, 20, 0], handR: [12, 20, 0],
  fingersL: [30, 0, 0], fingersR: [30, 0, 0], fingers2L: [30, 0, 0], fingers2R: [30, 0, 0],
};

export function buildLocomotion(lib) {
  for (const name of ['walk', 'run', 'sprint']) {
    const g = GAITS[name];
    lib[name] = bakeFn({ name, dur: g.T, loop: true, stride: g.D, refSpeed: g.D / g.T }, (u) => gaitPose(u, g));
  }
  const gc = GAITS.walk_cold;
  lib.walk_cold = bakeFn({ name: 'walk_cold', dur: gc.T, loop: true, stride: gc.D, refSpeed: gc.D / gc.T }, (u) => {
    const p = gaitPose(u, gc);
    const t = u * Math.PI * 2;
    return mergePose(p, COLD_UPPER, {
      spine: [9, p.spine[1], p.spine[2]], chest: [9, p.chest[1] * 0.5, 0], neck: [8, 0, 0],
      head: [-8 + 2 * Math.cos(2 * t), p.head[1], p.head[2]],
      armL: [COLD_UPPER.armL[0] + 2 * Math.cos(t), COLD_UPPER.armL[1], COLD_UPPER.armL[2]],
      armR: [COLD_UPPER.armR[0] - 2 * Math.cos(t), COLD_UPPER.armR[1], COLD_UPPER.armR[2]],
    });
  });

  // Idle: weight settled on the left leg, slow shift, contrapposto; breathing is procedural.
  lib.idle = bakeFn({ name: 'idle', dur: 6, loop: true }, (u) => {
    const t = u * Math.PI * 2;
    const w = 0.5 + 0.5 * Math.cos(t); // 1 = weight left, 0 = weight right
    const sx = lerp(-0.016, 0.016, w);
    const drop = 1.8 * (w * 2 - 1);
    return standPose(sx, drop, w, t, {});
  });
  lib.idle_cold = bakeFn({ name: 'idle_cold', dur: 2.4, loop: true }, (u) => {
    const t = u * Math.PI * 2;
    const w = 0.5 + 0.5 * Math.cos(t);
    const sx = lerp(-0.02, 0.02, w);
    const bounce = 0.006 * Math.abs(Math.sin(t));
    const p = standPose(sx, 2.5 * (w * 2 - 1), w, t, { knee: 8, lean: 10 });
    p.$hips[1] -= 0.012 + bounce;
    return mergePose(p, COLD_UPPER, {
      spine: [8, 0, p.spine[2]], chest: [9, 0, 0], neck: [9, 0, 0], head: [-10, 2 * Math.sin(t), 0],
      armL: [COLD_UPPER.armL[0] + 3 * Math.sin(t * 2), COLD_UPPER.armL[1], COLD_UPPER.armL[2]],
      forearmR: [COLD_UPPER.forearmR[0] + 4 * Math.sin(t * 2 + 1), COLD_UPPER.forearmR[1], COLD_UPPER.forearmR[2]],
    });
  });
  lib.combat_idle = bakeFn({ name: 'combat_idle', dur: 2.2, loop: true }, (u) => {
    const t = u * Math.PI * 2;
    const b = Math.sin(t);
    return combatGuard(b, t);
  });
}

// Standing pose with weight shift w (1 left, 0 right) solved with leg IK so feet stay put.
export function standPose(sx, drop, w, t, o) {
  const knee = o.knee ?? 4;
  const lean = o.lean ?? 1.5;
  const hipY = REF.hipJY - 0.008 - (o.down ?? 0);
  const pose = { $hips: [sx, hipY - REF.hipJY, 0] };
  for (const [sgn, S] of [[1, 'L'], [-1, 'R']]) {
    const load = sgn > 0 ? w : 1 - w;
    const hipH = hipY + (sgn > 0 ? 1 : -1) * Math.sin(drop * D2R) * REF.hipJX;
    const extraBend = (1 - load) * knee * 0.004;
    const ank = { x: sgn * 0.11, y: ANK + (1 - load) * 0.006, z: (sgn > 0 ? 0.01 : -0.035) + extraBend * 0 };
    const hip = { x: sgn * REF.hipJX + sx, y: hipH - extraBend, z: 0 };
    const ik = legIK(hip, ank, 0, 0, sgn);
    pose['thigh' + S] = [ik.thigh[0], 6 + (sgn > 0 ? 0 : 4), ik.thigh[2]];
    pose['shin' + S] = ik.shin;
    pose['foot' + S] = [ik.foot[0], sgn > 0 ? 0 : 6, ik.foot[2]];
  }
  pose.hips = [lean * 0.4, 1.5 * Math.sin(t * 0.5), -drop];
  pose.spine = [lean * 0.4, -1 * Math.sin(t * 0.5), drop * 0.6];
  pose.chest = [lean * 0.4, -0.6 * Math.sin(t * 0.5), drop * 0.5];
  pose.neck = [0, 0.5 * Math.sin(t), -drop * 0.3];
  pose.head = [-lean * 0.6, 1.5 * Math.sin(t * 0.5 + 0.7), -drop * 0.4];
  pose.armL = [4 + Math.sin(t) * 1.2, 8, -26 + drop * 0.6];
  pose.armR = [4 - Math.sin(t) * 1.2, 8, -26 - drop * 0.6];
  pose.forearmL = [14, 12, 0]; pose.forearmR = [16, 12, 0];
  return mergePose(NEUTRAL, pose);
}

// Sword guard stance, sword in the right hand, left hand open for signs. b in -1..1 sway.
export function combatGuard(b = 0, t = 0) {
  const sx = 0.012 * b;
  const p = standPose(sx, 1.5 * b, 0.5 + 0.3 * b, t, { knee: 14, lean: 7, down: 0.06 });
  // wider, staggered stance: left foot forward
  p.thighL = [p.thighL[0] + 16, 10, p.thighL[2] + 4];
  p.shinL = [p.shinL[0] + 12, 0, 0];
  p.footL = [p.footL[0] - 4, 8, 0];
  p.thighR = [p.thighR[0] - 12, 20, p.thighR[2] + 5];
  p.shinR = [p.shinR[0] + 18, 0, 0];
  p.footR = [p.footR[0] - 2, 22, 0];
  p.hips = [6, -28, 0];
  p.spine = [6, 8 + b, 0];
  p.chest = [4, 10, 0];
  p.neck = [0, 4, 0];
  p.head = [-6, 6, 0];
  return mergePose(p, {
    shoulderR: [6, 0, 2], armR: [30, 20, -12], forearmR: [72, -30, 0], handR: [-20, -10, 18],
    fingersR: [80, 0, 0], fingers2R: [90, 0, 0], thumbR: [50, 0, 0],
    shoulderL: [8, 0, 0], armL: [28, 10, -8 + b], forearmL: [58, 20, 0], handL: [-10, 0, 6],
    fingersL: [20, 0, 0], fingers2L: [25, 0, 0],
  });
}
