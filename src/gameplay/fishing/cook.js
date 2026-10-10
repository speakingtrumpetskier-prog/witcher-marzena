// Roasting a fish at a fire: any hearth, campfire or brazier registered in G.world.fires. Walk up, press E ("Roast"), kneel,
// hold the stick over the flames while the fish browns and sizzles, eat it; health and warmth come back by the size of the
// fish. The cheapest fish in the basket goes first (the old pike never does).
//
//   F.canCook() -> bool          a fish to roast and a fire within reach
//   F.cook() -> Promise<bool>    the whole business
//   F.nearestFire() -> { f, d }  the closest fire to Vesna and its distance
import * as THREE from 'three';
import { clamp } from '../../core/util.js';
import { fx } from '../../world/props/fx.js';
import { makeRoastStick, makeFish } from './mesh.js';
import { SPECIES } from './species.js';
import { cookValue, kg } from './model.js';
import { fishData, cookable, takeFish } from './store.js';

const REACH = 2.8;
const _w = new THREE.Vector3();

export function installCook(F) {
  const G = F.G, S = G.state;
  const firePos = new THREE.Vector3();
  const near = { f: null, d: 99, frame: -1 };

  F.nearestFire = () => {
    if (near.frame === G.clock.frame) return near;
    near.frame = G.clock.frame;
    near.f = null; near.d = 99;
    const p = G.player?.position;
    if (!p) return near;
    for (const f of G.world?.fires || []) {
      if (f.indoor) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < near.d) { near.d = d; near.f = f; }
    }
    return near;
  };

  F.canCook = () => {
    const P = G.player;
    if (!P || F.active || F.cooking || F.cutting || P.state === 'dead' || P.state === 'scripted') return false;
    return cookable(S) >= 0 && F.nearestFire().d < REACH;
  };

  const label = () => {
    const i = cookable(S);
    const e = i >= 0 ? fishData(S).basket[i] : null;
    return e ? `Roast the ${SPECIES[e.id].name.toLowerCase()}, ${kg(e.w)}` : 'Roast a fish';
  };

  G.interact?.add({
    id: 'fish:cook',
    pos: () => { const f = F.nearestFire().f; return f ? firePos.set(f.x, (G.world.heightAt(f.x, f.z) || 0) + 1, f.z) : firePos.set(1e5, 0, 1e5); },
    radius: REACH,
    facing: true, // looking at the fire, so a talk prompt close by (the reeve's hearth) is not shadowed
    verb: 'Cook',
    label,
    enabled: () => F.canCook(),
    onUse: async () => { await F.cook(); },
  });

  F.cook = async () => {
    if (!F.canCook()) return false;
    const P = G.player, c = P.character;
    const idx = cookable(S);
    const e = fishData(S).basket[idx];
    const val = cookValue(e.id, e.w);
    if (P.health >= P.maxHealth - 3 && P.warmth >= 0.95) { F.say('Not hungry.', 2); return false; }
    const fire = F.nearestFire().f;
    takeFish(S, idx);
    F.cooking = true;
    let stick = null, eat = null, loop = null;
    P.setControl(false);
    try {
      // stand on the side she came from, a pace and a half from the flames
      const dx = P.position.x - fire.x, dz = P.position.z - fire.z, d = Math.hypot(dx, dz) || 1;
      const sx = fire.x + (dx / d) * 1.35, sz = fire.z + (dz / d) * 1.35;
      const yaw = Math.atan2(fire.x - sx, fire.z - sz);
      await c.walkTo(sx, sz, { face: yaw, stopDist: 0.08, speed: 1.4 });
      c.yaw = yaw;
      stick = makeRoastStick(e.id, e.w);
      c.attach('handR', stick.group);
      c.play('fish_roast', { loop: true, fade: 0.6 });
      const gy = G.world.heightAt(fire.x, fire.z) || 0;
      const at = _w.set(fire.x, gy + 0.6, fire.z);
      try { loop = G.audio?.loop?.('sizzle', { pos: at.clone(), volume: 0.0 }) || null; } catch { loop = null; }
      const dur = 4.4;
      const t0 = F.clock;
      let sparkT = 0;
      while (F.clock - t0 < dur) {
        const k = clamp((F.clock - t0) / dur);
        stick.setCook(k);
        loop?.setVolume(0.35 + 0.65 * Math.min(1, k * 2.2));
        sparkT -= 0.12;
        if (sparkT <= 0) { sparkT = 0.7; fx.burst('sparks', [fire.x + (Math.random() - 0.5) * 0.3, gy + 0.55, fire.z + (Math.random() - 0.5) * 0.3], { count: 3, speed: 0.8 }); }
        await F.sleep(0.12);
      }
      stick.setCook(1);
      loop?.stop(0.8);
      loop = null;
      c.detach(stick.group);
      stick.dispose();
      stick = null;
      // eat it off the bones
      eat = makeFish(e.id, e.w);
      eat.setCook(1);
      eat.group.scale.setScalar(Math.min(1, 0.4 / eat.length));
      eat.group.rotation.set(-Math.PI / 2, 0, 0);
      c.attach('handR', eat.group);
      c.play('eat', { loop: true, fade: 0.4 });
      await F.sleep(1.3);
      P.heal(val.health);
      P.warmth = clamp(P.warmth + val.warmth);
      F.sfx('item_pickup', { volume: 0.5 });
      G.ui?.notify?.(`Roast ${SPECIES[e.id].name.toLowerCase()}: warmer, ${val.health} health`, 'item');
      G.events.emit('fish:cooked', { id: e.id, w: e.w, health: val.health, warmth: val.warmth });
      await F.sleep(1.4);
    } finally {
      loop?.stop(0.3);
      if (stick) { c.detach(stick.group); stick.dispose(); }
      if (eat) { c.detach(eat.group); eat.dispose(); }
      c.stop(0.5);
      if (!(G.story?.busy || G.cutscenes?.active || G.dialogue?.active)) P.setControl(true);
      F.cooking = false;
    }
    return true;
  };
}
