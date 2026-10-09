// The player: Vesna. G.player (contract: docs/ARCHITECTURE.md "Player").
//
//   G.player.character           the 'vesna' Character          G.player.position / yaw / velocity
//   health, maxHealth, stamina, maxStamina, warmth (0..1), signEnergy (0..1), sign ('ember'|'gale'|'ward')
//   state   'explore' | 'combat' | 'mounted' | 'scripted' | 'dead'      swordDrawn, mounted, target, surface
//   setControl(bool)   false: input-driven movement freezes and the character root is never written
//                      (the story drives it); true: the player resumes from the root's pose
//   teleport(x, z, yaw)            clean snap (resets actions, locomotion, camera)
//   mount() / dismount()           with Kasza (G.horse)
//   damage(amount, { from, knockback, stagger }) -> { result, dealt }     heal(n)
//   isInvulnerable() / isParrying() / isBlocking()      setTarget(enemy | null)      respawn()
// Events: player:swing, player:cast, player:dodge, player:parry, player:block, player:hit,
// player:death, player:respawn, player:draw, player:sheathe, player:drink, player:sign, player:lock,
// player:ward, player:step (see player/moves.js for payloads).
//
// Split across src/gameplay/player/: locomotion.js (movement), moves.js (sword, dodge, parry, signs,
// potion, damage), stats.js (vitals and warmth), footsteps.js, lock.js, ground.js (slopes, grip).
import * as THREE from 'three';
import { G, ORDER } from '../core/G.js';
import { createCharacter } from '../characters/index.js';
import { SPAWN } from '../world/layout.js';
import { clamp } from '../core/util.js';
import { Locomotion } from './player/locomotion.js';
import { Moves } from './player/moves.js';
import { Footsteps } from './player/footsteps.js';
import { initStats, updateStats, applyVitals, TUNE } from './player/stats.js';
import { cycleTarget, isAlive, enemyPos } from './player/lock.js';
import { groundY } from './player/ground.js';

const _v = new THREE.Vector3();

function cameraHeading() {
  G.camera.getWorldDirection(_v);
  return Math.atan2(_v.x, _v.z);
}

class Player {
  constructor() {
    const c = createCharacter('vesna');
    this.character = c;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.loco = new Locomotion(this);
    this.moves = new Moves(this);
    this.steps = new Footsteps(this);
    this.control = true;
    this.dead = false;
    this.state = 'explore';
    this.mounted = false;
    this._mounting = false;
    this.damageMult = 1;
    this.signPower = 1;
    this.invulnerable = false;
    this.autoRespawn = true;
    this.surface = 'snow';
    this.ward = false;
    this.walkToggle = false;
    this.walkCaps = false;
    this._target = null;
    this._swallow = false;
    this._deadT = 0;
    this._idleClip = '';
    this._walkClip = '';
    this._safeT = 0;
    this.lastSafe = { x: 0, z: 0, yaw: 0 };
    initStats(this);
    c.autoGround = true;
    c.ground = (x, z) => groundY(x, z, c.root.position.y);
  }

  get yaw() { return this.mounted && G.horse ? G.horse.yaw : this.loco.yaw; }
  set yaw(v) {
    this.loco.yaw = v;
    if (!this.mounted) this.character.yaw = v;
  }
  get swordDrawn() { return this.character.swordDrawn; }
  get blocking() { return this.moves.isBlocking(); }
  get target() { return G.cameraRig ? G.cameraRig.target : this._target; }

  isInvulnerable() { return this.moves.isInvulnerable(); }
  isParrying() { return this.moves.isParrying(); }
  isBlocking() { return this.moves.isBlocking(); }

  damage(amount, opts = {}) { return this.moves.hurt(amount, opts); }
  heal(n) {
    if (this.dead) return;
    this.health = clamp(this.health + n, 0, this.maxHealth);
  }

