// Cinematics preview: plays any scene from src/story/content/cutscenes/ on the real world.
//   ?scene=cinematics&play=c1_blizzard          starts the scene when the game is ready (see ids below)
//   &flags=reeve_told,hanka_blamed,ola_lie      flags set before the scene (key=value also works)
//   &sheet=1                                    contact sheet (see below) shown full screen when it ends
//   &sheet=1&every=3&cols=3&rows=3&page=0       tile every 3 s of scene time, 3 x 3 tiles per page
// Ids: c1_blizzard c2_valley c3_song c4_echo c5_lair dawn c6_procession c7_emergence finale_choice
//      ending_thaw ending_looking_back ending_nothing_changes epilogue_knot  (plus thaw_test)
// Harness helpers (window.__cine):
//   play(id, { flags })            plays and resolves with { skipped }, logs the end state
//   sheet(id, { every, cols, rows, page, settle })  contact sheet of the scene with letterbox and subtitles
//   skipTest(id, atSeconds)        plays, skips after N seconds of scene time, logs flags, clock, weather
//   tiles                          data URLs of every captured tile (for the dev runner)
// Needs the same modules as the shot command: atmosphere sky terrain water rocks vegetation locations
// characters weather story ui postfx (audio is added when it is not a shot).
import { charactersAvailable, spawnCharacter } from '../../story/director/Actors.js';
import * as THREE from 'three';
import { makePuppet } from './story_puppets.js';
import { passSite } from '../../story/content/cutscenes/_cine.js';
import { LOC } from '../../world/layout.js';

const P = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = [
  'atmosphere', 'sky', 'terrain', 'water', 'rocks', 'vegetation', 'locations', 'characters', 'weather',
  ...(P.has('shot') ? [] : ['audio']),
  'ui', ...(P.has('gp') ? ['gameplay'] : []), 'story', 'postfx',
];

function parseFlags(G, text) {
  if (!text) return;
  for (const part of text.split(',').filter(Boolean)) {
    const [k, v] = part.split('=');
    G.state.set(k, v === undefined ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v);
  }
}

