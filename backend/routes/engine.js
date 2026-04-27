// ─── ENGINE API ROUTES ──────────────────────────────────────────────
// REST endpoints exposing the hybrid prediction engine.
// Provides pre-match predictions, in-play state management,
// replay simulation, monitoring, and model evaluation endpoints.

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
import { replayMatches, deriveTeamStats } from '../engine/replaySimulator.js';
import calibrationTracker from '../engine/calibrationTracker.js';
import { deriveMatchContext, serializeState } from '../engine/matchState.js';
import cache from '../services/cache.js';
import * as fd from '../services/footballdata.js';

const router = Router();

// ─── PRE-MATCH PREDICTION ──────────────────────────────────────────
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
    res.json({ error: false, data: results, meta: { total: results.length, model: 'hybrid-dixon-coles-v2' } });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: REGISTER MATCH ──────────────────────────────────────
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
router.get('/live/:matchId/state', (req, res) => {
  try {
    const state = getMatchState(req.params.matchId);
    if (!state) return res.status(404).json({ error: true, message: 'Match not found' });
    res.json({
      error: false,
      data: { state: serializeState(state), context: deriveMatchContext(state) },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── IN-PLAY: UNREGISTER ─────────────────────────────────────────
router.delete('/live/:matchId', (req, res) => {
  unregisterMatch(req.params.matchId);
  res.json({ error: false, data: { unregistered: true } });
});

// ─── ACTIVE MATCHES ───────────────────────────────────────────────
router.get('/live', (_req, res) => {
  res.json({ error: false, data: getActiveMatches() });
});

// ─── REPLAY SIMULATION (Phase 2) ─────────────────────────────────
// GET /api/engine/replay — runs the full replay against live fixture data
router.get('/replay', async (req, res) => {
  try {
    // Check cache first (replay is expensive)
    const cached = cache.get('replay_results');
    if (cached) return res.json({ error: false, data: cached, source: 'cache' });

    // Fetch completed fixtures from the API
    const fixtures = await fetchCompletedFixtures();
    if (!fixtures || fixtures.length < 5) {
      return res.json({ error: true, message: 'Insufficient fixtures for replay', count: fixtures?.length || 0 });
    }

    console.log(`[ENGINE/REPLAY] Running replay on ${fixtures.length} completed fixtures...`);
    const startTime = Date.now();
    const result = replayMatches(fixtures);
    const elapsed = Date.now() - startTime;

    result.replayMetadata = {
      fixturesReplayed: fixtures.length,
      executionTimeMs: elapsed,
      source: 'footballdata',
    };

    // Record in calibration tracker
    calibrationTracker.record(result);

    // Cache for 30 minutes
    cache.set('replay_results', result, 1800);

    console.log(`[ENGINE/REPLAY] Complete in ${elapsed}ms — Accuracy: ${result.summary?.accuracy}%, Brier: ${result.summary?.avgBrierScore}`);
    res.json({ error: false, data: result, source: 'fresh' });
  } catch (err) {
    console.error('[ENGINE/REPLAY] Error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── BACKTESTING (manual) ─────────────────────────────────────────
router.post('/backtest', (req, res) => {
  try {
    const { matches } = req.body;
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: true, message: 'matches array required' });
    }
    const result = evaluatePredictions(matches);
    calibrationTracker.record(result);
    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── TEAM STATS (Phase 2) ─────────────────────────────────────────
// GET /api/engine/team-stats — derived stats from fixture pool
router.get('/team-stats', async (req, res) => {
  try {
    const cached = cache.get('derived_team_stats');
    if (cached) return res.json({ error: false, data: cached, source: 'cache' });

    const fixtures = await fetchCompletedFixtures();
    const statsMap = deriveTeamStats(fixtures);

    const stats = {};
    for (const [name, s] of statsMap.entries()) {
      stats[name] = s;
    }

    cache.set('derived_team_stats', stats, 3600); // cache 1 hour
    res.json({ error: false, data: stats, totalTeams: Object.keys(stats).length });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── MONITORING DASHBOARD (Phase 2) ──────────────────────────────
// GET /api/engine/monitor — full model health dashboard
router.get('/monitor', (_req, res) => {
  res.json({ error: false, data: calibrationTracker.getDashboard() });
});

// GET /api/engine/monitor/health — concise health check
router.get('/monitor/health', (_req, res) => {
  res.json({ error: false, data: calibrationTracker.getHealth() });
});

// ─── ENGINE HEALTH ────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  const modelHealth = calibrationTracker.getHealth();
  res.json({
    status: 'ok',
    model: 'hybrid-dixon-coles-v2',
    layers: ['poisson_baseline', 'feature_engineering', 'residual_correction'],
    phase: 2,
    activeMatches: getActiveMatches().length,
    capabilities: ['pre_match', 'in_play', 'batch', 'backtest', 'replay', 'monitoring'],
    modelHealth,
  });
});

// ─── HELPER: Fetch completed fixtures ─────────────────────────────
async function fetchCompletedFixtures() {
  try {
    const hasToken = process.env.FOOTBALLDATA_TOKEN?.length > 10;
    if (!hasToken) return [];

    const today = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const r = await fd.client.get('matches', {
      params: {
        competitions: fd.LEAGUE_CODES.join(','),
        dateFrom: past,
        dateTo: today,
        status: 'FINISHED',
      },
    });

    return (r.data.matches || []).map(fd.normalise);
  } catch (err) {
    console.error('[ENGINE] Failed to fetch fixtures:', err.message);
    return [];
  }
}

export default router;
