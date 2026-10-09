// Ritual and folk props: the Marzanna effigy (many states), effigy head, ribbon pole, offering,
// grave post, bones, skull, signpost, horse head carving, roof finial.
import * as THREE from 'three';
import { Kit, TAU } from './kit.js';

const STRAW = [0xe8d9a6, 0xdcc98c, 0xd0bd7c, 0xe2d29a];
const RED = [0x8a281e, 0x962e22, 0x7a2219];
// Ribbons catch the low sun hard; keep them deeper than the embroidery red.
const RIBBON = [0x6e2018, 0x7a241a, 0x631c14];

// ---- the carved pale face and straw hair, shared by effigy and effigyHead ----------------------
function addHead(k, o = {}) {
  const tint = o.tint || 0xe6dac4;
  const y = o.y == null ? 1.5 : o.y;
  const s = o.scale || 1;
  const burn = o.burn || 0;
  const c = burn ? 0x3a2e26 : tint;
  k.with({ pos: [0, y, 0], rot: [o.tilt || 0, o.turn || 0, o.roll || 0], scale: s }, () => {
    k.sph('face', 0.1, { scale: [0.9, 1.16, 0.96], ws: 12, hs: 9, flat: true, tint: c, jitter: 0.002, grime: 0, var: 0.06, tile: 0.45 });
    // Chin, jaw weight and small ears
    k.sph('face', 0.055, { pos: [0, -0.095, 0.03], scale: [1.0, 0.8, 0.9], ws: 8, hs: 6, tint: c, grime: 0, tile: 0.45 });
    for (const sx of [-1, 1]) k.sph('face', 0.022, { pos: [sx * 0.092, -0.01, 0.0], scale: [0.5, 1.2, 0.9], ws: 6, hs: 5, tint: c, grime: 0, tile: 0.45 });
    // Nose wedge, brow ridge, cheekbones
    k.box('face', 0.04, 0.07, 0.05, { pos: [0, -0.012, 0.094], rot: [0.35, 0, 0], taper: [0.45, 0.5], tint: c, grime: 0, var: 0.04, tile: 0.45 });
    k.box('face', 0.15, 0.018, 0.034, { pos: [0, 0.047, 0.082], rot: [0.1, 0, 0], tint: burn ? c : 0xd8c8ae, grime: 0, tile: 0.45 });
    for (const sx of [-1, 1]) k.sph('face', 0.03, { pos: [sx * 0.062, -0.025, 0.065], scale: [1, 0.8, 0.8], ws: 6, hs: 5, tint: c, grime: 0, tile: 0.45 });
    // Painted brows, deep dark eye sockets with almond eyes, mouth and cheek dots in folk red.
    for (const sx of [-1, 1]) {
      k.box('matte', 0.05, 0.009, 0.01, { pos: [sx * 0.042, 0.037, 0.098], rot: [0, 0, sx * -0.18], tint: 0x2a1a12, grime: 0, var: 0 });
      k.sph('matte', 0.02, { pos: [sx * 0.042, 0.02, 0.087], scale: [1.55, 0.7, 0.5], ws: 6, hs: 5, tint: 0x5a4636, grime: 0, var: 0 });
      k.sph('matte', 0.0155, { pos: [sx * 0.042, 0.02, 0.0925], scale: [1.6, 0.62, 0.35], ws: 6, hs: 5, tint: 0xece6d8, grime: 0, var: 0 });
      k.sph('matte', 0.0075, { pos: [sx * 0.04, 0.02, 0.0975], scale: [1, 1.2, 0.5], ws: 5, hs: 4, tint: 0x14100c, grime: 0, var: 0 });
      k.cyl('paint', 0.02, 0.02, 0.004, { pos: [sx * 0.063, -0.045, 0.074], rot: [Math.PI / 2 - 0.35, sx * 0.3, 0], radial: 8, tint: burn ? 0x2a1a14 : RED[0], grime: 0, var: 0, cap: 'paint' });
    }
    k.box('paint', 0.05, 0.008, 0.012, { pos: [0, -0.066, 0.092], tint: burn ? 0x2a1a14 : 0x8a2a20, grime: 0, var: 0, rot: [0.15, 0, 0] });
    k.box('paint', 0.04, 0.007, 0.012, { pos: [0, -0.078, 0.09], tint: burn ? 0x2a1a14 : 0x7a1f18, grime: 0, var: 0, rot: [0.1, 0, 0] });
  });
  // Straw hair: strands hanging from the crown, longer at the back; a fringe at the sides only.
  const n = o.hairCount || 56;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k.rs(0.07);
    const front = 0.5 + 0.5 * Math.cos(a); // 1 at the face, 0 behind
    if (front > 0.88) continue;
    const len = (o.hair == null ? 1 : o.hair) * (0.1 + (1 - front) * 0.42 + k.r(0, 0.1));
    if (len < 0.04) continue;
    const r0 = 0.1 + 0.02 * (1 - front);
    const topY = y + 0.075 - 0.025 * (1 - front) * 0 + (1 - front) * 0.015;
    const burnt = burn > 0.5 && k.chance(0.7);
    if (burnt) continue;
    k.blade('straw', 0.034 * s, len, {
      pos: [Math.sin(a) * r0 * s, topY - len / 2 - 0.02 * front, Math.cos(a) * r0 * s - 0.005], yaw: a, rot: [-0.1 - k.r(0, 0.18) - (1 - front) * 0.05, 0, k.rs(0.06)],
      taper: 0.35, tint: o.frozen ? k.pick([0xe0ecf4, 0xd0dfe8, 0xc4d6e2]) : k.pick(STRAW), var: 0.12, grime: 0.05, tile: 0.4,
    });
  }
  // Wreath of twisted straw with a few red bits.
  if (o.wreath !== false && !burn) {
    k.with({ pos: [0, y + 0.098 * s, 0.0], rot: [0.12, 0, 0] }, () => {
      k.torus('straw', 0.092 * s, 0.02 * s, { rot: [Math.PI / 2, 0, 0], seg: 16, rseg: 5, tint: o.frozen ? 0xdbe8f0 : 0xc8b070, var: 0.18, grime: 0, jitter: 0.004 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        k.box('ribbon', 0.014, 0.022, 0.014, { pos: [Math.sin(a) * 0.1 * s, 0, Math.cos(a) * 0.1 * s], rot: [0, a, 0], tint: RED[i % 3], grime: 0, var: 0 });
      }
    });
  }
  // The frozen ones carry an ice crust over the face.
  if (o.ice) {
    k.with({ pos: [0, y, 0], rot: [o.tilt || 0, o.turn || 0, o.roll || 0], scale: s }, () => {
      k.sph('ice', 0.108, { scale: [0.9, 1.16, 0.96], ws: 12, hs: 8, p0: Math.PI / 2 - 0.85, p1: 1.7, t0: 0.5, t1: 2.5, tint: 0xd6e8f4, grime: 0, jitter: 0.004, var: 0.03 });
    });
  }
}

// ---- body ----------------------------------------------------------------------------------------
function twine(k, y, r, tint = RED[0], thick = 0.009) {
  k.torus('ribbon', r, thick, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 4, tint, grime: 0, var: 0.05 });
}

