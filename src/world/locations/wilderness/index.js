// Wilderness locations entry (owner: wilderness builder). Called by locations/index.js after the village:
// `build(G, ctx)`. Builds every set piece outside the village, each through an isolated import so one
// broken location never blocks the others, and publishes story anchors on G.world.locations.<id>.
//
// Locations (id = LOC key unless noted): iceCamp, ritual, bellTower (+ the three drowned men), island,
// marsh, hotSpring, bearDen, hunterCabin, charcoal, crossroads, watchtower, passStart, idol, mill,
// waterfall (ice cave and wolf den), plus `vignettes` (the small stories along the roads).
//
// URL `wild=a,b` builds only those ids (testing); `wild=none` builds none.
//
// Shared context W passed to every location module:
//   W.G, W.ctx, W.props, W.fx      game context, locations ctx, props kit, particle fx
//   W.loc(id, data)                merge anchors into G.world.locations[id]
//   W.light(spec)                  G.world.addLight?.({ x, y, z, color, intensity, radius, kind })
//   W.fire(x, z, r)                register a warm spot in G.world.fires
//   W.station(id, st)              register an NPC station in G.world.stations
//   W.interior(spec)               G.world.registerInterior?.({ id, box | polygon, env })
//   W.clear(x, z, r)               G.vegetation.clearArea
//   W.smoke(pos, opts)             G.world.addSmoke?.(pos, opts) or a props.fx smoke column
//   W.tick(fn)                     per-frame update (late order); returns remove()
//   W.lod(obj, near)               hide obj beyond `near` meters from the camera (done for everything a module adds)
import * as THREE from 'three';
import { ORDER } from '../../../core/G.js';

// import.meta.glob only includes files that exist, so an unfinished module is skipped cleanly.
const FILES = import.meta.glob(['./pass.js', './crossroads.js', './watchtower.js', './bellTower.js', './lake.js', './island.js', './marsh.js', './hotSpring.js', './bearDen.js', './cabin.js', './charcoal.js', './idolHill.js', './mill.js', './vignettes.js']);
const MODULES = [
  ['passStart', './pass.js'],
  ['crossroads', './crossroads.js'],
  ['watchtower', './watchtower.js'],
  ['bellTower', './bellTower.js'],
  ['lake', './lake.js'],
  ['island', './island.js'],
  ['marsh', './marsh.js'],
  ['hotSpring', './hotSpring.js'],
  ['bearDen', './bearDen.js'],
  ['hunterCabin', './cabin.js'],
  ['charcoal', './charcoal.js'],
  ['idol', './idolHill.js'],
  ['mill', './mill.js'],
  ['vignettes', './vignettes.js'],
];

const LANDMARK = /bellTower|watchtower|idol|mill|island|ritual|stoneCircle|crossroads|sign|drownedMen|bellCracks|wispHalo/;

function makeContext(G, ctx) {
  const W = {
    G, ctx, props: ctx.props, fx: ctx.fx, THREE,
    loc(id, data) {
      G.world.locations ||= {};
      const cur = (G.world.locations[id] ||= {});
      Object.assign(cur, data);
      return cur;
    },
    light(spec) { G.world.addLight?.(spec); },
    fire(x, z, r = 6) { (G.world.fires ||= []).push({ x, z, r }); },
    station(id, st) { (G.world.stations ||= {})[id] = st; },
    interior(spec) { G.world.registerInterior?.(spec); },
    clear(x, z, r) { G.vegetation?.clearArea?.(x, z, r); },
    smoke(pos, opts = {}) {
      if (G.world.addSmoke) G.world.addSmoke(pos, opts);
      else ctx.fx?.smoke({ position: Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z], parent: G.scene, ...opts });
    },
    tick(fn, order = ORDER.late) {
      const name = `wild:${Math.random().toString(36).slice(2, 7)}`;
      return G.addSystem(name, fn, order);
    },
    // Fade an fx emitter in with the night (uNight 0..1) and switch it off by day.
    nightOnly(em, { from = 0.12, to = 0.55 } = {}) {
      const U = G.uniforms;
      return W.tick(() => {
        const n = U.uNight ? U.uNight.value : 0;
        const k = Math.min(1, Math.max(0, (n - from) / (to - from)));
        em.setIntensity(k * k * (3 - 2 * k));
        em.setActive(k > 0.01);
      });
    },
    // Distance culling for everything a location adds to the scene: far objects are hidden (and so skipped by
    // both the main pass and the shadow maps). Landmarks stay visible much farther than small clutter.
    lods: [],
    lod(obj, near) {
      obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      W.lods.push({ obj, box, near, on: true });
    },
    pause: () => new Promise((r) => setTimeout(r, 0)),
    v3: (x, y, z) => new THREE.Vector3(x, y, z),
    stats: { built: [], failed: [] },
  };
  return W;
}

export async function build(G, ctx, opts = {}) {
  G.world.locations ||= {};
  G.world.fires ||= [];
  G.world.stations ||= {};
  const W = makeContext(G, ctx);
  const only = opts.only || (G.params.get('wild') || '').split(',').filter(Boolean);
  if (only.includes('none')) return W;
  for (const [id, path] of MODULES) {
    const load = FILES[path];
    if (!load) continue;
    if (only.length && !only.includes(id) && !(id === 'lake' && (only.includes('iceCamp') || only.includes('ritual'))) && !(id === 'mill' && only.includes('waterfall'))) continue;
    const t0 = performance.now();
    try {
      const mod = await load();
      const before = new Set(G.scene.children);
      await mod.build(W);
      for (const o of G.scene.children) if (!before.has(o)) W.lod(o, LANDMARK.test(o.name || '') ? 700 : 230);
      W.stats.built.push(`${id} ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.error(`[wilderness ${id}]`, e);
      G.errors.push(`wilderness ${id}: ${e.message}`);
      W.stats.failed.push(id);
    }
    await W.pause();
  }
  G.world.locations.__wilderness = W.stats;
  // refresh the distance culling a few times a second (camera position, with hysteresis)
  let acc = 0;
  const cam = new THREE.Vector3();
  W.tick((dt) => {
    acc += dt;
    if (acc < 0.2 && acc !== dt) return;
    acc = 0;
    cam.copy(G.camera.position);
    for (const l of W.lods) {
      const d = l.box.distanceToPoint(cam);
      const on = d < l.near + (l.on ? 14 : 0);
      if (on !== l.on) { l.on = on; l.obj.visible = on; }
    }
  });
  return W;
}
