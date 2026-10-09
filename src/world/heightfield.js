// Analytic terrain height function. Expensive: call through G.world.heightAt (cached grid)
// except when building far terrain or the grid itself (World runs this in Web Workers).
// OWNER: terrain builder (may refine shapes, but must keep LOC heights roughly as designed:
// village plateau 2.5 to 6.5 m, watchtower ~55 to 70 m, prologue pass ~90 to 120 m,
// idol hill top ~45 to 60 m, lake shore ~0.4 m at the waterline).
//
// Exports: computeHeight(x, z), naturalHeight(x, z), lakeSDF(x, z), riverInfo(x, z),
// escarpmentZ(x), MOUNTAIN (shape constants shared with the terrain shader).
//
// Shape summary:
//   valley bowl + broad foothills, a mountain ring of ridged and derivative-eroded noise whose
//   envelope grows with distance (layered ranges to ~4 km), a narrow pass gorge to the
//   south-west, a river gorge to the east with a hanging valley and the falls cliff, a north
//   escarpment, a flat reed marsh at ice level west of the lake, and the lake bed.
// Everything is pure math on module constants so it runs identically in workers.
import { noise } from '../core/Noise.js';
import { rng } from '../core/util.js';
import { LAKE, FLAT_PADS, ROADS, RIVER } from './layout.js';

const noise2 = noise.noise2;
const fbm2 = noise.fbm2;

