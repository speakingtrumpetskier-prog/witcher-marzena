// Fishing village props: drying rack, fish, basket, net, boat frozen in ice, ice fishing hole,
// fishing stool, windbreak, tent, fish on strings.
import * as THREE from 'three';
import { Kit, TAU } from './kit.js';

const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];

// Flat bevelled fish silhouette, head at x = 0, tail at x = L. Textured along its length.
export function fishShape(L) {
  const H = L * 0.26;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(L * 0.06, H * 0.5, L * 0.3, H * 0.5);
  s.quadraticCurveTo(L * 0.62, H * 0.46, L * 0.84, H * 0.1);
  s.lineTo(L, H * 0.62);
  s.quadraticCurveTo(L * 0.93, 0, L, -H * 0.62);
  s.lineTo(L * 0.84, -H * 0.1);
  s.quadraticCurveTo(L * 0.62, -H * 0.44, L * 0.3, -H * 0.5);
  s.quadraticCurveTo(L * 0.06, -H * 0.5, 0, 0);
  return { shape: s, H };
}

// Adds one fish to a kit: a flat, slightly arched double-sided silhouette (dried and frozen fish are flat
// anyway), ~20 triangles. Hangs head down when rotated by the caller.
export function addFish(k, L, o = {}) {
  const { shape, H } = fishShape(L);
  const tint = o.tint || k.pick([0xffffff, 0xd8d8e0, 0xc0c8d0, 0xe8e0d0]);
  const arch = L * 0.05 * (k.chance(0.5) ? 1 : -1);
  k.with({ pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0], yaw: o.yaw || 0 }, () => {
    k.shape('fish', shape, {
      pos: [-L / 2, 0, 0], uvFit: [0, -H * 0.62, L, H * 1.24], tint, grime: 0, var: 0.06, curve: 3,
      warp: (x, y) => [0, 0, Math.sin((x / L) * Math.PI) * arch + y * 0.1],
    });
  });
}

export function dryingRack(o = {}) {
  const k = new Kit('dryingRack', o);
  const w = (o.width || 2.4) + k.rs(0.3);
  const rails = [1.75, 1.2];
  k.push({ yaw: o.yaw || 0 });
  const wood = k.pick(WOOD);
  for (const sx of [-1, 1]) {
    // A-frame legs
    for (const sz of [-1, 1]) k.cyl('wood', 0.035, 0.045, 2.05, { pos: [sx * w / 2, 1.0, sz * 0.18], rot: [sz * -0.18, 0, 0], radial: 6, tint: wood, jitter: 0.006, cap: 'logEnd' });
  }
  for (const y of rails) k.cyl('wood', 0.028, 0.028, w + 0.2, { pos: [0, y, 0], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xc4ae98, jitter: 0.004, cap: 'logEnd' });
  // Fish in pairs over the rails, heads down, a few missing (eaten by ravens).
  const n = Math.floor(w / 0.14);
  for (const y of rails) {
    for (let i = 0; i < n; i++) {
      if (k.chance(0.14)) continue;
      const x = -w / 2 + 0.12 + i * ((w - 0.24) / (n - 1));
      const L = k.r(0.34, 0.5);
      const side = (i % 2) * 0.05 - 0.025;
      // hanging head down: fish pointing -Y
      addFish(k, L, { pos: [x, y - 0.015 - L / 2, side], rot: [0, 0, -Math.PI / 2 + k.rs(0.07)], yaw: 0, tint: k.pick([0xd8d0c0, 0xc8b8a0, 0xe0d8c8, 0xb8a888, 0xe8e8ec]) });
    }
  }
  // Snow caps on the rails and frost on top.
  if (!o.indoor) for (const y of rails) k.mound(w * 0.9, 0.05, 0.1, { pos: [0, y + 0.025, 0], jseed: y });
  // A few icicles from the lower fish.
  k.pop();
  k.boxCollider(w / 2 + 0.1, 0.3, { h: 2.0 });
  k.ud.align = 0;
  return k.build();
}

