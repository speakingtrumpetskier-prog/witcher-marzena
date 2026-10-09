// Hair volume pieces, beards and headwear, built on the sculpted skull (head.js info).
//
// Scalp hair itself is part of the head grid (displaced and painted). Here: braids (three
// helical strands on the braid spring chain), pigtails (tail chains), buns, the ghost's long
// floating strands (aFloat), beards (shell over the jaw with a mask; full beards hang),
// hats (fur, knit cap with rolled brim, felt cap), headscarves (tied under the chin or at the
// nape), hoods up, and Wiesia's crown of frozen straw.
import * as THREE from 'three';
import { M as mat, tube, blob, ribbon, chainWeights, frame } from './geom.js';
import { col, lerp, smoothstep, rng, noise1, clamp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export function buildHair(mb, rig, look, info) {
  const h = look.hair || {};
  const ctx = { mb, rig, look, info, M: rig.M, k: rig.M.k, sc: info.scale, pivot: info.pivot, R: rng((look.seed || 1) * 13 + 5) };
  const hairMat = mat(col(h.color || '#4a3a2c'), { tile: 'hair', rough: 0.55, fuzz: 0.45, tileU: 3, tileV: 14 });
  ctx.hairMat = hairMat;
  if (h.braid || h.style === 'braid') buildBraid(ctx, h);
  if (h.style === 'pigtails') buildPigtails(ctx, h);
  if (h.style === 'bun' || h.bun) buildBun(ctx, h);
  if (h.style === 'float') buildFloatHair(ctx, h);
  if (h.style === 'long' || h.long) buildBackHair(ctx, h);
  const b = look.beard;
  if (b && b.style !== 'none') buildBeard(ctx, b);
  const hat = look.hat;
  if (hat) {
    if (hat.type === 'fur') buildFurHat(ctx, hat);
    else if (hat.type === 'knit') buildCap(ctx, hat, true);
    else if (hat.type === 'felt') buildCap(ctx, hat, false);
    else if (hat.type === 'scarf') buildScarf(ctx, hat, 'chin');
    else if (hat.type === 'kerchief') buildScarf(ctx, hat, 'nape');
    else if (hat.type === 'hood') buildScarf(ctx, hat, 'hood');
    else if (hat.type === 'crown') buildCrown(ctx, hat);
  }
}

const toW = (ctx, p) => p.clone().multiplyScalar(ctx.sc).add(ctx.pivot);
const dirOf = (az, pol) => V(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));

// Shell over the skull above an edge: pol in [0, edge(az)] around the cast origin.
function topShell(ctx, o) {
  const { mb, info } = ctx;
  const nAz = o.nAz || 24, nPol = o.nPol || 10;
  const rows = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= nPol; i++) {
    const row = [];
    for (let j = 0; j <= nAz; j++) {
      const az = -Math.PI + (j / nAz) * TAU;
      const pe = o.edge(az);
      const pol = pe * Math.pow(i / nPol, 0.85);
      const p = info.cast(dirOf(az, pol));
      info.grad(p, n);
      const t = o.thick(p, az, pol, i / nPol);
      const q = p.clone().addScaledVector(n, t);
      if (o.post) o.post(q, p, n, az, i / nPol);
      const c = o.color ? o.color(i, j, q) : o.mat.color;
      row.push(mb.vert(toW(ctx, q), c, (j / nAz) * o.mat.tileU, (i / nPol) * o.mat.tileV * 0.2, o.mat, o.weights ? o.weights(q) : [['head', 1]]));
    }
    rows.push(row);
  }
  for (let i = 0; i < nPol; i++) for (let j = 0; j < nAz; j++) {
    mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  }
  return rows;
}

