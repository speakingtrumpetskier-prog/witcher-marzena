// Hair volume pieces, beards and headwear, built on the sculpted skull (head.js info).
//
// The head grid only carries painted roots. Here: the hair mass (a shell off the scalp laid out
// around a flow pole, the crown whorl for loose hair or the gather point for braids and buns,
// so the strand texture converges where hair is gathered), hairline cards that break the edge
// (baby hairs, bangs, temple wisps, nape), braids (three helical strands on spring chains),
// pigtails, buns, the ghost's floating strands (aFloat), beards (smooth shell plus layered
// clump cards), hats (fur, knit cap with rolled brim, felt cap), headscarves and hoods, and
// Wiesia's crown of frozen straw. Hair under headwear is flattened by the hat's cover test.
import * as THREE from 'three';
import { M as mat, tube, blob, ribbon, chainWeights, frame } from './geom.js';
import { col, lerp, smoothstep, rng, noise1, pnoise, clamp } from './util.js';
import { hairMask } from './head.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export function buildHair(mb, rig, look, info) {
  const h = look.hair || {};
  const ctx = { mb, rig, look, info, M: rig.M, k: rig.M.k, sc: info.scale, pivot: info.pivot, R: rng((look.seed || 1) * 13 + 5) };
  const hairMat = mat(col(h.color || '#4a3a2c'), { tile: 'hair', rough: 0.55, fuzz: 0.45, tileU: 3, tileV: 14 });
  ctx.hairMat = hairMat;
  const hat = look.hat;
  ctx.hat = hatShape(hat, info);
  const styled = h.style && !['bald', 'none', 'cropped'].includes(h.style);
  if (styled) {
    const shell = buildHairShell(ctx, h);
    if (shell) buildHairCards(ctx, h, shell);
  }
  if (h.braid || h.style === 'braid') buildBraid(ctx, h);
  if (h.style === 'pigtails') buildPigtails(ctx, h);
  if (h.style === 'bun' || h.bun) buildBun(ctx, h);
  if (h.style === 'float') buildFloatHair(ctx, h);
  if (h.style === 'long' || h.long) buildBackHair(ctx, h);
  const b = look.beard;
  if (b && b.style !== 'none') buildBeard(ctx, b);
  if (hat) {
    if (hat.type === 'fur') buildFurHat(ctx, hat);
    else if (hat.type === 'knit') buildCap(ctx, hat, true);
    else if (hat.type === 'felt') buildCap(ctx, hat, false);
    else if (hat.type === 'scarf' || hat.type === 'kerchief' || hat.type === 'hood') buildScarf(ctx, hat);
    else if (hat.type === 'crown') buildCrown(ctx, hat);
  }
}

// Headwear shapes shared by the hat builders and the hair under them. cover(p) is how far a
// skull point (head-local) lies under the hat in meters (> 0 covered, < 0 visible).
function hatShape(hat, info) {
  if (!hat) return null;
  const O = info.O;
  const t = hat.type;
  if (t === 'fur') return { cover: (p) => p.y - 0.106 };
  if (t === 'knit' || t === 'felt') {
    const knit = t === 'knit';
    const low = hat.low ?? (knit ? 1 : 0);
    const front = hat.edge ?? 1.05;
    const edge = (az) => lerp(front, lerp(1.62, 1.95, low), smoothstep(0.3, 1.6, Math.abs(az))) + (knit ? 0.0 : -0.1);
    return {
      edge,
      cover: (p) => {
        const d = p.clone().sub(O);
        return (edge(Math.atan2(d.x, d.z)) - Math.acos(clamp(d.y / d.length(), -1, 1))) * 0.1;
      },
    };
  }
  if (t === 'scarf' || t === 'kerchief' || t === 'hood') {
    const mode = t === 'scarf' ? 'chin' : t === 'kerchief' ? 'nape' : 'hood';
    const fwd = V(0, mode === 'nape' ? 0.1 : -0.22, 1).normalize();
    const up = V(0, 1, 0).addScaledVector(fwd, -fwd.y).normalize();
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const open = hat.open ?? 0;
    // face opening: gamma_edge(psi), psi = 0 forehead, PI chin
    const gE = (psi) => {
      const c = Math.cos(psi);
      if (mode === 'nape') return lerp(0.74, 1.6, smoothstep(0.3, -0.6, c)) + open * smoothstep(-0.2, 0.6, c);
      if (mode === 'hood') return lerp(0.72, 0.98, smoothstep(0.8, -0.8, c)) + open;
      return lerp(0.6, 0.84, smoothstep(0.9, -0.9, c)) + open;
    };
    const gMax = mode === 'nape' ? 2.6 : 3.0;
    return {
      mode, fwd, up, side, gE, gMax,
      cover: (p) => {
        const d = p.clone().sub(O).normalize();
        const g = Math.acos(clamp(d.dot(fwd), -1, 1));
        const psi = Math.atan2(d.dot(side), d.dot(up));
        return Math.min(g - gE(psi), gMax - g) * 0.1;
      },
    };
  }
  return null;
}

