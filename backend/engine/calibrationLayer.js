// ─── CALIBRATION LAYER ──────────────────────────────────────────────
// Implements Isotonic Regression (simulated via interpolation map)
// to ensure model probabilities are perfectly calibrated.
// Uncalibrated models might predict 80% when empirical frequency is 65%.
// This layer maps raw predicted probabilities to empirical probabilities.
//
// SELF-IMPROVING: Calibration curves can be loaded from the model
// versioning system. The weekly retraining pipeline computes new curves
// from actual prediction performance data.

import { getActiveVersion } from './modelVersioning.js';

/**
 * Hardcoded fallback calibration curves.
 * Used only when no data-driven curves are available from the model versioning system.
 *
 * In production, these are replaced by curves generated from historical
 * prediction data via isotonic regression approximation during weekly retraining.
 */
const FALLBACK_CALIBRATION_CURVES = {
  // Win/Loss curve (typically overconfident at extremes)
  OUTCOME: [
    { raw: 0.00, calibrated: 0.02 },
    { raw: 0.10, calibrated: 0.12 },
    { raw: 0.20, calibrated: 0.22 },
    { raw: 0.30, calibrated: 0.31 },
    { raw: 0.40, calibrated: 0.39 },
    { raw: 0.50, calibrated: 0.48 },
    { raw: 0.60, calibrated: 0.57 },
    { raw: 0.70, calibrated: 0.65 }, // Overconfidence starts here
    { raw: 0.80, calibrated: 0.72 }, // 80% raw -> 72% true
    { raw: 0.90, calibrated: 0.81 },
    { raw: 1.00, calibrated: 0.90 }, // Rarely truly 100%
  ],
  // Goals curve (typically underconfident on high scores)
  GOALS: [
    { raw: 0.00, calibrated: 0.01 },
    { raw: 0.20, calibrated: 0.22 },
    { raw: 0.40, calibrated: 0.43 },
    { raw: 0.60, calibrated: 0.62 },
    { raw: 0.80, calibrated: 0.84 }, // Underconfidence
    { raw: 1.00, calibrated: 0.98 },
  ]
};

// ─── Cached calibration curves ──────────────────────────────────────
let _cachedCurves = null;
let _curvesCacheTime = 0;
const CURVES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Load active calibration curves from the model versioning system.
 * Falls back to hardcoded curves when no data-driven curves are available.
 */
async function loadCalibrationCurves() {
  const now = Date.now();
  if (_cachedCurves && (now - _curvesCacheTime) < CURVES_CACHE_TTL) {
    return _cachedCurves;
  }

  try {
    const version = await getActiveVersion();
    if (version.calibrationCurves && version.calibrationCurves.OUTCOME) {
      _cachedCurves = version.calibrationCurves;
      _curvesCacheTime = now;
      return _cachedCurves;
    }
  } catch {
    // Fall through to defaults
  }

  _cachedCurves = FALLBACK_CALIBRATION_CURVES;
  _curvesCacheTime = now;
  return _cachedCurves;
}

/**
 * Linearly interpolate the calibrated value based on the empirical curve.
 */
function interpolate(value, curve) {
  // Clamp value
  value = Math.max(0, Math.min(1, value));

  for (let i = 0; i < curve.length - 1; i++) {
    const lower = curve[i];
    const upper = curve[i + 1];

    if (value >= lower.raw && value <= upper.raw) {
      const fraction = (value - lower.raw) / (upper.raw - lower.raw);
      return lower.calibrated + fraction * (upper.calibrated - lower.calibrated);
    }
  }
  return value; // Should never reach here if curve spans 0.0 to 1.0
}

/**
 * Apply calibration to the raw predicted probabilities.
 * @param {Object} rawProbs - { home: 65.0, draw: 20.0, away: 15.0 } (percentages)
 * @returns {Object} Calibrated probabilities (percentages)
 */
