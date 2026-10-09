// Carved board silhouettes (THREE.Shape, x along the board, y up, extrude along +z).
// Slavic and Nordic folk cutwork: saw teeth, scallops, leaf and diamond openings, sun roundels,
// and the horse head that finishes a crossed roof ridge. Used for bargeboards, window casings,
// signs, grave posts and idols.
import * as THREE from 'three';

const circlePath = (cx, cy, r, n = 10) => {
  const p = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  return p;
};
const polyPath = (pts) => {
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
};

// Long board whose lower edge carries a pattern. kind: 'saw' | 'scallop' | 'leaf' | 'diamond' | 'dent'
export function boardShape(len, h, kind = 'saw', period = 0.34) {
  const n = Math.max(2, Math.round(len / period));
  const step = len / n;
  const pts = [];
  const lowY = h * 0.42; // straight part of the board lies above this
  if (kind === 'scallop') {
    pts.push([0, h]);
    pts.push([0, lowY]);
    for (let i = 0; i < n; i++) {
      for (let k = 1; k <= 5; k++) {
        const a = (k / 5) * Math.PI;
        pts.push([i * step + step * 0.5 * (1 - Math.cos(a)), lowY - Math.sin(a) * h * 0.34]);
      }
    }
    pts.push([len, h]);
  } else if (kind === 'saw') {
    pts.push([0, h]);
    pts.push([0, lowY]);
    for (let i = 0; i < n; i++) {
      pts.push([i * step + step * 0.5, 0]);
      pts.push([(i + 1) * step, lowY]);
    }
    pts.push([len, h]);
  } else if (kind === 'dent') {
    pts.push([0, h]);
    pts.push([0, lowY * 0.5]);
    for (let i = 0; i < n; i++) {
      pts.push([i * step + step * 0.1, 0]);
      pts.push([i * step + step * 0.6, 0]);
      pts.push([i * step + step * 0.6, lowY * 0.5]);
      pts.push([(i + 1) * step, lowY * 0.5]);
    }
    pts.push([len, h]);
  } else {
    pts.push([0, h], [0, 0], [len, 0], [len, h]);
  }
  const shape = new THREE.Shape();
  // Build CCW: start at bottom-left, walk the pattern edge left-to-right, then back along the top.
  if (kind === 'leaf' || kind === 'diamond') {
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, h); shape.lineTo(0, h); shape.closePath();
    for (let i = 0; i < n; i++) {
      const cx = i * step + step * 0.5, cy = h * 0.5;
      if (kind === 'leaf') {
        shape.holes.push(polyPath([[cx - step * 0.28, cy], [cx, cy - h * 0.32], [cx + step * 0.28, cy], [cx, cy + h * 0.32]]));
      } else {
        shape.holes.push(circlePath(cx, cy, h * 0.2, 8));
      }
    }
  } else {
    const edge = pts.slice(1, -1); // from left-low to right-low along the pattern
    shape.moveTo(edge[0][0], edge[0][1]);
    for (let i = 1; i < edge.length; i++) shape.lineTo(edge[i][0], edge[i][1]);
    shape.lineTo(len, h);
    shape.lineTo(0, h);
    shape.closePath();
    // Small round openings above the pattern.
    for (let i = 0; i < n; i += 2) {
      const cx = i * step + step * 0.5;
      if (h > 0.2) shape.holes.push(circlePath(cx, h * 0.72, h * 0.1, 5));
    }
  }
  return shape;
}

// Stylized horse head facing +x. Origin at the bottom-left of the neck; about 0.75 x 0.9.
export function horseHeadShape(scale = 1) {
  const P = [
    [0, 0], [0.30, 0], [0.34, 0.12], [0.52, 0.18], [0.68, 0.14], [0.75, 0.22], [0.73, 0.35], [0.61, 0.45],
    [0.51, 0.58], [0.48, 0.65], [0.43, 0.92], [0.34, 0.66], [0.27, 0.84], [0.22, 0.62], [0.12, 0.76], [0.07, 0.5], [0.0, 0.6],
  ].map(([x, y]) => [x * scale, y * scale]);
  const s = new THREE.Shape();
  P.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  s.holes.push(circlePath(0.5 * scale, 0.4 * scale, 0.032 * scale, 8));
  return s;
}

