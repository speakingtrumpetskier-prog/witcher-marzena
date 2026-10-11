// Procedural rest-pose geometry for the sky spirits (platnicy). Every species is a handful of
// parts merged into one InstancedBufferGeometry; the vertex shader (shaders.js) animates all of
// it, so nothing here moves. Units are bell radii (R = 1): the instance scale turns them into
// meters.
//
// Vertex attributes (besides position and normal):
//   aInfo = (part, u, v, rnd)   part id (PART), u 0..1 around, v 0..1 along the part, rnd 0..1
//   aAux  = part specific: ribbons (side or across, width mult, rank, length mult),
//           billboards (corner x, corner y, size, intensity), gonads (a, f, hash, 0)
//
// Exports: PART, buildGeometry(recipe, detail, seed), profile(name, v).
import * as THREE from 'three';
import { rng } from '../../core/util.js';

export const PART = {
  SHELL: 0, // bell or body surface (double sided)
  SKIRT: 1, // frilled hem hanging below the bell margin
  CORE: 2, // camera facing glow quad
  GONAD: 3, // flat glowing ring on the subumbrella
  ARM: 4, // frilly oral arm (ribbon with ruffled edges)
  TENT: 5, // tentacle filament (camera facing ribbon)
  PINN: 6, // short side filament growing from a tentacle
  GUT: 7, // fat glowing tube (manubrium, comb jelly gut)
};

const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Smooth profile through control points [r, y] listed from the apex to the margin. v is the
// fraction of arc length, so rings stay evenly spaced along the surface.
function splineProfile(pts) {
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      dense.push([Math.max(0, f(0)), f(1)]);
    }
  }
  dense.push(pts[pts.length - 1].slice());
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  return (v) => {
    const s = Math.min(Math.max(v, 0), 1) * total;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-9);
    return [dense[lo][0] + (dense[hi][0] - dense[lo][0]) * f, dense[lo][1] + (dense[hi][1] - dense[lo][1]) * f];
  };
}
// The nave: a pointed arch with a needle spire, near vertical walls and a flared foot.
const CATHEDRAL_PROFILE = splineProfile([
  [0, 2.3], [0.02, 2.02], [0.07, 1.84], [0.2, 1.7], [0.38, 1.52], [0.56, 1.3], [0.72, 1.04],
  [0.84, 0.77], [0.92, 0.5], [0.97, 0.28], [1.03, 0.12], [1.1, 0],
]);

// Shell profiles: v 0 (apex) .. 1 (margin) -> [radius, height]. The margin sits at y = 0 and
// the apex is up. Ovoid is a closed body: v 0 top pole .. 1 bottom pole.
const PROFILES = {
  bell: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.8) * (1 + 0.14 * sm(0.8, 1, v)), 1.55 * Math.pow(Math.cos(a), 1.05)];
  },
  saucer: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.92), 0.36 * Math.pow(Math.cos(a), 1.2) - 0.05 * sm(0.75, 1, v)];
  },
  lantern: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.28) * (1 - 0.05 * sm(0.7, 1, v)), 1.05 * Math.pow(Math.cos(a), 0.7)];
  },
  dome: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.9) * (1 - 0.1 * sm(0.8, 1, v)), 0.8 * Math.pow(Math.cos(a), 0.95)];
  },
  cathedral: (v) => CATHEDRAL_PROFILE(v),
  ovoid: (v) => {
    const a = v * Math.PI;
    return [0.5 * Math.pow(Math.sin(a), 0.55) * (1 + 0.22 * (0.5 - v)), 0.75 - 1.5 * v];
  },
};
export function profile(name, v) { return PROFILES[name](v); }

class Acc {
  constructor() { this.pos = []; this.nor = []; this.info = []; this.aux = []; this.idx = []; }
  v(p, n, info, aux) {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.info.push(info[0], info[1], info[2], info[3]);
    this.aux.push(aux[0], aux[1], aux[2], aux[3]);
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // Rows of `cols + 1` vertices starting at index `base`, joined into quads.
  strip(base, rows, cols) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        this.tri(a, c, b);
        this.tri(b, c, d);
      }
    }
  }
  build() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.aux, 4));
    g.setIndex(this.idx);
    g.userData.tris = this.idx.length / 3;
    return g;
  }
}

