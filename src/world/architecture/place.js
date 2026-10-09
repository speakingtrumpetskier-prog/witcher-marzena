// placeBuilding: puts a kit building into the world.
//
//   const p = placeBuilding(G, b, x, z, yaw, { foundation: true, skirt: true, snap: true })
//
// - snaps the floor to the terrain (highest point under the footprint + a plinth lip)
// - extends stone foundations down to the lowest terrain point under the footprint
// - banks a soft snow skirt along the walls (merged into the building's snow mesh)
// - registers colliders with G.physics (converting yaw: Collision.js uses the mirrored sign)
// - returns world-space doors, anchors, lights and walk surfaces, plus dispose()
//
// opts: snap (default true), y (used when snap is false), foundation (default true), skirt (default
//   true, or {height, width}), parent (Object3D, default G.scene), tag (collider tag), align ('max'|'avg')
import * as THREE from 'three';
import { Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MB, C, mixC } from './mb.js';
import { getMaterials } from './materials.js';
import { PAL, GAIN } from './kit.js';

// Collision.js rotates boxes with the opposite handedness to three.js rotation.y. Flip here so
// physics boxes line up with the meshes. If Collision.js is ever fixed, set this to 1.
const PHYS_YAW_SIGN = 1; // Collision.addBox now uses three's rotation.y convention

const rotXZ = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

function terrainAt(G, x, z) {
  return G.world ? G.world.heightAt(x, z) : 0;
}