  setTarget(t) {
    if (t === this.target) return;
    if (G.cameraRig) G.cameraRig.setTarget(t || null);
    else this._target = t || null;
    G.events.emit('player:lock', { target: t || null });
  }

  mount() { return G.horse?.mount?.(); }
  dismount() { return G.horse?.dismount?.(); }
  dismountInstant() { return G.horse?.dismount?.({ instant: true }); }

  setControl(on) {
    on = !!on;
    if (on === this.control) return;
    this.control = on;
    const c = this.character;
    if (!on) {
      if (!this.mounted) {
        const busy = this.moves.busy || this.moves.upper || this.moves.blocking;
        this.moves.cancelAll();
        if (busy) c.stop(0.15);
        // A drawn sword in a quiet scene would be odd; keep it only when a fight is on.
        if (c.swordDrawn && !G.combat?.inCombat) c._setSword?.(false);
      }
      this.loco.vel.set(0, 0, 0);
      this.loco.speed = 0;
      c.speed = c.targetSpeed = 0;
    } else if (!this.mounted) {
      // Resume from wherever the scene left her.
      this.position.copy(c.root.position);
      this.position.y = groundY(this.position.x, this.position.z, this.position.y);
      this.loco.reset(c.root.rotation.y);
      if (c.anim.mode !== 'loco') c.stop(0.25);
    }
    G.events.emit('player:control', { control: on });
  }

  teleport(x, z, yaw = this.yaw) {
    if (this.mounted) this.dismountInstant();
    const c = this.character;
    this.moves.cancelAll();
    this.loco.reset(yaw);
    this.position.set(x, groundY(x, z), z);
    c.setPosition(x, z, this.position.y);
    c.yaw = yaw;
    c.stop(0.1);
    c.stopUpper(0);
    c.speed = c.targetSpeed = 0;
    this.velocity.set(0, 0, 0);
    this.lastSafe = { x, z, yaw };
    this.loco.refreshSurface();
    G.cameraRig?.snapBehind?.(yaw);
  }

  async respawn() {
    if (this._respawning) return;
    this._respawning = true;
    G.events.emit('player:respawn_begin', {});
    try {
      if (G.ui?.fade && !G.shot) await G.ui.fade(1, 0.9);
      let placed = false;
      if (G.story?.load && G.state?.hasSave?.() && !G.shot) {
        try { placed = !!G.story.load(); } catch { placed = false; }
      }
      const s = this.lastSafe;
      this.dead = false;
      this.state = 'explore';
      this.exhausted = false;
      if (!placed) this.teleport(s.x, s.z, s.yaw);
      else this.character.stop(0);
      this.health = this.maxHealth * 0.6;
      this.stamina = this.maxStamina;
      this.signEnergy = 1;
      this.warmth = Math.max(this.warmth, 0.6);
      this.moves.mercy = 1.5;
      this.character.setLocomotion(0);
      G.events.emit('player:respawn', { x: this.position.x, z: this.position.z });
      if (G.ui?.fade && !G.shot) await G.ui.fade(0, 1.2);
    } finally {
      this._respawning = false;
    }
  }

  _deriveState() {
    if (this.dead) return 'dead';
    if (!this.control) return 'scripted';
    if (this.mounted || this._mounting) return 'mounted';
    if (this.character.swordDrawn && (this.target || G.combat?.inCombat || this.moves.combatRecent)) return 'combat';
    return 'explore';
  }

