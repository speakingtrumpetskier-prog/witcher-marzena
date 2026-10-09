// The generic log cabin: notched log walls, plinth, plank or log gables, gable roof with snow and
// ornaments, windows with shutters, doors, optional porch / lean-to / chimney / interior floor.
// Most of the catalog (logHouse, longhouse, tavern, hanka house, banya, boathouse...) is a spec
// for this generator plus a few special parts.
//
// Frame: the ridge runs along local z. Front gable faces +z. Floor top is y = 0.
// Wall names: front (+z), back (-z), right (+x), left (-x). Wall frame: s along (right as seen from
// outside), y up (see walls.js).
import * as THREE from 'three';
import { scaleC, mixC } from './mb.js';
import { PAL, GAIN } from './kit.js';
import { gableRoof } from './roofs.js';
import { WALLS, wallFrame, toLocal, logWall, plinth, plankGable, logGable, floorBoards, wallColliders } from './walls.js';
import { opening, windowUnit, doorUnit } from './openings.js';
import { chimney, porch, leanTo } from './details.js';
import { ceiling } from './furnish.js';

const DEFAULT = {
  w: 6.4, d: 5.4, courses: 8, storeys: 1, r: 0.2, pitch: 0.86, oe: 0.78, og: 0.58,
  gable: 'planks', snow: 0.28, interior: false,
  doors: [], windows: [], style: {}, paint: null, shutters: 'blue',
  chimney: null, porch: null, leanTo: null, plinth: true, roofOpts: {}, openWalls: [], floor: 'boards',
  ceiling: false,
};

// spec.lift raises the whole cabin (granary on posts, stilt huts); metadata follows.
export function cabin(kit, spec) {
  if (!spec.lift) return cabinInner(kit, spec);
  const lift = spec.lift;
  const n0 = { lights: kit.lights.length, doors: kit.doors.length, floors: kit.walk.floors.length, extra: kit.extra.length };
  const a0 = new Set(Object.keys(kit.anchors));
  let res;
  kit.frame(0, lift, 0, 0, () => { res = cabinInner(kit, { ...spec, lift: 0 }); });
  for (let i = n0.lights; i < kit.lights.length; i++) kit.lights[i].y += lift;
  for (let i = n0.doors; i < kit.doors.length; i++) kit.doors[i].y = (kit.doors[i].y || 0) + lift;
  for (let i = n0.floors; i < kit.walk.floors.length; i++) kit.walk.floors[i].y += lift;
  for (let i = n0.extra; i < kit.extra.length; i++) kit.extra[i].position.y += lift;
  for (const k of Object.keys(kit.anchors)) if (!a0.has(k)) kit.anchors[k].y += lift;
  res.lift = lift;
  return res;
}

