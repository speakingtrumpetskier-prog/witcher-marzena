// The village of Marzena: composes the hero buildings, houses, outbuildings, palisade, shore, dressing,
// NPC stations, fires, smoke and light, then exposes the story anchors.
//
//   build(G, ctx)  called by locations/index.js (ctx: { props, PropBatch, fx })
//
// Public results (see docs/VILLAGE.md and the report):
//   G.world.locations.village   story anchors (world-space Vector3 plus objects), audit(), V registry
//   G.world.stations            NPC stations (id -> { x, z, yaw, anim, kind, indoor })
//   G.world.fires               warm spots { x, z, r }
//   G.world.indoors(x, z)       true inside enterable interiors (interiors.js)
//   G.world.walk                { floors, ramps } of every building plus the boardwalk (walk surfaces for gameplay)
//   G.world.lights              shared point-light pool (lights.js)
// Files: village/plan.js (data), buildings.js, linear.js (palisade, gates, fences), shore.js, dress.js (props),
// life.js (stations, fires, fx, audio), anchors.js; lights.js, interiors.js and tracker.js sit one level up.
import * as THREE from 'three';
import { placeBuilding } from '../architecture/index.js';
import { getLightPool } from './lights.js';
import { installSmoke } from './smoke.js';
import { installInteriors } from './interiors.js';
import { initTracker } from './tracker.js';
import { inRect, rot, rectOverlap, roadGap, tick, makeLog } from './village/util.js';

async function load(G, name, fn) {
  try {
    const mod = await fn();
    return mod;
  } catch (e) {
    console.error(`[village] ${name}`, e);
    G.errors.push(`village ${name}: ${e.message}`);
    return null;
  }
}

function makeV(G, ctx) {
  const lights = getLightPool(G);
  const V = {
    G, ctx, THREE, lights,
    log: makeLog(G),
    placed: [], byId: {},
    doors: [], rooms: [], lightHandles: [],
    walk: { floors: [], ramps: [] },
    fires: [], emitters: [], anchors: {}, fireProps: [], barriers: [], paths: [], pieces: [],
    props: ctx.props, PropBatch: ctx.PropBatch, fx: ctx.fx,
    clear(x, z, r) { try { G.vegetation?.clearArea?.(x, z, r); } catch (e) { void e; } },
    h: (x, z) => G.world.heightAt(x, z),
  };

  // Place a kit building and register everything the rest of the village needs from it.
  V.put = (id, kind, b, x, z, yaw, opts = {}, meta = {}) => {
    const bb = new THREE.Box3().setFromObject(b.group);
    const p = placeBuilding(G, b, x, z, yaw, opts);
    const lcx = (bb.min.x + bb.max.x) / 2, lcz = (bb.min.z + bb.max.z) / 2;
    const [ox, oz] = rot(lcx, lcz, yaw);
    const rec = {
      id, kind, x, z, yaw, p, b, meta,
      rect: { x: x + ox, z: z + oz, hw: (bb.max.x - bb.min.x) / 2, hd: (bb.max.z - bb.min.z) / 2, yaw },
      fp: b.footprint || { hw: 1, hd: 1 },
    };
    V.placed.push(rec);
    V.byId[id] = rec;
    // Lights: windows, lanterns and hearths become pool descriptors (indoor ones stay on while you are inside).
    const fp = rec.fp;
    for (const l of p.lights) {
      const indoor = !!meta.room && inRect(l.x, l.z, x, z, fp.hw - 0.1, fp.hd - 0.1, yaw);
      V.lightHandles.push(V.lights.add({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity, radius: l.radius, kind: l.kind, indoor, room: meta.room ? id : null }));
    }
    if (meta.room) {
      V.rooms.push({ id, env: meta.room, x, z, yaw, hw: fp.hw, hd: fp.hd, rec });
      G.world.registerInterior({ id, box: { x, z, hw: fp.hw, hd: fp.hd, yaw }, env: 'room', y0: p.y - 3.5, y1: p.y + 4.5 });
    }
    for (const f of p.walk.floors) V.walk.floors.push({ ...f, building: id });
    for (const r of p.walk.ramps) V.walk.ramps.push({ ...r, building: id });
    for (const d of p.doors) {
      if (d.pivot) d.pivot.userData.keepSeparate = true;
      if (d.setOpen) {
        V.doors.push({ id: `${id}:${d.id || V.doors.length}`, rec: d, building: id });
        G.world.registerDoor(d, { rest: d.open || 0, near: meta.gate ? 5.5 : 1.6, speed: meta.gate ? 1.2 : 2.4 });
      }
    }
    const r = Math.max(rec.rect.hw, rec.rect.hd) + 5;
    V.clear(rec.rect.x, rec.rect.z, r);
    return rec;
  };

  // Overlaps between footprints and distance to roads; run from the console: __G.world.locations.village.audit()
  V.audit = () => {
    const out = [];
    const list = V.placed.filter((r) => !r.meta.prop);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const gap = roadGap(a.rect.x, a.rect.z) - Math.min(a.rect.hw, a.rect.hd);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].map(([sx, sz]) => {
        const [dx, dz] = rot(sx * a.rect.hw, sz * a.rect.hd, a.rect.yaw);
        return roadGap(a.rect.x + dx, a.rect.z + dz);
      });
      const worst = Math.min(...corners);
      if (worst < 0.3) out.push(`${a.id} touches a road (${worst.toFixed(1)} m)`);
      void gap;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (Math.hypot(a.rect.x - b.rect.x, a.rect.z - b.rect.z) > 25) continue;
        const pen = rectOverlap(a.rect, b.rect);
        if (pen > 0.3) out.push(`${a.id} overlaps ${b.id} (${pen.toFixed(1)} m)`);
      }
    }
    return out;
  };
  return V;
}

