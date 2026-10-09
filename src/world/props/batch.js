// PropBatch: place hundreds of static props with a handful of draw calls.
//
//   const batch = new PropBatch(G, 'village');
//   const h = batch.add('barrel', x, z, { yaw, scale, y, seed, snap: true, collide: true, align });
//   batch.build();                    // merges per (chunk, material), adds one Group to G.scene
//   h.anchors.fire                    // world-space Vector3 of the prop's anchors, after build
//
// add() options:
//   yaw      rotation about Y (three convention, object.rotation.y)
//   scale    number or [x, y, z]
//   snap     true (default): y = ground height at the footprint + `y` offset; false: `y` is absolute
//   y        offset (snap) or absolute height (no snap)
//   seed     variant seed; omitted: derived from the position (8 variants per prop type)
//   collide  true (default): register the prop's colliders with G.physics
//   align    0..1 how much to tilt to the terrain normal (default: per prop, small items tilt)
//   opts     extra options forwarded to the prop builder (variant, indoor, ...)
//
// Fx markers on props (campfire, brazier, lantern, chimney...) become real emitters at build.
// Static: batched props cannot be moved or removed individually (dispose() removes the batch).
import * as THREE from 'three';
import { mergeGeos } from './kit.js';
import { fx } from './fx.js';

// Collision.js addBox uses the opposite yaw sign to three's rotation.y (see the report).
const COLLIDER_YAW_SIGN = -1;

