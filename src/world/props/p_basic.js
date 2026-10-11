// Everyday village clutter, part 1: barrel, crate, sack, bucket, firewood, chopping block,
// stump, logs, lantern, campfire. Each builder is `(opts) => Group` with y = 0 on the ground.
import { Kit, TAU } from './kit.js';

// Wood tints (the wood texture is mid brown; tints weather it silver, dark or warm).
const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74, 0x8a7662];
const IRON = [0xffffff, 0xd8d0c8, 0xb8a090];

export function barrel(o = {}) {
  const k = new Kit('barrel', o);
  const variant = o.variant || k.pick(['plain', 'plain', 'plain', 'open', 'salt', 'lidAjar']);
  const h = (o.height || 0.92) + k.rs(0.05);
  const rEnd = 0.25 + k.rs(0.012), rMid = 0.305 + k.rs(0.012);
  const R = (y) => { const t = (y / h) * 2 - 1; return rMid - (rMid - rEnd) * t * t; };
  const wood = k.pick(WOOD);
  const lie = o.lie || variant === 'tipped';
  k.push(lie ? { pos: [0, rMid, 0], rot: [0, 0, Math.PI / 2], yaw: k.rs(0.4) } : { yaw: k.r(0, TAU) });
  if (lie) k.push({ pos: [0, -h / 2, 0] });
  const prof = [];
  for (let i = 0; i <= 6; i++) { const y = (h * i) / 6; prof.push([R(y), y]); }
  k.lathe('planks', prof, { radial: 12, flat: true, uRepeat: 4, tint: wood, grime: 0.5 });
  // Liner so open barrels have an inside.
  const open = variant === 'open' || variant === 'salt';
  if (open) {
    k.lathe('planks', prof.map((p) => [p[0] - 0.014, p[1] - 0.0]).reverse(), { radial: 12, flat: true, uRepeat: 4, tint: 0x5a4c40, grime: 0 });
    const fill = variant === 'salt' ? 'salt' : k.pick(['ice', 'dark']);
    const fy = h - (variant === 'salt' ? 0.1 : 0.12 + k.r(0, 0.18));
    if (fill === 'ice') k.cyl('ice', rEnd - 0.02, rEnd - 0.02, 0.02, { pos: [0, fy, 0], radial: 14, tint: 0xcfe6f4, grime: 0 });
    else if (fill === 'salt') k.mound(rEnd * 1.9, 0.12, rEnd * 1.9, { pos: [0, fy - 0.05, 0], tint: 0xeeeeee });
    else k.cyl('matte', rEnd - 0.02, rEnd - 0.02, 0.02, { pos: [0, fy, 0], radial: 14, tint: 0x1a1612, grime: 0 });
  } else {
    // Lid: planks sunk below the rim, with a worn center.
    const ajar = variant === 'lidAjar';
    k.with({ pos: [ajar ? 0.1 : 0, h - 0.045, 0], rot: ajar ? [0.12, 0, 0.18] : [0, 0, 0] }, () => {
      k.cyl('planks', rEnd - 0.014, rEnd - 0.014, 0.03, { radial: 12, tint: wood, grime: 0.1, tile: 0.9 });
    });
  }
  // Hoops: iron bands that follow the bulge; one slipped low on some barrels.
  const hy = [0.07, 0.26, 0.74, 0.93].map((f) => f * h);
  if (k.chance(0.25)) hy[3] -= 0.04;
  for (let i = 0; i < hy.length; i++) {
    const y = hy[i];
    k.cyl('iron', R(y) + 0.013, R(y) + 0.013, 0.038, { pos: [0, y, 0], radial: 12, open: true, tint: k.pick(IRON), jitter: 0.002, grime: 0.15 });
  }
  if (lie) k.pop();
  // Snow lump on the lid.
  if (!lie && !open && !o.indoor && k.chance(0.6)) {
    k.mound(rEnd * 1.7, 0.08 + k.r(0, 0.07), rEnd * 1.7, { pos: [k.rs(0.05), h - 0.02, k.rs(0.05)], jseed: 3 });
  }
  k.pop();
  k.circleCollider(rMid, { h });
  k.ud.align = 0;
  return k.build({ lie });
}

