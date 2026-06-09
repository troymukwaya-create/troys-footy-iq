// ─── CEO COMMAND CENTER — DRILL-DOWN DETAIL API ─────────────────────
// In-depth stats behind each overview tile. All token-protected.
//
//   GET /api/admin/visitors            → every visitor (who is on the site)
//   GET /api/admin/visitors/:id        → one visitor's full journey
//   GET /api/admin/traffic/detail      → timeseries + breakdowns + top pages
//   GET /api/admin/predictions/detail  → prediction accuracy + best/worst
//   GET /api/admin/spend/detail        → Claude spend over time + by endpoint
//   GET /api/admin/api-usage/detail    → external API usage over time

import { Router } from 'express';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { requireAuth } from '../services/adminAuth.js';

const router = Router();
router.use(requireAuth);

const REAL = `path NOT LIKE '/admin%'`;
const demo = (req) => (req.query.demo === '1' ? '' : ' AND synthetic = false');
const noData = (res) => res.json({ error: false, data: { available: false } });

// ─── GET /visitors ──────────────────────────────────────────────────
// One row per real visitor in the last 7 days: where they are, what device,
// how many pages, when first/last seen, whether they're live right now.
router.get('/visitors', async (req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const F = `${REAL}${demo(req)}`;
    const result = await safeQuery(`
      SELECT
        visitor_id,
        COUNT(*) FILTER (WHERE event_name = '$pageview')::int   AS pageviews,
        COUNT(*) FILTER (WHERE event_name <> '$pageview')::int   AS interactions,
        MAX(country)  AS country,
        MAX(device)   AS device,
        MAX(browser)  AS browser,
        MAX(os)       AS os,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen,
        (MAX(created_at) >= NOW() - INTERVAL '5 minutes') AS live,
        (MIN(created_at) >= NOW() - INTERVAL '24 hours')  AS is_new,
        (ARRAY_AGG(DISTINCT NULLIF(referrer,'')))[1] AS referrer
      FROM site_events
      WHERE ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY visitor_id
      ORDER BY last_seen DESC
      LIMIT 200
    `);
    const rows = result?.rows || [];
    res.json({ error: false, data: {
      available: true,
      visitors: rows,
      summary: {
        total: rows.length,
        live: rows.filter(r => r.live).length,
        newVisitors: rows.filter(r => r.is_new).length,
        returning: rows.filter(r => !r.is_new).length,
      },
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /visitors/:id ──────────────────────────────────────────────
// A single visitor's full event-by-event journey.
router.get('/visitors/:id', async (req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const events = await safeQuery(`
      SELECT event_name, path, referrer, country, device, browser, os, props, created_at
      FROM site_events WHERE visitor_id = $1
      ORDER BY created_at ASC LIMIT 500
    `, [req.params.id]);
    const rows = events?.rows || [];
    res.json({ error: false, data: {
      available: true,
      visitorId: req.params.id,
      events: rows,
      summary: {
        events: rows.length,
        pageviews: rows.filter(r => r.event_name === '$pageview').length,
        firstSeen: rows[0]?.created_at || null,
        lastSeen: rows[rows.length - 1]?.created_at || null,
        country: rows.find(r => r.country)?.country || null,
        device: rows[0]?.device || null,
        browser: rows[0]?.browser || null,
        os: rows[0]?.os || null,
      },
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /traffic/detail ────────────────────────────────────────────
router.get('/traffic/detail', async (req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const F = `${REAL}${demo(req)}`;

    const daily = await safeQuery(`
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*) FILTER (WHERE event_name = '$pageview')::int AS views,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events WHERE ${F} AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1
    `);
    const topPages = await safeQuery(`
      SELECT COALESCE(path,'/') AS path, COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events WHERE event_name = '$pageview' AND ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY views DESC LIMIT 12
    `);
    const browsers = await safeQuery(`
      SELECT COALESCE(browser,'Other') AS browser, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events WHERE ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY visitors DESC
    `);
    const os = await safeQuery(`
      SELECT COALESCE(os,'Other') AS os, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events WHERE ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY visitors DESC
    `);
    res.json({ error: false, data: {
      available: true,
      daily: daily?.rows || [],
      topPages: topPages?.rows || [],
      browsers: browsers?.rows || [],
      os: os?.rows || [],
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /predictions/detail ────────────────────────────────────────
router.get('/predictions/detail', async (_req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const recent = await safeQuery(`
      SELECT match_external_id, predicted_outcome, actual_outcome, prediction_correct,
             brier_score, prob_home, prob_draw, prob_away, created_at
      FROM model_performance ORDER BY created_at DESC LIMIT 40
    `);
    const byOutcome = await safeQuery(`
      SELECT predicted_outcome,
             COUNT(*)::int AS n,
             ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric,1) AS accuracy,
             ROUND(AVG(brier_score)::numeric,4) AS brier
      FROM model_performance GROUP BY predicted_outcome
    `);
    const best = await safeQuery(`
      SELECT match_external_id, predicted_outcome, actual_outcome, brier_score, created_at
      FROM model_performance WHERE prediction_correct = true ORDER BY brier_score ASC LIMIT 5
    `);
    const worst = await safeQuery(`
      SELECT match_external_id, predicted_outcome, actual_outcome, brier_score, created_at
      FROM model_performance WHERE prediction_correct = false ORDER BY brier_score DESC LIMIT 5
    `);
    const totals = await safeQuery(`
      SELECT (SELECT COUNT(*) FROM predictions)::int AS total,
             (SELECT COUNT(*) FROM predictions WHERE actual_result IS NULL)::int AS pending,
             (SELECT COUNT(*) FROM model_performance)::int AS evaluated,
             (SELECT ROUND(AVG(brier_score)::numeric,4) FROM model_performance) AS avg_brier
    `);
    res.json({ error: false, data: {
      available: true,
      recent: recent?.rows || [],
      byOutcome: byOutcome?.rows || [],
      best: best?.rows || [],
      worst: worst?.rows || [],
      totals: totals?.rows?.[0] || {},
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /spend/detail ──────────────────────────────────────────────
router.get('/spend/detail', async (_req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const daily = await safeQuery(`
      SELECT date_trunc('day', called_at) AS day,
             ROUND(SUM(cost_usd)::numeric,4) AS usd, COUNT(*)::int AS calls
      FROM api_cost_log WHERE called_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1
    `);
    const byEndpoint = await safeQuery(`
      SELECT COALESCE(endpoint,'other') AS endpoint,
             ROUND(SUM(cost_usd)::numeric,4) AS usd, COUNT(*)::int AS calls,
             SUM(input_tokens)::bigint AS input_tokens, SUM(output_tokens)::bigint AS output_tokens
      FROM api_cost_log GROUP BY 1 ORDER BY usd DESC
    `);
    const totals = await safeQuery(`
      SELECT ROUND(COALESCE(SUM(cost_usd),0)::numeric,4) AS total_usd,
             COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
             COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
             COALESCE(SUM(cached_tokens),0)::bigint AS cached_tokens,
             COUNT(*)::int AS calls
      FROM api_cost_log
    `);
    res.json({ error: false, data: {
      available: true,
      daily: daily?.rows || [],
      byEndpoint: byEndpoint?.rows || [],
      totals: totals?.rows?.[0] || {},
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /api-usage/detail ──────────────────────────────────────────
router.get('/api-usage/detail', async (_req, res) => {
  try {
    if (!isDbAvailable()) return noData(res);
    const daily = await safeQuery(`
      SELECT date_trunc('day', called_at) AS day, source,
             COUNT(*)::int AS calls,
             COUNT(*) FILTER (WHERE NOT success)::int AS failures,
             ROUND(AVG(response_time_ms)::numeric,0) AS avg_ms
      FROM api_usage_log WHERE called_at >= NOW() - INTERVAL '14 days'
      GROUP BY 1,2 ORDER BY 1
    `);
    const bySource = await safeQuery(`
      SELECT source, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE called_at >= CURRENT_DATE)::int AS today,
             COUNT(*) FILTER (WHERE NOT success)::int AS failures,
             ROUND(AVG(response_time_ms)::numeric,0) AS avg_ms,
             MAX(called_at) AS last_call
      FROM api_usage_log GROUP BY source ORDER BY total DESC
    `);
    res.json({ error: false, data: {
      available: true,
      daily: daily?.rows || [],
      bySource: bySource?.rows || [],
    }});
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /updates — platform changelog for the CEO dashboard ────────
router.get('/updates', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: [] });
    const r = await safeQuery(`
      SELECT id, slug, title, body, category, status, shipped_at, approved_at
      FROM platform_updates ORDER BY shipped_at DESC LIMIT 50`);
    res.json({ error: false, data: r?.rows || [] });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── POST /updates/:id/approve — CEO approves an update to feature it ─
router.post('/updates/:id/approve', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, ok: false });
    const approve = req.body?.approve !== false;
    await safeQuery(
      `UPDATE platform_updates SET status = $2, approved_at = $3 WHERE id = $1`,
      [parseInt(req.params.id), approve ? 'approved' : 'shipped', approve ? new Date() : null]
    );
    res.json({ error: false, ok: true });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── POST /updates — log a new (incoming) update ────────────────────
router.post('/updates', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, ok: false });
    const { title, body, category = 'engine', slug } = req.body || {};
    if (!title) return res.status(400).json({ error: true, message: 'title required' });
    await safeQuery(
      `INSERT INTO platform_updates (slug, title, body, category) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO NOTHING`,
      [slug || null, title, body || null, category]
    );
    res.json({ error: false, ok: true });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
