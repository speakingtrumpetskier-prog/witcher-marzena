// Procedural rest-pose geometry for the sky spirits (platnicy). Every species is a handful of
// parts merged into one InstancedBufferGeometry; the vertex shader (shaders.js) animates all of
// it, so nothing here moves. Units are bell radii (R = 1): the instance scale turns them into
// meters.
//
// Vertex attributes (besides position and normal):
//   aInfo = (part, u, v, rnd)   part id (PART), u 0..1 around, v 0..1 along the part, rnd 0..1
//   aAux  = part specific: ribbons (side or across, width mult, rank, length mult),
//           billboards (corner x, corner y, size, intensity), gonads (a, f, hash, 0)
//
// Exports: PART, buildGeometry(recipe, detail, seed), profile(name, v).
import * as THREE from 'three';
import { rng } from '../../core/util.js';

export const PART = {
  SHELL: 0, // bell or body surface (double sided)
  SKIRT: 1, // frilled hem hanging below the bell margin
  CORE: 2, // camera facing glow quad
  GONAD: 3, // flat glowing ring on the subumbrella
  ARM: 4, // frilly oral arm (ribbon with ruffled edges)
  TENT: 5, // tentacle filament (camera facing ribbon)
  PINN: 6, // short side filament growing from a tentacle
  GUT: 7, // fat glowing tube (manubrium, comb jelly gut)
};

const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Shell profiles: v 0 (apex) .. 1 (margin) -> [radius, height]. The margin sits at y = 0 and
// the apex is up. Ovoid is a closed body: v 0 top pole .. 1 bottom pole.
const PROFILES = {
  bell: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.8) * (1 + 0.14 * sm(0.8, 1, v)), 1.55 * Math.pow(Math.cos(a), 1.05)];
  },
  saucer: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.92), 0.36 * Math.pow(Math.cos(a), 1.2) - 0.05 * sm(0.75, 1, v)];
  },
  lantern: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.28) * (1 - 0.05 * sm(0.7, 1, v)), 1.05 * Math.pow(Math.cos(a), 0.7)];
  },
  dome: (v) => {
    const a = v * Math.PI * 0.5;
    return [Math.pow(Math.sin(a), 0.9) * (1 - 0.1 * sm(0.8, 1, v)), 0.8 * Math.pow(Math.cos(a), 0.95)];
  },
  cathedral: (v) => {
    const a = v * Math.PI * 0.5;
    const spire = 0.5 * Math.pow(1 - v, 7);
    return [Math.pow(Math.sin(a), 0.78) * (1 + 0.1 * sm(0.82, 1, v)), 1.25 * Math.pow(Math.cos(a), 1.1) + spire];
  },
  ovoid: (v) => {
    const a = v * Math.PI;
    return [0.5 * Math.pow(Math.sin(a), 0.55) * (1 + 0.22 * (0.5 - v)), 0.75 - 1.5 * v];
  },
};
export function profile(name, v) { return PROFILES[name](v); }

class Acc {
  constructor() { this.pos = []; this.nor = []; this.info = []; this.aux = []; this.idx = []; }
  v(p, n, info, aux) {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.info.push(info[0], info[1], info[2], info[3]);
    this.aux.push(aux[0], aux[1], aux[2], aux[3]);
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // Rows of `cols + 1` vertices starting at index `base`, joined into quads.
  strip(base, rows, cols) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        this.tri(a, c, b);
        this.tri(b, c, d);
      }
    }
  }
  build() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.aux, 4));
    g.setIndex(this.idx);
    g.userData.tris = this.idx.length / 3;
    return g;
  }
}

// ---- parts ------------------------------------------------------------------------------

function addShell(acc, profName, nu, nv, part = PART.SHELL, cluster = 1.0) {
  const base = acc.pos.length / 3;
  for (let j = 0; j <= nv; j++) {
    // Rings crowd toward the margin (cluster > 1) where the frill and lobes need them.
    const t = j / nv;
    const v = cluster === 1 ? t : 1 - Math.pow(1 - t, cluster);
    const e = 0.002;
    const v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
    const [r, y] = PROFILES[profName](v);
    const [ra, ya] = PROFILES[profName](v0), [rb, yb] = PROFILES[profName](v1);
    const dr = rb - ra, dy = yb - ya;
    const nl = Math.hypot(dr, dy) || 1;
    const nr = -dy / nl, ny = dr / nl;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = u * TAU;
      const c = Math.cos(th), s = Math.sin(th);
      acc.v([r * c, y, r * s], [nr * c, ny, nr * s], [part, u, v, 0], [0, 0, 0, 0]);
    }
  }
  acc.strip(base, nv, nu);
}

