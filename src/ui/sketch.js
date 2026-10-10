// Little ink sketches drawn on canvas for the bestiary and for the child's drawing note.
// Loose, doubled pen lines with a sepia wash: field-notebook drawings, not illustrations.
import { rng } from '../core/util.js';

const INK = '#2b2016';
const INK_SOFT = 'rgba(43,32,22,0.55)';

function pen(ctx, pts, r, { w = 1.4, j = 1.2, col = INK, close = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const p = pts.map(([x, y]) => [x + (r() - 0.5) * j, y + (r() - 0.5) * j]);
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
  }
  const l = p[p.length - 1];
  ctx.lineTo(l[0], l[1]);
  if (close) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Two slightly different passes over the same outline give a hand-drawn doubled line.
function outline(ctx, pts, r, o = {}) {
  pen(ctx, pts, r, { ...o });
  pen(ctx, pts, r, { ...o, w: (o.w || 1.4) * 0.6, j: (o.j || 1.2) * 1.6, alpha: 0.55 });
}

function wash(ctx, pts, col) {
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hatch(ctx, r, x0, y0, x1, y1, n, len, ang = 0.9, col = INK_SOFT, w = 0.8) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    const l = len * (0.6 + r() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l);
    ctx.stroke();
  }
  ctx.restore();
}

function wolf(ctx, r) {
  // Washes first, then the line work over them.
  wash(ctx, [[84, 74], [150, 62], [206, 70], [238, 84], [236, 114], [180, 126], [100, 124], [72, 104]], 'rgba(120,98,70,0.28)');
  wash(ctx, [[230, 82], [262, 92], [294, 104], [284, 114], [244, 116]], 'rgba(120,98,70,0.3)');
  const body = [[62, 92], [90, 72], [138, 64], [182, 68], [214, 76], [238, 84], [262, 92], [292, 102], [296, 110], [270, 116], [248, 118], [236, 130], [214, 128], [170, 126], [120, 126], [92, 122], [72, 108], [62, 92]];
  outline(ctx, body, r, { w: 1.6 });
  // ear, eye
  outline(ctx, [[240, 84], [244, 52], [258, 82]], r, { w: 1.3 });
  pen(ctx, [[262, 96], [270, 95]], r, { w: 1.8, j: 0.4 });
  pen(ctx, [[292, 103], [296, 105]], r, { w: 3, j: 0.3 });
  // tail
  outline(ctx, [[64, 92], [40, 108], [24, 140], [32, 142], [52, 118], [70, 104]], r, { w: 1.4 });
  // legs
  outline(ctx, [[214, 128], [220, 160], [218, 190], [232, 192], [234, 160], [238, 128]], r, { w: 1.4 });
  outline(ctx, [[176, 126], [172, 160], [168, 190], [182, 192], [188, 160], [196, 128]], r, { w: 1.4 });
  outline(ctx, [[96, 118], [84, 150], [88, 190], [102, 192], [106, 156], [122, 126]], r, { w: 1.4 });
  outline(ctx, [[120, 126], [124, 160], [128, 190], [142, 192], [142, 158], [150, 126]], r, { w: 1.4 });
  // fur strokes
  hatch(ctx, r, 90, 72, 230, 104, 90, 9, 1.0);
  hatch(ctx, r, 200, 74, 236, 112, 24, 7, 0.4);
  hatch(ctx, r, 100, 112, 200, 124, 34, 8, 1.2, INK_SOFT);
  // ground line
  pen(ctx, [[40, 196], [120, 198], [210, 195], [290, 197]], r, { w: 1, j: 2, alpha: 0.5 });
}

