// ─── PLAYER IMPACT ──────────────────────────────────────────────────
// Weights a player's absence by how important they actually are, from real
// stats (goals + minutes). Losing a team's top scorer must hurt far more than
// losing a fringe squad member — the old model treated every injury the same.
//
// Pure + dependency-free → fully unit-testable.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Importance score 0..1 from a player's season stats.
 * A regular starter who scores is ~1; a bench player is ~0.
 * @param {{goals?:number, minutes?:number, appearances?:number}} stats
 */
export function playerImportance(stats = {}) {
  const goals = Number(stats.goals) || 0;
  const minutes = Number(stats.minutes) || 0;
  const goalScore = clamp(goals / 8, 0, 1);        // 8+ goals → max attacking weight
  const minuteScore = clamp(minutes / 900, 0, 1);  // ~10 full matches → established starter
  return clamp(0.6 * goalScore + 0.4 * minuteScore, 0, 1);
}

/**
 * Availability multiplier for a team's expected goals, given the players who
 * are OUT (each enriched with an `importance` 0..1; unknown → moderate 0.4).
 * Floors at 0.65 so even a decimated team isn't reduced to nothing.
 * @param {Array<{importance?:number}>} injuredPlayers
 */
export function availabilityFromInjuredPlayers(injuredPlayers = []) {
  if (!Array.isArray(injuredPlayers) || !injuredPlayers.length) return 1.0;
  let penalty = 0;
  for (const p of injuredPlayers) {
    const imp = (p && p.importance != null) ? clamp(Number(p.importance), 0, 1) : 0.4;
    penalty += 0.02 + 0.10 * imp;   // 0.02 depth loss + up to 0.10 for a key player
  }
  return parseFloat(clamp(1 - penalty, 0.65, 1).toFixed(3));
}

/**
 * Convenience: number of "key" players out (importance >= 0.5) — for the UI.
 */
export function keyPlayersOut(injuredPlayers = []) {
  return (injuredPlayers || []).filter(p => (p?.importance ?? 0.4) >= 0.5).length;
}

export default { playerImportance, availabilityFromInjuredPlayers, keyPlayersOut };
