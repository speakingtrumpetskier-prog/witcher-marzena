// NPC and animal gallery: the village area on the real terrain with scaffolding buildings and props
// from the kits, a representative set of stations, ~30 ambient villagers, the named cast, kids and animals.
// This is NOT the village layout (the locations builder composes that); it proves the life system and
// doubles as a reference for which stations to register (see registerStations below).
//
//   ?scene=npcs&hour=11                       default view over the square at eye level
//   &count=30            ambient villagers (named cast and animals are extra)
//   &follow=<id>         camera follows an NPC (e.g. follow=zbyszek, follow=villager_m_3), &dist=3.2
//   &focus=talk|kids|dog|chicken|goat|raven|cat|smith|chop|walkers|home   frame a subject automatically
//   &player=x,z|none     where the stand-in Vesna stands (default 4,127); &vesna=walk loops her along the street
//   &named=0 &animals=0 &count=0   leave out the named cast, the animals or the ambient crowd (for perf baselines)
//   &ang=<rad> &ground=1  force the camera angle around a focus subject / put the animal camera on the ground (roof goat)
//   &ui=1                load the UI module (floating barks show; try --eval "__G.npcs.list.forEach((n) => { n.barkCD = 0.1; })" with Vesna nearby)
//   &tscale=900          run the game clock fast (shot mode freezes it) to watch schedules play out
//   &veg=0               skip vegetation (faster load)   &debug=1  markers for stations, paths and nav blocks
//   &weather=blizzard    people head indoors             &mill=1  frame the mill family
//   &ceye=x,z,dy&cat=x,z,dy&fov=  camera by ground offsets (eye dy above terrain), e.g. ceye=-4,108,1.7&cat=6,124,1.4
//   shots: node scripts/shot.mjs --q "scene=npcs&hour=11&ceye=-4,108,1.7&cat=6,124,1.4" --out shots/npcs/street.png
import * as THREE from 'three';
import { buildings } from '../../world/architecture/index.js';
import { placeBuilding } from '../../world/architecture/place.js';
import { PropBatch } from '../../world/props/index.js';
import { createCharacter } from '../../characters/index.js';
import { LOC } from '../../world/layout.js';
import { ORDER } from '../../core/G.js';

const qs = new URLSearchParams(location.search);
export const modules = ['atmosphere', 'sky', 'terrain', 'water', 'weather', ...(qs.get('veg') === '0' ? [] : ['vegetation']), 'characters', ...(qs.has('ui') ? ['ui'] : []), 'postfx'];
export const needsWorld = true;