// Sun roundel: disc with triangular rays and a ring opening. r is the disc radius.
export function sunShape(r = 0.3, rays = 12) {
  const s = new THREE.Shape();
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r * 1.5 : r * 1.02;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  s.holes.push(circlePath(0, 0, r * 0.62, 10));
  return s;
}

// Window casing lintel: a pointed crown with openings. w = window width.
export function lintelShape(w) {
  const hw = w * 0.5 + 0.12;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, 0.1);
  s.lineTo(hw * 0.55, 0.14);
  s.lineTo(0, 0.32);
  s.lineTo(-hw * 0.55, 0.14);
  s.lineTo(-hw, 0.1);
  s.closePath();
  s.holes.push(circlePath(0, 0.13, 0.045, 8));
  s.holes.push(polyPath([[-hw * 0.7, 0.04], [-hw * 0.55, 0.095], [-hw * 0.4, 0.04]]));
  s.holes.push(polyPath([[hw * 0.4, 0.04], [hw * 0.55, 0.095], [hw * 0.7, 0.04]]));
  return s;
}

// Hanging pendant board (for porch eaves): a row of drops.
export function dropsShape(len, h = 0.3, n = null) {
  n = n || Math.max(2, Math.round(len / 0.22));
  const step = len / n;
  const s = new THREE.Shape();
  s.moveTo(0, h * 0.5);
  s.lineTo(0, 0.12 * h);
  for (let i = 0; i < n; i++) {
    const x0 = i * step;
    s.lineTo(x0 + step * 0.1, 0.12 * h);
    s.lineTo(x0 + step * 0.1, 0.0);
    for (let k = 1; k <= 4; k++) {
      const a = (k / 4) * Math.PI;
      s.lineTo(x0 + step * 0.5 + Math.cos(Math.PI - a) * step * 0.4, 0 - 0.0 + (1 - Math.sin(a)) * 0.0);
    }
    s.lineTo(x0 + step * 0.9, 0.12 * h);
    s.lineTo(x0 + step, 0.12 * h);
  }
  s.lineTo(len, h * 0.5);
  s.lineTo(len, h);
  s.lineTo(0, h);
  s.closePath();
  return s;
}

// Carved sign blank: rounded top plank with a border cutout. w x h.
export function signShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.8);
  s.quadraticCurveTo(w / 2, h, 0, h * 1.04);
  s.quadraticCurveTo(-w / 2, h, -w / 2, h * 0.8);
  s.closePath();
  return s;
}

// Four-point star / sun used on shutters and gables.
export function heartShape(r = 0.06) {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.lineTo(r * 0.9, r * 0.05);
  s.lineTo(r * 0.5, r * 0.7);
  s.lineTo(0, r * 0.35);
  s.lineTo(-r * 0.5, r * 0.7);
  s.lineTo(-r * 0.9, r * 0.05);
  s.closePath();
  return s;
}

// Bell silhouette (hanging sign emblem). Origin at the top center; about 0.4 wide, 0.46 tall.
export function bellShape(s = 1) {
  const sh = new THREE.Shape();
  const pts = [
    [-0.035, 0], [0.035, 0], [0.05, -0.04], [0.09, -0.07], [0.12, -0.15], [0.15, -0.25], [0.19, -0.34], [0.22, -0.4],
    [0.2, -0.43], [-0.2, -0.43], [-0.22, -0.4], [-0.19, -0.34], [-0.15, -0.25], [-0.12, -0.15], [-0.09, -0.07], [-0.05, -0.04],
  ];
  pts.forEach(([x, y], i) => (i === 0 ? sh.moveTo(x * s, y * s) : sh.lineTo(x * s, y * s)));
  sh.closePath();
  return sh;
}
