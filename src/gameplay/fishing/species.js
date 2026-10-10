// The fish of the lake: six species and the one old pike. Pure data (no THREE, no DOM) so the bite
// tables and the fight model can be tested in Node (scripts/fishtest.mjs).
//
// Per species:
//   w [min, mean, max] kg, sigma     weight is lognormal around the mean (mean is also the median-ish), clamped to the range
//   len                               length in meters is len * cbrt(kg)
//   depth { pref, spread, min }       where it lives: pref is a fraction of the water column from the ice (0 top, 1 bottom),
//                                     spread the width of that band (fraction of the column, at least 0.45 m), min the
//                                     shallowest water it will be found in
//   rate                              nibbles per minute under ideal conditions (right depth, hour and weather)
//   hours [[hour, 0..1], ...]         how active it is through the day (wraps at midnight)
//   weather { clear, overcast, snow, blizzard, fog }   multiplier
//   sky                               multiplier when the herders hang low and many over the ice (a hard clear frost);
//                                     nobody here says why, the fishermen only go by it
//   bite { nibbles [min, max], gap [min, max], window, shy }   what the bite looks like; shy fish are wary of a jig that moves
//   fight { power, ref, exp, tire, tempo, mix, soft, edge }    pull at its heaviest in line strengths (power at the reference
//                                     weight, grows with weight ** exp), seconds to tire at a typical load, how quick the phases
//                                     change, how often each phase comes, seconds of slack it takes to throw the hook, and
//                                     whether its runs go under the ice edge
//   price                             grosze per kg at the reeve's scales
//   fat                               how much a roast does for warmth and health, 1 is a perch
//   form, palette                     the drawn and modelled shape (mesh.js, ui/sketch.js)
//   note                              Vesna's journal paragraphs; `more` entries unlock as she catches more
export const WEATHERS = ['clear', 'overcast', 'snow', 'blizzard', 'fog'];

const circ = (pts) => pts.slice().sort((a, b) => a[0] - b[0]);

