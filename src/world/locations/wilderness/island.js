// Stone circle isle (LOC.island): the kit stone circle on the island's flattest crown, carved menhirs, a pale
// ring of runes that glows faintly at night (the place of power, where Ember is empowered), offerings at the
// foot of the stones (bread, bowls, candles that someone still lights), red ribbons tied to the menhirs, and the
// boot prints of a big man crossing the ice from the south shore and back again: Bogdan, twice this winter.
//
// G.world.locations.island:
//   center, altar, power (glow position), noteIsland (carved stone clue, note_island), stones[], offerings[],
//   candles[], bogdanTrail { points, from, to }, approach (south landing), radius
import * as THREE from 'three';
import { LOC } from '../../layout.js';
import { buildings, placeBuilding } from '../../architecture/index.js';
import { Composer, rngOf, smoothPath } from './compose.js';
import { tex, groundPatch, groundRibbon } from './decals.js';

export async function build(W) {
  const { G } = W;
  const L = LOC.island;
  const rnd = rngOf(190);
  const R = 6.6;
  W.clear(L.x, L.z, 30);

  // flattest ring on the crown
  let best = { x: L.x, z: L.z, range: 1e9 };
  for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 20; i++) {
      const h = G.world.heightAt(L.x + dx + Math.cos(i / 20 * 6.283) * R, L.z + dz + Math.sin(i / 20 * 6.283) * R);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo < best.range) best = { x: L.x + dx, z: L.z + dz, range: hi - lo };
  }
  const yaw = 0.3;
  const b = buildings.stoneCircle({ seed: 71, radius: R });
  const p = placeBuilding(G, b, best.x, best.z, yaw, { foundation: false, skirt: false, align: 'avg', lip: -0.1 });
  const cy = p.y;

  // stone positions from the kit colliders (small circles; the altar is the big one at the center)
  const stones = b.colliders.filter((q) => q.type === 'circle' && q.r < 1.0).map((q, i) => {
    const w = p.localToWorld(q.x, 0, q.z);
    return { i, kind: i % 4, x: w.x, z: w.z, r: q.r, lx: q.x, lz: q.z };
  });

  const c = new Composer(G, W.ctx, 'island', best.x, best.z, { seed: 37 });
  // offerings in front of the stones, facing the center
  const offers = [], candles = [];
  const kinds = ['bowl', 'bread', 'candle', 'candle', 'bowl', 'bread', 'candle'];
  stones.filter((_, i) => i % 3 !== 1).slice(0, 7).forEach((s, i) => {
    const cx = best.x - s.x, cz = best.z - s.z, cl = Math.hypot(cx, cz) || 1;
    const px = s.x + (cx / cl) * (s.r + 0.65) + rnd.signed(0.25), pz = s.z + (cz / cl) * (s.r + 0.65) + rnd.signed(0.25);
    const h = c.prop('offering', px, pz, { seed: i + 2, yaw: Math.atan2(cx, cz) + 3.14, opts: { variant: kinds[i % kinds.length] }, dy: 0.0, collide: false });
    offers.push(new THREE.Vector3(px, h.y + 0.1, pz));
    if (kinds[i % kinds.length] === 'candle' && h.anchors.flame) candles.push(h.anchors.flame.clone());
  });
  // red ribbons knotted round the menhirs
  for (const s of stones) {
    if (!rnd.chance(0.55)) continue;
    const gy = G.world.heightAt(s.x, s.z);
    const a = rnd.range(0, 6.283);
    c.at(s.x + Math.cos(a) * s.r * 0.85, s.z + Math.sin(a) * s.r * 0.85, { y: gy + rnd.range(1.3, 2.1) }, (k) => {
      k.hang('ribbon', 0.05, rnd.range(0.4, 0.8), { pos: [0, 0, 0], tint: 0x7a241a, sway: 1.0, wave: 0.04 });
      k.cyl('ribbon', 0.04, 0.04, 0.04, { pos: [0, 0.01, 0], radial: 6, tint: 0x8a2a1e, cap: null, grime: 0 });
    });
  }
  // snow-banked fallen offerings and a few bones of small birds: the stones are visited
  c.build();

  // candle flames: someone still lights them
  for (const f of candles) W.fx?.candle?.({ position: [f.x, f.y, f.z], parent: G.scene, light: false });

  // the ring of runes and the glow of the place of power
  groundPatch(G, { x: best.x, z: best.z, w: R * 2 + 3, d: R * 2 + 3, yaw: 0, map: tex.runeRing(3), opacity: 0.9, lift: 0.07, name: 'runeRing', emissive: 0xaeeaff, emissiveIntensity: 1.3 });
  const altar = p.anchors.altar;
  const power = new THREE.Vector3(altar.x, altar.y + 0.9, altar.z);
  W.fx?.glow?.({ position: [power.x, power.y, power.z], parent: G.scene, size: 3.4, color: [0.42, 0.82, 1.0], strength: 0.9, lamp: false });
  W.fx?.glow?.({ position: [power.x, power.y + 1.6, power.z], parent: G.scene, size: 5.5, color: [0.35, 0.7, 1.0], strength: 0.45, lamp: false });
  W.light({ x: power.x, y: power.y + 0.5, z: power.z, color: 0x8fe0ff, intensity: 1.6, radius: 16, kind: 'ghost' });
  const wisp = W.fx?.wisp?.({ position: [power.x, power.y + 0.2, power.z], parent: G.scene, radius: 0.9, hover: 0.5, color: [0.5, 0.9, 1.0] });
  if (wisp) W.nightOnly(wisp);
  // a faint column of pale light rising from the altar, visible after dusk
  {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 64;
    const g2 = cv.getContext('2d');
    const gr = g2.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#8a8a8a'); gr.addColorStop(0.65, '#262626'); gr.addColorStop(1, '#000000');
    g2.fillStyle = gr; g2.fillRect(0, 0, 4, 64);
    const am = new THREE.CanvasTexture(cv);
    const geo = new THREE.CylinderGeometry(1.0, 2.2, 24, 20, 1, true);
    geo.translate(0, 12, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0, alphaMap: am, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(power.x, power.y - 0.9, power.z);
    beam.name = 'wild:islandBeam';
    beam.renderOrder = 8;
    G.scene.add(beam);
    W.tick(() => { const n = G.uniforms.uNight?.value ?? 0; mat.opacity = 0.17 * Math.min(1, Math.max(0, (n - 0.15) / 0.5)); beam.visible = mat.opacity > 0.005; });
  }

  // note_island: the carved stone nearest the south landing that shows the girl and the hole (kind 0 or 1)
  const south = { x: best.x, z: best.z + R };
  const carved = stones.filter((s) => s.kind <= 1).sort((a, b2) => Math.hypot(a.x - south.x, a.z - south.z) - Math.hypot(b2.x - south.x, b2.z - south.z))[0] || stones[0];
  const dx = best.x - carved.x, dz = best.z - carved.z, dl = Math.hypot(dx, dz) || 1;
  const noteIsland = new THREE.Vector3(carved.x + (dx / dl) * (carved.r + 0.8), G.world.heightAt(carved.x, carved.z) + 1.4, carved.z + (dz / dl) * (carved.r + 0.8));

  // Bogdan's boot prints: from the south shore across the ice, up the slope, to the circle and round it once
  const shore = { x: best.x - 3, z: best.z + 56 };
  const trailPts = smoothPath([[shore.x, shore.z], [best.x - 6, best.z + 40], [best.x - 2, best.z + 26], [best.x + 1, best.z + 14], [best.x + 4, best.z + 8], [best.x + 5, best.z + 2], [best.x + 3, best.z - 4]], 1.4);
  groundRibbon(G, { pts: trailPts, width: 0.7, map: tex.tracks('boot', 4), repeat: 7, lift: 0.04, opacity: 0.85, name: 'bogdanTrail', order: 5 });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.loc('island', {
    id: 'island',
    center: v(best.x, cy, best.z),
    radius: R,
    altar: altar.clone(),
    power,
    noteIsland,
    stones: stones.map((s) => v(s.x, G.world.heightAt(s.x, s.z), s.z)),
    offerings: offers,
    candles,
    approach: v(best.x, G.world.heightAt(best.x, best.z + R + 8), best.z + R + 8),
    bogdanTrail: { points: trailPts, from: v(shore.x, 0, shore.z), to: v(best.x + 3, cy, best.z - 4), kind: 'footprints' },
  });
}
