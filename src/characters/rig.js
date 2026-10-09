// Body proportions and the humanoid skeleton.
//
// measure(body) turns preset body parameters (sex, age, height, mass, shoulders, hips, stoop)
// into joint landmarks in meters (bind pose: upright, arms in a relaxed A-pose, +Z forward,
// left side at +X). buildSkeleton(M, opts) creates THREE.Bones with IDENTITY bind orientation
// for every bone, so clip rotations are plain offsets from the bind pose in the parent frame
// (see clips/pose.js for the authoring convention).
//
// Bone names: hips, spine, chest, neck, head, jaw, eyeL/R, lidUL/UR/LL/LR, browIL/IR/OL/OR,
// mouthL/R, cheekL/R, shoulderL/R, armL/R, forearmL/R, handL/R, fingersL/R, fingers2L/R,
// thumbL/R, thighL/R, shinL/R, footL/R, toeL/R, plus optional chains: skirt<k>_<j>, braid<j>,
// cape<k>_<j>, tail<j> and sockets (sheathA, sheathB, hip sockets).
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function measure(body = {}) {
  const sex = body.sex || 'm';
  const age = body.age ?? 35;
  const child = age < 15;
  const elder = age >= 60;
  const H = body.height || (child ? 1.2 + (age - 5) * 0.055 : sex === 'f' ? 1.66 : 1.76);
  const mass = body.mass ?? 0.5; // 0 gaunt .. 1 heavy
  const muscle = body.muscle ?? 0.5;
  const fem = sex === 'f' ? 1 : 0;
  // Heads tall: 7.5 adult; children read younger with bigger heads; elders compress.
  const heads = child ? lerp(6.0, 7.1, clamp((age - 5) / 9, 0, 1)) : elder ? 7.3 : 7.5;
  const headH = (H / heads) * (body.headScale || 1);
  const legRatio = (child ? 0.515 - (15 - age) * 0.0055 : 0.515) * (body.legs || 1);

  const M = { sex, age, child, elder, H, mass, muscle, fem, headH, heads, stoop: body.stoop ?? (elder ? 0.6 : 0) };
  const k = H / 1.76; // linear scale vs reference male (used for girths)
  M.k = k;
  M.headK = headH / 0.2347; // head sculpt is authored for a 23.5 cm head
  M.crown = H;
  M.headPivotY = H - 0.8 * headH;
  M.neckLen = H * (child ? 0.04 : 0.046) * (body.neck || 1);
  M.neckBaseY = M.headPivotY - M.neckLen;
  M.ankleY = H * 0.046;
  M.hipJY = H * legRatio;
  const T = M.neckBaseY - M.hipJY;
  M.torsoLen = T;
  M.pelvisY = M.hipJY + T * 0.12;
  M.spineY = M.hipJY + T * 0.34;
  M.chestY = M.hipJY + T * 0.6;
  M.shoulderY = M.hipJY + T * 0.93;
  M.kneeY = M.ankleY + (M.hipJY - M.ankleY) * 0.485;

  // Widths (half), scaled by sex, build and the preset multipliers.
  const sh = body.shoulders || 1, hp = body.hips || 1;
  M.shoulderX = H * lerp(0.106, 0.094, fem) * (child ? 0.95 : 1) * sh * lerp(0.96, 1.05, muscle);
  M.hipJX = H * lerp(0.05, 0.057, fem) * hp * lerp(0.95, 1.08, mass);
  M.clavX = H * 0.012;
  // Girth half-sizes of the torso at key heights (body surface, before clothes).
  const g = lerp(0.88, 1.22, mass) * (child ? 0.93 : 1);
  M.girth = g;
  M.waistW = H * lerp(0.075, 0.068, fem) * g * (elder ? 1.05 : 1);
  M.waistD = H * lerp(0.056, 0.052, fem) * g * (mass > 0.7 ? 1 + (mass - 0.7) * 0.9 : 1);
  M.hipW = H * lerp(0.088, 0.1, fem) * hp * lerp(0.93, 1.12, mass);
  M.hipD = H * lerp(0.06, 0.066, fem) * lerp(0.93, 1.1, mass);
  M.chestW = H * lerp(0.094, 0.083, fem) * sh * g * lerp(0.95, 1.06, muscle);
  M.chestD = H * lerp(0.064, 0.06, fem) * g * lerp(0.96, 1.05, muscle);
  M.bust = fem && !child ? 0.012 * k * (body.bust ?? 1) : 0;
  M.neckR = H * lerp(0.033, 0.0285, fem) * lerp(0.92, 1.12, mass) * (child ? 0.92 : 1);
  M.armR = H * lerp(0.025, 0.021, fem) * lerp(0.86, 1.18, mass) * lerp(0.93, 1.08, muscle);
  M.thighR = H * lerp(0.036, 0.036, fem) * lerp(0.86, 1.2, mass);
  M.calfR = H * 0.024 * lerp(0.9, 1.12, mass);

  const armLen = H * (child ? 0.425 : 0.44);
  M.upperArm = armLen * 0.39;
  M.forearm = armLen * 0.335;
  M.handLen = armLen * 0.25;
  M.footLen = H * 0.152;
  M.heelZ = -H * 0.032;
  M.ballZ = H * 0.082;
  M.toeZ = H * 0.12;
  M.footW = H * 0.03;
  // A-pose: arms hang 33 degrees out from vertical in the bind pose.
  M.armAngle = 33 * Math.PI / 180;
  return M;
}

