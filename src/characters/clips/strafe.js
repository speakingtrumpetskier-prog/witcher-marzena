// Lock-on locomotion clips: stepping in any direction while the body keeps facing the target, and turning on the spot.
//
//   strafe_<set>_<gait>_<dir>   set: guard (sword drawn, arms up) | free (arms loose);  gait: walk | run;
//                               dir: f fl l bl b br r fr (every 45 degrees from straight ahead toward her left)
//   strafe_<set>_turn_<l|r>     small shuffling steps that turn the body on the spot (l = turning to her left)
//
// Every clip is a locomotion cycle in the animator's sense: phase 0 is the left foot's contact, `stride` is the distance
// the body covers per cycle (turn clips: the angle it turns per cycle, in radians), so the animator plays them at
// speed / stride and a planted foot does not slide. Feet are placed with the three-dimensional leg solver (legs3.js)
// from the same foot paths as the forward gaits (footAt in locomotion.js), travelling along the clip's direction.
// The eight directions are cut separately (their gait numbers are a blend of the forward, back and sideways gaits by the
// direction's components) because blending the joint angles of two clips more than 45 degrees apart does not keep a foot
// planted: the knee and hip angles do not add like positions. Between two neighbours the blend is exact enough, and the
// animator (strafeWeights) uses the components of the velocity along the two as weights and raises the cadence by their sum.
//
// The leg paths are shared by both sets; only the arms and the torso differ.
import { bakeFn, mergePose } from './pose.js';
import { footAt, combatGuard } from './locomotion.js';
import { solveLeg, ANKLE_H } from './legs3.js';
import { reachArm, aimHand, v3, FIST } from './lib.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// The three axis gaits. L = D * beta is how far a foot travels back through its stance; width is the half distance
// between the feet; bump is how far a swinging foot is carried forward (z) to clear the other one, which matters when
// the body goes sideways. Sideways is the same to the left and to the right.
const AXIS = {
  walk: {
    f: { D: 1.25, T: 0.95, beta: 0.62, bias: 0.05, hs: 0.14, to: 0.55, psiHs: 12, psiTo: 28, psiMid: 12, lift: 0.07, liftSkew: 0.7, swingShape: 1, width: 0.09, bump: 0, bob: 0.012, bobBase: -0.05, lean: 4, tilt: 5, yaw: 3, roll: 2 },
    b: { D: 0.95, T: 0.9, beta: 0.62, bias: -0.02, hs: 0.1, to: 0.8, psiHs: 0, psiTo: 8, psiMid: 6, lift: 0.06, liftSkew: 0.7, swingShape: 1, width: 0.1, bump: 0, bob: 0.01, bobBase: -0.06, lean: -3, tilt: 3, yaw: 3, roll: 2 },
    l: { D: 0.8, T: 0.74, beta: 0.62, bias: 0, hs: 0.06, to: 0.8, psiHs: 2, psiTo: 10, psiMid: 8, lift: 0.085, liftSkew: 0.7, swingShape: 1, width: 0.11, bump: 0.15, bob: 0.012, bobBase: -0.06, lean: 2, tilt: 4, yaw: 3, roll: 3 },
  },
  run: {
    f: { D: 2.5, T: 0.7, beta: 0.34, bias: 0.04, hs: 0.1, to: 0.45, psiHs: 8, psiTo: 38, psiMid: 30, lift: 0.24, liftSkew: 0.55, swingShape: 1.3, width: 0.07, bump: 0, bob: 0.028, bobBase: -0.062, lean: 12, tilt: 8, yaw: 6, roll: 2 },
    b: { D: 1.7, T: 0.64, beta: 0.4, bias: -0.02, hs: 0.1, to: 0.8, psiHs: 0, psiTo: 12, psiMid: 10, lift: 0.14, liftSkew: 0.6, swingShape: 1.1, width: 0.09, bump: 0, bob: 0.02, bobBase: -0.07, lean: -2, tilt: 3, yaw: 5, roll: 2 },
    l: { D: 1.75, T: 0.58, beta: 0.4, bias: 0, hs: 0.05, to: 0.75, psiHs: 2, psiTo: 14, psiMid: 14, lift: 0.17, liftSkew: 0.55, swingShape: 1.2, width: 0.1, bump: 0.16, bob: 0.024, bobBase: -0.068, lean: 4, tilt: 6, yaw: 4, roll: 3 },
  },
};
export const DIR_NAMES = ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr'];
const FIELDS = Object.keys(AXIS.walk.f);

