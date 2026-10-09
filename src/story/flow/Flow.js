// Game flow, triggers, rest and saves. Merged into G.story by src/story/index.js.
//
//   G.story.zone({ id, x, z, r, enabled, once, always, onEnter, onLeave }) -> id
//   G.story.removeZone(id)
//   await G.story.rest(toHour)     fade out, advance the clock, heal, warm, autosave, fade in
//   G.story.save() / G.story.load() -> bool    player position, clock, weather (plus G.state)
//   await G.story.newGame()        reset, prologue spawn, quest main_pass, cutscene c1_blizzard
//   await G.story.continueGame()
//   await G.story.debugStart(questId, stage)   also ?start=<questId>:<stage>
//   G.story.busy                   a dialogue, cutscene or rest is running
//
// Boot: in shot mode, with ?scene or with ?nostory nothing starts. Otherwise the title screen
// (G.ui.title(), or a fallback overlay) decides New Game or Continue. The flow drives a slow
// title backdrop camera (owner 'title') only for the fallback title (the real one drives its own).
// Rule kept here: `night1` is set when the clock passes 20:00 (rest or wait) with `hanka_hired`.
import * as THREE from 'three';
import { SPAWN } from '../../world/layout.js';
import { MAIN_ORDER } from '../content/quests.js';

const _p = new THREE.Vector3();

export class Flow {
  constructor(G, story) {
    this.G = G;
    this.story = story;
    this.zones = new Map();
    this._zid = 1;
    this.resting = false;
    this.titleCam = null;

    const nightRule = () => {
      const S = G.state, h = G.time?.hours ?? 12;
      if (S.flag('hanka_hired') && !S.flag('night1') && (h >= 20 || h < 6)) S.set('night1', true);
    };
    G.events.on('time:hour', nightRule);
    G.events.on('time:jump', nightRule);

    // Autosave on quest progress, once things settle.
    let saveT = 0;
    G.events.on('quest:update', () => {
      if (G.shot || this.story.noAutosave) return;
      clearTimeout(saveT);
      saveT = setTimeout(() => { if (!this.story.busy) this.save(); }, 2500);
    });
  }

  // Ground position of the player (or the camera when there is no player, for debugging).
  playerPos(out = _p) {
    const G = this.G;
    const p = G.player?.position || G.player?.character?.root?.position;
    if (p) return out.copy(p);
    return out.copy(G.camera.position);
  }

  zone(def) {
    const id = def.id ?? `zone${this._zid++}`;
    this.zones.set(id, { r: 6, once: false, ...def, id, inside: false });
    return id;
  }

  removeZone(id) { this.zones.delete(id); }

  update() {
    if (!this.zones.size) return;
    const busy = this.story.busy;
    const p = this.playerPos();
    for (const z of [...this.zones.values()]) {
      if (busy && !z.always) continue;
      let en = true;
      if (z.enabled) { try { en = !!z.enabled(this.G.state, this.G); } catch (e) { console.error(e); en = false; } }
      const inside = en && Math.hypot(p.x - z.x, p.z - z.z) < z.r;
      if (inside && !z.inside) {
        z.inside = true;
        if (z.once) this.zones.delete(z.id);
        try { const r = z.onEnter?.(z); if (r?.catch) r.catch((e) => console.error(`[zone ${z.id}]`, e)); } catch (e) { console.error(`[zone ${z.id}]`, e); }
      } else if (!inside && z.inside) {
        z.inside = false;
        try { z.onLeave?.(z); } catch (e) { console.error(`[zone ${z.id}]`, e); }
      }
    }
  }

