#!/usr/bin/env node
// Voice line extraction and coverage report.
//
//   node scripts/voice/extract.mjs               write scripts/voice/lines.json, print counts per speaker
//   node scripts/voice/extract.mjs --report      also list every line with no audio in public/voice/manifest.json
//   options: --brief (report: counts only)  --no-write  --strict (exit 2 on unresolved say/sub calls)
//            --include-samples (also read _sample dialogues and cutscenes)  --out path  --quiet
//            --public dir (report against another public/ folder)  --fail-on-missing (report: exit 1 if any line has no audio)
//
// Sources (all read from the repo, nothing is run in a browser):
//   dialogues   src/story/content/dialogues/*.js are imported and every node with a text is walked.
//               Narrator lines (stage directions) are not voiced. A picked choice is NOT spoken by the
//               runner (the writers repeat the line as the next Vesna node), so choices are not voiced.
//               A node whose `t` is a function is evaluated against a mock state over every flag
//               value the function mentions, several times, so `pick(...)` randomness and
//               flag-dependent variants are all found.
//   cutscenes   src/story/content/cutscenes/*.js are parsed (acorn, never run): d.say(speaker, text)
//               and d.sub(text, dur, { voice: 'id' }) with literal arguments, resolving speakers
//               through `const x = d.actor('id') | d.player() | d.horse()` and text through simple
//               string constants, concatenation and helpers like `const say = (w, t) => d.say(w, t)`.
//               Anything else is listed as UNRESOLVED. A script can also list lines by hand with
//               `export const voiceLines = [['hanka', 'Text.'], ...]`.
//   barks       the string arrays in src/gameplay/npcs/barks.js (voiced by the villager voices named
//               in cast.json "barkPools"), `barks: [...]` arrays in other npcs files, and the Vesna
//               exploration barks in docs/STORY.md section 5.
//
// The hash of a line is lineHash(speaker, text) from src/audio/voiceKey.js, the same function the
// game uses to find the clip.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lineHash, normalizeText, canonSpeaker } from '../../src/audio/voiceKey.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const optVal = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REPORT = flag('--report');
const BRIEF = flag('--brief');
const STRICT = flag('--strict');
const SAMPLES = flag('--include-samples');
const WRITE = !flag('--no-write');
const QUIET = flag('--quiet');
const OUT = path.resolve(ROOT, optVal('--out', 'scripts/voice/lines.json'));
const PUBLIC = path.resolve(ROOT, optVal('--public', 'public'));

let acorn = null;
try { acorn = await import('acorn'); } catch {
  try { acorn = await import('espree'); } catch { /* handled below */ }
}

const cast = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/voice/cast.json'), 'utf8'));
const SPEAKERS = Object.keys(cast.speakers);
const NAME_TO_ID = new Map();
for (const [id, c] of Object.entries(cast.speakers)) {
  NAME_TO_ID.set(id, id);
  NAME_TO_ID.set(String(c.name || '').toLowerCase(), id);
}

const raw = [];        // { speaker, text, kind, source, node, hint }
const warnings = [];
const unresolved = [];
const stats = { narrationSkipped: 0, cutsceneFiles: 0, dialogueFiles: 0, narrationSubs: 0 };

const push = (e) => {
  const text = normalizeText(e.text);
  if (!text || !/[A-Za-z0-9]/.test(text)) return;
  const speaker = canonSpeaker(e.speaker);
  if (!speaker || speaker === 'narrator') { stats.narrationSkipped++; return; }
  raw.push({ ...e, speaker, text });
};

// ------------------------------------------------------------------------------------------------
// Dialogues

