// rs_fisher_young: Franek on a morning after the quarrel at the river mouth (src/story/controller/roadside/fishers.js).
// Entry: any talk with him once fishers_settled is set. On his own at the hole, or at the second hole he cut. cast: fisher_young.
export default {
  id: 'rs_fisher_young',
  cast: ['fisher_young'],
  start: 'entry',
  nodes: {
    entry: { next: (S) => (S.flag('fishers_settled') === 'both' ? 'two' : 'alone') },
    alone: { s: 'fisher_young', t: 'Nothing since dawn.', end: true },
    two: { s: 'fisher_young', t: "He says my hole's too close to his. I say that's where the fish are.", end: true },
  },
};
