// The frozen falls (LOC.waterfall): the wolf den at the foot of the falls and the ice cave behind the curtain.
//
// Wolf den: a rock lean-to against the slope south-west of the pool, a dark hollow under it, bedding, gnawed
// bones, the miller's dog's collar and a trail of frozen blood, wolf tracks coming over the ice from the mill.
// Ice cave: the slot behind the falls (G.water.waterfall.info.caveMouth) opens into an overlay tunnel under the
// cliff: a faceted blue ice shell, crystal clusters that glow, stalactites, a grotto at the far end and a stash.
// Terrain stays untouched: a dark plug stands over the tunnel mouth (back-face culling lets you walk through it)
// and the tunnel hides under the mountain surface.
//
// G.world.locations.waterfall:
//   den { center, mouth, wolfSpawns[4], alpha, tracks }, cave { mouth, entrance, path[], grotto, stash (stash clue), crystals[], walk }
// G.world.walkFloors (shared registry, see report): cave floor polygon at the cave floor height
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOC } from '../../layout.js';
import { FALLS } from '../../heightfield.js';
import { noise } from '../../../core/Noise.js';
import { Composer, rngOf, rockBlocks, smoothPath } from './compose.js';
import { denBones, bedding, brokenChain } from './objects2.js';
import { tex, groundPatch, groundRibbon } from './decals.js';

export async function build(W) {
  await wolfDen(W);
  await W.pause();
  await iceCave(W);
}

