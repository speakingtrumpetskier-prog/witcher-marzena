// Lake ice and water, the frozen river and the frozen waterfall (owner: terrain builder).
//
// Public API (G.water):
//   addHole(x, z, r = 0.6) -> id    dark open-water hole in the ice with a slush ring (max 16, -1 if full)
//   removeHole(id)
//   setUnderGlow(x, z, radius, intensity, color?)   pale light under the ice (intensity 0 = off)
//   setCracks(x, z, radius, amount) crack network on the ice, amount 0..1 grows it (animatable)
//   setThaw(t)                      0 frozen .. 1 open water; sets G.world.thawed when t > 0.5
//   thaw                            current thaw value
//   ice, river                      the lake and river meshes; material.uniforms in .uniforms
//   ridges                          Group: pressure-ridge slabs, rubble and snow banks (instanced)
//   waterfall                       { group, info: { lip, base, caveMouth: { x, y, z, w, h, depth, yaw } } }
// Ice surface is y = 0 (WORLD.iceLevel); the shader discards where the terrain is above it.
import * as THREE from 'three';
import { LAKE, LOC, RIVER, WORLD } from './layout.js';
import { lakeSDF, FALLS } from './heightfield.js';
import { rng } from '../core/util.js';
import { noise } from '../core/Noise.js';
import { createIceUniforms, createIceMaterial } from './terrain/iceMaterial.js';
import { buildWaterfall } from './terrain/waterfall.js';
import { rockMaterial } from './terrain/rockMaterial.js';

// Lake plane bounds (lake, marsh and river mouth).
const ICE_BOUNDS = { x0: -400, x1: 352, z0: -318, z1: 74 };

function riverRibbon() {
  // Stations along the river with the ice surface just under the bed line; the falls
  // segment is skipped (the curtain is there) except for the plunge pool.
  const pts = RIVER.pts;
  const stations = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 2));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      let bed = ah + (bh - ah) * t;
      if (i === 2) {
        // Falls segment: only the pool below the cliff (x <= 449) at pool level.
        if (x > FALLS.x - 2) continue;
        bed = FALLS.bottom;
      }
      if (i < 2 && x < FALLS.x + 8) continue;
      stations.push({ x, z, y: Math.max(bed - 0.3, -0.03), dx: (bx - ax) / len, dz: (bz - az) / len, gap: i === 2 && stations.length && stations[stations.length - 1].y > 20 });
    }
  }
  const half = RIVER.width * 0.5 + 5.5, across = 10;
  const pos = [], idx = [], acr = [];
  let row = 0;
  for (let s = 0; s < stations.length; s++) {
    const st = stations[s];
    const prev = stations[Math.max(0, s - 1)], next = stations[Math.min(stations.length - 1, s + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    for (let a = 0; a <= across; a++) {
      const o = (a / across - 0.5) * 2 * half;
      pos.push(st.x - tz * o, st.y, st.z + tx * o);
      acr.push(o / half);
    }
    if (s > 0 && !st.gap && Math.abs(st.y - prev.y) < 6) {
      const b0 = (row - 1) * (across + 1), b1 = row * (across + 1);
      for (let a = 0; a < across; a++) idx.push(b0 + a, b0 + a + 1, b1 + a, b0 + a + 1, b1 + a + 1, b1 + a);
    }
    row++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(acr, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Pressure ridges: chains of broken ice plates on contours inside the shore. Each step of a ridge
// gets an upturned slab (about a third of them steep), rubble lying at its foot and a snow bank
// drifted along the base, so a ridge reads as one jumbled line of broken plates, not a row of
// pointed teeth. A Group of three instanced meshes (slabs, rubble, snow banks).
function buildRidges(G) {
  const r = rng(9187);
  const avoid = [LOC.ritual, LOC.iceCamp, LOC.bellTower, LOC.island, LOC.fishingHuts, LOC.hanka, LOC.marsh];
  const blocked = (x, z) => avoid.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + (l === LOC.bellTower ? 30 : 14));
  // Arcs as [angle0, angle1, inset meters] around the lake center (angle 0 = east, +pi/2 = south).
  const arcs = [[-2.7, -1.6, 34], [-1.45, -0.55, 28], [-0.4, 0.5, 40], [2.4, 3.0, 22], [-2.2, -1.2, 70], [0.8, 1.2, 30]];
  const mats = [], rubble = [], banks = [];
  for (const [a0, a1, inset] of arcs) {
    const steps = Math.ceil(Math.abs(a1 - a0) * 300);
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (a1 - a0) * (k / steps) + (r() - 0.5) * 0.002;
      const c = Math.cos(a), s = Math.sin(a);
      // March in from the outside until we are `inset` meters inside the shore.
      let rad = 1.5, x = 0, z = 0;
      for (let it = 0; it < 30; it++) {
        x = LAKE.x + c * LAKE.rx * rad; z = LAKE.z + s * LAKE.rz * rad;
        const sd = lakeSDF(x, z) + inset + noise.noise2(a * 9, inset) * 10;
        rad -= sd / Math.max(LAKE.rx, LAKE.rz) * 0.9;
        if (Math.abs(sd) < 0.5) break;
      }
      if (blocked(x, z) || G.world.terrainAt(x, z) > -0.5) continue;
      const cont = 0.5 + 0.5 * noise.noise2(a * 14 + inset, 3.3);
      if (cont < 0.32) continue;
      const tx = -s * LAKE.rx, tz = c * LAKE.rz, tl = Math.hypot(tx, tz);
      const yaw = Math.atan2(tx / tl, tz / tl);
      const hgt = (0.5 + cont * 1.1) * (0.6 + r() * 0.6);
      // The upturned slab: steep ones stand up out of the jumble, the rest lean over low.
      const steep = r() < 0.35;
      const roll = (r() < 0.5 ? -1 : 1) * (steep ? 0.5 + r() * 0.55 : 0.15 + r() * 0.35);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.9, yaw + (r() - 0.5) * 0.7, roll, 'YXZ'));
      const sc = new THREE.Vector3(0.9 + r() * 1.5, steep ? hgt : hgt * 0.75, 0.18 + r() * 0.2);
      m.compose(new THREE.Vector3(x + (r() - 0.5) * 1.2, hgt * (steep ? 0.25 : 0.12), z + (r() - 0.5) * 1.2), q, sc);
      mats.push(m);
      // Rubble: a broken plate lying on the ice beside it.
      const side = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 1.3);
      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, r() * Math.PI * 2, (r() - 0.5) * 0.35, 'YXZ'));
      const rs = new THREE.Vector3(0.6 + r() * 1.2, 0.14 + r() * 0.24, 0.5 + r() * 0.7);
      rubble.push(new THREE.Matrix4().compose(new THREE.Vector3(x + c * side, rs.y * 0.3, z + s * side), rq, rs));
      // Snow drifted along the foot of the ridge.
      const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (r() - 0.5) * 0.3, 0, 'YXZ'));
      banks.push(new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 0.8, 0.02, z + (r() - 0.5) * 0.8), bq, new THREE.Vector3(1.5 + cont * 1.3, 0.22 + cont * 0.28, 1.0 + r() * 0.7)));
    }
  }
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + noise.noise2(y * 3, z * 3) * 0.08, y + noise.noise2(x * 4, 1.7) * 0.12, z);
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8fb2c4, roughness: 0.16, metalness: 0, emissive: 0x0c2230, emissiveIntensity: 0.6 });
  mat.name = 'pressureRidge';
  mat.userData.snow = { amount: 0.9, threshold: 0.45 };
  const inst = (geo, material, list, name, cast) => {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = cast && G.quality !== 'low';
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  };
  const group = new THREE.Group();
  group.name = 'pressureRidges';
  group.add(inst(g, mat, mats, 'pressureRidgeSlabs', true));
  group.add(inst(g, mat, rubble, 'pressureRidgeRubble', false));
  // Snow banks: a low lumpy drift, flat-bottomed on the ice.
  const bg = new THREE.IcosahedronGeometry(1, 1);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    bp.setXYZ(i, x * (1 + noise.noise2(y * 2 + 4, z * 2) * 0.18), Math.max(0, y) * (1 + noise.noise2(x * 3, z * 3 + 2) * 0.25), z);
  }
  bg.computeVertexNormals();
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.92, metalness: 0 });
  snowMat.name = 'pressureRidgeSnow';
  group.add(inst(bg, snowMat, banks, 'pressureRidgeSnow', false));
  return group;
}