// Red-thread knot at the chest with dangling ends (Dobra's signature).
function addKnot(k, y, z, burn = 0) {
  if (burn > 0.6) return;
  const red = RED[0];
  k.with({ pos: [0, y, z], rot: [0, 0, 0] }, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const t = (j / 8) * TAU;
        pts.push([Math.cos(t) * 0.032 + Math.cos(a) * 0.012, Math.sin(t) * 0.022 + Math.sin(a) * 0.012, Math.sin(t * 2 + a) * 0.012]);
      }
      k.tube('ribbon', pts, 0.0065, { closed: true, radial: 4, segs: 14, tint: red, grime: 0, var: 0.05 });
    }
    k.sph('ribbon', 0.012, { ws: 6, hs: 5, tint: 0x7a2018, grime: 0 });
    for (const sx of [-1, 1]) {
      k.hang('ribbon', 0.014, 0.3 + k.r(0, 0.1), { pos: [sx * 0.012, -0.01, 0.01], rot: [0, 0, sx * 0.08], tint: RED[sx > 0 ? 1 : 2], sway: 0.9, sy: 5, grime: 0, var: 0 });
    }
  });
}

function addArm(k, side, ang, len, o = {}) {
  const sleeveTint = o.tint || 0xffffff;
  const mat = o.straw ? 'straw' : 'dress';
  k.with({ pos: [side * 0.14, o.shoulder, 0], rot: [o.fwd || 0, 0, side * ang] }, () => {
    k.cyl(mat, 0.078, 0.052, len, {
      pos: [0, -len / 2, 0], radial: 9, tint: sleeveTint, grime: 0, jitter: o.straw ? 0.01 : 0.006, cap: null, uRepeat: 1, tile: 1.0, ...(o.straw ? {} : { sway: o.sway || 0.35, swayFrom: 0 }),
    });
    // Cuff: red embroidered band and a straw hand poking out.
    if (!o.straw) twine(k, -len + 0.03, 0.056, RED[0], 0.011);
    twine(k, -len + 0.012, 0.05, 0x8a7448, 0.008);
    k.cyl('straw', 0.04, 0.012, 0.15 + (o.handLen || 0), { pos: [0, -len - 0.07, 0], radial: 7, tint: o.frozen ? 0xdbe8f0 : k.pick(STRAW), jitter: 0.004, cap: null, grime: 0 });
    if (o.ice) for (let i = 0; i < 3; i++) k.cone('ice', 0.012, 0.06 + k.r(0, 0.1), { pos: [k.rs(0.04), -len - 0.02 - k.r(0, 0.03), k.rs(0.04)], rot: [Math.PI, 0, 0], radial: 5, tint: 0xd6e8f4, grime: 0 });
  });
}

function addBody(k, p) {
  const burn = p.burn || 0;
  const frozen = !!p.frozen;
  const white = burn ? 0x3a322c : frozen ? 0xe4eef6 : 0xf2ecde;
  const fadeTo = burn ? [0xe0d8cc, 0.55, 1.15] : null;
  const y0 = p.y0 || 0;
  const waist = (p.waistH || 0.88) + y0;
  const hem = p.seated ? 0.04 + y0 : 0.1 + y0;
  const prof = p.seated
    ? [[0.5, hem], [0.48, hem + 0.14], [0.42, hem + 0.3], [0.32, hem + 0.42], [0.2, waist - 0.05], [0.14, waist]]
    : [[0.5, hem], [0.47, hem + 0.1], [0.39, hem + 0.32], [0.29, hem + 0.52], [0.2, hem + 0.68], [0.14, waist]];
  const top = prof[prof.length - 1][1];
  const burntSkirt = burn > 0.85;
  if (!p.bare && !burntSkirt) {
    k.lathe('dress', prof, {
      radial: 22, tint: white, uRepeat: 1, tile: 1.0, grime: 0.3, var: 0.05, jitter: 0.004,
      ripple: { n: 8, amp: 0.06, from: hem + 0.25, to: hem + 0.7, phase: k.r(0, TAU) },
      sway: p.sway == null ? 0.55 : p.sway, swayFrom: top, ...(fadeTo ? { fade: fadeTo } : {}),
    });
  } else if (p.bare) {
    // Unfinished: a lashed bundle of straw in the shape of the skirt.
    k.lathe('straw', [[0.2, hem], [0.23, hem + 0.2], [0.2, hem + 0.45], [0.15, hem + 0.7], [0.115, waist]], { radial: 14, tint: 0xd8c78a, jitter: 0.03, uRepeat: 2, grime: 0.3, tile: 0.7 });
    for (const y of [hem + 0.12, hem + 0.34, hem + 0.58]) twine(k, y, 0.215 - (y - hem) * 0.1, 0x6a5a3c, 0.012);
  } else {
    // Burnt away: charred straw stump with black rags.
    k.lathe('straw', [[0.12, hem + 0.1], [0.17, hem + 0.35], [0.14, hem + 0.6], [0.12, waist]], { radial: 10, tint: 0x28221e, jitter: 0.04, uRepeat: 2, grime: 0, tile: 0.7 });
    k.lathe('dress', [[0.24, hem + 0.34], [0.2, hem + 0.5], [0.15, waist]], { radial: 10, tint: 0x2a2420, uRepeat: 1, ripple: { n: 6, amp: 0.06, from: -9, to: 9 }, jitter: 0.02, sway: 0 });
  }
  // Straw showing under the hem: the figure is a bundle of stalks in a dress.
  if (!p.seated && !p.bare && !burntSkirt) {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + k.rs(0.1);
      const L = 0.1 + k.r(0, 0.1);
      k.blade('straw', 0.045, L, { pos: [Math.sin(a) * 0.46, hem + 0.02 - L / 2 + 0.03, Math.cos(a) * 0.46], yaw: a, rot: [-0.12 - k.r(0, 0.15), 0, 0], tint: frozen ? 0xdbe8f0 : k.pick(STRAW), var: 0.12, grime: 0.1, taper: 0.5 });
    }
  }
  // Bodice
  const bod = [[0.14, waist], [0.15, waist + 0.1], [0.165, waist + 0.26], [0.15, waist + 0.38], [0.075, waist + 0.45]];
  if (!p.bare) {
    k.lathe('dress', bod, { radial: 14, tint: white, uRepeat: 1, tile: 0.6, uvRect: [0, 0.86, 1, 1.0], grime: 0.1, var: 0.04, scale: [1.0, 1.0, 0.78], ...(fadeTo ? { fade: fadeTo } : {}) });
  } else {
    k.lathe('straw', bod, { radial: 12, tint: 0xd8c78a, jitter: 0.02, uRepeat: 2, tile: 0.6, scale: [1.0, 1.0, 0.78] });
    for (const y of [waist + 0.08, waist + 0.22, waist + 0.34]) twine(k, y, 0.15, 0x6a5a3c, 0.01);
  }
  // Belt of red cloth with a knot and tails
  if (!p.bare && burn < 0.8) {
    k.cyl('ribbon', 0.148, 0.148, 0.05, { pos: [0, waist + 0.02, 0], radial: 14, open: true, tint: RED[1], grime: 0, scale: [1, 1, 0.8], jitter: 0.003 });
    for (const sx of [-1, 1]) k.hang('ribbon', 0.06, 0.55, { pos: [sx * 0.07, waist + 0.0, 0.125], tint: RED[sx > 0 ? 0 : 2], sway: p.frozen ? 0 : 0.9, wave: 0.02, sy: 6, grime: 0, var: 0.02 });
  }
  // Neck, twine wraps and the shoulders' straw padding.
  const nk = waist + 0.45;
  k.torus('straw', 0.075, 0.03, { pos: [0, nk + 0.02, 0], rot: [Math.PI / 2, 0, 0], seg: 12, rseg: 5, tint: frozen ? 0xdbe8f0 : 0xd8c78a, var: 0.15, grime: 0, jitter: 0.005 });
  k.cyl('straw', 0.052, 0.062, 0.14, { pos: [0, nk + 0.02, 0], radial: 8, tint: frozen ? 0xdbe8f0 : burn ? 0x28221e : 0xd8c78a, jitter: 0.006, cap: null, grime: 0 });
  for (let i = 0; i < 3; i++) twine(k, nk - 0.03 + i * 0.03, 0.056, RED[i % 3], 0.008);
  addKnot(k, waist + 0.2, 0.135 * 0.78 + 0.02, burn);
  // Arms
  const arm = p.arms || 'down';
  if (arm !== 'none') {
    const ang = arm === 'out' ? 1.38 : arm === 'lap' ? 0.18 : arm === 'limp' ? 0.1 : 0.32;
    const fwd = arm === 'lap' ? -1.05 : 0;
    for (const side of [-1, 1]) {
      if (p.armMissing === side) continue;
      addArm(k, side, ang + k.rs(0.05) + (arm === 'down' ? side * 0.05 : 0), 0.55 - (burn ? 0.12 : 0), { shoulder: waist + 0.39, fwd, tint: white, straw: p.bare, frozen, ice: p.ice && !p.bare, sway: p.frozen ? 0 : 0.35 });
    }
  }
  // Head (not on the half-made one: it waits on the bench).
  if (p.head !== false) {
    addHead(k, { y: nk + 0.22, scale: 1.4, tilt: p.tilt || 0, turn: p.turn || 0, roll: p.roll || 0, burn, frozen, ice: p.ice, hair: burn ? 0.4 : 1, wreath: !p.bare });
  } else {
    k.sph('straw', 0.12, { pos: [0, nk + 0.2, 0], scale: [0.95, 1.1, 0.95], ws: 10, hs: 8, tint: 0xd0bd7c, jitter: 0.015, tile: 0.4 });
    twine(k, nk + 0.1, 0.08, 0x6a5a3c, 0.01);
  }
  return nk + 0.22;
}

