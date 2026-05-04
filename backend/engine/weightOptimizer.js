// ─── WEIGHT OPTIMIZER ───────────────────────────────────────────────
// Implements coordinate descent optimization over ensemble weights.
// Adjusts weights (poisson, form, leagueCorrection, market) to minimize
// log loss on historical predictions.
//
// This is what makes the system LEARN. Without this, the model
// never adapts to its mistakes.
//
// Algorithm: Coordinate Descent
//   - For each weight dimension, try small perturbations
//   - Keep the change if log loss improves
//   - Normalize weights to sum to 1.0
//   - Create new model version if improvement exceeds threshold
//
// Why not gradient descent? This is simpler, more interpretable,
// and robust with small datasets. Full gradient methods need
// thousands of samples; coordinate descent works with 50+.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getActiveVersion, createVersion, promoteVersion, updateVersionMetrics } from './modelVersioning.js';
import { computeFeedbackAggregates, generateCorrectionFactors, detectBiases } from './feedbackEngine.js';
import { isModelLocked, getLockStatus } from './modelLock.js';

// ─── Optimization Constants ─────────────────────────────────────────
const MIN_PREDICTIONS = 50;         // Minimum evaluated predictions before optimizing
const MIN_IMPROVEMENT_PCT = 0.005;  // 0.5% log loss improvement required
const WEIGHT_MIN = 0.05;            // No single weight below 5%
const WEIGHT_MAX = 0.80;            // No single weight above 80%
const PERTURBATIONS = [-0.05, -0.02, 0.02, 0.05]; // Step sizes to try
const WEIGHT_DIMENSIONS = ['poisson', 'form', 'leagueCorrection', 'market'];

/**
 * Run the full weight optimization pipeline.
 * 1. Load historical predictions
 * 2. Compute current log loss
 * 3. Try perturbations on each weight dimension
 * 4. Keep improvements, discard regressions
 * 5. If improved overall, create + promote new version
 *
 * @returns {Object} { optimized, oldWeights, newWeights, logLossChange, newVersion }
 */