export async function init(G) {
  const P = G.params;
  const placed = {};
  const put = (id, b, x, z, yaw = 0, o = {}) => {
    try {
      const p = placeBuilding(G, b, x, z, yaw, o);
      placed[id] = p;
      return p;
    } catch (e) {
      console.error(`[npcs scene] ${id}: ${e.stack || e.message}`);
      G.errors.push(`npcs scene ${id}: ${e.message}`);
      return null;
    }
  };
  const B = buildings;
  const t0 = performance.now();

  // ---- scaffolding buildings (positions from docs/VILLAGE.md) ----
  put('longhouse', B.longhouse({ seed: 9 }), LOC.longhouse.x, LOC.longhouse.z, 0);
  put('tavern', B.tavern({ seed: 5 }), LOC.tavern.x, LOC.tavern.z, 0);
  put('smithy', B.smithy({ seed: 21 }), LOC.smithy.x, LOC.smithy.z, Math.PI);
  put('shrine', B.shrine({ seed: 41 }), LOC.shrine.x, LOC.shrine.z, 0);
  put('workshop', B.workshop({ seed: 17 }), LOC.dobra.x, LOC.dobra.z, Math.PI / 2);
  put('hanka', B.hankaHouse({ seed: 61 }), LOC.hanka.x, LOC.hanka.z, -Math.PI / 2 + 0.4);
  put('well', B.well({ seed: 81 }), 0, 118, 0);
  put('notice', B.noticeBoard({ seed: 91 }), 9, 113, Math.PI);
  put('stall1', B.marketStall({ seed: 101 }), -11, 124, Math.PI);
  put('stall2', B.marketStall({ seed: 103 }), 12, 125, Math.PI);
  const houses = [
    [-60, 100, 0, { size: 'medium', porch: true }], [-46, 86, 0.3, { size: 'small' }], [25, 99, 0, { size: 'medium', porch: true }],
    [45, 92, -0.15, { size: 'small' }], [31, 75, 0.1, { size: 'medium' }], [-30, 82, 0.2, { size: 'small', porch: true }],
    [-40, 141, Math.PI, { porch: true }], [-22, 146, Math.PI, { size: 'small' }], [18, 146, Math.PI + 0.1, { size: 'medium', porch: true }],
    [45, 141, Math.PI, { size: 'small' }], [62, 124, -Math.PI / 2, { porch: true }], [-56, 166, Math.PI / 2, { size: 'small' }],
  ];
  houses.forEach(([x, z, yaw, o], i) => put(`house${i}`, B.logHouse({ seed: 100 + i, ...o }), x, z, yaw));
  put('granary', B.granary({ seed: 3 }), 12, 159, 0);
  put('shed', B.shed({ seed: 8 }), 36, 150, 0.2);
  for (const [x, z, yaw] of [[-70, 57, 0.2], [-30, 54, -0.1], [12, 55, 0.1], [35, 56, 0]]) put(`fish${x}`, B.fishingHut({ seed: 300 + x }), x, z, yaw + Math.PI);
  put('walk', B.boardwalk({ seed: 141, points: [[-90, 62], [-60, 62], [-25, 60], [10, 58], [40, 60]], heightAt: (x, z) => G.world.heightAt(x, z), rails: false }), 0, 0, 0, { snap: false, y: 0 });

  if (P.has('anchors')) {
    for (const [id, pl] of Object.entries(placed)) console.warn(`A ${id} ${pl.x.toFixed(1)},${pl.z.toFixed(1)} yaw ${pl.yaw.toFixed(2)} doors ${pl.doors.map((d) => `${d.x.toFixed(1)},${d.z.toFixed(1)}/${d.yaw.toFixed(2)}`).join(' ')} ${Object.entries(pl.anchors).filter(([k]) => /anvil|forge|keeper|bar|table|door|chair|milk/.test(k)).map(([k, v]) => `${k}:${v.x.toFixed(1)},${v.z.toFixed(1)}`).join(' ')}`.slice(0, 380));
  }
  // ---- helpers for stations ----
  const ST = G.world.stations;
  const reg = (id, o) => { ST[id] = { yaw: 0, ...o }; return ST[id]; };
  const blocked = (x, z, r = 0.55) => G.physics.query(x, z, r).some((it) => {
    if (it.type === 'circle') return Math.hypot(x - it.x, z - it.z) < it.r + r;
    const dx = x - it.x, dz = z - it.z;
    const lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
    return Math.abs(lx) < it.hw + r && Math.abs(lz) < it.hd + r;
  });
  const free = (x, z, r = 0.55) => {
    if (!blocked(x, z, r)) return [x, z];
    for (let d = 0.6; d < 6; d += 0.6) for (let a = 0; a < 6.28; a += 0.7) { const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d; if (!blocked(px, pz, r)) return [px, pz]; }
    return [x, z];
  };
  // A point in front of a placed building's first door, on the side that is not inside a collider.
  const approach = (p, dist = 1.9) => {
    const d = p.doors[0] || { x: p.anchors.door.x, z: p.anchors.door.z, yaw: p.yaw };
    let ax = d.x + Math.sin(d.yaw) * dist, az = d.z + Math.cos(d.yaw) * dist;
    if (blocked(ax, az, 0.4)) { ax = d.x - Math.sin(d.yaw) * dist; az = d.z - Math.cos(d.yaw) * dist; }
    return { x: ax, z: az, yaw: Math.atan2(d.x - ax, d.z - az) };
  };
  const floorY = (p) => (p.walk && p.walk.floors && p.walk.floors[0] ? p.walk.floors[0].y : p.y + 0.05);

  // ---- props (benches, work spots, hay, racks, the ice camp) ----
  const batch = new PropBatch(G, 'npcs_scene');
  const A = (name, x, z, o = {}) => batch.add(name, x, z, o);
  const tav = placed.tavern && approach(placed.tavern, 2.6);
  const benchTavL = tav && A('bench', tav.x - 2.3, tav.z + 0.3, { yaw: 0, seed: 1 });
  const benchTavR = tav && A('bench', tav.x + 2.6, tav.z + 0.3, { yaw: 0, seed: 2 });
  const chop1 = A('choppingBlock', -66, 116, { seed: 1 });
  const chop2 = A('choppingBlock', 52, 106, { seed: 2 });
  A('firewoodStack', -69, 117, { yaw: 0.3, seed: 1 });
  A('firewoodStack', 55, 107, { yaw: -0.2, seed: 2 });
  const hay = [[-66, 146], [-63.5, 149], [-66.5, 152], [-62, 144]].map(([x, z], i) => A('stump', x, z, { yaw: i * 0.9, seed: i }));
  const rack1 = A('dryingRack', -12, 92, { yaw: 0.1, seed: 1 });
  const rack2 = A('dryingRack', 14, 84, { yaw: -0.1, seed: 2 });
  const laundry = A('laundryLine', -14, 152, { yaw: 0.2, seed: 1 });
  A('barrel', 4, 101, { seed: 1 }); A('barrel', 6, 100.5, { seed: 2 });
  A('chickenCoop', -48, 152, { yaw: 0.4, seed: 1 });
  A('dogKennel', 30, 133, { yaw: 3.0, seed: 1 });
  A('sled', -40, 205, { yaw: 0.6, seed: 1 }); A('sled', -37, 207, { yaw: -0.4, seed: 2 });
  const camp = LOC.iceCamp;
  const stools = [[-2.5, 0.5], [2.2, -1.2], [0.3, 3.2]].map(([dx, dz], i) => A('fishingStool', camp.x + dx, camp.z + dz, { yaw: i * 2, seed: i, snap: true }));
  const holes = [[-2.5, -0.6], [2.2, -2.3], [0.3, 2.1]].map(([dx, dz], i) => A('iceFishingHole', camp.x + dx, camp.z + dz, { seed: i, snap: true }));
  A('windbreak', camp.x + 1, camp.z - 4.5, { yaw: 0.3 });
  const benchSh = A('bench', 4, 119.8, { yaw: 0, seed: 3 });
  try { batch.build(); } catch (e) { console.error(e); G.errors.push(`npcs scene props: ${e.message}`); }
  

  // The NPC system first (so it does not populate by itself), then stations, then people.
  const { init: initNpcs } = await import('../../gameplay/npcs/index.js');
  await initNpcs(G);

  // ---- stations ----
  registerStations({ G, P, placed, reg, free, approach, floorY, tav, stools, holes, hay, chop1, chop2, rack1, rack2, laundry, benchTavL, benchTavR, benchSh });
  if (P.has('mill')) {
    // The miller's family lives at the mill, far from the village: only exists near the camera.
    const m = put('mill', B.mill({ seed: 311 }), LOC.mill.x, LOC.mill.z, Math.PI);
    const a = m && (m.doors[0] || (m.anchors.door && m.anchors.door.x != null)) ? approach(m, 3) : { x: LOC.mill.x, z: LOC.mill.z + 7, yaw: 0 };
    reg('mill_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
    reg('mill_work', { kind: 'work', anim: 'carry_bucket', x: a.x + 3, z: a.z + 1, yaw: 1 });
    reg('mill_house', { kind: 'work', anim: 'stir', x: a.x - 2.5, z: a.z + 1.5, yaw: -1 });
    reg('mill_yard', { kind: 'work', anim: 'child_play', x: a.x + 1, z: a.z + 5, yaw: 0, capacity: 2 });
  }

  // ---- stand-in Vesna ----
  const pp = (P.get('player') || '4,127').split(',').map(Number);
  let vesna = null;
  if (P.get('player') !== 'none') {
    vesna = createCharacter('vesna');
    G.scene.add(vesna.root);
    vesna.setPosition(pp[0], pp[1]);
    vesna.yaw = P.has('pyaw') ? parseFloat(P.get('pyaw')) : Math.PI;
    G.player = { character: vesna, position: vesna.root.position, get yaw() { return vesna.yaw; }, state: 'explore', setControl() {} };
    if (P.get('vesna') === 'walk') {
      const route = [[-80, 126], [-40, 121], [-8, 122], [20, 120], [48, 112], [20, 120], [-8, 122], [-40, 121]];
      const loop = async () => {
        for (;;) for (const [x, z] of route) await vesna.walkTo(x, z, { speed: 1.5 });
      };
      vesna.setPosition(route[0][0], route[0][1]);
      loop();
    }
  }

  // tscale=900 runs the clock fast (the harness freezes it): watch schedules play out
  if (P.has('tscale')) G.time.scale = parseFloat(P.get('tscale'));

  // ---- people and animals ----
  await G.npcs.populate({
    count: parseInt(P.get('count') || '30', 10), seed: parseInt(P.get('seed') || '4242', 10),
    named: P.get('named') !== '0', mill: P.has('mill'), animals: P.get('animals') !== '0', ambient: P.get('count') !== '0',
  });
  const report = { buildMs: Math.round(performance.now() - t0), ...G.npcs.stats() };
  console.warn('[npcs scene]', JSON.stringify(report));
  window.__npcsReport = () => G.npcs.stats();
  // Behavior self-test (use with --eval "__npcsTest()"): flight, proximity reactions, goTo, pause, time jump.
  window.__npcsTest = () => {
    const N = G.npcs, log = (...a) => console.warn(`T ${a.join(' ')}`);
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { G.clock.elapsed += dt; N.update(dt); } };
    const barks = [];
    const oldUi = G.ui;
    G.ui = { ...(oldUi || {}), bark: (name, text) => barks.push(`${name}:${text}`) };
    // 1. raven flies off and lands again
    const r = N.animals.list.find((a) => a.kind === 'raven' && a.state === 'perch');
    if (r) {
      const y0 = r.y; r.takeOff(N.S); step(30);
      log('raven after 1.5s', r.state, `y ${y0.toFixed(1)}->${r.y.toFixed(1)}`);
      step(400); log('raven after 21s', r.state, r.x.toFixed(0), r.y.toFixed(1), r.z.toFixed(0));
    } else log('no perched raven');
    // 2. Vesna walks up to a standing villager
    const n1 = N.list.find((n) => n.state === 'station' && n._c && n.anim && n.anim !== 'sit_bench' && !n.hidden && n.station.kind === 'work' && !n.station.indoor && n.d2 < 28 * 28);
    if (n1 && G.player) {
      const p = n1._c.root.position;
      G.player.position.set(p.x + 3.5, p.y, p.z);
      step(20);
      G.player.position.set(p.x + 0.6, p.y, p.z);
      n1.barkCD = 0; N.barkClock = 0;
      step(40);
      log('villager', n1.id, 'lookOn', n1.lookOn, 'side', n1.sideX.toFixed(2), n1.sideZ.toFixed(2), 'barks', JSON.stringify(barks.slice(0, 2)));
      G.player.position.set(-70, p.y, 100); step(60);
    }
    // 3. goTo across the village and back to the schedule
    const n2 = N.get('zbyszek') || N.list.find((n) => n._c);
    n2.goTo({ x: -60, z: 135, yaw: 1 }).then((ok) => log('goTo resolved', ok));
    step(1200, 0.1);
    const q = n2._c.root.position;
    log('goTo end', n2.state, q.x.toFixed(1), q.z.toFixed(1));
    n2.release(); step(600, 0.1);
    log('after release', n2.state, n2.station && n2.station.id, n2._c.root.position.x.toFixed(1), n2._c.root.position.z.toFixed(1));
    // 4. pause freezes the brain
    const n3 = N.list.find((n) => n.state === 'walk' && n._c);
    if (n3) {
      const a = n3._c.root.position.clone(); n3.pause(true); step(40);
      const moved = a.distanceTo(n3._c.root.position);
      n3.pause(false); step(100);
      log('pause moved', moved.toFixed(3), 'resumed state', n3.state);
    }
    // 5. a time jump to night puts people indoors, then back to day
    G.time.setHours(23); step(5);
    log('night', JSON.stringify(N.stats()).slice(0, 160));
    G.time.setHours(11); step(5);
    log('day', JSON.stringify(N.stats()).slice(0, 160));
    G.ui = oldUi;
  };
  // Console dump of who is where (use with --eval "__npcsDump()"): id:state:anim:station:x,z (H hidden, C talking)
  window.__npcsDump = () => {
    const N = G.npcs;
    const rows = N.list.filter((n) => n._c).map((n) => `${n.id.replace('villager_', 'v')}:${n.state[0]}:${(n.anim || '-').slice(0, 5)}:${n.station ? n.station.id : '-'}:${n._c.root.position.x.toFixed(0)},${n._c.root.position.z.toFixed(0)}${n.hidden ? 'H' : ''}${n.convo ? 'C' : ''}${n.throwing ? 'T' : ''}`);
    let chunk = '';
    for (const r of rows) { if ((chunk + r).length > 330) { console.warn(`D ${chunk}`); chunk = ''; } chunk += `${r} | `; }
    console.warn(`D ${chunk}`);
    console.warn(`convos=${N.convos.active.size} ${JSON.stringify(N.stats())}`);
  };

  // ---- camera control (follow / focus) and debug markers ----
  setupCamera(G, P, vesna);
  if (P.has('ceye')) {
    // ceye=x,z,dy (eye above ground)  cat=x,z,dy (look target above ground)  fov=
    const e = P.get('ceye').split(',').map(Number), l = (P.get('cat') || '0,120,1.2').split(',').map(Number);
    G.cameraOwner = 'shot';
    G.camera.position.set(e[0], G.world.heightAt(e[0], e[1]) + (e[2] ?? 1.7), e[1]);
    G.camera.lookAt(l[0], G.world.heightAt(l[0], l[1]) + (l[2] ?? 1.2), l[1]);
    if (P.has('fov')) { G.camera.fov = parseFloat(P.get('fov')); G.camera.updateProjectionMatrix(); }
  }
  if (P.has('debug')) debugOverlay(G);
  void ORDER;
}

