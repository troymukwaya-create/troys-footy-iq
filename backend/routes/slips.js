// ─── SAVED SLIPS (account feature) ──────────────────────────────────
// GET    /api/slips      → the signed-in user's saved slips
// POST   /api/slips      → save the current slip
// DELETE /api/slips/:id  → remove one
// All require a valid session.

import { Router } from 'express';
import { query, safeQuery } from '../db/index.js';
import { requireAuth } from '../services/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, label, legs, combined_odds AS "combinedOdds", ev_pct AS "evPct", created_at AS "createdAt"
         FROM saved_slips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ slips: r.rows });
  } catch (e) {
    console.error('[slips/list]', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const legs = Array.isArray(b.legs) ? b.legs : null;
    if (!legs || legs.length === 0) return res.status(400).json({ error: 'no_legs' });
    if (legs.length > 12) return res.status(400).json({ error: 'too_many_legs' });
    const r = await query(
      `INSERT INTO saved_slips (user_id, label, legs, combined_odds, ev_pct)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at AS "createdAt"`,
      [req.user.id, String(b.label || 'My slip').slice(0, 120), JSON.stringify(legs), b.combinedOdds ?? null, b.evPct ?? null]
    );
    res.json({ ok: true, id: r.rows[0].id, createdAt: r.rows[0].createdAt });
  } catch (e) {
    console.error('[slips/save]', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/:id', async (req, res) => {
  await safeQuery(`DELETE FROM saved_slips WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

export default router;
