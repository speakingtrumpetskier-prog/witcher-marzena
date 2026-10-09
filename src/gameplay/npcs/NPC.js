// One villager: a Character plus a small brain that follows a daily schedule of stations.
//
//   const npc = new NPC(system, def)          (use G.npcs.spawn(def))
//   npc.id, npc.def, npc.character (created on first use), npc.station, npc.state
//   npc.pause(bool)     story control: while paused the brain never touches the character
//   npc.goTo(stationId | { x, z, yaw?, anim? }) -> Promise<bool>   override the schedule, true on arrival
//   npc.release()       drop the override and return to the schedule
//   npc.bark(text)      say a line now (floating text, mouth, gesture)
//   npc.setTalk(talk)   dialogue id or async function; adds a "Talk" interaction
//   npc.face(target)    turn toward an Object3D or Vector3 (head follows)
//
// States: 'station' (doing the station animation), 'walk' (following a planned path), 'inside'
// (hidden in a building), 'stare' (stopped to look at Vesna), 'idle' (needs a plan). Per frame the
// brain allocates nothing: it reuses module scratch values.
import * as THREE from 'three';
import { createCharacter } from '../../characters/index.js';
import { dampAngle, wrapAngle, rng, hashString, clamp } from '../../core/util.js';
import { getStation, normalize, slotPos } from './stations.js';
import { makeTool, TOOL_FOR_ANIM, TOOL_POSE } from './tools.js';
import { chooseBark, chooseExchange } from './barks.js';
import { fx } from '../../world/props/fx.js';

const FREEZE2 = 170 * 170, WAKE2 = 150 * 150, NEAR2 = 45 * 45, FAR2 = 60 * 60;
const _slot = { x: 0, z: 0, yaw: 0 };
const _v = new THREE.Vector3();

const inRange = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
const wrap24 = (h) => ((h % 24) + 24) % 24;

export class NPC {
  constructor(sys, def) {
    this.sys = sys;
    this.G = sys.G;
    this.def = def;
    this.id = def.id;
    this.preset = def.preset || def.id;
    this.name = def.name || def.id;
    this.rand = rng(hashString(this.id) ^ 0x9e37);
    this._c = null;
    this.paused = false;
    this.frozen = false;
    this.disposed = false;
    this.state = 'idle';
    this.station = null; // current normalized station (where it is or is heading)
    this.slot = 0;
    this.curKey = null;
    this.curEntry = null;
    this.path = null;
    this.pi = 0;
    this.v = 0;
    this.ghost = false;
    this.override = null;
    this.hidden = false;
    this.d2 = 1e9;
    this.acc = 0;
    this.schedT = this.rand() * 0.5;
    this.wantPlan = null;
    this.planTok = 0;
    this.planPending = false;
    this.errand = null;
    this.errandT = 4 + this.rand() * 40;
    this.microT = 3 + this.rand() * 10;
    this.barkCD = 8 + this.rand() * 25;
    this.glance = 0;
    this.glanceV = new THREE.Vector3();
    this.stareT = 0;
    this.stareCD = 0;
    this.staresAtPlayer = !def.child && this.rand() < 0.16;
    this.lookOn = false;
    this.speakT = 0;
    this.lineQ = null;
    this.sideX = 0; this.sideZ = 0;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.stuckChk = 0;
    this.faceYaw = null;
    this.baseX = 0; this.baseZ = 0;
    this.tool = null; this.toolKey = '';
    this.carrying = null;
    this.exitDoor = null;
    this.breath = null;
    this.floorY = null;
    this.convo = null;
    this.interactId = null;
    this.laughT = 3 + this.rand() * 10;
    this.arriveCb = null;
    const age = def.child ? 1 : /^elder/.test(this.preset) ? 2 : 0;
    this.walkSpeed = (age === 1 ? 1.55 : age === 2 ? 0.95 : 1.22) + this.rand() * 0.16;
    this.runChance = age === 1 ? 0.5 : 0;
    this.hardy = (def.hardy ?? 0.6) + (this.rand() - 0.5) * 0.12;
    if (def.talk) this.setTalk(def.talk);
  }

  // ---- public API -------------------------------------------------------------------------
  // Created on first use (the story asks for it): placed where the schedule says right now.
  get character() {
    if (!this._c) { this._create(); this.placeNow(this.sys._frameData(0)); }
    return this._c;
  }
  get visible() { return !!this._c && this._c.visible && !this.hidden && !this.frozen; }
  get position() { return this._c ? this._c.root.position : _v.set(this.baseX, 0, this.baseZ); }

