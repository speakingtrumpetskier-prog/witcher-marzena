// Interiors and doors, shared by every location (installed once by the village build, before any
// location registers its rooms).
//
//   G.world.indoors(x, z)        true inside any registered interior (village: tavern, Hanka's house, longhouse
//                                and its cellar, workshop, banya). G.world.indoorRoom(x, z) returns the id or null.
//   G.world.registerInterior({ id, box: { x, z, hw, hd, yaw } | polygon: [[x, z], ...], env: 'room' | 'hall' | 'cave',
//                              y0?, y1? })    -> handle { id, remove() }. y0..y1 is the height window in which the
//                              viewer counts as inside (default: any height); lights registered with the same
//                              `room` id and indoor:true stay lit while the viewer is inside.
//   G.world.registerDoor(rec, { rest = 0, near = 1.6, speed = 2.4 })   rec: an architecture door record (setOpen,
//                              x, z, y). It swings open when the viewer is within `near` meters, eases back to `rest`.
//   G.world.currentRoom          room id the viewer (player, else camera) is in, or null
//   events: 'interior:enter' / 'interior:leave' { id, env }
//   audio:  G.audio.setEnvironment(env) on enter ('room' | 'hall' | 'cave'), 'hall' (the outdoor setting) on leave
//   lights: G.world.lights.setRoom(id)
import { ORDER } from '../../core/G.js';
import { inRect } from './village/util.js';

function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export function installInteriors(G) {
  if (G.world.registerInterior) return;
  const rooms = [];
  const doors = [];

  const roomAt = (x, z, y) => {
    for (const r of rooms) {
      if (y != null && (y < r.y0 || y > r.y1)) continue;
      if (r.box ? inRect(x, z, r.box.x, r.box.z, r.box.hw - 0.05, r.box.hd - 0.05, r.box.yaw || 0) : inPoly(x, z, r.polygon)) return r;
    }
    return null;
  };
  G.world.indoors = (x, z) => !!roomAt(x, z);
  G.world.indoorRoom = (x, z) => roomAt(x, z)?.id || null;
  G.world.currentRoom = null;
  G.world.rooms = rooms;
  G.world.registerInterior = (o) => {
    const r = { id: o.id, env: o.env || 'room', box: o.box || null, polygon: o.polygon || null, y0: o.y0 ?? -1e9, y1: o.y1 ?? 1e9 };
    rooms.push(r);
    return { id: r.id, remove: () => { const i = rooms.indexOf(r); if (i >= 0) rooms.splice(i, 1); } };
  };
  G.world.registerDoor = (rec, o = {}) => {
    const d = { rec, rest: o.rest ?? rec.open ?? 0, near: o.near ?? 1.6, speed: o.speed ?? 2.4, cur: rec.open ?? 0, tgt: rec.open ?? 0 };
    doors.push(d);
    return { remove: () => { const i = doors.indexOf(d); if (i >= 0) doors.splice(i, 1); } };
  };
  G.world.doors = doors;

  let envSet = false;
  G.addSystem('interiors', (dt) => {
    const p = G.player?.position || G.camera?.position;
    if (!p) return;
    // ----- rooms -----
    const here = roomAt(p.x, p.z, p.y);
    const id = here ? here.id : null;
    if (id !== G.world.currentRoom) {
      const prev = G.world.currentRoom;
      G.world.currentRoom = id;
      G.world.lights?.setRoom(id);
      if (prev) G.events.emit('interior:leave', { id: prev });
      if (id) G.events.emit('interior:enter', { id, env: here.env });
      if (G.audio?.setEnvironment) {
        if (id) { G.audio.setEnvironment(here.env); envSet = true; } else if (envSet) { G.audio.setEnvironment('hall'); envSet = false; }
      }
    }
    // ----- doors -----
    for (const d of doors) {
      const rec = d.rec;
      const dx = p.x - rec.x, dz = p.z - rec.z;
      const dy = Math.abs(p.y - ((rec.y ?? 0) + 1));
      const want = dx * dx + dz * dz < d.near * d.near && dy < 3.2 ? 1 : d.rest;
      if (want !== d.tgt) {
        d.tgt = want;
        if (G.audio?.sfx && Math.abs(want - d.cur) > 0.3) G.audio.sfx(want > d.cur ? 'door' : 'door_close', { pos: { x: rec.x, y: (rec.y ?? 0) + 1, z: rec.z }, volume: 0.7 });
      }
      if (d.cur !== d.tgt) {
        d.cur += Math.max(-dt * d.speed, Math.min(dt * d.speed, d.tgt - d.cur));
        rec.setOpen(d.cur);
      }
    }
  }, ORDER.logic + 8);
}
