// The table scene: the cloth, ten dice, the pot of coins, contact shadows, markers and the close camera.
// Everything lives in one group in the "table frame" (sites.js): origin on the table top, +z toward the player,
// +x to the player's right. The group is placed on the real table or bar of the tavern.
//
//   const stage = new Stage(G, site, { playerStyle, oppStyle })      builds and adds the group to G.scene
//   stage.update(dt)                         per frame: dice, shadows, coins, the camera
//   stage.roll(side, indices, values, opts)  -> Promise     shake those dice in a hand, throw them, settle on `values`
//                                            opts.onEvent(kind, strength, die): 'rattle' | 'throw' | 'land' | 'tumble'
//   stage.setRow(side, values)               put all five dice at rest at once (no animation)
//   stage.hideRow(side)                      dice not yet thrown
//   stage.lift(side, mask)                   raise the dice in mask (the ones picked to roll again)
//   stage.setFocus(index) / setSelected(mask) the cursor ring and the picked dice (the player's row)
//   stage.light(side, indices, kind)         'made' dice glow, the rest dim (kind null clears)
//   stage.pick(clientX, clientY)             the player's die under the mouse, or -1
//   stage.screenOf(side, i)                  { x, y } screen position of a die (for labels)
//   stage.pot.add(side, n) / sweep(to)       coins in from a side; the pot goes to 'player' | 'opp' | 'split'
//   stage.view(name)                         camera: 'table' | 'rival' | 'closeup'
//   stage.dispose()
import * as THREE from 'three';
import { DIE, dieGeometry, dieMaterial, shadowTexture } from './dieModel.js';
import { planRoll, planShake, planHop, faceUp, randomQuat } from './roll.js';
import { rng } from '../../core/util.js';

export const SLOT = 0.085;
export const ROW_Z = 0.17;
const CLOTH_Y = 0.0014;
const REST_Y = CLOTH_Y + DIE / 2;
const HAND_Z = 0.36;
const LIFT = 0.024;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const slotPos = (side, i, out = new THREE.Vector3()) => out.set((i - 2) * SLOT, REST_Y, side === 'player' ? ROW_Z : -ROW_Z);

// ---- the cloth ---------------------------------------------------------------------------------------------
function clothTexture(w, h) {
  const px = 1024, py = Math.round((px * h) / w);
  const c = document.createElement('canvas');
  c.width = px; c.height = py;
  const ctx = c.getContext('2d');
  const r = rng(77);
  ctx.fillStyle = '#3c1d1b';
  ctx.fillRect(0, 0, px, py);
  // wool: a fine weave and a little cloudiness
  for (let y = 0; y < py; y += 3) { ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; ctx.fillRect(0, y, px, 1); }
  for (let x = 0; x < px; x += 3) { ctx.fillStyle = `rgba(255,220,200,${0.015 + r() * 0.025})`; ctx.fillRect(x, 0, 1, py); }
  for (let i = 0; i < 40; i++) {
    const x = r() * px, y = r() * py, rad = 40 + r() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, r() < 0.5 ? 'rgba(20,6,6,0.14)' : 'rgba(150,80,60,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // stitched border in cream and folk red: a row of diamonds between two lines
  const cream = '#d8c8a0', red = '#b13d2c';
  const inset = 20;
  ctx.lineWidth = 3;
  for (const [o, col] of [[inset, cream], [inset + 46, cream]]) {
    ctx.strokeStyle = col; ctx.globalAlpha = 0.85;
    ctx.strokeRect(o, o, px - o * 2, py - o * 2);
  }
  ctx.globalAlpha = 1;
  const dia = (x, y, s, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); };
  const step = 30;
  for (let x = inset + 23; x < px - inset - 10; x += step) {
    dia(x, inset + 23, 9, red); dia(x, py - inset - 23, 9, red);
    dia(x + step / 2, inset + 23, 3, cream); dia(x + step / 2, py - inset - 23, 3, cream);
  }
  for (let y = inset + 23; y < py - inset - 10; y += step) {
    dia(inset + 23, y, 9, red); dia(px - inset - 23, y, 9, red);
    dia(inset + 23, y + step / 2, 3, cream); dia(px - inset - 23, y + step / 2, 3, cream);
  }
  // worn: the middle is a little paler where hands have rested
  const g = ctx.createRadialGradient(px / 2, py / 2, py * 0.2, px / 2, py / 2, px * 0.62);
  g.addColorStop(0, 'rgba(255,230,200,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, px, py);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function coinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b8b5aa'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#6d6a60'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(64, 64, 44, 0, Math.PI * 2); ctx.stroke();
  // a small eight-armed star
  ctx.fillStyle = '#6d6a60';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a - 0.2) * 7, 64 + Math.sin(a - 0.2) * 7);
    ctx.lineTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
    ctx.lineTo(64 + Math.cos(a + 0.2) * 7, 64 + Math.sin(a + 0.2) * 7);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- one die -------------------------------------------------------------------------------------------------