// Frilled hem: rows hang below the margin; the shader ruffles them.
function addSkirt(acc, profName, nu, rows) {
  const [rm, ym] = PROFILES[profName](1);
  const base = acc.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    const q = j / rows;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = u * TAU;
      acc.v([rm * Math.cos(th), ym, rm * Math.sin(th)], [Math.cos(th), 0, Math.sin(th)], [PART.SKIRT, u, q, 0], [0, 0, 0, 0]);
    }
  }
  acc.strip(base, rows, nu);
}

// Glow quads at the bell center: the lamp itself (kind 0) and a wide faint halo (kind 1).
function addCore(acc, y, size, halo = 0, haloI = 0.2) {
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const quad = (sz, kind, inten) => {
    const ids = corners.map(([cx, cy]) => acc.v([0, y, 0], [0, 0, 1], [PART.CORE, 0, 0, inten], [cx, cy, sz, kind]));
    acc.tri(ids[0], ids[1], ids[2]);
    acc.tri(ids[1], ids[3], ids[2]);
  };
  quad(size, 0, 1);
  if (halo > 0) quad(halo, 1, haloI);
}

// Flat ring (annulus) lying on the subumbrella; `gap` radians left open for a horseshoe.
function addGonad(acc, cx, cy, cz, radius, halfW, segs, vShell, hash, tilt = 0) {
  const base = acc.pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const a = i / segs, th = a * TAU;
    for (let f = 0; f <= 1; f++) {
      const rr = radius + (f * 2 - 1) * halfW;
      const px = cx + Math.cos(th) * rr, pz = cz + Math.sin(th) * rr;
      acc.v([px, cy + Math.sin(th) * rr * tilt, pz], [0, 1, 0], [PART.GONAD, a, vShell, hash], [a, f, hash, 0]);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2;
    acc.tri(a, a + 1, a + 2);
    acc.tri(a + 1, a + 3, a + 2);
  }
}

// Filament ribbons. `roots` are rest-pose root positions (the shader re-deforms them with the
// bell). rank spreads evenly so dropping the highest ranks thins the fringe evenly. The normal
// slot is free on ribbons and carries (own length, 0, rank) for the pinnules to read.
// Returns the per-tentacle data pinnules need.
function addTentacles(acc, roots, segs, width, len, rnd) {
  return roots.map((root, k) => {
    const rank = (k * 0.6180339887 + 0.37) % 1;
    const th = Math.atan2(root[2], root[0]);
    const u = ((th / TAU) + 1) % 1;
    const rr = rnd();
    const lm = len * (0.75 + 0.5 * rnd());
    const base = acc.pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const s = j / segs;
      for (let side = -1; side <= 1; side += 2) {
        acc.v(root, [lm, 0, rank], [PART.TENT, u, s, rr], [side, width, rank, lm]);
      }
    }
    for (let j = 0; j < segs; j++) {
      const a = base + j * 2;
      acc.tri(a, a + 1, a + 2);
      acc.tri(a + 1, a + 3, a + 2);
    }
    return { root, u, rr, lm, rank };
  });
}

// Pinnules: short side filaments sprouting from a parent tentacle at parameter s0 (aAux.z).
// normal = (parent length, direction angle, parent rank).
function addPinnules(acc, tents, per, segs, plen, width, rnd) {
  for (const t of tents) {
    for (let p = 0; p < per; p++) {
      const s0 = 0.1 + 0.86 * (p + rnd() * 0.7) / per;
      const ang = rnd() * TAU;
      const base = acc.pos.length / 3;
      const len = plen * (0.6 + 0.8 * rnd());
      for (let j = 0; j <= segs; j++) {
        const s = j / segs;
        for (let side = -1; side <= 1; side += 2) {
          acc.v(t.root, [t.lm, ang, t.rank], [PART.PINN, t.u, s, t.rr], [side, width, s0, len]);
        }
      }
      for (let j = 0; j < segs; j++) {
        const a = base + j * 2;
        acc.tri(a, a + 1, a + 2);
        acc.tri(a + 1, a + 3, a + 2);
      }
    }
  }
}

// Oral arms: wide ribbons with several vertices across so the edges can ruffle.
function addArms(acc, roots, segs, across, len, width, rnd) {
  roots.forEach((root, k) => {
    const th = Math.atan2(root[2], root[0]);
    const u = ((th / TAU) + 1) % 1;
    const lm = len * (0.8 + 0.4 * rnd());
    const rr = rnd();
    const base = acc.pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const s = j / segs;
      for (let i = 0; i <= across; i++) {
        const x = -1 + (2 * i) / across;
        acc.v(root, [0, 0, 1], [PART.ARM, u, s, rr], [x, width, k, lm]);
      }
    }
    acc.strip(base, segs, across);
  });
}

