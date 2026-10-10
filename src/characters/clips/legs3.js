// A three-dimensional leg solver for gait authoring.
//
// locomotion.js legIK is a two-bone solve in the sagittal plane, which is right for walking forward and for a guard
// stance but cannot put a foot out to the side or turn a toe. This one takes the ankle anywhere in root space and the
// foot's world orientation, and answers in the semantic angles of pose.js (thigh, shin and foot as [flex, twist,
// side]) with the pelvis pose (`$hips` and `hips`) included exactly, so a gait can be written as "put this ankle here,
// toes pointing there" while the pelvis bobs, rolls and yaws.
//
//   solveLeg(pose, 'L' | 'R', ankle: [x, y, z], { pole: [x, y, z], yaw, pitch, roll }) -> { thigh, shin, foot }
//   legFK(pose, 'L' | 'R') -> { thigh, knee, ankle, ball, footQ }       root-space positions for a pose (tests, planting)
//
// Everything is on the reference body (1.76 m); the animator scales the pelvis offsets by leg length at runtime.
import * as THREE from 'three';
import { measure, buildSkeleton } from '../rig.js';
import { semToQuat } from './pose.js';

const REF = measure({ sex: 'm', height: 1.76 });
const RIG = buildSkeleton(REF, {});
const LOCAL = {};
for (const b of RIG.bones) LOCAL[b.name] = b.position.clone();
const HIPS_BIND = RIG.world.hips.clone();
const D = Math.PI / 180;
export const ANKLE_H = RIG.world.footL.y;
export const FOOT_BALL = LOCAL.toeL.clone(); // ball of the foot relative to the ankle, bind pose

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();

const rotX = (k, out = new THREE.Quaternion()) => out.setFromAxisAngle(new THREE.Vector3(1, 0, 0), k);

// Semantic degrees of a thigh or foot quaternion (the inverse of semToQuat for those bones).
function toSem(q, S) {
  const s = S === 'R' ? -1 : 1;
  _e.setFromQuaternion(q, 'XZY');
  return [-_e.x / D, s * _e.y / D, s * _e.z / D];
}

function hipsFrame(pose) {
  const q = semToQuat('hips', pose.hips || [0, 0, 0], new THREE.Quaternion());
  const p = HIPS_BIND.clone();
  if (pose.$hips) p.add(new THREE.Vector3(...pose.$hips));
  return { q, p };
}

// Forward kinematics of one leg for a pose (root space).
export function legFK(pose, S) {
  const { q: qh, p: ph } = hipsFrame(pose);
  const thigh = ph.clone().add(LOCAL['thigh' + S].clone().applyQuaternion(qh));
  const qt = qh.clone().multiply(semToQuat('thigh' + S, pose['thigh' + S] || [0, 0, 0], new THREE.Quaternion()));
  const knee = thigh.clone().add(LOCAL['shin' + S].clone().applyQuaternion(qt));
  const qs = qt.clone().multiply(semToQuat('shin' + S, pose['shin' + S] || [0, 0, 0], new THREE.Quaternion()));
  const ankle = knee.clone().add(LOCAL['foot' + S].clone().applyQuaternion(qs));
  const qf = qs.clone().multiply(semToQuat('foot' + S, pose['foot' + S] || [0, 0, 0], new THREE.Quaternion()));
  const ball = ankle.clone().add(LOCAL['toe' + S].clone().applyQuaternion(qf));
  return { thigh, knee, ankle, ball, footQ: qf };
}

// Shin flexion that makes the hip-to-ankle distance equal d.
function kneeFlex(b1, b2, d) {
  const len = (k) => b1.clone().add(b2.clone().applyQuaternion(rotX(k, _q))).length();
  const lo = 0, hi = 170 * D;
  const dMax = len(lo), dMin = len(hi);
  const t = Math.min(dMax * 0.9997, Math.max(dMin, d));
  let a = lo, b = hi;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (len(m) > t) a = m; else b = m;
  }
  return (a + b) / 2;
}

// Ankle target in root space, pole = the way the knee should point (a vector, not a position). The foot is set
// level by default: toes along `yaw` (radians about +Y, positive turns toward the character's left), `pitch` toes up,
// `roll` the outer edge up.
export function solveLeg(pose, S, ankle, o = {}) {
  const s = S === 'L' ? 1 : -1;
  const { q: qh, p: ph } = hipsFrame(pose);
  const thigh = ph.clone().add(LOCAL['thigh' + S].clone().applyQuaternion(qh));
  const T = new THREE.Vector3(...ankle).sub(thigh);
  const b1 = LOCAL['shin' + S], b2 = LOCAL['foot' + S];
  const k = kneeFlex(b1, b2, T.length());
  const v = b1.clone().add(b2.clone().applyQuaternion(rotX(k, _q)));
  const That = T.clone().normalize();
  // swing the thigh frame so the hip-ankle chord points at the target...
  const q0 = new THREE.Quaternion().setFromUnitVectors(v.clone().normalize(), That);
  // ...then turn it about that chord until the knee leans toward the pole
  const pole = new THREE.Vector3(...(o.pole || [s * 0.15, 0, 1])).normalize();
  const knee0 = b1.clone().applyQuaternion(q0);
  const perp = (a) => a.clone().sub(That.clone().multiplyScalar(a.dot(That)));
  const kp = perp(knee0), pp = perp(pole);
  let qt = q0;
  if (kp.lengthSq() > 1e-10 && pp.lengthSq() > 1e-10) {
    kp.normalize(); pp.normalize();
    const ang = Math.atan2(That.dot(new THREE.Vector3().crossVectors(kp, pp)), kp.dot(pp));
    qt = new THREE.Quaternion().setFromAxisAngle(That, ang).multiply(q0);
  }
  const thighLocal = qh.clone().invert().multiply(qt);
  // foot: yaw outermost, then pitch (toes up), then roll about the toe axis
  const qfw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw ?? 0)
    .multiply(rotX(-(o.pitch ?? 0), _q2))
    .multiply(_q3.setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * (o.roll ?? 0)));
  const qs = qt.clone().multiply(rotX(k, new THREE.Quaternion()));
  const footLocal = qs.invert().multiply(qfw);
  return { thigh: toSem(thighLocal, S), shin: [k / D, 0, 0], foot: toSem(footLocal, S) };
}
