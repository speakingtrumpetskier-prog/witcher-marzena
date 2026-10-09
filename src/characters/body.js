// Body and garments as skinned layers, merged into the character's single geometry.
//
// The naked body is never built where clothes cover it: the outermost garment IS the surface.
// Pieces: torso garment (coat / vest / dress bodice / shirt), inner reveal at openings,
// sleeves with cuffs, hands (bare, gloved or mittens), legs (trousers / stockings / wraps),
// boots, the coat skirt or dress skirt on spring chains, and gear (gear.js).
// Outfit spec: see presets.js (shirt, dress, coat, vest, skirt, apron, trousers, boots, hands...).
import * as THREE from 'three';
import { M as mat, tube, chainWeights, frame } from './geom.js';
import { armJoints, legJoints } from './rig.js';
import { col, clamp, lerp, smoothstep, rng, noise1 } from './util.js';
import { buildGear } from './gear.js';
import { TILE } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Body surface cross-section (half width w along X, half depth d along Z, center z, exponent n).
export function torsoShape(M) {
  const k = M.k;
  const yS = M.shoulderY, yN = M.neckBaseY + 0.012 * k;
  const st = [
    { y: M.hipJY - 0.085 * k, w: M.hipW * 0.97, d: M.hipD * 1.0, z: -0.014 * k, n: 2.3 },
    { y: M.hipJY + 0.02 * k, w: M.hipW, d: M.hipD, z: -0.01 * k, n: 2.4 },
    { y: M.pelvisY + 0.07 * k, w: M.waistW, d: M.waistD, z: 0.0, n: 2.2 },
    { y: M.spineY + 0.07 * k, w: lerp(M.waistW, M.chestW, 0.6), d: lerp(M.waistD, M.chestD, 0.6), z: 0.004 * k, n: 2.3 },
    { y: M.chestY, w: M.chestW, d: M.chestD, z: 0.008 * k, n: 2.5 },
    { y: yS - 0.1 * k, w: M.chestW * 1.02, d: M.chestD * 0.97, z: 0.004 * k, n: 2.6 },
    { y: yS - 0.035 * k, w: M.shoulderX + M.armR * 0.7, d: M.chestD * 0.85, z: -0.006 * k, n: 2.7 },
    { y: yS + (yN - yS) * 0.3, w: M.shoulderX * 0.9, d: M.chestD * 0.74, z: -0.013 * k, n: 2.6 },
    { y: yS + (yN - yS) * 0.7, w: M.shoulderX * 0.6, d: M.chestD * 0.62, z: -0.017 * k, n: 2.6 },
    { y: yN, w: M.neckR * 1.18, d: M.neckR * 1.12, z: -0.018 * k, n: 2.0 },
  ];
  const at = (y) => {
    if (y <= st[0].y) return { ...st[0] };
    for (let i = 1; i < st.length; i++) {
      if (y <= st[i].y) {
        const a = st[i - 1], b = st[i];
        const t = (y - a.y) / (b.y - a.y);
        const s = t * t * (3 - 2 * t) * 0.6 + t * 0.4;
        return { y, w: lerp(a.w, b.w, s), d: lerp(a.d, b.d, s), z: lerp(a.z, b.z, s), n: lerp(a.n, b.n, s) };
      }
    }
    return { ...st[st.length - 1] };
  };
  return { st, at, yS, yN };
}

export function buildBody(mb, rig, look, extra) {
  const M = rig.M, W = rig.world, k = M.k;
  const O = look.outfit || {};
  const R = rng((look.seed || 1) * 7 + 3);
  const shape = torsoShape(M);
  const ctx = { mb, rig, M, W, k, O, R, look, shape, extra };
  ctx.waistY = M.pelvisY + 0.07 * k;
  // Which garment is outermost on the torso.
  const coat = O.coat, vest = O.vest, dress = O.dress, shirt = O.shirt || { color: '#cfc6b4', tile: 'linen' };
  ctx.torsoG = coat || vest || dress || shirt;
  ctx.sleeveG = coat || dress || shirt;
  ctx.hasSkirt = !!(coat && coat.length > 0.25) || !!(dress && dress.length > 0.25) || !!O.skirt;
  buildTorso(ctx);
  buildSleeves(ctx);
  buildHands(ctx);
  buildLegs(ctx);
  buildSkirts(ctx);
  buildGear(ctx);
}

