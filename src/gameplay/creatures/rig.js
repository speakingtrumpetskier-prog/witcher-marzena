// Procedural rig helpers for the creatures: lofted body geometry, rigid skinning (one SkinnedMesh
// per material, every vertex bound 100 percent to one bone) and a planar two-bone IK for legs.
//
//   loft(sections, opts)                    smooth surface through elliptical cross sections along +Z
//   ellipsoid(rx, ry, rz, center, opts)     egg-shaped blob
//   limb(len, r0, r1, opts)                 tapered leg segment hanging along -Y from the origin
//   skinMerge(parts)                        parts: [{ geo, bone, matrix? }] -> one BufferGeometry bound to the bones
//   makeSkinned(bones, parts, material)     SkinnedMesh over a bone list (bones[0] is the root bone)
//   leg2D(H, Q, L1, L2, L3, phi, bend, out) planar leg solve in (z, y)
//   furTexture(seed, base, opts)            streaky procedural fur map (cached per key)
import * as THREE from 'three';

const TAU = Math.PI * 2;

// Catmull-Rom through values (uniform), t in [0, n-1].
function crom(vals, t) {
  const n = vals.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(t)));
  const u = t - i;
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

// sections: [{ z, w, h, y = 0, x = 0 }] with w the half width and h the half height. The first and
// last section are closed with a fan, so give them a small size for a rounded end.
// opts: radial (12), res (rings per segment, 3), color(px, py, pz, ny, z01) -> [r, g, b], uRep, vRep.
export function loft(sections, opts = {}) {
  const radial = opts.radial || 12;
  const res = opts.res || 3;
  const n = sections.length;
  const zs = sections.map((s) => s.z), ws = sections.map((s) => s.w), hs = sections.map((s) => s.h);
  const ys = sections.map((s) => s.y || 0), xs = sections.map((s) => s.x || 0);
  const rings = (n - 1) * res + 1;
  const pos = [], uv = [], idx = [];
  const bellyFlat = opts.flat ?? 0;
  for (let r = 0; r < rings; r++) {
    const t = (r / (rings - 1)) * (n - 1);
    const z = crom(zs, t), w = Math.max(0.002, crom(ws, t)), h = Math.max(0.002, crom(hs, t)), y = crom(ys, t), x = crom(xs, t);
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * TAU;
      const c = Math.cos(th), s = Math.sin(th);
      const sy = s < 0 ? s * (1 - bellyFlat * 0.35) : s;
      pos.push(x + w * c, y + h * sy, z);
      uv.push((k / radial) * (opts.uRep || 3), (r / (rings - 1)) * (opts.vRep || 2));
    }
  }
  const row = radial + 1;
  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // End caps (fans around a center vertex), so the surface is closed.
  const capA = pos.length / 3;
  pos.push(xs[0], ys[0], zs[0]); uv.push(0.5, 0);
  for (let k = 0; k < radial; k++) idx.push(capA, k + 1, k);
  const capB = pos.length / 3;
  pos.push(xs[n - 1], ys[n - 1], zs[n - 1]); uv.push(0.5, 1);
  const last = (rings - 1) * row;
  for (let k = 0; k < radial; k++) idx.push(capB, last + k, last + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The seam column is duplicated (u wraps), so average its normals or a faint line runs along the body.
  {
    const nrm = g.attributes.normal;
    for (let r = 0; r < rings; r++) {
      const a = r * row, b = r * row + radial;
      const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
  }
  if (opts.rotate) g.applyMatrix4(opts.rotate);
  if (opts.matrix) g.applyMatrix4(opts.matrix);
  colorize(g, opts.color, opts.tint);
  return g;
}

export function ellipsoid(rx, ry, rz, center = [0, 0, 0], opts = {}) {
  const g = new THREE.SphereGeometry(1, opts.ws || 10, opts.hs || 8);
  g.scale(rx, ry, rz);
  g.translate(center[0], center[1], center[2]);
  if (opts.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(opts.rot[0], opts.rot[1], opts.rot[2])));
  if (opts.matrix) g.applyMatrix4(opts.matrix);
  // uv from sphere is fine; stretch for fur streaks
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1.5);
  colorize(g, opts.color, opts.tint);
  return g;
}