  pause(on = true) {
    if (on === this.paused) return;
    this.paused = !!on;
    this.planTok++;
    this.planPending = false;
    if (on) {
      this.v = 0;
      this._cancelOverrideWaiters();
      if (this.convo) this.sys.leaveConvo(this);
      if (this._c) {
        this._c.targetSpeed = 0;
        if (this.tool) this.tool.visible = false;
        // A staged NPC must be visible even if it was indoors or out of range.
        if (this.hidden || this.frozen) { this._c.setVisible(true); this.hidden = false; this.frozen = false; }
      }
    } else {
      // The story may have moved and posed the character: reset layers and re-plan.
      const c = this._c;
      if (c) {
        c.lookAt(null); c.talk(false); c.stopUpper(0.2);
        if (this.tool) this.tool.visible = true;
      }
      this.lookOn = false; this.convo = null; this.errand = null; this.path = null;
      this.state = 'idle'; this.curKey = null; this.v = 0;
      if (this.hidden && c) { c.setVisible(true); this.hidden = false; }
      this.sys.requestResync(this);
    }
  }

  goTo(target) {
    const st = typeof target === 'string' ? getStation(this.G, target) : normalize(`ov_${this.id}`, { kind: 'work', anim: 'idle', yaw: 0, ...target });
    if (!st) return Promise.resolve(false);
    this._cancelOverrideWaiters();
    return new Promise((resolve) => {
      this.override = { st, resolve };
      this.curKey = null;
    });
  }

  release() {
    this._cancelOverrideWaiters();
    this.override = null;
    this.curKey = null;
  }

  bark(text) {
    if (!text) return;
    this.G.ui?.bark?.(this.name, text, this.character);
    this._speakGesture(text.length * 0.06 + 1.4);
  }

  face(target) {
    if (!this._c) return;
    const p = target.isObject3D ? target.getWorldPosition(_v) : target;
    this.faceYaw = Math.atan2(p.x - this._c.root.position.x, p.z - this._c.root.position.z);
  }

  setTalk(talk) {
    this.def.talk = talk;
    const G = this.G;
    if (this.interactId != null) { G.interact?.remove(this.interactId); this.interactId = null; }
    if (!talk || !G.interact) return;
    this.interactId = G.interact.add({
      id: `npc_${this.id}`, pos: () => (this._c ? this._c.root.position.clone().setY(this._c.root.position.y + 1.1) : null),
      radius: 2.6, label: this.name, verb: 'Talk', facing: true,
      enabled: () => this.visible && !this.paused && !this.override?.story,
      onUse: async () => {
        if (typeof talk === 'function') await talk(this);
        else await G.dialogue?.start(talk, { actors: { [this.id]: this._c } });
      },
    });
  }

  dispose() {
    this.disposed = true;
    this.release();
    if (this.interactId != null) this.G.interact?.remove(this.interactId);
    this._dropTool();
    if (this.breath) { this.breath.dispose(); this.breath = null; }
    if (this._c) { this._c.dispose(); this._c = null; }
  }

  // Rough position before the character exists (distance gating and lazy creation).
  locate(S) {
    const des = this._desired(S);
    if (!des) return;
    const st = des.st;
    const p = st.kind === 'bed' && st.door ? st.door : st;
    this.baseX = p.x; this.baseZ = p.z;
  }

  // ---- creation ---------------------------------------------------------------------------
  _create() {
    if (this._c) return this._c;
    const c = createCharacter(this.def.spec || this.preset, { lowDetail: this.def.lowDetail ?? !this.def.named });
    c.autoGround = false;
    c.npc = this;
    this.G.scene.add(c.root);
    c.setVisible(false);
    c.onEvent((name) => { if (name === 'hit') this._onHit(); });
    this._c = c;
    return c;
  }

  // ---- schedule ---------------------------------------------------------------------------
  _entryAt(hour) {
    const sch = this.def.schedule;
    if (!sch || !sch.length) return null;
    const h = wrap24(hour);
    for (let i = 0; i < sch.length; i++) if (inRange(h, sch[i].from, sch[i].to)) return sch[i];
    // gap: stay with the entry that ended most recently
    let best = sch[0], bd = 99;
    for (let i = 0; i < sch.length; i++) { const d = wrap24(h - sch[i].to); if (d < bd) { bd = d; best = sch[i]; } }
    return best;
  }

  _resolve(e) {
    if (!e) return null;
    if (e._st && e._v === this.sys.stationVersion && e._o === this) return e._st;
    const at = e.at;
    let st = null;
    if (typeof at === 'string') {
      if (at.startsWith('tag:')) {
        const list = this.sys.byTag(at.slice(4));
        if (list.length) st = list[hashString(this.id + at) % list.length];
      } else st = getStation(this.G, at);
    } else if (at && at.x != null) st = normalize(`inline_${this.id}_${e.from}`, at);
    if (!st) {
      // Missing station: synthesize one near the NPC's anchor so the schedule still works.
      const a = this.def.anchor || { x: 0, z: 100 };
      const key = `fb_${this.id}_${e.from}`;
      st = this.sys.synth.get(key);
      if (!st) {
        const r = this.rand;
        st = normalize(key, {
          x: a.x + (r() - 0.5) * 6, z: a.z + (r() - 0.5) * 6, yaw: r() * 6.28, anim: e.anim || 'idle',
          kind: e.hidden ? 'bed' : 'work', indoor: !!e.hidden,
        });
        this.sys.synth.set(key, st);
      }
    }
    e._st = st; e._v = this.sys.stationVersion; e._o = this;
    return st;
  }

