// Snowballs the children throw at each other: a small pool of spheres flying a short arc, a
// powder burst where they land, and a callback so the target can flinch and laugh.
//
//   const snow = new Snowballs(G)
//   snow.launch(fromVec3, toVec3, onHit)     snow.update(dt)
import * as THREE from 'three';
import { makeSnowball } from './tools.js';
import { fx } from '../../world/props/fx.js';

const N = 8;
const _v = new THREE.Vector3();

export class Snowballs {
  constructor(G) {
    this.G = G;
    this.balls = [];
    this.group = new THREE.Group();
    this.group.name = 'snowballs';
    G.scene.add(this.group);
    for (let i = 0; i < N; i++) {
      const m = makeSnowball();
      m.visible = false;
      m.castShadow = false;
      this.group.add(m);
      this.balls.push({ m, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), arc: 1, cb: null, live: false });
    }
  }

  launch(from, to, cb) {
    const s = this.balls.find((x) => !x.live);
    if (!s) return false;
    s.a.copy(from); s.b.copy(to);
    const d = from.distanceTo(to);
    s.dur = Math.max(0.35, d / 9);
    s.arc = 0.5 + d * 0.12;
    s.t = 0; s.cb = cb || null; s.live = true;
    s.m.visible = true;
    s.m.position.copy(from);
    return true;
  }

  update(dt) {
    for (const s of this.balls) {
      if (!s.live) continue;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      _v.lerpVectors(s.a, s.b, u);
      _v.y += Math.sin(Math.PI * u) * s.arc;
      s.m.position.copy(_v);
      if (u >= 1) {
        s.live = false;
        s.m.visible = false;
        fx.burst('snow', s.b, { count: 12, speed: 1.3, size: 0.12 });
        if (s.cb) s.cb(s.b);
        s.cb = null;
      }
    }
  }
}
