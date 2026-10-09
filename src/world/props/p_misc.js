// Misc props: small rocks, barrel and crate stacks, frozen laundry line, icicles, brazier, torch.
import * as THREE from 'three';
import { Kit, TAU } from './kit.js';
import { barrel, crate } from './p_basic.js';

const WOOD = [0xffffff, 0xe0d2c0, 0xc4ae98, 0xa08a74];

export function rockSmall(o = {}) {
  const k = new Kit('rockSmall', o);
  const variant = o.variant || k.pick(['single', 'single', 'cluster', 'flat']);
  k.push({ yaw: k.r(0, TAU) });
  const rock = (r, x, z, sy) => {
    k.blob('stone', r, { pos: [x, r * sy * 0.55, z], scale: [k.r(0.9, 1.3), sy, k.r(0.8, 1.2)], rot: [k.rs(0.2), k.r(0, TAU), k.rs(0.2)], detail: 2, jitter: r * 0.24, jfreq: 3.2 / r, tint: k.pick([0x8c8c92, 0x7c7c84, 0x9a968e, 0x6e6e76]), grime: 0.3 });
    if (!o.indoor) k.mound(r * 1.25, r * 0.32, r * 1.15, { pos: [x + k.rs(r * 0.1), r * sy * 0.95, z], jseed: Math.floor(x * 10) });
  };
  if (variant === 'cluster') { rock(0.3, 0, 0, 0.8); rock(0.2, 0.4, 0.15, 0.7); rock(0.14, -0.3, 0.3, 0.9); }
  else if (variant === 'flat') rock(0.45, 0, 0, 0.35);
  else rock(0.3 + k.r(0, 0.2), 0, 0, k.r(0.6, 1.0));
  k.pop();
  k.circleCollider(variant === 'cluster' ? 0.5 : 0.35, { h: 0.5 });
  k.ud.align = 0.7;
  return k.build();
}

