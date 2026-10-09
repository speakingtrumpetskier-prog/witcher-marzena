// Kasza: a shaggy dun mare (small sturdy mountain horse, about 1.42 m at the withers).
//
//   const h = createHorse('kasza');  G.scene.add(h.root);  h.setPosition(x, z);  h.yaw = a;
//   h.setGait(speed)      m/s: 0 idle, ~1.7 walk, ~3.6 trot, 7+ gallop (blended, phase-matched)
//   h.play('rear' | 'snort') -> Promise;  h.saddle (Object3D seat anchor: put the rider's
//   root here and play ride_idle / ride_trot / ride_gallop);  h.bones, h.height, h.gait
// Clips: idle, walk, trot, gallop (procedural, by speed), rear, snort (one-shots).
// Footfalls: walk is four-beat lateral (LH, LF, RH, RF), trot two-beat diagonal, gallop
// four-beat transverse with a right lead and a suspension phase. Dun coat: sandy body,
// dark legs, dorsal stripe, dark mane and tail, winter shag, saddle blanket with folk-red trim.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { MeshBuilder, M as mat, tube, blob, ribbon, frame, SPECIAL } from './geom.js';
import { createCharacterMaterial } from './material.js';
import { TILE } from './textures.js';
import { col, lerp, smoothstep, noise1, pnoise, rng } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// Bind joint positions (meters, horse root at the ground, +Z forward).
const J = {
  pelvis: V(0, 1.28, -0.5), spine: V(0, 1.3, -0.05), chest: V(0, 1.34, 0.36),
  neck1: V(0, 1.3, 0.6), neck2: V(0, 1.56, 0.86), head: V(0, 1.78, 1.04), jaw: V(0, 1.64, 1.14),
  earL: V(0.06, 1.9, 1.02), earR: V(-0.06, 1.9, 1.02),
  tail0: V(0, 1.3, -0.8), tail1: V(0, 1.14, -0.9), tail2: V(0, 0.9, -0.95),
};
const LEGF = (s) => ({
  scap: V(s * 0.14, 1.22, 0.46), arm: V(s * 0.17, 1.0, 0.56), fore: V(s * 0.17, 0.78, 0.4),
  cannon: V(s * 0.15, 0.46, 0.41), pastern: V(s * 0.15, 0.17, 0.42), hoof: V(s * 0.15, 0.07, 0.46),
});
const LEGH = (s) => ({
  thigh: V(s * 0.16, 1.14, -0.56), gaskin: V(s * 0.18, 0.76, -0.4), cannon: V(s * 0.16, 0.5, -0.66),
  pastern: V(s * 0.15, 0.17, -0.62), hoof: V(s * 0.15, 0.07, -0.58),
});

function buildRig() {
  const bones = [], by = {}, world = {};
  const add = (name, parent, p) => {
    const b = new THREE.Bone();
    b.name = name;
    world[name] = p.clone();
    if (parent) { b.position.copy(p).sub(world[parent]); by[parent].add(b); } else b.position.copy(p);
    bones.push(b); by[name] = b;
  };
  add('pelvis', null, J.pelvis);
  add('spine', 'pelvis', J.spine);
  add('chest', 'spine', J.chest);
  add('neck1', 'chest', J.neck1);
  add('neck2', 'neck1', J.neck2);
  add('head', 'neck2', J.head);
  add('jaw', 'head', J.jaw);
  add('earL', 'head', J.earL);
  add('earR', 'head', J.earR);
  add('tail0', 'pelvis', J.tail0);
  add('tail1', 'tail0', J.tail1);
  add('tail2', 'tail1', J.tail2);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const f = LEGF(s);
    add('scap' + S, 'chest', f.scap);
    add('armF' + S, 'scap' + S, f.arm);
    add('foreF' + S, 'armF' + S, f.fore);
    add('cannonF' + S, 'foreF' + S, f.cannon);
    add('pasternF' + S, 'cannonF' + S, f.pastern);
    add('hoofF' + S, 'pasternF' + S, f.hoof);
    const h = LEGH(s);
    add('thighH' + S, 'pelvis', h.thigh);
    add('gaskinH' + S, 'thighH' + S, h.gaskin);
    add('cannonH' + S, 'gaskinH' + S, h.cannon);
    add('pasternH' + S, 'cannonH' + S, h.pastern);
    add('hoofH' + S, 'pasternH' + S, h.hoof);
  }
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = {};
  bones.forEach((b, i) => { index[b.name] = i; });
  return { bones, byName: by, world, skeleton, index };
}

// Polyline helpers for limb tubes.
function limb(mb, pts, radii, mats, weightsFn, o = {}) {
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const f = frame(b.clone().sub(a), V(0, 0, 1));
    const r = radii[i];
    return { c: p, a: f.a, b: f.b, ra: r[0], rb: r[1], i };
  });
  tube(mb, { rings, seg: o.seg || 10, mat: mats, capEnd: o.capEnd, capStart: o.capStart,
    color: o.color ? (ri, th) => o.color(ri, th, rings[ri]) : null,
    weights: (ri) => weightsFn(ri) });
}