  // Which station should this NPC be at right now (override, blizzard shelter, schedule)?
  _desired(S) {
    if (this.override) return { st: this.override.st, key: this.override.st.id, entry: null };
    const e = this._entryAt(S.hour);
    if (!e) return null;
    let st = this._resolve(e);
    let key = st.id;
    if (S.sev > this.hardy && !st.indoor && st.kind !== 'bed' && this.def.home !== undefined) {
      const home = this.def.home && getStation(this.G, this.def.home);
      if (home) { st = home; key = `${home.id}#shelter`; }
    }
    return { st, key, entry: e };
  }

  _checkSchedule(S) {
    const des = this._desired(S);
    if (!des) return;
    if (des.key === this.curKey) return;
    this._goStation(des.st, des.key, des.entry, S);
  }

  _goStation(st, key, entry, S) {
    this.curKey = key;
    this.curEntry = entry;
    const wasInside = this.state === 'inside';
    this.convo = null;
    // leaving a visible indoor station: walk out through its door first
    this.exitDoor = this.state === 'station' && !this.errand && this.station && this.station.indoor && this.station.door ? this.station.door : null;
    if (this.errand) this.errand = null;
    if (wasInside) this._emerge(S);
    this._leaveStation();
    this.station = st;
    this.slot = 0;
    if (st.kind === 'talk') this.slot = this.sys.claimSlot(st, this);
    this.wantPlan = st;
    if (this.state !== 'walk') this.state = 'idle';
  }

  // ---- placement --------------------------------------------------------------------------
  // Put the NPC where the schedule says it should be right now (spawn, time jumps, unfreezing).
  // mid-transit NPCs are placed along their route so a frozen clock still shows people walking.
  placeNow(S, allowTransit = true) {
    const c = this._create();
    const des = this._desired(S);
    if (!des) { c.setVisible(false); this.hidden = true; this.state = 'inside'; return; }
    this._leaveStation();
    this.curKey = des.key;
    this.curEntry = des.entry;
    this.station = des.st;
    const st = des.st;
    this.slot = st.kind === 'talk' ? this.sys.claimSlot(st, this) : 0;
    this.convo = null; this.errand = null; this.path = null; this.v = 0;
    this._setFloor(st);
    if (st.kind === 'bed' || des.entry?.hidden || des.key.endsWith('#shelter')) {
      const door = st.door || st;
      c.setPosition(door.x, door.z, this._floorOf(door, st));
      this._enter(S, true);
      return;
    }
    // In transit from the previous station?
    const e = des.entry;
    if (allowTransit && e && !this.override) {
      const since = wrap24(S.hour - e.from) * this.sys.hourSecs;
      const prevE = this._entryAt(e.from - 0.01);
      const prev = prevE && prevE !== e ? this._resolve(prevE) : null;
      if (prev && since < 240) {
        const path = this._pathBetween(prev, st, prevE.hidden || prev.kind === 'bed');
        if (path) {
          const len = this._pathLen(path);
          const dist = since * this.walkSpeed;
          if (dist < len - 0.5) { this._placeAlong(path, dist, S); return; }
        }
      }
    }
    this._placeAtStation(st, S);
    // Some people start the day mid-errand so a frozen clock still shows life in the streets.
    if (allowTransit && S.dayTime && !this.override && st.kind !== 'talk' && st.kind !== 'sit' && this.rand() < (this.def.errand ?? 0.5) * 0.6) {
      const tgt = this._errandTarget(this.baseX, this.baseZ);
      const mid = tgt && this.sys.nav.plan(this.baseX, this.baseZ, tgt.x, tgt.z);
      const path = mid ? [{ x: this.baseX, z: this.baseZ }, ...mid.map((w) => ({ x: w.x, z: w.z }))] : null;
      if (path) {
        this.errand = this._newErrand();
        this._leaveStation();
        this._placeAlong(path, this._pathLen(path) * (0.1 + this.rand() * 0.8), S);
      }
    }
  }

  _placeAtStation(st, S) {
    const c = this._c;
    slotPos(st, this.slot, _slot);
    c.setPosition(_slot.x, _slot.z, this._floorOf(_slot, st));
    c.yaw = _slot.yaw;
    this.baseX = _slot.x; this.baseZ = _slot.z;
    c.setVisible(!this.frozen);
    this.hidden = false;
    this.state = 'station';
    this._startStation(S);
  }

  _placeAlong(path, dist, S) {
    const c = this._c;
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (acc + l >= dist) {
        const t = (dist - acc) / (l || 1);
        c.setPosition(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        c.yaw = Math.atan2(b.x - a.x, b.z - a.z);
        this.path = path; this.pi = i + 1; this.state = 'walk'; this.v = this.walkSpeed * 0.9;
        this.ghost = !!b.ghost;
        c.setVisible(!this.frozen); this.hidden = false;
        this._beginLoco(S);
        return;
      }
      acc += l;
    }
    this._placeAtStation(this.station, S);
  }

  _pathLen(path) {
    let l = 0;
    for (let i = 0; i < path.length - 1; i++) l += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    return l;
  }

