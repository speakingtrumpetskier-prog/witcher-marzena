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
  {
    name: 'fishing',
    items: [
      ['dryingRack', { seed: 1 }], ['fishBasket', { seed: 1 }], ['fishString', { seed: 1 }], ['net', { seed: 1 }], ['net', { seed: 2, variant: 'heap' }], ['boat', { seed: 1 }], ['boat', { seed: 2, variant: 'overturned' }],
      ['iceFishingHole', { seed: 1, rod: true }], ['iceFishingHole', { seed: 2 }], ['fishingStool', { seed: 1 }], ['fishingStool', { seed: 2, variant: 'bucket' }], ['windbreak', { seed: 1 }],
      ['tent', { seed: 1, variant: 'aframe' }], ['tent', { seed: 2, variant: 'cone' }],
    ],
  },
  {
    name: 'effigy',
    items: [
      ['effigy', { seed: 1, variant: 'pole' }], ['effigy', { seed: 2, variant: 'standing' }], ['effigy', { seed: 3, variant: 'hung' }], ['effigy', { seed: 4, variant: 'seated' }],
      ['effigy', { seed: 5, variant: 'half' }], ['effigy', { seed: 6, variant: 'burnt' }], ['effigy', { seed: 7, variant: 'frozen' }], ['effigy', { seed: 8, variant: 'burning' }],
      ['effigyHead', { seed: 1 }], ['effigyHead', { seed: 2 }], ['effigyHead', { seed: 3, variant: 'frozen' }], ['strawPile', { seed: 2 }],
    ],
  },
  {
    name: 'ritual',
    items: [
      ['ribbonPole', { seed: 1 }], ['ribbonPole', { seed: 2 }], ['offering', { seed: 1, variant: 'bowl' }], ['offering', { seed: 2, variant: 'candle' }], ['gravePostSmall', { seed: 1 }], ['gravePostSmall', { seed: 2, variant: 'redThread' }],
      ['bones', { seed: 1 }], ['skull', { seed: 1, variant: 'wolf' }], ['skull', { seed: 2, variant: 'human' }], ['skull', { seed: 3, variant: 'cow' }], ['signpost', { seed: 1 }],
      ['horseHead', { seed: 1 }], ['roofFinial', { seed: 1 }], ['dogKennel', { seed: 1 }], ['chickenCoop', { seed: 1 }], ['beehive', { seed: 1, variant: 'log' }], ['beehive', { seed: 2, variant: 'skep' }],
    ],
  },
  {
    name: 'misc',
    items: [
      ['rockSmall', { seed: 1 }], ['rockSmall', { seed: 2, variant: 'cluster' }], ['rockSmall', { seed: 3, variant: 'flat' }], ['barrelStack', { seed: 1, variant: 'pyramid' }], ['barrelStack', { seed: 2, variant: 'standing' }],
      ['crateStack', { seed: 1 }], ['laundryLine', { seed: 1 }], ['icicles', { seed: 1 }], ['brazier', { seed: 1 }], ['brazier', { seed: 2, variant: 'tall' }], ['torch', { seed: 1 }],
    ],
  },
];
