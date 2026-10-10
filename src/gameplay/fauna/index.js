// Wildlife (owned by the lead): the animals of the valley going about their business between the
// set pieces. Roe deer graze at the forest edges at dawn and dusk and bolt when she rides close; a
// fox trots its round, stops to listen and pounces on mice under the snow; mountain hares sit white
// on white and burst away in zigzags; once in a long while a lynx watches from a rise and slips off.
// Not enemies: nothing here registers with G.combat.
//
//   G.fauna.list, G.fauna.spawn(kind, x, z, opts) -> beast, G.fauna.clear(), G.fauna.stats()
//   ?fauna=0 turns it off; ?fauna=deer,fox spawns only those kinds (debug)
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';
import { Quadruped, SPECS } from '../creatures/quadruped.js';
import { LOC, LAKE } from '../../world/layout.js';

const rr = (a, b) => a + Math.random() * (b - a);
let fxBurst = null; // the shared props FX (snow puffs), loaded with the locations
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Behaviour per kind: flee distances (on foot / mounted), speeds, group sizes, when they are about.
const KINDS = {
  deer: { flee: 30, fleeMounted: 48, walk: 0.55, run: 8.5, group: [2, 5], scale: [0.92, 1.08], active: (h) => (h > 5.5 && h < 10) || (h > 15 && h < 19.5) ? 1 : 0.35 },
  fox: { flee: 18, fleeMounted: 30, walk: 1.6, run: 6.5, group: [1, 1], scale: [0.9, 1.05], active: (h) => (h > 16 || h < 8) ? 1 : 0.5 },
  hare: { flee: 11, fleeMounted: 20, walk: 0.4, run: 8, group: [1, 3], scale: [0.9, 1.1], active: () => 1 },
  lynx: { flee: 34, fleeMounted: 50, walk: 0.9, run: 6, group: [1, 1], scale: [1, 1.1], active: (h) => (h > 15 || h < 9) ? 1 : 0.4 },
};

class Beast {
  constructor(G, kind, x, z, o = {}) {
    this.G = G;
    this.kind = kind;
    this.K = KINDS[kind];
    const spec = SPECS[kind];
    this.rig = new Quadruped(spec, { seed: o.seed ?? Math.random() * 9, scale: o.scale ?? rr(...this.K.scale), tint: o.tint || [rr(0.95, 1.05), rr(0.95, 1.05), rr(0.95, 1.05)] });
    this.root = this.rig.root;
    this.root.position.set(x, G.world.heightAt(x, z), z);
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.root.rotation.y = this.yaw;
    G.scene.add(this.root);
    this.state = 'idle';
    this.t = 0;
    this.stateT = rr(1, 5);
    this.speed = 0;
    this.want = 0;
    this.group = o.group || null;
    this.antlers = kind === 'deer' && o.buck ? this._antlers() : null;
    if (kind === 'lynx') this._tufts();
  }

