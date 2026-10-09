// Dressing of the edges: the shore (huts, nets, racks, boats, the kids' fort), the graveyard, the sled
// hill, the fields and the firewood stumps at the forest edge.
import * as THREE from 'three';
import { buildings as B } from '../../architecture/index.js';
import { LOC } from '../../layout.js';
import { frame, seeded } from './util.js';
import { GRAVEYARD, SLED, FIELDS } from './plan.js';
import { shoreZ } from './shore.js';
import { makeDrawing } from './signs.js';

const PI = Math.PI;

export function dressEdges(D) {
  const { V, G } = D;
  const sh = V.shore;
  if (sh) dressShore(D, sh);
  dressGraveyard(D);
  dressSled(D);
  dressFields(D);
  dressForestEdge(D);
  void G; void THREE; void B; void LOC;
}

// ---------------------------------------------------------------------------------------------
function dressShore(D, sh) {
  const { V, G } = D;
  const rng = seeded('shore');
  const lift = (x) => (x > -33 && x < -7 ? 0.9 : 0.45);
  const bwY = (x) => G.world.heightAt(x, sh.zAt(x)) + lift(x);
  V.shore.bwY = bwY;

  sh.huts.forEach((hut, i) => {
    const c = frame(hut.x, hut.z, hut.yaw);
    const dk = hut.p.y + 1.55 + 0.03;
    // deck clutter
    for (const [lx, lz, name, o] of [[2.3, 0.8, 'barrel', { seed: i }], [-2.4, 0.1, 'fishBasket', { seed: i + 1 }], [2.3, -1.0, 'crate', { seed: i }]]) {
      const [x, z] = c.at(lx, lz);
      D.add(name, x, z, { snap: false, y: dk, yaw: rng() * 6, collide: false, ...o });
    }
    // on the ice: a hole, a stool, a bucket, and (every other hut) a frozen-in boat
    const hole = c.at(1.5, 6.0);
    D.add('iceFishingHole', hole[0], hole[1], { yaw: rng() * 6, collide: false });
    const st = c.at(0.5, 5.6);
    D.add('fishingStool', st[0], st[1], { yaw: rng() * 6 });
    const bk = c.at(2.2, 5.2);
    D.add('bucket', bk[0], bk[1], { seed: i });
    if (i % 3 === 1) {
      const b = c.at(-6.5, 8.5);
      D.add('boat', b[0], b[1], { yaw: hut.yaw + PI / 2 + (rng() - 0.5) * 0.6, seed: i });
    }
    // nets drying behind (land side)
    if (i % 2 === 0) {
      const nb = c.at(4.4, -6.2);
      if (D.free(nb[0], nb[1], 1.2)) D.put('net', nb[0], nb[1], { yaw: hut.yaw + 0.1 }, 1.2);
    } else {
      const rk = c.at(-4.8, -7.0);
      if (D.free(rk[0], rk[1], 1.3)) D.put('dryingRack', rk[0], rk[1], { yaw: hut.yaw + (rng() - 0.5) * 0.4 }, 1.3);
    }
  });

  // more nets, racks and boats on the beach between the huts
  for (const x of [-80, -56, -46, -4, 24, 46]) {
    const z = shoreZ(G, x, 7.5);
    const name = ['net', 'dryingRack', 'skinFrame', 'dryingRack', 'net', 'dryingRack'][Math.abs(Math.round(x)) % 6];
    D.tryPut(name, [[x, z, PI / 2 + (rng() - 0.5) * 0.5]], {}, 1.3);
  }
  for (const [x, d] of [[-62, 9], [-5, 10], [58, 9]]) {
    const z = shoreZ(G, x, d);
    D.tryPut('boat', [[x, z, rng() * 6]], { opts: { variant: 'overturned' } }, 2.2);
  }
  for (const x of [-60]) {
    const z = shoreZ(G, x, -6);
    D.tryPut('boat', [[x, z, PI / 2 + (rng() - 0.5)]], { opts: { variant: 'frozen' }, lake: -50 }, 2.4);
  }
  // net mending spot on the boardwalk and fish baskets along it
  for (const x of [-60, -38, 4, 40]) {
    const z = sh.zAt(x);
    D.add('net', x, z + 1.4, { snap: false, y: bwY(x), opts: { variant: 'heap' }, collide: false, yaw: rng() * 6 });
    D.add('fishingStool', x + 1.0, z - 0.2, { snap: false, y: bwY(x + 1), collide: false, yaw: rng() * 6 });
  }
  for (const x of [-72, -48, -2, 18, 52]) {
    const z = sh.zAt(x);
    D.add('fishBasket', x, z + 0.55, { snap: false, y: bwY(x), collide: false, yaw: rng() * 6, seed: Math.abs(x) % 4 });
    D.add('bucket', x + 0.6, z + 0.6, { snap: false, y: bwY(x), collide: false });
  }

  // boathouse
  {
    const b = V.byId.boathouse;
    const f = frame(b.x, b.z, b.yaw);
    for (const [lx, lz, name, o] of [[-5.2, 4.6, 'barrelStack', {}], [5.4, 3.0, 'crateStack', {}], [5.6, 6.8, 'net', { yaw: b.yaw }], [-5.0, 8.0, 'fishBasket', {}]]) {
      const [x, z] = f.at(lx, lz);
      D.tryPut(name, [[x, z, f.yaw + (o.yaw ? 0 : rng() * 2)]], {}, 1.2);
    }
  }

  // ---- the kids' fort under the raised boardwalk ----
  {
    const f = sh.fort;
    const gy = G.world.heightAt(f.x, f.z);
    const fx = f.x, fz = f.z;
    D.add('crateStack', fx - 1.7, fz + 0.45, { yaw: 0.2, collide: false, id: 'fort_c1' });
    D.add('crateStack', fx + 1.9, fz + 0.4, { yaw: -0.3, collide: false });
    D.add('barrel', fx + 2.9, fz + 0.2, { seed: 1 });
    D.add('barrel', fx - 2.6, fz + 0.25, { seed: 2 });
    D.add('hayBale', fx - 0.5, fz + 0.6, { yaw: 0.1, collide: false });
    D.add('hayBale', fx + 0.5, fz + 0.62, { yaw: -0.1, collide: false });
    D.add('lantern', fx + 0.2, fz - 0.4, { collide: false, opts: { mount: 'ground' } });
    D.add('toys', fx - 1.0, fz - 0.3, { collide: false });
    D.add('stump', fx + 1.2, fz - 0.5, {});
    // blanket on the ground and one draped over the crates as a roof
    const blk = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshStandardMaterial({ color: 0x7c3b2e, roughness: 1, side: THREE.DoubleSide }));
    blk.rotation.x = -Math.PI / 2;
    blk.rotation.z = 0.15;
    blk.position.set(fx, gy + 0.05, fz - 0.05);
    blk.receiveShadow = true;
    blk.name = 'fort_blanket';
    G.scene.add(blk);
    const drawing = makeDrawing();
    drawing.position.set(fx + 0.15, gy + 0.78, fz + 0.52);
    drawing.rotation.y = PI;
    G.scene.add(drawing);
    // a little board to hang it on
    V.fort = { x: fx, z: fz, y: gy, drawing };
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.04), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }));
    board.position.set(drawing.position.x, drawing.position.y, drawing.position.z + 0.03);
    board.name = 'fort_board';
    G.scene.add(board);
  }
}