export const SPECIES = {
  perch: {
    id: 'perch', name: 'Perch', pl: 'OkoÅ„',
    w: [0.06, 0.28, 1.1], sigma: 0.55, len: 0.30,
    depth: { pref: 0.45, spread: 0.24, min: 0.7 },
    rate: 1.3,
    hours: circ([[0, 0.15], [5, 0.2], [7, 0.65], [10, 1.0], [14, 1.0], [17, 0.65], [20, 0.3], [24, 0.15]]),
    weather: { clear: 1.0, overcast: 1.0, snow: 0.75, blizzard: 0.4, fog: 0.9 },
    sky: 1.12,
    bite: { nibbles: [1, 3], gap: [0.3, 0.7], window: 0.9, shy: 0.1 },
    fight: { power: 0.30, ref: 0.28, exp: 0.4, tire: 5, tempo: 0.7, mix: { rest: 3, pull: 4, run: 1, dive: 0, shake: 1 }, soft: 1.3, edge: false, lead: 0.3 },
    price: 3.2, fat: 1.0,
    form: { h: 0.24, back: 1.0, belly: 0.85, snout: 0.8, tail: 0.24, dorsal: [0.28, 0.72, 0.16], anal: [0.62, 0.8, 0.07], spiny: true },
    palette: { back: 0x3c4a2c, side: 0x8a9a52, belly: 0xe6e2c4, fin: 0xc84a2c, mark: 0x222a18 },
    marks: 'bars',
    sketch: 'perch',
    note: [
      'Striped, red at the tail and the lower fins, a spiny back. Takes the jig in mid-water in the daytime, off the shelf in front of the huts. There are plenty and most are small.',
      'They fry whole. Zbyszek buys them for the soup.',
    ],
    more: [
      { n: 5, text: 'A big one is a rarer thing. Over half a kilo and it has gone out to the deeper holes.' },
    ],
  },

  roach: {
    id: 'roach', name: 'Roach', pl: 'PÅ‚oÄ‡',
    w: [0.05, 0.22, 0.9], sigma: 0.5, len: 0.27,
    depth: { pref: 0.35, spread: 0.26, min: 0.7 },
    rate: 1.1,
    hours: circ([[0, 0.12], [5, 0.25], [8, 0.8], [11, 1.0], [15, 1.0], [18, 0.6], [21, 0.2], [24, 0.12]]),
    weather: { clear: 0.9, overcast: 1.1, snow: 0.8, blizzard: 0.4, fog: 1.0 },
    sky: 1.1,
    bite: { nibbles: [1, 3], gap: [0.3, 0.8], window: 1.0, shy: 0.15 },
    fight: { power: 0.26, ref: 0.22, exp: 0.4, tire: 4.5, tempo: 0.75, mix: { rest: 3, pull: 4, run: 0.5, dive: 0, shake: 1.5 }, soft: 1.2, edge: false, lead: 0.3 },
    price: 2.4, fat: 0.85,
    form: { h: 0.27, back: 0.95, belly: 0.9, snout: 0.85, tail: 0.25, dorsal: [0.36, 0.64, 0.17], anal: [0.6, 0.82, 0.1] },
    palette: { back: 0x3a4650, side: 0xb8c4c8, belly: 0xeef0ec, fin: 0xd05030, mark: 0x4a5860 },
    marks: 'plain',
    sketch: 'roach',
    note: [
      'Silver with a red eye and red fins. Shallow water, in the daytime, and a soft mouth that tears easily.',
      'Small, bony and everywhere. People eat them because they are there.',
    ],
    more: [],
  },

  bream: {
    id: 'bream', name: 'Bream', pl: 'Leszcz',
    w: [0.35, 1.0, 3.4], sigma: 0.5, len: 0.37,
    depth: { pref: 0.85, spread: 0.16, min: 2.2 },
    rate: 0.6,
    hours: circ([[0, 0.4], [4, 0.7], [6, 1.0], [8, 0.8], [11, 0.3], [15, 0.5], [18, 0.95], [20, 1.0], [22, 0.65], [24, 0.4]]),
    weather: { clear: 0.8, overcast: 1.2, snow: 0.9, blizzard: 0.5, fog: 1.1 },
    sky: 1.2,
    bite: { nibbles: [0, 2], gap: [0.5, 1.1], window: 1.3, shy: 0.2 },
    fight: { power: 0.5, ref: 1.0, exp: 0.4, tire: 12, tempo: 1.4, mix: { rest: 3, pull: 5, run: 0.6, dive: 1.5, shake: 0 }, soft: 1.6, edge: false, lead: 0.5 },
    price: 4.0, fat: 1.05,
    form: { h: 0.4, back: 1.2, belly: 0.9, snout: 0.55, tail: 0.24, dorsal: [0.34, 0.54, 0.22], anal: [0.52, 0.86, 0.13] },
    palette: { back: 0x40382a, side: 0x9a8454, belly: 0xd8caa0, fin: 0x4a443c, mark: 0x2c2820 },
    marks: 'plain',
    sketch: 'bream',
    note: [
      'Tall and flat, the colour of old brass, with a small mouth that points down. It sits near the bottom in the dusk and in the early morning.',
      'It does not run. It leans on the line the whole way up.',
    ],
    more: [],
  },

  pike: {
    id: 'pike', name: 'Pike', pl: 'Szczupak',
    w: [0.9, 3.0, 14], sigma: 0.65, len: 0.52,
    depth: { pref: 0.55, spread: 0.22, min: 1.6 },
    rate: 0.34,
    hours: circ([[0, 0.25], [4, 0.45], [6, 0.9], [7.5, 1.0], [10, 0.6], [14, 0.45], [16, 0.85], [18, 1.0], [21, 0.5], [24, 0.25]]),
    weather: { clear: 0.8, overcast: 1.35, snow: 1.1, blizzard: 0.6, fog: 1.2 },
    sky: 1.35,
    bite: { nibbles: [0, 0], gap: [0.3, 0.5], window: 1.5, shy: 0 },
    fight: { power: 1.15, ref: 3.0, exp: 0.4, tire: 14, tempo: 1.0, mix: { rest: 2, pull: 3, run: 4, dive: 0.5, shake: 2.5 }, soft: 2.2, edge: true, lead: 0.5 },
    price: 5.5, fat: 1.15,
    form: { h: 0.16, back: 0.85, belly: 0.75, snout: 0.35, tail: 0.17, dorsal: [0.72, 0.9, 0.14], anal: [0.7, 0.88, 0.11], flat: true },
    palette: { back: 0x2e3a22, side: 0x6e7c3c, belly: 0xe0dcbc, fin: 0x8a6a30, mark: 0xc8c47a },
    marks: 'spots',
    sketch: 'pike',
    note: [
      'Long, green and spotted, a flat head, a mouth full of teeth. It hangs in the middle of the water at first light and at dusk and takes the jig hard, without a nibble first.',
      'It runs, and it runs under the ice. Let the line out when it does. Reel when it stops.',
    ],
    more: [
      { n: 3, text: 'The small ones are the same as the big ones, only quicker to give up.' },
    ],
  },

  burbot: {
    id: 'burbot', name: 'Burbot', pl: 'MiÄ™tus',
    w: [0.35, 1.2, 3.8], sigma: 0.55, len: 0.45,
    depth: { pref: 0.97, spread: 0.07, min: 3.5 },
    rate: 0.72,
    hours: circ([[0, 1.0], [4, 1.0], [6, 0.45], [8, 0.1], [16, 0.1], [18, 0.5], [20, 1.0], [24, 1.0]]),
    weather: { clear: 1.0, overcast: 1.0, snow: 1.2, blizzard: 0.9, fog: 1.0 },
    sky: 1.6,
    bite: { nibbles: [1, 2], gap: [0.6, 1.2], window: 1.6, shy: 0.1 },
    fight: { power: 0.55, ref: 1.2, exp: 0.4, tire: 11, tempo: 1.3, mix: { rest: 2.5, pull: 3, run: 0.4, dive: 3.5, shake: 0.5 }, soft: 1.8, edge: false, lead: 0.5 },
    price: 6.5, fat: 1.25,
    form: { h: 0.17, back: 0.9, belly: 0.9, snout: 0.5, tail: 0.18, dorsal: [0.3, 0.66, 0.1], anal: [0.45, 0.86, 0.1], barbel: true, eel: true },
    palette: { back: 0x3a3426, side: 0x6c5e3a, belly: 0xc8c09a, fin: 0x4c4030, mark: 0x241e16 },
    marks: 'mottle',
    sketch: 'burbot',
    note: [
      'A freshwater cod, brown and mottled, with a barbel under the chin. It lies on the bottom and only feeds after dark, and the lake has to be deep.',
      'The liver is what people want. It goes down and stays down, and pulls steadily, and it is a long way up.',
    ],
    more: [],
  },

  whitefish: {
    id: 'whitefish', name: 'Whitefish', pl: 'Sieja',
    w: [0.25, 0.7, 2.0], sigma: 0.5, len: 0.36,
    depth: { pref: 0.72, spread: 0.13, min: 5.0 },
    rate: 0.6,
    hours: circ([[0, 0.1], [4, 0.3], [6, 0.7], [8, 1.0], [11, 0.8], [14, 0.5], [18, 0.25], [24, 0.1]]),
    weather: { clear: 1.25, overcast: 0.8, snow: 0.5, blizzard: 0.25, fog: 0.6 },
    sky: 1.5,
    bite: { nibbles: [2, 4], gap: [0.25, 0.5], window: 0.6, shy: 0.45 },
    fight: { power: 0.42, ref: 0.7, exp: 0.4, tire: 7, tempo: 0.6, mix: { rest: 2, pull: 3, run: 2.5, dive: 0.5, shake: 1.5 }, soft: 0.8, edge: false, lead: 0.3 },
    price: 8.0, fat: 1.1,
    form: { h: 0.21, back: 0.95, belly: 0.8, snout: 0.6, tail: 0.24, dorsal: [0.34, 0.5, 0.13], anal: [0.62, 0.8, 0.09], adipose: true },
    palette: { back: 0x3c4a50, side: 0xc4ced0, belly: 0xf0f2ee, fin: 0x8a949a, mark: 0x2c363c },
    marks: 'plain',
    sketch: 'whitefish',
    note: [
      'Silver and slim with a small mouth. It lives in the deep cold water, out past the shelf, and takes the jig so lightly that the tip hardly moves.',
      'Strike early. Once it is on, do not let the line hang slack, or it shakes the hook.',
    ],
    more: [],
  },
};

