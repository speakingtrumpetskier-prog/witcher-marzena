#!/usr/bin/env node
// Audio render and analysis harness. Starts a Vite dev server, opens the audio audition scene in
// headless Chromium, renders moods, stingers, SFX, ambience and instrument tests through the real
// engine on an OfflineAudioContext, and writes to shots/audio/:
//   <name>.wav            16-bit stereo renders to listen to
//   <name>.png            spectrogram (log frequency, 30 Hz to 16 kHz; 200-400 Hz and 6 kHz marked)
//   report.md / report.json   peak, RMS, integrated loudness (BS.1770 K-weighted, gated LUFS),
//                             short-term max, DC offset, clipping, band energy shares and flags
//                             (CLIP, DC, HARSH >6 kHz, MUD 200-400 Hz, QUIET/LOUD against the mood's target)
//
//   node scripts/render-audio.mjs                       everything (several minutes)
//   node scripts/render-audio.mjs --only moods --mood village,combat --seconds 60
//   groups: moods, transitions, stingers, sfx, ambience, inst, repeat
/* global window */
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shots/audio');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const only = args.only ? String(args.only).split(',') : null;
const want = (g) => !only || only.includes(g);
const SR = +(args.sr || 44100);

// Loudness targets (integrated LUFS at default volumes). Quiet moods are quiet by design.
const MOODS = {
  reveal: { s: 100, target: -17 }, village: { s: 120, target: -19 }, combat: { s: 75, target: -16 },
  procession: { s: 120, target: -18 }, thaw: { s: 120, target: -17 }, boss: { s: 80, target: -15 },
  pass: { s: 75, target: -24 }, wild: { s: 90, target: -23 }, night: { s: 90, target: -25 },
  tense: { s: 70, target: -22 }, sorrow: { s: 90, target: -21 }, lullaby: { s: 90, target: -23 },
};
const SFX_GROUPS = {
  footsteps: ['step_snow', 'step_ice', 'step_wood', 'step_road', 'hoof_walk', 'hoof_trot', 'hoof_gallop'],
  combat: ['sword_whoosh', 'sword_whoosh_heavy', 'hit_flesh', 'hit_straw', 'hit_ice', 'parry', 'block', 'sword_draw', 'sword_sheathe', 'dodge', 'roll', 'body_fall'],
  signs: ['sign_ember', 'sign_gale', 'sign_ward', 'ward_hit', 'senses_on', 'senses_off'],
  voices: ['vesna_hurt', 'vesna_effort', 'vesna_death', 'boss_scream', 'child_laugh'],
  creatures: ['wolf_growl', 'wolf_howl', 'wolf_bite', 'wolf_yelp', 'horse_whinny', 'horse_snort', 'whistle', 'dog_bark', 'crow', 'raven', 'chicken', 'goat', 'owl', 'bird'],
  world: ['ice_crack', 'ice_groan', 'ice_ping', 'ice_spike', 'bell_under_ice', 'effigy_creak', 'effigy_burn', 'effigy_collapse', 'splash', 'heartbeat', 'ignite'],
  props: ['door', 'door_close', 'page_turn', 'coin', 'item_pickup', 'potion_drink', 'forge_hammer', 'axe_chop', 'snowball_hit'],
  ui: ['ui_hover', 'ui_select', 'ui_open', 'ui_close'],
};
const LONG = { bell_under_ice: 8, boss_scream: 3.2, wolf_howl: 4, ice_groan: 4.5, effigy_burn: 4, ice_ping: 2.4, owl: 2.8, potion_drink: 2.3, effigy_collapse: 2.2, horse_whinny: 2, ice_crack: 2 };

