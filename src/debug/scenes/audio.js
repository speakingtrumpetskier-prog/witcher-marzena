// Audio audition page: ?scene=audio. Buttons for every mood, stinger, SFX and loop; ambience
// zone, weather, wind and hour simulation; mixer volumes and a dialogue duck; a level meter and
// spectrum; and an offline render of the current mood to a downloadable WAV.
// Owner: audio builder. The render script (scripts/render-audio.mjs) also loads this page.
import { MOODS, STINGERS, SFX_GROUPS, LOOP_NAMES } from '../../audio/sfxNames.js';
import { LOC } from '../../world/layout.js';

export const modules = ['audio'];

const ZONES = {
  'village day': { pos: [10, 5, 120], hour: 11, weather: 'clear', wind: 0.2 },
  'smithy': { pos: [30, 5, 135], hour: 14, weather: 'overcast', wind: 0.3 },
  'forest day': { pos: [-300, 30, 120], hour: 13, weather: 'clear', wind: 0.35 },
  'forest night': { pos: [-330, 25, -60], hour: 1, weather: 'clear', wind: 0.2 },
  'lake night': { pos: [20, 2, -110], hour: 23, weather: 'clear', wind: 0.15 },
  'pass blizzard': { pos: [-560, 110, 520], hour: 15, weather: 'blizzard', wind: 1 },
  'tavern (room)': { pos: [LOC.tavern.x, 5, LOC.tavern.z], hour: 20, weather: 'snow', wind: 0.5, space: 'room' },
  'ice cave': { pos: [LOC.waterfall.x, 10, LOC.waterfall.z], hour: 12, weather: 'clear', wind: 0.3, space: 'cave' },
};

