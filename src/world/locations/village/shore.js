// The shore: fishing huts on stilts half over the ice, the boardwalk that links them, the boathouse and
// the raised stretch of boardwalk with the kids' fort underneath. The real shoreline wobbles, so every
// z comes from the lake signed distance rather than from the plan's round numbers.
import { buildings as B, placeBuilding } from '../../architecture/index.js';
import { HUT_X, BOATHOUSE } from './plan.js';

const PI = Math.PI;
const PO = { snap: false, y: 0, foundation: false, skirt: false };

// z of the shoreline offset by `d` meters inland (sdf = d) at world x, by bisection on the lake SDF.
export function shoreZ(G, x, d = 0) {
  let lo = -20, hi = 120;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (G.world.lakeSDF(x, mid) < d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export async function buildShore(V) {
  const { G } = V;
  const heightAt = (x, z) => G.world.heightAt(x, z);
  const shore = { huts: [], boardwalk: [], fort: null, boathouse: null };
  V.shore = shore;

  // ---- boardwalk path: follows the shoreline 4.6 m inland, smoothed ----
  const raw = [];
  for (let x = -96; x <= 62; x += 4) raw.push([x, shoreZ(G, x, 4.6)]);
  const path = raw.map((p, i) => {
    let sz = 0, n = 0;
    for (let k = -2; k <= 2; k++) { const q = raw[Math.min(raw.length - 1, Math.max(0, i + k))]; sz += q[1]; n++; }
    return [p[0], sz / n];
  });
  shore.path = path;
  V.barriers.push(path);
  const zAt = (x) => {
    const t = (x - path[0][0]) / 4;
    const i = Math.max(0, Math.min(path.length - 2, Math.floor(t)));
    const f = Math.max(0, Math.min(1, t - i));
    return path[i][1] + (path[i + 1][1] - path[i][1]) * f;
  };
  shore.zAt = zAt;

  // Fort stretch: x from -27 to -13 is raised (lift 1.4) with step-up pieces either side.
  const FORT = { x0: -27, x1: -13 };
  const segs = [
    { x0: -96, x1: -32, lift: 0.45 },
    { x0: -32, x1: FORT.x0 - 0.001, lift: 0.9 },
    { x0: FORT.x0, x1: FORT.x1, lift: 1.4 },
    { x0: FORT.x1 + 0.001, x1: -8, lift: 0.9 },
    { x0: -8, x1: 62, lift: 0.45 },
  ];
  let sd = 700;
  for (const s of segs) {
    const pts = [];
    for (let x = s.x0; x <= s.x1 + 0.01; x += Math.min(4, Math.max(1, s.x1 - s.x0))) pts.push([x, zAt(x)]);
    if (pts[pts.length - 1][0] < s.x1 - 0.01) pts.push([s.x1, zAt(s.x1)]);
    if (pts.length < 2) continue;
    // Break long runs into chunks for culling.
    for (let i = 0; i < pts.length - 1; i += 11) {
      const part = pts.slice(i, Math.min(pts.length, i + 12));
      if (part.length < 2) continue;
      const b = B.boardwalk({ seed: sd++, points: part, heightAt, rails: true, lift: s.lift, width: 1.8 });
      const p = placeBuilding(G, b, 0, 0, 0, PO);
      V.pieces.push(p);
      for (let k = 0; k < part.length - 1; k++) {
        const a = part[k], c = part[k + 1];
        V.walk.ramps.push({ a: [a[0], heightAt(a[0], a[1]) + s.lift, a[1]], b: [c[0], heightAt(c[0], c[1]) + s.lift, c[1]], width: 1.6, tag: 'boardwalk', building: 'boardwalk' });
      }
    }
    shore.boardwalk.push({ ...s });
  }
  V.clear(-30, 45, 70);
  V.clear(-80, 40, 25);

  // ---- fishing huts ----
  HUT_X.forEach((hx, i) => {
    const sz = shoreZ(G, hx, 1.0);
    const jitter = ((i * 37) % 11 - 5) * 0.012;
    const bwY = heightAt(hx, zAt(hx)) + (hx > FORT.x0 - 5 && hx < FORT.x1 + 5 ? 0.9 : 0.45);
    const y0 = bwY - 1.55 + 0.005;
    const b = B.fishingHut({ seed: 300 + i * 17 });
    const rec = V.put(`hut${i}`, 'fishingHut', b, hx, sz, PI + jitter, { snap: false, y: y0, foundation: false, skirt: false }, { hut: true, inhabited: i % 2 === 0, smokeRate: 0.9 });
    shore.huts.push(rec);
  });

  // ---- boathouse ----
  const bh = BOATHOUSE;
  const bhRec = V.put('boathouse', 'boathouse', B.boathouse({ seed: bh.seed, ajar: 0.9, interior: true }), bh.x, bh.z, bh.yaw, { snap: false, y: 0.45, foundation: true, skirt: true }, { outbuilding: true });
  shore.boathouse = bhRec;

  // ---- fort anchors (props go in dress.js) ----
  const fx = (FORT.x0 + FORT.x1) / 2;
  const fz = zAt(fx);
  shore.fort = { x: fx, z: fz, x0: FORT.x0, x1: FORT.x1, yaw: PI };
}