const ss = (e0, e1, x) => {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// ---------------------------------------------------------------------------------------------
// Value noise with analytic derivatives (quintic), used by the eroded fbm.
const VP = new Uint8Array(512);
const VV = new Float32Array(256);
{
  const r = rng(77123);
  for (let i = 0; i < 256; i++) { VP[i] = i; VV[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = VP[i]; VP[i] = VP[j]; VP[j] = t; }
  for (let i = 0; i < 256; i++) VP[i + 256] = VP[i];
}
let ndx = 0, ndz = 0;
function vnoised(x, z) {
  const xf = Math.floor(x), zf = Math.floor(z);
  const fx = x - xf, fz = z - zf;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const i = xf & 255, j = zf & 255;
  const pi = VP[i], pi1 = VP[i + 1];
  const a = VV[VP[pi + j]], b = VV[VP[pi1 + j]], c = VV[VP[pi + j + 1]], d = VV[VP[pi1 + j + 1]];
  const k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  ndx = dux * (k1 + k4 * uz);
  ndz = duz * (k2 + k4 * ux);
  return a + k1 * ux + k2 * uz + k4 * ux * uz;
}

// Derivative-damped fbm (Quilez): detail fades on steep slopes, so valleys stay smooth and
// ridges keep sharp gullies. Returns roughly [-0.6, 0.6].
function erodedFbm(x, z, oct) {
  let a = 0, b = 0.5, dx = 0, dz = 0, px = x, pz = z;
  for (let o = 0; o < oct; o++) {
    const n = vnoised(px, pz);
    dx += ndx; dz += ndz;
    a += b * n / (1 + dx * dx + dz * dz);
    b *= 0.5;
    const nx = 1.6 * px - 1.2 * pz, nz = 1.2 * px + 1.6 * pz;
    px = nx + 3.1; pz = nz - 1.7;
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Polylines with precomputed segments (allocation-free nearest queries).
function prepLine(pts, pad = 0) {
  const n = pts.length - 1;
  const seg = new Float64Array(n * 9);
  let s = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const [ax, az, ah = 0] = pts[i], [bx, bz, bh = 0] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    seg.set([ax, az, dx, dz, 1 / (len * len || 1e-9), s, len, ah, bh - ah], i * 9);
    s += len;
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
    minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz);
  }
  return { n, seg, length: s, minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
// Result of the last nearest() call.
const NR = { d: 0, s: 0, t: 0, seg: 0, h: 0, side: 1 };
function nearest(line, x, z) {
  const sg = line.seg;
  let bd = Infinity, bt = 0, bi = 0, side = 1;
  for (let i = 0, o = 0; i < line.n; i++, o += 9) {
    const ax = sg[o], az = sg[o + 1], dx = sg[o + 2], dz = sg[o + 3];
    let t = ((x - ax) * dx + (z - az) * dz) * sg[o + 4];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - dx * t, ez = z - az - dz * t;
    const d2 = ex * ex + ez * ez;
    if (d2 < bd) { bd = d2; bt = t; bi = i; side = dx * ez - dz * ex; }
  }
  const o = bi * 9;
  NR.d = Math.sqrt(bd); NR.t = bt; NR.seg = bi; NR.side = side < 0 ? -1 : 1;
  NR.s = sg[o + 5] + bt * sg[o + 6];
  NR.h = sg[o + 7] + bt * sg[o + 8];
  return NR;
}

const PASS_ROAD = ROADS.find((r) => r.id === 'pass').pts;
// Pass corridor extended out through the mountains so the road has a way out of the valley.
const PASS_LINE = prepLine([[-1700, 1500], [-1250, 1150], [-900, 860], [-740, 720], ...PASS_ROAD.slice(0, 5)], 160);
// River with its bed heights, extended upstream into the eastern gorge.
const RIVER_EXT = [[1800, -10, 300], [1250, -30, 150], [900, -52, 96], ...RIVER.pts];
const RIVER_LINE = prepLine(RIVER_EXT, 262);
const RIVER_NEAR = prepLine(RIVER.pts, RIVER.width * 0.5 + 40);
// The falls: the river drops off a near-vertical cliff at x ~ 451; the ice curtain hangs a few
// meters in front of it (west) from a rock lintel, leaving a dark alcove (cave mouth) behind.
export const FALLS = { x: 451, z: -82, top: 36, bottom: 9, curtainX: 446.5, caveZ: -84, caveW: 5 };
const fallsBed = (t) => FALLS.top - (FALLS.top - FALLS.bottom) * ss(0.0, 0.22, t);

// North escarpment: cliff line z(x) (north of it is higher).
const ESC = [[-470, -318], [-330, -346], [-200, -366], [-120, -386], [-60, -392], [20, -380],
  [90, -372], [160, -376], [240, -364], [330, -344], [430, -318]];
export function escarpmentZ(x) {
  if (x <= ESC[0][0]) return ESC[0][1];
  for (let i = 0; i < ESC.length - 1; i++) {
    const [ax, az] = ESC[i], [bx, bz] = ESC[i + 1];
    if (x <= bx) return az + (bz - az) * ((x - ax) / (bx - ax));
  }
  return ESC[ESC.length - 1][1];
}

// Valley frame: normalized elliptical distance from the valley center.
const VC = { x: 20, z: -40, rx: 720, rz: 640 };
export const MOUNTAIN = { snowline: 140, rockline: 900 };

// ---------------------------------------------------------------------------------------------
// Lake shoreline.
function lakeE(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Signed distance to the shoreline in meters, negative inside the lake.
export function lakeSDF(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  const e = Math.sqrt(dx * dx + dz * dz);
  const ang = Math.atan2(dz, dx);
  const c = Math.cos(ang), s = Math.sin(ang);
  const southness = ss(0.35, 0.9, s); // +z is south, the village side
  const amp = mix(0.12, 0.03, southness);
  const wob = fbm2(c * 1.4 + 7.1, s * 1.4 - 3.3, 3) * amp + fbm2(c * 5 + 2, s * 5 + 9, 2) * amp * 0.25;
  const localR = mix(LAKE.rx, LAKE.rz, Math.abs(s));
  return (e - (1 + wob)) * localR;
}

// Smoothly saturating valley bowl: low in the middle, rising toward the mountains.
function bowl(dv) {
  const t = Math.max(0, dv - 0.3);
  return 300 * (1 - Math.exp(-Math.pow(t, 1.5) * 0.4));
}

// The mountain ring. Envelope grows outward so successive ranges peek over each other;
// ridged noise (1 - |n|, squared) makes sharp crests with broad cirque-like hollows, the
// eroded fbm adds couloirs and spurs that fade on steep faces.
function hash3(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Union (max) of concave pyramids on a jittered lattice: horn peaks with three or four
// faces (polygonal distance), aretes where faces and neighbours meet, broad cirque hollows
// between them. Returns 0..1.
const PEAKS = new Map();
function peakCell(cx, cz, seed, rMin, rMax) {
  const key = (cx + 4096) * 8192 + (cz + 4096) + seed * 67108864;
  let c = PEAKS.get(key);
  if (c) return c;
  const nf = 3 + (hash3(cx, cz, seed + 4) > 0.5 ? 1 : 0);
  const a0 = hash3(cx, cz, seed + 5) * 6.2832;
  const dirs = new Float64Array(nf * 2);
  for (let k = 0; k < nf; k++) {
    const an = a0 + (k * 6.2832) / nf + (hash3(cx, cz, seed + 6 + k) - 0.5) * 0.7;
    dirs[k * 2] = Math.cos(an); dirs[k * 2 + 1] = Math.sin(an);
  }
  c = {
    px: cx + 0.1 + 0.8 * hash3(cx, cz, seed),
    pz: cz + 0.1 + 0.8 * hash3(cx, cz, seed + 1),
    a: 0.5 + 0.5 * hash3(cx, cz, seed + 2),
    r: rMin + (rMax - rMin) * hash3(cx, cz, seed + 3),
    nf, dirs,
  };
  PEAKS.set(key, c);
  return c;
}

function peakField(x, z, cell, seed, rMin, rMax, pw) {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  let best = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const c = peakCell(ix + i, iz + j, seed, rMin, rMax);
      const dx = fx - c.px, dz = fz - c.pz;
      const de = Math.sqrt(dx * dx + dz * dz);
      if (de >= c.r * 1.25) continue;
      // Polygonal distance: max over a few face directions (a pyramid), blended with round.
      let dp = 0;
      const dr = c.dirs;
      for (let k = 0; k < c.nf; k++) {
        const v = dx * dr[k * 2] + dz * dr[k * 2 + 1];
        if (v > dp) dp = v;
      }
      const d = (de * 0.35 + dp * 1.25 * 0.65) / c.r;
      if (d >= 1) continue;
      const v = c.a * Math.pow(1 - d, pw);
      if (v > best) best = v;
    }
  }
  return best;
}

function mountainHeight(x, z, dv, ux, uz) {
  const massif = 0.5 + 0.5 * noise2(x * 0.00038 + 3.3, z * 0.00038 - 1.7);
  const north = ss(0.2, 0.95, -uz);
  const south = ss(0.25, 0.9, uz);
  const east = ss(0.4, 0.95, ux);
  const eNear = 300 + 260 * massif + 280 * north * (0.6 + 0.4 * massif) - 130 * south + 60 * east;
  const env = eNear * (1 + 0.45 * ss(1.3, 4.8, dv)) + 300 * ss(2.2, 5.0, dv) + 140 * south * ss(2.5, 5, dv);

  // Domain warp bends ridgelines so pyramid unions do not look like a lattice.
  const wx = x + 230 * noise2(x * 0.0006 + 1.3, z * 0.0006 + 7.1) + 50 * noise2(x * 0.003, z * 0.003);
  const wz = z + 230 * noise2(x * 0.0006 - 4.2, z * 0.0006 + 2.6) + 50 * noise2(x * 0.003 + 5, z * 0.003 - 2);
  const pa = peakField(wx, wz, 1050, 11, 0.85, 1.25, 1.35);
  const pb = peakField(wx + 170, wz - 90, 430, 29, 0.8, 1.15, 1.2);
  // Sharp secondary aretes: ridged noise that only bites high on the massifs.
  const rr = 1 - Math.abs(noise2(wx * 0.0042 + 2.2, wz * 0.0042 - 8.1));
  const e = erodedFbm(wx * 0.0018 + 0.37, wz * 0.0018 - 0.71, 8);
  let s = 0.05 + 0.78 * pa + 0.3 * pb * (0.35 + 0.65 * pa) + 0.26 * e * (0.25 + 0.75 * pa) + 0.07 * rr * rr * rr * pa;
  s = s < 0 ? 0 : s;
  return env * s;
}

// River valley profile: the bed plus banks that widen with distance.
function riverBank(d) {
  const e = Math.max(0, d - 9);
  return 0.6 + 0.16 * e + 0.0016 * e * e;
}

// Natural terrain before pads, roads, the river channel and the lake carving.
function natural(x, z, sd) {
  const dvx = (x - VC.x) / VC.rx, dvz = (z - VC.z) / VC.rz;
  const dv = Math.sqrt(dvx * dvx + dvz * dvz);
  let h = bowl(dv);

  // Foothills, calmer near the shore and the village fields.
  const dl = Math.max(0, sd);
  const hillAmp = 2.5 + 22 * ss(10, 280, dl);
  h += fbm2(x * 0.0026 + 4.1, z * 0.0026 - 2.2, 4) * hillAmp;
  h += erodedFbm(x * 0.011, z * 0.011, 4) * 5 * ss(20, 160, dl);

  // Mountain ring, cut by the pass gorge and the river gorge.
  let m = ss(0.78, 1.42, dv);
  if (m > 0) {
    const ux = dvx / dv, uz = dvz / dv;
    // Gorges: warped distance so the walls wander, with spurs reaching into the corridor.
    const gx = x + 70 * noise2(x * 0.0021 + 3.1, z * 0.0021), gz = z + 70 * noise2(x * 0.0021, z * 0.0021 - 6.4);
    const spur = 30 * noise2(x * 0.006 - 1.9, z * 0.006 + 4.2);
    if (x < PASS_LINE.maxX && z > PASS_LINE.minZ) m *= ss(30 + spur, 170 + spur, nearest(PASS_LINE, gx, gz).d);
    if (x > RIVER_LINE.minX && z > RIVER_LINE.minZ && z < RIVER_LINE.maxZ) m *= mix(0.03, 1, ss(50 + spur, 250 + spur, nearest(RIVER_LINE, gx, gz).d));
    if (m > 0) h += m * mountainHeight(x, z, dv, ux, uz);
  }

  // North escarpment above the lake's north shore (bear den cliffs): stepped tiers whose
  // height varies along the line, with buttresses, notches and talus. Fades out to the north
  // where the mountains take over.
  if (z < -280 && z > -720 && x > -480 && x < 460) {
    const zc = escarpmentZ(x) + 10 * noise2(x * 0.012, 3.7) + 3 * noise2(x * 0.05, 1.1);
    const along = ss(-480, -380, x) * ss(460, 380, x) * ss(-720, -560, z);
    const vary = 0.6 + 0.4 * noise2(x * 0.006, 9.3) + 0.12 * noise2(x * 0.02, 4.4);
    const hgt = Math.max(8, 30 * vary);
    const tier1 = ss(zc + 4, zc - 5, z);
    const z2 = zc - 26 - 12 * noise2(x * 0.01, 6.6);
    const tier2 = ss(z2 + 4, z2 - 9, z) * (10 + 8 * (0.5 + 0.5 * noise2(x * 0.009, 2.1)));
    const talus = ss(zc + 22, zc + 3, z) * 3.5 * vary;
    h += along * (tier1 * hgt + tier2 + talus);
  }

  // Hanging valley east of the falls: a cliff line across the river valley.
  if (x > 400 && z > FALLS.z - 270 && z < FALLS.z + 270) {
    const dzF = Math.abs(z - FALLS.z);
    const xc = FALLS.x + 7 * (noise2(z * 0.018, 5.5) - noise2(FALLS.z * 0.018, 5.5)) * ss(10, 40, dzF) + 2.5 * noise2(z * 0.09, 1.3) * ss(8, 30, dzF);
    const wdt = 1.6 + 5 * ss(12, 60, dzF);
    const step = ss(xc - wdt, xc + wdt, x) * (1 - ss(140, 260, dzF));
    h += step * 40;
  }

  // Featured hills.
  h += gauss(x, z, 200, 230, 75) * 40; // idol hill
  h += gauss(x, z, -40, 222, 42) * 9; // sledding hill
  h += gauss(x, z, -362, 344, 80) * 22; // watchtower ridge
  h += gauss(x, z, -300, 330, 60) * 8;
  h += gauss(x, z, 470, -160, 110) * 24; // eastern shoulder above the falls (north side)
  h += gauss(x, z, 480, 20, 100) * 18; // eastern shoulder (south side)

  // River valley: cut down toward the bed (and fill right at the channel so ice never floats).
  if (x > RIVER_LINE.minX && z > RIVER_LINE.minZ && z < RIVER_LINE.maxZ) {
    const n = nearest(RIVER_LINE, x, z);
    if (n.d < 260) {
      let bed = n.h;
      // Sharpen the falls segment into a cliff profile (top at segment start).
      if (n.seg === 5) bed = fallsBed(n.t);
      const v = bed + riverBank(n.d);
      let hc = Math.min(h, v);
      if (n.d < RIVER.width * 0.5 + 14) hc = Math.max(hc, bed + 0.6);
      h = mix(h, hc, 1 - ss(70, 250, n.d));
    }
  }
  return h;
}

export function naturalHeight(x, z) {
  return natural(x, z, lakeE(x, z) < 3.2 ? lakeSDF(x, z) : 1e4);
}

// Village plateau: low at the shore, rising gently inland.
function villageTarget(x, z) {
  return 2.5 + Math.min(4, Math.max(0, (z - 55) * 0.035)) + fbm2(x * 0.03, z * 0.03, 2) * 0.35;
}

const PADS = FLAT_PADS.map((p) => ({ ...p, village: p.x === 0 && p.z === 115, target: null, out: p.r + p.blend }));
function padTarget(p) {
  if (p.target === null) p.target = naturalHeight(p.x, p.z);
  return p.target;
}

// Terrain with pads applied (used as the reference height for roads).
function base(x, z, sd) {
  let h = natural(x, z, sd);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const dx = x - p.x, dz = z - p.z;
    if (dx > p.out || dx < -p.out || dz > p.out || dz < -p.out) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > p.out) continue;
    const w = ss(p.out, p.r, d);
    h = mix(h, p.village ? villageTarget(x, z) : padTarget(p), w);
  }
  return h;
}
function baseHeight(x, z) {
  return base(x, z, lakeE(x, z) < 3.2 ? lakeSDF(x, z) : 1e4);
}

// Roads: precomputed, smoothed height profiles along arc length (so road grades are gentle
// and computeHeight does not re-evaluate the terrain at the centerline per sample).
const ROAD_STEP = 2;
const ROADLINES = ROADS.map((r) => ({ ...prepLine(r.pts, r.width * 0.5 + 8), half: r.width * 0.5, id: r.id, prof: null }));
function roadProfile(rl) {
  if (rl.prof) return rl.prof;
  const n = Math.ceil(rl.length / ROAD_STEP) + 1;
  const raw = new Float32Array(n);
  const sg = rl.seg;
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = Math.min(rl.length, k * ROAD_STEP);
    while (seg < rl.n - 1 && sg[seg * 9 + 5] + sg[seg * 9 + 6] < s) seg++;
    const o = seg * 9, t = Math.min(1, (s - sg[o + 5]) / (sg[o + 6] || 1));
    raw[k] = baseHeight(sg[o] + sg[o + 2] * t, sg[o + 1] + sg[o + 3] * t);
  }
  // Two box-filter passes (about 20 m window), endpoints kept so junctions meet the terrain.
  let a = raw, b = new Float32Array(n);
  const R = 5;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      let sum = 0, c = 0;
      for (let q = Math.max(0, k - R); q <= Math.min(n - 1, k + R); q++) { sum += a[q]; c++; }
      b[k] = sum / c;
    }
    [a, b] = [b, a];
  }
  for (let k = 0; k < n; k++) {
    const e = Math.min(k, n - 1 - k) / 6;
    if (e < 1) a[k] = mix(raw[k], a[k], e);
  }
  rl.prof = a;
  return a;
}
function roadHeightAt(rl, s) {
  const p = roadProfile(rl);
  const f = s / ROAD_STEP, i = Math.min(p.length - 2, Math.floor(f));
  return p[i] + (p[i + 1] - p[i]) * (f - i);
}