// Per style: volume off the scalp (m, reference head), flow pole, groove depth, strand repeats.
const SHELL = {
  short: { vol: 0.0085, pole: 'crown', clump: 0.35, tileU: 9 },
  long: { vol: 0.0095, pole: 'crown', clump: 0.3, tileU: 9 },
  braid: { vol: 0.0042, pole: 'gather', clump: 0.22, tileU: 12 },
  bun: { vol: 0.0045, pole: 'gather', clump: 0.22, tileU: 12 },
  pigtails: { vol: 0.005, pole: 'crown', clump: 0.25, tileU: 10 },
  fringe: { vol: 0.0045, pole: 'back', clump: 0.35, tileU: 9 },
  float: { vol: 0.005, pole: 'crown', clump: 0.3, tileU: 10 },
};

function buildHairShell(ctx, h) {
  const { mb, info, look } = ctx;
  const cfg = { ...(SHELL[h.style] || SHELL.short), ...(h.shell || {}) };
  if (h.thick !== undefined) cfg.vol = h.thick;
  const det = look.detail ?? 1;
  const nPhi = det >= 1 ? 40 : 26, nG = det >= 1 ? 12 : 8;
  const pole = (cfg.pole === 'gather' ? V(0, -0.1, -1) : cfg.pole === 'back' ? V(0, 0.25, -1) : V(0, 1, -0.3)).normalize();
  const e1 = V(1, 0, 0).addScaledVector(pole, -pole.x).normalize();
  const e2 = new THREE.Vector3().crossVectors(pole, e1);
  const dirAt = (phi, gam) => pole.clone().multiplyScalar(Math.cos(gam))
    .addScaledVector(e1, Math.sin(gam) * Math.cos(phi)).addScaledVector(e2, Math.sin(gam) * Math.sin(phi));
  const inRegion = (p) => hairMask(p, h).mask > 0.35;
  // hairline crossing along each meridian from the pole
  const edges = [];
  for (let j = 0; j < nPhi; j++) {
    const phi = (j / nPhi) * TAU;
    let g = 0.04, lo = 0;
    if (!inRegion(info.cast(dirAt(phi, g)))) { edges.push(0); continue; }
    while (g < 3.0 && inRegion(info.cast(dirAt(phi, g)))) { lo = g; g += 0.11; }
    let a = lo, b = Math.min(g, 3.0);
    for (let k = 0; k < 8; k++) {
      const m = (a + b) * 0.5;
      if (inRegion(info.cast(dirAt(phi, m)))) a = m; else b = m;
    }
    edges.push((a + b) * 0.5);
  }
  if (!edges.some((e) => e > 0)) return null;
  for (let it = 0; it < 2; it++) {
    const e = edges.slice();
    for (let j = 0; j < nPhi; j++) edges[j] = (e[(j + nPhi - 1) % nPhi] + 2 * e[j] + e[(j + 1) % nPhi]) / 4;
  }
  const base = col(h.color || '#4a3a2c');
  const streak = h.streak ? col(h.streak) : null;
  const sm = mat(base, { tile: 'hair', rough: 0.5, fuzz: 0.4, tileU: cfg.tileU, tileV: 1 });
  const seed = (look.seed || 1) % 97;
  const cover = ctx.hat ? ctx.hat.cover : null;
  // which meridians carry the streak: those that reach the hairline at the streak azimuth
  const streakW = edges.map((ge, j) => {
    if (!streak) return 0;
    const pe = info.cast(dirAt((j / nPhi) * TAU, ge));
    if (pe.z < 0.02) return 0;
    return Math.exp(-(((Math.atan2(pe.x, pe.z) - (h.streakAz ?? 0.32)) / 0.2) ** 2));
  });
  // smooth across neighbouring meridians so the streak is a band, not single strands
  for (let it = 0; it < 2; it++) {
    const w = streakW.slice();
    for (let j = 0; j < nPhi; j++) streakW[j] = (w[(j + nPhi - 1) % nPhi] + 2 * w[j] + w[(j + 1) % nPhi]) / 4;
  }
  const nrm = new THREE.Vector3();
  const rows = [], hidden = [];
  for (let i = 0; i <= nG; i++) {
    const tr = i / nG;
    const row = [];
    for (let j = 0; j <= nPhi; j++) {
      const jj = j % nPhi;
      const phi = (jj / nPhi) * TAU;
      const p = info.cast(dirAt(phi, edges[jj] * tr));
      info.grad(p, nrm);
      let th = cfg.vol * (0.6 + 0.4 * smoothstep(0.02, 0.14, p.y)) * (1 + cfg.clump * pnoise(phi, 13, tr * 1.5, seed));
      if (cfg.pole === 'gather') th *= 1 + 0.5 * smoothstep(0.3, 0.0, tr);
      th = lerp(0.0022, th, smoothstep(1.0, 0.78, tr));
      const cv = cover ? cover(p) : -1;
      if (cover) th = lerp(th, 0.0009, smoothstep(-0.003, 0.008, cv));
      const q = p.clone().addScaledVector(nrm, th);
      (hidden[i] ||= [])[j] = cv > 0.012;
      const tone = (0.82 + 0.26 * pnoise(phi, 31, 0.4, seed + 3) + 0.1 * pnoise(phi, 9, 0, seed + 5)) *
        lerp(0.8, 1, smoothstep(0, 0.3, tr)) * lerp(1, 0.86, smoothstep(0.85, 1, tr));
      const c = base.clone().multiplyScalar(tone);
      if (streak && streakW[jj] > 0.01) c.lerp(streak.clone().multiplyScalar(0.8 + 0.25 * tone - 0.2), Math.min(1, streakW[jj] * 1.1) * 0.8 * smoothstep(0.05, 0.3, tr));
      row.push(mb.vert(toW(ctx, q), c, (j / nPhi) * cfg.tileU, tr * 1.3, sm, [['head', 1]]));
    }
    rows.push(row);
  }
  for (let i = 0; i < nG; i++) for (let j = 0; j < nPhi; j++) {
    if (hidden[i][j] && hidden[i + 1][j] && hidden[i + 1][j + 1] && hidden[i][j + 1]) continue;
    mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  }
  return { edges, dirAt, nPhi, cover, cfg, base, streak, streakW };
}