  async rest(toHour, { fadeOut = 1.1, fadeIn = 1.4, save = true } = {}) {
    const G = this.G, ui = this.story.ui;
    if (this.story.busy) return false;
    this.resting = true;
    const prevContext = G.input?.context;
    G.player?.setControl?.(false);
    if (G.input) G.input.context = 'cutscene';
    ui.prompt(null);
    try {
      await ui.fade(1, fadeOut);
      G.time?.advanceTo?.(toHour);
      const P = G.player;
      if (P) {
        if (typeof P.heal === 'function') P.heal(P.maxHealth ?? 100);
        else if (P.maxHealth != null) P.health = P.maxHealth;
        if ('warmth' in P) P.warmth = 1;
        if (P.maxStamina != null && 'stamina' in P) P.stamina = P.maxStamina;
      }
      const hh = Math.floor(G.time?.hours ?? toHour), mm = Math.round(((G.time?.hours ?? toHour) % 1) * 60);
      G.events.emit('rest', { hours: G.time?.hours, day: G.time?.day });
      if (save) this.save();
      await new Promise((r) => setTimeout(r, 700));
      ui.notify(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 'time');
      await ui.fade(0, fadeIn);
    } finally {
      this.resting = false;
      G.player?.setControl?.(true);
      if (G.input) G.input.context = prevContext === 'cutscene' ? 'game' : prevContext || 'game';
    }
    return true;
  }

  save() {
    const G = this.G;
    if (G.shot) return false;
    const p = this.playerPos(new THREE.Vector3());
    return G.state.save({
      player: { x: p.x, y: p.y, z: p.z, yaw: G.player?.yaw ?? 0 },
      clock: { day: G.time?.day ?? 1, hours: G.time?.hours ?? 12 },
      weather: G.weather?.state || null,
      weatherAuto: G.weather?.auto ?? true,
    });
  }

  load() {
    const G = this.G;
    if (!G.state.load()) return false;
    this.apply(G.state.data);
    return true;
  }

  // Put the world in the state a save or debug start describes.
  apply(d) {
    const G = this.G;
    if (d.clock && G.time) {
      G.time.day = d.clock.day ?? 1;
      G.time.setHours(d.clock.hours ?? 12);
    }
    if (d.weather) G.weather?.set?.(d.weather, 0);
    if (G.weather && d.weatherAuto != null && 'auto' in G.weather) G.weather.auto = d.weatherAuto;
    if (d.player) this.place(d.player.x, d.player.z, d.player.yaw);
  }

  place(x, z, yaw = 0) {
    const G = this.G;
    if (G.player?.teleport) G.player.teleport(x, z, yaw);
    else if (G.player?.character?.setPosition) { G.player.character.setPosition(x, z); G.player.character.yaw = yaw; }
    G.events.emit('story:place', { x, z, yaw });
  }

  async newGame() {
    const G = this.G, ui = this.story.ui;
    this._stopTitleCam();
    G.state.reset();
    if (G.time) { G.time.day = 1; G.time.setHours(14.5); if (!G.shot) G.time.scale = 60; }
    G.weather?.set?.('blizzard', 0);
    if (G.weather && 'auto' in G.weather) G.weather.auto = false;
    this.place(SPAWN.prologue.x, SPAWN.prologue.z, SPAWN.prologue.yaw);
    G.cameraOwner = 'rig';
    this.story.quests.start('main_pass');
    G.events.emit('story:newgame', {});
    if (G.cutscenes.has('c1_blizzard')) {
      await G.cutscenes.play('c1_blizzard');
    } else {
      await ui.fade(0, 1.5);
    }
    G.player?.setControl?.(true);
    if (G.input) G.input.context = 'game';
  }

  async continueGame() {
    const G = this.G, ui = this.story.ui;
    this._stopTitleCam();
    if (!this.load()) return this.newGame();
    if (G.time && !G.shot) G.time.scale = 60;
    G.cameraOwner = 'rig';
    G.player?.setControl?.(true);
    if (G.input) G.input.context = 'game';
    G.events.emit('story:continue', {});
    await ui.fade(0, 1.4);
  }

