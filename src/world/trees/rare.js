// The odd trees: where they stand. Owner: vegetation builder.
//
// A handful of folk-fantasy trees (corkscrew pines, hollow oaks with a red ribbon, weeping birches, bottle
// trees, knot trees, ice trees, a gate tree) that break the spruce, pine and birch rhythm. They are rare:
// a few scattered by habitat rules, plus hand placed hero specimens at memorable spots. Each is an ordinary
// vegetation kind (LODs, impostors, wind, shadows, colliders), they are just few.
//
//   placeRare(G, kinds, placed) -> { heroes, counts, removed }
//     appends instance records to placed.inner and removes the ordinary trees standing in their way
//
// Hero positions (x, z), all clear of roads, LOC footprints and set pieces (checked against layout.js and the
// wilderness builders' clear() calls):
//   corkscrew grove   (-262, 18)    nine wrung pines on the south edge of the reed marsh
//   hollow oak        (-230, 270)   on the rise south of the crossroads, doorway turned toward the pass road
//   weeping birch     (-56, -322)   25 m south-east of the hot spring pools, doorway toward the steam
//   ice tree          (176, 31)     south-east lake shore, glittering across the ice
//   knot tree         (136, 128)    east of the village, on the way to the graveyard
//   bottle tree       (-165, 212)   twenty metres off the pass road on the way down to the village
//   gate tree         forest track  the road runs through it (arc length 148 m from the crossroads)
import { rng, smoothstep, clamp, lerp } from '../../core/util.js';
import { ROADS } from '../layout.js';
import { exclusionFactor, EXCLUSIONS } from '../exclusions.js';
import { roadRaster, getMacro, locDistance, lakeInfo, marshE, vistaFactor } from './placement.js';

// point and tangent at arc length s along a polyline
function along(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dz);
    if (acc + l >= s) {
      const t = (s - acc) / l;
      return { x: pts[i][0] + dx * t, z: pts[i][1] + dz * t, tx: dx / l, tz: dz / l };
    }
    acc += l;
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { x: b[0], z: b[1], tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
}

const yawToward = (dx, dz) => Math.atan2(dx, dz);

