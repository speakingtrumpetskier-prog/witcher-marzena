// src/game/entities.js
// Lightweight entity system for predictable update loop.
// Entities: anything in the scene that updates each frame (NPCs, particles, interactables).
// Update order: entity.update(dt, ctx) runs before render.

import * as THREE from "three";

/**
 * @typedef {Object} UpdateCtx
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.Box3[]} colliders
 * @property {number} time - elapsed seconds
 */

export class EntityManager {
  constructor() {
    /** @type {Entity[]} */
    this.entities = [];
  }

  /** @param {Entity} entity */
  add(entity) {
    this.entities.push(entity);
    return entity;
  }

  /** @param {string} id */
  remove(id) {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const [entity] = this.entities.splice(idx, 1);
      entity.dispose?.();
      if (entity.object?.parent) entity.object.parent.remove(entity.object);
    }
  }

  /** @param {string} id */
  get(id) {
    return this.entities.find((e) => e.id === id) || null;
  }

  /**
   * Update all entities.
   * @param {number} dt - delta time in seconds
   * @param {UpdateCtx} ctx
   */
  update(dt, ctx) {
    for (const entity of this.entities) {
      entity.update(dt, ctx);
    }
  }

  /** Get all entities */
  list() {
    return this.entities;
  }

  /** Dispose all entities */
  dispose() {
    for (const entity of this.entities) {
      entity.dispose?.();
    }
    this.entities.length = 0;
  }
}

/**
 * An entity wrapping an animated glTF model.
 * Handles animation mixing, waypoint patrol, and simple collision avoidance.
 */
export class AnimatedModelEntity {
  /**
   * @param {string} id
   * @param {THREE.Object3D} root
   * @param {THREE.AnimationClip[]} [clips]
   */
  constructor(id, root, clips) {
    this.id = id;
    this.object = root;

    this.mixer = null;
    this.actions = new Map();

    if (clips && clips.length) {
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of clips) {
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      }
    }

    this.velocity = new THREE.Vector3();
    this.speed = 1.2;

    // Waypoint patrol AI
    this.waypoints = [];
    this.waypointIndex = 0;
    this.arriveRadius = 0.4;
    this.idleTimer = 0;
  }

  /**
   * Cross-fade to a named animation clip.
   * @param {string} name
   * @param {number} [fade=0.2]
   */
  play(name, fade = 0.2) {
    if (!this.mixer) return;
    const action = this.actions.get(name);
    if (!action) return;

    for (const a of this.actions.values()) {
      if (a === action) continue;
      a.fadeOut(fade);
    }
    action.reset().fadeIn(fade).play();
  }

  /**
   * Set patrol waypoints for simple AI movement.
   * @param {THREE.Vector3[]} points
   */
  setPatrol(points) {
    this.waypoints = points;
    this.waypointIndex = 0;
  }

  /**
   * @param {number} dt
   * @param {UpdateCtx} ctx
   */
  update(dt, ctx) {
    // Simple waypoint patrol with idle pauses
    if (this.waypoints.length) {
      if (this.idleTimer > 0) {
        this.idleTimer -= dt;
        this.velocity.set(0, 0, 0);
        this.play("Idle");
      } else {
        const target = this.waypoints[this.waypointIndex];
        const pos = this.object.position;
        const toTarget = new THREE.Vector3().subVectors(target, pos);
        const dist = toTarget.length();

        if (dist < this.arriveRadius) {
          this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
          this.idleTimer = 0.8 + Math.random() * 1.6;
        } else {
          toTarget.normalize();
          this.velocity.copy(toTarget).multiplyScalar(this.speed);

          // Face movement direction
          const yaw = Math.atan2(this.velocity.x, this.velocity.z);
          this.object.rotation.y = yaw;

          // Move with simple collision avoidance
          const next = pos.clone().addScaledVector(this.velocity, dt);
          if (!collides(next, ctx.colliders)) {
            pos.copy(next);
          } else {
            // Try sidestep
            const right = new THREE.Vector3(this.velocity.z, 0, -this.velocity.x).normalize();
            const alt = pos.clone().addScaledVector(right, dt * this.speed);
            if (!collides(alt, ctx.colliders)) pos.copy(alt);
          }

          this.play("Walk");
        }
      }
    }

    this.mixer?.update(dt);
  }

  dispose() {
    this.mixer?.stopAllAction();
  }
}

/**
 * A simple static entity (interactable, trigger zone, audio emitter, etc.)
 * Override the update method for custom behavior.
 */
export class StaticEntity {
  /**
   * @param {string} id
   * @param {THREE.Object3D} object
   */
  constructor(id, object) {
    this.id = id;
    this.object = object;
  }

  update(/* dt, ctx */) {
    // Override for custom behavior (bobbing, rotation, proximity checks, etc.)
  }

  dispose() {}
}

function collides(point, boxes) {
  for (const b of boxes) {
    if (b.containsPoint(point)) return true;
  }
  return false;
}
