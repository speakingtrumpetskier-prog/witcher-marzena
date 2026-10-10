// Who says what: every named NPC's Talk interaction runs the dialogue that fits the flags and the
// day right now (first meeting, hub, later, short), then makes sure the flags and items the
// conversation owes the quests are in place even if the written scene left one out.
//
// NPC ids: zbyszek, bogdan, hanka, dobra, jarek, ola, miller, miller_wife (src/gameplay/npcs/cast.js).
// Scenes that stage an NPC pause it and release it themselves (Actors.js); nothing here has to.

export function install(C) {
  const { G } = C;

  // Has Bogdan something to say about fish right now (bogdan_fish.js)? She has fish to sell, she has landed the old pike, she
  // was turned away from a hole for want of a rod, or she has fished and not yet heard about the pike by the tower.
  const fishTalk = () => {
    const F = G.fishing;
    if (!F || !G.dialogue?.has?.('bogdan_fish')) return false;
    return (C.has('oldone_landed') && !C.has('oldone_paid')) || !!F.canSell?.() || (C.has('fish_wants_rod') && !C.count('rod')) || (C.has('fished') && !C.has('oldone_heard'));
  };

  const handlers = {
    // The Drowned Bell: one hub. Shop and gossip live in the scene; G.storyCtl.buy is there for its `do`.
    async zbyszek() {
      const r = await C.talk('zbyszek_hub');
      C.set('met_zbyszek');
      // "Is there a bed?" ends on rest_dusk; resting waits until the dialogue has closed.
      if (r?.end === 'rest_dusk') await C.rest();
    },

    async bogdan() {
      if (!C.has('met_bogdan')) {
        const coins = C.count('coins');
        await C.talk('bogdan_first');
        C.set('met_bogdan');
        if (!C.has('took_reeve_money') && !C.has('refused_reeve_money')) C.set('refused_reeve_money');
        if (C.has('took_reeve_money')) C.ensureGain('coins', coins, 100);
      } else {
        // Fish first, when there is something to say about fish (bogdan_fish.js); "Something else" ends at 'regular'.
        if (fishTalk()) {
          const r = await C.talk('bogdan_fish');
          if (C.has('oldone_asked') && !G.quests.rec('side_oldone')) G.quests.start('side_oldone');
          if (r?.end !== 'regular') return;
        }
        if (C.has('echo_seen') && !C.has('reeve_told')) await C.talk('bogdan_later');
        else await C.talk(G.dialogue?.has?.('bogdan_day2') ? 'bogdan_day2' : 'bogdan_later');
      }
    },

    async hanka(npc) {
      if (!C.has('hanka_hired')) {
        const coins = C.count('coins'), ring = C.count('ring');
        await C.talk('hanka_first');
        C.set('met_hanka');
        C.set('hanka_hired');
        C.ensureGain('coins', coins, 61);
        C.ensureGain('ring', ring, 1);
        return;
      }
      if (C.day() >= 2 && C.has('echo_seen') && !C.has('hanka_confronted')) {
        await C.talk('hanka_confront');
        // The decisive talk always lands on one side; running out the timer counts as blame.
        if (!C.has('hanka_comforted') && !C.has('hanka_blamed')) C.set('hanka_blamed');
        C.set('hanka_confronted');
        return;
      }
      if (C.has('hanka_confronted')) { await C.talk('hanka_day2'); return; }
      npc.bark(C.day() >= 2 ? 'The dress is nearly done.' : 'Before tomorrow night. Please.');
    },

    async dobra() {
      if (!C.has('met_dobra') && (C.has('lair_seen') || C.day() >= 2)) {
        await C.talk('dobra_rite');
        C.set('met_dobra');
        return;
      }
      await C.talk('dobra_short');
    },

    async jarek(npc) {
      if (C.has('bird_given')) { await C.talk('jarek_after'); return; }
      if (C.has('jarek_met')) { npc.bark('Give it to her. Please.'); return; }
      const bird = C.count('bird');
      await C.talk('jarek_bird');
      C.set('jarek_met');
      C.set('bird_taken');
      C.ensureGain('bird', bird, 1);
      if (!G.quests.rec('side_bird')) G.quests.start('side_bird');
    },

    async ola(npc) {
      if (!C.has('ola_chat') && C.day() === 1) {
        await C.talk('ola_day1');
        C.set('ola_chat');
        return;
      }
      npc.bark(["You're Marzanna!", 'Witch! Do your eyes glow?', 'If you look back she gets you!'][Math.floor(Math.random() * 3)]);
    },

    async miller() {
      const coins = C.count('coins'), had = C.has('miller_warm_water');
      if (!G.quests.rec('side_wolves')) G.quests.start('side_wolves');
      await C.talk('miller');
      // After the den, the miller's story about the warm water under the poles.
      if (C.has('wolves_mill_done') && !had) {
        C.set('miller_warm_water');
        C.ensureGain('coins', coins, 40);
      }
    },

    async miller_wife() {
      const coins = C.count('coins'), paid = C.has('handbell_paid');
      await C.talk('miller_wife');
      // The hand-bell (side.js): once she has agreed to look for it, it is in the book; she pays when it is rung.
      if (C.has('handbell_asked') && !G.quests.rec('side_handbell')) G.quests.start('side_handbell');
      if (C.has('handbell_paid') && !paid) C.ensureGain('coins', coins, 20);
    },
  };

  function assign() {
    for (const [id, fn] of Object.entries(handlers)) {
      const npc = G.npcs?.get?.(id);
      if (!npc || npc.ctlTalk) continue;
      npc.ctlTalk = true;
      npc.setTalk(async (n) => {
        C.foot();
        try { await fn(n); } catch (e) {
          console.error(`[story controller] talk ${id}`, e);
          G.errors.push(`ctl talk ${id}: ${e.message}`);
        }
      });
    }
  }
  assign();
  // The named cast exists from the start in a normal game, but a debug scene may populate later.
  C.on('npcs:populated', assign);
  C.on('game:ready', assign);

  // Zbyszek's shop (called from his dialogue): a Thaw draught for twelve grosze, a bowl of soup for two.
  C.buy = (what) => {
    const S = C.S;
    if (what === 'thaw') {
      if (S.count('thaw') >= 3 || !S.take('coins', 12)) return false;
      S.give('thaw');
      C.sfx('coin');
      return true;
    }
    if (what === 'soup') {
      if (!S.take('coins', 2)) return false;
      if (G.player && 'warmth' in G.player) G.player.warmth = Math.min(1, G.player.warmth + 0.5);
      C.sfx('potion_drink', { volume: 0.5 });
      C.notify('Fish soup', 'item');
      return true;
    }
    return false;
  };
}