  _floorOf(p, st) { return st && st.y != null && st.indoor ? st.y : undefined; }
  _setFloor(st) {
    const c = this._c;
    if (st.y != null && st.indoor) { this.floorY = st.y; c.ground = (_x, _z) => st.y; } else { this.floorY = null; c.ground = null; }
  }

  // A full path from station a to station b as an array of {x, z, ghost?} starting at a's spot.
  _pathBetween(a, b, fromHidden) {
    const nav = this.sys.nav;
    const out = [];
    const pa = fromHidden && a.door ? a.door : a;
    out.push({ x: pa.x, z: pa.z });
    if (!fromHidden && a.indoor && a.door) out.push({ x: a.door.x, z: a.door.z, ghost: true });
    const startX = out[out.length - 1].x, startZ = out[out.length - 1].z;
    let tx, tz;
    const inDoor = b.indoor && b.door;
    if (inDoor) { tx = b.door.x; tz = b.door.z; } else { slotPos(b, this.slot, _slot); tx = _slot.x; tz = _slot.z; }
    nav.ensure(startX, startZ);
    const mid = nav.plan(startX, startZ, tx, tz);
    if (mid) for (const w of mid) out.push({ x: w.x, z: w.z });
    else out.push({ x: tx, z: tz });
    if (inDoor && b.kind !== 'bed') out.push({ x: b.x, z: b.z, ghost: true });
    return out;
  }

  // ---- per frame --------------------------------------------------------------------------
  update(dt, S) {
    if (this.paused || this.disposed) return;
    const cam = S.cam;
    const c0 = this._c;
    const p = c0 ? c0.root.position : null;
    const px = p ? p.x : this.baseX, pz = p ? p.z : this.baseZ;
    const dx = px - cam.x, dz = pz - cam.z;
    this.d2 = dx * dx + dz * dz;
    if (this.frozen) {
      if (this.d2 > WAKE2) return;
      this._thaw(S);
    } else if (this.d2 > FREEZE2 && !this.def.keepAlive && !this.override) {
      this._freeze();
      return;
    }
    if (!this._c) {
      if (S.createLeft <= 0) return;
      S.createLeft--;
      this.placeNow(S);
      return;
    }
    this.acc += dt;
    if (this.d2 > FAR2 && this.acc < 0.2) return;
    dt = Math.min(this.acc, 0.5);
    this.acc = 0;
    const c = this._c;

    this.schedT -= dt;
    if (this.schedT <= 0) { this.schedT = 0.45 + this.rand() * 0.1; this._checkSchedule(S); }

    if (this.wantPlan && !this.planPending) this._doPlan(this.wantPlan);

    switch (this.state) {
      case 'walk': this._walk(dt, S); break;
      case 'station': this._atStation(dt, S); break;
      case 'stare': this._stare(dt, S); break;
      case 'inside': break;
      default: break;
    }
    if (this.state !== 'inside') this._life(dt, S);
    void c;
  }

  _freeze() {
    this.frozen = true;
    if (this._c) this._c.setVisible(false);
    if (this.breath) this.breath.setActive(false);
  }

  _thaw(S) {
    this.frozen = false;
    if (!this._c) return;
    this.placeNow(S, false);
    if (this.breath) this.breath.setActive(true);
  }

  // ---- planning ---------------------------------------------------------------------------
  _doPlan(st) {
    this.wantPlan = null;
    const c = this._c;
    const p = c.root.position;
    const pre = [];
    // Leaving an indoor station: out through its door first (ghost leg).
    if (this.exitDoor) {
      pre.push({ x: this.exitDoor.x, z: this.exitDoor.z, ghost: true });
      this.exitDoor = null;
    }
    let tx, tz;
    const inDoor = st.indoor && st.door;
    if (inDoor) { tx = st.door.x; tz = st.door.z; } else { slotPos(st, this.slot, _slot); tx = _slot.x; tz = _slot.z; }
    const sx = pre.length ? pre[0].x : p.x, sz = pre.length ? pre[0].z : p.z;
    const nav = this.sys.nav;
    nav.ensure(tx, tz);
    nav.ensure(sx, sz);
    const tok = ++this.planTok;
    this.planPending = true;
    nav.request(sx, sz, tx, tz, (mid) => {
      this.planPending = false;
      if (tok !== this.planTok || this.disposed || this.paused || this.station !== st) return;
      const S = this.sys.S;
      const path = pre;
      if (mid) for (const w of mid) path.push({ x: w.x, z: w.z });
      else {
        // Unreachable or outside the nav regions: straight line (or hop when far and unseen).
        const far = Math.hypot(tx - c.root.position.x, tz - c.root.position.z) > 70 && this.d2 > 40 * 40;
        if (far) { this._placeAtStation(st, S); return; }
        path.push({ x: tx, z: tz });
      }
      if (inDoor && st.kind !== 'bed') path.push({ x: st.x, z: st.z, ghost: true });
      this._startPath(path, S);
    });
  }

