// Character gallery. Snowy ground, its own key/fill/rim light (works without the atmosphere
// module), shadows on.
//
//   ?scene=characters                         lineup: main cast + a sample of villagers
//   &set=villagers | children | all            other lineups
//   &preset=vesna&clip=walk                    one character, one clip (locomotion clips move)
//   &close=1                                   face close-up camera (tracks the head)
//   &mid=1&preset=hanka&preset2=vesna          dialogue mid-shot, two characters facing, talking
//   &strip=8&clip=attack_1                     N frozen copies across the clip (filmstrip)
//   &face=smile:0.8,browUp:0.5   &talk=1  &lookcam=1  &yaw=0.6  &t=0.4 (clip start time)
//   &views=1 (front, 3/4, side, back of one preset)  &atmo=1 (load atmosphere, sky, postfx)
//   &slope=1 (sloped ground to test foot planting)  &speed=2.5 (locomotion speed)
import * as THREE from 'three';

const qs = new URLSearchParams(location.search);
export const modules = qs.has('atmo') ? ['atmosphere', 'sky', 'postfx', 'characters'] : ['characters'];

const LINEUPS = {
  main: ['vesna', 'ola', 'hanka', 'bogdan', 'dobra', 'zbyszek', 'jarek', 'wiesia_ghost', 'miller', 'miller_wife'],
  villagers: ['villager_m_1', 'villager_f_1', 'villager_m_2', 'villager_f_2', 'villager_m_3', 'villager_f_3', 'elder_m', 'elder_f', 'fisherman_1', 'fisherman_2', 'villager_m_4', 'villager_f_4'],
  children: ['child_a', 'child_b', 'child_c', 'child_d', 'child_e', 'child_f', 'ola'],
  sample: ['vesna', 'ola', 'hanka', 'bogdan', 'dobra', 'zbyszek', 'jarek', 'wiesia_ghost', 'miller', 'miller_wife', 'villager_m_1', 'villager_f_2', 'elder_f', 'child_b', 'fisherman_1'],
};

