// A walker for the autopilot: moves Vesna with the real controls (the move input and the sprint key, through the real
// locomotion, colliders, slopes and floors) along a planned path, the way a player would walk it, and says where she
// could not get through. Used by the playthrough with &walk=1 and by the probes.
//
//   const W = makeWalker({ G, tick });
//   const r = await W.walkTo(x, z, { arrive: 0.9, until: () => bool, target: () => ({ x, z }), run: true, via: [[x, z], ...] });
//   r = { ok, why, from, to, at, secs, dist, speed, planned, notes[] }
//     why: 'arrived' | 'until' | 'stuck' | 'timeout' | 'busy' ; planned false when the grid found no route at all
//   W.describe(x, z)   what is around a spot (colliders, ground, floor, slope), for a stuck report
//   W.release()        hands the input back
// The path comes from an A* over 0.25 m cells by the player's own rules, heights included (see `fine`), from the
// colliders and floors as they are at that moment; a long leg is planned in stretches along the villagers' 1 m grid.
// When the goal itself cannot be stood on (a person behind a counter, a thing on a table) the path ends at the
// nearest place she can reach, if that is within about 3 m.
import { Nav } from '../../../gameplay/npcs/nav.js';
import { RADIUS } from '../../../gameplay/player/locomotion.js';
import { groundY } from '../../../gameplay/player/ground.js';

