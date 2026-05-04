// ─── DATA VALIDATION LAYER ──────────────────────────────────────────
// Central validation module enforced at ALL entry points.
// Prevents garbage-in-garbage-out by validating:
//   1. Team stats BEFORE prediction (input gate)
//   2. Prediction output BEFORE storage (output gate)
//   3. API responses BEFORE processing (ingestion gate)
//
// Every function returns { valid, cleaned, warnings[] } so callers
// can decide how to handle degraded data.

/**
 * Validate and sanitize team statistics before prediction.
 * Returns cleaned stats with fallback values for missing fields.
 *
 * @param {Object} stats - Raw team stats
 * @param {string} label - 'home' or 'away' (for logging)
 * @returns {{ valid: boolean, cleaned: Object, warnings: string[], quality: string }}
 */
export function validateTeamStats(stats, label = 'team') {
  const warnings = [];

  if (!stats || typeof stats !== 'object') {
    return {
      valid: false,
      cleaned: buildFallbackStats(),
      warnings: [`${label}: No stats provided — using league averages`],
      quality: 'FALLBACK',
    };
  }

  const cleaned = { ...stats };

  // ─── Numeric field validation ─────────────────────────────────
  const numericFields = [
    { key: 'avgGoalsFor', fallback: 1.35, min: 0, max: 5 },
    { key: 'avgGoalsAgainst', fallback: 1.35, min: 0, max: 5 },
    { key: 'played', fallback: 0, min: 0, max: 60 },
    { key: 'wins', fallback: 0, min: 0, max: 60 },
    { key: 'draws', fallback: 0, min: 0, max: 60 },
    { key: 'losses', fallback: 0, min: 0, max: 60 },
  ];

  let missingCount = 0;

  for (const field of numericFields) {
    const val = cleaned[field.key];

    if (val === null || val === undefined || val === '') {
      cleaned[field.key] = field.fallback;
      missingCount++;
      warnings.push(`${label}: ${field.key} missing — using ${field.fallback}`);
      continue;
    }

    const num = Number(val);
    if (!isFinite(num)) {
      cleaned[field.key] = field.fallback;
      missingCount++;
      warnings.push(`${label}: ${field.key} is ${val} (not a number) — using ${field.fallback}`);
      continue;
    }

    // Clamp to reasonable range
    if (num < field.min || num > field.max) {
      cleaned[field.key] = Math.max(field.min, Math.min(field.max, num));
      warnings.push(`${label}: ${field.key}=${num} out of range [${field.min},${field.max}] — clamped to ${cleaned[field.key]}`);
    } else {
      cleaned[field.key] = num;
    }
  }

  // Zero goals protection (prevents division by zero in Poisson)
  if (cleaned.avgGoalsFor === 0) {
    cleaned.avgGoalsFor = 0.10;
    warnings.push(`${label}: avgGoalsFor was 0 — set to 0.10 to prevent division by zero`);
  }
  if (cleaned.avgGoalsAgainst === 0) {
    cleaned.avgGoalsAgainst = 0.10;
    warnings.push(`${label}: avgGoalsAgainst was 0 — set to 0.10 to prevent division by zero`);
  }

  // ─── Form validation ──────────────────────────────────────────
  if (!cleaned.form || typeof cleaned.form !== 'string') {
    cleaned.form = 'N/A';
    if (cleaned.played > 3) {
      warnings.push(`${label}: Form string missing despite ${cleaned.played} matches played`);
    }
  }

  // ─── Data quality classification ──────────────────────────────
  let quality;
  if (missingCount === 0 && cleaned.played >= 5) {
    quality = 'FULL';
  } else if (missingCount <= 2 && cleaned.played >= 3) {
    quality = 'PARTIAL';
  } else if (cleaned.played > 0) {
    quality = 'MINIMAL';
  } else {
    quality = 'FALLBACK';
  }

  // isValid flag for downstream compatibility
  cleaned.isValid = quality !== 'FALLBACK';

  return {
    valid: quality !== 'FALLBACK',
    cleaned,
    warnings,
    quality,
  };
}

/**
 * Validate prediction output before storage.
 * Ensures probabilities sum to ~100%, all values are finite, and no field is missing.
 *
 * @param {Object} prediction - Full prediction output
 * @returns {{ valid: boolean, cleaned: Object, warnings: string[] }}
 */
