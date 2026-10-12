// Shader warm-up under the loading screen.
//
//   await warmShaders(G)   compiles the scene's materials and the shadow pass's depth programs
//
// three compiles a program the first time something draws with it, and on slow shader compilers
// (Direct3D on integrated graphics) that froze the first frame for 15 to 20 s. renderer.compileAsync
// lets the GPU process compile in parallel off the main thread, but two things have to match the
// real frame or the work is wasted:
//   - the render target: the scene renders into the post-processing target (linear output, no tone
//     mapping), and three keys programs on that, so compile with the same kind of target bound;
//   - the shadow pass: three draws casters with depth materials it picks itself (the object's
//     customDepthMaterial, else a MeshDepthMaterial or an alpha-tested clone, with a flipped side),
//     which compileAsync never sees. Stand-ins built from the same rules compile those too.
import * as THREE from 'three';

const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let linearTarget = null;

function sceneTarget(G) {
  const c = G.postfx?.composer;
  if (c?.renderTarget1) return c.renderTarget1;
  return null;
}

function depthTarget() {
  // Any non-null, non-XR target gives the shadow pass's parameters (linear output, no tone mapping).
  return linearTarget || (linearTarget = new THREE.WebGLRenderTarget(4, 4));
}

// Wait until every program three has created reports ready (non-blocking with parallel compile).
async function programsReady(R, timeoutMs) {
  const t0 = performance.now();
  for (;;) {
    const list = R.info.programs || [];
    let pending = 0;
    for (const p of list) if (p.isReady && !p.isReady()) pending++;
    if (!pending || performance.now() - t0 > timeoutMs) return pending;
    await sleep(40);
  }
}

// Stand-ins for the shadow pass: one per distinct (depth material, side, object kind) seen on casters.
function shadowStandIns(G) {
  const out = [];
  const seen = new Set();
  const plainDepth = new THREE.MeshDepthMaterial();
  const clones = new Map();
  G.scene.traverse((o) => {
    if (!o.castShadow || !o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.visible === false) continue;
      let dm = o.customDepthMaterial;
      if (!dm) {
        const variant = (m.displacementMap && m.displacementScale !== 0) || (m.alphaMap && m.alphaTest > 0)
          || (m.map && m.alphaTest > 0) || m.alphaToCoverage === true;
        if (variant) {
          dm = clones.get(m);
          if (!dm) {
            dm = plainDepth.clone();
            dm.map = m.map; dm.alphaMap = m.alphaMap;
            dm.alphaTest = m.alphaToCoverage === true ? 0.5 : m.alphaTest;
            dm.displacementMap = m.displacementMap; dm.displacementScale = m.displacementScale; dm.displacementBias = m.displacementBias;
            clones.set(m, dm);
          }
        } else dm = plainDepth;
      }
      const side = m.shadowSide ?? SHADOW_SIDE[m.side] ?? THREE.BackSide;
      const kind = (o.isInstancedMesh ? 'i' : '') + (o.instanceColor ? 'c' : '') + (o.isSkinnedMesh ? 's' : '')
        + (o.geometry.morphAttributes?.position ? 'm' : '') + (o.geometry.attributes.color ? 'v' : '');
      const key = `${dm.uuid}|${side}|${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let proxy;
      if (o.isSkinnedMesh && o.skeleton) {
        proxy = new THREE.SkinnedMesh(o.geometry, dm);
        proxy.bind(o.skeleton, o.bindMatrix);
      } else if (o.isInstancedMesh) {
        proxy = new THREE.InstancedMesh(o.geometry, dm, 1);
        proxy.instanceMatrix = o.instanceMatrix;
        proxy.instanceColor = o.instanceColor;
      } else proxy = new THREE.Mesh(o.geometry, dm);
      proxy.frustumCulled = false;
      out.push({ proxy, dm, side });
    }
  });
  return out;
}

export async function warmShaders(G, { timeoutMs = 90000, creatures = false } = {}) {
  const R = G.renderer;
  if (!R || !G.scene || !G.camera || !R.compileAsync) return { pending: 0 };
  const prev = R.getRenderTarget();
  const t0 = performance.now();
  // Creatures that only appear later (wolves, Marzanny, the bear, the boss) are built hidden for the
  // duration so their programs compile now too, then disposed once everything is ready.
  let unwarm = null;
  if (creatures) { try { unwarm = G.creatures?.prewarm?.() || null; } catch (e) { console.warn('[warm] creatures', e); } }
  try {
    // 1. Scene materials, keyed the way the scene pass will draw them.
    R.setRenderTarget(sceneTarget(G));
    R.compile(G.scene, G.camera);
    // 2. Shadow-pass depth programs. compile() creates programs at once and returns; a material's
    //    side is read at that moment, so each stand-in is compiled on its own with its side set.
    if (R.shadowMap.enabled) {
      R.setRenderTarget(depthTarget());
      const empty = new THREE.Scene();
      for (const { proxy, dm, side } of shadowStandIns(G)) {
        const keep = dm.side;
        dm.side = side;
        empty.add(proxy);
        // The real scene as target: its lights and shadows are part of the program key in the
        // shadow pass (three draws casters inside the scene render), its fog and environment are not.
        try { R.compile(empty, G.camera, G.scene); } catch (e) { console.warn('[warm] depth', e); }
        empty.remove(proxy);
        dm.side = keep;
      }
    }
  } finally {
    R.setRenderTarget(prev);
  }
  const pending = await programsReady(R, Math.max(0, timeoutMs - (performance.now() - t0)));
  unwarm?.();
  return { pending, programs: (R.info.programs || []).length, ms: Math.round(performance.now() - t0) };
}