export async function init(G) {
  if (!charactersAvailable(G)) G.story.placeholderFactory = (preset) => makePuppet(G, preset);
  const log = (...a) => console.warn('[cine]', ...a);
  const api = { tiles: [], log: [] };
  window.__cine = api;

  const report = (id, res, t0) => {
    const S = G.state.data.flags;
    const out = {
      id, skipped: !!res?.skipped, secs: +(G.story.sched.time - t0).toFixed(1),
      hours: +G.time.hours.toFixed(2), day: G.time.day, weather: G.weather?.state, owner: G.cameraOwner,
      snow: +G.uniforms.uSnowCover.value.toFixed(2), spring: +G.uniforms.uSpring.value.toFixed(2),
      flags: Object.keys(S).filter((k) => S[k]).join(','),
    };
    api.log.push(out);
    log('end', JSON.stringify(out));
    return out;
  };

  api.play = async (id, o = {}) => {
    parseFlags(G, o.flags);
    const t0 = G.story.sched.time;
    const res = await G.cutscenes.play(id, o.play || {});
    return report(id, res, t0);
  };

  // Plays the scene and skips once `at` seconds of scene time have passed.
  api.skipTest = async (id, at = 8, o = {}) => {
    parseFlags(G, o.flags);
    const t0 = G.story.sched.time;
    // Keeps trying: a choice stops the skip, and the rest of the scene should be skipped too.
    const timer = setInterval(() => {
      if (G.cutscenes.active && G.story.sched.time - t0 >= at) G.cutscenes.skip();
    }, 100);
    const res = await G.cutscenes.play(id);
    clearInterval(timer);
    return report(id, res, t0);
  };

  // Logs where every actor on the stage and the camera are at the given scene times (no rendering).
  api.probe = async (id, times = [10], { flags } = {}) => {
    parseFlags(G, flags);
    const origRender = G.renderer.render;
    G.renderer.render = () => {};
    const t0 = G.story.sched.time;
    const done = new Set();
    const dump = (t) => {
      const fw = G.camera.getWorldDirection(new THREE.Vector3());
      const out = { t, cam: G.camera.position.toArray().map((v) => +v.toFixed(1)), dir: fw.toArray().map((v) => +v.toFixed(2)), fov: +G.camera.fov.toFixed(1), actors: {} };
      for (const a of G.cutscenes.stage?.list?.() || []) {
        const wp = a.c.root.getWorldPosition(new THREE.Vector3());
        let ey = null;
        try { ey = +a.eye(new THREE.Vector3()).y.toFixed(2); } catch { /* no eyes */ }
        out.actors[a.id] = { p: wp.toArray().map((v) => +v.toFixed(1)), eyeY: ey, vis: a.c.root.visible, par: a.c.root.parent?.type };
      }
      log('probe', JSON.stringify(out));
    };
    const off = G.addSystem('cine-probe', () => {
      for (const t of times) if (!done.has(t) && G.story.sched.time - t0 >= t) { done.add(t); dump(t); }
    }, 0);
    let res;
    try { res = await G.cutscenes.play(id); } finally { off(); G.renderer.render = origRender; }
    return report(id, res, t0);
  };

  // Contact sheet: a tile at every camera setup (a moment after it settles) and every `every` seconds.
  api.sheet = async (id, { cols = 3, rows = 3, page = 0, every = 4, settle = 0.7, flags, show = true } = {}) => {
    parseFlags(G, flags);
    const ui = G.story.ui;
    const src = G.renderer.domElement;
    const tiles = [];
    api.tiles = [];
    const TW = Math.floor(window.innerWidth / cols), TH = Math.floor((TW * src.height) / src.width);
    let sub = '';
    const origSub = ui.subtitle;
    let subTok = null;
    ui.subtitle = (name, text, s, o) => { sub = (name ? `${name}: ` : '') + text; subTok = origSub(name, text, s, o); return subTok; };
    const origClear = ui.clearSubtitle;
    ui.clearSubtitle = (t) => { if (t == null || t === subTok) sub = ''; origClear(t); };
    let pending = null, lastLabel = '', lastT = 0;
    const T = () => G.story.sched.time;
    const t0 = T();
    G.story.cam.onShot = (info) => { pending = { label: info.label, t: T() }; lastLabel = info.label; };
    let lastLog = -1;
    // Fast mode: no GPU work between samples. The scene logic, animation and camera still run every
    // frame; renderer.render (shadows and every post pass go through it) only runs for the frame
    // before a sample, which is then read back one frame later.
    const fast = !P.has('fullrender');
    let drawFrame = true, capture = null;
    const origRender = G.renderer.render;
    if (fast) G.renderer.render = (...a) => { if (drawFrame) origRender.apply(G.renderer, a); };
    const snap = (label) => {
      const c = document.createElement('canvas');
      c.width = TW; c.height = TH;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0, c.width, c.height);
      const frac = ui.letterboxed ? ui.cinemaFrac() : 1;
      const bar = ((1 - frac) / 2) * c.height;
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, bar);
      g.fillRect(0, c.height - bar, c.width, bar);
      g.font = `${Math.round(TW / 30)}px Georgia, serif`;
      g.fillStyle = '#e9e1d2';
      g.textAlign = 'center';
      if (sub) g.fillText(sub.length > 64 ? `${sub.slice(0, 62)}...` : sub, c.width / 2, c.height - Math.max(5, bar * 0.3));
      g.textAlign = 'left';
      g.fillStyle = '#ffcf96';
      g.font = `${Math.round(TW / 34)}px monospace`;
      g.fillText(`${tiles.length + 1} ${(T() - t0).toFixed(0)}s ${label || ''}`.slice(0, 48), 6, Math.max(14, bar - 4));
      tiles.push(c);
      api.tiles.push(c.toDataURL('image/jpeg', 0.86));
    };
    const off = G.addSystem('cine-sheet', () => {
      if (Math.floor((T() - t0) / 5) !== lastLog) { lastLog = Math.floor((T() - t0) / 5); log('t', (T() - t0).toFixed(1), 'frame', G.clock.frame); }
      if (capture) { snap(capture); capture = null; drawFrame = !fast; }
      if (!pending && every > 0 && G.cutscenes.active && T() - lastT > every) pending = { label: `${lastLabel} +`, t: -1e9 };
      if (!pending || T() - pending.t < settle) return;
      lastT = T();
      const label = pending.label;
      pending = null;
      if (fast) { drawFrame = true; capture = label; } else snap(label);
    }, 0);
    let res;
    try {
      parseFlags(G, flags);
      res = await G.cutscenes.play(id);
    } finally {
      off();
      if (fast) G.renderer.render = origRender;
      G.story.cam.onShot = null;
      ui.subtitle = origSub;
      ui.clearSubtitle = origClear;
    }
    report(id, res, t0);
    if (!show) return tiles.length;
    const per = cols * rows;
    const list = tiles.slice(page * per, page * per + per);
    const out = document.createElement('canvas');
    out.width = cols * TW;
    out.height = rows * TH;
    const g = out.getContext('2d');
    g.fillStyle = '#111';
    g.fillRect(0, 0, out.width, out.height);
    list.forEach((t, i) => g.drawImage(t, (i % cols) * TW, Math.floor(i / cols) * TH));
    g.strokeStyle = '#000';
    for (let i = 1; i < cols; i++) { g.beginPath(); g.moveTo(i * TW, 0); g.lineTo(i * TW, out.height); g.stroke(); }
    for (let j = 1; j < rows; j++) { g.beginPath(); g.moveTo(0, j * TH); g.lineTo(out.width, j * TH); g.stroke(); }
    const img = document.createElement('img');
    img.src = out.toDataURL('image/png');
    Object.assign(img.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: 9999, objectFit: 'contain', background: '#111' });
    document.body.appendChild(img);
    await new Promise((r) => { img.onload = r; setTimeout(r, 500); });
    return tiles.length;
  };

  // Stand-in set dressing when the wilderness builder's set pieces are not in this tree yet.
  if (!P.has('nodress')) await dressStandIns(G, log);

  // Cast stand-ins for a quiet idle view before anything plays.
  if (G.shot && !G.params.get('cam')) {
    G.camera.position.set(-560, 100, 540);
    G.camera.lookAt(-520, 90, 500);
  }
  void spawnCharacter;

  const play = G.params.get('play');
  if (play) {
    G.events.once('game:ready', () => {
      if (P.has('sheet')) {
        api.sheet(play, {
          cols: +(P.get('cols') || 3), rows: +(P.get('rows') || 3), page: +(P.get('page') || 0),
          every: +(P.get('every') || 4), flags: P.get('flags') || '',
        });
      } else api.play(play, { flags: P.get('flags') || '' });
    });
  } else if (P.get('flags')) parseFlags(G, P.get('flags'));
}

