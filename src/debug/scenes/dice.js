// Kosci (the tavern dice game) staged for screenshots and tests. Loads the village with its people and the game;
// nothing starts by itself unless &auto=1.
//
//   ?scene=dice&fps=30&hour=19              the tavern at dusk, window.__dice ready
//   &opp=wojtek|halina|zbyszek              who to play (default wojtek)    &seed=7   the dice (same every time)
//   &coins=40                               the player's grosze (default 40)
//   &auto=1                                 start a match at once; &auto=drive plays it out by itself (no screen)
//   &controller=1                           also load the story controller (dialogue topics, quest)
//
//   window.__dice.start({ seed, opp, drive? })     begin a match and return at once (the match's promise is __dice.result)
//   await __dice.until('stake' | 'roll1' | 'bet' | 'respond' | 'reroll' | 'roll2' | 'showdown' | 'next' | 'end')
//   __dice.press('Digit2')                          a key down and up on the window (what the keyboard and the pad send)
//   __dice.state()                                  { phase, mode, picked, focus, ... }
//   __dice.view('table' | 'rival' | 'closeup')       camera
// Example:
//   node scripts/shot.mjs --w 1280 --h 720 --q "scene=dice&fps=30&hour=19&seed=7" \
//     --eval "__dice.start({ seed: 7 }); await __dice.until('stake'); __dice.press('Enter'); await __dice.until('reroll')" --out shots/dice/reroll.png
import * as THREE from 'three';

const P = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = [
  'atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'locations', 'characters', 'ui', 'audio', 'gameplay', 'story', 'postfx',
];

export async function init(G) {
  const mod = await import('../../minigames/dice/index.js');
  await mod.init(G);
  const waiters = [];
  let phase = null;
  G.events.on('dice:phase', (e) => {
    phase = e;
    for (const w of [...waiters]) if (w.name === e.phase) { waiters.splice(waiters.indexOf(w), 1); w.resolve(e); }
  });
  const api = {
    G, result: null, phase: () => phase,
    start(o = {}) {
      const opts = { seed: P.get('seed') ? +P.get('seed') : undefined, ...o };
      api.result = G.dice.play(o.opp || P.get('opp') || 'wojtek', opts);
    },
    until(name, ms = 90000) {
      if (phase?.phase === name && G.dice.active) return Promise.resolve(phase);
      return new Promise((resolve, reject) => {
        const w = { name, resolve };
        waiters.push(w);
        setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error(`dice: no phase ${name} (now ${phase?.phase})`)); } }, ms);
      });
    },
    press(code, hold = 40) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
      return new Promise((r) => setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); r(); }, hold));
    },
    state() {
      const s = G.dice.session, ui = s?.ui;
      return { active: G.dice.active, phase: phase?.phase, mode: ui?.mode, picked: ui?.picked, focus: ui?.focus, items: ui?.items?.map((i) => i.label), coins: G.state.count('coins'), match: s?.match && { round: s.match.round, wins: s.match.wins, pot: s.match.pot, dice: s.match.dice } };
    },
    view(name) { G.dice.session?.stage?.view(name); },
  };
  window.__dice = api;

  G.state.data.inventory.coins = P.get('coins') ? +P.get('coins') : 40;
  const hour = parseFloat(P.get('hour') || '19');
  if (Number.isFinite(hour)) G.time.hours = hour;

  // The people have to be near the camera to exist: stand it in the tavern.
  const tavern = G.world.locations?.village?.buildings?.tavern?.p;
  if (tavern) {
    G.camera.position.set(tavern.x, tavern.y + 2, tavern.z + 4);
    G.camera.lookAt(new THREE.Vector3(tavern.x, tavern.y + 1, tavern.z));
    G.player?.teleport?.(tavern.x, tavern.z + 3.4, Math.PI, tavern.y + 0.05);
  }
  G.events.once('game:ready', async () => {
    if (!tavern) return;
    // let the stations place everybody, then wake the three at the tables
    await new Promise((r) => setTimeout(r, 1500));
    for (const id of ['zbyszek', 'wojtek', 'halina']) { try { G.npcs?.get(id)?.character; } catch (e) { console.warn('[dice scene]', id, e.message); } }
    G.npcs?.resync?.();
    const auto = P.get('auto');
    if (auto === 'drive') api.start({ seed: +P.get('seed') || 1, speed: 6, drive: autoDrive() });
    else if (auto) api.start();
  });
}

// A player that holds, rolls again every die that is not part of a pair or better, never raises, and plays on.
function autoDrive() {
  return {
    stake: (r) => r.min,
    bet: () => 'hold',
    respond: () => 'call',
    reroll: (dice) => {
      const c = {};
      for (const v of dice) c[v] = (c[v] || 0) + 1;
      return dice.map((v) => c[v] < 2);
    },
    next: () => 'next',
  };
}
