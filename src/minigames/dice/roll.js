// A believable, scripted roll: the outcome is decided first (by the match), then a path is built that ends with
// that face up. Nothing is simulated, so a roll always lands where and how it should and can be tested.
//
//   FACE_NORMAL[value]                    the local direction of each face (1 up, 6 down, 2 and 5 front and back, 3 and 4 the sides)
//   faceUp(value, yaw)                    -> Quaternion that rests the die with `value` on top, turned `yaw` about the vertical
//   topFace(quaternion)                   -> the value facing up in that orientation
//   planRoll(opts)                        -> plan { duration, events, sample(t, outPos, outQuat) }
//   planShake(opts)                       -> plan: a hand full of dice shaken in the air (positions wobble, no landing)
//   planHop(opts)                         -> plan: a resting die lifts to a point (pick up) or settles from one
//
// Table frame: x to the thrower's right, y up, z away from the thrower (the opponent's side is +z for the
// player's dice; pass dir = -1 to throw toward -z). One roll is: a flight from the hand, two bounces that lose
// height and speed with the spin turning toward a flat pose, then (often) one or two tumbles over the leading
// edge, the way a die really finishes, ending on the chosen face.
import * as THREE from 'three';

export const FACE_NORMAL = {
  1: new THREE.Vector3(0, 1, 0), 6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1), 5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0), 4: new THREE.Vector3(-1, 0, 0),
};
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export function faceUp(value, yaw = 0, out = new THREE.Quaternion()) {
  out.setFromUnitVectors(FACE_NORMAL[value], UP);
  _q.setFromAxisAngle(UP, yaw);
  return out.premultiply(_q);
}

export function topFace(q) {
  let best = 1, bd = -2;
  for (let v = 1; v <= 6; v++) {
    _v.copy(FACE_NORMAL[v]).applyQuaternion(q);
    if (_v.y > bd) { bd = _v.y; best = v; }
  }
  return best;
}

const ease = {
  linear: (x) => x,
  out: (x) => 1 - (1 - x) * (1 - x),
  inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
  in: (x) => x * x,
};

function randomQuat(r, out = new THREE.Quaternion()) {
  // uniform random rotation
  const u1 = r(), u2 = r(), u3 = r();
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return out.set(a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)).normalize();
}

// The turn from q0 to q1 as axis and angle in [0, PI], plus `turns` extra whole turns about the same axis.
function spinBetween(q0, q1, turns) {
  const d = new THREE.Quaternion().copy(q1).multiply(_q2.copy(q0).invert());
  if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
  const angle = 2 * Math.acos(Math.min(1, d.w));
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
  const axis = s < 1e-6 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(d.x / s, d.y / s, d.z / s);
  return { axis, total: angle + Math.PI * 2 * turns };
}

// A segment is { t0, t1, at(k, pos, quat) } with k in 0..1 across the segment.
function flight({ t0, dur, p0, p1, q0, q1, apex, turns, shape = ease.linear }) {
  const spin = spinBetween(q0, q1, turns);
  const a = p0.clone(), b = p1.clone(), qa = q0.clone();
  return {
    t0, t1: t0 + dur,
    at(k, pos, quat) {
      pos.lerpVectors(a, b, k);
      pos.y += 4 * apex * k * (1 - k);
      // Rot * q0: the spin turns about a fixed world axis.
      quat.setFromAxisAngle(spin.axis, spin.total * shape(k)).multiply(qa);
    },
  };
}

// A quarter turn over an edge: the die pivots about the bottom edge on the side it is heading.
function tumble({ t0, dur, center, f, q0, size }) {
  const half = size / 2;
  const axis = new THREE.Vector3().crossVectors(UP, f).normalize(); // rotation axis for a roll toward f
  const pivot = new THREE.Vector3(center.x + f.x * half, center.y - half, center.z + f.z * half);
  const rel = new THREE.Vector3().subVectors(center, pivot);
  const qa = q0.clone();
  return {
    t0, t1: t0 + dur,
    at(k, pos, quat) {
      const e = ease.inOut(k);
      _q.setFromAxisAngle(axis, (Math.PI / 2) * e);
      pos.copy(rel).applyQuaternion(_q).add(pivot);
      quat.copy(_q).multiply(qa);
    },
  };
}

function hold({ t0, dur, pos, quat }) {
  const p = pos.clone(), q = quat.clone();
  return { t0, t1: t0 + dur, at(k, outP, outQ) { outP.copy(p); outQ.copy(q); } };
}

function wrap(segments, events, start) {
  const duration = segments.length ? segments[segments.length - 1].t1 : 0;
  return {
    duration, events, segments,
    sample(t, outPos, outQuat) {
      const segs = segments;
      if (!segs.length) return;
      if (t <= segs[0].t0) { segs[0].at(0, outPos, outQuat); return; }
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (t < s.t1 || i === segs.length - 1) {
          const k = s.t1 > s.t0 ? Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))) : 1;
          s.at(k, outPos, outQuat);
          return;
        }
      }
    },
    start,
  };
}