const jobs = [];
if (want('moods')) {
  const pick = args.mood ? String(args.mood).split(',') : Object.keys(MOODS);
  for (const m of pick) jobs.push({ out: `mood_${m}`, job: { kind: 'mood', name: m, seconds: +(args.seconds || MOODS[m].s), sr: SR }, target: MOODS[m].target, cat: 'mood' });
}
if (want('transitions')) {
  jobs.push({ out: 'transition_village_tense_combat_village', cat: 'mood', target: -18, job: { kind: 'sequence', seconds: 75, sr: SR, steps: [[0, 'mood', 'village', { fade: 0.05 }], [18, 'mood', 'tense', { fade: 3 }], [33, 'stinger', 'danger'], [34, 'mood', 'combat', { fade: 1.5 }], [58, 'mood', 'village', { fade: 4 }]] } });
  jobs.push({ out: 'transition_dialogue_duck', cat: 'mood', target: -19, job: { kind: 'sequence', seconds: 40, sr: SR, steps: [[0, 'mood', 'village', { fade: 0.05 }], [8, 'duck', 0.55], [22, 'duck', 0], [30, 'stinger', 'quest']] } });
}
if (want('stingers')) {
  for (const s of ['discover', 'quest', 'echo', 'danger', 'choice', 'death', 'reveal']) jobs.push({ out: `stinger_${s}`, cat: 'stinger', job: { kind: 'stinger', name: s, seconds: 9, sr: SR } });
  jobs.push({ out: 'stingers_over_village', cat: 'mood', target: -19, job: { kind: 'sequence', seconds: 60, sr: SR, steps: [[0, 'mood', 'village', { fade: 0.05 }], [6, 'stinger', 'discover'], [16, 'stinger', 'quest'], [24, 'stinger', 'echo'], [34, 'stinger', 'choice'], [44, 'stinger', 'reveal']] } });
}
if (want('sfx')) {
  for (const [g, names] of Object.entries(SFX_GROUPS)) {
    jobs.push({ out: `sfx_${g}`, cat: 'sfx', job: { kind: 'sfx', names, variants: 3, gap: 1.0, seconds: names.length * 3.6 + 2, sr: SR } });
    for (const n of names) {
      const gap = LONG[n] || 1.0;
      jobs.push({ out: `sfx/${n}`, cat: 'sfx1', job: { kind: 'sfx', names: [n], variants: 4, gap, seconds: gap * 4 + 1.2, sr: SR } });
    }
  }
}
if (want('ambience')) {
  const amb = (out, env, seconds = 45, moves) => jobs.push({ out: `amb_${out}`, cat: 'amb', job: { kind: 'ambience', seconds, sr: SR, env, moves } });
  amb('village_day', { pos: { x: 10, y: 5, z: 120 }, hour: 11, weather: 'clear', wind: 0.2 });
  amb('village_smithy', { pos: { x: 30, y: 5, z: 135 }, hour: 14, weather: 'overcast', wind: 0.3 });
  amb('forest_day', { pos: { x: -300, y: 30, z: 120 }, hour: 13, weather: 'clear', wind: 0.35 });
  amb('lake_night', { pos: { x: 20, y: 2, z: -110 }, hour: 23, weather: 'clear', wind: 0.15 });
  amb('forest_night', { pos: { x: -330, y: 25, z: -60 }, hour: 1, weather: 'clear', wind: 0.2 });
  amb('pass_blizzard', { pos: { x: -560, y: 110, z: 520 }, hour: 15, weather: 'blizzard', wind: 1, gust: 0.4 });
  amb('walk_village_to_lake', { pos: { x: 0, y: 5, z: 125 }, hour: 16, weather: 'snow', wind: 0.45 }, 60, [[15, { pos: { x: 0, y: 3, z: 70 } }], [30, { pos: { x: 0, y: 1, z: 20 } }], [45, { pos: { x: 10, y: 1, z: -60 } }]]);
}
if (want('inst')) {
  for (const n of ['voice', 'choir', 'fiddle', 'flute', 'gurdy', 'throat', 'zither', 'box', 'drums', 'bells', 'wind']) jobs.push({ out: `inst_${n}`, cat: 'inst', job: { kind: 'inst', name: n, seconds: n === 'throat' || n === 'bells' ? 16 : 24, sr: SR } });
}

// --- Analysis ----------------------------------------------------------------------------

function readWav16(buf) {
  const nc = buf.readUInt16LE(22), sr = buf.readUInt32LE(24);
  const data = buf.subarray(44);
  const n = data.length / 2 / nc;
  const ch = Array.from({ length: nc }, () => new Float32Array(n));
  let full = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const s = data.readInt16LE((i * nc + c) * 2);
    if (s >= 32767 || s <= -32768) full++;
    ch[c][i] = s / 32768;
  }
  return { ch, sr, full };
}

