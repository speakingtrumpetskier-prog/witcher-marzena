// Boulders, cliff outcrops, scree, shoreline rocks and landmark erratics (owner: terrain builder).
//
// Procedural variants: noise-displaced icosahedra with plane-cut facets (granite boulders),
// layered slabs with strata ledges, and tall crags for cliff faces; each with a near and a far
// LOD. Instances are packed per frame into one InstancedMesh per (variant, LOD) after distance
// and frustum culling, so draw calls stay at ~a dozen. Snow caps come from the shared snow
// patch (rock material userData.snow). Large rocks register colliders.
//
// Public API (G.rocks):
//   rockAt(x, z, r = 0) -> rock | null   first rock whose footprint overlaps the circle
//   rocks                                [{ x, y, z, r, h, variant, scale }]
//   count, stats { visible, triangles }
import * as THREE from 'three';
import { LOC, ROADS, WORLD } from './layout.js';
import { EXCLUSIONS } from './exclusions.js';
import { lakeSDF, escarpmentAt, fallsCliff, FALLS } from './heightfield.js';
import { rng, nearestOnPolyline } from '../core/util.js';
import { createNoise } from '../core/Noise.js';
import { rockMaterial } from './terrain/rockMaterial.js';
import { KINDS, rockGeometry } from './terrain/rockGeometry.js';
import { buildCliffs } from './terrain/cliffs.js';

const N3 = createNoise(5151);

// ---- placement helpers
const LOCS = Object.values(LOC).filter((l) => l !== LOC.village && l !== LOC.fishingHuts);
function blocked(x, z, rad) {
  for (const l of LOCS) if (Math.hypot(x - l.x, z - l.z) < l.r + rad + 3) return true;
  if (Math.hypot(x - LOC.village.x, z - LOC.village.z) < LOC.village.r + 8 + rad) return true;
  for (const e of EXCLUSIONS) if (Math.hypot(x - e.x, z - e.z) < (e.r || 0) + rad) return true;
  for (const road of ROADS) {
    const n = nearestOnPolyline(x, z, road.pts);
    if (n.d < road.width * 0.5 + 2.5 + rad) return true;
  }
  // Keep the frozen falls and its pool clear, and the watchtower vista free of big rocks.
  if (Math.hypot(x - FALLS.curtainX, z - FALLS.z) < 16 + rad) return true;
  if (rad > 1.2 && Math.hypot(x - LOC.watchtower.x, z - LOC.watchtower.z) < 40 + rad) return true;
  return false;
}

class RockSet {
  constructor() { this.list = []; this.hash = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(rock) {
    for (const o of this.near(rock.x, rock.z, rock.r)) {
      if (Math.abs(o.y - rock.y) > (o.h + rock.h) * 0.42) continue; // stacked on a cliff face
      if (Math.hypot(o.x - rock.x, o.z - rock.z) < (o.r + rock.r) * 0.7) return false;
    }
    this.list.push(rock);
    const c = 16;
    for (let ix = Math.floor((rock.x - rock.r) / c); ix <= Math.floor((rock.x + rock.r) / c); ix++) {
      for (let iz = Math.floor((rock.z - rock.r) / c); iz <= Math.floor((rock.z + rock.r) / c); iz++) {
        const k = this.key(ix, iz);
        let b = this.hash.get(k);
        if (!b) this.hash.set(k, (b = []));
        b.push(rock);
      }
    }
    return true;
  }
  near(x, z, r) {
    const out = [], c = 16;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const b = this.hash.get(this.key(ix, iz));
        if (b) for (const o of b) if (!out.includes(o)) out.push(o);
      }
    }
    return out;
  }
}

