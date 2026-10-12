// What you see of fishing, built in code: the fish of each species at its real length (one lofted body with fins, vertex
// coloured, a bend for swimming and flopping, a cook colour), the short ice rod with its reel and springy tip, the roasting
// stick, a ripple ring. Everything is procedural; nothing here knows about the game state.
//
//   makeFish(id, kg) -> { group, mesh, length, setBend(a), setCook(k) }     head along +Z, up +Y, centred on its middle
//   makeRod() -> { group, tipWorld, update(bendDown, tremble), crank(angle) }   along +Y from the grip (y = 0)
//   makeRoastStick(id, kg) -> { group, fish, setCook(k) }                      along +Y from the grip, the fish near the end
//   makeRipple() -> { mesh, play(x, z, r0, r1, seconds), update(dt) }
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { lengthOf } from './model.js';

const NS = 18; // stations along the body
const NR = 12; // points round each station
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Height of the body relative to its deepest point at t (0 nose .. 1 tail base).
function envelope(f, t) {
  const tp = f.eel ? 0.3 : 0.38;
  const tail = f.tail;
  if (t <= tp) {
    const u = t / tp;
    return Math.pow(Math.sin(u * Math.PI / 2), f.flat ? 0.55 : 0.75);
  }
  const u = (t - tp) / (1 - tp);
  return tail + (1 - tail) * Math.pow(Math.cos(u * Math.PI / 2), f.eel ? 1.5 : 1.15);
}

function colorsFor(sp, t, sinP, i, j) {
  const P = sp.palette;
  const cBack = new THREE.Color(P.back), cSide = new THREE.Color(P.side), cBelly = new THREE.Color(P.belly), cMark = new THREE.Color(P.mark);
  const c = new THREE.Color();
  const bk = sm(0.1, 0.75, sinP), bl = sm(-0.15, -0.7, sinP);
  c.copy(cSide).lerp(cBack, bk).lerp(cBelly, bl);
  const side = 1 - Math.abs(sinP) * 0.6;
  if (sp.marks === 'bars' && t > 0.27 && t < 0.74 && sinP > -0.4) {
    const bar = Math.floor((t - 0.27) / 0.0775);
    const inBar = ((t - 0.27) / 0.0775) % 1 < 0.55 && bar % 2 === 0;
    if (inBar) c.lerp(cMark, 0.82 * sm(-0.4, 0.2, sinP));
  } else if (sp.marks === 'spots' && sinP > -0.3 && sinP < 0.85) {
    // bean-shaped light marks in loose rows along the flank
    const n = hash(i, j);
    if (n > 0.64 && t > 0.14) c.lerp(cMark, 0.75 * side);
    else if (t > 0.1 && n < 0.12) c.multiplyScalar(0.8);
  } else if (sp.marks === 'mottle' && sinP > -0.5) {
    const n = hash(i * 1.7, j * 0.9);
    if (n > 0.5) c.lerp(cMark, 0.55);
  }
  // gill cover and eye
  if (t > 0.16 && t < 0.2) c.multiplyScalar(0.82);
  if (t > 0.055 && t < 0.1 && Math.abs(sinP) < 0.32) c.set(0x0a0b0c);
  return c;
}

