// Fishing gallery and test stage: the real lake, the village shore and Vesna with a rod.
//
//   ?scene=fishing&hour=14&weather=clear          stands her by a hole (&spot=shelf_mid; ids: shelf_west shelf_mid shelf_east deep_west
//                                                 deep_east camp_a camp_b far tower), rod in the pack
//   &sit=1                                        sit down at the hole at once        &fps=20 &quality=low as for any shot
//   &fire=1                                       a campfire beside her (to roast at)
// Test hooks on window.__fishing (all resolve when done; time is real, so use &fps=20 and wait):
//   sit(id)                 walk to the stool and sit                    wait(seconds)           real seconds of play
//   bite(id, kg)            make that fish come to the jig now           strike()                tap the strike key
//   hook(id, kg)            sit, bring a bite and strike it              status()                phase, tension, line out, and so on
//   hold({ reel, slack })   hold the keys                                 land(id, kg)            play a whole fight with a bot until the fish is landed
//   leave()                 stand up                                     cook() / cut()          roast the cheapest fish / cut the thin spot
//   node scripts/shot.mjs --w 1280 --h 720 --q "scene=fishing&hour=14&fps=20&quality=low" --eval "await __fishing.hook('pike', 4); await __fishing.wait(2.5)" --out shots/fishing/fight.png
import * as THREE from 'three';
import { SPECIES } from '../../gameplay/fishing/species.js';

const Q = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = ['atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'locations', 'characters', 'ui', 'audio', 'gameplay', 'postfx'];

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export async function init(G) {
  const F = G.fishing, P = G.player, S = G.state;
  if (!F || !P) throw new Error('the fishing scene needs the gameplay module');
  G.input.context = 'game';
  if (!Q.has('cam')) G.cameraOwner = 'rig';
  if (!Q.has('hour')) G.time.setHours(14.2);
  S.data.inventory.rod = 1;
  S.data.inventory.coins = Math.max(S.data.inventory.coins || 0, 20);
  if (Q.has('seed')) F.seed(parseInt(Q.get('seed'), 10));
  const spotId = Q.get('spot') || 'shelf_mid';
  const spot = () => F.spot(spotId);

  // Stand her a couple of paces from the stool, looking at the hole.
  const stage = (id = spotId) => {
    const s = F.spot(id);
    if (!s) return null;
    P.teleport(s.seat.x - Math.sin(s.seat.yaw) * 1.6 + 0.8, s.seat.z - Math.cos(s.seat.yaw) * 1.6, s.seat.yaw);
    G.cameraRig?.snapBehind(s.seat.yaw);
    return s;
  };
  stage();
  if (Q.has('fire')) {
    const s = spot();
    G.world.fires.push({ x: s.seat.x + 3.5, z: s.seat.z + 2.5, r: 6, id: 'test_fire' });
  }

  const until = async (pred, secs = 20) => {
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) { if (pred()) return true; await wait(0.05); }
    return false;
  };

  const api = {
    F, stage,
    wait,
    async sit(id = spotId) {
      stage(id);
      const s = F.spot(id);
      F.testInput = F.testInput || { reel: false, slack: false, jig: false, leave: false };
      F.begin(s);
      await until(() => F.phase === 'fish' || !F.active, 12);
      return F.phase;
    },
    // Make a fish come to the jig now: the session starts its approach as if the model had rolled it.
    async bite(id = 'perch', kg) {
      const sp = SPECIES[id];
      const s = F.session;
      if (!s) return false;
      s.cool = 0;
      s._startBite(sp, kg ?? sp.w[1]);
      return true;
    },
    strike() { F.testInput.jig = true; },
    async hook(id = 'perch', kg) {
      if (!F.active) await api.sit();
      const s = F.session;
      // lower the jig to the fish's depth first
      const want = Math.min(s.W - 0.3, s.W * (SPECIES[id].depth.pref));
      F.testInput.slack = true;
      await until(() => s.line.depth >= want, 12);
      F.testInput.slack = false;
      api.bite(id, kg);
      await until(() => s.bite && s.bite.state === 'bite', 8);
      api.strike();
      await until(() => F.phase === 'fight', 3);
      return F.phase;
    },
    hold(keys) { Object.assign(F.testInput, { reel: false, slack: false }, keys); },
    // A camera of our own while she fishes: pos and look in world coordinates (null gives the session camera back).
    cam(pos, look, fov) { F.debugCam = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null; },
    async land(id = 'perch', kg) {
      if (F.phase !== 'fight') await api.hook(id, kg);
      const s = F.session;
      const t0 = performance.now();
      while (F.active && F.phase === 'fight' && performance.now() - t0 < 120000) {
        const f = s.fight;
        const act = (f.incoming && f.phase !== 'pull') || f.Fn > 0.85 || f.T > 0.86 ? { slack: true } : f.incoming ? {} : f.Fr < 0.62 && f.T < 0.66 ? { reel: true } : {};
        F.testInput.reel = !!act.reel; F.testInput.slack = !!act.slack;
        await wait(0.04);
      }
      F.testInput.reel = F.testInput.slack = false;
      return F.phase;
    },
    leave() { if (F.testInput) F.testInput.leave = true; return until(() => !F.active, 6); },
    async cook() { return F.cook(); },
    async cut() { return F.cutHole('tower'); },
    status() {
      const s = F.session, f = s?.fight;
      return {
        active: F.active, phase: F.phase, catches: F.catches, depth: s?.line.depth, water: s?.W,
        bite: s?.bite?.state, T: f?.T, Fn: f?.Fn, dist: f?.dist, stamina: f?.stamina, fp: f?.phase, state: f?.state,
        basket: F.basket.map((e) => `${e.id} ${e.w}`), coins: S.count('coins'), health: P.health, warmth: P.warmth,
        owner: G.cameraOwner, control: P.control,
      };
    },
  };
  window.__fishing = api;

  if (Q.has('sit')) G.events.once('game:ready', () => { api.sit(); });
  void THREE;
}