// Joint positions in bind space for one side (s = +1 left, -1 right).
export function armJoints(M, s) {
  const a = M.armAngle;
  const dir = V(s * Math.sin(a), -Math.cos(a), 0.0);
  const sh = V(s * M.shoulderX, M.shoulderY, -0.008 * M.k);
  const el = sh.clone().addScaledVector(dir, M.upperArm);
  el.z -= 0.012 * M.k;
  const wr = el.clone().addScaledVector(dir, M.forearm);
  wr.z += 0.02 * M.k;
  const knuck = wr.clone().addScaledVector(dir, M.handLen * 0.48);
  const fing2 = wr.clone().addScaledVector(dir, M.handLen * 0.72);
  const tip = wr.clone().addScaledVector(dir, M.handLen);
  const clav = V(s * M.clavX, M.shoulderY + 0.01 * M.k, 0.012 * M.k);
  return { dir, clav, sh, el, wr, knuck, fing2, tip };
}

export function legJoints(M, s) {
  const hip = V(s * M.hipJX, M.hipJY, 0);
  const knee = V(s * M.hipJX * 0.93, M.kneeY, 0.008 * M.k);
  const ankle = V(s * M.hipJX * 0.9, M.ankleY, -0.01 * M.k);
  const ball = V(s * M.hipJX * 0.94, M.H * 0.012, M.ballZ);
  return { hip, knee, ankle, ball };
}

// Head-local landmark positions (relative to head pivot), scaled by M.headK.
export function headLandmarks(M) {
  const h = M.headK;
  return {
    eyeL: V(0.032 * h, 0.072 * h, 0.073 * h),
    eyeR: V(-0.032 * h, 0.072 * h, 0.073 * h),
    jaw: V(0, 0.028 * h, 0.006 * h),
    mouthL: V(0.024 * h, 0.006 * h, 0.098 * h),
    mouthR: V(-0.024 * h, 0.006 * h, 0.098 * h),
    browIL: V(0.017 * h, 0.098 * h, 0.098 * h),
    browIR: V(-0.017 * h, 0.098 * h, 0.098 * h),
    browOL: V(0.046 * h, 0.1 * h, 0.082 * h),
    browOR: V(-0.046 * h, 0.1 * h, 0.082 * h),
    cheekL: V(0.042 * h, 0.042 * h, 0.085 * h),
    cheekR: V(-0.042 * h, 0.042 * h, 0.085 * h),
  };
}

