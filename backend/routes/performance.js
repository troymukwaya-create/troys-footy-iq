// ─── PERFORMANCE + PREDICTIONS ROUTES ───────────────────────────────
// GET /api/performance            → Rolling model metrics
// GET /api/performance/rolling    → Last N predictions with hit rate
// GET /api/performance/value-bets → Value bet success rate
// GET /api/predictions            → Stored predictions
// GET /api/predictions/:matchId   → Prediction for specific match

import { Router } from 'express';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { getPredictions, getPredictionByMatch } from '../services/predictionService.js';
import { computeLedger, computeShadowLedger } from '../services/ledger.js';
import { fanbrainFlagState } from '../config/fanbrainFlags.js';

const router = Router();

// ─── GET /api/performance/shadow ────────────────────────────────────
// Mission Control for the fan-brain shadow tracks: the flag state, the published
// ledger (pure/blended/market), and each shadow track's Brier in a FAIR head-to-
// head vs the published model over the same fixtures. Empty tracks = flags still
// off or no shadow matches scored yet. Read-only; never affects the scored path.
router.get('/shadow', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: { flags: fanbrainFlagState(), ledger: null, shadow: { tracks: [], n: 0 } } });
    const [ledger, shadow] = await Promise.all([computeLedger(), computeShadowLedger()]);
    res.json({ error: false, data: { flags: fanbrainFlagState(), ledger, shadow } });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

