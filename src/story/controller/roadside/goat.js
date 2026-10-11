// The strayed goat (side_goat, "The Strayed Goat"). Zofia stands outside the west gate by day: her goat got through the fence and
// she thinks it went for the grass under the corkscrew pines past the marsh. The goat is there, trailing a rope. Take the rope and
// she follows on it (walks in Vesna's own footsteps, so trees and houses are no trouble), then hand her over at the gate for three
// eggs. After that Zofia stands at the gate with the goat at her feet on a short rope, and villagers mention it.
// The two ends can be found in either order.
//
//   where   the goat: the corkscrew grove on the south edge of the marsh (-259, 20);  Zofia: beside the pass road at the west gate
//   when    7:30 to 18:30 for the goat, 7:00 to 20:30 for Zofia, any weather but a blizzard
//   flags   goat_asked (she said she would look), goat_tied (the goat is on the rope: not kept across a load), goat_home
//   state   C.roadside.goat { goat, tether, owner, grove, gate, zones }
import * as THREE from 'three';
import { ropeLine } from './things.js';
import { SPECS } from './people.js';

const GOAT_WINDOW = [7.5, 18.5], OWNER_WINDOW = [7.0, 20.5];
const GROVE = { x: -259, z: 20 };

export function install(C, K) {
  const { G, S } = C;
  const hero = G.vegetation?.rare?.heroes?.find((h) => h.id === 'cork_a');
  const grove = K.openSpot((hero?.x ?? GROVE.x) + 2.4, (hero?.z ?? GROVE.z) + 1.6, { rad: 1.1, maxR: 9, maxSlope: 0.7 });
  const gate = K.road('pass', 684, 4.6);
  const st = { goat: null, tether: null, owner: null, grove, gate, home: false };
  C.roadside.goat = st;
  const inWindow = (w) => C.hour() >= w[0] && C.hour() < w[1] && G.weather?.state !== 'blizzard';
  const animals = () => G.npcs?.animals;

  // ---- the goat ---------------------------------------------------------------------------------
  function spawnGoat(x, z, yaw = 0) {
    const g = animals()?.spawn('goat', x, z, { static: true, seed: 3, yaw, r: 3 });
    if (!g) return null;
    g.static = true; // nothing here walks by the village nav grid: she is on her own feet or on a rope
    g.update = update;
    return g;
  }
  function removeGoat() {
    const g = st.goat;
    st.goat = null;
    if (g && !g.disposed) animals()?.remove?.(g);
  }

  // Her own update: follows Vesna's trail while tethered, stands and chews otherwise.
  const _hand = new THREE.Vector3(), _neck = new THREE.Vector3();
  function update(dt) {
    const g = st.goat;
    if (!g || g.disposed) return;
    g.tick(dt, null);
    const T = st.tether;
    const q = g.q;
    let moving = false;
    if (T) {
      const P = C.ppos();
      let tx = P.x, tz = P.z, acc = 0, px = P.x, pz = P.z;
      for (let i = T.trail.length - 1; i >= 0; i--) {
        const p = T.trail[i];
        acc += Math.hypot(p.x - px, p.z - pz);
        px = p.x; pz = p.z; tx = p.x; tz = p.z;
        if (acc >= 2.0) break;
      }
      const dp = Math.hypot(P.x - g.x, P.z - g.z);
      if (dp > 2.7) { g.stepTo(tx, tz, Math.min(5.6, 0.9 + dp * 1.5), dt, 7); moving = true; } else {
        g.targetSpeed = 0;
        g.yaw += (Math.atan2(P.x - g.x, P.z - g.z) - g.yaw) * Math.min(1, dt * 2.5);
      }
    } else if (st.toOwner) {
      const o = st.toOwner;
      const arrived = g.stepTo(o.x, o.z, 1.6, dt, 6) === 1;
      moving = !arrived;
      if (arrived) { st.toOwner = null; o.done?.(); }
    } else g.targetSpeed = 0;
    g.speed += (g.targetSpeed - g.speed) * Math.min(1, dt * 6);
    q.setPose?.('stand');
    q.update(dt, g.speed, { chew: !moving, t: g.t, sway: 0.2 });
    g.place();
    // the rope follows the goat's neck
    if (st.rope) {
      const h = st.ropeHand?.() || null;
      if (h) {
        _neck.set(g.x + Math.sin(g.yaw) * 0.32, g.y + 0.62, g.z + Math.cos(g.yaw) * 0.32);
        st.rope.update(h, _neck, 0.2);
      }
    }
  }

  // ---- the rope ---------------------------------------------------------------------------------
  function makeRope(handFn) {
    st.rope = ropeLine(6, 0.012);
    G.scene.add(st.rope);
    st.ropeHand = handFn;
  }
  function dropRope() {
    if (!st.rope) return;
    G.scene.remove(st.rope);
    st.rope.dispose?.();
    st.rope = null;
    st.ropeHand = null;
  }
  const playerHand = () => {
    const h = G.player?.character?.sockets?.handL;
    return h ? h.getWorldPosition(_hand) : null;
  };

  function startTether() {
    const g = st.goat;
    const trail = [{ x: C.ppos().x, z: C.ppos().z }];
    const T = { trail, far: 0 };
    st.tether = T;
    makeRope(playerHand);
    C.set('goat_tied');
    let last = trail[0];
    const off = G.addSystem('rs:goat-tether', (dt) => {
      const P = C.ppos();
      if (Math.hypot(P.x - last.x, P.z - last.z) > 0.7) {
        last = { x: P.x, z: P.z };
        trail.push(last);
        if (trail.length > 26) trail.shift();
      }
      // left far behind: the rope comes off and she stays where she is
      const d = Math.hypot(P.x - g.x, P.z - g.z);
      T.far = d > 18 ? T.far + dt : 0;
      if (T.far > 5 && !G.story?.busy) lose();
    }, 25);
    T.off = off;
  }
  function endTether() {
    const T = st.tether;
    if (!T) return;
    T.off?.();
    st.tether = null;
    dropRope();
  }
  function lose() {
    endTether();
    C.set('goat_tied', false);
    K.say('Left her behind.', 2.2);
    retire();
  }
  // A goat left standing somewhere is taken away again once she is well out of sight.
  function retire() {
    C.later(30, () => {
      if (!st.goat || st.tether || st.toOwner || C.has('goat_home')) return;
      if (C.dist(st.goat.x, st.goat.z) > 70) removeGoat(); else retire();
    });
  }

  // ---- the grove: take the rope ----------------------------------------------------------------------
  C.interact({
    id: 'goat_take', radius: 2.4, verb: 'Take', label: 'The goat on a rope',
    pos: () => (st.goat && !st.goat.disposed ? _neck.set(st.goat.x, st.goat.y + 0.7, st.goat.z) : null),
    enabled: () => !!st.goat && !st.goat.disposed && !st.tether && !st.toOwner && !C.has('goat_home'),
    onUse: async () => {
      const P = G.player;
      P.setControl(false);
      try {
        P.character.play('crouch_examine', { loop: false, fade: 0.25 });
        await C.sleep(0.9);
        C.sfx('goat', { pos: st.goat ? { x: st.goat.x, y: st.goat.y + 0.6, z: st.goat.z } : undefined, volume: 0.6 });
      } finally { P.setControl(true); }
      if (!st.goat) return;
      K.begin('side_goat', { quiet: false });
      startTether();
      K.say('Come on, then.', 2);
    },
  });

  st.groveZone = K.zone({
    id: 'goat_grove', x: grove.x, z: grove.z, r: 60,
    enabled: () => !C.has('goat_home') && !st.tether && inWindow(GOAT_WINDOW),
    build(bag) {
      if (st.goat) return;
      st.goat = spawnGoat(grove.x, grove.z, 2.2);
      bag.onFree(() => { if (st.goat && !st.tether && !st.toOwner) removeGoat(); });
    },
  });

  // ---- the gate: Zofia ---------------------------------------------------------------------------------
  // The owner side: with the goat on the rope behind Vesna the talk ends at 'pay'; Zofia takes the rope.
  async function talkOwner(bag, c) {
    const r = await C.talk('rs_goat_owner', { actors: { goat_owner: c } });
    if (C.has('goat_asked')) K.begin('side_goat', { quiet: false });
    if (r?.end !== 'pay') return;
    await handOver(bag, c);
  }
  async function handOver(bag, c) {
    bag.busy = true;
    try {
      const g = st.goat;
      endTether();
      // she takes the rope; the goat goes to her side
      const hand = () => c.sockets?.handL?.getWorldPosition(_hand) || null;
      makeRope(hand);
      const side = { x: c.root.position.x + Math.cos(c.yaw) * 0.9 + Math.sin(c.yaw) * 0.5, z: c.root.position.z - Math.sin(c.yaw) * 0.9 + Math.cos(c.yaw) * 0.5 };
      let arrived = false;
      st.toOwner = { x: side.x, z: side.z, done: () => { arrived = true; } };
      await C.until(() => arrived || !g || g.disposed, 12, 0.2);
      C.set('goat_tied', false);
      C.set('goat_home');
      S.give('egg', 3, true);
      C.sfx('item_pickup', { volume: 0.7 });
      C.notify('Three eggs', 'item');
      C.sfx('goat', { volume: 0.5, pos: g ? { x: g.x, y: g.y + 0.6, z: g.z } : undefined });
    } finally { bag.busy = false; }
  }

  st.gateZone = K.zone({
    id: 'goat_gate', x: gate.x, z: gate.z, r: 55,
    enabled: () => inWindow(OWNER_WINDOW),
    build(bag) {
      const c = bag.char(SPECS.goatOwner(), { x: gate.x, z: gate.z, yaw: Math.atan2(-gate.tx, -gate.tz) + 0.5, anim: 'cross_arms', lowDetail: false });
      st.owner = c;
      bag.onFree(() => { if (st.owner === c) st.owner = null; });
      bag.talkTo(c, { id: 'rs_goat_owner', label: 'Zofia', enabled: () => bag.live && !bag.busy, onUse: () => talkOwner(bag, c) });
      // once the goat is home, she stands here with it on a short rope
      if (C.has('goat_home') && !st.goat) {
        const gx = gate.x + Math.cos(c.yaw) * 0.9 + Math.sin(c.yaw) * 0.5, gz = gate.z - Math.sin(c.yaw) * 0.9 + Math.cos(c.yaw) * 0.5;
        st.goat = spawnGoat(gx, gz, c.yaw + 0.4);
        makeRope(() => c.sockets?.handL?.getWorldPosition(_hand) || null);
      }
      bag.onFree(() => { if (C.has('goat_home')) { dropRope(); removeGoat(); } });
      // she looks down the road, and now and then at whoever comes
      bag.system('goat-owner', () => {
        if (G.story?.busy || bag.busy) return;
        if (C.dist(gate.x, gate.z) < 9) c.lookAt(G.player?.character?.bones?.head ?? null); else c.lookAt(null);
      });
    },
  });

  // ---- loads and new games: nothing of the rope survives -----------------------------------------------
  const clear = () => {
    endTether();
    st.toOwner = null;
    dropRope();
    removeGoat();
    if (C.has('goat_tied')) C.set('goat_tied', false);
  };
  C.on('loaded', clear);
  C.on('reset', clear);
  C.on('player:respawn', () => { if (st.tether) lose(); });
}
