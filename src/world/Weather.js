// Weather: the antagonist. A state machine that blends parameter sets, wind with gust events,
// GPU snowfall around the camera and blowing ground drift.
//
// Public (G.weather):
//   state                    'clear' | 'overcast' | 'snow' | 'blizzard' | 'fog' (the target state)
//   set(state, seconds = 60) blend to a state (0 = instant). Emits 'weather:change'
//                            { state, prev, seconds }.
//   params                   current blended numbers (see sky/weatherStates.js); read-only
//   transition               0..1 progress of the current blend
//   auto                     random gentle changes in free roam when true (default true)
//   wind                     { dir: Vector2, strength, gust } (also in uWind)
//   gustNow(amount)          trigger a gust (story beats, boss)
//   snowfall, drift          the particle systems (objects with .mesh)
// Writes uWind (dir.xy, strength, gust) and uSnowfall.
// URL: `weather=state` applies instantly at load (shot mode and normal play).
import * as THREE from 'three';
import { ORDER } from '../core/G.js';
import { WEATHER_STATES, copyParams, WEATHER_KEYS } from './sky/weatherStates.js';
import { createSnowfall } from './sky/snowfall.js';
import { createDrift } from './sky/drift.js';
import { clamp, smoothstep, rng } from '../core/util.js';

// Gentle Markov chain for free roam.
const NEXT = {
  clear: [['clear', 2], ['overcast', 3], ['fog', 0.6]],
  overcast: [['clear', 2], ['snow', 2.5], ['overcast', 1], ['fog', 0.5]],
  snow: [['overcast', 2.5], ['blizzard', 0.6], ['snow', 1], ['clear', 0.4]],
  blizzard: [['snow', 3], ['overcast', 1]],
  fog: [['clear', 2], ['overcast', 1.5]],
};

export async function init(G) {
  const U = G.uniforms;
  const rand = rng(G.shot ? 7 : (Date.now() & 0xffff));
  const initial = WEATHER_STATES[G.params.get('weather')] ? G.params.get('weather') : 'clear';

  const from = copyParams(WEATHER_STATES[initial]);
  const params = copyParams(WEATHER_STATES[initial]);
  let target = WEATHER_STATES[initial];
  let duration = 0, elapsed = 0;

  const wind = { dir: new THREE.Vector2(1, 0.3).normalize(), strength: params.wind, gust: 0 };
  let windAngle = Math.atan2(0.3, 1);
  const baseAngle = windAngle;
  let gust = 0, gustTarget = 0, gustTimer = 4, gustHold = 0;
  let autoTimer = 240 + rand() * 240;

  const W = {
    state: initial,
    params,
    transition: 1,
    auto: true,
    wind,
    set(state, seconds = 60) {
      if (!WEATHER_STATES[state]) { console.warn(`[weather] unknown state ${state}`); return; }
      const prev = this.state;
      copyParams(params, from);
      target = WEATHER_STATES[state];
      duration = Math.max(0, seconds);
      elapsed = 0;
      this.state = state;
      if (duration === 0) { copyParams(target, params); this.transition = 1; }
      else this.transition = 0;
      G.events.emit('weather:change', { state, prev, seconds: duration });
    },
    gustNow(amount = 1) {
      gustTarget = clamp(amount, 0, 1.5);
      gustHold = 1.5;
      gustTimer = 6;
    },
  };
  G.weather = W;

  W.snowfall = createSnowfall(G);
  W.drift = createDrift(G);

  function updateGusts(dt) {
    const g = params.gust;
    gustTimer -= dt;
    if (gustTimer <= 0) {
      gustTarget = (0.35 + rand() * 0.65) * g * 1.4;
      gustHold = 0.6 + rand() * 1.8;
      gustTimer = (3 + rand() * 11) / (0.4 + g);
    }
    if (gustHold > 0) {
      gustHold -= dt;
      gust += (gustTarget - gust) * (1 - Math.exp(-dt / 0.6));
    } else {
      gust += (0 - gust) * (1 - Math.exp(-dt / 2.5));
    }
  }

  G.addSystem('weather', (dt, t) => {
    // Blend.
    if (W.transition < 1) {
      elapsed += dt;
      W.transition = duration > 0 ? clamp(elapsed / duration, 0, 1) : 1;
      const k = smoothstep(0, 1, W.transition);
      for (const key of WEATHER_KEYS) params[key] = from[key] + (target[key] - from[key]) * k;
    }

    // Free-roam auto weather (never in shot mode or cutscenes).
    if (W.auto && !G.shot && G.cameraOwner !== 'cutscene' && W.transition >= 1) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        const opts = NEXT[W.state] || NEXT.clear;
        const total = opts.reduce((s, o) => s + o[1], 0);
        let r = rand() * total, next = W.state;
        for (const [name, wgt] of opts) { r -= wgt; if (r <= 0) { next = name; break; } }
        if (next === 'fog' && !(G.time.hours > 4 && G.time.hours < 10)) next = 'overcast';
        if (next !== W.state) W.set(next, 50 + rand() * 40);
        autoTimer = 240 + rand() * 300;
      }
    }

    // Wind: slow meander around the prevailing direction, gusts on top.
    if (!G.shot) updateGusts(dt);
    windAngle = baseAngle + 0.35 * Math.sin(t * 0.013) + 0.18 * Math.sin(t * 0.037 + 1.3) + gust * 0.12;
    wind.dir.set(Math.cos(windAngle), Math.sin(windAngle));
    wind.strength = params.wind;
    wind.gust = clamp(gust, 0, 1);
    U.uWind.value.set(wind.dir.x, wind.dir.y, wind.strength, wind.gust);
    U.uSnowfall.value = params.snowfall;

    W.snowfall.update(dt, t);
    W.drift.update(dt, t);
  }, ORDER.atmosphere - 1);
}