// A string of small fish for porch eaves and walls.
export function fishString(o = {}) {
  const k = new Kit('fishString', o);
  const n = o.count || 6 + Math.floor(k.r(0, 4));
  const span = n * 0.1 + 0.2;
  k.push({ yaw: o.yaw || 0 });
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([-span / 2 + t * span, 2.0 - Math.sin(t * Math.PI) * 0.08, 0]);
  }
  k.tube('rope', pts, 0.006, { radial: 4, tint: 0xb89c6c });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = -span / 2 + t * span;
    const L = k.r(0.2, 0.3);
    addFish(k, L, { pos: [x, 2.0 - Math.sin(t * Math.PI) * 0.08 - 0.02 - L / 2, 0.0], rot: [0, 0, -Math.PI / 2 + k.rs(0.1)], tint: k.pick([0xd8d0c0, 0xe0e0e4, 0xc8b8a0]) });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function fishBasket(o = {}) {
  const k = new Kit('fishBasket', o);
  k.push({ yaw: k.r(0, TAU) });
  const r = 0.25, h = 0.34;
  k.lathe('wicker', [[r * 0.8, 0], [r * 0.95, h * 0.5], [r, h]], { radial: 14, tint: 0xffffff, uRepeat: 2, tile: 0.5, grime: 0.4 });
  k.lathe('wicker', [[r - 0.012, h], [r * 0.95 - 0.012, h * 0.5], [r * 0.8 - 0.012, 0.02]], { radial: 14, tint: 0x8a7a5a, uRepeat: 2, tile: 0.5, grime: 0 });
  k.torus('wicker', r + 0.005, 0.013, { pos: [0, h, 0], rot: [Math.PI / 2, 0, 0], seg: 14, rseg: 4, tint: 0xd8c8a0 });
  // Frozen catch heaped in the basket.
  for (let i = 0; i < 5; i++) {
    const L = k.r(0.26, 0.38);
    addFish(k, L, { pos: [k.rs(0.09), h - 0.03 + k.r(0, 0.1), k.rs(0.09)], rot: [k.rs(0.4) + Math.PI / 2 * (k.chance(0.5) ? 0 : 1), 0, 0], yaw: k.r(0, TAU), tint: k.pick([0xffffff, 0xd8d8e0, 0xe8e8ec]) });
  }
  // Carry handle
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([Math.cos(a) * r, h + Math.sin(a) * 0.22, 0]); }
  k.tube('wicker', pts, 0.012, { radial: 5, tint: 0xc8b890 });
  if (!o.indoor) k.mound(r * 1.6, 0.05, r * 1.6, { pos: [0, h + 0.02, 0], jseed: 1 });
  k.pop();
  k.circleCollider(r + 0.03, { h });
  k.ud.align = 0.4;
  return k.build();
}

