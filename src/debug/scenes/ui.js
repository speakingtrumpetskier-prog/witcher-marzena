// UI gallery: fakes G.player, G.quests and G.state data and opens one UI element over a simple
// 3D backdrop so each can be screenshotted.
//
//   ?scene=ui&show=hud|subtitle|choices|journal|map|note|title|hold|credits|pause|settings|card|banner|barks|all
//   &backdrop=day|dusk|night     which backdrop (default depends on show)
//   &real=1|full|0               real=1 loads terrain, sky and ice, full adds trees, locations and weather,
//                                0 forces the fake backdrop (title defaults to real=1)
//   journal: &tab=quests|notes|bestiary &quest=main_straw &index=2 &all=1 (unlock every beast)
//   note:    &note=note_trapper     map: &zoom=2.4 &center=x,z
//   choices: &decisive=1 &timer=12  hold: &holdsim=0.7 (seconds of simulated E)
//   credits: &at=0.55 (scroll progress)   title: &t=40 (seconds into the camera drift)
//
// Example:
//   node scripts/shot.mjs --q "scene=ui&show=subtitle&backdrop=day" --out shots/ui/day.png --wait 2500
import * as THREE from 'three';
import { rng } from '../../core/util.js';
import { createNoise } from '../../core/Noise.js';
import { ROADS } from '../../world/layout.js';

const P = new URLSearchParams(location.search);
const SHOW = P.get('show') || 'hud';
// real=1 loads the light real world (terrain, sky, ice); real=full adds weather, trees and locations.
const REAL = (P.has('real') && P.get('real') !== '0') || (SHOW === 'title' && P.get('real') !== '0');
const FULL = P.get('real') === 'full';

export const needsWorld = true;
export const modules = REAL
  ? (FULL
    ? ['atmosphere', 'sky', 'terrain', 'water', 'rocks', 'weather', 'vegetation', 'locations', 'ui', 'postfx']
    : ['atmosphere', 'sky', 'terrain', 'water', 'ui', 'postfx'])
  : ['ui'];

// ---------------------------------------------------------------------------------------------
// Fake game data
// ---------------------------------------------------------------------------------------------
const E = (text, day = 1) => ({ text, day });

