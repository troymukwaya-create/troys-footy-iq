// ─── POISSON-BASED PROBABILITY ENGINE ──────────────────────────────
// Core probability modeling for football match prediction.
// Uses the Dixon-Coles adjusted Poisson model with home advantage factor.
// Enhanced with ensemble blending (Poisson + ML residual + Market consensus).

import { ensemblePredict, applyMLCorrection, oddsToImpliedProbs } from '../engine/ensemble.js';

const HOME_ADVANTAGE = 1.12; // Historical home advantage multiplier (~12% boost)
const LEAGUE_AVG_GOALS = 1.35; // Average goals per team per match across top leagues

// Markets that are near-certain by construction and must NEVER be used as the
// headline "confidence" or featured pick (this was the root cause of every
// card showing ~95%). "Over 0.5 Goals" ≈ at least one goal all match ≈ 95%.
const TRIVIAL_MARKETS = new Set(['Over 0.5 Goals']);
const UNIFORM_1X2 = 1 / 3;
const DATA_QUALITY_FACTOR = { FULL: 1.0, PARTIAL: 0.8, MINIMAL: 0.65, FALLBACK: 0.5 };

/**
 * Honest match confidence — how sure the model is of the RESULT, derived from
 * the 1X2 spread (NOT from a near-certain throwaway market).
 *
 * 0 at a coin-flip (uniform 33/33/33), rising as one outcome dominates, then
 * penalised for weak data and capped by model maturity (see trustSignals.js).
 * A genuinely close match now reads LOW — which is the honest answer.
 *
 * @param {{home:number,draw:number,away:number}} probabilities - percentages
 * @param {{maxConfidence?:number,dataQuality?:string}} opts
 */
export function computeConfidence(probabilities, opts = {}) {
  const { maxConfidence = 100, dataQuality = 'FULL' } = opts;
  const maxP = Math.max(probabilities.home, probabilities.draw, probabilities.away) / 100;

  // Certainty: 0 when the favourite is at the uniform prior, 1 when certain.
  const certainty = Math.max(0, (maxP - UNIFORM_1X2) / (1 - UNIFORM_1X2));
  let base = certainty * 100;
  base *= (DATA_QUALITY_FACTOR[dataQuality] ?? 0.5);

  const score = Math.min(base, maxConfidence);
  const predictedOutcome =
    probabilities.home >= probabilities.draw && probabilities.home >= probabilities.away ? 'HOME'
    : probabilities.away >= probabilities.draw ? 'AWAY' : 'DRAW';

  return {
    score: parseFloat(score.toFixed(1)),
    tier: score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW',
    predictedOutcome,
    outcomeProbability: parseFloat((maxP * 100).toFixed(1)),
    basis: '1X2-spread',
    capped: base > maxConfidence,
    maturityCap: maxConfidence,
  };
}

/**
 * Pick the featured/suggested market — the most likely MEANINGFUL market,
 * excluding near-certain throwaways. This is a betting suggestion, shown
 * separately from match confidence.
 */
