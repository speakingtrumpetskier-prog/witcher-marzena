// Gear and outer accessories merged into the character mesh: fur and sheepskin collars, hoods
// (down), shawls, capes and mantles (on cape chains), belts with buckles and pouches, the
// hunter's harness, two crossed swords on the back (hilts on sheath bones so they can be
// hidden when drawn), the lynx medallion with its red-thread knot, and simple carried items.
// Also exports makeSword() for the drawn blade attached to a hand.
import * as THREE from 'three';
import { M as mat, tube, blob, ribbon, frame, SPECIAL } from './geom.js';
import { garmentMat, torsoWeights } from './body.js';
import { col, lerp, smoothstep, noise1 } from './util.js';
import { TILE } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export function buildGear(ctx) {
  const O = ctx.O;
  if (O.collar) buildCollar(ctx, O.collar);
  if (O.hood) buildHoodDown(ctx, O.hood);
  if (O.shawl) buildShawl(ctx, O.shawl);
  if (O.cape) buildCape(ctx, O.cape);
  if (O.belt) buildBelt(ctx, O.belt);
  if (O.harness) buildHarness(ctx, O.harness);
  if (O.swords) buildSwords(ctx);
  if (O.medallion) buildMedallion(ctx, O.medallion);
  if (O.pouch) buildPouch(ctx, O.pouch);
}

// Point on the outer torso surface at height y and angle th, pushed out by off.
function surf(ctx, y, th, off) {
  const s = ctx.shape.at(y);
  const t0 = ctx.torsoG.thick ?? (ctx.torsoG.tile === 'fleece' ? 0.028 : ctx.torsoG.tile === 'linen' ? 0.006 : 0.016);
  const ex = 2 / s.n;
  const c = Math.cos(th), sn = Math.sin(th);
  const z = Math.sign(c) * Math.pow(Math.abs(c), ex) * (s.d + t0 + off);
  const x = Math.sign(sn) * Math.pow(Math.abs(sn), ex) * (s.w + t0 + off);
  return V(x, y, s.z + z);
}

// Shawl collar of fleece or fur: stands up around the back of the neck and lies as lapels down
// the front in a V. Built as a flat band (wide across, thin through) following the neckline.
function buildCollar(ctx, c) {
  const { mb, M, k } = ctx;
  const gm = garmentMat({ color: c.color || '#d9ccb0', tile: c.tile || 'fleece', tileU: 8, tileV: 10, fuzz: 0.8 });
  const nP = 26;
  const vDepth = (c.v ?? 0.12) * k;
  const half = (c.size ?? 0.034) * k * 1.25;
  const thk = (c.size ?? 0.034) * k * 0.45;
  const pts = [];
  for (let i = 0; i <= nP; i++) {
    const th = (i / nP) * TAU;
    const front = Math.max(0, Math.cos(th));
    const y = lerp(ctx.shape.yN + 0.004 * k, ctx.shape.yN - vDepth, Math.pow(front, 3));
    pts.push({ p: surf(ctx, y, th * (1 - 0.18 * front), 0.004), th, front });
  }
  const rings = pts.map(({ p, th, front }, i) => {
    const prev = pts[(i - 1 + nP) % nP].p, next = pts[(i + 1) % nP].p;
    const t = next.clone().sub(prev).normalize();
    const out = V(p.x, 0, p.z - ctx.shape.at(p.y).z).normalize();
    // band direction: up the neck at the back, down-and-out over the chest at the front
    const back = smoothstep(0.2, -0.6, Math.cos(th));
    const across = V(0, 1, 0).multiplyScalar(back).add(out.clone().multiplyScalar(0.55).add(V(0, -0.8, 0)).multiplyScalar(1 - back)).normalize();
    const nrm = new THREE.Vector3().crossVectors(t, across).normalize();
    if (nrm.dot(out) < 0) nrm.multiplyScalar(-1);
    const f = frame(t, nrm);
    const center = p.clone().addScaledVector(across, half * (back > 0.5 ? 0.85 : 0.75)).addScaledVector(nrm, thk * 0.9 + 0.004);
    return { c: center, a: f.a, b: f.b, ra: thk * (1 + 0.3 * back), rb: half * (1 - front * 0.25), n: 2.6, th };
  });
  rings[rings.length - 1] = { ...rings[0] };
  tube(mb, {
    rings, seg: 10, mat: gm,
    color: (ri, th) => gm.color.clone().multiplyScalar(0.8 + 0.2 * Math.max(0, Math.cos(th)) + 0.05 * noise1(ri * 1.7, 2)),
    weights: (ri, th, p) => {
      const back = Math.max(0, -Math.cos(rings[ri].th));
      return [['chest', 0.75 - back * 0.35], ['neck', 0.25 + back * 0.35]].concat(p.x > 0.07 * k ? [['shoulderL', 0.12]] : p.x < -0.07 * k ? [['shoulderR', 0.12]] : []);
    },
  });
  void M;
}

