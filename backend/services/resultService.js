// ─── RESULT INGESTION + FEEDBACK LOOP ───────────────────────────────
// Fetches final scores for completed matches, updates the fixtures table,
// fills in prediction.actual_result, and computes per-match metrics.
// This is the core feedback loop that enables continuous model evaluation.

import { query, safeQuery, isDbAvailable } from '../db/index.js';
import * as fd from './footballdata.js';
import apisports from './apisports.js';
import { gradeRow } from '../engine/grading.js';

const MODEL_VERSION = 'hybrid-dc-v2';

/**
 * The 1X2 outcome a prediction is scored against — ALWAYS the 90-minute
 * (regulation) result. 1X2 / O-U / BTTS are 90-minute markets; a knockout
 * decided in extra time must still score on the 90' score (a 1-1 that ends
 * 2-1 in ET is a DRAW for 1X2). ft_* hold the 90' score (API-Football
 * `score.fulltime` / football-data `regularTime`); we fall back to the final
 * score only for fixtures ingested before the ft_* columns existed.
 * P(advance) is a SEPARATE market (features.advance) and never scored here.
 *
 * Mirrors the SQL CASE in ingestResults — exported so the contract is tested.
 */
export function outcome90(ftHome, ftAway, finalHome = null, finalAway = null) {
  const h = ftHome != null ? Number(ftHome) : (finalHome != null ? Number(finalHome) : null);
  const a = ftAway != null ? Number(ftAway) : (finalAway != null ? Number(finalAway) : null);
  if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return 'HOME';
  if (h === a) return 'DRAW';
  return 'AWAY';
}

/**
 * Ingest results for recently finished matches.
 * Pipeline:
 *   1. Fetch finished matches from football-data.org (last N days)
 *   2. Upsert final scores into fixtures table
 *   3. Fill predictions.actual_result for matched predictions
 *   4. Compute per-match metrics (log loss, brier, correctness)
 *   5. Store in model_performance table
 *   6. Aggregate into model_runs summary
 *
 * @param {number} lookbackDays - How many days back to check (default 3)
 * @returns {Object} { updated, evaluated, metrics }
 */