export function crate(o = {}) {
  const k = new Kit('crate', o);
  const w = 0.6 + k.rs(0.08), h = 0.46 + k.rs(0.06), d = 0.46 + k.rs(0.05);
  const variant = o.variant || k.pick(['closed', 'closed', 'slatted', 'open', 'straw']);
  const wood = k.pick(WOOD);
  k.push({ yaw: k.rs(0.5) });
  // Corner posts
  const px = w / 2 - 0.028, pz = d / 2 - 0.028;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box('wood', 0.056, h, 0.056, { pos: [sx * px, h / 2, sz * pz], tint: wood, jitter: 0.003 });
  }
  // Floor
  k.box('planks', w - 0.04, 0.025, d - 0.04, { pos: [0, 0.03, 0], tint: wood, jitter: 0.003 });
  // Side slats
  const n = variant === 'slatted' ? 3 : 4;
  const sh = (h - 0.05) / n - 0.012;
  for (let i = 0; i < n; i++) {
    const y = 0.05 + sh / 2 + i * (sh + 0.012);
    const tx = k.pick(WOOD);
    if (variant === 'open' && i === n - 1 && k.chance(0.6)) continue;
    k.box('planks', w - 0.02, sh, 0.022, { pos: [0, y, pz + 0.004], tint: tx, jitter: 0.004, rot: [0, 0, k.rs(0.01)] });
    k.box('planks', w - 0.02, sh, 0.022, { pos: [0, y, -pz - 0.004], tint: tx, jitter: 0.004 });
    const tz = k.pick(WOOD);
    k.box('planks', 0.022, sh, d - 0.02, { pos: [px + 0.004, y, 0], tint: tz, jitter: 0.004 });
    k.box('planks', 0.022, sh, d - 0.02, { pos: [-px - 0.004, y, 0], tint: tz, jitter: 0.004 });
  }
  // Lid
  if (variant === 'closed' || variant === 'slatted') {
    for (let i = 0; i < 3; i++) {
      k.box('planks', 0.19, 0.022, d + 0.02, { pos: [-w / 2 + 0.11 + i * 0.205, h + 0.011, 0], tint: k.pick(WOOD), jitter: 0.004, rot: [0, k.rs(0.02), 0] });
    }
    k.box('wood', w + 0.02, 0.03, 0.05, { pos: [0, h + 0.04, d * 0.28], tint: wood });
    if (!o.indoor && k.chance(0.55)) k.mound(w * 0.9, 0.07 + k.r(0, 0.05), d * 0.9, { pos: [k.rs(0.04), h + 0.03, 0] });
  } else if (variant === 'open') {
    // Lid leaning against the box.
    k.box('planks', w * 0.9, 0.022, d * 0.8, { pos: [w * 0.5 + 0.12, h * 0.5, 0.0], rot: [0, 0, 1.15], tint: wood, jitter: 0.003 });
  }
  if (variant === 'straw' || variant === 'open') {
    k.blob('straw', 0.24, { pos: [0, h - 0.05, 0], scale: [w * 1.7, 0.45, d * 1.7], detail: 1, tint: 0xd8c690 });
  }
  k.pop();
  k.boxCollider(w / 2, d / 2, { h });
  k.ud.align = 0;
  return k.build();
}

export function sack(o = {}) {
  const k = new Kit('sack', o);
  const s = 0.85 + k.rs(0.18);
  const slump = k.chance(0.5);
  const tint = k.pick([0xffffff, 0xd8c8a8, 0xbfae92, 0xa89a82]);
  k.push({ yaw: k.r(0, TAU), rot: [k.rs(0.06), 0, k.rs(0.06)], scale: s });
  const topR = slump ? 0.12 : 0.07;
  const prof = [[0.001, 0], [0.12, 0.004], [0.2, 0.03], [0.26, 0.1], [0.275, 0.2], [0.255, 0.32], [0.2, 0.43], [0.13, 0.5], [topR, 0.57]];
  k.lathe('burlap', prof, { radial: 14, tint, jitter: 0.014, jfreq: 4, grime: 0.5, uRepeat: 2, ripple: { n: 5, amp: 0.05, from: -1, to: 0.6, phase: k.r(0, 6) } });
  // Neck tie and the flopped mouth.
  k.torus('rope', topR + 0.012, 0.012, { pos: [0, 0.56, 0], rot: [Math.PI / 2, 0, 0], tint: 0xb89c6c, seg: 10, rseg: 4 });
  k.lathe('burlap', [[topR + 0.005, 0.54], [topR + 0.045, 0.6], [topR + 0.02, 0.66], [0.02, 0.62]], { radial: 9, tint, jitter: 0.012, uRepeat: 1 });
  if (!o.indoor && k.chance(0.5)) k.mound(0.3, 0.07, 0.3, { pos: [0.02, slump ? 0.52 : 0.55, 0], jseed: 2 });
  k.pop();
  k.circleCollider(0.26 * s, { h: 0.55 * s });
  k.ud.align = 0.6;
  return k.build();
}

