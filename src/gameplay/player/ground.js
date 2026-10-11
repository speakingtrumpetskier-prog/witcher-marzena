// Shared ground queries for the player and the horse: slope, surface grip, steep-rock blocking.
//
//   slopeAt(x, z, dx, dz, out)   normal.y, uphill alignment of the unit move dir (dx, dz) and the uphill unit vector
//   moveFactor(info)             speed multiplier from slope (uphill slows, downhill helps a little)
//   blocked(info)                true when the move heads up a slope too steep to climb
//   surfaceInfo(surface)         grip numbers for 'snow' | 'road' | 'ice' | 'rock' | 'wood' | 'water'
//   groundY(x, z, yHint)         terrain height, or an interior floor from G.world.floorAt when a building provides one
//   surfaceAt(x, z)              G.world.surfaceAt, with interiors (G.world.indoors) reading as wood
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { smoothstep } from '../../core/util.js';

const _n = new THREE.Vector3();

// Terrain normal.y below which uphill travel is refused (about 50 degrees) and above which it is free.
export const STEEP = 0.64;
const GENTLE = 0.93;

export function slopeAt(x, z, dx, dz, out = {}) {
  (G.world.walkNormalAt || G.world.normalAt).call(G.world, x, z, _n);
  const h = Math.hypot(_n.x, _n.z);
  out.ny = _n.y;
  // The normal's horizontal part points downhill, so uphill is its negation.
  out.ux = h > 1e-5 ? -_n.x / h : 0;
  out.uz = h > 1e-5 ? -_n.z / h : 0;
  out.uphill = out.ux * dx + out.uz * dz; // -1 straight downhill .. 1 straight uphill
  out.steep = smoothstep(GENTLE, STEEP, _n.y); // 0 flat .. 1 at the climb limit
  return out;
}

export function moveFactor(s) {
  if (s.uphill >= 0) return 1 - 0.62 * s.steep * s.uphill - 0.1 * s.uphill;
  return 1 + 0.14 * s.steep * -s.uphill;
}

export function blocked(s) {
  return s.ny < STEEP && s.uphill > 0.05;
}

const SURF = {
  // acc / dec in m/s^2 toward the wanted velocity, turn multiplier, speed multiplier
  snow: { acc: 17, dec: 22, turn: 1, mul: 0.94, step: 'step_snow' },
  road: { acc: 19, dec: 24, turn: 1, mul: 1, step: 'step_road' },
  rock: { acc: 19, dec: 24, turn: 1, mul: 0.96, step: 'step_road' },
  wood: { acc: 19, dec: 24, turn: 1, mul: 1, step: 'step_wood' },
  ice: { acc: 3.1, dec: 1.35, turn: 0.45, mul: 1, step: 'step_ice' },
  water: { acc: 9, dec: 14, turn: 0.8, mul: 0.6, step: 'step_snow' },
};
export function surfaceInfo(surface) {
  return SURF[surface] || SURF.snow;
}

export function groundY(x, z, yHint) {
  const w = G.world;
  const f = w.floorAt ? w.floorAt(x, z, yHint) : null;
  return f != null ? f : w.heightAt(x, z);
}

export function surfaceAt(x, z) {
  const w = G.world;
  if (w.indoors && w.indoors(x, z)) return 'wood';
  return w.surfaceAt(x, z);
}
