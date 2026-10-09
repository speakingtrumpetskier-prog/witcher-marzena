// Street verges: snow berms banked along the roads, and a scattering of cart, barrels, crates, woodpiles and
// sleds at the edges, so no street is a bare white ribbon. Cheap props only (triangle budget).
import { ROADS } from '../../layout.js';
import { seeded } from './util.js';


function sampleAt(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= acc + len || i === pts.length - 2) {
      const t = Math.max(0, Math.min(len, s - acc));
      return { x: ax + ((bx - ax) / len) * t, z: az + ((bz - az) / len) * t, tx: (bx - ax) / len, tz: (bz - az) / len };
    }
    acc += len;
  }
  return null;
}

const CLUSTERS = [
  // [weight, builder(add, x, z, tx, tz, rng)]
  [3, (D, x, z, tx, tz, rng) => D.tryPut('snowDrift', [[x, z, Math.atan2(-tz, tx)]], { collide: false, opts: { width: 4 + rng() * 3, depth: 1.1, height: 0.55 } }, 0.5)],
  [2, (D, x, z, tx, tz, rng) => { D.tryPut('barrel', [[x, z, rng() * 6]], { seed: Math.floor(rng() * 4) }, 0.5); D.tryPut('barrel', [[x + 0.8, z + 0.3, rng() * 6]], { seed: 2 }, 0.5); D.tryPut('bucket', [[x - 0.7, z + 0.4, 0]], {}, 0.3); }],
  [2, (D, x, z, tx, tz, rng) => { D.tryPut('crateStack', [[x, z, rng() * 3]], {}, 0.8); D.tryPut('sack', [[x + 1.1, z, rng() * 6]], {}, 0.4); }],
  [2, (D, x, z, tx, tz) => { D.tryPut('woodpile', [[x, z, Math.atan2(-tz, tx)]], {}, 1.1); D.tryPut('choppingBlock', [[x + 1.8, z + 0.6, 0]], {}, 0.5); }],
  [1, (D, x, z, tx, tz, rng) => D.tryPut('cart', [[x, z, Math.atan2(-tz, tx) + (rng() - 0.5) * 0.8]], { opts: { variant: rng() < 0.5 ? 'empty' : 'sacks' } }, 1.7)],
  [1, (D, x, z) => { D.tryPut('sled', [[x, z, 0.4]], {}, 0.9); D.tryPut('skis', [[x + 1.0, z + 0.5, 1.2]], {}, 0.4); }],
  [1, (D, x, z) => { D.tryPut('hayBale', [[x, z, 0.3]], {}, 0.6); D.tryPut('hayBale', [[x + 0.9, z + 0.4, 1.4]], {}, 0.6); }],
  [1, (D, x, z, tx, tz, rng) => D.tryPut('wheelbarrow', [[x, z, rng() * 6]], {}, 0.8)],
];
const TOTAL = CLUSTERS.reduce((a, c) => a + c[0], 0);

export function dressStreets(D) {
  const R = Object.fromEntries(ROADS.map((r) => [r.id, r]));
  const rng = seeded('streets');
  // [road pts, start s, end s, mean spacing]
  const lines = [
    [R.pass.pts.slice(-6), 4, 88, 9],
    [R.mill.pts.slice(0, 5), 8, 78, 10],
    [R.village_north.pts, 8, 54, 9],
    [R.village_south.pts, 8, 46, 10],
    [R.village_west.pts, 4, 30, 11],
  ];
  let n = 0;
  for (const [pts, a, b, step] of lines) {
    for (let s = a; s < b; s += step * (0.7 + rng() * 0.6)) {
      const p = sampleAt(pts, s);
      if (!p) break;
      const side = rng() < 0.5 ? -1 : 1;
      const off = 4.6 + rng() * 2.4;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      let k = rng() * TOTAL;
      for (const [w, fn] of CLUSTERS) {
        if ((k -= w) <= 0) { fn(D, x, z, p.tx, p.tz, rng); n++; break; }
      }
    }
  }
  D.V.log?.('street verge clusters', n);
}
