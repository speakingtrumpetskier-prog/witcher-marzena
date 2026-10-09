// The frozen waterfall at LOC.waterfall: the river pours off a rock lintel over the falls
// cliff and has frozen into a 25 m curtain of fused blue-white columns and icicles, with a
// splash mound at the pool. Behind the curtain the heightfield leaves a dark alcove and a cave
// slot (heightfield.js FALLS); a few faint blue crystals glow deep inside.
//
// buildWaterfall(G, { rockMat }) -> { group, setThaw(t), update(dt), info }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addCompileHook } from '../../render/Materials.js';
import { NOISE_GLSL, noiseTextures } from './noiseTextures.js';
import { FALLS } from '../heightfield.js';
import { rng } from '../../core/util.js';
import { rockGeometry } from './rockGeometry.js';
import { noise } from '../../core/Noise.js';

const ICE_PARS = /* glsl */ `
${NOISE_GLSL}
uniform float uMzIceLight;
uniform float uMzFallThaw;
uniform float uTime;
varying vec3 vMzFWP;
varying vec3 vMzFN;
`;

const ICE_SHADE = /* glsl */ `
{
  vec3 wp = vMzFWP;
  vec3 n = normalize(vMzFN);
  vec3 V = normalize(cameraPosition - wp);
  vec4 s1 = mzNoiseK(vec2(wp.x * 3.0 + wp.z * 3.0, wp.y * 0.25), 0.6);
  vec4 s2 = mzNoiseK(vec2(wp.z * 1.3 - wp.x, wp.y * 0.6) + 9.0, 1.7);
  float streak = smoothstep(0.35, 0.75, s1.r) * 0.6 + s2.g * 0.4;
  vec3 white = vec3(0.8, 0.88, 0.94);
  vec3 blue = vec3(0.32, 0.56, 0.72);
  float facing = abs(dot(n, V));
  vec3 c = mix(blue, white, smoothstep(0.25, 0.85, streak + n.y * 0.3));
  diffuseColor.rgb = c;
  roughnessFactor = mix(0.12, 0.35, s2.r);
  // Light passing through thin ice: a luminous blue that is strongest at grazing angles and
  // in the grooves, scaled by the daylight.
  float thin = pow(1.0 - facing, 2.0) * 0.6 + (1.0 - streak) * 0.25;
  totalEmissiveRadiance += vec3(0.2, 0.5, 0.75) * thin * uMzIceLight * (1.0 - uMzFallThaw);
  vec2 gr = s1.zw * vec2(3.0, 0.25) * 0.004 + s2.zw * 0.003;
  normal = normalize(normal + (viewMatrix * vec4(gr.x, 0.0, gr.y, 0.0)).xyz);
}
`;

function iceMat(G, uni) {
  const nz = noiseTextures();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0 });
  m.name = 'frozenFalls';
  m.userData.snow = { amount: 0.6, threshold: 0.78 };
  addCompileHook(m, 'mzFallsIce', (shader) => {
    shader.uniforms.uMzNoise = { value: nz.smooth };
    shader.uniforms.uMzWhite = { value: nz.white };
    shader.uniforms.uMzIceLight = uni.light;
    shader.uniforms.uMzFallThaw = uni.thaw;
    shader.uniforms.uTime = G.uniforms.uTime;
    shader.vertexShader = 'varying vec3 vMzFWP;\nvarying vec3 vMzFN;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvMzFWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMzFN = normalize(mat3(modelMatrix) * objectNormal);');
    let fs = ICE_PARS + shader.fragmentShader;
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + ICE_SHADE);
    shader.fragmentShader = fs;
  });
  return m;
}

// A hanging ice candle: tapered, with drip bulges, slightly bent, optional flared foot.
function column(len, top, rad, foot, seed) {
  const segH = Math.max(6, Math.round(len / 1.2));
  const g = new THREE.CylinderGeometry(rad, rad, len, 9, segH, false);
  const p = g.attributes.position;
  const rr = rng(seed);
  const ph = rr() * 10, bend = (rr() - 0.5) * 0.06, wob = 0.15 + rr() * 0.2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.min(1, Math.max(0, 0.5 - y / len)); // 0 top .. 1 bottom
    let k = foot ? 1 - 0.45 * t + 0.9 * Math.pow(Math.max(0, t - 0.82) / 0.18, 2) : Math.pow(1 - t, 0.75);
    k *= 1 + wob * Math.sin(t * len * 0.9 + ph) * (0.6 + 0.4 * Math.sin(t * len * 2.3 + ph * 2.0));
    const a = Math.atan2(z, x);
    k *= 1 + 0.12 * noise.noise2(a * 1.5 + seed, t * len * 0.5);
    p.setXYZ(i, x * k + bend * t * len, y, z * k);
  }
  g.translate(top.x, top.y - len / 2, top.z);
  g.computeVertexNormals();
  return g;
}