// Evaluate a text function over the flag values it mentions. Returns every distinct string.
function textsOf(fn) {
  const found = new Set();
  let literals = [];
  try {
    const ast = acorn.parse(`(${fn.toString()})`, { ecmaVersion: 'latest' });
    walk(ast, (n) => { if (n.type === 'Literal' && typeof n.value === 'string' && n.value.length < 40) literals.push(n.value); });
  } catch { /* closures such as pick(...) have no useful source */ }
  literals = [...new Set(literals)].slice(0, 8);
  const values = [undefined, true, ...literals];

  const deep = (name) => new Proxy(function mock() {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => name : k === 'then' ? undefined : deep(name)),
    apply: () => deep(name),
  });
  const run = (assign, dval, rolls) => {
    const seen = [];
    const S = {
      flag: (k) => { if (!assign.has(k) && !seen.includes(k)) seen.push(k); return assign.get(k); },
      set() {}, inc() {}, give() {}, take() { return true; }, has() { return false; }, count() { return 0; },
      data: { flags: {}, notes: [], inventory: {}, dlg: {} },
    };
    const D = deep(dval);
    const realRandom = Math.random;
    let i = 0;
    try {
      for (let r = 0; r < rolls; r++) {
        Math.random = () => ((i++ % 12) + 0.5) / 12;
        try {
          const out = fn(S, D);
          if (typeof out === 'string' && out.trim()) found.add(out);
        } catch { /* a branch that needs more of the world than the mock has */ }
      }
    } finally { Math.random = realRandom; }
    return seen;
  };

  let runs = 0;
  const visited = new Set();
  const explore = (assign) => {
    const sig = JSON.stringify([...assign].sort());
    if (visited.has(sig) || runs++ > 300) return;
    visited.add(sig);
    for (const dval of [1, 2]) {
      for (const k of run(assign, dval, 12)) {
        for (const v of values) if (v !== undefined) explore(new Map(assign).set(k, v));
      }
    }
  };
  explore(new Map());
  return [...found];
}

async function fromDialogues() {
  const dir = path.join(ROOT, 'src/story/content/dialogues');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.js')) continue;
    if (f.startsWith('_') && !SAMPLES) continue;
    let def;
    try {
      def = (await import(pathToFileURL(path.join(dir, f)).href)).default;
    } catch (e) {
      warnings.push(`dialogue ${f}: cannot import (${e.message})`);
      continue;
    }
    if (!def?.nodes) { warnings.push(`dialogue ${f}: no default export with nodes`); continue; }
    stats.dialogueFiles++;
    const id = def.id || f.replace(/\.js$/, '');

    // Nodes that follow a decisive choice (for the direction of the lines after it).
    const afterDecisive = new Set();
    for (const n of Object.values(def.nodes)) {
      if (!n.decisive || !n.choices) continue;
      for (const c of n.choices) {
        let nid = typeof c.next === 'string' ? c.next : null;
        for (let k = 0; nid && k < 3; k++) {
          afterDecisive.add(nid);
          const nx = def.nodes[nid]?.next;
          nid = typeof nx === 'string' ? nx : null;
        }
      }
    }
    for (const [nid, n] of Object.entries(def.nodes)) {
      if (n.t === undefined || n.t === null) continue;
      if (!n.s || n.s === 'narrator') { stats.narrationSkipped++; continue; }
      const texts = typeof n.t === 'function' ? textsOf(n.t) : [n.t];
      if (typeof n.t === 'function' && !texts.length) warnings.push(`dialogue ${id}:${nid}: text function produced nothing`);
      for (const text of texts) {
        push({
          speaker: n.s, text, kind: 'dialogue', source: `src/story/content/dialogues/${f}`, node: nid,
          hint: { dialogue: id, wait: n.wait || 0, decisive: !!n.decisive, afterDecisive: afterDecisive.has(nid), end: !!n.end, anim: n.a, dynamic: typeof n.t === 'function' },
        });
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// AST helpers (acorn is a dependency of eslint, so it is in node_modules whenever the repo is installed)

function parse(src) {
  if (!acorn) throw new Error('acorn is not installed (run npm install)');
  return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}

function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  if (fn(node, parent) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) { if (c && typeof c.type === 'string') walk(c, fn, node); }
    else if (v && typeof v.type === 'string') walk(v, fn, node);
  }
}

// String value of an expression if it is made of literals and known constants.
function strOf(n, consts) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') {
    let out = '';
    for (let i = 0; i < n.quasis.length; i++) {
      out += n.quasis[i].value.cooked;
      if (i < n.expressions.length) {
        const s = strOf(n.expressions[i], consts);
        if (s == null) return null;
        out += s;
      }
    }
    return out;
  }
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const a = strOf(n.left, consts), b = strOf(n.right, consts);
    return a != null && b != null ? a + b : null;
  }
  if (n.type === 'Identifier' && consts.has(n.name)) return consts.get(n.name);
  return null;
}

