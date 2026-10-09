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

export async function bakeImpostors(G, kinds, opts = {}) {
  const snowBake = opts.snow ?? 0.62; // a little less snow than the meshes so far forests keep dark green mass
  const imp = kinds.filter((k) => k.impostor);
  const nTiles = imp.length * 2;
  const rows = Math.max(1, Math.ceil(nTiles / COLS));
  const W = COLS * TW, H = rows * TH;
  const R = G.renderer;

  // Each tile is rendered into a small multisampled target and then copied into the atlas with a
  // textured quad. (Rendering tile after tile straight into one big multisampled atlas resolves the
  // whole atlas after every call, which is extremely slow on software GL.)
  const tileRT = new THREE.WebGLRenderTarget(TW, TH, {
    colorSpace: THREE.SRGBColorSpace, depthBuffer: true, samples: 4, generateMipmaps: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const mkAtlas = () => {
    const rt = new THREE.WebGLRenderTarget(W, H, {
      colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    rt.texture.anisotropy = 4;
    return rt;
  };
  const rtA = mkAtlas(), rtB = mkAtlas();

  // frames
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

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 400);
  cam.position.set(0, 0, 150);
  cam.lookAt(0, 0, 0);

  // copy pass: one quad textured with the tile, written without blending so alpha is copied
  const copyMat = new THREE.MeshBasicMaterial({ map: tileRT.texture, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const copyScene = new THREE.Scene();
  const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat));

  // save renderer + uniform state
  const prevRT = R.getRenderTarget();
  const prevAuto = R.autoClear;
  const prevClear = new THREE.Color(); R.getClearColor(prevClear);
  const prevAlpha = R.getClearAlpha();
  const prevSun = U.uSunDir.value.clone();
  const prevWind = U.uWind.value.clone();
  const prevSnow = U.uSnowCover.value, prevSpring = U.uSpring.value;
  U.uSunDir.value.set(0, -1, 0);
  U.uWind.value.z = 0; U.uWind.value.w = 0;
  R.autoClear = true;

  let yieldT = performance.now();
  const maybeYield = async () => {
    if (performance.now() - yieldT > 20) { await new Promise((r) => setTimeout(r, 0)); yieldT = performance.now(); }
  };
  const run = async (rt, snow, spring) => {
    U.uSnowCover.value = snow; U.uSpring.value = spring;
    R.setClearColor(0x61705f, 0);
    R.setRenderTarget(rt);
    R.clear();
    for (const k of imp) {
      const meshes = k.lods[0].parts.map((p) => new THREE.Mesh(p.geometry, p.material));
      const holder = new THREE.Group();
      meshes.forEach((m) => holder.add(m));
      scene.add(holder);
      cam.left = -k.imp.fw / 2; cam.right = k.imp.fw / 2; cam.bottom = 0; cam.top = k.imp.fh;
      cam.updateProjectionMatrix();
      for (let v = 0; v < 2; v++) {
        const tile = k.imp.tile[v];
        const tx = (tile % COLS) * TW, ty = Math.floor(tile / COLS) * TH;
        holder.rotation.y = v * Math.PI * 0.5 + 0.35;
        R.setRenderTarget(tileRT);
        R.setClearColor(0x61705f, 0);
        R.autoClear = true;
        R.render(scene, cam);
        // copy into the atlas tile
        rt.viewport.set(tx, ty, TW, TH);
        rt.scissor.set(tx, ty, TW, TH);
        rt.scissorTest = true;
        R.setRenderTarget(rt);
        R.autoClear = false;
        R.render(copyScene, copyCam);
        await maybeYield();
        R.setClearColor(0x61705f, 0);
      }
      scene.remove(holder);
    }
  };
  try {
    await run(rtA, snowBake, 0);
    await run(rtB, 0, 1);
  } finally {
    R.setRenderTarget(prevRT);
    R.autoClear = prevAuto;
    R.setClearColor(prevClear, prevAlpha);
    U.uSunDir.value.copy(prevSun);
    U.uWind.value.copy(prevWind);
    U.uSnowCover.value = prevSnow; U.uSpring.value = prevSpring;
    tileRT.dispose();
    copyMat.dispose();
  }
  return { atlasA: rtA.texture, atlasB: rtB.texture, cols: COLS, rows, rts: [rtA, rtB] };
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
mzTo.y = 0.0;
mzTo = normalize(mzTo + vec3(0.0001, 0.0, 0.0));
vec3 mzRight = vec3(mzTo.z, 0.0, -mzTo.x);
vec3 mzW = mzBase + mzRight * (position.x * aImp.y) + vec3(0.0, position.y * aImp.z, 0.0);
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
  float mzD = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + vVegHash);
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
    this.mesh.receiveShadow = false;
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