// ---------------------------------------------------------------------------------------------
function dressGraveyard(D) {
  const { V } = D;
  const g = GRAVEYARD;
  const rng = seeded('graveyard');
  // Wiesia's empty grave (red-thread flowers) and the reeve's son Mateusz Kral, a newer post, side by side.
  V.put('grave_wiesia', 'gravePost', B.gravePost({ seed: 61, variant: 'wiesia', h: 2.0 }), g.x + 0.5, g.z - 1.5, PI + 0.04, { foundation: false, skirt: false }, { prop: true });
  V.put('grave_mateusz', 'gravePost', B.gravePost({ seed: 62, variant: 'son', h: 1.95 }), g.x + 4.3, g.z - 1.0, PI - 0.1, { foundation: false, skirt: false }, { prop: true });
  D.claim(g.x + 0.5, g.z - 1.0, 2.2); D.claim(g.x + 4.3, g.z - 0.5, 2.2);
  // loose rows of carved grave posts with little roofs
  const rows = [-10.5, -6, -1.5, 3, 7.5];
  let n = 0;
  rows.forEach((dz, r) => {
    const count = 5 - (r % 2);
    for (let i = 0; i < count; i++) {
      const x = g.x - 9.5 + i * 4.3 + (rng() - 0.5) * 1.2 + (r % 2) * 2.0;
      const z = g.z + dz + (rng() - 0.5) * 1.0;
      // leave the middle for Wiesia and Mateusz
      if (Math.abs(x - (g.x + 2.4)) < 4.4 && Math.abs(z - (g.z - 1.2)) < 3.4) continue;
      if (!D.free(x, z, 1.1, { roadPad: 1.5 })) continue;
      D.claim(x, z, 1.1);
      const yaw = PI + (rng() - 0.5) * 0.5;
      V.put(`grave_${n}`, 'gravePost', B.gravePost({ seed: 70 + n, variant: 'plain', h: 1.45 + rng() * 0.75 }), x, z, yaw, { foundation: false, skirt: false }, { prop: true });
      const f = frame(x, z, yaw);
      if (rng() < 0.55) D.add('offering', ...f.at((rng() - 0.5) * 0.5, 0.95), { opts: { variant: rng() < 0.6 ? 'candle' : 'bowl' }, collide: false, fxOpts: { light: false }, yaw: rng() * 6 });
      n++;
    }
  });
  D.tryPut('ribbonPole', [[g.x - 10.8, g.z + 12, 0], [g.x + 10.5, g.z - 12.5, 0]], { opts: { height: 3.0 } }, 0.8);
  D.tryPut('ribbonPole', [[g.x + 10.6, g.z + 11.5, 0]], { opts: { height: 2.6 } }, 0.8);
  for (let i = 0; i < 6; i++) {
    const a = rng() * 6.28, d = 6 + rng() * 6;
    D.tryPut('snowDrift', [[g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, rng() * 3]], { collide: false, opts: { width: 2 + rng() * 2, depth: 1.2, height: 0.6 } }, 0.3);
  }
  D.tryPut('rockSmall', [[g.x - 6, g.z + 12, 0], [g.x + 7, g.z - 11, 1]], {}, 0.8);
  D.tryPut('bones', [[g.x + 9, g.z + 9, 1]], {}, 0.4);
  void V;
}

