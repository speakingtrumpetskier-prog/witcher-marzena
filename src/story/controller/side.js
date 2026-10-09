// Side quests and optional finds.
//
//   side_bird     Jarek's waxwing (npcs.js hands it over); here: leave it on the belfry table, and show it there after a load
//   side_ledger   the cellar under the longhouse: read the ledger
//   side_wisps    the west marsh at night: the drowned smuggler's note and key, then the padlocked hatch in the third kiln
//   side_wolves   the mill: the den below the frozen falls (wolves spawn near, vanish when left behind), the dog's collar
//   the bear      asleep in its den; the silver sword of Wit of the Lynx beside the old hunter (flag wit_sword)
//   island        the carved stones (note_island), Bogdan's boot prints, the place of power (flag island_power)
import { props } from '../../world/props/index.js';

export function install(C) {
  bird(C);
  ledger(C);
  wisps(C);
  wolves(C);
  bear(C);
  island(C);
}

// ---- A Bird for Wiesia ------------------------------------------------------------------------
function bird(C) {
  const { G, S } = C;
  const b = C.L.bellTower?.belfry;
  if (!b) return;
  let prop = null;
  function showBird() {
    if (prop || !C.has('bird_given')) return;
    try {
      prop = props.birdCarving({ seed: 3 });
      prop.position.copy(b.birdSpot);
      prop.rotation.y = (C.L.bellTower.yaw || 0) + 0.4;
      G.scene.add(prop);
    } catch (e) { console.warn('[story controller] bird prop', e.message); prop = null; }
  }
  C.interact({
    id: 'bird_table', pos: b.birdSpot, radius: 2.1, verb: 'Leave', label: 'The bird on the table',
    enabled: () => C.has('bird_taken') && !C.has('bird_given'),
    onUse: async () => {
      await C.read('item_bird');
      S.take('bird', 1);
      C.set('bird_given');
      C.sfx('item_pickup', { volume: 0.6 });
      showBird();
      if (!G.quests.rec('side_bird')) G.quests.start('side_bird');
    },
  });
  C.restore(showBird);
  C.watch('bird_given', showBird);
}

// ---- The Reeve's Ledger -----------------------------------------------------------------------
function ledger(C) {
  const { G } = C;
  const led = C.V.ledger;
  if (!led) return;
  C.interact({
    id: 'ledger', pos: led, radius: 2.1, verb: 'Read', label: "Reeve's ledger",
    onUse: async () => {
      if (!G.quests.rec('side_ledger')) G.quests.start('side_ledger');
      await C.read('note_ledger');
      C.set('ledger_found');
    },
  });
}

// ---- Lights in the Reeds ----------------------------------------------------------------------
function wisps(C) {
  const { G } = C;
  const m = C.L.marsh;
  if (m) {
    // The lights only show at night; the quest opens when she comes close enough to follow them.
    C.zone({
      id: 'marsh_lights', x: m.center.x, z: m.center.z, r: 62,
      enabled: () => !C.has('smuggler_key') && !G.quests.rec('side_wisps') && G.time.isNight,
      onEnter: () => { G.quests.start('side_wisps'); },
    });
    const sm = m.smuggler;
    C.clue({
      id: 'smuggler', pos: sm.note, radius: 2.8, label: 'Drowned smuggler',
      object: C.obj(sm.character),
      enabled: () => !C.has('smuggler_key'),
      onExamine: async () => {
        if (!G.quests.rec('side_wisps')) G.quests.start('side_wisps');
        await C.read('note_smuggler');
        C.pickup('kiln_key', 'Key to the burners\' kilns');
        C.set('wisps_done');
        C.set('smuggler_key');
      },
    });
  }
  const ch = C.L.charcoal;
  if (ch) {
    C.interact({
      id: 'stash', pos: ch.stash, radius: 2.4, verb: 'Open', label: 'Padlocked hatch',
      enabled: () => !C.has('stash_opened'),
      onUse: async () => {
        if (!C.has('smuggler_key')) { C.notify('Padlocked.', 'info'); C.sfx('door_close', { volume: 0.5 }); return; }
        C.sfx('door', { volume: 0.8 });
        for (let i = 1; i <= 10; i++) { ch.hatchOpen?.(i / 10); await C.sleep(0.07); }
        C.set('stash_opened');
        G.state.give('coins', 35);
        G.state.give('thaw', 2);
        C.sfx('coin');
      },
    });
    C.restore(() => { if (C.has('stash_opened')) ch.hatchOpen?.(1); });
  }
}

