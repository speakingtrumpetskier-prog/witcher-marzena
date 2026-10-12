// Gallery view: the Marzanna effigy in all its states, two rows with ribbon poles at the ends.
//   ?scene=props&view=effigy&hour=16.6&cam=0,2.1,12.5&look=0,1.3,-2.5&fov=50
export async function build(G, ctx) {
  const { props, groundHeight: gh, label } = ctx;
  const nl = G.params.has('nolabels');
  const put = (name, o, x, z, yaw = 0, tag = null) => {
    const g = props.make(name, o);
    g.position.set(x, gh(x, z), z);
    g.rotation.y = yaw;
    G.scene.add(g);
    if (tag && !nl) label(tag, x, g.userData.height + 0.4, z, G.scene);
    return g;
  };
  put('effigy', { seed: 1, variant: 'pole' }, -6.4, 0.5, 0.25, 'on a pole');
  put('effigy', { seed: 2, variant: 'standing' }, -3.2, 0.7, -0.2, 'standing');
  put('effigy', { seed: 3, variant: 'hung' }, 0.4, 0.0, 0, 'hung from a beam');
  put('effigy', { seed: 4, variant: 'seated' }, 3.6, 0.8, -0.35, 'seated');
  put('effigy', { seed: 5, variant: 'half' }, 6.9, 0.6, -0.3, 'half-made');
  put('effigy', { seed: 6, variant: 'burnt' }, -4.9, -6.2, 0.2, 'burnt');
  put('effigy', { seed: 7, variant: 'frozen' }, -1.7, -6.4, -0.1, 'frozen');
  put('effigy', { seed: 8, variant: 'burning' }, 2.5, -6.2, 0.3, 'burning');
  put('effigyHead', { seed: 1 }, 5.0, -5.6, 0.4);
  put('effigyHead', { seed: 2 }, 5.9, -6.0, -0.3);
  put('effigyHead', { seed: 3, variant: 'frozen' }, 6.8, -5.5, 0.2);
  put('strawPile', { seed: 2 }, 8.0, -4.6);
  put('ribbonPole', { seed: 1 }, -9.4, -1.5);
  put('ribbonPole', { seed: 2 }, 9.8, -1.8);
  put('offering', { seed: 1, variant: 'bowl' }, -0.6, 2.6);
  put('offering', { seed: 2, variant: 'candle' }, 0.5, 3.0);
}
