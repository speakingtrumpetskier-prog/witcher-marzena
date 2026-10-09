// Location discovery. Watches the player (or the camera when there is no player) against every LOC
// entry and emits location:enter / location:leave { id }. Entering a `map: true` location also calls
// G.state.discover(id), which the UI turns into a banner and a map icon.
//
//   import { initTracker } from './tracker.js';   // called once from village.js
//   G.world.currentLocations -> Set of LOC ids the viewer is inside right now
//   G.events.on('location:enter', ({ id }) => ...)
//
// Entering uses the LOC radius; leaving uses radius * 1.1 + 2 m so standing on the border never flickers.
import { ORDER } from '../../core/G.js';
import { LOC } from '../layout.js';

let started = false;

export function initTracker(G) {
  if (started) return;
  started = true;
  const inside = new Set();
  G.world.currentLocations = inside;
  let t = 0;
  G.addSystem('location-tracker', (dt) => {
    t -= dt;
    if (t > 0) return;
    t = 0.25;
    const p = G.player?.position || G.camera?.position;
    if (!p) return;
    for (const [id, l] of Object.entries(LOC)) {
      const d = Math.hypot(p.x - l.x, p.z - l.z);
      const was = inside.has(id);
      if (!was && d <= l.r) {
        inside.add(id);
        if (l.map) G.state.discover(id);
        G.events.emit('location:enter', { id });
      } else if (was && d > l.r * 1.1 + 2) {
        inside.delete(id);
        G.events.emit('location:leave', { id });
      }
    }
  }, ORDER.logic + 5);
}
