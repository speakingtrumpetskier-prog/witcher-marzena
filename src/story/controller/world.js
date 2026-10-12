// The world around the story: when and where she can rest, the weather by story beat, the gear her
// finds change, doors that are shut at night, and the small reactions that make the village feel like it
// knows what is happening (the tavern emptier after the echo, villagers drifting to the shore before the
// rite, Vesna's rare asides).
//
//   C.rest(label)       rest at a bed, the banya or a fire; the plan depends on where the story is
//   C.restPlan()        { opts: [{ label, to }] } or { msg }
// Resting rules (docs/STORY.md section 2): in the prologue (day 0) the watchtower hearth is the shelter for the
// night (act1.js) and nowhere else rests; day 1 before the contract she can sit out to evening; once
// Hanka has hired her, rest runs to nightfall (21:00); during the night on the ice nobody sleeps;
// the morning after, rest runs to the evening of the rite.

export function install(C) {
  clockAndWeather(C);
  resting(C);
  gear(C);
  locks(C);
  ambient(C);
  asides(C);
  sky(C);
  endingWorld(C);
}

// ---- clock and weather -----------------------------------------------------------------------
function clockAndWeather(C) {
  const { G } = C;

  // Night 1 is set by Flow when the clock is past 20:00 with the contract taken; make it also fire
  // the moment she is hired after that hour.
  C.watch('hanka_hired', () => {
    const h = C.hour();
    if (!C.has('night1') && (h >= 20 || h < 6)) C.set('night1');
  });

  // The clock waits at three moments so the story cannot be left behind by the day: the first evening
  // stops at 21:30 until Hanka has hired her (she is up until 22:00 and asleep after, and the rite is
  // "tomorrow night" whatever the player does with the day); the night on the ice lasts until the tower
  // is done; and the evening of the rite waits for her talks with Dobra and Hanka.
  const said = new Set();
  const hold = (at, key, text) => {
    G.time.hours = at;
    if (!said.has(key)) { said.add(key); C.notify(text, 'info'); }
  };
  G.addSystem('ctl-clock-hold', () => {
    if (!C.has('prologue_done')) return;
    const d = C.day(), h = C.hour();
    if (d === 1 && !C.has('hanka_hired') && h >= 21.5 && h < 22.5) hold(21.5, 'hanka', 'Hanka is still up.');
    else if (d === 2 && C.has('night1') && !C.has('dawn_done') && h >= 5.5 && h < 6.5) hold(5.5, 'night', 'Still dark.');
    else if (d === 2 && C.has('dawn_done') && C.active('main_hanka') && C.stage('main_hanka') !== 'wait' && h >= 19.4 && h < 20.4) hold(19.4, 'rite', 'The rite is tonight.');
  }, -80);

  const weatherFor = () => {
    if (C.has('ending')) return C.flag('ending') === 'nothing_changes' ? 'snow' : 'clear';
    if (C.has('rite_started')) return null; // the finale scenes own the weather
    if (C.has('dawn_done')) {
      const h = C.hour();
      if (C.day() >= 2 && h >= 7) return h < 10 ? 'fog' : h < 17.5 ? 'overcast' : 'snow';
      return null;
    }
    if (C.has('prologue_done')) return 'clear';
    return null;
  };
  const apply = () => {
    if (C.busy() || !G.weather) return;
    const w = weatherFor();
    if (w && G.weather.state !== w) G.weather.set(w, 45);
  };
  C.on('time:hour', apply);
  C.on('rest', apply);
  C.on('loaded', () => C.later(0.5, apply));
  C.watch('dawn_done', () => C.later(2, apply));
}