// ------------------------------------------------------------------------------------------------
// Cutscenes

const DIRECTOR_CALLS = new Set(['say', 'sub']);

function extractCutscene(file, src) {
  const ast = parse(src);
  const relFile = rel(file);
  const consts = new Map();
  const actorVars = new Map();
  const helpers = new Map(); // name -> { kind, si, ti }
  let dName = 'd';
  const directorIds = new Set(['d']);

  walk(ast, (n) => {
    if (n.type === 'ExportDefaultDeclaration') {
      const f = n.declaration;
      if (f?.params?.[0]?.type === 'Identifier') { dName = f.params[0].name; directorIds.add(dName); }
    }
  });

  const isDirectorCall = (c, names) => c?.type === 'CallExpression' && c.callee.type === 'MemberExpression'
    && !c.callee.computed && c.callee.object.type === 'Identifier' && directorIds.has(c.callee.object.name)
    && names.has(c.callee.property.name);
  const unwrap = (e) => (e?.type === 'AwaitExpression' ? e.argument : e);
  const speakerFromCall = (c) => {
    c = unwrap(c);
    if (!c || c.type !== 'CallExpression' || c.callee.type !== 'MemberExpression' || c.callee.object.type !== 'Identifier' || !directorIds.has(c.callee.object.name)) return null;
    const m = c.callee.property.name;
    if (m === 'player') return 'vesna';
    if (m === 'horse') return 'kasza';
    if (m === 'actor') return strOf(c.arguments[0], consts);
    return null;
  };

  // Pass 1: constants, actor variables, helpers.
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      const s = strOf(n.init, consts);
      if (s != null) consts.set(n.id.name, s);
      const sp = speakerFromCall(n.init);
      if (sp) actorVars.set(n.id.name, sp);
      const f = n.init;
      if ((f.type === 'ArrowFunctionExpression' || f.type === 'FunctionExpression') && f.params.every((p) => p.type === 'Identifier')) {
        let body = f.body;
        if (body.type === 'BlockStatement' && body.body.length === 1) {
          const st = body.body[0];
          body = st.type === 'ReturnStatement' ? st.argument : st.type === 'ExpressionStatement' ? st.expression : null;
        }
        body = unwrap(body);
        if (body && isDirectorCall(body, DIRECTOR_CALLS)) {
          const names = f.params.map((p) => p.name);
          const kind = body.callee.property.name;
          const idx = (a) => (a?.type === 'Identifier' ? names.indexOf(a.name) : -1);
          const si = kind === 'say' ? idx(body.arguments[0]) : -1;
          const ti = idx(body.arguments[kind === 'say' ? 1 : 0]);
          if (ti >= 0 && (kind === 'sub' || si >= 0)) helpers.set(n.id.name, { kind, si, ti, node: body });
        }
      }
    } else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') {
      const sp = speakerFromCall(n.right);
      if (sp) actorVars.set(n.left.name, sp);
    }
  });
  const helperBodies = new Set([...helpers.values()].map((h) => h.node));

  const speakerOf = (a) => {
    if (!a) return null;
    const s = strOf(a, consts);
    if (s != null) return s;
    if (a.type === 'Identifier' && actorVars.has(a.name)) return actorVars.get(a.name);
    return speakerFromCall(a);
  };
  const optsSpeaker = (o) => {
    if (!o || o.type !== 'ObjectExpression') return null;
    let voice = null, name = null;
    for (const p of o.properties) {
      if (p.type !== 'Property' || p.key.type !== 'Identifier') continue;
      const v = strOf(p.value, consts);
      if (['voice', 'speaker'].includes(p.key.name) && v) voice = v;
      if (p.key.name === 'name' && v) name = v;
    }
    if (voice) return voice;
    if (name) return NAME_TO_ID.get(name.toLowerCase()) || null;
    return null;
  };
  const snippet = (n) => src.slice(n.start, Math.min(n.end, n.start + 100)).replace(/\s+/g, ' ');
  const hintFor = () => ({ cutscene: path.basename(file, '.js') });

  // Pass 2: calls.
  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const at = n.loc.start.line;
    const emit = (speaker, text) => push({ speaker, text, kind: 'cutscene', source: relFile, node: `line ${at}`, hint: hintFor() });
    if (isDirectorCall(n, DIRECTOR_CALLS)) {
      if (helperBodies.has(n)) return;
      const kind = n.callee.property.name;
      if (kind === 'say') {
        const sp = speakerOf(n.arguments[0]);
        const tx = strOf(n.arguments[1], consts);
        if (sp && tx != null) emit(sp, tx);
        else unresolved.push({ file: relFile, line: at, call: snippet(n) });
      } else {
        const tx = strOf(n.arguments[0], consts);
        const sp = optsSpeaker(n.arguments[2]);
        if (tx == null) unresolved.push({ file: relFile, line: at, call: snippet(n), note: 'sub with a computed text (narration unless it names a speaker)' });
        else if (sp) emit(sp, tx);
        else stats.narrationSubs++;
      }
    } else if (n.callee.type === 'Identifier' && helpers.has(n.callee.name)) {
      const h = helpers.get(n.callee.name);
      const tx = strOf(n.arguments[h.ti], consts);
      const sp = h.kind === 'say' ? speakerOf(n.arguments[h.si]) : optsSpeaker(n.arguments[h.ti + 2]);
      if (tx == null) unresolved.push({ file: relFile, line: at, call: snippet(n) });
      else if (sp) emit(sp, tx);
      else if (h.kind === 'say') unresolved.push({ file: relFile, line: at, call: snippet(n) });
      else stats.narrationSubs++;
    }
  });

  // Hand-listed lines.
  walk(ast, (n) => {
    if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'VariableDeclaration') return;
    for (const d of n.declaration.declarations) {
      if (d.id.name !== 'voiceLines' || d.init?.type !== 'ArrayExpression') continue;
      for (const el of d.init.elements) {
        let sp = null, tx = null;
        if (el?.type === 'ArrayExpression') { sp = strOf(el.elements[0], consts); tx = strOf(el.elements[1], consts); }
        else if (el?.type === 'ObjectExpression') {
          for (const p of el.properties) {
            const k = p.key?.name;
            if (k === 's' || k === 'speaker') sp = strOf(p.value, consts);
            if (k === 't' || k === 'text') tx = strOf(p.value, consts);
          }
        }
        if (sp && tx != null) push({ speaker: sp, text: tx, kind: 'cutscene', source: relFile, node: `voiceLines line ${el.loc.start.line}`, hint: hintFor() });
        else unresolved.push({ file: relFile, line: el?.loc?.start.line ?? 0, call: 'voiceLines entry' });
      }
    }
  });
}

