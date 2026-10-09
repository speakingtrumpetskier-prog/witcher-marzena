// Actors for dialogue and cutscenes: a thin, defensive wrapper over a Character (characters
// builder API, see ARCHITECTURE.md "Characters") so scripts never crash on a missing method.
//
//   const stage = new ActorStage(G)
//   const a = stage.get('hanka', { preset: 'hanka', at: [x, z], yaw })   NPC, player, or spawned
//   a.eye(v3)  a.pos(v3)  a.height  a.yaw  a.setPosition(x, z)  a.face(target, { instant })
//   a.play(clip, opts) -> Promise   a.gesture(name)   a.talk(bool)   a.lookAt(target)
//   await a.walkTo(x, z, opts)      a.ghost(true, { color, opacity })    a.show() / a.hide()
//   stage.releaseAll({ keepPersistent })   restores NPC schedules, disposes spawned actors
//
// Lookup order for an id: explicit actors passed in, actors already on stage, 'vesna' = the
// player character, G.npcs.get(id), else spawn createCharacter(preset || id). If the
// characters module is not built yet, G.story.placeholderFactory(preset) is used when a debug
// scene registers one, otherwise an invisible stand-in keeps the script running.
import * as THREE from 'three';
import * as Chars from '../../characters/index.js';
import { dampAngle, wrapAngle } from '../../core/util.js';
import { addCompileHook } from '../../render/Materials.js';

export const GESTURES = new Set(['point', 'shrug', 'nod', 'shake_head', 'wave', 'beckon']);
export const LOOP_POSES = new Set([
  'idle', 'idle_cold', 'cross_arms', 'hands_hips', 'kneel_idle', 'sit_bench', 'sit_ground', 'lie_dead',
  'warm_hands', 'lean_wall', 'pray', 'cry', 'hug', 'carry_torch', 'carry_pole', 'fish_ice', 'mend_net',
  'chop_wood', 'hammer', 'sweep', 'stir', 'child_play', 'combat_idle', 'block_idle', 'ride_idle', 'drown_reach',
]);
const TALK_CLIPS = ['talk_1', 'talk_2', 'talk_3'];

const NAMES = {
  vesna: 'Vesna', ola: 'Ola', hanka: 'Hanka', bogdan: 'Bogdan', dobra: 'Dobra', zbyszek: 'Zbyszek',
  jarek: 'Jarek', wiesia: 'Wiesia', wiesia_ghost: 'Wiesia', miller: 'Gniewko', miller_wife: 'Bożena', narrator: '',
};

