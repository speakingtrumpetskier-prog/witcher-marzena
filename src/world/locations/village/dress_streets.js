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
  dressSouthStreet(D, rng);
}

// The south street, square to shrine, read as one bare sheet of snow on its west side. Now it is where the
// village keeps its common firewood: stacks, a chopping block with chips around it, a cart half unloaded
// with sacks, a wheelbarrow, a lantern post at each end, and paths trodden from the doors to the street.
// Away from the roadway and the house fronts; nothing here is a story anchor.
function dressSouthStreet(D, rng) {
  const { V } = D;
  // The street itself: a packed lane with two muddy ruts where the sledges and the one cart go.
  {
    const R = ROADS.find((r) => r.id === 'village_south').pts;
    const lane = [], rutL = [], rutR = [];
    for (let s = 2; s <= 44; s += 2) {
      const p = sampleAt(R, s);
      if (!p) break;
      const w = Math.sin(s * 0.31) * 0.12;
      lane.push([p.x, p.z]);
      rutL.push([p.x - p.tz * (0.72 + w), p.z + p.tx * (0.72 + w)]);
      rutR.push([p.x + p.tz * (0.72 - w), p.z - p.tx * (0.72 - w)]);
    }
    V.paths.push({ pts: lane, width: 2.8, kind: 'path', alpha: 0.45 });
    V.paths.push({ pts: rutL, width: 0.32, kind: 'rut', alpha: 0.5 });
    V.paths.push({ pts: rutR, width: 0.32, kind: 'rut', alpha: 0.5 });
  }
  // By the west side where the street bends: a sled stood against a barrel, a shovel, a dog's kennel by s2.
  D.tryPut('sled', [[-7.2, 144.5, 1.2]], {}, 0.8);
  D.tryPut('barrel', [[-7.6, 146.2, 0.3]], { seed: 3 }, 0.5);
  D.tryPut('snowShovel', [[-6.9, 146.8, 0.2]], { collide: false }, 0.3);
  D.tryPut('dogKennel', [[-17.2, 141.4, 0.6], [-16.4, 140.2, 0.4]], {}, 0.9);
  // The wood yard, west of the street between house s2 and the shrine.
  const wx = -12.5, wz = 152;
  V.paths.push({ pts: [[wx - 4.5, wz - 3.5], [wx - 1, wz - 4.2], [wx + 3, wz - 3], [wx + 5, wz], [wx + 3.5, wz + 3.6], [wx - 1.5, wz + 4.2], [wx - 5, wz + 1.5], [wx - 4.5, wz - 3.5]], width: 2.6, kind: 'yard', alpha: 0.3 });
  D.tryPut('firewoodStack', [[wx - 3.4, wz + 2.6, 0.12]], {}, 1.2);
  D.tryPut('firewoodStack', [[wx - 1.0, wz + 3.3, 0.05]], {}, 1.2);
  D.tryPut('woodpile', [[wx + 1.8, wz + 2.9, -0.1]], {}, 1.0);
  D.tryPut('logs', [[wx - 3.6, wz - 1.2, 1.45], [wx - 3.2, wz - 2.0, 1.4]], {}, 0.9);
  D.tryPut('choppingBlock', [[wx + 0.4, wz - 0.4, 0]], {}, 0.6);
  D.tryPut('tools', [[wx + 1.6, wz - 0.9, 0.7]], { collide: false }, 0.4);
  D.tryPut('strawPile', [[wx + 0.9, wz + 0.4, rng() * 6]], { collide: false, opts: { size: 0.6 } }, 0.3);
  D.tryPut('stump', [[wx - 1.4, wz - 0.2, 0], [wx + 2.6, wz + 0.8, 0]], {}, 0.5);
  D.tryPut('wheelbarrow', [[wx + 3.6, wz - 2.2, 2.1]], {}, 0.8);
  // The cart, unloaded halfway: sacks on the ground behind it, one split.
  const cx = -9, cz = 138;
  D.tryPut('cart', [[cx, cz, 1.35]], { opts: { variant: 'sacks' } }, 1.6);
  D.tryPut('sack', [[cx - 1.8, cz + 0.9, 0.4], [cx - 2.3, cz + 0.2, 1.2]], {}, 0.4);
  D.tryPut('sack', [[cx - 1.5, cz + 1.7, 2.6]], { collide: false }, 0.4);
  D.tryPut('crate', [[cx - 2.8, cz + 1.3, 0.3]], {}, 0.5);
  // Lantern posts where the street leaves the square and where it meets the shrine.
  D.tryPut('lantern', [[3.2, 131, 0], [-3.3, 131.5, 0]], { collide: false, opts: { mount: 'post' } }, 0.4);
  D.tryPut('lantern', [[-0.6, 159, 0], [-9.6, 160, 0]], { collide: false, opts: { mount: 'post' } }, 0.4);
  // Paths trodden from the nearest doors to the street.
  for (const id of ['s2', 's14', 's3']) {
    const r = V.byId?.[id];
    const d = r?.p?.doors?.[0];
    if (!d) continue;
    const sx = id === 's2' ? -5.2 : -1.2, sz = Math.max(126, Math.min(158, d.z));
    V.paths.push({ pts: [[d.x, d.z], [(d.x + sx) / 2, (d.z + sz) / 2 + (rng() - 0.5) * 1.5], [sx, sz]], width: 1.1, kind: 'path', alpha: 0.36 });
  }
}
