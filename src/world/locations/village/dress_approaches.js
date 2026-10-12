// The approaches: the last 200 m of the pass road into the west gate and the mill road leaving the east side.
// Both ran as bare white plains with a few stumps. Now each has what a road into a village has: dark wheel and
// runner ruts, tall red-flagged stakes down both edges where drifts hide the verge, the carters' halt at the gate,
// a wayside cross, the woodcutters' sledges parked in a row, a hay yard behind a split-rail fence, a snow fence
// on the windward side, a cart that broke its wheel and was left.
// Built after the wilderness (locations/index.js calls V.dressApproaches) so it can keep clear of the roadside
// vignettes, in two prop batches of its own so the village batch is not stretched over 200 m of road.
import { seeded } from './util.js';
import { ENCOUNTER_SPOTS } from '../../layout.js';
import { buildRibbons } from './paths.js';
import { roadById, sampleAt, pathLength, lanePaths, patch, stakeLine, railLine, at, yawX } from './dress_lib.js';
import { cluster, streetClusters, frameAt } from './dress_lanes.js';

export async function dressApproaches(V) {
  const { G } = V;
  const D = V.dress;
  if (!D || !V.PropBatch || G.quality === 'low') return;
  const rng = seeded('approaches');
  // keep clear of the roadside vignettes the wilderness builder placed, and of anyone's station
  for (const v of G.world.locations.vignettes?.list || []) D.claim(v.x, v.z, /shrine|blind|laundry/.test(v.type) ? 8 : 5);
  for (const s of Object.values(G.world.stations || {})) if (!s.indoor) D.claim(s.x, s.z, 1.2);
  // and of the roadside encounters' people and things (the tinker's sledge, the shrine woman, Zofia and her goat)
  for (const [x, z, r] of ENCOUNTER_SPOTS) D.claim(x, z, r);

  const prevBatch = D.batch, prevPaths = V.paths;
  const failsBefore = D.fails.length;
  V.paths = [];
  const batches = [];
  try {
    D.batch = new V.PropBatch(G, 'approach-west', { chunk: 0 });
    batches.push(D.batch);
    westApproach(D, rng);
    D.batch = new V.PropBatch(G, 'approach-east', { chunk: 0 });
    batches.push(D.batch);
    eastApproach(D, rng);
  } finally {
    D.batch = prevBatch;
  }
  const strips = V.paths;
  V.paths = prevPaths;
  if (strips.length) buildRibbons(G, strips, 'approach-paths');
  for (const b of batches) await b.buildAsync({ budgetMs: 8 });
  V.approachStats = batches.map((b) => b.stats);
  if (G.params.has('vdebug')) console.warn(`[village] approaches placed ${batches.map((b) => `${b.stats.props} props ${(b.stats.tris / 1000).toFixed(0)}k tris ${b.stats.meshes} meshes`).join('; ')}; did not fit (${D.fails.length - failsBefore}): ${D.fails.slice(failsBefore).join(' ')}`);
}