  // A roe buck's short forked antlers on the head bone.
  _antlers() {
    const head = this.rig.b.head;
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.9 });
    const g = new THREE.Group();
    for (const s of [1, -1]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.2, 5), mat);
      beam.position.set(s * 0.03, 0.1, 0.0);
      beam.rotation.set(-0.25, 0, -s * 0.18);
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.08, 4), mat);
      tine.position.set(0, 0.02, 0.03);
      tine.rotation.set(0.9, 0, 0);
      beam.add(tine);
      g.add(beam);
    }
    g.position.set(0, 0.04, -0.02);
    head.add(g);
    return g;
  }

  // The lynx's black ear tufts.
  _tufts() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 1 });
    for (const ear of [this.rig.b.earL, this.rig.b.earR]) {
      if (!ear) continue;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.06, 4), mat);
      t.position.set(0, 0.1, 0);
      ear.add(t);
    }
  }

  threat() {
    const G = this.G, P = G.player;
    if (!P) return { d: 1e9 };
    const p = P.position, me = this.root.position;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    const fast = P.mounted || (P.loco?.speed || 0) > 4;
    return { d, fast, dir: Math.atan2(me.x - p.x, me.z - p.z) };
  }

  go(state, t) { this.state = state; this.stateT = t; }

  update(dt) {
    const K = this.K, pose = this.rig.pose;
    this.t += dt;
    this.stateT -= dt;
    const th = this.threat();
    const fleeAt = th.fast ? K.fleeMounted : K.flee;
    if (this.state !== 'flee' && this.state !== 'alert' && th.d < fleeAt) {
      this.go('alert', this.kind === 'hare' ? 0.15 : rr(0.4, 0.9));
      this.fleeDir = th.dir;
      if (this.group) for (const m of this.group) if (m !== this && m.state !== 'flee') { m.go('alert', rr(0.2, 0.6)); m.fleeDir = th.dir; }
    }

    let turn = 0;
    // defaults: relaxed carriage per kind
    pose.crouch = 0; pose.pitch = 0; pose.lookPitch = 0; pose.tailWag = 0; pose.jaw = 0;
    pose.neck = this.kind === 'deer' ? 0.9 : this.kind === 'hare' ? 0.25 : 0.42;
    pose.headRel = this.kind === 'deer' ? -0.55 : -0.3;
    pose.ears = 0.2; pose.tail = this.kind === 'fox' ? -0.15 : 0.05;

    switch (this.state) {
      case 'idle': {
        this.want = 0;
        if (this.kind === 'deer' && Math.sin(this.t * 0.7 + this.rig.phase * 9) > -0.2) { pose.neck = -0.35; pose.headRel = 0.05; } // grazing
        if (this.kind === 'hare') { pose.crouch = 0.55; pose.ears = Math.sin(this.t * 0.5) > 0.6 ? 0.9 : 0.4; }
        pose.lookYaw = Math.sin(this.t * 0.3 + this.rig.phase * 5) * 0.4;
        if (this.stateT <= 0) {
          if (this.kind === 'fox' && Math.random() < 0.35) { this.go('listen', rr(1.2, 2.5)); break; }
          this.target = this.wanderTarget();
          this.go('wander', rr(3, 9));
        }
        break;
      }
      case 'wander': {
        this.want = K.walk * (this.kind === 'hare' ? (Math.sin(this.t * 3) > 0.3 ? 4 : 0) : 1);
        turn = this.steerTo(this.target, dt);
        if (this.kind === 'deer') { pose.neck = 0.7; pose.headRel = -0.4; }
        if (this.stateT <= 0 || this.near(this.target, 1.5)) this.go('idle', rr(3, 12));
        break;
      }
      case 'listen': {
        // the fox: still, head cocked, ears forward, then the high pounce
        this.want = 0;
        pose.neck = 0.15; pose.headRel = 0.45; pose.ears = 0.9; pose.lookYaw = 0.25;
        if (this.stateT <= 0) this.go('pounce', 0.75);
        break;
      }
      case 'pounce': {
        const u = 1 - this.stateT / 0.75;
        this.want = 2.2;
        pose.bodyY = Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.55;
        pose.pitch = u < 0.5 ? -0.5 : 0.7;
        pose.neck = -0.2; pose.headRel = 0.6;
        if (this.stateT <= 0) {
          pose.bodyY = 0;
          const p = this.root.position;
          this.G.snowTracks?.stamp('drag', p.x, p.z, this.yaw, 1.2);
          fxBurst?.('snow', [p.x, p.y + 0.1, p.z], { count: 18, speed: 1.4, up: 1.2, size: 0.08 });
          this.go('idle', rr(2, 5));
        }
        break;
      }
      case 'alert': {
        this.want = 0;
        pose.neck = this.kind === 'deer' ? 1.15 : 0.6; pose.headRel = -0.5; pose.ears = 1;
        const rel = wrap(th.dir + Math.PI - this.yaw);
        pose.lookYaw = Math.max(-1, Math.min(1, rel));
        if (this.kind === 'deer') pose.tail = 0.6; // the white rump flares
        if (this.stateT <= 0) this.go('flee', rr(5, 9));
        break;
      }
      case 'flee': {
        this.want = K.run;
        // away from her, with a zigzag for hares and a little weave for the others
        const zig = this.kind === 'hare' ? Math.sign(Math.sin(this.t * 3.1)) * 0.7 : Math.sin(this.t * 0.9) * 0.25;
        const away = (th.d < 120 ? th.dir : this.fleeDir ?? this.yaw) + zig;
        turn = this.steerYaw(away, dt, 4.5);
        pose.neck = 0.55; pose.headRel = -0.4; pose.ears = 0.6; pose.tail = this.kind === 'deer' ? 0.7 : 0.3;
        if (this.stateT <= 0) {
          if (th.d > 70) this.go('idle', rr(3, 8));
          else this.stateT = 3;
        }
        break;
      }
      case 'watch': {
        // the lynx on its rise: still, looking at her, then gone
        this.want = 0;
        pose.crouch = 0.2; pose.ears = 0.8;
        const rel = wrap(th.dir + Math.PI - this.yaw);
        pose.lookYaw = Math.max(-1, Math.min(1, rel));
        if (this.stateT <= 0) { this.fleeDir = th.dir; this.go('flee', 12); }
        break;
      }
      default: break;
    }

    // Motion: accelerate toward the wanted speed, keep off the lake for deer and lynx.
    this.speed += (this.want - this.speed) * Math.min(1, dt * (this.want > this.speed ? 3.2 : 2.2));
    const p = this.root.position;
    const nx = p.x + Math.sin(this.yaw) * this.speed * dt, nz = p.z + Math.cos(this.yaw) * this.speed * dt;
    const onLake = (x, z) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 0.96;
    if ((this.kind === 'deer' || this.kind === 'lynx') && onLake(nx, nz) && !onLake(p.x, p.z)) {
      this.yaw = wrap(this.yaw + Math.PI * 0.6);
    } else {
      p.x = nx; p.z = nz;
    }
    const gy = this.G.world.heightAt(p.x, p.z);
    p.y = Math.max(gy, this.G.world.floorAt ? (this.G.world.floorAt(p.x, p.z, gy) ?? gy) : gy);
    this.root.rotation.y = this.yaw;
    this.rig.update(dt, this.speed, turn);
  }

  steerYaw(goal, dt, rate = 2.2) {
    const d = wrap(goal - this.yaw);
    const step = Math.max(-rate * dt, Math.min(rate * dt, d));
    this.yaw = wrap(this.yaw + step);
    return step / Math.max(dt, 1e-4);
  }
  steerTo(t, dt) {
    if (!t) return 0;
    const p = this.root.position;
    return this.steerYaw(Math.atan2(t.x - p.x, t.z - p.z), dt, 1.6);
  }
  near(t, r) { const p = this.root.position; return !t || Math.hypot(t.x - p.x, t.z - p.z) < r; }
  wanderTarget() {
    const p = this.root.position, c = this.group?.[0]?.root.position || p;
    const R = this.kind === 'fox' ? 22 : this.kind === 'hare' ? 6 : 10;
    return { x: c.x + rr(-R, R), z: c.z + rr(-R, R) };
  }

  dispose() {
    this.root.removeFromParent();
    this.rig.dispose?.();
  }
}

