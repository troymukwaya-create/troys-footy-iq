// ─── HYBRID INFERENCE ENGINE ────────────────────────────────────────
// Orchestrates the multi-layer prediction system:
//   Layer 1: Dixon-Coles Bivariate Poisson (statistical baseline)
//   Layer 2: Feature-based residual correction (ML approximation)
//   Layer 3: Calibration & normalization
//
// This is the single entry point for all prediction requests.

import {
  computeExpectedGoals,
  inPlayLambda,
  generateProbabilities,
} from './poissonCore.js';

import {
  createMatchState,
  applyEvent,
  deriveMatchContext,
} from './matchState.js';

import {
  computeFeatures,
  computeResidualCorrection,
} from './featureEngine.js';

// ─── Active match states (in-memory store) ─────────────────────────
const liveMatches = new Map();

/**
 * PRE-MATCH PREDICTION
 * Full 90-minute prediction using team statistics.
 *
 * @param {Object} homeStats - normalized team stats
 * @param {Object} awayStats - normalized team stats
 * @param {Object} options - { leagueAvg, rho }
 * @returns {Object} complete probability output
 */
export function predictPreMatch(homeStats, awayStats, options = {}) {
  const leagueAvg = options.leagueAvg || 1.35;
  const rho = options.rho || -0.08;

  const { lambdaHome, lambdaAway, params } = computeExpectedGoals(
    homeStats, awayStats, leagueAvg
  );

  const result = generateProbabilities(lambdaHome, lambdaAway, rho);

  return {
    ...result,
    type: 'pre_match',
    strengthParams: params,
    timestamp: Date.now(),
  };
}

/**
 * IN-PLAY PREDICTION
 * Updates probabilities based on current match state.
 *
 * Pipeline:
 *   1. Derive context from match state
 *   2. Compute in-play lambdas (time-adjusted expected goals)
 *   3. Generate baseline probabilities from Poisson
 *   4. Compute feature vector
 *   5. Apply ML residual correction
 *   6. Normalize final probabilities
 *
 * @param {string} matchId
 * @returns {Object} complete in-play probability output
 */
export function predictInPlay(matchId) {
  const state = liveMatches.get(matchId);
  if (!state) return null;

  const ctx = deriveMatchContext(state);
  if (!ctx.isLive) {
    // Return final state probabilities for finished matches
    if (ctx.isFinished) return buildFinalResult(ctx);
    return null;
  }

  const startTime = Date.now();

  // ─── Layer 1: Statistical Baseline ──────────────────────────
  // Adjust pre-match lambdas for time remaining and game state
  const goalDiffHome = ctx.scoreHome - ctx.scoreAway;
  const lambdaHomeRemaining = inPlayLambda(
    ctx.preMatchLambdaHome,
    ctx.minute,
    goalDiffHome,
    ctx.manAdvantageHome
  );
  const lambdaAwayRemaining = inPlayLambda(
    ctx.preMatchLambdaAway,
    ctx.minute,
    -goalDiffHome,
    -ctx.manAdvantageHome
  );

  // Generate scoreline matrix for REMAINING goals only
  const baseline = generateProbabilities(lambdaHomeRemaining, lambdaAwayRemaining);

  // Remap: baseline predicts additional goals, but we need match outcome probs
  // given the CURRENT score. This requires adjusting.
  const matchProbs = computeMatchOutcomeFromRemaining(
    baseline, ctx.scoreHome, ctx.scoreAway
  );

  // ─── Layer 2: Residual Correction ───────────────────────────
  const features = computeFeatures(ctx, state.events);
  const residuals = computeResidualCorrection(features);

  // Apply residuals to baseline
  let adjHome = matchProbs.home * (1 + residuals.homeDelta);
  let adjDraw = matchProbs.draw * (1 + residuals.drawDelta);
  let adjAway = matchProbs.away * (1 + residuals.awayDelta);

  // ─── Layer 3: Normalization ─────────────────────────────────
  const total = adjHome + adjDraw + adjAway;
  adjHome = (adjHome / total) * 100;
  adjDraw = (adjDraw / total) * 100;
  adjAway = (adjAway / total) * 100;

  const inferenceLatency = Date.now() - startTime;

  // Risk classification
  const maxProb = Math.max(adjHome, adjDraw, adjAway);
  const riskLevel = maxProb > 62 ? 'LOW' : maxProb >= 42 ? 'MEDIUM' : 'HIGH';

  return {
    matchId,
    type: 'in_play',
    minute: ctx.minute,
    period: ctx.period,
    score: { home: ctx.scoreHome, away: ctx.scoreAway },
    probabilities: {
      home: round(adjHome, 1),
      draw: round(adjDraw, 1),
      away: round(adjAway, 1),
    },
    expectedGoals: {
      home: round(ctx.preMatchLambdaHome, 2),
      away: round(ctx.preMatchLambdaAway, 2),
      remainingHome: round(lambdaHomeRemaining, 2),
      remainingAway: round(lambdaAwayRemaining, 2),
    },
    xG: { home: ctx.xGHome, away: ctx.xGAway },
    riskLevel,
    topScorelines: baseline.topScorelines,
    features: {
      momentumSwing: features.momentumSwing,
      homePressure: round(features.homePressure, 2),
      awayPressure: round(features.awayPressure, 2),
      fatigueIndex: round(features.fatigueIndex, 2),
      redCardImpact: round(features.redCardImpact, 2),
    },
    residuals,
    confidence: baseline.confidence,
    model: 'hybrid-dixon-coles-v2',
    inferenceLatencyMs: inferenceLatency,
    timestamp: Date.now(),
  };
}