  // Jump to a quest stage with the flags, items, clock, weather and position it implies.
  async debugStart(questId, stageId) {
    const G = this.G;
    const Q = this.story.quests;
    const S = G.state;
    this._stopTitleCam();
    if (!Q.def(questId)) { console.warn(`[story] debugStart: unknown quest ${questId}`); return false; }
    S.reset();
    Q.quiet = true;
    const apply = (sd) => {
      for (const f of sd.sets || []) S.set(f, true);
      for (const [k, n] of Object.entries(sd.give || {})) S.give(k, n);
    };
    // Walk a quest forward until it sits on `stop` (or completes when stop is null).
    const walk = (id, stop) => {
      if (!Q.rec(id)) Q.start(id);
      for (let guard = 0; guard < 20 && Q.isActive(id); guard++) {
        const cur = Q.stage(id);
        if (stop != null && cur === stop) break;
        const sd = Q._stageDef(id, cur);
        apply(sd);
        if (Q.stage(id) === cur) Q.next(id);
      }
    };
    try {
      const qi = MAIN_ORDER.indexOf(questId);
      const def = Q.def(questId);
      const stop = stageId ?? def.stages[0].id;
      if (qi >= 0) {
        for (let i = 0; i < qi; i++) walk(MAIN_ORDER[i], null);
      }
      walk(questId, stop);
      if (Q.stage(questId) !== stop && Q._stageDef(questId, stop)) Q.advance(questId, stop);
      Q.track(questId);
      const sd = Q._stageDef(questId, stop) || def.stages[0];
      const dbg = sd.debug || {};
      this.apply({
        clock: { day: dbg.day ?? G.time?.day ?? 1, hours: dbg.time ?? G.time?.hours ?? 12 },
        weather: dbg.weather || null,
        weatherAuto: false,
        player: dbg.at ? { x: dbg.at[0], z: dbg.at[1], yaw: dbg.at[2] ?? 0 } : null,
      });
    } finally {
      Q.quiet = false;
    }
    if (G.cameraOwner === 'title') G.cameraOwner = 'rig';
    G.player?.setControl?.(true);
    if (G.input) G.input.context = 'game';
    G.events.emit('story:debugstart', { quest: questId, stage: Q.stage(questId) });
    console.log(`[story] debug start ${questId}:${Q.stage(questId)}`);
    return true;
  }

  async boot() {
    const G = this.G, ui = this.story.ui;
    const start = G.params.get('start');
    if (start) {
      const [q, st] = start.split(':');
      await this.debugStart(q, st || undefined);
      if (!G.shot) ui.fade(0, 0.8);
      return;
    }
    if (G.shot || G.params.has('scene') || G.params.has('nostory')) return;

    // Title: the valley at dusk behind the menu.
    G.player?.setControl?.(false);
    if (G.input) G.input.context = 'ui';
    if (G.time) { G.time.setHours(17.2); G.time.scale = 0; }
    G.weather?.set?.('clear', 0);
    // The real title screen drives its own camera (owner 'title'); the fallback needs ours.
    if (!ui.real('title') && !G.ui?.drivesTitleCamera) this._startTitleCam();
    const choice = await ui.title();
    G.audio?.unlock?.();
    G.input?.requestLock?.();
    await ui.fade(1, 1.0);
    if (choice === 'continue' && G.state.hasSave()) await this.continueGame();
    else await this.newGame();
  }

  _startTitleCam() {
    const G = this.G;
    G.cameraOwner = 'title';
    const t0 = G.clock.elapsed;
    const from = new THREE.Vector3(-70, 34, 215), to = new THREE.Vector3(-20, 30, 200);
    const look = new THREE.Vector3(110, 14, -140);
    this.titleCam = G.addSystem('story-title-cam', () => {
      if (G.cameraOwner !== 'title') return;
      const k = Math.min(1, (G.clock.elapsed - t0) / 90);
      const e = k * k * (3 - 2 * k);
      G.camera.position.lerpVectors(from, to, e);
      const gy = G.world?.heightAt?.(G.camera.position.x, G.camera.position.z) ?? 0;
      if (G.camera.position.y < gy + 6) G.camera.position.y = gy + 6;
      G.camera.lookAt(look);
    }, 81);
  }

  _stopTitleCam() {
    if (this.titleCam) { this.titleCam(); this.titleCam = null; }
    if (this.G.cameraOwner === 'title') this.G.cameraOwner = 'rig';
  }
}
