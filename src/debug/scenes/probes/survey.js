// Survey: what is in the world at a story stage (&from=<quest>:<stage>, default a new game). Prints every interaction,
// zone, clue, door, room and named person with positions, for planning the other probes. No checks.
export default async function survey(k) {
  const { G, O, S, C, drive, wait, waitFor, itemPos } = k;
  const say = (...a) => console.log('[probe]', ...a);
  if (O.from) { const [q, st] = O.from.split(':'); await drive(G.story.debugStart(q, st)); } else { await drive(G.story.newGame(), 90); }
  await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'settled');
  await wait(1);
  const f = (n) => (Number.isFinite(n) ? +n.toFixed(1) : n);
  say(`day ${G.time.day} hour ${f(G.time.hours)} weather ${G.weather.state} player ${f(k.P().position.x)},${f(k.P().position.z)} stage ${Object.entries(S.data.quests).map(([q, r]) => `${q}:${r.stage ?? (r.done ? 'done' : '?')}`).join(' ')}`);
  say('LOCATIONS', Object.keys(G.world.locations).join(' '));
  for (const it of G.interact.items.values()) {
    let p = null, en = true;
    try { p = itemPos(it); } catch { p = null; }
    if (it.enabled) { try { en = !!it.enabled(); } catch { en = 'throws'; } }
    say(`IT ${it.id} | ${it.verb} ${typeof it.label === 'function' ? it.label() : it.label} | ${p ? `${f(p.x)},${f(p.y)},${f(p.z)}` : 'nopos'} | r=${it.radius} facing=${it.facing} pri=${it.priority} senses=${it.sensesOnly} en=${en}`);
  }
  for (const z of G.story.flow?.zones?.values?.() || G.story.zones?.values?.() || []) say(`ZONE ${z.id} | ${f(z.x)},${f(z.z)} r=${z.r} once=${z.once} en=${z.enabled ? (() => { try { return !!z.enabled(); } catch { return 'throws'; } })() : true}`);
  for (const d of C.V.doors || []) say(`DOOR ${d.id} | ${f(d.rec.x)},${f(d.rec.y)},${f(d.rec.z)} yaw=${f(d.rec.yaw)} w=${d.rec.w} open=${d.rec.open}`);
  for (const r of G.world.rooms || []) say(`ROOM ${r.id} | ${r.box ? `${f(r.box.x)},${f(r.box.z)} hw=${f(r.box.hw)} hd=${f(r.box.hd)} yaw=${f(r.box.yaw)}` : 'poly'} y=${f(r.y0)}..${f(r.y1)}`);
  for (const n of G.npcs?.list || []) if (n.def?.named || n.def?.talk) say(`NPC ${n.id} | ${f(n.character.root.position.x)},${f(n.character.root.position.z)} visible=${n.visible} talk=${!!G.interact.get(`npc_${n.id}`)}`);
  say(`NPC total ${G.npcs?.list?.length}`);
}
