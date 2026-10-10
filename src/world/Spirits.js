// Sky spirits (platnicy): translucent jellyfish of light drifting over the valley. Slavic folk
// call them cloud herders; here they are simply there, calm and a little uncanny. Nobody
// remarks on them. They are ambient: no collision, no interaction.
//
// Rendering: one instanced mesh per species and level of detail (about a dozen draw calls in
// all), a custom premultiplied-alpha shader (spirits/shaders.js) that is a pearly glass layer
// by day and the light itself at night, fogged with the game's own fog functions. Every motion
// that can live on the GPU does (bell pulse, filament lag and ripple, spin). The CPU only keeps
// each spirit's drift: wind, heading, altitude over the ground, weather and time of day.
//
// Public (G.spirits):
//   near(x, z, r)   active spirits within r meters (horizontal) of the point:
//                   [{ x, y, z, species, size, school }]  (a school counts once)
//   stats           { visible, drawCalls, triangles, active } for the last frame
//   enabled         set false to hide them all
//   density         0..2 multiplier on how many are out (default 1)
//   species         species ids
// Reads: G.atmosphere (sky colors, exposure), G.weather (snow, wind), uNight, uWind.
// URL: &spirits=0 disables, &spirits=N scales the density.
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { FOG_UNIFORM_NAMES } from '../render/fogChunk.js';
import { rng, clamp, smoothstep, lerp } from '../core/util.js';
import { LOC, lakeEllipse } from './layout.js';
import { buildGeometry } from './spirits/geometry.js';
import { SPECIES } from './spirits/species.js';
import { VERT, FRAG } from './spirits/shaders.js';

const STRIDE = 22;
const TAU = Math.PI * 2;
const MIN_PX = 1.35;

export async function init(G) {
  if (G.params.get('spirits') === '0') return;
  createSpirits(G, {});
}