function marzanny(ctx, r) {
  const cx = 160;
  // straw body, many vertical strokes
  hatch(ctx, r, cx - 38, 80, cx + 38, 120, 120, 70, Math.PI / 2 + 0.05, 'rgba(120,92,40,0.7)', 1.1);
  // dress (white, left bare) with torn hem
  const dress = [[cx - 20, 88], [cx - 46, 196], [cx - 36, 206], [cx - 24, 198], [cx - 12, 210], [cx, 200], [cx + 12, 211], [cx + 26, 199], [cx + 38, 207], [cx + 46, 196], [cx + 20, 88]];
  wash(ctx, dress, 'rgba(244,238,224,0.8)');
  outline(ctx, dress, r, { w: 1.5 });
  for (let i = -3; i <= 3; i++) pen(ctx, [[cx + i * 7, 112], [cx + i * 12, 150], [cx + i * 15, 198]], r, { w: 0.8, alpha: 0.45, j: 1.4 });
  // arms: straw bundles with a cross-pole
  outline(ctx, [[cx - 86, 96], [cx - 20, 94], [cx + 20, 94], [cx + 86, 96]], r, { w: 1.6 });
  hatch(ctx, r, cx - 90, 92, cx - 50, 130, 24, 30, Math.PI / 2 + 0.2, 'rgba(120,92,40,0.8)', 1);
  hatch(ctx, r, cx + 50, 92, cx + 90, 130, 24, 30, Math.PI / 2 - 0.2, 'rgba(120,92,40,0.8)', 1);
  // head
  wash(ctx, [[cx - 16, 40], [cx, 34], [cx + 16, 42], [cx + 14, 74], [cx, 84], [cx - 14, 74]], 'rgba(232,214,176,0.9)');
  outline(ctx, [[cx - 16, 40], [cx, 33], [cx + 16, 42], [cx + 14, 72], [cx, 84], [cx - 14, 72], [cx - 16, 40]], r, { w: 1.5 });
  pen(ctx, [[cx - 9, 54], [cx - 3, 55]], r, { w: 2, j: 0.3 });
  pen(ctx, [[cx + 3, 55], [cx + 9, 54]], r, { w: 2, j: 0.3 });
  pen(ctx, [[cx - 4, 68], [cx + 4, 68]], r, { w: 1.2, j: 0.3 });
  // straw hair
  hatch(ctx, r, cx - 18, 30, cx + 18, 40, 22, 18, -Math.PI / 2 + 0.3, 'rgba(120,92,40,0.8)', 1);
  // the red knot at the neck
  ctx.save();
  ctx.strokeStyle = '#9a2e22';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, 88);
  ctx.bezierCurveTo(cx - 14, 76, cx - 16, 96, cx, 88);
  ctx.bezierCurveTo(cx + 14, 76, cx + 16, 96, cx, 88);
  ctx.moveTo(cx, 88); ctx.lineTo(cx - 5, 102);
  ctx.moveTo(cx, 88); ctx.lineTo(cx + 5, 102);
  ctx.stroke();
  ctx.restore();
  pen(ctx, [[60, 208], [140, 210], [230, 207], [270, 209]], r, { w: 1, j: 2, alpha: 0.5 });
}