function buildGeometry(id, L) {
  const sp = SPECIES[id], f = sp.form;
  const hh = f.h * L * 0.5;
  const pos = [], col = [], idx = [];
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1);
    const e = envelope(f, t);
    const z = L * (0.5 - t);
    const droop = t < 0.14 ? (0.14 - t) * L * 0.12 : 0; // the mouth sits low
    const wr = (f.flat && t < 0.3 ? 1.0 : 0.52) * (f.eel ? 0.9 : 1);
    for (let j = 0; j < NR; j++) {
      const phi = (j / NR) * Math.PI * 2;
      const cs = Math.cos(phi), sn = Math.sin(phi);
      const x = hh * wr * e * cs;
      const y = (sn > 0 ? hh * f.back * e * sn : hh * f.belly * e * sn) - droop;
      pos.push(x, y, z);
      const c = colorsFor(sp, t, sn, i, j);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NS - 1; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * NR + j, b = i * NR + ((j + 1) % NR), c = (i + 1) * NR + j, d = (i + 1) * NR + ((j + 1) % NR);
      idx.push(a, c, b, b, c, d);
    }
  }
  // close the tail end
  const last = (NS - 1) * NR;
  const centre = pos.length / 3;
  pos.push(0, 0, -L / 2);
  col.push(col[last * 3], col[last * 3 + 1], col[last * 3 + 2]);
  for (let j = 0; j < NR; j++) idx.push(last + j, centre, last + ((j + 1) % NR));
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  const flat = body.toNonIndexed();

  // fins: flat triangles in the mid plane (dorsal, anal, tail) and in pairs (pectoral, pelvic)
  const fp = [], fc = [];
  const finCol = new THREE.Color(sp.palette.fin);
  const tri = (a, b, c, k = 1) => {
    for (const p of [a, b, c]) { fp.push(p[0], p[1], p[2]); fc.push(finCol.r * k, finCol.g * k, finCol.b * k); }
  };
  const topAt = (t) => hh * f.back * envelope(f, t);
  const botAt = (t) => -hh * f.belly * envelope(f, t);
  const zAt = (t) => L * (0.5 - t);
  const fin = (range, h, top) => {
    const [t0, t1] = range;
    const y = top ? topAt : botAt;
    const s = top ? 1 : -1;
    const fh = h * L;
    tri([0, y(t0), zAt(t0)], [0, y(t0) + s * fh, zAt(t0) - 0.02 * L], [0, y(t1) + s * fh * 0.55, zAt(t1)]);
    tri([0, y(t0), zAt(t0)], [0, y(t1) + s * fh * 0.55, zAt(t1)], [0, y(t1), zAt(t1)]);
  };
  fin(f.dorsal, f.dorsal[2], true);
  if (f.eel) fin([0.62, 0.97], 0.05, true);
  fin([f.anal[0], f.anal[1]], f.anal[2], false);
  if (f.adipose) tri([0, topAt(0.78), zAt(0.78)], [0, topAt(0.8) + 0.035 * L, zAt(0.8) - 0.01 * L], [0, topAt(0.83), zAt(0.83)], 0.9);
  // tail fin
  {
    const z0 = -L / 2, tl = (f.eel ? 0.1 : 0.2) * L, th = Math.max(hh * 0.95, 0.07 * L) * (f.eel ? 0.5 : 1);
    const ped = hh * f.tail * 0.9;
    const notch = f.eel ? 0 : 0.35 * tl;
    tri([0, ped, z0], [0, th, z0 - tl], [0, 0, z0 - tl + notch]);
    tri([0, -ped, z0], [0, 0, z0 - tl + notch], [0, -th, z0 - tl]);
    tri([0, ped, z0], [0, 0, z0 - tl + notch], [0, -ped, z0]);
  }
  for (const s of [-1, 1]) {
    const e = envelope(f, 0.26);
    const wx = hh * 0.52 * e * s;
    tri([wx, -0.25 * hh, zAt(0.26)], [wx * 1.9 + s * 0.02 * L, -0.5 * hh, zAt(0.26) - 0.1 * L], [wx, -0.4 * hh, zAt(0.26) - 0.13 * L]);
    const e2 = envelope(f, 0.38);
    const px = hh * 0.35 * e2 * s;
    tri([px, botAt(0.38) * 0.9, zAt(0.38)], [px * 1.5, botAt(0.4) - 0.06 * L, zAt(0.42)], [px * 0.8, botAt(0.44), zAt(0.45)]);
  }
  if (f.barbel) {
    // the barbel under the chin
    tri([-0.004 * L, -0.02 * L, zAt(0.03)], [0.004 * L, -0.02 * L, zAt(0.03)], [0, -0.08 * L, zAt(0.0) + 0.005 * L], 0.8);
  }
  const fins = new THREE.BufferGeometry();
  fins.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fins.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  fins.computeVertexNormals();

  const merged = mergeNonIndexed([flat, fins]);
  merged.computeBoundingSphere();
  return merged;
}

