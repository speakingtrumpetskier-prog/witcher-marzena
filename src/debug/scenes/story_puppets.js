// Placeholder figures for the story debug scene ONLY, used while createCharacter is still a stub.
// They implement the slice of the Character API the story systems call (root, height, yaw,
// bones.head, setPosition, play, gesture, talk, lookAt, walkTo, setLocomotion, setVisible,
// dispose) with crude procedural motion, so framing, facing and acting can be tested.
import * as THREE from 'three';
import { dampAngle, damp, clamp } from '../../core/util.js';

const PRESETS = {
  vesna: { h: 1.76, coat: 0x2f3b4c, trim: 0x8b7a62, hair: 0xb8ad93, skin: 0xd8b49a, braid: true, swords: true },
  hanka: { h: 1.66, coat: 0x3b302b, trim: 0x2a2421, hair: 0x8a857c, skin: 0xd2ad95, scarf: 0x7d7a74 },
  ola: { h: 1.34, coat: 0xa88a62, trim: 0xe5dccb, hair: 0x5a3b28, skin: 0xe0b9a0, cap: 0x9a2e22 },
  dobra: { h: 1.52, coat: 0x5a4a3a, trim: 0x9a2e22, hair: 0xcfc8bc, skin: 0xc79f86, scarf: 0x6b5a4a },
  bogdan: { h: 1.86, coat: 0x4a3b2c, trim: 0x6b5641, hair: 0x4a3a2c, skin: 0xcfa58b, beard: true },
  zbyszek: { h: 1.7, coat: 0x6a5a48, trim: 0xd8d0c0, hair: 0x6a5a48, skin: 0xdcb49a },
};

const DEFAULT = { h: 1.72, coat: 0x55493d, trim: 0x8a7a66, hair: 0x5a4636, skin: 0xd4b096 };
const puppets = new Set();
let systemAdded = false;

function mat(color, rough = 0.85) { return new THREE.MeshStandardMaterial({ color, roughness: rough }); }

