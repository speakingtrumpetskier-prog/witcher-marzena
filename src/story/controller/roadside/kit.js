// Roadside kit: what the roadside encounters share (src/story/controller/roadside/*.js).
//
//   const K = createKit(C)         one per game; C.roadside = K
//   K.road(id, s, off)             a point on a road: { x, y, z, tx, tz, nx, nz, yaw } (arc length s, signed offset from the line)
//   K.roadPath(id, s0, s1, step)   [{ x, z }] along a road between two arc lengths (either order)
//   K.openSpot(x, z, opts)         the nearest spot to (x, z) with no tree, rock or steep ground, searched in rings
//   K.zone({ id, x, z, r, enabled, build, leave }) -> handle   builds into a Bag when she comes within r while
//                                  enabled() holds, frees it a few seconds after she leaves; handle.bag, handle.rebuild()
//   K.bag()                        a Bag: everything an encounter puts in the world, taken out again by bag.free()
//   K.quietly(fn)                  run fn with quest toasts and stingers off (small encounters write to the journal quietly)
//   K.bark(char, id, name, text)   a floating line over a character (and a voice clip if there is one)
//   K.persist(flagFn, build)       a prop group that exists while flagFn() holds (placed again after a load, removed on a reset)
//   K.hold(text, secs, window, onProgress)   the hold ring; resolves true when E was held long enough
//
// A Bag costs nothing while it is empty. While no encounter is live the only per-frame work is the zone check
// in G.story (a distance test per zone). Encounters register extra systems into their bag, so they stop with it.
import * as THREE from 'three';
import { ROADS } from '../../../world/layout.js';
import { alongPath, pathLength, spotOk } from '../../../world/locations/wilderness/compose.js';
import { createCharacter } from '../../../characters/index.js';
import { getLightPool } from '../../../world/locations/lights.js';

const ROAD = Object.fromEntries(ROADS.map((r) => [r.id, r]));

// Free what an Object3D tree owns. Kit and prop materials are shared and cached, so only geometry goes by default;
// `own` also disposes materials and their maps (decals, canvas notes).
export function disposeTree(obj, own = false) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (own && o.material) {
      for (const m of [].concat(o.material)) { m.map?.dispose?.(); m.dispose?.(); }
    }
  });
}

export class Bag {
  constructor(K) {
    this.K = K;
    this.G = K.G;
    this.live = true;
    this.busy = false; // an encounter sets this while a sequence is running so the zone cannot take it down
    this.things = [];
    this.chars = [];
    this.undo = [];
  }

  // An Object3D in the scene. own: also dispose materials.
  mesh(obj, { own = false, parent = null } = {}) {
    (parent || this.G.scene).add(obj);
    this.things.push({ obj, own });
    return obj;
  }

  // Something a helper already added to the scene (a decal): remembered so free() takes it out.
  track(obj, own = true) {
    this.things.push({ obj, own });
    return obj;
  }

  // A character from a preset id or a spec object. Created low detail by default (these are bystanders on a road).
  char(spec, o = {}) {
    const c = createCharacter(spec, { lowDetail: o.lowDetail ?? true });
    this.G.scene.add(c.root);
    c.setPosition(o.x, o.z, o.y);
    c.yaw = o.yaw ?? 0;
    if (o.cold) c.cold = true;
    if (o.anim) c.play(o.anim, { loop: o.loop ?? true, fade: 0 });
    this.chars.push(c);
    return c;
  }

  // Interact prompt (E) through the controller's wrapper; removed with the bag.
  talk(def) {
    const id = this.K.C.interact(def);
    if (id) this.undo.push(() => this.G.interact?.remove(id));
    return id;
  }

  // The Talk prompt on a character this bag owns (or any character whose root moves).
  talkTo(c, def) {
    const v = new THREE.Vector3();
    return this.talk({ radius: 2.6, verb: 'Talk', pos: () => v.set(c.root.position.x, c.root.position.y + 1.1, c.root.position.z), ...def });
  }

  clue(def) {
    const id = this.K.C.clue(def);
    if (id) this.undo.push(() => this.G.senses?.removeClue?.(id));
    return id;
  }

  trail(def) {
    const id = this.K.C.trail(def);
    if (id) this.undo.push(() => this.G.senses?.removeTrail?.(id));
    return id;
  }

  box(x, z, hw, hd, yaw, o = {}) {
    const id = this.G.physics?.addBox(x, z, hw, hd, yaw, { y0: o.y0, y1: o.y1, tag: o.tag || 'roadside' });
    if (id != null) this.undo.push(() => this.G.physics?.remove(id));
    return id;
  }

  circle(x, z, r, o = {}) {
    const id = this.G.physics?.addCircle(x, z, r, { y0: o.y0, y1: o.y1, tag: o.tag || 'roadside' });
    if (id != null) this.undo.push(() => this.G.physics?.remove(id));
    return id;
  }