export async function init(G) {
  if (G.params.has('render')) return; // the render script only needs the modules
  const A = G.audio;
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#12151d;color:#e9e2d0;font:14px Georgia,serif;padding:16px 20px;z-index:50';
  document.body.appendChild(root);
  const css = document.createElement('style');
  css.textContent = `
    .mz-a h1{font:600 26px "Cormorant Garamond",Georgia,serif;letter-spacing:.2em;margin:0 0 4px}
    .mz-a h2{font:600 15px Georgia,serif;color:#c9a46a;margin:18px 0 6px;letter-spacing:.06em;text-transform:uppercase}
    .mz-a button{background:#232838;color:#efe7d4;border:1px solid #3c4459;border-radius:3px;padding:5px 9px;margin:2px;font:13px Georgia,serif;cursor:pointer}
    .mz-a button:hover{background:#2f364b}
    .mz-a button.on{background:#9a2e22;border-color:#c2493a}
    .mz-a .row{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
    .mz-a label{margin-right:10px;color:#b9b2a2}
    .mz-a .grp{color:#8f97ab;min-width:86px;display:inline-block}
    .mz-a select,.mz-a input{vertical-align:middle}
    .mz-a .status{font:12px monospace;color:#9fb0c4;margin:6px 0}
  `;
  document.head.appendChild(css);
  root.className = 'mz-a';
  const el = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };
  const btn = (label, fn, cls = '') => el('button', { textContent: label, className: cls, onclick: async (ev) => { await A.unlock(); fn(ev); } });
  const section = (title) => { root.append(el('h2', { textContent: title })); const r = el('div', { className: 'row' }); root.append(r); return r; };

  root.append(el('h1', { textContent: 'MARZENA  audio' }));
  root.append(el('div', { textContent: 'Music, instruments, SFX and ambience, all synthesized. Click anything to start audio.' }));
  const status = el('div', { className: 'status', textContent: 'locked' });
  root.append(status);

  // Moods.
  let fade = 3;
  const moodRow = section('Moods');
  const moodBtns = {};
  for (const m of MOODS) moodRow.append(moodBtns[m] = btn(m, () => A.setMood(m, { fade })));
  const fadeSel = el('select', {}, [0.3, 1.5, 3, 6].map((f) => el('option', { value: f, textContent: `fade ${f}s`, selected: f === 3 })));
  fadeSel.onchange = () => { fade = +fadeSel.value; };
  moodRow.append(fadeSel);

  const stRow = section('Stingers');
  for (const s of STINGERS) stRow.append(btn(s, () => A.stinger(s)));

  // SFX.
  let positional = false;
  const sfxHead = section('SFX');
  const posBtn = btn('positional: off', () => { positional = !positional; posBtn.textContent = `positional: ${positional ? 'on' : 'off'}`; posBtn.classList.toggle('on', positional); });
  sfxHead.append(posBtn, el('span', { textContent: 'when on, each sound plays at a random spot 3 to 40 m around the listener' }));
  const randomPos = () => {
    const p = G.camera.position, a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 37;
    return { x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d };
  };
  for (const [g, names] of Object.entries(SFX_GROUPS)) {
    const r = el('div', { className: 'row' }, [el('span', { className: 'grp', textContent: g })]);
    for (const n of names) r.append(btn(n.replace(/_/g, ' '), () => A.sfx(n, positional ? { pos: randomPos() } : {})));
    root.append(r);
  }

  // Loops.
  const loopRow = section('Loops (positional ones sit 6 m ahead)');
  const loops = {};
  for (const n of LOOP_NAMES) {
    const b = btn(n.replace(/_/g, ' '), () => {
      if (loops[n]) { loops[n].stop(); delete loops[n]; b.classList.remove('on'); return; }
      const c = G.camera.position;
      const needsPos = !['senses_hum', 'heartbeat'].includes(n);
      loops[n] = A.loop(n, needsPos ? { pos: { x: c.x, y: c.y, z: c.z - 6 } } : {});
      b.classList.add('on');
    });
    loopRow.append(b);
  }
  let orbit = null;
  loopRow.append(btn('orbiting torch', (ev) => {
    if (orbit) { orbit.h.stop(); orbit = null; ev.target.classList.remove('on'); return; }
    orbit = { h: A.loop('torch', { pos: G.camera.position }), t: 0 };
    ev.target.classList.add('on');
  }));

  // Ambience.
  const ambRow = section('Ambience (moves the listener)');
  const env = { weather: 'clear', wind: 0.25, hour: 12, space: 'hall' };
  const apply = () => { A.envOverride = { ...env }; A.setEnvironment(env.space); };
  for (const [name, z] of Object.entries(ZONES)) {
    ambRow.append(btn(name, () => {
      G.camera.position.set(...z.pos);
      Object.assign(env, { weather: z.weather, wind: z.wind, hour: z.hour, space: z.space || 'hall' });
      weatherSel.value = env.weather; windIn.value = env.wind; hourIn.value = env.hour;
      apply();
    }));
  }
  const weatherSel = el('select', {}, ['clear', 'overcast', 'snow', 'blizzard', 'fog'].map((w) => el('option', { value: w, textContent: w })));
  weatherSel.onchange = () => { env.weather = weatherSel.value; apply(); };
  const windIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.25 });
  windIn.oninput = () => { env.wind = +windIn.value; apply(); };
  const hourIn = el('input', { type: 'range', min: 0, max: 24, step: 0.25, value: 12 });
  hourIn.oninput = () => { env.hour = +hourIn.value; apply(); };
  root.append(el('div', { className: 'row' }, [el('label', { textContent: 'weather' }), weatherSel, el('label', { textContent: ' wind' }), windIn, el('label', { textContent: ' hour' }), hourIn]));

  // Mixer.
  const mixRow = section('Mixer');
  for (const k of ['master', 'music', 'sfx', 'ambience']) {
    const s = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: A.volumes[k] });
    s.oninput = () => { A.volumes[k] = +s.value; };
    mixRow.append(el('label', { textContent: k }), s);
  }
  mixRow.append(btn('duck (dialogue 4 s)', () => A.duck(0.55, 4)));

  // Meter and spectrum.
  const meter = el('canvas', { width: 720, height: 120 });
  meter.style.cssText = 'display:block;margin-top:14px;background:#0b0d12;border:1px solid #2a3042';
  root.append(meter);

  // Offline render.
  const offRow = section('Offline render');
  const secIn = el('select', {}, [20, 60, 120].map((s) => el('option', { value: s, textContent: `${s} s` })));
  offRow.append(secIn, btn('render current mood to WAV', async () => {
    const off = await import('../../audio/offline.js');
    const mood = A.mood === 'silence' ? 'reveal' : A.mood;
    status.textContent = `rendering ${mood}...`;
    const r = await off.renderJob({ kind: 'mood', name: mood, seconds: +secIn.value });
    const url = URL.createObjectURL(new Blob([off.toWav16(r.channels, r.sr)], { type: 'audio/wav' }));
    const a = el('a', { href: url, download: `marzena_${mood}.wav`, textContent: ` download marzena_${mood}.wav` });
    a.style.color = '#c9a46a';
    offRow.append(a);
  }));

  const g2 = meter.getContext('2d');
  let fbuf = null, tbuf = null;
  G.addSystem('audio-audition', (dt) => {
    const info = A.info();
    status.textContent = info.ready
      ? `${info.state}  mood ${info.mood}  section "${info.section}"  bar ${info.bar}  players ${info.players}  voices ${info.voices}  loops ${info.loops}  bank ${info.bankMB} MB (${info.bakeMs} ms baked)`
      : 'locked: click anything';
    for (const [m, b] of Object.entries(moodBtns)) b.classList.toggle('on', m === A.mood);
    if (orbit) { orbit.t += dt; const c = G.camera.position; orbit.h.setPos({ x: c.x + Math.cos(orbit.t * 0.8) * 7, y: c.y, z: c.z + Math.sin(orbit.t * 0.8) * 7 }); }
    if (!info.ready) return;
    const an = A.eng.mixer.analyser();
    fbuf = fbuf || new Uint8Array(an.frequencyBinCount);
    tbuf = tbuf || new Float32Array(an.fftSize);
    an.getByteFrequencyData(fbuf);
    an.getFloatTimeDomainData(tbuf);
    let pk = 0, s = 0;
    for (const v of tbuf) { pk = Math.max(pk, Math.abs(v)); s += v * v; }
    const rms = Math.sqrt(s / tbuf.length);
    const W = meter.width, H = meter.height;
    g2.fillStyle = '#0b0d12'; g2.fillRect(0, 0, W, H);
    for (let x = 0; x < W - 60; x++) {
      const f = 30 * Math.pow(16000 / 30, x / (W - 60));
      const k = Math.min(fbuf.length - 1, Math.round(f / (A.ctx.sampleRate / 2) * fbuf.length));
      const h = (fbuf[k] / 255) * H;
      g2.fillStyle = f > 6000 ? '#7fb2d8' : f > 200 && f < 400 ? '#c9a46a' : '#9a2e22';
      g2.fillRect(x, H - h, 1, h);
    }
    const dbf = (v) => Math.max(0, 1 + (20 * Math.log10(v + 1e-9)) / 60);
    g2.fillStyle = '#444'; g2.fillRect(W - 50, 0, 20, H); g2.fillRect(W - 25, 0, 20, H);
    g2.fillStyle = pk > 0.95 ? '#ff4040' : '#e9e2d0'; g2.fillRect(W - 50, H * (1 - dbf(pk)), 20, H * dbf(pk));
    g2.fillStyle = '#c9a46a'; g2.fillRect(W - 25, H * (1 - dbf(rms)), 20, H * dbf(rms));
  }, 101);
}
