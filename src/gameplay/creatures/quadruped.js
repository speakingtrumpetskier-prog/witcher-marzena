// A procedural quadruped: skinned lofted body on a 27 bone skeleton, planar IK legs driven by a
// gait generator (walk, trot, gallop), and layered pose parameters (crouch, pitch, neck, jaw, ears,
// tail, hackles, explicit foot overrides). Wolves and bears use the same machinery with different
// specs (proportions, colors); each creature class feeds it a speed and a pose every frame.
//
//   const q = new Quadruped(SPECS.wolf, { tint: [1, 1, 1], seed: 3, alpha: false });
//   scene.add(q.root);   q.root is the creature origin (feet on the ground under the body center)
//   q.update(dt, speed, turnRate)         gait follows speed; then the pose layer below
//   q.pose = { crouch, pitch, neck, headRel, lookYaw, lookPitch, jaw, ears, tail, tailWag, hackles, roll, bodyY,
//              feet: [[z, y] x4] | null, feetW, pawFlat }          write targets; the rig damps toward them
//   q.dead(side)   collapse and stay down       q.revive()
//   q.flash(k)     emissive hit flash 0..1       q.dispose()
// Leg order everywhere: 0 FL, 1 FR, 2 HL, 3 HR. Rig space: +Z forward, +Y up, X to the creature's left.
import * as THREE from 'three';
import { loft, ellipsoid, limb, makeSkinned, leg2D, furTexture } from './rig.js';
import { G } from '../../core/G.js';
import { damp, clamp, smoothstep } from '../../core/util.js';

const TAU = Math.PI * 2;