// ---- parts ------------------------------------------------------------------------------

function addShell(acc, profName, nu, nv, part = PART.SHELL, cluster = 1.0) {
  const base = acc.pos.length / 3;
  for (let j = 0; j <= nv; j++) {
    // Rings crowd toward the margin (cluster > 1) where the frill and lobes need them.
    const t = j / nv;
    const v = cluster === 1 ? t : 1 - Math.pow(1 - t, cluster);
    const e = 0.002;
    const v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
    const [r, y] = PROFILES[profName](v);
    const [ra, ya] = PROFILES[profName](v0), [rb, yb] = PROFILES[profName](v1);
    const dr = rb - ra, dy = yb - ya;
    const nl = Math.hypot(dr, dy) || 1;
    const nr = -dy / nl, ny = dr / nl;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = u * TAU;
      const c = Math.cos(th), s = Math.sin(th);
      acc.v([r * c, y, r * s], [nr * c, ny, nr * s], [part, u, v, 0], [0, 0, 0, 0]);
    }
  }
  acc.strip(base, nv, nu);
}

// Frilled hem: rows hang below the margin; the shader ruffles them.
function addSkirt(acc, profName, nu, rows) {
  const [rm, ym] = PROFILES[profName](1);
  const base = acc.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    const q = j / rows;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = u * TAU;
      acc.v([rm * Math.cos(th), ym, rm * Math.sin(th)], [Math.cos(th), 0, Math.sin(th)], [PART.SKIRT, u, q, 0], [0, 0, 0, 0]);
    }
  }
  acc.strip(base, rows, nu);
}

// Glow quads at the bell center: the lamp itself (kind 0) and a wide faint halo (kind 1).
function addCore(acc, y, size, halo = 0, haloI = 0.2, x = 0, z = 0, tint = 1) {
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const quad = (sz, kind, inten) => {
    const ids = corners.map(([cx, cy]) => acc.v([x, y, z], [0, 0, 1], [PART.CORE, 0, 0, inten], [cx, cy, sz, kind]));
    acc.tri(ids[0], ids[1], ids[2]);
    acc.tri(ids[1], ids[3], ids[2]);
  };
  quad(size, 0, tint); // tint 1 is the lamp itself; below 1 picks one of the stained pane colors
  if (halo > 0) quad(halo, 1, haloI);
}

// Flat ring (annulus) lying on the subumbrella; `gap` radians left open for a horseshoe.
function addGonad(acc, cx, cy, cz, radius, halfW, segs, vShell, hash, tilt = 0) {
  const base = acc.pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const a = i / segs, th = a * TAU;
    for (let f = 0; f <= 1; f++) {
      const rr = radius + (f * 2 - 1) * halfW;
      const px = cx + Math.cos(th) * rr, pz = cz + Math.sin(th) * rr;
      acc.v([px, cy + Math.sin(th) * rr * tilt, pz], [0, 1, 0], [PART.GONAD, a, vShell, hash], [a, f, hash, 0]);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2;
    acc.tri(a, a + 1, a + 2);
    acc.tri(a + 1, a + 3, a + 2);
  }
}

// Filament ribbons. `roots` are rest-pose root positions (the shader re-deforms them with the
// bell). rank spreads evenly so dropping the highest ranks thins the fringe evenly. The normal
// slot is free on ribbons and carries (own length, root contraction v, rank). A root may carry
// two extra numbers: [x, y, z, outward angle, v].
// Returns the per-tentacle data pinnules need.
function addTentacles(acc, roots, segs, width, len, rnd) {
  return roots.map((root, k) => {
    const rank = (k * 0.6180339887 + 0.37) % 1;
    const th = root[3] ?? Math.atan2(root[2], root[0]); // direction it drifts outward
    const rootV = root[4] ?? 1; // how much of the bell's contraction its root follows
    const u = ((th / TAU) % 1 + 1) % 1;
    const rr = rnd();
    const lm = len * (0.75 + 0.5 * rnd());
    const base = acc.pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const s = j / segs;
      for (let side = -1; side <= 1; side += 2) {
        acc.v(root, [lm, rootV, rank], [PART.TENT, u, s, rr], [side, width, rank, lm]);
      }
    }
    for (let j = 0; j < segs; j++) {
      const a = base + j * 2;
      acc.tri(a, a + 1, a + 2);
      acc.tri(a + 1, a + 3, a + 2);
    }
    return { root, u, rr, lm, rank };
  });
}

