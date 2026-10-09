// Hot spring (LOC.hotSpring): a warm spring on the north shore that never freezes. Two dark teal pools in
// stone rims with steam columns, bare wet ground and green moss where the snow cannot lie, mossy boulders, and
// the ruined bathhouse (kit) with the initials "J + W" cut in a beam over the door; a frozen laundry line, a
// bucket, a ladle and a red thread hung on a nail beside the initials.
//
// G.world.locations.hotSpring:
//   center, bathhouse (placed), pools[2] { x, z, rx, rz }, steam[], initials (carved beam, clue), door, warm (spot),
//   moss[] (patch centers)
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf, rockBlocks } from './compose.js';
import { tex, groundPatch } from './decals.js';
import { addCompileHook } from '../../../render/Materials.js';

// Irregular pool outline: a noisy ellipse as a ShapeGeometry flattened onto XZ at height y.
function poolMesh(G, cx, cz, rx, rz, rot, y, seed) {
  const rnd = rngOf(seed);
  const pts = [];
  const n = 28;
  const ph = rnd.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(a * 2 + ph) + 0.09 * Math.sin(a * 3 + ph * 2) + rnd.signed(0.035);
    pts.push(new THREE.Vector2(Math.cos(a) * rx * k, Math.sin(a) * rz * k));
  }
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts), 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x143a3e, roughness: 0.06, metalness: 0.0, emissive: 0x0c3a3a, emissiveIntensity: 0.5, transparent: true, opacity: 0.94 });
  // a slow drifting shimmer on the surface
  addCompileHook(mat, 'wildSpring', (shader) => {
    shader.uniforms.uTime = G.uniforms.uTime;
    shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      { vec2 q = vViewPosition.xy * 0.0; float s = sin(uTime * 0.7 + vViewPosition.x * 1.3 + vViewPosition.z * 0.9) * 0.5 + 0.5; totalEmissiveRadiance *= 0.75 + 0.5 * s; }`);
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, y, cz);
  m.rotation.y = rot;
  m.name = 'wild:springPool';
  m.receiveShadow = true;
  m.renderOrder = 2;
  G.scene.add(m);
  return { mesh: m, pts, rot };
}

export async function build(W) {
  const { G } = W;
  const L = LOC.hotSpring;
  const rnd = rngOf(342);
  W.clear(L.x, L.z, 20);
  const y0 = G.world.heightAt(L.x, L.z);

  // ---- the ruined bathhouse ------------------------------------------------------------------------------
  const bpos = { x: L.x - 5, z: L.z + 1 };
  const byaw = 0.4;
  const bb = buildings.ruinedBathhouse({ seed: 221 });
  const bh = placeBuilding(G, bb, bpos.x, bpos.z, byaw, { foundation: true, skirt: false, tag: 'bathhouse' });
  for (const l of bh.lights) W.light(l);

  // ---- the pools -------------------------------------------------------------------------------------------
  const pools = [
    { x: L.x + 13, z: L.z + 6, rx: 5.2, rz: 3.5, rot: 0.5 },
    { x: L.x + 21, z: L.z - 3.5, rx: 3.0, rz: 2.2, rot: -0.4 },
  ];
  const steam = [];
  const c = new Composer(G, W.ctx, 'hotSpring', L.x, L.z, { seed: 34 });
  const rocks = [];
  pools.forEach((pl, pi) => {
    const gy = G.world.heightAt(pl.x, pl.z);
    poolMesh(G, pl.x, pl.z, pl.rx, pl.rz, pl.rot, gy + 0.2, 40 + pi);
    // stone rim: low flattened stones around the outline, snow-free and mossy
    const nRim = pi === 0 ? 30 : 20;
    for (let i = 0; i < nRim; i++) {
      const a = (i / nRim) * Math.PI * 2 + rnd.signed(0.05);
      const rr = 1.08 + rnd.signed(0.06);
      const lx = Math.cos(a) * pl.rx * rr, lz = Math.sin(a) * pl.rz * rr;
      const x = pl.x + lx * Math.cos(pl.rot) + lz * Math.sin(pl.rot), z = pl.z - lx * Math.sin(pl.rot) + lz * Math.cos(pl.rot);
      const s = rnd.range(0.28, 0.55);
      const moss = rnd.chance(0.6);
      c.at(x, z, { y: gy }, (k) => {
        k.blob('stone', s, { pos: [0, s * 0.35, 0], scale: [1.2, 0.55, 1.0], rot: [0, rnd.range(0, 6.28), 0], detail: 1, flat: true, tint: rnd.pick([0xa8a29a, 0x8a847e, 0xb4aea6]), jitter: s * 0.1, nosnow: true });
        if (moss) k.blob('matte', s * 0.8, { pos: [0, s * 0.62, 0], scale: [1.1, 0.22, 0.95], detail: 1, tint: rnd.pick([0x5d7a3a, 0x6f8a42, 0x4e6a34]), jitter: s * 0.05, grime: 0, var: 0.2, nosnow: true });
      });
    }
    // steam columns over the water
    const ns = pi === 0 ? 4 : 2;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * Math.PI * 2 + 0.7, d = pi === 0 ? 0.5 : 0.35;
      const lx = Math.cos(a) * pl.rx * d, lz = Math.sin(a) * pl.rz * d;
      const x = pl.x + lx * Math.cos(pl.rot) + lz * Math.sin(pl.rot), z = pl.z - lx * Math.sin(pl.rot) + lz * Math.cos(pl.rot);
      const e = W.fx?.steam?.({ position: [x, gy + 0.3, z], parent: G.scene, height: 7 + rnd.range(0, 3), rate: 5.5, spread: 1.0 + pl.rx * 0.12, size: 1.5, opacity: 0.38 });
      if (e) steam.push(e);
    }
    W.fire(pl.x, pl.z, pl.rx + 3.5); // warm water: the player warms up here
  });
  // steam out of the bathhouse's own pool
  {
    const sp = bh.anchors.steam;
    const e = W.fx?.steam?.({ position: [sp.x, sp.y + 0.3, sp.z], parent: G.scene, height: 5, rate: 4, spread: 1.1, size: 1.3, opacity: 0.34 });
    if (e) steam.push(e);
    W.fire(sp.x, sp.z, 4.5);
  }

  // ---- mossy boulders around the spring -----------------------------------------------------------------
  const blocks = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(0, 6.28), d = rnd.range(11, 19);
    const x = L.x + 6 + Math.cos(a) * d, z = L.z + 2 + Math.sin(a) * d * 0.8;
    if (Math.hypot(x - bpos.x, z - bpos.z) < 7 || pools.some((pl) => Math.hypot(x - pl.x, z - pl.z) < pl.rx + 2)) continue;
    const s = rnd.range(0.8, 1.9);
    const gy = G.world.heightAt(x, z);
    blocks.push({ v: i % 5, x, y: gy - 0.2, z, s: [s * 1.2, s * 0.8, s], ry: rnd.range(0, 6.28), embed: 0.3 });
    rocks.push({ x, z, s, y: gy });
  }
  rockBlocks(G, blocks, { tone: 0.85, name: 'hotSpringRocks' });
  for (const rk of rocks) {
    c.at(rk.x, rk.z, { y: rk.y }, (k) => {
      for (let j = 0; j < 3; j++) k.blob('matte', rk.s * rnd.range(0.3, 0.5), { pos: [rnd.signed(rk.s * 0.5), rk.s * 0.55 + rnd.range(0, 0.15), rnd.signed(rk.s * 0.4)], scale: [1.3, 0.28, 1.0], detail: 1, tint: rnd.pick([0x5d7a3a, 0x6f8a42, 0x4e6a34]), jitter: 0.03, grime: 0, var: 0.2, nosnow: true });
    });
  }

  // ---- props of the bathing place ----------------------------------------------------------------------------
  const bx = (lx, lz) => { const cs = Math.cos(byaw), sn = Math.sin(byaw); return { x: bpos.x + lx * cs + lz * sn, z: bpos.z - lx * sn + lz * cs }; };
  const lp = bx(6.6, 4.0);
  c.prop('laundryLine', lp.x, lp.z, { seed: 2, yaw: byaw + 1.3, opts: { length: 3.0 } });
  const bk = bx(3.6, 5.2);
  c.prop('bucket', bk.x, bk.z, { seed: 3, yaw: 0.6 });
  const wp = bx(-6.0, -1.0);
  c.prop('woodpile', wp.x, wp.z, { seed: 2, yaw: byaw + Math.PI / 2 });
  // a red thread hung on a nail beside the initials
  const ini = bh.anchors.initials;
  c.at(ini.x, ini.z, { y: ini.y, yaw: byaw }, (k) => {
    k.tube('ribbon', [[0.62, -0.1, -0.2], [0.66, -0.2, -0.18], [0.7, -0.1, -0.2], [0.66, -0.02, -0.2]], 0.006, { radial: 3, tint: 0x7a241a, grime: 0, closed: true });
    k.box('iron', 0.012, 0.012, 0.04, { pos: [0.66, -0.02, -0.18], tint: 0x4a4540, grime: 0 });
  });
  c.build();

  // ---- ground: bare wet earth and moss where the snow cannot lie ---------------------------------------------
  const wet = tex.blob('springWet', { r: 52, g: 44, b: 36, a: 0.92, seed: 4, speck: 0.15, size: 256 });
  const moss = tex.blob('springMoss', { r: 78, g: 118, b: 52, a: 0.95, seed: 6, speck: 0.3, size: 128 });
  groundPatch(G, { x: L.x + 15, z: L.z + 4, w: 30, d: 22, yaw: 0.2, map: wet, opacity: 0.9, lift: 0.045, name: 'springWet' });
  groundPatch(G, { x: bpos.x, z: bpos.z + 0.5, w: 14, d: 11, yaw: byaw, map: wet, opacity: 0.85, lift: 0.045, name: 'bathWet' });
  const mossPts = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd.range(0, 6.28), d = rnd.range(2, 15);
    const x = L.x + 8 + Math.cos(a) * d, z = L.z + 3 + Math.sin(a) * d * 0.7;
    const w = rnd.range(1.6, 3.8);
    groundPatch(G, { x, z, w, d: w * rnd.range(0.7, 1.2), yaw: rnd.range(0, 3), map: moss, opacity: 0.95, lift: 0.07, name: 'springMoss' });
    mossPts.push(new THREE.Vector3(x, G.world.heightAt(x, z), z));
  }

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('hotSpring', {
    id: 'hotSpring',
    center: v(L.x, y0, L.z),
    bathhouse: bh,
    pools: pools.map((p) => ({ x: p.x, z: p.z, rx: p.rx, rz: p.rz })),
    steam,
    initials: bh.anchors.initials.clone(), // "J + W" carved in the beam over the door
    door: bh.anchors.door.clone(),
    warm: v(pools[0].x, y0, pools[0].z),
    moss: mossPts,
  });
}
