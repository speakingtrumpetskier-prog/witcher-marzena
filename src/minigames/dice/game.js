// One sitting at the table: take the camera and the player, put the table up, play a match round by round, give
// everything back. Match (match.js) is the rules, Stage (stage.js) the dice and coins on the table, DiceUI (ui.js)
// the screen; this file is the order things happen in and what the story gets told afterwards.
//
//   const session = new DiceSession(G, { opp: 'wojtek', seed?, drive?, speed? })
//   const result = await session.run()
//     -> { played: false, reason: 'player_short' | 'opp_short' | 'declined' | 'no_table' | 'busy' }
//      | { played: true, verdict: 'player' | 'opp' | 'draw' | 'left', ante, net, wins, rounds, best, match }
//
// Options for tests and screenshots: seed (a number: the same dice every time), speed (waits and animations run this
// many times faster), drive (answers the questions instead of the screen: { stake(range) -> number | null,
// bet(info) -> 'raise' | 'hold', respond(info) -> 'call' | 'fold', reroll(dice, info) -> [5 booleans],
// next(info) -> 'next' | 'done' }), site (a ready made site), keepOpen (leave the table up at the end).
//
// Game clock: waits run on the frames the game itself runs (a system), never on wall time, so a paused or throttled
// tab does not break a match and the story playthrough, which steps the systems by hand, can play one through.
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';
import { rng } from '../../core/util.js';
import { evaluate, madeDice } from './rules.js';
import { Match } from './match.js';
import { OPPONENTS, pickLine } from './opponents.js';
import { resolveSite } from './sites.js';
import { Stage } from './stage.js';
import { DiceUI, LEAVE } from './ui.js';

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const word = (n) => ['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n);

// What the opponent has in hand today (they sit down with the same purse each morning).
export function purseOf(G, opp) {
  const d = diceRecord(G);
  const day = G.time?.day ?? 1;
  let p = d.purse[opp.id];
  if (!p || p.day !== day) p = d.purse[opp.id] = { coins: opp.purse, day };
  return p;
}

// The record kept in the save: wins and losses, grosze, the best hand, each opponent's purse.
export function diceRecord(G) {
  const S = G.state;
  const d = (S.data.dice ||= {});
  d.matches ||= { won: 0, lost: 0, drawn: 0, left: 0 };
  d.rounds ||= { won: 0, lost: 0, drawn: 0 };
  d.grosze ||= { won: 0, lost: 0 };
  d.by ||= {};
  d.purse ||= {};
  if (d.best == null) d.best = null;
  return d;
}

export class DiceSession {
  constructor(G, opts = {}) {
    this.G = G;
    this.opts = opts;
    this.opp = typeof opts.opp === 'string' ? OPPONENTS[opts.opp] : opts.opp;
    const seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
    // The dice and the opponent's decisions draw from one stream, the remarks from another, so how long a pause was
    // never changes what comes up (the same seed plays the same match).
    this.rand = rng(seed);
    this.barkRand = rng(seed ^ 0x5eed);
    this.speed = opts.speed || 1;
    this.timers = [];
    this.lastLine = null;
    this.barkBusy = 0;
    this.npc = null;
    this.drive = opts.drive || null;
    this.aborted = false;
    this.off = null;
  }

  // ---- waiting on the game clock ---------------------------------------------------------------------------------
  sleep(seconds) {
    return new Promise((resolve) => this.timers.push({ t: seconds, resolve }));
  }

  update(dt) {
    const sdt = dt * this.speed;
    for (const t of this.timers) t.t -= sdt;
    const due = this.timers.filter((t) => t.t <= 0);
    if (due.length) { this.timers = this.timers.filter((t) => t.t > 0); for (const t of due) t.resolve(); }
    this.stage?.update(sdt);
    if (this.stage && this.G.cameraOwner === 'dice') this.stage.updateCamera(this.G.camera, dt);
    this.ui?.update(dt);
    this.barkBusy = Math.max(0, this.barkBusy - dt);
  }

  // ---- sound and the opponent's voice ------------------------------------------------------------------------------
  sfx(name, volume = 1) {
    try { this.G.audio?.sfx?.(name, { pos: this.site.origin, volume }); } catch { /* audio is optional */ }
  }

  onDiceEvent(kind, strength, die) {
    if (kind === 'rattle') this.sfx('dice_rattle', 0.9);
    else if (kind === 'land') this.sfx('dice_land', 0.35 + strength * 0.5);
    else if (kind === 'tumble') this.sfx('dice_tumble', 0.5);
    if (kind === 'land' && strength >= 1 && die.side === 'player') this.G.input?.rumble?.(0.15, 0.25, 60);
  }

  // The opponent says a line for a situation (not over another one).
  bark(situation, { force = false, chance = 1 } = {}) {
    if (!force && (this.barkBusy > 0 || this.barkRand() > chance)) return false;
    const text = pickLine(this.opp, situation, this.barkRand, this.lastLine);
    if (!text) return false;
    this.lastLine = text;
    this.ui.say(this.opp.name, text);
    this.barkBusy = 2.4;
    const npc = this.npc;
    try { this.G.voice?.bark?.(npc, text); } catch { /* optional */ }
    const c = npc?._c;
    if (c) {
      try { c.talk(true); c.playUpper?.(['talk_1', 'talk_2', 'talk_3'][Math.floor(this.barkRand() * 3)], { loop: false, fade: 0.3 }); } catch { /* optional */ }
      setTimeout(() => { try { c.talk(false); } catch { /* optional */ } }, Math.min(3200, 900 + text.length * 55));
    }
    return true;
  }

  // A small movement of the upper body (the opponent stays seated or behind the bar).
  react(gesture) {
    const c = this.npc?._c;
    try { c?.playUpper?.(gesture, { loop: false, fade: 0.25 }); } catch { /* optional */ }
  }

  // ---- asking ------------------------------------------------------------------------------------------------------
  // Announced as dice:phase so tests and screenshot scenes can wait for a moment of the game.
  phase(name, info = {}) { this.currentPhase = name; G_emit(this.G, 'dice:phase', { phase: name, ...info }); }

  async ask(kind, info) {
    this.phase(kind, { info });
    const d = this.drive;
    if (d && d[kind]) {
      await this.sleep(0.2);
      const v = kind === 'reroll' ? await d.reroll(info.dice, info) : await d[kind](info);
      return v === undefined ? null : v;
    }
    const u = this.ui;
    switch (kind) {
      case 'stake': return u.askStake(info);
      case 'bet': return u.askBet(info);
      case 'respond': return u.askRespond(info);
      case 'reroll': return u.askReroll(info.dice);
      case 'next': return u.askNext(info);
      default: return null;
    }
  }

  // Esc pressed between questions: ask now.
  async checkLeave() {
    if (this.aborted) return true;
    if (this.drive || !this.ui.takeLeaveRequest()) return false;
    const leave = await this.ui.confirmLeave();
    if (leave) this.aborted = true;
    return leave;
  }

  // ---- the sitting ----------------------------------------------------------------------------------------------------
  canPlay() {
    const G = this.G, opp = this.opp;
    if (!opp) return { ok: false, reason: 'no_table' };
    if (G.dice?.active) return { ok: false, reason: 'busy' };
    if (!this.opts.site && !resolveSite(G, opp.site)) return { ok: false, reason: 'no_table' };
    const min = opp.stakes[0];
    if (G.state.count('coins') < min * 2) return { ok: false, reason: 'player_short' };
    if (purseOf(G, opp).coins < min * 2) return { ok: false, reason: 'opp_short' };
    return { ok: true };
  }

  async run() {
    const G = this.G, opp = this.opp;
    const can = this.canPlay();
    if (!can.ok) return { played: false, reason: can.reason };
    this.site = this.opts.site || resolveSite(G, opp.site);
    const dice = G.dice;
    if (dice) dice.active = true;
    let saved = null;
    let result = { played: false, reason: 'declined' };
    try {
      await this.fade(1, 0.35);
      saved = this.take();
      this.build();
      await this.fade(0, 0.5);
      result = await this.sitting();
    } catch (e) {
      console.error('[dice] session', e);
      G.errors?.push?.(`dice: ${e.message}`);
      result = { played: false, reason: 'error', error: e };
    } finally {
      try { await this.fade(1, 0.3); } catch { /* ignore */ }
      if (saved) this.teardown(saved);
      if (dice) dice.active = false;
      try { await this.fade(0, 0.5); } catch { /* ignore */ }
    }
    return result;
  }

  async fade(to, seconds) {
    const G = this.G;
    if (G.shot || this.drive) return;
    await Promise.race([G.ui?.fade?.(to, seconds), this.sleep(seconds + 0.5)]);
  }

  // Take the camera, the player and the opponent.
  take() {
    const G = this.G, P = G.player;
    const saved = {
      owner: G.cameraOwner, fov: G.camera?.fov, control: P?.control, visible: P?.character?.visible, hud: true,
    };
    G.ui?.hud?.hide?.();
    if (P) {
      P.setControl?.(false);
      const s = this.site.stand;
      P.teleport?.(s.x, s.z, s.yaw, s.y);
      P.character?.setVisible?.(false);
    }
    const npc = G.npcs?.get?.(this.opp.npc);
    this.npc = npc || null;
    if (npc) {
      npc.pause?.(true);
      saved.npc = npc;
      // look at the dice, now and then at her
      this.lookTarget = this.site.toWorld(0, 0.05, 0.1);
      try { npc.character?.lookAt?.(this.lookTarget); } catch { /* optional */ }
    }
    return saved;
  }

  build() {
    const G = this.G, opp = this.opp;
    const dice = G.dice;
    const style = G.state.flag('dice_bone_set') ? 'redbone' : 'house';
    this.stage = new Stage(G, this.site, { playerStyle: style, oppStyle: opp.dice, seed: (this.rand() * 1e9) | 0 });
    // aim the close view at the opponent's head
    const head = this.npc?._c?.bones?.head;
    if (head) {
      head.updateWorldMatrix(true, false);
      const w = head.getWorldPosition(new THREE.Vector3());
      this.stage.rivalHead.copy(this.stage.group.worldToLocal(w));
    } else this.stage.rivalHead.set(0, 0.45, -0.75);
    this.stage.snapCamera();
    this.ui = new DiceUI(G, { opp, stage: this.stage });
    this.ui.open();
    // the table light: a candle above the cloth, from the shared pool (a fixed number of lights, so nothing recompiles)
    const pool = G.world?.lights;
    if (pool) {
      const p = this.site.toWorld(0, 0.85, 0.25);
      this.light = pool.add({ x: p.x, y: p.y, z: p.z, color: 0xffc079, intensity: 0.05, radius: 3.2, kind: 'candle', room: 'tavern', indoor: true, importance: 3 });
    }
    G.cameraOwner = 'dice';
    this.removeSystem = G.addSystem('dice-session', (dt) => this.update(dt), ORDER.camera + 2);
    if (this.stage) this.stage.updateCamera(G.camera, 0.016);
    void dice;
  }

  teardown(saved) {
    const G = this.G, P = G.player;
    this.removeSystem?.();
    this.removeSystem = null;
    try { this.ui?.close(); } catch (e) { console.error(e); }
    this.light?.remove?.();
    this.stage?.dispose();
    this.stage = null;
    G.cameraOwner = saved.owner || 'rig';
    if (G.camera && saved.fov) { G.camera.fov = saved.fov; G.camera.updateProjectionMatrix(); }
    G.camera?.up.set(0, 1, 0);
    if (P) {
      P.character?.setVisible?.(saved.visible !== false);
      if (saved.control) P.setControl?.(true);
    }
    try { saved.npc?.character?.lookAt?.(null); } catch { /* optional */ }
    saved.npc?.pause?.(false);
    G.ui?.hud?.show?.();
    for (const t of this.timers) t.resolve();
    this.timers = [];
  }

  // ---- the match --------------------------------------------------------------------------------------------------------
  async sitting() {
    const G = this.G, opp = this.opp, S = G.state, ui = this.ui, stage = this.stage;
    const purse = purseOf(G, opp);
    const coins0 = S.count('coins');
    const cap = Math.max(opp.stakes[0], Math.min(opp.stakes[1], Math.floor(coins0 / 2), Math.floor(purse.coins / 2)));
    ui.header({ round: 0, wins: { player: 0, opp: 0 }, coins: coins0, purse: purse.coins });
    await this.sleep(0.4);
    const ante = await this.ask('stake', { min: opp.stakes[0], max: cap, coins: coins0, purse: purse.coins, opp });
    if (ante === LEAVE || ante == null) return { played: false, reason: 'declined' };

    const match = new Match({ opp, ante, rand: this.rand, coins: coins0, purse: purse.coins });
    this.match = match;
    const sync = () => {
      // What is on the table is out of the purse: the player's coins and the opponent's follow the match.
      const delta = match.coins.player - S.count('coins');
      if (delta > 0) S.give('coins', delta, true); else if (delta < 0) S.take('coins', -delta, true);
      purse.coins = match.coins.opp;
    };
    const head = () => ui.header({ round: match.round, wins: match.wins, coins: match.coins.player, purse: match.coins.opp, pot: match.pot, ante });
    G.events.emit('dice:start', { opp: opp.id, ante });
    head();
    let left = false;

    for (;;) {
      const can = match.canStartRound();
      if (!can.ok) break;
      if (await this.checkLeave()) { left = true; break; }
      match.beginRound();
      sync();
      head();
      ui.clearBanner();
      ui.hands({ player: null, opp: null });
      stage.clearLights();
      stage.pot.clink = () => this.sfx('coin_pile', 0.5);
      const wait1 = stage.pot.add('player', ante);
      const wait2 = stage.pot.add('opp', ante, { delay: 0.1 });
      await this.sleep(Math.max(wait1, wait2));

      // ---- the first roll
      const first = match.rollFirst();
      this.phase('roll1', { dice: first });
      stage.view('table');
      this.bark('roll', { chance: 0.55 });
      await Promise.all([
        stage.roll('player', [0, 1, 2, 3, 4], first.player, { onEvent: (k, s, d) => this.onDiceEvent(k, s, d) }),
        stage.roll('opp', [0, 1, 2, 3, 4], first.opp, { onEvent: (k, s, d) => this.onDiceEvent(k, s, d), shakeTime: 0.85, stagger: 0.05 }),
      ]);
      ui.hands({ player: evaluate(first.player), opp: evaluate(first.opp) });
      // the opponent has a feeling about it
      const mood = match.mood();
      if (mood === 'good') this.bark('good', { chance: 0.85 }); else if (mood === 'bad') { this.bark('bad', { chance: 0.85 }); this.react('shrug'); }
      if (this.barkBusy > 0 && !this.drive) { stage.view('rival'); await this.sleep(1.5); stage.view('table'); await this.sleep(0.4); }
      if (await this.checkLeave()) { left = true; break; }

      // ---- the bet: the player first, then the opponent
      let round = null;
      const opts = match.options();
      const betInfo = { amount: match.raiseAmount, pot: match.pot, canRaise: opts.raise };
      let bet = await this.ask('bet', betInfo);
      if (bet === LEAVE) { left = true; break; }
      if (bet === 'raise') { stage.pot.add('player', ante); this.sfx('coin_pile', 0.6); }
      const r1 = match.playerBet(bet);
      sync(); head();
      if (r1.winner) round = r1; // the player folded (not offered at this step, kept for drivers)
      if (!round) {
        await this.sleep(0.7);
        const reply = match.aiBet();
        sync(); head();
        if (reply.action === 'call') {
          this.bark('call', { force: true });
          stage.pot.add('opp', ante);
          ui.note(`${opp.name} calls`);
          await this.sleep(0.9);
        } else if (reply.action === 'fold') {
          this.bark('fold', { force: true });
          ui.note(`${opp.name} folds`);
          await this.sleep(1.1);
          round = match.results[match.results.length - 1];
        } else if (reply.action === 'raise') {
          this.bark('raise', { force: true });
          stage.pot.add('opp', ante);
          ui.note(`${opp.name} raises`);
          await this.sleep(0.9);
          sync(); head();
          const resp = await this.ask('respond', { amount: match.raiseAmount, pot: match.pot, canCall: match.options().call });
          if (resp === LEAVE) { left = true; break; }
          if (resp === 'call') { stage.pot.add('player', ante); this.sfx('coin_pile', 0.6); }
          const r2 = match.playerRespond(resp);
          sync(); head();
          if (r2.winner) round = r2;
        }
      }

      if (!round) {
        // ---- the second roll
        stage.view('table');
        const dice = [...match.dice.player];
        const mask = await this.ask('reroll', { dice });
        if (mask === LEAVE) { left = true; break; }
        match.setPlayerReroll(mask);
        const omask = match.aiReroll();
        stage.lift('opp', omask);
        const n = omask.filter(Boolean).length;
        ui.note(n ? `${opp.name} rolls ${word(n)} again` : `${opp.name} keeps all five`, 1.6);
        await this.sleep(0.9);
        const second = match.rollSecond();
        this.phase('roll2', { dice: second });
        stage.lift('player', null);
        stage.lift('opp', null);
        const idx = (m) => m.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
        const pi = idx(second.mask.player), oi = idx(second.mask.opp);
        ui.hands({ player: null, opp: null });
        await Promise.all([
          pi.length ? stage.roll('player', pi, second.player, { onEvent: (k, s, d) => this.onDiceEvent(k, s, d), shakeTime: 0.6 }) : null,
          oi.length ? stage.roll('opp', oi, second.opp, { onEvent: (k, s, d) => this.onDiceEvent(k, s, d), shakeTime: 0.7 }) : null,
        ]);
        await this.sleep(0.3);
        round = match.settle();
      }

      await this.showdown(match, round);
      sync();
      head();
      if (match.over) break;
      const next = await this.ask('next', { last: false });
      if (next === LEAVE || next === 'done') { left = true; break; }
    }

    if (left) {
      match.leave();
      sync();
    }
    const out = await this.finish(match, ante, left);
    return out;
  }

  // The cards (the dice) are turned: who won, with what, and where the coins go.
  async showdown(match, r) {
    const ui = this.ui, stage = this.stage, opp = this.opp;
    const hp = r.hands.player, ho = r.hands.opp;
    this.phase('showdown', { result: r });
    ui.hands({ player: hp, opp: ho }, { winner: r.winner });
    if (r.how === 'showdown') {
      const mine = madeDice(match.dice.player), theirs = madeDice(match.dice.opp);
      if (r.winner === 'player') { stage.light('player', mine, 'made'); stage.light('opp', [], 'made'); }
      else if (r.winner === 'opp') { stage.light('opp', theirs, 'made'); stage.light('player', [], 'made'); }
    }
    const pot = r.pot;
    let title, sub, tone;
    if (r.winner === 'draw') { title = 'Drawn round'; sub = `${hp.name}, against ${lower(ho.name)}. Each takes the stake back.`; tone = 'draw'; }
    else if (r.how === 'fold') {
      if (r.folded === 'opp') { title = `${opp.name} folds`; sub = `You take ${pot} grosze.`; tone = 'win'; } else { title = 'You fold'; sub = `${opp.name} takes ${pot} grosze.`; tone = 'lose'; }
    } else if (r.winner === 'player') { title = 'You take the round'; sub = `${hp.name}, against ${lower(ho.name)}. ${pot} grosze.`; tone = 'win'; }
    else { title = `${opp.name} takes the round`; sub = `${ho.name}, against ${lower(hp.name)}. ${pot} grosze.`; tone = 'lose'; }
    ui.banner(title, sub, tone);
    G_emit(this.G, 'dice:round', { opp: opp.id, round: r.round, winner: r.winner, how: r.how, pot, hands: [hp.name, ho.name] });
    this.sfx('coin_slide', 0.8);
    await this.sleep(0.5);
    const to = r.winner === 'draw' ? 'split' : r.winner;
    const t = stage.pot.sweep(to);
    // a fold was already answered with the fold line
    if (r.how === 'fold') { /* said already */ } else if (r.winner === 'opp') { this.bark('win', { force: true }); this.react('nod'); } else if (r.winner === 'player') { this.bark('lose', { force: true }); this.react('shake_head'); }
    if (this.barkBusy > 0 && !this.drive) { stage.view('rival'); await this.sleep(1.4); stage.view('table'); }
    await this.sleep(Math.max(0.4, t - 1.0));
    ui.hands({ player: hp, opp: ho }, { winner: r.winner });
  }

  // The match is over: tell the story, keep the record.
  async finish(match, ante, left) {
    const G = this.G, S = G.state, opp = this.opp, ui = this.ui;
    const rec = diceRecord(G);
    const net = match.net;
    const verdict = left ? 'left' : match.verdict;
    const b = (rec.by[opp.id] ||= { won: 0, lost: 0, drawn: 0, left: 0, grosze: 0 });
    if (verdict === 'player') { rec.matches.won++; b.won++; } else if (verdict === 'opp') { rec.matches.lost++; b.lost++; } else if (verdict === 'draw') { rec.matches.drawn++; b.drawn++; } else { rec.matches.left++; b.left++; }
    rec.rounds.won += match.wins.player; rec.rounds.lost += match.wins.opp; rec.rounds.drawn += match.draws;
    if (net > 0) rec.grosze.won += net; else rec.grosze.lost += -net;
    b.grosze += net;
    if (match.bestHand && (rec.best == null || match.bestHand.score > rec.best.score)) rec.best = { name: match.bestHand.name, score: match.bestHand.score };
    if (verdict === 'player') S.set(`dice_beat_${opp.id}`);
    S.inc('dice_matches', 1);
    const result = { played: true, verdict, ante, net, wins: { ...match.wins }, rounds: match.round, best: match.bestHand?.name || null, match, opp: opp.id, reason: match.reason };
    if (G.dice) G.dice.last = result;
    G_emit(G, 'dice:match', { opp: opp.id, verdict, net, wins: result.wins, rounds: match.round });
    this.phase('end', { result });

    if (!left && ui) {
      const sub = net > 0 ? `You are ${net} grosze better off.` : net < 0 ? `You are ${-net} grosze worse off.` : 'You are even.';
      const title = verdict === 'player' ? `You win the match, ${match.wins.player} to ${match.wins.opp}` : verdict === 'opp' ? `${opp.name} wins the match, ${match.wins.opp} to ${match.wins.player}` : 'The match is drawn';
      const why = match.reason === 'player_short' ? ' You cannot cover another round.' : match.reason === 'opp_short' ? ` ${opp.name} cannot cover another round.` : '';
      ui.banner(title, sub + why, verdict === 'player' ? 'win' : verdict === 'opp' ? 'lose' : 'draw');
      if (verdict === 'player') this.bark('lose', { force: true }); else if (verdict === 'opp') this.bark('win', { force: true });
      if (match.reason === 'opp_short') this.bark('broke', { force: true });
      await this.ask('next', { last: true });
    }
    return result;
  }
}

function G_emit(G, name, payload) { try { G.events.emit(name, payload); } catch (e) { console.error(e); } }
