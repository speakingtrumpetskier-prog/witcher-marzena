// Reach: can the player walk up to every person who talks, at every place their day takes them, and get the
// talk prompt? For each schedule entry that is not hidden (and not in the night, when doors are barred) the clock
// is set to the middle of it, she starts in the square (or the mill yard for the mill family) and walks to the
// person with the real controls until "[E] Talk" comes up. A person who cannot be reached, or whose prompt loses
// to another, fails. Stage: main_ice:ask (day 1, everyone at home, nothing barred by day).
import { makeWalker } from './_walker.js';

export default async function reach(k) {
  const { G, Q, P, ok, step, tick, wait, waitFor, drive, placeAt } = k;
  const say = (...a) => console.log('[probe]', ...a);
  await drive(G.story.debugStart('main_ice', 'ask'));
  await wait(1);
  G.time.scale = 0;
  const W = makeWalker({ G, tick });
  const only = Q.get('npc');
  const f1 = (n) => n.toFixed(1);
  for (const npc of G.npcs.list) {
    const iid = `npc_${npc.id}`;
    if (!G.interact.get(iid) || (only && npc.id !== only)) continue;
    step(`reach ${npc.id}`);
    for (const e of npc.def.schedule || []) {
      if (e.hidden) continue;
      const span = ((e.to - e.from + 24) % 24) || 24;
      const mid = (e.from + span / 2) % 24;
      if (mid >= 20 || mid < 6.2) continue;
      G.time.setHours(mid);
      const c = npc.character.root.position;
      const far = Math.hypot(c.x, c.z - 115) > 220;
      placeAt(far ? 362 : 2, far ? -51 : 122, 0);
      await wait(1.2);
      // let them get to their place for this hour (they walk; a resync puts them there)
      G.npcs.resync?.();
      await wait(1.0);
      placeAt(c.x + (far ? 0 : 0), c.z + 30, Math.PI);
      await waitFor(() => npc.visible, 6);
      placeAt(far ? 362 : 2, far ? -51 : 122, 0);
      await wait(0.4);
      const where = typeof e.at === 'string' ? e.at : 'inline station';
      const it = G.interact.get(iid);
      let on = true;
      if (it.enabled) { try { on = !!it.enabled(); } catch { on = false; } }
      const r = await W.walkTo(c.x, c.z, { arrive: 1.3, target: () => ({ x: c.x, z: c.z }), until: () => G.interact.current?.id === iid });
      P().yaw = Math.atan2(c.x - P().position.x, c.z - P().position.z);
      await tick(); await tick();
      const cur = G.interact.current;
      const d = Math.hypot(P().position.x - c.x, P().position.z - c.z);
      const label = `${npc.id} at ${where} (${String(Math.floor(mid)).padStart(2, '0')}:${String(Math.round((mid % 1) * 60)).padStart(2, '0')})`;
      if (!on) { say(`${label}: talk is off at this hour`); continue; }
      ok(`${label}: she can walk up and talk`, cur?.id === iid,
        `${r.why}; ${f1(d)} m from them at ${f1(P().position.x)},${f1(P().position.z)} (they are at ${f1(c.x)},${f1(c.z)}, visible=${npc.visible}); prompt: ${cur ? `${cur.verb} ${typeof cur.label === 'function' ? cur.label() : cur.label} (${cur.id})` : 'none'}${r.planned ? '' : '; no route found'}${r.notes.length ? ` | ${r.notes.join(' | ').slice(0, 300)}` : ''}`);
    }
  }
  W.release();
}