// The old pike under the bell tower. Not part of the random draw; the side quest brings it up (src/story/controller/side.js).
SPECIES.oldone = {
  ...SPECIES.pike,
  id: 'oldone', name: 'The Old One', pl: 'Szczupak',
  special: true,
  w: [19, 21.5, 24.5], sigma: 0.05,
  rate: 0,
  fight: { ...SPECIES.pike.fight, power: 2.7, ref: 21.5, exp: 0, tire: 55, tempo: 1.15, lead: 0.4, mix: { rest: 2.4, pull: 3.4, run: 3.2, dive: 0.4, shake: 1.6 }, soft: 3.0 },
  price: 3.0, fat: 1.0,
  bite: { nibbles: [0, 0], gap: [0.4, 0.6], window: 2.0, shy: 0 },
  note: [
    'Bogdan\'s name for it. Older than the huts, he says, and bigger than the boat. It took his father\'s line, and his, and every line since from under the bell tower ice.',
  ],
  more: [],
};

export const SPECIES_IDS = ['perch', 'roach', 'bream', 'pike', 'burbot', 'whitefish'];

// Kilograms of the Old One that Bogdan weighs, for the record and the cooking: always listed as a pike in the journal.
export const JOURNAL_ORDER = ['perch', 'roach', 'bream', 'pike', 'burbot', 'whitefish'];

