// Canvas-drawn textures for characters.
//
// getAtlas(): one shared 1024x1024 pattern atlas (4x4 tiles of 256 px). Detail tiles are grey
//   around 0.5 (linear, the shader multiplies by 2) so vertex colors carry the hue. Decal tiles
//   (embroidery) are linear RGB stitches with alpha coverage over transparent fabric.
// TILE[name] -> [x0, y0, w, h] in UV units. Embroidery bands: TILE.emb(motif 0..3).
import * as THREE from 'three';
import { rng } from './util.js';

const S = 1024, T = 256;
const tileRect = (cx, cy) => [cx * T / S, cy * T / S, T / S, T / S];
export const TILE = {
  wool: tileRect(0, 0),
  linen: tileRect(1, 0),
  knit: tileRect(2, 0),
  fleece: tileRect(3, 0),
  fur: tileRect(0, 1),
  leather: tileRect(1, 1),
  hair: tileRect(2, 1),
  straw: tileRect(3, 1),
  patch: tileRect(3, 2),
  metal: tileRect(0, 3),
  wood: tileRect(1, 3),
  skin: tileRect(2, 3),
  oilskin: tileRect(3, 3),
  plain: tileRect(2, 3),
};
// Embroidery bands: 8 bands of 64 px in tiles (0,2),(1,2). Decal mode: height is negative.
TILE.emb = (m = 0) => {
  const tx = m < 4 ? 0 : 1;
  const row = m % 4;
  return [tx * T / S, (2 * T + row * 64) / S, T / S, -64 / S];
};

