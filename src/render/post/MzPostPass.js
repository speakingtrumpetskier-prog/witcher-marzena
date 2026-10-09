// The whole post chain after the scene render, as one EffectComposer pass:
//   1. hunter-senses clue mask (only while senses are on): objects on SENSES_LAYER rendered
//      white at half res, dimmed where the scene hides them
//   2. bloom: soft-knee bright pass at 1/2 res, dual-filter down/up chain to 1/64
//   3. god rays: sky-around-the-sun mask at 1/4 res, radial blur toward the sun
//   4. composite: exposure, tone map, grade, senses / echo / frost / flash, vignette, grain
// Reads the scene color and depth from the composer's read buffer (MSAA resolved).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  FS_VERT, PREFILTER_FRAG, DOWN_FRAG, UP_FRAG, RAYMASK_FRAG, RAYBLUR_FRAG, COMPOSITE_FRAG,
} from './shaders.js';
import { addCompileHook } from '../Materials.js';

export const SENSES_LAYER = 5;
const LEVELS = 6;

function rt(w, h, type = THREE.HalfFloatType) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type, depthBuffer: false });
  t.texture.generateMipmaps = false;
  t.texture.minFilter = THREE.LinearFilter;
  t.texture.magFilter = THREE.LinearFilter;
  return t;
}

function mat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

