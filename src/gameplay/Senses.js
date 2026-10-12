// Hunter senses (G.senses). Hold RMB with the sword sheathed: G.uniforms.uSenses ramps to 1
// (PostFX desaturates and pulses), clue objects glow, trails appear as glowing footprints, drag
// marks and drifting motes on the ground, and clues in range become examinable through
// G.interact. Echo clues glow pale turquoise and play a cutscene when examined.
//
//   G.senses.addClue({ id, pos, radius: 1.5, kind: 'clue' | 'echo', object, label, enabled,
//                      once: true, cutscene, line, onExamine: async (clue) => {} }) -> id
//   G.senses.addTrail({ id, points: [[x, z], ...], kind: 'footprints' | 'drag' | 'scent', enabled }) -> id
//   G.senses.removeClue(id)  G.senses.removeTrail(id)  G.senses.clue(id)  G.senses.trail(id)
//   G.senses.active (bool)   G.senses.level (0..1)
//   G.senses.force(true | false | null)   scripted override (cutscenes), null hands back to input
//   G.senses.pulse()         send a pulse ring out from the player now
// Clue extras: `cutscene` (echo: cutscene id to play), `line` (a Vesna subtitle after examining).
// Emits 'senses:on', 'senses:off', 'clue:examine' { id }.
// Highlight: G.postfx.markClue(object, on) (the PostFX clue layer) for clues; echo objects and
// scenes without PostFX get an emissive pulse on the clue mesh (orange, turquoise for echoes).
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { damp } from '../core/util.js';

const COLORS = {
  clue: new THREE.Color(0xff7b34),
  footprints: new THREE.Color(0xff8a3d),
  drag: new THREE.Color(0xff7030),
  scent: new THREE.Color(0xff3a26),
  echo: new THREE.Color(0x9ff5ff),
};
const SHOW_RANGE = 46;
const REVEAL_RANGE = 16;

function footprintTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 7;
  // Forefoot and toe.
  g.beginPath();
  g.ellipse(32, 40, 17, 27, 0, 0, Math.PI * 2);
  g.fill();
  // Heel.
  g.beginPath();
  g.ellipse(33, 100, 13, 15, 0, 0, Math.PI * 2);
  g.fill();
  // Tread: cut a few lines so it reads as a boot print, not a blob.
  g.globalCompositeOperation = 'destination-out';
  g.shadowBlur = 0;
  g.lineWidth = 2.2;
  for (let y = 22; y < 64; y += 8) { g.beginPath(); g.moveTo(18, y); g.lineTo(46, y + 2); g.stroke(); }
  for (let y = 92; y < 112; y += 7) { g.beginPath(); g.moveTo(22, y); g.lineTo(44, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const DECAL_VS = /* glsl */`
  attribute float aPhase;
  uniform vec3 uPlayerPos;
  varying vec2 vUv;
  varying float vDist;
  varying float vPhase;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vDist = distance(wp.xz, uPlayerPos.xz);
    vPhase = aPhase;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const COMMON_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uSenses;
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  float sensesGlow(float dist, float phase) {
    float near = 1.0 - smoothstep(${(SHOW_RANGE - 18).toFixed(1)}, ${SHOW_RANGE.toFixed(1)}, dist);
    float r = fract((uTime - uPulse) / 4.5) * 64.0;
    float ring = exp(-pow((dist - r) / 2.6, 2.0)) * (1.0 - r / 64.0);
    float flow = 0.72 + 0.28 * sin(phase * 0.85 - uTime * 2.6);
    return uSenses * uReveal * near * (flow + ring * 1.6);
  }`;

const DECAL_FS = /* glsl */`
  uniform sampler2D uMap;
  ${COMMON_FS}
  varying vec2 vUv;
  varying float vDist;
  varying float vPhase;
  void main() {
    float a = texture2D(uMap, vUv).a;
    float k = a * sensesGlow(vDist, vPhase);
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor * (1.25 + k * 0.6), k);
  }`;

const RIBBON_VS = /* glsl */`
  uniform vec3 uPlayerPos;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDist = distance(wp.xz, uPlayerPos.xz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const RIBBON_FS = /* glsl */`
  ${COMMON_FS}
  varying vec2 vUv;
  varying float vDist;
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  float groove(float x, float c, float w) { return smoothstep(w, 0.0, abs(x - c)); }
  void main() {
    float y = vUv.y;
    float l = groove(vUv.x, 0.31 + 0.035 * sin(y * 0.7), 0.075 + 0.02 * n1(y * 1.3));
    float r = groove(vUv.x, 0.69 + 0.035 * sin(y * 0.63 + 1.7), 0.075 + 0.02 * n1(y * 1.1 + 5.0));
    float broken = smoothstep(0.18, 0.45, n1(y * 0.9 + 3.0));
    float smear = groove(vUv.x, 0.5, 0.42) * 0.18;
    float a = (max(l, r) * broken + smear) * smoothstep(0.0, 1.5, y);
    float k = a * sensesGlow(vDist, y);
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor * 1.3, k);
  }`;

const MOTE_VS = /* glsl */`
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uRise;
  uniform vec3 uPlayerPos;
  varying float vAlpha;
  varying float vDist;
  void main() {
    float t = fract(uTime * 0.11 + aSeed * 7.31);
    vec3 p = position;
    p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.28 + (t - 0.5) * 0.3 * sin(aSeed * 13.0);
    p.z += cos(uTime * 0.6 + aSeed * 31.0) * 0.28;
    p.y += t * uRise;
    vAlpha = sin(t * 3.14159);
    vDist = distance(p.xz, uPlayerPos.xz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + 0.4 * fract(aSeed * 91.7)) / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const MOTE_FS = /* glsl */`
  ${COMMON_FS}
  varying float vAlpha;
  varying float vDist;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    float k = a * a * vAlpha * sensesGlow(vDist, 0.0);
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor * 1.5, k);
  }`;

const RING_VS = /* glsl */`
  uniform vec3 uPlayerPos;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDist = distance(wp.xz, uPlayerPos.xz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const RING_FS = /* glsl */`
  ${COMMON_FS}
  uniform float uEcho;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float wob = 0.03 * sin(atan(d.y, d.x) * 5.0 + uTime * 1.3);
    float ring = smoothstep(0.1, 0.0, abs(r - 0.78 - wob)) * 0.9;
    float inner = smoothstep(0.62, 0.0, r) * (0.22 + uEcho * 0.25);
    float beat = 0.75 + 0.25 * sin(uTime * 3.4);
    float a = (ring + inner) * beat * smoothstep(1.0, 0.92, r);
    float k = a * sensesGlow(vDist, 0.0);
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor * 1.4, k);
  }`;

export async function init(G) {
  if (G.senses && !G.senses.stub) return;
  const U = G.uniforms;
  const clues = new Map();
  const trails = new Map();
  let nextId = 1;
  let level = 0;
  let active = false;
  let forced = null;
  let hum = null;
  const pulseU = { value: 0 };
  const group = new THREE.Group();
  group.name = 'senses';
  G.scene.add(group);

  const fpTex = footprintTexture();
  const baseUniforms = (color, extra = {}) => ({
    uColor: { value: color.clone() }, uSenses: U.uSenses, uTime: U.uTime, uPlayerPos: U.uPlayerPos,
    uReveal: { value: 1 }, uPulse: pulseU, ...extra,
  });
  const glowMat = (vs, fs, uniforms, extra = {}) => new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra,
  });

  const ground = (x, z) => G.world?.heightAt?.(x, z) ?? 0;
  const _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const _s = new THREE.Vector3(1, 1, 1), _pv = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // Resample a polyline every `step` meters of arc length: [{ x, z, yaw, s }].
  function resample(points, step) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      segs.push({ ax, az, bx, bz, len, s0: total, yaw: Math.atan2(bx - ax, bz - az) });
      total += len;
    }
    const out = [];
    let k = 0;
    for (let s = 0; s <= total + 1e-6 && segs.length; s += step) {
      while (k < segs.length - 1 && s > segs[k].s0 + segs[k].len) k++;
      const g = segs[k], t = Math.min(1, (s - g.s0) / g.len);
      out.push({ x: g.ax + (g.bx - g.ax) * t, z: g.az + (g.bz - g.az) * t, yaw: g.yaw, s });
    }
    return out;
  }

  // PostFX draws the warm clue glow after its senses grade for objects on SENSES_LAYER, rendered
  // with an override material. So each trail gets a "mask twin" whose geometry already has the
  // right shape (boot prints, two heel grooves): invisible in the normal pass, orange in senses.
  const senseLayer = () => (Number.isInteger(G.postfx?.SENSES_LAYER) ? G.postfx.SENSES_LAYER : null);
  function addTwin(owner, obj) {
    const L = senseLayer();
    if (L == null) { obj.geometry.dispose(); obj.material.dispose(); return; }
    obj.layers.set(L);
    obj.frustumCulled = false;
    group.add(obj);
    owner.objects.push(obj);
    (owner.twins ||= []).push(obj);
  }
  const twinMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  // A boot print outline: forefoot and heel, toe toward +Z once laid flat.
  function footprintShapeGeometry() {
    const toe = new THREE.Shape().absellipse(0, -0.055, 0.052, 0.088, 0, Math.PI * 2, false, 0);
    const heel = new THREE.Shape().absellipse(0.004, 0.098, 0.04, 0.046, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ShapeGeometry([toe, heel], 10);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // Strip of quads `width` wide offset sideways from a resampled path, draped on the ground.
  function stripGeometry(steps, offset, width, skip) {
    const pos = [], idx = [];
    const n = steps.length;
    steps.forEach((st, i) => {
      const prev = steps[Math.max(0, i - 1)], next = steps[Math.min(n - 1, i + 1)];
      const yaw = Math.atan2(next.x - prev.x, next.z - prev.z) || st.yaw;
      const cx = Math.cos(yaw), cz = -Math.sin(yaw);
      const a = offset - width / 2, b = offset + width / 2;
      const x0 = st.x + cx * a, z0 = st.z + cz * a, x1 = st.x + cx * b, z1 = st.z + cz * b;
      pos.push(x0, ground(x0, z0) + 0.035, z0, x1, ground(x1, z1) + 0.035, z1);
      if (i < n - 1 && !(skip && skip(i))) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  function buildTrail(tr) {
    const kind = tr.kind || 'footprints';
    const color = COLORS[kind] || COLORS.footprints;
    const reveal = { value: tr.enabled === false ? 0 : 1 };
    tr.reveal = reveal;
    tr.objects = [];
    const pts = tr.points;
    if (!pts || pts.length < 2) return;

    if (kind === 'footprints') {
      const steps = resample(pts, tr.stride || 0.74);
      const geo = new THREE.PlaneGeometry(0.15, 0.3);
      // Flat on the ground with the toe pointing along +Z (the walking direction).
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(Math.PI);
      const phases = new Float32Array(steps.length);
      const mat = glowMat(DECAL_VS, DECAL_FS, baseUniforms(color, { uMap: { value: fpTex }, uReveal: reveal }));
      const mesh = new THREE.InstancedMesh(geo, mat, steps.length);
      steps.forEach((st, i) => {
        const side = i % 2 ? 1 : -1;
        const jitter = Math.sin(i * 12.9898) * 0.08;
        const px = st.x + Math.cos(st.yaw) * 0.11 * side;
        const pz = st.z - Math.sin(st.yaw) * 0.11 * side;
        G.world?.normalAt?.(px, pz, _n) ?? _n.set(0, 1, 0);
        _q.setFromUnitVectors(UP, _n);
        _qy.setFromAxisAngle(UP, st.yaw + jitter + side * 0.06);
        _q.multiply(_qy);
        _pv.set(px, ground(px, pz) + 0.025, pz);
        _m.compose(_pv, _q, _s);
        mesh.setMatrixAt(i, _m);
        phases[i] = st.s;
      });
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      group.add(mesh);
      tr.objects.push(mesh);
      const twin = new THREE.InstancedMesh(footprintShapeGeometry(), twinMat(), steps.length);
      twin.instanceMatrix.array.set(mesh.instanceMatrix.array);
      addTwin(tr, twin);
    }

    if (kind === 'drag') {
      const steps = resample(pts, 0.45);
      const n = steps.length;
      const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
      const idx = [];
      const w = tr.width || 0.55;
      steps.forEach((st, i) => {
        // Average heading for a smooth ribbon.
        const prev = steps[Math.max(0, i - 1)], next = steps[Math.min(n - 1, i + 1)];
        const yaw = Math.atan2(next.x - prev.x, next.z - prev.z) || st.yaw;
        const rx = Math.cos(yaw) * w * 0.5, rz = -Math.sin(yaw) * w * 0.5;
        const lx = st.x - rx, lz = st.z - rz, Rx = st.x + rx, Rz = st.z + rz;
        pos.set([lx, ground(lx, lz) + 0.03, lz, Rx, ground(Rx, Rz) + 0.03, Rz], i * 6);
        uv.set([0, st.s, 1, st.s], i * 4);
        if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mat = glowMat(RIBBON_VS, RIBBON_FS, baseUniforms(color, { uReveal: reveal }), { side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      group.add(mesh);
      tr.objects.push(mesh);
      // Two heel grooves, broken here and there like the ribbon shader's.
      const broken = (i) => Math.sin(i * 0.23 + 3) + Math.sin(i * 0.71) > 1.55;
      const off = w * 0.19;
      for (const o of [-off, off]) addTwin(tr, new THREE.Mesh(stripGeometry(steps, o, 0.06, broken), twinMat()));
    }

    // Drifting motes along every trail (dense and red for scent).
    const per = kind === 'scent' ? 0.55 : 1.6;
    const steps = resample(pts, per);
    const mp = new Float32Array(steps.length * 3), seeds = new Float32Array(steps.length);
    steps.forEach((st, i) => {
      const off = Math.sin(i * 7.77) * 0.35;
      mp.set([st.x + Math.cos(st.yaw) * off, ground(st.x, st.z) + 0.1 + (kind === 'scent' ? 0.5 : 0), st.z - Math.sin(st.yaw) * off], i * 3);
      seeds[i] = (Math.sin(i * 91.3) * 0.5 + 0.5);
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const dpr = G.renderer?.getPixelRatio?.() || 1;
    const mm = glowMat(MOTE_VS, MOTE_FS, baseUniforms(kind === 'scent' ? COLORS.scent : color, {
      uReveal: reveal, uSize: { value: (kind === 'scent' ? 46 : 30) * dpr }, uRise: { value: kind === 'scent' ? 1.2 : 0.8 },
    }), { polygonOffset: false });
    const pts3 = new THREE.Points(mg, mm);
    pts3.frustumCulled = false;
    pts3.renderOrder = 6;
    group.add(pts3);
    tr.objects.push(pts3);
  }

  function disposeObjects(list) {
    for (const o of list || []) {
      o.parent?.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  // Ground ring under a clue (and a column of motes for echoes).
  function buildClueMarker(cl) {
    const echo = cl.kind === 'echo';
    const color = echo ? COLORS.echo : COLORS.clue;
    cl.reveal = { value: 1 };
    const size = echo ? 3.2 : 1.3;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const mat = glowMat(RING_VS, RING_FS, baseUniforms(color, { uReveal: cl.reveal, uEcho: { value: echo ? 1 : 0 } }));
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(cl.pos.x, ground(cl.pos.x, cl.pos.z) + 0.04, cl.pos.z);
    ring.renderOrder = 5;
    group.add(ring);
    cl.objects = [ring];
    if (!echo) {
      const rg = new THREE.RingGeometry(0.42, 0.5, 40);
      rg.rotateX(-Math.PI / 2);
      const twin = new THREE.Mesh(rg, twinMat());
      twin.position.copy(ring.position);
      addTwin(cl, twin);
    }
    if (echo) {
      const n = 40;
      const mp = new Float32Array(n * 3), seeds = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996, r = 0.25 + (i % 7) * 0.18;
        mp.set([cl.pos.x + Math.cos(a) * r, ground(cl.pos.x, cl.pos.z) + 0.05, cl.pos.z + Math.sin(a) * r], i * 3);
        seeds[i] = (i * 0.618) % 1;
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
      mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      const dpr = G.renderer?.getPixelRatio?.() || 1;
      const pm = new THREE.Points(mg, glowMat(MOTE_VS, MOTE_FS, baseUniforms(color, {
        uReveal: cl.reveal, uSize: { value: 40 * dpr }, uRise: { value: 2.4 },
      }), { polygonOffset: false }));
      pm.frustumCulled = false;
      pm.renderOrder = 6;
      group.add(pm);
      cl.objects.push(pm);
    }
  }

  // Emissive fallback highlight for clue meshes.
  function setHighlight(cl, k) {
    if (!cl.object) return;
    const color = cl.kind === 'echo' ? COLORS.echo : COLORS.clue;
    const pf = G.postfx;
    // PostFX clue layer: glows in the clue color (orange, or turquoise for echoes) after the
    // senses desaturation whenever uSenses > 0, so mark it while it counts.
    if (typeof pf?.markClue === 'function') {
      const on = k > 0.02;
      if (on !== !!cl.hl) { pf.markClue(cl.object, on, '#' + color.getHexString()); cl.hl = on; }
      return;
    }
    if (pf && typeof pf.addHighlight === 'function') {
      if (k > 0.02 && !cl.hl) { pf.addHighlight(cl.object, color); cl.hl = true; }
      else if (k <= 0.02 && cl.hl) { pf.removeHighlight?.(cl.object); cl.hl = false; }
      if (cl.hl && typeof pf.setHighlightStrength === 'function') pf.setHighlightStrength(cl.object, k);
      return;
    }
    if (k > 0.02 && !cl.saved) {
      cl.saved = [];
      cl.object.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const repl = mats.map((m) => {
          if (!m.emissive) return m;
          const c = m.clone();
          c.emissive = color.clone();
          c.emissiveIntensity = 0;
          return c;
        });
        cl.saved.push([o, o.material]);
        o.material = Array.isArray(o.material) ? repl : repl[0];
      });
    }
    if (cl.saved) {
      const pulse = 0.65 + 0.35 * Math.sin(U.uTime.value * 4.2);
      for (const [o] of cl.saved) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m.emissive) m.emissiveIntensity = k * pulse * 1.6;
      }
      if (k <= 0.02) {
        for (const [o, orig] of cl.saved) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (!(Array.isArray(orig) ? orig : [orig]).includes(m)) m.dispose();
          o.material = orig;
        }
        cl.saved = null;
      }
    }
  }

  async function examine(cl) {
    const pc = G.player?.character;
    try { pc?.play?.('crouch_examine', { loop: false, fade: 0.25 }); } catch { /* optional */ }
    if (cl.kind === 'echo') G.audio?.stinger?.('echo');
    if (cl.cutscene && G.cutscenes?.has?.(cl.cutscene)) await G.cutscenes.play(cl.cutscene);
    if (cl.onExamine) await cl.onExamine(cl);
    if (cl.line) G.story?.ui?.subtitle?.('Vesna', cl.line, Math.max(2, cl.line.length / 14 + 0.5));
    cl.examined = true;
    G.events.emit('clue:examine', { id: cl.id });
    if (cl.once !== false) api.removeClue(cl.id);
  }

  const api = {
    get active() { return active; },
    get level() { return level; },
    colors: COLORS,
    clues, trails,

    addClue(def) {
      const id = def.id ?? `clue${nextId++}`;
      if (clues.has(id)) api.removeClue(id);
      const p = def.pos;
      const pos = p?.isVector3 ? p.clone() : Array.isArray(p)
        ? (p.length === 2 ? new THREE.Vector3(p[0], ground(p[0], p[1]), p[1]) : new THREE.Vector3(p[0], p[1], p[2]))
        : new THREE.Vector3(p.x, p.y ?? ground(p.x, p.z), p.z);
      const cl = { radius: 1.5, kind: 'clue', once: true, label: def.kind === 'echo' ? 'Echo' : 'Clue', ...def, id, pos, revealed: false, examined: false };
      buildClueMarker(cl);
      cl.interactId = G.interact?.add?.({
        id: `senses:${id}`, pos: () => cl.pos, radius: Math.max(cl.radius, 1.2), label: cl.label,
        verb: 'Examine', facing: false, priority: 1,
        enabled: () => !cl.examined && (cl.enabled ? cl.enabled() : true) && (active || cl.revealed),
        onUse: () => examine(cl),
      });
      clues.set(id, cl);
      return id;
    },

    removeClue(id) {
      const cl = clues.get(id);
      if (!cl) return;
      setHighlight(cl, 0);
      disposeObjects(cl.objects);
      if (cl.interactId != null) G.interact?.remove?.(cl.interactId);
      clues.delete(id);
    },

    clue(id) { return clues.get(id) || null; },

    addTrail(def) {
      const id = def.id ?? `trail${nextId++}`;
      if (trails.has(id)) api.removeTrail(id);
      const tr = { kind: 'footprints', ...def, id };
      buildTrail(tr);
      trails.set(id, tr);
      return id;
    },

    removeTrail(id) {
      const tr = trails.get(id);
      if (!tr) return;
      disposeObjects(tr.objects);
      trails.delete(id);
    },

    trail(id) { return trails.get(id) || null; },

    force(v) { forced = v; },
    pulse() { pulseU.value = U.uTime.value; },

    update(dt) {
      const P = G.player;
      // Without a player (debug scenes), measure from the camera.
      if (!P) U.uPlayerPos.value.set(G.camera.position.x, ground(G.camera.position.x, G.camera.position.z), G.camera.position.z);
      const canUse = !G.story?.busy && (!G.input || G.input.context === 'game')
        && !(P?.swordDrawn) && P?.state !== 'dead' && P?.state !== 'combat' && !G.fishing?.active;
      const want = forced != null ? forced : canUse && !!G.input?.down('senses');
      const wasActive = active;
      const prevLevel = level;
      level = damp(level, want ? 1 : 0, want ? 4.5 : 3, dt);
      if (want && level > 0.995) level = 1;
      if (!want && level < 0.003) level = 0;
      active = want && level > 0.35;
      if (active !== wasActive) {
        if (active) {
          api.pulse();
          G.audio?.sfx?.('senses_on');
          try { hum = G.audio?.loop?.('senses_hum', { volume: 0.5 }) || null; } catch { hum = null; }
        } else {
          G.audio?.sfx?.('senses_off');
          hum?.stop?.();
          hum = null;
        }
        G.events.emit(active ? 'senses:on' : 'senses:off', {});
      }
      // Cutscenes may animate uSenses themselves; only write it while senses are in play.
      if (forced != null || level > 0 || prevLevel > 0) U.uSenses.value = level;
      const lv = U.uSenses.value;
      group.visible = lv > 0.004;
      for (const tr of trails.values()) {
        const en = tr.enabled ? !!tr.enabled() : true;
        tr.reveal.value = damp(tr.reveal.value, en ? 1 : 0, 3, dt);
        if (tr.twins) for (const t of tr.twins) t.visible = tr.reveal.value > 0.5;
      }
      const pp = U.uPlayerPos.value;
      for (const cl of clues.values()) {
        const en = (cl.enabled ? !!cl.enabled() : true) && !cl.examined;
        cl.reveal.value = damp(cl.reveal.value, en ? 1 : 0, 4, dt);
        if (cl.twins) for (const t of cl.twins) t.visible = cl.reveal.value > 0.5;
        const d = Math.hypot(cl.pos.x - pp.x, cl.pos.z - pp.z);
        if (en && active && d < REVEAL_RANGE && !cl.revealed) { cl.revealed = true; G.events.emit('clue:reveal', { id: cl.id }); }
        // Revealed clues keep a faint glow so they can still be found after letting go.
        const near = Math.max(0, 1 - d / SHOW_RANGE);
        const k = en ? Math.max(lv, cl.revealed ? 0.18 : 0) * Math.min(1, near * 1.6) : 0;
        setHighlight(cl, k);
      }
    },
  };

  G.senses = api;
  G.addSystem('senses', (dt) => api.update(dt), ORDER.logic + 1);
}