// ─── GET /api/performance ───────────────────────────────────────────
// Returns aggregated model performance: overall + per-run history.
router.get('/', async (req, res) => {
  try {
    if (!isDbAvailable()) {
      return res.json({
        error: false,
        data: { message: 'Database not connected — no performance data available.' },
      });
    }

    // Overall lifetime metrics from model_performance table
    const overall = await safeQuery(`
      SELECT
        COUNT(*)::int as total_predictions,
        COUNT(*) FILTER (WHERE prediction_correct = true)::int as correct,
        ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
        ROUND(AVG(brier_score)::numeric, 4) as avg_brier,
        ROUND(AVG(log_loss)::numeric, 4) as avg_log_loss,
        MIN(created_at) as first_evaluation,
        MAX(created_at) as last_evaluation
      FROM model_performance
    `);

    // Recent model runs (backtests + evaluations)
    const runs = await safeQuery(`
      SELECT model_version, run_type, matches_evaluated, accuracy, brier_score, log_loss, ece, created_at
      FROM model_runs
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Per-league performance breakdown
    const perLeague = await safeQuery(`
      SELECT
        p.home_team, p.away_team,
        mp.actual_outcome,
        mp.prediction_correct,
        COUNT(*) OVER () as total
      FROM model_performance mp
      JOIN predictions p ON mp.prediction_id = p.id
      ORDER BY mp.created_at DESC
      LIMIT 100
    `);

    // Per-model ledger: WC, friendlies and club models are different
    // prediction problems — each keeps its own public track record so no
    // model's results can dilute (or inflate) another's.
    const perModel = await safeQuery(`
      SELECT
        p.model_version,
        COUNT(*)::int as total_predictions,
        COUNT(*) FILTER (WHERE mp.prediction_correct = true)::int as correct,
        ROUND(AVG(CASE WHEN mp.prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
        ROUND(AVG(mp.brier_score)::numeric, 4) as avg_brier,
        ROUND(AVG(mp.log_loss)::numeric, 4) as avg_log_loss,
        MIN(mp.created_at) as first_evaluation,
        MAX(mp.created_at) as last_evaluation
      FROM model_performance mp
      JOIN predictions p ON mp.prediction_id = p.id
      GROUP BY p.model_version
      ORDER BY MAX(mp.created_at) DESC
    `);

    // The two-number ledger (blended vs pure-model vs market-only Brier + CLV).
    // Additive — the existing fields above are untouched. Never fails the route.
    let ledger = null;
    try { ledger = await computeLedger(); }
    catch (e) { console.warn('[performance] ledger compute failed:', e.message); }

    res.json({
      error: false,
      data: {
        overall: overall?.rows?.[0] || null,
        perModel: perModel?.rows || [],
        runs: runs?.rows || [],
        recentPredictions: perLeague?.rows || [],
        ledger,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/performance/rolling ───────────────────────────────────
// Returns rolling accuracy and metrics over last N predictions.
router.get('/rolling', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: [] });

    const n = parseInt(req.query.n) || 50;

    const result = await safeQuery(`
      SELECT
        mp.match_external_id,
        p.home_team, p.away_team,
        mp.predicted_outcome, mp.actual_outcome,
        mp.prediction_correct,
        mp.brier_score, mp.log_loss,
        mp.prob_home, mp.prob_draw, mp.prob_away,
        mp.odds_home, mp.odds_draw, mp.odds_away,
        mp.value_edge_home, mp.value_edge_draw, mp.value_edge_away,
        mp.created_at
      FROM model_performance mp
      JOIN predictions p ON mp.prediction_id = p.id
      ORDER BY mp.created_at DESC
      LIMIT $1
    `, [n]);

    const rows = result?.rows || [];

    // Compute rolling metrics
    const total = rows.length;
    const correct = rows.filter(r => r.prediction_correct).length;
    const avgBrier = total > 0 ? rows.reduce((s, r) => s + (r.brier_score || 0), 0) / total : 0;
    const avgLogLoss = total > 0 ? rows.reduce((s, r) => s + (r.log_loss || 0), 0) / total : 0;

    res.json({
      error: false,
      data: {
        rolling: {
          n: total,
          accuracy: total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
          avgBrier: parseFloat(avgBrier.toFixed(4)),
          avgLogLoss: parseFloat(avgLogLoss.toFixed(4)),
          correct,
          total,
        },
        predictions: rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/performance/value-bets ────────────────────────────────
// Returns value bet success rate for bets where model had an edge.
router.get('/value-bets', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: null });

    // Value bets: where value_edge > 3% on the predicted outcome
    const result = await safeQuery(`
      SELECT
        mp.match_external_id,
        p.home_team, p.away_team,
        mp.predicted_outcome, mp.actual_outcome, mp.prediction_correct,
        mp.odds_home, mp.odds_draw, mp.odds_away,
        mp.value_edge_home, mp.value_edge_draw, mp.value_edge_away,
        mp.prob_home, mp.prob_draw, mp.prob_away,
        mp.created_at
      FROM model_performance mp
      JOIN predictions p ON mp.prediction_id = p.id
      WHERE GREATEST(
        COALESCE(mp.value_edge_home, 0),
        COALESCE(mp.value_edge_draw, 0),
        COALESCE(mp.value_edge_away, 0)
      ) > 3
      ORDER BY mp.created_at DESC
      LIMIT 100
    `);

    const rows = result?.rows || [];
    const total = rows.length;
    const won = rows.filter(r => r.prediction_correct).length;

    // Compute theoretical ROI
    let totalStaked = 0;
    let totalReturn = 0;
    for (const row of rows) {
      const odds = row.predicted_outcome === 'HOME' ? row.odds_home
        : row.predicted_outcome === 'DRAW' ? row.odds_draw
        : row.odds_away;

      if (odds && odds > 0) {
        totalStaked += 1; // Flat 1 unit stake
        if (row.prediction_correct) totalReturn += odds;
      }
    }

    res.json({
      error: false,
      data: {
        valueBets: total,
        won,
        hitRate: total > 0 ? parseFloat(((won / total) * 100).toFixed(1)) : 0,
        roi: totalStaked > 0 ? parseFloat((((totalReturn - totalStaked) / totalStaked) * 100).toFixed(1)) : 0,
        totalStaked,
        totalReturn: parseFloat(totalReturn.toFixed(2)),
        bets: rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/predictions ───────────────────────────────────────────
// Returns stored predictions with probabilities and value edges.
router.get('/predictions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const evaluated = req.query.evaluated === 'true' ? true
      : req.query.evaluated === 'false' ? false : null;

    const predictions = await getPredictions({ limit, evaluated });
    res.json({ error: false, data: predictions, total: predictions.length });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/predictions/:matchId ──────────────────────────────────
// Returns prediction for a specific match.
router.get('/predictions/:matchId', async (req, res) => {
  try {
    const prediction = await getPredictionByMatch(req.params.matchId);
    if (!prediction) {
      return res.json({ error: false, data: null, message: 'No prediction found for this match.' });
    }
    res.json({ error: false, data: prediction });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