export function validatePredictionOutput(prediction) {
  const warnings = [];

  if (!prediction || typeof prediction !== 'object') {
    return { valid: false, cleaned: null, warnings: ['Prediction is null/undefined'] };
  }

  // ─── 1X2 Probability validation ───────────────────────────────
  const probs = prediction.probabilities;
  if (!probs || typeof probs !== 'object') {
    return { valid: false, cleaned: null, warnings: ['No probabilities in prediction'] };
  }

  const h = Number(probs.home);
  const d = Number(probs.draw);
  const a = Number(probs.away);

  if (!isFinite(h) || !isFinite(d) || !isFinite(a)) {
    return { valid: false, cleaned: null, warnings: [`Non-finite probabilities: H=${probs.home} D=${probs.draw} A=${probs.away}`] };
  }

  if (h < 0 || d < 0 || a < 0) {
    return { valid: false, cleaned: null, warnings: [`Negative probabilities: H=${h} D=${d} A=${a}`] };
  }

  if (h > 100 || d > 100 || a > 100) {
    warnings.push(`Individual probability >100%: H=${h} D=${d} A=${a}`);
  }

  // Sum check — should be ~100% (±1.0 tolerance for rounding)
  const sum = h + d + a;
  if (Math.abs(sum - 100) > 1.0) {
    warnings.push(`Probabilities sum to ${sum.toFixed(1)}% (expected ~100%) — normalizing`);
    // Auto-normalize
    probs.home = parseFloat(((h / sum) * 100).toFixed(1));
    probs.draw = parseFloat(((d / sum) * 100).toFixed(1));
    probs.away = parseFloat(((a / sum) * 100).toFixed(1));
  }

  // ─── Expected goals validation ────────────────────────────────
  if (prediction.expectedGoals) {
    const eg = prediction.expectedGoals;
    if (!isFinite(eg.home) || eg.home < 0 || eg.home > 6) {
      warnings.push(`expectedGoals.home=${eg.home} — clamping to [0, 6]`);
      eg.home = Math.max(0, Math.min(6, eg.home || 1.35));
    }
    if (!isFinite(eg.away) || eg.away < 0 || eg.away > 6) {
      warnings.push(`expectedGoals.away=${eg.away} — clamping to [0, 6]`);
      eg.away = Math.max(0, Math.min(6, eg.away || 1.15));
    }
  }

  return { valid: true, cleaned: prediction, warnings };
}

/**
 * Validate an API response from football-data.org or API-Football.
 *
 * @param {Object} response - Raw API response data
 * @param {string} source - 'footballdata' or 'apisports'
 * @returns {{ valid: boolean, data: any, warnings: string[] }}
 */
export function validateApiResponse(response, source = 'unknown') {
  const warnings = [];

  if (!response) {
    return { valid: false, data: null, warnings: [`[${source}] Null response`] };
  }

  if (response.error || response.errors) {
    const errMsg = response.error?.message || JSON.stringify(response.errors);
    return { valid: false, data: null, warnings: [`[${source}] API error: ${errMsg}`] };
  }

  // Check for rate limiting
  if (response.status === 429) {
    return { valid: false, data: null, warnings: [`[${source}] Rate limited (429)`] };
  }

  // Check for empty data
  if (source === 'footballdata') {
    const matches = response.matches || response.data?.matches;
    if (!matches || !Array.isArray(matches)) {
      warnings.push(`[${source}] No matches array in response`);
      return { valid: false, data: null, warnings };
    }
    if (matches.length === 0) {
      warnings.push(`[${source}] Empty matches array`);
    }
  }

  return { valid: true, data: response, warnings };
}

/**
 * Classify overall data quality for a prediction based on both teams' stats.
 *
 * @returns {'FULL' | 'PARTIAL' | 'MINIMAL' | 'FALLBACK'}
 */
export function classifyDataQuality(homeValidation, awayValidation) {
  const qualities = [homeValidation.quality, awayValidation.quality];

  if (qualities.includes('FALLBACK')) return 'FALLBACK';
  if (qualities.includes('MINIMAL')) return 'MINIMAL';
  if (qualities.includes('PARTIAL')) return 'PARTIAL';
  return 'FULL';
}

/**
 * Validate a match result before evaluation.
 */
export function validateMatchResult(homeGoals, awayGoals) {
  const warnings = [];
  const h = Number(homeGoals);
  const a = Number(awayGoals);

  if (!isFinite(h) || h < 0 || h > 20) {
    return { valid: false, warnings: [`Invalid home goals: ${homeGoals}`] };
  }
  if (!isFinite(a) || a < 0 || a > 20) {
    return { valid: false, warnings: [`Invalid away goals: ${awayGoals}`] };
  }

  // Unusual score warning
  if (h + a > 8) {
    warnings.push(`Unusual scoreline ${h}-${a} (${h + a} total goals)`);
  }

  return { valid: true, homeGoals: h, awayGoals: a, warnings };
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildFallbackStats() {
  return {
    avgGoalsFor: 1.35,
    avgGoalsAgainst: 1.35,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    form: 'N/A',
    isValid: false,
  };
}

export default {
  validateTeamStats,
  validatePredictionOutput,
  validateApiResponse,
  classifyDataQuality,
  validateMatchResult,
};