class DieView {
  constructor(stage, side, index, style) {
    this.stage = stage;
    this.side = side;
    this.index = index;
    this.material = dieMaterial(style);
    this.mesh = new THREE.Mesh(dieGeometry(), this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.shadow = new THREE.Mesh(stage.planeGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.visible = false;
    this.ring = new THREE.Mesh(stage.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf0e6d0, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = CLOTH_Y + 0.0012;
    this.ring.visible = false;
    stage.group.add(this.mesh, this.shadow, this.ring);
    this.value = 1;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.restPos = slotPos(side, index);
    this.restQuat = faceUp(1);
    this.lift = 0;
    this.liftTarget = 0;
    this.glow = 0;
    this.glowTarget = 0;
    this.dim = 0;
    this.dimTarget = 0;
    this.focus = false;
    this.selected = false;
    this.anim = null;
    this.appear = 1;
    this.visible = false;
    this.ringPulse = Math.random() * 6;
  }

  setRest(value, jitter) {
    this.value = value;
    this.restPos = slotPos(this.side, this.index);
    this.restPos.x += jitter?.x ?? 0;
    this.restPos.z += jitter?.z ?? 0;
    this.restQuat = faceUp(value, jitter?.yaw ?? 0);
    this.anim = null;
    this.pos.copy(this.restPos);
    this.quat.copy(this.restQuat);
    this.show(true);
  }

  show(on) {
    this.visible = on;
    this.mesh.visible = on;
    this.shadow.visible = on;
  }

  update(dt, time) {
    const a = this.anim;
    if (a) {
      a.t += dt;
      for (const part of a.parts) {
        if (a.t >= part.t0 && a.t <= part.t0 + part.plan.duration + 1e-6) { part.plan.sample(a.t - part.t0, this.pos, this.quat); break; }
        if (part === a.parts[a.parts.length - 1] && a.t > part.t0 + part.plan.duration) part.plan.sample(part.plan.duration, this.pos, this.quat);
      }
      for (const ev of a.events) {
        if (!ev.done && a.t >= ev.t) { ev.done = true; a.onEvent?.(ev.kind, ev.strength, this); }
      }
      if (a.t >= a.duration) {
        const done = a.resolve;
        this.pos.copy(this.restPos);
        this.quat.copy(this.restQuat);
        this.anim = null;
        done?.();
      }
    } else {
      this.lift += (this.liftTarget - this.lift) * (1 - Math.exp(-14 * dt));
      this.pos.copy(this.restPos);
      this.pos.y += this.lift * LIFT;
      this.quat.copy(this.restQuat);
    }
    this.appear = Math.min(1, this.appear + dt * 9);
    const s = this.appear;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    this.mesh.scale.setScalar(s);

    // look: glow and dim
    this.glow += (this.glowTarget - this.glow) * (1 - Math.exp(-8 * dt));
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-8 * dt));
    this.material.emissive.setRGB(1, 0.72, 0.4).multiplyScalar(this.glow * 0.055);
    const k = 1 - this.dim * 0.5;
    this.material.color.setRGB(k, k, k);

    // contact shadow follows on the cloth, softer and larger as the die leaves it
    const h = Math.max(0, this.pos.y - REST_Y);
    const spread = DIE * (1.75 + Math.min(1, h * 5) * 1.2);
    this.shadow.position.set(this.pos.x + 0.003 + h * 0.2, CLOTH_Y + 0.0008, this.pos.z + 0.004 + h * 0.25);
    this.shadow.scale.set(spread, spread, 1);
    this.shadow.material.opacity = 0.62 * (1 - smooth(0.0, 0.3, h)) * s;

    // ring: the cursor, the pick
    const on = this.focus || this.selected;
    const m = this.ring.material;
    this.ring.visible = on;
    if (on) {
      this.ringPulse += dt * 4;
      const pulse = this.focus && !this.selected ? 0.75 + 0.25 * Math.sin(this.ringPulse) : 1;
      m.opacity = (this.selected ? 0.95 : 0.8) * pulse;
      m.color.set(this.selected ? 0xd0614b : 0xf4ecda);
      this.ring.position.x = this.restPos.x;
      this.ring.position.z = this.restPos.z;
      const sc = this.selected ? 1.08 : 1;
      this.ring.scale.set(sc, sc, 1);
    }
    void time;
  }

  dispose() {
    this.stage.group.remove(this.mesh, this.shadow, this.ring);
    this.material.dispose();
    this.shadow.material.dispose();
    this.ring.material.dispose();
  }
}

// ---- the pot ---------------------------------------------------------------------------------------------------------
const COIN_R = 0.0118, COIN_T = 0.0019;
const STACK = 8;
const POT_X = -0.3; // the pot sits at the left of the cloth, clear of the rows and the hand names
const POT_COLS = [[-0.066, -0.012], [-0.039, 0.016], [-0.012, -0.012], [0.015, 0.016], [0.042, -0.012], [0.069, 0.016], [-0.066, 0.044], [-0.039, -0.04], [-0.012, 0.044], [0.015, -0.04], [0.042, 0.044], [0.069, -0.04]];

class Pot {
  constructor(stage) {
    this.stage = stage;
    this.max = STACK * POT_COLS.length;
    this.geo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 22);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: coinTexture(), metalness: 0.55, roughness: 0.42, emissive: 0x2a2822, emissiveIntensity: 0.6 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stage.group.add(this.mesh);
    this.coins = []; // { from, to, t, dur, apex, spin, q, done, pos, gone }
    this.count = 0; // coins in the pot
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this.clink = null; // (strength) => void
    this.lastClink = 0;
    this.r = rng(91);
  }