// Net hung to dry between two poles (or a tangled heap on the ground with variant 'heap').
export function net(o = {}) {
  const k = new Kit('net', o);
  const heap = (o.variant || 'hung') === 'heap';
  k.push({ yaw: o.yaw || 0 });
  if (heap) {
    for (let i = 0; i < 3; i++) {
      k.blob('net', 0.4, { pos: [k.rs(0.2), 0.14, k.rs(0.2)], scale: [1.3, 0.5, 1.0], detail: 2, tint: k.pick([0xe0d4bc, 0xcfc4ac]), grime: 0.3, jitter: 0.08 });
    }
    for (let i = 0; i < 4; i++) k.cyl('wood', 0.04, 0.04, 0.07, { pos: [k.rs(0.4), 0.05, k.rs(0.35)], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xc8aa78 });
    for (let i = 0; i < 3; i++) k.blob('stone', 0.04, { pos: [k.rs(0.4), 0.03, k.rs(0.35)], detail: 1, tint: 0x8a8a90 });
    if (!o.indoor) k.mound(0.7, 0.06, 0.5, { pos: [0, 0.26, 0], jseed: 2 });
    k.pop();
    k.circleCollider(0.5, { h: 0.3 });
    k.ud.align = 0.6;
    return k.build();
  }
  const w = (o.width || 2.4) + k.rs(0.3), h = 1.5 + k.rs(0.1);
  for (const sx of [-1, 1]) k.cyl('wood', 0.035, 0.045, h + 0.5, { pos: [sx * (w / 2 + 0.05), (h + 0.5) / 2, 0], rot: [0, 0, sx * k.rs(0.05)], radial: 6, tint: k.pick(WOOD), jitter: 0.006, cap: 'logEnd' });
  k.cyl('wood', 0.022, 0.022, w + 0.2, { pos: [0, h + 0.38, 0], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xc4ae98, cap: 'logEnd' });
  // The net: a sagging lattice (alpha tested) with floats at the top and weights at the bottom.
  const sag = (x, y) => [0, -Math.abs(Math.sin((x / w + 0.5) * Math.PI)) * 0.0, Math.sin((x / w + 0.5) * Math.PI) * 0.06 + Math.sin(y * 4 + x * 2) * 0.015];
  k.plane('net', w, h, { pos: [0, h / 2 + 0.3, 0], sx: 12, sy: 8, tile: 0.3, tint: 0xe0d4bc, grime: 0.15, var: 0.05, bend: sag, fade: [0xf0f4f8, h + 0.0, h + 0.3] });
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + 0.15 + (i / 8) * (w - 0.3);
    k.cyl('wood', 0.03, 0.03, 0.09, { pos: [x, h + 0.3, 0.03], rot: [0, 0, Math.PI / 2], radial: 6, tint: 0xd8b878, cap: 'logEnd' });
    k.blob('stone', 0.03, { pos: [x, 0.32, 0.03], scale: [1, 1.2, 1], detail: 1, tint: 0x8a8a90 });
  }
  k.tube('rope', [[-w / 2, h + 0.3, 0.0], [0, h + 0.28, 0.05], [w / 2, h + 0.3, 0.0]], 0.01, { radial: 4, tint: 0xb89c6c });
  if (!o.indoor) k.mound(w * 0.9, 0.05, 0.1, { pos: [0, h + 0.41, 0], jseed: 3 });
  k.pop();
  k.boxCollider(w / 2 + 0.1, 0.15, { h: 2.0 });
  k.ud.align = 0;
  return k.build();
}

