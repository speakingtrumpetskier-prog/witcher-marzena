// Far representation of trees: billboard impostors rendered at load from our own LOD 0 meshes into
// an atlas (two views per kind, one atlas for winter and one for the thawed or spring look that
// blends in with uSnowCover and uSpring). Owner: vegetation builder.
//
//   bakeImpostors(G, kinds) -> { atlasA, atlasB, cols, rows }; also sets kind.imp = { tile, fw, fh }
//   class ImpostorLayer: one InstancedMesh (one draw call) for every far tree. Billboards turn
//   around Y toward the camera in the vertex shader, are lit by the scene lights through a fixed
//   camera-facing normal (so they match the real meshes under any time of day), glow against the
//   sun, fade in with the same screen-door dither as the LOD meshes and vanish when close.
import * as THREE from 'three';
import { addCompileHook } from '../../render/Materials.js';
import { U } from '../../render/Uniforms.js';

const TW = 128, TH = 256, COLS = 8;

// ---------------------------------------------------------------------------------------------
// CPU bake. A tiny orthographic software rasterizer draws the LOD 0 geometry into the atlas: flat
// albedo (vertex colors carry the baked ambient occlusion), snow from the aSnow attribute with the
// same thresholds as the real shader, the needle comb fringe, alpha textured birch cards. No GPU
// work at all, so loading never stalls on shader compilation or readbacks (very slow on software GL).
const SNOW_LIN = [0.88, 0.905, 0.956];
const CLEAR = [0.12, 0.16, 0.12];

const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

// Box prefilter of an RGBA image (alpha weighted color) so the bake samples a smooth coverage instead
// of aliasing single needle strokes when a branch card is minified to a few pixels.
const _pre = new Map();
function prefilter(img, f) {
  const key = img;
  let m = _pre.get(key);
  if (!m) _pre.set(key, (m = new Map()));
  if (m.has(f)) return m.get(f);
  const w = Math.floor(img.width / f), h = Math.floor(img.height / f);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const o = ((y * f + j) * img.width + x * f + i) * 4;
          const al = img.data[o + 3];
          r += img.data[o] * al; g += img.data[o + 1] * al; b += img.data[o + 2] * al; a += al;
        }
      }
      const d = (y * w + x) * 4;
      if (a > 0) { data[d] = r / a; data[d + 1] = g / a; data[d + 2] = b / a; }
      data[d + 3] = a / (f * f);
    }
  }
  const out = { width: w, height: h, data };
  m.set(f, out);
  return out;
}