export function garmentMat(g, defTile = 'wool') {
  const tile = g.tile || defTile;
  const rough = g.rough ?? (tile === 'leather' ? 0.6 : tile === 'oilskin' ? 0.45 : tile === 'linen' ? 0.85 : 0.92);
  const fuzz = g.fuzz ?? (tile === 'fleece' || tile === 'fur' ? 0.7 : tile === 'wool' || tile === 'knit' ? 0.45 : 0.2);
  return mat(col(g.color || '#6b5a4a'), { tile, rough, fuzz, tileU: g.tileU ?? 6, tileV: g.tileV ?? 7 });
}
const thick = (g) => (g.thick ?? (g.tile === 'fleece' ? 0.028 : g.tile === 'leather' ? 0.012 : g.tile === 'linen' ? 0.006 : 0.016));

// Torso weights: spine chain by height, shoulders and arms near the armholes.
export function torsoWeights(ctx, p) {
  const { M, W, k } = ctx;
  const ax = Math.abs(p.x), S = p.x >= 0 ? 'L' : 'R';
  const w = chainWeights([
    { name: 'hips', s: W.hips.y }, { name: 'spine', s: W.spine.y + 0.02 * k },
    { name: 'chest', s: W.chest.y }, { name: 'neck', s: W.neck.y + 0.03 * k },
  ], p.y, 0.06 * k);
  const sx = ax / M.shoulderX;
  const sh = smoothstep(0.35, 0.85, sx) * smoothstep(W.chest.y, M.shoulderY - 0.01, p.y) * 0.55;
  const arm = smoothstep(0.8, 1.1, sx) * smoothstep(M.shoulderY - 0.14 * k, M.shoulderY - 0.03 * k, p.y) * 0.5;
  const thigh = smoothstep(M.hipJY + 0.01 * k, M.hipJY - 0.08 * k, p.y) * smoothstep(0.25, 0.9, ax / M.hipW) * 0.45;
  const rest = 1 - sh - arm - thigh;
  const out = w.map(([n, v]) => [n, v * rest]);
  out.push(['shoulder' + S, sh], ['arm' + S, arm], ['thigh' + S, thigh]);
  return out;
}

function foldNoise(seed, amp) {
  return (th, y) => 1 + amp * (noise1(th * 3.1 + y * 9.0, seed) * 0.6 + noise1(th * 7.3 - y * 4.0, seed + 5) * 0.4);
}

function buildTorso(ctx) {
  const { mb, M, k, O, shape, R } = ctx;
  const g = ctx.torsoG;
  const gm = garmentMat(g);
  const t0 = thick(g);
  const yBot = ctx.hasSkirt ? ctx.waistY : M.hipJY - 0.085 * k;
  const yTop = shape.yN;
  const ys = [];
  const nr = 12;
  for (let i = 0; i <= nr; i++) {
    const t = i / nr;
    ys.push(lerp(yBot, yTop, t < 0.75 ? t / 0.75 * 0.62 : 0.62 + (t - 0.75) / 0.25 * 0.38));
  }
  const folds = foldNoise(ctx.look.seed || 1, 0.012);
  const bust = M.bust * (g.tile === 'fleece' ? 0.5 : 1);
  const belt = O.belt || g.belt;
  const lowerMat = O.trousers ? garmentMat(O.trousers) : gm;
  // Front opening (V-neck or open coat front) reveals the inner layer.
  const gap = (y) => {
    if (!g.vneck) return 0;
    return g.vneck * smoothstep(M.chestY - 0.05 * k, yTop, y);
  };
  const ringFor = (y, off, gp = 0) => {
    const s = shape.at(y);
    const pad = off + (y < ctx.waistY + 0.03 && belt ? -0.004 : 0);
    return {
      c: V(0, y, s.z), a: V(0, 0, 1), b: V(1, 0, 0), ra: s.d + pad, rb: s.w + pad, n: s.n,
      th0: gp, th1: TAU - gp,
      r: (th) => {
        let m = folds(th, y);
        if (bust > 0) {
          const by = Math.exp(-(((y - (M.chestY - 0.01 * k)) / (0.055 * k)) ** 2));
          const bx = Math.exp(-(((Math.sin(th) - 0.42) / 0.3) ** 2)) + Math.exp(-(((Math.sin(th) + 0.42) / 0.3) ** 2));
          m += (bust / s.d) * by * bx * Math.max(0, Math.cos(th));
        }
        return m;
      },
    };
  };
  const rings = ys.map((y) => ringFor(y, t0, gap(y)));
  const isOpen = rings.some((r) => r.th0 > 0.01);
  tube(mb, {
    rings, seg: 20, mat: gm, open: isOpen, th0: 0, th1: TAU,
    matAt: (ri) => (!ctx.hasSkirt && ys[ri] < M.hipJY - 0.02 * k ? lowerMat : null),
    color: (ri, th, p) => {
      let c = (!ctx.hasSkirt && ys[ri] < M.hipJY - 0.02 * k ? lowerMat : gm).color.clone();
      // darker in the armpit folds, lighter on the shoulder tops (wear)
      const side = Math.abs(Math.sin(th));
      if (p.y > M.shoulderY - 0.12 * k && p.y < M.shoulderY - 0.04 * k) c.multiplyScalar(1 - 0.18 * smoothstep(0.85, 1, side));
      if (g.placket && Math.abs(Math.sin(th)) < 0.04 && Math.cos(th) > 0 && p.y < M.shoulderY) c.multiplyScalar(0.6);
      c.multiplyScalar(0.94 + R() * 0.06);
      return c;
    },
    weights: (ri, th, p) => torsoWeights(ctx, p),
    inner: isOpen ? { inset: 0.004, color: col(g.lining || '#3b2e25'), mat: garmentMat({ color: g.lining || '#3b2e25', tile: g.liningTile || 'wool' }) } : null,
  });
  // Inner layer visible in the opening.
  if (isOpen) {
    const inner = O.shirt || O.dress || { color: '#cfc6b4', tile: 'linen' };
    const im = garmentMat(inner, 'linen');
    const ys2 = ys.filter((y) => gap(y) > 0.01 || y > M.chestY - 0.08 * k);
    const rings2 = ys2.map((y) => {
      const r = ringFor(y, thick(inner), 0);
      const gp = gap(y) + 0.25;
      r.th0 = -gp; r.th1 = gp;
      return r;
    });
    tube(mb, { rings: rings2, seg: 8, mat: im, open: true, th0: -1, th1: 1, weights: (ri, th, p) => torsoWeights(ctx, p) });
  }
}