export function bucket(o = {}) {
  const k = new Kit('bucket', o);
  const h = 0.3 + k.rs(0.03), rt = 0.17, rb = 0.135;
  const fill = o.fill || k.pick(['ice', 'ice', 'empty', 'water']);
  const wood = k.pick(WOOD);
  k.push({ yaw: k.r(0, TAU), rot: o.tipped ? [0, 0, 1.45] : [0, 0, 0], pos: o.tipped ? [0, rt * 0.9, 0] : [0, 0, 0] });
  const prof = [[rb, 0], [(rb + rt) / 2 + 0.005, h / 2], [rt, h]];
  k.lathe('planks', prof, { radial: 12, flat: true, uRepeat: 3, tint: wood, tile: 0.7 });
  k.lathe('planks', [[rt - 0.012, h], [(rb + rt) / 2 - 0.007, h / 2], [rb - 0.012, 0.015]], { radial: 12, flat: true, uRepeat: 3, tint: 0x4a3e34, grime: 0 });
  k.cyl('planks', rb - 0.01, rb - 0.01, 0.02, { pos: [0, 0.02, 0], radial: 12, tint: 0x4a3e34 });
  if (!o.tipped) {
    if (fill === 'ice') k.cyl('ice', rt - 0.02, rt - 0.02, 0.015, { pos: [0, h - 0.05 - k.r(0, 0.08), 0], radial: 12, tint: 0xd6ecf8, grime: 0 });
    else if (fill === 'water') k.cyl('matte', rt - 0.02, rt - 0.02, 0.015, { pos: [0, h - 0.06, 0], radial: 12, tint: 0x14202a, grime: 0 });
  }
  for (const y of [0.055, h - 0.05]) {
    const r = rb + (rt - rb) * (y / h);
    k.cyl('iron', r + 0.01, r + 0.01, 0.03, { pos: [0, y, 0], radial: 12, open: true, tint: 0x4a4440, grime: 0.1 });
  }
  // Rope handle (bail) arching over the top, or dropped to one side.
  const bail = o.tipped ? 0 : 1;
  if (bail) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      pts.push([Math.cos(a) * rt, h + 0.02 + Math.sin(a) * 0.17, 0]);
    }
    k.tube('rope', pts, 0.008, { radial: 5, tint: 0x9c8660, grime: 0 });
  }
  k.pop();
  k.circleCollider(rt, { h });
  k.ud.align = 0.4;
  return k.build();
}

export function firewoodStack(o = {}) {
  const k = new Kit('firewoodStack', o);
  const w = (o.width || 1.15) + k.rs(0.1);
  const rows = o.rows || 4 + Math.floor(k.r(0, 3));
  const len = 0.5 + k.rs(0.04);
  k.push({ yaw: k.rs(0.1) });
  // Posts at both ends hold the stack; one leans.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.cyl('bark', 0.04, 0.045, rows * 0.15 + 0.18, { pos: [sx * (w / 2 + 0.05), (rows * 0.15 + 0.18) / 2, sz * (len / 2 + 0.03)], rot: [0, 0, sx * k.rs(0.05)], radial: 6, cap: 'logEnd', tint: 0x8a7a6a });
    }
  }
  // Rows of split logs, ends facing the viewer (Z).
  let y = 0;
  for (let r = 0; r < rows; r++) {
    const rr = 0.07 + k.rs(0.01);
    y += rr;
    const n = Math.floor(w / (rr * 2.05)) - (r % 2);
    const x0 = -((n - 1) * rr * 2.05) / 2;
    for (let i = 0; i < n; i++) {
      const rad = rr * k.r(0.78, 1.1);
      const split = k.chance(0.28);
      const l = len * k.r(0.88, 1.05);
      const xo = x0 + i * rr * 2.05 + k.rs(0.008);
      if (split) {
        // Split billet: wedge of pale wood with a bark back.
        k.box('wood', rad * 1.6, rad * 1.7, l, { pos: [xo, y + k.rs(0.01), k.rs(0.02)], rot: [0, k.rs(0.05), k.rs(0.7)], tint: k.pick([0xd8c8b0, 0xc8b89e, 0xbaa98f]), jitter: 0.008, grain: 'z' });
      } else {
        k.log(rad, l, { lie: 'z', pos: [xo, y + k.rs(0.01), k.rs(0.02)], rot: [0, 0, 0], radial: 7, tint: k.pick([0xffffff, 0xd8cdc0, 0xbfb3a6]) });
      }
    }
    y += rr * 0.85;
  }
  if (!o.indoor) k.mound(w * 0.95, 0.12 + k.r(0, 0.08), len * 1.1, { pos: [k.rs(0.05), y + 0.02, 0], jseed: 5 });
  k.pop();
  k.boxCollider(w / 2 + 0.07, len / 2 + 0.05, { h: y + 0.1 });
  k.ud.align = 0;
  return k.build();
}