function place(G) {
  const W = G.world;
  const r = rng(31337);
  const set = new RockSet();
  const nrm = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const add = (x, z, scale, variant, opts = {}) => {
    const rad = scale * 1.1;
    if (!opts.force && blocked(x, z, rad * 0.6)) return false;
    const sd = lakeSDF(x, z);
    if (!opts.shore && sd < 1) return false;
    W.normalAt(x, z, nrm);
    const y = W.heightAt(x, z) - (opts.sink || 0) * scale;
    const tilt = opts.tilt ?? 0.55;
    const q = new THREE.Quaternion().setFromUnitVectors(up, nrm.clone().lerp(up, 1 - tilt).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI * 2));
    const def = KINDS[variant];
    const h = scale * def.scale[1] * 1.3;
    return set.add({ x, y, z, r: rad * Math.max(def.scale[0], def.scale[2]) * 0.85, h, variant, scale, q, sx: scale * (0.85 + r() * 0.3), sy: scale * (0.85 + r() * 0.3), sz: scale * (0.85 + r() * 0.3) });
  };

  // 1. North escarpment: talus blocks and boulders fallen from the cliff face (the face itself
  // is a cliff mesh, terrain/cliffs.js). Big blocks half bury the cliff foot.
  for (let x = -455; x <= 435; x += 1.5 + r() * 2.5) {
    const e = escarpmentAt(x);
    if (e.hgt * e.along < 6) continue;
    const pile = 0.5 + 0.5 * N3.noise2(x * 0.02, 4.4);
    for (let k = 0; k < 3; k++) {
      const z = e.zc + 3 + r() * (6 + 10 * k) ;
      const big = r() < 0.2 + 0.35 * pile;
      const sc = big ? 1.8 + r() * 3.2 * pile : 0.35 + r() * 1.0;
      add(x + (r() - 0.5) * 3, z, sc, big ? 3 + Math.floor(r() * 4) : Math.floor(r() * 5), { tilt: 0.5, sink: big ? 0.35 : 0.2, shore: true });
    }
  }
  // Is (x, z) on one of the meshed cliff faces?
  const onMeshedCliff = (x, z) => {
    if (z < -280 && x > -470 && x < 452) {
      const e = escarpmentAt(x);
      if (e.hgt * e.along >= 6 && z < e.zc + 6 && z > Math.min(e.zc - 12, e.z2 - 16)) return true;
    }
    if (x > 380 && x < 520 && Math.abs(z - FALLS.z) < 125) {
      const f = fallsCliff(z);
      if (f.wdt <= 11 && Math.abs(x - f.xc) < f.wdt + 6) return true;
    }
    return false;
  };

  // 1b. Cliff faces anywhere (escarpment, falls, gorges): a heightfield cannot overhang, so
  // near-vertical faces are dressed with crags sized to the local cliff height.
  {
    const lim0 = WORLD.playable + 140;
    for (let z = -lim0; z < lim0; z += 2) {
      for (let x = -lim0; x < lim0; x += 2) {
        W.normalAt(x, z, nrm);
        if (nrm.y > 0.6) continue;
        const gl = Math.hypot(nrm.x, nrm.z) || 1;
        const dx = nrm.x / gl, dz = nrm.z / gl; // downhill
        const hTop = W.terrainAt(x - dx * 9, z - dz * 9), hBot = W.terrainAt(x + dx * 9, z + dz * 9);
        const H = hTop - hBot;
        if (H < 5) continue;
        const sc = Math.min(13, Math.max(2.4, H * (0.24 + r() * 0.18)));
        const cx = x - dx * sc * 0.45, cz = z - dz * sc * 0.45;
        if (onMeshedCliff(x, z) || blocked(cx, cz, sc * 0.5)) continue;
        const variant = 5 + (r() < 0.5 ? 1 : 0);
        const def = KINDS[variant];
        const yaw = Math.atan2(dx, dz) + (r() - 0.5) * 0.8;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, yaw, (r() - 0.5) * 0.25, 'YXZ'));
        set.add({ x: cx, y: hBot + H * (-0.08 + r() * 0.55), z: cz, r: sc * Math.max(def.scale[0], def.scale[2]) * 0.8, h: sc * def.scale[1] * 1.3, variant, scale: sc, q,
          sx: sc * (0.9 + r() * 0.4), sy: sc * (0.8 + r() * 0.4), sz: sc * (0.8 + r() * 0.3) });
      }
    }
  }

  // 2. Steep slopes and cliffs anywhere in the playable valley: outcrops; scree below.
  const lim = WORLD.playable + 120;
  for (let z = -lim; z < lim; z += 5) {
    for (let x = -lim; x < lim; x += 5) {
      const jx = x + r() * 5, jz = z + r() * 5;
      W.normalAt(jx, jz, nrm);
      const steep = 1 - nrm.y;
      if (steep > 0.22) {
        if (onMeshedCliff(jx, jz)) continue;
        const cl = 0.5 + 0.5 * N3.noise2(jx * 0.02, jz * 0.02);
        if (r() < (steep - 0.15) * 1.6 * cl) {
          const crag = steep > 0.35;
          add(jx, jz, crag ? 2.5 + r() * 4 : 1 + r() * 2.2, crag ? 5 + (r() < 0.5 ? 1 : 0) : 3 + (r() < 0.5 ? 1 : 0), { tilt: 0.45, sink: 0.2 });
        }
      } else if (steep > 0.08 && steep < 0.2) {
        // Scree: look uphill for a cliff within ~12 m.
        const ux = -nrm.x, uz = -nrm.z, ul = Math.hypot(ux, uz) || 1;
        const hx = jx + (ux / ul) * 10, hz = jz + (uz / ul) * 10;
        const n2 = W.normalAt(hx, hz, new THREE.Vector3());
        if (n2.y < 0.7 && r() < 0.5) {
          for (let k = 0; k < 3; k++) add(jx + (r() - 0.5) * 6, jz + (r() - 0.5) * 6, 0.25 + r() * 0.7, r() < 0.6 ? Math.floor(r() * 3) : 3, { tilt: 0.8, sink: 0.1 });
        }
      }
    }
  }

  // 3. Shoreline rocks (north and east shores mostly; the village shore is left open).
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    const c = Math.cos(a), s = Math.sin(a);
    if (s > 0.55) continue; // south shore = village side
    const keep = 0.5 + 0.5 * N3.noise2(c * 3 + 1.7, s * 3);
    if (keep < 0.45) continue;
    for (let k = 0; k < 2; k++) {
      let rad = 1.0, x = 0, z = 0;
      const target = -2 + r() * 8;
      for (let it = 0; it < 25; it++) {
        x = 40 + c * 270 * rad; z = -120 + s * 170 * rad;
        const sd = lakeSDF(x, z) - target;
        rad -= sd / 300;
        if (Math.abs(sd) < 0.4) break;
      }
      add(x, z, 0.4 + r() * 1.6 * keep, Math.floor(r() * 5), { shore: true, sink: 0.15, tilt: 0.6 });
    }
  }

  // 4. Forest floor and meadow boulders in clusters.
  for (let i = 0; i < 2600; i++) {
    const x = (r() * 2 - 1) * lim, z = (r() * 2 - 1) * lim;
    const cl = 0.5 + 0.5 * N3.noise2(x * 0.012 + 4, z * 0.012);
    if (cl < 0.62 || r() > cl) continue;
    for (let k = 0; k < 1 + Math.floor(r() * 4); k++) {
      add(x + (r() - 0.5) * 14, z + (r() - 0.5) * 14, 0.35 + Math.pow(r(), 2.2) * 2.4, Math.floor(r() * 5), { sink: 0.15 });
    }
  }

  // 5. Landmark erratics: big lone boulders the eye can find from far away.
  const marks = [[-196, 262, 6.5], [46, -308, 7], [262, 128, 6], [-438, -150, 5.5], [-338, -128, 5], [168, 148, 4.5], [-120, 300, 5.5], [330, 60, 6]];
  for (const [x, z, s] of marks) {
    for (let t = 0; t < 12; t++) {
      const ox = t ? (r() - 0.5) * 30 : 0, oz = t ? (r() - 0.5) * 30 : 0;
      if (add(x + ox, z + oz, s, Math.floor(r() * 3), { tilt: 0.2, sink: 0.2 })) break;
    }
  }
  return set;
}

