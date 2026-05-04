// ─── ENSEMBLE PREDICTION SYSTEM ─────────────────────────────────────
// Combines multiple prediction sources into a single calibrated output.
// SELF-IMPROVING: Weights are dynamically loaded from the model versioning
// system and updated weekly by the weight optimizer.
//
// Architecture:
//   Layer 1: Dixon-Coles Poisson baseline → scoreline matrix → outcome probs
//   Layer 2: Form-weighted prediction (last 5 matches, exponential recency)
//   Layer 3: League-specific goal variance correction
//   Layer 4: Market consensus (when odds available)
//   Final:   Weighted blend → Bias correction → Calibration → output
//
// Weight formula: final = w1*poisson + w2*form + w3*leagueCorr + w4*market
// Weights are optimized via coordinate descent (see weightOptimizer.js)

import { computePreMatchFeatures } from './preMatchFeatures.js';
import { computeResidualCorrection, computeFeatures } from './featureEngine.js';
import { calibrateOutcomes } from './calibrationLayer.js';
import { getActiveVersion } from './modelVersioning.js';

/**
 * Fallback ensemble weights — used only when no active model version exists.
 * In production, weights are loaded from model_versions table and
 * updated weekly by the weight optimizer.
 */
const FALLBACK_WEIGHTS = {
  poisson:          0.50,  // Statistical baseline (always available)
  form:             0.20,  // Form-weighted recent performance
  leagueCorrection: 0.10,  // League-specific adjustments
  market:           0.20,  // Market consensus (when available)
};

// ─── Dynamic weight cache ───────────────────────────────────────────
let _cachedWeights = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load active weights from the model versioning system.
 * Cached for 5 minutes to avoid DB hits on every prediction.
 */
async function loadActiveWeights() {
  const now = Date.now();
  if (_cachedWeights && (now - _cacheTimestamp) < CACHE_TTL) {
    return _cachedWeights;
  }

  try {
    const version = await getActiveVersion();
    _cachedWeights = version.weights || FALLBACK_WEIGHTS;
    _cacheTimestamp = now;
    return _cachedWeights;
  } catch {
    return FALLBACK_WEIGHTS;
  }
}

/**
 * Invalidate the cached weights (call after weight optimization).
 */
export function invalidateWeightCache() {
  _cachedWeights = null;
  _cacheTimestamp = 0;
}

/**
 * Combine prediction sources into a single probability output.
 *
 * @param {Object} poissonProbs  - { home, draw, away } from Poisson (percentages)
 * @param {Object} mlProbs       - { home, draw, away } from ML model (percentages, optional)
 * @param {Object} marketProbs   - { home, draw, away } implied from odds (percentages, optional)
 * @param {Object} options       - { weights, applyCalibration }
 * @returns {Object} Final calibrated probabilities
 */