  // ---- logic system (ORDER.logic) ----------------------------------------------------------------
  update(dt) {
    const inp = G.input;
    const c = this.character;
    const loco = this.loco;
    this.state = this._deriveState();

    if (this.dead) {
      this._deadT += dt;
      if (this._deadT > 3.4 && this.autoRespawn && !this._respawning) this.respawn();
      this.moves.update(dt, { enabled: false });
      this._writeCharacter();
      updateStats(this, dt);
      return;
    }

    if (!this.control) {
      // The story drives the root. Follow it so everyone reading G.player stays correct.
      if (!this.mounted) {
        this.position.copy(c.root.position);
        loco.yaw = c.root.rotation.y;
      }
      this.moves.update(dt, { enabled: false });
      updateStats(this, dt);
      return;
    }

    const enabled = inp.context === 'game';
    const camYaw = G.cameraRig ? G.cameraRig.yaw : cameraHeading();

    // Camera-relative input direction.
    let dirX = 0, dirZ = 0, mag = 0;
    if (enabled && !this.mounted) {
      const mv = inp.move;
      mag = Math.min(1, Math.hypot(mv.x, mv.y));
      if (mag > 0.001) {
        const s = Math.sin(camYaw), k = Math.cos(camYaw);
        dirX = s * mv.y - k * mv.x;
        dirZ = k * mv.y + s * mv.x;
        const l = Math.hypot(dirX, dirZ) || 1;
        dirX /= l; dirZ /= l;
      }
    }

    // Lock-on: T or middle mouse cycles; with nothing to lock it recenters the camera behind her.
    if (enabled && !this.mounted && inp.pressed('lock')) {
      const next = cycleTarget(this.position, camYaw, this.target);
      if (next || this.target) this.setTarget(next);
      else G.cameraRig?.recenter?.();
    }
    if (this.target && (!isAlive(this.target) || enemyDist(this.target, this.position) > 40)) this.setTarget(null);

    loco.walk = this.walkToggle || this.walkCaps;
    const ctx = { enabled, camYaw, dirX, dirZ, mag, swallowClick: this._swallow };
    this._swallow = false;
    const out = this.moves.update(dt, ctx);

    if (!this.mounted && !this._mounting) {
      if (!out.owns) {
        const wantSprint = enabled && inp.down('sprint') && !this.exhausted && this.stamina > 0.5 && !out.noSprint;
        let face = out.face;
        if (face == null && this.target && isAlive(this.target)) {
          const p = enemyPos(this.target);
          face = Math.atan2(p.x - this.position.x, p.z - this.position.z);
        }
        const armed = c.swordDrawn && !this.moves.isBlocking() ? 0.93 : 1;
        loco.update(dt, { dirX, dirZ, mag, sprint: wantSprint, speedMul: out.speedMul * armed, face });
        if (loco.sprinting) {
          this.stamina = Math.max(0, this.stamina - TUNE.sprintDrain * dt);
          this._s.staminaWait = TUNE.staminaDelay;
          if (this.stamina <= TUNE.exhaustedBelow) this.exhausted = true;
        }
      } else {
        loco.sprinting = false;
        loco.speed = Math.hypot(loco.vel.x, loco.vel.z);
        this.velocity.set(loco.vel.x, 0, loco.vel.z);
      }
      this._idleClips();
      this._writeCharacter(mag > 0.2);
    }

    // Remember a safe spot for respawns.
    this._safeT -= dt;
    if (this._safeT <= 0 && this.state === 'explore' && !this.mounted) {
      this._safeT = 4;
      this.lastSafe = { x: this.position.x, z: this.position.z, yaw: loco.yaw };
    }
    updateStats(this, dt);
  }

  // Pick the idle and walk clips for the stance: guard when fighting, huddled when cold.
  _idleClips() {
    const c = this.character;
    const fighting = c.swordDrawn && this.state === 'combat';
    const idle = fighting ? 'combat_idle' : this.warmth < 0.3 ? 'idle_cold' : 'idle';
    const walk = !c.swordDrawn && this.warmth < 0.25 ? 'walk_cold' : 'walk';
    if (idle !== this._idleClip || walk !== this._walkClip) {
      this._idleClip = idle; this._walkClip = walk;
      c.locoSet({ idle, walk });
    }
  }