export async function ingestResults(lookbackDays = 3) {
  if (!isDbAvailable()) {
    return { error: 'Database not available', updated: 0, evaluated: 0 };
  }

  console.log(`[RESULTS] Ingesting finished matches from last ${lookbackDays} days...`);

  // ─── Step 1: Fetch finished matches (football-data.org + API-Football) ──
  // The World Cup and other API-Football competitions carry apf_ external IDs
  // and are NOT in football-data.org's feed, so we must pull finished matches
  // from BOTH sources — otherwise those predictions (the entire World Cup
  // included) never get a final score and never enter model_performance.
  let finishedMatches = [];

  try {
    const today = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - lookbackDays * 86400000).toISOString().split('T')[0];
    const response = await fd.client.get('matches', {
      params: {
        competitions: fd.LEAGUE_CODES.join(','),
        dateFrom: past,
        dateTo: today,
        status: 'FINISHED',
      },
    });
    finishedMatches = (response.data.matches || []).map(fd.normalise);
  } catch (err) {
    console.error('[RESULTS] football-data.org finished fetch failed:', err.message);
  }

  // World Cup + other API-Football competitions (apf_ IDs).
  try {
    const apfFinished = await apisports.getRecentFixtures(lookbackDays);
    finishedMatches = [...finishedMatches, ...apfFinished];
  } catch (err) {
    console.error('[RESULTS] API-Football finished fetch failed:', err.message);
  }

  if (finishedMatches.length === 0) {
    console.log('[RESULTS] No finished matches found.');
    return { updated: 0, evaluated: 0 };
  }

  console.log(`[RESULTS] Found ${finishedMatches.length} finished matches.`);

  // ─── Step 2: Update fixtures with final scores ────────────────
  // home_goals/away_goals = FINAL score (display: includes extra time).
  // ft_home_goals/ft_away_goals = 90-MINUTE score — what 1X2 / O-U / BTTS
  // markets settle on. Both sources expose it as match.fullTime; matches
  // decided in extra time were previously scored against the wrong market.
  let updated = 0;
  for (const match of finishedMatches) {
    if (match.score?.home == null || match.score?.away == null) continue;

    const ft90Home = match.fullTime?.home ?? match.score.home;
    const ft90Away = match.fullTime?.away ?? match.score.away;

    const result = await safeQuery(
      `UPDATE fixtures SET
        status = 'FINISHED',
        home_goals = $1,
        away_goals = $2,
        ft_home_goals = $3,
        ft_away_goals = $4
      WHERE external_id = $5 AND (status != 'FINISHED' OR home_goals IS NULL OR ft_home_goals IS NULL)
      RETURNING id`,
      [match.score.home, match.score.away, ft90Home, ft90Away, match.id]
    );

    if (result?.rows?.[0]) updated++;
  }
  console.log(`[RESULTS] Updated ${updated} fixture scores.`);

  // ─── Step 3: Fill predictions.actual_result ───────────────────
  // Scored on the 90-minute result (ft_*), falling back to the final score
  // for fixtures ingested before the ft columns existed.
  const evalResult = await safeQuery(`
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
    RETURNING p.id, p.match_external_id, p.fixture_id,
      p.prob_home, p.prob_draw, p.prob_away,
      p.odds_home, p.odds_draw, p.odds_away,
      p.value_edge_home, p.value_edge_draw, p.value_edge_away,
      p.actual_result, p.home_team, p.away_team, p.model_version
  `);

  const allEvaluated = evalResult?.rows || [];
  // Fan-brain shadow rows DID get actual_result above (the shadow ledger reads
  // predictions directly), but they MUST NOT enter model_performance/model_runs
  // — the PUBLIC Brier aggregates that table with no model filter, so a shadow
  // track would corrupt the published honesty number. Keep them out here, at the
  // single choke point, so every current and future public surface stays clean.
  const newlyEvaluated = allEvaluated.filter(r => !/-shadow$/i.test(r.model_version || ''));
  const shadowExcluded = allEvaluated.length - newlyEvaluated.length;
  console.log(`[RESULTS] Evaluated ${newlyEvaluated.length} predictions${shadowExcluded ? ` (+${shadowExcluded} shadow rows scored privately, kept out of public metrics)` : ''}.`);

  if (newlyEvaluated.length === 0) {
    return { updated, evaluated: 0, shadowEvaluated: shadowExcluded };
  }

  // ─── Step 4: Compute per-match metrics ────────────────────────
  let totalBrier = 0;
  let totalLogLoss = 0;
  let correct = 0;
  const perfRows = [];

  for (const pred of newlyEvaluated) {
    const metrics = computeMatchMetrics(pred);
    if (!metrics) continue;

    totalBrier += metrics.brierScore;
    totalLogLoss += metrics.logLoss;
    if (metrics.correct) correct++;

    perfRows.push({
      predictionId: pred.id,
      matchExternalId: pred.match_external_id,
      fixtureId: pred.fixture_id,
      ...metrics,
      probHome: pred.prob_home,
      probDraw: pred.prob_draw,
      probAway: pred.prob_away,
      oddsHome: pred.odds_home,
      oddsDraw: pred.odds_draw,
      oddsAway: pred.odds_away,
      valueEdgeHome: pred.value_edge_home,
      valueEdgeDraw: pred.value_edge_draw,
      valueEdgeAway: pred.value_edge_away,
    });
  }

  // ─── Step 5: Store in model_performance ───────────────────────
  for (const row of perfRows) {
    await safeQuery(
      `INSERT INTO model_performance (
        prediction_id, match_external_id, fixture_id,
        log_loss, brier_score, prediction_correct,
        predicted_outcome, actual_outcome,
        prob_home, prob_draw, prob_away,
        odds_home, odds_draw, odds_away,
        value_edge_home, value_edge_draw, value_edge_away
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT DO NOTHING`,
      [
        row.predictionId, row.matchExternalId, row.fixtureId,
        row.logLoss, row.brierScore, row.correct,
        row.predicted, row.actual,
        row.probHome, row.probDraw, row.probAway,
        row.oddsHome, row.oddsDraw, row.oddsAway,
        row.valueEdgeHome, row.valueEdgeDraw, row.valueEdgeAway,
      ]
    );
  }

  // ─── Step 6: Store model_runs summary ─────────────────────────
  const n = perfRows.length;
  if (n > 0) {
    const metrics = {
      evaluated: n,
      accuracy: parseFloat(((correct / n) * 100).toFixed(1)),
      avgBrierScore: parseFloat((totalBrier / n).toFixed(4)),
      avgLogLoss: parseFloat((totalLogLoss / n).toFixed(4)),
    };

    await safeQuery(
      `INSERT INTO model_runs (model_version, run_type, matches_evaluated, accuracy, brier_score, log_loss, details)
       VALUES ($1, 'result_ingest', $2, $3, $4, $5, $6)`,
      [MODEL_VERSION, n, metrics.accuracy, metrics.avgBrierScore, metrics.avgLogLoss, JSON.stringify(metrics)]
    );

    console.log(`[RESULTS] Metrics: accuracy=${metrics.accuracy}%, brier=${metrics.avgBrierScore}, logLoss=${metrics.avgLogLoss}`);

    // ─── Step 7: Evaluate market-level predictions ──────────────
    const marketEvalCount = await evaluateMarketPredictions();
    console.log(`[RESULTS] Evaluated ${marketEvalCount} market predictions.`);

    return { updated, evaluated: n, metrics, marketEvaluated: marketEvalCount };
  }

  return { updated, evaluated: 0 };
}

/**
 * Get recently completed matches with predictions comparison.
 */