function marzanna(ctx, r) {
  const cx = 160;
  // hair: long lines drifting upward as if in water
  ctx.save();
  ctx.strokeStyle = 'rgba(43,32,22,0.7)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60 - 0.5) * 2.4;
    const x0 = cx + (r() - 0.5) * 18, y0 = 54 + r() * 10;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + Math.sin(a) * 40, y0 - 30, x0 + Math.sin(a * 2) * 70 + (r() - 0.5) * 20, y0 + 40, x0 + Math.sin(a) * 100, y0 + 100 + r() * 30);
    ctx.stroke();
  }
  ctx.restore();
  // dress of cloth and ice
  const dress = [[cx - 18, 82], [cx - 62, 190], [cx - 30, 176], [cx - 20, 208], [cx, 180], [cx + 20, 210], [cx + 30, 176], [cx + 62, 190], [cx + 18, 82]];
  wash(ctx, dress, 'rgba(236,244,244,0.85)');
  outline(ctx, dress, r, { w: 1.5 });
  for (let i = -4; i <= 4; i++) pen(ctx, [[cx + i * 5, 100], [cx + i * 12, 150], [cx + i * 14, 190]], r, { w: 0.8, alpha: 0.4, j: 1.6 });
  // long arms
  outline(ctx, [[cx - 14, 90], [cx - 56, 130], [cx - 70, 176]], r, { w: 1.3 });
  outline(ctx, [[cx + 14, 90], [cx + 56, 130], [cx + 70, 176]], r, { w: 1.3 });
  // head and crown of straw
  wash(ctx, [[cx - 11, 46], [cx, 40], [cx + 11, 46], [cx + 10, 74], [cx, 90], [cx - 10, 74]], 'rgba(226,236,236,0.9)');
  outline(ctx, [[cx - 11, 46], [cx, 40], [cx + 11, 46], [cx + 10, 74], [cx, 90], [cx - 10, 74], [cx - 11, 46]], r, { w: 1.4 });
  for (let i = -5; i <= 5; i++) pen(ctx, [[cx + i * 3.2, 44], [cx + i * 5, 26 - Math.abs(i) * -1.2]], r, { w: 1.1, j: 0.6 });
  ctx.fillStyle = '#3aa8b0';
  ctx.beginPath(); ctx.arc(cx - 4.5, 61, 1.7, 0, 7); ctx.arc(cx + 4.5, 61, 1.7, 0, 7); ctx.fill();
  pen(ctx, [[cx - 3, 77], [cx + 3, 77]], r, { w: 1, j: 0.2 });
  // ice shards
  for (let i = 0; i < 9; i++) {
    const x = 70 + r() * 180, h = 12 + r() * 22;
    outline(ctx, [[x, 206], [x + 4, 206 - h], [x + 9, 206]], r, { w: 1, j: 0.6, col: 'rgba(40,86,96,0.85)' });
  }
}

