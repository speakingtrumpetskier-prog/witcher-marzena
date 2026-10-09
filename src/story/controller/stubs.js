// Placeholders for story content that other builders are writing in parallel (dialogues by the
// writer, cutscenes by the cinematics builder). scenes.js runs one of these only when the real
// file under src/story/content is missing, logs that once, and the stub sets the same flags the
// scene would set per docs/STORY.md so the whole game stays playable end to end. Once the real
// files exist none of this runs.
//
// Dialogue stubs reuse the key lines from STORY.md section 3 and keep the real choices (the reeve's
// money, the decisive talk with Hanka, the child's question) so the flags downstream stay honest.
// Cutscene stubs are short inline director scripts: a fade, a few subtitles, the end state.

const V = 'vesna';

// ---- dialogues -----------------------------------------------------------------------------------
export const DIALOGUE_STUBS = {
  zbyszek_hub: {
    id: 'zbyszek_hub', cast: ['zbyszek'], start: 'n1',
    nodes: {
      n1: { s: 'zbyszek', t: "It's thin. I know it's thin. You try brewing with what we've got.", a: 'hands_hips', do: (S) => S.set('met_zbyszek'), next: 'hub' },
      hub: {
        choices: [
          { t: 'Who has gone missing?', next: 'm1', once: true },
          { t: 'Something is out on the ice?', next: 'w1', once: true },
          { t: 'The contract on the board. Whose hand is that?', next: 'h1', once: true },
          { t: 'Tomorrow night.', next: 'r1', once: true },
          { t: 'A Thaw draught (12 grosze).', next: 'buy', if: (S) => S.count('coins') >= 12 && S.count('thaw') < 3 },
          { t: 'Never mind.', next: 'bye', exit: true },
        ],
      },
      m1: { s: 'zbyszek', t: 'Stach, Bolek, and the younger Wrona. Went to their holes at dusk and the holes were empty in the morning. Not even the stools.', next: 'hub' },
      w1: { s: 'zbyszek', t: "Something's out there at night. I've seen it from the shore. Like people walking, but wrong. Slow.", next: 'hub' },
      h1: { s: 'zbyszek', t: 'H.? Only Hanka writes that fair. Her man was the scribe before the fever took him. She keeps to herself. House on the shore, east, past the huts.', do: (S) => S.set('knows_fair_hand'), next: 'hub' },
      r1: { s: 'zbyszek', t: "The rite's tomorrow night. Equinox. We drown Marzanna and the winter goes.", next: 'r2' },
      r2: { s: 'zbyszek', t: "We've done it three years running. Look outside.", next: 'r3' },
      r3: { s: V, t: 'And the girl they picked?', next: 'r4' },
      r4: { s: 'zbyszek', t: "Ask the reeve. It's not my business and I'm not saying it.", next: 'hub' },
      buy: { s: 'zbyszek', t: 'Twelve. Not eleven.', do: (S, D) => D.G.storyCtl?.buy?.('thaw'), next: 'hub' },
      bye: { s: 'zbyszek', t: "Shut the door, you're letting the heat out.", end: true },
    },
  },

  bogdan_first: {
    id: 'bogdan_first', cast: ['bogdan'], start: 'n1',
    nodes: {
      n1: { s: 'bogdan', t: "We didn't send for anyone.", a: 'sit_bench', next: 'n2' },
      n2: { s: V, t: 'Someone did.', next: 'n3' },
      n3: { s: 'bogdan', t: 'Then someone can pay you.', wait: 1.2, next: 'n4' },
      n4: { s: 'bogdan', t: "We went into the winter with ninety sacks of rye. There's forty-one. There's a hundred and eighty-six of us. You can do sums.", next: 'n5' },
      n5: { s: 'bogdan', t: "Tomorrow night we do the rite, and that's the end of it.", next: 'n6' },
      n6: { s: V, t: 'And the girl?', next: 'n7' },
      n7: { s: 'bogdan', t: "You've been talking to people.", wait: 0.8, next: 'n8' },
      n8: { s: 'bogdan', t: "The pass will take one rider, if she's careful.", next: 'offer' },
      offer: {
        choices: [
          { t: 'All right.', next: 'took', do: (S) => { S.set('took_reeve_money'); S.give('coins', 100); } },
          { t: 'Keep it.', next: 'left', do: (S) => S.set('refused_reeve_money') },
        ],
      },
      took: { s: 'bogdan', t: 'Good.', next: 'out' },
      left: { s: 'bogdan', t: 'Then you are a fool, or you are being paid by someone else.', next: 'out' },
      out: { s: 'bogdan', t: 'And stay off the lake. People go through it.', end: true, do: (S) => S.set('met_bogdan') },
    },
  },

  bogdan_later: {
    id: 'bogdan_later', cast: ['bogdan'], start: 'n1',
    nodes: {
      n1: { s: 'bogdan', t: 'What is it now?', next: 'hub' },
      hub: {
        choices: [
          { t: 'About the rite three years ago.', if: (S) => !!S.flag('echo_seen') && !S.flag('reeve_told'), next: 'r1' },
          { t: 'Nothing.', next: 'bye', exit: true },
        ],
      },
      r1: { s: V, t: "Wiesia didn't just fall in. Her mother saw her in the water, and everyone kept walking.", next: 'r2' },
      r2: { s: 'bogdan', t: 'Who told you that?', next: 'r3' },
      r3: { s: V, t: "I was in your cellar. You've been giving your own ration to the Nowak children.", if: (S) => !!S.flag('ledger_found'), else: 'noledger', next: 'r4' },
      r4: { s: 'bogdan', t: "Ola's eleven.", wait: 2.0, do: (S) => S.set('reeve_told'), end: true },
      noledger: { s: 'bogdan', t: 'Get out of my house.', end: true },
      bye: { s: 'bogdan', t: 'Then shut the door.', end: true },
    },
  },

  hanka_first: {
    id: 'hanka_first', cast: ['hanka'], start: 'n1',
    nodes: {
      n1: { s: 'hanka', t: "I didn't think anyone would come.", a: 'mend_net', next: 'n2' },
      n2: { s: 'hanka', t: "They've picked Ola. My youngest. They say the goddess took one from this house, so she'll want the other. That's what they're saying.", next: 'n3' },
      n3: { s: 'hanka', t: "If whatever's out there is dead before tomorrow night, they'll have no reason.", next: 'n4' },
      n4: { s: 'hanka', t: 'Sixty-one grosze. And this.', do: (S) => { S.give('coins', 61); S.give('ring'); }, next: 'n5' },
      n5: { s: V, t: 'Keep the ring.', next: 'n6' },
      n6: { s: 'hanka', t: "Take it. It's what I've got.", end: true, do: (S) => { S.set('met_hanka'); S.set('hanka_hired'); } },
    },
  },

  hanka_confront: {
    id: 'hanka_confront', cast: ['hanka'], start: 'n1',
    nodes: {
      n1: { s: V, t: 'I was out at the poles last night.', next: 'n2' },
      n2: { s: V, t: 'I saw what happened. Three years ago.', wait: 1.4, next: 'n3' },
      n3: { s: V, t: 'You turned round.', cam: 'close', next: 'n4' },
      n4: { s: 'hanka', t: 'Everyone was singing.', wait: 2.0, next: 'n5' },
      n5: { s: 'hanka', t: 'Marta had my arm. I thought it was the torches. You look at torches and then you see things on the ice. Spots.', next: 'n6' },
      n6: { s: 'hanka', t: 'By the time I got back there was just slush.', next: 'n7' },
      n7: { s: 'hanka', t: "I take milk down every night. She liked it warm. I can't get it out there warm.", next: 'decide' },
      decide: {
        decisive: true, timer: 12, timeout: 'late',
        choices: [
          { t: "Ola's still here. She needs you tonight.", next: 'c1', do: (S) => S.set('hanka_comforted') },
          { t: 'You saw her, and you kept walking.', next: 'b1', do: (S) => S.set('hanka_blamed') },
        ],
      },
      c1: { s: 'hanka', t: 'Yes.', wait: 2.0, next: 'fin' },
      b1: { s: 'hanka', t: 'Yes.', wait: 1.2, next: 'fin' },
      late: { s: 'hanka', t: 'Go on. Say it.', wait: 2.0, do: (S) => S.set('hanka_blamed'), next: 'fin' },
      fin: { s: 'hanka', t: "I'll be on the ice tonight. Whatever you do.", end: true, do: (S) => S.set('hanka_confronted') },
    },
  },

  hanka_day2: {
    id: 'hanka_day2', cast: ['hanka'], start: 'n1',
    nodes: {
      n1: { s: 'hanka', t: 'The dress is nearly done.', a: 'mend_net', next: 'n2' },
      n2: { s: 'hanka', t: "I'll be on the ice tonight.", end: true },
    },
  },

  dobra_rite: {
    id: 'dobra_rite', cast: ['dobra'], start: 'n1',
    nodes: {
      n1: { s: 'dobra', t: "Mind your feet, that's tonight's.", a: 'mend_net', next: 'n2' },
      n2: { s: 'dobra', t: 'Every year I make her and every year they drown her. My mother made them before me.', next: 'n3' },
      n3: { s: 'dobra', t: "You walk her out, you burn her, in she goes, you walk back singing. You don't turn round. That's all there is to it.", next: 'hub' },
      hub: {
        choices: [
          { t: 'What is on the island?', next: 'i1', once: true },
          { t: 'Did you know Wiesia?', next: 'w1', once: true },
          { t: 'That is all.', next: 'knot', exit: true },
        ],
      },
      i1: { s: 'dobra', t: "There's old stones out on the island with pictures cut in them. My grandmother used to say it was real girls once, before the straw. I don't know. She said a lot of things.", next: 'i2' },
      i2: { s: 'dobra', t: "Bogdan's been out to look at those stones. Twice this winter.", next: 'hub' },
      w1: { s: 'dobra', t: "She helped me one winter. Good hands. Tied a better knot than me by the end. Don't tell her mother I said that.", next: 'hub' },
      knot: { s: 'dobra', t: 'Where did you get that?', wait: 1.0, do: (S) => S.set('dobra_knot_noticed'), a: 'idle', next: 'k2' },
      k2: { s: V, t: "I've always had it.", next: 'k3' },
      k3: { s: 'dobra', t: 'Hm.', next: 'k4' },
      k4: { s: 'dobra', t: 'Do you sing, hunter?', wait: 2.0, next: 'k5' },
      k5: { s: V, t: 'No.', next: 'k6' },
      k6: { s: 'dobra', t: 'No.', end: true, do: (S) => S.set('met_dobra') },
    },
  },

  dobra_short: {
    id: 'dobra_short', cast: ['dobra'], start: 'n1',
    nodes: { n1: { s: 'dobra', t: 'Straw, straw, straw. If you are not going to help, move.', a: 'mend_net', end: true } },
  },

  jarek_bird: {
    id: 'jarek_bird', cast: ['jarek'], start: 'n1',
    nodes: {
      n1: { s: 'jarek', t: "You're going out there. To her.", next: 'n2' },
      n2: { s: 'jarek', t: 'I made this. For the rite. For after. I was going to give it to her after.', next: 'n3' },
      n3: { s: 'jarek', t: 'I was drunk. I was drunk the night they cut the hole. Maybe I cut it in the wrong place. Maybe the ice was thin because of me.', next: 'warm' },
      warm: { s: V, t: "It wasn't you. Warm water comes up under the poles.", if: (S) => !!S.flag('miller_warm_water'), else: 'n4', wait: 0.6, next: 'n4' },
      n4: { s: 'jarek', t: 'Give it to her. Please.', end: true, do: (S) => { S.set('jarek_met'); S.set('bird_taken'); S.give('bird'); } },
    },
  },

  jarek_after: {
    id: 'jarek_after', cast: ['jarek'], start: 'n1',
    nodes: { n1: { s: 'jarek', t: 'Thank you.', a: 'mend_net', end: true } },
  },

  ola_day1: {
    id: 'ola_day1', cast: ['ola'], start: 'n1',
    nodes: {
      n1: { s: 'ola', t: 'Are you going to kill the ice lady?', next: 'n2' },
      n2: { s: V, t: 'Is there one?', next: 'n3' },
      n3: { s: 'ola', t: "Everyone says. Mama says there isn't. Mama doesn't say it very loud.", end: true },
    },
  },

  ola_snowfight_after: {
    id: 'ola_snowfight_after', cast: ['ola'], start: 'n1',
    nodes: {
      n1: { s: 'ola', t: "Mama's sewing my dress. It's very white.", a: 'sit_ground', wait: 1.0, next: 'n2' },
      n2: { s: 'ola', t: 'Does it hurt? Drowning?', wait: 1.4, next: 'ask' },
      ask: {
        choices: [
          { t: "For a bit. Then it doesn't.", next: 'truth', do: (S) => S.set('ola_truth') },
          { t: "It won't happen.", next: 'lie', do: (S) => S.set('ola_lie') },
        ],
      },
      truth: { s: 'ola', t: 'I thought so.', end: true },
      lie: { s: 'ola', t: 'Okay.', wait: 1.0, end: true },
    },
  },

  miller: {
    id: 'miller', cast: ['miller'], start: 'n1',
    nodes: {
      n1: { s: 'miller', t: 'Wolves took my dog and near took my boy. I pay what I have.', if: (S) => !S.flag('wolves_mill_done'), else: 'n2', end: true },
      n2: { s: 'miller', t: 'You went up there? Alone?', next: 'n3' },
      n3: { s: 'miller', t: "My father never let anyone fish near the poles. Warm water comes up there. The ice is never as thick as it looks.", do: (S) => { S.set('miller_warm_water'); S.give('coins', 40); }, end: true },
    },
  },

  miller_wife: {
    id: 'miller_wife', cast: ['miller_wife'], start: 'n1',
    nodes: { n1: { s: 'miller_wife', t: 'Wipe your boots. I only just swept.', end: true } },
  },
};