function cabinInner(kit, spec) {
  const s = { ...DEFAULT, ...spec };
  const hw = s.w / 2, hd = s.d / 2, r = s.r;
  const P = 2 * r * 0.9; // vertical pitch of courses
  const N = s.courses * s.storeys;
  const storeyH = s.courses * P;
  // Top of the eave-side (left/right) walls: those logs sit half a pitch higher.
  const yEave = 2 * r + (N - 1) * P + P * 0.5;
  const yFrontTop = 2 * r + (N - 1) * P;
  const tan = Math.tan(s.pitch);
  const out = { hw, hd, r, P, N, yEave, storeyH };

  kit.footprint = { hw: hw + r, hd: hd + r };
  const isOpen = (wall) => s.openWalls.includes(wall);

  // ----- openings per wall -----
  const open = { front: [], back: [], left: [], right: [] };
  const doorGaps = { front: [], back: [], left: [], right: [] };
  for (const d of s.doors) {
    const op = opening(d.s, 0.04, d.w ?? 1.05, d.h ?? 1.95);
    open[d.wall].push(op);
    doorGaps[d.wall].push({ s0: op.s0 + 0.03, s1: op.s1 - 0.03 });
  }
  for (const wn of s.windows) {
    const y = wn.y + (wn.level || 0) * storeyH;
    open[wn.wall].push(opening(wn.s, y, wn.w ?? 0.78, wn.h ?? 0.92));
  }

  // ----- plinth, logs -----
  if (s.plinth) plinth(kit, hw, hd, r, {});
  for (const wall of WALLS) {
    const f = wallFrame(wall, hw, hd);
    if (isOpen(wall)) { openWall(kit, f, hw, hd, r, yFrontTop, yEave, wall); continue; }
    logWall(kit, f, {
      courses: N, r, pitch: P, y0: 0, yOff: f.side ? P * 0.5 : 0, openings: open[wall], style: s.style,
    });
  }

  // ----- roof -----
  const roof = gableRoof(kit, {
    hw, hd, yE: yEave, pitch: s.pitch, oe: s.oe, og: s.og, snow: s.snow, paint: s.paint, gz: hd + 0.14, ...s.roofOpts,
  });
  out.roof = roof;
  const under = (ax) => yEave - 0.08 + (hw - ax) * tan;

  // ----- gables -----
  for (const wall of ['front', 'back']) {
    const f = wallFrame(wall, hw, hd);
    const o = { hw, yBase: yFrontTop - 0.14, under, z: 0.05, r, pitch: P, style: s.style };
    if (s.gable === 'logs') logGable(kit, f, o); else plankGable(kit, f, o);
  }
  // Attic windows high in the gable planks.
  if (s.atticWindow !== false && s.gable !== 'logs') {
    for (const wall of ['front', 'back']) {
      const f = wallFrame(wall, hw, hd);
      const y = yFrontTop + (roof.ridgeY - yFrontTop) * 0.35;
      if (kit.chance(0.85)) atticWindow(kit, f, 0, y, s.shutters, s.atticLit !== false && kit.chance(0.8));
    }
  }

  // ----- windows and doors -----
  for (const wn of s.windows) {
    if (isOpen(wn.wall)) continue;
    const f = wallFrame(wn.wall, hw, hd);
    windowUnit(kit, f, {
      s: wn.s, y: wn.y + (wn.level || 0) * storeyH, w: wn.w ?? 0.78, h: wn.h ?? 0.92, r,
      shutters: wn.shutters ?? s.shutters, casing: wn.casing, lit: wn.lit, carved: wn.carved, closed: wn.closed, flower: wn.flower,
    });
  }
  out.doorRecs = [];
  for (const d of s.doors) {
    if (isOpen(d.wall)) continue;
    const f = wallFrame(d.wall, hw, hd);
    out.doorRecs.push(doorUnit(kit, f, {
      r, leaf: d.leaf ?? 'closed', s: d.s, w: d.w ?? 1.05, h: d.h ?? 1.95, casing: d.casing, hingeLeft: d.hingeLeft,
      id: d.id, step: d.step, openState: d.openState, openAngle: d.openAngle,
    }));
  }

  // ----- colliders -----
  for (const wall of WALLS) {
    if (isOpen(wall)) continue;
    const f = wallFrame(wall, hw, hd);
    wallColliders(kit, f, r, doorGaps[wall], { t: r * 1.0 });
  }

  // ----- chimneys -----
  const chims = s.chimneys || (s.chimney ? [s.chimney] : []);
  chims.forEach((c, ci) => {
    const wall = c.wall ?? 'back';
    const f = wallFrame(wall, hw, hd);
    const top = roof.ridgeY + (c.above ?? 1.0);
    const sm = chimney(kit, f, { s: c.s ?? 0, yTop: top, w: c.w ?? 1.5, d: c.d ?? 0.95, z0: r - 0.05, yBot: -0.5 });
    if (c.smoke !== false) {
      kit.anchor(ci === 0 ? 'chimney' : `chimney${ci + 1}`, sm.x, sm.y, sm.z);
      kit.anchor(ci === 0 ? 'smoke' : `smoke${ci + 1}`, sm.x, sm.y + 0.2, sm.z);
    }
    const cc = toLocal(f, c.s ?? 0, 0, r + 0.5);
    kit.box(cc[0], cc[2], (c.w ?? 1.5) / 2, 0.55, f.yaw);
    kit.skirtExclude.push({ x: cc[0], z: cc[2], hw: (c.w ?? 1.5) / 2 + 0.2, hd: 0.7, yaw: f.yaw });
  });
  if (!chims.length && s.smokeHole !== false) kit.anchor('smoke', 0, roof.ridgeY + 0.3, 0);

  // ----- porch -----
  if (s.porch) {
    const p = s.porch;
    const wall = p.wall ?? 'front';
    const f = wallFrame(wall, hw, hd);
    const anchor = porch(kit, f, {
      s: p.s ?? 0, w: p.w ?? 3.0, depth: p.depth ?? 1.9, r, benches: p.benches ?? false, doorS: p.doorS ?? 0,
      paint: p.paint ?? s.paint ?? PAL.blueFaded, hHigh: p.hHigh, hLow: p.hLow, steps: p.steps, stepsShift: p.stepsShift,
    });
    kit.anchor('porch', anchor.x, anchor.y, anchor.z);
    const pc = toLocal(f, p.s ?? 0, 0, r + (p.depth ?? 1.9) / 2);
    kit.skirtExclude.push({ x: pc[0], z: pc[2], hw: (p.w ?? 3.0) / 2 + 0.5, hd: (p.depth ?? 1.9) / 2 + 0.9, yaw: f.yaw });
  }
  // ----- lean-to -----
  if (s.leanTo) {
    const l = s.leanTo;
    const f = wallFrame(l.wall, hw, hd);
    leanTo(kit, f, { s: l.s ?? 0, len: l.len ?? 3, depth: l.depth ?? 1.4, z0: r + 0.05, hHigh: l.hHigh, hLow: l.hLow, wood: l.wood });
    const lc = toLocal(f, l.s ?? 0, 0, r + 0.05 + (l.depth ?? 1.4) / 2);
    kit.skirtExclude.push({ x: lc[0], z: lc[2], hw: (l.len ?? 3) / 2 + 0.4, hd: (l.depth ?? 1.4) / 2 + 0.7, yaw: f.yaw });
    // The lean-to is solid enough to block walking.
    kit.box(lc[0], lc[2], (l.len ?? 3) / 2, (l.depth ?? 1.4) / 2, f.yaw);
  }

  // ----- interior -----
  if (s.interior) {
    kit.interior = true;
    if (s.floor === 'boards') floorBoards(kit, -hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, 0.05, { holes: s.floorHoles });
    kit.walk.floors.push({ y: 0.05, polygon: [[-hw + 0.1, -hd + 0.1], [hw - 0.1, -hd + 0.1], [hw - 0.1, hd - 0.1], [-hw + 0.1, hd - 0.1]] });
    if (s.ceiling) ceiling(kit, -hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, s.ceilingY ?? (yEave - 0.35));
    if (s.tieBeams) {
      const yb = s.tieBeams.y ?? (yEave - 0.3);
      for (let z = -hd + 1.0; z <= hd - 0.9; z += s.tieBeams.step ?? 1.9) {
        kit.wood.tube([-hw - 0.05, yb, z], [hw + 0.05, yb + kit.rs() * 0.015, z], 0.17, 0.16, scaleC(PAL.logDark, GAIN * 1.3), { seg: 9, lenSeg: 4, ao: 0.3, bow: [0, -0.02, 0], uo: kit.rand(), vo: kit.rand() });
      }
    }
  }
  return out;
}

