// The kinds of platnik (sky spirit) and what makes each one read differently at a glance.
// A species is: a geometry recipe (geometry.js), shader parameters (shaders.js), a palette of
// (body, inner light) color pairs, and how big, how fast and how high it lives.
//
// Colors are sRGB hex; palettes stay inside the game's winter range plus the spirit colors
// (pale turquoise, glacier blue, rose, amber, violet, white gold) and never go neon.
export const COLORS = {
  turquoise: '#8fe6dc',
  deepTurquoise: '#62cfc8',
  glacier: '#9bc3ff',
  ice: '#dcecff',
  rose: '#ff9db8',
  deepRose: '#f0709a',
  amber: '#ffb15c',
  deepAmber: '#ff9440',
  violet: '#b8a0ff',
  deepViolet: '#9a7cf2',
  whiteGold: '#ffe9ad',
  pearl: '#fff4e0',
};
const C = COLORS;

// Four corner clusters for the lantern: three tentacles each, bunched.
function cornerRoots(rm, y, perCorner, spread) {
  const roots = [];
  for (let k = 0; k < 4; k++) {
    const base = Math.PI / 4 + (k * Math.PI) / 2;
    for (let j = 0; j < perCorner; j++) {
      const a = base + (j - (perCorner - 1) / 2) * spread;
      roots.push([Math.cos(a) * rm, y, Math.sin(a) * rm]);
    }
  }
  return roots;
}