function buildHorseMesh(rig, look) {
  const mb = new MeshBuilder(rig.index);
  const R = rng(look.seed || 11);
  const coat = col(look.coat || '#b0915f');
  const dark = col(look.points || '#3a2e24');
  const maneC = col(look.mane || '#2a221c');
  const fur = (c) => mat(c, { tile: 'fur', rough: 0.85, fuzz: 0.7, tileU: 8, tileV: 6 });
  const bodyMat = fur(coat);
  // ---- barrel: rings along Z
  const sec = [
    // z, yCenter, halfH, halfW
    [-0.86, 1.1, 0.16, 0.14], [-0.78, 1.07, 0.27, 0.24], [-0.6, 1.04, 0.31, 0.29], [-0.4, 1.0, 0.34, 0.3], [-0.15, 0.98, 0.35, 0.31],
    [0.1, 0.99, 0.35, 0.3], [0.32, 1.02, 0.34, 0.27], [0.5, 1.04, 0.3, 0.23], [0.62, 1.06, 0.22, 0.17], [0.68, 1.08, 0.12, 0.1],
  ];
  const rings = sec.map(([z, y, hh, hw]) => ({ c: V(0, y, z), a: V(0, 1, 0), b: V(-1, 0, 0), ra: hh, rb: hw, n: 2.2, z,
    r: (th) => 1 + 0.025 * pnoise(th, 5, z * 7, 3) - (Math.cos(th) > 0.8 && z > 0.3 ? 0 : 0) }));
  tube(mb, {
    rings, seg: 20, mat: bodyMat, capStart: true, capEnd: true,
    color: (ri, th, p) => {
      const c = coat.clone();
      // dorsal stripe and darker belly line
      const up = Math.cos(th);
      if (up > 0.97) c.lerp(dark, 0.7);
      if (up < -0.6) c.multiplyScalar(0.85);
      return c.multiplyScalar(0.92 + 0.12 * noise1(p.z * 4 + th, 5));
    },
    weights: (ri, th, p) => {
      const z = p.z;
      if (z < J.pelvis.z) return [['pelvis', 1]];
      if (z < J.spine.z) { const t = smoothstep(J.pelvis.z, J.spine.z, z); return [['pelvis', 1 - t], ['spine', t]]; }
      if (z < J.chest.z) { const t = smoothstep(J.spine.z, J.chest.z, z); return [['spine', 1 - t], ['chest', t]]; }
      return [['chest', 1]];
    },
  });
  // winter shag: a ragged fringe of hair hanging under the belly
  {
    const shag = mat(coat.clone().multiplyScalar(0.8), { tile: 'fur', rough: 0.95, fuzz: 0.9, tileU: 10, tileV: 3 });
    const fr = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      fr.push({ c: V(0, 0.7 + 0.02 * t, lerp(-0.45, 0.35, t)), a: V(0, 1, 0), b: V(-1, 0, 0), ra: 0.06, rb: 0.2 - 0.04 * Math.abs(t - 0.5), th0: Math.PI - 0.9, th1: Math.PI + 0.9 });
    }
    tube(mb, { rings: fr, seg: 10, mat: shag, open: true, r: undefined, weights: (ri, th, p) => (p.z < -0.05 ? [['spine', 1]] : [['chest', 1]]),
      color: (ri, th) => coat.clone().multiplyScalar(0.7 + 0.2 * Math.abs(Math.sin(th * 9 + ri))) });
  }
  // ---- neck (crest on top) and head
  const neckPts = [V(0, 1.12, 0.5), V(0, 1.3, 0.66), V(0, 1.48, 0.8), V(0, 1.64, 0.93), V(0, 1.76, 1.02)];
  const neckR = [[0.3, 0.22], [0.28, 0.18], [0.24, 0.145], [0.19, 0.12], [0.15, 0.1]];
  limb(mb, neckPts, neckR, bodyMat, (ri) => (ri < 1 ? [['chest', 1]] : ri < 2 ? [['chest', 0.3], ['neck1', 0.7]] : ri < 3 ? [['neck1', 0.5], ['neck2', 0.5]] : ri < 4 ? [['neck2', 1]] : [['neck2', 0.4], ['head', 0.6]]), { seg: 14 });
  const headPts = [V(0, 1.86, 1.0), V(0, 1.78, 1.1), V(0, 1.66, 1.2), V(0, 1.52, 1.29), V(0, 1.42, 1.36), V(0, 1.38, 1.39)];
  const headR = [[0.1, 0.11], [0.13, 0.12], [0.135, 0.11], [0.105, 0.088], [0.098, 0.086], [0.07, 0.068]];
  limb(mb, headPts, headR, bodyMat, (ri) => (ri === 0 ? [['head', 0.8], ['neck2', 0.2]] : [['head', 1]]), {
    seg: 12, capStart: true, capEnd: true,
    color: (ri) => (ri >= 4 ? dark.clone().multiplyScalar(1.1) : ri >= 3 ? coat.clone().lerp(dark, 0.45) : coat.clone()),
  });
  // jowls
  for (const s of [1, -1]) blob(mb, V(s * 0.06, 1.68, 1.1), { x: 0.05, y: 0.08, z: 0.08 }, bodyMat, [['head', 1]], 8, 5);
  // eyes and ears
  const eyeMat = mat(col('#120c0a'), { tile: 'plain', rough: 0.1, fuzz: 0, special: SPECIAL.eye, tileU: 1, tileV: 1 });
  for (const s of [1, -1]) {
    blob(mb, V(s * 0.1, 1.76, 1.11), { x: 0.022, y: 0.024, z: 0.026 }, eyeMat, [['head', 1]], 8, 6);
    const ear = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      ear.push({ c: V(s * (0.06 + t * 0.02), 1.9 + t * 0.12, 1.02 - t * 0.02), a: V(0, 0, 1), b: V(1, 0, 0), ra: 0.03 * (1 - t * 0.85), rb: 0.022 * (1 - t * 0.8) });
    }
    tube(mb, { rings: ear, seg: 6, mat: bodyMat, capEnd: true, color: () => coat.clone().lerp(dark, 0.4), weights: () => [['ear' + (s > 0 ? 'L' : 'R'), 1]] });
    // nostril
    blob(mb, V(s * 0.04, 1.42, 1.38), { x: 0.014, y: 0.02, z: 0.012 }, mat(col('#140e0c'), { tile: 'plain', rough: 0.6 }), [['head', 1]], 6, 4);
  }
  // ---- legs
  const legMat = fur(coat);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const f = LEGF(s);
    const fp = [f.arm.clone().add(V(-s * 0.04, 0.14, 0.02)), f.arm, f.fore.clone().add(V(0, 0.06, 0)), f.fore.clone().lerp(f.cannon, 0.5), f.cannon, f.cannon.clone().lerp(f.pastern, 0.5), f.pastern, f.hoof.clone().add(V(0, 0.02, -0.01))];
    const fr = [[0.12, 0.08], [0.11, 0.075], [0.09, 0.065], [0.065, 0.05], [0.05, 0.042], [0.036, 0.03], [0.045, 0.04], [0.042, 0.04]];
    const fw = [
      [['chest', 0.6], ['scap' + S, 0.4]], [['scap' + S, 0.4], ['armF' + S, 0.6]], [['armF' + S, 0.3], ['foreF' + S, 0.7]], [['foreF' + S, 1]],
      [['foreF' + S, 0.4], ['cannonF' + S, 0.6]], [['cannonF' + S, 1]], [['cannonF' + S, 0.4], ['pasternF' + S, 0.6]], [['pasternF' + S, 1]],
    ];
    limb(mb, fp, fr, legMat, (ri) => fw[ri], { seg: 10,
      color: (ri) => (ri >= 3 ? dark.clone().multiplyScalar(ri >= 6 ? 0.8 : 1) : coat.clone().lerp(dark, ri === 2 ? 0.25 : 0)) });
    const h = LEGH(s);
    const hp = [h.thigh.clone().add(V(-s * 0.02, 0.12, 0.02)), h.thigh, h.gaskin.clone().lerp(h.thigh, 0.35), h.gaskin, h.gaskin.clone().lerp(h.cannon, 0.55), h.cannon, h.cannon.clone().lerp(h.pastern, 0.5), h.pastern, h.hoof.clone().add(V(0, 0.02, -0.01))];
    const hr = [[0.16, 0.12], [0.15, 0.12], [0.13, 0.1], [0.1, 0.08], [0.07, 0.055], [0.055, 0.045], [0.036, 0.03], [0.045, 0.04], [0.042, 0.04]];
    const hw = [
      [['pelvis', 1]], [['pelvis', 0.4], ['thighH' + S, 0.6]], [['thighH' + S, 1]], [['thighH' + S, 0.4], ['gaskinH' + S, 0.6]], [['gaskinH' + S, 1]],
      [['gaskinH' + S, 0.4], ['cannonH' + S, 0.6]], [['cannonH' + S, 1]], [['cannonH' + S, 0.4], ['pasternH' + S, 0.6]], [['pasternH' + S, 1]],
    ];
    limb(mb, hp, hr, legMat, (ri) => hw[ri], { seg: 10,
      color: (ri) => (ri >= 5 ? dark.clone().multiplyScalar(ri >= 7 ? 0.8 : 1) : coat.clone().lerp(dark, ri === 4 ? 0.3 : 0)) });
    // hooves and winter feathering at the fetlocks
    const hoofMat = mat(col('#2a2420'), { tile: 'leather', rough: 0.55, fuzz: 0, tileU: 1, tileV: 2 });
    for (const [base, bone, fb] of [[f.hoof, 'hoofF' + S, 'pasternF' + S], [h.hoof, 'hoofH' + S, 'pasternH' + S]]) {
      const hr2 = [];
      for (let i = 0; i <= 2; i++) {
        const t = i / 2;
        hr2.push({ c: V(base.x, lerp(0.075, 0.0, t), base.z + 0.01 * t), a: V(0, 0, 1), b: V(1, 0, 0), ra: lerp(0.045, 0.062, t), rb: lerp(0.043, 0.056, t) });
      }
      // ensure a x b points down along the rings: (0,0,1)x(1,0,0) = (0,1,0) up; rings go down, tube auto-flips
      tube(mb, { rings: hr2, seg: 10, mat: hoofMat, capEnd: true, weights: () => [[bone, 1]] });
      const feath = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        feath.push({ c: V(base.x, lerp(0.2, 0.07, t), base.z - 0.03 + 0.02 * t), a: V(0, 0, 1), b: V(1, 0, 0), ra: lerp(0.045, 0.07, t), rb: lerp(0.042, 0.065, t),
          r: (th) => 1 + 0.18 * Math.abs(Math.sin(th * 7 + i)) });
      }
      tube(mb, { rings: feath, seg: 12, mat: mat(dark.clone().multiplyScalar(1.15), { tile: 'fur', rough: 0.9, fuzz: 0.9, tileU: 6, tileV: 3 }), weights: () => [[fb, 0.6], [bone, 0.4]], inner: { inset: 0.006, hem: true } });
    }
  }
  // ---- mane: hair strands along the crest falling to the left; forelock
  const maneMat = mat(maneC, { tile: 'hair', rough: 0.6, fuzz: 0.5, tileU: 3, tileV: 10 });
  {
    // crest ridge along the top of the neck, falling to the left, with ragged strands
    const crest = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const fi = t * 4, i0 = Math.min(3, Math.floor(fi)), f = fi - i0;
      const c = neckPts[i0].clone().lerp(neckPts[i0 + 1], f);
      const dir = neckPts[i0 + 1].clone().sub(neckPts[i0]).normalize();
      const fr = frame(dir, V(0, 0, 1));
      const ra = lerp(neckR[i0][0], neckR[i0 + 1][0], f);
      crest.push({ top: c.clone().addScaledVector(fr.a, -ra * 0.92), dir, t });
    }
    const rings = crest.map(({ top, dir, t }) => {
      const up = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      const left = new THREE.Vector3().crossVectors(up, dir).normalize();
      const f = frame(dir, up);
      return { c: top.clone().addScaledVector(left, 0.035).addScaledVector(up, -0.01), a: f.a, b: f.b, ra: 0.05 - t * 0.012, rb: 0.07 - t * 0.02, n: 2.4, t };
    });
    tube(mb, { rings, seg: 10, mat: { ...maneMat, tileU: 5 }, capStart: true, capEnd: true,
      color: (ri, th) => maneC.clone().multiplyScalar(0.7 + 0.4 * Math.abs(Math.sin(th * 6 + ri))),
      weights: (ri) => { const t = rings[ri].t; return t < 0.3 ? [['chest', 0.4], ['neck1', 0.6]] : t < 0.75 ? [['neck1', 0.3], ['neck2', 0.7]] : [['neck2', 0.5], ['head', 0.5]]; } });
    for (let i = 0; i < 14; i++) {
      const t = (i + 0.5) / 14;
      const k = Math.min(7, Math.floor(t * 8));
      const top = crest[k].top;
      const dir = crest[k].dir;
      const up = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      const left = new THREE.Vector3().crossVectors(up, dir).normalize();
      const len = 0.16 + R() * 0.1 - t * 0.05;
      const pts = [top.clone().addScaledVector(left, 0.04), top.clone().addScaledVector(left, 0.09).addScaledVector(up, -len * 0.45), top.clone().addScaledVector(left, 0.11).addScaledVector(up, -len)];
      const bone = t < 0.3 ? 'neck1' : t < 0.75 ? 'neck2' : 'head';
      ribbon(mb, pts, pts.map(() => dir.clone()), [0.07, 0.06, 0.025], { ...maneMat, color: maneC.clone().multiplyScalar(0.7 + R() * 0.5) }, () => [[bone, 1]], { double: true });
    }
  }
  {
    const pts = [V(0, 1.92, 1.0), V(0.01, 1.86, 1.08), V(0.02, 1.76, 1.13)];
    ribbon(mb, pts, pts.map(() => V(1, 0, 0)), [0.06, 0.06, 0.03], maneMat, () => [['head', 1]], { double: true });
  }
  // ---- tail: thick hair on the tail chain, spreading at the end
  {
    const tp = [J.tail0.clone().add(V(0, 0.04, 0.04)), J.tail0, J.tail1, J.tail1.clone().lerp(J.tail2, 0.5), J.tail2, J.tail2.clone().add(V(0, -0.22, -0.02)), J.tail2.clone().add(V(0, -0.42, 0.0)), J.tail2.clone().add(V(0, -0.56, 0.02))];
    const trd = [[0.055, 0.05], [0.07, 0.06], [0.085, 0.07], [0.1, 0.075], [0.11, 0.08], [0.115, 0.08], [0.1, 0.07], [0.04, 0.03]];
    const tw = [[['pelvis', 0.6], ['tail0', 0.4]], [['tail0', 1]], [['tail0', 0.3], ['tail1', 0.7]], [['tail1', 1]], [['tail1', 0.3], ['tail2', 0.7]], [['tail2', 1]], [['tail2', 1]], [['tail2', 1]]];
    limb(mb, tp, trd, { ...maneMat, tileU: 6 }, (ri) => tw[ri], { seg: 12, capEnd: true, color: (ri, th) => maneC.clone().multiplyScalar(0.7 + 0.45 * Math.abs(Math.sin(th * 7 + ri * 1.3))) });
  }
  // ---- tack: blanket (folk-red trim), saddle, girth, stirrups, bridle, reins, saddlebags
  const seatZ = -0.02, seatY = 1.36;
  {
    const blanket = mat(col('#3e4a5a'), { tile: 'wool', rough: 0.9, fuzz: 0.4, tileU: 4, tileV: 4 });
    const rings = [];
    for (let i = 0; i <= 4; i++) {
      const z = lerp(0.36, -0.36, i / 4);
      const base = sec.reduce((acc, s2) => (Math.abs(s2[0] - z) < Math.abs(acc[0] - z) ? s2 : acc));
      rings.push({ c: V(0, base[1], z), a: V(0, 1, 0), b: V(-1, 0, 0), ra: base[2] + 0.018, rb: base[3] + 0.018, n: 2.2, th0: -1.15, th1: 1.15 });
    }
    tube(mb, { rings, seg: 14, mat: blanket, open: true, weights: (ri, th, p) => (p.z > 0.1 ? [['chest', 1]] : [['spine', 1]]), inner: { inset: 0.008, hem: true } });
    // trim band at the blanket's lower edges
    const trimM = { ...blanket, tile: TILE.emb(4), tileU: 1, tileV: 6, fuzz: 0.2, color: col('#9a2e22') };
    for (const side of [1, -1]) {
      const edge = [];
      for (let i = 0; i <= 8; i++) {
        const z = lerp(0.36, -0.36, i / 8);
        const base = sec.reduce((acc, s2) => (Math.abs(s2[0] - z) < Math.abs(acc[0] - z) ? s2 : acc));
        const th = 1.12;
        const x = -side * Math.sin(th) * (base[3] + 0.021), y = base[1] + Math.cos(th) * (base[2] + 0.021);
        edge.push(V(x, y, z));
      }
      const sides = edge.map(() => V(0, 1, 0).applyAxisAngle(V(0, 0, 1), -side * 0.4));
      ribbon(mb, edge, sides, edge.map(() => 0.07), trimM, (i, p) => (p.z > 0.1 ? [['chest', 1]] : [['spine', 1]]), { flip: side < 0 });
    }
    // saddle: seat with pommel and cantle
    const leather = mat(col('#4a3020'), { tile: 'leather', rough: 0.5, fuzz: 0.1, tileU: 3, tileV: 3 });
    const srings = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const z = lerp(0.24, -0.24, t);
      const base = sec.reduce((acc, s2) => (Math.abs(s2[0] - z) < Math.abs(acc[0] - z) ? s2 : acc));
      const lift = 0.05 * Math.pow(Math.abs(t * 2 - 1), 3) + 0.03;
      srings.push({ c: V(0, base[1] + lift, z), a: V(0, 1, 0), b: V(-1, 0, 0), ra: base[2] + 0.03, rb: base[3] + 0.03, n: 2.2, th0: -0.75, th1: 0.75 });
    }
    tube(mb, { rings: srings, seg: 10, mat: leather, open: true, weights: () => [['spine', 0.6], ['chest', 0.4]], inner: { inset: 0.02, hem: true } });
    // girth and stirrups
    const strap = mat(col('#2e2219'), { tile: 'leather', rough: 0.6, tileU: 1, tileV: 8 });
    const gz = 0.24;
    const gb = sec.reduce((acc, s2) => (Math.abs(s2[0] - gz) < Math.abs(acc[0] - gz) ? s2 : acc));
    const grings = [{ c: V(0, gb[1], gz - 0.03), a: V(0, 1, 0), b: V(-1, 0, 0), ra: gb[2] + 0.012, rb: gb[3] + 0.012 }, { c: V(0, gb[1], gz + 0.03), a: V(0, 1, 0), b: V(-1, 0, 0), ra: gb[2] + 0.012, rb: gb[3] + 0.012 }];
    tube(mb, { rings: grings, seg: 20, mat: strap, open: true, th0: 0.9, th1: TAU - 0.9, weights: () => [['chest', 1]] });
    const iron = mat(col('#6e6a62'), { tile: 'metal', rough: 0.4, special: SPECIAL.metal, tileU: 1, tileV: 1 });
    for (const sd of [1, -1]) {
      const top = V(sd * 0.27, 1.22, 0.0), bot = V(sd * 0.3, 0.78, 0.02);
      const pts = [top, top.clone().lerp(bot, 0.5), bot];
      ribbon(mb, pts, pts.map(() => V(0, 0, 1)), [0.035, 0.035, 0.035], strap, () => [['spine', 1]], { double: true });
      blob(mb, bot.clone().add(V(0, -0.04, 0)), { x: 0.02, y: 0.04, z: 0.065 }, iron, [['spine', 1]], 8, 4);
    }
    // saddlebags behind the cantle
    for (const sd of [1, -1]) blob(mb, V(sd * 0.31, 1.1, -0.36), { x: 0.06, y: 0.12, z: 0.13 }, leather, [['pelvis', 0.6], ['spine', 0.4]], 8, 6, null, (th) => 1 + 0.22 * Math.pow(Math.abs(Math.cos(th * 2)), 0.5));
    // bridle: noseband, headpiece, browband; reins to the withers
    const bandR = (c, ra, rb, bone) => tube(mb, { rings: [{ c: c.clone().add(V(0, 0.012, 0)), a: V(0, 0, 1), b: V(1, 0, 0), ra, rb }, { c: c.clone().add(V(0, -0.012, 0)), a: V(0, 0, 1), b: V(1, 0, 0), ra, rb }], seg: 12, mat: strap, open: true, th0: 0, th1: TAU, weights: () => [[bone, 1]] });
    bandR(V(0, 1.47, 1.3), 0.095, 0.092, 'head');
    const hp = [V(0.1, 1.42, 1.3), V(0.11, 1.62, 1.16), V(0.1, 1.86, 1.02), V(0, 1.93, 0.99), V(-0.1, 1.86, 1.02), V(-0.11, 1.62, 1.16), V(-0.1, 1.42, 1.3)];
    ribbon(mb, hp, hp.map(() => V(0, 0, 1).applyAxisAngle(V(1, 0, 0), 0.6)), hp.map(() => 0.025), strap, () => [['head', 1]], { double: true });
    for (const sd of [1, -1]) {
      const rp = [V(sd * 0.09, 1.42, 1.32), V(sd * 0.16, 1.3, 1.0), V(sd * 0.17, 1.28, 0.7), V(sd * 0.1, 1.44, 0.42)];
      ribbon(mb, rp, rp.map(() => V(0, 1, 0)), rp.map(() => 0.02), strap, (i) => (i < 1 ? [['head', 1]] : i < 2 ? [['head', 0.5], ['neck2', 0.5]] : i < 3 ? [['neck1', 1]] : [['chest', 1]]), { double: true });
    }
  }
  void seatZ; void seatY;
  return mb.build();
}

