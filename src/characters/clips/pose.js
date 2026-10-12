// Pose authoring convention and clip baking.
//
// Every bone has identity orientation in the bind pose (rig.js), so a pose is a set of local
// rotations from bind. Poses are written with SEMANTIC angles in degrees, [flex, twist, side],
// mirrored automatically for L/R bones:
//   spine-like (hips, spine, chest, neck, head): flex = bend forward / nod down, twist = turn
//     to the character's left, side = lean / tilt to the left.
//   shoulder (clavicle): flex = forward (protract), twist = roll, side = shrug up.
//   arm: flex = raise forward, twist = inward rotation, side = raise out to the side.
//   forearm: flex = bend elbow, twist = pronate, side = out.
//   hand: flex = curl toward palm, twist = rotate, side = tilt toward thumb (forward).
//   fingers, fingers2, thumb: flex = curl.
//   thigh: flex = swing forward, twist = toe out, side = out.  shin: flex = bend knee.
//   foot: flex = toes up, twist = toe out, side = roll out.  toe: flex = toes up.
//   jaw: flex = open.
// Special keys: $hips: [x, y, z] meter offset of the pelvis (reference 1.76 m body, scaled
// by leg length at runtime), $face: { smile, frown, browUp, browDown, browSad, squint,
// eyesClosed, jawOpen, mouthNarrow } expression weights.
import * as THREE from 'three';

const D = Math.PI / 180;
export const FPS = 30;

export const BODY_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
  'shoulderL', 'armL', 'forearmL', 'handL', 'fingersL', 'fingers2L', 'thumbL',
  'shoulderR', 'armR', 'forearmR', 'handR', 'fingersR', 'fingers2R', 'thumbR',
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR',
];
export const FACE_KEYS = ['smile', 'frown', 'browUp', 'browDown', 'browSad', 'squint', 'eyesClosed', 'jawOpen', 'mouthNarrow',
  'heavyLids', 'eyesWide', 'smirk', 'press', 'browUpL'];

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

// Semantic [flex, twist, side] (deg) -> local quaternion for a bone name.
// Arm-chain twist turns about the bind arm axis (the bind arms hang 33 degrees out).
const ARM_ANG = 33 * Math.PI / 180;
const AXIS_L = new THREE.Vector3(Math.sin(ARM_ANG), -Math.cos(ARM_ANG), 0);
const AXIS_R = new THREE.Vector3(-Math.sin(ARM_ANG), -Math.cos(ARM_ANG), 0);
const HINGE_L = new THREE.Vector3(Math.cos(ARM_ANG), Math.sin(ARM_ANG), 0);
const HINGE_R = new THREE.Vector3(Math.cos(ARM_ANG), -Math.sin(ARM_ANG), 0);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
export function semToQuat(bone, v, out = new THREE.Quaternion()) {
  const [a, b, c] = v;
  const R = bone.endsWith('R') && !bone.startsWith('lid');
  const s = R ? -1 : 1;
  const base = bone.replace(/[LR]$/, '');
  switch (base) {
    case 'hips': case 'spine': case 'chest': case 'neck': case 'head':
      _e.set(a * D, b * D, -c * D, 'YXZ'); return out.setFromEuler(_e);
    case 'jaw':
      _e.set(a * D, b * D, c * D, 'YXZ'); return out.setFromEuler(_e);
    case 'shoulder':
      _e.set(b * D, -s * a * D, s * c * D, 'ZYX'); return out.setFromEuler(_e);
    case 'arm': {
      _qa.setFromAxisAngle(X, -a * D);
      _qb.setFromAxisAngle(Z, s * c * D);
      _qc.setFromAxisAngle(R ? AXIS_R : AXIS_L, s * b * D);
      return out.copy(_qa).multiply(_qb).multiply(_qc);
    }
    case 'forearm': {
      // elbow hinge: perpendicular to the bind arm axis, so flexion folds the forearm forward
      // in the plane of the arm instead of sweeping a cone around X
      _qa.setFromAxisAngle(R ? HINGE_R : HINGE_L, -a * D);
      _qb.setFromAxisAngle(Z, s * c * D);
      _qc.setFromAxisAngle(R ? AXIS_R : AXIS_L, s * b * D);
      return out.copy(_qa).multiply(_qb).multiply(_qc);
    }
    case 'hand': case 'fingers': case 'fingers2': {
      _qa.setFromAxisAngle(Z, -s * a * D);
      _qb.setFromAxisAngle(X, -c * D);
      _qc.setFromAxisAngle(R ? AXIS_R : AXIS_L, s * b * D);
      return out.copy(_qc).multiply(_qa).multiply(_qb);
    }
    case 'thumb':
      _e.set(-a * 0.5 * D, -s * b * D, -s * a * 0.6 * D, 'ZXY'); return out.setFromEuler(_e);
    case 'thigh':
      _e.set(-a * D, s * b * D, s * c * D, 'XZY'); return out.setFromEuler(_e);
    case 'shin':
      _e.set(a * D, s * b * D, s * c * D, 'XZY'); return out.setFromEuler(_e);
    case 'foot': case 'toe':
      _e.set(-a * D, s * b * D, s * c * D, 'XZY'); return out.setFromEuler(_e);
    default:
      _e.set(a * D, b * D, c * D, 'XYZ'); return out.setFromEuler(_e);
  }
}
void Y;

