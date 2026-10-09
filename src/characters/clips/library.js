// The clip library: gestures, work, story beats, combat and riding, authored as key poses
// (semantic angles, see pose.js) with hand placement solved by reachArm / aimHand (lib.js)
// on the reference body. Principles: anticipation before big moves, overshoot and settle,
// overlap (distal bones lag through `overlap`), weight shifts in the legs and pelvis, arcs.
// Root-space coordinates: +X = character's left, +Y up, +Z forward, feet at the origin.
import { bakeKeys, bakeFn, mergePose, addPose, mirrorPose } from './pose.js';
import { stand, reachArm, aimHand, v3, FIST, GRIP, OPEN, RELAX } from './lib.js';
import { combatGuard, legIK, COLD_UPPER, standPose } from './locomotion.js';
import { REF } from './lib.js';

const ST = stand();
const HIPJ = REF.hipJY;

// Arm + hand helpers
const R = (p, S, t, o) => reachArm(p, S, v3(...t), o);
const elbowOut = (S) => v3(S === 'L' ? 1 : -1, -0.3, -0.25);
const elbowDown = (S) => v3((S === 'L' ? 1 : -1) * 0.3, -1, -0.15);
const elbowBack = (S) => v3((S === 'L' ? 1 : -1) * 0.25, -0.4, -1);
// Sword pose: right wrist at w, blade along dir.
const SW = (base, w, dir, extra) => aimHand(R(mergePose(base, extra), 'R', w, { elbow: v3(-0.5, -0.6, -0.4) }), 'R', v3(...dir));

// Legs solved for a pelvis drop and foot placements (root space).
function legs(pose, drop, fl, fr, o = {}) {
  const hipY = HIPJ + drop;
  const out = { ...pose, $hips: [o.x ?? 0, drop, o.z ?? 0] };
  for (const [sgn, S, f] of [[1, 'L', fl], [-1, 'R', fr]]) {
    const hip = { x: sgn * REF.hipJX + (o.x ?? 0), y: hipY, z: o.z ?? 0 };
    const ik = legIK(hip, { x: f[0], y: f[1], z: f[2] }, (f[3] || 0) * Math.PI / 180, 0, sgn);
    out['thigh' + S] = [ik.thigh[0], f[4] ?? 6, ik.thigh[2]];
    out['shin' + S] = ik.shin;
    out['foot' + S] = [ik.foot[0], f[4] ?? 6, ik.foot[2]];
    if (f[5] !== undefined) out['toe' + S] = [f[5], 0, 0];
  }
  return out;
}
const A = 0.081; // ankle height

