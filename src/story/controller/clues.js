// Nooks: the readable things and small finds scattered between the big beats (docs/STORY.md section 4
// has the copy; the notes themselves live in src/ui/content.js and open through C.read).
//
//   watchtower   the tally marks, and the stash under a loose stone
//   crossroads   the hanged man's coat (note_hanged), the signpost
//   charcoal     the burners' boards (note_burner)
//   cabin        the trapper's diary (note_trapper), the sprung trap
//   hot spring   the carved initials
//   the village  the children's drawing under the boardwalk, the graves, the shrine
//   idol hill    a log to sit on facing the lake
//   the herders  five notes about the sky spirits as the village lives with them (see herders() below)
// Notes are plain E interactions (they are just there to read); things only the hunter's senses
// would pick out are clues in act1/act2/side.
import { makePaper, makeSlate, makeChildPicture } from '../../world/locations/village/signs.js';

export function install(C) {
  const { G, L } = C;

  const readAt = (id, pos, label, note, extra = {}) => {
    if (!pos) return;
    C.interact({
      id, pos, radius: extra.radius ?? 2.3, verb: extra.verb || 'Read', label, enabled: extra.enabled,
      onUse: async () => { await C.read(note); extra.after?.(); },
    });
  };

  // Watchtower ruin
  const wt = L.watchtower;
  if (wt) {
    readAt('tally', wt.tally, 'Tally marks', 'note_tally', { verb: 'Examine' });
    C.interact({
      id: 'tower_stash', pos: wt.stash, radius: 1.9, verb: 'Take', label: 'Loose stone',
      enabled: () => !C.has('watchtower_stash'),
      onUse: async () => {
        G.player?.character?.play?.('crouch_examine', { loop: false, fade: 0.25 });
        await C.sleep(0.8);
        C.set('watchtower_stash');
        G.state.give('coins', 9);
      },
    });
  }

  // Crossroads: the hanged man. His sister's note asks for someone to cut him down; once it is read the
  // prompt under him becomes that (side.js, "Three Loaves").
  const cr = L.crossroads;
  if (cr) {
    readAt('hanged_note', cr.notePrompt, 'Note on the hanged man', 'note_hanged', {
      radius: 2.8,
      enabled: () => !C.has('hanged_read') && !C.has('hanged_cut'),
      after: () => { C.set('hanged_read'); if (!G.quests.rec('side_hanged')) G.quests.start('side_hanged'); },
    });
  }

  // Charcoal burners' camp
  const ch = L.charcoal;
  if (ch) readAt('burner_boards', ch.note, 'Scrawled boards', 'note_burner', { verb: 'Examine', radius: 3 });

  // Trapper's cabin
  const hc = L.hunterCabin;
  if (hc) {
    readAt('trapper_diary', hc.diary, "Trapper's diary", 'note_trapper');
    if (hc.tracks?.points) C.trail({ id: 'cabin_wolves', kind: 'footprints', points: hc.tracks.points });
  }

  // The hot spring: J + W cut in the beam over the door
  const hs = L.hotSpring;
  if (hs) {
    C.interact({
      id: 'initials', pos: hs.initials, radius: 2.6, verb: 'Examine', label: 'Carved initials',
      onUse: async () => { C.set('initials_seen'); C.say('J + W, cut into the beam over the door.', 3.4); },
    });
  }

  // Under the boardwalk: the children's drawing of the ice lady
  readAt('ice_lady', C.V.drawing, 'Charcoal drawing', 'note_drawing', { verb: 'Examine', radius: 2.2 });

  // The graveyard
  if (C.V.graveWiesia) {
    C.interact({
      id: 'grave_wiesia', pos: C.V.graveWiesia, radius: 2.0, verb: 'Examine', label: "Wiesia's grave",
      onUse: async () => { C.set('grave_wiesia_seen'); C.say('Nothing under it. Flowers made of red thread on the post.', 4); },
    });
  }
  if (C.V.graveMateusz) {
    C.interact({
      id: 'grave_mateusz', pos: C.V.graveMateusz, radius: 2.0, verb: 'Examine', label: 'Mateusz Kral',
      onUse: async () => { C.say('Mateusz Kral. The newest post in the row.', 3.4); },
    });
  }

  // Idol hill: a log to sit on, facing the lake
  const idol = L.idol;
  if (idol?.seat) {
    C.interact({
      id: 'idol_seat', pos: C.v3(idol.seat.x, idol.seat.y, idol.seat.z), radius: 2.0, verb: 'Sit', label: 'Log facing the lake',
      onUse: () => C.sit(idol.seat),
    });
  }

  herders(C, readAt);

  // Sitting: for the idol log and anywhere else a seat is wanted. E stands her up again.
  C.sit = async (seat, clip = 'sit_bench') => {
    const P = G.player;
    if (!P) return;
    const c = P.character;
    P.setControl(false);
    c.setPosition(seat.x, seat.z); // the sit clip lowers the hips to the log
    c.yaw = seat.yaw ?? c.yaw;
    c.play(clip, { loop: true, fade: 0.4 });
    G.ui?.hint?.([['E', 'Stand']], 600);
    await C.sleep(0.8);
    await C.press('interact');
    G.ui?.hint?.(null);
    const fx = Math.sin(seat.yaw ?? 0), fz = Math.cos(seat.yaw ?? 0);
    P.teleport(seat.x + fx * 0.9, seat.z + fz * 0.9, seat.yaw ?? 0);
    P.setControl(true);
    c.play('idle', { loop: true, fade: 0.4 });
  };
}