function fromCutscenes() {
  const dir = path.join(ROOT, 'src/story/content/cutscenes');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.js')) continue;
    if (f.startsWith('_') && !SAMPLES) continue;
    stats.cutsceneFiles++;
    try { extractCutscene(path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {
      warnings.push(`cutscene ${f}: cannot parse (${e.message})`);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Barks

function stringsIn(n, consts = new Map()) {
  const out = [];
  if (!n) return out;
  if (n.type === 'ArrayExpression') for (const e of n.elements) out.push(...stringsIn(e, consts));
  else { const s = strOf(n, consts); if (s != null) out.push(s); }
  return out;
}

function fromBarks() {
  const barks = path.join(ROOT, 'src/gameplay/npcs/barks.js');
  const pools = new Map(); // pool name -> [texts]
  if (fs.existsSync(barks)) {
    const ast = parse(fs.readFileSync(barks, 'utf8'));
    for (const st of ast.body) {
      if (st.type !== 'VariableDeclaration') continue;
      for (const d of st.declarations) {
        if (d.id.type !== 'Identifier' || d.init?.type !== 'ArrayExpression' || !/^[A-Z][A-Z0-9_]*$/.test(d.id.name)) continue;
        const texts = stringsIn(d.init);
        if (texts.length) pools.set(d.id.name, texts);
      }
    }
    for (const [name, texts] of pools) {
      let speakers = cast.barkPools[name];
      if (!speakers) {
        warnings.push(`barks.js pool ${name}: not in cast.json barkPools, using barkDefault`);
        speakers = cast.barkDefault;
      }
      for (const text of texts) {
        for (const speaker of speakers) push({ speaker, text, kind: 'bark', source: 'src/gameplay/npcs/barks.js', node: name, hint: { pool: name } });
      }
    }
  } else warnings.push('src/gameplay/npcs/barks.js not found');

  // barks: [...] in NPC definitions elsewhere.
  const dir = path.join(ROOT, 'src/gameplay/npcs');
  const files = [];
  const collect = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) collect(p); else if (e.name.endsWith('.js')) files.push(p); } };
  if (fs.existsSync(dir)) collect(dir);
  for (const f of files) {
    if (path.resolve(f) === path.resolve(barks)) continue;
    let ast;
    try { ast = parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    walk(ast, (n) => {
      if (n.type !== 'ObjectExpression') return;
      const prop = (k) => n.properties.find((p) => p.type === 'Property' && p.key.name === k);
      const b = prop('barks');
      if (!b || b.value.type !== 'ArrayExpression') return;
      const id = strOf(prop('id')?.value, new Map());
      const speakers = id && cast.speakers[id] ? [id] : cast.barkDefault;
      for (const text of stringsIn(b.value)) for (const speaker of speakers) push({ speaker, text, kind: 'bark', source: rel(f), node: `barks of ${id || 'npc'}`, hint: { pool: 'def' } });
    });
  }
}

function fromStoryDoc() {
  const p = path.join(ROOT, 'docs/STORY.md');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/^Vesna \(exploration[^\n]*$/m);
  if (!m) return;
  for (const q of m[0].matchAll(/"([^"]+)"/g)) {
    push({ speaker: 'vesna', text: q[1], kind: 'bark', source: 'docs/STORY.md', node: 'section 5 (Vesna barks)', hint: { pool: 'vesna' } });
  }
}

// ------------------------------------------------------------------------------------------------
// Directions. Restrained by default; a few scene rules; punctuation nudges. Numbers feed Chatterbox
// (exaggeration, cfg), Kokoro (speed multiplier `pace`) and the loudness target (`level`, dB relative to
// the -18 LUFS standard, so quiet lines stay quiet instead of being normalized up).

const RULES = [
  { d: /^hanka_confront$/, s: 'hanka', n: /^k1$/, dir: 'barely a breath, after a long silence', x: 0.2, p: 0.85, l: -6 },
  { d: /^hanka_confront$/, s: 'hanka', n: /^(c1[0-4]|b1|tmo2|fin)$/, dir: 'quiet, unsteady, stops and restarts, no tears', x: 0.22, p: 0.9, l: -4 },
  { d: /^hanka_confront$/, s: 'vesna', dir: 'low, level, gentle; does not press', x: 0.25, p: 0.95, l: -2 },
  { d: /^hanka_/, s: 'hanka', dir: 'flat, tired, eyes on her work', x: 0.27, p: 0.93, l: -1 },
  { d: /^jarek_/, s: 'jarek', n: /^(j10|j11|y2|w4|w5|ask|no2|no3|u2|a\d+)$/, dir: 'low, thick, grief held down; thins out at the end', x: 0.28, p: 0.88, l: -3 },
  { d: /^jarek_/, s: 'jarek', dir: 'low, tired, a little slurred', x: 0.3, p: 0.92, l: -1 },
  { d: /^ola_snowfight/, s: 'ola', n: /^(s7|s8|w2|w3)$/, dir: 'child, quiet, a real question, looking straight at her', x: 0.3, p: 0.97, l: -3 },
  { d: /^ola_/, s: 'ola', dir: 'child, matter of fact, quick, a little loud', x: 0.4, p: 1.04 },
  { d: /^dobra_/, s: 'dobra', dir: 'dry, brisk, hands busy, does not look up', x: 0.33, p: 1.0 },
  { d: /^bogdan_/, s: 'bogdan', dir: 'weary authority, controlled; sharp means quieter', x: 0.3, p: 0.95 },
  { d: /^miller_wife/, s: 'miller_wife', dir: 'short and worried, then easier', x: 0.34, p: 1.0 },
  { d: /^miller/, s: 'miller', dir: 'plain, anxious, honest', x: 0.33, p: 0.97 },
  { d: /^zbyszek_/, s: 'zbyszek', dir: 'brisk, put upon, dry', x: 0.35, p: 1.0 },
  { c: /^c[3-9]/, s: 'ola', dir: 'child, matter of fact', x: 0.38, p: 1.04 },
  { s: 'wiesia', dir: 'small, close, slow; a question, not a threat', x: 0.28, p: 0.9, l: -2 },
  { k: 'bark', dir: 'muttered in passing, flat', x: 0.28, p: 1.0, l: -3 },
];

function direct(e) {
  const h = e.hint || {};
  let rule = RULES.find((r) => (!r.d || (h.dialogue && r.d.test(h.dialogue)))
    && (!r.c || (h.cutscene && r.c.test(h.cutscene)))
    && (!r.k || r.k === e.kind)
    && (!r.s || r.s === e.speaker)
    && (!r.n || r.n.test(e.node)));
  if (!rule) rule = { dir: 'plain, restrained', x: 0.33, p: 1.0 };
  let dir = rule.dir, x = rule.x, p = rule.p, l = rule.l || 0;
  const t = e.text;
  if (/!/.test(t)) { x += 0.12; l += 1.5; dir += '; raised but controlled'; }
  if (/\.\.\./.test(t)) { p *= 0.93; dir += '; trailing off'; }
  if (h.wait >= 1.2) { p *= 0.95; l -= 1; dir += '; after a held beat'; }
  if (h.afterDecisive) { x -= 0.03; p *= 0.95; l -= 1; dir += '; after the choice'; }
  if (t.length <= 12 && !/\?/.test(t)) { p *= 0.96; l -= 1.5; dir += '; short, quiet'; }
  if (/\?\s*$/.test(t)) dir += '; flat question, not rising';
  x = Math.min(0.55, Math.max(0.18, x));
  l = Math.min(2, Math.max(-7, l));
  const out = { direction: dir, exaggeration: +x.toFixed(2), pace: +Math.min(1.1, Math.max(0.8, p)).toFixed(3) };
  if (l) out.level = +l.toFixed(1);
  return out;
}

// ------------------------------------------------------------------------------------------------

await fromDialogues();
fromCutscenes();
fromBarks();
fromStoryDoc();

const byHash = new Map();
const order = (s) => { const i = SPEAKERS.indexOf(s); return i < 0 ? 999 : i; };
for (const e of raw) {
  const hash = lineHash(e.speaker, e.text);
  const prior = byHash.get(hash);
  if (prior) {
    if (prior.speaker !== e.speaker || prior.text !== e.text) throw new Error(`hash collision ${hash}: "${prior.text}" vs "${e.text}"`);
    prior.also.push(`${e.source}:${e.node}`);
    continue;
  }
  byHash.set(hash, { hash, speaker: e.speaker, text: e.text, kind: e.kind, source: e.source, node: e.node, ...direct(e), also: [] });
}
const lines = [...byHash.values()];
lines.sort((a, b) => order(a.speaker) - order(b.speaker) || a.speaker.localeCompare(b.speaker));
for (const l of lines) if (!l.also.length) delete l.also;

const unknownSpeakers = new Map();
for (const l of lines) if (!cast.speakers[l.speaker]) unknownSpeakers.set(l.speaker, (unknownSpeakers.get(l.speaker) || 0) + 1);
for (const [s, n] of unknownSpeakers) warnings.push(`speaker "${s}" (${n} lines) has no entry in cast.json; add one or an alias in src/audio/voiceKey.js`);

if (WRITE) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({ version: 1, count: lines.length, lines }, null, 1)}\n`);
}

if (!QUIET) {
  const per = new Map();
  for (const l of lines) {
    const o = per.get(l.speaker) || { dialogue: 0, cutscene: 0, bark: 0, chars: 0 };
    o[l.kind]++;
    o.chars += l.text.length;
    per.set(l.speaker, o);
  }
  console.log(`voice lines: ${lines.length} unique (dialogue files ${stats.dialogueFiles}, cutscene files ${stats.cutsceneFiles})${WRITE ? ` -> ${rel(OUT)}` : ''}`);
  console.log('speaker'.padEnd(14) + 'total  dialogue  cutscene  bark   chars');
  for (const [s, o] of per) {
    const tot = o.dialogue + o.cutscene + o.bark;
    console.log(`${s.padEnd(14)}${String(tot).padStart(5)}  ${String(o.dialogue).padStart(8)}  ${String(o.cutscene).padStart(8)}  ${String(o.bark).padStart(4)}  ${String(o.chars).padStart(6)}`);
  }
  const chars = lines.reduce((a, l) => a + l.text.length, 0);
  console.log(`about ${Math.round(chars / 15 / 60)} minutes of speech at 15 characters per second`);
  console.log(`not voiced: ${stats.narrationSkipped} narrator/stage-direction nodes, ${stats.narrationSubs} narration d.sub calls`);
  for (const w of warnings) console.warn(`WARN ${w}`);
  if (unresolved.length) {
    console.warn(`\nUNRESOLVED say/sub calls (${unresolved.length}): the extractor needs literal arguments (or export voiceLines):`);
    for (const u of unresolved) console.warn(`  ${u.file}:${u.line}  ${u.call}${u.note ? `   [${u.note}]` : ''}`);
  }
}

if (REPORT) {
  const manifestPath = path.join(PUBLIC, 'voice/manifest.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { console.log(`\n(no ${rel(manifestPath)} yet: nothing is voiced)`); }
  const have = (h) => {
    const m = manifest[h];
    return !!m && fs.existsSync(path.join(PUBLIC, m.file));
  };
  const missing = lines.filter((l) => !have(l.hash));
  const stale = Object.entries(manifest).filter(([h]) => !byHash.has(h));
  console.log(`\nCOVERAGE: ${lines.length - missing.length} of ${lines.length} lines have audio, ${missing.length} do not`);
  const perSpeaker = new Map();
  for (const l of lines) {
    const o = perSpeaker.get(l.speaker) || { n: 0, miss: 0 };
    o.n++;
    if (!have(l.hash)) o.miss++;
    perSpeaker.set(l.speaker, o);
  }
  for (const [s, o] of perSpeaker) console.log(`  ${s.padEnd(14)} ${String(o.n - o.miss).padStart(4)} / ${String(o.n).padEnd(4)} ${o.miss ? `(${o.miss} missing)` : ''}`);
  if (!BRIEF) {
    for (const [s] of perSpeaker) {
      const m = missing.filter((l) => l.speaker === s);
      if (!m.length) continue;
      console.log(`\n${s} (${m.length} without audio)`);
      for (const l of m) console.log(`  ${l.hash}  ${l.source.replace(/^src\/(story\/content\/|gameplay\/)?/, '')}:${l.node}  ${l.text}`);
    }
  }
  if (stale.length) {
    console.log(`\nSTALE manifest entries (line changed or removed; the clip is no longer played): ${stale.length}`);
    if (!BRIEF) for (const [h, m] of stale) console.log(`  ${h}  ${m.speaker}  ${m.text}`);
  }
  if (flag('--fail-on-missing') && missing.length) process.exitCode = 1;
}
if (STRICT && unresolved.length) process.exitCode = 2;
