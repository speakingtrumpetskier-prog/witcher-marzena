// Keeps the arms out of the body. The clips pose every character's arms the same way, but a heavy build or a thick
// coat is wider than the slim body they were authored on: hanging arms sank into the coat, the walk swung the
// forearms through the belly, and folded arms (crossed, praying, warming hands) drove the elbows into the chest.
//
// At build time armProfile() measures the torso's real outline, garments included, in height bands and angular
// sectors (in the frames of the hips, spine and chest bones, so it bends with the body), and the sleeve thickness at
// the elbow and wrist. Each frame clearArms() checks each arm against it:
//   1. a wrist inside the outline turns the forearm about the elbow until the wrist rests on the surface;
//   2. an elbow inside it swings round the shoulder-to-wrist line until it is clear, so the hand stays exactly
//      where the clip put it (hands together, on a knee, on a hip, on a tool);
//      a nearly straight arm cannot swing far enough, so it is turned out about the shoulder instead;
//   3. the middle of the forearm, if still inside, turns the forearm out a little.
// Outward never means round the back: a point behind the midline goes out to the side.
//
//   c._armProfile = armProfile(geometry, rig, M)    (Character constructor)
//   clearArms(c)                                     (Character.update, after the pose and the foot IK)
import * as THREE from 'three';

const TORSO = ['hips', 'spine', 'chest'];
const SECT = 24;
const BANDS = 12;
const MAX_TURN = 0.6; // radians: the most the fallback turns one bone (a deep overlap is only partly undone, without a pop)
const SWING_STEP = 0.17; // radians per search step of the elbow swing, up to SWING_STEPS of them each way
const SWING_STEPS = 9;
const BACK_LIMIT = 1.75; // radians from straight ahead: push directions are kept in front of a little behind the side

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3();
const _o = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _l = new THREE.Vector3();
const _ax = new THREE.Vector3(), _r0 = new THREE.Vector3(), _pt = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _id = new THREE.Quaternion();
const _qs = new THREE.Quaternion(), _hq = new THREE.Quaternion();
const _inv = { hips: new THREE.Matrix4(), spine: new THREE.Matrix4(), chest: new THREE.Matrix4() };

export function armProfile(geometry, rig, M) {
  const pos = geometry.attributes.position, si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
  if (!pos || !si || !sw) return null;
  const idx = rig.index, world = rig.world;
  if (TORSO.some((n) => idx[n] == null)) return null;
  const torso = new Set(TORSO.map((n) => idx[n]));
  const k = M.k;
  // from below the hip joint (hands hang there) to below the armpit (above it the shoulders and sleeve tops are
  // skinned to the chest and would read as torso)
  const y0 = M.hipJY - 0.16 * k, y1 = M.shoulderY - 0.08 * k;
  const bh = (y1 - y0) / BANDS;
  const bands = [];
  for (let i = 0; i < BANDS; i++) bands.push({ y: y0 + (i + 0.5) * bh, xs: [], zs: [], zmin: Infinity, zmax: -Infinity });
  // sleeve radius: distance of arm and forearm vertices from the bone's bind axis, near the elbow and the wrist
  const sleeve = { elbow: 0, wrist: 0 };
  const L = { arm: idx.armL, fore: idx.forearmL };
  const sh = world.armL, el = world.forearmL, wr = world.handL;
  const seg = (a, b, x, y, z) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len2 = dx * dx + dy * dy + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / len2));
    return [t, Math.hypot(x - a.x - dx * t, y - a.y - dy * t, z - a.z - dz * t)];
  };
  for (let v = 0; v < pos.count; v++) {
    let wt = 0, wa = 0, wf = 0;
    for (let c = 0; c < 4; c++) {
      const b = si.getComponent(v, c), w = sw.getComponent(v, c);
      if (torso.has(b)) wt += w;
      else if (b === L.arm) wa += w;
      else if (b === L.fore) wf += w;
    }
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    if (wt >= 0.9) {
      const i = Math.floor((y - y0) / bh);
      if (i < 0 || i >= BANDS) continue;
      const B = bands[i];
      B.xs.push(x); B.zs.push(z);
      if (z < B.zmin) B.zmin = z;
      if (z > B.zmax) B.zmax = z;
    } else if (wa >= 0.9) {
      const [t, d] = seg(sh, el, x, y, z);
      if (t > 0.7) sleeve.elbow = Math.max(sleeve.elbow, d);
    } else if (wf >= 0.9) {
      const [t, d] = seg(el, wr, x, y, z);
      if (t < 0.3) sleeve.elbow = Math.max(sleeve.elbow, d);
      else if (t > 0.7) sleeve.wrist = Math.max(sleeve.wrist, d);
    }
  }
  const out = [];
  for (const B of bands) {
    if (!B.xs.length) { out.push(null); continue; }
    const cz = (B.zmin + B.zmax) / 2;
    const r = new Float32Array(SECT);
    for (let i = 0; i < B.xs.length; i++) {
      const dx = B.xs[i], dz = B.zs[i] - cz;
      const s = sectorOf(dx, dz) | 0;
      const d = Math.hypot(dx, dz);
      if (d > r[s]) r[s] = d;
    }
    // a coarse ring leaves some sectors without a vertex: take the larger neighbour
    for (let pass = 0; pass < 3; pass++) {
      for (let s = 0; s < SECT; s++) if (r[s] === 0) r[s] = Math.max(r[(s + SECT - 1) % SECT], r[(s + 1) % SECT]);
    }
    const y = B.y;
    const bone = y >= M.chestY ? 'chest' : y >= M.spineY ? 'spine' : 'hips';
    const bw = world[bone];
    out.push({ y, cz, r, bone, bx: bw.x, by: bw.y, bz: bw.z });
  }
  if (!out.some(Boolean)) return null;
  const armR = M.armR;
  // a sleeve's widest point is its loose cloth and cuff, which give against the body: count part of it
  return {
    y0, bh, bands: out, spineW: world.spine.clone(),
    elbowR: Math.min(armR * 1.6, Math.max(armR * 0.8, sleeve.elbow * 0.65)),
    wristR: Math.min(armR * 1.4, Math.max(armR * 0.5, sleeve.wrist * 0.8)),
  };
}

