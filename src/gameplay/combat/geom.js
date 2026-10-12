// Small geometry helpers shared by combat and the creatures: enemy capsules, arc and cone tests.
// An enemy is treated as a vertical capsule: position (feet), radius, height.
import * as THREE from 'three';

const _tmp = new THREE.Vector3();

export function posOf(e, out = _tmp) {
  const p = e.position || e.root?.position || e;
  return out.set(p.x, p.y ?? 0, p.z);
}

// Center of the body (where blows land and bars attach).
export function centerOf(e, out = new THREE.Vector3()) {
  if (e.hitCenter) return e.hitCenter(out);
  const p = posOf(e, out);
  p.y += (e.height ?? 1.2) * 0.5;
  return p;
}

// Horizontal distance from (ox, oz) to the capsule surface, and the angle between `dir` (unit, xz)
// and the direction to the enemy, widened by the angular size of its radius.
export function arcTest(ox, oz, dirX, dirZ, e) {
  const p = posOf(e);
  const dx = p.x - ox, dz = p.z - oz;
  const d = Math.hypot(dx, dz);
  const r = e.radius ?? 0.5;
  const surface = Math.max(0, d - r);
  let ang = 0;
  if (d > 1e-4) {
    const cos = (dx * dirX + dz * dirZ) / (d * (Math.hypot(dirX, dirZ) || 1));
    ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    // A big body is hit even when its center is a little outside the arc.
    ang = Math.max(0, ang - Math.atan2(r, Math.max(d, r)) * 0.8);
  }
  return { d, surface, ang, dx, dz };
}

export function yOverlap(y, e, slack = 0.35) {
  const p = posOf(e);
  return y >= p.y - slack && y <= p.y + (e.height ?? 1.2) + slack;
}

export function isLive(e) {
  return !!e && e.alive !== false && (e.health == null || e.health > 0) && !(e.root && !e.root.parent);
}

export function randSign() { return Math.random() < 0.5 ? -1 : 1; }