// Neutral standing pose: arms relaxed at the sides (the bind is an A-pose), hands loosely
// curled, weight even.
export const NEUTRAL = {
  armL: [4, 6, -26], armR: [4, 6, -26],
  forearmL: [12, 10, 0], forearmR: [12, 10, 0],
  handL: [8, 0, 4], handR: [8, 0, 4],
  fingersL: [18, 0, 0], fingersR: [18, 0, 0], fingers2L: [22, 0, 0], fingers2R: [22, 0, 0],
  thumbL: [12, 0, 0], thumbR: [12, 0, 0],
  shoulderL: [0, 0, -2], shoulderR: [0, 0, -2],
  thighL: [0, 3, 0], thighR: [0, 3, 0], shinL: [2, 0, 0], shinR: [2, 0, 0], footL: [-1, 0, 0], footR: [-1, 0, 0],
};

export const mergePose = (...ps) => {
  const o = {};
  for (const p of ps) if (p) for (const k in p) o[k] = p[k];
  return o;
};
// Add semantic offsets to a pose (per channel).
export const addPose = (p, d) => {
  const o = { ...p };
  for (const k in d) {
    if (k === '$face') { o.$face = { ...(p.$face || {}), ...d.$face }; continue; }
    const a = p[k] || [0, 0, 0], b = d[k];
    o[k] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  return o;
};
// Swap L and R (and negate twist/side for spine bones) for mirrored clips.
export function mirrorPose(p) {
  const o = {};
  for (const k in p) {
    if (k === '$face') { o.$face = p.$face; continue; }
    if (k === '$hips') { o.$hips = [-p.$hips[0], p.$hips[1], p.$hips[2]]; continue; }
    let m = k;
    if (/L$/.test(k)) m = k.slice(0, -1) + 'R';
    else if (/R$/.test(k)) m = k.slice(0, -1) + 'L';
    const v = p[k];
    if (['hips', 'spine', 'chest', 'neck', 'head', 'jaw'].includes(k)) o[m] = [v[0], -v[1], -v[2]];
    else o[m] = v.slice();
  }
  return o;
}

// Fritsch-Carlson monotone cubic through (t, v) samples.
function monotone(ts, vs) {
  const n = ts.length;
  const m = new Float64Array(n);
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (vs[i + 1] - vs[i]) / Math.max(1e-6, ts[i + 1] - ts[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else m[i] = (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-9) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (t) => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i];
    const s = (t - ts[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

// Easing applied to the time within a segment ending at a key (optional 3rd element of a key).
const EASE = {
  linear: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  snap: (x) => 1 - Math.pow(1 - x, 3.2),
  slow: (x) => x * x * (3 - 2 * x),
};

// Clip definition -> baked clip.
// def: { name, dur, loop, keys: [[t, pose, ease?]], base, overlap: { bone: seconds },
//        events: [[t, name]], mask, upperMask, then, hold, rootMotion }
export function bakeKeys(def) {
  const dur = def.dur;
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const keys = def.keys.map(([t, p, e]) => [t, mergePose(def.base || NEUTRAL, p), e]);
  if (def.loop) {
    const first = keys[0];
    if (Math.abs(keys[keys.length - 1][0] - dur) > 1e-4) keys.push([dur, first[1], first[2]]);
  }
  const bones = new Set();
  let hasHips = false, hasFace = false;
  for (const [, p] of keys) for (const b in p) {
    if (b === '$hips') hasHips = true;
    else if (b === '$face') hasFace = true;
    else bones.add(b);
  }
  // time warp per segment (ease)
  const ts = keys.map((k) => k[0]);
  const warp = (t) => {
    for (let i = 1; i < keys.length; i++) if (t <= ts[i]) {
      const e = keys[i][2];
      if (!e || !EASE[e]) return t;
      const a = ts[i - 1], b = ts[i];
      return a + (b - a) * EASE[e]((t - a) / Math.max(1e-6, b - a));
    }
    return t;
  };
  const tracks = {};
  for (const b of bones) {
    const chans = [0, 1, 2].map((c) => monotone(ts, keys.map(([, p]) => (p[b] || (def.base || NEUTRAL)[b] || [0, 0, 0])[c])));
    const arr = new Float32Array(n * 4);
    const delay = def.overlap?.[b] ?? def.overlap?.[b.replace(/[LR]$/, '')] ?? 0;
    for (let i = 0; i < n; i++) {
      let t = (i / (n - 1)) * dur - delay;
      if (def.loop) t = ((t % dur) + dur) % dur; else t = Math.max(0, t);
      const tw = warp(t);
      semToQuat(b, [chans[0](tw), chans[1](tw), chans[2](tw)], _q);
      arr[i * 4] = _q.x; arr[i * 4 + 1] = _q.y; arr[i * 4 + 2] = _q.z; arr[i * 4 + 3] = _q.w;
    }
    fixSigns(arr);
    tracks[b] = arr;
  }
  let hips = null;
  if (hasHips) {
    const chans = [0, 1, 2].map((c) => monotone(ts, keys.map(([, p]) => (p.$hips || [0, 0, 0])[c])));
    hips = new Float32Array(n * 3);
    const delay = def.overlap?.$hips ?? 0;
    for (let i = 0; i < n; i++) {
      let t = (i / (n - 1)) * dur - delay;
      if (def.loop) t = ((t % dur) + dur) % dur; else t = Math.max(0, t);
      const tw = warp(t);
      hips[i * 3] = chans[0](tw); hips[i * 3 + 1] = chans[1](tw); hips[i * 3 + 2] = chans[2](tw);
    }
  }
  let face = null;
  if (hasFace) {
    face = {};
    const fk = new Set();
    for (const [, p] of keys) if (p.$face) for (const f in p.$face) fk.add(f);
    for (const f of fk) {
      const fn = monotone(ts, keys.map(([, p]) => (p.$face && p.$face[f]) || 0));
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = fn(warp((i / (n - 1)) * dur));
      face[f] = arr;
    }
  }
  return finishClip(def, n, tracks, hips, face);
}

// Procedural clip: fn(t01) -> pose (merged with NEUTRAL unless def.raw). Sampled at FPS.
export function bakeFn(def, fn) {
  const dur = def.dur;
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const poses = [];
  for (let i = 0; i < n; i++) poses.push(def.raw ? fn(i / (n - 1)) : mergePose(def.base || NEUTRAL, fn(i / (n - 1))));
  const bones = new Set();
  let hasHips = false, hasFace = false;
  for (const p of poses) for (const b in p) { if (b === '$hips') hasHips = true; else if (b === '$face') hasFace = true; else bones.add(b); }
  const tracks = {};
  for (const b of bones) {
    const arr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      semToQuat(b, poses[i][b] || [0, 0, 0], _q);
      arr.set([_q.x, _q.y, _q.z, _q.w], i * 4);
    }
    fixSigns(arr);
    tracks[b] = arr;
  }
  let hips = null;
  if (hasHips) {
    hips = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) hips.set(poses[i].$hips || [0, 0, 0], i * 3);
  }
  let face = null;
  if (hasFace) {
    face = {};
    for (const f of FACE_KEYS) {
      if (!poses.some((p) => p.$face && p.$face[f])) continue;
      face[f] = Float32Array.from(poses.map((p) => (p.$face && p.$face[f]) || 0));
    }
  }
  return finishClip(def, n, tracks, hips, face);
}

function fixSigns(arr) {
  for (let i = 4; i < arr.length; i += 4) {
    const d = arr[i] * arr[i - 4] + arr[i + 1] * arr[i - 3] + arr[i + 2] * arr[i - 2] + arr[i + 3] * arr[i - 1];
    if (d < 0) for (let c = 0; c < 4; c++) arr[i + c] = -arr[i + c];
  }
}

function finishClip(def, n, tracks, hips, face) {
  return {
    name: def.name,
    dur: def.dur,
    loop: !!def.loop,
    frames: n,
    tracks,
    hips,
    face,
    events: (def.events || []).map(([t, name]) => ({ t, name })),
    upperMask: def.upperMask || null,
    then: def.then || null,
    hold: !!def.hold,
    stride: def.stride || 0, // meters per cycle for locomotion clips (reference body)
    speed: def.refSpeed || 0,
    fadeIn: def.fadeIn ?? null,
    fadeOut: def.fadeOut ?? null,
    lowerOnly: !!def.lowerOnly,
  };
}

// Sample a baked clip at time t into per-bone quaternion slots.
// out: Map-like { boneName: Float32Array(4) } provided by the caller.
export function sampleTrack(arr, frames, f, out, o = 0) {
  const i0 = Math.floor(f), fr = f - i0;
  const a = Math.min(frames - 1, Math.max(0, i0)) * 4;
  const b = Math.min(frames - 1, Math.max(0, i0 + 1)) * 4;
  let x = arr[a] + (arr[b] - arr[a]) * fr;
  let y = arr[a + 1] + (arr[b + 1] - arr[a + 1]) * fr;
  let z = arr[a + 2] + (arr[b + 2] - arr[a + 2]) * fr;
  let w = arr[a + 3] + (arr[b + 3] - arr[a + 3]) * fr;
  const l = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  out[o] = x * l; out[o + 1] = y * l; out[o + 2] = z * l; out[o + 3] = w * l;
}