// Sector index (fractional) of a direction in the band plane: 0 at +Z (front), increasing toward +X.
function sectorOf(dx, dz) {
  const a = Math.atan2(dx, dz);
  return ((a / (Math.PI * 2)) * SECT + SECT) % SECT;
}

function radiusAt(B, dx, dz) {
  const f = sectorOf(dx, dz), s0 = Math.floor(f) % SECT, s1 = (s0 + 1) % SECT, t = f - Math.floor(f);
  return B.r[s0] + (B.r[s1] - B.r[s0]) * t;
}

// How far the world point p is inside the torso grown by limbR (0 when clear). With `out`, also writes where to push
// it: onto the grown surface straight out from the body's axis, or out to the side for a point behind the midline.
function depth(P, by, p, limbR, out) {
  // which band: read the height in the spine's frame, then measure in the frame of the bone that band follows
  _l.copy(p).applyMatrix4(_inv.spine);
  const f = (_l.y + P.spineW.y - P.y0) / P.bh - 0.5;
  if (f < -0.5 || f > BANDS - 0.5) return 0;
  const i0 = Math.max(0, Math.min(BANDS - 1, Math.floor(f))), i1 = Math.min(BANDS - 1, i0 + 1);
  const A = P.bands[i0] || P.bands[i1], C = P.bands[i1] || P.bands[i0];
  if (!A || !C) return 0;
  _l.copy(p).applyMatrix4(_inv[A.bone]);
  const x = _l.x + A.bx, y = _l.y + A.by, z = _l.z + A.bz;
  // blend the two bands' outlines so the surface does not step between them
  const t = Math.max(0, Math.min(1, f - i0));
  const cz = A.cz + (C.cz - A.cz) * t;
  const dx = x, dz = z - cz;
  const rAt = (ux, uz) => radiusAt(A, ux, uz) + (radiusAt(C, ux, uz) - radiusAt(A, ux, uz)) * t + limbR;
  const r = Math.hypot(dx, dz), need = rAt(dx, dz);
  if (r >= need) return 0;
  if (out) {
    const a = Math.max(-BACK_LIMIT, Math.min(BACK_LIMIT, Math.atan2(dx, dz)));
    const ux = Math.sin(a), uz = Math.cos(a), n = rAt(ux, uz);
    out.set(ux * n - A.bx, y - A.by, cz + uz * n - A.bz).applyMatrix4(by[A.bone].matrixWorld);
  }
  return need - r;
}

// Turn `bone` about its own origin by the world rotation q (limited to MAX_TURN when `limit`).
function rotateWorld(bone, q, limit) {
  if (limit) {
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (ang > MAX_TURN) q.copy(_id.identity().slerp(q, MAX_TURN / ang));
  }
  bone.parent.getWorldQuaternion(_pq);
  // world delta q -> local: pq^-1 * q * pq
  q.premultiply(_id.copy(_pq).invert()).multiply(_pq);
  bone.quaternion.premultiply(q);
  bone.updateMatrixWorld(true);
}

// Turn `bone` about its own origin so the world point `from` (carried by it) points at `to`.
function turn(bone, from, to) {
  bone.getWorldPosition(_o);
  _a.copy(from).sub(_o);
  _b.copy(to).sub(_o);
  if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(_a.normalize(), _b.normalize());
  rotateWorld(bone, _q, true);
}