function biquad(b0, b1, b2, a1, a2) {
  let z1 = 0, z2 = 0;
  return (x) => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
}
function kWeight(x, sr) {
  // BS.1770 pre-filter (high shelf) and RLB highpass, parameterized for any rate (libebur128).
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad((Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  const s2 = biquad(1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = s2(s1(x[i]));
  return y;
}
function loudness(ch, sr) {
  const kw = ch.map((c) => kWeight(c, sr));
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr);
  const ms = [];
  for (let s = 0; s + blk <= kw[0].length; s += hop) {
    let z = 0;
    for (const c of kw) { let a = 0; for (let i = s; i < s + blk; i++) a += c[i] * c[i]; z += a / blk; }
    ms.push(z);
  }
  const L = (z) => -0.691 + 10 * Math.log10(z + 1e-20);
  const abs = ms.filter((z) => L(z) > -70);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((z) => L(z) > rel);
  const integrated = gated.length ? L(mean(gated)) : -99;
  // Short-term (3 s) loudness max and a loudness range estimate.
  const st = [];
  const w = 30;
  for (let i = 0; i + w <= ms.length; i += 5) st.push(L(mean(ms.slice(i, i + w))));
  const stg = st.filter((v) => v > -70 && v > integrated - 20).sort((a, b) => a - b);
  const pct = (p) => (stg.length ? stg[Math.min(stg.length - 1, Math.floor(p * stg.length))] : -99);
  return { integrated, stMax: st.length ? Math.max(...st) : integrated, lra: pct(0.95) - pct(0.1), silent: ms.filter((z) => L(z) < -60).length / Math.max(1, ms.length) };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function spectrum(mono, sr, file) {
  const N = 4096, hop = 2048;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const frames = Math.max(1, Math.floor((mono.length - N) / hop));
  const W = Math.min(1400, frames), H = 360;
  const psd = new Float64Array(N / 2);
  const cols = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const s = f * hop;
    for (let i = 0; i < N; i++) { re[i] = (mono[s + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; psd[k] += p; mag[k] = p; }
    if (cols.length < W || f % Math.ceil(frames / W) === 0) cols.push(mag);
  }
  const df = sr / N;
  const band = (lo, hi) => { let a = 0; for (let k = Math.ceil(lo / df); k < Math.min(N / 2, hi / df); k++) a += psd[k]; return a; };
  const total = band(20, sr / 2) + 1e-20;
  let cen = 0; for (let k = 1; k < N / 2; k++) cen += k * df * psd[k];
  const bands = { sub: band(20, 60) / total, low: band(60, 200) / total, mud: band(200, 400) / total, mid: band(400, 2000) / total, pres: band(2000, 6000) / total, air: band(6000, sr / 2) / total, centroid: cen / total };
  // Spectrogram image.
  const step = Math.max(1, Math.floor(cols.length / W));
  const img = Buffer.alloc((W * 3 + 1) * H);
  const fLo = 30, fHi = 16000;
  const norm = (N / 4) * (N / 4);
  for (let y = 0; y < H; y++) {
    const fr = fLo * Math.pow(fHi / fLo, 1 - y / (H - 1));
    const k = Math.min(N / 2 - 1, Math.round(fr / df));
    const k2 = Math.min(N / 2 - 1, Math.round((fLo * Math.pow(fHi / fLo, 1 - (y + 1) / (H - 1))) / df));
    img[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const col = cols[Math.min(cols.length - 1, x * step)];
      let p = 0; for (let kk = Math.min(k, k2); kk <= Math.max(k, k2); kk++) p = Math.max(p, col[kk]);
      const db = 10 * Math.log10(p / norm + 1e-20);
      let t = Math.max(0, Math.min(1, (db + 100) / 85));
      let [r, g, b] = inferno(t);
      const isLine = [200, 400].some((f) => Math.abs(fr - f) < f * 0.006) || Math.abs(fr - 6000) < 40;
      if (isLine) { r = Math.max(r, 90); g = Math.max(g, 200); b = Math.max(b, 255); }
      const o = y * (W * 3 + 1) + 1 + x * 3;
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
  fs.writeFileSync(file, png(W, H, img));
  return bands;
}
function inferno(t) {
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
}
function png(w, h, raw) {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

function analyze(file, meta) {
  const { ch, sr, full } = readWav16(fs.readFileSync(file));
  let pk = 0, ss = 0, n = 0;
  const dc = ch.map((c) => { let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; const a = Math.abs(c[i]); if (a > pk) pk = a; ss += c[i] * c[i]; n++; } return s / c.length; });
  const L = loudness(ch, sr);
  const mono = new Float32Array(ch[0].length);
  for (let i = 0; i < mono.length; i++) mono[i] = (ch[0][i] + (ch[1] ? ch[1][i] : ch[0][i])) * 0.5;
  const bands = spectrum(mono, sr, file.replace(/\.wav$/, '.png'));
  const flags = [];
  if (meta.over > 0 || full > 0) flags.push('CLIP');
  if (dc.some((d) => Math.abs(d) > 0.002)) flags.push('DC');
  const harsh = meta.cat === 'sfx' || meta.cat === 'sfx1' ? 0.12 : 0.06;
  if (bands.air > harsh) flags.push('HARSH');
  // Voices and animals have their fundamentals in 200 to 400 Hz, so mud is judged on music only.
  if ((meta.cat === 'mood' || meta.cat === 'amb') && bands.mud > 0.3) flags.push('MUD');
  if (meta.target != null && L.integrated < meta.target - 3) flags.push(`QUIET(${(L.integrated - meta.target).toFixed(1)})`);
  if (meta.target != null && L.integrated > meta.target + 3) flags.push(`LOUD(+${(L.integrated - meta.target).toFixed(1)})`);
  if (L.integrated < -60) flags.push('SILENT');
  return {
    name: meta.out, cat: meta.cat, seconds: +(ch[0].length / sr).toFixed(1), peak: +db(meta.peak ?? pk).toFixed(2), rms: +db(Math.sqrt(ss / n)).toFixed(1),
    lufs: +L.integrated.toFixed(1), stMax: +L.stMax.toFixed(1), lra: +L.lra.toFixed(1), silent: +(L.silent * 100).toFixed(0), dc: +Math.max(...dc.map(Math.abs)).toFixed(5),
    clipped: meta.over || 0, mud: +(bands.mud * 100).toFixed(1), air: +(bands.air * 100).toFixed(2), low: +((bands.sub + bands.low) * 100).toFixed(1), centroid: Math.round(bands.centroid),
    target: meta.target, flags, marks: meta.marks, bakeMs: meta.bakeMs, bankMB: meta.bankMB,
  };
}

// --- Run -------------------------------------------------------------------------------

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  return await import('/opt/node-tools/node_modules/playwright/index.mjs');
}

fs.mkdirSync(path.join(OUT, 'sfx'), { recursive: true });
// No watcher and no HMR: other builders edit the tree while we render, and a reload would kill a job.
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/witcher-marzena/?scene=audio&render`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 120000, polling: 250 });

const results = [];
const t0 = Date.now();
const gotoAudio = async () => {
  await page.goto(`${base}/witcher-marzena/?scene=audio&render`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MZ_READY === true, null, { timeout: 120000, polling: 250 });
};
for (const j of jobs) {
  const t = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) try {
    const res = await page.evaluate(async (job) => {
      const off = await import('/witcher-marzena/src/audio/offline.js');
      const r = await off.renderJob(job);
      const st = off.floatStats(r.channels);
      window.__wav = off.toWav16(r.channels, r.sr);
      return { ...st, marks: r.marks, len: window.__wav.length, bakeMs: r.bakeMs, bankMB: r.bankMB };
    }, j.job);
    const parts = [];
    const CH = 3 << 20;
    for (let o = 0; o < res.len; o += CH) {
      const b64 = await page.evaluate(([o, n]) => {
        const a = window.__wav.subarray(o, o + n);
        let s = '';
        for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768));
        return btoa(s);
      }, [o, CH]);
      parts.push(Buffer.from(b64, 'base64'));
    }
    const file = path.join(OUT, `${j.out}.wav`);
    fs.writeFileSync(file, Buffer.concat(parts));
    const a = analyze(file, { ...j, over: res.over, peak: res.peak, marks: res.marks, bakeMs: res.bakeMs, bankMB: res.bankMB });
    results.push(a);
    console.log(`${j.out.padEnd(44)} ${String(a.lufs).padStart(6)} LUFS  peak ${String(a.peak).padStart(6)} dB  mud ${String(a.mud).padStart(4)}%  air ${String(a.air).padStart(5)}%  ${a.flags.join(' ')}  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    break;
  } catch (e) {
    console.log(`${attempt ? 'FAIL' : 'retry'} ${j.out}: ${e.message.split('\n')[0]}`);
    try { await gotoAudio(); } catch { /* next attempt fails loudly */ }
  }
}

let repeats = [];
if (want('repeat')) {
  repeats = await page.evaluate(async (names) => {
    const off = await import('/witcher-marzena/src/audio/offline.js');
    return names.map((n) => off.repeatReport(n, 12));
  }, Object.keys(MOODS));
  for (const r of repeats) console.log(`repeat ${r.name.padEnd(11)} ${r.bars} bars over ${r.seconds}s  exact: ${r.exact ? `${r.exact.at.toFixed(0)}s repeats ${r.exact.of.toFixed(0)}s` : 'never'}  melodic: ${r.melodic ? `${r.melodic.at.toFixed(0)}s repeats ${r.melodic.of.toFixed(0)}s` : 'never'}`);
}

await browser.close();
await server.close();

// Merge with an existing report so partial runs (--only) keep the other rows.
const jsonFile = path.join(OUT, 'report.json');
let prev = { results: [], repeats: [] };
try { prev = JSON.parse(fs.readFileSync(jsonFile, 'utf8')); } catch { /* first run */ }
const byName = new Map(prev.results.map((r) => [r.name, r]));
for (const r of results) byName.set(r.name, r);
const all = [...byName.values()].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
const reps = repeats.length ? repeats : prev.repeats || [];
fs.writeFileSync(jsonFile, JSON.stringify({ date: new Date().toISOString(), sr: SR, results: all, repeats: reps }, null, 1));
const row = (r) => `| ${r.name} | ${r.seconds} | ${r.peak} | ${r.rms} | ${r.lufs} | ${r.target ?? ''} | ${r.stMax} | ${r.lra} | ${r.dc} | ${r.clipped} | ${r.low} | ${r.mud} | ${r.air} | ${r.centroid} | ${r.flags.join(' ')} |`;
const md = [
  '# Audio render report', '', `Generated ${new Date().toISOString()} at ${SR} Hz. Loudness is BS.1770 integrated (gated) LUFS; peak is sample peak in dBFS.`,
  'Bands are shares of total energy: low (<200 Hz), mud (200 to 400 Hz), air (>6 kHz). Flags: CLIP, DC, HARSH (air above 6% for music, 12% for SFX), MUD (above 30% for music), QUIET/LOUD (more than 3 LU from the mood target).', '',
  '| name | s | peak dB | rms dB | LUFS | target | ST max | LRA | DC | clipped | low % | mud % | air % | centroid Hz | flags |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...all.map(row), '',
  '## Repetition (score analysis over 12 minutes)', '', '| mood | bars | first exact 8-bar repeat | first melodic repeat (pitch and rhythm only) |', '|---|---|---|---|',
  ...reps.map((r) => `| ${r.name} | ${r.bars} | ${r.exact ? `${r.exact.at.toFixed(0)} s (repeats ${r.exact.of.toFixed(0)} s)` : 'none in 12 min'} | ${r.melodic ? `${r.melodic.at.toFixed(0)} s (repeats ${r.melodic.of.toFixed(0)} s)` : 'none in 12 min'} |`),
  '', '## Sections (mood renders)', '',
  ...all.filter((r) => r.marks && r.marks.length).map((r) => `- ${r.name}: ${r.marks.map(([t, s]) => `${t}s ${s}`).join(', ')}`),
];
fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n') + '\n');
const uniq = [...new Set(logs)].slice(0, 30);
if (uniq.length) { console.log('console:'); for (const l of uniq) console.log('  ', l.slice(0, 300)); }
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> shots/audio/report.md`);
