// Architecture gallery: the whole catalog in rows on snowy ground in readable daylight.
//
//   ?scene=architecture                         overview of everything, rows by kind
//   &show=bellTower,idol                        only these entries (ids from ENTRIES, comma list)
//   &ang=35 &dist=1.1 &h=1.2                    auto camera: orbit yaw (deg, 0 = from +z), distance scale, height scale
//   &hour=17.2                                  time of day (window glow comes on at dusk)
//   &snow=0.5                                   uSnowCover test (0 = thawed)
//   &lights=1                                   add warm point lights from each building's lights metadata
//   &cell=N                                     spacing override
// `only=` is eaten by main.js as a module filter, but is accepted here too as a fallback id list
// (the gallery then supplies its own sun and sky color).
import * as THREE from 'three';
import { buildings } from '../../world/architecture/index.js';
import { placeBuilding } from '../../world/architecture/place.js';

export const modules = ['atmosphere', 'sky', 'postfx'];
export const needsWorld = false;

// id -> factory. Rows group related entries.
export const ENTRIES = [
  { row: 'houses', id: 'logHouse', make: (n) => buildings.logHouse({ seed: 11 + n }) },
  { row: 'houses', id: 'logHouseSmall', make: (n) => buildings.logHouse({ seed: 21 + n, size: 'small' }) },
  { row: 'houses', id: 'logHousePorch', make: (n) => buildings.logHouse({ seed: 31 + n, porch: true }) },
  { row: 'houses', id: 'logHouseTall', make: (n) => buildings.logHouse({ seed: 41 + n, floors: 2, size: 'large', woodshed: true }) },
];

function makeEntries(ids) {
  const list = ids ? ids.map((id) => ENTRIES.find((e) => e.id === id)).filter(Boolean) : ENTRIES;
  return list;
}

function addFallbackLights(G) {
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a8a90, 1.4);
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.0);
  sun.position.set(-60, 70, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -60; sc.right = sc.top = 60; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  G.scene.add(hemi, sun);
  G.scene.background = new THREE.Color(0xb8c8dc);
}

export async function init(G) {
  const P = G.params;
  const hourP = parseFloat(P.get('hour'));
  G.time.hours = Number.isFinite(hourP) ? hourP : 12.5;
  const snow = parseFloat(P.get('snow'));
  if (Number.isFinite(snow)) G.uniforms.uSnowCover.value = snow;
  if (!G.atmosphere) addFallbackLights(G);

  // Ground: wide snow plane with gentle drifts so shadows read.
  const gg = new THREE.PlaneGeometry(1400, 1400, 70, 70);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, Math.sin(x * 0.07) * Math.cos(z * 0.06) * 0.06 + Math.sin(x * 0.19 + z * 0.13) * 0.025 - 0.02);
  }
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0xe9eef5, roughness: 0.95 }));
  ground.receiveShadow = true;
  ground.name = 'gallery-ground';
  G.scene.add(ground);

  const showP = P.get('show') || P.get('only');
  const ids = showP ? showP.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const entries = makeEntries(ids);
  const placed = [];
  const rows = new Map();
  for (const e of entries) {
    if (!rows.has(e.row)) rows.set(e.row, []);
    rows.get(e.row).push(e);
  }
  const cellP = parseFloat(P.get('cell'));
  let zRow = 0;
  const t0 = performance.now();
  const report = [];
  for (const [, list] of rows) {
    let x = 0, rowDepth = 0;
    const items = [];
    for (const e of list) {
      const b = e.make(0);
      const fp = b.footprint || { hw: 5, hd: 5 };
      const rad = Math.max(fp.hw, fp.hd) + 4;
      const cell = Number.isFinite(cellP) ? cellP : rad * 2;
      items.push({ e, b, cell });
      rowDepth = Math.max(rowDepth, rad * 2);
    }
    const total = items.reduce((a, it) => a + it.cell, 0);
    x = -total / 2;
    for (const it of items) {
      x += it.cell / 2;
      const px = ids ? 0 : x, pz = ids ? 0 : zRow;
      const yaw = it.e.yaw ?? 0;
      placeBuilding(G, it.b, px, pz, yaw, { snap: false, y: 0, foundation: false, skirt: it.e.skirt ?? true });
      placed.push({ ...it, x: px, z: pz });
      report.push(`${it.e.id}: ${it.b.stats.calls} calls, ${Math.round(it.b.stats.triangles)} tris`);
      x += it.cell / 2;
      if (ids) break;
    }
    zRow += rowDepth;
    if (ids) break;
  }
  console.log('[architecture gallery]', `${(performance.now() - t0).toFixed(0)}ms build`, report.join(' | '));

  // Optional lights from metadata.
  if (P.get('lights') === '1') {
    for (const p of placed) {
      for (const l of p.b.lights) {
        if (l.kind !== 'hearth' && l.kind !== 'forge' && l.kind !== 'lantern') continue;
        const pl = new THREE.PointLight(l.color, 12 * l.intensity, l.radius * 1.6, 1.6);
        pl.position.set(l.wx ?? l.x, l.wy ?? l.y, l.wz ?? l.z);
        G.scene.add(pl);
      }
    }
  }

  // Auto camera for a single entry, or an overview for everything.
  const cam = G.camera;
  const ang = (parseFloat(P.get('ang') ?? '30') * Math.PI) / 180;
  const dist = parseFloat(P.get('dist') ?? '1');
  const hs = parseFloat(P.get('h') ?? '1');
  if (ids && placed.length) {
    const box = new THREE.Box3().setFromObject(placed[0].b.group);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const R = (Math.max(size.x, size.z) * 0.85 + size.y * 0.7) * dist + 2;
    cam.position.set(ctr.x + Math.sin(ang) * R, box.min.y + (2.0 + size.y * 0.1) * hs, ctr.z + Math.cos(ang) * R);
    cam.lookAt(ctr.x, box.min.y + size.y * 0.42, ctr.z);
    cam.fov = 45; cam.updateProjectionMatrix();
  } else {
    const spanX = Math.max(...placed.map((p) => Math.abs(p.x))) + 12;
    cam.position.set(0, zRow * 0.55 + 28, zRow * 0.45 + spanX * 0.9 + 30);
    cam.lookAt(0, 3, zRow * 0.3);
  }
}
