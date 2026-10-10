// A sled on the bank (side_sled, "A Sled on the Bank"). A boy has dragged firewood across the river ice and the sled has jammed a runner at the
// lip of the bank by the mill. Talk to him, then stand behind it and TAP E to push: every tap shoves the sled up the bank a little, and it
// slips back if you stop. When it is out he takes it home along the mill road, and gives her a grosz.
//
//   where   the south bank of the river by the mill, (322, -60) (the river is flat ice here, the bank rises toward the road)
//   when    9:00 to 16:30, any weather but a blizzard; once (flag sled_freed)
//   flags   sled_met, sled_freed
//   state   C.roadside.sled { site, zone, sled, boy, haul }
import * as THREE from 'three';
import { woodSled } from './things.js';
import { groundPatch, groundRibbon, tex } from '../../../world/locations/wilderness/decals.js';
import { SPECS } from './people.js';

const SITE = { x: 322, z: -60 }, WINDOW = [9, 16.5];
const TAPS = 9;   // shoves to get it out
const SHOVE = 0.3; // metres up the bank per tap

export function install(C, K) {
  const { G, S } = C;
  const yaw = 0.1; // the nose points up the bank, toward the road (south)
  const st = { site: SITE, zone: null, sled: null, boy: null, haul: null, yaw };
  C.roadside.sled = st;
  const open = () => C.hour() >= WINDOW[0] && C.hour() < WINDOW[1] && G.weather?.state !== 'blizzard';

  async function push(bag, boy, sled) {
    const P = G.player;
    bag.busy = true;
    try {
      // behind the sled, hands on it
      const sx = Math.sin(yaw), sz = Math.cos(yaw);
      const bx = SITE.x - sx * 1.55, bz = SITE.z - sz * 1.55;
      C.place(bx, bz, yaw);
      P.setControl(false);
      const pc = P.character;
      pc.play('lean_wall', { loop: true, fade: 0.3 });
      boy.play('carry_pole', { loop: true, fade: 0.3 });
      C.hint([['E', 'Tap to push']], 8);
      let p = 0, t = 0, idle = 0;
      const ok = await new Promise((resolve) => {
        const off = G.addSystem('rs:sled-push', (dt) => {
          t += dt;
          if (G.input.pressed('interact')) {
            p = Math.min(1, p + 1 / TAPS);
            idle = 0;
            C.sfx('step_snow', { volume: 0.7 });
            G.cameraRig?.shake?.(0.05, 0.12);
          } else {
            idle += dt;
            if (idle > 0.9) p = Math.max(0, p - dt * 0.1); // she lets up and it slides back
          }
          sled.setPush(p);
          st.push = { p, t, idle };
          K.settle(sled.root, SITE.x + sx * SHOVE * TAPS * p, SITE.z + sz * SHOVE * TAPS * p, yaw, 1.8, 0.7);
          if (p >= 1) { off(); resolve(true); } else if (t > 26 || (t > 8 && p <= 0.001 && idle > 5)) { off(); resolve(false); }
        }, 24);
      });
      G.ui?.hint?.(null);
      pc.play('idle', { fade: 0.3 });
      return ok;
    } finally {
      P.setControl(true);
      bag.busy = false;
    }
  }

  st.zone = K.zone({
    id: 'sled', x: SITE.x, z: SITE.z, r: 70,
    enabled: () => !C.has('sled_freed') && open(),
    build(bag) {
      const sled = woodSled({ seed: 6 });
      K.settle(sled.root, SITE.x, SITE.z, yaw, 1.8, 0.7);
      bag.mesh(sled.root);
      const colId = bag.box(SITE.x, SITE.z, 0.45, 0.95, yaw, { tag: 'sled' });
      const bx = SITE.x + Math.sin(yaw) * 2.6 + 0.35, bz = SITE.z + Math.cos(yaw) * 2.6;
      const boy = bag.char(SPECS.sledBoy(), { x: bx, z: bz, yaw: yaw + 0.15, anim: 'carry_pole', lowDetail: false });
      st.sled = sled;
      st.boy = boy;
      bag.talkTo(boy, {
        id: 'rs_sled_boy', label: 'Boy',
        enabled: () => bag.live && !bag.busy && !st.haul,
        onUse: async () => {
          const r = await C.talk('rs_sled_boy', { actors: { sled_boy: boy } });
          if (C.has('sled_met') && !G.quests.rec('side_sled')) K.begin('side_sled');
          if (r?.end !== 'push') return;
          const ok = await push(bag, boy, sled);
          if (!ok) { K.bark(boy, 'sled_boy', 'Boy', 'Never mind. I will manage.'); boy.play('carry_pole', { loop: true, fade: 0.3 }); return; }
          boy.play('idle', { fade: 0.3 });
          const r2 = await C.talk('rs_sled_boy', { start: 'd1', actors: { sled_boy: boy } });
          if (r2?.end === 'pay') { S.give('coins', 1); C.sfx('coin'); }
          K.finish('sled_freed');
          // home along the mill road, toward the village
          G.physics?.remove(colId);
          const from = boy.root.position;
          const path = [{ x: from.x + 6, z: from.z + 16 }, ...K.roadPath('mill', 372, 100, 8, 1.6)];
          st.haul = K.haul(bag, boy, sled.root, { path, speed: 1.15, gap: 2.5, len: 1.8, wid: 0.7, yaw: yaw, onFree: () => { st.haul = null; } });
        },
      });
      // he is still at it when she comes up
      sled.setPush(0);
    },
  });

  // What the bank keeps: the gouge where the runner went in, and the two grooves of the sled going up to the road.
  K.persist(() => C.has('sled_freed'), () => {
    const g = new THREE.Group();
    g.name = 'rs_sled_marks';
    g.add(groundRibbon(G, { pts: [[SITE.x + 0.2, SITE.z + 0.4], [SITE.x + 2.4, SITE.z + 9], [SITE.x + 6, SITE.z + 18], [SITE.x + 8.5, SITE.z + 29]], width: 1.0, map: tex.drag(7), repeat: 6, lift: 0.04, opacity: 0.85, order: 4, name: 'sledGrooves' }));
    g.add(groundPatch(G, { x: SITE.x + 0.1, z: SITE.z - 0.5, w: 2.0, d: 1.6, yaw, map: tex.blob('rut', { r: 96, g: 100, b: 110, a: 0.8, seed: 3, solid: 0.4 }), lift: 0.035, order: 4, name: 'sledGouge' }));
    return { obj: g, own: false };
  }, ['sled_freed']);
}
