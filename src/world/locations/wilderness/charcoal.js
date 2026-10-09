// Charcoal burners' camp (LOC.charcoal): three cold kilns (kit) in a loose triangle on soot-black ground,
// the burners' hut, and boards planted all over the camp scrawled with THE LAKE SINGS in charcoal (note_burner):
// the lines grow smaller and stranger, the last board stops mid-word. The third kiln carries a padlocked
// iron-strapped hatch in its mound: the smuggler's stash (his key opens it).
//
// G.world.locations.charcoal:
//   kilns[3] { x, z }, hut, boards { main (note_burner), whisper, answer, broken }, stash (hatch, kiln 3), hatch (Group: rotate to open),
//   hatchOpen(t), stashInside (where the loot sits), fire
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf } from './compose.js';
import { coldFire } from './objects2.js';
import { tex, groundPatch, scrawlBoard } from './decals.js';
import { Kit } from '../../props/kit.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.charcoal;
  const rnd = rngOf(330);
  W.clear(L.x, L.z, 18);
  const kilnDefs = [
    { x: L.x, z: L.z, yaw: 0.2, hut: true, seed: 231 },
    { x: L.x + 13, z: L.z - 9, yaw: 2.0, hut: false, seed: 232 },
    { x: L.x + 11, z: L.z + 13, yaw: 4.0, hut: false, seed: 233 },
  ];
  const kilns = kilnDefs.map((d) => {
    const b = buildings.charcoalKiln({ seed: d.seed, hut: d.hut });
    const p = placeBuilding(G, b, d.x, d.z, d.yaw, { foundation: true, skirt: false, tag: 'charcoalKiln' });
    return { ...d, placed: p };
  });

  // soot ground round the kilns and the burners' work paths
  const soot = tex.blob('soot', { r: 28, g: 25, b: 22, a: 0.95, seed: 12, speck: 0.3, size: 256 });
  for (const k of kilns) groundPatch(G, { x: k.x, z: k.z, w: 15, d: 13, yaw: k.yaw, map: soot, opacity: 0.9, lift: 0.07, name: 'sootGround' });
  groundPatch(G, { x: L.x + 6, z: L.z + 2, w: 22, d: 16, yaw: 0.5, map: soot, opacity: 0.5, lift: 0.065, name: 'sootGround' });

  // ---- scrawled boards -----------------------------------------------------------------------------------------
  const boardDefs = [
    { id: 'main', at: [L.x - 8.2, L.z + 5.8], yaw: 0.9 + 0.2, w: 1.6, h: 0.9, y: 0.55, lines: [{ t: 'THE LAKE', fs: 1.0 }, { t: 'SINGS', fs: 1.0 }, { t: 'THE LAKE SINGS', fs: 0.6 }], size: 78, seed: 2 },
    { id: 'whisper', at: [L.x + 3.5, L.z + 6.5], yaw: 0.35, w: 1.4, h: 0.8, y: 0.3, lines: [{ t: 'she sings it', fs: 0.8 }, { t: 'backwards at night', fs: 0.8 }, { t: 'THE LAKE SINGS', fs: 0.7 }], size: 70, seed: 5 },
    { id: 'answer', at: [L.x + 6.8, L.z - 3.4], yaw: -0.6, w: 1.0, h: 0.55, y: 0.45, lines: [{ t: 'do not', fs: 1.0 }, { t: 'answer', fs: 1.0 }], size: 84, seed: 8 },
    { id: 'broken', at: [L.x + 18.0, L.z + 1.5], yaw: 1.7, w: 1.1, h: 0.4, y: 0.7, lines: [{ t: 'THE LAKE', fs: 1.0 }], size: 90, seed: 11 },
  ];
  const boards = {};
  const c = new Composer(G, W.ctx, 'charcoal', L.x, L.z, { seed: 33 });
  for (const d of boardDefs) {
    const [x, z] = d.at;
    const gy = G.world.heightAt(x, z);
    const m = scrawlBoard(G, { lines: d.lines, w: d.w, h: d.h, paper: d.id === 'broken' ? '#7a6a54' : '#6a5844', ink: '#14100c', size: d.size, seed: d.seed, canvasW: 512, canvasH: Math.round(512 * d.h / d.w) });
    m.position.set(x, gy + d.y, z);
    m.rotation.set(rnd.signed(0.05), d.yaw, rnd.signed(0.06));
    c.scene(m);
    // two stakes behind it, a frost cap
    c.at(x, z, { yaw: d.yaw }, (k) => {
      for (const sx of [-1, 1]) k.cyl('wood', 0.025, 0.035, d.y + d.h + 0.25, { pos: [sx * (d.w / 2 - 0.08), (d.y + d.h + 0.25) / 2, -0.06], rot: [0, 0, sx * 0.03], radial: 5, tint: 0x8a7a68, cap: 'logEnd' });
      k.mound(d.w * 0.9, 0.05, 0.12, { pos: [0, d.y + d.h + 0.02, -0.02], jseed: 3 });
      k.mound(0.7, 0.08, 0.4, { pos: [0, 0, 0.1], jseed: 5 });
    });
    boards[d.id] = new THREE.Vector3(x, gy + d.y + d.h / 2, z);
  }

  // ---- camp dressing --------------------------------------------------------------------------------------------
  const fp = { x: L.x - 3.5, z: L.z + 7.5 };
  c.at(fp.x, fp.z, { yaw: 0.4 }, (k) => coldFire(k, { r: 0.7 }));
  c.prop('logs', L.x - 5.5, L.z + 8.8, { seed: 2, yaw: 1.2, opts: { count: 1, length: 1.5 } });
  c.prop('sled', L.x + 4.5, L.z + 10.5, { seed: 1, yaw: 0.9, opts: { variant: 'wood' } });
  c.prop('wheelbarrow', L.x - 1.5, L.z - 6.5, { seed: 1, yaw: 0.5, opts: { variant: 'empty' } });
  c.prop('tools', L.x - 9.6, L.z - 1.8, { seed: 1, yaw: Math.PI / 2 + 0.9 });
  c.prop('barrel', L.x + 2.4, L.z - 4.2, { seed: 4, opts: { variant: 'salt' } });
  c.prop('bucket', L.x + 1.4, L.z - 3.6, { seed: 2, rot: [0, 0, 1.4], dy: 0.2 });
  // charcoal sacks: slumped, split, soot-black
  for (let i = 0; i < 6; i++) {
    const x = L.x + 8 + rnd.signed(1.4) + (i % 3) * 0.5, z = L.z + 5 + rnd.signed(0.8) + (i / 3 | 0) * 0.6;
    c.at(x, z, { yaw: rnd.range(0, 6.28) }, (k) => {
      k.blob('burlap', 0.28, { pos: [0, 0.22 + (i / 3 | 0) * 0.28, 0], scale: [1.0, 0.85, 1.5], detail: 1, tint: rnd.pick([0x34302a, 0x2a2622, 0x3e3a32]), jitter: 0.03, grime: 0.2 });
      if (i % 2 === 0) k.mound(0.5, 0.05, 0.4, { pos: [0, 0.5 + (i / 3 | 0) * 0.28, 0], jseed: i });
    });
  }
  c.build();

  // ---- the third kiln's hatch: padlocked, iron strapped, in the mound's flank ------------------------------------
  const K3 = kilns[2];
  const toC = { x: L.x - K3.x, z: L.z - K3.z };
  const tl = Math.hypot(toC.x, toC.z);
  const dir = { x: toC.x / tl, z: toC.z / tl };
  const hatchPos = { x: K3.x + dir.x * 2.28, z: K3.z + dir.z * 2.28 };
  const hy = G.world.heightAt(hatchPos.x, hatchPos.z);
  const hatch = new THREE.Group();
  hatch.name = 'wild:kilnHatch';
  const hatchYaw = Math.atan2(dir.x, dir.z);
  {
    const k = new Kit('kilnHatch', { seed: 13 });
    // frame stones and the dark opening are static; the door is the pivoting group
    k.box('stone', 1.05, 0.12, 0.22, { pos: [0, 0.94, -0.02], tint: 0x9a948e, grime: 0.3 });
    for (const sx of [-1, 1]) k.box('stone', 0.14, 0.95, 0.22, { pos: [sx * 0.55, 0.47, -0.02], tint: 0x8a847e, grime: 0.3 });
    k.box('matte', 0.96, 0.84, 0.05, { pos: [0, 0.44, -0.1], tint: 0x08070a, grime: 0, var: 0 });
    const frame = k.build();
    hatch.add(frame);
    const kd = new Kit('kilnDoor', { seed: 14 });
    for (let i = 0; i < 5; i++) kd.box('planks', 0.19, 0.84, 0.05, { pos: [-0.38 + i * 0.19, 0.44, 0.04], tint: rnd.pick([0x5a4a3a, 0x4e4034, 0x66564a]), grime: 0.4 });
    for (const y of [0.2, 0.68]) kd.box('iron', 0.98, 0.07, 0.03, { pos: [0, y, 0.075], tint: 0x34302c, grime: 0.1 });
    kd.box('iron', 0.14, 0.17, 0.05, { pos: [0.3, 0.44, 0.1], tint: 0x4a4540, grime: 0.1 }); // padlock body
    kd.torus('iron', 0.04, 0.012, { pos: [0.3, 0.55, 0.1], rot: [0, 0, 0], seg: 8, rseg: 3, tint: 0x4a4540, grime: 0 });
    kd.mound(0.8, 0.04, 0.2, { pos: [0, 0.86, 0.04], jseed: 2 });
    const door = kd.build();
    const pivot = new THREE.Group();
    pivot.position.set(-0.5, 0, 0.02);
    door.position.set(0.5, 0, 0);
    pivot.add(door);
    hatch.add(pivot);
    hatch.userData.pivot = pivot;
  }
  hatch.position.set(hatchPos.x, hy - 0.05, hatchPos.z);
  hatch.rotation.y = hatchYaw;
  G.scene.add(hatch);
  const hatchOpen = (t) => { hatch.userData.pivot.rotation.y = -t * 1.9; };
  // inside the hatch (revealed when it opens): a dry sack, a keg and a purse
  const stashInside = new THREE.Vector3(hatchPos.x - dir.x * 0.9, hy + 0.3, hatchPos.z - dir.z * 0.9);

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('charcoal', {
    id: 'charcoal',
    kilns: kilns.map((k) => ({ x: k.x, z: k.z, placed: k.placed })),
    hut: kilns[0].placed.anchors.hut.clone(),
    boards,
    note: boards.main.clone(), // note_burner
    stash: v(hatchPos.x, hy + 0.5, hatchPos.z),
    hatch,
    hatchOpen,
    stashInside,
    fire: v(fp.x, G.world.heightAt(fp.x, fp.z), fp.z),
  });
}