export function effigy(o = {}) {
  const variant = o.variant || 'pole';
  // Burning and burnt figures carry no snow: it has melted off (and the shader would whiten their shoulders).
  const k = new Kit('effigy', variant === 'burnt' || variant === 'burning' ? { ...o, indoor: true } : o);
  const s = (o.scale || 1) * (1 + k.rs(0.05));
  k.push({ yaw: o.yaw || 0, scale: s });
  const lean = k.rs(0.05);
  // Anchors in effigy space (the figure is ~1.6 m; 'pole' lifts it 0.7 m): where the knot and the face are.
  k.anchor('base', 0, 0, 0); k.anchor('head', 0, (variant === 'pole' ? 0.7 : 0) + 1.77, 0.1); k.anchor('knot', 0, (variant === 'pole' ? 0.7 : 0) + 1.08, 0.2);

  if (variant === 'pole' || variant === 'standing' || variant === 'frozen' || variant === 'burnt' || variant === 'burning') {
    const raised = variant === 'pole' ? 0.7 : 0;
    const burnt = variant === 'burnt' ? 1 : variant === 'burning' ? 0.5 : 0;
    const frozen = variant === 'frozen';
    k.push({ rot: [0, 0, burnt ? 0.28 : lean], pos: [burnt ? 0.1 : 0, 0, 0] });
    // Central pole through the body, crossbar for the arms.
    const poleTop = 1.62 + raised;
    k.cyl('wood', 0.034, 0.046, poleTop + 0.25, { pos: [0, (poleTop - 0.25) / 2 + 0.12, -0.01], radial: 6, tint: burnt ? 0x2a2420 : 0xb8a690, jitter: 0.005, cap: 'logEnd' });
    if (variant === 'pole') k.cyl('wood', 0.025, 0.025, 1.1, { pos: [0, 1.27 + raised, -0.01], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0xb8a690, cap: 'logEnd' });
    const headY = addBody(k, {
      y0: raised, arms: o.arms || (burnt === 1 ? 'down' : variant === 'standing' || frozen ? 'down' : 'out'), burn: burnt, frozen, ice: frozen,
      tilt: burnt ? 0.45 : 0.0, roll: burnt ? 0.2 : frozen ? 0.04 : k.rs(0.08), turn: k.rs(0.2), armMissing: burnt === 1 ? 1 : 0, sway: frozen ? 0 : 0.55,
    });
    void headY;
    if (burnt) {
      // Coal glow in the charred core (inside the leaning frame).
      k.blob('coal', 0.2, { pos: [0.0, 0.62 + raised, 0.0], scale: [1, 0.9, 0.8], detail: 1, tint: 0xffffff, grime: 0, jitter: 0.03, var: 0.1 });
      k.blob('coal', 0.12, { pos: [0.05, 1.02 + raised, 0.08], detail: 1, tint: 0xffffff, grime: 0, jitter: 0.03 });
      k.fx('smoke', [0.0, 1.0 + raised, 0.0], { height: 5, rate: 0.7, size: 0.5, opacity: 0.3, warm: 0.4 });
      if (variant === 'burning') k.fx('fire', [0.0, 0.7, 0.0], { scale: 1.0, radius: 0.28, height: 0.9, light: true, smoke: true });
    }
    k.pop();
    // Support: stakes lashed at the back, or a mound of stones and snow around the foot of the pole.
    for (let i = 0; i < 2; i++) {
      const a = Math.PI + (i - 0.5) * 1.2;
      k.cyl('wood', 0.025, 0.03, 1.5, { pos: [Math.sin(a) * 0.38, 0.62, Math.cos(a) * 0.38], rot: [Math.cos(a) * -0.5, 0, Math.sin(a) * 0.5], radial: 5, tint: burnt ? 0x2a2420 : 0xa89684, cap: 'logEnd' });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      k.blob('stone', 0.11, { pos: [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], scale: [1.2, 0.7, 1], detail: 1, tint: k.pick([0xffffff, 0xd0d0d0, 0xb0b0b8]) });
    }
    if (frozen) {
      // Icicles from the hem and ice pooled around the foot.
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + k.rs(0.1);
        const r = 0.41;
        k.cone('ice', 0.018, k.r(0.07, 0.24), { pos: [Math.cos(a) * r, 0.1 + raised - 0.05, Math.sin(a) * r], rot: [Math.PI, 0, 0], radial: 5, tint: k.pick([0xd8ecf8, 0xc4dcec]), grime: 0 });
      }
      k.cyl('ice', 0.6, 0.65, 0.04, { pos: [0, 0.02, 0], radial: 10, tint: 0xcfe4f2, jitter: 0.02, grime: 0 });
      k.mound(0.3, 0.07, 0.3, { pos: [0, 1.74 + raised, 0.0], jseed: 3 });
      for (const sx of [-1, 1]) k.mound(0.2, 0.04, 0.2, { pos: [sx * 0.2, 1.37 + raised, 0.0], jseed: 4 + sx });
    }
    if (burnt) {
      k.plane('decal', 1.8, 1.8, { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x1c1a18, grime: 0, var: 0.2 });
    }
    k.circleCollider(0.4, { h: 1.7 + raised });
  } else if (variant === 'hung') {
    // Gallows frame: two posts and a beam, the effigy hanging by a rope under the arms.
    const H = 3.0, Wd = 1.7;
    for (const sx of [-1, 1]) {
      k.cyl('wood', 0.06, 0.075, H, { pos: [sx * Wd / 2, H / 2 - 0.1, 0], radial: 7, tint: 0xa89684, jitter: 0.008, cap: 'logEnd' });
      k.cyl('wood', 0.04, 0.045, 0.9, { pos: [sx * (Wd / 2 - 0.3), H - 0.5, 0], rot: [0, 0, sx * 0.9], radial: 6, tint: 0xa89684, cap: 'logEnd' });
    }
    k.cyl('wood', 0.055, 0.055, Wd + 0.5, { pos: [0, H - 0.1, 0], rot: [0, 0, Math.PI / 2], radial: 7, tint: 0xb8a690, jitter: 0.008, cap: 'logEnd' });
    k.mound(Wd + 0.2, 0.12, 0.2, { pos: [0, H - 0.04, 0], jseed: 2 });
    k.push({ pos: [0, 0.38, 0], rot: [0.05, 0, k.rs(0.06)], yaw: k.rs(0.5) });
    k.tube('rope', [[0.0, 2.58, 0], [0.0, 1.9, 0.0], [0.0, 1.78, 0.0]], 0.014, { radial: 5, tint: 0xb89c6c });
    addBody(k, { y0: 0, arms: 'limp', tilt: 0.42, roll: k.rs(0.1), sway: 0.9, turn: k.rs(0.4) });
    k.pop();
    k.boxCollider(Wd / 2 + 0.2, 0.2, { h: 3.0 });
  } else if (variant === 'seated') {
    // On a stump, hands in the lap, head slightly bowed.
    k.cyl('bark', 0.26, 0.32, 0.4, { pos: [0, 0.2, 0], radial: 9, cap: 'logEnd', noBottom: true, jitter: 0.015, tint: 0xd8cdc0 });
    addBody(k, { y0: 0, waistH: 0.56, arms: 'lap', seated: true, tilt: 0.2, roll: k.rs(0.08), sway: 0.6 });
    k.circleCollider(0.4, { h: 1.3 });
  } else if (variant === 'half') {
    // Half-made: a stand with the straw body lashed, no head yet; the dress is folded on the stand, the face waits on a stump.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wood', 0.03, 0.035, 1.1, { pos: [sx * 0.4, 0.53, sz * 0.2], rot: [sz * -0.12, 0, sx * -0.06], radial: 5, tint: 0xb8a690, cap: 'logEnd' });
    k.box('wood', 0.9, 0.05, 0.05, { pos: [0, 1.0, 0.13], tint: 0xa89684 });
    k.box('wood', 0.9, 0.05, 0.05, { pos: [0, 1.0, -0.13], tint: 0xa89684 });
    k.push({ pos: [0, 0.18, 0], rot: [0, 0, lean] });
    k.cyl('wood', 0.03, 0.04, 1.7, { pos: [0, 0.85, -0.01], radial: 6, tint: 0xb8a690, cap: 'logEnd' });
    addBody(k, { arms: 'down', bare: true, head: false, sway: 0 });
    k.pop();
    // Dress laid over the rail, red thread reel, loose straw on the ground
    k.plane('dress', 0.85, 0.9, {
      pos: [0.55, 1.0, 0.0], rot: [0, Math.PI / 2, 0.08], sy: 6, sx: 4, tint: 0xffffff, grime: 0.1,
      bend: (x, y) => [0, 0, Math.sin(y * 7) * 0.03 + (y < 0 ? 0.05 : -0.03)],
    });
    k.cyl('wood', 0.03, 0.03, 0.1, { pos: [-0.55, 0.05, 0.4], radial: 8, tint: 0xa89684 });
    k.cyl('ribbon', 0.036, 0.036, 0.08, { pos: [-0.55, 0.05, 0.4], radial: 8, tint: RED[0], grime: 0 });
    for (let i = 0; i < 20; i++) {
      const a = k.r(0, TAU), d = k.r(0.2, 0.9);
      k.blade('straw', 0.025, k.r(0.25, 0.55), { pos: [Math.cos(a) * d, k.r(0.015, 0.08), Math.sin(a) * d], rot: [Math.PI / 2 + k.rs(0.2), k.r(0, TAU), 0], tint: k.pick(STRAW), var: 0.12, grime: 0.2 });
    }
    // The face, resting on a small block.
    k.cyl('bark', 0.1, 0.12, 0.2, { pos: [0.75, 0.1, 0.55], radial: 8, cap: 'logEnd', noBottom: true, tint: 0xd8cdc0 });
    k.push({ pos: [0.75, 0.2 - 1.5 + 0.1, 0.55], rot: [-0.2, 0.5, 0] });
    addHead(k, { y: 1.5, hair: 0.5, wreath: false, hairCount: 20 });
    k.pop();
    k.circleCollider(0.5, { h: 1.2 });
  }
  k.pop();
  k.ud.variant = variant;
  k.ud.align = 0.2;
  return k.build();
}

