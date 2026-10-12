// Cheap shadow casters for the atmosphere's far shadow cascade (a coarse map over a couple of
// kilometers that is re-rendered only now and then). Real tree meshes only exist near the camera,
// so without this the distant forests would stand in the snow without throwing any shadow.
//
// One InstancedMesh of tiny cones. It draws nothing in the main pass (count is 0) and only gets a
// non-zero instance count inside onBeforeShadow when three renders it into a shadow camera whose
// frustum is wide (the far cascade); the sharp near cascade never sees it, the real LOD 0 and LOD 1
// meshes cover that. Owner: vegetation builder.
import * as THREE from 'three';

// per species: where the crown starts (fraction of height), crown height fraction, radius factor
const SHAPES = {
  spruce: [0.1, 0.9, 0.85],
  pine: [0.6, 0.4, 0.8],
  birch: [0.35, 0.65, 0.55],
  snag: [0.2, 0.8, 0.12],
  // extra species (see kinds.js)
  larch: [0.18, 0.82, 0.6],
  oldspruce: [0.08, 0.7, 0.85],
  rowan: [0.3, 0.7, 0.5],
  oak: [0.3, 0.7, 0.75],
  corkscrew: [0.5, 0.5, 0.6],
  weeping: [0.1, 0.9, 0.85],
  bottle: [0.4, 0.6, 0.6],
  knot: [0.4, 0.6, 0.4],
  arch: [0.35, 0.65, 0.5],
};

export class ShadowProxyLayer {
  constructor(G, layer, capacity = 30000) {
    this.G = G;
    this.layer = layer;
    this.cap = capacity;
    // open cone: apex at y = 1, rim at y = 0, radius 1, seven sides
    const sides = 7;
    const pos = [0, 1, 0];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pos.push(Math.cos(a), 0, Math.sin(a));
    }
    const idx = [];
    for (let i = 0; i < sides; i++) idx.push(0, 1 + i, 1 + ((i + 1) % sides));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.name = 'vegetation-far-shadow-proxies';
    this.n = 0;
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.minD = 90;
    this.maxD = 1300;
    this.mesh.onBeforeShadow = (renderer, object, camera, shadowCamera) => {
      const wide = shadowCamera.right - shadowCamera.left > 600;
      object.count = wide ? this.n : 0;
    };
    this.mesh.onAfterShadow = (renderer, object) => { object.count = 0; };
  }

  // Rebuild from the tree layer when the camera moved far enough or instances were cleared.
  update(camera, force = false) {
    const cp = camera.position;
    if (!force && cp.distanceToSquared(this.lastCam) < 40 * 40) return;
    this.lastCam.copy(cp);
    const arr = this.mesh.instanceMatrix.array;
    let n = 0;
    const kinds = this.layer.kinds;
    const shape = kinds.map((k) => SHAPES[k.species] || null);
    const minD2 = this.minD * this.minD, maxD2 = this.maxD * this.maxD;
    for (const ch of this.layer.list) {
      const dx = ch.cenX - cp.x, dz = ch.cenZ - cp.z;
      const dc = Math.sqrt(dx * dx + dz * dz);
      if (dc - ch.rad > this.maxD || dc + ch.rad < this.minD) continue;
      for (let i = 0; i < ch.n; i++) {
        const sh = shape[ch.kind[i]];
        if (!sh || !ch.alive[i] || n >= this.cap) continue;
        const o = i * 16;
        const x = ch.m[o + 12], y = ch.m[o + 13], z = ch.m[o + 14];
        const ddx = x - cp.x, ddz = z - cp.z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < minD2 || d2 > maxD2) continue;
        const k = kinds[ch.kind[i]];
        const H = k.height * ch.sy[i];
        const R = Math.max(0.4, k.radius * ch.sx[i] * sh[2]);
        const b = n * 16;
        arr[b] = R; arr[b + 1] = 0; arr[b + 2] = 0; arr[b + 3] = 0;
        arr[b + 4] = 0; arr[b + 5] = H * sh[1]; arr[b + 6] = 0; arr[b + 7] = 0;
        arr[b + 8] = 0; arr[b + 9] = 0; arr[b + 10] = R; arr[b + 11] = 0;
        arr[b + 12] = x; arr[b + 13] = y + H * sh[0]; arr[b + 14] = z; arr[b + 15] = 1;
        n++;
      }
    }
    this.n = n;
    this.mesh.instanceMatrix.clearUpdateRanges();
    if (n > 0) this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
