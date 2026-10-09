// Lock-on target selection. Enemies come from G.combat?.enemies (entries with position or root,
// radius, height, alive). Nothing here needs the combat module to exist: with no enemies the
// helpers return null.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { wrapAngle } from '../../core/util.js';

const _v = new THREE.Vector3();

export function enemyPos(e, out = _v) {
  const p = e.position || e.root?.position || e;
  return out.set(p.x, p.y ?? 0, p.z);
}

export function isAlive(e) {
  if (!e) return false;
  if (e.alive === false) return false;
  if (e.health != null && e.health <= 0) return false;
  if (e.root && !e.root.parent) return false;
  return true;
}

export function liveEnemies() {
  const list = G.combat?.enemies;
  return list ? list.filter(isAlive) : [];
}

// Enemies near `pos` sorted by a score that favors the ones in front of `yaw`.
export function candidates(pos, yaw, maxDist, coneCos = -0.2) {
  const out = [];
  for (const e of liveEnemies()) {
    const p = enemyPos(e);
    const dx = p.x - pos.x, dz = p.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) continue;
    const cos = d > 1e-3 ? (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d : 1;
    if (cos < coneCos) continue;
    out.push({ e, d, cos, ang: wrapAngle(Math.atan2(dx, dz) - yaw), score: d * (1.6 - cos) });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

// T / middle mouse: lock the best candidate in the camera's view; when already locked, step to the
// next one (left to right); after the last, release.
export function cycleTarget(pos, camYaw, current) {
  const list = candidates(pos, camYaw, 30, -0.1);
  if (!list.length) return null;
  if (!current) return list[0].e;
  const byAngle = list.slice().sort((a, b) => a.ang - b.ang);
  const i = byAngle.findIndex((c) => c.e === current);
  if (i < 0) return byAngle[0].e;
  return byAngle[i + 1]?.e ?? null;
}

// Attack assist: the closest enemy roughly where the swing is aimed.
export function assistTarget(pos, yaw, maxDist = 5.5) {
  const list = candidates(pos, yaw, maxDist, 0.45);
  return list.length ? list[0].e : null;
}