export function effigyHead(o = {}) {
  const k = new Kit('effigyHead', o);
  const frozen = o.variant === 'frozen';
  k.push({ yaw: o.yaw || 0 });
  // On a short stake; the carved faces differ a little from head to head.
  k.cyl('wood', 0.03, 0.04, 0.6, { pos: [0, 0.3, -0.01], radial: 6, tint: 0xb8a690, cap: 'logEnd' });
  k.push({ scale: 1 + k.rs(0.06) });
  addHead(k, { y: 0.72, tilt: k.rs(0.12), turn: k.rs(0.4), roll: k.rs(0.1), hair: 0.55 + k.r(0, 0.4), frozen, ice: frozen, hairCount: 34, burn: o.variant === 'burnt' ? 1 : 0 });
  twine(k, 0.62, 0.052, RED[0], 0.011);
  k.pop();
  if (!o.indoor) k.mound(0.26, 0.05, 0.22, { pos: [0, 0.855, -0.01], jseed: 2 });
  k.pop();
  k.circleCollider(0.15, { h: 1.0 });
  k.ud.align = 0.3;
  return k.build();
}

export function ribbonPole(o = {}) {
  const k = new Kit('ribbonPole', o);
  const H = (o.height || 3.4) + k.rs(0.2);
  k.push({ yaw: o.yaw || 0, rot: [k.rs(0.03), 0, k.rs(0.03)] });
  // Birch pole, planted in a cairn of stones and snow.
  k.cyl('birch', 0.045, 0.075, H, { pos: [0, H / 2 - 0.2, 0], radial: 8, tint: 0xffffff, jitter: 0.004, cap: 'logEnd', uRepeat: 1 });
  for (let i = 0; i < 3; i++) {
    const y = k.r(0.9, H * 0.6);
    k.cyl('bark', 0.012, 0.018, 0.2, { pos: [Math.sin(i * 2.1) * 0.06, y, Math.cos(i * 2.1) * 0.06], rot: [Math.cos(i * 2.1) * 0.9, 0, -Math.sin(i * 2.1) * 0.9], radial: 4, tint: 0x6a5a4c, cap: null });
  }
  // Twig crown at the top
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    k.cyl('bark', 0.007, 0.014, 0.34, { pos: [Math.sin(a) * 0.08, H - 0.15, Math.cos(a) * 0.08], rot: [Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55], radial: 4, tint: 0x8a7a68, cap: null });
  }
  // Ribbons: red cloth strips of varied lengths tied at different heights.
  const nr = o.ribbons || 10;
  for (let i = 0; i < nr; i++) {
    const y = H - 0.3 - k.r(0, 1.0) - (i % 3) * 0.08;
    const a = (i / nr) * TAU * 2.3 + k.rs(0.3);
    const len = k.r(0.9, 1.9);
    twine(k, y, 0.058, RIBBON[i % 3], 0.014);
    k.hang('ribbon', k.r(0.05, 0.1), len, { pos: [Math.sin(a) * 0.06, y, Math.cos(a) * 0.06], yaw: a, tint: RIBBON[i % 3], sway: 1.0, wave: 0.02, sy: 5, grime: 0, var: 0.03 });
  }
  // Cairn
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    k.blob('stone', 0.14, { pos: [Math.cos(a) * 0.32, 0.09, Math.sin(a) * 0.32], scale: [1.2, 0.75, 1], detail: 1, tint: k.pick([0xffffff, 0xd0d0d0, 0xb0b0b8]) });
  }
  if (!o.indoor) k.mound(0.9, 0.2, 0.9, { pos: [0, 0.1, 0], jseed: 4 });
  k.pop();
  k.circleCollider(0.4, { h: 1.2 });
  k.ud.align = 0;
  return k.build();
}