// Pinnules: short side filaments sprouting from a parent tentacle at parameter s0 (aAux.z).
// normal = (parent length, direction angle, parent rank).
function addPinnules(acc, tents, per, segs, plen, width, rnd) {
  for (const t of tents) {
    for (let p = 0; p < per; p++) {
      const s0 = 0.1 + 0.86 * (p + rnd() * 0.7) / per;
      const ang = rnd() * TAU;
      const base = acc.pos.length / 3;
      const len = plen * (0.6 + 0.8 * rnd());
      for (let j = 0; j <= segs; j++) {
        const s = j / segs;
        for (let side = -1; side <= 1; side += 2) {
          acc.v(t.root, [t.lm, ang, t.rank], [PART.PINN, t.u, s, t.rr], [side, width, s0, len]);
        }
      }
      for (let j = 0; j < segs; j++) {
        const a = base + j * 2;
        acc.tri(a, a + 1, a + 2);
        acc.tri(a + 1, a + 3, a + 2);
      }
    }
  }
}

// Oral arms: wide ribbons with several vertices across so the edges can ruffle.
function addArms(acc, roots, segs, across, len, width, rnd, rootV = 0.3, tang = 0) {
  roots.forEach((root) => {
    const th = root[3] ?? Math.atan2(root[2], root[0]);
    const u = ((th / TAU) % 1 + 1) % 1;
    const lm = len * (0.8 + 0.4 * rnd());
    const rr = rnd();
    const base = acc.pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const s = j / segs;
      for (let i = 0; i <= across; i++) {
        const x = -1 + (2 * i) / across;
        acc.v(root, [tang, 0, 1], [PART.ARM, u, s, rr], [x, width, root[4] ?? rootV, lm]);
      }
    }
    acc.strip(base, segs, across);
  });
}

