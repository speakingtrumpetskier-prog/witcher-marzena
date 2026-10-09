// Overlay cave mouth for dens and lairs (no terrain edits): a rock buttress heaped against a cliff or slope.
// Three rows of boulders ring a horseshoe mouth, heavier blocks pile up over it and roll back into the
// hillside, and behind them a faceted rock shell makes a real alcove whose walls go dark toward the back.
// Used by the bear den (k = 1, a cliff face) and the wolf den (k ~ 0.6, a snow slope).
//
// denRock(G, c, { x, z, yaw, k, seed, tone, name }) places everything in a local frame whose +z (depth d) points
// out of the cave, and whose +x is lateral; yaw is a three.js rotation.y. `c` is a Composer, used for the wall colliders.
// Returns { R(lx, d) -> {x, z}, gh(lx, d) -> ground y, mouthD, A, shell, blocks }.
import * as THREE from 'three';
import { noise } from '../../../core/Noise.js';
import { rngOf, rockBlocks, rockDims } from './compose.js';

export function denRock(G, c, { x, z, yaw = 0, k = 1, seed = 150, tone = 0.72, name = 'den', ring = 3 } = {}) {
  const rnd = rngOf(seed);
  const A = 3.5 * k, HS = 2.3 * k, HT = 5.4 * k, MOUTH_D = 6.2 * k;
  const SHELL_END = MOUTH_D - 1.1 * k;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const R = (lx, d) => ({ x: x + lx * cs + d * sn, z: z - lx * sn + d * cs });
  const gh = (lx, d) => { const q = R(lx, d); return G.world.heightAt(q.x, q.z); };
  const STATIONS = [
    { d: -0.3, w: 2.4, h: 2.4 }, { d: 0.8, w: 5.0, h: 3.8 }, { d: 2.2, w: 6.6, h: 4.8 },
    { d: 3.8, w: 7.2, h: 5.3 }, { d: 5.2, w: 7.0, h: 5.4 }, { d: 6.2, w: 6.8, h: 5.2 },
  ].map((s) => ({ d: s.d * k, w: s.w * k, h: s.h * k }));
  const stationAt = (d) => {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const a = STATIONS[i], b = STATIONS[i + 1];
      if (d <= b.d || i === STATIONS.length - 2) {
        const u = Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d)));
        const s = u * u * (3 - 2 * u);
        return { w: a.w + (b.w - a.w) * s, h: a.h + (b.h - a.h) * s };
      }
    }
    return STATIONS[STATIONS.length - 1];
  };
  // point on the mouth outline at u (0 = left foot, 1 = right foot) and its outward normal
  const outline = (u) => {
    const L1 = HS, L2 = (Math.PI * (A + (HT - HS))) / 2, tot = L1 * 2 + L2;
    let s = u * tot;
    if (s < L1) return { x: -A, y: s, nx: -1, ny: 0 };
    s -= L1;
    if (s < L2) {
      const th = Math.PI - (s / L2) * Math.PI;
      const gx = Math.cos(th) / A, gy = Math.sin(th) / (HT - HS), l = Math.hypot(gx, gy) || 1;
      return { x: Math.cos(th) * A, y: HS + Math.sin(th) * (HT - HS), nx: gx / l, ny: gy / l };
    }
    s -= L2;
    return { x: A, y: Math.max(0, HS - s), nx: 1, ny: 0 };
  };

  // ---- the faceted shell of the alcove, vertex colours going dark toward the back -----------------------------
  const N = 14, M = 18;
  const pos = [], col = [], idx = [];
  const cA = new THREE.Color(0x6c625a), cB = new THREE.Color(0x4c443e), cC = new THREE.Color(0x7c6c58);
  for (let i = 0; i <= N; i++) {
    const d = -0.3 * k + (i / N) * (SHELL_END + 0.3 * k);
    const { w, h } = stationAt(d);
    const base = gh(0, d);
    const lum = Math.max(0.05, Math.exp(-(MOUTH_D - d) * 0.5 / k));
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const u = Math.cos(a), v = Math.sin(a);
      const n1 = noise.noise3(x * 0.5 + j * 0.8, d * 0.6, j * 0.5 + 2) * 0.22;
      const n2 = noise.noise3(x + j * 1.7, d * 1.8, 7) * 0.1;
      const kk = 1 + n1 + n2;
      const q = R(u * (w / 2) * kk, d);
      const y = base + (v >= 0 ? Math.pow(v, 0.85) * h * (1 + n1 * 0.4) : v * 0.2 * h) - 0.08;
      pos.push(q.x, y, q.z);
      const cc = new THREE.Color().copy(cA).lerp(cB, 0.5 + n2 * 2.5);
      if (v > 0.55) cc.lerp(cC, 0.12);
      if (noise.noise3(q.x * 0.8, y * 0.8, q.z * 0.8) > 0.35) cc.multiplyScalar(0.72);
      cc.multiplyScalar(lum);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), cI = (i + 1) * M + j, e = (i + 1) * M + ((j + 1) % M);
    idx.push(a, cI, b, b, cI, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide, flatShading: true }));
  shell.name = `wild:${name}Shell`;
  shell.receiveShadow = true;
  G.scene.add(shell);

  // ---- the buttress ----------------------------------------------------------------------------------------
  const list = [];
  // a boulder of kind v centred at (lx, ly over the ground there, d), scaled s (number or [x, y, z])
  const putAt = (v, lx, ly, d, s, ry = 0, extra = {}) => {
    const s3 = Array.isArray(s) ? s : [s, s, s];
    const dm = rockDims(v, 3, 0.1);
    const cy = ((dm.y0 + dm.y1) / 2) * s3[1];
    const q = R(lx, d);
    list.push({ v, x: q.x, y: G.world.heightAt(q.x, q.z) + ly - cy, z: q.z, s: s3, ry: yaw + ry, embed: 0.1, collide: false, ...extra });
  };
  const KINDS_RING = [0, 1, 2, 4, 0, 2, 1];
  for (let row = 0; row < ring; row++) {
    const n = Math.max(5, Math.round((10 + row) * Math.sqrt(k)));
    const d0 = (MOUTH_D / k - 0.2 - row * 2.1) * k;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5 + rnd.signed(0.22)) / n;
      const o = outline(u);
      const v = u > 0.42 && u < 0.58 && row === 0 ? 3 : rnd.pick(KINDS_RING);
      const s = rnd.range(1.15, 1.6) * (1 + row * 0.12) * k;
      const push = rockDims(v, 3, 0.1).w * s * 0.5 * 0.82;
      putAt(v, o.x + o.nx * push, o.y + o.ny * push, d0 + rnd.signed(0.7 * k), [s * rnd.range(0.95, 1.15), s * rnd.range(0.9, 1.2), s], rnd.range(0, 6.28));
    }
  }
  for (let layer = 0; layer < 2; layer++) {
    const n = Math.max(4, Math.round((9 - layer) * Math.sqrt(k)));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5 + rnd.signed(0.2)) / n;
      const o = outline(u);
      if (o.y < 0.5 * k && layer === 0) continue;
      const v = rnd.pick([0, 1, 2, 2, 1, 4]);
      const s = (rnd.range(1.6, 2.3) + layer * 0.3) * k;
      const out = rockDims(v, 3, 0.1).w * s * 0.5 * 0.7 + (1.3 + layer * 1.6) * k;
      putAt(v, o.x + o.nx * out, Math.max(0.6 * k, o.y + o.ny * out * 0.8), rnd.range(1.2 * k, MOUTH_D - 1.4 * k), [s, s * rnd.range(0.85, 1.1), s * rnd.range(0.9, 1.15)], rnd.range(0, 6.28));
    }
  }
  // the roof mass over the crown
  for (const [lx, ly, d, v, s] of [[-2.6, 6.3, 3.4, 2, 2.2], [0.2, 7.0, 3.0, 0, 2.6], [2.8, 6.2, 3.2, 1, 2.1], [-1.2, 7.4, 1.2, 4, 2.3], [2.4, 7.6, 1.0, 2, 2.4], [-4.4, 5.6, 2.2, 1, 1.9], [4.6, 5.8, 2.0, 0, 2.0], [0, 6.0, 5.2, 3, 1.4]]) {
    putAt(v, (lx + rnd.signed(0.3)) * k, ly * k, (d + rnd.signed(0.3)) * k, [s * k, s * 0.9 * k, s * k], rnd.range(0, 6.28));
  }
  // scree around the foot and in the yard, the path left clear
  const nScree = Math.round(16 * Math.sqrt(k));
  for (let i = 0; i < nScree; i++) {
    const side = i % 2 ? 1 : -1;
    const lx = side * rnd.range(A + 2.0 * k, A + 11 * k), d = rnd.range(0.5 * k, MOUTH_D + 5 * k);
    const s = rnd.range(0.55, 1.5) * Math.max(0.55, k);
    const q = R(lx, d);
    list.push({ v: i % 7, x: q.x, y: G.world.heightAt(q.x, q.z) - 0.15, z: q.z, s: [s * 1.2, s * 0.85, s], ry: rnd.range(0, 6.28), embed: 0.2, collide: s > 1.0 });
  }
  const blocks = rockBlocks(G, list, { tone, name: `${name}Arch`, detail: 3 });
  // solid walls either side of the opening (the rock blocks are visual only)
  for (const sx of [-1, 1]) for (let d = 0.8 * k; d < MOUTH_D + 0.5 * k; d += 1.5 * Math.max(0.7, k)) {
    const q = R(sx * (A + 0.9 * k), d);
    c.circle(q.x, q.z, 1.3 * Math.max(0.7, k), G.world.heightAt(q.x, q.z) - 1, G.world.heightAt(q.x, q.z) + 7 * k, `${name}Wall`);
  }
  return { R, gh, mouthD: MOUTH_D, A, shell, blocks };
}