function buildSleeves(ctx) {
  const { mb, M, k, O } = ctx;
  const g = ctx.sleeveG;
  const gm = garmentMat(g);
  const t0 = thick(g);
  const loose = g.loose ?? (g === O.coat ? 1.32 : 1.12);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const A = armJoints(M, s);
    const dir1 = A.el.clone().sub(A.sh).normalize();
    const dir2 = A.wr.clone().sub(A.el).normalize();
    const rolled = g.rolled ? 0.55 : 0;
    const wristEnd = A.wr.clone().addScaledVector(dir2, (g.cuffPast ?? 0.012) * k - rolled * M.forearm);
    const pts = [
      { c: A.sh.clone().add(V(-s * 0.035 * k, -0.004 * k, -0.004 * k)), r: M.armR * 1.3 * loose + t0, w: [['chest', 0.3], ['shoulder' + S, 0.45], ['arm' + S, 0.25]] },
      { c: A.sh.clone().addScaledVector(dir1, 0.03 * k).add(V(0, -0.004 * k, 0)), r: M.armR * 1.32 * loose + t0, w: [['shoulder' + S, 0.25], ['arm' + S, 0.75]] },
      { c: A.sh.clone().addScaledVector(dir1, M.upperArm * 0.45), r: M.armR * 1.18 * loose + t0 },
      { c: A.sh.clone().addScaledVector(dir1, M.upperArm * 0.8), r: M.armR * 1.0 * loose + t0 },
      { c: A.el.clone(), r: M.armR * 0.97 * loose + t0 },
      { c: A.el.clone().addScaledVector(dir2, M.forearm * 0.3), r: M.armR * 1.0 * loose + t0 },
      { c: A.el.clone().addScaledVector(dir2, M.forearm * 0.7), r: M.armR * 0.82 * loose + t0 },
      { c: wristEnd.clone().addScaledVector(dir2, -0.035 * k), r: M.armR * 0.74 * loose + t0 + (g.flare ?? 0.006) * 0.5 },
      { c: wristEnd, r: M.armR * 0.74 * loose + t0 + (g.flare ?? 0.006) },
    ];
    const joints = [{ name: 'arm' + S, s: 0 }, { name: 'forearm' + S, s: M.upperArm }, { name: 'hand' + S, s: M.upperArm + M.forearm }];
    const sOf = (c) => {
      const d1 = c.clone().sub(A.sh).dot(dir1);
      if (d1 < M.upperArm) return d1;
      return M.upperArm + c.clone().sub(A.el).dot(dir2);
    };
    const rings = pts.map((P, i) => {
      const nxt = pts[Math.min(i + 1, pts.length - 1)].c, prv = pts[Math.max(i - 1, 0)].c;
      const t = nxt.clone().sub(prv).normalize();
      const f = frame(t, V(0, 0, 1));
      const ell = i <= 1 ? 1.08 : 1;
      return { c: P.c, a: f.a, b: f.b, ra: P.r, rb: P.r * ell, wts: P.w, sv: sOf(P.c),
        r: (th) => 1 + 0.05 * noise1(th * 2.7 + i * 1.3, s * 3 + 1) + (i === 4 ? 0.06 * Math.max(0, -Math.cos(th)) : 0) };
    });
    tube(mb, {
      rings, seg: 12, mat: gm,
      color: (ri, th) => {
        const c = gm.color.clone();
        if (ri === 4 && Math.cos(th) > 0.3) c.multiplyScalar(0.8);
        if (ri >= 7) c.multiplyScalar(0.9);
        return c;
      },
      weights: (ri) => rings[ri].wts || chainWeights(joints, rings[ri].sv, 0.045 * k),
      inner: { inset: 0.003, color: gm.color.clone().multiplyScalar(0.35), hem: true },
    });
    // Cuffs: turned-back band (sheepskin or contrasting) or embroidered band.
    const cuff = g.cuff;
    if (cuff) {
      const cm = garmentMat(cuff.tile === 'emb' ? { color: cuff.color || g.color, tile: 'linen' } : cuff);
      const cr = [];
      const len = (cuff.len ?? 0.07) * k;
      const cuffThick = cuff.tile === 'fleece' || cuff.tile === 'fur' ? 0.012 : 0.004;
      for (let i = 0; i <= 2; i++) {
        const c = wristEnd.clone().addScaledVector(dir2, -len * (1 - i / 2) + 0.004);
        const f = frame(dir2, V(0, 0, 1));
        const rr = M.armR * 0.74 * loose + t0 + (g.flare ?? 0.006) + cuffThick * (i === 1 ? 1.15 : 1) + 0.002;
        cr.push({ c, a: f.a, b: f.b, ra: rr, rb: rr });
      }
      const cmat = cuff.emb !== undefined ? { ...cm, tile: TILE_EMB(cuff.emb), tileU: 3 } : cm;
      tube(mb, { rings: cr, seg: 12, mat: cmat, v0: 0,
        weights: () => chainWeights(joints, M.upperArm + M.forearm * 0.95, 0.04 * k), inner: { inset: 0.003, hem: true } });
    }
  }
}

