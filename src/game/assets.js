// src/game/assets.js
// Asset pipeline: glTF loading, texture caching, PBR material prep
// Ready for future .glb models — graceful fallback when assets aren't present

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.gltfLoader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.rgbeLoader = new RGBELoader();

    this.gltfCache = new Map();
    this.texCache = new Map();
    this.hdrCache = new Map();
  }

  /**
   * Load a glTF/glb model with caching.
   * @param {string} url - Path to .glb/.gltf file
   * @returns {Promise<import("three/addons/loaders/GLTFLoader.js").GLTF>}
   */
  loadGLTF(url) {
    if (!this.gltfCache.has(url)) {
      this.gltfCache.set(
        url,
        new Promise((resolve, reject) => {
          this.gltfLoader.load(url, resolve, undefined, reject);
        })
      );
    }
    return this.gltfCache.get(url);
  }

  /**
   * Load a texture with caching and sensible defaults.
   * @param {string} url
   * @param {Object} opts
   * @param {boolean} [opts.srgb=true] - Use sRGB color space (true for albedo/emissive, false for normal/roughness)
   * @param {[number,number]} [opts.repeat] - Texture repeat
   * @param {boolean} [opts.flipY] - Override flipY
   * @returns {Promise<THREE.Texture>}
   */
  loadTexture(url, opts = {}) {
    const key = `${url}|${opts.srgb !== false ? "srgb" : "lin"}|${opts.repeat?.join(",") ?? ""}`;
    if (!this.texCache.has(key)) {
      this.texCache.set(
        key,
        new Promise((resolve, reject) => {
          this.texLoader.load(
            url,
            (tex) => {
              if (opts.flipY === false) tex.flipY = false;
              tex.colorSpace = opts.srgb !== false
                ? THREE.SRGBColorSpace
                : THREE.LinearSRGBColorSpace;
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
              tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
              resolve(tex);
            },
            undefined,
            reject
          );
        })
      );
    }
    return this.texCache.get(key);
  }

  /**
   * Load an HDR environment map.
   * @param {string} url - Path to .hdr file
   * @returns {Promise<THREE.Texture>}
   */
  loadHDR(url) {
    if (!this.hdrCache.has(url)) {
      this.hdrCache.set(
        url,
        new Promise((resolve, reject) => {
          this.rgbeLoader.load(
            url,
            (tex) => {
              tex.mapping = THREE.EquirectangularReflectionMapping;
              resolve(tex);
            },
            undefined,
            reject
          );
        })
      );
    }
    return this.hdrCache.get(url);
  }

  /**
   * Apply shadow and PBR defaults to an imported glTF scene.
   * Call this after loading a model to ensure consistent rendering.
   * @param {THREE.Object3D} root
   * @param {Object} opts
   * @param {boolean} [opts.castShadow=true]
   * @param {boolean} [opts.receiveShadow=true]
   */
  prepareModel(root, opts = {}) {
    const castShadow = opts.castShadow ?? true;
    const receiveShadow = opts.receiveShadow ?? true;

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;

      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      });
    });
  }

  /**
   * Try to set an HDR environment on the scene. Gracefully fails if file not found.
   * @param {THREE.Scene} scene
   * @param {string} url
   */
  async trySetEnvironment(scene, url) {
    try {
      const hdr = await this.loadHDR(url);
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      hdr.dispose();
      pmrem.dispose();
      return true;
    } catch {
      // HDR not available yet — that's fine
      return false;
    }
  }
}