function buildBraid(ctx, h) {
  const { mb, rig, k } = ctx;
  const chain = rig.chains.find((c) => c.kind === 'braid');
  if (!chain) return;
  const names = chain.joints;
  const pts = names.map((n) => rig.world[n].clone());
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  pts.push(last.clone().add(last.clone().sub(prev).multiplyScalar(0.9)));
  // cumulative distance
  const sAt = [0];
  for (let i = 1; i < pts.length; i++) sAt.push(sAt[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = sAt[sAt.length - 1];
  const joints = names.map((n, i) => ({ name: n, s: sAt[i] }));
  const along = (s) => {
    for (let i = 1; i < pts.length; i++) if (s <= sAt[i]) {
      const t = (s - sAt[i - 1]) / (sAt[i] - sAt[i - 1]);
      return { p: pts[i - 1].clone().lerp(pts[i], t), d: pts[i].clone().sub(pts[i - 1]).normalize() };
    }
    return { p: pts[pts.length - 1].clone(), d: pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize() };
  };
  const base = col(h.color || '#b9ad94');
  const streak = h.streak ? col(h.streak) : null;
  const r0 = (h.braidR ?? 0.017) * k;
  const nS = 26;
  for (let strand = 0; strand < 3; strand++) {
    const rings = [];
    for (let i = 0; i <= nS; i++) {
      const s = (i / nS) * total * 0.97;
      const { p, d } = along(s);
      const f = frame(d, V(0, 0, -1));
      const taper = lerp(1, 0.55, smoothstep(0.55, 1, s / total));
      const ph = s / (0.05 * k) * TAU / 3 + strand * TAU / 3;
      const off = f.a.clone().multiplyScalar(Math.cos(ph) * r0 * 0.5 * taper).addScaledVector(f.b, Math.sin(ph * 2) * r0 * 0.28 * taper);
      rings.push({ c: p.clone().add(off), a: f.a, b: f.b, ra: r0 * 0.62 * taper, rb: r0 * 0.5 * taper, s });
    }
    // re-orthonormalize frames along the actual strand path
    for (let i = 0; i < rings.length; i++) {
      const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
      const f = frame(b.clone().sub(a), V(0, 0, -1));
      rings[i].a = f.a; rings[i].b = f.b;
    }
    const sc = strand === 1 && streak ? streak : base.clone().multiplyScalar(0.92 + strand * 0.06);
    const sm = { ...ctx.hairMat, color: sc };
    tube(mb, { rings, seg: 6, mat: sm, capEnd: true,
      color: (ri, th) => sc.clone().multiplyScalar(0.8 + 0.25 * Math.max(0, Math.cos(th)) * (0.7 + 0.3 * Math.sin(rings[ri].s * 120))),
      weights: (ri) => chainWeights(joints, rings[ri].s, 0.03 * k) });
  }
  // gathered base at the nape and a tie near the end
  blob(mb, pts[0].clone().add(V(0, 0.01 * k, 0.006 * k)), { x: 0.03 * k, y: 0.028 * k, z: 0.022 * k }, { ...ctx.hairMat, color: base.clone().multiplyScalar(0.9) }, [['head', 0.7], [names[0], 0.3]], 8, 5);
  const tie = along(total * 0.86);
  const tieMat = mat(col(h.tie || '#3a2a20'), { tile: 'leather', rough: 0.6, tileU: 1, tileV: 1 });
  blob(mb, tie.p, { x: r0 * 0.75, y: 0.012 * k, z: r0 * 0.75 }, tieMat, chainWeights(joints, total * 0.86, 0.02 * k), 8, 3);
  // tassel end
  const end = along(total);
  blob(mb, end.p.clone().addScaledVector(end.d, -0.01 * k), { x: r0 * 0.6, y: 0.03 * k, z: r0 * 0.55 }, { ...ctx.hairMat, color: base }, chainWeights(joints, total, 0.02 * k), 6, 4);
}

function buildPigtails(ctx, h) {
  const { mb, rig, k } = ctx;
  const base = col(h.color || '#6b4a2e');
  for (const S of ['L', 'R']) {
    const chain = rig.chains.find((c) => c.kind === 'tail' && c.joints[0].startsWith('pig' + S));
    if (!chain) continue;
    const p0 = rig.world[chain.joints[0]], p1 = rig.world[chain.joints[1]];
    const tip = p1.clone().add(chain.tip);
    const pts = [p0, p1, tip];
    const rings = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = t < 0.5 ? p0.clone().lerp(p1, t * 2) : p1.clone().lerp(tip, (t - 0.5) * 2);
      const d = (t < 0.5 ? p1.clone().sub(p0) : tip.clone().sub(p1)).normalize();
      const f = frame(d, V(0, 0, 1));
      const r = (0.011 - t * 0.004) * k * (1 + 0.18 * Math.abs(Math.sin(t * 22)));
      rings.push({ c: p, a: f.a, b: f.b, ra: r, rb: r * 0.85, t });
    }
    tube(mb, { rings, seg: 6, mat: { ...ctx.hairMat, color: base }, capEnd: true,
      weights: (ri) => { const t = rings[ri].t; return t < 0.5 ? [[chain.joints[0], 1 - t], [chain.joints[1], t]] : [[chain.joints[1], 1]]; } });
    const tie = mat(col(h.tie || '#9a2e22'), { tile: 'wool', rough: 0.9, tileU: 1, tileV: 1 });
    blob(mb, pts[2].clone().lerp(pts[1], 0.2), { x: 0.009 * k, y: 0.006 * k, z: 0.009 * k }, tie, [[chain.joints[1], 1]], 6, 3);
  }
}

function buildBun(ctx, h) {
  const { mb, info, k } = ctx;
  const p = info.cast(dirOf(Math.PI, 1.75));
  const c = toW(ctx, p.clone().add(V(0, 0.005, -0.022)));
  blob(mb, c, { x: 0.034 * k, y: 0.03 * k, z: 0.026 * k }, { ...ctx.hairMat, color: col(h.color || '#4a3a2c') }, [['head', 1]], 10, 6, null, (th) => 1 + 0.1 * Math.sin(th * 6));
}

// Straight hair falling behind the shoulders (men with longer hair, loose women's hair).
function buildBackHair(ctx, h) {
  const { mb, info, k, R } = ctx;
  const base = col(h.color || '#4a3a2c');
  const n = 12;
  for (let i = 0; i < n; i++) {
    const az = Math.PI + (i / (n - 1) - 0.5) * 2.6;
    const p0 = info.cast(dirOf(az, 1.75)).add(V(0, 0, 0)).multiplyScalar(1.04);
    const out = V(Math.sin(az), 0, Math.cos(az));
    const pts = [], sides = [], widths = [];
    const len = (h.length ?? 0.2) * (0.85 + R() * 0.3);
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      const q = p0.clone().add(V(0, -len * t, 0)).addScaledVector(out, 0.012 * Math.sin(t * Math.PI) + 0.01);
      pts.push(toW(ctx, q));
      widths.push((0.03 - t * 0.016) * k);
      sides.push(V(Math.cos(az), 0, -Math.sin(az)));
    }
    ribbon(mb, pts, sides, widths, { ...ctx.hairMat, color: base.clone().multiplyScalar(0.85 + R() * 0.25) },
      (j) => (j < 2 ? [['head', 1]] : [['head', 0.5], ['neck', 0.5]]), { double: true });
  }
}