// A single fat camera facing strip along a vertical path (manubrium, gut).
function addGut(acc, root, segs, widthMul, lenMul) {
  const base = acc.pos.length / 3;
  for (let j = 0; j <= segs; j++) {
    const s = j / segs;
    for (let side = -1; side <= 1; side += 2) {
      acc.v(root, [0, 0, 1], [PART.GUT, 0, s, 0], [side, widthMul, 0, lenMul]);
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = base + j * 2;
    acc.tri(a, a + 1, a + 2);
    acc.tri(a + 1, a + 3, a + 2);
  }
}

// ---- recipe -> geometry -------------------------------------------------------------------
// recipe: {
//   profile, shell: [nu, nv], cluster, skirt: [nu, rows] | null,
//   core: { y, size, halo } | null (lamp quad and an optional wide halo quad),
//   gonads: [{ cx, cz, radius, halfW, v, segs, tilt }...] (height taken from the profile),
//   arms: { n, rootR, rootV, rootY, off, segs, across, len, width } | null,
//   tent: { n, segs, rootR (of margin radius), width, len, jitter, off, roots? } | null,
//   fringe: { n, segs, width, len, rootR } | null,
//   pinn: { per, segs, len, width } | null,   (on `tent`)
//   gut: { y, segs, width, len } | null
// }
// detail scales segment counts: 1 = full, <1 = far LOD.
export function buildGeometry(recipe, detail = 1, seed = 1) {
  const rnd = rng(seed);
  const acc = new Acc();
  const d = (n, min = 2) => Math.max(min, Math.round(n * detail));
  const prof = recipe.profile;
  const [rm, ym] = PROFILES[prof](1);

  if (recipe.shell) addShell(acc, prof, d(recipe.shell[0], 12), d(recipe.shell[1], 4), PART.SHELL, recipe.cluster || 1);
  if (recipe.skirt) addSkirt(acc, prof, d(recipe.skirt[0], 12), Math.max(1, Math.round(recipe.skirt[1] * Math.min(1, detail * 1.5))));
  if (recipe.core) addCore(acc, recipe.core.y, recipe.core.size, recipe.core.halo || 0, recipe.core.haloI ?? 0.2);

  if (recipe.gonads) {
    for (const g of recipe.gonads) {
      const py = PROFILES[prof](g.v)[1];
      addGonad(acc, g.cx, py * 0.9, g.cz, g.radius, g.halfW, d(g.segs || 22, 8), g.v, rnd(), g.tilt || 0);
    }
  }

  if (recipe.arms) {
    const a = recipe.arms;
    const ry = PROFILES[prof](a.rootV ?? 0.3)[1] * (a.rootY ?? 0.6);
    const roots = [];
    for (let k = 0; k < a.n; k++) {
      const th = (k / a.n) * TAU + (a.off || 0.4);
      const rr = a.rootR ?? 0.12;
      roots.push([Math.cos(th) * rr, ry, Math.sin(th) * rr]);
    }
    addArms(acc, roots, d(a.segs, 5), a.across >= 4 && detail < 0.6 ? 2 : a.across, a.len, a.width, rnd);
  }

  if (recipe.tent) {
    const t = recipe.tent;
    let roots = t.roots;
    if (!roots) {
      roots = [];
      const n = Math.max(2, Math.round(t.n * (detail < 0.6 ? 0.6 : 1)));
      for (let k = 0; k < n; k++) {
        const th = ((k + (t.jitter ?? 0.2) * (rnd() - 0.5)) / n) * TAU + (t.off || 0);
        const rr = rm * (t.rootR ?? 0.94);
        roots.push([Math.cos(th) * rr, ym, Math.sin(th) * rr]);
      }
    }
    const tents = addTentacles(acc, roots, d(t.segs, 5), t.width, t.len, rnd);
    if (recipe.pinn && detail >= 0.6) addPinnules(acc, tents, recipe.pinn.per, recipe.pinn.segs, recipe.pinn.len, recipe.pinn.width, rnd);
  }

  if (recipe.fringe && detail >= 0.35) {
    const f = recipe.fringe;
    const roots = [];
    const n = Math.max(6, Math.round(f.n * Math.min(1, detail * 1.3)));
    for (let k = 0; k < n; k++) {
      const th = ((k + 0.3 * (rnd() - 0.5)) / n) * TAU;
      const rr = rm * (f.rootR ?? 1.0);
      roots.push([Math.cos(th) * rr, ym, Math.sin(th) * rr]);
    }
    addTentacles(acc, roots, d(f.segs, 3), f.width, f.len, rnd);
  }

  if (recipe.gut) addGut(acc, [0, recipe.gut.y, 0], d(recipe.gut.segs, 4), recipe.gut.width, recipe.gut.len || 1);

  const g = acc.build();
  g.userData.recipe = recipe;
  return g;
}