// Tapered limb hanging down -Y from the origin, cross section ellipse (rx across X, rz along Z).
export function limb(len, r0, r1, opts = {}) {
  const rz = opts.depth ?? 1;
  const secs = [
    { z: 0, w: r0 * 0.7, h: r0 * 0.7 * rz },
    { z: len * 0.08, w: r0, h: r0 * rz },
    { z: len * 0.5, w: (r0 + r1) * 0.5 * (opts.belly ?? 1), h: (r0 + r1) * 0.5 * rz * (opts.belly ?? 1) },
    { z: len * 0.92, w: r1, h: r1 * rz },
    { z: len, w: r1 * 0.7, h: r1 * 0.7 * rz },
  ];
  const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2); // +z -> -y, +y -> +z
  return loft(secs, { radial: opts.radial || 8, res: opts.res || 2, rotate: rot, color: opts.color, tint: opts.tint, uRep: 2, vRep: 2 });
}

function colorize(g, fn, tint) {
  const p = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  g.computeBoundingBox();
  for (let i = 0; i < p.count; i++) {
    let r = 1, gg = 1, b = 1;
    if (fn) {
      const c = fn(p.getX(i), p.getY(i), p.getZ(i), nrm ? nrm.getY(i) : 0, i);
      r = c[0]; gg = c[1]; b = c[2];
    }
    if (tint) { r *= tint[0]; gg *= tint[1]; b *= tint[2]; }
    r = Math.pow(Math.max(0, r), 2.2); gg = Math.pow(Math.max(0, gg), 2.2); b = Math.pow(Math.max(0, b), 2.2);
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---- rigid skinning --------------------------------------------------------------------------------
// parts: [{ geo, bone: THREE.Bone, matrix?: Matrix4 (part to bone space) }]. Bones must already be in
// their bind pose with up to date world matrices (call updateMatrixWorld(true) on the root first).
export function skinMerge(parts, bones) {
  let vc = 0, ic = 0;
  for (const p of parts) { vc += p.geo.attributes.position.count; ic += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 4);
  const si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
  let hasSway = false;
  for (const p of parts) if (p.geo.attributes.aSway) hasSway = true;
  const sway = hasSway ? new Float32Array(vc * 3) : null;
  const idx = vc > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    p.bone.updateWorldMatrix(true, false);
    m.copy(p.bone.matrixWorld);
    if (p.matrix) m.multiply(p.matrix);
    nm.getNormalMatrix(m);
    const e = m.elements, ne = nm.elements;
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color;
    const n = pa.count;
    const bi = bones.indexOf(p.bone);
    for (let i = 0; i < n; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const o = (vo + i) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (na) {
        const nx = na.getX(i), ny = na.getY(i), nz = na.getZ(i);
        const ox = ne[0] * nx + ne[3] * ny + ne[6] * nz, oy = ne[1] * nx + ne[4] * ny + ne[7] * nz, oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        nor[o] = ox / l; nor[o + 1] = oy / l; nor[o + 2] = oz / l;
      }
      if (ua) { uv[(vo + i) * 2] = ua.getX(i); uv[(vo + i) * 2 + 1] = ua.getY(i); }
      if (ca) {
        col[(vo + i) * 4] = ca.getX(i); col[(vo + i) * 4 + 1] = ca.getY(i); col[(vo + i) * 4 + 2] = ca.getZ(i);
        col[(vo + i) * 4 + 3] = ca.itemSize === 4 ? ca.getW(i) : 1;
      } else { col[(vo + i) * 4] = col[(vo + i) * 4 + 1] = col[(vo + i) * 4 + 2] = col[(vo + i) * 4 + 3] = 1; }
      si[(vo + i) * 4] = bi; sw[(vo + i) * 4] = 1;
      if (sway) {
        const sa = g.attributes.aSway;
        if (sa) { sway[(vo + i) * 3] = sa.getX(i); sway[(vo + i) * 3 + 1] = sa.getY(i); sway[(vo + i) * 3 + 2] = sa.getZ(i); }
      }
    }
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo; io += ia.length; } else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 4));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (sway) out.setAttribute('aSway', new THREE.BufferAttribute(sway, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// A skinned mesh culls against a fixed sphere: the bind pose bounds, padded for the animation.
function boundSkinned(mesh) {
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const b = g.boundingSphere;
  mesh.boundingSphere = new THREE.Sphere(b.center.clone(), b.radius * 1.5 + 0.6);
  mesh.frustumCulled = true;
}

// bones: Bone[] (bones[0] = root bone, already parented as a hierarchy), group: the Object3D that
// will hold the mesh. Returns { mesh, skeleton }.
export function makeSkinned(bones, parts, material, group) {
  group.updateMatrixWorld(true);
  const geo = skinMerge(parts, bones);
  const mesh = new THREE.SkinnedMesh(geo, material);
  boundSkinned(mesh);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (!bones[0].parent) mesh.add(bones[0]);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  return { mesh, skeleton };
}

// ---- planar IK ---------------------------------------------------------------------------------------
// Coordinates are (z forward, y up). H hip joint, Q ankle target ({ z, y }). The ankle joint J sits
// L3 above and behind Q by phi (positive: Q is forward of J). Fills out with the world sagittal angles
// of the three segments measured from straight down toward +z, plus the knee and ankle positions.
export function leg2D(H, Q, L1, L2, L3, phi, bend, out) {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  let jz = Q.z - L3 * sp, jy = Q.y + L3 * cp;
  let dz = jz - H.z, dy = jy - H.y;
  let d = Math.hypot(dz, dy) || 1e-6;
  const dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) * 1.001 + 0.002;
  const dd = Math.min(dmax, Math.max(dmin, d));
  const uz = dz / d, uy = dy / d;
  jz = H.z + uz * dd; jy = H.y + uy * dd;
  const cosA = (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const ca = Math.cos(a), sa = Math.sin(a) * bend;
  const nz = -uy, ny = uz;
  const kz = H.z + L1 * (uz * ca + nz * sa), ky = H.y + L1 * (uy * ca + ny * sa);
  out.a1 = Math.atan2(kz - H.z, -(ky - H.y));
  out.a2 = Math.atan2(jz - kz, -(jy - ky));
  out.a3 = phi;
  out.kz = kz; out.ky = ky; out.jz = jz; out.jy = jy;
  out.reach = d / (L1 + L2);
  return out;
}

// ---- fur texture ---------------------------------------------------------------------------------------
const furCache = new Map();
export function furTexture(key, base = [0.8, 0.8, 0.8], opts = {}) {
  if (furCache.has(key)) return furCache.get(key);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const hex = (v) => `rgb(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)})`;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, S, S);
  let s = (opts.seed || 7) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const strands = opts.strands || 5200;
  for (let i = 0; i < strands; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 6 + rnd() * 18;
    const ang = (rnd() - 0.5) * 0.35;
    const v = rnd();
    const light = v > 0.5;
    const k = light ? 1 + rnd() * 0.35 : 0.55 + rnd() * 0.3;
    g.strokeStyle = `rgba(${Math.min(255, Math.round(base[0] * 255 * k))},${Math.min(255, Math.round(base[1] * 255 * k))},${Math.min(255, Math.round(base[2] * 255 * k))},${0.18 + rnd() * 0.3})`;
    g.lineWidth = 0.6 + rnd() * 1.3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.sin(ang) * len, y + Math.cos(ang) * len);
    g.stroke();
    // wrap vertically so the texture tiles
    if (y + len > S) { g.beginPath(); g.moveTo(x, y - S); g.lineTo(x + Math.sin(ang) * len, y - S + Math.cos(ang) * len); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  furCache.set(key, tex);
  return tex;
}

export function disposeRigCaches() {
  for (const t of furCache.values()) t.dispose();
  furCache.clear();
}

// Several materials over one skeleton: byMaterial is a Map of material -> parts[] ({ geo, bone, matrix? }).
// Returns { meshes, skeleton }. The geometry attributes may carry aSway (cloth) and u8 or float colors.
export function makeSkinnedMulti(bones, byMaterial, group) {
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  for (const [material, parts] of byMaterial) {
    const geo = skinMerge(parts, bones);
    const mesh = new THREE.SkinnedMesh(geo, material);
    boundSkinned(mesh);
    mesh.castShadow = !material.userData?.noShadow;
    mesh.receiveShadow = true;
    mesh.name = `skin_${material.name || 'mat'}`;
    group.add(mesh);
    meshes.push(mesh);
  }
  group.updateMatrixWorld(true);
  for (const m of meshes) m.bind(skeleton);
  return { meshes, skeleton };
}
