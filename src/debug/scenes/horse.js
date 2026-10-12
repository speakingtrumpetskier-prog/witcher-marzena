// Horse gallery: Kasza on snowy ground with her own lights.
//
//   ?scene=horse&gait=idle|walk|trot|gallop   (moves along +X, camera follows from the side)
//   &clip=rear|snort    one-shot (loops every few seconds)
//   &rider=1            Vesna in the saddle (ride_idle / ride_trot / ride_gallop by gait)
//   &still=1            gait in place (treadmill)   &animStep=0.04 deterministic steps
//   &side=1 / &front=1 / &three=1 camera presets
import * as THREE from 'three';

const qs = new URLSearchParams(location.search);
export const modules = qs.has('atmo') ? ['atmosphere', 'sky', 'postfx', 'characters'] : ['characters'];

export async function init(G) {
  const P = G.params;
  G.characters.heightAt = () => 0;
  G.scene.background = new THREE.Color(0x9fb0c4);
  if (!P.has('atmo')) {
    const hemi = new THREE.HemisphereLight(0xc4d6f0, 0x8a8478, 1.15);
    const key = new THREE.DirectionalLight(0xffdcb4, 2.7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0xaecbff, 1.4);
    rim.position.set(-5, 4, -6);
    G.scene.add(hemi, key, key.target, rim);
    G.horseLights = { key };
  }
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e9eef4'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v - 12},${v - 4},${v + 4},0.4)`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  ground.receiveShadow = true;
  G.scene.add(ground);

  const h = G.characters.createHorse('kasza');
  G.scene.add(h.root);
  h.setPosition(0, 0);
  h.yaw = Math.PI / 2;
  const gait = P.get('gait') || 'idle';
  const speeds = { idle: 0, walk: 1.7, trot: 3.6, gallop: 9 };
  const v = parseFloat(P.get('speed') || String(speeds[gait] ?? 0));
  h.setGait(v);
  h.speed = v;
  const clip = P.get('clip');
  if (clip) {
    const loop = () => h.play(clip).then(() => setTimeout(loop, 600));
    loop();
  }
  let rider = null;
  if (P.has('rider')) {
    rider = G.characters.create('vesna');
    h.saddle.add(rider.root);
    rider.autoGround = false;
    rider.root.position.set(0, 0, 0);
    const rc = v > 6 ? 'ride_gallop' : v > 2.5 ? 'ride_trot' : 'ride_idle';
    rider.play(rc, { loop: true, fade: 0 });
  }
  const step = parseFloat(P.get('animStep'));
  if (v > 0 && !P.has('still')) {
    G.addSystem('horse-move', (dt) => {
      if (step > 0) dt = step;
      h.root.position.x += h.speed * dt;
      if (h.root.position.x > 50) h.root.position.x = -50;
    }, 40);
  }
  const cam = new THREE.Vector3();
  const mode = P.has('front') ? 'front' : P.has('three') ? 'three' : 'side';
  if (!P.has('cam')) {
    G.cameraOwner = 'gallery';
    G.addSystem('horse-cam', () => {
      const p = h.root.position;
      if (mode === 'side') cam.set(p.x + 0.4, 1.35, p.z + 5.4);
      else if (mode === 'front') cam.set(p.x + 4.2, 1.5, p.z + 1.8);
      else cam.set(p.x + 3.2, 1.9, p.z + 3.8);
      G.camera.position.copy(cam);
      G.camera.lookAt(p.x + (mode === 'side' ? 0.2 : 0), 1.05, p.z);
      if (G.horseLights) {
        G.horseLights.key.position.set(p.x + 4, 6, p.z + 5);
        G.horseLights.key.target.position.copy(p);
      }
    }, 81);
  }
  G.camera.fov = 38;
  G.camera.updateProjectionMatrix();
  G.horseGallery = { h, rider };
}