// ---- the herders, as the village lives with them ---------------------------------------------------------
// Five small readable things (copy in src/ui/content.js): the weather page by the tavern door, a fisherman's
// slate at the ice camp (it stops mid-count), the children's picture in the fort, a complaint left under a bowl
// at the shrine, and a second carving on the island stones. Nobody explains what the herders are.
function herders(C, readAt) {
  const { G, L, V, THREE } = C;
  const put = (obj, x, y, z, yaw = 0, rx = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.set(rx, yaw, 0);
    G.scene.add(obj);
    return obj;
  };

  // The weather page, nailed up beside the tavern's front door.
  const tav = V.doors?.find((d) => d.id === 'tavern:front')?.rec;
  if (tav) {
    const x = tav.x + 1.2, y = (tav.y ?? 0) + 1.45, z = tav.z + 0.08;
    put(makePaper({ w: 0.24, h: 0.32, rows: 7, seed: 11 }), x, y, z, tav.yaw || 0);
    readAt('almanac', C.v3(x, y - 0.1, z + 0.5), 'Page by the door', 'note_almanac', { radius: 1.9 });
  }

  // Stach's slate on a stake, by the hole nearest the poles.
  const hole = L.iceCamp?.holes?.[2];
  if (hole) {
    const x = hole.x + 1.7, z = hole.z - 1.1;
    const stake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), new THREE.MeshStandardMaterial({ color: 0x3b322a, roughness: 1 }));
    stake.name = 'note_slate_stake';
    put(stake, x, 0.5, z);
    const cx = L.iceCamp.center.x, cz = L.iceCamp.center.z;
    put(makeSlate(), x, 0.98, z, C.yawTo(x, z, cx, cz), -0.12);
    readAt('slate', C.v3(x, 0.9, z), 'Slate on a stake', 'note_slate', { radius: 2.0 });
  }

  // The children's second picture, on the crates of the fort under the boardwalk.
  const fort = V.kidsFort;
  if (fort) {
    const x = fort.x + 1.7, y = fort.y + 0.45, z = fort.z - 0.02;
    put(makeChildPicture(), x, y, z, Math.PI);
    readAt('child_herders', C.v3(x, y, z - 0.6), 'Charcoal drawing', 'note_child_herders', { verb: 'Examine', radius: 2.0, after: () => C.set('herders_counted') });
  }

  // A complaint, left under the offering bowl on the shrine altar.
  const alt = V.shrineAltar;
  if (alt) {
    const x = alt.x - 0.4, y = alt.y + 0.13, z = alt.z;
    put(makePaper({ w: 0.22, h: 0.16, rows: 4, seed: 5, tone: '#cdbf99' }), x, y, z, 0.3, -Math.PI / 2 + 0.12);
    readAt('shrine_paper', C.v3(x, y + 0.2, z + 0.1), 'Paper under the bowl', 'note_shrine_bells', { radius: 1.9 });
  }

  // The higher carvings on the north side of the stone circle.
  const is = L.island;
  if (is?.stones?.length) {
    const st = is.stones[8] || is.stones[is.stones.length - 1];
    const dx = is.center.x - st.x, dz = is.center.z - st.z, d = Math.hypot(dx, dz) || 1;
    readAt('island_sky', C.v3(st.x + (dx / d) * 1.4, st.y + 1.4, st.z + (dz / d) * 1.4), 'Carved stone, higher up', 'note_island_sky', { verb: 'Examine', radius: 2.4 });
  }
}
