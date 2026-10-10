// Clips for fighting from the saddle (gameplay/player/mounted.js) and for being thrown out of it (gameplay/Horse.js).
// Same authoring as library.js: key poses with the sword arm placed by reachArm / aimHand on the reference body. The root
// of a rider is the saddle anchor, so every target below is measured from the seat (the pelvis sits 0.11 m above it).
//
//   ride_ready          upper body, loop: the sword out in the right hand beside the horse's neck, the left hand on the reins
//   ride_slash_l / _r   upper body, one-shot: a quick cut to her left (across the body) or her right; event 'hit' at the blow
//   ride_chop_l / _r    upper body, one-shot: a high wind-up and a hard downward cut to that side
//   ride_thrown_l / _r  full body, one-shot: knocked out of the saddle toward her left or right, a tumble, a roll, up on her
//                       feet in guard. The root starts on the ground under the saddle (the pelvis sits SADDLE_H up) and the
//                       gameplay carries it sideways to where she lands.
// Slashes and chops are layered over the ride clip (hips and legs stay with the horse).
import { bakeKeys, mirrorPose, mergePose } from './pose.js';
import { reachArm, aimHand, v3, FIST, RELAX, REF, stand } from './lib.js';
import { combatGuard } from './locomotion.js';
import { legs, A, ridePose, SEAT, SADDLE_H } from './library.js';

const UPPER = {
  spine: 0.7, chest: 0.85, neck: 0.6, head: 0.8,
  shoulderL: 1, armL: 1, forearmL: 1, handL: 1, fingersL: 1, fingers2L: 1, thumbL: 1,
  shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1,
};
// The sword hand only (the left stays on the reins), the torso lightly: at a gallop the rider keeps leaning with the horse.
const RIGHT_ARM = { spine: 0.35, chest: 0.5, head: 0.4, shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1 };

const elbowOut = (S) => v3(S === 'L' ? 1 : -1, -0.3, -0.25);
const R = (p, S, t, o) => reachArm(p, S, v3(...t), o);
const bakeInto = (lib, name, dur, keys, o = {}) => { lib[name] = bakeKeys({ name, dur, keys, ...o }); };