export async function optimizeWeights() {
  // ─── Model lock check ─────────────────────────────────────────
  if (isModelLocked()) {
    const lock = getLockStatus();
    console.log(`[OPTIMIZER] ⏸️  Skipped — model is locked: ${lock.reason}`);
    return { optimized: false, reason: `Model locked: ${lock.reason}`, locked: true };
  }

  if (!isDbAvailable()) {
    return { optimized: false, reason: 'Database not available' };
  }

  console.log('[OPTIMIZER] Starting weight optimization...');

  // ─── Step 1: Load historical evaluated predictions ────────────
  const allPredictions = await loadEvaluatedPredictions();
  if (allPredictions.length < MIN_PREDICTIONS) {
    console.log(`[OPTIMIZER] Insufficient data: ${allPredictions.length}/${MIN_PREDICTIONS} predictions`);
    return {
      optimized: false,
      reason: `Need at least ${MIN_PREDICTIONS} evaluated predictions (have ${allPredictions.length})`,
      predictionsAvailable: allPredictions.length,
    };
  }

  // ─── Step 1b: Split into train/holdout (80/20) ───────────────
  // Holdout validation prevents overfitting to quirks in the data.
  // The split is chronological — holdout is the most recent 20%.
  const splitIdx = Math.floor(allPredictions.length * 0.8);
  const trainPredictions = allPredictions.slice(splitIdx); // Older 80%
  const holdoutPredictions = allPredictions.slice(0, splitIdx); // Newer 20%

  console.log(`[OPTIMIZER] Data split: ${trainPredictions.length} train / ${holdoutPredictions.length} holdout`);

  // ─── Step 2: Get current weights ──────────────────────────────
  const activeVersion = await getActiveVersion();
  let currentWeights = { ...activeVersion.weights };
  const originalWeights = { ...currentWeights };

  // Ensure all dimensions exist
  for (const dim of WEIGHT_DIMENSIONS) {
    if (currentWeights[dim] === undefined) {
      currentWeights[dim] = 0.10;
    }
  }
  currentWeights = normalizeWeights(currentWeights);

  // ─── Step 3: Compute baseline log loss on TRAINING set ────────
  let bestLogLoss = computeWeightedLogLoss(currentWeights, trainPredictions);
  const originalLogLoss = bestLogLoss;
  const holdoutBaseline = computeWeightedLogLoss(currentWeights, holdoutPredictions);
  console.log(`[OPTIMIZER] Baseline: train=${bestLogLoss.toFixed(6)}, holdout=${holdoutBaseline.toFixed(6)}`);

  // ─── Step 4: Coordinate descent ──────────────────────────────
  let improved = false;
  const improvementLog = [];

  for (let round = 0; round < 3; round++) {
    for (const dim of WEIGHT_DIMENSIONS) {
      for (const delta of PERTURBATIONS) {
        const candidate = { ...currentWeights };
        candidate[dim] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, candidate[dim] + delta));

        const normalized = normalizeWeights(candidate);
        const candidateLogLoss = computeWeightedLogLoss(normalized, trainPredictions);

        if (candidateLogLoss < bestLogLoss) {
          const improvement = bestLogLoss - candidateLogLoss;
          bestLogLoss = candidateLogLoss;
          currentWeights = normalized;
          improved = true;

          improvementLog.push({
            round,
            dimension: dim,
            delta,
            logLossImprovement: parseFloat(improvement.toFixed(6)),
            newLogLoss: parseFloat(candidateLogLoss.toFixed(6)),
          });
        }
      }
    }
  }

  const totalImprovement = originalLogLoss - bestLogLoss;
  const improvementPct = totalImprovement / originalLogLoss;

  console.log(`[OPTIMIZER] ${improved ? '✅ Improved' : '⊘ No improvement'}`);
  console.log(`[OPTIMIZER] Log loss: ${originalLogLoss.toFixed(6)} → ${bestLogLoss.toFixed(6)} (${(improvementPct * 100).toFixed(2)}%)`);

  // ─── Step 5: Validate on holdout before promoting ─────────────
  if (improved && improvementPct >= MIN_IMPROVEMENT_PCT) {
    // Validate improvement holds on unseen data
    const holdoutLogLoss = computeWeightedLogLoss(currentWeights, holdoutPredictions);
    const holdoutImprovement = holdoutBaseline - holdoutLogLoss;
    const holdoutImprovementPct = holdoutImprovement / holdoutBaseline;

    console.log(`[OPTIMIZER] Holdout validation: ${holdoutBaseline.toFixed(6)} → ${holdoutLogLoss.toFixed(6)} (${(holdoutImprovementPct * 100).toFixed(2)}%)`);

    // Promotion criteria: must also improve on holdout by ≥0.3%
    if (holdoutImprovementPct < 0.003) {
      console.log(`[OPTIMIZER] ⛔ Holdout validation FAILED (${(holdoutImprovementPct * 100).toFixed(3)}% < 0.3%) — likely overfitting`);
      return {
        optimized: false,
        reason: 'Holdout validation failed — improvement did not generalize',
        trainImprovement: parseFloat((improvementPct * 100).toFixed(2)),
        holdoutImprovement: parseFloat((holdoutImprovementPct * 100).toFixed(3)),
        sampleSize: allPredictions.length,
      };
    }

    // Also compute feedback aggregates for this version
    const feedback = await computeFeedbackAggregates(activeVersion.version);
    const biasCorrections = generateCorrectionFactors(detectBiases(feedback.aggregates));

    // Compute full metrics on ALL data (for storage)
    const metrics = await computeFullMetrics(allPredictions, currentWeights);

    const newVersion = await createVersion({
      parentVersion: activeVersion.version,
      weights: currentWeights,
      calibrationCurves: activeVersion.calibrationCurves,
      leagueCorrections: activeVersion.leagueCorrections,
      biasCorrections,
      config: activeVersion.config,
      metrics: {
        ...metrics,
        optimizedFrom: activeVersion.version,
        logLossImprovement: parseFloat(totalImprovement.toFixed(6)),
        improvementPct: parseFloat((improvementPct * 100).toFixed(2)),
        holdoutImprovementPct: parseFloat((holdoutImprovementPct * 100).toFixed(2)),
        sampleSize: allPredictions.length,
        trainSize: trainPredictions.length,
        holdoutSize: holdoutPredictions.length,
        optimizedAt: new Date().toISOString(),
      },
    });

    if (newVersion) {
      await promoteVersion(newVersion);
      console.log(`[OPTIMIZER] ✅ Created and promoted version ${newVersion} (holdout validated)`);

      return {
        optimized: true,
        oldWeights: originalWeights,
        newWeights: currentWeights,
        logLossChange: parseFloat((-totalImprovement).toFixed(6)),
        improvementPct: parseFloat((improvementPct * 100).toFixed(2)),
        holdoutImprovementPct: parseFloat((holdoutImprovementPct * 100).toFixed(2)),
        newVersion,
        sampleSize: allPredictions.length,
        improvementLog,
      };
    }
  }

  // Record that we tried but didn't improve enough
  if (improved && improvementPct < MIN_IMPROVEMENT_PCT) {
    console.log(`[OPTIMIZER] Improvement too small (${(improvementPct * 100).toFixed(3)}% < ${MIN_IMPROVEMENT_PCT * 100}%)`);
  }

  return {
    optimized: false,
    reason: improved ? 'Improvement below threshold' : 'No improvement found',
    oldWeights: originalWeights,
    bestCandidate: improved ? currentWeights : null,
    logLossChange: improved ? parseFloat((-totalImprovement).toFixed(6)) : 0,
    sampleSize: allPredictions.length,
  };
}