// ---- specs ---------------------------------------------------------------------------------------------
// All lengths in meters at scale 1. Sections for lofts: { z, w (half width), h (half height), y }.
export const SPECS = {
  wolf: {
    name: 'wolf',
    pelvisY: 0.67, bodyLen: 0.58, shoulderDY: 0.06, hipX: 0.1, shX: 0.11,
    stride: 1, lift: 1,
    front: { L1: 0.265, L2: 0.255, L3: 0.14, r0: 0.1, r1: 0.056, r2: 0.037, phi: -0.06, bend: -1, ankle: 0.06, depth: 1.05, belly: 1.15 },
    hind: { L1: 0.27, L2: 0.27, L3: 0.22, r0: 0.135, r1: 0.062, r2: 0.037, phi: 0.5, bend: 1, ankle: 0.06, depth: 1.25, belly: 1.2 },
    pawR: [0.05, 0.04, 0.09],
    pelvis: [
      { z: -0.32, w: 0.06, h: 0.08, y: 0.0 }, { z: -0.22, w: 0.125, h: 0.155, y: 0.01 }, { z: -0.05, w: 0.14, h: 0.17, y: 0.0 },
      { z: 0.14, w: 0.13, h: 0.16, y: -0.005 }, { z: 0.3, w: 0.115, h: 0.14, y: -0.01 },
    ],
    chest: [
      { z: -0.34, w: 0.115, h: 0.145, y: -0.015 }, { z: -0.18, w: 0.145, h: 0.195, y: -0.02 }, { z: 0.0, w: 0.16, h: 0.232, y: -0.005 },
      { z: 0.16, w: 0.15, h: 0.215, y: 0.0 }, { z: 0.29, w: 0.115, h: 0.17, y: 0.005 }, { z: 0.37, w: 0.07, h: 0.1, y: 0.01 },
    ],
    neckPivot: [0, 0.09, 0.27], neckLen: 0.24,
    neck: [{ z: -0.12, w: 0.115, h: 0.15, y: 0 }, { z: 0.04, w: 0.1, h: 0.125, y: 0 }, { z: 0.16, w: 0.085, h: 0.105, y: 0 }, { z: 0.26, w: 0.075, h: 0.09, y: 0 }],
    head: [
      { z: -0.07, w: 0.062, h: 0.075, y: 0.0 }, { z: 0.0, w: 0.08, h: 0.088, y: 0.0 }, { z: 0.07, w: 0.07, h: 0.078, y: -0.004 },
      { z: 0.13, w: 0.05, h: 0.054, y: -0.014 }, { z: 0.19, w: 0.04, h: 0.042, y: -0.02 }, { z: 0.245, w: 0.028, h: 0.03, y: -0.024 }, { z: 0.268, w: 0.014, h: 0.016, y: -0.024 },
    ],
    jaw: [{ z: 0.0, w: 0.036, h: 0.02, y: -0.012 }, { z: 0.08, w: 0.038, h: 0.02, y: -0.014 }, { z: 0.16, w: 0.026, h: 0.016, y: -0.014 }, { z: 0.205, w: 0.013, h: 0.01, y: -0.014 }],
    jawPivot: [0, -0.035, 0.03], eye: [0.052, 0.03, 0.07], eyeR: 0.014,
    ear: { x: 0.048, y: 0.07, z: -0.03, h: 0.12, w: 0.045 },
    tail: { len: [0.18, 0.18, 0.16], r: [0.045, 0.07, 0.065, 0.014], base: [0, 0.04, -0.3] },
    ruff: 0,
    furBase: [0.21, 0.2, 0.19], bellyBase: [0.42, 0.39, 0.34], legBase: [0.24, 0.22, 0.2],
    texKey: 'wolf', texSeed: 11,
  },
  bear: {
    name: 'bear',
    pelvisY: 0.96, bodyLen: 0.98, shoulderDY: 0.16, hipX: 0.2, shX: 0.22,
    stride: 1.35, lift: 1.3,
    front: { L1: 0.46, L2: 0.43, L3: 0.17, r0: 0.13, r1: 0.085, r2: 0.07, phi: -0.1, bend: -1, ankle: 0.075, depth: 1.0 },
    hind: { L1: 0.43, L2: 0.4, L3: 0.2, r0: 0.15, r1: 0.09, r2: 0.07, phi: 0.25, bend: 1, ankle: 0.075, depth: 1.15 },
    pawR: [0.095, 0.05, 0.14],
    pelvis: [
      { z: -0.36, w: 0.1, h: 0.14, y: 0.0 }, { z: -0.26, w: 0.21, h: 0.26, y: 0.0 }, { z: -0.04, w: 0.27, h: 0.3, y: 0.0 },
      { z: 0.2, w: 0.26, h: 0.3, y: 0.0 }, { z: 0.4, w: 0.24, h: 0.28, y: 0.0 },
    ],
    chest: [
      { z: -0.5, w: 0.23, h: 0.27, y: 0.0 }, { z: -0.25, w: 0.29, h: 0.34, y: 0.02 }, { z: 0.0, w: 0.32, h: 0.4, y: 0.06 },
      { z: 0.24, w: 0.3, h: 0.38, y: 0.05 }, { z: 0.42, w: 0.22, h: 0.3, y: 0.0 }, { z: 0.52, w: 0.12, h: 0.16, y: -0.02 },
    ],
    neckPivot: [0, 0.1, 0.4], neckLen: 0.3,
    neck: [{ z: -0.14, w: 0.2, h: 0.24, y: 0 }, { z: 0.06, w: 0.19, h: 0.22, y: 0 }, { z: 0.2, w: 0.17, h: 0.2, y: 0 }, { z: 0.34, w: 0.15, h: 0.17, y: 0 }],
    head: [
      { z: -0.1, w: 0.13, h: 0.15, y: 0.0 }, { z: 0.0, w: 0.16, h: 0.17, y: 0.0 }, { z: 0.1, w: 0.15, h: 0.15, y: -0.01 },
      { z: 0.2, w: 0.1, h: 0.1, y: -0.03 }, { z: 0.3, w: 0.07, h: 0.07, y: -0.05 }, { z: 0.38, w: 0.055, h: 0.055, y: -0.055 }, { z: 0.405, w: 0.03, h: 0.03, y: -0.055 },
    ],
    jaw: [{ z: 0.0, w: 0.08, h: 0.04, y: -0.03 }, { z: 0.14, w: 0.07, h: 0.035, y: -0.035 }, { z: 0.26, w: 0.05, h: 0.027, y: -0.04 }, { z: 0.33, w: 0.028, h: 0.018, y: -0.04 }],
    jawPivot: [0, -0.08, 0.04], eye: [0.085, 0.05, 0.14], eyeR: 0.016,
    ear: { x: 0.095, y: 0.12, z: -0.03, h: 0.07, w: 0.06 },
    tail: { len: [0.06, 0.05, 0.04], r: [0.07, 0.07, 0.05, 0.02], base: [0, 0.1, -0.4] },
    ruff: 0.5,
    furBase: [0.42, 0.3, 0.2], bellyBase: [0.36, 0.26, 0.18], legBase: [0.32, 0.23, 0.16],
    texKey: 'bear', texSeed: 23,
  },
};

