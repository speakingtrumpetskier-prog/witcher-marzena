// Authoring helpers for clips: forward kinematics of the reference body and an arm reach
// solver, so poses can be written as "put the right hand here" instead of guessing angles.
// Also shared pose fragments (stand, hand shapes).
import * as THREE from 'three';
import { measure, buildSkeleton } from '../rig.js';
import { semToQuat, mergePose, NEUTRAL } from './pose.js';
import { standPose } from './locomotion.js';

export const REF = measure({ sex: 'm', height: 1.76 });
const RIG = buildSkeleton(REF, {});
const LOCAL = {};
for (const b of RIG.bones) LOCAL[b.name] = b.position.clone();
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);

// World (root space) positions of the arm joints for a pose.
export function armFK(pose, S) {
  const chain = ['hips', 'spine', 'chest', 'shoulder' + S, 'arm' + S, 'forearm' + S, 'hand' + S, 'fingers' + S];
  const out = {};
  _m.identity();
  for (const b of chain) {
    const p = LOCAL[b].clone();
    if (b === 'hips' && pose.$hips) p.add(new THREE.Vector3(...pose.$hips));
    semToQuat(b, pose[b] || [0, 0, 0], _q);
    _l.compose(p, b === 'fingers' + S ? new THREE.Quaternion() : _q, _one);
    _m.multiply(_l);
    out[b] = new THREE.Vector3().setFromMatrixPosition(_m);
  }
  return { shoulder: out['arm' + S], elbow: out['forearm' + S], wrist: out['hand' + S], knuckle: out['fingers' + S] };
}

// Solve arm + forearm so the wrist reaches target (root space, reference body).
// opts: { elbow: Vector3 hint for the elbow direction, twist (fixed), grip: use knuckles }
export function reachArm(pose, S, target, opts = {}) {
  const s = S === 'L' ? 1 : -1;
  const pole = (opts.elbow || new THREE.Vector3(s * 0.5, -0.5, -0.6)).clone().normalize();
  const tgt = target.isVector3 ? target : new THREE.Vector3(...target);
  const p0 = pose['arm' + S] || [0, 0, -26];
  const f0 = pose['forearm' + S] || [10, 0, 0];
  let x = [p0[0], p0[2], opts.twist ?? p0[1], f0[0]];
  const fixTwist = opts.twist !== undefined;
  const cost = (v) => {
    const P = { ...pose, ['arm' + S]: [v[0], v[2], v[1]], ['forearm' + S]: [v[3], f0[1], f0[2]] };
    const j = armFK(P, S);
    const end = opts.grip ? j.knuckle.clone().lerp(j.wrist, 0.35) : j.wrist;
    let c = end.distanceToSquared(tgt) * 1e4;
    const line = j.wrist.clone().sub(j.shoulder);
    const ll = line.lengthSq();
    const proj = j.shoulder.clone().addScaledVector(line, j.elbow.clone().sub(j.shoulder).dot(line) / Math.max(1e-6, ll));
    const ed = j.elbow.clone().sub(proj);
    if (ed.lengthSq() > 1e-8) c += (1 - ed.normalize().dot(pole)) * 2;
    if (v[3] < 2) c += (2 - v[3]) * 0.5;
    if (v[3] > 150) c += (v[3] - 150) * 0.5;
    c += (Math.abs(v[2]) > 100 ? (Math.abs(v[2]) - 100) * 0.05 : 0);
    return c;
  };
  let best = cost(x);
  let step = 24;
  for (let it = 0; it < 26 && step > 0.2; it++) {
    let improved = false;
    for (let d = 0; d < 4; d++) {
      if (d === 2 && fixTwist) continue;
      for (const sg of [1, -1]) {
        const y = x.slice();
        y[d] += sg * step;
        const c = cost(y);
        if (c < best) { best = c; x = y; improved = true; }
      }
    }
    if (!improved) step *= 0.5;
  }
  return { ...pose, ['arm' + S]: [x[0], x[2], x[1]], ['forearm' + S]: [x[3], f0[1], f0[2]] };
}

// Root-space helper points on the reference body.
export const P = {
  hipY: REF.hipJY, chestY: REF.chestY, shoulderY: REF.shoulderY, headY: REF.headPivotY + 0.07, neckY: REF.neckBaseY,
  waistY: REF.pelvisY + 0.07,
};
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function stand(o = {}) {
  return standPose(o.sx ?? 0, o.drop ?? 0, o.w ?? 0.5, o.t ?? 0, o);
}

// Hand shapes
export const FIST = (S) => ({ ['fingers' + S]: [85, 0, 0], ['fingers2' + S]: [95, 0, 0], ['thumb' + S]: [55, 0, 0] });
export const GRIP = (S) => ({ ['fingers' + S]: [75, 0, 0], ['fingers2' + S]: [80, 0, 0], ['thumb' + S]: [45, 0, 0] });
export const OPEN = (S) => ({ ['fingers' + S]: [4, 0, 0], ['fingers2' + S]: [4, 0, 0], ['thumb' + S]: [0, 0, 0] });
export const RELAX = (S) => ({ ['fingers' + S]: [20, 0, 0], ['fingers2' + S]: [25, 0, 0], ['thumb' + S]: [12, 0, 0] });
export const POINT = (S) => ({ ['fingers' + S]: [60, 0, 0], ['fingers2' + S]: [70, 0, 0], ['thumb' + S]: [40, 0, 0] });

export { mergePose, NEUTRAL };