function rasterTile(parts, fw, fh, treeH, yaw, snow, spring) {
  const SS = 2, W = TW * SS, H = TH * SS;
  const zbuf = new Float32Array(W * H).fill(-1e9);
  const col = new Float32Array(W * H * 3);
  const hit = new Uint8Array(W * H);
  const cosT = Math.cos(yaw), sinT = Math.sin(yaw);
  const sx = W / fw, sy = H / fh;
  const grow = sstep(0.04, 0.85, spring);
  for (const part of parts) {
    const g = part.geometry;
    const pos = g.attributes.position.array, colA = g.attributes.color.array, snowA = g.attributes.aSnow.array;
    const uvA = g.attributes.uv.array, wA = g.attributes.aWind.array;
    const cornerA = g.attributes.aCorner ? g.attributes.aCorner.array : null;
    const idx = g.index.array;
    const foliage = part.mode === 'foliage';
    const isCard = !!part.card;
    const isNeedle = part.tex === 'needle';
    const tdata = (isCard || isNeedle) ? prefilter(part.material.map.userData.imageData, isNeedle ? 4 : 2) : null;
    if (part.leaves && grow <= 0.001) continue;
    const n = pos.length / 3;
    const vx = new Float32Array(n), vy = new Float32Array(n), vz = new Float32Array(n), wy = new Float32Array(n);
    const px3 = new Float32Array(n), pz3 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (cornerA) { x += cornerA[i * 3] * grow; y += cornerA[i * 3 + 1] * grow; z += cornerA[i * 3 + 2] * grow; }
      const X = x * cosT + z * sinT, Z = -x * sinT + z * cosT;
      vx[i] = (X + fw / 2) * sx; vy[i] = (fh - y) * sy; vz[i] = Z; wy[i] = y; px3[i] = X; pz3[i] = Z;
    }
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const x0 = vx[a], y0 = vy[a], x1 = vx[b], y1 = vy[b], x2 = vx[c], y2 = vy[c];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-4) continue;
      // facing: normal z component in view space (camera on +Z, screen y is flipped)
      const front = area < 0;
      const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      const inv = 1 / area;
      for (let py = miny; py <= maxy; py++) {
        for (let px = minx; px <= maxx; px++) {
          const qx = px + 0.5, qy = py + 0.5;
          const w0 = ((x1 - qx) * (y2 - qy) - (x2 - qx) * (y1 - qy)) * inv;
          const w1 = ((x2 - qx) * (y0 - qy) - (x0 - qx) * (y2 - qy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * vz[a] + w1 * vz[b] + w2 * vz[c];
          const o = py * W + px;
          if (z <= zbuf[o]) continue;
          let r = w0 * colA[a * 3] + w1 * colA[b * 3] + w2 * colA[c * 3];
          let gg = w0 * colA[a * 3 + 1] + w1 * colA[b * 3 + 1] + w2 * colA[c * 3 + 1];
          let bb = w0 * colA[a * 3 + 2] + w1 * colA[b * 3 + 2] + w2 * colA[c * 3 + 2];
          const yy = w0 * wy[a] + w1 * wy[b] + w2 * wy[c];
          const yf = Math.min(1, Math.max(0, yy / treeH));
          const u = w0 * uvA[a * 2] + w1 * uvA[b * 2] + w2 * uvA[c * 2];
          const v = w0 * uvA[a * 2 + 1] + w1 * uvA[b * 2 + 1] + w2 * uvA[c * 2 + 1];
          if (tdata) {
            const tx = Math.min(tdata.width - 1, Math.max(0, Math.floor(u * tdata.width)));
            const ty = Math.min(tdata.height - 1, Math.max(0, Math.floor((1 - v) * tdata.height)));
            const to = (ty * tdata.width + tx) * 4;
            const alpha = tdata.data[to + 3] / 255;
            if (alpha < (part.haze ? 0.2 : isNeedle ? 0.3 : 0.25)) continue;
            r *= LUT[tdata.data[to]]; gg *= LUT[tdata.data[to + 1]]; bb *= LUT[tdata.data[to + 2]];
          }
          if (!isCard) {
            const seed = w0 * wA[a * 2 + 1] + w1 * wA[b * 2 + 1] + w2 * wA[c * 2 + 1];
            if (foliage) {
              const tooth = hash2(Math.floor(v * 38), seed * 7.13);
              const tooth2 = hash2(Math.floor(v * 17 + 0.5), seed * 3.7);
              if (Math.abs(u) > 0.86 + 0.26 * tooth + 0.1 * tooth2 - 0.2 * v * v) continue;
            }
            // snow dusted tops, darker skirts: a vertical gradient keeps canopy masses coherent
            const sn = (w0 * snowA[a] + w1 * snowA[b] + w2 * snowA[c]) * snow * (front ? 1 : 0) * (0.5 + 0.9 * yf);
            const shadeY = 0.8 + 0.3 * yf;
            r *= shadeY; gg *= shadeY; bb *= shadeY;
            if (sn > 0.0) {
              const cl = vnoise(px * 0.05, py * 0.05) * 0.65 + vnoise(px * 0.22, py * 0.22) * 0.35;
              const m = sstep(0.3, 0.58, sn + (cl - 0.5) * 0.55);
              r += (SNOW_LIN[0] - r) * m; gg += (SNOW_LIN[1] - gg) * m; bb += (SNOW_LIN[2] - bb) * m;
            }
          }
          zbuf[o] = z; hit[o] = 1;
          col[o * 3] = r; col[o * 3 + 1] = gg; col[o * 3 + 2] = bb;
        }
      }
    }
  }
  // 2x2 box downsample with coverage as alpha, sRGB encode, rows bottom-up
  const out = new Uint8Array(TW * TH * 4);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const o = (y * SS + j) * W + x * SS + i;
          if (hit[o]) { r += col[o * 3]; g += col[o * 3 + 1]; b += col[o * 3 + 2]; cnt++; }
        }
      }
      const dst = ((TH - 1 - y) * TW + x) * 4;
      if (cnt === 0) { r = CLEAR[0]; g = CLEAR[1]; b = CLEAR[2]; } else { r /= cnt; g /= cnt; b /= cnt; }
      out[dst] = Math.round(toSRGB(r) * 255); out[dst + 1] = Math.round(toSRGB(g) * 255); out[dst + 2] = Math.round(toSRGB(b) * 255);
      out[dst + 3] = Math.round((cnt / (SS * SS)) * 255);
    }
  }
  return out;
}

