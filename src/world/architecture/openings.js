// Windows, doors, shutters and their carved casings, all in the wall frame (x along the wall,
// y up, z outward; see walls.js). Window panes feed the `glow` material, which lights up with
// uWindowLight, and register lights metadata for the lighting builder.
import * as THREE from 'three';
import { MB, C, mixC, scaleC } from './mb.js';
import { PAL, GAIN } from './kit.js';
import { lintelShape } from './carve.js';
import { toLocal } from './walls.js';
import { getMaterials } from './materials.js';

const WARM = [1.0, 0.9, 0.75];

// Opening rectangle in the wall frame, used to cut logs and to size colliders.
export const opening = (s, y, w, h) => ({ s0: s - w / 2, s1: s + w / 2, y0: y, y1: y + h });

const paintOf = (kit, name) => {
  switch (name) {
    case 'red': return scaleC(PAL.red, GAIN * 0.95);
    case 'cream': return scaleC(PAL.cream, GAIN * 0.9);
    case 'ochre': return scaleC(PAL.ochre, GAIN * 0.85);
    case 'natural': return scaleC(PAL.plank, GAIN);
    default: return scaleC(PAL.blueFaded, GAIN * 0.95);
  }
};

// ---------- window ----------
// o: s, y (sill), w, h, r (log radius), shutters ('blue' | 'red' | 'cream' | 'none'), casing (color name),
//    lit (bool, default true), carved (bool), flower (bool)
export function windowUnit(kit, f, o) {
  const { s, y, r } = o;
  const w = o.w ?? 0.78, h = o.h ?? 0.92;
  const casing = paintOf(kit, o.casing ?? o.shutters ?? 'blue');
  const lit = o.lit !== false;
  const gl = lit ? kit.r(0.78, 1.0) : 0.1;
  const tint = lit ? [WARM[0] * gl, WARM[1] * gl * kit.r(0.9, 1.05), WARM[2] * gl * kit.r(0.85, 1.05)] : [gl, gl, gl];
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    // Glass, recessed into the log reveal. Back side too for views from inside.
    const hw = w / 2;
    const c = new THREE.Color(tint[0], tint[1], tint[2]);
    kit.glow.quad([s - hw, y, 0], [s + hw, y, 0], [s + hw, y + h, 0], [s - hw, y + h, 0], c, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    kit.glow.quad([s + hw, y, 0], [s - hw, y, 0], [s - hw, y + h, 0], [s + hw, y + h, 0], c, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // Reveal liner boards (inside the log cut) so the opening reads as a framed hole.
    const liner = scaleC(PAL.plankDark, GAIN * 1.2);
    kit.wood.box(s, y - 0.015, 0, w + 0.06, 0.03, 0.28, liner, { grain: 'x' });
    kit.wood.box(s, y + h + 0.015, 0, w + 0.06, 0.03, 0.28, liner, { grain: 'x' });
    kit.wood.box(s - hw - 0.015, y + h / 2, 0, 0.03, h, 0.28, liner, { grain: 'y' });
    kit.wood.box(s + hw + 0.015, y + h / 2, 0, 0.03, h, 0.28, liner, { grain: 'y' });
    // Casing boards on the outside.
    const zc = r + 0.0;
    const cw = 0.12;
    kit.wood.box(s - hw - cw / 2 - 0.01, y + h / 2 + 0.03, zc, cw, h + 0.2, 0.06, casing, { grain: 'y', rz: kit.rs() * 0.006 });
    kit.wood.box(s + hw + cw / 2 + 0.01, y + h / 2 + 0.03, zc, cw, h + 0.2, 0.06, casing, { grain: 'y', rz: kit.rs() * 0.006 });
    kit.wood.box(s, y - 0.06, zc + 0.04, w + 0.46, 0.06, 0.2, scaleC(casing, 0.85), { grain: 'x', top: scaleC(casing, 1.1) });
    if (o.carved !== false) {
      kit.wood.at(s, y + h + 0.1, zc - 0.015, 0, (m) => {
        m.extrude(lintelShape(w), 0.05, casing, { uv: [1, 3] });
      });
    } else {
      kit.wood.box(s, y + h + 0.1, zc, w + 0.4, 0.1, 0.06, casing, { grain: 'x' });
    }
    // Shutters.
    const sh = o.shutters ?? 'blue';
    if (sh !== 'none') {
      const shCol = paintOf(kit, sh);
      const leafW = w / 2 + 0.04, leafH = h + 0.1;
      for (const side of [-1, 1]) {
        const closed = o.closed === true;
        const alpha = closed ? 0 : kit.pick([1.9, 2.4, 2.9, 2.6]) + kit.rs() * 0.15;
        const hx = s + side * (hw + cw + 0.02);
        const c1 = mixC(shCol, 0x6a5a48, kit.rand() * 0.25).multiplyScalar(kit.r(0.85, 1.05));
        const inner = scaleC(c1, 0.72);
        // Right-hand hinge (side=+1): leaf extends toward -s at alpha 0 and swings outward.
        kit.wood.at(hx, y - 0.03, zc + 0.05, side > 0 ? alpha : -alpha, (m) => {
          const cx = side > 0 ? -leafW / 2 : leafW / 2;
          m.box(cx, leafH / 2, 0, leafW, leafH, 0.035, c1, { grain: 'y' });
          // Raised panel frame + a diamond cutout.
          m.box(cx, leafH / 2, 0.022, leafW - 0.1, leafH - 0.12, 0.012, inner, { grain: 'y' });
          m.box(cx, leafH * 0.62, 0.03, 0.09, 0.09, 0.012, scaleC(PAL.plankDark, GAIN * 0.7), { rz: Math.PI / 4 });
          m.box(cx, leafH * 0.3, 0.03, leafW - 0.06, 0.03, 0.012, scaleC(c1, 0.8), { grain: 'x' });
        });
      }
    }
    if (o.flower) {
      kit.wood.box(s, y - 0.18, r + 0.16, w + 0.1, 0.16, 0.2, scaleC(PAL.plank, GAIN * 0.9), { grain: 'x', top: scaleC(PAL.plankDark, GAIN) });
    }
  });
  if (lit) {
    const p = toLocal(f, s, y + h * 0.5, r + 0.6);
    const n = toLocal(f, s, 0, 1);
    kit.light(p[0], p[1], p[2], { color: 0xffb060, intensity: 0.8 * gl, radius: 7, kind: 'window', dir: [n[0] - f.x, 0, n[2] - f.z] });
  }
}