export const SPECIES = [
  {
    id: 'bell',
    name: 'Bell',
    kind: 0,
    count: 30,
    size: [1.8, 3.6],
    rate: [0.24, 0.38],
    alt: [30, 190],
    speed: 0.9,
    extent: 7.5,
    lodRatio: 24,
    maxDist: 900,
    order: 5,
    palette: [
      [C.turquoise, C.violet], [C.glacier, C.whiteGold], [C.turquoise, C.rose], [C.ice, C.deepTurquoise],
      [C.glacier, C.violet],
    ],
    tentFrac: [0.7, 1],
    tentLen: [0.75, 1.25],
    recipe: {
      profile: 'bell', shell: [32, 14], cluster: 1.5, skirt: [48, 2],
      core: { y: 0.95, size: 0.6, halo: 3.4 },
      arms: { n: 4, rootR: 0.1, rootV: 0.35, rootY: 0.7, segs: 16, across: 4, len: 2.8, width: 0.2, off: 0.4 },
      tent: { n: 6, segs: 14, width: 0.016, len: 7.5, rootR: 0.94 },
      fringe: { n: 28, segs: 5, width: 0.01, len: 0.8 },
      gut: { y: 0.95, segs: 8, width: 0.05, len: 1.8 },
    },
    shader: {
      p0: [0.30, 0.07, 0, 0], p1: [0.02, 10, 1.0, 0.12], p2: [0.35, 1.0, 1.8, 0.08], p3: [0, 0.14, 0.1, 0],
      f0: [8, 0.045, 1, 0.6], f1: [0, 1, 2.4, 1], f2: [0.3, 0.7, 0, 0.7],
      bright: 1,
    },
  },
  {
    id: 'saucer',
    name: 'Saucer',
    kind: 0,
    count: 28,
    size: [2.4, 5.2],
    rate: [0.18, 0.28],
    alt: [25, 150],
    speed: 0.7,
    extent: 3.2,
    lodRatio: 20,
    maxDist: 900,
    order: 4,
    palette: [
      [C.ice, C.deepRose], [C.pearl, C.deepViolet], [C.glacier, C.deepAmber], [C.ice, C.rose], [C.pearl, C.deepTurquoise],
    ],
    tentFrac: [0.8, 1],
    tentLen: [0.8, 1.2],
    recipe: {
      profile: 'saucer', shell: [40, 12], cluster: 1.6, skirt: [64, 2],
      core: { y: 0.12, size: 0.5, halo: 3.0 },
      gonads: [0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        return { cx: Math.cos(a) * 0.3, cz: Math.sin(a) * 0.3, radius: 0.19, halfW: 0.04, v: 0.45, segs: 24 };
      }),
      arms: { n: 4, rootR: 0.1, rootV: 0.2, rootY: 0.4, segs: 12, across: 4, len: 1.5, width: 0.2, off: 0.2 },
      fringe: { n: 96, segs: 4, width: 0.007, len: 0.7, rootR: 1.0 },
    },
    shader: {
      p0: [0.42, 0.10, 0, 0], p1: [0.03, 12, 0.8, 0.3], p2: [0.3, 0.8, 1.2, 0.09], p3: [0, 0.1, 0.12, 0],
      f0: [16, 0.04, 1.4, 0.4], f1: [0, 1, 2.6, 1], f2: [0.12, 0.3, 0, 0],
      bright: 1,
    },
  },
  {
    id: 'lantern',
    name: 'Lantern',
    kind: 0,
    count: 20,
    size: [1.6, 3.2],
    rate: [0.28, 0.45],
    alt: [30, 150],
    speed: 0.8,
    extent: 6.5,
    lodRatio: 24,
    maxDist: 900,
    order: 5,
    palette: [
      ['#ffd8a0', C.deepAmber], ['#ffc4d2', C.deepRose], ['#ffe6a8', C.amber], ['#e6d2ff', C.deepViolet],
    ],
    tentFrac: [0.8, 1],
    tentLen: [0.8, 1.2],
    recipe: {
      profile: 'lantern', shell: [32, 14], cluster: 1.4, skirt: [32, 2],
      core: { y: 0.55, size: 0.85, halo: 3.2 },
      arms: { n: 4, rootR: 0.08, rootV: 0.4, rootY: 0.6, segs: 14, across: 4, len: 1.7, width: 0.3, off: 0.8 },
      tent: { roots: cornerRoots(0.96, 0.0, 3, 0.1), n: 12, segs: 14, width: 0.016, len: 6.2 },
      fringe: { n: 16, segs: 4, width: 0.01, len: 0.5 },
    },
    shader: {
      p0: [0.22, 0.08, 4, 0.1], p1: [0.015, 8, 1.1, 0.1], p2: [0.4, 1.0, 1.4, 0.04], p3: [0.14, 0.12, 0.05, 0], p4: [0.03, 8, 0, 0],
      f0: [8, 0.06, 1, 0.3], f1: [0, 1.0, 2.2, 1.1], f2: [0.8, 1.5, 0, 0],
      bright: 1.1,
    },
  },
  {
    id: 'comb',
    name: 'Comb jelly',
    kind: 1,
    count: 20,
    size: [2.0, 3.8],
    rate: [0.2, 0.3],
    alt: [20, 130],
    speed: 0.6,
    extent: 7.2,
    lodRatio: 24,
    maxDist: 800,
    order: 3,
    palette: [[C.glacier, C.turquoise], [C.ice, C.violet], [C.turquoise, C.glacier], [C.ice, C.rose]],
    tentFrac: [1, 1],
    tentLen: [0.8, 1.2],
    recipe: {
      profile: 'ovoid', shell: [28, 16],
      core: { y: 0.1, size: 0.2, halo: 2.6 },
      tent: { roots: [[0.4, -0.1, 0], [-0.4, -0.1, 0]], n: 2, segs: 18, width: 0.012, len: 6.5 },
      pinn: { per: 14, segs: 3, len: 0.5, width: 0.006 },
      gut: { y: 0.62, segs: 6, width: 0.03, len: 1.15 },
    },
    shader: {
      p0: [0, 0, 0, 0], p1: [0, 0, 1.1, 0], p2: [0.4, 0, 0, 0], p3: [0, 0, 0, 0.55],
      f0: [0, 0, 0, 0], f1: [8, 0, 2.4, 1],
      bright: 1,
    },
  },
  {
    id: 'swarm',
    name: 'Sparks',
    kind: 0,
    count: 16, // schools
    school: [8, 15],
    size: [0.4, 0.7],
    rate: [0.55, 0.95],
    alt: [18, 100],
    speed: 1.1,
    extent: 2.4,
    lodRatio: 40,
    lods: [{ detail: 1, ratio: 60 }, { detail: 0.5, ratio: 200 }, { glowOnly: true, ratio: Infinity }],
    maxDist: 450,
    order: 6,
    single: true,
    palette: [[C.whiteGold, C.whiteGold], [C.turquoise, C.ice], [C.pearl, C.amber], [C.ice, C.turquoise]],
    tentFrac: [0.8, 1],
    tentLen: [0.8, 1.2],
    recipe: {
      profile: 'dome', shell: [12, 6],
      core: { y: 0.3, size: 0.9, halo: 3.0, haloI: 0.1 },
      tent: { n: 5, segs: 5, width: 0.05, len: 2.3, rootR: 0.9 },
    },
    shader: {
      p0: [0.34, 0.06, 0, 0], p1: [0, 6, 1.3, 0.1], p2: [0.4, 0, 0, 0], p3: [0, 0, 0, 0],
      f0: [6, 0.07, 1, 0], f1: [0, 0.8, 2.0, 1],
      bright: 1.2,
    },
  },
  {
    // The one. Not a species: a single behemoth on a long circuit of the valley (see Spirits.js).
    // Size is the bell radius in meters: a bell about 175 m across, tentacles 300 to 500 m long.
    id: 'cathedral',
    name: 'Cathedral',
    kind: 0,
    count: 1,
    size: [88, 88],
    rate: [0.034, 0.034], // one pulse in about 29 s
    alt: [520, 520],
    speed: 0,
    extent: 6.4,
    lodRatio: 1e9,
    maxDist: 9000,
    order: 1,
    single: true,
    circuit: { cx: 20, cz: -250, rx: 560, rz: 255, period: 2400, start: 0.58, minAlt: 500, clearance: 440 },
    palette: [[C.pearl, C.whiteGold]],
    panes: [C.rose, C.amber, C.turquoise, C.violet],
    tentFrac: [1, 1],
    tentLen: [1, 1],
    recipe: {
      profile: 'cathedral', shell: [96, 36], cluster: 1.5, skirt: [160, 3],
      core: { y: 0.8, size: 1.0, halo: 3.6, haloI: 0.24 },
      gonads: [0.2, 0.4, 0.6].map((r, i) => ({ cx: 0, cz: 0, radius: r, halfW: 0.016, v: 0.2 + i * 0.18, segs: 72 })),
      arms: [
        // inner frilled pillars hanging from the nave
        { n: 10, rootR: 0.22, rootV: 0.3, rootY: 0.55, segs: 26, across: 4, len: 3.4, width: 0.15, off: 0.1 },
        // the veils: wide curtains hanging from the rim, following it
        { n: 28, rootR: 0.94, rootV: 0.97, rootY: 1, segs: 30, across: 4, len: 4.3, width: 0.2, off: 0.05, tangent: Math.PI / 2 },
      ],
      tent: { n: 72, segs: 26, width: 0.005, len: 5.0, rootR: 0.97 },
      // slow thick ropes among the threads
      fringe: { n: 14, segs: 26, width: 0.013, len: 5.4, rootR: 0.88 },
      lamps: { n: 20, rings: [0.2, 0.42, 0.66], drop: [0.14, 0.34], size: 0.075, chain: 0.0025 },
      gut: { y: 0.95, segs: 14, width: 0.018, len: 3.4 },
    },
    shader: {
      p0: [0.12, 0.05, 16, 0.04], p1: [0.01, 24, 0.9, 0.05], p2: [0.55, 0.9, 0.8, 0.03], p3: [0, 0.18, 0.04, 0.02], p4: [0.06, 16, 0, 0],
      f0: [16, 0.03, 1, 0.2], f1: [0, 1, 2.4, 0.9], f2: [0.25, 0.55, 1.0, 0.5],
      s: [0.12, 0.9],
      bright: 0.95,
    },
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
