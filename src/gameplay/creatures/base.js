// Creature base class: what every enemy shares. Position and facing on the ground, a body capsule
// (radius, height), health, knockback and hit-stop handling, helpers to read the player, and the
// registration contract with G.combat.
//
//   class Wolf extends Creature { ... }       super(kind, { root, radius, height, health, name, material })
//   c.update(dt)                              called by G.creatures each frame (ORDER.ai)
//   c.takeHit(hit) -> { hit, damage, killed } the combat module calls this for sword blows and signs
//   c.onSign(sign, info)                      Ember / Gale contact (optional override)
//   c.onParried(player)                       Player.damage calls this when Vesna parries our blow
//   c.dispose()
// Contract with G.combat (docs/ARCHITECTURE.md): root, position, radius, height, health, maxHealth, alive,
// faction ('hostile' | 'friendly'), takeHit(hit). Extras used here: engaged (in the fight, drives combat
// music and the HUD), name, material ('flesh' | 'straw' | 'ice' | 'frost'), hitCenter(out), isBoss.
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { clamp, wrapAngle } from '../../core/util.js';

const _a = new THREE.Vector3();

export class Creature {
  constructor(kind, o = {}) {
    this.kind = kind;
    this.faction = o.faction || 'hostile';
    this.name = o.name || '';
    this.root = o.root || new THREE.Group();
    this.position = this.root.position;
    this.radius = o.radius ?? 0.5;
    this.height = o.height ?? 1.2;
    this.maxHealth = o.health ?? 50;
    this.health = this.maxHealth;
    this.alive = true;
    this.material = o.material || 'flesh';
    this.engaged = false;
    this.hitStopT = 0;
    this.vel = new THREE.Vector3(); // knockback and external pushes (m/s)
    this.heading = 0; // facing (radians, 0 looks along +Z); root.rotation.y follows
    this.t = 0; // own clock
    this.disposed = false;
    this.pushable = o.pushable ?? 1;
  }

  // ---- time ---------------------------------------------------------------------------------------
  // Hit-stop: while the freeze timer runs the creature's own clock crawls.
  tick(dt) {
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      dt *= 0.03;
    }
    this.t += dt;
    return dt;
  }

  // ---- player helpers -----------------------------------------------------------------------------
  get player() { return G.player; }
  playerAlive() { const P = G.player; return !!P && !P.dead && P.state !== 'dead'; }
  toPlayer(out = {}) {
    const P = G.player;
    if (!P) { out.dx = out.dz = out.d = 0; out.yaw = this.heading; return out; }
    out.dx = P.position.x - this.position.x;
    out.dz = P.position.z - this.position.z;
    out.d = Math.hypot(out.dx, out.dz);
    out.yaw = Math.atan2(out.dx, out.dz);
    return out;
  }

  // ---- movement -----------------------------------------------------------------------------------
  groundAt(x, z) {
    return G.world ? G.world.heightAt(x, z) : 0;
  }

  turnToward(yaw, rate, dt) {
    const e = wrapAngle(yaw - this.heading);
    this.heading = wrapAngle(this.heading + clamp(e, -rate * dt, rate * dt));
    return e;
  }

  // Displace on the ground with static collision. Returns the distance moved.
  step(dx, dz, radius = this.radius * 0.8) {
    const p = this.position;
    const ox = p.x, oz = p.z;
    p.x += dx; p.z += dz;
    if (G.physics) G.physics.resolve(p, radius);
    p.y = this.groundAt(p.x, p.z);
    return Math.hypot(p.x - ox, p.z - oz);
  }

  // Push apart from other live creatures so packs do not stack.
  separate(list, dt, strength = 4) {
    for (const o of list) {
      if (o === this || !o.alive || o.disposed) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const min = (this.radius + o.radius) * 0.95;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const k = (min - d) / d * strength * dt;
        this.position.x += dx * k; this.position.z += dz * k;
      }
    }
  }

  // Keep out of the player's body (the player pushes out of us too; this keeps AI from nesting).
  keepOffPlayer(minDist) {
    const P = G.player;
    if (!P) return;
    const dx = this.position.x - P.position.x, dz = this.position.z - P.position.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist && d > 1e-4) {
      const k = (minDist - d) / d;
      this.position.x += dx * k * 0.5; this.position.z += dz * k * 0.5;
    }
  }

  // Apply and decay the knockback velocity.
  applyKnock(dt, damp = 6) {
    const v = this.vel;
    if (v.x * v.x + v.z * v.z > 1e-4) {
      this.step(v.x * dt, v.z * dt);
      const k = Math.exp(-damp * dt);
      v.x *= k; v.z *= k;
    }
  }

  hitCenter(out = _a.clone()) {
    out.set(this.position.x, this.position.y + this.height * 0.5, this.position.z);
    return out;
  }

  // ---- sound --------------------------------------------------------------------------------------
  sfx(name, o = {}) {
    G.audio?.sfx?.(name, { pos: this.position, ...o });
  }

  // ---- combat contract ----------------------------------------------------------------------------
  takeHit() { return { hit: false, damage: 0, killed: false }; }
  onSign() { return false; }
  onParried() {}

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.engaged = false;
    this.health = 0;
    G.combat?._died?.(this);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    this.engaged = false;
    G.combat?.unregister?.(this);
    this.root.parent?.remove(this.root);
  }
}
