// ─── SLIP SHARE (public, no auth) ───────────────────────────────────
// POST /api/slip-share        → { code, url }   create a share code
// GET  /api/slip-share/:code  → { legs, ... }   resolve one (counts the hit)
//
// This is the parlay viral loop: the frontend turns a slip into
// oddyessa.com/?slip=CODE. Codes are write-once and anonymous; the same
// sanity rails as SuggestedSlips apply so a broken slip can never be
// minted into a shareable URL. The frontend has a serverless fallback
// (#slip=<base64> in the URL fragment), so this route failing only costs
// pretty links, never the feature.

import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

// Same believability rails as the frontend (SuggestedSlips.jsx).
const MAX_LEGS = 6;
const MAX_LEG_ODDS = 15;
const MAX_SLIP_ODDS = 250;

// No 0/O/1/I/L — codes get read aloud and retyped from screenshots.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// Light in-memory rate limit — slip creation is cheap but write-once,
// so cap creates per IP per hour. Resets on deploy; that's fine.
const creates = new Map();
const CREATE_LIMIT = 30;
function rateLimited(ip) {
  const now = Date.now();
  const e = creates.get(ip);
  if (!e || now > e.resetAt) { creates.set(ip, { count: 1, resetAt: now + 3600_000 }); return false; }
  e.count++;
  return e.count > CREATE_LIMIT;
}

function sanitizeLegs(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LEGS) return null;
  const legs = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') return null;
    const odds = Number(l.odds);
    if (!Number.isFinite(odds) || odds < 1.01 || odds > MAX_LEG_ODDS) return null;
    const matchLabel = String(l.matchLabel || '').slice(0, 80).trim();
    const outcome = String(l.outcome || '').slice(0, 60).trim();
    if (!matchLabel || !outcome) return null;
    const modelProbability = Number(l.modelProbability);
    legs.push({
      matchId: l.matchId != null ? String(l.matchId).slice(0, 40) : null,
      matchLabel,
      marketType: String(l.marketType || '1X2').slice(0, 30),
      outcome,
      odds: Number(odds.toFixed(2)),
      modelProbability: Number.isFinite(modelProbability) && modelProbability > 0 && modelProbability <= 1
        ? modelProbability : null,
    });
  }
  const combined = legs.reduce((p, l) => p * l.odds, 1);
  if (combined > MAX_SLIP_ODDS) return null;
  return legs;
}

router.post('/', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

    const legs = sanitizeLegs(req.body?.legs);
    if (!legs) return res.status(400).json({ error: 'invalid_slip' });

    const combinedOdds = Number(legs.reduce((p, l) => p * l.odds, 1).toFixed(2));
    const evPct = Number.isFinite(Number(req.body?.evPct)) ? Number(req.body.evPct) : null;
    const visitor = req.body?.visitor ? String(req.body.visitor).slice(0, 64) : null;

    // Retry on the (rare) code collision.
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode(6);
      try {
        await query(
          `INSERT INTO shared_slips (code, legs, combined_odds, ev_pct, visitor)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, JSON.stringify(legs), combinedOdds, evPct, visitor]
        );
        return res.json({ code });
      } catch (e) {
        if (e.code === '23505') continue; // unique_violation → new code
        throw e;
      }
    }
    res.status(500).json({ error: 'code_space_exhausted' });
  } catch (e) {
    console.error('[slip-share/create]', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().slice(0, 12);
    if (!/^[2-9A-Z]{4,12}$/.test(code)) return res.status(400).json({ error: 'bad_code' });
    const r = await query(
      `UPDATE shared_slips SET hits = hits + 1 WHERE code = $1
       RETURNING code, legs, combined_odds AS "combinedOdds", ev_pct AS "evPct", created_at AS "createdAt"`,
      [code]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('[slip-share/get]', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
