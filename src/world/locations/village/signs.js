// Canvas-drawn signs and notes: the stall sign "BREAD 3 GR" and the kids' charcoal drawing of the
// ice lady (note_drawing: "the ice lady. she is lonly. she wants her mama."). Small own meshes,
// one draw call each.
import * as THREE from 'three';
import { drawSketch } from '../../../ui/sketch.js';

function woodCanvas(w, h, base = '#6b5440', seed = 3) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${20 + rnd() * 30},${14 + rnd() * 20},${8 + rnd() * 14},${0.08 + rnd() * 0.16})`;
    g.lineWidth = 1 + rnd() * 2.5;
    const y = rnd() * h;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 10, w * 0.6, y + (rnd() - 0.5) * 10, w, y + (rnd() - 0.5) * 6);
    g.stroke();
  }
  return { c, g };
}

// A hanging board with painted text. Returns a Mesh (front +z) with its own materials.
export function makeSign(text, { w = 0.9, h = 0.38, base = '#6b5440', ink = '#e8dcc0', font = 'bold 64px Georgia, serif', seed = 5 } = {}) {
  const px = 512, py = Math.round(512 * (h / w));
  const { c, g } = woodCanvas(px, py, base, seed);
  g.strokeStyle = 'rgba(20,12,8,0.55)';
  g.lineWidth = 8;
  g.strokeRect(10, 10, px - 20, py - 20);
  g.fillStyle = ink;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 3;
  g.fillText(text, px / 2, py / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  front.userData.snow = { amount: 0.4, threshold: 0.9 };
  const side = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [side, side, side, side, front, front]);
  mesh.castShadow = true;
  mesh.name = `sign:${text}`;
  return mesh;
}

// The child's drawing: a tall pale lady under wavy lines, with a caption.
export function makeDrawing() {
  const W = 512, H = 384;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d9cdb0';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + (i % 5) * 0.012})`;
    g.fillRect((i * 97) % W, (i * 53) % H, 60 + (i % 7) * 20, 3);
  }
  g.strokeStyle = '#2a2622';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // wavy ice lines
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    for (let x = 14; x < W - 14; x += 6) {
      const y = 70 + k * 16 + Math.sin(x * 0.06 + k) * 6;
      if (x === 14) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // the lady: long dress, long hair, arms down, big sad eyes
  g.lineWidth = 4;
  g.fillStyle = '#efe9da';
  g.beginPath(); g.moveTo(230, 150); g.lineTo(200, 300); g.lineTo(300, 300); g.lineTo(270, 150); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(250, 128, 26, 0, Math.PI * 2); g.fill(); g.stroke();
  g.lineWidth = 3;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(250 + i * 7, 105); g.quadraticCurveTo(250 + i * 16, 190, 250 + i * 18, 262); g.stroke(); }
  g.fillStyle = '#2a2622';
  g.beginPath(); g.arc(240, 128, 3.5, 0, 6.3); g.arc(260, 128, 3.5, 0, 6.3); g.fill();
  g.beginPath(); g.moveTo(242, 142); g.quadraticCurveTo(250, 137, 258, 142); g.stroke();
  g.beginPath(); g.moveTo(222, 190); g.lineTo(190, 245); g.moveTo(278, 190); g.lineTo(310, 245); g.stroke();
  // small stick figure holding a red thread
  g.beginPath(); g.arc(380, 232, 9, 0, 6.3); g.moveTo(380, 241); g.lineTo(380, 275); g.moveTo(380, 252); g.lineTo(362, 265); g.moveTo(380, 252); g.lineTo(398, 262); g.moveTo(380, 275); g.lineTo(368, 300); g.moveTo(380, 275); g.lineTo(392, 300); g.stroke();
  g.strokeStyle = '#9a2e22';
  g.beginPath(); g.moveTo(398, 262); g.quadraticCurveTo(350, 250, 312, 246); g.stroke();
  g.fillStyle = '#2a2622';
  g.font = 'italic 25px "Comic Sans MS", "Segoe Print", cursive';
  g.textAlign = 'center';
  g.fillText('the ice lady. she is lonly.', W / 2, 336);
  g.fillText('she wants her mama.', W / 2, 364);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.465), m);
  mesh.name = 'note_drawing';
  return mesh;
}