// ---------------------------------------------------------------------------------------------
function dressSled(D) {
  const { V } = D;
  const rng = seeded('sled');
  const [tx, tz] = SLED.top, [bx, bz] = SLED.bottom;
  const dir = [bx - tx, bz - tz];
  const len = Math.hypot(...dir);
  const nx = -dir[1] / len, nz = dir[0] / len;
  // three runs of two tracks each
  for (let r = 0; r < 3; r++) {
    const off = (r - 1) * 2.6;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const w = Math.sin(t * 5 + r * 2) * 1.6 * t;
      pts.push([tx + dir[0] * t + nx * (off + w), tz + dir[1] * t + nz * (off + w)]);
    }
    V.paths.push({ pts: pts.map(([x, z]) => [x + nx * 0.28, z + nz * 0.28]), width: 0.28, kind: 'sled', alpha: 0.62 });
    V.paths.push({ pts: pts.map(([x, z]) => [x - nx * 0.28, z - nz * 0.28]), width: 0.28, kind: 'sled', alpha: 0.62 });
  }
  // sleds at the top and bottom, a snowman, skis, a fire for warming
  for (let i = 0; i < 4; i++) D.tryPut('sled', [[tx + nx * (i - 1.5) * 1.7 - dir[0] * 0.03, tz + nz * (i - 1.5) * 1.7, Math.atan2(dir[0], dir[1]) + (rng() - 0.5) * 0.4]], { opts: { variant: i % 2 ? 'kid' : 'wood' } }, 0.9);
  D.tryPut('sled', [[bx + nx * 3.5, bz + nz * 3.5, 0.6]], {}, 0.9);
  D.tryPut('sled', [[bx - nx * 4.2, bz - nz * 4.2 + 1, -0.5]], {}, 0.9);
  D.tryPut('skis', [[bx + 4, bz + 2, 0.4]], {}, 0.5);
  D.tryPut('snowman', [[tx + 4, tz - 3, 0.2], [tx + 5, tz - 2, 0.2]], {}, 0.7);
  D.tryPut('snowman', [[bx - 6, bz - 5, 1]], {}, 0.7);
  const fx = bx + 7, fz = bz - 3;
  const fire = D.tryPut('campfire', [[fx, fz, 0]], { fxOpts: { light: false }, opts: { light: false }, id: 'sled_fire' }, 1.2);
  if (fire) V.fireProps.push({ h: fire, id: 'sled_fire', r: 7, big: true });
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; D.tryPut('stump', [[fx + Math.cos(a) * 2.1, fz + Math.sin(a) * 2.1, 0]], {}, 0.5); }
  // jump ramp of packed snow
  D.tryPut('snowDrift', [[bx - 3, bz - 2, 0.4]], { collide: false, opts: { width: 3, depth: 2, height: 0.7 } }, 0.4);
  void rng;
}

