// Small hand-built snow shapes that the kits do not provide: a trodden mound that lifts a spot of ground
// to a given height (the shelf where Hanka kneels to set the milk), drifts against odd corners.
import { Kit } from '../../architecture/kit.js';
import { snowPillow } from '../../architecture/details.js';
import { placeBuilding } from '../../architecture/index.js';

// A loaf of snow whose crown reaches `topY`, rim sunk a little into the ground at groundY.
export function addMound(V, x, z, groundY, topY, rx, rz, seed = 1) {
  const kit = new Kit(seed, 'mound');
  const cy = groundY - 0.15;
  snowPillow(kit, x, cy, z, rx, Math.max(0.1, topY - cy), rz, { nu: 6, nv: 14, noise: 0.1 });
  const b = kit.finish({});
  const p = placeBuilding(V.G, b, 0, 0, 0, { snap: false, y: 0, foundation: false, skirt: false });
  V.pieces.push(p);
  return p;
}
