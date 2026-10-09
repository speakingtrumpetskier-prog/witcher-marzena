// Frozen and hanging people, built from the characters module and posed once.
//
// A "frozen" character is created unregistered (so the shared update system never touches it), put
// in a pose by stepping its animator a few seconds, and then left alone: no per-frame cost besides
// skinning. Characters cost 0.3 to 0.6 s each to build, so every location uses very few.
//
//   const c = await frozenChar(G, 'villager_m_2', { x, z, yaw, base: 'kneel_idle', upper: 'look_back' });
//   c.root, c.bones, ...                                  (see characters/Character.js)
import * as THREE from 'three';
import { ORDER } from '../../../core/G.js';

let mod = null;
async function characters() {
  mod ||= await import('../../../characters/index.js');
  return mod;
}

// opts: x, z, y (absolute; default ground), yaw, base (clip), upper (clip), steps (seconds of animation),
// tint ([r, g, b] multiplier for a frosted look), lowDetail, hold (keep upper clip), pose(c) after settling.
export async function frozenChar(G, id, o = {}) {
  const { createCharacter } = await characters();
  const c = createCharacter(id, { register: false, lowDetail: o.lowDetail !== false });
  c.autoGround = false;
  const y = o.y ?? G.world.heightAt(o.x, o.z);
  c.root.position.set(o.x, y, o.z);
  c.yaw = o.yaw || 0;
  G.scene.add(c.root);
  if (o.base) c.play(o.base, { fade: 0, loop: true });
  if (o.upper) c.playUpper(o.upper, { fade: 0, hold: true, loop: false });
  const total = o.steps ?? 3.2;
  for (let t = 0; t < total; t += 1 / 20) c.update(1 / 20, { lod: 1, ik: false, distance: 20 });
  if (o.pose) o.pose(c);
  c.root.updateMatrixWorld(true);
  if (o.tint) c.material.color.setRGB(o.tint[0], o.tint[1], o.tint[2]);
  c.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  c.frozen = true;
  return c;
}

// Add a little local rotation to a bone after the pose settled: ax, ay, az in degrees (clip convention).
export function nudge(c, bone, ax = 0, ay = 0, az = 0) {
  const b = c.bones[bone];
  if (!b) return;
  const e = new THREE.Euler(THREE.MathUtils.degToRad(ax), THREE.MathUtils.degToRad(ay), THREE.MathUtils.degToRad(az), 'XYZ');
  b.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
  b.updateMatrixWorld(true);
}

// A man hanged from a limb: standing idle pose, head fallen forward and to the side, feet clear of the ground,
// slowly turning in the wind. `tip` is the rope anchor (world); the figure hangs so the rope meets the neck.
export async function hangedMan(G, id, o = {}) {
  const c = await frozenChar(G, id, {
    ...o,
    base: 'idle',
    steps: 1.2,
    pose: (ch) => {
      nudge(ch, 'neck', 26, 6, 10);
      nudge(ch, 'head', 24, 0, 16);
      nudge(ch, 'chest', 8, 0, 3);
      nudge(ch, 'spine', 6, 0, 0);
      nudge(ch, 'shoulderL', 0, 0, 6);
      nudge(ch, 'shoulderR', 0, 0, -6);
      nudge(ch, 'footL', 40, 0, 0);
      nudge(ch, 'footR', 44, 0, 0);
      nudge(ch, 'thighL', 3, 0, 2);
      nudge(ch, 'thighR', 1, 0, -2);
    },
  });
  const pivot = new THREE.Group();
  pivot.position.set(o.tip.x, o.tip.y, o.tip.z);
  G.scene.add(pivot);
  const hang = o.hang ?? 1.55; // neck below the limb
  pivot.add(c.root);
  c.root.position.set(0, -(hang + (c.height || 1.7) * 0.86), 0);
  c.root.rotation.y = o.yaw || 0;
  const phase = Math.random() * 6;
  G.addSystem(`hanged:${id}`, (dt, t) => {
    const w = G.uniforms.uWind.value.z;
    pivot.rotation.z = Math.sin(t * 0.55 + phase) * (0.012 + 0.03 * w);
    pivot.rotation.x = Math.sin(t * 0.37 + phase * 2) * (0.01 + 0.025 * w);
    pivot.rotation.y = Math.sin(t * 0.21 + phase) * 0.18;
  }, ORDER.late);
  c.pivot = pivot;
  return c;
}

// Hoarfrost on a frozen person's face: a translucent crust over the face and brow, parented to the head bone.
export function frostFace(c, o = {}) {
  const head = c.bones.head;
  if (!head) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0xdbeaf3, roughness: 0.2, transparent: true, opacity: o.opacity ?? 0.5, emissive: 0x24465a, emissiveIntensity: 0.3, depthWrite: false });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, Math.PI / 2 - 1.0, 2.0, 0.55, 2.3), mat);
  m.scale.set(0.92, 1.16, 1.0);
  m.position.set(0, o.y ?? 0.095, o.z ?? 0.015);
  m.renderOrder = 3;
  head.add(m);
  // rime on the hair and a ring of ice at the collar
  const rime = new THREE.Mesh(new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xeef5fa, roughness: 0.6, transparent: true, opacity: 0.8, depthWrite: false }));
  rime.scale.set(0.95, 1.1, 1.0);
  rime.position.set(0, (o.y ?? 0.095) + 0.015, -0.005);
  rime.renderOrder = 3;
  head.add(rime);
}