// opts: { start: Vector3 (where the hand lets go), q0: Quaternion (optional), slot: Vector3 (the resting centre),
//         value, yaw, size, tableY, dir (+1 or -1, which way the throw goes along z), delay, rand, rolls (0..2 or null for random),
//         scale (1 = a full throw, less for a short toss) }
export function planRoll(o) {
  const { start, slot, value, size = 0.05, tableY, rand, dir = 1, delay = 0 } = o;
  const yaw = o.yaw ?? (rand() - 0.5) * 0.5;
  const rest = tableY + size / 2;
  const qf = faceUp(value, yaw);
  const scale = o.scale ?? 1;
  let k = o.rolls ?? (rand() < 0.35 ? 0 : rand() < 0.7 ? 1 : 2);
  k = Math.max(0, Math.min(2, k));
  const f = new THREE.Vector3(0, 0, dir);

  // Work backward from the finish: each tumble over the leading edge turns the die a quarter about (up x f).
  const axisT = new THREE.Vector3().crossVectors(UP, f).normalize();
  const quarter = new THREE.Quaternion().setFromAxisAngle(axisT, Math.PI / 2);
  const back = quarter.clone().invert();
  const qPre = qf.clone();
  for (let i = 0; i < k; i++) qPre.premultiply(back);
  const rollStart = new THREE.Vector3(slot.x, rest, slot.z).addScaledVector(f, -size * k);

  const hop2 = (0.045 + rand() * 0.03) * scale, hop1 = (0.11 + rand() * 0.07) * scale;
  const L3 = rollStart.clone();
  const L2 = L3.clone().addScaledVector(f, -hop2);
  L2.x += (rand() - 0.5) * 0.012;
  const L1 = L2.clone().addScaledVector(f, -hop1);
  L1.x += (rand() - 0.5) * 0.02;

  const qStart = o.q0 ? o.q0.clone() : randomQuat(rand);
  const qA = randomQuat(rand), qB = randomQuat(rand);
  const T0 = (0.4 + rand() * 0.1) * (0.6 + 0.4 * scale), T1 = 0.21 + rand() * 0.04, T2 = 0.13 + rand() * 0.03, TR = 0.15;
  const segs = [], events = [];
  let t = delay;
  if (delay > 0) segs.push(hold({ t0: 0, dur: delay, pos: start, quat: qStart }));
  const fly = (p0, p1, q0, q1, dur, apex, turns, shape) => { segs.push(flight({ t0: t, dur, p0, p1, q0, q1, apex, turns, shape })); t += dur; };
  fly(start, L1.clone().setY(rest), qStart, qA, T0, 0.1 + rand() * 0.06, 1 + Math.floor(rand() * 2), ease.linear);
  events.push({ t, strength: 1, kind: 'land' });
  fly(L1.clone().setY(rest), L2.clone().setY(rest), qA, qB, T1, 0.05 + rand() * 0.02, 1, ease.linear);
  events.push({ t, strength: 0.7, kind: 'land' });
  fly(L2.clone().setY(rest), L3, qB, qPre, T2, 0.018 + rand() * 0.008, 0, ease.out);
  events.push({ t, strength: 0.45, kind: 'land' });
  const c = rollStart.clone();
  let q = qPre.clone();
  for (let i = 0; i < k; i++) {
    segs.push(tumble({ t0: t, dur: TR, center: c, f, q0: q, size }));
    t += TR;
    c.addScaledVector(f, size);
    q = quarter.clone().multiply(q);
    events.push({ t, strength: 0.3, kind: 'tumble' });
  }
  segs.push(hold({ t0: t, dur: 0.001, pos: new THREE.Vector3(slot.x, rest, slot.z), quat: qf }));
  return wrap(segs, events, { pos: start.clone(), quat: qStart });
}

// Dice shaken in a closed hand above the table: each wobbles around `center` for `dur` seconds.
export function planShake({ center, q0, dur, rand, amp = 0.012, rate = 1, delay = 0 }) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const c = center.clone();
  const qa = q0.clone();
  const ax = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
  const seg = {
    t0: 0, t1: delay + dur,
    at(k, pos, quat) {
      const tt = k * (delay + dur) * rate;
      const w = Math.min(1, k * 6) * (1 - 0.15 * k);
      pos.set(c.x + Math.sin(tt * 34 + ph[0]) * amp * w, c.y + Math.sin(tt * 29 + ph[1]) * amp * 0.8 * w, c.z + Math.sin(tt * 31 + ph[2]) * amp * w);
      quat.setFromAxisAngle(ax, Math.sin(tt * 22 + ph[3]) * 0.6 * w + tt * 2).multiply(qa);
    },
  };
  return wrap([seg], [], { pos: c, quat: qa });
}

// Move a die from one place and pose to another along a small arc (picking it up, putting it down, nudging it
// apart). apex is the extra height of the arc.
export function planHop({ p0, p1, q0, q1, dur = 0.25, apex = 0.03, delay = 0, turns = 0 }) {
  const segs = [];
  if (delay > 0) segs.push(hold({ t0: 0, dur: delay, pos: p0, quat: q0 }));
  segs.push(flight({ t0: delay, dur, p0, p1, q0, q1, apex, turns, shape: ease.inOut }));
  return wrap(segs, [], { pos: p0.clone(), quat: q0.clone() });
}

export { randomQuat };
