// NPCs and animals (G.npcs). Owner: NPC builder. See docs/ARCHITECTURE.md "NPCs".
//
//   G.npcs.spawn(def)        def: { id, preset, name, schedule: [{ from, to, at, hidden? }], barks, talk, anchor, hardy, home }
//                            -> npc. `at` is a station id (or an inline station). Characters are created lazily.
//   G.npcs.get(id)           -> npc | null: { id, character, def, station, state, pause(bool), goTo(stationOrXZ) -> Promise<bool>,
//                            release(), bark(text), setTalk(talk), face(target) }
//   G.npcs.populate(opts)    -> Promise: named cast, ambient villagers (opts.count, default 30), children, fishermen, the
//                            mill family, and animals, from the stations in G.world.stations
//   G.npcs.animals           spawn(kind, x, z, opts), spawnFlock(...), list, remove(a)   (see animals/index.js)
//   G.npcs.list, G.npcs.nav (walk grid), G.npcs.stats(), G.npcs.resync(), G.npcs.setPaused(bool)
// Station fields: see stations.js. Time: schedules follow G.time.hours; weather: snowfall above an
// NPC's `hardy` sends them indoors. The story pauses NPCs through npc.pause(true) (story/director/Actors.js).
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';
import { rng } from '../../core/util.js';
import { Nav } from './nav.js';
import { NPC } from './NPC.js';
import { Convos } from './convo.js';
import { NAMED, MILL, buildAmbient } from './cast.js';
import { allStations } from './stations.js';
import { createAnimals } from './animals/index.js';
import { Snowballs } from './snow.js';
import { LOC } from '../../world/layout.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class Npcs {
  constructor(G) {
    this.G = G;
    this.nav = new Nav(G);
    this.synth = new Map();
    this.stationVersion = 1;
    this.tagCache = new Map();
    this.list = [];
    this.byId = new Map();
    this.convos = new Convos(this);
    this.rand = rng(G.shot ? 1234 : (Date.now() & 0xffff) + 1);
    this.hourSecs = 60;
    this.barkClock = 3;
    this.sfxLast = {};
    this.perchStations = [];
    this.populated = false;
    this.agentPool = [];
    this.lookTarget = new THREE.Vector3();
    this.prevPlayer = new THREE.Vector3();
    this.havePrev = false;
    this.S = {
      dt: 0, t: 0, hour: G.time.hours, dayTime: true, cold: true, sev: 0, busy: false, barkOK: false, createLeft: 1,
      cam: new THREE.Vector3(), player: new THREE.Vector3(), playerYaw: 0, playerSpeed: 0, lookTarget: this.lookTarget, agents: [],
    };
    this.animals = createAnimals(this);
    this.snow = new Snowballs(G);
    this.paused = false;
    this.frame = 0;
    this.updateMs = 0; // smoothed cost of one NPC + animal update (ms), for budget checks
    this.updateMsMax = 0;
  }

  // ---- registry ---------------------------------------------------------------------------
  spawn(def) {
    if (!def || !def.id) throw new Error('npcs.spawn needs an id');
    const old = this.byId.get(def.id);
    if (old) return old;
    if (def.home === undefined && def.schedule) {
      const bed = def.schedule.find((e) => e.hidden);
      def.home = bed ? (typeof bed.at === 'string' ? bed.at : null) : null;
    }
    const npc = new NPC(this, def);
    this.list.push(npc);
    this.byId.set(def.id, npc);
    npc.locate({ hour: this.G.time.hours, sev: 0 });
    return npc;
  }

  get(id) { return this.byId.get(id) || null; }

  despawn(id) {
    const n = this.byId.get(id);
    if (!n) return;
    n.dispose();
    this.byId.delete(id);
    this.list.splice(this.list.indexOf(n), 1);
  }

  // Normalized stations carrying a tag (cached until the stations change).
  byTag(tag) {
    let l = this.tagCache.get(tag);
    if (!l) {
      l = allStations(this.G).filter((s) => s.tag === tag && !s.animal);
      this.tagCache.set(tag, l);
    }
    return l;
  }

  refreshStations() {
    this.stationVersion++;
    this.tagCache.clear();
    this.synth.clear();
  }

  // ---- helpers used by NPC, convos and animals --------------------------------------------
  claimSlot(st, npc) { return this.convos.claimSlot(st, npc); }
  releaseSlot(npc) { this.convos.releaseSlot(npc); }
  joinConvo(npc, S) { this.convos.join(npc, S); }
  leaveConvo(npc) { this.convos.leave(npc); }
  requestResync(npc) { npc.schedT = 0; }
  noteBark() { this.barkClock = 5 + this.rand() * 3; }

  sfx(name, pos, volume = 0.5) {
    const a = this.G.audio;
    if (!a || !a.sfx || !a.ready) return;
    const now = this.G.clock.elapsed;
    if (now - (this.sfxLast[name] || -9) < 0.15) return;
    this.sfxLast[name] = now;
    try { a.sfx(name, { pos: { x: pos.x, y: pos.y + 1, z: pos.z }, volume }); } catch { /* audio is optional */ }
  }

  perchesNear(x, z, r) {
    const out = [];
    for (const p of this.perchStations) if (Math.hypot(p.x - x, p.z - z) < r) out.push(p);
    const veg = this.G.vegetation;
    if (veg && veg.snagsNear) {
      try { for (const s of veg.snagsNear(x, z, r)) out.push({ x: s.x, y: s.top - 0.15, z: s.z }); } catch { /* vegetation not ready */ }
    }
    return out;
  }

  pickPerch(x, z, rmin, rmax, player) {
    const c = this.perchesNear(x, z, rmax).filter((p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      return d >= rmin && Math.hypot(p.x - player.x, p.z - player.z) > 14;
    });
    return c.length ? c[Math.floor(this.rand() * c.length)] : null;
  }

  // ---- population -------------------------------------------------------------------------
  // The named cast exists from the start (lazy characters), so the story can always G.npcs.get('hanka').
  spawnNamed(withMill = true) {
    for (const d of NAMED) this.spawn({ ...d, named: true });
    if (withMill) for (const d of MILL) this.spawn({ ...d, named: true });
  }

  // Idempotent: a second call returns the first promise (opts.force repopulates the missing ones).
  populate(opts = {}) {
    if (this._populating && !opts.force) return this._populating;
    this._populating = this._populate(opts);
    return this._populating;
  }

  async _populate(opts = {}) {
    const G = this.G;
    const t0 = performance.now();
    this.refreshStations();
    const stations = allStations(G);
    this.perchStations = stations.filter((s) => s.perch && (s.animal === 'raven' || s.animal === 'crow' || s.animal === 'bird'))
      .map((s) => ({ x: s.x, y: s.y ?? G.world.heightAt(s.x, s.z) + 3, z: s.z }));
    const had = this.nav.regions.length;
    for (const s of stations) this.nav.ensure(s.x, s.z);
    if (!this.nav.regions.length) this.nav.ensure(LOC.village.x, LOC.village.z);
    if (had) this.nav.rebuild(); // regions built before the buildings existed: re-read the colliders
    if (opts.named !== false) this.spawnNamed(opts.mill !== false);
    if (opts.ambient !== false) {
      // quality scales the crowd: low 50%, medium 75%
      const qk = G.quality === 'low' ? 0.5 : G.quality === 'medium' ? 0.75 : 1;
      for (const d of buildAmbient(G, { count: Math.round((opts.count ?? 30) * qk), seed: opts.seed })) this.spawn(d);
    }
    if (opts.animals !== false) this.populateAnimals(stations, opts);
    this.populated = true;
    await this.materialize(opts.perFrame ?? 3);
    this.populateMs = performance.now() - t0;
    G.events.emit('npcs:populated', { count: this.list.length });
  }

  // Create characters for NPCs near the camera, a few per frame so loading never hitches.
  async materialize(perFrame = 3) {
    const S = this._frameData(0);
    const cam = S.cam;
    const todo = this.list.filter((n) => !n._c && n.d2 !== undefined).map((n) => {
      const p = n.position;
      return { n, d: Math.hypot(p.x - cam.x, p.z - cam.z) };
    }).filter((e) => e.d < 150).sort((a, b) => a.d - b.d);
    let k = 0;
    for (const { n } of todo) {
      n.placeNow(S);
      if (++k % perFrame === 0) await nextFrame();
    }
  }

  populateAnimals(stations, opts) {
    const A = this.animals;
    let any = false;
    for (const s of stations) {
      if (!s.animal) continue;
      any = true;
      const o = { y: s.y ?? undefined, static: s.perch && s.animal !== 'raven' && s.animal !== 'crow', r: s.r, home: { x: s.x, z: s.z } };
      if (s.animal === 'raven' || s.animal === 'crow') {
        if (s.perch) A.spawn(s.animal, s.x, s.z, { ...o, y: s.y ?? this.G.world.heightAt(s.x, s.z) + 3, static: false });
        else A.spawnFlock(s.animal, s.x, s.z, s.count, { ground: true });
      } else if (s.count > 1) A.spawnFlock(s.animal, s.x, s.z, s.count, { ...o, spread: Math.min(4, s.r) });
      else A.spawn(s.animal, s.x, s.z, o);
    }
    if (!any && opts.defaultAnimals !== false) {
      const sq = LOC.square;
      A.spawn('dog', sq.x + 8, sq.z - 6, { r: 16, follow: true });
      A.spawn('dog', LOC.tavern.x + 6, LOC.tavern.z + 8, { r: 12 });
      A.spawn('dog', LOC.smithy.x - 4, LOC.smithy.z + 6, { r: 10 });
      A.spawnFlock('chicken', -48, 152, 6, { r: 6 });
      A.spawnFlock('goat', 36, 158, 3, { r: 4 });
      A.spawn('cat', LOC.tavern.x + 3, LOC.tavern.z + 5, { static: false });
    }
    // ravens and crows on dead trees around the village edge
    if (opts.birds !== false) {
      const c = LOC.village;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.28 + 0.4, r = 105 + this.rand() * 50;
        A.spawn(i % 3 === 0 ? 'crow' : 'raven', c.x + Math.sin(a) * r, c.z + Math.cos(a) * r * 0.8, {});
      }
    }
  }

  // ---- control ----------------------------------------------------------------------------
  resync() {
    const S = this._frameData(0);
    for (const n of this.list) if (n._c && !n.paused && !n.frozen) n.placeNow(S, false);
  }

  setPaused(on) {
    this.paused = !!on;
    for (const n of this.list) n.pause(on);
  }

  stats() {
    let walking = 0, inside = 0, frozen = 0, visible = 0, created = 0, stare = 0;
    for (const n of this.list) {
      if (n._c) created++;
      if (n.state === 'walk') walking++;
      else if (n.state === 'inside') inside++;
      else if (n.state === 'stare') stare++;
      if (n.frozen) frozen++;
      if (n.visible) visible++;
    }
    return { total: this.list.length, created, visible, walking, inside, frozen, stare, animals: this.animals.list.length, updateMs: +this.updateMs.toFixed(2), updateMsMax: +this.updateMsMax.toFixed(1), nav: this.nav.stats };
  }

  // ---- per frame --------------------------------------------------------------------------
  _frameData(dt) {
    const G = this.G, S = this.S;
    S.dt = dt;
    S.t = G.clock.elapsed;
    S.hour = G.time.hours;
    S.dayTime = S.hour >= 6.2 && S.hour < 19;
    S.cold = G.uniforms.uSnowCover.value > 0.15;
    const w = G.weather && G.weather.params;
    S.sev = w ? Math.min(0.96, w.snowfall || 0) : 0;
    S.busy = !!(G.story && G.story.busy);
    S.cam.copy(G.camera.position);
    const P = G.player;
    if (P && P.position) {
      S.player.copy(P.position);
      S.playerYaw = P.yaw ?? (P.character ? P.character.yaw : 0) ?? 0;
    } else {
      S.player.copy(G.camera.position);
      S.playerYaw = 0;
    }
    if (dt > 0) {
      if (this.havePrev) {
        const v = Math.hypot(S.player.x - this.prevPlayer.x, S.player.z - this.prevPlayer.z) / dt;
        S.playerSpeed += (Math.min(v, 12) - S.playerSpeed) * Math.min(1, dt * 6);
      }
      this.prevPlayer.copy(S.player);
      this.havePrev = true;
    }
    const head = P && P.character && P.character.bones && P.character.bones.head;
    if (head) head.getWorldPosition(this.lookTarget);
    else this.lookTarget.set(S.player.x, S.player.y + 1.6, S.player.z);
    return S;
  }

  update(dt) {
    const G = this.G;
    if (!G.camera) return;
    if (dt > 0.1) dt = 0.1;
    const tStart = performance.now();
    const S = this._frameData(dt);
    this.barkClock -= dt;
    S.barkOK = this.barkClock <= 0 && !S.busy;
    S.createLeft = this.frame % 3 === 0 ? 1 : 0; // character builds are the expensive part: spread them out
    this.frame++;
    // neighbors for steering (people near the camera)
    const ag = S.agents;
    let n = 0;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o._c || o.hidden || o.frozen || o.d2 > 3600) continue;
      let a = this.agentPool[n];
      if (!a) { a = { npc: null, x: 0, z: 0, r: 1, w: 1 }; this.agentPool[n] = a; }
      const p = o._c.root.position;
      a.npc = o; a.x = p.x; a.z = p.z;
      a.r = o.state === 'walk' ? 1.5 : 1.15;
      a.w = o.state === 'walk' ? 0.5 : 1;
      ag[n] = a;
      n++;
    }
    ag.length = n;
    for (let i = 0; i < list.length; i++) list[i].update(dt, S);
    this.nav.pump(2.5);
    this.convos.update(dt, S);
    this.animals.update(dt, S);
    this.snow.update(dt);
    const ms = performance.now() - tStart;
    this.updateMs += (ms - this.updateMs) * 0.05;
    if (ms > this.updateMsMax) this.updateMsMax = ms;
  }
}

export async function init(G) {
  if (G.npcs && !G.npcs.stub && G.npcs instanceof Npcs) return;
  const sys = new Npcs(G);
  G.npcs = sys;
  G.addSystem('npcs', (dt) => sys.update(dt), ORDER.ai);
  G.events.on('time:jump', () => sys.resync());
  if (!G.params.has('nonamed') && !G.params.has('scene')) sys.spawnNamed(true);
  const stations = G.world && G.world.stations ? Object.keys(G.world.stations).length : 0;
  if (stations && !G.params.has('nopop')) {
    const p = sys.populate({ count: parseInt(G.params.get('npcs') || '30', 10) }).catch((e) => {
      console.error('[npcs] populate', e);
      G.errors.push(`npcs populate: ${e.message}`);
    });
    if (G.readyGates) G.readyGates.push(p);
  }
}

export { Npcs };