// A single fat camera facing strip along a vertical path (manubrium, gut).
function addGut(acc, root, segs, widthMul, lenMul, inten = 1) {
  const base = acc.pos.length / 3;
  for (let j = 0; j <= segs; j++) {
    const s = j / segs;
    for (let side = -1; side <= 1; side += 2) {
      acc.v(root, [0, 0, 1], [PART.GUT, 0, s, inten], [side, widthMul, 0, lenMul]);
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = base + j * 2;
    acc.tri(a, a + 1, a + 2);
    acc.tri(a + 1, a + 3, a + 2);
  }
}

// Hanging lanterns (thuribles) under the vault: a thin chain from the ceiling to a glowing bulb.
// Ceiling height at a radius comes from the shell profile.
function ceilingAt(prof, r) {
  let best = PROFILES[prof](0.5)[1];
  for (let i = 0; i <= 200; i++) {
    const [rr, yy] = PROFILES[prof](i / 200);
    best = yy;
    if (rr >= r) break;
  }
  return best;
}
function addLamps(acc, prof, L, rnd, detail) {
  const n = Math.max(3, Math.round(L.n * Math.min(1, detail * 1.2)));
  for (let k = 0; k < n; k++) {
    const ring = L.rings[k % L.rings.length];
    const th = (k / n) * TAU * 1.0 + 0.3 * (rnd() - 0.5) + ring * 3.0;
    const r = ring * (0.9 + 0.2 * rnd());
    const top = ceilingAt(prof, r) * 0.97;
    const drop = L.drop[0] + (L.drop[1] - L.drop[0]) * rnd();
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    addGut(acc, [x, top, z], 4, L.chain, drop, 0.3);
    addCore(acc, top - drop, L.size * (0.75 + 0.5 * rnd()), 0, 0, x, z, 0.05 + 0.9 * rnd());
  }
}


// ---- the vault: an oblong, lopsided body (the cathedral) ----------------------------------------
// Not a dome of revolution: a long nave. Local axes: x along the length, z across, y up, the
// open underside at y near 0 (the margin). The cross-section is a pointed arch through the
// springing points (+-W, 0) and the ridge (0, H); W and H vary along the length (a fat tall
// head, a low tail, a hump near the far end), the whole body bends like a banana and its rim
// wanders up and down, so it reads as grown, not designed. s runs along the length (end to end),
// m across: 0 at the ridge, 1 at the rim. Units are bell radii like everything else here.
const clampN = (x, a, b) => Math.min(Math.max(x, a), b);
function makeVault(spec) {
  const A = spec.halfLength, Wz = spec.halfWidth, Hy = spec.height, P = spec.endPow || 2.4;
  const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const env = (q) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), P)), 1 / P);
  // a fat tall head toward -x, a low waist, a second hump, a narrowing tail
  const widthMul = (q) => 0.5 + 0.55 * gauss(q, -0.35, 0.45) + 0.12 * Math.sin(2.2 * q + 0.8) - 0.1 * sm(0.3, 1, q);
  const heightMul = (q) => 0.62 + 0.95 * gauss(q, -0.42, 0.34) + 0.32 * gauss(q, 0.38, 0.22) - 0.12 * sm(0.5, 1, q);
  const lean = (q) => 0.3 * Math.sin(q * 2.5 + 0.5); // the ridge sits off the middle, one flank gentler than the other
  const cz = (q) => spec.bend * (q * q - 0.25) + 0.16 * Math.sin(q * 2.1 + 0.5);
  const cy = (q) => spec.tilt * q + 0.14 * Math.sin(q * 1.7 + 0.4);
  const spires = spec.spires || [];
  const W = (q) => Math.max(1e-3, Wz * widthMul(q) * Math.pow(env(q), 0.9));
  const H = (q) => Math.max(1e-3, Hy * heightMul(q) * Math.pow(env(q), 0.7));
  // q in -1..1 along the length, m 0 ridge..1 rim, side -1 or +1. Returns [x, y, z].
  function at(q, m, side) {
    const w = W(q), h = H(q);
    const rho = (w * w + h * h) / (2 * w);
    const phia = Math.acos(clampN((rho - w) / rho, -1, 1));
    const phi = phia * (1 - m);
    const zz = w - rho + rho * Math.cos(phi);
    let yy = rho * Math.sin(phi);
    for (const sp of spires) {
      const k = Math.abs((q + 1) / 2 - sp.s) / sp.w;
      if (k < 1) yy += sp.h * (1 - k) * (1 - k) * Math.pow(Math.max(0, 1 - m / 0.12), 1.5);
    }
    return [A * q, yy + cy(q), side * zz + cz(q) + lean(q) * w * Math.pow(1 - m, 1.5)];
  }
  // Outward-facing unit normal of the surface at (q, m, side) by finite differences.
  function normal(q, m, side) {
    const e = 0.004;
    const q0 = clampN(q - e, -1, 1), q1 = clampN(q + e, -1, 1);
    const m0 = clampN(m - e, 0, 1), m1 = clampN(m + e, 0, 1);
    const a = at(q1, m, side), b = at(q0, m, side), c = at(q, m1, side), d = at(q, m0, side);
    const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dm = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = [du[1] * dm[2] - du[2] * dm[1], du[2] * dm[0] - du[0] * dm[2], du[0] * dm[1] - du[1] * dm[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return [0, 1, 0];
    n = [n[0] / l, n[1] / l, n[2] / l];
    const p = at(q, m, side);
    const inside = [A * q, cy(q) + 0.35 * H(q), cz(q) + lean(q) * W(q) * 0.5];
    if (n[0] * (p[0] - inside[0]) + n[1] * (p[1] - inside[1]) + n[2] * (p[2] - inside[2]) < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  }
  // The rim as a closed loop sampled by arc length (plan view): t in 0..1 -> point, outward angle.
  const loop = [];
  {
    const N = 480;
    const qs = [];
    for (let j = 0; j <= N; j++) {
      const t = (2 * j) / N - 1;
      qs.push(Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.7)));
    }
    const pts = [];
    for (let j = 0; j < qs.length; j++) pts.push({ q: qs[j], side: -1, p: at(qs[j], 1, -1) });
    for (let j = qs.length - 2; j >= 1; j--) pts.push({ q: qs[j], side: 1, p: at(qs[j], 1, 1) });
    let acc2 = 0;
    pts[0].c = 0;
    for (let j = 1; j < pts.length; j++) {
      acc2 += Math.hypot(pts[j].p[0] - pts[j - 1].p[0], pts[j].p[2] - pts[j - 1].p[2]);
      pts[j].c = acc2;
    }
    const closing = Math.hypot(pts[0].p[0] - pts[pts.length - 1].p[0], pts[0].p[2] - pts[pts.length - 1].p[2]);
    loop.total = acc2 + closing;
    loop.pts = pts;
  }
  function rimAt(t) {
    const L = loop.pts, target = (((t % 1) + 1) % 1) * loop.total;
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid].c <= target) lo = mid; else hi = mid; }
    const a = L[lo], b = L[Math.min(lo + 1, L.length - 1)];
    const f = b.c > a.c ? (target - a.c) / (b.c - a.c) : 0;
    const p = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f];
    // outward in plan: perpendicular to the loop tangent, away from the center line
    let tx = b.p[0] - a.p[0], tz = b.p[2] - a.p[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    let ox = tz, oz = -tx;
    const cl = [A * a.q, cz(a.q) + lean(a.q) * W(a.q) * 0.3];
    if (ox * (p[0] - cl[0]) + oz * (p[2] - cl[1]) < 0) { ox = -ox; oz = -oz; }
    // at the very ends the center line is degenerate: point along +-x
    if (Math.abs(a.q) > 0.985) { ox = Math.sign(a.q); oz = 0; }
    return { p, ang: Math.atan2(oz, ox), q: a.q, side: a.side, ox, oz };
  }
  return { at, normal, rimAt, W, H, cz, cy, A };
}