// ---------------------------------------------------------------------------------------------
async function wolfDen(W) {
  const { G } = W;
  const rnd = rngOf(446);
  const yaw = -0.8; // the mouth faces south-west, away from the slope
  const P = { x: 441.5, z: -105 };
  const gh = (x, z) => G.world.heightAt(x, z);
  const floor = gh(P.x, P.z);
  const R = (lx, lz) => { const c = Math.cos(yaw), s = Math.sin(yaw); return { x: P.x + lx * c + lz * s, z: P.z - lx * s + lz * c }; };
  W.clear(P.x, P.z, 8);

  // rock lean-to: two cheek stones, a lintel slab and a tumble of boulders, the hollow dark
  const blocks = [];
  const add = (v, lx, lz, dy, s, ry = 0, extra = {}) => { const q = R(lx, lz); blocks.push({ v, x: q.x, y: gh(q.x, q.z) + dy, z: q.z, s, ry: yaw + ry, ...extra }); };
  for (const sx of [-1, 1]) {
    add(6, sx * 1.9, 0.4, -0.3, [1.0, 0.9, 1.1], sx * 0.3);
    add(5, sx * 2.1, 1.7, -0.4, [0.8, 0.6, 0.9], sx * 0.6);
  }
  add(3, 0, 0.8, 1.6, [1.7, 0.8, 1.4], 0.1, { embed: 0.1, collide: false });
  add(4, 0.6, -0.4, 2.4, [1.4, 0.8, 1.2], -0.3, { embed: 0.1, collide: false });
  for (let i = 0; i < 6; i++) add(i % 7, rnd.range(-4, 4), rnd.range(3, 6.5), -0.1, [rnd.range(0.4, 0.9), rnd.range(0.3, 0.6), rnd.range(0.4, 0.8)], rnd.range(0, 6));
  rockBlocks(G, blocks, { tone: 0.78, name: 'wolfDenRocks', detail: 3 });
  {
    const sh = new THREE.Shape();
    sh.moveTo(-1.5, 0); sh.lineTo(-1.45, 0.9); sh.quadraticCurveTo(-1.1, 2.1, 0, 2.2); sh.quadraticCurveTo(1.2, 2.0, 1.5, 0.9); sh.lineTo(1.5, 0); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), new THREE.MeshBasicMaterial({ color: 0x050608, fog: false }));
    const q = R(0, 0.55);
    m.position.set(q.x, floor + 0.05, q.z);
    m.rotation.y = yaw;
    m.name = 'wild:wolfDenDark';
    G.scene.add(m);
  }
  const c = new Composer(G, W.ctx, 'wolfDen', P.x, P.z, { seed: 44 });
  const bd = R(0, 2.6);
  c.at(bd.x, bd.z, { yaw: 0.4 }, (k) => bedding(k, { r: 1.5 }));
  c.at(R(-0.5, 4.2).x, R(-0.5, 4.2).z, { yaw: 1.1 }, (k) => denBones(k, { n: 14, r: 2.3 }));
  c.prop('skull', R(1.8, 3.6).x, R(1.8, 3.6).z, { seed: 2, opts: { variant: 'wolf' }, yaw: 0.8 });
  c.prop('skull', R(-1.6, 5.2).x, R(-1.6, 5.2).z, { seed: 3, opts: { variant: 'cow' }, yaw: 2.2 });
  c.prop('bones', R(0.4, 5.8).x, R(0.4, 5.8).z, { seed: 3, yaw: 0.2 });
  const dc = R(-1.0, 3.6);
  c.at(dc.x, dc.z, { yaw: 1.4 }, (k) => brokenChain(k)); // the dog's chain and collar
  c.build();

  // frozen blood by the mouth, wolf tracks coming from the mill over the ice
  const blood = tex.blob('blood', { r: 96, g: 28, b: 24, a: 0.9, seed: 3, speck: 0.2, size: 128 });
  for (const [lx, lz, w] of [[-0.6, 5.0, 1.8], [1.4, 6.4, 1.2], [-2.0, 7.4, 0.9]]) {
    const q = R(lx, lz);
    groundPatch(G, { x: q.x, z: q.z, w, d: w * 0.8, yaw: rnd.range(0, 3), map: blood, opacity: 0.8, lift: 0.045, name: 'denBlood' });
  }
  const trk = smoothPath([[LOC.mill.x + 4, LOC.mill.z - 6], [LOC.mill.x + 30, LOC.mill.z - 18], [LOC.mill.x + 58, LOC.mill.z - 32], [LOC.mill.x + 74, LOC.mill.z - 46], [R(0, 9).x, R(0, 9).z]], 1.6);
  groundRibbon(G, { pts: trk, width: 1.2, map: tex.tracks('wolf', 5), repeat: 8, lift: 0.04, opacity: 0.75, name: 'denTracks', order: 4 });
  const trk2 = smoothPath([[R(0, 9).x, R(0, 9).z], [P.x - 10, P.z + 8], [P.x - 22, P.z + 12], [P.x - 38, P.z + 4]], 1.6);
  groundRibbon(G, { pts: trk2, width: 1.2, map: tex.tracks('wolf', 11), repeat: 8, lift: 0.04, opacity: 0.6, name: 'denTracks2', order: 4 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const spawn = (lx, lz) => { const q = R(lx, lz); return v(q.x, gh(q.x, q.z), q.z); };
  W.loc('waterfall', {
    id: 'waterfall',
    den: {
      center: v(P.x, floor, P.z),
      mouth: spawn(0, 1.4),
      wolfSpawns: [spawn(-1.2, 3.2), spawn(1.4, 3.8), spawn(-2.6, 5.4), spawn(2.8, 6.0)],
      alpha: spawn(0, 2.4), // the scarred alpha waits at the mouth
      collar: v(dc.x, floor + 0.1, dc.z), // the dog's collar: Gniewko wants it back
      tracks: { points: trk, kind: 'footprints' },
      yaw,
    },
  });
}

// ---------------------------------------------------------------------------------------------
function crystalGeometry(rnd, count, baseR) {
  // Hexagonal prisms with pointed tips fanned from the origin along +y; merged. Colors by vertex.
  const parts = [];
  for (let i = 0; i < count; i++) {
    const h = baseR * rnd.range(4, 9) * (i === 0 ? 1.3 : rnd.range(0.4, 1.0));
    const r = baseR * rnd.range(0.7, 1.25);
    const body = new THREE.CylinderGeometry(r * 0.92, r * 1.12, h * 0.74, 6, 1, true);
    body.translate(0, h * 0.37, 0);
    const tip = new THREE.ConeGeometry(r * 0.92, h * 0.3, 6, 1, false);
    tip.translate(0, h * 0.74 + h * 0.15, 0);
    const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()], false);
    g.rotateY(rnd.range(0, 6.28));
    const tilt = i === 0 ? rnd.range(0, 0.15) : rnd.range(0.2, 0.75);
    g.rotateZ(tilt * (rnd.chance(0.5) ? 1 : -1));
    g.rotateY(rnd.range(0, 6.28));
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

async function iceCave(W) {
  const { G } = W;
  const rnd = rngOf(451);
  const info = G.water?.waterfall?.info?.caveMouth;
  const cm = info ? { x: info.x, y: info.y, z: info.z } : { x: FALLS.x + 1, y: FALLS.bottom + 0.3, z: FALLS.caveZ };
  const floorY = cm.y;
  const slotBack = cm.x + 4.6; // the slot's back wall, where the tunnel enters the cliff
  const pts = [
    { x: slotBack - 0.3, y: floorY, z: cm.z, w: 4.4, h: 3.8 },
    { x: slotBack + 3.6, y: floorY, z: cm.z - 0.3, w: 4.8, h: 4.0 },
    { x: slotBack + 8.0, y: floorY + 0.05, z: cm.z - 1.2, w: 4.0, h: 3.4 },
    { x: slotBack + 12.4, y: floorY + 0.1, z: cm.z - 2.8, w: 4.8, h: 4.2 },
    { x: slotBack + 17.0, y: floorY + 0.25, z: cm.z - 5.0, w: 7.2, h: 5.4 },
    { x: slotBack + 21.6, y: floorY + 0.45, z: cm.z - 7.6, w: 10.4, h: 6.8 },
    { x: slotBack + 25.4, y: floorY + 0.6, z: cm.z - 8.8, w: 7.4, h: 5.2 },
    { x: slotBack + 27.6, y: floorY + 0.7, z: cm.z - 9.2, w: 2.2, h: 2.2 },
  ];
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q.x, q.y, q.z)), false, 'centripetal');
  const N = 44, M = 14;
  const lerpPts = (t, key) => {
    const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return pts[i][key] + (pts[i + 1][key] - pts[i][key]) * u;
  };

  // ---- the faceted ice shell -----------------------------------------------------------------------
  const pos = [], col = [], idx = [];
  const ringInfo = [];
  const cA = new THREE.Color(0x3d7ea8), cB = new THREE.Color(0x1b3f5e), cC = new THREE.Color(0xcfeaf8), cD = new THREE.Color(0x14283a);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const P = curve.getPoint(t);
    const T = curve.getTangent(t); T.y = 0; T.normalize();
    const S = new THREE.Vector3(-T.z, 0, T.x);
    const w = lerpPts(t, 'w'), h = lerpPts(t, 'h');
    const ring = [];
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const u = Math.cos(a), v = Math.sin(a);
      const n1 = noise.noise3(P.x * 0.45 + j * 0.7, P.z * 0.45, j * 0.4 + 3) * 0.22;
      const n2 = noise.noise3(P.x * 1.4, P.z * 1.4 + j, 9) * 0.1;
      const k = 1 + n1 + n2;
      const ox = u * (w / 2) * k;
      const oy = (v >= 0 ? Math.pow(v, 0.8) * h : v * 0.14) * (1 + n1 * 0.5);
      const x = P.x + S.x * ox, z = P.z + S.z * ox, y = P.y + oy - 0.12 + (v >= 0 ? 0 : 0);
      pos.push(x, y, z);
      // color: frosted floor, blue walls, dark vein streaks, bright white rime near the top
      const nrmY = v;
      const c = new THREE.Color().copy(cA).lerp(cB, 0.5 + n2 * 2);
      if (nrmY < -0.2) c.lerp(cC, 0.55);
      if (nrmY > 0.75) c.lerp(cC, 0.3 + n1);
      if (noise.noise3(x * 0.9, y * 0.9, z * 0.9) > 0.3) c.lerp(cD, 0.6);
      col.push(c.r, c.g, c.b);
      ring.push({ x, y, z, nx: -S.x * u, ny: -v, nz: -S.z * u });
    }
    ringInfo.push({ P, T, S, w, h, ring });
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05, side: THREE.DoubleSide, flatShading: true, emissive: 0x0a2c4a, emissiveIntensity: 0.9 });
  const shell = new THREE.Mesh(geo, shellMat);
  shell.name = 'wild:iceCaveShell';
  shell.receiveShadow = false;
  G.scene.add(shell);

  // ---- the dark plug over the tunnel mouth (the terrain's own back wall stays outside) --------------------
  {
    const w = pts[0].w * 0.5, h = pts[0].h;
    const sh = new THREE.Shape();
    sh.moveTo(-w, 0); sh.lineTo(-w, h * 0.55); sh.quadraticCurveTo(-w * 0.9, h * 1.02, 0, h * 1.05); sh.quadraticCurveTo(w * 0.9, h * 1.02, w, h * 0.55); sh.lineTo(w, 0); sh.closePath();
    const plug = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), new THREE.MeshBasicMaterial({ color: 0x07131f, fog: false }));
    plug.position.set(pts[0].x - 0.2, floorY - 0.1, cm.z);
    plug.rotation.y = -Math.PI / 2; // faces west, toward the slot
    plug.name = 'wild:iceCavePlug';
    G.scene.add(plug);
  }

  // ---- crystals on the walls and floor: emissive blue ---------------------------------------------------------
  const crystalList = [];
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x86c8ee, emissive: 0x2a84cc, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.1, flatShading: true });
  const geos = [];
    const place = (px, py, pz, nx, ny, nz, count, baseR) => {
    const g = crystalGeometry(rnd, count, baseR);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz).normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    geos.push(g);
    crystalList.push(new THREE.Vector3(px, py, pz));
  };
  for (let i = 3; i < N - 1; i++) {
    const info2 = ringInfo[i];
    const n = i > N * 0.5 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      // on the walls and floor edges mostly; the ceiling gets few
      let j = Math.floor(rnd.range(0, M)), tries = 0;
      while (info2.ring[j].ny < -0.55 && tries++ < 4) j = Math.floor(rnd.range(0, M));
      const rg = info2.ring[j];
      const big = i > N * 0.45 && i < N * 0.9;
      place(rg.x, rg.y, rg.z, rg.nx, rg.ny * 0.6 + 0.35, rg.nz, rnd.range(3, 6), big ? rnd.range(0.06, 0.12) : rnd.range(0.04, 0.085));
    }
  }
  // grotto centerpiece: a ring of tall crystals round the stash, and a guard of small ones at the slot
  const gr = ringInfo[Math.round(N * 0.82)].P;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, r = rnd.range(2.4, 3.8);
    place(gr.x + Math.cos(a) * r, floorY + 0.5, gr.z + Math.sin(a) * r, Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3, rnd.range(4, 6), rnd.range(0.11, 0.19));
  }
  for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) place(cm.x + 1.2 + i * 1.4, floorY + 0.4, cm.z + sz * (2.6 - i * 0.1), 0, 0.5, -sz, rnd.range(3, 5), rnd.range(0.06, 0.12));
  const crystalMesh = new THREE.Mesh(mergeGeometries(geos, false), baseMat);
  crystalMesh.name = 'wild:iceCaveCrystals';
  G.scene.add(crystalMesh);
  for (const g of geos) g.dispose();
  // a few halos for bloom
  for (let i = 0; i < crystalList.length; i += 7) {
    const q = crystalList[i];
    W.fx?.glow?.({ position: [q.x, q.y + 0.4, q.z], parent: G.scene, size: 2.4, color: [0.3, 0.65, 1.0], strength: 0.55, lamp: false });
  }

  // ---- stalactites and ice plates, the stash ----------------------------------------------------------------------
  const c = new Composer(G, W.ctx, 'iceCave', cm.x, cm.z, { seed: 52, y: floorY });
  for (let i = 4; i < N - 2; i += 2) {
    const info2 = ringInfo[i];
    for (let k = 0; k < 3; k++) {
      const jj = Math.floor(rnd.range(M * 0.18, M * 0.46));
      const rg = info2.ring[jj];
      c.at(rg.x, rg.z, { y: rg.y }, (kk) => {
        const len = rnd.range(0.25, 0.8);
        kk.cone('ice', rnd.range(0.04, 0.1), len, { pos: [0, -len / 2 - 0.02, 0], rot: [Math.PI, 0, 0], radial: 6, tint: 0xcfeaf8, grime: 0, var: 0.06 });
      });
    }
  }
  const stashPos = new THREE.Vector3(gr.x + 0.4, floorY + 0.5, gr.z + 0.2);
  const stashH = c.prop('chest', gr.x + 0.4, gr.z + 0.2, { seed: 3, opts: { variant: 'painted' }, yaw: 0.6, y: floorY + 0.02, collide: true });
  c.at(gr.x + 0.4, gr.z + 0.2, { y: floorY + 0.02 }, (k) => {
    k.blob('ice', 0.6, { pos: [0, -0.16, 0], scale: [1.5, 0.22, 1.2], detail: 1, flat: true, tint: 0xcfeaf8, grime: 0 });
    for (let i = 0; i < 5; i++) k.blob('ice', 0.12, { pos: [Math.cos(i * 1.26) * 0.62, 0.04, Math.sin(i * 1.26) * 0.5], scale: [1, 0.8, 1], detail: 0, flat: true, tint: 0xe0f2fc, grime: 0 });
  });
  // an old pile of offerings left at the cave mouth by someone who believed in it
  c.prop('offering', cm.x + 1.4, cm.z + 0.4, { seed: 7, yaw: 0.8, opts: { variant: 'bread' } });
  c.build();
  void stashH;

  // ---- light: one blue point light that follows the player through the tunnel ------------------------------------------
  const light = new THREE.PointLight(0x59b9ff, 0, 22, 2);
  light.name = 'wild:iceCaveLight';
  light.castShadow = false;
  G.scene.add(light);
  const lightPts = ringInfo.map((r) => r.P);
  W.tick(() => {
    const cp = G.player?.position || G.camera.position;
    const d0 = Math.hypot(cp.x - (cm.x + 12), cp.z - cm.z);
    if (d0 > 60) { light.intensity = 0; return; }
    let best = 0, bd = 1e9;
    for (let i = 0; i < lightPts.length; i++) { const d = Math.hypot(cp.x - lightPts[i].x, cp.z - lightPts[i].z); if (d < bd) { bd = d; best = i; } }
    const q = lightPts[best];
    light.position.set(q.x, q.y + 2.2, q.z);
    light.intensity = 26 * Math.min(1, Math.max(0, (60 - d0) / 25));
  });
  W.light({ x: gr.x, y: floorY + 2.5, z: gr.z, color: 0x59b9ff, intensity: 2.2, radius: 18, kind: 'ice' });
  W.light({ x: cm.x + 2, y: floorY + 2, z: cm.z, color: 0x59b9ff, intensity: 1.2, radius: 10, kind: 'ice' });
  W.interior({ id: 'iceCave', polygon: ringInfo.flatMap((r, i) => (i % 4 === 0 ? [[r.P.x + r.S.x * r.w * 0.5, r.P.z + r.S.z * r.w * 0.5]] : [])).concat(ringInfo.slice().reverse().flatMap((r, i) => (i % 4 === 0 ? [[r.P.x - r.S.x * r.w * 0.5, r.P.z - r.S.z * r.w * 0.5]] : []))), y0: floorY - 1, y1: floorY + 8, env: 'cave' });

  // ---- walls: the tunnel sides are colliders; the floor is a walk surface ---------------------------------------------------
  const ids = [];
  for (let i = 1; i < N; i += 1) {
    const r = ringInfo[i];
    for (const sg of [-1, 1]) ids.push(G.physics?.addCircle(r.P.x + r.S.x * sg * (r.w * 0.5 + 0.45), r.P.z + r.S.z * sg * (r.w * 0.5 + 0.45), 0.9, { y0: floorY - 0.5, y1: floorY + r.h + 2, tag: 'iceCaveWall' }));
  }
  const L1 = [], L2 = [];
  for (const r of ringInfo) { L1.push([r.P.x + r.S.x * r.w * 0.45, r.P.z + r.S.z * r.w * 0.45]); L2.push([r.P.x - r.S.x * r.w * 0.45, r.P.z - r.S.z * r.w * 0.45]); }
  const floorPoly = L1.concat(L2.reverse());
  const walk = { floors: [{ y: floorY, polygon: floorPoly, tag: 'iceCave' }], ramps: [] };
  (G.world.walkFloors ||= []).push({ id: 'iceCave', y: floorY, polygon: floorPoly, yAt: (x, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < ringInfo.length; i++) { const d = Math.hypot(x - ringInfo[i].P.x, z - ringInfo[i].P.z); if (d < bd) { bd = d; bi = i; } } return ringInfo[bi].P.y; } });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const cur = G.world.locations.waterfall || {};
  W.loc('waterfall', {
    cave: {
      mouth: v(cm.x, floorY, cm.z), // the slot behind the curtain
      entrance: v(pts[0].x, floorY, pts[0].z), // the tunnel mouth (dark plug)
      path: ringInfo.filter((_, i) => i % 4 === 0).map((r) => v(r.P.x, r.P.y, r.P.z)),
      grotto: v(gr.x, floorY, gr.z),
      stash: stashPos, // the stash chest, ringed by crystals
      crystals: crystalList.slice(0, 12),
      floorY,
      walk,
      colliders: ids,
    },
    ...(cur.den ? {} : {}),
  });
}
