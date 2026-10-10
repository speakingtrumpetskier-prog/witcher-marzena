// Prologue and Act I: the Hollow Pass (Q1 main_pass) and Something Walks the Ice (Q2 main_ice).
//
//   pass       C1 ends (or a new game without it) -> the wreck: cart (senses clue), the father's letter
//   wolves     three wolves come off the road when the letter is read
//   watchtower C2 at the crest of the pass road, title card, Q1 done
//   ride       C3 at the west gate (or anywhere inside the village core), Q2 -> board
//   board      the notice board: the contract, and the second paper (the mill wolves)
// The talks in Act I (Zbyszek, Bogdan, Hanka) live in npcs.js. Resting lives in world.js.

export function install(C) {
  const { G, L } = C;

  // ---- Q1: the pass ------------------------------------------------------------------------
  const arrived = () => { if (!C.has('pass_arrived')) C.set('pass_arrived'); };
  C.on('cutscene:end', ({ id }) => { if (id === 'c1_blizzard') arrived(); });
  C.on('story:newgame', () => { if (!G.cutscenes.has('c1_blizzard')) arrived(); });

  const pass = L.passStart;
  if (pass) {
    C.zone({
      id: 'wreck_near', x: pass.center.x, z: pass.center.z, r: 24,
      enabled: () => C.stage('main_pass') === 'pass',
      onEnter: arrived,
    });

    // The cart is the senses tutorial: hold RMB, the cart glows, E to examine. The letter is on the father.
    C.clue({
      id: 'cart', pos: pass.examine, radius: 2.4, label: 'Overturned cart',
      enabled: () => !C.has('cart_examined') && !C.has('letter_read'),
      onExamine: async () => { C.set('cart_examined'); },
    });
    C.clue({
      id: 'letter', pos: pass.letter, radius: 2.2, label: 'Letter on the man',
      object: C.obj(pass.father?.character),
      enabled: () => !C.has('letter_read') && C.has('cart_examined'),
      onExamine: async () => {
        await C.sleep(0.5);
        await C.read('note_cart_family');
        C.set('letter_read');
      },
    });
    C.on('quest:update', (e) => {
      if (e.id === 'main_pass' && e.stage === 'wreck' && !C.has('cart_examined')) {
        const still = () => C.stage('main_pass') === 'wreck' && !C.has('cart_examined');
        C.later(2.5, () => { if (still()) C.hintFree([['Hold RMB', 'Hunter senses']], 14, still); });
      }
    });
  }

  // ---- the wolves on the road ----------------------------------------------------------------
  let pack = null;
  const packGone = () => !pack || pack.every((w) => !w.alive || w.disposed || w.state === 'dead');
  function dropPack() {
    if (pack) for (const w of pack) if (!w.disposed) G.creatures?.remove?.(w);
    pack = null;
  }
  function spawnRoadWolves() {
    if (pack || C.has('wolves_prologue_done') || C.stage('main_pass') !== 'wolves' || !G.creatures || !pass) return;
    const sp = pass.marks.wolfSpawns[0];
    pack = G.creatures.spawnWolves(sp.x, sp.z, 3, { engaged: true, spread: 5 });
    C.log('road wolves out');
  }
  C.on('quest:update', (e) => { if (e.id === 'main_pass' && e.stage === 'wolves') C.later(3, spawnRoadWolves); });
  C.on('player:respawn', () => {
    if (pack && C.stage('main_pass') === 'wolves') { dropPack(); C.later(4, spawnRoadWolves); }
  });
  C.restore(() => { if (C.stage('main_pass') === 'wolves' && !pack) C.later(3, spawnRoadWolves); });
  let tick = 0;
  G.addSystem('ctl-road-wolves', (dt) => {
    tick += dt;
    if (tick < 0.7) return;
    tick = 0;
    if (!pack || C.has('wolves_prologue_done')) return;
    if (packGone() && C.stage('main_pass') === 'wolves') { C.set('wolves_prologue_done'); dropPack(); return; }
    // Wolves that ran off count as gone once they are far away.
    const far = pack.every((w) => !w.alive || w.disposed || Math.hypot(w.position.x - C.ppos().x, w.position.z - C.ppos().z) > 90);
    if (far && C.stage('main_pass') === 'wolves') { C.set('wolves_prologue_done'); dropPack(); }
  }, 12);

  // ---- C2: the valley ------------------------------------------------------------------------
  const wt = L.watchtower;
  if (wt) {
    C.zone({
      id: 'valley_crest', x: wt.crest.x, z: wt.crest.z, r: 13,
      enabled: () => !C.has('prologue_done') && C.active('main_pass'),
      onEnter: async () => {
        // Anyone who rode past the wreck and the wolves gets the valley anyway.
        for (const f of ['pass_arrived', 'cart_examined', 'letter_read', 'wolves_prologue_done']) if (!C.has(f)) C.set(f);
        dropPack();
        await C.sleep(0.7);
        await C.scene('c2_valley');
      },
    });
  }

  // ---- Q2: C3 at the west gate ---------------------------------------------------------------
  const playSong = async () => {
    if (C.has('song_heard')) return;
    await C.sleep(0.6);
    await C.scene('c3_song');
  };
  const song = (id, x, z, r) => C.zone({
    id, x, z, r,
    enabled: () => !C.has('song_heard') && C.has('prologue_done') && !C.busy(),
    onEnter: playSong,
  });
  const gate = C.V.gate;
  if (gate) song('west_gate', gate.x, gate.z, 11);
  // Rode in some other way (the shore): the village itself triggers it.
  song('village_core', 0, 115, 52);

  // ---- the notice board ----------------------------------------------------------------------
  const board = C.V.noticeBoard;
  if (board) {
    C.interact({
      id: 'notice_board', pos: board, radius: 2.5, verb: 'Read', label: 'Notice board',
      onUse: async () => {
        await C.read('note_contract');
        C.set('contract_taken');
        await C.sleep(0.5);
        await C.read('note_wolves_contract');
        if (!C.has('wolves_contract_read')) {
          C.set('wolves_contract_read');
          if (!G.quests.rec('side_wolves')) G.quests.start('side_wolves');
        }
      },
    });
  }
}