// Two halves (one per side) of the shell, rows crowding toward the ends where the section closes.
function addVaultShell(acc, V, nm, nv) {
  for (let side = -1; side <= 1; side += 2) {
    const base = acc.pos.length / 3;
    for (let j = 0; j <= nv; j++) {
      const t = (2 * j) / nv - 1;
      const q = Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.7));
      for (let i = 0; i <= nm; i++) {
        const m = 1 - Math.pow(1 - i / nm, 1.35);
        const p = V.at(q, m, side), n = V.normal(q, m, side);
        acc.v(p, n, [PART.SHELL, (q + 1) / 2, m, side > 0 ? 1 : 0], [0, 0, 0, 0]);
      }
    }
    acc.strip(base, nv, nm);
  }
}

// Frilled hem all round the rim loop.
function addVaultSkirt(acc, V, nu, rows) {
  const base = acc.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    const q = j / rows;
    for (let i = 0; i <= nu; i++) {
      const r = V.rimAt(i / nu);
      acc.v(r.p, [r.ox, 0, r.oz], [PART.SKIRT, i / nu, q, 0], [0, 0, 0, 0]);
    }
  }
  acc.strip(base, rows, nu);
}

function buildVaultGeometry(recipe, detail, seed) {
  const rnd = rng(seed);
  const acc = new Acc();
  const d = (n, min = 2) => Math.max(min, Math.round(n * detail));
  const v = recipe.vault;
  const V = makeVault(v);
  const rr = (a, b) => a + (b - a) * rnd();

  addVaultShell(acc, V, d(v.shell[0], 6), d(v.shell[1], 24));
  if (v.skirt) addVaultSkirt(acc, V, d(v.skirt[0], 48), Math.max(1, Math.round(v.skirt[1] * Math.min(1, detail * 1.5))));

  // heart lamps and halos along the nave
  for (const c of v.cores || []) {
    const p = V.at(c.q, 0, 1);
    addCore(acc, V.cy(c.q) + V.H(c.q) * (c.y ?? 0.55), c.size, c.halo || 0, c.haloI ?? 0.14, p[0], V.cz(c.q), 1);
  }

  // glowing hoops hanging in the nave (the rose-window rings seen from below)
  for (const g of v.gonads || []) {
    addGonad(acc, V.A * g.q, V.cy(g.q) + V.H(g.q) * (g.y ?? 0.6), V.cz(g.q), V.W(g.q) * g.rel, g.halfW, d(g.segs || 64, 16), g.m ?? 0.45, rnd(), 0);
  }

  // oral arms: frilly pillars from the vault, veils from the rim
  for (const a of v.arms || []) {
    const roots = [];
    const n = Math.max(4, Math.round(a.n * (detail < 0.6 ? 0.6 : 1)));
    for (let k = 0; k < n; k++) {
      if (a.kind === 'veils') {
        const r = V.rimAt((k + 0.5 + 0.2 * (rnd() - 0.5)) / n);
        roots.push([r.p[0], r.p[1], r.p[2], r.ang, 1]);
      } else {
        const q = -0.86 + 1.72 * ((k + 0.5 + 0.3 * (rnd() - 0.5)) / n);
        const side = k % 2 ? 1 : -1;
        const m = a.m ?? 0.2;
        const p = V.at(q, m, side);
        roots.push([p[0], p[1] * 0.98, p[2], rnd() * TAU, m]);
      }
    }
    addArms(acc, roots, d(a.segs, 8), a.across >= 4 && detail < 0.6 ? 2 : a.across, a.len, a.width, rnd, 0.3, a.tangent || 0);
  }

  // threads: along the whole rim, and slow ropes hanging from the ridge
  for (const t of v.tent || []) {
    const roots = [];
    const n = Math.max(6, Math.round(t.n * (detail < 0.6 ? 0.6 : 1)));
    for (let k = 0; k < n; k++) {
      if (t.kind === 'keel') {
        const q = -0.88 + 1.76 * ((k + rnd()) / n);
        const p = V.at(q, t.m ?? 0.04, rnd() < 0.5 ? -1 : 1);
        roots.push([p[0], p[1] * 0.985, p[2] * 0.6 + V.cz(q) * 0.4, rnd() * TAU, 0.05]);
      } else {
        const r = V.rimAt((k + 0.5 + 0.8 * (rnd() - 0.5)) / n);
        roots.push([r.p[0], r.p[1], r.p[2], r.ang, 1]);
      }
    }
    addTentacles(acc, roots, d(t.segs, 6), t.width, t.len, rnd);
  }

  // hanging lanterns
  if (v.lamps && detail >= 0.5) {
    const L = v.lamps;
    const n = Math.max(4, Math.round(L.n * Math.min(1, detail * 1.2)));
    for (let k = 0; k < n; k++) {
      const q = -0.82 + 1.64 * ((k + rnd()) / n);
      const m = L.ms[k % L.ms.length];
      const p = V.at(q, m, rnd() < 0.5 ? -1 : 1);
      const top = [p[0], p[1] * 0.97, p[2]];
      const drop = rr(L.drop[0], L.drop[1]);
      addGut(acc, top, 4, L.chain, drop, 0.3);
      addCore(acc, top[1] - drop, L.size * rr(0.75, 1.25), 0, 0, top[0], top[2], 0.05 + 0.9 * rnd());
    }
  }

  const g = acc.build();
  g.userData.recipe = recipe;
  return g;
}

