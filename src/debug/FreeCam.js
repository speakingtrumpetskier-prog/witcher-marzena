// Debug fly camera. F1 toggles (with ?debug). WASD + mouse (click to lock), Q/E down/up,
// Shift fast. Press P to log the current camera as URL params for the screenshot harness.
import * as THREE from 'three';

export class FreeCam {
  constructor(G) {
    this.G = G;
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 20;
    this.prevOwner = 'rig';
    G.addSystem('freecam', (dt) => this.update(dt), 79);
    G.renderer.domElement.addEventListener('click', () => { if (this.enabled) G.input.requestLock(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1' && (G.debug || this.enabled)) this.enabled ? this.disable() : this.enable();
      if (e.code === 'KeyP' && this.enabled) this.log();
    });
  }
  enable() {
    const G = this.G;
    this.enabled = true;
    this.prevOwner = G.cameraOwner;
    G.cameraOwner = 'debug';
    const e = new THREE.Euler().setFromQuaternion(G.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }
  disable() {
    this.enabled = false;
    this.G.cameraOwner = this.prevOwner === 'debug' ? 'rig' : this.prevOwner;
  }
  log() {
    const c = this.G.camera;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion).multiplyScalar(50).add(c.position);
    const f = (v) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
    console.log(`cam=${f(c.position)}&look=${f(d)}&fov=${c.fov}`);
  }
  update(dt) {
    if (!this.enabled || this.G.cameraOwner !== 'debug') return;
    const { input, camera, world } = this.G;
    this.yaw -= input.look.dx * 0.0025;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - input.look.dy * 0.0025));
    camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const sp = this.speed * (input.down('sprint') ? 6 : 1) * dt;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(fwd, input.move.y * sp).addScaledVector(right, input.move.x * sp);
    if (input.keys.has('KeyE')) camera.position.y += sp;
    if (input.keys.has('KeyQ')) camera.position.y -= sp;
    if (world?.grid) {
      const g = world.heightAt(camera.position.x, camera.position.z) + 1.2;
      if (camera.position.y < g) camera.position.y = g;
    }
  }
}