// Swing the elbow round the shoulder-to-wrist line until it clears the body; the wrist is on that line, so the hand
// does not move (its world orientation is put back too). False only for a nearly straight arm, which swinging
// cannot move; when no swing clears a bent arm it takes the one that leaves the least inside.
function swing(c, P, by, S, arm, fore, hand) {
  arm.getWorldPosition(_o);
  fore.getWorldPosition(_e);
  hand.getWorldPosition(_w);
  _ax.copy(_w).sub(_o);
  const len = _ax.length();
  if (len < 1e-4) return false;
  _ax.divideScalar(len);
  _r0.copy(_e).sub(_o);
  // a nearly straight arm has its elbow almost on the line: swinging it hardly moves it
  const off = _pt.copy(_r0).addScaledVector(_ax, -_r0.dot(_ax)).length();
  if (off < 0.025 * c.M.k) return false;
  const at = (phi) => {
    _qs.setFromAxisAngle(_ax, phi);
    _pt.copy(_r0).applyQuaternion(_qs).add(_o);
    return depth(P, by, _pt, P.elbowR);
  };
  const elbowY = (phi) => { _qs.setFromAxisAngle(_ax, phi); return _pt.copy(_r0).applyQuaternion(_qs).y; };
  // keep swinging the way this arm went last time when both ways clear, so it cannot flip between frames
  const prefer = (c._armSwing ||= { L: 0, R: 0 })[S];
  let best = null, least = 0, leastD = at(0);
  for (let k = 1; k <= SWING_STEPS && best == null; k++) {
    const a = k * SWING_STEP, dp = at(a), dm = at(-a);
    if (dp === 0 && dm === 0) best = prefer ? Math.sign(prefer) * a : elbowY(a) <= elbowY(-a) ? a : -a; // elbows hang down
    else if (dp === 0) best = a;
    else if (dm === 0) best = -a;
    if (dp < leastD) { leastD = dp; least = a; }
    if (dm < leastD) { leastD = dm; least = -a; }
  }
  let hi;
  if (best == null) {
    // nothing clears it (a hand held in close, on a knee): swing as far out as helps, the hand still stays put
    if (least === 0) { c._armSwing[S] = 0; return true; }
    hi = least;
  } else {
    // the step found it clear; close in on the smallest swing that does
    let lo = best - Math.sign(best) * SWING_STEP;
    hi = best;
    for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (at(m) === 0) hi = m; else lo = m; }
  }
  c._armSwing[S] = hi;
  hand.getWorldQuaternion(_hq);
  _q.setFromAxisAngle(_ax, hi);
  rotateWorld(arm, _q, false);
  // the hand keeps the orientation the clip gave it
  fore.getWorldQuaternion(_pq);
  hand.quaternion.copy(_pq.invert().multiply(_hq));
  hand.updateMatrixWorld(true);
  return true;
}

// Debug: what clearArms would push where right now, without touching the bones (positions in the hips' frame).
export function probeArms(c) {
  const P = c._armProfile;
  if (!P) return null;
  const by = c.rig.byName;
  c.root.updateMatrixWorld(true);
  for (const n of TORSO) _inv[n].copy(by[n].matrixWorld).invert();
  const out = {};
  const rel = (v) => { _l.copy(v).applyMatrix4(_inv.hips); return [_l.x, _l.y, _l.z].map((x) => +x.toFixed(3)); };
  for (const S of ['L', 'R']) {
    by['forearm' + S].getWorldPosition(_e);
    by['hand' + S].getWorldPosition(_w);
    const de = depth(P, by, _e, P.elbowR, _t), e = de ? rel(_t) : null;
    const dw = depth(P, by, _w, P.wristR, _t), w = dw ? rel(_t) : null;
    out[S] = { elbow: rel(_e), elbowIn: +de.toFixed(3), elbowTo: e, wrist: rel(_w), wristIn: +dw.toFixed(3), wristTo: w };
  }
  out.radii = { elbowR: +P.elbowR.toFixed(3), wristR: +P.wristR.toFixed(3) };
  out.bands = P.bands.map((B) => B && { y: +B.y.toFixed(2), bone: B.bone, cz: +B.cz.toFixed(3), front: +B.r[0].toFixed(3), side: +B.r[6].toFixed(3), back: +B.r[12].toFixed(3) });
  return out;
}

export function clearArms(c) {
  const P = c._armProfile;
  if (!P) return;
  const by = c.rig.byName;
  c.root.updateMatrixWorld(true);
  for (const n of TORSO) _inv[n].copy(by[n].matrixWorld).invert();
  for (const S of ['L', 'R']) {
    const arm = by['arm' + S], fore = by['forearm' + S], hand = by['hand' + S];
    // 1. a hand inside the coat comes out onto it
    hand.getWorldPosition(_w);
    if (depth(P, by, _w, P.wristR, _t) > 0) turn(fore, _w, _t);
    // 2. the elbow swings clear round the hand, or a straight arm turns out at the shoulder
    fore.getWorldPosition(_e);
    if (depth(P, by, _e, P.elbowR) > 0) {
      if (!swing(c, P, by, S, arm, fore, hand)) {
        fore.getWorldPosition(_e);
        if (depth(P, by, _e, P.elbowR, _t) > 0) turn(arm, _e, _t);
      }
    } else if (c._armSwing) c._armSwing[S] = 0;
    // 3. what is left of the forearm in the body
    fore.getWorldPosition(_e);
    hand.getWorldPosition(_w);
    _p.copy(_e).lerp(_w, 0.5);
    if (depth(P, by, _p, (P.elbowR + P.wristR) * 0.5, _t) > 0) turn(fore, _p, _t);
  }
}
