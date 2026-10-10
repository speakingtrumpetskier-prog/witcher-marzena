// What Vesna knows, in whatever order she meets people (called from playthrough.js, step 'knowledge'). Pure logic: each talk is walked
// over the dialogue data with a small stand-in for G.state, from the flags a given order would have set, and the lines and offered answers
// are checked for anything she could not know yet (docs/STORY.md section 1, "What Vesna knows"). The real talks in the run cover the
// order Zbyszek, Bogdan, Hanka; this covers the others (Bogdan first, Hanka first, Jarek before Hanka, the tinker and the miller early).
import zbyszekHub from '../../story/content/dialogues/zbyszek_hub.js';
import bogdanFirst from '../../story/content/dialogues/bogdan_first.js';
import hankaFirst from '../../story/content/dialogues/hanka_first.js';
import jarekBird from '../../story/content/dialogues/jarek_bird.js';
import dobraRite from '../../story/content/dialogues/dobra_rite.js';
import bogdanLater from '../../story/content/dialogues/bogdan_later.js';
import miller from '../../story/content/dialogues/miller.js';
import rsTinker from '../../story/content/dialogues/rs_tinker.js';

// Walk one dialogue: hub answers are taken in order (each once), the way out last; `want` (a regex list) is tried first at every choice.
function walk(def, flags, { day = 1, hours = 17, want = [] } = {}) {
  const on = new Set(flags);
  const S = {
    flag: (k) => (on.has(k) ? true : undefined), set: (k) => on.add(k), inc() {}, give() {}, take: () => true, has: () => true, count: () => 0,
    data: { flags: {}, notes: [], inventory: {}, dlg: {}, fish: { basket: [] } },
  };
  const D = { G: { time: { day, hours }, dice: null, fishing: null, player: null }, actor: () => null };
  const lines = [], offered = [], taken = new Set();
  let id = def.start;
  for (let guard = 0; id && guard < 400; guard++) {
    const n = def.nodes[id];
    if (!n) break;
    if (n.if && !n.if(S, D)) { id = typeof n.else === 'function' ? n.else(S, D) : n.else; continue; }
    n.do?.(S, D);
    const t = typeof n.t === 'function' ? n.t(S, D) : n.t;
    if (t && n.s !== 'narrator') lines.push(`${n.s}: ${t}`);
    if (n.end) break;
    if (n.choices) {
      const av = n.choices.map((c, i) => ({ c, key: `${id}:${i}`, text: typeof c.t === 'function' ? c.t(S) : c.t }))
        .filter(({ c, key }) => !taken.has(key) && (!c.if || c.if(S)));
      if (!av.length) break;
      offered.push(...av.map((a) => a.text));
      const a = want.map((re) => av.find((x) => re.test(x.text))).find(Boolean) || av.find((x) => !x.c.exit) || av[0];
      taken.add(a.key);
      a.c.do?.(S);
      id = typeof a.c.next === 'function' ? a.c.next(S) : a.c.next;
      continue;
    }
    id = typeof n.next === 'function' ? n.next(S, D) : n.next;
  }
  return { lines, offered, flags: on, said: (s) => lines.includes(s), has: (re) => lines.some((l) => re.test(l)), offers: (re) => offered.some((t) => re.test(t)) };
}

