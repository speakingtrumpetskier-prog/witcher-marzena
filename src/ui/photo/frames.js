// Crops and borders for photo mode.
//
//   CROPS                       [{ id, label, aspect }]; aspect null keeps the screen's own shape
//   cropRect(aspect, w, h)      the crop as [x0, y0, x1, y1] in uv (y up), centred, as large as fits
//   BORDERS                     ['None', 'Mat', 'Paper cut']
//   paintBorder(kind, w, h, seed)  a canvas (w x h, transparent where the photo shows) or null for 'None'.
//                               'Mat' is a plain cream margin; 'Paper cut' adds a red cut strip around the
//                               opening and a rosette in each corner, from the same cutter as the menus.
import { gwiazdaPath, strip, FOLK_RED } from '../wycinanki.js';

export const CROPS = [
  { id: 'screen', label: 'Screen', aspect: null },
  { id: 'wide', label: 'Wide', aspect: 2.39 },
  { id: 'portrait', label: '4:5', aspect: 0.8 },
  { id: 'square', label: 'Square', aspect: 1 },
];

export const BORDERS = ['None', 'Mat', 'Paper cut'];

export function cropRect(aspect, w, h) {
  if (!aspect) return [0, 0, 1, 1];
  const screen = w / h;
  if (aspect >= screen) {
    const hh = screen / aspect;
    return [0, 0.5 - hh / 2, 1, 0.5 + hh / 2];
  }
  const ww = aspect / screen;
  return [0.5 - ww / 2, 0, 0.5 + ww / 2, 1];
}

const PAPER = '#efe7d6';
const PAPER_EDGE = '#d9cdb5';

const cache = new Map();

export function paintBorder(kind, w, h, seed = 3) {
  if (kind === 'None' || !kind) return null;
  w = Math.max(16, Math.round(w));
  h = Math.max(16, Math.round(h));
  const key = `${kind}|${w}|${h}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.size > 6) cache.clear();
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const s = Math.min(w, h);
  const m = Math.round(s * (kind === 'Mat' ? 0.045 : 0.075)); // margin

  // The paper, with the opening cut out of it.
  g.fillStyle = PAPER;
  g.beginPath();
  g.rect(0, 0, w, h);
  g.rect(m, m, w - 2 * m, h - 2 * m);
  g.fill('evenodd');
  // A faint fibre texture and a shadow line where the paper lifts off the print.
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.rect(m, m, w - 2 * m, h - 2 * m);
  g.clip('evenodd');
  g.globalAlpha = 0.06;
  g.strokeStyle = '#7a6a50';
  g.lineWidth = Math.max(1, s / 900);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, L = s * (0.004 + rnd() * 0.012);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = Math.max(1, s / 500);
  g.strokeRect(m + 0.5, m + 0.5, w - 2 * m - 1, h - 2 * m - 1);

  if (kind === 'Paper cut') {
    // The cut strip runs round the opening, a little inside the paper edge.
    const sh = Math.round(m * 0.34);
    const gap = Math.round(m * 0.2);
    const run = (len) => {
      const el = strip(seed, { w: len, h: sh, color: FOLK_RED });
      return new Path2D(el.querySelector('path').getAttribute('d'));
    };
    g.fillStyle = FOLK_RED;
    // Each strip covers [x, x + len] by [y, y + sh] (the vertical ones turned a quarter round).
    const o = m - gap - sh;
    const sides = [
      [o, o, w - 2 * o, 0],
      [o, h - m + gap, w - 2 * o, 0],
      [o, o, h - 2 * o, Math.PI / 2],
      [w - m + gap, o, h - 2 * o, Math.PI / 2],
    ];
    for (const [x, y, len, rot] of sides) {
      g.save();
      g.translate(x, y);
      if (rot) { g.rotate(rot); g.translate(0, -sh); }
      g.fill(run(len), 'evenodd');
      g.restore();
    }
    // A rosette over each corner, where the strips cross.
    const R = m * 0.55, c0 = o + sh / 2;
    for (const [cx, cy] of [[c0, c0], [w - c0, c0], [c0, h - c0], [w - c0, h - c0]]) {
      g.save();
      g.translate(cx - R, cy - R);
      g.scale(R / 100, R / 100);
      g.fillStyle = PAPER;
      g.beginPath();
      g.arc(100, 100, 98, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = FOLK_RED;
      g.fill(new Path2D(gwiazdaPath(seed + 2)), 'evenodd');
      g.restore();
    }
  }
  cache.set(key, cv);
  return cv;
}