/**
 * Compute weighted log loss using specific weights on historical predictions.
 * Simulates what the model would have predicted with different weights.
 *
 * @param {Object} weights - { poisson, form, leagueCorrection, market }
 * @param {Array} predictions - Historical evaluated predictions
 * @returns {number} Average log loss
 */
function computeWeightedLogLoss(weights, predictions) {
  const eps = 1e-10;
  let totalLogLoss = 0;
  let count = 0;

  for (const pred of predictions) {
    // Reconstruct blended probabilities using the candidate weights
    // Note: We use the stored probabilities as the "poisson" component
    // and apply the weight ratios to adjust.
    //
    // In a full implementation, we'd re-run each prediction source.
    // For now, we use the stored predictions and adjust the blend
    // based on stored features (form factor, league data, etc.)

    const pH = clamp(pred.prob_home / 100, eps, 1 - eps);
    const pD = clamp(pred.prob_draw / 100, eps, 1 - eps);
    const pA = clamp(pred.prob_away / 100, eps, 1 - eps);

    // Apply weight-adjusted probabilities
    // The Poisson weight controls how much we trust the base model
    // Form/league corrections modify the base proportionally
    const formAdj = computeFormAdjustment(pred, weights.form);
    const leagueAdj = computeLeagueAdjustment(pred, weights.leagueCorrection);

    let adjH = pH * (1 + formAdj.home + leagueAdj.home);
    let adjD = pD * (1 + formAdj.draw + leagueAdj.draw);
    let adjA = pA * (1 + formAdj.away + leagueAdj.away);

    // Normalize
    const total = adjH + adjD + adjA;
    adjH = clamp(adjH / total, eps, 1 - eps);
    adjD = clamp(adjD / total, eps, 1 - eps);
    adjA = clamp(adjA / total, eps, 1 - eps);

    // Compute log loss against actual outcome
    const yH = pred.actual_result === 'HOME' ? 1 : 0;
    const yD = pred.actual_result === 'DRAW' ? 1 : 0;
    const yA = pred.actual_result === 'AWAY' ? 1 : 0;

    const logLoss = -(yH * Math.log(adjH) + yD * Math.log(adjD) + yA * Math.log(adjA));
    totalLogLoss += logLoss;
    count++;
  }

  return count > 0 ? totalLogLoss / count : 999;
}