export async function init(G) {
  const P = G.params;
  const C = G.characters;
  const slope = P.has('slope') ? 0.18 : 0;
  const groundY = (x, z) => slope * z + (slope ? Math.sin(x * 1.3) * 0.08 : 0);
  C.heightAt = groundY;
  setupStage(G, P, slope, groundY);

  const preset = P.get('preset');
  const clip = P.get('clip');
  const tStart = parseFloat(P.get('t') || '0');
  const stepDt = parseFloat(P.get('animStep'));
  const face = (P.get('face') || '').split(',').filter(Boolean).map((s) => s.split(':'));
  const apply = (c) => {
    for (const [k, v] of face) c.expression(k, parseFloat(v || '1'), 0);
    if (P.has('talk')) c.talk(true);
  };
  const camRig = { mode: 'fixed', target: null, offset: new THREE.Vector3(), look: new THREE.Vector3() };
  G.gallery = { chars: [], camRig };

  if (P.has('mid')) {
    const a = C.create(preset || 'hanka');
    const b = C.create(P.get('preset2') || 'vesna');
    a.setPosition(-0.55, 0); a.yaw = Math.PI / 2;
    b.setPosition(0.55, 0); b.yaw = -Math.PI / 2;
    G.scene.add(a.root, b.root);
    a.lookAt(b.bones.head); b.lookAt(a.bones.head);
    a.talk(true);
    if (clip) a.play(clip, { loop: true });
    apply(a);
    b.expression('browDown', 0.25);
    G.gallery.chars.push(a, b);
    const hy = Math.max(a.bones.head.getWorldPosition(new THREE.Vector3()).y, 1.4);
    // over Vesna's shoulder toward the speaker, waist up
    G.camera.position.set(1.55, hy - 0.05, 1.25);
    G.camera.lookAt(-0.35, hy - 0.22, 0);
    G.camera.fov = 32;
  } else if (P.has('strip')) {
    const n = parseInt(P.get('strip'), 10) || 8;
    const id = preset || 'vesna';
    const name = clip || 'attack_1';
    const sp = parseFloat(P.get('spacing') || '1.15');
    for (let i = 0; i < n; i++) {
      const c = C.create(id);
      c.setPosition((i - (n - 1) / 2) * sp, 0);
      c.yaw = parseFloat(P.get('yaw') || '0');
      G.scene.add(c.root);
      const clipObj = G.characters.clips().includes(name) ? name : 'idle';
      c.play(clipObj, { loop: true, fade: 0, speed: 0.0001, start: 0 });
      // freeze at i/n of the clip
      c._stripT = (i / n);
      if (P.has('sword')) c._setSword(true);
      c._stripClip = clipObj;
      G.gallery.chars.push(c);
    }
    G.addSystem('strip', () => {
      for (const c of G.gallery.chars) {
        const st = c.anim.base[c.anim.base.length - 1];
        if (st && st.clip) { st.t = c._stripT * st.clip.dur; st.speed = 0; }
      }
    }, 49);
    const close = P.has('near') ? 0.62 : 1;
    G.camera.position.set(0, 1.1, (3.2 + n * 0.62) * close);
    G.camera.lookAt(0, 0.95, 0);
    G.camera.fov = 34;
  } else if (preset) {
    const views = P.has('views') ? [0, 0.6, Math.PI / 2, Math.PI] : [parseFloat(P.get('yaw') || '0')];
    views.forEach((yaw, i) => {
      const c = C.create(preset);
      c.setPosition((i - (views.length - 1) / 2) * 0.95, 0);
      c.yaw = yaw;
      G.scene.add(c.root);
      apply(c);
      G.gallery.chars.push(c);
    });
    const c = G.gallery.chars[0];
    const loco = { walk: 1.35, run: 3.5, sprint: 6, walk_cold: 1.1 };
    if (clip && loco[clip] !== undefined) {
      const v = parseFloat(P.get('speed') || String(loco[clip]));
      if (clip === 'walk_cold') c.locoSet({ idle: 'idle_cold', walk: 'walk_cold' });
      c.yaw = Math.PI / 2;
      c.setLocomotion(v);
      c.speed = v;
      camRig.mode = 'follow';
      camRig.target = c;
      if (P.has('still')) camRig.mode = 'fixed';
      else G.addSystem('gallery-move', (dt) => {
        if (stepDt > 0) dt = stepDt;
        c.root.position.x += Math.sin(c.yaw) * c.speed * dt;
        c.root.position.z += Math.cos(c.yaw) * c.speed * dt;
        if (c.root.position.x > 30) c.root.position.x = -30;
      }, 40);
    } else if (clip) {
      if (clip === 'idle_cold') c.locoSet({ idle: 'idle_cold' });
      else if (clip !== 'idle') for (const ch of G.gallery.chars) ch.play(clip, { loop: true, start: tStart });
    }
    if (P.has('lookcam')) for (const ch of G.gallery.chars) ch.lookAt(G.camera);
    const H = c.height;
    if (P.has('close')) {
      camRig.mode = 'face';
      camRig.target = c;
      G.camera.fov = 26;
    } else {
      const far = views.length > 1 ? 4.8 : 3.4;
      G.camera.position.set(0, H * 0.55, far * (H / 1.75));
      G.camera.lookAt(0, H * 0.5, 0);
      G.camera.fov = 32;
      if (camRig.mode === 'follow') { camRig.offset.set(0.9, H * 0.08, 3.6); camRig.look.set(0, H * 0.5, 0); }
    }
  } else {
    const ids = LINEUPS[P.get('set') || 'sample'] || LINEUPS.sample;
    const sp = 0.95;
    ids.forEach((id, i) => {
      const c = C.create(id);
      const row = ids.length > 10 ? (i < Math.ceil(ids.length / 2) ? 0 : 1) : 0;
      const inRow = row === 0 ? Math.ceil(ids.length / 2) : ids.length - Math.ceil(ids.length / 2);
      const k = row === 0 ? i : i - Math.ceil(ids.length / 2);
      const n = ids.length > 10 ? inRow : ids.length;
      c.setPosition((k - (n - 1) / 2) * sp + row * 0.45, -row * 1.6);
      c.yaw = (Math.random() - 0.5) * 0.3;
      G.scene.add(c.root);
      if (c.look.loco?.idle === 'idle_cold') c.locoSet({ idle: 'idle_cold' });
      G.gallery.chars.push(c);
    });
    const two = ids.length > 10;
    G.camera.position.set(0, two ? 2.4 : 1.6, two ? 9.5 : 7.8);
    G.camera.lookAt(0, two ? 0.75 : 0.95, -0.8);
    G.camera.fov = 36;
  }
  G.camera.updateProjectionMatrix();

  // Camera rig for follow / face modes (the harness 'cam' param overrides everything).
  if (!P.has('cam') && camRig.mode !== 'fixed') {
    G.cameraOwner = 'gallery';
    const head = new THREE.Vector3();
    G.addSystem('gallery-cam', () => {
      const c = camRig.target;
      if (!c) return;
      c.root.updateMatrixWorld(true);
      if (camRig.mode === 'face') {
        c.bones.head.getWorldPosition(head);
        head.y += 0.075 * c.M.headK;
        const fwd = new THREE.Vector3(Math.sin(c.yaw + 0.35), 0, Math.cos(c.yaw + 0.35));
        G.camera.position.copy(head).addScaledVector(fwd, 0.62).add(new THREE.Vector3(0, 0.01, 0));
        G.camera.lookAt(head.x, head.y - 0.012, head.z);
      } else {
        const p = c.root.position;
        G.camera.position.set(p.x + camRig.offset.x, p.y + camRig.offset.y + 1.0, p.z + camRig.offset.z);
        G.camera.lookAt(p.x + camRig.look.x, p.y + camRig.look.y, p.z + camRig.look.z);
      }
    }, 81);
  }
  void tStart;
}

