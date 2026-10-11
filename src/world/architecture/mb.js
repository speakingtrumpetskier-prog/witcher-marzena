// MB: a mesh builder that accumulates geometry for ONE material straight into arrays.
// Every architecture piece writes into a few MBs and the kit turns each into one mesh, which is
// how a whole house ends up as 4 to 8 draw calls.
//
// Frame: all primitives are placed in the current local frame (see save/apply/restore/at).
// Vertex attributes: position, normal, uv, color (linear), and optionally snowBase (melt target).
// UV conventions: wood grain runs along V. `uv: [su, sv]` is meters per texture tile.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

const colorCache = new Map();
// Accepts a THREE.Color, a hex number, or a CSS string. Returns a shared (do not mutate) Color.
export function C(c) {
  if (c && c.isColor) return c;
  let v = colorCache.get(c);
  if (!v) { v = new THREE.Color(c); colorCache.set(c, v); }
  return v;
}
export function mixC(a, b, t, out = new THREE.Color()) {
  a = C(a); b = C(b);
  return out.setRGB(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}
export function scaleC(a, k, out = new THREE.Color()) {
  a = C(a);
  return out.setRGB(a.r * k, a.g * k, a.b * k);
}
export function tintC(a, r, g, b, out = new THREE.Color()) {
  a = C(a);
  return out.setRGB(a.r * r, a.g * g, a.b * b);
}

const arr3 = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

export class MB {
  constructor(name, { base = false, uv = [1, 1], shade = null } = {}) {
    this.name = name;
    this.p = []; this.n = []; this.t = []; this.c = []; this.i = [];
    this.b = base ? [] : null;
    this.uvs = uv;
    this.shade = shade;
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.stack = [];
  }

  get count() { return this.p.length / 3; }
  get empty() { return this.i.length === 0; }

  // ----- transform stack -----
  save() { this.stack.push(this.m.clone()); return this; }
  restore() { this.m.copy(this.stack.pop()); this.nm.getNormalMatrix(this.m); return this; }
  apply(mat) { this.m.multiply(mat); this.nm.getNormalMatrix(this.m); return this; }
  // Run fn inside a translated / rotated / scaled local frame (euler order YXZ).
  at(x, y, z, ry, fn, rx = 0, rz = 0, s = 1) {
    this.save();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(s, s, s);
    this.apply(_m.compose(_p.set(x, y, z), _q, _s));
    fn(this);
    this.restore();
    return this;
  }

  // ----- raw vertices -----
  v(x, y, z, nx, ny, nz, u, vv, col, bx, by, bz) {
    const m = this.m.elements;
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nn = this.nm.elements;
    let ox = nn[0] * nx + nn[3] * ny + nn[6] * nz;
    let oy = nn[1] * nx + nn[4] * ny + nn[7] * nz;
    let oz = nn[2] * nx + nn[5] * ny + nn[8] * nz;
    const il = 1 / (Math.hypot(ox, oy, oz) || 1);
    ox *= il; oy *= il; oz *= il;
    let cr = col.r, cg = col.g, cb = col.b;
    if (this.shade) { const k = this.shade(wx, wy, wz); cr *= k; cg *= k; cb *= k; }
    const idx = this.p.length / 3;
    this.p.push(wx, wy, wz);
    this.n.push(ox, oy, oz);
    this.t.push(u, vv);
    this.c.push(cr, cg, cb);
    if (this.b) {
      if (bx === undefined) this.b.push(wx, wy, wz);
      else {
        this.b.push(
          m[0] * bx + m[4] * by + m[8] * bz + m[12],
          m[1] * bx + m[5] * by + m[9] * bz + m[13],
          m[2] * bx + m[6] * by + m[10] * bz + m[14],
        );
      }
    }
    return idx;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quadI(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  // ----- flat polygons -----
  // Triangle with a flat normal. p0..p2 are [x,y,z] or Vector3, counter-clockwise from outside.
  triangle(p0, p1, p2, col, uv0 = [0, 0], uv1 = [1, 0], uv2 = [0, 1]) {
    col = C(col);
    _a.fromArray(arr3(p1)).sub(_p.fromArray(arr3(p0)));
    _b.fromArray(arr3(p2)).sub(_p);
    _n.crossVectors(_a, _b).normalize();
    const a = arr3(p0), b = arr3(p1), c = arr3(p2);
    const i0 = this.v(a[0], a[1], a[2], _n.x, _n.y, _n.z, uv0[0], uv0[1], col);
    const i1 = this.v(b[0], b[1], b[2], _n.x, _n.y, _n.z, uv1[0], uv1[1], col);
    const i2 = this.v(c[0], c[1], c[2], _n.x, _n.y, _n.z, uv2[0], uv2[1], col);
    this.tri(i0, i1, i2);
  }
  // Quad, counter-clockwise from outside. uv given as meters-based pairs or computed from edge lengths.
  quad(p0, p1, p2, p3, col, uv = null) {
    col = C(col);
    const a = arr3(p0), b = arr3(p1), c = arr3(p2), d = arr3(p3);
    _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _b.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]);
    _n.crossVectors(_a, _b).normalize();
    let u0, u1, u2, u3;
    if (uv) [u0, u1, u2, u3] = uv;
    else {
      const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / this.uvs[0];
      const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / this.uvs[1];
      u0 = [0, 0]; u1 = [w, 0]; u2 = [w, h]; u3 = [0, h];
    }
    const i0 = this.v(a[0], a[1], a[2], _n.x, _n.y, _n.z, u0[0], u0[1], col);
    const i1 = this.v(b[0], b[1], b[2], _n.x, _n.y, _n.z, u1[0], u1[1], col);
    const i2 = this.v(c[0], c[1], c[2], _n.x, _n.y, _n.z, u2[0], u2[1], col);
    const i3 = this.v(d[0], d[1], d[2], _n.x, _n.y, _n.z, u3[0], u3[1], col);
    this.quadI(i0, i1, i2, i3);
  }

  // ----- boxes -----
  // Axis-aligned box in the local frame (rotate with at()/o.ry etc). Grain runs along the longest
  // axis unless o.grain is given. o.skip: string of faces to omit, e.g. '-y' or '-y +x'.
  box(cx, cy, cz, sx, sy, sz, col, o = {}) {
    const hasRot = o.rx || o.ry || o.rz;
    if (hasRot) {
      this.save();
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
      _q.setFromEuler(_e);
      this.apply(_m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1)));
      cx = cy = cz = 0;
    }
    const h = [sx / 2, sy / 2, sz / 2];
    const ctr = [cx, cy, cz];
    const sz3 = [sx, sy, sz];
    const g = o.grain ? 'xyz'.indexOf(o.grain) : (sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2);
    const [su, sv] = o.uv || this.uvs;
    const uo = o.uo ?? ((cx * 0.37 + cy * 0.91 + cz * 0.53) % 1);
    const vo = o.vo ?? ((cx * 0.71 + cy * 0.29 + cz * 0.43) % 1);
    const skip = o.skip || '';
    for (let a = 0; a < 3; a++) {
      for (let sg = -1; sg <= 1; sg += 2) {
        const tag = (sg < 0 ? '-' : '+') + 'xyz'[a];
        if (skip.includes(tag)) continue;
        const bAx = (a + 1) % 3, cAx = (a + 2) % 3;
        let fc = col;
        if (a === 1 && sg > 0 && o.top) fc = o.top;
        else if (a === 1 && sg < 0 && o.bottom) fc = o.bottom;
        else if (o.side && a !== 1) fc = o.side;
        fc = C(fc);
        const corners = sg > 0
          ? [[-1, -1], [1, -1], [1, 1], [-1, 1]]
          : [[-1, -1], [-1, 1], [1, 1], [1, -1]];
        // Which in-face axis carries the grain (V)?
        let vAx;
        if (g === bAx) vAx = bAx; else if (g === cAx) vAx = cAx; else vAx = sz3[bAx] >= sz3[cAx] ? bAx : cAx;
        const nrm = [0, 0, 0]; nrm[a] = sg;
        const idx = [];
        for (const [kb, kc] of corners) {
          const p = [0, 0, 0];
          p[a] = ctr[a] + sg * h[a];
          p[bAx] = ctr[bAx] + kb * h[bAx];
          p[cAx] = ctr[cAx] + kc * h[cAx];
          const cb = (kb + 1) * h[bAx], cc = (kc + 1) * h[cAx];
          const vv = (vAx === bAx ? cb : cc) / sv + vo;
          const uu = (vAx === bAx ? cc : cb) / su + uo;
          idx.push(this.v(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], uu, vv, fc));
        }
        this.quadI(idx[0], idx[1], idx[2], idx[3]);
      }
    }
    if (hasRot) this.restore();
  }

  // Box defined between two corner points [x,y,z] (axis aligned), handy for boards and sills.
  slab(x0, y0, z0, x1, y1, z1, col, o = {}) {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col, o);
  }

  // ----- round things -----
  // A log / pole / post from a to b. o: seg, lenSeg, capA, capB, bow:[x,y,z], wobble, ph (phase),
  // uo, vo, uv, ao (underside darkening), endCol, rim (color multiplier fn t,ang => number).
  tube(a, b, r0, r1, col, o = {}) {
    const A = _a.fromArray(arr3(a)).clone();
    const B = _b.fromArray(arr3(b)).clone();
    const dir = B.clone().sub(A);
    const L = dir.length();
    if (L < 1e-5) return;
    const dn = dir.clone().multiplyScalar(1 / L);
    const helper = Math.abs(dn.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(helper, dn).normalize();
    const e2 = new THREE.Vector3().crossVectors(dn, e1);
    // e1 points sideways, e2 up-ish for horizontal logs (dn x e1).
    const seg = o.seg || 10, ls = o.lenSeg || 1;
    const bow = o.bow ? arr3(o.bow) : null;
    const wob = o.wobble || 0, ph = o.ph || 0;
    const [su, sv] = o.uv || this.uvs;
    const uo = o.uo ?? 0, vo = o.vo ?? 0;
    const ao = o.ao ?? 0.3;
    col = C(col);
    const slope = (r1 - r0) / L;
    const rows = [];
    const tmp = new THREE.Color();
    for (let i = 0; i <= ls; i++) {
      const t = i / ls;
      const cx = A.x + dir.x * t + (bow ? bow[0] * 4 * t * (1 - t) : 0);
      const cy = A.y + dir.y * t + (bow ? bow[1] * 4 * t * (1 - t) : 0);
      const cz = A.z + dir.z * t + (bow ? bow[2] * 4 * t * (1 - t) : 0);
      const r = r0 + (r1 - r0) * t;
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let rr = r;
        if (wob) rr *= 1 + wob * (Math.sin(ang * 2 + ph + t * 5.1) * 0.5 + Math.sin(ang * 3 - ph * 1.7 - t * 3.3) * 0.5);
        const rx = e1.x * ca + e2.x * sa, ry = e1.y * ca + e2.y * sa, rz = e1.z * ca + e2.z * sa;
        let nx = rx - dn.x * slope, ny = ry - dn.y * slope, nz = rz - dn.z * slope;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        // Underside darkening gives contact shadow between stacked logs.
        let k = 1 - ao * (0.5 - 0.5 * ny) * 1.0;
        if (o.rim) k *= o.rim(t, ang);
        tmp.setRGB(col.r * k, col.g * k, col.b * k);
        row.push(this.v(cx + rx * rr, cy + ry * rr, cz + rz * rr, nx, ny, nz, (j / seg) * (o.uMul || 1) + uo, (t * L) / sv + vo, tmp));
      }
      rows.push(row);
    }
    for (let i = 0; i < ls; i++) {
      for (let j = 0; j < seg; j++) {
        const q0 = rows[i][j], q1 = rows[i][j + 1], q2 = rows[i + 1][j], q3 = rows[i + 1][j + 1];
        this.tri(q0, q1, q2);
        this.tri(q1, q3, q2);
      }
    }
    // End caps with a painted growth-ring gradient.
    const capCol = o.endCol ? C(o.endCol) : null;
    const cap = (t, sign, enabled, detail = 2) => {
      if (enabled === false) return;
      const cxp = A.x + dir.x * t + (bow ? bow[0] * 4 * t * (1 - t) : 0);
      const cyp = A.y + dir.y * t + (bow ? bow[1] * 4 * t * (1 - t) : 0);
      const czp = A.z + dir.z * t + (bow ? bow[2] * 4 * t * (1 - t) : 0);
      const r = r0 + (r1 - r0) * t;
      const base = capCol || mixC(col, 0xc9a878, 0.55);
      const mul = detail === 1 ? [0.7, 0.7, 1.0] : [0.62, 0.8, 1.0];
      const rad = [0, 0.55, 1.0];
      const rings = [];
      const nx = dn.x * sign, ny = dn.y * sign, nz = dn.z * sign;
      for (let k = 0; k < 3; k++) {
        if (detail === 1 && k === 1) { rings.push(null); continue; }
        const row = [];
        const cc = tmp.setRGB(base.r * mul[k], base.g * mul[k], base.b * mul[k]).clone();
        const n = k === 0 ? 1 : seg;
        for (let j = 0; j < n; j++) {
          const ang = (j / seg) * Math.PI * 2;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const rr = r * rad[k] * (k === 2 && wob ? 1 + wob * (Math.sin(ang * 2 + ph + t * 5.1) * 0.5 + Math.sin(ang * 3 - ph * 1.7 - t * 3.3) * 0.5) : 1);
          row.push(this.v(cxp + (e1.x * ca + e2.x * sa) * rr, cyp + (e1.y * ca + e2.y * sa) * rr, czp + (e1.z * ca + e2.z * sa) * rr,
            nx, ny, nz, 0.5 + rad[k] * ca * 0.5 * r / su * 2, 0.5 + rad[k] * sa * 0.5 * r / sv * 2, cc));
        }
        rings.push(row);
      }
      // Center fan then ring bands.
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        if (detail === 1) {
          if (sign > 0) this.tri(rings[0][0], rings[2][j], rings[2][j2]);
          else this.tri(rings[0][0], rings[2][j2], rings[2][j]);
          continue;
        }
        if (sign > 0) this.tri(rings[0][0], rings[1][j], rings[1][j2]);
        else this.tri(rings[0][0], rings[1][j2], rings[1][j]);
        for (let k = 1; k < 2; k++) {
          const a0 = rings[k][j], a1 = rings[k][j2], b0 = rings[k + 1][j], b1 = rings[k + 1][j2];
          if (sign > 0) { this.tri(a0, b0, a1); this.tri(a1, b0, b1); }
          else { this.tri(a0, a1, b0); this.tri(a1, b1, b0); }
        }
      }
    };
    cap(1, 1, o.capB, o.capDetailB ?? o.capDetail ?? 2);
    cap(0, -1, o.capA, o.capDetailA ?? o.capDetail ?? 2);
  }

  // A tube swept through a polyline of points (smooth joints, parallel-transported frame).
  // r is a number or fn(t, i) -> radius. o: seg, capA, capB, uo, vo, uv, ao, endCol, colorFn(t,ang)->mult
  sweep(pts, r, col, o = {}) {
    const n = pts.length;
    if (n < 2) return;
    const P = pts.map((p) => new THREE.Vector3().fromArray(arr3(p)));
    const seg = o.seg || 8;
    const [su, sv] = o.uv || this.uvs;
    const ao = o.ao ?? 0.3;
    col = C(col);
    const tangents = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      return b.clone().sub(a).normalize();
    });
    let e1 = new THREE.Vector3();
    const t0 = tangents[0];
    const helper = Math.abs(t0.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    e1.crossVectors(helper, t0).normalize();
    const tmp = new THREE.Color();
    const rows = [];
    let acc = 0;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const d = tangents[i];
      e1 = e1.clone().addScaledVector(d, -e1.dot(d)).normalize();
      const e2 = new THREE.Vector3().crossVectors(d, e1);
      frames.push({ e1, e2 });
      if (i > 0) acc += P[i].distanceTo(P[i - 1]);
      const rad = typeof r === 'function' ? r(i / (n - 1), i) : r;
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = e1.x * ca + e2.x * sa, ny = e1.y * ca + e2.y * sa, nz = e1.z * ca + e2.z * sa;
        let k = 1 - ao * (0.5 - 0.5 * ny);
        if (o.colorFn) k *= o.colorFn(i / (n - 1), ang);
        tmp.setRGB(col.r * k, col.g * k, col.b * k);
        row.push(this.v(P[i].x + nx * rad, P[i].y + ny * rad, P[i].z + nz * rad, nx, ny, nz, (j / seg) + (o.uo || 0), acc / sv + (o.vo || 0), tmp));
      }
      rows.push(row);
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < seg; j++) {
        this.tri(rows[i][j], rows[i][j + 1], rows[i + 1][j]);
        this.tri(rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
      }
    }
    void su;
    const base = o.endCol ? C(o.endCol) : mixC(col, 0xc9a878, 0.55);
    const cap = (i, sign) => {
      const { e1: a1, e2: a2 } = frames[i];
      const d = tangents[i];
      const rad = typeof r === 'function' ? r(i / (n - 1), i) : r;
      const cc = tmp.setRGB(base.r * 0.7, base.g * 0.7, base.b * 0.7).clone();
      const ci = this.v(P[i].x, P[i].y, P[i].z, d.x * sign, d.y * sign, d.z * sign, 0.5, 0.5, cc);
      const ring = [];
      const rc = tmp.setRGB(base.r, base.g, base.b).clone();
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ring.push(this.v(P[i].x + (a1.x * ca + a2.x * sa) * rad, P[i].y + (a1.y * ca + a2.y * sa) * rad, P[i].z + (a1.z * ca + a2.z * sa) * rad,
          d.x * sign, d.y * sign, d.z * sign, 0.5 + ca * 0.4, 0.5 + sa * 0.4, rc));
      }
      for (let j = 0; j < seg; j++) {
        if (sign > 0) this.tri(ci, ring[j], ring[j + 1]); else this.tri(ci, ring[j + 1], ring[j]);
      }
    };
    if (o.capB !== false) cap(n - 1, 1);
    if (o.capA !== false) cap(0, -1);
  }

  // Surface of revolution about local Y. profile: [[r, y], ...] bottom to top. Smooth normals.
  // o: seg, col or colors per profile point, closeTop/closeBottom, uv (meters), wobble, ph
  lathe(profile, col, o = {}) {
    const seg = o.seg || 12;
    const [su, sv] = o.uv || this.uvs;
    const rows = [];
    let acc = 0;
    const prof = profile;
    for (let i = 0; i < prof.length; i++) {
      if (i > 0) acc += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
      const [r, y] = prof[i];
      // Profile tangent for the normal.
      const p0 = prof[Math.max(0, i - 1)], p1 = prof[Math.min(prof.length - 1, i + 1)];
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      // Outward normal in the (r, y) plane: rotate tangent by -90 deg.
      const nr = ty, ny = -tx;
      const cc = Array.isArray(o.colors) ? C(o.colors[i]) : C(col);
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let rr = r;
        if (o.wobble) rr *= 1 + o.wobble * Math.sin(ang * 3 + (o.ph || 0) + y * 1.3);
        row.push(this.v(ca * rr, y, sa * rr, ca * nr, ny, sa * nr, (j / seg) * (o.uMul || 1), acc / sv, cc));
      }
      rows.push(row);
    }
    // Orientation: ring angle goes x -> z, which is clockwise seen from above; flip winding accordingly.
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const q0 = rows[i][j], q1 = rows[i][j + 1], q2 = rows[i + 1][j], q3 = rows[i + 1][j + 1];
        this.tri(q0, q2, q1);
        this.tri(q1, q2, q3);
      }
    }
    void su;
    const disc = (y, r, up, cc) => {
      cc = C(cc);
      const ci = this.v(0, y, 0, 0, up ? 1 : -1, 0, 0.5, 0.5, cc);
      const ring = [];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        ring.push(this.v(Math.cos(ang) * r, y, Math.sin(ang) * r, 0, up ? 1 : -1, 0, 0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5, cc));
      }
      for (let j = 0; j < seg; j++) {
        if (up) this.tri(ci, ring[j + 1], ring[j]); else this.tri(ci, ring[j], ring[j + 1]);
      }
    };
    if (o.closeTop && prof[prof.length - 1][0] > 1e-4) disc(prof[prof.length - 1][1], prof[prof.length - 1][0], true, Array.isArray(o.colors) ? o.colors[prof.length - 1] : col);
    if (o.closeBottom && prof[0][0] > 1e-4) disc(prof[0][1], prof[0][0], false, Array.isArray(o.colors) ? o.colors[0] : col);
  }

  // Ellipsoid via lathe.
  ellipsoid(cx, cy, cz, rx, ry, rz, col, o = {}) {
    const n = o.rings || 8;
    const prof = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      prof.push([Math.max(1e-4, Math.cos(a)), Math.sin(a)]);
    }
    this.save();
    this.apply(_m.compose(_p.set(cx, cy, cz), _q.identity(), _s.set(rx, ry, rz)));
    this.lathe(prof, col, { seg: o.seg || 10 });
    this.restore();
  }

  // ----- three.js geometry import -----
  // Copy a BufferGeometry in (positions transformed by the current frame). o.uv: [su, sv] divides UVs.
  geo(g, col, o = {}) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const base = this.count;
    col = C(col);
    const [su, sv] = o.uv || [1, 1];
    for (let i = 0; i < pos.count; i++) {
      this.v(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0,
        uv ? uv.getX(i) / su : 0, uv ? uv.getY(i) / sv : 0, o.colorFn ? o.colorFn(i, pos.getX(i), pos.getY(i), pos.getZ(i)) : col);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.i.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.i.push(base + i);
  }

  // Extrude a THREE.Shape (or point list) along +Z by depth. UVs are meters / uv.
  extrude(shapeOrPts, depth, col, o = {}) {
    let shape = shapeOrPts;
    if (Array.isArray(shapeOrPts)) shape = new THREE.Shape(shapeOrPts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 1, curveSegments: o.curve || 6 });
    this.geo(g, col, { uv: o.uv || [1.0, 1.0], colorFn: o.colorFn });
    g.dispose();
  }

  // ----- parametric grids -----
  // rows[i][j] are Vector3 / [x,y,z]. Normals are smooth (central differences) unless o.flat.
  // o: col | colorFn(i,j,p), baseFn(i,j,p)->[x,y,z], flip, uv:[su,sv], uvFn(i,j,cumI,cumJ)->[u,v], uo, vo
  grid(rows, col, o = {}) {
    const ni = rows.length, nj = rows[0].length;
    const P = rows.map((r) => r.map((p) => new THREE.Vector3().fromArray(arr3(p))));
    const [su, sv] = o.uv || this.uvs;
    // Cumulative lengths for UVs.
    const cumI = P.map(() => new Array(nj).fill(0)), cumJ = P.map(() => new Array(nj).fill(0));
    for (let i = 0; i < ni; i++) {
      for (let j = 1; j < nj; j++) cumJ[i][j] = cumJ[i][j - 1] + P[i][j].distanceTo(P[i][j - 1]);
    }
    for (let j = 0; j < nj; j++) {
      for (let i = 1; i < ni; i++) cumI[i][j] = cumI[i - 1][j] + P[i][j].distanceTo(P[i - 1][j]);
    }
    const idx = [];
    const sgn = o.flip ? -1 : 1;
    const dPi = new THREE.Vector3(), dPj = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 0; i < ni; i++) {
      idx.push([]);
      for (let j = 0; j < nj; j++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(ni - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nj - 1, j + 1);
        dPi.subVectors(P[i1][j], P[i0][j]);
        dPj.subVectors(P[i][j1], P[i][j0]);
        nrm.crossVectors(dPj, dPi).multiplyScalar(sgn);
        if (nrm.lengthSq() < 1e-14) nrm.set(0, 1, 0); else nrm.normalize();
        const p = P[i][j];
        const cc = o.colorFn ? o.colorFn(i, j, p) : C(col);
        let u, vv;
        if (o.uvFn) [u, vv] = o.uvFn(i, j, cumI[i][j], cumJ[i][j]);
        else { u = cumJ[i][j] / su + (o.uo || 0); vv = cumI[i][j] / sv + (o.vo || 0); }
        if (o.baseFn) {
          const bp = o.baseFn(i, j, p);
          idx[i].push(this.v(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, u, vv, cc, bp[0], bp[1], bp[2]));
        } else idx[i].push(this.v(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, u, vv, cc));
      }
    }
    for (let i = 0; i < ni - 1; i++) {
      for (let j = 0; j < nj - 1; j++) {
        const a = idx[i][j], b = idx[i][j + 1], c = idx[i + 1][j], d = idx[i + 1][j + 1];
        if (sgn > 0) { this.tri(a, b, c); this.tri(b, d, c); } else { this.tri(a, c, b); this.tri(b, c, d); }
      }
    }
    return idx;
  }

  // ----- output -----
  build() {
    if (this.empty) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.b) g.setAttribute('snowBase', new THREE.Float32BufferAttribute(this.b, 3));
    const n = this.p.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
