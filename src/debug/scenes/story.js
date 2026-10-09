// Story systems gallery: the sample dialogue and cutscene, hunter senses, quests.
//   ?scene=story                         two actors on the east shore, idle
//   ?scene=story&play=dialogue           runs content/dialogues/_sample.js
//   ?scene=story&play=cutscene           runs content/cutscenes/_sample.js
//   ?scene=story&play=senses             trails, clues and an echo spot on the ice camp
//   &gp=1 also loads gameplay (player, rig) once those files exist; &full=1 adds vegetation and locations
// From the harness (contact sheet of every camera setup, drawn with letterbox and subtitle):
//   node scripts/shot.mjs --w 1600 --h 900 --q "scene=story&dspeed=2&autopick=2,0" \
//     --eval "await __story.sheet('dialogue')" --out shots/story/dialogue_sheet.png
// Uses the real characters when createCharacter exists, placeholder puppets otherwise.
import * as THREE from 'three';
import { makePuppet } from './story_puppets.js';
import { charactersAvailable, spawnCharacter } from '../../story/director/Actors.js';

const P = new URLSearchParams(location.search);
export const needsWorld = true;
export const modules = [
  'atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'characters', 'ui', 'audio',
  ...(P.has('gp') ? ['gameplay'] : []),
  ...(P.has('full') ? ['vegetation', 'locations'] : []),
  'story', 'postfx',
];

const HANKA_AT = [62, 62];
const VESNA_AT = [60.6, 64.3];

export async function init(G) {
  if (!charactersAvailable(G)) G.story.placeholderFactory = (preset) => makePuppet(G, preset);
  const spawn = (preset, [x, z], yaw) => {
    const c = spawnCharacter(G, preset);
    if (!c) return null;
    if (!c.root.parent) G.scene.add(c.root);
    if (c.setPosition) c.setPosition(x, z); else c.root.position.set(x, G.world.heightAt(x, z), z);
    c.yaw = yaw;
    return c;
  };
  const cast = {};
  const ensureCast = () => {
    if (!cast.vesna) cast.vesna = G.player?.character || spawn('vesna', VESNA_AT, 2.6);
    if (!cast.hanka) cast.hanka = spawn('hanka', HANKA_AT, -0.6);
    return cast;
  };

  // A quiet three-quarter view of the two of them until something plays.
  const idleView = () => {
    if (G.cameraOwner === 'cutscene') return;
    G.camera.position.set(66.5, G.world.heightAt(66.5, 67) + 1.9, 67);
    G.camera.lookAt(61.2, G.world.heightAt(61, 63) + 1.4, 63);
  };

  const api = {
    cast: ensureCast,
    async dialogue(id = '_sample', opts = {}) {
      ensureCast();
      return G.dialogue.start(id, { actors: { vesna: cast.vesna, hanka: cast.hanka }, ...opts });
    },
    async cutscene(id = '_sample') {
      ensureCast();
      return G.cutscenes.play(id, { actors: { vesna: cast.vesna, hanka: cast.hanka } });
    },
    senses() { return setupSenses(G); },
    sheet: (kind, o) => sheet(G, api, kind, o),
  };
  window.__story = api;

  liteStage(G);
  ensureCast();
  if (G.shot && !G.params.get('cam')) idleView();
  const play = G.params.get('play');
  if (play) {
    G.events.once('game:ready', () => {
      if (play === 'dialogue') api.dialogue();
      else if (play === 'cutscene') api.cutscene();
      else if (play === 'senses') api.senses();
      else if (play.startsWith('dialogue:')) api.dialogue(play.slice(9));
      else if (play.startsWith('cutscene:')) api.cutscene(play.slice(9));
    });
  }
}

// Cheap stand-ins when the scene runs with only=story,ui (fast iteration in the harness):
// a local snowy ground patch around the shore stage and the ice camp, plus a sun and sky light.
function liteStage(G) {
  if (!G.terrain) {
    const mk = (cx, cz, size, n) => {
      const geo = new THREE.PlaneGeometry(size, size, n, n);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        const lake = G.world.isLake(x, z);
        pos.setXYZ(i, x, G.world.heightAt(x, z), z);
        const c = lake ? [0.66, 0.78, 0.86] : [0.93, 0.94, 0.96];
        col.set(c, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
      m.receiveShadow = true;
      G.scene.add(m);
    };
    mk(62, 64, 220, 110);
    mk(-62, 2, 160, 64);
    G.scene.background = new THREE.Color(0x9fb3c8);
  }
  if (!G.atmosphere) {
    G.scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x6a5a4a, 1.3));
    const sun = new THREE.DirectionalLight(0xffd9b0, 2.6);
    sun.position.set(40, 30, 110);
    sun.target.position.set(62, 0, 62);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 200 });
    G.scene.add(sun, sun.target);
  }
}