export function selectHeadlinePick(markets) {
  const meaningful = (markets || []).filter(
    m => !TRIVIAL_MARKETS.has(m.name) && m.probability <= 90
  );
  return meaningful[0] || (markets || [])[0] || null;
}

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
  // Use real stats if valid, otherwise fall back to league average
  // but LOG when we're using fallbacks so it's traceable
  const homeAttack = (homeStats?.isValid && homeStats.avgGoalsFor > 0) ? homeStats.avgGoalsFor : LEAGUE_AVG_GOALS;
  const homeDefense = (homeStats?.isValid && homeStats.avgGoalsAgainst > 0) ? homeStats.avgGoalsAgainst : LEAGUE_AVG_GOALS;
  const awayAttack = (awayStats?.isValid && awayStats.avgGoalsFor > 0) ? awayStats.avgGoalsFor : LEAGUE_AVG_GOALS;
  const awayDefense = (awayStats?.isValid && awayStats.avgGoalsAgainst > 0) ? awayStats.avgGoalsAgainst : LEAGUE_AVG_GOALS;

  const usingDefaults = (!homeStats?.isValid || !awayStats?.isValid);
  if (usingDefaults) {
    console.warn('[probEngine] computeExpectedGoals using fallback values:', {
      homeValid: homeStats?.isValid, awayValid: awayStats?.isValid,
      homeAttack, homeDefense, awayAttack, awayDefense,
    });
  }

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
    params: {
      homeAttackStrength: parseFloat(homeAttackStrength.toFixed(3)),
      awayDefenseWeakness: parseFloat(awayDefenseWeakness.toFixed(3)),
      awayAttackStrength: parseFloat(awayAttackStrength.toFixed(3)),
      homeDefenseWeakness: parseFloat(homeDefenseWeakness.toFixed(3)),
      usingDefaults: (!homeStats?.isValid || !awayStats?.isValid),
    },
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
  const MAX_GOALS = 8; // 0-7 goals each side — captures the Poisson tail (was 0-5, which dropped ~6% mass)

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

  // Normalise 1X2 over the grid mass so home+draw+away = 100 exactly.
  // (Any probability beyond the scoreline grid is otherwise silently lost,
  //  leaving the displayed percentages adding up to ~94% — a credibility bug.)
  const outcomeMass = (homeWinProb + drawProb + awayWinProb) || 1;
  const probabilities = {
    home: parseFloat((homeWinProb / outcomeMass * 100).toFixed(1)),
    draw: parseFloat((drawProb / outcomeMass * 100).toFixed(1)),
    away: parseFloat((awayWinProb / outcomeMass * 100).toFixed(1)),
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
 * Pipeline:
 *   1. Compute expected goals (Poisson λ)
 *   2. Generate scoreline matrix → baseline probabilities
 *   3. Apply ensemble (Poisson + ML residual + market consensus)
 *   4. Build ranked market list with risk tags
 *
 * @param {Object} homeStats - Normalized home team stats
 * @param {Object} awayStats - Normalized away team stats
 * @param {Object} context   - Optional: { odds, h2h, homePosition, awayPosition }
 * @returns {Object} Full probability output
 */
export async function analyzeMatch(homeStats, awayStats, context = {}) {
  const { lambdaHome, lambdaAway } = computeExpectedGoals(homeStats, awayStats);
  const result = generateProbabilities(lambdaHome, lambdaAway);

  // ─── Ensemble: blend Poisson baseline with ML correction ───────
  let finalProbs = result.probabilities;
  let ensembleMethod = 'poisson_only';

  try {
    // ML residual correction (rule-based for now, XGBoost later)
    const mlProbs = applyMLCorrection(result.probabilities, homeStats, awayStats, {
      lambdaHome, lambdaAway,
      h2h: context.h2h,
    });

    // Market consensus (when odds available)
    let marketProbs = null;
    if (context.odds?.home && context.odds?.draw && context.odds?.away) {
      marketProbs = oddsToImpliedProbs(context.odds);
    }

    // ensemblePredict is async (loads weights from DB) — must await
    const ensemble = await ensemblePredict(result.probabilities, mlProbs, marketProbs, {
      applyCalibration: true,
    });

    finalProbs = { home: ensemble.home, draw: ensemble.draw, away: ensemble.away };
    ensembleMethod = ensemble.method || 'ensemble';
  } catch (e) {
    // Ensemble failed — use Poisson baseline (graceful degradation)
    console.error('[probabilityEngine] Ensemble failed, falling back to Poisson:', e.message);
    ensembleMethod = 'poisson_only';
  }

  // Override result probabilities with ensemble output
  result.probabilities = finalProbs;

  // Recalculate risk level based on ensemble probabilities
  const maxProb = Math.max(finalProbs.home, finalProbs.draw, finalProbs.away);
  result.riskLevel = maxProb >= 65 ? 'LOW' : maxProb >= 45 ? 'MEDIUM' : 'HIGH';

  // Build ranked market list with risk tags
  const markets = buildMarketList(result);

  // Honest match confidence from the 1X2 spread (capped by data quality).
  // The maturity cap is applied later by callers that have DB access.
  const confidence = computeConfidence(finalProbs, {
    dataQuality: context.dataQuality || (result.expectedGoals?.usingDefaults ? 'FALLBACK' : 'FULL'),
  });

  // Featured bet = most likely MEANINGFUL market (never a near-certain throwaway).
  const headlinePick = selectHeadlinePick(markets);

  return {
    ...result,
    markets,
    confidence,                 // honest, 1X2-derived match confidence
    predictedOutcome: confidence.predictedOutcome,
    headlinePick,               // suggested bet (separate from confidence)
    bestPick: headlinePick,     // back-compat: now points at the meaningful pick
    rawTopMarket: markets[0] || null,  // the old behaviour, kept for transparency/debug
    lowRiskMarkets: markets.filter(m => m.risk === 'LOW'),
    mediumRiskMarkets: markets.filter(m => m.risk === 'MEDIUM'),
    highRiskMarkets: markets.filter(m => m.risk === 'HIGH'),
    ensembleMethod,
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
      trivial: TRIVIAL_MARKETS.has(m.name) || m.probability > 90, // near-certain, not a real signal
    }))
    .sort((a, b) => b.probability - a.probability);
}

export default {
  computeExpectedGoals,
  generateProbabilities,
  analyzeMatch,
  computeConfidence,
  selectHeadlinePick,
};
