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
// Notes are plain E interactions (they are just there to read); things only the hunter's senses
// would pick out are clues in act1/act2/side.

export function install(C) {
  const { G, L } = C;

  const readAt = (id, pos, label, note, extra = {}) => {
    if (!pos) return;
    C.interact({
      id, pos, radius: extra.radius ?? 2.3, verb: extra.verb || 'Read', label,
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

  // Crossroads: the hanged man
  const cr = L.crossroads;
  if (cr) readAt('hanged_note', cr.notePrompt, 'Note on the hanged man', 'note_hanged', { radius: 2.8 });

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