// Tapered cards across the hairline: the root tucks under the shell edge, the tip lies on the
// skin, so the hairline is broken and soft instead of a hard shell edge.
function buildHairCards(ctx, h, shell) {
  const { mb, info, look, R } = ctx;
  const { edges, dirAt, nPhi, cover, base } = shell;
  if (h.style === 'float') return;
  const det = look.detail ?? 1;
  const pulled = h.style === 'braid' || h.style === 'bun';
  const lenAt = (az, pe) => {
    const aa = Math.abs(az);
    const nape = aa > 2.1 && pe.y < 0.06;
    if (h.style === 'fringe') return aa < 0.9 ? 0 : nape ? 0.01 + R() * 0.012 : 0.006 + R() * 0.01;
    if (pulled) {
      if (aa < 1.0) return 0.003 + R() * 0.005;
      if (aa < 1.7) return 0.005 + R() * 0.008;
      return nape ? 0.005 + R() * 0.01 : 0.003 + R() * 0.005;
    }
    if (aa < 0.8) return (h.bangs ?? 0.012) * (0.55 + R() * 0.6);
    if (aa < 1.7) return 0.008 + R() * 0.01;
    return nape ? 0.014 + R() * 0.018 : 0.008 + R() * 0.01;
  };
  const cards = [];
  const n = Math.round((det >= 1 ? 80 : 36) * (h.cards ?? 1));
  for (let k = 0; k < n; k++) cards.push({ phi: R() * TAU });
  // bangs: wide clumps across the forehead, cut fairly straight
  if (h.bangs) for (let k = 0; k < (det >= 1 ? 44 : 20); k++) cards.push({ bang: true, az: lerp(-0.8, 0.8, (k + R()) / (det >= 1 ? 44 : 20)) });
  // loose strands escaping at the temples (gathered styles)
  for (let k = 0; k < (h.wisps ?? 0); k++) cards.push({ wisp: true, az: (k % 2 ? 1 : -1) * (0.95 + R() * 0.25) });
  const nrm = new THREE.Vector3();
  const edgeAt = (phi) => {
    const jf = ((phi / TAU) * nPhi + nPhi) % nPhi;
    const j0 = Math.floor(jf), j1 = (j0 + 1) % nPhi;
    return lerp(edges[j0], edges[j1], jf - j0);
  };
  for (const cd of cards) {
    let phi = cd.phi;
    if (cd.wisp || cd.bang) {
      // find the meridian whose hairline point sits at the wanted azimuth
      let best = 0, bd = 9;
      for (let j = 0; j < 64; j++) {
        const ph = (j / 64) * TAU;
        const pe = info.cast(dirAt(ph, edgeAt(ph)));
        if (pe.z < 0) continue;
        const d = Math.abs(Math.atan2(pe.x, pe.z) - cd.az);
        if (d < bd) { bd = d; best = ph; }
      }
      phi = best;
    }
    const ge = edgeAt(phi);
    if (ge <= 0) continue;
    const pe = info.cast(dirAt(phi, ge));
    const az = Math.atan2(pe.x, pe.z);
    let L = cd.wisp ? 0.05 + R() * 0.03 : cd.bang ? h.bangs * (0.8 + R() * 0.35) : lenAt(az, pe);
    if (L <= 0) continue;
    // keep bangs and baby hairs off the brows and eyes
    if (Math.abs(az) < 1.0 && pe.z > 0.03) L = Math.min(L, Math.max(0, (pe.y - (cd.bang ? 0.093 : 0.1)) * 1.15));
    if (L < 0.002) continue;
    const r = pe.distanceTo(info.O);
    const g0 = ge - (0.01 + R() * 0.01) / r, g1 = ge + L / r;
    const nSeg = L > 0.025 ? 6 : 3;
    const pts = [], nrms = [], widths = [];
    let vis = !cover;
    const w0 = (cd.wisp ? 0.0035 : cd.bang ? 0.012 + R() * 0.006 : pulled ? 0.003 + R() * 0.003 : 0.006 + R() * 0.006) * ctx.sc;
    for (let s = 0; s <= nSeg; s++) {
      const t = s / nSeg;
      const p = info.cast(dirAt(phi, lerp(g0, g1, t)));
      info.grad(p, nrm);
      if (cover && t > 0.4 && cover(p) < -0.002) vis = true;
      const lift = cd.wisp ? lerp(0.0022, 0.004, t) : cd.bang ? lerp(0.003, 0.0016, t) : lerp(0.0024, 0.0006, t);
      pts.push(toW(ctx, p.clone().addScaledVector(nrm, lift)));
      nrms.push(nrm.clone());
      widths.push(cd.bang ? w0 * (1 - Math.pow(t, 3) * 0.75) : w0 * Math.sin(lerp(0.25, 1, Math.min(1, t * 2.5)) * Math.PI * 0.5) * Math.pow(1 - t * 0.92, 0.9));
    }
    if (!vis) continue;
    const sides = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      return b.clone().sub(a).normalize().cross(nrms[i]).normalize();
    });
    const tone = 0.78 + R() * 0.3;
    const c0 = base.clone().multiplyScalar(tone);
    ribbon(mb, pts, sides, widths, mat(c0, { tile: 'hair', rough: 0.5, fuzz: 0.4, tileU: 1, tileV: 6 }), () => [['head', 1]],
      { color: (i) => c0.clone().multiplyScalar(lerp(0.7, 1.05, i / nSeg)) });
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
  const { rig, k } = ctx;
  const chain = rig.chains.find((c) => c.kind === 'braid');
  if (!chain) return;
  const names = chain.root ? [chain.root, ...chain.joints] : chain.joints;
  const pts = names.map((n) => rig.world[n].clone());
  pts.push(pts[pts.length - 1].clone().add(chain.tip));
  braidAlong(ctx, pts, names, {
    r0: (h.braidR ?? 0.017) * k, base: col(h.color || '#b9ad94'), streak: h.streak ? col(h.streak) : null,
    tie: h.tie || '#3a2a20', gather: true, nS: 26,
  });
}

