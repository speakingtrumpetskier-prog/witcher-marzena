// Where a match is played. Two places in the Drowned Bell: the bar (Zbyszek stands behind it) and the middle table
// (Wojtek and Halina sit on the far bench). A site gives the table frame the stage builds in:
//
//   origin   world point on the table top at the centre of the playing area
//   yaw      rotation about Y of the frame; local +z points from the opponent to the player, +x is the player's right
//   width / depth   of the cloth
//   stand    where Vesna ends up (world x, z, yaw, floor y)
//
// resolveSite(G, 'bar' | 'table') -> site | null (null when the village is not built, e.g. a debug scene without it)
import * as THREE from 'three';

const SITES = {
  // The tavern's own anchors: barTop is the middle of the counter top, tableTop2 the middle table.
  bar: { anchor: 'barTop', yawOffset: 0, width: 1.0, depth: 0.52, standLocal: [0, 1.2], cam: { back: 0.84, up: 0.8, fov: 30, lookZ: 0.09 } },
  table: { anchor: 'tableTop2', yawOffset: -0.03, width: 1.0, depth: 0.6, standLocal: [0, 1.55], cam: { back: 0.86, up: 0.82, fov: 30, lookZ: 0.09 } },
};

export function resolveSite(G, id) {
  const def = SITES[id];
  const t = G.world?.locations?.village?.buildings?.tavern;
  const p = t?.p;
  if (!def || !p || !p.anchors?.[def.anchor]) return null;
  const origin = p.anchors[def.anchor].clone();
  const yaw = (p.yaw || 0) + def.yawOffset;
  // local +z of the frame is world (sin yaw, 0, cos yaw)
  const fz = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const fx = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const stand = origin.clone().addScaledVector(fz, def.standLocal[1]).addScaledVector(fx, def.standLocal[0]);
  const floorY = p.y + 0.05;
  return {
    id, def, origin, yaw, width: def.width, depth: def.depth, tableY: origin.y, floorY,
    stand: { x: stand.x, z: stand.z, yaw: yaw + Math.PI, y: floorY },
    cam: def.cam,
    // world position of a frame point
    toWorld(x, y, z, out = new THREE.Vector3()) {
      return out.copy(origin).addScaledVector(fx, x).addScaledVector(fz, z).setY(origin.y + y);
    },
  };
}
