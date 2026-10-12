// wild: out in the valley by day. The daylight suite (day.js) with the wooden flute in front, low and unhurried: the
// hills tune, phrases of the song, shepherd's calls the zither answers from below, a drone that comes and goes, and
// room after every section for the wind and the birds. 52 to 56 in 3/4; a time round lasts six minutes or more.
import { dayScore } from './day.js';
import { P } from './parts.js';

export default {
  name: 'wild',
  tempo: 54,
  beats: 3,
  level: 0.71,
  parts: {
    flute: P.flute({ level: 0.28, pan: 0.1, verb: 0.45, lp: 3200, hiss: 0.035, chiff: 0.7, retire: 15 }),
    zither: P.zither({ level: 0.36, verb: 0.42 }),
    drone: P.drone({ level: 0.28, lp: 800, verb: 0.4 }),
  },
  *score(r) {
    yield* dayScore(r, {
      tempo: [52, 56], opener: 'drone', deck: ['hills', 'song', 'call', 'valley', 'stately', 'call'],
      every: 1, flute: 0.75, droneV: 0.55, breath: [4, 7], keepDrone: 0.45, orn: 0.3,
    });
  },
};