// A hood worn down: a soft bundle of cloth at the nape with a fur rim.
function buildHoodDown(ctx, h) {
  const { mb, M, k, W } = ctx;
  const gm = garmentMat({ color: h.color || ctx.torsoG.color, tile: h.tile || 'wool' });
  const c = V(0, ctx.shape.yN - 0.025 * k, W.neck.z - M.chestD * 0.95 - 0.02 * k);
  blob(mb, c, { x: 0.105 * k, y: 0.07 * k, z: 0.05 * k }, gm, [['chest', 0.75], ['neck', 0.25]], 12, 7, null,
    (th) => 1 + 0.08 * Math.sin(th * 5));
  if (h.fur) {
    const fm = garmentMat({ color: h.fur, tile: 'fur', fuzz: 0.9, tileU: 4, tileV: 6 });
    blob(mb, c.clone().add(V(0, 0.035 * k, -0.01 * k)), { x: 0.1 * k, y: 0.03 * k, z: 0.045 * k }, fm, [['chest', 0.6], ['neck', 0.4]], 12, 5);
  }
}

// Shawl over the shoulders: a lathe band from the neck to a point at the back, covering the
// upper arms at the sides; ends crossed at the chest.
function buildShawl(ctx, sh) {
  const { mb, M, k } = ctx;
  const gm = garmentMat({ color: sh.color || '#3a3230', tile: sh.tile || 'wool', fuzz: 0.5 });
  const nr = 7;
  const rings = [];
  const yTop = ctx.shape.yN - 0.01 * k;
  for (let i = 0; i <= nr; i++) {
    const t = i / nr;
    const y = lerp(yTop, M.chestY - 0.13 * k, t);
    const s = ctx.shape.at(Math.max(y, M.chestY - 0.02 * k));
    const widen = smoothstep(0.0, 0.5, t);
    const w = Math.max(s.w, M.shoulderX + M.armR * 1.6 * widen) + 0.03 * k;
    const d = s.d + 0.03 * k + 0.012 * k * t;
    rings.push({ c: V(0, y, s.z - 0.004 * k), a: V(0, 0, 1), b: V(1, 0, 0), ra: d, rb: w, n: 2.4, y, t });
  }
  // the hem: lower at the back point and front ends, higher over the arms
  const hemAt = (th) => {
    const back = Math.pow(Math.max(0, -Math.cos(th)), 3);
    const front = Math.pow(Math.max(0, Math.cos(th)), 4);
    return lerp(0.55, 1.0, Math.max(back, front * 0.8));
  };
  tube(mb, {
    rings, seg: 22, mat: gm,
    r: undefined,
    color: (ri, th) => gm.color.clone().multiplyScalar(0.88 + 0.12 * noise1(th * 6 + ri, 4)),
    weights: (ri, th, p) => {
      const ax = Math.abs(p.x), S = p.x >= 0 ? 'L' : 'R';
      const army = smoothstep(M.shoulderX * 0.9, M.shoulderX * 1.3, ax) * smoothstep(0.2, 0.7, rings[ri].t) * 0.6;
      return [['chest', 0.85 - army], ['shoulder' + S, 0.15], ['arm' + S, army]];
    },
    inner: { inset: 0.004, color: gm.color.clone().multiplyScalar(0.5) },
  });
  // trim the hem shape by collapsing rows above the hem curve: done by vertex shading only
  // (a cheap fringe band reads the edge).
  void hemAt;
  if (sh.fringe !== false) {
    const last = rings[rings.length - 1];
    const fr = [last, { ...last, c: last.c.clone().add(V(0, -0.03 * k, 0)), ra: last.ra + 0.006, rb: last.rb + 0.006 }];
    tube(mb, { rings: fr, seg: 22, mat: { ...gm, tile: TILE.emb(7), tileU: 30, tileV: 1 / (0.03 * k) }, open: true, th0: 0, th1: TAU,
      weights: (ri, th, p) => { const S = p.x >= 0 ? 'L' : 'R'; return [['chest', 0.7], ['arm' + S, 0.3]]; } });
  }
}