// Signed info about the river for the terrain and water builders: returns
// { d, bed, s, t, seg } for the nearest point on the in-valley river (or null if far).
export function riverInfo(x, z) {
  if (x < RIVER_NEAR.minX || x > RIVER_NEAR.maxX || z < RIVER_NEAR.minZ || z > RIVER_NEAR.maxZ) return null;
  const n = nearest(RIVER_NEAR, x, z);
  let bed = n.h;
  if (n.seg === 2) bed = fallsBed(n.t);
  return { d: n.d, bed, s: n.s, t: n.t, seg: n.seg };
}

// Marsh at the lake's west end: a mosaic of ice-level pools and low snowy tussock flats.
const MARSH = { x: -268, z: -82, rx: 105, rz: 78 };

// Full terrain height (lake bed below the ice inside the lake).
// Optional `info` receives { roadD, roadHalf, sd, riverD } (distances in meters, 1e4 when far;
// roadD is signed by the side of the centerline so it interpolates linearly across it)
// for the terrain shader masks; computing them here reuses the same nearest-point queries.
export function computeHeight(x, z, info) {
  const e = lakeE(x, z);
  const sd = e < 3.2 ? lakeSDF(x, z) : 1e4;
  let h = base(x, z, sd);
  if (info) { info.roadD = 1e4; info.roadHalf = 0; info.sd = sd; info.riverD = 1e4; }
  if (x < -760 || x > 760 || z < -760 || z > 760) return h;

  // Roads: level cross-section along the smoothed centerline profile.
  let bestEdge = 1e4;
  for (let i = 0; i < ROADLINES.length; i++) {
    const rl = ROADLINES[i];
    if (x < rl.minX || x > rl.maxX || z < rl.minZ || z > rl.maxZ) continue;
    const n = nearest(rl, x, z);
    if (info && n.d - rl.half < bestEdge) { bestEdge = n.d - rl.half; info.roadD = n.d * n.side; info.roadHalf = rl.half; }
    const lim = rl.half + 7;
    if (n.d > lim) continue;
    const w = ss(lim, rl.half + 0.5, n.d);
    h = mix(h, roadHeightAt(rl, n.s), w * 0.94);
  }

  // River channel: flat floor 1.2 m below the bed line, soft banks.
  if (x >= RIVER_NEAR.minX && x <= RIVER_NEAR.maxX && z >= RIVER_NEAR.minZ && z <= RIVER_NEAR.maxZ) {
    const n = nearest(RIVER_NEAR, x, z);
    if (info) info.riverD = n.d;
    const half = RIVER.width * 0.5;
    if (n.d < half + 16) {
      let bed = n.h;
      if (n.seg === 2) bed = fallsBed(n.t);
      const w = ss(half + 16, half - 1, n.d);
      h = mix(h, Math.min(h, bed - 1.2), w);
    }
  }

  // Lake: shore blends down to the waterline, a shallow shelf, then the deep bed.
  if (e < 1.6) {
    const northSide = ss(-160, -260, z);
    const shoreBlend = mix(38, 14, northSide);
    if (sd < shoreBlend) {
      if (sd >= 0) {
        const w = ss(0, shoreBlend, sd);
        h = mix(0.35, Math.max(h, 0.35), w);
      } else {
        const shelf = 0.35 - 1.35 * ss(0, -5, sd);
        const deep = LAKE.bed - 9 * ss(-30, -150, sd);
        h = mix(shelf, deep, ss(-3, -45, sd));
      }
    }
  }

  // Marsh: flat wetland at ice level that merges into the lake's west end.
  if (x > MARSH.x - MARSH.rx * 1.4 && x < MARSH.x + MARSH.rx * 1.6 && z > MARSH.z - MARSH.rz * 1.4 && z < MARSH.z + MARSH.rz * 1.4) {
    const mx = (x - MARSH.x) / MARSH.rx, mz = (z - MARSH.z) / MARSH.rz;
    const me = Math.sqrt(mx * mx + mz * mz) + noise2(x * 0.012, z * 0.012) * 0.18;
    let mw = ss(1.15, 0.75, me) * ss(-50, -8, sd < 0 ? sd : 0);
    if (sd >= 0) mw = ss(1.15, 0.75, me);
    if (mw > 0) {
      const n1 = fbm2(x * 0.042 + 1.7, z * 0.042 - 3.1, 3) + 0.3 * noise2(x * 0.12, z * 0.12);
      const wet = 0.38 * (1 - ss(-12, 70, sd)) - 0.12;
      const v = n1 + wet;
      const land = 0.3 + 0.22 * Math.max(0, -v) + 0.06 * noise2(x * 0.3, z * 0.3);
      const marshH = mix(land, -0.55, ss(-0.07, 0.1, v));
      h = mix(h, marshH, mw);
    }
  }

  // Cave mouth behind the frozen falls: a slot into the cliff at pool level (a rock lintel
  // mesh in Water.js roofs it).
  if (x > FALLS.x - 6 && x < FALLS.x + 9 && z > FALLS.caveZ - FALLS.caveW && z < FALLS.caveZ + FALLS.caveW) {
    const w = ss(FALLS.caveW, FALLS.caveW - 1.6, Math.abs(z - FALLS.caveZ)) * ss(FALLS.x + 8.5, FALLS.x + 5.5, x);
    h = mix(h, Math.min(h, FALLS.bottom + 0.3), w);
  }

  // Island with a stone circle.
  {
    const dx = x + 120, dz = z + 190;
    if (dx > -40 && dx < 40 && dz > -40 && dz < 40) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 40) {
        const isl = 0.4 + 7.1 * (1 - ss(6, 28, d)) + fbm2(x * 0.08, z * 0.08, 2) * 1.2 * (1 - ss(10, 28, d));
        h = Math.max(h, mix(isl, LAKE.bed, ss(28, 38, d)));
      }
    }
  }
  return h;
}