// The gait record for a direction (k * 45 degrees from straight ahead toward her left): the axis gaits mixed by how much
// of the direction lies along each, so a diagonal is a step of its own with its own stride.
function gaitFor(kind, k) {
  const th = (k * Math.PI) / 4;
  const ux = Math.sin(th), uz = Math.cos(th);
  const c = { f: Math.max(0, uz), b: Math.max(0, -uz), l: Math.abs(ux) };
  const sum = c.f + c.b + c.l;
  const g = { dir: [Math.abs(ux) < 1e-6 ? 0 : ux, Math.abs(uz) < 1e-6 ? 0 : uz] };
  for (const f of FIELDS) g[f] = (c.f * AXIS[kind].f[f] + c.b * AXIS[kind].b[f] + c.l * AXIS[kind].l[f]) / sum;
  // the bump (carrying a swinging foot forward past the other) and the bladed stagger only belong to the sideways part
  g.stag = 0.035 * (1 - Math.abs(ux));
  return g;
}
export const STRAFE_GAITS = {};
for (const kind of ['walk', 'run']) DIR_NAMES.forEach((d, k) => { STRAFE_GAITS[`${kind}_${d}`] = gaitFor(kind, k); });

// Turning on the spot: the cycle turns the body by `turn` radians; the feet circle the middle at `radius`.
export const TURN = { T: 0.85, turn: 1.9, beta: 0.6, radius: 0.12, lift: 0.07, hs: 0.1, to: 0.8 };

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function footGait(g) {
  const L = g.D * g.beta;
  return {
    D: g.D, beta: g.beta, a0: L / 2, hs: g.hs, to: g.to, psiHs: g.psiHs * D2R, psiTo: g.psiTo * D2R, psiMid: g.psiMid * D2R,
    lift: g.lift, liftSkew: g.liftSkew ?? 0.8, swingShape: g.swingShape ?? 1,
  };
}

// A foot's travel along the gait axis (centred on the stance) with its height, pitch and toe bend.
function footTrack(p, fg, g) {
  const f = footAt(p, fg);
  const L = g.D * g.beta;
  const zc = f.z - (fg.a0 - L / 2) + (g.bias || 0);
  // swing progress for the clearance bump
  const u = p >= g.beta ? (p - g.beta) / (1 - g.beta) : -1;
  const bump = u >= 0 ? (g.bump || 0) * Math.sin(Math.PI * u) : 0;
  return { s: zc, y: f.y, psi: f.psi, toe: Math.min(0.5, Math.max(0, f.toe || 0)), bump };
}

// ---- torso and arms ------------------------------------------------------------------------------------------------
let guardArms = null;
function guardUpper() {
  if (guardArms) return guardArms;
  const g = combatGuard(0, 0);
  const keep = ['shoulderL', 'armL', 'forearmL', 'handL', 'fingersL', 'fingers2L', 'thumbL', 'shoulderR'];
  const base = { hips: [6, -14, 0], spine: [6, 8, 0], chest: [4, 10, 0], neck: [0, 4, 0], head: [-6, 6, 0] };
  for (const k of keep) base[k] = g[k];
  const solved = aimHand(reachArm(mergePose(g, base), 'R', v3(-0.14, 1.1, 0.3), { elbow: v3(-0.5, -0.6, -0.4) }), 'R', v3(0.05, 0.55, 1));
  guardArms = { ...Object.fromEntries(keep.map((k) => [k, solved[k] ?? g[k]])), armR: solved.armR, forearmR: solved.forearmR, handR: solved.handR, ...FIST('R') };
  return guardArms;
}

