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
  { row: 'houses', id: 'logHouseGallery', make: (n) => buildings.logHouse({ seed: 51 + n, gallery: true, size: 'large' }) },
  { row: 'houses', id: 'logHouseTall', make: (n) => buildings.logHouse({ seed: 41 + n, floors: 2, size: 'large', woodshed: true }) },
  { row: 'big', id: 'tavern', make: () => buildings.tavern({ seed: 5 }) },
  { row: 'big', id: 'longhouse', make: () => buildings.longhouse({ seed: 9 }) },
  { row: 'big', id: 'smithy', make: () => buildings.smithy({ seed: 21 }) },
  { row: 'farm', id: 'granary', make: () => buildings.granary({ seed: 3 }) },
  { row: 'farm', id: 'barn', make: () => buildings.barn({ seed: 4 }) },
  { row: 'farm', id: 'stable', make: () => buildings.stable({ seed: 6 }) },
  { row: 'farm', id: 'shed', make: () => buildings.shed({ seed: 8 }) },
  { row: 'farm', id: 'outhouse', make: () => buildings.outhouse({ seed: 12 }) },
  { row: 'farm', id: 'boathouse', make: () => buildings.boathouse({ seed: 14 }) },
  { row: 'farm', id: 'banya', make: () => buildings.banya({ seed: 15 }) },
  { row: 'farm', id: 'workshop', make: () => buildings.workshop({ seed: 17 }) },
  { row: 'landmarks', id: 'idol', make: () => buildings.idol({ seed: 31 }) },
  { row: 'landmarks', id: 'bellTower', make: () => buildings.bellTower({ seed: 77 }) },
  { row: 'landmarks', id: 'watchtowerRuin', make: () => buildings.watchtowerRuin({ seed: 201 }) },
  { row: 'landmarks', id: 'stoneCircle', make: () => buildings.stoneCircle({ seed: 71 }) },
  { row: 'landmarks', id: 'shrine', make: () => buildings.shrine({ seed: 41 }) },
  { row: 'places', id: 'hankaHouse', make: () => buildings.hankaHouse({ seed: 61 }) },
  { row: 'places', id: 'fishingHut', make: () => buildings.fishingHut({ seed: 301 }) },
  { row: 'places', id: 'mill', make: () => buildings.mill({ seed: 311 }) },
  { row: 'places', id: 'trapperCabin', make: () => buildings.trapperCabin({ seed: 211 }) },
  { row: 'places', id: 'ruinedBathhouse', make: () => buildings.ruinedBathhouse({ seed: 221 }) },
  { row: 'places', id: 'charcoalKiln', make: () => buildings.charcoalKiln({ seed: 231 }) },
  { row: 'small', id: 'waysideShrine', make: () => buildings.waysideShrine({ seed: 51 }) },
  { row: 'small', id: 'gravePost', make: () => buildings.gravePost({ seed: 61, variant: 'wiesia' }) },
  { row: 'small', id: 'gravePost2', make: () => buildings.gravePost({ seed: 62, variant: 'son' }) },
  { row: 'small', id: 'well', make: () => buildings.well({ seed: 81 }) },
  { row: 'small', id: 'noticeBoard', make: () => buildings.noticeBoard({ seed: 91 }) },
  { row: 'small', id: 'marketStall', make: () => buildings.marketStall({ seed: 101 }) },
  { row: 'small', id: 'marketStall2', make: () => buildings.marketStall({ seed: 103 }) },
  { row: 'lines', id: 'fenceWattle', make: () => buildings.fence({ seed: 111, style: 'wattle', points: [[-6, 0], [-1, 0], [3, 3], [8, 3]] }), flat: true },
  { row: 'lines', id: 'fenceRail', make: () => buildings.fence({ seed: 112, style: 'rail', points: [[-6, 0], [0, 0], [4, -2], [9, -2]] }), flat: true },
  { row: 'lines', id: 'palisade', make: () => buildings.palisade({ seed: 121, points: [[-7, 0], [0, 0], [6, 2]] }), flat: true },
  { row: 'lines', id: 'gate', make: () => buildings.gate({ seed: 131 }) },
  { row: 'lines', id: 'boardwalk', make: () => buildings.boardwalk({ seed: 141, points: [[-6, 0], [0, 0], [4, 3], [10, 3]], rails: true }), flat: true },
  { row: 'lines', id: 'bridge', make: () => buildings.bridge({ seed: 151 }) },
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
  const cellP = parseFloat(P.get('cell'));
  const t0 = performance.now();
  const report = [];
  const placed = [];
  // Build everything first (a failing builder must not take the gallery down).
  const built = [];
  for (const e of entries) {
    try {
      const b = e.make(0);
      built.push({ e, b });
      const parts = [];
      b.group.traverse((o) => { if (o.isMesh) parts.push(`${o.name.split(':').pop()}=${Math.round(o.geometry.index.count / 3)}`); });
      report.push(`${e.id}: ${b.stats.calls} calls, ${Math.round(b.stats.triangles)} tris (${parts.join(' ')})`);
    } catch (err) {
      console.error(`[architecture gallery] FAIL ${e.id}: ${err.stack || err.message}`);
      G.errors.push(`architecture ${e.id}: ${err.message}`);
    }
  }
  // Palette swatches (plain materials in the DESIGN 5.1 colors) to calibrate the kit against the lighting.
  if (P.get('swatch') === '1') {
    const sw = [0x6b5a4a, 0x3b2e25, 0xf3f1ec, 0x3e5a78, 0x9a2e22, 0x8fa6c4, 0x8c8a85];
    sw.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.3), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
      m.position.set(-12 + i * 1.5, 1.2, 12);
      m.castShadow = m.receiveShadow = true;
      G.scene.add(m);
    });
  }
  // Layout: rows by kind (overview), or one row for an explicit list.
  const rows = new Map();
  for (const it of built) {
    const key = ids ? 'show' : it.e.row;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  let zRow = 0;
  for (const [, list] of rows) {
    const cells = list.map((it) => {
      const fp = it.b.footprint || { hw: 5, hd: 5 };
      const rad = Math.max(fp.hw, fp.hd) + 3;
      return Number.isFinite(cellP) ? cellP : rad * 2;
    });
    const rowDepth = Math.max(...list.map((it) => Math.max((it.b.footprint?.hd ?? 5) * 2 + 6, 14)));
    const total = cells.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    list.forEach((it, i) => {
      x += cells[i] / 2;
      const p = placeBuilding(G, it.b, x, zRow, it.e.yaw ?? 0, { snap: false, y: 0, foundation: false, skirt: it.e.flat ? false : true });
      placed.push({ ...it, x, z: zRow, p });
      x += cells[i] / 2;
    });
    zRow += rowDepth;
  }
  console.log('[architecture gallery]', `${(performance.now() - t0).toFixed(0)}ms build`, report.join(' | '));

  // Optional point lights from metadata (fires, lanterns, ghost light) for interior shots.
  if (P.get('lights') === '1') {
    let n = 0;
    for (const it of placed) {
      for (const l of it.p.lights) {
        if (!['hearth', 'forge', 'fire', 'lantern', 'candle', 'ghost'].includes(l.kind) || n >= 14) continue;
        const pl = new THREE.PointLight(l.color, 14 * l.intensity, l.radius * 1.8, 1.5);
        pl.position.set(l.x, l.y, l.z);
        G.scene.add(pl);
        n++;
      }
    }
  }

  // Auto camera: close orbit for one entry, a framing of the whole layout otherwise.
  const cam = G.camera;
  const ang = (parseFloat(P.get('ang') ?? '30') * Math.PI) / 180;
  const dist = parseFloat(P.get('dist') ?? '1');
  const hs = parseFloat(P.get('h') ?? '1');
  if (placed.length === 1) {
    const box = new THREE.Box3().setFromObject(placed[0].b.group);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const R = (Math.max(size.x, size.z) * 0.85 + (box.max.y - Math.max(0, box.min.y)) * 0.7) * dist + 2;
    const base = Math.max(0, box.min.y); // cellars and stilts reach below the ground; the camera does not
    cam.position.set(ctr.x + Math.sin(ang) * R, base + (2.0 + size.y * 0.1) * hs, ctr.z + Math.cos(ang) * R);
    cam.lookAt(ctr.x, base + (box.max.y - base) * 0.42, ctr.z);
    cam.fov = 45; cam.updateProjectionMatrix();
  } else if (placed.length > 1) {
    const box = new THREE.Box3();
    for (const it of placed) box.expandByObject(it.b.group);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const R = (size.x * 0.43 + size.z * 0.43) * dist + 6;
    cam.position.set(ctr.x + Math.sin(ang * 0.3) * R * 0.3, 3 + R * 0.3 * hs, ctr.z + R);
    cam.lookAt(ctr.x, Math.min(size.y * 0.35, 4), ctr.z);
    cam.fov = 50; cam.updateProjectionMatrix();
  }
}