// Three-strand braid along a smooth curve through pts (joint positions, last = tip). Strands
// cross with a flat lay that faces away from the body; tapers into a tied tuft.
function braidAlong(ctx, pts, names, o) {
  const { mb, k } = ctx;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const div = (pts.length - 1) * 24;
  const lens = curve.getLengths(div);
  const total = lens[div];
  const joints = names.map((n, i) => ({ name: n, s: lens[i * 24] }));
  const at = (s) => {
    const u = clamp(s / total, 0, 1);
    return { p: curve.getPointAt(u), d: curve.getTangentAt(u).normalize() };
  };
  const out = (p) => V(p.x, 0, p.z + 0.02 * k).normalize();
  const r0 = o.r0, nS = o.nS || 20;
  const endS = total * 0.84;
  for (let strand = 0; strand < 3; strand++) {
    const rings = [];
    for (let i = 0; i <= nS; i++) {
      const s = (i / nS) * endS;
      const { p, d } = at(s);
      const f = frame(d, out(p));
      const taper = lerp(1, 0.6, smoothstep(0.5, 1, s / endS)) * lerp(0.75, 1, smoothstep(0, 0.12 * total, s));
      const ph = (s / (0.045 * k)) * TAU / 3 + (strand * TAU) / 3;
      const c = p.clone().addScaledVector(f.b, Math.cos(ph) * r0 * 0.52 * taper).addScaledVector(f.a, Math.sin(ph * 2) * r0 * 0.24 * taper);
      rings.push({ c, a: f.a, b: f.b, ra: r0 * 0.52 * taper, rb: r0 * 0.62 * taper, s });
    }
    for (let i = 0; i < rings.length; i++) {
      const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
      const f = frame(b.clone().sub(a), out(rings[i].c));
      rings[i].a = f.a; rings[i].b = f.b;
    }
    const sc = strand === 1 && o.streak ? o.streak : o.base.clone().multiplyScalar(0.9 + strand * 0.07);
    const sm = mat(sc, { tile: 'hair', rough: 0.5, fuzz: 0.45, tileU: 2, tileV: 18 });
    tube(mb, { rings, seg: 7, mat: sm, capStart: true,
      // each lobe is lit on its crest and darker where it tucks under the next strand
      color: (ri, th) => sc.clone().multiplyScalar(0.72 + 0.3 * Math.max(0, Math.cos(th)) * (0.65 + 0.35 * Math.sin((rings[ri].s / (0.045 * k)) * TAU / 3 * 2 + strand * 2.1))),
      weights: (ri) => chainWeights(joints, rings[ri].s, 0.03 * k) });
  }
  if (o.gather) {
    const g0 = at(0.012 * k);
    blob(mb, g0.p, { x: r0 * 1.25, y: r0 * 1.1, z: r0 * 1.0 }, mat(o.base.clone().multiplyScalar(0.88), { tile: 'hair', rough: 0.5, fuzz: 0.4, tileU: 2, tileV: 4 }),
      chainWeights(joints, 0.012 * k, 0.02 * k), 8, 5);
  }
  // tie, then a loose tapering tuft of strands
  const tie = at(endS);
  const tieMat = mat(col(o.tie), { tile: o.tieTile || 'leather', rough: 0.7, tileU: 1, tileV: 1 });
  blob(mb, tie.p, { x: r0 * 0.62, y: 0.01 * k, z: r0 * 0.62 }, tieMat, chainWeights(joints, endS, 0.02 * k), 8, 3);
  const tuftMat = mat(o.base, { tile: 'hair', rough: 0.5, fuzz: 0.45, tileU: 1, tileV: 10 });
  const ft = frame(tie.d, out(tie.p));
  for (let q = 0; q < 6; q++) {
    const ang = (q / 6) * TAU;
    const dir = tie.d.clone().addScaledVector(ft.a, Math.cos(ang) * 0.22).addScaledVector(ft.b, Math.sin(ang) * 0.22).normalize();
    const len = (total - endS) * (0.9 + (q % 3) * 0.15);
    const p0 = tie.p.clone().addScaledVector(ft.a, Math.cos(ang) * r0 * 0.25).addScaledVector(ft.b, Math.sin(ang) * r0 * 0.25);
    const ps = [], sd = [], wd = [];
    for (let t = 0; t <= 3; t++) {
      ps.push(p0.clone().addScaledVector(dir, len * (t / 3)));
      sd.push(ft.a.clone().multiplyScalar(-Math.sin(ang)).addScaledVector(ft.b, Math.cos(ang)).normalize());
      wd.push(r0 * 0.75 * (1 - t / 3.3));
    }
    ribbon(mb, ps, sd, wd, { ...tuftMat, color: o.base.clone().multiplyScalar(0.85 + (q % 3) * 0.08) }, () => chainWeights(joints, total, 0.02 * k), { double: true });
  }
}

