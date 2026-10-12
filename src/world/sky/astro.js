// Sun and moon positions for a northern winter valley (about 60 degrees north, late winter).
// Directions are world space, normalized, pointing TO the body: +X east, +Z south, +Y up.
//
// With latitude 60 and solar declination -8 the sun rises at ~6:56 east-southeast, culminates
// due south at ~22 degrees, and sets at ~17:04 west-southwest. The moon is near full and rides
// opposite the sun: up at dusk in the east, high in the south at midnight (~42 degrees).
const DEG = Math.PI / 180;
const LAT = 60 * DEG;
const SUN_DEC = -8 * DEG;
const MOON_DEC = 12 * DEG;
const SIN_LAT = Math.sin(LAT), COS_LAT = Math.cos(LAT);

// Hour angle h (radians, 0 at local noon) and declination to a direction vector.
function bodyDir(h, dec, out) {
  // East-north-up frame: altitude/azimuth from the standard spherical astronomy relations.
  const sd = Math.sin(dec), cd = Math.cos(dec);
  const ch = Math.cos(h), sh = Math.sin(h);
  // Local horizontal coordinates: x east, y north, z up.
  const east = -cd * sh;
  const north = sd * COS_LAT - cd * ch * SIN_LAT;
  const up = sd * SIN_LAT + cd * ch * COS_LAT;
  out.set(east, up, -north);
  return out.normalize();
}

export function sunDirection(hours, out) {
  return bodyDir((hours - 12) * 15 * DEG, SUN_DEC, out);
}

export function moonDirection(hours, out) {
  return bodyDir((hours - 24) * 15 * DEG + 0.35, MOON_DEC, out);
}

// Fraction of the moon disk lit (0 new, 1 full) and the waxing sign, constant for the story.
export const MOON_PHASE = 0.82;