  // A pooled point light (the pool keeps the few nearest the camera lit). Returns the handle; h.desc.x/y/z can move.
  light(desc) {
    const pool = getLightPool(this.G);
    const h = pool.add(desc);
    this.undo.push(() => h.remove());
    return h;
  }

  animal(a) {
    if (a) this.undo.push(() => this.G.npcs?.animals?.remove?.(a));
    return a;
  }

  // A per-frame system that stops with the bag.
  system(name, fn, order = 20) {
    const off = this.G.addSystem(`rs:${name}`, (dt, t) => { if (this.live) fn(dt, t); }, order);
    this.undo.push(off);
    return off;
  }

  onFree(fn) { this.undo.push(fn); }

  // Take characters and objects over from another bag (a tinker who leaves the site with his sledge outlives the
  // zone that built him).
  adopt(from, { chars = [], objs = [] } = {}) {
    for (const c of chars) {
      const i = from.chars.indexOf(c);
      if (i >= 0) { from.chars.splice(i, 1); this.chars.push(c); }
    }
    for (const o of objs) {
      const i = from.things.findIndex((t) => t.obj === o);
      if (i >= 0) this.things.push(...from.things.splice(i, 1));
    }
  }

  free() {
    if (!this.live) return;
    this.live = false;
    for (let i = this.undo.length - 1; i >= 0; i--) {
      try { this.undo[i](); } catch (e) { console.warn('[roadside] undo', e.message); }
    }
    for (const c of this.chars) { try { c.dispose(); } catch (e) { console.warn('[roadside] char', e.message); } }
    for (const { obj, own } of this.things) {
      obj.parent?.remove(obj);
      try { disposeTree(obj, own); } catch (e) { console.warn('[roadside] dispose', e.message); }
    }
    this.things.length = 0;
    this.chars.length = 0;
    this.undo.length = 0;
  }
}