class Horse {
  constructor(id, opts) {
    this.id = id;
    this.isHorse = true;
    const look = { seed: 11, ...opts };
    this.rig = buildRig();
    const geo = buildHorseMesh(this.rig, look);
    this.material = createCharacterMaterial({ faceTex: null });
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.name = 'horse_' + id;
    this.mesh.add(this.rig.bones[0]);
    this.mesh.bind(this.rig.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = new THREE.Sphere(V(0, 1.0, 0.2), 1.6);
    this.root = new THREE.Group();
    this.root.name = 'horse';
    this.root.add(this.mesh);
    this.root.userData.horse = this;
    this.bones = this.rig.byName;
    this.height = 1.42;
    this.M = { H: 1.6 };
    // saddle seat anchor on the back (rides with the spine motion)
    this.saddle = new THREE.Object3D();
    this.saddle.name = 'saddle';
    this.saddle.position.set(0, 1.4 - J.spine.y + 0.0, -0.04 - J.spine.z);
    this.bones.spine.add(this.saddle);
    this.speed = 0;
    this.targetSpeed = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.visible = true;
    this._acc = 0;
    this.one = null;
    this.tailSwish = { t: 2, v: 0 };
    this.earT = { t: 1, l: 0, r: 0 };
    this.headDown = 0;
    this.headDownT = 4;
    this.bind = {};
    for (const b of this.rig.bones) this.bind[b.name] = b.position.clone();
    this.gait = 'idle';
    this.update(0, { lod: 0 });
  }
  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
  setPosition(x, z, y) {
    const gy = y ?? (G.characters?.heightAt ? G.characters.heightAt(x, z) : G.world ? G.world.heightAt(x, z) : 0);
    this.root.position.set(x, gy, z);
    return this;
  }
  setGait(speed) { this.targetSpeed = Math.max(0, speed); return this; }
  play(name, o = {}) {
    if (name === 'idle') { this.setGait(0); return Promise.resolve(); }
    if (name === 'walk') { this.setGait(1.7); return Promise.resolve(); }
    if (name === 'trot') { this.setGait(3.6); return Promise.resolve(); }
    if (name === 'gallop') { this.setGait(9); return Promise.resolve(); }
    const dur = name === 'rear' ? 2.6 : name === 'snort' ? 1.4 : 0;
    if (!dur) return Promise.resolve();
    return new Promise((resolve) => { this.one = { name, t: 0, dur, resolve, speed: o.speed ?? 1 }; });
  }
  attach(bone, obj) { (this.bones[bone] || this.saddle).add(obj); return obj; }
  setVisible(v) { this.visible = v; this.root.visible = v; }
  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.skeleton.dispose();
    this.disposed = true;
    if (G.characters && G.characters._unregister) G.characters._unregister(this);
  }