// Builds the skeleton. opts: { skirt: n chains (0 = none), skirtLen, braid: segments,
// braidStart: Vector3 head-local, cape: { cols, len }, sheaths: bool }
export function buildSkeleton(M, opts = {}) {
  const bones = [];
  const byName = {};
  const world = {}; // bind world positions
  const add = (name, parentName, pos) => {
    const b = new THREE.Bone();
    b.name = name;
    world[name] = pos.clone();
    if (parentName) {
      const p = byName[parentName];
      b.position.copy(pos).sub(world[parentName]);
      p.add(b);
    } else {
      b.position.copy(pos);
    }
    bones.push(b);
    byName[name] = b;
    return b;
  };
  const k = M.k;
  add('hips', null, V(0, M.pelvisY, 0));
  add('spine', 'hips', V(0, M.spineY, -0.012 * k));
  add('chest', 'spine', V(0, M.chestY, -0.008 * k));
  add('neck', 'chest', V(0, M.neckBaseY, -0.022 * k));
  add('head', 'neck', V(0, M.headPivotY, -0.006 * k));
  const hp = world.head;
  const L = headLandmarks(M);
  const hl = (name, v) => add(name, 'head', hp.clone().add(v));
  hl('jaw', L.jaw);
  hl('eyeL', L.eyeL); hl('eyeR', L.eyeR);
  hl('lidUL', L.eyeL); hl('lidUR', L.eyeR);
  hl('lidLL', L.eyeL); hl('lidLR', L.eyeR);
  hl('browIL', L.browIL); hl('browIR', L.browIR);
  hl('browOL', L.browOL); hl('browOR', L.browOR);
  hl('cheekL', L.cheekL); hl('cheekR', L.cheekR);
  hl('mouthL', L.mouthL);
  hl('mouthR', L.mouthR);

  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const a = armJoints(M, s);
    add('shoulder' + S, 'chest', a.clav);
    add('arm' + S, 'shoulder' + S, a.sh);
    add('forearm' + S, 'arm' + S, a.el);
    add('hand' + S, 'forearm' + S, a.wr);
    add('fingers' + S, 'hand' + S, a.knuck);
    add('fingers2' + S, 'fingers' + S, a.fing2);
    const th = a.wr.clone().addScaledVector(a.dir, M.handLen * 0.12);
    th.z += 0.022 * k;
    th.x -= s * 0.004 * k;
    add('thumb' + S, 'hand' + S, th);
  }
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const l = legJoints(M, s);
    add('thigh' + S, 'hips', l.hip);
    add('shin' + S, 'thigh' + S, l.knee);
    add('foot' + S, 'shin' + S, l.ankle);
    add('toe' + S, 'foot' + S, l.ball);
  }

  // Skirt / coat-tail chains around the hips: each chain has 2 joints and a tip.
  const chains = [];
  if (opts.skirt) {
    const n = opts.skirt;
    const top = opts.skirtTop ?? M.hipJY + 0.03 * k;
    const len = opts.skirtLen ?? 0.5 * k;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2; // 0 = front (+Z), increasing toward +X (left)
      const rx = M.hipW * 1.12, rz = M.hipD * 1.25;
      const p0 = V(Math.sin(ang) * rx, top, Math.cos(ang) * rz);
      const out = V(Math.sin(ang), 0, Math.cos(ang));
      const p1 = p0.clone().add(V(0, -len * 0.5, 0)).addScaledVector(out, len * 0.06);
      const tip = p0.clone().add(V(0, -len, 0)).addScaledVector(out, len * 0.14);
      add(`skirt${i}_0`, 'hips', p0);
      add(`skirt${i}_1`, `skirt${i}_0`, p1);
      chains.push({ kind: 'skirt', index: i, ang, joints: [`skirt${i}_0`, `skirt${i}_1`], tip: tip.clone().sub(p1), len });
    }
  }
  if (opts.braid) {
    const n = opts.braid;
    let p = hp.clone().add(opts.braidStart);
    let parent = 'head';
    const seg = opts.braidSeg;
    const names = [];
    for (let j = 0; j < n; j++) {
      const name = `braid${j}`;
      add(name, parent, p);
      names.push(name);
      parent = name;
      p = p.clone().add(V(0, -seg, -0.006 * k));
    }
    chains.push({ kind: 'braid', joints: names, tip: V(0, -seg, 0), len: seg * n });
  }
  if (opts.cape) {
    const { cols, len, top, width, depth } = opts.cape;
    for (let i = 0; i < cols; i++) {
      const u = cols === 1 ? 0 : i / (cols - 1) * 2 - 1;
      const p0 = V(u * width, top, -depth);
      const p1 = p0.clone().add(V(u * 0.03 * k, -len * 0.5, -0.04 * k));
      add(`cape${i}_0`, 'chest', p0);
      add(`cape${i}_1`, `cape${i}_0`, p1);
      chains.push({ kind: 'cape', index: i, joints: [`cape${i}_0`, `cape${i}_1`], tip: V(0, -len * 0.5, -0.02 * k), len });
    }
  }
  if (opts.tails) {
    // Generic dangling pairs (scarf ends, apron strings): [{ name, parent, at: Vector3, len }]
    for (const t of opts.tails) {
      add(`${t.name}_0`, t.parent, t.at);
      const p1 = t.at.clone().add(V(0, -t.len * 0.5, 0));
      add(`${t.name}_1`, `${t.name}_0`, p1);
      chains.push({ kind: 'tail', joints: [`${t.name}_0`, `${t.name}_1`], tip: V(0, -t.len * 0.5, 0), len: t.len });
    }
  }
  if (opts.sheaths) {
    add('sheathA', 'chest', world.chest.clone().add(V(0, 0.05 * k, -0.14 * k)));
    add('sheathB', 'chest', world.chest.clone().add(V(0, 0.05 * k, -0.15 * k)));
  }

  // Skeleton() computes inverse bind matrices from matrixWorld, so settle the hierarchy first.
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = {};
  bones.forEach((b, i) => { index[b.name] = i; });
  return { bones, byName, index, world, skeleton, chains, M };
}
