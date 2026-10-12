// Stone apron: a ring of fieldstone blocks around a building that runs from just under the floor down to
// the real ground at every point of the wall line. The kit's own foundation only appears when the drop
// exceeds 0.6 m and hangs from the highest ground point, so on gentle slopes (banya, smithy, houses by the
// shore) the low side used to stand clear of the snow. The apron closes that gap everywhere.
import * as THREE from 'three';
import { MB, mixC } from '../../architecture/mb.js';
import { PAL, GAIN } from '../../architecture/kit.js';
import { getMaterials } from '../../architecture/materials.js';
import { rot } from './util.js';

export function addApron(V, rec, opts = {}) {
  const { G } = V;
  const fp = rec.fp;
  if (!fp) return null;
  const y0 = rec.p.y;
  const step = 0.8;
  const mb = new MB('apron', { uv: [2, 2] });
  let pieces = 0;
  let seed = Math.floor(rec.x * 7 + rec.z * 13) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const side = (len, off, sy) => {
    // a wall line of half length `len` at distance `off` from the center, facing yaw offset sy
    for (let s = -len + step / 2; s < len; s += step) {
      // local point on the wall line, in the root's frame (rotated by sy for this side)
      const c = Math.cos(sy), n = Math.sin(sy);
      const lx = s * c + off * n, lz = -s * n + off * c;
      const [wx, wz] = rot(lx, lz, rec.yaw);
      const [ox, oz] = rot(n * 0.3, c * 0.3, rec.yaw); // 0.3 m outward in world
      const gh = Math.min(G.world.heightAt(rec.x + wx, rec.z + wz), G.world.heightAt(rec.x + wx + ox, rec.z + wz + oz));
      const top = -0.12, bottom = gh - y0 - 0.28;
      if (top - bottom < 0.12 || y0 - gh < 0.1) continue;
      const col = mixC(PAL.stoneDark, PAL.stone, rnd()).multiplyScalar(GAIN * (0.82 + rnd() * 0.18));
      mb.at(lx, 0, lz, sy, (m) => {
        m.box(0, (top + bottom) / 2, 0.0, step * 0.97, top - bottom, 0.44, col, { uv: [2, 2], top: col, ry: (rnd() - 0.5) * 0.06 });
      });
      pieces++;
    }
  };
  const hw = fp.hw + (opts.out ?? 0.12), hd = fp.hd + (opts.out ?? 0.12);
  // sy: rotation of the frame so that +z of the frame points out of the wall
  side(hw, hd, 0); // front (+z)
  side(hw, hd, Math.PI); // back
  side(hd, hw, Math.PI / 2); // right (+x)
  side(hd, hw, -Math.PI / 2); // left
  if (!pieces) return null;
  const geo = mb.build();
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, getMaterials().stone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${rec.id}:apron`;
  rec.p.root.add(mesh);
  return mesh;
}