const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export function makeWalker({ G, tick }) {
  const inp = G.input;
  const real = inp.move;
  const drv = { on: false, x: 0, y: 0 };
  // Input.update writes move.x and move.y every frame; while the walker drives, reads return the walker's stick.
  inp.move = {
    get x() { return drv.on ? drv.x : real.x; }, set x(v) { real.x = v; },
    get y() { return drv.on ? drv.y : real.y; }, set y(v) { real.y = v; },
  };
  const nav = new Nav(G);
  const P = () => G.player;

  // ---- planning --------------------------------------------------------------------------------------------------
  // The fine search steps over 0.25 m cells by the player's own rules, in three dimensions: the height at the next
  // cell is what the game's groundY gives from the height she is at (so stairs, cellars, the belfry and caves under a
  // hill all work), a step up of more than 0.6 m is refused, and a collider blocks where its height range meets hers.
  // The collider padding is a little under her radius so a 0.95 m door always has a row of free cells down its middle.
  const FINE = 0.25, PAD = RADIUS - 0.08, QY = 0.3;
  function fine(x0, z0, y0, x1, z1, o = {}) {
    const phys = G.physics;
    const pad = 14;
    const bx0 = Math.floor(Math.min(x0, x1) - pad), bz0 = Math.floor(Math.min(z0, z1) - pad);
    const nx = Math.ceil((Math.max(x0, x1) + pad - bx0) / FINE), nz = Math.ceil((Math.max(z0, z1) + pad - bz0) / FINE);
    const cx = (k) => bx0 + ((k % nx) + 0.5) * FINE, cz = (k) => bz0 + (((k / nx) | 0) + 0.5) * FINE;
    const at = (x, z) => { const i = Math.floor((x - bx0) / FINE), j = Math.floor((z - bz0) / FINE); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
    const lev = (y) => Math.round(y / QY) + 400;
    const key = (k, y) => k * 2048 + lev(y);
    const hitCache = new Map();
    const hit = (k, y) => {
      const q = key(k, y);
      let v = hitCache.get(q);
      if (v !== undefined) return v;
      v = false;
      const x = cx(k), z = cz(k);
      for (const it of phys.query(x, z, PAD + 0.05)) {
        if (y + 1.0 < it.y0 || y > it.y1) continue;
        let d;
        if (it.type === 'circle') d = Math.hypot(x - it.x, z - it.z) - it.r;
        else {
          const dx = x - it.x, dz = z - it.z;
          const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
          d = Math.hypot(Math.max(0, Math.abs(lx) - it.hw), Math.max(0, Math.abs(lz) - it.hd));
        }
        if (d < PAD) { v = true; break; }
      }
      hitCache.set(q, v);
      return v;
    };
    // Height she would stand at in cell m coming from height y, or null when she cannot step there.
    const stepCache = new Map();
    const stepTo = (m, y, dist) => {
      const q = key(m, y);
      let v = stepCache.get(q);
      if (v === undefined) {
        const ym = groundY(cx(m), cz(m), y);
        v = ym - y > 0.6 || hit(m, ym) ? null : ym;
        stepCache.set(q, v);
      }
      if (v == null) return null;
      // stepping off a floor edge or a ledge: only when the caller allows a drop that deep
      if (y - v > (o.drop ?? 1.1)) return null;
      // steep ground is not climbed (the game refuses slopes over about 50 degrees uphill)
      if (v - y > 1.2 * dist && dist > 0) return null;
      return v;
    };
    // the height the game would put her at in cell k coming from height y (no rules applied), cached
    const gyCache = new Map();
    const gy = (k, y) => { const q = key(k, y); let v = gyCache.get(q); if (v === undefined) { v = groundY(cx(k), cz(k), y); gyCache.set(q, v); } return v; };
    const snap = (x, z, y, maxR) => {
      const o0 = at(x, z);
      if (o0 >= 0 && !hit(o0, groundY(x, z, y))) return o0;
      const ci = Math.floor((x - bx0) / FINE), cj = Math.floor((z - bz0) / FINE), rr = Math.ceil(maxR / FINE);
      let best = Infinity, bk = -1;
      for (let j = Math.max(0, cj - rr); j <= Math.min(nz - 1, cj + rr); j++) for (let i = Math.max(0, ci - rr); i <= Math.min(nx - 1, ci + rr); i++) {
        const k = j * nx + i, d = Math.hypot(cx(k) - x, cz(k) - z);
        if (d < best && !hit(k, groundY(cx(k), cz(k), y))) { best = d; bk = k; }
      }
      return bk;
    };
    const si = snap(x0, z0, y0, 1.5);
    if (si < 0) return null;
    const gi = at(x1, z1);
    const gxi = gi % nx, gzi = (gi / nx) | 0;
    const h = (k) => { const dx = Math.abs((k % nx) - gxi), dz = Math.abs(((k / nx) | 0) - gzi); return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * FINE * 0.98; };
    // nodes: Map key -> { k, y, g, f, parent, closed }
    const nodes = new Map();
    const heap = [];
    const push = (n) => { let i = heap.push(n) - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const ys = groundY(cx(si), cz(si), y0);
    const start = { k: si, y: ys, g: 0, f: h(si), parent: null, closed: false };
    nodes.set(key(si, ys), start);
    push({ f: start.f, ref: start });
    const wantY = o.y;
    const isGoal = (n) => n.k === gi && (wantY == null || Math.abs(n.y - wantY) < 1.3);
    let best = start, bestD = Infinity, found = null, expanded = 0;
    while (heap.length && expanded < 450000) {
      const n = pop().ref; // the heap holds { f, ref }: a node pushed again with a better cost leaves a stale entry behind
      if (n.closed) continue;
      n.closed = true;
      expanded++;
      if (isGoal(n)) { found = n; break; }
      const d = Math.hypot(cx(n.k) - x1, cz(n.k) - z1) + (wantY == null ? 0 : Math.abs(n.y - wantY) * 2);
      if (d < bestD) { bestD = d; best = n; }
      const ki = n.k % nx, kj = (n.k / nx) | 0;
      for (const nb of NB) {
        const ni = ki + nb[0], nj = kj + nb[1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const m = nj * nx + ni, dist = nb[2] * FINE;
        const ym = stepTo(m, n.y, dist);
        if (ym == null) continue;
        if (nb[0] !== 0 && nb[1] !== 0 && (hit(kj * nx + ni, n.y) || hit(nj * nx + ki, n.y))) continue;
        // keep off the walls where there is room, and well off an edge she could step over (a stair's open side)
        const tight = hit(m + 1, ym) || hit(m - 1, ym) || hit(m + nx, ym) || hit(m - nx, ym);
        const ledge = ym - gy(m + 1, ym) > 0.6 || ym - gy(m - 1, ym) > 0.6 || ym - gy(m + nx, ym) > 0.6 || ym - gy(m - nx, ym) > 0.6;
        const ng = n.g + dist * (ledge ? 3 : tight ? 1.7 : 1);
        const q = key(m, ym);
        let c = nodes.get(q);
        if (!c) { c = { k: m, y: ym, g: Infinity, f: 0, parent: null, closed: false }; nodes.set(q, c); }
        if (c.closed || ng >= c.g) continue;
        c.g = ng; c.f = ng + h(m); c.parent = n;
        push({ f: c.f, ref: c });
      }
    }
    const end = found || (bestD <= (o.near ?? 3.2) ? best : null);
    if (!end) return null;
    const chain = [];
    for (let n = end; n; n = n.parent) chain.push(n);
    chain.reverse();
    // String-pull: drop a waypoint when the straight line to the one after is walkable by the same rules.
    const los = (a, b) => {
      const dx = cx(b.k) - cx(a.k), dz = cz(b.k) - cz(a.k), m = Math.ceil(Math.hypot(dx, dz) / (FINE * 0.5));
      let y = a.y, prev = a.k;
      for (let q = 1; q <= m; q++) {
        const k = at(cx(a.k) + dx * (q / m), cz(a.k) + dz * (q / m));
        if (k < 0) return false;
        if (k === prev) continue;
        const yy = stepTo(k, y, FINE);
        if (yy == null) return false;
        if (hit(k + 1, yy) || hit(k - 1, yy) || hit(k + nx, yy) || hit(k - nx, yy)) return false;
        y = yy; prev = k;
      }
      return Math.abs(y - b.y) < 0.4;
    };
    const out = [];
    let i = 0;
    while (i < chain.length - 1) {
      let j = Math.min(chain.length - 1, i + 80);
      // on a stair or a ramp the waypoints stay close together, on the cells the search chose (the middle of the flight)
      for (let q = i + 1; q <= j; q++) if (Math.abs(chain[q].y - chain[q - 1].y) > 0.02) { j = Math.min(j, Math.max(i + 2, q)); break; }
      for (; j > i + 1; j--) if (los(chain[i], chain[j])) break;
      out.push({ x: cx(chain[j].k), z: cz(chain[j].k), y: chain[j].y });
      i = j;
    }
    if (found) out.push({ x: x1, z: z1, y: found.y });
    else out.short = bestD;
    return out;
  }

  // The long way round: the villagers' 1 m grid with the enterable buildings made transparent (their doors are too
  // narrow for it), searched without a cap. Only a hint: the fine search plans each stretch of it.
  function coarse(x0, z0, x1, z1) {
    const pad = 60;
    nav.regions = [];
    const R = nav.build(Math.floor(Math.min(x0, x1) - pad), Math.floor(Math.min(z0, z1) - pad), Math.ceil(Math.max(x0, x1) + pad), Math.ceil(Math.max(z0, z1) + pad));
    const { nx, nz, flags, cost } = R;
    for (const room of G.world.rooms || []) {
      const b = room.box;
      if (!b) continue;
      const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0), ext = Math.hypot(b.hw, b.hd) + 2;
      for (let z = b.z - ext; z <= b.z + ext; z += 1) for (let x = b.x - ext; x <= b.x + ext; x += 1) {
        const dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > b.hw + 1.3 || Math.abs(lz) > b.hd + 1.3) continue;
        const k = R.at(x, z);
        if (k >= 0) flags[k] = 0;
      }
    }
    const tmp = { x: 0, z: 0 };
    let si = R.at(x0, z0), gi = R.at(x1, z1);
    if (si < 0 || gi < 0) return null;
    if (flags[si] === 1) { nav.snap(x0, z0, tmp, 9); si = R.at(tmp.x, tmp.z); }
    if (flags[gi] === 1) { nav.snap(x1, z1, tmp, 9); gi = R.at(tmp.x, tmp.z); }
    if (si === gi) return [{ x: x1, z: z1 }];
    const n = nx * nz;
    const g = new Float32Array(n).fill(Infinity), f = new Float32Array(n), parent = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [];
    const gx = gi % nx, gz = (gi / nx) | 0;
    const h = (k) => { const dx = Math.abs((k % nx) - gx), dz = Math.abs(((k / nx) | 0) - gz); return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * 0.95; };
    const push = (k) => { let i = heap.push(k) - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    g[si] = 0; f[si] = h(si); push(si);
    while (heap.length) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === gi) { const cells = []; for (let c = gi; c >= 0; c = parent[c]) { cells.push({ x: R.cx(c), z: R.cz(c) }); if (c === si) break; } return cells.reverse(); }
      const ki = k % nx, kj = (k / nx) | 0;
      for (const nb of NB) {
        const ni = ki + nb[0], nj = kj + nb[1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const m = nj * nx + ni;
        if (flags[m] === 1 || closed[m]) continue;
        if (nb[0] !== 0 && nb[1] !== 0 && (flags[kj * nx + ni] === 1 || flags[nj * nx + ki] === 1)) continue;
        const ng = g[k] + nb[2] * cost[m];
        if (ng < g[m]) { g[m] = ng; parent[m] = k; f[m] = ng + h(m); push(m); }
      }
    }
    return null;
  }

  // A route from here to there. Near: the fine search. Far: the coarse hint picks a point about 70 m on and the
  // fine search plans to that; walkTo plans again when she gets there (`part` marks such a first piece).
  const LONG = 90;
  function plan(x0, z0, x1, z1, o = {}) {
    const y0 = P().position.y;
    if (Math.hypot(x1 - x0, z1 - z0) <= LONG) {
      // The proper way first (stairs, slopes); a way that steps off an edge only when there is no other, and it says so.
      let p = fine(x0, z0, y0, x1, z1, o);
      if ((!p || p.short != null) && o.drop == null) {
        const q = fine(x0, z0, y0, x1, z1, { ...o, drop: 30 });
        if (q && (q.short == null || !p || q.short < p.short - 0.5)) { q.dropped = true; p = q; }
      }
      return p;
    }
    const far = coarse(x0, z0, x1, z1);
    let mid;
    if (far) {
      let len = 0, k = 1;
      for (; k < far.length && len < 70; k++) len += Math.hypot(far[k].x - far[k - 1].x, far[k].z - far[k - 1].z);
      mid = far[Math.min(k, far.length - 1)];
    } else {
      const d = Math.hypot(x1 - x0, z1 - z0);
      mid = { x: x0 + ((x1 - x0) / d) * 70, z: z0 + ((z1 - z0) / d) * 70 };
    }
    const p = fine(x0, z0, y0, mid.x, mid.z, { near: 6 });
    if (p) p.part = true;
    return p;
  }

  function describe(x, z) {
    const W = G.world;
    const y = P()?.position.y ?? 0;
    const near = [];
    for (const it of G.physics.query(x, z, 1.4)) {
      const d = it.type === 'circle' ? Math.hypot(x - it.x, z - it.z) - it.r : null;
      near.push(`${it.type}${it.tag ? `:${it.tag}` : ''}@${it.x.toFixed(1)},${it.z.toFixed(1)}${d != null ? ` d=${d.toFixed(2)}` : ` hw=${it.hw.toFixed(1)} hd=${it.hd.toFixed(1)}`} y=${it.y0 < -500 ? '*' : it.y0.toFixed(1)}..${it.y1 > 500 ? '*' : it.y1.toFixed(1)}`);
    }
    const n = W.walkNormalAt ? W.walkNormalAt(x, z) : W.normalAt(x, z);
    const floor = W.floorAt ? W.floorAt(x, z, y) : null;
    return `y=${y.toFixed(2)} terrain=${W.terrainAt(x, z).toFixed(2)} ground=${W.heightAt(x, z).toFixed(2)} floor=${floor == null ? 'none' : floor.toFixed(2)} ny=${n.y.toFixed(2)} surface=${W.surfaceAt(x, z)} room=${W.indoorRoom?.(x, z) || 'outside'} colliders=[${near.slice(0, 5).join('; ')}]`;
  }

  function release() { drv.on = false; drv.x = drv.y = 0; inp.keys.delete('ShiftLeft'); }

  async function walkTo(tx, tz, o = {}) {
    const p = P();
    if (p.mounted) p.dismountInstant?.();
    const arrive = o.arrive ?? 0.9;
    const from = { x: p.position.x, z: p.position.z };
    const res = { ok: false, why: '', from, to: { x: tx, z: tz }, at: null, secs: 0, dist: 0, speed: 0, planned: true, notes: [] };
    const goal = () => { if (o.target) { const t = o.target(); if (t) { tx = t.x; tz = t.z; } } };
    goal();
    let path = null;
    const replan = () => {
      path = null;
      const px = p.position.x, pz = p.position.z;
      if (o.via?.length) {
        // Forced waypoints (stairs, a known way in): plan each piece, fall back to a straight line.
        path = [];
        let ax = px, az = pz;
        for (const [vx, vz] of [...o.via, [tx, tz]]) { const seg = plan(ax, az, vx, vz, {}) || [{ x: vx, z: vz }]; path.push(...seg); ax = vx; az = vz; }
        return;
      }
      path = plan(px, pz, tx, tz, { y: o.y, near: o.near });
      // No way found (or she already stands at the nearest place she can reach): head straight for it, which shows where she sticks.
      if (!path || !path.length) { if (!path) res.planned = false; const short = path?.short; path = [{ x: tx, z: tz }]; if (short != null) path.stay = short; }
    };
    replan();
    if (path.dropped) res.notes.push('the only way found steps off an edge (a drop of more than 1.1 m)');
    const plannedLen = path.reduce((s, w, i) => s + Math.hypot(w.x - (i ? path[i - 1].x : from.x), w.z - (i ? path[i - 1].z : from.z)), 0);
    const maxT = o.timeout ?? Math.max(plannedLen, Math.hypot(tx - from.x, tz - from.z) * 1.7) / 2.2 + 30;
    let wi = 0, t = 0, busyT = 0, mark = { x: from.x, z: from.z, t: 0 }, replans = 0, lastY = p.position.y, lastGoal = { x: tx, z: tz };
    let px = from.x, pz = from.z, held = null;
    drv.on = true;
    const done = (ok, why) => {
      release();
      res.ok = ok; res.why = why; res.at = { x: p.position.x, y: p.position.y, z: p.position.z }; res.secs = +t.toFixed(1);
      res.speed = t > 0 ? +(res.dist / t).toFixed(2) : 0;
      if (!ok) res.notes.push(`here: ${describe(p.position.x, p.position.z)}`);
      return res;
    };
    while (t < maxT) {
      if (G.story.busy || G.cutscenes?.active || G.dialogue?.active || !p.control || p.dead) {
        drv.x = drv.y = 0;
        if (!held) held = { x: p.position.x, z: p.position.z };
        await tick();
        busyT += 0.1;
        if (busyT > 180) return done(false, 'busy');
        mark = { x: p.position.x, z: p.position.z, t };
        continue;
      }
      if (held) {
        // A scene or a talk ran. If it put her somewhere else, this leg is over: the story has taken her on.
        const moved = Math.hypot(p.position.x - held.x, p.position.z - held.z);
        held = null;
        if (moved > 6) { res.notes.length = 0; return done(true, 'moved by the story'); }
        px = p.position.x; pz = p.position.z; lastY = p.position.y;
        replan(); wi = 0;
      }
      if (o.until && o.until()) return done(true, 'until');
      goal();
      if (Math.hypot(tx - lastGoal.x, tz - lastGoal.z) > 1.5) { lastGoal = { x: tx, z: tz }; replan(); wi = 0; }
      const dGoal = Math.hypot(tx - p.position.x, tz - p.position.z);
      const onFloor = o.y == null || Math.abs(p.position.y - o.y) < 1.3;
      if (dGoal <= arrive && onFloor) return done(true, 'arrived');
      // under or over the place, on the wrong floor, with no way left: say so
      if (dGoal <= arrive && !onFloor && wi >= path.length - 1) { res.notes.push(`at the spot but on the wrong floor: y=${p.position.y.toFixed(2)}, wanted about ${o.y.toFixed(2)}`); return done(false, 'wrong floor'); }
      let w = path[Math.min(wi, path.length - 1)];
      let dw = Math.hypot(w.x - p.position.x, w.z - p.position.z);
      // A waypoint is passed when she is at it on its own level: on a stair in a tower the turns above and below are
      // within a step of her sideways. Where the way climbs she walks, and passes waypoints closely.
      const climbs = (i) => path[i]?.y != null && Math.abs(path[i].y - p.position.y) > 0.3 && Math.hypot(path[i].x - p.position.x, path[i].z - p.position.z) < 1.6;
      const climbing = climbs(wi) || climbs(wi + 1) || climbs(wi + 2);
      const reach = climbing ? 0.3 : 0.9;
      const level = (q) => q.y == null || Math.abs(q.y - p.position.y) < 0.7;
      while (wi < path.length - 1 && dw < reach && level(w)) { wi++; w = path[wi]; dw = Math.hypot(w.x - p.position.x, w.z - p.position.z); }
      if (path.part && wi === path.length - 1 && dw < 2.5) { replan(); wi = 0; continue; }
      // The way ends short of the goal (the goal cannot be stood on): being at its end is being there.
      if (path.short != null && wi === path.length - 1 && dw < 0.45) { res.short = +dGoal.toFixed(2); return done(true, 'as near as she can get'); }
      if (path.stay != null) { res.short = +dGoal.toFixed(2); return done(true, 'as near as she can get'); }
      const dx = (w.x - p.position.x) / (dw || 1), dz = (w.z - p.position.z) / (dw || 1);
      const cy = G.cameraRig ? G.cameraRig.yaw : 0, s = Math.sin(cy), c = Math.cos(cy);
      drv.y = s * dx + c * dz;
      drv.x = -c * dx + s * dz;
      if (o.run !== false && dGoal > 5 && !climbing) inp.keys.add('ShiftLeft'); else inp.keys.delete('ShiftLeft');
      // walking pace on stairs: half stick
      if (climbing) { drv.x *= 0.5; drv.y *= 0.5; }
      await tick();
      t += 0.1;
      const nx = p.position.x, nz = p.position.z;
      const step = Math.hypot(nx - px, nz - pz);
      if (step < 4) res.dist += step; // a larger jump is a teleport by the story, not walking
      const dy = p.position.y - lastY;
      if (Math.abs(dy) > 1.1 && step < 4) res.notes.push(`height jump ${dy > 0 ? '+' : ''}${dy.toFixed(2)} m at ${nx.toFixed(1)},${nz.toFixed(1)} (y ${lastY.toFixed(2)} to ${p.position.y.toFixed(2)})`);
      lastY = p.position.y; px = nx; pz = nz;
      if (t - mark.t >= 2.5) {
        const moved = Math.hypot(nx - mark.x, nz - mark.z);
        if (moved < 0.6) {
          if (replans < 2) { replans++; res.notes.push(`held up at ${nx.toFixed(1)},${nz.toFixed(1)} heading for ${w.x.toFixed(1)},${w.z.toFixed(1)}: ${describe(nx, nz)}`); replan(); wi = 0; }
          else return done(false, 'stuck');
        }
        mark = { x: nx, z: nz, t };
      }
    }
    return done(false, 'timeout');
  }

  return { walkTo, describe, release, plan };
}
