// Reach everything: can the player walk up to every interactive thing in the world (notes, chests, beds, fires,
// fishing holes, story objects whether or not their time has come) from open ground a few steps away? For each one
// she is put on a free outdoor spot 10 to 16 m off and walks to it with the real controls until its prompt shows,
// or, for a thing that is not on yet, until she stands inside its radius on its own floor. A thing she cannot get
// to fails with where she was held up. People are left out (probes/reach.js walks to them at every hour).
// Stage: main_ice:ask at one in the afternoon. About ten minutes.
//   node scripts/probe.mjs reachall [--q "thing=ctl:ledger"]
import { makeWalker } from './_walker.js';

export default async function reachAll(k) {
  const { G, Q, P, ok, step, tick, wait, drive, placeAt, itemPos } = k;
  await drive(G.story.debugStart('main_ice', 'ask'));
  await wait(1);
  G.time.scale = 0;
  G.time.setHours(13);
  G.story.noAutosave = true;
  const W = makeWalker({ G, tick });
  const nav = G.npcs.nav;
  const world = G.world;
  const only = Q.get('thing'); // (`only` is the engine's own switch)
  const items = [...G.interact.items.values()].filter((it) => !it.id.startsWith('npc_') && (!only || it.id === only));
  let n = 0, bad = 0, skipped = 0;
  step('reach everything');
  for (const it of items) {
    let p = null;
    try { p = itemPos(it); } catch { p = null; }
    if (!p || !Number.isFinite(p.x) || Math.abs(p.x) > 5000) { skipped++; continue; }
    // its own floor, when that is not the ground there (a cellar, a belfry, a cave)
    const own = world.floorAt ? world.floorAt(p.x, p.z, p.y) : null;
    const ground = (world.floorAt ? world.floorAt(p.x, p.z) : null) ?? world.heightAt(p.x, p.z);
    const y = own != null && Math.abs(own - ground) > 1.0 ? own : undefined;
    // a free spot in the open, the nearer ring first
    let s = null;
    for (let a = 0; a < 36 && !s; a++) {
      const r = 10 + Math.floor(a / 12) * 3, ang = a * (Math.PI / 6) + 0.3;
      const x = p.x + Math.sin(ang) * r, z = p.z + Math.cos(ang) * r;
      nav.ensure(x, z);
      if (nav.flag(x, z) !== 0 || world.indoors?.(x, z)) continue;
      if (Math.abs(world.heightAt(x, z) - (y ?? ground)) > 9) continue; // the top of a cliff over it
      s = { x, z };
    }
    if (!s) { skipped++; console.log('[probe]', `no open ground near ${it.id}`); continue; }
    placeAt(s.x, s.z, 0);
    await tick(); await tick();
    const reach = Math.max(1.0, (it.radius || 2) * 0.9);
    const there = () => {
      const q = P().position;
      return G.interact.current?.id === it.id || (Math.hypot(q.x - p.x, q.z - p.z) < reach && (y == null || Math.abs(q.y - y) < 1.2));
    };
    let r = await W.walkTo(p.x, p.z, { arrive: Math.min(1.2, reach), until: there, y, timeout: 50 });
    // Stopped on the flight just under it (the walker counts a height within 1.3 m as there): the last steps.
    if (!there() && r.why === 'arrived') r = await W.walkTo(p.x, p.z, { arrive: 0.45, until: there, y, timeout: 25 });
    const q = P().position;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    const good = there() || (d <= (it.radius || 2) && (y == null || Math.abs(q.y - y) < 1.2));
    n++;
    if (!good) bad++;
    ok(`reach ${it.id} (${typeof it.label === 'function' ? it.label() : it.label})`, good, good ? '' : `${r.why} ${d.toFixed(1)} m short at ${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)}; it is at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}${y != null ? ` on the floor at ${y.toFixed(1)}` : ''}; ${(r.notes || []).slice(0, 1).join(' ').slice(0, 260)}`);
  }
  W.release();
  ok(`walked up to ${n - bad} of ${n} things (${skipped} without a place or open ground near)`, true);
}
