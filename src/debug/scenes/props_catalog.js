// Gallery view: every prop in rows on snowy ground, with labels. Rows are listed in ROWS.
//   &row=2          show only row 2 (1-based)
//   &focus=3&n=2    frame items 3..4 of the shown rows with the camera (when no cam= is given)
//   &az=20&el=14    camera azimuth and elevation in degrees for focus framing
import * as THREE from 'three';
import { ROWS } from './props_rows.js';

export async function build(G, ctx) {
  const { props, label, groundHeight } = ctx;
  const only = parseInt(G.params.get('row') || '0', 10);
  const all = [];
  let z = 0;
  ROWS.forEach((row, ri) => {
    if (only && ri + 1 !== only) return;
    let x = 0;
    const objs = [];
    const labels = [];
    const pick = G.params.get('pick') ? G.params.get('pick').split(',').map(Number) : null;
    for (const [name, o] of row.items.filter((_, ii) => !pick || pick.includes(ii))) {
      const g = props.make(name, o);
      const b = g.userData.bounds;
      const w = Math.max(1.4, b.max.x - b.min.x + (o && o.gap != null ? o.gap : 0.8));
      x += w / 2;
      g.position.set(x, 0, z);
      G.scene.add(g);
      labels.push(label(`${name}${o && o.variant ? ':' + o.variant : ''}`, x, Math.max(1.4, b.max.y + 0.35), z, G.scene));
      objs.push(g);
      x += w / 2;
    }
    const off = -x / 2;
    objs.forEach((g, i) => {
      g.position.x += off;
      g.position.y = groundHeight(g.position.x, z);
      labels[i].position.x += off;
      all.push(g);
    });
    z -= 4.5;
  });

  if (G.params.has('nolabels')) G.scene.children.filter((c) => c.isSprite).forEach((s) => { s.visible = false; });

  if (G.params.has('focus') && !G.params.has('cam')) {
    const start = parseInt(G.params.get('focus'), 10) || 0;
    const n = parseInt(G.params.get('n') || '1', 10);
    const box = new THREE.Box3();
    for (let i = start; i < Math.min(all.length, start + n); i++) {
      box.expandByObject(all[i]);
    }
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const fov = parseFloat(G.params.get('fov') || '50');
    const asp = G.camera.aspect || 1.78;
    const dist = (Math.max(sz.x * 0.5 / asp, sz.y * 0.6) / Math.tan(THREE.MathUtils.degToRad(fov / 2))) * 1.05 + sz.z * 0.5 + 0.5;
    const az = THREE.MathUtils.degToRad(parseFloat(G.params.get('az') || '0'));
    const el = THREE.MathUtils.degToRad(parseFloat(G.params.get('el') || '14'));
    G.camera.fov = fov;
    G.camera.updateProjectionMatrix();
    G.camera.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, c.y + Math.sin(el) * dist, c.z + Math.cos(az) * Math.cos(el) * dist);
    G.camera.lookAt(c);
  }
  G.catalogCount = all.length;
  G.catalogObjects = all;
}