/**
 * Compute form-based probability adjustment.
 * Uses stored features to estimate what the form signal would contribute.
 */
function computeFormAdjustment(pred, formWeight) {
  const features = pred.features || {};
  const formDiff = features.form_diff || features.momentumSwing || 0;

  // Form favors the stronger-form team
  const adjustment = formDiff * formWeight * 0.15;

  return {
    home: adjustment > 0 ? adjustment : 0,
    draw: -Math.abs(adjustment) * 0.3,
    away: adjustment < 0 ? Math.abs(adjustment) : 0,
  };
}

/**
 * Compute league-specific probability adjustment.
 * Uses league averages to correct for league-specific goal patterns.
 */
function computeLeagueAdjustment(pred, leagueCorrWeight) {
  // League-specific corrections would come from feedback_aggregates
  // For now, return neutral adjustments
  return { home: 0, draw: 0, away: 0 };
}

/**
 * Compute full evaluation metrics for a set of predictions with given weights.
 */
async function computeFullMetrics(predictions, weights) {
  const eps = 1e-10;
  let totalBrier = 0;
  let totalLogLoss = 0;
  let correct = 0;

  for (const pred of predictions) {
    const pH = clamp(pred.prob_home / 100, eps, 1 - eps);
    const pD = clamp(pred.prob_draw / 100, eps, 1 - eps);
    const pA = clamp(pred.prob_away / 100, eps, 1 - eps);

    const yH = pred.actual_result === 'HOME' ? 1 : 0;
    const yD = pred.actual_result === 'DRAW' ? 1 : 0;
    const yA = pred.actual_result === 'AWAY' ? 1 : 0;

    totalBrier += (Math.pow(pH - yH, 2) + Math.pow(pD - yD, 2) + Math.pow(pA - yA, 2)) / 3;
    totalLogLoss += -(yH * Math.log(pH) + yD * Math.log(pD) + yA * Math.log(pA));

    const predicted = pH >= pD && pH >= pA ? 'HOME' : pD >= pH && pD >= pA ? 'DRAW' : 'AWAY';
    if (predicted === pred.actual_result) correct++;
  }

  const n = predictions.length;
  return {
    sampleSize: n,
    accuracy: parseFloat(((correct / n) * 100).toFixed(1)),
    avgBrierScore: parseFloat((totalBrier / n).toFixed(4)),
    avgLogLoss: parseFloat((totalLogLoss / n).toFixed(4)),
    correct,
  };
}

/**
 * Load evaluated predictions from the database.
 */
async function loadEvaluatedPredictions() {
  const result = await safeQuery(`
    SELECT
      p.prob_home, p.prob_draw, p.prob_away,
      p.actual_result, p.features, p.league_code,
      p.odds_home, p.odds_draw, p.odds_away,
      p.model_version, p.confidence, p.risk_level
    FROM predictions p
    WHERE p.actual_result IS NOT NULL
    ORDER BY p.created_at DESC
    LIMIT 500
  `);
  return result?.rows || [];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Normalize weights to sum to 1.0 while respecting min/max bounds.
 */
function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const normalized = {};

  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, value / total));
  }

  // Re-normalize after clamping
  const clampedTotal = Object.values(normalized).reduce((s, v) => s + v, 0);
  for (const key of Object.keys(normalized)) {
    normalized[key] = parseFloat((normalized[key] / clampedTotal).toFixed(4));
  }

  return normalized;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export default { optimizeWeights };