// Trails, clues and an echo spot around the ice-fishing camp, senses forced on.
function setupSenses(G) {
  const S = G.senses;
  if (!S) return null;
  S.addTrail({ id: 'demo_steps', kind: 'footprints', points: [[-57, 17], [-61, 12.5], [-64.5, 9], [-67.5, 6], [-69.5, 4]] });
  S.addTrail({ id: 'demo_drag', kind: 'drag', points: [[-69.5, 3.5], [-67.5, -1], [-63, -6.5], [-56, -12], [-44, -19], [-26, -25], [-4, -29], [8, -30]] });
  S.addTrail({ id: 'demo_scent', kind: 'scent', points: [[-71, 5], [-75, 1], [-77.5, -4], [-78, -10]] });
  // A mitten with a darned thumb, and a knocked-over stool.
  const wool = new THREE.MeshStandardMaterial({ color: 0x6d5a48, roughness: 0.95 });
  const mitten = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 8), wool);
  palm.rotation.z = Math.PI / 2;
  palm.scale.set(1, 1, 0.5);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.06, 4, 6), new THREE.MeshStandardMaterial({ color: 0x9a2e22, roughness: 0.9 }));
  thumb.position.set(0.02, 0, 0.07);
  thumb.rotation.y = 0.8;
  mitten.add(palm, thumb);
  mitten.position.set(-68.4, G.world.heightAt(-68.4, 3.2) + 0.04, 3.2);
  const stool = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 }));
  stool.position.set(-66.6, G.world.heightAt(-66.6, 5.6) + 0.05, 5.6);
  stool.rotation.set(0.2, 0.6, 1.3);
  for (const o of [mitten, stool]) o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  G.scene.add(mitten, stool);
  S.addClue({ id: 'demo_mitten', pos: mitten.position.clone(), object: mitten, label: 'Mitten', line: 'Darned thumb. Somebody loved him.' });
  S.addClue({ id: 'demo_stool', pos: stool.position.clone(), object: stool, label: 'Fishing Stool' });
  S.addClue({ id: 'demo_echo', pos: [-61.5, -3.5], kind: 'echo', label: 'Echo', cutscene: '_sample' });
  S.force(true);
  if (G.cameraOwner !== 'cutscene') {
    G.camera.position.set(-58.8, G.world.heightAt(-58.8, 13.4) + 2.35, 13.4);
    G.camera.lookAt(-67, G.world.heightAt(-67, 2) + 0.2, 0.5);
  }
  return S;
}

// Plays a dialogue or cutscene and builds a contact sheet: one tile per camera setup, drawn
// with the letterbox and the subtitle of the moment, then shows it full screen for capture.
async function sheet(G, api, kind = 'dialogue', { cols = 4, rows = 4, settle = 0.45, page = 0, every = 0 } = {}) {
  const ui = G.story.ui;
  const src = G.renderer.domElement;
  const tiles = [];
  const TW = Math.floor(window.innerWidth / cols), TH = Math.floor((TW * 9) / 16);
  let sub = '';
  const origSub = ui.subtitle;
  ui.subtitle = (name, text, s, o) => { sub = (name ? `${name}: ` : '') + text; origSub(name, text, s, o); };
  const origClear = ui.clearSubtitle;
  ui.clearSubtitle = () => { sub = ''; origClear(); };
  let pending = null, lastInfo = null, lastT = 0;
  G.story.cam.onShot = (info) => { pending = { info, t: G.clock.elapsed }; lastInfo = info; };
  const off = G.addSystem('story-sheet', () => {
    // Long moves (cranes, follows) also get a tile every `every` seconds.
    if (!pending && every > 0 && lastInfo && G.clock.elapsed - lastT > every) pending = { info: { label: `${lastInfo.label} +` }, t: -1e9 };
    if (!pending || G.clock.elapsed - pending.t < settle) return;
    lastT = G.clock.elapsed;
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    const frac = ui.letterboxed ? ui.cinemaFrac() : 1;
    const bar = ((1 - frac) / 2) * c.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, bar);
    g.fillRect(0, c.height - bar, c.width, bar);
    g.font = `${Math.round(TW / 34)}px Georgia, serif`;
    g.fillStyle = '#e9e1d2';
    g.textAlign = 'center';
    if (sub) g.fillText(sub.length > 70 ? `${sub.slice(0, 68)}...` : sub, c.width / 2, c.height - Math.max(5, bar * 0.32));
    g.textAlign = 'left';
    g.fillStyle = '#ffcf96';
    g.font = `${Math.round(TW / 36)}px monospace`;
    g.fillText(`${tiles.length + 1} ${pending.info.label || ''}`, 6, Math.max(14, bar - 4));
    tiles.push(c);
    pending = null;
  }, 0);
  try {
    if (kind === 'dialogue') await api.dialogue();
    else if (kind === 'cutscene') await api.cutscene();
    else if (typeof kind === 'function') await kind();
  } finally {
    off();
    G.story.cam.onShot = null;
    ui.subtitle = origSub;
    ui.clearSubtitle = origClear;
  }
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
  window.__storySheetURL = img.src;
  Object.assign(img.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: 9999, objectFit: 'contain', background: '#111' });
  document.body.appendChild(img);
  await new Promise((r) => { img.onload = r; setTimeout(r, 500); });
  return tiles.length;
}