function arms(variant, t, g) {
  if (variant === 'guard') return guardUpper();
  // loose arms: a small swing against the legs, like walk with the amplitude turned down
  const sw = (off) => Math.cos(t - Math.PI * 2 * off);
  const a = Math.min(1, g.D / 2.5) * 9;
  const out = {};
  for (const [S, off] of [['L', 0.5], ['R', 0]]) {
    out['arm' + S] = [4 + a * sw(off), 8, -26];
    out['forearm' + S] = [16 + 6 * Math.max(0, sw(off + 0.06)), 10, 0];
    out['hand' + S] = [10, 0, 4];
    out['shoulder' + S] = [a * 0.1 * sw(off), 0, -2];
    out['fingers' + S] = [24, 0, 0]; out['fingers2' + S] = [28, 0, 0]; out['thumb' + S] = [14, 0, 0];
  }
  return out;
}

// ---- the directional gaits -----------------------------------------------------------------------------------------
function stepPose(phi, g, variant) {
  const fg = footGait(g);
  const t = phi * Math.PI * 2;
  const [ux, uz] = g.dir;
  const guard = variant === 'guard';
  const feet = [];
  for (const [sgn, S, off] of [[1, 'L', 0], [-1, 'R', 0.5]]) {
    const f = footTrack((phi + off) % 1, fg, g);
    // bladed guard: the left foot a touch forward, the right a touch back
    const stag = guard ? sgn * (g.stag ?? 0.035) : 0;
    const x = sgn * g.width + ux * f.s;
    const z = stag + uz * f.s + f.bump;
    feet.push({ S, sgn, x, z, y: f.y, psi: f.psi, toe: f.toe });
  }
  // the pelvis follows the middle of the feet part of the way: weight sits over the stance foot
  const mx = (feet[0].x + feet[1].x) / 2, mz = (feet[0].z + feet[1].z) / 2;
  const bob = g.bobBase + g.bob * Math.cos(2 * (t - Math.PI * 2 * 0.3));
  const yaw = -g.yaw * Math.cos(t);
  const roll = g.roll * Math.cos(t - Math.PI * 2 * 0.8);
  const pose = {
    $hips: [mx * 0.35, bob, mz * 0.3],
    hips: [g.tilt, (guard ? -14 : 0) + yaw, roll + (g.dir[0] ? -g.dir[0] * 1.5 : 0)],
  };
  const up = arms(variant, t, g);
  Object.assign(pose, up);
  const bc = 0.6 * Math.cos(2 * t);
  pose.spine = [g.lean * 0.5 + (guard ? 6 - g.tilt : 0) + bc, (guard ? 8 : 0) - yaw * 0.6, -roll * 0.6];
  pose.chest = [g.lean * 0.5 + (guard ? 4 : 0) + g.bob * 30 * Math.cos(2 * t), (guard ? 10 : 0) - yaw * 0.75, -roll * 0.3];
  pose.neck = [-g.lean * 0.4, guard ? 4 : yaw * 0.2, roll * 0.3];
  pose.head = [-g.lean * 0.45 - g.bob * 20 * Math.cos(2 * t) - (guard ? 6 : 0), guard ? 6 : yaw * 0.15, roll * 0.25];
  for (const f of feet) {
    const toeOut = f.sgn * (guard ? 8 : 4) * D2R;
    const ik = solveLeg(pose, f.S, [f.x, f.y, f.z], { pole: [f.sgn * 0.25, 0, 1], yaw: toeOut, pitch: f.psi });
    pose['thigh' + f.S] = ik.thigh;
    pose['shin' + f.S] = ik.shin;
    pose['foot' + f.S] = ik.foot;
    pose['toe' + f.S] = [f.toe * R2D * 0.8, 0, 0];
  }
  return pose;
}