// Small gradient-sky environment for the ice when the sky module has not provided one.
function fallbackEnvironment(G) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.75, 0.8, 0.85), vec3(0.32, 0.47, 0.72), smoothstep(0.0, 0.6, h)); c = mix(c, vec3(0.7, 0.72, 0.75), step(h, 0.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(G.renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  geo.dispose(); mat.dispose();
  return rt.texture;
}

export async function init(G) {
  const uniforms = createIceUniforms(G);
  const lakeMat = createIceMaterial(G, uniforms, 'lake');
  const riverMat = createIceMaterial(G, uniforms, 'river');

  const b = ICE_BOUNDS;
  const geo = new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0, 96, 48);
  geo.rotateX(-Math.PI / 2);
  const ice = new THREE.Mesh(geo, lakeMat);
  ice.position.set((b.x0 + b.x1) / 2, WORLD.iceLevel, (b.z0 + b.z1) / 2);
  ice.receiveShadow = true;
  ice.name = 'lakeIce';
  G.scene.add(ice);

  const river = new THREE.Mesh(riverRibbon(), riverMat);
  river.receiveShadow = true;
  river.name = 'riverIce';
  G.scene.add(river);

  const ridges = buildRidges(G);
  G.scene.add(ridges);

  const falls = buildWaterfall(G, { rockMat: rockMaterial(G) });

  let fallbackEnv = null;
  const syncEnv = () => {
    const want = G.scene.environment ? null : (fallbackEnv ||= fallbackEnvironment(G));
    for (const m of [lakeMat, riverMat]) {
      if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
    }
  };
  syncEnv();

  const holes = uniforms.uMzHoles.value;
  const api = {
    ice, river, ridges, uniforms,
    waterfall: { group: falls.group, info: falls.info },
    thaw: 0,
    addHole(x, z, r = 0.6) {
      const i = holes.findIndex((h) => h.w < 0.5);
      if (i < 0) { console.warn('[water] no free hole slots'); return -1; }
      holes[i].set(x, z, r, 1);
      return i;
    },
    removeHole(id) {
      if (holes[id]) holes[id].w = 0;
    },
    setUnderGlow(x, z, radius, intensity, color) {
      uniforms.uMzGlow.value.set(x, z, radius, intensity);
      if (color) uniforms.uMzGlowColor.value.set(color);
    },
    setCracks(x, z, radius, amount) {
      uniforms.uMzCrack.value.set(x, z, radius, Math.max(0, Math.min(1, amount)));
    },
    setThaw(t) {
      t = Math.max(0, Math.min(1, t));
      api.thaw = t;
      uniforms.uMzThaw.value = t;
      G.world.thawed = t > 0.5;
      const sink = THREE.MathUtils.smoothstep(t, 0.15, 0.6);
      ridges.position.y = -1.6 * sink;
      ridges.visible = sink < 0.99;
      falls.setThaw(t);
    },
  };
  G.water = api;

  G.addSystem('water', () => {
    syncEnv();
    falls.update();
  }, 95);
}