// A wall left open: two stout corner posts and a header beam carrying the gable or eave line.
function openWall(kit, f, hw, hd, r, yFrontTop, yEave, wall) {
  const top = f.side ? yEave : yFrontTop;
  const col = mixC(PAL.logDark, PAL.logWeathered, 0.5).multiplyScalar(GAIN);
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const L = f.L;
    for (const sx of [-1, 1]) {
      const lean = kit.rs() * 0.015;
      kit.wood.tube([sx * L / 2, -0.4, 0.05], [sx * L / 2 + lean * top, top + 0.05, 0.05], 0.22, 0.2, col, { seg: 9, lenSeg: 3, ao: 0.3, wobble: 0.03, ph: kit.rand() * 5, uo: kit.rand() });
      kit.stone.box(sx * L / 2, -0.25, 0.05, 0.7, 0.5, 0.7, mixC(PAL.stoneDark, PAL.stone, kit.rand()).multiplyScalar(GAIN), { uv: [2, 2], ry: kit.rs() * 0.4 });
    }
    kit.wood.tube([-L / 2 - 0.35, top - 0.15, 0.05], [L / 2 + 0.35, top - 0.15, 0.05], 0.2, 0.19, col, { seg: 9, lenSeg: 4, ao: 0.3, bow: [0, -0.02, 0], uo: kit.rand() });
    kit.wood.tube([-L / 2 - 0.3, top - 0.55, 0.05], [L / 2 + 0.3, top - 0.55, 0.05], 0.12, 0.12, col, { seg: 8, lenSeg: 3, ao: 0.3, uo: kit.rand() });
    // Knee braces.
    for (const sx of [-1, 1]) {
      kit.wood.tube([sx * L / 2, top - 1.3, 0.05], [sx * (L / 2 - 0.9), top - 0.5, 0.05], 0.09, 0.09, col, { seg: 6, lenSeg: 1, ao: 0.2 });
    }
  });
  for (const sx of [-1, 1]) {
    const p = toLocal(f, sx * f.L / 2, 0, 0.05);
    kit.circle(p[0], p[2], 0.28);
  }
  void wall; void hw; void hd; void r;
}

// A small lit window high in a gable (rectangular attic window with a painted frame).
function atticWindow(kit, f, sx, y, shutters, lit = true) {
  kit.frame(f.x, 0, f.z, f.yaw, () => {
    const z = 0.1 + 0.03;
    const w = 0.5, h = 0.6;
    const g = lit ? kit.r(0.75, 1.0) : 0.1;
    const c = lit ? new THREE.Color(g, g * 0.9, g * 0.75) : new THREE.Color(g, g, g);
    kit.glow.quad([sx - w / 2, y, z], [sx + w / 2, y, z], [sx + w / 2, y + h, z], [sx - w / 2, y + h, z], c, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const col = scaleC(shutters === 'red' ? PAL.red : PAL.blueFaded, GAIN * 0.9);
    kit.wood.box(sx, y - 0.04, z + 0.02, w + 0.2, 0.08, 0.07, col, { grain: 'x' });
    kit.wood.box(sx, y + h + 0.04, z + 0.02, w + 0.2, 0.08, 0.07, col, { grain: 'x' });
    kit.wood.box(sx - w / 2 - 0.04, y + h / 2, z + 0.02, 0.08, h + 0.16, 0.07, col, { grain: 'y' });
    kit.wood.box(sx + w / 2 + 0.04, y + h / 2, z + 0.02, 0.08, h + 0.16, 0.07, col, { grain: 'y' });
  });
  if (lit) {
    const p = toLocal(f, sx, y + 0.3, 0.7);
    kit.light(p[0], p[1], p[2], { color: 0xffb060, intensity: 0.5, radius: 6, kind: 'window' });
  }
}
