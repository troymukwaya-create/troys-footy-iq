// ─── FEEDBACK ENGINE ────────────────────────────────────────────────
// Analyzes historical predictions to detect systematic biases.
// Aggregates prediction errors by league, market type, outcome,
// and odds range. Produces correction factors that flow back into
// the prediction pipeline.
//
// This is the CORE of the self-improving system.
// Without this, the model is a static calculator.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getActiveVersion } from './modelVersioning.js';

// ─── Odds range buckets for aggregation ─────────────────────────────
const ODDS_RANGES = [
  { label: '1.01-1.30', min: 1.01, max: 1.30 },
  { label: '1.31-1.60', min: 1.31, max: 1.60 },
  { label: '1.61-2.00', min: 1.61, max: 2.00 },
  { label: '2.01-2.50', min: 2.01, max: 2.50 },
  { label: '2.51-3.50', min: 2.51, max: 3.50 },
  { label: '3.51-5.00', min: 3.51, max: 5.00 },
  { label: '5.01+',     min: 5.01, max: 100 },
];

/**
 * Compute comprehensive feedback aggregates from historical predictions.
 * Analyzes prediction performance across multiple dimensions.
 *
 * @param {string} modelVersion - Version to analyze (or null for all)
 * @returns {Object} { aggregates, biases, corrections }
 */
export async function computeFeedbackAggregates(modelVersion = null) {
  if (!isDbAvailable()) return { aggregates: [], biases: [], corrections: {} };

  const version = modelVersion || (await getActiveVersion()).version;
  console.log(`[FEEDBACK] Computing aggregates for model ${version}...`);

  const aggregates = [];

  // ─── 1. By Outcome (HOME / DRAW / AWAY) ──────────────────────
  const outcomeAggs = await computeOutcomeAggregates(version);
  aggregates.push(...outcomeAggs);

  // ─── 2. By League ────────────────────────────────────────────
  const leagueAggs = await computeLeagueAggregates(version);
  aggregates.push(...leagueAggs);

  // ─── 3. By Market Type ───────────────────────────────────────
  const marketAggs = await computeMarketAggregates(version);
  aggregates.push(...marketAggs);

  // ─── 4. By Odds Range ────────────────────────────────────────
  const oddsAggs = await computeOddsRangeAggregates(version);
  aggregates.push(...oddsAggs);

  // ─── 5. Store aggregates ─────────────────────────────────────
  await storeAggregates(version, aggregates);

  // ─── 6. Detect biases ────────────────────────────────────────
  const biases = detectBiases(aggregates);

  // ─── 7. Generate corrections ─────────────────────────────────
  const corrections = generateCorrectionFactors(biases);

  console.log(`[FEEDBACK] Computed ${aggregates.length} aggregates, detected ${biases.length} biases`);

  return { aggregates, biases, corrections };
}

/**
 * Aggregate prediction performance by outcome (HOME/DRAW/AWAY).
 * Detects if we systematically over/underestimate specific outcomes.
 */
