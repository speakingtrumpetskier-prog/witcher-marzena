// Procedural head: SDF sculpt -> warped spherical grid, eyes with shell lids, mouth with a real
// opening (slit split between head and jaw), teeth and cavity, ears, neck, and the painted face
// texture (skin tones, cold flush, brows, lips, stubble, wrinkles, scar, scalp hair, irises).
//
// buildHead(mb, rig, FP, look) adds everything to the MeshBuilder and returns { canvas, info }.
// Face bones (rig.js): jaw, mouthL/R, cheekL/R, browIL/IR/OL/OR, lidUL/UR/LL/LR, eyeL/R.
// The sculpt is authored for a 23.5 cm reference head in head-local meters (pivot at the top of
// the neck, +Z forward, +X = character's left) and scaled by M.headK.
import * as THREE from 'three';
import { clamp, lerp, sat, smoothstep, rng, col } from './util.js';
import { M as mat, tube, blob, SPECIAL } from './geom.js';
import { headLandmarks } from './rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- SDF primitives
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz));
  const k1 = Math.sqrt((x * x) / (rx * rx * rx * rx) + (y * y) / (ry * ry * ry * ry) + (z * z) / (rz * rz * rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdCone(px, py, pz, a, b, r1, r2) {
  // round cone (capsule with two radii), from Inigo Quilez
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const h = clamp((pax * bax + pay * bay + paz * baz) / l2, 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - lerp(r1, r2, h);
}
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------- face parameters
export function faceParams(spec, Mb) {
  const f = spec.face || {};
  const fem = Mb.fem, child = Mb.child, age = Mb.age;
  const d = (k, v) => (f[k] !== undefined ? f[k] : v);
  return {
    fem, child, age,
    jawW: d('jawW', lerp(1.04, 0.92, fem) * (child ? 0.9 : 1)),
    jawSq: d('jawSq', lerp(0.7, 0.35, fem)),
    chin: d('chin', lerp(0.6, 0.4, fem)),
    chinW: d('chinW', lerp(1.0, 0.85, fem)),
    cheek: d('cheek', lerp(0.5, 0.65, fem)),
    gaunt: d('gaunt', 0.2),
    brow: d('brow', child ? 0.1 : lerp(0.7, 0.25, fem)),
    noseLen: d('noseLen', child ? 0.82 : lerp(1.04, 0.95, fem)),
    noseW: d('noseW', child ? 0.9 : lerp(1.05, 0.92, fem)),
    noseBridge: d('noseBridge', 0),
    noseTip: d('noseTip', child ? 0.5 : 0),
    noseSize: d('noseSize', child ? 0.8 : lerp(1.03, 0.92, fem)),
    lipFull: d('lipFull', lerp(0.9, 1.12, fem) * (age > 55 ? 0.8 : 1)),
    lipW: d('lipW', lerp(1.0, 0.96, fem)),
    eyeSize: d('eyeSize', child ? 1.08 : 1),
    eyeSpace: d('eyeSpace', 1),
    eyeTilt: d('eyeTilt', lerp(2, 4, fem)),
    lidHeavy: d('lidHeavy', age > 55 ? 0.5 : 0.15),
    faceLen: d('faceLen', child ? 0.9 : 1),
    craniumW: d('craniumW', 1),
    earSize: d('earSize', 1),
    // painting
    skin: f.skin || spec.skin || '#d8ae94',
    blush: d('blush', 0.5),
    noseRed: d('noseRed', 0.45),
    stubble: d('stubble', fem || child ? 0 : 0.35),
    stubbleColor: f.stubbleColor || spec.hair?.color || '#4a3a2c',
    browColor: f.browColor || spec.hair?.browColor || spec.hair?.color || '#4a3a2c',
    browThick: d('browThick', lerp(1.1, 0.8, fem)),
    browArch: d('browArch', lerp(0.3, 0.6, fem)),
    lipColor: f.lipColor || (fem ? '#a86a64' : '#9c6a60'),
    iris: f.iris || '#5d6f7a',
    iris2: f.iris2 || null,
    slit: !!f.slit,
    scar: f.scar || null,
    freckles: d('freckles', 0),
    wrinkles: d('wrinkles', clamp((age - 30) / 35, 0, 1)),
    underEye: d('underEye', 0.5),
    missingTooth: !!f.missingTooth,
    pale: d('pale', 0),
    ghost: !!f.ghost,
  };
}

// ---------------------------------------------------------------- the sculpt
function makeSculpt(FP) {
  const jw = FP.jawW, cw = FP.craniumW;
  const fl = FP.faceLen;
  const es = FP.eyeSpace;
  const re = 0.0116 * FP.eyeSize;
  const eyeL = V(0.0315 * es, 0.0715, 0.073);
  const eyeR = V(-0.0315 * es, 0.0715, 0.073);
  const nl = FP.noseLen, nw = FP.noseW, ns = FP.noseSize;
  const tipY = 0.041 - (nl - 1) * 0.03;
  const tipZ = 0.112 + (ns - 1) * 0.01;
  const noseA = V(0, 0.083, 0.088), noseB = V(0, tipY + 0.005 + FP.noseTip * 0.0015, tipZ - 0.004);
  const stomY = 0.0105 - (fl - 1) * 0.02;
  const chinY = -0.0185 - (fl - 1) * 0.03;
  const lf = FP.lipFull, lw = FP.lipW;
  const gonL = V(0.045 * jw, 0.008 + (1 - FP.jawSq) * 0.004, -0.002);
  const chinPL = V(0.011 * FP.chinW, chinY - 0.002, 0.079 + FP.chin * 0.004);
  const browH = 0.0075 + FP.brow * 0.004;
  const cheekS = 0.75 + FP.cheek * 0.5;
  const full = FP.fullCheek ?? (FP.child ? 1 : FP.fem ? 0.5 : 0.25);
  const rl = re + 0.0015;

  const sdf = (x, y, z) => {
    const ax = Math.abs(x);
    let d = sdEll(x, y, z, 0, 0.088, -0.01, 0.071 * cw, 0.096, 0.1);
    d = smin(d, sdEll(x, y, z, 0, 0.07, -0.032, 0.064 * cw, 0.078, 0.07), 0.02);
    d = smin(d, sdEll(x, y, z, 0, 0.118, 0.045, 0.054, 0.05, 0.048), 0.02);
    d = smax(d, -sdEll(ax, y, z, 0.081 * cw, 0.096, 0.052, 0.012, 0.028, 0.026), 0.01);
    // midface, zygomatic arches, jaw body, jawline, ramus, chin
    d = smin(d, sdEll(x, y, z, 0, 0.045, 0.034, 0.061, 0.056 * fl, 0.06), 0.03);
    d = smin(d, sdCone(ax, y, z, V(0.045, 0.054, 0.06), V(0.061, 0.052, 0.006), 0.0065, 0.006), 0.026);
    d = smin(d, sdEll(x, y, z, 0, 0.014, 0.04, 0.046 * jw, 0.031 * fl, 0.05), 0.026);
    d = smin(d, sdCone(ax, y, z, gonL, chinPL, 0.011 + FP.jawSq * 0.002, 0.012), 0.018);
    d = smin(d, sdCone(ax, y, z, V(0.047 * jw, 0.036, -0.008), gonL, 0.01, 0.011), 0.018);
    d = smin(d, sdEll(x, y, z, 0, chinY, 0.085 + FP.chin * 0.004, 0.015 * FP.chinW, 0.013, 0.011), 0.01);
    // cheekbones and cheek fat
    d = smin(d, sdEll(ax, y, z, 0.043, 0.053, 0.07, 0.016 * cheekS, 0.0095 * cheekS, 0.014), 0.012);
    if (full > 0) d = smin(d, sdEll(ax, y, z, 0.036, 0.044, 0.079, 0.02, 0.017, 0.012 + full * 0.002), 0.012 + full * 0.006);
    if (FP.gaunt > 0.3) d = smax(d, -sdEll(ax, y, z, 0.047, 0.022, 0.088, 0.014, 0.016, 0.01), 0.012 / FP.gaunt);
    // brow ridge
    const bz = 0.087 + FP.brow * 0.004;
    d = smin(d, sdCone(ax, y, z, V(0.011, 0.0935, bz), V(0.046, 0.0955, bz - 0.013), browH, browH * 0.78), 0.014);
    // orbital hollow, then the lid bulge over the eyeball
    d = smax(d, -sdEll(ax, y, z, eyeL.x, eyeL.y + 0.0015, eyeL.z + 0.004, 0.0205, 0.0165, 0.0125), 0.007);
    d = smin(d, Math.hypot(ax - eyeL.x, y - eyeL.y, z - eyeL.z) - rl, 0.004);
    // nose
    let nose = sdCone(x, y, z, noseA, noseB, 0.0048 * nw, 0.0072 * nw * ns);
    if (FP.noseBridge > 0) nose = smin(nose, sdEll(x, y, z, 0, 0.062, 0.1, 0.0055, 0.008, 0.005 + FP.noseBridge * 0.0025), 0.005);
    nose = smin(nose, sdEll(x, y, z, 0, tipY + FP.noseTip * 0.0015, tipZ, 0.0092 * nw * ns, 0.0088 * ns, 0.0095 * ns), 0.006);
    nose = smin(nose, sdEll(ax, y, z, 0.0098 * nw * ns, tipY - 0.0035, tipZ - 0.011, 0.0068 * ns, 0.0062 * ns, 0.0075 * ns), 0.004);
    d = smin(d, nose, 0.006);
    d = smax(d, -sdEll(ax, y, z, 0.0058 * nw, tipY - 0.0078, tipZ - 0.0105, 0.003, 0.0015, 0.0035), 0.0015);
    // lips
    const ul = sdEll(x, y, z, 0, stomY + 0.005 * lf, 0.0962, 0.0212 * lw, 0.0056 * lf, 0.0077 * lf);
    const ll = sdEll(x, y, z, 0, stomY - 0.0055 * lf, 0.0932, 0.0188 * lw, 0.0066 * lf, 0.008 * lf);
    d = smin(d, smin(ul, ll, 0.0014), 0.006);
    d = smax(d, -sdCone(x, y, z, V(0, tipY - 0.011, 0.104), V(0, stomY + 0.0105, 0.1035), 0.0016, 0.0022), 0.003);
    d = smax(d, -sdEll(x, y, z, 0, stomY, 0.1035, 0.0215 * lw, 0.0005, 0.0035), 0.0015);
    d = smax(d, -sdEll(ax, y, z, 0.0225 * lw, stomY, 0.092, 0.0028, 0.0024, 0.006), 0.003);
    d = smax(d, -sdEll(x, y, z, 0, stomY - 0.0145, 0.0975, 0.013, 0.0028, 0.006), 0.005);
    if (FP.wrinkles > 0.2) d = smax(d, -sdCone(ax, y, z, V(0.016 * nw, tipY - 0.005, 0.099), V(0.027, stomY - 0.006, 0.088), 0.0015, 0.0013), 0.004);
    return d;
  };
  return { sdf, re, rl, eyeL, eyeR, stomY, chinY, tipY, tipZ };
}

// Eyelid opening shape shared by the skin carve and the shell lids. u in -1..1 across the
// eye (medial side is u * s < 0); returns elevation angles (radians) of the margins.
export function lidShape(FP, s) {
  const tilt = FP.eyeTilt * Math.PI / 180;
  const cornerIn = -0.02, cornerOut = 0.02 + tilt;
  const heavy = FP.lidHeavy;
  const corner = (u) => lerp(cornerIn, cornerOut, (u * s + 1) / 2);
  return {
    phM: 1.32,
    yaw: s * 0.12,
    upper: (u) => {
      const shape = Math.pow(Math.cos(u * Math.PI / 2), 0.62);
      return corner(u) + shape * (0.36 - heavy * 0.12) + 0.05 * Math.sin(u * s * 1.4) * shape;
    },
    lower: (u) => {
      const shape = Math.pow(Math.cos(u * Math.PI / 2), 0.8);
      return corner(u) - shape * 0.38 - 0.04 * Math.sin(u * s * 1.2) * shape;
    },
  };
}

// Numeric warp: concentrate samples where density is high. Returns fwd(t)->x and inv(x)->t.
function makeWarp(density, x0, x1, n = 2048) {
  const cdf = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const xa = x0 + ((x1 - x0) * (i - 1)) / n, xb = x0 + ((x1 - x0) * i) / n;
    cdf[i] = cdf[i - 1] + (density(xa) + density(xb)) * 0.5 * ((x1 - x0) / n);
  }
  const tot = cdf[n];
  for (let i = 0; i <= n; i++) cdf[i] /= tot;
  return {
    fwd(t) {
      let lo = 0, hi = n;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m; else hi = m; }
      const f = (t - cdf[lo]) / Math.max(1e-12, cdf[hi] - cdf[lo]);
      return x0 + ((x1 - x0) * (lo + f)) / n;
    },
    inv(x) {
      const fi = clamp(((x - x0) / (x1 - x0)) * n, 0, n);
      const i = Math.min(n - 1, Math.floor(fi));
      return lerp(cdf[i], cdf[i + 1], fi - i);
    },
  };
}

// ---------------------------------------------------------------- build
export function buildHead(mb, rig, FP, look) {
  const Mb = rig.M;
  const hk = Mb.headK;
  const S = makeSculpt(FP);
  const pivot = rig.world.head;
  const O = V(0, 0.045, 0.012);
  const hi = look.headRes || 'high';
  const nAz = hi === 'high' ? 52 : hi === 'mid' ? 40 : 30;
  const nPol = hi === 'high' ? 50 : hi === 'mid' ? 38 : 28;
  const dirOf = (az, pol) => V(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
  const polOf = (p) => {
    const d = p.clone().sub(O);
    return { az: Math.atan2(d.x, d.z), pol: Math.acos(clamp(d.y / d.length(), -1, 1)) };
  };
  const stom = polOf(V(0, S.stomY, 0.104));
  const eyeP = polOf(S.eyeL);
  const azW = makeWarp((a) => 1 + 2.3 * Math.exp(-((a / 0.78) ** 2)) + 1.3 * Math.exp(-((a / 0.3) ** 2)), -Math.PI, Math.PI);
  const polW = makeWarp((b) => 0.9 + 1.8 * Math.exp(-(((b - 1.55) / 0.62) ** 2)) + 3.2 * Math.exp(-(((b - stom.pol) / 0.12) ** 2)) +
    0.9 * Math.exp(-(((b - eyeP.pol) / 0.12) ** 2)), 0, 2.78);
  // Snap one row onto the stomion so the mouth slit is a clean row.
  let polTs = [];
  for (let i = 0; i <= nPol; i++) polTs.push(i / nPol);
  const tStom = polW.inv(stom.pol);
  let kStom = Math.round(tStom * nPol);
  const polAt = (i) => (i === kStom ? stom.pol : polW.fwd(polTs[i]));
  // Mouth half-width in azimuth.
  const azCorner = Math.atan2(0.0225 * FP.lipW, 0.08);

  const sdf = (p) => S.sdf(p.x, p.y, p.z);
  const grad = (p, out) => {
    const e = 0.0004;
    return out.set(
      S.sdf(p.x + e, p.y, p.z) - S.sdf(p.x - e, p.y, p.z),
      S.sdf(p.x, p.y + e, p.z) - S.sdf(p.x, p.y - e, p.z),
      S.sdf(p.x, p.y, p.z + e) - S.sdf(p.x, p.y, p.z - e),
    ).normalize();
  };
  const cast = (dir) => {
    // sphere trace from outside inward
    let t = 0.26;
    const p = new THREE.Vector3();
    for (let i = 0; i < 64; i++) {
      p.copy(O).addScaledVector(dir, t);
      const d = sdf(p);
      if (d < 0.00015) break;
      t -= Math.max(d * 0.75, 0.0002);
      if (t < 0.005) break;
    }
    // refine: bracket the crossing then bisect
    let a = t - 0.003, b = t + 0.003;
    for (let i = 0; i < 10; i++) {
      const m = (a + b) * 0.5;
      p.copy(O).addScaledVector(dir, m);
      if (sdf(p) > 0) b = m; else a = m;
    }
    return O.clone().addScaledVector(dir, (a + b) * 0.5);
  };

  // Hair on the scalp (part of the head grid): mask and thickness.
  const hairSpec = look.hair || {};
  const scalp = (p) => hairMask(p, hairSpec);

  const L = headLandmarks({ headK: 1 });
  const faceBones = [
    ['browIL', L.browIL, 0.011, 0.9], ['browIR', L.browIR, 0.011, 0.9],
    ['browOL', L.browOL, 0.013, 0.9], ['browOR', L.browOR, 0.013, 0.9],
    ['cheekL', L.cheekL, 0.014, 0.75], ['cheekR', L.cheekR, 0.014, 0.75],
    ['mouthL', V(0.0225 * FP.lipW, S.stomY, 0.092), 0.0085, 0.95], ['mouthR', V(-0.0225 * FP.lipW, S.stomY, 0.092), 0.0085, 0.95],
  ];
  const jawW = (p, row, copy) => {
    // copy: 0 normal vertex, 1 upper copy on the mouth slit, 2 lower copy
    const az = Math.atan2(p.x, p.z - O.z);
    const inMouth = smoothstep(azCorner * 1.05, azCorner * 0.55, Math.abs(az));
    if (copy === 1) return 0.35 * (1 - inMouth);
    if (copy === 2) return 0.35 + 0.65 * inMouth;
    if (row > kStom) {
      const dy = S.stomY - p.y;
      const base = Math.max(smoothstep(-0.001, 0.012, dy), inMouth);
      return base * smoothstep(-0.035, 0.02, p.z);
    }
    return 0.22 * smoothstep(azCorner * 0.7, azCorner * 1.1, Math.abs(az)) * smoothstep(0.012, 0.0, p.y - S.stomY) * smoothstep(0.07, 0.085, p.z);
  };
  const weightsAt = (p, row, copy) => {
    const j = jawW(p, row, copy);
    const out = [];
    let sum = 0;
    for (const [name, c, sig, amp] of faceBones) {
      const dd = p.distanceToSquared(c);
      let w = amp * Math.exp(-dd / (2 * sig * sig));
      if (name.startsWith('mouth') && copy === 0 && Math.abs(p.y - S.stomY) > 0.012) w *= 0.5;
      if (w > 0.02) { out.push([name, w]); sum += w; }
    }
    const k = sum > 0.92 ? 0.92 / sum : 1;
    for (const o of out) o[1] *= k;
    const rest = 1 - sum * k;
    out.push(['jaw', rest * j], ['head', rest * (1 - j)]);
    return out;
  };

  // Skin over the eyeball sinks behind the globe inside the lid opening (shell lids show there).
  const shapes = { 1: lidShape(FP, 1), '-1': lidShape(FP, -1) };
  const carveEyes = (p) => {
    for (const [E, s] of [[S.eyeL, 1], [S.eyeR, -1]]) {
      const q = p.clone().sub(E);
      const dist = q.length();
      if (dist > S.re + 0.009) continue;
      const LS = shapes[s];
      const a = Math.atan2(q.x, q.z) - LS.yaw;
      const ps = Math.asin(clamp(q.y / dist, -1, 1));
      const u = a / LS.phM;
      const uc = clamp(u, -1, 1);
      const out = Math.max(ps - LS.upper(uc), LS.lower(uc) - ps, (Math.abs(u) - 1) * 0.6);
      const c = smoothstep(0.17, 0.07, out) * smoothstep(-0.25, 0.1, q.z / dist);
      if (c > 0) p.copy(E).addScaledVector(q.normalize(), lerp(dist, S.re - 0.0025, c));
    }
  };
  // --- grid
  const skinMat = mat(0xffffff, { face: true, skin: 1, rough: 0.62, fuzz: 0.12 });
  const hairMatD = mat(0xffffff, { face: true, skin: 0, rough: 0.55, fuzz: 0.5 });
  const grid = [];
  const gridLo = [];
  const info = { uvOf: null, S, O, azW, polW, kStom, nAz, nPol, hairPts: [] };
  const n = new THREE.Vector3();
  const scale = hk;
  const vUV = 0.8;
  mb.begin();
  for (let i = 0; i <= nPol; i++) {
    const pol = polAt(i);
    const row = [], rowLo = [];
    for (let j = 0; j <= nAz; j++) {
      const az = azW.fwd(j / nAz);
      const dir = dirOf(az, pol);
      let p = cast(dir);
      grad(p, n);
      // SDF ambient occlusion
      let occ = 0;
      for (const [h, w] of [[0.003, 0.5], [0.007, 0.3], [0.013, 0.2]]) occ += w * Math.max(0, h - sdf(p.clone().addScaledVector(n, h))) / h;
      let ao = clamp(1 - occ * 1.25, 0.35, 1);
      carveEyes(p);
      const hm = scalp(p);
      const isHair = hm.mask > 0.02;
      if (isHair) p.addScaledVector(n, hm.thick * hm.mask);
      const slit = i === kStom && Math.abs(az) < azCorner * 1.12;
      if (slit) {
        const inner = smoothstep(azCorner * 1.12, azCorner * 0.4, Math.abs(az));
        p.z -= 0.001 * inner;
      }
      const u = j / nAz, v = (i === kStom ? tStom : polTs[i]) * vUV;
      const wp = p.clone().multiplyScalar(scale).add(pivot);
      const shade = new THREE.Color(ao, ao, ao);
      const m = isHair && hm.mask > 0.5 ? hairMatD : skinMat;
      const idx = mb.vert(wp, shade, u, v, m, weightsAt(p, i, slit ? 1 : 0));
      row.push(idx);
      if (slit) rowLo.push(mb.vert(wp.clone().add(V(0, -0.0002, 0)), shade, u, v, skinMat, weightsAt(p, i, 2)));
      else rowLo.push(idx);
      if (isHair) info.hairPts.push(p);
    }
    grid.push(row);
    gridLo.push(rowLo);
  }
  for (let i = 0; i < nPol; i++) {
    for (let j = 0; j < nAz; j++) {
      const top = grid[i], bot = i + 1 === kStom ? grid[i + 1] : grid[i + 1];
      const topRow = i === kStom ? gridLo[i] : top;
      const a = topRow[j], b = topRow[j + 1], c = bot[j + 1], d = bot[j];
      // outward winding: rows go top->down, az increases toward +X
      mb.quad(a, d, c, b);
    }
  }
  info.uvOf = (p) => {
    const { az, pol } = polOf(p);
    return [azW.inv(az), polW.inv(pol) * vUV];
  };
  info.scale = scale;
  info.pivot = pivot;
  info.cast = cast;
  info.grad = grad;
  info.sdf = sdf;
  info.skinWeights = (pl) => weightsAt(pl, pl.y < S.stomY ? kStom + 1 : kStom - 1, 0);

  buildEyes(mb, rig, FP, S, scale, pivot, info.uvOf);
  buildMouthInside(mb, FP, S, scale, pivot);
  buildEars(mb, FP, S, scale, pivot, look);
  return info;
}

// Scalp hair mask on the head grid. Styles control the hairline.
export function hairMask(p, h) {
  if (!h || h.style === 'bald' || h.style === 'none') return { mask: 0, thick: 0 };
  const az = Math.atan2(p.x, p.z);
  const aa = Math.abs(az);
  // hairline height by azimuth: forehead, temples, sideburn in front of the ear, nape
  const peak = h.peak ?? 0.004;
  let line = 0.142 + (h.line || 0) - peak * Math.exp(-((az / 0.18) ** 2)) + 0.004 * smoothstep(0.3, 0.8, aa);
  line = lerp(line, 0.088, smoothstep(0.92, 1.14, aa));
  line = lerp(line, 0.058 + (h.sideburn || 0), smoothstep(1.16, 1.28, aa) * (1 - smoothstep(1.36, 1.46, aa)));
  line = lerp(line, 0.088, smoothstep(1.38, 1.55, aa) * (1 - smoothstep(1.8, 2.1, aa)));
  line = lerp(line, -0.012 + (h.nape || 0), smoothstep(1.85, 2.6, aa));
  if (h.style === 'fringe') {
    // Zbyszek: bald crown, fringe around the back and sides
    const crown = smoothstep(0.13, 0.11, p.y) * smoothstep(0.6, 1.5, aa);
    const m = crown * smoothstep(line - 0.004, line + 0.01, p.y);
    return { mask: m, thick: 0.004 };
  }
  if (h.style === 'cropped') {
    return { mask: smoothstep(line - 0.002, line + 0.006, p.y), thick: 0.0025 };
  }
  const m = smoothstep(line - 0.003, line + 0.009, p.y);
  // volume grows toward the crown and back
  const thick = (h.thick ?? 0.009) * (0.55 + 0.45 * smoothstep(0.06, 0.16, p.y)) * (1 + 0.25 * smoothstep(1.5, 2.8, aa));
  return { mask: m, thick };
}

function buildEyes(mb, rig, FP, S, sc, pivot, uvOf) {
  const re = S.re;
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const E = (s > 0 ? S.eyeL : S.eyeR);
    const eyeBone = 'eye' + side;
    // Eyeball: sphere with a corneal bulge; UV maps the front onto the iris strip.
    const sclera = col(FP.ghost ? '#cfe9ee' : '#e8e0d6');
    const eyeMat = mat(sclera, { face: true, skin: 0, rough: 0.12, fuzz: 0, special: SPECIAL.eye });
    const segA = 16, segB = 12;
    const rows = [];
    for (let i = 0; i <= segB; i++) {
      const th = (i / segB) * Math.PI; // 0 = front pole
      const row = [];
      for (let j = 0; j <= segA; j++) {
        const ph = (j / segA) * Math.PI * 2;
        const dir = V(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
        const bulge = th < 0.6 ? 0.0009 * Math.cos(th / 0.6 * Math.PI / 2) : 0;
        const p = E.clone().addScaledVector(dir, re + bulge).multiplyScalar(sc).add(pivot);
        const k = Math.min(1, Math.sin(th) / 0.94) * (th > Math.PI / 2 ? 1 : 1);
        const ux = (s > 0 ? 0.125 : 0.375) + dir.x * k * 0.115 * s;
        const vy = 0.9 - dir.y * k * 0.092;
        row.push(mb.vert(p, new THREE.Color(1, 1, 1), ux, vy, eyeMat, [[eyeBone, 1]]));
      }
      rows.push(row);
    }
    for (let i = 0; i < segB; i++) for (let j = 0; j < segA; j++) {
      mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    }
    // Shell lids on a sphere slightly larger than the eyeball; they slide under the skin.
    const LS = lidShape(FP, s);
    const rl = re + 0.0011;
    const lidMat = mat(0xffffff, { face: true, skin: 1, rough: 0.5, fuzz: 0.1 });
    const toLocal = (ph, ps, r) => {
      const a = ph + LS.yaw;
      return E.clone().addScaledVector(V(Math.sin(a) * Math.cos(ps), Math.sin(ps), Math.cos(a) * Math.cos(ps)), r);
    };
    const toWorld = (p) => p.clone().multiplyScalar(sc).add(pivot);
    const nC = 14;
    const lid = (upper) => {
      const bone = (upper ? 'lidU' : 'lidL') + side;
      const rowsL = [];
      const nR = 5;
      const marginOf = (u) => (upper ? LS.upper(u) : LS.lower(u));
      for (let r = 0; r <= nR + 1; r++) {
        const row = [];
        for (let c = 0; c <= nC; c++) {
          const u = c / nC * 2 - 1;
          const mps = marginOf(u);
          const far = upper ? 1.0 : -0.9;
          let ps, rr = rl;
          if (r <= nR) ps = lerp(far, mps, Math.pow(r / nR, 0.75));
          else { ps = mps + (upper ? -0.06 : 0.05); rr = re + 0.0002; }
          const ph = u * LS.phM * (r <= nR ? lerp(1.2, 1, r / nR) : 1);
          const pl = toLocal(ph, ps, rr);
          const edge = 1 - Math.pow(Math.abs(u), 6);
          const w = r > nR ? edge : (r / nR) ** 1.3 * edge;
          let shade = 1;
          if (r === nR) shade = upper ? 0.72 : 0.86;
          if (r > nR) shade = upper ? 0.42 : 0.6;
          const [tu, tv] = uvOf(toLocal(ph, Math.max(-0.5, Math.min(0.6, ps)), rl + 0.002));
          row.push(mb.vert(toWorld(pl), new THREE.Color(shade, shade * 0.93, shade * 0.92), tu, tv, lidMat, [[bone, w], ['head', 1 - w]]));
        }
        rowsL.push(row);
      }
      for (let r = 0; r < rowsL.length - 1; r++) for (let c = 0; c < nC; c++) {
        const a = rowsL[r][c], b = rowsL[r][c + 1], cc = rowsL[r + 1][c + 1], d = rowsL[r + 1][c];
        if (upper) mb.quad(a, d, cc, b); else mb.quad(a, b, cc, d);
      }
      // Lashes: a dark fin from the margin, fuller on the upper lid.
      const lashC = col(FP.browColor).multiplyScalar(0.3);
      const lashMat = mat(lashC, { tile: 'hair', rough: 0.6, fuzz: 0, tileU: 6, tileV: 40 });
      const len = upper ? 0.0034 : 0.0015;
      const fin = [];
      for (let c = 0; c <= nC; c++) {
        const u = c / nC * 2 - 1;
        const edge = Math.pow(Math.cos(u * Math.PI / 2), 0.5);
        const mps = marginOf(u);
        const ph = u * LS.phM;
        const base = toLocal(ph, mps, rl + 0.0001);
        const outDir = toLocal(ph * 1.02, mps + (upper ? 0.35 : -0.25), rl + 0.003).sub(base).normalize();
        const tip = base.clone().addScaledVector(outDir, len * edge + 0.0002);
        const w = 1 - Math.pow(Math.abs(u), 6);
        const wl = [[bone, w], ['head', 1 - w]];
        fin.push([mb.vert(toWorld(base), lashC, 0, 0, lashMat, wl), mb.vert(toWorld(tip), lashC, 0, 1, lashMat, wl)]);
      }
      for (let c = 0; c < nC; c++) {
        const [a, b] = fin[c], [d, cc] = fin[c + 1];
        if (upper) mb.quad(a, d, cc, b); else mb.quad(a, b, cc, d);
      }
    };
    lid(true);
    lid(false);
  }
}

function buildMouthInside(mb, FP, S, sc, pivot) {
  const w = (p) => (p.y < S.stomY - 0.001 ? [['jaw', 1]] : [['head', 1]]);
  const cav = col('#3a1512');
  const cavMat = mat(cav, { tile: 'skin', rough: 0.5, fuzz: 0, tileU: 1, tileV: 1 });
  // cavity: an inward-facing ellipsoid behind the lips
  const C = V(0, S.stomY - 0.002, 0.079);
  const rings = [];
  for (let i = 0; i <= 6; i++) {
    const phi = -Math.PI / 2 + Math.PI * (i / 6);
    rings.push({ c: C.clone().add(V(0, Math.sin(phi) * 0.014, 0)).multiplyScalar(sc).add(pivot), a: V(0, 0, 1), b: V(1, 0, 0), ra: Math.max(1e-4, Math.cos(phi) * 0.02 * sc), rb: Math.max(1e-4, Math.cos(phi) * 0.022 * sc) });
  }
  tube(mb, { rings, seg: 10, mat: cavMat, invert: true, weights: (ri, th, p) => w(p.clone().sub(pivot).divideScalar(sc)) });
  // teeth: upper and lower arcs
  const toothC = col(FP.ghost ? '#cfe0e6' : '#cdbfa6');
  const tMat = mat(toothC, { tile: 'plain', rough: 0.35, fuzz: 0, tileU: 1, tileV: 1 });
  for (const up of [true, false]) {
    const yTop = up ? S.stomY + 0.008 : S.stomY - 0.0022;
    const yBot = up ? S.stomY - 0.0012 : S.stomY - 0.011;
    const nT = 10;
    const row = [];
    for (let i = 0; i <= nT; i++) {
      const a = (i / nT - 0.5) * 2.1;
      const r = up ? 0.021 : 0.019;
      const x = Math.sin(a) * r, z = 0.081 + Math.cos(a) * r * 0.62 + (up ? 0.0012 : -0.001);
      let shade = 1 - Math.abs(i / nT - 0.5) * 1.1;
      if (up && FP.missingTooth && i === 4) shade = 0.06;
      const c = toothC.clone().multiplyScalar(shade);
      const ww = up ? [['head', 1]] : [['jaw', 1]];
      const pa = V(x, yTop, z).multiplyScalar(sc).add(pivot);
      const pb = V(x, yBot, z).multiplyScalar(sc).add(pivot);
      row.push([mb.vert(pa, c, 0, 0, tMat, ww), mb.vert(pb, c, 0, 1, tMat, ww)]);
    }
    for (let i = 0; i < nT; i++) {
      const [a, b] = row[i], [d, cc] = row[i + 1];
      mb.quad(a, b, cc, d);
    }
  }
}

function buildEars(mb, FP, S, sc, pivot, look) {
  if (look.hideEars) return;
  const es = FP.earSize;
  const earMat = mat(0xffffff, { face: true, skin: 1, rough: 0.6, fuzz: 0.1 });
  for (const s of [1, -1]) {
    // ear: a flattened shell with a rolled rim (helix) and a hollow (concha)
    const C = V(s * 0.0705, 0.058, -0.008);
    const nR = 5, nT = 14;
    const rows = [];
    for (let r = 0; r <= nR; r++) {
      const row = [];
      const rr = r / nR;
      for (let t = 0; t <= nT; t++) {
        const th = (t / nT) * Math.PI * 2;
        const ex = Math.cos(th), ey = Math.sin(th);
        const hh = 0.031 * es * (ey > 0 ? 1 : 0.85), ww = 0.017 * es * (ex > 0 ? 1.05 : 0.8);
        const rim = Math.sin(rr * Math.PI) * 0.0045;
        const bowl = rr < 0.75 ? -0.0035 * (1 - (rr / 0.75) ** 2) : 0;
        // local ear plane: forward (z), up (y), out (s*x)
        const lz = ex * ww * rr, ly = ey * hh * rr;
        const out = 0.004 + rim + bowl + (rr > 0.95 ? -0.002 : 0);
        const back = -0.0035 * (1 - rr);
        let p = V(s * out, ly, lz + back);
        // rotate: ear flares out and tilts back
        p.applyAxisAngle(V(1, 0, 0), -0.22);
        p.applyAxisAngle(V(0, 1, 0), s * 0.32);
        p.add(C);
        const uv = [0.5 + s * 0.24, 0.32];
        const ao = rr < 0.5 ? 0.62 : rr > 0.9 ? 0.9 : 0.78;
        row.push(mb.vert(p.multiplyScalar(sc).add(pivot), new THREE.Color(ao, ao, ao), uv[0], uv[1], earMat, [['head', 1]]));
      }
      rows.push(row);
    }
    for (let r = 0; r < nR; r++) for (let t = 0; t < nT; t++) {
      const a = rows[r][t], b = rows[r][t + 1], c = rows[r + 1][t + 1], d = rows[r + 1][t];
      if (s > 0) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
    }
    // back of the ear: a cap behind so it is not paper thin
    const backC = V(s * 0.068, 0.058, -0.012).multiplyScalar(sc).add(pivot);
    blob(mb, backC, { x: 0.004 * sc, y: 0.024 * sc * es, z: 0.012 * sc * es }, earMat, [['head', 1]], 8, 4, new THREE.Color(0.8, 0.8, 0.8));
  }
  void look;
}

// Neck: skin tube from inside the collar up into the head.
export function buildNeck(mb, rig, look) {
  const Mb = rig.M;
  const w = rig.world;
  const k = Mb.k;
  const neckMat = mat(col(look.skin), { tile: 'skin', skin: 1, rough: 0.6, fuzz: 0.1, tileU: 1, tileV: 2 });
  const rings = [];
  const y0 = w.neck.y - 0.05 * k, y1 = w.head.y + 0.035 * Mb.headK;
  const nr = 6;
  for (let i = 0; i <= nr; i++) {
    const t = i / nr;
    const y = lerp(y0, y1, t);
    const z = lerp(w.neck.z - 0.004, w.head.z + 0.012 * Mb.headK, t);
    const r = Mb.neckR * lerp(1.25, 0.95, smoothstep(0, 0.5, t)) * (look.neckMul || 1);
    rings.push({ c: V(0, y, z), a: V(0, 0, 1), b: V(1, 0, 0), ra: r * 1.02, rb: r * 1.08,
      off: Mb.fem || Mb.child ? null : (th) => V(0, 0, Math.exp(-((th) ** 2) / 0.08) * 0.004 * smoothstep(0.3, 0.55, t) * smoothstep(0.85, 0.6, t)) });
  }
  const neckY = w.neck.y, headY = w.head.y;
  tube(mb, {
    rings, seg: 12, mat: neckMat,
    color: (ri) => col(look.skin).multiplyScalar(lerp(0.78, 0.95, ri / nr)),
    weights: (ri, th, p) => {
      if (p.y < neckY) { const t = smoothstep(neckY - 0.04 * k, neckY + 0.01, p.y); return [['chest', 1 - t], ['neck', t]]; }
      const t = smoothstep(neckY + (headY - neckY) * 0.4, headY + 0.01, p.y);
      return [['neck', 1 - t], ['head', t]];
    },
  });
}

// ---------------------------------------------------------------- face painting
export function paintFace(canvas, info, FP, look) {
  const W = canvas.width, Hh = canvas.height;
  const g = canvas.getContext('2d');
  const R = rng(look.seed || 1);
  const skin = col(FP.skin);
  const css = (c, a = 1) => `rgba(${Math.round(srgb(c.r) * 255)},${Math.round(srgb(c.g) * 255)},${Math.round(srgb(c.b) * 255)},${a})`;
  const P = (x, y, z) => { const [u, v] = info.uvOf(V(x, y, z)); return [u * W, v * Hh]; };
  const S = info.S;
  // base
  let base = skin.clone();
  if (FP.pale) base.lerp(col('#dfe9ee'), FP.pale);
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, Hh);
  const blot = (x, y, r, c, a, sx = 1, sy = 1) => {
    g.save();
    g.translate(x, y);
    g.scale(sx, sy);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, css(c, a));
    gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
  };
  const sz = W / 512;
  // mottling
  for (let i = 0; i < 260; i++) {
    const c = R() < 0.5 ? skin.clone().multiplyScalar(0.9) : skin.clone().lerp(col('#e8b8a0'), 0.4);
    blot(R() * W, R() * Hh * 0.8, (6 + R() * 18) * sz, c, 0.12);
  }
  const red = col('#c0605a'), cool = col('#8c7f9a');
  const warmth = FP.ghost ? 0 : 1;
  // cold flush: cheeks, nose, chin, ears
  for (const s of [1, -1]) {
    const [cx, cy] = P(s * 0.045, 0.045, 0.09);
    blot(cx, cy, 34 * sz, red, 0.32 * FP.blush * warmth, 1, 0.8);
    const [ex, ey] = P(s * 0.073, 0.06, -0.006);
    blot(ex, ey, 22 * sz, red, 0.4 * warmth);
    // under-eye shadow (hunger, cold)
    const [ux, uy] = P(s * 0.031, 0.06, 0.09);
    blot(ux, uy, 13 * sz, cool, 0.32 * FP.underEye, 1.3, 0.6);
    // eye socket upper shading
    const [lx, ly] = P(s * 0.033, 0.083, 0.088);
    blot(lx, ly, 13 * sz, skin.clone().multiplyScalar(0.72), 0.45, 1.4, 0.7);
  }
  const [nx, ny] = P(0, S.tipY, S.tipZ + 0.01);
  blot(nx, ny, 16 * sz, red, 0.4 * FP.noseRed * warmth);
  const [chx, chy] = P(0, S.chinY + 0.004, 0.096);
  blot(chx, chy, 16 * sz, red, 0.14 * warmth);
  // forehead slightly lighter
  const [fx, fy] = P(0, 0.12, 0.09);
  blot(fx, fy, 50 * sz, skin.clone().lerp(col('#f0d8c0'), 0.4), 0.25, 1.6, 0.8);
  // stubble / beard shadow
  if (FP.stubble > 0) {
    const sc = col(FP.stubbleColor);
    for (let i = 0; i < 2600 * FP.stubble * sz * sz; i++) {
      const s = R() < 0.5 ? 1 : -1;
      const t = R();
      const x = s * lerp(0.0, 0.055, Math.pow(R(), 0.8));
      const y = lerp(S.chinY - 0.012, S.stomY + 0.016, t);
      const z = 0.1 - Math.abs(x) * 0.6;
      if (y > S.stomY + 0.002 && Math.abs(x) > 0.024) continue;
      if (y > S.stomY - 0.0015 && y < S.stomY + 0.003 && Math.abs(x) < 0.026) continue; // lips
      const [px, py] = P(x, y, z);
      g.fillStyle = css(sc, 0.22 + R() * 0.25);
      g.fillRect(px, py, 1.2 * sz, 1.2 * sz);
    }
    for (const s of [1, -1]) {
      const [bx, by] = P(s * 0.04, S.chinY + 0.01, 0.08);
      blot(bx, by, 30 * sz, sc, 0.18 * FP.stubble);
    }
    const [mx, my] = P(0, S.stomY + 0.008, 0.104);
    blot(mx, my, 18 * sz, sc, 0.22 * FP.stubble, 1.6, 0.5);
  }
  // lips
  const lipC = col(FP.lipColor);
  if (FP.ghost) lipC.lerp(col('#7c8ea8'), 0.7);
  const lipPts = (yOff, wMul) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 * 2 - 1;
      const x = t * 0.024 * FP.lipW * wMul;
      const bow = yOff > 0 ? (1 - Math.abs(t)) * 0.0015 * (1 - Math.cos(t * Math.PI * 2.2) * 0.5) : 0;
      const y = S.stomY + yOff * Math.pow(1 - t * t, 0.6) * FP.lipFull + bow;
      pts.push(P(x, y, 0.1 - t * t * 0.008));
    }
    return pts;
  };
  const up = lipPts(0.0082, 0.96), lo = lipPts(-0.0098, 0.86), mid = lipPts(0.0, 0.98);
  g.fillStyle = css(lipC, 0.5);
  g.beginPath();
  up.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = lo.length - 1; i >= 0; i--) g.lineTo(lo[i][0], lo[i][1]);
  g.closePath();
  g.filter = `blur(${2.2 * sz}px)`;
  g.fill();
  g.filter = 'none';
  g.strokeStyle = css(lipC.clone().multiplyScalar(0.35), 0.75);
  g.lineWidth = 1.6 * sz;
  g.beginPath();
  mid.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  // eyebrows: short strokes along an arc, thick at the inner end
  const browC = col(FP.browColor);
  for (const s of [1, -1]) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const [px, py] = P(s * lerp(0.013, 0.048, t), 0.0905 + Math.sin(t * Math.PI * 0.85) * 0.004 * (0.6 + FP.browArch) - t * 0.002, 0.094 - t * 0.016);
      blot(px, py, (7 - t * 3) * sz * FP.browThick, browC, 0.22, 1.4, 0.7);
    }
  }
  for (const s of [1, -1]) {
    const nStroke = Math.round(70 * FP.browThick * sz);
    for (let i = 0; i < nStroke; i++) {
      const t = R();
      const x = s * lerp(0.011, 0.05, t);
      const arch = Math.sin(t * Math.PI * 0.85) * 0.004 * (0.6 + FP.browArch);
      const y = 0.0905 + arch - t * 0.002 + (R() - 0.5) * 0.0042 * (1 - t * 0.6) * FP.browThick;
      const z = 0.094 - t * 0.016;
      const [px, py] = P(x, y, z);
      const ang = (s > 0 ? -1 : 1) * lerp(0.9, 0.15, t) + Math.PI * (s > 0 ? 0 : 1);
      const len = (5 + R() * 4) * sz;
      g.strokeStyle = css(browC, 0.45 + R() * 0.4);
      g.lineWidth = (0.9 + R() * 0.6) * sz * (FP.child ? 0.8 : 1);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(ang) * len, py - Math.sin(Math.abs(ang)) * len * 0.35 * (t < 0.2 ? 2.5 : 1));
      g.stroke();
    }
  }
  // wrinkles
  if (FP.wrinkles > 0) {
    const wc = skin.clone().multiplyScalar(0.62);
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = css(wc, 0.35 * FP.wrinkles);
      g.lineWidth = 1.4 * sz;
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const t = i / 12 * 2 - 1;
        const [px, py] = P(t * 0.04, 0.112 + k * 0.0075 + Math.sin(t * 3 + k) * 0.0015, 0.098 - t * t * 0.02);
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    }
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const [ax, ay] = P(s * 0.047, 0.074 - k * 0.005, 0.07);
        const [bx, by] = P(s * 0.058, 0.077 - k * 0.008, 0.06);
        g.strokeStyle = css(wc, 0.4 * FP.wrinkles);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
      // nasolabial line
      const [a1, b1] = P(s * 0.018, S.tipY - 0.005, 0.104);
      const [a2, b2] = P(s * 0.03, S.stomY - 0.006, 0.09);
      g.strokeStyle = css(wc, 0.5 * FP.wrinkles);
      g.lineWidth = 2 * sz;
      g.beginPath(); g.moveTo(a1, b1); g.quadraticCurveTo((a1 + a2) / 2 + s * 4 * sz, (b1 + b2) / 2, a2, b2); g.stroke();
      // under-eye bag line
      const [c1, d1] = P(s * 0.022, 0.06, 0.088);
      const [c2, d2] = P(s * 0.042, 0.062, 0.08);
      g.lineWidth = 1.2 * sz;
      g.beginPath(); g.moveTo(c1, d1); g.quadraticCurveTo((c1 + c2) / 2, (d1 + d2) / 2 + 3 * sz, c2, d2); g.stroke();
    }
  }
  // freckles / age spots
  for (let i = 0; i < 160 * FP.freckles; i++) {
    const s = R() < 0.5 ? 1 : -1;
    const [px, py] = P(s * R() * 0.05, 0.04 + R() * 0.05, 0.1);
    g.fillStyle = css(skin.clone().multiplyScalar(0.7), 0.35);
    g.beginPath(); g.arc(px, py, (0.8 + R()) * sz, 0, 7); g.fill();
  }
  // scar: from the left cheekbone down to the jaw (character's left = +X)
  if (FP.scar) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(P(lerp(0.041, 0.054, t) + Math.sin(t * 5) * 0.0012, lerp(0.058, 0.004, t), lerp(0.08, 0.055, t)));
    }
    const pale = skin.clone().lerp(col('#f2dcd2'), 0.7);
    const pink = skin.clone().lerp(col('#b8706a'), 0.5);
    for (const [c, wdt, a] of [[pink, 5, 0.45], [pale, 2.4, 0.9]]) {
      g.strokeStyle = css(c, a);
      g.lineWidth = wdt * sz;
      g.lineCap = 'round';
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    for (let i = 1; i < 10; i += 2) {
      const [x, y] = pts[i];
      g.strokeStyle = css(pink, 0.3);
      g.lineWidth = 1 * sz;
      g.beginPath(); g.moveTo(x - 3 * sz, y - 1 * sz); g.lineTo(x + 3 * sz, y + 1 * sz); g.stroke();
    }
  }
  // scalp hair painted on the grid region above the hairline
  paintScalp(g, info, look, W, Hh, R, css);
  // irises
  paintIris(g, FP, W, Hh, css, R);
}

function srgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function paintScalp(g, info, look, W, Hh, R, css) {
  const h = look.hair;
  if (!h || h.style === 'bald' || h.style === 'none') return;
  const hc = col(h.color || '#4a3a2c');
  const streak = h.streak ? col(h.streak) : null;
  // Rasterize the mask in UV space by sampling grid points (pre-collected).
  const pts = info.hairPts;
  const sz = W / 512;
  for (const p of pts) {
    const [u, v] = info.uvOf(p);
    const m = hairMask(p, h).mask;
    if (m < 0.05) continue;
    g.fillStyle = css(hc.clone().multiplyScalar(0.85 + R() * 0.2), Math.min(1, m * 1.2));
    g.beginPath();
    g.arc(u * W, v * Hh, 9 * sz, 0, 7);
    g.fill();
  }
  // strands: streaks running down v (crown to edges)
  for (let i = 0; i < 2600 * sz; i++) {
    const p = pts[(R() * pts.length) | 0];
    if (!p) break;
    if (hairMask(p, h).mask < 0.5) continue;
    const [u, v] = info.uvOf(p);
    const light = R() < 0.5;
    let c = hc.clone().multiplyScalar(light ? 1.35 : 0.65);
    if (streak && Math.abs(p.x - (h.streakX ?? 0.025)) < 0.012 && p.y > 0.08) c = streak.clone();
    g.strokeStyle = css(c, 0.35);
    g.lineWidth = (0.7 + R()) * sz;
    g.beginPath();
    g.moveTo(u * W, v * Hh);
    g.lineTo(u * W + (R() - 0.5) * 2 * sz, v * Hh + (8 + R() * 14) * sz);
    g.stroke();
  }
}