// Wiesia: long dark hair floating as if underwater (vertex shader animates aFloat).
function buildFloatHair(ctx, h) {
  const { mb, info, k, R } = ctx;
  const base = col(h.color || '#24201e');
  const n = h.strands ?? 46;
  for (let i = 0; i < n; i++) {
    const az = Math.PI + (R() * 2 - 1) * 2.3;
    const pol = 0.35 + R() * 1.25;
    const p0 = info.cast(dirOf(az, pol));
    const out = V(Math.sin(az), 0.3 + R() * 0.4, Math.cos(az)).normalize();
    const pts = [], sides = [], widths = [];
    const len = (h.length ?? 0.55) * (0.6 + R() * 0.6);
    const curl = (R() - 0.5) * 2;
    const ph = R();
    const side = new THREE.Vector3().crossVectors(out, V(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const nSeg = 8;
    for (let s = 0; s <= nSeg; s++) {
      const t = s / nSeg;
      const q = p0.clone().addScaledVector(out, len * t * 0.7).add(V(0, len * (0.25 * t - 0.45 * t * t), 0)).addScaledVector(side, curl * 0.08 * t * t);
      pts.push(toW(ctx, q));
      widths.push((0.03 - t * 0.022) * k);
      sides.push(side);
    }
    ribbon(mb, pts, sides, widths, { ...ctx.hairMat, color: base.clone().multiplyScalar(0.8 + R() * 0.4) },
      () => [['head', 1]], { double: true, float: (j, np) => [Math.pow(j / (np - 1), 1.3), ph] });
  }
}

function buildBeard(ctx, b) {
  const { mb, info, R } = ctx;
  const S = info.S;
  const bc = col(b.color || '#4a3a2c');
  const bm = mat(bc, { tile: b.style === 'full' ? 'fur' : 'hair', rough: 0.7, fuzz: 0.7, tileU: 6, tileV: 10 });
  const long = b.length ?? (b.style === 'full' ? 0.07 : 0.0);
  const base = b.style === 'full' ? 0.012 : b.style === 'short' ? 0.0065 : b.style === 'thin' ? 0.0035 : 0.004;
  const mask = (p) => {
    const ax = Math.abs(p.x);
    let m = smoothstep(0.062, 0.042, p.y - (ax > 0.045 ? 0.0 : 0)) * smoothstep(-0.02, 0.0, p.z);
    // cheek line rises toward the ears (sideburns)
    const cheekLine = lerp(0.03, 0.065, smoothstep(0.03, 0.06, ax));
    m *= smoothstep(cheekLine + 0.006, cheekLine - 0.004, p.y);
    // keep the lips clear
    const lip = smoothstep(0.031, 0.022, ax) * smoothstep(0.011, 0.005, Math.abs(p.y - (S.stomY - 0.001)));
    m *= 1 - lip;
    if (b.style === 'mustache') m *= smoothstep(S.stomY - 0.002, S.stomY + 0.004, p.y) * smoothstep(0.034, 0.024, ax);
    if (b.style === 'thin') m *= 0.6 + 0.4 * smoothstep(0.035, 0.0, ax);
    return m;
  };
  const n = new THREE.Vector3();
  const nAz = 26, nPol = 14;
  const rows = [];
  for (let i = 0; i <= nPol; i++) {
    const row = [];
    const pol = lerp(1.45, 2.75, i / nPol);
    for (let j = 0; j <= nAz; j++) {
      const az = lerp(-1.75, 1.75, j / nAz);
      const p = info.cast(dirOf(az, pol));
      info.grad(p, n);
      const m = mask(p);
      const hang = long * smoothstep(S.chinY + 0.02, S.chinY - 0.012, p.y) * smoothstep(0.06, 0.0, Math.abs(p.x));
      const t = m * (base + R() * 0.002) + hang * m - 0.0015 * (1 - m);
      const q = p.clone().addScaledVector(n, t);
      if (hang > 0) q.add(V(0, -hang * 0.6, hang * 0.15));
      const shade = 0.75 + 0.25 * m;
      row.push(mb.vert(toW(ctx, q), bc.clone().multiplyScalar(shade * (0.85 + R() * 0.3)), j / nAz * bm.tileU, i / nPol, bm, info.skinWeights(p)));
    }
    rows.push(row);
  }
  for (let i = 0; i < nPol; i++) for (let j = 0; j < nAz; j++) {
    mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  }
}

function buildFurHat(ctx, hat) {
  const { mb, k, sc, pivot } = ctx;
  const fm = mat(col(hat.color || '#3b3026'), { tile: 'fur', rough: 0.9, fuzz: 0.9, tileU: 6, tileV: 5 });
  const rings = [];
  const hgt = hat.height ?? 0.11;
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = lerp(0.112, 0.112 + hgt, t);
    const top = smoothstep(0.65, 1, t);
    const rx = (0.084 + (hat.wide ?? 0.008)) * (1 - top * top * 0.55) * (1 + 0.04 * Math.sin(t * Math.PI));
    const rz = (0.102 + (hat.wide ?? 0.008)) * (1 - top * top * 0.55);
    rings.push({ c: V(0, y, -0.006 - t * 0.01).multiplyScalar(sc).add(pivot), a: V(0, 0, 1), b: V(1, 0, 0), ra: rz * sc, rb: rx * sc,
      r: (th) => 1 + 0.035 * noise1(th * 5 + i, 3) });
  }
  tube(mb, { rings, seg: 16, mat: fm, capEnd: true, capStart: false,
    color: (ri, th) => fm.color.clone().multiplyScalar(0.8 + 0.25 * noise1(th * 7 + ri, 5)),
    weights: () => [['head', 1]], inner: { inset: 0.006, hem: true } });
  void k;
}

function buildCap(ctx, hat, knit) {
  const { mb, k, sc, pivot } = ctx;
  const cm = mat(col(hat.color || '#9a2e22'), { tile: knit ? 'knit' : 'wool', rough: 0.95, fuzz: knit ? 0.6 : 0.4, tileU: 10, tileV: 10 });
  const low = hat.low ?? (knit ? 1 : 0);
  // edge: forehead in front, over/under the ears, the nape at the back
  const edge = (az) => {
    const aa = Math.abs(az);
    return lerp(1.05, lerp(1.62, 1.95, low), smoothstep(0.3, 1.6, aa)) + (knit ? 0.0 : -0.1);
  };
  const rows = topShell(ctx, {
    nAz: 24, nPol: 9, mat: cm, edge,
    thick: (p, az, pol, t) => 0.012 + (hat.slouch ?? 0.01) * (1 - t) * (knit ? 1 : 0.4),
    color: (i) => cm.color.clone().multiplyScalar(0.85 + 0.15 * (i / 9)),
  });
  // rolled brim along the edge
  const nAz = 24;
  const brimRings = [];
  for (let j = 0; j <= nAz; j++) {
    const v = rows[rows.length - 1][j];
    brimRings.push(V(mb.P[v * 3], mb.P[v * 3 + 1], mb.P[v * 3 + 2]));
  }
  const bandMat = { ...cm, color: cm.color.clone().multiplyScalar(0.9) };
  const rr = (knit ? 0.011 : 0.009) * k;
  const rings = brimRings.map((p, j) => {
    const a = brimRings[(j - 1 + nAz) % nAz], b = brimRings[(j + 1) % nAz];
    const t = b.clone().sub(a).normalize();
    const out = p.clone().sub(pivot).setY(0).normalize();
    const f = frame(t, out);
    return { c: p.clone().addScaledVector(out, rr * 0.4).add(V(0, rr * 0.5, 0)), a: f.a, b: f.b, ra: rr, rb: rr * 1.2 };
  });
  rings[rings.length - 1] = { ...rings[0] };
  tube(mb, { rings, seg: 6, mat: bandMat, weights: () => [['head', 1]] });
  if (knit && hat.pompom !== false) {
    const top = toW(ctx, ctx.info.cast(dirOf(0, 0.05)).add(V(0, 0.02, -0.01)));
    blob(mb, top, { x: 0.022 * k, y: 0.02 * k, z: 0.022 * k }, cm, [['head', 1]], 8, 5, null, (th) => 1 + 0.12 * Math.sin(th * 7));
  }
}

// Headscarves and hoods: a shell around the face opening.
function buildScarf(ctx, hat, mode) {
  const { mb, info, k, R } = ctx;
  const S = info.S;
  const sm = mat(col(hat.color || '#7a746a'), { tile: hat.tile || 'wool', rough: 0.92, fuzz: 0.45, tileU: 8, tileV: 8 });
  const fwd = V(0, mode === 'nape' ? 0.1 : -0.22, 1).normalize();
  const up = V(0, 1, 0).addScaledVector(fwd, -fwd.y).normalize();
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // face opening: gamma_edge(psi), psi = 0 forehead, PI chin
  const gE = (psi) => {
    const c = Math.cos(psi);
    if (mode === 'nape') return lerp(0.62, 1.6, smoothstep(0.3, -0.6, c));
    if (mode === 'hood') return lerp(0.72, 0.98, smoothstep(0.8, -0.8, c));
    return lerp(0.6, 0.84, smoothstep(0.9, -0.9, c)) + (hat.open ?? 0);
  };
  const gMax = mode === 'nape' ? 2.6 : 3.0;
  const nPsi = 28, nG = 12;
  const n = new THREE.Vector3();
  const rows = [];
  const vol = mode === 'hood' ? 0.03 : 0.014;
  for (let i = 0; i <= nG; i++) {
    const row = [];
    for (let j = 0; j <= nPsi; j++) {
      const psi = (j / nPsi) * TAU;
      const g0 = gE(psi);
      const t = i / nG;
      const g = lerp(g0, gMax, Math.pow(t, 0.9));
      const d = fwd.clone().multiplyScalar(Math.cos(g)).addScaledVector(up, Math.sin(g) * Math.cos(psi)).addScaledVector(side, Math.sin(g) * Math.sin(psi));
      const p = info.cast(d);
      info.grad(p, n);
      let th = vol * smoothstep(0, 0.3, t) + 0.006 + (i === 0 ? 0.003 : 0);
      // over the ears and under the chin the cloth stands off more
      th += 0.012 * Math.exp(-(((Math.abs(p.x) - 0.07) / 0.02) ** 2)) * smoothstep(0.02, 0.06, p.y) * smoothstep(0.1, 0.07, p.y);
      if (mode === 'hood') th += 0.02 * smoothstep(0.1, 0.18, p.y) * smoothstep(0.0, -0.06, p.z);
      const q = p.clone().addScaledVector(n, th);
      if (i === 0) q.addScaledVector(fwd, 0.004);
      const shade = (i === 0 ? 0.8 : 1) * (0.9 + 0.1 * noise1(psi * 4 + i, 6)) * (0.92 + R() * 0.08);
      const w = p.y < S.stomY - 0.01 && p.z > 0.02 ? info.skinWeights(p) : [['head', 1]];
      row.push(mb.vert(toW(ctx, q), sm.color.clone().multiplyScalar(shade), (j / nPsi) * sm.tileU, t * sm.tileV * 0.3, sm, w));
    }
    rows.push(row);
  }
  for (let i = 0; i < nG; i++) for (let j = 0; j < nPsi; j++) {
    mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  }
  // knot and tails
  if (mode === 'chin') {
    const kp = toW(ctx, V(0, S.chinY - 0.02, 0.05));
    blob(mb, kp, { x: 0.02 * k, y: 0.016 * k, z: 0.016 * k }, sm, [['jaw', 0.6], ['head', 0.4]], 7, 4);
  } else if (mode === 'nape') {
    const kp = toW(ctx, V(0, 0.03, -0.1));
    blob(mb, kp, { x: 0.022 * k, y: 0.018 * k, z: 0.016 * k }, sm, [['head', 1]], 7, 4);
    for (const s of [1, -1]) {
      const pts = [], sides = [], widths = [];
      for (let t = 0; t <= 4; t++) {
        pts.push(kp.clone().add(V(s * 0.012 * k * t, -0.035 * k * t, -0.008 * k * t)));
        sides.push(V(1, 0, 0));
        widths.push((0.04 - t * 0.008) * k);
      }
      ribbon(mb, pts, sides, widths, sm, (t) => (t < 2 ? [['head', 1]] : [['head', 0.5], ['neck', 0.5]]), { double: true });
    }
  }
  if (hat.emb !== undefined) void hat.emb;
}

function buildCrown(ctx, hat) {
  const { mb, info, k, R } = ctx;
  const straw = col(hat.color || '#d8cfa8');
  const frost = col('#eef6fa');
  const sm = mat(straw, { tile: 'straw', rough: 0.6, fuzz: 0.3, tileU: 1, tileV: 3, special: hat.glow ? 3 : 0 });
  const n = hat.spikes ?? 26;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * TAU;
    const p = info.cast(dirOf(az, 0.62)).multiplyScalar(1.06);
    const out = V(Math.sin(az), 0, Math.cos(az));
    const dir = out.clone().multiplyScalar(0.35).add(V(0, 1, 0)).normalize();
    const len = (0.05 + R() * 0.07) * (Math.cos(az) > 0 ? 1.15 : 0.85);
    const rings = [];
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      const c = toW(ctx, p.clone().addScaledVector(dir, len * t).addScaledVector(out, 0.01 * t * t));
      const f = frame(dir, out);
      const r = (0.006 - t * 0.0052) * k;
      rings.push({ c, a: f.a, b: f.b, ra: r, rb: r * 0.8 });
    }
    tube(mb, { rings, seg: 4, mat: sm, capEnd: true,
      color: (ri) => straw.clone().lerp(frost, 0.15 + ri * 0.22).multiplyScalar(0.9 + R() * 0.2),
      weights: () => [['head', 1]] });
  }
  // band of twisted straw
  const band = [];
  for (let j = 0; j <= 24; j++) {
    const az = (j / 24) * TAU;
    const p = info.cast(dirOf(az, 0.62)).multiplyScalar(1.05);
    band.push(toW(ctx, p));
  }
  const rings = band.map((p, j) => {
    const a = band[(j + 23) % 24], b = band[(j + 1) % 24];
    const f = frame(b.clone().sub(a), p.clone().sub(ctx.pivot).setY(0).normalize());
    return { c: p, a: f.a, b: f.b, ra: 0.008 * k, rb: 0.006 * k };
  });
  rings[24] = { ...rings[0] };
  tube(mb, { rings, seg: 5, mat: sm, weights: () => [['head', 1]] });
  void clamp;
}