async function computeOutcomeAggregates(version) {
  const result = await safeQuery(`
    SELECT
      mp.actual_outcome,
      COUNT(*) as sample_size,
      AVG(CASE
        WHEN mp.actual_outcome = 'HOME' THEN mp.prob_home / 100.0
        WHEN mp.actual_outcome = 'DRAW' THEN mp.prob_draw / 100.0
        WHEN mp.actual_outcome = 'AWAY' THEN mp.prob_away / 100.0
      END) as avg_predicted_prob,
      1.0 as actual_hit_rate,
      AVG(mp.brier_score) as brier_score,
      AVG(mp.log_loss) as log_loss
    FROM model_performance mp
    JOIN predictions p ON mp.prediction_id = p.id
    WHERE mp.actual_outcome IS NOT NULL
      AND (p.model_version = $1 OR $1 = 'all')
    GROUP BY mp.actual_outcome
  `, [version]);

  // Also compute the "predicted but wrong" side
  const allPreds = await safeQuery(`
    SELECT
      'HOME' as outcome,
      AVG(mp.prob_home / 100.0) as avg_predicted,
      AVG(CASE WHEN mp.actual_outcome = 'HOME' THEN 1.0 ELSE 0.0 END) as actual_rate,
      COUNT(*) as n
    FROM model_performance mp
    JOIN predictions p ON mp.prediction_id = p.id
    WHERE mp.actual_outcome IS NOT NULL
    UNION ALL
    SELECT 'DRAW', AVG(mp.prob_draw / 100.0), AVG(CASE WHEN mp.actual_outcome = 'DRAW' THEN 1.0 ELSE 0.0 END), COUNT(*)
    FROM model_performance mp JOIN predictions p ON mp.prediction_id = p.id WHERE mp.actual_outcome IS NOT NULL
    UNION ALL
    SELECT 'AWAY', AVG(mp.prob_away / 100.0), AVG(CASE WHEN mp.actual_outcome = 'AWAY' THEN 1.0 ELSE 0.0 END), COUNT(*)
    FROM model_performance mp JOIN predictions p ON mp.prediction_id = p.id WHERE mp.actual_outcome IS NOT NULL
  `);

  return (allPreds?.rows || []).map(row => ({
    dimension: 'outcome',
    dimensionValue: row.outcome,
    sampleSize: parseInt(row.n || 0),
    avgPredictedProb: parseFloat(row.avg_predicted || 0),
    actualHitRate: parseFloat(row.actual_rate || 0),
    bias: parseFloat(row.avg_predicted || 0) - parseFloat(row.actual_rate || 0),
    brierScore: null,
    logLoss: null,
  }));
}

/**
 * Aggregate by league — detects league-specific biases.
 * e.g., "Model overestimates home wins in Serie A by 8%"
 */
async function computeLeagueAggregates(version) {
  const result = await safeQuery(`
    SELECT
      p.league_code,
      COUNT(*) as sample_size,
      AVG(CASE
        WHEN mp.predicted_outcome = mp.actual_outcome THEN 1.0 ELSE 0.0
      END) as accuracy,
      AVG(mp.brier_score) as brier_score,
      AVG(mp.log_loss) as log_loss,
      AVG(mp.prob_home / 100.0) as avg_pred_home,
      AVG(CASE WHEN mp.actual_outcome = 'HOME' THEN 1.0 ELSE 0.0 END) as actual_home_rate,
      AVG(mp.prob_draw / 100.0) as avg_pred_draw,
      AVG(CASE WHEN mp.actual_outcome = 'DRAW' THEN 1.0 ELSE 0.0 END) as actual_draw_rate,
      AVG(mp.prob_away / 100.0) as avg_pred_away,
      AVG(CASE WHEN mp.actual_outcome = 'AWAY' THEN 1.0 ELSE 0.0 END) as actual_away_rate
    FROM model_performance mp
    JOIN predictions p ON mp.prediction_id = p.id
    WHERE p.league_code IS NOT NULL
      AND mp.actual_outcome IS NOT NULL
    GROUP BY p.league_code
    HAVING COUNT(*) >= 5
  `);

  return (result?.rows || []).map(row => ({
    dimension: 'league',
    dimensionValue: row.league_code,
    sampleSize: parseInt(row.sample_size),
    avgPredictedProb: parseFloat(row.accuracy || 0),
    actualHitRate: parseFloat(row.accuracy || 0),
    bias: parseFloat(row.avg_pred_home || 0) - parseFloat(row.actual_home_rate || 0),
    brierScore: parseFloat(row.brier_score || 0),
    logLoss: parseFloat(row.log_loss || 0),
    details: {
      homeBias: parseFloat(row.avg_pred_home || 0) - parseFloat(row.actual_home_rate || 0),
      drawBias: parseFloat(row.avg_pred_draw || 0) - parseFloat(row.actual_draw_rate || 0),
      awayBias: parseFloat(row.avg_pred_away || 0) - parseFloat(row.actual_away_rate || 0),
    },
  }));
}

/**
 * Aggregate by market type (BTTS, O/U 2.5, etc.)
 */