// Mantle / cape from the shoulders down the back on the cape chains (Bogdan's bear fur).
function buildCape(ctx, cp) {
  const { mb, M, k, rig } = ctx;
  const gm = garmentMat({ color: cp.color || '#3b2e25', tile: cp.tile || 'fur', fuzz: 0.85, tileU: 5, tileV: 4 });
  const chains = rig.chains.filter((c) => c.kind === 'cape');
  const len = cp.length * M.H * 0.55;
  const nr = 8;
  const rings = [];
  const yTop = ctx.shape.yN - 0.005 * k;
  for (let i = 0; i <= nr; i++) {
    const t = i / nr;
    const y = yTop - len * t;
    const s = ctx.shape.at(Math.max(y, M.hipJY - 0.08 * k));
    const shoulderPad = smoothstep(0.0, 0.25, t);
    const w = Math.max(s.w * 1.05, (M.shoulderX + M.armR * 1.3) * shoulderPad) + 0.035 * k + t * 0.06 * k;
    const d = Math.max(s.d, M.chestD) + 0.035 * k + t * 0.03 * k;
    rings.push({ c: V(0, y, s.z - 0.01 * k), a: V(0, 0, 1), b: V(1, 0, 0), ra: d, rb: w, n: 2.3, y, t,
      th0: lerp(0.35, 1.25, smoothstep(0.05, 0.5, t)), th1: TAU - lerp(0.35, 1.25, smoothstep(0.05, 0.5, t)) });
  }
  const n = chains.length;
  tube(mb, {
    rings, seg: 18, mat: gm, open: true, th0: 0.5, th1: TAU - 0.5,
    r: undefined,
    color: (ri, th) => gm.color.clone().multiplyScalar(0.85 + 0.2 * noise1(th * 4 + ri * 0.7, 9)),
    weights: (ri, th, p) => {
      const t = rings[ri].t;
      if (!n || t < 0.2) {
        const S = p.x >= 0 ? 'L' : 'R';
        const arm = smoothstep(M.shoulderX * 0.9, M.shoulderX * 1.25, Math.abs(p.x)) * 0.5;
        return [['chest', 1 - arm], ['shoulder' + S, arm]];
      }
      // map x across the back to the chain columns
      const u = (p.x / (rings[ri].rb) + 1) / 2 * (n - 1);
      const i0 = Math.max(0, Math.min(n - 1, Math.floor(u))), i1 = Math.min(n - 1, i0 + 1), f = Math.max(0, Math.min(1, u - i0));
      const j1 = smoothstep(0.45, 0.75, t);
      const top = smoothstep(0.35, 0.2, t);
      const r = 1 - top;
      return [['chest', top], [chains[i0].joints[0], r * (1 - j1) * (1 - f)], [chains[i1].joints[0], r * (1 - j1) * f],
        [chains[i0].joints[1], r * j1 * (1 - f)], [chains[i1].joints[1], r * j1 * f]];
    },
    inner: { inset: 0.008, color: col(cp.lining || '#2a211b') },
  });
}

