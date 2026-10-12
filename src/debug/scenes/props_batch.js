// Gallery view: stress test. ~1500 props through one PropBatch over a village-sized area.
// ?scene=props&view=batch&count=1500   prints batch stats to the console; try cam=0,60,90&look=0,0,0
import { rng } from '../../core/util.js';

const WEIGHTS = {
  barrel: 10, crate: 8, sack: 8, bucket: 5, firewoodStack: 4, choppingBlock: 2, stump: 6, logs: 6, lantern: 3, campfire: 1, bench: 5, table: 1, stool: 4,
  cart: 2, sled: 3, skis: 2, snowShovel: 4, hayBale: 4, haystack: 2, woodpile: 2, ladder: 3, strawPile: 3, rockSmall: 10, laundryLine: 2, dryingRack: 2, net: 2,
  boat: 1, iceFishingHole: 3, fishingStool: 3, windbreak: 1, tent: 1, effigy: 3, effigyHead: 2, ribbonPole: 2, offering: 3, gravePostSmall: 4, bones: 3, skull: 2,
  signpost: 1, dogKennel: 2, chickenCoop: 2, beehive: 2, barrelStack: 2, crateStack: 2, brazier: 1, torch: 3, anvil: 1, grindstone: 1, snowman: 1, toys: 2, washTub: 2, pot: 2,
};

export async function build(G, ctx) {
  const { props, PropBatch } = ctx;
  const count = parseInt(G.params.get('count') || '1500', 10);
  const half = parseFloat(G.params.get('half') || '70');
  const r = rng(4242);
  const names = Object.keys(WEIGHTS).filter((n) => props[n]);
  const total = names.reduce((a, n) => a + WEIGHTS[n], 0);
  const t0 = performance.now();
  const batch = new PropBatch(G, 'stress');
  for (let i = 0; i < count; i++) {
    let w = r() * total, name = names[0];
    for (const n of names) { w -= WEIGHTS[n]; if (w <= 0) { name = n; break; } }
    batch.add(name, (r() * 2 - 1) * half, (r() * 2 - 1) * half, { yaw: r() * Math.PI * 2, scale: 0.92 + r() * 0.16 });
  }
  batch.build();
  const ms = performance.now() - t0;
  G.propBatchStats = { ...batch.stats, buildMs: Math.round(ms) };
  console.error('[props batch] ' + JSON.stringify(G.propBatchStats));
}