// Clinker-built boat. Frozen into the ice by default (tilted, ice shards ringing the hull);
// variant 'overturned' for a hull resting upside down on the shore.
export function boat(o = {}) {
  const k = new Kit('boat', o);
  const over = (o.variant || 'frozen') === 'overturned';
  const Lh = (o.length || 4.4) / 2 + k.rs(0.2), B = 0.72 + k.rs(0.06), D = 0.62;
  const strakes = 5;
  const N = 10;
  k.push({ yaw: o.yaw || 0, rot: over ? [0, 0, Math.PI] : [k.rs(0.05), 0, k.rs(0.12)], pos: over ? [0, D * 0.85, 0] : [0, -0.28, 0] });
  // Loft: stations along z in [-Lh, Lh], rows from keel to gunwale.
  const hull = (inner) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * 2 - 1;
      const width = B * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55);
      const rise = Math.pow(Math.abs(s), 2.6) * 0.55;
      for (let j = 0; j <= strakes * 2; j++) {
        const t = j / (strakes * 2);
        const lap = ((t * strakes) % 1) * 0.02;
        const off = inner ? -0.03 : 0;
        const ang = t * Math.PI * 0.5;
        const x = (width * Math.sin(ang) + lap) + off * Math.sin(ang);
        const y = D * (1 - Math.cos(ang)) * 1.1 + rise * (t * 0.7 + 0.3) + (inner ? 0.025 : 0);
        for (const side of [1, -1]) {
          pos.push(side * Math.max(x, 0.0005), y, s * Lh);
          uv.push(t * 2.2 * (side > 0 ? 1 : -1) + 5, (s * Lh) / 1.0 + (side > 0 ? 0 : 3.1));
        }
      }
    }
    const rowN = (strakes * 2 + 1) * 2;
    for (let i = 0; i < N; i++) for (let j = 0; j < strakes * 2; j++) for (const side of [0, 1]) {
      const a = i * rowN + j * 2 + side, b = a + rowN, c = a + 2, d = b + 2;
      if (side === 0) { idx.push(a, c, b, b, c, d); } else { idx.push(a, b, c, b, d, c); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(inner ? idx.reverse() : idx);
    g.computeVertexNormals();
    return g;
  };
  const tint = k.pick([0xb8a690, 0xa08a74, 0xc4b8a8]);
  k.emit(hull(false), 'planks', { uv: 'none', tint, grime: 0.25, jitter: 0.004, flat: false });
  k.emit(hull(true), 'planks', { uv: 'none', tint: 0x6a5a4a, grime: 0.1 });
  // Stem and stern posts, gunwale rails, thwarts and ribs.
  for (const sz of [-1, 1]) {
    k.box('wood', 0.07, 0.8, 0.09, { pos: [0, 0.4 + 0.15, sz * (Lh - 0.02)], rot: [sz * -0.42, 0, 0], tint: 0x8a7a68, jitter: 0.004 });
  }
  const gunY = (s) => D * 1.1 + Math.pow(Math.abs(s), 2.6) * 0.55;
  const gunX = (s) => B * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55) + 0.02;
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const s = (i / 10) * 1.9 - 0.95; pts.push([side * gunX(s), gunY(s) + 0.01, s * Lh]); }
    k.tube('wood', pts, 0.028, { radial: 5, tint: 0xa89684 });
  }
  for (const s of [-0.5, 0.0, 0.5]) {
    const x = gunX(s);
    k.box('planks', x * 2 + 0.06, 0.04, 0.26, { pos: [0, gunY(s) - 0.22, s * Lh], tint: k.pick(WOOD), jitter: 0.004, grain: 'x' });
  }
  if (!over) {
    // Oars shipped, one frozen sticking up, and a coiled line.
    k.cyl('wood', 0.022, 0.025, 2.4, { pos: [0.28, 0.55, 0.0], rot: [1.3, 0, 0.12], radial: 5, tint: 0xc8b8a0, cap: null });
    k.box('wood', 0.14, 0.02, 0.5, { pos: [0.45, 1.15, -1.0], rot: [1.3, 0, 0.12], tint: 0xc8b8a0 });
    k.torus('rope', 0.12, 0.02, { pos: [-0.2, 0.28, 0.9], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4 });
    if (!o.indoor) {
      k.mound(B * 1.4, 0.14, Lh * 1.5, { pos: [0, 0.55, 0], jseed: 4 });
      k.mound(0.5, 0.09, 0.3, { pos: [0, 0.65, 0.0], jseed: 5 });
    }
  }
  k.pop();
  if (!over) {
    // Ice collar: jagged shards of pressure ice around the waterline, and a frozen skin over the bilge.
    k.push({ yaw: o.yaw || 0 });
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rx = (Lh * 0.92) * (0.9 + k.rs(0.08)), rz = (B + 0.5) * (1 + k.rs(0.15));
      const x = Math.sin(a) * rz, z = Math.cos(a) * rx;
      const h = k.r(0.12, 0.34) * (1 - 0.3 * Math.abs(Math.cos(a)));
      k.blob('ice', 0.25, { pos: [x, h * 0.25, z], scale: [k.r(0.5, 1.1), h * 3, k.r(0.6, 1.3)], rot: [k.rs(0.3), k.r(0, TAU), k.rs(0.3)], detail: 0, jitter: 0.05, tint: k.pick([0xd8ecf8, 0xc4dcec, 0xe8f4fc]), grime: 0.05, flat: true });
    }
    k.cyl('ice', Lh * 0.18, Lh * 0.18, 0.02, { pos: [0, 0.18, 0], radial: 8, tint: 0xcfe4f2, scale: [1, 1, 4.5], grime: 0 });
    k.pop();
  }
  k.boxCollider(over ? B + 0.1 : B + 0.25, Lh * 0.9, { h: 0.9 });
  k.ud.align = 0;
  return k.build();
}