export async function bakeImpostors(G, kinds, opts = {}) {
  const snowBake = opts.snow ?? 0.62; // a little less snow than the meshes so far forests keep dark green mass
  const imp = kinds.filter((k) => k.impostor);
  const nTiles = imp.length * 2;
  const rows = Math.max(1, Math.ceil(nTiles / COLS));
  const W = COLS * TW, H = rows * TH;
  const bufs = [new Uint8Array(W * H * 4), new Uint8Array(W * H * 4)];
  // clear to transparent with the clear color so mip levels do not bleed black into the edges
  for (const buf of bufs) {
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = Math.round(toSRGB(CLEAR[0]) * 255); buf[i + 1] = Math.round(toSRGB(CLEAR[1]) * 255); buf[i + 2] = Math.round(toSRGB(CLEAR[2]) * 255); buf[i + 3] = 0;
    }
  }
  const t0 = performance.now();
  imp.forEach((k, i) => {
    let maxXZ = 0, maxY = 0;
    for (const part of k.lods[0].parts) {
      const bb = part.geometry.boundingBox;
      maxXZ = Math.max(maxXZ, Math.abs(bb.min.x), bb.max.x, Math.abs(bb.min.z), bb.max.z);
      maxY = Math.max(maxY, bb.max.y);
    }
    const fh = Math.max(maxY + 0.4, (2 * maxXZ + 1.4) * 2);
    k.imp = { tile: [i * 2, i * 2 + 1], fw: fh / 2, fh };
  });
  for (const k of imp) {
    const parts = k.lods[0].parts;
    for (let v = 0; v < 2; v++) {
      const tile = k.imp.tile[v];
      const tx = (tile % COLS) * TW, ty = Math.floor(tile / COLS) * TH;
      const yaw = v * Math.PI * 0.5 + 0.35;
      for (let st = 0; st < 2; st++) {
        const px = rasterTile(parts, k.imp.fw, k.imp.fh, k.height, yaw, st === 0 ? snowBake : 0, st === 0 ? 0 : 1);
        const buf = bufs[st];
        for (let y = 0; y < TH; y++) buf.set(px.subarray(y * TW * 4, (y + 1) * TW * 4), ((ty + y) * W + tx) * 4);
      }
    }
    if (opts.log) console.warn(`bake ${k.id} t=${Math.round(performance.now() - t0)}ms`);
    if (performance.now() - t0 > 40) await new Promise((r) => setTimeout(r, 0));
  }
  const mk = (buf) => {
    const t = new THREE.DataTexture(buf, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return { atlasA: mk(bufs[0]), atlasB: mk(bufs[1]), cols: COLS, rows, ms: performance.now() - t0, buffers: bufs };
}

const HEADER_V = /* glsl */ `
attribute vec3 aImp;
uniform vec2 uImpGrid;
uniform vec2 uImpRange;
varying float vVegLodD;
varying float vVegHash;
varying vec3 vVegWPos;
`;

const BODY_V = /* glsl */ `
vec3 mzBase = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
vec3 mzTo = cameraPosition - mzBase;
float mzDist = length(mzTo);
vec3 mzToN = mzTo / max(mzDist, 0.001);
mzTo.y = 0.0;
mzTo = normalize(mzTo + vec3(0.0001, 0.0, 0.0));
vec3 mzRight = vec3(mzTo.z, 0.0, -mzTo.x);
// seen from high above (towers, the map camera) the card leans toward the viewer so it never goes edge-on
float mzTilt = clamp((mzToN.y - 0.35) / 0.5, 0.0, 1.0) * 0.8;
vec3 mzUpV = normalize(mix(vec3(0.0, 1.0, 0.0), mzToN, mzTilt));
vec3 mzW = mzBase + mzRight * (position.x * aImp.y) + mzUpV * (position.y * aImp.z);
// subtle sway of the whole billboard with the wind, stronger toward the top
mzW.xz += uWind.xy * uWind.z * 0.012 * aImp.z * position.y * position.y * (0.6 + 0.4 * sin(uTime * 1.3 + mzBase.x * 0.07 + mzBase.z * 0.05));
vec4 mvPosition = viewMatrix * vec4(mzW, 1.0);
gl_Position = projectionMatrix * mvPosition;
if (mzDist < uImpRange.x || mzDist > uImpRange.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
float mzTile = aImp.x;
float mzCol = mod(mzTile, uImpGrid.x);
float mzRow = floor(mzTile / uImpGrid.x);
#ifdef USE_MAP
  vMapUv = vec2((mzCol + position.x + 0.5) / uImpGrid.x, (mzRow + position.y) / uImpGrid.y);
#endif
vVegLodD = mzDist;
vVegHash = fract(sin(dot(mzBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
vVegWPos = mzW;
`;

const HEADER_F = /* glsl */ `
uniform sampler2D uAtlasB;
uniform vec4 uMzLod;
uniform float uSnowCover;
uniform float uSpring;
uniform vec3 uVegSunDir;
uniform vec3 uVegSunCol;
varying float vVegLodD;
varying float vVegHash;
varying vec3 vVegWPos;
`;

const FADE_F = /* glsl */ `
{
  float mzIn = smoothstep(uMzLod.x, uMzLod.y, vVegLodD);
  int mzBx = int(mod(gl_FragCoord.x, 4.0));
  int mzBy = int(mod(gl_FragCoord.y, 4.0));
  float mzM[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  float mzD = fract((mzM[mzBy * 4 + mzBx] + 0.5) / 16.0 + vVegHash);
  if (mzD >= mzIn) discard;
}
`;

const GLOW_F = /* glsl */ `
{
  vec3 mzV = normalize(vVegWPos - cameraPosition);
  float mzBack = max(dot(mzV, uVegSunDir), 0.0);
  float mzUp = smoothstep(-0.02, 0.2, uVegSunDir.y);
  totalEmissiveRadiance += diffuseColor.rgb * uVegSunCol * (pow(mzBack, 3.0) * 0.5 + 0.03) * mzUp;
}
`;

export function createImpostorMaterial(atlas, lodU, range) {
  const m = new THREE.MeshLambertMaterial({
    map: atlas.atlasA, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, fog: true,
  });
  m.alphaToCoverage = true;
  const grid = { value: new THREE.Vector2(atlas.cols, atlas.rows) };
  const rng = { value: new THREE.Vector2(range[0], range[1]) };
  m.userData.impRange = rng;
  addCompileHook(m, 'veg:impostor', (shader) => {
    shader.uniforms.uAtlasB = { value: atlas.atlasB };
    shader.uniforms.uImpGrid = grid;
    shader.uniforms.uImpRange = rng;
    shader.uniforms.uMzLod = lodU;
    shader.uniforms.uSnowCover = U.uSnowCover;
    shader.uniforms.uSpring = U.uSpring;
    shader.uniforms.uVegSunDir = U.uSunDir;
    shader.uniforms.uVegSunCol = U.uSunColor;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform vec4 uWind;\n' + HEADER_V + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', BODY_V);
    shader.fragmentShader = HEADER_F + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      float mzThaw = max(1.0 - uSnowCover, uSpring);
      vec4 mzB = texture2D(uAtlasB, vMapUv);
      diffuseColor = mix(diffuseColor, vec4(diffuse, opacity) * mzB, mzThaw);
      diffuseColor.rgb *= 0.8;
    }
    ${FADE_F}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vec3(0.0, 0.5, 0.86));');
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLOW_F);
  });
  return m;
}

export class ImpostorLayer {
  constructor(atlas, lodU, range, capacity) {
    this.cap = capacity;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.imp = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.imp.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aImp', this.imp);
    this.material = createImpostorMaterial(atlas, lodU, range);
    this.mesh = new THREE.InstancedMesh(g, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    // receives the far shadow cascade, so forests standing in a ridge's shadow do not glow
    this.mesh.receiveShadow = true;
    this.mesh.name = 'vegetation-impostors';
    this.mesh.count = 0;
    this.n = 0;
  }

  begin() { this.n = 0; }

  // kind: the kind object (with kind.imp), view: 0 or 1
  push(kind, x, y, z, sx, sy, r, g, b, view) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const m = this.mesh.instanceMatrix.array;
    const o = i * 16;
    m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    const c = this.mesh.instanceColor.array;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
    const a = this.imp.array;
    a[i * 3] = kind.imp.tile[view];
    a[i * 3 + 1] = kind.imp.fw * sx;
    a[i * 3 + 2] = kind.imp.fh * sy;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.imp.needsUpdate = true;
  }

  setRange(near, far) { this.material.userData.impRange.value.set(near, far); }
}