export async function ensemblePredict(poissonProbs, mlProbs = null, marketProbs = null, options = {}) {
  // Load weights dynamically from model versioning system
  const activeWeights = await loadActiveWeights();
  const weights = { ...activeWeights, ...(options.weights || {}) };

  // Build source list — now includes form and league correction sources
  const sources = [];
  if (poissonProbs) {
    sources.push({ probs: poissonProbs, weight: weights.poisson || 0.50, name: 'poisson' });
  }
  if (mlProbs) {
    // ML/form correction uses the 'form' weight
    sources.push({ probs: mlProbs, weight: weights.form || 0.20, name: 'form' });
  }
  if (options.leagueCorrProbs) {
    sources.push({ probs: options.leagueCorrProbs, weight: weights.leagueCorrection || 0.10, name: 'leagueCorrection' });
  }
  if (marketProbs) {
    sources.push({ probs: marketProbs, weight: weights.market || 0.20, name: 'market' });
  }

  if (sources.length === 0) {
    return { home: 33.3, draw: 33.3, away: 33.3, method: 'uniform_fallback' };
  }

  // Normalize weights to sum to 1.0
  const totalWeight = sources.reduce((s, src) => s + src.weight, 0);

  let home = 0, draw = 0, away = 0;
  const contributions = {};

  for (const src of sources) {
    const w = src.weight / totalWeight;
    home += (src.probs.home || 33.3) * w;
    draw += (src.probs.draw || 33.3) * w;
    away += (src.probs.away || 33.3) * w;
    contributions[src.name] = parseFloat((w * 100).toFixed(1));
  }

  // Normalize to exactly 100%
  const total = home + draw + away;
  home = (home / total) * 100;
  draw = (draw / total) * 100;
  away = (away / total) * 100;

  // Apply bias corrections from feedback loop
  if (options.biasCorrections) {
    const corrected = applyBiasCorrections({ home, draw, away }, options.biasCorrections, options.context);
    home = corrected.home;
    draw = corrected.draw;
    away = corrected.away;
  }

  // Apply calibration (final pipeline stage)
  let final = { home, draw, away };
  if (options.applyCalibration !== false) {
    final = calibrateOutcomes(final);
  }

  return {
    home: parseFloat(final.home.toFixed(1)),
    draw: parseFloat(final.draw.toFixed(1)),
    away: parseFloat(final.away.toFixed(1)),
    method: sources.map(s => s.name).join('+'),
    contributions,
    weightsUsed: weights,
  };
}

/**
 * Apply the ML residual correction to Poisson probabilities.
 * Currently uses the rule-based approximation from featureEngine.js.
 * In production, this will be replaced by XGBoost model inference.
 *
 * @param {Object} poissonProbs - Poisson baseline { home, draw, away } (percentages)
 * @param {Object} homeStats    - Team stats
 * @param {Object} awayStats    - Team stats
 * @param {Object} context      - Match context
 * @returns {Object} ML-adjusted probabilities (percentages)
 */
export function applyMLCorrection(poissonProbs, homeStats, awayStats, context = {}) {
  // Compute pre-match features
  const features = computePreMatchFeatures(homeStats, awayStats, context);

  // Build a pseudo match-context for the residual correction engine
  // (bridge between pre-match features and the in-play feature engine)
  const pseudoCtx = {
    minute: 0,
    timeRemaining: 95,
    timeFraction: 0,
    period: 'PRE_MATCH',
    goalDiff: 0,
    totalGoals: 0,
    scoreHome: 0,
    scoreAway: 0,
    manAdvantageHome: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    xGHome: 0,
    xGAway: 0,
    xGDiff: 0,
    eventCount: 0,
    preMatchLambdaHome: context.lambdaHome || 1.35,
    preMatchLambdaAway: context.lambdaAway || 1.15,
  };

  const inPlayFeatures = computeFeatures(pseudoCtx, []);

  // Merge pre-match features with form-based adjustments
  const mergedFeatures = {
    ...inPlayFeatures,
    momentumSwing: (features.form_diff || 0) * 0.3, // Form acts as pre-match "momentum"
  };

  const residuals = computeResidualCorrection(mergedFeatures);

  // Apply residuals to Poisson baseline
  let home = poissonProbs.home * (1 + residuals.homeDelta);
  let draw = poissonProbs.draw * (1 + residuals.drawDelta);
  let away = poissonProbs.away * (1 + residuals.awayDelta);

  // Normalize
  const total = home + draw + away;
  return {
    home: parseFloat(((home / total) * 100).toFixed(1)),
    draw: parseFloat(((draw / total) * 100).toFixed(1)),
    away: parseFloat(((away / total) * 100).toFixed(1)),
  };
}

/**
 * Convert bookmaker odds to implied probabilities (removing vig).
 *
 * @param {Object} odds - { home: 2.5, draw: 3.2, away: 3.0 }
 * @returns {Object} { home, draw, away } as percentages summing to ~100
 */
