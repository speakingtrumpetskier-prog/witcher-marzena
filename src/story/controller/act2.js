// Act II: Straw and Ice (Q3 main_straw) and The Bell Under the Ice (Q4 main_bell), then the dawn.
//
//   night   nightfall comes by resting or waiting (world.js owns resting); Flow sets `night1` after 20:00
//   camp    senses at the ice-fishing camp: the mitten, the stool, the drag marks north
//   trail   the marzanny: a ring of dormant effigies on the trail, three rise, then two (Ember burns them)
//   echo    the old hole at the ritual site: C4 on a senses echo
//   tower   drag marks to the drowned tower (the quest's own reach zone ends the stage)
//   climb   up the stairs; the seated effigy on the first landing turns to look as she passes
//   belfry  C5 when she stands in the belfry; the music box and the ribbon on the table afterwards
//   dawn    leaving the tower after C5: the dawn scene, day 2 at 7:30 in fog on the shore

export function install(C) {
  const { G, L } = C;

  // ---- the ice-fishing camp ------------------------------------------------------------------
  const camp = L.iceCamp;
  if (camp) {
    C.clue({
      id: 'mitten', pos: camp.mitten, radius: 2.2, label: 'Darned mitten',
      enabled: () => C.has('night1') && !C.has('trail_found'),
      onExamine: async () => { C.set('trail_found'); },
    });
    C.clue({
      id: 'stool', pos: camp.overturnedStool, radius: 2.0, label: 'Overturned stool', once: true,
      enabled: () => C.has('night1'),
    });
    C.trail({
      id: 'drag', kind: 'drag', points: camp.drag.points,
      enabled: () => C.has('night1') && !C.has('echo_seen'),
    });
    C.on('quest:update', (e) => {
      if (e.id === 'main_straw' && e.stage === 'camp') {
        const still = () => C.stage('main_straw') === 'camp' && C.near(camp.center.x, camp.center.z, 90);
        C.later(3, () => { if (still()) C.hintFree([['Hold RMB', 'Hunter senses']], 12, still); });
      }
    });
  }

  // ---- the marzanny on the trail -----------------------------------------------------------
  const RING = { x: -30, z: -18, r: 10 };
  let ring = null; // { list: [effigy x5], woke: 0 }
  const alive = (e) => e.alive && !e.disposed;
  function dropRing() {
    if (!ring) return;
    for (const e of ring.list) if (!e.disposed) G.creatures?.remove?.(e);
    ring = null;
  }
  function makeRing() {
    if (ring || !G.creatures || C.has('effigies_fought')) return;
    // wake: 0 so the controller paces them (three, then two); their own proximity wake would raise all five.
    ring = { list: G.creatures.spawnEffigyRing(RING.x, RING.z, 5, RING.r, { angle: 0.4, wake: 0 }), woke: 0 };
  }
  function wake(n) {
    if (!ring) return;
    while (n-- > 0 && ring.woke < ring.list.length) ring.list[ring.woke++].rise();
  }
  C.zone({
    id: 'effigy_ring_near', x: RING.x, z: RING.z, r: 85, r2: 0,
    enabled: () => C.has('night1') && !C.has('effigies_fought'),
    onEnter: makeRing,
    onLeave: () => { if (ring && ring.woke === 0) dropRing(); },
  });
  C.zone({
    id: 'effigy_ring_wake', x: RING.x, z: RING.z, r: 17,
    enabled: () => C.has('night1') && !C.has('effigies_fought'),
    onEnter: () => { makeRing(); wake(3); C.log('marzanny rise: 3'); },
  });
  // Straight to the ritual site and round the camp: they come for her anyway.
  C.zone({
    id: 'effigy_ring_ritual', x: L.ritual?.center.x ?? 10, z: L.ritual?.center.z ?? -30, r: 32,
    enabled: () => C.has('night1') && !C.has('effigies_fought'),
    onEnter: () => { makeRing(); wake(5); },
  });
  let tick = 0;
  G.addSystem('ctl-marzanny', (dt) => {
    tick += dt;
    if (tick < 0.5 || !ring) return;
    tick = 0;
    // Standing ones only: the dormant pair waiting in the drift do not count.
    const live = ring.list.filter((e) => alive(e) && e.state !== 'dormant').length;
    if (ring.woke >= 3 && ring.woke < 5 && live <= 1) { wake(2); C.log('marzanny rise: 2 more'); }
    if (ring.woke >= 5 && live === 0) {
      C.set('effigies_fought');
      const r = ring;
      ring = null;
      // The corpses and the red knots stay; the controller only lets go of the list.
      void r;
    }
  }, 12);
  C.on('player:respawn', () => { if (ring) dropRing(); });

  // ---- the echo at the ritual site -----------------------------------------------------------
  const R = L.ritual;
  if (R) {
    C.clue({
      id: 'echo', kind: 'echo', pos: R.echo, radius: 2.8, label: 'Echo',
      enabled: () => C.has('night1') && C.has('effigies_fought') && !C.has('echo_seen'),
      onExamine: async () => { await C.scene('c4_echo'); },
    });
  }

  // ---- drag marks on to the tower ----------------------------------------------------------------
  const tower = L.bellTower;
  if (R && tower) {
    const a = [R.center.x + 4, R.center.z - 12];
    const b = [tower.door.x, tower.door.z];
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t + Math.sin(t * 9) * 2.2, a[1] + (b[1] - a[1]) * t + Math.cos(t * 7) * 2.2]);
    }
    C.trail({
      id: 'drag_tower', kind: 'drag', points: pts,
      enabled: () => C.has('echo_seen') && !C.has('lair_seen'),
    });
  }

  // ---- the stairs: the seated one turns its head ---------------------------------------------
  if (tower?.stairs?.seated) {
    const g = tower.stairs.seated.group, p0 = tower.stairs.seated.pos;
    const rest = g.rotation.y;
    let turn = 0;
    G.addSystem('ctl-stairs-effigy', (dt) => {
      const p = C.ppos();
      const d = Math.hypot(p.x - p0.x, p.z - p0.z);
      const near = d < 3.4 && Math.abs(p.y - p0.y) < 2.4;
      const want = near ? Math.max(-0.9, Math.min(0.9, Math.atan2(p.x - p0.x, p.z - p0.z) - rest)) : 0;
      turn += (want - turn) * Math.min(1, dt * 1.6);
      g.rotation.y = rest + turn;
    }, 70);
  }

  // ---- the belfry: C5 ---------------------------------------------------------------------------
  if (tower?.belfry) {
    const b = tower.belfry;
    C.zone({
      id: 'belfry', x: b.table.x, z: b.table.z, r: 4.4,
      enabled: () => !C.has('lair_seen') && C.ppos().y > b.floorY - 1.3,
      onEnter: async () => {
        await C.sleep(0.9);
        await C.scene('c5_lair');
      },
    });
    // What is left on the table once she has seen it.
    C.interact({
      id: 'music_box', pos: b.musicBox, radius: 1.9, verb: 'Use', label: 'Music box',
      enabled: () => C.has('lair_seen'),
      onUse: async () => {
        G.player?.character?.play?.('crouch_examine', { loop: false, fade: 0.25 });
        C.sfx('item_pickup', { volume: 0.5 });
        await C.read('item_music_box');
      },
    });
    C.interact({
      id: 'ribbon', pos: b.ribbon, radius: 1.8, verb: 'Take', label: 'Red ribbon',
      enabled: () => C.has('lair_seen') && !C.has('ribbon_taken'),
      onUse: async () => {
        C.set('ribbon_taken');
        C.pickup('ribbon', 'Red ribbon');
        await C.read('item_ribbon');
      },
    });
  }

  // ---- dawn: leaving the tower after C5 ----------------------------------------------------------
  let tt = 0;
  G.addSystem('ctl-dawn', (dt) => {
    tt += dt;
    if (tt < 0.5) return;
    tt = 0;
    if (!tower || !C.has('lair_seen') || C.has('dawn_done') || C.busy() || C.running.size) return;
    const p = C.ppos();
    const away = Math.hypot(p.x - tower.door.x, p.z - tower.door.z) > 9 && Math.hypot(p.x - 120, p.z + 150) > 9;
    if (away && p.y < 3 && G.input?.context === 'game') {
      C.running.add('dawn-pending');
      C.scene('dawn').finally(() => C.running.delete('dawn-pending'));
    }
  }, 12);
}