// ---------------------------------------------------------------------------------------------
// Side +1 of the pass road is the south-east (uphill) side, side -1 the north-west.
function westApproach(D, rng) {
  const { V } = D;
  const R = roadById('pass').pts;
  const gi = R.findIndex((p) => p[0] === -88 && p[1] === 128);
  const sGate = pathLength(R.slice(0, gi + 1));
  const at_ = (s) => sampleAt(R, s);

  // wheel and runner ruts, dark; the carters' apron of churned ground in front of the gate
  lanePaths(V, R, sGate - 170, sGate - 5, { lane: false, rutAlpha: 0.55, phase: 0.7 });
  for (const [ds, rx, rz] of [[10, 8.5, 4.4], [25, 5.5, 3.2]]) {
    const p = at_(sGate - ds);
    patch(V, p.x, p.z, rx, rz, Math.atan2(p.tz, p.tx), 'mud', 0.62);
  }
  stakeLine(D, R, sGate - 190, sGate - 9, { step: 10.5, off: 3.6, height: 2.0 });

  // the carters' halt before the gate: a cart waiting its turn, a sledge of billets, a cart of barrels
  cluster(D, rng, R, sGate - 13, 1, 9.5, 'cartHalt');
  cluster(D, rng, R, sGate - 17, -1, 10, 'haulSledge');
  cluster(D, rng, R, sGate - 30, 1, 10.5, 'barrels');
  cluster(D, rng, R, sGate - 34, -1, 10, 'kennel');

  // the wayside cross, thirty metres out on the north-west side, stakes and a flat stone for the bowl
  {
    const p = at_(sGate - 41);
    const f = frameAt(p, -1, 8.2);
    D.tryPut('waysideCross', [[f.x, f.z, f.yaw('face', 0.1)], ...[[1.5, 0], [-1.5, 0], [0, 1.5]].map(([du, dv]) => { const g = frameAt(p, -1, 8.2 + dv, du); return [g.x, g.z, g.yaw('face', 0.1)]; })], {}, 1.0);
    for (const [u, v] of [[-2.6, -1.0], [2.8, -0.6], [0.2, 2.8]]) { const [x, z] = f.pt(u, v); D.tryPut('stake', [[x, z, 0]], { collide: false, opts: { height: 1.5, flag: true } }, 0.2); }
    const [ox, oz] = f.pt(0.4, -0.9);
    D.tryPut('offering', [[ox, oz, 0.4]], { collide: false, fxOpts: { light: false }, opts: { variant: 'bowl' } }, 0.3);
    patch(V, f.x, f.z, 3.0, 2.0, f.ang, 'mud', 0.55);
  }

  // woodcutters staging: loaded sledges in a row, a yard where the billets are sawn
  cluster(D, rng, R, sGate - 56, 1, 9, 'haulSledge');
  cluster(D, rng, R, sGate - 66, 1, 9.5, 'emptySledge');
  cluster(D, rng, R, sGate - 76, 1, 11, 'woodyard');

  // the hay yard on the low side: a rail fence with a gap toward the road, racks, stacks, a trough
  {
    const p = at_(sGate - 100);
    const f = frameAt(p, -1, 13);
    const W = 17, Dd = 10;
    const c = [f.pt(-W / 2, 0), f.pt(-W / 2, Dd), f.pt(W / 2, Dd), f.pt(W / 2, 0)];
    railLine(D, [c[1], c[0]], []);
    railLine(D, [c[1], c[2], c[3]], []);
    railLine(D, [c[3], f.pt(W / 2 - 4, 0)], []);
    railLine(D, [f.pt(-W / 2 + 4, 0), c[0]], []);
    const put = (n, u, v, yk, o = {}, r = 1.0) => { const [x, z] = f.pt(u, v); return D.tryPut(n, [[x, z, typeof yk === 'string' ? f.yaw(yk, (rng() - 0.5) * 0.3) : yk]], o, r); };
    put('hayRack', -3.8, 4.2, 'x', {}, 1.6);
    put('hayRack', 3.2, 6.8, 'x', {}, 1.6);
    put('haystack', -5.2, 7.8, 0.4, {}, 1.4);
    put('haystack', 5.8, 3.2, 1.2, {}, 1.4);
    put('trough', 0.4, 2.0, 'x', {}, 1.0);
    put('hayBale', -1.0, 8.0, 0.4, {}, 0.6);
    put('hayBale', -0.2, 8.6, 1.3, { collide: false }, 0.6);
    put('wheelbarrow', -6.8, 2.6, 'z', { opts: { variant: 'straw' } }, 0.9);
    const [mx, mz] = f.pt(0, Dd / 2);
    patch(V, mx, mz, 7.5, 3.8, f.ang, 'mud', 0.6);
  }

  // the rest of the way: a cart left where its wheel went, a snow fence on the windward side, a hay stop
  cluster(D, rng, R, sGate - 118, 1, 7.5, 'broken');
  for (let s = sGate - 150; s <= sGate - 112; s += 8) {
    const p = at_(s);
    const [x, z] = at(p, -9.2 - (s % 3), 0);
    D.tryPut('snowFence', [[x, z, yawX(p.tx, p.tz) + (rng() - 0.5) * 0.2]], {}, 1.4);
  }
  cluster(D, rng, R, sGate - 138, 1, 9, 'hayStop');
  cluster(D, rng, R, sGate - 160, -1, 9, 'emptySledge');
}