export function displayName(G, id) {
  if (!id || id === 'narrator') return '';
  const n = G.npcs?.get?.(id)?.def?.name;
  if (n) return n;
  if (NAMES[id] != null) return NAMES[id];
  return id.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Real characters need both the factory and the running characters system (module loaded).
export function charactersAvailable(G) {
  return typeof Chars.createCharacter === 'function' && !!G.characters && !G.characters.stub;
}

// Spawn a raw character (not wrapped). Returns null if nothing can be made.
export function spawnCharacter(G, preset, opts) {
  if (preset === 'kasza' || preset === 'horse') {
    if (typeof Chars.createHorse === 'function') {
      try { return Chars.createHorse('kasza', opts); } catch (e) { console.error('[story] createHorse', e); }
    }
  } else if (charactersAvailable(G)) {
    try { return Chars.createCharacter(preset, opts); } catch (e) { console.error(`[story] createCharacter(${preset})`, e); }
  }
  if (typeof G.story?.placeholderFactory === 'function') return G.story.placeholderFactory(preset, opts);
  return null;
}

function makeStandIn() {
  const root = new THREE.Group();
  root.name = 'story-standin';
  return { root, height: 1.75, standIn: true, yaw: 0 };
}

const _v = new THREE.Vector3();
let ghostMat = null;

function getGhostMaterial(color = 0x9ff5ff, opacity = 0.42) {
  if (ghostMat) return ghostMat;
  const m = new THREE.MeshLambertMaterial({
    color: 0x0c1c22, emissive: new THREE.Color(color), emissiveIntensity: 0.35,
    transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  m.userData.ghostColor = { value: new THREE.Color(color) };
  addCompileHook(m, 'story-ghost', (shader) => {
    shader.uniforms.uGhostColor = m.userData.ghostColor;
    shader.uniforms.uTime = G_TIME;
    shader.fragmentShader = 'uniform vec3 uGhostColor;\nuniform float uTime;\n' + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float mzRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
      float mzFlick = 0.85 + 0.15 * sin(uTime * 3.1 + vViewPosition.y * 4.0);
      outgoingLight += uGhostColor * (0.25 + mzRim * 1.6) * mzFlick;
      diffuseColor.a = clamp(diffuseColor.a * (0.35 + mzRim * 1.4), 0.0, 1.0);
      #include <opaque_fragment>`,
    );
  });
  ghostMat = m;
  return m;
}
// Shared time uniform, bound on first use (avoids importing G here).
const G_TIME = { value: 0 };

export class Actor {
  constructor(G, id, character, { owned = false, npc = null, persist = false, player = false } = {}) {
    this.G = G;
    this.id = id;
    this.c = character || makeStandIn();
    this.owned = owned;
    this.npc = npc;
    this.persist = persist;
    this.isPlayer = player;
    this.faceYaw = null;
    this.turnRate = 5;
    this.loopPose = null;
    this._ghost = null;
    if (npc) { try { npc.pause?.(true); } catch (e) { console.error(e); } }
  }

  get root() { return this.c.root; }
  get height() { return this.c.height || 1.75; }
  get isChild() { return this.height < 1.5; }
  get yaw() { return this.c.yaw ?? this.c.root.rotation.y; }
  set yaw(v) {
    if ('yaw' in this.c) this.c.yaw = v;
    else this.c.root.rotation.y = v;
  }
  get head() { return this.c.bones?.head || null; }

  pos(out = new THREE.Vector3()) {
    return out.copy(this.c.root.position);
  }

  // World-space eye point: between the eye joints, else from the head joint, else from height.
  eye(out = new THREE.Vector3()) {
    const eL = this.c.bones?.eyeL, eR = this.c.bones?.eyeR;
    if (eL && eR) {
      eL.updateWorldMatrix(true, false);
      eR.updateWorldMatrix(true, false);
      eL.getWorldPosition(out);
      eR.getWorldPosition(_v);
      return out.add(_v).multiplyScalar(0.5);
    }
    const h = this.head;
    if (h) {
      h.updateWorldMatrix(true, false);
      h.getWorldPosition(out);
      const base = this.c.root.position.y;
      // Head joints sit at the skull base on most rigs; eyes are a little above.
      const want = base + this.height * 0.935;
      if (Math.abs(out.y + 0.06 - want) < 0.35) out.y += 0.06;
      else out.y = want;
      return out;
    }
    return out.copy(this.c.root.position).setY(this.c.root.position.y + this.height * 0.935);
  }

  // A point at a fraction of the standing height (0 feet, 0.5 hips, 0.75 chest).
  at(frac, out = new THREE.Vector3()) {
    return out.copy(this.c.root.position).setY(this.c.root.position.y + this.height * frac);
  }

  forward(out = new THREE.Vector3()) {
    const y = this.yaw;
    return out.set(Math.sin(y), 0, Math.cos(y));
  }

  setPosition(x, z, yaw) {
    if (typeof this.c.setPosition === 'function') this.c.setPosition(x, z);
    else this.c.root.position.set(x, this.G.world?.heightAt?.(x, z) ?? 0, z);
    if (yaw != null) { this.yaw = yaw; this.faceYaw = null; }
  }

  // Turn toward an Actor, Vector3, [x, z] or a yaw number. instant skips the turn.
  face(target, { instant = false, rate } = {}) {
    let yaw = null;
    if (typeof target === 'number') yaw = target;
    else {
      const p = target instanceof Actor ? target.pos(_v) : Array.isArray(target) ? _v.set(target[0], 0, target[target.length - 1]) : target;
      if (!p) return;
      const r = this.c.root.position;
      const dx = p.x - r.x, dz = p.z - r.z;
      if (dx * dx + dz * dz < 1e-4) return;
      yaw = Math.atan2(dx, dz);
    }
    if (rate) this.turnRate = rate;
    if (instant) { this.yaw = yaw; this.faceYaw = null; } else this.faceYaw = yaw;
  }

  update(dt) {
    if (this.faceYaw != null) {
      const y = this.yaw;
      const ny = dampAngle(y, this.faceYaw, this.turnRate, dt);
      this.yaw = ny;
      if (Math.abs(wrapAngle(this.faceYaw - ny)) < 0.01) this.faceYaw = null;
    }
  }

  lookAt(target) {
    if (typeof this.c.lookAt !== 'function') return;
    let t = target;
    if (target instanceof Actor) t = target.head || target.eye(new THREE.Vector3());
    else if (Array.isArray(target)) t = new THREE.Vector3(...target);
    try { this.c.lookAt(t || null); } catch (e) { console.error('[story] lookAt', e); }
  }

  talk(on) {
    try { this.c.talk?.(!!on); } catch (e) { console.error('[story] talk', e); }
  }

  // Plays a clip or gesture. One-shots return a Promise that resolves when they finish.
  play(clip, opts = {}) {
    if (!clip) return Promise.resolve();
    const c = this.c;
    try {
      if (GESTURES.has(clip) && typeof c.gesture === 'function') return Promise.resolve(c.gesture(clip));
      if (typeof c.play !== 'function') return Promise.resolve();
      const loop = opts.loop ?? LOOP_POSES.has(clip);
      this.loopPose = loop && clip !== 'idle' && clip !== 'idle_cold' ? clip : null;
      // Real characters know which clips loop; only pass `loop` when the caller asked.
      const o = { fade: 0.35, ...opts };
      if (opts.loop === undefined && !c.anim) o.loop = loop;
      // A full-body clip cancels a walk on the real Character; settle the walk promise too.
      if (this._walkDone && clip !== 'idle') { const d = this._walkDone; this._walkDone = null; d(); }
      return Promise.resolve(c.play(clip, o));
    } catch (e) {
      console.error(`[story] play ${clip}`, e);
      return Promise.resolve();
    }
  }

  gesture(name) { return this.play(name); }

  // Upper-body talk gesture that does not disturb the stance (falls back to a full clip).
  talkGesture(rand = Math.random) {
    const clip = TALK_CLIPS[Math.floor(rand() * TALK_CLIPS.length)];
    try {
      if (typeof this.c.playUpper === 'function') return Promise.resolve(this.c.playUpper(clip, { loop: false, fade: 0.3 }));
      if (!this.loopPose && typeof this.c.play === 'function') return Promise.resolve(this.c.play(clip, { loop: false, fade: 0.3 }));
    } catch (e) { console.error('[story] talk gesture', e); }
    return Promise.resolve();
  }

  // Return to a neutral stance after a held pose.
  relax() {
    if (!this.loopPose) return;
    this.loopPose = null;
    // Real characters pick their cold idle from c.cold; 'idle' returns to the locomotion tree.
    try { this.c.play?.('idle', { loop: true, fade: 0.5 }); } catch { /* ignore */ }
  }

  // walkTo(x, z, opts) or walkTo([{ x, z }, ...], opts).
  walkTo(x, z, opts = {}) {
    const path = Array.isArray(x);
    if (path) opts = z || {};
    if (typeof this.c.walkTo === 'function') {
      try {
        const p = Promise.resolve(path ? this.c.walkTo(x, opts) : this.c.walkTo(x, z, opts));
        // Resolves when the walk ends, or when play() interrupts it.
        return new Promise((resolve) => {
          this._walkDone = resolve;
          p.then(() => { if (this._walkDone === resolve) this._walkDone = null; resolve(); });
        });
      } catch (e) { console.error('[story] walkTo', e); }
    }
    // No locomotion available: glide along the points.
    const pts = path ? x : [{ x, z }];
    const speed = opts.speed || (opts.run ? 3.6 : 1.4);
    const sched = this.G.story?.sched;
    if (!sched) { const l = pts[pts.length - 1]; this.setPosition(l.x, l.z); return Promise.resolve(); }
    return pts.reduce((p, q) => p.then(() => {
      const from = this.c.root.position.clone();
      const dist = Math.hypot(q.x - from.x, q.z - from.z);
      this.face(new THREE.Vector3(q.x, 0, q.z), { instant: true });
      this.c.setLocomotion?.(speed);
      return sched.tween({
        dur: dist / speed, ease: 'linear',
        step: (k) => this.setPosition(from.x + (q.x - from.x) * k, from.z + (q.z - from.z) * k),
      });
    }), Promise.resolve()).then(() => this.c.setLocomotion?.(0));
  }

  show() { this.c.setVisible ? this.c.setVisible(true) : (this.c.root.visible = true); }
  hide() { this.c.setVisible ? this.c.setVisible(false) : (this.c.root.visible = false); }

  // Pale turquoise translucent look for echoes and the drowned.
  ghost(on = true, { color = 0x9ff5ff, opacity = 0.42 } = {}) {
    if (!G_TIME._bound) { G_TIME._bound = true; this.G.addSystem('story-ghost-time', (_dt, t) => { G_TIME.value = t; }, 99); }
    if (on && !this._ghost) {
      const mat = getGhostMaterial(color, opacity);
      mat.userData.ghostColor.value.set(color);
      this._ghost = [];
      this.c.root.traverse((o) => {
        if (!o.isMesh) return;
        this._ghost.push([o, o.material, o.castShadow]);
        o.material = mat;
        o.castShadow = false;
      });
    } else if (!on && this._ghost) {
      for (const [o, m, cs] of this._ghost) { o.material = m; o.castShadow = cs; }
      this._ghost = null;
    }
  }

  release() {
    if (this._ghost) this.ghost(false);
    this.talk(false);
    this.lookAt(null);
    this.faceYaw = null;
    if (this.npc) { try { this.npc.pause?.(false); } catch (e) { console.error(e); } }
    if (this.owned && !this.persist) {
      try {
        if (typeof this.c.dispose === 'function') this.c.dispose();
        this.c.root.parent?.remove(this.c.root);
      } catch (e) { console.error('[story] dispose actor', e); }
    }
  }
}

export class ActorStage {
  constructor(G) {
    this.G = G;
    this.actors = new Map();
  }

  has(id) { return this.actors.has(id); }

  // opts: { preset, at: [x, z], yaw, persist, character, spawn = true }
  get(id, opts = {}) {
    const G = this.G;
    let a = this.actors.get(id);
    if (!a) {
      if (opts.character) {
        a = opts.character instanceof Actor ? opts.character : new Actor(G, id, opts.character, {});
      } else if ((id === 'vesna' || id === 'player') && G.player?.character) {
        a = new Actor(G, 'vesna', G.player.character, { player: true });
      } else if ((id === 'kasza' || id === 'horse') && (G.horse?.character || G.horse?.horse)) {
        a = new Actor(G, 'kasza', G.horse.character || G.horse.horse, {});
      } else {
        const npc = G.npcs?.get?.(id);
        if (npc?.character) a = new Actor(G, id, npc.character, { npc });
        else if (opts.spawn !== false) {
          const preset = opts.preset || (id === 'player' ? 'vesna' : id);
          const c = spawnCharacter(G, preset, opts.spec);
          if (c && !c.root.parent) G.scene.add(c.root);
          a = new Actor(G, id, c, { owned: true, persist: !!opts.persist });
          if (!c) a.standIn = true;
        } else return null;
      }
      this.actors.set(id, a);
    }
    if (opts.persist) a.persist = true;
    if (opts.at) a.setPosition(opts.at[0], opts.at[1], opts.yaw);
    else if (opts.yaw != null) a.yaw = opts.yaw;
    return a;
  }

  add(id, actor) { this.actors.set(id, actor); return actor; }

  list() { return [...this.actors.values()]; }

  update(dt) {
    for (const a of this.actors.values()) a.update(dt);
  }

  releaseAll() {
    for (const a of this.actors.values()) a.release();
    this.actors.clear();
  }
}