function buildPigtails(ctx, h) {
  const { rig } = ctx;
  const base = col(h.color || '#6b4a2e');
  for (const S of ['L', 'R']) {
    const chain = rig.chains.find((c) => c.kind === 'tail' && c.joints[0].startsWith('pig' + S));
    if (!chain) continue;
    const p0 = rig.world[chain.joints[0]], p1 = rig.world[chain.joints[1]];
    const pts = [p0.clone(), p1.clone(), p1.clone().add(chain.tip)];
    braidAlong(ctx, pts, chain.joints, { r0: 0.0125 * rig.M.headK, base, tie: h.tie || '#9a2e22', tieTile: 'wool', gather: true, nS: 14 });
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
  const n = h.strands ?? 70;
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
      widths.push((0.017 - t * 0.012) * k);
      sides.push(side);
    }
    ribbon(mb, pts, sides, widths, { ...ctx.hairMat, color: base.clone().multiplyScalar(0.8 + R() * 0.4) },
      () => [['head', 1]], { double: true, float: (j, np) => [Math.pow(j / (np - 1), 1.3), ph] });
  }
}

function buildBeard(ctx, b) {
  const { mb, info, R, look } = ctx;
  const S = info.S;
  const det = look.detail ?? 1;
  const bc = col(b.color || '#4a3a2c');
  const full = b.style === 'full', short = b.style === 'short';
  const bm = mat(bc, { tile: 'hair', rough: 0.7, fuzz: 0.7, tileU: 14, tileV: 3 });
  const long = b.length ?? (full ? 0.07 : 0.0);
  const skinC = col(ctx.look.skin).multiplyScalar(0.42).lerp(bc, 0.35);
  const base = full ? 0.011 : short ? 0.0062 : b.style === 'thin' ? 0.0035 : 0.004;
  const mask = (p) => {
    const ax = Math.abs(p.x);
    let m = smoothstep(0.064, 0.04, p.y - (ax > 0.045 ? 0.0 : 0)) * smoothstep(-0.022, 0.002, p.z);
    // cheek line rises toward the ears (sideburns)
    const cheekLine = lerp(0.022, 0.065, smoothstep(0.034, 0.064, ax)) + 0.004 * noise1(ax * 160, 11);
    m *= smoothstep(cheekLine + 0.018, cheekLine - 0.012, p.y);
    // keep the lips clear
    const lip = smoothstep(0.031, 0.022, ax) * smoothstep(0.011, 0.005, Math.abs(p.y - (S.mouthY(p.x) - 0.001)));
    m *= 1 - lip;
    // the upper lip and nose wings are left to the mustache cards (a coarse shell there
    // reads as slabs); mustache-only styles have no shell at all
    if (b.style === 'mustache') return 0;
    m *= 1 - smoothstep(0.031, 0.022, ax) * smoothstep(S.mouthY(p.x) + 0.001, S.mouthY(p.x) + 0.005, p.y);
    if (b.style === 'thin') m *= 0.6 + 0.4 * smoothstep(0.035, 0.0, ax);
    return m;
  };
  // the beard's outer surface: smooth thickness from the mask, full beards hang below the chin
  const n0 = new THREE.Vector3();
  const outer = (az, pol) => {
    const p = info.cast(dirOf(az, Math.min(pol, 2.75)));
    info.grad(p, n0);
    const m = mask(p);
    const hang = long * smoothstep(S.chinY + 0.02, S.chinY - 0.012, p.y) * smoothstep(0.06, 0.0, Math.abs(p.x));
    const t = m * base * (1 + 0.2 * noise1(az * 9 + pol * 4, 7)) + hang * m - 0.0015 * (1 - m);
    const q = p.clone().addScaledVector(n0, t);
    if (hang > 0) q.add(V(0, -hang * 0.6, hang * 0.15));
    if (pol > 2.75) q.y -= (pol - 2.75) * 0.09;
    return { p, q, m, n: n0.clone() };
  };
  const nAz = det >= 1 ? 32 : 22, nPol = det >= 1 ? 16 : 11;
  const rows = [], gridM = [];
  for (let i = 0; i <= nPol; i++) {
    const row = [];
    const pol = lerp(1.45, 2.75, i / nPol);
    gridM.push([]);
    for (let j = 0; j <= nAz; j++) {
      const az = lerp(-1.75, 1.75, j / nAz);
      const o = outer(az, pol);
      gridM[i].push(o.m);
      const tone = (0.75 + 0.25 * o.m) * (0.88 + 0.18 * noise1(az * 14 + pol * 2, 3));
      // the edge fades into stubbled skin instead of ending in a hard geometric step
      const c = bc.clone().multiplyScalar(tone).lerp(skinC, 1 - smoothstep(0.12, 0.7, o.m));
      row.push(mb.vert(toW(ctx, o.q), c, j / nAz * bm.tileU, i / nPol, bm, info.skinWeights(o.p)));
    }
    rows.push(row);
  }
  for (let i = 0; i < nPol; i++) for (let j = 0; j < nAz; j++) {
    mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  }
  // Clump cards in two layers flowing down the beard: tapered at both ends, darker inside,
  // lighter on top, the bottom row running past the shell into pointed locks.
  const cardMat = mat(bc, { tile: 'hair', rough: 0.65, fuzz: 0.6, tileU: 1, tileV: 5 });
  const nCards = Math.round((full ? 110 : short ? 60 : b.style === 'mustache' ? 0 : 24) * (det >= 1 ? 1 : 0.45));
  const sideOf = (pts, i, nrm) => {
    const a = pts[Math.max(0, i - 1)], c2 = pts[Math.min(pts.length - 1, i + 1)];
    return c2.clone().sub(a).normalize().cross(nrm).normalize();
  };
  for (let k = 0; k < nCards; k++) {
    const layer = k % 3 === 0 ? 0 : 1;
    const az0 = R.range(-1.5, 1.5), pol0 = R.range(1.55, 2.55);
    if (gridM[Math.round(((pol0 - 1.45) / 1.3) * nPol)][Math.round(((az0 + 1.75) / 3.5) * nAz)] < 0.45) continue;
    const o0 = outer(az0, pol0);
    if (o0.m < 0.5) continue;
    const L = full ? 0.022 + R() * 0.03 : 0.01 + R() * 0.012;
    const nSeg = 4;
    const dPol = L / 0.085 / nSeg;
    const pts = [], nrms = [], widths = [], ws = [];
    for (let s = 0; s <= nSeg; s++) {
      const t = s / nSeg;
      const o = outer(az0 * (1 - 0.12 * t), pol0 + dPol * s);
      const lift = layer ? 0.0018 + 0.0012 * t : 0.0008;
      pts.push(toW(ctx, o.q.clone().addScaledVector(o.n, lift)));
      nrms.push(o.n);
      widths.push((full ? 0.011 : 0.007) * ctx.sc * (0.5 + R() * 0.5) * Math.sin(lerp(0.3, 1, Math.min(1, t * 3)) * Math.PI * 0.5) * (1 - t * 0.9));
      ws.push(info.skinWeights(o.p));
    }
    const sides = pts.map((p, i) => sideOf(pts, i, nrms[i]));
    const c0 = bc.clone().multiplyScalar(layer ? 0.9 + R() * 0.3 : 0.6 + R() * 0.15);
    ribbon(mb, pts, sides, widths, { ...cardMat, color: c0 }, (i) => ws[i], { color: (i) => c0.clone().multiplyScalar(lerp(0.85, 1.1, i / nSeg)) });
  }
  // soft top edge: short locks rooted on the cheek line, falling over the shell's edge
  if (full || short) {
    const nE = det >= 1 ? 40 : 18;
    for (let k = 0; k < nE; k++) {
      const az0 = (R() < 0.5 ? -1 : 1) * R.range(0.42, 1.45);
      // walk down the nearest grid column to where the beard starts
      const jc = Math.round(((az0 + 1.75) / 3.5) * nAz);
      let ic = 0;
      while (ic < nPol && gridM[ic][jc] < 0.35) ic++;
      if (ic >= nPol - 2) continue;
      const pol0 = lerp(1.45, 2.75, Math.max(0, ic - 0.4) / nPol);
      const L = (full ? 0.014 : 0.008) + R() * 0.01;
      const pts = [], nrms = [], widths = [], ws = [];
      for (let s = 0; s <= 3; s++) {
        const t = s / 3;
        const o = outer(az0, pol0 + (L / 0.085) * t);
        pts.push(toW(ctx, o.q.clone().addScaledVector(o.n, 0.0012 + 0.001 * t)));
        nrms.push(o.n);
        widths.push((full ? 0.009 : 0.006) * ctx.sc * Math.sin(lerp(0.2, 1, t) * Math.PI) * (0.6 + R() * 0.4) + 0.0004 * ctx.sc);
        ws.push(info.skinWeights(o.p));
      }
      const sides = pts.map((p, i) => sideOf(pts, i, nrms[i]));
      const c0 = bc.clone().multiplyScalar(0.8 + R() * 0.3);
      ribbon(mb, pts, sides, widths, { ...cardMat, color: c0 }, (i) => ws[i]);
    }
  }
  // pointed locks under the chin (full beards)
  if (full) {
    const nLock = det >= 1 ? 22 : 12;
    for (let k = 0; k < nLock; k++) {
      const az0 = lerp(-0.75, 0.75, (k + R() * 0.8) / nLock);
      const o0 = outer(az0, 2.45 + R() * 0.2);
      if (o0.m < 0.4) continue;
      const tip = o0.q.clone().add(V(az0 * -0.006, -(0.018 + R() * 0.022 + long * 0.25), 0.004));
      const pts = [], sides = [], widths = [];
      for (let s = 0; s <= 3; s++) {
        const t = s / 3;
        pts.push(toW(ctx, o0.q.clone().lerp(tip, t).addScaledVector(o0.n, 0.001)));
        sides.push(V(1, 0, 0));
        widths.push(0.012 * ctx.sc * (1 - t * 0.92) * (0.7 + R() * 0.3));
      }
      const c0 = bc.clone().multiplyScalar(0.75 + R() * 0.3);
      ribbon(mb, pts, sides, widths, { ...cardMat, color: c0 }, () => [['jaw', 1]], { double: true });
    }
  }
  // mustache: locks from under the nose sweeping down and out over the lip corners
  if (full || short || b.style === 'mustache') {
    const nM = (det >= 1 ? 30 : 14) * (full ? 1 : 0.7);
    for (let k = 0; k < nM; k++) {
      const sd = k % 2 ? 1 : -1;
      const layer = k % 3 === 0 ? 0 : 1;
      const x0 = sd * lerp(0.002, 0.021, R());
      const pts = [], nrms = [], widths = [];
      const droop = (full ? 0.006 : 0.003) + R() * 0.004;
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        const x = x0 * lerp(1, 1.3, t) + sd * t * 0.005;
        const y = lerp(S.tipY - 0.008, S.mouthY(x) - droop * smoothstep(0.012, 0.024, Math.abs(x)) - 0.0015, t);
        const d = V(x, y, 0.1).sub(info.O).normalize();
        const p = info.cast(d);
        info.grad(p, n0);
        pts.push(toW(ctx, p.clone().addScaledVector(n0, (layer ? 0.0032 : 0.0018) + 0.0014 * Math.sin(t * Math.PI))));
        nrms.push(n0.clone());
        widths.push(0.0075 * ctx.sc * Math.sin(lerp(0.35, 1, Math.min(1, t * 3)) * Math.PI * 0.5) * (1 - t * 0.88) * (0.7 + R() * 0.4));
      }
      const sides = pts.map((p, i) => sideOf(pts, i, nrms[i]));
      const c0 = bc.clone().multiplyScalar(layer ? 0.85 + R() * 0.3 : 0.6 + R() * 0.15);
      ribbon(mb, pts, sides, widths, { ...cardMat, color: c0 }, () => [['head', 0.6], ['jaw', 0.4]],
        { color: (i) => c0.clone().multiplyScalar(lerp(0.85, 1.1, i / 4)) });
    }
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
      r: (th) => 1 + 0.035 * pnoise(th, 5, i, 3) });
  }
  tube(mb, { rings, seg: 16, mat: fm, capEnd: true, capStart: false,
    color: (ri, th) => fm.color.clone().multiplyScalar(0.8 + 0.25 * pnoise(th, 7, ri, 5)),
    weights: () => [['head', 1]], inner: { inset: 0.006, hem: true } });
  void k;
}