// ---- resting ---------------------------------------------------------------------------------------
function resting(C) {
  const { G } = C;

  C.restPlan = () => {
    const h = C.hour(), d = C.day();
    if (C.has('rite_started') || C.has('ending')) return { msg: 'Not now.' };
    if (!C.has('hanka_hired')) {
      return d === 1 && h < 19 ? { opts: [{ label: 'Rest until evening', to: 19.5 }] } : { msg: 'Not tired.' };
    }
    if (!C.has('night1')) return h < 21 ? { opts: [{ label: 'Rest until nightfall', to: 21 }] } : { msg: 'Not now.' };
    if (!C.has('dawn_done')) return { msg: 'Not with that out there.' };
    if (h < 19.5) return { opts: [{ label: 'Rest until evening', to: 19.5 }] };
    return { msg: 'Not now.' };
  };

  C.rest = async () => {
    if (G.story.busy) return false;
    const plan = C.restPlan();
    if (!plan.opts) { C.notify(plan.msg, 'info'); return false; }
    let i = 0;
    if (G.dialogue?.autopick == null) {
      i = await C.ui().choices([...plan.opts.map((o) => ({ text: o.label, t: o.label })), { text: 'Not now', t: 'Not now' }], {});
    }
    if (i == null || i < 0 || i >= plan.opts.length) return false;
    return G.story.rest(plan.opts[i].to);
  };

  const spot = (id, pos, label, verb = 'Rest', radius = 2.2, enabled) => {
    if (!pos) return;
    C.interact({ id, pos, radius, verb, label, enabled, onUse: () => C.rest() });
  };
  spot('bed_tavern', C.V.tavernBed, 'Bed');
  spot('banya', C.V.buildings?.banya?.p?.anchors?.hearth, 'Banya', 'Rest', 3.2);
  const fires = [
    ['fire_watchtower', C.L.watchtower?.campfire, 'Fire'],
    ['fire_cabin', C.L.hunterCabin?.fire, 'Fire'],
    ['fire_charcoal', C.L.charcoal?.fire, 'Fire'],
    ['fire_mill', C.L.mill?.brazier, 'Brazier'],
  ];
  // In the prologue the watchtower hearth is where she shelters for the night (act1.js), not a rest spot.
  const prologue = () => !C.has('prologue_done') && C.active('main_pass');
  for (const [id, pos, label] of fires) spot(id, pos, label, 'Rest', 2.8, id === 'fire_watchtower' ? () => !prologue() : undefined);
}

// ---- gear her finds change ----------------------------------------------------------------------
function gear(C) {
  const { G } = C;
  const apply = () => {
    const P = G.player;
    if (!P) return;
    if (C.has('wit_sword')) {
      P.damageMult = Math.max(P.damageMult || 1, 1.35);
      if (P.character) P.character.swordKind = 'silver';
    }
    if (C.has('island_power')) P.signPower = Math.max(P.signPower || 1, 1.5);
  };
  C.restore(apply);
  C.watch('wit_sword', apply);
  C.watch('island_power', apply);
}

// ---- doors that are shut at night --------------------------------------------------------------
function locks(C) {
  const { G } = C;
  const DOORS = [
    { id: 'longhouse:front', from: 23, to: 6.5, who: 'Bogdan', line: 'Not tonight.' },
    { id: 'longhouse:back', from: 23, to: 6.5, who: 'Bogdan', line: 'Not tonight.' },
    { id: 'hanka:front', from: 22, to: 6, who: 'Hanka', line: 'Not now.' },
  ];
  const inWindow = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
  // She is inside this house (an interior within a few metres of its door): the door never bolts on her, and a bolt
  // set while she was in there comes off so she can walk out. The lock only ever keeps her out.
  const insideNear = (st) => {
    const p = C.ppos();
    return !!G.world?.indoors?.(p.x, p.z) && Math.hypot(p.x - st.rec.x, p.z - st.rec.z) < 16;
  };
  const state = new Map();
  for (const lk of DOORS) {
    const rec = C.V.doors?.find((d) => d.id === lk.id)?.rec;
    if (!rec) continue;
    const st = { box: null, rec, lk };
    state.set(lk.id, st);
    C.interact({
      id: `knock_${lk.id}`, pos: C.v3(rec.x, (rec.y ?? 0) + 1.2, rec.z), radius: 1.9, verb: 'Knock', label: 'Door',
      enabled: () => st.box != null && !insideNear(st),
      onUse: async () => {
        C.sfx('door_close', { volume: 0.7 });
        await C.sleep(0.9);
        C.say(lk.line, 2.2, lk.who);
      },
    });
  }
  let t = 0;
  G.addSystem('ctl-locks', (dt) => {
    t -= dt;
    if (t > 0) return;
    t = 1;
    const h = C.hour();
    const p = C.ppos();
    for (const st of state.values()) {
      const want = inWindow(h, st.lk.from, st.lk.to) && !C.has('rite_started') && !insideNear(st);
      if (want && !st.box && Math.hypot(p.x - st.rec.x, p.z - st.rec.z) > 2.2 && G.physics) {
        st.box = G.physics.addBox(st.rec.x, st.rec.z, (st.rec.w || 1.2) / 2 + 0.25, 0.35, st.rec.yaw || 0, { y0: (st.rec.y ?? 0) - 0.5, y1: (st.rec.y ?? 0) + 3, tag: 'ctl-lock' });
      } else if (!want && st.box) {
        G.physics.remove(st.box);
        st.box = null;
      }
    }
  }, 20);
}