function paintIris(g, FP, W, Hh, css, R) {
  const y0 = Hh * 0.8, hh = Hh * 0.2;
  const iris = col(FP.iris);
  const iris2 = FP.iris2 ? col(FP.iris2) : iris.clone().multiplyScalar(0.55);
  for (const cxF of [0.125, 0.375]) {
    const cx = cxF * W, cy = y0 + hh * 0.5;
    const ew = W * 0.125, eh = hh * 0.5;
    // sclera with pinkish, veined corners
    const scl = FP.ghost ? col('#d6eef2') : col('#ece4da');
    g.fillStyle = css(scl);
    g.fillRect(cx - ew, cy - eh, ew * 2, eh * 2);
    const gr = g.createRadialGradient(cx, cy, ew * 0.3, cx, cy, ew * 1.05);
    gr.addColorStop(0, css(scl, 0));
    gr.addColorStop(1, css(FP.ghost ? col('#a8c8d0') : col('#d0a8a0'), 0.8));
    g.fillStyle = gr;
    g.fillRect(cx - ew, cy - eh, ew * 2, eh * 2);
    for (let i = 0; i < 10 && !FP.ghost; i++) {
      const a = R() * Math.PI * 2;
      g.strokeStyle = css(col('#b0605a'), 0.25);
      g.lineWidth = 0.6 * (W / 512);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * ew * 0.95, cy + Math.sin(a) * eh * 0.95);
      g.lineTo(cx + Math.cos(a + 0.2) * ew * 0.55, cy + Math.sin(a + 0.1) * eh * 0.55);
      g.stroke();
    }
    // iris: radius maps to ~30 degrees on the eyeball
    const ir = ew * 0.43;
    const ig = g.createRadialGradient(cx, cy, ir * 0.2, cx, cy, ir);
    ig.addColorStop(0, css(iris.clone().lerp(col('#f0d090'), FP.slit ? 0.35 : 0.1)));
    ig.addColorStop(0.55, css(iris));
    ig.addColorStop(0.9, css(iris2));
    ig.addColorStop(1, css(iris2.clone().multiplyScalar(0.4)));
    g.fillStyle = ig;
    g.beginPath(); g.arc(cx, cy, ir, 0, 7); g.fill();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + R() * 0.05;
      g.strokeStyle = css(R() < 0.5 ? iris.clone().multiplyScalar(1.5) : iris2.clone().multiplyScalar(0.7), 0.35);
      g.lineWidth = 0.8 * (W / 512);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * ir * 0.3, cy + Math.sin(a) * ir * 0.3);
      g.lineTo(cx + Math.cos(a) * ir * 0.92, cy + Math.sin(a) * ir * 0.92);
      g.stroke();
    }
    // limbal ring
    g.strokeStyle = css(iris2.clone().multiplyScalar(0.25), 0.8);
    g.lineWidth = ir * 0.1;
    g.beginPath(); g.arc(cx, cy, ir * 0.97, 0, 7); g.stroke();
    // pupil: round, or a subtle vertical slit for mutant cat eyes
    g.fillStyle = 'rgb(8,6,6)';
    g.beginPath();
    if (FP.slit) g.ellipse(cx, cy, ir * 0.15, ir * 0.56, 0, 0, 7);
    else g.arc(cx, cy, ir * (FP.ghost ? 0.28 : 0.36), 0, 7);
    g.fill();
  }
}

export { sat };