  _writeCharacter(hasInput = false) {
    const c = this.character, loco = this.loco;
    if (this.mounted || this._mounting) return;
    c.root.position.copy(this.position);
    c.root.rotation.y = loco.yaw;
    if (this.dead || this.moves.act) {
      c.speed = c.targetSpeed = 0;
      return;
    }
    // Animation speed follows the real speed; a big turn on the spot shuffles the feet a little.
    let v = loco.speed;
    if (v < 0.4) v = Math.max(v, Math.min(0.55, Math.abs(loco.yawRate) * 0.11));
    c.speed = c.targetSpeed = v;
    // A clip someone else started (examine, drink at a fire) plays out; moving cancels it.
    if (hasInput && c.anim.mode !== 'loco' && !this.moves.act && !this.moves.upper && !this._mounting) c.anim.toLoco(0.2);
  }

  // ---- late system (after characters): sync, footsteps, shared uniforms --------------------------
  late(dt) {
    const H = G.horse;
    if (this.mounted && H?.root) {
      this.position.copy(H.root.position);
      this.velocity.set(0, 0, 0).addScaledVector(_v.set(Math.sin(H.yaw), 0, Math.cos(H.yaw)), H.speed || 0);
    }
    if (!this.dead) this.steps.update(dt);
    G.uniforms.uPlayerPos.value.copy(this.position);
    const A = G.atmosphere;
    if (A?.shadowFocus) {
      const yaw = G.cameraRig ? G.cameraRig.yaw : cameraHeading();
      A.shadowFocus.set(this.position.x + Math.sin(yaw) * 8, this.position.y, this.position.z + Math.cos(yaw) * 8);
    }
  }
}

function enemyDist(e, pos) {
  const p = enemyPos(e);
  return Math.hypot(p.x - pos.x, p.z - pos.z);
}

export async function init(G_) {
  const P = new Player();
  G_.player = P;
  if (G_.world && !G_.world.fires) G_.world.fires = []; // locations push { x, z, r } for hearths and campfires
  const c = P.character;
  G_.scene.add(c.root);
  const sp = SPAWN.villageGate;
  P.teleport(sp.x, sp.z, sp.yaw);
  c.stopUpper(0);

  G_.addSystem('player', (dt) => P.update(dt), ORDER.logic);
  G_.addSystem('player-late', (dt) => P.late(dt), ORDER.characters + 2);

  // Persistence: G.state.data.vitals is kept current by updateStats; restore on load, refill on reset.
  G_.events.on('loaded', () => applyVitals(P, G_.state.data.vitals));
  G_.events.on('reset', () => { applyVitals(P, null); P.dead = false; });

  // Walk toggle: CapsLock follows the real lock state, Alt toggles. Click on the canvas takes the mouse.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'CapsLock') P.walkCaps = !!e.getModifierState?.('CapsLock');
    else if ((e.code === 'AltLeft' || e.code === 'AltRight') && !e.repeat) { P.walkToggle = !P.walkToggle; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'CapsLock') P.walkCaps = !!e.getModifierState?.('CapsLock');
  });
  G_.renderer.domElement.addEventListener('mousedown', (e) => {
    G_.audio?.unlock?.();
    if (e.button !== 0 || G_.input.locked || G_.shot) return;
    if (G_.input.context !== 'game' || G_.cameraOwner !== 'rig' || G_.ui?.menuOpen || G_.story?.busy || !P.control) return;
    G_.input.requestLock();
    P._swallow = true; // the click that took the mouse is not an attack
  });

  // Breath puffs in the cold (optional: needs the props FX pool).
  if (G_.quality !== 'low') {
    import('../world/props/fx.js').then(({ fx }) => {
      try {
        P._breath = fx.breath({
          position: [0, 0.02, 0.11], parent: c.bones.head, size: 1,
          getSpeed: () => (P.mounted ? (G_.horse?.speed ?? 0) * 0.5 : P.loco.speed),
        });
      } catch (err) { console.warn('[player] breath fx unavailable', err.message); }
    }).catch(() => {});
  }
}

