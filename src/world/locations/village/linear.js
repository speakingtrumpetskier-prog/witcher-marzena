// Linear structures: the palisade, the two gates, wattle and split-rail fences (yards, pens, fields,
// graveyard). All are built in world coordinates with the terrain height function, then placed with
// snap:false at the origin so they hug the ground.
import { buildings as B, placeBuilding } from '../../architecture/index.js';
import { GATE_W, GATE_S, GRAVEYARD, FIELDS } from './plan.js';
import { rot } from './util.js';

const PO = { snap: false, y: 0, foundation: false, skirt: false };

// Break a long polyline into chunks of about `len` meters so frustum culling and shadows stay local.
function chunks(pts, len) {
  const out = [];
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    acc += Math.hypot(bx - ax, bz - az);
    cur.push(pts[i]);
    if (acc >= len && i < pts.length - 1) { out.push(cur); cur = [pts[i]]; acc = 0; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// Densify a polyline so the ground function is sampled often enough on slopes.
function densify(pts, step = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

export async function buildLinear(V) {
  const { G } = V;
  const heightAt = (x, z) => G.world.heightAt(x, z);
  let seed = 400;
  const place = (kind, pts, opts = {}) => {
    const dense = densify(pts, kind === 'palisade' ? 5 : 4);
    V.barriers.push(dense);
    for (const part of chunks(dense, kind === 'palisade' ? 44 : 60)) {
      const b = B[kind]({ seed: seed++, points: part, heightAt, ...opts });
      V.pieces.push(placeBuilding(G, b, 0, 0, 0, PO));
    }
  };
  V.linear = { place };

  // ---- gates ----
  const gw = V.put('gate_west', 'gate', B.gate({ seed: 131, open: 0.2 }), GATE_W.x, GATE_W.z, GATE_W.yaw, { foundation: false, skirt: false }, { gate: true });
  const gs = V.put('gate_south', 'gate', B.gate({ seed: 132, width: GATE_S.width, open: 0.2 }), GATE_S.x, GATE_S.z, GATE_S.yaw, { foundation: false, skirt: false }, { gate: true });
  V.gates = [gw, gs];

  // ---- palisade: west wall from the shore, around the west gate, then the south wall ----
  const reach = 5.85; // half the gate unit including its palisade stubs
  const [ax, az] = rot(-reach, 0, GATE_W.yaw); // north end of the west gate unit
  const [bx, bz] = rot(reach, 0, GATE_W.yaw); // south end
  const wn = [GATE_W.x + ax, GATE_W.z + az], ws = [GATE_W.x + bx, GATE_W.z + bz];
  // local x of the gate maps to world (cos, -sin); the end with larger z is the south end.
  const [north, south] = wn[1] < ws[1] ? [wn, ws] : [ws, wn];
  const sr = GATE_S.width / 2 + 0.55 + 3.2;
  const wallH = 2.7;
  place('palisade', [[-101, 64], [-103, 82], [-102, 98], [-97, 112], north], { height: wallH });
  place('palisade', [south, [-89, 146], [-93, 166], [-94, 188], [-94, 196], [GATE_S.x - sr, 196]], { height: wallH });
  place('palisade', [[GATE_S.x + sr, 196], [0, 196], [34, 196], [70, 196]], { height: wallH });

  // ---- fences ----
  const wattle = (pts, o = {}) => place('fence', pts, { style: 'wattle', ...o });
  const rail = (pts, o = {}) => place('fence', pts, { style: 'rail', ...o });
  // Goat pen around the shed (a gap on the south side).
  wattle([[31, 166], [31, 154], [45.5, 154], [45.5, 166], [39.5, 166]]);
  wattle([[35.5, 166], [31, 166]]);
  // Chicken run beside the coop.
  wattle([[-53, 156], [-53, 149], [-46, 149], [-46, 156], [-50, 156]]);
  // Yard fences between neighbors.
  wattle([[37, 84], [37, 96], [30.5, 101]]);
  wattle([[-37, 150], [-30, 154], [-22, 154]]);
  wattle([[-69, 94], [-66, 100], [-66, 108]]);
  wattle([[8, 150], [8, 156]]);
  rail([[52, 106], [56, 96], [56, 86]]);
  // Stable paddock.
  rail([[-80, 118], [-80, 126]]);
  // Graveyard: low wattle ring with a gap toward the idol road.
  const g = GRAVEYARD;
  wattle([[g.x + 12, g.z - 6], [g.x + 12, g.z - 15], [g.x - 12, g.z - 15], [g.x - 12, g.z + 14], [g.x + 4, g.z + 14]], { height: 0.95 });
  // Fields inside the wall and a pair outside it.
  for (const f of FIELDS) rail([[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1], [f.x0, f.z0 + 5]]);
  rail([[30, 206], [64, 206], [64, 226], [30, 226], [30, 214]]);
  rail([[66, 206], [90, 206], [92, 222], [66, 226]]);
  // Sledding hill: a short rail so kids do not slide into the south road.
  rail([[-34, 216], [-28, 226], [-28, 236]]);
}