  slot(i) {
    const col = POT_COLS[Math.floor(i / STACK) % POT_COLS.length], layer = i % STACK;
    return new THREE.Vector3(POT_X + col[0], CLOTH_Y + COIN_T / 2 + layer * COIN_T * 1.04, col[1]);
  }

  // n coins arrive from a side's edge
  add(side, n, { delay = 0, quick = false } = {}) {
    const z0 = side === 'player' ? 0.46 : -0.46;
    for (let k = 0; k < n && this.count < this.max; k++) {
      const i = this.count++;
      const to = this.slot(i);
      const from = new THREE.Vector3(((k - n / 2) * 0.012) + (this.r() - 0.5) * 0.04, 0.14 + this.r() * 0.05, z0);
      this.coins.push({ i, from, to, t: -(delay + k * (quick ? 0.03 : 0.07)), dur: 0.38 + this.r() * 0.08, apex: 0.05 + this.r() * 0.04, spin: (this.r() - 0.5) * 14, q: randomQuat(this.r), done: false, gone: false, pos: from.clone() });
    }
    return (n * (quick ? 0.03 : 0.07)) + delay + 0.5;
  }

  // The pot goes to a side (or splits when drawn): the coins slide off the table edge toward them.
  sweep(to) {
    const n = this.count;
    for (const c of this.coins) c.done = true; // anything still in flight lands
    const list = this.coins.filter((c) => !c.gone).sort((a, b) => a.i - b.i);
    list.forEach((c, k) => {
      const side = to === 'split' ? (k % 2 ? 'opp' : 'player') : to;
      c.from = this.slot(c.i);
      c.to = new THREE.Vector3(c.from.x + (this.r() - 0.5) * 0.12, CLOTH_Y + 0.01, side === 'player' ? 0.5 : -0.5);
      c.t = -k * 0.025;
      c.dur = 0.5 + this.r() * 0.15;
      c.apex = 0.02;
      c.done = false;
      c.leaving = true;
    });
    this.count = 0;
    return list.length * 0.025 + 0.8 + (n ? 0 : 0);
  }

