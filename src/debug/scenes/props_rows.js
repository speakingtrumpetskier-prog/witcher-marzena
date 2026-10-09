// Catalog rows for the props gallery. Each item: [propName, options].
export const ROWS = [
  {
    name: 'basic',
    items: [
      ['barrel', { seed: 1 }], ['barrel', { seed: 4 }], ['barrel', { seed: 8 }], ['crate', { seed: 2 }], ['crate', { seed: 5 }],
      ['sack', { seed: 1 }], ['sack', { seed: 3 }], ['bucket', { seed: 2 }], ['firewoodStack', { seed: 1 }],
      ['choppingBlock', { seed: 1 }], ['stump', { seed: 2 }], ['logs', { seed: 1 }], ['lantern', { seed: 1 }], ['campfire', { seed: 1 }],
    ],
  },
  {
    name: 'work',
    items: [
      ['cart', { seed: 1, variant: 'firewood' }], ['cart', { seed: 2, variant: 'sacks' }], ['cartWheel', { seed: 1 }], ['sled', { seed: 1, variant: 'kid' }], ['sled', { seed: 2, variant: 'wood' }],
      ['skis', { seed: 1 }], ['snowShovel', { seed: 1 }], ['snowShovel', { seed: 2, variant: 'stuck' }], ['anvil', { seed: 1 }], ['quenchBarrel', { seed: 1 }], ['grindstone', { seed: 1 }],
      ['hayBale', { seed: 1 }], ['hayBale', { seed: 2, stacked: true }], ['haystack', { seed: 1 }], ['woodpile', { seed: 1 }], ['ladder', { seed: 1 }], ['strawPile', { seed: 1 }], ['skinFrame', { seed: 1 }],
    ],
  },
  {
    name: 'household',
    items: [
      ['bench', { seed: 1, variant: 'plank' }], ['bench', { seed: 2, variant: 'log' }], ['table', { seed: 1 }], ['stool', { seed: 1 }], ['stool', { seed: 2, variant: 'log' }],
      ['shelf', { seed: 1 }], ['spoonRack', { seed: 1 }], ['bed', { seed: 1 }], ['chest', { seed: 1, variant: 'plain' }], ['chest', { seed: 2, variant: 'painted' }], ['chest', { seed: 3, variant: 'painted', open: true }],
      ['rug', { seed: 1, cell: 0 }], ['rug', { seed: 2, cell: 1 }], ['tapestry', { seed: 1, cell: 2 }], ['pot', { seed: 1 }], ['cauldron', { seed: 1 }], ['washTub', { seed: 1 }],
      ['musicBox', { seed: 1 }], ['birdCarving', { seed: 1 }], ['toys', { seed: 1 }], ['snowman', { seed: 1 }],
    ],
  },
];