// ---- small readable things for the herders notes (src/story/controller/clues.js places them) ----
// The words are in the note itself (src/ui/content.js); on the object they are only marks.

function scribbleRows(g, rows, x0, y0, step, wMax, rnd, col = 'rgba(40,30,22,0.8)', lw = 1.5) {
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.lineCap = 'round';
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * step;
    const len = wMax * (r === 0 ? 0.6 : 0.55 + rnd() * 0.45);
    g.beginPath();
    g.moveTo(x0, y);
    for (let x = x0; x < x0 + len; x += 5) g.lineTo(x + 2.5, y + (rnd() - 0.5) * 4.2);
    g.stroke();
  }
}

// A sheet nailed up or lying flat: a plane facing +z, with rows of handwriting too small to read.
export function makePaper({ w = 0.26, h = 0.34, rows = 8, seed = 3, tone = '#d9ccaa' } = {}) {
  const W = 256, H = Math.round(256 * (h / w));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = tone;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(120,96,60,${0.03 + rnd() * 0.07})`;
    g.fillRect(rnd() * W, rnd() * H, 10 + rnd() * 50, 6 + rnd() * 24);
  }
  g.strokeStyle = 'rgba(80,60,36,0.45)';
  g.lineWidth = 6;
  g.strokeRect(2, 2, W - 4, H - 4);
  scribbleRows(g, rows, 22, 38, (H - 70) / rows, W - 56, rnd);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'note_paper';
  return mesh;
}

// A fisherman's slate in a wood frame: chalk tally marks in two rows, and a last row left unfinished.
export function makeSlate({ w = 0.34, h = 0.25, seed = 7 } = {}) {
  const W = 340, H = Math.round(340 * (h / w));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#353a3c';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(190,196,190,${0.02 + rnd() * 0.04})`;
    g.fillRect(rnd() * W, rnd() * H, 30 + rnd() * 80, 4 + rnd() * 16);
  }
  const chalk = 'rgba(232,230,220,0.85)';
  g.strokeStyle = chalk;
  g.lineCap = 'round';
  // two finished rows of tally groups and a label scribble each, then a label with nothing after it
  const row = (y, groups, extra) => {
    g.lineWidth = 2.2;
    scribbleRows(g, 1, 12, y, 0, 70, rnd, chalk, 2.4);
    let x = 96;
    for (let k = 0; k < groups; k++, x += 34) {
      for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(x + j * 6, y - 12); g.lineTo(x + j * 6 + (rnd() - 0.5) * 2, y + 8); g.stroke(); }
      g.beginPath(); g.moveTo(x - 4, y + 4); g.lineTo(x + 22, y - 8); g.stroke();
    }
    for (let j = 0; j < extra; j++, x += 7) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + (rnd() - 0.5) * 2, y + 8); g.stroke(); }
  };
  row(46, 3, 2);
  row(104, 2, 3);
  scribbleRows(g, 1, 12, 164, 0, 90, rnd, chalk, 2.4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, color: 0xb8bcc0, roughness: 0.9 }));
  face.position.z = 0.0165;
  frame.castShadow = true;
  group.add(frame, face);
  group.name = 'note_slate';
  return group;
}

// A second child's drawing for the fort (the herders over the roofs), same paper and hand as the ice lady.
export function makeChildPicture() {
  const W = 512, H = 384;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d9cdb0';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + (i % 5) * 0.012})`;
    g.fillRect((i * 97) % W, (i * 53) % H, 60 + (i % 7) * 20, 3);
  }
  const art = document.createElement('canvas');
  art.width = W; art.height = 320;
  drawSketch(art, 'child_herders', 5);
  g.drawImage(art, 0, 4);
  g.fillStyle = '#2a2622';
  g.font = 'italic 25px "Comic Sans MS", "Segoe Print", cursive';
  g.textAlign = 'center';
  g.fillText('the herders. i counted 19.', W / 2, 336);
  g.fillText('one is pink. dont go past 20.', W / 2, 364);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.375), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'note_child_picture';
  return mesh;
}