  _startPath(path, S) {
    const c = this._c;
    this.path = path;
    this.pi = 0;
    // skip a leading waypoint we are already standing on
    while (this.pi < path.length - 1 && Math.hypot(path[this.pi].x - c.root.position.x, path[this.pi].z - c.root.position.z) < 0.4) this.pi++;
    this.stuckT = 0; this.stuckChk = 0.5;
    this.lastX = c.root.position.x; this.lastZ = c.root.position.z;
    this._leaveStation(true);
    this.state = 'walk';
    this._beginLoco(S);
  }

  _beginLoco(S) {
    const c = this._c;
    this.faceYaw = null;
    const carry = this.errand?.carry || (this.def.carry && this.errand ? this.def.carry : null);
    if (carry && carry !== this.carrying) this._setCarry(carry);
    else if (!carry && this.carrying) this._setCarry(null);
    c.setLocomotion(Math.max(0.3, this.v));
    void S;
  }

  _setCarry(kind) {
    const c = this._c;
    this.carrying = kind;
    if (kind) {
      c.playUpper('carry_bucket', { loop: true, fade: 0.3 });
      this._setTool(kind === 'basket' ? 'basket' : 'bucket', 'handR');
    } else {
      c.stopUpper(0.3);
      this._dropTool();
    }
  }

