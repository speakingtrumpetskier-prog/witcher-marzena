// Shared geometry helpers for the extra common species and the rare, odd trees. Owner: vegetation builder.
//
//   sweep(b, pts, sides, opts)        a polygon swept along a path with per vertex radius, color and snow
//                                     (lobed bark, ropes and strands, ribs). Winding is outward facing, so
//                                     the snow shader (front faces only) and the lighting are correct.
//   grow(b, cfg, p, d, len, rad, depth)  recursive limbs (bends, droops, children, tips)
//   spline(pts, per)                  Catmull-Rom smoothing of a control polyline
//   card(...), berry(...), icicle(...), ribbon(...), pad(...)   small building blocks
// Vectors are plain [x, y, z] arrays.
import { mixRGB, frond, snowLump } from './geo.js';
import { NEEDLE_UV } from './textures.js';

export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Rodrigues rotation of v around the unit axis by ang.
export function rot3(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = dot3(axis, v) * (1 - c);
  const x = cross3(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * d, v[1] * c + x[1] * s + axis[1] * d, v[2] * c + x[2] * s + axis[2] * d];
}

// Any unit vector perpendicular to d.
export function perp3(d) {
  const a = Math.abs(d[0]) < 0.8 ? [1, 0, 0] : [0, 0, 1];
  return norm3(cross3(d, a));
}

// Catmull-Rom smoothing: `per` samples per span, end points kept.
export function spline(pts, per = 4) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const q = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        q[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      }
      out.push(q);
    }
  }
  out.push(pts[n - 1].slice());
  return out;
}