export function buildLibrary(lib, lazy) {
  // Lazy blocks: a block bakes (all its clips) the first time any of its clips is requested.
  const B = (names, build) => { for (const n of names) lazy[n] = build; };
  const clip = (name, dur, keys, o = {}) => { lib[name] = bakeKeys({ name, dur, keys, base: o.base || ST, ...o }); };
  const fn = (name, dur, f, o = {}) => { lib[name] = bakeFn({ name, dur, ...o }, f); };


  // ------------------------------------------------------------------ conversation
  const palmUp = (p, S) => ({ ...p, ['hand' + S]: [-10, -70, 6], ...OPEN(S) });
  B(['talk_1'], () => {
  {
    let a = R(ST, 'R', [-0.14, 1.0, 0.26], { elbow: elbowDown('R') });
    a = palmUp(a, 'R');
    let b = R(ST, 'R', [-0.1, 1.06, 0.3], { elbow: elbowDown('R') });
    b = palmUp(b, 'R');
    b.handR = [-20, -60, 10];
    const lean = { spine: [3, -4, 0], chest: [2, -3, 0], head: [-3, -4, 2] };
    clip('talk_1', 2.6, [
      [0, {}], [0.45, { ...a, ...lean }, 'out'], [0.9, { ...b, ...lean, head: [1, -6, 3] }], [1.3, { ...a, ...lean }],
      [1.75, { ...b, ...lean, head: [-2, -2, 1] }], [2.6, {}],
    ], { overlap: { hand: 0.06, forearm: 0.03 } });
  }
  });
  B(['talk_2'], () => {
  {
    let p = R(ST, 'R', [-0.16, 1.02, 0.25], { elbow: elbowDown('R') });
    p = R(p, 'L', [0.16, 1.02, 0.25], { elbow: elbowDown('L') });
    p = palmUp(palmUp(p, 'R'), 'L');
    let q = R(ST, 'R', [-0.22, 1.08, 0.27], { elbow: elbowDown('R') });
    q = R(q, 'L', [0.22, 1.06, 0.27], { elbow: elbowDown('L') });
    q = palmUp(palmUp(q, 'R'), 'L');
    clip('talk_2', 2.8, [
      [0, {}], [0.5, { ...p, chest: [3, 0, 0] }, 'out'], [0.95, { ...q, chest: [4, 0, 0], head: [3, 0, 0] }],
      [1.4, { ...p }], [1.9, { ...q, head: [-2, 3, -2] }], [2.8, {}],
    ], { overlap: { hand: 0.07 } });
  }
  });
  B(['talk_3'], () => {
  {
    let p = R(ST, 'L', [0.12, 1.05, 0.28], { elbow: elbowDown('L') });
    p = palmUp(p, 'L');
    p.handL = [10, -40, 0];
    const hip = R(ST, 'R', [-0.18, 0.98, 0.02], { elbow: elbowOut('R') });
    clip('talk_3', 3, [
      [0, {}], [0.6, { ...p, armR: hip.armR, forearmR: hip.forearmR, handR: [-30, 0, 0], head: [2, 5, -4], hips: [0, 3, 2] }, 'out'],
      [1.2, { ...p, armR: hip.armR, forearmR: hip.forearmR, handR: [-30, 0, 0], handL: [-15, -60, 5], head: [-3, 4, -2] }],
      [1.9, { ...p, armR: hip.armR, forearmR: hip.forearmR, handR: [-30, 0, 0], head: [3, 6, -5] }], [3, {}],
    ], { overlap: { hand: 0.06 } });
  }
  });
  B(['point'], () => {
  {
    // point: anticipation (pull back), extend with overshoot, hold, settle back
    const back = R(ST, 'R', [-0.2, 1.15, 0.05], { elbow: elbowBack('R') });
    let ext = R(ST, 'R', [-0.32, 1.42, 0.5], { elbow: v3(-0.5, -0.6, 0) });
    ext = { ...ext, handR: [-5, 10, 4], ...OPEN('R'), fingersR: [10, 0, 0], fingers2R: [8, 0, 0], head: [-3, -18, 0], neck: [0, -6, 0], chest: [0, -8, 0] };
    const over = { ...ext, armR: [ext.armR[0] + 4, ext.armR[1], ext.armR[2]] };
    clip('point', 1.8, [[0, {}], [0.22, { ...back, chest: [0, 4, 0] }, 'in'], [0.45, over, 'snap'], [0.6, ext], [1.25, ext], [1.8, {}]],
      { overlap: { forearm: 0.03, hand: 0.06 } });
  }
  });
  B(['shrug'], () => {
  {
    let p = R(ST, 'R', [-0.3, 1.0, 0.2], { elbow: elbowDown('R') });
    p = R(p, 'L', [0.3, 1.0, 0.2], { elbow: elbowDown('L') });
    p = palmUp(palmUp(p, 'R'), 'L');
    const up = { ...p, shoulderL: [2, 0, 14], shoulderR: [2, 0, 14], head: [2, 0, 8], neck: [-3, 0, 0], $face: { browUp: 0.8, frown: 0.3 } };
    clip('shrug', 1.4, [[0, {}], [0.3, { ...p, $face: { browUp: 0.4 } }], [0.5, up, 'snap'], [0.8, up], [1.4, {}]], { overlap: { hand: 0.05 } });
  }
  });
  B(['nod'], () => {
  // additive head gestures (deltas from their first frame)
  clip('nod', 0.9, [[0, { head: [0, 0, 0], neck: [0, 0, 0] }], [0.18, { head: [14, 0, 0], neck: [4, 0, 0] }], [0.36, { head: [-3, 0, 0] }],
    [0.55, { head: [8, 0, 0], neck: [2, 0, 0] }], [0.9, { head: [0, 0, 0], neck: [0, 0, 0] }]], { base: {} });
  });
  B(['shake_head'], () => {
  clip('shake_head', 1.1, [[0, { head: [0, 0, 0] }], [0.18, { head: [2, 16, 0] }], [0.42, { head: [2, -16, 0] }], [0.66, { head: [1, 12, 0] }],
    [0.88, { head: [0, -5, 0] }], [1.1, { head: [0, 0, 0] }]], { base: {} });
  });
  B(['hit_flinch'], () => {
  clip('hit_flinch', 0.45, [[0, { chest: [0, 0, 0], head: [0, 0, 0] }], [0.08, { chest: [-8, 4, 0], head: [-10, 6, 0] }], [0.45, { chest: [0, 0, 0], head: [0, 0, 0] }]], { base: {} });
  });
  B(['cross_arms'], () => {
  {
    let p = R(ST, 'L', [-0.12, 1.18, 0.2], { elbow: elbowDown('L') });
    p = R(p, 'R', [0.11, 1.15, 0.17], { elbow: elbowDown('R') });
    p = { ...p, handL: [30, 20, 0], handR: [35, 20, 0], ...RELAX('L'), ...RELAX('R'), shoulderL: [6, 0, 3], shoulderR: [6, 0, 3] };
    const w1 = standPose(0.014, 2, 0.8, 0, {}), w2 = standPose(-0.01, -1.5, 0.3, 0, {});
    const legsOf = (s) => ({ $hips: s.$hips, thighL: s.thighL, thighR: s.thighR, shinL: s.shinL, shinR: s.shinR, footL: s.footL, footR: s.footR, hips: s.hips, spine: s.spine });
    clip('cross_arms', 5, [[0, { ...p, ...legsOf(w1) }], [2.5, { ...p, ...legsOf(w2), head: [2, -5, 2] }], [5, { ...p, ...legsOf(w1) }]], { loop: true, fadeIn: 0.45 });
  }
  });
  B(['hands_hips'], () => {
  {
    let p = R(ST, 'L', [0.19, 0.99, 0.04], { elbow: elbowOut('L') });
    p = R(p, 'R', [-0.19, 0.99, 0.04], { elbow: elbowOut('R') });
    p = { ...p, handL: [-25, 0, 25], handR: [-25, 0, 25], ...RELAX('L'), ...RELAX('R'), chest: [-3, 0, 0], head: [-3, 0, 0] };
    const w1 = standPose(0.016, 2.5, 0.85, 0, {}), w2 = standPose(0.01, 1.5, 0.7, 0, {});
    clip('hands_hips', 5, [[0, { ...p, $hips: w1.$hips, thighL: w1.thighL, thighR: w1.thighR, shinR: w1.shinR, shinL: w1.shinL, hips: w1.hips }],
      [2.5, { ...p, $hips: w2.$hips, thighL: w2.thighL, thighR: w2.thighR, shinR: w2.shinR, shinL: w2.shinL, head: [-2, 6, 2] }],
      [5, { ...p, $hips: w1.$hips, thighL: w1.thighL, thighR: w1.thighR, shinR: w1.shinR, shinL: w1.shinL, hips: w1.hips }]], { loop: true, fadeIn: 0.45 });
  }
  });
  B(['beckon'], () => {
  {
    let p = R(ST, 'R', [-0.18, 1.12, 0.3], { elbow: elbowDown('R') });
    p = palmUp(p, 'R');
    const c1 = { ...p, fingersR: [80, 0, 0], fingers2R: [90, 0, 0] };
    clip('beckon', 1.5, [[0, {}], [0.3, p, 'out'], [0.5, c1], [0.7, p], [0.9, c1], [1.1, p], [1.5, {}]], { overlap: { hand: 0.04 } });
  }
  });
  B(['wave'], () => {
  {
    const up = R(ST, 'R', [-0.34, 1.68, 0.12], { elbow: v3(-1, -0.4, 0) });
    const w = (a) => ({ ...up, handR: [a, -40, 0], ...OPEN('R'), forearmR: [up.forearmR[0], up.forearmR[1] + a * 0.4, 0], head: [-4, -6, 0] });
    clip('wave', 2, [[0, {}], [0.35, w(0), 'out'], [0.55, w(28)], [0.75, w(-22)], [0.95, w(26)], [1.15, w(-20)], [1.35, w(10)], [2, {}]], { overlap: { hand: 0.05 } });
  }
  });
  B(['kneel', 'kneel_idle', 'stand_up', 'sit_bench', 'sit_ground', 'lie_dead', 'crouch_examine'], () => {
  
    // ------------------------------------------------------------------ kneel, sit, lie, crouch
    const KNEEL = (() => {
      let p = legs(ST, -0.44, [0.1, A, 0.44, 0], [-0.1, 0.11, -0.34, -50, 4, 50], { z: 0.04 });
      p = R(p, 'L', [0.14, 0.52, 0.36], { elbow: elbowOut('L') });
      p = R(p, 'R', [-0.1, 0.5, 0.3], { elbow: elbowOut('R') });
      return { ...p, spine: [8, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0], head: [6, 0, 0], handL: [10, 0, 0], handR: [10, 0, 0] };
    })();
    {
      const step = legs(ST, -0.1, [0.1, A + 0.04, 0.38, 6], [-0.1, A, -0.05, 0], { z: 0.06 });
      const mid = legs(ST, -0.3, [0.1, A, 0.44, 0], [-0.1, 0.2, -0.25, -30, 4, 30], { z: 0.05 });
      clip('kneel', 1.5, [[0, {}], [0.4, { ...step, spine: [6, 0, 0] }], [0.9, { ...mid, spine: [14, 0, 0], chest: [6, 0, 0] }], [1.25, { ...KNEEL, spine: [10, 0, 0] }], [1.5, KNEEL]],
        { then: 'kneel_idle', overlap: { head: 0.06, chest: 0.03 } });
      clip('kneel_idle', 4, [[0, KNEEL], [2, { ...KNEEL, head: [10, 3, 1], chest: [7, 0, 0] }], [4, KNEEL]], { loop: true });
      const push = { ...mid, spine: [22, 0, 0], chest: [10, 0, 0], head: [-5, 0, 0], ...R(R(mid, 'L', [0.12, 0.55, 0.4], { elbow: elbowOut('L') }), 'R', [-0.06, 0.6, 0.38], { elbow: elbowOut('R') }) };
      clip('stand_up', 1.6, [[0, KNEEL], [0.35, { ...KNEEL, spine: [16, 0, 0], chest: [8, 0, 0] }], [0.8, push, 'out'], [1.2, { ...step, spine: [8, 0, 0] }], [1.6, {}]],
        { overlap: { head: 0.08, armL: 0.05, armR: 0.05 } });
    }
    {
      const seatY = 0.47;
      let p = legs(ST, seatY - HIPJ + 0.03, [0.12, A, 0.42, 0, 12], [-0.12, A, 0.4, 0, 12], { z: -0.06 });
      p.thighL = [88, 10, 6]; p.thighR = [86, 10, 6];
      p = R(p, 'L', [0.14, 0.58, 0.32], { elbow: elbowOut('L') });
      p = R(p, 'R', [-0.14, 0.58, 0.32], { elbow: elbowOut('R') });
      const sit = { ...p, spine: [10, 0, 0], chest: [8, 0, 0], neck: [4, 0, 0], head: [-6, 0, 0], handL: [20, 0, 0], handR: [20, 0, 0] };
      sit.shinL = [88, 0, 0]; sit.shinR = [86, 0, 0]; sit.footL = [-2, 8, 0]; sit.footR = [-2, 8, 0];
      sit.$hips = [0, seatY - HIPJ + 0.02, -0.05];
      clip('sit_bench', 5, [[0, sit], [2.5, { ...sit, spine: [12, 2, 1], head: [-3, 6, 2] }], [5, sit]], { loop: true, fadeIn: 0.6 });
      lib.sit_bench.pose = sit;
      const g = {
        $hips: [0, 0.12 - HIPJ, -0.15], hips: [-12, 0, 0], spine: [18, 0, 0], chest: [14, 0, 0], neck: [6, 0, 0], head: [-14, 0, 0],
        thighL: [70, 12, 16], thighR: [72, 12, 14], shinL: [115, 0, 0], shinR: [112, 0, 0], footL: [10, 10, 0], footR: [10, 10, 0],
      };
      let gp = R(g, 'L', [0.06, 0.45, 0.3], { elbow: elbowOut('L') });
      gp = R(gp, 'R', [-0.06, 0.46, 0.3], { elbow: elbowOut('R') });
      gp = { ...gp, handL: [30, 0, 0], handR: [30, 0, 0] };
      clip('sit_ground', 5, [[0, gp], [2.5, { ...gp, head: [-10, 8, 3], chest: [16, 0, 0] }], [5, gp]], { loop: true, fadeIn: 0.8 });
    }
    {
      const dead = {
        $hips: [0, 0.11 - 0.975, -0.0], hips: [-90, 8, 6], spine: [-4, 4, 3], chest: [-3, 3, 0], neck: [6, 22, 0], head: [10, 30, 8],
        thighL: [6, 14, 10], thighR: [12, -6, 4], shinL: [8, 0, 0], shinR: [22, 0, 0], footL: [-30, 20, 0], footR: [-25, -10, 0],
        armL: [20, 10, 30], forearmL: [30, 20, 0], armR: [-10, -20, 10], forearmR: [60, 30, 0], handL: [20, 0, 0], handR: [-10, 0, 0],
        ...RELAX('L'), ...RELAX('R'), jaw: [4, 0, 0], $face: { eyesClosed: 0.85 },
      };
      clip('lie_dead', 4, [[0, dead], [4, dead]], { loop: true, fadeIn: 0.4, base: dead });
    }
    {
      let p = legs(ST, -0.46, [0.14, A + 0.03, 0.12, -10, 14, 25], [-0.13, A + 0.06, -0.1, -25, 14, 35], { z: -0.08 });
      p = { ...p, spine: [26, 0, 0], chest: [14, 0, 0], neck: [8, 0, 0], head: [12, 0, 0] };
      let q = R(p, 'R', [-0.08, 0.14, 0.48], { elbow: elbowOut('R') });
      q = R(q, 'L', [0.16, 0.48, 0.25], { elbow: elbowOut('L') });
      q = { ...q, handR: [-10, 30, 0], ...OPEN('R'), handL: [20, 0, 0] };
      const q2 = R(q, 'R', [-0.04, 0.16, 0.42], { elbow: elbowOut('R') });
      clip('crouch_examine', 4, [[0, q], [1.2, { ...q2, head: [16, 6, 2] }], [2.4, { ...q, handR: [-30, 60, 0], head: [14, -4, 0] }], [4, q]], { loop: true, fadeIn: 0.5 });
    }
  });

  B(['look_back', 'carry_torch', 'carry_pole', 'hug', 'cry', 'warm_hands', 'chop_wood', 'hammer', 'sweep', 'stir', 'fish_ice', 'mend_net', 'carry_bucket', 'throw_snowball', 'child_play'], () => {

  // ------------------------------------------------------------------ look back (the key gesture)
  {
    const hes = { shoulderL: [0, 0, 3], shoulderR: [0, 0, 3], head: [3, 4, 0], neck: [2, 0, 0], chest: [0, 2, 0], $face: { browDown: 0.2 } };
    const turned = {
      hips: [0, 3, 0], spine: [2, 10, 0], chest: [3, 20, -2], neck: [0, 26, 2], head: [-6, 70, 8],
      shoulderL: [-6, 0, 2], shoulderR: [8, 0, 0], armL: [-8, 6, -24], armR: [10, 6, -26], forearmL: [18, 8, 0],
      $face: { browSad: 0.55, browUp: 0.15 },
    };
    const held = { ...turned, head: [-4, 73, 9], chest: [3, 21, -2], $face: { browSad: 0.7, browUp: 0.1, frown: 0.15 } };
    clip('look_back', 3.6, [[0, {}], [0.45, hes, 'slow'], [1.75, turned, 'slow'], [2.2, held], [3.6, held]],
      { overlap: { head: 0.12, neck: 0.08, chest: 0.04, spine: 0.0 }, fadeOut: 1.1, upperMask: { spine: 1, chest: 1, neck: 1, head: 1, shoulderL: 1, shoulderR: 1, armL: 0.6, armR: 0.6, forearmL: 0.6, forearmR: 0.6 } });
  }

  // ------------------------------------------------------------------ carrying and holding
  {
    let p = R(ST, 'R', [-0.2, 1.24, 0.3], { elbow: elbowDown('R') });
    p = { ...aimHand(p, 'R', v3(0, 1, 0.15)), ...FIST('R') };
    const torch = { ...p, shoulderR: [4, 0, 2], head: [0, -4, 0] };
    clip('carry_torch', 2, [[0, torch], [1, { ...torch, armR: [torch.armR[0] + 2, torch.armR[1], torch.armR[2]] }], [2, torch]],
      { loop: true, upperMask: { shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1, chest: 0.2 } });
  }
  {
    let p = R(ST, 'R', [-0.05, 1.3, 0.26], { elbow: elbowDown('R') });
    p = R(p, 'L', [0.02, 1.02, 0.25], { elbow: elbowDown('L') });
    p = { ...aimHand(aimHand(p, 'R', v3(0, 1, 0.05)), 'L', v3(0, 1, 0.05)), ...FIST('R'), ...FIST('L'), chest: [-3, 0, 0], head: [-2, 0, 0] };
    clip('carry_pole', 2, [[0, p], [1, { ...p, chest: [-4, 0, 0] }], [2, p]], { loop: true, upperMask: { spine: 0.5, chest: 1, shoulderL: 1, armL: 1, forearmL: 1, handL: 1, fingersL: 1, fingers2L: 1, thumbL: 1, shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1 } });
  }
  {
    let p = R(ST, 'L', [-0.14, 1.28, 0.36], { elbow: elbowOut('L') });
    p = R(p, 'R', [0.12, 1.18, 0.34], { elbow: elbowOut('R') });
    p = { ...p, handL: [40, 0, 0], handR: [40, 0, 0], ...RELAX('L'), ...RELAX('R'), spine: [6, 0, 0], chest: [8, 0, 0], neck: [4, 0, 0], head: [6, 18, 12],
      $hips: [0, -0.01, 0.04], $face: { eyesClosed: 0.6, browSad: 0.5 } };
    clip('hug', 3, [[0, {}], [0.6, p, 'out'], [1.8, { ...p, chest: [9, 2, 2] }], [3, p]], { loop: false, hold: true, overlap: { forearm: 0.06, hand: 0.1 } });
  }
  {
    let p = R(ST, 'L', [0.045, 1.5, 0.22], { elbow: elbowDown('L') });
    p = R(p, 'R', [-0.045, 1.5, 0.22], { elbow: elbowDown('R') });
    p = { ...p, handL: [30, 60, 0], handR: [30, 60, 0], ...RELAX('L'), ...RELAX('R'), spine: [8, 0, 0], chest: [12, 0, 0], neck: [12, 0, 0], head: [22, 0, 0],
      shoulderL: [8, 0, 4], shoulderR: [8, 0, 4], $face: { browSad: 1, frown: 0.6, eyesClosed: 0.7, squint: 0.4 } };
    const sob = { ...p, chest: [16, 0, 0], shoulderL: [10, 0, 9], shoulderR: [10, 0, 9], head: [25, 0, 2], $face: { browSad: 1, frown: 0.8, eyesClosed: 0.9, jawOpen: 0.25 } };
    clip('cry', 2.4, [[0, p], [0.3, sob, 'snap'], [0.6, p], [0.85, sob, 'snap'], [1.2, p], [2.4, p]], { loop: true, fadeIn: 0.6 });
  }
  {
    let p = R(ST, 'L', [0.09, 1.04, 0.36], { elbow: elbowDown('L') });
    p = R(p, 'R', [-0.09, 1.04, 0.36], { elbow: elbowDown('R') });
    p = { ...p, handL: [-30, -80, 0], handR: [-30, -80, 0], ...OPEN('L'), ...OPEN('R'), spine: [6, 0, 0], chest: [6, 0, 0], head: [8, 0, 0] };
    let rub = R(p, 'L', [0.02, 1.08, 0.33], { elbow: elbowDown('L') });
    rub = R(rub, 'R', [-0.02, 1.08, 0.33], { elbow: elbowDown('R') });
    rub = { ...rub, handL: [-10, -20, 30], handR: [-10, -20, 30] };
    const rub2 = R(R(rub, 'L', [0.025, 1.1, 0.31], { elbow: elbowDown('L') }), 'R', [-0.015, 1.06, 0.34], { elbow: elbowDown('R') });
    clip('warm_hands', 4, [[0, p], [1.4, p], [1.7, rub], [1.95, rub2], [2.2, rub], [2.45, rub2], [2.8, p], [4, p]], { loop: true, fadeIn: 0.5 });
  }

  // ------------------------------------------------------------------ work
  {
    const base = legs(ST, -0.04, [0.13, A, 0.12, 0, 12], [-0.13, A, -0.12, 0, 12]);
    const both = (p, w1, w2, dir) => {
      let q = R(p, 'R', w1, { elbow: elbowDown('R') });
      q = R(q, 'L', w2, { elbow: elbowDown('L') });
      q = aimHand(aimHand(q, 'R', v3(...dir)), 'L', v3(...dir));
      return { ...q, ...FIST('R'), ...FIST('L') };
    };
    const up = both({ ...base, spine: [-8, 0, 0], chest: [-10, 0, 0], head: [-6, 0, 0] }, [-0.04, 1.86, -0.02], [0.02, 1.74, 0.0], [0, 0.4, -1]);
    const hit = both({ ...legs(ST, -0.14, [0.13, A, 0.12, 0, 12], [-0.13, A, -0.12, 0, 12]), spine: [28, 0, 0], chest: [16, 0, 0], head: [10, 0, 0] }, [-0.02, 0.86, 0.44], [0.02, 0.98, 0.34], [0, -0.6, 1]);
    const lift = both({ ...base, spine: [18, 0, 0], chest: [8, 0, 0] }, [-0.04, 1.0, 0.36], [0.02, 1.08, 0.3], [0, 0.2, 1]);
    clip('chop_wood', 1.7, [[0, lift], [0.55, up, 'out'], [0.72, up], [0.88, hit, 'snap'], [1.1, hit], [1.7, lift]],
      { loop: true, base, events: [[0.86, 'hit']], overlap: { head: 0.05 } });
  }
  {
    const base = legs(ST, -0.03, [0.12, A, 0.1, 0, 10], [-0.13, A, -0.1, 0, 14]);
    let tong = R({ ...base, spine: [12, 0, 0], chest: [6, 0, 0], head: [12, 0, 0] }, 'L', [0.12, 0.98, 0.36], { elbow: elbowDown('L') });
    tong = { ...tong, ...FIST('L') };
    const up = aimHand(R(tong, 'R', [-0.22, 1.42, 0.16], { elbow: elbowBack('R') }), 'R', v3(0, 0.3, 1));
    const down = aimHand(R({ ...tong, spine: [16, 0, 0] }, 'R', [-0.12, 1.0, 0.36], { elbow: elbowDown('R') }), 'R', v3(0, -0.5, 1));
    clip('hammer', 1.0, [[0, { ...down, ...FIST('R') }], [0.45, { ...up, ...FIST('R') }, 'out'], [0.62, { ...up, ...FIST('R') }], [0.74, { ...down, ...FIST('R') }, 'snap'], [1.0, { ...down, ...FIST('R') }]],
      { loop: true, base, events: [[0.73, 'hit']] });
  }
  {
    const base = legs(ST, -0.06, [0.14, A, 0.1, 0, 12], [-0.14, A, -0.12, 0, 12]);
    const sw = (x) => {
      let q = R({ ...base, spine: [18, -x * 40, 0], chest: [8, -x * 30, 0], head: [10, 0, 0] }, 'R', [-0.1 + x * 0.2, 0.86, 0.34], { elbow: elbowDown('R') });
      q = R(q, 'L', [0.05 + x * 0.1, 1.15, 0.2], { elbow: elbowDown('L') });
      return { ...aimHand(aimHand(q, 'R', v3(-0.2, 0.9, -0.4)), 'L', v3(-0.2, 0.9, -0.4)), ...FIST('R'), ...FIST('L') };
    };
    clip('sweep', 1.6, [[0, sw(-0.5)], [0.8, sw(0.5)], [1.6, sw(-0.5)]], { loop: true, base });
  }
  {
    const base = legs(ST, -0.03, [0.12, A, 0.08, 0, 10], [-0.12, A, -0.06, 0, 10]);
    const st = { ...base, spine: [14, 0, 0], chest: [8, 0, 0], head: [16, 0, 0] };
    let l = R(st, 'L', [0.16, 1.0, 0.36], { elbow: elbowDown('L') });
    l = { ...l, handL: [10, -30, 0], ...RELAX('L') };
    const at = (a) => ({ ...aimHand(R(l, 'R', [-0.04 + Math.cos(a) * 0.08, 1.0, 0.42 + Math.sin(a) * 0.06], { elbow: elbowDown('R') }), 'R', v3(0, -1, 0.1)), ...FIST('R') });
    clip('stir', 2, [[0, at(0)], [0.5, at(Math.PI / 2)], [1, at(Math.PI)], [1.5, at(Math.PI * 1.5)], [2, at(0)]], { loop: true, base });
  }
  {
    const seat = {
      $hips: [0, 0.36 - HIPJ, -0.04], hips: [6, 0, 0], spine: [20, 0, 0], chest: [12, 0, 0], neck: [6, 0, 0], head: [14, 0, 0],
      thighL: [80, 16, 14], thighR: [80, 16, 14], shinL: [118, 0, 0], shinR: [116, 0, 0], footL: [20, 10, 0], footR: [20, 10, 0],
    };
    let p = R(seat, 'R', [-0.06, 0.6, 0.4], { elbow: elbowDown('R') });
    p = R(p, 'L', [0.14, 0.54, 0.34], { elbow: elbowDown('L') });
    p = { ...aimHand(p, 'R', v3(0.1, 0.2, 1)), ...FIST('R'), handL: [20, 0, 0] };
    const jig = aimHand(R(p, 'R', [-0.06, 0.66, 0.38], { elbow: elbowDown('R') }), 'R', v3(0.1, 0.35, 1));
    clip('fish_ice', 4, [[0, p], [1.6, p], [1.75, { ...jig, ...FIST('R') }, 'snap'], [1.95, p], [2.6, p], [2.72, { ...jig, ...FIST('R') }, 'snap'], [2.9, p], [4, { ...p, head: [16, 6, 2] }]],
      { loop: true, base: seat, fadeIn: 0.7 });
  }
  {
    const st = { ...ST, spine: [10, 0, 0], chest: [6, 0, 0], head: [18, 0, 0] };
    const h = (x, y) => {
      let q = R(st, 'L', [0.1 + x, 1.12 + y, 0.32], { elbow: elbowDown('L') });
      q = R(q, 'R', [-0.1 + x, 1.12 - y, 0.32], { elbow: elbowDown('R') });
      return { ...q, handL: [20, -50, 0], handR: [20, -50, 0], fingersL: [50, 0, 0], fingersR: [40, 0, 0] };
    };
    clip('mend_net', 3, [[0, h(0, 0)], [0.6, h(0.02, 0.03)], [1.1, h(-0.01, -0.02)], [1.6, { ...h(0.03, 0.02), fingersR: [80, 0, 0] }], [2.2, h(0, -0.03)], [3, h(0, 0)]], { loop: true });
  }
  {
    const p = {
      ...ST, armR: [2, 4, -27], forearmR: [4, 10, 0], handR: [0, 0, 0], ...FIST('R'), shoulderR: [0, 0, -7],
      spine: [0, 0, 7], chest: [0, 0, 4], armL: [6, 0, -14], forearmL: [20, 0, 0], head: [0, 0, -4],
    };
    clip('carry_bucket', 2, [[0, p], [1, { ...p, armL: [6, 0, -12] }], [2, p]], { loop: true, upperMask: { spine: 1, chest: 1, shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1, armL: 0.7, forearmL: 0.7, head: 0.5 } });
  }
  {
    const base = legs(ST, -0.03, [0.12, A, 0.2, 0, 10], [-0.14, A, -0.15, 0, 18]);
    const wind = { ...R({ ...base, chest: [-6, -28, 0], spine: [-2, -16, 0], hips: [0, -10, 0], head: [0, 26, 0] }, 'R', [-0.28, 1.52, -0.22], { elbow: elbowDown('R') }), ...FIST('R') };
    const wind2 = R(wind, 'L', [0.25, 1.35, 0.3], { elbow: elbowDown('L') });
    const rel = { ...R({ ...legs(ST, -0.06, [0.12, A, 0.3, 0, 10], [-0.14, A + 0.04, -0.2, -20, 18]), chest: [6, 18, 0], spine: [4, 12, 0], hips: [0, 8, 0], head: [0, -8, 0] }, 'R', [-0.12, 1.48, 0.5], { elbow: elbowDown('R') }), ...OPEN('R') };
    const fol = R({ ...rel, chest: [14, 26, 0], spine: [8, 16, 0] }, 'R', [0.14, 1.06, 0.36], { elbow: elbowDown('R') });
    clip('throw_snowball', 1.5, [[0, {}], [0.45, wind2, 'out'], [0.62, rel, 'snap'], [0.85, fol], [1.5, {}]], { events: [[0.6, 'release']], overlap: { forearm: 0.03, hand: 0.05 } });
  }
  fn('child_play', 1.2, (u) => {
    const t = u * Math.PI * 2;
    const hop = Math.max(0, Math.sin(t * 2));
    const w = 0.5 + 0.5 * Math.sin(t);
    const p = standPose(0.03 * Math.sin(t), 5 * Math.sin(t), w, t, { knee: 12 });
    p.$hips[1] += hop * 0.08 - 0.03;
    p.thighL = [p.thighL[0] + 25 * Math.max(0, Math.sin(t)), 6, p.thighL[2]];
    p.shinL = [p.shinL[0] + 40 * Math.max(0, Math.sin(t)), 0, 0];
    p.thighR = [p.thighR[0] + 25 * Math.max(0, -Math.sin(t)), 6, p.thighR[2]];
    p.shinR = [p.shinR[0] + 40 * Math.max(0, -Math.sin(t)), 0, 0];
    p.armL = [20 + 30 * Math.sin(t), 0, 10 + 25 * hop]; p.armR = [20 - 30 * Math.sin(t), 0, 10 + 25 * hop];
    p.forearmL = [40, 0, 0]; p.forearmR = [40, 0, 0];
    p.head = [-6, 12 * Math.sin(t), 4 * Math.cos(t)];
    p.$face = { smile: 0.8 };
    return p;
  }, { loop: true });
  });
  B(['drink'], () => {
  {
    const cup = (y, z) => ({ ...aimHand(R(ST, 'R', [-0.07, y, z], { elbow: elbowDown('R') }), 'R', v3(0, 1, 0)), ...GRIP('R') });
    const sip = { ...cup(1.5, 0.15), head: [-16, 0, 0], neck: [-6, 0, 0] };
    clip('drink', 2.6, [[0, {}], [0.4, cup(1.05, 0.3)], [0.9, cup(1.45, 0.17)], [1.1, sip], [1.75, sip], [2.05, cup(1.12, 0.3)], [2.6, {}]],
      { overlap: { head: 0.08 }, events: [[1.1, 'sip']] });
  }
  });
  B(['eat'], () => {
  {
    const bite = (y, z, j) => ({ ...R(R(ST, 'R', [-0.06, y, z], { elbow: elbowDown('R') }), 'L', [0.1, 1.0, 0.28], { elbow: elbowDown('L') }), ...GRIP('R'), ...GRIP('L'), $face: { jawOpen: j } });
    clip('eat', 3, [[0, bite(1.02, 0.3, 0)], [0.5, bite(1.52, 0.15, 0.5)], [0.75, bite(1.5, 0.15, 0.1)], [1.0, bite(1.1, 0.3, 0.3)], [1.3, bite(1.05, 0.3, 0.05)],
      [1.6, bite(1.05, 0.3, 0.3)], [1.9, bite(1.05, 0.3, 0.05)], [2.2, bite(1.05, 0.3, 0.25)], [3, bite(1.02, 0.3, 0)]], { loop: true });
  }
  });
  B(['lean_wall'], () => {
  {
    const lean = {
      ...legs(ST, -0.03, [0.06, A, 0.2, 0, 6], [-0.08, A + 0.01, 0.18, 0, 16], { z: -0.05 }),
      hips: [-8, 0, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], neck: [6, 0, 0], head: [6, 0, 0],
    };
    lean.thighR = [lean.thighR[0], 6, -8];
    let p = R(lean, 'L', [-0.11, 1.15, 0.19], { elbow: elbowDown('L') });
    p = R(p, 'R', [0.1, 1.13, 0.16], { elbow: elbowDown('R') });
    p = { ...p, handL: [30, 20, 0], handR: [35, 20, 0], ...RELAX('L'), ...RELAX('R') };
    clip('lean_wall', 5, [[0, p], [2.5, { ...p, head: [4, 10, 3] }], [5, p]], { loop: true, fadeIn: 0.6 });
  }
  });
  B(['pray'], () => {
  {
    let p = R({ ...ST, spine: [4, 0, 0], chest: [4, 0, 0], neck: [10, 0, 0], head: [22, 0, 0] }, 'L', [0.02, 1.26, 0.22], { elbow: elbowDown('L') });
    p = R(p, 'R', [-0.02, 1.26, 0.22], { elbow: elbowDown('R') });
    p = { ...aimHand(aimHand(p, 'L', v3(0, 1, 0.3)), 'R', v3(0, 1, 0.3)), ...OPEN('L'), ...OPEN('R'), $face: { eyesClosed: 0.9 } };
    clip('pray', 4, [[0, p], [2, { ...p, head: [24, 0, 0] }], [4, p]], { loop: true, fadeIn: 0.7 });
  }
  });
  B(['fall_through_ice', 'drown_reach', 'combat_idle', 'block_idle', 'draw_sword', 'sheathe_sword', 'attack_1', 'attack_2', 'attack_3', 'heavy_attack', 'dodge_left', 'dodge_right', 'dodge_back', 'roll', 'parry', 'hit_react', 'stagger', 'death', 'cast_sign', 'senses', 'drink_potion'], () => {
  
    // ------------------------------------------------------------------ the ice
    {
      const arms = (p, l, r) => R(R(p, 'L', l, { elbow: elbowOut('L') }), 'R', r, { elbow: elbowOut('R') });
      const stumble = { ...legs(ST, -0.08, [0.12, A, 0.08, 0, 8], [-0.12, A, -0.04, 0, 8]), spine: [6, 0, 0], ...arms(ST, [0.35, 1.2, 0.2], [-0.35, 1.15, 0.2]), $face: { browUp: 1, jawOpen: 0.5 } };
      const drop = {
        $hips: [0, -0.72, 0.05], hips: [-6, 0, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-18, 0, 0],
        thighL: [30, 8, 10], thighR: [10, 8, 14], shinL: [50, 0, 0], shinR: [30, 0, 0], footL: [-30, 0, 0], footR: [-30, 0, 0],
        $face: { browUp: 1, jawOpen: 0.9 },
      };
      const grab = { ...drop, $hips: [0, -1.02, 0.0], spine: [16, 0, 0], chest: [10, 0, 0], head: [-26, 0, 0] };
      const slip = { ...grab, $hips: [0, -1.25, -0.02], head: [-30, 0, 0], $face: { browUp: 1, browSad: 0.6, jawOpen: 0.6 } };
      const sink = { ...slip, $hips: [0, -1.65, 0], spine: [4, 0, 0], head: [-34, 0, 0], thighL: [20, 8, 10], shinL: [40, 0, 0], $face: { browSad: 1, eyesClosed: 0.3, jawOpen: 0.4 } };
      clip('fall_through_ice', 2.6, [
        [0, {}], [0.14, stumble], [0.4, { ...drop, ...arms(drop, [0.4, 0.75, 0.12], [-0.4, 0.75, 0.12]) }, 'snap'],
        [0.85, { ...grab, ...arms(grab, [0.3, 0.06, 0.32], [-0.3, 0.06, 0.32]), handL: [-30, -80, 0], handR: [-30, -80, 0], ...OPEN('L'), ...OPEN('R') }],
        [1.6, { ...slip, ...arms(slip, [0.26, -0.02, 0.3], [-0.24, -0.03, 0.32]), ...GRIP('L'), ...GRIP('R') }],
        [2.6, { ...sink, ...arms(sink, [0.22, -0.2, 0.18], [-0.2, -0.16, 0.2]), ...OPEN('L'), ...OPEN('R') }],
      ], { hold: true, events: [[0.12, 'crack'], [0.4, 'splash']], overlap: { head: 0.05, forearm: 0.04, hand: 0.08 } });
      const under = { ...sink, $hips: [0, -1.5, 0], hips: [-4, 0, 0], thighL: [14, 6, 10], thighR: [24, 6, 8], shinL: [30, 0, 0], shinR: [50, 0, 0], footL: [-40, 0, 0], footR: [-40, 0, 0] };
      const r1 = { ...under, ...arms(under, [0.22, -0.04, 0.22], [-0.2, -0.08, 0.2]), ...OPEN('L'), ...OPEN('R') };
      const r2 = { ...under, $hips: [0, -1.45, 0], ...arms(under, [0.18, -0.1, 0.16], [-0.24, -0.02, 0.24]), ...GRIP('L'), ...GRIP('R') };
      clip('drown_reach', 3, [[0, r1], [0.8, r2], [1.6, { ...r1, head: [-28, 6, 0] }], [2.3, { ...r2, head: [-32, -5, 0] }], [3, r1]], { loop: true, base: under });
    }
  
    // ------------------------------------------------------------------ combat
    const GUARD = combatGuard(0, 0);
    const G2 = SW(GUARD, [-0.14, 1.1, 0.3], [0.05, 0.55, 1], { ...FIST('R') });
    const GUARDP = { ...G2, ...FIST('R') };
    lib.combat_idle = bakeFn({ name: 'combat_idle', dur: 2.2, loop: true }, (u) => {
      const t = u * Math.PI * 2;
      const g = combatGuard(Math.sin(t), t);
      return { ...g, armR: GUARDP.armR, forearmR: GUARDP.forearmR, handR: GUARDP.handR, ...FIST('R'), head: [-6 + Math.sin(t * 2) * 1.5, 6, 0] };
    });
    lib.block_idle = bakeFn({ name: 'block_idle', dur: 1.8, loop: true }, (u) => {
      const t = u * Math.PI * 2;
      const g = combatGuard(Math.sin(t) * 0.6, t);
      const b = SW(g, [-0.05, 1.32, 0.34], [1, 0.25, 0.15], { ...FIST('R') });
      return { ...b, ...FIST('R'), ...R(b, 'L', [0.14, 1.2, 0.2], { elbow: elbowDown('L') }), handL: [-20, 0, 0], ...OPEN('L') };
    });
    {
      // draw: reach over the right shoulder, grab (event), arc up and out to the guard
      const reach = { ...R({ ...ST, chest: [0, -10, 0], head: [0, -8, 0] }, 'R', [-0.12, 1.66, -0.1], { elbow: v3(-1, 0.3, 0.3) }), ...OPEN('R'), shoulderR: [0, 0, 10] };
      const grab = { ...reach, ...FIST('R') };
      const pull = SW({ ...ST, chest: [0, -6, 0] }, [-0.32, 1.72, 0.12], [-0.3, 0.9, 0.3], { ...FIST('R'), shoulderR: [0, 0, 12] });
      clip('draw_sword', 1.0, [[0, {}], [0.3, reach, 'out'], [0.38, grab], [0.6, { ...pull, ...FIST('R') }, 'snap'], [1.0, GUARDP]],
        { events: [[0.4, 'sword_draw']], overlap: { forearm: 0.02, hand: 0.04 }, upperMask: { spine: 0.5, chest: 1, neck: 1, head: 1, shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1 } });
      clip('sheathe_sword', 1.1, [[0, GUARDP], [0.4, { ...pull, ...FIST('R') }, 'out'], [0.62, grab], [0.68, reach], [1.1, {}]],
        { events: [[0.62, 'sword_sheathe']], overlap: { hand: 0.04 }, upperMask: { spine: 0.5, chest: 1, neck: 1, head: 1, shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1 } });
    }
    const stance = (drop, fl, fr, o) => legs(GUARD, drop, fl, fr, o);
    const LUNGE = (z) => stance(-0.12, [0.12, A, 0.45 + z, 0, 10], [-0.12, A + 0.03, -0.3, -18, 20, 20], { z: 0.08 + z });
    const BACKW = stance(-0.08, [0.12, A, 0.25, 0, 10], [-0.13, A, -0.25, 0, 22], { z: -0.04 });
    {
      const wind = SW({ ...BACKW, hips: [6, -40, 0], spine: [4, -14, 0], chest: [2, -18, 0], head: [-6, 26, 0] }, [-0.3, 1.52, 0.02], [0.2, 0.7, -0.7]);
      const mid = SW({ ...LUNGE(0), hips: [8, -18, 0], spine: [8, 0, 0], chest: [6, 6, 0], head: [-6, 10, 0] }, [-0.06, 1.26, 0.48], [0.45, 0.15, 1]);
      const thru = SW({ ...LUNGE(0.04), hips: [10, -8, 0], spine: [12, 12, 0], chest: [8, 22, 0], head: [-4, -4, 0] }, [0.2, 0.98, 0.46], [0.85, -0.45, 0.25]);
      const fol = SW({ ...LUNGE(0.04), hips: [10, -4, 0], spine: [12, 16, 0], chest: [8, 28, 0], head: [-4, -10, 0] }, [0.28, 0.92, 0.3], [0.5, -0.6, -0.6]);
      clip('attack_1', 0.8, [[0, GUARDP], [0.12, { ...wind, ...FIST('R') }, 'out'], [0.24, { ...mid, ...FIST('R') }, 'snap'], [0.3, { ...thru, ...FIST('R') }], [0.46, { ...fol, ...FIST('R') }], [0.8, GUARDP]],
        { base: GUARD, events: [[0.27, 'hit']], overlap: { hand: 0.02, head: 0.04 }, fadeIn: 0.08, fadeOut: 0.25 });
      // attack_2: backhand rising cut, left-low to right-high
      const wind2 = SW({ ...BACKW, hips: [6, -10, 0], spine: [8, 16, 0], chest: [8, 26, 0], head: [-6, -6, 0] }, [0.16, 0.98, 0.28], [0.7, -0.55, -0.3]);
      const mid2 = SW({ ...LUNGE(0), hips: [8, -26, 0], spine: [8, -4, 0], chest: [4, -8, 0] }, [-0.1, 1.18, 0.5], [-0.5, 0.3, 1]);
      const thru2 = SW({ ...LUNGE(0.05), hips: [6, -38, 0], spine: [4, -14, 0], chest: [0, -22, 0], head: [-6, 12, 0] }, [-0.34, 1.5, 0.34], [-0.75, 0.6, 0.1]);
      const fol2 = SW({ ...LUNGE(0.05), hips: [6, -40, 0], spine: [2, -16, 0], chest: [-2, -26, 0] }, [-0.36, 1.6, 0.16], [-0.4, 0.6, -0.65]);
      clip('attack_2', 0.85, [[0, GUARDP], [0.13, { ...wind2, ...FIST('R') }, 'out'], [0.26, { ...mid2, ...FIST('R') }, 'snap'], [0.32, { ...thru2, ...FIST('R') }], [0.5, { ...fol2, ...FIST('R') }], [0.85, GUARDP]],
        { base: GUARD, events: [[0.29, 'hit']], overlap: { hand: 0.02, head: 0.04 }, fadeIn: 0.08, fadeOut: 0.25 });
      // attack_3: finisher, coiled horizontal cut with a long step through
      const coil = SW({ ...stance(-0.1, [0.13, A, 0.18, 0, 4], [-0.13, A, -0.22, 0, 30], { z: -0.02 }), hips: [6, -48, 0], spine: [6, -18, 0], chest: [4, -26, 0], head: [-6, 34, 0] }, [-0.42, 1.25, -0.1], [0.3, 0.1, -1]);
      const cut = SW({ ...LUNGE(0.12), hips: [10, -10, 0], spine: [10, 8, 0], chest: [8, 18, 0], head: [-4, -6, 0] }, [-0.02, 1.2, 0.56], [1, 0.05, 0.4]);
      const thru3 = SW({ ...LUNGE(0.14), hips: [10, 6, 0], spine: [12, 18, 0], chest: [8, 32, 0], head: [-4, -16, 0] }, [0.36, 1.18, 0.32], [0.55, 0.0, -0.85]);
      clip('attack_3', 1.05, [[0, GUARDP], [0.26, { ...coil, ...FIST('R') }, 'out'], [0.4, { ...cut, ...FIST('R') }, 'snap'], [0.48, { ...thru3, ...FIST('R') }], [0.7, { ...thru3, ...FIST('R'), chest: [6, 26, 0] }], [1.05, GUARDP]],
        { base: GUARD, events: [[0.43, 'hit']], overlap: { hand: 0.03, head: 0.05, chest: 0.02 }, fadeIn: 0.1, fadeOut: 0.3 });
      // heavy: two-handed overhead, big anticipation, impact hold
      const two = (p, w, dir) => {
        let q = SW(p, w, dir);
        q = R(q, 'L', [w[0] + 0.07, w[1] - 0.06, w[2] - 0.02], { elbow: elbowDown('L') });
        return { ...q, ...FIST('R'), ...FIST('L') };
      };
      const raise = two({ ...stance(-0.04, [0.12, A, 0.2, 0, 8], [-0.13, A, -0.22, 0, 20]), hips: [-4, -20, 0], spine: [-10, -4, 0], chest: [-12, -4, 0], head: [-8, 6, 0] }, [-0.06, 1.86, -0.04], [0, 0.3, -1]);
      const strike = two({ ...stance(-0.22, [0.12, A, 0.52, 0, 8], [-0.13, A + 0.04, -0.34, -24, 22, 25], { z: 0.12 }), hips: [16, -12, 0], spine: [20, 0, 0], chest: [14, 0, 0], head: [-6, 0, 0] }, [-0.02, 0.88, 0.62], [0, -0.55, 1]);
      clip('heavy_attack', 1.45, [[0, GUARDP], [0.48, raise, 'out'], [0.58, raise], [0.66, strike, 'snap'], [0.86, strike], [1.45, GUARDP]],
        { base: GUARD, events: [[0.64, 'hit']], overlap: { head: 0.05, chest: 0.02 }, fadeIn: 0.12, fadeOut: 0.35 });
    }
    {
      const side = (s) => {
        const p = stance(-0.16, [0.13 + s * 0.12, A + (s > 0 ? 0 : 0.06), 0.06, s > 0 ? 0 : -15, 10], [-0.13 + s * 0.12, A + (s < 0 ? 0 : 0.06), -0.1, s < 0 ? 0 : -15, 20], { x: s * 0.1 });
        return { ...p, hips: [8, -20, s * 10], spine: [10, 0, s * 8], chest: [6, 8, s * 8], head: [-6, 0, -s * 10], armR: GUARDP.armR, forearmR: GUARDP.forearmR, handR: GUARDP.handR, ...FIST('R'), armL: [10, 0, s * 10], forearmL: [40, 0, 0] };
      };
      clip('dodge_left', 0.6, [[0, GUARDP], [0.08, { ...GUARDP, $hips: [0, -0.1, 0] }, 'snap'], [0.22, side(1)], [0.6, GUARDP]], { base: GUARD, fadeIn: 0.05, events: [[0.08, 'dodge']] });
      clip('dodge_right', 0.6, [[0, GUARDP], [0.08, { ...GUARDP, $hips: [0, -0.1, 0] }, 'snap'], [0.22, side(-1)], [0.6, GUARDP]], { base: GUARD, fadeIn: 0.05, events: [[0.08, 'dodge']] });
      const back = { ...stance(-0.14, [0.12, A + 0.05, 0.15, -12, 8], [-0.13, A, -0.32, 0, 20], { z: -0.12 }), hips: [-6, -24, 0], spine: [-6, 6, 0], chest: [-6, 8, 0], head: [6, 6, 0], armR: GUARDP.armR, forearmR: GUARDP.forearmR, handR: GUARDP.handR, ...FIST('R'), armL: [20, 0, 20], forearmL: [50, 0, 0] };
      clip('dodge_back', 0.6, [[0, GUARDP], [0.08, { ...GUARDP, $hips: [0, -0.1, 0] }, 'snap'], [0.24, back], [0.6, GUARDP]], { base: GUARD, fadeIn: 0.05, events: [[0.08, 'dodge']] });
    }
    {
      // forward roll: tuck, full pitch rotation over the shoulder, come up into guard
      const tuck = { spine: [40, 0, 0], chest: [30, 0, 0], neck: [30, 0, 0], head: [20, 0, 0], thighL: [110, 6, 10], thighR: [110, 6, 10], shinL: [130, 0, 0], shinR: [130, 0, 0], footL: [30, 0, 0], footR: [30, 0, 0],
        armL: [70, 20, 10], armR: [70, 20, 10], forearmL: [90, 0, 0], forearmR: [90, 0, 0], ...FIST('R') };
      clip('roll', 0.95, [
        [0, GUARDP], [0.1, { ...GUARDP, ...stance(-0.3, [0.12, A, 0.3, 0, 10], [-0.12, A + 0.05, -0.2, -25, 20]), spine: [30, 0, 0], chest: [20, 0, 0] }],
        [0.28, { ...tuck, $hips: [0, -0.55, 0.15], hips: [80, 0, 0] }],
        [0.48, { ...tuck, $hips: [0, -0.46, 0.3], hips: [190, 0, 0] }],
        [0.66, { ...tuck, $hips: [0, -0.52, 0.45], hips: [300, 0, 0] }],
        [0.8, { ...GUARDP, ...stance(-0.3, [0.12, A, 0.2, 0, 10], [-0.12, A + 0.06, -0.28, -30, 20], { z: 0.45 }), hips: [360 + 30, -20, 0], spine: [24, 0, 0] }],
        [0.95, { ...GUARDP, hips: [360 + GUARDP.hips[0], GUARDP.hips[1], 0] }],
      ], { base: GUARD, fadeIn: 0.06, events: [[0.1, 'dodge']] });
    }
    {
      const hi = SW({ ...stance(-0.1, [0.12, A, 0.24, 0, 10], [-0.13, A, -0.22, 0, 22]), hips: [6, -30, 0], spine: [6, 10, 0], chest: [2, 14, 0], head: [-8, 2, 0] }, [-0.02, 1.42, 0.38], [0.95, 0.35, 0.1]);
      const rec = SW({ ...stance(-0.12, [0.12, A, 0.2, 0, 10], [-0.13, A, -0.26, 0, 22], { z: -0.04 }), hips: [2, -34, 0], spine: [2, 6, 0], chest: [-4, 8, 0], head: [-10, 4, 0] }, [-0.06, 1.46, 0.3], [0.9, 0.5, 0.0]);
      clip('parry', 0.5, [[0, GUARDP], [0.08, { ...hi, ...FIST('R') }, 'snap'], [0.14, { ...rec, ...FIST('R') }], [0.22, { ...hi, ...FIST('R') }], [0.5, GUARDP]], { base: GUARD, fadeIn: 0.04, events: [[0.1, 'parry']] });
    }
    {
      const fl = { ...GUARDP, $hips: [0, -0.06, -0.05], chest: [-12, 14, 4], spine: [-6, 6, 0], head: [-16, 18, 8], shoulderL: [0, 0, 6], shoulderR: [0, 0, 6], $face: { squint: 0.8, frown: 0.5 } };
      clip('hit_react', 0.55, [[0, GUARDP], [0.07, fl, 'snap'], [0.25, { ...fl, chest: [-4, 6, 2], head: [-6, 8, 4] }], [0.55, GUARDP]], { base: GUARD, fadeIn: 0.03 });
      const s1 = { ...GUARDP, ...stance(-0.08, [0.12, A + 0.08, 0.1, -20, 10], [-0.13, A, -0.32, 0, 20], { z: -0.15 }), hips: [-10, -10, 4], spine: [-10, 8, 4], chest: [-10, 12, 6], head: [-12, 14, 6],
        armL: [40, 0, 30], forearmL: [30, 0, 0], ...OPEN('L'), $face: { squint: 1, jawOpen: 0.4 } };
      const s2 = { ...s1, ...stance(-0.2, [0.12, A, -0.12, 0, 10], [-0.13, A + 0.03, -0.42, -20, 20], { z: -0.3 }), hips: [12, -16, 0], spine: [18, 0, 0], chest: [12, 0, 0], head: [6, 0, 0] };
      clip('stagger', 1.3, [[0, GUARDP], [0.12, s1, 'snap'], [0.45, s2], [0.8, { ...s2, spine: [10, 0, 0] }], [1.3, GUARDP]], { base: GUARD, fadeIn: 0.04, overlap: { head: 0.06, armL: 0.05 } });
      const buckle = { ...stance(-0.4, [0.12, A, 0.2, 0, 10], [-0.13, A, -0.1, 0, 14]), hips: [10, -10, 0], spine: [20, 0, 0], chest: [10, 0, 0], head: [20, 0, 0],
        armR: [10, 0, -10], forearmR: [30, 0, 0], ...RELAX('R'), armL: [20, 0, -5], forearmL: [30, 0, 0], $face: { eyesClosed: 0.5, jawOpen: 0.3 } };
      const knees = { ...buckle, ...legs(ST, -0.48, [0.12, 0.12, -0.05, -40, 6, 40], [-0.12, 0.12, -0.1, -40, 6, 40], { z: 0.05 }), spine: [26, 0, 0], head: [30, 0, 0] };
      const fallen = { $hips: [0.05, 0.13 - 0.975, -0.2], hips: [-92, -10, 12], spine: [-4, -6, 6], chest: [-2, -6, 4], neck: [4, -30, 0], head: [6, -40, 6],
        thighL: [30, 10, 6], thighR: [50, -8, 10], shinL: [40, 0, 0], shinR: [80, 0, 0], footL: [-30, 10, 0], footR: [-20, -10, 0],
        armL: [10, 0, 50], forearmL: [40, 0, 0], armR: [-20, 0, 30], forearmR: [20, 0, 0], ...RELAX('L'), ...RELAX('R'), $face: { eyesClosed: 0.8, jawOpen: 0.2 } };
      clip('death', 2.2, [[0, GUARDP], [0.25, buckle, 'snap'], [0.7, knees], [1.3, { ...fallen, hips: [-70, -8, 10], $hips: [0.03, 0.3 - 0.975, -0.1] }, 'in'], [1.5, fallen], [1.7, { ...fallen, chest: [-4, -6, 4] }], [2.2, fallen]],
        { base: GUARD, hold: true, fadeIn: 0.05, overlap: { head: 0.08, armL: 0.06, armR: 0.06 } });
    }
    {
      const prep = R({ ...GUARDP, chest: [0, 16, 0], spine: [0, 8, 0] }, 'L', [0.06, 1.3, 0.12], { elbow: elbowDown('L') });
      const thrust = R({ ...GUARDP, ...stance(-0.1, [0.12, A, 0.3, 0, 8], [-0.13, A, -0.25, 0, 22], { z: 0.05 }), hips: [6, -12, 0], chest: [6, -14, 0], spine: [4, -10, 0], head: [-4, 10, 0] }, 'L', [0.1, 1.42, 0.62], { elbow: elbowDown('L') });
      const kick = R({ ...thrust, chest: [-6, -10, 0], head: [-10, 8, 0], shoulderL: [-6, 0, 10] }, 'L', [0.16, 1.55, 0.46], { elbow: elbowDown('L') });
      const palm = { handL: [-55, -20, 0], ...OPEN('L'), fingersL: [-10, 0, 0], fingers2L: [-5, 0, 0], thumbL: [-10, 0, 0] };
      clip('cast_sign', 0.85, [[0, GUARDP], [0.2, { ...prep, handL: [40, -40, 0], fingersL: [60, 0, 0], fingers2L: [30, 0, 0] }, 'out'], [0.3, { ...thrust, ...palm }, 'snap'], [0.38, { ...kick, ...palm }, 'snap'], [0.55, { ...kick, ...palm, chest: [-2, -8, 0] }], [0.85, GUARDP]],
        { base: GUARD, events: [[0.3, 'cast']], overlap: { hand: 0.02, head: 0.04 }, fadeIn: 0.06 });
    }
    {
      const sc = (yaw) => ({ ...legs(ST, -0.12, [0.13, A, 0.15, 0, 12], [-0.13, A, -0.15, 0, 16]), spine: [12, yaw * 0.2, 0], chest: [6, yaw * 0.3, 0], neck: [4, yaw * 0.3, 0], head: [6, yaw * 0.5, 4],
        ...R(ST, 'R', [-0.16, 1.0, 0.22], { elbow: elbowDown('R') }), $face: { squint: 0.5, browDown: 0.4 } });
      clip('senses', 4, [[0, sc(-30)], [1.4, sc(30)], [2.4, sc(20)], [4, sc(-30)]], { loop: true, fadeIn: 0.5 });
    }
    {
      const vial = (y, z, head) => ({ ...aimHand(R({ ...ST, head: [head, 0, 0] }, 'L', [0.06, y, z], { elbow: elbowDown('L') }), 'L', v3(0, 1, -0.2)), ...GRIP('L') });
      clip('drink_potion', 1.7, [[0, {}], [0.3, vial(1.2, 0.3, 4)], [0.55, vial(1.52, 0.15, -8)], [0.7, { ...vial(1.58, 0.12, -24), neck: [-8, 0, 0] }], [1.0, { ...vial(1.58, 0.12, -26), neck: [-8, 0, 0] }],
        [1.2, { ...vial(1.2, 0.28, 10), shoulderL: [6, 0, 8], shoulderR: [6, 0, 8], chest: [8, 0, 0], $face: { squint: 1, frown: 0.6 } }, 'snap'], [1.7, {}]],
        { events: [[0.7, 'drink']], overlap: { head: 0.06 } });
    }
  });

  B(['ride_idle', 'ride_trot', 'ride_gallop', 'mount', 'dismount'], () => {
  
    // ------------------------------------------------------------------ riding (root = saddle seat)
    const SEAT = -(REF.pelvisY - 0.11);
    const RIDE = (() => {
      const p = { $hips: [0, SEAT, 0], hips: [4, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-2, 0, 0],
        thighL: [58, 22, 34], thighR: [58, 22, 34], shinL: [76, 0, -4], shinR: [76, 0, -4], footL: [-6, 18, -6], footR: [-6, 18, -6] };
      let q = R(p, 'L', [0.08, 0.38, 0.32], { elbow: elbowDown('L') });
      q = R(q, 'R', [-0.08, 0.38, 0.32], { elbow: elbowDown('R') });
      return { ...q, handL: [10, -60, 0], handR: [10, -60, 0], ...FIST('L'), ...FIST('R') };
    })();
    clip('ride_idle', 3, [[0, RIDE], [1.5, { ...RIDE, head: [0, 8, 0], chest: [1, 2, 0] }], [3, RIDE]], { loop: true, base: RIDE });
    fn('ride_trot', 0.6, (u) => {
      const t = u * Math.PI * 2;
      const b = Math.abs(Math.sin(t));
      return { ...RIDE, $hips: [0, SEAT + 0.035 * b, 0.01 * b], spine: [4 + 2 * b, 0, 0], chest: [2 - 2 * b, 0, 0], head: [-2 + 3 * b, 0, 0], shinL: [76 - 6 * b, 0, -4], shinR: [76 - 6 * b, 0, -4] };
    }, { loop: true, base: RIDE });
    fn('ride_gallop', 0.5, (u) => {
      const t = u * Math.PI * 2;
      const b = 0.5 + 0.5 * Math.sin(t);
      let p = { ...RIDE, $hips: [0, SEAT + 0.07 + 0.04 * b, 0.06], hips: [20 + 6 * b, 0, 0], spine: [12, 0, 0], chest: [6 - 4 * b, 0, 0], neck: [-8, 0, 0], head: [-16 + 6 * b, 0, 0],
        thighL: [48, 22, 34], thighR: [48, 22, 34], shinL: [96, 0, -4], shinR: [96, 0, -4], footL: [10, 18, -6], footR: [10, 18, -6] };
      p = R(p, 'L', [0.07, 0.45 + 0.06 * b, 0.42 + 0.05 * b], { elbow: elbowDown('L') });
      p = R(p, 'R', [-0.07, 0.45 + 0.06 * b, 0.42 + 0.05 * b], { elbow: elbowDown('R') });
      return p;
    }, { loop: true, base: RIDE });
    {
      // mount from the horse's left: left foot to the stirrup, hands on the saddle, spring up,
      // right leg over. The character root stands 0.55 m left of the horse center line.
      const foot = { ...legs(ST, -0.02, [0.12, 0.62, 0.2, 10, 20], [-0.12, A, -0.05, 0, 10]), spine: [16, -20, 0], chest: [8, -10, 0] };
      const hands = R(R(foot, 'L', [-0.25, 1.32, 0.25], { elbow: elbowDown('L') }), 'R', [-0.45, 1.3, -0.05], { elbow: elbowDown('R') });
      const up = { ...hands, $hips: [-0.18, 0.42, 0], thighL: [70, 10, 10], shinL: [60, 0, 0], thighR: [-20, 10, 20], shinR: [40, 0, 0], spine: [24, -30, 0] };
      const over = { ...up, $hips: [-0.42, 0.5, 0], thighR: [30, 10, 80], shinR: [50, 0, 0], spine: [18, -20, 10] };
      const sat = { ...RIDE, $hips: [-0.55, RIDE.$hips[1] + 1.32, 0] };
      clip('mount', 1.8, [[0, {}], [0.35, foot, 'out'], [0.6, hands], [0.95, up, 'snap'], [1.3, over], [1.8, sat]],
        { events: [[0.95, 'jump'], [1.8, 'seated']], overlap: { head: 0.06 } });
      clip('dismount', 1.5, [[0, sat], [0.35, over], [0.7, up], [1.05, { ...foot, ...legs(ST, -0.1, [0.12, A, 0.05, 0], [-0.12, A, -0.05, 0]) }, 'in'], [1.5, {}]],
        { events: [[1.0, 'land']], overlap: { head: 0.06 } });
    }
    void mirrorPose; void addPose; void COLD_UPPER;
  });

}