export function placeRare(G, kinds, placed) {
  const W = G.world;
  const rocks = G.rocks && G.rocks.rockAt ? G.rocks : null;
  const roads = roadRaster();
  const macro = getMacro(W);
  const rg = rng(424242);
  const kindIdx = {};
  kinds.forEach((k, i) => { kindIdx[k.id] = i; });
  const idsOf = (species) => kinds.filter((k) => k.species === species).map((k) => k.id);
  const out = [];
  const heroes = [];
  const counts = {};
  let removed = 0;

  // lowest ground under a footprint, so the roots sink into the snow on the downhill side
  const footY = (x, z, r) => {
    let m = W.heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m = Math.min(m, W.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return m;
  };
  const slopeAt = (x, z) => {
    const e = 2.5;
    return Math.hypot(W.terrainAt(x - e, z) - W.terrainAt(x + e, z), W.terrainAt(x, z - e) - W.terrainAt(x, z + e)) / (2 * e);
  };
  const near = (x, z, r, list = out) => list.some((o) => Math.hypot(o.x - x, o.z - z) < r);

  // Make room: every ordinary tree within rClear goes, trees thin out (35% kept at the edge of the clearing,
  // all of them at rThin) so the glade does not have a hard rim, small bushes go inside 0.6 * rClear. `lane` is an
  // optional rectangle { dx, dz, len, half } (unit direction from the tree toward the viewer) cleared completely,
  // so the odd tree can be seen from the side where people come from.
  const glade = (x, z, rClear, rThin = rClear, lane = null) => {
    const keep = [];
    for (const it of placed.inner) {
      const kk = kinds[it.k];
      if (kk.group === 'reed' || kk.group === 'ground') { keep.push(it); continue; }
      const dx = it.x - x, dz = it.z - z;
      const d = Math.hypot(dx, dz);
      if (d > Math.max(rThin, lane ? lane.len + lane.half : 0) + 1) { keep.push(it); continue; }
      let remove = d < (kk.group === 'tree' ? rClear : rClear * 0.6);
      if (!remove && kk.group === 'tree' && d < rThin) {
        const f = (d - rClear) / Math.max(1, rThin - rClear);
        const hsh = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453) % 1;
        remove = hsh > 0.35 + 0.65 * f;
      }
      if (!remove && lane && kk.group !== 'deadwood') {
        const along = dx * lane.dx + dz * lane.dz, across = -dx * lane.dz + dz * lane.dx;
        remove = along > 0 && along < lane.len && Math.abs(across) < lane.half;
      }
      if (remove) removed++; else keep.push(it);
    }
    placed.inner = keep;
  };

  const add = (id, x, z, o = {}) => {
    const ki = kindIdx[id];
    if (ki === undefined) return null;
    const kind = kinds[ki];
    const s = o.s ?? lerp(0.88, 1.14, rg());
    const yaw = o.yaw ?? rg() * Math.PI * 2;
    const y = footY(x, z, Math.max(0.5, kind.trunkR * s * 0.8)) - (o.sink ?? 0.1);
    const sh = o.tint ?? (0.95 + 0.1 * rg());
    const rec = {
      k: ki, x, y, z, yaw, sx: s, sy: s, r: sh, g: sh, b: sh, tx: 0, tz: 0, view: rg() < 0.5 ? 0 : 1, trunk: kind.trunkR * s, rare: true, id,
    };
    out.push(rec);
    counts[kind.species] = (counts[kind.species] || 0) + 1;
    if (o.hero) heroes.push({ id, species: kind.species, x: +x.toFixed(1), z: +z.toFixed(1), y: +y.toFixed(2), yaw: +yaw.toFixed(2), note: o.note });
    return rec;
  };

  // is a spot usable at all (hard rules shared with the ordinary placement)
  const usable = (x, z, o = {}) => {
    const h = W.heightAt(x, z);
    if (h < (o.minH ?? 0.2) || h > 340) return false;
    if (locDistance(x, z) < (o.loc ?? 9)) return false;
    if (lakeInfo(x, z) < (o.lake ?? 4)) return false;
    if (marshE(x, z) < 1.12) return false;
    if (roads.edge(x, z) < (o.road ?? 7)) return false;
    if (EXCLUSIONS.length && exclusionFactor(x, z, 'tree') < 0.9) return false;
    if (slopeAt(x, z) > (o.slope ?? 0.26)) return false;
    if (vistaFactor(x, z) < 0.7) return false;
    if (rocks && rocks.rockAt(x, z, o.rock ?? 2.2)) return false;
    return true;
  };

  // ---------------------------------------------------------------- hero specimens
  const hero = (id, x, z, o) => {
    let px = x, pz = z;
    if (!usable(px, pz, { loc: 3, road: o.road ?? 6, lake: 2, slope: 0.4, rock: 1.5, ...o.rules })) {
      // slide to the nearest acceptable spot (hand placed positions can land on a boulder)
      let best = null;
      for (let r = 2; r <= 14 && !best; r += 2) {
        for (let k = 0; k < 12 && !best; k++) {
          const a = (k / 12) * Math.PI * 2;
          const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
          if (usable(qx, qz, { loc: 3, road: o.road ?? 6, lake: 2, slope: 0.4, rock: 1.5, ...o.rules })) best = [qx, qz];
        }
      }
      if (best) [px, pz] = best;
    }
    const rec = add(id, px, pz, { hero: true, s: o.s, yaw: o.yaw, note: o.note, sink: o.sink });
    if (rec) glade(px, pz, o.clear, o.thin ?? o.clear * 1.7, o.lane);
    return rec;
  };

  // corkscrew grove on the south edge of the marsh: nine pines wrung the same way, a dead one among them
  {
    const cx = -262, cz = 18;
    const mix = ['cork_a', 'cork_b', 'cork_a', 'cork_c', 'cork_b', 'cork_a', 'cork_b', 'cork_c', 'cork_a'];
    let placedN = 0;
    for (let i = 0; i < 24 && placedN < mix.length; i++) {
      const a = i * 2.399963 + 0.7;
      const rr = 1.5 + 12.5 * Math.sqrt((i + 0.5) / 24);
      const x = cx + Math.cos(a) * rr * 1.15, z = cz + Math.sin(a) * rr * 0.9;
      if (near(x, z, 4.6)) continue;
      if (!usable(x, z, { loc: 6, road: 6, lake: 6, slope: 0.3, rock: 2 })) continue;
      const rec = add(mix[placedN], x, z, { hero: placedN === 0, s: placedN === 0 ? 1.25 : lerp(0.8, 1.2, rg()), note: 'corkscrew grove on the south edge of the marsh' });
      if (rec) placedN++;
    }
    // the grove stands in a glade, open toward the marsh (north) where it is seen from
    glade(cx, cz, 13, 22, { dx: 0, dz: -1, len: 34, half: 17 });
  }
  // hollow oak on the rise south of the crossroads, the doorway turned to face the junction
  hero('oak_a', -230, 270, { yaw: yawToward(-0.94, -0.35), s: 1.12, clear: 13, thin: 26, lane: { dx: -0.94, dz: -0.35, len: 42, half: 12 }, note: 'hollow oak, doorway toward the pass road, red ribbon at the mouth' });
  // weeping birch by the hot spring, its doorway opening toward the pools
  hero('weep_a', -56, -322, { yaw: yawToward(-20, -16), s: 1.1, clear: 12, thin: 22, lane: { dx: -0.78, dz: -0.62, len: 26, half: 8 }, note: 'weeping birch curtain, 25 m from the hot spring pools' });
  // ice tree on the lake shore
  hero('ice_a', 176, 31, { s: 1.15, clear: 8, thin: 14, rules: { lake: 3 }, note: 'glazed ice tree on the south-east shore' });
  // knot tree on the way to the graveyard
  hero('knot_a', 136, 128, { s: 1.1, clear: 10, thin: 18, note: 'knot tree east of the village' });
  // bottle tree on the village approach
  hero('bottle_a', -165, 212, { s: 1.1, clear: 9, thin: 16, note: 'bottle tree on the pass road down to the village' });
  // gate tree: the forest track runs through it
  {
    const road = ROADS.find((r) => r.id === 'forest');
    const p = along(road.pts, 148);
    const yaw = yawToward(p.tx, p.tz);
    const rec = add('arch_a', p.x, p.z, { hero: true, yaw, s: 1.0, sink: 0.12, note: 'gate tree, the forest track passes between the trunks' });
    if (rec) {
      // the road runs through the gate: keep a corridor of 11 m each side and 24 m before and behind it open
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const keep = [];
      for (const it of placed.inner) {
        const kk = kinds[it.k];
        const dx = it.x - p.x, dz = it.z - p.z;
        if (kk.group === 'reed' || kk.group === 'ground' || it.rare || Math.abs(dx) > 40 || Math.abs(dz) > 40) { keep.push(it); continue; }
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // into the tree's frame (+Z along the road)
        const hsh = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453) % 1;
        const inCore = Math.abs(lx) < 7 && Math.abs(lz) < 16;
        const inRim = Math.abs(lx) < 12 && Math.abs(lz) < 26;
        if (kk.group === 'tree' && (inCore || (inRim && hsh > 0.4))) removed++;
        else if (kk.group !== 'tree' && Math.abs(lx) < 5 && Math.abs(lz) < 12) removed++;
        else keep.push(it);
      }
      placed.inner = keep;
    }
  }

  // ---------------------------------------------------------------- scattered specimens
  const SPEC = [
    { species: 'corkscrew', n: 12, same: 90, clear: 3.2, score: (c) => (0.8 * smoothstep(35, 110, c.h) * (1 - smoothstep(230, 340, c.h)) + 0.5 * smoothstep(0.93, 0.78, c.ny)) * (0.35 + 0.65 * smoothstep(0.55, 0.15, c.F)) },
    { species: 'oak', n: 5, same: 170, clear: 7.5, scale: [0.72, 1.0], score: (c) => smoothstep(0.93, 0.98, c.ny) * smoothstep(110, 160, c.dv) * (1 - smoothstep(380, 520, c.dv)) * smoothstep(0.1, 0.35, c.F) * (1 - smoothstep(0.6, 0.8, c.F)) * (1 - smoothstep(60, 120, c.h)) },
    { species: 'weeping', n: 5, same: 130, clear: 5.5, score: (c) => smoothstep(75, 10, c.sd) * smoothstep(0.1, 0.5, c.B) * smoothstep(0.9, 0.96, c.ny) * smoothstep(0.1, 0.3, c.F + 0.2) },
    { species: 'bottle', n: 6, same: 120, clear: 4.5, score: (c) => smoothstep(0.92, 0.97, c.ny) * smoothstep(0.12, 0.3, c.F) * (1 - smoothstep(0.5, 0.7, c.F)) * (1 - smoothstep(110, 190, c.h)) },
    { species: 'knot', n: 4, same: 200, clear: 4.5, score: (c) => smoothstep(8, 45, c.h) * (1 - smoothstep(170, 290, c.h)) * smoothstep(0.88, 0.95, c.ny) * smoothstep(0.1, 0.4, c.F) },
    { species: 'ice', n: 5, same: 120, clear: 4, score: (c) => smoothstep(18, 6, c.sd) * smoothstep(0.9, 0.97, c.ny), rules: { lake: 3.2, slope: 0.18, road: 4 }, lakeOnly: true },
    { species: 'arch', n: 1, same: 500, clear: 6, score: (c) => smoothstep(0.93, 0.98, c.ny) * smoothstep(0.15, 0.4, c.F) * (1 - smoothstep(0.55, 0.75, c.F)), ids: ['arch_a'] },
  ];
  const ctx = {};
  for (const spec of SPEC) {
    const ids = spec.ids || idsOf(spec.species);
    if (!ids.length) continue;
    let placedN = 0;
    for (let tries = 0; tries < 9000 && placedN < spec.n; tries++) {
      const x = (rg() * 2 - 1) * 590, z = (rg() * 2 - 1) * 590;
      if (!usable(x, z, spec.rules)) continue;
      if (near(x, z, 50)) continue;
      if (near(x, z, spec.same, out.filter((o) => kinds[o.k].species === spec.species))) continue;
      const h = W.heightAt(x, z);
      const e = 2.5;
      const gx = W.terrainAt(x - e, z) - W.terrainAt(x + e, z), gz = W.terrainAt(x, z - e) - W.terrainAt(x, z + e);
      ctx.h = h;
      ctx.ny = (2 * e) / Math.hypot(gx, 2 * e, gz);
      ctx.F = clamp(macro.f(x, z), 0, 1.4);
      ctx.B = macro.b(x, z);
      ctx.sd = lakeInfo(x, z);
      ctx.dv = Math.hypot(x - 0, z - 115);
      // roads attract: these should be found, not hidden at the far end of a ridge
      const rd = roads.edge(x, z);
      const seen = 0.3 + 0.7 * smoothstep(160, 30, rd);
      if (spec.lakeOnly && ctx.sd > 30) continue;
      if (rg() >= spec.score(ctx) * seen) continue;
      const id = ids[Math.floor(rg() * ids.length)];
      const sc = spec.scale || [0.85, 1.15];
      const rec = add(id, x, z, { s: lerp(sc[0], sc[1], rg()) });
      if (rec) {
        glade(x, z, spec.clear, spec.clear * 1.7);
        placedN++;
      }
    }
  }

  placed.inner.push(...out);
  return { heroes, counts, removed, list: out };
}
