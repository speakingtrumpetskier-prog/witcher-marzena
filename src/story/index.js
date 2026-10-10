// Story systems entry (owner: story systems builder). Creates G.dialogue, G.cutscenes,
// G.quests and G.story, the shared cinematic camera, scheduler and UI facade, and starts the
// game flow (title, New Game, Continue, ?start=quest:stage) once the world is ready.
//
// G.story: zone, removeZone, rest, save, load, newGame, continueGame, debugStart, busy,
//   ui (UI facade with fallbacks), cam (CineCamera), sched (Scheduler), quests,
//   placeholderFactory (debug scenes may set (preset) => character-like object),
//   syncPlayer(actor), newStage()
// See docs/ARCHITECTURE.md "Dialogue", "Cutscenes", "Quests", "Triggers and flow".
import { ORDER } from '../core/G.js';
import { Scheduler } from './director/Scheduler.js';
import { createStoryUI } from './director/Overlay.js';
import { CineCamera } from './director/CineCamera.js';
import { ActorStage } from './director/Actors.js';
import { Dialogue } from './Dialogue.js';
import { Cutscenes } from './Cutscene.js';
import { Quests } from './Quests.js';
import { Flow } from './flow/Flow.js';

export async function init(G) {
  // Interaction and senses normally come from gameplay/index.js; load them here if the
  // gameplay module is missing or failed, since the story depends on both.
  if (!G.interact) {
    try { await (await import('../gameplay/Interact.js')).init(G); } catch (e) { G.errors.push(`story: interact ${e.message}`); }
  }
  if (!G.senses) {
    try { await (await import('../gameplay/Senses.js')).init(G); } catch (e) { G.errors.push(`story: senses ${e.message}`); }
  }

  const stages = new Set();
  const story = {
    sched: new Scheduler(),
    ui: createStoryUI(G),
    cam: new CineCamera(G),
    placeholderFactory: null,
    noAutosave: false,
    get busy() {
      return !!(G.dialogue?.active || G.cutscenes?.active || story.flow?.resting || G.dice?.active);
    },
    newStage() {
      const s = new ActorStage(G);
      const release = s.releaseAll.bind(s);
      s.releaseAll = () => { release(); stages.delete(s); };
      stages.add(s);
      return s;
    },
    // Hand the player character's scripted position and facing back to the Player module.
    syncPlayer(actor) {
      const P = G.player;
      if (!P || !actor) return;
      const r = actor.root.position;
      if (typeof P.teleport === 'function') P.teleport(r.x, r.z, actor.yaw, r.y);
      else if (P.position) { P.position.copy(r); if ('yaw' in P) P.yaw = actor.yaw; }
    },
  };
  G.story = story;

  const flow = new Flow(G, story);
  story.flow = flow;
  for (const k of ['zone', 'removeZone', 'rest', 'save', 'load', 'newGame', 'continueGame', 'debugStart', 'place']) {
    story[k] = flow[k].bind(flow);
  }

  story.quests = new Quests(G, story);
  G.quests = story.quests;
  G.dialogue = new Dialogue(G, story);
  G.cutscenes = new Cutscenes(G, story);

  // Debug knobs from the URL: ?dspeed=2 plays dialogue lines twice as fast, ?autopick=0,1,2
  // answers choices without input (also on in shot mode so scenes never hang).
  // ?sspeed=3 runs the story clock (scheduler, cinematic camera, actor turns) 3x: captures only.
  const ss = parseFloat(G.params.get('sspeed'));
  story.timeScale = Number.isFinite(ss) && ss > 0 ? ss : 1;
  const ds = parseFloat(G.params.get('dspeed'));
  if (Number.isFinite(ds) && ds > 0) G.dialogue.speed = ds;
  const ap = G.params.get('autopick');
  if (ap != null) G.dialogue.autopick = ap === '' ? 'first' : ap.split(',').map((n) => parseInt(n, 10) || 0);
  else if (G.shot) G.dialogue.autopick = 'first';

  G.addSystem('story', (rdt) => {
    const dt = rdt * story.timeScale;
    story.sched.update(dt);
    G.dialogue.update(dt);
    G.cutscenes.update(dt);
    G.cutscenes.stage?.update(dt);
    for (const s of stages) s.update(dt);
    flow.update(dt);
  }, ORDER.logic + 5);

  // While a scene drives Vesna, keep the Player module's idea of her position in step.
  G.addSystem('story-player-sync', () => {
    if (!story.busy) return;
    const P = G.player, c = P?.character;
    if (!c?.root) return;
    if (P.position && P.position !== c.root.position && P.position.copy) P.position.copy(c.root.position);
    if ('yaw' in P) P.yaw = c.yaw ?? c.root.rotation.y;
  }, ORDER.characters + 1);

  G.addSystem('story-camera', (dt) => story.cam.update(dt * story.timeScale), ORDER.camera + 1);

  // The story controller wires triggers, interactions, NPC talk, quest flow, the finale and the
  // playthrough hooks (src/story/controller). Debug scenes other than the playthrough do not get it.
  const scene = G.params.get('scene');
  if (!G.params.has('nostory') && (!scene || scene === 'playthrough' || G.params.has('controller'))) {
    try {
      await (await import('./controller/index.js')).init(G);
    } catch (e) {
      console.error('[story controller]', e);
      G.errors.push(`story controller: ${e.message}`);
    }
  }

  G.events.once('game:ready', () => {
    flow.boot().catch((e) => {
      console.error('[story boot]', e);
      G.errors.push(`story boot: ${e.message}`);
    });
  });
}
