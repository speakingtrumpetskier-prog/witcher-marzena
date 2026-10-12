// Wycinanki: Polish folk paper-cuts, generated (owned by the lead). One colour of paper, folded and cut:
// every design is symmetric, solid paper with holes cut through it (SVG even-odd fill), so nested
// shapes alternate paper and hole the way real cuts do.
//
//   gwiazda(seed, { size, color })   a round "star" rosette (Kurpie gwiazda): scalloped rim, rings of
//                                    teardrop and round cuts, a cut flower at the heart
//   leluja(seed, { w, h, color })    the tree of life: a stem in a pot, leaves curling up in pairs,
//                                    two birds facing the stem, a rosette flower at the top
//   strip(seed, { w, h, color })     a running border of scallops, diamonds and dots
// Each returns an SVG element (class 'wyc'); the same seed always gives the same cut.
import { svg } from './dom.js';

export const FOLK_RED = '#b23b2b';

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const f = (v) => +v.toFixed(2);
const P = (x, y) => `${f(x)} ${f(y)}`;

// A closed teardrop: round end at (x, y), tip pointing along angle a, length L, half width w.
function teardrop(x, y, a, L, w) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const tip = [x + c * L, y + s * L];
  const l = [x + nx * w, y + ny * w], r = [x - nx * w, y - ny * w];
  const back = [x - c * w * 1.1, y - s * w * 1.1];
  return `M${P(...tip)} Q${P(l[0] + c * L * 0.35, l[1] + s * L * 0.35)} ${P(...l)} Q${P(back[0] + nx * w, back[1] + ny * w)} ${P(...back)} Q${P(back[0] - nx * w, back[1] - ny * w)} ${P(...r)} Q${P(r[0] + c * L * 0.35, r[1] + s * L * 0.35)} ${P(...tip)}Z`;
}
const circle = (x, y, r) => `M${P(x + r, y)} A${f(r)} ${f(r)} 0 1 0 ${P(x - r, y)} A${f(r)} ${f(r)} 0 1 0 ${P(x + r, y)}Z`;
function diamond(x, y, a, L, w) {
  const c = Math.cos(a), s = Math.sin(a);
  return `M${P(x + c * L, y + s * L)} L${P(x - s * w, y + c * w)} L${P(x - c * L, y - s * L)} L${P(x + s * w, y - c * w)}Z`;
}
// A closed outline r(theta) around (cx, cy).
function radial(cx, cy, rf, steps = 240) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2, r = rf(t);
    d += `${i ? 'L' : 'M'}${P(cx + Math.cos(t) * r, cy + Math.sin(t) * r)}`;
  }
  return d + 'Z';
}

function wrap(d, vb, cls, color, size) {
  const style = size ? ` width="${size.w}" height="${size.h}"` : '';
  return svg(`<svg viewBox="${vb}"${style} aria-hidden="true"><path d="${d}" fill="${color}" fill-rule="evenodd"/></svg>`, `wyc ${cls}`);
}

// The round gwiazda.
export function gwiazdaPath(seed, cx = 100, cy = 100, R = 96) {
  const r = rng(seed);
  const n = [8, 10, 12, 16][Math.floor(r() * 4)];
  const sc = R / 96;
  const rimAmp = 3 + r() * 4, lobes = r() < 0.5 ? n * 2 : n;
  let d = radial(cx, cy, (t) => (88 + rimAmp * Math.cos(lobes * t) + 2 * Math.cos(lobes * 2 * t)) * sc);
  const ph = Math.PI / n;
  // outer ring of small round cuts between the scallops
  for (let i = 0; i < lobes; i++) d += circle(cx + Math.cos((i + 0.5) * Math.PI * 2 / lobes) * 80 * sc, cy + Math.sin((i + 0.5) * Math.PI * 2 / lobes) * 80 * sc, (2.4 + r() * 1.2) * sc);
  // ring of teardrop cuts pointing out, and between them diamonds pointing in
  const tdL = (20 + r() * 8) * sc, tdW = (6 + r() * 3) * sc;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += teardrop(cx + Math.cos(a) * 50 * sc, cy + Math.sin(a) * 50 * sc, a, tdL, tdW);
    const b = a + ph;
    d += diamond(cx + Math.cos(b) * 64 * sc, cy + Math.sin(b) * 64 * sc, b, 7 * sc, 3 * sc);
  }
  // inside each teardrop cut, a paper seed left standing (even-odd fills it back)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += circle(cx + Math.cos(a) * (50 + tdL * 0.35) * sc, cy + Math.sin(a) * (50 + tdL * 0.35) * sc, 2.2 * sc);
  }
  // the heart: a cut ring with a paper flower in it
  d += circle(cx, cy, 30 * sc);
  const m = n >= 12 ? n / 2 : n;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + ph;
    d += teardrop(cx + Math.cos(a) * 6 * sc, cy + Math.sin(a) * 6 * sc, a, 19 * sc, 5.5 * sc);
  }
  d += circle(cx, cy, 5 * sc);
  d += circle(cx, cy, 2.4 * sc);
  return d;
}
export function gwiazda(seed, { size = 64, color = FOLK_RED, cls = '' } = {}) {
  return wrap(gwiazdaPath(seed), '0 0 200 200', `wyc-gwiazda ${cls}`, color, { w: size, h: size });
}