export class MzPostPass extends Pass {
  constructor(G) {
    super();
    this.G = G;
    this.needsSwap = false;
    this.bloomEnabled = G.quality !== 'low';
    this.raysEnabled = G.quality !== 'low';
    this.width = 1; this.height = 1;

    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this.black = black;

    this.down = [];
    this.up = [];
    for (let i = 0; i < LEVELS; i++) { this.down.push(rt(1, 1)); this.up.push(rt(1, 1)); }
    this.rayA = rt(1, 1, THREE.UnsignedByteType);
    this.rayB = rt(1, 1, THREE.UnsignedByteType);
    this.mask = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true });
    this.maskActive = false;

    this.prefilter = mat(PREFILTER_FRAG, {
      tColor: { value: null }, tMask: { value: black }, uTexel: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uThreshold: { value: 3.2 }, uKnee: { value: 1.6 },
      uSenses: { value: 0 },
    });
    this.downMat = mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mat(UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 1 } });
    this.rayMaskMat = mat(RAYMASK_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
      uSunUV: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uExposure: { value: 1 },
    });
    this.rayBlurMat = mat(RAYBLUR_FRAG, {
      tSrc: { value: null }, uSunUV: { value: new THREE.Vector2() }, uDensity: { value: 0.9 },
      uDecay: { value: 0.965 }, uWeight: { value: 1 },
    });
    this.composite = mat(COMPOSITE_FRAG, {
      tColor: { value: null }, tBloom: { value: black }, tRays: { value: black }, tMask: { value: black },
      tFrost: { value: black }, uTexel: { value: new THREE.Vector2() }, uMaskTexel: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uExposure: { value: 1 }, uBloom: { value: 0 }, uRays: { value: 0 },
      uRaysColor: { value: new THREE.Color(1, 0.8, 0.6) }, uTint: { value: new THREE.Color(1, 1, 1) },
      uShoulder: { value: new THREE.Vector2(0.6, 0.9) },
      uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) },
      uSat: { value: 1 }, uContrast: { value: 1 }, uVignette: { value: 0.3 }, uGrain: { value: 0.03 },
      uTime: { value: 0 }, uSenses: { value: 0 }, uSensesTime: { value: 0 },
      uEcho: { value: 0 }, uFrost: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 },
    });
    this.quad = new FullScreenQuad(this.composite);

    // Clue mask materials (one per glow color): the clue color where visible, dimmed where
    // something in front hides it. Marked objects swap to these only for the mask pass.
    this.maskUniforms = { tSceneDepth: { value: null }, uMaskRes: { value: new THREE.Vector2(1, 1) }, uNearFar: { value: new THREE.Vector2(0.1, 9000) } };
    this.maskMats = new Map();
    this.clues = new Map(); // Object3D -> THREE.Color (filled by PostFX.markClue)
    this._swap = [];
    this._savedClear = new THREE.Color();

    // Values driven by PostFX each frame.
    this.state = {
      exposure: 1, bloom: 0.08, rays: 0, sunUV: new THREE.Vector2(0.5, 0.5), raysColor: new THREE.Color(1, 0.8, 0.6),
      senses: 0, sensesTime: 0, echo: 0, frost: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1),
      frostTex: null, time: 0,
    };
    this.camera = null;
    this.scene = null;
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    let bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    for (let i = 0; i < LEVELS; i++) {
      this.down[i].setSize(bw, bh);
      this.up[i].setSize(bw, bh);
      bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2));
    }
    this.rayA.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
    this.rayB.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
    this.mask.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
  }

  draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  maskMaterialFor(color) {
    const key = color.getHex();
    let m = this.maskMats.get(key);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color, fog: false });
    addCompileHook(m, 'mzSensesMask', (shader) => {
      Object.assign(shader.uniforms, this.maskUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform sampler2D tSceneDepth;\nuniform vec2 uMaskRes;\nuniform vec2 uNearFar;\n' +
          'float mzViewZ(float d) { float n = uNearFar.x, f = uNearFar.y; return (n * f) / ((f - n) * d - f); }\nvoid main() {')
        .replace(/}\s*$/, '  float sd = texture2D(tSceneDepth, gl_FragCoord.xy / uMaskRes).r;\n' +
          '  float vis = mzViewZ(gl_FragCoord.z) >= mzViewZ(sd) - 0.35 ? 1.0 : 0.4;\n' +
          '  gl_FragColor = vec4(diffuse * vis, 1.0);\n}');
    });
    this.maskMats.set(key, m);
    return m;
  }

  renderMask(renderer, depthTex) {
    const { scene, camera } = this;
    if (!scene || !camera) return;
    const mu = this.maskUniforms;
    mu.tSceneDepth.value = depthTex;
    mu.uMaskRes.value.set(this.mask.width, this.mask.height);
    mu.uNearFar.value.set(camera.near, camera.far);
    // Swap every marked mesh to the mask material of its clue color.
    const swap = this._swap;
    swap.length = 0;
    for (const [root, color] of this.clues) {
      const mat = this.maskMaterialFor(color);
      root.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine) || !o.material) return;
        swap.push(o, o.material);
        o.material = Array.isArray(o.material) ? o.material.map(() => mat) : mat;
      });
    }
    const savedBg = scene.background, savedOverride = scene.overrideMaterial, savedMask = camera.layers.mask;
    const savedAuto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this._savedClear);
    const savedAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.overrideMaterial = null;
    camera.layers.set(SENSES_LAYER);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    camera.layers.mask = savedMask;
    scene.overrideMaterial = savedOverride;
    scene.background = savedBg;
    renderer.shadowMap.autoUpdate = savedAuto;
    renderer.setClearColor(this._savedClear, savedAlpha);
    for (let i = 0; i < swap.length; i += 2) swap[i].material = swap[i + 1];
    swap.length = 0;
  }

  render(renderer, writeBuffer, readBuffer) {
    const s = this.state;
    const color = readBuffer.texture;
    const depth = readBuffer.depthTexture;
    const w = this.width, h = this.height;
    const c = this.composite.uniforms;

    // 1. Senses mask.
    const sensesOn = s.senses > 0.001;
    if (sensesOn && depth) {
      this.renderMask(renderer, depth);
      this.maskActive = true;
    } else if (this.maskActive) {
      renderer.setRenderTarget(this.mask);
      renderer.clear(true, true, false);
      this.maskActive = false;
    }
    const maskTex = sensesOn ? this.mask.texture : this.black;

    // 2. Bloom.
    if (this.bloomEnabled || sensesOn) {
      const p = this.prefilter.uniforms;
      p.tColor.value = color;
      p.uTexel.value.set(1 / w, 1 / h);
      p.uExposure.value = s.exposure;
      p.tMask.value = maskTex;
      p.uSenses.value = s.senses;
      this.draw(renderer, this.prefilter, this.down[0]);
      for (let i = 1; i < LEVELS; i++) {
        const d = this.downMat.uniforms;
        d.tSrc.value = this.down[i - 1].texture;
        d.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
        this.draw(renderer, this.downMat, this.down[i]);
      }
      let src = this.down[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        const u = this.upMat.uniforms;
        u.tSrc.value = src.texture;
        u.tBase.value = this.down[i].texture;
        u.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        u.uScatter.value = 0.85;
        this.draw(renderer, this.upMat, this.up[i]);
        src = this.up[i];
      }
      c.tBloom.value = this.up[0].texture;
      c.uBloom.value = s.bloom;
    } else {
      c.tBloom.value = this.black;
      c.uBloom.value = 0;
    }

    // 3. God rays.
    if (this.raysEnabled && s.rays > 0.001 && depth) {
      const m = this.rayMaskMat.uniforms;
      m.tColor.value = color;
      m.tDepth.value = depth;
      m.uTexel.value.set(1 / w, 1 / h);
      m.uSunUV.value.copy(s.sunUV);
      m.uAspect.value = w / h;
      m.uExposure.value = s.exposure;
      this.draw(renderer, this.rayMaskMat, this.rayA);
      const b = this.rayBlurMat.uniforms;
      b.tSrc.value = this.rayA.texture;
      b.uSunUV.value.copy(s.sunUV);
      b.uDensity.value = 0.95;
      b.uDecay.value = 0.975;
      b.uWeight.value = 2.2;
      this.draw(renderer, this.rayBlurMat, this.rayB);
      b.tSrc.value = this.rayB.texture;
      b.uDensity.value = 0.35;
      b.uDecay.value = 0.99;
      b.uWeight.value = 1.15;
      this.draw(renderer, this.rayBlurMat, this.rayA);
      c.tRays.value = this.rayA.texture;
      c.uRays.value = s.rays;
      c.uRaysColor.value.copy(s.raysColor);
    } else {
      c.tRays.value = this.black;
      c.uRays.value = 0;
    }

    // 4. Composite to screen.
    c.tColor.value = color;
    c.tMask.value = maskTex;
    c.tFrost.value = s.frost > 0.001 && s.frostTex ? s.frostTex : this.black;
    c.uTexel.value.set(1 / w, 1 / h);
    c.uMaskTexel.value.set(1 / this.mask.width, 1 / this.mask.height);
    c.uAspect.value = w / h;
    c.uExposure.value = s.exposure;
    c.uTime.value = s.time;
    c.uSenses.value = s.senses;
    c.uSensesTime.value = s.sensesTime;
    c.uEcho.value = s.echo;
    c.uFrost.value = s.frost;
    c.uFlash.value = s.flash;
    c.uFlashColor.value.copy(s.flashColor);
    this.draw(renderer, this.composite, this.renderToScreen ? null : writeBuffer);
  }

  dispose() {
    for (const t of [...this.down, ...this.up, this.rayA, this.rayB, this.mask]) t.dispose();
    for (const m of [this.prefilter, this.downMat, this.upMat, this.rayMaskMat, this.rayBlurMat, this.composite, ...this.maskMats.values()]) m.dispose();
    this.quad.dispose();
  }
}
