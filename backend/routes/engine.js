// ─── ENGINE API ROUTES ──────────────────────────────────────────────
// REST endpoints exposing the hybrid prediction engine.
// Provides pre-match predictions, in-play state management,
// and model backtesting/evaluation endpoints.

import { Router } from 'express';
import {
  predictPreMatch,
  predictStatic,
  predictInPlay,
  registerMatch,
  processEvent,
  getMatchState,
  unregisterMatch,
  getActiveMatches,
} from '../engine/inferenceEngine.js';
import { evaluatePredictions } from '../engine/backtester.js';
import { deriveMatchContext, serializeState } from '../engine/matchState.js';
import cache from '../services/cache.js';

const router = Router();

// ─── PRE-MATCH PREDICTION ──────────────────────────────────────────
// POST /api/engine/predict
// Body: { homeStats, awayStats, options? }
router.post('/predict', (req, res) => {
  try {
    const { homeStats, awayStats, options } = req.body;
    const result = predictStatic(homeStats || {}, awayStats || {}, options);
    res.json({ error: false, data: result });
  } catch (err) {
    console.error('[ENGINE] Prediction error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── BATCH PREDICTION ──────────────────────────────────────────────
// POST /api/engine/predict-batch
// Body: { fixtures: [{ id, homeStats, awayStats }] }
router.post('/predict-batch', (req, res) => {
  try {
    const { fixtures } = req.body;
    if (!Array.isArray(fixtures)) {
      return res.status(400).json({ error: true, message: 'fixtures must be an array' });
    }

    const results = fixtures.map(f => {
      try {
        const prediction = predictStatic(f.homeStats || {}, f.awayStats || {});
        return { id: f.id, ...prediction };
      } catch {
        return { id: f.id, error: 'prediction_failed' };
      }
    });

    res.json({
      error: false,
      data: results,
      meta: { total: results.length, model: 'hybrid-dixon-coles-v2' },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: REGISTER MATCH ──────────────────────────────────────
// POST /api/engine/live/register
// Body: { matchId, preMatchContext: { lambdaHome, lambdaAway, homeStats, awayStats } }
router.post('/live/register', (req, res) => {
  try {
    const { matchId, preMatchContext } = req.body;
    if (!matchId) return res.status(400).json({ error: true, message: 'matchId required' });

    const state = registerMatch(matchId, preMatchContext || {});
    res.json({ error: false, data: { matchId, registered: true, version: state.version } });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: PROCESS EVENT ───────────────────────────────────────
// POST /api/engine/live/event
// Body: { matchId, event: { event_type, minute, team, details } }
router.post('/live/event', (req, res) => {
  try {
    const { matchId, event } = req.body;
    if (!matchId || !event) {
      return res.status(400).json({ error: true, message: 'matchId and event required' });
    }

    const prediction = processEvent(matchId, event);
    if (!prediction) {
      return res.status(404).json({ error: true, message: 'Match not registered' });
    }

    res.json({ error: false, data: prediction });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: GET PREDICTION ──────────────────────────────────────
// GET /api/engine/live/:matchId
router.get('/live/:matchId', (req, res) => {
  try {
    const prediction = predictInPlay(req.params.matchId);
    if (!prediction) {
      return res.status(404).json({ error: true, message: 'Match not found or not live' });
    }
    res.json({ error: false, data: prediction });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: GET STATE ───────────────────────────────────────────
// GET /api/engine/live/:matchId/state
router.get('/live/:matchId/state', (req, res) => {
  try {
    const state = getMatchState(req.params.matchId);
    if (!state) {
      return res.status(404).json({ error: true, message: 'Match not found' });
    }
    res.json({
      error: false,
      data: {
        state: serializeState(state),
        context: deriveMatchContext(state),
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: UNREGISTER ─────────────────────────────────────────
// DELETE /api/engine/live/:matchId
router.delete('/live/:matchId', (req, res) => {
  unregisterMatch(req.params.matchId);
  res.json({ error: false, data: { unregistered: true } });
});

// ─── ACTIVE MATCHES ───────────────────────────────────────────────
// GET /api/engine/live
router.get('/live', (_req, res) => {
  res.json({ error: false, data: getActiveMatches() });
});

// ─── BACKTESTING ──────────────────────────────────────────────────
// POST /api/engine/backtest
// Body: { matches: [{ homeStats, awayStats, score, winner }] }
router.post('/backtest', (req, res) => {
  try {
    const { matches } = req.body;
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: true, message: 'matches array required' });
    }

    const cacheKey = `backtest_${matches.length}_${Date.now()}`;
    const result = evaluatePredictions(matches);

    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── ENGINE HEALTH ────────────────────────────────────────────────
// GET /api/engine/health
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    model: 'hybrid-dixon-coles-v2',
    layers: ['poisson_baseline', 'feature_engineering', 'residual_correction'],
    activeMatches: getActiveMatches().length,
    capabilities: ['pre_match', 'in_play', 'batch', 'backtest'],
  });
});

export default router;