// ---- gaits -----------------------------------------------------------------------------------------------
// duty: fraction of the cycle a foot is planted; ls: how far a planted foot travels back relative to the
// body; lift: swing height; off: phase offsets [FL, FR, HL, HR]; bob: body rise (m); pitch: body pitch
// amplitude (rad); flex: spine flex amplitude; bobHz: bobs per cycle.
const GAITS = {
  walk: { duty: 0.66, ls: 0.46, lift: 0.075, off: [0.25, 0.75, 0.0, 0.5], bob: 0.014, pitch: 0.012, flex: 0.02, bobHz: 2, sway: 0.035, reach: 0.0 },
  trot: { duty: 0.5, ls: 0.62, lift: 0.105, off: [0.0, 0.5, 0.5, 0.0], bob: 0.03, pitch: 0.02, flex: 0.03, bobHz: 2, sway: 0.025, reach: 0.04 },
  run: { duty: 0.34, ls: 0.82, lift: 0.17, off: [0.5, 0.6, 0.0, 0.1], bob: 0.075, pitch: 0.17, flex: 0.24, bobHz: 1, sway: 0.01, reach: 0.18 },
};

export function pickGait(v, cur) {
  // Hysteresis so a speed hovering on a threshold does not flap.
  const up = cur === 'run' ? 4.0 : 4.6, mid = cur === 'trot' || cur === 'run' ? 1.5 : 2.0;
  if (v < 0.12) return 'idle';
  if (v < mid) return 'walk';
  if (v < up) return 'trot';
  return 'run';
}

const _o = {};
const ease = (u) => u * u * (3 - 2 * u);

export class Quadruped {
  constructor(spec, o = {}) {
    this.spec = spec;
    this.scale = o.scale || 1;
    this.root = new THREE.Group();
    this.root.name = `quad_${spec.name}`;
    this.pose = {
      crouch: 0, pitch: 0, neck: 0.42, headRel: -0.34, lookYaw: 0, lookPitch: 0, jaw: 0, ears: 0.1, tail: 0.1, tailWag: 0, hackles: 0, roll: 0, bodyY: 0,
      feet: null, feetW: 0, pawFlat: 1,
    };
    this.cur = { ...this.pose, feet: null };
    this.phase = Math.random();
    this.gait = 'idle';
    this.gaitT = 0;
    this.blend = 0;
    this.speed = 0;
    this.t = Math.random() * 20;
    this.dead_ = 0; // 0 alive .. 1 collapsed
    this.deadTarget = 0;
    this.deadSide = 1;
    this.twitch = 0;
    this.flashK = 0;
    this.earTwitch = [0, 0];
    this.nextTwitch = 2 + Math.random() * 4;
    this._build(o);
    this.legs.forEach((l) => { l.cur = { z: l.nz, y: l.spec.ankle }; l.from = { z: l.nz, y: l.spec.ankle }; });
    this.update(0, 0, 0);
  }

  // ---- construction ---------------------------------------------------------------------------------
  _build(o) {
    const S = this.spec;
    const bones = [];
    const bone = (name, parent, x = 0, y = 0, z = 0) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      if (parent) parent.add(b);
      bones.push(b);
      return b;
    };
    const rootB = bone('root', null);
    const pelvisZ = -S.bodyLen * 0.5;
    this.pelvisZ = pelvisZ;
    const pelvis = bone('pelvis', rootB, 0, S.pelvisY, pelvisZ);
    const chest = bone('chest', pelvis, 0, S.shoulderDY, S.bodyLen);
    const neck = bone('neck', chest, ...S.neckPivot);
    const head = bone('head', neck, 0, 0, S.neckLen);
    const jaw = bone('jaw', head, ...S.jawPivot);
    const earL = bone('earL', head, S.ear.x, S.ear.y, S.ear.z);
    const earR = bone('earR', head, -S.ear.x, S.ear.y, S.ear.z);
    const ridge = bone('ridge', chest, 0, S.chest[2].h * 0.8, -0.05);
    const tail = [];
    let tp = pelvis;
    S.tail.len.forEach((L, i) => {
      const tb = bone('tail' + i, tp, ...(i === 0 ? S.tail.base : [0, 0, -S.tail.len[i - 1]]));
      tail.push(tb);
      tp = tb;
    });
    const legs = [];
    const defs = [
      { front: true, side: 1 }, { front: true, side: -1 }, { front: false, side: 1 }, { front: false, side: -1 },
    ];
    for (const d of defs) {
      const ls = d.front ? S.front : S.hind;
      const parent = d.front ? chest : pelvis;
      const x = d.side * (d.front ? S.shX : S.hipX);
      const upper = bone('upper' + legs.length, parent, x, d.front ? -0.03 : 0, 0);
      const lower = bone('lower' + legs.length, upper, 0, -ls.L1, 0);
      const pastern = bone('pastern' + legs.length, lower, 0, -ls.L2, 0);
      const paw = bone('paw' + legs.length, pastern, 0, -ls.L3, 0);
      legs.push({
        front: d.front, side: d.side, spec: ls, bones: { upper, lower, pastern, paw }, x, idx: legs.length,
        nz: d.front ? pelvisZ + S.bodyLen + 0.02 : pelvisZ - 0.03, cur: null, from: null, ik: {},
      });
    }
    this.bones = bones;
    this.b = { root: rootB, pelvis, chest, neck, head, jaw, earL, earR, ridge, tail };
    this.legs = legs;
    // bind pose world matrices
    this.root.add(rootB);
    this.root.updateMatrixWorld(true);