  // Gait weights by speed.
  _weights(v) {
    if (v < 0.05) return { idle: 1 };
    if (v < 1.7) { const t = smoothstep(0.05, 1.2, v); return { idle: 1 - t, walk: t }; }
    if (v < 3.0) { const t = smoothstep(2.2, 3.0, v); return { walk: 1 - t, trot: t }; }
    if (v < 6.5) { const t = smoothstep(4.8, 6.5, v); return { trot: 1 - t, gallop: t }; }
    return { gallop: 1 };
  }

  update(dt, ctx) {
    this.time += dt;
    const acc = this.targetSpeed > this.speed ? 3.5 : 5;
    this.speed += Math.sign(this.targetSpeed - this.speed) * Math.min(Math.abs(this.targetSpeed - this.speed), acc * dt);
    if (G.characters?.heightAt || G.world) {
      const p = this.root.position;
      p.y = G.characters?.heightAt ? G.characters.heightAt(p.x, p.z) : G.world.heightAt(p.x, p.z);
    }
    const w = this._weights(this.speed);
    let freq = 0, wsum = 0;
    for (const k in w) if (k !== 'idle') { freq += (GAIT[k].f * this.speed / GAIT[k].v) * w[k]; wsum += w[k]; }
    if (wsum > 0) freq /= wsum;
    if (wsum > 0) this.phase = (this.phase + freq * dt) % 1;
    this.gait = Object.keys(w).reduce((a, b) => (w[a] > w[b] ? a : b));
    // accumulate joint angles (degrees) per bone and body offsets
    const P = {};
    const add = (b, x, y = 0, z = 0, k = 1) => { const o = P[b] || (P[b] = [0, 0, 0]); o[0] += x * k; o[1] += y * k; o[2] += z * k; };
    let lift = 0, pitch = 0;
    for (const k in w) {
      const g = k === 'idle' ? null : GAIT[k];
      const ww = w[k];
      if (!g) { idlePose(add, this, ww); continue; }
      const r = gaitPose(add, g, this.phase, ww);
      lift += r.lift * ww; pitch += r.pitch * ww;
    }
    // one-shots
    if (this.one) {
      const o = this.one;
      o.t += dt * o.speed;
      const u = Math.min(1, o.t / o.dur);
      const env = Math.min(1, u / 0.12, (1 - u) / 0.2);
      if (o.name === 'rear') {
        const up = smoothstep(0.1, 0.4, u) * (1 - smoothstep(0.7, 0.95, u));
        pitch += -48 * up;
        lift += 0.08 * up;
        for (const S of ['L', 'R']) {
          const paw = Math.sin(this.time * 9 + (S === 'L' ? 0 : 1.5)) * up;
          add('armF' + S, -40 * up - 20 * paw); add('foreF' + S, 60 * up + 30 * paw); add('cannonF' + S, -90 * up - 20 * paw, 0, 0);
          add('thighH' + S, -40 * up); add('gaskinH' + S, 30 * up); add('cannonH' + S, -36 * up);
        }
        add('neck1', -10 * up); add('neck2', -20 * up); add('head', 25 * up); add('tail0', -30 * up);
        add('earL', -20 * up); add('earR', -20 * up);
      } else if (o.name === 'snort') {
        const toss = Math.sin(u * Math.PI * 3) * env;
        add('neck1', -6 * toss); add('neck2', -10 * toss); add('head', 14 * toss, 12 * Math.sin(u * 20) * env, 0);
        add('jaw', 6 * env);
        add('earL', 0, 0, 20 * env); add('earR', 0, 0, -20 * env);
      }
      if (o.t >= o.dur) { this.one = null; o.resolve(true); }
    }
    // tail and ears life
    const ts = this.tailSwish;
    ts.t -= dt;
    if (ts.t <= 0) { ts.t = 2 + Math.random() * 5; ts.v = 1; }
    ts.v = Math.max(0, ts.v - dt * 0.9);
    const sw = Math.sin(this.time * 7) * ts.v * 30;
    add('tail0', 12 + this.speed * 4, sw * 0.4, 0); add('tail1', -8 - this.speed * 3, sw * 0.6, 0); add('tail2', -6 - this.speed * 2, sw, 0);
    const et = this.earT;
    et.t -= dt;
    if (et.t <= 0) { et.t = 1 + Math.random() * 3; et.l = (Math.random() - 0.5) * 50; et.r = (Math.random() - 0.5) * 50; }
    add('earL', 0, et.l, 10); add('earR', 0, et.r, -10);
    // write
    const by = this.bones;
    for (const b of this.rig.bones) {
      const a = P[b.name];
      if (a) b.rotation.set(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'YXZ');
      else b.rotation.set(0, 0, 0);
    }
    // body pitch around the hind feet when rearing; lift for bounce
    const pv = by.pelvis;
    pv.position.copy(this.bind.pelvis);
    pv.position.y += lift;
    if (Math.abs(pitch) > 0.01) {
      // rotate the pelvis about the hind hooves line so the body rises in front
      const pr = pitch * D2R;
      const pivot = V(0, 0.07, -0.6);
      const off = this.bind.pelvis.clone().sub(pivot);
      off.applyAxisAngle(V(1, 0, 0), pr);
      pv.position.copy(pivot).add(off);
      pv.position.y += lift;
      pv.rotation.x += pr;
      for (const S of ['L', 'R']) by['thighH' + S].rotation.x -= pr;
    }
    if (ctx.lod <= 1) {
      this.root.updateMatrixWorld(true);
      void ctx;
    }
  }
}

