// Watchtower ruin (LOC.watchtower): the reveal. The kit ruin on the ridge with its tally wall, the stash under
// a loose stone and the exterior stairs up to the viewpoint over the whole valley. Dressed as the soldiers'
// last post: a cold fire pit with log seats, a rack of spears (one head snapped), Kazimierz's dice on a
// flat stone, a crate, a rag banner, a stack of split wood gone grey, scrawled lines under the tallies.
//
// G.world.locations.watchtower:
//   placed (the kit placement), tally (note_tally clue), stash (loose stone), vista (viewpoint standing spot),
//   vistaEdge (the open rail gap), door, inside, crest (road point where the storm breaks, C2 start), yawToValley,
//   dice, campfire (cold), banner
import * as THREE from 'three';
import { LOC, ROADS } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rot2 } from './compose.js';
import { coldFire, spearRack, diceTable } from './objects2.js';
import { scrawlDecal } from './decals.js';
import { nearestOnPolyline } from '../../../core/util.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.watchtower;
  W.clear(L.x, L.z, 15);
  const yaw = 0;
  const b = buildings.watchtowerRuin({ seed: 201 });
  const p = placeBuilding(G, b, L.x, L.z, yaw, { foundation: true });
  const y0 = p.y;
  const loc = (lx, ly, lz) => p.localToWorld(lx, ly, lz);

  // ---- scrawl under the tally marks (north wall, inside) ------------------------------------------
  {
    const HO = 2.9, HI = 1.9;
    const zi = -(HO - (HO - HI)) + 0.06;
    const note = scrawlDecal(G, {
      lines: [{ t: 'COLD. WOLVES. COLD. BORED.', fs: 1.0 }, { t: 'KAZIMIERZ WAS HERE AND IS BETTER AT DICE THAN YOU', fs: 0.5 }],
      w: 2.3, h: 0.5, ink: '#ddd8c8', size: 52, seed: 6, canvasW: 1024, canvasH: 220,
    });
    const w = loc(-0.2, 0.62, zi + 0.075);
    note.position.copy(w);
    note.rotation.y = yaw;
    G.scene.add(note);
  }

  // ---- the watch's camp, south side outside the door ----------------------------------------------------
  const c = new Composer(G, W.ctx, 'watchtower', L.x, L.z, { seed: 29 });
  const spot = (lx, lz) => { const [dx, dz] = rot2(lx, lz, yaw); return { x: L.x + dx, z: L.z + dz }; };
  const fp = spot(-2.8, 6.6);
  c.at(fp.x, fp.z, { yaw: 0.3 }, (k) => coldFire(k, { r: 0.62 }));
  for (const [lx, lz, s] of [[-4.5, 6.5, 0.6], [-1.2, 7.7, 1.2], [-2.6, 4.9, -0.3]]) {
    const q = spot(lx, lz);
    c.prop('logs', q.x, q.z, { seed: s * 3 | 0, yaw: s, opts: { count: 1, length: 1.6 } });
  }
  const dt = spot(-4.8, 4.2);
  c.at(dt.x, dt.z, { yaw: 0.6 }, (k) => diceTable(k));
  const cr = spot(-5.7, 5.4);
  c.prop('crate', cr.x, cr.z, { seed: 2, yaw: 0.3, opts: { variant: 'open' } });
  const sr = spot(4.8, 5.8);
  c.at(sr.x, sr.z, { yaw: -0.4 }, (k) => spearRack(k));
  c.circle(sr.x, sr.z, 0.9, y0 - 1, y0 + 2, 'spear rack');
  const wp = spot(6.5, 2.0);
  c.prop('woodpile', wp.x, wp.z, { seed: 1, yaw: Math.PI / 2 });
  c.prop('barrel', spot(5.4, 7.3).x, spot(5.4, 7.3).z, { seed: 2, opts: { variant: 'open' } });
  c.prop('bucket', spot(-5.0, 7.6).x, spot(-5.0, 7.6).z, { seed: 3, rot: [0, 0, 1.4], dy: 0.1 });
  c.prop('bones', spot(-7.4, 3.0).x, spot(-7.4, 3.0).z, { seed: 2, yaw: 1.1 }); // a hare the garrison ate, long ago
  c.build();

  // ---- anchors -----------------------------------------------------------------------------------------
  const road = ROADS.find((r) => r.id === 'pass');
  // The pass road runs right past the ruin, so its nearest point is inside the walls: C2 staged Vesna, Kasza
  // and its cameras in the masonry. The crest is the first road point 13 m on from there toward the village
  // (the pass road's points run from the pass down to the village), out in the open with the valley ahead.
  void nearestOnPolyline;
  let cx = L.x, cz = L.z;
  {
    const pts = road.pts, samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    let best = 0, bd = Infinity;
    samples.forEach(([x, z], i) => { const d = Math.hypot(x - L.x, z - L.z); if (d < bd) { bd = d; best = i; } });
    for (let i = best; i < samples.length; i++) {
      if (Math.hypot(samples[i][0] - L.x, samples[i][1] - L.z) >= 13) { [cx, cz] = samples[i]; break; }
    }
  }
  const toLake = { x: LAKE_X - cx, z: LAKE_Z - cz };
  const yawToValley = Math.atan2(toLake.x, toLake.z);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const A = p.anchors;
  W.interior({ id: 'watchtower', polygon: [[L.x - 1.8, L.z - 1.8], [L.x + 1.8, L.z - 1.8], [L.x + 1.8, L.z + 1.8], [L.x - 1.8, L.z + 1.8]], env: 'room' });
  W.loc('watchtower', {
    id: 'watchtower',
    placed: p,
    walk: p.walk,
    tally: A.tally.clone(), // note_tally
    stash: A.stash.clone(), // loose stone, a dark gap behind it
    vista: A.vista.clone(), // standing spot on the viewpoint deck
    vistaEdge: loc(2.4, p.walk.floors.find((f) => f.tag === 'viewpoint')?.y - y0 || 6.7, -4.2),
    door: A.door.clone(),
    inside: A.inside.clone(),
    stairs: A.stairs.clone(),
    crest: v(cx, G.world.heightAt(cx, cz), cz), // where the blizzard breaks (C2)
    yawToValley,
    dice: v(dt.x, c.ground(dt.x, dt.z) + 0.45, dt.z),
    campfire: v(fp.x, c.ground(fp.x, fp.z), fp.z),
  });
}

const LAKE_X = 40, LAKE_Z = -120;
