// Analytic terrain height function. Expensive: call through G.world.heightAt (cached grid)
// except when building far terrain or the grid itself.
// OWNER: terrain builder (may refine shapes, but must keep LOC heights roughly as designed:
// village plateau 2.5 to 6.5 m, watchtower ~55 to 70 m, prologue pass ~90 to 120 m,
// idol hill top ~45 to 60 m, lake shore ~0.4 m at the waterline).
import { noise } from '../core/Noise.js';
import { clamp, lerp, smoothstep, nearestOnPolyline } from '../core/util.js';
import { LAKE, FLAT_PADS, ROADS, RIVER } from './layout.js';

const PASS_ROAD = ROADS.find((r) => r.id === 'pass').pts;
// Pass corridor extended out through the mountains so the road has a way out of the valley.
const PASS_EXT = [[-1500, 1350], [-1050, 980], [-760, 740], ...PASS_ROAD.slice(0, 6)];
const RIVER_EXT = [[1500, -20, 200], [1000, -45, 120], ...RIVER.pts];

const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// Signed distance to the shoreline in meters, negative inside the lake.
export function lakeSDF(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  const e = Math.sqrt(dx * dx + dz * dz);
  const ang = Math.atan2(dz, dx);
  const c = Math.cos(ang), s = Math.sin(ang);
  const southness = smoothstep(0.35, 0.9, s); // +z is south, the village side
  const amp = lerp(0.12, 0.03, southness);
  const wob = noise.fbm2(c * 1.4 + 7.1, s * 1.4 - 3.3, 3) * amp + noise.fbm2(c * 5 + 2, s * 5 + 9, 2) * amp * 0.25;
  const localR = lerp(LAKE.rx, LAKE.rz, Math.abs(s));
  return (e - (1 + wob)) * localR;
}

// Smoothly saturating valley bowl: low in the middle, rising toward the mountains.
function bowl(dv) {
  const t = Math.max(0, dv - 0.3);
  return 300 * (1 - Math.exp(-Math.pow(t, 1.5) * 0.4));
}

// Natural terrain before pads, roads, river and lake carving.
export function naturalHeight(x, z) {
  const dvx = (x - 20) / 720, dvz = (z + 40) / 640;
  const dv = Math.sqrt(dvx * dvx + dvz * dvz);
  let h = bowl(dv);

  const dl = Math.max(0, lakeSDF(x, z));
  const hillAmp = 3 + 26 * smoothstep(10, 260, dl);
  h += noise.fbm2(x * 0.0045, z * 0.0045, 5) * hillAmp;
  h += noise.fbm2(x * 0.021, z * 0.021, 3) * 1.4 * smoothstep(0, 80, dl);

  // Mountain ring, suppressed in the pass corridor and the river gorge.
  let m = smoothstep(0.82, 1.55, dv);
  if (m > 0) {
    const pass = nearestOnPolyline(x, z, PASS_EXT).d;
    m *= lerp(0.05, 1, smoothstep(70, 260, pass));
    const riv = nearestOnPolyline(x, z, RIVER_EXT).d;
    m *= lerp(0.15, 1, smoothstep(40, 160, riv));
    const far = 1 - 0.45 * smoothstep(2.5, 5.5, dv);
    h += m * (160 + noise.ridged2(x * 0.0011 + 3.1, z * 0.0011 - 5.7, 6) * 950) * far;
  }

  // North escarpment above the lake's north shore (bear den cliffs).
  const north = smoothstep(-305, -385, z) * smoothstep(-430, -120, x) * smoothstep(420, 200, x);
  h += north * (22 + noise.fbm2(x * 0.01, z * 0.01, 3) * 10);

  // Featured hills.
  h += gauss(x, z, 200, 230, 75) * 40; // idol hill
  h += gauss(x, z, -40, 222, 42) * 9; // sledding hill
  h += gauss(x, z, -365, 345, 70) * 16; // watchtower ridge
  h += gauss(x, z, 470, -150, 120) * 30; // eastern shoulder above the falls (north side)
  h += gauss(x, z, 470, 10, 110) * 22; // eastern shoulder (south side)
  return h;
}

// Village plateau: low at the shore, rising gently inland.
function villageTarget(x, z) {
  return 2.5 + clamp((z - 55) * 0.035, 0, 4) + noise.fbm2(x * 0.03, z * 0.03, 2) * 0.35;
}

const padCenters = new Map();
function padTarget(pad) {
  if (pad.x === 0 && pad.z === 115) return null; // village uses a sloped target
  if (!padCenters.has(pad)) padCenters.set(pad, naturalHeight(pad.x, pad.z));
  return padCenters.get(pad);
}

// Terrain with pads applied (used as the reference height for roads).
function baseHeight(x, z) {
  let h = naturalHeight(x, z);
  for (const pad of FLAT_PADS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d > pad.r + pad.blend) continue;
    const w = smoothstep(pad.r + pad.blend, pad.r, d);
    const t = padTarget(pad);
    h = lerp(h, t === null ? villageTarget(x, z) : t, w);
  }
  return h;
}

// Full terrain height (lake bed below the ice inside the lake).
export function computeHeight(x, z) {
  let h = baseHeight(x, z);

  // Roads: level cross-section, follows the reference height of the nearest centerline point.
  for (const road of ROADS) {
    const n = nearestOnPolyline(x, z, road.pts);
    const half = road.width * 0.5;
    if (n.d > half + 7) continue;
    const w = smoothstep(half + 7, half + 0.5, n.d);
    const target = baseHeight(n.x, n.z);
    h = lerp(h, target, w * 0.92);
    // Slight crown and ruts are left to the terrain shader; keep geometry smooth here.
  }

  // River channel.
  {
    const pts = RIVER.pts;
    let best = { d: Infinity, bed: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / len2);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best.d) best = { d, bed: lerp(ah, bh, t) };
    }
    const half = RIVER.width * 0.5;
    if (best.d < half + 18) {
      const w = smoothstep(half + 18, half, best.d);
      h = lerp(h, best.bed - 1.2, w);
    }
  }

  // Lake: shore blends down to the waterline, bed below the ice.
  const sd = lakeSDF(x, z);
  const northSide = smoothstep(-160, -260, z); // steeper banks on the north side
  const shoreBlend = lerp(38, 14, northSide);
  if (sd < shoreBlend) {
    if (sd >= 0) {
      const w = smoothstep(0, shoreBlend, sd);
      h = lerp(0.35, Math.max(h, 0.35), w);
    } else {
      h = lerp(0.35, LAKE.bed, smoothstep(0, -24, sd));
    }
  }

  // Island with a stone circle.
  {
    const d = Math.hypot(x + 120, z + 190);
    if (d < 40) {
      const isl = 0.4 + 7.1 * (1 - smoothstep(6, 28, d)) + noise.fbm2(x * 0.08, z * 0.08, 2) * 1.2 * (1 - smoothstep(10, 28, d));
      h = Math.max(h, lerp(isl, LAKE.bed, smoothstep(28, 38, d)));
    }
  }
  return h;
}