// ---- the village reacts ----------------------------------------------------------------------------------
function ambient(C) {
  const { G } = C;

  // After the echo the tavern is emptier: patrons go home instead of to their seats.
  let emptied = false;
  const emptyTavern = () => {
    if (!G.npcs || !C.has('echo_seen')) return;
    for (const n of G.npcs.list) {
      const sch = n.def.schedule;
      if (!sch || n.def.named) continue;
      let changed = false;
      for (let i = 0; i < sch.length; i++) {
        const e = sch[i], next = sch[(i + 1) % sch.length];
        if (typeof e.at === 'string' && /^tavern_(table|bench|corner)/.test(e.at) && next && next.at !== e.at) {
          e.at = next.at;
          e.hidden = next.hidden;
          changed = true;
        }
      }
      if (changed) n.sys.requestResync(n);
    }
    emptied = true;
  };
  C.watch('echo_seen', emptyTavern);
  C.restore(() => { if (C.has('echo_seen') && !emptied) emptyTavern(); });

  // The evening of the rite: villagers drift down to the shore with the dusk.
  let gathered = [];
  const gatherPoints = [[-6, 62], [-2, 63], [3, 63], [8, 62], [13, 63], [-8, 66], [0, 67], [10, 67], [-4, 70], [6, 71]];
  function gather() {
    if (gathered.length || !G.npcs) return;
    const pool = G.npcs.list.filter((n) => !n.def.named && !n.def.child && n.id.startsWith('villager'));
    pool.sort((a, b) => Math.hypot(a.position.x, a.position.z - 100) - Math.hypot(b.position.x, b.position.z - 100));
    gathered = pool.slice(0, gatherPoints.length);
    gathered.forEach((n, i) => {
      const [x, z] = gatherPoints[i];
      n.goTo({ x, z, yaw: 3.14, anim: i % 3 === 0 ? 'cross_arms' : 'idle' });
    });
  }
  function disperse() {
    for (const n of gathered) n.release();
    gathered = [];
  }
  C.gathered = () => gathered.length;
  let gt = 0;
  G.addSystem('ctl-gather', (dt) => {
    gt += dt;
    if (gt < 2) return;
    gt = 0;
    const want = C.has('dawn_done') && C.day() >= 2 && C.hour() >= 19 && !C.has('rite_started') && !C.has('ending');
    if (want && !gathered.length) gather();
    else if (!want && gathered.length) disperse();
  }, 20);

  // Doors closed on the road: the gate guard and the dogs stay as they are; only barks change.
  // Day 2 talk before the rite is handled by the NPC bark pools (src/gameplay/npcs/barks.js, flag lair_seen).
}

// ---- Vesna's rare asides ------------------------------------------------------------------------------
function asides(C) {
  const { G } = C;
  const last = {};
  const say = (key, text, gap) => {
    const now = G.clock.elapsed;
    if (now - (last[key] ?? -1e9) < gap || C.busy()) return;
    last[key] = now;
    C.say(text, 2.4);
  };
  C.on('horse:refuse', () => say('ice', 'Kasza. Don\'t.', 90));
  let t = 0;
  const seen = new Set();
  G.addSystem('ctl-asides', (dt) => {
    t += dt;
    if (t < 1.5) return;
    t = 0;
    const P = G.player;
    if (!P || C.busy() || G.input?.context !== 'game') return;
    if (P.warmth != null && P.warmth < 0.28) say('cold', 'Need a fire.', 140);
    if (P.mounted && G.horse) {
      const yaw = P.yaw, x = P.position.x, z = P.position.z;
      const up = C.ground(x + Math.sin(yaw) * 12, z + Math.cos(yaw) * 12) - C.ground(x, z);
      if (up > 3.2 && (G.horse.speed || 0) > 2) say('uphill', 'Come on, girl.', 160);
    }
    const corpses = [...(C.L.vignettes?.carcasses || []), C.L.crossroads?.hanged?.feet, C.L.marsh?.smuggler?.pos].filter(Boolean);
    for (const [i, c] of corpses.entries()) {
      if (!seen.has(i) && Math.hypot(c.x - P.position.x, c.z - P.position.z) < 4.5) { seen.add(i); say('corpse', 'Not long ago.', 20); }
    }
  }, 20);

  // Tracks the roadside stories leave behind show up for the hunter's senses.
  for (const tr of C.L.vignettes?.tracks || []) {
    if (tr?.points?.length > 1) C.trail({ id: `vig_${tr.id}`, kind: tr.kind || 'footprints', points: tr.points });
  }
}

