// Vegetation: forests, birch groves, bushes, dead wood, ground cover, reeds and wind.
// Owner: vegetation builder. Library code lives in src/world/trees/ (see layer.js for the render
// strategy, placement.js for the rules, impostor.js for the far billboards).
//
// Public API (G.vegetation):
//   clearArea(x, z, r)        hide trees, bushes, ground cover, reeds and far impostors in a circle
//                              and drop their colliders; returns the number of hidden trees/bushes
//   treeAt(x, z, r = 0)       { kind, species, x, z, r } of a live trunk within r of the point, or null
//   report()                  instance counts per species, draw call and triangle estimate
//   layers { trees, ground, impostors }, kinds, stats  (debug)
// Locations builders may also append circles or boxes to src/world/exclusions.js at any time; the
// system hides trees under new entries on the next frame.
import { ORDER } from '../core/G.js';
import { WORLD } from './layout.js';
import { EXCLUSIONS, exclusionDistance } from './exclusions.js';
import { createKinds } from './trees/kinds.js';
import { VegLayer } from './trees/layer.js';
import { bakeImpostors, ImpostorLayer } from './trees/impostor.js';
import { placeVegetation, placeFarRing, GroundGenerator } from './trees/placement.js';
import { lodUniform, setLod } from './trees/materials.js';
import { ShadowProxyLayer } from './trees/shadowProxy.js';

const GROUND_CELL = 16;