// Ice fishing hole: dark water, rim of slush and chopped ice, a skim of fresh ice partly over it.
export function iceFishingHole(o = {}) {
  const k = new Kit('iceFishingHole', o);
  const r = (o.radius || 0.2) + k.rs(0.03);
  k.push({ yaw: k.r(0, TAU) });
  // Dark water (glossy ice material, near black)
  k.cyl('ice', r, r, 0.004, { pos: [0, 0.006, 0], radial: 12, tint: 0x0a1620, grime: 0, var: 0.02, cap: 'ice' });
  // Slush ring: lumpy flattened mounds around the rim.
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k.rs(0.1);
    const rr = r * (1.05 + k.rs(0.08));
    k.mound(r * k.r(0.8, 1.3), r * 0.28, r * k.r(0.6, 0.9), { pos: [Math.cos(a) * rr, 0.004, Math.sin(a) * rr], rot: [0, -a, 0], tint: k.pick([0xc8d4dc, 0xd8e2e8, 0xb8c6d0]), jseed: i });
  }
  // Chopped ice chunks flung to one side.
  for (let i = 0; i < 6; i++) {
    const a = k.rs(0.8) + 0.4, d = k.r(r * 1.4, r * 3);
    k.blob('ice', 0.07, { pos: [Math.cos(a) * d, 0.03, Math.sin(a) * d], scale: [1, 0.6, 1.2], rot: [k.rs(0.4), k.r(0, TAU), k.rs(0.4)], detail: 0, flat: true, jitter: 0.015, tint: k.pick([0xd8ecf8, 0xe8f4fc]) });
  }
  // Skim of new ice with radial cracks over part of the hole (the "slush skin").
  if (o.skim !== false) {
    const ph = k.r(0, TAU);
    k.sph('ice', r * 1.02, { pos: [0, 0.008, 0], scale: [1, 0.01, 1], ws: 12, hs: 3, t0: 0, t1: Math.PI / 2, tint: 0xdde8ee, grime: 0, jitter: 0.002, rot: [0, ph, 0] });
    k.cyl('snowMound', r * 0.52, r * 0.52, 0.006, { pos: [Math.cos(ph) * r * 0.5, 0.012, Math.sin(ph) * r * 0.5], radial: 8, tint: 0xd0dce4, grime: 0.1, cap: 'snowMound' });
  }
  // A stick across the hole with a line dropping in (optional).
  if (o.rod) {
    k.cyl('wood', 0.012, 0.012, r * 3.2, { pos: [0, 0.03, 0], rot: [0, 0, Math.PI / 2], radial: 5, tint: 0xb8a088, cap: null });
    k.tube('rope', [[0, 0.03, 0], [0.01, -0.1, 0.02]], 0.003, { radial: 3, tint: 0xe0e0d8 });
  }
  k.pop();
  k.ud.align = 0.2;
  return k.build();
}

