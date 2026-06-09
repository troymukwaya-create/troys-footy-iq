// ─── ELO LEARNING ───────────────────────────────────────────────────
// Pure World-Football-Elo update math (eloratings.net method). National-team
// strength LEARNS from results — qualifiers and friendlies this week shift a
// team's rating, which feeds straight into the World Cup prediction model.
//
// Zero dependencies on purpose: fully unit-testable, no DB, no side effects.
// Persistence + wiring live in nationalTeams.js / the scheduler.

// K-factor by match importance (how much a single result moves the rating).
export const K_BY_IMPORTANCE = {
  friendly: 20,
  qualifier: 40,       // World Cup / continental qualifiers
  nations_league: 40,
  continental_final: 50,
  world_cup: 60,       // World Cup finals matches
};

// Standard home-field Elo bump (eloratings.net uses 100). Zero at neutral venues.
const HOME_FIELD = 100;

/**
 * Goal-difference multiplier — a 3-0 win shifts ratings more than a 1-0.
 * eloratings.net: |gd|<=1 → 1 ; |gd|==2 → 1.5 ; |gd|>=3 → (11+|gd|)/8.
 */
export function goalMultiplier(goalDiff) {
  const gd = Math.abs(goalDiff);
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

/** Expected score for the home team given the two ratings (0..1). */
export function expectedScore(homeElo, awayElo, neutral = false) {
  const dr = (homeElo + (neutral ? 0 : HOME_FIELD)) - awayElo;
  return 1 / (Math.pow(10, -dr / 400) + 1);
}

/**
 * Update both teams' Elo from a single result.
 *
 * @param {number} homeElo
 * @param {number} awayElo
 * @param {number} homeGoals
 * @param {number} awayGoals
 * @param {{neutral?:boolean, importance?:string}} opts
 * @returns {{homeElo:number, awayElo:number, delta:number, expected:number, result:number}}
 */
export function updateElo(homeElo, awayElo, homeGoals, awayGoals, opts = {}) {
  const { neutral = false, importance = 'qualifier' } = opts;
  const K = K_BY_IMPORTANCE[importance] ?? 40;

  const result = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
  const expected = expectedScore(homeElo, awayElo, neutral);
  const g = goalMultiplier(homeGoals - awayGoals);

  const shift = K * g * (result - expected);
  return {
    homeElo: Math.round(homeElo + shift),
    awayElo: Math.round(awayElo - shift), // zero-sum
    delta: Math.round(shift),
    expected: parseFloat(expected.toFixed(3)),
    result,
  };
}

export default { updateElo, expectedScore, goalMultiplier, K_BY_IMPORTANCE };