// ---------------------------------------------------------------------------------------------
// sweep: a closed polygon of `sides` vertices swept along `pts`.
// opts:
//   radius(i, t, ang, k, dir)   radius of the vertex (default opts.rad or 0.1); t = 0..1 along the path,
//                          dir = the unit radial direction [x, y, z] of the vertex
//   color(i, t, ang, k, dir)    [r, g, b] (default opts.col)
//   snow                   [lo, hi, amount]: snow from the upward component of the radial direction,
//                          or a function (dirY, i, t, k, ang, dir) returning 0..1
//   flex                   wind flex weight: number or function of t
//   phase, uv (true: u runs 0..uvAround around the ring, v = meters along; the bark shader reads these),
//   uvAround (integer count of bark fissures around the ring; default from the radius), uvScale
//   twist                  extra angle added to every vertex, linear along the path (radians in total)
//   angle0                 start angle of the ring
//   capStart, capEnd       { color, snow } closes the end with a fan
//   side0                  initial side vector (default +x)
//   offset(i, t, ang, k, dir)   [dx, dy, dz] added to a vertex (jagged broken tops)
// Returns { rings, v0, t0 } (rings[i][k] = vertex index).
export function sweep(b, pts, sides, opts = {}) {
  const n = pts.length;
  const v0 = b.vcount, t0 = b.tcount;
  if (n < 2) return { rings: [], v0, t0 };
  const rad = typeof opts.radius === 'function' ? opts.radius : () => opts.rad ?? 0.1;
  const colFn = typeof opts.color === 'function' ? opts.color : () => opts.col || [0.3, 0.25, 0.2];
  const flexFn = typeof opts.flex === 'function' ? opts.flex : () => opts.flex ?? 0;
  const useUv = !!opts.uv;
  const K = useUv ? sides + 1 : sides;
  let uvAround = opts.uvAround;
  if (useUv && !uvAround) {
    const mid = Math.floor((n - 1) / 2);
    uvAround = Math.max(2, Math.min(40, Math.round(Math.PI * 2 * rad(mid, mid / (n - 1), 0, 0, [1, 0, 0]) / 0.32)));
  }
  let snowFn = null;
  if (typeof opts.snow === 'function') snowFn = opts.snow;
  else if (Array.isArray(opts.snow)) {
    const [lo, hi, amt] = opts.snow;
    snowFn = (dy) => sstep(lo, hi, dy) * amt;
  }
  let side = opts.side0 ? norm3(opts.side0) : [1, 0, 0];
  let vAcc = 0;
  const rings = [];
  const phase = opts.phase ?? 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1], tz = c[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let ux = side[0], uy = side[1], uz = side[2];
    const d = ux * tx + uy * ty + uz * tz;
    ux -= tx * d; uy -= ty * d; uz -= tz * d;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) {
      if (Math.abs(tx) < 0.9) { ux = 1 - tx * tx; uy = -tx * ty; uz = -tx * tz; } else { ux = -tz * tx; uy = -tz * ty; uz = 1 - tz * tz; }
      ul = Math.hypot(ux, uy, uz) || 1;
    }
    ux /= ul; uy /= ul; uz /= ul;
    side = [ux, uy, uz];
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const t = i / (n - 1);
    if (i > 0) vAcc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const ring = [];
    const fl = flexFn(t);
    for (let k = 0; k < K; k++) {
      const kk = k % sides;
      const ang = (kk / sides) * Math.PI * 2 + (opts.angle0 || 0) + (opts.twist || 0) * t;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
      const dir = [nx, ny, nz];
      const rr = rad(i, t, ang, kk, dir);
      const col = colFn(i, t, ang, kk, dir);
      const sn = snowFn ? snowFn(ny, i, t, kk, ang, dir) : 0;
      const off = opts.offset ? opts.offset(i, t, ang, kk, dir) : null;
      ring.push(b.v(pts[i][0] + nx * rr + (off ? off[0] : 0), pts[i][1] + ny * rr + (off ? off[1] : 0), pts[i][2] + nz * rr + (off ? off[2] : 0), nx, ny, nz, col,
        useUv ? (k / sides) * uvAround : 0, useUv ? vAcc * (opts.uvScale || 1) : 0, sn, fl, phase));
    }
    if (useUv) (b.seams ||= []).push([ring[0], ring[sides]]);
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const kn = useUv ? k + 1 : (k + 1) % sides;
      const A = rings[i][k], B = rings[i][kn], C = rings[i + 1][kn], D = rings[i + 1][k];
      b.tri(A, C, D);
      b.tri(A, B, C);
    }
  }
  const cap = (end, idx) => {
    if (!end) return;
    const p = pts[idx];
    const q = pts[idx === 0 ? 1 : n - 2];
    const dir = norm3(sub3(p, q));
    const ring = rings[idx];
    const c0 = b.v(p[0], p[1], p[2], dir[0], dir[1], dir[2], end.color || colFn(idx, idx === 0 ? 0 : 1, 0, 0), 0, 0, end.snow ?? 0, flexFn(idx === 0 ? 0 : 1), phase);
    for (let k = 0; k < sides; k++) {
      const kn = useUv ? k + 1 : (k + 1) % sides;
      if (idx === 0) b.tri(ring[k], ring[kn], c0); else b.tri(ring[kn], ring[k], c0);
    }
  };
  cap(opts.capStart, 0);
  cap(opts.capEnd, n - 1);
  return { rings, v0, t0 };
}

// Smooth normals for vertices [v0, end) (triangles from t0), glue the normals across uv seams, then
// snow from the surface normals (see snowPass).
export function finish(b, v0, t0, snow = [0.4, 0.8, 0.95]) {
  b.smooth(v0, t0, null);
  if (b.seams) {
    for (const [a, c] of b.seams) {
      if (a < v0 || c < v0) continue;
      const nx = b.n[a * 3] + b.n[c * 3], ny = b.n[a * 3 + 1] + b.n[c * 3 + 1], nz = b.n[a * 3 + 2] + b.n[c * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const k of [a, c]) { b.n[k * 3] = nx / l; b.n[k * 3 + 1] = ny / l; b.n[k * 3 + 2] = nz / l; }
    }
  }
  if (snow) snowPass(b, v0, snow[0], snow[1], snow[2]);
}

// Snow from the final surface normals: vertices [v0, end) whose normal faces up (after b.smooth) pick
// up aSnow = smoothstep(lo, hi, ny) * amount (never lowering what is already there).
export function snowPass(b, v0, lo, hi, amount) {
  for (let k = v0; k < b.vcount; k++) {
    const s = sstep(lo, hi, b.n[k * 3 + 1]) * amount;
    if (s > b.s[k]) b.s[k] = s;
  }
}

// Bark furrows: 0 in a groove, 1 on a ridge. m grooves around the ring (an integer), drifting with y.
export function furrow(ang, y, m, ph = 0, drift = 0.25) {
  const a = Math.abs(Math.sin(ang * m * 0.5 + y * drift + ph));
  return Math.pow(a, 0.7);
}