// ---- recipe -> geometry -------------------------------------------------------------------
// recipe: {
//   profile, shell: [nu, nv], cluster, skirt: [nu, rows] | null,
//   core: { y, size, halo } | null (lamp quad and an optional wide halo quad),
//   gonads: [{ cx, cz, radius | rel (of the profile radius at v), halfW, v, segs, tilt, dy }...] (height taken from the profile),
//   arms: { n, rootR, rootV, rootY, off, segs, across, len, width, tangent } | [groups] | null,
//         (tangent: radians added to the direction the sheet is wide in; PI/2 hangs it as a curtain)
//   lamps: { n, rings: [radii], drop: [min, max], size, chain } | null (hanging lanterns),
//   tent: { n, segs, rootR (of margin radius), width, len, jitter, off, roots? } | null,
//   fringe: { n, segs, width, len, rootR } | null,
//   pinn: { per, segs, len, width } | null,   (on `tent`)
//   gut: { y, segs, width, len } | null
// }
// detail scales segment counts: 1 = full, <1 = far LOD.
export function buildGeometry(recipe, detail = 1, seed = 1) {
  if (recipe.vault) return buildVaultGeometry(recipe, detail, seed);
  const rnd = rng(seed);
  const acc = new Acc();
  const d = (n, min = 2) => Math.max(min, Math.round(n * detail));
  const prof = recipe.profile;
  const [rm, ym] = PROFILES[prof](1);

  if (recipe.shell) addShell(acc, prof, d(recipe.shell[0], 12), d(recipe.shell[1], 4), PART.SHELL, recipe.cluster || 1);
  if (recipe.skirt) addSkirt(acc, prof, d(recipe.skirt[0], 12), Math.max(1, Math.round(recipe.skirt[1] * Math.min(1, detail * 1.5))));
  if (recipe.core) addCore(acc, recipe.core.y, recipe.core.size, recipe.core.halo || 0, recipe.core.haloI ?? 0.2);

  if (recipe.gonads) {
    for (const g of recipe.gonads) {
      const py = PROFILES[prof](g.v)[1];
      const gr = g.rel ? PROFILES[prof](g.v)[0] * g.rel : g.radius;
      addGonad(acc, g.cx, py * (g.dy ?? 0.9), g.cz, gr, g.halfW, d(g.segs || 22, 8), g.v, rnd(), g.tilt || 0);
    }
  }

  if (recipe.arms) {
    // one group or several (oral arms inside, veils at the margin)
    for (const a of Array.isArray(recipe.arms) ? recipe.arms : [recipe.arms]) {
      const rv = a.rootV ?? 0.3;
      const ry = PROFILES[prof](rv)[1] * (a.rootY ?? 0.6);
      const roots = [];
      const n = Math.max(3, Math.round(a.n * (detail < 0.6 ? 0.6 : 1)));
      for (let k = 0; k < n; k++) {
        const th = (k / n) * TAU + (a.off || 0.4);
        const rr = a.rootR ?? 0.12;
        roots.push([Math.cos(th) * rr, ry, Math.sin(th) * rr]);
      }
      addArms(acc, roots, d(a.segs, 5), a.across >= 4 && detail < 0.6 ? 2 : a.across, a.len, a.width, rnd, rv, a.tangent || 0);
    }
  }

  if (recipe.tent) {
    const t = recipe.tent;
    let roots = t.roots;
    if (!roots) {
      roots = [];
      const n = Math.max(2, Math.round(t.n * (detail < 0.6 ? 0.6 : 1)));
      for (let k = 0; k < n; k++) {
        const th = ((k + (t.jitter ?? 0.2) * (rnd() - 0.5)) / n) * TAU + (t.off || 0);
        const rr = rm * (t.rootR ?? 0.94);
        roots.push([Math.cos(th) * rr, ym, Math.sin(th) * rr]);
      }
    }
    const tents = addTentacles(acc, roots, d(t.segs, 5), t.width, t.len, rnd);
    if (recipe.pinn && detail >= 0.6) addPinnules(acc, tents, recipe.pinn.per, recipe.pinn.segs, recipe.pinn.len, recipe.pinn.width, rnd);
  }

  if (recipe.fringe && detail >= 0.35) {
    const f = recipe.fringe;
    const roots = [];
    const n = Math.max(6, Math.round(f.n * Math.min(1, detail * 1.3)));
    for (let k = 0; k < n; k++) {
      const th = ((k + 0.3 * (rnd() - 0.5)) / n) * TAU;
      const rr = rm * (f.rootR ?? 1.0);
      roots.push([Math.cos(th) * rr, ym, Math.sin(th) * rr]);
    }
    addTentacles(acc, roots, d(f.segs, 3), f.width, f.len, rnd);
  }

  if (recipe.lamps && detail >= 0.5) addLamps(acc, prof, recipe.lamps, rnd, detail);

  if (recipe.gut) addGut(acc, [0, recipe.gut.y, 0], d(recipe.gut.segs, 4), recipe.gut.width, recipe.gut.len || 1);

  const g = acc.build();
  g.userData.recipe = recipe;
  return g;
}
