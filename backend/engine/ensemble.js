// ─── ENSEMBLE PREDICTION SYSTEM ─────────────────────────────────────
// Combines multiple prediction sources into a single calibrated output.
//
// Architecture:
//   Layer 1: Dixon-Coles Poisson baseline → scoreline matrix → outcome probs
//   Layer 2: ML residual correction (XGBoost when available, rules fallback)
//   Layer 3: Market consensus (when odds available)
//   Final:   Weighted blend → Isotonic calibration → output
//
// Why ensemble?
//   - Poisson: stable, interpretable, low variance, misses context
//   - ML:      captures form/momentum, higher variance, needs data
//   - Market:  "wisdom of crowds", strongest single signal but not always available
//   - Blend reduces variance while capturing context → better OOS performance

import { computePreMatchFeatures } from './preMatchFeatures.js';
import { computeResidualCorrection, computeFeatures } from './featureEngine.js';
import { calibrateOutcomes } from './calibrationLayer.js';

/**
 * Default ensemble weights.
 * In production, these are optimized via grid search on the validation set
 * to minimize log loss. Updated during weekly retraining.
 */
const DEFAULT_WEIGHTS = {
  poisson: 0.50,  // Statistical baseline (always available)
  ml:      0.30,  // ML residual correction
  market:  0.20,  // Market consensus (when available, redistributed otherwise)
};

/**
 * Combine prediction sources into a single probability output.
 *
 * @param {Object} poissonProbs  - { home, draw, away } from Poisson (percentages)
 * @param {Object} mlProbs       - { home, draw, away } from ML model (percentages, optional)
 * @param {Object} marketProbs   - { home, draw, away } implied from odds (percentages, optional)
 * @param {Object} options       - { weights, applyCalibration }
 * @returns {Object} Final calibrated probabilities
 */
export function ensemblePredict(poissonProbs, mlProbs = null, marketProbs = null, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };

  // Redistribute weights if a source is missing
  const sources = [];
  if (poissonProbs) sources.push({ probs: poissonProbs, weight: weights.poisson, name: 'poisson' });
  if (mlProbs)      sources.push({ probs: mlProbs,      weight: weights.ml,      name: 'ml' });
  if (marketProbs)  sources.push({ probs: marketProbs,   weight: weights.market,  name: 'market' });

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

  // Apply calibration (Phase 3 of the pipeline)
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

export default {
  ensemblePredict,
  applyMLCorrection,
  oddsToImpliedProbs,
};