async function computeMarketAggregates(version) {
  const result = await safeQuery(`
    SELECT
      mp_m.market_type,
      COUNT(*) as sample_size,
      AVG(mp_m.predicted_prob / 100.0) as avg_predicted,
      AVG(CASE WHEN mp_m.actual_hit = true THEN 1.0 ELSE 0.0 END) as actual_hit_rate,
      AVG(POWER(mp_m.predicted_prob / 100.0 - CASE WHEN mp_m.actual_hit THEN 1.0 ELSE 0.0 END, 2)) as brier
    FROM market_predictions mp_m
    WHERE mp_m.actual_hit IS NOT NULL
    GROUP BY mp_m.market_type
    HAVING COUNT(*) >= 5
  `);

  return (result?.rows || []).map(row => ({
    dimension: 'market',
    dimensionValue: row.market_type,
    sampleSize: parseInt(row.sample_size),
    avgPredictedProb: parseFloat(row.avg_predicted || 0),
    actualHitRate: parseFloat(row.actual_hit_rate || 0),
    bias: parseFloat(row.avg_predicted || 0) - parseFloat(row.actual_hit_rate || 0),
    brierScore: parseFloat(row.brier || 0),
    logLoss: null,
  }));
}

/**
 * Aggregate by odds range — detects calibration issues at different probability levels.
 */
async function computeOddsRangeAggregates(version) {
  const aggregates = [];

  for (const range of ODDS_RANGES) {
    const result = await safeQuery(`
      SELECT
        COUNT(*) as sample_size,
        AVG(CASE
          WHEN mp.predicted_outcome = 'HOME' THEN mp.prob_home / 100.0
          WHEN mp.predicted_outcome = 'DRAW' THEN mp.prob_draw / 100.0
          WHEN mp.predicted_outcome = 'AWAY' THEN mp.prob_away / 100.0
        END) as avg_predicted,
        AVG(CASE WHEN mp.prediction_correct THEN 1.0 ELSE 0.0 END) as actual_hit_rate,
        AVG(mp.brier_score) as brier_score,
        AVG(mp.log_loss) as log_loss
      FROM model_performance mp
      WHERE mp.actual_outcome IS NOT NULL
        AND CASE
          WHEN mp.predicted_outcome = 'HOME' THEN mp.odds_home
          WHEN mp.predicted_outcome = 'DRAW' THEN mp.odds_draw
          WHEN mp.predicted_outcome = 'AWAY' THEN mp.odds_away
        END BETWEEN $1 AND $2
    `, [range.min, range.max]);

    const row = result?.rows?.[0];
    if (row && parseInt(row.sample_size) >= 3) {
      aggregates.push({
        dimension: 'odds_range',
        dimensionValue: range.label,
        sampleSize: parseInt(row.sample_size),
        avgPredictedProb: parseFloat(row.avg_predicted || 0),
        actualHitRate: parseFloat(row.actual_hit_rate || 0),
        bias: parseFloat(row.avg_predicted || 0) - parseFloat(row.actual_hit_rate || 0),
        brierScore: parseFloat(row.brier_score || 0),
        logLoss: parseFloat(row.log_loss || 0),
      });
    }
  }

  return aggregates;
}

/**
 * Detect statistically significant biases from aggregated data.
 * A bias is flagged when:
 *   - |bias| > 0.03 (3% deviation)
 *   - sample_size >= 20 (statistically meaningful)
 *
 * @param {Array} aggregates
 * @returns {Array} Detected biases with severity
 */
export function detectBiases(aggregates) {
  const BIAS_THRESHOLD = 0.03;
  const MIN_SAMPLE = 15; // Lowered for early-stage system

  return aggregates
    .filter(a => Math.abs(a.bias) > BIAS_THRESHOLD && a.sampleSize >= MIN_SAMPLE)
    .map(a => {
      const severity = Math.abs(a.bias) > 0.10 ? 'CRITICAL'
        : Math.abs(a.bias) > 0.06 ? 'HIGH'
        : 'MODERATE';

      const direction = a.bias > 0 ? 'OVERCONFIDENT' : 'UNDERCONFIDENT';

      return {
        dimension: a.dimension,
        dimensionValue: a.dimensionValue,
        bias: parseFloat(a.bias.toFixed(4)),
        direction,
        severity,
        sampleSize: a.sampleSize,
        description: buildBiasDescription(a),
      };
    })
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
}

