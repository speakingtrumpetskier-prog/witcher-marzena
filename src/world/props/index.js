// Props kit public API (see docs/ARCHITECTURE.md "Props kit").
//
//   import { props, PropBatch } from '../world/props/index.js';
//   const obj = props.barrel({ seed: 3 });        Object3D at the origin, y = 0 is the ground
//   obj.userData.collider / .colliders            circle { r } or box { hw, hd } in local space, with x, z, h
//   obj.userData.anchors                          named local-space Vector3 (fire, light, seat ...)
//   const batch = new PropBatch(G, 'village');    merged static placement, ~1500 props in < 150 draw calls
//   batch.add('barrel', x, z, { yaw, scale, y, seed, snap: true, collide: true });  batch.build();
//   props.fx.fire / smoke / steam / sparks / torch / candle / glow / wisp / breath / burst
//   props.make(name, opts)    props.list()    props.catalog (names)
//
// Common builder options: seed (variant), indoor (no snow patch on upward faces), variant (named
// variant where a prop has them), fx (default true: spawn live fx emitters; PropBatch passes false
// and spawns them itself).
import { PropBatch } from './batch.js';
import { fx } from './fx.js';
import * as basic from './p_basic.js';
import * as work from './p_work.js';
import * as household from './p_household.js';

const MODULES = [basic, work, household];

const raw = {};
for (const m of MODULES) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn === 'function' && !name.startsWith('_') && name !== 'folkRect') raw[name] = fn;
  }
}

// Turn fx markers into live emitters (standalone use). Markers stay as the emitter anchors.
function spawnLive(group) {
  const markers = [];
  group.traverse((o) => { if (o.userData && o.userData.fxSpec && !o.userData.emitter) markers.push(o); });
  for (const m of markers) {
    const spec = m.userData.fxSpec;
    const parent = m.parent || group;
    const em = fx.fromSpec(spec, spec.pos, parent);
    if (em) {
      em.object.userData.fxSpec = spec;
      m.userData.emitter = em;
      parent.remove(m);
    }
  }
}

function wrap(name, fn) {
  const w = (opts = {}) => {
    const g = fn(opts);
    g.userData.prop = name;
    if (opts.fx !== false) spawnLive(g);
    return g;
  };
  w.raw = fn;
  w.propName = name;
  return w;
}

export const props = { fx };
for (const [name, fn] of Object.entries(raw)) props[name] = wrap(name, fn);

props.make = (name, opts = {}) => {
  const f = props[name];
  if (!f || name === 'fx') throw new Error(`props: unknown prop "${name}"`);
  return f(opts);
};
props.list = () => Object.keys(raw);
props.catalog = props.list();

PropBatch.make = props.make;

export { PropBatch, fx };