export function oddsToImpliedProbs(odds) {
  if (!odds?.home || !odds?.draw || !odds?.away) return null;

  const rawHome = 1 / odds.home;
  const rawDraw = 1 / odds.draw;
  const rawAway = 1 / odds.away;
  const overround = rawHome + rawDraw + rawAway; // Typically 1.03-1.08

  // Remove vig by normalizing
  return {
    home: parseFloat(((rawHome / overround) * 100).toFixed(1)),
    draw: parseFloat(((rawDraw / overround) * 100).toFixed(1)),
    away: parseFloat(((rawAway / overround) * 100).toFixed(1)),
  };
}

/**
 * Compute form-based probabilities from recent match results.
 * Uses exponential recency weighting on the last 5 matches.
 *
 * @param {Object} homeStats - { form: 'WDWWL', avgGoalsFor, avgGoalsAgainst, played }
 * @param {Object} awayStats
 * @returns {Object} { home, draw, away } as percentages
 */
export function computeFormProbabilities(homeStats, awayStats) {
  const homeFormScore = parseFormScore(homeStats?.form);
  const awayFormScore = parseFormScore(awayStats?.form);

  // Base rates from recent form
  const homeStrength = 0.35 + (homeFormScore - 0.5) * 0.30;  // Range: ~0.20-0.50
  const awayStrength = 0.30 + (awayFormScore - 0.5) * 0.30;
  const drawBase = 1 - homeStrength - awayStrength;

  // Normalize
  const total = homeStrength + drawBase + awayStrength;
  return {
    home: parseFloat(((homeStrength / total) * 100).toFixed(1)),
    draw: parseFloat(((drawBase / total) * 100).toFixed(1)),
    away: parseFloat(((awayStrength / total) * 100).toFixed(1)),
  };
}

/**
 * Parse form string into a score [0, 1].
 * W=1, D=0.4, L=0, with exponential recency weighting.
 */
function parseFormScore(form) {
  if (!form || form === 'N/A' || typeof form !== 'string') return 0.5;
  const chars = form.toUpperCase().split('').filter(c => 'WDL'.includes(c)).slice(-5);
  if (chars.length === 0) return 0.5;

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < chars.length; i++) {
    const recency = Math.pow(0.65, chars.length - 1 - i);
    const value = chars[i] === 'W' ? 1.0 : chars[i] === 'D' ? 0.4 : 0.0;
    weightedSum += value * recency;
    totalWeight += recency;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

/**
 * Apply bias corrections from the feedback loop.
 * Corrections are multiplicative factors that adjust probabilities
 * based on historically detected biases.
 */
function applyBiasCorrections(probs, corrections, context = {}) {
  let { home, draw, away } = probs;

  // Apply outcome-level corrections
  const homeCorrKey = 'outcome:HOME';
  const drawCorrKey = 'outcome:DRAW';
  const awayCorrKey = 'outcome:AWAY';

  if (corrections[homeCorrKey]) home *= corrections[homeCorrKey].factor;
  if (corrections[drawCorrKey]) draw *= corrections[drawCorrKey].factor;
  if (corrections[awayCorrKey]) away *= corrections[awayCorrKey].factor;

  // Apply league-level correction if available
  if (context?.leagueCode) {
    const leagueKey = `league:${context.leagueCode}`;
    if (corrections[leagueKey]) {
      // League correction is applied proportionally
      const factor = corrections[leagueKey].factor;
      home *= factor;
      draw *= (2 - factor); // Inverse effect on draw
      away *= factor;
    }
  }

  // Re-normalize
  const total = home + draw + away;
  return {
    home: (home / total) * 100,
    draw: (draw / total) * 100,
    away: (away / total) * 100,
  };
}

export default {
  ensemblePredict,
  applyMLCorrection,
  oddsToImpliedProbs,
  computeFormProbabilities,
  invalidateWeightCache,
};
