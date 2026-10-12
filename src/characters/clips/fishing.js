// Clips for the ice: sitting at a hole with a rod (gameplay/fishing), roasting a fish on a stick at a fire and chipping
// a fresh hole in the ice with a sword. Same authoring as library.js: key poses with arm reaches solved on the reference body.
//
//   fish_sit         full body, loop: on the stool, rod forward over the hole, left hand on the knee
//   fish_strike      upper body, one-shot: the rod snaps up to set the hook
//   fish_fight       upper body, loop: rod held high and bent, the other hand on the reel
//   fish_reel        upper body, loop: winding in (the left hand goes round)
//   fish_lift        upper body, one-shot, held: heaving the fish out of the hole
//   fish_roast       full body, loop: kneeling at the fire with a stick out over the flames
//   chip_ice         full body, loop: kneeling, the blade driven into the ice (event 'hit' on each blow)
// The jig's small lift and the tremble of a bite are not clips: the session adds them to the pose through anim.post.
import { bakeKeys } from './pose.js';
import { stand, reachArm, aimHand, v3, FIST, GRIP, OPEN, REF } from './lib.js';
import { legs, A } from './library.js';

const ST = stand();
const HIPJ = REF.hipJY;
const R = (p, S, t, o) => reachArm(p, S, v3(...t), o);
const elbowDown = (S) => v3((S === 'L' ? 1 : -1) * 0.3, -1, -0.15);
const elbowOut = (S) => v3(S === 'L' ? 1 : -1, -0.3, -0.25);

// The arms and hands for every upper-body clip; the legs stay as the sitting clip has them.
const UPPER = {
  spine: 0.6, chest: 1, neck: 1, head: 1,
  shoulderL: 1, armL: 1, forearmL: 1, handL: 1, fingersL: 1, fingers2L: 1, thumbL: 1,
  shoulderR: 1, armR: 1, forearmR: 1, handR: 1, fingersR: 1, fingers2R: 1, thumbR: 1,
};

// Registered under the clip's name, as the library does.
const bakeInto = (lib, name, dur, keys, o = {}) => { lib[name] = bakeKeys({ name, dur, keys, ...o }); };

