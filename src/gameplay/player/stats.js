// Player vitals: health, stamina, sign energy, warmth. DESIGN 4.5.
//
//   initStats(P)                 sets the fields on the player object
//   updateStats(P, dt)           regeneration, warmth model, frost overlay, persistence
//   spendStamina(P, n)           false when there is nothing left to spend
//   spendSign(P, n)              false when the bar is too low
//
// Warmth drains outdoors at night, in snowfall and in high wind (read from G.time and the blended
// G.weather.params), faster on open ice; it refills near G.world.fires entries { x, z, r, heat? },
// indoors (G.world.indoors?.(x, z)) and from the Thaw draught. Low warmth slows stamina regen,
// drives G.postfx.frost, makes Vesna shiver, and at zero bleeds a little health (never to death).
import { G } from '../../core/G.js';
import { clamp, smoothstep, damp } from '../../core/util.js';

export const TUNE = {
  maxHealth: 100,
  maxStamina: 100,
  staminaRegen: 27, // per second once the delay has passed
  staminaDelay: 0.85,
  sprintDrain: 13,
  exhaustedBelow: 0.5, // sprint locks out at this stamina...
  exhaustedUntil: 24, // ...until it recovers to this
  signRegen: 0.055, // of the full bar per second
  signDelay: 1.4,
  // warmth per second
  nightDrain: 0.0011,
  snowDrain: 0.0016,
  windDrain: 0.0030,
  iceExposure: 1.3,
  mountedShelter: 0.75,
  fireGain: 0.11,
  indoorGain: 0.09,
  freezeBleed: 0.3, // health per second at zero warmth
  frostBelow: 0.35,
};

export function initStats(P) {
  P.maxHealth = TUNE.maxHealth;
  P.health = TUNE.maxHealth;
  P.maxStamina = TUNE.maxStamina;
  P.stamina = TUNE.maxStamina;
  P.warmth = 1;
  P.signEnergy = 1;
  P.sign = 'ember';
  P.exhausted = false;
  P._s = { staminaWait: 0, signWait: 0, saveT: 0, frost: 0, frostOn: false, freezeMsg: 0, shelter: 0, fire: 0 };
}

export function spendStamina(P, n) {
  if (P.stamina <= 0.01) return false;
  P.stamina = Math.max(0, P.stamina - n);
  P._s.staminaWait = TUNE.staminaDelay;
  return true;
}

export function spendSign(P, cost) {
  if (P.signEnergy < cost - 1e-4) return false;
  P.signEnergy = Math.max(0, P.signEnergy - cost);
  P._s.signWait = TUNE.signDelay;
  return true;
}

function nightness() {
  const h = G.time?.hours ?? 12;
  if (h >= 19 || h < 5.5) return 1;
  if (h >= 17.5) return (h - 17.5) / 1.5;
  if (h < 7) return 1 - (h - 5.5) / 1.5;
  return 0;
}

// Strength 0..1 of the best heat source at (x, z).
function fireStrength(x, z) {
  const fires = G.world?.fires;
  if (!fires || !fires.length) return 0;
  let best = 0;
  for (const f of fires) {
    const d = Math.hypot(x - f.x, z - f.z);
    const r = f.r || 5;
    const k = clamp(1 - (d - r * 0.35) / (r * 0.65)) * (f.heat ?? 1);
    if (k > best) best = k;
  }
  return best;
}

export function updateStats(P, dt) {
  const S = P._s;
  const live = P.state !== 'dead';

  // Stamina.
  if (S.staminaWait > 0) S.staminaWait -= dt;
  else if (P.stamina < P.maxStamina) {
    const cold = 0.35 + 0.65 * smoothstep(0, TUNE.frostBelow + 0.15, P.warmth);
    P.stamina = Math.min(P.maxStamina, P.stamina + TUNE.staminaRegen * cold * dt);
  }
  if (P.exhausted && P.stamina >= TUNE.exhaustedUntil) P.exhausted = false;

  // Sign energy.
  if (S.signWait > 0) S.signWait -= dt;
  else if (P.signEnergy < 1) P.signEnergy = Math.min(1, P.signEnergy + TUNE.signRegen * dt);

  // Warmth. Frozen clocks (cutscenes, rest) and scripted states do not drain it.
  const running = live && P.control && !(G.time && G.time.scale === 0 && !G.shot);
  const pos = P.position;
  if (running) {
    const indoors = !!(G.world?.indoors && G.world.indoors(pos.x, pos.z));
    const fire = fireStrength(pos.x, pos.z);
    S.fire = fire;
    const W = G.weather?.params;
    let drain = nightness() * TUNE.nightDrain
      + (W ? W.snowfall * TUNE.snowDrain + Math.max(0, W.wind - 0.3) * TUNE.windDrain + W.overcast * 0.0002 : 0);
    if (P.surface === 'ice') drain *= TUNE.iceExposure;
    if (P.mounted) drain *= TUNE.mountedShelter;
    let gain = 0;
    if (indoors) { drain = 0; gain = TUNE.indoorGain; }
    if (fire > 0) { drain *= 1 - fire; gain = Math.max(gain, TUNE.fireGain * fire); }
    P.warmth = clamp(P.warmth + (gain - drain) * dt);
    if (P.warmth <= 0.001 && P.health > 1) {
      P.health = Math.max(1, P.health - TUNE.freezeBleed * dt);
      S.freezeMsg -= dt;
      if (S.freezeMsg <= 0) { S.freezeMsg = 20; G.ui?.notify?.('You are freezing. Find a fire.', 'info'); }
    }
  }
  const shiver = P.warmth < 0.3;
  if (P.character && P.character.cold !== shiver) P.character.cold = shiver;

  // Frost on the screen edges.
  const want = P.warmth < TUNE.frostBelow ? Math.pow((TUNE.frostBelow - P.warmth) / TUNE.frostBelow, 1.2) * 0.9 : 0;
  S.frost = damp(S.frost, want, 1.6, dt);
  if (G.postfx && (S.frost > 0.002 || S.frostOn)) {
    G.postfx.frost = S.frost;
    S.frostOn = S.frost > 0.002;
  }

  // Keep the save data current: Flow.save() and the pause menu both write G.state.data.
  S.saveT -= dt;
  if (S.saveT <= 0) {
    S.saveT = 0.6;
    const d = G.state?.data;
    if (d) d.vitals = { health: P.health, stamina: P.stamina, warmth: P.warmth, signEnergy: P.signEnergy, sign: P.sign };
  }
}

// Restore from G.state.data.vitals (after 'loaded') or refill (after 'reset').
export function applyVitals(P, v) {
  if (v) {
    P.health = clamp(v.health ?? P.maxHealth, 1, P.maxHealth);
    P.stamina = clamp(v.stamina ?? P.maxStamina, 0, P.maxStamina);
    P.warmth = clamp(v.warmth ?? 1);
    P.signEnergy = clamp(v.signEnergy ?? 1);
    if (v.sign) P.sign = v.sign;
  } else {
    P.health = P.maxHealth; P.stamina = P.maxStamina; P.warmth = 1; P.signEnergy = 1;
  }
  P.exhausted = false;
}