export function knowledgeSteps({ ok, step }) {
  step('knowledge');
  const arrived = ['prologue_done', 'song_heard', 'met_ola', 'contract_taken', 'wolves_contract_read'];
  const toPurse = { want: [/^What happens/] };

  // Bogdan before anyone: he tells a stranger what the rite is, she does not ask after a girl nobody has mentioned.
  const b0 = walk(bogdanFirst, arrived, toPurse);
  ok('Bogdan first: no "And the girl?"', !b0.said('vesna: And the girl?') && !b0.said("bogdan: You've been talking to people."), b0.lines.join(' | ').slice(0, 300));
  ok('Bogdan first: she asks about the equinox, not "tomorrow night"', b0.offers(/at the equinox/) && !b0.offers(/tomorrow night/));
  ok('Bogdan first: he says what the rite is', b0.has(/^bogdan: Tomorrow night's the equinox\. We carry a straw woman/) && b0.said('vesna: Who carries her out?'));
  ok('Bogdan first: the contract is hers, not "on the board"', b0.offers(/^This contract\. Who wrote it\?$/) && !b0.offers(/on the board/));
  ok('Bogdan first: she now knows the rite and that a girl is picked', b0.flags.has('knows_rite') && b0.flags.has('heard_of_maiden'));

  // Zbyszek first, then Bogdan: the rite and the girl come from the tavern.
  const z0 = walk(zbyszekHub, arrived);
  ok('Zbyszek first: the toll-house copy, the rite, the girl, the hand', z0.has(/toll house/) && z0.flags.has('knows_rite') && z0.flags.has('heard_of_maiden') && z0.flags.has('knows_fair_hand') && z0.has(/^zbyszek: H\.\? Only Hanka/));
  ok('Zbyszek first: the "girl is Ola" topic waits for Hanka', !z0.offers(/Hanka's youngest/));
  ok('Zbyszek first: nothing about tonight or the men under the ice yet', !z0.offers(/going tonight|under the ice|three years ago/i));
  const b1 = walk(bogdanFirst, [...z0.flags], toPurse);
  ok('Bogdan after Zbyszek: "And the girl?" and the short rite line', b1.said('vesna: And the girl?') && b1.said("bogdan: Tomorrow night we do the rite, and that's the end of it.") && b1.offers(/^What happens tomorrow night\?$/));

  // Hanka before anyone: she does not know the name at the door, nor what Ola is picked for.
  const h0 = walk(hankaFirst, arrived);
  ok('Hanka first: no "Hanka?" at the door, she asks at the shore', !h0.said('vesna: Hanka?') && h0.said('vesna: The paper says to ask at the shore.') && h0.said('hanka: Hanka.'));
  ok('Hanka first: "Picked for what?" and Hanka says what the rite is', h0.said('vesna: Picked for what?') && !h0.said('vesna: For the rite.') && h0.has(/^hanka: For the rite\. Tomorrow night\./));
  ok('Hanka first: hired, knows the rite, the girl, the name of the drowned one', ['hanka_hired', 'knows_rite', 'heard_of_maiden', 'knows_wiesia'].every((f) => h0.flags.has(f)), [...h0.flags].join(','));
  const z1 = walk(zbyszekHub, [...h0.flags]);
  ok('Zbyszek after Hanka: no "Who?", no whose hand it is', !z1.said('vesna: Who?') && !z1.has(/^zbyszek: H\.\?/) && z1.said("zbyszek: You've been down at Hanka's already. Somebody saw you go in."));
  ok('Zbyszek after Hanka: knows_fair_hand stays unset, the Ola topic is open', !z1.flags.has('knows_fair_hand') && z1.offers(/Hanka's youngest/));
  const h1 = walk(hankaFirst, [...z0.flags]);
  ok('Hanka after Zbyszek: "Hanka?" and "For the rite."', h1.said('vesna: Hanka?') && h1.said('vesna: For the rite.') && !h1.said('vesna: Picked for what?'));

  // Jarek before she knows the name; Dobra and Bogdan later without it.
  const j0 = walk(jarekBird, arrived, { hours: 21 });
  ok('Jarek before the name: "Who\'s Wiesia?"', j0.said("vesna: Who's Wiesia?") && !j0.said("vesna: Hanka's girl.") && j0.flags.has('knows_wiesia'));
  const j1 = walk(jarekBird, [...arrived, 'knows_wiesia'], { hours: 21 });
  ok('Jarek after the name: "Hanka\'s girl."', j1.said("vesna: Hanka's girl.") && !j1.said("vesna: Who's Wiesia?"));
  const late = [...z0.flags, 'hanka_hired', 'met_hanka', 'night1', 'effigies_fought', 'echo_seen', 'lair_seen', 'dawn_done'];
  const d0 = walk(dobraRite, late, { day: 2, hours: 8, want: [/^Hanka's older girl/] });
  ok('Dobra without the name: Dobra says it', d0.said("vesna: Hanka's older girl, the one who drowned. Did you know her?") && d0.said('dobra: Wiesia.'));
  const l0 = walk(bogdanLater, late, { day: 2, hours: 9, want: [/^About the rite/, /^I was there/] });
  ok('Bogdan later without the name: "Hanka\'s girl didn\'t just fall in."', l0.has(/^vesna: Hanka's girl didn't just fall in/) && l0.said('vesna: I was at the poles last night. I saw it.'));
  const l1 = walk(bogdanLater, [...late, 'knows_wiesia'], { day: 1, hours: 22.4, want: [/^About the rite/, /^I was there/] });
  ok('Bogdan later the same night: "tonight", "this afternoon"', l1.has(/^vesna: Wiesia didn't just fall in/) && l1.said('vesna: I was at the poles tonight. I saw it.') && l1.said('bogdan: You got here this afternoon.'));

  // Before the village: the tinker on the pass road, the miller before the board.
  const t0 = walk(rsTinker, [], { hours: 15.8, want: [/^Where are you headed/] });
  ok('Tinker before the tavern: she has not been down yet', t0.said("vesna: I haven't been down yet.") && !t0.said('vesna: He is.'));
  const m0 = walk(miller, ['prologue_done', 'song_heard']);
  ok('Miller before the board: "What paper?"', m0.said('vesna: What paper?') && !m0.said('vesna: Wolves.'));
}
