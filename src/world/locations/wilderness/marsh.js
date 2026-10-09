// West marsh (LOC.marsh): reeds through the ice (vegetation owns them). At night three pale will-o-wisps drift
// in a chain through the reeds and keep ahead of anyone who follows (they lead to the drowned smuggler); a
// wayside shrine stands half sunk in the ice, tilted, with a candle still lit in its niche; the smuggler is
// frozen into a pool up to his chest, one arm reaching, a punt frozen in beside him, casks and a sack lost.
//
// G.world.locations.marsh:
//   center, wisps[3] { x, y, z, emitter }, wispPath (points the lights lead along), shrine { x, z, candle },
//   smuggler { pos, note (note_smuggler clue), key (key anchor), character }, punt, casks[]
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf } from './compose.js';
import { frozenChar, frostFace } from './figures.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.marsh;
  const rnd = rngOf(262);
  const poolAt = (x, z) => {
    // best nearby spot that sits in a pool (terrain well under the ice all round)
    let best = { x, z, score: -1e9 };
    for (let dx = -9; dx <= 9; dx += 1.5) for (let dz = -9; dz <= 9; dz += 1.5) {
      let s = 0;
      for (const [ox, oz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.1, 1.1], [-1.1, -1.1]]) s -= G.world.terrainAt(x + dx + ox, z + dz + oz);
      s -= Math.hypot(dx, dz) * 0.15;
      if (s > best.score) best = { x: x + dx, z: z + dz, score: s };
    }
    return best;
  };

  // ---- the smuggler, frozen in a pool at the far end of the light path -----------------------------------
  const sm = poolAt(L.x - 21, L.z + 18);
  W.clear(sm.x, sm.z, 3.5);
  const smuggler = await frozenChar(G, 'villager_m_6', { x: sm.x, z: sm.z, y: 0.78, yaw: 2.3, base: 'drown_reach', tint: [0.8, 0.9, 1.0], steps: 2.6 });

  frostFace(smuggler, { opacity: 0.55 });
  // ---- dressing: ice crust round him, the punt, casks, a sack, the key ---------------------------------------
  const c = new Composer(G, W.ctx, 'marsh', L.x, L.z, { seed: 62, y: 0 });
  c.at(sm.x, sm.z, { y: 0 }, (k) => {
    // a collar of rough ice heaved up round the body and a dusting of rime on his shoulders and hair
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd.signed(0.2), d = rnd.range(0.35, 0.65);
      k.blob('ice', rnd.range(0.14, 0.26), { pos: [Math.cos(a) * d, 0.06, Math.sin(a) * d], scale: [1.2, rnd.range(0.4, 0.9), 1.0], rot: [rnd.signed(0.4), rnd.range(0, 6), rnd.signed(0.4)], detail: 0, flat: true, tint: rnd.pick([0xdbeaf3, 0xc9dfec, 0xe6f1f8]), grime: 0, var: 0.06 });
    }
    k.mound(0.5, 0.08, 0.4, { pos: [0.0, 1.0, 0.0], jseed: 3 });
    k.mound(0.22, 0.06, 0.2, { pos: [0.02, 1.52, 0.0], jseed: 5 });
  });
  const pn = poolAt(sm.x + 9, sm.z - 6);
  W.clear(pn.x, pn.z, 3.2);
  c.prop('boat', pn.x, pn.z, { seed: 4, yaw: 0.8, opts: { variant: 'frozen', length: 3.4 }, y: 0 });
  const casks = [];
  for (const [dx, dz, s] of [[2.6, 1.4, 1], [3.5, 0.2, 2]]) {
    const x = sm.x + dx, z = sm.z + dz;
    c.prop('barrel', x, z, { seed: s, rot: [0.1, 0, 1.2 + s * 0.2], dy: 0.1, opts: { variant: 'salt' } });
    c.at(x, z, { y: 0 }, (k) => k.blob('ice', 0.5, { pos: [0, 0.04, 0], scale: [1.5, 0.15, 1.2], detail: 1, flat: true, tint: 0xd6e8f4, grime: 0 }));
    casks.push(new THREE.Vector3(x, 0.3, z));
  }
  c.prop('sack', sm.x - 1.8, sm.z + 1.2, { seed: 3, rot: [0, 0, 1.0], dy: 0.1, yaw: 0.6 });
  // the key: on a thong, dropped on the ice in front of his reaching hand
  const keyPos = new THREE.Vector3(sm.x + 0.65, 0.03, sm.z - 0.55);
  c.at(keyPos.x, keyPos.z, { y: 0.01, yaw: 0.8 }, (k) => {
    k.cyl('iron', 0.008, 0.008, 0.11, { pos: [0, 0.01, 0], rot: [Math.PI / 2, 0, 0], radial: 5, tint: 0x7a7468, grime: 0, cap: null });
    k.torus('iron', 0.02, 0.006, { pos: [0, 0.012, 0.07], rot: [Math.PI / 2, 0, 0], seg: 8, rseg: 3, tint: 0x7a7468, grime: 0 });
    k.box('iron', 0.02, 0.01, 0.014, { pos: [0.014, 0.01, -0.04], tint: 0x7a7468, grime: 0 });
    k.tube('rope', [[0, 0.01, 0.08], [0.1, 0.008, 0.2], [0.05, 0.006, 0.34]], 0.004, { radial: 3, tint: 0x6a5a42, grime: 0 });
    k.blob('ice', 0.04, { pos: [0, 0.005, 0.0], scale: [1.6, 0.2, 1.1], detail: 0, flat: true, tint: 0xe2f0f8, grime: 0 });
  });

  // ---- the drowned wayside shrine ---------------------------------------------------------------------------------
  const sp = poolAt(L.x + 14, L.z + 2);
  W.clear(sp.x, sp.z, 2.6);
  const shrineB = buildings.waysideShrine({ seed: 51 });
  const sh = placeBuilding(G, shrineB, sp.x, sp.z, 0.7, { snap: false, y: -0.85, foundation: false, skirt: false, tag: 'drownedShrine' });
  sh.root.rotation.z = 0.2;
  sh.root.rotation.x = -0.11;
  sh.root.updateMatrixWorld(true);
  for (const l of sh.lights) W.light({ ...l, intensity: (l.intensity || 0.4) * 1.0 });
  c.at(sp.x, sp.z, { y: 0 }, (k) => {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rnd.signed(0.2), d = rnd.range(0.55, 0.95);
      k.blob('ice', rnd.range(0.18, 0.34), { pos: [Math.cos(a) * d, 0.08, Math.sin(a) * d], scale: [1.2, rnd.range(0.4, 1.0), 1.0], rot: [rnd.signed(0.4), rnd.range(0, 6), rnd.signed(0.4)], detail: 0, flat: true, tint: rnd.pick([0xdbeaf3, 0xc9dfec, 0xe6f1f8]), grime: 0, var: 0.06 });
    }
    k.mound(1.2, 0.18, 1.0, { pos: [-0.3, 0.02, -0.2], jseed: 4 });
    k.hang('ribbon', 0.05, 0.5, { pos: [0.1, 1.35, 0.18], tint: 0x7a241a, sway: 0.5, wave: 0.03 });
  });
  c.prop('offering', sp.x - 1.5, sp.z + 0.8, { seed: 6, yaw: 1.0, opts: { variant: 'bowl' }, y: 0 });
  c.build();

  // ---- the wisps: a chain along a path from the open ice to the smuggler ----------------------------------------
  const start = { x: L.x + 28, z: L.z - 10 };
  const wpts = [];
  const nW = 7;
  for (let i = 0; i <= nW; i++) {
    const t = i / nW;
    wpts.push({ x: start.x + (sm.x - start.x) * t + Math.sin(t * 5.1) * 4.0, z: start.z + (sm.z - start.z) * t + Math.cos(t * 4.3) * 3.0 });
  }
  const wisps = [];
  const idx0 = [1, 3, 5];
  idx0.forEach((i0, k) => {
    const em = W.fx?.wisp?.({ position: [wpts[i0].x, 1.0, wpts[i0].z], parent: G.scene, radius: 1.1 + k * 0.2, hover: 1.0 + k * 0.15, color: [0.55, 1.0, 0.85] });
    if (!em) return;
    wisps.push({ em, idx: i0, k, pos: new THREE.Vector3(wpts[i0].x, 1.0, wpts[i0].z), goal: wpts[i0] });
    W.nightOnly(em);
  });
  // a soft lure halo per wisp, so the chain of lights reads from forty metres across the ice
  let haloTex = null;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g2 = cv.getContext('2d');
    const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(210,255,240,0.95)'); gr.addColorStop(0.18, 'rgba(120,255,215,0.5)'); gr.addColorStop(0.55, 'rgba(60,200,170,0.12)'); gr.addColorStop(1, 'rgba(40,160,140,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(cv);
  } catch { haloTex = null; }
  for (const w of wisps) {
    if (!haloTex) break;
    const sm2 = new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    w.halo = new THREE.Sprite(sm2);
    w.halo.scale.set(5.6, 5.6, 1);
    w.halo.name = 'wild:wispHalo';
    w.halo.renderOrder = 9;
    G.scene.add(w.halo);
  }
  const lastIdx = [nW - 2, nW - 1, nW];
  W.tick((dt) => {
    const pp = G.player?.position || G.camera.position;
    const nt = G.uniforms.uNight ? G.uniforms.uNight.value : 0;
    const nk = Math.min(1, Math.max(0, (nt - 0.12) / 0.43));
    for (const w of wisps) {
      if (w.halo) {
        w.halo.position.set(w.pos.x, w.pos.y, w.pos.z);
        w.halo.material.opacity = 0.95 * nk * nk * (3 - 2 * nk);
        w.halo.visible = w.halo.material.opacity > 0.01;
      }
      const d = Math.hypot(pp.x - w.pos.x, pp.z - w.pos.z);
      // when someone comes within 8 m the light slips on to the next point of the chain (never past its own last point)
      if (d < 8 && w.idx < lastIdx[w.k]) { w.idx++; w.goal = wpts[w.idx]; }
      const k = 1 - Math.exp(-dt * 1.4);
      w.pos.x += (w.goal.x - w.pos.x) * k; w.pos.z += (w.goal.z - w.pos.z) * k;
      w.pos.y = 1.0 + 0.25 * Math.sin(G.clock.elapsed * 0.9 + w.k * 2);
      w.em.object.position.set(w.pos.x, w.pos.y, w.pos.z);
    }
  });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('marsh', {
    id: 'marsh',
    center: v(L.x, 0, L.z),
    wisps: wisps.map((w) => ({ x: w.pos.x, y: w.pos.y, z: w.pos.z, emitter: w.em })),
    wispPath: wpts.map((q) => v(q.x, 0, q.z)),
    shrine: { x: sp.x, z: sp.z, candle: v(sp.x, 0.9, sp.z) },
    smuggler: {
      pos: v(sm.x, 0, sm.z),
      note: v(sm.x - 0.1, 0.9, sm.z + 0.1), // note_smuggler: in his coat
      key: keyPos.clone(),
      character: smuggler,
    },
    punt: v(pn.x, 0, pn.z),
    casks,
  });
}