const TILE_EMB = (m) => TILE.emb(m);

// Hands: palm block, four two-segment fingers and a thumb; gloves recolor, mittens merge fingers.
function buildHands(ctx) {
  const { mb, M, k, O, look } = ctx;
  const h = O.hands || {};
  const glove = h.glove || null;
  const mitten = h.mitten || null;
  const skinC = col(look.skin);
  if (h.raw) skinC.lerp(col('#c86a5a'), 0.28);
  const handMat = glove ? garmentMat({ ...glove, tile: glove.tile || 'leather', tileU: 2, tileV: 6 }) :
    mitten ? garmentMat({ ...mitten, tile: mitten.tile || 'knit', tileU: 2, tileV: 6 }) :
      mat(skinC, { tile: 'skin', skin: 1, rough: 0.6, fuzz: 0.08, tileU: 1, tileV: 3 });
  const hk = M.handLen / 0.19;
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const A = armJoints(M, s);
    const down = A.dir.clone();
    // palm faces the thigh (medial); thumb side points forward.
    const fwd = V(0, 0, 1);
    const palmN = new THREE.Vector3().crossVectors(down, fwd).normalize().multiplyScalar(s); // toward medial
    const side = new THREE.Vector3().crossVectors(palmN, down).normalize();
    const at = (u, wv, tv) => A.wr.clone().addScaledVector(down, u * hk).addScaledVector(side, wv * hk).addScaledVector(palmN, tv * hk);
    const hw = [['hand' + S, 1]];
    // palm tube: wrist -> knuckles
    const palmRings = [];
    const pr = [[-0.012, 0.024, 0.017], [0.015, 0.031, 0.016], [0.055, 0.04, 0.014], [0.088, 0.041, 0.012]];
    const thickMul = glove || mitten ? 1.12 : 1;
    for (const [u, wv, tv] of pr) {
      const c = at(u, wv * 0.02, 0);
      palmRings.push({ c, a: side.clone(), b: palmN.clone().multiplyScalar(-1), ra: wv * hk * thickMul, rb: tv * hk * thickMul, n: 2.6 });
    }
    // ensure right-handed frame per ring
    for (const r of palmRings) {
      const t = down.clone();
      if (new THREE.Vector3().crossVectors(r.a, r.b).dot(t) < 0) r.b.multiplyScalar(-1);
    }
    if (mitten) {
      palmRings.push({ ...palmRings[3], c: at(0.13, 0.002, 0.002), ra: 0.038 * hk * thickMul, rb: 0.014 * hk * thickMul });
      palmRings.push({ ...palmRings[3], c: at(0.17, 0.0, 0.003), ra: 0.028 * hk * thickMul, rb: 0.012 * hk * thickMul });
    }
    tube(mb, { rings: palmRings, seg: 10, mat: handMat, capEnd: true, capStart: true,
      weights: (ri) => (ri >= 4 ? [['fingers' + S, 0.6], ['fingers2' + S, 0.4]] : ri === 3 ? [['hand' + S, 0.7], ['fingers' + S, 0.3]] : hw) });
    if (!mitten) {
      // fingers: index (thumb side) .. pinky
      const fingers = [[0.026, 0.075], [0.009, 0.082], [-0.009, 0.077], [-0.025, 0.062]];
      fingers.forEach(([off, len], fi) => {
        const rings = [];
        const n = 4;
        const r0 = (fi === 3 ? 0.0078 : 0.0092) * thickMul;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const c = at(0.084 + len * t, off * (1 + t * 0.12), -0.002 + t * 0.002);
          rings.push({ c, a: side.clone(), b: palmN.clone().multiplyScalar(-1), ra: r0 * hk * (1 - t * 0.22), rb: r0 * hk * 0.86 * (1 - t * 0.2) });
        }
        for (const r of rings) if (new THREE.Vector3().crossVectors(r.a, r.b).dot(down) < 0) r.b.multiplyScalar(-1);
        tube(mb, { rings, seg: 6, mat: handMat, capEnd: true,
          color: (ri) => handMat.color.clone().multiplyScalar(ri === n ? 0.95 : 1),
          weights: (ri) => (ri === 0 ? [['hand' + S, 0.5], ['fingers' + S, 0.5]] : ri <= 2 ? [['fingers' + S, 1]] : [['fingers2' + S, 1]]) });
      });
    }
    // thumb from the base of the palm, angled forward and down
    const tb = at(0.012, 0.028, -0.006);
    const tdir = down.clone().multiplyScalar(0.72).addScaledVector(side, 0.55).addScaledVector(palmN, 0.38).normalize();
    const trings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const c = tb.clone().addScaledVector(tdir, 0.062 * hk * t);
      const f = frame(tdir, palmN);
      const r = (0.0125 - t * 0.0035) * hk * thickMul;
      trings.push({ c, a: f.a, b: f.b, ra: r, rb: r * 0.9 });
    }
    tube(mb, { rings: trings, seg: 6, mat: handMat, capEnd: true,
      weights: (ri) => (ri === 0 ? [['hand' + S, 0.7], ['thumb' + S, 0.3]] : [['thumb' + S, 1]]) });
  }
}

