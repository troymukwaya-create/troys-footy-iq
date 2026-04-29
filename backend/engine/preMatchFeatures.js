// ─── PRE-MATCH FEATURE ENGINEERING ──────────────────────────────────
// Computes the full pre-match feature vector for model training & inference.
// All features are numerical, normalized, and constructed to prevent
// data leakage (only data available BEFORE kickoff is used).
//
// This complements featureEngine.js (which handles in-play features).

const LEAGUE_AVG_GOALS = 1.35;

/**
 * Compute the full pre-match feature vector.
 *
 * @param {Object} homeStats - Normalized team stats (from normalizer.js)
 * @param {Object} awayStats - Normalized team stats
 * @param {Object} context   - { h2h, homeRestDays, awayRestDays, homePosition, awayPosition, odds }
 * @returns {Object} Flat object with ~25 numerical features
 */
export function computePreMatchFeatures(homeStats, awayStats, context = {}) {
  const hs = homeStats || {};
  const as = awayStats || {};

  // ─── Team Strength (relative to league average = 1.0) ──────────
  const homeAttack  = safeDiv(hs.avgGoalsFor, LEAGUE_AVG_GOALS, 1.0);
  const homeDefense = safeDiv(hs.avgGoalsAgainst, LEAGUE_AVG_GOALS, 1.0);
  const awayAttack  = safeDiv(as.avgGoalsFor, LEAGUE_AVG_GOALS, 1.0);
  const awayDefense = safeDiv(as.avgGoalsAgainst, LEAGUE_AVG_GOALS, 1.0);

  // ─── Form (exponentially weighted last 5 results) ──────────────
  const homeFormScore = formToScore(hs.form);
  const awayFormScore = formToScore(as.form);

  // ─── Rest days ─────────────────────────────────────────────────
  const homeRest = clamp(context.homeRestDays || 7, 1, 14);
  const awayRest = clamp(context.awayRestDays || 7, 1, 14);

  // ─── H2H ──────────────────────────────────────────────────────
  const h2h = context.h2h || {};
  const h2hTotal = h2h.totalMatches || 0;
  const h2hHomeWinRate = h2hTotal > 0 ? (h2h.homeWins || 0) / h2hTotal : 0.45;
  const h2hDrawRate    = h2hTotal > 0 ? (h2h.draws || 0) / h2hTotal : 0.27;

  // ─── Market odds (implied probabilities) ──────────────────────
  const odds = context.odds || {};
  const mktHome = odds.impliedHome || 0.33;
  const mktDraw = odds.impliedDraw || 0.33;
  const mktAway = odds.impliedAway || 0.33;

  // ─── League position ──────────────────────────────────────────
  const homePos = context.homePosition || 10;
  const awayPos = context.awayPosition || 10;

  return {
    // Team strength (4 features)
    home_attack_strength:   round(homeAttack, 3),
    home_defense_strength:  round(homeDefense, 3),
    away_attack_strength:   round(awayAttack, 3),
    away_defense_strength:  round(awayDefense, 3),

    // Differentials (3 features)
    attack_diff:  round(homeAttack - awayAttack, 3),
    defense_diff: round(homeDefense - awayDefense, 3),
    strength_diff: round((homeAttack / Math.max(homeDefense, 0.1)) - (awayAttack / Math.max(awayDefense, 0.1)), 3),

    // Form (3 features)
    home_form_score: homeFormScore,
    away_form_score: awayFormScore,
    form_diff:       round(homeFormScore - awayFormScore, 3),

    // Record (4 features)
    home_win_rate: hs.played > 0 ? round((hs.wins || 0) / hs.played, 3) : 0.33,
    away_win_rate: as.played > 0 ? round((as.wins || 0) / as.played, 3) : 0.33,
    home_clean_sheet_rate: hs.played > 0 ? round((hs.cleanSheets || 0) / hs.played, 3) : 0.3,
    away_clean_sheet_rate: as.played > 0 ? round((as.cleanSheets || 0) / as.played, 3) : 0.3,

    // Rest & schedule (3 features)
    home_rest_days: homeRest,
    away_rest_days: awayRest,
    rest_advantage: homeRest - awayRest,

    // H2H (2 features — low weight in model)
    h2h_home_win_rate: round(h2hHomeWinRate, 3),
    h2h_draw_rate:     round(h2hDrawRate, 3),

    // Market features (3 features — powerful when available)
    market_implied_home: round(mktHome, 4),
    market_implied_draw: round(mktDraw, 4),
    market_implied_away: round(mktAway, 4),

    // League position (2 features)
    position_diff:    awayPos - homePos, // Positive = home higher in table
    combined_position: homePos + awayPos,

    // Sample confidence (1 feature — tells model how much to trust stats)
    sample_confidence: round(Math.min((hs.played || 0) + (as.played || 0), 40) / 40, 3),
  };
}

/**
 * Get ordered feature names (for model training).
 * The order must be deterministic and consistent between training and inference.
 */
export function getFeatureNames() {
  return [
    'home_attack_strength', 'home_defense_strength',
    'away_attack_strength', 'away_defense_strength',
    'attack_diff', 'defense_diff', 'strength_diff',
    'home_form_score', 'away_form_score', 'form_diff',
    'home_win_rate', 'away_win_rate',
    'home_clean_sheet_rate', 'away_clean_sheet_rate',
    'home_rest_days', 'away_rest_days', 'rest_advantage',
    'h2h_home_win_rate', 'h2h_draw_rate',
    'market_implied_home', 'market_implied_draw', 'market_implied_away',
    'position_diff', 'combined_position',
    'sample_confidence',
  ];
}

/**
 * Convert a feature object to an ordered array for model input.
 */
export function featuresToArray(features) {
  return getFeatureNames().map(name => features[name] ?? 0);
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Convert form string "WDLWW" to a weighted score.
 * W=3, D=1, L=0. Recent results weighted higher via exponential decay.
 * Output normalized to [0, 1] range.
 */
function formToScore(form) {
  if (!form || form === 'N/A' || typeof form !== 'string') return 0.5;
  const chars = form.toUpperCase().split('').filter(c => 'WDL'.includes(c)).slice(-5);
  if (chars.length === 0) return 0.5;

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < chars.length; i++) {
    const recency = Math.pow(0.7, chars.length - 1 - i); // Most recent = highest weight
    const value = chars[i] === 'W' ? 3 : chars[i] === 'D' ? 1 : 0;
    weightedSum += value * recency;
    totalWeight += recency * 3; // Max possible per position
  }

  return round(weightedSum / totalWeight, 3);
}

function safeDiv(a, b, fallback = 0) {
  if (!a || !b || b === 0) return fallback;
  return a / b;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round(v, d) { return parseFloat(v.toFixed(d)); }

export default {
  computePreMatchFeatures,
  getFeatureNames,
  featuresToArray,
};
