// Ice fishing (G.fishing): sit at a hole, lower the jig, strike at the bite, fight the fish against the tension of the line,
// land it, sell it to the reeve, roast it at a fire. The model is model.js (tested in Node), the sitting is session.js, the
// holes are world/locations/fishing.js, the sums of money and food are store.js and cook.js.
//
//   G.fishing.active / .phase / .catches        a session is running; its phase ('walk' 'sit' 'fish' 'fight' 'land' 'stand')
//   G.fishing.begin(spot | id, opts) -> Promise<{ reason, catches }>     sit down at a hole (interaction E at the stool)
//   G.fishing.abort(reason)                     stand up at once (a hit, a scene)
//   G.fishing.hasRod() / giveRod()              the rod is the item 'rod' (lent by the reeve, or found under the huts)
//   G.fishing.spots / spot(id)                  G.world.locations.fishing.spots
//   G.fishing.sellAll() -> { n, coins, items }  at the reeve's scales (Bogdan's dialogue calls it); .lastSale keeps the numbers
//   G.fishing.cook() / canCook()                roast the cheapest fish at the nearest fire
//   G.fishing.cutHole(spot) -> Promise          cut a hole at a thin spot with the sword
//   G.fishing.data / log / basket               the save data (G.state.data.fish)
//   G.fishing.env(spot)                         { hours, weather, herdersLow, night } as the bite model sees it
// Events: fishing:start { spot }, fishing:end { spot, reason, catches }, fishing:hooked, fishing:lost { how, special },
//   fish:caught { id, w, spot, special, first, record }, fish:sold { n, coins }, fish:cooked { id, w }, fish:cut { spot }
// Test hooks: G.fishing.test (see the bottom of this file) lands fish without playing the fight.
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';
import { rng, clamp } from '../../core/util.js';
import { SPECIES } from './species.js';
import { LINES, makeEnv, priceOf, cookValue, kg } from './model.js';
import { fishData, recordCatch, sellFish, cookable, takeFish } from './store.js';
import { fishList, spokenKg } from './words.js';
import { FishHud } from './hud.js';
import { FishView } from './view.js';
import { FishSession } from './session.js';
import { installCook } from './cook.js';
import { installCut } from './cut.js';