function setupStage(G, P, slope, groundY) {
  const atmo = P.has('atmo');
  G.scene.background = new THREE.Color(0x9fb0c4);
  G.scene.fog = new THREE.FogExp2(0x9fb0c4, 0.001);
  if (!atmo) {
    const hemi = new THREE.HemisphereLight(0xc4d6f0, 0x8a8478, 1.15);
    const key = new THREE.DirectionalLight(0xffdcb4, 2.7);
    key.position.set(4, 5, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(G.shot ? 1024 : 2048, G.shot ? 1024 : 2048);
    const sc = key.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 0.5; sc.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0xaecbff, 1.5);
    rim.position.set(-5, 4, -6);
    G.scene.add(hemi, key, key.target, rim);
    G.galleryLights = { hemi, key, rim };
    // keep the key light around the subject for follow cams
    G.addSystem('gallery-light', () => {
      const t = G.gallery?.camRig?.target;
      const p = t ? t.root.position : new THREE.Vector3();
      key.position.set(p.x + 4, p.y + 5, p.z + 6);
      key.target.position.copy(p);
    }, 85);
  }
  // snow ground with visible texture so foot sliding would show
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#e9eef4';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v - 12},${v - 4},${v + 4},0.35)`;
    const r = 1 + Math.random() * 6;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(150,170,195,0.25)';
    g.lineWidth = 2 + Math.random() * 4;
    g.beginPath();
    const y = Math.random() * 512;
    g.moveTo(0, y); g.bezierCurveTo(170, y + 20, 340, y - 20, 512, y + Math.random() * 10); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(80, 80, slope ? 80 : 1, slope ? 80 : 1);
  geo.rotateX(-Math.PI / 2);
  if (slope) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.92 }));
  ground.receiveShadow = true;
  G.scene.add(ground);
}