const IDENT = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function hash2(x, z) {
  let h = Math.imul(Math.round(x * 8) | 0, 374761393) ^ Math.imul(Math.round(z * 8) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class PropBatch {
  constructor(G, name = 'props', opts = {}) {
    this.G = G;
    this.name = name;
    this.chunk = opts.chunk == null ? 96 : opts.chunk;
    this.variants = opts.variants || 8;
    this.items = [];
    this.templates = new Map();
    this.root = null;
    this.colliderIds = [];
    this.emitters = [];
    this.stats = { props: 0, meshes: 0, tris: 0, colliders: 0, emitters: 0, templates: 0 };
    this.built = false;
  }

  add(name, x, z, o = {}) {
    const h = { name, x, z, o, y: 0, yaw: o.yaw || 0, scale: o.scale == null ? 1 : o.scale, anchors: {}, colliders: [], emitters: [], built: false };
    this.items.push(h);
    return h;
  }

  _template(h, make) {
    const o = h.o;
    const seed = Number.isFinite(o.seed) ? Math.floor(o.seed) : hash2(h.x, h.z) % this.variants;
    h.seed = seed;
    const extra = o.opts || {};
    const key = `${h.name}|${seed}|${o.indoor == null ? 'd' : o.indoor ? 'i' : 'o'}|${JSON.stringify(extra)}`;
    let t = this.templates.get(key);
    if (!t) {
      const opts = { ...extra, seed, fx: false };
      if (o.indoor != null) opts.indoor = !!o.indoor;
      t = make(h.name, opts);
      this.templates.set(key, t);
    }
    return t;
  }

  // `make` is props.make, injected by index.js to avoid an import cycle.
  build(make = PropBatch.make) {
    if (this.built) return this.root;
    const G = this.G;
    const world = G.world;
    const root = new THREE.Group();
    root.name = `props:${this.name}`;
    const buckets = new Map(); // cellKey -> Map(material -> { items, cast, receive })
    const chunk = this.chunk;

    for (const h of this.items) {
      const t = this._template(h, make);
      const ud = t.userData;
      const sc = Array.isArray(h.scale) ? h.scale : [h.scale, h.scale, h.scale];
      const o = h.o;
      const rad = Math.min(1.6, Math.max(0.1, Math.max(ud.bounds.max.x - ud.bounds.min.x, ud.bounds.max.z - ud.bounds.min.z) * 0.4)) * sc[0];
      // Ground height under the footprint.
      let y = o.y || 0;
      let nrm = null;
      if (o.snap !== false && world) {
        const c = world.heightAt(h.x, h.z);
        let sum = c, cnt = 1;
        if (rad > 0.3) {
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2 + h.yaw;
            sum += world.heightAt(h.x + Math.cos(a) * rad, h.z + Math.sin(a) * rad); cnt++;
          }
        }
        y = sum / cnt + (o.y || 0);
        const al = o.align == null ? (ud.align || 0) : o.align;
        if (al > 0 && world.normalAt) {
          nrm = world.normalAt(h.x, h.z, _n.clone());
          nrm.lerp(_up, 1 - al).normalize();
        }
      }
      h.y = y;
      // placement matrix: T * Ralign * Ryaw * S
      _qa.setFromAxisAngle(_up, h.yaw);
      if (nrm) { _q.setFromUnitVectors(_up, nrm); _qa.premultiply(_q); }
      _m.compose(_p.set(h.x, y, h.z), _qa, _s.set(sc[0], sc[1], sc[2]));
      const placement = _m.clone();
      h.matrix = placement;

      // Merge buckets
      const cx = chunk > 0 ? Math.floor(h.x / chunk) : 0, cz = chunk > 0 ? Math.floor(h.z / chunk) : 0;
      const ck = cx * 100003 + cz;
      let cell = buckets.get(ck);
      if (!cell) buckets.set(ck, (cell = new Map()));
      t.updateMatrixWorld(true);
      t.traverse((ch) => {
        if (!ch.isMesh) return;
        let b = cell.get(ch.material);
        if (!b) cell.set(ch.material, (b = { items: [], cast: ch.castShadow, receive: ch.receiveShadow }));
        b.items.push({ geo: ch.geometry, matrix: ch.parent === t && ch.matrixWorld.equals(IDENT) ? placement : placement.clone().multiply(ch.matrixWorld) });
      });

      // Anchors in world space.
      if (ud.anchors) for (const [k, v] of Object.entries(ud.anchors)) h.anchors[k] = v.clone().applyMatrix4(placement);

      // Colliders
      if (o.collide !== false && G.physics && ud.colliders && ud.colliders.length) {
        const sx = sc[0];
        for (const c of ud.colliders) {
          _p.set(c.x || 0, 0, c.z || 0).applyMatrix4(placement);
          const opts = { y0: y - 0.6, y1: y + c.h * sc[1] + 0.05, tag: h.name };
          let id;
          if (c.type === 'circle') id = G.physics.addCircle(_p.x, _p.z, c.r * sx, opts);
          else id = G.physics.addBox(_p.x, _p.z, c.hw * sx, c.hd * sx, COLLIDER_YAW_SIGN * (h.yaw + (c.yaw || 0)), opts);
          h.colliders.push(id);
          this.colliderIds.push(id);
        }
      }

      // Fx markers
      t.traverse((ch) => {
        const spec = ch.userData && ch.userData.fxSpec;
        if (!spec) return;
        const wp = new THREE.Vector3().setFromMatrixPosition(ch.matrixWorld).applyMatrix4(placement);
        const em = fx.fromSpec(spec, [wp.x, wp.y, wp.z], root, o.fxOpts || {});
        if (em) { h.emitters.push(em); this.emitters.push(em); }
      });
      h.built = true;
    }

    let tris = 0;
    for (const [, cell] of buckets) {
      for (const [material, b] of cell) {
        const geo = mergeGeos(b.items);
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
        tris += geo.index.count / 3;
      }
    }
    this.stats = {
      props: this.items.length, meshes: root.children.length, tris, colliders: this.colliderIds.length,
      emitters: this.emitters.length, templates: this.templates.size,
    };
    this.G.scene.add(root);
    this.root = root;
    this.built = true;
    return root;
  }

  dispose() {
    if (this.root) {
      this.G.scene.remove(this.root);
      this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    for (const id of this.colliderIds) this.G.physics.remove(id);
    for (const e of this.emitters) e.dispose();
    for (const t of this.templates.values()) t.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.colliderIds = [];
    this.emitters = [];
    this.templates.clear();
    this.root = null;
    this.built = false;
  }
}

PropBatch.make = null; // set by index.js
