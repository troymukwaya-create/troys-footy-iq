// ─── MATCH CONTEXT ADJUSTMENTS ──────────────────────────────────────
// Real-world signals the base Poisson/Elo model can't see: how rested a team
// is (fixture congestion — huge during a qualifier/friendly week before the
// World Cup) and how many key players are unavailable (injuries/suspensions).
//
// Every factor defaults to 1.0 (no change) when the data is absent, so this is
// strictly additive: predictions are unchanged unless real context is supplied.
// Each adjustment is returned transparently so the UI can explain "why".

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Fatigue/rest multiplier for a team's attacking output.
 * Short rest after a recent match dents sharpness; very long gaps add mild rust.
 * @param {number|null} restDays - days since the team's previous match
 */
export function restDayFactor(restDays) {
  if (restDays == null || !Number.isFinite(restDays)) return 1.0;
  if (restDays <= 2) return 0.93;   // back-to-back — clear fatigue
  if (restDays === 3) return 0.97;  // short turnaround
  if (restDays <= 10) return 1.0;   // normal, well-rested
  if (restDays <= 18) return 0.99;  // slight rust
  return 0.97;                       // long layoff (e.g. first match in a while)
}

/**
 * Availability multiplier from missing players.
 * Key players (regular starters / top scorers) hurt more than squad depth.
 * @param {{keyPlayersOut?:number, totalOut?:number}} avail
 */
export function availabilityFactor(avail = {}) {
  const keyOut = Number(avail.keyPlayersOut) || 0;
  const totalOut = Number(avail.totalOut) || 0;
  if (keyOut === 0 && totalOut === 0) return 1.0;
  return clamp(1 - 0.06 * keyOut - 0.015 * Math.max(0, totalOut - keyOut), 0.70, 1.0);
}

/**
 * Apply context adjustments to expected goals.
 * @param {number} lambdaHome
 * @param {number} lambdaAway
 * @param {Object} ctx - { homeRestDays, awayRestDays, homeAvailability, awayAvailability }
 * @returns {{lambdaHome:number, lambdaAway:number, factors:Object, applied:boolean}}
 */
export function adjustExpectedGoals(lambdaHome, lambdaAway, ctx = {}) {
  const homeRest = restDayFactor(ctx.homeRestDays);
  const awayRest = restDayFactor(ctx.awayRestDays);
  const homeAvail = availabilityFactor(ctx.homeAvailability);
  const awayAvail = availabilityFactor(ctx.awayAvailability);

  const homeFactor = homeRest * homeAvail;
  const awayFactor = awayRest * awayAvail;
  const applied = homeFactor !== 1.0 || awayFactor !== 1.0;

  return {
    lambdaHome: parseFloat((lambdaHome * homeFactor).toFixed(3)),
    lambdaAway: parseFloat((lambdaAway * awayFactor).toFixed(3)),
    factors: {
      homeRest, awayRest, homeAvail, awayAvail,
      homeFactor: parseFloat(homeFactor.toFixed(3)),
      awayFactor: parseFloat(awayFactor.toFixed(3)),
    },
    applied,
  };
}

export default { restDayFactor, availabilityFactor, adjustExpectedGoals };
