// ─── PREDICTION EXPLAINER ───────────────────────────────────────────
// Generates data-driven explanations for every prediction.
// Computed from actual model internals (lambda, form, calibration),
// NOT from LLM-generated text.
//
// Every explanation is:
//   - Specific to the prediction's input data
//   - Traceable to a model parameter
//   - Quantified with impact levels

import { safeQuery, isDbAvailable } from '../db/index.js';

/**
 * Generate a full explanation for a prediction.
 *
 * @param {Object} params
 * @param {Object} params.prediction    - The prediction output
 * @param {Object} params.homeStats     - Validated home team stats
 * @param {Object} params.awayStats     - Validated away team stats
 * @param {Object} params.homeValidation - From validateTeamStats()
 * @param {Object} params.awayValidation - From validateTeamStats()
 * @param {Object} params.maturity      - From getModelMaturity()
 * @param {Object} params.modelVersion  - From getActiveVersion()
 * @returns {Object} Explanation object
 */
export function generateExplanation({
  prediction,
  homeStats,
  awayStats,
  homeValidation = {},
  awayValidation = {},
  maturity = {},
  modelVersion = {},
}) {
  const keyFactors = [];
  const warnings = [];
  const probs = prediction?.probabilities || {};
  const xG = prediction?.expectedGoals || {};

  // ─── 1. Goal expectation factor ───────────────────────────────
  if (xG.home && xG.away) {
    const lambdaDiff = xG.home - xG.away;
    const direction = lambdaDiff > 0.2 ? 'FAVORS_HOME'
      : lambdaDiff < -0.2 ? 'FAVORS_AWAY' : 'NEUTRAL';
    const impact = Math.abs(lambdaDiff) > 0.5 ? 'HIGH'
      : Math.abs(lambdaDiff) > 0.2 ? 'MEDIUM' : 'LOW';

    keyFactors.push({
      factor: 'Goal expectation',
      impact,
      detail: `λ_home=${xG.home.toFixed(2)} vs λ_away=${xG.away.toFixed(2)} (diff: ${lambdaDiff > 0 ? '+' : ''}${lambdaDiff.toFixed(2)})`,
      direction,
    });
  }

  // ─── 2. Form factor ───────────────────────────────────────────
  const homeForm = homeStats?.form || 'N/A';
  const awayForm = awayStats?.form || 'N/A';

  if (homeForm !== 'N/A' || awayForm !== 'N/A') {
    const homeFormScore = computeFormScore(homeForm);
    const awayFormScore = computeFormScore(awayForm);
    const formDiff = homeFormScore - awayFormScore;

    const direction = formDiff > 0.15 ? 'FAVORS_HOME'
      : formDiff < -0.15 ? 'FAVORS_AWAY' : 'NEUTRAL';
    const impact = Math.abs(formDiff) > 0.3 ? 'HIGH'
      : Math.abs(formDiff) > 0.15 ? 'MEDIUM' : 'LOW';

    keyFactors.push({
      factor: 'Recent form',
      impact,
      detail: `Home: ${homeForm} (${(homeFormScore * 100).toFixed(0)}%) | Away: ${awayForm} (${(awayFormScore * 100).toFixed(0)}%)`,
      direction,
    });
  }

  // ─── 3. Home advantage factor ─────────────────────────────────
  if (probs.home > probs.away) {
    const homeEdge = probs.home - probs.away;
    keyFactors.push({
      factor: 'Home advantage',
      impact: homeEdge > 20 ? 'HIGH' : homeEdge > 10 ? 'MEDIUM' : 'LOW',
      detail: `Home win ${probs.home}% vs Away win ${probs.away}% (+${homeEdge.toFixed(1)}% home edge)`,
      direction: 'FAVORS_HOME',
    });
  }

  // ─── 4. Goals market insight ──────────────────────────────────
  if (xG.total) {
    const goalsExpected = xG.total;
    const ou25Direction = goalsExpected > 2.5 ? 'OVER' : 'UNDER';
    keyFactors.push({
      factor: 'Total goals expectation',
      impact: Math.abs(goalsExpected - 2.5) > 0.5 ? 'MEDIUM' : 'LOW',
      detail: `Expected ${goalsExpected.toFixed(2)} total goals → leans ${ou25Direction} 2.5`,
      direction: 'NEUTRAL',
    });
  }

  // ─── 5. Data quality factor ───────────────────────────────────
  const dataQuality = classifyQuality(homeValidation, awayValidation);
  if (dataQuality !== 'FULL') {
    keyFactors.push({
      factor: 'Data quality',
      impact: dataQuality === 'FALLBACK' ? 'HIGH' : 'MEDIUM',
      detail: `Data quality: ${dataQuality} — ${dataQuality === 'FALLBACK' ? 'using league averages' : 'some stats missing'}`,
      direction: 'NEUTRAL',
    });
  }

  // ─── Warnings ─────────────────────────────────────────────────
  if (homeValidation.warnings) warnings.push(...homeValidation.warnings);
  if (awayValidation.warnings) warnings.push(...awayValidation.warnings);

  if (homeStats?.played < 5) {
    warnings.push(`Home team has only ${homeStats?.played || 0} matches this season — predictions less reliable`);
  }
  if (awayStats?.played < 5) {
    warnings.push(`Away team has only ${awayStats?.played || 0} matches this season — predictions less reliable`);
  }

  // ─── Confidence explanation ───────────────────────────────────
  const maxProb = Math.max(probs.home || 0, probs.draw || 0, probs.away || 0);
  const confidence = prediction?.confidence || 0;
  const reasoning = prediction?.confidenceReasoning || {};

  const confidenceExplanation = buildConfidenceExplanation(confidence, reasoning, maturity);

  return {
    keyFactors: keyFactors.slice(0, 6), // Cap at 6 most relevant factors
    confidenceExplanation,
    historicalContext: {
      similarPredictions: reasoning.historicalAccuracy ? Math.round(reasoning.historicalAccuracy) : null,
      modelPhase: maturity.phase || 'UNKNOWN',
      modelPhaseLabel: maturity.label || 'Unknown',
    },
    dataQuality,
    maturityPhase: maturity.phase || 'UNKNOWN',
    modelVersion: modelVersion?.version || 'unknown',
    warnings: warnings.slice(0, 10), // Cap warnings
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeFormScore(form) {
  if (!form || form === 'N/A' || typeof form !== 'string') return 0.5;
  const chars = form.toUpperCase().split('').filter(c => 'WDL'.includes(c)).slice(-5);
  if (chars.length === 0) return 0.5;

  let sum = 0;
  let weight = 0;
  for (let i = 0; i < chars.length; i++) {
    const w = Math.pow(0.65, chars.length - 1 - i);
    sum += (chars[i] === 'W' ? 1 : chars[i] === 'D' ? 0.4 : 0) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0.5;
}

function classifyQuality(homeVal, awayVal) {
  const hq = homeVal?.quality || 'FALLBACK';
  const aq = awayVal?.quality || 'FALLBACK';
  if (hq === 'FALLBACK' || aq === 'FALLBACK') return 'FALLBACK';
  if (hq === 'MINIMAL' || aq === 'MINIMAL') return 'MINIMAL';
  if (hq === 'PARTIAL' || aq === 'PARTIAL') return 'PARTIAL';
  return 'FULL';
}

function buildConfidenceExplanation(confidence, reasoning, maturity) {
  const parts = [];

  parts.push(`Confidence ${confidence.toFixed(1)}%`);

  if (reasoning.historicalAccuracy) {
    parts.push(`model has ${reasoning.historicalAccuracy.toFixed(0)}% accuracy at this probability level`);
  }

  if (reasoning.certainty) {
    const certaintyLevel = reasoning.certainty > 60 ? 'high' : reasoning.certainty > 35 ? 'moderate' : 'low';
    parts.push(`distribution certainty is ${certaintyLevel} (${reasoning.certainty.toFixed(0)}%)`);
  }

  if (maturity.phase === 'COLD_START' || maturity.phase === 'WARMING') {
    parts.push(`⚠️ Model is in ${maturity.label} — confidence may be less reliable`);
  }

  return parts.join(' — ');
}

export default { generateExplanation };