export async function init(G) {
  const S = G.state;
  const F = {
    G,
    session: null,
    rnd: rng((Date.now() ^ 0x5eed) >>> 0),
    testInput: null,
    lastSale: null,
    timers: [],
    clock: 0,
    hud: null,
    view: null,

    get active() { return !!this.session && !this.session.ended; },
    get phase() { return this.active ? this.session.phase : null; },
    get catches() { return this.session?.catches ?? 0; },
    get spots() { return G.world?.locations?.fishing?.spots || []; },
    get data() { return fishData(S); },
    get log() { return fishData(S).log; },
    get basket() { return fishData(S).basket; },

    spot(id) { return G.world?.locations?.fishing?.byId?.[id] || null; },
    hasRod() { return S.count('rod') > 0; },
    giveRod() { if (!this.hasRod()) S.give('rod', 1); },
    seed(n) { this.rnd = rng(n >>> 0); },

    // ---- the world around the hole ------------------------------------------------------------------------------------
    // The herders hanging low and many over the ice (a hard clear frost) make the fish bite; nobody says so. Without the sky
    // module a clear night stands in for it.
    herdersLow(spot) {
      const SP = G.spirits;
      const wx = G.weather?.state ?? 'clear';
      if (typeof SP?.near === 'function') {
        let n = 0;
        for (const s of SP.near(spot.hole.x, spot.hole.z, 170)) if (s.y < 40) n++;
        return clamp(n / 3);
      }
      const h = G.time?.hours ?? 12;
      return wx === 'clear' && (h >= 19 || h < 5.5) ? 0.5 : 0;
    },
    env(spot) {
      return makeEnv({ hours: G.time?.hours ?? 12, weather: G.weather?.state ?? 'clear', herdersLow: this.herdersLow(spot) });
    },
    lineFor(spot) { return spot.zone === 'tower' && S.count('strong_line') > 0 ? LINES.strong : LINES.normal; },
    // The old pike comes to the thin spot under the tower only once Bogdan has set Vesna on it, and only until it is landed.
    oldOneActive(spot) { return spot.id === 'tower' && !!S.flag('oldone_asked') && !S.flag('oldone_landed'); },
    oldOneWeight() { return Math.round((19 + this.rnd() * 5) * 100) / 100; },

    // ---- feedback ---------------------------------------------------------------------------------------------------------------
    sfx(name, o) { try { G.audio?.sfx?.(name, o); } catch { /* audio is optional */ } },
    rumble(strong, weak, ms) { try { G.input?.rumble?.(strong, weak, ms); } catch { /* optional */ } },
    say(text, secs = 2.4) { G.ui?.subtitle?.('Vesna', text, secs); },
    // A story-clock wait that follows the frame time (a promise that resolves after `seconds` of play).
    sleep(seconds) { return new Promise((resolve) => this.timers.push({ at: this.clock + seconds, resolve })); },

    // ---- catches ------------------------------------------------------------------------------------------------------------------
    caught(spot, L, r) {
      const sp = SPECIES[L.id];
      if (!S.flag('fished')) S.set('fished');
      G.events.emit('fish:caught', { id: L.id, w: L.w, spot: spot.id, special: !!L.special, first: r.first, record: r.record, name: sp.name });
      if (L.special) S.set('oldone_landed');
    },

    // ---- sitting down -----------------------------------------------------------------------------------------------------------
    begin(spotOrId, opts = {}) {
      const spot = typeof spotOrId === 'string' ? this.spot(spotOrId) : spotOrId;
      if (!spot || !spot.open || this.active) return Promise.resolve(null);
      if (!this.view) this.view = new FishView(G);
      const s = new FishSession(this, spot, opts);
      this.session = s;
      s.begin();
      return s.done;
    },

    abort(reason = 'interrupted', quick = false) {
      if (this.active) this.session.stand(reason, quick);
    },

    // ---- the reeve's scales ------------------------------------------------------------------------------------------------------
    sellAll(opts = {}) {
      const r = sellFish(S, opts);
      r.line = fishList(r.items, (id) => SPECIES[id].name.toLowerCase());
      this.lastSale = r;
      if (r.n) {
        this.sfx('coin');
        G.events.emit('fish:sold', { n: r.n, coins: r.coins });
      }
      return r;
    },
    // The old pike is not sold with the rest: Bogdan weighs it on its own and pays for it by the kilo.
    pikeWeight() { const d = fishData(S); return d.basket.find((e) => e.special)?.w ?? d.oldone?.w ?? 0; },
    pikeWeightText() { return `${spokenKg(this.pikeWeight())}.`; },
    payOldOne() {
      const d = fishData(S);
      const i = d.basket.findIndex((e) => e.special);
      if (i < 0) return null;
      const e = takeFish(S, i);
      const coins = priceOf('oldone', e.w);
      S.give('coins', coins);
      d.sold++;
      this.sfx('coin');
      this.lastSale = { n: 1, coins, items: [{ id: 'oldone', w: e.w, price: coins }], line: 'The old pike.' };
      G.events.emit('fish:sold', { n: 1, coins, special: true });
      return this.lastSale;
    },
    canSell() { return fishData(S).basket.some((e) => !e.special); },
    count() { return fishData(S).basket.length; },

    // ---- per frame ------------------------------------------------------------------------------------------------------------------
    update(dt) {
      this.clock += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].at <= this.clock) this.timers.splice(i, 1)[0].resolve();
      if (this.session) {
        this.session.update(dt);
        if (this.session.ended) this.session = null;
      }
    },
    late(dt) {
      this.hud?.update?.(dt);
      if (this.session && !this.session.ended) this.session.late(dt);
    },
  };
  G.fishing = F;

  F.hud = new FishHud(G);
  installCook(F);
  installCut(F);

  // The interaction at each stool.
  const addSpotInteractions = () => {
    for (const spot of F.spots) {
      const at = new THREE.Vector3();
      G.interact?.add({ // (a thin spot has no hole until it is cut: story/controller/side.js)
        id: `fish:${spot.id}`,
        pos: () => at.set(spot.seat.x, (G.world.heightAt(spot.seat.x, spot.seat.z) || 0) + 0.9, spot.seat.z),
        radius: 2.3,
        facing: false,
        verb: 'Fish',
        label: spot.name,
        enabled: () => spot.open && !F.active && !(G.water?.thaw > 0.35) && !G.world.thawed,
        onUse: async () => {
          if (!F.hasRod()) {
            S.set('fish_wants_rod');
            F.say('I would need a rod.', 2.2);
            return;
          }
          await F.begin(spot);
        },
      });
    }
  };
  addSpotInteractions();

  // a spare rod standing in the rest by the eastern hole on the shelf: left behind, and nobody has come back for it
  const rest = F.spot('shelf_east');
  if (rest) {
    const at = new THREE.Vector3();
    G.interact?.add({
      id: 'fish:take_rod',
      pos: () => at.set(rest.rest.x, (G.world.heightAt(rest.rest.x, rest.rest.z) || 0) + 0.9, rest.rest.z),
      radius: 1.9,
      facing: false,
      verb: 'Take',
      label: 'Rod in the rest',
      enabled: () => !F.hasRod() && !S.flag('rod_taken'),
      onUse: async () => {
        S.set('rod_taken');
        F.giveRod();
        F.sfx('item_pickup', { volume: 0.7 });
        G.ui?.notify?.('Ice rod', 'item');
        F.say('Left on its rest. Nobody is using it.', 3);
      },
    });
  }

  // ---- the session is over when something else needs her ------------------------------------------------------------------------
  const quit = (reason, quick) => () => F.abort(reason, quick);
  G.events.on('player:hit', quit('hit', false));
  G.events.on('player:death', quit('dead', true));
  G.events.on('combat:start', quit('combat', false));
  G.events.on('cutscene:start', quit('scene', true));
  G.events.on('dialogue:start', quit('scene', true));
  G.events.on('loaded', quit('loaded', true));
  G.events.on('reset', quit('reset', true));

  G.addSystem('fishing', (dt) => F.update(dt), ORDER.logic + 3);
  G.addSystem('fishing-late', (dt) => F.late(dt), ORDER.characters + 5);

  installTestHooks(F);
}