// Offering: bowl of milk (frozen), bread, candle, and a red ribbon on a flat stone. variant: 'bowl' | 'candle' | 'bread'
export function offering(o = {}) {
  const k = new Kit('offering', o);
  const variant = o.variant || k.pick(['bowl', 'bowl', 'candle', 'bread']);
  k.push({ yaw: k.r(0, TAU) });
  // Flat stone
  k.blob('stone', 0.28, { pos: [0, 0.03, 0], scale: [1.0, 0.18, 0.8], detail: 1, tint: 0xd0d0d4, jitter: 0.03 });
  const y = 0.075;
  if (variant !== 'candle') {
    k.lathe('wood', [[0.001, 0], [0.05, 0.003], [0.085, 0.035], [0.09, 0.04], [0.082, 0.038], [0.045, 0.01]], { pos: [-0.04, y, 0.02], radial: 12, tint: 0xc4ae98, uRepeat: 1, grime: 0.15 });
    if (variant === 'bowl') k.cyl('snowMound', 0.075, 0.075, 0.006, { pos: [-0.04, y + 0.03, 0.02], radial: 12, tint: 0xf4f4ee, grime: 0, cap: 'snowMound' });
  }
  if (variant === 'bread' || variant === 'bowl') {
    k.blob('burlap', 0.06, { pos: [0.12, y + 0.025, -0.03], scale: [1.4, 0.7, 1.0], detail: 1, tint: 0xc8a068, jitter: 0.008 });
  }
  // Candle stub with a flame.
  k.cyl('matte', 0.017, 0.02, 0.07 + k.r(0, 0.05), { pos: [0.1, y + 0.04, 0.1], radial: 7, tint: 0xece2c8, grime: 0, jitter: 0.002 });
  k.sph('matte', 0.022, { pos: [0.1, y + 0.012, 0.1], scale: [1, 0.3, 1], ws: 6, hs: 4, tint: 0xece2c8, grime: 0 });
  k.fx('candle', [0.1, y + 0.1 + 0.02, 0.1], { scale: 1.2, light: false });
  k.anchor('flame', 0.1, y + 0.1, 0.1);
  // Red ribbon and a fir twig
  k.hang('ribbon', 0.025, 0.25, { pos: [-0.16, y + 0.02, -0.1], rot: [Math.PI / 2 - 0.1, 0, 0], tint: RED[0], sway: 0, grime: 0, var: 0.02 });
  for (let i = 0; i < 5; i++) k.cyl('matte', 0.004, 0.004, 0.14, { pos: [0.0, y + 0.01, -0.12], rot: [Math.PI / 2 - 0.05, (i - 2) * 0.35, 0], radial: 3, tint: 0x2f3d2a, cap: null, grime: 0 });
  if (!o.indoor) k.mound(0.3, 0.025, 0.2, { pos: [-0.14, 0.05, 0.1], jseed: 2 });
  k.pop();
  k.ud.align = 0.5;
  return k.build();
}

