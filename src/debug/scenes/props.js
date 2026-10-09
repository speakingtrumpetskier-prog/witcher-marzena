// Props gallery. Usage: ?scene=props&view=catalog|effigy|fire|vignette&hour=13
// Loads atmosphere, sky and postfx only; falls back to its own lights if the atmosphere is a stub.
import * as THREE from 'three';
import { props, PropBatch } from '../../world/props/index.js';
import { tex } from '../../world/props/tex.js';

export const modules = ['atmosphere', 'sky', 'postfx'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function label(text, x, y, z, scene) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(20,24,34,0.72)';
  g.fillRect(0, 12, 256, 44);
  g.fillStyle = '#f2ead8';
  g.fillText(text, 128, 46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, fog: false, transparent: true }));
  s.scale.set(1.5, 0.375, 1);
  s.position.set(x, y, z);
  s.renderOrder = 50;
  scene.add(s);
  return s;
}

export function groundHeight(x, z) {
  return Math.sin(x * 0.11) * 0.02 + Math.cos(z * 0.09 + x * 0.05) * 0.025 + Math.sin((x + z) * 0.31) * 0.006;
}

export async function init(G) {
  const view = G.params.get('view') || 'catalog';
  const hour = parseFloat(G.params.get('hour'));
  if (Number.isFinite(hour)) G.time.hours = hour;

  // --- ground and height functions ------------------------------------------------------------
  const world = G.world;
  world.heightAt = groundHeight;
  world.terrainAt = groundHeight;
  world.normalAt = (x, z, out = new THREE.Vector3()) => {
    const e = 0.4;
    return out.set(groundHeight(x - e, z) - groundHeight(x + e, z), 2 * e, groundHeight(x, z - e) - groundHeight(x, z + e)).normalize();
  };
  const size = 160, seg = 160;
  const gg = new THREE.PlaneGeometry(size, size, seg, seg);
  gg.rotateX(-Math.PI / 2);
  const pa = gg.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setY(i, groundHeight(pa.getX(i), pa.getZ(i)));
  gg.computeVertexNormals();
  const uv = gg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60);
  const snowTex = tex.snow();
  const gm = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.9, map: snowTex.map, bumpMap: snowTex.bump, bumpScale: 0.6 });
  const ground = new THREE.Mesh(gg, gm);
  ground.receiveShadow = true;
  ground.name = 'gallery-ground';
  G.scene.add(ground);

  // Fallback lights when the atmosphere module is missing.
  if (!G.atmosphere) {
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a7a6a, 1.4);
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.0);
    sun.position.set(-30, 40, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.far = 200;
    G.scene.add(hemi, sun);
  }
  // Drive the lit-window uniform ourselves when the atmosphere does not (stub).
  if (!G.atmosphere || !G.atmosphere.moon) {
    G.addSystem('gallery-light', () => {
      const h = G.time.hours;
      const dusk = smooth(16.0, 18.5, h) * (1 - smooth(5.0, 6.5, h)) + (h < 6.5 ? 1 : 0) * (1 - smooth(5.0, 6.5, h));
      G.uniforms.uWindowLight.value = Math.min(1, dusk);
      G.uniforms.uNight.value = Math.min(1, smooth(18.0, 20.5, h) + (h < 5.5 ? 1 : 0));
    }, 91);
  }

  const mod = await import(/* @vite-ignore */ `./props_${view}.js`).catch((e) => { throw new Error(`props gallery view ${view}: ${e.message}`); });
  await mod.build(G, { label, groundHeight, props, PropBatch });
}
