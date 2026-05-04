// ─── RESULTS ROUTES ─────────────────────────────────────────────────
// POST /api/results/update   → Trigger result ingestion + feedback loop
// GET  /api/results/recent   → Get recently completed matches with predictions

import { Router } from 'express';
import { ingestResults, getRecentResults } from '../services/resultService.js';

const router = Router();

/**
 * POST /api/results/update
 * Triggers the result ingestion pipeline:
 *   1. Fetches finished matches from API
 *   2. Updates fixture scores
 *   3. Evaluates predictions
 *   4. Stores per-match metrics
 */
router.post('/update', async (req, res) => {
  try {
    const lookbackDays = parseInt(req.query.days) || 3;
    console.log('[RESULTS] Manual result ingestion triggered...');
    const result = await ingestResults(lookbackDays);
    res.json({ error: false, data: result });
  } catch (err) {
    console.error('[RESULTS] Update error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * GET /api/results/recent
 * Returns recently completed matches with prediction accuracy comparison.
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const results = await getRecentResults(limit);
    res.json({ error: false, data: results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
