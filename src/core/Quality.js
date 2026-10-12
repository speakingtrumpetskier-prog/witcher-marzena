// Render quality, chosen before the renderer exists.
//
//   pickQuality(params)   'low' | 'medium' | 'high'
//   gpuName()             the WebGL renderer string (unmasked when the browser allows it), cached
//
// Order: ?quality= in the address wins (the settings menu reloads with it, and a choice made there is
// remembered), then the player's saved choice, then a guess from the GPU: integrated graphics start
// at medium, software rasterizers and phone GPUs at low, everything else at high. Test harness loads
// (?shot or ?scene) never write the saved choice.

const KEY = 'marzena.quality';
const VALID = new Set(['low', 'medium', 'high']);

const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } },
};

let cachedName = null;

export function gpuName() {
  if (cachedName !== null) return cachedName;
  cachedName = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      cachedName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* no WebGL: the engine reports it */ }
  return cachedName;
}

// A rough tier from the renderer string. Discrete cards are named by brand line; integrated parts
// share family names, so test the discrete lines first.
export function guessQuality(name = gpuName()) {
  const n = name.toLowerCase();
  if (!n) return 'high';
  if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(n)) return 'low';
  if (/mali|adreno|powervr|videocore|apple gpu/.test(n)) return 'low';
  if (/geforce|rtx|gtx|quadro|nvidia|radeon rx|radeon pro|radeon vii|arc\(tm\) a\d|arc a\d/.test(n)) return 'high';
  if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|apple m\d/.test(n)) return 'medium';
  return 'high';
}

export function pickQuality(params) {
  const asked = params.get('quality');
  const harness = params.has('shot') || params.has('scene');
  if (VALID.has(asked)) {
    if (!harness) store.set(asked);
    return asked;
  }
  const saved = store.get();
  if (VALID.has(saved)) return saved;
  return guessQuality();
}
