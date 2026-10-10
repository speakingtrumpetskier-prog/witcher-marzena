// Cutting a hole at a thin spot with the sword (the one by the bell tower, for the old pike): she kneels, draws the sword,
// drives the point into the ice six times, the crack widening to a hole with each blow, and puts the sword away.
//
//   F.cutHole(spotOrId) -> Promise<bool>    walks to the spot, does it, gives back control
import { fx } from '../../world/props/fx.js';

export function installCut(F) {
  const G = F.G;
  const BLOWS = 6;

  F.cutHole = async (spotOrId) => {
    const spot = typeof spotOrId === 'string' ? F.spot(spotOrId) : spotOrId;
    if (!spot?.thin || spot.open || F.cutting || F.active || F.cooking) return false;
    const P = G.player, c = P.character;
    F.cutting = true;
    P.setControl(false);
    let off = null;
    try {
      const { cutAt, hole } = spot;
      const yaw = Math.atan2(hole.x - cutAt.x, hole.z - cutAt.z);
      await c.walkTo(cutAt.x, cutAt.z, { face: yaw, stopDist: 0.08, speed: 1.4 });
      c.yaw = yaw;
      await c.drawSword(c.swordKind || (G.state.flag('wit_sword') ? 'silver' : 'steel'));
      spot.cutStart();
      let blows = 0;
      off = c.onEvent((name) => {
        if (name !== 'hit' || blows >= BLOWS) return;
        blows++;
        F.sfx('hole_chip', { pos: { x: hole.x, y: 0.2, z: hole.z }, volume: 1 });
        fx.burst('ice', [hole.x, 0.12, hole.z], { count: 16, speed: 2.4, up: 1.1, size: 0.1 });
        spot.cutTo(blows / BLOWS);
        G.cameraRig?.shake?.(0.1, 0.18);
        F.rumble(0.3, 0.4, 90);
      });
      c.play('chip_ice', { loop: true, fade: 0.4 });
      const t0 = F.clock;
      while (blows < BLOWS && F.clock - t0 < 14) await F.sleep(0.1);
      off();
      off = null;
      c.sheatheSword();
      await F.sleep(0.9);
      spot.cutDone();
      F.sfx('splash_small', { pos: { x: hole.x, y: 0, z: hole.z }, volume: 0.9 });
      fx.burst('ice', [hole.x, 0.1, hole.z], { count: 22, speed: 2.8, up: 1.2, size: 0.12 });
      await F.sleep(0.8);
      G.events.emit('fish:cut', { spot: spot.id });
      return true;
    } finally {
      off?.();
      if (c.swordDrawn && !G.combat?.inCombat) c._setSword?.(false);
      c.stop(0.5);
      if (!(G.story?.busy || G.cutscenes?.active || G.dialogue?.active)) P.setControl(true);
      F.cutting = false;
    }
  };
}