function iceLady(ctx, r) {
  // A child's charcoal drawing: tall triangle lady, round head, hair lines, wavy ice above.
  const col = '#3a3430';
  const chunky = (pts, w = 3.4) => pen(ctx, pts, r, { w, j: 3, col });
  ctx.fillStyle = 'rgba(58,52,48,0.1)';
  ctx.fillRect(0, 0, 320, 40);
  for (let k = 0; k < 4; k++) {
    const y = 14 + k * 9;
    const pts = [];
    for (let x = 0; x <= 320; x += 20) pts.push([x, y + Math.sin(x * 0.07 + k) * 3]);
    chunky(pts, 2.6);
  }
  chunky([[160, 60], [110, 190], [210, 190], [160, 60]]);
  ctx.beginPath(); ctx.arc(160, 56, 15, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 3.2; ctx.stroke();
  for (let i = -3; i <= 3; i++) chunky([[160 + i * 4, 42], [160 + i * 14, 94 + Math.abs(i) * 6]], 2.2);
  chunky([[152, 55], [153, 56]], 3); chunky([[168, 55], [169, 56]], 3);
  chunky([[154, 66], [160, 69], [167, 66]], 2);
  chunky([[140, 110], [112, 130]], 2.6); chunky([[180, 110], [208, 130]], 2.6);
  // a small figure beside her
  ctx.beginPath(); ctx.arc(262, 140, 8, 0, 7); ctx.stroke();
  chunky([[262, 148], [262, 176]], 2.6); chunky([[262, 156], [250, 166]], 2.4); chunky([[262, 156], [276, 166]], 2.4);
  chunky([[262, 176], [254, 194]], 2.4); chunky([[262, 176], [270, 194]], 2.4);
  hatch(ctx, r, 120, 120, 200, 186, 36, 14, 1.0, 'rgba(58,52,48,0.35)', 1.6);
}

// A platnik: a bell with its canals, a frilled hem and long threads, drawn small over a roofline
// so the size reads. Two little ones beside it.
function planetnik(ctx, r) {
  const bell = [[96, 92], [100, 62], [128, 38], [160, 32], [192, 38], [220, 62], [224, 92]];
  wash(ctx, [...bell, [200, 100], [160, 104], [120, 100]], 'rgba(150,190,200,0.22)');
  outline(ctx, bell, r, { w: 1.6 });
  outline(ctx, [[96, 92], [118, 100], [140, 96], [160, 102], [182, 96], [204, 100], [224, 92]], r, { w: 1.3 });
  for (let i = -3; i <= 3; i++) pen(ctx, [[160 + i * 4, 36], [160 + i * 17, 64], [160 + i * 21, 98]], r, { w: 0.8, alpha: 0.5, j: 1 });
  outline(ctx, [[110, 98], [120, 106], [132, 100], [144, 108], [158, 102], [172, 108], [186, 101], [200, 107], [212, 99]], r, { w: 0.9, j: 1.4 });
  // oral arms and threads
  outline(ctx, [[150, 100], [146, 124], [154, 146], [148, 168]], r, { w: 1.1, j: 1.6 });
  outline(ctx, [[170, 100], [176, 126], [168, 150], [174, 172]], r, { w: 1.1, j: 1.6 });
  for (const x of [112, 132, 190, 208]) {
    pen(ctx, [[x, 104], [x + (x < 160 ? -8 : 8), 140], [x + (x < 160 ? 4 : -4), 176], [x + (x < 160 ? -6 : 6), 200]], r, { w: 0.7, alpha: 0.6, j: 1.6 });
  }
  // two small ones
  for (const [x, y, k] of [[48, 56, 0.34], [276, 70, 0.28]]) {
    outline(ctx, [[x - 40 * k, y], [x - 30 * k, y - 22 * k], [x, y - 30 * k], [x + 30 * k, y - 22 * k], [x + 40 * k, y]], r, { w: 1, j: 0.8 });
    pen(ctx, [[x - 14 * k, y], [x - 20 * k, y + 50 * k], [x - 12 * k, y + 90 * k]], r, { w: 0.6, alpha: 0.6, j: 1 });
    pen(ctx, [[x + 14 * k, y], [x + 22 * k, y + 50 * k], [x + 12 * k, y + 90 * k]], r, { w: 0.6, alpha: 0.6, j: 1 });
  }
  // roofline and a spruce for scale
  outline(ctx, [[20, 206], [58, 206], [60, 206], [60, 194], [60, 192], [75, 184], [90, 176], [105, 184], [120, 192], [120, 194], [120, 206], [122, 206], [300, 206]], r, { w: 1.3, j: 0.8 });
  outline(ctx, [[248, 206], [256, 176], [262, 188], [268, 160], [276, 186], [282, 174], [290, 206]], r, { w: 1.1, j: 1 });
  hatch(ctx, r, 112, 50, 206, 84, 16, 9, 1.35, INK_SOFT, 0.7);
}

// Matka Chmur: the long lopsided vault with rows of lit windows and threads falling from its rim,
// over a village roofline and a spruce so the size reads. Drawn from the shore, looking up.
function matka(ctx, r) {
  const top = [[30, 100], [34, 74], [54, 50], [92, 38], [138, 40], [188, 48], [234, 58], [272, 68], [294, 84], [288, 96]];
  const hem = [[288, 96], [262, 104], [226, 100], [190, 106], [150, 101], [112, 107], [74, 102], [42, 108], [30, 100]];
  wash(ctx, [...top, ...hem.slice(1)], 'rgba(238,224,170,0.3)');
  outline(ctx, top, r, { w: 1.7 });
  outline(ctx, hem, r, { w: 1.3, j: 1.6 });
  // spires along the back
  for (const [x, y, h] of [[70, 44, 14], [112, 38, 10], [210, 54, 12], [250, 61, 15]]) pen(ctx, [[x, y], [x + 1, y - h], [x + 3, y]], r, { w: 1.1, j: 0.6 });
  // rows of lit windows inside the nave
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 11; i++) {
      const x = 56 + i * 20 + row * 8, y = 66 + row * 16 + Math.sin(i * 0.5) * 3;
      wash(ctx, [[x, y], [x + 7, y], [x + 7, y + 9], [x, y + 9]], 'rgba(246,206,110,0.55)');
      pen(ctx, [[x, y], [x + 7, y], [x + 7, y + 9], [x, y + 9], [x, y]], r, { w: 0.7, j: 0.6, alpha: 0.7 });
    }
  }
  // threads and veils hanging from the rim, long and uneven
  for (let i = 0; i < 26; i++) {
    const x = 40 + i * 9.6 + r() * 4, y = 102 + Math.sin(i * 0.7) * 3;
    const len = 30 + r() * 52;
    pen(ctx, [[x, y], [x + (r() - 0.5) * 6, y + len * 0.5], [x + (r() - 0.5) * 8, y + len]], r, { w: 0.6, alpha: 0.5, j: 1.2 });
  }
  hatch(ctx, r, 40, 44, 280, 96, 34, 9, 1.3, INK_SOFT, 0.7);
  // hill behind, a roofline and a spruce for scale
  outline(ctx, [[150, 206], [190, 190], [226, 184], [262, 176], [300, 180]], r, { w: 1.2, j: 1 });
  outline(ctx, [[20, 206], [48, 206], [48, 192], [64, 182], [80, 192], [80, 206], [96, 206], [96, 198], [108, 192], [120, 198], [120, 206], [140, 206]], r, { w: 1.3, j: 0.8 });
  outline(ctx, [[248, 206], [256, 176], [262, 188], [268, 160], [276, 186], [282, 174], [290, 206]], r, { w: 1.1, j: 1 });
  pen(ctx, [[60, 182], [60, 168]], r, { w: 0.9, j: 0.5, alpha: 0.7 });
}