/**
 * Compute final match outcome probabilities from the remaining-goals matrix.
 *
 * Given current score (H, A), the match outcome depends on additional goals:
 *   Home wins if: scoreHome + addGoalsHome > scoreAway + addGoalsAway
 *   Draw if:      scoreHome + addGoalsHome == scoreAway + addGoalsAway
 *   Away wins if: scoreHome + addGoalsHome < scoreAway + addGoalsAway
 */
function computeMatchOutcomeFromRemaining(baseline, scoreHome, scoreAway) {
  // The baseline.matrix contains P(addH, addA) for the remaining time
  let homeWin = 0, draw = 0, awayWin = 0;

  for (const entry of baseline.matrix) {
    const prob = entry.probability / 100; // Convert from percentage
    const finalHome = scoreHome + entry.home;
    const finalAway = scoreAway + entry.away;

    if (finalHome > finalAway) homeWin += prob;
    else if (finalHome === finalAway) draw += prob;
    else awayWin += prob;
  }

  // Normalize
  const total = homeWin + draw + awayWin;
  return {
    home: total > 0 ? homeWin / total : 0.33,
    draw: total > 0 ? draw / total : 0.33,
    away: total > 0 ? awayWin / total : 0.33,
  };
}

/**
 * Build result for a finished match.
 */
function buildFinalResult(ctx) {
  const goalDiff = ctx.scoreHome - ctx.scoreAway;
  return {
    matchId: ctx.matchId,
    type: 'final',
    period: 'FINISHED',
    score: { home: ctx.scoreHome, away: ctx.scoreAway },
    probabilities: {
      home: goalDiff > 0 ? 100 : 0,
      draw: goalDiff === 0 ? 100 : 0,
      away: goalDiff < 0 ? 100 : 0,
    },
    result: goalDiff > 0 ? 'HOME_WIN' : goalDiff === 0 ? 'DRAW' : 'AWAY_WIN',
    timestamp: Date.now(),
  };
}

// ─── Match Lifecycle Management ─────────────────────────────────────

/**
 * Register a match for in-play tracking.
 */
export function registerMatch(matchId, preMatchContext) {
  const state = createMatchState(matchId, preMatchContext);
  liveMatches.set(matchId, state);
  return state;
}

/**
 * Process a live event for a match.
 */
export function processEvent(matchId, event) {
  const state = liveMatches.get(matchId);
  if (!state) return null;

  const newState = applyEvent(state, event);
  liveMatches.set(matchId, newState);

  // Automatically generate new prediction
  return predictInPlay(matchId);
}

/**
 * Get current state of a live match.
 */
export function getMatchState(matchId) {
  return liveMatches.get(matchId) || null;
}

/**
 * Remove a finished match from tracking.
 */
export function unregisterMatch(matchId) {
  liveMatches.delete(matchId);
}

/**
 * Get all active match IDs.
 */
export function getActiveMatches() {
  return Array.from(liveMatches.keys());
}

/**
 * STATIC PREDICTION (no state management)
 * For fixtures where we just want pre-match probabilities
 * without registering them for in-play tracking.
 */
export function predictStatic(homeStats, awayStats, matchContext = {}) {
  const result = predictPreMatch(homeStats, awayStats);

  // Build enhanced market list
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
 * Build sorted market list with risk classification.
 */
function buildMarketList(result) {
  const { probabilities, overUnder, btts } = result;

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
    { name: 'Double Chance 1X', probability: round(probabilities.home + probabilities.draw, 1), category: 'Double Chance' },
    { name: 'Double Chance X2', probability: round(probabilities.draw + probabilities.away, 1), category: 'Double Chance' },
    { name: 'Double Chance 12', probability: round(probabilities.home + probabilities.away, 1), category: 'Double Chance' },
  ];

  return all
    .map(m => ({
      ...m,
      risk: m.probability >= 65 ? 'LOW' : m.probability >= 45 ? 'MEDIUM' : 'HIGH',
      riskColor: m.probability >= 65 ? '#22C55E' : m.probability >= 45 ? '#F59E0B' : '#EF4444',
    }))
    .sort((a, b) => b.probability - a.probability);
}

function round(v, d) { return parseFloat(v.toFixed(d)); }

export default {
  predictPreMatch,
  predictInPlay,
  predictStatic,
  registerMatch,
  processEvent,
  getMatchState,
  unregisterMatch,
  getActiveMatches,
};