export function stump(o = {}) {
  const k = new Kit('stump', o);
  const r = (o.radius || 0.24) + k.rs(0.06);
  const h = (o.height || 0.42) + k.rs(0.1);
  k.push({ yaw: k.r(0, TAU) });
  k.cyl('bark', r, r * 1.08, h + 0.06, {
    pos: [0, h / 2 - 0.03, 0], radial: 11, cap: 'logEnd', noBottom: true, jitter: r * 0.09, jfreq: 5, tint: k.pick([0xffffff, 0xc8b8a8]),
  });
  // Root flare: leaning bark wedges.
  const nr = 4 + Math.floor(k.r(0, 3));
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU + k.rs(0.4);
    k.cyl('bark', r * 0.18, r * 0.34, h * 0.55, {
      pos: [Math.cos(a) * r * 1.0, h * 0.18, Math.sin(a) * r * 1.0], rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55], radial: 5, cap: null, tint: 0xb8a898, jitter: 0.01,
    });
  }
  if (!o.indoor && k.chance(0.7)) k.mound(r * 1.7, 0.1 + k.r(0, 0.06), r * 1.7, { pos: [k.rs(0.04), h, k.rs(0.04)], jseed: 1 });
  k.pop();
  k.circleCollider(r * 1.1, { h });
  k.ud.align = 0.7;
  return k.build();
}

export function choppingBlock(o = {}) {
  const k = new Kit('choppingBlock', o);
  const r = 0.26 + k.rs(0.04), h = 0.5 + k.rs(0.06);
  k.push({ yaw: k.r(0, TAU) });
  k.anchor('work', 0, 0, 0.75);
  k.cyl('bark', r * 0.96, r * 1.1, h + 0.04, {
    pos: [0, h / 2 - 0.02, 0], radial: 10, cap: 'logEnd', noBottom: true, jitter: 0.016, jfreq: 5, tint: 0xe0d4c8,
  });
  // Scarred top: chops cut into the end grain.
  for (let i = 0; i < 4; i++) {
    const a = k.r(0, TAU), d = k.r(0, r * 0.6);
    k.box('wood', 0.03, 0.014, k.r(0.1, 0.22), { pos: [Math.cos(a) * d, h + 0.01, Math.sin(a) * d], rot: [0, k.r(0, TAU), 0], tint: 0x4a3a2c, grime: 0 });
  }
  // Axe stuck in the block: handle and iron head.
  const lean = k.rs(0.25);
  k.with({ pos: [r * 0.3, h + 0.01, 0.02], rot: [0.12, 0.4, -0.42 + lean] }, () => {
    k.cyl('wood', 0.017, 0.022, 0.78, { pos: [0, 0.39, 0], radial: 6, tint: 0xd8b890, jitter: 0.004, grain: 'y' });
    k.box('iron', 0.17, 0.12, 0.028, { pos: [0.08, 0.72, 0], tint: 0xa8a8b0, taper: [0.5, 1], jitter: 0.004 });
    k.box('iron', 0.05, 0.1, 0.045, { pos: [-0.02, 0.72, 0], tint: 0x484850 });
  });
  // Chips and split halves in the snow around.
  for (let i = 0; i < 7; i++) {
    const a = k.r(0, TAU), d = k.r(r * 1.3, r * 2.6);
    k.box('wood', k.r(0.07, 0.16), 0.03, k.r(0.04, 0.07), { pos: [Math.cos(a) * d, 0.018, Math.sin(a) * d], rot: [0, k.r(0, TAU), k.rs(0.3)], tint: k.pick([0xf0e4d4, 0xd8c8b0, 0xbfae98]), jitter: 0.004 });
  }
  if (!o.indoor && k.chance(0.5)) k.mound(r * 0.9, 0.05, r * 0.9, { pos: [-r * 0.3, h + 0.005, -r * 0.2], jseed: 7 });
  k.pop();
  k.circleCollider(r * 1.1, { h });
  k.ud.align = 0.5;
  return k.build();
}