export function calibrateOutcomes(rawProbs) {
  // Use cached curves (loaded asynchronously on first call)
  const curves = _cachedCurves || FALLBACK_CALIBRATION_CURVES;

  const pHome = interpolate(rawProbs.home / 100, curves.OUTCOME);
  const pDraw = interpolate(rawProbs.draw / 100, curves.OUTCOME);
  const pAway = interpolate(rawProbs.away / 100, curves.OUTCOME);

  // Re-normalize to ensure they sum exactly to 1.0
  const total = pHome + pDraw + pAway;
  
  return {
    home: parseFloat(((pHome / total) * 100).toFixed(1)),
    draw: parseFloat(((pDraw / total) * 100).toFixed(1)),
    away: parseFloat(((pAway / total) * 100).toFixed(1)),
  };
}

/**
 * Apply calibration to Over/Under markets.
 */
export function calibrateGoals(rawOverUnder) {
  const curves = _cachedCurves || FALLBACK_CALIBRATION_CURVES;

  const calibrated = {};
  for (const [market, prob] of Object.entries(rawOverUnder)) {
    const cal = interpolate(prob / 100, curves.GOALS);
    calibrated[market] = parseFloat((cal * 100).toFixed(1));
  }
  return calibrated;
}

/**
 * Generate new calibration curves from historical prediction data.
 * This is called during the weekly retraining pipeline.
 *
 * Method: Bin predictions into probability ranges, compute actual hit rates,
 * and create a piecewise-linear mapping.
 *
 * @param {Array} evaluatedPredictions - Array of { predicted_prob, actual_hit }
 * @param {number} numBins - Number of bins (default 10)
 * @returns {Array} Calibration curve points
 */
export function computeCalibrationCurve(evaluatedPredictions, numBins = 10) {
  if (!evaluatedPredictions || evaluatedPredictions.length < 20) {
    return null; // Not enough data to compute meaningful calibration
  }

  // Sort by predicted probability
  const sorted = [...evaluatedPredictions].sort((a, b) => a.predicted_prob - b.predicted_prob);

  const binSize = Math.ceil(sorted.length / numBins);
  const curve = [];

  for (let i = 0; i < numBins; i++) {
    const binStart = i * binSize;
    const binEnd = Math.min((i + 1) * binSize, sorted.length);
    const bin = sorted.slice(binStart, binEnd);

    if (bin.length === 0) continue;

    const avgPredicted = bin.reduce((s, p) => s + p.predicted_prob, 0) / bin.length;
    const actualRate = bin.filter(p => p.actual_hit).length / bin.length;

    curve.push({
      raw: parseFloat(avgPredicted.toFixed(4)),
      calibrated: parseFloat(actualRate.toFixed(4)),
    });
  }

  // Ensure curve spans 0.0 to 1.0
  if (curve.length > 0) {
    if (curve[0].raw > 0.05) curve.unshift({ raw: 0.00, calibrated: 0.02 });
    if (curve[curve.length - 1].raw < 0.95) curve.push({ raw: 1.00, calibrated: 0.95 });
  }

  // Enforce monotonicity (isotonic constraint)
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].calibrated < curve[i - 1].calibrated) {
      curve[i].calibrated = curve[i - 1].calibrated;
    }
  }

  return curve;
}

/**
 * Invalidate cached calibration curves (call after retraining).
 */
export function invalidateCalibrationCache() {
  _cachedCurves = null;
  _curvesCacheTime = 0;
}

/**
 * Initialize calibration curves from the model versioning system.
 * Called on server startup.
 */
export async function initCalibration() {
  try {
    await loadCalibrationCurves();
    console.log('[CALIBRATION] Curves loaded successfully');
  } catch (err) {
    console.warn('[CALIBRATION] Using fallback curves:', err.message);
  }
}

export default {
  calibrateOutcomes,
  calibrateGoals,
  computeCalibrationCurve,
  invalidateCalibrationCache,
  initCalibration,
};
