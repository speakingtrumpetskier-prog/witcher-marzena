// village: in and around the village by day. The daylight suite (day.js) with the zither in front: the valley's
// tunes, the old dance slowed into a song, the Marzanno song, the zither alone with its chords, a little more motion
// and less room than out in the wild. 56 to 60 in 3/4; a time round lasts about five and a half minutes.
import { dayScore } from './day.js';
import { P } from './parts.js';

export default {
  name: 'village',
  tempo: 58,
  beats: 3,
  level: 1.35,
  parts: {
    zither: P.zither({ level: 0.4, verb: 0.3 }),
    flute: P.flute({ level: 0.24, pan: -0.2, verb: 0.38, lp: 3200, hiss: 0.03, chiff: 0.6, retire: 15 }),
    drone: P.drone({ level: 0.26, lp: 900, verb: 0.3 }),
  },
  *score(r) {
    yield* dayScore(r, {
      tempo: [56, 60], opener: 'prelude', deck: ['valley', 'dance', 'song', 'stately', 'hills', 'zither'],
      every: 2, flute: 0.3, droneV: 0.55, breath: [3, 5], keepDrone: 0.6, orn: 0.2,
    });
  },
};
