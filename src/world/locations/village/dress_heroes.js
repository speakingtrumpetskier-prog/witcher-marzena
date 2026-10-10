// Dressing of the hero places: longhouse, tavern, smithy, shrine, Dobra's workshop yard, banya, Hanka's
// house, the square (well, board, stalls), the gates and the lanterns along the streets.
import * as THREE from 'three';
import { ROADS } from '../../layout.js';
import { frame, seeded } from './util.js';
import { makeSign } from './signs.js';
import { SQUARE } from './plan.js';

const PI = Math.PI;

// Point and tangent at arc length s along a polyline.
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

export function dressHeroes(D) {
  const { V } = D;
  const rec = (id) => V.byId[id];
  const A = (id, key) => rec(id)?.p.anchors[key];

  // Helper: door frame of a building (outward).
  const doorF = (id, idx = 0) => {
    const d = rec(id).p.doors[idx] || rec(id).p.doors[0];
    return frame(d.x, d.z, d.yaw);
  };
  const place = (name, f, lx, lz, o = {}, r = 0.6) => {
    const [x, z] = f.at(lx, lz);
    return D.tryPut(name, [[x, z, f.yaw + (o.dyaw ?? 0)]], { ...o, dyaw: undefined }, r);
  };
  const lanternPost = (x, z, id) => D.add('lantern', x, z, { opts: { mount: 'post' }, id, collide: true });
  D.lanterns = [];

  // ================= longhouse =================
  {
    const f = doorF('longhouse');
    D.lanterns.push(lanternPost(...f.at(-4.6, 4.6), 'lh_lantern1'), lanternPost(...f.at(4.6, 4.6), 'lh_lantern2'));
    D.claim(...f.at(-4.6, 4.6), 0.5); D.claim(...f.at(4.6, 4.6), 0.5);
    place('barrel', f, -5.4, 1.2, { seed: 1 });
    place('barrel', f, -5.9, 2.0, { seed: 2 });
    place('sack', f, -5.0, 2.4);
    place('cart', f, -9.5, 3.6, { opts: { variant: 'sacks' }, dyaw: 0.5 }, 1.6);
    place('sled', f, 7.4, 3.2, { dyaw: 1.2 }, 0.9);
    place('snowShovel', f, 5.6, 0.5, {}, 0.4);
    place('firewoodStack', f, 6.2, 1.0, { dyaw: 0 }, 0.8);
    place('snowman', f, 8.6, 5.5, {}, 0.7);
    place('crateStack', f, -7.5, 0.8, {}, 0.8);
    place('ribbonPole', f, 11, 6, { opts: { height: 3.0 } }, 0.8);
  }

  // ================= tavern =================
  {
    const f = doorF('tavern');
    D.lanterns.push(lanternPost(...f.at(-4.2, 4.2), 'tv_lantern1'));
    D.claim(...f.at(-4.2, 4.2), 0.5);
    place('bench', f, -5.2, 2.8, { dyaw: PI / 2 + 0.05, opts: { length: 1.8 } }, 0.8);
    place('table', f, -7.0, 3.4, { dyaw: 0.1 }, 1.2);
    place('bench', f, -7.0, 2.3, { dyaw: PI, opts: { length: 1.8 } }, 0.7);
    place('bench', f, -7.0, 4.5, { opts: { length: 1.8 } }, 0.7);
    place('barrelStack', f, 6.6, 4.0, { opts: { variant: 'pyramid' } }, 1.2);
    place('barrel', f, 7.8, 2.6, { opts: { variant: 'salt' } }, 0.6);
    place('washTub', f, 5.4, 4.8, {}, 0.7);
    place('crateStack', f, 8.2, 0.4, {}, 0.8);
    place('snowDrift', f, 0, 6.0, { collide: false, opts: { width: 4, depth: 1.1, height: 0.5 } }, 0.2);
    // The watered beer barrel the town jokes about, by the side wall.
    // the guest bed against the left wall inside
    const tf = frame(rec('tavern').x, rec('tavern').z, rec('tavern').yaw);
    const [bdx, bdz] = tf.at(-3.5, 2.4);
    D.add('bed', bdx, bdz, { snap: false, y: rec('tavern').p.y + 0.05, yaw: rec('tavern').yaw + PI / 2, indoor: true, collide: false });
    const [bx, bz] = tf.at(-5.3, -2.0);
    D.put('barrel', bx, bz, { yaw: 0.3, seed: 3, opts: { variant: 'open' }, id: 'beer_barrel' }, 0.6);
  }

  // ================= smithy (open front yard) =================
  {
    const a = A('smithy', 'door');
    const f = frame(a.x, a.z, rec('smithy').yaw);
    place('grindstone', f, 3.4, 1.2, { dyaw: -0.4 }, 0.8);
    place('quenchBarrel', f, -3.6, 0.6, {}, 0.6);
    place('anvil', f, -2.0, 2.4, { dyaw: 0.6, id: 'yard_anvil' }, 0.7);
    place('woodpile', f, 5.0, -3.0, { dyaw: PI / 2 }, 1.2);
    place('crateStack', f, -5.6, 1.0, {}, 0.8);
    place('sack', f, 4.4, 2.6, { seed: 1 }, 0.5);
    place('sack', f, 4.9, 3.0, { seed: 2 }, 0.5);
    place('cartWheel', f, -4.6, 3.6, { dyaw: 0.3 }, 0.8);
    place('cart', f, 7.5, 5.2, { opts: { variant: 'empty' }, dyaw: -0.4 }, 1.7);
    const [bx, bz] = f.at(1.5, 4.2);
    const br = D.tryPut('brazier', [[bx, bz, 0]], { opts: { variant: 'tall', smoke: true }, fxOpts: { light: false }, id: 'smithy_brazier' }, 0.7);
    if (br) V.fireProps.push({ h: br, id: 'smithy_brazier', r: 6 });
    place('barrel', f, -6.8, 3.0, {}, 0.6);
  }

  // ================= shrine =================
  {
    const s = rec('shrine');
    const f = frame(s.x, s.z, s.yaw);
    const altar = A('shrine', 'altar');
    // offerings on the altar top and at the foot
    [[-0.55, 'bowl'], [0.0, 'candle'], [0.55, 'bread']].forEach(([lx, variant], i) => {
      const [x, z] = f.at(lx, -2.6);
      D.add('offering', x, z, { snap: false, y: altar.y + 0.04, yaw: s.yaw + i, opts: { variant }, collide: false, fxOpts: { light: false } });
    });
    [[-1.6, -0.6, 'candle'], [1.5, -0.4, 'bowl'], [-2.4, 1.2, 'bread']].forEach(([lx, lz, variant], i) => {
      const [x, z] = f.at(lx, lz);
      D.tryPut('offering', [[x, z, i]], { opts: { variant }, collide: false, fxOpts: { light: false } }, 0.4);
    });
    place('ribbonPole', f, -3.0, 7.6, { opts: { height: 3.4 } }, 0.8);
    place('ribbonPole', f, 3.0, 7.6, { opts: { height: 3.0 } }, 0.8);
    place('effigy', f, -3.3, -1.6, { opts: { variant: 'pole' }, dyaw: 0.4 }, 0.8);
    place('firewoodStack', f, 2.6, 2.2, { dyaw: -0.3 }, 0.8);
    place('effigyHead', f, 0.9, -1.2, {}, 0.3);
    place('bones', f, 1.8, -4.2, {}, 0.3);
    place('snowDrift', f, 4.2, 4.0, { collide: false, opts: { width: 3, depth: 1.2, height: 0.5 } }, 0.2);
  }

  // ================= Dobra's workshop yard =================
  {
    const w = rec('workshop');
    const door = A('workshop', 'door');
    const f = frame(door.x, door.z, w.yaw); // lz outward (east)
    const yard = f.at(0, 4.2);
    V.yard = { x: yard[0], z: yard[1] };
    // straw bales in a ring for the children (C3)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + 0.4;
      const [x, z] = [yard[0] + Math.cos(a) * 2.3, yard[1] + Math.sin(a) * 2.3];
      D.put('hayBale', x, z, { yaw: -a + PI / 2, seed: i % 4, id: i === 0 ? 'bale0' : undefined }, 0.8);
    }
    place('effigy', f, 0.2, 4.2, { opts: { variant: 'half' }, dyaw: 0.4, id: 'yard_half' }, 0.9);
    place('effigy', f, -4.0, 2.8, { opts: { variant: 'half' }, dyaw: -0.3 }, 0.9);
    place('effigy', f, 4.2, 3.0, { opts: { variant: 'pole' }, dyaw: 0.2 }, 0.8);
    place('effigy', f, -5.4, 6.4, { opts: { variant: 'standing' }, dyaw: 0.2 }, 0.8);
    place('effigy', f, 5.8, 7.2, { opts: { variant: 'hung' }, scale: 0.9, dyaw: 0.0 }, 1.3);
    place('effigy', f, 7.2, 1.6, { opts: { variant: 'seated' }, dyaw: -0.5 }, 0.7);
    for (const [lx, lz] of [[-2.8, 6.2], [2.6, 7.0], [-1.0, 2.0], [3.2, 5.8]]) place('strawPile', f, lx, lz, {}, 0.8);
    place('haystack', f, -7.5, 1.0, {}, 1.6);
    place('woodpile', f, 8.0, -2.0, { dyaw: PI / 2 }, 1.0);
    place('table', f, -2.2, 0.9, { dyaw: PI / 2 }, 1.0);
    place('barrel', f, 5.0, 0.5, {}, 0.5);
    place('crate', f, 5.6, 0.7, {}, 0.5);
    // heads on the work table, and the loft of heads inside
    {
      const [tx, tz] = f.at(-2.2, 0.9);
      [[-0.45, 0.0], [0.0, 0.2], [0.45, -0.1]].forEach(([dx, dz], i) => {
        const [x, z] = [tx + dx * Math.cos(w.yaw) + dz * Math.sin(w.yaw), tz - dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw)];
        D.add('effigyHead', x, z, { snap: false, y: D.V.h(tx, tz) + 0.8, yaw: w.yaw + i, collide: false });
      });
    }
    const c = frame(w.x, w.z, w.yaw);
    // loft of effigy heads (loft floor at local y 2.55, back third of the barn)
    for (let i = 0; i < 7; i++) {
      const [x, z] = c.at(-3.4 + i * 1.1, -w.fp.hd + 0.55 + (i % 2) * 0.5);
      D.add('effigyHead', x, z, { snap: false, y: w.p.y + 2.58, yaw: w.yaw + PI + (i - 3) * 0.12, collide: false, indoor: true, seed: i });
    }
    // effigies standing and hung inside
    [[-3.3, 1.2, 'standing'], [3.5, 3.4, 'standing'], [-3.4, -1.8, 'seated']].forEach(([lx, lz, variant], i) => {
      const [x, z] = c.at(lx, lz);
      D.add('effigy', x, z, { snap: false, y: w.p.y + 0.02, yaw: w.yaw + (i - 1) * 0.5, opts: { variant }, indoor: true, collide: false });
    });
    [[-2.6, 2.4], [2.4, 0.6]].forEach(([lx, lz], i) => {
      const [x, z] = c.at(lx, lz);
      D.add('effigy', x, z, { snap: false, y: w.p.y + 0.02, yaw: w.yaw + i, scale: 0.84, opts: { variant: 'hung' }, indoor: true, collide: false });
    });
  }

  // ================= banya =================
  {
    const f = doorF('banya');
    place('washTub', f, 3.4, 1.4, { id: 'plunge_tub' }, 0.9);
    place('washTub', f, 4.6, 2.6, {}, 0.9);
    place('barrel', f, -2.6, 1.2, {}, 0.5);
    place('bucket', f, -1.8, 1.8, { opts: { fill: 1 } }, 0.4);
    place('firewoodStack', f, 5.2, 0.4, { dyaw: 0 }, 0.8);
    place('woodpile', f, 3.0, -5.8, { dyaw: PI / 2 }, 1.2);
    place('bench', f, -3.4, 1.2, { dyaw: 0.2 }, 0.8);
    place('tools', f, 1.6, 0.4, {}, 0.4);
    place('snowman', f, -5.8, 3.6, {}, 0.7);
    const [lx, lz] = f.at(-1.0, 4.4);
    D.lanterns.push(lanternPost(lx, lz, 'banya_lantern'));
    D.claim(lx, lz, 0.5);
  }

  // ================= Hanka's house =================
  {
    const f = doorF('hanka');
    place('bucket', f, -1.3, 0.8, { opts: { fill: 1 } }, 0.4);
    place('tools', f, 1.8, 0.4, {}, 0.4);
    place('firewoodStack', f, -2.2, 0.5, { dyaw: 0, opts: { width: 0.9, rows: 2 } }, 0.7);
    place('washTub', f, 3.0, 2.0, {}, 0.7);
    place('laundryLine', f, -4.6, 3.4, { opts: { length: 3.6 }, id: 'hanka_laundry' }, 2.0);
    place('stool', f, 1.5, 1.4, {}, 0.4);
    place('snowDrift', f, 0, 3.4, { collide: false, opts: { width: 3.2, depth: 1, height: 0.5 } }, 0.2);
    // The milk shelf itself is part of the house kit (buildings/hanka.js, milkShelf); two more bowls stand out on
    // the shore where she kneels.
    const m = A('hanka', 'milk');
    for (const [dx, dz, v] of [[0.3, -3.6, 'bowl'], [-0.9, -4.4, 'bowl']]) {
      D.add('offering', m.x + dx, m.z + dz, { opts: { variant: v }, yaw: dx, collide: false, fxOpts: { light: false } });
    }
  }

  // ================= square =================
  {
    const w = SQUARE.well;
    D.put('bucket', w.x + 1.25, w.z + 0.2, { snap: false, y: V.byId.well.p.y + 0.9, opts: { fill: 1 }, collide: false }, 0.3);
    D.put('barrel', w.x - 2.4, w.z + 1.6, { seed: 1 }, 0.5);
    D.put('barrel', w.x - 2.0, w.z + 2.3, { seed: 2, opts: { variant: 'open' } }, 0.5);
    D.put('jug', w.x + 2.4, w.z + 1.4, { seed: 1 }, 0.3);
    D.put('washTub', w.x + 2.3, w.z - 1.7, {}, 0.7);
    const b = V.byId.noticeBoard;
    const bf = frame(b.x, b.z, b.yaw);
    for (const [lx, lz] of [[-1.9, 0.9], [1.9, 0.8]]) { const [x, z] = bf.at(lx, lz); D.tryPut('snowDrift', [[x, z, b.yaw]], { collide: false, opts: { width: 1.6, depth: 0.8, height: 0.45 } }, 0.3); }
    const [sx, sz] = bf.at(2.4, 1.6);
    D.tryPut('sack', [[sx, sz, 0.3]], {}, 0.5);
    D.tryPut('cart', [[-1.5, 112, 0.7]], { opts: { variant: 'empty' } }, 1.7);
    D.tryPut('hayBale', [[19, 118.5, 0.4], [19.8, 120, 1.0]], {}, 0.7);
    D.tryPut('snowman', [[-6.4, 125.5, 0.3]], {}, 0.7);
    // the rite is near: a birch pole with red ribbons waits at the north side of the square
    D.tryPut('ribbonPole', [[3.6, 112.6, 0]], { opts: { height: 4.2 } }, 0.8);
    D.tryPut('sled', [[16.4, 118.8, 0.5]], {}, 0.9);
    D.tryPut('barrelStack', [[-18.5, 120.8, 0.4]], { opts: { variant: 'pyramid' } }, 1.1);
    D.tryPut('woodpile', [[19.5, 124.6, 0.2]], {}, 1.1);
    // lanterns around the square
    for (const [x, z] of [[-6, 113], [11, 114.2], [-8, 123.4], [11.6, 121]]) { const h = D.tryPut('lantern', [[x, z, 0]], { opts: { mount: 'post' }, id: `sq_lantern${D.lanterns.length}` }, 0.5); if (h) D.lanterns.push(h); }

    // ----- stalls -----
    for (const st of ['stall_fish', 'stall_spoons', 'stall_dolls', 'stall_bread']) {
      const r = rec(st);
      const sf = frame(r.x, r.z, r.yaw);
      const top = r.p.y + 1.0;
      const wares = r.meta.wares;
      const put = (name, lx, lz, o = {}) => { const [x, z] = sf.at(lx, lz); D.add(name, x, z, { snap: false, y: top, collide: false, ...o }); };
      if (wares === 'fish') {
        put('fishBasket', -0.8, 0.9, { yaw: r.yaw });
        put('fishBasket', 0.2, 0.9, { yaw: r.yaw + 0.5, seed: 1 });
        put('fishString', 0.9, 0.95, { yaw: r.yaw, y: r.p.y + 1.55 });
      } else if (wares === 'spoons') {
        put('spoonRack', -0.5, 0.9, { yaw: r.yaw, y: r.p.y + 1.2 });
        put('jug', 0.7, 0.95, { seed: 2 });
      } else if (wares === 'dolls') {
        [[-0.9, 0.2], [-0.4, 0.5], [0.15, 0.1], [0.7, 0.4]].forEach(([dx, dz], i) => put('effigy', dx, 0.9 + dz * 0.1, { scale: 0.2, opts: { variant: 'standing' }, yaw: r.yaw + (i - 2) * 0.2 }));
        put('toys', 0.95, 0.95, {});
      } else if (wares === 'bread') {
        put('crate', -0.7, 0.9, { opts: { variant: 'open' }, scale: 0.6 });
        put('sack', 0.8, 0.95, { scale: 0.7 });
      }
      D.claim(r.x, r.z, 1.6);
      for (const [lx, lz, name] of [[1.9, -0.7, 'crateStack'], [-1.9, -0.4, 'barrel'], [0.4, -1.8, 'sack']]) {
        const [x, z] = sf.at(lx, lz);
        D.tryPut(name, [[x, z, r.yaw + lx]], {}, name === 'crateStack' ? 0.8 : 0.5);
      }
    }
  }

  // ================= gates =================
  {
    const gw = rec('gate_west');
    const gf = frame(gw.x, gw.z, gw.yaw); // lz points outside (west)
    const ef = gf.at(-4.4, 1.8);
    D.put('effigy', ef[0], ef[1], { opts: { variant: 'pole' }, yaw: gw.yaw + 0.3, id: 'gate_effigy' }, 0.8);
    const tr = gf.at(4.4, 1.4);
    D.put('ribbonPole', tr[0], tr[1], { opts: { height: 3.2 } }, 0.8);
    for (const lx of [-3.0, 3.0]) { const [x, z] = gf.at(lx, -1.6); D.put('barrel', x, z, { seed: lx > 0 ? 1 : 2 }, 0.5); }
    const [px, pz] = gf.at(6.5, 3.2);
    D.put('signpost', px, pz, { yaw: gw.yaw - 0.4, opts: { arrows: 3 } }, 0.5);
    const gs = rec('gate_south');
    const sf = frame(gs.x, gs.z, gs.yaw);
    for (const lx of [-3.6, 3.6]) { const [x, z] = sf.at(lx, 1.6); D.put('torch', x, z, { opts: { light: false }, fxOpts: { light: false } }, 0.3); }
    // the west gate: torches on the village side, a wolf skull on a stake, a few stones, a trodden approach
    for (const lx of [-3.0, 3.0]) {
      const [x, z] = gf.at(lx, -1.9);
      const h = D.put('torch', x, z, { opts: { light: false }, fxOpts: { light: false }, id: `gate_torch${lx > 0 ? 2 : 1}` }, 0.3);
      V.fireProps.push({ h, id: `gate_torch${lx > 0 ? 2 : 1}`, r: 4, torch: true });
    }
    const [sx, sz] = gf.at(2.8, 3.4);
    D.put('skull', sx, sz, { opts: { variant: 'wolf' }, yaw: gw.yaw + 1 }, 0.3);
    for (const [lx, lz] of [[-7, 4], [8, 5.5], [-9, -3]]) { const [x, z] = gf.at(lx, lz); D.tryPut('rockSmall', [[x, z, lx]], {}, 0.8); }
  }

  // ================= lanterns on posts along the streets =================
  {
    const R = Object.fromEntries(ROADS.map((r) => [r.id, r]));
    const rng = seeded('lanterns');
    // [polyline, spacing, offset from the centerline, first and last arc length]
    const lines = [
      [R.pass.pts.slice(-6), 13, 3.7, 6, 80],
      [R.mill.pts.slice(0, 4), 13, 3.4, 20, 60],
      [R.village_north.pts, 14, 2.9, 12, 44],
      [R.village_south.pts, 14, 2.7, 14, 40],
    ];
    for (const [pts, step, off, start, end] of lines) {
      let i = 0;
      for (let s = start; s <= end; s += step, i++) {
        const p = sampleAt(pts, s);
        if (!p) break;
        for (const side of [i % 2 ? -1 : 1, i % 2 ? 1 : -1]) {
          const x = p.x - p.tz * off * side + (rng() - 0.5) * 0.4, z = p.z + p.tx * off * side + (rng() - 0.5) * 0.4;
          const h = D.tryPut('lantern', [[x, z, 0]], { opts: { mount: 'post' } }, 0.5);
          if (h) { D.lanterns.push(h); break; }
        }
      }
    }
  }
  void THREE; void makeSign;
}