// ---- test hooks -------------------------------------------------------------------------------------------------------------------
// F.test.land(id, kg, spotId)   put a fish in the basket exactly as landing it would (log, flags, events) without the fight
// F.test.play(policy)           drive a running session with a policy bot until it ends; policy(fight) -> { reel, slack }
// F.test.input                  set F.testInput to hold keys: { reel, slack, jig, leave }
function installTestHooks(F) {
  const { G } = F;
  const S = G.state;
  F.test = {
    land(id, w, spotId = 'shelf_mid') {
      const spot = F.spot(spotId) || F.spots[0];
      const special = id === 'oldone';
      const r = recordCatch(S, { id, w, day: G.time.day, hours: G.time.hours, depth: spot?.depth ?? 2, special });
      F.caught(spot || { id: 'test' }, { id, w, special }, r);
      return r;
    },
    price: priceOf,
    cookValue,
    kg,
    cookable: () => cookable(S),
    take: (i) => takeFish(S, i),
    // Run one whole session headless: sit at a spot, sink the jig, wait for what comes (or force a species), fight it with a
    // bot that reels when the fish rests and gives line on a run, and stand up. Needs the frame loop running (the playthrough
    // ticks it). Resolves with what happened.
    // Options: spotId, force (species id: bite as soon as the jig is down), minutes (give up after), step (advance the game by
    // 0.1 s), bot (fight policy), depthFrac (how deep to hang the jig as a fraction of the water), until (stand up when it
    // returns true; the default is the first catch).
    async play({ spotId = 'shelf_mid', force = null, minutes = 3, step = () => new Promise((r) => setTimeout(r, 0)), bot = null, depthFrac = 0.5, until = null } = {}) {
      const spot = F.spot(spotId);
      if (!spot) return { error: 'no such spot' };
      F.testInput = { reel: false, slack: false, jig: false, leave: false };
      const done = F.begin(spot);
      const s = F.session;
      if (!s) { F.testInput = null; return { error: 'no session' }; }
      const out = { hooked: null, hooks: [], result: null };
      const stop = until || (() => s.catches > 0);
      let t = 0, wasFight = false;
      while (!s.ended && t < minutes * 60) {
        await step();
        t += 0.1;
        const inp = F.testInput;
        if (!inp) break;
        if (s.phase === 'fight' && !wasFight) out.hooks.push(s.fight.sp.id);
        wasFight = s.phase === 'fight';
        if (s.phase === 'fish') {
          // lower the jig to where the fish will be, then wait; force a bite when asked
          const want = force ? Math.min(spot.depth - 0.3, spot.depth * (SPECIES[force]?.depth.pref ?? 0.5)) : spot.depth * depthFrac;
          inp.slack = s.line.depth < want - 0.05;
          inp.reel = s.line.depth > want + 0.2;
          if (force && !s.bite && s.cool <= 0) {
            s._startBite(SPECIES[force], force === 'oldone' ? F.oldOneWeight() : (out.w ||= SPECIES[force].w[1]));
            s.bite.forced = true;
          }
          if (s.bite && s.bite.state === 'bite') { inp.jig = true; }
        } else if (s.phase === 'fight') {
          out.hooked ||= { id: s.fight.sp.id, w: s.fight.w };
          const f = s.fight;
          const act = bot ? bot(f) : (f.incoming && f.phase !== 'pull') || f.Fn > 0.85 || f.T > 0.86 ? { slack: true } : f.incoming ? {} : f.Fr < 0.62 && f.T < 0.66 ? { reel: true } : {};
          inp.reel = !!act.reel; inp.slack = !!act.slack;
        } else if (s.phase === 'land') {
          inp.reel = inp.slack = false;
        }
        if (s.phase === 'fish' && stop(s)) { inp.leave = true; }
      }
      F.testInput = null;
      if (!s.ended) F.abort('test', true);
      const r = await done;
      out.result = r;
      out.catches = s.catches;
      return out;
    },
  };
}
