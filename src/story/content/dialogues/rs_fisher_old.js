// rs_fisher_old: Wacław on a morning after the quarrel at the river mouth (src/story/controller/roadside/fishers.js).
// Entry: any talk with him once fishers_settled is set. On his own at the hole, or with Franek's hole a few paces over. cast: fisher_old.
export default {
  id: 'rs_fisher_old',
  cast: ['fisher_old'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('fishers_settled') === 'both' ? 'two' : 'alone') },
    alone: { s: 'fisher_old', t: "Nothing since dawn. They won't bite when it's clear.", end: true },
    two: { s: 'fisher_old', t: "He's cut it too close to mine. I told him.", end: true },
  },
};