export function gravePostSmall(o = {}) {
  const k = new Kit('gravePostSmall', o);
  const H = 0.95 + k.rs(0.15);
  const variant = o.variant || 'plain';
  k.push({ yaw: o.yaw || 0, rot: [k.rs(0.05), 0, k.rs(0.07)] });
  // Squared post with a little shingled roof, a carved sun disc painted red and cloth strips tied on.
  k.box('wood', 0.12, H, 0.1, { pos: [0, H / 2 - 0.1, 0], tint: k.pick([0xc4ae98, 0xa08a74, 0xb8a690]), jitter: 0.005, seg: [1, 4, 1] });
  k.cyl('paint', 0.045, 0.045, 0.02, { pos: [0, H * 0.55, 0.055], rot: [Math.PI / 2, 0, 0], radial: 10, tint: RED[0], cap: 'paint', grime: 0.1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    k.box('paint', 0.012, 0.028, 0.012, { pos: [Math.cos(a) * 0.065, H * 0.55 + Math.sin(a) * 0.065, 0.058], rot: [0, 0, a - Math.PI / 2], tint: RED[0], grime: 0, var: 0 });
  }
  // Roof: two boards in a V with snow on top
  for (const sx of [-1, 1]) k.box('planks', 0.13, 0.016, 0.16, { pos: [sx * 0.05, H - 0.02, 0], rot: [0, 0, sx * -0.55], tint: 0x8a7a68, jitter: 0.003 });
  if (!o.indoor) k.mound(0.18, 0.05, 0.14, { pos: [0, H + 0.01, 0], jseed: 2 });
  // Cloth strips tied to the post
  for (let i = 0; i < 2; i++) k.hang('ribbon', 0.025, 0.2 + i * 0.12, { pos: [0.065, H * 0.75 - i * 0.1, 0.02], yaw: Math.PI / 2, tint: RED[i], sway: 1.0, grime: 0, var: 0 });
  // Mound and small offerings
  k.blob('snowMound', 0.4, { pos: [0, 0.0, 0.2], scale: [1.0, 0.25, 1.4], detail: 1, tint: 0xf4f6fa, grime: 0, jitter: 0.03 });
  if (variant === 'redThread') {
    // Wiesia's grave: flowers made of red thread.
    for (let i = 0; i < 9; i++) {
      const a = k.r(0, TAU), d = k.r(0.05, 0.22);
      const x = Math.cos(a) * d, z = 0.26 + Math.sin(a) * d * 0.7;
      k.cyl('matte', 0.003, 0.004, 0.16, { pos: [x, 0.18, z], rot: [k.rs(0.2), 0, k.rs(0.2)], radial: 3, tint: 0x4a5a3a, cap: null, grime: 0 });
      k.sph('ribbon', 0.026, { pos: [x, 0.27, z], scale: [1, 0.7, 1], ws: 7, hs: 5, tint: RED[i % 3], grime: 0, var: 0.1 });
    }
  } else if (k.chance(0.5)) {
    k.lathe('wood', [[0.001, 0], [0.04, 0.003], [0.06, 0.03], [0.055, 0.032], [0.035, 0.01]], { pos: [0.0, 0.07, 0.3], radial: 8, tint: 0xc4ae98, uRepeat: 1 });
  }
  k.pop();
  k.circleCollider(0.12, { h: H });
  k.ud.align = 0.5;
  return k.build();
}

// Bone material: pale matte. Used for bones and skulls.
const BONE = [0xa89a74, 0xb4a782, 0x9a8d68, 0xaa9d78];

export function skull(o = {}) {
  // Bones stay bare (no shader snow) so they read against the snow; mounds are placed by hand.
  const k = new Kit('skull', Object.assign({ indoor: true }, o));
  const variant = o.variant || k.pick(['wolf', 'wolf', 'cow', 'human']);
  k.push({ yaw: k.r(0, TAU), pos: [0, o.hang ? 0 : 0, 0] });
  const t = k.pick(BONE);
  const eye = (x, y, z, r) => k.sph('matte', r, { pos: [x, y, z], scale: [1, 1.1, 0.5], ws: 6, hs: 5, tint: 0x16120e, grime: 0, var: 0 });
  if (variant === 'human') {
    k.sph('matte', 0.09, { pos: [0, 0.1, 0], scale: [0.85, 1.0, 1.05], ws: 12, hs: 9, tint: t, grime: 0.1, var: 0.08 });
    k.box('matte', 0.1, 0.05, 0.08, { pos: [0, 0.035, 0.05], tint: t, grime: 0.1, taper: [0.8, 0.8] });
    k.box('matte', 0.08, 0.035, 0.07, { pos: [0, 0.0, 0.055], tint: 0xc8bea6, grime: 0.1, taper: [0.9, 0.9] });
    eye(-0.035, 0.1, 0.075, 0.022); eye(0.035, 0.1, 0.075, 0.022);
    k.cone('matte', 0.012, 0.03, { pos: [0, 0.072, 0.095], rot: [Math.PI, 0, 0], radial: 4, tint: 0x16120e, grime: 0 });
    for (let i = 0; i < 8; i++) k.box('matte', 0.01, 0.014, 0.01, { pos: [-0.03 + i * 0.0085, 0.005, 0.092], tint: 0xe8e0cc, grime: 0, var: 0 });
  } else {
    const cow = variant === 'cow';
    const s = cow ? 1.5 : 1;
    k.sph('matte', 0.06 * s, { pos: [0, 0.065 * s, 0], scale: [0.9, 0.85, 1.25], ws: 10, hs: 8, tint: t, grime: 0.1, var: 0.08 });
    k.box('matte', 0.055 * s, 0.045 * s, 0.14 * s, { pos: [0, 0.045 * s, 0.1 * s], rot: [0.12, 0, 0], tint: t, taper: [0.6, 0.65], grime: 0.1 });
    k.box('matte', 0.05 * s, 0.025 * s, 0.12 * s, { pos: [0, 0.01 * s, 0.09 * s], rot: [-0.05, 0, 0], tint: 0xc0b69e, taper: [0.7, 0.7], grime: 0.1 });
    eye(-0.04 * s, 0.075 * s, 0.045 * s, 0.015 * s); eye(0.04 * s, 0.075 * s, 0.045 * s, 0.015 * s);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.cone('matte', 0.004 * s, 0.014 * s, { pos: [sx * 0.02 * s, 0.026 * s, (0.07 + i * 0.016) * s], rot: [Math.PI, 0, 0], radial: 3, tint: 0xe8e0cc, grime: 0, var: 0 });
    if (cow) for (const sx of [-1, 1]) k.tube('matte', [[sx * 0.05, 0.12, -0.02], [sx * 0.13, 0.15, -0.03], [sx * 0.17, 0.23, 0.0]], (tt) => 0.017 * (1 - tt * 0.8), { radial: 6, tint: 0xd8cca8, grime: 0.1 });
  }
  if (k.chance(0.5)) k.mound(0.12, 0.025, 0.12, { pos: [0.02, 0.13, 0], jseed: 2 });
  k.pop();
  k.ud.align = 0.8;
  return k.build();
}

export function bones(o = {}) {
  const k = new Kit('bones', Object.assign({ indoor: true }, o));
  k.push({ yaw: k.r(0, TAU) });
  const bone = (len, r, pos, rot) => {
    const t = k.pick(BONE);
    k.cyl('matte', r, r, len, { pos, rot, radial: 6, tint: t, grime: 0.15, var: 0.1, cap: 'matte' });
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3(0, s * len / 2, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ'));
      k.sph('matte', r * 1.7, { pos: [pos[0] + p.x, pos[1] + p.y, pos[2] + p.z], ws: 6, hs: 5, tint: t, grime: 0.1 });
    }
  };
  for (let i = 0; i < 3; i++) bone(k.r(0.22, 0.32), 0.012, [k.rs(0.3), 0.014, k.rs(0.3)], [0, k.r(0, TAU), Math.PI / 2 + k.rs(0.1)]);
  // Ribs: tubes arcing
  for (let i = 0; i < 6; i++) {
    const x = -0.2 + i * 0.08, a = k.rs(0.1);
    const pts = [];
    for (let j = 0; j <= 6; j++) { const tt = (j / 6) * 2.2; pts.push([x + k.rs(0.002), Math.sin(tt) * 0.09, 0.2 - Math.cos(tt) * 0.11 + a]); }
    k.tube('matte', pts, (tt) => 0.008 * (1 - tt * 0.5), { radial: 4, tint: k.pick(BONE), grime: 0.15 });
  }
  // Vertebrae
  for (let i = 0; i < 7; i++) k.sph('matte', 0.017, { pos: [-0.25 + i * 0.045, 0.012, -0.25 + Math.sin(i) * 0.02], scale: [1, 0.8, 1], ws: 5, hs: 4, tint: k.pick(BONE), grime: 0.1 });
  k.mound(0.5, 0.04, 0.3, { pos: [0.12, 0.0, 0.22], jseed: 2 });
  k.mound(0.3, 0.03, 0.22, { pos: [-0.32, 0.0, -0.22], jseed: 3 });
  k.pop();
  k.ud.align = 0.9;
  return k.build();
}

// Signpost: post with N carved pointer boards.
export function signpost(o = {}) {
  const k = new Kit('signpost', o);
  const n = o.arrows || 2 + Math.floor(k.r(0, 2));
  k.push({ yaw: o.yaw || 0, rot: [k.rs(0.03), 0, k.rs(0.04)] });
  const H = 2.3;
  k.box('wood', 0.12, H, 0.12, { pos: [0, H / 2 - 0.1, 0], tint: 0xb8a690, jitter: 0.006, seg: [1, 5, 1], grain: 'y' });
  k.cone('wood', 0.09, 0.14, { pos: [0, H + 0.0, 0], radial: 4, tint: 0xa89684 });
  for (let i = 0; i < n; i++) {
    const y = H - 0.3 - i * 0.34;
    const dir = k.r(-1, 1) * 1.2 + i * 1.7;
    k.with({ pos: [0, y, 0], yaw: dir }, () => {
      const L = k.r(0.7, 1.0);
      const sh = new THREE.Shape();
      sh.moveTo(-0.06, -0.09); sh.lineTo(L - 0.12, -0.09); sh.lineTo(L + 0.05, 0.0); sh.lineTo(L - 0.12, 0.09); sh.lineTo(-0.06, 0.09); sh.closePath();
      k.extrude('planks', sh, 0.03, { rot: [0, -Math.PI / 2, 0], pos: [0, 0, 0.09], tint: k.pick([0xc4ae98, 0xb8a690, 0xd0c0a8]), tile: 0.9 });
      // painted marks: a red notch pattern, no text
      for (let j = 0; j < 3; j++) k.box('paint', 0.025, 0.05, 0.004, { pos: [0.1 + j * 0.06, 0, 0.088 + 0.03], rot: [0, 0, 0.4], tint: RED[0], grime: 0, var: 0 });
    });
  }
  if (!o.indoor) {
    k.mound(0.2, 0.05, 0.2, { pos: [0, H + 0.1, 0], jseed: 2 });
    k.mound(0.5, 0.15, 0.5, { pos: [0, 0.0, 0], jseed: 3 });
  }
  k.pop();
  k.circleCollider(0.1, { h: H });
  k.ud.align = 0;
  return k.build();
}

// Horse-head carving: flat silhouette board on a post.
function horseShape() {
  const sh = new THREE.Shape();
  const P = [[-0.1, 0], [-0.13, 0.18], [-0.11, 0.3], [-0.05, 0.4], [-0.03, 0.52], [0.0, 0.43], [0.05, 0.4], [0.12, 0.28], [0.19, 0.16], [0.24, 0.09], [0.25, 0.02], [0.22, -0.02], [0.17, 0.0], [0.12, 0.05], [0.08, 0.02], [0.05, -0.03], [0.04, -0.12], [0.0, -0.15], [-0.04, -0.02]];
  sh.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]);
  sh.closePath();
  const eye = new THREE.Path();
  eye.absarc(0.1, 0.2, 0.014, 0, TAU, true);
  sh.holes.push(eye);
  return sh;
}