export function buildWaterfall(G, { rockMat }) {
  const group = new THREE.Group();
  group.name = 'frozenFalls';
  const uni = { light: { value: 0.6 }, thaw: { value: 0 } };
  const mat = iceMat(G, uni);
  const W = G.world;
  const r = rng(4471);
  const zc = FALLS.z;
  const poolY = FALLS.bottom - 0.3;
  const lipY = 34.0;

  // Rock lintel: an overhanging rock mass that roofs the alcove and the cave slot.
  {
    const g = rockGeometry({ kind: 'slab', seed: 913, scale: [1.0, 0.32, 1.0], cuts: 6, rough: 0.2, strata: 1 }, 4, { embed: 0.55 });
    g.scale(9, 9, 17);
    const lintel = new THREE.Mesh(g, rockMat);
    lintel.position.set(FALLS.x + 1.5, lipY - 0.2, zc);
    lintel.castShadow = lintel.receiveShadow = true;
    lintel.name = 'fallsLintel';
    group.add(lintel);
  }

  const geos = [];
  // Ice cap where the river pours over the lip.
  {
    const g = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x * (1 + 0.15 * noise.noise2(z * 3, y * 3)), y, z);
    }
    g.scale(7.5, 1.4, 10);
    g.translate(FALLS.x - 1.5, lipY + 2.4, zc);
    g.computeVertexNormals();
    geos.push(g);
  }
  // Curtain: fused full-height pillars in the middle, icicles of varied length to the sides,
  // and a gap where the cave mouth shows dark behind a few thin icicles.
  const gap0 = FALLS.caveZ - 4.6, gap1 = FALLS.caveZ - 1.2;
  const n = 84;
  for (let i = 0; i < n; i++) {
    const u = (i + r() * 0.8) / n;
    const z = zc - 11 + u * 21;
    const inGap = z > gap0 && z < gap1;
    const center = 1 - Math.min(1, Math.abs(z - (zc + 2)) / 9);
    const full = !inGap && r() < 0.2 + 0.65 * center;
    let len = full ? lipY + 0.6 - poolY : (2.5 + r() * 17 * (0.35 + center)) * (0.5 + 0.5 * r());
    if (inGap) len = 1.5 + r() * 6;
    const rad = (full ? 0.5 + r() * 0.7 : 0.14 + r() * 0.38) * (0.7 + 0.5 * center) * (inGap ? 0.6 : 1);
    const x = FALLS.curtainX + (r() - 0.5) * 2.4 + (full ? -0.4 : 0.3);
    geos.push(column(len, new THREE.Vector3(x, lipY + 0.6, z), rad, full, 100 + i));
  }
  // A thick fused core so the curtain reads as a solid frozen flow, not loose sticks.
  for (let k = 0; k < 4; k++) {
    const z = zc + 0.5 + k * 2.6;
    geos.push(column(lipY + 0.8 - poolY, new THREE.Vector3(FALLS.curtainX - 0.3 + (r() - 0.5), lipY + 0.8, z), 1.5 + r() * 0.6, true, 500 + k));
  }
  // Icicle fringe along the lintel's front edge beyond the curtain.
  for (let i = 0; i < 46; i++) {
    const z = zc - 16 + r() * 32;
    if (z > zc - 11 && z < zc + 10) continue;
    geos.push(column(0.6 + r() * 3.5, new THREE.Vector3(FALLS.curtainX - 1.5 + r() * 2.5, lipY - 1.2 - r() * 1.2, z), 0.08 + r() * 0.2, false, 700 + i));
  }
  // Frozen splash lumps around the foot.
  for (let i = 0; i < 9; i++) {
    const g = new THREE.SphereGeometry(1, 14, 8);
    const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      const x = pp.getX(k), y = pp.getY(k), z = pp.getZ(k);
      const f = 1 + 0.25 * noise.noise2(x * 2 + i, z * 2 + y);
      pp.setXYZ(k, x * f, y * f, z * f);
    }
    const sc = 1 + r() * 1.8;
    g.scale(sc * (0.8 + r() * 0.5), sc * 0.6, sc);
    g.translate(FALLS.curtainX - 2.5 + (r() - 0.5) * 4, poolY + 0.2, zc + (r() - 0.5) * 16);
    g.computeVertexNormals();
    geos.push(g);
  }
  // Splash mound at the pool.
  {
    const g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.22 * noise.fbm2(x * 2 + 5, z * 2, 3);
      p.setXYZ(i, x * k, y * (0.9 + 0.3 * noise.noise2(x * 4, z * 4)), z * k);
    }
    g.scale(6.5, 3.2, 10.5);
    g.translate(FALLS.curtainX - 1.0, poolY - 0.4, zc);
    g.computeVertexNormals();
    geos.push(g);
  }
  for (const g of geos) { g.deleteAttribute('uv'); }
  const iceGeo = mergeGeometries(geos, false);
  const ice = new THREE.Mesh(iceGeo, mat);
  ice.name = 'fallsIce';
  ice.castShadow = true;
  ice.receiveShadow = true;
  group.add(ice);

  // Cave slot: faint blue crystals deep inside hint at the ice cave.
  {
    const cg = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.ConeGeometry(0.12 + r() * 0.25, 0.8 + r() * 1.8, 5);
      g.rotateZ((r() - 0.5) * 0.9);
      g.rotateX((r() - 0.5) * 0.9);
      g.translate(FALLS.x + 4 + r() * 3.5, FALLS.bottom + 0.6 + r() * 2.5, FALLS.caveZ + (r() - 0.5) * 6);
      cg.push(g);
    }
    const crystals = new THREE.Mesh(mergeGeometries(cg), new THREE.MeshStandardMaterial({
      color: 0x9fd8ff, emissive: 0x3a9ccc, emissiveIntensity: 0.9, roughness: 0.2,
    }));
    crystals.name = 'caveCrystals';
    group.add(crystals);
  }

  // Thaw: a sheet of falling water fades in as the ice melts away.
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xc8dde8, roughness: 0.15, transparent: true, opacity: 0, depthWrite: false });
  addCompileHook(sheetMat, 'mzFallSheet', (shader) => {
    shader.uniforms.uTime = G.uniforms.uTime;
    shader.uniforms.uMzFallThaw = uni.thaw;
    shader.vertexShader = 'varying vec2 vMzUv2;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMzUv2 = uv;');
    shader.fragmentShader = 'varying vec2 vMzUv2;\nuniform float uTime;\nuniform float uMzFallThaw;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float st = fract(vMzUv2.x * 23.0 + sin(vMzUv2.x * 61.0) * 0.3);
      float flow = fract(vMzUv2.y * 3.0 + uTime * 1.6 + st * 2.0);
      diffuseColor.a = smoothstep(0.4, 0.9, uMzFallThaw) * (0.35 + 0.45 * smoothstep(0.6, 0.95, flow) + 0.2 * st);
      diffuseColor.rgb = mix(vec3(0.5, 0.62, 0.68), vec3(0.95), smoothstep(0.7, 1.0, flow));`);
  });
  const sheetGeo = new THREE.PlaneGeometry(16, lipY - poolY, 16, 8);
  sheetGeo.rotateY(Math.PI / 2);
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.position.set(FALLS.curtainX - 0.6, (lipY + poolY) / 2, zc);
  sheet.visible = false;
  group.add(sheet);

  G.scene.add(group);

  const info = {
    lip: new THREE.Vector3(FALLS.curtainX, lipY + 1.5, zc),
    base: new THREE.Vector3(FALLS.curtainX - 2, poolY, zc),
    caveMouth: { x: FALLS.x + 1, y: FALLS.bottom + 0.3, z: FALLS.caveZ, w: FALLS.caveW * 2 - 3, h: lipY - FALLS.bottom - 1, depth: 6, yaw: -Math.PI / 2 },
  };
  void W;
  return {
    group, info,
    setThaw(t) {
      uni.thaw.value = t;
      const k = 1 - THREE.MathUtils.smoothstep(t, 0.35, 0.95);
      ice.scale.set(1, Math.max(0.02, k), 1);
      ice.position.y = (lipY + 0.6) * (1 - ice.scale.y);
      ice.visible = k > 0.02;
      sheet.visible = t > 0.4;
    },
    update() {
      const alt = G.time?.sunAltitude ?? 0.3;
      uni.light.value = THREE.MathUtils.clamp(alt * 3 + 0.25, 0.06, 1);
    },
  };
}