// ---------------------------------------------------------------------------------------------
function dressFields(D) {
  const { V } = D;
  const rng = seeded('fields');
  const all = [...FIELDS, { id: 'f3', x0: 30, z0: 206, x1: 64, z1: 226 }];
  for (const f of all) {
    // furrows: long faint lines running across the field
    const rowsN = Math.floor((f.z1 - f.z0 - 2) / 1.7);
    for (let r = 0; r < rowsN; r++) {
      const z = f.z0 + 1.5 + r * 1.7;
      V.paths.push({ pts: [[f.x0 + 1.5, z], [f.x1 - 1.5, z + (rng() - 0.5) * 0.4]], width: 0.55, kind: 'sled', alpha: 0.4 });
    }
    D.tryPut('haystack', [[f.x1 - 3, f.z1 - 3, rng() * 3], [f.x0 + 3, f.z1 - 3, 0]], {}, 1.6);
    D.tryPut('hayBale', [[f.x0 + 2.5, f.z0 + 2, 0.3], [f.x0 + 3.6, f.z0 + 2.4, 1.0]], {}, 0.7);
  }
  D.tryPut('effigy', [[46, 194.5, 0.3], [46, 190, 0.3]], { opts: { variant: 'pole' }, scale: 0.9 }, 0.9); // scarecrow
  D.tryPut('cart', [[26.5, 204.8, 0.8]], { opts: { variant: 'empty' } }, 1.8);
  D.tryPut('sled', [[10, 184, 0.3]], {}, 0.8);
}

// ---------------------------------------------------------------------------------------------
// Firewood stumps, chopped logs and chopping blocks where the forest starts (the village thins it for fuel).
function dressForestEdge(D) {
  const { V } = D;
  const rng = seeded('forest-edge');
  const cx = LOC.village.x, cz = LOC.village.z;
  let placed = 0;
  for (let k = 0; k < 40 && placed < 7; k++) {
    const a = rng() * Math.PI * 2;
    const r = 102 + rng() * 22;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (z < 118) continue; // south half only: the shore side is lake and beach
    if (!D.free(x, z, 2.5)) continue;
    D.claim(x, z, 3);
    D.add('choppingBlock', x, z, { yaw: rng() * 6 });
    for (let i = 0; i < 4; i++) D.tryPut('stump', [[x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6, 0]], { seed: i }, 0.5);
    D.tryPut('logs', [[x + 2.4, z - 1.2, rng() * 3]], {}, 1.0);
    D.tryPut('woodpile', [[x - 2.5, z + 1.5, rng() * 3]], {}, 1.0);
    placed++;
  }
  V.log?.('forest edge clusters', placed);
}