export function barrelStack(o = {}) {
  const k = new Kit('barrelStack', o);
  const variant = o.variant || k.pick(['pyramid', 'standing']);
  k.push({ yaw: k.rs(0.4) });
  if (variant === 'pyramid') {
    // Barrels lying on their sides in a 3-2-1 pyramid, chocked with wedges.
    const rows = [[-0.64, 0.64, 3], [-0.32, 1.28 - 0.0, 2], [0, 1.9, 1]];
    let idx = 0;
    for (let r = 0; r < 3; r++) {
      const n = 3 - r;
      for (let i = 0; i < n; i++) {
        const b = barrel({ seed: k.seed * 7 + idx++, variant: 'plain', lie: true, indoor: o.indoor, fx: false });
        k.addGroup(b, { pos: [(i - (n - 1) / 2) * 0.64, 0.32 + r * 0.55, 0], yaw: Math.PI / 2 + k.rs(0.05) });
      }
    }
    void rows;
    k.boxCollider(1.0, 0.6, { h: 1.5 });
  } else {
    // Two rows standing, one barrel on top of the middle pair.
    let idx = 0;
    for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) {
      const b = barrel({ seed: k.seed * 5 + idx++, variant: idx % 3 === 0 ? 'open' : 'plain', indoor: o.indoor, fx: false });
      k.addGroup(b, { pos: [x + k.rs(0.03), 0, z + k.rs(0.03)], yaw: k.r(0, TAU) });
    }
    const top = barrel({ seed: k.seed * 3, variant: 'plain', indoor: o.indoor, fx: false });
    k.addGroup(top, { pos: [0, 0.9, 0], yaw: k.r(0, TAU) });
    k.boxCollider(0.68, 0.68, { h: 1.8 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function crateStack(o = {}) {
  const k = new Kit('crateStack', o);
  k.push({ yaw: k.rs(0.4) });
  const layout = [[0, 0, 0], [0.62, 0, 0.05], [0.28, 0.5, 0.0]];
  if (k.chance(0.5)) layout.push([-0.55, 0, 0.1]);
  let i = 0;
  for (const [x, y, z] of layout) {
    const c = crate({ seed: k.seed * 11 + i++, variant: y > 0 ? 'closed' : k.pick(['closed', 'slatted', 'straw']), indoor: o.indoor, fx: false });
    k.addGroup(c, { pos: [x, y, z], yaw: k.rs(0.2) });
  }
  // A rope lashing and a tarp corner.
  k.tube('rope', [[-0.3, 0.2, 0.3], [0.2, 0.56, 0.32], [0.6, 0.2, 0.32]], 0.008, { radial: 4, tint: 0xb89c6c });
  k.pop();
  k.boxCollider(0.85, 0.35, { h: 1.0 });
  k.ud.align = 0;
  return k.build();
}

// Frozen laundry on a line between two poles. Garments are stiff, frosted, tilted by the wind that froze them.
export function laundryLine(o = {}) {
  const k = new Kit('laundryLine', o);
  const L = (o.length || 3.4) + k.rs(0.4);
  const topY = 1.95;
  k.push({ yaw: o.yaw || 0 });
  for (const sx of [-1, 1]) {
    k.cyl('wood', 0.04, 0.055, 2.3, { pos: [sx * L / 2, 1.05, 0], rot: [0, 0, sx * k.rs(0.04)], radial: 6, tint: k.pick(WOOD), jitter: 0.006, cap: 'logEnd' });
    k.box('wood', 0.28, 0.035, 0.04, { pos: [sx * (L / 2 - 0.12), 2.0, 0], rot: [0, 0, sx * -0.6], tint: 0x9a8a78 });
  }
  const sag = 0.16;
  const yAt = (x) => topY - sag * (1 - Math.pow((2 * x) / L, 2));
  const pts = [];
  for (let i = 0; i <= 10; i++) { const x = -L / 2 + (i / 10) * L; pts.push([x, yAt(x), 0]); }
  k.tube('rope', pts, 0.008, { radial: 4, tint: 0xb8a078 });
  const warp = (x, y, z) => [0, 0, z * 0 + Math.sin(y * 3.2 + x * 2.1 + k.seed) * 0.03 + x * x * 0.22 - y * 0.04];
  const peg = (x, y) => k.box('wood', 0.025, 0.07, 0.03, { pos: [x, y - 0.01, 0], tint: 0xb8a690, grime: 0 });
  const garments = ['shirt', 'trousers', 'dress', 'sheet', 'apron', 'socks', 'shirt', 'towel'];
  let x = -L / 2 + 0.35;
  const shuffled = garments.sort(() => k.r(-1, 1)).slice(0, 5 + Math.floor(k.r(0, 2)));
  for (const g of shuffled) {
    const tint = k.pick([0xece8de, 0xd8d8d8, 0xc4c8cc, 0xe0d4bc, 0xa8b4c0, 0x6a5e52, 0xd0c4a8]);
    let w = 0.5, hgt = 0.7;
    const sh = new THREE.Shape();
    let mat = 'linen';
    let plane = null; // rectangular cloth drawn as a subdivided, folded plane
    const folds = (ph, amp) => (px, py) => [0, 0, Math.sin(px * 9 + ph) * amp + Math.sin(px * 4.3 + py * 2 + ph * 2) * amp * 0.7 + px * px * 0.1 - py * 0.03];
    if (g === 'shirt') {
      sh.moveTo(-0.1, 0); sh.lineTo(-0.26, -0.03); sh.lineTo(-0.5, -0.3); sh.lineTo(-0.42, -0.38); sh.lineTo(-0.27, -0.2);
      sh.lineTo(-0.26, -0.72); sh.lineTo(0.26, -0.72); sh.lineTo(0.27, -0.2); sh.lineTo(0.42, -0.38); sh.lineTo(0.5, -0.3); sh.lineTo(0.26, -0.03); sh.lineTo(0.1, 0); sh.lineTo(0, -0.07); sh.closePath();
      w = 1.0; hgt = 0.72;
    } else if (g === 'trousers') {
      sh.moveTo(-0.22, 0); sh.lineTo(0.22, 0); sh.lineTo(0.25, -0.9); sh.lineTo(0.04, -0.9); sh.lineTo(0.0, -0.32); sh.lineTo(-0.04, -0.9); sh.lineTo(-0.25, -0.9); sh.closePath();
      w = 0.5; hgt = 0.9;
    } else if (g === 'dress') {
      w = 0.72; hgt = 1.0; mat = 'dress';
      plane = { m: 'dress', top: 0.45, amp: 0.026 };
    } else if (g === 'apron') {
      w = 0.6; hgt = 0.62; mat = 'dress';
      plane = { m: 'dress', top: 0.55, amp: 0.02 };
    } else if (g === 'sheet') {
      w = 1.12; hgt = 0.95;
      plane = { m: 'cloth', top: 1, amp: 0.03 };
    } else if (g === 'towel') {
      w = 0.34; hgt = 0.65;
      plane = { m: 'cloth', top: 1, amp: 0.018 };
    } else { // socks
      sh.moveTo(-0.22, 0); sh.lineTo(-0.1, 0); sh.lineTo(-0.1, -0.2); sh.lineTo(-0.02, -0.28); sh.lineTo(-0.1, -0.34); sh.lineTo(-0.22, -0.3); sh.closePath();
      const sh2 = new THREE.Shape();
      sh2.moveTo(0.1, 0); sh2.lineTo(0.22, 0); sh2.lineTo(0.22, -0.3); sh2.lineTo(0.1, -0.34); sh2.lineTo(0.02, -0.28); sh2.lineTo(0.1, -0.2); sh2.closePath();
      k.with({ pos: [x + 0.25, yAt(x + 0.25) - 0.01, 0.0] }, () => {
        k.extrude('linen', sh2, 0.012, { tint: 0x9a8a78, bevel: 0.003, warp, grime: 0 });
        peg(0.16, 0);
      });
      w = 0.5; hgt = 0.34;
    }
    const cx = x + w / 2;
    const cy = yAt(cx) - 0.015;
    k.with({ pos: [cx, cy, k.rs(0.02)], yaw: k.rs(0.18), rot: [k.rs(0.05), 0, k.rs(0.05)] }, () => {
      if (plane) {
        const ph = k.r(0, 6);
        const f = folds(ph, plane.amp);
        k.plane(plane.m, w, hgt, {
          pos: [0, -hgt / 2, 0], sx: 10, sy: 8, tint: plane.m === 'dress' ? 0xffffff : tint, grime: 0.05, var: 0.05, tile: 0.9,
          bend: (px, py) => { const sN = (py + hgt / 2) / hgt; const d = f(px, py); return [px * (1 - sN * (1 - plane.top) - 1), 0, d[2]]; },
        });
      } else {
        k.extrude(mat, sh, 0.02, { tint, bevel: 0.007, warp, grime: 0.05, var: 0.06, tile: 0.9 });
      }
      if (g !== 'socks') { peg(-w * 0.32, 0); peg(w * 0.32, 0); }
      // Frozen: icicles along the lowest hem, snow caps on the shoulders, white rime on the top edge.
      for (let i = 0; i < 4; i++) k.cone('ice', 0.012, k.r(0.04, 0.14), { pos: [(i - 1.5) * (w * 0.2), -hgt, 0.0], rot: [Math.PI, 0, 0], radial: 4, tint: 0xd8ecf8, grime: 0 });
      if (!o.indoor) k.mound(w * 0.8, 0.03, 0.05, { pos: [0, 0.003, 0], jseed: Math.floor(x * 10) });
    });
    x += w + 0.06;
    if (x > L / 2 - 0.2) break;
  }
  k.pop();
  k.circleCollider(0.08, { x: -L / 2, h: 2.2 });
  k.circleCollider(0.08, { x: L / 2, h: 2.2 });
  k.ud.align = 0;
  return k.build();
}

// Row of icicles hanging from y = 0 (eaves, rails, beams). Origin is the top edge, centered.
export function icicles(o = {}) {
  const k = new Kit('icicles', o);
  const W = o.width || 1.6, n = o.count || Math.round(W * 7);
  k.push({ yaw: o.yaw || 0 });
  k.box('ice', W, 0.04, 0.07, { pos: [0, -0.01, 0], tint: 0xe4f2fa, grime: 0, jitter: 0.006, seg: [6, 1, 1] });
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + ((i + 0.5) / n) * W + k.rs(0.02);
    const len = (o.maxLen || 0.5) * Math.pow(k.r(0.12, 1), 1.4);
    k.cone('ice', k.r(0.012, 0.03), len, { pos: [x, -0.03 - len / 2, k.rs(0.01)], rot: [Math.PI, 0, 0], radial: 5, tint: k.pick([0xd8ecf8, 0xe8f4fc, 0xc4dcec]), grime: 0, jitter: 0.002 });
  }
  k.pop();
  k.ud.align = 0;
  return k.build();
}

export function brazier(o = {}) {
  const k = new Kit('brazier', o);
  const tall = (o.variant || 'low') === 'tall';
  k.push({ yaw: k.r(0, TAU) });
  const base = tall ? 1.15 : 0.62;
  // Legs
  const legs = tall ? 3 : 4;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * TAU + 0.4;
    k.cyl('iron', 0.016, 0.022, base + 0.05, { pos: [Math.cos(a) * 0.2, base / 2, Math.sin(a) * 0.2], rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2], radial: 5, tint: 0x6a6a72, cap: null });
  }
  k.cyl('iron', 0.2, 0.2, 0.015, { pos: [0, base * 0.35, 0], radial: 3 + legs, open: true, tint: 0x5a5a62 });
  // Bowl, rim and handles
  k.lathe('iron', [[0.001, base], [0.16, base + 0.01], [0.26, base + 0.1], [0.3, base + 0.2], [0.285, base + 0.215], [0.24, base + 0.12], [0.14, base + 0.05], [0.001, base + 0.04]], { radial: 14, tint: 0x9a9aa2, uRepeat: 2, grime: 0.2 });
  for (const sx of [-1, 1]) k.torus('iron', 0.04, 0.008, { pos: [sx * 0.31, base + 0.17, 0], rot: [0, Math.PI / 2, 0], tint: 0x5a5a62, seg: 8, rseg: 4 });
  // Coals and logs in the bowl, ash spill, frost ring
  k.cyl('coal', 0.22, 0.24, 0.05, { pos: [0, base + 0.15, 0], radial: 10, tint: 0xffffff, grime: 0, jitter: 0.015 });
  for (let i = 0; i < 3; i++) k.log(0.035, 0.34, { lie: 'x', pos: [0, base + 0.19 + i * 0.025, 0], yaw: i * 1.1, radial: 6, tint: 0x3a3430, nosnow: true });
  if (!o.indoor) k.mound(0.5, 0.05, 0.5, { pos: [0, 0.0, 0], jseed: 2 });
  k.plane('decal', 1.2, 1.2, { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], tint: 0x5a4a3c, grime: 0 });
  k.anchor('fire', 0, base + 0.2, 0);
  if (o.lit !== false) k.fx('fire', [0, base + 0.2, 0], { scale: tall ? 0.95 : 0.8, radius: 0.2, height: 0.7, light: true, smoke: !!o.smoke });
  k.pop();
  k.circleCollider(0.32, { h: base + 0.2 });
  k.ud.align = 0;
  return k.build();
}