// Legs: trousers, stockings or wrapped cloth (onuce) down into the boots.
function buildLegs(ctx) {
  const { mb, M, k, O } = ctx;
  const tr = O.trousers || O.stockings || { color: '#4a4038', tile: 'wool' };
  const tm = garmentMat(tr);
  const boots = O.boots || { color: '#3b2e25', height: 0.62 };
  // Under a long skirt the legs above the hem are hidden: start them just above the hem.
  const hemY = ctx.hemY ?? (O.dress ? (M.hipJY + 0.03 * k) * (1 - O.dress.length) : O.skirt ? (M.hipJY + 0.03 * k) * (1 - O.skirt.length) : null);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const L = legJoints(M, s);
    const bootTop = M.ankleY + (M.kneeY - M.ankleY) * (boots.height ?? 0.62);
    const legTop = hemY !== null && O.dress && O.dress.length > 0.75 ? null : hemY !== null ? Math.min(M.hipJY + 0.06 * k, hemY + 0.12 * k) : M.hipJY + 0.06 * k;
    const tt = thick(tr) * 0.6;
    if (legTop !== null && legTop > bootTop) {
      const legPts = [];
      const sample = (y) => {
        // position along hip->knee->ankle polyline by height
        let c, r;
        if (y >= L.knee.y) {
          const t = (y - L.knee.y) / (L.hip.y - L.knee.y);
          c = L.knee.clone().lerp(L.hip, t);
          r = lerp(M.calfR * 1.12, M.thighR * 1.08, Math.pow(clamp(t, 0, 1.2), 0.8));
          if (y > M.hipJY - 0.04 * k) c.x = lerp(c.x, s * M.hipJX * 0.55, smoothstep(M.hipJY - 0.04 * k, M.hipJY + 0.06 * k, y));
        } else {
          const t = (y - L.ankle.y) / (L.knee.y - L.ankle.y);
          c = L.ankle.clone().lerp(L.knee, t);
          r = lerp(M.calfR * 0.62, M.calfR * 1.08, Math.sin(Math.min(1, t * 1.25) * Math.PI / 2));
        }
        return { c, r: r + tt };
      };
      const ys = [];
      const n = 9;
      for (let i = 0; i <= n; i++) ys.push(lerp(legTop, bootTop - 0.03 * k, i / n));
      for (const y of ys) legPts.push(sample(y));
      const rings = legPts.map((P, i) => {
        const nxt = legPts[Math.min(i + 1, legPts.length - 1)].c, prv = legPts[Math.max(i - 1, 0)].c;
        const f = frame(prv.clone().sub(nxt), V(0, 0, 1));
        return { c: P.c, a: f.a, b: f.b, ra: P.r * 1.04, rb: P.r, n: 2.1, y: P.c.y,
          r: (th) => 1 + 0.035 * noise1(th * 3 + i, s * 5 + 2) * (tr.tile === 'linen' ? 2 : 1) };
      });
      const joints = [{ name: 'thigh' + S, s: L.knee.y + 0.0 }, { name: 'shin' + S, s: L.knee.y }];
      tube(mb, {
        rings, seg: 10, mat: tm,
        color: (ri, th) => {
          const c = tm.color.clone();
          if (tr.wrapped) c.multiplyScalar(0.85 + 0.15 * Math.sin(ri * 3.1 + th * 2));
          if (Math.abs(rings[ri].y - L.knee.y) < 0.03 * k && Math.cos(th) < -0.3) c.multiplyScalar(0.82);
          return c;
        },
        weights: (ri, th, p) => {
          const y = rings[ri].y;
          if (y > M.hipJY - 0.03 * k) {
            const t = smoothstep(M.hipJY - 0.03 * k, M.hipJY + 0.06 * k, y);
            return [['thigh' + S, 1 - t * 0.6], ['hips', t * 0.6]];
          }
          const b = 0.04 * k;
          if (y > L.knee.y + b) return [['thigh' + S, 1]];
          if (y > L.knee.y - b) { const t = smoothstep(L.knee.y + b, L.knee.y - b, y); return [['thigh' + S, 1 - t], ['shin' + S, t]]; }
          void joints; void p;
          return [['shin' + S, 1]];
        },
      });
    }
    buildBoot(ctx, s, S, L, boots, bootTop);
  }
}