function buildCap(ctx, hat, knit) {
  const { mb, k, pivot } = ctx;
  const cm = mat(col(hat.color || '#9a2e22'), { tile: knit ? 'knit' : 'wool', rough: 0.95, fuzz: knit ? 0.6 : 0.4, tileU: 10, tileV: 10 });
  // edge: forehead in front, over/under the ears, the nape at the back
  const edge = ctx.hat.edge;
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
function buildScarf(ctx, hat) {
  const { mb, info, k, R } = ctx;
  const S = info.S;
  const sm = mat(col(hat.color || '#7a746a'), { tile: hat.tile || 'wool', rough: 0.92, fuzz: 0.45, tileU: 8, tileV: 8 });
  const { mode, fwd, up, side, gE, gMax } = ctx.hat;
  const nPsi = 28, nG = 12;
  const n = new THREE.Vector3();
  const rows = [];
  const vol = mode === 'hood' ? 0.026 : 0.01;
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
      const shade = (i === 0 ? 0.82 : 1) * (0.9 + 0.1 * noise1(Math.sin(psi) * 3 + Math.cos(psi) * 2 + i, 6)) * (0.95 + R() * 0.05);
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
  const n = hat.spikes ?? 40;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * TAU + (R() - 0.5) * 0.12;
    const p = info.cast(dirOf(az, 0.62)).multiplyScalar(1.06);
    const out = V(Math.sin(az), 0, Math.cos(az));
    const side = V(Math.cos(az), 0, -Math.sin(az));
    const dir = out.clone().multiplyScalar(0.45 + R() * 0.3).add(V(0, 1, 0)).addScaledVector(side, (R() - 0.5) * 0.5).normalize();
    const len = (0.035 + R() * R() * 0.11) * (Math.cos(az) > 0 ? 1.15 : 0.8);
    const rings = [];
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      const c = toW(ctx, p.clone().addScaledVector(dir, len * t).addScaledVector(out, 0.01 * t * t));
      const f = frame(dir, out);
      const r = (0.0038 - t * 0.0033) * k;
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