// ---------- door ----------
// Draws a plank door leaf into mb with the hinge at the origin; the leaf extends toward +x if
// hingeLeft, else -x. Thickness is centered on z = 0.
export function doorLeaf(kit, mb, w, h, hingeLeft = true, o = {}) {
  const sg = hingeLeft ? 1 : -1;
  const n = Math.max(3, Math.round(w / 0.2));
  const bw = w / n;
  const base = o.tone ?? PAL.plank;
  for (let i = 0; i < n; i++) {
    const col = mixC(base, PAL.plankDark, kit.rand() * 0.55).multiplyScalar(GAIN * kit.r(0.85, 1.1));
    mb.box(sg * (i + 0.5) * bw, h / 2, 0, bw - 0.012, h - 0.02, 0.05, col, { grain: 'y', uv: [1, 3] });
  }
  const bat = scaleC(PAL.plankDark, GAIN * 1.15);
  mb.box(sg * w / 2, 0.3, 0.04, w - 0.08, 0.13, 0.03, bat, { grain: 'x' });
  mb.box(sg * w / 2, h - 0.3, 0.04, w - 0.08, 0.13, 0.03, bat, { grain: 'x' });
  const ang = Math.atan2(h - 0.6, w - 0.1);
  mb.box(sg * w / 2, h / 2, 0.042, Math.hypot(w - 0.1, h - 0.6), 0.1, 0.028, bat, { grain: 'x', rz: sg > 0 ? ang : -ang });
  const iron = scaleC(PAL.iron, GAIN * 0.8);
  mb.box(sg * 0.24, 0.52, 0.062, 0.46, 0.05, 0.016, iron, { grain: 'x' });
  mb.box(sg * 0.24, h - 0.52, 0.062, 0.46, 0.05, 0.016, iron, { grain: 'x' });
  mb.box(sg * (w - 0.14), h * 0.48, 0.07, 0.05, 0.16, 0.025, iron, { grain: 'y' });
  mb.box(sg * (w - 0.14), h * 0.48 - 0.1, 0.085, 0.07, 0.07, 0.02, iron, { grain: 'y' });
}