function buildBelt(ctx, b) {
  const { mb, M, k } = ctx;
  const bm = garmentMat({ color: b.color || '#4a3426', tile: b.tile || 'leather', tileU: 10, tileV: 20, rough: 0.6 });
  const y = b.y ?? ctx.waistY + 0.005 * k;
  const h = (b.h ?? 0.04) * k;
  const rings = [y + h / 2, y - h / 2].map((yy) => {
    const s = ctx.shape.at(yy);
    const t0 = ctx.torsoG.thick ?? (ctx.torsoG.tile === 'fleece' ? 0.028 : ctx.torsoG.tile === 'linen' ? 0.006 : 0.016);
    return { c: V(0, yy, s.z), a: V(0, 0, 1), b: V(1, 0, 0), ra: s.d + t0 + 0.003, rb: s.w + t0 + 0.003, n: s.n };
  });
  if (b.sash) {
    rings[0].ra += 0.004; rings[0].rb += 0.004;
  }
  tube(mb, { rings, seg: 20, mat: b.sash ? { ...bm, tile: TILE.emb(b.emb ?? 4), tileU: 12, tileV: 1 / h } : bm, open: true, th0: 0, th1: TAU,
    weights: (ri, th, p) => torsoWeights(ctx, p), inner: { inset: 0.004, hem: false } });
  if (b.buckle !== false && !b.sash) {
    const front = surf(ctx, y, 0, 0.006);
    const mm = mat(col(b.metal || '#8a8478'), { tile: 'metal', rough: 0.35, special: SPECIAL.metal, tileU: 1, tileV: 1 });
    blob(mb, front, { x: 0.022 * k, y: 0.026 * k, z: 0.006 * k }, mm, [['hips', 0.6], ['spine', 0.4]], 6, 4, null, (th) => 1 + 0.25 * Math.abs(Math.sin(th * 2)));
  }
  void M;
}

// Diagonal leather straps across the chest (the sword harness).
function buildHarness(ctx, h) {
  const { mb, M, k } = ctx;
  const bm = garmentMat({ color: h.color || '#3a2a20', tile: 'leather', tileU: 1, tileV: 14, rough: 0.55 });
  for (const s of [1, -1]) {
    const pts = [], sides = [], widths = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // from the top of one shoulder (back) over the front down to the opposite hip, and around the back
      const y = lerp(M.shoulderY + 0.02 * k, ctx.waistY + 0.02 * k, t);
      const th = lerp(s * 1.05, -s * 1.5, t) ;
      const p = surf(ctx, y, th, 0.006 + (t < 0.15 ? 0.008 : 0));
      pts.push(p);
      widths.push(0.034 * k);
    }
    for (let i = 0; i <= n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
      const t = b.clone().sub(a).normalize();
      const out = V(pts[i].x, 0, pts[i].z).normalize();
      sides.push(new THREE.Vector3().crossVectors(out, t).normalize());
    }
    ribbon(mb, pts, sides, widths, bm, (i, p) => torsoWeights(ctx, p), { flip: s < 0 });
    // brass ring at the crossing
  }
  const mm = mat(col('#9a8358'), { tile: 'metal', rough: 0.35, special: SPECIAL.metal, tileU: 1, tileV: 1 });
  blob(mb, surf(ctx, M.chestY - 0.03 * k, 0, 0.012), { x: 0.014 * k, y: 0.014 * k, z: 0.006 * k }, mm, [['chest', 1]], 8, 4);
}

