// Gallery for the sky spirits (platnicy): one species up close, or the whole sky.
//
//   Close-up of one species (frozen at a pulse phase so stills compare):
//     ?scene=spirits&sp=bell&hour=15.5
//       sp=bell|saucer|lantern|comb|swarm|cathedral
//       phase=0..1   pulse phase (0 relaxed, 0.26 fully contracted), time=S freezes the clock
//       scale=m      bell radius in meters (default: the species' middle size)
//       yaw=rad, d=meters (camera distance), up=deg (camera elevation), y=meters (altitude)
//       n=count      several of the species side by side (sp only)
//   Wide sky (the real population over a flat snow field, camera on the ground):
//     ?scene=spirits&cam=40,6,40&look=40,40,-200&hour=22.5
//       density=N    multiplier on how many are out
// Other params: weather=clear|snow|blizzard, hour. Motion sheets: add &fps=30&speed=4 and --seq 12.
import * as THREE from 'three';
import { createSpirits } from '../../world/Spirits.js';
import { SPECIES_BY_ID } from '../../world/spirits/species.js';

export const modules = ['atmosphere', 'sky', 'weather', 'postfx'];
export const needsWorld = false;

export async function init(G) {
  const p = G.params;
  const num = (k, d) => (Number.isFinite(parseFloat(p.get(k))) ? parseFloat(p.get(k)) : d);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.9 }),
  );
  G.scene.add(ground);

  // dbg=uGlowGain:0.5,uDark:1 overrides shared shader uniforms (tuning aid).
  const dbg = (p.get('dbg') || '').split(',').filter(Boolean).map((kv) => kv.split(':'));
  const applyDbg = () => {
    const sh = G.spirits?.shared;
    if (sh) for (const [k, v] of dbg) if (sh[k]) sh[k].value = parseFloat(v);
  };
  if (dbg.length) G.addSystem('spirits-dbg', applyDbg, 96);

  // speed=N runs the shader clock N times faster (motion contact sheets: the harness renders
  // only a few frames per second, so a full pulse needs a faster clock).
  const speed = num('speed', 1);
  if (speed !== 1) {
    let extra = 0;
    G.addSystem('spirits-speed', (dt) => { extra += dt * (speed - 1); G.uniforms.uTime.value += extra; }, -80);
  }

  const sp = p.get('sp');
  if (sp && SPECIES_BY_ID[sp]) {
    const def = SPECIES_BY_ID[sp];
    const scale = num('scale', (def.size[0] + def.size[1]) / 2);
    const y = num('y', def.id === 'cathedral' ? 330 : Math.max(40, scale * 3));
    const n = Math.max(1, Math.round(num('n', 1)));
    const gap = scale * 3.4;
    const S = createSpirits(G, {
      solo: sp,
      count: n,
      soloPos: [0, y, 0],
      soloScale: scale,
      soloPhase: p.has('phase') ? num('phase', 0) : null,
      soloYaw: num('yaw', 0.4),
      time: p.has('time') ? num('time', 0) : null,
      seed: num('seed', 7),
    });
    // Line the copies up and give each its own look.
    S.items[0].items.forEach((it, i) => {
      it.hx = (i - (n - 1) / 2) * gap;
      it.x = it.hx;
      it.y = it.ySm = y;
      if (i > 0 && !p.has('phase')) it.phase = (i * 0.37) % 1;
    });
    if (G.cameraOwner === 'shot' || !p.has('cam')) {
      const D = num('d', scale * (def.id === 'cathedral' ? 6.5 : def.id === 'swarm' ? 14 : 4.4) * (1 + 0.5 * (n - 1)));
      const up = THREE.MathUtils.degToRad(num('up', -16));
      const cy = y - scale * num('drop', def.id === 'swarm' ? 0 : def.id === 'cathedral' ? 1.2 : 0.9);
      G.camera.position.set(0, cy + Math.sin(up) * D, Math.cos(up) * D);
      G.camera.lookAt(0, cy, 0);
      G.cameraOwner = 'shot';
    }
  } else {
    const S = createSpirits(G, { seed: num('seed', 20260101) });
    if (p.has('density')) S.density = num('density', 1);
    if (!p.has('cam')) {
      G.camera.position.set(40, 6, 40);
      G.camera.lookAt(40, 40, -200);
      G.cameraOwner = 'shot';
    }
  }
}
