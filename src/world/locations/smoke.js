// Shared chimney and campfire smoke with a live-emitter budget. Every location that wants a smoke
// column calls G.world.addSmoke instead of fx.smoke directly; only the nearest MAX columns keep spawning
// particles (the rest idle and let their old puffs fade), so 60 chimneys cost the same as 40.
//
//   const h = G.world.addSmoke([x, y, z] | Vector3, { height, rate, size, opacity, color, warm });
//   h.setRate(x)   h.remove()   h.emitter
//   G.world.smokeStats()  -> { total, live }
import * as THREE from 'three';
import { ORDER } from '../../core/G.js';

const MAX_LIVE = 40;
const RANGE = 220;

export function installSmoke(G, fx) {
  if (G.world.addSmoke) return G.world.addSmoke;
  const items = [];
  let t = 0;
  const cam = new THREE.Vector3();
  G.addSystem('smoke-budget', (dt) => {
    t -= dt;
    if (t > 0 || !items.length) return;
    t = 0.5;
    const p = G.player?.position || G.camera?.position;
    if (!p) return;
    cam.copy(p);
    for (const it of items) it.d = Math.hypot(it.x - cam.x, it.z - cam.z);
    const order = [...items].sort((a, b) => a.d - b.d);
    order.forEach((it, i) => {
      const want = i < MAX_LIVE && it.d < RANGE;
      if (want !== it.on) { it.on = want; it.emitter.setActive(want); }
    });
  }, ORDER.logic + 20);

  G.world.addSmoke = (pos, o = {}) => {
    const f = fx || G.world.fx;
    if (!f) return null;
    const a = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
    const emitter = f.smoke({ position: a, parent: G.scene, height: 22, rate: 1.4, ...o });
    const it = { emitter, x: a[0], z: a[2], d: 0, on: true };
    items.push(it);
    return {
      emitter,
      setRate: (r) => { emitter.rate = r; },
      remove: () => { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); emitter.dispose(); },
    };
  };
  G.world.smokeStats = () => ({ total: items.length, live: items.filter((i) => i.on).length });
  return G.world.addSmoke;
}
