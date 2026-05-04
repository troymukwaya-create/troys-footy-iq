// ─── FEEDBACK + MODEL MANAGEMENT ROUTES ─────────────────────────────
// GET  /api/feedback/biases          → Detected prediction biases
// GET  /api/feedback/aggregates      → Full feedback aggregates
// GET  /api/feedback/corrections     → Active bias correction factors
// GET  /api/model/versions           → All model versions with metrics
// GET  /api/model/versions/:a/:b     → Compare two versions
// GET  /api/model/active             → Current active model configuration
// GET  /api/model/insights           → Latest AI-generated insights
// POST /api/model/optimize           → Trigger manual weight optimization
// POST /api/model/feedback/compute   → Trigger manual feedback computation

import { Router } from 'express';
import { isDbAvailable } from '../db/index.js';
import {
  computeFeedbackAggregates,
  getStoredAggregates,
  getActiveCorrectionFactors,
  detectBiases,
} from '../engine/feedbackEngine.js';
import {
  getActiveVersion,
  listVersions,
  compareVersions,
} from '../engine/modelVersioning.js';
import { optimizeWeights } from '../engine/weightOptimizer.js';
import { generateModelInsights, getLatestInsights } from '../services/modelAnalyst.js';

const router = Router();

// ─── GET /api/feedback/biases ───────────────────────────────────────
// Returns detected systematic biases in predictions.
router.get('/biases', async (_req, res) => {
  try {
    if (!isDbAvailable()) {
      return res.json({ error: false, data: { biases: [], message: 'Database not connected' } });
    }

    const aggregates = await getStoredAggregates();
    const biases = detectBiases(aggregates.map(a => ({
      dimension: a.dimension,
      dimensionValue: a.dimension_value,
      sampleSize: a.sample_size,
      avgPredictedProb: a.avg_predicted_prob,
      actualHitRate: a.actual_hit_rate,
      bias: a.bias,
      brierScore: a.brier_score,
      logLoss: a.log_loss,
    })));

    res.json({
      error: false,
      data: {
        biases,
        totalAggregates: aggregates.length,
        significantBiases: biases.length,
        worstBias: biases[0] || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/feedback/aggregates ───────────────────────────────────
// Returns full feedback aggregates grouped by dimension.
router.get('/aggregates', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: [] });

    const version = req.query.version || null;
    const aggregates = await getStoredAggregates(version);

    // Group by dimension
    const grouped = {};
    for (const agg of aggregates) {
      if (!grouped[agg.dimension]) grouped[agg.dimension] = [];
      grouped[agg.dimension].push(agg);
    }

    res.json({ error: false, data: { aggregates: grouped, total: aggregates.length } });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/feedback/corrections ──────────────────────────────────
// Returns active bias correction factors.
router.get('/corrections', async (_req, res) => {
  try {
    const corrections = await getActiveCorrectionFactors();
    res.json({ error: false, data: corrections });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/model/versions ────────────────────────────────────────
// Returns all model versions with their metrics.
router.get('/versions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const versions = await listVersions(limit);
    res.json({ error: false, data: versions });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/model/versions/:a/:b ─────────────────────────────────
// Compare two model versions side-by-side.
router.get('/versions/:a/:b', async (req, res) => {
  try {
    const comparison = await compareVersions(req.params.a, req.params.b);
    if (!comparison) {
      return res.json({ error: false, data: null, message: 'One or both versions not found' });
    }
    res.json({ error: false, data: comparison });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/model/active ──────────────────────────────────────────
// Returns the current active model configuration.
router.get('/active', async (_req, res) => {
  try {
    const version = await getActiveVersion();
    res.json({
      error: false,
      data: {
        version: version.version,
        weights: version.weights,
        config: version.config,
        metrics: version.metrics,
        promotedAt: version.promotedAt,
        hasBiasCorrections: !!version.biasCorrections,
        hasCalibrationCurves: !!version.calibrationCurves,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api/model/insights ────────────────────────────────────────
// Returns the latest AI-generated insights about model performance.
router.get('/insights', async (_req, res) => {
  try {
    const insights = await getLatestInsights();
    res.json({ error: false, data: insights });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── POST /api/model/optimize ───────────────────────────────────────
// Manually trigger weight optimization. Normally runs weekly via scheduler.
router.post('/optimize', async (_req, res) => {
  try {
    console.log('[API] Manual weight optimization triggered');
    const result = await optimizeWeights();
    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── POST /api/model/feedback/compute ───────────────────────────────
// Manually trigger feedback aggregate computation.
router.post('/feedback/compute', async (_req, res) => {
  try {
    console.log('[API] Manual feedback computation triggered');
    const result = await computeFeedbackAggregates();
    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── POST /api/model/insights/generate ──────────────────────────────
// Manually trigger AI insight generation.
router.post('/insights/generate', async (_req, res) => {
  try {
    console.log('[API] Manual AI insight generation triggered');
    const result = await generateModelInsights();
    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