function fakeState(G) {
  const S = G.state;
  S.data.quests = {
    main_pass: { stage: 4, done: true, log: [
      E('Hollow Pass in a blizzard. Kasza hates me. Fair.'),
      E('A family. Tried to leave the valley. The father died looking back over his shoulder.'),
      E('Three wolves. Thin. Hungry things do stupid things. So do I.'),
    ] },
    main_ice: { stage: 5, done: true, log: [
      E('"Something walks the ice at night." Signed H. A careful hand. Somebody practiced that letter.'),
      E('Three fishermen gone. Bread at three grosze. The rite is tomorrow night. The barman says only Hanka writes that fair.'),
      E('The reeve does not want me here. He offered me money to leave. I took it. Money is money.'),
      E('Hanka posted the contract. Her daughter Ola is the maiden they mean to drown. Pay: sixty-one grosze and a wedding ring. I\'ve worked for less. Not often.'),
    ] },
    main_straw: { stage: 2, log: [
      E('Whatever walks the ice walks at night. So I\'ll walk the ice at night.', 1),
      E('Drag marks. Straw. A mitten with a hand-darned thumb.', 1),
    ] },
    side_bird: { stage: 1, log: [
      E('Jarek carved a waxwing for a girl who is three winters dead. He asks me to take it to her. To the ice. I said I\'d see.', 2),
    ] },
    side_wolves: { stage: 3, done: true, log: [
      E('The miller\'s dog is gone and his boy nearly followed. Wolves at the foot of the falls.', 2),
      E('Four wolves and a scarred alpha. Gniewko says his father never let anyone fish near the poles: "Warm water comes up there."', 2),
    ] },
  };
  S.data.discovered = ['village', 'passStart', 'watchtower', 'crossroads', 'iceCamp', 'ritual', 'bellTower', 'idol', 'graveyard', 'island', 'mill', 'tavern', 'longhouse'];
  S.data.notes = ['note_cart_family', 'note_contract', 'note_tally', 'note_hanged', 'note_burner', 'note_drawing', 'note_ledger', 'note_trapper'];
  S.data.inventory = { coins: 61, thaw: 2 };
  S.data.flags = { effigies_fought: true, wolves_fought: true, ...(P.has('all') ? { lair_seen: true } : {}) };
  S.data.stats = { kills: 3 };
  // A trail of explored cells: along the pass road and around the village and the near ice.
  const cells = new Set();
  const CELL = 30, CELLS = Math.ceil(1280 / CELL);
  const mark = (x, z) => {
    const cx = Math.floor((x + 640) / CELL), cz = Math.floor((z + 640) / CELL);
    if (cx >= 0 && cz >= 0 && cx < CELLS && cz < CELLS) cells.add(cz * CELLS + cx);
  };
  for (const rd of ROADS.filter((r) => r.id === 'pass' || r.id === 'village_north' || r.id === 'shore')) {
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1];
      for (let t = 0; t <= 1; t += 0.1) mark(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  for (let a = 0; a < 6.28; a += 0.4) for (const r of [20, 60, 110]) mark(-30 + Math.cos(a) * r, -20 + Math.sin(a) * r);
  S.data.mapTrail = [...cells];
}

function fakePlayer(G) {
  const pos = new THREE.Vector3(-46, 0, 78);
  pos.y = G.world?.heightAt ? G.world.heightAt(pos.x, pos.z) : 0;
  G.player = {
    position: pos, yaw: 0.9, health: 62, maxHealth: 100, stamina: 71, maxStamina: 100, warmth: 0.24,
    signEnergy: 0.7, sign: 'gale', state: 'combat', swordDrawn: true,
  };
  G.quests = {
    tracked: 'main_straw',
    track(id) { this.tracked = id; },
    objectives: () => [
      { questId: 'main_straw', text: 'Search the ice-fishing camp', marker: [-70, 5] },
      { questId: 'side_bird', text: 'Find Jarek', marker: [-15, 54] },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Backdrop: sky dome, layered mountains, snow, pines, a bell tower, a lit window
// ---------------------------------------------------------------------------------------------
const MODES = {
  day: {
    zenith: '#5f8fc9', horizon: '#e9f1f8', sun: '#fff6e0', sunDir: [0.5, 0.32, -0.8], snow: '#f6f5f1', snowFar: '#dfe9f2',
    ridge: ['#8aa2c2', '#a9bdd5', '#c7d6e6'], pine: '#34504f', pineSnow: '#eef3f6', hemi: ['#dfeaff', '#cfd6de', 1.5], dir: ['#fff2d8', 2.2], tower: '#6f6a64', win: 0.0, stars: 0,
  },
  dusk: {
    zenith: '#3b4f7f', horizon: '#f2b57d', sun: '#ffd49a', sunDir: [0.6, 0.12, -0.8], snow: '#e6d7cb', snowFar: '#c4b3b6',
    ridge: ['#6c6f93', '#8d84a0', '#b79aa3'], pine: '#26383e', pineSnow: '#d9cfd0', hemi: ['#8fa6d6', '#a28b84', 1.0], dir: ['#ffb877', 2.4], tower: '#3a3636', win: 1.0, stars: 0.2,
  },
  night: {
    zenith: '#070b1c', horizon: '#243357', sun: '#bcd0ff', sunDir: [-0.5, 0.45, -0.8], snow: '#33466e', snowFar: '#1d2a4a',
    ridge: ['#141d3a', '#1a2547', '#222f55'], pine: '#0a1822', pineSnow: '#455a85', hemi: ['#4a62a0', '#1a2038', 0.9], dir: ['#8fa8e8', 0.8], tower: '#0e131f', win: 1.0, stars: 1,
  },
};

function buildBackdrop(G, modeName) {
  const M = MODES[modeName] || MODES.day;
  const scene = G.scene;
  scene.fog = null;
  scene.background = new THREE.Color(M.horizon);
  const noise = createNoise(55);
  const r = rng(12);

  // sky dome with sun glow and stars
  const sunDir = new THREE.Vector3(...M.sunDir).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      zen: { value: new THREE.Color(M.zenith) }, hor: { value: new THREE.Color(M.horizon) }, sunC: { value: new THREE.Color(M.sun) },
      sunD: { value: sunDir }, stars: { value: M.stars },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 zen, hor, sunC, sunD; uniform float stars;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        float t = clamp(vD.y * 1.6, 0.0, 1.0);
        vec3 c = mix(hor, zen, pow(t, 0.7));
        float s = max(dot(normalize(vD), normalize(sunD)), 0.0);
        c += sunC * (pow(s, 24.0) * 0.55 + pow(s, 400.0) * 1.6);
        vec2 g = floor(vD.xz / max(vD.y, 0.05) * 90.0);
        float st = step(0.9975, h(g)) * stars * smoothstep(0.1, 0.4, vD.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  dome.frustumCulled = false;
  scene.add(dome);

  // snow ground with distance haze and a soft glitter
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { snow: { value: new THREE.Color(M.snow) }, far: { value: new THREE.Color(M.snowFar) }, hor: { value: new THREE.Color(M.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 snow, far, hor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        float d = length(vP.xz - cameraPosition.xz);
        vec3 c = mix(snow, far, smoothstep(20.0, 500.0, d));
        float ripple = sin(vP.x * 0.35 + sin(vP.z * 0.21) * 2.0) * 0.5 + 0.5;
        c *= 0.94 + 0.06 * ripple;
        c += vec3(step(0.996, h(floor(vP.xz * 3.0))) * 0.1) * (1.0 - smoothstep(10.0, 60.0, d));
        c = mix(c, hor, smoothstep(300.0, 1100.0, d));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), groundMat);
  scene.add(ground);

  // mountain ridges in three value bands
  M.ridge.forEach((col, k) => {
    const d = 520 + k * 330 - (2 - k) * 40;
    const shape = new THREE.Shape();
    const W = 2600, n = 90;
    shape.moveTo(-W / 2, -20);
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + (i / n) * W;
      const hh = (110 + k * 80) * (0.45 + 0.55 * Math.abs(noise.fbm2(x * 0.0021 + k * 7, k * 3.3, 4))) + 40 * Math.abs(noise.noise2(x * 0.011, k)) + 30;
      shape.lineTo(x, hh);
    }
    shape.lineTo(W / 2, -20);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, fog: false }));
    mesh.position.set(0, 0, -d);
    scene.add(mesh);
    // snow streaks on the nearer ridges
  });

  // lights
  const hemi = new THREE.HemisphereLight(M.hemi[0], M.hemi[1], M.hemi[2]);
  const sun = new THREE.DirectionalLight(M.dir[0], M.dir[1]);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(hemi, sun);

  // pines: cone stacks with snow caps, clustered left and right with a clearing in the middle
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6).translate(0, 0.7, 0);
  const coneG = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
  const pineMat = new THREE.MeshLambertMaterial({ color: M.pine });
  const snowMat = new THREE.MeshLambertMaterial({ color: M.pineSnow });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#3b2d25' });
  const trees = [];
  for (let i = 0; i < 160; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (14 + Math.pow(r(), 1.4) * 150);
    const z = 10 - Math.pow(r(), 0.7) * 260;
    trees.push([x, z, 5 + r() * 9]);
  }
  const mk = (geo, mat, count) => new THREE.InstancedMesh(geo, mat, count);
  const iTrunk = mk(trunkG, trunkMat, trees.length);
  const iCone = mk(coneG, pineMat, trees.length * 3);
  const iCap = mk(coneG, snowMat, trees.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  trees.forEach(([x, z, hgt], i) => {
    iTrunk.setMatrixAt(i, m4.compose(p3.set(x, 0, z), q, s3.set(1, hgt * 0.18, 1)));
    for (let k = 0; k < 3; k++) {
      const w = (1 - k * 0.27) * hgt * 0.24, hh = hgt * 0.4;
      const y = hgt * 0.16 + k * hgt * 0.27;
      iCone.setMatrixAt(i * 3 + k, m4.compose(p3.set(x, y, z), q, s3.set(w, hh, w)));
      iCap.setMatrixAt(i * 3 + k, m4.compose(p3.set(x, y + hh * 0.34, z), q, s3.set(w * 0.78, hh * 0.7, w * 0.78)));
    }
  });
  scene.add(iTrunk, iCone, iCap);

  // the drowned bell tower and a village glow in the middle distance
  const stone = new THREE.MeshLambertMaterial({ color: M.tower });
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(4, 20, 4), stone);
  shaft.position.y = 10;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 8, 4), stone);
  roof.position.y = 24; roof.rotation.y = Math.PI / 4;
  tower.add(shaft, roof);
  if (M.win) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), new THREE.MeshBasicMaterial({ color: '#ffb060' }));
    win.position.set(0, 15, 2.02);
    tower.add(win);
  }
  tower.position.set(46, 0, -150);
  scene.add(tower);

  const houseMat = new THREE.MeshLambertMaterial({ color: M.tower });
  const roofMat = new THREE.MeshLambertMaterial({ color: M.pineSnow });
  const glow = new THREE.MeshBasicMaterial({ color: '#ffb060' });
  for (let i = 0; i < 9; i++) {
    const hx = -90 + i * 11 + r() * 5, hz = -96 - r() * 22;
    const hw = 5 + r() * 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(hw, 3.4, 5), houseMat);
    b.position.set(hx, 1.7, hz);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(hw * 0.78, 2.6, 4), roofMat);
    rf.position.set(hx, 4.6, hz); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.75;
    scene.add(b, rf);
    if (M.win && r() < 0.7) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), glow);
      w.position.set(hx + (r() - 0.5) * 2, 1.9, hz + 2.52);
      scene.add(w);
    }
  }
  return M;
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------
export async function init(G) {
  const mode = P.get('backdrop') || (['hud', 'subtitle', 'all'].includes(SHOW) ? 'day' : 'dusk');
  G.input.context = 'game';
  fakeState(G);
  fakePlayer(G);
  if (!REAL) {
    buildBackdrop(G, mode);
    G.camera.fov = 52;
    G.camera.updateProjectionMatrix();
    G.camera.position.set(0, 2.2, 14);
    // face north-north-east so the compass shows the ritual site and the bell tower
    G.camera.lookAt(18, 5, -40);
    G.cameraOwner = 'shot';
    // The backdrop is static: stop drawing it after a few frames so software rendering does not
    // starve the page (the canvas keeps its last image, shots stay fast and stable).
    if (!P.has('nofreeze')) {
      let frames = 0;
      G.addSystem('ui-gallery-freeze', () => {
        if (++frames === 8) G.renderer.render = () => {};
      }, 200);
    }
  }
  const ui = G.uiImpl;
  if (SHOW === 'map' && ui) G.readyGates.push(ui.mapView.prepare());

  G.events.once('game:ready', () => run(G, ui));
}