function buildBoot(ctx, s, S, L, boots, bootTop) {
  const { mb, M, k } = ctx;
  const bm = garmentMat({ color: boots.color || '#3b2e25', tile: boots.tile || 'leather', tileU: 3, tileV: 6, rough: boots.rough });
  const sole = col(boots.sole || '#241a14');
  // shaft: from boot top down to the ankle
  const rings = [];
  const n = 5;
  const topR = M.calfR * (boots.wide ?? 1.18) + 0.006;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = lerp(bootTop, M.ankleY + 0.02 * k, t);
    const tk = (y - L.ankle.y) / (L.knee.y - L.ankle.y);
    const c = L.ankle.clone().lerp(L.knee, tk);
    const r = lerp(topR, M.calfR * 0.78 + 0.005, smoothstep(0, 1, t));
    rings.push({ c, a: V(0, 0, 1), b: V(1, 0, 0), ra: r * 1.02, rb: r, y,
      r: (th) => 1 + (boots.wrapped ? 0.04 * Math.sin(th * 2 + i * 2.2) : 0.015 * noise1(th * 4 + i, s)) });
  }
  tube(mb, {
    rings, seg: 12, mat: bm,
    color: (ri, th) => {
      const c = bm.color.clone();
      if (ri === 0) c.multiplyScalar(0.8);
      if (boots.wrapped && (ri % 2 === 1)) c.multiplyScalar(0.78);
      return c.multiplyScalar(0.9 + 0.1 * Math.cos(th));
    },
    weights: (ri) => {
      const y = rings[ri].y;
      const t = smoothstep(M.ankleY + 0.07 * k, M.ankleY + 0.01 * k, y);
      return [['shin' + S, 1 - t], ['foot' + S, t]];
    },
    inner: { inset: 0.004, color: bm.color.clone().multiplyScalar(0.3), hem: false },
  });
  // foot: heel to toe along +Z, sole flat on the ground
  const fx = L.ankle.x;
  const fz = (z) => z * (M.footLen / (0.152 * 1.76));
  const prof = [
    // z, half width, top height, bottom height
    [fz(-0.055), 0.026, 0.065, 0.004],
    [fz(-0.035), 0.033, 0.095, 0.0],
    [fz(0.0), 0.035, 0.105, 0.0],
    [fz(0.05), 0.04, 0.075, 0.0],
    [fz(0.11), 0.045, 0.052, 0.0],
    [fz(0.155), 0.043, 0.044, 0.002],
    [fz(0.19), 0.033, 0.036, 0.006],
    [fz(0.212), 0.015, 0.028, 0.012],
  ];
  const sc = M.k;
  const frings = prof.map(([z, w, top, bot]) => {
    const yc = ((top + bot) / 2) * sc;
    return { c: V(fx + s * 0.004 * sc, yc, L.ankle.z + z * sc * 1.0), a: V(0, 1, 0), b: V(-1, 0, 0), ra: ((top - bot) / 2) * sc, rb: w * sc * (boots.wide ?? 1), n: 3.2, z };
  });
  // right-handed: a x b should be +Z (forward); (0,1,0) x (-1,0,0) = (0,0,1)
  tube(mb, {
    rings: frings, seg: 12, mat: bm, capStart: true, capEnd: true,
    color: (ri, th) => (Math.cos(th) < -0.82 ? sole : bm.color.clone().multiplyScalar(0.85 + 0.15 * Math.max(0, Math.cos(th)))),
    weights: (ri) => {
      const z = prof[ri][0];
      if (z > fz(0.13)) return [['toe' + S, 1]];
      if (z > fz(0.1)) return [['foot' + S, 0.5], ['toe' + S, 0.5]];
      return [['foot' + S, 1]];
    },
  });
}