export function createKit(C) {
  const { G } = C;
  const K = { C, G, zones: [], persists: [] };

  // ---- roads --------------------------------------------------------------------------------
  K.road = (id, s, off = 0) => {
    const r = ROAD[id];
    const a = alongPath(r.pts, Math.max(0, Math.min(pathLength(r.pts), s)));
    const x = a.x + a.nx * off, z = a.z + a.nz * off;
    return { x, z, y: C.ground(x, z), tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz, yaw: Math.atan2(a.tx, a.tz), s };
  };
  K.roadPath = (id, s0, s1, step = 6, off = 0) => {
    const out = [];
    const dir = s1 >= s0 ? 1 : -1;
    for (let s = s0; dir > 0 ? s <= s1 : s >= s1; s += dir * step) { const p = K.road(id, s, off); out.push({ x: p.x, z: p.z }); }
    const e = K.road(id, s1, off);
    out.push({ x: e.x, z: e.z });
    return out;
  };

  // The nearest open ground to (x, z): ringed search outward, so a site picked on a map still lands between the
  // trees. `rad` is the clear radius; vegetation may be absent (the logic run has none).
  K.openSpot = (x, z, { rad = 3, maxR = 24, maxSlope = 0.45, ice = false, avoid = [] } = {}) => {
    const ok = (px, pz) => {
      if (!spotOk(G, px, pz, { rad, maxSlope, ice })) return false;
      if (G.vegetation?.treeAt?.(px, pz, rad)) return false;
      for (const a of avoid) if (Math.hypot(px - a.x, pz - a.z) < a.r) return false;
      return true;
    };
    if (ok(x, z)) return { x, z };
    for (let r = 2; r <= maxR; r += 2) {
      const n = Math.max(8, Math.round(r * 1.4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.37;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };

  K.bag = () => new Bag(K);

  // Local (lx right, lz forward) to world for a thing standing at (x, z) turned by yaw.
  K.at = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  // Stand an object on the ground at (x, z), turned by yaw, pitched and rolled to the slope under its len x wid footprint.
  K.settle = (obj, x, z, yaw, len = 2, wid = 1, lift = 0) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const h = (a, b) => C.ground(x + fx * a + rx * b, z + fz * a + rz * b);
    const f = h(len / 2, 0), bk = h(-len / 2, 0), l = h(0, -wid / 2), r = h(0, wid / 2);
    obj.position.set(x, (f + bk + l + r) / 4 + lift, z);
    obj.rotation.set(-Math.atan2(f - bk, len), yaw, Math.atan2(r - l, wid), 'YXZ');
    return obj;
  };

  // ---- journal ------------------------------------------------------------------------------
  // Small encounters write to the journal without the quest fanfare; the toast says the journal changed.
  K.quietly = (fn) => {
    const Q = G.quests;
    if (!Q) return fn();
    const was = Q.quiet;
    Q.quiet = true;
    try { return fn(); } finally { Q.quiet = was; }
  };
  K.begin = (id, { quiet = true } = {}) => {
    const Q = G.quests;
    if (!Q || Q.rec(id)) return false;
    const go = () => Q.start(id);
    const r = quiet ? K.quietly(go) : go();
    if (quiet) C.notify('Journal updated', 'journal');
    return r;
  };
  // Finish a one-shot: set its flag (the quest definition completes on it), quietly or with the fanfare.
  K.finish = (flag, value = true, { quiet = true } = {}) => {
    const set = () => C.set(flag, value);
    if (quiet) K.quietly(set); else set();
    if (quiet) C.notify('Journal updated', 'journal');
  };

  // ---- people -------------------------------------------------------------------------------
  K.bark = (c, id, name, text) => {
    if (!c || !text) return;
    G.ui?.bark?.(name, text, c);
    try { G.voice?.bark?.({ id, preset: id, character: c }, text); } catch { /* voices are optional */ }
  };
  K.face = (a, b) => {
    const pa = a.root.position, pb = b.isObject3D ? b.position : b.root ? b.root.position : b;
    a.yaw = Math.atan2(pb.x - pa.x, pb.z - pa.z);
  };
  K.facePlayer = (c) => {
    const p = C.ppos();
    c.yaw = Math.atan2(p.x - c.root.position.x, p.z - c.root.position.z);
  };

  // ---- the hold ring ------------------------------------------------------------------------
  // G.ui.hold draws the ring; onProgress(0..1) is called each frame while it runs (the sledge rises with it).
  K.hold = (text, secs, window, onProgress) => {
    if (!G.ui?.hold) return C.sleep(1.2).then(() => true);
    const choices = G.uiImpl?.choicesUI;
    let stop = false;
    const off = onProgress ? G.addSystem('rs:hold', () => {
      if (stop) return;
      const h = choices?.hcur;
      if (h && !h.done) onProgress(Math.min(1, h.p / h.need));
    }, 99) : null;
    return Promise.resolve(G.ui.hold(text, secs, window)).finally(() => { stop = true; off?.(); });
  };

  // ---- zones --------------------------------------------------------------------------------
  // The one place the roadside cares about distance. `enabled` is checked every frame by G.story (cheap: keep it
  // to flags, the hour and the weather). While the bag is busy the zone stays on even if the hour runs out.
  K.zone = ({ id, x, z, r, enabled = () => true, build, leave, grace = 4 }) => {
    const h = { id, x, z, r, bag: null, zoneId: null, built: 0 };
    const inside = () => !!G.story?.flow?.zones?.get?.(h.zoneId)?.inside;
    const drop = () => {
      const b = h.bag;
      if (!b) return;
      h.bag = null;
      try { leave?.(b, h); } catch (e) { console.warn('[roadside] leave', e.message); }
      b.free();
    };
    const make = () => {
      if (h.bag?.live) return;
      const b = K.bag();
      h.bag = b;
      h.built++;
      try { build(b, h); } catch (e) {
        console.error(`[roadside] ${id}`, e);
        G.errors.push(`roadside ${id}: ${e.message}`);
        h.bag = null;
        b.free();
      }
    };
    h.zoneId = C.zone({
      id: `rs_${id}`, x, z, r,
      enabled: () => !!(h.bag?.busy || enabled()),
      onEnter: () => make(),
      onLeave: () => {
        const b = h.bag;
        if (!b) return;
        C.later(grace, () => { if (h.bag === b && !b.busy && !inside()) drop(); });
      },
    });
    h.drop = drop;
    h.rebuild = () => { drop(); if (inside()) make(); };
    K.zones.push(h);
    return h;
  };

  // A group that stays in the world while a flag holds. Built when the flag is first seen true (after a load, or the
  // moment it is set) and taken out again when it is cleared (a new game).
  K.persist = (flagFn, build) => {
    const rec = { obj: null, own: false };
    const sync = () => {
      const want = !!flagFn();
      if (want && !rec.obj) {
        try {
          const r = build();
          rec.obj = r?.obj ?? r;
          rec.own = !!r?.own;
          if (rec.obj && !rec.obj.parent) G.scene.add(rec.obj);
        } catch (e) { console.warn('[roadside] persist', e.message); }
      } else if (!want && rec.obj) {
        rec.obj.parent?.remove(rec.obj);
        disposeTree(rec.obj, rec.own);
        rec.obj = null;
      }
    };
    K.persists.push(sync);
    C.restore(sync);
    return sync;
  };

  // ---- load and reset -----------------------------------------------------------------------
  // A loaded save or a new game changes the flags under every live encounter: take them down, and let the zones
  // that she is standing in build again from the new state.
  const refresh = () => {
    for (const z of K.zones) {
      z.drop();
      const zone = G.story?.flow?.zones?.get?.(z.zoneId);
      if (zone) zone.inside = false;
    }
    for (const s of K.persists) s();
  };
  C.on('loaded', refresh);
  C.on('reset', refresh);

  K.THREE = THREE;
  return K;
}