// ---- Wolves at the Mill -----------------------------------------------------------------------
function wolves(C) {
  const { G } = C;
  const wf = C.L.waterfall;
  if (!wf?.den) return;
  const den = wf.den;
  let pack = null;
  const dead = (w) => !w.alive || w.disposed;
  function drop() {
    if (pack) for (const w of pack) if (!w.disposed) G.creatures?.remove?.(w);
    pack = null;
  }
  C.zone({
    id: 'den_near', x: den.center.x, z: den.center.z, r: 95,
    enabled: () => !C.has('wolves_mill_done'),
    onEnter: () => {
      if (pack || !G.creatures) return;
      const s = den.wolfSpawns[1];
      pack = G.creatures.spawnWolves(s.x, s.z, 4, { alpha: true, spread: 3.6 });
    },
    onLeave: () => { if (pack && pack.every((w) => !w.engaged)) drop(); },
  });
  C.on('player:respawn', () => drop());
  let t = 0;
  G.addSystem('ctl-den-wolves', (dt) => {
    t += dt;
    if (t < 0.7 || !pack) return;
    t = 0;
    if (pack.every(dead) && !C.has('wolves_mill_done')) { C.set('wolves_mill_done'); pack = null; }
  }, 12);
  // The tracks lead from the mill to the den (senses).
  if (den.tracks) {
    C.trail({
      id: 'den_tracks', kind: 'footprints', points: den.tracks.points,
      enabled: () => C.active('side_wolves') && !C.has('wolves_mill_done'),
    });
  }
  if (den.collar) {
    C.interact({
      id: 'collar', pos: den.collar, radius: 1.9, verb: 'Take', label: "Dog's collar",
      enabled: () => !C.has('dog_collar'),
      onUse: async () => { C.set('dog_collar'); C.pickup('dog_collar', "Dog's collar"); },
    });
  }
}

// ---- the bear, and the sword in its den ---------------------------------------------------------
function bear(C) {
  const { G } = C;
  const bd = C.L.bearDen;
  if (!bd) return;
  let bear = null;
  C.zone({
    id: 'bear_near', x: bd.center.x, z: bd.center.z, r: 90,
    enabled: () => !C.has('bear_dead'),
    onEnter: () => {
      if (bear?.alive && !bear.disposed) return;
      if (!G.creatures) return;
      bear = G.creatures.spawnBear(bd.bearSleep.x, bd.bearSleep.z, { sleeping: true, yaw: bd.bearSleep.yaw });
    },
    onLeave: () => {
      if (bear && !bear.engaged && bear.state === 'sleep') { G.creatures?.remove?.(bear); bear = null; }
    },
  });
  C.on('enemy:death', (e) => { if (e.kind === 'bear') C.set('bear_dead'); });
  C.on('player:respawn', () => { if (bear && !bear.disposed) { G.creatures?.remove?.(bear); bear = null; } });

  C.interact({
    id: 'silver_sword', pos: bd.silverSword, radius: 2.2, verb: 'Take', label: "The hunter's sword",
    enabled: () => !C.has('wit_sword'),
    onUse: async () => {
      G.player?.character?.play?.('crouch_examine', { loop: false, fade: 0.25 });
      await C.sleep(0.5);
      await C.read('note_wit');
      C.say('Wit.', 2.2);
      C.set('wit_sword');
      C.pickup('silver_sword', 'Silver sword');
    },
  });
}

// ---- the stone circle island ---------------------------------------------------------------------
function island(C) {
  const { G } = C;
  const is = C.L.island;
  if (!is) return;
  C.interact({
    id: 'island_stones', pos: is.noteIsland, radius: 2.6, verb: 'Examine', label: 'Carved stone',
    onUse: async () => { await C.read('note_island'); },
  });
  if (is.bogdanTrail?.points) {
    C.trail({ id: 'bogdan_prints', kind: 'footprints', points: is.bogdanTrail.points });
  }
  C.interact({
    id: 'island_power', pos: is.power, radius: 2.8, verb: 'Use', label: 'Place of power',
    enabled: () => !C.has('island_power'),
    onUse: async () => {
      G.postfx?.flash?.(0xffc480, 0.35);
      C.sfx('sign_ember', { volume: 0.8 });
      await C.sleep(0.6);
      C.set('island_power');
      C.notify('Ember burns hotter', 'item');
    },
  });
}
