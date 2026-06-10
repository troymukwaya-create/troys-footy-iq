// ─── PREDICTION PERSISTENCE SERVICE ─────────────────────────────────
// Stores every pre-match prediction in PostgreSQL before kickoff.
// Resolves external match IDs (fd_xxx / apf_xxx) to internal fixture IDs.
// SELF-IMPROVING: Now also stores market-level predictions (BTTS, O/U, etc.)
// in the market_predictions table for granular feedback analysis.
// Non-blocking: callers use .catch(() => {}) to avoid blocking API responses.

import { safeQuery, isDbAvailable } from '../db/index.js';

const MODEL_VERSION = 'hybrid-dc-v2';

/**
 * Store a prediction in the database.
 * Resolves the external match ID to an internal fixture ID.
 *
 * @param {Object} params
 * @param {string} params.matchExternalId  - 'fd_538129' or 'apf_12345'
 * @param {string} params.homeTeam         - Team name
 * @param {string} params.awayTeam         - Team name
 * @param {Object} params.prediction       - Output from probabilityEngine.analyzeMatch()
 * @param {Object} params.odds             - { home, draw, away } decimal odds (optional)
 * @param {Object} params.valueEdges       - Array from oddsService.computeValueEdges() (optional)
 * @param {Object} params.features         - From preMatchFeatures (optional)
 * @param {string} params.leagueCode       - League code for feedback aggregation (optional)
 * @param {string} params.modelVersion     - Model that produced this prediction (default 'hybrid-dc-v2')
 * @param {boolean} params.upsert          - Replace an existing unevaluated row for the same
 *                                           (fixture, model) — used by the WC prediction-lock job
 * @returns {number|null} prediction ID
 */
export async function storePrediction({
  matchExternalId,
  homeTeam,
  awayTeam,
  prediction,
  odds = null,
  valueEdges = null,
  features = null,
  leagueCode = null,
  modelVersion = MODEL_VERSION,
  upsert = false,
}) {
  if (!isDbAvailable()) return null;
  if (!matchExternalId || !prediction?.probabilities) return null;

  try {
    // 1. Resolve external ID → internal fixture ID
    const fixtureId = await resolveFixtureId(matchExternalId);

    // 2. Compute value edges from odds if provided
    let edgeHome = null, edgeDraw = null, edgeAway = null;
    if (valueEdges && Array.isArray(valueEdges)) {
      const findEdge = (outcome) => valueEdges.find(e => e.outcome === outcome)?.valueEdge || null;
      edgeHome = findEdge('Home');
      edgeDraw = findEdge('Draw');
      edgeAway = findEdge('Away');
    }

    // 3. Store prediction. Uniqueness is enforced per (fixture_id, model_version):
    //    - default: first stored prediction wins (insert-only)
    //    - upsert:  REPLACE the row as long as it hasn't been evaluated yet —
    //      this is how the T-60min lock job overrides any earlier snapshot,
    //      so the scored prediction is always the final pre-kickoff one.
    const conflictClause = upsert
      ? `ON CONFLICT (fixture_id, model_version) DO UPDATE SET
           prob_home = EXCLUDED.prob_home, prob_draw = EXCLUDED.prob_draw, prob_away = EXCLUDED.prob_away,
           lambda_home = EXCLUDED.lambda_home, lambda_away = EXCLUDED.lambda_away,
           risk_level = EXCLUDED.risk_level, confidence = EXCLUDED.confidence,
           features = EXCLUDED.features,
           odds_home = EXCLUDED.odds_home, odds_draw = EXCLUDED.odds_draw, odds_away = EXCLUDED.odds_away,
           value_edge_home = EXCLUDED.value_edge_home, value_edge_draw = EXCLUDED.value_edge_draw,
           value_edge_away = EXCLUDED.value_edge_away,
           created_at = NOW()
         WHERE predictions.actual_result IS NULL`
      : 'ON CONFLICT DO NOTHING';

    const result = await safeQuery(
      `INSERT INTO predictions (
        fixture_id, model_version, match_external_id, home_team, away_team,
        prob_home, prob_draw, prob_away,
        lambda_home, lambda_away,
        risk_level, confidence, features,
        odds_home, odds_draw, odds_away,
        value_edge_home, value_edge_draw, value_edge_away,
        league_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ${conflictClause}
      RETURNING id`,
      [
        fixtureId,
        modelVersion,
        matchExternalId,
        homeTeam || 'Unknown',
        awayTeam || 'Unknown',
        prediction.probabilities.home,
        prediction.probabilities.draw,
        prediction.probabilities.away,
        prediction.expectedGoals?.home || null,
        prediction.expectedGoals?.away || null,
        prediction.riskLevel || null,
        // confidence column is FLOAT; computeConfidence() returns an object —
        // passing it raw made the whole INSERT fail silently. Extract the score.
        (typeof prediction.confidence === 'object'
          ? prediction.confidence?.score
          : prediction.confidence) ?? null,
        features ? JSON.stringify(features) : null,
        odds?.home || null,
        odds?.draw || null,
        odds?.away || null,
        edgeHome,
        edgeDraw,
        edgeAway,
        leagueCode || null,
      ]
    );

    const predId = result?.rows?.[0]?.id || null;
    if (predId) {
      console.log(`[PREDICTION] Stored #${predId} for ${matchExternalId} (${homeTeam} vs ${awayTeam})`);

      // 4. Store market-level predictions for feedback loop
      await storeMarketPredictions(predId, prediction, odds);
    }
    return predId;
  } catch (err) {
    console.error('[PREDICTION] Store failed:', err.message, err.stack);
    throw err; // Re-throw so callers can see the actual error
  }
}

