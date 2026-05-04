// ─── VERIFICATION & MONITORING ROUTES ───────────────────────────────
// Operational endpoints for confirming every pipeline stage works.
// Used for deployment validation, production monitoring, and debugging.
//
// Verification endpoints: confirm data is flowing correctly
// Monitor endpoints: system health and alerts

import { Router } from 'express';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { getActiveVersion, listVersions } from '../engine/modelVersioning.js';
import { getModelMaturity } from '../engine/trustSignals.js';
import { runHealthCheck, getRecentAlerts, acknowledgeAlert } from '../services/monitor.js';

const router = Router();

// ─── GET /api/verify/predictions ────────────────────────────────────
// Confirms predictions are being logged correctly.
router.get('/predictions', async (_req, res) => {
  try {
    if (!isDbAvailable()) {
      return res.json({ status: 'NO_DB', data: null });
    }

    const result = await safeQuery(`
      SELECT id, match_external_id, home_team, away_team,
        prob_home, prob_draw, prob_away, risk_level, confidence,
        league_code, model_version, created_at
      FROM predictions
      ORDER BY created_at DESC LIMIT 5
    `);

    const countResult = await safeQuery(`
      SELECT
        COUNT(*)::int as total,
        COUNT(actual_result)::int as evaluated,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int as last_24h
      FROM predictions
    `);

    res.json({
      status: 'OK',
      latest: result?.rows || [],
      stats: countResult?.rows?.[0] || { total: 0, evaluated: 0, last_24h: 0 },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/results ────────────────────────────────────────
// Confirms results are updating properly.
router.get('/results', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ status: 'NO_DB', data: null });

    const result = await safeQuery(`
      SELECT mp.id, mp.prediction_id, mp.actual_outcome, mp.predicted_outcome,
        mp.prediction_correct, mp.brier_score, mp.log_loss, mp.created_at
      FROM model_performance mp
      ORDER BY mp.created_at DESC LIMIT 5
    `);

    const marketResult = await safeQuery(`
      SELECT COUNT(*)::int as total,
        COUNT(actual_hit)::int as evaluated,
        ROUND(AVG(CASE WHEN actual_hit THEN 100.0 ELSE 0 END)::numeric, 1) as hit_rate
      FROM market_predictions
    `);

    res.json({
      status: 'OK',
      latestEvaluations: result?.rows || [],
      marketPredictions: marketResult?.rows?.[0] || { total: 0, evaluated: 0, hit_rate: null },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/metrics ────────────────────────────────────────
// Current accuracy, Brier, LogLoss with sample sizes.
router.get('/metrics', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ status: 'NO_DB', data: null });

    const result = await safeQuery(`
      SELECT
        COUNT(*)::int as total_evaluated,
        ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
        ROUND(AVG(brier_score)::numeric, 4) as avg_brier,
        ROUND(AVG(log_loss)::numeric, 4) as avg_log_loss,
        ROUND(STDDEV(brier_score)::numeric, 4) as brier_stddev,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM model_performance
    `);

    // Per-outcome accuracy
    const outcomeResult = await safeQuery(`
      SELECT
        actual_outcome,
        COUNT(*)::int as n,
        ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy
      FROM model_performance
      WHERE actual_outcome IS NOT NULL
      GROUP BY actual_outcome
    `);

    res.json({
      status: 'OK',
      overall: result?.rows?.[0] || {},
      byOutcome: outcomeResult?.rows || [],
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/optimizer ──────────────────────────────────────
// Last optimization run result + current weights.
router.get('/optimizer', async (_req, res) => {
  try {
    const version = await getActiveVersion();

    let lastRun = null;
    if (isDbAvailable()) {
      const result = await safeQuery(`
        SELECT run_type, matches_evaluated, accuracy, brier_score, log_loss, details, created_at
        FROM model_runs
        WHERE run_type IN ('optimization', 'result_ingest')
        ORDER BY created_at DESC LIMIT 1
      `);
      lastRun = result?.rows?.[0] || null;
    }

    res.json({
      status: 'OK',
      activeVersion: version.version,
      weights: version.weights,
      config: version.config,
      hasMetrics: !!version.metrics,
      metrics: version.metrics,
      lastRun,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/versions ───────────────────────────────────────
// Model version history with active indicator.
router.get('/versions', async (_req, res) => {
  try {
    const versions = await listVersions(10);
    res.json({ status: 'OK', versions });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/calibration ────────────────────────────────────
// Current calibration quality.
router.get('/calibration', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ status: 'NO_DB', data: null });

    // Compute calibration bins from historical data
    const result = await safeQuery(`
      SELECT
        CASE
          WHEN prob_home >= 60 THEN '60-100'
          WHEN prob_home >= 45 THEN '45-60'
          WHEN prob_home >= 30 THEN '30-45'
          ELSE '0-30'
        END as prob_range,
        COUNT(*)::int as n,
        ROUND(AVG(CASE WHEN actual_result = 'HOME' THEN 100.0 ELSE 0 END)::numeric, 1) as actual_rate,
        ROUND(AVG(prob_home)::numeric, 1) as avg_predicted
      FROM predictions
      WHERE actual_result IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    const version = await getActiveVersion();

    res.json({
      status: 'OK',
      calibrationBins: result?.rows || [],
      hasStoredCurves: !!version.calibrationCurves,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/verify/pipeline ───────────────────────────────────────
// Status of all pipeline stages.
router.get('/pipeline', async (_req, res) => {
  try {
    const maturity = await getModelMaturity();
    const version = await getActiveVersion();

    const pipeline = {
      maturity,
      activeModel: version.version,
      stages: {},
    };

    if (isDbAvailable()) {
      // Ingestion stage
      const fixtureResult = await safeQuery(
        `SELECT COUNT(*)::int as n, MAX(updated_at) as latest FROM fixtures`
      );
      pipeline.stages.ingestion = {
        status: fixtureResult?.rows?.[0]?.n > 0 ? 'ACTIVE' : 'INACTIVE',
        fixtures: fixtureResult?.rows?.[0]?.n || 0,
        lastUpdate: fixtureResult?.rows?.[0]?.latest,
      };

      // Prediction stage
      const predResult = await safeQuery(
        `SELECT COUNT(*)::int as n, MAX(created_at) as latest FROM predictions`
      );
      pipeline.stages.prediction = {
        status: predResult?.rows?.[0]?.n > 0 ? 'ACTIVE' : 'INACTIVE',
        total: predResult?.rows?.[0]?.n || 0,
        lastPrediction: predResult?.rows?.[0]?.latest,
      };

      // Evaluation stage
      const evalResult = await safeQuery(
        `SELECT COUNT(*)::int as n, MAX(created_at) as latest FROM model_performance`
      );
      pipeline.stages.evaluation = {
        status: evalResult?.rows?.[0]?.n > 0 ? 'ACTIVE' : 'INACTIVE',
        total: evalResult?.rows?.[0]?.n || 0,
        lastEvaluation: evalResult?.rows?.[0]?.latest,
      };

      // Feedback stage
      const feedbackResult = await safeQuery(
        `SELECT COUNT(*)::int as n, MAX(created_at) as latest FROM feedback_aggregates`
      );
      pipeline.stages.feedback = {
        status: feedbackResult?.rows?.[0]?.n > 0 ? 'ACTIVE' : 'PENDING',
        aggregates: feedbackResult?.rows?.[0]?.n || 0,
        lastComputed: feedbackResult?.rows?.[0]?.latest,
      };

      // Optimization stage
      const optResult = await safeQuery(
        `SELECT COUNT(*)::int as n FROM model_versions WHERE version != 'v1.0'`
      );
      pipeline.stages.optimization = {
        status: optResult?.rows?.[0]?.n > 0 ? 'ACTIVE' : 'PENDING',
        versionsCreated: optResult?.rows?.[0]?.n || 0,
        enabled: maturity.useOptimization,
      };
    }

    res.json({ status: 'OK', pipeline });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/monitor/health ────────────────────────────────────────
// Comprehensive system health check.
router.get('/health', async (_req, res) => {
  try {
    const health = await runHealthCheck();
    const statusCode = health.status === 'CRITICAL' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── GET /api/monitor/alerts ────────────────────────────────────────
// Recent system alerts.
router.get('/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const unacknowledgedOnly = req.query.unacknowledged === 'true';
    const alerts = await getRecentAlerts(limit, unacknowledgedOnly);
    res.json({ status: 'OK', alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// ─── POST /api/monitor/alerts/:id/acknowledge ───────────────────────
router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const result = await acknowledgeAlert(parseInt(req.params.id));
    res.json({ status: result ? 'OK' : 'NOT_FOUND' });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

export default router;
