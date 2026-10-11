// What Vesna has caught, kept in the save (G.state.data.fish): the basket she is carrying, a log per species and a few
// totals. No THREE and no DOM, so the playthrough and Node can use it.
//
//   data = fishData(S)            { basket: [{ id, w, day, special? }], log: { perch: { n, best, bestDay, dMin, dMax, hrs: [4] } },
//                                   caught, sold, line }
//   recordCatch(S, c) -> { first, record }      c: { id, w, day, hours, depth, special? }
//   sellFish(S, { keepSpecial }) -> { n, coins, items }
//   cookable(S) -> index into the basket | -1   the fish worth least that is not the old one
//   takeFish(S, i) -> entry                     removes it from the basket (and the inventory count)
// S.count('fish') mirrors the basket length so anything that reads inventories sees it.
import { priceOf } from './model.js';

export function fishData(S) {
  const d = (S.data.fish ||= { basket: [], log: {}, caught: 0, sold: 0, line: 'normal' });
  d.basket ||= [];
  d.log ||= {};
  d.caught ||= 0;
  d.sold ||= 0;
  d.line ||= 'normal';
  // Keep the inventory count honest after a load or a reset.
  const inv = (S.data.inventory ||= {});
  if ((inv.fish || 0) !== d.basket.length) inv.fish = d.basket.length;
  return d;
}

export function recordCatch(S, c) {
  const d = fishData(S);
  if (c.special) {
    // the old pike has a line of its own in the book, not a place among the pike
    d.oldone = { w: c.w, day: c.day };
    d.caught++;
    d.basket.push({ id: c.id, w: c.w, day: c.day, special: true });
    S.give('fish', 1);
    return { first: true, record: false };
  }
  const L = (d.log[c.id] ||= { n: 0, best: 0, bestDay: c.day, dMin: 99, dMax: 0, hrs: [0, 0, 0, 0] });
  const first = L.n === 0;
  L.n++;
  const record = c.w > L.best;
  if (record) { L.best = c.w; L.bestDay = c.day; }
  if (Number.isFinite(c.depth)) { L.dMin = Math.min(L.dMin, c.depth); L.dMax = Math.max(L.dMax, c.depth); }
  if (Number.isFinite(c.hours)) L.hrs[Math.min(3, Math.floor((((c.hours % 24) + 24) % 24) / 6))]++;
  d.caught++;
  d.basket.push({ id: c.id, w: c.w, day: c.day });
  S.give('fish', 1);
  return { first, record: record && !first };
}

export function takeFish(S, i) {
  const d = fishData(S);
  if (i < 0 || i >= d.basket.length) return null;
  const [e] = d.basket.splice(i, 1);
  S.take('fish', 1);
  return e;
}

export function cookable(S) {
  const d = fishData(S);
  let best = -1, bestPrice = Infinity;
  d.basket.forEach((e, i) => {
    if (e.special) return;
    const p = priceOf(e.id, e.w);
    if (p < bestPrice) { bestPrice = p; best = i; }
  });
  return best;
}

export function sellFish(S, { keepSpecial = true } = {}) {
  const d = fishData(S);
  const items = [];
  const keep = [];
  let coins = 0;
  for (const e of d.basket) {
    if (e.special && keepSpecial) { keep.push(e); continue; }
    const price = priceOf(e.id, e.w);
    coins += price;
    items.push({ id: e.id, w: e.w, price });
  }
  const n = items.length;
  if (n) {
    d.basket = keep;
    S.data.inventory.fish = keep.length;
    d.sold += n;
    S.give('coins', coins);
    S.events?.emit?.('inventory', { item: 'fish', n: -n, total: keep.length });
  }
  return { n, coins, items };
}

export const hourBucket = (hours) => Math.min(3, Math.floor((((hours % 24) + 24) % 24) / 6));
export const BUCKET_WORDS = ['in the small hours', 'in the morning', 'in the afternoon', 'in the evening'];