let atlas = null;
export function getAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, S, S);
  const R = rng(7);
  const tile = (cx, cy, fn) => {
    g.save();
    g.beginPath();
    g.rect(cx * T, cy * T, T, T);
    g.clip();
    g.translate(cx * T, cy * T);
    fn(g, R);
    g.restore();
  };
  // Draw a primitive wrapped across tile edges so the tile repeats seamlessly.
  const wrap = (fn) => {
    for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) fn(ox, oy);
  };
  const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
  const mottle = (gg, amp, n, rmin, rmax) => {
    for (let i = 0; i < n; i++) {
      const x = R() * T, y = R() * T, r = rmin + R() * (rmax - rmin);
      const v = 128 + (R() * 2 - 1) * amp;
      wrap((ox, oy) => {
        const gr = gg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, grey(v, 0.35));
        gr.addColorStop(1, grey(v, 0));
        gg.fillStyle = gr;
        gg.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
  };
  const fibers = (gg, n, len, amp, width, angle = null, alpha = 0.5) => {
    gg.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = R() * T, y = R() * T;
      const a = angle === null ? R() * Math.PI * 2 : angle + (R() - 0.5) * 0.5;
      const l = len * (0.5 + R());
      const v = 128 + (R() * 2 - 1) * amp;
      gg.strokeStyle = grey(v, alpha);
      gg.lineWidth = width * (0.6 + R() * 0.8);
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      const bx = (R() - 0.5) * l * 0.4, by = (R() - 0.5) * l * 0.4;
      wrap((ox, oy) => {
        gg.beginPath();
        gg.moveTo(x + ox, y + oy);
        gg.quadraticCurveTo(x + ox + dx * 0.5 + bx, y + oy + dy * 0.5 + by, x + ox + dx, y + oy + dy);
        gg.stroke();
      });
    }
  };

  // Wool: 2/2 twill diagonal ribs plus felted fibers and mottling.
  tile(0, 0, (gg) => {
    mottle(gg, 22, 40, 20, 60);
    for (let i = -T; i < T * 2; i += 6) {
      gg.strokeStyle = grey(100, 0.35);
      gg.lineWidth = 2.2;
      gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i + T, T); gg.stroke();
      gg.strokeStyle = grey(155, 0.25);
      gg.lineWidth = 1.2;
      gg.beginPath(); gg.moveTo(i + 3, 0); gg.lineTo(i + 3 + T, T); gg.stroke();
    }
    fibers(gg, 900, 7, 40, 0.8, null, 0.35);
  });
  // Linen: plain weave with slubs.
  tile(1, 0, (gg) => {
    mottle(gg, 12, 25, 20, 70);
    for (let y = 0; y < T; y += 3) {
      gg.fillStyle = grey(118 + R() * 18, 0.45);
      gg.fillRect(0, y, T, 1.4 + (R() < 0.08 ? 1.2 : 0));
    }
    for (let x = 0; x < T; x += 3) {
      gg.fillStyle = grey(140 + R() * 14, 0.3);
      gg.fillRect(x, 0, 1.2, T);
    }
  });
  // Knit: stockinette V columns.
  tile(2, 0, (gg) => {
    const cw = 16, ch = 12;
    for (let y = -ch; y < T + ch; y += ch) {
      for (let x = 0; x < T; x += cw) {
        const v = 128 + (R() - 0.5) * 24;
        for (const side of [-1, 1]) {
          gg.fillStyle = grey(v + 30, 1);
          gg.beginPath();
          gg.ellipse(x + cw / 2 + side * cw * 0.22, y + ch / 2, cw * 0.22, ch * 0.62, side * 0.5, 0, Math.PI * 2);
          gg.fill();
          gg.strokeStyle = grey(70, 0.7);
          gg.lineWidth = 1.2;
          gg.stroke();
        }
      }
    }
  });
  // Fleece (sheepskin): dense small curls.
  tile(3, 0, (gg) => {
    gg.fillStyle = grey(110);
    gg.fillRect(0, 0, T, T);
    for (let i = 0; i < 1400; i++) {
      const x = R() * T, y = R() * T, r = 2.5 + R() * 4.5;
      const v = 120 + R() * 90;
      wrap((ox, oy) => {
        gg.strokeStyle = grey(v, 0.8);
        gg.lineWidth = 1.6;
        gg.beginPath();
        gg.arc(x + ox, y + oy, r, R() * 6, R() * 6 + 4.5);
        gg.stroke();
      });
    }
  });
  // Fur: long downward strands in clumps.
  tile(0, 1, (gg) => {
    gg.fillStyle = grey(90);
    gg.fillRect(0, 0, T, T);
    fibers(gg, 2600, 18, 70, 1.4, Math.PI / 2, 0.55);
    fibers(gg, 600, 26, 40, 2.2, Math.PI / 2, 0.35);
  });
  // Leather: mottling, creases and scuffs.
  tile(1, 1, (gg) => {
    mottle(gg, 30, 90, 8, 40);
    fibers(gg, 160, 20, 45, 0.8, null, 0.35);
    for (let i = 0; i < 3000; i++) {
      gg.fillStyle = grey(128 + (R() - 0.5) * 40, 0.3);
      gg.fillRect(R() * T, R() * T, 1.5, 1.5);
    }
  });
  // Hair: fine strands along V with light and dark streaks (anisotropic look).
  tile(2, 1, (gg) => {
    for (let x = 0; x < T; x += 1) {
      const v = 128 + (Math.sin(x * 0.21) * 18 + Math.sin(x * 0.047 + 1) * 22 + (R() - 0.5) * 40);
      gg.fillStyle = grey(v, 0.9);
      gg.fillRect(x, 0, 1, T);
    }
    fibers(gg, 500, 60, 50, 0.7, Math.PI / 2, 0.4);
  });
  // Straw: thick parallel stems with nodes.
  tile(3, 1, (gg) => {
    for (let x = 0; x < T; x += 5) {
      const v = 110 + R() * 70;
      gg.fillStyle = grey(v, 1);
      gg.fillRect(x, 0, 4, T);
      gg.fillStyle = grey(v + 40, 0.6);
      gg.fillRect(x + 1, 0, 1, T);
      for (let k = 0; k < 2; k++) {
        gg.fillStyle = grey(70, 0.6);
        gg.fillRect(x, R() * T, 4, 2);
      }
    }
  });
  // Patch: a darker square of fabric with a running stitch border (opaque detail tile).
  tile(3, 2, (gg) => {
    mottle(gg, 18, 20, 20, 60);
    gg.fillStyle = grey(100, 1);
    gg.fillRect(20, 20, T - 40, T - 40);
    for (let i = -T; i < T * 2; i += 7) {
      gg.strokeStyle = grey(80, 0.4);
      gg.lineWidth = 2;
      gg.beginPath(); gg.moveTo(i, 20); gg.lineTo(i - T, T); gg.stroke();
    }
    gg.setLineDash([9, 7]);
    gg.strokeStyle = grey(200, 0.9);
    gg.lineWidth = 3;
    gg.strokeRect(30, 30, T - 60, T - 60);
    gg.setLineDash([]);
  });
  // Metal: brushed.
  tile(0, 3, (gg) => {
    for (let y = 0; y < T; y++) {
      gg.fillStyle = grey(120 + (R() - 0.5) * 26, 0.6);
      gg.fillRect(0, y, T, 1);
    }
  });
  // Wood grain.
  tile(1, 3, (gg) => {
    for (let x = 0; x < T; x += 2) {
      const v = 128 + Math.sin(x * 0.15 + Math.sin(x * 0.03) * 3) * 30;
      gg.fillStyle = grey(v, 1);
      gg.fillRect(x, 0, 2, T);
    }
  });
  // Skin / plain: very soft mottling and pores.
  tile(2, 3, (gg) => {
    mottle(gg, 10, 60, 6, 30);
    for (let i = 0; i < 2500; i++) {
      gg.fillStyle = grey(110, 0.25);
      gg.fillRect(R() * T, R() * T, 1, 1);
    }
  });
  // Oilskin: waxy streaks and crinkles.
  tile(3, 3, (gg) => {
    mottle(gg, 25, 50, 10, 50);
    fibers(gg, 120, 40, 60, 1.2, null, 0.4);
  });

  drawEmbroidery(g, R);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // UV v = canvas y / size, matching TILE rects
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  atlas = tex;
  return tex;
}