// Two swords crossed on the back: scabbards on the chest bone, hilts on sheathA / sheathB.
function buildSwords(ctx) {
  const { mb, M, k } = ctx;
  const back = M.chestD + (ctx.torsoG.tile === 'fleece' ? 0.03 : 0.018) + 0.016 * k;
  const scab = garmentMat({ color: '#2a201a', tile: 'leather', tileU: 2, tileV: 6, rough: 0.5 });
  const fit = mat(col('#8c867a'), { tile: 'metal', rough: 0.35, special: SPECIAL.metal, tileU: 1, tileV: 4 });
  const silv = mat(col('#b8bcc0'), { tile: 'metal', rough: 0.25, special: SPECIAL.metal, tileU: 1, tileV: 4 });
  const grip = garmentMat({ color: '#3a2a1e', tile: 'leather', tileU: 1, tileV: 30, rough: 0.6 });
  const swords = [
    { from: V(-0.14 * k, M.shoulderY + 0.13 * k, 0), to: V(0.2 * k, M.hipJY - 0.1 * k, 0), bone: 'sheathA', metal: fit, z: 0 },
    { from: V(0.11 * k, M.shoulderY + 0.16 * k, 0), to: V(-0.22 * k, M.hipJY - 0.08 * k, 0), bone: 'sheathB', metal: silv, z: -0.026 * k },
  ];
  for (const sw of swords) {
    const zAt = (y) => ctx.shape.at(Math.min(Math.max(y, M.hipJY), ctx.shape.yN)).z - back + sw.z - 0.03 * k * smoothstep(M.chestY, M.hipJY, y);
    sw.from.z = zAt(Math.min(sw.from.y, M.shoulderY)) + 0.01 * k; sw.to.z = zAt(sw.to.y);
    const dir = sw.to.clone().sub(sw.from).normalize();
    const f = frame(dir, V(0, 0, -1));
    const mouth = sw.from.clone().addScaledVector(dir, 0.22 * k);
    // scabbard: flattened tube from the mouth to the tip
    const rings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const c = mouth.clone().lerp(sw.to, t);
      rings.push({ c, a: f.a, b: f.b, ra: 0.012 * k * (1 - t * 0.35), rb: 0.026 * k * (1 - t * 0.45), n: 3 });
    }
    tube(mb, { rings, seg: 8, mat: scab, capEnd: true, capStart: true, weights: () => [['chest', 1]],
      color: (ri) => scab.color.clone().multiplyScalar(ri === 0 ? 1.4 : 1) });
    // scabbard throat fitting
    blob(mb, mouth.clone().addScaledVector(dir, 0.012 * k), { x: 0.03 * k, y: 0.016 * k, z: 0.018 * k }, sw.metal, [['chest', 1]], 8, 4);
    // hilt: guard, grip, pommel on the sheath bone
    const hb = [[sw.bone, 1]];
    const guardC = mouth.clone().addScaledVector(dir, -0.008 * k);
    const gside = f.b.clone();
    const gr = [];
    for (let i = 0; i <= 1; i++) gr.push({ c: guardC.clone().addScaledVector(gside, (i - 0.5) * 0.17 * k), a: dir.clone(), b: f.a.clone(), ra: 0.009 * k, rb: 0.008 * k });
    const gt = gr[1].c.clone().sub(gr[0].c).normalize();
    const gf = frame(gt, dir);
    gr.forEach((r) => { r.a = gf.a; r.b = gf.b; });
    tube(mb, { rings: gr, seg: 6, mat: sw.metal, capStart: true, capEnd: true, weights: () => hb });
    const gripRings = [];
    for (let i = 0; i <= 3; i++) {
      const c = guardC.clone().addScaledVector(dir, -(0.012 + i * 0.065) * k);
      gripRings.push({ c, a: f.a, b: f.b, ra: 0.0145 * k, rb: 0.0155 * k });
    }
    tube(mb, { rings: gripRings, seg: 8, mat: grip, weights: () => hb });
    blob(mb, guardC.clone().addScaledVector(dir, -0.22 * k), { x: 0.02 * k, y: 0.02 * k, z: 0.02 * k }, sw.metal, hb, 8, 5);
  }
}