export function fishingStool(o = {}) {
  const k = new Kit('fishingStool', o);
  const bucketSeat = (o.variant || k.pick(['legs', 'bucket'])) === 'bucket';
  k.push({ yaw: k.r(0, TAU) });
  if (bucketSeat) {
    k.lathe('planks', [[0.14, 0], [0.155, 0.15], [0.17, 0.3]], { radial: 12, flat: true, uRepeat: 3, tint: k.pick(WOOD) });
    k.cyl('planks', 0.17, 0.17, 0.03, { pos: [0, 0.31, 0], radial: 12, tint: k.pick(WOOD) });
    for (const y of [0.06, 0.24]) k.cyl('iron', 0.17, 0.17, 0.025, { pos: [0, y, 0], radial: 12, open: true, tint: 0x4c4844 });
    k.blob('fur', 0.17, { pos: [0, 0.34, 0], scale: [1, 0.2, 1], detail: 1, tint: 0xd8cdbd });
  } else {
    k.cyl('planks', 0.14, 0.14, 0.04, { pos: [0, 0.3, 0], radial: 10, tint: k.pick(WOOD), jitter: 0.004 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      k.cyl('wood', 0.015, 0.02, 0.32, { pos: [Math.cos(a) * 0.1, 0.14, Math.sin(a) * 0.1], rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], radial: 5, tint: 0xa8967e, cap: null });
    }
    k.blob('fur', 0.14, { pos: [0, 0.33, 0], scale: [1, 0.2, 1], detail: 1, tint: 0xb8a48c });
  }
  // Short rod leaning on it, line to the hole.
  k.cyl('wood', 0.01, 0.014, 0.9, { pos: [0.25, 0.4, 0.1], rot: [0.0, 0.0, 0.9], radial: 4, tint: 0xc8b8a0, cap: null });
  if (!o.indoor && k.chance(0.5)) k.mound(0.3, 0.04, 0.3, { pos: [0, bucketSeat ? 0.3 : 0.32, 0], jseed: 1 });
  k.pop();
  k.circleCollider(0.2, { h: 0.35 });
  k.ud.align = 0.3;
  return k.build();
}

// Woven hurdle windbreak: three wattle panels in a shallow zigzag with a hide stretched on one.
export function windbreak(o = {}) {
  const k = new Kit('windbreak', o);
  const pw = 1.6, ph = 1.25;
  k.push({ yaw: o.yaw || 0 });
  for (let p = 0; p < 3; p++) {
    const ang = (p - 1) * 0.5;
    const cx = (p - 1) * 1.45, cz = Math.abs(p - 1) * -0.2;
    k.with({ pos: [cx, 0, cz], yaw: ang }, () => {
      for (let i = 0; i <= 8; i++) {
        const x = -pw / 2 + (i / 8) * pw;
        k.cyl('wood', 0.02, 0.026, ph + 0.2 + k.rs(0.06), { pos: [x, (ph + 0.2) / 2 - 0.05, 0], radial: 5, tint: 0xb8a690, cap: null, jitter: 0.003 });
      }
      if (p === 2 && !o.noHide) {
        const sh = new THREE.Shape();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const x = Math.cos(a) * (pw / 2 - 0.05) * (1 + Math.sin(a * 3) * 0.04), y = Math.sin(a) * (ph / 2 - 0.05) * (1 + Math.cos(a * 4) * 0.05);
          if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
        }
        k.extrude('fur', sh, 0.02, { pos: [0, ph / 2 + 0.1, 0.035], tint: 0xa89478, tile: 0.7 });
      } else {
        k.box('wicker', pw, ph, 0.05, { pos: [0, ph / 2 + 0.04, 0], tint: k.pick([0xffffff, 0xe8dcc8]), grime: 0.4 });
      }
      k.box('wood', pw + 0.1, 0.04, 0.05, { pos: [0, ph + 0.12, 0.0], tint: 0xa89684, jitter: 0.004 });
      if (!o.indoor) k.mound(pw * 0.95, 0.07, 0.14, { pos: [0, ph + 0.14, 0], jseed: p });
    });
  }
  // Drift piled against the windward side.
  if (!o.indoor) {
    k.mound(4.2, 0.55, 1.1, { pos: [0, 0.0, 0.55], jseed: 9 });
  }
  k.pop();
  k.boxCollider(2.3, 0.45, { h: 1.3 });
  k.ud.align = 0;
  return k.build();
}