/**
 * Retrieve stored predictions with optional filters.
 */
export async function getPredictions({ limit = 50, evaluated = null, matchId = null } = {}) {
  if (!isDbAvailable()) return [];

  let whereClause = '';
  const params = [];

  if (matchId) {
    params.push(matchId);
    whereClause = `WHERE p.match_external_id = $${params.length}`;
  } else if (evaluated === true) {
    whereClause = 'WHERE p.actual_result IS NOT NULL';
  } else if (evaluated === false) {
    whereClause = 'WHERE p.actual_result IS NULL';
  }

  params.push(limit);

  const result = await safeQuery(`
    SELECT p.*,
      f.match_date, f.status as fixture_status,
      f.home_goals as actual_home_goals, f.away_goals as actual_away_goals
    FROM predictions p
    LEFT JOIN fixtures f ON p.fixture_id = f.id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${params.length}
  `, params);

  return result?.rows || [];
}

/**
 * Get prediction for a specific match.
 */
export async function getPredictionByMatch(matchExternalId) {
  if (!isDbAvailable()) return null;

  const result = await safeQuery(
    `SELECT * FROM predictions WHERE match_external_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [matchExternalId]
  );
  return result?.rows?.[0] || null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve external match ID to internal fixture ID.
 * Returns null if fixture not found (prediction still stored with null FK).
 */
async function resolveFixtureId(externalId) {
  if (!externalId) return null;

  const result = await safeQuery(
    'SELECT id FROM fixtures WHERE external_id = $1',
    [externalId]
  );

  return result?.rows?.[0]?.id || null;
}

/**
 * Store market-level predictions for granular feedback analysis.
 * Creates entries in market_predictions for BTTS, O/U, and 1X2 markets.
 */
async function storeMarketPredictions(predictionId, prediction, odds) {
  if (!predictionId || !prediction) return;

  const markets = [];

  // 1X2 markets
  if (prediction.probabilities) {
    markets.push({ type: 'HOME_WIN', prob: prediction.probabilities.home });
    markets.push({ type: 'DRAW', prob: prediction.probabilities.draw });
    markets.push({ type: 'AWAY_WIN', prob: prediction.probabilities.away });
  }

  // Over/Under markets
  if (prediction.overUnder) {
    if (prediction.overUnder.over15) markets.push({ type: 'OVER_15', prob: prediction.overUnder.over15 });
    if (prediction.overUnder.over25) markets.push({ type: 'OVER_25', prob: prediction.overUnder.over25 });
    if (prediction.overUnder.over35) markets.push({ type: 'OVER_35', prob: prediction.overUnder.over35 });
    if (prediction.overUnder.under25) markets.push({ type: 'UNDER_25', prob: prediction.overUnder.under25 });
    if (prediction.overUnder.under35) markets.push({ type: 'UNDER_35', prob: prediction.overUnder.under35 });
  }

  // BTTS markets
  if (prediction.btts) {
    markets.push({ type: 'BTTS_YES', prob: prediction.btts.yes });
    markets.push({ type: 'BTTS_NO', prob: prediction.btts.no });
  }

  // Filter out null probabilities
  const validMarkets = markets.filter(m => m.prob != null);
  if (validMarkets.length === 0) return;

  // Batch insert all markets in one query instead of one-by-one
  const values = [];
  const params = [];
  validMarkets.forEach((market, i) => {
    const offset = i * 3;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    params.push(predictionId, market.type, market.prob);
  });

  await safeQuery(
    `INSERT INTO market_predictions (prediction_id, market_type, predicted_prob)
     VALUES ${values.join(', ')}
     ON CONFLICT (prediction_id, market_type) DO UPDATE
       SET predicted_prob = EXCLUDED.predicted_prob
       WHERE market_predictions.actual_hit IS NULL`,
    params
  );
}

export default {
  storePrediction,
  getPredictions,
  getPredictionByMatch,
};