// The tree of life: built on the left of the stem and mirrored.
export function leluja(seed, { w = 120, h = 200, color = FOLK_RED, cls = '' } = {}) {
  const r = rng(seed + 7);
  const cx = 60;
  const half = [];
  // pot (a heart-like base) and the stem
  let d = `M${P(cx - 4, 172)} L${P(cx - 4, 52)} L${P(cx + 4, 52)} L${P(cx + 4, 172)}Z`;
  d += `M${P(cx, 196)} C${P(cx - 34, 196)} ${P(cx - 30, 168)} ${P(cx - 12, 166)} L${P(cx + 12, 166)} C${P(cx + 30, 168)} ${P(cx + 34, 196)} ${P(cx, 196)}Z`;
  d += circle(cx - 9, 182, 3) + circle(cx + 9, 182, 3) + diamond(cx, 182, Math.PI / 2, 5, 2.5);
  // leaf pairs curling up and out
  const pairs = 3 + Math.floor(r() * 2);
  for (let k = 0; k < pairs; k++) {
    const y = 156 - k * (90 / pairs) - r() * 4;
    const L = 30 - k * 4 + r() * 6, ang = -0.55 - k * 0.12;
    half.push(teardrop(cx - 3, y, Math.PI + ang, L, 7 - k * 0.6));
    half.push(circle(cx - 3 - Math.cos(ang) * L * 0.55, y + Math.sin(ang) * L * 0.55 - 1, 2));
  }
  // a bird facing the stem, perched on the second leaf
  const by = 108 - r() * 8, bx = cx - 30;
  half.push(`M${P(bx - 12, by + 2)} C${P(bx - 10, by - 10)} ${P(bx + 8, by - 12)} ${P(bx + 14, by - 4)} L${P(bx + 20, by - 3)} L${P(bx + 14, by + 1)} C${P(bx + 10, by + 8)} ${P(bx - 4, by + 9)} ${P(bx - 12, by + 2)}Z`);
  half.push(`M${P(bx - 11, by + 1)} L${P(bx - 24, by - 8)} L${P(bx - 22, by + 4)} L${P(bx - 26, by + 9)}Z`);
  half.push(circle(bx + 8, by - 4, 1.6));
  half.push(teardrop(bx - 2, by, Math.PI * 1.05, 9, 3));
  for (const s of half) d += s + mirror(s, cx);
  // the crown: a small rosette at the top of the stem
  d += gwiazdaPath(seed + 3, cx, 34, 30);
  return wrap(d, '0 0 120 200', `wyc-leluja ${cls}`, color, { w, h });
}
// Mirror a path's x coordinates about x = cx (paths here are absolute M/L/Q/C/A commands).
function mirror(d, cx) {
  return d.replace(/([MLQCA])([^MLQCAZ]*)/g, (m0, cmd, args) => {
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'A') { // rx ry rot large sweep x y: flip the sweep, mirror x
      for (let i = 0; i + 6 < nums.length + 1; i += 7) { nums[i + 4] = nums[i + 4] ? 0 : 1; nums[i + 5] = 2 * cx - nums[i + 5]; }
    } else {
      for (let i = 0; i < nums.length; i += 2) nums[i] = 2 * cx - nums[i];
    }
    return `${cmd}${nums.map(f).join(' ')}`;
  });
}

// A running border.
export function strip(seed, { w = 240, h = 14, color = FOLK_RED, cls = '' } = {}) {
  const r = rng(seed + 11);
  const n = Math.max(6, Math.round(w / (h * 1.6)));
  const step = w / n;
  let d = `M0 ${f(h * 0.42)} L${f(w)} ${f(h * 0.42)} L${f(w)} ${f(h * 0.58)} L0 ${f(h * 0.58)}Z`;
  const tri = r() < 0.5;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step;
    if (tri) d += `M${P(x - step * 0.42, h * 0.42)} L${P(x, 0)} L${P(x + step * 0.42, h * 0.42)}Z M${P(x - step * 0.42, h * 0.58)} L${P(x, h)} L${P(x + step * 0.42, h * 0.58)}Z`;
    else d += diamond(x, h / 2, 0, step * 0.42, h * 0.5);
    d += circle(x, h / 2, h * 0.13);
  }
  return wrap(d, `0 0 ${f(w)} ${f(h)}`, `wyc-strip ${cls}`, color, { w, h });
}
