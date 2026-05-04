// ─── BACKTEST ROUTES ────────────────────────────────────────────────
// GET /api/backtest          → Run historical evaluation
// GET /api/backtest/latest   → Get most recent backtest results

import { Router } from 'express';
import { runBacktest, getLatestBacktest } from '../services/backtestService.js';

const router = Router();

/**
 * GET /api/backtest
 * Run a backtest on historical matches.
 * Query params: leagues, from, to, limit
 */
router.get('/', async (req, res) => {
  try {
    const leagues = req.query.leagues ? req.query.leagues.split(',') : ['PL', 'PD', 'BL1', 'SA', 'FL1'];
    const seasonFrom = parseInt(req.query.from) || 2024;
    const seasonTo = parseInt(req.query.to) || 2025;
    const limit = parseInt(req.query.limit) || 500;

    console.log(`[BACKTEST] Request: leagues=${leagues}, seasons=${seasonFrom}-${seasonTo}`);
    const result = await runBacktest({ leagues, seasonFrom, seasonTo, limit });

    res.json({ error: false, data: result });
  } catch (err) {
    console.error('[BACKTEST] Error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * GET /api/backtest/latest
 * Returns the most recent backtest results without re-running.
 */
router.get('/latest', async (req, res) => {
  try {
    const latest = await getLatestBacktest();
    if (!latest) {
      return res.json({ error: false, data: null, message: 'No backtest results yet. Run GET /api/backtest first.' });
    }
    res.json({ error: false, data: latest });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