// Slavic cross-stitch motifs, drawn as X stitches on a 4 px grid. Colors are linear bytes
// (the atlas is not sRGB decoded): folk red #9A2E22, black-brown, and an ochre accent.
function drawEmbroidery(g, R) {
  const RED = [84, 8, 5], DARK = [8, 6, 5], OCHRE = [120, 70, 12], WHITE = [200, 196, 185];
  const cell = 4;
  const band = (tx, row, fn, period = 32) => {
    const x0 = tx * T, y0 = 2 * T + row * 64;
    g.clearRect(x0, y0, T, 64);
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 64; i++) {
        const c = fn(i % period, j, i);
        if (!c) continue;
        const x = x0 + i * cell, y = y0 + j * cell;
        const jit = (R() - 0.5) * 18;
        g.strokeStyle = `rgb(${Math.max(0, c[0] + jit) | 0},${Math.max(0, c[1] + jit * 0.2) | 0},${Math.max(0, c[2]) | 0})`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x + 0.4, y + 0.4); g.lineTo(x + cell - 0.4, y + cell - 0.4);
        g.moveTo(x + cell - 0.4, y + 0.4); g.lineTo(x + 0.4, y + cell - 0.4);
        g.stroke();
      }
    }
  };
  const border = (j) => j === 1 || j === 14;
  // 0: chain of diamonds with hooked ends and dots, thin borders.
  band(0, 0, (i, j) => {
    if (border(j)) return RED;
    const cx = 16, cy = 7.5;
    const d = Math.abs(i - cx) + Math.abs(j - cy);
    if (d === 6 || d === 3) return RED;
    if (d === 0.5 || (d < 1.6)) return DARK;
    if ((i === 0 || i === 31) && (j === 7 || j === 8)) return RED;
    if ((i === 1 || i === 30) && (j === 6 || j === 9)) return RED;
    return null;
  });
  // 1: eight-pointed stars (rozeta) alternating with small crosses, black accents.
  band(0, 1, (i, j) => {
    if (border(j)) return DARK;
    const cx = 8, cy = 7.5;
    const dx = Math.abs(i - cx), dy = Math.abs(j - cy);
    if (i < 17) {
      if ((dx < 1 || dy < 1) && dx + dy < 6.5) return RED;
      if (Math.abs(dx - dy) < 0.6 && dx < 4) return RED;
      if (dx + dy > 5.4 && dx + dy < 6.6 && dx > 1 && dy > 1) return DARK;
      return null;
    }
    const ex = Math.abs(i - 24), ey = Math.abs(j - 7.5);
    if ((ex < 1 && ey < 3.5) || (ey < 1 && ex < 3)) return OCHRE;
    return null;
  });
  // 2: zigzag "wolf teeth" with dots.
  band(0, 2, (i, j) => {
    if (j === 0 || j === 15) return RED;
    const z = Math.abs(((i % 12) - 6));
    if (j === 3 + z || j === 4 + z) return RED;
    if (j === 12 - z + 0 && j > 9) return DARK;
    if ((i % 12) === 6 && j === 11) return RED;
    return null;
  }, 24);
  // 3: tree-of-life sprigs.
  band(0, 3, (i, j) => {
    if (border(j)) return RED;
    const x = i % 16;
    if (x === 8 && j > 3 && j < 13) return RED;
    if (Math.abs(x - 8) === 12 - j && j > 6 && j < 12) return RED;
    if (Math.abs(x - 8) === j - 1 && j > 2 && j < 7) return DARK;
    if ((x === 2 || x === 14) && j > 5 && j < 10) return OCHRE;
    return null;
  }, 16);
  // 4: dense red field with white diamonds (Wiesia's dress, ritual hems).
  band(1, 0, (i, j) => {
    const d = Math.abs((i % 16) - 8) + Math.abs(j - 7.5);
    if (j < 1 || j > 14) return DARK;
    if (d < 2) return WHITE;
    if (d > 5.6 && d < 6.6) return WHITE;
    return RED;
  }, 16);
  // 5: simple double line with tiny crosses (cuffs, collars on poor clothes).
  band(1, 1, (i, j) => {
    if (j === 3 || j === 12) return RED;
    if ((i % 8) === 4 && (j === 7 || j === 8)) return RED;
    if ((i % 8) === 4 && (j === 6 || j === 9)) return RED;
    return null;
  }, 8);
  // 6: black and red geometric (men's shirts).
  band(1, 2, (i, j) => {
    if (j === 2 || j === 13) return DARK;
    const x = i % 10;
    const d = Math.abs(x - 5) + Math.abs(j - 7.5);
    if (d < 3) return RED;
    if (d > 3.4 && d < 4.6) return DARK;
    return null;
  }, 10);
  // 7: fringe and sparse ochre dots (shawl edges).
  band(1, 3, (i, j) => {
    if (j < 3) return DARK;
    if (j > 4 && (i % 3) === 0) return [40, 30, 22];
    if (j === 3 && (i % 6) === 0) return OCHRE;
    return null;
  }, 6);
}

// Face texture painter canvas factory (head.js paints on it).
export function makeFaceCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
export function faceTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
