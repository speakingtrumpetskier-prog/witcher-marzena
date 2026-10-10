// Dialogue preview and test scene: the story scene plus a small harness for the story dialogues.
//   ?scene=dialogues&only=story,ui,characters&dspeed=8
//   await __dlg.run('hanka_first', { picker: 'first' })     plays one, resolves { end, picks, lines, error }
//   await __dlg.runAll()                                     every dialogue, three strategies, two states
//   __dlg.ids()                                              the story dialogue ids (no _sample)
// Pickers: 'first' (always the first choice), 'last', 'random' (seeded; prefers an exit after 14 picks),
// an array of indexes, or a function (node, items) => index. `flags` sets story flags before the run
// (the dialogue's own `once` memory is cleared first). Results print through console.error so the
// shot harness shows them.
import { init as storyInit, modules, needsWorld } from './story.js';

export { modules, needsWorld };

const LATE = {
  met_zbyszek: true, knows_fair_hand: true, met_bogdan: true, took_reeve_money: true, hanka_hired: true, met_hanka: true,
  echo_seen: true, lair_seen: true, ledger_found: true, miller_warm_water: true, contract_taken: true,
  met_dobra: true, heard_of_maiden: true, jarek_met: true,
};

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function init(G) {
  await storyInit(G);
  const lines = [];
  G.events.on?.('dialogue:line', (l) => lines.push(l));

  const makePicker = (picker, seed = 1) => {
    if (Array.isArray(picker) || typeof picker === 'function') return picker;
    let n = 0;
    const R = seeded(seed);
    return (node, items) => {
      n++;
      if (picker === 'first') return n > 40 ? items.findIndex((i) => i.exit) : 0;
      if (picker === 'last') return n > 40 ? items.findIndex((i) => i.exit) : items.length - 1;
      const exit = items.findIndex((i) => i.exit);
      if (n > 14 && exit >= 0) return exit;
      return Math.floor(R() * items.length);
    };
  };

  const api = {
    ids: () => G.dialogue.ids().filter((i) => !i.startsWith('_')),
    async run(id, { picker = 'first', flags = {}, seed = 1, day = null, hour = null } = {}) {
      const S = G.state;
      S.data.flags = { ...flags };
      S.data.dlg = {};
      S.data.inventory = { coins: 150, thaw: 0 };
      S.data.notes = flags.echo_seen ? ['note_cart_family'] : [];
      if (day != null && G.time) G.time.day = day;
      if (hour != null && G.time?.setHours) G.time.setHours(hour);
      lines.length = 0;
      const before = G.errors.length;
      G.dialogue.autopick = makePicker(picker, seed);
      let res, error = null;
      try { res = await G.dialogue.start(id); } catch (e) { error = e; }
      G.dialogue.autopick = null;
      if (res?.error) error = res.error;
      return {
        id, picker, end: res?.end ?? null, picks: res?.picks?.length ?? 0, lines: lines.length,
        error: error ? String(error.message || error) : null, errors: G.errors.slice(before),
        text: lines.map((l) => `${l.s}: ${l.t}`),
      };
    },
    // opts: { ids, quick (two runs per dialogue instead of six), verbose (print the lines) }
    async runAll({ ids = null, quick = false, verbose = false } = {}) {
      const out = [];
      for (const id of ids || api.ids()) {
        const pickers = quick ? [['first', 'first'], ['rand', 'random']] : [['first', 'first'], ['last', 'last'], ['rand', 'random']];
        const states = quick ? [['fresh', {}, 1], ['late', LATE, 2]] : [['fresh', {}, 1], ['late', LATE, 2]];
        for (const [pi, [pn, picker]] of pickers.entries()) {
          for (const [si, [sn, flags, day]] of states.entries()) {
            if (quick && pi !== si) continue;
            const r = await api.run(id, { picker, flags, seed: 7, day });
            const bad = r.error || r.errors.length || r.lines === 0 || !r.end;
            out.push(r);
            console.error(`${bad ? 'FAIL' : 'ok  '} ${id} [${pn}/${sn}] lines=${r.lines} picks=${r.picks} end=${r.end}${r.error ? ` ERROR ${r.error}` : ''}${r.errors.length ? ` ERRORS ${r.errors.join('; ')}` : ''}`);
            if (verbose && !bad) console.error(r.text.join('\n'));
          }
        }
      }
      return out;
    },
    // Targeted paths that random picking rarely reaches. Results go to window.__MZ_ERRORS, which the
    // shot harness prints in full (console output is capped at 25 lines).
    async targeted({ only = null } = {}) {
      const text = (re) => (node, items) => { const i = items.findIndex((x) => re.test(x.text)); return i >= 0 ? i : items.findIndex((x) => x.exit) >= 0 ? items.findIndex((x) => x.exit) : 0; };
      const exitNow = (node, items) => { const i = items.findIndex((x) => x.exit); return i >= 0 ? i : 0; };
      // answers that match the given patterns one after the other, then the way out
      const inOrder = (...res) => { let n = 0; return (node, items) => { const re = res[n++]; const i = re ? items.findIndex((x) => re.test(x.text)) : -1; return i >= 0 ? i : exitNow(node, items); }; };
      const timeout = () => -1;
      const cases = [
        ['hanka_confront timeout', 'hanka_confront', { picker: timeout, flags: { echo_seen: true } }, (r, S) => S.flag('hanka_blamed') && S.flag('hanka_confronted')],
        ['hanka_confront comfort', 'hanka_confront', { picker: 'first', flags: { echo_seen: true } }, (r, S) => S.flag('hanka_comforted') && !S.flag('hanka_blamed')],
        ['hanka_confront blame', 'hanka_confront', { picker: 'last', flags: { echo_seen: true } }, (r, S) => S.flag('hanka_blamed') && !S.flag('hanka_comforted')],
        ['bogdan_later ledger', 'bogdan_later', { picker: text(/cellar|rite three/), flags: { met_bogdan: true, echo_seen: true, ledger_found: true, miller_warm_water: true } }, (r, S) => S.flag('reeve_told')],
        ['bogdan_later no ledger', 'bogdan_later', { picker: text(/rite three|I was there/), flags: { met_bogdan: true, echo_seen: true } }, (r, S) => !S.flag('reeve_told') && S.flag('bogdan_threw_out')],
        ['bogdan_first take', 'bogdan_first', { picker: text(/All right\./), flags: {} }, (r, S) => S.flag('took_reeve_money') && S.flag('met_bogdan') && S.count('coins') === 250],
        ['bogdan_first refuse', 'bogdan_first', { picker: text(/Keep it/), flags: {} }, (r, S) => S.flag('refused_reeve_money') && !S.flag('took_reeve_money')],
        ['dobra_rite leave early', 'dobra_rite', { picker: exitNow, flags: {} }, (r, S) => S.flag('dobra_knot_noticed') && S.flag('met_dobra')],
        ['dobra_rite knot + tower', 'dobra_rite', { picker: text(/red thread|drowned tower/), flags: { lair_seen: true } }, (r, S) => S.flag('dobra_knot_noticed')],
        ['jarek_bird warm water', 'jarek_bird', { picker: text(/Warm water|take it/), flags: { miller_warm_water: true } }, (r, S) => S.flag('bird_taken') && S.count('bird') === 1],
        ['miller after', 'miller', { picker: 'first', flags: { wolves_mill_done: true } }, (r, S) => S.flag('miller_warm_water') && S.count('coins') === 190],
        ['hanka_first payment', 'hanka_first', { picker: 'first', flags: {} }, (r, S) => S.flag('hanka_hired') && S.count('coins') === 211 && S.count('ring') === 1],
        ['zbyszek echo', 'zbyszek_hub', { picker: text(/Three years ago|under the ice/), flags: { met_zbyszek: true, echo_seen: true, lair_seen: true, hanka_hired: true }, day: 2 }, (r, S) => S.flag('zbyszek_echo_greeted')],
        ['zbyszek shop', 'zbyszek_hub', { picker: text(/Thaw draught|soup/), flags: { met_zbyszek: true } }, (r, S) => S.count('thaw') >= 0],
        ['zbyszek bed', 'zbyszek_hub', { picker: text(/bed/), flags: { met_zbyszek: true } }, (r) => r.end === 'rest_dusk'],
        ['ola snow truth', 'ola_snowfight_after', { picker: text(/For a bit/), flags: {} }, (r, S) => S.flag('ola_truth') && !S.flag('ola_lie')],
        ['ola snow lie', 'ola_snowfight_after', { picker: text(/won't happen/), flags: {} }, (r, S) => S.flag('ola_lie') && !S.flag('ola_truth')],
        // the herders (planetnicy) as ordinary weather
        ['herders: ola counts the herders', 'ola_day1', { picker: text(/counting/), flags: {} }, (r, S) => S.flag('herders_counted') && r.text.some((l) => /past twenty/.test(l))],
        ['herders: bogdan on the weather', 'bogdan_first', { picker: text(/weather/), flags: {} }, (r) => r.text.some((l) => /old women/.test(l))],
        ['herders: bogdan day 2 reads the lake', 'bogdan_day2', { picker: 'first', flags: { met_bogdan: true }, day: 2 }, (r) => r.text.some((l) => /herder up/.test(l))],
        ['herders: zbyszek reads the lights, low', 'zbyszek_hub', { picker: text(/lights over the lake|^Low\./), flags: { met_zbyszek: true, planetnicy_seen: true } }, (r) => r.text.some((l) => /Then it's clear/.test(l)) && r.text.some((l) => /point at them/.test(l))],
        ['herders: zbyszek reads the lights, high', 'zbyszek_hub', { picker: text(/lights over the lake|^High\./), flags: { met_zbyszek: true, planetnicy_seen: true } }, (r) => r.text.some((l) => /snow before noon/.test(l))],
        ['herders: zbyszek after dark on day 1', 'zbyszek_hub', { picker: exitNow, flags: { met_zbyszek: true }, day: 1, hour: 21 }, (r) => r.text.some((l) => /count them|will freeze/.test(l))],
        ['herders: dobra on Matka', 'dobra_rite', { picker: text(/very big/), flags: { matka_seen: true } }, (r) => r.text.some((l) => /never once looked down/.test(l))],
        ['herders: miller on the wheel', 'miller', { picker: text(/lights are sitting/), flags: { planetnicy_seen: true } }, (r) => r.text.some((l) => /Two winters/.test(l))],
        ['herders: miller_wife asks for the bell', 'miller_wife', { picker: text(/company|What bell|look for it/), flags: { wolves_mill_done: true, planetnicy_seen: true } }, (r, S) => S.flag('handbell_asked') && S.flag('herders_over_yard') && !S.flag('handbell_paid')],
        ['herders: miller_wife declines, nothing set', 'miller_wife', { picker: inOrder(/Is there anything/, /Not today/), flags: { wolves_mill_done: true } }, (r, S) => !S.flag('handbell_asked') && r.text.some((l) => /out there two years/.test(l))],
        ['herders: miller_wife pays once', 'miller_wife', { picker: 'first', flags: { wolves_mill_done: true, handbell_asked: true, handbell_rung: true } }, (r, S) => S.flag('handbell_paid') && S.count('coins') === 170],
        // fishing: the reeve, the rod and the old pike (selling needs G.fishing and a basket: the playthrough covers it)
        ['fishing: the reeve lends the rod', 'bogdan_fish', { picker: inOrder(/need a rod/), flags: { met_bogdan: true, fish_wants_rod: true } }, (r, S) => S.count('rod') === 1 && S.flag('rod_lent') && r.text.some((l) => /beam over the hearth/.test(l))],
        ['fishing: what bites, and the pike under the tower', 'bogdan_fish', { picker: inOrder(/What bites/), flags: { met_bogdan: true, fished: true } }, (r, S) => S.flag('oldone_heard') && r.text.some((l) => /pike under it/.test(l))],
        ['fishing: she takes the old pike on', 'bogdan_fish', { picker: inOrder(/About the pike/, /All right/), flags: { met_bogdan: true, fished: true, oldone_heard: true } }, (r, S) => S.flag('oldone_asked') && S.count('strong_line') === 1],
        ['fishing: she puts the old pike off', 'bogdan_fish', { picker: inOrder(/About the pike/, /Not now/), flags: { met_bogdan: true, fished: true, oldone_heard: true } }, (r, S) => !S.flag('oldone_asked') && S.count('strong_line') === 0],
        ['fishing: the reeve pays for the old pike', 'bogdan_fish', { picker: 'first', flags: { met_bogdan: true, oldone_asked: true, oldone_landed: true } }, (r, S) => S.flag('oldone_paid') && r.text.some((l) => /That's Stach's/.test(l))],
      ];
      const results = [];
      window.__MZ_ERRORS = window.__MZ_ERRORS || [];
      for (const [name, id, opts, check] of cases) {
        if (only && !name.includes(only)) continue;
        const r = await api.run(id, opts);
        let ok = false;
        try { ok = !r.error && !r.errors.length && r.lines > 0 && !!r.end && !!check(r, G.state); } catch (e) { r.error = String(e); }
        results.push({ name, ok, end: r.end, lines: r.lines });
        window.__MZ_ERRORS.push(`${ok ? 'ok  ' : 'FAIL'} ${name} lines=${r.lines} picks=${r.picks} end=${r.end}${r.error ? ` ERROR ${r.error}` : ''}${r.errors.length ? ` ${r.errors.join('; ')}` : ''}`);
      }
      return results;
    },
  };
  window.__dlg = api;
}
