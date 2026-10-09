// Weather presets. Weather.js blends between them; Atmosphere and Sky read the blended numbers.
//
// cover/cirrus/overcast: sky layers. sunVis: direct light kept. fogDensity/fogFalloff: ground
// fog (per meter). haze/hazeFalloff: aerial perspective. lake/lakeTop/lakeSoft/lakeNoise: lake
// fog slab. fogWhite: milky desaturated air. snowfall 0..1. wind 0..1 mean strength. gust 0..1
// gustiness. drift: blowing ground snow. satMul/dim: grade. stars/aurora: allowed at night.
// shadow: shadow strength under this sky.
export const WEATHER_STATES = {
  clear: {
    cover: 0.3, cirrus: 0.6, overcast: 0, sunVis: 1,
    fogDensity: 0.00012, fogFalloff: 0.012, haze: 0.0008, hazeFalloff: 1 / 1000,
    lake: 0, lakeTop: 4, lakeSoft: 2.5, lakeNoise: 1.5,
    fogWhite: 0, snowfall: 0, wind: 0.22, gust: 0.25, drift: 0.18,
    satMul: 1, dim: 0, stars: 1, aurora: 1, shadow: 1,
  },
  overcast: {
    cover: 0.9, cirrus: 0.1, overcast: 0.85, sunVis: 0.1,
    fogDensity: 0.0006, fogFalloff: 0.006, haze: 0.0004, hazeFalloff: 1 / 600,
    lake: 0, lakeTop: 4, lakeSoft: 3, lakeNoise: 1.5,
    fogWhite: 0.15, snowfall: 0, wind: 0.35, gust: 0.35, drift: 0.25,
    satMul: 0.8, dim: 0.08, stars: 0, aurora: 0, shadow: 0.35,
  },
  snow: {
    cover: 1, cirrus: 0, overcast: 1, sunVis: 0.03,
    fogDensity: 0.0065, fogFalloff: 0.0035, haze: 0.0011, hazeFalloff: 1 / 600,
    lake: 0, lakeTop: 4, lakeSoft: 3, lakeNoise: 1.5,
    fogWhite: 0.45, snowfall: 0.5, wind: 0.4, gust: 0.4, drift: 0.4,
    satMul: 0.72, dim: 0.2, stars: 0, aurora: 0, shadow: 0.15,
  },
  blizzard: {
    cover: 1, cirrus: 0, overcast: 1, sunVis: 0,
    fogDensity: 0.042, fogFalloff: 0.0012, haze: 0.0016, hazeFalloff: 1 / 800,
    lake: 0, lakeTop: 4, lakeSoft: 3, lakeNoise: 1.5,
    fogWhite: 0.9, snowfall: 1, wind: 1, gust: 0.8, drift: 1,
    satMul: 0.5, dim: 0.3, stars: 0, aurora: 0, shadow: 0,
  },
  fog: {
    cover: 0.4, cirrus: 0, overcast: 0.4, sunVis: 0.42,
    fogDensity: 0.0008, fogFalloff: 0.022, haze: 0.0011, hazeFalloff: 1 / 800,
    lake: 0.045, lakeTop: 10, lakeSoft: 3.5, lakeNoise: 3.5,
    fogWhite: 0.5, snowfall: 0, wind: 0.06, gust: 0.05, drift: 0,
    satMul: 0.85, dim: 0, stars: 0.3, aurora: 0, shadow: 0.6,
  },
};

export const WEATHER_KEYS = Object.keys(WEATHER_STATES.clear);

export function copyParams(src, out = {}) {
  for (const k of WEATHER_KEYS) out[k] = src[k];
  return out;
}