// Pitch torch stuck in the snow, or carried (variant 'hand' has no snow mound).
export function torch(o = {}) {
  const k = new Kit('torch', o);
  const hand = (o.variant || 'stuck') === 'hand';
  k.push({ yaw: o.yaw || 0, rot: hand ? [0, 0, 0] : [k.rs(0.1), 0, k.rs(0.12)] });
  const H = hand ? 0.8 : 1.5;
  k.cyl('wood', 0.018, 0.024, H, { pos: [0, H / 2 - (hand ? 0 : 0.2), 0], radial: 5, tint: 0xc4ae98, jitter: 0.003, cap: 'logEnd' });
  // Wrapped head dark with pitch, a rag tail, iron band
  k.lathe('burlap', [[0.02, H - (hand ? 0 : 0.2) - 0.2], [0.05, H - (hand ? 0 : 0.2) - 0.1], [0.06, H - (hand ? 0 : 0.2) + 0.02], [0.035, H - (hand ? 0 : 0.2) + 0.08], [0.001, H - (hand ? 0 : 0.2) + 0.09]], { radial: 8, tint: 0x2a221c, jitter: 0.008, uRepeat: 1, grime: 0 });
  k.cyl('iron', 0.036, 0.036, 0.02, { pos: [0, H - (hand ? 0 : 0.2) - 0.2, 0], radial: 7, open: true, tint: 0x4a4a4e });
  const top = H - (hand ? 0 : 0.2) + 0.1;
  k.anchor('flame', 0, top, 0);
  if (o.lit !== false) k.fx('torch', [0, top, 0], { scale: o.scale || 1, light: o.light !== false });
  if (!hand && !o.indoor) k.mound(0.3, 0.07, 0.3, { pos: [0, 0, 0], jseed: 2 });
  k.pop();
  k.ud.align = 0;
  return k.build();
}

// Wind-sculpted snow drift (banked against walls and fences). Shrinks with the thaw.
export function snowDrift(o = {}) {
  const k = new Kit('snowDrift', o);
  const w = (o.width || 3.0) + k.rs(0.4), d = (o.depth || 1.0) + k.rs(0.2), h = (o.height || 0.6) + k.rs(0.1);
  k.push({ yaw: o.yaw || 0 });
  const n = Math.max(3, Math.round(w / 0.9));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    const hh = h * k.r(0.55, 1.0) * (1 - Math.pow((2 * x) / w, 2) * 0.45);
    k.mound(w / n * 1.9, hh, d * k.r(0.8, 1.2), { pos: [x, -0.02, k.rs(0.12)], rot: [0, k.rs(0.2), 0], jseed: i + 1 });
  }
  // A scalloped crest ridge.
  k.mound(w * 0.9, h * 0.45, d * 0.35, { pos: [0, h * 0.55, -d * 0.25], jseed: 9 });
  k.pop();
  k.ud.align = 0.5;
  return k.build();
}