// Tent: variant 'aframe' (hide or canvas over a ridge pole) or 'cone' (pole tent with smoke hole).
export function tent(o = {}) {
  const k = new Kit('tent', o);
  const cone = (o.variant || k.pick(['aframe', 'aframe', 'cone'])) === 'cone';
  k.push({ yaw: o.yaw || 0 });
  const cloth = k.pick([0xc8b898, 0xb8a888, 0xd0c4a8]);
  if (cone) {
    const R = 1.5, H = 2.5;
    k.lathe('burlap', [[R, 0], [R * 0.82, H * 0.35], [R * 0.45, H * 0.72], [0.1, H * 0.97]], { radial: 12, flat: true, tint: cloth, uRepeat: 3, tile: 0.8, grime: 0.5, jitter: 0.015 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.cyl('wood', 0.02, 0.024, H * 1.15, { pos: [Math.cos(a) * 0.03, H * 0.57, Math.sin(a) * 0.03], rot: [Math.sin(a) * 0.52, 0, -Math.cos(a) * 0.52], radial: 4, tint: 0xa89684, cap: null });
    }
    // Door flap
    k.plane('burlap', 0.7, 1.3, { pos: [Math.sin(0) * 1.1, 0.7, 1.0], rot: [-0.45, 0, 0], tint: 0x6a5a48, grime: 0.2 });
    if (!o.indoor) k.mound(1.0, 0.25, 1.0, { pos: [0, H * 0.82, 0], jseed: 3 });
    k.circleCollider(R, { h: 1.6 });
  } else {
    const L = 2.6, W = 1.15, H = 1.4;
    for (const sx of [-1, 1]) {
      k.plane('burlap', L, Math.hypot(W, H), {
        pos: [sx * W / 2, H / 2, 0], rot: [0, Math.PI / 2, sx * Math.atan2(W, H)], sx: 4, sy: 4, tint: cloth, tile: 0.8, grime: 0.4,
        bend: (x, y) => [0, 0, Math.sin(x * 2.2 + y * 3 + k.seed) * 0.03 + Math.pow(Math.abs(y) / (Math.hypot(W, H) / 2), 3) * -0.02],
      });
    }
    k.cyl('wood', 0.03, 0.03, L + 0.5, { pos: [0, H + 0.01, 0], rot: [Math.PI / 2, 0, 0], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
    for (const sz of [-1, 1]) k.cyl('wood', 0.03, 0.03, H + 0.1, { pos: [0, H / 2 + 0.05, sz * (L / 2 + 0.05)], radial: 5, tint: 0x9a8a78, cap: 'logEnd' });
    // Gable ends with a dark doorway
    for (const sz of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-W, 0); sh.lineTo(W, 0); sh.lineTo(0, H); sh.closePath();
      if (sz > 0) {
        const hole = new THREE.Path();
        hole.moveTo(-0.34, 0); hole.lineTo(0.34, 0); hole.lineTo(0.08, 1.05); hole.lineTo(-0.08, 1.05); hole.closePath();
        sh.holes.push(hole);
      }
      k.extrude('burlap', sh, 0.01, { pos: [0, 0, sz * L / 2], tint: sz > 0 ? 0x8a7a62 : cloth, tile: 0.8, jitter: 0.004 });
    }
    // Guy ropes and pegs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.tube('rope', [[sx * W / 2, 0.15, sz * (L / 2 - 0.1)], [sx * (W / 2 + 0.55), 0.04, sz * (L / 2 + 0.3)]], 0.007, { radial: 3, tint: 0xb89c6c });
      k.cyl('wood', 0.012, 0.012, 0.18, { pos: [sx * (W / 2 + 0.55), 0.06, sz * (L / 2 + 0.3)], rot: [0, 0, sx * 0.3], radial: 4, tint: 0x8a7a68, cap: null });
    }
    if (!o.indoor) {
      for (const sx of [-1, 1]) k.mound(1.0, 0.1, L * 0.85, { pos: [sx * W * 0.42, H * 0.58, 0], rot: [0, 0, -sx * Math.atan2(H, W)], jseed: sx + 3 });
    }
    k.boxCollider(W / 2 + 0.1, L / 2 + 0.05, { h: H });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}