function mergeNonIndexed(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const matCache = {};
function fishMaterial() {
  if (!matCache.fish) {
    matCache.fish = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.12, side: THREE.DoubleSide });
    matCache.fish.name = 'fish';
  }
  return matCache.fish;
}

export function makeFish(id, kg) {
  if (!SPECIES[id]) id = 'perch';
  const sp = SPECIES[id];
  const L = lengthOf(id, kg);
  const geo = buildGeometry(id, L);
  const base = geo.attributes.position.array.slice();
  const baseCol = geo.attributes.color.array.slice();
  const mesh = new THREE.Mesh(geo, fishMaterial());
  mesh.castShadow = true;
  mesh.name = `fish_${id}`;
  const group = new THREE.Group();
  group.add(mesh);
  group.name = `fish:${id}`;
  const pos = geo.attributes.position, col = geo.attributes.color;
  const brown = new THREE.Color(0x9a6232), gold = new THREE.Color(0xd8a45a), tmp = new THREE.Color();
  const api = {
    group, mesh, length: L, species: sp,
    setBend(a) {
      const arr = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const z = base[i * 3 + 2];
        const u = (0.5 - z / L); // 0 at the nose, 1 at the tail
        arr[i * 3] = base[i * 3] + a * L * 0.36 * u * u;
        arr[i * 3 + 2] = z + a * a * L * 0.05 * u * u * -1;
      }
      pos.needsUpdate = true;
    },
    setCook(k) {
      const c = col.array;
      for (let i = 0; i < col.count; i++) {
        tmp.setRGB(baseCol[i * 3], baseCol[i * 3 + 1], baseCol[i * 3 + 2]);
        tmp.lerp(i % 2 ? gold : brown, 0.6 * Math.min(1, k * 1.2));
        tmp.multiplyScalar(1 - 0.28 * k);
        c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
      }
      col.needsUpdate = true;
    },
    dispose() { geo.dispose(); },
  };
  return api;
}

// ---- the rod --------------------------------------------------------------------------------------------------------
const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _w = new THREE.Vector3();

