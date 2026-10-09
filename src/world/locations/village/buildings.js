// Village structures: hero buildings, log houses, outbuildings. Everything goes through V.put so the
// registry (footprint rects for the audit, lights, doors, walk floors, smoke anchors) stays complete.
import { buildings as B } from '../../architecture/index.js';
import { HEROES, HOUSES, OUTBUILDINGS, SQUARE, STALLS } from './plan.js';
import { tick } from './util.js';

export async function buildStructures(V) {
  const { G } = V;
  const H = HEROES;

  // ---- hero buildings ----
  const put = (id, kind, b, p, o = {}, meta = {}) => V.put(id, kind, b, p.x, p.z, p.yaw, o, meta);

  put('longhouse', 'longhouse', B.longhouse({ seed: H.longhouse.seed, open: 0 }), H.longhouse, {}, { hero: true, inhabited: true, smokeRate: 0.7, room: 'room' });
  put('tavern', 'tavern', B.tavern({ seed: H.tavern.seed, open: 0.3 }), H.tavern, {}, { hero: true, inhabited: true, room: 'room', smokeRate: 1.5 });
  put('smithy', 'smithy', B.smithy({ seed: H.smithy.seed }), H.smithy, {}, { hero: true, inhabited: true, smokeRate: 2.2, smokeKey: 'smoke' });
  put('shrine', 'shrine', B.shrine({ seed: H.shrine.seed }), H.shrine, { foundation: false, skirt: false }, { hero: true });
  put('workshop', 'workshop', B.workshop({ seed: H.workshop.seed }), H.workshop, {}, { hero: true, inhabited: true, room: 'room', smokeRate: 1.0 });
  put('hanka', 'hankaHouse', B.hankaHouse({ seed: H.hanka.seed, open: 0 }), H.hanka, { align: 'avg', lip: 0.02 }, { hero: true, room: 'room' });
  put('banya', 'banya', B.banya({ seed: H.banya.seed }), H.banya, {}, { hero: true, inhabited: true, room: 'room', smokeRate: 1.2 });
  await tick();

  // ---- houses ----
  let n = 0;
  for (const h of HOUSES) {
    put(h.id, 'logHouse', B.logHouse(h.o), h, {}, { house: true, inhabited: true, o: h.o });
    if (++n % 6 === 0) await tick();
  }

  // ---- outbuildings ----
  for (const o of OUTBUILDINGS) {
    if (o.skip) continue;
    const b = B[o.kind](o.o || {});
    const extra = o.kind === 'granary' || o.kind === 'barn' || o.kind === 'stable' ? { outbuilding: true } : { outbuilding: true };
    put(o.id, o.kind, b, o, {}, extra);
  }
  await tick();

  // ---- square: well, notice board, stalls ----
  put('well', 'well', B.well({ seed: 81 }), SQUARE.well, { foundation: false, skirt: false }, { prop: true });
  put('noticeBoard', 'noticeBoard', B.noticeBoard({ seed: 91 }), SQUARE.board, { foundation: false, skirt: false }, { prop: true });
  for (const s of STALLS) put(s.id, 'marketStall', B.marketStall({ seed: s.seed }), s, { foundation: false, skirt: false }, { prop: true, wares: s.wares });
  void G;
}