// opts (used by the preview scene): { solo: speciesId, soloPos: [x, y, z], soloScale, soloPhase,
//   soloYaw, count: n for the solo species, seed }
export function createSpirits(G, opts = {}) {
  const U = G.uniforms;
  const scene = G.scene;
  const rand = rng(opts.seed || 20260101);
  const densityParam = parseFloat(G.params.get('spirits'));
  const hasGrid = () => !!G.world?.grid;
  // quality scales how many are out and how soon they drop to the cheaper models
  const qMul = { low: 0.5, medium: 0.8, high: 1 }[G.quality] ?? 1;

  // ---- shared uniforms ----------------------------------------------------------------
  const shared = {
    uTime: opts.time != null ? { value: opts.time } : U.uTime,
    uInvExp: { value: 1 },
    uDark: { value: 0 },
    uGlowGain: { value: 1 },
    uHor: { value: new THREE.Color(0.7, 0.8, 1) },
    uZen: { value: new THREE.Color(0.1, 0.2, 0.5) },
    uGround: { value: new THREE.Color(0.5, 0.5, 0.55) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uSkyGlow: { value: new THREE.Color(0, 0, 0) },
    uPixelScale: { value: 800 },
    uMinPx: { value: MIN_PX },
  };

  // ---- species: materials, geometry per LOD, meshes ---------------------------------------
  const species = [];
  SPECIES.forEach((def, si) => {
    if (opts.solo && def.id !== opts.solo) return;
    const sh = def.shader;
    const uniforms = {
      ...shared,
      uKind: { value: def.kind },
      uP0: { value: new THREE.Vector4(...sh.p0) },
      uP1: { value: new THREE.Vector4(...sh.p1) },
      uP2: { value: new THREE.Vector4(...sh.p2) },
      uP3: { value: new THREE.Vector4(...sh.p3) },
      uP4: { value: new THREE.Vector4(...(sh.p4 || [0, 0, 0, 0])) },
      uF0: { value: new THREE.Vector4(...sh.f0) },
      uF1: { value: new THREE.Vector4(...sh.f1) },
      uF2: { value: new THREE.Vector4(...(sh.f2 || [0.14, 0.4, 0, 0])) },
      uS: { value: new THREE.Vector4(sh.s?.[0] ?? 1, sh.s?.[1] ?? 0, sh.s?.[2] ?? 0.55, sh.s?.[3] ?? 0) },
      uM: { value: new THREE.Vector4(0, sh.m?.[1] ?? 1, sh.m?.[2] ?? 0, 0) },
      uF3: { value: new THREE.Vector4(...(sh.f3 || [1, 1, 1, 1])) },
      uPane0: { value: new THREE.Color(def.panes?.[0] || '#ffffff') },
      uPane1: { value: new THREE.Color(def.panes?.[1] || '#ffffff') },
      uPane2: { value: new THREE.Color(def.panes?.[2] || '#ffffff') },
      uPane3: { value: new THREE.Color(def.panes?.[3] || '#ffffff') },
      uBright: { value: sh.bright },
    };
    for (const n of FOG_UNIFORM_NAMES) uniforms[n] = U[n];
    const material = new THREE.ShaderMaterial({
      name: `mz-spirit-${def.id}`,
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    const items = [];
    const total = opts.solo ? (opts.count || 1) : def.count;
    const cap = total * (def.school ? def.school[1] : 1) + 2;
    const lods = (def.lods || [{ detail: 1, ratio: def.lodRatio }, { detail: 0.5, ratio: def.lodRatio * 3 }, { detail: 0.28, ratio: Infinity }]).map((l, li) => {
      const recipe = l.glowOnly ? { profile: 'dome', core: def.recipe.core } : def.recipe;
      const geo = buildGeometry(recipe, l.detail ?? 1, 11 + si * 7 + li);
      const arr = new Float32Array(cap * STRIDE);
      const ibuf = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1);
      ibuf.setUsage(THREE.DynamicDrawUsage);
      for (const [name, size, off] of [['iPos', 4, 0], ['iShape', 4, 4], ['iVar', 4, 8], ['iDrag', 4, 12], ['iCol0', 3, 16], ['iCol1', 3, 19]]) {
        geo.setAttribute(name, new THREE.InterleavedBufferAttribute(ibuf, size, off));
      }
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `spirits-${def.id}-${li}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 20 + (def.order ?? 3) * 3 + li * 0.1;
      mesh.visible = false;
      scene.add(mesh);
      return {
        ratio: l.ratio, mesh, geo, arr, ibuf, n: 0, tris: geo.userData.tris, avg: 0,
        dist: new Float32Array(cap), order: new Uint16Array(cap), tmp: new Float32Array(cap * STRIDE),
      };
    });
    species.push({ def, si, material, uniforms, items, lods, total });
  });

  // ---- population -------------------------------------------------------------------------
  const palette = (def) => def.palette.map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)]);
  const _hsl = { h: 0, s: 0, l: 0 };
  const tint = (c, dh, dl) => {
    c.getHSL(_hsl);
    return new THREE.Color().setHSL(((_hsl.h + dh) % 1 + 1) % 1, _hsl.s, clamp(_hsl.l * dl, 0, 1));
  };

  function density(x, z) {
    let w = 0.07;
    w += 1.0 * (1 - smoothstep(0.85, 1.4, lakeEllipse(x, z)));
    w += 0.9 * (1 - smoothstep(40, 120, Math.hypot(x - LOC.marsh.x, z - LOC.marsh.z)));
    w += 1.0 * (1 - smoothstep(30, 95, Math.hypot(x - LOC.island.x, z - LOC.island.z)));
    w *= 0.2 + 0.8 * smoothstep(60, 190, Math.hypot(x - LOC.village.x, z - LOC.village.z));
    return w;
  }
  function sampleHome() {
    for (let k = 0; k < 400; k++) {
      const x = rand.range(-600, 600), z = rand.range(-600, 600);
      if (rand() * 2.2 < density(x, z)) return [x, z];
    }
    return [40, -120];
  }
  function sampleLake() {
    for (let k = 0; k < 400; k++) {
      const x = LAKE_CENTER[0] + rand.range(-230, 230), z = LAKE_CENTER[1] + rand.range(-140, 140);
      if (lakeEllipse(x, z) < 0.72 && !inKeepOut(x, z, 6)) return [x, z];
    }
    return [40, -120];
  }
  const LAKE_CENTER = [40, -120];
  // Places a low (night, over the ice) spirit must stay away from: the bell tower, the ritual
  // ring, the ice-fishing camp, the stone circle isle.
  const KEEP_OUT = [
    [LOC.bellTower.x, LOC.bellTower.z, 26], [LOC.ritual.x, LOC.ritual.z, 26],
    [LOC.iceCamp.x, LOC.iceCamp.z, 24], [LOC.island.x, LOC.island.z, 44],
  ];
  function inKeepOut(x, z, pad = 0) {
    for (const k of KEEP_OUT) if (Math.hypot(x - k[0], z - k[1]) < k[2] + pad) return true;
    return false;
  }

  for (const sp of species) {
    const { def } = sp;
    const pal = palette(def);
    const lowCount = opts.solo ? 0 : { swarm: 4, comb: 3, saucer: 2, bell: 1 }[def.id] || 0;
    for (let i = 0; i < sp.total; i++) {
      const low = opts.solo ? (opts.soloPos?.[1] ?? 40) < 12 : i >= sp.total - lowCount;
      const pair = pal[Math.floor(rand() * pal.length)];
      const dh = rand.range(-0.03, 0.03), dl = rand.range(0.9, 1.1);
      const [hx, hz] = opts.solo ? [opts.soloPos?.[0] ?? 0, opts.soloPos?.[2] ?? 0]
        : def.circuit ? [def.circuit.cx, def.circuit.cz] : low ? sampleLake() : sampleHome();
      const size = def.size[0] + (def.size[1] - def.size[0]) * rand();
      const it = {
        sp, low,
        hx, hz,
        ox: 0, oz: 0,
        x: hx, y: 0, z: hz,
        yaw: opts.solo ? (opts.soloYaw ?? 0) : rand() * TAU,
        scale: opts.solo && opts.soloScale ? opts.soloScale : (low ? size * 0.62 : size),
        phase: opts.solo && opts.soloPhase != null ? opts.soloPhase : rand(),
        rate: def.rate[0] + (def.rate[1] - def.rate[0]) * rand(),
        seed: rand(),
        c0: tint(pair[0], dh, dl), c1: tint(pair[1], dh * 1.5, dl),
        bright: rand.range(0.88, 1.12),
        tentFrac: def.tentFrac[0] + (def.tentFrac[1] - def.tentFrac[0]) * rand(),
        tentLen: def.tentLen[0] + (def.tentLen[1] - def.tentLen[0]) * rand(),
        rank: def.circuit ? 0 : rand(), // the big one is always out (the fog hides it in a blizzard)
        circ: def.circuit || null,
        altBase: low ? rand.range(4, 10) : def.alt[0] + (def.alt[1] - def.alt[0]) * Math.pow(rand(), 1.7),
        ySm: NaN, gSm: 0, gTimer: rand() * 0.5,
        fade: 0,
        swim: def.speed * rand.range(0.7, 1.2),
        turn: rand.range(0.6, 1.4),
        wph: rand() * TAU,
        coupling: low ? 0.25 : rand.range(0.55, 0.9),
        dragX: 0, dragZ: 0,
        pitch: 0, pitchBase: def.id === 'comb' ? rand.range(-0.35, 0.35) : 0,
        mem: null,
        vis: false, camD: 0,
      };
      if (opts.solo) {
        it.y = opts.soloPos?.[1] ?? 40;
        it.ySm = it.y;
        it.rank = 0;
        it.coupling = 0;
      }
      if (def.school) {
        const n = rand.int(def.school[0], def.school[1]);
        it.mem = [];
        for (let m = 0; m < n; m++) {
          // loose ellipsoid cloud around the school's center, in meters at scale 1 (x size)
          const r = Math.cbrt(rand());
          const th = rand() * TAU, ph = Math.acos(rand.range(-1, 1));
          it.mem.push({
            bx: Math.sin(ph) * Math.cos(th) * r * 9, by: Math.cos(ph) * r * 3.2, bz: Math.sin(ph) * Math.sin(th) * r * 9,
            f1: rand.range(0.05, 0.14), f2: rand.range(0.05, 0.12), f3: rand.range(0.05, 0.14),
            p1: rand() * TAU, p2: rand() * TAU, p3: rand() * TAU,
            phase: rand(), rate: rand.range(-0.08, 0.08), size: rand.range(0.8, 1.25),
            seed: rand(), br: rand.range(0.8, 1.2),
          });
        }
      }
      sp.items.push(it);
    }
  }

  // ---- ground sampling ----------------------------------------------------------------------
  function groundAt(x, z) {
    return hasGrid() ? G.world.heightAt(x, z) : 0;
  }
  const windVel = new THREE.Vector2();

  function minClear(x, z, low) {
    if (low) return 3;
    return lakeEllipse(x, z) < 0.9 ? 12 : 24;
  }

  // Equilibrium drift offset for the current wind (so a spirit starts where it would be).
  function windOffset(it) {
    const w = U.uWind.value;
    const spd = 0.5 + 2.2 * w.z + 1.2 * w.w;
    return [w.x * spd * it.coupling * 0.7 * TAU_RELAX, w.y * spd * it.coupling * 0.7 * TAU_RELAX];
  }
  const TAU_RELAX = 150;

  // The cathedral: one behemoth that walks a long ellipse round the valley, high above the
  // ground under its bell (never below `minAlt`, never closer than `clearance` to the highest
  // ground inside its footprint). Heading and speed come from the circuit, not from the wind.
  const cathPos = { x: 0, z: 0, vx: 0, vz: 0 };
  const cathPhase = Number.isFinite(parseFloat(G.params.get('cath'))) ? parseFloat(G.params.get('cath')) : null;
  function circuitAt(c, t, out) {
    const a = ((cathPhase ?? c.start) + t / c.period) * TAU;
    out.x = c.cx + c.rx * Math.cos(a);
    out.z = c.cz + c.rz * Math.sin(a);
    const w = TAU / c.period;
    out.vx = -c.rx * Math.sin(a) * w;
    out.vz = c.rz * Math.cos(a) * w;
    return out;
  }
  function footprintGround(it) {
    if (!hasGrid()) return 0;
    // the body is long (about 5 radii) and its threads hang all round: sample two rings
    let g = groundAt(it.x, it.z);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      g = Math.max(g, groundAt(it.x + Math.cos(a) * it.scale * 1.3, it.z + Math.sin(a) * it.scale * 1.3), groundAt(it.x + Math.cos(a) * it.scale * 2.7, it.z + Math.sin(a) * it.scale * 2.7) - it.scale * 0.3);
    }
    return g;
  }

  for (const sp of species) {
    for (const it of sp.items) {
      if (opts.solo) continue;
      if (it.circ) {
        circuitAt(it.circ, G.clock.elapsed, cathPos);
        it.x = cathPos.x; it.z = cathPos.z;
        it.gSm = footprintGround(it);
        it.ySm = Math.max(it.circ.minAlt, it.gSm + it.circ.clearance);
        it.y = it.ySm;
        continue;
      }
      const [ox, oz] = windOffset(it);
      it.ox = ox; it.oz = oz;
      it.x = it.hx + ox; it.z = it.hz + oz;
      it.gSm = groundAt(it.x, it.z);
      it.ySm = it.low ? it.altBase : it.gSm + Math.max(it.altBase, minClear(it.x, it.z, false));
      it.y = it.ySm;
    }
  }

  // ---- frame update -------------------------------------------------------------------------
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const camInv = new THREE.Matrix4();
  const sizeV = new THREE.Vector2();
  const S = {
    enabled: true,
    density: Number.isFinite(densityParam) && densityParam > 0 ? densityParam : 1,
    species: species.map((s) => s.def.id),
    stats: { visible: 0, drawCalls: 0, triangles: 0, active: 0 },
    items: species,
    shared,
    near(x, z, r) {
      const out = [];
      for (const sp of species) {
        for (const it of sp.items) {
          if (it.fade < 0.3) continue;
          if (Math.hypot(it.x - x, it.z - z) <= r) out.push({ x: it.x, y: it.y, z: it.z, species: sp.def.id, size: it.scale, school: !!it.mem });
        }
      }
      return out;
    },
    dispose() {
      for (const sp of species) {
        for (const l of sp.lods) { scene.remove(l.mesh); l.geo.dispose(); }
        sp.material.dispose();
      }
      if (glow) { scene.remove(glow); glow.dispose?.(); }
      remove();
    },
  };
  G.spirits = S;

  // ---- the cathedral's light on the world --------------------------------------------------
  // A faint pale point light under the bell (no shadows, no falloff inside its range) so the snow
  // and the roofs under it take a little of its glow, and a glow in the sky shader so the clouds
  // near it are lit from within. Both scale with the night, the pulse and the weather.
  const cathItem = species.map((sp) => sp.items[0]).find((it) => it && it.circ) || null;
  let glow = null;
  if (cathItem && !opts.solo) {
    glow = new THREE.PointLight(0xbfd2ff, 0, 1900, 0);
    glow.name = 'spirit-cathedral-glow';
    scene.add(glow);
  }
  const pulse01 = (p) => (p < 0.26 ? smoothstep(0, 1, p / 0.26) : Math.pow(1 - smoothstep(0, 1, (p - 0.26) / 0.74), 1.5));
  Object.defineProperty(S, 'cathedral', {
    get: () => (cathItem ? {
      x: cathItem.x, y: cathItem.y, z: cathItem.z, radius: cathItem.scale,
      pulse: pulse01((G.clock.elapsed * cathItem.rate + cathItem.phase) % 1),
    } : null),
  });
  const glowDir = new THREE.Vector3();

  const drawn = [];
  let seenTimer = 0;
  let seenSeconds = 0;
  const camPos = new THREE.Vector3();

  function weatherFactors() {
    const W = G.weather?.params;
    const night = U.uNight.value;
    const overcast = W ? W.overcast : 0;
    const snow = W ? W.snowfall : 0;
    const clear = 1 - overcast;
    return { night, snow, clear };
  }

  function updateSky() {
    const A = G.atmosphere;
    const look = A?.look;
    const exp = A?.grade?.exposure || 1;
    shared.uInvExp.value = 1 / clamp(exp, 0.25, 6);
    if (look) {
      shared.uHor.value.copy(look.hor);
      shared.uZen.value.copy(look.zen);
      shared.uGround.value.copy(look.hor).multiplyScalar(0.8);
      shared.uSkyGlow.value.copy(look.glow).multiplyScalar(0.5);
      shared.uLightDir.value.copy(A.keyDir);
      const lum = (look.hor.r * 0.3 + look.hor.g * 0.59 + look.hor.b * 0.11) * exp;
      shared.uDark.value = clamp(Math.max(smoothstep(0.30, 0.05, lum), U.uNight.value * 0.9), 0, 1);
    } else {
      shared.uDark.value = U.uNight.value;
    }
    shared.uGlowGain.value = lerp(0.36, 1, shared.uDark.value);
    const h = G.renderer.getDrawingBufferSize(sizeV).y;
    shared.uPixelScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov) * 0.5));
  }

  function liftCurve(p) {
    // fast rise during the contraction, slow sink the rest of the cycle
    if (p < 0.35) { const t = p / 0.35; return t * t * (3 - 2 * t); }
    const t = (p - 0.35) / 0.65;
    return 1 - t * t * (3 - 2 * t);
  }
  function thrustCurve(p) {
    return smoothstep(0.0, 0.28, p) * (1 - smoothstep(0.3, 0.8, p));
  }

  const upd = (dt, tReal) => {
    const t = opts.time != null ? opts.time : tReal;
    const cam = G.camera;
    cam.updateMatrixWorld();
    camPos.setFromMatrixPosition(cam.matrixWorld);
    camInv.copy(cam.matrixWorld).invert();
    projScreen.multiplyMatrices(cam.projectionMatrix, camInv);
    frustum.setFromProjectionMatrix(projScreen);
    updateSky();

    const w = U.uWind.value;
    const wspd = 0.5 + 2.2 * w.z + 1.2 * w.w;
    windVel.set(w.x * wspd, w.y * wspd);
    const { night, snow, clear } = weatherFactors();
    const dens = S.enabled ? S.density : 0;
    const frac = (0.62 + 0.38 * night * clear) * (1 - smoothstep(0.25, 0.8, snow)) * Math.min(dens, 1.6) * qMul;
    const lowOk = night > 0.6 && clear > 0.5 && snow < 0.2 ? 1 : 0;
    const pull = smoothstep(0.35, 0.9, snow);
    const fadeStep = G.shot ? 1 : Math.min(1, dt * 0.35);
    let active = 0, visible = 0, tris = 0, calls = 0;
    drawn.length = 0;
    const relax = 1 - Math.exp(-dt / TAU_RELAX);
    const planes = frustum.planes;

    for (const sp of species) {
      const def = sp.def;
      for (const l of sp.lods) l.n = 0;
      for (const it of sp.items) {
        const want = opts.solo ? 1 : it.circ ? (dens > 0 ? 1 : 0) : (it.low ? (it.rank < 0.9 && lowOk ? 1 : 0) : (it.rank < frac ? 1 : 0));
        it.fade += (want - it.fade) * fadeStep;
        if (Math.abs(want - it.fade) < 0.004) it.fade = want;
        if (it.fade <= 0.001) { it.vis = false; continue; }
        active++;

        // ---- drift (CPU): wind, swimming, wander, altitude
        const p = (t * it.rate + it.phase) % 1;
        if (it.circ && !opts.solo) {
          circuitAt(it.circ, t, cathPos);
          it.x = cathPos.x; it.z = cathPos.z;
          // the long body flies lengthwise, the fat head (at -x) first, wandering a little off its heading
          it.yaw = Math.atan2(cathPos.vz, -cathPos.vx) + 0.28 * Math.sin(t * 0.0031 + 1.3) + 0.12 * Math.sin(t * 0.0083);
          it.gTimer -= dt;
          if (it.gTimer <= 0) { it.gTimer = 1; it.gSm = footprintGround(it); }
          const goal = Math.max(it.circ.minAlt, it.gSm + it.circ.clearance);
          it.ySm += (goal - it.ySm) * (1 - Math.exp(-dt / 40));
        } else if (!opts.solo) {
          const sway = Math.sin(t * 0.017 + it.wph);
          const desired = Math.atan2(windVel.x, windVel.y) + 1.4 * sway;
          let dy = desired - it.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          it.yaw += dy * Math.min(1, dt * 0.12 * it.turn);
          const sw = it.swim * (0.25 + 0.75 * thrustCurve(p));
          const sx = Math.sin(it.yaw) * sw, sz = Math.cos(it.yaw) * sw;
          const wx = windVel.x * it.coupling * 0.7, wz = windVel.y * it.coupling * 0.7;
          it.ox += (wx + sx) * dt - it.ox * relax;
          it.oz += (wz + sz) * dt - it.oz * relax;
          it.x = it.hx + it.ox + Math.sin(t * 0.021 + it.wph) * 25;
          it.z = it.hz + it.oz + Math.cos(t * 0.017 + it.wph * 1.7) * 25;
          if (it.low) {
            // stay over the ice and clear of the set pieces
            for (const k of KEEP_OUT) {
              const ddx = it.x - k[0], ddz = it.z - k[1], dd = Math.hypot(ddx, ddz);
              if (dd < k[2]) { it.ox += (ddx / (dd + 0.01)) * dt * 8; it.oz += (ddz / (dd + 0.01)) * dt * 8; }
            }
            if (lakeEllipse(it.x, it.z) > 0.78) {
              it.ox += (LAKE_CENTER[0] - it.x) * dt * 0.05; it.oz += (LAKE_CENTER[1] - it.z) * dt * 0.05;
            }
          }
          // altitude: above the highest ground ahead, never inside terrain or roofs
          it.gTimer -= dt;
          if (it.gTimer <= 0) {
            it.gTimer = 0.3;
            let g = groundAt(it.x, it.z);
            if (!it.low && hasGrid()) {
              const ux = windVel.x / (Math.hypot(windVel.x, windVel.y) + 1e-3), uz = windVel.y / (Math.hypot(windVel.x, windVel.y) + 1e-3);
              g = Math.max(g, groundAt(it.x + ux * 30, it.z + uz * 30), groundAt(it.x + ux * 70, it.z + uz * 70));
            }
            it.gSm = g;
          }
          let goalAlt;
          if (it.low) goalAlt = it.altBase + Math.sin(t * 0.05 + it.wph) * 1.2;
          else goalAlt = Math.max(it.altBase, minClear(it.x, it.z, false)) * (1 + 0.12 * Math.sin(t * 0.011 + it.wph)) + pull * (150 + 200 * it.rank);
          // Long tentacles want room below the bell (they are also shortened to fit, see fitLen).
          if (!it.low) goalAlt = Math.max(goalAlt, 0.6 * (it.scale * def.extent * 1.2 * it.tentLen + 6));
          if (!it.low && Math.hypot(it.x - LOC.bellTower.x, it.z - LOC.bellTower.z) < 30) goalAlt = Math.max(goalAlt, 34);
          const goal = it.gSm + goalAlt;
          const tau = goal > it.ySm ? 1.5 : 7;
          it.ySm += (goal - it.ySm) * (1 - Math.exp(-dt / tau));
        } else {
          it.x = it.hx; it.z = it.hz; it.ySm = it.ySm || it.y;
        }
        const lift = liftCurve(p) * (opts.solo ? 0 : it.circ ? 0.05 : 0.35) * it.scale;
        it.y = it.ySm + lift;

        // trailing direction for the filaments (opposite the swim, stronger on the jet)
        const sw = it.swim * (0.25 + 0.75 * thrustCurve(p));
        let tx = -Math.sin(it.yaw) * sw * 0.7, tz = -Math.cos(it.yaw) * sw * 0.7;
        if (it.circ && !opts.solo) {
          // the threads trail behind the slow flight
          const vl = Math.hypot(cathPos.vx, cathPos.vz) || 1;
          tx = -cathPos.vx / vl * 0.28; tz = -cathPos.vz / vl * 0.28;
        }
        it.dragX += (tx - it.dragX) * Math.min(1, dt * 1.5);
        it.dragZ += (tz - it.dragZ) * Math.min(1, dt * 1.5);
        it.pitch = it.circ ? 0 : it.pitchBase + 0.1 * Math.sin(t * 0.13 + it.wph) + thrustCurve(p) * 0.05;

        // ---- cull and write instances
        const reach = it.circ ? it.scale * 4.4 : it.scale * (1 + def.extent * 0.5) + (it.mem ? 14 : 0);
        const cx = it.x, cy = it.y - it.scale * (it.circ ? 1.6 : def.extent * 0.35), cz = it.z;
        const dx = cx - camPos.x, dy2 = cy - camPos.y, dz = cz - camPos.z;
        const d = Math.sqrt(dx * dx + dy2 * dy2 + dz * dz);
        it.camD = d;
        if (d - reach > def.maxDist) { it.vis = false; continue; }
        let inside = true;
        for (let k = 0; k < 6; k++) {
          const pl = planes[k];
          if (pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -reach) { inside = false; break; }
        }
        if (!inside) { it.vis = false; continue; }
        it.vis = true;
        visible++;

        // level of detail from apparent size
        let li = 0;
        const lods = sp.lods;
        while (li < lods.length - 1 && d > lods[li].ratio * it.scale * qMul) li++;
        const L = lods[li];

        if (it.mem) {
          for (const m of it.mem) {
            const mx = it.x + m.bx * 0.8 + Math.sin(t * m.f1 + m.p1) * 1.6;
            let my = it.y + m.by * 0.8 + Math.sin(t * m.f2 + m.p2) * 0.9;
            if (it.low) my = Math.max(my, 2.4 + it.scale * def.extent * 1.1);
            const mz = it.z + m.bz * 0.8 + Math.sin(t * m.f3 + m.p3) * 1.6;
            const md = Math.hypot(mx - camPos.x, my - camPos.y, mz - camPos.z);
            let ml = 0;
            while (ml < lods.length - 1 && md > lods[ml].ratio * it.scale * m.size * qMul) ml++;
            const LM = lods[ml];
            if (LM.n >= LM.arr.length / STRIDE) continue;
            writeInstance(LM, mx, my, mz, it.yaw + Math.sin(t * 0.05 + m.p1) * 0.4, it.scale * m.size, m.phase + 0, it.rate * (1 + m.rate), it.fade, it.tentFrac, it.tentLen, m.seed, it.bright * m.br, it.dragX, it.dragZ, it.pitch, it.c0, it.c1, md);
          }
        } else {
          writeInstance(L, it.x, it.y, it.z, it.yaw, it.scale, it.phase, it.rate, it.fade, it.tentFrac, fitLen(it), it.seed, it.bright, it.dragX, it.dragZ, it.pitch, it.c0, it.c1, d);
        }
      }
      for (const l of sp.lods) {
        l.mesh.visible = l.n > 0;
        l.geo.instanceCount = l.n;
        if (l.n > 0) {
          sortFarToNear(l);
          drawn.push(l);
          l.ibuf.clearUpdateRanges();
          l.ibuf.addUpdateRange(0, l.n * STRIDE);
          l.ibuf.needsUpdate = true;
          tris += l.n * l.tris;
          calls++;
        }
      }
    }
    // Draw the meshes whose instances are farthest first (the order of the transparent queue).
    drawn.sort((a, b) => b.avg - a.avg);
    for (let i = 0; i < drawn.length; i++) drawn[i].mesh.renderOrder = 20 + i;
    if (cathItem) {
      const night = smoothstep(0.1, 0.9, shared.uDark.value);
      const pr = pulse01((t * cathItem.rate + cathItem.phase) % 1);
      const overcast = G.weather?.params?.overcast || 0;
      const k = night * (1 - 0.6 * overcast) * cathItem.fade * (S.enabled ? 1 : 0);
      if (glow) {
        const indoors = G.world?.indoors?.(camPos.x, camPos.z) ? 1 : 0;
        glow.position.set(cathItem.x, cathItem.y - cathItem.scale * 1.6, cathItem.z);
        glow.intensity = (G.params.has('cathlight') ? parseFloat(G.params.get('cathlight')) : 0.5) * k * (0.7 + 0.3 * pr) * (1 - indoors);
      }
      const su = G.sky?.uniforms?.uSpiritGlow;
      if (su) {
        glowDir.set(cathItem.x - camPos.x, cathItem.y + cathItem.scale * 0.3 - camPos.y, cathItem.z - camPos.z).normalize();
        su.value.set(glowDir.x, glowDir.y, glowDir.z, k * (0.75 + 0.25 * pr));
      }
    }
    S.stats.visible = visible;
    S.stats.active = active;
    S.stats.triangles = tris;
    S.stats.drawCalls = calls;

    // The first time one drifts close, the old people's word for them is worth writing down.
    if (!G.shot && G.state) {
      seenTimer += dt;
      if (seenTimer > 2) {
        seenTimer = 0;
        if (!G.state.flag('planetnicy_seen')) {
          let near = 0;
          for (const sp of species) for (const it of sp.items) if (it.vis && it.camD < 120 && it.fade > 0.8) near++;
          if (near > 0) {
            seenSeconds += 2;
            if (seenSeconds >= 6) G.state.set('planetnicy_seen', true);
          }
        }
      }
    }
  };

  // Tentacles shorten to fit the room below the bell, so they never reach the player's head,
  // the ice, a roof or the trees.
  function fitLen(it) {
    if (it.circ) {
      // the cathedral's threads stop well above the lake and the ground under it
      const room = Math.max(0, it.y - (it.gSm + 70));
      return clamp(room / (it.scale * it.sp.def.extent), 0.3, 1);
    }
    const room = Math.max(0, it.y - (it.low ? 2.4 : it.gSm + 6));
    return Math.min(it.tentLen, room / (it.scale * it.sp.def.extent * 1.2));
  }

  function writeInstance(L, x, y, z, yaw, scale, phase, rate, fade, tentFrac, tentLen, seed, bright, dragX, dragZ, pitch, c0, c1, dist) {
    const a = L.arr;
    let o = L.n * STRIDE;
    a[o++] = x; a[o++] = y; a[o++] = z; a[o++] = yaw;
    a[o++] = scale; a[o++] = phase % 1; a[o++] = rate; a[o++] = fade;
    a[o++] = tentFrac; a[o++] = tentLen; a[o++] = seed; a[o++] = bright;
    a[o++] = dragX; a[o++] = 0; a[o++] = dragZ; a[o++] = pitch;
    a[o++] = c0.r; a[o++] = c0.g; a[o++] = c0.b;
    a[o++] = c1.r; a[o++] = c1.g; a[o++] = c1.b;
    L.dist[L.n] = dist;
    L.n++;
  }

  // Far to near inside one draw call, so overlapping spirits blend in the right order and nothing
  // flickers as others enter and leave the view (the buffer is compacted every frame).
  function sortFarToNear(L) {
    const n = L.n;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += L.dist[i];
    L.avg = n ? sum / n : 0;
    if (n < 2) return;
    const idx = L.order, dist = L.dist;
    for (let i = 0; i < n; i++) idx[i] = i;
    for (let i = 1; i < n; i++) {
      const v = idx[i], dv = dist[v];
      let j = i - 1;
      while (j >= 0 && dist[idx[j]] < dv) { idx[j + 1] = idx[j]; j--; }
      idx[j + 1] = v;
    }
    L.tmp.set(L.arr.subarray(0, n * STRIDE));
    for (let i = 0; i < n; i++) L.arr.set(L.tmp.subarray(idx[i] * STRIDE, idx[i] * STRIDE + STRIDE), i * STRIDE);
  }

  const remove = G.addSystem('spirits', upd, ORDER.atmosphere + 3);
  return S;
}
