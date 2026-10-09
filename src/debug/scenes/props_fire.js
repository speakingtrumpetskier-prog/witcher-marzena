// Gallery view: fire, smoke, steam, sparks, wisps, breath, candles, lanterns. Best at dusk:
//   ?scene=props&view=fire&hour=17.3&cam=0,2.0,11&look=0,1.4,-1
import * as THREE from 'three';

export async function build(G, ctx) {
  const { props, label } = ctx;
  const gh = ctx.groundHeight;
  const put = (obj, x, z, y = null) => { obj.position.set(x, y == null ? gh(x, z) : y, z); G.scene.add(obj); return obj; };
  const nl = G.params.has('nolabels');
  const lab = (t, x, z, y = 2.4) => { if (!nl) label(t, x, y, z, G.scene); };

  // Front row: campfire, cauldron, braziers, torches.
  put(props.campfire({ seed: 1 }), -9, 0); lab('campfire', -9, 0);
  put(props.cauldron({ seed: 1 }), -5.2, 0.4); lab('cauldron', -5.2, 0.4);
  put(props.brazier({ seed: 1 }), -2, 0.3); lab('brazier', -2, 0.3);
  put(props.brazier({ seed: 2, variant: 'tall' }), 0.4, 0.3); lab('brazier tall', 0.4, 0.3, 3);
  for (let i = 0; i < 3; i++) { put(props.torch({ seed: i, light: i === 1 }), 2.6 + i * 0.7, 0.3); }
  lab('torches', 3.3, 0.3);
  put(props.offering({ seed: 1, variant: 'bowl' }), 6.2, 0.4); put(props.offering({ seed: 2, variant: 'candle' }), 7.0, 0.1); lab('candles', 6.6, 0.3, 1.2);
  put(props.lantern({ seed: 1, mount: 'post', light: true }), 9.4, 0.2); lab('lantern post', 9.4, 0.2, 3.0);
  put(props.lantern({ seed: 2 }), 8.2, 0.9);

  // Forge: anvil with sparks and a quench barrel with steam.
  put(props.anvil({ seed: 1 }), -12.5, 0.2);
  const sp = props.fx.sparks({ position: [-12.4, gh(-12.4, 0.2) + 0.85, 0.2], parent: G.scene, light: true, every: [0.8, 1.8] });
  void sp;
  put(props.quenchBarrel({ seed: 1 }), -11, 1.2);
  lab('anvil + sparks', -12.2, 0.2, 2.2);

  // Effigies on fire and burnt.
  put(props.effigy({ seed: 8, variant: 'burning' }), 12.5, 0.2); lab('burning effigy', 12.5, 0.2, 3);

  // Back row: three chimney columns of different heights.
  for (const [i, x] of [-8, 0, 8].entries()) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 0.95 }));
    box.position.y = 1.2;
    box.castShadow = true;
    g.add(box);
    put(g, x, -10);
    props.fx.smoke({ position: [x, gh(x, -10) + 2.45, -10], parent: G.scene, height: [24, 40, 56][i], rate: 1.5 });
  }
  lab('chimney smoke', 0, -10, 6);

  // Steam: a hot spring pool, wisps, and a person-shaped stand-in breathing.
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x6a8a92, roughness: 0.2 }));
  put(pool, -15, -4, gh(-15, -4) + 0.03);
  props.fx.steam({ position: [-15, gh(-15, -4) + 0.1, -4], parent: G.scene, rate: 14, height: 9, spread: 1.4, size: 1.6 });
  lab('hot spring steam', -15, -4, 3.6);
  for (let i = 0; i < 3; i++) props.fx.wisp({ position: [14 + i * 1.6, gh(14, -4), -4 + i * 1.2], parent: G.scene, radius: 1.4 });
  lab('will-o-wisps', 15.6, -4, 3);
  const person = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a70, roughness: 0.9 }));
  body.position.y = 0.75; body.castShadow = true;
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b8a0, roughness: 0.8 }));
  head.add(hm);
  person.add(body, head);
  put(person, 4.5, 3.4);
  person.rotation.y = -0.6;
  props.fx.breath({ parent: head, position: [0, -0.05, 0.12], getSpeed: () => 0.2 });
  lab('breath', 4.5, 3.4, 2.3);
  G.fxPerson = person;
}