export async function init(G) {
  const t0 = performance.now();
  const q = G.quality;
  const all = createKinds();
  const treeKinds = all.filter((k) => k.group !== 'ground');
  const groundKinds = all.filter((k) => k.group === 'ground');
  const tKinds = performance.now();

  const atlas = await bakeImpostors(G, treeKinds);
  const tBake = performance.now();

  const placed = await placeVegetation(G, treeKinds);
  const tPlace = performance.now();

  // trunk colliders for every tree inside the playable area
  const P = WORLD.playable;
  const physics = G.physics;
  let colliders = 0;
  if (physics) {
    for (const it of placed.inner) {
      if (it.trunk > 0.05 && Math.abs(it.x) < P && Math.abs(it.z) < P) {
        it.collider = physics.addCircle(it.x, it.z, Math.max(0.2, it.trunk), { tag: 'tree' });
        colliders++;
      }
    }
  }
  const tColl = performance.now();

  const trees = new VegLayer(G, treeKinds, { name: 'main', chunkSize: 64, quality: q });
  trees.addInstances(placed.inner);
  trees.finalize();
  trees.onClear = (id) => physics?.remove(id);
  const ground = new VegLayer(G, groundKinds, { name: 'ground', chunkSize: GROUND_CELL, quality: q, hasImpostor: () => false });
  // streamed cells come and go, so the ground buffers are sized for a worst case instead of a count
  ground.finalize(groundKinds.map(() => 9000));

  // impostor layer: one draw call for every far tree
  const treeCfg = trees.cfg[treeKinds.findIndex((k) => k.impostor)];
  const impIn = treeCfg.lods[treeCfg.lods.length - 1].hi;
  const impU = lodUniform();
  setLod(impU, impIn[0], impIn[1], null, null);
  placed.far = [];
  let impCount = 0;
  trees.forEachAlive((k) => { if (k.impostor) impCount++; });
  const imp = new ImpostorLayer(atlas, impU, [impIn[0] - 6, 6000], impCount + 80000);
  let impDirty = true;
  const rebuildImpostors = () => {
    imp.begin();
    for (const f of placed.far) if (!f.dead) imp.push(treeKinds[f.k], f.x, f.y, f.z, f.sx, f.sy, f.r, f.g, f.b, f.view);
    trees.forEachAlive((k, x, y, z, sx, sy, r, g, b, view) => {
      if (k.impostor) imp.push(k, x, y, z, sx, sy, r, g, b, view);
    });
    imp.end();
    impDirty = false;
  };
  rebuildImpostors();

  G.scene.add(trees.group, ground.group, imp.mesh);
  // far shadow cascade casters (cones standing in for the forests that have no real mesh at range)
  const proxies = q === 'low' ? null : new ShadowProxyLayer(G, trees);
  if (proxies) G.scene.add(proxies.mesh);
  let proxyForce = true;

  // ---- ground cover streaming -------------------------------------------------------------
  const gen = new GroundGenerator(G, groundKinds, { low: 0.6, medium: 0.85, high: 1 }[q] ?? 1);
  const cells = new Map();
  const cellRadius = Math.ceil((ground.cfg[0].maxD + 8) / GROUND_CELL);
  let firstUpdate = true;
  const streamGround = (cam, budget) => {
    const ccx = Math.floor(cam.x / GROUND_CELL), ccz = Math.floor(cam.z / GROUND_CELL);
    const want = [];
    for (let dz = -cellRadius; dz <= cellRadius; dz++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        if (dx * dx + dz * dz > cellRadius * cellRadius) continue;
        const key = `${ccx + dx},${ccz + dz}`;
        if (!cells.has(key)) want.push({ key, cx: ccx + dx, cz: ccz + dz, d: dx * dx + dz * dz });
      }
    }
    want.sort((a, b) => a.d - b.d);
    let made = 0;
    for (const w of want) {
      if (made >= budget) break;
      const list = gen.generate(w.cx, w.cz, GROUND_CELL);
      cells.set(w.key, list.length);
      if (list.length) ground.addInstances(list);
      made++;
    }
    // evict far cells
    if (cells.size > (cellRadius * 2 + 1) ** 2 * 0.9) {
      for (const key of [...cells.keys()]) {
        const [cx, cz] = key.split(',').map(Number);
        if ((cx - ccx) ** 2 + (cz - ccz) ** 2 > (cellRadius + 2) ** 2) { cells.delete(key); ground.removeChunk(key); }
      }
    }
  };
  // ---- API ----------------------------------------------------------------------------------
  const cleared = [];
  const clearArea = (x, z, r) => {
    let n = trees.clearArea(x, z, r);
    ground.clearArea(x, z, r);
    gen.cleared.push({ x, z, r });
    cleared.push({ x, z, r });
    for (const f of placed.far) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r + 2) { f.dead = true; n++; }
    impDirty = true;
    trees.dirty = true;
    proxyForce = true;
    return n;
  };
  const clearShape = (e) => {
    const fade = 1.5;
    if (e.type !== 'box') {
      return clearArea(e.x, e.z, (e.r ?? 0) + (e.kinds ? 0 : 0.5));
    }
    const ext = Math.hypot(e.hw, e.hd) + 12;
    const pred = (kind, px, pz, sx) => exclusionDistance(e, px, pz) < (kind.group === 'tree' ? Math.max(kind.trunkR, kind.radius * sx * 0.25) : 0.5) + fade * 0;
    let n = trees.clearIf(e.x - ext, e.z - ext, e.x + ext, e.z + ext, pred);
    ground.clearIf(e.x - ext, e.z - ext, e.x + ext, e.z + ext, pred);
    gen.cleared.push({ x: e.x, z: e.z, r: Math.hypot(e.hw, e.hd) });
    for (const f of placed.far) if (!f.dead && exclusionDistance(e, f.x, f.z) < 2) { f.dead = true; n++; }
    impDirty = true;
    proxyForce = true;
    return n;
  };
  let appliedExclusions = EXCLUSIONS.length;
  // exclusions present at init were already honoured by the placer; only later ones need clearing

  const api = {
    clearArea,
    treeAt: (x, z, r = 0) => trees.treeAt(x, z, r),
    layers: { trees, ground, impostors: imp },
    kinds: all,
    placement: placed.stats,
    // Vegetation only: draw calls and triangles submitted by the last layer update (shadow pass excluded)
    drawStats() {
      let calls = 0, tris = 0;
      const perSpecies = {};
      for (const layer of [trees, ground]) {
        for (const [ki, e] of (layer.meshes || []).entries()) {
          if (!e) continue;
          for (const l of e.lods) {
            for (const m of l.parts) {
              if (!m.visible || m.count === 0) continue;
              calls++;
              const t = m.count * (m.geometry.index.count / 3);
              tris += t;
              const sp = layer.kinds[ki].species;
              perSpecies[sp] = (perSpecies[sp] || 0) + t;
            }
          }
        }
      }
      if (imp.mesh.visible) { calls++; tris += imp.mesh.count * 2; perSpecies.impostors = imp.mesh.count * 2; }
      return { calls, tris: Math.round(tris), perSpecies, impostors: imp.mesh.count };
    },
    report() {
      const info = G.renderer.info.render;
      const counts = {};
      for (const k of treeKinds) counts[k.species] = (counts[k.species] || 0) + trees.kindCount[treeKinds.indexOf(k)];
      return {
        placed: { inner: placed.inner.length, far: placed.far.length, colliders },
        species: counts,
        visibleInstances: trees.stats.visible,
        groundCells: cells.size,
        calls: info.calls, triangles: info.triangles,
        ms: { kinds: tKinds - t0, bake: tBake - tKinds, place: tPlace - tBake, colliders: tColl - tPlace },
      };
    },
  };
  G.vegetation = api;

  // ---- per-frame system -------------------------------------------------------------------
  let shadowTweaked = false;
  G.addSystem('vegetation', (dt, t) => {
    const cam = G.camera.position;
    if (!shadowTweaked && G.atmosphere?.sun?.shadow) {
      // thin double sided foliage self-shadows badly without a normal bias
      const sh = G.atmosphere.sun.shadow;
      if (sh.normalBias === 0 && sh.bias === 0) { sh.normalBias = 0.05; sh.bias = -0.0004; }
      shadowTweaked = true;
    }
    if (EXCLUSIONS.length > appliedExclusions) {
      for (let i = appliedExclusions; i < EXCLUSIONS.length; i++) clearShape(EXCLUSIONS[i]);
      appliedExclusions = EXCLUSIONS.length;
    }
    streamGround(cam, firstUpdate || G.shot ? 400 : 3);
    trees.update(G.camera, t, firstUpdate);
    ground.update(G.camera, t, firstUpdate);
    if (impDirty) rebuildImpostors();
    if (proxies) { proxies.update(G.camera, proxyForce); proxyForce = false; }
    trees.syncLeaves();
    firstUpdate = false;
  }, ORDER.atmosphere + 5);

  // The far ring needs the terrain builder's far height grid, which keeps computing in the
  // background; place it when that lands (shots wait for it so they never miss the far forest).
  const farJob = placeFarRing(G, treeKinds).then((far) => {
    placed.far = far;
    for (const c of cleared) for (const f of far) if (!f.dead && Math.hypot(f.x - c.x, f.z - c.z) < c.r + 2) f.dead = true;
    impDirty = true;
    api.placement.far = far.length;
  }).catch((e) => { console.warn('[vegetation] far ring failed', e); });
  if (G.shot && G.readyGates) G.readyGates.push(farJob);
  api.farReady = farJob;
  G.events.emit('vegetation:ready', { ms: performance.now() - t0 });
}
