// Ad hoc questions: runs JavaScript on the autopilot's kit after &from=<quest>:<stage> (or a new game without it).
// `k` is the kit, `say(...)` prints a line. The code comes from a file:
//   node scripts/probe.mjs eval --q "from=main_ice:ask" --js node_modules/.mz-tmp/q.js
export default async function evalProbe(k) {
  const { G, O, Q, drive, wait, waitFor } = k;
  const say = (...a) => console.log('[probe]', ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
  if (O.from) { const [q, st] = O.from.split(':'); await drive(G.story.debugStart(q, st)); } else if (!Q.has('nostart')) { await drive(G.story.newGame(), 90); }
  await waitFor(() => !G.cutscenes.active && !G.story.busy, 90, 'settled');
  await wait(0.5);
  G.time.scale = 0;
  const js = window.__probeJs || Q.get('js') || '';
  await new Function('k', 'say', `return (async () => { ${js} })()`)(k, say);
}