/**
 * Generate multiplicative correction factors from detected biases.
 * These factors are applied during inference to counteract systematic errors.
 *
 * @param {Array} biases
 * @returns {Object} Correction factors keyed by dimension:value
 */
export function generateCorrectionFactors(biases) {
  const corrections = {};

  for (const bias of biases) {
    const key = `${bias.dimension}:${bias.dimensionValue}`;

    // Correction = actual_hit_rate / avg_predicted_prob
    // If we predict 0.40 but actual is 0.35, correction = 0.35/0.40 = 0.875
    // Applied: adjusted_prob = raw_prob * 0.875
    // This pulls predictions toward reality.
    //
    // We dampen the correction to avoid overcorrection (50% of the full adjustment).
    const dampening = 0.50;
    const fullCorrection = bias.bias > 0
      ? 1 - (bias.bias * dampening)   // Overconfident: reduce
      : 1 + (Math.abs(bias.bias) * dampening); // Underconfident: increase

    // Clamp to prevent extreme corrections
    corrections[key] = {
      factor: parseFloat(Math.max(0.70, Math.min(1.30, fullCorrection)).toFixed(4)),
      bias: bias.bias,
      sampleSize: bias.sampleSize,
      severity: bias.severity,
    };
  }

  return corrections;
}

/**
 * Store computed aggregates in the database.
 */
async function storeAggregates(version, aggregates) {
  for (const agg of aggregates) {
    await safeQuery(
      `INSERT INTO feedback_aggregates
        (model_version, dimension, dimension_value, sample_size,
         avg_predicted_prob, actual_hit_rate, bias, brier_score, log_loss, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (model_version, dimension, dimension_value) DO UPDATE SET
         sample_size = $4, avg_predicted_prob = $5, actual_hit_rate = $6,
         bias = $7, brier_score = $8, log_loss = $9, computed_at = NOW()`,
      [
        version, agg.dimension, agg.dimensionValue, agg.sampleSize,
        agg.avgPredictedProb, agg.actualHitRate, agg.bias,
        agg.brierScore, agg.logLoss,
      ]
    );
  }
}

/**
 * Retrieve stored feedback aggregates from the database.
 */
export async function getStoredAggregates(version = null) {
  if (!isDbAvailable()) return [];

  const v = version || (await getActiveVersion()).version;
  const result = await safeQuery(
    `SELECT * FROM feedback_aggregates
     WHERE model_version = $1
     ORDER BY dimension, ABS(bias) DESC`,
    [v]
  );
  return result?.rows || [];
}

/**
 * Get stored correction factors from the active model version.
 */
export async function getActiveCorrectionFactors() {
  const version = await getActiveVersion();
  return version.biasCorrections || {};
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildBiasDescription(agg) {
  const dir = agg.bias > 0 ? 'overestimated' : 'underestimated';
  const pct = Math.abs(agg.bias * 100).toFixed(1);

  switch (agg.dimension) {
    case 'outcome':
      return `${agg.dimensionValue} outcomes are ${dir} by ${pct}%`;
    case 'league':
      return `Predictions in ${agg.dimensionValue} are ${dir} by ${pct}%`;
    case 'market':
      return `${agg.dimensionValue} market is ${dir} by ${pct}%`;
    case 'odds_range':
      return `Predictions at odds ${agg.dimensionValue} are ${dir} by ${pct}%`;
    default:
      return `${agg.dimensionValue} is ${dir} by ${pct}%`;
  }
}

export default {
  computeFeedbackAggregates,
  detectBiases,
  generateCorrectionFactors,
  getStoredAggregates,
  getActiveCorrectionFactors,
};
