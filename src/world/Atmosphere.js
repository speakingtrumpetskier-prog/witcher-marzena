// STUB (owner: atmosphere builder). Replace entirely; keep the G.atmosphere API from ARCHITECTURE.md.
import * as THREE from 'three';
import { ORDER } from '../core/G.js';

export async function init(G) {
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x6a5a4a, 1.2);
  const sun = new THREE.DirectionalLight(0xffe0b8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -60; sc.right = sc.top = 60; sc.near = 1; sc.far = 400;
  G.scene.add(hemi, sun, sun.target);
  const U = G.uniforms;
  G.atmosphere = { sun, hemi };
  G.addSystem('atmosphere', () => {
    const t = (G.time.hours - 6) / 12; // 0 sunrise .. 1 sunset
    const az = Math.PI * (0.5 + t); // east -> south -> west
    const alt = Math.sin(Math.PI * t) * 0.45;
    U.uSunDir.value.set(Math.cos(az) * Math.cos(alt), Math.sin(alt), Math.sin(az) * Math.cos(alt)).normalize();
    G.time.sunAltitude = alt;
    const focus = G.camera.position;
    sun.position.copy(focus).addScaledVector(U.uSunDir.value, 200);
    sun.target.position.copy(focus);
    sun.intensity = Math.max(0, alt) * 6;
    U.uFogColor.value.setRGB(0.62, 0.7, 0.8);
    G.scene.background.copy(U.uFogColor.value);
  }, ORDER.atmosphere);
}
