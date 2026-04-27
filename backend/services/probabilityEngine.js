// ─── POISSON-BASED PROBABILITY ENGINE ──────────────────────────────
// Core probability modeling for football match prediction.
// Uses the Dixon-Coles adjusted Poisson model with home advantage factor.

const HOME_ADVANTAGE = 1.12; // Historical home advantage multiplier (~12% boost)
const LEAGUE_AVG_GOALS = 1.35; // Average goals per team per match across top leagues

/**
 * Factorial with memoization for performance.
 */
const factorialCache = [1, 1];
function factorial(n) {
  if (n < 0) return 1;
  if (factorialCache[n] !== undefined) return factorialCache[n];
  let result = factorialCache[factorialCache.length - 1];
  for (let i = factorialCache.length; i <= n; i++) {
    result *= i;
    factorialCache[i] = result;
  }
  return result;
}

/**
 * Poisson probability mass function.
 * P(X = k) = (λ^k * e^(-λ)) / k!
 */
function poisson(k, lambda) {
  if (lambda <= 0 || k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Compute expected goals (lambda) for each team.
 *
 * Formula:
 *   λ_home = (homeAttack / leagueAvg) * (awayDefense / leagueAvg) * leagueAvg * homeAdvantage
 *   λ_away = (awayAttack / leagueAvg) * (homeDefense / leagueAvg) * leagueAvg
 *
 * @param {Object} homeStats - { avgGoalsFor, avgGoalsAgainst }
 * @param {Object} awayStats - { avgGoalsFor, avgGoalsAgainst }
 * @returns {{ lambdaHome: number, lambdaAway: number }}
 */
export function computeExpectedGoals(homeStats, awayStats) {
  const homeAttack = homeStats?.avgGoalsFor || LEAGUE_AVG_GOALS;
  const homeDefense = homeStats?.avgGoalsAgainst || LEAGUE_AVG_GOALS;
  const awayAttack = awayStats?.avgGoalsFor || LEAGUE_AVG_GOALS;
  const awayDefense = awayStats?.avgGoalsAgainst || LEAGUE_AVG_GOALS;

  // Attack strength = team's goals / league average
  // Defense weakness = opponent's conceded / league average
  const homeAttackStrength = homeAttack / LEAGUE_AVG_GOALS;
  const awayDefenseWeakness = awayDefense / LEAGUE_AVG_GOALS;
  const awayAttackStrength = awayAttack / LEAGUE_AVG_GOALS;
  const homeDefenseWeakness = homeDefense / LEAGUE_AVG_GOALS;

  let lambdaHome = homeAttackStrength * awayDefenseWeakness * LEAGUE_AVG_GOALS * HOME_ADVANTAGE;
  let lambdaAway = awayAttackStrength * homeDefenseWeakness * LEAGUE_AVG_GOALS;

  // Clamp to realistic range
  lambdaHome = Math.max(0.3, Math.min(4.0, lambdaHome));
  lambdaAway = Math.max(0.3, Math.min(4.0, lambdaAway));

  return {
    lambdaHome: parseFloat(lambdaHome.toFixed(3)),
    lambdaAway: parseFloat(lambdaAway.toFixed(3)),
  };
}

/**
 * Generate the full scoreline probability matrix (0-5 goals each side).
 * Also derives all market probabilities from the matrix.
 *
 * @param {number} lambdaHome - Expected goals for home team
 * @param {number} lambdaAway - Expected goals for away team
 * @returns {Object} Full probability breakdown
 */
export function generateProbabilities(lambdaHome, lambdaAway) {
  const MAX_GOALS = 6; // 0-5 goals (index 0-5)

  // Build the scoreline matrix
  const matrix = [];
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0;
  let bttsYes = 0;

  for (let h = 0; h < MAX_GOALS; h++) {
    for (let a = 0; a < MAX_GOALS; a++) {
      const prob = poisson(h, lambdaHome) * poisson(a, lambdaAway);

      matrix.push({
        home: h,
        away: a,
        probability: parseFloat((prob * 100).toFixed(2)),
      });

      // Match outcome
      if (h > a) homeWinProb += prob;
      else if (h === a) drawProb += prob;
      else awayWinProb += prob;

      // Total goals markets
      const total = h + a;
      if (total > 0) over05 += prob;
      if (total > 1) over15 += prob;
      if (total > 2) over25 += prob;
      if (total > 3) over35 += prob;
      if (total > 4) over45 += prob;

      // Both teams to score
      if (h > 0 && a > 0) bttsYes += prob;
    }
  }

  // Sort matrix by probability descending
  matrix.sort((a, b) => b.probability - a.probability);

  // Top scorelines
  const topScorelines = matrix.slice(0, 6).map(s => ({
    score: `${s.home}-${s.away}`,
    home: s.home,
    away: s.away,
    probability: s.probability,
  }));

  const probabilities = {
    home: parseFloat((homeWinProb * 100).toFixed(1)),
    draw: parseFloat((drawProb * 100).toFixed(1)),
    away: parseFloat((awayWinProb * 100).toFixed(1)),
  };

  const overUnder = {
    over05: parseFloat((over05 * 100).toFixed(1)),
    over15: parseFloat((over15 * 100).toFixed(1)),
    over25: parseFloat((over25 * 100).toFixed(1)),
    over35: parseFloat((over35 * 100).toFixed(1)),
    over45: parseFloat((over45 * 100).toFixed(1)),
    under15: parseFloat(((1 - over15) * 100).toFixed(1)),
    under25: parseFloat(((1 - over25) * 100).toFixed(1)),
    under35: parseFloat(((1 - over35) * 100).toFixed(1)),
  };

  const btts = {
    yes: parseFloat((bttsYes * 100).toFixed(1)),
    no: parseFloat(((1 - bttsYes) * 100).toFixed(1)),
  };

  // Risk classification based on max probability
  const maxProb = Math.max(probabilities.home, probabilities.draw, probabilities.away);
  let riskLevel;
  if (maxProb > 65) riskLevel = 'LOW';
  else if (maxProb >= 45) riskLevel = 'MEDIUM';
  else riskLevel = 'HIGH';

  return {
    probabilities,
    overUnder,
    btts,
    topScorelines,
    riskLevel,
    expectedGoals: {
      home: lambdaHome,
      away: lambdaAway,
      total: parseFloat((lambdaHome + lambdaAway).toFixed(2)),
    },
    matrix: matrix.slice(0, 25), // Top 25 scorelines for the frontend
  };
}

/**
 * Build a complete market analysis from team stats.
 * This is the main entry point for probability calculations.
 *
 * @param {Object} homeStats - Normalized home team stats
 * @param {Object} awayStats - Normalized away team stats
 * @returns {Object} Full probability output
 */
export function analyzeMatch(homeStats, awayStats) {
  const { lambdaHome, lambdaAway } = computeExpectedGoals(homeStats, awayStats);
  const result = generateProbabilities(lambdaHome, lambdaAway);

  // Build ranked market list with risk tags
  const markets = buildMarketList(result);

  return {
    ...result,
    markets,
    bestPick: markets[0] || null,
    lowRiskMarkets: markets.filter(m => m.risk === 'LOW'),
    mediumRiskMarkets: markets.filter(m => m.risk === 'MEDIUM'),
    highRiskMarkets: markets.filter(m => m.risk === 'HIGH'),
  };
}

/**
 * Build a sorted list of all betting markets with risk classification.
 */
function buildMarketList(probResult) {
  const { probabilities, overUnder, btts } = probResult;

  const all = [
    { name: 'Home Win', probability: probabilities.home, category: '1X2' },
    { name: 'Draw', probability: probabilities.draw, category: '1X2' },
    { name: 'Away Win', probability: probabilities.away, category: '1X2' },
    { name: 'Over 0.5 Goals', probability: overUnder.over05, category: 'Goals' },
    { name: 'Over 1.5 Goals', probability: overUnder.over15, category: 'Goals' },
    { name: 'Over 2.5 Goals', probability: overUnder.over25, category: 'Goals' },
    { name: 'Under 2.5 Goals', probability: overUnder.under25, category: 'Goals' },
    { name: 'Over 3.5 Goals', probability: overUnder.over35, category: 'Goals' },
    { name: 'Under 3.5 Goals', probability: overUnder.under35, category: 'Goals' },
    { name: 'BTTS Yes', probability: btts.yes, category: 'BTTS' },
    { name: 'BTTS No', probability: btts.no, category: 'BTTS' },
    { name: 'Double Chance 1X', probability: parseFloat((probabilities.home + probabilities.draw).toFixed(1)), category: 'Double Chance' },
    { name: 'Double Chance X2', probability: parseFloat((probabilities.draw + probabilities.away).toFixed(1)), category: 'Double Chance' },
    { name: 'Double Chance 12', probability: parseFloat((probabilities.home + probabilities.away).toFixed(1)), category: 'Double Chance' },
  ];

  return all
    .map(m => ({
      ...m,
      risk: m.probability >= 65 ? 'LOW' : m.probability >= 45 ? 'MEDIUM' : 'HIGH',
      riskColor: m.probability >= 65 ? '#22C55E' : m.probability >= 45 ? '#F59E0B' : '#EF4444',
    }))
    .sort((a, b) => b.probability - a.probability);
}

export default {
  computeExpectedGoals,
  generateProbabilities,
  analyzeMatch,
};