export async function init(G) {
  const param = G.params.get('fauna');
  if (param === '0' || G.params.has('nostory') && G.params.has('scene')) return;
  const only = param && param !== '1' ? param.split(',') : null;
  try { const m = await import('../../world/props/index.js'); fxBurst = (...a) => m.props.fx?.burst?.(...a); } catch { /* optional */ }
  const list = [];
  const api = {
    list,
    spawn(kind, x, z, o = {}) { const b = new Beast(G, kind, x, z, o); list.push(b); return b; },
    clear() { for (const b of list.splice(0)) b.dispose(); },
    stats() { const s = {}; for (const b of list) s[b.kind] = (s[b.kind] || 0) + 1; return s; },
  };
  G.fauna = api;

  // Habitat: forest edges for deer, open snow for hares, anywhere wild for the fox; never the
  // village, the roads' crowns, the lake (except hares and the fox, who cross the ice), or steep rock.
  const village = LOC.square;
  const wild = (x, z) => Math.hypot(x - village.x, z - village.z) > 230;
  const slopeAt = (x, z) => {
    const h = G.world.heightAt(x, z);
    return Math.max(Math.abs(G.world.heightAt(x + 2, z) - h), Math.abs(G.world.heightAt(x, z + 2) - h)) / 2;
  };
  const treesNear = (x, z, r) => (G.vegetation?.treeAt ? !!G.vegetation.treeAt(x, z, r) : false);
  const onLake = (x, z) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1.0;
  function site(kind, cx, cz) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, d = rr(kind === 'lynx' ? 55 : 85, kind === 'lynx' ? 90 : 190);
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (!wild(x, z) || slopeAt(x, z) > 0.55) continue;
      if ((kind === 'deer' || kind === 'lynx') && onLake(x, z)) continue;
      if (kind === 'deer' && !(treesNear(x, z, 18) && !treesNear(x, z, 4))) continue;
      if (kind === 'hare' && treesNear(x, z, 5)) continue;
      return { x, z };
    }
    return null;
  }

  const want = { deer: 2, fox: 1, hare: 3, lynx: 0 };
  let tick = 2, lynxCooldown = rr(240, 600);
  G.addSystem('fauna', (dt) => {
    for (const b of list) b.update(dt);
    tick -= dt;
    lynxCooldown -= dt;
    if (tick > 0 || !G.player || G.story?.busy) return;
    tick = 4;
    const P = G.player.position, h = G.time?.hours ?? 12;
    // Despawn the far ones.
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i], p = b.root.position;
      if (Math.hypot(p.x - P.x, p.z - P.z) > 280) { b.dispose(); list.splice(i, 1); }
    }
    if (!wild(P.x, P.z) && Math.hypot(P.x - village.x, P.z - village.z) < 150) return;
    const snow = G.weather?.params?.snowfall ?? 0;
    const counts = api.stats();
    for (const kind of Object.keys(KINDS)) {
      if (only && !only.includes(kind)) continue;
      let target = kind === 'deer' ? Math.round(want.deer * KINDS.deer.active(h)) : want[kind];
      if (kind === 'lynx') target = lynxCooldown <= 0 ? 1 : 0;
      if (snow > 0.7) target = Math.floor(target / 2);
      const groups = kind === 'deer' ? new Set(list.filter((b) => b.kind === 'deer').map((b) => b.group)).size : counts[kind] || 0;
      if (groups >= target || Math.random() > KINDS[kind].active(h)) continue;
      const s = site(kind, P.x, P.z);
      if (!s) continue;
      const [g0, g1] = KINDS[kind].group;
      const n = Math.round(rr(g0, g1));
      const group = [];
      for (let i = 0; i < n; i++) {
        const b = api.spawn(kind, s.x + rr(-4, 4), s.z + rr(-4, 4), { buck: kind === 'deer' && i === 0 && Math.random() < 0.6, group });
        group.push(b);
        if (kind === 'lynx') { b.go('watch', rr(6, 14)); lynxCooldown = rr(600, 1500); }
      }
    }
  }, ORDER.gameplay ?? 50);
}