// ---------------------------------------------------------------------------------------------
// The reference station set. Each id is what src/gameplay/npcs/cast.js asks for; ambient roles pick
// stations by `tag` (or by id words). `door` points are outside the entrance.
function registerStations(c) {
  const { G, placed, reg, free, approach, floorY, tav, stools, holes, hay, chop1, chop2, rack1, rack2, laundry, benchTavL, benchTavR, benchSh } = c;
  const ground = (x, z) => G.world.heightAt(x, z);
  const near = (p, ox, oz) => ({ x: p.x + ox, z: p.z + oz });
  // houses: a bed behind each door (hidden inside), and porch props
  const houseKeys = Object.keys(placed).filter((k) => /^house/.test(k));
  houseKeys.forEach((k) => {
    const a = approach(placed[k]);
    reg(`bed_${k}`, { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z }, yaw: a.yaw });
  });

  // Hanka's house (enterable): bed, loom, porch, milk on the ice
  if (placed.hanka) {
    const p = placed.hanka, a = approach(p, 1.8), fy = floorY(p);
    const table = p.anchors.table, milk = p.anchors.milk, doorIn = p.anchors.doorInside || p.anchors.door;
    reg('hanka_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
    reg('hanka_loom', { kind: 'work', tag: 'loom', anim: 'mend_net', x: table.x + 0.8, z: table.z + 0.6, yaw: Math.atan2(-0.8, -0.6), indoor: true, door: { x: a.x, z: a.z }, y: fy });
    reg('hanka_porch', { kind: 'work', anim: 'warm_hands', x: a.x + 0.4, z: a.z + 0.4, yaw: a.yaw + Math.PI });
    if (milk) reg('hanka_milk', { kind: 'sit', anim: 'kneel_idle', x: milk.x, z: milk.z + 0.6, yaw: 0 });
    void doorIn;
  }
  // The reeve
  if (placed.longhouse) {
    const p = placed.longhouse, a = approach(p, 2.4), chair = p.anchors.chair || p.anchors.hearth;
    reg('bogdan_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
    reg('bogdan_table', { kind: 'sit', anim: 'sit_bench', x: chair.x, z: chair.z, yaw: 0, indoor: true, door: { x: a.x, z: a.z }, y: floorY(p) });
  }
  reg('bogdan_square', { kind: 'work', anim: 'hands_hips', x: 3, z: 122.5, yaw: Math.PI });
  reg('notice_board', { kind: 'work', anim: 'cross_arms', x: 9, z: 111.4, yaw: 0 });
  // Dobra's workshop
  if (placed.workshop) {
    const p = placed.workshop, a = approach(p, 3);
    reg('dobra_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
    reg('dobra_work', { kind: 'work', anim: 'mend_net', tag: 'workshop', x: a.x + 0.5, z: a.z + 0.8, yaw: a.yaw + Math.PI * 0.5 });
    reg('dobra_porch', { kind: 'sit', anim: 'sit_bench', x: a.x - 1.2, z: a.z + 0.4, yaw: a.yaw + Math.PI });
  }
  hay.forEach((h, i) => reg(`dobra_bale_${i + 1}`, { kind: 'work', tag: 'bale', anim: 'child_play', x: h.x - 0.9, z: h.z + 0.1, yaw: Math.PI / 2, capacity: 2 }));
  // The tavern: Zbyszek behind the bar, drinkers at the tables, a porch to lean on
  if (placed.tavern) {
    const p = placed.tavern, a = tav, fy = floorY(p), A = p.anchors;
    reg('zbyszek_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
    reg('tavern_bar', { kind: 'work', tag: 'bar', anim: 'hands_hips', x: (A.keeper || A.bar).x, z: (A.keeper || A.bar).z, yaw: 0, indoor: true, door: { x: a.x, z: a.z }, y: fy });
    reg('tavern_porch', { kind: 'work', anim: 'lean_wall', x: a.x - 3.4, z: a.z - 1.0, yaw: Math.PI });
    ['table1', 'table2', 'table3'].forEach((k, i) => {
      if (A[k]) reg(`tavern_seat_${i + 1}`, { kind: 'sit', tag: 'tavern_seat', anim: 'sit_bench', x: A[k].x + 0.9, z: A[k].z + 0.2, yaw: -Math.PI / 2, indoor: true, door: { x: a.x, z: a.z }, y: fy });
    });
    const t4 = A.table4 || A.table3;
    if (t4) reg('tavern_corner', { kind: 'sit', tag: 'tavern_corner', anim: 'sit_bench', x: t4.x - 0.9, z: t4.z - 0.3, yaw: Math.PI / 2, indoor: true, door: { x: a.x, z: a.z }, y: fy });
  }
  // porch benches (elders), a gate to lean on
  [benchTavL, benchTavR, benchSh].forEach((b, i) => {
    if (!b) return;
    const s = b.anchors.seatA || b.anchors.seat;
    reg(`porch_${i + 1}`, { kind: 'sit', tag: 'porch', anim: 'sit_bench', x: s.x, z: s.z, yaw: i === 2 ? Math.PI : 0, capacity: 1 });
    if (b.anchors.seatB) reg(`porch_${i + 4}`, { kind: 'sit', tag: 'porch', anim: 'sit_bench', x: b.anchors.seatB.x, z: b.anchors.seatB.z, yaw: i === 2 ? Math.PI : 0 });
  });
  reg('gate_1', { kind: 'work', tag: 'gate', anim: 'lean_wall', x: -82, z: 126, yaw: Math.PI / 2 });
  // work
  [chop1, chop2].forEach((h, i) => { const w = h.anchors.work || { x: h.x, z: h.z + 0.8 }; reg(`chop_${i + 1}`, { kind: 'work', tag: 'chop', anim: 'chop_wood', x: w.x, z: w.z, yaw: Math.PI }); });
  if (placed.smithy) {
    const p = placed.smithy, a = p.anchors;
    const anvil = a.anvil || a.forge;
    const d = approach(p, 1.5);
    reg('forge_1', { kind: 'work', tag: 'forge', anim: 'hammer', x: anvil.x - 0.1, z: anvil.z - 0.95, yaw: 0 });
    reg('shovel_smithy', { kind: 'work', tag: 'shovel', anim: 'sweep', tool: 'shovel', x: d.x + 2, z: d.z + 1, yaw: 0.6 });
  }
  reg('well_1', { kind: 'work', tag: 'well', anim: 'stir', x: 1.3, z: 119.1, yaw: -Math.PI / 2 + 0.2 });
  reg('well_2', { kind: 'work', tag: 'well', anim: 'stir', x: -1.3, z: 118.9, yaw: Math.PI / 2 - 0.2 });
  reg('market_1', { kind: 'work', tag: 'market', anim: 'hands_hips', x: -11, z: 126.2, yaw: 0 });
  reg('market_2', { kind: 'work', tag: 'market', anim: 'cross_arms', x: 12, z: 127.2, yaw: 0 });
  [rack1, rack2].forEach((h, i) => { const w = h.anchors.work || { x: h.x, z: h.z + 0.7 }; reg(`fish_rack_${i + 1}`, { kind: 'work', tag: 'fish_rack', anim: 'mend_net', x: w.x, z: w.z, yaw: Math.PI }); });
  reg('net_1', { kind: 'work', tag: 'net', anim: 'mend_net', x: -45, z: 59, yaw: Math.PI });
  reg('net_2', { kind: 'work', tag: 'net', anim: 'mend_net', x: -8, z: 56.5, yaw: Math.PI });
  reg('jarek_net', { kind: 'work', tag: 'net', anim: 'mend_net', x: -20, z: 57.5, yaw: Math.PI });
  reg('jarek_dock', { kind: 'sit', tag: 'dock', anim: 'sit_ground', x: 40, z: 62.5, yaw: Math.PI });
  if (placed['fish-70']) {
    const a = approach(placed['fish-70'], 1.6);
    reg('jarek_bed', { kind: 'bed', x: a.x, z: a.z, door: { x: a.x, z: a.z } });
  }
  stools.forEach((s, i) => reg(`ice_hole_${i + 1}`, { kind: 'work', tag: 'ice_hole', anim: 'fish_ice', x: s.x, z: s.z, yaw: Math.atan2(holes[i].x - s.x, holes[i].z - s.z) }));
  reg('shovel_1', { kind: 'work', tag: 'shovel', anim: 'sweep', tool: 'shovel', x: 22, z: 121, yaw: 1.2 });
  reg('shovel_2', { kind: 'work', tag: 'shovel', anim: 'sweep', tool: 'shovel', x: -24, z: 119, yaw: -1.0 });
  reg('laundry_1', { kind: 'work', tag: 'laundry', anim: 'mend_net', x: laundry.x, z: laundry.z + 0.8, yaw: Math.PI });
  if (placed.shrine) reg('shrine_1', { kind: 'work', tag: 'shrine', anim: 'pray', x: LOC.shrine.x, z: LOC.shrine.z + 2.2, yaw: Math.PI });
  reg('goat_pen_1', { kind: 'work', tag: 'goat_pen', anim: 'carry_bucket', x: 33.5, z: 160, yaw: 1.2 });
  reg('sled_hill_1', { kind: 'work', tag: 'sled', anim: 'child_play', x: -40, z: 203, yaw: 0, capacity: 3 });
  reg('sled_hill_2', { kind: 'work', tag: 'sled', anim: 'child_play', x: -36, z: 206, yaw: 2, capacity: 3 });
  reg('kids_fort_1', { kind: 'sit', tag: 'fort', anim: 'sit_ground', x: -20, z: 63.4, yaw: 0, capacity: 3 });
  reg('kids_fort_2', { kind: 'sit', tag: 'fort', anim: 'sit_ground', x: -17.6, z: 63.4, yaw: 0.4, capacity: 3 });
  // pairs chat here
  const socials = [[4, 122, 0.4], [-8, 121, 1.0], [tav ? tav.x + 5 : -28, tav ? tav.z + 3 : 112, 0.2], [26, 133, 2.6], [0.5, 112, 1.5], [-20, 98, 0.9]];
  socials.forEach(([x, z, yaw], i) => { const f = free(x, z, 1.0); reg(`social_${i + 1}`, { kind: 'talk', tag: 'social', x: f[0], z: f[1], yaw }); });
  reg('wander_square', { kind: 'wander', x: 0, z: 116, r: 40, anim: 'idle' });
  reg('wander_shore', { kind: 'wander', x: -10, z: 66, r: 38, anim: 'idle' });

  // animals: dogs, a flock of hens by the coop, goats in the pen, one on the shed roof, a cat, ravens on roofs
  reg('dog_1', { animal: 'dog', x: 6, z: 112, r: 16 });
  reg('dog_2', { animal: 'dog', x: tav ? tav.x + 5 : -28, z: tav ? tav.z + 5 : 112, r: 12 });
  reg('dog_3', { animal: 'dog', x: 30, z: 131, r: 10 });
  reg('chickens_1', { animal: 'chicken', x: -45, z: 150, count: 6, r: 6 });
  reg('chickens_2', { animal: 'chicken', x: 22, z: 106, count: 3, r: 5 });
  reg('goats_1', { animal: 'goat', x: 36, z: 159, count: 2, r: 4 });
  if (placed.shed) {
    // Ridge height: cast a ray down onto the shed from above (the bounding box includes finials and chimney).
    placed.shed.root.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(new THREE.Vector3(placed.shed.x, 40, placed.shed.z), new THREE.Vector3(0, -1, 0)).intersectObject(placed.shed.group, true)[0];
    const ry = hit ? hit.point.y : new THREE.Box3().setFromObject(placed.shed.group).max.y - 0.6;
    reg('goat_roof', { animal: 'goat', perch: true, x: placed.shed.x, z: placed.shed.z, y: ry - 0.04 });
  }
  const porch = placed.house8 ? placed.house8 : null;
  if (porch) reg('cat_porch', { animal: 'cat', x: porch.anchors.porch ? porch.anchors.porch.x : porch.x, z: porch.anchors.porch ? porch.anchors.porch.z + 0.5 : porch.z + 4, y: ground(porch.x, porch.z) + 0.4, perch: true });
  else reg('cat_porch', { animal: 'cat', x: 4, z: 128 });
  for (const k of ['longhouse', 'tavern', 'smithy']) {
    if (!placed[k]) continue;
    const box = new THREE.Box3().setFromObject(placed[k].group);
    reg(`raven_${k}`, { animal: 'raven', perch: true, x: placed[k].x + 1, z: placed[k].z, y: box.max.y + 0.05 });
  }
  void near;
}

// ---------------------------------------------------------------------------------------------
function setupCamera(G, P, vesna) {
  const follow = P.get('follow');
  const focus = P.get('focus');
  const dist = parseFloat(P.get('dist') || '3.4');
  const lerpTo = (v, t, k) => { v.x += (t.x - v.x) * k; v.y += (t.y - v.y) * k; v.z += (t.z - v.z) * k; };
  const cam = G.camera.position.clone(), look = new THREE.Vector3();
  const org = new THREE.Vector3(), dir = new THREE.Vector3();
  let subject = null, frame = 0, mode = null, ang = null;
  // A camera angle (radians around the subject) with a clear line to the subject, tried in order of preference.
  const clearAngle = (tx, ty, tz, base, d, eyeY, offs = [0.45, -0.45, 1.1, -1.1, 1.8, -1.8, 2.6, -2.6, Math.PI]) => {
    for (const off of offs) {
      const a = base + off;
      const ex = tx + Math.sin(a) * d, ez = tz + Math.cos(a) * d;
      org.set(tx, ty, tz);
      dir.set(ex - tx, eyeY - ty, ez - tz);
      const len = dir.length();
      dir.multiplyScalar(1 / len);
      if (G.physics.raycast(org, dir, len, 0.2) >= len - 0.05) return a;
    }
    return base + 0.45;
  };
  const pick = () => {
    const N = G.npcs, list = N.list.filter((n) => n.visible);
    if (follow) { subject = N.get(follow); mode = 'follow'; return; }
    switch (focus) {
      case 'talk': {
        const cv = [...N.convos.active].find((c) => c.a.d2 < 60 * 60) || [...N.convos.active][0];
        subject = cv ? { pair: [cv.a, cv.b] } : null; mode = 'pair'; break;
      }
      case 'kids': {
        // the two children playing closest together, plus any third within 5 m
        const kids = list.filter((n) => n.def.child && n.anim === 'child_play' && n._c && n.station && (n.station.tag === 'bale' || n.station.tag === 'sled'));
        let pair = null, bd = 1e9;
        for (const a of kids) for (const b of kids) {
          if (a === b) continue;
          const d = Math.hypot(a._c.root.position.x - b._c.root.position.x, a._c.root.position.z - b._c.root.position.z);
          if (d < bd) { bd = d; pair = [a, b]; }
        }
        subject = pair ? { group: pair.concat(kids.filter((k) => !pair.includes(k) && Math.hypot(k._c.root.position.x - pair[0]._c.root.position.x, k._c.root.position.z - pair[0]._c.root.position.z) < 5)) } : null;
        mode = 'group'; break;
      }
      case 'smith': subject = list.find((n) => n.anim === 'hammer'); mode = 'follow'; break;
      case 'chop': subject = list.find((n) => n.anim === 'chop_wood'); mode = 'follow'; break;
      case 'home': case 'walkers': {
        // the walker with the most other walkers within 20 m, plus those neighbors
        const w = list.filter((n) => n.state === 'walk' && n._c);
        let best = [];
        for (const a of w) {
          const g = w.filter((b) => Math.hypot(b._c.root.position.x - a._c.root.position.x, b._c.root.position.z - a._c.root.position.z) < 20);
          if (g.length > best.length) best = g;
        }
        subject = best.length ? { group: best.slice(0, 5) } : null; mode = 'group'; break;
      }
      case 'dog': case 'goat': case 'cat': case 'chicken': case 'raven': {
        const all = N.animals.list.filter((x) => x.kind === focus);
        const a = (P.has('roof') ? all.find((x) => x.yFix != null) : null) || (focus === 'raven' ? all.find((x) => x.state === 'perch') : null) || all[0];
        subject = a ? { animal: a } : null; mode = 'animal'; break;
      }
      default: break;
    }
  };
  G.addSystem('npcs_cam', (dt) => {
    if (!(follow || focus)) return;
    frame++;
    if (frame === 3 || (!subject && frame % 20 === 0)) { pick(); ang = null; }
    if (!subject) return;
    G.cameraOwner = 'shot';
    const k = Math.min(1, dt * 4);
    const tgt = new THREE.Vector3(), eye = new THREE.Vector3();
    const force = P.has('ang') ? parseFloat(P.get('ang')) : null;
    if (mode === 'follow') {
      const c = subject.character, p = c.root.position;
      tgt.set(p.x, p.y + c.height * 0.62, p.z);
      if (ang == null) ang = force ?? clearAngle(p.x, tgt.y, p.z, c.yaw, dist, p.y + c.height * 0.85);
      eye.set(p.x + Math.sin(ang) * dist, p.y + c.height * 0.85, p.z + Math.cos(ang) * dist);
    } else if (mode === 'pair') {
      const a = subject.pair[0].character.root.position, b = subject.pair[1].character.root.position;
      tgt.set((a.x + b.x) / 2, a.y + 1.25, (a.z + b.z) / 2);
      const d = dist * 1.25;
      if (ang == null) ang = force ?? clearAngle(tgt.x, tgt.y, tgt.z, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, d, a.y + 1.45, [0.15, -0.15, 0.6, -0.6, Math.PI - 0.15, Math.PI + 0.3]);
      eye.set(tgt.x + Math.sin(ang) * d, a.y + 1.45, tgt.z + Math.cos(ang) * d);
    } else if (mode === 'group') {
      const g = subject.group.filter((n) => n._c);
      tgt.set(0, 0, 0);
      for (const n of g) tgt.add(n._c.root.position);
      tgt.multiplyScalar(1 / Math.max(1, g.length));
      tgt.y += 1.0;
      let r = dist;
      for (const n of g) r = Math.max(r, Math.hypot(n._c.root.position.x - tgt.x, n._c.root.position.z - tgt.z) + 2.5);
      if (ang == null) ang = force ?? clearAngle(tgt.x, tgt.y, tgt.z, 0.05, r * 1.1, tgt.y + 0.7);
      eye.set(tgt.x + Math.sin(ang) * r * 1.1, tgt.y + 0.7, tgt.z + Math.cos(ang) * r * 1.1);
    } else if (mode === 'animal') {
      const an = subject.animal, p = an.root.position;
      tgt.set(p.x, p.y + 0.35, p.z);
      const d = dist * 0.8;
      if (ang == null) ang = force ?? clearAngle(p.x, tgt.y, p.z, an.yaw, d, p.y + 0.8);
      const ex = p.x + Math.sin(ang) * d, ez = p.z + Math.cos(ang) * d;
      eye.set(ex, P.has('ground') ? G.world.heightAt(ex, ez) + 1.5 : p.y + 0.8, ez);
    }
    if (frame < 6) { cam.copy(eye); look.copy(tgt); } else { lerpTo(cam, eye, k); lerpTo(look, tgt, k); }
    G.camera.position.copy(cam);
    G.camera.lookAt(look);
  }, ORDER.camera);
  void vesna;
}

function debugOverlay(G) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.15, 6, 4);
  const colors = { work: 0xffa030, sit: 0x40c0ff, talk: 0x60ff80, bed: 0xc060ff, wander: 0xffff40 };
  for (const [id, s] of Object.entries(G.world.stations)) {
    if (s.animal) continue;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[s.kind || 'work'] || 0xffffff, depthTest: false }));
    m.position.set(s.x, G.world.heightAt(s.x, s.z) + 0.3, s.z);
    m.renderOrder = 999;
    m.name = `st_${id}`;
    g.add(m);
  }
  // nav blocked cells as small red quads (flag 1) and margin (flag 2, yellow)
  const nav = G.npcs.nav;
  const pts = [], pts2 = [];
  for (const R of nav.regions) {
    for (let j = 0; j < R.nz; j += 1) for (let i = 0; i < R.nx; i += 1) {
      const f = R.flags[j * R.nx + i];
      if (!f) continue;
      const x = R.x0 + (i + 0.5), z = R.z0 + (j + 0.5);
      (f === 1 ? pts : pts2).push(x, G.world.heightAt(x, z) + 0.12, z);
    }
  }
  const mk = (arr, color) => {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(bg, new THREE.PointsMaterial({ color, size: 0.35, sizeAttenuation: true, depthTest: false }));
    p.renderOrder = 998;
    g.add(p);
  };
  mk(pts, 0xff3030); mk(pts2, 0xffff30);
  // current paths
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x40ff40, depthTest: false }));
  line.renderOrder = 997; line.frustumCulled = false;
  g.add(line);
  G.scene.add(g);
  G.addSystem('npcs_debug', () => {
    const arr = [];
    for (const n of G.npcs.list) {
      if (n.state !== 'walk' || !n.path || !n._c) continue;
      let px = n._c.root.position.x, pz = n._c.root.position.z;
      for (let i = n.pi; i < n.path.length; i++) {
        const w = n.path[i];
        arr.push(px, G.world.heightAt(px, pz) + 0.25, pz, w.x, G.world.heightAt(w.x, w.z) + 0.25, w.z);
        px = w.x; pz = w.z;
      }
    }
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  }, ORDER.late);
}