export function logs(o = {}) {
  const k = new Kit('logs', o);
  const n = o.count || 2 + Math.floor(k.r(0, 2));
  k.push({ yaw: k.r(0, TAU) });
  for (let i = 0; i < n; i++) {
    const r = 0.13 + k.rs(0.04), len = (o.length || 2.0) + k.rs(0.6);
    const base = i < 2 ? [k.rs(0.05) + (i === 1 ? 0.28 : 0), r * 0.85, (i - 0.5) * 0.3] : [0, r * 1.9, 0.12];
    k.log(r, len, { lie: 'x', pos: base, yaw: i < 2 ? k.rs(0.12) : k.rs(0.2), radial: 9, tint: k.pick([0xd8d0c8, 0xb8aea4, 0xe8e0d8]) });
    // Branch stubs
    for (let b = 0; b < 2; b++) {
      k.cyl('bark', 0.014, 0.03, 0.18, { pos: [base[0] + k.rs(len * 0.35), base[1] + r * 0.9, base[2] + k.rs(0.04)], rot: [k.rs(0.5), 0, k.rs(0.6)], radial: 5, cap: 'logEnd', tint: 0xb8aea4 });
    }
    if (!o.indoor) k.mound(len * 0.82, r * 0.7, r * 1.9, { pos: [base[0], base[1] + r * 0.75, base[2]], jseed: i + 2 });
  }
  k.pop();
  k.boxCollider(1.0, 0.4, { h: 0.5 });
  k.ud.align = 0.3;
  return k.build();
}

// Lantern: iron frame, emissive glass, ring handle. mount: 'ground' | 'hand' | 'post' | 'wall'.
export function lantern(o = {}) {
  const k = new Kit('lantern', o);
  const mount = o.mount || 'ground';
  const s = o.scale || 1;
  k.push({ scale: s });
  const baseY = mount === 'post' ? 1.9 : mount === 'wall' ? 1.6 : mount === 'hand' ? 0 : 0.0;
  if (mount === 'post') {
    k.cyl('wood', 0.045, 0.055, 2.0, { pos: [0, 1.0, 0], radial: 6, tint: 0x9a8a78, jitter: 0.006 });
    k.box('wood', 0.5, 0.045, 0.05, { pos: [0.22, 1.98, 0], tint: 0x9a8a78, jitter: 0.004 });
    k.box('wood', 0.3, 0.035, 0.04, { pos: [0.12, 1.84, 0], rot: [0, 0, 0.78], tint: 0x9a8a78 });
    k.tube('iron', [[0.42, 1.98, 0], [0.42, 1.94, 0], [0.42, 1.88, 0]], 0.007, { radial: 4, tint: 0x4a4a4a });
  } else if (mount === 'wall') {
    k.box('iron', 0.5, 0.03, 0.04, { pos: [0.25, baseY + 0.18, 0], tint: 0x3a3a3a });
    k.tube('iron', [[0.0, baseY + 0.18, 0], [0.18, baseY + 0.3, 0], [0.4, baseY + 0.24, 0]], 0.012, { radial: 5, tint: 0x3a3a3a });
  }
  const px = mount === 'post' ? 0.42 : mount === 'wall' ? 0.42 : 0;
  const oy = mount === 'post' ? 1.6 : mount === 'wall' ? baseY - 0.26 : mount === 'hand' ? 0 : 0;
  k.push({ pos: [px, oy, 0] });
  const w = 0.1, hh = 0.2;
  // Base plate, corner posts, top.
  k.cyl('iron', 0.075, 0.085, 0.03, { pos: [0, 0.015, 0], radial: 8, tint: 0x3c3c3c });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    k.cyl('iron', 0.006, 0.006, hh, { pos: [Math.cos(a) * w * 0.7, 0.03 + hh / 2, Math.sin(a) * w * 0.7], radial: 4, tint: 0x3c3c3c });
  }
  // Glass: emissive core + a warm flame cluster.
  k.cyl('lamp', w * 0.62, w * 0.7, hh, { pos: [0, 0.03 + hh / 2, 0], radial: 8, tint: 0xffe0a0, cap: null, grime: 0, var: 0 });
  k.sph('lamp', 0.03, { pos: [0, 0.1, 0], tint: 0xfff0c0, scale: [1, 1.5, 1], grime: 0, var: 0 });
  k.cyl('iron', 0.05, 0.1, 0.07, { pos: [0, 0.03 + hh + 0.03, 0], radial: 8, tint: 0x3c3c3c });
  k.cone('iron', 0.1, 0.06, { pos: [0, 0.03 + hh + 0.09, 0], radial: 8, tint: 0x3c3c3c });
  k.torus('iron', 0.05, 0.006, { pos: [0, 0.03 + hh + 0.14, 0], rot: [0, 0, 0], tint: 0x3c3c3c, seg: 12, rseg: 4 });
  if (!o.indoor) k.mound(0.13, 0.04, 0.13, { pos: [0, 0.03 + hh + 0.1, 0], jseed: 4 });
  k.anchor('light', 0, 0.13, 0);
  k.fx('glow', [0, 0.13, 0], { size: 1.15 * s, lamp: o.lampOnly !== false, light: !!o.light, strength: 0.75 });
  k.pop();
  k.pop();
  if (mount === 'ground') k.circleCollider(0.1 * s, { h: 0.3 });
  k.ud.align = 0.4;
  return k.build();
}