export function buildRiding(lib, lazy) {
  const B = (names, build) => { for (const n of names) lazy[n] = build; };

  B(['ride_ready', 'ride_slash_l', 'ride_slash_r', 'ride_chop_l', 'ride_chop_r'], () => {
    const RIDE = ridePose();
    // Sword pose: the right wrist at w (saddle space), the blade along dir, the torso as given.
    const SW = (torso, w, dir) => ({ ...aimHand(R({ ...RIDE, ...torso }, 'R', w, { elbow: v3(-0.5, -0.5, -0.45) }), 'R', v3(...dir)), ...FIST('R') });

    // ready: blade up and a little forward beside the horse's neck
    const ready = SW({ chest: [0, -8, 0], spine: [2, -4, 0], head: [-2, 6, 0] }, [-0.3, 0.8, 0.46], [0.1, 1, 0.3]);
    bakeInto(lib, 'ride_ready', 2.4, [[0, ready], [1.2, { ...ready, chest: [1, -10, 0], head: [-1, 10, 0] }], [2.4, ready]], { loop: true, base: RIDE, upperMask: RIGHT_ARM, fadeIn: 0.25 });

    // One swing. side +1: to her left, across her body; -1: to her right. heavy: a higher wind-up, a harder cut.
    const swing = (name, side, heavy) => {
      const L = side > 0;
      // torso: wound back from the side she cuts to, then thrown through it
      const wind = L ? { chest: [-4, -26, -8], spine: [-2, -12, -4], head: [-4, -14, 0] } : { chest: [-6, 24, 6], spine: [-2, 12, 4], head: [-4, 14, 0] };
      const hit = L ? { chest: [8, 38, 14], spine: [4, 14, 8], head: [-4, 26, 2] } : { chest: [8, -40, -14], spine: [4, -14, -8], head: [-4, -26, -2] };
      const thru = L ? { chest: [12, 44, 18], spine: [6, 18, 10], head: [0, 28, 4] } : { chest: [12, -46, -18], spine: [6, -18, -10], head: [0, -28, -4] };
      const lat = (x) => (L ? x : -x); // lateral target: x measured toward the side she cuts to
      const w0 = heavy ? [lat(-0.12), 1.5, -0.1] : [lat(-0.3), 1.05, 0.0];
      const b0 = heavy ? [0, 1, -0.2] : [lat(-0.3), 1, -0.45];
      const w1 = heavy ? [lat(0.78), 0.5, 0.42] : [lat(0.66), 0.66, 0.5];
      const b1 = heavy ? [lat(0.95), -0.5, 0.35] : [lat(1), -0.15, 0.4];
      const w2 = heavy ? [lat(0.92), 0.2, 0.18] : [lat(0.86), 0.36, 0.26];
      const b2 = heavy ? [lat(0.55), -0.85, 0.1] : [lat(0.7), -0.65, 0.1];
      const pWind = SW(heavy ? { ...wind, spine: [-12, wind.spine[1], wind.spine[2]], chest: [-14, wind.chest[1], wind.chest[2]] } : wind, w0, b0);
      const pHit = SW(heavy ? { ...hit, spine: [14, hit.spine[1], hit.spine[2]] } : hit, w1, b1);
      const pThru = SW(thru, w2, b2);
      const dur = heavy ? 1.1 : 0.78;
      const t = heavy ? { wind: 0.4, hit: 0.56, thru: 0.7, back: 0.95 } : { wind: 0.17, hit: 0.3, thru: 0.4, back: 0.58 };
      bakeInto(lib, name, dur, [[0, RIDE], [t.wind, pWind, 'out'], [t.hit, pHit, 'snap'], [t.thru, pThru], [t.back, { ...RIDE, ...thru, chest: [4, thru.chest[1] * 0.4, thru.chest[2] * 0.4] }], [dur, RIDE]],
        { base: RIDE, upperMask: UPPER, events: [[t.hit - 0.03, 'hit']], overlap: { hand: 0.02, head: 0.04 }, fadeIn: 0.08, fadeOut: 0.25 });
    };
    swing('ride_slash_l', 1, false);
    swing('ride_slash_r', -1, false);
    swing('ride_chop_l', 1, true);
    swing('ride_chop_r', -1, true);
  });

  B(['ride_thrown_l', 'ride_thrown_r'], () => {
    const RIDE = ridePose();
    const UP = SEAT + SADDLE_H; // pelvis offset of a rider seated, measured from the ground under the saddle
    const LIE = 0.11 - 0.975; // pelvis 11 cm up: lying on the ground (as lie_dead)
    const ST = stand();
    const S0 = { ...RIDE, $hips: [0, UP, 0] };
    // wrenched sideways and back: the arms fly out, one knee kicks up
    const S1 = {
      ...RIDE, $hips: [0.1, UP + 0.12, -0.08], hips: [-10, 8, 16], spine: [-12, 10, 14], chest: [-14, 14, 10], neck: [-10, 0, 6], head: [-16, -8, 10],
      armL: [22, 0, 62], armR: [-10, 0, 66], forearmL: [24, 0, 0], forearmR: [18, 0, 0], handL: [-10, 0, 0], handR: [-10, 0, 0],
      thighL: [26, 20, 52], thighR: [70, 20, 24], shinL: [40, 0, 0], shinR: [70, 0, 0], footL: [10, 0, 0], footR: [-10, 0, 0],
    };
    // in the air, rolling toward the ground on her left
    const S2 = {
      ...S1, $hips: [0.3, UP + 0.1, -0.1], hips: [-36, 22, 64], spine: [-10, 12, 18], chest: [-8, 14, 14], neck: [-6, 6, 8], head: [-10, 10, 12],
      armL: [40, 0, 76], armR: [-32, 0, 80], forearmL: [10, 0, 0], forearmR: [30, 0, 0],
      thighL: [34, 10, 40], thighR: [60, 12, 14], shinL: [60, 0, 0], shinR: [84, 0, 0], footL: [20, 0, 0], footR: [-6, 0, 0],
    };
    // first contact, the shoulder and back taking it
    const S3 = {
      ...S2, $hips: [0.22, 0.34 - 0.975, -0.14], hips: [-62, 14, 46], spine: [-8, 8, 10], chest: [-6, 8, 8], neck: [8, 16, 0], head: [10, 20, 6],
      armL: [20, 0, 50], armR: [-20, 0, 40], thighL: [40, 10, 30], thighR: [66, 10, 14], shinL: [70, 0, 0], shinR: [90, 0, 0],
    };
    // flat on her back, breath gone
    const S4 = {
      $hips: [0.04, LIE, -0.22], hips: [-90, 8, 8], spine: [-4, 6, 4], chest: [-3, 4, 2], neck: [6, 20, 0], head: [10, 28, 6],
      thighL: [18, 14, 14], thighR: [30, -6, 10], shinL: [30, 0, 0], shinR: [60, 0, 0], footL: [-20, 12, 0], footR: [-18, -8, 0],
      armL: [14, 10, 36], forearmL: [30, 20, 0], armR: [-8, -16, 24], forearmR: [30, 24, 0], handL: [10, 0, 0], handR: [-8, 0, 0],
      ...RELAX('L'), ...RELAX('R'), $face: { eyesClosed: 0.6, jawOpen: 0.3, frown: 0.4 },
    };
    // rolling onto her left side, a hand on the snow
    const rollRef = { ...S4, hips: [-52, 22, 58] };
    const handDown = R(rollRef, 'R', [-0.12, 0.2, 0.3], { elbow: elbowOut('R') });
    const S5 = {
      ...S4, $hips: [0.05, 0.2 - 0.975, -0.12], hips: [-52, 22, 58], spine: [12, 8, -8], chest: [10, 10, -6], neck: [14, 6, 0], head: [10, 8, 0],
      thighL: [50, 12, 24], thighR: [74, 4, 6], shinL: [88, 0, 0], shinR: [100, 0, 0], armL: [50, 0, 18], forearmL: [30, 0, 0],
      armR: handDown.armR, forearmR: handDown.forearmR, $face: { eyesClosed: 0.2, jawOpen: 0.2, frown: 0.6 },
    };
    // up on a knee
    const kneel = legs(ST, -0.44, [0.1, A, 0.44, 0], [-0.1, 0.11, -0.34, -50, 4, 50], { z: 0.04 });
    const kneelArms = R(R(kneel, 'L', [0.16, 0.5, 0.34], { elbow: elbowOut('L') }), 'R', [-0.12, 0.5, 0.3], { elbow: elbowOut('R') });
    const S6 = { ...kneelArms, spine: [24, 0, 0], chest: [14, 0, 0], neck: [8, 0, 0], head: [4, 0, 0], $face: { frown: 0.5, squint: 0.4 } };
    // rising, the blade hand coming up
    const rise = legs(ST, -0.22, [0.14, A, 0.3, 0, 12], [-0.14, A, -0.2, 0, 22]);
    const riseArms = R(R(rise, 'L', [0.2, 0.7, 0.3], { elbow: elbowOut('L') }), 'R', [-0.16, 0.7, 0.3], { elbow: elbowOut('R') });
    const S7 = { ...riseArms, spine: [16, 0, 0], chest: [8, 0, 0], head: [-4, 0, 0] };
    const S8 = { ...combatGuard(0, 0), ...FIST('R') };
    // The blade stays in her right hand through all of it: on the ground it lies out along the snow, kneeling it points down
    // and ahead. aimHand turns the hand (the arm is as posed above); both variants get the same blade directions.
    const blade = (p, dir) => ({ ...aimHand(p, 'R', v3(...dir)), ...FIST('R') });
    const keys = [[0, S0, null], [0.1, S1, null], [0.38, S2, null], [0.66, S3, [-0.5, -0.4, 0.3]], [0.84, S4, [-0.9, -0.12, -0.3]], [1.12, S4, [-0.9, -0.12, -0.3]],
      [1.4, S5, [-0.6, -0.15, 0.5]], [1.75, S6, [0, -0.4, 1]], [2.05, S7, [0.1, -0.2, 1]], [2.4, S8, null]];
    const ease = { 0.1: 'snap', 0.66: 'in', 2.05: 'out' };
    const variant = (m) => keys.map(([t, p, d]) => { const q = m(p); return [t, d ? blade(q, d) : q, ease[t]]; });
    const opts = { base: stand(), fadeIn: 0.04, hold: false, fadeOut: 0.35, events: [[0.64, 'land']], overlap: { head: 0.05, armL: 0.04, armR: 0.04 } };
    bakeInto(lib, 'ride_thrown_l', 2.4, variant((p) => p), opts);
    bakeInto(lib, 'ride_thrown_r', 2.4, variant(mirrorPose), opts);
  });
  void mergePose; void REF;
}