    // ---- geometry ---------------------------------------------------------------------------------
    const tint = o.tint || [1, 1, 1];
    const fr = S.furBase, bl = S.bellyBase, lg = S.legBase;
    let h = 7 + (o.seed || 0) * 13.7;
    const noise = (x, y, z) => {
      const s = Math.sin(x * 37.1 + y * 11.3 + z * 23.7 + h) * 43758.5453;
      return s - Math.floor(s) - 0.5;
    };
    // Back dark, flank mid, belly pale; a dark saddle stripe; mottling.
    const body = (px, py, pz, ny) => {
      const k = smoothstep(-0.35, 0.55, ny);
      const kb = smoothstep(-0.2, -0.75, ny);
      const n = 1 + noise(px, py, pz) * 0.22;
      return [
        (fr[0] * k + (fr[0] * 1.18) * (1 - k)) * (1 - kb) * n + bl[0] * kb,
        (fr[1] * k + (fr[1] * 1.18) * (1 - k)) * (1 - kb) * n + bl[1] * kb,
        (fr[2] * k + (fr[2] * 1.18) * (1 - k)) * (1 - kb) * n + bl[2] * kb,
      ];
    };
    const legc = (px, py, pz) => {
      const n = 1 + noise(px, py, pz) * 0.2;
      return [lg[0] * n, lg[1] * n, lg[2] * n];
    };
    const headc = (px, py, pz, ny) => {
      const c = body(px, py, pz, ny);
      const muzzle = smoothstep(0.1, 0.25, pz);
      const m = 0.25 * muzzle;
      return [c[0] + (bl[0] - c[0]) * m * (ny < 0.4 ? 2.4 : 1), c[1] + (bl[1] - c[1]) * m * (ny < 0.4 ? 2.4 : 1), c[2] + (bl[2] - c[2]) * m * (ny < 0.4 ? 2.4 : 1)];
    };
    const tailc = (px, py, pz, ny) => {
      const c = body(px, py, pz, ny);
      const tipDark = smoothstep(-0.2, -0.45, pz) * 0.5;
      return [c[0] * (1 - tipDark), c[1] * (1 - tipDark), c[2] * (1 - tipDark)];
    };
    const fur = { tint };
    const parts = [];
    const P = (geo, boneRef, matrix) => parts.push({ geo, bone: boneRef, matrix });