// ---- stand-ins (only for framing tests before the real set pieces exist) --------------------------------
async function dressStandIns(G, log) {
  const L = G.world.locations || {};
  if (!L.bellTower) await dressTower(G, log);
  if (!L.passStart) {
    try {
      const S = passSite(G);
      const m = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
      const box = (w, h, d, c, x, y, z, ry = 0, rz = 0) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c));
        o.position.set(x, y, z); o.rotation.set(0, ry, rz); o.castShadow = true; G.scene.add(o); return o;
      };
      box(2.4, 0.9, 1.5, 0x4a3a2c, S.cart.x, S.gy + 0.7, S.cart.z, 0.55, 2.7).name = 'standin:cart';
      const mule = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), m(0x3a322c));
      mule.scale.set(1.4, 0.7, 0.8);
      const mp = { x: S.cart.x + 0.52 * 4.1, z: S.cart.z + 0.85 * 4.1 };
      mule.position.set(mp.x, S.gy + 0.4, mp.z); mule.name = 'standin:mule'; G.scene.add(mule);
      const make = async (id, base, x, z, yaw, upper) => {
        const { createCharacter } = await import('../../characters/index.js');
        const c = createCharacter(id);
        G.scene.add(c.root);
        c.setPosition(x, z); c.yaw = yaw;
        c.play(base, { loop: true, fade: 0 });
        if (upper) c.playUpper?.(upper, { loop: true, fade: 0, hold: true });
        c.root.name = `standin:${id}`;
        return c;
      };
      const cy = 0.55, a = { x: Math.sin(cy), z: Math.cos(cy) };
      await make('villager_m_3', 'sit_ground', S.father.x, S.father.z, Math.atan2(-a.x, -a.z) + 0.2, 'look_back');
      await make('villager_f_4', 'lie_dead', S.mother.x, S.mother.z, cy + Math.PI / 2 + 0.2);
      await make('child_c', 'lie_dead', S.mother.x - 0.7, S.mother.z + 0.3, cy + Math.PI / 2 - 0.15);
    } catch (e) { log('stand-in pass failed', e.message); }
  }
}

// The kit tower with its seventeen seated effigies and the music box (what the wilderness builder places).
async function dressTower(G, log) {
  try {
    const { buildings } = await import('../../world/architecture/index.js');
    const { placeBuilding } = await import('../../world/architecture/place.js');
    const { props } = await import('../../world/props/index.js');
    const Lc = LOC.bellTower;
    const yaw = Math.atan2(LOC.village.x - Lc.x, LOC.village.z - Lc.z);
    const b = buildings.bellTower({ seed: 77 });
    const p = placeBuilding(G, b, Lc.x, Lc.z, yaw, { snap: false, y: 0, foundation: false, skirt: false, tag: 'bellTower' });
    for (const l of p.lights) G.world.addLight?.(l);
    (b.objects.seats || []).forEach((s, i) => {
      const g = props.effigy({ variant: 'seated', seed: i + 1, indoor: true, fx: false });
      g.position.copy(p.localToWorld(s.x, s.y - 0.43, s.z));
      g.rotation.y = yaw + s.yaw;
      G.scene.add(g);
    });
    const mb = props.musicBox({});
    mb.position.copy(p.localToWorld(2.05, 5.4 + 0.82, 0));
    mb.rotation.y = yaw - Math.PI / 2;
    G.scene.add(mb);
    (G.world.locations ||= {}).bellTower = { id: 'bellTower', placed: p, yaw, belfry: { floorY: 5.4 } };
  } catch (e) { log('stand-in tower failed', e.message); }
}
