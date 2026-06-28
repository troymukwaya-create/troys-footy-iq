// ─── PREDICTION LOGGER ──────────────────────────────────────────────
// Stores every pre-match prediction in the database BEFORE kickoff.
// After match completes, fills in actual_result for evaluation.
// This is the feedback loop that enables continuous learning.

import { query } from '../db/index.js';
import { computePreMatchFeatures } from '../engine/preMatchFeatures.js';

const MODEL_VERSION = 'hybrid-dc-v2';

/**
 * Log a pre-match prediction to the database.
 * Called automatically when analysis is generated for an upcoming fixture.
 *
 * @param {number} fixtureId - DB fixture ID
 * @param {Object} prediction - Output from inferenceEngine.predictPreMatch()
 * @param {Object} features - Output from computePreMatchFeatures()
 */
export async function logPrediction(fixtureId, prediction, features = null) {
  if (!fixtureId || !prediction?.probabilities) return null;

  try {
    const result = await query(
      `INSERT INTO predictions (fixture_id, model_version, prob_home, prob_draw, prob_away, lambda_home, lambda_away, risk_level, confidence, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        fixtureId,
        MODEL_VERSION,
        prediction.probabilities.home,
        prediction.probabilities.draw,
        prediction.probabilities.away,
        prediction.expectedGoals?.home || null,
        prediction.expectedGoals?.away || null,
        prediction.riskLevel || null,
        prediction.confidence || null,
        features ? JSON.stringify(features) : null,
      ]
    );
    return result.rows[0]?.id || null;
  } catch (err) {
    console.error('[PREDICTION_LOG] Failed to store:', err.message);
    return null;
  }
}

/**
 * Fill in actual results for completed matches.
 * Called by the weekly evaluation pipeline.
 */
export async function evaluateStoredPredictions() {
  try {
    // Find predictions without actual results, where the fixture is finished
    const result = await query(`
      UPDATE predictions p
      SET actual_result = CASE
        WHEN COALESCE(f.ft_home_goals, f.home_goals) > COALESCE(f.ft_away_goals, f.away_goals) THEN 'HOME'
        WHEN COALESCE(f.ft_home_goals, f.home_goals) = COALESCE(f.ft_away_goals, f.away_goals) THEN 'DRAW'
        ELSE 'AWAY'
      END,
      evaluated_at = NOW()
      FROM fixtures f
      WHERE p.fixture_id = f.id
        AND p.actual_result IS NULL
        AND f.status = 'FINISHED'
        AND f.home_goals IS NOT NULL
        AND f.away_goals IS NOT NULL
        AND p.model_version NOT LIKE '%-shadow'
      RETURNING p.id, p.prob_home, p.prob_draw, p.prob_away, p.actual_result
    `);

    const evaluated = result.rows;
    if (evaluated.length === 0) return { evaluated: 0 };

    // Compute metrics
    let totalBrier = 0;
    let totalLogLoss = 0;
    let correct = 0;

    for (const pred of evaluated) {
      const pH = (pred.prob_home || 33.3) / 100;
      const pD = (pred.prob_draw || 33.3) / 100;
      const pA = (pred.prob_away || 33.3) / 100;

      const yH = pred.actual_result === 'HOME' ? 1 : 0;
      const yD = pred.actual_result === 'DRAW' ? 1 : 0;
      const yA = pred.actual_result === 'AWAY' ? 1 : 0;

      // Brier Score
      totalBrier += (Math.pow(pH - yH, 2) + Math.pow(pD - yD, 2) + Math.pow(pA - yA, 2)) / 3;

      // Log Loss
      const eps = 1e-10;
      totalLogLoss += -(yH * Math.log(Math.max(pH, eps)) + yD * Math.log(Math.max(pD, eps)) + yA * Math.log(Math.max(pA, eps)));

      // Accuracy
      const predicted = pH >= pD && pH >= pA ? 'HOME' : pD >= pH && pD >= pA ? 'DRAW' : 'AWAY';
      if (predicted === pred.actual_result) correct++;
    }

    const n = evaluated.length;
    const metrics = {
      evaluated: n,
      accuracy: parseFloat(((correct / n) * 100).toFixed(1)),
      avgBrierScore: parseFloat((totalBrier / n).toFixed(4)),
      avgLogLoss: parseFloat((totalLogLoss / n).toFixed(4)),
    };

    // Store model run
    await query(
      `INSERT INTO model_runs (model_version, run_type, matches_evaluated, accuracy, brier_score, log_loss, details)
       VALUES ($1, 'weekly_eval', $2, $3, $4, $5, $6)`,
      [MODEL_VERSION, n, metrics.accuracy, metrics.avgBrierScore, metrics.avgLogLoss, JSON.stringify(metrics)]
    );

    return metrics;
  } catch (err) {
    console.error('[PREDICTION_EVAL] Error:', err.message);
    return { evaluated: 0, error: err.message };
  }
}

/**
 * Get recent model performance trend.
 */
export async function getModelPerformance(limit = 10) {
  try {
    const result = await query(
      `SELECT model_version, run_type, matches_evaluated, accuracy, brier_score, log_loss, ece, created_at
       FROM model_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    return [];
  }
}

export default { logPrediction, evaluateStoredPredictions, getModelPerformance };