// ---- the sky: what she has watched the herders do ------------------------------------------------------------
// Sets the flags the bestiary unlocks its observations on (src/ui/content.js): planetnicy_night (looked at them
// lit, after dark), planetnicy_sparks (a crowd of the small ones), planetnicy_low (one hanging low over the ice),
// matka_seen (looked at Matka Chmur for a while) and matka_pulse (watched her swell). planetnicy_seen itself is
// set by the spirits system. Everything reads G.spirits, so a run without it (?spirits=0, the logic playthrough)
// simply never sets them.
function sky(C) {
  const { G } = C;
  const dir = new C.THREE.Vector3();
  const to = new C.THREE.Vector3();
  const acc = { night: 0, sparks: 0, low: 0, matka: 0, pulse: 0 };
  const bump = (key, on, step, need, flag) => {
    acc[key] = on ? acc[key] + step : Math.max(0, acc[key] - step * 0.5);
    if (acc[key] >= need && !C.has(flag)) C.set(flag);
  };
  let t = 0;
  G.addSystem('ctl-sky', (dt) => {
    t += dt;
    if (t < 0.5) return;
    const step = t;
    t = 0;
    const SP = G.spirits;
    if (!SP || G.shot || !G.player || C.busy() || G.input?.context !== 'game') return;
    const cam = G.camera;
    if (G.world?.indoors?.(cam.position.x, cam.position.z)) return;
    const wx = G.weather?.params;
    const clearish = G.weather?.state !== 'fog' && G.weather?.state !== 'blizzard' && (wx?.snowfall ?? 0) < 0.55;
    const night = (G.uniforms?.uNight?.value ?? 0) > 0.6;
    cam.getWorldDirection(dir);
    const look = (x, y, z) => {
      to.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
      const d = to.length() || 1;
      return { d, dot: dir.dot(to.divideScalar(d)) };
    };

    let lit = false, crowd = false, low = false;
    // (Test stand-ins for G.spirits carry only what their step needs, so near() may be missing.)
    if (clearish && typeof SP.near === 'function') {
      for (const s of SP.near(cam.position.x, cam.position.z, 180)) {
        const l = look(s.x, s.y, s.z);
        if (l.d > 200 || l.dot < 0.7) continue;
        if (night) lit = true;
        if (s.school && l.d < 130 && l.dot > 0.8) crowd = true;
        if (night && s.y < 25 && l.d < 100 && l.dot > 0.6) low = true;
      }
    }
    bump('night', lit, step, 4, 'planetnicy_night');
    bump('sparks', crowd, step, 3, 'planetnicy_sparks');
    bump('low', low, step, 3, 'planetnicy_low');

    const big = SP.cathedral;
    let seeing = false, swelling = false;
    if (big && clearish) {
      const l = look(big.x, big.y, big.z);
      seeing = l.dot > 0.85;
      swelling = seeing && big.pulse > 0.6;
    }
    bump('matka', seeing, step, 6, 'matka_seen');
    bump('pulse', swelling, step, 2.5, 'matka_pulse');
  }, 20);

  // Her one remark, the first time she has really looked at the big one.
  C.watch('matka_seen', (v) => {
    if (v && G.spirits) C.later(1.5, () => { if (!C.busy()) C.say("That's a long way up.", 2.6); });
  });
}

// ---- the world after an ending, when a save is loaded -------------------------------------------------------
function endingWorld(C) {
  const { G } = C;
  const apply = () => {
    const e = C.flag('ending');
    if (e !== 'thaw' && e !== 'looking_back') return;
    if (C.running.size) return;
    G.uniforms.uSnowCover.value = 0;
    G.uniforms.uSpring.value = 1;
    G.water?.setThaw?.(1);
    G.weather?.set?.('clear', 0);
  };
  C.on('loaded', () => C.later(0.3, apply));
}
