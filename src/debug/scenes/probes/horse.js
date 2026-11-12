// Kasza in the way: she is left standing right outside a door (where a rider gets down), Vesna goes in and then has
// to get out again. A horse that never moves would bar the door. Checked at Hanka's hut, the tavern and the
// longhouse; also that Vesna can get down beside a wall without ending inside it, and that the whistle brings the
// horse from far off.
import { makeWalker } from './_walker.js';

export default async function horseProbe(k) {
  const { G, P, ok, step, tick, wait, waitFor, drive, placeAt } = k;
  await drive(G.story.debugStart('main_ice', 'ask'));
  await wait(1);
  G.time.scale = 0;
  G.time.setHours(13);
  const W = makeWalker({ G, tick });
  const H = G.horse;
  if (!H) { ok('there is a horse', false); return; }
  const doors = (G.storyCtl.V.doors || []).filter((d) => ['hanka:front', 'tavern:front', 'longhouse:front'].includes(d.id));
  for (const d of doors) {
    step(`horse at ${d.id}`);
    const r = d.rec;
    // outward normal of the door: the side the room's centre is not on
    const room = G.world.rooms.find((q) => d.id.startsWith(q.id));
    const ox = r.x - room.box.x, oz = r.z - room.box.z, ol = Math.hypot(ox, oz) || 1;
    // the door faces along +z or -z of the house; take the axis of the larger offset
    const nx = Math.abs(ox) > Math.abs(oz) ? Math.sign(ox) : 0, nz = Math.abs(ox) > Math.abs(oz) ? 0 : Math.sign(oz);
    void ol;
    const hx = r.x + nx * 1.5, hz = r.z + nz * 1.5;
    // Vesna inside, Kasza broadside across the door
    placeAt(room.box.x, room.box.z, 0);
    await wait(0.3);
    H.teleport(hx, hz, Math.atan2(nx, nz) + Math.PI / 2);
    await wait(0.5);
    const hp0 = { x: H.root.position.x, z: H.root.position.z };
    const tx = r.x + nx * 7, tz = r.z + nz * 7;
    const res = await W.walkTo(tx, tz, { arrive: 1.2, timeout: 30 });
    const moved = Math.hypot(H.root.position.x - hp0.x, H.root.position.z - hp0.z);
    ok(`with Kasza across ${d.id}, she can still get out`, res.ok, `${res.why} at ${P().position.x.toFixed(1)},${P().position.z.toFixed(1)} after ${res.secs} s; Kasza at ${H.root.position.x.toFixed(1)},${H.root.position.z.toFixed(1)} (moved ${moved.toFixed(1)} m), state ${H.state}`);
  }
  // The whistle: from the middle of the village with her far off (she has to find a way in through the gates), with
  // her left outside the palisade (she walks in from where she is), and from inside the tavern (she waits outside,
  // clear of the door, and Vesna can walk out past her).
  const V = { center: { x: 0, z: 115 } }, gate = G.storyCtl.V.gate; // the village's centre (layout.js)
  const near = () => Math.hypot(H.root.position.x - P().position.x, H.root.position.z - P().position.z);
  const whistle = async (label, secs, want) => {
    await k.tap('KeyX');
    const t0 = k.sim.t;
    const came = await waitFor(() => H.state === 'idle' && H.arrived && (want ? want() : near() < 6), secs, label);
    ok(`whistle, ${label}`, came, `state ${H.state}, ${near().toFixed(1)} m away after ${(k.sim.t - t0).toFixed(0)} s, at ${H.root.position.x.toFixed(0)},${H.root.position.z.toFixed(0)}, tries ${H.placeTries}`);
    return came;
  };
  step('whistle in the square');
  placeAt(V.center.x + 2, V.center.z + 9, 0);
  H.teleport(-200, 200, 0);
  await wait(0.5);
  await whistle('in the square, Kasza far off', 75);
  step('whistle from inside the palisade');
  placeAt(V.center.x - 6, V.center.z + 4, 0);
  H.teleport(gate.x - 45, gate.z + 6, 0);
  await wait(0.5);
  await whistle('in the square, Kasza outside the west gate', 90);
  step('whistle from the tavern');
  const tav = G.world.rooms.find((q) => q.id === 'tavern');
  placeAt(tav.box.x, tav.box.z, 0);
  H.teleport(-200, 200, 0);
  await wait(0.5);
  const waited = await whistle('inside the tavern', 90, () => !G.world.indoors(H.root.position.x, H.root.position.z) && near() < 22);
  if (waited) {
    const d = (G.storyCtl.V.doors || []).find((q) => q.id === 'tavern:front');
    const ox = d.rec.x - tav.box.x, oz = d.rec.z - tav.box.z;
    const nx = Math.abs(ox) > Math.abs(oz) ? Math.sign(ox) : 0, nz = Math.abs(ox) > Math.abs(oz) ? 0 : Math.sign(oz);
    ok('she does not stand in the doorway', Math.hypot(H.root.position.x - (d.rec.x + nx * 1.2), H.root.position.z - (d.rec.z + nz * 1.2)) > 2.2, `Kasza ${Math.hypot(H.root.position.x - d.rec.x, H.root.position.z - d.rec.z).toFixed(1)} m from the door`);
    const res = await W.walkTo(d.rec.x + nx * 8, d.rec.z + nz * 8, { arrive: 1.5, timeout: 40 });
    ok('Vesna walks out of the tavern past her', res.ok, `${res.why} after ${res.secs} s`);
  }
  step('whistle in the wild');
  const wt = G.world.locations.watchtower;
  placeAt(wt.crest.x - 24, wt.crest.z + 16, 0);
  H.teleport(-200, 200, 0);
  await wait(0.5);
  await whistle('on the pass road', 75);
  W.release();
}
