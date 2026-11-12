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
  // The whistle from far away.
  step('whistle');
  placeAt(2, 124, 0);
  H.teleport(-200, 200, 0);
  await wait(0.5);
  await k.tap('KeyX');
  const came = await waitFor(() => Math.hypot(H.root.position.x - P().position.x, H.root.position.z - P().position.z) < 6, 40, 'kasza comes');
  ok('the whistle brings Kasza', came, `state ${H.state}, ${Math.hypot(H.root.position.x - P().position.x, H.root.position.z - P().position.z).toFixed(1)} m away`);
  W.release();
}