// ---------------------------------------------------------------------------------------------
// grow: a limb with a bent, drooping or rising path, tapering radius, and children.
// cfg: { r (rng), bend, up, grav, taper, segs(depth, len), sides(rad, depth), color(depth, t, k),
//        snow, flex(depth, t), kids(depth, len) -> count, kidAt [lo, hi], spread [lo, hi] (radians),
//        kidLen [lo, hi], kidRad, tip(p, d, rad, depth), onLimb(pts, depth, rad), minLen }
// p: start, d: start direction (unit), len: path length, rad: radius at the start, depth: levels left.
export function grow(b, cfg, p, d, len, rad, depth) {
  const r = cfg.r;
  const nSeg = cfg.segs ? cfg.segs(depth, len) : 5;
  const pts = [p.slice()];
  const dirs = [norm3(d)];
  let cd = norm3(d);
  let cp = p.slice();
  const step = len / nSeg;
  for (let s = 1; s <= nSeg; s++) {
    const f = s / nSeg;
    cd = norm3([
      cd[0] + (r() - 0.5) * cfg.bend,
      cd[1] + (r() - 0.5) * cfg.bend * 0.7 + (cfg.up - cfg.grav * f) * 0.28,
      cd[2] + (r() - 0.5) * cfg.bend,
    ]);
    if (cfg.pull) cd = norm3([cd[0] + cfg.pull[0], cd[1] + cfg.pull[1], cd[2] + cfg.pull[2]]);
    cp = [cp[0] + cd[0] * step, cp[1] + cd[1] * step, cp[2] + cd[2] * step];
    pts.push(cp.slice());
    dirs.push(cd);
  }
  const taper = cfg.taper ?? 0.35;
  const radAt = (t) => Math.max(0.008, rad * (1 - t * (1 - taper)));
  const sides = cfg.sides ? cfg.sides(rad, depth) : 5;
  const col = cfg.color || (() => [0.3, 0.25, 0.2]);
  const flex = cfg.flex || (() => 0.3);
  sweep(b, pts, sides, {
    radius: (i, t) => radAt(t),
    color: (i, t, ang, k) => col(depth, t, k),
    snow: cfg.finish ? null : (cfg.snow || [0.35, 0.8, 0.9]),
    flex: (t) => flex(depth, t),
    phase: r() * 6.28,
    uv: !!cfg.uv,
    uvAround: cfg.uv ? Math.max(2, Math.round(Math.PI * 2 * rad / 0.32)) : 0,
  });
  if (cfg.onLimb) cfg.onLimb(pts, depth, rad, dirs);
  if (depth > 0) {
    const nk = cfg.kids ? cfg.kids(depth, len) : 3;
    const gold = 2.399963;
    const base = r() * 6.28;
    for (let c = 0; c < nk; c++) {
      const tk = cfg.kidAt[0] + (cfg.kidAt[1] - cfg.kidAt[0]) * ((c + r() * 0.6) / Math.max(1, nk));
      const idx = Math.min(nSeg - 1, Math.floor(tk * nSeg));
      const fr = tk * nSeg - idx;
      const kp = lerp3(pts[idx], pts[idx + 1], fr);
      const pd = dirs[idx];
      const axis = rot3(perp3(pd), pd, base + c * gold);
      const ang = cfg.spread[0] + (cfg.spread[1] - cfg.spread[0]) * r();
      const kd = rot3(pd, axis, ang);
      const kl = len * (cfg.kidLen[0] + (cfg.kidLen[1] - cfg.kidLen[0]) * r()) * (1 - 0.25 * tk);
      if (kl < (cfg.minLen ?? 0.25)) continue;
      grow(b, cfg, kp, kd, kl, radAt(tk) * (cfg.kidRad ?? 0.6), depth - 1);
    }
    // the leader carries on as a short extension with its own tip
    if (cfg.tip) cfg.tip(pts[nSeg], dirs[nSeg], radAt(1), depth);
  } else if (cfg.tip) {
    cfg.tip(pts[nSeg], dirs[nSeg], radAt(1), depth);
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Alpha card with its bottom center at c, extending along `up`, spanning `right` (uv from an atlas
// rect). Normals radiate from `ball` (a soft volume), like the birch twig cards.
export function card(b, c, up, right, w, h, rect, tint, flex, phase, ball, snow = 0, snowTip = snow) {
  const prev = b.uvOverride;
  b.uvOverride = null;
  const hw = w * 0.5;
  const bl = [c[0] - right[0] * hw, c[1] - right[1] * hw, c[2] - right[2] * hw];
  const br = [c[0] + right[0] * hw, c[1] + right[1] * hw, c[2] + right[2] * hw];
  const corners = [bl, br, [br[0] + up[0] * h, br[1] + up[1] * h, br[2] + up[2] * h], [bl[0] + up[0] * h, bl[1] + up[1] * h, bl[2] + up[2] * h]];
  const uvs = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]];
  const ids = corners.map((p, i) => {
    const nv = norm3([p[0] - ball[0], p[1] - ball[1] + 4, p[2] - ball[2]]);
    return b.v(p[0], p[1], p[2], nv[0], nv[1], nv[2], tint, uvs[i][0], uvs[i][1], i > 1 ? snowTip : snow, flex * (i > 1 ? 1 : 0.4), phase);
  });
  b.tri(ids[0], ids[1], ids[2]);
  b.tri(ids[0], ids[2], ids[3]);
  b.uvOverride = prev;
}

// A berry: a squashed octahedron (8 triangles) of radius R.
export function berry(b, c, R, col, snow = 0) {
  const top = b.v(c[0], c[1] + R, c[2], 0, 1, 0, col, 0, 0, snow, 0.5, 0);
  const bot = b.v(c[0], c[1] - R * 0.9, c[2], 0, -1, 0, [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55], 0, 0, 0, 0.5, 0);
  const ids = [];
  for (let j = 0; j < 4; j++) {
    const a = (j / 4) * Math.PI * 2 + 0.4;
    ids.push(b.v(c[0] + Math.cos(a) * R, c[1], c[2] + Math.sin(a) * R, Math.cos(a), 0.1, Math.sin(a), [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], 0, 0, 0, 0.5, 0));
  }
  for (let j = 0; j < 4; j++) {
    const k = (j + 1) % 4;
    b.triFacing(top, ids[j], ids[k], 0, 1, 0);
    b.triFacing(bot, ids[k], ids[j], 0, -1, 0);
  }
}

// An icicle: a thin four sided cone hanging from p.
export function icicle(b, p, length, R, col, tipCol = col, flex = 0) {
  const ids = [];
  for (let j = 0; j < 4; j++) {
    const a = (j / 4) * Math.PI * 2 + 0.7;
    ids.push(b.v(p[0] + Math.cos(a) * R, p[1], p[2] + Math.sin(a) * R, Math.cos(a), 0.15, Math.sin(a), col, 0, 0, 0, flex, 0));
  }
  const tip = b.v(p[0], p[1] - length, p[2], 0, -1, 0, tipCol, 0, 0, 0, flex, 0);
  for (let j = 0; j < 4; j++) b.triFacing(ids[j], ids[(j + 1) % 4], tip, Math.cos((j + 0.5) / 4 * Math.PI * 2 + 0.7), 0, Math.sin((j + 0.5) / 4 * Math.PI * 2 + 0.7));
}

// A cloth strip along a path (a ribbon tied to a branch). `side` is the horizontal direction the
// strip is wide in. Flex 0 at the knot and 1 at the free end, so the wind flutters it.
export function ribbon(b, pts, width, col, side, phase = 0, flexFrom = 0) {
  const n = pts.length;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const w = width * (0.5 + 0.5 * Math.min(1, t * 4)) * (1 - 0.35 * t * t);
    const fl = flexFrom + (1 - flexFrom) * Math.min(1, t * 1.4);
    const sh = 0.8 + 0.2 * Math.sin(t * 9 + phase);
    const c = [col[0] * sh, col[1] * sh, col[2] * sh];
    const nrm = norm3(cross3(side, [0, -1, 0]));
    const p = pts[i];
    ids.push([
      b.v(p[0] - side[0] * w, p[1] - side[1] * w, p[2] - side[2] * w, nrm[0], nrm[1], nrm[2], c, 0, 0, 0, fl, phase),
      b.v(p[0] + side[0] * w, p[1] + side[1] * w, p[2] + side[2] * w, nrm[0], nrm[1], nrm[2], c, 0, 0, 0, fl, phase),
    ]);
  }
  for (let i = 0; i < n - 1; i++) {
    b.tri(ids[i][0], ids[i][1], ids[i + 1][1]);
    b.tri(ids[i][0], ids[i + 1][1], ids[i + 1][0]);
  }
}