async function run(G, ui) {
  const U = G.ui;
  const num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d);
  switch (SHOW) {
    case 'hud':
      U.hud.show();
      U.notify('Journal updated', 'journal');
      U.notify('New location: Watchtower Ruin', 'location');
      U.notify('+61 grosze', 'coin');
      break;
    case 'subtitle':
    case 'all':
      U.hud.show();
      U.prompt('[E] Read  Notice Board');
      U.subtitle('vesna', 'Three winters and you still salt the path. Optimists.', Infinity);
      U.bark('Zbyszek', 'Wipe your boots. Or don’t. Nobody does.', { x: -2, y: 2.4, z: 1 });
      U.bark('Villager', 'Don’t look at her eyes.', { x: 7, y: 2.2, z: -8 });
      U.notify('Journal updated', 'journal');
      U.notify('New location: Watchtower Ruin', 'location');
      break;
    case 'prompt':
      U.prompt('[E] Talk  Hanka');
      break;
    case 'choices': {
      const dec = P.has('decisive');
      U.hud.hide();
      U.letterbox(true, 0.2);
      U.subtitle('hanka', 'She wants me to look. Doesn’t she.', Infinity);
      const list = dec
        ? [{ t: 'Ola needs you to look now. Not at the ice. At her.', decisive: true }, { t: 'You watched her die and kept singing.', decisive: true }, { t: '(Say nothing.)' }]
        : [{ t: 'Ask about Ola' }, { t: 'Ask about the contract' }, { t: 'Take the ring', decisive: true }, { t: 'Leave' }];
      U.choices(list, { timer: dec ? num('timer', 12) : num('timer', 0) || undefined, decisive: false });
      break;
    }
    case 'journal':
      U.openJournal({ tab: P.get('tab') || 'quests', quest: P.get('quest') || 'main_straw', index: P.has('index') ? parseInt(P.get('index'), 10) : undefined });
      break;
    case 'map': {
      const c = P.get('center');
      U.openMap({ zoom: num('zoom', 1.6), center: c ? c.split(',').map(Number) : undefined });
      break;
    }
    case 'note':
      U.readNote(P.get('note') || 'note_cart_family');
      break;
    case 'title':
      U.title({ startAt: num('t', 0), mood: false });
      break;
    case 'hold': {
      U.hud.hide();
      U.letterbox(true, 0.2);
      U.hold('[Hold E] Look back', 1.2, 5);
      const sim = num('holdsim', 0);
      if (sim > 0) {
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })), 500);
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true })), 500 + sim * 1000);
      }
      break;
    }
    case 'credits': {
      U.credits();
      const at = num('at', 0);
      if (at > 0) {
        setTimeout(() => {
          const c = ui.creditsScreen;
          c.y = (window.innerHeight + 40) + (c.endY - (window.innerHeight + 40)) * at;
          c._apply();
        }, 400);
      }
      break;
    }
    case 'pause':
      U.openPause();
      break;
    case 'settings':
      U.openSettings();
      break;
    case 'card':
      U.titleCard('MARZENA', 'A tale of the long winter', { hold: 60 });
      break;
    case 'banner':
      U.hud.show();
      U.banner('Marzena', 'The south shore', { hold: 600 });
      U.hint([['LMB', 'Light attack'], ['RMB', 'Heavy attack'], ['Space', 'Dodge'], ['Q', 'Cast sign']], 60);
      break;
    case 'barks':
      U.bark('Zbyszek', 'Wipe your boots. Or don’t. Nobody does.', { x: -2, y: 2.4, z: 1 });
      break;
    default:
      break;
  }
}