export function placeBuilding(G, b, x, z, yaw = 0, opts = {}) {
  const parent = opts.parent || G.scene;
  const fp = b.footprint || null;
  const snap = opts.snap !== false;
  let y0 = opts.y ?? 0;
  let minH = y0, maxH = y0;
  if (snap && fp) {
    // Sample terrain under the rotated footprint.
    let sum = 0, n = 0;
    minH = Infinity; maxH = -Infinity;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const [wx, wz] = rotXZ((i / 2) * fp.hw, (j / 2) * fp.hd, yaw);
        const h = terrainAt(G, x + wx, z + wz);
        sum += h; n++;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    y0 = (opts.align === 'avg' ? sum / n : maxH) + (opts.lip ?? 0.12);
  } else if (snap) {
    y0 = terrainAt(G, x, z) + 0.1;
    minH = maxH = y0;
  }

  const root = new THREE.Group();
  root.name = `placed:${b.group.name}`;
  root.position.set(x, y0, z);
  root.rotation.y = yaw;
  root.add(b.group);
  parent.add(root);
  root.updateMatrixWorld(true);

  const mats = getMaterials();

  // ----- foundation: stone ring from -0.5 down to the lowest ground under the footprint -----
  const fnd = opts.foundation !== false && fp && snap && !b.noFoundation;
  if (fnd && y0 - minH > 0.6) {
    const mb = new MB('foundation', { uv: [2, 2] });
    const depth = y0 - minH + 0.3;
    const stoneC = C(PAL.stone);
    const hash = (a, c) => { const v = Math.sin(a * 12.9898 + c * 78.233 + x * 0.31 + z * 0.17) * 43758.5453; return v - Math.floor(v); };
    const sides = [[0, fp.hd, fp.hw], [Math.PI, fp.hd, fp.hw], [Math.PI / 2, fp.hw, fp.hd], [-Math.PI / 2, fp.hw, fp.hd]];
    let bi = 0;
    for (const [sy, off, len] of sides) {
      mb.at(0, 0, 0, sy, (m) => {
        let s = -len;
        while (s < len) {
          const l = Math.min(len - s, 0.9 + hash(bi, 1) * 0.3);
          const col = mixC(PAL.stoneDark, stoneC, hash(bi, 2)).multiplyScalar(GAIN * 0.95);
          m.box(s + l / 2, -0.5 - depth / 2, off - 0.15, l * 0.99, depth, 0.62, col, { uv: [2, 2], top: col, ry: (hash(bi, 3) - 0.5) * 0.05 });
          s += l * 0.97;
          bi++;
        }
      });
    }
    mergeInto(b.group, 'stone', mb, mats.stone);
  }

  // ----- snow skirt banked against the walls -----
  if (opts.skirt !== false && fp && b.skirt !== false) {
    const so = typeof opts.skirt === 'object' ? opts.skirt : {};
    const geo = buildSkirt(G, b, fp, x, z, y0, yaw, so);
    if (geo) mergeInto(b.group, 'snow', geo, mats.snow);
  }

  // ----- colliders -----
  const ids = [];
  if (G.physics) {
    for (const c of b.colliders) {
      const [cx, cz] = rotXZ(c.x, c.z, yaw);
      const o = { tag: opts.tag || b.group.name || 'building' };
      if (c.y0 !== undefined) o.y0 = y0 + c.y0;
      if (c.y1 !== undefined) o.y1 = y0 + c.y1;
      if (c.type === 'circle') ids.push(G.physics.addCircle(x + cx, z + cz, c.r, o));
      else ids.push(G.physics.addBox(x + cx, z + cz, c.hw, c.hd, PHYS_YAW_SIGN * (yaw + (c.yaw || 0)), o));
    }
  }

  // ----- world-space metadata -----
  const toWorld = (v) => new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(root.matrixWorld);
  const anchors = {};
  for (const [k, v] of Object.entries(b.anchors)) anchors[k] = toWorld(v);
  const doors = b.doors.map((d) => {
    const [dx, dz] = rotXZ(d.x, d.z, yaw);
    return { ...d, x: x + dx, z: z + dz, y: y0 + (d.y || 0), yaw: yaw + d.yaw, local: d };
  });
  const lights = b.lights.map((l) => {
    const p = toWorld(l);
    const o = { ...l, x: p.x, y: p.y, z: p.z, wx: p.x, wy: p.y, wz: p.z };
    if (l.dir) { const [dx, dz] = rotXZ(l.dir[0], l.dir[2], yaw); o.dir = [dx, l.dir[1], dz]; }
    return o;
  });
  const walk = {
    floors: (b.walk?.floors || []).map((f) => ({ ...f, y: y0 + f.y, polygon: f.polygon.map(([px, pz]) => { const [wx, wz] = rotXZ(px, pz, yaw); return [x + wx, z + wz]; }) })),
    ramps: (b.walk?.ramps || []).map((r) => {
      const [ax, az] = rotXZ(r.a[0], r.a[2], yaw), [bx, bz] = rotXZ(r.b[0], r.b[2], yaw);
      return { ...r, a: [x + ax, y0 + r.a[1], z + az], b: [x + bx, y0 + r.b[1], z + bz] };
    }),
  };
  const placed = {
    root, group: b.group, x, z, y: y0, yaw, source: b,
    doors, anchors, lights, walk, interior: b.interior, objects: b.objects,
    localToWorld: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(root.matrixWorld),
    dispose() {
      if (G.physics) for (const id of ids) G.physics.remove(id);
      parent.remove(root);
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
  return placed;
}

// Append a geometry (or MB) to the named mesh of the building group, merging geometry in place.
function mergeInto(group, key, src, material) {
  const geo = src instanceof MB ? src.build() : src;
  if (!geo) return;
  const mesh = group.children.find((c) => c.isMesh && c.material === material);
  if (!mesh) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = key !== 'snow'; m.receiveShadow = true;
    group.add(m);
    return;
  }
  // Align attribute sets before merging.
  const a = mesh.geometry;
  for (const name of Object.keys(a.attributes)) {
    if (!geo.attributes[name]) {
      const cnt = geo.attributes.position.count;
      geo.setAttribute(name, new Float32BufferAttribute(new Float32Array(cnt * a.attributes[name].itemSize), a.attributes[name].itemSize));
    }
  }
  for (const name of Object.keys(geo.attributes)) if (!a.attributes[name]) geo.deleteAttribute(name);
  const merged = mergeGeometries([a, geo], false);
  mesh.geometry.dispose();
  mesh.geometry = merged;
}

// ----- snow skirt -----
function buildSkirt(G, b, fp, wx, wz, wy, yaw, o) {
  const N = 72;
  const hw = fp.hw + 0.02, hd = fp.hd + 0.02;
  const width = o.width ?? 1.9;
  const height = o.height ?? 0.42;
  const rings = [0, 0.22, 0.5, 0.95, 1.5, 2.2];
  const excl = b.skirtExclude || [];
  const doors = b.doors || [];
  const rows = [], bases = [], cols = [];
  const rnd = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233 + wx * 0.37 + wz * 0.71) * 43758.5453; return s - Math.floor(s); };
  const mkRing = (k) => {
    const row = [], brow = [], crow = [];
    const t = rings[k] / rings[rings.length - 1];
    for (let i = 0; i <= N; i++) {
      const ph = ((i % N) / N) * Math.PI * 2;
      const dx = Math.cos(ph), dz = Math.sin(ph);
      const tt = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dz) / hd);
      let lx = dx * tt, lz = dz * tt;
      // Push out along the ray; rays are not normal to long sides, so scale by the side normal.
      const nx = Math.abs(lx) > hw * 0.999 ? Math.sign(lx) : 0, nz = Math.abs(lz) > hd * 0.999 ? Math.sign(lz) : 0;
      let ox, oz;
      if (nx !== 0 && nz !== 0) { ox = nx * 0.7071; oz = nz * 0.7071; } else if (nx !== 0) { ox = nx; oz = 0; } else { ox = 0; oz = nz; }
      const bump = 0.75 + 0.5 * rnd(Math.floor(i / 2), 1);
      const d = rings[k] * width / rings[rings.length - 1] * (0.85 + 0.3 * rnd(Math.floor(i / 3), 2));
      lx += ox * d; lz += oz * d;
      // Suppress the skirt in front of doors, porches and other excluded boxes.
      let suppress = 1;
      for (const dr of doors) {
        const dd = Math.hypot(lx - dr.x, lz - dr.z);
        suppress = Math.min(suppress, 0.05 + 0.95 * smoothstep(1.1, 2.6, dd));
      }
      for (const e of excl) {
        const ex = lx - e.x, ez = lz - e.z;
        const c = Math.cos(e.yaw || 0), s = Math.sin(e.yaw || 0);
        const px = ex * c - ez * s, pz = ex * s + ez * c; // into box frame
        const q = Math.max(Math.abs(px) - e.hw, Math.abs(pz) - e.hd);
        suppress = Math.min(suppress, smoothstep(-0.2, 0.9, q));
      }
      const [rx, rz] = rotXZ(lx, lz, yaw);
      const gy = terrainAt(G, wx + rx, wz + rz);
      const rel = gy - wy;
      const prof = Math.pow(1 - t, 1.6);
      const h = height * prof * bump * suppress;
      // Inner ring is anchored near the wall at (floor + h); outer ring melts into the terrain.
      const y = Math.max(rel + 0.05, Math.min(rel + 0.05 + h, 0.5));
      row.push([lx, y, lz]);
      brow.push([lx, rel + 0.04, lz]);
      const wcol = 0.94 + 0.06 * rnd(i, 5);
      crow.push(new THREE.Color(wcol, wcol + 0.01, wcol + 0.04));
    }
    rows.push(row); bases.push(brow); cols.push(crow);
  };
  for (let k = 0; k < rings.length; k++) mkRing(k);
  const mb = new MB('skirt', { base: true, uv: [2, 2] });
  mb.grid(rows, C(PAL.snow), {
    // Rings go outward; flip so normals face up.
    flip: true,
    uv: [2, 2],
    colorFn: (i, j) => cols[i][j],
    baseFn: (i, j) => bases[i][j],
  });
  return mb.build();
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