// A child's drawing of the herders over the roofs: nineteen little bells with squiggly threads, one
// in pink, a house, and a stick child looking up with an open mouth. Counting is on the caption.
function childHerders(ctx, r) {
  const col = '#3a3430';
  const chunky = (pts, w = 3, c = col) => pen(ctx, pts, r, { w, j: 3, col: c });
  ctx.fillStyle = 'rgba(58,52,48,0.07)';
  ctx.fillRect(0, 0, 320, 30);
  // nineteen bells in four loose rows
  let n = 0;
  const rows = [[6, 24, 26], [5, 48, 52], [5, 22, 84], [3, 52, 118]];
  rows.forEach(([count, x0, y]) => {
    for (let i = 0; i < count && n < 19; i++, n++) {
      const x = x0 + i * (count > 5 ? 44 : 52) + (r() - 0.5) * 10, yy = y + (r() - 0.5) * 8;
      const c = n === 11 ? '#c4506c' : col;
      ctx.beginPath(); ctx.arc(x, yy, 9 + r() * 3, Math.PI, 0); ctx.strokeStyle = c; ctx.lineWidth = 2.8; ctx.stroke();
      chunky([[x - 10, yy], [x + 10, yy]], 2.6, c);
      for (const dx of [-5, 0, 5]) chunky([[x + dx, yy], [x + dx + (r() - 0.5) * 6, yy + 8], [x + dx + (r() - 0.5) * 6, yy + 16]], 1.6, c);
    }
  });
  // house and a child
  chunky([[200, 196], [200, 160], [250, 160], [250, 196], [200, 196]]);
  chunky([[194, 162], [225, 136], [256, 162]]);
  chunky([[212, 196], [212, 176], [226, 176], [226, 196]], 2.4);
  ctx.beginPath(); ctx.arc(110, 150, 10, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
  chunky([[110, 160], [110, 188]], 2.8); chunky([[110, 168], [96, 180]], 2.4); chunky([[110, 168], [124, 180]], 2.4);
  chunky([[110, 188], [102, 206]], 2.4); chunky([[110, 188], [118, 206]], 2.4);
  ctx.beginPath(); ctx.arc(110, 154, 2.6, 0, 7); ctx.stroke();
  chunky([[20, 207], [150, 205], [300, 208]], 2.2);
}

const SKETCHES = { wolf, marzanny, marzanna, ice_lady: iceLady, planetnik, matka, child_herders: childHerders };

// Draws sketch `kind` onto `canvas` (320x220 logical pixels).
export function drawSketch(canvas, kind, seed = 3) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fn = SKETCHES[kind];
  if (!fn) return canvas;
  ctx.save();
  ctx.scale(canvas.width / 320, canvas.height / 220);
  fn(ctx, rng(seed));
  ctx.restore();
  return canvas;
}