    P(loft(S.pelvis, { color: body, ...fur, radial: 14, vRep: 3 }), pelvis);
    P(loft(S.chest, { color: body, ...fur, radial: 14, vRep: 3 }), chest);
    P(loft(S.neck, { color: body, ...fur, radial: 12, vRep: 1.5 }), neck);
    P(loft(S.head, { color: headc, ...fur, radial: 12, vRep: 1.2 }), head);
    P(loft(S.jaw, { color: headc, ...fur, radial: 8, res: 2 }), jaw);
    // Nose, dark mouth, teeth.
    const noseZ = S.head[S.head.length - 2].z + 0.012;
    P(ellipsoid(S.head[S.head.length - 2].w * 0.9, S.head[S.head.length - 2].h * 0.85, 0.016, [0, S.head[S.head.length - 2].y + 0.002, noseZ], { color: () => [0.05, 0.04, 0.04], ws: 8, hs: 6 }), head);
    const mouth = S.jaw[Math.floor(S.jaw.length / 2)];
    P(ellipsoid(mouth.w * 0.7, 0.008, S.jaw[S.jaw.length - 1].z * 0.4, [0, -0.002, S.jaw[S.jaw.length - 1].z * 0.5], { color: () => [0.3, 0.06, 0.07], ws: 8, hs: 4 }), jaw);
    const fang = (sx, up) => loft([{ z: 0, w: 0.006 * (S.name === 'bear' ? 2 : 1), h: 0.006 * (S.name === 'bear' ? 2 : 1) }, { z: 0.032 * (S.name === 'bear' ? 1.6 : 1), w: 0.0015, h: 0.0015 }], {
      radial: 5, res: 1, color: () => [0.92, 0.9, 0.82], rotate: new THREE.Matrix4().makeRotationX(up ? Math.PI / 2 : -Math.PI / 2),
    });
    const jz = S.head[S.head.length - 3].z;
    for (const sx of [-1, 1]) {
      const g1 = fang(sx, true);
      g1.translate(sx * S.head[S.head.length - 3].w * 0.7, S.head[S.head.length - 3].y - S.head[S.head.length - 3].h * 0.7, jz + 0.02);
      P(g1, head);
      const g2 = fang(sx, false);
      g2.translate(sx * 0.018, -0.012, mouth.z * 0.9 + 0.1);
      P(g2, jaw);
    }
    // Ears: flattened cones.
    for (const [eb, sx] of [[earL, 1], [earR, -1]]) {
      const e = S.ear;
      const g = loft([{ z: 0, w: e.w * 0.55, h: 0.018 }, { z: e.h * 0.5, w: e.w * 0.5, h: 0.014 }, { z: e.h, w: 0.005, h: 0.005 }], {
        radial: 6, res: 2, color: (px, py) => { const k = 1 - py / (e.h * 1.5); return [fr[0] * 0.75 * k + 0.1, fr[1] * 0.75 * k + 0.1, fr[2] * 0.75 * k + 0.1]; }, ...fur,
        rotate: new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.0), // +z -> +y
      });
      void sx;
      P(g, eb);
    }
    // Hackle ridge along the back: a row of small spikes that grow when the creature is angry.
    for (let i = 0; i < 7; i++) {
      const z = -0.05 + i * (S.bodyLen * 0.1);
      const spike = loft([{ z: 0, w: 0.022 * (S.name === 'bear' ? 2 : 1), h: 0.014 }, { z: 0.07 * (S.name === 'bear' ? 2 : 1), w: 0.004, h: 0.003 }], {
        radial: 5, res: 1, color: (px, py) => { const c = body(0, 0, 0, 0.9); const k = 1.0 + py * 2; return [c[0] * k, c[1] * k, c[2] * k]; }, ...fur,
        rotate: new THREE.Matrix4().makeRotationX(-Math.PI / 2),
      });
      spike.translate(0, -0.012, z - 0.14);
      P(spike, ridge);
    }
    // Tail.
    const tl = S.tail.len, tr = S.tail.r;
    tail.forEach((tb, i) => {
      const L = tl[i];
      const last = i === tail.length - 1;
      const g = loft([
        { z: 0.02, w: tr[i], h: tr[i] }, { z: -L * 0.5, w: (tr[i] + tr[i + 1]) * 0.56, h: (tr[i] + tr[i + 1]) * 0.56 },
        { z: -L * (last ? 1 : 1.2), w: last ? 0.006 : tr[i + 1] * 1.02, h: last ? 0.006 : tr[i + 1] * 1.02 },
      ], { radial: 8, res: 2, color: tailc, ...fur });
      P(g, tb);
    });
    // Legs.
    for (const L of legs) {
      const ls = L.spec;
      const b = L.bones;
      const upperG = limb(ls.L1, ls.r0, ls.r1, { depth: ls.depth, belly: ls.belly || 1, color: legc, ...fur });
      P(upperG, b.upper);
      P(limb(ls.L2, ls.r1, ls.r2, { depth: L.front ? 1 : 0.9, color: legc, ...fur }), b.lower);
      P(ellipsoid(ls.r1 * 1.12, ls.r1 * 1.12, ls.r1 * 1.12, [0, 0, 0], { color: legc, ...fur, ws: 6, hs: 5 }), b.lower);
      P(limb(ls.L3, ls.r2, ls.r2 * 0.9, { depth: 1, radial: 6, color: legc, ...fur }), b.pastern);
      P(ellipsoid(ls.r2 * 1.1, ls.r2 * 1.1, ls.r2 * 1.1, [0, 0, 0], { color: legc, ...fur, ws: 6, hs: 4 }), b.pastern);
      const pr = S.pawR;
      P(ellipsoid(pr[0], pr[1], pr[2], [0, -pr[1] * 0.7, pr[2] * 0.45], { color: () => [lg[0] * 0.8, lg[1] * 0.8, lg[2] * 0.8], ws: 8, hs: 6 }), b.paw);
    }
    // Scar across the face (alpha): a pale slash over the left eye and muzzle.
    if (o.scar) {
      const g = ellipsoid(0.004, 0.05, 0.1, [S.eye[0] * 0.95, S.eye[1] + 0.005, S.eye[2] + 0.05], { color: () => [0.78, 0.62, 0.58], ws: 5, hs: 5, rot: [0.2, 0, 0.3] });
      P(g, head);
    }

    const tex = furTexture(S.texKey, [0.9, 0.9, 0.9], { seed: S.texSeed });
    this.baseEmissive = new THREE.Color(...(o.emissive || [0.007, 0.0085, 0.013]));
    this.material = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.96, metalness: 0, emissive: this.baseEmissive.clone() });
    this.material.userData.noSnow = true;
    const { mesh, skeleton } = makeSkinned(bones, parts, this.material, this.root);
    this.mesh = mesh;
    this.skeleton = skeleton;
    mesh.name = `${S.name}_body`;

    // Eyes: faint emissive (they catch the bloom at night).
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...(o.eyeColor || [1.6, 1.15, 0.25])), fog: true });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(S.eyeR, 8, 6), this.eyeMat);
      e.position.set(sx * S.eye[0], S.eye[1], S.eye[2]);
      e.scale.set(0.6, 0.9, 1.2);
      head.add(e);
      this.eyes.push(e);
    }
    this.root.scale.setScalar(this.scale);
  }

  // ---- animation -----------------------------------------------------------------------------------------
  update(dt, speed, turn = 0) {
    const S = this.spec, B = this.b, pose = this.pose, cur = this.cur;
    this.t += dt;
    this.speed = speed;
    const sc = S;
    // Damp the pose toward its targets.
    const lam = 11;
    for (const k of ['crouch', 'pitch', 'neck', 'headRel', 'lookYaw', 'lookPitch', 'jaw', 'ears', 'tail', 'tailWag', 'hackles', 'roll', 'bodyY', 'feetW', 'pawFlat']) {
      cur[k] = dt > 0 ? damp(cur[k], pose[k], k === 'jaw' ? 22 : k === 'lookYaw' ? 9 : lam, dt) : pose[k];
    }
    if (pose.feet) {
      if (!cur.feet) cur.feet = pose.feet.map((f) => [f[0], f[1]]);
      for (let i = 0; i < 4; i++) {
        cur.feet[i][0] = dt > 0 ? damp(cur.feet[i][0], pose.feet[i][0], 14, dt) : pose.feet[i][0];
        cur.feet[i][1] = dt > 0 ? damp(cur.feet[i][1], pose.feet[i][1], 14, dt) : pose.feet[i][1];
      }
    }

    // Gait.
    const effSpeed = Math.max(speed, Math.abs(turn) * 0.28 * (this.dead_ > 0 ? 0 : 1));
    const g = pickGait(effSpeed, this.gait);
    if (g !== this.gait) {
      this.gait = g;
      this.blend = 0.24;
      for (const l of this.legs) { l.from.z = l.cur.z; l.from.y = l.cur.y; }
    }
    const G_ = GAITS[g];
    const sk = S.stride;
    if (G_) {
      const ls = G_.ls * sk;
      const f = clamp(effSpeed * G_.duty / ls, 0.5, 4.4);
      this.phase = (this.phase + f * dt) % 1;
    }
    this.blend = Math.max(0, this.blend - dt);
    const blendE = this.blend > 0 ? ease(1 - this.blend / 0.24) : 1;

    // Body pose.
    const idleLife = 1 - clamp(effSpeed / 1.2);
    const breath = Math.sin(this.t * 2.2) * 0.004 * idleLife;
    let bob = 0, gPitch = 0, gFlex = 0, sway = 0;
    if (G_) {
      const p = this.phase;
      if (g === 'run') {
        bob = G_.bob * (0.5 + 0.5 * Math.cos(TAU * (p - 0.05))) - G_.bob * 0.3;
        gPitch = G_.pitch * Math.sin(TAU * (p - 0.12));
        gFlex = G_.flex * Math.sin(TAU * (p + 0.15));
      } else {
        bob = G_.bob * Math.cos(TAU * G_.bobHz * p) * 0.8;
        gPitch = G_.pitch * Math.sin(TAU * G_.bobHz * p + 0.6);
        gFlex = G_.flex * Math.sin(TAU * p);
      }
      sway = G_.sway * Math.sin(TAU * p);
    }
    const dead = this.dead_;
    const standY = S.pelvisY;
    const crouchDrop = cur.crouch * (S.pelvisY * 0.2);
    const pelvisY = standY - crouchDrop + bob * S.lift + cur.bodyY + breath;
    const betaP = gPitch + cur.pitch - cur.crouch * 0.1;
    const betaC = betaP + gFlex + cur.crouch * 0.05;
    const roll = cur.roll + sway * 0.4;
    B.pelvis.position.set(0, pelvisY, this.pelvisZ);
    B.pelvis.rotation.set(-betaP, sway * 0.9, roll);
    B.chest.rotation.set(-(betaC - betaP), -sway * 1.2, 0);

    // Joint positions in rig space (z forward, y up), tracking the pitch.
    const cB = Math.cos(betaP), sB = Math.sin(betaP);
    const sz = this.pelvisZ + (S.bodyLen * cB - S.shoulderDY * sB);
    const sy = pelvisY + (S.bodyLen * sB + S.shoulderDY * cB);
    const cC = Math.cos(betaC), sC = Math.sin(betaC);
    const Hf = { z: sz - 0.03 * (-sC), y: sy - 0.03 * cC };
    const Hh = { z: this.pelvisZ, y: pelvisY };

    // Feet.
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const ls = L.spec;
      let tz = L.nz, ty = ls.ankle;
      let pawA = 0;
      if (G_) {
        const p = (this.phase + G_.off[i]) % 1;
        const planted = p < G_.duty;
        if (planted && L.swinging) this._paw();
        L.swinging = !planted;
        const stride = G_.ls * sk;
        const reach = G_.reach * (L.front ? 1 : -0.4);
        if (p < G_.duty) {
          const u = p / G_.duty;
          tz += stride * (0.5 - u) + reach * 0.4;
        } else {
          const u = (p - G_.duty) / (1 - G_.duty);
          const e = ease(u);
          tz += -stride * 0.5 + stride * e + reach * (0.4 + 0.6 * Math.sin(u * Math.PI));
          const lift = G_.lift * S.lift;
          ty += lift * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.85);
          pawA = -0.5 * Math.sin(Math.PI * u);
        }
      }
      // Gait change crossfade.
      if (this.blend > 0) { tz = L.from.z + (tz - L.from.z) * blendE; ty = L.from.y + (ty - L.from.y) * blendE; }
      L.cur.z = tz; L.cur.y = ty;
      if (cur.feetW > 0.001 && cur.feet) {
        tz += (cur.feet[i][0] - tz) * cur.feetW;
        ty += (cur.feet[i][1] - ty) * cur.feetW;
      }
      // Solve.
      const H = L.front ? Hf : Hh;
      const Q = { z: tz, y: ty };
      let phi = ls.phi;
      if (G_ && L.front === false) phi += 0.12 * Math.sin(TAU * this.phase * 0 + i);
      // When the foot swings, flex the pastern a little.
      leg2D(H, Q, ls.L1, ls.L2, ls.L3, phi, ls.bend, L.ik);
      const ik = L.ik;
      const beta = L.front ? betaC : betaP;
      const b = L.bones;
      b.upper.rotation.set(-(ik.a1 - beta), 0, 0);
      b.lower.rotation.set(-(ik.a2 - ik.a1), 0, 0);
      b.pastern.rotation.set(-(ik.a3 - ik.a2), 0, 0);
      const pawAngle = (pawA * 0.6) * (1 - cur.feetW) + (cur.feetW > 0 ? -0.3 * cur.feetW * (1 - cur.pawFlat) : 0);
      b.paw.rotation.set(-(pawAngle - ik.a3), 0, 0);
      b.upper.rotation.z = 0;
    }

    // Neck and head.
    const lookYaw = clamp(cur.lookYaw, -1.1, 1.1);
    B.neck.rotation.set(-(cur.neck - betaC * 0.5), lookYaw * 0.55, -lookYaw * 0.08);
    B.head.rotation.set(-(cur.headRel + cur.lookPitch - betaC * 0.0), lookYaw * 0.45, lookYaw * 0.06);
    B.jaw.rotation.set(cur.jaw * 0.62, 0, 0);

    // Ears, with an occasional twitch while standing.
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) { this.nextTwitch = 2 + Math.random() * 5; this.earTwitch[Math.random() < 0.5 ? 0 : 1] = 1; }
    this.earTwitch[0] = Math.max(0, this.earTwitch[0] - dt * 5);
    this.earTwitch[1] = Math.max(0, this.earTwitch[1] - dt * 5);
    const eb = cur.ears;
    B.earL.rotation.set(-(0.15 + eb * 1.0) + Math.sin(this.earTwitch[0] * 6) * 0.25 * this.earTwitch[0], 0, 0.12 + eb * 0.5);
    B.earR.rotation.set(-(0.15 + eb * 1.0) + Math.sin(this.earTwitch[1] * 6) * 0.25 * this.earTwitch[1], 0, -(0.12 + eb * 0.5));

    // Tail: base follows raise, then a traveling wave.
    const wag = cur.tailWag + 0.06 * idleLife;
    const tt = this.t * (2.5 + effSpeed * 0.5);
    for (let i = 0; i < B.tail.length; i++) {
      const w = Math.sin(tt - i * 0.9) * (wag + (G_ ? 0.1 : 0)) * (1 + i * 0.4);
      B.tail[i].rotation.set(i === 0 ? cur.tail + gPitch * -0.6 : cur.tail * 0.5, w, 0);
    }

    // Hackles.
    const hk = cur.hackles;
    B.ridge.scale.set(1, 0.4 + hk * 1.8, 1);

    // Death collapse.
    if (this.deadTarget !== this.dead_) {
      this.dead_ = clamp(this.dead_ + Math.sign(this.deadTarget - this.dead_) * dt * 2.2);
    }
    if (this.dead_ > 0) this._applyDead(dt);

    // Night legibility (a faint cold glow that follows uNight) and the hit flash.
    const night = G.uniforms?.uNight?.value ?? 0.5;
    this.flashK = Math.max(0, this.flashK - dt * 9);
    const k = this.flashK, be = this.baseEmissive;
    this.material.emissive.setRGB(be.r * night + 1.0 * k, be.g * night + 0.35 * k, be.b * night + 0.28 * k);
    void sc; void dead;
  }

  flash(k = 1) { this.flashK = Math.max(this.flashK, k); }

  // Collapse onto the side. Overrides the IK legs with a limp sprawl.
  dead(side = 1) {
    this.deadTarget = 1;
    this.deadSide = side;
    this.twitch = 1;
  }
  revive() { this.deadTarget = 0; }

  _applyDead() {
    const S = this.spec, B = this.b;
    const d = ease(this.dead_);
    const side = this.deadSide;
    const lieY = Math.max(S.chest[2].w, S.pelvis[2].w) * 0.95;
    B.pelvis.position.y = B.pelvis.position.y + (lieY - B.pelvis.position.y) * d;
    B.pelvis.rotation.z = B.pelvis.rotation.z + (side * (Math.PI / 2 - 0.12) - B.pelvis.rotation.z) * d;
    B.pelvis.rotation.x = B.pelvis.rotation.x * (1 - d);
    B.chest.rotation.x *= 1 - d;
    this.twitch = Math.max(0, this.twitch - 0.01);
    const tw = Math.sin(this.t * 40) * 0.12 * this.twitch * (1 - d * 0.0);
    const lerpRot = (bone, x) => { bone.rotation.x += (x - bone.rotation.x) * d; };
    const poses = [
      [-0.9, -0.5, 0.3], [-0.7, -0.4, 0.2], [0.6, 0.8, -0.2], [0.5, 0.9, -0.1],
    ];
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      lerpRot(L.bones.upper, poses[i][0] + tw);
      lerpRot(L.bones.lower, poses[i][1]);
      lerpRot(L.bones.pastern, poses[i][2]);
      lerpRot(L.bones.paw, 0);
    }
    this.b.neck.rotation.x += (0.35 - this.b.neck.rotation.x) * d;
    this.b.head.rotation.x += (0.2 - this.b.head.rotation.x) * d;
    this.b.jaw.rotation.x += (0.35 - this.b.jaw.rotation.x) * d;
    for (const e of this.eyes) e.visible = d < 0.5;
  }

  // A paw lands: soft snow under wolves, heavier and lower under the bear. Only near the camera.
  _paw() {
    const cam = G.camera, p = this.root.position;
    if (!cam || !G.audio?.sfx) return;
    const dx = cam.position.x - p.x, dz = cam.position.z - p.z;
    if (dx * dx + dz * dz > 24 * 24) return;
    const bear = this.spec.name === 'bear';
    G.audio.sfx('paw_snow', { pos: p, volume: bear ? 0.9 : 0.5, pitch: bear ? 0.6 : 1 });
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.mesh.geometry.dispose();
    this.skeleton.dispose();
    this.material.dispose();
    this.eyeMat.dispose();
    for (const e of this.eyes) e.geometry.dispose();
  }
}