export async function build(G, ctx) {
  const t0 = performance.now();
  G.world.stations ||= {};
  G.world.fires ||= [];
  G.world.locations ||= {};
  // Shared services first, so other locations (the wilderness) can use them whatever happens below.
  getLightPool(G);
  G.world.addLight = (d) => getLightPool(G).add(d);
  installSmoke(G, ctx?.fx);
  installInteriors(G);
  initTracker(G);
  if (!ctx?.props) throw new Error('props kit unavailable');
  const V = makeV(G, ctx);
  G.world.locations.village = { V, audit: V.audit };

  const steps = [
    ['buildings', () => import('./village/buildings.js'), (m) => m.buildStructures(V)],
    ['linear', () => import('./village/linear.js'), (m) => m.buildLinear(V)],
    ['shore', () => import('./village/shore.js'), (m) => m.buildShore(V)],
    ['dress', () => import('./village/dress.js'), (m) => m.buildDressing(V)],
    ['life', () => import('./village/life.js'), (m) => m.buildLife(V)],
    ['anchors', () => import('./village/anchors.js'), (m) => m.buildAnchors(V)],
  ];
  for (const [name, imp, run] of steps) {
    const mod = await load(G, name, imp);
    if (!mod) continue;
    try {
      await run(mod);
    } catch (e) {
      console.error(`[village] ${name}`, e);
      G.errors.push(`village ${name}: ${e.message}`);
    }
    await tick();
  }

  // Merge the static meshes into a few draw calls (skip with ?nobake for debugging).
  if (!G.params.has('nobake')) {
    try {
      const { bakeVillage } = await import('./village/bake.js');
      V.log('bake', JSON.stringify(bakeVillage(V)));
    } catch (e) {
      console.error('[village] bake', e);
      G.errors.push(`village bake: ${e.message}`);
    }
  }

  // Walk surfaces for gameplay: every building plus the boardwalk.
  G.world.walk = V.walk;
  V.log(`built in ${(performance.now() - t0).toFixed(0)} ms, ${V.placed.length} structures, ${V.lights.stats().descriptors} lights`);
  console.log(`[village] built in ${(performance.now() - t0).toFixed(0)} ms, ${V.placed.length} structures`);
}