// Door unit: casing, threshold, step and either a merged closed leaf, a pivoting leaf object, or an
// open doorway. o: s, w, h, r, leaf ('closed' | 'object' | 'open'), casing, hingeLeft, step (bool),
//   id (string), openAngle (rad, default 1.75), openState (0..1 initial)
export function doorUnit(kit, f, o) {
  const { s, r } = o;
  const w = o.w ?? 1.05, h = o.h ?? 1.95;
  const casing = paintOf(kit, o.casing ?? 'natural');
  const hingeLeft = o.hingeLeft ?? kit.chance(0.5);
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const hw = w / 2, cw = 0.14;
    const zc = r + 0.0;
    kit.wood.box(s - hw - cw / 2 - 0.01, h / 2 + 0.03, zc, cw, h + 0.12, 0.07, casing, { grain: 'y' });
    kit.wood.box(s + hw + cw / 2 + 0.01, h / 2 + 0.03, zc, cw, h + 0.12, 0.07, casing, { grain: 'y' });
    kit.wood.at(s, h + 0.08, zc - 0.02, 0, (m) => { m.extrude(lintelShape(w + 0.1), 0.055, casing, { uv: [1, 3] }); });
    // Inner jambs and lintel liner through the thick wall.
    const liner = scaleC(PAL.plankDark, GAIN * 1.15);
    kit.wood.box(s - hw - 0.015, h / 2, 0, 0.03, h, 0.3, liner, { grain: 'y' });
    kit.wood.box(s + hw + 0.015, h / 2, 0, 0.03, h, 0.3, liner, { grain: 'y' });
    kit.wood.box(s, h + 0.015, 0, w + 0.06, 0.03, 0.3, liner, { grain: 'x' });
    // Threshold plank.
    kit.wood.box(s, 0.025, 0, w + 0.1, 0.05, 0.4, scaleC(PAL.plank, GAIN * 0.8), { grain: 'x' });
    if (o.step !== false) {
      const sc = mixC(PAL.stone, PAL.stoneWarm, kit.rand()).multiplyScalar(GAIN * 1.1);
      kit.stone.box(s + kit.rs() * 0.04, -0.12, r + 0.5, w + 0.7, 0.28, 0.8, sc, { ry: kit.rs() * 0.06, top: scaleC(sc, 1.1), uv: [2, 2] });
    }
    if (o.leaf === 'closed') {
      kit.wood.at(s + (hingeLeft ? -hw : hw), 0.02, -0.02, 0, () => doorLeaf(kit, kit.wood, w, h - 0.03, hingeLeft));
    }
  });
  const pLocal = toLocal(f, s, 0, r + 0.4);
  const rec = { x: pLocal[0], z: pLocal[2], yaw: f.yaw, w, h, y: 0, kind: o.leaf === 'object' ? 'leaf' : o.leaf === 'closed' ? 'closed' : 'open', id: o.id || null };
  if (o.leaf === 'object') {
    // Separate mesh on a pivot at the hinge so gameplay can swing it.
    const tmp = new MB('door', { uv: [1, 3] });
    doorLeaf(kit, tmp, w, h - 0.03, hingeLeft);
    const mesh = new THREE.Mesh(tmp.build(), getMaterials().wood);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'door-leaf';
    const pivot = new THREE.Group();
    pivot.name = 'door-pivot';
    const hp = toLocal(f, s + (hingeLeft ? -w / 2 : w / 2), 0.02, -0.02);
    pivot.position.set(hp[0], hp[1], hp[2]);
    pivot.add(mesh);
    const openAngle = o.openAngle ?? 1.75;
    const dir = hingeLeft ? -1 : 1; // swing outward
    const set = (t) => { rec.open = t; pivot.rotation.y = f.yaw + dir * openAngle * t; };
    set(o.openState ?? 0);
    rec.pivot = pivot;
    rec.setOpen = set;
    rec.openAngle = openAngle;
    rec.hinge = { x: hp[0], z: hp[2] };
    kit.extra.push(pivot);
  }
  kit.door(rec);
  return rec;
}