export function campfire(o = {}) {
  const k = new Kit('campfire', o);
  const r = 0.55 + k.rs(0.06);
  const stones = 8 + Math.floor(k.r(0, 2));
  k.push({ yaw: k.r(0, TAU) });
  for (let i = 0; i < 4; i++) k.anchor('sit' + i, Math.cos(i * 1.57 + 0.4) * 1.3, 0.2, Math.sin(i * 1.57 + 0.4) * 1.3);
  // Melted dark ring and ash.
  k.plane('decal', r * 5.2, r * 5.2, { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x6a5a4c, grime: 0, var: 0.1 });
  k.plane('decal', r * 3.0, r * 3.0, { pos: [0, 0.034, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x1c1a18, grime: 0, var: 0.2, jseed: 3 });
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * TAU + k.rs(0.15);
    const sr = k.r(0.09, 0.15);
    k.blob('stone', sr, { pos: [Math.cos(a) * r, sr * 0.45, Math.sin(a) * r], scale: [1.1, 0.75, 1], tint: k.pick([0xffffff, 0xd8d8d8, 0xb8b8c0, 0xe8e0d8]), detail: 1 });
    if (!o.indoor && k.chance(0.5)) k.mound(sr * 1.6, 0.04, sr * 1.6, { pos: [Math.cos(a) * r, sr * 0.78, Math.sin(a) * r], jseed: i });
  }
  // Charred logs crossing, with glowing coal in the cracks.
  const nl = 3 + Math.floor(k.r(0, 2));
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI + k.rs(0.3);
    k.log(0.06 + k.r(0, 0.02), 0.85 + k.rs(0.1), {
      lie: 'x', pos: [0, 0.09 + i * 0.035, 0], yaw: a, rot: [0, 0, k.rs(0.18)], radial: 7, tint: 0x3a3430, nosnow: true,
    });
  }
  k.cyl('coal', 0.2, 0.26, 0.05, { pos: [0, 0.07, 0], radial: 9, tint: 0xffffff, grime: 0, var: 0.1, jitter: 0.02 });
  k.anchor('fire', 0, 0.1, 0);
  k.fx('fire', [0, 0.12, 0], { scale: o.fireScale || 1.1, radius: 0.27, height: 0.85, light: o.light !== false, smoke: o.smoke !== false });
  k.pop();
  k.circleCollider(r + 0.12, { h: 0.3 });
  k.ud.align = 0;
  k.ud.fire = true;
  return k.build();
}
