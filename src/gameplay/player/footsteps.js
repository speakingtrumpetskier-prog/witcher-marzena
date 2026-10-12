// Footfall SFX for the player: one sound per heel strike, by surface.
//
// The locomotion blend tree shares one phase (0 = left heel strike, 0.5 = right), so a strike is
// the phase crossing 0 or 0.5. The sound names come from the audio builder (step_snow, step_ice,
// step_wood, step_road); the player's own sounds are not positional.
import { G } from '../../core/G.js';
import { clamp } from '../../core/util.js';
import { surfaceInfo } from './ground.js';

export class Footsteps {
  constructor(P) {
    this.P = P;
    this.prev = 0;
    this.cool = 0;
  }

  update(dt) {
    const P = this.P;
    const c = P.character;
    const L = c.anim.loco;
    this.cool -= dt;
    const cur = L.phase;
    const prev = this.prev;
    this.prev = cur;
    if (P.mounted || P.state === 'dead' || !P.control) return;
    if (L.wMove < 0.4 || P.loco.speed < 0.7 || c.anim.mode !== 'loco') return;
    const wrapped = cur < prev - 0.5;
    const hitL = wrapped;
    const hitR = !wrapped && prev < 0.5 && cur >= 0.5;
    if (!(hitL || hitR) || this.cool > 0) return;
    this.cool = 0.12;
    const speed = P.loco.speed;
    const vol = clamp(0.32 + (speed / (6.2 * P.loco.legScale)) * 0.62, 0.3, 1);
    const name = surfaceInfo(P.loco.surface).step;
    G.audio?.sfx?.(name, { volume: vol, pitch: 0.94 + Math.random() * 0.12 });
    G.events.emit('player:step', { surface: P.loco.surface, foot: hitR ? 'R' : 'L', speed });
  }
}