export async function getRecentResults(limit = 20) {
  if (!isDbAvailable()) return [];

  const result = await safeQuery(`
    SELECT
      mp.match_external_id,
      mp.predicted_outcome,
      mp.actual_outcome,
      mp.prediction_correct,
      mp.log_loss,
      mp.brier_score,
      mp.prob_home, mp.prob_draw, mp.prob_away,
      mp.odds_home, mp.odds_draw, mp.odds_away,
      mp.value_edge_home, mp.value_edge_draw, mp.value_edge_away,
      p.home_team, p.away_team, p.risk_level, p.model_version,
      f.home_goals, f.away_goals, f.ft_home_goals, f.ft_away_goals,
      f.match_date
    FROM model_performance mp
    JOIN predictions p ON mp.prediction_id = p.id
    LEFT JOIN fixtures f ON mp.fixture_id = f.id
    ORDER BY mp.created_at DESC
    LIMIT $1
  `, [limit]);

  // Attach the graded verdict so every consumer (CEO ledger, social cards)
  // renders the same honest grade instead of the crude prediction_correct
  // binary. Outcome-only here (scoreline lives on the analysis verdict);
  // prediction_correct is preserved for back-compat and aggregate accuracy.
  return (result?.rows || []).map((row) => ({ ...row, grade: gradeRow(row) }));
}

// ─── Metrics Computation ────────────────────────────────────────────

/**
 * Compute log loss, brier score, and correctness for a single prediction.
 */
function computeMatchMetrics(pred) {
  const pH = (pred.prob_home || 33.3) / 100;
  const pD = (pred.prob_draw || 33.3) / 100;
  const pA = (pred.prob_away || 33.3) / 100;

  const actual = pred.actual_result;
  if (!actual) return null;

  const yH = actual === 'HOME' ? 1 : 0;
  const yD = actual === 'DRAW' ? 1 : 0;
  const yA = actual === 'AWAY' ? 1 : 0;

  // Brier Score: (1/3) * Σ(p_i - y_i)²
  const brierScore = (Math.pow(pH - yH, 2) + Math.pow(pD - yD, 2) + Math.pow(pA - yA, 2)) / 3;

  // Log Loss: -Σ y_i * log(p_i)
  const eps = 1e-10;
  const logLoss = -(yH * Math.log(Math.max(pH, eps)) + yD * Math.log(Math.max(pD, eps)) + yA * Math.log(Math.max(pA, eps)));

  // Predicted outcome (argmax)
  const predicted = pH >= pD && pH >= pA ? 'HOME' : pD >= pH && pD >= pA ? 'DRAW' : 'AWAY';
  const correct = predicted === actual;

  return {
    brierScore: parseFloat(brierScore.toFixed(4)),
    logLoss: parseFloat(logLoss.toFixed(4)),
    correct,
    predicted,
    actual,
  };
}

/**
 * Evaluate market-level predictions (BTTS, O/U, etc.) against actual results.
 * Updates market_predictions.actual_hit for each market.
 *
 * @returns {number} Number of market predictions evaluated
 */
async function evaluateMarketPredictions() {
  if (!isDbAvailable()) return 0;

  try {
    // Get unevaluated market predictions where the match has finished
    const result = await safeQuery(`
      SELECT
        mp_m.id as market_pred_id,
        mp_m.market_type,
        mp_m.predicted_prob,
        COALESCE(f.ft_home_goals, f.home_goals) as home_goals,
        COALESCE(f.ft_away_goals, f.away_goals) as away_goals
      FROM market_predictions mp_m
      JOIN predictions p ON mp_m.prediction_id = p.id
      JOIN fixtures f ON p.fixture_id = f.id
      WHERE mp_m.actual_hit IS NULL
        AND f.status = 'FINISHED'
        AND f.home_goals IS NOT NULL
        AND f.away_goals IS NOT NULL
      LIMIT 500
    `);

    const rows = result?.rows || [];
    if (rows.length === 0) return 0;

    let evaluated = 0;

    for (const row of rows) {
      const hit = evaluateMarketOutcome(row.market_type, row.home_goals, row.away_goals);
      if (hit === null) continue; // Unknown market type

      await safeQuery(
        `UPDATE market_predictions SET actual_hit = $1 WHERE id = $2`,
        [hit, row.market_pred_id]
      );
      evaluated++;
    }

    return evaluated;
  } catch (err) {
    console.error('[RESULTS] Market evaluation failed:', err.message);
    return 0;
  }
}

/**
 * Determine if a specific market outcome was a hit.
 */
function evaluateMarketOutcome(marketType, homeGoals, awayGoals) {
  const totalGoals = homeGoals + awayGoals;

  switch (marketType) {
    case 'HOME_WIN':   return homeGoals > awayGoals;
    case 'DRAW':       return homeGoals === awayGoals;
    case 'AWAY_WIN':   return homeGoals < awayGoals;
    case 'OVER_15':    return totalGoals > 1.5;
    case 'OVER_25':    return totalGoals > 2.5;
    case 'OVER_35':    return totalGoals > 3.5;
    case 'UNDER_25':   return totalGoals < 2.5;
    case 'UNDER_35':   return totalGoals < 3.5;
    case 'BTTS_YES':   return homeGoals > 0 && awayGoals > 0;
    case 'BTTS_NO':    return homeGoals === 0 || awayGoals === 0;
    default:           return null;
  }
}

export default {
  ingestResults,
  getRecentResults,
  evaluateMarketPredictions,
};