  clear() {
    this.coins.length = 0;
    this.count = 0;
    this.mesh.count = 0;
  }

  update(dt, nowMs) {
    let n = 0;
    const m = this._m;
    for (const c of this.coins) {
      if (c.gone) continue;
      c.t += dt;
      let k = c.t / c.dur;
      if (c.t < 0) k = -1;
      if (k >= 1) {
        k = 1;
        if (!c.done) {
          c.done = true;
          if (!c.leaving && this.clink && nowMs - this.lastClink > 55) { this.lastClink = nowMs; this.clink(0.6); }
        }
        if (c.leaving) { c.gone = true; continue; }
      }
      if (k < 0) {
        // not thrown yet: hold at the edge, out of sight (below the cloth)
        c.pos.set(c.from.x, -1, c.from.z);
      } else if (c.done && !c.leaving) {
        c.pos.copy(c.to);
      } else {
        c.pos.lerpVectors(c.from, c.to, k);
        c.pos.y += 4 * c.apex * k * (1 - k);
      }
      if (k >= 0 && k < 1 && !c.leaving) this._q.setFromAxisAngle(new THREE.Vector3(1, 0.3, 0.2).normalize(), c.spin * (1 - k)).multiply(c.q);
      else this._q.set(0, 0, 0, 1);
      m.compose(c.pos, this._q, this._s);
      this.mesh.setMatrixAt(n++, m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.coins = this.coins.filter((c) => !c.gone);
  }

  dispose() {
    this.stage.group.remove(this.mesh);
    this.geo.dispose();
    this.mat.map.dispose();
    this.mat.dispose();
    this.mesh.dispose?.();
  }
}

// ---- the stage -------------------------------------------------------------------------------------------------------
export class Stage {
  constructor(G, site, { playerStyle = 'house', oppStyle = 'bone', seed = 1 } = {}) {
    this.G = G;
    this.site = site;
    this.group = new THREE.Group();
    this.group.name = 'dice-table';
    this.group.position.copy(site.origin);
    this.group.rotation.y = site.yaw;
    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    this.ringGeo = new THREE.RingGeometry(0.0335, 0.0385, 48);
    this.r = rng(seed);

    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(site.width, site.depth), new THREE.MeshStandardMaterial({ map: clothTexture(site.width, site.depth), roughness: 0.95, metalness: 0 }));
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = CLOTH_Y;
    cloth.receiveShadow = true;
    this.cloth = cloth;
    this.group.add(cloth);

    this.dice = {
      player: Array.from({ length: 5 }, (_, i) => new DieView(this, 'player', i, playerStyle)),
      opp: Array.from({ length: 5 }, (_, i) => new DieView(this, 'opp', i, oppStyle)),
    };
    this.pot = new Pot(this);
    G.scene.add(this.group);
    this.group.updateMatrixWorld(true);

    // camera
    this.camTarget = 'table';
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camFov = 36;
    this.rivalHead = new THREE.Vector3(0, 0.38, -0.6); // frame coordinates; set from the opponent's head
    this._raycaster = new THREE.Raycaster();
    this._tmp = new THREE.Vector3();
    this.time = 0;
    this.snapCamera();
  }

  // ---- camera ----------------------------------------------------------------------------------------------------
  poses() {
    const c = this.site.cam;
    const aspect = this.G.camera?.aspect || 16 / 9;
    // vertical field wide enough that the cloth always fits across the screen
    const dist = Math.hypot(c.back, c.up);
    const fitH = 2 * Math.atan((this.site.width * 0.5 + 0.03) / (dist * aspect)) * (180 / Math.PI);
    const tableFov = Math.max(c.fov ?? 28, fitH);
    return {
      // the look point sits toward the player so the table rides high in the frame, clear of the panel at the bottom
      table: { pos: new THREE.Vector3(0, c.up, c.back), look: new THREE.Vector3(0, 0, c.lookZ ?? 0.12), fov: tableFov },
      rival: { pos: new THREE.Vector3(0, c.up * 0.62, c.back * 1.2), look: this.rivalHead.clone().add(new THREE.Vector3(0, -0.1, 0)), fov: 42 },
      closeup: { pos: new THREE.Vector3(0, c.up * 0.62, c.back * 0.64), look: new THREE.Vector3(0, 0, 0.1), fov: tableFov },
    };
  }

  snapCamera() {
    const p = this.poses()[this.camTarget];
    this.camPos.copy(this.group.localToWorld(p.pos.clone()));
    this.camLook.copy(this.group.localToWorld(p.look.clone()));
    this.camFov = p.fov;
  }

  view(name) { if (this.poses()[name]) this.camTarget = name; }

  updateCamera(camera, dt) {
    const p = this.poses()[this.camTarget];
    const wp = this.group.localToWorld(p.pos.clone());
    const wl = this.group.localToWorld(p.look.clone());
    const k = 1 - Math.exp(-3.2 * dt);
    this.camPos.lerp(wp, k);
    this.camLook.lerp(wl, k);
    this.camFov += (p.fov - this.camFov) * k;
    // a hand's breadth of drift so the picture is never dead still
    const t = this.time;
    camera.position.set(this.camPos.x + Math.sin(t * 0.31) * 0.004, this.camPos.y + Math.sin(t * 0.23 + 1) * 0.003, this.camPos.z + Math.cos(t * 0.27) * 0.004);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.camLook);
    if (Math.abs(camera.fov - this.camFov) > 1e-3) { camera.fov = this.camFov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }

  // ---- dice ------------------------------------------------------------------------------------------------------
  setRow(side, values) {
    values.forEach((v, i) => this.dice[side][i].setRest(v, this._jitter()));
  }

  hideRow(side) { for (const d of this.dice[side]) { d.show(false); d.anim = null; d.liftTarget = 0; d.lift = 0; } }

  _jitter() { return { x: (this.r() - 0.5) * 0.008, z: (this.r() - 0.5) * 0.008, yaw: (this.r() - 0.5) * 0.45 }; }

  // Roll the dice at `indices` (the rest keep their place) so they end showing values[i].
  roll(side, indices, values, { onEvent, shakeTime = 0.75, stagger = 0.045 } = {}) {
    const dir = side === 'player' ? -1 : 1;
    const handZ = side === 'player' ? HAND_Z : -HAND_Z;
    const r = this.r;
    const promises = [];
    const cx = indices.length ? indices.reduce((a, i) => a + (i - 2) * SLOT, 0) / indices.length * 0.4 : 0;
    indices.forEach((i, n) => {
      const die = this.dice[side][i];
      const jit = this._jitter();
      const value = values[i];
      const cluster = new THREE.Vector3(cx + (n - (indices.length - 1) / 2) * 0.026, REST_Y + 0.17 + (r() - 0.5) * 0.02, handZ + (r() - 0.5) * 0.02);
      const parts = [];
      const events = [];
      let t = 0;
      const addPart = (plan) => {
        parts.push({ plan, t0: t });
        for (const ev of plan.events || []) events.push({ t: t + ev.t, kind: ev.kind, strength: ev.strength, done: false });
        t += plan.duration;
      };
      let qHand;
      if (die.visible) {
        // pick it up
        qHand = randomQuat(r);
        addPart(planHop({ p0: die.pos.clone(), p1: cluster, q0: die.quat.clone(), q1: qHand, dur: 0.3 + n * 0.02, apex: 0.045, turns: 0 }));
      } else {
        qHand = randomQuat(r);
        die.show(true);
        die.appear = 0;
        die.pos.copy(cluster);
        die.quat.copy(qHand);
        this._once(die);
      }
      events.push({ t: t, kind: 'rattle', strength: 1, done: false });
      const shake = planShake({ center: cluster, q0: qHand, dur: shakeTime, rand: r, amp: 0.011 });
      addPart(shake);
      const rollPlan = planRoll({
        start: cluster, q0: qHand, slot: slotPos(side, i).add(new THREE.Vector3(jit.x, 0, jit.z)), value, yaw: jit.yaw, size: DIE, tableY: CLOTH_Y, rand: r, dir, delay: n * stagger,
      });
      events.push({ t, kind: 'throw', strength: 1, done: false });
      addPart(rollPlan);
      die.value = value;
      die.restPos = slotPos(side, i).add(new THREE.Vector3(jit.x, 0, jit.z));
      die.restQuat = faceUp(value, jit.yaw);
      die.liftTarget = 0;
      die.lift = 0;
      promises.push(new Promise((resolve) => {
        die.anim = { parts, events, duration: t, t: 0, resolve, onEvent };
      }));
    });
    return Promise.all(promises);
  }

  _once() { /* spawn hook for the first roll (kept for symmetry) */ }

  lift(side, mask) { this.dice[side].forEach((d, i) => { d.liftTarget = mask?.[i] ? 1 : 0; }); }

  setFocus(index) { this.dice.player.forEach((d, i) => { d.focus = i === index; }); }

  setSelected(mask) { this.dice.player.forEach((d, i) => { d.selected = !!mask?.[i]; }); }

  // kind 'made': the listed dice glow and the others dim. null clears.
  light(side, indices, kind) {
    this.dice[side].forEach((d, i) => {
      if (kind === 'made') { d.glowTarget = indices.includes(i) ? 1 : 0; d.dimTarget = indices.includes(i) ? 0 : 1; }
      else { d.glowTarget = 0; d.dimTarget = 0; }
    });
  }

  clearLights() { for (const s of ['player', 'opp']) this.light(s, [], null); }

  // ---- picking and labels -----------------------------------------------------------------------------------------
  _ndc(clientX, clientY) {
    const el = this.G.renderer.domElement;
    const b = el.getBoundingClientRect();
    return new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
  }

  pick(clientX, clientY) {
    const camera = this.G.camera;
    this._raycaster.setFromCamera(this._ndc(clientX, clientY), camera);
    const ray = this._raycaster.ray;
    let best = -1, bd = 1e9;
    this.dice.player.forEach((d, i) => {
      if (!d.visible || d.anim) return;
      const c = this.group.localToWorld(d.pos.clone());
      // forgiving: a sphere a bit larger than the die
      const rad = DIE * 0.95;
      const oc = c.clone().sub(ray.origin);
      const tca = oc.dot(ray.direction);
      if (tca < 0) return;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 <= rad * rad && tca < bd) { bd = tca; best = i; }
    });
    return best;
  }

  screenOf(side, i, dy = 0, dz = 0) {
    const d = this.dice[side][i];
    const v = this.group.localToWorld(d.restPos.clone().add(new THREE.Vector3(0, dy, dz)));
    v.project(this.G.camera);
    const el = this.G.renderer.domElement;
    const b = el.getBoundingClientRect();
    return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height, behind: v.z > 1 };
  }

  screenOfPoint(x, y, z) {
    const v = this.group.localToWorld(new THREE.Vector3(x, y, z));
    v.project(this.G.camera);
    const b = this.G.renderer.domElement.getBoundingClientRect();
    return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height };
  }

  get busy() { return [...this.dice.player, ...this.dice.opp].some((d) => d.anim); }

  // ---- per frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    for (const s of ['player', 'opp']) for (const d of this.dice[s]) d.update(dt, this.time);
    this.pot.update(dt, performance.now());
  }

  dispose() {
    for (const s of ['player', 'opp']) for (const d of this.dice[s]) d.dispose();
    this.pot.dispose();
    this.cloth.material.map.dispose();
    this.cloth.material.dispose();
    this.cloth.geometry.dispose();
    this.planeGeo.dispose();
    this.ringGeo.dispose();
    this.G.scene.remove(this.group);
  }
}