export function buildFishing(lib, lazy) {
  const B = (names, build) => { for (const n of names) lazy[n] = build; };

  // ---- on the stool ------------------------------------------------------------------------------------------------
  const seat = {
    $hips: [0, 0.36 - HIPJ, -0.04], hips: [6, 0, 0], spine: [20, 0, 0], chest: [12, 0, 0], neck: [6, 0, 0], head: [14, 0, 0],
    thighL: [80, 16, 14], thighR: [80, 16, 14], shinL: [118, 0, 0], shinR: [116, 0, 0], footL: [20, 10, 0], footR: [20, 10, 0],
  };
  // Right hand on the rod, the rod pointing forward and a little up; left hand resting on the thigh.
  const rodHand = (p, wrist, dir) => ({ ...aimHand(R(p, 'R', wrist, { elbow: elbowDown('R') }), 'R', v3(...dir)), ...FIST('R') });
  const onKnee = (p) => ({ ...R(p, 'L', [0.14, 0.54, 0.34], { elbow: elbowDown('L') }), handL: [20, 0, 0] });

  B(['fish_sit', 'fish_strike', 'fish_fight', 'fish_reel', 'fish_lift'], () => {
    const hold = onKnee(rodHand(seat, [-0.06, 0.6, 0.4], [0.1, 0.2, 1]));
    bakeInto(lib, 'fish_sit', 4, [[0, hold], [2, { ...hold, head: [16, 4, 0], chest: [13, 0, 0] }], [4, hold]], { loop: true, fadeIn: 0.7, base: seat });

    // the strike: wrist up to shoulder height, the rod tip flung up, the body rocking back
    const up = onKnee(rodHand({ ...seat, spine: [8, 0, 0], chest: [4, 0, 0], head: [8, 0, 0] }, [-0.04, 0.98, 0.3], [0.05, 1, 0.55]));
    bakeInto(lib, 'fish_strike', 0.95, [[0, hold], [0.1, up, 'snap'], [0.4, { ...up, head: [10, 0, 0] }], [0.95, hold]],
      { loop: false, base: seat, upperMask: UPPER, fadeOut: 0.3, overlap: { hand: 0.05, forearm: 0.03 } });

    // fighting: rod high, bent forward, left hand reaching to the reel at the grip
    const lean = { ...seat, spine: [10, 0, 0], chest: [6, 0, 0], head: [10, 0, 0] };
    const fight = { ...R(rodHand(lean, [-0.05, 0.84, 0.34], [0.04, 0.9, 0.7]), 'L', [0.03, 0.74, 0.42], { elbow: elbowDown('L') }), ...GRIP('L'), handL: [10, -20, 0] };
    bakeInto(lib, 'fish_fight', 1.4, [[0, fight], [0.7, { ...fight, chest: [7, 1, 0], head: [11, 2, 0] }], [1.4, fight]], { loop: true, fadeIn: 0.2, base: seat, upperMask: UPPER });

    // reeling: the left hand goes round the reel
    const turn = (a) => ({ ...R(fight, 'L', [0.03 + Math.cos(a) * 0.05, 0.74 + Math.sin(a) * 0.05, 0.42], { elbow: elbowDown('L') }), ...GRIP('L') });
    bakeInto(lib, 'fish_reel', 0.5, [0, 1, 2, 3].map((i) => [i * 0.125, turn((i * Math.PI) / 2)]), { loop: true, fadeIn: 0.12, base: seat, upperMask: UPPER, overlap: { hand: 0.03 } });

    // heaving it out: the rod goes up and back, held there while the catch is shown
    const high = rodHand({ ...seat, spine: [-2, 0, 0], chest: [-4, 0, 0], head: [-4, 0, 0] }, [-0.06, 1.18, 0.26], [0.0, 1, 0.25]);
    const lift = { ...R(high, 'L', [0.08, 1.0, 0.34], { elbow: elbowDown('L') }), ...GRIP('L') };
    bakeInto(lib, 'fish_lift', 1.5, [[0, fight], [0.45, lift, 'out'], [1.1, lift], [1.5, lift]],
      { loop: false, hold: true, base: seat, upperMask: UPPER, fadeOut: 0.5, overlap: { hand: 0.06, forearm: 0.04 } });
  });

  // ---- kneeling at the fire and at the ice ------------------------------------------------------------------------
  const kneel = () => {
    const p = legs(ST, -0.44, [0.1, A, 0.44, 0], [-0.1, 0.11, -0.34, -50, 4, 50], { z: 0.04 });
    return { ...p, spine: [8, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0], head: [6, 0, 0] };
  };

  B(['fish_roast'], () => {
    // a stick held out over the flames, turned now and then
    const K = kneel();
    const lean = { ...K, head: [14, 0, 0], spine: [12, 0, 0] };
    const stick = (wrist, dir) => ({ ...R(aimHand(R(lean, 'R', wrist, { elbow: elbowOut('R') }), 'R', v3(...dir)), 'L', [0.14, 0.5, 0.34], { elbow: elbowOut('L') }), ...GRIP('R'), handL: [10, 0, 0] });
    const a = stick([-0.1, 0.58, 0.6], [0.0, -0.45, 1]);
    const b = stick([-0.1, 0.6, 0.62], [0.1, -0.4, 1]);
    bakeInto(lib, 'fish_roast', 3.2, [[0, a], [0.9, b], [1.6, a], [2.4, { ...b, head: [18, 4, 0] }], [3.2, a]], { loop: true, fadeIn: 0.6, base: K });
  });

  B(['chip_ice'], () => {
    // the sword point driven down into the ice, a left hand braced beside it
    const K = kneel();
    const crouch = { ...K, spine: [20, 0, 0], chest: [12, 0, 0], head: [16, 0, 0] };
    const blade = (wrist) => ({ ...aimHand(R(crouch, 'R', wrist, { elbow: elbowOut('R') }), 'R', v3(0.0, -1, 0.35)), ...FIST('R') });
    const brace = (p) => ({ ...R(p, 'L', [0.2, 0.34, 0.38], { elbow: elbowOut('L') }), handL: [-20, 0, 0], ...OPEN('L') });
    const high = brace(blade([-0.1, 1.0, 0.36]));
    const low = brace(blade([-0.1, 0.52, 0.5]));
    bakeInto(lib, 'chip_ice', 0.9, [[0, high], [0.28, high], [0.38, low, 'snap'], [0.5, low], [0.9, high]],
      { loop: true, fadeIn: 0.5, base: crouch, events: [[0.37, 'hit']], overlap: { forearm: 0.02, hand: 0.04 } });
  });
}