function buildMedallion(ctx, m) {
  const { mb, M, k } = ctx;
  const silver = mat(col('#a9acad'), { tile: 'metal', rough: 0.3, special: SPECIAL.metal, tileU: 1, tileV: 1 });
  const chain = mat(col('#77786f'), { tile: 'metal', rough: 0.4, special: SPECIAL.metal, tileU: 1, tileV: 40 });
  const yMed = M.chestY + 0.05 * k;
  const center = surf(ctx, yMed, 0, 0.012);
  const w = [['chest', 1]];
  // chain: from both sides of the neck down to the medallion
  for (const s of [1, -1]) {
    const pts = [], sides = [], widths = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = lerp(ctx.shape.yN + 0.004 * k, yMed + 0.022 * k, t);
      const th = lerp(s * 1.2, s * 0.08, Math.pow(t, 0.7));
      const p = surf(ctx, y, th, 0.006 + 0.012 * t);
      if (i === 6) p.copy(center).add(V(s * 0.006 * k, 0.022 * k, 0.002));
      pts.push(p);
      widths.push(0.004 * k);
    }
    for (let i = 0; i <= 6; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(6, i + 1)];
      const t = b.clone().sub(a).normalize();
      sides.push(new THREE.Vector3().crossVectors(V(0, 0, 1), t).normalize().multiplyScalar(s));
    }
    ribbon(mb, pts, sides, widths, chain, () => [['chest', 0.8], ['neck', 0.2]], { double: true });
  }
  // lynx head: disc with ears, cheek ruffs and eye dots
  const disc = [];
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    disc.push({ c: center.clone().add(V(0, 0, (t - 0.5) * 0.006 * k)), a: V(0, 1, 0), b: V(-1, 0, 0), ra: 0.024 * k * (i === 1 ? 1 : 0.92), rb: 0.022 * k * (i === 1 ? 1 : 0.92) });
  }
  // a x b = (0,1,0)x(-1,0,0) = (0,0,1): forward
  tube(mb, { rings: disc, seg: 14, mat: silver, capStart: true, capEnd: true, weights: () => w,
    r: undefined, color: () => silver.color.clone() });
  for (const s of [1, -1]) {
    blob(mb, center.clone().add(V(s * 0.013 * k, 0.024 * k, 0.002)), { x: 0.006 * k, y: 0.011 * k, z: 0.003 * k }, silver, w, 6, 4);
    blob(mb, center.clone().add(V(s * 0.008 * k, 0.005 * k, 0.0045 * k)), { x: 0.0035 * k, y: 0.0022 * k, z: 0.0015 * k }, mat(col('#3a2c22'), { tile: 'metal', rough: 0.4 }), w, 5, 3);
  }
  blob(mb, center.clone().add(V(0, -0.006 * k, 0.005 * k)), { x: 0.005 * k, y: 0.0045 * k, z: 0.003 * k }, silver, w, 5, 3);
  if (m.knot) {
    const red = mat(col('#9a2e22'), { tile: 'wool', rough: 0.9, fuzz: 0.6, tileU: 1, tileV: 3 });
    const kp = center.clone().add(V(0.012 * k, 0.034 * k, 0.003));
    blob(mb, kp, { x: 0.0065 * k, y: 0.005 * k, z: 0.004 * k }, red, w, 6, 4);
    blob(mb, kp.clone().add(V(0.004 * k, -0.009 * k, 0)), { x: 0.0022 * k, y: 0.008 * k, z: 0.002 * k }, red, w, 5, 3);
    blob(mb, kp.clone().add(V(-0.004 * k, -0.008 * k, 0)), { x: 0.0022 * k, y: 0.007 * k, z: 0.002 * k }, red, w, 5, 3);
  }
}

function buildPouch(ctx, p) {
  const { mb, M, k } = ctx;
  const pm = garmentMat({ color: p.color || '#5a4030', tile: 'leather', tileU: 2, tileV: 2 });
  for (const s of (p.sides || [1])) {
    const c = surf(ctx, ctx.waistY - 0.05 * k, s * 1.15, 0.03);
    blob(mb, c, { x: 0.05 * k, y: 0.06 * k, z: 0.03 * k }, pm, [['hips', 1]], 8, 5, null, (th) => 1 + 0.15 * Math.abs(Math.cos(th)));
  }
  void M;
}

// The drawn sword: a separate small mesh (blade, guard, grip, pommel) to attach to a hand.
// Grip origin at the hand; blade along +Y of the returned object.
let swordCache = {};
export function makeSword(kind = 'steel') {
  if (!swordCache[kind]) {
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: kind === 'silver' ? 0xc8ccd0 : 0x9a9c9e, metalness: 0.9, roughness: kind === 'silver' ? 0.22 : 0.32 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.7 });
    const fitMat = new THREE.MeshStandardMaterial({ color: kind === 'silver' ? 0xb0b4b8 : 0x6e6a62, metalness: 0.8, roughness: 0.4 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.022, 0); shape.lineTo(0.022, 0); shape.lineTo(0.019, 0.82); shape.lineTo(0, 0.9); shape.lineTo(-0.019, 0.82); shape.closePath();
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    bg.translate(0, 0.07, -0.003);
    const blade = new THREE.Mesh(bg, bladeMat);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.016, 0.022), fitMat);
    guard.position.y = 0.065;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.2, 8), darkMat);
    grip.position.y = -0.04;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), fitMat);
    pommel.position.y = -0.15;
    g.add(blade, guard, grip, pommel);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    swordCache[kind] = g;
  }
  return swordCache[kind].clone();
}
