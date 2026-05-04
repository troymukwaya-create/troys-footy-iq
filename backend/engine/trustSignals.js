// ─── TRUST SIGNALS ──────────────────────────────────────────────────
// Generates metadata that travels with every prediction API response.
// Tells the frontend (and the user) exactly how much to trust this prediction.
//
// This is NOT cosmetic — it prevents users from being misled by:
//   - Uncalibrated probabilities during cold start
//   - High confidence on fallback data
//   - A degrading model that hasn't been caught yet

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getActiveVersion } from './modelVersioning.js';

// ─── Cached maturity & performance data ─────────────────────────────
let _maturityCache = null;
let _maturityCacheTime = 0;
const MATURITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Determine model maturity phase based on evaluated prediction count.
 * Controls which features are enabled and how confidence is displayed.
 *
 * Phases:
 *   COLD_START (0-9):   Poisson only, no calibration, max confidence capped
 *   WARMING   (10-49):  Poisson + calibration, no optimization
 *   MATURING  (50-149): Full ensemble, optimization enabled
 *   MATURE    (150+):   Full pipeline with all corrections
 */
export async function getModelMaturity() {
  const now = Date.now();
  if (_maturityCache && (now - _maturityCacheTime) < MATURITY_CACHE_TTL) {
    return _maturityCache;
  }

  let count = 0;
  if (isDbAvailable()) {
    try {
      const result = await safeQuery(
        `SELECT COUNT(*)::int as n FROM predictions WHERE actual_result IS NOT NULL`
      );
      count = result?.rows?.[0]?.n || 0;
    } catch {
      count = 0;
    }
  }

  let maturity;
  if (count < 10) {
    maturity = {
      phase: 'COLD_START',
      label: 'Early Model',
      description: `${count}/10 predictions evaluated — using baseline model only`,
      evaluatedCount: count,
      useEnsemble: false,
      useCalibration: false,
      useOptimization: false,
      useBiasCorrections: false,
      maxConfidence: 45,  // Cap confidence at 45% during cold start
    };
  } else if (count < 50) {
    maturity = {
      phase: 'WARMING',
      label: 'Learning Phase',
      description: `${count}/50 predictions evaluated — calibration active, optimization pending`,
      evaluatedCount: count,
      useEnsemble: false,
      useCalibration: true,
      useOptimization: false,
      useBiasCorrections: false,
      maxConfidence: 60,
    };
  } else if (count < 150) {
    maturity = {
      phase: 'MATURING',
      label: 'Developing Model',
      description: `${count}/150 predictions evaluated — full ensemble active`,
      evaluatedCount: count,
      useEnsemble: true,
      useCalibration: true,
      useOptimization: true,
      useBiasCorrections: false,
      maxConfidence: 85,
    };
  } else {
    maturity = {
      phase: 'MATURE',
      label: 'Production Model',
      description: `${count} predictions evaluated — all systems active`,
      evaluatedCount: count,
      useEnsemble: true,
      useCalibration: true,
      useOptimization: true,
      useBiasCorrections: true,
      maxConfidence: 100,
    };
  }

  _maturityCache = maturity;
  _maturityCacheTime = now;
  return maturity;
}

/**
 * Generate trust signals for a prediction response.
 * This object is attached to EVERY prediction API response.
 *
 * @param {Object} options
 * @param {string} options.dataQuality - 'FULL' | 'PARTIAL' | 'MINIMAL' | 'FALLBACK'
 * @param {string[]} options.warnings - Validation warnings
 * @returns {Object} Trust signals metadata
 */
export async function generateTrustSignals(options = {}) {
  const maturity = await getModelMaturity();
  const version = await getActiveVersion();

  // Get recent performance if available
  let recentPerformance = null;
  if (isDbAvailable() && maturity.evaluatedCount >= 10) {
    try {
      const result = await safeQuery(`
        SELECT
          COUNT(*)::int as n,
          ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
          ROUND(AVG(brier_score)::numeric, 4) as brier
        FROM model_performance
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      const row = result?.rows?.[0];
      if (row && parseInt(row.n) >= 5) {
        // Determine trend from older data
        const olderResult = await safeQuery(`
          SELECT ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy
          FROM model_performance
          WHERE created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
        `);
        const olderAcc = parseFloat(olderResult?.rows?.[0]?.accuracy || 0);
        const currentAcc = parseFloat(row.accuracy || 0);

        let trend = 'STABLE';
        if (olderAcc > 0) {
          if (currentAcc - olderAcc > 3) trend = 'IMPROVING';
          else if (olderAcc - currentAcc > 3) trend = 'DEGRADING';
        }

        recentPerformance = {
          last50Accuracy: parseFloat(row.accuracy || 0),
          last50Brier: parseFloat(row.brier || 0),
          sampleSize: parseInt(row.n),
          trend,
        };
      }
    } catch {
      // Performance data unavailable
    }
  }

  // Determine overall health
  let overallHealth = 'HEALTHY';
  if (maturity.phase === 'COLD_START') {
    overallHealth = 'COLD_START';
  } else if (recentPerformance && recentPerformance.last50Accuracy < 35) {
    overallHealth = 'DEGRADED';
  } else if (recentPerformance && recentPerformance.trend === 'DEGRADING') {
    overallHealth = 'DEGRADED';
  }

  const dataQuality = options.dataQuality || 'FULL';
  const dataQualityNotes = {
    FULL: 'Full team stats available for both teams',
    PARTIAL: 'Some team stats missing — using partial data',
    MINIMAL: 'Limited data available — predictions are approximate',
    FALLBACK: 'No team data available — using league averages only',
  };

  return {
    modelVersion: version.version,
    maturityPhase: maturity.phase,
    maturityLabel: maturity.description,
    overallHealth,

    dataQuality,
    dataQualityNote: dataQualityNotes[dataQuality] || dataQualityNotes.FALLBACK,

    recentPerformance,

    confidenceIsCalibrated: maturity.useCalibration,
    probabilitiesAreCalibrated: maturity.useCalibration,
    ensembleActive: maturity.useEnsemble,
    optimizationActive: maturity.useOptimization,

    warnings: [
      ...(options.warnings || []),
      ...(maturity.phase === 'COLD_START' ? ['Model is in early learning phase — predictions may be less accurate'] : []),
      ...(dataQuality === 'FALLBACK' ? ['Using league-average data — prediction quality is reduced'] : []),
      ...(overallHealth === 'DEGRADED' ? ['Model performance has degraded recently'] : []),
    ].slice(0, 5),
  };
}

/**
 * Invalidate the maturity cache (call after new evaluations).
 */
export function invalidateMaturityCache() {
  _maturityCache = null;
  _maturityCacheTime = 0;
}

export default {
  getModelMaturity,
  generateTrustSignals,
  invalidateMaturityCache,
};