// ---- turning on the spot ------------------------------------------------------------------------------------------
function turnPose(phi, sign, variant) {
  const T = TURN;
  const guard = variant === 'guard';
  const t = phi * Math.PI * 2;
  // footAt travel is in metres: scale it so one stance sweeps `turn * beta` radians of the circle
  const R = T.radius;
  const g = { D: T.turn * R, beta: T.beta, hs: T.hs, to: T.to, psiHs: 0, psiTo: 0, psiMid: 0, lift: T.lift, liftSkew: 0.7, swingShape: 1, bias: 0 };
  const fg = footGait(g);
  const feet = [];
  for (const [sgn, S, off] of [[1, 'L', 0], [-1, 'R', 0.5]]) {
    const f = footTrack((phi + off) % 1, fg, g);
    const a = sign * f.s / R; // angle of the foot about the middle: falls through the stance when she turns left
    const bx = sgn * (guard ? 0.12 : 0.1), bz = guard ? sgn * 0.04 : 0;
    // Ry(a) applied to the foot's resting spot
    const x = bx * Math.cos(a) + bz * Math.sin(a);
    const z = -bx * Math.sin(a) + bz * Math.cos(a);
    feet.push({ S, sgn, x, z, y: f.y, a, psi: 0 });
  }
  const bob = -0.05 + 0.006 * Math.cos(2 * (t - Math.PI * 2 * 0.3));
  const yawOsc = sign * 5 * Math.sin(t);
  const pose = { $hips: [0, bob, 0], hips: [guard ? 6 : 2, (guard ? -14 : 0) + yawOsc, 1.5 * Math.cos(t)] };
  Object.assign(pose, arms(variant, t, { D: 0.6 }));
  pose.spine = [guard ? 6 : 3, (guard ? 8 : 0) - yawOsc * 0.6, 0];
  pose.chest = [guard ? 4 : 2, (guard ? 10 : 0) - yawOsc * 0.8, 0];
  pose.neck = [0, guard ? 4 : 0, 0];
  pose.head = [guard ? -6 : -2, guard ? 6 : 0, 0];
  for (const f of feet) {
    const ik = solveLeg(pose, f.S, [f.x, f.y, f.z], { pole: [f.sgn * 0.25, 0, 1], yaw: f.a + f.sgn * (guard ? 8 : 4) * D2R, pitch: 0 });
    pose['thigh' + f.S] = ik.thigh;
    pose['shin' + f.S] = ik.shin;
    pose['foot' + f.S] = ik.foot;
    pose['toe' + f.S] = [0, 0, 0];
  }
  return pose;
}

export const STRAFE_CLIPS = [];
for (const set of ['guard', 'free']) {
  for (const k of Object.keys(STRAFE_GAITS)) STRAFE_CLIPS.push(`strafe_${set}_${k}`);
  STRAFE_CLIPS.push(`strafe_${set}_turn_l`, `strafe_${set}_turn_r`);
}

// The names the animator blends for each set: dirs[k] = [walk, run] for the direction k * 45 degrees from straight ahead
// toward her left (DIR_NAMES order), and the two turns.
export function strafeSet(set) {
  const n = (g) => `strafe_${set}_${g}`;
  return { dirs: DIR_NAMES.map((d) => [n(`walk_${d}`), n(`run_${d}`)]), turnL: n('turn_l'), turnR: n('turn_r') };
}

export function buildStrafe(lib, lazy) {
  // One block per set: asking for any clip of a set bakes the set's eighteen.
  for (const set of ['guard', 'free']) {
    const bake = () => {
      for (const [k, g] of Object.entries(STRAFE_GAITS)) {
        const name = `strafe_${set}_${k}`;
        lib[name] = bakeFn({ name, dur: g.T, loop: true, stride: g.D, refSpeed: g.D / g.T }, (u) => stepPose(u, g, set));
      }
      for (const [dir, sign] of [['l', 1], ['r', -1]]) {
        const name = `strafe_${set}_turn_${dir}`;
        lib[name] = bakeFn({ name, dur: TURN.T, loop: true, stride: TURN.turn, refSpeed: TURN.turn / TURN.T }, (u) => turnPose(u, sign, set));
      }
    };
    for (const n of STRAFE_CLIPS.filter((c) => c.startsWith(`strafe_${set}_`))) lazy[n] = bake;
  }
}

// Exposed for the test script (scripts/strafetest.mjs): the unbaked poses.
export { stepPose, turnPose, ANKLE_H, sstep };