export function makePuppet(G, preset = 'villager') {
  const P = PRESETS[preset] || PRESETS[String(preset).replace(/_\d+$/, '')] || DEFAULT;
  const s = P.h / 1.76;
  const root = new THREE.Group();
  root.name = `puppet-${preset}`;
  const body = new THREE.Group();
  root.add(body);
  const coatM = mat(P.coat), trimM = mat(P.trim), skinM = mat(P.skin, 0.7), hairM = mat(P.hair, 0.9);
  const darkM = mat(0x1d1a18, 0.9);
  const add = (geo, m, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };

  // Legs.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.09 * side * s, 0.86 * s, 0);
    body.add(hip);
    add(new THREE.CapsuleGeometry(0.068 * s, 0.7 * s, 4, 8), darkM, hip, 0, -0.43 * s, 0);
    add(new THREE.BoxGeometry(0.11 * s, 0.08 * s, 0.24 * s), darkM, hip, 0, -0.83 * s, 0.05 * s);
    legs.push(hip);
  }
  const chest = new THREE.Group();
  chest.position.y = 0.95 * s;
  body.add(chest);
  // Coat skirt and torso.
  add(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 0.55 * s, 14, 1, true), coatM, body, 0, 0.62 * s, 0).material.side = THREE.DoubleSide;
  add(new THREE.CapsuleGeometry(0.19 * s, 0.38 * s, 4, 12), coatM, chest, 0, 0.2 * s, 0).scale.set(1, 1, 0.72);
  add(new THREE.TorusGeometry(0.14 * s, 0.055 * s, 6, 14), trimM, chest, 0, 0.48 * s, 0).rotation.x = Math.PI / 2;
  if (P.swords) {
    const sw = add(new THREE.BoxGeometry(0.03, 1.0 * s, 0.02), darkM, chest, 0, 0.25 * s, -0.17 * s);
    sw.rotation.z = 0.5;
    const sw2 = add(new THREE.BoxGeometry(0.03, 1.0 * s, 0.02), darkM, chest, 0, 0.25 * s, -0.18 * s);
    sw2.rotation.z = -0.5;
  }
  // Arms with shoulder and elbow pivots.
  const arms = {};
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0.24 * side * s, 0.42 * s, 0);
    chest.add(sh);
    add(new THREE.CapsuleGeometry(0.06 * s, 0.24 * s, 4, 8), coatM, sh, 0, -0.15 * s, 0);
    const el = new THREE.Group();
    el.position.y = -0.31 * s;
    sh.add(el);
    add(new THREE.CapsuleGeometry(0.052 * s, 0.22 * s, 4, 8), coatM, el, 0, -0.13 * s, 0);
    add(new THREE.SphereGeometry(0.048 * s, 8, 6), skinM, el, 0, -0.3 * s, 0);
    arms[side < 0 ? 'L' : 'R'] = { sh, el };
  }
  // Neck and head.
  const neck = new THREE.Group();
  neck.position.y = 0.55 * s;
  chest.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.12 * s;
  neck.add(head);
  add(new THREE.SphereGeometry(0.105 * s, 16, 12), skinM, head, 0, 0.06 * s, 0).scale.set(0.9, 1.1, 0.95);
  // Eyes and nose make facing readable at a glance.
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.014 * s, 6, 4), darkM, head, 0.037 * side * s, 0.085 * s, 0.088 * s);
  add(new THREE.ConeGeometry(0.016 * s, 0.05 * s, 6), skinM, head, 0, 0.055 * s, 0.1 * s).rotation.x = Math.PI / 2;
  const mouth = add(new THREE.BoxGeometry(0.04 * s, 0.008 * s, 0.01 * s), darkM, head, 0, 0.012 * s, 0.093 * s);
  if (P.scarf) {
    add(new THREE.SphereGeometry(0.122 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(P.scarf), head, 0, 0.07 * s, -0.01 * s).rotation.x = -0.35;
  } else {
    add(new THREE.SphereGeometry(0.112 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, head, 0, 0.07 * s, -0.012 * s).rotation.x = -0.25;
  }
  if (P.cap) add(new THREE.SphereGeometry(0.118 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(P.cap), head, 0, 0.085 * s, 0);
  if (P.braid) add(new THREE.CapsuleGeometry(0.03, 0.28, 4, 6), hairM, head, 0, -0.1 * s, -0.11 * s).rotation.x = 0.2;
  if (P.beard) add(new THREE.SphereGeometry(0.08 * s, 10, 8), hairM, head, 0, -0.02 * s, 0.06 * s).scale.set(1, 1.2, 0.8);

  const state = {
    yawT: null, look: null, talk: false, talkT: 0, pose: 'idle', oneShot: null, osT: 0,
    walk: null, speed: 0, phase: 0, headYaw: 0, headPitch: 0, crouch: 0,
  };

  const c = {
    root, height: P.h, preset,
    bones: { head, neck, chest, hips: body, shoulderL: arms.L.sh, shoulderR: arms.R.sh, handL: arms.L.el, handR: arms.R.el },
    get yaw() { return root.rotation.y; },
    set yaw(v) { root.rotation.y = v; },
    setPosition(x, z) { root.position.set(x, G.world?.heightAt?.(x, z) ?? 0, z); },
    play(name, opts = {}) {
      if (['nod', 'shake_head', 'shrug', 'point', 'wave', 'beckon', 'talk_1', 'talk_2', 'talk_3', 'crouch_examine', 'look_back', 'kneel'].includes(name) && !opts.loop) {
        state.oneShot = name;
        state.osT = 0;
        return new Promise((r) => { state.osDone = r; });
      }
      state.pose = name;
      return Promise.resolve();
    },
    playUpper(name) { return c.play(name, { loop: false }); },
    stopUpper() {},
    gesture(name) { return c.play(name, { loop: false }); },
    talk(on) { state.talk = !!on; },
    lookAt(t) { state.look = t || null; },
    setLocomotion(v) { state.speed = v; },
    walkTo(x, z, opts = {}) {
      const pts = Array.isArray(x) ? x.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p)) : [{ x, z }];
      if (Array.isArray(x)) opts = z || {};
      return new Promise((resolve) => { state.walk = { pts, i: 0, speed: opts.speed || (opts.run ? 3.4 : 1.35), resolve }; });
    },
    setVisible(v) { root.visible = v; },
    dispose() { puppets.delete(c); root.parent?.remove(root); },
    update(dt) {
      // Walking.
      const w = state.walk;
      if (w) {
        const tgt = w.pts[w.i];
        const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          w.i++;
          if (w.i >= w.pts.length) { state.walk = null; state.speed = 0; w.resolve(); }
        } else {
          const yaw = Math.atan2(dx, dz);
          root.rotation.y = dampAngle(root.rotation.y, yaw, 8, dt);
          const step = Math.min(d, w.speed * dt);
          c.setPosition(root.position.x + (dx / d) * step, root.position.z + (dz / d) * step);
          state.speed = w.speed;
        }
      }
      const sp = state.walk ? state.speed : 0;
      state.phase += dt * (2 + sp * 3.2);
      const swing = Math.min(1, sp / 1.4) * 0.5;
      legs[0].rotation.x = Math.sin(state.phase) * swing;
      legs[1].rotation.x = -Math.sin(state.phase) * swing;
      // Poses.
      const t = performance.now() / 1000;
      // L arm sits at -X: outward is -z; R arm at +X: outward is +z.
      let lA = { x: -Math.sin(state.phase) * swing * 0.8, z: -0.1 }, rA = { x: Math.sin(state.phase) * swing * 0.8, z: 0.1 };
      let lE = 0.15, rE = 0.15, crouch = 0, nodP = 0, shakeY = 0;
      if (state.pose === 'cross_arms') { lA = { x: -0.45, z: 0.3 }; rA = { x: -0.5, z: -0.3 }; lE = 1.75; rE = 1.85; }
      if (state.pose === 'hands_hips') { lA = { x: 0.15, z: -0.6 }; rA = { x: 0.15, z: 0.6 }; lE = 1.5; rE = 1.5; }
      if (state.pose === 'kneel_idle' || state.pose === 'sit_ground') crouch = 0.45;
      const os = state.oneShot;
      if (os) {
        state.osT += dt;
        const k = state.osT;
        const env = Math.sin(Math.min(1, k / 1.2) * Math.PI);
        if (os === 'nod') nodP = Math.sin(k * 11) * 0.22 * env;
        if (os === 'shake_head') shakeY = Math.sin(k * 12) * 0.3 * env;
        if (os === 'shrug') { lA = { x: -0.2, z: -0.35 * env }; rA = { x: -0.2, z: 0.35 * env }; lE = rE = 1.2 * env; }
        if (os === 'point') { rA = { x: -1.4 * env, z: -0.1 }; rE = 0.1; }
        if (os === 'wave') { rA = { x: -0.3, z: 2.4 * env }; rE = 0.6 + Math.sin(k * 10) * 0.4 * env; }
        if (os === 'beckon') { rA = { x: -1.0 * env, z: -0.1 }; rE = 0.6 + Math.sin(k * 9) * 0.6 * env; }
        if (/^talk_/.test(os)) { const side = os === 'talk_2' ? lA : rA; side.x = -0.9 * env; side.z *= 1; if (os === 'talk_2') lE = 1.3 * env; else rE = 1.3 * env; }
        if (os === 'crouch_examine' || os === 'kneel') crouch = 0.42 * env;
        if (os === 'look_back') shakeY = 1.2 * env;
        if (k >= 1.2) { state.oneShot = null; state.osDone?.(); }
      }
      state.crouch = damp(state.crouch, crouch, 6, dt);
      body.position.y = -state.crouch * s;
      chest.rotation.x = state.crouch * 0.6;
      const set = (a, A, E) => {
        a.sh.rotation.x = damp(a.sh.rotation.x, A.x, 10, dt);
        a.sh.rotation.z = damp(a.sh.rotation.z, A.z, 10, dt);
        a.el.rotation.x = damp(a.el.rotation.x, -E, 10, dt);
      };
      set(arms.L, lA, lE);
      set(arms.R, rA, rE);
      // Head: look target, talking bob, gestures.
      let hy = 0, hp = 0;
      if (state.look) {
        const tp = state.look.isVector3 ? state.look : state.look.getWorldPosition ? state.look.getWorldPosition(new THREE.Vector3()) : null;
        if (tp) {
          const hp0 = head.getWorldPosition(new THREE.Vector3());
          const dx = tp.x - hp0.x, dz = tp.z - hp0.z, dy = tp.y - hp0.y;
          const yawW = Math.atan2(dx, dz);
          hy = clamp(((yawW - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.1, 1.1);
          hp = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.6);
        }
      }
      if (state.talk) { state.talkT += dt; hp += Math.sin(state.talkT * 7.3) * 0.035; mouth.scale.y = 1 + Math.abs(Math.sin(state.talkT * 14)) * 3; } else mouth.scale.y = 1;
      state.headYaw = damp(state.headYaw, hy + shakeY, 7, dt);
      state.headPitch = damp(state.headPitch, hp + nodP, 9, dt);
      neck.rotation.y = state.headYaw;
      head.rotation.x = state.headPitch;
      // Breathing.
      chest.scale.y = 1 + Math.sin(t * 1.6 + s * 10) * 0.008;
    },
  };
  puppets.add(c);
  if (!systemAdded) {
    systemAdded = true;
    G.addSystem('story-puppets', (dt) => { for (const p of puppets) p.update(dt); }, 50);
  }
  return c;
}
