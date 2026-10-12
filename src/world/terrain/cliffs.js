// Cliff-face meshes for the north escarpment and the falls cliff. A heightfield cannot make a
// convincing vertical face (stretched triangles), so these strips follow the exact cliff lines
// of heightfield.js just in front of the terrain face, displaced into vertical fracture ribs,
// strata ledges (which catch snow), bulges and deep cracks, rolling over into the cliff top and
// burying their foot in the talus. A gap is left at the cave slot behind the falls. (The bear
// den face at x ~ 150 is continuous until the den entrance exists; see FALLS for the pattern.)
//
// buildCliffs(G, material) -> THREE.Group (chunked meshes for frustum culling)
import * as THREE from 'three';
import { escarpmentAt, fallsCliff, FALLS } from '../heightfield.js';
import { noise } from '../../core/Noise.js';

const ROW = 1.1;

function strip(stations, seed) {
  // stations: [{ x, z, nx, nz, yB, yT, lean0, lean1, back }]
  const rows = Math.max(...stations.map((s) => Math.ceil((s.yT - s.yB) / ROW))) + 4;
  const pos = new Float32Array(stations.length * rows * 3);
  let s = 0;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (i) s += Math.hypot(st.x - stations[i - 1].x, st.z - stations[i - 1].z);
    const endFade = Math.min(1, i / 4, (stations.length - 1 - i) / 4);
    for (let k = 0; k < rows; k++) {
      const v = k / (rows - 1);
      const vm = Math.min(v / 0.86, 1);
      let y = st.yB + (st.yT - st.yB) * vm;
      let o = st.lean0 + (st.lean1 - st.lean0) * vm;
      if (st.w) {
        // Follow the heightfield's smoothstep slope profile (inverse smoothstep of the height).
        const f = Math.min(1, Math.max(0, (y - st.hB) / (st.hT - st.hB)));
        const t = 0.5 - Math.sin(Math.asin(1 - 2 * f) / 3);
        o = st.w - 2 * st.w * t + 0.9;
      }
      // Roll the top edge back over into the cliff-top terrain.
      if (v > 0.86) {
        const t = (v - 0.86) / 0.14;
        o += (st.back - st.lean1) * t;
        y = st.yT + (0.2 - 0.9 * t * t);
      }
      const n = noise.noise2;
      const ribs = 1.3 * Math.pow(Math.abs(n(s * 0.17 + seed, y * 0.035)), 0.6);
      // Strata ledges: uneven spacing, broken along the face (only some catch snow).
      const q = y / (2.6 + 1.6 * (0.5 + 0.5 * n(s * 0.011, 5.5 + seed))) + 0.8 * n(s * 0.04, 0.3 + seed);
      const fq = q - Math.floor(q);
      const lk = Math.max(0, n(s * 0.06 + Math.floor(q) * 3.1, 2.2 + seed));
      const ledge = 1.1 * lk * (fq > 0.74 ? Math.min(1, (fq - 0.74) / 0.18) : 0);
      const bulge = 1.9 * noise.fbm2(s * 0.03 + seed, y * 0.045, 3);
      const crack = -0.9 * Math.max(0, 1 - Math.abs(n(s * 0.09, 7.1 + seed)) / 0.07);
      const top = 1 - Math.max(0, (v - 0.8) / 0.2);
      const disp = Math.max(0.25, 0.7 + ribs + ledge + bulge + crack) * Math.max(0.2, endFade) * (0.3 + 0.7 * top);
      const d = o + disp;
      const p = (i * rows + k) * 3;
      pos[p] = st.x + st.nx * d;
      pos[p + 1] = y;
      pos[p + 2] = st.z + st.nz * d;
    }
  }
  const idx = [];
  for (let i = 0; i < stations.length - 1; i++) {
    if (stations[i + 1].gap) continue;
    for (let k = 0; k < rows - 1; k++) {
      const a = i * rows + k, b = a + 1, c = a + rows, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Split a station list into chunks (and at gaps) and build meshes.
function addStrips(group, list, material, seed, chunk = 110) {
  let run = [];
  const flush = () => {
    if (run.length > 3) {
      const m = new THREE.Mesh(strip(run, seed + group.children.length * 13.1), material);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'cliffFace';
      group.add(m);
    }
    run = [];
  };
  for (const st of list) {
    if (!st) { flush(); continue; }
    run.push(st);
    if (run.length >= chunk) { const last = run[run.length - 1]; flush(); run.push(last); }
  }
  flush();
}

export function buildCliffs(G, material) {
  const W = G.world;
  const group = new THREE.Group();
  group.name = 'cliffs';

  // North escarpment: main tier and, where present, the upper step.
  const main = [], upper = [];
  for (let x = -470; x <= 452; x += 1.25) {
    const e = escarpmentAt(x);
    const e2 = escarpmentAt(x + 0.5);
    const sl = (e2.zc - e.zc) / 0.5, sl2 = (e2.z2 - e.z2) / 0.5;
    const hgt = e.hgt * e.along;
    if (hgt < 6) { main.push(null); } else {
      const ln = Math.hypot(sl, 1);
      const foot = noise.noise2(x * 0.045, 12.3);
      const yB = W.terrainAt(x, e.zc + 7) - 2.2 + 1.6 * foot, yT = W.terrainAt(x, e.zc - 9);
      if (yT - yB < 7) main.push(null);
      else main.push({ x, z: e.zc, nx: -sl / ln, nz: 1 / ln, yB, yT, lean0: 3.2 + 1.2 * foot, lean1: -2.6, back: -6.5 });
    }
    const h2 = e.h2 * e.along;
    if (h2 < 7) { upper.push(null); continue; }
    const ln2 = Math.hypot(sl2, 1);
    const yB2 = W.terrainAt(x, e.z2 + 7) - 1.5, yT2 = W.terrainAt(x, e.z2 - 13);
    if (yT2 - yB2 < 6) upper.push(null);
    else upper.push({ x, z: e.z2, nx: -sl2 / ln2, nz: 1 / ln2, yB: yB2, yT: yT2, lean0: 4.5, lean1: -5.5, back: -10 });
  }
  addStrips(group, main, material, 1.7);
  addStrips(group, upper, material, 9.3);

  // Falls cliff: the near-vertical part on both sides of the falls, open at the cave slot.
  const falls = [];
  for (let z = FALLS.z - 60; z <= FALLS.z + 60; z += 1) {
    const f = fallsCliff(z), f2 = fallsCliff(z + 0.5);
    const inSlot = Math.abs(z - FALLS.caveZ) < FALLS.caveW - 0.4;
    if (f.wdt > 11 || inSlot) { falls.push(null); continue; }
    const sl = (f2.xc - f.xc) / 0.5, ln = Math.hypot(sl, 1);
    const nx = -1 / ln, nz = sl / ln;
    const hB = W.terrainAt(f.xc - f.wdt - 1, z), hT = W.terrainAt(f.xc + f.wdt + 1, z);
    const yB = hB - 2, yT = W.terrainAt(f.xc + f.wdt + 5, z);
    if (yT - yB < 8) { falls.push(null); continue; }
    falls.push({ x: f.xc, z, nx, nz, yB, yT, hB, hT, w: f.wdt, lean0: f.wdt + 1.2, lean1: -f.wdt + 0.2, back: -f.wdt - 4 });
  }
  addStrips(group, falls, material, 4.4, 200);
  G.scene.add(group);
  return group;
}