// Gait parameters: f = stride frequency at reference speed v, duty = stance fraction,
// offs = phase per leg [LH, LF, RH, RF], sweep = stance half angle (deg), lift amounts.
const GAIT = {
  walk: { v: 1.7, f: 0.87, duty: 0.64, offs: [0, 0.25, 0.5, 0.75], sweep: 16, knee: 70, hock: 45, bob: 0.015, nod: 5, pitch: 0, fLead: 0 },
  trot: { v: 3.6, f: 1.45, duty: 0.42, offs: [0, 0.5, 0.5, 0], sweep: 20, knee: 95, hock: 60, bob: 0.035, nod: 2, pitch: 0, fLead: 0 },
  gallop: { v: 9, f: 2.2, duty: 0.3, offs: [0, 0.32, 0.12, 0.44], sweep: 30, knee: 110, hock: 75, bob: 0.06, nod: 12, pitch: 6, fLead: 0 },
};

function legCurve(p, duty, sweep, knee, front) {
  // returns { hip (deg, + = leg back), mid, low, foot } for the local phase p
  if (p < duty) {
    const s = p / duty;
    const a = lerp(-sweep, sweep, s); // forward (-) to back (+)
    const load = Math.sin(s * Math.PI);
    return front
      ? { hip: a, mid: 0, low: 0, fet: -14 * load }
      : { hip: a, mid: 8 + 6 * load, low: -10 - 8 * load, fet: -12 * load };
  }
  const u = (p - duty) / (1 - duty);
  const a = lerp(sweep, -sweep * 1.08, u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const fold = Math.sin(Math.min(1, u * 1.25) * Math.PI);
  return front
    ? { hip: a, mid: -28 * fold, low: knee * fold, fet: 40 * fold - 6 }
    : { hip: a, mid: 30 * fold, low: -knee * 0.75 * fold, fet: 45 * fold };
}

function gaitPose(add, g, phase, w) {
  const legs = [['H', 'L', 0], ['F', 'L', 1], ['H', 'R', 2], ['F', 'R', 3]];
  for (const [FH, S, i] of legs) {
    const p = (phase + g.offs[i]) % 1;
    const c = legCurve(p, g.duty, g.sweep, FH === 'F' ? g.knee : g.hock, FH === 'F');
    if (FH === 'F') {
      add('scap' + S, c.hip * 0.35, 0, 0, w);
      add('armF' + S, c.hip * 0.65 + c.mid, 0, 0, w);
      add('foreF' + S, -c.mid * 0.6, 0, 0, w);
      add('cannonF' + S, c.low, 0, 0, w);
      add('pasternF' + S, -c.fet, 0, 0, w);
      add('hoofF' + S, c.fet * 0.4, 0, 0, w);
    } else {
      add('thighH' + S, c.hip - c.mid * 0.4, 0, 0, w);
      add('gaskinH' + S, c.mid, 0, 0, w);
      add('cannonH' + S, c.low, 0, 0, w);
      add('pasternH' + S, -c.fet, 0, 0, w);
      add('hoofH' + S, c.fet * 0.4, 0, 0, w);
    }
  }
  const t = phase * TAU;
  // head and neck: nod with the front footfalls (2 per stride in walk), big swing in gallop
  const nod = g === GAIT.gallop ? Math.sin(t - 0.6) : Math.sin(2 * t + 0.8);
  add('neck1', g.nod * 0.5 * nod, 0, 0, w);
  add('neck2', g.nod * 0.3 * nod, 0, 0, w);
  add('head', -g.nod * 0.4 * nod - (g === GAIT.gallop ? 12 : 0), 0, 0, w);
  add('spine', g === GAIT.gallop ? 4 * Math.sin(t + 1) : 0, 0, 0, w);
  const lift = g === GAIT.gallop ? g.bob * Math.sin(t - 0.3) : g.bob * Math.abs(Math.sin(2 * t));
  const pitch = g.pitch * Math.sin(t + 0.4);
  return { lift: lift - (g === GAIT.gallop ? 0.03 : 0), pitch };
}

function idlePose(add, h, w) {
  const t = h.time;
  // weight resting on one hind leg (cocked hoof), slow head movements, occasional grazing dip
  h.headDownT -= 1 / 60;
  const shift = Math.sin(t * 0.3);
  add('thighHR', -2, 0, 0, w); add('gaskinHR', 8, 0, 0, w); add('cannonHR', -14, 0, 0, w); add('pasternHR', 20, 0, 0, w); add('hoofHR', 10, 0, 0, w);
  add('neck1', 6 + 4 * Math.sin(t * 0.21), 2 * shift, 0, w);
  add('neck2', 4 + 3 * Math.sin(t * 0.17 + 1), 4 * Math.sin(t * 0.13), 0, w);
  add('head', 6 + 3 * Math.sin(t * 0.23), 6 * Math.sin(t * 0.11), 2 * Math.sin(t * 0.19), w);
  add('spine', 0.8 * Math.sin(t * 1.3), 0, 0, w);
  add('jaw', 2 + 2 * Math.max(0, Math.sin(t * 2.3)), 0, 0, w);
}

export function createHorse(id = 'kasza', opts = {}) {
  const look = id === 'kasza' ? { coat: '#b0915f', points: '#3a2e24', mane: '#2a221c', seed: 11 } : {};
  return new Horse(id, { ...look, ...opts });
}