// ---------------------------------------------------------------------------------------------
function eastApproach(D, rng) {
  const { V } = D;
  const R = roadById('mill').pts;
  const at_ = (s) => sampleAt(R, s);
  lanePaths(V, R, 66, 196, { lane: false, rutAlpha: 0.55, phase: 1.9 });
  stakeLine(D, R, 70, 196, { step: 10.5, off: 3.4, height: 2.0 });
  // where the village ends: a fork post, firewood stacked by the last houses
  {
    const p = at_(70);
    const [x, z] = at(p, 3.6, 2);
    D.tryPut('signpost', [[x, z, Math.atan2(-p.nx, -p.nz) + 0.3]], { opts: { arrows: 3 } }, 0.6);
  }
  // a pasture on the north side behind a rail fence, and what a road out to the mill carries
  {
    const p = at_(104);
    const f = frameAt(p, -1, 10);
    const W = 22, Dd = 11;
    const c = [f.pt(-W / 2, 0), f.pt(-W / 2, Dd), f.pt(W / 2, Dd), f.pt(W / 2, 0)];
    railLine(D, [c[1], c[0]], []);
    railLine(D, [c[1], c[2], c[3]], []);
    railLine(D, [c[3], f.pt(W / 2 - 5, 0)], []);
    railLine(D, [f.pt(-W / 2 + 5, 0), c[0]], []);
    const put = (n, u, v, yk, o = {}, r = 1.0) => { const [x, z] = f.pt(u, v); return D.tryPut(n, [[x, z, typeof yk === 'string' ? f.yaw(yk, (rng() - 0.5) * 0.3) : yk]], o, r); };
    put('hayRack', -5.0, 5.0, 'x', {}, 1.6);
    put('trough', 3.0, 3.0, 'x', {}, 1.0);
    put('haystack', 6.4, 7.6, 0.7, {}, 1.4);
    put('hayBale', 0.2, 8.4, 0.3, {}, 0.6);
    put('hayBale', 1.1, 8.9, 1.4, { collide: false }, 0.6);
    const [mx, mz] = f.pt(0, Dd / 2);
    patch(V, mx, mz, 9, 4.2, f.ang, 'mud', 0.6);
  }
  {
    const p = at_(92);
    const f = frameAt(p, 1, 8.4);
    D.tryPut('waysideCross', [[f.x, f.z, f.yaw('face', -0.1)], ...[[0, 3], [0, -3], [2.5, 5]].map(([dv, du]) => { const g = frameAt(p, 1, 8.4 + dv, du); return [g.x, g.z, g.yaw('face', -0.1)]; })], {}, 1.0);
    for (const [u, v] of [[-2.4, -0.8], [2.6, -0.4]]) { const [x, z] = f.pt(u, v); D.tryPut('stake', [[x, z, 0]], { collide: false, opts: { height: 1.5, flag: true } }, 0.2); }
  }
  streetClusters(D, rng, R, 74, 190, 18, 1, 9.0, ['woodyard', 'haulSledge', 'hayStop', 'broken', 'cartHalt', 'emptySledge', 'barrels', 'tools'], { start: 0 });
  streetClusters(D, rng, R, 130, 190, 24, -1, 9.0, ['emptySledge', 'cartHalt', 'tools', 'haulSledge'], { start: 0 });
}