// Coat skirt (split front and back vent) or dress / skirt, on the skirt spring chains.
function buildSkirts(ctx) {
  const { mb, M, k, O, rig, shape } = ctx;
  const chains = rig.chains.filter((c) => c.kind === 'skirt');
  const n = chains.length;
  const top = ctx.waistY;
  const pieces = [];
  if (O.coat && O.coat.length > 0.25) pieces.push({ g: O.coat, open: O.coat.open ?? 0.35, vent: O.coat.vent ?? 0.08, off: thick(O.coat) + 0.004 });
  if (O.dress && O.dress.length > 0.25 && !O.coat) pieces.push({ g: O.dress, open: 0, vent: 0, off: thick(O.dress) });
  if (O.skirt && !O.coat) pieces.push({ g: O.skirt, open: 0, vent: 0, off: thick(O.skirt) + 0.004 });
  if (O.apron) pieces.push({ g: O.apron, apron: true, off: (pieces.length ? pieces[pieces.length - 1].off : 0.01) + 0.006 });
  const skirtTop = rig.world[`skirt0_0`] ? rig.world['skirt0_0'].y : M.hipJY + 0.03 * k;
  for (const P of pieces) {
    const g = P.g;
    const len = g.length;
    const hem = Math.max(0.03, skirtTop * (1 - len));
    if (!P.apron) ctx.hemY = Math.min(ctx.hemY ?? 9, hem);
    const gm = garmentMat(g);
    const flare = g.flare ?? (P.g === O.coat ? 0.3 : 0.38);
    const nr = 9;
    const ys = [];
    for (let i = 0; i <= nr; i++) ys.push(lerp(P.apron ? top - 0.01 : top, P.apron ? lerp(top, hem, 1) : hem, i / nr));
    const ringAt = (y) => {
      const s = shape.at(Math.max(y, M.hipJY - 0.085 * k));
      const below = Math.max(0, M.hipJY - y);
      const grow = below * flare;
      const hipBulge = smoothstep(top, M.hipJY, y);
      const w = Math.max(s.w, lerp(s.w, M.hipW, hipBulge)) + P.off + grow;
      const d = Math.max(s.d, lerp(s.d, M.hipD, hipBulge)) + P.off + grow * 0.85;
      return { c: V(0, y, s.z * (1 - smoothstep(top, hem, y))), a: V(0, 0, 1), b: V(1, 0, 0), ra: d, rb: w, n: 2.15 };
    };
    const wts = (p, th, y) => {
      if (!n) return torsoWeights(ctx, p);
      // angle -> neighbouring chains; height -> hips / joint0 / joint1
      let a = th / TAU * n;
      a = ((a % n) + n) % n;
      const i0 = Math.floor(a), i1 = (i0 + 1) % n, f = a - i0;
      const c0 = chains[i0], c1 = chains[i1];
      const yj0 = rig.world[c0.joints[0]].y, yj1 = rig.world[c0.joints[1]].y;
      const out = [];
      const hipW = smoothstep(yj0 - 0.02 * k, yj0 + 0.05 * k, y);
      const j1 = smoothstep(yj1 + 0.08 * k, yj1 - 0.04 * k, y);
      const rest = 1 - hipW;
      out.push(['hips', hipW]);
      out.push([c0.joints[0], rest * (1 - j1) * (1 - f)], [c1.joints[0], rest * (1 - j1) * f]);
      out.push([c0.joints[1], rest * j1 * (1 - f)], [c1.joints[1], rest * j1 * f]);
      return out;
    };
    const folds = (th, y) => {
      const t = smoothstep(top, hem, y);
      return 1 + t * (0.05 * Math.sin(th * (g.pleats ?? 9) + noise1(y * 6, 3) * 2) + 0.03 * noise1(th * 5 + y * 3, 7));
    };
    const panels = [];
    if (P.apron) {
      panels.push({ a0: () => -0.95, a1: () => 0.95 });
    } else if (P.open > 0 || P.vent > 0) {
      const gF = (y) => 0.025 + P.open * smoothstep(M.hipJY + 0.02 * k, hem, y);
      const gB = (y) => (P.vent > 0 ? 0.01 + P.vent * smoothstep(M.hipJY - 0.12 * k, hem, y) : 0);
      panels.push({ a0: (y) => gF(y), a1: (y) => Math.PI - gB(y) });
      panels.push({ a0: (y) => Math.PI + gB(y), a1: (y) => TAU - gF(y) });
    } else {
      panels.push({ a0: () => 0, a1: () => TAU, closed: true });
    }
    for (const pan of panels) {
      const rings = ys.map((y) => {
        const r = ringAt(y);
        r.th0 = pan.a0(y);
        r.th1 = pan.a1(y);
        r.r = (th) => folds(th, y);
        r.y = y;
        return r;
      });
      const hemBand = g.emb !== undefined ? g.emb : null;
      tube(mb, {
        rings, seg: pan.closed ? 24 : P.apron ? 10 : 12, mat: gm, open: !pan.closed,
        color: (ri, th) => {
          const c = gm.color.clone();
          const t = ri / nr;
          c.multiplyScalar(1 - 0.12 * t * (g.dirty ?? 0.6));
          if (Math.abs(Math.sin(th * (g.pleats ?? 9) * 0.5)) < 0.2 && t > 0.3) c.multiplyScalar(0.9);
          return c;
        },
        weights: (ri, th, p) => wts(p, th, rings[ri].y),
        inner: { inset: 0.004, color: col(g.lining || g.color).multiplyScalar(g.lining ? 1 : 0.5), mat: garmentMat({ color: g.lining || g.color, tile: g.liningTile || g.tile || 'wool' }), sides: !pan.closed },
      });
      if (hemBand !== null) {
        // embroidered hem band: thin ring just outside the hem
        const bh = (g.embH ?? 0.045) * k;
        const brings = [hem + bh, hem + 0.002].map((y) => {
          const r = ringAt(y);
          r.th0 = pan.a0(y); r.th1 = pan.a1(y);
          r.ra += 0.0018; r.rb += 0.0018;
          r.r = (th) => folds(th, y);
          r.y = y;
          return r;
        });
        const emat = { ...gm, tile: TILE.emb(hemBand), tileU: Math.round((g.embRepeat ?? 14) * k), tileV: 1 / bh, fuzz: 0.1 };
        tube(mb, { rings: brings, seg: pan.closed ? 24 : 12, mat: emat, open: true, th0: 0, th1: 1,
          weights: (ri, th, p) => wts(p, th, brings[ri].y) });
      }
    }
  }
}