// ---- cutscenes -----------------------------------------------------------------------------------
// Each is an inline director script (see Cutscene.js). `C` is the controller context.
export function makeCutsceneStubs(C) {
  const { G } = C;
  const pp = () => C.ppos();
  // A camera that looks at Vesna from behind and above, for scenes that have no staging of their own.
  const frame = (d, back = 4.5, up = 2.0, fov = 44) => {
    const p = pp();
    const yaw = G.player?.yaw ?? 0;
    const cx = p.x - Math.sin(yaw) * back + Math.cos(yaw) * 1.2, cz = p.z - Math.cos(yaw) * back - Math.sin(yaw) * 1.2;
    d.cut({ pos: d.ground(cx, cz, up), look: d.ground(p.x, p.z, 1.3), fov });
  };

  return {
    async c2_valley(d) {
      d.setup({ time: 15.67, weather: 'clear', music: 'reveal' });
      d.player();
      frame(d, 5, 2.4);
      d.fade(0, 1.0);
      const p = pp();
      await d.shot({ to: d.ground(p.x + 2, p.z - 3, 9), look: d.ground(p.x, p.z, 1.4), lookTo: d.ground(40, -120, 20), fov: 50, dur: 5, ease: 'inOut' });
      await d.titleCard('MARZENA', 'A tale of the long winter', 3.5);
      await d.fade(1, 1);
      d.flag('prologue_done');
      d.end({ fadeIn: 1.4 });
    },

    async c3_song(d) {
      d.setup({ time: 16.5, weather: 'clear', music: 'village' });
      const v = d.player();
      const ola = d.actor('ola', { preset: 'ola' });
      const yard = C.V.workshopYard;
      if (yard) {
        d.place(v, yard.x + 3.2, yard.z - 2.5, C.yawTo(yard.x + 3.2, yard.z - 2.5, yard.x, yard.z));
        d.place(ola, yard.x + 0.3, yard.z + 0.2, C.yawTo(yard.x, yard.z, yard.x + 3.2, yard.z - 2.5));
      }
      d.fade(0, 0.8);
      d.cut(d.two(v, ola, { wide: false }));
      await d.say(ola, 'Are you a witch?');
      await d.say(v, 'No.');
      await d.say(ola, 'Mama says mutants eat snow.');
      await d.say(v, 'Does she.');
      await d.say(ola, "And that you've got cat's eyes.");
      d.cut(d.close(ola, v));
      await d.say(ola, "They're just yellow.");
      await d.say(ola, 'Are you here for the ice lady?');
      await d.say(v, "Who's the ice lady?");
      await d.wait(0.6);
      d.flag('song_heard');
      d.flag('met_ola');
      d.end({ fadeIn: 0.8 });
    },

    async c4_echo(d) {
      d.setup({ music: 'sorrow' });
      d.player();
      frame(d, 4, 1.8, 40);
      if (G.postfx) G.postfx.echo = 1;
      await d.wait(1.0);
      await d.sub('Ghost shapes on the ice. Women in white, a girl with the straw figure, a crack.', 3.4, { italic: true });
      await d.sub('One woman turns her head. Then turns forward again.', 3, { italic: true });
      if (G.postfx) G.postfx.echo = 0;
      d.flag('echo_seen');
      d.end({ fadeIn: 0.8 });
    },

    async c5_lair(d) {
      d.setup({ music: 'night' });
      d.player();
      frame(d, 3.5, 1.9, 42);
      await d.wait(0.8);
      await d.sub('Seventeen straw figures sit round a table of ice planks. A tin music box. A red ribbon on the bell rope.', 4);
      await d.say('wiesia', 'Did Mama send you?', 3, { italic: true });
      await d.wait(0.8);
      d.flag('lair_seen');
      d.flag('wiesia_spoke');
      d.end({ fadeIn: 0.8 });
    },

    async dawn(d) {
      d.setup({ music: 'village' });
      d.fade(1, 1.6);
      await d.wait(1.6);
      d.time(7.5, { day: 2 });
      d.weather('fog', 0);
      const huts = C.V.boardwalk?.[24];
      const x = huts ? huts.x : 0, z = huts ? huts.z + 1 : 51.5;
      d.place(d.player(), x, z, 0);
      await d.titleCard('Dawn.', 'Marzena', 3);
      d.flag('dawn_done');
      d.end({ player: { x, z, yaw: 0 }, fadeIn: 1.6, weatherAuto: false });
    },

    async c6_procession(d) {
      d.setup({ time: 20.1, weather: 'snow', music: 'procession' });
      d.player();
      const R = C.L.ritual;
      frame(d, 6, 2.6, 46);
      d.fade(0, 0.8);
      await d.sub('Torches come down from the village onto the ice. The women are singing.', 3.4);
      if (R?.hole?.open) R.hole.open();
      await d.say('bogdan', 'Stay out of this, hunter.', 2.6);
      await d.sub('The bell, under the ice. Everyone stops singing.', 3);
      d.weather('blizzard', 8);
      d.flag('rite_started');
      d.end({ fadeIn: 0.6 });
    },

    async c7_emergence(d) {
      d.setup({ music: 'tense' });
      d.player();
      const R = C.L.ritual;
      frame(d, 7, 3, 50);
      R?.hole?.open?.();
      const boss = G.creatures?.spawnBoss?.(R.hole.x, R.hole.z, { emerge: true, passive: true });
      await d.wait(1.0);
      if (boss?.emerged) await Promise.race([boss.emerged, d.wait(12)]);
      await d.say('wiesia', "Don't go. Don't go. Don't go.", 3.4, { italic: true });
      d.flag('boss_started');
      d.end({ fadeIn: 0.4 });
    },

    async ending_thaw(d) {
      d.setup({ music: 'thaw' });
      d.player();
      frame(d, 6, 2.6, 46);
      await d.sub('The silver goes in. Wiesia comes apart into snow on the wind. The ice breaks outward in a ring.', 4.4);
      await Promise.all([d.uniform('uSnowCover', 0, 6), d.uniform('uSpring', 1, 8)]);
      G.water?.setThaw?.(1);
      d.weather('clear', 2);
      await d.sub('The village cheers, and then it stops cheering. Nobody comes near her.', 4);
      d.flag('ending', 'thaw');
      d.end({ fadeIn: 1.0 });
    },

    async ending_looking_back(d) {
      d.setup({ music: 'thaw' });
      d.player();
      frame(d, 6, 2.6, 46);
      await d.say(V, 'Hanka.', 1.6);
      await d.say('hanka', "Wiesiu. Wiesiu, I'm here. I'm sorry. I'm here.", 4);
      await Promise.all([d.uniform('uSnowCover', 0, 9), d.uniform('uSpring', 1, 12)]);
      G.water?.setThaw?.(1);
      d.weather('clear', 2);
      d.flag('ending', 'looking_back');
      d.end({ fadeIn: 1.0 });
    },

    async ending_nothing_changes(d) {
      d.setup({ music: 'sorrow' });
      d.player();
      frame(d, 6, 2.6, 46);
      await d.sub('Vesna steps back out of the torchlight. The song starts again.', 4);
      await d.sub('They turn their backs and walk away singing. Nobody looks back. The snow keeps falling.', 4.4);
      d.flag('ending', 'nothing_changes');
      d.end({ fadeIn: 1.0 });
    },

    async epilogue_knot(d) {
      d.setup({ time: 8, day: 3, weather: C.flag('ending') === 'nothing_changes' ? 'snow' : 'clear', music: 'lullaby' });
      d.player();
      frame(d, 5, 2.2, 44);
      d.fade(0, 1.2);
      await d.say('dobra', 'Wait. Wait, I am old.', 3);
      await d.say('dobra', "I tie it the same way every time. I can't do it any other way.", 4);
      d.give('straw_doll');
      await d.fade(1, 1.2);
      d.end({ fadeIn: 1.0 });
    },
  };
}
