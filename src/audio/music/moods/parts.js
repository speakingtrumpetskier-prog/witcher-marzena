// Shared instrument presets for the moods (the ensemble). Levels are calibrated against the
// render script's loudness report; pans place a village band in a loose half circle.
export const P = {
  voice: (o) => ({ inst: 'singer', type: 'white', level: 0.42, pan: 0, verb: 0.3, ...o }),
  voiceFar: (o) => ({ inst: 'singer', type: 'white', level: 0.3, pan: 0.15, verb: 0.75, lp: 2600, gain: 0.8, ...o }),
  hum: (o) => ({ inst: 'singer', type: 'hum', level: 0.38, pan: 0, verb: 0.35, vibDepth: 16, breath: 0.035, wave: 'glottalSoft', ...o }),
  throat: (o) => ({ inst: 'singer', type: 'throat', level: 0.5, pan: -0.05, verb: 0.4, vibDepth: 8, jitter: 5, lp: 3000, warmth: 0.3, ...o }),
  choirF: (o) => ({ inst: 'choir', type: 'alto', singers: 6, banks: 2, level: 0.15, pan: -0.12, verb: 0.38, ...o }),
  choirM: (o) => ({ inst: 'choir', type: 'bass', singers: 4, banks: 2, level: 0.19, pan: 0.12, verb: 0.38, lp: 3600, ...o }),
  fiddle: (o) => ({ inst: 'fiddle', level: 0.3, pan: -0.22, verb: 0.24, ...o }),
  flute: (o) => ({ inst: 'flute', level: 0.26, pan: 0.28, verb: 0.32, ...o }),
  gurdy: (o) => ({ inst: 'gurdy', level: 0.26, pan: 0.18, verb: 0.22, ...o }),
  zither: (o) => ({ inst: 'zither', level: 0.42, pan: 0.32, verb: 0.24, ...o }),
  frame: (o) => ({ inst: 'frame', level: 0.42, pan: -0.06, verb: 0.16, ...o }),
  war: (o) => ({ inst: 'war', level: 0.55, pan: 0, verb: 0.25, ...o }),
  box: (o) => ({ inst: 'box', level: 0.3, pan: 0.1, verb: 0.55, ...o }),
  bell: (o) => ({ inst: 'bell', level: 0.35, pan: -0.1, verb: 0.5, ...o }),
  pulse: (o) => ({ inst: 'pulse', level: 0.5, pan: 0, verb: 0.12, ...o }),
  wind: (o) => ({ inst: 'wind', level: 0.5, pan: 0, verb: 0.3, ...o }),
  drone: (o) => ({ inst: 'drone', level: 0.3, pan: 0, verb: 0.35, lp: 900, ...o }),
};