  // ---- walking ----------------------------------------------------------------------------
  _walk(dt, S) {
    const c = this._c, p = c.root.position, path = this.path;
    if (!path) { this.state = 'idle'; return; }
    const w = path[this.pi];
    const dx = w.x - p.x, dz = w.z - p.z;
    const dist = Math.hypot(dx, dz);
    const last = this.pi === path.length - 1;
    if (dist < (last ? 0.14 : 0.65)) {
      if (!last) { this.pi++; this.ghost = !!path[this.pi].ghost; return; }
      this._arrive(S);
      return;
    }
    this.ghost = !!w.ghost || (last && this.station && dist < 2.2 && this.station.kind !== 'wander' && !this.errand);
    let hx = dx / dist, hz = dz / dist;
    // Steering: keep clear of people, step aside for the player, pass others on the right.
    let ax = 0, az = 0, yieldK = 1;
    const ag = S.agents;
    for (let i = 0; i < ag.length; i++) {
      const o = ag[i];
      if (o.npc === this) continue;
      const ox = p.x - o.x, oz = p.z - o.z;
      const d2 = ox * ox + oz * oz;
      const R = o.r;
      if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), k = (R - d) / R;
      ax += (ox / d) * k * o.w;
      az += (oz / d) * k * o.w;
      // someone ahead: sidestep to the right and ease off
      const ahead = (-ox * hx - oz * hz) / d;
      if (ahead > 0.3) {
        ax += hz * k * 0.9 * ahead; az += -hx * k * 0.9 * ahead;
        if (d < 1.1) yieldK = Math.min(yieldK, 0.35 + d * 0.5);
      }
    }
    // the player is the biggest thing in the street
    const pd = Math.hypot(p.x - S.player.x, p.z - S.player.z);
    if (pd < 2.2 && pd > 0.01) {
      const k = (2.2 - pd) / 2.2;
      ax += ((p.x - S.player.x) / pd) * k * 1.6; az += ((p.z - S.player.z) / pd) * k * 1.6;
      if (pd < 1.0) yieldK = Math.min(yieldK, 0.5);
    }
    let mx = hx + ax, mz = hz + az;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const want = Math.atan2(mx, mz);
    const dyaw = wrapAngle(want - c.yaw);
    c.yaw = dampAngle(c.yaw, want, this.v < 0.4 ? 9 : 6, dt);
    let target = (this.errand && this.errand.run ? 2.7 : this.walkSpeed) * yieldK;
    if (last) target = Math.min(target, 0.35 + dist * 1.3);
    target *= 0.3 + 0.7 * Math.max(0, Math.cos(dyaw));
    this.v += clamp(target - this.v, -7 * dt, 3.2 * dt);
    c.targetSpeed = this.v;
    const step = this.v * dt;
    p.x += Math.sin(c.yaw) * step;
    p.z += Math.cos(c.yaw) * step;
    p.y = this.floorY ?? this.G.world.heightAt(p.x, p.z);
    if (!this.ghost) {
      const f = this.sys.nav.flag(p.x, p.z);
      if (f) this.G.physics.resolve(p, 0.3);
    }
    // stuck detection: re-plan, then hop
    this.stuckChk -= dt;
    if (this.stuckChk <= 0) {
      this.stuckChk = 1.2;
      const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
      this.lastX = p.x; this.lastZ = p.z;
      if (moved < 0.25 && this.v > 0.1 || moved < 0.05) this.stuckT += 1.2; else this.stuckT = Math.max(0, this.stuckT - 1.2);
      if (this.stuckT > 4.8) {
        this.stuckT = 0;
        if (this.d2 > 30 * 30 || this.stuckReplans > 1) {
          this.stuckReplans = 0;
          this._placeAtStation(this.station, S);
        } else {
          this.stuckReplans = (this.stuckReplans || 0) + 1;
          this.wantPlan = this.station;
          this.state = 'idle';
          this.v = 0;
        }
      }
    }
    // a few walkers stop and stare
    if (this.staresAtPlayer && this.stareCD <= 0 && pd < 5.5 && !S.busy) this._beginStare(S);
  }

  _arrive(S) {
    const c = this._c;
    this.path = null;
    this.v = 0;
    c.targetSpeed = 0;
    const st = this.station;
    if (this.errand && this.errand.phase === 'go') {
      this.errand.phase = 'wait';
      this.errand.until = S.t + 3 + this.rand() * 6;
      this.state = 'station';
      this.baseX = c.root.position.x; this.baseZ = c.root.position.z;
      this.faceYaw = c.yaw + (this.rand() - 0.5) * 2;
      if (this.carrying) this._setCarry(null);
      c.stop(0.3);
      this.anim = 'idle';
      return;
    }
    if (st.kind === 'bed' || (this.curEntry && this.curEntry.hidden) || (this.curKey && this.curKey.endsWith('#shelter'))) {
      this._enter(S);
      return;
    }
    if (this.errand) this.errand = null;
    if (this.carrying) this._setCarry(null);
    this._setFloor(st);
    slotPos(st, this.slot, _slot);
    this.baseX = _slot.x; this.baseZ = _slot.z;
    this.faceYaw = _slot.yaw;
    this.state = 'station';
    this._startStation(S);
    if (this.override) { const r = this.override.resolve; this.override.resolve = () => {}; r(true); }
  }

  // ---- stations ---------------------------------------------------------------------------
  _leaveStation(keepSlot = false) {
    if (!keepSlot && this.station) this._lastStation = this.station;
    if (this.convo) this.sys.leaveConvo(this);
    if (!keepSlot) this.sys.releaseSlot(this);
    const c = this._c;
    if (c) {
      c.talk(false);
      c.stopUpper(0.25);
      c.lookAt(null);
    }
    this.lookOn = false;
    this._dropTool();
    this.carrying = null;
    this.anim = null;
  }

  _startStation(S) {
    const c = this._c, st = this.station;
    if (!st) return;
    const anim = this.override && this.override.st.anim && this.override.st === st ? st.anim : (this.curEntry && this.curEntry.anim) || st.anim;
    this.anim = anim;
    if (st.kind === 'talk') {
      c.setLocomotion(0);
      c.play('idle', { loop: true, fade: 0.4 });
      this.sys.joinConvo(this, S);
    } else if (anim === 'idle' || !anim) {
      c.stop(0.35);
    } else {
      c.play(anim, { loop: true, fade: 0.45 });
    }
    // tools
    const T = st.tool === 'none' ? null : st.tool ? { tool: st.tool, socket: TOOL_FOR_ANIM[anim]?.socket || 'handR' } : TOOL_FOR_ANIM[anim];
    if (T) this._setTool(T.tool, T.socket);
    if (!c.cold && this.rand() < 0.5) c.cold = true;
    this.errandT = 6 + this.rand() * 40;
    if (this.sys.G.shot) this.errandT = 4 + this.rand() * 20;
  }

  _atStation(dt, S) {
    const c = this._c;
    const st = this.station;
    // settle facing
    const fy = this.faceYaw;
    if (fy != null) {
      c.yaw = dampAngle(c.yaw, fy, 6, dt);
      if (Math.abs(wrapAngle(fy - c.yaw)) < 0.02) this.faceYaw = null;
    }
    // errand wait phase: return to the station when done
    if (this.errand && this.errand.phase === 'wait') {
      if (S.t >= this.errand.until) { this.errand.phase = 'back'; this.errand.carry = this.errand.back; this.wantPlan = st; this.state = 'idle'; }
      return;
    }
    // step aside for the player while standing
    if (st && st.kind !== 'sit' && st.kind !== 'bed' && !st.indoor) this._sidestep(dt, S);
    // errands and wandering
    if (!this.errand && !this.override && S.dayTime && (this.def.errand ?? 0.5) > 0) {
      this.errandT -= dt * (this.def.errand ?? 0.5) * 2;
      if (this.errandT <= 0) this._beginErrand(S);
    }
    // idle micro-behavior: glance around
    this.microT -= dt;
    if (this.microT <= 0 && !this.lookOn && st && st.kind !== 'talk') {
      this.microT = 6 + this.rand() * 16;
      if (this.d2 < NEAR2) {
        const a = this.rand() * 6.28;
        c.lookAt(this.glanceV.set(c.root.position.x + Math.sin(a) * 6, c.root.position.y + 1.5, c.root.position.z + Math.cos(a) * 6));
        this.glance = 1.5 + this.rand() * 2;
      }
    }
    if (this.glance > 0) { this.glance -= dt; if (this.glance <= 0 && !this.lookOn) c.lookAt(null); }
    if (this.staresAtPlayer && this.stareCD <= 0 && !S.busy && st && st.kind !== 'sit') {
      const pd2 = (c.root.position.x - S.player.x) ** 2 + (c.root.position.z - S.player.z) ** 2;
      if (pd2 < 30) this._beginStare(S);
    }
  }

  _sidestep(dt, S) {
    const c = this._c, p = c.root.position;
    const bx = this.baseX, bz = this.baseZ;
    const px = S.player.x, pz = S.player.z;
    let ox = p.x - px, oz = p.z - pz;
    const d = Math.hypot(ox, oz);
    if (d < 1.05 && d > 0.001 && this.d2 < NEAR2) {
      const push = (1.05 - d) * 3.5 * dt;
      this.sideX += (ox / d) * push; this.sideZ += (oz / d) * push;
      const m = Math.hypot(this.sideX, this.sideZ);
      if (m > 0.85) { this.sideX *= 0.85 / m; this.sideZ *= 0.85 / m; }
    } else if (this.sideX !== 0 || this.sideZ !== 0) {
      const m = Math.hypot(this.sideX, this.sideZ);
      const r = Math.min(m, 0.6 * dt);
      this.sideX -= (this.sideX / m) * r; this.sideZ -= (this.sideZ / m) * r;
      if (m - r < 0.005) { this.sideX = 0; this.sideZ = 0; }
    } else return;
    p.x = bx + this.sideX; p.z = bz + this.sideZ;
    if (this.sys.nav.flag(p.x, p.z) === 1) { p.x = bx; p.z = bz; this.sideX = this.sideZ = 0; }
    p.y = this.floorY ?? this.G.world.heightAt(p.x, p.z);
    void ox; void oz;
  }

  // ---- errands ----------------------------------------------------------------------------
  // Pick an errand target near (fromX, fromZ); null when there is nowhere to go.
  _errandTarget(fromX, fromZ) {
    const st = this.station;
    const nav = this.sys.nav;
    let tgt = null;
    if (st.kind === 'wander') {
      tgt = nav.randomFree(st.x, st.z, 4, st.r, this.rand) || nav.randomRoad(this.rand, st, st.r + 20);
    } else {
      tgt = nav.randomRoad(this.rand, { x: fromX, z: fromZ }, 55) || nav.randomFree(fromX, fromZ, 8, 30, this.rand);
    }
    if (!tgt || Math.hypot(tgt.x - fromX, tgt.z - fromZ) < 4) return null;
    return tgt;
  }

  _newErrand() {
    const run = this.runChance > 0 && this.rand() < this.runChance;
    return { phase: 'go', carry: this.def.carry || null, back: this.def.carry || null, run, until: 0 };
  }

  _beginErrand(S) {
    const st = this.station;
    this.errandT = 14 + this.rand() * 40;
    if (!st || this.d2 > 90 * 90 || this.convo || this.planPending) return;
    const p = this._c.root.position;
    const tgt = this._errandTarget(p.x, p.z);
    if (!tgt) return;
    const tok = ++this.planTok;
    this.planPending = true;
    this.sys.nav.request(p.x, p.z, tgt.x, tgt.z, (mid) => {
      this.planPending = false;
      if (tok !== this.planTok || this.disposed || this.paused || this.state !== 'station' || this.errand || this.override || this.station !== st) return;
      const path = mid ? mid.map((w) => ({ x: w.x, z: w.z })) : [{ x: tgt.x, z: tgt.z }];
      this.errand = this._newErrand();
      this.sideX = this.sideZ = 0;
      this._startPath(path, this.sys.S);
    });
    void S;
  }

  // ---- inside buildings -------------------------------------------------------------------
  _enter(S, silent = false) {
    const c = this._c;
    if (!silent && this.d2 < 30 * 30) this.sys.sfx('door_close', c.root.position, 0.45);
    this._dropTool();
    c.setLocomotion(0);
    c.setVisible(false);
    this.hidden = true;
    this.state = 'inside';
    this.path = null;
    this.v = 0;
    if (this.override) { const r = this.override.resolve; this.override.resolve = () => {}; r(true); }
    void S;
  }

  _emerge(S) {
    const c = this._c;
    const st = this.station || this._lastStation;
    const door = st && st.door ? st.door : st;
    if (door) c.setPosition(door.x, door.z, this._floorOf(door, st));
    if (st) c.yaw = (st.yaw || 0) + Math.PI;
    c.setVisible(!this.frozen);
    this.hidden = false;
    this.state = 'idle';
    this.floorY = null; c.ground = null;
    if (this.d2 < 30 * 30) this.sys.sfx('door', c.root.position, 0.4);
    void S;
  }

  // ---- tools ------------------------------------------------------------------------------
  _setTool(name, socket) {
    const key = `${name}@${socket}`;
    if (this.toolKey === key && this.tool) return;
    this._dropTool();
    const m = makeTool(name);
    if (!m) return;
    const pose = TOOL_POSE[name] || [0, 0, 0, 0, 0, 0];
    m.position.set(pose[0], pose[1], pose[2]);
    m.rotation.set(pose[3], pose[4], pose[5]);
    this._c.attach(socket, m);
    this.tool = m;
    this.toolKey = key;
    if (this.paused) m.visible = false;
  }

  _dropTool() {
    if (this.tool) { this.tool.parent?.remove(this.tool); this.tool = null; this.toolKey = ''; }
  }

  _onHit() {
    const S = this.sys.S;
    if (this.d2 > 40 * 40 || !S) return;
    const c = this._c;
    if (this.anim === 'hammer') {
      this.sys.sfx('forge_hammer', c.root.position, 0.55);
      if (this.d2 < 30 * 30) {
        const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw);
        _v.set(c.root.position.x + fx_ * 0.55, c.root.position.y + 0.95, c.root.position.z + fz_ * 0.55);
        fx.burst('sparks', _v, { count: 9, speed: 1.3 });
      }
    } else if (this.anim === 'chop_wood') {
      this.sys.sfx('axe_chop', c.root.position, 0.5);
      if (this.d2 < 30 * 30) {
        const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw);
        _v.set(c.root.position.x + fx_ * 0.6, c.root.position.y + 0.55, c.root.position.z + fz_ * 0.6);
        fx.burst('straw', _v, { count: 4, speed: 0.9, size: 0.06 });
      }
    }
  }

  // ---- looking, staring, speaking ---------------------------------------------------------
  _beginStare(S) {
    const c = this._c;
    this.stareT = 4 + this.rand() * 4;
    this.stareCD = 60;
    this.prevState = this.state;
    this.state = 'stare';
    this.v = 0; c.targetSpeed = 0;
    this.lookOn = true;
    c.lookAt(S.lookTarget);
    this.faceYaw = Math.atan2(S.player.x - c.root.position.x, S.player.z - c.root.position.z);
    if (this.prevState === 'walk') { c.stop(0.3); c.play('cross_arms', { loop: true, fade: 0.5 }); }
  }

  _stare(dt, S) {
    const c = this._c;
    this.stareT -= dt;
    const fy = Math.atan2(S.player.x - c.root.position.x, S.player.z - c.root.position.z);
    c.yaw = dampAngle(c.yaw, fy, 3, dt);
    const pd = Math.hypot(c.root.position.x - S.player.x, c.root.position.z - S.player.z);
    if (this.stareT <= 0 || pd > 9) {
      this.lookOn = false;
      c.lookAt(null);
      if (this.prevState === 'walk' && this.path) { this.state = 'walk'; this._beginLoco(S); }
      else { this.state = 'station'; this.faceYaw = this.station ? slotPos(this.station, this.slot, _slot).yaw : null; this._startStation(S); }
    }
  }

  // look-at-player, barks, sfx, breath: the cheap "alive" layer (near NPCs only)
  _life(dt, S) {
    if (this.d2 > NEAR2) return;
    const c = this._c;
    this.stareCD -= dt;
    // breath puffs
    if (!this.breath && this.d2 < 28 * 28 && S.cold) {
      const k = c.M ? c.M.headK : 1;
      this.breath = fx.breath({ parent: c.bones.head, position: [0, 0.075 * k, 0.1 * k], getSpeed: () => c.speed });
    }
    if (this.breath) this.breath.setActive(this.d2 < 30 * 30 && this.state !== 'inside');
    // heads turn toward Vesna when she passes close
    if (this.state !== 'stare' && !this.convo) {
      const px = c.root.position.x - S.player.x, pz = c.root.position.z - S.player.z;
      const d2 = px * px + pz * pz;
      if (!this.lookOn && d2 < 6.5 * 6.5) {
        // only when she is roughly in front: dot of facing and direction to her
        const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw);
        const dd = Math.sqrt(d2) || 1;
        const front = (-px * fx_ - pz * fz_) / dd;
        if (front > -0.2) { this.lookOn = true; c.lookAt(S.lookTarget); this.glance = 0; }
      } else if (this.lookOn && d2 > 9 * 9) {
        this.lookOn = false; c.lookAt(null);
      }
      // proximity barks
      this.barkCD -= dt;
      if (this.barkCD <= 0 && d2 < 5 * 5 && d2 > 1.3 * 1.3 && S.barkOK && this.state !== 'inside') {
        this.barkCD = 35 + this.rand() * 55;
        if (this.rand() < 0.62) {
          const t = chooseBark(this.G, this, this.rand);
          if (t) { this.sys.noteBark(); this.bark(t); }
        }
      }
    }
    // speaking mouth timer
    if (this.speakT > 0) { this.speakT -= dt; if (this.speakT <= 0 && !this.convo) c.talk(false); }
    // children laugh
    if (this.def.child && this.anim === 'child_play') {
      this.laughT -= dt;
      if (this.laughT <= 0) { this.laughT = 7 + this.rand() * 12; if (this.d2 < 35 * 35) this.sys.sfx('child_laugh', c.root.position, 0.35); }
    }
    void chooseExchange;
  }

  _speakGesture(secs) {
    const c = this._c;
    if (!c) return;
    c.talk(true);
    this.speakT = secs;
    c.playUpper(['talk_1', 'talk_2', 'talk_3'][Math.floor(this.rand() * 3)], { loop: false, fade: 0.3 });
  }

  _cancelOverrideWaiters() {
    if (this.override && this.override.resolve) { const r = this.override.resolve; this.override.resolve = () => {}; r(false); }
  }
}