export async function init(G) {
  const set = place(G);
  const rocks = set.list;
  const mat = rockMaterial(G);
  const cliffs = buildCliffs(G, rockMaterial(G, { tone: 0.72 }));
  const lods = [3, 1];
  const meshes = [];
  for (let v = 0; v < KINDS.length; v++) {
    const row = [];
    for (let l = 0; l < lods.length; l++) {
      const geo = rockGeometry(KINDS[v], lods[l]);
      const cap = rocks.filter((rk) => rk.variant === v).length || 1;
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = G.quality !== 'low';
      m.receiveShadow = true;
      m.name = `rocks_${KINDS[v].kind}_${v}_lod${l}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      row.push(m);
      G.scene.add(m);
    }
    meshes.push(row);
  }
  // Precompute instance matrices.
  for (const rk of rocks) {
    rk.m = new THREE.Matrix4().compose(new THREE.Vector3(rk.x, rk.y, rk.z), rk.q, new THREE.Vector3(rk.sx, rk.sy, rk.sz));
    rk.cy = rk.y + rk.h * 0.4;
    rk.br = rk.scale * 2.2;
    delete rk.q;
  }
  // Colliders for anything you could not step over.
  for (const rk of rocks) {
    if (rk.r > 0.8 && rk.h > 0.6) rk.collider = G.physics.addCircle(rk.x, rk.z, rk.r * 0.8, { y0: rk.y - 1, y1: rk.y + rk.h, tag: 'rock' });
  }

  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const camPos = new THREE.Vector3();
  const last = new THREE.Vector3(1e9, 0, 0);
  const lastQ = new THREE.Quaternion();
  const near = G.quality === 'high' ? 70 : G.quality === 'medium' ? 50 : 35;
  const stats = { visible: 0, triangles: 0 };
  const triCount = meshes.map((row) => row.map((m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3));
  const update = (force) => {
    const cam = G.camera;
    cam.updateMatrixWorld();
    camPos.setFromMatrixPosition(cam.matrixWorld);
    if (!force && camPos.distanceToSquared(last) < 1 && cam.quaternion.angleTo(lastQ) < 0.01) return;
    last.copy(camPos); lastQ.copy(cam.quaternion);
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const row of meshes) for (const m of row) m.count = 0;
    stats.visible = 0; stats.triangles = 0;
    for (const rk of rocks) {
      const d = Math.hypot(rk.x - camPos.x, rk.cy - camPos.y, rk.z - camPos.z);
      if (d > 220 + rk.scale * 140) continue;
      sphere.center.set(rk.x, rk.cy, rk.z);
      sphere.radius = rk.br;
      if (d > 40 && !frustum.intersectsSphere(sphere)) continue;
      const l = d < near * (0.6 + rk.scale * 0.25) ? 0 : 1;
      const m = meshes[rk.variant][l];
      m.setMatrixAt(m.count++, rk.m);
      stats.visible++;
      stats.triangles += triCount[rk.variant][l];
    }
    for (const row of meshes) for (const m of row) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
  };
  update(true);
  G.addSystem('rocks', () => update(false), 99);

  G.rocks = {
    rocks,
    cliffs,
    count: rocks.length,
    stats,
    meshes,
    rockAt(x, z, r = 0) {
      for (const o of set.near(x, z, r + 1)) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return o;
      return null;
    },
  };
}