export function makeRod() {
  const group = new THREE.Group();
  group.name = 'iceRod';
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4e30, roughness: 0.7 });
  const cork = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x7a7c80, roughness: 0.45, metalness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.8 });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.015, 0.0165, 0.25, 8), cork, 0, 0.03, 0);
  add(new THREE.SphereGeometry(0.0185, 8, 6), cork, 0, -0.095, 0);
  add(new THREE.CylinderGeometry(0.0105, 0.015, 0.14, 8), wood, 0, 0.225, 0);
  add(new THREE.CylinderGeometry(0.0055, 0.0105, 0.34, 7), wood, 0, 0.455, 0);
  add(new THREE.CylinderGeometry(0.0156, 0.0156, 0.012, 8), red, 0, 0.16, 0);
  add(new THREE.CylinderGeometry(0.0112, 0.0112, 0.01, 8), red, 0, 0.3, 0);
  // reel: a small spool on the side with a crank
  const reel = new THREE.Group();
  reel.position.set(0, 0.06, 0.033);
  group.add(reel);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.022, 14), iron);
  spool.rotation.z = Math.PI / 2;
  reel.add(spool);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.016, 12), new THREE.MeshStandardMaterial({ color: 0xe6e4d8, roughness: 0.95 }));
  line.rotation.z = Math.PI / 2;
  reel.add(line);
  const crankArm = new THREE.Group();
  reel.add(crankArm);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.044, 0.006), iron);
  arm.position.set(0.016, 0.022, 0);
  crankArm.add(arm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.028, 6), wood);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.026, 0.044, 0);
  crankArm.add(knob);
  const guide = add(new THREE.TorusGeometry(0.008, 0.0015, 4, 8), iron, 0, 0.3, 0.008, 0, Math.PI / 2, 0);
  void guide;

  // the tip: a thin springy wire past the blank, drawn as a line that bends toward the ground
  const TIP_N = 10, TIP_LEN = 0.26, tipStart = 0.625;
  const tipGeo = new THREE.BufferGeometry();
  const tipPos = new Float32Array(TIP_N * 3);
  tipGeo.setAttribute('position', new THREE.BufferAttribute(tipPos, 3));
  const tip = new THREE.Line(tipGeo, new THREE.LineBasicMaterial({ color: 0x15171a }));
  tip.frustumCulled = false;
  group.add(tip);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 4), new THREE.MeshStandardMaterial({ color: 0xd8a040, roughness: 0.4, metalness: 0.5 }));
  group.add(bead);
  const tipWorld = new THREE.Vector3();
  const tipLocal = new THREE.Vector3(0, tipStart + TIP_LEN, 0);

  const api = {
    group, tipWorld, bead,
    // bendDown 0..1: how far the tip is pulled toward the ground; tremble: the shiver of a bite, in meters at the tip
    update(bendDown, tremble = 0, t = 0) {
      group.updateWorldMatrix(true, false);
      group.getWorldQuaternion(_q);
      _q.invert();
      _d.set(0, -1, 0).applyQuaternion(_q); // world down in rod space
      const b = bendDown * 0.2 + tremble;
      for (let i = 0; i < TIP_N; i++) {
        const s = i / (TIP_N - 1);
        const ext = TIP_LEN * s;
        const off = b * s * s + (tremble ? Math.sin(t * 90 + i) * tremble * 0.25 * s : 0);
        // keep the arc length near TIP_LEN by shortening the reach a little as it bends
        const reach = ext * (1 - 0.35 * bendDown * s * s);
        tipPos[i * 3] = _d.x * off;
        tipPos[i * 3 + 1] = tipStart + reach + _d.y * off;
        tipPos[i * 3 + 2] = _d.z * off;
      }
      tipGeo.attributes.position.needsUpdate = true;
      const j = (TIP_N - 1) * 3;
      tipLocal.set(tipPos[j], tipPos[j + 1], tipPos[j + 2]);
      bead.position.copy(tipLocal);
      tipWorld.copy(tipLocal);
      group.localToWorld(tipWorld);
      return tipWorld;
    },
    crank(angle) { crankArm.rotation.x = angle; },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    },
  };
  api.update(0);
  void _w;
  return api;
}

// ---- the roasting stick ----------------------------------------------------------------------------------------------
export function makeRoastStick(id, kg) {
  const group = new THREE.Group();
  group.name = 'roastStick';
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.85 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.95, 5), wood);
  stick.position.y = 0.38;
  group.add(stick);
  const fish = makeFish(id, kg);
  // pushed on the stick lengthwise, near the far end, head toward the hand
  const s = Math.min(1, 0.5 / fish.length);
  fish.group.scale.setScalar(s);
  fish.group.rotation.set(Math.PI / 2, 0, 0);
  fish.group.position.set(0, 0.62, 0);
  group.add(fish.group);
  return { group, fish, setCook: (k) => fish.setCook(k), dispose() { fish.dispose(); stick.geometry.dispose(); wood.dispose(); } };
}

// ---- a ripple on the water ---------------------------------------------------------------------------------------------
export function makeRipple() {
  const geo = new THREE.RingGeometry(0.92, 1, 40);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 9;
  mesh.visible = false;
  let t = 0, dur = 1, r0 = 0.3, r1 = 0.9;
  return {
    mesh,
    play(x, y, z, a, b, seconds) {
      mesh.position.set(x, y, z);
      t = 0; dur = seconds; r0 = a; r1 = b;
      mesh.visible = true;
    },
    update(dt) {
      if (!mesh.visible) return;
      t += dt;
      const k = t / dur;
      if (k >= 1) { mesh.visible = false; mat.opacity = 0; return; }
      const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k));
      mesh.scale.set(r, 1, r);
      mat.opacity = 0.55 * (1 - k) * Math.min(1, k * 8);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