// A small mound of snow (dome) at p. Wraps geo.snowLump with a deterministic rng.
export function snowMound(b, r, p, R, h, sectors = 6, flex = 0.2) {
  snowLump(b, p[0], p[1], p[2], R, h, r, sectors, flex, 0);
}

// ---------------------------------------------------------------------------------------------
// A needle pad: a rosette of needle fronds around (cx, cy, cz), like the Scots pine pads.
// lod 0 uses the textured tuft card (needle atlas), lower LODs plain fringed strips.
export const PAD_PAL = {
  dark: [0.012, 0.04, 0.03],
  light: [0.05, 0.13, 0.085],
  warm: [0.07, 0.15, 0.06],
};
export function pad(b, r, cx, cy, cz, R, lod, phase, opts = {}) {
  // opts.tex: use the textured tuft cards below lod 0 too (kinds whose lod 1 keeps the needle material)
  const textured = lod === 0 || !!opts.tex;
  const n = opts.n ?? (textured ? 7 : 5);
  const rot = r() * 6.28;
  const pal = opts.pal || PAD_PAL;
  const tilt = opts.tilt ?? (r() - 0.5) * 0.6;
  const sectors = lod === 0 ? 7 : 5;
  if (!textured) {
    // shaded core under the strips so the pad is not see-through (the textured tufts need none);
    // at lod 2 the core is the whole pad: a squat snowy dome
    const big = lod === 2 ? 1.9 : 1;
    const apex = b.v(cx, cy + R * 0.2 * big, cz, 0, 1, 0, lod === 2 ? mixRGB(pal.dark, pal.light, 0.5) : pal.dark, 0, 0, lod === 2 ? 0.75 : 0.35, 0.3, phase);
    const ids = [];
    for (let j = 0; j < sectors; j++) {
      const a = rot + (j / sectors) * Math.PI * 2;
      const rr = R * 0.5 * big * (0.8 + r() * 0.4);
      ids.push(b.v(cx + Math.cos(a) * rr, cy - R * 0.12 + tilt * Math.cos(a) * R * 0.2, cz + Math.sin(a) * rr, Math.cos(a), 0.5, Math.sin(a), mixRGB(pal.dark, pal.light, 0.25), 0, 0, 0.3, 0.6, phase));
    }
    for (let j = 0; j < sectors; j++) b.triFacing(apex, ids[j], ids[(j + 1) % sectors], 0, 1, 0);
    if (lod === 2) return;
  }
  for (let i = 0; i < n; i++) {
    const th = rot + (i + (r() - 0.5) * 0.4) * (Math.PI * 2 / n);
    const L = R * (0.85 + r() * 0.4);
    if (textured) {
      frond(b, { x: cx, y: cy + R * 0.12, z: cz }, th, L * 1.1, L * 0.5, L * 0.2, 0.18 + r() * 0.3, {
        rng: r, sRows: [0, 0.4, 0.75, 1], jag: 0.08, col: [[0.8, 0.84, 0.84], [1.12, 1.15, 1.08]],
        shade: 0.95 + r() * 0.2, snow: opts.snow ?? 0.34, sag: 0.25, r0: 0.05, phase: phase + r(), tipLift: L * 0.1 * r(),
        uvRect: NEEDLE_UV.pine, widthFn: (s) => Math.min(1, s / 0.15 + 0.3),
      });
    } else {
      frond(b, { x: cx, y: cy + R * 0.12, z: cz }, th, L, L * (0.34 + r() * 0.1), L * 0.22, 0.28 + r() * 0.25, {
        rng: r, sRows: lod === 1 ? [0, 0.6, 1] : [0, 1], jag: 0.3, col: [pal.dark, mixRGB(pal.light, pal.warm, r() * 0.7)],
        shade: 0.95 + r() * 0.2, snow: opts.snow ?? 0.4, sag: 0.3, r0: 0.05, phase: phase + r(), tipLift: L * 0.12 * r(),
      });
    }
  }
}