export function horseHead(o = {}) {
  const k = new Kit('horseHead', o);
  k.push({ yaw: o.yaw || 0 });
  k.box('wood', 0.1, 1.5, 0.1, { pos: [0, 0.65, 0], tint: 0xb8a690, jitter: 0.005, seg: [1, 4, 1] });
  k.extrude('planks', horseShape(), 0.045, { pos: [0, 1.4, 0.0], rot: [0, 0, 0], scale: 1.3, tint: 0xc8b8a0, jitter: 0.002, bevel: 0.004 });
  // red painted mane tips and bridle
  for (let i = 0; i < 4; i++) k.box('paint', 0.02, 0.05, 0.05, { pos: [-0.1 * 1.3 + 0.01 * i, 1.4 + (0.2 + i * 0.07) * 1.3, 0], tint: RED[0], grime: 0, var: 0 });
  if (!o.indoor) k.mound(0.2, 0.05, 0.14, { pos: [0, 1.4 + 0.5 * 1.3, 0], jseed: 2 });
  k.pop();
  k.circleCollider(0.1, { h: 1.6 });
  k.ud.align = 0;
  return k.build();
}

// Crossed pair of horse heads on a short post: the roof finial of a chief's house.
export function roofFinial(o = {}) {
  const k = new Kit('roofFinial', o);
  k.push({ yaw: o.yaw || 0 });
  k.box('wood', 0.09, 0.5, 0.09, { pos: [0, 0.2, 0], tint: 0xb8a690, jitter: 0.004 });
  for (const sx of [-1, 1]) {
    k.extrude('planks', horseShape(), 0.04, { pos: [0, 0.55, 0], rot: [0, sx > 0 ? 0 : Math.PI, sx * -0.35], scale: [sx * 1.1, 1.1, 1.0], tint: 0xc8b8a0, jitter: 0.002, bevel: 0.003 });
  }
  if (!o.indoor) k.mound(0.3, 0.07, 0.15, { pos: [0, 0.98, 0], jseed: 2 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function dogKennel(o = {}) {
  const k = new Kit('dogKennel', o);
  const w = 0.9, d = 1.05, h = 0.85;
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick([0xffffff, 0xe0d2c0, 0xc4ae98]);
  // Walls of vertical boards, a dark doorway (open box), gabled roof with snow.
  for (const sx of [-1, 1]) k.box('planks', 0.04, h, d, { pos: [sx * (w / 2 - 0.02), h / 2, 0], tint: wood, jitter: 0.004, grain: 'y' });
  k.box('planks', w, h * 0.9, 0.04, { pos: [0, h * 0.45, -d / 2 + 0.02], tint: wood, jitter: 0.004 });
  // Front with arched opening: two side boards, a lintel, and a dark void behind.
  for (const sx of [-1, 1]) k.box('planks', 0.26, h, 0.04, { pos: [sx * 0.31, h / 2, d / 2 - 0.02], tint: wood, jitter: 0.004, grain: 'y' });
  k.box('planks', w, 0.28, 0.04, { pos: [0, h - 0.14, d / 2 - 0.02], tint: wood });
  k.box('matte', w - 0.1, 0.02, d - 0.1, { pos: [0, 0.02, 0], tint: 0x1a1612, grime: 0, uv: 'none' });
  k.blob('straw', 0.3, { pos: [0, 0.08, 0.25], scale: [1.4, 0.3, 1.2], detail: 1, tint: 0xd8c78a });
  // Roof boards
  for (const sx of [-1, 1]) k.box('planks', 0.62, 0.035, d + 0.14, { pos: [sx * 0.31, h + 0.17, 0], rot: [0, 0, sx * -0.5], tint: 0x7a6a5a, jitter: 0.004, grain: 'z' });
  if (!o.indoor) { k.mound(0.5, 0.1, d + 0.1, { pos: [-0.28, h + 0.22, 0], rot: [0, 0, 0.5], jseed: 2 }); k.mound(0.5, 0.1, d + 0.1, { pos: [0.28, h + 0.22, 0], rot: [0, 0, -0.5], jseed: 3 }); }
  // Chain stake and a frozen bowl
  k.cyl('wood', 0.025, 0.03, 0.5, { pos: [0.9, 0.2, 0.9], radial: 5, tint: 0x7a6a58, cap: 'logEnd' });
  k.tube('iron', [[0.9, 0.35, 0.9], [0.7, 0.05, 0.8], [0.45, 0.04, 0.75], [0.25, 0.1, d / 2]], 0.01, { radial: 4, tint: 0x4a4a4e, tile: 0.1 });
  k.lathe('iron', [[0.001, 0], [0.08, 0.002], [0.11, 0.06], [0.1, 0.062], [0.075, 0.015]], { pos: [0.55, 0.0, 0.8], radial: 10, tint: 0x8a8a90, uRepeat: 1 });
  k.cyl('ice', 0.075, 0.075, 0.006, { pos: [0.55, 0.04, 0.8], radial: 10, tint: 0xd0e6f2, grime: 0 });
  k.pop();
  k.boxCollider(w / 2, d / 2, { h: h + 0.3 });
  k.ud.align = 0;
  return k.build();
}

export function chickenCoop(o = {}) {
  const k = new Kit('chickenCoop', o);
  const w = 1.3, d = 0.9, h = 0.85;
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick([0xffffff, 0xe0d2c0, 0xc4ae98]);
  // House on four legs, a ramp with cleats, and a low wire run in front.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', 0.07, 0.5, 0.07, { pos: [sx * (w / 2 - 0.06), 0.25, sz * (d / 2 - 0.06)], tint: 0x9a8a78, jitter: 0.004 });
  k.box('planks', w, 0.04, d, { pos: [0, 0.52, 0], tint: wood, jitter: 0.004 });
  for (const sx of [-1, 1]) k.box('planks', 0.03, h, d, { pos: [sx * (w / 2 - 0.015), 0.52 + h / 2, 0], tint: wood, jitter: 0.004, grain: 'y' });
  k.box('planks', w, h, 0.03, { pos: [0, 0.52 + h / 2, -d / 2 + 0.015], tint: wood, jitter: 0.004 });
  for (const sx of [-1, 1]) k.box('planks', 0.4, h, 0.03, { pos: [sx * 0.45, 0.52 + h / 2, d / 2 - 0.015], tint: wood, jitter: 0.004, grain: 'y' });
  k.box('planks', 0.5, 0.3, 0.03, { pos: [0, 0.52 + h - 0.15, d / 2 - 0.015], tint: wood });
  k.box('matte', 0.5, 0.5, 0.01, { pos: [0, 0.52 + 0.28, d / 2 - 0.05], tint: 0x120e0a, grime: 0, uv: 'none' });
  // Pitched roof of boards with snow and an overhang
  for (const sz of [-1, 1]) k.box('planks', w + 0.2, 0.03, d * 0.62, { pos: [0, 0.52 + h + 0.18, sz * d * 0.27], rot: [sz * 0.5, 0, 0], tint: 0x7a6a5a, jitter: 0.004 });
  if (!o.indoor) for (const sz of [-1, 1]) k.mound(w * 0.95, 0.09, d * 0.5, { pos: [0, 0.52 + h + 0.23, sz * d * 0.27], rot: [sz * 0.5, 0, 0], jseed: sz + 4 });
  // Ramp
  k.box('planks', 0.3, 0.025, 0.9, { pos: [0, 0.27, d / 2 + 0.3], rot: [0.55, 0, 0], tint: wood });
  for (let i = 0; i < 4; i++) k.box('wood', 0.3, 0.02, 0.025, { pos: [0, 0.18 + i * 0.1, d / 2 + 0.08 + i * 0.14], tint: 0x8a7a68 });
  // Run: posts and a wire mesh
  const rz = d / 2 + 0.55;
  for (const sx of [-1, 1]) for (const z of [rz, rz + 0.9]) k.cyl('wood', 0.025, 0.025, 0.7, { pos: [sx * (w / 2 + 0.2), 0.35, z + 0.4], radial: 5, tint: 0xa89684, cap: 'logEnd' });
  k.plane('net', 1.0, 0.6, { pos: [(w / 2 + 0.2), 0.35, rz + 0.8], rot: [0, Math.PI / 2, 0], tint: 0x8a8a90, tile: 0.1, grime: 0 });
  k.plane('net', 1.0, 0.6, { pos: [-(w / 2 + 0.2), 0.35, rz + 0.8], rot: [0, Math.PI / 2, 0], tint: 0x8a8a90, tile: 0.1, grime: 0 });
  k.box('wood', 0.04, 0.04, 1.2, { pos: [-w / 2 - 0.2, 0.35, rz + 0.8], tint: 0x9a8a78 });
  k.pop();
  k.boxCollider(w / 2 + 0.1, d / 2 + 0.1, { h: 1.6 });
  k.ud.align = 0;
  return k.build();
}

// Beehive: hollow log hive with a small gabled cap ('log') or a straw skep on a stand ('skep').
export function beehive(o = {}) {
  const k = new Kit('beehive', o);
  const skep = (o.variant || k.pick(['log', 'log', 'skep'])) === 'skep';
  k.push({ yaw: o.yaw || 0, rot: [k.rs(0.02), 0, k.rs(0.03)] });
  if (skep) {
    k.cyl('wood', 0.2, 0.22, 0.04, { pos: [0, 0.4, 0], radial: 10, tint: 0xa08a74, cap: 'logEnd' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', 0.04, 0.4, 0.04, { pos: [sx * 0.16, 0.2, sz * 0.16], tint: 0x8a7a68, jitter: 0.004 });
    k.lathe('straw', [[0.27, 0.42], [0.285, 0.52], [0.24, 0.68], [0.14, 0.8], [0.04, 0.86], [0.001, 0.87]], { radial: 12, tint: 0xd8c78a, jitter: 0.012, uRepeat: 3, grime: 0.2, tile: 0.5 });
    for (let i = 0; i < 5; i++) twine(k, 0.46 + i * 0.09, 0.28 - i * 0.03, 0x6a5a3c, 0.01);
    k.box('matte', 0.07, 0.03, 0.02, { pos: [0, 0.46, 0.27], tint: 0x1a1612, grime: 0 });
    if (!o.indoor) k.mound(0.5, 0.14, 0.5, { pos: [0, 0.76, 0], jseed: 2 });
    k.circleCollider(0.3, { h: 0.9 });
  } else {
    // A hollow log standing on a plank with a gabled board roof and a small bee entrance.
    k.box('planks', 0.7, 0.05, 0.7, { pos: [0, 0.2, 0], tint: 0x9a8a78, jitter: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', 0.07, 0.2, 0.07, { pos: [sx * 0.28, 0.1, sz * 0.28], tint: 0x8a7a68 });
    k.cyl('bark', 0.26, 0.3, 0.95, { pos: [0, 0.72, 0], radial: 9, cap: 'logEnd', noBottom: true, noTop: true, jitter: 0.015, tint: 0xd0c4b4 });
    k.box('matte', 0.1, 0.025, 0.03, { pos: [0, 0.3, 0.3], tint: 0x120e0a, grime: 0 });
    for (const sx of [-1, 1]) k.box('planks', 0.5, 0.03, 0.78, { pos: [sx * 0.2, 1.3, 0], rot: [0, 0, sx * -0.6], tint: 0x7a6a5a, jitter: 0.004 });
    if (!o.indoor) { k.mound(0.45, 0.1, 0.78, { pos: [-0.19, 1.34, 0], rot: [0, 0, 0.6], jseed: 2 }); k.mound(0.45, 0.1, 0.78, { pos: [0.19, 1.34, 0], rot: [0, 0, -0.6], jseed: 3 }); }
    k.circleCollider(0.42, { h: 1.4 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}
